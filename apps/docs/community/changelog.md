# 更新日志

本页面记录当前开发主线的产品能力进展。全局阶段与退出 Gate 以 `specs/roadmap/global-phases.md` 为准。

## [Unreleased]

### G0 Truth & Change Kernel

- Canonical Workspace VFS 已成为唯一作者态真相源。
- Domain Command / Transaction、History、WorkspaceOperation、Durable Outbox 与 Atomic Commit 已形成统一写入链路。
- revision conflict、semantic diff、显式 resolution、local replica 与离线 pending operation materialization 已落地。
- Workspace、PIR、Router、NodeGraph、Animation、Runtime、Renderer、Authoring、Diagnostics、Compiler 与 Golden Conformance 已建立独立 package owner。
- Living Golden App 已覆盖多路由、route-level PIR artifact 复用、代码、资源、官方插件、冲突恢复与完整 Workspace React/Vite export。

### G1 Semantic Hybrid Authoring

- Workspace Semantic Index contract 已冻结，统一定义跨领域 symbol、scope、reference、visibility、resolution 与 impact query。
- Code Authoring Environment 已明确 CodeArtifact、CodeReference、CodeSlot 与 Language Service provider 边界。
- Blueprint Component Definition、Public Contract、Component Instance、原子 subtree extraction 与一等 Collection contract 已冻结。
- 整个 G1 已统一面向无版本号的 PIR-current 领域模型；数字版本仅保留在冻结 wire schema、generated wire types、codec、migration 与 persistence 边界。
- 普通 PIR wire 升级只新增不可变 schema snapshot、更新 activation manifest、同步 generated contracts 并增加确定性 migration；Workspace、Renderer、Compiler、Semantic Index 与 Web 不随数字版本改名或复制。
- NodeGraph 与 Animation 使用独立 Workspace documents，并通过类型化、document-qualified reference 与 PIR 连接，不再内嵌为页面 PIR 镜像。
- G1 Golden journey 将覆盖组件抽取、多实例与 Collection 复用、Definition 同步、undo/redo、save/reload、Preview/Export parity 与独立项目验证。
