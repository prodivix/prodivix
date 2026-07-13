---
lastUpdated: false
---

# Workspace 错误码

Workspace 命名空间覆盖工作区加载、文档保存、同步冲突、capability 和 patch 应用。

| Code                                          | 名称                       | 严重程度  |
| --------------------------------------------- | -------------------------- | --------- |
| [`WKS-1001`](/reference/diagnostics/wks-1001) | 工作区不存在               | `error`   |
| [`WKS-1002`](/reference/diagnostics/wks-1002) | 工作区快照损坏             | `error`   |
| [`WKS-2001`](/reference/diagnostics/wks-2001) | 能力协商不支持当前写入协议 | `error`   |
| [`WKS-3001`](/reference/diagnostics/wks-3001) | 文档不存在                 | `error`   |
| [`WKS-3002`](/reference/diagnostics/wks-3002) | 文档类型不支持该操作       | `error`   |
| [`WKS-4001`](/reference/diagnostics/wks-4001) | Workspace revision 冲突    | `warning` |
| [`WKS-4002`](/reference/diagnostics/wks-4002) | Route revision 冲突        | `warning` |
| [`WKS-4003`](/reference/diagnostics/wks-4003) | Document revision 冲突     | `warning` |
| [`WKS-5002`](/reference/diagnostics/wks-5002) | Patch 应用失败             | `error`   |
| [`WKS-9001`](/reference/diagnostics/wks-9001) | Workspace 未知异常         | `error`   |

[返回错误码索引](/reference/diagnostic-codes)
