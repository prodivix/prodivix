# G3 Behavior & Verification Closure evidence

## 状态

- EvidenceStatus：V0/V1/V2 Gates Passed
- ProductGateStatus：In Progress
- 日期：2026-07-27
- G2 Exit baseline：`3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184`
- Canonical milestone：[`g3-behavior-verification-milestones.md`](g3-behavior-verification-milestones.md)
- Contract：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)

本文冻结 G3 Exit Gate 的证据结构，避免实现完成后用零散日志、绿色徽章或一次本机运行倒推验收标准。
G2 Exit Gate 已通过；V0/V1/V2 aggregate 已在本地通过，并由 commit
[`90fcf96134d880156c19c0da64692a3a39564841`](https://github.com/prodivix/prodivix/commit/90fcf96134d880156c19c0da64692a3a39564841)
的 [G3 Behavior and Verification Boundaries run](https://github.com/prodivix/prodivix/actions/runs/30260091776)
取得 durable CI identity。V3-V8 与 G3 aggregate 仍未运行，不得把 V2 Golden 解释为整个 G3 已 Passed。

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

| Gate                             | 状态    | 必须证明                                                             | Evidence                                                                                                                                                       |
| -------------------------------- | ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `verify:g3:boundaries`           | Passed  | package owner、Workspace document/Command、codec/diagnostic hard cut | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957689069)，commit `90fcf961`，2026-07-27                                         |
| `verify:g3:scenario-authoring`   | Passed  | semantic target、recorder、compiler、React/Vue target                | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688996)，commit `90fcf961`，2026-07-27                                         |
| `verify:g3:behavior-composition` | Passed  | Route/PIR/Data/Auth/NodeGraph/Animation typed composition            | [CI job](https://github.com/prodivix/prodivix/actions/runs/30260091776/job/89957688962)，commit `90fcf961`，React/Vue full/reduced Chromium Golden，2026-07-27 |
| `verify:g3:deterministic-replay` | Not Run | controls、fresh isolation、repeat/divergence、provider conformance   | —                                                                                                                                                              |
| `verify:g3:verification-plan`    | Not Run | Impact/Policy/Plan determinism、budget、required semantics           | —                                                                                                                                                              |
| `verify:g3:evidence`             | Not Run | promotion、attestation、Secret hard cut、retention/recovery          | —                                                                                                                                                              |
| `verify:g3:adapter-matrix`       | Not Run | all required check families/surfaces/targets/browsers/motion         | —                                                                                                                                                              |
| `verify:g3:product`              | Not Run | Scenarios/Verification/Issues/Execution/SourceTrace UX/a11y/recovery | —                                                                                                                                                              |
| `verify:g3:golden`               | Not Run | Authenticated Catalog end-to-end trusted Closure                     | —                                                                                                                                                              |
| `verify:g3`                      | Not Run | aggregate with no omitted required cell                              | —                                                                                                                                                              |

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
- Limitation：NodeGraph same-context `ExecutionSession` 尚未向产品 Inspector提供 live debug snapshot/command
  bridge，fresh replay/live stepping归入 V3；V6/V8 的 Browser/Remote、Firefox/WebKit、performance/
  security 与 trusted Evidence matrix仍未运行。V2 Gate 已有 durable Evidence，但不能据此宣称整个 G3
  Closure。

## Required Golden matrix

最终表必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict；不得只写“matrix passed”。

V2 的 Chromium full/reduced target slice 已在本地与 GitHub CI 通过，但下表是 V6/V8 最终 required matrix，仍保持
`Not Run`，不能用 V2 slice替代尚未执行的 Remote、多浏览器、performance/security 或 trusted Evidence。

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
- [ ] incomplete Impact 扩大 Plan 或 blocked，无漏测。
- [ ] required cell unsupported/over-budget/missing dependency 阻止 Closure，无 skipped 降级。
- [ ] random/time/network/storage/motion drift 触发 replay/control failure。
- [x] mutation conflict/retry/cancel 保持 attempt/generation fencing（V2 local Gate；worker loss 属 V5/V6）。
- [ ] tool schema/adapter capability drift 阻止 normalization/promotion。
- [ ] Secret/credential/PII/active artifact/path/archive bomb 阻止 promotion。
- [ ] forged/replayed/expired/mismatched attestation 阻止 trusted Evidence。
- [ ] visual/baseline/control/tool incompatibility 不生成 pass/fail compare。
- [ ] failed → retry passed 保留全部 attempts，并按 Policy 标 unstable/failed/pass。
- [ ] expired/revoked/deleted Evidence 使 Closure stale/incomplete。
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
