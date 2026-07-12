# PIR File Tree Workflow Implementation Plan

## 状态

- Draft
- 日期：2026-05-10
- 适用范围：
  - `apps/web/src/workspace`
  - `apps/web/src/editor/store`
  - `apps/web/src/editor/features/export`
  - `apps/web/src/infra/git`
  - `apps/backend/internal/modules/workspace`
- 关联：
  - `specs/implementation/stable-workspace-command-diff-architecture.md`
  - `specs/implementation/workspace-refactor-plan.md`
  - `specs/workspace/workspace-model.md`
  - `specs/pir/pir-contract-v1.3.md`
  - `specs/router/route-manifest.md`

## 1. 问题陈述

当前工程已经有 Workspace API、`workspaceDocumentsById`、`treeById`、`activeDocumentId` 等结构，但主编辑链路仍然围绕单个 `pirDoc` 工作。

实际状态：

```txt
workspaceDocumentsById + treeById
  -> activeDocumentId
  -> pirDoc
  -> Blueprint / NodeGraph / Animation / Export 继续读取 pirDoc
```

这导致用户在做项目时仍然感知为：

```txt
Project = one PIR document
```

目标是将项目工作方式切换为：

```txt
Project = Workspace PIR file tree
```

也就是：

```txt
WorkspaceSnapshot
  treeById
  docsById
  routeManifest
  activeDocumentId
```

成为编辑器、Git、diff、export、undo/redo 的共同基础。

## 2. 最终目标

### 2.1 用户心智

用户不需要直接操作文件树，但系统应围绕文件树工作。

用户看到：

1. 页面。
2. 布局。
3. 组件。
4. 路由。
5. 节点图。
6. 动画。
7. 代码文件。

系统内部维护：

1. PIR 文件树。
2. 文档身份。
3. 文档路径。
4. 路由到文档的引用。
5. Git 文件投影。

### 2.2 保存形态

Prodivix 项目源文件树固定为：

```txt
.prodivix/
  workspace.json
  route-manifest.json
  documents/
    pages/
      home.pir.json
    layouts/
      root-layout.pir.json
    components/
    graphs/
    animations/
    code/
    assets/
    config/
```

### 2.3 编辑器形态

编辑器不再把 `pirDoc` 作为项目根状态。

目标状态：

```txt
useEditorStore
  workspace
  activeDocumentId
  selectors
  applyCommand
```

不暴露：

```txt
pirDoc
setPirDoc
updatePirDoc
```

## 3. 非目标

本计划不做：

1. 用户可自由拖拽的文件树管理器。
2. 完整 Git provider UI。
3. 完整 undo/redo 实现。
4. 完整 Prodivix diff UI。
5. NodeGraph/Animation 完整编辑器重构。
6. 旧 PIR 多版本兼容运行态。
7. 旧单 PIR 项目迁移。

本计划只解决：

1. PIR 文件树成为真实、可读写、可投影的工作基础。
2. 新项目只使用 Workspace。
3. 旧项目直接舍弃，不进入兼容或迁移承诺。
4. 单 `pirDoc` 作为项目根状态被删除。

## 4. Hard Cutover 决策

当前项目仍处于初期开发阶段，因此采用破坏性切换。

决策：

```txt
Old project = retired
New project = workspace-only
Project editing source of truth = WorkspaceSnapshot
PIR = WorkspaceDocument.content
```

规则：

1. 不实现旧单 PIR 项目自动迁移。
2. 不实现 `projects.pir_json -> workspace` 兼容导入。
3. 不保留 project PIR 作为编辑器回退。
4. 新建项目必须创建 workspace 文件树。
5. 打开旧项目时返回明确错误，提示创建新 workspace 项目。
6. `GET /projects/:id/pir` 不再属于编辑器主链路。
7. `saveProjectPir` 从前端编辑器链路删除。
8. `projects.pir_json` 不属于 workspace-only 编辑合同；物理删除前也不得参与编辑读写。

## 5. 核心原则

### 5.1 DocumentId 是身份

文档身份永远是 `document.id`。

路径只是派生属性：

```txt
DocumentId != path
```

重命名或移动文档不得改变 `DocumentId`。

### 5.2 VFS 是内部模型

用户不直接编辑：

```txt
treeById
docsById
WorkspaceDocument.path
```

用户操作通过页面、布局、组件、路由等概念触发系统命令。

### 5.3 Git 文件树是投影

`.prodivix/**` 是 Workspace 的 Git 投影，不是编辑器内部唯一数据结构。

```txt
WorkspaceSnapshot -> .prodivix/** files
.prodivix/** files -> WorkspaceSnapshot
```

二者必须 round-trip 保持稳定身份。

### 5.4 PIR 仍然只负责单文档 UI 图

PIR 文档不负责：

1. 路由树。
2. Workspace 文件树。
3. Git 路径。
4. 多页面关系。
5. 多文档撤销栈。

PIR 文档只负责本 document 内部的 `ui.graph`、`logic`、`animation` 等内容。

## 6. 文件树格式

### 6.1 `.prodivix/workspace.json`

保存 Workspace 元数据和 VFS。

建议结构：

```json
{
  "version": "1",
  "workspace": {
    "id": "ws_1",
    "name": "My Project",
    "workspaceRev": 12,
    "routeRev": 4,
    "opSeq": 40
  },
  "treeRootId": "root",
  "treeById": {
    "root": {
      "id": "root",
      "kind": "dir",
      "name": "/",
      "parentId": null,
      "children": ["pages", "layouts"]
    },
    "pages": {
      "id": "pages",
      "kind": "dir",
      "name": "pages",
      "parentId": "root",
      "children": ["doc_home"]
    },
    "doc_home": {
      "id": "doc_home",
      "kind": "doc",
      "name": "home.pir.json",
      "parentId": "pages",
      "docId": "page_home"
    }
  },
  "documents": {
    "page_home": {
      "id": "page_home",
      "type": "pir-page",
      "name": "Home",
      "path": "/pages/home.pir.json",
      "contentPath": ".prodivix/documents/pages/home.pir.json",
      "contentRev": 3,
      "metaRev": 1,
      "updatedAt": "2026-05-10T10:00:00.000Z"
    }
  },
  "activeDocumentId": "page_home",
  "activeRouteNodeId": "route_home"
}
```

规则：

1. `workspace.json` 不嵌入 document content。
2. `documents[documentId].contentPath` 指向 `.prodivix/documents/**` 文件。
3. `documents[documentId].path` 是 VFS 派生路径。
4. `treeById` 是内部组织结构。
5. `contentRev/metaRev` 保留，不能用 Git commit 替代。

### 6.2 `.prodivix/route-manifest.json`

保存 route manifest。

```json
{
  "version": "1",
  "root": {
    "id": "root",
    "layoutDocId": "layout_root",
    "children": [
      {
        "id": "route_home",
        "index": true,
        "pageDocId": "page_home"
      }
    ]
  }
}
```

规则：

1. Route 只引用 `DocumentId`。
2. Route 不引用 `.prodivix/documents/**` 路径。
3. 路由路径是 route manifest 的派生结果。

### 6.3 `.prodivix/documents/**`

按文档类型保存内容。

```txt
.prodivix/documents/pages/*.pir.json       -> pir-page
.prodivix/documents/layouts/*.pir.json     -> pir-layout
.prodivix/documents/components/*.pir.json  -> pir-component
.prodivix/documents/graphs/*.graph.json    -> pir-graph
.prodivix/documents/animations/*.anim.json -> pir-animation
.prodivix/documents/code/**                -> code
.prodivix/documents/assets/**              -> asset metadata or references
.prodivix/documents/config/**              -> project-config
```

PIR 文件必须是 v1.3 graph-only：

```json
{
  "version": "1.3",
  "ui": {
    "graph": {}
  }
}
```

禁止：

```json
{
  "ui": {
    "root": {}
  }
}
```

## 7. Projection API

### 7.1 类型

```ts
type WorkspaceSourceFile = {
  path: string;
  content: string;
  mime: string;
  role:
    | 'workspace-manifest'
    | 'route-manifest'
    | 'document'
    | 'asset'
    | 'generated-index';
  documentId?: string;
};
```

### 7.2 写投影

```ts
function projectWorkspaceToProdivixFiles(
  snapshot: WorkspaceSnapshot
): WorkspaceSourceFile[];
```

职责：

1. 校验 Workspace VFS。
2. 校验 route manifest。
3. 校验每个 PIR document。
4. 生成 `.prodivix/workspace.json`。
5. 生成 `.prodivix/route-manifest.json`。
6. 生成 `.prodivix/documents/**`。
7. 保持 JSON 输出稳定排序。

稳定排序：

1. `treeById` 按 key 排序。
2. `documents` 按 `documentId` 排序。
3. 文件数组按 path 排序。
4. JSON 使用两个空格缩进。
5. 文件末尾保留换行。

### 7.3 读投影

```ts
function readWorkspaceFromProdivixFiles(
  files: WorkspaceSourceFile[]
): WorkspaceProjectionReadResult;
```

返回：

```ts
type WorkspaceProjectionReadResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
    }
  | {
      ok: false;
      issues: WorkspaceProjectionIssue[];
    };
```

职责：

1. 读取 `.prodivix/workspace.json`。
2. 读取 `.prodivix/route-manifest.json`。
3. 按 `contentPath` 读取所有 document content。
4. 还原 `docsById`。
5. 校验 VFS。
6. 校验 route manifest。
7. 校验 PIR document。

### 7.4 Round-trip 约束

必须满足：

```txt
snapshot
  -> projectWorkspaceToProdivixFiles
  -> readWorkspaceFromProdivixFiles
  -> snapshot'
```

保持：

1. workspace id 不变。
2. document id 不变。
3. VFS node id 不变。
4. route node id 不变。
5. document type 不变。
6. document path 不变。
7. PIR content 语义不变。

允许变化：

1. JSON key 排序。
2. 空白格式。
3. 缺省字段补齐。

## 8. Store Hard Cutover 计划

### 8.1 当前问题

当前 store 同时存在：

```ts
pirDoc;
workspaceDocumentsById;
treeById;
activeDocumentId;
```

并且 `pirDoc` 仍是编辑器主要读取入口。

### 8.2 目标 selector

新增稳定 selector：

```ts
selectWorkspaceSnapshot(state): WorkspaceSnapshot | undefined
selectActiveDocument(state): WorkspaceDocument | undefined
selectActivePirDocument(state): PIRDocument | undefined
selectDocumentById(state, documentId): WorkspaceDocument | undefined
selectWorkspaceTree(state): WorkspaceTreeView
selectRouteManifest(state): RouteManifest
```

### 8.3 破坏性切换规则

目标态禁止读取：

```ts
state.pirDoc;
```

必须使用 workspace selector：

```ts
selectActivePirDocument(state);
```

写入必须直接提交 command：

```ts
dispatchCommand(command);
```

`pirDoc` 不作为计划内状态字段、selector 缓存或保存目标。

### 8.4 删除清单

1. 删除 `pirDoc` 顶层字段。
2. 删除 `setPirDoc`、`updatePirDoc` 和 project PIR 保存路径。
3. Export 页面从 workspace projection 读取。
4. Blueprint canvas/tree/inspector 从 active workspace document 读取。
5. NodeGraph 从 active graph document 读取。
6. Animation 从 active animation document 读取。
7. Autosave 提交 command transaction。

## 9. Editor 工作方式

### 9.1 Blueprint

Blueprint 默认工作对象：

```txt
active route node
  -> pageDocId
  -> layoutDocId chain
  -> active document
```

页面切换：

```txt
setActiveRouteNodeId(routeNodeId)
  -> resolve pageDocId/layoutDocId
  -> setActiveDocumentId(documentId)
```

编辑节点：

```txt
documentId + nodeId + patch
```

不得只传：

```txt
nodeId + updatePirDoc
```

### 9.2 Inspector

Inspector 所有字段写入必须知道：

1. `workspaceId`
2. `documentId`
3. `nodeId`
4. `fieldPath`

```txt
Inspector field -> core.pir.node.update command
```

### 9.3 NodeGraph

```txt
active graph document
  -> graph editor
```

PIR page 只保留 graph 引用或 binding。

### 9.4 Animation

```txt
active animation document
  -> animation editor
```

PIR page 只保留 animation binding。

### 9.5 Code Editor

Code Editor 工作对象是 `WorkspaceDocument.type === "code"`。

代码历史：

```txt
Git blob -> text diff
```

不走 PIR graph diff。

## 10. Backend Hard Cutover 计划

### 10.1 当前后端状态

后端已有：

1. `workspaces`
2. `workspace_documents`
3. `GET /workspaces/:id`
4. `PATCH /workspaces/:workspaceId/documents/:documentId`
5. `POST /workspaces/:id/intents`
6. `POST /workspaces/:id/operations/commit`（Atomic WorkspaceOperation；旧 `/batch` 已 Hard Cut）

但仍存在：

1. `projects.pir_json`
2. project mirror sync。
3. `GET /projects/:id/pir`。

### 10.2 目标后端状态

Workspace 是项目编辑真相源。

`projects.pir_json` 不再作为新项目编辑来源。

`projects.pir_json` 不属于 workspace-only API 合同。数据库字段物理删除前，服务端也不得把它暴露为活跃编辑读模型或保存目标。

### 10.3 后端输出 `.prodivix` 投影

建议增加内部服务：

```go
func ProjectWorkspaceSourceFiles(snapshot WorkspaceSnapshot) ([]WorkspaceSourceFile, error)
func ReadWorkspaceSnapshotFromSourceFiles(files []WorkspaceSourceFile) (*WorkspaceSnapshot, error)
```

用途：

1. GitHub integration。
2. Export 页面。
3. 历史版本读取。
4. hard cutover 后的新项目 source export。

### 10.4 Project mirror 删除

`SyncProjectMirrorFromWorkspace` 不应继续作为新项目编辑链路的一部分。

删除条件：

1. Export 页面不再依赖 project PIR。
2. Editor 打开项目不再依赖 project PIR。
3. Git 投影可从 workspace 直接生成。
4. 后端 API 使用 workspace snapshot 作为唯一编辑读模型。
5. 新项目创建不再写入 `projects.pir_json` 作为编辑内容。

## 11. Git 集成路径

### 11.1 写入 Git

流程：

```txt
WorkspaceSnapshot
  -> projectWorkspaceToProdivixFiles
  -> write browser git workdir
  -> git status
  -> raw git diff preview
  -> commit
  -> push
```

### 11.2 读取 Git 历史

流程：

```txt
git ref
  -> read .prodivix/** blobs
  -> readWorkspaceFromProdivixFiles
  -> validate workspace
  -> Prodivix diff
```

### 11.3 Git diff 的位置

Git diff 只用于：

1. Export / push 前 raw diff。
2. 代码文件历史。
3. 高级用户查看 source projection。

三编辑器不直接消费 Git diff。

## 12. Export 切换

### 12.1 当前状态

Export 页面主要基于当前 `pirDoc` 生成 React 项目。

### 12.2 目标状态

Export 页面分两类输出：

1. Prodivix Source Export。
2. Generated App Export。

Prodivix Source Export：

```txt
.prodivix/**
```

Generated App Export：

```txt
src/**
package.json
index.html
```

### 12.3 Export 规则

1. Git push 默认提交 Prodivix Source。
2. Generated App 是独立可选输出，不反向写入 Workspace。
3. 历史版本比较基于 Prodivix Source。
4. Generated App 从 workspace 多文档生成。

## 13. Command 切换

### 13.1 稳定写入

所有写入都必须通过 command：

```ts
dispatchCommand({
  namespace: 'core.pir',
  type: 'node.update',
  target: { workspaceId, documentId },
  forwardOps,
  reverseOps,
});
```

要求：

1. 必须带 `workspaceId`。
2. 修改 document 时必须带 `documentId`。
3. 必须提供 `forwardOps` 和 `reverseOps`。
4. 必须通过 command executor 校验后入栈。
5. 不得把更新写回 project PIR。

### 13.2 禁止新增

新代码禁止：

```ts
updatePirDoc(...)
setPirDoc(...)
state.pirDoc = ...
```

允许出现的位置仅限：

1. 文档中说明旧模型。
2. retired single-PIR 错误测试。
3. 静态检查或 validator 的拒绝逻辑。

## 14. 验收标准

### 14.1 Projection 验收

1. 当前 workspace 可以生成 `.prodivix/workspace.json`。
2. 当前 workspace 可以生成 `.prodivix/route-manifest.json`。
3. 每个 workspace document 都有 `.prodivix/documents/**` 文件。
4. `.prodivix/**` 可以还原成 workspace snapshot。
5. round-trip 后 `documentId` 不变。
6. round-trip 后 `treeById` 不变。
7. round-trip 后 `routeManifest` 不变。
8. round-trip 后 PIR document 语义不变。

### 14.2 Store 验收

1. Export 不再直接依赖顶层 `pirDoc`。
2. Blueprint 至少通过 `selectActivePirDocument` 读取 active document。
3. active document 切换不丢失其它文档内容。
4. route 切换能切换 active document。

### 14.3 后端验收

1. 新项目创建后拥有 workspace snapshot。
2. workspace snapshot 包含多文档结构。
3. PATCH document 更新指定 document。
4. project mirror 不在新项目编辑链路中。
5. 旧项目打开返回明确 retired single-PIR 错误。

### 14.4 Git 验收

1. Git workdir 中能看到 `.prodivix/**`。
2. 修改页面节点会改变对应 `.prodivix/documents/pages/*.pir.json`。
3. 新建页面会改变 `.prodivix/workspace.json`、`.prodivix/route-manifest.json` 和新增 page PIR 文件。
4. 查看历史时可从 Git ref 还原 workspace。

## 15. 推荐实施顺序

### Step 1：Projection 核心

新增：

```txt
apps/web/src/workspace/projectWorkspaceToProdivixFiles.ts
apps/web/src/workspace/readWorkspaceFromProdivixFiles.ts
apps/web/src/workspace/workspaceSourceFile.types.ts
```

测试：

```txt
apps/web/src/workspace/__tests__/workspaceProjection.test.ts
```

### Step 2：Store selectors

新增：

```txt
apps/web/src/editor/store/editorStore.selectors.ts
```

先只读，不改写入。

### Step 3：Export Source tab

改：

```txt
apps/web/src/editor/features/export/ExportPirPage.tsx
```

新增 `.prodivix/**` 展示，不影响现有 React export。

### Step 4：Command 写入入口

新增：

```txt
dispatchCommand(command)
```

并删除 `updatePirDoc` 调用。所有 PIR 写入必须携带 `workspaceId`、`documentId`、`forwardOps` 和 `reverseOps`。

### Step 5：Command executor

在 helper 稳定后，引入 command executor。

### Step 6：Git bridge

把 `.prodivix/**` projection 写入 browser git workdir。

### Step 7：Prodivix diff

从两个 workspace snapshot 做 diff。

## 16. 风险与止损

### 16.1 同时改太多编辑器

风险：Blueprint、NodeGraph、Animation 同时改会扩大回归面。

止损：

1. 先做 projection。
2. 再做 selector。
3. 最后逐个编辑器切换。

### 16.2 文件路径被误用为身份

风险：移动或重命名文档导致历史和 diff 错判。

止损：

1. 所有 diff 使用 `DocumentId`。
2. path 只作为派生字段。
3. projection reader 必须保留 id。

### 16.3 `.prodivix/workspace.json` 过大

风险：把 document content 嵌进 workspace manifest。

止损：

1. workspace manifest 只保存 metadata 和 VFS。
2. document content 必须拆到 `.prodivix/documents/**`。

### 16.4 旧 `pirDoc` 回流

风险：双写入口导致状态不一致。

止损：

1. 生产代码禁止直接调用 `updatePirDoc`。
2. `pirDoc` 引用只能出现在旧模型说明、错误测试、拒绝逻辑和静态检查中。
3. 加 lint 或 grep 检查阻断回流。

## 17. 完成定义

完成后，用户创建和编辑项目时，系统内部必须满足：

1. 项目可以导出完整 `.prodivix/**` 源文件树。
2. `.prodivix/**` 可以还原 workspace。
3. 页面、布局、组件都是独立 workspace document。
4. route manifest 只引用 document id。
5. active document 是编辑器当前工作对象。
6. 单个 `pirDoc` 不再代表整个项目。
7. Git history 可以读取 `.prodivix/**` 并还原 workspace。
8. 后续 Prodivix diff、undo/redo、Git push 都基于 workspace 文件树。
