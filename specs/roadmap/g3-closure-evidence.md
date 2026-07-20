# G3 Behavior & Verification Closure evidence

## 状态

- EvidenceStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- 日期：2026-07-20
- Canonical milestone：[`g3-behavior-verification-milestones.md`](g3-behavior-verification-milestones.md)
- Contract：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)

本文预先冻结 G3 Exit Gate 的证据结构，避免实现完成后用零散日志、绿色徽章或一次本机运行倒推验收标准。
当前没有 G3 通过证据；下列项目全部是待填 manifest，不得把文档存在解释为 Passed。

## Evidence identity

最终 closure manifest 必须记录：

- repository commit、Workspace/Scenario/Policy revision；
- semantic/provider/compiler/planner/adapter registry digests；
- ImpactSet、VerificationPlan、`BehaviorScenarioProgram` 和 Closure digest；
- fixture/control/baseline/toolchain/target/browser/sandbox identities；
- Evidence ids、manifest/artifact digests、trust/attestation/retention；
- run URL 或可重放的本地/CI命令；
- 开始/完成时间、执行环境和已知限制。

禁止记录 Secret、OIDC assertion、credential、cookie、生产 payload、raw artifact locator 或未清洗工具输出。

## Required Gate manifest

| Gate                             | 状态    | 必须证明                                                             | Evidence |
| -------------------------------- | ------- | -------------------------------------------------------------------- | -------- |
| `verify:g3:boundaries`           | Not Run | package owner、Workspace document/Command、codec/diagnostic hard cut | —        |
| `verify:g3:scenario-authoring`   | Not Run | semantic target、recorder、compiler、React/Vue target                | —        |
| `verify:g3:behavior-composition` | Not Run | Route/PIR/Data/Auth/NodeGraph/Animation typed composition            | —        |
| `verify:g3:deterministic-replay` | Not Run | controls、fresh isolation、repeat/divergence、provider conformance   | —        |
| `verify:g3:verification-plan`    | Not Run | Impact/Policy/Plan determinism、budget、required semantics           | —        |
| `verify:g3:evidence`             | Not Run | promotion、attestation、Secret hard cut、retention/recovery          | —        |
| `verify:g3:adapter-matrix`       | Not Run | all required check families/surfaces/targets/browsers/motion         | —        |
| `verify:g3:product`              | Not Run | Scenarios/Verification/Issues/Execution/SourceTrace UX/a11y/recovery | —        |
| `verify:g3:golden`               | Not Run | Authenticated Catalog end-to-end trusted Closure                     | —        |
| `verify:g3`                      | Not Run | aggregate with no omitted required cell                              | —        |

## Required Golden matrix

最终表必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict；不得只写“matrix passed”。

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

- [ ] missing/ambiguous semantic target 阻止 Scenario compile，无 selector fallback。
- [ ] incomplete Impact 扩大 Plan 或 blocked，无漏测。
- [ ] required cell unsupported/over-budget/missing dependency 阻止 Closure，无 skipped 降级。
- [ ] random/time/network/storage/motion drift 触发 replay/control failure。
- [ ] mutation conflict/retry/cancel/worker loss 保持 attempt/generation fencing。
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
