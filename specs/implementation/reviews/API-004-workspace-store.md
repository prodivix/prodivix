# API-004 评审记录：Workspace 数据表与仓储层

## 状态

- Completed
- 日期：2026-02-08
- 关联任务：`API-004`
- 关联实现：
  - `apps/backend/database.go`
  - `apps/backend/workspace_store.go`
  - `apps/backend/workspace_store_test.go`

## 目标

完成 workspace 后端基础数据层：DDL + DAO + 单测，为 `API-005` 接口实现提供持久化与并发控制能力。

## DDL 结果

新增表：

1. `workspaces`
2. `workspace_routes`
3. `workspace_documents`
4. `workspace_operations`

关键约束：

1. `workspace_rev/route_rev/op_seq` 均为正 JSON safe integer
2. `workspace_documents.doc_type` 限定为：
   - `pir-page`
   - `pir-layout`
   - `pir-component`
   - `pir-graph`
   - `pir-animation`
3. 文档唯一索引：`(workspace_id, path)`
4. 操作序列主键：`(workspace_id, op_seq)`

## DAO 结果

新增 `WorkspaceStore`，核心能力：

1. 当时的 `CreateWorkspace` + `CreateDocument` 两阶段 bootstrap 已 Hard Cut；当前由 `ImportWorkspaceSnapshot` 在一个数据库事务中创建 workspace、route 与至少一份 document。
2. `GetSnapshotForOwner`：读取并验证 workspace + route + documents 快照。
3. 历史整文档保存方法：仅提升文档 `contentRev`，并提升 `opSeq`；后续已由 command patch 写入路径取代并删除。
4. `SaveRouteManifest`：结构事务提升 `workspaceRev/routeRev/opSeq`。

并发错误模型：

1. `WorkspaceRevisionConflictError`
2. `DOCUMENT_CONFLICT`
3. `WORKSPACE_CONFLICT`
4. `ROUTE_CONFLICT`

## 验收点检查

验收项：文档内容更新不误增无关分区 rev

覆盖方式：

1. 历史单测覆盖整文档保存时的分区 rev 行为。
2. 当时断言整文档保存后 `workspaceRev/routeRev` 保持不变，仅 `contentRev/opSeq` 变化；当前实现已迁移到 `PatchDocumentContent`。

## 测试记录

执行命令：

```powershell
go test ./...
```

执行目录：

```txt
apps/backend
```

结果：

```txt
ok  	github.com/Prodivix/prodivix/apps/backend	0.159s
```

## 风险与后续

1. 当前仅完成数据层，接口编排与错误映射在 `API-005` 落地
2. `workspace_operations.payload_json` 暂为通用 JSON，后续与 command envelope 做严格 schema 对齐
