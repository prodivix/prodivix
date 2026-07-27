# Binary Asset Diagnostic Codes

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Blob + Upload-aware Import + PNG Transform/ClamAV Isolated Delivery + Git/LFS + Runtime Import/Replace First Verticals Implemented
- ProductGateStatus：G2 In Progress
- 日期：2026-07-18
- Owner：`@prodivix/assets`、Workspace、Compiler、Backend blob adapter、Web composition

诊断 metadata、HTTP envelope、Execution event、log 与 artifact metadata 不得携带 blob bytes、base64、
signed URL、download token、bucket key、provider locator 或跨 Workspace existence 信息。

## 1. Materialization / Compiler

本节诊断由 Compiler、Workspace 与 Browser materialization 链路发布，使用 `domain: codegen` 或 `domain: workspace`。

### `AST-1001` canonical asset 缺少 verified materialization

- Severity: `error`
- Domain: `codegen` / `workspace`
- Stage: `materialization`
- Retryable: true
- Trigger: 编译、导出、预览或本地 blob 读取时，canonical asset document 没有可验证的 materialization
- User action: 确认该资源已完成上传与同步后重试；若仍不可用，重新导入该文件
- Developer notes: 只有授权 reader 的临时故障、对象尚未复制完成等外部状态可能改变时才应重试；不得回退到 Workspace inline payload、空文件或运行时 URL

### `AST-1002` 同一 asset document 收到多个 materialization

- Severity: `error`
- Domain: `codegen` / `workspace`
- Stage: `materialization`
- Retryable: false
- Trigger: 同一 asset document 在一次编译或提交中收到多个 materialization
- User action: 移除重复导入的同一资源副本后重新运行
- Developer notes: 候选集合必须先按 document identity 去重再进入 exact 校验，不得任选其一继续

### `AST-1003` materialization reference 与 Workspace identity 不一致

- Severity: `error`
- Domain: `codegen` / `workspace`
- Stage: `materialization`
- Retryable: false
- Trigger: materialization reference 与 Workspace 记录的 digest、size 或 media identity 不一致
- User action: 重新导入该资源，使 Workspace 记录与实际内容一致
- Developer notes: identity drift 一律 fail closed，不得按 reference 覆盖 canonical Workspace 记录

### `AST-1004` asset bytes 的 digest、size 或 materialization 形状无效

- Severity: `error`
- Domain: `codegen` / `workspace`
- Stage: `byte verification`
- Retryable: false
- Trigger: 读取到的 bytes 无法通过 digest/size 校验，或 materialization 结构非法
- User action: 重新上传该资源；若来自本地副本，先执行 Workspace 恢复再重试
- Developer notes: 本地 blob store 的 stored identity drift 使用该码；不得静默截断、补齐或改写 bytes

### `AST-1005` materialization 没有对应 canonical asset document

- Severity: `error`
- Domain: `codegen` / `workspace`
- Stage: `materialization`
- Retryable: false
- Trigger: materialization 指向的 asset document 不在本次 canonical Workspace 中
- User action: 移除失效引用，或重新导入对应资源
- Developer notes: 不得为孤立 materialization 生成产物条目或占位文件

### `AST-1101` active content 缺少 sanitizer 与 isolated-origin policy

- Severity: `error`
- Domain: `codegen`
- Stage: `public delivery`
- Retryable: false
- Trigger: 需要公开交付的 active content 资源没有可用 sanitizer 与 isolated-origin 策略
- User action: 改用受支持的媒体类型，或在交付配置中启用隔离源
- Developer notes: 不得降级为同源直接交付

### `AST-1102` download-only media 缺少 attachment-capable isolated origin

- Severity: `error`
- Domain: `codegen`
- Stage: `public delivery`
- Retryable: false
- Trigger: download-only 媒体没有可用的 attachment-capable isolated origin
- User action: 配置可用的隔离交付源后重试
- Developer notes: 该类媒体只能以 attachment 语义交付，不得内联渲染

## 2. Git binary / LFS projection

Git/LFS projection 遇到任一本节错误时阻断整次 tree，不发布 partial manifest、pointer 或 binary file。LFS object
upload 必须先于 working-tree/index mutation 完成，并返回 exact OID/size receipt；缺 uploader 使用 `AST-3001`
composition 边界，receipt identity drift 使用 `AST-2003`，两者都不能提交 provider locator、signed URL 或 token。

### `AST-1201` canonical Asset 缺少 exact verified materialization

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: true
- Trigger: Git/LFS 投影时 canonical Asset 没有 exact verified materialization
- User action: 等待资源同步完成后重新投影；若长期不可用，重新导入该资源
- Developer notes: 阻断整次 tree，不发布 partial manifest、pointer 或 binary file

### `AST-1202` 同一 Asset document 收到重复 materialization

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: false
- Trigger: 一次投影中同一 Asset document 收到重复 materialization
- User action: 移除重复的资源副本后重新投影
- Developer notes: 重复 materialization 不允许按顺序取第一个继续

### `AST-1203` Asset reference、revision 或 materialization identity 无效或漂移

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: false
- Trigger: reference、revision 或 materialization identity 无效，或与本次 canonical source 漂移
- User action: 重新同步 Workspace 后再执行投影
- Developer notes: identity 必须来自同一 revision-bound source，不得跨 revision 拼接

### `AST-1204` Asset checkout path 冲突

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: false
- Trigger: document identity、checkout path、大小写或 reserved path 发生冲突
- User action: 重命名冲突资源后重新投影
- Developer notes: 大小写不敏感文件系统与 reserved path 都必须在写入前判定冲突

### `AST-1205` materialization 没有对应本次 canonical Asset source

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: false
- Trigger: materialization 不属于本次投影的 canonical Asset source
- User action: 重新同步 Workspace 后再执行投影
- Developer notes: 不得把上一轮 materialization 结果并入本次 tree

### `AST-1206` Asset 投影超出 hard budget

- Severity: `error`
- Domain: `workspace`
- Stage: `git projection`
- Retryable: false
- Trigger: 投影超过 Asset 数量或总字节 hard budget
- User action: 拆分资源集合或移除超大资源后重新投影
- Developer notes: 预算判定发生在写入之前，不得先写入再回滚

## 3. Backend blob boundary

授权读取把不存在与无权限统一为 not-found 边界；不得用 `AST-2002` 暴露其他 Workspace 中是否存在相同 digest。
upload-aware import 对 missing raw part 使用 `AST-2002`，对 duplicate/identity conflict 使用 `AST-2003`，对
unreferenced part、header/digest/media drift 与硬预算超限使用 `AST-2001`；所有校验在数据库写入前完成。

### `AST-2001` blob 上传请求无效

- Severity: `error`
- Domain: `backend`
- Stage: `blob boundary`
- Retryable: false
- Trigger: digest、media type、size、bytes、multipart 形状或 request budget 无效
- User action: 检查文件大小与类型限制后重新上传
- Developer notes: HTTP 413/422；含 unreferenced part、header/digest/media drift 与硬预算超限，校验在数据库写入前完成

### `AST-2002` 授权范围内找不到 blob

- Severity: `error`
- Domain: `backend`
- Stage: `blob boundary`
- Retryable: false
- Trigger: 授权读取找不到 blob，或 Workspace commit 引用了尚未上传的 blob
- User action: 先完成资源上传，再重新提交或重新打开该 Workspace
- Developer notes: HTTP 404/422；不存在与无权限统一为 not-found，不得暴露其他 Workspace 是否存在相同 digest

### `AST-2003` blob metadata 或 bytes 与请求冲突

- Severity: `error`
- Domain: `backend`
- Stage: `blob boundary`
- Retryable: false
- Trigger: 同一 Workspace/digest 的已存 metadata 或 bytes 与本次请求冲突
- User action: 确认要保留的版本后重新导入
- Developer notes: HTTP 409；LFS receipt identity drift 同样使用该码

### `AST-2004` 旧 JSON-only import 未使用 upload-aware protocol

- Severity: `error`
- Domain: `backend`
- Stage: `blob boundary`
- Retryable: false
- Trigger: 含 Asset 的旧 JSON-only local import 未使用 upload-aware protocol
- User action: 使用当前版本的导入入口重新导入项目
- Developer notes: HTTP 422；不得为兼容旧 payload 接受内联 base64 资源

## 4. Composition 与 isolated delivery

本地 Workspace 已接独立 IndexedDB local blob adapter；其缺失引用发布 `AST-1001`、stored identity drift 发布
`AST-1004`、同 Workspace/digest media conflict 发布 `AST-2003`。`AST-3001` 现在只表示当前 composition 没有
可授权的 Backend/local adapter，仍不能通过恢复 `dataUrl`/base64 保存态来绕过。

### `AST-3001` 当前 composition 没有授权的 blob materialization adapter

- Severity: `error`
- Domain: `workspace`
- Stage: `composition`
- Retryable: true
- Trigger: 当前 Browser、Export、Test 或 Run composition 没有可授权的 blob materialization adapter
- User action: 重新登录或等待 Workspace 同步完成后重试
- Developer notes: 不得通过恢复 `dataUrl`/base64 保存态绕过；缺 LFS uploader 也使用该码

### `AST-3002` 目标位置已存在同名 Asset

- Severity: `error`
- Domain: `workspace`
- Stage: `composition`
- Retryable: false
- Trigger: 在 Public 资源中创建或导入 Asset 时，目标目录已存在同名条目
- User action: 重命名文件，或先删除同名条目后重新导入
- Developer notes: 与 `AST-3001` 的创建失败分开上报；后端同 Workspace/digest 冲突继续使用 `AST-2003`

### `AST-3101` 隔离交付宿主暂不可用

- Severity: `error`
- Domain: `backend`
- Stage: `delivery`
- Retryable: true
- Trigger: Host、scanner readiness、病毒库时效、策略锁或有界 session capacity 不可用
- User action: 稍后重试；若持续失败，联系管理员确认交付宿主状态
- Developer notes: daemon error、timeout、connection/protocol failure、stale database 与 runtime policy drift 都归入该码，不回显 scanner 私有描述

### `AST-3102` 交付被 transform、媒体或内容策略拒绝

- Severity: `error`
- Domain: `backend`
- Stage: `delivery`
- Retryable: false
- Trigger: transform、media 或 content policy 拒绝交付，或 scanner 判定 quarantine
- User action: 更换资源或改用受支持的媒体类型后重新上传
- Developer notes: quarantine 只发布固定 `AST-3102`，不透传 signature name、源 bytes 或攻击载荷

### `AST-3103` 隔离交付响应 identity 漂移

- Severity: `error`
- Domain: `backend`
- Stage: `delivery`
- Retryable: false
- Trigger: Host 响应、capability URL、TTL 或 digest/media/dimension identity 漂移
- User action: 刷新页面重新获取交付地址；若仍失败，重新导入该资源
- Developer notes: identity 漂移必须 fail closed，不得使用已失效的 capability URL 继续交付

## 5. Scanner finding codes

PNG structural scanner 的内部 finding code 为 `AST-SCAN-PNG-IDENTITY`、`AST-SCAN-PNG-NONCANONICAL` 与
`AST-SCAN-PNG-INVALID`；ClamAV malware adapter 只发布固定 `AST-SCAN-MALWARE-DETECTED`，不会透传 signature
name。这些 finding code 只在交付管线内部使用，对外仍统一映射为 `AST-3101` 或 `AST-3102`，不把 scanner 私有描述、
源 bytes、攻击载荷或基础设施细节回显。
