# 架构导航

Prodivix 的架构基于 Canonical Workspace VFS、domain owner、revision-bound projection 和可逆的 durable 写入链。

仓库内的核心架构文档包括：

- `docs/architecture/overview.md`：产品全景、两张 Mermaid 架构图与 Workspace VFS 读写链路。
- `docs/architecture/package-ownership.md`：package/app owner、禁止边界与稳定依赖方向。
- `specs/decisions/`：冻结的架构决定。
- `specs/implementation/`：各子系统 implementation contract 与验证方法。
- `specs/roadmap/current-status.md`：记录当前全局状态；架构文档不跟踪进度信息。

## 核心不变量

Canonical Workspace VFS 是作者态的唯一真相。Editor、AI、plugin 和 runtime 的所有写入都必须转换为可逆 Command 或原子 Transaction，再经由 Durable Outbox 和 Atomic Commit 提交。Renderer、Semantic Index、Code Authoring、Execution Snapshot、Git 和 Export 都是可重建的 projection，不得成为第二作者态。

涉及跨领域能力时，需先确定 owner：应用层只负责 UI、adapter 和 composition，不得复制 transport-neutral contract。代码相关的作者能力走 Code Authoring Environment，符号/引用/impact 走 Workspace Semantic Index。
