---
lastUpdated: false
---

# AI 错误码

AI 命名空间覆盖Provider/Capability、Context/Media、Task/Run、Tool/Retrieval、Approval 和 Evaluation/Verification。

| Code                                        | 名称                                                   | 严重程度  |
| ------------------------------------------- | ------------------------------------------------------ | --------- |
| [`AI-1001`](/reference/diagnostics/ai-1001) | Provider 配置缺失                                      | `warning` |
| [`AI-1002`](/reference/diagnostics/ai-1002) | Provider 请求失败                                      | `error`   |
| [`AI-1010`](/reference/diagnostics/ai-1010) | Provider baseURL 非法                                  | `error`   |
| [`AI-2001`](/reference/diagnostics/ai-2001) | 模型发现失败                                           | `warning` |
| [`AI-2002`](/reference/diagnostics/ai-2002) | 模型能力不满足当前任务                                 | `warning` |
| [`AI-3001`](/reference/diagnostics/ai-3001) | Prompt 上下文为空                                      | `warning` |
| [`AI-4001`](/reference/diagnostics/ai-4001) | 响应为空                                               | `error`   |
| [`AI-4002`](/reference/diagnostics/ai-4002) | 响应结构无法解析                                       | `error`   |
| [`AI-4010`](/reference/diagnostics/ai-4010) | 流式响应中断                                           | `error`   |
| [`AI-4011`](/reference/diagnostics/ai-4011) | 流式响应结构无法解析                                   | `error`   |
| [`AI-4012`](/reference/diagnostics/ai-4012) | 流式响应不可读                                         | `warning` |
| [`AI-5001`](/reference/diagnostics/ai-5001) | AI Action dry-run 失败                                 | `error`   |
| [`AI-5002`](/reference/diagnostics/ai-5002) | AI Action 目标越界                                     | `error`   |
| [`AI-5003`](/reference/diagnostics/ai-5003) | AI Action 编辑字段未授权                               | `error`   |
| [`AI-5004`](/reference/diagnostics/ai-5004) | Code-owned 输出未使用 CodeArtifact                     | `error`   |
| [`AI-5005`](/reference/diagnostics/ai-5005) | AI Action 需要的 domain validator 缺失                 | `error`   |
| [`AI-5006`](/reference/diagnostics/ai-5006) | AI Approval decision 缺失或过期                        | `error`   |
| [`AI-6001`](/reference/diagnostics/ai-6001) | AgentTask base revision 已过期                         | `error`   |
| [`AI-6002`](/reference/diagnostics/ai-6002) | Agent budget 已耗尽                                    | `error`   |
| [`AI-6003`](/reference/diagnostics/ai-6003) | AgentRun callback 已失权                               | `warning` |
| [`AI-6004`](/reference/diagnostics/ai-6004) | AgentRun recovery 无法安全继续                         | `error`   |
| [`AI-6010`](/reference/diagnostics/ai-6010) | Provider capability qualification 缺失或已过期         | `error`   |
| [`AI-6011`](/reference/diagnostics/ai-6011) | Provider inference state 或 effective Context 不可证明 | `error`   |
| [`AI-6012`](/reference/diagnostics/ai-6012) | Provider background job callback 无效                  | `warning` |
| [`AI-6013`](/reference/diagnostics/ai-6013) | Provider usage 需要 reconciliation                     | `error`   |
| [`AI-7001`](/reference/diagnostics/ai-7001) | Agent capability 被拒绝                                | `error`   |
| [`AI-7002`](/reference/diagnostics/ai-7002) | 检测到不可信指令或 prompt injection                    | `error`   |
| [`AI-7003`](/reference/diagnostics/ai-7003) | Agent Secret 使用被拒绝                                | `error`   |
| [`AI-7004`](/reference/diagnostics/ai-7004) | Agent network 请求被拒绝                               | `error`   |
| [`AI-7005`](/reference/diagnostics/ai-7005) | Agent 自我审批或权限升级被拒绝                         | `error`   |
| [`AI-7006`](/reference/diagnostics/ai-7006) | Agent approval identity 不兼容                         | `error`   |
| [`AI-7010`](/reference/diagnostics/ai-7010) | 多模态 Context 或 transformation 被拒绝                | `error`   |
| [`AI-7011`](/reference/diagnostics/ai-7011) | Generated artifact candidate 未通过采纳边界            | `error`   |
| [`AI-7012`](/reference/diagnostics/ai-7012) | Hosted tool 或动态 capability 未获授权                 | `error`   |
| [`AI-7013`](/reference/diagnostics/ai-7013) | Retrieval source 或 index 不可用于当前 Context         | `error`   |
| [`AI-7014`](/reference/diagnostics/ai-7014) | MCP、computer use 或 managed-agent capability 被拒绝   | `error`   |
| [`AI-7015`](/reference/diagnostics/ai-7015) | Parallel 或 nested tool execution 无法安全合并         | `error`   |
| [`AI-8001`](/reference/diagnostics/ai-8001) | Agent Verification Closure 未满足                      | `error`   |
| [`AI-8002`](/reference/diagnostics/ai-8002) | Agent repair 已达到上限                                | `error`   |
| [`AI-8003`](/reference/diagnostics/ai-8003) | Agent audit 不完整                                     | `error`   |
| [`AI-8004`](/reference/diagnostics/ai-8004) | Agent rollback 被阻止                                  | `error`   |
| [`AI-8005`](/reference/diagnostics/ai-8005) | Agent model evaluation evidence 不完整或已过期         | `error`   |
| [`AI-8010`](/reference/diagnostics/ai-8010) | Agent model evaluation statistical floor 未满足        | `error`   |
| [`AI-8011`](/reference/diagnostics/ai-8011) | Holdout、grader 或 human review evidence 无效          | `error`   |
| [`AI-9001`](/reference/diagnostics/ai-9001) | AI 未知异常                                            | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
