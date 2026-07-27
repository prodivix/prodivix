# Remote Execution Diagnostics 编码规范（EXE）

## 状态

- Draft
- 日期：2026-07-16
- Global Phase：G2 Executable Full-stack Workspace
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/40.execution-provider-and-job.md`
  - `specs/implementation/g2-execution-provider-remote-runner.md`

## 1. 范围

`EXE-xxxx` 覆盖 Remote Execution transport/client 的稳定失败与恢复语义。当前使用
`domain: workspace` 和 ExecutionRequest 的作者态 target；供应商错误、堆栈、credential、URL
和 Secret 不进入 diagnostic message、hint 或 meta。

## 2. 已占用码位

Client 只按稳定 error taxonomy 选择 code 和固定用户消息，不复制 provider message。

### `EXE-4001` 远端执行协议版本不受支持

- Severity: `error`
- Domain: `workspace`
- Stage: `protocol`
- Retryable: false
- Trigger: 远端 runner 声明的协议版本不在客户端支持集合内
- User action: 升级编辑器或联系管理员升级远端 runner 后重试
- Developer notes: 版本协商失败不得降级为“尽力解析”，必须在发出业务请求前 fail closed

### `EXE-4002` 远端请求或响应未通过严格 codec 校验

- Severity: `error`
- Domain: `workspace`
- Stage: `codec`
- Retryable: false
- Trigger: 远端 runner 拒绝了执行请求，或响应无法通过 strict wire codec 解码
- User action: 重新发起执行；若持续失败，携带错误码与操作上报
- Developer notes: 不得对未知字段做宽松解析，也不得把 codec 报文写入 diagnostic meta

### `EXE-4011` 远端执行需要授权

- Severity: `error`
- Domain: `workspace`
- Stage: `authorization`
- Retryable: false
- Trigger: 远端执行请求缺少有效授权
- User action: 重新登录后再次执行
- Developer notes: 不得携带 token、cookie 或 principal raw identity 进入 diagnostic

### `EXE-4031` 远端执行操作被拒绝

- Severity: `error`
- Domain: `workspace`
- Stage: `authorization`
- Retryable: false
- Trigger: 当前身份不允许在该 Workspace 上执行此远端操作
- User action: 联系 Workspace 所有者申请对应执行权限
- Developer notes: 拒绝原因只保留稳定 operation 与 capability 标识，不回显策略明细

### `EXE-4041` 远端执行或 artifact 未找到

- Severity: `error`
- Domain: `workspace`
- Stage: `resolution`
- Retryable: false
- Trigger: 远端 execution、artifact 或相关资源已不存在
- User action: 重新发起一次执行
- Developer notes: 不存在与无权限统一为 not-found 边界，避免枚举

### `EXE-4091` 远端请求幂等 identity 冲突

- Severity: `error`
- Domain: `workspace`
- Stage: `idempotency`
- Retryable: false
- Trigger: 请求的幂等 identity 与远端已存在的请求冲突
- User action: 重新发起一次新的执行，不要重复提交同一请求
- Developer notes: retry 必须复用原 `messageId` 与业务幂等键；不得为绕过冲突自造新 identity

### `EXE-4092` 需要按 authoritative status 恢复

- Severity: `error`
- Domain: `workspace`
- Stage: `recovery`
- Retryable: true
- Trigger: cursor、provider 或 status 不再连续，必须重新读取权威状态后恢复
- User action: 等待编辑器自动恢复；若长时间未恢复，重新打开执行面板
- Developer notes: 不得猜测缺失事件或终态；重新读取 authoritative status 并从确认 cursor 恢复

### `EXE-4291` 远端执行配额已超出

- Severity: `error`
- Domain: `workspace`
- Stage: `quota`
- Retryable: false
- Trigger: 远端执行超过当前配额
- User action: 等待配额恢复或联系管理员调整配额
- Developer notes: 不得用退避重试消耗剩余配额

### `EXE-5001` 远端 runner 不可用

- Severity: `error`
- Domain: `workspace`
- Stage: `transport`
- Retryable: true
- Trigger: 远端 runner 暂时不可用
- User action: 稍后重试
- Developer notes: 遵守 bounded exponential backoff，不得无限重放

### `EXE-5002` 远端 transport 请求超时

- Severity: `error`
- Domain: `workspace`
- Stage: `transport`
- Retryable: true
- Trigger: 远端 transport 请求在预算内没有返回
- User action: 稍后重试；若反复超时，检查网络后再执行
- Developer notes: 重试复用原 `messageId` 与业务幂等键，不得并发重放同一请求

### `EXE-5003` 已脱敏的远端内部失败

- Severity: `error`
- Domain: `workspace`
- Stage: `transport`
- Retryable: false
- Trigger: 远端 runner 内部失败，且只返回脱敏后的稳定错误分类
- User action: 是否值得重试以响应中的 `retryable` 标记为准；若不可重试，携带错误码与操作上报
- Developer notes: 本码位的实际 `retryable` 由稳定 wire taxonomy 决定，本页取保守默认值；不得复制 provider message、堆栈或 URL

### `EXE-5004` Secret 边界 fail closed

- Severity: `fatal`
- Domain: `backend`
- Stage: `secret boundary`
- Retryable: false
- Trigger: isolated Secret 解析不可用或被拒绝，或执行输出中检出受保护材料而被阻断
- User action: 检查环境与 Secret 配置后重新发起执行，不要重复运行同一次输出
- Developer notes: 该码同时覆盖 Secret broker 拒绝与 execution 输出泄漏拦截；只保留 surface 与固定终态原因，不写入受保护材料、token 或匹配位置

## 3. 安全与恢复规则

1. Client 只按稳定 error taxonomy 选择 code 和固定用户消息，不复制 provider message。
2. `EXE-4092` 出现时不得猜测缺失事件或终态；重新读取 authoritative status，并从确认 cursor 恢复。
3. retry 必须复用原 `messageId` 和业务幂等键，遵守 bounded exponential backoff；不得无限重放。
4. Remote provider 完成后仍复用本码表，不为 HTTP、WebSocket、queue 或容器供应商建立 UI 私有错误码。
