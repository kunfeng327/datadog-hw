import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

/**
 * OrderPanel — 购买模型手办（业务动作 demo）。
 * 成功路径：status confirmed + 订单号；
 * 失败路径：库存不足(409) / 商品不存在(404) / 下游不可用(502)。
 * 跨服务链路：前端 → rock-3d-backend → order-service（APM 可见完整 trace）。
 *
 * 库存实时性：挂载即加载 + 每 5s 轮询刷新（页面隐藏时暂停），
 * 下单成功后立即刷新 —— 多个浏览器/客户端下单，库存都会同步。
 */
export default function OrderPanel() {
  const [items, setItems] = useState([])
  const [itemId, setItemId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [result, setResult] = useState(null) // { ok, orderId, stockLeft, error }
  const [loading, setLoading] = useState(false)
  const itemIdRef = useRef('')

  const loadItems = useCallback(async () => {
    try {
      const { data } = await api.getItems()
      const list = data.items || []
      setItems(list)
      if (list.length && !itemIdRef.current) {
        itemIdRef.current = list[0].id
        setItemId(list[0].id)
      }
    } catch (err) {
      setResult({ ok: false, error: '无法加载商品列表：' + err.message })
    }
  }, [])

  // 挂载即加载 + 5s 轮询（页面隐藏时暂停，回到页面立即刷新）
  useEffect(() => {
    loadItems()
    const timer = setInterval(() => {
      if (!document.hidden) loadItems()
    }, 5000)
    const onVisible = () => {
      if (!document.hidden) loadItems()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadItems])

  const submit = async () => {
    setLoading(true)
    setResult(null)
    try {
      const { data } = await api.order(itemId, quantity)
      setResult({ ok: true, orderId: data.orderId, stockLeft: data.stockLeft })
      loadItems() // 下单成功立即刷新库存
    } catch (err) {
      setResult({ ok: false, error: err.message, status: err.status })
      loadItems() // 失败（如库存不足）也刷新，展示最新库存
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="order-panel">
      <div className="order-header">
        <h2>Merch Store</h2>
        <button className="btn-mini" onClick={loadItems}>刷新库存</button>
      </div>

      {items.length === 0 ? (
        <div className="order-empty">加载商品中…</div>
      ) : (
        <>
          <div className="order-form">
            <select value={itemId} onChange={(e) => { itemIdRef.current = e.target.value; setItemId(e.target.value) }}>
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}（¥{it.price} · 库存 {it.stock}）
                </option>
              ))}
            </select>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            />
            <button onClick={submit} disabled={loading || !itemId}>
              {loading ? '下单中…' : '购买'}
            </button>
          </div>

          {result && (
            <div className={`order-result ${result.ok ? 'ok' : 'err'}`}>
              {result.ok
                ? `✅ confirmed · 订单号 ${result.orderId} · 剩余库存 ${result.stockLeft}`
                : `❌ declined（${result.status ?? 'error'}）：${result.error}`}
            </div>
          )}
        </>
      )}
    </section>
  )
}
