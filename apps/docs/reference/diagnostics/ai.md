---
lastUpdated: false
---

# AI 错误码

AI 命名空间覆盖Provider、模型发现、Prompt、响应解析和 AI command。

| Code                                        | 名称                    | 严重程度  |
| ------------------------------------------- | ----------------------- | --------- |
| [`AI-1001`](/reference/diagnostics/ai-1001) | Provider 配置缺失       | `warning` |
| [`AI-1002`](/reference/diagnostics/ai-1002) | Provider 请求失败       | `error`   |
| [`AI-2001`](/reference/diagnostics/ai-2001) | 模型发现失败            | `warning` |
| [`AI-2002`](/reference/diagnostics/ai-2002) | 模型能力不满足当前任务  | `warning` |
| [`AI-3001`](/reference/diagnostics/ai-3001) | Prompt 上下文为空       | `warning` |
| [`AI-4001`](/reference/diagnostics/ai-4001) | 响应为空                | `error`   |
| [`AI-4002`](/reference/diagnostics/ai-4002) | 响应结构无法解析        | `error`   |
| [`AI-4010`](/reference/diagnostics/ai-4010) | 流式响应中断            | `error`   |
| [`AI-4011`](/reference/diagnostics/ai-4011) | 流式响应结构无法解析    | `error`   |
| [`AI-4012`](/reference/diagnostics/ai-4012) | 流式响应不可读          | `warning` |
| [`AI-5001`](/reference/diagnostics/ai-5001) | AI Command dry-run 失败 | `error`   |
| [`AI-9001`](/reference/diagnostics/ai-9001) | AI 未知异常             | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
