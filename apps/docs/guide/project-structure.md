# 项目结构

Prodivix 采用 Monorepo 架构，使用 pnpm workspace 和 Turborepo 管理。本文档只保留当前仓库里真实存在、并且对理解系统边界最有用的结构说明。

## 整体结构

```text
prodivix/
├── apps/
│   ├── web/            # Web 编辑器主应用
│   ├── backend/        # Go 后端服务
│   ├── cli/            # 命令行工具
│   ├── docs/           # 文档站点
│   └── vscode/         # VS Code 扩展
├── packages/
│   ├── ai/             # AI provider 与任务工具
│   ├── eslint-plugin-prodivix/
│   ├── i18n/
│   ├── plugin-contracts/ # Plugin Manifest 与 contribution contracts
│   ├── plugin-host/      # transport-neutral lifecycle / permission / registry
│   ├── plugin-protocol/  # versioned JSON wire protocol
│   ├── plugin-browser/   # Browser sandbox 与 Gateway transport
│   ├── plugin-package/   # deterministic artifact 与 bundled catalog
│   ├── plugin-react-host/# official React projection ABI
│   ├── plugin-antd/      # bundled Ant Design official plugin
│   ├── plugin-mui/       # bundled Material UI official plugin
│   ├── plugin-radix/     # bundled Radix UI official plugin
│   ├── prodivix-compiler/
│   ├── shared/         # 共享 LLM、类型和脚本
│   ├── themes/         # 主题与设计令牌
│   ├── ui/             # 组件库
│   └── vscode-debugger/
├── specs/              # 规范、诊断码、设计决策、实现记录
├── tests/              # E2E 测试
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json
```

## 应用层

### `apps/web`

Web 编辑器是主应用，核心代码集中在 `src/`：

```text
apps/web/src/
├── App.tsx
├── main.tsx
├── ai/
├── auth/                 # 登录、会话、个人资料
├── authoring/            # Code Authoring / Symbol Environment
├── community/            # 社区页
├── components/
├── core/                 # 执行器、节点、Worker、类型
├── debug/                # 断点、状态、时间线
├── diagnostics/          # 诊断模型与注册表
├── editor/               # 编辑器主流程与功能区
│   ├── features/
│   │   ├── animation/
│   │   ├── blueprint/
│   │   ├── development/
│   │   │   └── reactflow/
│   │   ├── export/
│   │   ├── newfile/
│   │   ├── resources/
│   │   └── settings/
│   ├── shortcuts/
│   └── store/
├── esm-bridge/           # React / React DOM 兼容桥接
├── home/
├── i18n/
├── infra/api/            # API 客户端与错误处理
├── pir/                  # AST / 转换 / 图 / 生成 / 渲染 / 校验
├── mock/
├── plugins/              # Web Plugin Platform composition 与 surface bridge
├── router/
├── shortcuts/
├── test-utils/
├── theme/
├── workspace/
└── utils/
```

这里有几处比较关键的分层：

- `src/pir` 是 PIR 数据与读写链路的核心。
- `src/editor/features/blueprint` 是蓝图编辑器的主实现。
- `src/editor/features/development/reactflow` 是节点图编辑器相关实现。
- `src/diagnostics` 是前端诊断域的统一入口。
- `src/esm-bridge` 负责浏览器端对 React 运行时的桥接。
- `src/plugins/platform` 组合 workspace-scoped Plugin Host、bundled official catalog 与编辑器查询服务。

### `apps/backend`

后端已经改成标准 Go 项目布局，不再是扁平文件结构：

```text
apps/backend/
├── cmd/
│   └── server/
├── internal/
│   ├── app/
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   ├── integrations/github/
│   │   ├── project/
│   │   └── workspace/
│   └── platform/
│       ├── database/
│       └── http/
├── Dockerfile
├── README.md
├── server.go
├── docker-compose.yml
├── go.mod
└── go.sum
```

这里的重点是：

- `cmd/server` 是启动入口。
- `internal/modules/workspace` 承担 workspace、intent、patch、PIR 校验等核心逻辑。
- `internal/modules/auth`、`project`、`integrations/github` 分别负责认证、项目与第三方集成。
- `internal/platform` 放公共基础设施层。

### `apps/cli`

```text
apps/cli/
├── bin/prodivix.js
├── src/
│   ├── cli.ts
│   ├── commands/
│   └── utils/
├── test/
└── package.json
```

### `apps/docs`

```text
apps/docs/
├── .vitepress/
├── api/
├── community/
├── guide/
├── reference/
├── public/
├── index.md
└── package.json
```

### `apps/vscode`

```text
apps/vscode/
├── src/
│   ├── commands/
│   ├── debugger/
│   ├── extension.ts
│   ├── index.ts
│   ├── language/
│   └── test/
└── package.json
```

## 共享包

### `packages/ui`

UI 组件库按组件类别分组，样式主要跟随组件文件放置：

```text
packages/ui/
├── .storybook/
├── src/
│   ├── button/
│   ├── container/
│   ├── data/
│   ├── embed/
│   ├── feedback/
│   ├── form/
│   ├── icon/
│   ├── image/
│   ├── input/
│   ├── link/
│   ├── nav/
│   ├── text/
│   ├── video/
│   └── index.ts
└── package.json
```

### `packages/ai`

```text
packages/ai/
├── src/
│   ├── providers/
│   ├── settings/
│   ├── tasks/
│   └── validation/
└── package.json
```

### `packages/shared`

```text
packages/shared/
├── scripts/
├── src/
│   ├── llm/
│   └── types/
└── package.json
```

### `packages/themes`

```text
packages/themes/
├── base/
├── manifests/
├── presets/
├── semantic/
├── src/
└── utils/
```

### 其他包

- `packages/i18n`：公共国际化资源与转换脚本。
- `packages/plugin-contracts` / `plugin-host` / `plugin-protocol` / `plugin-browser`：插件契约、生命周期、协议与 Browser sandbox。
- `packages/plugin-package` / `plugin-react-host`：deterministic package artifact 与 official React projection ABI。
- `packages/plugin-antd` / `plugin-mui` / `plugin-radix`：三个 bundled official component plugin。
- `packages/prodivix-compiler`：PIR 编译入口包。
- `packages/eslint-plugin-prodivix`：仓库自定义 ESLint 规则。
- `packages/vscode-debugger`：VS Code 调试适配器。

## 规范文档

`specs/` 现在主要分成几类：

- `specs/pir/`：PIR contract 与 schema。
- `specs/diagnostics/`：诊断码文档。
- `specs/decisions/`：设计决策。
- `specs/implementation/`：实现方案和任务拆分。
- `specs/api/`、`specs/router/`、`specs/workspace/`：协议与领域文档。

## 说明

这份结构文档的目标是帮你快速判断“代码应该放哪里、职责边界在哪里”。如果某个目录已经被拆分或收敛，优先相信这里的说明和真实文件树。
