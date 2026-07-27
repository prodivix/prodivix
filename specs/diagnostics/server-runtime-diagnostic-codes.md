# Auth / Server Runtime Diagnostic Codes

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Remote Auth/Test/Isolated + Live Mutation Safety + Audited Secret HMAC + Route/Auth Configuration Authoring Issues Implemented；A13 Source Mutation Configured / Evidence pending
- ProductGateStatus：G2 In Progress
- 日期：2026-07-18
- Owner：`@prodivix/server-runtime`、Compiler、Backend gateway

诊断与错误不得携带 input/output value、principal raw identity、session id、token、cookie、Secret 或源码。

## 1. 运行时码位

### `SVR-1001` Server Function 调用请求形状非法

- Severity: `error`
- Domain: `backend`
- Stage: `request decode`
- Retryable: false
- Trigger: invocation/bridge 的形状、identity 或 body size 非法
- User action: 重新发起调用；若持续失败，检查该 Server Function 的绑定与参数后重试
- Developer notes: 解码在业务执行前完成，失败不进入 handler；meta 只保留 function 与 route identity

### `SVR-2001` Server Function 输入不符合 canonical JSON Schema

- Severity: `error`
- Domain: `backend`
- Stage: `input preflight`
- Retryable: false
- Trigger: 调用输入不符合 canonical JSON Schema
- User action: 按 Server Function 的输入契约修正参数后重试
- Developer notes: 不得回显 input value，只保留 schema path 与稳定校验原因

### `SVR-3001` live mutation 缺少允许的 Origin 或 mutation intent

- Severity: `error`
- Domain: `backend`
- Stage: `mutation request guard`
- Retryable: false
- Trigger: live mutation 请求缺少 exact allowed Origin 或显式 mutation intent
- User action: 从受支持的运行入口重新发起该操作
- Developer notes: 跨站与非显式 intent 一律 fail closed，不得按 referer 猜测来源

### `SVR-3002` mutation invocation identity 与 durable ledger 冲突

- Severity: `error`
- Domain: `backend`
- Stage: `mutation replay`
- Retryable: false
- Trigger: invocation 的 origin、snapshot、function 或 input identity 与 durable ledger 记录冲突
- User action: 重新发起一次新的操作，不要重复提交同一次 mutation
- Developer notes: replay fence 以 invocation key 为准，冲突不得改写既有 ledger 记录

### `SVR-3003` mutation 有界容量耗尽

- Severity: `error`
- Domain: `backend`
- Stage: `mutation budget`
- Retryable: false
- Trigger: 一次 execution 的 state 或 replay 有界容量耗尽
- User action: 重新开始一次执行；若反复出现，减少单次执行中的 mutation 数量
- Developer notes: 预算耗尽必须终止本次执行，不得扩容后继续写入

### `SVR-4004` Server Function 目标不可见

- Severity: `error`
- Domain: `backend`
- Stage: `authorization/resolution`
- Retryable: false
- Trigger: execution、session、revision、function 或 permission 对当前身份不可见
- User action: 确认已登录且拥有该项目权限后重试
- Developer notes: 不存在与无权限统一为 not-found 边界防枚举，不得区分回显

### `SVR-5001` 已鉴权的 Server Function gateway 不可用

- Severity: `error`
- Domain: `backend`
- Stage: `gateway`
- Retryable: true
- Trigger: authenticated Server Function gateway 暂时不可用
- User action: 稍后重试
- Developer notes: 客户端只看到固定 transport 失败原因，不得回显 gateway 内部状态

### `SVR-5002` Server Function 输出不符合边界契约

- Severity: `error`
- Domain: `backend`
- Stage: `output boundary`
- Retryable: false
- Trigger: adapter output 或响应不符合 schema 或 strict bridge contract
- User action: 携带错误码与操作上报；该失败通常表示 Server Function 实现需要修正
- Developer notes: 输出校验失败不得部分返回，也不得回显 output value

## 2. Compiler blocking codes

Workspace Route 作者投影与 Web Issues 同时复用前四个 code，使无效 binding 在运行/导出前即可定位；可见
metadata 只允许 path、route、slot、artifact 与 export identity，不得携带源码、input/output value 或 authority material。

| Code                                                 | 含义                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `WKS-EXPORT-SERVER-PROFILE-INVALID`                  | canonical Server runtime profile 无法严格解码                 |
| `WKS-EXPORT-SERVER-EXPORT-REQUIRED`                  | route binding 未指定 named export                             |
| `WKS-EXPORT-SERVER-DEFINITION-MISSING`               | named export 未在 canonical profile 中声明                    |
| `WKS-EXPORT-SERVER-SLOT-MISMATCH`                    | loader/action/guard 与 function kind 不一致                   |
| `WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID`              | `/config/auth.json` 无法按 reference-only contract 严格解码   |
| `WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED`             | 受保护 Server Function 缺 canonical Auth 配置                 |
| `WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED`        | 当前 target 不支持声明的 Auth provider                        |
| `WKS-EXPORT-SERVER-PERMISSION-UNDECLARED`            | function 所需 permission 未在 canonical catalog 声明          |
| `WKS-EXPORT-SERVER-GATEWAY-REQUIRED`                 | client/static target 无安全 Server gateway                    |
| `WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED`              | 当前 target 不支持 adapter/auth/zone/effect 组合              |
| `WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED`          | 当前 target 无受审计 Secret/environment resolution 边界       |
| `WKS-EXPORT-SERVER-TEST-PROVISION-INVALID`           | deterministic Test provision 缺失或无效                       |
| `WKS-EXPORT-SERVER-TEST-FIXTURE-MISSING`             | exact Server Function fixture 缺失                            |
| `WKS-EXPORT-SERVER-TEST-PRINCIPAL-REQUIRED`          | 鉴权 fixture 未声明 test principal                            |
| `WKS-EXPORT-SERVER-TEST-PERMISSION-REQUIRED`         | permission fixture 未声明 exact decision                      |
| `WKS-EXPORT-SERVER-TEST-SOURCE-MUTATION-UNSUPPORTED` | deterministic Test 不得模拟或采纳 isolated 项目源码 mutation  |
| `WKS-EXPORT-SERVER-MUTATION-IDEMPOTENCY-REQUIRED`    | mutation 未声明 invocation-key replay fence                   |
| `WKS-EXPORT-SERVER-ISOLATED-SOURCE-INVALID`          | isolated target 源文档不是 TypeScript/JavaScript              |
| `WKS-EXPORT-SERVER-ISOLATED-DEFINITION-MISSING`      | isolated export 未在 canonical profile 声明                   |
| `WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED`      | isolated first vertical 不支持当前 policy                     |
| `WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED`      | isolated graph 含外部/动态/歧义/越界 import、超预算或无法转译 |

## 3. 生成产物中的 transport-only code

Generated frame 可见的 transport-only failure code 是
`SVR_REMOTE_GATEWAY_UNAVAILABLE`、`SVR_REMOTE_GATEWAY_STALE`、
`SVR_REMOTE_GATEWAY_TIMEOUT`、`SVR_REMOTE_GATEWAY_INVALID` 与 `SVR_CANCELLED`；它们不替代 Backend
diagnostic envelope。Deterministic Test 使用 `SVR_TEST_PROVISION_INVALID`、`SVR_TEST_FIXTURE_MISSING`、
`SVR_TEST_REPLAY_CONFLICT`、`SVR_TEST_IDEMPOTENCY_REQUIRED` 和 `SVR_TEST_RUNTIME_DISABLED` fail closed。

Isolated source mutation runner 只使用固定安全 code：`SVR_SOURCE_MUTATION_INVALID` 表示 target、shape、bytes、
重复调用或 source 无效；`SVR_SOURCE_MUTATION_REQUIRED` 表示成功返回前没有完成唯一 proposal。Worker 对 response/diff
相关性失败只保存固定终态原因 `invalid-project-source-mutation`，不得把 replacement source 或不可信错误文本写入 durable event。
