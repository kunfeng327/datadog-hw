package handlers

import "net/http"

// HandleHealth GET /health — 存活检查。
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok",
	})
}
