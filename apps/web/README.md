# @prodivix/web

Prodivix 的核心可视化编辑器前端，基于 React 19 + TypeScript + rolldown-vite。三个编辑器（蓝图 / 节点图 / 动画）统一收敛到 **PIR**，由后端工作区 (Workspace VFS) 持久化。

## 目录结构

```text
apps/web
├── src/
│   ├── editor/          # 编辑器主壳：路由、Home、ProjectHome、editorApi
│   │   ├── features/    #   design / development / animation / settings / resources / export / newfile
│   │   └── store/       #   Zustand slice（pir / workspace / route / blueprint / project）+ 子 store
│   ├── pir/             # PIR 单源真相
│   │   ├── schema/      #   类型定义
│   │   ├── converter/   #   AST ↔ PIR
│   │   ├── validator/   #   v1.3 graph 校验（与后端镜像）
│   │   ├── renderer/    #   PIRRenderer / PIRNode / scope / helpers
│   │   ├── generator/   #   PIR → React (mitosis 桥接)
│   │   ├── graph/       #   v1.3 graph patch / mutation / materialize
│   │   ├── actions/     #   内置动作 registry（navigate / executeGraph...）
│   │   ├── shared/      #   ValueRef 解析（路径解析 + 引用类型守卫，渲染器与 generator 共用）
│   │   ├── resolvePirDocument.ts          #   主入口：直接 PIR / Workspace 快照 → PIRDocument
│   │   └── resolveWorkspaceShape.ts       #   Workspace shape 检测 + 文档规范化挑选
│   ├── core/            # 执行引擎、节点定义、Web Worker
│   ├── components/      # 通用 UI 组件封装
│   ├── auth/            # 鉴权 store + 页面
│   ├── community/       # 社区/项目浏览
│   ├── home/            # 首页
│   ├── ai/              # AI 助手 Provider 与设置
│   ├── i18n/            # i18next 资源与初始化
│   ├── esm-bridge/      # 外部库（esm.sh）运行时桥
│   ├── shortcuts/       # 全局键位（Alt+1~9 等）
│   ├── theme/           # 主题切换
│   ├── infra/           # 基础设施工具
│   ├── debug/           # 调试入口
│   ├── mock/            # mock data
│   ├── test-utils/      # vitest setup + store helper
│   ├── assets/          # 静态资源
│   └── utils/           # 通用工具函数
├── public/              # 静态资源
├── docker/              # Nginx 部署配置
├── .storybook/          # Storybook 配置
├── vite.config.ts
├── vitest.config.ts
└── tailwind.config.ts
```

## 关键架构

- **PIR Pipeline**：`schema → converter → validator → renderer → generator`
- **三编辑器收敛**：Blueprint 写 `ui` 层 / NodeGraph 写 `logic` 层 / Animation 写 `animation` 层
- **Workspace 同步**：文档级保存 (`PUT /api/workspaces/:id/documents/:docId`) + 分区 rev 乐观并发（见 `specs/decisions/07.workspace-sync.md`）
- **路由清单**：Route Manifest + Outlet 渲染链（见 `specs/decisions/08.route-manifest-outlet.md`）
- **外部库运行时**：esm.sh + canonical external IR（见 `specs/decisions/17.external-library-runtime-and-adapter.md`）
- **Inspector Panel 架构**：每个面板独立 schema（见 `specs/decisions/21.inspector-panel-architecture.md`）

## 类型规范

`@typescript-eslint/no-explicit-any` 在本仓库为 **error**。新代码不允许 `any`，需要"任意值"时用 `unknown` + 类型守卫；图标库等罕见多态场景必须使用时，需附带 `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 原因` 注释。规则配置：

- `apps/web/eslint.config.js`（flat config）
- 根 `.eslintrc.cjs`（其他 workspace 共用）

## 常用命令

```bash
pnpm dev:web              # 启动开发服务器（端口 5173）
pnpm build:web            # 构建生产包
pnpm test:web             # 单元测试
pnpm test:web:watch       # watch 模式
pnpm test:web:coverage    # 覆盖率（v8）
pnpm --filter @prodivix/web typecheck   # tsc -b 类型检查
pnpm --filter @prodivix/web lint        # ESLint（含 no-explicit-any 强制）
pnpm storybook:ui         # 组件库 Storybook
```

## 测试约定

- 引擎与 store 测试位于 `__tests__/` 同级目录。
- design 模块覆盖率阈值：80% statements / lines（见 `vitest.config.ts`）。
- jsdom 环境，setup 在 `src/test-utils/setup.ts`。
