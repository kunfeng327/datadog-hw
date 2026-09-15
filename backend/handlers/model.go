package handlers

import (
	"net/http"

	"datadog-demo/backend/stats"
)

// HandleModel GET /api/model — 返回模型信息。
func HandleModel(w http.ResponseWriter, r *http.Request) {
	stats.IncViews()
	writeJSON(w, http.StatusOK, map[string]any{
		"name":   "The Rock",
		"model":  "placeholder",
		"status": "ready",
	})
}
