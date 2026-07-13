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
│   │   ├── workspace/         # Workspace VFS：Atomic Commit / Settings Commit / PIR 校验
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

- **Workspace 同步协议**：作者态写入统一通过强幂等 Atomic WorkspaceOperation Commit；Settings 使用独立的强幂等 Commit。两者都由客户端 durable Outbox 先持久化 exact request，再按 `workspaceRev/routeRev/contentRev` 乐观并发提交。详见 `specs/api/workspace-sync.openapi.yaml`、`specs/decisions/07.workspace-sync.md`、`specs/decisions/11.revision-partitioning.md`。
- **PIR 校验镜像**：`internal/modules/workspace/pir_validator.go` 与前端 `apps/web/src/pir/validator/validator.ts` 对齐（循环 / 孤立节点 / 父子关系）。
- **Hard Cut 写边界**：旧 document `PATCH`、`POST /intents`、Project PIR 读写 API 与 post-commit project mirror 已删除，不保留兼容入口；蓝图、路由、NodeGraph、Animation、Code 与 Resource 的远端作者态写入统一为 WorkspaceOperation。
- **Capability 协商**：`GET /api/workspaces/:id/capabilities` 声明可提交的 command 与 commit contract。
- **发布投影**：社区 PIR 只在显式 publish 时从 canonical Workspace 生成独立 `published_pir_json` 投影，不参与编辑器加载、保存或缺失 Workspace 恢复。
- **原子创建**：fresh project 与 `import-local-project` 都在同一数据库事务内写入 Project metadata、Workspace、Route、Settings 与 Documents；任一步失败都会整体回滚，不使用补偿删除或 lazy bootstrap。

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
- Windows 原生开发脚本读取仓库根目录 `.env.local`；复制 `.env.example` 后修改 `BACKEND_DB_URL`，数据库与后端会使用同一个端口和连接参数
