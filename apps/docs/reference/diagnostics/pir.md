---
lastUpdated: false
---

# PIR 错误码

PIR 命名空间覆盖文档形状、UI graph、ValueRef、materialize 和运行前校验。

| Code                                          | 名称                      | 严重程度  |
| --------------------------------------------- | ------------------------- | --------- |
| [`PIR-1001`](/reference/diagnostics/pir-1001) | 禁止保存树形 UI 根节点    | `error`   |
| [`PIR-1002`](/reference/diagnostics/pir-1002) | UI graph 缺失             | `error`   |
| [`PIR-1003`](/reference/diagnostics/pir-1003) | 节点字段非法              | `error`   |
| [`PIR-2001`](/reference/diagnostics/pir-2001) | 根节点不存在              | `error`   |
| [`PIR-2002`](/reference/diagnostics/pir-2002) | 节点 key 与节点 ID 不一致 | `error`   |
| [`PIR-2003`](/reference/diagnostics/pir-2003) | 子节点引用不存在          | `error`   |
| [`PIR-2004`](/reference/diagnostics/pir-2004) | UI graph 存在环           | `error`   |
| [`PIR-2005`](/reference/diagnostics/pir-2005) | 节点存在多个结构父级      | `error`   |
| [`PIR-2006`](/reference/diagnostics/pir-2006) | 存在未受控孤儿节点        | `warning` |
| [`PIR-2007`](/reference/diagnostics/pir-2007) | 跨结构节点引用不存在      | `error`   |
| [`PIR-3001`](/reference/diagnostics/pir-3001) | ValueRef 路径无法解析     | `warning` |
| [`PIR-3002`](/reference/diagnostics/pir-3002) | 数据作用域配置非法        | `warning` |
| [`PIR-3010`](/reference/diagnostics/pir-3010) | 列表渲染配置非法          | `warning` |
| [`PIR-4001`](/reference/diagnostics/pir-4001) | Materialize 失败          | `error`   |
| [`PIR-9001`](/reference/diagnostics/pir-9001) | PIR 未知异常              | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
