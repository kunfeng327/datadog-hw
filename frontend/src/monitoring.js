/**
 * 监控初始化 — Datadog RUM。
 * init() 在 main.jsx 应用渲染前调用一次，后续所有上报都从这里走。
 * 配置来自 frontend/.env.local：
 *   VITE_DD_APPLICATION_ID / VITE_DD_CLIENT_TOKEN / VITE_DD_SITE / VITE_DD_ENV
 */
import { datadogRum } from '@datadog/browser-rum'

let env = 'development'

export function getEnv() {
  return env
}

export function init() {
  // VITE_ENV 显式优先，其次 VITE_DD_ENV，最后用 Vite 的 MODE（dev / production）
  env = import.meta.env.VITE_ENV || import.meta.env.VITE_DD_ENV || import.meta.env.MODE || 'development'

  const applicationId = import.meta.env.VITE_DD_APPLICATION_ID
  const clientToken = import.meta.env.VITE_DD_CLIENT_TOKEN
  const site = import.meta.env.VITE_DD_SITE || 'datadoghq.com'

  if (!applicationId || !clientToken) {
    console.warn(`[monitoring] env=${env}, missing VITE_DD_APPLICATION_ID / VITE_DD_CLIENT_TOKEN — RUM disabled`)
    return
  }

  datadogRum.init({
    applicationId,
    clientToken,
    site,
    service: 'rock-3d-frontend',
    env, // 开发/生产数据在 Datadog 中按 env 维度区分
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'allow',
  })

  datadogRum.startSessionReplayRecording()
  console.info(`[monitoring] Datadog RUM started: env=${env} site=${site}`)
}

// 供业务代码上报自定义事件/错误（统一出口，避免散落各处）
export const rum = {
  action: (name, context) => datadogRum.addAction(name, context),
  error: (error, context) => datadogRum.addError(error, context),
  timing: (name, durationMs, context) =>
    datadogRum.addAction(name, { durationMs, ...context }),
}
