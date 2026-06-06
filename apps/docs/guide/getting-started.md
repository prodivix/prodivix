# 快速开始

本指南将帮助你在本地环境中运行 Prodivix，并创建你的第一个项目。

## 前置条件

在开始之前，请确保你的开发环境满足以下要求：

| 依赖    | 版本要求  | 检查命令         |
| ------- | --------- | ---------------- |
| Node.js | >= 22.0.0 | `node --version` |
| pnpm    | >= 10.0.0 | `pnpm --version` |
| Git     | 任意版本  | `git --version`  |

::: tip 安装 pnpm
如果你还没有安装 pnpm，可以通过以下命令安装：

```bash
npm install -g pnpm
```

:::

## 克隆仓库

```bash
git clone https://github.com/Prodivix/prodivix.git
cd prodivix
```

## 安装依赖

Prodivix 使用 pnpm workspace 管理多个包：

```bash
pnpm install
```

这将安装所有应用和包的依赖。

## 启动开发服务器

### 推荐启动顺序

1. 启动后端：

```bash
pnpm dev:backend
```

2. 启动 Web 编辑器：

```bash
pnpm dev:web
```

3. 如需查看文档：

```bash
pnpm dev:docs
```

Web 编辑器默认运行在 `http://localhost:5173`，文档站点默认运行在 VitePress 的本地地址。

### 常用开发命令

| 命令                          | 描述                      |
| ----------------------------- | ------------------------- |
| `pnpm dev`                    | 启动所有可用开发任务      |
| `pnpm dev:web`                | 启动 Web 编辑器           |
| `pnpm dev:backend`            | 启动后端服务              |
| `pnpm dev:backend:hot`        | 以热重载方式启动后端      |
| `pnpm dev:docs`               | 启动文档站点              |
| `pnpm dev:cli`                | 启动 CLI 开发模式         |
| `pnpm dev:vscode`             | 启动 VS Code 扩展开发任务 |
| `pnpm storybook:ui`           | 启动 UI 组件库 Storybook  |
| `pnpm build`                  | 构建全部包                |
| `pnpm build:web`              | 构建 Web 编辑器           |
| `pnpm build:backend`          | 构建后端                  |
| `pnpm build:docs`             | 构建文档站点              |
| `pnpm test`                   | 运行全部测试              |
| `pnpm test:e2e:smoke`         | 运行最小冒烟 E2E 测试     |
| `pnpm lint`                   | 代码检查                  |
| `pnpm format`                 | 格式化代码                |
| `pnpm docs:diagnostics`       | 生成诊断文档              |
| `pnpm docs:diagnostics:check` | 检查诊断文档是否同步      |

## 下一步

- [简介](/guide/introduction)
- [项目结构](/guide/project-structure)
- [PIR 规范](/reference/pir-spec)
