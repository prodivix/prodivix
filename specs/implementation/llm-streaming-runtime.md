# LLM Streaming Runtime

## 状态

- Draft
- 日期：2026-06-06
- 相关文档：
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/implementation/llm-integration-foundation.md`
  - `specs/diagnostics/ai-diagnostic-codes.md`

## 目标

本文档定义 Prodivix AI 助手的流式响应实现边界。流式能力用于提升用户感知速度、展示生成过程、记录更细粒度 trace，并为后续 repair loop 和长任务反馈提供基础。

流式响应不改变 ADR 22 中的核心约束：

- LLM 输出仍必须收口到 PIR commands、Node Graph operations 或 Code artifacts。
- 任何可写入状态仍必须经过结构化校验、dry-run、风险判断和 trace 记录。
- 流式 delta 是未验证的中间文本，不能直接写入 PIR、节点图、Workspace VFS 或 Code Authoring Environment。

## 非目标

1. 不在本阶段实现完整 agent workflow。
2. 不在流式过程中增量应用 PIR command。
3. 不要求所有 provider 都支持 streaming。
4. 不把 OpenAI-compatible SSE 形状泄漏到 `apps/web` 组件层。
5. 不让 UI 组件直接解析 provider 事件格式。

## 当前问题

当前代码已经预留 `LlmTaskRequest.streaming?: boolean`，但调用链仍是非流式：

```text
BlueprintAssistantPanel
  -> LlmGateway.run(task)
    -> provider.generate(request)
      -> fetch JSON response
      -> parse structured output
      -> validate output
```

当前限制：

- `LlmProviderCapabilities.supportsStreaming` 对 OpenAI-compatible provider 为 `false`。
- `ProdivixAiFetch` 只要求 `json()`，没有暴露 `ReadableStream`。
- `LlmProvider` 只有 `generate()`，没有流式事件协议。
- `LlmGateway` 只有一次性 `run()`。
- Blueprint AI UI 只能在完整响应返回后展示 plan 或 raw response。

## 设计原则

### 1. Streaming 是传输层能力

流式 delta 只代表模型正在输出文本，不代表输出已经符合 MFE 协议。系统必须等完整响应结束后再解析 JSON、校验通道、写 trace 并返回最终 `LlmTaskResult`。

```text
SSE delta
  -> raw text buffer
  -> stream preview
  -> completed response
  -> structured parse
  -> output validation
  -> gateway result
  -> dry-run or plan review
```

### 2. Gateway 仍是唯一 AI 执行入口

业务 UI 不应直接调用 provider streaming API。所有流式任务必须经过 `LlmGateway.stream(task)`，使 provider、tool registry、trace store、diagnostics 和 fallback 策略保持统一。

### 3. Provider streaming 是可选能力

`LlmProvider.stream` 应是 optional。Gateway 遇到不支持 streaming 的 provider 时，必须 fallback 到 `run()`，这样 mock provider、测试 provider、未来不支持 SSE 的 provider 都能继续工作。

### 4. 最终结果必须与非流式一致

同一个 task 在同一个 provider 下，无论通过 `run()` 还是 `stream()`，最终完成事件中的 `LlmTaskResult` 应满足同一套 output channel、diagnostic 和 trace 语义。

## 协议层改造

位置：`packages/shared/src/llm/types.ts`

新增流式事件类型：

```ts
export type LlmStreamEvent =
  | {
      type: 'started';
      taskId: string;
      traceId: string;
      providerId: string;
    }
  | {
      type: 'raw-delta';
      delta: string;
    }
  | {
      type: 'raw-snapshot';
      rawResponse: string;
    }
  | {
      type: 'diagnostic';
      diagnostic: LlmDiagnostic;
    }
  | {
      type: 'validated-output';
      output: LlmStructuredOutput;
      rawResponse: string;
    }
  | {
      type: 'completed';
      result: LlmTaskResult;
    };
```

事件含义：

| Event              | 含义                      | 可用于 UI | 可用于状态写入         |
| ------------------ | ------------------------- | --------- | ---------------------- |
| `started`          | Gateway 已创建 task trace | 是        | 否                     |
| `raw-delta`        | Provider 返回的文本增量   | 是        | 否                     |
| `raw-snapshot`     | 当前累计原始文本          | 是        | 否                     |
| `diagnostic`       | 流程中出现可展示诊断      | 是        | 否                     |
| `validated-output` | 完整响应已经解析并校验    | 是        | 仍需 dry-run           |
| `completed`        | 任务结束，含最终 result   | 是        | 仍需按 result 类型处理 |

扩展 provider 接口：

```ts
export interface LlmProvider {
  id: string;
  capabilities?: LlmProviderCapabilities;
  generate(request: LlmProviderRequest): Promise<LlmProviderGenerateResult>;
  stream?(request: LlmProviderRequest): AsyncIterable<LlmStreamEvent>;
}
```

约束：

- `stream()` 不应绕过 `generate()` 的结构化输出规则。
- provider 可以自行解析完整响应，也可以只产出 `raw-delta`，由 Gateway 完成最终 parse。早期实现建议 provider 负责 OpenAI-compatible SSE 解码，Gateway 负责最终通道校验和 trace。
- `LlmTaskRequest.streaming` 表示调用方偏好，不保证 provider 一定流式返回。

## Fetcher 改造

位置：`packages/ai/src/providers/openAICompatibleProvider.ts`

当前 fetcher 形状只支持 JSON：

```ts
export type ProdivixAiFetch = (...) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}>;
```

需要扩展为：

```ts
export type ProdivixAiFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  body?: ReadableStream<Uint8Array> | null;
};

export type ProdivixAiFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<ProdivixAiFetchResponse>;
```

Web 适配层应把 `window.fetch` 的 `response.body` 原样透传给 `@prodivix/ai`。如果运行环境没有 `ReadableStream`，provider 应返回 `AI-4012` 或 fallback 到非流式。

## OpenAI-compatible SSE 解析

位置：`packages/ai/src/providers/openAICompatibleProvider.ts`

流式请求体增加：

```json
{
  "stream": true
}
```

OpenAI-compatible SSE 的典型格式：

```text
data: {"choices":[{"delta":{"content":"{"}}]}
data: {"choices":[{"delta":{"content":"\"goal\""}}]}
data: [DONE]
```

解析规则：

1. 使用 `TextDecoder` 增量解码 `ReadableStream<Uint8Array>`。
2. 按 SSE frame 分割，优先使用空行 `\n\n` 作为 frame 边界。
3. 只处理 `data:` 行。
4. 遇到 `[DONE]` 结束。
5. 从 `choices[0].delta.content` 读取文本增量。
6. 累计所有 delta 为 `rawResponse`。
7. 请求结束后对完整 `rawResponse` 执行 JSON fence strip、JSON parse 和结构化校验。

Provider 内部建议拆分小函数：

```text
readOpenAICompatibleSse(response.body)
extractDeltaContent(frame)
parseCompletedStructuredOutput(rawResponse)
```

这样 provider 测试可以覆盖：

- 单个 chunk 包含多个 SSE frame。
- 一个 SSE frame 被拆成多个 chunk。
- `[DONE]` 后忽略后续空白。
- delta 中没有 content。
- 响应提前关闭导致 JSON 不完整。

## Gateway 改造

位置：`packages/shared/src/llm/gateway.ts`

新增：

```ts
stream(task: LlmTaskRequest): AsyncIterable<LlmStreamEvent>
```

推荐流程：

```text
create trace
pick allowed tools
yield started

if provider.stream is unavailable:
  result = await run(task)
  yield completed(result)
  return

try:
  for await event of provider.stream({ task, tools }):
    forward raw-delta/raw-snapshot/diagnostic
    capture validated-output if provided

  validate final output channel
  append trace
  yield validated-output
  yield completed(result)
catch error:
  append failed trace
  yield diagnostic
  yield completed(failed result)
```

实现注意：

- `run()` 和 `stream()` 应复用 output channel 校验逻辑，避免两个路径行为分叉。
- trace 至少记录最终 `rawResponse` 摘要、provider id、diagnostics、startedAt、completedAt。
- 早期 trace 不需要记录每个 token，但可以保留事件计数、首 token 时间、完成时间，供后续 eval 使用。

## UI 改造

首个接入点：`apps/web/src/editor/features/design/blueprint/editor/components/Assistant/BlueprintAssistantPanel.tsx`

当前按钮点击后一次性等待：

```ts
const result = await gateway.run(task);
```

流式版本：

```ts
for await (const event of gateway.stream(task)) {
  if (event.type === 'raw-delta') {
    setRawResponse((value) => value + event.delta);
  }

  if (event.type === 'validated-output') {
    setPlanIfPlanArtifact(event.output);
  }

  if (event.type === 'completed') {
    setTraceId(event.result.traceId);
    setIsRunning(false);
  }
}
```

UI 行为建议：

- 请求开始后立即进入 running 状态。
- `raw-delta` 到达后展示 raw response debug preview。
- plan 区域只在 `validated-output` 后展示，避免展示半截 JSON。
- 如果 provider 不支持 streaming，UI 行为退化为当前非流式体验。
- 增加取消按钮时，使用 `AbortController`，不要只靠隐藏面板中断状态。

## Abort 与并发

流式任务需要明确取消语义：

- 每次点击生成创建新的 `AbortController`。
- 用户取消、关闭面板或再次提交时 abort 上一个任务。
- 被 abort 的任务应返回 retryable diagnostic，而不是留下永久 running 状态。
- UI 层必须用 task id 或本地 request id 防止旧任务晚到事件覆盖新任务。

建议诊断：

```text
AI-4010 Streaming response interrupted
```

当中断来自用户主动取消时，severity 可以是 `info` 或 `warning`。当中断来自网络或 provider 时，severity 应为 `error`。

## Diagnostics 扩展

位置：`specs/diagnostics/ai-diagnostic-codes.md`

建议新增：

| Code      | Stage      | Severity  | Retryable | Trigger                                    |
| --------- | ---------- | --------- | --------- | ------------------------------------------ |
| `AI-4010` | `response` | `error`   | true      | 流式响应在 `[DONE]` 前中断                 |
| `AI-4011` | `response` | `error`   | true      | 流式响应完成但累计文本无法解析             |
| `AI-4012` | `response` | `warning` | true      | 当前 provider 或 fetcher 未提供可读 stream |

与既有码位关系：

- 非流式解析失败继续使用 `AI-4002`。
- 流式完成后的结构化解析失败使用 `AI-4011`，并可附带 `AI-4002` 的 repair hint。
- provider HTTP 请求失败继续使用 `AI-1002`。

## 测试策略

### `@prodivix/shared`

覆盖：

- `LlmGateway.stream()` 在 provider 不支持 stream 时 fallback 到 `run()`。
- `LlmGateway.stream()` 转发 raw delta。
- 完成后仍校验 output channel。
- provider 抛错时写入 failed result 和 diagnostic。

测试不应依赖 DOM 或具体 UI 结构。

### `@prodivix/ai`

覆盖：

- OpenAI-compatible SSE chunk 解码。
- split frame 和 multi-frame chunk。
- `[DONE]` 结束。
- JSON fence strip。
- 空 delta。
- stream body 缺失。
- JSON 不完整。

### `apps/web`

优先测试用户可感知行为：

- 点击生成后进入 loading。
- 有 raw delta 时显示 raw response 调试内容。
- 只有 validated output 后显示 plan。
- 取消后 loading 结束且旧任务不覆盖新任务。

避免测试：

- DOM 层级。
- 内部 class。
- `querySelector`。
- 具体标签结构。
- snapshot。

## 分阶段落地

### Phase 1: 协议与 Gateway 骨架

- 新增 `LlmStreamEvent`。
- 新增可选 `LlmProvider.stream()`。
- 新增 `LlmGateway.stream()` fallback 实现。
- Mock provider 保持非流式即可。
- 添加 shared 单元测试。

验收：

- 非流式现有调用不破坏。
- 不支持 streaming 的 provider 可以通过 `gateway.stream()` 得到 completed event。

### Phase 2: OpenAI-compatible provider streaming

- 扩展 `ProdivixAiFetchResponse.body`。
- 为 OpenAI-compatible provider 增加 `stream()`。
- `supportsStreaming` 改为 `true`。
- 添加 SSE parser 单元测试。

验收：

- 可读取 OpenAI-compatible SSE delta。
- 完整响应仍通过 `validateStructuredOutput`。
- JSON 不完整时返回稳定 diagnostic。

### Phase 3: Blueprint Assistant UI 接入

- Web fetcher 透传 `response.body`。
- Blueprint assistant 改用 `gateway.stream(task)`。
- raw response debug preview 支持增量展示。
- plan 仍只在 validated output 后展示。
- 增加取消和旧任务保护。

验收：

- 支持流式 provider 时能看到 raw response 增量。
- 使用 mock provider 时体验不退化。
- 取消任务后 UI 不停留在 running。

### Phase 4: Trace 与 Eval 增强

- trace 记录 streaming metadata。
- 增加 firstDeltaAt、deltaCount、completedAt。
- 为后续 replay 保存 raw response 摘要。

验收：

- 可比较首 token 延迟和总耗时。
- failed streaming task 有可定位 diagnostic。

## 文件改动清单

建议按以下顺序改动：

1. `packages/shared/src/llm/types.ts`
2. `packages/shared/src/llm/gateway.ts`
3. `packages/ai/src/providers/openAICompatibleProvider.ts`
4. `packages/ai/src/providers/createProvider.ts`
5. `apps/web/src/editor/features/design/blueprint/editor/components/Assistant/BlueprintAssistantPanel.tsx`
6. `specs/diagnostics/ai-diagnostic-codes.md`

如后续抽离 Web AI runtime，可再移动到：

```text
apps/web/src/ai/runtime/
apps/web/src/editor/ai/
```

这与 `llm-integration-foundation.md` 中的 app 层建议一致。

## 验收标准

- [ ] Provider 能声明是否支持 streaming。
- [ ] Gateway 暴露统一 `stream()` 入口。
- [ ] 不支持 streaming 的 provider 能 fallback 到非流式。
- [ ] OpenAI-compatible provider 能解析 SSE。
- [ ] 流式 delta 不会直接写入 PIR、节点图或 Workspace。
- [ ] 完整响应仍经过 structured output validation。
- [ ] 结构化输出通道仍受 task `outputChannels` 限制。
- [ ] Blueprint AI UI 能展示 raw response 增量。
- [ ] Plan 只在完整校验后展示。
- [ ] Abort 不会导致 UI 永久 running。
- [ ] streaming 失败有稳定 AI diagnostic code。
