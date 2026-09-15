package handlers

import (
	"net/http"

	"datadog-demo/backend/stats"
)

// HandleStats GET /api/stats — 返回内存统计数据。
func HandleStats(w http.ResponseWriter, r *http.Request) {
	views, interactions, actions, errors, total := stats.Get()
	writeJSON(w, http.StatusOK, map[string]any{
		"views":        views,
		"interactions": interactions,
		"actions":      actions,
		"errors":       errors,
		"total":        total,
	})
}
