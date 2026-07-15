# CLI

::: warning 当前状态
Prodivix CLI 仍是内部 scaffold，不是已发布的生产接口。不要在 CI/CD 或用户文档中依赖它完成真实导出与部署。
:::

## 当前实现

仓库内 `@prodivix/cli` 使用 Commander，并注册了 `build` 与 `export` 名称。其中 `build` 目前只输出“命令已连接”，`export` 尚未形成可用产品流程；deploy 也不是已注册的稳定命令。

开发入口：

```bash
pnpm dev:cli
pnpm build:cli
pnpm cli --help
```

这些命令用于开发 scaffold，不构成版本兼容承诺。

## 当前可靠的构建入口

Prodivix 自身仓库使用：

```bash
pnpm build:web
pnpm build:docs
pnpm verify:g1:standalone
pnpm verify:g1:browser
```

用户项目导出应从 Web 的 Export surface 和 `@prodivix/prodivix-compiler` 统一规划。CLI 后续必须消费同一个 Export Program/Production Export Planner，不能复制一套 PIR → React 实现。

## 成为稳定 CLI 前需要完成

- 明确 Workspace 输入、revision 与认证方式
- 复用 compiler target preset 与诊断契约
- 支持 machine-readable result、exit code 和 SourceTrace
- 处理 secrets、runtime zones 与 ExecutionProvider
- 建立独立导出、兼容性和发布 Gate

在这些条件完成前，CLI 版本与参数都可能直接调整。
