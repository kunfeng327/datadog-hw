// Package handlers：order-service 的 HTTP 层。
// 复用 backend 的中间件模式：日志中间件 + httptrace APM 包装。
package handlers

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"datadog-demo/order-service/datadog"

	httptrace "gopkg.in/DataDog/dd-trace-go.v1/contrib/net/http"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// withLogging 请求日志中间件：method path status latency + Datadog 上报。
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		latency := time.Since(start)
		log.Printf("%s %s status=%d latency=%s", r.Method, r.URL.Path, rec.status, latency)

		fields := map[string]any{
			"http": map[string]any{
				"method":      r.Method,
				"url":         map[string]any{"path": r.URL.Path},
				"status_code": rec.status,
			},
			"network": map[string]any{"client": map[string]any{"ip": r.RemoteAddr}},
			"duration": latency.Milliseconds(),
		}
		statusTag := "status:" + strconv.Itoa(rec.status)
		datadog.LogEntry(r.Method+" "+r.URL.Path, statusLevel(rec.status), fields)
		datadog.Histogram("order.request_latency", latency.Seconds()*1000, statusTag)
		datadog.Count("order.requests", 1, statusTag)
	})
}

func statusLevel(code int) string {
	switch {
	case code >= 500:
		return "error"
	case code >= 400:
		return "warn"
	default:
		return "info"
	}
}

// withCORS 允许跨域访问。
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// NewMux 构建全部路由。
func NewMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", HandleHealth)
	mux.HandleFunc("GET /items", HandleItems)
	mux.HandleFunc("POST /order", HandleOrder)
	handler := withLogging(withCORS(mux))
	return httptrace.WrapHandler(handler, "order-service", "http.request")
}
