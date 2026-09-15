/**
 * Stats — 右侧面板：API Status + 运行统计。
 * 数据来自 GET /api/stats / GET /health（由 App 轮询后传入）。
 */
export default function Stats({ online, latency, stats = {} }) {
  return (
    <aside className="panel">
      <h2>API Status</h2>
      <div className="status-row">
        <span className={`dot ${online ? 'on' : 'off'}`} />
        <span className={online ? 'text-ok' : 'text-err'}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="metric-row">
        <span className="metric-label">Latency</span>
        <span className="metric-value">
          {latency != null ? `${latency} ms` : '—'}
        </span>
      </div>

      <h2>Statistics</h2>
      {[
        ['Views', stats.views ?? 0],
        ['Interactions', stats.interactions ?? 0],
        ['Actions Triggered', stats.actions ?? 0],
        ['API Errors', stats.errors ?? 0],
      ].map(([label, value]) => (
        <div className="metric-row" key={label}>
          <span className="metric-label">{label}</span>
          <span className="metric-value">{value ?? 0}</span>
        </div>
      ))}
    </aside>
  )
}
