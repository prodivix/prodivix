# AI Diagnostics 编码规范（AI）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/implementation/llm-integration-foundation.md`

## 1. 范围

`AI-xxxx` 覆盖 AI Provider、模型发现、Prompt 组装、结构化响应解析、计划生成、Workspace Action dry-run 和 LLM 辅助编辑链路。

不覆盖：

1. AI 返回 command 后应用到 Workspace 失败，使用 `WKS-xxxx`。
2. AI patch 导致 PIR graph 语义错误，使用 `PIR-xxxx`。
3. 后端代理或鉴权错误，使用 `API-xxxx`。

## 2. 阶段

```ts
type AiDiagnosticStage =
  'provider' | 'models' | 'prompt' | 'response' | 'command';
```

## 3. 编码分段

| 段位      | 阶段       | 说明                            |
| --------- | ---------- | ------------------------------- |
| `AI-10xx` | `provider` | Provider 配置、baseURL、API key |
| `AI-20xx` | `models`   | 模型发现、模型能力、模型选择    |
| `AI-30xx` | `prompt`   | Prompt 构建、上下文裁剪         |
| `AI-40xx` | `response` | 响应解析、JSON schema、空响应   |
| `AI-50xx` | `command`  | 计划审阅、command dry-run、应用 |
| `AI-90xx` | `command`  | AI 未知异常                     |

## 4. 已占用码位

### `AI-1001` Provider 配置缺失

- Severity: `warning`
- Stage: `provider`
- Retryable: false
- Trigger: AI 助手需要 provider，但未配置 baseURL、model 或 credential
- User action: 打开 AI 设置并完成 Provider 配置
- Developer notes: Mock provider 可绕过 credential，但仍应声明 provider type

### `AI-1002` Provider 请求失败

- Severity: `error`
- Stage: `provider`
- Retryable: true
- Trigger: 调用 OpenAI-compatible Provider 失败
- User action: 检查网络、baseURL、API key 和服务状态
- Developer notes: 不在 UI 中暴露完整 Authorization header 或 secret

### `AI-1010` Provider baseURL 非法

- Severity: `error`
- Stage: `provider`
- Retryable: false
- Trigger: 配置了 API key，但 baseURL 不是合法绝对 URL，或既非 `https:` 也非回环地址
- User action: 改用 `https://` 的 baseURL，或使用 `http://localhost` 等本机地址
- Developer notes: 凭据只能通过 TLS 或回环传输；无 API key 时不限制协议

### `AI-2001` 模型发现失败

- Severity: `warning`
- Stage: `models`
- Retryable: true
- Trigger: `{baseURL}/models` 请求失败或返回无法解析
- User action: 手动填写模型名，或检查 Provider 是否支持模型列表接口
- Developer notes: 模型发现失败不应阻断手动配置

### `AI-2002` 模型能力不满足当前任务

- Severity: `warning`
- Stage: `models`
- Retryable: false
- Trigger: 当前模型不支持结构化输出、足够上下文或所需模态能力
- User action: 切换到支持该能力的模型
- Developer notes: capability 判断应作为计划生成前置诊断

### `AI-3001` Prompt 上下文为空

- Severity: `warning`
- Stage: `prompt`
- Retryable: false
- Trigger: 当前路由、选中节点或 workspace 上下文不足以生成计划
- User action: 先选择要编辑的页面或节点
- Developer notes: Prompt builder 应明确记录缺失的上下文类型

### `AI-4001` 响应为空

- Severity: `error`
- Stage: `response`
- Retryable: true
- Trigger: Provider 返回成功状态但没有可用文本或结构化内容
- User action: 重试请求或切换模型
- Developer notes: 保留原始响应摘要用于调试，不记录敏感 Prompt

### `AI-4002` 响应结构无法解析

- Severity: `error`
- Stage: `response`
- Retryable: true
- Trigger: AI 返回内容无法解析为期望的计划、command 或 JSON schema
- User action: 重试请求，或在调试详情中查看模型原始返回
- Developer notes: Debug hover 可展示原始文本，但需要避免泄露 secret

### `AI-4010` 流式响应中断

- Severity: `error`
- Stage: `response`
- Retryable: true
- Trigger: Provider 流式响应在完成标记前中断，或 SSE chunk 读取失败
- User action: 重试请求，或检查网络和 Provider 服务状态
- Developer notes: 如果是用户主动取消，可在 UI 层降级为 info/warning；不要把半截 delta 当作可应用结果

### `AI-4011` 流式响应结构无法解析

- Severity: `error`
- Stage: `response`
- Retryable: true
- Trigger: Provider 流式响应完成，但累计文本无法解析为期望的结构化输出
- User action: 重试请求，或在调试详情中查看模型原始返回
- Developer notes: 保留 raw response 供调试；最终仍必须经过 structured output validation

### `AI-4012` 流式响应不可读

- Severity: `warning`
- Stage: `response`
- Retryable: true
- Trigger: Provider 声称支持 streaming，但 fetcher 没有返回可读 `ReadableStream`
- User action: 重试请求；如果持续复现，切换到非流式 Provider 或检查运行环境
- Developer notes: Web fetcher 应透传 `response.body`；不应让 UI 组件直接解析 SSE

### `AI-5001` AI Action dry-run 失败

- Severity: `error`
- Stage: `command`
- Retryable: false
- Trigger: AI 生成的 action / command 在应用前 dry-run 失败
- User action: 不应用该计划，重新生成或手动调整
- Developer notes: dry-run 失败应携带下游 `PIR-xxxx` 或 `WKS-xxxx` code

### `AI-5002` AI Action 目标越界

- Severity: `error`
- Stage: `command`
- Retryable: false
- Trigger: AI 输出尝试修改当前 action scope 以外的 route、document、node、resource、settings 或 export target
- User action: 缩小或重新选择 AI 操作目标
- Developer notes: UI trigger 必须携带 target scope；validator 应拒绝模型自造 target id

### `AI-5003` AI Action 编辑字段未授权

- Severity: `error`
- Stage: `command`
- Retryable: false
- Trigger: AI 输出尝试修改 action capability 未允许的字段或 operation
- User action: 使用更具体的 AI 操作，或手动编辑该字段
- Developer notes: capability summary 应列出 allowedOperationTypes 和 editable fields

### `AI-5004` Code-owned 输出未使用 CodeArtifact

- Severity: `error`
- Stage: `command`
- Retryable: false
- Trigger: AI 输出 handler、executor、route loader、mounted CSS、shader 或 adapter 代码，但试图写入组件局部状态或裸字符串字段
- User action: 重新生成，并要求创建代码文件或代码引用
- Developer notes: code-owned 能力必须接入 Code Authoring Environment

### `AI-5005` AI Action 需要的 domain validator 缺失

- Severity: `error`
- Stage: `command`
- Retryable: false
- Trigger: AI action 指向 route、resource、settings、export、NodeGraph 或 Animation 等 domain，但当前环境没有注册对应 dry-run validator
- User action: 暂时手动完成该操作，或切换到已支持的 AI 操作
- Developer notes: 禁止在 validator 缺失时降级为直接 apply

### `AI-5006` AI Apply token 缺失或过期

- Severity: `error`
- Stage: `command`
- Retryable: true
- Trigger: 用户尝试应用 AI patch，但 dry-run 生成的 apply token 不存在、已过期或对应 workspace revision 已变化
- User action: 重新 dry-run 后再应用
- Developer notes: apply token 应绑定 action id、target scope、workspace rev 和 dry-run diff

### `AI-9001` AI 未知异常

- Severity: `error`
- Stage: `command`
- Retryable: true
- Trigger: AI 配置、请求、解析或计划应用中出现未分类异常
- User action: 重试操作；若复现，携带错误码和 provider 类型上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `AI-2010`：模型列表为空。
2. `AI-3010`：Prompt 超出上下文预算。
3. `AI-5010`：用户拒绝 AI 计划后仍尝试应用。
