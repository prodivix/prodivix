# 本地启动

本页介绍如何启动 Prodivix Web 编辑器和文档站。如果只需创建本地项目，无需先运行后端。

## 环境要求

- Node.js 22 或更高版本
- Corepack
- Git
- 可选：Go 与 PostgreSQL，仅在开发后端功能时需要

仓库在根 `package.json` 中固定 pnpm 版本。使用 Corepack 可以避免全局 pnpm 与仓库版本漂移。

## 获取并安装

```bash
git clone https://github.com/Mdr-Tutorials/prodivix.git
cd prodivix
corepack enable
pnpm install
```

## 启动 Web 编辑器

```bash
pnpm dev:web
```

打开终端输出的本地地址，在首页即可创建本地项目。本地编辑链路无需后端登录。

需要使用账号、远端 Workspace 或社区功能时，再启动后端：

```bash
pnpm dev:backend
```

后端所需的环境变量和数据库设置以仓库内后端配置为准，请勿将开发密钥写入 Workspace 文档。

## 启动文档站

```bash
pnpm dev:docs
```

## 第一次冒烟操作

1. 创建一个本地项目。
2. 进入 Blueprint，将一个元素或组件拖放到画布上。
3. 在组件树中选中它，然后在 Inspector 中修改某个公开属性。
4. 打开 Code Workspace 编辑项目级代码；打开 Resources 查看素材、依赖、Token，以及导入的、外部的和归属于资源的代码文件。
5. 按 `Alt+0` 打开 Issues，查看当前诊断信息。
6. 打开 Export，检查 React/Vite 导出计划。

组件树中的”隐藏”只影响编辑画布，不会改变组件的运行时可见性。如需修改实际的条件渲染逻辑，应编辑对应的 PIR、Collection 或代码。

## 常用验证命令

```bash
pnpm --filter @prodivix/web typecheck
pnpm test
pnpm build:web
pnpm build:docs
```

完整的独立导出与浏览器验证由维护者运行：

```bash
pnpm verify:g1:standalone
pnpm verify:g1:browser
```

下一步可以前往[创建第一个项目](/tutorials/first-project)教程，或者先阅读[产品导览](/guide/product-tour)。
