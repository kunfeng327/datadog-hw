/**
 * Controls — 左侧面板：Model Controls + Actions。
 * 所有按钮都会通过回调通知 App，由 App 统一调用后端 API。
 */
export default function Controls({
  onRotate,
  onZoomIn,
  onZoomOut,
  onReset,
  onAction,
  activeAction,
}) {
  const btn = 'btn'
  return (
    <aside className="panel">
      <h2>Model Controls</h2>
      <div className="btn-grid">
        <button className={btn} onClick={onRotate}>↻ Rotate</button>
        <button className={btn} onClick={onZoomIn}>＋ Zoom In</button>
        <button className={btn} onClick={onZoomOut}>－ Zoom Out</button>
        <button className={btn} onClick={onReset}>⟲ Reset View</button>
      </div>

      <h2>Actions</h2>
      <div className="btn-grid">
        {['pose', 'flex', 'celebrate'].map((a) => (
          <button
            key={a}
            className={`btn action ${activeAction === a ? 'active' : ''}`}
            onClick={() => onAction(a)}
          >
            {a === 'pose' ? '🧍 Pose' : a === 'flex' ? '💪 Flex' : '🎉 Celebrate'}
          </button>
        ))}
      </div>
    </aside>
  )
}
