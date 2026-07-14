# LLM Integration Foundation

## 状态

- Draft
- 日期：2026-05-01
- 相关文档：
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/decisions/12.command-transaction-planner.md`
  - `specs/decisions/14.plugin-sandbox-and-capability.md`

## 目标

本实现说明记录 Prodivix LLM 基础层的首批代码边界。当前目标不是一次性实现完整 AI 助手，而是先建立多端可复用、轻后端、Local First 的 AI runtime 基础。

Prodivix 的 AI 能力应优先作为前端编辑器和本地工具链能力存在，后端只作为协作、GitHub、社区、企业策略、代理或长任务的可选增强层。

## 当前分层

### `@prodivix/shared`

位置：`packages/shared/src/llm`

职责：保存所有端都必须共同理解的协议内核。

包含：

- LLM task / result 类型
- output channel 类型
- diagnostics 类型
- context bundle 类型
- plan / PIR command batch / node graph operation batch / code artifact 类型
- tool registry
- context builder
- gateway skeleton
- trace store 接口
- mock provider

约束：

- 不依赖浏览器 API。
- 不依赖 Node API。
- 不依赖 VSCode API。
- 不直接请求模型供应商。
- 不持有用户密钥。
- 不理解具体 app UI 状态。

`@prodivix/shared` 的边界应保持很薄。它回答“LLM 任务在 Prodivix 中如何被描述和约束”，不回答“某个环境如何调用模型”。

### `@prodivix/ai`

位置：`packages/ai`

职责：保存跨端可复用的 AI runtime。

包含：

- AI settings 类型
- provider factory
- OpenAI-compatible provider
- task factory
- structured output validator

约束：

- 可以依赖 `@prodivix/shared`。
- 不依赖 `apps/web`、`apps/cli`、`apps/vscode` 或 `apps/backend`。
- provider 不直接假设运行环境。
- 需要网络请求时，通过调用方注入 `fetcher`。

`@prodivix/ai` 回答“如何根据配置创建 provider、构造任务、校验输出”，但不负责读取浏览器 localStorage、CLI config、VSCode SecretStorage 或后端数据库。

## 为什么新增 `@prodivix/ai`

Prodivix 不只有 Web 编辑器，还包含 CLI、VSCode 插件、文档、后端和未来 MCP 集成。如果把 AI runtime 放进 `apps/web/src/ai`，会导致 CLI 和 VSCode 复用困难。如果全部塞进 `@prodivix/shared`，又会让 shared 从协议包膨胀成运行时大杂烩。

因此采用两层：

```text
@prodivix/shared
  -> LLM protocol kernel

@prodivix/ai
  -> reusable AI runtime

apps/*
  -> environment adapters
```

## Provider 策略

首批 provider 使用 OpenAI-compatible 形状，但不绑定任何单一供应商。

```text
baseURL + apiKey + model + fetcher
```

这样可兼容：

- OpenAI
- DeepSeek
- OpenRouter
- 通义 / 智谱 / 火山等兼容服务
- LM Studio
- Ollama 兼容端点
- 自托管代理

`@prodivix/ai` 中的 provider 不直接使用全局 `fetch`。各 app 应注入自己的 `fetcher`：

- Web：注入 `window.fetch` 包装。
- CLI：注入 Node runtime fetch。
- VSCode：注入 extension host 可用的 fetch 或 adapter。
- Backend：注入 Go/HTTP 层对应的 TypeScript 调用方，或另行实现同协议 provider。

## App 层适配

### Web

建议位置：

```text
apps/web/src/ai/
  settings/
  runtime/
  storage/

apps/web/src/editor/ai/
  editorContextBuilder.ts
  editorTools.ts
  editorAssistant.ts
```

Web 层负责：

- 读取用户本地 AI 设置。
- 保存 API key 或 endpoint 设置。
- 把编辑器状态转为 `LlmContextBundle`。
- 注册编辑器语义 tools。
- 把 Gateway 结果交给 UI 展示。

Web 不应把 AI provider 逻辑写死在 BlueprintEditor 组件里。

### CLI

建议位置：

```text
apps/cli/src/ai/
```

CLI 层负责：

- 读取本地配置文件或环境变量。
- 运行 `prodivix ai plan`、`prodivix ai explain` 等开发命令。
- 输出 plan、diagnostics、trace 摘要。

CLI 可作为早期验证跨端 runtime 的低风险入口。

### VSCode

建议位置：

```text
apps/vscode/src/ai/
```

VSCode 层负责：

- 使用 VSCode SecretStorage 保存密钥。
- 把打开的 PIR 文件、选区、diagnostics 转为上下文。
- 暴露 command palette 命令。

### Backend

后端不是 AI 的必经路径。它适合承载：

- GitHub App workflow。
- 团队/企业密钥托管。
- trace / eval 持久化。
- 长任务队列。
- 安全审计。
- provider proxy。

对于 Local First 的个人开发路径，Web / CLI / VSCode 应能在没有后端代理的情况下使用 AI。

## 与 ADR 22 的对应关系

当前基础层覆盖 ADR 22 的以下方向：

- LLM 输出暂时分为 PIR commands、Node Graph operations、Code artifacts。
- 内部存在统一 Gateway。
- Context Builder 支持最小上下文构造。
- Tool Registry 支持 Prodivix 语义工具注册。
- Trace Store 有最小接口。
- Provider 与模型供应商解耦。

需要注意：三类 `LlmOutputChannel` 是当前 foundation 的临时最小集合，不是长期产品边界。ADR 22 已将目标模型提升为 target-scoped Workspace Action Proposal。后续实现应在 Web editor AI runtime 中先增加 action target / operation validator，再决定是否把 `workspace-action`、`route-intent`、`resource-operation`、`settings-patch`、`export-action` 等能力提升到 `@prodivix/shared` 协议层。

尚未实现：

- 完整 dry-run / apply 工具。
- PIR command validator。
- Node Graph operation validator。
- Workspace action validator。
- Route intent / resource / settings / export action dry-run。
- repair loop。
- eval/replay 存储。
- MCP Server。
- Web UI。

## 后续建议

1. 保持 `@prodivix/shared` 只承载协议内核。
2. 在 `@prodivix/ai` 中逐步补 runtime 能力，而不是直接散落到 app。
3. 先用 mock provider 打通 Web / CLI 入口。
4. 再接 OpenAI-compatible provider。
5. 等 BlueprintEditor 重构稳定后，再接编辑器上下文和 UI。
6. 将 AI 写操作收敛到 Workspace Action Proposal，避免只围绕 Blueprint/PIR command 继续扩张。
7. 写测试时避免过早锁死 provider 输出细节，优先覆盖稳定协议和安全边界。
