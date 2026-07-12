# Prodivix 决策索引（Draft）

## 核心决策（按主题）

1. **Workspace 与数据模型**
   - `specs/decisions/05.workspace-vfs.md`
   - `specs/decisions/35.canonical-workspace-hard-cut.md`
   - `specs/workspace/workspace-model.md`
2. **Undo/Redo 与命令协议**
   - `specs/decisions/06.command-history.md`
   - `specs/decisions/12.intent-command-extension.md`
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
   - `specs/decisions/15.pir-data-scope-and-list-render.md`
   - `specs/pir/pir-contract-v1.1.md`
   - `specs/pir/PIR-v1.1.json`
   - `specs/pir/pir-contract-v1.2.md`
   - `specs/pir/PIR-v1.2.json`
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
12. **代码作者环境与作者态符号环境**
    - `specs/decisions/28.code-authoring-environment.md`
    - `specs/decisions/25.authoring-symbol-environment.md`
13. **生产级编译与导出**
    - `specs/decisions/31.production-export-planner.md`
14. **核心 Package 边界**
    - `specs/decisions/34.core-package-boundaries.md`
    - `specs/codegen/react-production-policy-v1.md`
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
    - `specs/diagnostics/codegen-diagnostic-codes.md`
    - `specs/diagnostics/api-diagnostic-codes.md`
    - `specs/diagnostics/ai-diagnostic-codes.md`
19. **Blueprint Feature 结构与数据层**
    - `specs/decisions/32.blueprint-editor-feature-layout.md`
    - `specs/decisions/33.blueprint-data-layer-cleanup.md`

## 实施主计划

- `specs/implementation/workspace-refactor-plan.md`
- `specs/implementation/workspace-task-backlog.md`
- `specs/implementation/workspace-revision-conflict-recovery.md`
- `specs/implementation/layout-pattern-and-builtin-inspector-task-backlog.md`
- `specs/implementation/node-graph-control-flow-ui-spec.md`
- `specs/implementation/authoring-symbol-environment-phase1.md`
- `specs/implementation/authoring-environment-stable-structures.md`
- `specs/implementation/ai-fine-grained-ui-actions.md`
- `specs/implementation/route-system-unification-plan.md`
- `specs/implementation/production-export-planner-implementation.md`
- `specs/implementation/blueprint-editor-feature-layout-migration.md`
- `specs/implementation/blueprint-data-layer-cleanup-migration.md`
- `specs/implementation/native-catalog-convergence-plan.md`
- `specs/implementation/plugin-host-foundation.md`
- `specs/implementation/plugin-host-palette-phase3.md`
- `specs/implementation/plugin-browser-sandbox-phase4.md`
- `specs/implementation/official-component-plugins-phase46-48.md`

## 历史实施计划

以下文档保留用于追溯，不再作为当前执行依据：

- `specs/codegen/react-production-policy-v1.md`（Superseded）

## ADR 状态与实现状态

ADR 的 `状态` 描述决策成熟度，不等同于代码完成度。实现完成度用 `实现状态` 单独记录，避免把 Draft 决策误读为“没有实现”，或把 Accepted 决策误读为“所有代码已完成”。

| ADR                                                 | 决策状态                | 实现状态                                              | 证据 / 说明                                                                                                                                                                                                                                            | 后续动作                                                                                                         |
| --------------------------------------------------- | ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `03.rete.md`                                        | Superseded              | Not Planned                                           | Rete.js 已被 React Flow 长期选型替代。                                                                                                                                                                                                                 | 保留为历史候选。                                                                                                 |
| `05.workspace-vfs.md`                               | Draft                   | Implemented / Stabilizing                             | Workspace VFS、validator、`.prodivix/**` source projection 与 round-trip 已存在；ADR 35 已完成 canonical snapshot Hard Cut，`@prodivix/workspace-sync` 已提供 semantic Workspace diff。                                                                | 补齐 Git history bridge 与 Workspace/Route/Animation diff 产品面后再升 Accepted。                                |
| `06.command-history.md`                             | Accepted                | Local History Implemented                             | Operation/Transaction History、scope/barrier、merge window、因果 undo/redo、Store 原子接线和四类编辑器快捷键已实现；CodeMirror 保留原生文本 History。                                                                                                  | 将 Intent-only Resource CRUD 迁入本地 Operation planner，并接入 durable outbox 与完整 ACK causality。            |
| `07.workspace-sync.md`                              | Accepted                | Recovery + Atomic Commit Implemented / Outbox Pending | canonical 409、strict decoder、semantic diff3/session/fresh resolution operation、bounded auto-rebase、conflict UI、exact planner、统一 Web transport 与后端单事务/强幂等 Commit 已落地。                                                              | 实现 durable outbox、跨刷新恢复与完整 ACK causality。                                                            |
| `08.route-manifest-outlet.md`                       | In Progress             | Frontend Runtime Implemented                          | Workspace RouteManifest、page/layout/outlet 引用、RouteRuntimeContext、Outlet 预览与 `routeRev` 保存链路已存在；后端校验和导出链路尚未统一。                                                                                                           | 按 `route-system-unification-plan.md` 推进后端校验与导出。                                                       |
| `09.component-route-composition.md`                 | In Progress             | Implemented / Needs Export                            | `RouteModule` / `RouteModuleMount`、合成 RouteGraph、source trace 与 `PdxRoute` route context 消费层已落地；导出仍需接入。                                                                                                                             | 后续在 export planner 中消费合成 route graph。                                                                   |
| `10.pir-contract-validation.md`                     | Draft                   | Implemented / Contract Consolidation                  | PIR Schema type generation 已输出 `packages/shared/src/types/pir.generated.ts`；PIR normalize、graph 与 validator 已迁入 `@prodivix/pir`。                                                                                                             | 让 generated contract 成为唯一 PIR 类型源，并从 Shared 迁入 PIR owner package。                                  |
| `11.revision-partitioning.md`                       | Accepted                | Implemented                                           | Workspace、Route、Document revisions、WKS-4001/4002/4003 canonical 409 与多分区 Atomic Commit 已落地；`HYBRID_CONFLICT` 已 Hard Cut。                                                                                                                  | 以既有分区契约实现 durable outbox 因果顺序。                                                                     |
| `12.intent-command-extension.md`                    | Draft-Frozen（API-002） | Implemented / Needs Audit                             | 前后端 `WorkspaceCommandEnvelope`、intent handlers、patch path guard 与 command 回放校验已存在。                                                                                                                                                       | 做 API-002 compliance audit，确认所有 intent 生成路径都遵守冻结字段。                                            |
| `13.route-runtime-contract.md`                      | In Progress             | Frontend Foundation Implemented                       | `RouteRuntimeContext`、params 注入、navigate resolver、runtime CodeReference 诊断与 loader/action/guard CodeSlotContract 已存在；预览仍不执行 runtime code。                                                                                           | 建立 route export adapter 与后端校验链路。                                                                       |
| `17.external-library-runtime-and-adapter.md`        | Draft                   | Partial / Official Plugins Implemented                | Ant Design、MUI、Radix 已迁移为真实 bundled official plugin；旧 profile、remote official loader、Renderer/Compiler 特判和 placeholder 已删除。                                                                                                         | 保持 Draft；继续 generic arbitrary-library plugin、L0/L1 自动发现、可观测性与社区生态。                          |
| `19.layout-pattern-and-builtin-inspector-schema.md` | Draft                   | Implemented / Stabilizing                             | Registry、preset 与 Inspector Panel 已落地。                                                                                                                                                                                                           | 决策稳定后可升 Accepted。                                                                                        |
| `21.inspector-panel-architecture.md`                | Draft                   | Implemented / Stabilizing                             | Tab / Panel / Group / Field 体系已作为当前 Inspector 主结构。                                                                                                                                                                                          | 清理遗留 Section 命名后可升 Accepted。                                                                           |
| `22.llm-integration-architecture.md`                | Draft                   | Foundation Only / Not Product-Ready                   | `@prodivix/shared` 与 `@prodivix/ai` 已有 gateway、context、tool、trace、streaming 和 provider 基础；Blueprint assistant 仍是 plan-only/PIR-scoped。                                                                                                   | 不升 Accepted；按 `ai-fine-grained-ui-actions.md` 建立 Workspace Action Proposal、dry-run/apply 与 repair loop。 |
| `24-27 diagnostics`                                 | Draft                   | Implemented / Package Extracted                       | 通用诊断协议与 presentation engine 已迁入 `@prodivix/diagnostics`；PIR 与 Code catalog 分别归 `@prodivix/pir`、`@prodivix/authoring`。                                                                                                                 | 实现 revision-aware aggregation、dedupe 与 Web Issues 产品面。                                                   |
| `25.authoring-symbol-environment.md`                | Draft                   | Implemented Foundation / Package Extracted            | Authoring 类型、artifact/symbol/diagnostic/slot registries 与 environment composition 已迁入 `@prodivix/authoring`；Workspace bridge 由 `@prodivix/workspace` 持有。                                                                                   | 接入真实 resolver、definition/reference、language service 和更多领域 provider。                                  |
| `28.code-authoring-environment.md`                  | Accepted                | Implemented Foundation / Package Extracted            | Workspace code document、CodeArtifact projection、CodeReference、CodeSlotContract/Registry 与 TriggerBinding 已形成独立 package 边界。                                                                                                                 | 统一 Router CodeReference，继续实现 orphan 生命周期、真实 Code Editor 与 code-owned slot。                       |
| `29.plugin-extension-points.md`                     | Draft                   | Partial（Phase 1-4 Implemented）                      | Manifest、Host Core、Browser sandbox/Gateway、official contribution contracts、React Host ABI、deterministic artifact、Blueprint Template、AntD/MUI/Radix official plugin 与 Phase 4.9 security/browser/production hardening 已落地，core 特判已删除。 | 保持 Draft/Partial；继续 broader extension points、write Gateway、SDK 与 Phase 5 生态。                          |
| `30.react-flow-nodegraph-editor.md`                 | Accepted                | Implemented / Stabilizing                             | React Flow 编辑器、PIR 序列化、运行时执行器和 NodeGraph export contribution 已存在。                                                                                                                                                                   | 继续收敛所有 NodeGraph 写入到 Workspace Command / Intent / Patch，并补插件边界。                                 |
| `31.production-export-planner.md`                   | Draft                   | Implemented / Stabilizing                             | `ExportProgram`、`ExportProgramBuilder`、`ProductionExportPlanner`、artifact/source/origin/license/deployment metadata 与 `.prodivix/*` 审计文件已落地。                                                                                               | 保持 Draft 继续扩展多 framework target、source map、tree shaking、code splitting 和 License UI。                 |
| `32.blueprint-editor-feature-layout.md`             | Draft                   | Implemented                                           | `features/blueprint/` 已与 `animation/`、`development/` 平级；`design/` 已移除；inspector 迁入 `blueprint/editor/inspector/`；`editor/components/` 已拍平为 camelCase；tsc / vitest / lint 通过。                                                      | —                                                                                                                |
| `33.blueprint-data-layer-cleanup.md`                | Draft                   | Implemented                                           | `editor/model/data.ts` barrel 已删除（5/8 死转发清零）；`data/viewport.ts` 收敛为纯视口配置，死代码 `DEFAULT_ROUTES` 删除；preview-scale 常量与 `getPreviewScale` 迁入 `editor/sidebar/previewScale.ts`；6 个消费者直连源；tsc / vitest / lint 通过。  | —                                                                                                                |
| `34.core-package-boundaries.md`                     | Accepted                | Phase 1 + Workspace Sync Core Implemented             | `@prodivix/diagnostics`、`@prodivix/authoring`、`@prodivix/pir`、`@prodivix/workspace` 与 transport-neutral `@prodivix/workspace-sync` 已建立；Web 不持有第二套 Core model。                                                                           | 下一批聚焦 Router owner package、durable outbox，再推进 Animation、Runtime/NodeGraph。                           |
| `35.canonical-workspace-hard-cut.md`                | Accepted                | Implemented                                           | canonical WorkspaceSnapshot、wire codec/settings envelope、Store 单快照、confirmed revision/edit sequence、Command/Transaction、route-aware active document 与严格加载门禁均已落地。                                                                   | 不新增兼容层；后续同步恢复能力归 ADR 07 与 `@prodivix/workspace-sync`。                                          |
| `36.atomic-workspace-operation-commit.md`           | Accepted                | Implemented                                           | Exact expected-vector planner、统一 Web transport、后端单数据库事务、强幂等 replay、聚合 delta、metaRev/absence conflict 与旧 `/batch` Hard Cut 已落地。                                                                                               | 后续由 ADR 07 Durable Outbox 持久复用原 request/id 并消费 strong replay。                                        |
