import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import Stats from './components/Stats.jsx'
import OrderPanel from './components/OrderPanel.jsx'
import ChatWidget from './components/ChatWidget.jsx'
import Icon from './components/Icon.jsx'
import { api } from './api/client.js'

// Native page links keep URLs, refresh, browser history, and RUM views in sync.
// Only the experience page imports Three.js and the scene assets.
const ExperiencePage = lazy(() => import('./pages/ExperiencePage.jsx'))

export default function App() {
  const isStore = window.location.pathname.replace(/\/+$/, '') === '/store'

  // API 状态
  const [online, setOnline] = useState(false)
  const [latency, setLatency] = useState(null)
  const [stats, setStats] = useState({})

  useEffect(() => {
    document.title = `${isStore ? '商品商店' : '3D 操作'} · The Rock Studio`
  }, [isStore])

  const refreshStats = useCallback(async () => {
    try {
      const { data } = await api.getStats()
      setStats(data)
    } catch {
      /* 轮询失败静默，由健康检查负责 Online/Offline */
    }
  }, [])

  // 两页共享原有健康与统计轮询；模型信息仅在 3D 页加载。
  // 治理策略：页面隐藏时暂停；失败后退避（3s 起、翻倍至 30s 封顶）；
  // 上一次请求未返回时跳过本轮，避免请求堆积。
  useEffect(() => {
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#page-content">
        跳到主要内容
      </a>
      <header className="header">
        <a
          className="brand"
          href="/"
          aria-label="The Rock Studio，返回 3D 操作"
        >
          <span className="brand-mark">
            <Icon name="cube" />
          </span>
          <span>
            THE ROCK<span className="brand-sub">INTERACTIVE STUDIO</span>
          </span>
        </a>
        <nav className="header-nav" aria-label="页面导航">
          <a href="/" aria-current={!isStore ? 'page' : undefined}>
            3D 操作
          </a>
          <a href="/store" aria-current={isStore ? 'page' : undefined}>
            商品商店 <Icon name="arrow" />
          </a>
        </nav>
      </header>

      <div className={`intro${isStore ? ' store-intro' : ''}`}>
        <div>
          <p className="eyebrow">
            {isStore ? 'THE ROCK / THE COLLECTION' : 'A LITTLE WORLD TO EXPLORE'}
          </p>
          <h1>
            {isStore ? (
              <>
                Find your favorite. <span>Make it yours.</span>
              </>
            ) : (
              <>
                Small world. <span>Big personality.</span>
              </>
            )}
          </h1>
          <p className="intro-copy">
            {isStore
              ? '挑一件喜欢的商品，把小世界里的乐趣带回家。'
              : '探索花园，切换动作，从每个角度认识 The Rock。'}
          </p>
        </div>
        <span className="edition">
          THE INTERACTIVE COLLECTION
          <span>{isStore ? '02 / THE STORE' : '01 / THE GARDEN'}</span>
        </span>
      </div>

      <main
        className={`layout${isStore ? ' store-layout' : ''}`}
        id="page-content"
        tabIndex={-1}
        aria-label={isStore ? '商品购买' : '3D 互动体验'}
      >
        {isStore ? (
          <div className="store-content">
            <OrderPanel />
            <a className="page-link" href="/">
              <span>
                <strong>返回 3D 操作</strong>
                <span>回到花园，继续探索和切换人物动作。</span>
              </span>
              <Icon name="arrow" />
            </a>
          </div>
        ) : (
          <Suspense
            fallback={
              <section className="panel page-loading" role="status">
                正在加载 3D 操作界面…
              </section>
            }
          >
            <ExperiencePage refreshStats={refreshStats} />
          </Suspense>
        )}

        <div className="right-col">
          <Stats online={online} latency={latency} stats={stats} />
        </div>
      </main>
      <footer className="footer">
        <span>A little curiosity goes a long way.</span>
        <span>
          THE ROCK STUDIO <span aria-hidden="true">↗</span>
        </span>
      </footer>

      <ChatWidget />
    </div>
  )
}
