# G3 Deterministic Replay 与 Runtime Controls 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/runtime-core`、`@prodivix/behavior`、Browser/Remote provider、Data/Animation/Route runtime owners
- 关联：
  - `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md`
  - `specs/decisions/60.nodegraph-typed-flow-and-behavior-debugging.md`
  - `specs/decisions/61.animation-route-composition-and-reduced-motion.md`
  - `specs/implementation/g3-behavior-scenario-authoring-and-composition.md`

## 目标

让 Scenario replay 绑定显式 control profile，而不是依赖 wall clock、随机数、live network、残留 storage、动画
帧时序或固定 sleep。相同 Program、fixture、control profile、target/browser capability 和 toolchain 应产生同一
semantic observation sequence；无法控制的因素必须显式 unsupported/unstable。

## 范围

- `BehaviorControlProfile`、control capability/preflight 与 canonical digest；
- logical clock、random/id、scheduler、network/Data fixture、storage/session isolation；
- viewport/DPR/color/motion/locale/timezone/font/service worker controls；
- condition wait、settle、lane/barrier、bounded concurrency；
- attempt-scoped `ReplayRecord`、divergence detection、fresh replay；
- pause/step/continue debugger 与 SourceTrace；
- Browser/Remote/Export/CI provider conformance。

## 非目标

- 录制真实 HTTP response、生产 cookie/session 或完整 browser profile 供离线重放；
- 承诺不同浏览器像素、字体栅格或性能绝对数值完全相同；
- 让 debugger 修改 canonical Workspace 或从失败位置继续未知 mutation；
- 用全局 monkey patch 破坏第三方 runtime isolation；
- G5 production replay 或真实用户 telemetry。

## Control profile

```ts
interface BehaviorControlProfile {
  id: BehaviorControlProfileId;
  clock: ClockControl;
  random: RandomControl;
  identifiers: IdentifierControl;
  scheduler: SchedulerControl;
  network: NetworkControl;
  storage: StorageControl;
  rendering: RenderingControl;
  locale: LocaleControl;
  serviceWorker: ServiceWorkerControl;
  settle: SettlePolicy;
  budgets: ReplayBudgets;
}
```

Profile 是 Scenario/Policy 引用的 Workspace authoring input 或受控内置 preset。每个 field 必须进入 profile digest，
不得由 provider 默认为本地机器设置而不报告。预检输出 `supported`、`emulated`、`partially-controlled`、
`unsupported` 及 reason；required cell 不接受 silent partial control。

## Clock、random 与 identifier

### Logical clock

- 冻结 epoch、timezone、tick policy 和 maximum virtual duration；
- owner runtime 通过注入式 clock port 读取 `now`、timer、deadline；
- Scenario wait 推进 logical scheduler，而非真实 sleep；
- 外部 tool/browser 无法虚拟的 wall time 只用于 telemetry，不参与 semantic verdict/digest；
- deadline 同时受 virtual budget 和 real safety timeout 保护。

### Random

- 显式 seed + algorithm identity；
- domain owner 从 scoped deterministic stream 派生，避免并发 order 改变其他 domain sequence；
- crypto/security randomness 不被测试 PRNG 替代；若业务依赖 crypto random，使用 fixture seam 或判 unsupported；
- 未声明随机源被 instrumentation 检测后产生 replay divergence。

### Identifier

- attempt、step、action、operation 各自 deterministic namespace；
- external durable id 通过 fixture mapping/normalization 比较，不要求生产算法可预测；
- Evidence identity 使用 Control Plane 分配的 opaque attempt id，不与应用内 deterministic id 混用。

## Scheduler 与并发

统一 scheduler 只控制 canonical task/lane：Scenario、UI event、Data lifecycle、NodeGraph、Animation、Route、
microtask checkpoint 和 declared external completion。它不尝试重写 browser engine 内部所有线程。

- action 提交产生 stable sequence 与 lane；
- parallel group 有显式 max concurrency 和 join policy；
- barrier 等待声明的 participants/conditions；
- same logical time 的 runnable task 按 canonical lane/sequence 排序；
- owner effect 完成必须携带 invocation identity，late/stale completion 被 fencing；
- deadlock、starvation、unbounded task production 产生 bounded diagnostic 和失败。

mutation 不能由 scheduler 猜测重放。只有 G2 已声明 idempotency/replay semantics 的 action 可自动按 Plan retry；
否则从全新 fixture/session 开始 fresh attempt。

## Network 与 Data fixture

required deterministic run 的默认 network policy：deny all egress，只允许：

- loopback/runtime-owned origin；
- content-addressed dependency/artifact materialization 阶段允许的受控入口；
- explicit mock/fixture Data adapter；
- Policy 允许且具备 deterministic recorded fixture contract 的专用 adapter。

禁止把一次 live response 自动录为 fixture。fixture 必须通过 Workspace authoring/approved import，经过 schema、size、
Secret/PII scan 和 stable ordering。Data adapter 用 operation identity、canonical variables、page/cursor/state namespace
匹配；unmatched request fail closed，并在 sanitized Network 中显示原因。

network fault profile 可显式注入 latency、timeout、disconnect、status、chunk/stream order 和 retry-after；参数进入
control digest。DNS、proxy、TLS 和真实 Internet 不得影响 required semantic result。

## Browser state isolation

每个 fresh attempt 使用新的 origin/session namespace，并在 materialize 前清理：

- cookies、local/session storage、IndexedDB、Cache Storage；
- service worker registration/cache；
- in-memory mock/Data/NodeGraph state；
- browser history、route location、focus/selection；
- object URL、worker、websocket/stream 和 timer；
- auth fixture/session capability。

清理后执行 canary probe；失败则 attempt blocked，不能在污染 profile 上继续。retry 默认创建新 namespace，只有
debugger continue 在同一 attempt 内保留 runtime state。

## Rendering controls

profile 明确 viewport、DPR、color scheme、contrast、reduced motion、locale、timezone、font manifest、animation settle、
pixel normalization 和 screenshot region。

- 字体必须来自 content-addressed manifest 或明确 system fallback identity；加载失败 blocked visual cell；
- `prefers-reduced-motion` 与 Scenario/Animation policy 联动，full/reduced 是不同 matrix cell；
- screenshot 前等待 semantic stable condition、font ready、declared animation marker 和 bounded frame settle；
- 不以“network idle”作为唯一 ready 条件；stream/long poll 环境会误判；
- browser-specific raster 差异由 target/browser baseline compatibility 管理，不篡改图像掩盖。

## Condition wait 与 settle

Observation condition 是 typed predicate，例如 visible/enabled/value/data lifecycle/route/animation marker/node port；
禁止任意 page-evaluated JavaScript 和固定 sleep。

wait state machine：

1. 注册 observation subscription；
2. 立即检查当前 normalized state，避免 lost wakeup；
3. scheduler 推进 declared tasks/virtual time；
4. condition 成立时记录 cause/source/sequence；
5. timeout 时输出最后安全 state、pending owners 和 SourceTrace；
6. cancellation 后解绑 subscription，late event 不能完成下一 step。

settle policy 是多条件 conjunction，可包含 render stable、no pending declared effect、specific lifecycle/marker/barrier；
每项均有 budget 和 unsupported semantics。

## ReplayRecord

每个 attempt 产生 bounded append-only record：

- Program/control/fixture/baseline/tool/provider digests；
- initial state manifest；
- instruction/step/action/observation sequence；
- logical clock、lane、barrier 与 normalized state transition；
- external fixture match、fault injection、mutation replay classification；
- diagnostic/artifact/source trace refs；
- completion/cancel/timeout/cleanup outcome；
- truncation counters 和 record digest。

Record 不保存 Secret、raw response body、DOM snapshot、完整 source、cookie/storage value 或 framework fiber。对调试有用
的 state 使用 owner-normalized bounded projection。

## Divergence

replay 将当前 normalized sequence 与参考 ReplayRecord 或同 Plan 重复 attempt 比较：

- `input-drift`：Program/control/fixture/tool identity 不同，不做 semantic replay 比较；
- `capability-drift`：provider support/implementation digest 变化；
- `schedule-divergence`：相同 precondition 下 next canonical event 不同；
- `observation-divergence`：event kind/target/value digest 不同；
- `effect-divergence`：operation/fault/result classification 不同；
- `render-divergence`：semantic stable 相同但 visual artifact 不同，交给 visual adapter；
- `truncated`：任一 record 超预算，不允许宣称 exact replay。

首次 divergence 记录 expected/actual safe projection、step/source 和 preceding window，不继续堆积无限 diff。

## Debugger

Debugger 控制的是 runtime attempt：pause before/after instruction、step、continue、cancel、inspect normalized state/
pending tasks、从头 replay 到 deterministic checkpoint。它不允许回退已发生的外部 effect。

- mutation checkpoint 之后“回到上一步”创建 fresh attempt + fixture reset + replay；
- breakpoint 保存为本地 view preference 或 Scenario step reference，不改变 Scenario semantics；
- debug session Evidence 默认 local-unattested，只有按原 Plan 无人工干预重跑才能 promotion；
- NodeGraph、Animation、Route、Data 都通过共享 debug event envelope，不暴露 editor internal state。

## Provider contract

Provider 在执行前返回 control capability snapshot，并在结果中回显实际 applied profile/digest。Browser、Remote、Export、
CI adapter 必须通过同一 conformance：

- clock/timer/random/id；
- storage/session cleanup；
- network deny/fixture/unmatched；
- viewport/locale/timezone/motion/font；
- condition wait/cancel/late event；
- parallel/barrier/deadlock budget；
- record canonicalization/divergence；
- teardown residual canary。

若浏览器能力只支持部分 virtual time，Policy 可选择 semantic-only cell；visual/performance required cell 必须使用具备
所需 control 的 provider，不能谎报 full control。

## 实施阶段

### R0：Control model 与 preflight

- current model、preset、digest、capability snapshot；
- provider preflight 和 unsupported diagnostics；
- logical clock/random/id ports。

完成条件：profile 未声明/未应用字段可检测，跨 provider digest 一致。

### R1：Scheduler、wait 与 isolation

- canonical lane/task/barrier；
- typed observation wait；
- fresh browser/session reset、cleanup canary；
- cancellation/late completion fencing。

完成条件：race/deadlock/timeout/property tests 和污染 session negative Gate 通过。

### R2：Network/Data/render controls

- deny-by-default network、fixture matcher、fault profile；
- storage/service worker、viewport/DPR/color/locale/timezone/font/motion；
- semantic settle 与 screenshot readiness。

完成条件：live egress/unknown fixture/font failure 均 blocked，full/reduced 两 cell 可重复。

### R3：ReplayRecord、divergence 与 debugger

- bounded event codec/digest；
- repeat comparison/divergence；
- pause/step/fresh replay/SourceTrace UI。

完成条件：相同输入重复序列一致；注入 race/random/network drift 能在首个原因定位。

### R4：Cross-surface conformance

- Browser/Remote/Export/CI adapters；
- React/Vue Golden；
- worker crash/recovery、retry 与 cleanup。

完成条件：同 Scenario 在所有 required surface 产生 compatible record；unsupported provider 不生成 trusted pass。

## 验证证据

计划 Gate：`pnpm run verify:g3:deterministic-replay`。

必须覆盖：

- clock/timer/timezone/deadline、random stream isolation、id namespace；
- same-time scheduling、parallel/barrier、deadlock/starvation/task flood；
- condition lost-wakeup、timeout、cancel、late completion；
- storage/cookie/IndexedDB/cache/service worker/auth state residual canary；
- network deny、unmatched fixture、pagination/stream/fault/retry；
- viewport/DPR/font/color/motion/full/reduced settle；
- ReplayRecord codec/budget/digest/Secret canary；
- schedule/observation/effect/tool/capability divergence；
- Browser/Remote/Export/CI and React/Vue conformance。

## 风险与停止条件

- required runtime factor 无法声明或控制时，该 cell blocked/unsupported，不生成可信 Evidence。
- 任意 domain 绕过 injected clock/random/scheduler 后出现 divergence，停止 Golden closure，先补 owner seam。
- isolation cleanup canary 失败时销毁 provider/session，不尝试“清一点再继续”。
- live network/production credential 被请求时立即取消 attempt 并触发 security diagnostic。
- Record 超预算或 redaction 不完整时不能用于 exact replay/evidence promotion。
- debugger 遇到未知外部 mutation 时只允许 fresh replay，不提供伪 time travel。

## 验收标准

- [ ] required run 的所有可控 factor 均显式进入 profile/capability/result digest。
- [ ] Scenario 使用 typed condition 和 canonical scheduler，不依赖固定 sleep。
- [ ] 每次 retry/replay 有新 attempt 与全新隔离 state，mutation 语义不被猜测。
- [ ] ReplayRecord bounded、Secret-free、可定位首个 semantic divergence。
- [ ] Browser/Remote/Export/CI 对同一 Scenario 提供声明一致的 control conformance。
