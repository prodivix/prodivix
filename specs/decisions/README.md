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
7. **样式协议编辑器**
   - `specs/decisions/16.class-protocol-editor.md`
8. **外部组件库接入**
   - `specs/decisions/17.external-library-runtime-and-adapter.md`
9. **布局范式与内置 Inspector Schema**
   - `specs/decisions/19.layout-pattern-and-builtin-inspector-schema.md`
10. **NodeGraph Port 语义与连线约束**
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
