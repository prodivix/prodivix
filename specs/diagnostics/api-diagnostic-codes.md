# Backend/API Diagnostics 编码规范（API）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `apps/backend/README.md`
  - `specs/api/workspace-sync.openapi.yaml`

## 1. 范围

`API-xxxx` 覆盖后端 HTTP、鉴权、权限、请求形状、持久化、第三方集成和服务端未知异常。

不覆盖：

1. Workspace 协议语义错误，优先使用 `WKS-xxxx`。
2. PIR 文档结构错误，优先使用 `PIR-xxxx`。
3. AI Provider 业务错误，使用 `AI-xxxx`。

## 2. 阶段

```ts
type ApiDiagnosticStage =
  | 'request'
  | 'auth'
  | 'permission'
  | 'validation'
  | 'persistence'
  | 'integration';
```

## 3. 编码分段

| 段位       | 阶段          | 说明                         |
| ---------- | ------------- | ---------------------------- |
| `API-10xx` | `request`     | 请求格式、参数、content type |
| `API-20xx` | `auth`        | 登录、会话、Token            |
| `API-30xx` | `permission`  | 项目、工作区、资源权限       |
| `API-40xx` | `validation`  | 后端业务校验                 |
| `API-50xx` | `persistence` | 数据库、事务、迁移           |
| `API-60xx` | `integration` | GitHub App、OAuth、外部平台  |
| `API-90xx` | `integration` | 后端未知异常                 |

## 4. 已占用码位

### `API-1001` 请求体无法解析

- Severity: `error`
- Stage: `request`
- Retryable: false
- Trigger: JSON 请求体格式错误或 content type 不匹配
- User action: 刷新页面后重试；若复现，携带错误码上报
- Developer notes: 后端响应应包含稳定 code，不直接暴露 JSON parser 原文给普通用户

### `API-1002` 请求参数缺失

- Severity: `error`
- Stage: `request`
- Retryable: false
- Trigger: 必需 path、query 或 body 参数缺失
- User action: 重新执行操作
- Developer notes: OpenAPI、前端 client 和后端 handler 必须保持参数契约一致

### `API-2001` 用户未登录

- Severity: `error`
- Stage: `auth`
- Retryable: true
- Trigger: 需要登录的接口没有有效会话
- User action: 重新登录后继续操作
- Developer notes: 前端应跳转登录或展示会话过期提示

### `API-2002` 会话已过期

- Severity: `warning`
- Stage: `auth`
- Retryable: true
- Trigger: 会话或 Token 过期
- User action: 重新登录
- Developer notes: 刷新 token 失败后使用该诊断

### `API-3001` 权限不足

- Severity: `error`
- Stage: `permission`
- Retryable: false
- Trigger: 当前用户无权读取或修改目标资源
- User action: 请求资源所有者授权，或切换账号
- Developer notes: 不在 message 中泄露资源是否存在的敏感信息

### `API-4001` 后端业务校验失败

- Severity: `error`
- Stage: `validation`
- Retryable: false
- Trigger: 请求形状合法，但不满足业务规则
- User action: 根据提示修改输入后重试
- Developer notes: 具体域错误应优先使用 `PIR-xxxx`、`WKS-xxxx` 等更细 code

### `API-4004` 资源不存在或不可见

- Severity: `error`
- Stage: `validation`
- Retryable: false
- Trigger: 请求的用户、项目、绑定或开发入口不存在，或当前用户不可见
- User action: 返回列表刷新后重新选择资源
- Developer notes: 当资源存在性可能泄露权限信息时，仍使用该码位而不是区分 403/404 语义

### `API-4009` 业务冲突

- Severity: `error`
- Stage: `validation`
- Retryable: false
- Trigger: 请求本身合法，但与现有业务状态冲突，例如邮箱已注册
- User action: 修改输入或选择其他资源后重试
- Developer notes: Workspace revision 冲突必须使用 `WKS-400x`，不要折叠到该通用码位

### `API-5001` 数据库写入失败

- Severity: `error`
- Stage: `persistence`
- Retryable: true
- Trigger: 数据库事务、约束或连接导致写入失败
- User action: 稍后重试；若复现，联系维护者
- Developer notes: 日志保留底层错误，响应不暴露连接串或 SQL 参数

### `API-6001` 第三方集成调用失败

- Severity: `error`
- Stage: `integration`
- Retryable: true
- Trigger: GitHub、OAuth 或其他外部平台 API 调用失败
- User action: 检查授权状态或稍后重试
- Developer notes: meta 可包含 provider 和 operation，不包含 access token

### `API-9001` 后端未知异常

- Severity: `error`
- Stage: `integration`
- Retryable: true
- Trigger: 后端处理请求时出现未分类异常
- User action: 重试操作；若复现，携带错误码和请求时间上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `API-2010`：CSRF 校验失败。
2. `API-3010`：项目成员角色不满足操作要求。
3. `API-5010`：数据库迁移未完成。
4. `API-6010`：GitHub App installation 不存在。
