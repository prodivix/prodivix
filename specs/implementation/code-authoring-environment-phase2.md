# Code Authoring Environment Phase 2

## 状态

- DecisionStatus：Accepted
- 日期：2026-05-17
- ImplementationStatus：Multi-language, Cross-editor CodeSlot, External Adapter Lifecycle, Controlled Round-trip and Target Compile Vertical Slices Implemented
- ProductGateStatus：Passed
- Global Phase：G1 Semantic Hybrid Authoring
- 关联：
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/27.diagnostic-presentation-contract.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/workspace/workspace-model.md`
  - `specs/implementation/g1-semantic-component-collection.md`

## 目标

Phase 2 落地 Code Authoring Environment 的稳定连接层，让 Workspace VFS 承载 code-owned 内容，并让三编辑器通过稳定引用连接代码能力。当前实现以 revision-bound Code Language Capability session 接入 TypeScript/JavaScript、CSS/SCSS 与 GLSL/WGSL，使 semantic contribution、Code Editor、Issues 与 Workspace 写入共享同一 snapshot 和定位 contract；独立 Shader Compile Capability 已用 canonical target profile 接通 WebGL2/WebGPU、Code Editor inline diagnostic 与 Issues；领域 CodeSlot binding projection 又把 Blueprint、Route、NodeGraph、Animation、External Library 与 Resources 接到同一 authoring composition；PIR-current、canonical React/JSX 与 standalone CSS 已形成 capability-partitioned controlled round-trip，并进入 Golden History/reload/replay/Compiler 与独立导出项目 install/typecheck/test/build/browser-smoke Gate。External adapter 的 canonical config binding、显式 slot-managed metadata、`COD-3017` orphan diagnostic、重新绑定、module conversion 与 active-binding 删除保护已经落地。

Phase 2 的目标是固定以下长期边界：

1. Workspace VFS 可以保存 code document。
2. VFS path 直接等于用户代码路径。
3. Workspace code document 可以投影为 CodeArtifact。
4. CodeReference 使用 `artifactId` 主导的持久化模型。
5. CodeSlotRegistry 聚合“哪里可以接入代码”与领域 binding 的只读 projection，不保存源码或集中保存 binding。
6. TriggerBinding / ActionContract 与 CodeSlot 分离，非代码 action 继续结构化存在。

## 当前状态

1. 前后端 Workspace model 支持 `code` document，Command path guard 支持 `/language`、`/source`、`/metadata` 和 `/x-*`。
2. `WorkspaceCodeDocumentContent` 是 code document 的当前内容契约，VFS path 是用户代码路径。
3. `WorkspaceCodeArtifactProvider` 把 canonical code document 投影为 CodeArtifact。
4. 持久化 `CodeReference` 以 `artifactId` 为主引用，CodeSlotContract / Provider / Registry 与 TriggerBinding / ActionContract 已建立稳定边界。
5. `@prodivix/authoring` 承载 CodeArtifact、CodeReference、CodeSlot、DiagnosticTargetRef、SourceSpan 与 provider composition；跨领域 symbol、scope、reference 与 impact contract 由 Workspace Semantic Index 统一定义。
6. `@prodivix/authoring` 已冻结 revision-bound Code Language session、stale/unsupported/unavailable result、diagnostic、completion、hover、rename proposal 与 semantic contribution contract。
7. `@prodivix/code-language` 已实现 TypeScript/JavaScript、CSS/SCSS 与 GLSL/WGSL adapter；同一 session 提供 definition、references、completion、diagnostics、hover、rename proposal，并向 Workspace Semantic Index 发布各语言的规范化 symbol/reference facts。
8. Code Editor 与 Issues 统一消费该 session 和 semantic diagnostic snapshot；Workspace planner 将带 artifact revision 的 language edits 严格合并为原子 Transaction。
9. Route runtime、PIR event/mounted CSS、NodeGraph executor 与 Animation timeline 已提供领域 CodeSlot provider；Workspace 从同一 snapshot 组合 slot、binding projection 与 semantic reference。
10. Shader compile 使用独立 session/provider registry；Workspace metadata 保存 target/stage/entry profile，WebGL2/WebGPU backend 只消费 canonical CodeArtifact，编译诊断以 `COD-5002` 同步进入 Code Editor 与 Issues。
11. Blueprint Inspector、NodeGraph 原有代码节点、Animation Inspector 与 Code Resources 已接入 CodeSlot 绑定、definition 跳转及 reference/impact usage；NodeGraph 不再持久化裸代码字符串。

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
4. code document 使用自身领域 validator，与 PIR-current validator 保持独立。
5. code document 的 patch path 允许 `/language`、`/source`、`/metadata`、`/metadata/*` 和 `/x-*`。
6. `WorkspaceCodeDocumentContent` 是当前 canonical 内容模型；后续内容模型调整使用协调契约更新。

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
6. `.prodivix/...` 仅保存 workspace manifest、route manifest、索引和内部投影数据。

Projection 要求：

1. `projectWorkspaceToProdivixFiles` 输出用户代码文件时应使用 `WorkspaceDocument.path`。
2. `.prodivix/workspace.json` 继续保存 document id、type、path、revision 和必要 metadata。
3. 对 code document，projection 可以输出源文件本体和 `.prodivix` 中的 document metadata。
4. 读取 projection 时必须能用 `.prodivix/workspace.json` 恢复 document id；不能通过 path 重新生成稳定 id。

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

当前 provider contract：

```ts
type WorkspaceCodeArtifactProvider = CodeArtifactProvider;
```

该 provider 从当前 workspace snapshot 中读取 `type === 'code'` 的 document，输出 CodeArtifact。

### 4. 持久化 CodeReference

持久化 CodeReference 使用 `artifactId` 主导模型。

```ts
type CodeReference = {
  artifactId: string;
  exportName?: string;
  symbolId?: string;
  sourceSpan?: SourceSpan;
};
```

规则：

1. `artifactId` 是主引用，默认等于 workspace code document id。
2. `exportName` 用于 TS / JS module export。
3. `symbolId` 用于 expression、CSS symbol、shader entry、adapter entry 等非标准 export 场景，并与 Workspace Semantic Index 的 artifact 内地址对齐。
4. `sourceSpan` 只做定位辅助，不做身份。
5. `path` 可用于显示、搜索和恢复，但不得成为持久化主键。
6. Workspace Semantic Index 使用独立的 semantic query 对象表示查询上下文；PIR / NodeGraph / Animation 保存态统一使用 `CodeReference`。

### 5. CodeSlotContract

CodeSlotContract 只描述某个产品对象上的代码插槽能力。

```ts
type CodeSlotKind =
  | 'event-handler'
  | 'validator'
  | 'node-executor'
  | 'animation-function'
  | 'animation-script'
  | 'shader'
  | 'external-adapter'
  | 'mounted-css'
  | 'route-loader'
  | 'route-action'
  | 'route-guard'
  | 'route-runtime'
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
  source: AuthoringSource;
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
  listBindingProjections(
    context: AuthoringContext
  ): CodeSlotBindingProjection[];
  getBindingProjection(id: string): CodeSlotBindingProjection | null;
};

type CodeSlotRegistry = {
  register(provider: CodeSlotProvider): void;
  unregister(providerId: string): void;
  listProviders(): CodeSlotProvider[];
  listSlots(context: AuthoringContext): CodeSlotContract[];
  getSlot(id: string): CodeSlotContract | null;
  listSlotsByOwner(ownerRef: DiagnosticTargetRef): CodeSlotContract[];
  listBindingProjections(
    context: AuthoringContext
  ): CodeSlotBindingProjection[];
  getBindingProjection(id: string): CodeSlotBindingProjection | null;
  listBindingProjectionsByArtifact(
    artifactId: string
  ): CodeSlotBindingProjection[];
};
```

实现要求：

1. API 复用 `@prodivix/authoring` 的稳定 provider composition 原则；symbol/scope contribution 使用 Workspace Semantic Index contract。
2. `register` 与现有 provider registry 一样只登记 provider；取消登记使用显式 `unregister(providerId)`。
3. provider id 重复时后注册覆盖或拒绝必须明确；建议与现有 registry 行为保持一致。
4. `listSlots` 聚合 provider 输出，不做 UI 排序策略。
5. `getSlot` 按 slot id 查找，首个匹配即可。
6. `listSlotsByOwner` 使用稳定 targetRef 比较，不依赖对象引用相等。
7. Registry 不读取具体编辑器 store。
8. Binding projection 是绑定领域文档与 semantic reference 的 revision-bound 只读桥；它不成为第二保存态。

### 7. CodeSlotBinding

Binding 是领域文档状态，不是 registry 全局状态。

```ts
type CodeSlotBinding = {
  slotId: string;
  reference: CodeReference;
};

type CodeSlotBindingProjection = Readonly<{
  binding: CodeSlotBinding;
  ownerRef: DiagnosticTargetRef;
  semanticReferenceId: string;
}>;
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
  | { kind: 'run-nodegraph'; documentId: string; inputMapping?: unknown }
  | {
      kind: 'play-animation';
      documentId: string;
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

## 已交付组成

1. 前后端共享 `WorkspaceDocumentTypeCode` 与 `WorkspaceCodeDocumentContent`。
2. Workspace Command / Transaction 承载 code document 创建、源码更新与 binding。
3. Workspace projection 使用用户代码路径，并保留稳定 document id。
4. `WorkspaceCodeArtifactProvider` 从 Workspace snapshot 发布 CodeArtifact。
5. `createCodeSlotRegistry` 提供 provider register / unregister、slot query，以及按 owner、artifact 和 semantic reference 查询领域 binding projection。
6. TriggerBinding / ActionContract 区分结构化 action 与 code-owned action。
7. `@prodivix/code-language` 从 immutable CodeArtifact snapshot 建立 TypeScript/JavaScript/CSS/SCSS/GLSL/WGSL session，并发布对应 code semantic contribution。
8. Code Editor 和 Issues 使用同一 revision-bound language result；rename proposal 通过 Workspace Transaction planner 进入正式写入链路。
9. Route runtime、PIR event/mounted CSS、NodeGraph executor 与 Animation timeline 从同一 Workspace snapshot 组合 CodeSlot binding projection，并复用 Semantic Index definition/reference/impact 查询。
10. Blueprint Inspector、NodeGraph、Animation Inspector 与 Code Resources 提供绑定、定义跳转和反向 usage 入口；NodeGraph 源码只保存在 Workspace code document。
11. `ControlledSourceManifest`、版本化 region marker 与 CodeArtifact ownership 投影明确划分 PIR-owned 受控内容和 code-owned 未知源码。
12. `react-jsx` adapter 管理 Element structure、literal props、literal text 与带 fallback subtree 的 Contract Slot Outlet；`css` adapter 通过 stable node-id selector 管理 standalone literal style。data/event/non-literal fields 与 Slot Outlet prop binding 按 node identity 保留，protected field 覆盖、unsupported shape、executable expression、marker/manifest 分叉与 drift 全部 fail closed。
13. PIR 文档是唯一 canonical owner；writable projection 的唯一性按 `(PIR document, capability)` 校验，因此同一 PIR 可以继续接入任意数量的不重叠 adapter，而同一 capability 不会出现竞争写入。
14. 代码保存和视觉写入都由 controlled round-trip planner 转换为可逆 Workspace Operation；需要多文件同步时形成单个 Transaction，并通过 Durable Outbox 与 Atomic Commit 提交。
15. Blueprint Code 页原子创建并分别打开 JSX/CSS，Code Resources 识别 adapted artifact 并使用同一 planner 保存；区域外源码保持逐字节不变。
16. Golden G1 在同一 Workspace 旅程中覆盖 Public Contract props/events/slots/variants、Slot Outlet、controlled JSX/CSS、Code -> PIR、PIR -> Code、原子 undo/redo、reload/replay 与 Compiler；独立 React/Vite 临时项目消费生成的 package-manager 契约并完成 install/typecheck/test/build。
17. External library project config 保存唯一 adapter binding，CodeArtifact metadata 仅保存 slot-managed 来源；删除 library/binding 不删除源码。Workspace 与 Resources 共同提供 active/orphan/workspace-module 派生状态、`COD-3017`、原子创建/绑定、重新绑定、module conversion 和 active-binding 删除保护。
18. Code Resources 已接通 F2 symbol rename 与 CodeArtifact move：rename proposal 先由 Semantic Index 计算跨领域 owner 影响，再进入原子 Workspace Transaction；无法由 code owner 安全改写的命名 CodeReference 会在 apply 前阻断并提供 owner 回跳。path move 由 current-model relocation planner 生成可逆 Workspace Operation，只改变 VFS path/tree projection，artifact identity、binding 与 semantic reference 保持不变。

## 稳定契约测试

1. `WorkspaceDocumentTypeCode` 被后端接受。
2. code document 使用独立内容 validator 和允许路径。
3. WorkspaceCodeArtifactProvider 能把 code document 投影为 CodeArtifact。
4. CodeSlotRegistry 能注册 provider、聚合 slots 与 binding projections、按 id/owner/artifact 查找并取消注册。
5. 持久化 CodeReference 使用 `artifactId` 身份，path 只承载展示与定位。
6. TypeScript/JavaScript/CSS/SCSS/GLSL/WGSL session 的 definition、references、completion、diagnostics、hover、rename 与 semantic contribution 都绑定同一 snapshot identity。
7. language edit planner 对 artifact revision、SourceSpan 越界、重叠、非 code document 和 no-op fail closed，并保持跨 artifact Transaction 的确定性与可逆性。
8. controlled JSX/CSS 属性测试覆盖各自 capability 的 canonical 往返；conformance 覆盖 Code -> PIR、PIR -> Code、JSX/CSS 原子 Transaction 与两类未知源码保留。
9. Golden G1 conformance 覆盖受控投影与完整作者态旅程；`verify:g1:standalone` 验证当前 compiler 产物生成的独立项目可安装、类型检查、测试和构建，`verify:g1:browser` 验证真实浏览器加载、路由、交互与 WebGL2/WebGPU availability。
10. External adapter 属性测试覆盖 bind -> orphan -> workspace module 的可逆状态转换，并保证普通零 binding module 不被误判为 orphan。
11. Code refactor 属性测试覆盖 rename impact 的 provider-order invariance、named/default owner 区分、stale fail-closed，以及 artifact move 的 identity/content preservation、VFS relocation 与 History round-trip。

测试聚焦公开类型、Command 状态结果、provider composition 和稳定引用语义。
