# G2 Closure Evidence

> StatusDate: 2026-07-20
> ProductGateStatus: Passed

本文件只保存 G2 可重复验证证据和未覆盖边界。G2 当前状态仍以
[`current-status.md`](./current-status.md) 为唯一来源；局部 Gate 通过不等于 G2 Product Gate 已通过。

## Remote Test correlation 与 D8 security slice

本地重复命令：

```bash
pnpm run verify:g2:data-security-matrix
```

2026-07-20 本地复跑：通过。Environment Secret managed adapter已hard-cut为`aws.kms/v2`，新增related MRK
primary/replica stable-identity contract；Remote Terminal既有`aws.kms/v1` PRT2 contract保持不变。

| 子 Gate           | 证据                                                                                                                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Golden D8 matrix  | 1 file / 4 tests passed；覆盖所有 execution Secret surfaces、strict Network metadata、React/Vue Test mock-only 与 Export fixture exclusion。                                                                             |
| Data mock         | 1 file / 7 tests passed；missing/error fixture fail closed、session-scoped CRUD 与无 live fallback。                                                                                                                     |
| Runtime Core      | 2 files / 9 tests passed；Secret canary/redaction 与 Network strict decoder。                                                                                                                                            |
| Compiler          | 2 files / 23 tests passed；standalone runtime mock/live hard cut、client finite protocol execution、server/edge gateway/stream capability 与 client-only/environment denial。                                            |
| Remote Provider   | 11 files / 72 tests passed；exact provider、reconnect/recovery、execution-bound Test report 与 live runtime trace denial。                                                                                               |
| Remote Worker     | typecheck、rootless snapshot contract passed；2 files / 27 tests passed；rootless result decoder、upload-before-trace、Secret output Gate。                                                                              |
| Web composition   | typecheck passed；4 files / 11 tests passed；Browser Test mock-only、Remote Preview/Test independent provider composition、Test plan/report projection。                                                                 |
| Backend authority | `internal/modules/remoteexecution` 与 `internal/platform/database` Go tests passed；durable provider/profile/runtime-zone authority、Remote Test environment denial、live Data Preview-only Gate 与 migration contract。 |

关键身份链：

1. Browser/Remote Workspace Test 消费同一 exact snapshot 和强制 mock-only Data runtime。
2. Remote Test create 不接受 environment reference；Backend authority 持久化 exact
   `prodivix.remote.test/test/test`，live Data gateway 只接受
   `prodivix.remote.preview/preview/client`。
3. Worker 将私有 Vitest payload 转换为 `test-report:<executionId>`，先上传 artifact，再发布同 ID、状态和
   SourceTrace 的 `test.report`。
4. Remote Provider 对重复、乱序、snapshot/report/source drift 及 Test live runtime Network fail closed；
   Test 页面与 Execution Center 消费同一 Session event stream。

GitHub workflow `G2 Data and Second Target Closure / Remote Test correlation and D8 security matrix` 已在
commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过：
[Actions run 29692691096](https://github.com/prodivix/prodivix/actions/runs/29692691096)。

## D8 bounded protocol、journey 与 target matrix

本地重复命令：

```bash
pnpm run verify:g2:data-closure
pnpm run verify:g2:data-protocols
pnpm run verify:g2:vue-target
```

2026-07-19 本地结果：完整 `data-closure` 通过（168.0 秒）；下列子 Gate 均通过。

| 子 Gate             | 证据                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data kernel         | 13 files / 55 tests passed；包含 cache partition、stale revalidation、retry/idempotency、stream lifecycle 与 optimistic owner/version property coverage。                       |
| Protocol adapters   | HTTP 2 files / 17 tests、GraphQL 2 / 8、AsyncAPI 2 / 8 passed；OpenAPI mapping、finite query/mutation/request-reply/publish、bounded stream 与稳定 unsupported 边界。           |
| Generated runtime   | Compiler 2 files / 23 tests passed；public client finite HTTP/GraphQL/AsyncAPI、server/edge gateway 与 pull stream、sanitized Network correlation、mock/live/Secret hard cut。  |
| Product composition | Web typecheck 与 2 files / 16 tests、Backend Workspace Go tests passed。                                                                                                        |
| Target matrix       | Golden 2 files / 20 tests passed；React/Vue × HTTP/GraphQL/AsyncAPI × mock/live × Preview/Test/Build × Browser/Remote compatibility、Remote codec 与 stream capability。        |
| Independent target  | Vue/Vite temporary project install、typecheck、test、build、Chrome smoke passed；执行 list/get/create/update/delete、loading、empty、retryable error attempt 2 与 offset page。 |

有界支持范围：

1. Workspace Test 对两个 target 和三个协议都只消费 provider-projected mock fixture；Export 不携带 fixture。
2. Browser/static-client Preview 支持 HTTP、finite GraphQL 与 finite AsyncAPI live；Remote Preview 可运行同一
   client bundle，Remote Build 只构建且不解析协议私有结果。
3. server/edge live 对 HTTP/GraphQL/AsyncAPI finite invocation 复用同一受审计 execution gateway；public或显式
   `per-connection` renewal的GraphQL subscription与AsyncAPI SSE/NDJSON stream使用ADR 49/55的独立pull/recovery
   bridge。client/static、HTTP subscription、缺失renewal stream与未声明transport继续在compile/runtime Gate fail closed。
4. Target/runtime source equality、独立生成工程执行与 property Gate 共同构成 parity 证据；单纯 snapshot
   字段相等不被当作完整 journey 证据。

GitHub workflow `G2 Data and Second Target Closure / Protocol adapters, authoring, Test Operation, and Remote recovery`
已在 commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过：
[Actions run 29692691096](https://github.com/prodivix/prodivix/actions/runs/29692691096)。

## Vue PIR/Route/Auth/Server/Asset 与 authenticated Catalog CRUD

本地重复命令：

```bash
pnpm run verify:g2:vue-product
```

2026-07-20 本地结果：扩展后的完整聚合 Gate 通过；contract 5 tests、deterministic/Remote Chrome 2 tests 全部通过。

| 子 Gate                  | 证据                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compiler current surface | Vue compiler conformance 1 file / 5 tests passed；PIR product path、Data-only compatibility、protocol parity、server/Secret 与 unsupported fail-close。                                                                                                                                                                                                    |
| Catalog contract matrix  | 1 file / 5 tests passed；覆盖 canonical PIR layout/page、parent/leaf Route、default/named outlet、Auth/Server/Data/PNG、精确 invalid topology diagnostics、deterministic Test provision、live execution-parent Remote Preview/Test/Build 与 strict codec。                                                                                                 |
| Independent Catalog app  | 2 files / 2 tests passed；同一 Vue bundle fresh install、`vue-tsc`、Vitest、production build；deterministic 与 Remote Chrome 均覆盖 parent layout、default main outlet、named sidebar、fallback replacement、authenticated loader/PNG/CRUD；Remote 子 frame另覆盖 strict Data/Server parent bridge、owner guard、principal loader 与 Network correlation。 |
| Backend Remote live      | 本机真实 PostgreSQL `TestAuthenticatedCatalogRemotePostgreSQLGolden` passed；从 authenticated Remote create 持久化 exact authority，再执行五个 Data operation、Data/Server mutation replay/state 与 non-owner denial；全部响应通过 token/session/server-source canary。                                                                                    |
| Web product composition  | Web typecheck passed；4 files / 12 tests passed；覆盖 Export ZIP surface、Workspace Test selector、Blueprint Run target planning 与 mock-only/Test policy。                                                                                                                                                                                                |
| Client security boundary | server source canary 不进入 snapshot files；protected static Vue export 以 `WKS-EXPORT-SERVER-GATEWAY-REQUIRED` fail closed。                                                                                                                                                                                                                              |
| Full regression          | Compiler 17 files / 116 tests、Golden 11 files / 53 tests、Web 88 files / 317 tests、Web production build 与 core package boundary passed。                                                                                                                                                                                                                |

当前声明边界：

1. Vue current-contract product target 直接消费 canonical PIR/Route/Auth/Server/Data/Asset，并在 Export Code、Workspace Test、
   Blueprint Run Mode 提供显式 target selector；没有产生 Vue 私有 Workspace 或 runtime 持久化镜像。
2. Browser provider 仍不伪造 live Server Function；deterministic journey 使用 Test adapter，Remote journey 则只在 capability-origin
   子 frame 中经 strict parent bridge 调用 execution-parent Data/Server gateway。
3. Remote generated bundle 的真实 Chrome journey与 Backend authenticated create/真实 PostgreSQL gateway journey在 frozen wire
   contract 处闭合；本次没有把本地通过冒充新的 GitHub Actions 证据。
4. A17 sharing/editor与React/Vue Asset matrix已由后续Gate关闭；更高organization role、更多sanitize UI与public Target SDK属于post-G2。

GitHub workflow `G2 Data and Second Target Closure / Vue Vite product surface and authenticated Catalog CRUD Gate`
已在 commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过：
[Actions run 29692691096](https://github.com/prodivix/prodivix/actions/runs/29692691096)。

新增 Remote Chrome Gate 与 authenticated PostgreSQL Golden 的首次 GitHub Actions 证据已取得：
[G2 Data and Second Target Closure run 29706186184](https://github.com/prodivix/prodivix/actions/runs/29706186184)
通过 `verify:g2:vue-product`，
[G2 PostgreSQL Gates run 29705222564](https://github.com/prodivix/prodivix/actions/runs/29705222564)
通过 `TestAuthenticatedCatalogRemotePostgreSQLGolden`。

## Server/Edge GraphQL/AsyncAPI stream 与 SourceTrace debugger

本地重复命令：

```bash
pnpm run verify:g2:data-stream-debugger
```

2026-07-20 本地结果：通过（46.3 秒）。本轮扩展由 ADR 55 固定 same-execution recovery、credential renewal
与 incremental collection；未提交推送，因此下方历史 Actions run 不包含这些新增断言。

| 子 Gate                    | 证据                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Core strict wire   | 21 files / 91 tests passed；覆盖 stream open/pull/cancel/event/complete、cursor 与 bounded strict decoder，并证明 `reconnect`/`resume` 私有字段不能进入 iframe wire。                         |
| Data stream kernel         | 14 files / 58 tests passed；覆盖单 pending pull、背压、event/byte/duration/idle budget、strict stream policy，以及 exact-cursor immutable replace/upsert/delete collection。                  |
| Protocol stream adapters   | GraphQL 2 files / 9 tests、AsyncAPI 2 / 9 passed；覆盖 frame mapping、finite/stream 分流、malformed hard cut，以及显式 policy 下只在当前 environment lease 内打开 Secret connection。         |
| Generated runtime          | Compiler 2 files / 23 tests passed；覆盖真实 open → pull → event/complete postMessage journey、schema-first incremental collection、client/HTTP/missing-renewal stream hard cut。             |
| Target capability matrix   | Golden 2 files / 20 tests passed；覆盖 React/Vue × GraphQL/AsyncAPI edge subscription 的 `data-stream`/network/environment capability 与 Remote provider。                                    |
| Product debugger journey   | Web typecheck 与 7 files / 39 tests passed；覆盖动态 bearer renewal、透明 resume、私有 checkpoint剥离、共享预算、独立 reconnect Network与generation/cancel fence。                            |
| Backend protocol authority | Workspace 与 Remote Execution Go tests passed；覆盖 canonical policy、HMAC-authenticated checkpoint、Last-Event-ID、每连接 grant/use/revoke、credential echo/tamper denial与strict envelope。 |

当前有界支持范围：

1. server/edge HTTP、GraphQL 与 AsyncAPI finite invocation 共用同一 execution-bound authority、Workspace/environment
   revision、HTTPS/SSRF、response budget、mutation permission/replay 与 sanitized Network Gate。
2. stream 接受 public或显式 `per-connection` renewal的GraphQL subscription与AsyncAPI HTTP SSE/NDJSON
   receive/stream；只有SSE id stream可恢复。HTTP adapter仍为finite-only，client/static、mock-only与缺失renewal stream fail closed。
3. generated iframe 必须显式 `open → pull(cursor) → event/complete → cancel`；一次 pull 最多读取一个事件，不能以
   provider 私有 emitter 绕过 consumer backpressure、schema、预算或取消。
4. 每次重连产生独立 sanitized Network identity，并继续绑定 exact active Job/Session/generation；resume token、upstream SSE id
   与credential不进入Session或iframe。Network Source link只接受correlation唯一的metadata-only `data-operation` SourceTrace；先校验producing snapshot，
   再校验 canonical document/operation，最后通过共享 semantic navigation 打开作者态 Resources。
5. `keyed-event-v1` collection只接受 exact replace/upsert/delete envelope并生成execution-local immutable snapshot；不写Workspace/Outbox。

GitHub workflow `G2 Data and Second Target Closure / Verify server and edge streams with SourceTrace debugging`
的 ADR 49 first vertical 已在 commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过：
[Actions run 29692691096](https://github.com/prodivix/prodivix/actions/runs/29692691096)。ADR 55 后续 Gate
也已在 commit `e70f9473c22e5448a53668e851897d07de809bd0` 的
[Actions run 29706186184](https://github.com/prodivix/prodivix/actions/runs/29706186184) 通过。

## Console/Artifact/Test/Files unified SourceTrace debugger

本地重复命令：

```bash
pnpm run verify:g2:execution-source-debugger
```

2026-07-19 本地结果：通过（16.8 秒）。

| 子 Gate                  | 证据                                                                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime Core contracts   | 3 files / 8 tests passed；覆盖 Structured Console correlation、Test Report SourceTrace 与 strict Runtime Files diff。                                                                      |
| Authoring boundary       | 9 files / 24 tests passed；`execution-center` 是显式 Code Authoring origin，未改变 Workspace owner、source span 或 authoring session 语义。                                                |
| Web exact-source journey | typecheck passed；7 files / 28 tests passed；覆盖 Console artifact、Test file/case、Files change、stale snapshot、root/helper ambiguity、跨 artifact span 与 Animation shell composition。 |
| Full Web regression      | 86 files / 307 tests passed；Core package boundary check 与 `git diff --check` passed。                                                                                                    |

关键闭环：

1. Console line 不再丢弃 Core correlation；artifact/log/diagnostic/trace/application observation 都保留 exact
   Job/provider/snapshot，且仅有唯一合法 trace 时显示 Source。
2. Workspace Test presentation 从 normalized `test.report` event 保留 producing provider/job/snapshot；旧报告继续可读，
   但不能打开当前 Workspace 源码。file/case 多义 trace 不按数组首项猜测。
3. Runtime Files controller 将 verified diff change 与 proposal entry 按 `changeId` 重新关联；Source 导航使用 artifact
   reference 的 exact identity，采纳 eligibility、显式选择与单一原子 Transaction 语义不变。
4. Blueprint、NodeGraph、Animation 与 Test composition 复用同一 Workspace opener；CodeArtifact 进入共享 Code
   Authoring overlay，Data/NodeGraph/Animation 等 canonical target 进入共享 semantic navigation。stale、missing、
   ambiguous 与 source-span identity drift 全部 fail closed。

GitHub workflow `G2 Execution Contract Matrix / Run unified execution SourceTrace debugger Gate` 已在
commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过：
[Actions run 29692691112](https://github.com/prodivix/prodivix/actions/runs/29692691112)。

## Remote Terminal encrypted cross-replica recovery

本地重复命令：

```bash
pnpm run verify:g2:terminal-replica-recovery
pnpm run verify:g2:remote-recovery
pnpm --filter @prodivix/remote-runner-control-plane test
PRODIVIX_REMOTE_POSTGRES_TEST_URL=postgres://postgres:postgres@127.0.0.1:5432/prodivix_test?sslmode=disable \
  pnpm --filter @prodivix/runtime-remote-postgres test:postgres
```

2026-07-19 本地结果：通过。

| 子 Gate                   | 证据                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Core checkpoint   | 2 files / 19 tests passed；覆盖 Terminal checkpoint exact restore、output/input cursor、续期 lease、transient close hard cut、Secret stream pending suffix 与 drift hard cut。                                          |
| Remote two-replica broker | 13 files / 81 tests passed；双副本用例覆盖跨副本 stdin/mailbox/output、CAS duplicate/conflict、token rotation、split-canary、lease renewal、worker-loss、retryable cipher outage no-CAS 与 regional recovery contract。 |
| Control Plane crypto/HTTP | typecheck/build、完整 10 files / 32 passed + 2 live skipped；覆盖 PRT1/PRT2、AWS KMS/MRK、client/worker strict HTTP endpoints、Secret broker 与 regional config/HTTP drill。                                            |
| PostgreSQL real isolation | 1 file / 9 tests passed；新增 opaque Terminal row 覆盖 concurrent revision CAS、byte-exact read、expiry lookup 与 revision-fenced delete。                                                                              |
| Worker / Web regression   | Worker 1 file / 15 tests、Execution Center 1 file / 12 tests passed；完整 `verify:g2:remote-recovery` 32 秒通过。                                                                                                       |

关键闭环：

1. Core state 与 stdout/stderr redactor 都形成 versioned bounded checkpoint；fingerprint salt、raw unacked stdin 与可能是
   Secret 前缀的 pending suffix 只进入加密 plaintext。
2. PostgreSQL adapter 只接收 opaque `sealedState` 与 execution/session/revision/expiry；AES-GCM AAD 绑定 exact row identity、
   revision 与 expiry，ciphertext、sweep metadata 或 AAD drift fail closed。
3. client/worker 操作在任意副本重建状态机并重新校验 current lease，随后 `revision + 1` CAS；竞争重试保留同 input
   duplicate、不同 input conflict 与 worker output existing/identity-conflict 语义。
4. sweep 不按旧 checkpoint lease 直接删除：同 generation 已续期则更新 row；execution/worker generation drift 才关闭、
   revoke、清 mailbox 并以 exact revision 删除。Terminal state 仍是短期 recovery authority，不进入 Job event 或 Workspace。

GitHub workflow `G2 Data and Second Target Closure / Verify encrypted cross-replica Terminal and Remote recovery contracts`
已在 commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 通过；真实 PostgreSQL adapter/DR Gate 也在同一
commit 通过：[Data run 29692691096](https://github.com/prodivix/prodivix/actions/runs/29692691096)、
[PostgreSQL run 29692691122](https://github.com/prodivix/prodivix/actions/runs/29692691122)。

## Remote Terminal managed KMS and multi-Region recovery

本地重复命令：

```bash
pnpm run verify:g2:terminal-managed-kms
pnpm run verify:g2:remote-recovery
pnpm --filter @prodivix/remote-runner-control-plane test
pnpm --filter @prodivix/remote-runner-control-plane build
```

2026-07-19 本地结果：通过。

| 子 Gate                        | 证据                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed cipher/config          | 5 files / 13 tests passed；覆盖 PRT2 exact AAD/tamper、独立 replica、per-revision data key、old/new rotation/retirement、strict config 与 live PRT1 broker CAS migration。            |
| AWS KMS adapter                | exact immutable ARN/region/algorithm/response、hashed CloudTrail context、pre-KMS metadata rejection、bounded timeout 与 retryable dependency classification 通过。                   |
| Environment Secret MRK         | `verify:g2:environment-secret-managed-kms`通过；v2 metadata绑定single-Region exact ARN或MRK partition/account/resource，related replica unwrap通过，unrelated/single-Region替换拒绝。 |
| Multi-Region broker recovery   | related MRK primary/replica 通过同一 opaque row 双向继续 stdin、worker mailbox、output cursor、token rotation 与 revision CAS；unrelated MRK fail closed。                            |
| Runtime outage preservation    | Runtime Remote 13 files / 81 tests passed；cipher open/seal outage 保持 exact revision，恢复后同 sequence 只产生一个 input command。                                                  |
| Full Control Plane / aggregate | 10 files / 32 passed + 2 live skipped；build 通过。完整 Remote recovery 32 秒通过：Core 19、Remote 81、managed KMS 13、HTTP 9、Worker 15、Web 12。                                    |

关键闭环：

1. PostgreSQL 仍只保存 opaque bytes；PRT2 本地用随机 data key 加密 checkpoint，AWS KMS 只看到该 32-byte key 与
   AAD digest，不接触 stdin、output、token、execution/session raw identity 或 checkpoint。
2. managed rolling rotation 通过 logical id -> exact ARN map 读取 old/new key，新 revision只用 active key；可选 static
   ring 只读 PRT1，首次成功 mutation 由同一 CAS 原子升级 PRT2。
3. KMS timeout/throttling/5xx 使用 retryable cipher-unavailable boundary；失败前后不 CAS、不清 mailbox、不旋转 token，
   sweeper 也不删除无法取得 key 的 authority row。
4. MRK metadata 固定 partition/account/`mrk-*` stable identity，但每个 Region 的请求/响应仍要求 exact local ARN；
   cryptographic portability 与 ADR 52 的 PostgreSQL/Worker/traffic DR contract 保持两个独立 Gate。

GitHub `G2 Managed KMS` workflow已配置Terminal与Environment本地contract、OIDC old/active live rotation，以及Terminal +
Environment related MRK replica live Gate；`deploy/aws/g2-managed-kms`另提供不自动部署的Retain primary/replica与exact-sub OIDC role参考。
截至 2026-07-20，该手工 workflow 尚无首次 run，`g2-managed-kms` GitHub Environment、OIDC Role 与 AWS key
variables/secrets待配置；四条live路径在本地无AWS环境时明确skipped，因此A14继续保持
`Configured / Evidence pending`。

## Regional PostgreSQL / Worker / traffic disaster-recovery drill

本地重复命令：

```bash
PRODIVIX_REMOTE_POSTGRES_TEST_URL='postgres://postgres:postgres@127.0.0.1:5432/prodivix_test?sslmode=disable' pnpm run verify:g2:regional-dr
```

2026-07-20 本地PostgreSQL复跑：通过。以下新增operator evidence尚未commit/push，因此旧GitHub run只证明此前single-execution
baseline；更新后的GitHub PostgreSQL Gate必须在后续明确提交推送后重新取得。

| 子 Gate                        | 证据                                                                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery/operator contract     | 2 files / 13 tests passed；除原exact recovery外，覆盖2-execution single-epoch batch、strict request/evidence codec、credential exclusion、scope drift、source-unavailable fence/attestation/RPO、active-lease wait与Terminal revoke。 |
| 双 schema PostgreSQL           | 1 file / 3 tests passed；除repeatable-read/epoch外，16路并发signed grant只有一次消费，grant表只保存digest/expiry/consumed time。                                                                                                      |
| 双 HTTP Control Plane/operator | 5 files / 14 tests passed；配置、bounded regular-file input、standby/readiness、lease/PTY recovery，以及三组Ed25519 key role separation、signature/claim drift、canonical replay identity和双execution signed batch。                 |
| Full package regression        | Runtime Remote 15 files / 91 tests、PostgreSQL adapter 3 files / 15 tests、Control Plane 13 files / 41 passed + 2 AWS live skipped，build与core boundary通过。                                                                        |
| GitHub Gate                    | 旧baseline在PostgreSQL 16 run 29692691122通过；本轮更新后的workflow command已包含operator suites，但远端新run待后续commit/push。                                                                                                      |

关键闭环：

1. application 不复制生产 row；probe 只验证基础设施复制结果，损坏 grant/blob、event gap、artifact bytes drift、target ahead 或
   同 cursor digest drift 均 fail closed。
2. 每个 accepted HTTP request 与 background sweep 持有 shared advisory transaction；cutover 的 exclusive lock 先 drain，再在
   无 active writer 窗口内重验 source/target、撤销旧 Terminal，并以 expected epoch CAS 切换 active region。
3. live lease 保留 exact worker/token/attempt；expired lease 只走既有 bounded claim 产生 attempt+1。旧 PTY 不迁移，旧
   Terminal row 关闭并 revision-fenced 删除后，新 Worker 才能创建不同 session id。
4. `/healthz` 只表示进程活着；`/readyz` 与业务请求共同消费 current traffic authority。standby/authority outage 不降级写入，
   每次成功切换在同一 transaction 留下 source/target/epoch/checkpoint digest/time evidence。
5. one-shot operator不注册HTTP route；authorization/fence/replication三个issuer key fingerprint不得复用，proof input Buffer在执行后best-effort清零。
   source-unavailable不读源库，以external fence + exact target attestation给出非零RPO upper bound，并在旧lease到期前拒绝切换。
6. sanitized evidence不含raw execution/request/owner id、ARN、URL、proof、Terminal id、ciphertext或应用payload；unknown field、
   timing/outcome/digest drift由codec拒绝，整份evidence的`evidenceDigest`在traffic transaction中作为immutable checkpoint
   trust anchor durable保存。

本 Gate 关闭本地可重复 regional DR contract，不冒充真实跨 Region database promotion、DNS/Anycast 或 RPO/RTO 测量。

## Bounded Terminal emulator product Gate

本地重复命令：

```bash
pnpm run verify:g2:terminal-emulator
```

2026-07-19 本地结果：通过。

| 子 Gate          | 证据                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime Core     | typecheck 通过；3 files / 26 tests passed。覆盖 Terminal Session/Secret 基线，以及跨 record ANSI、cursor/erase、SGR、alternate screen、scrollback/resize、fragmentation、gap 与 conceal-safe copy。                  |
| Execution Center | typecheck 通过；2 files / 17 tests passed。覆盖 normal/application key、Control/AltGr、bounded bracketed paste、ANSI render、rapid ordered input、exact retry、interrupt 与 invalid-output fail-close。              |
| Full regression  | Runtime Core 21 files / 91 tests、Web 87 files / 312 tests、完整 `verify:g2:remote-recovery` 均通过；Core/Web production build、Web ESLint、package boundary、property naming、Prettier 与 `git diff --check` 通过。 |
| GitHub workflow  | `G2 Execution Contract Matrix` 已在 commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 执行并通过 `verify:g2:terminal-emulator`（run 29692691112）。                                                                  |

关键闭环：

1. emulator 只消费 strict output record，exact terminal/execution/job、cursor、UTF-8 byte length 或 chunk budget drift 时 cursor
   不前移且 UI 固定 fail closed；duplicate cursor 幂等忽略，gap 显式投影。
2. parser state 只跨同一 stream 的连续安全块；gap、redacted、truncated 与二次 credential redaction 在前后 hard cut。
   OSC clipboard/hyperlink、DCS/APC/PM 与 device response 不执行。
3. Web 只渲染 immutable line/run；SGR concealed cell 不进入 DOM text、screen-reader live region 或 rendered copy。copy 不含
   ANSI/OSC，并再次执行 credential 与 128 KiB budget。
4. stdin 只在 ref 内的 256 chunks/32 KiB queue 短暂存在；单次输入仍受 16 KiB Core budget。断线只以同 bytes/
   clientSequence 重试队首，close、identity drift 与 unmount 清空，不进入 React state、Job history 或 Workspace。

本 Gate 关闭 G2 的有界 Terminal emulator 产品纵切；完整 ECMA-48、graphics、host clipboard、search/selection 与 shell
completion 是 ADR 53 的显式 non-goal，不以 unknown fallback 冒充支持。

## A13/A15/A16 GitHub rootless 与 PostgreSQL evidence

2026-07-19，commit `b9e83a00185a6fa9a4ab2a3e653c9e8579e6f1a2` 的
[G2 Rootless Sandbox run 29692691087](https://github.com/prodivix/prodivix/actions/runs/29692691087) 与
[G2 PostgreSQL Gates run 29692691122](https://github.com/prodivix/prodivix/actions/runs/29692691122) 通过。

| Milestone                     | 远端证据                                                                                                                                                                                                                                              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A13 `workspace.write`         | rootless `prodivix.remote.server-function` 成功返回唯一 canonical result artifact；evidence 保存一个 complete `modified` whole-file diff、exact SourceTrace、Secret absent、runtime network-none、transport exclusion、cancellation/timeout cleanup。 |
| A15 `workspace.read` + Secret | rootless invocation 在 exact `workspace.read` authority 后消费 one-shot sealed Secret，result artifact 与双 SourceTrace 通过；evidence 固定 `secretMaterial=one-shot-consumed`、runtime network-none，明文不进入 artifact。                           |
| A16 collaborator viewer       | rootless read probe 使用唯一 `['workspace.read']` authority，不能执行 write mutation；PostgreSQL 16 的 `TestWorkspaceExecutionViewerRolePostgreSQLGate` 真实通过 role grant/resolve/create、durable permission、revoke 与 invalid role rejection。    |

Rootless evidence artifact id 为 `8444116156`，上传 ZIP SHA-256 为
`ac303a42f9c79e31622b6ab5d1e12f1591e0d99349387b900fcb1e81d1af6561`。A13/A15/A16 因而从
`Configured / Evidence pending` 提升为 `Implemented`；A14 不受该证据替代。

## Remote Test invocation、runtime Issues debugger 与 A17 closure

2026-07-20 本地结果通过；随后取得对应 GitHub Actions 远端证据。

| Gate                        | 本地证据                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/Server Test invocation | `pnpm run verify:g2:auth-server-test-invocation` 通过：Server Runtime 1 file / 4 tests、Compiler 3 files / 27 tests、Browser 1 file / 4 tests、Worker/rootless 2 files / 27 tests、Remote provider 1 file / 19 tests、Golden 1 file / 14 tests。固定 browser filesystem hard cut、private bounded JSONL、canonical report-before-trace、exact capability/fixture/SourceTrace、artifact exclusion 与 credential canary。 |
| Execution Source debugger   | `pnpm run verify:g2:execution-source-debugger` 通过：Runtime Core 3 files / 8 tests、Authoring 9 files / 24 tests、Web 10 files / 44 tests，并通过相关 typecheck。runtime diagnostic 只按 exact Workspace snapshot进入 Issues；private metadata被丢弃，Issues 打开 exact Session Console/error filter后仍使用同一 SourceTrace opener。                                                                                  |
| A17 Workspace collaboration | `pnpm run verify:g2:workspace-collaboration` 通过：Worker 1 file / 20 tests、rootless snapshot contract、Web typecheck + 2 files / 22 tests、Backend remoteexecution/database。另以本机 PostgreSQL 18 运行 `TestWorkspaceExecutionCollaboratorRolesPostgreSQLGate`，真实通过 viewer -> editor upgrade、durable permission、Control Plane create、invalid-role constraint 与 revoke。                                    |

远端证据：

- commit `a993ed11b7550dfa4405807c62fc18fcad0332cb` 的
  [G2 PostgreSQL Gates run 29705222564](https://github.com/prodivix/prodivix/actions/runs/29705222564)
  真实启动 PostgreSQL 16，并由 `TestWorkspaceExecutionCollaboratorRolesPostgreSQLGate` 通过 viewer -> editor、
  durable permission、Control Plane create、constraint 与 revoke Gate；
- commit `e70f9473c22e5448a53668e851897d07de809bd0` 的
  [Tests run 29706186186](https://github.com/prodivix/prodivix/actions/runs/29706186186) 与
  [G2 Data and Second Target Closure run 29706186184](https://github.com/prodivix/prodivix/actions/runs/29706186184)
  通过 Web product、Vue authenticated Catalog 与相关 target matrix；
- 同 commit 的 [G2 Rootless Sandbox run 29706186180](https://github.com/prodivix/prodivix/actions/runs/29706186180)
  通过真实 rootless Podman isolation。artifact `8448024581` 的 ZIP digest 为
  `sha256:1350d335d09b9687a61fbeb60ec534c2faadf1db778a06dd3d6bee4073fe473c`；其中 authenticated
  Vue Catalog Preview/Build/Test全部绑定 snapshot
  `sha256-2fc502ce32ced39232ed915cd505ac38feb17fe523a52391bde03a7bdfb7a74d`，3/3 Test case通过，
  runtime network-none、exact PNG digest与SourceTrace均通过。

A17 因而提升为完整 `Implemented`；该证据不替代 A14 真实 AWS Gate。

## Binary Asset full-raster、required engines 与 cross-target closure

2026-07-20，`pnpm run verify:g2:binary-assets` 完整通过，用时 113.3 秒：

| 子 Gate                    | 本地证据                                                                                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset contract             | `@prodivix/assets` 4 files / 26 tests；固定 PNG/JPEG full-raster public request、reference/materialization与 negative policy。                                                                          |
| Delivery Host              | 8 files / 30 tests；Sharp full decode/re-encode、ClamAV/YARA-X required runtime、rules/binary/freshness/concurrency/timeout hard cut与 capability delivery通过。                                        |
| Workspace/Compiler/Runtime | Workspace 40 files / 170 tests、Compiler 17 / 116、Runtime Core 21 / 91、Runtime Remote 13 / 81全部通过。                                                                                               |
| Golden target matrix       | Execution matrix 1 file / 4 tests、Binary Asset React/Vue matrix 1 file / 4 tests；Browser/Test和 Remote Preview/Test/Build exact bytes、wire locator/digest absence、protected static fail-close通过。 |
| Product journey            | Web 89 files / 327 tests；Chromium Browser JPEG upload、durable reload、full-raster request与 capability-origin decode 1 test通过。                                                                     |
| Boundaries/Backend         | Core package boundaries通过；Backend config/database/workspace/app Go Gate通过。                                                                                                                        |

ClamAV + YARA-X required-engine 远端证据已由 commit `720a788b4635f9c3aa88aba755df57745024d58a` 的
[G2 Binary Asset Malware run 29705674661](https://github.com/prodivix/prodivix/actions/runs/29705674661) 取得。
artifact `8447820146` 的 ZIP digest 为
`sha256:f559eb19d3af23976f6dc25e4ede5682dbe3ca92535e9ce0c959137bb37702f5`；rootless Podman 中
ClamAV 1.4.5/database 28065 与 pinned YARA-X 1.15.0均真实运行，clean verdict、EICAR 与 YARA-X
quarantine finding分别通过，扫描网络为internal-only。

## Current-worktree G2 local aggregate closure

2026-07-20，在不提交、不推送且不调用 Podman/AWS 的前提下，使用本机 PostgreSQL 18显式设置
`PRODIVIX_BACKEND_POSTGRES_TEST_URL`与`PRODIVIX_REMOTE_POSTGRES_TEST_URL`，最终统一入口
`pnpm run verify:g2`以退出码0完整通过，用时596.1s；其四个 aggregate 也已分别重复运行并全部通过：

| Aggregate                       | 结果与关键证据                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:g2:runner-devtools`     | 104.1s通过；Runtime report 3、Vitest adapter 2、Browser Host/Test 19、NodeGraph 14、Animation 16、Remote 84、Golden execution 4、Source debugger Core 9/Authoring 24/Web 47、Terminal Core 26/Web 21、regional DR 6+2+5与最终Web产品39。                            |
| `verify:g2:data-closure`        | 214.6s通过；Data 58、HTTP 17、GraphQL 9、AsyncAPI 9、Core 92、target matrix 20、Remote 84、stream/debugger Web 46、D8 security与Vue deterministic/Remote独立工程 install/typecheck/test/build/Chrome全部通过。                                                      |
| `verify:g2:auth-server-runtime` | 212.0s通过；Auth invocation 27、Server Runtime 52、Workspace 170、Core 92、Remote 84、PostgreSQL adapter 14、Compiler isolated 14、Control Plane 32（仅2个AWS live case按预期skip）、Worker 61、A17 Web 22/真实PostgreSQL、live mutation Web 338与本地managed-KMS。 |
| `verify:g2:binary-assets`       | 116.8s通过；Assets 26、Delivery Host 30、Workspace 170、Compiler 118、Core 92、Remote 84、两组Golden各4、Web 338、Chromium JPEG产品旅程、Backend与package boundary全部通过。                                                                                        |

统一 Gate之后，仓库级`pnpm run lint`通过全部ESLint与Core package/editor hard-cut/PIR-current/
NodeGraph wire/property-name边界；`pnpm run build`通过46/46个可构建任务，包含Web、docs、服务、compiler
与package declaration产物。monorepo `pnpm run test`用时85.5s，83/83个Turbo任务通过，其中Web为
92 files / 339 tests、Golden为58 passed / 5个显式环境条件skip；随后定向复跑Execution Center 19 tests，
并消除了终态Job completion未等待造成的React `act(...)`测试警告。`git diff --check`通过，构建未产生
未追踪的`dist`或其他发布副产物。

新增 `pnpm run verify:g2:rootless-contract` 在无Podman环境中生成、Remote wire round-trip并由Worker strict decoder
消费通用React Golden与authenticated Vue Catalog snapshot；它校验Preview/Test/Build profile隔离、deterministic
Auth fixture、mock CRUD fixture、exact PNG与两个canonical Test case。三份当前digest为：

```text
isolated mutation  sha256-9680cb1ff4fd3ae39a5e46b618ac97068000aad2a7939d8d84b9f7ac2846f8a6
React Golden       sha256-962e6608f5524d459cb92efaac4cdf1b0693ba250baf41810a27973726301358
Vue Catalog        sha256-2fc502ce32ced39232ed915cd505ac38feb17fe523a52391bde03a7bdfb7a74d
```

Vue deterministic generated runtime另外修复了共享客户端图静态导入`node:fs`的真实回归：浏览器fixture现在不获取
filesystem capability，Node Test只通过`process.getBuiltinModule`受限port写bounded JSONL；独立Vue产品Gate与
Auth/Server invocation Gate复跑均通过。该修复保持Worker trace evidence，同时不把Node类型或模块带进Preview/Build。

以上 current-worktree non-cloud closure在 commit `e70f9473c22e5448a53668e851897d07de809bd0` 形成6/6
GitHub workflow全绿证据：CodeQL、G0/G1、G2 Data/Second Target、G2 Rootless、Security与Tests全部通过。

## Global G2 Exit closure

2026-07-20，commit `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184` 将剩余 current-scope non-cloud
closure 提交并直推 `main`。同一 SHA 的 14/14 个自动 GitHub workflow 与 25/25 个 check-run 全部成功：

| Closure 面                                                                                                            | 远端证据                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL、regional operator、Data/Server replay、viewer authority、KMS migration、Asset retention、PIR wire rollout | [G2 PostgreSQL Gates run 29718352791](https://github.com/prodivix/prodivix/actions/runs/29718352791)                                                                                        |
| Browser/Remote/Auth Server execution contract                                                                         | [G2 Execution Contract Matrix run 29718352788](https://github.com/prodivix/prodivix/actions/runs/29718352788)                                                                               |
| Data adapters、controlled Vue target、Remote recovery、D8 security                                                    | [G2 Data and Second Target Closure run 29718352822](https://github.com/prodivix/prodivix/actions/runs/29718352822)                                                                          |
| rootless Podman isolation                                                                                             | [G2 Rootless Sandbox run 29718352806](https://github.com/prodivix/prodivix/actions/runs/29718352806)                                                                                        |
| monorepo Frontend/Backend regression                                                                                  | [Tests run 29718352805](https://github.com/prodivix/prodivix/actions/runs/29718352805)                                                                                                      |
| G0/G1 regression                                                                                                      | [G0 and G1 gates run 29718352813](https://github.com/prodivix/prodivix/actions/runs/29718352813)                                                                                            |
| dependency、CodeQL 与多语言静态安全                                                                                   | [Security run 29718352793](https://github.com/prodivix/prodivix/actions/runs/29718352793)、[CodeQL Advanced run 29718352807](https://github.com/prodivix/prodivix/actions/runs/29718352807) |
| required ClamAV/YARA-X engines                                                                                        | [G2 Binary Asset Malware run 29718352850](https://github.com/prodivix/prodivix/actions/runs/29718352850)                                                                                    |

同一 SHA 的 supporting Gate 也全部成功：[Deploy Smoke run 29718352804](https://github.com/prodivix/prodivix/actions/runs/29718352804)、
[Smoke run 29718352784](https://github.com/prodivix/prodivix/actions/runs/29718352784)、
[Docker Images run 29718352778](https://github.com/prodivix/prodivix/actions/runs/29718352778)、
[Docs Link Check run 29718352834](https://github.com/prodivix/prodivix/actions/runs/29718352834) 与
[Docs Pages run 29718352779](https://github.com/prodivix/prodivix/actions/runs/29718352779)。Rootless evidence artifact id 为
`8451481434`，GitHub artifact digest 为
`sha256:05afda0b6a7f4875f694ce03fe1df566f8e2ba67278944599a7cc0ded5f306f8`。

这些证据关闭了此前 regional batch/operator/source-unavailable、Environment MRK v2 与 PIR wire rollout 的
non-cloud pending。结合本地统一 `verify:g2`、真实 PostgreSQL、rootless real-engine、React/Vue target、产品旅程与
negative security evidence，Global G2 current-scope Exit Gate 判定为 `Passed`。

## 延后的真实云 evidence 与明确 post-G2 边界

以下外部 evidence 仍未取得，不得写成 `Passed`：

- regional DR 首次真实云端 promotion/fencing/RPO/RTO；
- A14 AWS KMS/MRK/OIDC、受保护 `g2-managed-kms` Environment 与 Secrets 的 live run。

这些项目按已批准范围继续保持 external `Configured / Evidence pending`；Global G2 通过不升级 A14 milestone，
不证明真实云部署、真实 MRK 跨区解密或真实 traffic failover 已执行。

以下是明确的 post-G2 adapter/product expansion，不再作为 G2 Passed 的伪阻塞项：

- WebSocket/GraphQL WS、Kafka/MQTT与 durable/cross-execution stream recovery；
- 更高 organization permission/role、第三方 Auth/managed KMS provider；
- 更多 raster格式、额外 malware vendor、durable public-CDN publish/purge与 public Target SDK。
