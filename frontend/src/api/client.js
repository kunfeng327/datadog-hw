// 统一的前端 API 封装。所有对 Go 后端的请求都从这里走，
// 便于以后统一加入 Datadog RUM / tracing / 错误上报。

import { rumAction, rumError } from './rum.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000'

async function request(path, options = {}) {
  const start = performance.now()
  try {
    const res = await fetch(BASE_URL + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const latency = Math.round(performance.now() - start)
    rumAction('api.request', { path, status: res.status, latency })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      rumError(`api ${path} -> ${res.status}`, { path, status: res.status })
      throw err
    }
    return { data: await res.json(), latency }
  } catch (err) {
    err.latency = Math.round(performance.now() - start)
    if (!err.status) rumError(`api ${path} unreachable`, { path })
    throw err
  }
}

export const api = {
  // GET /api/model — 模型信息
  getModel: () => request('/api/model'),

  // POST /api/action — 触发动作 pose | flex | celebrate
  triggerAction: (action) =>
    request('/api/action', { method: 'POST', body: JSON.stringify({ action }) }),

  // POST /api/interaction — 记录交互 rotate | zoom_in | zoom_out | reset
  trackInteraction: (type) =>
    request('/api/interaction', { method: 'POST', body: JSON.stringify({ type }) }),

  // GET /api/stats — 运行统计
  getStats: () => request('/api/stats'),

  // GET /health — 后端健康检查
  health: () => request('/health'),
}
