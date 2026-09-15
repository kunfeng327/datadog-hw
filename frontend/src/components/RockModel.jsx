import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * RockModel — 巨石强森 3D 占位模型。
 * 使用基础几何体组合（Sphere 头 + Capsule 躯干 + Cylinder 四肢）。
 *
 * 以后拿到真正的 .glb 模型时，只需要替换本组件内部实现
 * （例如换成 drei 的 useGLTF），外部 props / 接口保持不变。
 *
 * Props:
 *   - action: null | 'pose' | 'flex' | 'celebrate'（当前触发的动作）
 *   - actionKey: number（每次触发动作时递增，用于重置动画时间）
 *   - spin: 持续自转开关（由 UI Rotate 控制触发的一次性旋转）
 *   - spinKey: 触发一次性旋转的 key
 */
export default function RockModel({ action, actionKey, spinKey }) {
  const group = useRef()
  const leftArm = useRef()
  const rightArm = useRef()

  // 动画状态（useMemo 避免每次 render 重置）
  const anim = useMemo(
    () => ({
      actionStart: -1, // 动作开始时间（-1 表示空闲）
      spinStart: -1,
      baseY: 0,
    }),
    [],
  )

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const g = group.current
    if (!g) return

    // 记录动作/旋转的开始时间
    if (actionKey > 0 && anim.actionKey !== actionKey) {
      anim.actionKey = actionKey
      anim.actionStart = t
    }
    if (spinKey > 0 && anim.spinKey !== spinKey) {
      anim.spinKey = spinKey
      anim.spinStart = t
    }

    // 空闲呼吸：轻微上下浮动
    let y = Math.sin(t * 1.5) * 0.04
    let rotY = 0
    let armL = 0
    let armR = 0

    // 一次性自转（Rotate 按钮）
    if (anim.spinStart >= 0) {
      const p = Math.min((t - anim.spinStart) / 0.8, 1)
      rotY += p * Math.PI * 2
    }

    // 动作动画（持续 1.2s）
    if (anim.actionStart >= 0) {
      const p = Math.min((t - anim.actionStart) / 1.2, 1)
      const s = Math.sin(p * Math.PI) // 0 -> 1 -> 0 的包络

      if (action === 'pose') {
        // 正面定格 + 轻微上移
        y += s * 0.25
        armL += s * 0.5
        armR += s * 0.5
      } else if (action === 'flex') {
        // 双臂弯曲展示肌肉
        armL += s * 2.4
        armR += s * 2.4
        y += s * 0.1
      } else if (action === 'celebrate') {
        // 旋转 + 跳跃 + 双臂举高
        rotY += p * Math.PI * 2
        y += Math.abs(Math.sin(p * Math.PI * 3)) * 0.5
        armL += s * 2.8
        armR += s * 2.8
      }
    }

    g.position.y = y
    g.rotation.y = rotY + (anim.spinStart >= 0 ? 0 : Math.sin(t * 0.3) * 0.15)
    if (leftArm.current) leftArm.current.rotation.x = armL
    if (rightArm.current) rightArm.current.rotation.x = armR
  })

  const skin = '#c98850'
  const shirt = '#3d5a80'
  const pants = '#222831'

  return (
    <group ref={group}>
      {/* 头部 */}
      <mesh position={[0, 2.05, 0]} castShadow>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      {/* 脖子 */}
      <mesh position={[0, 1.72, 0]}>
        <cylinderGeometry args={[0.12, 0.14, 0.2, 16]} />
        <meshStandardMaterial color={skin} roughness={0.6} />
      </mesh>
      {/* 躯干（倒梯形：上宽下窄） */}
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.52, 0.34, 1.1, 16]} />
        <meshStandardMaterial color={shirt} roughness={0.7} />
      </mesh>
      {/* 腰带 */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.36, 0.36, 0.1, 16]} />
        <meshStandardMaterial color="#000" roughness={0.4} />
      </mesh>
      {/* 左臂（旋转轴在肩部） */}
      <group ref={leftArm} position={[-0.62, 1.55, 0]}>
        <mesh position={[0, -0.45, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.75, 8, 16]} />
          <meshStandardMaterial color={shirt} roughness={0.7} />
        </mesh>
      </group>
      {/* 右臂 */}
      <group ref={rightArm} position={[0.62, 1.55, 0]}>
        <mesh position={[0, -0.45, 0]} castShadow>
          <capsuleGeometry args={[0.13, 0.75, 8, 16]} />
          <meshStandardMaterial color={shirt} roughness={0.7} />
        </mesh>
      </group>
      {/* 左腿 */}
      <mesh position={[-0.22, -0.15, 0]} castShadow>
        <capsuleGeometry args={[0.15, 0.8, 8, 16]} />
        <meshStandardMaterial color={pants} roughness={0.8} />
      </mesh>
      {/* 右腿 */}
      <mesh position={[0.22, -0.15, 0]} castShadow>
        <capsuleGeometry args={[0.15, 0.8, 8, 16]} />
        <meshStandardMaterial color={pants} roughness={0.8} />
      </mesh>
    </group>
  )
}
