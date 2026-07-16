# Prodivix 决策索引

## 全局产品阶段

- `specs/roadmap/global-phases.md`

该文档是 G0-G6 全局阶段、产品 Gate 与当前项目位置的唯一来源。各领域文档中的 Phase 编号只表示局部实施顺序。

## 核心决策（按主题）

1. **Workspace 与数据模型**
   - `specs/decisions/05.workspace-vfs.md`
   - `specs/decisions/35.canonical-workspace-hard-cut.md`
   - `specs/workspace/workspace-model.md`
2. **Undo/Redo 与命令协议**
   - `specs/decisions/06.command-history.md`
   - `specs/decisions/12.command-transaction-planner.md`
3. **同步与并发控制**
   - `specs/decisions/07.workspace-sync.md`
   - `specs/decisions/11.revision-partitioning.md`
   - `specs/decisions/36.atomic-workspace-operation-commit.md`
   - `specs/api/workspace-sync.openapi.yaml`
4. **路由体系与模块组合**
   - `specs/decisions/08.route-manifest-outlet.md`
   - `specs/decisions/09.component-route-composition.md`
   - `specs/decisions/13.route-runtime-contract.md`
   - `specs/router/route-manifest.md`
5. **PIR 契约与校验**
   - `specs/decisions/10.pir-contract-validation.md`
   - `specs/pir/PIR-contract-v1.3.md`（当前保存态）
6. **插件与安全扩展**
   - `specs/decisions/14.plugin-sandbox-and-capability.md`
   - `specs/decisions/29.plugin-extension-points.md`
7. **样式协议编辑器**
   - `specs/decisions/16.class-protocol-editor.md`
8. **外部组件库接入**
   - `specs/decisions/17.external-library-runtime-and-adapter.md`
9. **布局范式与内置 Inspector Schema**
   - `specs/decisions/19.layout-pattern-and-builtin-inspector-schema.md`
10. **NodeGraph Port 语义与连线约束**
    - `specs/decisions/30.react-flow-nodegraph-editor.md`
    - `specs/decisions/20.node-graph-port-semantics.md`
11. **LLM 集成架构**
    - `specs/decisions/22.llm-integration-architecture.md`
12. **Workspace Semantic Index 与代码作者环境**
    - `specs/decisions/28.code-authoring-environment.md`
    - `specs/decisions/25.authoring-symbol-environment.md`
13. **生产级编译与导出**
    - `specs/decisions/31.production-export-planner.md`
14. **核心 Package 边界**
    - `specs/decisions/34.core-package-boundaries.md`
15. **UX 诊断体系**
    - `specs/decisions/26.ux-diagnostics.md`
    - `specs/diagnostics/ux-diagnostic-codes.md`
16. **诊断展示契约**
    - `specs/decisions/27.diagnostic-presentation-contract.md`
17. **GitHub App 与 Git 集成**
    - `specs/decisions/23.github-app-integration.md`
18. **诊断码与错误体系**
    - `specs/diagnostics/README.md`
    - `specs/decisions/24.backend-diagnostic-envelope.md`
    - `specs/decisions/27.diagnostic-presentation-contract.md`
    - `specs/diagnostics/pir-diagnostic-codes.md`
    - `specs/diagnostics/workspace-diagnostic-codes.md`
    - `specs/diagnostics/editor-diagnostic-codes.md`
    - `specs/diagnostics/ux-diagnostic-codes.md`
    - `specs/diagnostics/code-diagnostic-codes.md`
    - `specs/diagnostics/route-diagnostic-codes.md`
    - `specs/diagnostics/nodegraph-diagnostic-codes.md`
    - `specs/diagnostics/animation-diagnostic-codes.md`
    - `specs/diagnostics/data-diagnostic-codes.md`
    - `specs/diagnostics/test-diagnostic-codes.md`
    - `specs/diagnostics/codegen-diagnostic-codes.md`
    - `specs/diagnostics/api-diagnostic-codes.md`
    - `specs/diagnostics/ai-diagnostic-codes.md`
19. **Blueprint Feature 结构与数据层**
    - `specs/decisions/32.blueprint-editor-feature-layout.md`
    - `specs/decisions/33.blueprint-data-layer-cleanup.md`
20. **持续验证语义作者架构**
    - `specs/decisions/37.verified-semantic-authoring-architecture.md`
    - `specs/roadmap/global-phases.md`
21. **Blueprint 组件复用与 Collection**
    - `specs/decisions/38.blueprint-component-instance-and-collection.md`
22. **PIR-current 稳定模型与低成本演进**
    - `specs/decisions/39.pir-current-evolution.md`
23. **G2 统一执行与项目运行环境**
    - `specs/decisions/40.execution-provider-and-job.md`
    - `specs/decisions/41.project-runner-and-canvas-modes.md`
24. **NodeGraph 正式执行会话**
    - `specs/decisions/42.nodegraph-execution-session.md`
25. **Animation Runtime Port 与正式执行会话**
    - `specs/decisions/43.animation-runtime-and-execution-session.md`
26. **Browser Test ExecutionProvider 与共享 Runtime Host**
    - `specs/decisions/44.browser-test-execution-and-runtime-host.md`
27. **DataOperation 与执行环境引用基础**
    - `specs/decisions/45.data-operation-and-environment-reference-foundation.md`

## 实施主计划

- `specs/implementation/template.md`（所有新实施计划的 Global Phase / Product Gate 模板）
- `specs/implementation/layout-pattern-and-builtin-inspector-task-backlog.md`
- `specs/implementation/node-graph-control-flow-ui-spec.md`
- `specs/implementation/g1-semantic-component-collection.md`
- `specs/implementation/g2-executable-full-stack-workspace.md`
- `specs/implementation/g2-execution-provider-remote-runner.md`
- `specs/implementation/g2-project-runner-execution-devtools.md`
- `specs/implementation/g2-nodegraph-execution-session.md`
- `specs/implementation/g2-animation-runtime-execution-session.md`
- `specs/implementation/g2-browser-test-execution-runtime-host.md`
- `specs/implementation/g2-data-operation-environment-runtime.md`
- `specs/implementation/ai-fine-grained-ui-actions.md`
- `specs/implementation/blueprint-editor-feature-layout-migration.md`
- `specs/implementation/blueprint-data-layer-cleanup-migration.md`
- `specs/implementation/plugin-browser-sandbox-phase4.md`
- `specs/implementation/official-component-plugins-phase46-48.md`

## ADR 状态与实现状态

ADR 的 `状态` 描述决策成熟度，不等同于代码完成度。实现完成度用 `实现状态` 单独记录，避免把 Draft 决策误读为“没有实现”，或把 Accepted 决策误读为“所有代码已完成”。

| ADR                                                         | 决策状态    | 实现状态                                                                                                                          | 当前能力                                                                                                                                                                                                                                                                                                             | 下一交付                                                                                               |
| ----------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `05.workspace-vfs.md`                                       | Accepted    | Implemented                                                                                                                       | Canonical Workspace VFS、validator、`.prodivix/**` projection、round-trip 与 semantic Workspace diff 已落地。                                                                                                                                                                                                        | 补齐 Git history bridge 与 Workspace/Route/Animation diff 产品面。                                     |
| `06.command-history.md`                                     | Accepted    | Local History Implemented                                                                                                         | Operation/Transaction History、scope/barrier、merge window、因果 undo/redo、Store 原子接线和编辑器快捷键已落地；Resource、Route、NodeGraph 与 Animation 通过 Operation planner 写入。                                                                                                                                | 建设跨领域 ChangeSet/Verification 与 local replica 恢复后的 History 协同。                             |
| `07.workspace-sync.md`                                      | Accepted    | Durable Write Path + Local Replica Implemented                                                                                    | semantic diff3/conflict、Atomic Commit、Operation/Settings 双 Outbox、ACK causality、local replica 与离线 materialization 共同构成唯一生产写路径。                                                                                                                                                                   | 推进多端实时订阅、presence、review 与按领域选择的 CRDT/typed transaction 协作。                        |
| `08.route-manifest-outlet.md`                               | Accepted    | G1 Route Core/Preview/Backend/Topology Implemented / G2 Layout Composition Planned                                                | Workspace RouteManifest、RouteRuntimeContext、Outlet preview、后端校验、Export topology 与 `routeRev` 写入链路已落地。                                                                                                                                                                                               | 在 G2 完成 React/Vite layout chain 与 route-outlet composition。                                       |
| `09.component-route-composition.md`                         | In Progress | G1 Frontend Composition Implemented / G2 Export Integration Planned                                                               | `RouteModule`、`RouteModuleMount`、合成 RouteGraph、source trace 与 `PdxRoute` route context 已落地。                                                                                                                                                                                                                | 在 G2 由 export planner 消费完整合成 route graph。                                                     |
| `10.pir-contract-validation.md`                             | Accepted    | PIR-current Domain Implemented                                                                                                    | 无版本领域模型、显式 current wire manifest、`PIRWire*` generation、codec/migration 与后端 current contract 已形成确定性边界。                                                                                                                                                                                        | 以 migration conformance 持续验证数字 wire 升级不扩散到生产消费者。                                    |
| `11.revision-partitioning.md`                               | Accepted    | Implemented                                                                                                                       | Workspace、Route、Document revisions、canonical 409、多分区 Atomic Commit 与 Outbox 因果 head 已落地。                                                                                                                                                                                                               | 让 G2 新领域继续复用同一分区与 Outbox 契约。                                                           |
| `12.command-transaction-planner.md`                         | Accepted    | Implemented                                                                                                                       | Domain planner、可逆 Command、原子 Transaction、受限 patch policy 与 WorkspaceOperation 写入边界已落地。                                                                                                                                                                                                             | 让新领域、AI、插件与 importer 持续复用同一规划和写入链路。                                             |
| `13.route-runtime-contract.md`                              | In Progress | G1 Context/CodeSlot Foundation Implemented / G2 Runtime Execution Planned                                                         | `RouteRuntimeContext`、params 注入、navigate resolver、runtime CodeReference 诊断与 loader/action/guard CodeSlotContract 已落地。                                                                                                                                                                                    | 在 G2 建立 route runtime execution、export adapter 与后端校验链路。                                    |
| `17.external-library-runtime-and-adapter.md`                | Draft       | Official Plugins Implemented / Generic Integration Planned                                                                        | Ant Design、MUI、Radix 由 bundled official plugins 提供 runtime、authoring 与 compiler contribution。                                                                                                                                                                                                                | 建设 generic arbitrary-library plugin、L0/L1 自动发现、可观测性与社区生态。                            |
| `19.layout-pattern-and-builtin-inspector-schema.md`         | Draft       | Implemented / Stabilizing                                                                                                         | Registry、preset 与 Inspector Panel 已落地。                                                                                                                                                                                                                                                                         | 稳定决策后升级为 Accepted。                                                                            |
| `21.inspector-panel-architecture.md`                        | Draft       | Implemented / Stabilizing                                                                                                         | Tab、Panel、Group、Field 体系是当前 Inspector 主结构。                                                                                                                                                                                                                                                               | 稳定 Section/Group 命名并升级决策状态。                                                                |
| `22.llm-integration-architecture.md`                        | Draft       | G1 Foundation                                                                                                                     | `@prodivix/shared` 与 `@prodivix/ai` 已提供 gateway、context、tool、trace、streaming 和 provider 基础；Blueprint assistant 提供 plan workflow。                                                                                                                                                                      | 按 `ai-fine-grained-ui-actions.md` 建设 Workspace Action Proposal、dry-run/apply 与 repair loop。      |
| `24-27 diagnostics`                                         | Draft       | G0/G1 Diagnostics + G2 Browser Test/Data Target Foundation Implemented                                                            | `@prodivix/diagnostics` 已承接 provider snapshot、revision、去重、presentation 与 typed Quick Fix；Web Issues 已接入主要作者态、语言/Shader、Browser Test 诊断，并提供 Data domain 与 data-source/data-operation target presentation。                                                                               | 接入 Data runtime、Plugin、UX、Export 与 Remote Execution provider。                                   |
| `25.authoring-symbol-environment.md`                        | Accepted    | Workspace Semantic Index + Core Domain Provider Composition Implemented                                                           | Immutable snapshot、revision identity、visibility、resolution、references、impact query，以及 Workspace/Route/PIR/NodeGraph/Animation/Data/Code/Token/Resolver/Asset provider composition 已落地并通过属性测试。                                                                                                     | 推进 Data consumer binding 与 Language Service worker lifecycle。                                      |
| `28.code-authoring-environment.md`                          | Accepted    | Code Workspace, Language, CodeSlot and Controlled Round-trip Implemented / G1 Passed                                              | Workspace code document、CodeArtifact/Reference、跨领域及 external adapter CodeSlot、orphan lifecycle、TS/JS/CSS/SCSS/GLSL/WGSL revision-bound session、独立 Shader Compile、PIR-current ↔ React/JSX + standalone CSS 原子 round-trip，以及 Golden/独立导出/browser Gate 已形成稳定边界。                            | 在 G2 扩展跨领域 owner-specific refactor 与 ExecutionProvider。                                        |
| `29.plugin-extension-points.md`                             | Draft       | Phase 1-4 Implemented / Extension Growth Planned                                                                                  | Manifest、Host Core、Browser sandbox/Gateway、official contribution contracts、React Host ABI、deterministic artifact、Blueprint Template 与 official plugins 已落地。                                                                                                                                               | 建设 broader extension points、write Gateway、SDK 与 Phase 5 生态。                                    |
| `30.react-flow-nodegraph-editor.md`                         | Accepted    | Standalone Workspace Document + Runtime Kernel Active / G3 Behavior Expansion Planned                                             | React Flow 编辑器投影独立 `pir-graph` Workspace document；`@prodivix/nodegraph` 承载无 DOM contract、strict decoder、Executor Registry、step budget 与 deterministic trace。                                                                                                                                         | 扩展 typed control/data flow、async/error/cancel、CodeSlot executor 与 Preview/Export conformance。    |
| `31.production-export-planner.md`                           | Draft       | G1 Planner + Standalone Build/Browser Gate Implemented / G2 Second-target Proof Planned                                           | `ExportProgram`、`ProductionExportPlanner`、package-manager/build policy、TSX/JSX 输出方言，以及独立项目 install/typecheck/test/build/browser-smoke Gate 已落地。                                                                                                                                                    | 在 G2 完成单一第二 target 的 CRUD 可移植性证明；广泛 Target SDK/生态留在 G6。                          |
| `32.blueprint-editor-feature-layout.md`                     | Draft       | Implemented                                                                                                                       | Blueprint、Animation 与 Development feature 已拥有清晰的并列边界；Inspector 和编辑器组件遵守当前目录约定。                                                                                                                                                                                                           | —                                                                                                      |
| `33.blueprint-data-layer-cleanup.md`                        | Draft       | Implemented                                                                                                                       | Blueprint 数据入口直连 owner module，viewport 与 preview-scale 配置各自拥有稳定边界。                                                                                                                                                                                                                                | —                                                                                                      |
| `34.core-package-boundaries.md`                             | Accepted    | G0/G1 Core Extracted + G2 Execution/Data Foundation                                                                               | Runtime、NodeGraph、Animation、Data、Router、Browser Runtime、PIR React Renderer、Workspace Outbox、local replica 与 Workspace Semantic Index 已有稳定 owner 与 revision-bound composition。                                                                                                                         | 让 G2 Data runtime、Remote runner 与 Secret resolution 继续遵守 package owner 边界。                   |
| `35.canonical-workspace-hard-cut.md`                        | Accepted    | Implemented                                                                                                                       | Canonical WorkspaceSnapshot、wire codec/settings envelope、Store 单快照、confirmed revision/edit sequence、Command/Transaction、route-aware active document 与严格加载门禁已落地。                                                                                                                                   | 让 G2 新领域继续复用同一 canonical boundary。                                                          |
| `36.atomic-workspace-operation-commit.md`                   | Accepted    | Implemented                                                                                                                       | Exact expected-vector planner、统一 Operation transport、后端单数据库事务、强幂等 replay、Resource domain、聚合 delta 与 Durable Outbox 已落地。                                                                                                                                                                     | 扩展已注册领域的验证语义，并保持唯一作者态远端写边界。                                                 |
| `37.verified-semantic-authoring-architecture.md`            | Accepted    | G0/G1 Passed + G2 Browser Execution Slices Implemented                                                                            | 七个能力平面已冻结；Semantic Index、Language、Component/Collection、controlled round-trip、standalone export/browser Gate，以及 Browser Preview/Test ExecutionProvider 已落地。                                                                                                                                      | 建设 Remote ExecutionProvider 与 G3 正式 VerificationEvidence。                                        |
| `38.blueprint-component-instance-and-collection.md`         | Accepted    | S0-S6 Implemented / G1 Passed                                                                                                     | Component/Collection contract、原子 extraction、完整产品表面、Preview/Compiler parity、controlled round-trip Golden journey，以及独立 export build/browser Gate 已落地。                                                                                                                                             | 在 G2 用真实 Data/API lifecycle 驱动 Collection loading/error。                                        |
| `39.pir-current-evolution.md`                               | Accepted    | PIR-current Architecture Implemented                                                                                              | G1 生产消费者统一使用无版本 current model；数字版本集中在 immutable wire snapshot、activation manifest、codec 与 migration 边界。                                                                                                                                                                                    | 以每次 wire 升级的空生产消费者 diff 作为低成本演进门禁。                                               |
| `40.execution-provider-and-job.md`                          | Accepted    | Contract + Browser Providers + Remote Control Plane/Worker D2 + Rootless Sandbox + Results/Resolver/HTTP/Auth Gateway Implemented | Revision-bound ExecutionRequest/Job/Session、Browser Preview/Test、neutral snapshot、Remote Control Plane/PostgreSQL/HTTP、Worker Agent、durable event/artifact blob/budget/retention、rootless Podman sandbox/GitHub Gate、Remote results、授权 resolver、有界 HTTP transport 与 Backend user-auth gateway 已落地。 | 生成远端 Isolation Gate 证据，并实现 isolated hosting/provider selection 与 permission。               |
| `41.project-runner-and-canvas-modes.md`                     | Accepted    | Browser Preview + Shared Host + Neutral Snapshot Implemented                                                                      | 蓝图 Design/Interactive/Run 三模式、独立 React/Vite runtime、HMR、原位 iframe 与共享 Execution Center 已贯通；Compiler 直接生产 provider-neutral snapshot，Preview/Test 以独立 descriptor 消费并共享 Runtime Host。                                                                                                  | 完成 Remote Runner、structured Console、Terminal/Network 与恢复 UX。                                   |
| `42.nodegraph-execution-session.md`                         | Accepted    | G2 Same-context Slice Implemented / Closure Evidence Pending                                                                      | Domain-owned provider、revision-bound document、实时 trace/log/diagnostic/SourceTrace、Run/Stop、Blueprint trigger、state patch result 与共享 Session/Console 已贯通；旧 browser 直调协议已删除。                                                                                                                    | G2 只补 conformance/export parity；typed data/async/CodeSlot 和 Behavior Verification 留在 G3。        |
| `43.animation-runtime-and-execution-session.md`             | Accepted    | G2 Browser Slice Implemented / Closure Evidence Pending                                                                           | Domain-owned scheduler/effect lease port 与 provider、完整单 timeline lifecycle、generation-fenced Browser effect store、revision-bound Play/Stop/Restart 和共享 Session/Console 已贯通；旧私有 RAF lifecycle 已删除。                                                                                               | G2 只补 lifecycle/export parity；composition、route、CodeSlot/shader 与 Evidence 留在 G3。             |
| `44.browser-test-execution-and-runtime-host.md`             | Accepted    | Browser Test + Shared Runtime Host + Neutral Snapshot + Remote Test Result Implemented                                            | Preview/Test 使用独立 provider descriptor、Job 与 Session，共享 Browser Runtime Host 的 filesystem/dependency lifecycle；Compiler 生产 neutral snapshot，`runtime-vitest` 为 Browser/Remote Worker 转换 canonical `ExecutionTestReport`，Remote 仅持久化 report artifact/trace。                                     | 完成 artifact resolver、产品 composition、Data mock/live safety 与两 target parity；Evidence 留在 G3。 |
| `45.data-operation-and-environment-reference-foundation.md` | Accepted    | Canonical Data + PIR Binding/Lifecycle Foundation Implemented                                                                     | Data current contract、typed Workspace/Semantic、PIR/Collection durable binding、显式 lifecycle mapping，以及 reference-only environment/Secret identity 已建立。                                                                                                                                                    | 完成 invocation、policy/runtime adapter、Secret/zone permission 和 Preview/Test/Export CRUD parity。   |
