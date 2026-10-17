package agent

import (
	"sync"
	"time"
)

// 会话管理（内存态，重启即清，符合 agent.md 隐私要求：
// 仅保留当前会话上下文，不跨用户/会话共享）。

const (
	maxSessionsPerUserPerDay = 10   // 单用户每日最多 10 个会话
	maxSessionTokens         = 9000 // 单会话上下文 token 上限（agent.md: 10000，留余量）
)

type Session struct {
	Messages  []Message
	UpdatedAt time.Time
}

type sessionManager struct {
	mu       sync.Mutex
	sessions map[string]*Session            // sessionId -> 会话
	daily    map[string]map[string]struct{} // userId -> 今日创建的 sessionId 集合
	day      string                         // 当前日期（每日重置计数）
}

var sm = &sessionManager{
	sessions: map[string]*Session{},
	daily:    map[string]map[string]struct{}{},
}

func today() string { return time.Now().Format("2006-01-02") }

// canCreateLocked 检查用户今日还能否新建会话（调用方必须已持锁），能则登记。
func (m *sessionManager) canCreateLocked(userID, sessionID string) bool {
	m.rollDay()
	if m.daily[userID] == nil {
		m.daily[userID] = map[string]struct{}{}
	}
	if len(m.daily[userID]) >= maxSessionsPerUserPerDay {
		return false
	}
	m.daily[userID][sessionID] = struct{}{}
	return true
}

func (m *sessionManager) rollDay() {
	t := today()
	if m.day != t {
		m.day = t
		m.daily = map[string]map[string]struct{}{}
	}
}

// get 返回会话；不存在则（在配额允许时）新建。
func (m *sessionManager) get(userID, sessionID string) (*Session, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[sessionID]; ok {
		s.UpdatedAt = time.Now()
		return s, true
	}
	if !m.canCreateLocked(userID, sessionID) {
		return nil, false
	}
	s := &Session{UpdatedAt: time.Now()}
	m.sessions[sessionID] = s
	return s, true
}

// sessionsLeft 用户今日剩余可新建会话数。
func (m *sessionManager) sessionsLeft(userID string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.rollDay()
	return maxSessionsPerUserPerDay - len(m.daily[userID])
}

// approxTokens 粗略估算 token：中文字符 ≈ 1 token/字，ASCII ≈ 0.25 token/字符。
func approxTokens(msgs []Message) int {
	cjk, ascii := 0, 0
	for _, m := range msgs {
		for _, r := range m.Content {
			if r > 127 {
				cjk++
			} else {
				ascii++
			}
		}
	}
	return cjk + ascii/4
}
