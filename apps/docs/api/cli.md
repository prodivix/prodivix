# CLI 工具

`prodivix` 是 Prodivix 的命令行工具，用于项目构建、导出和部署。

::: warning 开发状态
CLI 工具目前处于早期开发阶段，部分命令尚未完全实现。
:::

## 安装

CLI 工具包含在 monorepo 中，通过以下方式使用：

```bash
# 在项目根目录
pnpm dev:cli

# 或直接运行
cd apps/cli
pnpm start
```

## 基本用法

```bash
prodivix [command] [options]
```

## 可用命令

### build

构建 PIR 项目为 React 代码。

```bash
prodivix build
```

**当前状态**: 已连接，功能开发中

**计划功能**:

- 解析 PIR 文件
- 生成 React 组件代码
- 处理节点图逻辑
- 输出构建产物

### export

导出项目为静态站点或框架代码。

```bash
prodivix export [options]
```

**当前状态**: 未实现

**计划功能**:

| 选项                   | 描述                               |
| ---------------------- | ---------------------------------- |
| `--target <framework>` | 目标框架（react, vue, angular 等） |
| `--output <dir>`       | 输出目录                           |
| `--page <name>`        | 仅导出指定页面                     |
| `--with-tests`         | 包含测试文件                       |

### deploy

部署项目到托管平台。

```bash
prodivix deploy [options]
```

**当前状态**: 未实现

**计划功能**:

| 选项                | 描述                                            |
| ------------------- | ----------------------------------------------- |
| `--platform <name>` | 部署平台（github-pages, vercel, netlify, ipfs） |
| `--config <file>`   | 配置文件路径                                    |

## 配置文件

CLI 工具支持通过配置文件自定义行为。创建 `prodivix.config.json`：

```json
{
  "build": {
    "outDir": "dist",
    "target": "react",
    "minify": true
  },
  "export": {
    "framework": "react",
    "typescript": true,
    "cssModule": true
  },
  "deploy": {
    "platform": "vercel",
    "projectName": "my-app"
  }
}
```

## 开发计划

以下功能计划在后续版本中实现：

### 近期计划

- [ ] `build` 命令完整实现
- [ ] `export` 命令 React 导出
- [ ] 配置文件支持

### 中期计划

- [ ] `export` 命令 Vue/Angular 导出
- [ ] `deploy` 命令 Vercel 集成
- [ ] 项目模板初始化命令

### 远期计划

- [ ] 增量构建支持
- [ ] 插件系统
- [ ] IPFS 部署支持

## 故障排除

### 命令未找到

确保在正确的目录下运行，或将 CLI 添加到 PATH：

```bash
# 在 monorepo 根目录
pnpm --filter @prodivix/cli start
```

### 构建失败

检查 PIR 文件语法是否正确：

```bash
# 验证 PIR 文件
prodivix validate ./src/pages/*.pir.json
```

## 贡献

CLI 工具正在积极开发中，欢迎贡献：

1. Fork 仓库
2. 在 `apps/cli/src/commands/` 下添加或修改命令
3. 添加测试
4. 提交 Pull Request

详见 [贡献指南](/community/contributing)。
