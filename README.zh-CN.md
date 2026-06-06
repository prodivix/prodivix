# Prodivix

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Version](https://img.shields.io/badge/version-0.1.0--alpha-orange.svg)

语言： [English](README.md) | 简体中文

Prodivix 是一个开源的、运行在浏览器中的现代前端可视化开发环境。它围绕共享的中间表示 **PIR**，把可视化蓝图编辑、节点图逻辑、动画编辑、Workspace 持久化和代码生成组织到同一套工程体系中。

项目目前仍处于 alpha 阶段，正在快速演进。这个仓库的源码包含编辑器、后端服务、CLI、VS Code 扩展、共享包、架构决策和实施规范。

## 项目目标

Prodivix 围绕几个长期约束构建：

- **PIR 作为唯一真相源**：UI、逻辑、动画、路由和代码生成都应收敛到经过校验的中间表示。
- **可视化编辑不牺牲上限**：可视化工作流应支持真实代码、外部依赖、诊断和生产级代码生成。
- **本地优先的工程体验**：编辑器应适合本地开发，同时支持后端 Workspace、同步和未来协作能力。
- **显式架构记录**：长期稳定的契约先记录在 `specs/` 中，再开始实现细节。

## 仓库结构

```text
.
├── apps/
│   ├── web/          # 浏览器编辑器：Blueprint、Inspector、PIR runtime、代码作者态
│   ├── backend/      # Go 后端：鉴权、项目、Workspace 同步、PIR 校验
│   ├── cli/          # 命令行工具
│   ├── vscode/       # VS Code 扩展与 PIR 调试支持
│   └── docs/         # 独立的 VitePress 文档站
├── packages/
│   ├── ai/           # AI Provider 抽象和共享 AI 工具
│   ├── i18n/         # 国际化资源
│   ├── pir-compiler/ # PIR 代码生成包
│   ├── shared/       # 共享类型、Schema 和校验工具
│   ├── themes/       # 主题清单和语义化设计 Token
│   ├── ui/           # 共享 UI 组件
│   └── vscode-debugger/
├── scripts/          # 仓库自动化和生成文档脚本
├── specs/            # 架构决策、契约、RFC 和实施计划
├── tests/            # 仓库级测试
└── package.json
```

## 当前状态

| 模块                     | 状态                            |
| ------------------------ | ------------------------------- |
| Blueprint 编辑器         | 开发中                          |
| PIR v1.3 图模型与校验    | 开发中                          |
| Workspace VFS 与后端同步 | 开发中                          |
| 外部库运行时             | 开发中                          |
| AI 辅助作者态            | 基础能力已建立                  |
| Node graph 编辑器        | 早期实现                        |
| Animation 编辑器         | 规划中 / 早期实现               |
| 多框架代码生成           | 增量推进；当前重点是 React 路径 |

更细的计划和架构决策请看 `specs/`。

## 快速开始

### 环境要求

- Node.js 22 或更新版本
- pnpm 10 或更新版本
- Go 1.22 或更新版本
- Git
- PostgreSQL，用于需要后端 Workspace 的开发流程

### 安装

```bash
git clone https://github.com/Prodivix/prodivix.git
cd prodivix
pnpm install
```

### 本地运行

日常开发建议在两个终端分别启动后端和 Web 编辑器：

```bash
pnpm dev:backend
pnpm dev:web
```

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

| 命令                          | 说明                                              |
| ----------------------------- | ------------------------------------------------- |
| `pnpm build`                  | 通过 Turbo 构建所有包和应用                       |
| `pnpm lint`                   | 运行 lint 任务                                    |
| `pnpm test`                   | 通过 Turbo 运行仓库测试                           |
| `pnpm test:e2e:smoke`         | 运行最小冒烟 E2E 测试                             |
| `pnpm format`                 | 格式化 TypeScript、Markdown、JSON、样式和 Go 代码 |
| `pnpm docs:diagnostics:check` | 检查生成的诊断文档是否同步                        |

## 文档

根 README 只作为仓库入口。详细文档放在专门的位置：

| 位置                                 | 读者                      | 用途                     |
| ------------------------------------ | ------------------------- | ------------------------ |
| `apps/docs/`                         | 用户和生态贡献者          | 独立的 VitePress 文档站  |
| `apps/docs/guide/getting-started.md` | 新本地开发者              | 详细本地启动指南         |
| `apps/docs/reference/pir-spec.md`    | PIR 读者                  | 当前 PIR 参考文档        |
| `specs/decisions/`                   | 核心维护者                | 架构决策记录             |
| `specs/pir/`                         | Runtime 和 codegen 维护者 | 版本化 PIR 契约和 Schema |
| `specs/diagnostics/`                 | 编辑器、后端和文档维护者  | 诊断码定义               |
| `specs/implementation/`              | 开发计划参与者            | 实施计划和任务 backlog   |

## 架构概览

从高层看，编辑器会把用户操作写成 command、intent 或 patch。这些变化会更新规范化 PIR graph。graph 经过校验后，通过 workspace 存储持久化；只有 renderer 或 code generator 需要树形视图时，才临时 materialize 成中间结构。

```text
Editors / AI
    -> Command / Intent / Patch
    -> PIR ui.graph
    -> Schema and graph validation
    -> Workspace VFS / Backend / Git
    -> Renderer / Preview / Code Generator
```

长期架构记录维护在 `specs/decisions/`。当前 PIR schema 和契约维护在 `specs/pir/`。

## 开发说明

- `@prodivix/ui` 使用 SCSS 编写样式。
- 应用层样式使用 Tailwind CSS 4 写法。
- 在已配置的包内，优先使用 `@/...` 这类包内别名。
- 避免依赖 DOM 层级、内部 class、快照或实现细节的耦合测试。优先测试用户可感知行为、公开 API、稳定状态结果和语义结果。
- 扫描仓库文件时优先使用 `git ls-files`、`git diff --name-only`、`git grep` 等 Git 索引命令。

## 贡献

项目正在快速演进。贡献较大改动前，请先阅读 `specs/` 中相关架构决策或实施计划，并让改动范围对齐正在实现的契约。

推荐入口：

- `AGENTS.md`：仓库开发指南
- `apps/docs/community/contributing.md`：贡献说明
- `specs/decisions/README.md`：架构决策导航

## License

Prodivix 基于 [MIT License](LICENSE) 发布。
