---
lastUpdated: false
---

# Backend/API 错误码

Backend/API 命名空间覆盖请求、鉴权、权限、业务校验、持久化和第三方集成。

| Code                                          | 名称               | 严重程度  |
| --------------------------------------------- | ------------------ | --------- |
| [`API-1001`](/reference/diagnostics/api-1001) | 请求体无法解析     | `error`   |
| [`API-1002`](/reference/diagnostics/api-1002) | 请求参数缺失       | `error`   |
| [`API-2001`](/reference/diagnostics/api-2001) | 用户未登录         | `error`   |
| [`API-2002`](/reference/diagnostics/api-2002) | 会话已过期         | `warning` |
| [`API-2004`](/reference/diagnostics/api-2004) | 密码重置链接无效   | `error`   |
| [`API-3001`](/reference/diagnostics/api-3001) | 权限不足           | `error`   |
| [`API-4001`](/reference/diagnostics/api-4001) | 后端业务校验失败   | `error`   |
| [`API-4004`](/reference/diagnostics/api-4004) | 资源不存在或不可见 | `error`   |
| [`API-4009`](/reference/diagnostics/api-4009) | 业务冲突           | `error`   |
| [`API-4290`](/reference/diagnostics/api-4290) | 认证操作限流       | `warning` |
| [`API-5001`](/reference/diagnostics/api-5001) | 数据库写入失败     | `error`   |
| [`API-6001`](/reference/diagnostics/api-6001) | 第三方集成调用失败 | `error`   |
| [`API-9001`](/reference/diagnostics/api-9001) | 后端未知异常       | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
