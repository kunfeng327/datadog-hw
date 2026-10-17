import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'
import Icon from './Icon.jsx'

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
})

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

  const selectedItem = items.find((item) => item.id === itemId)

  return (
    <section
      className="panel order-panel"
      id="store"
      aria-labelledby="store-title"
    >
      <div className="order-header">
        <div>
          <p className="eyebrow">A LITTLE SOMETHING FOR YOU</p>
          <h2 id="store-title">Take it home.</h2>
        </div>
        <button
          className="btn-mini"
          onClick={loadItems}
          aria-label="刷新库存 / Refresh stock"
          title="刷新库存 / Refresh stock"
        >
          <Icon name="refresh" />
        </button>
      </div>
      <p className="panel-copy">Your next collectible is a click away.</p>

      {items.length === 0 ? (
        <div className="order-empty" role="status">
          加载商品中… / Loading collection…
        </div>
      ) : (
        <>
          <form
            className="order-form"
            aria-busy={loading}
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <label htmlFor="order-item">
              Choose your collectible <span>商品</span>
            </label>
            <select
              id="order-item"
              value={itemId}
              onChange={(e) => {
                itemIdRef.current = e.target.value
                setItemId(e.target.value)
              }}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name}
                </option>
              ))}
            </select>
            {selectedItem && (
              <div className="product-details">
                <strong>{money.format(selectedItem.price)}</strong>
                <span>
                  库存 {selectedItem.stock} ·{' '}
                  {selectedItem.stock > 0 ? 'available' : 'sold out'}
                </span>
              </div>
            )}
            <label htmlFor="order-quantity">
              Quantity <span>数量</span>
            </label>
            <input
              id="order-quantity"
              type="number"
              min="1"
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
            />
            <button
              className="purchase-btn"
              type="submit"
              disabled={loading || !itemId}
            >
              <span>
                {loading ? '下单中… / Placing order…' : '购买 / Place order'}
              </span>
              <Icon name="arrow" />
            </button>
          </form>
        </>
      )}
      {result && (
        <div
          className={`order-result ${result.ok ? 'ok' : 'err'}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>
            {result.ok
              ? 'Order confirmed / 购买成功'
              : `Order declined / 下单失败 (${result.status ?? 'error'})`}
          </strong>
          <p>
            {result.ok
              ? `订单号 ${result.orderId} · 剩余库存 ${result.stockLeft}`
              : result.error}
          </p>
        </div>
      )}
    </section>
  )
}
