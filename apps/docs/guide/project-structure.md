# 项目结构

Prodivix 使用 pnpm workspace 与 Turborepo 管理 Monorepo。当前产品阶段为 **G0 Passed / G1 Foundation**；目录和 package owner 以真实仓库与 Core boundary 为准，不再把历史 Web 私有实现当作当前架构。

## 顶层结构

```text
prodivix/
├── apps/                 # 可运行应用与产品 adapter
│   ├── backend/
│   ├── cli/
│   ├── docs/
│   ├── plugin-sandbox/
│   ├── vscode/
│   └── web/
├── packages/             # Transport-neutral Core、projection 与共享包
├── scripts/              # 构建、验证、代码生成与边界检查
├── specs/                # ADR、协议、路线图、诊断码与实现记录
├── tests/                # 跨应用 E2E
├── deploy/               # 部署组合配置
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 应用层

### `apps/web`

Web 是 React 编辑器与产品组合层：

```text
apps/web/src/
├── ai/
├── auth/
├── community/
├── components/
├── debug/
├── editor/
│   ├── features/
│   │   ├── animation/
│   │   ├── blueprint/
│   │   ├── development/       # NodeGraph Web surface
│   │   ├── export/
│   │   ├── issues/
│   │   ├── newfile/
│   │   ├── resources/
│   │   ├── revisionConflict/
│   │   └── settings/
│   ├── shortcuts/
│   ├── store/                 # Canonical Workspace 与 UI composition
│   └── workspaceSync/         # IndexedDB outbox / replica / recovery adapters
├── esm-bridge/
├── home/
├── i18n/
├── infra/api/
├── mock/
├── pir/                       # Web action / AST / converter adapters
├── plugins/                   # workspace-scoped Plugin Platform composition
├── router/                    # Web route/code-slot adapter
├── shortcuts/
├── test-utils/
├── theme/
├── App.tsx
└── main.tsx
```

重要边界：

- 不存在 `apps/web/src/core`。Runtime Core 与 NodeGraph 内核由 `packages/runtime-core` 和 `packages/nodegraph` 持有。
- `apps/web/src/pir` 不拥有 canonical PIR validator、resolver 或 React renderer；它们分别位于 `packages/pir` 和 `packages/pir-react-renderer`。
- `apps/web/src/router` 不拥有 Router Core；route contract、codec、matching、mutation 与 validation 位于 `packages/router`。
- Zustand store 保存一个 canonical `WorkspaceSnapshot` 与产品 UI 状态，不保存第二份 PIR、Route 或 document mirror。
- 领域写入由 `@prodivix/workspace` Command / Transaction 形成，再通过 `editor/workspaceSync` adapter 与 `@prodivix/workspace-sync` durable outbox 提交。

### `apps/backend`

```text
apps/backend/
├── cmd/server/
├── internal/
│   ├── app/
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   ├── integrations/
│   │   ├── project/
│   │   └── workspace/
│   └── platform/
│       ├── database/
│       └── http/
├── server.go
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

- `modules/project` 负责项目元数据、社区读取和显式发布投影。
- `modules/workspace` 负责 snapshot 读取、capability、Atomic WorkspaceOperation Commit、Settings Commit、VFS / Route / PIR 校验与事务持久化。
- 后端没有公开的 Intent 或直接 document PATCH 写入入口。`patch*.go` 是 Atomic Commit 内部的受校验 patch 应用器。
- 数据库迁移当前内嵌在 `internal/platform/database/database.go`，不是独立的 `migrations/` 目录。

### `apps/plugin-sandbox`

独立 origin 的 Browser plugin runtime broker，包含 runtime broker、UI conformance、安全策略、构建与部署验证脚本。Web 只通过受限协议连接它，不回退到同源 iframe 或普通 same-origin Worker。

### `apps/cli`

Commander 基础工程，当前只有 `build` 与 `export` 命令入口，尚未接入 Canonical Workspace、同步、生产导出或部署闭环。它不是 G0 写入链路的独立 client。

### `apps/docs`

VitePress 文档站，包含 guide、reference、API、community 与自动生成的 diagnostics 页面。全局产品阶段以 `specs/roadmap/global-phases.md` 为准。

### `apps/vscode`

VS Code 扩展基础，当前 `src/` 包含 commands、language、tests 与扩展入口。调试适配器的共享实现位于 `packages/vscode-debugger`。

## Core 与共享 package

### Truth & Change Kernel

| Package                   | Owner 边界                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `packages/workspace`      | Canonical Workspace VFS、codec、validator、selector、Command、Transaction、History 与 projection            |
| `packages/workspace-sync` | Atomic Commit wire、revision、durable outbox、local replica、semantic diff / rebase 与 conflict session     |
| `packages/pir`            | PIR graph、normalization、materialization、fragment、ValueRef、resolver 与 validator                        |
| `packages/router`         | Route contract、codec、matching、navigation、mutation、composition 与 validator                             |
| `packages/diagnostics`    | 跨领域 diagnostic contract、registry、collection 与 presentation                                            |
| `packages/authoring`      | CodeArtifact、CodeReference 与 CodeSlot 基础；G1 Workspace Semantic Index、semantic query 与 provider owner |

### Behavior 与 Runtime

| Package                    | Owner 边界                                                                         |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `packages/nodegraph`       | Transport-neutral NodeGraph contract、codec、validation、selection 与 executor     |
| `packages/animation`       | Transport-neutral Animation contract、normalization、authoring helper 与 evaluator |
| `packages/runtime-core`    | Transport-neutral execution contract 与 executor registry                          |
| `packages/runtime-browser` | Browser execution adapter 与 animation preview projection                          |

这些 package 已构成 G0/G1 的领域基础，但 NodeGraph、Animation 与跨域行为的完整生命周期、冲突和 Verification Evidence 仍属于后续产品 Gate。

### Projection、Compiler 与 Golden

| Package                       | Owner 边界                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| `packages/pir-react-renderer` | PIR 的 React projection、component registry、interaction port 与 icon provider               |
| `packages/prodivix-compiler`  | PIR / Workspace export、Export Program 与 target planning                                    |
| `packages/golden-conformance` | Living Golden App，验证 G0 修改、恢复、冲突、完整 Workspace React/Vite export 与进程内 build |

Golden 当前不包含独立项目依赖安装、typecheck、runtime behavior、browser smoke 或视觉回归；这些仍是 G1+ Gate。

### Plugin Platform

```text
plugin-contracts   Serializable contracts 与 manifest validation
plugin-protocol    Versioned strict JSON wire protocol
plugin-host        Transport-neutral lifecycle、permission 与 registry
plugin-browser     Browser sandbox / Gateway transport adapter
plugin-package     Deterministic bundled artifact 与 package source
plugin-react-host  Official React projection ABI
plugin-antd        Bundled Ant Design official plugin
plugin-mui         Bundled Material UI official plugin
plugin-radix       Bundled Radix official plugin
```

这些基础不等于 public SDK、签名审核、Marketplace 或完整生态 Gate 已完成。

### 其他共享包

- `packages/ui`：SCSS 组件库与 Storybook。
- `packages/themes`：设计令牌、主题 manifest、preset 与工具。
- `packages/ai`：AI provider、settings、task 与 validation 基础。
- `packages/i18n`：共享国际化资源。
- `packages/shared`：仍在使用的共享类型与辅助代码；新领域语义应进入明确 owner package。
- `packages/eslint-plugin-prodivix`：仓库自定义 ESLint 规则。
- `packages/vscode-debugger`：VS Code Debug Adapter。

## 规范与验证

```text
specs/
├── api/             # OpenAPI 等传输协议
├── decisions/       # Architecture Decision Records
├── diagnostics/     # 诊断码 catalog
├── implementation/  # 实施方案、review 与任务拆分
├── pir/             # PIR contract 与 schema
├── roadmap/         # Global Phase 与 Gate 证据
├── router/          # Router 领域规范
└── workspace/       # Workspace 模型规范
```

G0 的完整验证入口为：

```bash
pnpm run verify:g0
```

它验证 Core boundaries、生产写入 Hard Cut、诊断 catalog、13 个核心 package 与 Golden、Web 类型和恢复 adapter，以及后端 Workspace contract。它不是浏览器、视觉或独立导出项目验证入口。
