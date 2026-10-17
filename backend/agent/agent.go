package agent

import (
	"encoding/json"
	"errors"

	"datadog-demo/backend/datadog"
)

// 助手主循环：GLM function calling，最多 3 轮工具调用。

const fallbackReply = "抱歉，我不知道这个问题的答案"

const systemPrompt = `你是结账页面的购物助手机器人，帮助购物者了解商品信息和页面操作。规则（必须严格遵守）：

1. 回答商品价格、用途、库存等问题时，只能使用系统提供的"商品数据库检索结果"中的数据回答，绝对禁止编造商品、价格、库存、消费记录。
2. 工具查询不到用户问的商品时，友好告知没有找到该商品。
3. 你没有任何写操作权限：不能下单、支付、退款、改价、取消订单。用户提出这类请求（如"给我打五折"、"取消我的订单"）时，礼貌拒绝，并指引：下单请在当前 Merch Store 面板手动操作；退款、支付问题等资金类诉求请点击人工客服链接：/support（页面右下角"联系人工客服"）。
4. 页面导航只提供链接让用户自己点击，不要声称你已经执行了跳转。可用的链接只有：/（首页）、/support（人工客服），禁止编造任何其他链接（如商品详情链接）。
5. 用户问题不清晰（比如同时提到多个商品且没说清问哪个）时，先反问让用户选择或补充，不要猜。
6. 数据里没有的信息直接承认不知道，回答"抱歉，我不知道这个问题的答案"，不要编造。
7. 回答要准确、简洁，贴合结账场景，不闲聊、不输出无关内容。`

// Ask 处理一轮用户提问，返回回复文本。
// userID 用于会话配额（每日 10 个），sessionID 隔离对话上下文。
func Ask(userID, sessionID, userMessage string) (string, error) {
	datadog.Count("agent.questions", 1)

	if zhipuKey() == "" {
		return "", errors.New("ZHIPU_API_KEY not configured")
	}

	sess, ok := sm.get(userID, sessionID)
	if !ok {
		datadog.Count("agent.refusals", 1, "reason:session_limit")
		return "", ErrSessionLimit
	}

	sess.Messages = append(sess.Messages, Message{Role: "user", Content: userMessage})
	if approxTokens(sess.Messages) > maxSessionTokens {
		datadog.Count("agent.refusals", 1, "reason:token_limit")
		return "本会话已达到上下文上限，请开启新会话继续咨询。", nil
	}

	// 工具1：后端商品查询系统（只读）。确定性调用：每次提问前检索商品库，
	// 把最新数据注入上下文，模型只负责基于检索结果组织回答（不编造）。
	products, err := QueryProducts("")
	if err != nil {
		// 工具故障（order-service 不可达）：按阻断话术回复，不猜
		datadog.Count("agent.refusals", 1, "reason:tool_failure")
		datadog.LogEntry("agent tool failure: query_products", "error", map[string]any{
			"error": map[string]any{"kind": "tool_failure", "tool": "query_products"},
		})
		return fallbackReply, nil
	}
	pb, _ := json.Marshal(products)
	dataBlock := "当前商品数据库检索结果（JSON，回答只能基于此数据）：\n" + string(pb)

	// 组装上下文：system + 商品数据 + 会话历史（截断到最近 20 条防止超限）
	msgs := append([]Message{
		{Role: "system", Content: systemPrompt},
		{Role: "system", Content: dataBlock},
	}, tail(sess.Messages, 20)...)

	// 工具2：智谱 GLM 生成回答（单轮，基于注入的检索数据）
	reply, _, err := callZhipu(msgs, nil)
	if err != nil {
		datadog.Count("agent.refusals", 1, "reason:model_error")
		return fallbackReply, nil // 模型不可用：按阻断话术回复，不猜
	}
	sess.Messages = append(sess.Messages, Message{Role: "assistant", Content: reply.Content})
	datadog.LogEntry("agent answered", "info", map[string]any{
		"agent": map[string]any{"session": sessionID, "chars": len(reply.Content)},
	})
	return reply.Content, nil
}

// SessionsLeft 用户今日剩余会话数（供前端展示）。
func SessionsLeft(userID string) int { return sm.sessionsLeft(userID) }

func tail(msgs []Message, n int) []Message {
	if len(msgs) <= n {
		return msgs
	}
	return msgs[len(msgs)-n:]
}

// ErrSessionLimit 由 handler 转成 429 明确提示（每日 10 个会话）。
var ErrSessionLimit = errors.New("session limit reached (10/day)")
