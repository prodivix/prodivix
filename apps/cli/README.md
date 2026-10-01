# @prodivix/cli

Prodivix CLI 消费 current Canonical Workspace、Verification 和 Agent 公开 contract。
`build` 与 `export` 通过生产 compiler 输出完整 React/Vite 或 Vue/Vite 项目；`verify`
连接 G3 Verification 服务；`agent` 提供 durable Task/Run、exact approval、控制命令和 audit。
产品阶段以 `specs/roadmap/current-status.md` 为准。真实模型资格仍由 G4 evidence 单独记录。

## 构建与运行

```bash
pnpm build:cli
node apps/cli/bin/prodivix.js --help
pnpm --filter @prodivix/cli test
pnpm --filter @prodivix/cli lint
```

构建会生成 `dist/cli.js`。开发时可使用 `pnpm --filter @prodivix/cli dev -- --help`。

## 导出和生产构建

输入是 `@prodivix/workspace` 的 `encodeWorkspaceSnapshot` wire JSON；CLI 使用对应 strict codec 解码。
输出必须是新目录或空目录，已有文件不会被覆盖。compiler 的 error diagnostics 会阻止输出。

```bash
prodivix export --input workspace.json --output ./generated-react --target react-vite
prodivix export --input workspace.json --output ./generated-vue --target vue-vite
prodivix build --input workspace.json --output ./production --target react-vite
```

`export` 原子地写入 compiler projection 和 `prodivix-export.json` receipt，记录 source digest、
exact partition revisions、target 和文件清单。输入 Workspace 保持只读。引用但尚未 materialize 的
binary asset 会由 compiler fail closed；带远端 binary assets 的项目可使用 Web 导出表面完成授权 materialization。

`build` 先导出，然后通过 Corepack 使用生成项目声明的 exact pnpm，执行 `install --ignore-scripts`
和生产 build，确认 `dist/index.html`。依赖安装需要网络；构建失败返回非零 exit code。

## 发布

```bash
prodivix deploy --base-url https://editor.example.com --project project-id
```

`deploy` 显式发布服务器当前已确认的项目投影到 Prodivix Community，复用 Backend publication owner。
发布响应是项目元数据；独立站点需将 `build` 的 `dist` 交给实际 hosting 平台。
该命令从 `PRODIVIX_ACCESS_TOKEN` 取得访问凭据。CLI 不把 publication receipt 描述为 hosting URL，也不维护第二套 Workspace 作者态。

## Verification 与 Agent

```bash
prodivix verify --help
prodivix agent --help
```

两个命令使用同一认证 transport：HTTPS 或本地 loopback HTTP、禁止 redirect、30 秒 deadline、8 MiB
response budget，并保留调用方 cancellation。访问 token 仅从指定环境变量取得，不进入命令输出或 receipt。
Agent apply 必须消费 exact human approval；没有跳过审批选项。服务端普通 worker 必须处于运行状态，
且 exact native provider、policy、grant 与 qualification 可用，才能推进 Task；缺少 qualification 时保持 blocked。

`agent create` 在同一个动作中先请求服务端 Task admission，最多等待 60 秒并支持 Ctrl+C 取消。
CLI 使用 AI owner 校验 admission 的 challenge identity、Task 不可变字段、effective policy、grant 和 canonical 摘要，
只允许服务器替换初始 grant 引用。通过后才提交获准 Task、admission identity 和 digest；blocked 会返回诊断码，
格式或摘要不匹配会停止创建。该动作不授予 proposal 的人工审批。

`agent repair --base-url https://editor.example.com --project project-id --workspace workspace-id --run run-id --actor user-id`
读取已经失败的原任务和保留的正向 Verification Closure，再请求一个派生修复任务。服务器从父任务扣除已消耗的调用、
事务、产物、时间和费用预算，并只允许委托给一个子任务。相同失败的重试复用同一请求 identity，不重置预算。
CLI 继续通过普通 admission 和 Task 创建链路；修复产生新 proposal，必须重新使用 `agent approve` 作出精确人工审批。
Ctrl+C 会取消请求和轮询，不授予回滚或重放已完成事务的权限。

所有作者态写入只允许领域 Command / 原子 Transaction 经 Durable Outbox 进入 Atomic WorkspaceOperation Commit。
导出、构建、audit 和 Verification 输出都是 revision-bound projection 或运行态证据。
