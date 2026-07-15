# 当前产品状态

> **G1 Passed / G2 Foundation**。本页是便于阅读的摘要；阶段状态唯一来源是仓库 `specs/roadmap/global-phases.md`。

## 阶段总览

| Phase                              | Product Gate | 当前判断                                                                                                               |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| G0 Truth & Change Kernel           | Passed       | Canonical Workspace、History、Atomic Commit、Conflict、Outbox、local replica 与 Issues 闭环已验证                      |
| G1 Semantic Hybrid Authoring       | Passed       | PIR-current、Semantic Index、Component/Collection、Code/Shader、controlled round-trip 与 React/Vite Golden Gate 已验证 |
| G2 Executable Full-stack Workspace | In Progress  | ExecutionProvider、Data/API、SecretRef、Runner 与真实工程运行环境正在建设                                              |
| G3 Behavior & Verification Closure | Blocked      | NodeGraph/Animation 有内核基础，统一行为、trace、scenario 与 verification 尚未闭环                                     |
| G4 Verified Agentic Development    | Blocked      | AI provider/tool 基础存在，受控写入、评测、证据和安全 Gate 未闭环                                                      |
| G5 Collaborative Production Loop   | Blocked      | 单设备 local replica 已有，多设备协作、Review、Deploy 与生产反馈未闭环                                                 |
| G6 Trusted Ecosystem               | Blocked      | Plugin Host 有基础，Public SDK、签名、Marketplace 与 multi-target Gate 未完成                                          |

## G1 已交付

- 无版本号 PIR-current 生产模型与集中 wire migration 边界
- Workspace Semantic Index 与跨领域 definition/references/impact
- Component Definition、Public Contract、Instance、Collection 与原子抽取
- TypeScript/JavaScript/CSS/SCSS/GLSL/WGSL language capability
- 独立 shader compile capability 与浏览器 WebGL2/WebGPU 证据
- 跨三编辑器 Code Slot、artifact lifecycle 与 refactor planning
- PIR ↔ React/JSX + standalone CSS controlled round-trip
- 唯一 durable 生产写入链、History、local outbox 和 conflict resolution
- Renderer/Compiler/SourceTrace parity
- React/Vite 独立 install/typecheck/test/build/browser Gate

重复验证记录位于 `specs/roadmap/g1-closure-evidence.md`。

## G2 当前目标

G2 要让 Prodivix 能运行真实数据应用，而不只是设计与生成它们：

1. `ExecutionProvider / ExecutionJob`
2. Browser Runner 与可替换的 Remote Isolated Runner
3. 依赖安装、Vite/HMR、Terminal、Console、Network 与 Test 入口
4. Query/Mutation、cache/retry/optimistic update 与完整 lifecycle 的 Data/API IR
5. OpenAPI、GraphQL 与 AsyncAPI adapter
6. client/worker/server/edge/build/test runtime zones
7. SecretRef、环境绑定、权限和 mock/live adapter
8. 二进制 Asset 管线
9. Auth、session、permission 与 server function contract

退出 Gate 是：一个标准 CRUD 应用能以同一行为语义完成鉴权、loading、empty、error、mutation、retry 与 optimistic update，并在 Preview 和 Export 中通过同一组场景。

## 尚不能承诺

当前不要把 Test、Deployment、多框架 production target、完整远程执行、团队实时协作、AI 自主写入或 Marketplace 当作已交付功能。存在占位入口或底层 package 只能说明架构基础已开始形成。
