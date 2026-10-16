import Icon from './Icon.jsx'

/**
 * Stats — 右侧面板：API Status + 运行统计。
 * 数据来自 GET /api/stats / GET /health（由 App 轮询后传入）。
 */
export default function Stats({ online, latency, stats = {} }) {
  return (
    <aside className="panel agent-panel" aria-labelledby="agent-title">
      <div className="agent-header">
        <div>
          <p className="eyebrow">BEHIND THE SCENE</p>
          <h2 id="agent-title">Agent & API</h2>
        </div>
        <Icon name="activity" />
      </div>
      <p className="agent-copy">Backend connection & activity</p>
      <div className="connection-row">
        <div className={`status-pill ${online ? 'on' : 'off'}`} role="status">
          <span className={`dot ${online ? 'on' : 'off'}`} aria-hidden="true" />
          API {online ? 'Online' : 'Offline'}
        </div>
        <span className="latency" aria-label="API latency">
          {latency != null ? `${latency} ms` : '— ms'}
        </span>
      </div>

      <dl className="metrics">
        {[
          ['Views', stats.views ?? 0],
          ['Interactions', stats.interactions ?? 0],
          ['Actions Triggered', stats.actions ?? 0],
          ['API Errors', stats.errors ?? 0],
        ].map(([label, value]) => (
          <div className="metric-row" key={label}>
            <dt className="metric-label">{label}</dt>
            <dd className="metric-value">{value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}
