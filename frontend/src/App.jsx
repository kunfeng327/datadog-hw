import { useCallback, useEffect, useRef, useState } from 'react'
import Scene from './components/Scene.jsx'
import Controls from './components/Controls.jsx'
import Stats from './components/Stats.jsx'
import { api } from './api/client.js'

const DEFAULT_CAMERA = { pos: [0, 1.2, 5.5], target: [0, 0.3, 0] }

export default function App() {
  const controlsRef = useRef(null)

  // 3D 状态
  const [action, setActiveAction] = useState(null)
  const [actionKey, setActionKey] = useState(0)
  const [spinKey, setSpinKey] = useState(0)

  // API 状态
  const [online, setOnline] = useState(false)
  const [latency, setLatency] = useState(null)
  const [stats, setStats] = useState({})
  const [modelInfo, setModelInfo] = useState(null)

  const refreshStats = useCallback(async () => {
    try {
      const { data } = await api.getStats()
      setStats(data)
    } catch {
      /* 轮询失败静默，由健康检查负责 Online/Offline */
    }
  }, [])

  // 启动时拉取模型信息；轮询健康 + 统计。
  // 治理策略：页面隐藏时暂停；失败后退避（3s 起、翻倍至 30s 封顶）；
  // 上一次请求未返回时跳过本轮，避免请求堆积。
  useEffect(() => {
    api
      .getModel()
      .then(({ data }) => setModelInfo(data))
      .catch(() => setModelInfo(null))

    let timer = null
    let inFlight = false
    let interval = 3000
    const MAX_INTERVAL = 30000

    const tick = async () => {
      if (document.hidden || inFlight) return
      inFlight = true
      try {
        const { latency: ms } = await api.health()
        setOnline(true)
        setLatency(ms)
        interval = 3000 // 恢复后重置为正常频率
        refreshStats()
      } catch {
        setOnline(false)
        setLatency(null)
        interval = Math.min(interval * 2, MAX_INTERVAL) // 失败退避
      } finally {
        inFlight = false
        timer = setTimeout(tick, interval)
      }
    }
    timer = setTimeout(tick, interval)

    const onVisibility = () => {
      if (!document.hidden && timer) {
        // 回到页面立即恢复轮询
        clearTimeout(timer)
        interval = 3000
        timer = setTimeout(tick, interval)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshStats])

  // ---- 交互（左侧 Model Controls） ----
  const handleRotate = () => {
    setSpinKey((k) => k + 1)
    api.trackInteraction('rotate').then(refreshStats).catch(() => {})
  }

  const zoomBy = (factor, type) => {
    const c = controlsRef.current
    if (!c) return
    const dir = c.object.position.clone().sub(c.target)
    dir.multiplyScalar(factor)
    c.object.position.copy(c.target.clone().add(dir))
    c.update()
    api.trackInteraction(type).then(refreshStats).catch(() => {})
  }

  const handleZoomIn = () => zoomBy(0.8, 'zoom_in')
  const handleZoomOut = () => zoomBy(1.25, 'zoom_out')

  const handleReset = () => {
    const c = controlsRef.current
    if (c) {
      c.object.position.set(...DEFAULT_CAMERA.pos)
      c.target.set(...DEFAULT_CAMERA.target)
      c.update()
    }
    api.trackInteraction('reset').then(refreshStats).catch(() => {})
  }

  // ---- 动作（Actions） ----
  const handleAction = async (name) => {
    setActiveAction(name)
    setActionKey((k) => k + 1)
    try {
      await api.triggerAction(name)
    } catch (err) {
      console.error('action failed:', err)
    }
    refreshStats()
  }

  return (
    <div className="layout">
      <header className="header">
        <h1>THE ROCK <span className="accent">3D DEMO</span></h1>
        <div className="header-sub">
          {modelInfo
            ? `${modelInfo.name} · model: ${modelInfo.model} · status: ${modelInfo.status}`
            : 'loading model info…'}
        </div>
      </header>

      <Controls
        onRotate={handleRotate}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onReset={handleReset}
        onAction={handleAction}
        activeAction={action}
      />

      <main className="viewport">
        <Scene
          action={action}
          actionKey={actionKey}
          spinKey={spinKey}
          controlsRef={controlsRef}
        />
        <div className="viewport-hint">drag to rotate · scroll to zoom</div>
      </main>

      <Stats online={online} latency={latency} stats={stats} />
    </div>
  )
}
