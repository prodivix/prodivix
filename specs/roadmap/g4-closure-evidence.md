# G4 Verified Agentic Development closure evidence

## 状态

- EvidenceStatus：V0–V7 Local + Durable CI Evidence Passed；V8–V9 Pending
- ProductGateStatus：In Progress
- 日期：2026-08-02
- Canonical milestone：
  [`g4-verified-agentic-development-milestones.md`](g4-verified-agentic-development-milestones.md)
- Contract set：
  [`ADR 65`](../decisions/65.verified-agent-task-and-control-plane.md)、
  [`ADR 66`](../decisions/66.model-provider-capability-and-invocation.md)、
  [`ADR 67`](../decisions/67.multimodal-context-and-generated-artifact.md)、
  [`ADR 68`](../decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md)、
  [`ADR 69`](../decisions/69.real-model-evaluation-and-release-qualification.md)
- Implementation：
  [`../implementation/g4-verified-agentic-development.md`](../implementation/g4-verified-agentic-development.md)

本文提前冻结 G4 Exit Gate 的证据结构。V0–V7 implementation、本地 Gate 与 exact implementation commit
`76e4d027a66be44a40f7b387854f9ae1115313da` 的 durable CI workflows 已有 terminal-success 证据；V8–V9、
real-model evaluation、最终 Golden 与 Global G4 Closure 仍为 `Pending`。文档存在、
mock provider 能响应、workflow 已配置、单次 provider smoke、一次模型回答看起来正确或 Agent 自报“测试通过”
都不能替代对应 evidence。

## Closure identity

最终 closure manifest 必须记录：

- exact repository commit 与 dirty-state policy；
- project/workspace、base/target partition revisions、Atomic Commit operation/transaction/ACK identity；
- AgentPolicy revision/digest、platform/organization enforcement digests、effective policy digest 与显式
  policy evaluation instant；
- Task/Run/generation/attempt lineage；
- Context Pack、semantic provider set、SourceTrace 与 omission manifest digest；
- provider protocol/adapter/operator/endpoint、model/fine-tune/local-runtime lineage、inference configuration、
  exact capability qualification/support tier；
- provider reasoning/opaque continuation reference、state/cache/context-transform/background-job policy/receipt；
- media source/transform/representation/omission、generated artifact candidate与 G2 scanner/provenance identity；
- tool descriptor/registry/discovery/execution locus、retrieval source/index、MCP/computer-use/concurrency receipt；
- model invocation、tool/job/media call、multi-dimensional budget ledger、usage confidence/cost/pricing digest；
- model evaluation plan/provider/profile matrix/public corpus/protected holdout/rotating policy/families/cases/
  context-media sentinels/risk repetitions/grader/human review/threshold/budget digest；
- model evaluation全部 attempt、missing/timeout denominator、logical/billable/cache/unknown usage、media/tool units、
  confidence distribution、actual cost、outcome、freshness/expiry 与 manifest digest；
- capability grant、network policy、Secret reference kind（不含 value）与 approval decision digest；
- proposal/preview/candidate snapshot/semantic diff/Impact/VerificationPlan/reverse Transaction digest；
- Evidence ids、artifact/provenance/trust/retention 与 Closure digest；
- audit event range/head digest 与 sanitized export digest；
- runtime/database/browser/OS/toolchain/target identity；
- local command或 CI run/job/artifact；
- started/completed instant、known limitations 与 external evidence pending。

禁止记录 Secret value、credential、cookie、Authorization、signed URL、capability token、raw environment、完整
prompt、private reasoning、未清洗 tool output 或生产 payload。

## Required Gate manifest

| Gate                              | 状态    | 必须证明                                                              | Evidence                                                  |
| --------------------------------- | ------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| `verify:g4:boundaries`            | Passed  | owner/current/wire/agent-policy/diagnostics/no alternate write        | commit `76e4d027` / run `30743725468` / job `91485583658` |
| `verify:g4:context-policy`        | Passed  | grounding/privacy/residency/instruction boundary                      | commit `76e4d027` / run `30743725463` / job `91485583497` |
| `verify:g4:provider-capabilities` | Passed  | profile/model/state/cache/job/reasoning/usage/scripted SPI            | commit `76e4d027` / run `30743725463` / job `91485583497` |
| `verify:g4:multimodal`            | Passed  | media source/transform/injection/visual target/generated asset        | commit `76e4d027` / run `30743725504` / job `91485583786` |
| `verify:g4:hosted-capabilities`   | Passed  | hosted tool/retrieval/MCP/computer/concurrency/managed-agent boundary | commit `76e4d027` / run `30743725513` / job `91485583685` |
| `verify:g4:control-plane`         | Passed  | Task/Run/tool/budget/idempotency/cancel/restart/PostgreSQL            | commit `76e4d027` / run `30743725458` / job `91485583579` |
| `verify:g4:proposal-approval`     | Passed  | domain dry-run/exact approval/Transaction/ACK/rollback                | commit `76e4d027` / run `30743725486` / job `91485583619` |
| `verify:g4:verification`          | Passed  | committed Plan/Evidence/Closure/repair/eval/counterexample            | commit `76e4d027` / run `30743725483` / job `91485583557` |
| `verify:g4:product`               | Passed  | Web/CLI/a11y/reconnect/trace/audit                                    | commit `76e4d027` / run `30743725467` / job `91485583520` |
| `verify:g4:security`              | Pending | text/media injection/Secret/network/state/permission negatives        | 待实现                                                    |
| `verify:g4:model-eval`            | Pending | 3 Providers/required profiles/128 cases/11,640+ journeys/stats/budget | 待实现                                                    |
| `verify:g4:golden`                | Pending | authenticated Catalog full positive/negative closure                  | 待实现                                                    |
| `verify:g4`                       | Pending | zero-remote-token deterministic V0-V9 aggregate                       | 待实现                                                    |
| `verify:g4:closure`               | Pending | exact-commit deterministic + model-eval + Golden manifest             | 待实现                                                    |

## V1 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V1 验证发生在包含本轮实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:context-policy`：Passed；AI Policy/Context 2 files / 11 tests、Workspace contributor
  1 file / 1 test、authenticated Catalog Golden 1 file / 5 tests 均通过，remote-model units 为 0。
- `pnpm run verify:g4:provider-capabilities`：Passed；provider wire/codec、scripted SPI、probe/qualification、
  invocation/state/cache/job 与 usage/pricing/budget 6 files / 31 tests均通过，remote-model units 为 0。
- `pnpm --filter @prodivix/ai test`：15 files / 76 tests Passed；
  `pnpm --filter @prodivix/workspace test`：48 files / 199 tests Passed；Catalog V1 Golden：1 file / 5 tests Passed。
- durable CI：commit `76e4d027` 的 `G4 V1 Provider and Context` run `30743725463` / job `91485583497`
  terminal success。四类真实 adapter、remote smoke、real-model statistical evaluation、V8–V9 与 Global G4
  closure均不由 V1结果代替。

## V2 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V2 验证发生在包含 V1/V2 实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:multimodal`：Passed；AI multimodal 5 files / 19 tests、G2 Assets 4 files / 27 tests、
  Golden V2 conformance 1 file / 3 tests均通过，remote-model units 为 0。
- OpenAI Responses、Anthropic Messages、Gemini Interactions 的 native media block normalization具有同一
  deterministic conformance；三个真实 Provider configuration/model qualification仍属于 V8，不由这些 fixture
  冒充。
- generated artifact经 G2 materialize/sanitize/required scan/provenance后只形成 typed Asset proposal；exact human
  approval、Atomic Commit 与 Workspace write authority均未提前授予。
- durable CI：commit `76e4d027` 的 `G4 V2 Multimodal and Generated Asset` run `30743725504` / job
  `91485583786` terminal success。

## V3 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V3 验证发生在包含 V1–V3 实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:hosted-capabilities`：Passed；30-package dependency build、AI hosted capability
  6 files / 18 tests、authenticated Catalog Golden 1 file / 3 tests、core/G4 boundary均通过；remote-model
  units 为 0。
- current/wire/codec覆盖四 execution loci、registry/discovery、逐调用 lifecycle、retrieval/source/index/deletion、
  sandbox/MCP/computer-use、parallel join与 managed-agent admission；unsafe key、unknown field/enum/version和
  digest drift均 fail closed。
- hidden/opaque/unbounded/stale/cross-project/authoring/arbitrary/delegation/late-sibling negative matrix均产生稳定
  AI-7012/7013/7014/7015 或 generation fence，Workspace revision与 capability grant canonical bytes不变化。
- durable CI：commit `76e4d027` 的 `G4 V3 Hosted Capabilities` run `30743725513` / job `91485583685`
  terminal success；V8 real-model qualification未被 deterministic fixture替代。

## V4 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V4 验证发生在包含 V1–V4 实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:control-plane:core`：Passed；31-package dependency build、AI Task/Run/reducer/budget/recovery/
  audit 4 files / 22 tests、五恢复点 restart/duplicate/cancel Golden 1 file / 10 tests、Go contract/migration/
  repository tests、core/G4/wire boundary均通过，remote-model units 为 0。
- `pnpm run verify:g4:control-plane:postgres`：Passed；本机 PostgreSQL 18 的随机隔离 schema覆盖 actor/workspace-
  bound Task admission、跨 replica Task/Run strong replay、lease expiry/takeover、旧 holder与 generation fencing、
  append-only event hash chain、operation dispatch claim与 superseded-generation reconciliation、budget
  reservation/settlement、terminal ACK replay和 audit export。
- shared canonical vector同时验证 Task/Run/Event/Audit与 repository/recovery/cancellation sequence；duplicate
  member、unsafe key、future wire、unknown field、digest/Secret/hash-chain drift全部 fail closed。V4 未创建
  Workspace document或 alternate write authority。
- durable CI：commit `76e4d027` 的 `G4 V4 Durable Control Plane` run `30743725458` / job `91485583579`
  在 PostgreSQL 16 service上 terminal success。V4证据本身不替代独立 V6 Verification或 Global G4 closure。

## V5 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V5 验证发生在包含 V1–V5 实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:proposal-approval:core`：Passed；六领域 domain registry/dry-run、single Transaction、
  semantic diff/Impact/risk/SourceTrace/VerificationPlan、exact approval、Outbox/ACK/409/rollback、strict wire/Go
  contract与 authenticated Catalog Golden通过，remote-model units 为 0。
- `pnpm run verify:g4:proposal-approval:postgres`：Passed；本机 PostgreSQL 18 随机隔离 schema执行 migration v24，
  验证 append-only Proposal/Planning/Preview/Decision/Mutation Receipt、actor/revision/policy/grant/phase binding、
  cross-replica exact replay、现有 Atomic Commit target ACK与 exact reverse Transaction rollback。
- shared `agent-proposal-vector.json`同时绑定 Task/Run sequence、Proposal facts、Workspace forward/reverse request和
  mutation digest；ambiguous/unknown/unsafe/oversize/credential/digest/lifecycle drift均 fail closed。
- durable CI：commit `76e4d027` 的 `G4 V5 Proposal Approval and Atomic Transaction` run `30743725486` / job
  `91485583619` 在 PostgreSQL 16 service上 terminal success。

## V6 local + durable CI Gate evidence

- Checkout base：`7028a24505e45dd6fc4ac988a537e7e90b74d832`；V6 验证发生在包含 V1–V6 实现的 dirty
  working tree，因此这些结果是 local implementation evidence，不是 exact-commit durable evidence。
- `pnpm run verify:g4:verification:core`：Passed；31-package dependency build、AI committed Plan/Closure/repair
  current+wire 1 file / 3 tests、authenticated Catalog G3-to-G4 Golden 1 file / 6 tests、Workspace/Workspace Sync
  typecheck、Go agentcontract/database/agent/workspace packages，以及 core/G4/wire boundaries均通过；remote-model
  units 为 0。
- Golden覆盖 initial commit ACK、actual Plan、real G3 VerificationRun event reducer、promoted immutable Evidence、
  Backend-verified evidence view、unsatisfied/satisfied Closure、satisfied-only apply proof、stable counterexample、
  failure Context Pack、fresh repair proposal/approval/Outbox Transaction、required regression retention、repaired
  revision Closure、repair-round exhaustion，以及 acknowledged rollback后的 `post-rollback` re-verification。
- `pnpm run verify:g4:verification:postgres`：Passed；本机 PostgreSQL 18.4 随机隔离 schema执行 migration v25，
  两个 integration tests验证 immutable Plan binding/Closure Evidence/repair ledgers、跨 replica byte-exact replay、
  success proof与 V5 approval/ACK/G3 Run/Evidence的 exact join，并证明同一 Run出现失败 Closure后，无
  `proposal-bound` repair lineage的 rerun-to-green仍返回 conflict。
- shared `agent-verification-vector.json`绑定 V5 Task/Run/Proposal/Approval/Commit facts、actual Plan binding、
  unsatisfied/satisfied Closure、repair started/proposal-bound/blocked和 apply terminal proof；future/unknown/
  duplicate/unsafe/credential/digest/lineage drift均 fail closed。
- durable CI：commit `76e4d027` 的 `G4 V6 Committed Verification and Repair` run `30743725483` / job
  `91485583557` 在 PostgreSQL 16 service上 terminal success。V8 real-model qualification、V9 Golden 与 Global
  G4 Closure均未由 deterministic V6替代。

## Required positive evidence

### Owner 与 truth

- [x] `@prodivix/ai` 是 G4 current domain 唯一 owner。
- [x] `agent-policy` 是唯一新增 G4 Workspace document。
- [x] Task/Run/Context/trace/approval/Evidence 不进入 Workspace。
- [x] V0 draft/model/tool/UI/Backend adapter 无 alternate Workspace write。
- [x] 所有 V5 Agent写入经过 domain Command/Transaction、Outbox 与 Atomic Commit ACK（local）。

### Grounding 与 identity

- [x] Context Pack exact revision/source/authority/sensitivity/omission 可重建（local）。
- [x] Semantic/SourceTrace provider missing 与 revision drift fail closed（local）。
- [x] provider protocol/adapter/operator/endpoint、model/fine-tune/local-runtime lineage与 inference config完整（local）。
- [x] support tier按 exact configuration × model × capability × policy qualification；未评测slice不继承（local）。
- [x] provider-side state 默认为 stateless/storage-disabled；显式 parent/cache/context transform/background job
      的 reference、retention/deletion、webhook/cancel/reconcile receipt 完整绑定。
- [x] raw private reasoning不进普通 trace；opaque continuation只 callback-bound encrypted短期回传，不作为证据（local）。
- [x] ambient/cross-project memory与 cross-tenant cache关闭；unknown compaction/context mutation fail closed（local）。
- [ ] OpenAI Responses、Anthropic Messages、Gemini Interactions native adapter 和 generic OpenAI-compatible
      adapter 具有同一 deterministic normalization/conformance evidence。
- [x] logical/billable/cache/unknown token、media/tool/compute/storage units、cost与 hard budget可审计（local）。
- [x] privacy/retention/training/data-residency policy 有正向和拒绝证据（local）。
- [x] project Policy 无法放宽 platform/organization/actor/grant enforcement（local）。

### Multimodal 与 generated asset

- [ ] required `g4-visual-input` 与 `g4-document-input` 在三个 native configurations分别 qualification。
- [x] media source、original digest、transform chain、omission、representation与 Provider block可追踪（local）。
- [x] screenshot绑定 revision/renderer/viewport/DPR/font/locale/reduced-motion；像素坐标不构成 canonical target（local）。
- [x] image/PDF/QR/metadata/OCR/transcript/tool-media injection保持 data-only（local）。
- [x] corrupt/oversize/bomb/active SVG/unsupported media在进入 Provider或Workspace前 fail closed（local）。
- [x] generated media只形成 candidate，经 G2 materialize/verify/scan/sanitize/provenance与 exact Asset proposal（local）。
- [x] optional audio/video/realtime profile未 qualification前不进入 production claim；partial turn无 proposal authority（local）。
- [x] pixel/page/second/frame/transform/storage usage与 retention/deletion receipt可审计（local）。

### Hosted capability、retrieval 与 computer use

- [x] exact tool descriptor/registry/discovery receipt固定 effect、execution locus、schema、operator与 policy（local）。
- [x] dynamic/deferred tool只在 frozen registry内展开；Provider nested/programmatic call逐调用 authorize/fence/audit（local）。
- [x] web/URL search/fetch保留 external-untrusted authority、snapshot/citation/retrieval receipt；citation不自动成为 SourceTrace（local）。
- [x] Provider Files/vector index绑定 corpus revision、chunker、embedding/ranker、scope、retention/deletion（local）。
- [x] hosted code execution为 bounded ephemeral runtime，无 ambient Secret/network/Workspace write，cleanup可证（local）。
- [x] pinned MCP之外的任意 server/tool、public marketplace与动态 capability expansion被拒绝（local）。
- [x] computer use仅在 disposable/read-only Verification session；不能操作生产编辑器、approval或现有用户session（local）。
- [x] parallel/nested depth/fan-out/budget/conflict/join/cancel与 late sibling fencing可重复（local）。
- [x] opaque managed agent只能 admission-only explain/read，无 proposal/apply/external-effect authority（local）。

### Lifecycle 与 recovery

- [x] Task/Run phase/outcome、attempt lineage 与 mode-specific success 正确（local）。
- [x] create/start/finalize/model/tool与 approval-wait/commit-ACK/verification control event强幂等（local）。
- [x] proposal/approval/Transaction exact replay与 side effect identity幂等（V5 local）。
- [x] 真实 Verification domain operation幂等（V6 local）。
- [x] cancel/timeout/retry/cleanup 与 generation fencing（local）。
- [x] PostgreSQL restart、worker loss、provider disconnect、ACK loss recovery（local）。
- [x] duplicate request 和 late callback 不重复 side effect（local）。

### Proposal、approval 与 write

- [x] model 只产生 typed untrusted proposal（local）。
- [x] domain owner strict decode/dry-run/validate/plan（local）。
- [x] multi-domain change 是单一可逆 Transaction（local）。
- [x] preview 含 semantic diff、Impact、Plan、risk、permission、rollback（local）。
- [x] human approval exact绑定 actor/revision/digests/grant/policy/expiry（local）。
- [x] commit ACK 后 actual Plan 与审批 Plan compatible（V6 local）。

### Verification、repair 与 rollback

- [x] apply success 同时绑定 ACK 与 satisfied G3 Closure（V6 local）。
- [x] promoted immutable Evidence 是唯一验证事实（V6 local）。
- [x] failed Evidence/attempt 不被 retry/repair 覆盖（V6 local）。
- [x] 每轮 repair 重新 proposal/approval/transaction/Plan（V6 local）。
- [x] counterexample/regression 进入后续 required Plan（V6 local）。
- [x] rollback 只执行 pre-authorized exact reverse Transaction（V5 local）。
- [x] rollback 后在 actual target revision再次验证（V6 local）。

### Product

- [x] Web/CLI 可读取相同 Task/Run/Proposal/Approval/Plan/Closure identity（V7 local）。
- [x] approval surface 展示 exact diff/Impact/Plan/permission/cost/rollback（V7 local）。
- [x] refresh/reconnect 恢复 active/awaiting approval/verification（V7 local）。
- [x] keyboard、focus、screen reader、reduced motion 与错误恢复通过（V7 local）。
- [x] bounded sanitized audit export 可验证完整 event/digest 链（V7 local）。

V7 local + durable CI evidence：`verify:g4:product:core` 对 strict authenticated product ledger、Web/CLI identical decoder、
Catalog component/Route/Issue入口、approval/rejection a11y、timeline/recovery/audit、Golden negative与 Go contract
执行零 remote-token Gate；`verify:g4:product:postgres` 在真实本地 PostgreSQL 18 上验证 v26 migration、
repeatable-read reload、command/approval idempotency、tamper与 authority fail-closed。commit `76e4d027` 的
`G4 V7 Web CLI Product Loop` run `30743725467` / job `91485583520` 在 PostgreSQL 16 service上 terminal success。

### Real-model evaluation

- [ ] `AgentModelEvaluationPlan` 在运行前冻结 exact commit、provider/model/profile configurations、public corpus、
      protected holdout、rotating policy、Context/media tiers、risk repetitions/sequential rule、grader/human rubric、
      thresholds 与 multi-dimensional hard budget。
- [ ] corpus 至少 12 positive/32 cases、20 adversarial/48 cases、8 recovery/16 cases、12 capability/32 cases，
      总计 52 families/128 concrete cases；case只计一个 primary bucket，每个 bucket至少 25% protected holdout。
- [ ] `small`/`representative`/`near-limit` Context tiers有至少 24 sentinels；source-faithful/representative/
      near-limit media representation有至少 16 sentinels。
- [ ] OpenAI Responses、Anthropic Messages、Gemini Interactions 三个 native protocol family 各有一个
      independently operated/versioned production-eligible model configuration；三个 `providerOperatorId`
      与 `modelFamilyOwnerId` 分别互异；required text/visual/document profiles均分别 qualification。
- [ ] ordinary每 case/configuration至少 10 attempts、48 critical至少 30、至少 12 high-assurance至少 100；
      context/media tier增量后首次 closure规范性最低 11,640 journeys，critical sentinel继续增加。
- [ ] 同一 OpenAI-compatible adapter 下换模型、aggregator 转发或同一模型的多个 endpoint 未被误计为独立
      protocol/operator/model-family diversity。
- [ ] 全部 attempt、missing/timeout denominator、失败 lineage、shard/checkpoint/resume 与 exact dedupe可审计，
      cached/replayed response不重复计数，不只保留最好结果。
- [ ] protected holdout body不泄漏到公开 artifact；rotating counterexample adoption产生新 plan digest。
- [ ] deterministic decoder/rule/domain dry-run/G3 Closure优先；LLM judge只辅助；sampled subjective visual cases
      有至少两个 independent blind ratings与冻结 adjudication规则。
- [ ] proposal validity、grounding、hallucinated target、tool/action choice、scope、dry-run、Closure、repair、
      unnecessary change、unsafe attempt、control rejection、stability 与 latency 指标满足预先冻结 threshold。
- [ ] metrics按 overall、protocol/provider/model/capability/profile/bucket/risk/Context/media/grader分层；三个 required
      configuration/profile分别满足 floor，confidence bound与 multiple-slice policy预注册。
- [ ] logical/billable/cache/unknown usage、media/tool/compute/storage units、confidence、receipt、actual cost与
      human-review capacity分别记录；cache不从 logical volume删除。
- [ ] protocol/adapter/operator/endpoint/model lineage/inference/capability、prompt、Context/transform、tool/action、
      corpus/holdout/grader、Policy或 commit drift使受影响 qualification `expired`并触发最小 slice rerun。
- [ ] full-commit journey 只在 isolated disposable evaluation Workspace 中使用 role-separated
      evaluation-only approval，不使用 production credential/data。
- [ ] per-adapter smoke 只作为 adapter admission；不能替代 `verify:g4:model-eval` 或证明 G4 Passed。

## Required negative matrix

| Negative                                  | 预期结果                                              |
| ----------------------------------------- | ----------------------------------------------------- |
| external prompt injection                 | data-only；policy/tool/approval 不改变                |
| image/PDF/QR/OCR/media injection          | data-only；grant/tool/approval 不改变                 |
| media transform/omission gap              | Context incomplete/blocked；不声称完整观察            |
| generated media/Provider URL direct write | candidate rejected；必须 G2 scan + Asset proposal     |
| malformed/unknown/oversized action        | proposal rejected；Workspace 零写入                   |
| target/field/path escape                  | capability denied；无自动 scope expansion             |
| self/fake approval                        | decision invalid；无 commit                           |
| approval/revision/policy/grant drift      | preview stale；重新 proposal/approval                 |
| Secret canary                             | 不进入 context/request/tool/trace/artifact/diagnostic |
| network redirect/DNS/IP/purpose drift     | egress denied；无 fallback unrestricted fetch         |
| protocol/adapter/operator/model drift     | invocation/proposal blocked；affected eval expired    |
| capability profile inheritance            | 未评测 slice保持 admission-only/disabled              |
| provider diversity alias laundering       | model-eval manifest invalid；`AI-8005`                |
| hidden provider-side conversation state   | invocation/evidence invalid；不读取隐式历史           |
| opaque continuation/ambient memory reuse  | cross-task/generation replay拒绝；不成为 reasoning    |
| unknown compaction/cross-tenant cache     | Context incomplete/disabled；不形成 apply evidence    |
| hidden/dynamic Provider tool              | registry外调用拒绝；无 apply effect                   |
| poisoned/stale retrieval index            | external-untrusted/blocked；不生成 current target     |
| arbitrary MCP / managed agent             | disabled或 explain/read only；无 proposal/apply       |
| computer-use authoring/approval click     | action拒绝；必须 typed proposal与独立 approval        |
| parallel/nested late sibling              | generation fenced；partial result不 finalize          |
| usage/cost/time/tool/repair exhaustion    | budget-exhausted/blocked；不自动放宽                  |
| cancel/timeout + late callback            | old generation fenced；无 state/side-effect mutation  |
| duplicate request / ACK loss              | reconcile same identity；不重复 transaction           |
| fake “tests passed” tool/model output     | 无 Evidence/Closure authority                         |
| failed/incomplete/stale Closure           | apply Run 不成功；failure history保留                 |
| retry-to-green / baseline manipulation    | blocked or new high-risk proposal；不能隐藏失败       |
| rollback with intervening revision        | rollback blocked；等待人工决定                        |
| process/worker/database restart           | reducer恢复且不重复调用/提交                          |
| cherry-picked/deleted model attempts      | evaluation manifest invalid/incomplete                |
| holdout leak / post-result threshold      | qualification blocked；必须新 plan                    |
| sole LLM judge / model self-evaluation    | 无 pass authority；需要 deterministic/human grader    |

每项 negative 必须同时断言：

1. Workspace truth 未被未授权改写；
2. grant/capability/budget 未静默扩大；
3. audit event 与 stable diagnostic 已记录；
4. Secret 与 private payload 未泄露；
5. 失败事实未被 retry/recovery 覆盖。

## Golden manifest

最终 `verify:g4:golden` artifact 至少包含：

- 一个 authenticated Catalog multi-domain positive journey；
- React/Vue × Preview/Export/CI 的 required committed Plan cells；
- exact Task/Run/Context/Proposal/Approval/Transaction/ACK/Plan/Evidence/Closure chain；
- required Provider capability/profile/state/cache/job/usage receipts；
- required media source/transform/representation、visual target与 G2 generated-asset candidate/scan/provenance receipts；
- required hosted-tool registry/discovery/retrieval/index/computer/concurrency receipts；
- 至少一次 PostgreSQL restart、duplicate request、late background/tool sibling callback与 reconciliation；
- required negative matrix 的逐项 verdict；
- model evaluation plan/provider/protocol/operator/model/profile/public corpus/protected holdout/context-media sentinel/
  risk repetition/sequential rule/grader/human rubric/threshold identities；
- 11,640+ real-model attempt/missing denominator/metric/confidence distribution、logical/billable/cache/unknown usage、
  media/tool units、actual cost、human review、freshness/expiry summary；
- sanitized audit event count/head digest；
- 每个 required artifact 的 digest/size/media type/availability；
- closure evaluator 输出 `satisfied`；
- manifest 自身 canonical digest。

artifact 不能只上传 human-readable log；必须有 strict machine-readable schema 和 decoder test。

## Evidence promotion rules

1. local `Passed` 只说明同一 worktree 的命令通过，不能替代 durable CI identity。
2. CI workflow 存在或 job queued 只能写 `Configured` / `Evidence pending`。
3. provider adapter smoke 必须记录 protocol/adapter/operator/endpoint/model/region/version、hard ceiling 与
   actual usage；它只满足 adapter admission，不能替代三 Provider required profiles、128 cases、protected holdout、
   11,640+ journeys、statistical/human thresholds 的 `verify:g4:model-eval`。
4. PostgreSQL、browser、rootless/network boundary 必须使用真实 daemon/environment，不以纯 mock 冒充。
5. rerun 必须保留失败 attempt；只引用最终绿色 run 而删除 lineage 不合格。
6. model-eval 的 provider/profile/corpus/holdout/context/media/repetition/grader/threshold 在结果产生后变化，
   或 attempt被删/holdout泄漏，必须形成新 plan或 invalid；protocol/adapter/operator/endpoint/model/inference/
   prompt/Context/transform/tool/action identity drift 会让相关 slice expired，不能沿用旧结论。
7. 所有 required Gate 必须绑定同一 exact commit，或 manifest 明确证明后续 commit 仅改变 evidence metadata；
   否则重新运行受影响 Gate。
8. 只有 `verify:g4`、`verify:g4:model-eval`、`verify:g4:golden` 与 `verify:g4:closure` 全部 terminal success、
   artifact 可读取且 manifest decoder 通过，才能把 `current-status.md` 的 G4 更新为 `Passed`。

## 当前 evidence

### V0 local + durable CI（2026-08-01）

- Implementation identity：`4428699b5dff60571518a215092575a10713608c` 实现 V0；
  `b9d4bbcd4378bed945c15272d346af6521cec9f6` 保留全部语义与 property run count，仅为通用 Turbo 并发负载下的
  重型 AgentPolicy property test 增加明确 15 秒预算，并作为最终 V0 durable evidence identity。
- `pnpm run verify:g4:boundaries`：Passed。覆盖 17-package dependency build、`@prodivix/ai` 34 tests、
  `@prodivix/workspace` 198 tests、`@prodivix/workspace-sync` 119 tests、TS/Go canonical vector、Workspace/
  Backend/database contract、diagnostics docs 与 owner/wire/hard-cut boundary；remote-model units = 0。
- `pnpm run verify:g4:boundaries:postgres`：Passed。`TestAgentPolicyAtomicCommitPostgreSQLGate` 和
  `TestAgentPolicyPostgreSQLRoundTripGate` 在本地 PostgreSQL 18 isolated schemas 中实际执行并通过；覆盖
  Atomic Commit、idempotent replay、snapshot reload、TS/Go digest、JSONB persistence、migration 与 singleton。
- [`G4 Agent Boundaries` run `30674224519`](https://github.com/prodivix/prodivix/actions/runs/30674224519)：Passed。
  exact commit 为 `b9d4bbcd4378bed945c15272d346af6521cec9f6`；job
  [`91298020728`](https://github.com/prodivix/prodivix/actions/runs/30674224519/job/91298020728) 在 Ubuntu 24.04、
  Node 22、Go 与 PostgreSQL 16 上依次通过 deterministic G4 V0 boundaries 和真实 AgentPolicy PostgreSQL
  round-trip，2026-08-01 07:59:02 +08:00 terminal success；remote-model units = 0。
- [`Tests` run `30674224474`](https://github.com/prodivix/prodivix/actions/runs/30674224474)：Passed。Frontend job
  [`91298020635`](https://github.com/prodivix/prodivix/actions/runs/30674224474/job/91298020635) 证明同一 exact commit
  在通用并发负载下通过 formatting、lint、53-package non-Web tests、Web tests 与 Web typecheck；Backend 与
  hostile-locale canonical bytes jobs 同时通过。
- V0 durable promotion 已满足；V8–V9、model evaluation、Golden、closure artifact 与 Global G4 `Passed` 仍未满足。

### V1–V7 exact-commit durable CI（2026-08-02）

- Implementation identity：`76e4d027a66be44a40f7b387854f9ae1115313da`；该 commit 包含 V1–V7 implementation、
  workflows、deterministic fixtures、真实 PostgreSQL Gate 与 product Golden，且普通 PR Gate 的 remote-model
  units = 0。
- [`G4 V1 Provider and Context` run `30743725463`](https://github.com/prodivix/prodivix/actions/runs/30743725463) /
  job [`91485583497`](https://github.com/prodivix/prodivix/actions/runs/30743725463/job/91485583497)：Passed。
- [`G4 V2 Multimodal and Generated Asset` run `30743725504`](https://github.com/prodivix/prodivix/actions/runs/30743725504) /
  job [`91485583786`](https://github.com/prodivix/prodivix/actions/runs/30743725504/job/91485583786)：Passed。
- [`G4 V3 Hosted Capabilities` run `30743725513`](https://github.com/prodivix/prodivix/actions/runs/30743725513) /
  job [`91485583685`](https://github.com/prodivix/prodivix/actions/runs/30743725513/job/91485583685)：Passed。
- [`G4 V4 Durable Control Plane` run `30743725458`](https://github.com/prodivix/prodivix/actions/runs/30743725458) /
  job [`91485583579`](https://github.com/prodivix/prodivix/actions/runs/30743725458/job/91485583579)：Passed，包含真实
  PostgreSQL 16 service Gate。
- [`G4 V5 Proposal Approval and Atomic Transaction` run `30743725486`](https://github.com/prodivix/prodivix/actions/runs/30743725486) /
  job [`91485583619`](https://github.com/prodivix/prodivix/actions/runs/30743725486/job/91485583619)：Passed，包含真实
  PostgreSQL 16 service Gate。
- [`G4 V6 Committed Verification and Repair` run `30743725483`](https://github.com/prodivix/prodivix/actions/runs/30743725483) /
  job [`91485583557`](https://github.com/prodivix/prodivix/actions/runs/30743725483/job/91485583557)：Passed，包含真实
  PostgreSQL 16 service Gate。
- [`G4 V7 Web CLI Product Loop` run `30743725467`](https://github.com/prodivix/prodivix/actions/runs/30743725467) /
  job [`91485583520`](https://github.com/prodivix/prodivix/actions/runs/30743725467/job/91485583520)：Passed，包含真实
  PostgreSQL 16 service Gate。
- 同一 commit 的 [`G4 Agent Boundaries` run `30743725468`](https://github.com/prodivix/prodivix/actions/runs/30743725468) /
  job [`91485583658`](https://github.com/prodivix/prodivix/actions/runs/30743725468/job/91485583658) 与
  [`Tests` run `30743725484`](https://github.com/prodivix/prodivix/actions/runs/30743725484) 也 terminal success。
- 本次之后只修改 `current-status`、implementation、milestone 与 evidence metadata 的提交不改变上述
  implementation identity；按 evidence promotion rule 7，该 metadata-only diff不使 V1–V7 semantic evidence
  expired。V8–V9、real-model evaluation、最终 Golden、closure artifact与 Global G4 `Passed` 仍须独立取得。
