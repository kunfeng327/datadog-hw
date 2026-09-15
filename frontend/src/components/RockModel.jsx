import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * RockModel — 程序生成的强壮摔跤手占位模型（无外部资源）。
 *
 * 防穿模设计：
 *   - 手臂在「额状面」内做两级 z 轴旋转（肩外展 A + 肘弯曲 B），
 *     与健美「双二头」真实关节结构一致，前臂永远向外/向上，不扫过胸前。
 *   - 肩部 x=±0.8、躯干上沿半径 0.54，静止时手臂与胸肌留有间隙。
 *   - 大腿 x=±0.3（r0.23）、小腿 x=±0.32，两腿之间留间隙。
 *   - 动画使用「目标姿势 + 指数阻尼插值」，Idle→Action→Idle 全程平滑。
 *
 * 对外 props 接口不变，以后可整体替换为 .glb 模型。
 *
 * Props:
 *   - action: null | 'pose' | 'flex' | 'celebrate'
 *   - actionKey: number（每次触发动作时递增）
 *   - spinKey: number（触发一次性 360° 自转）
 */

// 肩部 X 位置（左右对称）
const SHOULDER_X = 0.8
// 动作持续时间（秒），结束后平滑回到 idle
const ACTION_DURATION = 2.2

/**
 * 姿势参数（左右镜像对称）：
 *   A: 肩外展角（0 = 手臂垂直下垂，π = 举过头顶）
 *   B: 肘弯曲角（在额状面内继续向外/向上折）
 *   leanZ: 身体侧倾；lift: 身体抬升；breathe: 胸腔鼓起
 *   armOut: 肩关节额外外移（增加与躯干的间隙）
 */
const POSES = {
  idle: { A: 0.12, B: 0.3, leanZ: 0, lift: 0, breathe: 1, armOut: 0 },
  // 健美站姿：双臂自然外开，前臂水平展开
  pose: { A: 0.55, B: 0.95, leanZ: 0.1, lift: 0.05, breathe: 1.02, armOut: 0.04 },
  // 经典双二头：上臂接近水平外展，前臂向上弯举
  flex: { A: 1.2, B: 1.85, leanZ: 0, lift: 0.05, breathe: 1.07, armOut: 0.08 },
  // 双臂高举过头顶，肘部接近伸直
  celebrate: { A: 2.7, B: 0.35, leanZ: 0, lift: 0, breathe: 1, armOut: 0.02 },
}

export default function RockModel({ action, actionKey, spinKey }) {
  const group = useRef()
  const armL = useRef() // 左臂整体（肩部旋转轴）
  const armR = useRef()
  const forearmL = useRef() // 左前臂（肘部旋转轴）
  const forearmR = useRef()
  const torso = useRef()

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
    for (const key of ['A', 'B', 'leanZ', 'lift', 'breathe', 'armOut']) {
      c[key] += (target[key] - c[key]) * k
    }

    // ---- 基础身体运动：呼吸浮动 + 缓慢摆头 ----
    let y = Math.sin(t * 1.5) * 0.03 + c.lift
    let rotY = Math.sin(t * 0.3) * 0.12
    let rotZ = -c.leanZ
    let breathe = c.breathe

    // ---- 一次性 360° 自转（Rotate 按钮） ----
    if (anim.spinStart >= 0) {
      const sp = Math.min((t - anim.spinStart) / 0.9, 1)
      rotY += sp * Math.PI * 2
    }

    // ---- 动作专属瞬时效果（叠加在插值姿势之上） ----
    if (active === 'celebrate') {
      y += Math.abs(Math.sin((t - anim.actionStart) * Math.PI * 2.5)) * 0.35 * env // 跳跃
      rotY += p * Math.PI * 2 // 旋转一圈，结束时角度回到 2π≡0
    } else if (active === 'flex') {
      breathe += Math.sin(t * 25) * 0.008 * env // 肌肉颤抖
    } else if (active === 'pose') {
      rotZ += Math.sin(t * 3) * 0.03 * env // 轻微摆动
    }

    g.position.y = y
    g.rotation.y = rotY
    g.rotation.z = rotZ
    if (torso.current) torso.current.scale.set(1, 1, breathe)

    // ---- 手臂：额状面两级 z 轴旋转（左负右正，向外展开） ----
    if (armL.current) {
      armL.current.rotation.set(0.08, 0, -c.A)
      armL.current.position.x = -(SHOULDER_X + c.armOut)
    }
    if (armR.current) {
      armR.current.rotation.set(0.08, 0, c.A)
      armR.current.position.x = SHOULDER_X + c.armOut
    }
    if (forearmL.current) forearmL.current.rotation.z = -c.B
    if (forearmR.current) forearmR.current.rotation.z = c.B
  })

  const skin = '#c98d5a'
  const black = '#15151a'

  // 低面数参数：球体 16x12，胶囊 8x12
  const skinMat = <meshStandardMaterial color={skin} roughness={0.55} metalness={0.05} />
  const blackMat = <meshStandardMaterial color={black} roughness={0.4} metalness={0.2} />

  // 手臂组件（左右镜像复用）
  const Arm = ({ side, armRef, forearmRef }) => {
    const x = SHOULDER_X * side
    return (
      <group ref={armRef} position={[x, 1.05, 0]}>
        {/* 三角肌（肩膀球） */}
        <mesh castShadow>
          <sphereGeometry args={[0.25, 16, 12]} />
          {skinMat}
        </mesh>
        {/* 上臂 */}
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.16, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
        {/* 二头肌隆起（偏向外侧，避开胸肌） */}
        <mesh position={[side * -0.03, -0.34, 0.06]} castShadow>
          <sphereGeometry args={[0.19, 16, 12]} />
          {skinMat}
        </mesh>
        {/* 肘部以下（前臂组，额状面 z 轴弯曲） */}
        <group ref={forearmRef} position={[0, -0.72, 0]}>
          {/* 前臂 */}
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.14, 0.38, 8, 12]} />
            {skinMat}
          </mesh>
          {/* 黑色护腕 */}
          <mesh position={[0, -0.58, 0]}>
            <cylinderGeometry args={[0.16, 0.16, 0.14, 12]} />
            {blackMat}
          </mesh>
          {/* 拳头 */}
          <mesh position={[0, -0.74, 0]} castShadow>
            <sphereGeometry args={[0.15, 16, 12]} />
            {skinMat}
          </mesh>
        </group>
      </group>
    )
  }

  return (
    <group ref={group}>
      {/* ============ 下肢（左右留间隙，不互相穿透） ============ */}
      {/* 黑色短靴 */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={'boot' + x} position={[x, -1.08, 0.06]} castShadow>
          <boxGeometry args={[0.2, 0.14, 0.32]} />
          {blackMat}
        </mesh>
      ))}
      {/* 小腿 */}
      {[-0.32, 0.32].map((x) => (
        <mesh key={'calf' + x} position={[x, -0.72, -0.01]} castShadow>
          <capsuleGeometry args={[0.16, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
      ))}
      {/* 膝盖 */}
      {[-0.3, 0.3].map((x) => (
        <mesh key={'knee' + x} position={[x, -0.42, 0.02]}>
          <sphereGeometry args={[0.18, 16, 12]} />
          {skinMat}
        </mesh>
      ))}
      {/* 大腿（粗壮） */}
      {[-0.3, 0.3].map((x) => (
        <mesh key={'thigh' + x} position={[x, -0.12, 0]} castShadow>
          <capsuleGeometry args={[0.23, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
      ))}

      {/* ============ 黑色短裤 ============ */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.39, 0.38, 16]} />
        {blackMat}
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <mesh key={'short' + x} position={[x, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.26, 0.28, 0.3, 12]} />
          {blackMat}
        </mesh>
      ))}
      {/* 腰带 */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.09, 16]} />
        <meshStandardMaterial color="#8a6d2f" roughness={0.35} metalness={0.5} />
      </mesh>

      {/* ============ 躯干（V 字倒三角，上沿半径 0.54，与手臂留间隙） ============ */}
      <group ref={torso} position={[0, 0.3, 0]}>
        {/* 主躯干 */}
        <mesh position={[0, 0.38, 0]} castShadow>
          <cylinderGeometry args={[0.54, 0.34, 0.78, 16]} />
          <meshStandardMaterial color={skin} roughness={0.55} metalness={0.05} />
        </mesh>
        {/* 胸肌（两块向前凸起） */}
        {[-0.22, 0.22].map((x) => (
          <mesh key={'pec' + x} position={[x, 0.62, 0.18]} scale={[1.1, 0.85, 0.55]} castShadow>
            <sphereGeometry args={[0.26, 16, 12]} />
            {skinMat}
          </mesh>
        ))}
        {/* 腹肌块 2x3 */}
        {[-0.12, 0.12].map((x) =>
          [0.32, 0.18, 0.04].map((yy) => (
            <mesh key={`abs${x}${yy}`} position={[x, yy, 0.28]} scale={[1, 0.8, 0.45]}>
              <sphereGeometry args={[0.08, 12, 8]} />
              {skinMat}
            </mesh>
          )),
        )}
        {/* 斜方肌 */}
        {[-0.27, 0.27].map((x) => (
          <mesh key={'trap' + x} position={[x, 0.82, -0.02]} scale={[1, 0.8, 0.9]}>
            <sphereGeometry args={[0.21, 16, 12]} />
            {skinMat}
          </mesh>
        ))}
        {/* 粗脖子（顶端收窄，给头部留出衔接空间） */}
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[0.16, 0.2, 0.26, 12]} />
          {skinMat}
        </mesh>
        {/* 光头 + 简单五官 */}
        <mesh position={[0, 1.28, 0]} castShadow>
          <sphereGeometry args={[0.29, 20, 16]} />
          <meshStandardMaterial color={skin} roughness={0.35} />
        </mesh>
        {[-0.1, 0.1].map((x) => (
          <mesh key={'brow' + x} position={[x, 1.31, 0.25]} scale={[1.6, 0.4, 0.5]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            {blackMat}
          </mesh>
        ))}
        {[-0.1, 0.1].map((x) => (
          <mesh key={'eye' + x} position={[x, 1.25, 0.27]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            {blackMat}
          </mesh>
        ))}
      </group>

      {/* ============ 手臂（x=±0.8，与躯干上沿 0.54 留出间隙） ============ */}
      <Arm side={-1} armRef={armL} forearmRef={forearmL} />
      <Arm side={1} armRef={armR} forearmRef={forearmR} />
    </group>
  )
}
