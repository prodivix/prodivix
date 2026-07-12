# Route System Unification Implementation Plan

## 状态

- Draft
- 日期：2026-07-02
- 关联：
  - `specs/router/route-manifest.md`
  - `specs/decisions/08.route-manifest-outlet.md`
  - `specs/decisions/09.component-route-composition.md`
  - `specs/decisions/13.route-runtime-contract.md`
  - `specs/diagnostics/route-diagnostic-codes.md`

## 1. 问题判断

当前路由系统已经跨过“纯预览 path state”的阶段，但距离真正可用还有明显差距。核心问题不是字段不够，而是 **workspace route 与组件 route 的语义没有统一**。

当前实现事实：

1. `apps/web/src/editor/store/editorStore.types.ts` 定义了 `WorkspaceRouteManifest` 和 `WorkspaceRouteNode`。
2. `apps/web/src/editor/store/editorStore.routeIntent.ts` 能创建 page、child route、layout，并维护 workspace documents。
3. `apps/web/src/editor/features/design/blueprint/editor/controller/useBlueprintEditorController.ts` 将 route manifest 同步到后端。
4. `apps/web/src/editor/features/design/blueprint/editor/components/Canvas/useActiveRoutePreview.ts` 根据 active route materialize page doc。
5. `apps/web/src/pir/renderer/PIRNode.tsx` 在 `PdxOutlet` 处注入 active route page。
6. `packages/ui/src/nav/PdxRoute.tsx` 仍然拥有自己的 children path matcher。

这说明项目级 route graph 已经存在，但 `PdxRoute`、导航 action、Outlet 注入、诊断和导出还没有共享同一个 route core。

## 2. 目标架构

目标是形成一条统一链路：

```txt
RouteManifest
  -> Route Resolver
  -> ResolvedRouteGraph / matchChain
  -> RouteRuntimeContext
  -> PdxOutlet / PdxRoute / navigate action / export planner
```

设计约束：

1. `RouteManifest` 是项目级路由唯一保存态。
2. `PdxRoute` 只能消费 route context 或 route module projection。
3. `PdxOutlet` 内容由 `matchChain` 决定，而不是临时 active route 拼接。
4. Route runtime refs 使用 Code Authoring Environment。
5. 后端、前端 store、renderer、export planner 共享同一套校验语义。

## 3. 已拍板产品语义

以下语义作为本计划后续实现的硬约束，不再在具体 UI 或 store 实现中重新解释。

1. Route 修改必须全部走 Command。UI 可以调用 route intent helper，但最终必须生成 `WorkspaceCommandEnvelope`，包含 `forwardOps`、`reverseOps`、target、domain hint 和 revision 语义。禁止 UI 组件直接改 `routeManifest.root`。
2. 删除 route 默认只解除引用，不隐式删除 page / layout / code document。被解除引用的文档进入 orphan 状态或普通 workspace document 状态，由后续资源/文档管理能力清理。即使该文档由 route 自动创建，也不做隐式删除，避免误删复用文档。
3. VFS path 不与 route path 自动强绑定。新建 route 时可以用 segment 生成默认 document name / path；后续重命名或移动 route 不自动移动 VFS 文档。`routeNodeId`、`documentId` 是身份，path 只是组织和显示信息。
4. v1 只实现 default outlet。当前保存态使用 `outletNodeId` 表示 default outlet 绑定；实现命名必须使用 `defaultOutlet`、`outletBindings`、`resolveOutletBinding` 这类可扩展命名，不写成 `singleOutlet` / `onlyOutlet`。
5. Route runtime 的 `loaderRef`、`actionRef`、`guardRef` 首批只实现保存态、CodeSlot、诊断和 export IR，不在编辑器预览中执行。真正执行需要 sandbox、async state、error boundary、cache 和权限策略稳定后再接入。

## 4. 稳定模型草案

Route core 不依赖 React、Zustand、Inspector 或 UI package。它只消费 Workspace snapshot 中的 route manifest、document registry 和必要的 PIR lookup adapter。

```ts
type RouteNode = {
  id: string;
  segment?: string;
  index?: boolean;
  layoutDocId?: string;
  pageDocId?: string;
  outletNodeId?: string;
  outletBindings?: Record<string, RouteOutletBinding>;
  runtime?: RouteRuntime;
  children?: RouteNode[];
};

type RouteOutletBinding = {
  outletNodeId: string;
  routeNodeId?: string;
  pageDocId?: string;
};

type RouteRuntime = {
  loaderRef?: CodeReference;
  actionRef?: CodeReference;
  guardRef?: CodeReference;
  errorBoundaryDocId?: string;
  suspenseDocId?: string;
  seo?: RouteSeo;
};

type ResolvedRouteMatch = {
  routeNodeId: string;
  routePath: string;
  segment: string;
  params: Record<string, string>;
  layoutDocId?: string;
  pageDocId?: string;
  defaultOutlet?: ResolvedOutletBinding;
  runtime?: RouteRuntime;
};

type ResolvedRouteGraph = {
  rootId: string;
  routesById: Record<string, ResolvedRouteNode>;
  flattened: ResolvedRouteNode[];
  diagnostics: ProdivixDiagnostic[];
};
```

实现约束：

1. `outletNodeId` 是 v1 default outlet 的短路径；`outletBindings.default` 是未来 named outlets 的自然升级方向。
2. `RouteOutletBinding.routeNodeId` 用于 named outlet 挂载具体 child route；v1 可以只解析 default match chain，不渲染 named outlets。
3. `ResolvedRouteMatch` 是 renderer、preview、navigate 和 export 的共同输入。任何调用方需要 path、params、page/layout 关系时都应从这里读取。
4. `RouteRuntime` 中的 code-owned 字段全部使用 `CodeReference`，不能内嵌源码字符串。
5. Route core 返回 `ProdivixDiagnostic[]`，不直接 toast，不直接写 UI 状态。

## 5. Route Core API

首批模块建议放在前端稳定模型层，例如 `apps/web/src/router/` 或 `apps/web/src/workspace/routeCore/`。若后端也需要复用同名规则，应同步一份 Go validator，测试样例保持一致。

首批 API：

```ts
normalizeRouteSegment(input: string): NormalizedRouteSegmentResult;
buildRoutePath(matchChain: ResolvedRouteMatch[]): string;
flattenRouteManifest(manifest: RouteManifest): ResolvedRouteNode[];
matchRouteManifest(manifest: RouteManifest, path: string): RouteMatchResult;
resolveRouteMatchChain(
  manifest: RouteManifest,
  routeNodeId: string
): ResolvedRouteMatch[];
resolveNavigateTarget(
  context: RouteRuntimeContext,
  target: NavigateTarget
): RouteNavigationResult;
resolveOutletBinding(
  input: ResolveOutletBindingInput
): ResolvedOutletBinding | null;
validateRouteManifest(input: ValidateRouteManifestInput): ProdivixDiagnostic[];
```

API 规则：

1. path normalization、动态段、wildcard、index route ranking 只有这一份实现。
2. `matchRouteManifest` 面向 URL/path；`resolveRouteMatchChain` 面向稳定 route id。编辑器 active route 优先用 route id，不通过 path 反查身份。
3. `resolveNavigateTarget` 支持 route id、relative path、absolute path 和 external URL；external URL 只返回外链结果，不进入 RouteGraph。
4. `validateRouteManifest` 可以接收 document lookup 和 PIR outlet lookup adapter；core 本身不扫描 editor store。

## 6. Command / Intent 契约

Route UI 调用 intent，intent 生成 command，command 执行 patch。Command 是 undo/redo、同步、AI dry-run/apply 和后端审计的统一入口。

| Intent                    | 主要 patch 目标                                           | 必须提供 reverseOps | revision               |
| ------------------------- | --------------------------------------------------------- | ------------------- | ---------------------- |
| `route.create-page`       | `/routeManifest/root`、`/docsById/<id>`、`/treeById`      | 是                  | route + workspace/doc  |
| `route.create-child`      | `/routeManifest/root`、可选 `/docsById/<id>`、`/treeById` | 是                  | route + workspace/doc  |
| `route.create-index`      | `/routeManifest/root`、可选 `/docsById/<id>`              | 是                  | route + workspace/doc  |
| `route.rename-segment`    | `/routeManifest/root/.../segment`                         | 是                  | route                  |
| `route.move`              | `/routeManifest/root`                                     | 是                  | route                  |
| `route.attach-layout`     | `/routeManifest/root/.../layoutDocId`                     | 是                  | route                  |
| `route.detach-layout`     | `/routeManifest/root/.../layoutDocId`                     | 是                  | route                  |
| `route.bind-outlet`       | `/routeManifest/root/.../outletNodeId`                    | 是                  | route                  |
| `route.unbind-outlet`     | `/routeManifest/root/.../outletNodeId`                    | 是                  | route                  |
| `route.set-runtime-ref`   | `/routeManifest/root/.../runtime/*Ref`                    | 是                  | route                  |
| `route.clear-runtime-ref` | `/routeManifest/root/.../runtime/*Ref`                    | 是                  | route                  |
| `route.delete`            | `/routeManifest/root`                                     | 是                  | route                  |
| `route.set-active`        | `/activeRouteNodeId`                                      | 是                  | local/workspace policy |

Command 规则：

1. Route mutating command 必须带 `domainHint: 'route'` 或等价 route domain。
2. Route patch path 只能写 `routeManifest` 和 active route 相关字段。创建 route 时如果自动创建 page/layout/code document，必须在同一个 transaction 中包含 workspace/document patch。
3. `route.delete` 不删除被引用文档，只从 route graph 移除引用。后续 orphan document 诊断或资源视图负责提示用户清理。
4. `route.set-active` 是否进入同步 outbox 由产品策略决定；但它仍必须走 command helper，以便 undo/redo 和 AI preview 一致。
5. 所有 route command apply 后必须运行 route validator；涉及 PIR 文档时还要运行 PIR validator 或 outlet lookup。
6. 创建关联文档必须按 document identity 使用 granular add/remove patch；整份 `/docsById` replace 已 Hard Cut。
7. 跨 route/workspace/document 的 Transaction 通过 Atomic WorkspaceOperation Commit 持久化；`route.set-active` 属于本地 selection，不进入远端 commit write set。

## 7. VFS 与文档生命周期

RouteGraph 和 Workspace VFS 解耦，但 route intent 可以帮用户创建合适的内部文档。

1. 新建 route 时，可以自动创建 `pir-page` document，并用 route segment 生成默认名称，例如 `/settings/profile` 初始 page 名为 `profile.pir.json` 或同等项目约定。
2. 拆分 layout 或 attach layout 时，可以自动创建 `pir-layout` document，并在 route node 上写入 `layoutDocId`。
3. route 重命名或移动不自动移动 VFS document path。后续如果提供“同步文档路径”操作，必须是显式 command。
4. 删除 route 不删除 page/layout/code document。解除引用后的 document 保留 `documentId`、path、contentRev 和 Git 投影身份。
5. 同一 document 可被多个 route 引用，但 validator 应能给出复用提示或策略诊断，避免用户误以为每个 route 都有独占页面。
6. 用户不需要理解 VFS 文件树即可完成 route/page/layout 操作；VFS 更新是 intent 的内部副作用。

## 8. Code Authoring 接入

Route runtime code 是 code-owned 能力。首批只建立保存态、slot、诊断和导出输入，不在编辑器预览中执行。

Code slot 建议：

| Slot id pattern                      | kind            | ownerRef       | 输入约束                       | 输出约束                      |
| ------------------------------------ | --------------- | -------------- | ------------------------------ | ----------------------------- |
| `route.${routeNodeId}.loader`        | `route-loader`  | route node     | `RouteRuntimeContext`          | serializable loader data      |
| `route.${routeNodeId}.action`        | `route-action`  | route node     | `RouteRuntimeContext` + submit | action result / redirect hint |
| `route.${routeNodeId}.guard`         | `route-guard`   | route node     | `RouteRuntimeContext`          | allow / redirect / block      |
| `route.${routeNodeId}.errorBoundary` | `route-runtime` | route node/doc | route error context            | error boundary document ref   |

实现规则：

1. Route runtime binding 保存 `CodeReference`，不保存源码。
2. 创建 loader/action/guard 时，通过 Code Authoring Environment 创建或选择 code document / CodeArtifact。
3. `CodeReference.artifactId` 是持久化主键，path 只用于显示。
4. ownerRef 使用 route node target，例如 `{ kind: 'route', routeId: routeNodeId }` 或后续稳定 route target ref。
5. runtime ref 指向不存在 artifact、artifact language 不匹配、owner 丢失或 output contract 不满足时，使用 `RTE-xxxx` 聚合 `COD-xxxx` 下游诊断。
6. AI 生成 route runtime code 必须走同一 slot 和 CodeReference，不得把代码字符串写入 route inspector local state。

## 9. Authoring Symbol Environment 接入

Route 应成为符号和作用域来源，而不是让 Inspector、AI、Code Editor 各自扫描 route manifest。

首批符号：

1. route node：`kind: 'route'`，targetRef 指向 route node。
2. route params：动态段 `:id` 进入当前 route scope。
3. search params：作为 `RouteRuntimeContext` 的可用输入符号。
4. loader data：首批可只定义 scope 和类型占位，不做真实执行。
5. route module scope：组件 route module 挂载时产生相对 scope。

规则：

1. `loaderRef/actionRef/guardRef` 的补全和诊断应从 Authoring Environment 查询 route symbols。
2. Route params 的同名冲突、遮蔽和不可达 scope 应由 route symbol provider 或 validator 产出诊断。
3. Issues 面板展示 route diagnostics 时必须保留 targetRef 和 sourceSpan。

## 10. Validator 规则

首批 `validateRouteManifest` 至少覆盖：

1. root 存在且 root id 稳定。
2. route id 全局唯一。
3. route graph 无环、无孤儿。
4. sibling segment 不重复。
5. sibling index route 不重复。
6. index route 不允许携带非空 segment。
7. dynamic segment 参数名合法且同一 match chain 内不冲突。
8. wildcard route 排序稳定，不能遮蔽更具体 sibling。
9. `pageDocId` / `layoutDocId` 指向存在的 workspace document，且 document type 合法。
10. route 有 children 且声明 layout 时，layout PIR 必须有可解析 default outlet。
11. `outletNodeId` 必须指向 layout document 内的 `PdxOutlet`。
12. 多个 default outlet 时必须显式绑定 `outletNodeId`。
13. `outletBindings` 若出现，只校验数据形状和 outlet 存在；v1 不渲染 named outlets。
14. `loaderRef/actionRef/guardRef` 必须是合法 CodeReference。
15. runtime refs 指向的 artifact 不存在时，诊断落到 route node 和 code reference。

后端保存 route manifest 前必须运行可等价的结构校验。前端可以做更完整的 PIR outlet lookup 和作者态诊断聚合。

## 11. Export Bridge

Export 不从画布组件树反推项目路由，而是消费 route core 输出。

最小 export 输入：

```ts
type RouteExportContribution = {
  routeGraph: ResolvedRouteGraph;
  matchEntries: ResolvedRouteMatch[];
  sourceTrace: ExportSourceTrace[];
  diagnostics: ProdivixDiagnostic[];
};
```

导出规则：

1. Export Program Builder 从 Workspace snapshot 读取 RouteManifest，经 route core 解析为 `ResolvedRouteGraph`。
2. React / Vite target 生成 route objects、layout/page nesting 和 runtime adapter stub。
3. `loaderRef/actionRef/guardRef` 首批输出为 source trace 和 adapter 输入，不要求生成真实可执行 loader。
4. route node、doc id、runtime artifact id 必须进入 source trace，便于 export diagnostics 回跳。
5. route diagnostics 应进入 Export Bundle diagnostics；严重 route graph 错误阻断导出。

## 12. 首批落地顺序

第一轮实现不碰 loader/guard/action 执行，先打牢模型闭环：

1. 提取 route core：normalize、flatten、match、matchChain、navigate target、validator。
2. 把 Blueprint 预览和 Outlet 注入改为消费 route core 的 matchChain。
3. 增加 route intent -> WorkspaceCommandEnvelope 映射和 reverseOps。
4. 增加 route validator 的前端测试，覆盖 path、doc ref、outlet 和 runtime ref 形状。
5. 将 `PdxRoute` 从项目级 matcher 收敛为 route context / route module projection 消费层。
6. 建立 route runtime CodeSlot / CodeReference 类型和最小诊断，不执行 runtime code。
7. Export Program Builder 接收 `ResolvedRouteGraph`，保留 route source trace。

## 13. Phase 0：文档与契约收敛

目标：先固定方向，避免继续扩张第二套路由语义。

任务：

1. 更新 ADR 08 / 09 / 13，明确 RouteGraph 权威性。
2. 更新 `specs/router/route-manifest.md`，记录当前实现缺口。
3. 新增本实施计划。
4. 将后续路由相关需求统一挂到本计划，而不是散落到 Inspector、renderer、export 文档中。

验收：

- [x] 文档明确 `PdxRoute` 不是项目级路由源。
- [x] 文档明确 `PdxOutlet` 绑定归 RouteGraph 管。
- [x] 文档明确 route 修改必须走 Command。
- [x] 文档明确删除 route 不隐式删除 workspace documents。
- [x] 文档明确 v1 只实现 default outlet，但为 named outlets 保留模型命名。

## 14. Phase 1：提取共享 Route Core

目标：把路径规则从 UI 组件和控制器里抽出来。

任务：

1. [x] 新建 route core 模块，提供：
   - `normalizeRouteSegment`
   - `buildRoutePath`
   - `flattenRouteManifest`
   - `matchRouteManifest`
   - `resolveRouteMatchChain`
   - `resolveNavigateTarget`
   - `resolveOutletBinding`
   - `validateRouteManifest`
2. [x] 将 `apps/web/src/editor/store/routeManifest.ts` 中的 path flatten 逻辑迁到 route core。
3. [x] 将 `packages/ui/src/nav/PdxRoute.tsx` 的 matcher 替换为 route core 消费层。
4. [x] 产出稳定 `RTE-xxxx` diagnostics。

验收：

- [x] 地址栏、`PdxRoute`、navigate action 使用同一个 path normalization。
- [x] 动态段和 wildcard 的 ranking 只有一份实现。
- [x] 重复 path、非法 segment、broken doc ref 可被统一诊断。
- [x] route core 不依赖 React、Zustand、Inspector 或 UI package。

## 15. Phase 2：RouteGraph 编辑能力补齐

目标：让用户能真正编辑路由树，而不是只新增根路径。

任务：

1. [x] 扩展 route intent，并为每个 intent 生成 `WorkspaceCommandEnvelope`：
   - `route.rename-segment`
   - `route.move`
   - `route.create-index`
   - `route.bind-outlet`
   - `route.unbind-outlet`
   - `route.attach-layout`
   - `route.detach-layout`
   - `route.delete`
   - `route.set-runtime-ref`
2. [x] route tree UI 支持多级 route 创建、移动、删除和重命名。
3. [x] route inspector 展示 path、segment、index、page、layout、outlet 和 diagnostics。
4. [x] 删除 page/layout 文档前检查 RouteGraph 引用。

当前实现状态：

- `RouteIntent` 已覆盖 `route.rename-segment`、`route.move`、`route.create-index`、`route.bind-outlet`、`route.unbind-outlet`、`route.attach-layout`、`route.detach-layout`、`route.delete` 和 `route.set-runtime-ref`。
- `createRouteIntentCommand` 已能为每个 RouteIntent 生成 `core.route` / `WorkspaceCommandEnvelope`，当前 forward/reverse ops 以 `/routeManifest` 替换作为稳定收口点。
- Blueprint 地址栏 Routes 菜单已支持创建子路由、创建 index route、重命名、上下移动和删除。
- Inspector Basic 面板已展示 active route 的 full path、segment/index、page/layout doc、outlet bindings、runtime refs 和 route validator diagnostics，并提供 attach/detach layout 操作入口。
- 已提供 `collectRouteDocumentRefs` / `isWorkspaceDocumentReferencedByRoute`，Public Resource 删除入口接入基础引用拦截；`applyWorkspaceCommand` 也会拒绝删除仍被 RouteGraph 引用的 page/layout 文档。

验收：

- [x] 用户可以建立 `/settings/profile` 这类多级路由。
- [x] 用户可以为任一路由拆分 layout 并绑定 Outlet。
- [x] 路由编辑不要求用户理解 VFS 文件树。
- [x] route 删除不隐式删除 page/layout/code document。
- [x] route 重命名或移动不自动移动 VFS path。

## 16. Phase 3：PdxRoute 与组件 Route Module 收敛

目标：消除组件路由和 workspace 路由之间的割裂。

任务：

1. [x] 定义 `RouteModule` 和 `RouteModuleMount` 数据结构。
2. [x] `component` 项目支持相对 route module 预览。
3. [x] `project` 项目支持把 route module 挂到宿主 RouteGraph。
4. [x] `PdxRoute` Inspector 从编辑任意 local path 改为选择 route scope / module scope / debug path。
5. [x] 移除项目级语义中对 `data-route-path` 的依赖。

当前实现状态：

- `WorkspaceRouteManifest` 支持 `modules` 与 `mounts`，并通过 `composeRouteManifestWithModules` 生成可预览的合成 RouteGraph。
- 合成 route source trace 记录 `moduleId`、`mountId`、source route node、host route node 和 resolved path。
- Blueprint 地址栏、内部导航路径反查和 active route preview 消费合成 RouteGraph，因此宿主 project 能预览挂载后的 module route。
- `PdxRoute` 不再读取 children 上的 `data-route-path` / `data-route-index` / `data-route-fallback`；它只作为 workspace/module route scope 的投影组件。
- renderer 已向 `PdxRoute` 注入合成后的 workspace route manifest、active route id，或由 `moduleScope` 解析出的 `RouteModule`。
- `PdxRoute` Inspector 已改为编辑 route scope、module scope 和 debug path。
- Route document reference guard 已覆盖 `RouteModule` 内的 page/layout refs。

验收：

- [x] `PdxRoute` 不再形成项目级第二路由源。
- [x] 组件 route module 可被挂载到不同宿主路径。
- [x] 合成 route 可追踪 source module 和 host route node。

## 17. Phase 4：RouteRuntimeContext 与导航统一

目标：让预览、交互和运行时配置使用同一个上下文。

任务：

1. [x] renderer context 增加 `RouteRuntimeContext`。
2. [x] `PdxOutlet` 从 `matchChain` 注入下一层内容。
3. [x] 内置 `navigate` action 通过 `resolveNavigateTarget` 解析 route id、relative path、absolute path 和 external URL。
4. [x] route runtime refs 接入 Code Authoring Environment：
   - `loaderRef`
   - `actionRef`
   - `guardRef`
5. [x] 建立 route runtime CodeSlotContract 和 CodeReference 保存态。
6. [x] Issues / Inspector 展示 route runtime diagnostics。

当前实现状态：

- shared route core 提供 `RouteRuntimeContext`、`ResolvedRouteMatch`、`resolveRouteRuntimeContext` 和 Phase 4 版 `resolveNavigateTarget`。
- `resolveNavigateTarget` 能区分 route id、relative path、absolute path、external URL 和 unmatched target；external URL 只返回结果，不在 core 内产生副作用。
- Blueprint controller 维护 concrete preview path，active route 继续使用稳定 route id；内置 navigate、地址栏和 canvas preview 消费同一个 route runtime resolver。
- `PIRRenderer` 接收 `routeRuntimeContext`，并把 route params、search params、hash 和 route summary 注入 renderer params。
- `PdxOutlet` 的内容注入来自 `RouteRuntimeContext.matchChain` 解析出的 active leaf page 和 outlet binding。
- route runtime refs 仍然只是 `CodeReference` 保存态；`loaderRef`、`actionRef`、`guardRef` 首批不在编辑器预览中执行。
- `createRouteRuntimeCodeSlotProvider` 为每个 route node 暴露 loader/action/guard CodeSlotContract，默认落点包含 inspector、code editor 和 issues panel。
- `validateRouteManifest` 会诊断 runtime ref 空 artifact 或缺失 CodeArtifact；诊断携带 route node id 和 artifact id。

验收：

- [x] 内部导航、地址栏切换和画布预览结果一致。
- [x] route params 能进入 renderer context。
- [x] loader / guard / action 诊断能定位到 code artifact 和 route node。
- [x] loader / guard / action 首批不在编辑器预览中执行。

## 18. Phase 5：后端校验与导出

目标：让保存和生产输出都相信同一个 RouteGraph。

任务：

1. [x] 后端 `SaveRouteManifest` 前执行 manifest schema 和语义校验。
2. [x] `workspace_routes` 保存 normalized manifest。
3. [x] Export Program Builder 读取 `ResolvedRouteGraph`。
4. [x] Production Export Planner 为不同 target 输出对应 route topology。
5. [x] 导出 source trace 保留 route node、doc id、module id 和 generated file 映射。

当前实现状态：

- 后端以单事务 `ImportWorkspaceSnapshot` 完成项目 bootstrap；它与 `SaveRouteManifest` 在写入 `workspace_routes` 前调用同一份 route manifest validator。非法 root、重复 route id、重复 sibling path/index、非法 segment、缺失 module mount、空 runtime CodeReference 会被拒绝。
- `workspace_routes.manifest_json` 继续保存经过 `normalizeJSONDocument` 的紧凑 JSON；语义校验发生在 normalized payload 上。
- compiler 新增 `createRouteExportContribution`，从 `WorkspaceRouteManifest` 经 shared route core 的 `composeRouteManifestWithModules`、`flattenRouteManifest` 和 `validateRouteManifest` 生成 route topology contribution。
- `ExportProgram` / `ExportProgramContribution` 支持 `routes: ExportRouteTopology`；`ProductionExportPlanner` 输出 `.prodivix/routes.json`，并把同一份 topology 写入 `.prodivix/export-manifest.json` 与 bundle metadata。
- route topology 记录 route node、path、parent、page/layout doc id、module mount source trace、runtime loader/action/guard CodeReference，以及 generated file 映射。
- Web 导出页的 React project export 会把当前 workspace RouteGraph 作为 export contribution 传入 compiler，不从画布组件树反推项目路由。
- route diagnostics 进入 `ExportBundle.diagnostics`；出现 `source: 'route'` 的 error 时，bundle metadata 标记 `exportBlocked`，导出页禁用 ZIP 下载。

验收：

- [x] 后端拒绝非法 route manifest。
- [x] 导出不从画布组件树反推项目路由。
- [x] route runtime refs 能输出到目标框架 adapter。
- [x] route diagnostics 进入 Export Bundle diagnostics，严重错误阻断导出。

## 19. 不做兼容层

项目仍处于 alpha 阶段。路由系统应做长期正确的 hard cut，而不是保留旧的局部 path matcher 作为兼容行为。

允许保留短期开发桥接，但必须满足：

1. 有明确删除点。
2. 不进入导出路径。
3. 不作为 AI patch 和诊断的权威来源。
4. 不新增用户可见的第二套概念。

## 20. 最小可用定义

路由系统达到“真正可用”的最低标准：

1. 用户能在 Route Tree 中创建、移动、重命名、删除多级路由。
2. 每个 route 能清晰绑定 page、layout 和 default outlet。
3. 地址栏、画布、导航 action、Inspector 和导出结果一致。
4. `PdxRoute` 与组件 route module 使用 workspace route core。
5. 保存、预览、导出都能给出同一套 `RTE-xxxx` 诊断。
6. 所有 route 修改都能 undo/redo，并能进入后端同步或 AI dry-run/apply。
7. named outlets 可以通过 `outletBindings` 扩展，不需要推翻 v1 default outlet 模型。
