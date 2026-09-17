// Package handlers 包含所有 API handler。
// 每个 handler 只做：解析请求 -> 业务逻辑 -> 写响应 -> 记录统计。
// 日志中间件（含 latency 记录）在 middleware.go，便于后续接入 Datadog APM/Logs。
package handlers

import (
	"encoding/json"
	"net/http"

	"datadog-demo/backend/datadog"
)

// writeJSON 统一的 JSON 响应出口，后续可在这一处加 response logging。
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError 统一错误响应出口，已接入 Datadog error tracking。
func writeError(w http.ResponseWriter, status int, msg string) {
	datadog.LogEntry(
		"api error: "+msg,
		"error",
		map[string]any{"error": map[string]any{"kind": "api_error", "status_code": status, "message": msg}},
	)
	writeJSON(w, status, map[string]any{
		"success": false,
		"error":   msg,
	})
}
