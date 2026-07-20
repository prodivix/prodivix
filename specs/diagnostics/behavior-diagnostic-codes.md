# Behavior Diagnostics 编码规范（BHV）

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- 日期：2026-07-20
- Global Phase：G3 Behavior & Verification Closure
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md`
  - `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md`

## 1. 范围

`BHV-xxxx` 覆盖 BehaviorScenario schema、semantic target/reference、Program compile、deterministic runtime/replay 和
recorder 的稳定失败语义。Domain 固定为 `behavior`。

不覆盖：

1. Route/Data/NodeGraph/Animation owner 内部失败，继续使用 `RTE`/`DAT`/`NGR`/`ANI`，并通过 correlation 关联 Scenario step；
2. Plan、adapter、Evidence、retention、Closure，使用 `VER-xxxx`；
3. 单次 G2 Workspace Test host/report，使用 `TST-xxxx`；
4. 普通 progress/debug event，不为每一事件创建诊断。

## 2. 阶段与分段

```ts
type BehaviorDiagnosticStage =
  'validate' | 'resolve' | 'compile' | 'execute' | 'replay' | 'record';
```

| 段位       | 阶段                 | 说明                             |
| ---------- | -------------------- | -------------------------------- |
| `BHV-10xx` | `validate`           | Scenario/schema/budget           |
| `BHV-20xx` | `resolve`            | target/reference/capability      |
| `BHV-30xx` | `compile`            | Program/control/compile          |
| `BHV-40xx` | `execute` / `replay` | step/wait/replay/security        |
| `BHV-50xx` | `record`             | recorder draft/semantic adoption |
| `BHV-90xx` | 任意                 | 未分类的安全兜底                 |

## 3. 已占用码位

### `BHV-1001` BehaviorScenario 无效

- Severity: `error`
- Stage: `validate`
- Retryable: false
- Trigger: Scenario 缺失必需字段、kind 未知、id 重复、composition 循环、步骤不可达或超过结构预算
- User action: 打开 Scenario Issues，修复标记的步骤、引用或结构
- Developer notes: meta 只放 scenario/step id、schema path、limit 和 safe kind，不复制输入值

### `BHV-2001` 行为目标无法唯一解析

- Severity: `error`
- Stage: `resolve`
- Retryable: false
- Trigger: semantic target missing、ambiguous、revision/provider snapshot 不匹配，且不能 exact resolve
- User action: 在 target picker 中重新选择或修复已删除目标
- Developer notes: 禁止 fallback 到 CSS/XPath；meta 可放候选 stable ids 和 resolution status

### `BHV-2002` Action 与目标 capability 不兼容

- Severity: `error`
- Stage: `resolve`
- Retryable: false
- Trigger: target 存在，但不支持 action/observation kind、input type、runtime zone 或 required permission
- User action: 选择兼容 action/target，或补齐领域 capability
- Developer notes: 记录 expected/actual capability ids，不记录 runtime handle

### `BHV-3001` BehaviorScenarioProgram 编译失败

- Severity: `error`
- Stage: `compile`
- Retryable: false
- Trigger: subscenario cycle、unsupported instruction、domain lowering、SourceTrace 或 canonical serialization 失败
- User action: 打开 compile details 并定位首个失败步骤
- Developer notes: 不把编译器 exception/源码复制到普通 message；关联 owner diagnostic

### `BHV-3002` 行为程序超出预算

- Severity: `error`
- Stage: `compile`
- Retryable: false
- Trigger: instruction、depth、branch、repeat、timeout、fixture、baseline 或 Program bytes 超出上限
- User action: 拆分 Scenario、降低有界循环或缩小受控 fixture
- Developer notes: meta 只放 limit/actual/category

### `BHV-4001` 行为步骤失败

- Severity: `error`
- Stage: `execute`
- Retryable: false
- Trigger: action 返回 terminal failure，或 declared postcondition 得到明确 false
- User action: 打开 step、domain diagnostic、ReplayRecord 和 SourceTrace
- Developer notes: 保留 step/action/attempt/correlation 和 safe outcome；domain 原因使用原 code

### `BHV-4002` 行为条件等待超时

- Severity: `error`
- Stage: `execute`
- Retryable: false
- Trigger: typed observation/settle/barrier 在 virtual/real safety budget 内未成立
- User action: 检查 condition、pending owner、fixture 和 timeout policy，不用固定 sleep 绕过
- Developer notes: meta 可放 pending owner/kind/count 和 logical time，不放 DOM/raw state

### `BHV-4003` 确定性 replay 发生分歧

- Severity: `error`
- Stage: `replay`
- Retryable: false
- Trigger: 相同 Program/control/fixture/tool identity 下的 schedule、observation 或 effect sequence 首次不一致
- User action: 打开 divergence 位置，检查未受控 random/time/network/async source
- Developer notes: 只保存 expected/actual safe digest/projection 和前置 bounded window

### `BHV-4004` 行为运行请求了禁止的网络或敏感能力

- Severity: `fatal`
- Stage: `execute`
- Retryable: false
- Trigger: required run 发起 live egress、读取 production Secret/credential、越权 storage 或 Workspace write
- User action: 改用受控 fixture/typed gateway，检查 Scenario 与 domain capability
- Developer notes: 立即取消 attempt；meta 不得包含 URL query/header/Secret value

### `BHV-4005` Runtime control 未完整应用

- Severity: `error`
- Stage: `execute`
- Retryable: false
- Trigger: provider 无法应用 required clock/random/network/storage/render/motion control 或 applied digest 不匹配
- User action: 选择支持该 control profile 的 provider，或显式调整 Policy
- Developer notes: unsupported/partial control 不能生成可信 pass

### `BHV-4006` 行为运行状态未能安全清理

- Severity: `fatal`
- Stage: `execute`
- Retryable: true
- Trigger: cancel/terminal 后 storage、service worker、timer、effect、worker 或 auth state residual canary 失败
- User action: 销毁并重建运行环境后重试
- Developer notes: 当前 session 不得复用；记录 residual class/count，不记录 value

### `BHV-5001` Recorder 无法生成可提交的语义步骤

- Severity: `warning`
- Stage: `record`
- Retryable: false
- Trigger: raw event 没有 semantic target、候选歧义、敏感输入或事件预算超限
- User action: 手动选择目标/action，或丢弃该 draft
- Developer notes: raw selector/coordinate/value 不进入 Workspace 或 diagnostic meta

### `BHV-5002` Recorder draft 已因 revision 变化失效

- Severity: `warning`
- Stage: `record`
- Retryable: false
- Trigger: draft 基于的 Workspace/Semantic revision 不再是 current，无法安全生成 Transaction
- User action: 在新 revision 上重新解析并审查后提交
- Developer notes: 不自动 rebase/commit

### `BHV-9001` 未分类的 Behavior 异常

- Severity: `error`
- Stage: runtime-selected
- Retryable: false
- Trigger: 未匹配到稳定语义的内部异常
- User action: 复制 code、request/attempt id 和安全详情后上报
- Developer notes: 只作为兜底；实现时应尽快收敛到具体码位

## 4. Target 与 meta 安全

诊断 target 可以指向 Scenario、step、semantic target、domain source 或 ReplayRecord event。必须携带 exact Workspace/
Scenario revision；旧 revision 以历史只读方式导航。`meta` 禁止 DOM handle、CSS/XPath、cookie、header、Secret、原始
input、完整 runtime value、源码或工具对象。
