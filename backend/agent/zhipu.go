// Package agent 实现结账页购物助手（见 agent.md 设计）。
// 两个工具：order-service 商品查询（只读）+ 智谱 GLM 生成回答。
// 硬约束：只用检索数据回答、禁止编造、拒绝支付/退款等写操作。
package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

const zhipuURL = "https://open.bigmodel.cn/api/paas/v4/chat/completions"

// Message OpenAI 兼容的消息结构（system / user / assistant / tool）。
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// ToolCall 模型发起的工具调用请求。
type ToolCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"` // "function"
	Function struct {
		Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON 字符串
	} `json:"function"`
}

// ToolDef 工具定义（发给模型的 function schema）。
type ToolDef struct {
	Type     string `json:"type"` // "function"
	Function struct {
		Name        string         `json:"name"`
		Description string         `json:"description"`
		Parameters  map[string]any `json:"parameters"`
	} `json:"function"`
}

type zhipuRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []ToolDef `json:"tools,omitempty"`
}

type zhipuResponse struct {
	Choices []struct {
		Message struct {
			Content   string     `json:"content"`
			ToolCalls []ToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

var zhipuClient = &http.Client{Timeout: 30 * time.Second}

// zhipuKey 智谱 API Key，从环境变量读取（.env / docker-compose 注入）。
func zhipuKey() string { return os.Getenv("ZHIPU_API_KEY") }

// callZhipu 调用智谱 chat completions，返回模型消息。
func callZhipu(messages []Message, tools []ToolDef) (Message, string, error) {
	body, _ := json.Marshal(zhipuRequest{
		Model:    "glm-4-flash",
		Messages: messages,
		Tools:    tools,
	})
	req, err := http.NewRequest(http.MethodPost, zhipuURL, bytes.NewReader(body))
	if err != nil {
		return Message{}, "", err
	}
	req.Header.Set("Authorization", "Bearer "+zhipuKey())
	req.Header.Set("Content-Type", "application/json")

	resp, err := zhipuClient.Do(req)
	if err != nil {
		return Message{}, "", fmt.Errorf("zhipu request failed: %w", err)
	}
	defer resp.Body.Close()

	var out zhipuResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return Message{}, "", fmt.Errorf("zhipu decode failed (status %d): %w", resp.StatusCode, err)
	}
	if out.Error.Message != "" {
		return Message{}, "", fmt.Errorf("zhipu api error: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return Message{}, "", fmt.Errorf("zhipu returned no choices (status %d)", resp.StatusCode)
	}
	c := out.Choices[0]
	msg := Message{Role: "assistant", Content: c.Message.Content, ToolCalls: c.Message.ToolCalls}
	return msg, c.FinishReason, nil
}
