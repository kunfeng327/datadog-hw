import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * RockModel — 程序生成的普通人形占位模型（无外部资源）。
 *
 * 正常成年人比例：普通头肩宽、T恤 + 长裤 + 鞋，无夸张肌肉。
 *
 * 防穿模设计（沿用）：
 *   - 手臂在「额状面」内做两级 z 轴旋转（肩外展 A + 肘弯曲 B），
 *     前臂永远向外/向上，不扫过躯干或头部。
 *   - 肩部 x=±0.44、躯干上沿半径 0.34，手臂与身体留有间隙。
 *   - 双腿 x=±0.2（r0.13），两腿之间留间隙。
 *   - 「目标姿势 + 指数阻尼插值」，Idle→Action→Idle 全程平滑。
 *
 * 对外 props 接口不变，以后可整体替换为 .glb 模型。
 *
 * Props:
 *   - action: null | 'pose' | 'flex' | 'celebrate'
 *   - actionKey: number（每次触发动作时递增）
 *   - spinKey: number（触发一次性 360° 自转）
 */

// 肩部 X 位置（左右对称）
const SHOULDER_X = 0.44
// 动作持续时间（秒），结束后平滑回到 idle
const ACTION_DURATION = 2.2

/**
 * 姿势参数（支持左右手不同姿势）：
 *   AL/AR: 左/右肩外展角（0 = 垂直下垂，π = 举过头顶）
 *   BL/BR: 左/右肘弯曲角
 *   leanZ: 身体侧倾；lift: 身体抬升
 */
const POSES = {
  idle: { AL: 0.1, BL: 0.2, AR: 0.1, BR: 0.2, leanZ: 0, lift: 0 },
  // 单手侧伸：左臂抬起伸出，右臂自然下垂，身体轻微反向倾斜
  pose: { AL: 1.35, BL: 0.15, AR: 0.12, BR: 0.25, leanZ: -0.06, lift: 0.02 },
  // 双臂向两侧展开（不健美，只展开）
  flex: { AL: 1.5, BL: 0.1, AR: 1.5, BR: 0.1, leanZ: 0, lift: 0.03 },
  // 双臂高举过头顶，左右分开
  celebrate: { AL: 2.75, BL: 0.2, AR: 2.75, BR: 0.2, leanZ: 0, lift: 0 },
}

export default function RockModel({ action, actionKey, spinKey }) {
  const group = useRef()
  const armL = useRef() // 左臂整体（肩部旋转轴）
  const armR = useRef()
  const forearmL = useRef() // 左前臂（肘部旋转轴）
  const forearmR = useRef()

  const anim = useMemo(
    () => ({
      actionKey: 0,
      spinKey: 0,
      actionStart: -1,
      spinStart: -1,
      // 当前插值状态（从 idle 开始，保证首帧无跳变）
      cur: { ...POSES.idle },
    }),
    [],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const g = group.current
    if (!g) return

    if (actionKey > 0 && anim.actionKey !== actionKey) {
      anim.actionKey = actionKey
      anim.actionStart = t
    }
    if (spinKey > 0 && anim.spinKey !== spinKey) {
      anim.spinKey = spinKey
      anim.spinStart = t
    }

    // 动作超时后目标姿势回到 idle
    const active =
      anim.actionStart >= 0 && t - anim.actionStart < ACTION_DURATION ? action : null
    const p = anim.actionStart >= 0 ? Math.min((t - anim.actionStart) / ACTION_DURATION, 1) : 0
    const env = active ? Math.sin(p * Math.PI) : 0 // 0→1→0 包络，用于瞬时叠加效果

    // ---- 目标姿势 + 指数阻尼插值（平滑进出动作） ----
    const target = POSES[active || 'idle']
    const k = 1 - Math.exp(-7 * delta) // 阻尼系数
    const c = anim.cur
    for (const key of ['AL', 'BL', 'AR', 'BR', 'leanZ', 'lift']) {
      c[key] += (target[key] - c[key]) * k
    }

    // ---- 基础身体运动：轻微上下浮动 + 缓慢转身 ----
    let y = Math.sin(t * 1.5) * 0.03 + c.lift
    let rotY = Math.sin(t * 0.3) * 0.12
    let rotZ = c.leanZ

    // ---- 一次性 360° 自转（Rotate 按钮） ----
    if (anim.spinStart >= 0) {
      const sp = Math.min((t - anim.spinStart) / 0.9, 1)
      rotY += sp * Math.PI * 2
    }

    // ---- 动作专属瞬时效果（叠加在插值姿势之上） ----
    if (active === 'celebrate') {
      y += Math.abs(Math.sin((t - anim.actionStart) * Math.PI * 2.5)) * 0.3 * env // 轻微跳跃
      rotY += p * Math.PI * 2 // 旋转一圈，结束时角度回到 2π≡0
    } else if (active === 'pose') {
      rotZ += Math.sin(t * 3) * 0.02 * env // 轻微摆动
    }

    g.position.y = y
    g.rotation.y = rotY
    g.rotation.z = rotZ

    // ---- 手臂：额状面两级 z 轴旋转（左负右正，向外展开） ----
    if (armL.current) armL.current.rotation.set(0.05, 0, -c.AL)
    if (armR.current) armR.current.rotation.set(0.05, 0, c.AR)
    if (forearmL.current) forearmL.current.rotation.z = -c.BL
    if (forearmR.current) forearmR.current.rotation.z = c.BR
  })

  const skin = '#d9a06b'
  const shirt = '#6b7fbf'
  const pants = '#3a3f4a'
  const shoe = '#d8d8d8'
  const hair = '#2b2118'

  // 低面数参数：球体 12x8，胶囊 6x10
  const skinMat = <meshStandardMaterial color={skin} roughness={0.7} />
  const shirtMat = <meshStandardMaterial color={shirt} roughness={0.8} />
  const pantsMat = <meshStandardMaterial color={pants} roughness={0.8} />
  const shoeMat = <meshStandardMaterial color={shoe} roughness={0.5} />

  // 手臂组件（左右镜像复用）
  const Arm = ({ side, armRef, forearmRef }) => (
    <group ref={armRef} position={[SHOULDER_X * side, 1.02, 0]}>
      {/* 肩 */}
      <mesh castShadow>
        <sphereGeometry args={[0.13, 12, 8]} />
        {shirtMat}
      </mesh>
      {/* 上臂（短袖 T 恤袖口） */}
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.14, 0.13, 0.16, 10]} />
        {shirtMat}
      </mesh>
      {/* 上臂皮肤 */}
      <mesh position={[0, -0.32, 0]} castShadow>
        <capsuleGeometry args={[0.08, 0.32, 6, 10]} />
        {skinMat}
      </mesh>
      {/* 前臂组（肘部旋转轴） */}
      <group ref={forearmRef} position={[0, -0.52, 0]}>
        <mesh position={[0, -0.2, 0]} castShadow>
          <capsuleGeometry args={[0.07, 0.3, 6, 10]} />
          {skinMat}
        </mesh>
        {/* 手 */}
        <mesh position={[0, -0.44, 0]} castShadow>
          <sphereGeometry args={[0.08, 12, 8]} />
          {skinMat}
        </mesh>
      </group>
    </group>
  )

  return (
    <group ref={group}>
      {/* ============ 下肢（长裤 + 鞋） ============ */}
      {/* 鞋 */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={'shoe' + x} position={[x, -1.08, 0.05]} castShadow>
          <boxGeometry args={[0.16, 0.1, 0.28]} />
          {shoeMat}
        </mesh>
      ))}
      {/* 小腿（裤管） */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={'calf' + x} position={[x, -0.68, 0]} castShadow>
          <capsuleGeometry args={[0.1, 0.44, 6, 10]} />
          {pantsMat}
        </mesh>
      ))}
      {/* 膝盖 */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={'knee' + x} position={[x, -0.38, 0.01]}>
          <sphereGeometry args={[0.11, 12, 8]} />
          {pantsMat}
        </mesh>
      ))}
      {/* 大腿（裤管） */}
      {[-0.2, 0.2].map((x) => (
        <mesh key={'thigh' + x} position={[x, -0.1, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.36, 6, 10]} />
          {pantsMat}
        </mesh>
      ))}
      {/* 髋部 */}
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.27, 0.32, 12]} />
        {pantsMat}
      </mesh>

      {/* ============ 躯干（T 恤，正常肩宽） ============ */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.26, 0.72, 12]} />
        {shirtMat}
      </mesh>
      {/* T 恤下摆 */}
      <mesh position={[0, 0.28, 0]}>
        <cylinderGeometry args={[0.26, 0.27, 0.08, 12]} />
        {shirtMat}
      </mesh>
      {/* T 恤领口 */}
      <mesh position={[0, 0.99, 0]}>
        <cylinderGeometry args={[0.14, 0.17, 0.08, 12]} />
        {shirtMat}
      </mesh>

      {/* ============ 头部 ============ */}
      {/* 脖子 */}
      <mesh position={[0, 1.06, 0]}>
        <cylinderGeometry args={[0.08, 0.09, 0.14, 10]} />
        {skinMat}
      </mesh>
      {/* 头 */}
      <mesh position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 12]} />
        <meshStandardMaterial color={skin} roughness={0.5} />
      </mesh>
      {/* 头发（上半覆盖） */}
      <mesh position={[0, 1.34, -0.01]} scale={[1.04, 0.82, 1.04]}>
        <sphereGeometry args={[0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
      {/* 眼睛 */}
      {[-0.08, 0.08].map((x) => (
        <mesh key={'eye' + x} position={[x, 1.31, 0.2]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color="#15151a" />
        </mesh>
      ))}

      {/* ============ 手臂（x=±0.44，与躯干 0.34 留间隙） ============ */}
      <Arm side={-1} armRef={armL} forearmRef={forearmL} />
      <Arm side={1} armRef={armR} forearmRef={forearmR} />
    </group>
  )
}
