# @prodivix/cli

Prodivix 的命令行工具，基于 Commander，用于项目初始化、PIR 文档同步与构建辅助。

## 目录结构

```text
apps/cli
├── src/
│   ├── commands/        # CLI 子命令（init / sync / build / login...）
│   ├── utils/           # 工具：fs、http client、auth token 缓存
│   └── cli.ts           # 入口
├── bin/
│   └── prodivix.js           # 可执行入口（npx / 全局安装）
├── test/                # CLI e2e/单元测试
├── package.json
└── tsconfig.json
```

## 常用命令

```bash
pnpm dev:cli              # ts-node 开发模式
pnpm build:cli            # 构建发布包
pnpm cli --help           # 查看子命令
pnpm --filter @prodivix/cli test
```

## 与 Workspace 协议对接

CLI 同步命令使用与编辑器相同的 Workspace API（见 `specs/api/workspace-sync.openapi.yaml`），支持文档级 `PUT` 与 `POST /intents`，并尊重后端 capability 协商。
