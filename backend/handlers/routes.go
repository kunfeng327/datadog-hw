package handlers

import (
	"log"
	"net/http"
	"time"

	"datadog-demo/backend/stats"
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
// 这里是以后接入 Datadog logs / traces / metrics 的挂载点。
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rec, r)

		log.Printf("%s %s status=%d latency=%s", r.Method, r.URL.Path, rec.status, time.Since(start))
	})
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
	return withStats(withLogging(withCORS(mux)))
}
