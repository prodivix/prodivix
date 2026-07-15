# Changelog

本页只记录产品 Gate 级里程碑。逐提交变化请查看 Git 历史；阶段定义以 `specs/roadmap/global-phases.md` 为准。

## Unreleased

- 开始建设 ExecutionProvider/ExecutionJob、Browser/Remote Runner 与项目运行环境。
- 开始建设 Data/API IR、runtime zones、SecretRef、binary asset 与 auth/server-function contract。
- 继续补齐产品文档、易用性和已发现的跨表面一致性问题。

## Semantic Hybrid Authoring

- 全仓生产 API 收敛到 PIR-current，数字版本隔离在 wire/migration 边界。
- Workspace Semantic Index 覆盖 Route、PIR、Component、Collection、NodeGraph、Animation、Code、Token 与 Asset。
- Component Definition/Public Contract/Instance、原子 extraction 和一等 Collection 完成产品纵切。
- TS/JS/CSS/SCSS/GLSL/WGSL language capability、Shader compile、CodeSlot、artifact lifecycle 与 refactor planning 完成纵切。
- PIR ↔ React/JSX + standalone CSS controlled round-trip 完成。
- Web 作者写入、Quick Fix 和 History 统一进入 Durable Outbox 与 Atomic Commit。
- React/Vite 导出通过独立 install/typecheck/test/build 与真实浏览器 Gate。

## Truth & Change Kernel

- Canonical Workspace VFS 成为唯一作者态真相。
- Command/Transaction、History、WorkspaceOperation、Durable Outbox 与 Atomic Commit 建立统一写入链。
- Revision conflict、semantic resolution、local replica、Issues 与 Golden Conformance 闭环通过。

可重复证据见 `specs/roadmap/g0-closure-evidence.md` 与 `specs/roadmap/g1-closure-evidence.md`。
