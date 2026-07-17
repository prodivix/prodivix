# G2 DataOperation、Environment 与 Protocol Runtime 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：D0-D2 Implemented / D3-D4、D6-D8 In Progress / D5 Planned
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-17
- Owner：`@prodivix/data`、`@prodivix/data-http`、`@prodivix/data-mock`、
  `@prodivix/runtime-core`、protocol/runtime adapters、`@prodivix/prodivix-compiler`、composition root
- 关联：
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/implementation/g2-execution-provider-remote-runner.md`
  - `specs/decisions/45.data-operation-and-environment-reference-foundation.md`
  - `specs/decisions/38.blueprint-component-instance-and-collection.md`
  - `specs/diagnostics/data-diagnostic-codes.md`

## 目标

把当前已经冻结的 DataSourceDocument、DataOperationReference、PIR/Collection binding 与 lifecycle
contract 落成可执行的数据应用纵切：用户声明或导入 operation，绑定 query/mutation，选择 mock 或
live environment，在 Browser/Remote Preview 与 Test 中执行，并让 standalone Export 保持相同的
schema、policy、lifecycle、权限和诊断语义。

G2 完成的标志不是“能发一个 fetch”，而是同一 CRUD journey 在作者表面、Preview、Test 与导出
工程中可重复运行，且 Secret、缓存、重试、分页、乐观更新和协议差异都有明确 owner 与 fail-closed
边界。

## 当前基础与真实缺口

### 已实现

- 无版本号的 `DataSourceDocument` current model，wire version 仅存在于 codec/persistence 边界。
- JSON Schema 2020-12 shape、query/mutation、cache/retry/pagination/optimistic policy contract。
- `DataOperationReference { documentId, operationId }` 与 `data-source` Workspace typed document。
- Data semantic contribution、diagnostic target、definition/reference/resolution 基础。
- PIR `logic.dataById` durable binding、Collection local `dataId` source 与显式 lifecycle mapping。
- 单个可逆 Workspace Transaction 原子写入 binding、source 与 lifecycle。
- `ExecutionEnvironmentSnapshotRef`、`EnvironmentBindingReference`、`SecretRef` reference-only contract。
- compiler/renderer 的 lifecycle projection port。
- transport-safe invocation、mock/live-aware adapter registry、exact DataSourceDocument execution、
  input/output JSON Schema 2020-12 preflight、instance-owned lifecycle stale fencing、
  deterministic retry scheduler/backoff、offset/cursor pagination input/page fencing、
  loading/success/empty/error execute kernel 与 operation/invocation/sequence/attempt Network correlation；
  mutation 在没有显式 idempotency contract 时禁止自动 replay。
- 独立 Browser live HTTP adapter/client-safe fetch，以及 session-scoped deterministic mock fixture adapter；
  mock 能在不改写 canonical source adapterId 的前提下覆盖协议 adapter。
- `@prodivix/runtime-core` 的 environment snapshot/permission/material ports 与短期 resolution lease；exact
  revision/mode/binding kind、adapter field、runtime zone、execution class、provider isolation、expiry/revoke
  在 transport effect 前 fail closed。Data runtime 已接 preflight，HTTP public binding 与 server-side
  authorization Secret 只在获准 transport callback 内消费，lease/audit/result/Network canary 不含明文。
- Data cache policy kernel：bounded instance-owned LRU store、SHA-256 key、RFC 6901 input selection、exact
  document/environment/runtime/adapter/target/principal partition，以及 cache-first/network-first/
  stale-while-revalidate/no-store execution；携带 Secret binding 但缺 principal partition 时强制 no-store。
- Data optimistic CRUD kernel：instance-owned compare-and-swap projection、invocation/sequence owner、显式
  input/output/entity RFC 6901 mapping、authoritative reconcile、error/cancel inverse rollback，以及旧 owner
  无权覆盖新 mutation 的 revalidation signal。
- Data trigger/dispatch kernel：route/document/refresh/input-change/pagination/Blueprint event/CodeSlot/Test
  typed origin，literal/trigger/runtime/object/array/CodeSlot input mapping，monotonic sequence、canonical query
  equality、mutation dispatch identity replay fencing，以及 Browser execute composition。
- React/Vite generated runtime 已从同一 Data current model 投影 public client live HTTP：显式 mock/live
  runtime manifest、JSON Schema 2020-12、retry、offset/cursor response mapping、bounded SHA-256 cache、
  optimistic CRUD/revalidation 与 sanitized Network correlation；environment/Secret 配置和非 client zone
  不进入 public client fetch。Remote Preview 的 server/edge query/mutation 通过 value-only strict invocation bridge
  交给父窗口 product-authenticated Backend gateway；父窗口以 exact active frame、opaque origin 与 generation
  fence 校验请求，Preview Host CSP 仅开放当前 hash capability origin 的 runtime asset 读取。Browser Preview
  iframe 仍只允许 exact active frame/origin 的严格 Network bridge message 进入当前 Execution Job。
- Remote mutation dispatch 使用 runtime-unique UUID invocation；Backend PostgreSQL ledger 在 effect 前
  原子 claim，并以 SHA-256 fingerprint 绑定 exact snapshot/environment/document/input/method/endpoint/sequence。
  completed duplicate 只读取 sanitized result，identity drift、pending 与 indeterminate outcome 不再次访问上游；
  显式 `invocation-key` policy + bounded retry + HTTP `idempotencyHeader` mapping 会生成不含 input/Secret/raw
  identity 的 opaque key；v3 ledger 只把 retryable outcome 原子释放给紧邻下一 attempt，所有 attempt 复用
  同一 upstream key。无 contract 时 attempt 仍固定为 1；这不宣称 distributed exactly-once。ledger 每个
  execution 最多 256 项，replay result 受约 1.25 MiB 预算限制，并随 execution authority 级联清理。
- 独立 `G2 PostgreSQL Gates` GitHub workflow 已将 Backend replay ledger 与
  `@prodivix/runtime-remote-postgres` Control Plane adapter 放入同一 PostgreSQL 16 service Gate。Backend
  integration 使用随机 schema 跑完整 migration，并真实验证 24 路同 identity 竞争只能产生一个 claim、
  16 路竞争最后容量槽只能插入一项、每个显式释放 retry attempt 仍只有一个 claimer、成功结果重放、
  identity drift/indeterminate fence 与 authority cascade。
  claim 先以独立语句获取 execution advisory transaction lock，再在新的 READ COMMITTED statement snapshot
  中读取 identity/count；不得把 lock 放入 capacity CTE，否则等待者会沿用锁前 snapshot 越过 256 上限。

### 尚未实现

- 完整 Remote live parity；当前 generated Remote Preview 已接 execution-bound server/edge HTTP
  query/mutation gateway、durable replay/idempotency fence，以及 exact active-job Session observation。
  finite Remote Preview 终态后产生的 metadata-only Network trace 通过 generation/stale fence、有限去重与
  总 retention 预算进入产品 Session；manual cancellation/new-request restart 已完成，reconnect、artifact/
  quota/worker-loss recovery presentation 仍待完成。
- production Environment/Secret store first vertical、principal/session partition 与 durable permission/audit
  adapter 已落地；Remote create authority 已接 authenticated session 与 exact environment/snapshot preflight，
  server HTTP gateway/material resolution first vertical 已组合 exact Data revision、短期 grant 与公网 HTTPS/
  SSRF policy；generated query bridge/CSP 已接入。Remote request/snapshot/cache/event/log/diagnostic/trace/
  artifact/test-report/crash durable surface canary Gate 已闭环；Structured Console 已增加 generated/bridge/
  core/copy 多层 credential redaction；Remote Terminal 已增加 Worker/Control Plane 双边、stdout/stderr 分流的
  transport-wide/cross-chunk canary 与 bounded copy redaction。key rotation/KMS adapter 继续建设。
- HTTP/OpenAPI、GraphQL、AsyncAPI importer/runtime adapter。
- 完整 Data editor/Inspector/Issues/Network 产品旅程。
- Preview/Test/Export 和第二 target 的 CRUD parity。

当前 Browser/generated public client、mock lifecycle 与 Remote server/edge query/mutation gateway first vertical
已可执行，Remote Data Network、Structured Console、manual new-request recovery 和显式 upstream mutation
idempotency/retry 也已关联产品 Session；但完整 Remote failure recovery、跨表面 correlation/canary 和第二 target 尚未闭环。这是明确
边界，不能描述为完整 Data runtime。

## Canonical 与运行态边界

| 内容                                                              | Owner / 持久性                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| DataSourceDocument、schema、operation、policy、adapter config ref | Canonical Workspace 作者态                                  |
| PIR local binding、Collection source/lifecycle mapping            | PIR 作者态                                                  |
| environment identity/revision/mode reference                      | ExecutionRequest identity，不含值                           |
| resolved public binding/Secret lease                              | provider execution-local，短生命周期                        |
| invocation、attempt、cache entry、page cursor、optimistic patch   | runtime/session-local，可丢弃                               |
| lifecycle snapshot                                                | document-instance runtime projection，可丢弃                |
| protocol trace、console、test report                              | execution diagnostics，可丢弃/有 TTL                        |
| importer proposal/provenance                                      | proposal + canonical metadata；应用走 Workspace Transaction |

任何 runtime value、response、cache、Secret 或 optimistic state 都不能成为 Data editor 私有持久化
镜像。需要保存的结构变化必须生成 proposal/impact/diff，再进入 Command/Transaction/Outbox。

## 核心运行 contract

### DataOperationInvocation

运行层需要无协议含义、transport-safe 的 invocation：

- stable `invocationId` 与 monotonic sequence；
- exact `DataOperationReference` 与 data document revision；
- `ExecutionEnvironmentSnapshotRef`、runtime zone、provider/session identity；
- schema-bound input、trigger origin、diagnostic target 与 source trace；
- explicit activation mode、pagination action 与 optional idempotency key；
- required capabilities、deadline/cancellation 和非秘密 correlation metadata。

它不保存 endpoint、header、credential、fetch callback、React event、DOM node 或 adapter object。

### Trigger 与 activation

G2 至少支持：

- query：route/document activation、显式 refresh、input dependency change、pagination action；
- mutation：Blueprint event/command 或明确 code slot dispatch；
- Test：fixture-controlled explicit invocation；
- NodeGraph/Animation：G2 不自动开放 privileged invocation，待相应 typed binding/capability ADR。

query dependency change 使用 canonical input equality 和 stale fencing；mutation 永不因 render、重复
订阅或 reconnect 自动重放。事件参数先经类型化 input mapping，code-owned transform 通过 CodeSlot /
CodeReference，不在 PIR 或 operation 保存裸函数。

### Lifecycle state machine

```text
idle
  -> loading(invocationId, attempt, startedAt)
  -> success(value, optional page)
  -> empty(optional page)
  -> error(code, retryable, safe details)
```

- `empty` 必须由 adapter/output mapping 或 operation policy 显式判断，不能从 `[]`、`null`、空对象或
  falsy value 猜测。
- 每次 transition 携带 operation reference 与 sequence；旧 invocation/attempt 不能覆盖新 snapshot。
- cancel、supersede 和 dispose 不伪装成 error；是否回到 idle 或保留上次成功值由明确 query policy
  决定。
- renderer 只投影与当前 document instance、local `dataId` 和 durable operation reference 精确匹配
  的 snapshot。

## Runtime kernel 与 adapter registry

`@prodivix/data` 拥有协议无关的 runtime kernel contract 和 policy semantics；具体 HTTP、GraphQL、
AsyncAPI adapter 位于独立 adapter package/registration boundary。registry descriptor 至少声明：

- stable adapter id/version 与 supported operation kinds；
- runtime zones、environment-binding、network、stream 等 capability；
- configuration schema：literal/environment-ref/secret-ref 的字段级要求；
- compile/runtime target support；
- invoke/cancel 与 optional import/introspection contribution。

registry 不拥有 DataSourceDocument、binding 或 Secret。未知 adapter、版本/capability 不匹配、缺失
binding 或配置字段必须在 compatibility/preflight 阶段 fail closed。

Runtime kernel 负责：

1. resolve exact document/operation/revision；
2. validate and normalize input；
3. authorize zone/environment/bindings；
4. 计算 cache/retry/pagination/optimistic plan；
5. 调用 adapter 并关联 cancellation/deadline；
6. validate output、显式判定 empty/page；
7. fence stale result、reconcile optimistic patch；
8. 发布 bounded lifecycle/diagnostic/network trace。

## Policy 语义

### Cache

cache key 至少 partition：

```text
operation reference + data document revision + canonical input
+ environment id/revision/mode + runtime zone
+ adapter id/implementation digest + target
+ principal/session partition
```

Secret value不进入 key。若无法获得安全的 principal/session partition，则受鉴权 query 默认
`no-store`。cache entry 保存已验证 output 与 metadata，不保存 Secret、auth header 或未脱敏 trace。
stale-while-revalidate 只能由新 sequence 更新；旧 revalidation 不覆盖新 input/revision。

当前实现使用 content-only SHA-256 digest，不向 result 暴露 raw key payload；`keyInputPaths` 是 RFC 6901
JSON Pointer。`cache-first` 只消费 fresh entry，`network-first` 仅在 retryable adapter failure 后使用
仍在 fresh/stale retention window 内的已验证 entry；鉴权/permission 等 non-retryable failure 不回退。
SWR stale hit 只返回 `revalidationRequired: true`，由产品层以新 sequence 显式调度，不在旧 invocation
内启动不可见后台请求。

### Retry

- query 仅对 adapter 标记 transient/retryable 的错误按 policy 重试。
- mutation 默认不自动重试；只有 adapter/operation 声明幂等，且 invocation 具有 stable
  idempotency key 时才允许。
- retry 使用注入 clock/scheduler、bounded attempts、deadline 和 cancellation。
- 每次 attempt 进入 lifecycle/network correlation；Secret 或 raw response 不进入 diagnostic details。

当前 `invocation-key` 是 protocol-neutral 作者态语义；HTTP wire mapping 由 operation public
`idempotencyHeader` 提供。`@prodivix/data-http`、React/Vite standalone runtime 与 Backend Remote gateway
都从 attempt-invariant invocation facts 派生 opaque SHA-256 key。adapter 必须声明 `idempotency-key`
capability；header 缺失、大小写不 canonical、reserved/credential header、attempt 跳号或 policy drift
均在 transport effect 前 fail closed。

### Pagination

- offset/cursor input 和 output path 在执行前按 schema 验证。
- next/previous/refresh 是显式 invocation action；旧 page response 不能覆盖新的 query/input。
- merge/replace 规则需由 operation/consumer 明确，不从数组 shape 猜测。
- cursor 是 runtime value，默认不写 Workspace；敏感 cursor 进入 Devtools 前脱敏。

### Optimistic CRUD

- optimistic effect 生成 versioned patch + inverse patch，绑定 invocation、base sequence 与 target
  operation cache partition。
- success 以 authoritative response reconcile；error/cancel 按 policy rollback。
- rollback 仅撤销仍由该 invocation 拥有的版本，不能覆盖后续 mutation 或新 query result。
- concurrent mutation 顺序、entity identity 和 temporary id replacement 必须确定；无法证明时禁止
  optimistic apply，而不是猜测。

## Environment、Secret 与授权

Environment registry/stores 不属于 Workspace。一次执行只携带 immutable
`ExecutionEnvironmentSnapshotRef`，provider 在获准 zone 通过 resolver 获取：

- public/runtime-safe binding value；
- execution/operation-scoped opaque Secret lease；
- principal/session partition identity；
- network/adapter permission 和 expiry。

要求：

- mock/live 明确分离；Test 默认 mock，mock miss fail closed，绝不 fallback live。
- Secret resolver 检查 Workspace/project、environment revision、provider、runtime zone、operation、
  adapter field 与用户/organization permission。
- `worker` zone 本身不代表可信 server worker；resolver 还必须验证 provider execution class、
  isolation 和 deployment policy。browser/shared worker 或未分类 worker 默认拒绝 Secret。
- client-only target 不能 resolve server/edge Secret。受保护 operation 必须通过 server gateway /
  full-stack target，或在 compile/preflight 阶段报错。
- lease 短期、不可序列化、不可重放到其他 job，cancel/timeout/dispose 后 revoke。
- request、snapshot、source、log、diagnostic、Network、report、artifact、cache、Git 和 client bundle
  全部通过 canary leak Gate。

Auth/session/permission/server function 仍缺专门 ADR。G2 在其 Accepted 前只能实现上述引用、授权
port 与拒绝路径，不能让 Data adapter 私自建立登录/session 保存态。

## Protocol adapters

### HTTP + OpenAPI

G2 第一完整 adapter：

- method/path/query/header/body/response/status mapping；
- configuration schema 强制 auth field 使用 SecretRef/environment-ref；
- redirect、DNS resolution、private/link-local/metadata address 与 egress allowlist 的 SSRF 防护；
- abort、timeout、retry、pagination、Network trace 与 safe error mapping；
- OpenAPI import 生成 DataSourceDocument proposal、schema/operation stable ids 与 provenance；
- reimport 计算 diff/impact，保留用户扩展并通过 Workspace Transaction 应用。

Importer 不是网络执行器，imported spec 不是第二真相。外部文档变化不会自动覆盖 Canonical
DataSourceDocument。

### GraphQL

- endpoint/source binding、document/operation selection、variables 与 output schema mapping；
- query/mutation 映射现有 operation kinds；
- GraphQL errors 与 partial data 的显式 policy；
- persisted query、auth、pagination 和 trace 走共享 contract。

subscription 不在当前 query/mutation + finite lifecycle 内。不得用 query 假装 subscription。

### AsyncAPI

当前 G2 contract 只安全覆盖 publish 或 request/reply 这类有限 invocation。长期 subscription 需要
stream lifecycle、message ordering、backpressure、reconnect、resume cursor、dispose 和 collection
incremental update 语义，必须先修订 ADR/current model。

因此 G2 二选一并在开工前冻结：

1. 只实现能够映射为 finite mutation/query 的 AsyncAPI capability，并对 subscription 发布稳定
   unsupported diagnostic；或
2. 先接受 stream extension ADR，再实现完整 subscription contract。

不允许 adapter 私有 event emitter 绕过 Data lifecycle、Session、Network 与 cancellation。

## Import、编辑与重新导入

- import 是 proposal，不是直接写 Workspace；用户检查 target、operation/schema 数量、auth requirement
  与 diagnostics 后提交原子 Transaction。
- provenance 记录 source kind、stable external identity、last imported digest 和 mapping，不包含 credential。
- reimport 以 stable identity 匹配 rename/move，区分 upstream change、local edit 与 conflict。
- 删除/改变 schema 前运行 Workspace Semantic Index impact；失配引用 fail closed。
- 自定义 transform/auth/response mapping 的代码进入 Code Authoring Environment/CodeSlot。

## 实施阶段

### D0：Canonical foundation

- [x] current model、wire codec、strict validation 与 normalization。
- [x] Workspace document、semantic contribution 与 diagnostics target。
- [x] PIR/Collection durable binding、explicit lifecycle 与 atomic authoring transaction。
- [x] environment/Secret reference-only contract。

### D1：Invocation 与 lifecycle kernel

- [x] 定义 transport-safe invocation identity、typed trigger origin/input mapping、activation、attempt/start、
      cancellation port 与 loading/success/empty/error execute projection。
- [x] query route/document/refresh/input-change/pagination、Test activation 与 Blueprint event/CodeSlot/Test
      mutation dispatch；canonical input equality、monotonic sequence、duplicate mutation identity 与
      disconnect-after-dispatch replay 均 fail closed，Browser composition 已接入。
- [x] exact DataSourceDocument input/output JSON Schema validation、explicit empty、bounded value/issue
      projection，以及 instance-owned lifecycle channel 的 duplicate/stale/superseded fencing。
- [x] deterministic retry scheduler、fixed/exponential bounded backoff、attempt lifecycle/Network correlation，
      cancellation/supersede fencing，以及无 idempotency contract 的 mutation replay denial。
- [x] dispatch deterministic clock/id ports；完整 bounded lifecycle diagnostics 继续建设。

完成条件：in-memory fake adapter 可驱动完整 lifecycle，不依赖 React、fetch 或 provider SDK。

### D2：Adapter registry 与 mock runtime

- [x] descriptor/operation kind/runtime zone/mode/capability registry 与 fail-closed compatibility。
- [x] deterministic mock adapter、immutable fixture store/reference、exact-input/fallback、bounded delay、
      error、page 与 query/mutation result behavior。
- [x] registry mock-only adapter emulation；同一 canonical source 的 live/mock 运行实现隔离，Browser Test
      Data composition 默认 mock，missing/ambiguous fixture fail closed，live 必须显式 opt-in。
- [x] mock runtime session/dispose fencing，并复用 Data kernel 的 lifecycle/Network trace port；mock
      本身不伪造网络请求。
- [x] `ExecutableProjectSnapshot v4` 保存有界 `dataMockProvision` 并纳入 content digest；Compiler 可显式
      投影该运行环境输入，Remote strict codec round-trip，Browser Test 从 exact snapshot 创建 mock session。
- [x] fixture provision 可声明 immutable initial collection 与 CRUD behavior；每个 runtime session 必须
      使用显式 namespace 持有独立可变副本，create/update/delete 不修改 snapshot，reset/dispose 清理状态。

完成条件：CRUD fixture 在 interactive（允许范围）、Browser Preview 和 Browser Test 语义一致。

### D3：Environment、Secret 与 zone permission

- [x] transport-neutral environment snapshot/permission/material ports、public binding resolver、exact revision/
      mode/binding-kind check 与短期 resolution lease。
- [x] Secret callback lease、operation/adapter field/runtime-zone/execution-class/provider-isolation permission
      matrix；client/build、same-context/shared worker 默认拒绝，trusted isolated server path 才能注入。
- [x] expiry/revoke、principal/session-bound resolution/cache partition 与 value-free audit metadata。
- [x] Backend PostgreSQL production store first vertical：immutable revision、AES-256-GCM authenticated
      encryption、exact binding/field durable grant、callback-only material 与 API/at-rest/use canary Gate。
- [x] Data/HTTP effect 前 preflight 与首条 result/Network/audit Secret canary suite；Backend execution-bound
      Remote HTTP/material gateway query/mutation first vertical 已绑定 exact snapshot/document revision、principal/session、
      短期 grant、public HTTPS/SSRF policy 与 metadata-only Network trace；generated Remote Preview 已通过
      value-only bridge、exact frame/generation fence、父窗口 authenticated client 与 capability-origin CSP 接入。
      Remote Network 已通过 strict result codec 与 exact active-job Session observation 关联产品视图，并在
      generation replacement/stop 后拒绝 stale result。React/Vite target manifest 默认 static-client，只有
      execution parent gateway target 可编译 server/edge Data；snapshot/provider/request 精确传播 `network`/
      `environment-binding`，Browser/ZIP export fail closed，生成 source/diagnostic/snapshot 不投影 Secret
      identity。Remote 当前 durable 输出的 log/diagnostic/trace/artifact/report/cache/crash canary 已由 Worker +
      Control Plane 双 Gate 覆盖；Structured Console copy 与 Remote Terminal transport-wide/cross-chunk、
      stdout/stderr 分流和 bounded copy redaction 已完成，key rotation/KMS adapter 仍未完成。

完成条件：未授权、错误 zone、stale environment 或缺 binding 均在执行前稳定拒绝；无明文泄漏。

### D4：HTTP runtime 与 OpenAPI importer

- [x] 独立 `@prodivix/data-http` 的 Browser live HTTP 第一纵切：query scalar mapping、mutation JSON、
      abort、safe status/error、显式 empty、exact document schema preflight 与注入式 transport；
      retryable HTTP status 已进入共享 retry executor；public environment configuration 和授权 server
      Secret transport injection 已复用同一 resolution lease；timeout/完整 policy 继续建设。
- [x] retry policy 与 offset/cursor pagination input/default/page consistency 第一实现；retry attempt 使用
      独立 correlation，policy budget、ambiguous input 和 undeclared/missing/drift page 均 fail closed。
- [x] bounded cache executor、canonical key partition、四种 strategy、Browser instance composition 与
      stale revalidation signal；authenticated query 缺 principal partition 时 no-store。
- [x] optimistic create/update/delete executor、target partition owner/version fencing、authoritative output
      reconcile、error/cancel rollback 与 concurrent mutation property test；旧 inverse patch 不能覆盖新 owner。
- [x] HTTP offset `totalPath` 与 cursor next/previous response path mapping；missing/invalid mapping fail closed，
      不从 value shape 猜测 page。
- [ ] OpenAPI import proposal、provenance、stable id、reimport diff/impact/conflict。
- [ ] Data editor/Inspector/Issues/Network 产品纵切。

完成条件：HTTP CRUD Golden 支持 mock/live、错误、重试、分页和 optimistic rollback。

### D5：GraphQL 与 AsyncAPI 有限能力

- [ ] GraphQL query/mutation、variables、partial error 与 pagination mapping。
- [ ] AsyncAPI scope checkpoint：finite-only 或先接受 stream ADR。
- [ ] importer/runtime conformance 与稳定 unsupported diagnostics。
- [ ] 不允许 adapter 私有 lifecycle/Secret/session。

完成条件：宣称支持的 capability 通过同一 runtime contract；未支持 shape 在 import/preflight 失败。

### D6：Preview/Test/Remote integration

- [x] Browser 已接 protocol-neutral registry + HTTP + client-safe fetch；Backend Remote HTTP/environment
      resolver first vertical 与 generated Remote Preview server/edge query/mutation invocation bridge/CSP 已建立。
- [x] Browser Network trace 已 correlation 到 operation/invocation/sequence/attempt/source trace，并进入
      active Project Job/Session；generated iframe 通过 strict envelope、exact origin 与 exact frame source
      复用该 Job trace，Console/Test correlation 继续建设。
- [x] Browser Test Data composition 已具备 deterministic fixture、live opt-in、exact Executable Snapshot
      provisioning 与 session-namespaced CRUD cleanup；Browser Host、filesystem adapter 与 rootless Worker
      从同一 snapshot 投影 mock runtime asset。生成 React/Vite runtime 已对 PIR query binding 发布
      loading/success/empty/error 并订阅刷新，Remote Preview/Test 通过同一 Worker 文件投影消费；Browser
      typed mutation dispatch 已接共享 execute kernel；standalone generated mock runtime 已执行 mutation CRUD
      并重校验已激活 query，public client live HTTP 已执行 schema/retry/pagination/cache/optimistic 与 Network
      correlation；Remote server/edge query/mutation 已经父窗口 gateway 执行并返回 metadata-only Network，
      mutation effect-before durable replay fence 已完成；Remote Network 使用 exact active Job identity 的
      bounded Session observation，并对 generation replacement、stop、重复结果和 identity drift fail closed。
- [ ] 完整 Remote Test/live policy parity、跨 Console/Test correlation 与 recovery presentation。
- [x] Remote mutation identity drift、concurrent pending 与 disconnect/crash 后 indeterminate outcome 不重复 effect；
      completed duplicate 返回相同 sanitized result。
- [x] 显式 upstream `invocation-key` idempotency/retry contract：canonical policy、adapter capability、HTTP
      header mapping、React/Vite public/Remote runtime、Backend v3 next-attempt ledger 与并发 Gate 已闭环。
- [ ] cancellation/timeout 后的产品 stale-result/recovery presentation。

完成条件：相同 snapshot/environment/fixture 在 Browser/Remote 得到相同 lifecycle/test outcome。

### D7：Compiler 与 target parity

- [x] React/Vite executable snapshot 对 Data runtime 显式投影 mock/live manifest；public live Data 项目声明
      `network` capability，Test 强制 mock，missing fixture 不回退 live。
- [x] React/Vite Data runtime target manifest 与 server-gateway compile Gate：默认 static-client；server/edge
      只有 execution parent gateway target 可通过；Remote Preview 声明 `network`/`environment-binding`，
      Browser/ZIP export、client environment reference 与 live worker/build/test Data zone 均稳定阻断；Workspace
      Test 使用强制 mock-only target，若 provider 错投 live manifest 则运行前拒绝。
- [x] React/Vite standalone query/mutation runtime 已不依赖 editor/backend 私有 runtime，执行 durable
      activation/input/event、mock CRUD 与 public client live HTTP/policy，并通过强制
      install/typecheck/test/build Gate。
- [ ] 单一第二 target 使用相同 Data current model、policy kernel 和 conformance fixtures。
- [ ] 第二 target 的 client/server/edge split、Secret exclusion、install/typecheck/test/build/browser-smoke。

完成条件：不能安全导出的 capability fail closed；两个 target 运行同一 CRUD journey。

### D8：Golden 与 closure

- [ ] 完整 CRUD、loading/empty/error/retry/pagination/optimistic journey。
- [ ] HTTP/OpenAPI、GraphQL 和冻结范围的 AsyncAPI capability matrix。
- [ ] mock/live、Browser/Remote、Preview/Test/Export、两个 target matrix。
- [ ] property tests：cache partition、stale fencing、retry idempotency、optimistic concurrency。
- [ ] Secret canary、network redaction、mock-miss 和 client-only denial security Gate。

完成条件：证据进入 `g2-closure-evidence.md`，再更新 G2 ProductGateStatus。

## 横向 Gate

| Gate        | 断言                                                                            |
| ----------- | ------------------------------------------------------------------------------- |
| Identity    | 所有执行使用 exact DataOperationReference + document revision                   |
| Schema      | input/output 在 adapter 边界验证，错误定位 operation/schema/source trace        |
| Lifecycle   | empty 显式、sequence fencing、旧 invocation 不覆盖新状态                        |
| Policy      | cache 正确 partition；mutation retry 幂等；optimistic rollback 有 owner/version |
| Environment | mock/live 不混用；stale/missing reference fail closed                           |
| Secret      | 仅授权 zone resolver 持有短期 lease，全链路 canary 无泄漏                       |
| Protocol    | adapter 不改变 canonical model，不建立私有 lifecycle/session                    |
| Parity      | Preview/Test/Export、Browser/Remote、两个 target 同语义                         |
| Persistence | response/cache/lifecycle/runtime FS 不进入 Workspace/Outbox                     |

## 风险与停止条件

- 若 invocation 仍由组件 render 或 Web hook 隐式触发，先建立显式 activation/trigger contract。
- 若 success 的 value shape 被用来猜 empty，修正 adapter/output mapping，不加 UI 条件分支。
- 若 cache 未按 revision/environment/zone/adapter/principal partition，关闭该 operation cache。
- 若 mutation 没有幂等 contract，禁止自动 retry/reconnect replay。
- 若 mock miss 会访问 live、Test 会访问生产 mutation，立即 fail closed。
- 若 optimistic inverse patch 可能覆盖新 sequence，禁用 optimistic apply 直到 version ownership 完成。
- 若 importer 直接覆盖 Workspace 或丢失 provenance，改为 proposal/diff/Transaction。
- 若 AsyncAPI subscription 需要无限 stream，先接受 stream ADR，不在 adapter 私有实现。
- 若 client-only export 需要 Secret，要求 server gateway/full-stack target 或拒绝构建。
- 若 Auth/Session/Server Function 未有 ADR，禁止 Data adapter 自建持久化或权限真相。

## 验收标准

- [x] Canonical Data、PIR binding/lifecycle 和 reference-only environment foundation 完成。
- [x] query/mutation invocation、transport-neutral trigger/input dispatch、schema 和 deterministic lifecycle kernel 完成。
- [x] PIR/Inspector trigger/input durable authoring与 React/Vite generated runtime execution projection 完成。
- [x] adapter registry、mock/live、policy executor 与 HTTP runtime 已形成 public client 与 Remote
      server/edge gateway first vertical。
- [ ] OpenAPI importer 与完整 Remote parity 尚待完成。
- [ ] GraphQL 和明确冻结范围的 AsyncAPI capability 完成。
- [ ] Environment/Secret resolver、zone permission 和 leak Gate 完成。
- [ ] Browser/Remote Preview/Test 与 standalone 两 target CRUD parity 通过。
- [ ] 没有第二套 Data truth、私有 runtime lifecycle 或 Secret 明文旁路。
