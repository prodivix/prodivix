# @prodivix/vscode

Prodivix 的 VSCode 扩展，提供 PIR 语言服务、PIR 预览与调试适配。

## 目录结构

```text
apps/vscode
├── src/
│   ├── commands/        # 命令实现（含 PIR 预览 / 验证）
│   ├── language/        # PIR 语言特性（语法高亮、JSON Schema、悬浮提示）
│   ├── debugger/        # 调试器接入（依赖 @prodivix/vscode-debugger）
│   ├── test/            # 插件测试
│   ├── extension.ts     # 扩展入口
│   └── index.ts         # 调试适配入口
├── out/                 # 编译输出（tsc）
├── dist/                # 打包输出（esbuild）
├── esbuild.js           # 构建脚本
├── package.json
└── tsconfig.json
```

## 关键能力

- **PIR JSON Schema 校验**：基于 `specs/pir/PIR-v1.3.json`（最新稳定版，向下读兼容 v1.0~v1.2）。
- **预览命令**：在编辑器内通过 webview 渲染 PIR 文档。
- **调试适配**：DAP 实现位于 `packages/vscode-debugger`，本扩展负责注册与生命周期。

## 常用命令

```bash
pnpm dev:vscode           # ts watch + esbuild watch
pnpm build:vscode         # 打包 .vsix 准备物料
cd apps/vscode && pnpm lint
```

## 调试

在 VSCode 中打开本目录，按 F5 即可启动 Extension Development Host。
