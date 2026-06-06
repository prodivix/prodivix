# Workspace Diagnostics 编码规范（WKS）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/05.workspace-vfs.md`
  - `specs/decisions/07.workspace-sync.md`
  - `specs/decisions/11.revision-partitioning.md`
  - `specs/api/workspace-sync.openapi.yaml`

## 1. 范围

`WKS-xxxx` 覆盖 Workspace VFS、文档保存、workspace snapshot、revision 分区、同步冲突和 capability 协商。

不覆盖：

1. PIR 文档内部结构错误，使用 `PIR-xxxx`。
2. HTTP 鉴权、权限、用户会话，使用 `API-xxxx`。
3. GitHub App 或远端 Git 平台集成，后续使用 `API-xxxx` 或独立 Git 域。

## 2. 阶段

```ts
type WorkspaceDiagnosticStage =
  | 'load'
  | 'capability'
  | 'document'
  | 'sync'
  | 'intent'
  | 'snapshot';
```

## 3. 编码分段

| 段位       | 阶段         | 说明                                      |
| ---------- | ------------ | ----------------------------------------- |
| `WKS-10xx` | `load`       | 工作区加载、快照读取、项目不存在          |
| `WKS-20xx` | `capability` | 能力协商、协议版本不匹配                  |
| `WKS-30xx` | `document`   | 文档级保存、文档类型、文档路径            |
| `WKS-40xx` | `sync`       | revision 冲突、过期写入、并发保存         |
| `WKS-50xx` | `intent`     | intent 分发、command envelope、patch 应用 |
| `WKS-90xx` | `snapshot`   | 自愈、未知工作区异常                      |

## 4. 已占用码位

### `WKS-1001` 工作区不存在

- Severity: `error`
- Stage: `load`
- Retryable: false
- Trigger: 请求的 workspace ID 无法解析到工作区快照
- User action: 返回项目列表并重新打开项目
- Developer notes: 检查 project 与 workspace 初始化、legacy project 自愈和路由参数

### `WKS-1002` 工作区快照损坏

- Severity: `error`
- Stage: `load`
- Retryable: false
- Trigger: workspace snapshot 缺少必需结构或无法反序列化
- User action: 尝试从历史版本恢复，或联系维护者修复数据
- Developer notes: 后端读取快照后应给出结构化诊断，不直接返回裸异常

### `WKS-2001` 能力协商不支持当前写入协议

- Severity: `error`
- Stage: `capability`
- Retryable: false
- Trigger: 前端尝试使用后端未声明支持的文档级保存、intent 或 graph patch 能力
- User action: 刷新页面或升级服务端
- Developer notes: 前端必须读取 capabilities 后再启用高级保存链路

### `WKS-3001` 文档不存在

- Severity: `error`
- Stage: `document`
- Retryable: false
- Trigger: 保存、读取或 patch 的 `docId` 不存在
- User action: 刷新工作区文件树并重新选择文档
- Developer notes: 文档删除、路由切换和 autosave 队列必须处理悬空 docId

### `WKS-3002` 文档类型不支持该操作

- Severity: `error`
- Stage: `document`
- Retryable: false
- Trigger: 对非 PIR 文档执行 PIR patch，或对只读文档执行写入
- User action: 检查当前选中的文档类型
- Developer notes: intent handler 应在执行前校验 document kind 与 capability

### `WKS-4001` Workspace revision 冲突

- Severity: `warning`
- Stage: `sync`
- Retryable: true
- Trigger: 客户端提交的 `workspaceRev` 落后于服务端
- User action: 拉取最新工作区后重新应用改动
- Developer notes: UI 应展示冲突并避免静默覆盖远端内容

### `WKS-4002` Route revision 冲突

- Severity: `warning`
- Stage: `sync`
- Retryable: true
- Trigger: 客户端提交的 `routeRev` 落后于服务端
- User action: 刷新路由清单并重新保存
- Developer notes: 路由清单和页面文档保存应分区处理

### `WKS-4003` Content revision 冲突

- Severity: `warning`
- Stage: `sync`
- Retryable: true
- Trigger: 客户端提交的 `contentRev` 落后于服务端
- User action: 查看冲突详情，选择保留本地或远端改动
- Developer notes: autosave 应记录 base revision，避免过期写入覆盖新内容

### `WKS-5001` Intent 类型不支持

- Severity: `error`
- Stage: `intent`
- Retryable: false
- Trigger: `POST /api/workspaces/:id/intents` 收到未知 intent type
- User action: 升级编辑器或服务端，使双方协议一致
- Developer notes: intent type 必须在 API 文档、handler 和测试中同步登记

### `WKS-5002` Patch 应用失败

- Severity: `error`
- Stage: `intent`
- Retryable: false
- Trigger: command envelope 中的 patch path 无法应用到当前 workspace 文档
- User action: 刷新工作区并重新执行操作
- Developer notes: dry-run、validate、apply 三步都应保留同一个诊断 code

### `WKS-9001` Workspace 未知异常

- Severity: `error`
- Stage: `snapshot`
- Retryable: true
- Trigger: Workspace 加载、保存、同步或自愈中出现未分类异常
- User action: 重试操作；若复现，携带错误码和项目 ID 上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `WKS-2010`：客户端协议版本过低。
2. `WKS-3010`：文档路径非法。
3. `WKS-5010`：reverseOps 缺失导致命令无法进入历史栈。
4. `WKS-9010`：legacy workspace 自愈失败。
