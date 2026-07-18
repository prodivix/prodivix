# Auth / Server Runtime Diagnostic Codes

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Remote Auth/Test/Isolated + Live Mutation Safety + Audited Secret HMAC + Route/Auth Configuration Authoring Issues Verticals Implemented
- ProductGateStatus：G2 In Progress
- 日期：2026-07-18
- Owner：`@prodivix/server-runtime`、Compiler、Backend gateway

诊断与错误不得携带 input/output value、principal raw identity、session id、token、cookie、Secret 或源码。

| Code       | Severity | Stage                    | Retryable | 含义                                                                         |
| ---------- | -------- | ------------------------ | --------- | ---------------------------------------------------------------------------- |
| `SVR-1001` | error    | request decode           | false     | invocation/bridge shape、identity 或 body size 非法                          |
| `SVR-2001` | error    | input preflight          | false     | input 不符合 canonical JSON Schema                                           |
| `SVR-3001` | error    | mutation request guard   | false     | live mutation 缺 exact allowed Origin 或 mutation intent                     |
| `SVR-3002` | error    | mutation replay          | false     | invocation 的 origin/snapshot/function/input identity 与 durable ledger 冲突 |
| `SVR-3003` | error    | mutation budget          | false     | execution 的 state/replay 有界容量耗尽                                       |
| `SVR-4004` | error    | authorization/resolution | false     | execution/session/revision/function/permission 不可见；统一 not-found 防枚举 |
| `SVR-5001` | error    | gateway                  | true      | authenticated Server Function gateway 不可用                                 |
| `SVR-5002` | error    | output boundary          | false     | adapter output/response 不符合 schema 或 strict bridge contract              |

Compiler 使用以下稳定 blocking codes：

Workspace Route 作者投影与 Web Issues 同时复用前四个 code，使无效 binding 在运行/导出前即可定位；可见
metadata 只允许 path、route、slot、artifact 与 export identity，不得携带源码、input/output value 或 authority material。

| Code                                              | 含义                                                          |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `WKS-EXPORT-SERVER-PROFILE-INVALID`               | canonical Server runtime profile 无法严格解码                 |
| `WKS-EXPORT-SERVER-EXPORT-REQUIRED`               | route binding 未指定 named export                             |
| `WKS-EXPORT-SERVER-DEFINITION-MISSING`            | named export 未在 canonical profile 中声明                    |
| `WKS-EXPORT-SERVER-SLOT-MISMATCH`                 | loader/action/guard 与 function kind 不一致                   |
| `WKS-EXPORT-SERVER-AUTH-CONFIG-INVALID`           | `/config/auth.json` 无法按 reference-only contract 严格解码   |
| `WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED`          | 受保护 Server Function 缺 canonical Auth 配置                 |
| `WKS-EXPORT-SERVER-AUTH-PROVIDER-UNSUPPORTED`     | 当前 target 不支持声明的 Auth provider                        |
| `WKS-EXPORT-SERVER-PERMISSION-UNDECLARED`         | function 所需 permission 未在 canonical catalog 声明          |
| `WKS-EXPORT-SERVER-GATEWAY-REQUIRED`              | client/static target 无安全 Server gateway                    |
| `WKS-EXPORT-SERVER-ADAPTER-UNSUPPORTED`           | 当前 target 不支持 adapter/auth/zone/effect 组合              |
| `WKS-EXPORT-SERVER-ENVIRONMENT-UNSUPPORTED`       | 当前 target 无受审计 Secret/environment resolution 边界       |
| `WKS-EXPORT-SERVER-TEST-PROVISION-INVALID`        | deterministic Test provision 缺失或无效                       |
| `WKS-EXPORT-SERVER-TEST-FIXTURE-MISSING`          | exact Server Function fixture 缺失                            |
| `WKS-EXPORT-SERVER-TEST-PRINCIPAL-REQUIRED`       | 鉴权 fixture 未声明 test principal                            |
| `WKS-EXPORT-SERVER-TEST-PERMISSION-REQUIRED`      | permission fixture 未声明 exact decision                      |
| `WKS-EXPORT-SERVER-MUTATION-IDEMPOTENCY-REQUIRED` | mutation 未声明 invocation-key replay fence                   |
| `WKS-EXPORT-SERVER-ISOLATED-SOURCE-INVALID`       | isolated target 源文档不是 TypeScript/JavaScript              |
| `WKS-EXPORT-SERVER-ISOLATED-DEFINITION-MISSING`   | isolated export 未在 canonical profile 声明                   |
| `WKS-EXPORT-SERVER-ISOLATED-POLICY-UNSUPPORTED`   | isolated first vertical 不支持当前 policy                     |
| `WKS-EXPORT-SERVER-ISOLATED-MODULE-UNSUPPORTED`   | isolated graph 含外部/动态/歧义/越界 import、超预算或无法转译 |

Generated frame 可见的 transport-only failure code 是
`SVR_REMOTE_GATEWAY_UNAVAILABLE`、`SVR_REMOTE_GATEWAY_STALE`、
`SVR_REMOTE_GATEWAY_TIMEOUT`、`SVR_REMOTE_GATEWAY_INVALID` 与 `SVR_CANCELLED`；它们不替代 Backend
diagnostic envelope。Deterministic Test 使用 `SVR_TEST_PROVISION_INVALID`、`SVR_TEST_FIXTURE_MISSING`、
`SVR_TEST_REPLAY_CONFLICT`、`SVR_TEST_IDEMPOTENCY_REQUIRED` 和 `SVR_TEST_RUNTIME_DISABLED` fail closed。
