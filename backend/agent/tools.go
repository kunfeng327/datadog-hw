package agent

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"datadog-demo/backend/datadog"

	httptrace "gopkg.in/DataDog/dd-trace-go.v1/contrib/net/http"
)

// 商品查询工具：调 order-service GET /items 并按关键词过滤。只读。

// Product order-service 返回的商品结构。
type Product struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
	Usage string  `json:"usage,omitempty"`
}

var orderClient = &http.Client{
	Timeout:   5 * time.Second,
	Transport: httptrace.WrapRoundTripper(http.DefaultTransport),
}

func orderServiceBase() string {
	if v := os.Getenv("ORDER_SERVICE_URL"); v != "" {
		return v
	}
	return "http://localhost:9100"
}

// QueryProducts 唯一的业务工具：关键词检索商品（空关键词返回全部）。
// 只读：仅 GET /items，不触碰订单、不写任何数据。
func QueryProducts(keyword string) ([]Product, error) {
	req, err := http.NewRequest(http.MethodGet, orderServiceBase()+"/items", nil)
	if err != nil {
		return nil, err
	}
	resp, err := orderClient.Do(req)
	if err != nil {
		datadog.Count("agent.tool_calls", 1, "tool:query_products", "outcome:unreachable")
		return nil, err
	}
	defer resp.Body.Close()

	var out struct {
		Items []Product `json:"items"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&out); err != nil {
		datadog.Count("agent.tool_calls", 1, "tool:query_products", "outcome:bad_response")
		return nil, err
	}

	datadog.Count("agent.tool_calls", 1, "tool:query_products", "outcome:ok")

	if keyword == "" {
		return out.Items, nil
	}
	kw := strings.ToLower(keyword)
	var matched []Product
	for _, p := range out.Items {
		if strings.Contains(strings.ToLower(p.Name), kw) ||
			strings.Contains(strings.ToLower(p.ID), kw) {
			matched = append(matched, p)
		}
	}
	return matched, nil
}

// queryProductsTool 暴露给模型的 function schema。
func queryProductsTool() ToolDef {
	var t ToolDef
	t.Type = "function"
	t.Function.Name = "query_products"
	t.Function.Description = "检索商品数据库：按名称或关键词查找商品，返回价格、库存等结构化信息。当用户询问商品价格、用途、库存时必须先调用此工具，禁止凭记忆回答。"
	t.Function.Parameters = map[string]any{
		"type": "object",
		"properties": map[string]any{
			"keyword": map[string]any{
				"type":        "string",
				"description": "商品名称或关键词，例如'手办'、'T恤'；留空返回全部商品",
			},
		},
		"required": []string{"keyword"},
	}
	return t
}
