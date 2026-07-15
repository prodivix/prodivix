---
lastUpdated: false
---

# Code 错误码

Code 命名空间覆盖代码片段、符号解析、类型、宿主绑定、运行时和转译编译。

| Code                                          | 名称                                | 严重程度  |
| --------------------------------------------- | ----------------------------------- | --------- |
| [`COD-1001`](/reference/diagnostics/cod-1001) | 代码解析失败                        | `error`   |
| [`COD-1002`](/reference/diagnostics/cod-1002) | 不支持的语言模式                    | `error`   |
| [`COD-1003`](/reference/diagnostics/cod-1003) | 代码片段为空或形状非法              | `warning` |
| [`COD-1004`](/reference/diagnostics/cod-1004) | 表达式片段不是单一表达式            | `error`   |
| [`COD-1005`](/reference/diagnostics/cod-1005) | 代码片段包含当前模式禁止的顶层语句  | `error`   |
| [`COD-1006`](/reference/diagnostics/cod-1006) | 源码编码或文本范围非法              | `error`   |
| [`COD-2001`](/reference/diagnostics/cod-2001) | 符号无法解析                        | `warning` |
| [`COD-2002`](/reference/diagnostics/cod-2002) | import 无法解析                     | `error`   |
| [`COD-2003`](/reference/diagnostics/cod-2003) | 类型不兼容                          | `warning` |
| [`COD-2004`](/reference/diagnostics/cod-2004) | 共享符号环境过期                    | `warning` |
| [`COD-2010`](/reference/diagnostics/cod-2010) | 重命名符号存在冲突                  | `warning` |
| [`COD-2011`](/reference/diagnostics/cod-2011) | 循环 import 或循环符号依赖          | `error`   |
| [`COD-2012`](/reference/diagnostics/cod-2012) | 符号解析结果不唯一                  | `warning` |
| [`COD-2013`](/reference/diagnostics/cod-2013) | 引用了当前作用域不可见的符号        | `warning` |
| [`COD-2014`](/reference/diagnostics/cod-2014) | 外部库导出类型缺失或不可用          | `warning` |
| [`COD-2015`](/reference/diagnostics/cod-2015) | 泛型或类型参数无法满足约束          | `warning` |
| [`COD-2016`](/reference/diagnostics/cod-2016) | 类型推断超过复杂度上限              | `warning` |
| [`COD-3001`](/reference/diagnostics/cod-3001) | 代码片段绑定目标不存在              | `error`   |
| [`COD-3002`](/reference/diagnostics/cod-3002) | 代码片段返回值不满足宿主契约        | `error`   |
| [`COD-3003`](/reference/diagnostics/cod-3003) | 代码访问了当前上下文不可用的能力    | `warning` |
| [`COD-3010`](/reference/diagnostics/cod-3010) | 事件 handler 参数签名不匹配         | `warning` |
| [`COD-3011`](/reference/diagnostics/cod-3011) | Mounted CSS selector 超出节点作用域 | `warning` |
| [`COD-3012`](/reference/diagnostics/cod-3012) | 代码片段 owner 类型不支持当前宿主   | `error`   |
| [`COD-3013`](/reference/diagnostics/cod-3013) | 生命周期 hook 与宿主阶段不匹配      | `warning` |
| [`COD-3014`](/reference/diagnostics/cod-3014) | 异步返回值不被宿主接受              | `warning` |
| [`COD-3015`](/reference/diagnostics/cod-3015) | 代码片段修改了只读上下文            | `error`   |
| [`COD-3017`](/reference/diagnostics/cod-3017) | Code artifact 已失去 owner binding  | `warning` |
| [`COD-4001`](/reference/diagnostics/cod-4001) | 用户代码运行时抛错                  | `error`   |
| [`COD-4010`](/reference/diagnostics/cod-4010) | 用户代码执行超时                    | `error`   |
| [`COD-4011`](/reference/diagnostics/cod-4011) | sandbox 权限拒绝                    | `error`   |
| [`COD-4012`](/reference/diagnostics/cod-4012) | 用户代码产生非确定性副作用          | `warning` |
| [`COD-4013`](/reference/diagnostics/cod-4013) | 用户代码递归或循环超过限制          | `error`   |
| [`COD-4014`](/reference/diagnostics/cod-4014) | 用户代码返回不可序列化结果          | `error`   |
| [`COD-5001`](/reference/diagnostics/cod-5001) | 转译失败                            | `error`   |
| [`COD-5002`](/reference/diagnostics/cod-5002) | Shader 编译失败                     | `error`   |
| [`COD-5010`](/reference/diagnostics/cod-5010) | 语言服务 worker 初始化失败          | `error`   |
| [`COD-5011`](/reference/diagnostics/cod-5011) | Source map 生成或映射失败           | `warning` |
| [`COD-5012`](/reference/diagnostics/cod-5012) | CSS/SCSS 预处理失败                 | `error`   |
| [`COD-5013`](/reference/diagnostics/cod-5013) | 目标运行模式不支持当前语言特性      | `warning` |
| [`COD-9001`](/reference/diagnostics/cod-9001) | 代码环境未知异常                    | `error`   |
| [`COD-9002`](/reference/diagnostics/cod-9002) | 代码诊断证据不足                    | `warning` |

[返回错误码索引](/reference/diagnostic-codes)
