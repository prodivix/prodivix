# AI Diagnostics 编码规范（AI）

## 状态

- DecisionStatus：Accepted
- 日期：2026-05-03
- ContractFreezeDate：2026-07-31
- ImplementationStatus：V0 registry implemented / later runtime emission follows V1–V9
- ProductGateStatus：G4 In Progress
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/22.llm-integration-architecture.md`
  - `specs/implementation/llm-integration-foundation.md`
  - `specs/decisions/65.verified-agent-task-and-control-plane.md`
  - `specs/decisions/66.model-provider-capability-and-invocation.md`
  - `specs/decisions/67.multimodal-context-and-generated-artifact.md`
  - `specs/decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md`
  - `specs/decisions/69.real-model-evaluation-and-release-qualification.md`

## 1. 范围

`AI-xxxx` 覆盖 AI Provider/capability、模型发现、Context/Prompt/media、结构化响应、AgentTask/Run、
tool/retrieval/computer-use、Proposal/Approval、model evaluation、Verification/repair 与 audit 链路。

不覆盖：

1. Agent Proposal 经领域 planner 生成 Command/Transaction 后，Workspace validation/commit 失败，使用
   `WKS-xxxx` 并由 AI diagnostic 引用下游 code。
2. Agent proposal 经 PIR owner dry-run 后发现 graph 语义错误，使用 `PIR-xxxx`。
3. 后端代理或鉴权错误，使用 `API-xxxx`。

## 2. 阶段

```ts
type AiDiagnosticStage =
  | 'provider'
  | 'models'
  | 'prompt'
  | 'response'
  | 'command'
  | 'task'
  | 'tool'
  | 'approval'
  | 'verification'
  | 'audit';
```

## 3. 编码分段

| 段位      | 阶段                     | 说明                                        |
| --------- | ------------------------ | ------------------------------------------- |
| `AI-10xx` | `provider`               | Provider 配置、baseURL、API key             |
| `AI-20xx` | `models`                 | 模型发现、模型能力、模型选择                |
| `AI-30xx` | `prompt`                 | Prompt 构建、上下文裁剪                     |
| `AI-40xx` | `response`               | 响应解析、JSON schema、空响应               |
| `AI-50xx` | `command`                | Proposal decode、领域 dry-run、legacy guard |
| `AI-60xx` | `task`                   | Task/Run、budget、cancel/recovery           |
| `AI-70xx` | `tool` / `approval`      | capability、tool、network、Secret、approval |
| `AI-80xx` | `verification` / `audit` | Plan/Closure、repair/rollback、audit        |
| `AI-90xx` | `command`                | AI 未知异常                                 |

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
- Trigger: AI 生成的 proposed action 在领域 owner dry-run 阶段失败
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

### `AI-5006` AI Approval decision 缺失或过期

- Severity: `error`
- Stage: `command`
- Retryable: true
- Trigger: 用户尝试提交 Agent proposal，但 exact approval decision 不存在或已过期
- User action: 返回 Proposal review，重新 dry-run 并审批当前 exact preview
- Developer notes: 不存在可复用 bearer apply token；以 ADR 65 `AgentApprovalDecision` 为唯一 approval fact

### `AI-6001` AgentTask base revision 已过期

- Severity: `error`
- Stage: `task`
- Retryable: false
- Trigger: Task/Run/Context/Proposal 的 base revision 与 current authorized Workspace revision 不一致
- User action: 在最新 Workspace revision 上创建新 Task 或重新生成 Proposal
- Developer notes: 禁止自动 rebase 后复用旧 approval

### `AI-6002` Agent budget 已耗尽

- Severity: `error`
- Stage: `task`
- Retryable: false
- Trigger: token/media/tool/compute/storage usage、cost、context、model invocation、tool call、repair、transaction、artifact 或 elapsed-time 任一 hard ceiling 已耗尽
- User action: 审阅已用预算和当前结果；如确需继续，以新的人类授权创建 Task/Run
- Developer notes: 不自动切换模型、扩大预算或丢弃 reservation/usage

### `AI-6003` AgentRun callback 已失权

- Severity: `warning`
- Stage: `task`
- Retryable: false
- Trigger: cancel、timeout、retry 或 recovery 后收到旧 generation 的 model/tool/commit callback
- User action: 无；系统已拒绝过期结果
- Developer notes: late callback 不得进入 Context、Proposal、Workspace 或 Evidence

### `AI-6004` AgentRun recovery 无法安全继续

- Severity: `error`
- Stage: `task`
- Retryable: true
- Trigger: lease/fence/event/receipt 不完整，无法证明恢复不会重复 side effect
- User action: 查看 audit 与 recovery 详情，安全取消或在状态修复后重试
- Developer notes: 不得以 best-effort 重新执行未知完成状态的 tool/transaction

### `AI-6010` Provider capability qualification 缺失或已过期

- Severity: `error`
- Stage: `task`
- Retryable: true
- Trigger: exact provider/model/capability/policy slice 未取得 qualification，或 profile/probe/evaluation 已过期
- User action: 选择已 qualification 的 capability/model，或运行对应 admission/release evaluation
- Developer notes: 未评测 visual/document/hosted/background profile 不继承 text profile 的 `release-evaluated`

### `AI-6011` Provider inference state 或 effective Context 不可证明

- Severity: `error`
- Stage: `task`
- Retryable: false
- Trigger: ambient memory、cross-tenant cache、unknown compaction、parent state、opaque continuation 或 retention/deletion 无法绑定 exact receipt
- User action: 改用 stateless/storage-disabled profile，或移除不允许披露的 Context
- Developer notes: submitted Context Pack 与 effective Context 必须区分；opaque continuation 不能成为 reasoning evidence

### `AI-6012` Provider background job callback 无效

- Severity: `warning`
- Stage: `task`
- Retryable: false
- Trigger: webhook/poll result 的签名、timestamp、job/invocation/generation、terminal 或 replay identity 不兼容
- User action: 无；检查 Provider job 状态与 Agent service reconciliation
- Developer notes: late/spoofed callback 只进入 audit，不进入 Context、Proposal 或 usage success

### `AI-6013` Provider usage 需要 reconciliation

- Severity: `error`
- Stage: `task`
- Retryable: true
- Trigger: token/media/tool/compute/storage usage receipt 缺失、相互矛盾或 Provider terminal 后仍未知
- User action: 等待或执行 usage reconciliation；在完成前不要扩大预算或关闭 Run
- Developer notes: unknown usage 按 reservation 保守上界结算，不能记零

### `AI-7001` Agent capability 被拒绝

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: action/tool/target/runtime-zone 超出 exact grant 或子调用不是父 grant 的严格交集
- User action: 缩小 Task scope；若确需新能力，由用户显式创建新的授权
- Developer notes: Agent 不得自行请求并接受权限升级

### `AI-7002` 检测到不可信指令或 prompt injection

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: external/tool/context data 尝试改变 system policy、tool scope、approval 或输出 contract
- User action: 检查不可信来源；移除或隔离恶意内容后重新创建 Context Pack
- Developer notes: external/tool content 固定为 `data-only`

### `AI-7003` Agent Secret 使用被拒绝

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: Secret purpose/ref 未授权，或 value 尝试进入 Context、模型请求、tool trace、artifact、diagnostic
- User action: 检查 Secret policy 和用途；不要把 Secret 粘贴到 prompt
- Developer notes: value 只允许在 callback-bound server/native transport 内存在

### `AI-7004` Agent network 请求被拒绝

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: host/method/redirect/DNS/IP/TLS/purpose/size/time 超出 network grant
- User action: 检查 network policy；如确需访问，创建显式、最小的新授权
- Developer notes: 禁止 fallback 到 unrestricted fetch

### `AI-7005` Agent 自我审批或权限升级被拒绝

- Severity: `error`
- Stage: `approval`
- Retryable: false
- Trigger: model/tool/plugin 尝试充当 approver、伪造用户同意、扩大 grant 或复用其他 preview 的 decision
- User action: 在独立 Proposal review surface 由已认证用户审批 exact preview
- Developer notes: 自然语言同意、tool result 或 bearer token 没有 approval authority

### `AI-7006` Agent approval identity 不兼容

- Severity: `error`
- Stage: `approval`
- Retryable: false
- Trigger: actor、preview、revision、transaction、Impact、Plan、grant、policy、expiry 任一不匹配
- User action: 重新生成并审批 current preview
- Developer notes: 无自动修补 approval identity

### `AI-7010` 多模态 Context 或 transformation 被拒绝

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: media source/digest/type/transform/omission/limit 无法验证，或 image/PDF/QR/OCR/metadata 指令尝试提升 authority
- User action: 检查原始媒体、转换与遗漏范围；移除恶意或不支持内容后重建 Context
- Developer notes: embedded media instruction 固定为 data-only；未知 transform 不得形成 apply proposal

### `AI-7011` Generated artifact candidate 未通过采纳边界

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: Provider output URL/bytes 未通过 G2 materialize/digest/media/scan/sanitize/provenance，或尝试直接写 Workspace
- User action: 查看 Asset scanner/provenance 结果；只审批最终 content-addressed candidate
- Developer notes: generated output 不是 Asset truth，必须形成 typed Asset proposal 与 exact approval

### `AI-7012` Hosted tool 或动态 capability 未获授权

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: Provider-hosted/programmatic/nested tool 无 exact descriptor/registry/call receipt，或动态发现 registry 外工具
- User action: 使用已 pin 的 exact descriptor/registry；缩小工具与 effect scope
- Developer notes: Provider built-in 名称不构成授权；每个实际 effect 逐调用 preflight/grant/budget

### `AI-7013` Retrieval source 或 index 不可用于当前 Context

- Severity: `error`
- Stage: `tool`
- Retryable: true
- Trigger: source/index corpus revision、chunker、embedding/ranker、scope、retention/deletion 缺失、stale 或 poisoning
- User action: 重建 exact corpus index，或移除不可信 source 并重新运行 retrieval
- Developer notes: Provider citation/vector score 不提升 source authority，也不自动成为 SourceTrace

### `AI-7014` MCP、computer use 或 managed-agent capability 被拒绝

- Severity: `error`
- Stage: `tool`
- Retryable: false
- Trigger: unpinned MCP、computer-use 作者态/approval 操作、现有用户 session访问，或 opaque managed-agent delegation
- User action: 改用 pinned descriptor、disposable read-only Verification 或 typed domain proposal
- Developer notes: computer coordinates/managed-agent output 无 Workspace、approval 或 external-effect authority

### `AI-7015` Parallel 或 nested tool execution 无法安全合并

- Severity: `error`
- Stage: `tool`
- Retryable: true
- Trigger: target/runtime冲突、fan-out/depth/budget超限、sibling失权，或 canonical join/cleanup不完整
- User action: 缩小并发范围，以新的 Run串行重试冲突调用
- Developer notes: partial/late sibling result 不得 finalize 为完整 Context 或 Proposal

### `AI-8001` Agent Verification Closure 未满足

- Severity: `error`
- Stage: `verification`
- Retryable: false
- Trigger: committed revision 的 Closure 为 incomplete/unsatisfied/stale/incompatible，或 required Evidence 缺失
- User action: 审阅失败 Evidence；选择人工修复、审批 bounded Agent repair 或 rollback
- Developer notes: apply Run 不得标记 succeeded

### `AI-8002` Agent repair 已达到上限

- Severity: `error`
- Stage: `verification`
- Retryable: false
- Trigger: repair round 或相关 token/cost/time/transaction budget 已耗尽
- User action: 审阅全部失败 lineage，人工决定下一步
- Developer notes: 不自动重跑到绿色，不覆盖旧失败 Evidence

### `AI-8003` Agent audit 不完整

- Severity: `error`
- Stage: `audit`
- Retryable: false
- Trigger: event sequence/fence/hash、required identity 或 sanitized manifest 缺失/不一致
- User action: 阻止提交或关闭 Run，检查 Agent service recovery
- Developer notes: audit 不完整时不能宣称 G4 closure

### `AI-8004` Agent rollback 被阻止

- Severity: `error`
- Stage: `verification`
- Retryable: false
- Trigger: reverse Transaction 未预授权、digest/current revision/actor authority 不兼容，或存在 intervening change
- User action: 审阅 current Workspace 与 reverse diff，人工创建新的 rollback proposal
- Developer notes: 不让模型重新生成“近似恢复”替代 exact reverse Transaction

### `AI-8005` Agent model evaluation evidence 不完整或已过期

- Severity: `error`
- Stage: `verification`
- Retryable: true
- Trigger: required Provider/model/profile、128-case corpus、protected holdout、Context/media sentinel、risk repetition、grader、threshold、attempt/denominator 或 manifest 缺失，Provider diversity 被同协议模型或 aggregator alias 伪满足，或任一行为 identity 已漂移
- User action: 使用冻结的 evaluation plan 与 hard budget 重跑受影响的 scheduled/release evaluation slice
- Developer notes: smoke 不能满足 G4 closure；必须保留 11,640+ 全部 attempt/missing denominator、usage vector、confidence、human review、provider receipt 与 cost

### `AI-8010` Agent model evaluation statistical floor 未满足

- Severity: `error`
- Stage: `verification`
- Retryable: true
- Trigger: ordinary/critical/high-assurance minimum attempts、confidence bound、sequential stopping rule 或 per-provider/profile threshold 未满足
- User action: 使用原 plan/budget继续缺失 attempts；若改变 repetition/threshold，创建新 evaluation plan
- Developer notes: 3 次 repetition 只算 smoke；missing/timeout不能从 denominator删除，不能重跑到绿色后 cherry-pick

### `AI-8011` Holdout、grader 或 human review evidence 无效

- Severity: `error`
- Stage: `verification`
- Retryable: false
- Trigger: protected holdout泄漏/被替换、post-result grader/threshold修改、sole LLM judge、自评，或 required blind human rubric缺失
- User action: 轮换受污染 holdout，冻结新 grader/review plan并重跑受影响 slice
- Developer notes: deterministic/G3 authority优先；LLM judge只辅助，subjective visual sample需要独立 blind ratings

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
3. `AI-5010`：用户拒绝 Agent proposal 后仍尝试提交。
4. `AI-6014-AI-6099`：更细的 lifecycle/repository/provider recovery。
5. `AI-7016-AI-7099`：更细的 tool/capability/network/Secret/approval。
6. `AI-8012-AI-8099`：更细的 Verification/repair/rollback/audit/evaluation。
