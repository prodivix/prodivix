# LLM Integration Foundation

## 状态

- Draft
- 日期：2026-05-01
- 实现状态：Historical Pre-G4 Foundation / G4 V0 owner hard cut 已实现
- 相关文档：
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/decisions/12.command-transaction-planner.md`
  - `specs/decisions/14.plugin-sandbox-and-capability.md`
  - `specs/decisions/65.verified-agent-task-and-control-plane.md`
  - `specs/decisions/66.model-provider-capability-and-invocation.md`
  - `specs/decisions/67.multimodal-context-and-generated-artifact.md`
  - `specs/decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md`
  - `specs/decisions/69.real-model-evaluation-and-release-qualification.md`

> G4 precedence：本文只说明早期 provider/streaming/runtime foundation。G4 apply-capable 生产路径必须遵守
> ADR 65–69 的 `@prodivix/ai` owner、durable Agent service、Provider capability/multimodal/hosted-tool boundary、
> callback-bound Secret transport、exact human approval、Workspace Transaction、G3 Closure与统计评测；“后端可选”
> 不适用于持有生产 credential 或执行 Workspace commit 的 Run，单一 OpenAI-compatible strategy 也不满足
> G4 Exit。

> V0 hard cut：下文仍出现的 `Llm*`、output channel 与 `packages/shared/src/llm` 只用于解释历史设计，均不是
> 当前可导入 contract。当前代码由 `@prodivix/ai` 唯一拥有 G4 current/wire 与 admission-only `AiDraft*`
> runtime；`@prodivix/shared` 只提供 canonical JSON 与 unsafe-object-key 等跨运行时 primitive。

## 目标

本实现说明记录 Prodivix LLM 基础层的首批代码边界。当前目标不是一次性实现完整 AI 助手，而是先建立多端可复用、轻后端、Local First 的 AI runtime 基础。

Prodivix 的 AI 能力应优先作为前端编辑器和本地工具链能力存在，后端只作为协作、GitHub、社区、企业策略、代理或长任务的可选增强层。

## 当前分层

### `@prodivix/shared`

位置：`packages/shared/src/canonical.ts`、`packages/shared/src/safety.ts`

职责：保存真正跨领域、跨运行时的 canonical JSON 与 object safety primitive。

包含：

- `compareUnicodeCodePoints` / `canonicalJsonText` / `sameCanonicalJson`
- `isUnsafeObjectKey` / `isPlainObject`

约束：

- 不依赖浏览器 API。
- 不依赖 Node API。
- 不依赖 VSCode API。
- 不直接请求模型供应商。
- 不持有用户密钥。
- 不理解具体 app UI 状态。

`@prodivix/shared` 不再描述 AI task、tool、trace 或 provider；这些语义全部由 `@prodivix/ai` 拥有。

### `@prodivix/ai`

位置：`packages/ai`

职责：保存跨端可复用的 AI runtime。

包含：

- G4 transport-neutral current domain、AgentPolicy wire/codec/migration/digest
- admission-only `AiDraftRequest` / `AiDraftPlan` / gateway / context / tool registry
- AI settings 类型
- provider factory
- OpenAI-compatible provider
- bounded draft plan validator

约束：

- 可以依赖 `@prodivix/shared` 的 canonical/safety primitive。
- 不依赖 `apps/web`、`apps/cli`、`apps/vscode` 或 `apps/backend`。
- provider 不直接假设运行环境。
- 需要网络请求时，通过调用方注入 `fetcher`。

`@prodivix/ai` 回答“如何根据配置创建 provider、构造任务、校验输出”，但不负责读取浏览器 localStorage、CLI config、VSCode SecretStorage 或后端数据库。

## 为什么新增 `@prodivix/ai`

Prodivix 不只有 Web 编辑器，还包含 CLI、VSCode 插件、文档、后端和未来 MCP 集成。如果把 AI runtime 放进 `apps/web/src/ai`，会导致 CLI 和 VSCode 复用困难。如果全部塞进 `@prodivix/shared`，又会让 shared 从协议包膨胀成运行时大杂烩。

因此 V0 hard cut 后采用单一领域 owner：

```text
@prodivix/shared
  -> canonical/safety primitives only

@prodivix/ai
  -> G4 current/wire + admission-only draft runtime

apps/*
  -> environment adapters
```

## Provider 策略

早期 foundation 使用 OpenAI-compatible 形状，但不绑定任何单一供应商。该实现只属于 pre-G4 foundation；
G4 baseline 另行要求 OpenAI Responses、Anthropic Messages、Gemini Interactions 原生 adapter，以及
generic OpenAI-compatible compatibility adapter，不能用这一节替代 ADR 66 的多协议/capability conformance或
ADR 69 的 real-model evaluation。

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

- 为 pre-G4 plan-only draft 读取本地 AI 设置；这不授权 production credential transport。
- 把显式选择的编辑器事实转为 data-only `AiDraftContextBundle`。
- 只注册 read / ephemeral-execute draft tools。
- 把 `AiDraftGateway` 的 bounded plan 或 diagnostic 交给 UI 展示。

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

后端不是 admission-only explain/plan draft 的必经路径。任何持有 production credential、运行 durable Agent
Task/Run、执行 hosted capability 或协调 Workspace commit 的 G4 路径都必须经过 ADR 65–69 的 Backend service
boundary。历史 foundation 曾建议后端承载：

- GitHub App workflow。
- 团队/企业密钥托管。
- trace / eval 持久化。
- 长任务队列。
- 安全审计。
- provider proxy。

Web / CLI / VSCode 可以在没有后端代理时使用 explain/plan draft；不得把这种 Local First 能力升级解释成
production apply authority。

## 历史 foundation 与 ADR 22 的对应关系

当前基础层覆盖 ADR 22 的以下方向：

- LLM 输出暂时分为 PIR commands、Node Graph operations、Code artifacts。
- 内部存在统一 Gateway。
- Context Builder 支持最小上下文构造。
- Tool Registry 支持 Prodivix 语义工具注册。
- Trace Store 有最小接口。
- Provider 与模型供应商解耦。

需要注意：三类 `LlmOutputChannel` 已随 V0 hard cut 删除，不是当前 foundation 或长期产品边界。G4 proposal
只能在 V5 由 `@prodivix/ai` current contract 与各领域 owner 的 strict decoder/dry-run 实现；不得先在 Web
定义私有 action envelope，也不得把任何 AI action contract 放回 `@prodivix/shared`。

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

1. 保持 `@prodivix/shared` 只承载 canonical/safety primitive。
2. 按 G4 V1–V9 在 `@prodivix/ai` 与 Backend service owner 中实现能力，不散落到 app。
3. draft gateway 继续只服务 explain/plan，并用 deterministic provider 覆盖低风险入口。
4. native Provider、Context/Policy 与 invocation 按 V1 实现；generic OpenAI-compatible 不能替代 native matrix。
5. Workspace 写操作只经 V5 Proposal → domain dry-run → exact approval → Transaction 链。
6. 测试优先覆盖稳定 contract、安全边界和 fail-closed negative，不锁死 provider 私有 payload。
