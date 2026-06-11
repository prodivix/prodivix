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
13. **UX 诊断体系**
    - `specs/decisions/26.ux-diagnostics.md`
    - `specs/diagnostics/ux-diagnostic-codes.md`
14. **诊断展示契约**
    - `specs/decisions/27.diagnostic-presentation-contract.md`
15. **GitHub App 与 Git 集成**
    - `specs/decisions/23.github-app-integration.md`
16. **诊断码与错误体系**
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
    - `specs/diagnostics/external-library-diagnostic-codes.md`
    - `specs/diagnostics/codegen-diagnostic-codes.md`
    - `specs/diagnostics/api-diagnostic-codes.md`
    - `specs/diagnostics/ai-diagnostic-codes.md`

## 实施主计划

- `specs/implementation/workspace-refactor-plan.md`
- `specs/implementation/workspace-task-backlog.md`
- `specs/implementation/external-library-execution-plan.md`
- `specs/implementation/external-library-task-backlog.md`
- `specs/implementation/layout-pattern-and-builtin-inspector-task-backlog.md`
- `specs/implementation/node-graph-control-flow-ui-spec.md`
- `specs/implementation/authoring-symbol-environment-phase1.md`
- `specs/implementation/authoring-environment-stable-structures.md`
- `specs/codegen/react-production-policy-v1.md`
- `specs/external/canonical-external-ir-v1.md`
- `specs/diagnostics/external-library-diagnostic-codes.md`

## ADR 状态与实现状态

ADR 的 `状态` 描述决策成熟度，不等同于代码完成度。实现完成度用 `实现状态` 单独记录，避免把 Draft 决策误读为“没有实现”，或把 Accepted 决策误读为“所有代码已完成”。

| ADR                                                 | 决策状态                | 实现状态                            | 证据 / 说明                                                                                                          | 后续动作                                                        |
| --------------------------------------------------- | ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `03.rete.md`                                        | Superseded              | Not Planned                         | Rete.js 已被 React Flow 长期选型替代。                                                                               | 保留为历史候选。                                                |
| `05.workspace-vfs.md`                               | Draft                   | Implemented / Stabilizing           | Workspace VFS 主链路与测试已存在。                                                                                   | 决策稳定后可升 Accepted，并补实现边界。                         |
| `06.command-history.md`                             | Draft                   | Implemented / Stabilizing           | `workspaceCommand.ts` 与 `workspaceHistory.ts` 已实现，Envelope 与 API-002 基本对齐。                                | 专项核对所有命令路径是否遵守冻结字段。                          |
| `07.workspace-sync.md`                              | In Progress             | Partial                             | 后端 auto-healing 与前端 document-level save 已落地，但同步语义仍需验收。                                            | 保持 In Progress，补并发与失败恢复验收项。                      |
| `10.pir-contract-validation.md`                     | Draft                   | Gap                                 | PIR Schema 以 `specs/pir/PIR-v*.json` 为源，但 `apps/web/src/pir/schema/pir.types.ts` 当前为空，类型生成链路未落地。 | 建立 JSON Schema 到 TypeScript 类型生成链路。                   |
| `12.intent-command-extension.md`                    | Draft-Frozen（API-002） | Partial / Needs Audit               | `WorkspaceCommandEnvelope` 覆盖冻结字段，但仍需逐路径确认 command 生成与回放语义。                                   | 做 API-002 compliance audit。                                   |
| `17.external-library-runtime-and-adapter.md`        | Draft                   | Implemented / Core-Embedded         | MUI / Ant Design adapter、manifest、profile 当前仍内嵌在 core。                                                      | 插件系统成熟前作为过渡实现保留。                                |
| `19.layout-pattern-and-builtin-inspector-schema.md` | Draft                   | Implemented / Stabilizing           | Registry、preset 与 Inspector Panel 已落地。                                                                         | 决策稳定后可升 Accepted。                                       |
| `21.inspector-panel-architecture.md`                | Draft                   | Implemented / Stabilizing           | Tab / Panel / Group / Field 体系已作为当前 Inspector 主结构。                                                        | 清理遗留 Section 命名后可升 Accepted。                          |
| `22.llm-integration-architecture.md`                | Draft                   | Foundation Only / Not Product-Ready | Gateway、context builder、tool registry、trace 与 provider 基础存在，但 LLM 产品能力几乎不可用。                     | 不升 Accepted；先补真实 provider 链路、工具执行与 repair loop。 |
| `24-27 diagnostics`                                 | Draft                   | Implemented / Stabilizing           | 诊断 registry、presentation builder 与诊断规范文件已落地。                                                           | 评估 `diagnosticRegistry.ts` 是否按领域拆分。                   |
| `28.code-authoring-environment.md`                  | Accepted                | In Progress                         | Code Authoring Environment 是三编辑器共享代码作者态底座。                                                            | 继续推动 code-owned 能力统一接入。                              |
| `29.plugin-extension-points.md`                     | Draft                   | Planned                             | 插件扩展点是长期方向，现有外部库仍保留在 core 作为迁移期实现。                                                       | 插件宿主稳定后再迁移官方插件。                                  |
| `30.react-flow-nodegraph-editor.md`                 | Accepted                | Implemented / Stabilizing           | React Flow 是 NodeGraph 编辑器长期选型，现有实现位于 `apps/web/src/editor/features/development/reactflow/`。         | 继续收敛写入链路与插件边界。                                    |
