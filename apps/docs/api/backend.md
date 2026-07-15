# Backend API

Prodivix Backend 是 Go 服务，负责账号、项目元数据、Canonical Workspace persistence、Atomic Commit 与显式发布投影。本页只说明稳定边界；精确 request/response 以 OpenAPI 和后端代码为准。

## 服务职责

- Auth 与 session
- Project metadata 与 publication projection
- Workspace snapshot、capabilities 和 documents
- 强幂等 WorkspaceOperation commit
- 独立的 Settings commit
- revision conflict 与安全错误 envelope

Project 不保存可回读的 PIR 作者态镜像。Workspace 缺失时，服务端也不会从社区发布投影懒恢复。

## Atomic WorkspaceOperation

生产作者写入提交一个已规划好的 Command 或 Transaction，并携带精确 revision baseline。服务端在同一数据库事务中完成 CAS、apply、validator、revision 推进、operation log 与幂等结果。

```text
POST /api/workspaces/{workspaceId}/operations/commit
```

同一 operation identity 与相同 canonical request 重试，会返回首次结果而不重复应用；相同 identity 携带不同 request 必须拒绝。

Intent 不是 commit wire 的第三种 operation kind。客户端先把 Intent 转成 Command/Transaction，再持久化 exact request 到 Durable Outbox。

## Revision conflict

Workspace、Route 与 Document revision 使用结构化 `409`。响应只暴露重新读取和 rebase 所需的安全 metadata，不返回未授权正文。客户端获取最新 snapshot 后进行 base/local/remote semantic analysis，并以新的 resolution operation 提交。

## Settings

Settings 使用独立 commit endpoint 与独立 durable outbox。选择节点、活动文档等 ephemeral UI 状态不写入服务端作者态。

## 权威契约

- [Workspace Sync OpenAPI](https://github.com/Mdr-Tutorials/prodivix/blob/main/specs/api/workspace-sync.openapi.yaml)
- [Workspace VFS](/concepts/workspace-vfs)
- [Change 与 Sync](/concepts/change-and-sync)
- [诊断码总览](/reference/diagnostic-codes)

## 本地开发

```bash
pnpm dev:backend
```

数据库、CORS 与连接池配置以 `apps/backend` 的当前配置读取代码和部署环境为准。不要把开发默认值当成生产安全配置，也不要把真实 secret 写进 Workspace project files。
