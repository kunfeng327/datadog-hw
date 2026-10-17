import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

/**
 * ChatWidget — 结账页购物助手（agent.md）。
 * 悬浮按钮 + 展开式聊天窗；会话 ID 随组件生成，页面刷新即新会话。
 * 助手只读（查商品/导航指引），下单仍由 Merch Store 面板手动完成。
 */

// 把回复文本里的 /support、/ 链接渲染成可点击（导航交给用户手动触发）
function renderReply(text) {
  const parts = text.split(/(\/support)/g)
  return parts.map((p, i) =>
    p === '/support' ? (
      <a key={i} href="/support" onClick={(e) => { e.preventDefault(); alert('（demo）此处跳转人工客服页面 /support') }}>联系人工客服</a>
    ) : (
      <span key={i}>{p}</span>
    ),
  )
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: '你好！我是购物助手，可以帮你查商品价格、用途和库存，或指引页面操作。请问有什么可以帮你？' },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const sessionIdRef = useRef('sess-' + Math.random().toString(36).slice(2, 10))
  const listRef = useRef(null)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, open])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const { data } = await api.chat(sessionIdRef.current, text)
      setMessages((m) => [...m, { role: 'assistant', text: data.reply }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', text: err.message || '服务暂时不可用，请稍后再试' }])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-window">
          <div className="chat-header">
            <span>购物助手</span>
            <button className="btn-mini" onClick={() => setOpen(false)}>收起</button>
          </div>
          <div className="chat-list" ref={listRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role}`}>
                {renderReply(m.text)}
              </div>
            ))}
            {busy && <div className="chat-msg assistant">思考中…</div>}
          </div>
          <div className="chat-input">
            <input
              value={input}
              placeholder="例如：手办多少钱？"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button onClick={send} disabled={busy || !input.trim()}>发送</button>
          </div>
        </div>
      )}
      <button className="chat-fab" onClick={() => setOpen((o) => !o)} title="购物助手">
        {open ? '×' : '💬'}
      </button>
    </div>
  )
}
