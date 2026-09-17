// Package datadog 将 order-service 日志与自定义 metrics 上报到 Datadog HTTP intake。
// 无需本机安装 DataDog Agent，只需 DD_API_KEY 环境变量（直连方案）。
// 若日后切到 Agent + dogstatsd，只需替换本包实现，业务代码不用动。
//
// 设计：异步批量上报 —— 业务代码调 LogEntry/Count/Histogram 只写入带缓冲的
// channel，后台 goroutine 每 5 秒或攒够一批就 POST 一次，请求路径零阻塞。
package datadog

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"
)

const (
	serviceName = "order-service"
	flushEvery = 5 * time.Second
	batchSize  = 50
)

var (
	apiKey = os.Getenv("DD_API_KEY") // https://app.datadoghq.com/organization-settings/api-keys
	site   = envOr("DD_SITE", "us5.datadoghq.com")
	env    = envOr("DD_ENV", "development")

	logCh    = make(chan map[string]any, 512)
	metricCh = make(chan series, 512)
	once     sync.Once
	client   = &http.Client{Timeout: 5 * time.Second}
)

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// series 对应 Datadog metrics API 的单个序列。
type series struct {
	Metric string    `json:"metric"`
	Points [][2]any  `json:"points"` // [[unix秒, 值]]
	Type   string    `json:"type,omitempty"` // "count" | "gauge"
	Tags   []string  `json:"tags,omitempty"`
}

// Init 启动后台上报循环；未配置 DD_API_KEY 时自动降级为只打本地日志。
func Init() {
	once.Do(func() {
		if apiKey == "" {
			log.Printf("[datadog] DD_API_KEY not set — logging to stdout only")
			return
		}
		log.Printf("[datadog] enabled: site=%s env=%s service=%s", site, env, serviceName)
		go flushLoop(logCh, metricCh)
	})
}

func tags(extra ...string) []string {
	t := append([]string{"env:" + env, "service:" + serviceName}, extra...)
	return t
}

// LogEntry 上报一条结构化日志（异步、非阻塞）。
func LogEntry(msg, status string, fields map[string]any) {
	entry := map[string]any{
		"message":   msg,
		"status":    status,
		"service":   serviceName,
		"ddsource":  "go",
		"ddtags":    "env:" + env + ",service:" + serviceName,
		"timestamp": time.Now().Unix(),
	}
	for k, v := range fields {
		entry[k] = v
	}
	if apiKey == "" {
		log.Printf("[local] %s %v", msg, fields)
		return
	}
	select {
	case logCh <- entry:
	default: // 缓冲满时丢弃，绝不阻塞请求
	}
}

// Count 上报计数型自定义 metric。
func Count(name string, value float64, extraTags ...string) {
	pushMetric(name, value, "count", extraTags)
}

// Histogram 上报延迟类指标（Datadog 会自动算 p50/p95/max）。
func Histogram(name string, value float64, extraTags ...string) {
	pushMetric(name, value, "", extraTags)
}

func pushMetric(name string, value float64, typ string, extraTags []string) {
	if apiKey == "" {
		return
	}
	s := series{
		Metric: name,
		Points: [][2]any{{float64(time.Now().Unix()), value}},
		Type:   typ,
		Tags:   tags(extraTags...),
	}
	select {
	case metricCh <- s:
	default:
	}
}

// flushLoop 定时把缓冲中的日志 / metrics 批量 POST 到 intake。
func flushLoop(lch <-chan map[string]any, mch <-chan series) {
	t := time.NewTicker(flushEvery)
	defer t.Stop()
	for range t.C {
		var logs []map[string]any
		var metrics []series
		for {
			select {
			case e := <-lch:
				logs = append(logs, e)
				continue
			case s := <-mch:
				metrics = append(metrics, s)
				continue
			default:
			}
			break
		}
		if len(logs) > 0 {
			post("/api/v2/logs", nil, logs)
		}
		if len(metrics) > 0 {
			postMetrics(metrics)
		}
	}
}

func postMetrics(list []series) {
	post("/api/v1/series", map[string]any{"series": list}, nil)
}

func post(path string, payload any, logsList []map[string]any) {
	host := "https://" + site // metrics 等常规 API
	if logsList != nil {
		// logs intake 是独立域名，如 http-intake.logs.us5.datadoghq.com
		host = "https://http-intake.logs." + site
	}
	var body []byte
	if logsList != nil {
		body, _ = json.Marshal(logsList) // logs intake 直接是数组
	} else {
		body, _ = json.Marshal(payload)
	}
	req, err := http.NewRequest(http.MethodPost, host+path, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("DD-API-KEY", apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("[datadog] post %s failed: %v", path, err)
		return
	}
	resp.Body.Close()
	if resp.StatusCode >= 300 {
		log.Printf("[datadog] post %s status=%d", path, resp.StatusCode)
	} else {
		log.Printf("[datadog] post %s ok status=%d", path, resp.StatusCode)
	}
}
