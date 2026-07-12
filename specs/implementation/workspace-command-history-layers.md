# Workspace Command History Layers Implementation Plan

## 状态

- In Progress
- 日期：2026-05-10
- 最近更新：2026-07-12
- 适用范围：
  - `packages/workspace`
  - `apps/web/src/editor/store`
  - `apps/web/src/editor/features/blueprint`
  - `apps/web/src/editor/features/development/reactflow`
  - `apps/web/src/editor/features/animation`
  - `apps/web/src/editor/features/resources`
  - `apps/backend/internal/modules/workspace`
- 关联：
  - `specs/implementation/stable-workspace-command-diff-architecture.md`
  - `specs/implementation/pir-file-tree-workflow-implementation.md`
  - `specs/implementation/pir-v1.3-graph-patch-migration-plan.md`
  - `specs/workspace/workspace-model.md`
  - `specs/decisions/06.command-history.md`
  - `specs/decisions/12.intent-command-extension.md`

## 1. 目标

本文档把 Workspace/PIR 文件树上的撤销重做、协同、Git 历史、Prodivix diff 和各编辑器写入入口拆成 10 个长期稳定层。

目标不是做短期兼容层，而是明确：

1. 每个编辑器如何只撤销自己的历史。
2. 一次用户动作如何跨多个文档原子提交。
3. `forwardOps/reverseOps` 如何成为可回放、可同步、可审计的底层差异。
4. 代码编辑器为什么需要 text edit command，而不是直接套用 PIR JSON Patch。
5. Git diff 和 Prodivix diff 各自在哪一层工作。

## 2. 总体分层

```txt
Editor Binding Layer
  keyboard / active editor / undo scope

Code Text History Layer
  text edit / selection / cursor / merge window

Prodivix Diff Layer
  workspace diff / PIR graph diff / route diff / nodegraph diff / animation diff

Git Projection Layer
  WorkspaceSnapshot <-> .prodivix/** files

Outbox Sync Layer
  pending command transaction / expected rev / server ack / conflict

Conflict Revision Layer
  contentRev / metaRev / workspaceRev / routeRev / opSeq

Domain Validator Layer
  PIR / NodeGraph / Animation / Code / Route / Workspace validators

Domain Command Helper Layer
  semantic command builders for editors

Transaction Layer
  atomic multi-command user actions

History Scope Layer
  scoped undo/redo stacks

Command Apply Layer
  forwardOps / reverseOps / restricted JSON Patch
```

底层不得依赖上层 UI。上层可以调用下层，但不能绕过 Command Apply 直接改保存态。

当前已经实现：

1. Workspace VFS validator。
2. `.prodivix/**` projection round-trip。
3. Workspace selectors。
4. Command / Transaction 原子 Apply Layer。
5. Operation-aware History Scope Layer。
6. scope barrier、merge window、redo branch 与 history limit。
7. Store 原子接线和 Blueprint / NodeGraph / Animation / Code Resource 快捷键。
8. ACK-first CodeDocument bridge 与 editSeq-aware ACK 内容保护。
9. 前后端一致的 canonical VFS path node id 生成规则。
10. `@prodivix/workspace-sync` semantic diff3、conflict session 与 fresh resolution operation。
11. Document bounded automatic rebase 与 Code/NodeGraph revision conflict 产品面。
12. Exact Atomic Commit planner、tree/route/document/mixed Web transport 与后端单事务/强幂等 Commit；旧 `/batch` dependency 已删除。

尚未实现：

1. Intent-only Resource CRUD 的本地 Domain Command planners。
2. Durable outbox、完整 ACK causality 与 session 持久恢复。
3. Git ref bridge 及 Workspace/Route/Animation 专用 diff 产品面。
4. Code Text History 与 Workspace checkpoint 的正式桥接。
5. Mounted CSS create + PIR binding 规划并接入单一 WorkspaceTransaction Commit。

## 3. Layer 1：Command Apply Layer

### 3.1 职责

Command Apply Layer 是最底层写入执行器。

它负责：

1. 校验 `CommandEnvelope` 必填字段。
2. 校验 target workspace/document。
3. 校验 patch path 白名单。
4. 应用 `forwardOps`。
5. 验证 `reverseOps` 可以恢复原始状态。
6. 验证结果仍满足对应 domain 不变量。

它不负责：

1. 判断当前快捷键属于哪个编辑器。
2. 合并连续输入。
3. 处理远端冲突。
4. 渲染 diff UI。
5. 与后端同步。

### 3.2 稳定输入

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
  domainHint?: CommandDomain;
};
```

### 3.3 稳定输出

```ts
type CommandApplyResult =
  | {
      ok: true;
      snapshot: WorkspaceSnapshot;
      command: CommandEnvelope;
    }
  | {
      ok: false;
      issues: CommandIssue[];
    };
```

### 3.4 例子：Blueprint 修改节点属性

```ts
{
  namespace: 'core.pir',
  type: 'node.props.update',
  target: {
    workspaceId: 'ws_1',
    documentId: 'page_home'
  },
  forwardOps: [
    {
      op: 'replace',
      path: '/ui/graph/nodesById/button_1/props/text',
      value: 'Submit'
    }
  ],
  reverseOps: [
    {
      op: 'replace',
      path: '/ui/graph/nodesById/button_1/props/text',
      value: 'Save'
    }
  ],
  domainHint: 'pir'
}
```

执行器只知道它要改 `page_home` 的 PIR content。它不关心这个命令来自 Inspector、AI 还是快捷键。

### 3.5 例子：非法旧 PIR 写入

以下命令必须拒绝：

```ts
{
  forwardOps: [{ op: 'add', path: '/ui/root', value: {} }],
  reverseOps: [{ op: 'remove', path: '/ui/root' }]
}
```

原因：PIR v1.3 保存态禁止 `ui.root`。这不是 UI 错误，而是模型边界错误。

## 4. Layer 2：History Scope Layer

### 4.1 职责

History Scope Layer 决定 `Ctrl+Z` / `Ctrl+Shift+Z` 操作哪个历史栈。

它负责：

1. 给 command 分配 stable scope。
2. 按 scope 查询 undo/redo 可用性。
3. 只撤销当前 editor scope 内的最后一条历史。
4. 支持 workspace/global scope 的跨文档操作。

它不负责 patch 语义；patch 仍由 Command Apply Layer 执行。

### 4.2 稳定类型

```ts
type HistoryScope =
  | {
      kind: 'document';
      workspaceId: string;
      documentId: string;
      domain: 'pir' | 'nodegraph' | 'animation' | 'code';
    }
  | {
      kind: 'workspace';
      workspaceId: string;
    }
  | {
      kind: 'route';
      workspaceId: string;
    };
```

### 4.3 Scope 匹配规则

```ts
type HistoryEntry = {
  id: string;
  operation:
    | { kind: 'command'; command: CommandEnvelope }
    | { kind: 'transaction'; transaction: CommandTransaction };
  scope: HistoryScope;
  affectedScopes: HistoryScope[];
  isBarrier: boolean;
  appliedAt: string;
};
```

匹配规则：

1. `document` scope 必须同时匹配 `workspaceId`、`documentId`、`domain`。
2. `route` scope 只匹配 route command，不匹配 Blueprint 节点 command。
3. `workspace` scope 用于 VFS、项目配置、跨文档 transaction。
4. Editor 快捷键默认只查自己的 active scope。

### 4.4 例子：NodeGraph 独立撤销

用户操作顺序：

```txt
1. Blueprint 移动 button_1
2. NodeGraph 新建 edge_a
3. Animation 移动 keyframe_1
4. NodeGraph 修改 node_x 配置
```

此时在 NodeGraph 里按 `Ctrl+Z`：

```ts
undo({
  kind: 'document',
  workspaceId: 'ws_1',
  documentId: 'graph_checkout',
  domain: 'nodegraph',
});
```

应该撤销第 4 步，不撤销第 3 步 Animation，也不撤销第 1 步 Blueprint。

### 4.5 例子：Workspace Scope

新建页面可能创建 page document、更新 VFS、更新 route。它不是某一个 editor document 的局部历史，应进入 workspace/route transaction。

撤销时 UI 应提示：

```txt
Undo "Create Page About" will remove route /about and page document About.
```

## 5. Layer 3：Transaction Layer

### 5.1 职责

Transaction Layer 表达“一次用户动作”。

它负责：

1. 原子执行多个 command。
2. 任一 command 失败时回滚整个 transaction。
3. 给 history/outbox/operation log 一个稳定 transaction id。
4. 支持跨 domain、跨 document 的用户动作。

### 5.2 稳定类型

```ts
type CommandTransaction = {
  id: string;
  label: string;
  issuedAt: string;
  workspaceId: string;
  commands: CommandEnvelope[];
  mergeKey?: string;
};
```

Transaction scope 从内部 Commands 推导；只有全部 Commands 属于同一个窄 scope 时保留该 scope，否则归入 workspace scope 并成为 barrier。

### 5.3 执行规则

```txt
validate transaction envelope
  -> apply command[0]
  -> apply command[1]
  -> ...
  -> validate final WorkspaceSnapshot
  -> append one history entry
  -> append one outbox item
```

失败规则：

1. 任意 command `forwardOps` 失败，则 transaction 不提交。
2. 任意 command `reverseOps` 不可恢复，则 transaction 不提交。
3. 任意 domain validator 失败，则 transaction 不提交。
4. 失败后 history/outbox 不变。

### 5.4 例子：新建页面

用户点击 `New Page: About` 应产生一个 transaction：

```txt
Transaction "Create Page About"
  1. core.workspace.document.create(page_about)
  2. core.pir.document.init(page_about)
  3. core.route.node.create(route_about -> page_about)
  4. core.workspace.activeDocument.set(page_about)
```

撤销时必须一次性：

1. 删除 route node。
2. 删除 page document。
3. 从 VFS 移除 `/pages/about.pir.json`。
4. 恢复 active document。

不能只撤销 route，留下孤儿 document。

### 5.5 例子：拆分 Layout

用户对 `/dashboard` 执行 `Split Layout`：

```txt
Transaction "Split Dashboard Layout"
  1. core.workspace.document.create(layout_dashboard)
  2. core.pir.document.init(layout_dashboard with Outlet)
  3. core.route.node.attachLayout(route_dashboard, layout_dashboard)
  4. core.pir.node.move(children -> layout outlet)
```

这也是跨 route、workspace、PIR 的 transaction。

## 6. Layer 4：Domain Command Helper Layer

### 6.1 职责

Domain Command Helper Layer 把用户语义转成 command。编辑器不应手写 JSON Patch path。

它负责：

1. 提供 editor 语义 API。
2. 生成 `forwardOps/reverseOps`。
3. 生成稳定 `namespace/type/version`。
4. 设置 `domainHint` 和默认 `HistoryScope`。

### 6.2 PIR Helper 例子

```ts
createPirNodeMoveCommand({
  workspaceId,
  documentId,
  nodeId: 'button_1',
  fromParentId: 'card_1',
  toParentId: 'toolbar_1',
  toIndex: 2,
});
```

输出：

```txt
core.pir.node.move@1.0
target.documentId = page_home
forwardOps = patch childIdsById
reverseOps = restore previous childIdsById
domainHint = pir
```

Blueprint 只表达“移动节点”，不拼 `/ui/graph/childIdsById/...`。

### 6.3 NodeGraph Helper 例子

```ts
createNodeGraphEdgeConnectCommand({
  workspaceId,
  documentId: 'graph_checkout',
  sourceNodeId: 'validate_cart',
  sourcePortId: 'ok',
  targetNodeId: 'charge_card',
  targetPortId: 'input',
});
```

输出：

```txt
core.nodegraph.edge.connect@1.0
target.documentId = graph_checkout
domainHint = nodegraph
```

NodeGraph helper 负责检查 port id 是否存在，不能让 UI 直接写 raw edge object。

### 6.4 Animation Helper 例子

```ts
createAnimationKeyframeMoveCommand({
  workspaceId,
  documentId: 'anim_hero',
  trackId: 'opacity',
  keyframeId: 'kf_1',
  time: 480,
});
```

输出：

```txt
core.animation.keyframe.move@1.0
domainHint = animation
```

Helper 负责生成 reverseOps，恢复原时间点。

### 6.5 Code Helper 例子

代码编辑器不应直接用通用 JSON Patch 改字符串。它应该输出 code text edit command：

```ts
createCodeTextEditCommand({
  workspaceId,
  documentId: 'code_index',
  edits: [
    {
      range: {
        startLine: 10,
        startColumn: 4,
        endLine: 10,
        endColumn: 9,
      },
      text: 'count',
    },
  ],
  beforeSelection,
  afterSelection,
});
```

Code helper 可以在内部转成 text patch 或 piece table operation，但外部 command 语义必须保留 text edit。

## 7. Layer 5：Domain Validator Layer

### 7.1 职责

Domain Validator Layer 校验各 domain 的语义合法性。

Workspace VFS validator 只能校验文件树。它不能校验 NodeGraph edge port、Animation keyframe、Code text range。

### 7.2 Validator 清单

```txt
validateWorkspaceVfs(snapshot)
validateRouteManifest(routeManifest, docsById)
validatePirDocument(doc)
validateNodeGraphDocument(doc)
validateAnimationDocument(doc)
validateCodeDocument(doc)
```

### 7.3 PIR Validator 例子

必须拒绝：

1. `ui.root`。
2. `rootId` 不存在。
3. `childIdsById` 引用不存在节点。
4. 图结构环。
5. 节点有多个结构父级。

### 7.4 NodeGraph Validator 例子

必须拒绝：

1. edge source node 不存在。
2. edge target port 不存在。
3. required input port 未连接。
4. graph group 引用不存在节点。
5. 节点 id 重复。

示例：

```txt
edge e1:
  source = validate_cart.ok
  target = charge_card.input
```

如果 `charge_card.input` port 被删除，validator 应返回 `nodegraph.edge.portMissing`，而不是让渲染器崩溃。

### 7.5 Animation Validator 例子

必须拒绝：

1. keyframe time 非数字。
2. 同 track 内 keyframe id 重复。
3. binding target node 不存在。
4. easing 名称非法。
5. clip range 反向。

### 7.6 Code Validator 例子

Code validator 不做完整 TypeScript 编译。它只负责 workspace code document 的基础合同：

1. content 必须是 string 或明确 text model。
2. languageId 合法。
3. path 与 VFS 派生路径一致。
4. text edit range 必须在当前 document 内。

语法/类型错误交给 code diagnostics 层，不阻止 command history 记录。

## 8. Layer 6：Conflict / Revision Layer

### 8.1 职责

Conflict / Revision Layer 判断本地 command 是否还能应用到当前服务端版本。

它负责：

1. 比较 expected rev。
2. 判断 patch path 是否冲突。
3. 允许不冲突 command 自动合并。
4. 对冲突 command 返回结构化 issue。

### 8.2 稳定 revision

```ts
type WorkspaceRevisions = {
  workspaceRev: number;
  routeRev: number;
  documentRevs: Record<
    DocumentId,
    {
      contentRev: number;
      metaRev: number;
    }
  >;
  opSeq: number;
};
```

### 8.3 Command expected rev

```ts
type CommandTransactionRequest = {
  expectedWorkspaceRev: number;
  expectedRouteRev?: number;
  expectedDocumentRevs?: Record<DocumentId, number>;
  transaction: CommandTransaction;
  clientMutationId: string;
};
```

### 8.4 例子：可自动合并

用户 A：

```txt
replace /ui/graph/nodesById/button_1/style/color
```

用户 B：

```txt
replace /ui/graph/nodesById/button_1/props/text
```

两者 patch path 不同，且 validator 通过。可以自动合并。

### 8.5 例子：冲突

用户 A：

```txt
replace /ui/graph/nodesById/button_1/style/color = red
```

用户 B：

```txt
replace /ui/graph/nodesById/button_1/style/color = blue
```

同一路径不同值。必须进入冲突状态。

### 8.6 例子：结构冲突

用户 A 删除节点：

```txt
remove /ui/graph/nodesById/button_1
```

用户 B 修改节点：

```txt
replace /ui/graph/nodesById/button_1/props/text
```

即使 patch path 不完全相同，也必须视为结构冲突，因为 B 的目标节点已不存在。

## 9. Layer 7：Outbox / Sync Layer

### 9.1 职责

Outbox / Sync Layer 负责离线、重试和服务端确认。

它负责：

1. 保存 pending transaction。
2. 本地先应用 command。
3. 网络恢复后发送。
4. 收到 ack 后更新 rev。
5. 收到 conflict 后标记本地状态。

它不负责生成 command，也不负责 UI 展示冲突。

### 9.2 稳定类型

```ts
type OutboxItem = {
  id: string;
  workspaceId: string;
  transaction: CommandTransaction;
  expectedRevisions: WorkspaceRevisions;
  status: 'pending' | 'sending' | 'acked' | 'conflicted' | 'failed';
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: CommandIssue;
};
```

### 9.3 例子：离线移动节点

```txt
1. User moves button_1
2. Command applies locally
3. OutboxItem(status=pending)
4. User continues editing
5. Network restores
6. Outbox sends transaction
7. Server ack -> update contentRev/opSeq
```

如果服务端返回 revision conflict：

```txt
OutboxItem(status=conflicted)
Workspace shows conflict badge
User opens Prodivix diff/merge
```

### 9.4 Outbox 顺序

同 workspace 内 outbox 默认按 `createdAt` / `opSeq` 顺序发送。后续可以优化并行，但必须保证：

1. 同一 document 的 commands 顺序一致。
2. 跨 document transaction 不被拆开。
3. ack 前不丢失 reverseOps。

## 10. Layer 8：Git Projection Layer

### 10.1 职责

Git Projection Layer 把 Workspace 保存为 `.prodivix/**`，并从 Git ref 还原 Workspace。

它负责：

1. `WorkspaceSnapshot -> .prodivix/** files`。
2. `.prodivix/** files -> WorkspaceSnapshot`。
3. Git ref/blob 读取。
4. Export/push 前 raw git diff。

它不负责：

1. PIR semantic diff。
2. 编辑器 undo/redo。
3. command 冲突合并。

### 10.2 保存形态

```txt
.prodivix/
  workspace.json
  route-manifest.json
  documents/
    pages/home.pir.json
    layouts/root-layout.pir.json
    components/button.pir.json
    graphs/checkout.graph.json
    animations/hero.anim.json
    code/index.ts
```

### 10.3 例子：查看 Git 历史

```txt
select baseRef + targetRef
  -> read .prodivix/** blobs at baseRef
  -> read .prodivix/** blobs at targetRef
  -> readWorkspaceFromProdivixFiles(baseFiles)
  -> readWorkspaceFromProdivixFiles(targetFiles)
  -> validate both
  -> Prodivix diff
```

Git raw diff 只用于 source view：

```txt
home.pir.json changed line 32
```

三编辑器看到的是 Prodivix diff：

```txt
Button "Submit" text changed from "Save" to "Submit"
```

## 11. Layer 9：Prodivix Diff Layer

### 11.1 职责

Prodivix Diff Layer 把两个合法模型比较为用户可理解的变化。

它负责：

1. Workspace diff。
2. Route diff。
3. PIR graph diff。
4. NodeGraph diff。
5. Animation diff。
6. Code text diff 的统一入口。

### 11.2 稳定输出

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
};
```

### 11.3 PIR Diff 例子

Raw JSON:

```diff
- "childIdsById": { "root": ["a", "b"] }
+ "childIdsById": { "root": ["b", "a"] }
```

Prodivix diff：

```ts
{
  domain: 'pir',
  kind: 'pir.children.reordered',
  targetRef: {
    documentId: 'page_home',
    nodeId: 'root'
  },
  summary: 'Children of root were reordered'
}
```

Blueprint 可以把 `a` 和 `b` 高亮为顺序变化，而不是显示 JSON 行 diff。

### 11.4 NodeGraph Diff 例子

```txt
edge validate_cart.ok -> charge_card.input added
```

输出：

```ts
{
  domain: 'nodegraph',
  kind: 'nodegraph.edge.added',
  targetRef: {
    documentId: 'graph_checkout',
    nodeId: 'edge_1'
  }
}
```

### 11.5 Code Diff 例子

Code diff 使用 text diff engine，但仍由 workspace 确定 document identity：

```txt
WorkspaceDocument.type === 'code'
documentId === 'code_index'
```

Code editor 历史可以显示 Monaco diff，而不是 Prodivix graph diff。

## 12. Layer 10：Code Text History Layer

### 12.1 职责

Code Text History Layer 处理代码编辑器内部的文本编辑体验。

代码编辑器不能简单把整个 string 当 JSON value，每次输入都 `replace /content`。这会导致：

1. 每个字符都生成巨大 patch。
2. undo 粒度不自然。
3. selection/cursor 丢失。
4. 与 Monaco 内部 undo 冲突。

### 12.2 稳定类型

```ts
type CodeTextEdit = {
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  text: string;
};

type CodeCommandPayload = {
  documentId: string;
  languageId: string;
  edits: CodeTextEdit[];
  beforeSelection?: CodeSelection;
  afterSelection?: CodeSelection;
};
```

### 12.3 Command 例子

```ts
{
  namespace: 'core.code',
  type: 'text.edit',
  version: '1.0',
  target: {
    workspaceId: 'ws_1',
    documentId: 'code_index'
  },
  domainHint: 'code',
  payload: {
    edits: [
      {
        range: {
          startLine: 10,
          startColumn: 4,
          endLine: 10,
          endColumn: 9
        },
        text: 'count'
      }
    ]
  }
}
```

底层可以把它转换成可回放 text operation，但 public command 语义应保留 code text edit。

### 12.4 Undo 规则

在 Code Editor 内按 `Ctrl+Z`：

1. 如果 Monaco 内部正在 composition 或 selection edit，优先让 Monaco 处理当前编辑 session。
2. 当 edit session commit 后，生成 `core.code.text.edit` command。
3. Workspace history 记录合并后的 code command。
4. 跨 Git/history/diff 时使用 committed code command 和 text diff。

## 13. Layer 11：Editor Binding Layer

> 本文前面列了 10 个实现层。这里把 Editor Binding 单独列为入口层，因为它不保存模型，但决定用户体验是否正确。

### 13.1 职责

Editor Binding Layer 把当前激活编辑器映射到正确 history scope。

它负责：

1. 监听 editor-local keyboard shortcut。
2. 解析 active document。
3. 选择 undo/redo scope。
4. 对 code editor 保留 Monaco 优先级。

### 13.2 Blueprint 例子

```ts
onBlueprintUndo() {
  undo({
    kind: 'document',
    workspaceId,
    documentId: activePageDocId,
    domain: 'pir'
  });
}
```

这只撤销当前 page/layout/component PIR 文档里的 Blueprint 修改。

### 13.3 NodeGraph 例子

```ts
onNodeGraphUndo() {
  undo({
    kind: 'document',
    workspaceId,
    documentId: activeGraphDocId,
    domain: 'nodegraph'
  });
}
```

这只撤销节点图中的节点移动、edge connect、节点配置变更。

### 13.4 Animation 例子

```ts
onAnimationUndo() {
  undo({
    kind: 'document',
    workspaceId,
    documentId: activeAnimationDocId,
    domain: 'animation'
  });
}
```

这只撤销时间轴、keyframe、binding 变更。

### 13.5 Code Editor 例子

```ts
onCodeEditorUndo() {
  if (monacoCanUndoCurrentSession()) {
    monacoUndo();
    return;
  }

  undo({
    kind: 'document',
    workspaceId,
    documentId: activeCodeDocId,
    domain: 'code'
  });
}
```

Code editor 需要保留文本编辑器内部的自然编辑体验，但 committed history 仍回到 Workspace command。

## 14. 实施顺序

### Phase A：History Scope

交付：

```txt
packages/workspace/src/workspaceOperation.ts
packages/workspace/src/workspaceHistoryReplay.ts
packages/workspace/src/workspaceHistory.ts
```

能力：

1. `createWorkspaceHistoryState()`
2. `recordWorkspaceOperation(operation)`
3. `undoWorkspaceHistory(scope | scopes)`
4. `redoWorkspaceHistory(scope | scopes)`
5. `selectUndoWorkspaceHistoryEntry(scopes)`
6. `selectRedoWorkspaceHistoryEntry(scopes)`

验收：

1. NodeGraph scope 不撤销 Blueprint command。
2. Blueprint scope 不撤销 Animation command。
3. Workspace scope 可以撤销跨文档 transaction。

### Phase B：Transaction

交付：

```txt
packages/workspace/src/workspaceCommand.ts
```

能力：

1. 原子执行多 command。
2. 失败回滚。
3. 一个 transaction 只进 history 一次。
4. 一个 transaction 只进 outbox 一次。

验收：

1. 新建页面 transaction 成功时同时有 VFS、route、document。
2. 任一 command 失败时没有 partial state。

### Phase C：Domain Command Helpers

交付：

```txt
packages/workspace/src/commands/pirCommands.ts
packages/workspace/src/commands/workspaceCommands.ts
packages/workspace/src/commands/routeCommands.ts
packages/workspace/src/commands/nodeGraphCommands.ts
packages/workspace/src/commands/animationCommands.ts
packages/workspace/src/commands/codeCommands.ts
```

验收：

1. 编辑器不手写 JSON Pointer。
2. helpers 生成 forwardOps/reverseOps。
3. helpers 设置 domainHint 和默认 scope。

### Phase D：Domain Validators

交付：

```txt
packages/workspace/src/validators/routeValidator.ts
packages/workspace/src/validators/pirValidator.ts
packages/workspace/src/validators/nodeGraphValidator.ts
packages/workspace/src/validators/animationValidator.ts
packages/workspace/src/validators/codeValidator.ts
```

验收：

1. command apply 后按 domain 调对应 validator。
2. NodeGraph/Animation/Code 不借用 PIR validator。

### Phase E：Revision + Atomic Commit + Outbox

交付：

```txt
packages/workspace-sync/src/workspaceRevisions.ts
packages/workspace-sync/src/workspaceOutbox.ts
packages/workspace-sync/src/workspaceRevisionConflict.ts
packages/workspace-sync/src/workspaceSemanticDiff.ts
packages/workspace-sync/src/workspaceThreeWay.ts
packages/workspace-sync/src/workspaceConflictSession.ts
packages/workspace-sync/src/workspaceResolutionOperation.ts
packages/workspace-sync/src/workspaceOperationCommit.ts
```

当前进展：

1. [ ] 本地 command 可 durable 离线排队。
2. [x] Document ack 后更新 confirmed revisions。
3. [x] 409 后进入结构化 semantic rebase 或 conflict session。
4. [x] Resolution 相对最新 remote 生成新 Operation，不重放旧 reverse ops。
5. [x] Core 从 Operation 写集推导 exact commit revisions，Web 统一 tree/route/document/mixed `/operations/commit` transport。
6. [x] 后端在单数据库事务完成全部 CAS/Apply/revision/log/idempotency。

### Phase F：Git Projection + Prodivix Diff

交付：

```txt
packages/workspace/src/git/readWorkspaceAtRef.ts
apps/web/src/Prodivix-diff/*
```

验收：

1. 两个 Git ref 可还原 workspace。
2. Prodivix diff 输出 editor-friendly change list。
3. Code diff 走 text diff。

### Phase G：Editor Binding

交付：

```txt
Blueprint undo binding
NodeGraph undo binding
Animation undo binding
Code editor undo binding
```

验收：

1. 在 NodeGraph 按 `Ctrl+Z` 只撤销节点图修改。
2. 在 Blueprint 按 `Ctrl+Z` 只撤销当前 PIR 文档修改。
3. 在 Code Editor 按 `Ctrl+Z` 保持 Monaco 自然文本撤销体验。

## 15. 测试边界

测试只覆盖模型语义，不耦合 UI。

应该测试：

1. scope matching。
2. transaction atomicity。
3. reverseOps restore original。
4. validator failure blocks history entry。
5. outbox status transition。
6. Prodivix diff change kinds。

不应该测试：

1. DOM 层级。
2. className。
3. 具体标签结构。
4. `querySelector` / `closest` / `parentElement`。
5. 快照。
6. Monaco 内部 DOM。

## 16. 当前实现状态

已实现：

1. `packages/workspace/src/validateWorkspaceVfs.ts`
2. `packages/workspace/src/workspaceProjection.ts`
3. `packages/workspace/src/workspaceSelectors.ts`
4. `packages/workspace/src/workspaceCommand.ts`
5. `packages/workspace/src/workspaceOperation.ts`
6. `packages/workspace/src/workspaceHistoryReplay.ts`
7. `packages/workspace/src/workspaceHistory.ts`
8. `apps/web/src/editor/store/editorStore.workspaceSlice.ts`
9. `apps/web/src/editor/shortcuts/useWorkspaceHistoryShortcuts.ts`
10. `packages/workspace-sync/src/workspaceThreeWay.ts`
11. `packages/workspace-sync/src/workspaceConflictSession.ts`
12. `packages/workspace-sync/src/workspaceResolutionOperation.ts`
13. `packages/workspace-sync/src/workspaceOperationCommit.ts`
14. `apps/web/src/editor/workspaceSync/workspaceDocumentMutationExecutor.ts`
15. `apps/web/src/editor/workspaceSync/workspaceConflictResolutionExecutor.ts`
16. `apps/web/src/editor/features/revisionConflict/WorkspaceRevisionConflictSurface.tsx`

未实现但下一步优先：

1. Resource CRUD 与其他 Intent-only 写入的本地 `commands/*` planners。
2. `workspaceOutbox.ts`、durable persistence 与完整 ACK causality。
3. Code text checkpoint bridge。
4. Git revision adapter 与其余领域 diff 产品面。
5. mounted CSS create/bind 迁入单一 WorkspaceTransaction + Atomic Commit。

## 17. 完成定义

完成后应满足：

1. 每个编辑器有自己的 undo/redo scope。
2. 跨文档用户动作以 transaction 原子执行。
3. 所有写入都由 domain helper 生成 command。
4. 所有 command 都有可验证的 `forwardOps/reverseOps`。
5. 所有 domain 都有自己的 validator。
6. 本地 outbox 可离线排队并与后端 revision 对齐。
7. Git ref 可还原 workspace 并进入 Prodivix diff。
8. 三编辑器消费 Prodivix diff，代码编辑器消费 text diff。
9. Code editor 保留自然文本编辑体验。
10. 旧 `pirDoc`、`ui.root`、project PIR fallback 不进入新链路。
