# Prodivix Agents 开发指南

你是一名资深前端与全栈工程师，正在开发 Prodivix：一款工业级浏览器端可视化前端开发工具。本文件只保存跨 AI 工具共享的执行规则与架构不变量；状态、图表、里程碑和 owner 细节由下列 canonical 文档维护。

## 开工前必读

| 内容                                        | Canonical 文档                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0/G1/G2/G3 当前完成状态                    | [`specs/roadmap/current-status.md`](specs/roadmap/current-status.md)                                                                                                                                                                                                                                                                                                                                      |
| Global Phase 定义与退出条件                 | [`specs/roadmap/global-phases.md`](specs/roadmap/global-phases.md)                                                                                                                                                                                                                                                                                                                                        |
| G0/G1 可重复验证证据                        | [`specs/roadmap/g0-closure-evidence.md`](specs/roadmap/g0-closure-evidence.md)、[`specs/roadmap/g1-closure-evidence.md`](specs/roadmap/g1-closure-evidence.md)                                                                                                                                                                                                                                            |
| Auth/Server A milestones                    | [`specs/roadmap/g2-auth-server-runtime-milestones.md`](specs/roadmap/g2-auth-server-runtime-milestones.md)                                                                                                                                                                                                                                                                                                |
| Binary Asset B milestones                   | [`specs/roadmap/g2-binary-asset-milestones.md`](specs/roadmap/g2-binary-asset-milestones.md)                                                                                                                                                                                                                                                                                                              |
| 完整架构图与 Workspace VFS 链路             | [`docs/architecture/overview.md`](docs/architecture/overview.md)                                                                                                                                                                                                                                                                                                                                          |
| Package / App owner                         | [`docs/architecture/package-ownership.md`](docs/architecture/package-ownership.md)                                                                                                                                                                                                                                                                                                                        |
| Workspace / Semantic / Code Authoring ADR   | [`specs/decisions/35.canonical-workspace-hard-cut.md`](specs/decisions/35.canonical-workspace-hard-cut.md)、[`25.authoring-symbol-environment.md`](specs/decisions/25.authoring-symbol-environment.md)、[`28.code-authoring-environment.md`](specs/decisions/28.code-authoring-environment.md)                                                                                                            |
| G2 Execution / Data / Auth / Asset contract | [`specs/implementation/g2-executable-full-stack-workspace.md`](specs/implementation/g2-executable-full-stack-workspace.md)、[`g2-data-operation-environment-runtime.md`](specs/implementation/g2-data-operation-environment-runtime.md)、[`g2-auth-server-runtime.md`](specs/implementation/g2-auth-server-runtime.md)、[`g2-binary-asset-pipeline.md`](specs/implementation/g2-binary-asset-pipeline.md) |
| G2 Vue/Vite second-target contract          | [`specs/decisions/48.controlled-vue-vite-portability-target.md`](specs/decisions/48.controlled-vue-vite-portability-target.md)、[`54.vue-vite-product-surface-and-authenticated-catalog-golden.md`](specs/decisions/54.vue-vite-product-surface-and-authenticated-catalog-golden.md)                                                                                                                      |
| G3 Behavior / Verification contract         | [`specs/implementation/g3-behavior-verification-closure.md`](specs/implementation/g3-behavior-verification-closure.md)、[`specs/roadmap/g3-behavior-verification-milestones.md`](specs/roadmap/g3-behavior-verification-milestones.md)、[`g3-closure-evidence.md`](specs/roadmap/g3-closure-evidence.md)                                                                                                  |

修改某条主线前，先读对应 ADR、implementation 与 milestone。不要在本文件追加“最新状态”“覆盖上方历史描述”、GitHub run 结果或临时 backlog；按上表更新唯一来源。

## 架构不变量

1. Canonical Workspace VFS 是作者态唯一真相。PIR、Route、NodeGraph、Animation、Data Source、BehaviorScenario、VerificationPolicy、Code、Token、Asset 与 Config 是由各领域 owner 管理的文档或清单；PIR 不是整个项目的单一巨型 JSON。
2. 所有生产作者态写入必须规划为可逆 `Command` 或原子 `Transaction`，再形成 exact `WorkspaceOperation` 进入 Durable Outbox 与强幂等 Atomic Commit。Editor、AI、plugin、runtime 与 adapter 不得直接覆盖 VFS。
3. Intent 只作为本地或 AI planner 输入；Patch 是 Command 内部可逆、可校验的操作。Project publication projection 只承载显式发布结果，不保存 Workspace/PIR 镜像。
4. Renderer、Semantic Index、Code Authoring、Execution Snapshot、runtime filesystem diff、Git 与 Export 都是 revision-bound projection，不得形成第二作者态。`localStorage` 只保存主题、选择和视图等 UI 偏好；领域持久化使用正式 replica/outbox adapter。
5. code-owned 能力优先接入 Code Authoring Environment；三编辑器通过 typed CodeSlot/CodeReference 使用代码，不保存任意裸源码字符串。符号、引用、作用域和 impact 统一通过 Workspace Semantic Index，不扫描其他编辑器内部状态。
6. Workspace Semantic Index 绑定 Canonical Workspace partitioned revisions、semantic schema 与 provider set，可重建且只读。全项目 symbol 可寻址不等于全局可见；领域文档继续保存类型化引用。
7. Blueprint 复用按 `pir-component` Definition、Public Contract、Component Instance 和一等 Collection 建模。subtree extraction 必须包含 impact/relocation 分析并由一个原子 Workspace Transaction 完成。
8. 生产领域 API 使用无版本 current model。数字版本只存在于 wire schema、codec、migration 与 persistence 边界；migration 统一进入 current model。
9. Execution/Test/Console/trace/artifact 是可丢弃运行态，不写 Canonical Workspace，也不提前等同于 G3 Verification Evidence。Runtime FS 只能产生 strict bounded diff；必须经 revision/baseline/source-owner preflight、用户显式选择与单个可逆 Transaction 才能采纳。
10. Secret value 不得进入 Workspace、PIR、ExecutionRequest、snapshot、Session event、diagnostic、log、trace、artifact、Browser、生成源码或客户端产物。只允许在授权、短期、callback-bound 的 server transport 内解析和使用。
11. `apps/web` 是 React 表面、browser adapter 与 composition root；`apps/backend` 是 canonical persistence、Atomic Commit 与服务边界。应用不得重新拥有 transport-neutral domain contract。具体 owner 以 package ownership 文档为准。

## 开发规则

1. 新 session 先检查远端与分支状态：运行 `git fetch`，确认当前分支是否落后；如需集成，使用非破坏方式并保留用户未提交改动。
2. 读写文档统一使用 UTF-8。文档语言按目标读者、文件语境和同一文档一致性决定；根 `README.md` 使用英文，`README.zh-CN.md` 使用简体中文。
3. 项目处于 alpha 阶段：直接实现当前 canonical 架构，不保留无依据的兼容层、重复 owner、临时 patch 或长期分叉。
4. 代码必须考虑扩展性、健壮性和清晰 owner 边界。发现与当前改动直接相关的重复逻辑、错误抽象或临时补丁，应在同一范围内收敛；超出授权范围的重大扩张先说明。
5. 文件过长时按稳定职责拆分。只在重要模块的核心方法或组件前写能说明调用链与不变量的文档注释，不写复述代码的注释。
6. 同包导入优先使用该包已配置的 `@/...` 或 `#src/...` alias；遵循现有 package boundary，不用相对路径绕过公开 owner。
7. `@prodivix/ui` 使用 SCSS；其他产品样式使用 Tailwind 4。CSS variable 采用 `text-(--text-primary)` 等 Tailwind 4 语法，并保持 monochrome-ui 风格。
8. 扫描仓库文件优先用 `git ls-files`、`git diff --name-only`、`rg --files`，避免遍历 `node_modules`、build output 或临时目录。
9. 依赖安装或更新造成的 lockfile 变化由包管理器自然生成，不手工编辑锁文件。
10. 工具私有执行说明放在对应工具文件。`CLAUDE.md` 只保存 Claude Code 的命令/路径/测试补充；若与本文件冲突，通用规则以本文件为准。

## 测试与交付

1. 功能改动补充与风险相称的正向、边界和 fail-closed 测试。优先验证用户行为、公开 API、状态结果与稳定语义；不要依赖 DOM 层级、内部 class、`querySelector`、`closest`、`parentElement`、snapshot 或其他实现细节。
2. 测试命名统一：单元/示例 `<subject>.test.ts(x)`，属性 `<subject>.property.test.ts(x)`，conformance `<subject>.conformance.test.ts(x)`，integration `<subject>.integration.test.ts(x)`，E2E `<journey>.spec.ts`。
3. 完成功能后运行相关 package Gate，再运行 `pnpm run format`；跨 package contract、Backend、rootless 或 Browser 改动应执行相应 aggregate Gate，不能用局部测试冒充完整证据。
4. 只有用户明确要求时才 commit/push。commit message 使用英文 Conventional Commits：`type(scope): description`。用户要求提交并推送且未指定分支时，先同步远端，再直接提交并推送 `main`；不要自动创建功能分支或 PR。
5. 更新状态时区分 `Implemented`、`Configured / Evidence pending` 与 `Passed`。GitHub workflow 已存在不代表远端 Gate 已通过；证据写入 roadmap/evidence，不写入 `AGENTS.md`。
