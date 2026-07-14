# Prodivix

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange.svg)

语言：[English](README.md) | 简体中文

Prodivix 是一个开源的、运行在浏览器中的现代前端可视化开发环境。它围绕 Canonical Workspace VFS，把蓝图编辑、节点图逻辑、动画作者态、代码作者态、Workspace 持久化、诊断、预览和生产导出组织到同一套工程体系中。

**Canonical Workspace VFS 是唯一的作者态真相源**。PIR 负责规范化 UI 文档；NodeGraph 与 Animation 使用各自的 Workspace 文档类型，路由清单、代码文档、资源和配置同样是一等记录。`CodeReference` 负责把领域文档连接到代码，而不是把源码吞进一个巨型 JSON。

Prodivix 仍处于快速演进的 alpha 阶段。当前产品位置是 **G0 Passed / G1 Foundation**：Truth & Change Kernel 已形成可重复验证的闭环，G1 Product Gate 仍为 `In Progress`。

## 项目目标

Prodivix 围绕以下长期约束构建：

- **唯一的规范作者态真相**：Workspace、Route、PIR、Code、Asset 和 Config 文档统一归属 Canonical Workspace VFS，而不是编辑器私有镜像。
- **唯一的持久化写入路径**：生产作者态修改先规划为 Domain Command 或 Transaction，经 Durable Outbox 持久化，再通过 Atomic `WorkspaceOperation` Commit 同步。
- **低成本 PIR 演进**：整个 G1 只消费稳定、无版本号的 PIR-current 领域模型；数字 wire 升级只落在不可变 schema、generated 边界 contract、codec 和确定性 migration。
- **可视化编辑不牺牲上限**：可视化工作流与真实代码、外部依赖、诊断、源码定位和生产导出长期共存。
- **本地优先的恢复能力**：confirmed snapshot、pending operation、重试、冲突恢复和离线重开统一使用正式 local replica 与 Outbox 契约。
- **以证据判定产品门槛**：在 `specs/` 中分别记录架构决策、实现状态和产品门槛状态。

## 仓库结构

```text
.
├── apps/
│   ├── web/                  # 浏览器编辑器与应用组合根
│   ├── backend/              # Go 后端、Atomic Commit、持久化与同步 API
│   ├── cli/                  # 命令行工具
│   ├── vscode/               # VS Code 扩展与调试器集成
│   ├── docs/                 # VitePress 文档站
│   └── plugin-sandbox/       # 浏览器插件沙箱应用
├── packages/
│   ├── animation/            # 动画契约、作者态辅助能力与求值
│   ├── authoring/            # Workspace Semantic Index 内核与代码作者态契约
│   ├── code-language/        # revision-bound TS/JS/CSS/SCSS/GLSL/WGSL 语言能力
│   ├── diagnostics/          # 诊断契约、目录与集合
│   ├── golden-conformance/   # Living Golden App 与 G0 conformance gate
│   ├── nodegraph/            # NodeGraph 模型、校验与执行内核
│   ├── pir/                  # PIR 规范化、图、materialization 与校验
│   ├── pir-react-renderer/   # 框架无关 PIR 的 React 投影
│   ├── router/               # 路由契约、匹配、组合与校验
│   ├── runtime-core/         # transport-neutral 执行契约与 registry
│   ├── runtime-browser/      # 浏览器 runtime adapter 与动画投影
│   ├── workspace/            # Canonical Workspace VFS、命令、History 与投影
│   ├── workspace-sync/       # Atomic Commit 规划、Outbox、冲突与恢复
│   ├── prodivix-compiler/    # 生产导出与代码生成
│   ├── ai/                   # 共享 AI provider 与 runtime 基础
│   ├── i18n/                 # 国际化资源
│   ├── shared/               # 仍需跨领域共享的基础原语
│   ├── themes/               # 主题清单与语义化设计 Token
│   ├── ui/                   # 共享 UI 组件
│   ├── vscode-debugger/      # 面向 VS Code 的 PIR debug adapter
│   └── plugin-*/             # 插件契约、Host、工具与官方 adapter
├── scripts/                  # 仓库自动化与验证入口
├── specs/                    # 决策、契约、路线图与实施计划
├── tests/                    # 仓库级测试与 E2E
└── package.json
```

## 当前状态

| 领域                                  | 状态                                                                                                                                                                                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 总体产品位置                          | **G0 Passed / G1 Foundation**；G1 `ProductGateStatus` 为 `In Progress`                                                                                                                                                                         |
| Truth & Change Kernel                 | G0 已通过：Canonical truth、History、Atomic Commit、revision conflict、Durable Outbox、local replica 与唯一生产写入链路均已落地                                                                                                                |
| Diagnostics 与 Issues                 | G0 已通过：revision-aware 聚合、稳定 target、source span、Quick Fix 边界和编辑器回跳均已有覆盖                                                                                                                                                 |
| Golden conformance 与 React/Vite 导出 | G0 非浏览器闭环与 route-level PIR artifact 复用已通过；G1 Gate 加入 Blueprint 实例与独立导出项目验证                                                                                                                                           |
| 语义化视觉/代码混合作者态             | G1 Foundation 已包含 revision-bound Workspace Semantic Index、TS/JS/CSS/SCSS/GLSL/WGSL 能力，以及贯通 Blueprint、Route、NodeGraph、Animation、Resources、Code Editor 与 Issues 的 CodeSlot 纵切；controlled visual/code round-trip 完成该 Gate |
| Blueprint、Route 与 PIR 作者态        | 无版本号的 PIR-current 领域模型统一驱动 Component Instance、抽取、Contract、Collection、预览与导出；数字版本只留在 wire migration 边界                                                                                                         |
| NodeGraph 与 Animation                | 独立领域/runtime package 持有执行内核；后续 Gate 完成 lifecycle、composition 与端到端行为验证                                                                                                                                                  |
| AI 辅助作者态                         | 仅有基础能力；AI 可以提供 planner 输入，但必须复用与人工编辑相同的 Command、Outbox 和 Atomic Commit 路径                                                                                                                                       |

全局阶段定义和验证证据维护在 [`specs/roadmap/global-phases.md`](specs/roadmap/global-phases.md) 与 [`specs/roadmap/g0-closure-evidence.md`](specs/roadmap/g0-closure-evidence.md)。

## 快速开始

### 环境要求

- Node.js 22 或更新版本
- pnpm 11.9.0（建议使用 Corepack）
- Go 1.24 或更新版本
- Git
- PostgreSQL，用于需要后端 Workspace 的开发流程

### 安装

```bash
git clone https://github.com/Mdr-Tutorials/prodivix.git
cd prodivix
pnpm install
```

### 本地运行

日常开发建议在两个终端分别启动后端和 Web 编辑器：

```bash
pnpm dev:backend
pnpm dev:web
```

后端 Workspace、鉴权、同步和项目持久化流程需要 PostgreSQL。可在 `apps/backend` 下执行 `docker compose up -d` 启动本地数据库；后端依赖由 Go modules 管理，也可以提前执行 `go mod download` 拉取。后端专属配置见 [`apps/backend/README.md`](apps/backend/README.md)。

Windows 下可运行 `scripts\start-dev.bat`，一次打开原生 PostgreSQL、后端、Web 编辑器和 UI Storybook。需要覆盖本地 PostgreSQL 连接或 `PRODIVIX_PG_BIN` 时，将 `.env.example` 复制为 `.env.local`；数据库与后端启动器会读取同一个 `BACKEND_DB_URL`。

常用入口：

| 命令                   | 说明                      |
| ---------------------- | ------------------------- |
| `pnpm dev:web`         | 启动浏览器编辑器          |
| `pnpm dev:backend`     | 启动 Go 后端              |
| `pnpm dev:backend:hot` | 使用 Air 热重载启动后端   |
| `pnpm dev:docs`        | 启动文档站                |
| `pnpm dev:cli`         | 启动 CLI 开发模式         |
| `pnpm dev:vscode`      | 启动 VS Code 扩展开发模式 |
| `pnpm storybook:ui`    | 启动 UI 包的 Storybook    |

仓库级命令：

| 命令                  | 说明                                              |
| --------------------- | ------------------------------------------------- |
| `pnpm build`          | 通过 Turbo 构建包和应用                           |
| `pnpm lint`           | 运行 lint 与仓库边界检查                          |
| `pnpm test`           | 通过 Turbo 运行仓库测试                           |
| `pnpm test:golden`    | 运行 Living Golden App conformance suite          |
| `pnpm run verify:g0`  | 重新运行完整的八阶段 G0 closure verification      |
| `pnpm test:e2e:smoke` | 运行冒烟 E2E 测试                                 |
| `pnpm run format`     | 格式化 TypeScript、Markdown、JSON、样式和 Go 代码 |

`pnpm run verify:g0` 验证的是非浏览器 Truth & Change Kernel。它不代表后续 G1-G3 的独立导出项目安装、浏览器行为、视觉回归、无障碍、性能或正式 `VerificationEvidence` Gate 已经通过。

## 架构概览

所有持久作者态都归属 Canonical Workspace VFS。Domain planner 把用户、AI、插件、导入或恢复输入转换为可逆的 Command 或 Transaction。生产写入只走一条持久化链路：

```text
Human gesture / AI proposal / plugin action
    -> local domain planner
    -> Domain Command / Transaction
    -> Durable Operation Outbox
    -> Atomic WorkspaceOperation Commit
    -> confirmed revisions and local replica
```

规划完成的 Command 或 Transaction 也会在本地应用到 Canonical Workspace VFS，并记录进 Operation History。远端 ACK 只推进 confirmed revision，不会建立第二套作者态真相。

`Intent` 保持为本地或 AI planner 输入；生产持久化从已经验证的 Command / Transaction 所形成的 `WorkspaceOperation` 开始。

Canonical VFS 持有多个一等文档领域，并把它们投影给消费方，而不建立另一套作者态真相：

```text
Canonical Workspace VFS
    ├── workspace.json / route-manifest.json
    ├── PIR UI documents: page / layout / component / normalized ui.graph
    ├── NodeGraph and Animation documents: pir-graph / pir-animation
    ├── code documents and CodeReference bindings
    └── assets / configuration
            -> validation / diagnostics
            -> renderer / preview runtime
            -> production export
            -> backend / Git projections
```

只有 renderer 或 compiler 需要树形视图时，才把 PIR tree materialize 为临时读取投影。编辑器和 AI 不持久化第二套树形真相源。

## 文档

根 README 只作为仓库入口。当前契约和项目状态维护在以下来源中：

| 位置                                                                                                                                     | 用途                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| [`apps/docs/`](apps/docs/)                                                                                                               | 用户与贡献者文档站                                |
| [`apps/docs/guide/getting-started.md`](apps/docs/guide/getting-started.md)                                                               | 详细本地启动指南                                  |
| [`specs/roadmap/global-phases.md`](specs/roadmap/global-phases.md)                                                                       | 规范的 G0-G6 产品阶段与当前 Gate                  |
| [`specs/roadmap/g0-closure-evidence.md`](specs/roadmap/g0-closure-evidence.md)                                                           | G0 Passed 的可重复验证证据                        |
| [`specs/workspace/workspace-model.md`](specs/workspace/workspace-model.md)                                                               | Canonical Workspace 模型                          |
| [`specs/decisions/34.core-package-boundaries.md`](specs/decisions/34.core-package-boundaries.md)                                         | 核心 package 所有权与依赖边界                     |
| [`specs/decisions/35.canonical-workspace-hard-cut.md`](specs/decisions/35.canonical-workspace-hard-cut.md)                               | Canonical Workspace 生产边界                      |
| [`specs/decisions/36.atomic-workspace-operation-commit.md`](specs/decisions/36.atomic-workspace-operation-commit.md)                     | Atomic `WorkspaceOperation` Commit 与 Outbox 边界 |
| [`specs/decisions/37.verified-semantic-authoring-architecture.md`](specs/decisions/37.verified-semantic-authoring-architecture.md)       | 持续验证语义作者架构                              |
| [`specs/decisions/25.authoring-symbol-environment.md`](specs/decisions/25.authoring-symbol-environment.md)                               | Workspace Semantic Index 契约                     |
| [`specs/decisions/38.blueprint-component-instance-and-collection.md`](specs/decisions/38.blueprint-component-instance-and-collection.md) | Blueprint 组件与 Collection 契约                  |
| [`specs/implementation/g1-semantic-component-collection.md`](specs/implementation/g1-semantic-component-collection.md)                   | 当前 G1 语义/组件/Collection 实施计划             |
| [`apps/docs/reference/pir-spec.md`](apps/docs/reference/pir-spec.md)                                                                     | PIR 参考文档                                      |
| [`specs/decisions/README.md`](specs/decisions/README.md)                                                                                 | 架构决策索引                                      |
| [`specs/diagnostics/README.md`](specs/diagnostics/README.md)                                                                             | 诊断领域与诊断码目录                              |

## 开发说明

- `@prodivix/ui` 使用 SCSS 编写样式。
- 应用层样式使用 Tailwind CSS 4 写法。
- 在已配置的包内，优先使用 `@/...` 这类包内别名。
- code-owned 能力通过 Code Authoring Environment 接入；所有领域向 revision-bound Workspace Semantic Index 发布并查询语义，不扫描其他编辑器的私有状态。
- 避免依赖 DOM 层级、内部 class、快照或实现细节的耦合测试。优先测试用户可感知行为、公开 API、稳定状态结果和语义结果。
- 扫描仓库文件时优先使用 `git ls-files`、`git diff --name-only`、`git grep` 等 Git 索引命令。

## 贡献

项目仍处于 alpha 阶段，重大改动直接实现当前目标架构，并以现行 canonical contract 作为唯一生产基线。较大改动前，请先阅读相关产品阶段、架构决策和实施计划。

推荐入口：

- [`AGENTS.md`](AGENTS.md)：跨工具共享的仓库架构与开发规则
- [`CLAUDE.md`](CLAUDE.md)：Claude Code 专属仓库说明
- [`apps/docs/community/contributing.md`](apps/docs/community/contributing.md)：贡献指南
- [`specs/decisions/README.md`](specs/decisions/README.md)：架构决策导航

## 许可证

Prodivix 基于 [MIT License](LICENSE) 发布。
