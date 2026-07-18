# Binary Asset Diagnostic Codes

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Blob + Upload-aware Import + PNG Transform/ClamAV Isolated Delivery + Git/LFS + Runtime Import/Replace First Verticals Implemented
- ProductGateStatus：G2 In Progress
- 日期：2026-07-18
- Owner：`@prodivix/assets`、Workspace、Compiler、Backend blob adapter、Web composition

诊断 metadata、HTTP envelope、Execution event、log 与 artifact metadata 不得携带 blob bytes、base64、
signed URL、download token、bucket key、provider locator 或跨 Workspace existence 信息。

## Materialization / Compiler

| Code       | Severity | Stage             | Retryable | 含义                                                                     |
| ---------- | -------- | ----------------- | --------- | ------------------------------------------------------------------------ |
| `AST-1001` | error    | materialization   | true      | canonical asset 缺少 verified materialization                            |
| `AST-1002` | error    | materialization   | false     | 同一 asset document 收到多个 materialization                             |
| `AST-1003` | error    | materialization   | false     | materialization reference 与 Workspace digest/size/media identity 不一致 |
| `AST-1004` | error    | byte verification | false     | bytes 的 digest/size 或 materialization shape 无效                       |
| `AST-1005` | error    | materialization   | false     | materialization 没有对应 canonical asset document                        |
| `AST-1101` | error    | public delivery   | false     | active content 缺少 sanitizer 与 isolated-origin policy                  |
| `AST-1102` | error    | public delivery   | false     | download-only media 缺少 attachment-capable isolated origin              |

`AST-1001` 只有在授权 reader 的临时故障、对象尚未复制完成等外部状态可能改变时才应重试；不得回退到
Workspace inline payload、空文件或运行时 URL。

## Git binary / LFS projection

| Code       | Severity | Retryable | 含义                                                          |
| ---------- | -------- | --------- | ------------------------------------------------------------- |
| `AST-1201` | error    | true      | canonical Asset 缺少 exact verified materialization           |
| `AST-1202` | error    | false     | 同一 Asset document 收到重复 materialization                  |
| `AST-1203` | error    | false     | reference/revision/materialization identity 无效或漂移        |
| `AST-1204` | error    | false     | document identity、checkout path、大小写或 reserved path 冲突 |
| `AST-1205` | error    | false     | materialization 没有对应本次 canonical Asset source           |
| `AST-1206` | error    | false     | projection 超过 Asset 数量或总字节 hard budget                |

Git/LFS projection 遇到任一上述错误时阻断整次 tree，不发布 partial manifest、pointer 或 binary file。LFS object
upload 必须先于 working-tree/index mutation 完成，并返回 exact OID/size receipt；缺 uploader 使用 `AST-3001` composition
边界，receipt identity drift 使用 `AST-2003`，两者都不能提交 provider locator、signed URL 或 token。

## Backend blob boundary

| Code       | HTTP    | Severity | Retryable | 含义                                                                    |
| ---------- | ------- | -------- | --------- | ----------------------------------------------------------------------- |
| `AST-2001` | 413/422 | error    | false     | digest、media type、size、bytes、multipart shape 或 request budget 无效 |
| `AST-2002` | 404/422 | error    | false     | 授权读取找不到 blob，或 Workspace commit 引用了未上传 blob              |
| `AST-2003` | 409     | error    | false     | 同一 Workspace/digest 的已存 metadata/bytes 与请求冲突                  |
| `AST-2004` | 422     | error    | false     | 含 Asset 的旧 JSON-only local import 未使用 upload-aware protocol       |

授权读取把不存在与无权限统一为 not-found 边界；不得用 `AST-2002` 暴露其他 Workspace 中是否存在相同 digest。
upload-aware import 对 missing raw part 使用 `AST-2002`，对 duplicate/identity conflict 使用 `AST-2003`，对
unreferenced part、header/digest/media drift 与硬预算超限使用 `AST-2001`；所有校验在数据库写入前完成。

## Composition

| Code       | Severity | Stage       | Retryable | 含义                                                                    |
| ---------- | -------- | ----------- | --------- | ----------------------------------------------------------------------- |
| `AST-3001` | error    | composition | true      | 当前 Browser/Export/Test/Run 没有授权 blob materialization adapter      |
| `AST-3101` | error    | delivery    | true      | Host、scanner readiness/病毒库时效/策略锁或有界 session capacity 不可用 |
| `AST-3102` | error    | delivery    | false     | transform/media/content policy 拒绝交付或 scanner 判定 quarantine       |
| `AST-3103` | error    | delivery    | false     | Host 响应、capability URL、TTL、digest/media/dimension identity 漂移    |

本地 Workspace 已接独立 IndexedDB local blob adapter；其缺失引用发布 `AST-1001`、stored identity drift 发布
`AST-1004`、同 Workspace/digest media conflict 发布 `AST-2003`。`AST-3001` 现在只表示当前 composition 没有
可授权的 Backend/local adapter，仍不能通过恢复 `dataUrl`/base64 保存态来绕过。

PNG structural scanner 的内部 finding code 为 `AST-SCAN-PNG-IDENTITY`、`AST-SCAN-PNG-NONCANONICAL` 与
`AST-SCAN-PNG-INVALID`；ClamAV malware adapter 只发布固定 `AST-SCAN-MALWARE-DETECTED`，不会透传 signature
name。Backend 对 quarantine 只发布固定 `AST-3102`，对 daemon error、timeout、connection/protocol failure、
stale database 与 runtime policy drift 发布 `AST-3101`，不把 scanner 私有描述、源 bytes、攻击载荷或
基础设施细节回显。
