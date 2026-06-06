# 开发指南

本文档为 Prodivix 的开发者提供详细的开发环境配置和工作流程指南。

## 环境要求

| 工具    | 版本      | 用途              |
| ------- | --------- | ----------------- |
| Node.js | >= 20.0.0 | JavaScript 运行时 |
| pnpm    | >= 10.0.0 | 包管理器          |
| Go      | >= 1.24   | 后端开发          |
| Git     | 任意      | 版本控制          |

## 快速开始

### 克隆仓库

```bash
git clone https://github.com/prodivix/prodivix.git
cd prodivix
```

### 安装依赖

```bash
# 安装所有依赖
pnpm install
```

### 启动开发服务器

```bash
# 启动所有服务
pnpm dev

# 或单独启动
pnpm dev:web      # Web 编辑器 (http://localhost:5173)
pnpm dev:docs     # 文档站点 (http://localhost:5174)
pnpm storybook:ui # Storybook (http://localhost:6006)
```

### 启动后端

```bash
cd apps/backend
go run .
# 后端运行在 http://localhost:8080
```

## 项目架构

### Monorepo 结构

项目使用 pnpm workspace + Turborepo 管理：

```
prodivix/
├── apps/                 # 应用
│   ├── web/             # React Web 编辑器
│   ├── backend/         # Go 后端服务
│   ├── cli/             # CLI 工具
│   ├── docs/            # VitePress 文档
│   └── vscode/          # VS Code 扩展
│
├── packages/             # 共享包
│   ├── ui/              # UI 组件库
│   ├── pir-compiler/    # PIR 编译器
│   ├── shared/          # 共享类型
│   ├── themes/          # 主题
│   ├── i18n/            # 国际化
│   ├── eslint-plugin-prodivix/ # ESLint 插件
│   └── vscode-debugger/ # VS Code 调试器
│
├── tests/                # E2E 测试
├── specs/                # 规范文档
│
├── package.json          # 根配置
├── pnpm-workspace.yaml   # 工作区配置
├── turbo.json           # Turborepo 配置
└── tsconfig.json        # TypeScript 根配置
```

### 包依赖关系

```
apps/web
  ├── @prodivix/ui
  ├── @prodivix/shared
  ├── @prodivix/themes
  └── @prodivix/i18n

apps/cli
  └── @prodivix/pir-compiler

packages/ui
  ├── @prodivix/shared
  └── @prodivix/themes

packages/pir-compiler
  └── @prodivix/shared
```

## 开发工作流

### 添加新包

```bash
# 创建新包目录
mkdir -p packages/new-package/src

# 创建 package.json
cd packages/new-package
pnpm init
```

**package.json 模板**:

```json
{
  "name": "@prodivix/new-package",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.9.0"
  }
}
```

### 添加依赖

```bash
# 添加到特定包
pnpm --filter @prodivix/web add lodash

# 添加开发依赖
pnpm --filter @prodivix/ui add -D vitest

# 添加内部包依赖
pnpm --filter @prodivix/web add @prodivix/shared
```

### 运行脚本

```bash
# 运行所有包的脚本
pnpm build

# 运行特定包的脚本
pnpm --filter @prodivix/ui build
pnpm --filter @prodivix/web test

# 使用 Turborepo
pnpm turbo run build
pnpm turbo run test --filter=@prodivix/web
```

## 技术栈详解

### 前端 (apps/web)

| 技术          | 版本   | 用途       |
| ------------- | ------ | ---------- |
| React         | 19     | UI 框架    |
| TypeScript    | 5.9    | 类型系统   |
| Vite          | latest | 构建工具   |
| Tailwind CSS  | 4.1    | 样式框架   |
| Zustand       | 5      | 状态管理   |
| React Router  | 7      | 路由       |
| @dnd-kit      | latest | 拖拽功能   |
| Monaco Editor | latest | 代码编辑器 |

**目录结构**:

```
apps/web/src/
├── App.tsx              # 应用入口
├── index.tsx           # 渲染入口
│
├── core/               # 核心引擎
│   ├── executor/       # 节点图执行器
│   ├── nodes/          # 内置节点
│   └── worker/         # Web Worker
│
├── editor/             # 编辑器模块
│   ├── Editor.tsx
│   ├── EditorBar/
│   └── features/
│       ├── design/     # 蓝图编辑器
│       ├── development/# 节点图
│       ├── export/     # 导出
│       └── settings/   # 设置
│
├── pir/                # PIR 相关
│   ├── ast/            # AST 解析
│   ├── converter/      # 转换器
│   ├── generator/      # 代码生成
│   └── renderer/       # 渲染器
│
└── i18n/               # 国际化
    └── resources/
```

### UI 组件库 (packages/ui)

| 技术      | 用途     |
| --------- | -------- |
| React     | 组件框架 |
| SCSS      | 样式     |
| Storybook | 组件文档 |
| Vitest    | 单元测试 |

**开发组件**:

```bash
# 启动 Storybook
pnpm storybook:ui

# 运行测试
pnpm --filter @prodivix/ui test

# 构建
pnpm --filter @prodivix/ui build
```

**添加新组件**:

1. 创建组件目录：

```
packages/ui/src/button/
├── PdxButton.tsx
├── PdxButton.scss
├── PdxButton.stories.tsx
├── PdxButton.test.tsx
└── index.ts
```

2. 导出组件：

```typescript
// packages/ui/src/index.ts
export * from './button';
```

### 后端 (apps/backend)

| 技术   | 用途     |
| ------ | -------- |
| Go     | 编程语言 |
| Gin    | Web 框架 |
| bcrypt | 密码哈希 |

**目录结构**:

```
apps/backend/
├── main.go         # 入口
├── server.go       # HTTP 服务器
├── store.go        # 数据存储
├── config.go       # 配置
├── types.go        # 类型定义
├── go.mod
└── Makefile
```

**开发命令**:

```bash
cd apps/backend

# 运行
go run .

# 构建
go build -o prodivix-backend

# 测试
go test ./...
```

## 测试

### 单元测试

```bash
# 运行所有测试
pnpm test

# 运行特定包测试
pnpm --filter @prodivix/web test
pnpm --filter @prodivix/ui test

# 监听模式
pnpm --filter @prodivix/web test -- --watch

# 生成覆盖率报告
pnpm --filter @prodivix/web test -- --coverage
```

### E2E 测试

```bash
# 安装 Playwright 浏览器
pnpm --filter tests exec playwright install

# 运行 E2E 测试
pnpm test:e2e

# 运行特定测试
pnpm --filter tests test -- editor.spec.ts

# 调试模式
pnpm --filter tests test -- --debug
```

## 构建

### 开发构建

```bash
# 构建所有包
pnpm build

# 构建特定包
pnpm --filter @prodivix/ui build
```

### 生产构建

```bash
# 构建 Web 应用
pnpm --filter @prodivix/web build

# 构建文档
pnpm --filter @prodivix/docs build
```

### 预览构建结果

```bash
pnpm --filter @prodivix/web preview
```

## 代码质量

### ESLint

```bash
# 检查
pnpm lint

# 自动修复
pnpm lint --fix
```

**配置文件**: `eslint.config.js`

### Prettier

```bash
# 格式化
pnpm format

# 检查格式
pnpm format --check
```

**配置文件**: `.prettierrc`

### TypeScript

```bash
# 类型检查
pnpm typecheck

# 或针对特定包
pnpm --filter @prodivix/web exec tsc --noEmit
```

## 调试

### VS Code 调试

创建 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Debug Web",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/apps/web/src"
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug CLI",
      "program": "${workspaceFolder}/apps/cli/src/cli.ts",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["tsx"]
    }
  ]
}
```

### React DevTools

安装 React DevTools 浏览器扩展进行组件调试。

### 后端调试

使用 Delve 调试 Go 后端：

```bash
cd apps/backend
dlv debug .
```

## 发布

### 版本管理

项目使用语义化版本：

- `MAJOR.MINOR.PATCH`
- 例如：`1.2.3`

### 发布流程

1. 更新版本号
2. 更新 CHANGELOG
3. 创建 Git 标签
4. 推送到远程

```bash
# 更新版本
pnpm version patch  # 或 minor, major

# 创建标签
git tag v1.2.3

# 推送
git push origin main --tags
```

## 常见问题

### pnpm 安装失败

```bash
# 清理缓存
pnpm store prune

# 删除 node_modules
rm -rf node_modules
rm -rf apps/*/node_modules
rm -rf packages/*/node_modules

# 重新安装
pnpm install
```

### 类型错误

```bash
# 重新生成类型
pnpm --filter @prodivix/shared build

# 重启 TypeScript 服务器（VS Code）
Ctrl+Shift+P -> TypeScript: Restart TS Server
```

### 端口被占用

```bash
# 查找占用进程
lsof -i :5173
netstat -ano | findstr :5173  # Windows

# 终止进程或使用其他端口
```

## 资源

- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Vite 文档](https://vitejs.dev/)
- [pnpm 文档](https://pnpm.io/)
- [Turborepo 文档](https://turbo.build/repo)
