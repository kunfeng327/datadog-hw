import Icon from './Icon.jsx'

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
  return (
    <aside className="panel controls-panel" aria-labelledby="controls-title">
      <p className="eyebrow">YOU'RE IN CONTROL</p>
      <h2 id="controls-title">Make a move.</h2>
      <p className="panel-copy">
        Explore from every angle.
        <br /> Give the scene your spin.
      </p>
      <h3 className="section-label">Model controls</h3>
      <div className="btn-grid">
        <button className="btn" onClick={onRotate}>
          <Icon name="rotate" />
          Rotate
        </button>
        <button className="btn" onClick={onReset}>
          <Icon name="reset" />
          Reset view
        </button>
        <button className="btn" onClick={onZoomIn}>
          <Icon name="zoomIn" />
          Zoom in
        </button>
        <button className="btn" onClick={onZoomOut}>
          <Icon name="zoomOut" />
          Zoom out
        </button>
      </div>

      <h3 className="section-label">Character actions</h3>
      <div className="action-list">
        {['pose', 'flex', 'celebrate'].map((a) => (
          <button
            key={a}
            className={`btn action ${activeAction === a ? 'active' : ''}`}
            onClick={() => onAction(a)}
            aria-pressed={activeAction === a}
          >
            <span className="action-icon">
              <Icon name={a} />
            </span>
            <span>
              {a === 'pose'
                ? 'Strike a pose'
                : a === 'flex'
                  ? 'Flex it out'
                  : 'Celebrate'}
              <span className="action-description">
                {a === 'pose'
                  ? 'Find your signature look'
                  : a === 'flex'
                    ? 'Stand tall. Own the scene.'
                    : 'Make it a good day'}
              </span>
            </span>
            <span className="action-arrow" aria-hidden="true">
              ↗
            </span>
          </button>
        ))}
      </div>
      <div className="controls-note">
        <span className="note-mark" aria-hidden="true">
          ✳
        </span>
        <p>
          Take a closer look.
          <br />
          <span>Drag the scene to explore every angle.</span>
        </p>
      </div>
    </aside>
  )
}
