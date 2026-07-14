# Stable Workspace, Command History, Prodivix Diff Implementation Plan

## 状态

- Draft
- 日期：2026-05-10
- 适用范围：
  - `apps/web`
  - `apps/backend`
  - `packages/shared`
  - `specs/workspace`
  - `specs/pir`
  - `specs/router`
- 关联：
  - `specs/workspace/workspace-model.md`
  - `specs/decisions/39.pir-current-evolution.md`
  - `specs/router/route-manifest.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/07.workspace-sync.md`
  - `specs/decisions/12.command-transaction-planner.md`

## 1. 目标

本文档定义一组长期稳定的核心能力，作为后续 Git 支持、Prodivix diff、三编辑器历史、撤销重做和工作区结构重构的共同基础。

核心目标：

1. 建立稳定的 Workspace 逻辑文件树，承载多文档、路由、内部结构和导出投影。
2. 建立统一 Command History，让 PIR、Workspace VFS、Route Manifest、NodeGraph 和 Animation 的修改都可撤销、可重做、可同步、可审计。
3. 建立 Prodivix Diff 语义模型，用于三编辑器查看历史版本和当前开发过程差异。
4. 建立 Git 版本读取与投影边界，让 Git 负责版本、文件、远程同步，Prodivix 负责语义解释。
5. 保持 PIR `ui.graph` 的唯一真相源地位，不让文本 diff、导出文件树或派生树模型反向支配 PIR。

## 2. 非目标

本文档不直接实现以下内容：

1. 完整三编辑器 UI。
2. CRDT 协同编辑。
3. 完整 Git provider 授权 UI。
4. 完整代码生成器重写。
5. 完整文件系统编辑器。
6. 旧 PIR 项目运行态、自动导入链路或项目级 PIR 回退。

本文档只冻结长期稳定核心概念、数据边界、实施顺序和验收标准。

## 3. 设计原则

### 3.1 单一写入真相源

1. PIR UI 结构的唯一保存态是 `PIRDocument.ui.graph`。
2. Workspace 结构的唯一保存态是 `WorkspaceSnapshot`。
3. Route 结构的唯一保存态是 `RouteManifest`。
4. Command 是所有用户可撤销修改的唯一写入入口。
5. Git 是版本存储和同步系统，不是编辑器语义模型。

### 3.2 读模型可以派生，写模型必须稳定

允许派生以下读模型：

1. `materializeUiTree(ui.graph)`，用于渲染、预览和代码生成。
2. `WorkspaceTreeView`，用于内部调试或面包屑显示。
3. `GitWorkspaceProjection`，用于导出、提交和推送。
4. `ProdivixDiffViewModel`，用于三编辑器可视化 diff。

禁止把派生读模型作为长期写入来源。

### 3.3 用户操作对象与内部结构解耦

用户主要操作：

1. 页面。
2. 布局。
3. 组件。
4. 节点图。
5. 动画。
6. 路由。
7. 代码文件。

系统内部维护：

1. Workspace VFS。
2. 文档路径。
3. Git 投影路径。
4. command log。
5. outbox。
6. revision。

用户不直接编辑内部 VFS 节点。

### 3.4 Diff 的语义来源必须是模型

1. Prodivix diff 的输入是两个合法 `WorkspaceSnapshot` 或两个合法 `PIRDocument`。
2. Git diff 的输入是文本文件。
3. Git diff 可以辅助定位 changed files，但不能作为 PIR/Prodivix 语义 diff 的真相源。
4. 代码编辑器历史使用文本 diff。
5. 三编辑器历史使用 Prodivix diff。

## 4. 稳定分层

```txt
Git Layer
  commit / branch / tree / blob / raw file diff / push / fetch

Projection Layer
  workspace snapshot <-> git file tree
  generated source files <-> git file tree

Workspace Layer
  treeById / docsById / routeManifest / revisions / active document

Command Layer
  forwardOps / reverseOps / transaction / undo / redo / outbox

Domain Model Layer
  PIR ui.graph / Route Manifest / NodeGraph / Animation / Project files

Diff Layer
  Workspace diff / PIR graph diff / Route diff / Code text diff

Editor Layer
  Blueprint / NodeGraph / Animation / Code editor
```

依赖方向只能自上而下读取或调用下层能力；下层不得依赖编辑器 UI。

## 5. Workspace VFS

### 5.1 角色

Workspace VFS 是 Prodivix 内部的逻辑文件树，负责组织项目中的长期文档。

它不是：

1. 浏览器 POSIX 文件系统。
2. 用户可自由编辑的文件管理器。
3. Git 工作区的直接镜像。
4. 编译产物目录。

它是：

1. 多 PIR 文档的组织结构。
2. 路由、页面、布局、组件文档的稳定挂载点。
3. Command History 和 Git 投影的结构来源。
4. 后端 workspace snapshot 的核心部分。

### 5.2 核心类型

长期稳定类型应继续沿用 `specs/workspace/workspace-model.md` 中的字段，并补充明确语义。

```ts
type WorkspaceId = string;
type DocumentId = string;
type VfsNodeId = string;

type WorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'code'
  | 'asset'
  | 'project-config';

type WorkspaceDocument = {
  id: DocumentId;
  type: WorkspaceDocumentType;
  name: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: unknown;
  updatedAt: string;
  capabilities?: string[];
};

type VfsNode = {
  id: VfsNodeId;
  kind: 'dir' | 'doc';
  name: string;
  parentId: VfsNodeId | null;
  children?: VfsNodeId[];
  docId?: DocumentId;
};

type WorkspaceSnapshot = {
  id: WorkspaceId;
  name: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  treeRootId: VfsNodeId;
  treeById: Record<VfsNodeId, VfsNode>;
  docsById: Record<DocumentId, WorkspaceDocument>;
  routeManifest: RouteManifest;
  activeDocumentId?: DocumentId;
  activeRouteNodeId?: string;
};
```

### 5.3 默认组织

默认内部 VFS：

```txt
/
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

规则：

1. `pages/` 存 `pir-page`。
2. `layouts/` 存 `pir-layout`。
3. `components/` 存 `pir-component`。
4. `graphs/` 存 `pir-graph`。
5. `animations/` 存 `pir-animation`。
6. `code/` 存用户代码文档。
7. `assets/` 存资源文档或资源引用。
8. `config/` 存项目级配置文档。

这些目录是内部稳定分类，不等于最终导出的代码目录。

### 5.4 VFS 不变量

必须校验：

1. `treeRootId` 存在。
2. root node 的 `parentId` 为 `null`。
3. 非 root node 的 `parentId` 必须存在。
4. `dir` node 必须有 `children`。
5. `doc` node 必须有 `docId`。
6. `docId` 必须存在于 `docsById`。
7. 一个 `docId` 只能被一个 VFS doc node 引用。
8. `children` 中所有 id 必须存在。
9. VFS 无环。
10. VFS 无孤儿。
11. sibling `name` 在同一目录下不得重复。
12. `WorkspaceDocument.path` 必须由 VFS 路径派生。
13. 用户不可直接写 `WorkspaceDocument.path`。

### 5.5 VFS 写入入口

禁止组件直接写：

```ts
treeById;
workspaceDocumentsById;
routeManifest;
```

必须通过 command：

```ts
applyCommand({
  namespace: 'core.workspace',
  type: 'document.create',
  forwardOps,
  reverseOps,
  target,
});
```

首批 workspace command：

```txt
core.workspace.document.create@1.0
core.workspace.document.rename@1.0
core.workspace.document.move@1.0
core.workspace.document.delete@1.0
core.workspace.document.updateMeta@1.0
core.workspace.directory.create@1.0
core.workspace.directory.rename@1.0
core.workspace.directory.move@1.0
core.workspace.directory.delete@1.0
```

### 5.6 用户操作到 VFS 的映射

用户操作不直接暴露 VFS，但会产生 VFS command。

示例：

```txt
用户点击 "New Page"
  -> core.route.node.create
  -> core.workspace.document.create(pir-page)
  -> core.pir.document.init
  -> routeManifest.pageDocId = newDocId
```

示例：

```txt
用户点击 "Split Layout"
  -> core.workspace.document.create(pir-layout)
  -> core.pir.document.init(layout template with Outlet)
  -> core.route.node.attachLayout
```

## 6. Git 投影

### 6.1 Git Layer 职责

Git Layer 负责：

1. clone。
2. fetch。
3. read blob。
4. list files。
5. status。
6. commit。
7. push。
8. raw text diff。

Git Layer 不负责：

1. 判断 PIR 节点是否移动。
2. 判断路由是否拆分。
3. 判断动画 keyframe 是否变化。
4. 判断 VFS 文档语义。

### 6.2 Workspace 到 Git 文件树的投影

长期应有两个投影：

```txt
Prodivix Source Projection
  用于保存 Prodivix 项目本身，可被 Git 版本化。

Generated App Projection
  用于导出编译生成代码，可被 Git 版本化。
```

Prodivix Source Projection 建议结构：

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
    config/
```

说明：

1. `.prodivix/workspace.json` 存 workspace metadata、VFS tree、revision 摘要、document registry。
2. `.prodivix/route-manifest.json` 存 route manifest。
3. `.prodivix/documents/**` 存各文档 content。
4. document path 来自 VFS 派生路径。
5. `docsById` 仍然以 `DocumentId` 为稳定身份，路径只用于组织和 Git 可读性。

Generated App Projection 由 codegen 决定，例如：

```txt
src/
  App.tsx
  main.tsx
  routes/
  components/
package.json
index.html
```

### 6.3 Git 历史读取到 Prodivix Diff

三编辑器历史查看流程：

```txt
select base ref + target ref
  -> Git Layer read files from .prodivix/**
  -> parse WorkspaceSnapshot projection
  -> validate WorkspaceSnapshot
  -> parse documents
  -> validate PIR / NodeGraph / Animation documents
  -> compute Prodivix diff
  -> editor-specific view model
```

代码编辑器历史查看流程：

```txt
select base ref + target ref
  -> Git Layer read code file blobs
  -> text diff
  -> Monaco diff editor
```

Export / Push 页面流程：

```txt
current workspace
  -> materialize Prodivix Source Projection
  -> write browser git workdir
  -> show raw git status/diff
  -> commit/push
```

## 7. Command History

### 7.1 角色

Command History 是所有可撤销、可重做、可同步编辑的唯一操作记录。

它必须覆盖：

1. PIR graph 修改。
2. Workspace VFS 修改。
3. Route Manifest 修改。
4. NodeGraph 修改。
5. Animation 修改。
6. Code document 修改。
7. Project config 修改。

### 7.2 Command Envelope

沿用 `specs/decisions/06.command-history.md` 和 `specs/decisions/12.command-transaction-planner.md` 的稳定字段。

```ts
type CommandEnvelope = {
  id: string;
  namespace: string;
  type: string;
  version: string;
  issuedAt: string;
  forwardOps: PatchOp[];
  reverseOps: PatchOp[];
  target: {
    workspaceId: string;
    documentId?: string;
    routeNodeId?: string;
  };
  mergeKey?: string;
  label?: string;
  domainHint?:
    'pir' | 'workspace' | 'route' | 'nodegraph' | 'animation' | 'code';
};
```

### 7.3 Patch Path 分区

Patch path 必须指向稳定模型。

Workspace path：

```txt
/treeById
/treeRootId
/docsById/<documentId>
/activeDocumentId
```

Route path：

```txt
/routeManifest
/activeRouteNodeId
```

`/docsById` 根整体替换禁止进入远端 Atomic Commit；Document create/delete 与 metadata 变更必须使用 granular identity/field path。`activeDocumentId` 与 `activeRouteNodeId` 是本地 selection path，不属于远端持久 write set。

PIR document path：

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

### 7.4 Command 执行器

前端需要一个统一执行器：

```ts
type CommandApplyResult =
  | { ok: true; snapshot: WorkspaceSnapshot; command: CommandEnvelope }
  | { ok: false; diagnostics: ProdivixDiagnostic[] };

function applyCommand(
  snapshot: WorkspaceSnapshot,
  command: CommandEnvelope
): CommandApplyResult;
```

执行流程：

```txt
validate command envelope
  -> resolve target domain
  -> dry-run forwardOps
  -> validate affected domain
  -> validate workspace global invariants
  -> commit local state
  -> push command to undo stack
  -> clear redo stack
  -> append outbox item
```

### 7.5 Undo / Redo

Undo：

```txt
pop undoStack
  -> apply reverseOps as a new local transaction
  -> validate
  -> push redoStack
```

Redo：

```txt
pop redoStack
  -> apply forwardOps as a new local transaction
  -> validate
  -> push undoStack
```

规则：

1. Undo/Redo 不调用 UI 组件函数。
2. Undo/Redo 不直接修改 `pirDoc`。
3. Undo/Redo 只回放 command ops。
4. 失败时不改变历史栈。
5. 跨文档 command 必须保持事务一致性。

### 7.6 Transaction 与 Merge

拖拽、连续文本输入、批量创建等操作需要 transaction。

```ts
type CommandTransaction = {
  id: string;
  label?: string;
  commands: CommandEnvelope[];
  issuedAt: string;
  mergeKey?: string;
};
```

规则：

1. transaction 内命令按顺序执行。
2. 任意命令失败则整个 transaction 回滚。
3. `mergeKey` 相同且时间窗口内可合并。
4. 合并后必须重新计算 `forwardOps/reverseOps`。
5. 合并不得丢失用户可感知语义。

### 7.7 历史作用域

```txt
workspace:<workspaceId>
document:<workspaceId>:<documentId>
route:<workspaceId>
global:<workspaceId>
```

建议：

1. 默认编辑器 undo 作用域是当前 active document。
2. 路由和 VFS 操作属于 workspace/global 作用域。
3. 跨文档 transaction 属于 workspace/global 作用域。
4. UI 必须标注跨文档 undo 的影响范围。

## 8. Prodivix Diff

### 8.1 角色

Prodivix Diff 是 Prodivix 模型级差异，不是文本差异。

它用于：

1. 三编辑器历史版本查看。
2. 当前工作区与 Git ref 比较。
3. AI apply 前预览。
4. Command dry-run 后预览。
5. 导出前检查 Prodivix 源变化。

### 8.2 Diff 输入

```ts
type ProdivixDiffInput =
  | {
      kind: 'workspace';
      base: WorkspaceSnapshot;
      target: WorkspaceSnapshot;
    }
  | {
      kind: 'document';
      documentType: WorkspaceDocumentType;
      base: WorkspaceDocument;
      target: WorkspaceDocument;
    };
```

要求：

1. 输入必须先 validate。
2. 不接受 raw JSON string。
3. 不接受 git patch。
4. 不接受 materialized tree 作为唯一输入。

### 8.3 Diff 输出

```ts
type ProdivixDiffChange = {
  id: string;
  domain: 'workspace' | 'route' | 'pir' | 'nodegraph' | 'animation' | 'code';
  kind: string;
  targetRef: {
    workspaceId?: string;
    documentId?: string;
    nodeId?: string;
    routeNodeId?: string;
    path?: string;
  };
  summary: string;
  detail?: unknown;
  severity?: 'info' | 'warning' | 'error';
};
```

### 8.4 Workspace Diff

首批 change kind：

```txt
workspace.document.added
workspace.document.removed
workspace.document.renamed
workspace.document.moved
workspace.document.typeChanged
workspace.directory.added
workspace.directory.removed
workspace.directory.renamed
workspace.directory.moved
workspace.activeDocumentChanged
workspace.revisionChanged
```

比较依据：

1. `DocumentId` 是身份。
2. `VfsNodeId` 是 VFS 节点身份。
3. `path` 只是派生位置。
4. rename 与 move 应通过 id 稳定识别，不通过路径猜测。

### 8.5 Route Diff

首批 change kind：

```txt
route.node.added
route.node.removed
route.node.moved
route.node.segmentChanged
route.node.indexChanged
route.node.layoutChanged
route.node.pageChanged
route.runtime.changed
route.outletRequirementChanged
```

比较依据：

1. `routeNodeId` 是身份。
2. `layoutDocId/pageDocId` 是文档引用。
3. 路径字符串是派生结果，不是身份。

### 8.6 PIR Graph Diff

首批 change kind：

```txt
pir.root.changed
pir.node.added
pir.node.removed
pir.node.renamed
pir.node.moved
pir.node.propsChanged
pir.node.styleChanged
pir.node.bindingsChanged
pir.children.reordered
pir.region.added
pir.region.removed
pir.region.childrenChanged
pir.logic.changed
pir.metadata.changed
```

比较依据：

1. `node.id` 是节点身份。
2. `childIdsById` 表达默认 children 顺序。
3. `regionsById` 表达具名区域顺序。
4. `nodesById` 字段差异表达属性变化。
5. 不通过 JSON 行号判断变化。

### 8.7 NodeGraph Diff

NodeGraph 初期可以只冻结 diff 合同，不实现完整 UI。

首批 change kind：

```txt
nodegraph.node.added
nodegraph.node.removed
nodegraph.node.moved
nodegraph.node.configChanged
nodegraph.edge.added
nodegraph.edge.removed
nodegraph.edge.rewired
nodegraph.group.changed
```

### 8.8 Animation Diff

Animation 初期可以只冻结 diff 合同，不实现完整 UI。

首批 change kind：

```txt
animation.timeline.added
animation.timeline.removed
animation.track.added
animation.track.removed
animation.keyframe.added
animation.keyframe.removed
animation.keyframe.moved
animation.keyframe.valueChanged
animation.binding.changed
```

### 8.9 Code Diff

Code document 使用文本 diff。

但需要通过 Workspace 识别代码文档：

```txt
WorkspaceDocument.type === 'code'
```

流程：

```txt
base content string
target content string
  -> Monaco diff editor
```

Code diff 不进入 PIR graph diff。

## 9. 三编辑器消费 Diff

### 9.1 Blueprint

Blueprint 消费：

1. `workspace.document.*`
2. `route.*`
3. `pir.*`

展示建议：

1. 新增节点：绿色轮廓。
2. 删除节点：红色 ghost。
3. 移动节点：位置箭头或变更 badge。
4. 属性变化：Inspector 字段级标记。
5. 路由变化：Route tree badge。

### 9.2 NodeGraph

NodeGraph 消费：

1. `nodegraph.*`
2. 与当前图文档相关的 `workspace.document.*`
3. 与绑定节点相关的 `pir.node.*`

### 9.3 Animation

Animation 消费：

1. `animation.*`
2. 与目标节点绑定相关的 `pir.node.*`
3. 与动画文档相关的 `workspace.document.*`

### 9.4 Code Editor

Code Editor 消费：

1. `code` text diff。
2. 与 code document 相关的 `workspace.document.*`。

不消费 PIR graph diff，除非代码文档显式引用 PIR symbol。

## 10. 后端职责

后端必须保持与前端相同的模型边界。

### 10.1 Workspace Snapshot API

必须提供：

```http
GET /api/workspaces/:id
```

返回：

```ts
WorkspaceSnapshot;
```

### 10.2 Command PATCH API

必须提供：

```http
PATCH /api/workspaces/:id/commands
```

请求：

```ts
{
  expectedWorkspaceRev: number;
  expectedRouteRev?: number;
  expectedDocumentRevs?: Record<DocumentId, number>;
  transaction: CommandTransaction | CommandEnvelope;
  clientMutationId: string;
}
```

响应：

```ts
{
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  updatedDocuments: Array<{
    id: DocumentId;
    type: WorkspaceDocumentType;
    path: string;
    contentRev: number;
    metaRev: number;
    content: unknown;
    updatedAt: string;
  }>;
}
```

### 10.3 服务端验证

每次 command apply 后必须验证：

1. command envelope。
2. patch path 白名单。
3. Workspace VFS 不变量。
4. Route Manifest 不变量。
5. PIR-current normalized graph 不变量。
6. reverseOps 可回放。

### 10.4 Operation Log

后端 operation log 应保存：

1. command id。
2. transaction id。
3. namespace。
4. type。
5. target。
6. forwardOps。
7. reverseOps。
8. before revs。
9. after revs。
10. clientMutationId。
11. issuedAt。
12. appliedAt。

用途：

1. 审计。
2. 服务端回放。
3. 未来协作。
4. 历史版本解释。

## 11. 前端 Store 重构

### 11.1 目标状态

长期 store 不应暴露：

```ts
pirDoc;
setPirDoc;
updatePirDoc;
```

目标 API：

```ts
type EditorWorkspaceStore = {
  workspace?: WorkspaceSnapshot;
  activeDocumentId?: DocumentId;
  undoStack: CommandTransaction[];
  redoStack: CommandTransaction[];
  pendingOutbox: CommandTransaction[];
  setWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void;
  applyCommand(command: CommandEnvelope): CommandApplyResult;
  applyTransaction(transaction: CommandTransaction): CommandApplyResult;
  undo(scope?: HistoryScope): CommandApplyResult;
  redo(scope?: HistoryScope): CommandApplyResult;
  setActiveDocumentId(documentId?: DocumentId): void;
};
```

### 11.2 Store Hard Cutover 合同

新项目和新编辑链路必须以 `WorkspaceSnapshot` 为根状态。`pirDoc`、project PIR 和整文档保存 API 不属于目标 Store 合同。

规则：

1. `getActivePirDocument()` selector 只能从 active workspace document 派生 PIR。
2. `dispatchPirCommand()` 是 PIR 写入入口，写路径必须显式携带 `workspaceId` 和 `documentId`。
3. 生产代码禁止调用 `updatePirDoc`、`setPirDoc` 或 project PIR 保存 API。
4. 旧单 PIR 项目打开时返回 retired single-PIR 错误，引导用户创建新的 workspace 项目。
5. 不保留项目级 PIR 回退读写。

### 11.3 Selector

推荐稳定 selector：

```ts
selectWorkspaceSnapshot();
selectActiveDocument();
selectActivePirDocument();
selectRouteManifest();
selectWorkspaceTree();
selectDocumentById(documentId);
selectDocumentPath(documentId);
selectUndoAvailability(scope);
selectRedoAvailability(scope);
```

## 12. 实施顺序

### Phase 1：规格与只读模型冻结

目标：

1. 完成本文档评审。
2. 明确 Workspace VFS、Command、Diff、Git Projection 边界。
3. 不改大范围编辑器行为。

交付：

1. 本文档。
2. `WorkspaceSnapshot` 类型对齐。
3. `CommandEnvelope` 类型对齐。
4. `ProdivixDiffChange` 类型草案。

验收：

1. spec 无互相冲突字段。
2. 新文档能解释 Git diff 与 Prodivix diff 边界。
3. 新文档能解释撤销重做栈为什么不能只围绕 `pirDoc`。

### Phase 2：Workspace VFS Validator 与 Projection

目标：

1. 实现 VFS 不变量校验。
2. 实现 workspace snapshot 到 `.prodivix/**` 的投影。
3. 实现 `.prodivix/**` 到 workspace snapshot 的读取。

交付：

```txt
apps/web/src/workspace/validateWorkspaceSnapshot.ts
apps/web/src/workspace/projectWorkspaceToGitFiles.ts
apps/web/src/workspace/readWorkspaceFromGitFiles.ts
```

验收：

1. 可从当前 workspace 生成稳定 `.prodivix/**` 文件。
2. 可从 `.prodivix/**` 还原 workspace。
3. round-trip 后核心 id 不变。

### Phase 3：Command Executor MVP

目标：

1. 实现前端 command apply。
2. 支持 workspace、route、pir 三个域。
3. 支持 undo/redo。

交付：

```txt
apps/web/src/editor/commands/types.ts
apps/web/src/editor/commands/applyCommand.ts
apps/web/src/editor/commands/historyStore.ts
apps/web/src/editor/commands/patch.ts
```

验收：

1. PIR node update 可撤销。
2. PIR node move 可撤销。
3. route create 可撤销。
4. workspace document create 可撤销。
5. reverseOps 无效时拒绝入栈。

### Phase 4：Prodivix Diff MVP

目标：

1. 实现 workspace diff。
2. 实现 route diff。
3. 实现 PIR graph diff。
4. 暂不做完整 UI。

交付：

```txt
apps/web/src/Prodivix-diff/types.ts
apps/web/src/Prodivix-diff/diffWorkspace.ts
apps/web/src/Prodivix-diff/diffRouteManifest.ts
apps/web/src/Prodivix-diff/diffPirGraph.ts
apps/web/src/Prodivix-diff/diffWorkspaceSnapshot.ts
```

验收：

1. node add/remove/update/move 可识别。
2. document add/remove/move/rename 可识别。
3. route page/layout/segment 变化可识别。
4. diff 不依赖 JSON 行号。

### Phase 5：Git History Bridge

目标：

1. 用 browser git client 读取 ref。
2. 从 Git ref 还原 workspace snapshot。
3. 将两个 snapshot 输入 Prodivix diff。

交付：

```txt
apps/web/src/infra/git/readWorkspaceAtRef.ts
apps/web/src/editor/history/compareWorkspaceRefs.ts
```

验收：

1. 可以比较两个 Git ref 中的 `.prodivix/**`。
2. 三编辑器拿到 Prodivix diff change list。
3. 代码文件仍走 text diff。

### Phase 6：编辑器接入

目标：

1. Blueprint 使用 command helper 写入。
2. Inspector 使用 command helper 写入。
3. Route 操作使用 command helper 写入。
4. 初版 Prodivix diff 在 Blueprint 中展示。

验收：

1. 常用 Blueprint 操作可 undo/redo。
2. route/page/layout 操作可 undo/redo。
3. 历史版本对比可展示节点级变化。

### Phase 7：后端 Command PATCH

目标：

1. 后端执行同一 command envelope。
2. 后端校验所有稳定不变量。
3. operation log 入库。

验收：

1. 前端 command 可发送到后端。
2. rev 冲突返回结构化错误。
3. 后端拒绝非法 `/ui/root` patch。
4. 后端拒绝破坏 VFS 或 route 的 command。

## 13. 测试策略

### 13.1 单元测试

必须覆盖：

1. Workspace VFS validator。
2. Workspace projection round-trip。
3. Patch apply/invert。
4. Command executor。
5. Undo/Redo。
6. Prodivix diff。
7. Git ref workspace loader。

### 13.2 集成测试

必须覆盖：

1. 新建页面。
2. 拆分 layout。
3. 移动节点。
4. 修改 Inspector 字段。
5. 撤销重做链。
6. Git ref 对比。
7. Export push 前 raw git diff。

### 13.3 测试边界

遵守仓库规则：

1. 不写 DOM 层级耦合测试。
2. 不断言内部 class。
3. 不用 snapshot 代替语义断言。
4. 优先断言 command 输出、state 结果、diff change、validator diagnostics。

## 14. 风险与处理

### 14.1 过早实现 UI

风险：在模型没稳定前做 diff UI，会反复重写。

处理：

1. 先做 model diff。
2. 再做 view model。
3. 最后做 editor UI。

### 14.2 Command 粒度过大

风险：保存整份文档导致 undo/redo 内存增长，diff 也无法解释。

处理：

1. command 保存最小 patch。
2. 高频操作用 mergeKey 合并。
3. 禁止整份 PIR 作为常规 command payload。

### 14.3 Workspace VFS 与 Git 文件树混淆

风险：Git path 变化被误认为文档身份变化。

处理：

1. `DocumentId` 是身份。
2. path 是派生。
3. Git projection loader 必须保留 id。

### 14.4 PIR diff 被文本 diff 污染

风险：JSON 格式化或字段顺序影响编辑器 diff。

处理：

1. Prodivix diff 输入必须是 validated model。
2. raw git diff 只用于 export/push 和高级查看。
3. 三编辑器不消费 raw git diff。

### 14.5 旧 `pirDoc` 写入口回流

风险：新旧写入入口并存导致 undo/redo 和 sync 不一致。

处理：

1. 生产代码禁止 `updatePirDoc`。
2. 编辑入口必须直接调用 command helper。
3. 增加检查阻止生产代码新增 `updatePirDoc` 写入。

## 15. 完成标准

全部完成后应满足：

1. 一个项目可稳定管理多个 PIR 文档。
2. 用户无需接触内部 VFS。
3. Workspace VFS、Route Manifest、PIR graph 都有 validator。
4. 所有可撤销操作都走 command。
5. Undo/Redo 不依赖组件闭包。
6. Git ref 可还原 workspace snapshot。
7. Prodivix diff 可解释三编辑器变化。
8. Code editor 仍可直接使用文本 diff。
9. Export / Push 页面可展示 raw git diff。
10. PIR `ui.graph` 仍是 UI 结构唯一真相源。

## 16. 推荐下一步

立即下一步不应先做 UI，而应按以下顺序做小步落地：

1. 新增稳定类型文件，集中定义 `WorkspaceSnapshot`、`CommandEnvelope`、`ProdivixDiffChange`。
2. 实现 Workspace VFS validator。
3. 实现 Workspace Git Projection round-trip。
4. 实现 Command Executor MVP。
5. 实现 PIR Graph Diff MVP。

完成这五步后，再接入 Git history 和三编辑器可视化。
