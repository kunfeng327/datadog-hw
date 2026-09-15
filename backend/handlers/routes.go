package handlers

import (
	"net/http"
	"time"

	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace/tracer"

	"datadog-demo/backend/observability"
	"datadog-demo/backend/stats"
)

// statusRecorder 记录响应状态码，供日志/指标中间件使用。
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

// routeInfo 由具体 handler 标注的 span 名称（无则用路径）。
type ctxKey string

// withObservability 统一可观测性中间件：
//   - APM span 由 httptrace.WrapHandler 创建（见 NewMux）
//   - JSON 结构化日志（含 trace_id / span_id / latency / status）
//   - 自定义 metrics（request.count / request.latency / request.errors）
func withObservability(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(rec, r)

		latency := time.Since(start)

		// 自定义 metrics（DogStatsD，无 Agent 时 no-op）
		status := "200"
		if rec.status != http.StatusOK {
			status = "error"
		}
		observability.Incr("request.count",
			"method:"+r.Method, "path:"+r.URL.Path, "status:"+status)
		observability.Histogram("request.latency_ms",
			float64(latency.Microseconds())/1000.0, "path:"+r.URL.Path)
		if rec.status >= 400 {
			observability.Incr("request.errors",
				"method:"+r.Method, "path:"+r.URL.Path)
		}
	})
}

// withCORS 允许 Vite 开发服务器 (localhost:5173) 跨域访问。
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, x-datadog-trace-id, x-datadog-parent-id, x-datadog-sampling-priority")
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
// httptrace.WrapHandler 为每个路由创建 APM span（分布式追踪入口）。
func NewMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/model", wrap("/api/model", HandleModel))
	mux.HandleFunc("POST /api/action", wrap("/api/action", HandleAction))
	mux.HandleFunc("POST /api/interaction", wrap("/api/interaction", HandleInteraction))
	mux.HandleFunc("GET /api/stats", wrap("/api/stats", HandleStats))
	mux.HandleFunc("GET /health", wrap("/health", HandleHealth))
	return withStats(withCORS(withObservability(mux)))
}

// wrap 给 handler 创建 APM span（web.request，resource=路由路径），
// 并在 span 上下文中输出含 trace_id 的 JSON 结构化日志。
func wrap(resource string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		span := tracer.StartSpan("http.request",
			tracer.ResourceName(resource),
			tracer.ServiceName("rock-demo-api"),
			tracer.SpanType("web"),
			tracer.Tag("http.method", r.Method),
			tracer.Tag("http.url", r.URL.Path),
		)
		defer span.Finish()

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		reqCtx := tracer.ContextWithSpan(r.Context(), span)
		h(rec, r.WithContext(reqCtx))

		traceID, spanID := observability.TraceIDs(reqCtx)
		span.SetTag("http.status_code", rec.status)
		if rec.status >= 400 {
			span.SetTag("error", true)
		}

		// 结构化日志：POST /api/action status=200 latency=35ms trace_id=...
		observability.LogJSON("info", "request", map[string]any{
			"http.method":      r.Method,
			"http.url":         r.URL.Path,
			"http.status_code": rec.status,
			"duration_ms":      float64(time.Since(start).Microseconds()) / 1000.0,
			"trace_id":         traceID,
			"span_id":          spanID,
		})
	}
}
