# @prodivix/web

Prodivix 的浏览器端编辑器与产品组合层，基于 React 19、TypeScript 和 Vite。Web 应用负责蓝图、节点图、动画、资源、Issues、冲突处理等交互界面，并把领域行为组合到独立的 `@prodivix/*` Core package；它不再拥有 Workspace、PIR、Router、Renderer 或 Runtime 的第二套核心实现。

当前产品阶段为 **G0 Passed / G1 Foundation**。G0 的 Truth & Change Kernel 已通过 `pnpm run verify:g0` 验证；代码与视觉混合作者环境仍处于基础建设阶段。

## 当前写入链路

```text
Editor surface
  -> @prodivix/workspace Command / Transaction / History
  -> @prodivix/workspace-sync durable outbox + local replica
  -> Backend Atomic WorkspaceOperation Commit
  -> confirmed Canonical Workspace VFS snapshot
```

- `WorkspaceSnapshot` 是 Web 进程内唯一的作者态 Workspace 表达，统一持有 Route、PIR、Code Documents、Assets 与 Project Config。
- 蓝图、节点图、动画、路由、代码和资源变更必须先形成 Command 或 Transaction；Web 不直接调用旧 document `PATCH` 或 `POST /intents`。
- Operation 与 Settings 使用各自的 durable outbox。exact request 在发送前持久化，ACK、重试、离线恢复和 revision conflict 由 Workspace Sync 链路处理。
- Settings 通过独立的强幂等 commit 提交；领域文档写入统一进入 Atomic WorkspaceOperation Commit。

## 目录结构

```text
apps/web/
├── src/
│   ├── ai/                 # AI Provider 与产品 UI 组合
│   ├── auth/               # 鉴权状态与页面
│   ├── community/          # 社区浏览与发布相关页面
│   ├── components/         # Web 应用通用组件
│   ├── debug/              # 调试界面组合
│   ├── editor/             # 编辑器壳、功能区、store 与同步 adapter
│   │   ├── features/       # animation / blueprint / development / issues / resources 等
│   │   ├── store/          # Canonical Workspace、History、冲突等 UI 状态组合
│   │   └── workspaceSync/  # IndexedDB outbox、local replica、恢复与 commit adapter
│   ├── home/               # 产品首页
│   ├── i18n/               # i18next 初始化与应用资源
│   ├── infra/api/          # HTTP client 与统一错误处理
│   ├── pir/                # Web 专用 action、AST 与转换 adapter
│   ├── plugins/            # workspace-scoped Web Plugin Platform 组合层
│   ├── router/             # Web 专用 route/code-slot adapter
│   ├── shortcuts/          # 全局快捷键
│   ├── test-utils/         # Vitest / jsdom 测试辅助
│   └── theme/              # Web 主题切换
├── public/
├── docker/
├── .storybook/
├── vite.config.ts
└── vitest.config.ts
```

`src/pir` 与 `src/router` 只保留 Web adapter。核心 owner 如下：

| 能力                                                   | Package owner                                          |
| ------------------------------------------------------ | ------------------------------------------------------ |
| Canonical Workspace VFS、Command、Transaction、History | `@prodivix/workspace`                                  |
| Outbox、local replica、revision conflict、commit wire  | `@prodivix/workspace-sync`                             |
| PIR graph、materialization、normalization、validation  | `@prodivix/pir`                                        |
| React PIR projection                                   | `@prodivix/pir-react-renderer`                         |
| Route contract、codec、matching、mutation、validation  | `@prodivix/router`                                     |
| NodeGraph / Animation 领域内核                         | `@prodivix/nodegraph` / `@prodivix/animation`          |
| Transport-neutral runtime 与浏览器 adapter             | `@prodivix/runtime-core` / `@prodivix/runtime-browser` |
| Code Authoring / Symbol Environment 与诊断             | `@prodivix/authoring` / `@prodivix/diagnostics`        |
| Workspace / PIR 导出                                   | `@prodivix/prodivix-compiler`                          |

## 当前能力边界

- Blueprint、NodeGraph 与 Animation 已有 Web 编辑界面和独立领域 package，但完整行为组合、生命周期、冲突语义与浏览器验证仍属于后续 Gate。
- CodeArtifact、CodeReference、CodeSlot 和 Authoring Registry 已有基础；真实 Language Service、visual/code round-trip 与完整代码工作区尚未闭环。
- React/Vite Workspace export 已进入 G0 Golden 的无浏览器验证，但独立导出项目的 install、typecheck、test、browser smoke 和 visual regression 仍是 G1+ 工作。
- AI Provider、streaming 与工具基础不等于可直接写入 Workspace；生产级 AI 写入仍必须复用同一 Command、outbox、验证和审阅链路。
- React/Vite 是当前 Golden 基线。其他框架 target 仍属于后续路线图，不应视为已交付能力。

## Plugin Sandbox 配置

需要执行 Browser plugin runtime 时，在 Web 的 Vite 环境中设置：

```dotenv
VITE_PLUGIN_SANDBOX_URL=https://plugins.example.com/runtime-broker.html
```

该 URL 必须来自不携带 Prodivix 登录 Cookie 或用户数据的独立 origin，并由 `apps/plugin-sandbox` 的构建产物提供 CSP 与 Permissions Policy。未配置时，受信任的静态 contribution 仍可使用，但 runtime activation 会 fail closed，不会回退到普通 same-origin Worker 或同源 iframe。

相关门禁：

```bash
pnpm --filter @prodivix/plugin-sandbox test
pnpm test:e2e:plugin-sandbox:matrix
```

## 类型规范

`@typescript-eslint/no-explicit-any` 在本应用为 `error`。新代码优先使用 `unknown` 与类型守卫；确需例外时必须给出局部禁用原因。lint 规则由仓库根目录的 `eslint.config.mjs` 统一拥有,不再有 per-app 配置。

## 常用命令

```bash
pnpm dev:web
pnpm build:web
pnpm test:web
pnpm test:web:watch
pnpm test:web:coverage
pnpm --filter @prodivix/web typecheck
pnpm --filter @prodivix/web lint
pnpm run verify:g0
```
