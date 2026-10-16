package handlers

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"

	"datadog-demo/backend/agent"
	"datadog-demo/backend/datadog"
)

// hostOnly 去掉 RemoteAddr 的端口（否则每次连接端口都不同，配额会失效）。
func hostOnly(remoteAddr string) string {
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}

// HandleChat POST /api/chat — 结账页购物助手入口。
// 请求 {sessionId, message}（sessionId 由前端生成，用于隔离会话上下文）。
// 响应 {success, reply, sessionsLeft}。
func HandleChat(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SessionID string `json:"sessionId"`
		Message   string `json:"message"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Message == "" {
		writeError(w, http.StatusBadRequest, "invalid request: message required")
		return
	}
	if req.SessionID == "" {
		req.SessionID = "default"
	}
	// demo：以来源 IP（去端口）作为 userID 维度做每日会话配额
	userID := hostOnly(r.RemoteAddr)

	reply, err := agent.Ask(userID, req.SessionID, req.Message)
	if err != nil {
		if errors.Is(err, agent.ErrSessionLimit) {
			writeJSON(w, http.StatusTooManyRequests, map[string]any{
				"success":      false,
				"error":        "今日会话数已达上限（10 个/天），请明天再来或联系人工客服：/support",
				"sessionsLeft": 0,
			})
			return
		}
		writeError(w, http.StatusBadGateway, "assistant temporarily unavailable")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"success":      true,
		"reply":        reply,
		"sessionsLeft": agent.SessionsLeft(userID),
	})
	datadog.Count("agent.chat_handled", 1)
}
