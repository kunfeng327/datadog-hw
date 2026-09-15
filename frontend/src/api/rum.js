// Datadog RUM 前端接入。
// 通过 Vite 环境变量启用（frontend/.env.local）：
//   VITE_DD_RUM_APP_ID=xxx
//   VITE_DD_RUM_CLIENT_TOKEN=xxx
//   VITE_DD_APPLICATION_ID=xxx   （同名也可）
// 未配置时完全不初始化，本地开发零依赖。
import { datadogRum } from '@datadog/browser-rum'

const APP_ID = import.meta.env.VITE_DD_RUM_APP_ID
const CLIENT_TOKEN = import.meta.env.VITE_DD_RUM_CLIENT_TOKEN

let enabled = false

export function initRum() {
  if (!APP_ID || !CLIENT_TOKEN) {
    console.info('[datadog] RUM 未配置（缺少 VITE_DD_RUM_APP_ID / VITE_DD_RUM_CLIENT_TOKEN），跳过初始化')
    return
  }
  datadogRum.init({
    applicationId: APP_ID,
    clientToken: CLIENT_TOKEN,
    site: import.meta.env.VITE_DD_SITE || 'datadoghq.com',
    service: 'rock-demo-frontend',
    env: import.meta.env.VITE_DD_ENV || 'dev',
    version: '0.2.0',
    sessionSampleRate: 100,
    sessionReplaySampleRate: 100,
    trackUserInteractions: true, // 自动采集按钮点击等用户交互
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: 'allow',
  })
  datadogRum.startSessionReplayRecording()
  enabled = true
}

// 自定义事件：3D 模型交互 / 动作触发
export function rumAction(name, context = {}) {
  if (enabled) datadogRum.addAction(name, context)
}

// 自定义错误上报
export function rumError(message, context = {}) {
  if (enabled) datadogRum.addError(new Error(message), context)
}
