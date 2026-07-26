# Changelog

本页仅记录产品 Gate 级别的里程碑。逐条提交的变化请查看 Git 历史；阶段定义以 `specs/roadmap/global-phases.md` 为准。

## Unreleased

- 建立了 transport-neutral ExecutionProvider/ExecutionJob、Execution Session coordinator 和 Browser Project Runner；蓝图的 Design/Interactive/Run 三种模式、独立工程 snapshot、依赖安装、Vite/HMR、共享 Execution Center/Console 与原位 iframe 均已贯通。
- NodeGraph editor 的 Run/Stop 和 Blueprint `run-nodegraph` trigger 已切换到 domain-owned same-context ExecutionProvider；默认 starter、实时 trace/log、诊断、SourceTrace、取消、timeout 与共享 Console 均已贯通，旧的 browser action 直调协议已删除。
- Animation 的 Play/Stop/Restart 已切换到 domain-owned Runtime Port 和 same-context ExecutionProvider；完整的单 timeline lifecycle、timeline easing、target capability、generation-fenced Browser effect lease、SourceTrace 与共享 Console 均已贯通，旧的编辑器私有 RAF lifecycle 已删除。
- Browser Preview/Test 已采用独立的 provider descriptor、Job 和 Session，共享 Browser Runtime Host 的 filesystem/dependency lifecycle；Workspace Test 页面已接入 canonical `ExecutionTestReport` 和共享 Execution Center。
- 继续建设 Remote Isolated Runner、Terminal/Network 产品面及多 runtime zone。
- 建立了 DataSourceDocument/DataOperationReference current contract、strict wire codec、`data-source` typed Workspace/Semantic foundation 和 reference-only environment/Secret identity；PIR binding、runtime adapter 和 Secret resolution 仍在建设中。
- 继续建设完整 runtime zones、binary asset 和 auth/server-function contract。
- 持续补齐产品文档，改善易用性，修复已发现的跨表面一致性问题。

## Semantic Hybrid Authoring

- 全仓库的生产 API 已收敛到 PIR-current，数字版本仅存在于 wire/migration 边界。
- Workspace Semantic Index 覆盖 Route、PIR、Component、Collection、NodeGraph、Animation、Code、Token 与 Asset。
- Component Definition/Public Contract/Instance、原子 extraction 和一等 Collection 已完成产品纵切。
- TS/JS/CSS/SCSS/GLSL/WGSL language capability、Shader compile、CodeSlot、artifact lifecycle 与 refactor planning 已完成纵切。
- PIR ↔ React/JSX + standalone CSS controlled round-trip 已完成。
- Web 端的作者写入、Quick Fix 和 History 已统一接入 Durable Outbox 和 Atomic Commit。
- React/Vite 导出已通过独立的 install/typecheck/test/build 流程和真实浏览器 Gate。

## Truth & Change Kernel

- Canonical Workspace VFS 已成为唯一的作者态真相。
- Command/Transaction、History、WorkspaceOperation、Durable Outbox 和 Atomic Commit 已建立起统一的写入链。
- Revision conflict、semantic resolution、local replica、Issues 和 Golden Conformance 均已闭环通过。

可重复证据见 `specs/roadmap/g0-closure-evidence.md` 与 `specs/roadmap/g1-closure-evidence.md`。
