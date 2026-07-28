# G3 Behavior & Verification Closure milestones

> 本文件是 G3 阶段状态的唯一里程碑来源。Global Phase 退出条件见
> [`global-phases.md`](global-phases.md)，总实施编排见
> [`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)，
> ADR 索引见 [`../decisions/README.md`](../decisions/README.md)，退出证据结构见
> [`g3-closure-evidence.md`](g3-closure-evidence.md)。

## 当前判断

G2 Exit Gate 已由 commit `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184` 的 current-scope closure 通过，Global G3
Product Gate 处于 `In Progress`。V0 owner/contract hard cut、V1 Scenario authoring、V2 Cross-domain
behavior 与目标 Golden 已实现：真实 Preview/Export/CI adapter执行
Route lifecycle → parallel(NodeGraph Program、Animation composition) → barrier → owner observation，
并在 React/Vue 独立项目验证 authenticated Catalog optimistic conflict、full/reduced、visual/a11y/focus。
NodeGraph current/wire v2、bounded loop/Auth/subgraph closure、first-party executable runtime、strict planner/
debug protocol/Inspector，以及 Animation wire v2、target/property conflict、CodeSlot/shader、policy resolution
都已进入同一 Gate。
2026-07-27 本地 `pnpm run verify:g3:boundaries`、
`pnpm run verify:g3:scenario-authoring`、`pnpm run verify:g3:behavior-composition` 通过；commit
[`90fcf961`](https://github.com/prodivix/prodivix/commit/90fcf96134d880156c19c0da64692a3a39564841)
的 [G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30260091776) 三个独立 Job 也全部通过。
V3 deterministic replay/control profile、fresh isolation、bounded ReplayRecord/first-divergence debugger、
NodeGraph live command bridge，以及 Browser/Remote/Export/CI × React/Vue × full/reduced Golden 已于
2026-07-28 实现并通过本地 Gate；commit
[`3def9168`](https://github.com/prodivix/prodivix/commit/3def9168a436594db1145274e011632e228a0db9)
的 [V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
也已通过并形成 durable evidence。V4 Impact/Policy/Plan 已于 2026-07-28 完成实现并通过本地独立 Gate；
GitHub workflow 已配置，durable CI identity 等待提交推送后取得。V5-V8 尚未完成。

| Milestone                  | 状态        | 目标闭环                                                                                        | 退出证据                                                                             |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| V0 Owner/contract hard cut | Implemented | `@prodivix/behavior`、`@prodivix/verification`、Workspace document/Command、BHV/VER diagnostics | 本地与 CI Gate 通过，commit `90fcf961`                                               |
| V1 Scenario authoring      | Implemented | semantic target、typed action/observation、recorder draft、`BehaviorScenarioProgram`            | 本地与 CI authoring/compiler、React/Vue browser Golden 通过，commit `90fcf961`       |
| V2 Cross-domain behavior   | Implemented | Route/PIR/Data/Auth/NodeGraph/Animation composition 与 SourceTrace                              | 本地与 CI composition、React/Vue full/reduced browser Golden 通过，commit `90fcf961` |
| V3 Deterministic replay    | Implemented | clock/random/scheduler/network/storage/render controls、ReplayRecord/debugger                   | 本地与 CI Gate 通过，commit `3def9168`                                               |
| V4 Impact/Policy/Plan      | Implemented | semantic ImpactSet、canonical Policy、deterministic DAG/matrix/budget                           | 本地 byte-stable plan、required hard-cut、Web/CLI explain Gate 通过；CI pending      |
| V5 Evidence plane          | Not Started | promotion、artifact、provenance/trust、retention、Closure                                       | PostgreSQL/object store/security/attestation/recovery Gate                           |
| V6 Adapter matrix          | Not Started | functional/visual/a11y/performance/security across surface/target/browser                       | adapter conformance 与 controlled matrix                                             |
| V7 Product/CLI/CI          | Not Started | Scenarios/Verification/Issues/Execution/SourceTrace、CLI/CI attestation                         | product a11y/recovery 与 Web/CLI/CI digest parity                                    |
| V8 G3 Golden closure       | Not Started | Authenticated Catalog full behavior and evidence closure                                        | all required cells current/compatible/trusted/passed                                 |

## V0：Owner 与 contract hard cut

### 必须完成

- [x] 新建 `@prodivix/behavior`，只拥有 Scenario/Program/recorder semantic。
- [x] 新建 `@prodivix/verification`，只拥有 Impact/Policy/Plan/adapter SPI/Evidence/Closure contract。
- [x] 新建 `behavior-scenario`、`behavior-control-profile`、`behavior-fixture-set`、
      `verification-policy`、`verification-baseline-set` 五个 Workspace document 与 `core.behavior`、
      `core.verification` Command namespace。control profile / fixture set / baseline set 是被 Scenario 与
      Policy 共同引用的作者态输入，其 digest 同时是 Program digest、plan cell identity 与 Evidence manifest
      的输入，因此必须是独立可寻址、可版本化的 document，不能内嵌进 Scenario。
      `verification-baseline-set` 只拥有 identity/digest/采纳事务，实际图像字节委托给已有的
      `@prodivix/assets` content-addressed store。
- [x] current/wire/codec/migration、Backend/Workspace validation conformance。
- [x] `behavior`/`verification` diagnostic domain、target 和 `BHV-*`/`VER-*` registry。
- [x] package ownership/dependency/boundary Gate，`apps/web` 无 duplicate domain type。

### 停止条件

G2 exact snapshot、ExportProgram、SourceTrace、Browser/Remote provider 或 controlled Vue target 未稳定前，不进入
V2/V6/V8 产品 closure；V0 contract 可继续，但不得用 mock application shell 宣称 G3 vertical。

## V1：Scenario authoring

### 必须完成

- [x] manual/Route/PIR/Data trigger/action/observation first set。
- [x] stable semantic target exact/relocated/ambiguous/missing/incompatible。
- [x] Scenario CRUD/step editor/target picker/impact preview/undo/redo。
- [x] bounded Secret-free recorder draft、review、atomic adoption。
- [x] deterministic `BehaviorScenarioProgram`、capability manifest、SourceTrace 和 digest。
- [x] React/Vite 与 Vue/Vite semantic target conformance。

### Golden slice

登录 fixture → Catalog route → semantic add-item form → Data mutation → visible result，不保存 CSS/XPath、DOM handle 或
framework component identity。

## V2：Cross-domain behavior

### 当前实现

状态：`Implemented`（durable CI Evidence Passed）：

- [x] provider-neutral Program runtime 按 canonical dependency wave 执行 parallel/barrier，并做 capability、
      runtime-zone、owner、取消、bounded value 与 assertion fail-closed。
- [x] Route `navigate/location`、NodeGraph `invoke/output`、Animation `play/pause/resume/seek/cancel/state`
      由各 domain contribution/adapter 提供；Behavior Core 不反向 import domain owner。
- [x] NodeGraph strict planner 验证 explicit port/edge/descriptor、type/reachability/cycle/effect/capability，
      生成 immutable dependency waves、SourceTrace/digest；domain debugger protocol 已覆盖 lease、breakpoint、
      pause/step/continue/cancel/detach、bounded redacted values 与 late-completion fencing。
- [x] NodeGraph current/wire v2、唯一 v1 edge migration、TypeScript/Go/Workspace/DB hard cut 已落地；
      first-party runtime 执行 pure/control/state、Data/Route/Animation/Server、async/retry/cancel、CodeSlot/
      subgraph，并以 bounded value、capability、transaction/CAS 与 generation fence fail closed。
- [x] Animation current/wire v2、timeline marker observation、sequence/parallel/stagger/nested composition
      compiler/logical runtime，以及 full/reduced required marker parity 已落地。
- [x] 同一 canonical Workspace/Scenario 生成完整 step/domain SourceTrace；React/Vue standalone projection
      复用同一 NodeGraph/Animation compiler contribution 与 runtime helper。
- [x] 真实 Preview/Export/CI surface adapter在 exact revision/Program/artifact digest 下产生兼容结果；
      React/Vue standalone target实际完成 typecheck/test/build/browser smoke。

V2 durable Evidence 本身不包含 NodeGraph live `ExecutionSession` debug snapshot/command bridge 或 fresh
replay；这些能力已在当前 V3 worktree 中实现，但不会追溯改写 V2 CI evidence。V6/V8 的完整
Remote、多浏览器、performance/security 与 trusted Evidence matrix仍不属于 V2/V3 Golden。

### NodeGraph

current/wire typed hard cut、旧 edge migration、strict planner、first-party executable runtime 与 domain
debug protocol 已有 property/conformance coverage；bounded loop、Auth gateway、compile-time dependency
closure、Behavior/frame correlation、产品 Inspector 与 cross-surface invoked parity均已关闭。

- [x] typed port/edge、descriptor、planner 和旧 edge migration。
- [x] pure/state/Data/Route/Animation/CodeSlot nodes。
- [x] async/error/retry/cancel/parallel/subgraph 与 temporary state transaction。
- [x] debugger lease、step/call stack/value projection/SourceTrace。
- [x] Preview/Export/CI invoked graph semantic parity。

### Animation/Route

Behavior adapter 与 logical-clock playback 已支持 stable instance 的 play/pause/resume/seek/
cancel/state/marker；composition compiler/runtime 已覆盖 sequence/parallel/stagger/nested 与 full/reduced
required marker parity。target/property conflict、Route lifecycle、policy override/CodeSlot/shader 与真实
browser target matrix均已完成 V2 scope。

- [x] typed play/pause/resume/seek/cancel 与 marker observation。
- [x] sequence/parallel/stagger/nested composition。
- [x] target/property conflict arbitration。
- [x] Route exit/commit/materialize/enter、replacement/back/forward/deep link。
- [x] decorative/spatial/essential/continuous reduced-motion semantic variant。
- [x] visual/a11y stable observation 与 React/Vue target conformance。

### Golden slice

当前本地与 CI V2 Golden 已验证：

- authenticated Catalog semantic create-product 后，strict planned NodeGraph产生 `p2` 派生状态；
- Route detail lifecycle 与 Animation composition 在 Preview/Export/CI × full/reduced 六个 cell 保持
  required marker、result、Program digest、SourceTrace兼容；
- optimistic mutation 的 stale rollback被 generation fence跳过，冲突返回
  `DATA_OPTIMISTIC_CONFLICT`，rollback + higher-sequence retry提交后回到 Alpha/Beta/Gamma 稳定状态；
- React/Vue独立生成项目完成 install、typecheck、test、production build 与 Chromium smoke，
  目标特定截图 hash 可追踪，跨框架版面几何、ARIA、focus 和 operability一致。

## V3：Deterministic replay

### 必须完成

- [x] explicit control profile/capability preflight/digest。
- [x] logical clock、scoped random/id、scheduler lane/barrier/deadline。
- [x] fixture-only network、fault profile、unmatched/live egress denial。
- [x] fresh storage/auth/service-worker/session isolation 与 residual canary。
- [x] viewport/DPR/color/locale/timezone/font/full-reduced render controls。
- [x] typed condition wait/settle，无固定 sleep。
- [x] bounded ReplayRecord、first divergence、fresh replay debugger。

### Golden slice

同一 Catalog optimistic conflict/stale rollback fence/rollback/retry Scenario 已在 Browser、Remote、
Export、CI × React/Vue × full/reduced 的 16 个 semantic cell 中各 fresh replay 三次，并产生一致
semantic sequence；真实 React/Vue Chromium full/reduced target同样各运行三次。注入 random/schedule/
network drift均在首个 semantic divergence 准确失败。commit `3def9168` 的 V3 CI Job 也已通过。

## V4：Impact、Policy 与 Plan

### 必须完成

- [x] before/after semantic ImpactSet 和 domain contributors。
- [x] incomplete/unknown impact conservative expansion。
- [x] Policy rule precedence、required/advisory/forbidden、matrix profile、budget、retry、exemption。
- [x] deterministic check discovery、matrix expansion、DAG/resource dependency、plan digest。
- [x] blocked/unsupported/not-applicable/missing/unstable 严格语义，且不产生 `skipped`。
- [x] Impact/Plan explain UI 与 CLI JSON parity。

### Golden slice

Golden 分别隔离修改 Catalog PIR、Data operation、Route guard、NodeGraph、Animation 和 shared CodeSlot，
并另有六域组合变更；Plan 对每个隔离 change root 选择对应 Scenario/check，不借用其他改动根，
组合 Plan 保留六域 symbol 到 Scenario 的完整影响路径并展开 24 个 ready cell。删除 Semantic provider
的 negative fixture 会标记 unknown、保守扩大 scope，不能漏测。固定组合 Plan digest 为
`sha256-99a7139cd204c124c94b5ff36b74d7a62d0596feb70ff34177bdaf863db0fcd8`。

## V5：Evidence plane

### 必须完成

- [ ] EvidenceCandidate strict codec、manifest/artifact identity chain。
- [ ] Backend PostgreSQL repository、artifact staging/store、atomic idempotent promotion。
- [ ] local/remote/CI/import trust 与 attestation/revocation/replay protection。
- [ ] Secret/PII/active-content/path/archive/image budget hard cut。
- [ ] comparison compatibility、supersession、failure/retry history。
- [ ] session/change/release retention、protection、tombstone、GC recovery。
- [ ] Closure evaluator freshness/trust/compatibility/revision semantics。

### Golden slice

同一 cell 先失败后重跑通过：两个 attempt 都保留；Policy 对 unstable 的规则决定 Closure。Backend 在 artifact upload/
finalize/restart/并发重试中只产生一个 Evidence。过期或 revoked Evidence 使 Closure 立即 stale/incomplete。

## V6：Adapter matrix

### Required family

- [ ] diagnostics/build/unit/integration。
- [ ] Behavior E2E。
- [ ] visual comparison。
- [ ] accessibility automated + keyboard/focus journey。
- [ ] performance regression budget。
- [ ] security/no-Secret/probe-stripped/network/permission checks。

### Required controlled matrix

| Dimension   | Required coverage                                                          |
| ----------- | -------------------------------------------------------------------------- |
| Surface     | Preview、standalone Export、CI                                             |
| Target      | React/Vite、Vue/Vite controlled target                                     |
| Browser     | Chromium full；Firefox/WebKit Policy-defined critical subset               |
| Motion      | full、reduced                                                              |
| Data        | loading、empty、error、retry、pagination、optimistic mutation/conflict     |
| Auth/Server | signed-out、signed-in、expired/denied、authorized function result          |
| Recovery    | cancel、timeout、worker loss、cursor resume、duplicate/out-of-order result |

tool 私有 payload 必须停留在 adapter；所有 matrix cell 产生 canonical candidate 或明确 blocked/unsupported reason。

## V7：产品、CLI 与 CI

### 产品

- [ ] Scenarios authoring/record/debug surface。
- [ ] Verification Impact/Plan/Runs/Evidence/Compare/Closure surface。
- [ ] Execution Center bottom panel 可拖拽、折叠、最大化、keyboard resize。
- [ ] Issues 聚合 BHV/VER，icon-first status、accessible label、exact-revision SourceTrace。
- [ ] compact empty/loading/error state，无巨大空框/重复说明/原生不可控 select。
- [ ] failed Closure 可导航到 Scenario step、domain source、normalized finding 和 artifact。

### CLI/CI

- [ ] versioned plan/events/candidate/closure JSON/NDJSON 与稳定 exit code。
- [ ] plan/run/resume/cancel/promote/closure commands。
- [ ] CI OIDC/job attestation、fork/untrusted hard cut、no Secret in plan/log/artifact。
- [ ] cursor/promotion/backend restart recovery 与幂等 finalize。
- [ ] Web/CLI/CI 生成相同 Plan/Closure digest。

## V8：Authenticated Catalog G3 Golden

正式 Golden Scenario 必须覆盖：

1. signed-out 进入受保护 Route，guard 导向登录；
2. fixture 登录成功，loader 显示 loading → data；
3. empty/error/retry/pagination；
4. add/edit/delete optimistic mutation 与 deterministic conflict/rollback/retry；
5. NodeGraph 接收 domain event 并产生 typed 派生状态；
6. Route detail transition 和 Animation marker，分别验证 full/reduced motion；
7. session expiry/permission denial/server function failure；
8. cancel/timeout/worker loss/resume，旧 attempt/event 不污染新 attempt；
9. functional、visual、a11y、performance/security policy checks；
10. Preview/Export/CI、React/Vue、browser critical matrix；
11. Evidence promotion/trust/comparison/retention；
12. Closure 从 revision + plan + Evidence 重算 passed。

### G3 Exit Gate

只有同时满足以下条件才允许将 G3 ProductGateStatus 改为 Passed：

- [x] G2 Exit Gate 已 Passed。
- [ ] V0-V7 所有 required milestone 已 Implemented 并有可重复 Gate。
- [ ] Golden Plan digest 固定且所有 required cell current、compatible、trusted、passed。
- [ ] 失败/blocked/unstable/过期/revoked negative Golden 正确阻止 Closure。
- [ ] Preview、Export、CI 使用同一 Scenario；无 editor-private state 或 framework-private canonical fork。
- [ ] 无 production Secret/live production data；artifacts/diagnostics/ReplayRecord Secret canary clean。
- [ ] evidence manifest、CI run link/digest、target/browser/motion matrix 和复现命令写入 G3 closure evidence 文档。

## 计划 Gate 入口

前三个入口已建立，并由 commit `90fcf961` 的
[G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30260091776) 取得 durable Passed evidence；
第四个入口已由 commit `3def9168` 的
[V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
取得 durable Passed evidence；第五个入口已于 2026-07-28 在本地通过并配置独立 GitHub Job，
durable CI identity pending；其余入口随对应 milestone 建立：

- `pnpm run verify:g3:boundaries`
- `pnpm run verify:g3:scenario-authoring`
- `pnpm run verify:g3:behavior-composition`
- `pnpm run verify:g3:deterministic-replay`
- `pnpm run verify:g3:verification-plan`
- `pnpm run verify:g3:evidence`
- `pnpm run verify:g3:adapter-matrix`
- `pnpm run verify:g3:product`
- `pnpm run verify:g3:golden`
- `pnpm run verify:g3`

## 状态变更规则

- ADR/implementation 文件存在只代表 contract Accepted，不代表 Implemented。
- package/schema/UI 存在但无 cross-surface/negative evidence 时保持 In Progress。
- workflow 已配置但没有可信远端 Evidence 时写 Configured / Evidence pending。
- 只有 Milestone 的 contract、正向、边界、fail-closed、产品入口和目标 matrix 同时完成才写 Implemented。
- 只有 G3 Exit Gate 的全套 Evidence 可重算且当前有效时，Global ProductGateStatus 才写 Passed。
