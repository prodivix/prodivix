# PIR v1.3 Graph-Only + Command PATCH Implementation Plan

## 状态

- Draft
- 日期：2026-05-02
- 适用范围：前端 `apps/web`、后端 `apps/backend`、AI 输出协议、Workspace Sync API
- 关联：
  - `specs/pir/pir-contract-v1.3.md`
  - `specs/pir/PIR-v1.3.json`
  - `specs/api/workspace-sync.openapi.yaml`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/11.revision-partitioning.md`
  - `specs/decisions/12.intent-command-extension.md`
  - `specs/decisions/22.llm-integration-architecture.md`

## 1. 最终目标

将编辑器从 v1.0-v1.2 的 `ui.root` 嵌套树和整文档 PUT 模式，完整迁移到 v1.3 的 `ui.graph` 唯一真相源和 command PATCH 模式。

最终状态：

1. 保存态 PIR 只允许 `version: "1.3"` 和 `ui.graph`。
2. 前端 store 不保存、不派生长期 `ui.root`。
3. 渲染、预览、代码生成只在入口临时调用 `materializeUiTree(ui.graph)`。
4. 所有编辑写入通过 graph helper 产生 command，command 持有 `forwardOps/reverseOps`。
5. 前端本地 apply、undo/redo、autosave 和 AI apply 使用同一套受限 JSON Patch 语义。
6. 后端废弃整文档 `PUT` 保存；新建文档由 create/init 流程写入默认 v1.3 模板。
7. 后端 `PATCH` 是文档内容变更的唯一入口，真正执行 command 的 `forwardOps`，校验 revision、path 白名单和 PIR v1.3 graph 语义后落库。
8. 旧项目作废；不保留 `ui.root` 运行态或自动转换入口。

## 2. 非目标

1. 不实现 CRDT。
2. 不保留 `ui.root` / `ui.graph` 双真相源。
3. 不要求 v1.3 导出回 v1.2。
4. 不把 workspace tree、route manifest、logic graph、animation timeline 塞进 `ui.graph`。
5. 不一次性实现完整 AI agent 平台；本轮只把 command schema、dry-run、path 白名单和 validator 边界准备好。

## 3. PIR v1.3 数据合同

核心形态：

```ts
export type NodeId = string;

export type ComponentNodeData = Omit<ComponentNode, 'children'>;

export type UiGraph = {
  version: 1;
  rootId: NodeId;
  nodesById: Record<NodeId, ComponentNodeData>;
  childIdsById: Record<NodeId, NodeId[]>;
  regionsById?: Record<NodeId, Record<string, NodeId[]>>;
};

export interface PIRDocument {
  version: '1.3';
  metadata?: PIRMetadata;
  ui: { graph: UiGraph };
  logic?: LogicDefinition;
  animation?: AnimationDefinition;
}
```

长期不变量：

1. `nodesById` 只表达节点身份和字段，不表达顺序。
2. `childIdsById` 表达默认 children 区域的有序结构。
3. `regionsById` 表达 slot、layout region、trigger/content、fallback 等具名区域。
4. 一个可渲染节点在同一文档内只能拥有一个结构父级位置。
5. 字段级 PATCH path 永远落到 `/ui/graph/...`，不出现 `/ui/root/...`。
6. `materializeUiTree` 是读模型，不是保存模型。

## 4. 前端实施计划

### 4.1 类型与 PIR 核心工具

修改：

- `apps/web/src/core/types/engine.types.ts`
- `apps/web/src/pir/resolvePirDocument.ts`

新增建议：

- `apps/web/src/pir/graph/types.ts`
- `apps/web/src/pir/graph/materialize.ts`
- `apps/web/src/pir/graph/normalize.ts`
- `apps/web/src/pir/graph/mutations.ts`
- `apps/web/src/pir/graph/jsonPatch.ts`

必须提供：

```ts
createDefaultPirDocV13(): PIRDocument
materializeUiTree(graph: UiGraph): ComponentNode
parsePirDocumentV13(source: unknown): PirParseResult<PIRDocument>
validateUiGraph(graph: UiGraph): PirDiagnostic[]
applyPirPatch(doc: PIRDocument, ops: PatchOp[]): PatchApplyResult<PIRDocument>
invertGraphMutation(...): PatchOp[]
```

Hard cutover 规则：

1. `resolvePirDocument` 和 `parsePirDocumentV13` 只接受 v1.3 graph-only。
2. 输入中发现旧 `ui.root` 时返回 retired/invalid PIR 结构化错误，不自动转换为 `ui.graph`。
3. 前端类型层面移除 `PIRDocument.ui.root`。
4. 需要树形结构的函数必须改为 graph-native；仅允许纯函数接收显式 `ComponentNode` 作为渲染输入，不得从保存态 `doc.ui.root` 读取。

### 4.2 Graph Helper 能力

`mutations.ts` 需要覆盖 Blueprint 的全部结构操作：

```ts
getNode(graph, nodeId)
getChildren(graph, parentId)
getRegions(graph, parentId)
getParentMap(graph)
getNodePath(graph, nodeId)
updateNode(graph, nodeId, updater)
insertNode(graph, parentId, node, index?)
insertNodeIntoRegion(graph, parentId, regionName, node, index?)
removeNode(graph, nodeId)
moveNode(graph, nodeId, targetParentId, index)
moveNodeToRegion(graph, nodeId, targetParentId, regionName, index)
renameNodeId(graph, fromId, toId)
cloneSubtree(graph, rootId, idFactory)
```

每个写 helper 必须同时支持两种用法：

1. 返回新 graph，供本地 store 立即更新。
2. 返回 `forwardOps/reverseOps`，供 command history、autosave PATCH、AI apply 复用。

### 4.3 Store 与 Command History

修改：

- `apps/web/src/editor/store/useEditorStore.ts`
- `apps/web/src/editor/store/editorStore.normalizers.ts`
- `apps/web/src/editor/store/editorStore.tree.ts`
- `apps/web/src/editor/store/editorStore.routeIntent.ts`

目标：

1. Store 不暴露 `pirDoc`、`setPirDoc`、`updatePirDoc`。
2. Active PIR 只能从 workspace document 派生。
3. 新增 `dispatchCommand(command)`，本地先 dry-run patch，再 apply，再入历史栈和 outbox。
4. undo/redo 读取 command history 的 `reverseOps/forwardOps`，不直接调用树编辑函数。

推荐 store API：

```ts
dispatchPirCommand(command: WorkspaceCommandEnvelope): CommandApplyResult
updateNode(nodeId, updater): CommandApplyResult
insertNode(parentId, node, index?): CommandApplyResult
removeNode(nodeId): CommandApplyResult
moveNode(nodeId, targetParentId, index): CommandApplyResult
renameNodeId(fromId, toId): CommandApplyResult
```

禁止：

1. 新代码访问 `pirDoc.ui.root`。
2. 新测试 fixture 写 `{ ui: { root } }`。
3. 任何内容变更通过整份 PIR 覆盖服务端。

### 4.4 Renderer / Preview / Generator

修改：

- `apps/web/src/pir/renderer/PIRRenderer.tsx`
- `apps/web/src/pir/generator/core/canonicalIR.ts`
- `apps/web/src/pir/generator/pirToCode.ts`
- `apps/web/src/pir/generator/react/compileComponent.ts`
- `apps/web/src/community/CommunityDetailPage.tsx`
- Blueprint canvas、动画预览、社区预览等入口

策略：

1. `PIRRenderer` 接收 `PIRDocument` 时在组件边界 materialize。
2. 低层递归渲染组件可以继续接收 `ComponentNode`。
3. Generator 入口统一：

```ts
const root = materializeUiTree(pirDoc.ui.graph);
const canonical = buildCanonicalIRFromRoot(root, pirDoc, bag);
```

4. 代码生成器不直接遍历 `nodesById`，避免生成逻辑与存储形态过度耦合。
5. materialize 失败时展示 validator diagnostics，不生成不完整树。

### 4.5 Blueprint / Inspector / DragDrop

修改重点：

- `apps/web/src/editor/features/design/blueprint/editor/controller/useBlueprintEditorController.ts`
- `apps/web/src/editor/features/design/blueprint/editor/controller/useBlueprintEditorInspectorController.ts`
- `apps/web/src/editor/features/design/blueprint/editor/model/dragdrop.ts`
- `apps/web/src/editor/features/design/blueprint/editor/model/tree.ts`
- `apps/web/src/editor/features/design/blueprint/editor/model/palette.ts`
- `apps/web/src/editor/features/design/blueprint/editor/components/ComponentTree/*`
- `apps/web/src/editor/features/design/inspector/**/*`

改造方式：

1. 查节点：`graph.nodesById[nodeId]`。
2. 查 children：`graph.childIdsById[parentId]`。
3. 查父级：使用 helper 构建 parent map。
4. 节点字段编辑：只 patch `/ui/graph/nodesById/{nodeId}/...`。
5. 插入、删除、移动：只 patch `nodesById`、`childIdsById`、`regionsById`。
6. 复制 subtree：先在 graph 上生成新 id，再批量 add nodes 和 child links。
7. 删除节点时同步清理 animation binding、list emptyNodeId 等引用，或让 validator 阻止删除。

### 4.6 Autosave 与 Outbox

修改：

- `apps/web/src/editor/features/design/blueprint/editor/model/autosave.ts`
- `apps/web/src/editor/editorApi.ts`

最终同步模型：

1. 本地每次 graph 写操作生成 command。
2. command 进入 pending outbox。
3. autosave 只发送 `PATCH /documents/{documentId}`。
4. `PATCH` request 必须携带 `expectedContentRev`。
5. pending commands 过多时做本地 command squash，仍然输出一个可逆 command，不发送整文档保存。
6. 服务端要求重基时，前端拉取最新 snapshot 后重放 pending commands；无法重放则暂停 outbox。

冲突处理：

1. `409 DOCUMENT_CONFLICT` 时拉取最新 workspace snapshot。
2. 如果本地 pending command 都能在最新 doc 上 dry-run 且 validator 通过，则重放 pending command。
3. 重放失败时暂停 outbox，提示用户处理冲突。

### 4.7 前端 Validator

修改：

- `apps/web/src/pir/validator/validator.ts`

必须校验：

1. `version === "1.3"`。
2. `ui.graph` 必填。
3. 禁止 `ui.root`。
4. `rootId` 存在于 `nodesById`。
5. `nodesById` key 等于节点内部 `id`。
6. `childIdsById` 和 `regionsById` 的 owner id 存在。
7. `childIdsById` 和 `regionsById` 引用的 child id 存在。
8. 无环。
9. 无重复父级位置。
10. 默认无孤儿节点。
11. `list.emptyNodeId` 存在。
12. `animation.timelines[*].bindings[*].targetNodeId` 存在。

诊断要使用稳定 code 和 JSON Pointer path，方便后端、AI repair loop、UI 面板复用。

### 4.8 AI 与 LLM Command

修改：

- `packages/shared/src/llm/types.ts`
- `packages/ai/src/validation/validateStructuredOutput.ts`
- `apps/web/src/editor/features/design/blueprint/editor/components/Assistant/*`

目标：

1. `LlmPirCommandBatch.commands` 从 `unknown[]` 收紧到 `CommandEnvelope[]` 或 PIR command union。
2. command path 白名单只允许：
   - `/ui/graph/...`
   - `/logic/...`
   - `/animation/...`
   - `/metadata/...`
   - `/x-*`
3. 明确禁止 `/ui/root/...` 和根路径 `/`。
4. AI apply 前必须 dry-run patch、运行 validator、展示 diff。
5. LLM 可以读取 materialized subtree，但写入只能返回 command/patch。

## 5. 后端实施计划

### 5.1 API 路由

修改：

- `apps/backend/internal/modules/workspace/routes.go`
- `apps/backend/internal/modules/workspace/handlers.go`
- `specs/api/workspace-sync.openapi.yaml`

必须删除或禁用旧整文档保存入口：

```http
PUT /api/workspaces/{workspaceId}/documents/{documentId}
```

策略：移除前端调用；后端删除路由，或在同一迁移批次中禁用并返回 `410 Gone` / `405 Method Not Allowed`。PIR v1.3 不允许整文档保存作为正常同步路径。

保留/新增唯一写入口：

```http
PATCH /api/workspaces/{workspaceId}/documents/{documentId}
```

用途：对指定文档执行一个 command patch。

请求：

```json
{
  "expectedContentRev": 3,
  "command": {
    "id": "cmd_1",
    "namespace": "core.pir",
    "type": "node.updateProps",
    "version": "1.0",
    "issuedAt": "2026-05-02T10:00:00Z",
    "forwardOps": [
      {
        "op": "replace",
        "path": "/ui/graph/nodesById/title-1/props/text",
        "value": "Hello"
      }
    ],
    "reverseOps": [
      {
        "op": "replace",
        "path": "/ui/graph/nodesById/title-1/props/text",
        "value": "Old"
      }
    ],
    "target": {
      "workspaceId": "ws_1",
      "documentId": "doc_home"
    }
  },
  "clientMutationId": "mut_1"
}
```

响应沿用 `MutationSuccessResponse`。

### 5.2 Store 事务

修改：

- `apps/backend/internal/modules/workspace/store.go`

新增：

```go
type PatchDocumentContentParams struct {
    WorkspaceID        string
    DocumentID         string
    ExpectedContentRev int64
    Command            WorkspaceCommandEnvelope
    ClientMutationID   string
}

func (store *WorkspaceStore) PatchDocumentContent(
    ctx context.Context,
    params PatchDocumentContentParams,
) (*WorkspaceMutationResult, error)
```

事务流程：

```txt
BEGIN
  SELECT workspace + document row FOR UPDATE
  check workspace/document existence
  check expectedContentRev
  validate command envelope shape
  validate command.target.workspaceId/documentId matches route
  validate forwardOps/reverseOps are non-empty for mutating command
  validate patch path whitelist
  apply forwardOps to current content_json
  validate patched PIR v1.3 schema/semantics
  verify reverseOps can apply to patched document and returns original hash
  UPDATE workspace_documents.content_json/content_rev
  UPDATE workspaces.op_seq
  INSERT workspace_operations(command, domain, target, rev metadata)
COMMIT
```

失败策略：

1. revision 不匹配返回 `409` + `WKS-4003`。
2. command 或 patch shape 错误返回 `422` + `API-1001`。
3. path 禁止返回 `422` + `WKS-5002`。
4. PIR 语义错误返回 `422` + `PIR-4001`，并在 `error.diagnostics` 中返回具体 `PIR-xxxx`。
5. reverseOps 无法回放必须拒绝本次 PATCH，避免不可撤销 command 入库。

### 5.3 JSON Patch Runtime

新增：

- `apps/backend/internal/modules/workspace/patch.go`
- `apps/backend/internal/modules/workspace/patch_test.go`

支持受限 JSON Patch：

1. `add`
2. `remove`
3. `replace`
4. `move`
5. `copy`
6. `test`

JSON Pointer 规则：

1. `/` 分隔路径。
2. `~0` 解码为 `~`。
3. `~1` 解码为 `/`。
4. 数组 index 必须是十进制非负整数。
5. 数组 `-` 只允许 `add`。

路径白名单：

```txt
/ui/graph
/logic
/animation
/metadata
/x-*
```

禁止：

```txt
/ui/root
/
```

运行时规则：

1. `replace/remove/test` 目标必须存在。
2. `add` 对 object 可新增 key，对 array 可插入 index。
3. `move/copy` 的 `from` 必须存在。
4. `test` 使用 JSON deep equal。
5. apply 必须是纯函数，不修改原始 JSON buffer。
6. patch 后重新 marshal 成规范 JSON 再存储。

### 5.4 PIR v1.3 后端校验

新增：

- `apps/backend/internal/modules/workspace/pir_v13_validator.go`
- `apps/backend/internal/modules/workspace/pir_v13_validator_test.go`

后端 validator 与前端保持同一语义：

1. `version === "1.3"`。
2. `ui.graph` 必填。
3. 禁止 `ui.root`。
4. `rootId` 存在。
5. key/id 一致。
6. child/region owner 存在。
7. child/region 引用存在。
8. 无环。
9. 无重复父级。
10. 无孤儿。
11. animation/list 引用存在。

错误返回：

```json
{
  "error": {
    "code": "PIR-4001",
    "message": "PIR validation failed.",
    "diagnostics": [
      {
        "code": "PIR-2003",
        "path": "/ui/graph/childIdsById/root/0",
        "message": "Child node id does not exist in nodesById."
      }
    ]
  }
}
```

### 5.5 废弃整文档保存

需要移除或禁用：

- `SaveDocumentContent`
- `SaveProjectPIR`

调整：

1. 前端删除 `saveWorkspaceDocument` 的内容保存调用。
2. 后端 `SaveDocumentContent` 不再作为 API 写入口；若内部测试仍需要初始化文档，改为专用 seed/create helper。
3. 后端 `SaveProjectPIR` 不再接受编辑器 autosave 调用。
4. 带整份 PIR 的保存请求返回结构化错误，提示使用 command PATCH。
5. legacy project pir 读取时返回 retired single-PIR 结构化错误；不在运行态自动重建为默认 v1.3 文档。

### 5.6 Operation Log 与 Undo/Redo

现有 `workspace_operations` 继续作为 command log。

新增要求：

1. PATCH 成功后记录完整 command。
2. `commandDomain(command)` 继续使用 `namespace.type@version`。
3. `forwardOps/reverseOps` 对 mutating command 不允许为空。
4. operation log 记录 apply 前后的 contentRev，方便审计和回放。
5. 后续 undo/redo 可以直接读取 reverseOps 生成新的 PATCH command。

## 6. 前后端协议边界

### 6.1 Command 命名建议

首批核心 PIR command：

```txt
core.pir.node.insert@1.0
core.pir.node.remove@1.0
core.pir.node.move@1.0
core.pir.node.rename@1.0
core.pir.node.update@1.0
core.pir.node.updateProps@1.0
core.pir.node.updateStyle@1.0
core.pir.region.insert@1.0
core.pir.region.move@1.0
core.pir.animation.binding.cleanup@1.0
```

### 6.2 Batch

`ApplyBatchRequest` 应增加 `patchDocument` operation：

```ts
{
  op: 'patchDocument';
  documentId: string;
  expectedContentRev: number;
  command: CommandEnvelope;
}
```

执行规则：

1. batch 内 operation 按顺序执行。
2. 同一文档多个 patch 必须在事务内逐个推进 contentRev。
3. 任意 operation 失败则整批回滚。
4. batch 不绕过 PATCH validator。

## 7. 测试计划

### 7.1 前端测试

需要覆盖：

1. 默认文档是 v1.3 graph-only。
2. 旧 `ui.root` 输入返回 retired/invalid PIR 结构化错误。
3. `materializeUiTree` 输出与预期树一致。
4. graph helper 的 insert/remove/move/rename/update 保持 graph 一致。
5. validator 能发现 root 缺失、child 缺失、环、孤儿、重复父级。
6. renderer/generator 能消费 v1.3。
7. autosave 只发送 PATCH command，不发送整份 PIR。
8. AI command dry-run 禁止 `/ui/root`。

旧断言替换：

```ts
// old
pirDoc.ui.root.children?.[0];

// new
const firstId = pirDoc.ui.graph.childIdsById[pirDoc.ui.graph.rootId]?.[0];
const firstNode = firstId ? pirDoc.ui.graph.nodesById[firstId] : undefined;
```

### 7.2 后端测试

必须覆盖：

1. PATCH 成功更新单字段。
2. PATCH 成功移动节点顺序。
3. PATCH 成功插入和删除 subtree。
4. `expectedContentRev` 冲突。
5. 禁止 `/ui/root`。
6. 禁止根路径 `/` 替换。
7. child id 不存在返回 PIR validation error。
8. 环检测。
9. reverseOps 无法把 patched doc 回放成 original 时拒绝。
10. 整文档保存路由被删除或返回 `410 Gone` / `405 Method Not Allowed`。
11. batch patch 任意一步失败时整批回滚。

## 8. 落地顺序

### Gate A：合同冻结

1. 完成 `PIR-v1.3.json`。
2. 完成 `workspace-sync.openapi.yaml` PATCH 合同。
3. 完成前后端 implementation plan。

验收：

- specs 格式化通过。
- JSON schema 可被解析。
- OpenAPI YAML 可被解析。

### Gate B：前端 graph-only 基础

1. 类型切到 v1.3。
2. 实现 graph parse/materialize/mutations/jsonPatch。
3. store 保存 graph-only。
4. renderer/generator 入口 materialize。

验收：

- `pnpm --filter @prodivix/web typecheck` 通过。
- 默认新建文档不含 `ui.root`。
- validator 拒绝 `ui.root`。

### Gate C：Blueprint/Inspector 完整改造

1. Blueprint 增删改移全部写 graph helper。
2. Inspector 字段编辑产生 command。
3. DragDrop 产生 move command。
4. tests/fixtures 改为 v1.3。

验收：

- Blueprint 常用工作流可用。
- 主要 Blueprint/Inspector 测试通过。
- autosave 不再调用整文档保存 API。

### Gate D：后端 PATCH

1. 后端 validator 接受 v1.3、拒绝 `ui.root`。
2. JSON Patch runtime 完成。
3. PATCH document API 完成。
4. operation log 记录 command。

验收：

- 后端 Go 测试通过。
- PATCH 和文档创建初始化都跑 PIR v1.3 validator。
- PATCH 可执行字段更新和节点移动。

### Gate E：前端同步与 AI

1. autosave 接 PATCH outbox。
2. conflict rebase 初版完成。
3. LLM command schema 收紧。
4. AI apply 使用 dry-run + validator。

验收：

- 前端 PATCH 能与后端 contentRev 对齐。
- LLM 输出无法写 `/ui/root`。
- command 可本地撤销并可服务端回放。

## 9. 完成标准

本迁移完成后，仓库中生产代码不应再出现长期依赖：

```txt
pirDoc.ui.root
{ ui: { root: ... } }
```

允许出现的位置仅限：

1. 文档中说明旧格式。
2. validator 中的拒绝逻辑。
3. retired single-PIR 错误测试。

最终检查：

1. `pnpm run format`
2. `pnpm --filter @prodivix/web typecheck`
3. 前端相关测试。
4. 后端 workspace module Go tests。
5. 搜索确认生产路径无 `pirDoc.ui.root`。
