import { Canvas } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Environment } from '@react-three/drei'
import RockModel from './RockModel.jsx'

/**
 * Scene — 3D 展示区域。
 * OrbitControls 自带鼠标拖动旋转 + 滚轮缩放；
 * controlsRef 暴露给外部以便 Reset View / 按钮 Zoom。
 */
export default function Scene({ action, actionKey, spinKey, controlsRef }) {
  return (
    <Canvas shadows camera={{ position: [0, 1.5, 6], fov: 45 }}>
      <color attach="background" args={['#0b0e17']} />
      <fog attach="fog" args={['#0b0e17', 8, 20]} />

      {/* 灯光 */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[4, 6, 4]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-4, 3, -3]} color="#7b2cbf" intensity={20} />
      <pointLight position={[3, 2, -4]} color="#219ebc" intensity={15} />

      {/* 占位人物模型（以后可整体替换为 .glb） */}
      <RockModel action={action} actionKey={actionKey} spinKey={spinKey} />

      {/* 地面阴影 + 网格 */}
      <ContactShadows position={[0, -1.2, 0]} opacity={0.6} blur={2.5} />
      <gridHelper args={[20, 20, '#1e2a45', '#141b2e']} position={[0, -1.21, 0]} />

      <Environment preset="city" />

      <OrbitControls
        ref={controlsRef}
        target={[0, 0.6, 0]}
        enablePan={false}
        minDistance={2.5}
        maxDistance={12}
      />
    </Canvas>
  )
}
