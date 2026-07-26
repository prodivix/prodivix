# Backend API

Prodivix Backend 是一个 Go 服务，负责账号管理、项目元数据、Canonical Workspace persistence、Atomic Commit 和显式发布投影。本页仅说明稳定边界，精确的 request/response 格式以 OpenAPI 和后端代码为准。

## 服务职责

- Auth 与 session
- Project metadata 与 publication projection
- Workspace snapshot、capabilities 和 documents
- 强幂等 WorkspaceOperation commit
- 独立的 Settings commit
- revision conflict 与安全错误 envelope

Project 不保存可回读的 PIR 作者态镜像。Workspace 缺失时，服务端也不会从社区发布投影中进行延迟恢复。

## Atomic WorkspaceOperation

生产环境下的作者写入会提交一个已规划好的 Command 或 Transaction，并携带精确的 revision baseline。服务端在同一个数据库事务中完成 CAS、apply、validator、revision 推进、operation log 和幂等结果的生成。

```text
POST /api/workspaces/{workspaceId}/operations/commit
```

使用同一 operation identity 和相同的 canonical request 进行重试时，会返回首次的结果而不重复应用；若使用相同 identity 但携带不同的 request，则必须拒绝。

Intent 不是 commit wire 中的第三种 operation kind。客户端应先将 Intent 转换为 Command/Transaction，再将 exact request 持久化到 Durable Outbox。

## Revision conflict

Workspace、Route 和 Document revision 冲突使用结构化 `409` 响应。响应仅暴露重新读取和 rebase 所需的安全 metadata，不返回未经授权的正文。客户端获取最新 snapshot 后进行 base/local/remote semantic analysis，并以新的 resolution operation 提交。

## Settings

Settings 使用独立的 commit endpoint 和独立的 durable outbox。选中节点、活动文档等 ephemeral UI 状态不写入服务端作者态。

## 权威契约

- [Workspace Sync OpenAPI](https://github.com/Mdr-Tutorials/prodivix/blob/main/specs/api/workspace-sync.openapi.yaml)
- [Workspace VFS](/concepts/workspace-vfs)
- [Change 与 Sync](/concepts/change-and-sync)
- [诊断码总览](/reference/diagnostic-codes)

## 本地开发

```bash
pnpm dev:backend
```

数据库、CORS 和连接池配置以 `apps/backend` 中的当前配置读取代码和部署环境为准。不要把开发默认值当作生产安全配置，也不要把真实 secret 写入 Workspace project files。
