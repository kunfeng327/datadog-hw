package handlers

import (
	"encoding/json"
	"net/http"

	"datadog-demo/backend/stats"
)

type interactionRequest struct {
	Type string `json:"type"` // rotate | zoom_in | zoom_out | reset
}

// HandleInteraction POST /api/interaction — 记录 3D 视图交互（rotate/zoom/reset）。
func HandleInteraction(w http.ResponseWriter, r *http.Request) {
	var req interactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		stats.IncErrors()
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	stats.IncInteractions()
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"type":    req.Type,
	})
}
