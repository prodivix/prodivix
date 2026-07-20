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
    - `specs/diagnostics/behavior-diagnostic-codes.md`
    - `specs/diagnostics/verification-diagnostic-codes.md`
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
28. **Auth、Permission 与 Server Runtime**
    - `specs/decisions/46.auth-and-server-runtime.md`
29. **Binary Asset Pipeline**
    - `specs/decisions/47.binary-asset-pipeline.md`
30. **受控第二 Framework Target**
    - `specs/decisions/48.controlled-vue-vite-portability-target.md`
31. **Data Stream 与统一 SourceTrace Debugger**
    - `specs/decisions/49.data-stream-and-source-debugger.md`
32. **Remote Terminal 跨副本恢复**
    - `specs/decisions/50.remote-terminal-replicated-recovery.md`
33. **Remote Terminal managed KMS 与 multi-Region recovery**
    - `specs/decisions/51.remote-terminal-managed-kms-and-multi-region-recovery.md`
34. **Remote Execution regional PostgreSQL、Worker 与 traffic disaster recovery**
    - `specs/decisions/52.remote-execution-regional-disaster-recovery.md`
35. **有界 Terminal emulator 与 Execution Center 产品面**
    - `specs/decisions/53.bounded-terminal-emulator-product-surface.md`
36. **Vue/Vite 产品面与 authenticated Catalog CRUD Golden**
    - `specs/decisions/54.vue-vite-product-surface-and-authenticated-catalog-golden.md`
37. **Data Stream Recovery、Credential Renewal 与 Incremental Collection**
    - `specs/decisions/55.data-stream-recovery-credential-renewal-and-incremental-collection.md`
38. **G3 Behavior & Verification Closure**
    - `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md`
    - `specs/decisions/57.verification-plan-impact-and-policy.md`
    - `specs/decisions/58.verification-evidence-provenance-and-retention.md`
    - `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md`
    - `specs/decisions/60.nodegraph-typed-flow-and-behavior-debugging.md`
    - `specs/decisions/61.animation-route-composition-and-reduced-motion.md`
    - `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md`
    - `specs/decisions/63.verification-product-surface-diagnostics-and-ci.md`
    - `specs/roadmap/g3-behavior-verification-milestones.md`
    - `specs/roadmap/g3-closure-evidence.md`

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
- `specs/implementation/g2-auth-server-runtime.md`
- `specs/implementation/g2-binary-asset-pipeline.md`
- `specs/implementation/g3-behavior-verification-closure.md`
- `specs/implementation/g3-behavior-scenario-authoring-and-composition.md`
- `specs/implementation/g3-verification-plan-impact-policy.md`
- `specs/implementation/g3-verification-evidence-provenance-retention.md`
- `specs/implementation/g3-deterministic-replay-runtime-controls.md`
- `specs/implementation/g3-nodegraph-typed-flow-debugger.md`
- `specs/implementation/g3-animation-route-composition-reduced-motion.md`
- `specs/implementation/g3-verification-adapters-product-ci.md`
- `specs/implementation/ai-fine-grained-ui-actions.md`
- `specs/implementation/blueprint-editor-feature-layout-migration.md`
- `specs/implementation/blueprint-data-layer-cleanup-migration.md`
- `specs/implementation/plugin-browser-sandbox-phase4.md`
- `specs/implementation/official-component-plugins-phase46-48.md`

## ADR 状态与实现状态

ADR 的 `状态` 描述决策成熟度，不等同于代码完成度。实现完成度用 `实现状态` 单独记录，避免把 Draft 决策误读为“没有实现”，或把 Accepted 决策误读为“所有代码已完成”。

| ADR                                                                        | 决策状态    | 实现状态                                                                                            | 当前能力                                                                                                                                                                                                                                                                                                                                                                            | 下一交付                                                                                            |
| -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `05.workspace-vfs.md`                                                      | Accepted    | Implemented                                                                                         | Canonical Workspace VFS、validator、`.prodivix/**` projection、round-trip 与 semantic Workspace diff 已落地。                                                                                                                                                                                                                                                                       | 补齐 Git history bridge 与 Workspace/Route/Animation diff 产品面。                                  |
| `06.command-history.md`                                                    | Accepted    | Local History Implemented                                                                           | Operation/Transaction History、scope/barrier、merge window、因果 undo/redo、Store 原子接线和编辑器快捷键已落地；Resource、Route、NodeGraph 与 Animation 通过 Operation planner 写入。                                                                                                                                                                                               | 建设跨领域 ChangeSet/Verification 与 local replica 恢复后的 History 协同。                          |
| `07.workspace-sync.md`                                                     | Accepted    | Durable Write Path + Local Replica Implemented                                                      | semantic diff3/conflict、Atomic Commit、Operation/Settings 双 Outbox、ACK causality、local replica 与离线 materialization 共同构成唯一生产写路径。                                                                                                                                                                                                                                  | 推进多端实时订阅、presence、review 与按领域选择的 CRDT/typed transaction 协作。                     |
| `08.route-manifest-outlet.md`                                              | Accepted    | G1 Route Core/Preview/Backend/Topology Implemented / G2 Layout Composition Planned                  | Workspace RouteManifest、RouteRuntimeContext、Outlet preview、后端校验、Export topology 与 `routeRev` 写入链路已落地。                                                                                                                                                                                                                                                              | 在 G2 完成 React/Vite layout chain 与 route-outlet composition。                                    |
| `09.component-route-composition.md`                                        | In Progress | G1 Frontend Composition Implemented / G2 Export Integration Planned                                 | `RouteModule`、`RouteModuleMount`、合成 RouteGraph、source trace 与 `PdxRoute` route context 已落地。                                                                                                                                                                                                                                                                               | 在 G2 由 export planner 消费完整合成 route graph。                                                  |
| `10.pir-contract-validation.md`                                            | Accepted    | PIR-current Domain Implemented                                                                      | 无版本领域模型、显式 current wire manifest、`PIRWire*` generation、codec/migration 与后端 current contract 已形成确定性边界。                                                                                                                                                                                                                                                       | 以 migration conformance 持续验证数字 wire 升级不扩散到生产消费者。                                 |
| `11.revision-partitioning.md`                                              | Accepted    | Implemented                                                                                         | Workspace、Route、Document revisions、canonical 409、多分区 Atomic Commit 与 Outbox 因果 head 已落地。                                                                                                                                                                                                                                                                              | 让 G2 新领域继续复用同一分区与 Outbox 契约。                                                        |
| `12.command-transaction-planner.md`                                        | Accepted    | Implemented                                                                                         | Domain planner、可逆 Command、原子 Transaction、受限 patch policy 与 WorkspaceOperation 写入边界已落地。                                                                                                                                                                                                                                                                            | 让新领域、AI、插件与 importer 持续复用同一规划和写入链路。                                          |
| `13.route-runtime-contract.md`                                             | In Progress | G1 Context/CodeSlot Foundation Implemented / G2 Runtime Execution Planned                           | `RouteRuntimeContext`、params 注入、navigate resolver、runtime CodeReference 诊断与 loader/action/guard CodeSlotContract 已落地。                                                                                                                                                                                                                                                   | 在 G2 建立 route runtime execution、export adapter 与后端校验链路。                                 |
| `17.external-library-runtime-and-adapter.md`                               | Draft       | Official Plugins Implemented / Generic Integration Planned                                          | Ant Design、MUI、Radix 由 bundled official plugins 提供 runtime、authoring 与 compiler contribution。                                                                                                                                                                                                                                                                               | 建设 generic arbitrary-library plugin、L0/L1 自动发现、可观测性与社区生态。                         |
| `19.layout-pattern-and-builtin-inspector-schema.md`                        | Draft       | Implemented / Stabilizing                                                                           | Registry、preset 与 Inspector Panel 已落地。                                                                                                                                                                                                                                                                                                                                        | 稳定决策后升级为 Accepted。                                                                         |
| `21.inspector-panel-architecture.md`                                       | Draft       | Implemented / Stabilizing                                                                           | Tab、Panel、Group、Field 体系是当前 Inspector 主结构。                                                                                                                                                                                                                                                                                                                              | 稳定 Section/Group 命名并升级决策状态。                                                             |
| `22.llm-integration-architecture.md`                                       | Draft       | G1 Foundation                                                                                       | `@prodivix/shared` 与 `@prodivix/ai` 已提供 gateway、context、tool、trace、streaming 和 provider 基础；Blueprint assistant 提供 plan workflow。                                                                                                                                                                                                                                     | 按 `ai-fine-grained-ui-actions.md` 建设 Workspace Action Proposal、dry-run/apply 与 repair loop。   |
| `24-27 diagnostics`                                                        | Draft       | G0/G1 Diagnostics + G2 Browser Test/Data Target Foundation Implemented                              | `@prodivix/diagnostics` 已承接 provider snapshot、revision、去重、presentation 与 typed Quick Fix；Web Issues 已接入主要作者态、语言/Shader、Browser Test 诊断，并提供 Data domain 与 data-source/data-operation target presentation。                                                                                                                                              | 接入 Data runtime、Plugin、UX、Export 与 Remote Execution provider。                                |
| `25.authoring-symbol-environment.md`                                       | Accepted    | Workspace Semantic Index + Core Domain Provider Composition Implemented                             | Immutable snapshot、revision identity、visibility、resolution、references、impact query，以及 Workspace/Route/PIR/NodeGraph/Animation/Data/Code/Token/Resolver/Asset provider composition 已落地并通过属性测试。                                                                                                                                                                    | 推进 Data consumer binding 与 Language Service worker lifecycle。                                   |
| `28.code-authoring-environment.md`                                         | Accepted    | Code Workspace, Language, CodeSlot and Controlled Round-trip Implemented / G1 Passed                | Workspace code document、CodeArtifact/Reference、跨领域及 external adapter CodeSlot、orphan lifecycle、TS/JS/CSS/SCSS/GLSL/WGSL revision-bound session、独立 Shader Compile、PIR-current ↔ React/JSX + standalone CSS 原子 round-trip，以及 Golden/独立导出/browser Gate 已形成稳定边界。                                                                                           | 在 G2 扩展跨领域 owner-specific refactor 与 ExecutionProvider。                                     |
| `29.plugin-extension-points.md`                                            | Draft       | Phase 1-4 Implemented / Extension Growth Planned                                                    | Manifest、Host Core、Browser sandbox/Gateway、official contribution contracts、React Host ABI、deterministic artifact、Blueprint Template 与 official plugins 已落地。                                                                                                                                                                                                              | 建设 broader extension points、write Gateway、SDK 与 Phase 5 生态。                                 |
| `30.react-flow-nodegraph-editor.md`                                        | Accepted    | Standalone Workspace Document + Runtime Kernel Active / G3 Behavior Expansion Planned               | React Flow 编辑器投影独立 `pir-graph` Workspace document；`@prodivix/nodegraph` 承载无 DOM contract、strict decoder、Executor Registry、step budget 与 deterministic trace。                                                                                                                                                                                                        | 扩展 typed control/data flow、async/error/cancel、CodeSlot executor 与 Preview/Export conformance。 |
| `31.production-export-planner.md`                                          | Draft       | G1 Planner + Vue Current-contract Product Gate Implemented                                          | `ExportProgram`、`ProductionExportPlanner`、package-manager/build policy、TSX/JSX 输出方言，以及 React/Vite 与 Vue/Vite 独立 install/typecheck/test/build/browser-smoke Gate 已落地；Vue 已执行 authenticated Catalog PIR/Route/Auth/Server/Asset、parent route chain 与 layout/default/named outlet Local/Remote journey。                                                         | 广泛 Target SDK/生态留待后续。                                                                      |
| `32.blueprint-editor-feature-layout.md`                                    | Draft       | Implemented                                                                                         | Blueprint、Animation 与 Development feature 已拥有清晰的并列边界；Inspector 和编辑器组件遵守当前目录约定。                                                                                                                                                                                                                                                                          | —                                                                                                   |
| `33.blueprint-data-layer-cleanup.md`                                       | Draft       | Implemented                                                                                         | Blueprint 数据入口直连 owner module，viewport 与 preview-scale 配置各自拥有稳定边界。                                                                                                                                                                                                                                                                                               | —                                                                                                   |
| `34.core-package-boundaries.md`                                            | Accepted    | G0/G1 Core Extracted + G2 Runtime Active / G3 Packages Planned                                      | 既有领域 package owner 与 revision-bound composition 已稳定；G3 target `@prodivix/behavior`、`@prodivix/verification` 的依赖方向、拥有/禁止边界和 composition 规则已冻结。                                                                                                                                                                                                          | 先建立 G3 package/current/wire/boundary，再接 Workspace、adapter 与产品纵切。                       |
| `35.canonical-workspace-hard-cut.md`                                       | Accepted    | Implemented                                                                                         | Canonical WorkspaceSnapshot、wire codec/settings envelope、Store 单快照、confirmed revision/edit sequence、Command/Transaction、route-aware active document 与严格加载门禁已落地。                                                                                                                                                                                                  | 让 G2 新领域继续复用同一 canonical boundary。                                                       |
| `36.atomic-workspace-operation-commit.md`                                  | Accepted    | Implemented                                                                                         | Exact expected-vector planner、统一 Operation transport、后端单数据库事务、强幂等 replay、Resource domain、聚合 delta 与 Durable Outbox 已落地。                                                                                                                                                                                                                                    | 扩展已注册领域的验证语义，并保持唯一作者态远端写边界。                                              |
| `37.verified-semantic-authoring-architecture.md`                           | Accepted    | G0/G1 Passed + G2 Execution Implemented / G3 Contract Frozen                                        | 七个能力平面已冻结；Semantic Index、Language、Component/Collection、controlled round-trip、standalone export/browser Gate 与 Browser/Remote ExecutionProvider 已落地；ADR 56-63 已冻结 G3 Behavior/Verification contract。                                                                                                                                                          | 实现 BehaviorScenario、Plan、Evidence 与跨 surface closure。                                        |
| `38.blueprint-component-instance-and-collection.md`                        | Accepted    | S0-S6 Implemented / G1 Passed                                                                       | Component/Collection contract、原子 extraction、完整产品表面、Preview/Compiler parity、controlled round-trip Golden journey，以及独立 export build/browser Gate 已落地。                                                                                                                                                                                                            | 在 G2 用真实 Data/API lifecycle 驱动 Collection loading/error。                                     |
| `39.pir-current-evolution.md`                                              | Accepted    | PIR-current Architecture Implemented                                                                | G1 生产消费者统一使用无版本 current model；数字版本集中在 immutable wire snapshot、activation manifest、codec 与 migration 边界。                                                                                                                                                                                                                                                   | 以每次 wire 升级的空生产消费者 diff 作为低成本演进门禁。                                            |
| `40.execution-provider-and-job.md`                                         | Accepted    | Contract + Browser/Remote Providers + Terminal Core + Remote Control Plane/Worker D2 Implemented    | Revision-bound ExecutionRequest/Job/Session、Browser Preview/Test、neutral snapshot、Remote Control Plane/PostgreSQL/HTTP、Worker Agent、durable event/artifact blob/budget/retention、rootless Gate、Remote results/HTTP/Auth gateway，以及 Terminal grant/lease/cursor/幂等/预算、跨副本恢复、AWS KMS/MRK、regional PostgreSQL/Worker/traffic DR 与有界 emulator 产品纵切已落地。 | 首次真实云端 regional RPO/RTO drill 与首次 live MRK evidence。                                      |
| `41.project-runner-and-canvas-modes.md`                                    | Accepted    | Browser/Remote Preview + Shared Host + Neutral Snapshot + Execution Devtools Foundation Implemented | 蓝图 Design/Interactive/Run 三模式、独立 React/Vite runtime、HMR、原位 iframe、Structured Console、Network、Remote Terminal、runtime Files、Server/Data SourceTrace 与共享 Execution Center 已贯通；Preview/Test 以独立 descriptor 消费 neutral snapshot。                                                                                                                          | 扩展更多 execution producer 的统一 debugger 与 recovery 产品旅程。                                  |
| `42.nodegraph-execution-session.md`                                        | Accepted    | G2 Same-context Slice + Conformance Closure Implemented                                             | Domain-owned provider、revision-bound document、trace/log/diagnostic/SourceTrace、Run/Stop、Blueprint trigger、state patch、timeout/unknown executor/provider isolation 与共享 Session/Console 已贯通。                                                                                                                                                                             | typed data/async/CodeSlot 和 Behavior Verification 留在 G3。                                        |
| `43.animation-runtime-and-execution-session.md`                            | Accepted    | G2 Browser Slice + Lifecycle Closure Implemented                                                    | Domain-owned scheduler/effect lease port 与 provider、单 timeline lifecycle、fill 边界、timeout/effect failure、provider isolation、generation-fenced Browser effect store 与共享 Session/Console 已贯通。                                                                                                                                                                          | composition、route、CodeSlot/shader 与 Evidence 留在 G3。                                           |
| `44.browser-test-execution-and-runtime-host.md`                            | Accepted    | Browser Test + Shared Runtime Host + Neutral Snapshot + Remote Test Product Implemented             | Preview/Test 使用独立 provider descriptor、Job 与 Session，共享 Browser Runtime Host 的 filesystem/dependency lifecycle；Compiler 生产 neutral snapshot，`runtime-vitest` 为 Browser/Remote Worker 转换 canonical `ExecutionTestReport`；Browser/Remote selector、execution-bound artifact/trace correlation 与 mock-only security Gate 已完成。                                    | 大规模 suite/selection 产品能力与正式 Evidence 留在 G3。                                            |
| `45.data-operation-and-environment-reference-foundation.md`                | Accepted    | Canonical Data + Runtime/Target/Security G2 Closure Implemented / Stream expanded by ADR 55         | Data current contract、typed Workspace/Semantic、PIR/Collection binding/lifecycle、mock/live adapter、环境授权、三协议 finite gateway、public/renewed-Secret pull stream、same-execution recovery、incremental collection，以及 React/Vue × Preview/Test/Build 有界 matrix 已建立。                                                                                                 | 更多 transport 与 durable/cross-execution recovery 属于 post-G2。                                   |
| `46.auth-and-server-runtime.md`                                            | Accepted    | A0-A13/A15-A17 Current-scope Local Closure；A14 live evidence pending                               | Remote/Test/isolated、Secret/KMS、source adoption、exact read + one-shot Secret、viewer/editor authority、Vue authenticated Catalog 与 G2 canary/Golden matrix 已建立；A13/A15/A16 既有远端 evidence 有效。                                                                                                                                                                         | A14 live AWS 与 A17 本轮 CI；第三方 provider 和更高 organization role 属于 post-G2。                |
| `47.binary-asset-pipeline.md`                                              | Accepted    | B0-B7 Local G2 Closure / Dual-engine CI pending                                                     | reference-only blob、local/cloud store、PNG/JPEG full-raster、required ClamAV/YARA-X、delivery、retention、Git/LFS、runtime import/replace、Browser 产品 Gate 与 React/Vue cross-target matrix 已落地。                                                                                                                                                                             | 当前 worktree 双引擎 rootless evidence；更多格式/vendor/CDN 属于 post-G2。                          |
| `48.controlled-vue-vite-portability-target.md`                             | Accepted    | Controlled G2 Portability Closure / Expanded by ADR 54                                              | Vue 3/Vite 使用同一 Data current model、standalone runtime、Executable Snapshot v6 与 Remote codec，并通过独立 install/vue-tsc/test/build、deterministic/Remote Chrome CRUD Gate。                                                                                                                                                                                                  | 公共 Target SDK 与更宽 framework catalog 留待 G6。                                                  |
| `49.data-stream-and-source-debugger.md`                                    | Accepted    | Server/Edge GraphQL/AsyncAPI Stream + Source Debugger Implemented / Expanded by ADR 55              | subscription current contract、pull/cursor/backpressure、SSE/NDJSON Backend gateway、Remote frame/generation fence、`data-stream` capability、sanitized Network SourceTrace 与 exact Workspace navigation 已落地。                                                                                                                                                                  | WebSocket/GraphQL WS、Kafka/MQTT 与 durable/cross-execution event recovery 继续 fail closed。       |
| `50.remote-terminal-replicated-recovery.md`                                | Accepted    | Encrypted Cross-Replica Recovery First Vertical Implemented                                         | Core/redactor checkpoint、AES-256-GCM key ring、PostgreSQL opaque state/CAS、双副本 client/worker continuation、lease renewal/worker-loss sweep 与 strict HTTP regression 已落地。                                                                                                                                                                                                  | 由 ADR 51 扩展 managed KMS/MRK；operator quarantine/repair UI 继续建设。                            |
| `51.remote-terminal-managed-kms-and-multi-region-recovery.md`              | Accepted    | AWS Managed Envelope + MRK Recovery First Vertical Implemented                                      | PRT2 per-revision data key、AWS KMS exact ARN/context/timeout、PRT1 decrypt-only migration、retryable outage revision preservation、related MRK regional broker continuation 与 live OIDC workflow 已落地。                                                                                                                                                                         | 首次远端 live evidence、CloudHSM/第二 provider 与 operator repair UI。                              |
| `52.remote-execution-regional-disaster-recovery.md`                        | Accepted    | Regional PostgreSQL / Worker / Traffic DR Local Operator Vertical Implemented                       | repeatable-read exact checkpoint、single-epoch batch、非HTTP one-shot operator、Ed25519三角色proof、source-unavailable fence/attested RPO、strict evidence、standby hard cut、lease/Terminal recovery均已落地。                                                                                                                                                                     | 首次真实跨Region cloud promotion/fencing/RPO/RTO drill；operator UI、云自动化与长期evidence store。 |
| `53.bounded-terminal-emulator-product-surface.md`                          | Accepted    | Bounded Emulator Product First Vertical Implemented                                                 | DOM-free VT subset、strict identity/cursor/byte Gate、ANSI/alternate screen/resize/scrollback、gap/redaction boundary、rendered copy、可访问产品面、按键/粘贴与 exact retry queue 已落地。                                                                                                                                                                                          | 完整 ECMA-48、graphics、search/selection 与 host clipboard 明确不属于本纵切。                       |
| `54.vue-vite-product-surface-and-authenticated-catalog-golden.md`          | Accepted    | Local/Remote Product Vertical Implemented                                                           | Vue PIR/Route/Auth/Server/Asset compiler、root-to-leaf guard/loader、layout/default/named outlet、Export/Test/Blueprint target selector、deterministic authenticated Catalog CRUD + PNG Chrome，以及 Remote live iframe bridge、authenticated create、PostgreSQL replay/state与React/Vue Asset matrix已落地。                                                                       | 更高 organization role 与 public Target SDK 属于 post-G2。                                          |
| `55.data-stream-recovery-credential-renewal-and-incremental-collection.md` | Accepted    | Same-execution Recovery Product Vertical Implemented                                                | Canonical bounded reconnect policy、HMAC SSE checkpoint、Last-Event-ID resume、per-connection product/Secret credential renewal、独立 reconnect Network correlation、strict private-field stripping 与 keyed immutable incremental collection 已落地，并通过 Data/Compiler/Golden/Web/Backend 聚合 Gate。                                                                           | 跨副本 KMS/MRK、更多 transport、durable history 与未来 surface matrix 属于 post-G2。                |
| `56.behavior-scenario-and-cross-domain-action-contract.md`                 | Accepted    | Not Started                                                                                         | G3 canonical `BehaviorScenario`、semantic target、typed trigger/action/observation、recorder draft 与 provider-neutral Program contract 已冻结。                                                                                                                                                                                                                                    | 建立 Behavior package、Workspace document/Command、compiler、authoring 与 recorder vertical。       |
| `57.verification-plan-impact-and-policy.md`                                | Accepted    | Not Started                                                                                         | ImpactSet、canonical Policy、required/advisory matrix、budget/retry/exemption、deterministic Plan DAG 与 Closure 输入语义已冻结。                                                                                                                                                                                                                                                   | 建立 semantic impact contributors、Policy authoring、planner 和 explain surface。                   |
| `58.verification-evidence-provenance-and-retention.md`                     | Accepted    | Not Started                                                                                         | Evidence candidate/promotion、append-only manifest、artifact、trust/attestation、comparison、retention/tombstone 与 Backend boundary 已冻结。                                                                                                                                                                                                                                       | 建立 PostgreSQL/artifact store、promotion、attestation、retention 与 Closure evidence query。       |
| `59.deterministic-scenario-replay-and-runtime-controls.md`                 | Accepted    | Not Started                                                                                         | clock/random/id/scheduler/network/storage/render/motion control、ReplayRecord、divergence 与 debugger 不变量已冻结。                                                                                                                                                                                                                                                                | 建立 Browser/Remote/Export/CI control conformance 和 deterministic replay vertical。                |
| `60.nodegraph-typed-flow-and-behavior-debugging.md`                        | Accepted    | Not Started                                                                                         | typed port/edge、effect/capability planner、async/error/cancel/retry/subgraph/CodeSlot 与 domain debugger contract 已冻结。                                                                                                                                                                                                                                                         | 演进 NodeGraph current model并完成 invoked cross-surface behavior parity。                          |
| `61.animation-route-composition-and-reduced-motion.md`                     | Accepted    | Not Started                                                                                         | typed Animation action、composition/conflict、Route lifecycle、reduced-motion intent、CodeSlot/shader 与 visual/a11y observation 已冻结。                                                                                                                                                                                                                                           | 建立 composition runtime、Route transition、full/reduced target matrix。                            |
| `62.verification-adapter-matrix-and-cross-target-closure.md`               | Accepted    | Not Started                                                                                         | first-party adapter SPI、check families、Preview/Export/CI × target/browser matrix、normalization 和 failure classification 已冻结。                                                                                                                                                                                                                                                | 建立 adapter conformance、controlled matrix 和 Evidence candidate normalization。                   |
| `63.verification-product-surface-diagnostics-and-ci.md`                    | Accepted    | Not Started                                                                                         | Scenarios/Verification/Issues/Execution/SourceTrace、BHV/VER diagnostics、provider-neutral CLI/CI、Backend recovery 与 G4-G6 hard cut 已冻结。                                                                                                                                                                                                                                      | 建立产品 surface、CLI/CI attestation/recovery，并完成 G3 Golden closure。                           |
