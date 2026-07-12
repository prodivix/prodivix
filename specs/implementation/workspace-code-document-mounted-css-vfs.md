# Workspace Code Document 与 Mounted CSS VFS 实现文档

## 状态

- Draft
- 日期：2026-05-17
- 关联：
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/implementation/code-authoring-environment-phase2.md`
  - `specs/implementation/stable-workspace-command-diff-architecture.md`
  - `specs/implementation/workspace-command-history-layers.md`

## 背景

Mounted CSS 当前已经是编辑器里可编辑的代码内容，但实现上仍把 CSS 源码保存在 PIR node 的 `props.mountedCss[].content` 中。

这与 Decision 28 的长期边界冲突：

1. PIR / Blueprint node 应保存结构、引用和 slot binding。
2. code-owned 内容的源码事实源应进入 Workspace VFS 的 code document。
3. Code Authoring Environment 通过 `CodeArtifact`、`CodeReference` 和 `CodeSlot` 连接代码能力。

因此，Mounted CSS 迁移不能只是把导出路径改成 VFS 文件树，而必须让编辑器中的 Mounted CSS 从创建时就成为 workspace code document。

## 目标

1. 增加稳定的 workspace code document 创建链路。
2. 让前端可以从编辑器动作创建 VFS code document。
3. 让 Mounted CSS 创建时落到 VFS 文件，例如 `/styles/mounted/button-1.css`。
4. PIR node 只保存 Mounted CSS 的 `CodeSlotBinding` / `CodeReference`，不再保存 CSS 源码。
5. Mounted CSS 编辑器读取和保存 VFS code document 的 `/source`。
6. 保持非代码 trigger 的结构化 action 不受影响。
7. 不增加 DOM 耦合测试。

## 非目标

1. 不实现完整 Code Editor UI。
2. 不实现完整 TypeScript language service。
3. 不迁移所有 event handler、executor、adapter、shader。
4. 不重写 Inspector 结构。
5. 不改变 PIR v1.3 graph 保存态。
6. 不把 React 导出文件树反写为 VFS 文件。
7. 不为旧 Mounted CSS 裸内容长期保留兼容层。

## 当前状态

已经具备：

1. 前端 `WorkspaceCodeDocumentContent`：

   ```ts
   type WorkspaceCodeDocumentContent = {
     language: WorkspaceCodeDocumentLanguage;
     source: string;
     metadata?: Record<string, unknown>;
   };
   ```

2. 前端 `createWorkspaceCodeDocumentCommand(...)` 可以在本地 snapshot 上创建 code document 和 VFS doc node。
3. 后端 workspace document type 已支持 `code`。
4. 后端 code document patch 已允许 `/language`、`/source`、`/metadata`、`/metadata/*` 和 `/x-*`。
5. `WorkspaceCodeArtifactProvider` 可以把 `type === 'code'` 的 document 投影为 `CodeArtifact`。
6. `CodeReference` 已以 `artifactId` 为核心。
7. `CodeSlotContract`、`CodeSlotBinding`、`TriggerBinding` 类型已经存在。

仍缺失：

1. 后端还没有持久化创建 workspace document + VFS node 的 mutation。
2. 前端还没有从编辑器动作调用“创建 code document”的 API/helper。
3. 后端 mutation response 不能携带新增 document 和 tree 变化。
4. Mounted CSS 编辑器仍读写 PIR node `props.mountedCss[].content`。
5. Mounted CSS 还没有明确的 slot id、binding 保存位置和引用解析流程。

## 核心原则

### 1. 创建即入 VFS

Mounted CSS 是用户在编辑器里编辑的 code-owned 内容。

只要用户创建 Mounted CSS，就必须创建 workspace code document，而不是先把 CSS 字符串存进 PIR，等导出时再生成文件。

### 2. PIR 保存 binding，不保存源码

PIR node 只保存：

```ts
type CodeSlotBinding = {
  slotId: string;
  reference: CodeReference;
};
```

Mounted CSS 的 CSS 源码事实源在 workspace code document：

```ts
{
  type: 'code',
  path: '/styles/mounted/button-1.css',
  content: {
    language: 'css',
    source: '/* Mounted CSS */\n',
    metadata: {
      slotKind: 'mounted-css'
    }
  }
}
```

### 3. VFS path 是用户路径

Mounted CSS 的 VFS path 直接作为用户心智路径、文件树路径和 Git 导出路径。

推荐默认路径：

```text
/styles/mounted/<node-id>.css
```

如果后续支持 component scope，可以演进为：

```text
/components/<component-name>/mounted/<node-id>.css
```

### 4. 稳定身份使用 document id

CodeReference 使用 `artifactId`，Phase 2 等于 workspace document id。

路径变更不改变引用：

```ts
{
  reference: {
    artifactId: 'code_mounted_css_button_1';
  }
}
```

### 5. 删除 owner 不自动删文件

如果节点被删除，Mounted CSS code document 默认变成 orphan artifact，不自动删除。

后续由 Issues、文件树状态或清理动作提供删除、重新绑定、转为普通 workspace module。

## 目标数据模型

### Workspace code document

```ts
type StableWorkspaceDocument = {
  id: WorkspaceDocumentId;
  type: 'code';
  name: string;
  path: string;
  contentRev: number;
  metaRev: number;
  content: WorkspaceCodeDocumentContent;
};
```

Mounted CSS 示例：

```json
{
  "id": "code_mounted_css_button_1",
  "type": "code",
  "name": "button-1.css",
  "path": "/styles/mounted/button-1.css",
  "contentRev": 1,
  "metaRev": 1,
  "content": {
    "language": "css",
    "source": "/* Mounted CSS */\n",
    "metadata": {
      "slotKind": "mounted-css",
      "ownerNodeId": "button-1"
    }
  }
}
```

### VFS node

```json
{
  "id": "node_code_mounted_css_button_1",
  "kind": "doc",
  "name": "button-1.css",
  "parentId": "dir_styles_mounted",
  "docId": "code_mounted_css_button_1"
}
```

### PIR node binding

建议新增稳定字段，不继续把源码放进 `props.mountedCss[].content`。

Phase 1 可放在 `props.codeBindings` 或 `props.mountedCssBindings`，最终位置可在 PIR schema 细化时收敛。

推荐短期结构：

```ts
type PirNodeCodeBindings = {
  mountedCss?: CodeSlotBinding[];
};
```

PIR node 示例：

```json
{
  "id": "button-1",
  "type": "button",
  "props": {
    "className": "primaryButton",
    "codeBindings": {
      "mountedCss": [
        {
          "slotId": "blueprint.node.button-1.mountedCss",
          "reference": {
            "artifactId": "code_mounted_css_button_1"
          }
        }
      ]
    }
  }
}
```

## 后端实现

### 1. 新增 workspace document create mutation

需要一个后端 mutation，原子完成：

1. 校验 expected workspace revision。
2. 插入 workspace document。
3. 更新 `workspaces.tree_json`。
4. bump `workspace_rev` 和 `op_seq`。
5. 写入 `workspace_operations`。
6. 返回 mutation result。

推荐使用 intent：

```http
POST /api/workspaces/:workspaceId/intents
```

Intent：

```ts
type WorkspaceDocumentCreateIntent = {
  namespace: 'core.workspace';
  type: 'document.create';
  payload: {
    document: StableWorkspaceDocument;
    node: StableWorkspaceVfsNode;
    parentNodeId: WorkspaceVfsNodeId;
    insertIndex?: number;
  };
};
```

也可以先实现更窄的：

```ts
type WorkspaceCodeDocumentCreateIntent = {
  namespace: 'core.workspace';
  type: 'code-document.create';
  payload: {
    parentNodeId: string;
    documentId: string;
    nodeId: string;
    name: string;
    content: WorkspaceCodeDocumentContent;
  };
};
```

推荐优先实现通用 `document.create`，因为后续 PIR page、NodeGraph、Animation、asset 都需要同类能力。

### 2. Store 方法

新增：

```go
type CreateWorkspaceDocumentMutationParams struct {
    WorkspaceID          string
    ExpectedWorkspaceRev int64
    Document             WorkspaceDocumentRecord
    TreePatch            WorkspaceTreePatch
    Command              WorkspaceCommandEnvelope
}
```

或者更贴近 VFS：

```go
type CreateWorkspaceDocumentMutationParams struct {
    WorkspaceID          string
    ExpectedWorkspaceRev int64
    DocumentID           string
    DocumentType         WorkspaceDocumentType
    Name                 string
    Path                 string
    Content              json.RawMessage
    ParentNodeID         string
    NodeID               string
    InsertIndex          *int
    Command              WorkspaceCommandEnvelope
}
```

Store 必须在一个事务中：

1. `SELECT workspace_rev, route_rev, op_seq, tree_json FROM workspaces WHERE id=$1 FOR UPDATE`
2. 校验 `workspace_rev === expectedWorkspaceRev`
3. 解析 tree
4. 校验 parent node 存在且是 dir
5. 校验 node id 不重复
6. 校验 document id 不重复
7. 插入 workspace_documents
8. 更新 tree_json
9. `UPDATE workspaces SET workspace_rev = workspace_rev + 1, op_seq = op_seq + 1`
10. 插入 operation

### 3. VFS 校验

后端至少校验：

1. document type 合法。
2. code document content wrapper 合法。
3. parent node 存在且是 directory。
4. document path 与 VFS 派生路径一致。
5. document id、node id 不重复。
6. document 被挂载一次。

短期可以复用前端 validator 语义重新实现最小 Go 版，不要求共享代码。

### 4. Mutation response

短期可保持当前响应：

```ts
{
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  acceptedMutationId?: string;
}
```

创建和更新成功后，前端直接消费 mutation response 中的完整文档记录，不再为了 code document 内容同步重新拉取 workspace snapshot。

```ts
{
  workspaceId: string;
  workspaceRev: number;
  routeRev: number;
  opSeq: number;
  updatedDocuments?: WorkspaceDocumentRecord[];
  acceptedMutationId?: string;
}
```

## 前端实现

### 1. editorApi

新增：

```ts
type CreateWorkspaceCodeDocumentRequest = {
  expectedWorkspaceRev: number;
  parentNodeId: string;
  documentId: string;
  nodeId: string;
  name: string;
  content: WorkspaceCodeDocumentContent;
  clientMutationId?: string;
};
```

可以通过 `applyWorkspaceIntent` 发送：

```ts
editorApi.applyWorkspaceIntent(token, workspaceId, {
  expectedWorkspaceRev,
  intent: {
    id,
    namespace: 'core.workspace',
    type: 'code-document.create',
    version: '1.0',
    payload: {
      parentNodeId,
      documentId,
      nodeId,
      name,
      content,
    },
    issuedAt,
  },
});
```

### 2. 前端 helper

新增 workspace helper：

```ts
type CreateCodeDocumentInput = {
  workspace: StableWorkspaceSnapshot;
  parentNodeId: string;
  path: string;
  language: WorkspaceCodeDocumentLanguage;
  source: string;
  metadata?: Record<string, unknown>;
};
```

职责：

1. 生成 stable-ish document id。
2. 生成 VFS node id。
3. 解析 path，确保 parent directory 存在。
4. 如果目录不存在，Phase 1 可拒绝；Phase 2 再支持递归创建目录。
5. 发送后端 intent。
6. 成功后 refetch workspace snapshot。

### 3. 目录策略

Mounted CSS 默认目录：

```text
/styles/mounted
```

Phase 1 要么要求该目录存在，要么在创建 code document 前创建目录。

建议 Phase 1 先支持递归创建目录，因为新项目默认不会有 `/styles/mounted`。

可以把 intent 扩展为：

```ts
payload: {
  document: ...
  path: '/styles/mounted/button-1.css'
  ensureDirectories: true
}
```

后端根据 path 创建缺失目录节点。

这样前端不需要手写多次 tree patch。

### 4. store 同步策略

短期：

1. `code-document.create` 成功。
2. 调用 `editorApi.getWorkspace(token, workspaceId)`。
3. `setWorkspaceSnapshot(workspace)`。
4. 用新 document id 更新 PIR node binding。

注意：Mounted CSS 创建同时涉及 workspace document 创建和 PIR node binding 更新。

当前两步写入：

1. 创建 code document。
2. patch PIR document，写入 `CodeSlotBinding`。

如果第二步失败，code document 会保留为 orphan；这是现有缺口，不是原子性实现。

Hard Cut 目标是先在本地规划一个 WorkspaceTransaction：

1. Workspace Command 以 granular `/docsById/<document-id>` 与 tree patch 新增 CodeDocument。
2. Document-targeted PIR Command 更新 `CodeSlotBinding`。
3. `planWorkspaceOperationCommit` 推导 workspaceRev、new document absence 与 PIR contentRev preconditions。
4. 整条 Transaction 通过 `POST /workspaces/:id/operations/commit` 单事务持久化。

旧 `/batch` 已 Hard Cut，不能用逐条 Store mutation 为这两个步骤提供伪原子性。完成上述 planner 接线前，UI 必须把 orphan 风险作为未完成边界。

## Mounted CSS 迁移实现

### 1. Slot id 规则

Mounted CSS slot id：

```text
blueprint.node.<nodeId>.mountedCss
```

如果一个节点允许多个 Mounted CSS entry：

```text
blueprint.node.<nodeId>.mountedCss.<entryId>
```

Phase 1 建议每个节点一个 Mounted CSS document，降低绑定复杂度。

### 2. 打开编辑器

当前：

1. `resolveMountedCssEntries(node)` 从 `props.mountedCss` / metadata 中读取。
2. modal value 来自 `entry.content`。

目标：

1. 从 selected node 读取 mounted CSS binding。
2. 根据 `reference.artifactId` 找 workspace code document / CodeArtifact。
3. modal path 来自 artifact path。
4. modal value 来自 artifact source。
5. 如果没有 binding，打开时显示默认 path 和默认内容，但不立即创建文件。

是否“打开即创建”：

1. 用户只是打开 modal 可以不创建。
2. 用户点击保存时，如果没有 binding，创建 code document。
3. 这避免空文件污染 VFS。

### 3. 保存新 Mounted CSS

无 binding 时：

1. 生成 path：`/styles/mounted/<node-id>.css`。
2. 创建 code document：

   ```ts
   {
     language: 'css',
     source: mountedCssEditorValue || DEFAULT_MOUNTED_CSS_CONTENT,
     metadata: {
       slotKind: 'mounted-css',
       ownerKind: 'pir-node',
       ownerId: selectedNode.id
     }
   }
   ```

3. 后端创建成功后 refetch workspace。
4. patch active PIR document，写入：

   ```ts
   {
     slotId: `blueprint.node.${selectedNode.id}.mountedCss`,
     reference: { artifactId: documentId }
   }
   ```

5. 关闭 modal。

有 binding 时：

1. patch code document `/source`。
2. 不改 PIR node binding。
3. 如果 class index 仍需要用于 className token 定位，可写入 code document metadata 或由前端即时解析，不回写 PIR 源码字段。

### 4. ClassName token 定位

当前 `MountedCssEntry.classIndex` 从 CSS 内容解析后回写到 `props.mountedCss`。

目标：

1. `classIndex` 不作为 PIR 事实源。
2. 可以从 CodeArtifact.source 即时解析。
3. 如果需要缓存，可放在 code document metadata：

   ```ts
   metadata: {
     classIndex: {
       primaryButton: { line: 3, column: 1 }
     }
   }
   ```

4. metadata 只是辅助缓存，不能成为定位的唯一事实源。

### 5. 旧字段处理

不保留长期兼容层。

允许实现一次显式迁移动作：

1. 检测 node `props.mountedCss[].content`。
2. 为每个 entry 创建 code document。
3. 写入 binding。
4. 删除旧 `content` 字段或整个旧 `mountedCss` 字段。

迁移应是命令/intent 驱动，可审计、可撤销，不在 render 或 selector 中静默兼容。

## CodeArtifact 与诊断

### 1. Provider

Mounted CSS code document 通过现有 `WorkspaceCodeArtifactProvider` 变成：

```ts
{
  id: 'code_mounted_css_button_1',
  path: '/styles/mounted/button-1.css',
  language: 'css',
  owner: {
    kind: 'workspace-module',
    documentId: 'code_mounted_css_button_1'
  },
  source: '...',
  revision: '1'
}
```

后续可以根据 metadata 或 binding 解析 owner：

```ts
owner: {
  kind: 'pir-node',
  nodeId: 'button-1',
  documentId: 'doc_root'
}
```

Phase 1 不强制修改 provider owner 语义。

### 2. Orphan

如果 binding 写入失败，或 node 后续被删除，code document 保留。

诊断建议：

```text
COD-ORPHAN-ARTIFACT
```

落点：

1. VFS 文件树。
2. Issues 面板。
3. 如果 previousOwnerRef 存在，可提供“重新绑定”入口。

Phase 1 可先只保留文件，不实现诊断。

## 与导出 / codegen 的关系

### VFS tab

VFS tab 显示完整 workspace 文件树，应包含：

```text
/.prodivix/workspace.json
/.prodivix/route-manifest.json
/pir.json
/styles/mounted/<node-id>.css
```

### React export

React export 不是 VFS 文件事实源。

Mounted CSS 进入 VFS 后，React generator 应优先读取 CodeReference 指向的 CSS source。

短期过渡：

1. 如果 PIR node 仍有旧 `props.mountedCss.content`，旧 generator 可继续工作。
2. 新 binding 落地后，generator 增加 CodeReference -> CodeArtifact source 的读取路径。
3. 不在 React export 阶段反向创建 VFS 文件。

## 推荐落地阶段

### Phase A：后端创建 code document

交付：

1. `core.workspace/code-document.create` intent handler。
2. Store transaction：插入 document、更新 tree、bump workspace rev、写 operation。
3. 支持缺失目录创建，至少支持 `/styles/mounted`。
4. 后端 contract tests。

验收：

1. 创建 `/styles/mounted/button-1.css` 后 GET workspace 能看到 code document。
2. VFS tree 派生 path 与 document.path 一致。
3. invalid code content 被拒绝。
4. 重复 document id / node id 被拒绝。

### Phase B：前端创建 code document helper

交付：

1. `editorApi` 封装 create code document intent。
2. workspace helper 生成 id、path、content。
3. 创建成功后 refetch workspace。
4. contract tests 覆盖 helper 的 payload 生成和 path/id 稳定性。

验收：

1. 新建 code document 后 store 保留 wrapper，不做 PIR normalize。
2. ExportCode VFS tab 能显示新文件。

### Phase C：Mounted CSS 新建走 VFS

交付：

1. Mounted CSS modal 保存时，无 binding 则创建 VFS code document。
2. 创建成功后 patch PIR node binding。
3. 有 binding 时 patch code document `/source`。
4. `resolveMountedCssEntries` 改为从 binding + CodeArtifact 解析 Mounted CSS entry。

验收：

1. 新建 Mounted CSS 后，PIR node 不含 CSS 源码。
2. VFS tab 显示 `/styles/mounted/<node-id>.css`。
3. 再次打开 Mounted CSS editor，内容来自 VFS code document。
4. 保存修改只更新 code document contentRev。

### Phase D：显式迁移旧 Mounted CSS

交付：

1. 对旧 `props.mountedCss[].content` 提供显式 migrate command。
2. 迁移创建 code document、写 binding、删除旧源码字段。
3. 不在 selector/render 中长期保留旧字段兼容。

验收：

1. 旧数据迁移后可编辑。
2. 迁移后 VFS tab 有 CSS 文件。
3. PIR node 不再保存 CSS 源码。

## 测试策略

只写稳定 contract / state / API 测试，不写 DOM 耦合测试。

后端：

1. `code-document.create` 创建 code document。
2. 自动创建 `/styles/mounted` 目录。
3. document path 与 VFS path 不一致时拒绝。
4. invalid code wrapper 拒绝。
5. workspaceRev 冲突返回 409。

前端 workspace：

1. create code document helper 生成稳定 payload。
2. store 接收 refetched workspace 后保留 code wrapper。
3. CodeArtifactProvider 投影 CSS artifact。
4. VFS projection 输出 CSS 源文件本体。

Mounted CSS：

1. 无 binding 保存时调用 create code document helper。
2. 有 binding 保存时生成 patch `/source`。
3. PIR node patch 只写 binding，不写 CSS content。
4. class index 可由 source 解析。

不测试：

1. modal DOM 结构。
2. button className。
3. querySelector / closest / parentElement。
4. snapshot。

## 风险与决策点

### 1. 是否递归创建目录

建议要做。

原因：新项目默认只有 `/pir.json`，Mounted CSS 默认路径需要 `/styles/mounted`。如果不支持目录创建，前端会出现大量预置目录或复杂错误处理。

### 2. 创建 code document 和写 PIR binding 是否原子

最终必须原子：新增 CodeDocument、更新 tree 与写 PIR binding 是同一次用户动作，应形成单一 WorkspaceTransaction。

当前两步链路失败后保留 orphan artifact 只是过渡缺口，不能作为完成标准。

远端使用 ADR 36 的 Atomic WorkspaceOperation Commit，不使用旧 batch；任一 Command 或 validator 失败时整笔事务回滚。

### 3. PIR binding 字段位置

短期建议：

```ts
props.codeBindings.mountedCss;
```

原因：

1. 明确这是引用，不是样式源码。
2. 可扩展到 event handler、validator 等其他 slot。
3. 不把 binding 分散到多个临时字段。

最终位置可以在 PIR schema 专门版本中固定。

### 4. 旧 Mounted CSS 是否自动兼容

不做长期自动兼容。

允许显式迁移命令，迁移后删除旧源码字段。

### 5. React generator 什么时候改

Mounted CSS 新 binding 落地后再改。

在此之前 React generator 仍可读取旧 `props.mountedCss`，但新数据路径必须从 CodeReference 读取 CodeArtifact source。

## 完成标准

- [ ] 后端可以持久化创建 workspace code document。
- [ ] 后端可以在 VFS 中挂载新 document。
- [ ] 前端可以从编辑器动作创建 code document 并 refetch workspace。
- [ ] Mounted CSS 新建时创建 `/styles/mounted/<node-id>.css`。
- [ ] Mounted CSS 保存时更新 code document `/source`。
- [ ] PIR node 只保存 `CodeSlotBinding` / `CodeReference`。
- [ ] VFS tab 能看到 Mounted CSS 文件。
- [ ] React generator 能读取新 Mounted CSS binding。
- [ ] 旧 `props.mountedCss.content` 有显式迁移路径。
- [ ] 没有新增 DOM 耦合测试。
