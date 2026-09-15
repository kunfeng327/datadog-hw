package handlers

import (
	"encoding/json"
	"net/http"

	"datadog-demo/backend/stats"
)

// validActions 合法的 action 集合。以后可扩展。
var validActions = map[string]bool{
	"pose":     true,
	"flex":     true,
	"celebrate": true,
}

type actionRequest struct {
	Action string `json:"action"`
}

// HandleAction POST /api/action — 处理模型动作触发。
func HandleAction(w http.ResponseWriter, r *http.Request) {
	var req actionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		stats.IncErrors()
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if !validActions[req.Action] {
		stats.IncErrors()
		writeError(w, http.StatusBadRequest, "unknown action: "+req.Action)
		return
	}

	stats.IncActions()
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"action":  req.Action,
	})
}
