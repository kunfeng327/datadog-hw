// Package observability 集中管理 Datadog 接入点：
//   - tracer:  APM 分布式追踪（dd-trace-go）
//   - statsd:  自定义 metrics（DogStatsD）
//   - logging: JSON 结构化日志（与 Datadog 日志采集格式对齐）
//
// 未配置 DD Agent / API Key 时所有组件自动降级为 no-op，
// 应用正常运行，仅输出本地 JSON 日志。
package observability

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"time"

	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace"
	"gopkg.in/DataDog/dd-trace-go.v1/ddtrace/tracer"
	statsd "github.com/DataDog/datadog-go/v5/statsd"
)

var statsdClient *statsd.Client

var serviceName, envName = "rock-demo-api", "dev"

// Start 初始化 APM tracer 与 DogStatsD 客户端。
// 通过环境变量控制（DD_AGENT_URL / DD_AGENT_HOST / DD_SERVICE / DD_ENV ...），
// 无 Agent 时 tracer 照常工作（span 无法发送），statsd 客户端创建失败则降级。
func Start(service, env string) {
	serviceName, envName = service, env
	tracer.Start(
		tracer.WithService(service),
		tracer.WithEnv(env),
		tracer.WithServiceVersion("0.2.0"),
	)

	// 无 Agent 模式（DD_DOGSTATSD_PORT=0）时跳过 DogStatsD，指标降级为 no-op；
	// APM 仍可通过 DD_TRACE_AGENT_URL + DD_API_KEY 直连 Datadog 上报。
	if os.Getenv("DD_DOGSTATSD_PORT") == "0" {
		log.Println("[observability] agentless mode: statsd disabled, metrics no-op")
	} else {
		client, err := statsd.New("127.0.0.1:8125",
			statsd.WithTags([]string{"service:" + service, "env:" + env}),
		)
		if err != nil {
			log.Printf("[observability] statsd unavailable (agent not running?), metrics degraded: %v", err)
		} else {
			statsdClient = client
		}
	}
}

// Stop 优雅关闭。
func Stop() {
	tracer.Stop()
	if statsdClient != nil {
		_ = statsdClient.Close()
	}
}

// Incr 自定义计数 metric。接入点统一收敛在这里。
func Incr(name string, tags ...string) {
	if statsdClient != nil {
		_ = statsdClient.Incr(name, tags, 1.0)
	}
}

// Gauge 自定义瞬时值 metric。
func Gauge(name string, value float64, tags ...string) {
	if statsdClient != nil {
		_ = statsdClient.Gauge(name, value, tags, 1.0)
	}
}

// Histogram 分布 metric（例如请求延迟的自定义直方图）。
func Histogram(name string, value float64, tags ...string) {
	if statsdClient != nil {
		_ = statsdClient.Histogram(name, value, tags, 1.0)
	}
}

// ---- 结构化日志（JSON，一行一条，方便 Datadog Logs 的 pipeline 解析） ----

type logFields map[string]any

// LogJSON 输出一条 JSON 日志。Datadog Log Agent / stdout 采集可直接索引这些字段。
func LogJSON(level, msg string, fields logFields) {
	entry := logFields{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"message":   msg,
		"service":   serviceName,
		"env":       envName,
	}
	for k, v := range fields {
		entry[k] = v
	}
	b, err := json.Marshal(entry)
	if err != nil {
		return
	}
	log.Println(string(b))
}

// CurrentSpan 返回当前 context 中的 span（用于在日志中带 trace_id）。
func CurrentSpan(ctx context.Context) ddtrace.Span {
	span, _ := tracer.SpanFromContext(ctx)
	return span
}

// TraceIDs 从 context 提取 trace_id / span_id（无 span 时为 0）。
func TraceIDs(ctx context.Context) (traceID, spanID uint64) {
	if span, ok := tracer.SpanFromContext(ctx); ok {
		ctx := span.Context()
		if sc, ok := ctx.(interface {
			TraceID() uint64
			SpanID() uint64
		}); ok {
			return sc.TraceID(), sc.SpanID()
		}
	}
	return 0, 0
}
