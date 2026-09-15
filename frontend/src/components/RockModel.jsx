import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * RockModel — 程序生成的强壮摔跤手占位模型（无外部资源）。
 *
 * 全部由 Three.js 基础几何体组合：
 *   光头 / 粗脖子 / 斜方肌 / 宽肩（三角肌）/ 发达胸肌 / 腹肌 /
 *   粗壮上臂（二头肌隆起）+ 前臂 / 黑色护腕 / 较窄的腰 / 黑色短裤 / 粗壮大腿小腿
 *
 * 以后拿到真正的 .glb 模型时，只需替换本组件内部实现，
 * 对外 props 接口保持不变。
 *
 * Props:
 *   - action: null | 'pose' | 'flex' | 'celebrate'
 *   - actionKey: number（每次触发动作时递增，用于重置动画）
 *   - spinKey: number（触发一次性 360° 自转）
 */
export default function RockModel({ action, actionKey, spinKey }) {
  const group = useRef()
  const armL = useRef() // 左臂整体（肩部旋转轴）
  const armR = useRef()
  const forearmL = useRef() // 左前臂（肘部旋转轴）
  const forearmR = useRef()
  const torso = useRef()

  const anim = useMemo(
    () => ({ actionKey: 0, spinKey: 0, actionStart: -1, spinStart: -1 }),
    [],
  )

  useFrame((state) => {
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

    // ---- 空闲：呼吸 + 轻微摇摆 ----
    let y = Math.sin(t * 1.5) * 0.03
    let rotY = Math.sin(t * 0.3) * 0.12
    let rotZ = 0
    let armLX = 0, armRZ = 0, armRX = 0, armLZ = 0
    let elbL = -0.15, elbR = -0.15 // 肘部微曲
    let breathe = 1

    // ---- 一次性 360° 自转（Rotate 按钮） ----
    if (anim.spinStart >= 0) {
      const p = Math.min((t - anim.spinStart) / 0.8, 1)
      rotY += p * Math.PI * 2
    }

    // ---- 动作动画（持续 1.4s，正弦包络 0→1→0） ----
    if (anim.actionStart >= 0) {
      const p = Math.min((t - anim.actionStart) / 1.4, 1)
      const s = Math.sin(p * Math.PI)

      if (action === 'pose') {
        // 摆姿势：身体侧倾摆动 + 一手叉腰一手展开
        rotZ += s * 0.12
        y += s * 0.08
        armLZ += s * 0.55 // 左臂向外展开
        armRZ -= s * 0.25 // 右臂向身体收
        elbR -= s * 1.2   // 右臂叉腰
        breathe += s * 0.04
      } else if (action === 'flex') {
        // 双臂弯举展示肌肉：手臂外张 + 肘部收紧 + 胸腔鼓起 + 轻微颤抖
        armLZ -= s * 0.65
        armRZ += s * 0.65
        armLX += s * 0.25
        armRX += s * 0.25
        elbL -= s * 2.1
        elbR -= s * 2.1
        breathe += s * 0.08 + Math.sin(t * 30) * 0.01 * s
        y += s * 0.05
      } else if (action === 'celebrate') {
        // 庆祝：双臂高举 + 跳跃 + 旋转
        armLX -= s * 2.7
        armRX -= s * 2.7
        elbL += s * 0.3
        elbR += s * 0.3
        rotY += p * Math.PI * 2
        y += Math.abs(Math.sin(p * Math.PI * 3)) * 0.45
      }
    }

    g.position.y = y
    g.rotation.y = rotY
    g.rotation.z = rotZ
    if (torso.current) torso.current.scale.set(1, 1, breathe)
    if (armL.current) {
      armL.current.rotation.set(armLX, 0, armLZ)
    }
    if (armR.current) {
      armR.current.rotation.set(armRX, 0, armRZ)
    }
    if (forearmL.current) forearmL.current.rotation.x = elbL
    if (forearmR.current) forearmR.current.rotation.x = elbR
  })

  const skin = '#c98d5a'
  const black = '#15151a'

  // 低面数参数：球体 16x12，胶囊 8x12
  const skinMat = <meshStandardMaterial color={skin} roughness={0.55} metalness={0.05} />
  const blackMat = <meshStandardMaterial color={black} roughness={0.4} metalness={0.2} />

  // 手臂组件（左右镜像复用）
  const Arm = ({ side, armRef, forearmRef }) => {
    const x = 0.68 * side
    return (
      <group ref={armRef} position={[x, 1.05, 0]}>
        {/* 三角肌（肩膀球） */}
        <mesh castShadow>
          <sphereGeometry args={[0.25, 16, 12]} />
          {skinMat}
        </mesh>
        {/* 上臂 */}
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
        {/* 二头肌隆起 */}
        <mesh position={[side * -0.02, -0.34, 0.1]} castShadow>
          <sphereGeometry args={[0.2, 16, 12]} />
          {skinMat}
        </mesh>
        {/* 肘部以下（前臂组） */}
        <group ref={forearmRef} position={[0, -0.72, 0]}>
          {/* 前臂（近肘粗、近腕细） */}
          <mesh position={[0, -0.28, 0]} castShadow>
            <capsuleGeometry args={[0.15, 0.38, 8, 12]} />
            {skinMat}
          </mesh>
          {/* 黑色护腕 */}
          <mesh position={[0, -0.58, 0]}>
            <cylinderGeometry args={[0.17, 0.17, 0.14, 12]} />
            {blackMat}
          </mesh>
          {/* 拳头 */}
          <mesh position={[0, -0.76, 0]} castShadow>
            <sphereGeometry args={[0.16, 16, 12]} />
            {skinMat}
          </mesh>
        </group>
      </group>
    )
  }

  return (
    <group ref={group}>
      {/* ============ 下肢 ============ */}
      {/* 小腿 */}
      {[-0.26, 0.26].map((x) => (
        <mesh key={'calf' + x} position={[x, -0.72, 0]} castShadow>
          <capsuleGeometry args={[0.17, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
      ))}
      {/* 膝盖 */}
      {[-0.26, 0.26].map((x) => (
        <mesh key={'knee' + x} position={[x, -0.42, 0.02]}>
          <sphereGeometry args={[0.19, 16, 12]} />
          {skinMat}
        </mesh>
      ))}
      {/* 大腿（粗壮） */}
      {[-0.27, 0.27].map((x) => (
        <mesh key={'thigh' + x} position={[x, -0.12, 0]} castShadow>
          <capsuleGeometry args={[0.25, 0.42, 8, 12]} />
          {skinMat}
        </mesh>
      ))}

      {/* ============ 黑色短裤 ============ */}
      {/* 髋部 */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.36, 0.4, 0.38, 16]} />
        {blackMat}
      </mesh>
      {/* 短裤腿 */}
      {[-0.27, 0.27].map((x) => (
        <mesh key={'short' + x} position={[x, -0.12, 0]} castShadow>
          <cylinderGeometry args={[0.28, 0.31, 0.3, 12]} />
          {blackMat}
        </mesh>
      ))}
      {/* 腰带 */}
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.37, 0.37, 0.09, 16]} />
        <meshStandardMaterial color="#8a6d2f" roughness={0.35} metalness={0.5} />
      </mesh>

      {/* ============ 躯干（V 字倒三角：宽肩窄腰） ============ */}
      <group ref={torso} position={[0, 0.3, 0]}>
        {/* 主躯干 */}
        <mesh position={[0, 0.38, 0]} castShadow>
          <cylinderGeometry args={[0.56, 0.34, 0.78, 16]} />
          <meshStandardMaterial color={skin} roughness={0.55} metalness={0.05} />
        </mesh>
        {/* 胸肌（两块向前凸起） */}
        {[-0.23, 0.23].map((x) => (
          <mesh key={'pec' + x} position={[x, 0.62, 0.2]} scale={[1.15, 0.85, 0.6]} castShadow>
            <sphereGeometry args={[0.27, 16, 12]} />
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

        {/* 斜方肌（脖子两侧隆起） */}
        {[-0.28, 0.28].map((x) => (
          <mesh key={'trap' + x} position={[x, 0.82, -0.02]} scale={[1, 0.8, 0.9]}>
            <sphereGeometry args={[0.22, 16, 12]} />
            {skinMat}
          </mesh>
        ))}

        {/* 粗脖子 */}
        <mesh position={[0, 0.95, 0]}>
          <cylinderGeometry args={[0.17, 0.21, 0.28, 12]} />
          {skinMat}
        </mesh>

        {/* ============ 光头 + 简单五官 ============ */}
        <mesh position={[0, 1.28, 0]} castShadow>
          <sphereGeometry args={[0.3, 20, 16]} />
          <meshStandardMaterial color={skin} roughness={0.35} />
        </mesh>
        {/* 浓眉 */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={'brow' + x} position={[x, 1.3, 0.26]} scale={[1.6, 0.4, 0.5]}>
            <sphereGeometry args={[0.06, 8, 6]} />
            {blackMat}
          </mesh>
        ))}
        {/* 眼睛 */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={'eye' + x} position={[x, 1.24, 0.28]}>
            <sphereGeometry args={[0.035, 8, 6]} />
            {blackMat}
          </mesh>
        ))}
      </group>

      {/* ============ 手臂 ============ */}
      <Arm side={-1} armRef={armL} forearmRef={forearmL} />
      <Arm side={1} armRef={armR} forearmRef={forearmR} />
    </group>
  )
}
