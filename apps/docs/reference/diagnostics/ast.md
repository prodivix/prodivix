---
lastUpdated: false
---

# Binary Asset 错误码

Binary Asset 命名空间覆盖blob 引用、materialization、Git/LFS 投影、后端 blob 边界和隔离交付。

| Code                                          | 名称                                                             | 严重程度 |
| --------------------------------------------- | ---------------------------------------------------------------- | -------- |
| [`AST-1001`](/reference/diagnostics/ast-1001) | canonical asset 缺少 verified materialization                    | `error`  |
| [`AST-1002`](/reference/diagnostics/ast-1002) | 同一 asset document 收到多个 materialization                     | `error`  |
| [`AST-1003`](/reference/diagnostics/ast-1003) | materialization reference 与 Workspace identity 不一致           | `error`  |
| [`AST-1004`](/reference/diagnostics/ast-1004) | asset bytes 的 digest、size 或 materialization 形状无效          | `error`  |
| [`AST-1005`](/reference/diagnostics/ast-1005) | materialization 没有对应 canonical asset document                | `error`  |
| [`AST-1101`](/reference/diagnostics/ast-1101) | active content 缺少 sanitizer 与 isolated-origin policy          | `error`  |
| [`AST-1102`](/reference/diagnostics/ast-1102) | download-only media 缺少 attachment-capable isolated origin      | `error`  |
| [`AST-1201`](/reference/diagnostics/ast-1201) | canonical Asset 缺少 exact verified materialization              | `error`  |
| [`AST-1202`](/reference/diagnostics/ast-1202) | 同一 Asset document 收到重复 materialization                     | `error`  |
| [`AST-1203`](/reference/diagnostics/ast-1203) | Asset reference、revision 或 materialization identity 无效或漂移 | `error`  |
| [`AST-1204`](/reference/diagnostics/ast-1204) | Asset checkout path 冲突                                         | `error`  |
| [`AST-1205`](/reference/diagnostics/ast-1205) | materialization 没有对应本次 canonical Asset source              | `error`  |
| [`AST-1206`](/reference/diagnostics/ast-1206) | Asset 投影超出 hard budget                                       | `error`  |
| [`AST-2001`](/reference/diagnostics/ast-2001) | blob 上传请求无效                                                | `error`  |
| [`AST-2002`](/reference/diagnostics/ast-2002) | 授权范围内找不到 blob                                            | `error`  |
| [`AST-2003`](/reference/diagnostics/ast-2003) | blob metadata 或 bytes 与请求冲突                                | `error`  |
| [`AST-2004`](/reference/diagnostics/ast-2004) | 旧 JSON-only import 未使用 upload-aware protocol                 | `error`  |
| [`AST-3001`](/reference/diagnostics/ast-3001) | 当前 composition 没有授权的 blob materialization adapter         | `error`  |
| [`AST-3002`](/reference/diagnostics/ast-3002) | 目标位置已存在同名 Asset                                         | `error`  |
| [`AST-3101`](/reference/diagnostics/ast-3101) | 隔离交付宿主暂不可用                                             | `error`  |
| [`AST-3102`](/reference/diagnostics/ast-3102) | 交付被 transform、媒体或内容策略拒绝                             | `error`  |
| [`AST-3103`](/reference/diagnostics/ast-3103) | 隔离交付响应 identity 漂移                                       | `error`  |

[返回错误码索引](/reference/diagnostic-codes)
