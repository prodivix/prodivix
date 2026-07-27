---
lastUpdated: false
---

# Verification 错误码

Verification 命名空间覆盖Impact、Policy、Plan、adapter、Evidence、retention 和 Closure。

| Code                                          | 名称                                                   | 严重程度  |
| --------------------------------------------- | ------------------------------------------------------ | --------- |
| [`VER-1001`](/reference/diagnostics/ver-1001) | VerificationImpactSet 已失效或输入错配                 | `error`   |
| [`VER-1002`](/reference/diagnostics/ver-1002) | Impact provider 不完整，已扩大验证范围                 | `warning` |
| [`VER-2001`](/reference/diagnostics/ver-2001) | VerificationPolicy 无效                                | `error`   |
| [`VER-2002`](/reference/diagnostics/ver-2002) | Verification exemption 已过期或不适用                  | `error`   |
| [`VER-3001`](/reference/diagnostics/ver-3001) | Required Scenario 或 check 缺失                        | `error`   |
| [`VER-3002`](/reference/diagnostics/ver-3002) | Required matrix cell 不受支持                          | `error`   |
| [`VER-3003`](/reference/diagnostics/ver-3003) | Required cell 依赖无法满足                             | `error`   |
| [`VER-3004`](/reference/diagnostics/ver-3004) | VerificationPlan 超出预算                              | `error`   |
| [`VER-4001`](/reference/diagnostics/ver-4001) | Verification adapter 失败                              | `error`   |
| [`VER-4002`](/reference/diagnostics/ver-4002) | EvidenceCandidate 无效或超出预算                       | `error`   |
| [`VER-5001`](/reference/diagnostics/ver-5001) | Evidence identity 或 digest 链不匹配                   | `fatal`   |
| [`VER-5002`](/reference/diagnostics/ver-5002) | Evidence 中检测到 Secret 或敏感数据                    | `fatal`   |
| [`VER-5003`](/reference/diagnostics/ver-5003) | Evidence attestation 无效                              | `error`   |
| [`VER-5004`](/reference/diagnostics/ver-5004) | Evidence 或 baseline 不兼容，无法比较                  | `warning` |
| [`VER-5005`](/reference/diagnostics/ver-5005) | Artifact promotion 或安全校验失败                      | `error`   |
| [`VER-6001`](/reference/diagnostics/ver-6001) | Evidence 已过期、撤销或受保护而无法执行 retention 操作 | `warning` |
| [`VER-6002`](/reference/diagnostics/ver-6002) | VerificationClosure 不完整或已失效                     | `error`   |
| [`VER-9001`](/reference/diagnostics/ver-9001) | 未分类的 Verification 异常                             | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
