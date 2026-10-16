import { Component, memo, Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, useProgress } from '@react-three/drei'
import RockModel, { characterUrl } from './RockModel.jsx'
import gardenUrl from '../assets/garden-diorama.glb?url'
import { rum } from '../monitoring.js'

const Garden = memo(function Garden() {
  const { scene } = useGLTF(gardenUrl)
  return <primitive object={scene} dispose={null} />
})

function LoadingNotice() {
  const active = useProgress((state) => state.active)
  return active ? (
    <div className="scene-message" role="status">
      正在布置花园… / Loading the garden…
    </div>
  ) : null
}

class SceneBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    rum.error(error, { component: '3d-scene', kind: 'asset_or_renderer_error' })
  }

  retry = () => {
    useGLTF.clear(characterUrl)
    useGLTF.clear(gardenUrl)
    this.setState({ failed: false })
  }

  render() {
    return this.state.failed ? (
      <div className="scene-message" role="alert">
        <strong>模型暂时无法加载 / Scene unavailable</strong>
        <p>请重试加载，或刷新页面。 / Please retry or refresh the page.</p>
        <button className="btn" onClick={this.retry}>
          重新加载 / Retry
        </button>
      </div>
    ) : (
      this.props.children
    )
  }
}

export default memo(function Scene({
  action,
  actionKey,
  spinKey,
  controlsRef,
}) {
  return (
    <SceneBoundary>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [0, 1.2, 5.5], fov: 45 }}
        fallback={
          <div className="scene-message" role="status">
            设备暂不支持 3D 显示 / WebGL is unavailable on this device.
          </div>
        }
      >
        <color attach="background" args={['#e4ebdf']} />
        <ambientLight intensity={0.65} color="#fff5e3" />
        <hemisphereLight args={['#e8f0e5', '#9a8c70', 0.8]} />
        <directionalLight
          position={[-3, 7, 5]}
          intensity={2.4}
          color="#fff1d8"
        />
        <Suspense fallback={null}>
          <Garden />
          <RockModel action={action} actionKey={actionKey} spinKey={spinKey} />
        </Suspense>
        <OrbitControls
          ref={controlsRef}
          target={[0, 0.3, 0]}
          enablePan={false}
          minDistance={2.5}
          maxDistance={9}
          maxPolarAngle={Math.PI / 2 - 0.03}
        />
      </Canvas>
      <LoadingNotice />
    </SceneBoundary>
  )
})
