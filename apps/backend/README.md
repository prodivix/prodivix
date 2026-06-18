# @prodivix/backend

Prodivix 的 Go 后端服务（Gin + PostgreSQL），提供鉴权、项目管理、Workspace 同步与 PIR 校验等能力。

## 目录结构

```text
apps/backend
├── cmd/
│   └── server/                # 服务入口
├── internal/
│   ├── app/                   # 应用装配（DI、路由聚合）
│   ├── config/                # 配置加载
│   ├── modules/
│   │   ├── auth/              # 鉴权与会话
│   │   ├── project/           # 项目元数据 + 旧 pirDoc 回退
│   │   ├── workspace/         # Workspace VFS：documents / patch / intent / route manifest / PIR v1.3 校验
│   │   └── integrations/      # 第三方集成（GitHub App 等）
│   └── platform/
│       ├── database/          # PG 连接与迁移
│       └── http/              # 中间件、错误响应、CORS
├── migrations/                # 数据库迁移 SQL
├── server.go                  # 启动入口
├── Dockerfile
├── docker-compose.yml
└── go.mod
```

## 关键能力

- **Workspace 同步协议**：文档 command patch + `workspaceRev/routeRev/contentRev` 乐观并发；详见 `specs/api/workspace-sync.openapi.yaml`、`specs/decisions/07.workspace-sync.md`、`specs/decisions/11.revision-partitioning.md`。
- **PIR v1.3 校验镜像**：`internal/modules/workspace/pir_v13_validator.go` 与前端 `apps/web/src/pir/validator/validator.ts` 对齐（循环 / 孤立节点 / 父子关系）。
- **Intent / Patch 协议**：`POST /api/workspaces/:id/intents` 支持蓝图 / 路由 / 动画意图分发（见 `specs/decisions/12.intent-command-extension.md`）。
- **Capability 协商**：`GET /api/workspaces/:id/capabilities` 控制前端是否启用文档 patch、intent 与高级特性。
- **Workspace 自愈**：旧 legacy project 在首次 `GET` 时会自动补建 workspace 快照。

## 常用命令

```bash
go mod download           # 预拉取 Go modules 依赖
pnpm dev:backend           # go run（普通模式）
pnpm dev:backend:hot       # Air 热重载
pnpm build:backend         # 构建产物
cd apps/backend && go test ./...
cd apps/backend && go fmt ./...
```

## 数据库

- 主库：PostgreSQL
- 迁移由 `migrations/` 管理，启动时按需自动应用
- 本地开发可在 `apps/backend` 下执行 `docker compose up -d` 起 PG
- 默认连接串：`BACKEND_DB_URL=postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable`
