---
lastUpdated: false
---

# Behavior 错误码

Behavior 命名空间覆盖Scenario schema、semantic target、compile、execute、replay 和 recorder。

| Code                                          | 名称                                  | 严重程度  |
| --------------------------------------------- | ------------------------------------- | --------- |
| [`BHV-1001`](/reference/diagnostics/bhv-1001) | BehaviorScenario 无效                 | `error`   |
| [`BHV-2001`](/reference/diagnostics/bhv-2001) | 行为目标无法唯一解析                  | `error`   |
| [`BHV-2002`](/reference/diagnostics/bhv-2002) | Action 与目标 capability 不兼容       | `error`   |
| [`BHV-3001`](/reference/diagnostics/bhv-3001) | BehaviorScenarioProgram 编译失败      | `error`   |
| [`BHV-3002`](/reference/diagnostics/bhv-3002) | 行为程序超出预算                      | `error`   |
| [`BHV-4001`](/reference/diagnostics/bhv-4001) | 行为步骤失败                          | `error`   |
| [`BHV-4002`](/reference/diagnostics/bhv-4002) | 行为条件等待超时                      | `error`   |
| [`BHV-4003`](/reference/diagnostics/bhv-4003) | 确定性 replay 发生分歧                | `error`   |
| [`BHV-4004`](/reference/diagnostics/bhv-4004) | 行为运行请求了禁止的网络或敏感能力    | `fatal`   |
| [`BHV-4005`](/reference/diagnostics/bhv-4005) | Runtime control 未完整应用            | `error`   |
| [`BHV-4006`](/reference/diagnostics/bhv-4006) | 行为运行状态未能安全清理              | `fatal`   |
| [`BHV-5001`](/reference/diagnostics/bhv-5001) | Recorder 无法生成可提交的语义步骤     | `warning` |
| [`BHV-5002`](/reference/diagnostics/bhv-5002) | Recorder draft 已因 revision 变化失效 | `warning` |
| [`BHV-9001`](/reference/diagnostics/bhv-9001) | 未分类的 Behavior 异常                | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
