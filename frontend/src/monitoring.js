/**
 * 监控初始化（Datadog RUM 预留挂载点）。
 * init() 在 main.jsx 应用渲染前调用一次，后续所有上报都从这里走。
 */

let env = 'development'

export function getEnv() {
  return env
}

export function init() {
  // VITE_ENV 显式优先，其次用 Vite 的 MODE（dev / production）
  env = import.meta.env.VITE_ENV || import.meta.env.MODE || 'development'

  if (env === 'production') {
    // TODO: 接入 Datadog RUM，例如：
    // datadogRum.init({
    //   applicationId: import.meta.env.VITE_DD_APPLICATION_ID,
    //   clientToken: import.meta.env.VITE_DD_CLIENT_TOKEN,
    //   site: 'ap1.datadoghq.com',
    //   service: 'rock-3d-frontend',
    //   env,            // 'production' — Datadog 中按环境过滤
    //   sessionSampleRate: 100,
    // })
  } else {
    // 开发环境：不上报，只打本地日志，避免污染生产数据
    console.info(`[monitoring] env=${env}, reporting disabled`)
  }
}
