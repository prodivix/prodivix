# G3 Behavior & Verification Closure evidence

## 状态

- EvidenceStatus：V0-V8 durable CI Passed
- ProductGateStatus：Passed
- 日期：2026-07-31
- G2 Exit baseline：`3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184`
- Canonical milestone：[`g3-behavior-verification-milestones.md`](g3-behavior-verification-milestones.md)
- Contract：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)

本文冻结 G3 Exit Gate 的证据结构，避免实现完成后用零散日志、绿色徽章或一次本机运行倒推验收标准。
G2 Exit Gate 已通过；V0/V1/V2 aggregate 已在本地通过，并由 commit
[`90fcf96134d880156c19c0da64692a3a39564841`](https://github.com/prodivix/prodivix/commit/90fcf96134d880156c19c0da64692a3a39564841)
的 [G3 Behavior and Verification Boundaries run](https://github.com/prodivix/prodivix/actions/runs/30260091776)
取得 durable CI identity。V3 aggregate 已在本地通过，并由 commit
[`3def9168a436594db1145274e011632e228a0db9`](https://github.com/prodivix/prodivix/commit/3def9168a436594db1145274e011632e228a0db9)
的 [V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
取得 durable CI identity。V4 aggregate 已于 2026-07-28 在本地通过，并由 commit
[`a6aa0bf9452d66598c168e01f695f4d85deeacad`](https://github.com/prodivix/prodivix/commit/a6aa0bf9452d66598c168e01f695f4d85deeacad)
的 [V4 CI Job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)
取得 durable CI identity。V5 aggregate 已于 2026-07-28 在本地与真实 PostgreSQL 上通过，GitHub workflow
也由 commit
[`f3d91b9dfc786b167fa5df825cd45116441c725c`](https://github.com/prodivix/prodivix/commit/f3d91b9dfc786b167fa5df825cd45116441c725c)
的 [V5 CI Job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)
取得 durable CI identity。
V6 root aggregate、owner boundary、66-cell/8-row/80-attempt contract、Scenario-internal Data/Auth/Recovery
companion Gate 与真实三浏览器 adapter tests 已于 2026-07-29 在本地通过，并由 commit
[`bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb`](https://github.com/prodivix/prodivix/commit/bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb)
的 [V6 CI Job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
取得 durable CI identity。V7 product aggregate 已于 2026-07-31 在本地通过；commit
[`08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a`](https://github.com/prodivix/prodivix/commit/08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a)
的 [product job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91082654078) 与
[trusted OIDC job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91083228854)
又取得 durable CI identity。V8 trusted Closure 与完整 `verify:g3` aggregate 也已在本地通过；
同一 commit 的 [V8 job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91085620980)
与 [manifest artifact](https://github.com/prodivix/prodivix/actions/runs/30607438729/artifacts/8784654298)
形成远端 durable evidence，整个
[G3 run `30607438729`](https://github.com/prodivix/prodivix/actions/runs/30607438729)
10 个 jobs 全部 terminal success，最终 G3 aggregate 已闭合。

## Evidence identity

最终 closure manifest 必须记录：

- repository commit、Workspace/Scenario/Policy revision；
- semantic/provider/compiler/planner/adapter registry digests；
- ImpactSet、VerificationPlan、`BehaviorScenarioProgram` 和 Closure digest；
- fixture/control/baseline/toolchain/target/browser/sandbox identities；
- Evidence ids、manifest/artifact digests、trust/attestation/retention；
- 生成 Golden Plan 时使用的 `policyEvaluationInstant`（毫秒精度显式值，**不是**「开始时间」）；
- Closure 重算所用的 evaluation instant，以及当时的 retention/revocation view 摘要
  （evidence set digest + revocation record digest）；
- run URL 或可重放的本地/CI命令；
- 开始/完成时间、执行环境和已知限制。

前两项是 plan digest 与 closure digest 的**决定性输入**：ADR 57 禁止 planner 读 ambient clock，
时刻由调用方显式提供。不记录它们，第三方拿到 commit + revision + policy revision 也重算不出同一个 digest，
「digest 相等」就只能由出证据的人自证 —— 所有以此为基础的 Exit 条件都会退化成主观陈述。
复现命令必须能以 `--policy-evaluation-instant` / `--closure-instant` 重放。

禁止记录 Secret、OIDC assertion、credential、cookie、生产 payload、raw artifact locator 或未清洗工具输出。

## Required Gate manifest

| Gate                             | 状态   | 必须证明                                                             | Evidence                                                                                                                                                                                                                       |
| -------------------------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `verify:g3:boundaries`           | Passed | package owner、Workspace document/Command、codec/diagnostic hard cut | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957689069)，commit `90fcf961`，2026-07-27                                                                                                         |
| `verify:g3:scenario-authoring`   | Passed | semantic target、recorder、compiler、React/Vue target                | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688996)，commit `90fcf961`，2026-07-27                                                                                                         |
| `verify:g3:behavior-composition` | Passed | Route/PIR/Data/Auth/NodeGraph/Animation typed composition            | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688962)，commit `90fcf961`，React/Vue full/reduced Chromium Golden，2026-07-27                                                                 |
| `verify:g3:deterministic-replay` | Passed | controls、fresh isolation、repeat/divergence、provider conformance   | [CI job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)，commit `3def9168`，2026-07-28                                                                                                         |
| `verify:g3:verification-plan`    | Passed | Impact/Policy/Plan determinism、budget、required semantics           | [CI job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)，commit `a6aa0bf9`，2026-07-28                                                                                                         |
| `verify:g3:evidence`             | Passed | promotion、attestation、Secret hard cut、retention/recovery          | [CI job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)，commit `f3d91b9d`，本地与 CI real PostgreSQL Gate，2026-07-28                                                                         |
| `verify:g3:adapter-matrix`       | Passed | all required check families/surfaces/targets/browsers/motion         | [CI job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)，commit `bd6ef590`，66 cells / 8 rows / 80 attempts 全部 passed，2026-07-30                                                            |
| `verify:g3:product`              | Passed | Scenarios/Verification/Issues/Execution/SourceTrace UX/a11y/recovery | [product job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91082654078) + [OIDC job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91083228854)，commit `08db3e0f`                    |
| `verify:g3:golden`               | Passed | Authenticated Catalog end-to-end trusted Closure                     | [V8 job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91085620980) + [manifest artifact](https://github.com/prodivix/prodivix/actions/runs/30607438729/artifacts/8784654298)，66 cells，Closure satisfied |
| `verify:g3`                      | Passed | aggregate with no omitted required cell                              | 本地 PostgreSQL 18.4 V0-V8 root aggregate + [G3 distributed aggregate](https://github.com/prodivix/prodivix/actions/runs/30607438729)，10/10 jobs success，commit `08db3e0f`                                                   |

### V0 reproducible run

- Command：`pnpm run verify:g3:boundaries`
- TypeScript：Diagnostics 13 tests、Behavior 17 tests、Verification 5 tests、Workspace 187 tests、
  Workspace Sync 118 tests 全部通过。
- Contract checks：core/G3 package boundary、G3 wire mirror、404 个 diagnostic reference pages 全部通过。
- Go：`behaviorcontract` / `verificationcontract` generated-wire 与 stable identity/reference semantic
  fail-closed、Workspace module、database migration tests 全部通过。
- Composition：`pnpm run build` 的 48 个 monorepo build tasks 全部通过。
- Static checks：`pnpm run lint` 全部通过，包含 52 package lint coverage 与 core/G3/editor/PIR/wire/property
  boundary checks。
- CI identity：commit `90fcf96134d880156c19c0da64692a3a39564841`，Ubuntu 24.04 / Node 22，
  [job `89957689069`](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957689069)。

### V1 reproducible run

- Command：`pnpm run verify:g3:scenario-authoring`
- Domain/authoring：Behavior 17 tests、Router 20 tests、PIR 49 tests、Data 64 tests、Workspace Scenario
  authoring 7 tests、Compiler React/Vue conformance 19 tests、Web Scenario resource 5 tests 全部通过。
- Program：exact-revision target 的 exact/relocated/ambiguous/missing/incompatible、domain trigger target、
  capability drift、deterministic digest、capability/target manifest 与完整 SourceTrace 均有正向或 fail-closed
  conformance。
- Recorder/UI：bounded/coalesced/recursive Secret canary、revision drift、cancel、review 后单 Transaction
  adoption；CRUD、typed entry/step target picker、impact confirmation、Workspace undo/redo 均通过。
- Golden：4 个 framework-neutral conformance tests 与 1 个双目标 browser test 通过；同一个
  `BehaviorScenarioProgram` 驱动 React/Vite、Vue/Vite 独立项目的 install、typecheck、test、production build
  和 Chrome browser smoke，完成登录 fixture → Catalog route → semantic create-product → Data mutation →
  `p2` collection item visible。
- Canonical hard cut：Program 不含 CSS/XPath、`data-testid`、DOM handle 或 React/Vue identity；generated target
  adapter 暴露 framework-neutral `data-pir-*` runtime metadata，Golden runner 只从 Program semantic source
  映射该 metadata。
- CI identity：commit `90fcf96134d880156c19c0da64692a3a39564841`，
  [job `89957688996`](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688996)。
- Limitation：本结果不含 Preview/Remote/Firefox/WebKit 或 V3-V8 Evidence，不能作为 G3 Closure。

### V2 reproducible run

- Command：`pnpm run verify:g3:behavior-composition`
- Domain/runtime：Behavior 17 tests、Router 20 tests、NodeGraph 37 tests、Animation 46 tests 全部通过；
  Program runtime 按 canonical dependency wave 执行 parallel/barrier，缺失 adapter、owner/runtime-zone
  mismatch、unsafe bounded value、assertion drift 与取消均有 fail-closed coverage。NodeGraph strict planner
  额外验证 explicit descriptor/port/edge、type/reachability/cycle/effect/capability，first-party executable
  runtime 覆盖 pure/control/state transaction、Data/Route/Animation/Server、async/retry/cancel、CodeSlot/
  subgraph、bounded loop、Auth、deterministic timeout、dependency closure、CAS conflict 与 late-completion
  fencing；domain debug protocol 覆盖 lease、breakpoint、step、frame correlation 与 bounded redacted value。
  Animation logical-clock playback 覆盖 stable-instance controls、marker crossing、target/property
  replace/queue/add/reject，composition compiler/runtime 覆盖 sequence/parallel/stagger/nested、cycle/budget/
  cancel 与 full/reduced required marker parity；Route lifecycle 覆盖 guard/loader/scope/transition/handoff/
  outlet、replacement/back/forward/deep-link。
- Current/wire：NodeGraph 与 Animation current domain 均无数字版本，codec 只写 wire v2；共享 fixture、
  Workspace round-trip、Go generated schema/semantic validator 与 database migration 17/18 验证 v1
  deterministic migration、unsafe/ambiguous fail-closed、bounded batch、CAS 和最终 v2 constraint。
- Compiler/product：React/Vue workspace conformance 19 tests与 Web Inspector/Animation 7 tests通过；两个 target 使用同一 NodeGraph/Animation
  contribution 和字节一致的 framework-neutral runtime helper，Vue 不再把 `pir-graph` / `pir-animation`
  静默丢弃或标为 unsupported。
- Golden：7 个 composition tests 与 1 个 Chromium browser test通过；同一 canonical Workspace/Scenario
  在真实 Preview/Export/CI adapter执行 Route lifecycle → parallel(strict planned NodeGraph invoke、
  Animation composition) → barrier → graph output / composition result / required marker / route location
  observations。full/reduced六个 cell保留相同 required marker，Program、NodeGraph Program、artifact digest
  与完整 SourceTrace可重复。
- Product target：React/Vue独立项目均实际完成 install、typecheck、test、production build、
  Chromium smoke；authenticated Catalog mutation后 `p2` 可见，跨目标版面几何、ARIA、focus/operability
  兼容且 target-specific screenshot hash可追踪。optimistic stale rollback被 fence，typed conflict后
  rollback + higher-sequence retry回到 Alpha/Beta/Gamma 稳定状态。
- Boundaries：core/G3 boundary Gate 通过；Behavior Core 不 import domain owner，只有精确的 domain
  contribution 及其 conformance test 可 import Behavior contract。
- CI identity：commit `90fcf96134d880156c19c0da64692a3a39564841`，
  [job `89957688962`](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688962)。
- Limitation：V2 CI identity本身不包含 NodeGraph live debug snapshot/command bridge 或 fresh replay；
  这些能力已由 commit `3def9168` 的 V3 evidence覆盖，但不会追溯改写 V2 evidence。V6/V8 的完整 Browser/Remote、
  Firefox/WebKit、performance/security 与 trusted Evidence matrix仍未运行。V2 Gate 已有 durable
  Evidence，但不能据此宣称整个 G3 Closure。

### V3 reproducible run

- Command：`pnpm run verify:g3:deterministic-replay`
- CI identity：commit `3def9168a436594db1145274e011632e228a0db9`，
  [job `90153389007`](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)。
- Runtime/control：Runtime Core 26 files / 127 tests覆盖 canonical scheduler、single logical clock、真实
  xoshiro256ss scoped
  random/id、control profile/capability/preflight/digest、typed waits/barriers、deadline/deadlock/task-flood、
  cancellation/generation fence、bounded log、provider lifecycle 与 isolation canary。
- Record/debug：Behavior 4 files / 27 tests覆盖 bounded Secret-free ReplayRecord current/wire codec、
  semantic/result digest、repeat series、first divergence、fresh-attempt retry，以及 attempt/program/
  generation/lease/sequence-fenced pause/step/continue/cancel；NodeGraph 9 files / 39 tests验证 strict
  Program 到 first-party executor 的 live debug bridge、state transaction、frame/SourceTrace 与 stale
  runtime boundary hard cut；产品 Run/Debug attempt互斥，避免 sidecar重复 effect。
- Provider：Browser 8 files / 28 tests与 Remote 17 files / 103 tests覆盖 applied-control/font identity、
  fixture-only network、fresh storage/auth/service-worker/session reset、residual canary、worker/reset/
  cleanup failure、retry budget、late completion 与 unsupported/partial control fail-closed。
- Golden：Browser、Remote、Export、CI × React/Vue × full/reduced 共 16 个 semantic cell，每 cell执行
  3 个 fresh attempt且 record/semantic digest兼容；真实 React/Vue Chromium full/reduced target各执行
  3 次，V2 authenticated Catalog optimistic conflict/stale rollback fence/rollback/retry路径保持稳定。
- Negative：random/schedule/network drift均定位首个 semantic divergence；live/unmatched egress、Secret、
  Record/attempt/task budget、font/control mismatch、polluted isolation、worker crash、cleanup failure均
  blocked，且不生成可信结果。
- Regression：`pnpm run verify:g3:behavior-composition` 与 `pnpm run verify:g3:boundaries` 同期本地通过。
- Limitation：以上本地复现结果与 CI Job 已形成 durable V3 evidence，但不代表 V4-V8 或 G3 Closure。

### V4 reproducible run

- Command：`pnpm run verify:g3:verification-plan`
- CI identity：commit `a6aa0bf9452d66598c168e01f695f4d85deeacad`，
  [job `90176153041`](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)。
- Impact/Policy：`@prodivix/verification` 3 files / 28 tests与 `@prodivix/workspace`
  46 files / 194 tests覆盖 deterministic contributor merge、before/after semantic path、
  provider/schema drift、conservative scope、required/advisory/forbidden precedence、conflict、expiry、
  exemption、matrix/budget/retry，以及可逆 Policy authoring Command。
- Plan/Closure：deterministic discovery、matrix expansion、DAG/resource dependency/cycle、required
  over-budget hard-cut、advisory trimming、严格 cell status、freshness/trust/attestation/toolchain/artifact/
  input identity 与 unstable retry均由显式输入重算；不存在 `skipped`。
- Product parity：可执行 CLI `verification plan` / `verification explain` 与 Web Verification resource
  surface共用 canonical explanation projector；CLI subprocess产物与共享 projector exact-byte一致，
  Web 7 个定向测试覆盖 revision/Closure identity drift、Policy Command 与 expected input/artifact 呈现。
- Golden：Catalog PIR、Data operation、Route guard、NodeGraph、Animation、shared CodeSlot
  6 个隔离域 case 与六域组合 case 共 11 个 conformance tests；组合 Plan 有 24 个 ready cell，
  固定 digest
  `sha256-99a7139cd204c124c94b5ff36b74d7a62d0596feb70ff34177bdaf863db0fcd8`；删除 provider 的
  negative fixture产生 unknown/conservative scope。
- Boundaries：core package/application 与 G3 boundaries 同一 Gate 通过。
- Regression：当前 V5 checkout 再次通过完整 V4 Gate（Verification 184、Workspace 194、V4 Golden 12、
  Web 7），CLI parity digest 为
  `sha256-be24ff531ef1a8d388b2cd59cb00b0eba0cc3fe80749103bedb26e3c5b5c17cc`。
- Limitation：commit `a6aa0bf9` 的 CI Job 是 V4 durable identity；当前 checkout 的 V4 regression 与新增
  Plan wire codec仍是本地证据，不追溯改写旧 CI manifest，也不代表 V6-V8 或 G3 Closure。

### V5 reproducible run

- Command：设置隔离的 `PRODIVIX_BACKEND_POSTGRES_TEST_URL` 后运行
  `pnpm run verify:g3:evidence`；独立回归命令为 `pnpm run verify:g3:verification-plan`。
- Environment：Windows NT `10.0.26200.0`、Node `v26.3.0`、pnpm `11.9.0`、Go `1.26.4`
  `windows/amd64`，本地 PostgreSQL；PostgreSQL Gate 每次创建随机 schema 并在结束时删除。GitHub job
  固定 PostgreSQL 16、Node 22 和 `apps/backend/go.mod` 声明的 Go toolchain。
- Core/Golden：`@prodivix/verification` 14 files / 184 tests、V5 Golden 16 tests通过；strict
  EvidenceCandidate、完整 VerificationPlan、manifest、verified view、8 类 structured artifact envelope、
  canonical ordering/digest、oversize/duplicate/unsafe key/lone surrogate/negative-zero hard cut均有覆盖。
- Product：Web typecheck与 5 files / 52 tests通过，覆盖 Evidence timeline/compare/Closure、retention
  projection、legal-hold只读、tombstone body、safe text/raster/JSON viewer和 actual SourceTrace navigation。
- Backend：`go test -short ./...` 与真实
  `TestVerificationEvidencePostgreSQLGate`通过。Gate 覆盖 immutable pre-run AttemptGrant、一次性原子 claim、
  candidate/idempotency conflict、双副本 finalize、create/attestation prepare/evidence commit三阶段 authority
  drift、丢响应/重启、最后一个 Closure record名额、object-store中断、artifact lease/orphan recovery、
  protection/tombstone/GC race和 Workspace删除后 durable Evidence identity。
- Trust/security：deterministic Ed25519 remote/CI attestation覆盖 issuer/audience/subject/nonce/expiry/replay/
  key rotation/revocation；local/imported不能满足默认 trusted Closure。Secret/Authorization/Cookie/PII、
  active content、path/archive、媒体错配与 PNG/JPEG decode/pixel budget均 fail closed。
- Canonical schema digests：VerificationPlan
  `sha256-e29a613f2f8319a1d79be228b4f15520df03bfea7c1b9041ac4d7e7d0f045231`；
  Evidence manifest
  `sha256-9b908bfaf9654738fa880d0adc3b23b7298697e5bbbb4e0cb428ac75a381a338`；
  Artifact envelope
  `sha256-bf05571db9ce02115025e01635c298222b87a389341879c1f6b36ae261fb3eaa`。
- TypeScript→Go non-empty Artifact vector：Candidate
  `sha256-546c6aced448edd5fbbd1904c53664d5f64854e2ee8f0745692ef35d79337478`；
  statement
  `sha256-09721ff3fe0e28fd60825c3f260df03c7ab1f2be326d65d8e45846114a0e41c4`；
  manifest
  `sha256-4db6a4d29e043cc9b3c08d6655674794162020d8d6a183c8b8ca522424cff09c`；
  materialized Evidence
  `sha256-b847fa4da1a1434a0263566c2f5be8ff73558a85f28bb0ef688f5f10f9af376d`。
- Retention boundary：`protectReleaseEvidence` 只冻结在 Plan/AttemptGrant；V5 不伪造 G5 release
  external reference。`release` Evidence 无自动 TTL，但只有实际 active protection/hold 阻止授权 tombstone。
- Static/build：root lint、Core/G3/wire boundaries与 production build通过。另从 `HEAD` 建立 detached
  worktree，应用 tracked binary diff 并显式复制 120 个未跟踪 V5 文件（`.claude` 复制数为 0）后执行
  `pnpm install --frozen-lockfile`；冷环境中的 V4、V5、root lint 与 52-package production build 均通过。
- Durable CI：commit `f3d91b9d` 的 V5 Job 使用 PostgreSQL 16、Node 22 与 Go module toolchain，
  `verify:g3:evidence` 全部通过；同一 commit 的 Tests、Deploy Smoke、Rootless、Security、CodeQL、
  Docker Images、G0/G1、G2 PostgreSQL 与 Smoke workflows 也全部通过。
- Limitation：deterministic CI-attested fixture 与 GitHub PostgreSQL Gate 不等于真实云 OIDC deployment
  evidence；该真实云边界不属于 G3 Exit。V6 已在后述固定 CI Job 取得 66/80 durable evidence，
  V7/V8 又由 commit `08db3e0f` 取得 product/OIDC/Closure durable evidence。

### V6 reproducible run

- Status：`Implemented / durable CI Evidence Passed`。
- Root command：`pnpm run verify:g3:adapter-matrix`。
- Environment contract：workflow 固定 `ubuntu-24.04`，并由 pre-adopted browser identity registry exact
  绑定 GitHub runner `ImageVersion`；使用 Node 22、frozen pnpm lockfile 与 Playwright
  Chromium/Firefox/WebKit，先执行 `pnpm exec playwright install --with-deps chromium firefox webkit`，
  cold-build Golden dependency closure，再逐引擎重算 installed browser file-set authority，最后运行 root command。
- Composition：cold-build Golden dependency closure、Verification Core、static/browser first-party adapters、
  Runtime Core/Vitest/Browser/Remote、Compiler full production bundle probe、66-cell/8-row/80-attempt Golden、
  Scenario-internal controlled-dimension owner manifest 与 Core/G3/wire boundaries。
- Local result：2026-07-29 root command 完整通过；66 required Plan cells 全部被 8 rows 精确覆盖，58
  browser-family cells 形成 72 个真实
  Browser/Remote/standalone/CI attempts，8 static-family cells 形成 8 个真实 attempts；每个 attempt 必须产生
  Core 接受的 candidate，未使用 6 个 target/engine smoke 替代逐-cell evidence。
- Controlled Golden exit：本次支持矩阵为 80 个 `reported` + normalized `passed`，且
  blocked/unsupported/skipped/failed、late write、active artifact、target lease、security authority 与 cleanup
  residual 均为零；generic adapter contract 仍保留 blocked/unsupported 语义，但本次 Golden 未使用它们代替
  completion。
- Required identity fields：Plan、adapter registry、matrix manifest、browser identity registry、visual baseline
  set/asset/normalizer、controlled-dimension manifest 与 aggregate evidence digests；每个 browser/static attempt
  还必须记录 exact cell/provider、report digest、resolved input-set digest、artifact digest set 与 cleanup status。
- Required runtime/static cleanup fields：每个 browser attempt 记录 runtime-control initial/terminal
  same-context attestation、exact attempt/context binding、terminal zero-residual 与 cleanup release receipt；每个
  static attempt 记录 artifact retirement digest，且 static transport 最终
  `activeAttemptCount=0 activeArtifactCount=0`。
- Required Remote/security fields：14 个 Preview Remote attempts 分别记录 execution/provider、snapshot、
  durable/materialized bundle、readiness/health、resume/terminal cursor、origin/entry 与 cleanup/retirement
  evidence；8 个 security attempts 分别记录三项 owner-resolution exact-once audit、七项 pre-finalization 与 Core
  补齐后的九项 hard-rule report digest。
- Required artifact-boundary fields：`VerificationCoverageSummary`、`VerificationBuildSummary` 与
  `VerificationTrace` 三类 canonical artifact projection 必须逐类记录 codec/projector conformance、
  absolute path/URL/vendor-field negative 与 Golden staged bytes no-canary；raw tool locator 与私有 payload
  不得进入 Core report、Web 或 Evidence。
- Package/test evidence：29-package build closure；installed browser authority `1 file / 1 test`、Verification
  `19 files / 243 tests`、Adapters
  `7/40`、真实 Browser Adapters `31/193`、Runtime Core `28/142`、Runtime Vitest `2/24`、Runtime Browser
  `8/35`、Runtime Remote `17/109`、Compiler probe `1/14`、static Golden `14/69`、browser Golden
  `2 files / 3 tests` 全部通过；Core/G3/wire boundaries 同次通过。
- Canonical identities：Plan
  `sha256-dcb7b509b0a580276e6ffd1400ae2a27a8188fbbd17ff27e4d248253c0d7d4c1`；matrix
  `sha256-39ad50cf2e07dc3b93eaec6a5e7d22b61a8d7e41c26ccd92ea5cf0c244a0510c`；adapter registry
  `sha256-06f219930d74f9365a694b53fb18a553264460a550d6635ba9149a0bfde263d1`；browser identities
  `sha256-289e104587c2b5041ab52ab211121ac66864627dff25b8256f056391948d1e8b`；visual identities
  `sha256-3a447bc1379e2e7152a5dfc28ccfcff1f738572bac96dcdd9407f1fc169b73a4`。
- Baseline identities：set
  `sha256-d8bc197e694c432a7bc0ebd1a6aec5b6cb1db52ca960be1172b8a6bc0ff3e334`；asset
  `sha256-774d02c24278eb5c0c9eb4f8d5f4eabb5891a6b9c01429492d43d5c89b7a3928`；raster
  `sha256-9ebde0e380725ce43da1288d7b5116011dbba8215a5b8ce1c73af23d64c9c5cc`；normalizer
  `sha256-a58ee5c8f675cdba49dee439fb7db48bbc5ff8efb0d066bc8758816db7101069`。
- Run-bound identities：attempt manifest
  `sha256-56eaa952be69c0b9cd601bd2483348799431e36e19d14e89daedc6ce7a24530d`；controlled manifest/evidence/
  environment `sha256-5d7140c03a80aaeb24b43b535dec058827535844ed3d6bc435afc54e3fceeeb9`、
  `sha256-d61ffd2a9f30867449cf0e28e44cb9a1cbfd3cfcb52944900f5a307d463ff215`、
  `sha256-aa82ff63c4dc2e901db00678995b2940b4d1ca13d3c96dc64ba49b190c1aad81`；runtime controls
  `sha256-a50e34aba65feaa503301a1082f6c2a80809c31eb557df31bedd3f64eed30b73`；aggregate evidence
  `sha256-10f2ac6393aaa598ae8676b1665705c5654e5498794772182431f9e999b9fe83`。
- Supplementary evidence：Backend verification 与 verificationcontract 非缓存 Go tests、remote worker
  `12 files / 87 tests` 通过；rootless snapshot contract digest 为
  `sha256-9680cb1ff4fd3ae39a5e46b618ac97068000aad2a7939d8d84b9f7ac2846f8a6`。
- Durable CI：commit `bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb` 的
  [run `30494182310`](https://github.com/prodivix/prodivix/actions/runs/30494182310) /
  [job `90719037327`](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
  在 `ubuntu24` runner image `20260720.247.2`、kernel `6.17.0-1020-azure`、rootless Podman +
  crun + conmon + systemd cgroup family 与三种已 attested browser images 上全部通过；同一 commit 的
  Docker、G2 Execution、CodeQL、G0/G1、Tests、独立 Rootless、Smoke、Security 与 G2 Data workflows
  也全部 terminal success。

### V7 reproducible run

- Status：`Implemented / durable CI Evidence Passed`。
- Root command：`pnpm run verify:g3:product`。
- Product surface：Scenarios authoring/recorder/run/debug、Verification
  Impact/Plan/Runs/Evidence/Compare/Closure、shared docked Execution Center、Issues facets、exact-revision
  SourceTrace 与 failed Closure navigation。
- Contract：strict versioned Verification Run snapshot/event、Closure 与 GitHub Actions CI job context；
  Web/CLI/CI 直接复用 shared planner、explanation projector、Evidence promotion 与 Closure evaluator。
- CLI：`verify plan/explain/run/resume/cancel/promote/closure`、bounded JSON/NDJSON、stable exit
  `0/1/2/3/4`、唯一短期 credential channel、two-stage attestation/promotion 与 ACK-loss recovery。
- Backend：v21 run registry migration、revision/plan-bound create/list/get/event API、cursor replay、
  idempotent create/event/finalize 与 Backend restart recovery。
- Local result：29 个 dependency build tasks、Verification `22 files / 255 tests`；OIDC 修复后 package
  regression 为 `22 files / 256 tests`。CLI `6/6`、V4 planner
  Golden `12/12` 与 CLI parity、Web `9 files / 80 tests`、Backend verification/
  verificationcontract/database 三个 Go package、Web typecheck、CLI build、Core/G3/wire boundaries 全部通过。
- PostgreSQL boundary：将 `PRODIVIX_BACKEND_POSTGRES_TEST_URL` 指向本机 PostgreSQL 18.4
  隔离测试数据库后，真实 restart/idempotency test 与完整 product Gate 均通过；测试使用随机 schema、
  两个独立连接并自动清理。
- CI identity：普通 product job 不持有 OIDC 权限；独立 trusted job 仅在 `push/workflow_dispatch`
  配置 `id-token: write`，并以短期 GitHub OIDC 标准 `workflow_ref` claim 绑定
  repository/ref/SHA/run/attempt/job；fork 与 untrusted PR fail closed，job 不注入 durable Verification access
  token。GitHub 新旧 subject 均 fail-closed：legacy name-based identity 与 immutable `name@id` identity
  都必须与 runner 提供的 repository owner/repository IDs、ref 和 job metadata 精确一致。
- Durable CI：commit `08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a` 的
  [product job `91082654078`](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91082654078)
  在 PostgreSQL 16 上通过 Verification `22 files / 256 tests`、CLI `6/6`、V4 Golden `12/12`、
  Web `9 files / 80 tests` 与三个 Backend Go packages；
  [OIDC job `91083228854`](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91083228854)
  生成 CI job context digest
  `sha256-488598b232f6197bbd6db4c10d177ad34373173fe5d2e024dae66e9a3aba74a6`。

### V8 reproducible run

- Status：`Implemented / durable CI Evidence Passed`。
- Root command：`pnpm run verify:g3:golden`。
- Locked Plan：66 个 required cells，Plan digest
  `sha256-67676af5b3930e32906ba9d5a835d82a11bd2f6a2d48100497082d0b685ee011`；
  每个 Preview cell 只接受 `remote-attested`，Export/CI cell 只接受 `ci-attested`，全部要求
  attestation。
- Actual execution：复用 V6 controlled adapter matrix，实际执行 80 个 attempts；覆盖 React/Vite、
  Vue/Vite，Preview、Export、CI，Chromium、Firefox、WebKit，full/reduced motion 与 9 个 check
  families。Data/Auth/Recovery 继续由同一次 matrix 绑定的 17 profiles、8 suites、28 cases companion
  evidence 覆盖。
- Promotion：逐 required cell 精确选择一个实际 attempt，规范化为 66 个 Candidate 并完成
  66 个 Evidence promotion；其中 Preview 为 14 个 `remote-attested`，Export/CI 为 52 个
  `ci-attested`。Evidence 绑定 report、artifact bytes、SourceTrace、resolved input、runtime control、
  toolchain、target/browser 与 provider identities。
- Closure：Backend-verified trust/artifact/revocation view 参与重算，66 个 cell 全部 `passed`，
  verdict 为 `satisfied`。当前机器 manifest 逐 cell 记录 Plan identity、selected attempt、accepted Evidence、
  trust/attestation、compatibility、artifact availability 与 verdict；还记录 `policyEvaluationInstant`、
  `closureEvaluationInstant`、retention/revocation 摘要及 local/GitHub Actions execution identity。
- Manifest：本地文件为 345,709 bytes，含 66 个唯一 cell、66 个唯一 Evidence 与 176 个
  `available` artifacts；cell manifest digest 为
  `sha256-85cf2d6e569c31541feffac32bc7dbe91bbb5f51c5ef9e25790a2f1c98ec7009`，顶层
  content-addressed manifest digest 为
  `sha256-d0b6074c845f413826ca367fe10b87757258d739d28593e5c5ca57a5e75b3f88`，从文件内容移除
  `manifestDigest` 后可重算得到相同值。敏感字段扫描未发现 credential、OIDC token、cookie、
  private key 或 raw artifact locator。
- Negative：missing、failed、retryable blocked、unstable、expired、revoked、unverified 与 artifact
  missing 均得到非 `satisfied` Closure；failed/retry history 不覆盖原 Evidence。
- Local result：29-package dependency build closure、Verification `22 files / 255 tests`、Adapters
  `7 files / 40 tests`、真实 Browser Adapters `31 files / 193 tests`、V8 Golden `1 file / 6 tests`
  以及 Core/G3/wire boundaries 全部通过；加入逐-cell manifest 后再次执行当前 V8 package Gate，
  `1 file / 6 tests` 全部通过，test duration `369.23s`。
- Durable CI：GitHub `golden` job 依赖 V6 adapter matrix 与 V7 product；同一 workflow 的独立
  trusted OIDC job 依赖 V7 product。`golden` 固定
  `ubuntu-24.04`，重新 attest runner、rootless Podman/controlled static sandbox 与
  Chromium/Firefox/WebKit file-set authority。commit `08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a` 的
  [job `91085620980`](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91085620980)
  于 2026-07-31 06:01:31–06:11:33 UTC 通过；主 Closure step 为 `1 file / 6 tests`，test duration
  `290.05s`，输出 66 cells、Closure `satisfied`。
- Remote manifest：上传的
  [artifact `8784654298`](https://github.com/prodivix/prodivix/actions/runs/30607438729/artifacts/8784654298)
  名为 `g3-v8-closure-manifest-08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a-1`，archive size
  44,043 bytes、archive digest
  `sha256:ce3f91e20ada9f0788df3a17150c5f6afb473979f9ef8810a9fe71fd263603a7`、保留至
  2026-08-30。下载后的 JSON 为 345,932 bytes，file SHA-256 为
  `a5c6fc1522a74fa826c282a17d020d50b8f105a146b8dd673010de9879db7cc5`，含 66 个唯一 cell 与
  176/176 个 `available` artifacts；cell manifest digest
  `sha256-0c1c8c91f6247243ec6159c212d440de85f387cbc0b5c6ed6b9c283fea7de073`，顶层
  manifest digest
  `sha256-bd756f69a90c2048d5da0fe333c5421d2ed7eb9dc78cb04ad93eb6ffa1711019`，Closure digest
  `sha256-880b84aedd12810543786d8107250807c42c6467cae2c5a11d9816e938a9bb70`。manifest execution
  identity 精确记录 commit `08db3e0f`、run `30607438729`、job `golden` 与 command
  `pnpm run verify:g3:golden`。
- Digest semantics：locked Plan digest 对相同 Plan 输入 byte-stable；Closure manifest 还绑定每次真实
  toolchain command 的开始/完成 receipt 与输出摘要，因此不同执行应产生不同 manifest digest。每一份
  artifact 必须独立通过自摘要重算，不能用跨运行 digest 相等替代 provenance。
- Aggregate identity：同一
  [G3 run `30607438729`](https://github.com/prodivix/prodivix/actions/runs/30607438729)
  中 V0-V8、V7 OIDC、V6 三浏览器与 V8 artifact upload 共 10 个 jobs 全部 terminal success。

### Full G3 local aggregate

- Command：设置隔离的 `PRODIVIX_BACKEND_POSTGRES_TEST_URL` 与 test-only resume key 后执行
  `pnpm run verify:g3`。
- Result：2026-07-31 12:23:49–12:56:44（Asia/Shanghai），exit code `0`，总耗时约
  `32m55s`。V0-V8 所有 root Gate 连续执行，无 omitted required gate。
- Database：本机 PostgreSQL 18.4 service 实际参与 V5 Evidence 与 V7 Verification Run
  restart/idempotency 路径；随机 schema 在 Gate 结束时清理。
- Browser/matrix：V6 66 cells / 8 rows / 80 attempts、Verification Browser `31 files / 193 tests`、
  V8 trusted Closure `1 file / 6 tests` 均通过；V8 当次 test duration `365.32s`。
- Follow-up：全量 Gate 后仅扩展 V8 manifest 的机器明细投影；该最终代码又通过 golden-conformance
  typecheck、定向 ESLint、diff check 与上述当前 V8 package Gate。commit `08db3e0f` 的 product、
  OIDC、V8 与整个分布式 G3 aggregate 均取得 durable CI identity，因此本地与远端证据共同将
  Global G3 升级为 `Passed`。

## Required Golden matrix

最终表必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict；不得只写“matrix passed”。

V2 的 Chromium full/reduced target slice 已在本地与 GitHub CI 通过；V3 又完成受控 provider semantic
matrix与三次 fresh replay。下表是本地与 commit `bd6ef590` 的 CI Job 实际通过的 V6 required matrix；
状态不代表 V8 trusted Closure。

| Surface | Target                | Browser/runtime         | Motion         | Required families                                                             | Cells | Attempts | 状态   |
| ------- | --------------------- | ----------------------- | -------------- | ----------------------------------------------------------------------------- | ----: | -------: | ------ |
| Preview | React/Vite            | Chromium Browser/Remote | full + reduced | behavior、visual、a11y、security                                              |     7 |       14 | Passed |
| Preview | Vue/Vite              | Chromium Browser/Remote | full + reduced | behavior、visual、a11y、security                                              |     7 |       14 | Passed |
| Export  | React/Vite            | Chromium standalone     | full + reduced | build、behavior、visual、a11y、performance、security                          |    10 |       10 | Passed |
| Export  | Vue/Vite              | Chromium standalone     | full + reduced | build、behavior、visual、a11y、performance、security                          |    10 |       10 | Passed |
| CI      | React/Vite            | Chromium                | full + reduced | diagnostics、unit、integration、behavior、visual、a11y、performance、security |    12 |       12 | Passed |
| CI      | Vue/Vite              | Chromium                | full + reduced | diagnostics、unit、integration、behavior、visual、a11y、performance、security |    12 |       12 | Passed |
| CI      | React/Vite + Vue/Vite | Firefox critical subset | Policy-defined | behavior、a11y                                                                |     4 |        4 | Passed |
| CI      | React/Vite + Vue/Vite | WebKit critical subset  | Policy-defined | behavior、a11y                                                                |     4 |        4 | Passed |
| Total   | —                     | —                       | —              | 9 check families                                                              |    66 |       80 | Passed |

### Scenario-internal controlled dimensions

Data、Auth 与 Recovery 不扩张上述 66 个 Plan cells。root `verify:g3:adapter-matrix` 必须通过
`@prodivix/golden-conformance` 的 `test:g3-v6-controlled-dimensions` 子 Gate，按
`goldenG3V6ControlledDimensionManifest.ts` 精确重跑 owner tests；manifest 当前绑定 17 个 profile IDs、
8 个 suites 与 28 个指定 cases，并要求所选文件中的所有用例均 passed、零 failed/skipped/todo。本次 root Gate
已直接重跑这些 owner suites，下表记录实际本地结果。

| Controlled dimension | Scenario-internal profile IDs                                        | Exact owner manifest suites                                                                  | 状态   |
| -------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------ |
| Data                 | loading、empty、error、retry、pagination、optimistic conflict        | `data-owner-runtime`、`data-golden-controlled-journeys`、`data-generated-production-runtime` | Passed |
| Auth                 | signed-out、signed-in、expired、denied、authorized                   | `auth-owner-principal-projection`、`auth-golden-target-matrix`                               | Passed |
| Recovery             | cancel、timeout、worker loss、cursor resume、duplicate、out-of-order | `recovery-adapter-lifecycle`、`recovery-browser-process`、`recovery-remote-protocol`         | Passed |

本地 evidence 已记录 exact manifest digest
`sha256-5d7140c03a80aaeb24b43b535dec058827535844ed3d6bc435afc54e3fceeeb9`、`controlled=28`、
owner-passed cases `127` 与 `skipped=0 todo=0 failed=0`；commit `bd6ef590` 的 V6 Job 已重复执行并绑定
同一 manifest/evidence digest。

## Required negative evidence

- [x] missing/ambiguous semantic target 阻止 Scenario compile，无 selector fallback（V1 local Gate）。
- [x] missing Behavior adapter、capability owner/runtime-zone mismatch、unsafe output 与 assertion drift 阻止
      V2 incremental Program 成功，无 domain fallback。
- [x] incomplete Impact 扩大 Plan 或 blocked，无漏测（V4 local/CI Gate）。
- [x] required cell unsupported/over-budget/missing dependency 阻止 Closure，无 skipped 降级（V4
      local/CI Gate）。
- [x] random/time/network/storage/motion drift 触发 replay/control failure（V3 local Gate）。
- [x] mutation conflict/retry/cancel 保持 attempt/generation fencing（V2 local Gate；worker loss 属 V5/V6）。
- [x] tool schema/adapter capability drift 阻止 normalization/promotion（V5 local/CI Gate）。
- [x] Secret/credential/PII/active artifact/path/archive bomb 阻止 promotion（V5 local/CI Gate）。
- [x] forged/replayed/expired/mismatched attestation 阻止 trusted Evidence（V5 local/CI PostgreSQL Gate）。
- [x] visual/baseline/control/tool incompatibility 不生成 pass/fail compare（V5 local/CI Gate）。
- [x] failed → retry passed 保留全部 attempts，并按 Policy 标 unstable/failed/pass（V5 Golden）。
- [x] expired/revoked/deleted Evidence 使 Closure stale/incomplete（V5 local/CI PostgreSQL Gate）。
- [x] missing/unknown/drifted runner `ImageVersion` 阻止 visual/performance comparison，无泛 Ubuntu fallback。
- [x] author realm monkeypatch 不能伪造 browser identity、sandbox、a11y、performance 或 security observation。
- [x] 同次 attempt 的 current screenshot 不能临时充当 baseline；baseline/compatibility drift 必须 blocked。
- [x] Preview Remote 必须经过 control-plane、exact bundle materialization、readiness/cursor 与 cleanup；echo
      provider 不计入 attempt。
- [x] required browser cell 不得由 smoke、skip 或未启用的 `describe.skipIf` 替代。
- [x] runtime-control 只有 initial digest、缺少同 context terminal attestation 或 cleanup release 时阻止 pass。
- [x] static artifact 缺少 per-attempt retirement，或 transport 仍有 active attempt/artifact 时阻止 pass。
- [x] 三类 canonical artifact 仍携带 absolute path、URL、vendor field、raw tool locator、private payload 或
      canary 时阻止 normalization/staging。
- [x] late callback、artifact digest drift 或 cleanup residual 阻止 Core finalization。
- [x] production bundle 不包含 verification-only probe、fixture 或 credential。

## Product journey evidence

最终必须附上可重复证据，证明：

1. Scenario authoring、semantic target、record review 和 impact preview；
2. Authenticated Catalog 的 auth/loading/empty/error/retry/pagination/optimistic conflict；
3. NodeGraph typed invocation/debugger 与 Animation/Route full/reduced transition；
4. Plan explain、matrix execution、failed finding → exact SourceTrace；
5. Evidence compare、attempt history、trust/retention；
6. Web、CLI、CI 对同一输入生成相同 Plan/Closure digest；
7. resizable IDE panel、keyboard journey、screen-reader labels 和 compact states。

截图/视频只能证明产品表面，不能替代 canonical digest、自动化 Gate、negative behavior 和 Evidence provenance。
commit `08db3e0f` 的 product job 已通过 Web `9 files / 80 tests`、CLI/Backend recovery 与上述
Scenarios/Verification/Execution/Issues/SourceTrace journey；同一 run 的 V8 job 又以 locked Plan
执行 Authenticated Catalog 66-cell cross-target Closure。产品 journey 与 canonical evidence 因而均为
`Passed`，不是由截图或绿色徽章单独推断。

## 状态更新规则

- `Not Run`：没有执行或没有可核验结果。
- `Failed`：命令执行但 Gate 未满足，保留失败链接/摘要。
- `Configured / Evidence pending`：workflow/环境已配置但没有成功可信证据。
- `Passed`：命令、commit、manifest/digest、目标环境和结果均可核验。
- Global G3 只有 aggregate、Golden matrix、negative evidence、product journey 与 trusted Closure 全部 Passed 才能通过。
