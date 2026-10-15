package handlers

import (
	"io"
	"net/http"
	"os"
	"time"

	"datadog-demo/backend/datadog"

	httptrace "gopkg.in/DataDog/dd-trace-go.v1/contrib/net/http"
)

// orderServiceBase 是 order-service 的地址，可通过 ORDER_SERVICE_URL 覆盖
//（docker-compose 里为 http://order-service:9100）。
func orderServiceBase() string {
	if v := os.Getenv("ORDER_SERVICE_URL"); v != "" {
		return v
	}
	return "http://localhost:9100"
}

// tracedClient 使用 dd-trace-go 的 traced RoundTripper：
// 出站请求会自动带上当前 span 的 trace 上下文（x-datadog-* 头），
// 从而在 Datadog APM 里形成 rock-3d-backend → order-service 的跨服务 trace。
var tracedClient = &http.Client{
	Timeout:   5 * time.Second,
	Transport: httptrace.WrapRoundTripper(http.DefaultTransport),
}

// proxyOrderService 把请求原样转发到 order-service 并透传响应。
// 任何网络层错误返回 502（失败路径之一：下游不可用）。
func proxyOrderService(w http.ResponseWriter, r *http.Request, path string) {
	req, err := http.NewRequestWithContext(r.Context(), r.Method, orderServiceBase()+path, r.Body)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to build upstream request")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := tracedClient.Do(req)
	if err != nil {
		datadog.Count("backend.order_proxy", 1, "outcome:upstream_error")
		writeError(w, http.StatusBadGateway, "order-service unreachable")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

// HandleItems GET /api/items —— 透传商品列表。
func HandleItems(w http.ResponseWriter, r *http.Request) {
	proxyOrderService(w, r, "/items")
}

// HandleOrder POST /api/order —— 下单购买（跨服务调用 order-service）。
func HandleOrder(w http.ResponseWriter, r *http.Request) {
	proxyOrderService(w, r, "/order")
}
