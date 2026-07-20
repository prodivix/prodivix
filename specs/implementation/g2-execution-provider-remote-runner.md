# G2 ExecutionProvider 与 Remote Runner 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：E0-E7 Implemented Locally / Current Rootless CI Evidence Pending
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-17
- Owner：`@prodivix/runtime-core`、`@prodivix/runtime-remote`、Remote Runner control plane / worker、composition root
- 关联：
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/decisions/40.execution-provider-and-job.md`
  - `specs/decisions/44.browser-test-execution-and-runtime-host.md`
  - `specs/decisions/45.data-operation-and-environment-reference-foundation.md`

## 目标

在不改变编辑器调用模型的前提下，让同一个 immutable `ExecutionRequest` 与同一个可验证的
Executable Project Snapshot 可以由 Browser 或 Remote Isolated Provider 执行。调用方只选择
capability、policy 与 runtime zone，不感知容器供应商、队列、WebSocket、进程管理或 artifact
存储实现。

G2 结束时，Preview、Test 与 Build 至少具备一个 Browser 实现和一个 Remote 实现；两者共享
request、job、session、event、diagnostic、artifact 与取消语义，并通过相同 conformance suite。

## 当前基础与缺口

### 已实现

- `@prodivix/runtime-core` 已拥有 transport-neutral `ExecutionProviderDescriptor`、
  `ExecutionRequest`、`ExecutionJob`、`ExecutionEvent` 与 instance-owned session coordinator。
- Browser Preview 与 Browser Test 使用独立 provider identity、capability 与 active job。
- Browser Runtime Host 已按 filesystem snapshot、dependency fingerprint 和 owner scope 管理 runtime。
- NodeGraph 与 Animation 已通过相同 Provider/Job 语义接入 same-context 执行。
- `ExecutionEnvironmentSnapshotRef`、`EnvironmentBindingReference` 与 `SecretRef` 已建立
  reference-only contract。
- `@prodivix/runtime-core` 已拥有 immutable `ExecutableProjectSnapshot` current contract、严格
  constructor/validation、显式 Build output plan、Remote static Preview plan 与 deterministic SHA-256
  content digest；Compiler 直接生产，Browser Preview/Test 与 Remote 只消费。`ExecutionBuildBundle`
  strict decoder 校验生成文件路径、顺序、base64、大小和逐文件 digest；`ExecutionPreviewBundle`
  在其上继续校验 HTML entrypoint。新增必填 Preview plan 后 wire format 提升为
  `prodivix.executable-project.v6`，current TypeScript model 继续保持无版本命名，不用默认值重解释
  旧 wire payload。
- `@prodivix/runtime-remote` 已拥有 versioned envelope、严格 request/response/event/snapshot codec、
  start/status/cancel/events/artifact client、版本协商、强幂等 identity、cursor recovery、bounded
  retry/backoff 与稳定、脱敏的 execution diagnostic mapping；in-memory control plane conformance
  覆盖重复、丢失响应、断线、乱序、缺口、provider drift 与 terminal regression。
- `@prodivix/runtime-remote` 已建立供应商中立 Remote ExecutionProvider projection：Preview、Test、
  Build 使用独立 descriptor，durable cursor replay 映射为 canonical Job log/diagnostic/artifact/trace
  与 terminal result，取消保持独立 idempotency identity。provider contract、event cursor/sequence 或
  state provider identity drift 时 fail closed。Build 已生成严格 `ExecutionBuildBundle`；Test 在可信
  Worker 边界通过独立 `@prodivix/runtime-vitest` 有界 adapter 把 sandbox 私有 Vitest JSON 转换为
  canonical `ExecutionTestReport`、report artifact 与 `test.report` durable trace，私有 schema 不进入
  Control Plane 或 Provider。Preview 按显式 `static-bundle` plan 生成并严格校验 HTML entrypoint、
  snapshot、target 与文件 digest，只有 canonical bundle 才发布 `ready/healthy` metadata。该结果不
  伪造可访问 URL。transport-neutral artifact resolver 已校验 grant expiry/scope、descriptor digest/size、
  下载字节与 Preview Bundle identity；注入式 HTTP envelope/content transport 与 Web bounded streaming
  adapter 已接通，且不转发 ambient credential。Backend auth gateway 按 Workspace owner 授权 create，
  durable 记录 execution grant，并在后续 get/cancel/events/artifact 与 content proxy 重检 owner；grant
  持久化失败会补偿 cancel，Control Plane service credential 不进入 Web。Web composition factory 只接收
  当前登录 session token。`apps/remote-preview-host` 通过 Backend 的 owner-scoped、digest-pinned 上传接收
  strict Preview Bundle，以 hash-only 短期 capability 子域形成每 session 独立 origin，支持多文件与 SPA
  document fallback，并施加 deny-by-default CSP、CSP sandbox、Permissions Policy、无缓存和无 Cookie 边界；
  Host 不持有 Control Plane credential。Remote provider 的 async artifact materialization 只增加短期 URI，
  不改变 durable artifact identity；Blueprint Run Mode 已显式提供 Browser/Remote selection。
- `@prodivix/runtime-remote` 已进一步建立 transport-neutral Control Plane Core：principal/scope
  authorization、atomic active quota、provider compatibility routing、content-addressed snapshot store、
  owner-scoped execution repository、FIFO claim、lease renewal/expiry takeover、fencing token、取消与
  terminal monotonicity。provider routing 后会对 authoritative upload/reference snapshot 的 profile
  capability requirements 再次校验，request 少报 capability 无法绕过；生产内存参考适配器及
  conformance 已落地，durable adapter 必须实现同一 repository/snapshot contract。
- `@prodivix/runtime-remote-postgres` 已实现该 contract 的 PostgreSQL adapter 与 migration：snapshot
  blob/grant 分离、tenant-scoped request uniqueness、owner advisory transaction lock 下的原子
  create/quota、FIFO `FOR UPDATE SKIP LOCKED` claim、lease expiry takeover、renew/transition fencing 与
  event cursor transaction。真实 PostgreSQL integration Gate 已覆盖并发 quota/create、跨连接 claim、
  lease expiry fencing、snapshot tenant grant 与事务回滚；当前由独立 HTTP service composition 使用。
- `apps/remote-runner-control-plane` 已组合独立 HTTP service：public Remote envelope 与 internal worker
  API 分路，client/worker credential 分离，worker token 绑定 workerId，claim/renew/transition 与
  lease-fenced snapshot materialization 已贯通；真实 socket integration 覆盖 client create、worker
  authorization、strict body 与 stale lease rejection。服务不执行用户代码。
- `apps/remote-runner-worker` 已实现独立单-job agent：claim、lease-fenced snapshot、heartbeat renewal、
  cancellation propagation、lease-loss fail closed、临时文件 materialization、allowlisted argv/no-shell
  spawn、timeout、output budget、credential redaction、process-group terminate/escalation 与 cleanup。
  filesystem/process supervisor 仅是非生产 reference adapter；生产默认 adapter 已切换为每 execution
  独立的 rootless Podman sandbox，要求 digest-pinned image、非 root worker、只读 rootfs、零 capability、
  no-new-privileges、无 host mount、默认断网、execution-local tmpfs，以及 CPU/memory/disk/PID/fd/timeout/
  output 限额。缺失 Podman、rootless engine 或 immutable image 时启动 fail closed。
  rootless result 使用独立 strict envelope，不与用户 stdout/stderr 混流；Build 只收集 snapshot 声明的
  output directory，拒绝 symlink/特殊文件/预算越界，Worker 在 sandbox 外生成 digest、expiry 与
  execution-scoped grant。durable artifact event 会移除 grant/retention authority 后再投影为 canonical
  `ExecutionArtifact`，不会把 `authorizationScope` 或 `expiresAt` 混入 Job replay。
- durable worker event ingestion 已贯通：worker 只发送无 cursor 的 log/diagnostic/trace payload，
  artifact 必须通过独立 binary upload；HTTP strict codec 拒绝未知字段与 artifact URL，repository 在
  lease-fenced transaction 内分配 execution-local cursor、追加 event、更新 latest cursor。真实 PostgreSQL
  Gate 覆盖 cursor 原子性和 stale worker rejection；Worker 已发布 redacted stdout/stderr 与 output
  truncation warning。`workerEventId + payload identity` 与 artifactId identity 在事务内强幂等，响应
  丢失重试不会复制事件。
- D2 artifact/blob/retention 已贯通：PostgreSQL content-addressed BYTEA blob 与 execution grant 分离，
  binary upload 在同一 lease-fenced transaction 内完成 SHA-256/size 校验、blob dedup、metadata event、
  cursor 与 grant；owner-scoped download 再校验 expiry。定时、bounded、`SKIP LOCKED` retention sweep
  删除过期 grant 与无引用 blob。event count/bytes、log bytes、artifact count/total/single size 均按
  durable facts 在 row-lock transaction 内执行总预算，重启不丢失计数。真实 PostgreSQL Gate 覆盖
  upload/read/tenant denial/budget/idempotency/expiry sweep，真实 HTTP Gate 覆盖 binary upload/download。
  budget exhaustion 具有独立稳定结果；Worker 将 log 与 artifact budget 分别终止为
  `output-budget-exceeded` / `artifact-budget-exceeded`，不误判为 lease loss 或自动重放。
- Structured Console 已在 runtime-core 建立 category/arguments/redacted/truncated/SourceTrace current
  contract、strict generated iframe bridge、finite Preview post-terminal Session observation 与双预算产品投影；
  Remote process log 继续由 durable Worker/Control Plane Secret guard 先行保护。Project Runner 取消保持旧
  active Job 直到 terminal，manual restart 创建新 request、保留旧事件且不自动重放 mutation。

### 外部部署证据与 post-G2 扩展

- rootless Podman sandbox adapter 与 remote-only GitHub Isolation Gate 已实现；Gate 构建 digest-pinned
  image 并主动验证非 root、zero capabilities、read-only rootfs、tmpfs/cgroup 限额、network/host socket/
  credential denial、取消与 orphan cleanup。历史通用 Golden Gate 已有远端通过证据；当前工作树新增
  authenticated Vue Catalog CRUD/Auth/Asset Preview/Test/Build workload，因尚未提交推送而缺首次 Actions
  证据。外部
  object-store/独立 queue scalability adapter 与 WebSocket/SSE replay adapter 尚未实现，HTTP control
  plane 也尚未接入正式部署环境。
- Remote Preview/Test/Build/Server Function provider projection、四类 result、授权 artifact resolver、有界 HTTP
  transport、Backend auth gateway/durable grant、独立 capability Preview Host、Web composition factory 与
  Blueprint Browser/Remote selection 已接通。living Golden Workspace 现在只生成一次 neutral snapshot，
  Browser Preview/Test 通过共享 Runtime Host 消费，三个独立 Remote provider 消费同一 snapshot digest；
  matrix 对齐 canonical Test semantics、Preview readiness/URI 与 Remote Build bundle，并明确 Browser Build
  unsupported、Browser live Preview 与 Remote finite Preview 的 lifecycle 差异。Gate 已从该 living
  Workspace 导出 strict Remote snapshot，在 rootless Podman 内完成真实 install/Preview/Test/Build，且在
  install 后断网并重新 inspect 才允许执行。当前 Gate 还会生成 authenticated Vue Catalog deterministic
  snapshot，要求 rootless Preview/Build 保持 PNG exact bytes，Test 报告必须包含真实 mock CRUD 与
  Authenticated Route guard/loader/action case；该新增 workload 的首次远端通过证据待后续显式推送。
- Remote install 已通过 internal network + infrastructure allowlist proxy 限制到显式 hostname/443；Worker
  校验 internal flag、proxy attachment 与 exact policy，安装后断网再 inspect。代理实际 request 只投影为
  origin-level `network.request`，strict contract 不可表达 header/path/query/body/credential，Execution Center
  Network 视图只接受 strict decode。Browser client-safe fetch、Data invocation/registry、独立 HTTP adapter 与
  operation/invocation/sequence/attempt/source trace correlation 已接 active Project Job；Executable Snapshot
  v4 mock provision 已由 Browser Host/rootless Worker 投影为运行资产，生成 React/Vite query runtime 可在
  Remote Preview/Test 内消费。standalone public client live HTTP/GraphQL/AsyncAPI finite policy、Backend Secret resolver/zone
  authorization、generated Remote server/edge 三协议 finite gateway，以及 public GraphQL/AsyncAPI pull-driven
  stream 已落地；其 metadata-only Network result 通过 exact active-job Session observation 关联产品视图，
  并以 SourceTrace exact snapshot fence 导航至 canonical Data operation。React/Vite server-gateway compile Gate 已
  通过显式 target manifest、Remote `environment-binding` capability 与 Browser/ZIP denial 落地；upstream
  `invocation-key` idempotency/retry 已通过 opaque HTTP header 与 v3 next-attempt ledger 落地。Remote 当前
  持久化输出的 Secret leak Gate 已由 runtime-core guard、Worker
  出站扫描与 Control Plane 入站扫描闭环；Structured Console 的 generated/bridge/core/copy 脱敏已接入。
  Remote Terminal 已建立独立 wire/client/polling transport、Backend owner gateway、短期 token rotation、worker
  command mailbox 与 rootless inner PTY；ADR 50 进一步以 Core/redactor checkpoint、PostgreSQL opaque state/revision
  CAS 实现跨 Control Plane 副本 continuation，ADR 51 增加 PRT2 per-revision data key、AWS KMS、PRT1 migration、
  retryable outage revision fence 与 related MRK regional broker continuation；ADR 52 增加 repeatable-read exact regional
  checkpoint、shared request drain/exclusive traffic epoch、durable cutover evidence、双 Control Plane standby/readiness hard cut、
  same-worker continuation、attempt+1 reclaim 与 Terminal generation replacement，并补齐1-128 execution single-epoch batch、
  非HTTP one-shot operator、role-separated Ed25519 proof、PostgreSQL grant replay fence、source-unavailable infrastructure fence +
  exact target replication attestation/RPO upper-bound和strict sanitized evidence codec。stdout/stderr 分流的 streaming canary
  redaction、cursor reconnect、lease fencing、worker-loss sweep、execution cleanup 与产品交互测试已闭环。

## 范围

### G2 必须完成

1. Executable Project Snapshot Hard Cut。
2. Remote transport contract 与 adapter-neutral client。
3. 独立 control plane 与隔离 worker，不在主业务 API 进程执行用户代码。
4. Remote Preview、Test、Build provider。
5. 取消、超时、断线重连、event replay、artifact retention 与资源配额。
6. Environment/Secret runtime-zone authorization 与全链路脱敏。
7. Browser/Remote contract conformance 与 Golden CRUD journey。

### 不在 G2

- 供应商 Marketplace、通用 runner SDK 与多供应商调度市场。
- 跨区域自动调度、计费、组织级预算和高级 autoscaling。
- 将 NodeGraph 单节点或 Animation 单帧通过网络逐次 RPC 执行；项目级 Remote Runner 运行的是
  完整导出工程。
- G3 的 BehaviorScenario、VerificationPlan 与 VerificationEvidence。

## Owner 边界

| Owner                     | 负责                                                                                           | 不负责                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `@prodivix/runtime-core`  | transport-neutral request/job/session/event/artifact/environment contract 与 provider registry | HTTP、WebSocket、容器 SDK、Browser runtime |
| Executable snapshot owner | provider-neutral project files、entrypoint、dependency、command、digest contract               | 运行进程与供应商配置                       |
| Remote client adapter     | wire codec、重试、cursor/replay、transport error mapping                                       | Canonical Workspace 与领域写入             |
| Remote control plane      | 鉴权、幂等、队列、lease、quota、artifact metadata                                              | 在 API 进程执行用户代码                    |
| Remote worker             | sandbox、materialize、install、spawn、capture、cleanup                                         | Workspace 作者态和 durable outbox          |
| composition root          | provider 注册、capability/policy 选择、用户授权                                                | 私自改写 provider contract                 |

## Executable Project Snapshot Hard Cut

G2 Remote 开工前先建立无 Browser 含义的 current contract。该 contract 至少包含：

- stable snapshot id 与 content digest；
- exact Workspace revision / partition revision vector；
- normalized POSIX project paths 与 immutable file payload；
- dependency manifest、lock/install fingerprint 与 target identity；
- allowlisted command descriptors 和 entrypoint；
- source trace / diagnostic target 映射；
- public build-time configuration；
- capability requirements、resource hints 与可选 cache hints。

它不得包含：

- Browser runtime instance、object URL、DOM、iframe 或 WebContainer 私有类型；
- Remote container、queue、region 或供应商 SDK 类型；
- Secret value、authorization header、cookie、session token 或未分类 literal environment map；
- 可变的 editor state、localStorage 或未提交草稿。

Compiler 生产 snapshot；Browser 与 Remote provider 只消费。Browser 迁移已完成，
`BrowserProjectSnapshot` type/factory 和双契约兼容层已删除；Remote adapter 必须直接消费该
current contract，避免长期分叉。

## Remote wire contract

wire protocol 独立版本化，codec 位于 transport adapter 边界，不把 wire version 写进 current
domain type 名称。最小操作集合如下：

```text
CreateExecution(request, snapshotRef | snapshotUpload)
  -> executionId + accepted provider descriptor

GetExecution(executionId)
CancelExecution(executionId, cancellationId)
ReadExecutionEvents(executionId, afterCursor)
ResolveArtifact(executionId, artifactId)
```

必须满足：

- `requestId` 是 start 幂等键；相同 identity + 相同 digest 返回同一 execution，digest 不同则
  fail closed。
- cancel 使用独立幂等键；重复 cancel 不创建新状态机，也不能复活已终止 job。
- event 具有 execution-local 单调 cursor；断线后从已确认 cursor replay。
- terminal state 只能单向进入 `succeeded / failed / cancelled / timed-out`。
- client 收到缺口、乱序或 provider identity 漂移时不得猜测状态，必须重新读取 authoritative
  status 或终止 session。
- artifact 通过 stable id、digest、media type、size、TTL 与 authorization scope 描述；共享
  contract 不保存供应商私有 URL。
- heartbeat、worker lease 与 client connection 分离；浏览器断线不等于 job 取消。

## Sandbox 与权限模型

每个 Remote execution 使用独立、短生命周期 sandbox，至少限制：

- CPU、memory、wall clock、process count、filesystem size、artifact size 与 log/event budget；
- rootless/non-privileged execution、只读 base image 和 execution-local writable volume；
- 默认拒绝宿主文件系统、container socket、cloud metadata endpoint 与 control-plane credential；
- dependency install 与 runtime network 分开授权，按 provider policy allowlist egress；
- package manager/version 与 lock integrity 可验证，install script、native build 和 dependency cache
  使用显式 policy 与隔离分区；
- execution-scoped Secret lease，仅注入获准 zone 和获准 operation/process；
- 终止后 revoke lease、kill process tree、销毁 volume，并按 policy 清除 cache 分区。

Secret value 不进入 request、snapshot、event、diagnostic、log、artifact、cache key 或 generated
source。worker 输出进入共享层前执行结构化 redaction 和 canary scan；发现 canary 泄漏时立即
终止 job、隔离 artifact 并生成安全诊断，不把泄漏内容回传。

## 实施阶段

### E0：Foundation baseline

- [x] transport-neutral Provider/Job/Session contract。
- [x] Browser Preview/Test provider 与独立 identity。
- [x] same-context NodeGraph/Animation provider。
- [x] 固化 public contract export 和现有 conformance baseline。

完成条件：现有 Browser 路径行为冻结，后续 hard cut 有可比较基线。

### E1：Provider-neutral snapshot

- [x] 定义 Executable Project Snapshot current model、strict constructor/validation 与 digest algorithm。
- [x] Compiler 直接产出 neutral snapshot。
- [x] Browser runtime 迁移为 consumer。
- [x] 删除 Browser-owned snapshot 命名、factory 和兼容层。
- [x] 校验路径穿越、重复 path、file/directory topology、大小预算、command exact shape 与 literal environment/Secret 禁止项。

完成条件：`runtime-core` 和 compiler public API 不 import `runtime-browser`；Browser gate 继续通过。

### E2：Remote protocol 与 client

- [x] 定义 protocol envelope、版本协商、error taxonomy 与 strict codec。
- [x] 实现 start/status/cancel/events/artifact client。
- [x] 实现 request idempotency、cursor replay、backoff 与 bounded retry。
- [x] 独立 Remote Terminal v1 strict codec/client/polling transport；app credential 与短期 terminal token
      使用不同 header/authority，resume 旋转旧 token。
- [x] provider-specific error 映射为稳定 execution diagnostic，不泄漏内部堆栈或 credential。

完成条件：in-memory fake control plane 能通过乱序、重复、断线与恢复 conformance。

### E3：Control plane 与 worker

已完成 E3A Control Plane Core：authorization/quota/router、原子 execution repository、
content-addressed snapshot store、FIFO queue claim、lease renewal/expiry takeover 与 fencing contract；
以下 checkbox 仍只按 deployable durable infrastructure 关闭：

- [x] 接入 execution authorization、quota、queue、lease 与 provider routing。
- [x] 建立独立 worker image/agent、sandbox lifecycle 与 process supervisor；生产默认 rootless Podman
      adapter fail closed，filesystem adapter 仅允许非 production 显式使用。
- [x] content-addressed snapshot/artifact store；校验上传与下载 digest。
- [x] structured event/log capture、budget、redaction 与 retention。
- [x] Control Plane replicated Terminal broker 只保存短期 token/worker lease digest；Core/redactor checkpoint 与有界
      stdin mailbox 先 AES-GCM sealed 再进入 PostgreSQL，数据库只接触 opaque bytes。每个操作重验 lease 并以
      revision CAS 保存；ack 删除 stdin，output id fingerprint、跨副本 resume、终态 revoke/sweep 已实现。
- [x] Terminal PRT2 每 revision 生成新 data key，只将该 key 交给 AWS KMS；exact ARN/hashed context、PRT1
      decrypt-only migration、old/new rotation/retirement、retryable outage no-CAS 与 related MRK regional broker
      continuation 进入独立 contract/live workflow Gate。
- [x] Worker command coordinator 与 rootless Podman inner PTY：install 后 runtime 断网才连接，真实 TTY、
      resize、interrupt/terminate、output retry/redaction 与 orphan cleanup 进入 rootless Gate。
- [x] rootless entry 与 Worker 建立 capture-ready handshake：main command 结束后先关闭 PTY，再生成有界
      `ExecutionFilesystemDiff`；dependency/build/test/runtime-managed path 被排除，baseline、Workspace identity
      和 SourceTrace 由 Worker 对照 exact snapshot 复核并 canonicalize，artifact 继续经过 Secret 双 Gate。
- [x] timeout、cancel、worker loss 和 orphan cleanup。（rootless isolation Gate 的 GitHub 远端证据待
      首次阶段性推送后生成）

完成条件：worker crash、client disconnect、重复 start/cancel 均不会重复执行 mutation 或遗留进程。

### E4：Remote providers

- [x] Remote Preview 返回 strict `ExecutionPreviewBundle`；HTML entrypoint、snapshot/target/file digest
      验证通过后才发布 `readiness=ready`、`health=healthy`。rootless Gate 已加入真实 Preview 探针；
      transport-neutral resolver、HTTP transport、Backend user-auth gateway、独立 capability origin hosting
      与 Blueprint provider selection 已完成；远端通过证据仍待后续阶段性推送。
- [x] Remote Test 生成 transport-neutral `ExecutionTestReport`，Worker 只持久化 canonical report
      artifact/trace，Provider 对 artifact、trace、terminal status 与 snapshot identity 交叉校验并在
      漂移时 fail closed；rootless GitHub Test 探针已加入 Gate，远端通过证据待阶段性推送生成。
- [x] Remote Build 返回经过 strict manifest/digest 校验的 `ExecutionBuildBundle` 与 source trace
      artifact；首次 rootless GitHub Gate 通过证据待阶段性推送生成。
- [x] 三个 provider 具有独立 descriptor、job/session 和 cancellation ownership；durable replay 与
      provider/state identity recovery conformance 已建立。
- [x] Preview/Test/Build 可在 primary result 之外发布独立 filesystem diff report；Preview Host materializer
      只处理 Preview Bundle，授权 artifact resolver 单独校验并下载 diff，二者不会混用 URI/媒体类型。

完成条件：Web 仅使用 provider registry 与 shared result contract，不解析 Remote 私有 payload。

### E5：Environment、Secret 与 network policy

- [x] Backend 在 create 转发前按 authenticated principal/session preflight exact Workspace/environment
      revision/mode，并将 reference 作为 value-free durable execution authority 保存；environment-bound
      status/cancel/events/artifact/Preview 访问按原 session partition，authority drift 幂等重试返回冲突且
      不取消已有 execution。
- [x] Backend Remote Data HTTP query/mutation first vertical 仅在 execution-bound `server` / `edge` zone 将 exact reference
      换为最长 30 秒、binding/field-scoped grant；generated Remote Preview 已通过 value-only strict envelope、
      exact opaque frame/generation fence 与父窗口 product-authenticated client 接入，iframe 不持有 token、
      environment identity 或 Secret material。
- [x] gateway 对 exact operation/document revision、principal/session、provider、zone、purpose、binding/field
      做 permission check，并只持久化 value-free audit metadata。
- [x] rootless Worker 将显式 install network 与默认断网 runtime 阶段硬分离，断网后 inspect 失败则
      fail closed。
- [x] install egress hostname/443 allowlist proxy与 Remote install sanitized Network trace/产品视图。
- [x] Browser fetch + Data HTTP adapter、operation correlation 与 safe status/size response metadata。
- [x] generated-project/Remote mock query runtime 与 provider asset projection、Backend live HTTP server/edge
      query/mutation first vertical，以及 generated invocation bridge/exact capability-origin CSP 已建立。
- [x] Remote mutation effect-before PostgreSQL claim、exact request fingerprint、completed result replay、identity
      drift/concurrent pending/indeterminate fail-closed；无 upstream idempotency contract 时 attempt 固定为 1。
- [x] `G2 PostgreSQL Gates` 以真实 PostgreSQL service 同时验证 Control Plane adapter 与 Backend mutation
      replay ledger；同 identity 并发 claim、最后容量槽、stored result、drift/fence 和 authority cascade 均有证据。
- [x] Remote Data Network trace 通过 exact active-job Session observation 进入 Execution Center；finite
      Remote Preview Job 保持 terminal，不被重新打开。generation replacement/stop、重复结果、identity drift
      与共享 retention budget 均 fail closed 或有界处理。
- [x] 显式 upstream `invocation-key` idempotency/retry contract：adapter capability/public header mapping、
      attempt-invariant opaque key、v3 current/max attempt ledger、next-attempt-only claim 与真实 PostgreSQL
      concurrency Gate；未声明 contract 的 mutation 仍固定 attempt 1。
- [x] Project Runner manual cancellation/restart presentation：等待旧 Job terminal 后创建新 request，旧事件
      有界保留，mutation 不自动重放，non-retryable failure 要求先修改。
- [x] same-execution cursor reconnect、artifact expiry/missing、quota wait-for-capacity、bounded worker-loss、
      authorization/permission repair、network policy denial、cancel/timeout 的 Remote recovery contract 与
      Execution Center presentation；所有新 request 都显式创建并保留旧事件，mutation 不自动 replay。
- [x] canary leak suite 覆盖 request/snapshot/cache key、log、diagnostic、trace、artifact descriptor/content、
      test report 与 crash path；Worker 命中后在首次 durable publication 前丢弃原输出，Control Plane 对恶意/
      绕过 Worker 的 ingestion 再次 fail closed，只持久化安全 `EXE-5004` 与固定 terminal reason。worker token、
      active lease token 和部署 canary 均进入短期 guard closure，不进入事件或诊断。

完成条件：当前 Remote contract 可表达的任何 Secret canary 都无法出现在客户端或持久化输出；拒绝路径有
稳定 diagnostic。Structured Console 已复用 durable guard并增加客户端多层脱敏；Remote Terminal 在
Worker 出站、Control Plane 入站、Core retention 与 copy boundary 执行独立、跨 chunk 的 stdout/stderr
redaction，token/lease/canary 不进入 durable payload 或客户端 replay。

### E6：Provider selection 与 recovery UX

- [x] Blueprint composition root 按 capability、zone、登录 availability 显式选择 Browser/Remote Preview
      provider；选择只进入 UI state，不写 Workspace 或 provider 私有作者态配置。
- [x] 用户显式看到 Browser/Remote selection，并继续通过 canonical Job/Execution Center 消费
      queue/running/terminal 状态；Remote artifact 在发布给 iframe 前异步 materialize 为短期 origin。
- [x] retry 固定创建新 immutable request；取消先等待旧 Job terminal，保留旧事件，mutation 不自动重放，
      不伪装为恢复原 Job。
- [x] Blueprint Remote Preview 将 Terminal client 作为临时 capability 接入 Execution Center；短期 bearer
      不进入 React state，UI 通过 output cursor 自动续租/重连，并提供有序输入、resize、interrupt 与 close。
- [x] Execution Center Files 按需解析 Remote diff且默认不选择；revision/baseline/source-owner 全通过的
      whole-file CodeArtifact modification，以及 exact Workspace/Route/lifecycle/VFS preflight 全通过的 add/delete，
      可按确定性顺序显式组成单个 Workspace Transaction，经 Outbox/Atomic Commit 采纳。
- [x] artifact expiry、quota、authorization/permission 和 network denial 可定位、可操作；Network denial 保留
      sanitized trace，authorization 恢复只允许沿已确认 identity/cursor 继续或等待终态后显式新建 request。

完成条件：切换 provider 不改变作者态，不要求编辑器保存 provider 私有配置。

### E7：Conformance 与 Golden

- [x] Browser 与 Remote 执行同一 living Golden Workspace 生成的 neutral snapshot fixture；Browser
      mount file set 与两个 resolver digest、三个 Remote upload digest 均绑定该 snapshot。
- [x] Preview/Test/Build contract matrix；Browser 支持 Preview/Test，Remote 支持 Preview/Test/Build，
      Browser Build 明确 `unsupported`，不伪造 provider。独立 GitHub Gate 为
      `G2 Execution Contract Matrix`。
- [x] cancel/timeout/reconnect/replay/worker-loss deterministic conformance 与 repository recovery tests。
- [x] protocol state-machine property tests 覆盖 bounded transport loss/duplicate start、任意 confirmed
      cursor replay 与 get/read/cancel 调度；Blueprint active iframe 以 exact Window identity fence，8 类
      bridge 对任意 JSON、错误 origin/provider 与 credential-shaped unknown fields fail closed。
- [x] Rootless Remote Terminal Gate 执行真实 inner PTY 命令、resize 与 execution-local FS 写入，并验证
      host Workspace 无回写、container 无 orphan；同一 terminal-created file 必须出现在 canonical filesystem
      diff，token rotation/cursor replay/lease loss 由非容器 Gate 覆盖。
- [x] authenticated Vue Catalog CRUD/Auth/Asset snapshot 已进入真实 rootless Remote Preview/Test/Build
      Gate；Preview/Build 校验 exact PNG bytes，Test 校验 CRUD 与 Auth/Server case、canonical report 与
      SourceTrace。当前工作树的首次 Actions 容器执行证据仍单列 pending，不由 contract-only 测试冒充。

完成条件：相同 snapshot digest 的语义结果一致；环境差异只能通过显式 capability/policy 表达。

## Gate 与证据

| Gate            | 必需证据                                                                      |
| --------------- | ----------------------------------------------------------------------------- |
| Snapshot        | codec/digest conformance、Browser migration、无 browser/remote type leak      |
| Protocol        | duplicate start/cancel、cursor replay、disconnect/recovery property tests     |
| Isolation       | sandbox escape denial、quota、timeout、worker-loss、cleanup integration tests |
| Security        | zone permission matrix、Secret canary leak suite、network policy tests        |
| Provider parity | Browser/Remote Preview/Test/Build contract matrix                             |
| Product         | Project Runner recovery UX 与 Golden CRUD journey                             |

## 风险与停止条件

- 如果 neutral snapshot 仍携带 Browser command 或 literal Secret/environment，停止 Remote 实现并先
  完成 hard cut。
- 如果 start/cancel/replay 不具备强幂等和单调 cursor，停止接入真实队列。
- 如果用户代码仍运行在主 backend API 进程，Remote Provider 不得标记可用。
- 如果 Remote Test 需要 Web 解析供应商或 Vitest 私有 JSON，先修正 report adapter owner。
- 如果 artifact URL、terminal token 或 Secret value 进入 durable Workspace/Outbox，视为架构违规。

## 验收标准

- [x] Provider-neutral snapshot Hard Cut 完成，Browser owner/alias 已删除。
- [x] Browser 与 Remote 消费同一 Executable Project Snapshot contract。
- [x] Remote Preview/Test/Build/Server Function provider projection 不暴露供应商 SDK 类型。
- [x] start/cancel/reconnect/replay/timeout/worker-loss 语义可重复验证。
- [x] sandbox、quota、network 与 Secret zone permission fail closed。
- [x] Browser/Remote contract conformance matrix 通过。
- [x] 真实 rootless Golden CRUD journey 已进入 GitHub Gate；当前工作树首次远端 Passed 证据等待后续
      显式提交推送。
- [x] Runtime 输出不成为 Canonical Workspace 或第二套 durable truth；Files adoption 仍需 exact
      revision/baseline/owner preflight 与单一 Workspace Transaction。
