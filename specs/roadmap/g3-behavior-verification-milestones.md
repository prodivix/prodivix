# G3 Behavior & Verification Closure milestones

> 本文件是 G3 阶段状态的唯一里程碑来源。Global Phase 退出条件见
> [`global-phases.md`](global-phases.md)，总实施编排见
> [`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)，
> ADR 索引见 [`../decisions/README.md`](../decisions/README.md)，退出证据结构见
> [`g3-closure-evidence.md`](g3-closure-evidence.md)。

## 当前判断

G2 Exit Gate 已由 commit `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184` 的 current-scope closure 通过，Global G3
Product Gate 已于 2026-07-31 进入 `Passed`。V0 owner/contract hard cut、V1 Scenario authoring、V2 Cross-domain
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
commit [`a6aa0bf9`](https://github.com/prodivix/prodivix/commit/a6aa0bf9452d66598c168e01f695f4d85deeacad)
的 [V4 CI Job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)
也已通过并形成 durable evidence。V5 Evidence plane 已于 2026-07-28 完成实现；本地
`pnpm run verify:g3:evidence`、真实 PostgreSQL、security/attestation/recovery 与 V4 regression Gate
均通过，commit
[`f3d91b9d`](https://github.com/prodivix/prodivix/commit/f3d91b9dfc786b167fa5df825cd45116441c725c)
的 [V5 CI Job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)
也已通过并形成 durable evidence。V6 adapter packages、66-cell/8-row/80-attempt contract、
Scenario-internal Data/Auth/Recovery companion Gate、root aggregate 与 owner boundary 已于 2026-07-29
在本地完整通过，并由 commit `bd6ef590` 的独立三浏览器 CI Job 于 2026-07-30 取得 durable evidence。
V7 产品、CLI、Backend run registry 与 GitHub Actions OIDC adapter 已于 2026-07-31 实现并通过本地
`pnpm run verify:g3:product`；本机 PostgreSQL 18.4 restart/idempotency Gate 也在隔离随机 schema
中通过并完成清理。commit `08db3e0f` 的
[V7 product job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91082654078)
与 [trusted OIDC job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91083228854)
又取得绑定 exact commit/run/job 的 durable evidence。
V8 Authenticated Catalog trusted Closure 已于 2026-07-31 实现并通过本地 Golden：锁定 66-cell
Plan，从 V6 的 80 个真实 adapter attempts 中逐 cell 选择并规范化 66 个结果，完成 14 个
`remote-attested` 与 52 个 `ci-attested` Evidence promotion，重算得到 `satisfied` Closure；missing、
failed、retryable blocked、unstable、expired、revoked、unverified 与 artifact missing negative 均
fail closed。机器 manifest 已补齐 66 条逐-cell accepted Evidence/trust/compatibility/verdict 明细；
连接本机 PostgreSQL 18.4 的完整 `pnpm run verify:g3` 也已连续通过 V0-V8。同一 commit 的
[V8 CI Job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91085620980)
重跑 controlled matrix 与 Closure，上传含 66 个唯一 cell、176 个 available artifacts 的
[manifest artifact](https://github.com/prodivix/prodivix/actions/runs/30607438729/artifacts/8784654298)；
整个 [G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30607438729) 的 10 个 jobs 全部
terminal success，因此 Global G3 为 `Passed`。

| Milestone                  | 状态        | 目标闭环                                                                                        | 退出证据                                                                                       |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| V0 Owner/contract hard cut | Implemented | `@prodivix/behavior`、`@prodivix/verification`、Workspace document/Command、BHV/VER diagnostics | 本地与 CI Gate 通过，commit `90fcf961`                                                         |
| V1 Scenario authoring      | Implemented | semantic target、typed action/observation、recorder draft、`BehaviorScenarioProgram`            | 本地与 CI authoring/compiler、React/Vue browser Golden 通过，commit `90fcf961`                 |
| V2 Cross-domain behavior   | Implemented | Route/PIR/Data/Auth/NodeGraph/Animation composition 与 SourceTrace                              | 本地与 CI composition、React/Vue full/reduced browser Golden 通过，commit `90fcf961`           |
| V3 Deterministic replay    | Implemented | clock/random/scheduler/network/storage/render controls、ReplayRecord/debugger                   | 本地与 CI Gate 通过，commit `3def9168`                                                         |
| V4 Impact/Policy/Plan      | Implemented | semantic ImpactSet、canonical Policy、deterministic DAG/matrix/budget                           | 本地与 CI byte-stable plan、required hard-cut、Web/CLI explain Gate 通过，commit `a6aa0bf9`    |
| V5 Evidence plane          | Implemented | promotion、artifact、provenance/trust、retention、Closure                                       | 本地与 CI PostgreSQL/object store/security/attestation/recovery Gate 通过，commit `f3d91b9d`   |
| V6 Adapter matrix          | Implemented | functional/visual/a11y/performance/security across surface/target/browser                       | 66-cell/80-attempt 本地与 CI root aggregate 通过，commit `bd6ef590`                            |
| V7 Product/CLI/CI          | Implemented | Scenarios/Verification/Issues/Execution/SourceTrace、CLI/CI attestation                         | 本地与 commit `08db3e0f` product/OIDC jobs 通过，durable CI Evidence Passed                    |
| V8 G3 Golden closure       | Implemented | Authenticated Catalog full behavior and evidence closure                                        | 本地与 commit `08db3e0f` 66-cell trusted Closure/manifest job 通过，durable CI Evidence Passed |

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

- [x] EvidenceCandidate strict codec、manifest/artifact identity chain。
- [x] Backend PostgreSQL repository、artifact staging/store、atomic idempotent promotion。
- [x] local/remote/CI/import trust 与 attestation/revocation/replay protection。
- [x] Secret/PII/active-content/path/archive/image budget hard cut。
- [x] comparison compatibility、supersession、failure/retry history。
- [x] session/change/release retention、protection、tombstone、GC recovery。
- [x] Closure evaluator freshness/trust/compatibility/revision semantics。

### Golden slice

同一 cell 先失败后重跑通过：两个 attempt 都保留；Policy 对 unstable 的规则决定 Closure。Backend 在 artifact upload/
finalize/restart/并发重试中只产生一个 Evidence。过期或 revoked Evidence 使 Closure 立即 stale/incomplete。

本地 Golden 固定 Candidate/statement/manifest/materialized Evidence identity，并验证失败 → retry passed history、
trust/revocation/retention/compatibility 参与 Closure。PostgreSQL Gate 还覆盖 pre-run AttemptGrant 一次性 claim、
promotion create/artifact staging 以及两阶段 attestation `prepare → final-commit` 的 authority drift、丢响应/
重启、最后一个 Closure record 并发名额、
object-store 中断、protection/tombstone 与 GC lease recovery。

## V6：Adapter matrix

状态：Implemented / durable CI Evidence Passed。`@prodivix/verification-adapters`、
`@prodivix/verification-browser`、66-cell/8-row/80-attempt controlled matrix、Scenario-internal
Data/Auth/Recovery companion Gate 与 root `verify:g3:adapter-matrix` 已于 2026-07-29 在本地通过；
commit [`bd6ef590`](https://github.com/prodivix/prodivix/commit/bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb)
的 [Chromium/Firefox/WebKit CI Job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
又于 2026-07-30 在 pre-adopted Ubuntu runner 与真实 rootless Podman 上通过。

### Required family

- [x] diagnostics/build/unit/integration。
- [x] Behavior E2E。
- [x] visual comparison。
- [x] accessibility automated + keyboard/focus journey。
- [x] performance regression budget。
- [x] security/no-Secret/probe-stripped/network/permission checks。

### Required controlled matrix

| Coverage class | Required coverage                                                          | Plan axis |
| -------------- | -------------------------------------------------------------------------- | --------- |
| Surface        | Preview、standalone Export、CI                                             | yes       |
| Target         | React/Vite、Vue/Vite controlled target                                     | yes       |
| Browser        | Chromium full；Firefox/WebKit Policy-defined critical subset               | yes       |
| Motion         | full、reduced                                                              | yes       |
| Data           | loading、empty、error、retry、pagination、optimistic mutation/conflict     | no        |
| Auth/Server    | signed-out、signed-in、expired/denied、authorized function result          | no        |
| Recovery       | cancel、timeout、worker loss、cursor resume、duplicate/out-of-order result | no        |

Data/Auth/Recovery 是 Scenario-internal controlled profiles；由 V6 root Gate 直接重跑的 exact owner
test/manifest 证明，不与前四个 Plan axes 做笛卡尔积。

tool 私有 payload 必须停留在 adapter；所有 matrix cell 产生 canonical candidate 或明确 blocked/unsupported reason。

### V6 exit record

- [x] 66 required Plan cells 被 8 rows 精确覆盖，58 browser cells / 72 browser attempts 与 8 static attempts
      实际执行；controlled Golden 为 80 reported/passed、零 blocked/unsupported/skipped/failed。
- [x] 八行 cells/attempts 固定为 `7/14、7/14、10/10、10/10、12/12、12/12、4/4、4/4`。
- [x] aggregate evidence 记录 Plan/matrix/browser identity/baseline/report/artifact/resolved-input digests，
      per-attempt clean cleanup 与零 residual。
- [x] 每个 browser attempt 记录 runtime-control initial/terminal same-context attestation 与 cleanup release；
      terminal attestation 绑定 exact attempt/context 并证明零 residual。
- [x] 每个 static attempt 记录 artifact retirement digest，static transport 最终
      `activeAttemptCount=0 activeArtifactCount=0`。
- [x] Preview Remote 14 attempts 经过 runtime-remote control-plane、exact bundle materialization、
      readiness/cursor/resume 与 retirement；Browser/Remote origin identity 不混用。
- [x] `VerificationCoverageSummary`、`VerificationBuildSummary` 与 `VerificationTrace` 三类 canonical artifact
      projection 的 absolute path/URL/vendor-field hard cut、codec/projector conformance 与 Golden staged bytes
      no-canary 通过，Core/Web/Evidence 只接收 canonical identity。
- [x] Data/Auth/Recovery companion manifest 记录 17 profiles、8 suites、28 exact cases、manifest digest 与零
      failed/skipped/todo。
- [x] root Gate、Compiler production probe、Core/G3/wire boundaries 与 exact runner/browser identity 同次通过；
      CI Job 还在 expensive matrix 前重新 attest 已安装三浏览器 file set，并绑定 exact commit/run/job identity。

## V7：产品、CLI 与 CI

### 产品

- [x] Scenarios authoring/record/debug surface。
- [x] Verification Impact/Plan/Runs/Evidence/Compare/Closure surface。
- [x] Execution Center bottom panel 可拖拽、折叠、最大化、keyboard resize。
- [x] Issues 聚合 BHV/VER，icon-first status、accessible label、exact-revision SourceTrace。
- [x] compact empty/loading/error state，无巨大空框/重复说明/原生不可控 select。
- [x] failed Closure 可导航到 Scenario step、domain source、normalized finding 和 artifact。

### CLI/CI

- [x] versioned plan/events/candidate/closure JSON/NDJSON 与稳定 exit code。
- [x] plan/run/resume/cancel/promote/closure commands。
- [x] CI OIDC/job attestation、fork/untrusted hard cut、no Secret in plan/log/artifact。
- [x] cursor/promotion/backend restart recovery 与幂等 finalize。
- [x] Web/CLI/CI 生成相同 Plan/Closure digest。

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

### V8 exit record

- [x] 锁定 Plan digest
      `sha256-67676af5b3930e32906ba9d5a835d82a11bd2f6a2d48100497082d0b685ee011`，
      66 个 cell 全部为 required 且要求 attestation。
- [x] 复用 V6 controlled execution path 实际执行 80 个 attempts，并从 Preview Remote、Export/CI
      trusted provider 各 cell 精确选择一个结果。
- [x] 66 个 normalized Candidate 全部完成 attested promotion：14 个 `remote-attested`、52 个
      `ci-attested`，artifact、SourceTrace、resolved input、runtime control 与 provenance identity 均进入
      Evidence。
- [x] React/Vite、Vue/Vite，Preview、Export、CI，Chromium、Firefox、WebKit，以及 full/reduced 与
      9 个 check families 全部由同一个 locked Plan 覆盖。
- [x] Backend-verified trust/artifact view 与 revocation view 参与 Closure 重算，66 个 cell 全部
      `passed`，Closure 为 `satisfied`。
- [x] missing、failed、retryable blocked、unstable、expired、revoked、unverified、artifact missing
      均不能满足 Closure。
- [x] machine Closure manifest 逐 cell 记录 Plan/attempt/Evidence/trust/compatibility/verdict、
      artifact availability、显式 Plan/Closure evaluation instant 与运行 identity；manifest 与 66-cell
      sub-manifest 均可从 artifact 内容重算。
- [x] commit `08db3e0f` 的 V7 product/OIDC、V8 Closure 与 artifact upload 绑定 exact run/job identity，
      G3 run `30607438729` 全部 10 jobs terminal success。

### G3 Exit Gate

只有同时满足以下条件才允许将 G3 ProductGateStatus 改为 Passed：

- [x] G2 Exit Gate 已 Passed。
- [x] V0-V7 所有 required milestone 已 Implemented 并有可重复 Gate。
- [x] Golden Plan digest 固定且所有 required cell current、compatible、trusted、passed。
- [x] 失败/blocked/unstable/过期/revoked negative Golden 正确阻止 Closure。
- [x] Preview、Export、CI 使用同一 Scenario；无 editor-private state 或 framework-private canonical fork。
- [x] 无 production Secret/live production data；artifacts/diagnostics/ReplayRecord Secret canary clean。
- [x] evidence manifest、CI run link/digest、target/browser/motion matrix 和复现命令写入 G3 closure evidence 文档。

本地 manifest、matrix、完整本地 aggregate、复现命令以及绑定 commit `08db3e0f` / run
`30607438729` / product、OIDC、V8 jobs 与 artifact `8784654298` 的 durable identity 均已记录，
完整 Exit 条件满足，Global G3 为 `Passed`。

## 计划 Gate 入口

前三个入口已建立，并由 commit `90fcf961` 的
[G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30260091776) 取得 durable Passed evidence；
第四个入口已由 commit `3def9168` 的
[V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
取得 durable Passed evidence；第五个入口已由 commit `a6aa0bf9` 的
[V4 CI Job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)
取得 durable Passed evidence；第六个入口已由 commit `f3d91b9d` 的
[V5 CI Job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)
取得 durable Passed evidence；第七个入口已由 commit `bd6ef590` 的
[V6 CI Job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
取得 durable Passed evidence；V7、V8 与最终分布式 aggregate 又由 commit `08db3e0f` 的
[G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30607438729) 取得 durable Passed evidence。
全部稳定入口为：

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
