import { useEffect, useRef, useState } from 'react'
import Scene from '../components/Scene.jsx'
import Controls from '../components/Controls.jsx'
import { api } from '../api/client.js'

const DEFAULT_CAMERA = { pos: [0, 1.2, 5.5], target: [0, 0.3, 0] }

export default function ExperiencePage({ refreshStats }) {
  const controlsRef = useRef(null)
  const [action, setActiveAction] = useState(null)
  const [actionKey, setActionKey] = useState(0)
  const [spinKey, setSpinKey] = useState(0)
  const [modelInfo, setModelInfo] = useState(null)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => {
    api
      .getModel()
      .then(({ data }) => setModelInfo(data))
      .catch(() => setModelInfo(null))

    return () => clearTimeout(toastTimer.current)
  }, [])

  const notifyError = (what, err) => {
    const msg = `${what}失败：${err?.isNetworkError ? '网络错误（后端不可达）' : err?.message || '未知错误'}`
    setToast(msg)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  const handleRotate = () => {
    setSpinKey((k) => k + 1)
    api
      .trackInteraction('rotate')
      .then(refreshStats)
      .catch((err) => notifyError('记录交互', err))
  }

  const zoomBy = (factor, type) => {
    const c = controlsRef.current
    if (!c) return
    const dir = c.object.position.clone().sub(c.target)
    dir.multiplyScalar(factor)
    c.object.position.copy(c.target.clone().add(dir))
    c.update()
    api
      .trackInteraction(type)
      .then(refreshStats)
      .catch((err) => notifyError('记录交互', err))
  }

  const handleReset = () => {
    const c = controlsRef.current
    if (c) {
      c.object.position.set(...DEFAULT_CAMERA.pos)
      c.target.set(...DEFAULT_CAMERA.target)
      c.update()
    }
    api
      .trackInteraction('reset')
      .then(refreshStats)
      .catch((err) => notifyError('记录交互', err))
  }

  const handleAction = async (name) => {
    setActiveAction(name)
    setActionKey((k) => k + 1)
    try {
      await api.triggerAction(name)
    } catch (err) {
      notifyError(`触发动作 ${name}`, err)
    }
    refreshStats()
  }

  return (
    <>
      {toast && (
        <div className="toast toast-err" role="alert">
          {toast}
        </div>
      )}
      <Controls
        onRotate={handleRotate}
        onZoomIn={() => zoomBy(0.8, 'zoom_in')}
        onZoomOut={() => zoomBy(1.25, 'zoom_out')}
        onReset={handleReset}
        onAction={handleAction}
        activeAction={action}
      />
      <section
        className="scene-card"
        id="experience"
        tabIndex={-1}
        aria-labelledby="scene-title"
      >
        <div className="scene-header">
          <div>
            <p className="eyebrow">THE PLAYGROUND</p>
            <h2 id="scene-title">A moment in the garden</h2>
          </div>
          <span className="scene-badge">3D EXPLORER</span>
        </div>
        <div
          className="viewport"
          aria-label="Interactive 3D character in a garden"
        >
          <div className="scene-canvas">
            <Scene
              action={action}
              actionKey={actionKey}
              spinKey={spinKey}
              controlsRef={controlsRef}
            />
          </div>
          <div className="viewport-hint">
            <span>Drag to rotate</span>
            <span>Scroll or pinch to zoom</span>
          </div>
        </div>
        <div className="scene-caption">
          <span className="scene-number">01</span>
          <div>
            <strong>The Rock</strong>
            <p className="model-info">
              {modelInfo
                ? `${modelInfo.name} · ${modelInfo.model} · ${modelInfo.status}`
                : 'Model information loading…'}
            </p>
          </div>
          <span className="scene-angle">
            360°<span>YOUR PERSPECTIVE</span>
          </span>
        </div>
      </section>
    </>
  )
}
