# The Rock 3D Demo — Datadog Homework

巨石强森 3D 互动 Demo：前端 3D + 两个 Go 后端服务（跨服务调用链）+ Datadog 全链路可观测。

## 架构

```
浏览器 (React + Three.js)
   │
   ▼
rock-3d-backend (:9000)   ── API 层 / 代理
   │  HTTP + Datadog 分布式 trace 上下文传播
   ▼
order-service  (:9100)   ── 商品库存 + 下单业务

datadog-agent  (docker-compose 内) —— 收两个服务的 traces / metrics / logs
```

在 Datadog APM 中可看到 `frontend → rock-3d-backend → order-service` 的完整跨服务 trace。

## 一条命令启动（推荐）

```bash
cp .env.example .env    # 填入 DD_API_KEY
docker compose up --build
# 前端  http://localhost:8080
# 后端  http://localhost:9000
# 订单服务 http://localhost:9100
```

## 本地开发（不用 Docker）

后端 x2（Go 1.26+，两个终端）：

```bash
cd order-service && go run .   # :9100
cd backend && go run .         # :9000（ORDER_SERVICE_URL 默认 localhost:9100）
```

前端（Node 18+）：

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

## API

### rock-3d-backend (:9000)

| Method | Path              | 说明 |
|--------|-------------------|------|
| GET    | /health           | 健康检查 |
| GET    | /api/model        | 模型信息 |
| POST   | /api/action       | 触发动作 `pose` / `flex` / `celebrate`，非法值返回 400 |
| POST   | /api/interaction  | 记录交互 `rotate` / `zoom_in` / `zoom_out` / `reset` |
| GET    | /api/stats        | 内存运行统计 |
| GET    | /api/items        | 商品列表（透传 order-service） |
| POST   | /api/order        | 下单购买（跨服务调用 order-service） |

### order-service (:9100)

| Method | Path     | 说明 |
|--------|----------|------|
| GET    | /health  | 健康检查 |
| GET    | /items   | 商品列表（含实时库存） |
| POST   | /order   | 下单 `{ itemId, quantity }` |

### 业务动作：POST /api/order 的成功 / 失败路径

| 路径 | 状态码 | 响应 |
|------|--------|------|
| ✅ 成功 | 200 | `{ status: "confirmed", orderId: "ord-1001", stockLeft: 48 }` |
| ❌ 商品不存在 | 404 | `{ error: "item not found: xxx" }` |
| ❌ 库存不足 | 409 | `{ error: "insufficient stock: ..." }` |
| ❌ 下游不可用 | 502 | `{ error: "order-service unreachable" }`（backend 代理层） |

内存商品表含 3 个商品，其中「限量联名 T 恤」库存为 1，方便演示库存不足路径。库存重启后重置。

## 结构

```
backend/        服务1 rock-3d-backend：Go net/http，APM tracer + 结构化日志 + 自定义 metrics
order-service/  服务2：商品库存 + 下单，独立 tracer（service=order-service）
frontend/       React + Vite + Three.js；nginx 反代 /api 到 backend
                src/components/OrderPanel.jsx 购买面板（成功/失败可视化）
```

## Datadog 接入点

- 双服务 APM：`httptrace.WrapHandler`（入口 span）+ `httptrace.WrapRoundTripper`（backend → order-service 的出站 span，trace 上下文自动传播）
- 日志：`datadog.LogEntry` 上报官方 JSON 格式；无 DD_API_KEY 时降级为本地日志
- 自定义 metrics：`backend.requests` / `backend.request_latency` / `order.orders`（按 `outcome:confirmed|out_of_stock|not_found` 打 tag）
- docker-compose 内置 `datadog/agent`：APM (`DD_APM_NON_LOCAL_TRAFFIC`) + dogstatsd + 容器日志采集
