# @prodivix/backend

Prodivix 的 Go 后端服务，基于 Gin 与 PostgreSQL，提供鉴权、项目元数据、社区发布投影、第三方集成和 Canonical Workspace VFS 的远端持久化边界。

当前产品阶段为 **G1 Passed / G2 Foundation**。后端已经完成 G0 所需的 Atomic WorkspaceOperation Commit、Settings Commit、revision partition、强幂等 replay 与 Workspace 语义校验，并在 G2 承载用户授权的 Remote Runner gateway 与 production Environment/Secret store；它不提供第二套 Intent 或直接 document PATCH 写入协议。

## 目录结构

```text
apps/backend/
├── cmd/server/                 # 服务入口
├── internal/
│   ├── app/                    # 依赖装配与路由聚合
│   ├── config/                 # 环境配置
│   ├── modules/
│   │   ├── auth/              # 用户、会话与认证 API
│   │   ├── environment/       # Environment revision、加密 Secret 与 resolution grant
│   │   ├── integrations/      # GitHub App 等第三方集成
│   │   ├── project/           # 项目元数据、社区查询与发布投影
│   │   ├── remoteexecution/   # 用户授权的 Remote Runner gateway 与 execution grant
│   │   └── workspace/         # Workspace snapshot、Atomic Commit 与语义校验
│   └── platform/
│       ├── database/          # PostgreSQL 连接与启动时迁移
│       └── http/              # CORS、中间件与错误响应
├── server.go
├── Dockerfile
├── docker-compose.yml
├── go.mod
└── go.sum
```

## Workspace 写入边界

浏览器端的完整链路是：

```text
Command / Transaction
  -> durable operation outbox
  -> POST /api/workspaces/:workspaceId/operations/commit
  -> one PostgreSQL transaction
  -> confirmed revisions + mutation response
```

Settings 使用独立的 durable outbox 与 `POST /api/workspaces/:workspaceId/settings/commit`，但遵循相同的 exact-request persistence 和强幂等要求。

后端 Workspace 模块负责：

- 校验 Atomic Commit wire contract、operation identity、write set 与 capability。
- 在一个数据库事务内应用 VFS tree、Route Manifest、document content / metadata 和 operation log 变更。
- 按 `workspaceRev`、`routeRev`、document `contentRev/metaRev` 执行乐观并发检查，并以明确冲突响应拒绝过期请求。
- 对同一个 operation id 执行强幂等 replay；同 id 不同 request hash 会被拒绝。
- 校验 Workspace VFS、Route Manifest 与 PIR graph 语义。TypeScript 侧的 canonical validator owner 是 `@prodivix/workspace`、`@prodivix/router` 与 `@prodivix/pir`；Go 实现保持 wire 与语义上的 conformance-equivalent 边界。

旧 document `PATCH`、`POST /intents`、Project PIR 作者态读写和 post-commit Project mirror 已被 Hard Cut。`internal/modules/workspace/patch*.go` 仅是 Atomic Commit 内部的受校验 patch 应用器，不是公开直写入口。

## 读取、创建与发布

- `GET /api/workspaces/:workspaceId` 返回后端 wire snapshot，Web 通过 `@prodivix/workspace` codec 解码为 canonical `WorkspaceSnapshot`。
- `GET /api/workspaces/:workspaceId/capabilities` 声明当前服务支持的 commit contract。
- fresh project 与 `import-local-project` 在同一数据库事务中创建 Project metadata、Workspace、Route、Settings 与 Documents；upload-aware local import 还在该事务中插入 verified binary blobs。无 Asset 请求保持 JSON，Asset 请求使用一个 reference-only JSON manifest 与 digest-named raw multipart parts；失败时整体回滚。
- 社区 PIR 只在显式 publish 时由 canonical Workspace 生成 `published_pir_json` 投影。该投影不参与编辑器加载、保存或 Workspace 恢复。

## 常用命令

```bash
go mod download
pnpm dev:backend
pnpm dev:backend:hot
cd apps/backend && go build ./...
cd apps/backend && go test ./...
cd apps/backend && go fmt ./...
```

## Remote Runner gateway

配置 `REMOTE_RUNNER_CONTROL_PLANE_URL` 与仅服务端可见的
`REMOTE_RUNNER_CONTROL_PLANE_TOKEN` 后，Backend 暴露认证后的
`POST /api/remote-executions` 和 artifact content proxy。create 前必须通过 Workspace owner
校验；成功后 execution grant 持久化到 PostgreSQL，后续 status/events/cancel/artifact 请求均按
当前用户校验。Control Plane token 不进入 Web、Workspace、ExecutionRequest、日志或 artifact。

每个 create 还会由 Backend 在 exact Workspace owner preflight 后，于受信 service request header 中附加短期
server authority attestation：只包含 `prodivix-product-session` 的 principal id、当前唯一 allowed
`workspace.owner` permission、exact Workspace/snapshot identity 与 expiry，不包含 product
session id、Bearer、cookie、Control Plane token 或 Secret。`REMOTE_RUNNER_EXECUTION_AUTHORITY_TTL` 默认
`2m` 且最多 `5m`，实际 expiry 不晚于当前 product session。Control Plane 将它与 execution 原子持久化，
只在有效 Worker claim 中按 execution/worker/attempt 投影；公开 envelope、request、snapshot、event、log 与
artifact 均不携带该 authority。

isolated Server Function Secret first vertical 还要求 Backend 与 Control Plane 配置同一条独立、仅服务间可见的
`REMOTE_RUNNER_SECRET_BROKER_TOKEN` / `REMOTE_CONTROL_PLANE_SECRET_BROKER_TOKEN`，Control Plane 的
`REMOTE_CONTROL_PLANE_SECRET_BROKER_URL` 指向 Backend origin。内部
`POST /api/internal/remote-execution-secrets` 只接受该 credential；Backend 会重检 exact execution/session/snapshot/
code/environment revision，签发 30 秒 `remote-isolated/isolated-runner/server` grant，并把 material直接密封给
Worker 的临时 X25519 key。数据库只保存当前 worker attempt 的 ciphertext envelope 与 one-shot replay identity；更高
attempt reclaim 同一 read-only function/invocation 时会原子清除旧 envelope并绑定新 recipient，旧/同 attempt drift不能
完成或重放。token、grant 与明文不进入 claim、snapshot、request、event、artifact 或响应日志。

Remote Preview 运行期间还可通过认证后的
`/api/remote-executions/:executionId/terminal-sessions` 路径打开、恢复和操作短期 Terminal session。
Backend 每次先按当前 user/session 重检 durable execution owner；open/resume 只在服务端使用 Control Plane
credential，Web 只收到短期 Terminal token。后续 read/write/resize/signal/close 将 product
`Authorization` 保留给 Backend，并通过独立 `X-Prodivix-Terminal-Token` 转发短期 token。Backend 不保存
该 token，严格校验 request/response envelope，并拒绝任何 service credential 或 token 回显。

带 `ExecutionEnvironmentSnapshotRef` 的 create 会在转发 Control Plane 前，以当前 authenticated
principal/session 对 exact Workspace、environment revision 与 mode 做 fail-closed preflight。create
成功后，Backend 将 exact `snapshotId`、partition revisions、session 与 reference 绑定到 durable
execution authority；环境绑定 execution 的
status、cancel、events、artifact 与 Preview materialization 不能由同一用户的其他 session 重放。
幂等 create 若返回已有 execution 但 authority 不一致，会返回 `409 EXE-4009`，且不会误取消原 execution。
该绑定不包含 Secret material，Worker 仍不能解析 Secret。

环境绑定的 live execution 可通过
`POST /api/remote-executions/:executionId/data-sources/:documentId/operations/:operationId/invoke`
调用第一条 Remote server HTTP gateway。Gateway 只读取 execution authority 中 exact content revision
匹配的 Canonical `data-source` 文档，当前接受 `core.http` 的 `server` / `edge` query，以及
POST/PUT/PATCH/DELETE mutation first vertical，并在当前
principal/session 下签发最长 30 秒的 exact binding/field grant。Secret 仅在 outbound HTTP callback
内成为 Authorization header；API result 与 `network.request` 只返回 JSON value、explicit empty、
origin/status/size/correlation。目标必须是公网 HTTPS，redirect、ambient proxy、loopback、private、
link-local、metadata 与 reserved address 均 fail closed。generated Remote Preview 到该入口的安全 bridge
已由编辑器父窗口持有 product token 并调用该入口；opaque sandbox iframe 只发送 value-only strict
invocation envelope，且只接收 strict result/metadata-only Network response。Preview Host、生成源码和
iframe 均不接触 product token、Backend/Control Plane credential、environment identity 或 Secret material。
mutation 在 effect 前写入 PostgreSQL replay ledger：key 绑定 execution/document/operation/
invocation，SHA-256 request fingerprint 绑定 exact snapshot/environment/input/method/endpoint/sequence。
相同且已成功的 invocation 只返回已持久化的脱敏结果；identity drift、并发 pending，以及进程/网络
中断留下的 indeterminate outcome 均在再次访问上游前 fail closed。operation 只有同时声明
`policies.idempotency.kind = invocation-key`、bounded retry policy 与 public `idempotencyHeader` adapter
mapping 时，Gateway 才会生成不含 input/Secret/identity 明文的 opaque SHA-256 key，并在所有 attempt
复用该 header。v3 ledger 记录 current/max attempt；retryable outcome 只能原子释放给紧邻的下一 attempt，
并发、跳号、contract drift 与超预算均在 effect 前拒绝。未声明该 contract 的 mutation 仍固定 attempt 1。
该能力依赖上游实际遵守 idempotency header，不是 distributed exactly-once 声明。
ledger 每个 execution 最多保留 256 个 identity，可重放 JSON result 受约 1.25 MiB 硬预算约束；容量拒绝
发生在 effect 前，ledger 随 execution authority 删除而级联清理。

Auth/Server live action 使用
`POST /api/remote-executions/:executionId/server-functions/:artifactId/:exportName/invoke`。read 继续只开放
`core.auth.current-principal`、`core.auth.require-workspace-owner` 与审计过的
`core.server.hmac-sha256`；mutation 只开放
`core.server.execution-state.put` 的 authenticated route-action/server/invocation-key 组合。mutation 请求必须
同时携带 exact `BACKEND_ALLOWED_ORIGINS` Origin 与
`X-Prodivix-Server-Function-Intent: mutation-v1`，并绑定 exact execution session、snapshot 和 code revision。
adapter 只把 typed Route action JSON 的 `{ key, value }` 写入 execution/function partition，不加载项目源码、
不访问网络/Secret，也不写 Canonical Workspace。state revision 与 replay result 在同一 PostgreSQL transaction
提交；origin 与 canonical input 均进入 SHA-256 identity。exact duplicate 返回首次结果，identity drift、取消、
credential echo 与 state/replay 256 条容量耗尽均在重复 effect 前 fail closed；两张表随 execution authority
删除级联清理。

HMAC read 只接受 authenticated route-action/server/read 与 exact `environment.secretsByField.key` SecretRef。
execution 必须绑定 live environment revision；Gateway 为 exact principal/session/workspace/environment/
execution/function/invocation/binding/field 签发最多 30 秒且不超过 session expiry 的 grant，只在
`UseSecret` callback 内对 canonical JSON submission value 计算 HMAC-SHA256，随后立即 revoke。响应只包含
algorithm 与 hex digest；项目源码、Secret、grant、session 和 binding identity 都不进入响应。Browser/Test/
isolated target 与其他 adapter 声明 environment privilege 时在 Compiler/Gateway 双层 fail closed。

`REMOTE_RUNNER_GATEWAY_TIMEOUT` 默认 `30s`。生产 Control Plane URL 必须使用 HTTPS；仅
localhost/loopback 开发环境允许 HTTP。

配置 `REMOTE_PREVIEW_HOST_URL`、`REMOTE_PREVIEW_PUBLIC_BASE_URL`、仅服务端可见的
`REMOTE_PREVIEW_HOST_TOKEN`、`REMOTE_PREVIEW_HOST_TIMEOUT` 与
`REMOTE_PREVIEW_SESSION_TTL` 后，Backend 还会暴露
`POST /api/remote-executions/:executionId/artifacts/:artifactId/preview-sessions`。该入口先重检
execution owner，再从 Control Plane 解析权威 descriptor 与 artifact，交叉验证 ready/healthy、scope、
expiry、snapshot、media type、size、ETag 与实际 SHA-256，最后交给独立 Preview Host。Host 返回的
capability origin 必须属于配置的公网域名后缀。Web 只收到短期 origin，不会收到两类服务凭据。

配置 `ASSET_DELIVERY_HOST_URL`、`ASSET_DELIVERY_PUBLIC_BASE_URL`、仅服务端可见的
`ASSET_DELIVERY_HOST_TOKEN`、`ASSET_DELIVERY_HOST_TIMEOUT` 与 `ASSET_DELIVERY_SESSION_TTL` 后，
Backend 暴露 `POST /api/workspaces/:workspaceId/asset-blobs/:digest/delivery-sessions`。该入口先校验
Workspace owner 并读取 exact canonical blob，再把 bytes 交给独立 Asset Delivery Host。PNG 与 baseline JPEG
请求按 exact media/transform 进入各自 deterministic sanitizer、structural + ClamAV scanner chain 与
derived-cache pipeline；两者仅允许 inline。JPEG 的渐进式、算术编码、CMYK、非默认 EXIF orientation 与
malformed/over-budget 输入 fail closed；allowlisted 其他 attachment 也必须通过 ClamAV。daemon error、timeout、
connection/protocol failure 均 fail closed，Host 不创建
capability session。Host 返回的短期 URL 必须属于配置的 wildcard
capability origin，否则 Backend 以 `AST-3103` fail closed。Backend 不接受 Host 重定向，Web 不接触
internal token，delivery URL 永不写回 Workspace。

## Binary Asset orphan retention

常规 Asset upload 与引用它的 Workspace Operation 是两个有序但独立的 durable 操作。Backend 使用
`workspace_asset_blobs.unreferenced_since` 区分当前引用与 orphan：`NULL` 表示至少一个 current Asset document
仍引用该 Workspace-local digest，时间戳表示 orphan grace window 的起点。引用 commit 与 dereference 都在已锁定
的 Workspace authoring transaction 内更新该标记；delete/replace 只开始新的 retention window，不同步删除 bytes。

服务启动后立即执行一次有界 sweep，随后按 interval 运行。sweep 使用与 Atomic Workspace Operation 相同的
Workspace row lock，并通过 `SKIP LOCKED` 跳过正在 authoring 的 Workspace；再次核对 exact
`(workspace_id, digest)` reference 后才会删除严格早于 cutoff 的 orphan。日志只包含 Workspace/blob/byte aggregate，
不包含 owner、Workspace、document 或 digest identity。配置项与默认值：

- `BACKEND_ASSET_BLOB_ORPHAN_RETENTION=168h`
- `BACKEND_ASSET_BLOB_SWEEP_INTERVAL=1h`
- `BACKEND_ASSET_BLOB_SWEEP_WORKSPACE_LIMIT=32`（上限 `1024`）
- `BACKEND_ASSET_BLOB_SWEEP_BLOB_LIMIT=256`（上限 `4096`）

相同 exact-byte orphan 的授权 PUT retry 会刷新 grace window；仍被引用的 blob 保持 `NULL`，不会被 retry
误标为 orphan。所有值必须为正且满足 hard limit，否则 Backend 启动 fail closed。

## Environment / Secret store

设置 `BACKEND_ENVIRONMENT_SECRET_KEY` 为 base64 编码的 32 字节随机 key 后，Backend 启用
production Environment/Secret store。未配置或 key 无效时，Environment API 保持 fail closed 并返回
`503 ENV-5001`；不会使用默认 key 或明文降级。

`PUT /api/workspaces/:workspaceId/environments/:environmentId` 创建 immutable revision。public binding
以 JSON 保存，`secretsById` 仅在请求边界进入内存，并使用 AES-256-GCM 与绑定
workspace/environment/revision/binding 的 authenticated context 加密后写入 PostgreSQL。响应和
`GET` 仅包含 `secretBindingIds`，不返回 Secret material，并强制 `private, no-store`。

运行时授权以 principal、认证 session、Workspace、environment revision、provider、runtime zone、
purpose、binding 和 adapter field 形成最长五分钟的 durable grant。Secret 只能通过 store 的
callback boundary 使用；grant/session/field 不完全匹配、过期或 revoke 均拒绝。durable audit 只保存
identity metadata，不保存明文。Remote Data HTTP gateway 已组合 exact execution authority 与该 store；
Remote Server Function HMAC gateway 也复用同一 IssueGrant/UseSecret/Revoke 与 durable audit boundary。
client-only target 仍不得解析 Secret，Worker、snapshot、artifact 与 Preview 静态文件也不接收 material。

## 数据库

- 主数据库为 PostgreSQL，驱动使用 `pgx`。
- 当前迁移语句位于 `internal/platform/database/database.go`，服务启动时执行。
- 本地开发可在 `apps/backend` 中运行 `docker compose up -d`。
- 默认连接串为 `postgres://postgres:postgres@localhost:5432/prodivix?sslmode=disable`。
- Windows 原生开发脚本读取仓库根目录 `.env.local`；可从 `.env.example` 复制后设置 `BACKEND_DB_URL`。
- Environment/Secret 表由同一启动迁移创建；生产部署必须从 Secret manager 注入
  `BACKEND_ENVIRONMENT_SECRET_KEY`，不得提交到仓库或写入 Workspace。
- Remote mutation replay 的真实数据库 Gate 读取 `PRODIVIX_BACKEND_POSTGRES_TEST_URL`，在随机 schema
  内执行完整 migration，并验证跨连接同 identity claim、最后一个容量槽、success replay、identity drift、
  indeterminate fence 与 execution authority 级联清理。运行方式：

  ```powershell
  $env:PRODIVIX_BACKEND_POSTGRES_TEST_URL = $env:BACKEND_DB_URL
  go test ./internal/modules/remoteexecution -run '^TestDataGatewayMutationReplayPostgreSQLGate$' -count=1 -v
  ```

- Auth/Server live mutation 使用同一变量和独立随机 schema，验证 execution-scoped state 与 invocation replay
  的单事务提交、24-way exact replay 并发、identity drift、取消、state/replay 双容量预算及 execution authority
  级联清理：

  ```powershell
  $env:PRODIVIX_BACKEND_POSTGRES_TEST_URL = $env:BACKEND_DB_URL
  go test ./internal/modules/remoteexecution -run '^TestServerFunctionLiveMutationPostgreSQLGate$' -count=1 -v
  ```

- Isolated Secret attempt recovery 同样使用独立随机 schema，并发提交 attempt 2-8，验证只有最高 attempt 保留为
  current pending row、旧 ciphertext 被清除、旧 attempt 无法延迟 complete/replay，最终 envelope 只对最高 attempt
  exact retry 可见：

  ```powershell
  $env:PRODIVIX_BACKEND_POSTGRES_TEST_URL = $env:BACKEND_DB_URL
  go test ./internal/modules/remoteexecution -run '^TestIsolatedSecretResolutionPostgreSQLAttemptRecoveryGate$' -count=1 -v
  ```

- Binary Asset retention 使用同一变量和独立随机 schema，验证 reference protection、跨 Workspace isolation、
  first-observed orphan、strict cutoff、durable dereference grace 与 authoring lock fence：

  ```powershell
  $env:PRODIVIX_BACKEND_POSTGRES_TEST_URL = $env:BACKEND_DB_URL
  go test ./internal/modules/workspace -run '^TestWorkspaceAssetBlobRetentionPostgreSQLGate$' -count=1 -v
  ```

- GitHub `G2 PostgreSQL Gates` 同时运行 Data replay、Server Function live mutation、Binary Asset retention 三个 Backend Gate 与
  `@prodivix/runtime-remote-postgres` Control Plane integration Gate；未提供数据库 URL 的普通
  `go test ./...` 会显式 skip 真实数据库用例。

完整协议与决策见：

- `specs/api/workspace-sync.openapi.yaml`
- `specs/decisions/35.canonical-workspace-hard-cut.md`
- `specs/decisions/36.atomic-workspace-operation-commit.md`
- `specs/roadmap/g0-closure-evidence.md`
