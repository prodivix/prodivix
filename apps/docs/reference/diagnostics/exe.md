---
lastUpdated: false
---

# Remote Execution 错误码

Remote Execution 命名空间覆盖远端协议、幂等、恢复、权限、配额、transport 和 Secret 边界。

| Code                                          | 名称                                | 严重程度 |
| --------------------------------------------- | ----------------------------------- | -------- |
| [`EXE-4001`](/reference/diagnostics/exe-4001) | 远端执行协议版本不受支持            | `error`  |
| [`EXE-4002`](/reference/diagnostics/exe-4002) | 远端请求或响应未通过严格 codec 校验 | `error`  |
| [`EXE-4011`](/reference/diagnostics/exe-4011) | 远端执行需要授权                    | `error`  |
| [`EXE-4031`](/reference/diagnostics/exe-4031) | 远端执行操作被拒绝                  | `error`  |
| [`EXE-4041`](/reference/diagnostics/exe-4041) | 远端执行或 artifact 未找到          | `error`  |
| [`EXE-4091`](/reference/diagnostics/exe-4091) | 远端请求幂等 identity 冲突          | `error`  |
| [`EXE-4092`](/reference/diagnostics/exe-4092) | 需要按 authoritative status 恢复    | `error`  |
| [`EXE-4291`](/reference/diagnostics/exe-4291) | 远端执行配额已超出                  | `error`  |
| [`EXE-5001`](/reference/diagnostics/exe-5001) | 远端 runner 不可用                  | `error`  |
| [`EXE-5002`](/reference/diagnostics/exe-5002) | 远端 transport 请求超时             | `error`  |
| [`EXE-5003`](/reference/diagnostics/exe-5003) | 已脱敏的远端内部失败                | `error`  |
| [`EXE-5004`](/reference/diagnostics/exe-5004) | Secret 边界 fail closed             | `fatal`  |

[返回错误码索引](/reference/diagnostic-codes)
