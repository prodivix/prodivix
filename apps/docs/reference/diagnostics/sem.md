---
lastUpdated: false
---

# Semantic 错误码

Semantic 命名空间覆盖Workspace 级符号、作用域、引用解析、能力约束和快照一致性。

| Code                                          | 名称                           | 严重程度  |
| --------------------------------------------- | ------------------------------ | --------- |
| [`SEM-2001`](/reference/diagnostics/sem-2001) | 语义引用目标不存在             | `warning` |
| [`SEM-2002`](/reference/diagnostics/sem-2002) | 语义引用目标在当前作用域不可见 | `warning` |
| [`SEM-2003`](/reference/diagnostics/sem-2003) | 语义引用解析结果不唯一         | `warning` |
| [`SEM-2004`](/reference/diagnostics/sem-2004) | 语义引用目标类型或能力不兼容   | `warning` |
| [`SEM-2005`](/reference/diagnostics/sem-2005) | 语义索引快照已过期             | `warning` |

[返回错误码索引](/reference/diagnostic-codes)
