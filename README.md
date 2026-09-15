# The Rock 3D Demo — Datadog Homework (Phase 1)

巨石强森 3D 互动 Demo。第一阶段：前端 3D + Go 后端 API 完整跑通，暂不接真实 Datadog、无数据库。

## 启动

后端（Go 1.26+）：

```bash
cd backend
go run .
# http://localhost:9000
```

前端（Node 18+）：

```bash
cd frontend
npm install
npm run dev
# http://localhost:5173
```

## API

| Method | Path              | 说明 |
|--------|-------------------|------|
| GET    | /health           | 健康检查 |
| GET    | /api/model        | 模型信息 |
| POST   | /api/action       | 触发动作 `pose` / `flex` / `celebrate`，非法值返回 400 |
| POST   | /api/interaction  | 记录交互 `rotate` / `zoom_in` / `zoom_out` / `reset` |
| GET    | /api/stats        | 内存运行统计 |

统计使用 `sync/atomic`，线程安全，重启后重置。

## 结构

```
backend/   Go net/http，handlers/ 分文件，含请求日志中间件（method path status latency）
frontend/  React + Vite + Three.js (@react-three/fiber + drei)
           src/components/RockModel.jsx 为独立占位模型，日后可整体替换为 .glb
           src/api/client.js 统一封装 fetch（含前端 latency 计时）
```

## 为 Datadog 预留的挂载点（datadog-integration 分支已真实接入）

后端（无 Agent 时自动降级，本地开发零依赖）：

- `backend/observability/observability.go` — 集中封装 APM tracer（dd-trace-go）、DogStatsD 客户端、JSON 结构化日志
- `backend/handlers/routes.go` — 每个路由一个 APM span（`http.request`），日志含 `trace_id`/`span_id`/`duration_ms`/`http.status_code`
- 业务自定义 metrics：`rock.views` / `rock.actions`（tag: action）/ `rock.interactions`（tag: type）/ `rock.errors`（tag: type）
- 请求级 metrics：`request.count` / `request.latency_ms` / `request.errors`

前端（`@datadog/browser-rum`）：

- `frontend/src/api/rum.js` — RUM 初始化（env 变量控制）+ `rumAction`/`rumError`
- 3D 交互自定义事件：`model.rotate` / `model.zoom` / `model.reset` / `model.action`
- `client.js` 中每个 API 请求自动上报 `api.request`（path/status/latency）与错误

### 启用真实 Datadog

后端（需运行 Datadog Agent，或使用 `DD_AGENT_URL` 指向网关）：

```bash
DD_SERVICE=rock-demo-api DD_ENV=prod DD_AGENT_HOST=<agent-host> go run .
```

前端（`frontend/.env.local`，需在 Datadog 创建 RUM Application）：

```
VITE_DD_RUM_APP_ID=<application id>
VITE_DD_RUM_CLIENT_TOKEN=<client token>
VITE_DD_SITE=datadoghq.com
```
