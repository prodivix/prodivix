# @prodivix/vscode

Prodivix 的 VS Code 扩展，通过公开领域 API 提供 PIR 符号、只读结构预览与 NodeGraph 调试适配。

## 目录结构

```text
apps/vscode
├── src/
│   ├── commands/        # 只读 PIR 结构预览
│   ├── language/        # Current PIR codec、typed semantic symbol 与源码位置投影
│   ├── test/            # 插件 API 与打包 DAP 测试
│   └── index.ts         # 扩展激活入口
├── out/                 # 编译输出（tsc）
├── dist/                # 打包输出（esbuild）
├── esbuild.js           # 构建脚本
├── package.json
└── tsconfig.json
```

## 关键能力

- **PIR 符号**：`.pir.json` 由 `@prodivix/pir` current wire codec 解码，再由正式 PIR semantic provider 产生节点、state、param、data 与 Component contract 符号；符号范围指向当前 JSON 源码。无效文档不产生猜测符号。
- **结构预览**：执行 `PIR: Preview PIR` 可查看真实节点层级、literal text、typed bindings 与符号，编辑后按当前 editor revision 刷新。Webview 禁用脚本、网络和本地资源；不执行 CodeSlot、事件或动态 binding。外部 Component contract 需要完整 Workspace host，缺失依赖时阻止预览并报告验证错误。本入口是只读结构检查，不声明视觉 Renderer parity。
- **调试适配**：`packages/vscode-debugger` 使用 NodeGraph 正式 planner、Program executor 与 debug controller。独立 `.nodegraph.json` wire 文档支持启动、节点断点、单步、继续、取消、stack frames 与 bounded outputs。每次执行绑定 document revision、Program digest、job/attempt/generation/lease 和 debug sequence；源文件变化后停止本次会话，要求重新启动。此本地适配器不授予 gateway/CodeSlot 能力，不运行任意 JS/TS。

## 常用命令

```bash
pnpm dev:vscode           # ts watch + esbuild watch
pnpm build:vscode         # 打包 .vsix 准备物料
cd apps/vscode && pnpm lint
pnpm --filter @prodivix/vscode test
pnpm --filter @prodivix/vscode-debugger test
```

## 调试

在 VSCode 中打开本目录，按 F5 即可启动 Extension Development Host。

在 Run and Debug 中使用以下启动配置，`program` 指向由公开 NodeGraph codec 输出的 wire 文件：

```json
{
  "type": "prodivix",
  "request": "launch",
  "name": "Debug NodeGraph",
  "program": "${workspaceFolder}/graph.nodegraph.json",
  "documentRevision": 1,
  "stopOnEntry": true
}
```

`documentRevision` 是本次只读文件投影的显式 revision，文件 bytes digest 同时固定；它不会创建或修改 Canonical Workspace 文档。断点按节点 JSON 对象所在行映射，建议使用格式化 JSON。值由领域控制器按深度、节点数与 UTF-8 大小限制后投影，不支持任意 expression evaluation。

本地 Gate 覆盖 VS Code API 注册/释放、current codec/typed symbols、只读预览刷新、真实 DAP 消息与已打包 stdio adapter。Extension Development Host 的 GUI 人工验收另行执行，本地单元测试不冒充该证据。
