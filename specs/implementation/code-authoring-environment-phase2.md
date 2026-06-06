# Code Authoring Environment Phase 2

## 状态

- Draft
- 日期：2026-05-17
- 关联：
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/27.diagnostic-presentation-contract.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/workspace/workspace-model.md`
  - `specs/implementation/authoring-symbol-environment-phase1.md`
  - `specs/implementation/authoring-environment-stable-structures.md`

## 目标

Phase 2 只落地 Code Authoring Environment 的稳定连接层，让 Workspace VFS 能承载 code-owned 内容，并让三编辑器通过稳定引用连接代码能力。

本阶段不实现完整 IDE，不接入完整 TypeScript language service，不确定首批业务 code slot 清单，也不重写三编辑器 UI。

Phase 2 的目标是固定以下长期边界：

1. Workspace VFS 可以保存 code document。
2. VFS path 直接等于用户代码路径。
3. Workspace code document 可以投影为 CodeArtifact。
4. CodeReference 使用 `artifactId` 主导的持久化模型。
5. CodeSlotRegistry 只声明“哪里可以接入代码”，不保存源码或集中保存 binding。
6. TriggerBinding / ActionContract 与 CodeSlot 分离，非代码 action 继续结构化存在。

## 当前状态

已有基础：

1. 前端 `StableWorkspaceDocumentType` 已包含 `code`。
2. 前端 workspace command 已包含 `domainHint: 'code'`。
3. 前端 command path guard 已允许 code document patch `/language`、`/source`、`/metadata` 和 `/x-*`。
4. Authoring Environment 已有 CodeArtifact、CodeSymbol、CodeScope、DiagnosticTargetRef、SourceSpan 和 provider registry。

缺口：

1. 后端 `WorkspaceDocumentType` 未包含 `code`。
2. 后端 workspace document content 仍按 JSON 文档保存，还没有 code document 内容模型。
3. Workspace projection 当前偏内部 `.mfe/documents/...` 投影，尚未把 VFS path 作为用户代码路径。
4. 当前 `CodeReference` 仍是轻量 `{ name, scopeId }` 查询形态，不适合作为持久化引用。
5. 尚未定义 CodeSlotContract、CodeSlotProvider、CodeSlotRegistry。
6. 尚未定义 TriggerBinding / ActionContract 的正式落地位置。

## 交付物

### 1. Workspace code document

后端和前端 Workspace 模型都必须支持 `code` document。

```ts
type StableWorkspaceDocumentType =
  | 'pir-page'
  | 'pir-layout'
  | 'pir-component'
  | 'pir-graph'
  | 'pir-animation'
  | 'code'
  | 'asset'
  | 'project-config';
```

后端需要增加：

```go
const WorkspaceDocumentTypeCode WorkspaceDocumentType = "code"
```

短期内容模型采用 JSON wrapper，适配当前后端 `jsonb` 存储：

```ts
type WorkspaceCodeDocumentContent = {
  language: CodeArtifactLanguage;
  source: string;
  metadata?: Record<string, unknown>;
};
```

规则：

1. `language` 是作者态能力枚举，不是编辑器 mode 字符串。
2. `source` 是代码文本事实源。
3. `metadata` 只能保存非事实源辅助信息，例如 formatter、generated 标记、origin。
4. code document 不要求 PIR v1.3 校验。
5. code document 的 patch path 允许 `/language`、`/source`、`/metadata`、`/metadata/*` 和 `/x-*`。
6. 如果后续支持纯文本 document content，也必须保留 JSON wrapper 的兼容读取能力。

### 2. VFS path 等于用户代码路径

WorkspaceDocument 的 path 必须反映用户心智路径。

```text
/pages/home.pir.json
/src/actions/openDialog.ts
/src/node-executors/fetchUser.ts
/styles/home.mounted.css
/shaders/wave.glsl
```

规则：

1. `WorkspaceDocument.id` 是稳定身份。
2. `WorkspaceDocument.path` 是用户路径，不是内部存储路径。
3. 移动或重命名只改变 path，不改变 document id。
4. Git 导出、文件树展示、错误文案和 Code Editor tab 使用 path。
5. CodeReference、SourceSpan、diagnostic target 和 command target 使用 id。
6. `.mfe/...` 仅保存 workspace manifest、route manifest、索引和内部投影数据。

Projection 要求：

1. `projectWorkspaceToMfeFiles` 输出用户代码文件时应使用 `WorkspaceDocument.path`。
2. `.mfe/workspace.json` 继续保存 document id、type、path、revision 和必要 metadata。
3. 对 code document，projection 可以输出源文件本体和 `.mfe` 中的 document metadata。
4. 读取 projection 时必须能用 `.mfe/workspace.json` 恢复 document id；不能通过 path 重新生成稳定 id。

### 3. CodeArtifact 投影

Workspace code document 是代码事实源，CodeArtifact 是作者态环境投影。

```ts
type WorkspaceCodeArtifact = {
  id: WorkspaceDocumentId;
  path: string;
  language: CodeArtifactLanguage;
  owner: CodeArtifactOwner;
  source: string;
  revision: string;
};
```

Phase 2 默认：

```text
CodeArtifact.id = WorkspaceDocument.id
```

投影规则：

1. `source` 来自 `WorkspaceCodeDocumentContent.source`。
2. `language` 来自 `WorkspaceCodeDocumentContent.language`。
3. `revision` 来自 `WorkspaceDocument.contentRev` 或等价 revision。
4. `owner.kind` 默认为 `workspace-module`，`documentId` 为 code document id。
5. 如果某个 code document 由 slot 创建，slot owner 不改变 artifact id；owner 只帮助诊断主落点。
6. owner 删除后 artifact 保留，状态变为 orphan。

建议新增 provider：

```ts
type WorkspaceCodeArtifactProvider = CodeArtifactProvider;
```

该 provider 从当前 workspace snapshot 中读取 `type === 'code'` 的 document，输出 CodeArtifact。

### 4. 持久化 CodeReference

Phase 2 将持久化 CodeReference 升级为 `artifactId` 主导模型。

```ts
type CodeReference = {
  artifactId: string;
  exportName?: string;
  symbolName?: string;
  sourceSpan?: SourceSpan;
};
```

规则：

1. `artifactId` 是主引用，默认等于 workspace code document id。
2. `exportName` 用于 TS / JS module export。
3. `symbolName` 用于 expression、CSS symbol、shader entry、adapter entry 等非标准 export 场景。
4. `sourceSpan` 只做定位辅助，不做身份。
5. `path` 可用于显示、搜索和恢复，但不得成为持久化主键。
6. 当前 `{ name, scopeId }` 轻引用可以保留为 resolver query input，但不进入 PIR / NodeGraph / Animation 保存态。

迁移要求：

1. 新增类型时避免破坏现有 Phase 1 空 resolver。
2. 需要兼容当前 `resolveReference(reference, context)` 方法签名。
3. 若保留轻引用，应命名为 `ScopedSymbolReference` 或类似概念，避免与持久化 `CodeReference` 混淆。

### 5. CodeSlotContract

CodeSlotContract 只描述某个产品对象上的代码插槽能力。

```ts
type CodeSlotKind =
  | 'event-handler'
  | 'validator'
  | 'node-executor'
  | 'animation-function'
  | 'external-adapter'
  | 'mounted-css'
  | 'workspace-module';

type CodeSlotContract = {
  id: string;
  ownerRef: DiagnosticTargetRef;
  kind: CodeSlotKind;
  inputTypeRef?: string;
  outputTypeRef?: string;
  capabilityIds: string[];
  defaultPlacement: DiagnosticPlacement[];
};
```

稳定规则：

1. Slot id 必须稳定，可由 domain、owner id 和 field path 组合。
2. `ownerRef` 决定产品对象主落点。
3. `kind` 决定默认创建模板和校验策略。
4. `inputTypeRef` / `outputTypeRef` 是签名约束，不规定完整类型系统。
5. `capabilityIds` 是能力声明，不是权限系统最终实现。
6. `defaultPlacement` 使用诊断展示契约，不单独发明 UI 落点协议。
7. CodeSlotContract 不保存源码。
8. CodeSlotContract 不集中保存 binding。

### 6. CodeSlotRegistry

CodeSlotRegistry 通过 provider 聚合 slot。

```ts
type CodeSlotProvider = {
  id: string;
  source: SymbolSource;
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
};

type CodeSlotRegistry = {
  register(provider: CodeSlotProvider): void;
  unregister(providerId: string): void;
  listProviders(): CodeSlotProvider[];
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
  listSlotsByOwner(ownerRef: DiagnosticTargetRef): CodeSlotContract[];
};
```

实现要求：

1. API 形态应与现有 CodeArtifact / CodeSymbol / Diagnostic provider registry 保持一致。
2. `register` 与现有 provider registry 一样只登记 provider；取消登记使用显式 `unregister(providerId)`。
3. provider id 重复时后注册覆盖或拒绝必须明确；建议与现有 registry 行为保持一致。
4. `listSlots` 聚合 provider 输出，不做 UI 排序策略。
5. `getSlot` 按 slot id 查找，首个匹配即可。
6. `listSlotsByOwner` 使用稳定 targetRef 比较，不依赖对象引用相等。
7. Registry 不读取具体编辑器 store。

### 7. CodeSlotBinding

Binding 是领域文档状态，不是 registry 全局状态。

```ts
type CodeSlotBinding = {
  slotId: string;
  reference: CodeReference;
};
```

规则：

1. PIR event、NodeGraph executor field、Animation binding field 和 adapter config 各自保存自己的 binding。
2. Binding 保存 CodeReference，不保存源码。
3. Binding 删除不删除 code document。
4. owner 删除后，binding 随领域对象消失；referenced artifact 默认 orphan。
5. orphan artifact 通过诊断或文件状态暴露给用户。

### 8. Orphan artifact

Orphan artifact 是代码写作心智下的默认安全策略。

发生条件：

1. slot owner 被删除。
2. slot binding 被删除。
3. CodeReference 指向的 owner 不再存在。
4. artifact 没有任何 active binding，但仍是 workspace code document。

状态建议：

```ts
type CodeArtifactLifecycle =
  | { status: 'active'; ownerRef?: DiagnosticTargetRef }
  | { status: 'orphan'; previousOwnerRef?: DiagnosticTargetRef }
  | { status: 'workspace-module' };
```

Phase 2 可以先不实现完整生命周期类型，但行为必须遵守：

1. 不自动删除 orphan code document。
2. 提供可定位诊断或文件状态。
3. 用户可以删除、重新绑定或转为 workspace module。
4. Export / codegen 可以跳过 orphan artifact，除非它仍被普通代码 import 使用。

### 9. TriggerBinding / ActionContract

TriggerBinding 表示事件触发什么，不等同于 CodeSlot。

```ts
type TriggerBinding =
  | { kind: 'open-url'; href: string }
  | { kind: 'navigate-route'; routeId: string }
  | { kind: 'run-nodegraph'; graphId: string; inputMapping?: unknown }
  | {
      kind: 'play-animation';
      timelineId: string;
      command: 'play' | 'pause' | 'seek';
    }
  | { kind: 'call-code'; slotId: string; reference: CodeReference };
```

规则：

1. 打开链接、路由跳转、执行节点图、播放动画等非代码 action 不需要 CodeSlot。
2. `call-code` 才需要 CodeSlot 和 CodeReference。
3. NodeGraph 和 Animation 仍是可视化运行时；它们内部的 custom executor、transform、easing、shader 才属于 code-owned。
4. AI 生成交互时优先选择结构化 action。
5. TriggerBinding 的正式保存位置由对应领域文档决定，Phase 2 只固定边界。

## 推荐落地顺序

### Step 1：补齐类型合同

前端：

1. 新增 `WorkspaceCodeDocumentContent`。
2. 升级持久化 `CodeReference` 类型，必要时拆出轻引用类型。
3. 新增 `CodeSlotKind`、`CodeSlotContract`、`CodeSlotProvider`、`CodeSlotRegistry`、`CodeSlotBinding`。
4. 新增 `TriggerBinding` / `ActionContract` 轻类型。
5. 导出新增类型，保持 alias import 风格。

后端：

1. 增加 `WorkspaceDocumentTypeCode`。
2. 调整 document type validation。
3. 为 code document 增加内容校验。
4. 确保 PIR v1.3 validator 不误用于 code document。

### Step 2：Workspace code document 写入链路

1. 后端 CreateDocument / PatchDocumentContent 支持 `code`。
2. PATCH 校验允许更新 code wrapper 的 source、language 和 metadata。
3. 前端 workspace command 保持 code domain path guard。
4. 增加最小 contract tests 覆盖 code document patch。

### Step 3：WorkspaceCodeArtifactProvider

1. 从 workspace snapshot 筛选 `type === 'code'` document。
2. 校验 content 符合 `WorkspaceCodeDocumentContent`。
3. 输出 CodeArtifact。
4. orphan 状态可以先由 metadata 或诊断 provider 后续补齐。

### Step 4：CodeSlotRegistry

1. 按现有 registry 模式实现 `createCodeSlotRegistry`。
2. 增加 provider register / unregister / list / get contract tests。
3. 不接具体 Blueprint / Inspector slot。
4. 不实现 UI。

### Step 5：TriggerBinding 轻类型

1. 只定义类型和边界。
2. 不迁移现有 trigger UI。
3. 不强行把当前所有 event 绑定改写为 TriggerBinding。

## 测试策略

只补稳定 contract tests，不写 DOM 耦合测试。

建议测试：

1. `WorkspaceDocumentTypeCode` 被后端接受。
2. code document patch 不触发 PIR v1.3 validator。
3. code document patch 只能修改允许路径。
4. WorkspaceCodeArtifactProvider 能把 code document 投影为 CodeArtifact。
5. CodeSlotRegistry 能注册 provider、聚合 slots、按 id 查找、按 owner 查找、取消注册。
6. 持久化 CodeReference 类型不依赖 path。

不做：

1. 不测具体 DOM 层级。
2. 不测 Inspector 具体渲染结构。
3. 不测完整 language service。
4. 不测完整 codegen。

## 验收标准

- [x] 后端支持 `WorkspaceDocumentTypeCode`。
- [x] 前后端共享的 workspace code document 内容模型明确。
- [x] code document 可以通过 workspace command 更新 source。
- [x] code document 可以通过 workspace command 创建并挂载到 VFS。
- [x] PIR document 仍受 PIR v1.3 graph-only 校验约束。
- [x] code document 不受 PIR v1.3 validator 约束。
- [x] VFS path 作为用户代码路径的 projection 规则明确。
- [x] Workspace code document 能投影为 CodeArtifact。
- [x] 持久化 CodeReference 以 `artifactId` 为核心。
- [x] CodeSlotContract / Provider / Registry 轻类型和 registry helper 存在。
- [x] CodeSlotRegistry 不保存源码和 binding。
- [x] TriggerBinding / ActionContract 与 CodeSlot 的边界类型存在。
- [ ] owner 删除后 orphan artifact 策略有文档和最小状态表达。

## 非目标

1. 不确定首批具体业务 slot。
2. 不实现完整 Code Editor UI。
3. 不接入完整 TypeScript language service。
4. 不实现完整 ReferenceResolver。
5. 不迁移所有 trigger UI。
6. 不实现 CRDT、二进制资产管线或完整 POSIX 文件系统。
7. 不改变 PIR v1.3 保存态结构。
