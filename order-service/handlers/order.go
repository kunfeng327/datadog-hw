package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"

	"datadog-demo/order-service/datadog"
)

// Item 商品。库存全在内存中（demo 用），mutex 保护。
type Item struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Price float64 `json:"price"`
	Stock int    `json:"stock"`
}

var (
	mu    sync.Mutex
	items = map[string]*Item{
		"rock-figure":  {ID: "rock-figure", Name: "巨石强森手办（经典）", Price: 199, Stock: 50},
		"flex-figure":  {ID: "flex-figure", Name: "Flex 姿势限定版", Price: 249, Stock: 50},
		"limited-tshirt": {ID: "limited-tshirt", Name: "限量联名 T 恤", Price: 99, Stock: 1}, // 库存 1，方便演示"库存不足"失败路径
	}
	orderSeq int
)

// writeJSON / writeError 与 backend 相同模式。
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	datadog.LogEntry(
		"order-service error: "+msg,
		"error",
		map[string]any{"error": map[string]any{"kind": "order_error", "status_code": status, "message": msg}},
	)
	writeJSON(w, status, map[string]any{
		"success": false,
		"error":   msg,
	})
}

// HandleHealth 健康检查。
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "order-service"})
}

// HandleItems 返回商品列表（含实时库存）。
func HandleItems(w http.ResponseWriter, r *http.Request) {
	mu.Lock()
	defer mu.Unlock()
	list := make([]Item, 0, len(items))
	for _, it := range items {
		list = append(list, *it)
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "items": list})
}

// HandleOrder 下单：核心业务动作，三条路径 ——
//   200 confirmed（成功） / 404 item not found / 409 insufficient stock
func HandleOrder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ItemID   string `json:"itemId"`
		Quantity int    `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.ItemID == "" || req.Quantity <= 0 {
		writeError(w, http.StatusBadRequest, "invalid request: itemId and positive quantity required")
		return
	}

	mu.Lock()
	item, ok := items[req.ItemID]
	if !ok {
		mu.Unlock()
		datadog.Count("order.orders", 1, "outcome:not_found")
		writeError(w, http.StatusNotFound, "item not found: "+req.ItemID)
		return
	}
	if item.Stock < req.Quantity {
		mu.Unlock()
		datadog.Count("order.orders", 1, "outcome:out_of_stock")
		writeError(w, http.StatusConflict, "insufficient stock: requested "+itoa(req.Quantity)+" but only "+itoa(item.Stock)+" left")
		return
	}
	item.Stock -= req.Quantity
	orderSeq++
	orderID := "ord-" + itoa(1000+orderSeq)
	mu.Unlock()

	datadog.Count("order.orders", 1, "outcome:confirmed")
	datadog.LogEntry("order confirmed: "+orderID, "info", map[string]any{
		"order": map[string]any{"id": orderID, "item": req.ItemID, "quantity": req.Quantity, "status": "confirmed"},
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"success":  true,
		"orderId":  orderID,
		"itemId":   req.ItemID,
		"quantity": req.Quantity,
		"status":   "confirmed",
		"stockLeft": item.Stock,
	})
}

func itoa(n int) string { return strconv.Itoa(n) }
