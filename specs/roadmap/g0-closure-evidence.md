# G0 Closure Evidence Matrix

## 状态

- EvidenceStatus：Verified
- DecisionStatus：Accepted（继承 `specs/roadmap/global-phases.md` 的 G0 定义；本文不新增架构决策）
- ImplementationStatus：G0 Implemented
- ProductGateStatus：G0 Passed
- 自动化入口：`pnpm run verify:g0`
- 最终验证记录：2026-07-13，退出码 `0`

本文把 G0 必须项和退出 Gate 映射到可重复运行的自动化检查、关键测试与人工收口项。2026-07-13 的完整验证已经返回成功，十项必须能力与六项退出 Gate 均据此判定为通过。

本记录与被验证的 G0 变更集一并提交。复验时应以包含本文的 commit 为目标 revision；Git 基线 `768ba47387e31e44ff0b29b2112caa46033e7ae5` 只标识该变更集的共同起点，不代表 G0 改动已经包含在这个基线 commit 中。

## 复验边界

`pnpm run verify:g0` 是无服务器、非浏览器的 G0 Truth & Change Kernel 验证入口。它验证领域内核、生产写入 Hard Cut、Golden Conformance、Web 组合层类型与 adapter，以及后端 Workspace contract。

本轮 G0 证据不包含以下能力，也不得用进程内 build 代替这些能力：

1. 独立导出项目的 dependency install、typecheck、test 与 browser smoke；这些属于 G1 及后续产品 Gate。
2. runtime behavior、visual regression、无障碍、性能和安全矩阵；这些在 G1-G3 及后续横向 Gate 中继续闭环。
3. 正式 `VerificationEvidence` artifact、Preview/Test/Export 行为等价和发布候选证据链；这些属于 G3。

因此，G0 通过只表示唯一真相、唯一写路径、恢复、冲突、诊断导航和 Golden 非浏览器闭环成立，不表示完整应用交付链已经完成。

## `verify:g0` 阶段

| 阶段 | 自动化检查                                     | 主要证明内容                                                                                                                                         |
| ---- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `pnpm run check:core-boundaries`               | Runtime、NodeGraph、Animation、Router、PIR、Workspace 等 transport-neutral Core 不反向依赖 Web、React、Zustand、React Flow 或 `@/` 私有实现。        |
| 2    | `pnpm run check:editor-hard-cut`               | 扫描生产源码，守护 package owner、Canonical Workspace 单快照、WorkspaceOperation/Outbox 写入链路、浏览器持久化 allowlist 与后端 Atomic Commit 边界。 |
| 3    | `pnpm run check:property-test-names`           | 属性、conformance、integration 与 E2E 测试命名保持统一，避免验证入口分叉。                                                                           |
| 4    | `pnpm run docs:diagnostics:check`              | 诊断代码与 catalog 保持一致，Issues 不依赖无登记的错误编号。                                                                                         |
| 5    | G0 核心 package 与 Golden tests                | 运行 Animation、Authoring、Diagnostics、Golden、NodeGraph、PIR、Renderer、Compiler、Router、Runtime、Workspace 与 Workspace Sync 的领域测试。        |
| 6    | `@prodivix/web` typecheck                      | 验证 Core package、Command/Outbox adapter、Issues provider/navigation 在 Web composition root 中类型闭合。                                           |
| 7    | Web Issues 与 Workspace recovery adapter tests | 验证诊断聚合/回跳以及浏览器侧 conflict、recovery、Outbox executor 的公开行为。                                                                       |
| 8    | `go test ./...`（`apps/backend`）              | 验证后端 Workspace Atomic Commit、revision partition、幂等 replay、VFS/Route validation 与 wire contract。                                           |

阶段 5 的固定 package 集合为：

- `@prodivix/animation`
- `@prodivix/authoring`
- `@prodivix/diagnostics`
- `@prodivix/golden-conformance`
- `@prodivix/nodegraph`
- `@prodivix/pir`
- `@prodivix/pir-react-renderer`
- `@prodivix/prodivix-compiler`
- `@prodivix/router`
- `@prodivix/runtime-browser`
- `@prodivix/runtime-core`
- `@prodivix/workspace`
- `@prodivix/workspace-sync`

验证脚本遇到首个失败即返回非零退出码。任何单个阶段成功都不能独立把 G0 标记为通过。

## G0 必须项证据矩阵

| #   | G0 必须项                                                                                  | 自动化与代码证据                                                                                                                                                      | 收口判定                                                                                  |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 1   | Canonical Workspace VFS 统一持有 Workspace、Route、PIR、Code、Assets 与 Config             | 阶段 1、2、5、8；重点包括 `@prodivix/workspace` codec/validator/projection/transaction tests 与后端 snapshot boundary tests。                                         | Passed；核心边界、领域测试与后端 snapshot contract 全部通过。                             |
| 2   | Blueprint、NodeGraph、Animation、Route、Code、Resources 写入全部进入 Command / Transaction | 阶段 2、5、6、7；source scan 守护单一写入链路，Workspace tests 验证各领域 planner/command。                                                                           | Passed；生产边界与领域测试同时通过。                                                      |
| 3   | History、undo/redo、merge、barrier、因果关系与快捷键                                       | 阶段 5、6；`workspaceHistory.test.ts`、Command/Transaction tests 与 Golden create/edit undo/redo 场景。                                                               | Passed；Golden undo/redo 与 History 语义测试通过。                                        |
| 4   | Atomic Commit、revision partition、强幂等、409 conflict、显式 resolution 与安全 replay     | 阶段 5、7、8；Workspace Sync revision/conflict/commit wire tests、Web conflict executor tests、后端 operation commit tests。                                          | Passed；前端 adapter、Sync Core 与后端事务测试全部通过。                                  |
| 5   | Durable outbox、跨刷新恢复、离线队列、ACK causality 与失败重试                             | 阶段 5、7；Workspace Sync outbox/local replica 属性测试、Web recovery/outbox adapter tests 与 Golden recovery 场景。                                                  | Passed；pending replay、ACK causality、replacement head 与恢复场景均通过。                |
| 6   | 前后端 Schema、Codec 与语义 Validator conformance-equivalent                               | 阶段 5、8；Workspace/PIR/Router validators、operation commit wire tests、后端 Route/VFS/operation validators。                                                        | Passed；wire、codec 与前后端语义 validator 组合测试通过。                                 |
| 7   | Issues 聚合、去重、Quick Fix、SourceTrace 与编辑器回跳                                     | 阶段 4、5、6、7；`@prodivix/diagnostics` collection properties，以及 Web Workspace/Route/PIR/NodeGraph/Animation/Code/Outbox/Conflict providers 与 navigation tests。 | Passed；稳定 target、Code SourceSpan 与各已有目标导航测试通过。                           |
| 8   | Golden 覆盖多路由、route-level PIR artifact 复用、表单、代码、资源、插件、导出和冲突恢复   | 阶段 5；`goldenApp.conformance.test.ts`、`goldenApp.property.test.ts`、`workspaceExportContracts.conformance.test.ts`。                                               | Passed；全部 Golden 正向覆盖、确定性与 fail-closed contract 通过。                        |
| 9   | 文档区分 DecisionStatus、ImplementationStatus 与 ProductGateStatus                         | `specs/rfc/template.md`、`specs/implementation/template.md`、`specs/decisions/README.md`、ADR 状态头、`global-phases.md` 与本文交叉复核。                             | Passed；新文档模板与 G0 状态文档均显式分离三条状态轴。                                    |
| 10  | 领域数据退出裸 `localStorage`，浏览器存储只承载 UI 偏好或正式 local replica                | 阶段 2、5、7；Hard Cut 的 browser storage/IndexedDB allowlist 与 Workspace local replica tests。                                                                      | Passed；allowlist 只保留 UI 偏好或正式 replica/outbox adapter，静态边界与属性测试均通过。 |

## Golden 覆盖矩阵

| 能力                          | 必须存在的正向证据                                                                                                       | 不足以代替的证据                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 多路由                        | Golden 输出至少包含 `/` 与 `/checkout`，route topology 和生成入口一致。                                                  | 仅验证 RouteManifest 可以 decode。                                                                               |
| Route-level PIR artifact 复用 | 同一 `pir-component` artifact 被至少两个 route `pageDocId` 引用，导出只生成一个共享模块，消费 route 复用该模块。         | 只创建未被消费的 artifact；或把该证据误读为 Blueprint Component Instance、subtree extraction 或 Contract reuse。 |
| 表单                          | 导出 checkout 表单、email 输入、提交控件和对应 action reference。                                                        | 只存在静态输入节点。                                                                                             |
| 代码                          | Code Document、mounted CSS 与 Route/CodeReference 被输出且引用关系保留。                                                 | 只把源码字符串写入 bundle 但没有作者态引用。                                                                     |
| 资源                          | Asset 与 Project Config 被输出到稳定路径，manifest 可追溯。                                                              | 只统计 Workspace 中的资源数量。                                                                                  |
| 插件                          | Golden 使用真实官方 plugin contribution/codegen policy，并固定 package digest 与 dependency policy。                     | Compiler 内部硬编码组件库特判。                                                                                  |
| 冲突恢复                      | 构造 revision conflict，保留语义 conflict，显式选择 resolution，并通过新的 WorkspaceOperation replay。                   | 只断言收到 HTTP 409。                                                                                            |
| 导出与构建                    | 对全部生成 JS/TS 模块做 syntax transform，再对可达模块图执行无服务器、外部化 bare imports 的进程内 Vite/Rolldown build。 | 这不是独立项目 install/typecheck/test/browser smoke/visual。                                                     |
| 确定性                        | 改变 active selection 与 record insertion order 后，bundle signature 保持一致。                                          | 单个 fixture 的一次快照。                                                                                        |
| 不支持能力                    | 合法但尚未支持的 layout、route-outlet composition 或独立领域文档产生 blocking diagnostic，不能静默丢弃。                 | 不能把 fail-closed 反向解释为该能力已经实现。                                                                    |

Route-level PIR artifact 复用是 G0 Golden 的独立正向要求。`goldenApp.conformance.test.ts` 已证明同一 `pir-component` 被 `/order-summary` 与 `/order-summary-preview` 两个 route 通过 `pageDocId` 消费，导出只产生一个共享模块和一个对应 import；它不证明 Blueprint Component Instance、subtree extraction、Public Contract 或 Collection reuse 已实现。`workspaceExportContracts.conformance.test.ts` 则继续独立证明尚未支持的组合不会静默丢失。

## G0 退出 Gate 证据矩阵

| #   | 退出 Gate                                                                  | 组合证据                                                                                                                            | 验证结果                                             |
| --- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | 刷新、崩溃、断网、重试和冲突不静默丢失 confirmed 或 pending operation      | Workspace Sync outbox/local replica 属性测试、Web recovery adapter、Golden recovery/conflict、后端强幂等 commit。                   | Passed；阶段 5、7、8 全部成功。                      |
| 2   | 任意领域写入可撤销、重做、重放、审计和诊断                                 | Workspace Command/Transaction/History、各领域 planner、operation metadata、Issues operation target、Golden undo/redo/replay。       | Passed；阶段 2、5、6、7 全部成功。                   |
| 3   | 所有生产作者态写入统一使用 Command / Transaction 与 WorkspaceOperation     | Editor production-boundary scan、WorkspaceOperation/Outbox allowlist 与 Core package ownership checks。                             | Passed；阶段 1、2 成功且无语义写入 allowlist。       |
| 4   | `localStorage`、React state 或编辑器私有镜像不充当领域真相源               | Editor Hard Cut browser storage/IndexedDB 审计、重复 Workspace contract/mirror 禁令、Core package boundaries、local replica tests。 | Passed；阶段 1、2、5、7 成功，allowlist 边界已复核。 |
| 5   | Golden 自动复现创建、编辑、保存、恢复、冲突、导出与构建                    | Golden conformance scenario、export properties、fail-closed contracts、进程内 build。                                               | Passed；阶段 5 与全部 Golden 正向覆盖成功。          |
| 6   | Issues 可回到 Workspace、Route、PIR node、CodeArtifact 或 operation record | Diagnostics target contract、Code/Animation 等真实 provider、SourceSpan、Web navigation tests。                                     | Passed；阶段 4、5、6、7 与稳定导航断言成功。         |

## 最小复验步骤

在目标 revision 的仓库根目录执行：

```text
pnpm install --frozen-lockfile
pnpm run verify:g0
```

复验环境需要可用的 Node.js、pnpm 和 Go toolchain。命令不会启动开发服务器，也不会运行 browser smoke 或 visual inspection。

最终记录应填写：

| 字段                        | 值                                                                       |
| --------------------------- | ------------------------------------------------------------------------ |
| Git revision                | 包含本文的 commit；共同基线为 `768ba47387e31e44ff0b29b2112caa46033e7ae5` |
| 验证日期                    | 2026-07-13                                                               |
| Node.js / pnpm / Go 版本    | Node.js `v26.3.0` / pnpm `11.9.0` / Go `go1.26.4 windows/amd64`          |
| `pnpm run verify:g0` 退出码 | `0`                                                                      |
| 未豁免失败                  | `0`；首次运行发现生成文档漂移，重新生成后完整重跑 8 个阶段并通过         |

不得通过删除失败测试、缩小 package filter、扩大持久化 allowlist 或把 blocking diagnostic 当作正向能力来取得绿色结果。

## 最终判定

以下四项已同时满足：

1. `pnpm run verify:g0` 完整返回退出码 `0`。
2. Golden 具有 route-level PIR artifact 的正向双消费、单模块证据，而不仅是 fail-closed 负向证据；Blueprint Component Instance 仍属于 G1。
3. 文档三条状态轴与本矩阵一致，浏览器、视觉与独立导出验证仍明确留在 G1+。
4. 最终验证记录已经填写，没有被忽略或豁免的失败。

因此 G0 Product Gate 判定为 `Passed`。这一结论只覆盖本文声明的非浏览器 Truth & Change Kernel 边界，不提前声明 G1-G6 的能力完成。
