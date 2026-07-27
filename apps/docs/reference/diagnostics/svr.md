---
lastUpdated: false
---

# Auth/Server Runtime 错误码

Auth/Server Runtime 命名空间覆盖Server Function 调用、输入输出边界、live mutation 防护和 gateway。

| Code                                          | 名称                                                | 严重程度 |
| --------------------------------------------- | --------------------------------------------------- | -------- |
| [`SVR-1001`](/reference/diagnostics/svr-1001) | Server Function 调用请求形状非法                    | `error`  |
| [`SVR-2001`](/reference/diagnostics/svr-2001) | Server Function 输入不符合 canonical JSON Schema    | `error`  |
| [`SVR-3001`](/reference/diagnostics/svr-3001) | live mutation 缺少允许的 Origin 或 mutation intent  | `error`  |
| [`SVR-3002`](/reference/diagnostics/svr-3002) | mutation invocation identity 与 durable ledger 冲突 | `error`  |
| [`SVR-3003`](/reference/diagnostics/svr-3003) | mutation 有界容量耗尽                               | `error`  |
| [`SVR-4004`](/reference/diagnostics/svr-4004) | Server Function 目标不可见                          | `error`  |
| [`SVR-5001`](/reference/diagnostics/svr-5001) | 已鉴权的 Server Function gateway 不可用             | `error`  |
| [`SVR-5002`](/reference/diagnostics/svr-5002) | Server Function 输出不符合边界契约                  | `error`  |

[返回错误码索引](/reference/diagnostic-codes)
