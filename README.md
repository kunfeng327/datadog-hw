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

## 为 Datadog 预留的挂载点

- `backend/handlers/routes.go` — `withLogging` 中间件已输出 `POST /api/action status=200 latency=35ms` 格式日志，后续在此接入 Datadog logs / traces / metrics
- `backend/handlers/common.go` — `writeJSON` / `writeError` 是统一的响应与错误出口，适合加 error tracking
- `backend/stats/stats.go` — 所有自定义计数的唯一入口，可在此上报 custom metrics
- `frontend/src/api/client.js` — 所有请求统一走这里，已测量 latency，后续可加 RUM / tracing
