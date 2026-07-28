# G3 Behavior & Verification Closure evidence

## 状态

- EvidenceStatus：V0/V1/V2/V3/V4 Gates Passed；V5 Local Gate Passed / durable Evidence pending
- ProductGateStatus：In Progress
- 日期：2026-07-28
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
已配置；当前改动尚未提交或取得成功 CI identity，因此 V5 只能记为 local Passed / durable Evidence pending。
V6-V8 与 G3 aggregate 仍未运行，不得把 V2-V5 Golden 解释为整个 G3 已 Passed。

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

| Gate                             | 状态                          | 必须证明                                                             | Evidence                                                                                                                                                       |
| -------------------------------- | ----------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:g3:boundaries`           | Passed                        | package owner、Workspace document/Command、codec/diagnostic hard cut | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957689069)，commit `90fcf961`，2026-07-27                                         |
| `verify:g3:scenario-authoring`   | Passed                        | semantic target、recorder、compiler、React/Vue target                | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688996)，commit `90fcf961`，2026-07-27                                         |
| `verify:g3:behavior-composition` | Passed                        | Route/PIR/Data/Auth/NodeGraph/Animation typed composition            | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688962)，commit `90fcf961`，React/Vue full/reduced Chromium Golden，2026-07-27 |
| `verify:g3:deterministic-replay` | Passed                        | controls、fresh isolation、repeat/divergence、provider conformance   | [CI job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)，commit `3def9168`，2026-07-28                                         |
| `verify:g3:verification-plan`    | Passed                        | Impact/Policy/Plan determinism、budget、required semantics           | [CI job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)，commit `a6aa0bf9`，2026-07-28                                         |
| `verify:g3:evidence`             | Configured / Evidence pending | promotion、attestation、Secret hard cut、retention/recovery          | 2026-07-28 Windows local Gate + real PostgreSQL Passed；GitHub Evidence job configured，current commit/CI identity pending                                     |
| `verify:g3:adapter-matrix`       | Not Run                       | all required check families/surfaces/targets/browsers/motion         | —                                                                                                                                                              |
| `verify:g3:product`              | Not Run                       | Scenarios/Verification/Issues/Execution/SourceTrace UX/a11y/recovery | —                                                                                                                                                              |
| `verify:g3:golden`               | Not Run                       | Authenticated Catalog end-to-end trusted Closure                     | —                                                                                                                                                              |
| `verify:g3`                      | Not Run                       | aggregate with no omitted required cell                              | —                                                                                                                                                              |

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
- Limitation：本地 deterministic CI-attested fixture证明 contract，不等于 GitHub durable CI identity或真实云
  OIDC deployment evidence。当前改动未提交/推送；V6 adapter matrix、V7完整产品/CLI/CI和V8 Golden未运行。

## Required Golden matrix

最终表必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict；不得只写“matrix passed”。

V2 的 Chromium full/reduced target slice 已在本地与 GitHub CI 通过；V3 又完成受控 provider semantic
matrix与三次 fresh replay，但下表是 V6/V8 最终 required matrix，仍保持 `Not Run`，不能用 V2/V3
slice替代尚未执行的完整 Remote、多浏览器、performance/security 或 trusted Evidence。

| Surface | Target                | Browser/runtime         | Motion         | Required families                                                             | 状态    |
| ------- | --------------------- | ----------------------- | -------------- | ----------------------------------------------------------------------------- | ------- |
| Preview | React/Vite            | Chromium Browser/Remote | full + reduced | behavior、visual、a11y、security                                              | Not Run |
| Preview | Vue/Vite              | Chromium Browser/Remote | full + reduced | behavior、visual、a11y、security                                              | Not Run |
| Export  | React/Vite            | Chromium standalone     | full + reduced | build、behavior、visual、a11y、performance、security                          | Not Run |
| Export  | Vue/Vite              | Chromium standalone     | full + reduced | build、behavior、visual、a11y、performance、security                          | Not Run |
| CI      | React/Vite            | Chromium                | full + reduced | diagnostics、unit、integration、behavior、visual、a11y、performance、security | Not Run |
| CI      | Vue/Vite              | Chromium                | full + reduced | diagnostics、unit、integration、behavior、visual、a11y、performance、security | Not Run |
| CI      | React/Vite + Vue/Vite | Firefox critical subset | Policy-defined | behavior、a11y                                                                | Not Run |
| CI      | React/Vite + Vue/Vite | WebKit critical subset  | Policy-defined | behavior、a11y                                                                | Not Run |

## Required negative evidence

- [x] missing/ambiguous semantic target 阻止 Scenario compile，无 selector fallback（V1 local Gate）。
- [x] missing Behavior adapter、capability owner/runtime-zone mismatch、unsafe output 与 assertion drift 阻止
      V2 incremental Program 成功，无 domain fallback。
- [x] incomplete Impact 扩大 Plan 或 blocked，无漏测（V4 local/CI Gate）。
- [x] required cell unsupported/over-budget/missing dependency 阻止 Closure，无 skipped 降级（V4
      local/CI Gate）。
- [x] random/time/network/storage/motion drift 触发 replay/control failure（V3 local Gate）。
- [x] mutation conflict/retry/cancel 保持 attempt/generation fencing（V2 local Gate；worker loss 属 V5/V6）。
- [x] tool schema/adapter capability drift 阻止 normalization/promotion（V5 local Gate）。
- [x] Secret/credential/PII/active artifact/path/archive bomb 阻止 promotion（V5 local Gate）。
- [x] forged/replayed/expired/mismatched attestation 阻止 trusted Evidence（V5 local PostgreSQL Gate）。
- [x] visual/baseline/control/tool incompatibility 不生成 pass/fail compare（V5 local Gate）。
- [x] failed → retry passed 保留全部 attempts，并按 Policy 标 unstable/failed/pass（V5 Golden）。
- [x] expired/revoked/deleted Evidence 使 Closure stale/incomplete（V5 local PostgreSQL Gate）。
- [ ] production bundle 不包含 verification-only probe、fixture 或 credential。

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

## 状态更新规则

- `Not Run`：没有执行或没有可核验结果。
- `Failed`：命令执行但 Gate 未满足，保留失败链接/摘要。
- `Configured / Evidence pending`：workflow/环境已配置但没有成功可信证据。
- `Passed`：命令、commit、manifest/digest、目标环境和结果均可核验。
- Global G3 只有 aggregate、Golden matrix、negative evidence、product journey 与 trusted Closure 全部 Passed 才能通过。
