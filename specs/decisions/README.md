# Prodivix 决策索引（Draft）

## 核心决策（按主题）

1. **Workspace 与数据模型**
   - `specs/decisions/05.workspace-vfs.md`
   - `specs/workspace/workspace-model.md`
2. **Undo/Redo 与命令协议**
   - `specs/decisions/06.command-history.md`
   - `specs/decisions/12.intent-command-extension.md`
3. **同步与并发控制**
   - `specs/decisions/07.workspace-sync.md`
   - `specs/decisions/11.revision-partitioning.md`
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
    - `specs/codegen/react-production-policy-v1.md`
14. **UX 诊断体系**
    - `specs/decisions/26.ux-diagnostics.md`
    - `specs/diagnostics/ux-diagnostic-codes.md`
15. **诊断展示契约**
    - `specs/decisions/27.diagnostic-presentation-contract.md`
16. **GitHub App 与 Git 集成**
    - `specs/decisions/23.github-app-integration.md`
17. **诊断码与错误体系**
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
18. **Blueprint Feature 结构与数据层**
    - `specs/decisions/32.blueprint-editor-feature-layout.md`
    - `specs/decisions/33.blueprint-data-layer-cleanup.md`

## 实施主计划

- `specs/implementation/workspace-refactor-plan.md`
- `specs/implementation/workspace-task-backlog.md`
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

| ADR                                                 | 决策状态                | 实现状态                               | 证据 / 说明                                                                                                                                                                                                                                            | 后续动作                                                                                                         |
| --------------------------------------------------- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `03.rete.md`                                        | Superseded              | Not Planned                            | Rete.js 已被 React Flow 长期选型替代。                                                                                                                                                                                                                 | 保留为历史候选。                                                                                                 |
| `05.workspace-vfs.md`                               | Draft                   | Implemented / Stabilizing              | Workspace VFS、VFS validator、`.prodivix/**` source projection 与 round-trip 测试已存在。                                                                                                                                                              | 补齐 Workspace Diff、Git history bridge 与实现边界后再升 Accepted。                                              |
| `06.command-history.md`                             | Draft                   | Implemented / Stabilizing              | `WorkspaceCommandEnvelope`、`applyWorkspaceCommand`、`workspaceHistory.ts` 与 reverseOps 校验已实现。                                                                                                                                                  | 继续收敛所有编辑器写入入口，避免绕过 command。                                                                   |
| `07.workspace-sync.md`                              | In Progress             | Partial                                | 后端 workspace API、document-level save、routeRev 与 document rev 保存链路已存在，但离线 outbox、冲突恢复和跨端同步仍未形成完整闭环。                                                                                                                  | 保持 In Progress，补并发、失败恢复和 outbox 验收项。                                                             |
| `08.route-manifest-outlet.md`                       | In Progress             | Frontend Runtime Implemented           | Workspace RouteManifest、page/layout/outlet 引用、RouteRuntimeContext、Outlet 预览与 `routeRev` 保存链路已存在；后端校验和导出链路尚未统一。                                                                                                           | 按 `route-system-unification-plan.md` 推进后端校验与导出。                                                       |
| `09.component-route-composition.md`                 | In Progress             | Implemented / Needs Export             | `RouteModule` / `RouteModuleMount`、合成 RouteGraph、source trace 与 `PdxRoute` route context 消费层已落地；导出仍需接入。                                                                                                                             | 后续在 export planner 中消费合成 route graph。                                                                   |
| `10.pir-contract-validation.md`                     | Draft                   | Gap                                    | PIR Schema 以 `specs/pir/PIR-v*.json` 为源，但 `apps/web/src/pir/schema/pir.types.ts` 当前为空，类型生成链路未落地。                                                                                                                                   | 建立 JSON Schema 到 TypeScript 类型生成链路。                                                                    |
| `12.intent-command-extension.md`                    | Draft-Frozen（API-002） | Implemented / Needs Audit              | 前后端 `WorkspaceCommandEnvelope`、intent handlers、patch path guard 与 command 回放校验已存在。                                                                                                                                                       | 做 API-002 compliance audit，确认所有 intent 生成路径都遵守冻结字段。                                            |
| `13.route-runtime-contract.md`                      | In Progress             | Frontend Foundation Implemented        | `RouteRuntimeContext`、params 注入、navigate resolver、runtime CodeReference 诊断与 loader/action/guard CodeSlotContract 已存在；预览仍不执行 runtime code。                                                                                           | 建立 route export adapter 与后端校验链路。                                                                       |
| `17.external-library-runtime-and-adapter.md`        | Draft                   | Partial / Official Plugins Implemented | Ant Design、MUI、Radix 已迁移为真实 bundled official plugin；旧 profile、remote official loader、Renderer/Compiler 特判和 placeholder 已删除。                                                                                                         | 保持 Draft；继续 generic arbitrary-library plugin、L0/L1 自动发现、可观测性与社区生态。                          |
| `19.layout-pattern-and-builtin-inspector-schema.md` | Draft                   | Implemented / Stabilizing              | Registry、preset 与 Inspector Panel 已落地。                                                                                                                                                                                                           | 决策稳定后可升 Accepted。                                                                                        |
| `21.inspector-panel-architecture.md`                | Draft                   | Implemented / Stabilizing              | Tab / Panel / Group / Field 体系已作为当前 Inspector 主结构。                                                                                                                                                                                          | 清理遗留 Section 命名后可升 Accepted。                                                                           |
| `22.llm-integration-architecture.md`                | Draft                   | Foundation Only / Not Product-Ready    | `@prodivix/shared` 与 `@prodivix/ai` 已有 gateway、context、tool、trace、streaming 和 provider 基础；Blueprint assistant 仍是 plan-only/PIR-scoped。                                                                                                   | 不升 Accepted；按 `ai-fine-grained-ui-actions.md` 建立 Workspace Action Proposal、dry-run/apply 与 repair loop。 |
| `24-27 diagnostics`                                 | Draft                   | Implemented / Stabilizing              | 诊断类型、registry、presentation builder、UX/COD/PIR/AI 等诊断码规范与 docs reference 已落地。                                                                                                                                                         | 继续补高价值码位模板，并评估 `diagnosticRegistry.ts` 是否按领域拆分。                                            |
| `25.authoring-symbol-environment.md`                | Draft                   | Implemented Foundation / Expanding     | Authoring 类型、artifact/symbol/diagnostic provider registry、environment composition 与 WorkspaceCodeArtifactProvider 已存在。                                                                                                                        | 接入真实 resolver、definition/reference、language service 和更多领域 provider。                                  |
| `28.code-authoring-environment.md`                  | Accepted                | Implemented Foundation / Expanding     | Workspace code document、CodeArtifact 投影、CodeReference、CodeSlotContract/Registry、TriggerBinding 轻类型与导出接入已存在。                                                                                                                          | 继续实现 orphan artifact 生命周期、真实 Code Editor 体验和 code-owned slot 接入。                                |
| `29.plugin-extension-points.md`                     | Draft                   | Partial（Phase 1-4 Implemented）       | Manifest、Host Core、Browser sandbox/Gateway、official contribution contracts、React Host ABI、deterministic artifact、Blueprint Template、AntD/MUI/Radix official plugin 与 Phase 4.9 security/browser/production hardening 已落地，core 特判已删除。 | 保持 Draft/Partial；继续 broader extension points、write Gateway、SDK 与 Phase 5 生态。                          |
| `30.react-flow-nodegraph-editor.md`                 | Accepted                | Implemented / Stabilizing              | React Flow 编辑器、PIR 序列化、运行时执行器和 NodeGraph export contribution 已存在。                                                                                                                                                                   | 继续收敛所有 NodeGraph 写入到 Workspace Command / Intent / Patch，并补插件边界。                                 |
| `31.production-export-planner.md`                   | Draft                   | Implemented / Stabilizing              | `ExportProgram`、`ExportProgramBuilder`、`ProductionExportPlanner`、artifact/source/origin/license/deployment metadata 与 `.prodivix/*` 审计文件已落地。                                                                                               | 保持 Draft 继续扩展多 framework target、source map、tree shaking、code splitting 和 License UI。                 |
| `32.blueprint-editor-feature-layout.md`             | Draft                   | Implemented                            | `features/blueprint/` 已与 `animation/`、`development/` 平级；`design/` 已移除；inspector 迁入 `blueprint/editor/inspector/`；`editor/components/` 已拍平为 camelCase；tsc / vitest / lint 通过。                                                      | —                                                                                                                |
| `33.blueprint-data-layer-cleanup.md`                | Draft                   | Implemented                            | `editor/model/data.ts` barrel 已删除（5/8 死转发清零）；`data/viewport.ts` 收敛为纯视口配置，死代码 `DEFAULT_ROUTES` 删除；preview-scale 常量与 `getPreviewScale` 迁入 `editor/sidebar/previewScale.ts`；6 个消费者直连源；tsc / vitest / lint 通过。  | —                                                                                                                |
