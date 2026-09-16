import { useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Sky } from '@react-three/drei'
import RockModel from './RockModel.jsx'

/* ---------------- 伪随机（固定种子，场景每次刷新一致） ---------------- */
function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ---------------- 树：圆柱树干 + 多球体树冠 ---------------- */
function Tree({ position, scale = 1, seed = 1 }) {
  const rand = useMemo(() => mulberry32(seed), [seed])
  const foliage = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => ({
        pos: [
          (rand() - 0.5) * 1.1,
          2.2 + rand() * 0.9 + i * 0.18,
          (rand() - 0.5) * 1.1,
        ],
        r: 0.75 + rand() * 0.45,
        shade: 0.85 + rand() * 0.3,
      })),
    [rand],
  )
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.22, 2.2, 8]} />
        <meshStandardMaterial color="#6b4a2f" roughness={1} />
      </mesh>
      {foliage.map((f, i) => (
        <mesh key={i} position={f.pos} castShadow>
          <sphereGeometry args={[f.r, 16, 16]} />
          <meshStandardMaterial
            color={`rgb(${Math.round(46 * f.shade)},${Math.round(125 * f.shade)},${Math.round(50 * f.shade)})`}
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  )
}

/* ---------------- 花：细茎 + 花心 + 花瓣 ---------------- */
function Flower({ position, color, seed = 1 }) {
  const ref = useRef()
  const phase = useMemo(() => mulberry32(seed)() * Math.PI * 2, [seed])
  // 微风摆动
  useFrame(({ clock }) => {
    if (ref.current)
      ref.current.rotation.z = Math.sin(clock.elapsedTime * 1.6 + phase) * 0.08
  })
  return (
    <group position={position} ref={ref}>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.008, 0.012, 0.36, 5]} />
        <meshStandardMaterial color="#3e7d32" roughness={1} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <sphereGeometry args={[0.045, 10, 10]} />
        <meshStandardMaterial color="#ffd54f" roughness={0.8} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i / 5) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.07, 0.38, Math.sin(a) * 0.07]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
          </mesh>
        )
      })}
    </group>
  )
}

/* ---------------- 蝴蝶：两片翅膀扇动 + 绕圈飞 ---------------- */
function Butterfly({ center, radius, speed, phase, color }) {
  const g = useRef()
  const wL = useRef()
  const wR = useRef()
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * speed + phase
    if (g.current) {
      g.current.position.set(
        center[0] + Math.cos(t) * radius,
        center[1] + Math.sin(t * 2.3) * 0.35,
        center[2] + Math.sin(t) * radius,
      )
      g.current.rotation.y = -t + Math.PI / 2
    }
    const flap = Math.sin(clock.elapsedTime * 14 + phase) * 0.9
    if (wL.current) wL.current.rotation.y = flap
    if (wR.current) wR.current.rotation.y = -flap
  })
  const wing = (ref, dir) => (
    <group ref={ref} position={[0.01 * dir, 0, 0]}>
      <mesh position={[0.06 * dir, 0, 0]} castShadow>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
    </group>
  )
  return (
    <group ref={g} scale={0.8}>
      <mesh>
        <capsuleGeometry args={[0.012, 0.07, 4, 8]} />
        <meshStandardMaterial color="#3e2723" />
      </mesh>
      {wing(wL, 1)}
      {wing(wR, -1)}
    </group>
  )
}

/* ---------------- 灌木篱笆围边 ---------------- */
function Hedges() {
  const bushes = useMemo(() => {
    const rand = mulberry32(42)
    return Array.from({ length: 18 }, (_, i) => {
      const a = (i / 18) * Math.PI * 2 + rand() * 0.15
      const r = 8.5 + rand() * 0.8
      return {
        pos: [Math.cos(a) * r, -1.2, Math.sin(a) * r],
        s: 0.8 + rand() * 0.5,
        seed: i + 100,
      }
    })
  }, [])
  return bushes.map((b, i) => (
    <group key={i} position={b.pos} scale={b.s}>
      <mesh castShadow>
        <sphereGeometry args={[0.7, 12, 12]} />
        <meshStandardMaterial color="#2e7d32" roughness={1} />
      </mesh>
      <mesh position={[0.2, 0.25, 0.15]} castShadow>
        <sphereGeometry args={[0.45, 10, 10]} />
        <meshStandardMaterial color="#388e3c" roughness={1} />
      </mesh>
    </group>
  ))
}

/* ---------------- 花园场景 ---------------- */
export default function Scene({ action, actionKey, spinKey, controlsRef }) {
  // 随机生成树 / 花的位置（固定种子）
  const { trees, flowers } = useMemo(() => {
    const rand = mulberry32(7)
    const trees = Array.from({ length: 7 }, (_, i) => {
      const a = rand() * Math.PI * 2
      const r = 5.5 + rand() * 2.5
      return { pos: [Math.cos(a) * r, -1.46, Math.sin(a) * r], s: 0.9 + rand() * 0.5, seed: i }
    })
    const colors = ['#e91e63', '#ab47bc', '#ff7043', '#f06292', '#ba68c8']
    const flowers = Array.from({ length: 26 }, (_, i) => {
      const a = rand() * Math.PI * 2
      const r = 2.2 + rand() * 5.5
      return {
        pos: [Math.cos(a) * r, -1.46, Math.sin(a) * r],
        color: colors[i % colors.length],
        seed: i * 13,
      }
    })
    return { trees, flowers }
  }, [])

  return (
    <Canvas shadows camera={{ position: [0, 1.2, 5.5], fov: 45 }}>
      {/* 天空 + 远处薄雾 */}
      <Sky sunPosition={[8, 6, -4]} turbidity={6} rayleigh={1.2} />
      <fog attach="fog" args={['#cfe8f7', 18, 40]} />

      {/* 阳光主光（投影）+ 天光补光 */}
      <ambientLight intensity={0.65} color="#bfd9ff" />
      <directionalLight
        position={[8, 10, -4]}
        intensity={2.4}
        color="#fff3d6"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <hemisphereLight args={['#aee2ff', '#7cb342', 0.5]} />

      {/* 人物模型 */}
      <RockModel action={action} actionKey={actionKey} spinKey={spinKey} />

      {/* 石头底座（放在草地上） */}
      <mesh position={[0, -1.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.18, 32]} />
        <meshStandardMaterial color="#cfc9b8" roughness={0.9} />
      </mesh>
      <mesh position={[0, -1.27, 0]} receiveShadow>
        <torusGeometry args={[1.5, 0.035, 8, 48]} />
        <meshStandardMaterial color="#e8e2cf" roughness={0.8} />
      </mesh>

      {/* 草地 */}
      <mesh position={[0, -1.47, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[24, 48]} />
        <meshStandardMaterial color="#69a95b" roughness={1} />
      </mesh>

      {/* 树 / 花 / 灌木 / 蝴蝶 */}
      {trees.map((t, i) => (
        <Tree key={i} position={t.pos} scale={t.s} seed={t.seed} />
      ))}
      {flowers.map((f, i) => (
        <Flower key={i} position={f.pos} color={f.color} seed={f.seed} />
      ))}
      <Hedges />
      <Butterfly center={[1.5, 0.2, 0.5]} radius={1.6} speed={0.7} phase={0} color="#ff8a65" />
      <Butterfly center={[-1.8, -0.1, -0.8]} radius={2.1} speed={0.55} phase={2.1} color="#81d4fa" />
      <Butterfly center={[0.5, 0.5, -2]} radius={1.3} speed={0.85} phase={4.2} color="#f48fb1" />

      {/* 接触阴影（叠加在草地上） */}
      <ContactShadows position={[0, -1.25, 0]} opacity={0.4} blur={2.5} />

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.3, 0]}
        enablePan={false}
        minDistance={2.5}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2 - 0.03}
      />
    </Canvas>
  )
}
