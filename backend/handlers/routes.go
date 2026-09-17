package handlers

import (
	"log"
	"net/http"
	"strconv"
	"time"

	"datadog-demo/backend/datadog"
	"datadog-demo/backend/stats"

	httptrace "gopkg.in/DataDog/dd-trace-go.v1/contrib/net/http"
)

// statusRecorder 记录响应状态码，供日志中间件使用。
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// withLogging 请求日志中间件：method path status latency。
// 已接入 Datadog：结构化日志 + latency histogram + 请求计数。
// APM span 由外层 httptrace.WrapHandler 自动生成（见 NewMux）。
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		latency := time.Since(start)
		log.Printf("%s %s status=%d latency=%s", r.Method, r.URL.Path, rec.status, latency)

		// 日志（Datadog 官方 JSON 日志格式）
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
		datadog.Histogram("backend.request_latency", latency.Seconds()*1000, statusTag)
		datadog.Count("backend.requests", 1, statusTag)
	})
}

// statusLevel 按状态码映射 Datadog 日志级别。
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

// withCORS 允许 Vite 开发服务器 (localhost:5173) 跨域访问。
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// withStats 统计中间件：对 /api/ 前缀请求计数。
func withStats(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) >= 5 && r.URL.Path[:5] == "/api/" {
			stats.IncTotalRequests()
		}
		next.ServeHTTP(w, r)
	})
}

// NewMux 构建全部路由。
func NewMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/model", HandleModel)
	mux.HandleFunc("POST /api/action", HandleAction)
	mux.HandleFunc("POST /api/interaction", HandleInteraction)
	mux.HandleFunc("GET /api/stats", HandleStats)
	mux.HandleFunc("GET /health", HandleHealth)
	handler := withStats(withLogging(withCORS(mux)))
	return httptrace.WrapHandler(handler, "rock-3d-backend", "http.request")
}
