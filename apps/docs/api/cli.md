# CLI

::: warning 当前状态
Prodivix CLI 仍是内部 scaffold，不是已发布的生产接口。不要在 CI/CD 或用户文档中依赖它完成真实导出与部署。
:::

## 当前实现

仓库内的 `@prodivix/cli` 使用 Commander，目前注册了 `build` 和 `export` 两个命令。其中 `build` 仅输出”命令已连接”的占位信息，`export` 尚未形成可用的产品流程；deploy 也不是已注册的稳定命令。

开发入口：

```bash
pnpm dev:cli
pnpm build:cli
pnpm cli --help
```

这些命令仅用于开发阶段的 scaffold，不构成版本兼容性承诺。

## 当前可靠的构建入口

Prodivix 自身仓库使用：

```bash
pnpm build:web
pnpm build:docs
pnpm verify:g1:standalone
pnpm verify:g1:browser
```

用户项目导出应通过 Web 的 Export surface 和 `@prodivix/prodivix-compiler` 统一规划。CLI 后续必须使用同一套 Export Program / Production Export Planner，不能另行复制一套 PIR → React 实现。

## 成为稳定 CLI 前需要完成

- 明确 Workspace 输入、revision 与认证方式
- 复用 compiler target preset 与诊断契约
- 支持 machine-readable result、exit code 和 SourceTrace
- 处理 secrets、runtime zones 与 ExecutionProvider
- 建立独立的导出、兼容性和发布 Gate

在这些条件满足之前，CLI 的版本和参数随时可能调整。
