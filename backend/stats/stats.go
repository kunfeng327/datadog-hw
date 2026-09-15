// Package stats 维护运行期间的内存统计数据。
// 线程安全，全部通过 atomic 操作，无锁。
// 后续接入 Datadog 时，可以在这里的 Inc* 方法内上报自定义 metrics。
package stats

import "sync/atomic"

type Counters struct {
	// totalRequests: 处理的总请求数（不含 /health）
	TotalRequests atomic.Int64
	// Views: 页面 / model 查询次数
	Views atomic.Int64
	// Interactions: 交互次数（action 之外的用户交互，如 rotate/zoom/reset）
	Interactions atomic.Int64
	// Actions: action 触发次数
	Actions atomic.Int64
	// Errors: 处理中产生的错误次数（如非法 action 返回 400）
	Errors atomic.Int64
}

var global Counters

// Get 返回全局统计的快照。
func Get() (views, interactions, actions, errors, total int64) {
	return global.Views.Load(),
		global.Interactions.Load(),
		global.Actions.Load(),
		global.Errors.Load(),
		global.TotalRequests.Load()
}

func IncTotalRequests() { global.TotalRequests.Add(1) }
func IncViews()         { global.Views.Add(1) }
func IncInteractions()  { global.Interactions.Add(1) }
func IncActions()       { global.Actions.Add(1) }
func IncErrors()        { global.Errors.Add(1) }
