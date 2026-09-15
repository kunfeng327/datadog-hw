import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows } from '@react-three/drei'
import RockModel from './RockModel.jsx'

/**
 * Scene — 3D 展示区域。
 * OrbitControls 自带鼠标拖动旋转 + 滚轮缩放；
 * controlsRef 暴露给外部以便 Reset View / 按钮 Zoom。
 */
export default function Scene({ action, actionKey, spinKey, controlsRef }) {
  return (
    <Canvas shadows camera={{ position: [0, 1.2, 5.5], fov: 45 }}>
      <color attach="background" args={['#0b0e17']} />
      <fog attach="fog" args={['#0b0e17', 9, 22]} />

      {/* 灯光：主光（投影）+ 冷暖补光 + 展示台底部泛光 */}
      <ambientLight intensity={0.35} />
      <spotLight
        position={[4, 7, 4]}
        angle={0.5}
        penumbra={0.6}
        intensity={220}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-4, 3, -3]} color="#7b2cbf" intensity={25} />
      <pointLight position={[3, 1, -4]} color="#219ebc" intensity={18} />
      <pointLight position={[0, -0.8, 0]} color="#7b2cbf" intensity={8} distance={4} />

      {/* 占位人物模型（以后可整体替换为 .glb） */}
      <RockModel action={action} actionKey={actionKey} spinKey={spinKey} />

      {/* 圆形展示台 */}
      <mesh position={[0, -1.35, 0]} receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.18, 32]} />
        <meshStandardMaterial color="#161b2c" roughness={0.3} metalness={0.6} />
      </mesh>
      {/* 展示台发光边缘 */}
      <mesh position={[0, -1.27, 0]}>
        <torusGeometry args={[1.5, 0.03, 8, 48]} />
        <meshStandardMaterial color="#7b2cbf" emissive="#7b2cbf" emissiveIntensity={2} />
      </mesh>

      {/* 接触阴影 + 网格地面 */}
      <ContactShadows position={[0, -1.25, 0]} opacity={0.55} blur={2.5} />
      <gridHelper args={[24, 24, '#1e2a45', '#141b2e']} position={[0, -1.46, 0]} />

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.3, 0]}
        enablePan={false}
        minDistance={2.5}
        maxDistance={12}
      />
    </Canvas>
  )
}
