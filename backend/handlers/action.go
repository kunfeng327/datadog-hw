package handlers

import (
	"encoding/json"
	"net/http"

	"datadog-demo/backend/observability"
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
		observability.Incr("rock.errors", "type:bad_request")
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if !validActions[req.Action] {
		stats.IncErrors()
		observability.Incr("rock.errors", "type:unknown_action")
		writeError(w, http.StatusBadRequest, "unknown action: "+req.Action)
		return
	}

	stats.IncActions()
	observability.Incr("rock.actions", "action:"+req.Action)
	writeJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"action":  req.Action,
	})
}
