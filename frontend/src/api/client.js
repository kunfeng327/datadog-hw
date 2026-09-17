// 统一的前端 API 封装。所有对 Go 后端的请求都从这里走，
// 便于以后统一加入 Datadog RUM / tracing / 错误上报。
import { rum } from '../monitoring.js'

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:9000'

// 网络层失败（fetch 本身抛错，如后端不可达 / CORS）的统一错误标记
function markNetworkError(err) {
  err.isNetworkError = true
  return err
}

// 带重试上限的请求：仅幂等的 GET 在网络层失败时重试 1 次，
// 其余（POST）直接抛出，避免重复触发动作/统计。
const MAX_GET_RETRIES = 1

async function requestOnce(path, options) {
  const start = performance.now()
  const method = options.method || 'GET'
  try {
    const res = await fetch(BASE_URL + path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    })
    const latency = Math.round(performance.now() - start)
    rum.timing('api.request', latency, { method, path, status: res.status })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      rum.error(err, { method, path, status: res.status })
      throw err
    }
    return { data: await res.json(), latency }
  } catch (err) {
    if (!(err instanceof Error) || err.status) throw err // HTTP 错误不重试
    rum.error(err, { method, path, kind: 'network_error' }) // Failed to fetch 等
    throw markNetworkError(err)
  }
}

async function request(path, options = {}) {
  const isGet = !options.method || options.method === 'GET'
  let lastErr
  const attempts = isGet ? MAX_GET_RETRIES + 1 : 1
  for (let i = 0; i < attempts; i++) {
    try {
      return await requestOnce(path, options)
    } catch (err) {
      lastErr = err
      if (!err.isNetworkError) throw err // 只重试网络错误
    }
  }
  lastErr.latency = Math.round(performance.now())
  throw lastErr
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
