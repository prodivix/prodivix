# G4 Verified Agentic Development 总实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：V0 Implemented Locally / Durable CI Evidence Pending；V1–V9 Not Started
- ProductGateStatus：In Progress
- Global Phase：G4 Verified Agentic Development
- 日期：2026-07-31
- Owner：`@prodivix/ai`、各领域 owner、`@prodivix/workspace`、`@prodivix/verification`、
  `apps/backend` Agent service、`apps/web`、`apps/cli`
- 关联：
  - `specs/decisions/65.verified-agent-task-and-control-plane.md`
  - `specs/decisions/66.model-provider-capability-and-invocation.md`
  - `specs/decisions/67.multimodal-context-and-generated-artifact.md`
  - `specs/decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md`
  - `specs/decisions/69.real-model-evaluation-and-release-qualification.md`
  - `specs/roadmap/global-phases.md`
  - `specs/roadmap/g4-verified-agentic-development-milestones.md`
  - `specs/roadmap/g4-closure-evidence.md`
  - `specs/decisions/12.command-transaction-planner.md`
  - `specs/decisions/35.canonical-workspace-hard-cut.md`
  - `specs/decisions/57.verification-plan-impact-and-policy.md`
  - `specs/decisions/58.verification-evidence-provenance-and-retention.md`

局部 V0-V9 只表示本计划内部顺序，不代表 Global G4 已通过。本文冻结实施分解与验证方法；V0 已由本地
deterministic aggregate 和真实 PostgreSQL Gate 证明为 implemented，durable CI evidence pending。V1–V9
仍不得因文档、mock、workflow 或单次 provider smoke 存在而标记为 Implemented。

## 目标

交付一个真实的 Verified Agent loop：用户在 exact Workspace revision 上创建 bounded Task；Agent 使用可追踪
Context Pack、模型与工具生成 proposal；领域 owner dry-run 为 exact reversible Transaction；用户审阅
diff/Impact/Plan/permissions/cost 后批准；系统经唯一 Atomic Commit 写入并运行 G3 Verification；只有
satisfied Closure 才成功，失败、取消、恢复、repair 与 rollback 都可审计且不会扩大权限。

## 前置条件

- Global G0-G3 已 Passed。
- Workspace Command / Transaction、Durable Outbox 与 Atomic Commit 是唯一生产写入链。
- Workspace Semantic Index、Code Authoring Environment 与 SourceTrace 可按 exact revision 查询。
- G2 Execution/Secret/network/permission ports 可提供 callback-bound、bounded runtime。
- G3 Impact/Policy/Plan/Evidence/Closure 与 product/CLI/CI adapter 已稳定。
- ADR 65–69 的 owner、安全、capability qualification 和 G5/G6 hard cut 不得被实现便利改写。

## 范围

### current domain

- `AgentPolicy`、`AgentTaskSpec`、`AgentRun`、phase/outcome reducer；
- `AgentContextPack`、grounding/source/sensitivity/instruction boundary；
- model/provider protocol/operator/model-lineage、typed capability qualification、inference/job/state/cache identity；
- multimodal source/transform/representation 与 generated artifact candidate；
- client/runtime/provider-hosted/pinned-MCP tool、retrieval/index、computer-use boundary；
- multi-dimensional usage、cost 与 reservation/settlement ledger；
- capability policy/grant、network/Secret reference 与 approval rule；
- `AgentActionProposal`、domain action registry、proposal preview；
- exact `AgentApprovalDecision`、commit/rollback receipt；
- audit event、recovery snapshot、diagnostic 与 sanitized export。

### Workspace

- `agent-policy` current model、wire codec/migration、validator；
- `core.agent` Command namespace；
- policy semantic contribution 与 reference validation；
- Backend canonical Workspace validator/migration；
- 无 Task/Run/trace/credential Workspace document。

### Backend

- Agent Task/Run/event/proposal/approval/repository；
- claim lease、generation fence、idempotency、outbox/commit reconciliation；
- model/provider/job/tool/media/retrieval gateway 与 callback-bound Secret/network/asset adapter；
- retention、authorization、audit chain 与 PostgreSQL recovery。

### Product

- Web Task、Run、Context、Proposal/Approval、Verification/Repair、Audit surface；
- CLI create/read/plan/propose/cancel/approve-by-reference/run/inspect/export；
- provider-neutral JSON projection 与 Web/CLI parity；
- keyboard、screen reader、focus、stale/blocked/cancel/recovery accessibility。

## 非目标

- G5 多人 review、branch/merge/release/deploy、production feedback 自动 repair；
- G6 public marketplace、third-party publisher trust、billing 与 ecosystem governance；
- Agent-to-Agent delegation 或无人值守 production mutation；
- opaque Provider-managed agent、通用 shell agent、通用文件 patch、computer-use 作者态写入、任意 MCP tool；
- cross-project ambient memory、public tool marketplace 与 unrestricted Provider file/vector store；
- 把模型 reasoning/private chain-of-thought 暴露为产品功能；
- 用真实付费模型覆盖所有 conformance case。

## 写入与读取链路

```text
agent-policy Workspace document
  -> policy/current revision
  -> Agent Task service
  -> Context Pack projection
  -> model/tool adapters
  -> AgentActionProposal
  -> domain action registry
  -> dry-run Transaction + semantic diff + Impact + VerificationPlan
  -> human approval
  -> Command / Transaction
  -> Workspace Outbox / Atomic Commit
  -> target revision
  -> G3 Plan / Evidence / Closure
```

Task、Run、trace 与 approval 是 Agent service durable facts；Context Pack/preview 是 revision-bound projection；
只有 `agent-policy` 和获批 Transaction 结果属于 Workspace 作者态。读取端只能通过 current contract 与 strict
wire decoder，不读取数据库 row、React store 或 provider private payload。

## Wire、persistence 与 migration

1. `@prodivix/ai` current model 不暴露数字版本。
2. Agent Policy Workspace wire、Agent service API/event/receipt wire、audit export wire 各自版本化。
3. 所有 wire decoder strict、bounded、unsafe-key/path fail closed，并 migrate 到唯一 current model。
4. TypeScript/Go mirror 由生成 manifest 或显式 conformance 固定；禁止手工长期复制。
5. canonical digest 使用 `@prodivix/shared/canonical`；caller-provided object key 使用
   `@prodivix/shared/safety`。
6. PostgreSQL migration 只保存 service fact 与引用；不保存 secret value、raw capability、完整 prompt/tool output。
7. unknown enum/schema/version 不得回退成 `string` 或 best-effort apply。

## 实施阶段

### V0：Owner/current/wire/diagnostics hard cut

Global Phase：G4。目标 Product Gate：V0 Implemented。

交付：

- 将 G4 transport-neutral contract 从 `@prodivix/shared/src/llm` hard cut 到 `@prodivix/ai`；
- 保留真正跨端且非领域 owner 的最小基础 primitive，删除或 migrate duplicate task/action/trace type；
- 实现 current model、wire schema/codec/migration、canonical digest 与 property/conformance tests；
- 新增 `agent-policy` document、`core.agent` Command、Workspace/Backend validation；
- 接入 AI diagnostics 的 task/context/tool/approval/verification/audit stage；
- package/dependency/application boundary Gate 禁止 Web/Backend/shared 重新拥有 G4 domain。

完成条件：

- TS/Go/wire/Workspace/DB round-trip 与 negative migration 通过；
- unknown schema、unsafe key、oversize、duplicate identity、non-canonical order 都 fail closed；
- 仓库不存在 model-callable apply/commit/approval/rollback tool；
- current type 不出现数字版本。

### V1：Provider capability、Policy、Context Pack 与 invocation

Global Phase：G4。目标 Product Gate：V1 Implemented。

交付：

- AgentPolicy authoring/validation/history；
- platform/organization/project/actor/grant 最严格交集、policy evaluation instant、
  provider/model/data residency/privacy/retention rules；
- Context Pack builder、authority/instruction boundary、sensitivity/omission/source trace；
- Semantic/Code/Issues/Scenario/Verification provider contribution；
- provider adapter/configuration、protocol family、operator、endpoint profile、model/fine-tune/local-runtime lineage；
- typed capability profile、active probe 与 configuration × model × capability × policy qualification；
- inference configuration、reasoning mode、opaque continuation、stateless default 与 ambient memory prohibition；
- provider-side parent state、cache/context transform、background job/webhook/cancel/reconciliation receipt；
- canonical Provider event/invocation/job/usage normalization 与 unknown capability/state/compaction fail-closed；
- multi-dimensional usage/cost receipt 与 deterministic mock tokenizer/media/pricing adapter。

完成条件：

- 相同 revision/provider set/policy/budget 产生 byte-stable manifest/digest；
- semantic provider missing、revision drift、sensitive item、untrusted instruction 与 Secret canary fail closed；
- builder 不扫描 DOM、React store、editor state 或 build output；
- React/Vue Workspace 使用同一 context contract；
- 未评测 capability 不继承 `release-evaluated`；late background callback、cross-task continuation、ambient memory、
  unknown compaction 与 cross-tenant cache 均被拒绝；
- logical/billable/cache/unknown usage 与 non-token units 可原子 reserve/settle。

### V2：Multimodal Context 与 generated asset pipeline

Global Phase：G4。目标 Product Gate：V2 Implemented。

交付：

- raster/screenshot、PDF/document required modality profiles 与 Provider block normalization；
- content-addressed media source descriptor、resize/crop/rasterize/page/OCR/redaction transform receipt；
- media omission、cross-modal data-only instruction boundary 与 injection scanner；
- screenshot revision/renderer/viewport/DPR/font/locale/reduced-motion identity；
- visual observation 到 typed target/SourceTrace resolution；坐标不能成为 authoring target；
- generated artifact candidate、callback-bound materialization、G2 verify/scan/sanitize/provenance 与 Asset proposal；
- optional audio/video/realtime session contract、ephemeral authorization 与 partial-turn fencing；
- pixel/page/second/frame/transform/storage/artifact usage budget。

完成条件：

- 相同 source + transform policy 产生 byte-stable representation/receipt；
- corrupt/oversize/bomb/active SVG、hidden PDF/image/QR instruction、omitted page/region 与 Provider retention unknown
  全部 fail closed；
- screenshot/coordinate/OCR/model caption 不能绕过 typed domain proposal；
- Provider URL/bytes 未经 G2 scanner和 exact Asset approval不能写 Workspace；
- required `g4-visual-input` 与 `g4-document-input` conformance 可在三个 native adapter运行。

### V3：Hosted tools、retrieval、MCP 与 computer-use boundary

Global Phase：G4。目标 Product Gate：V3 Implemented。

交付：

- exact tool descriptor/registry snapshot、effect × execution-locus 与 dynamic discovery receipt；
- client/runtime/provider-hosted/pinned-MCP 的统一 preflight/grant/budget/lifecycle；
- Provider programmatic/nested call 的逐调用 identity、fencing、bounded result 与 opaque-chain rejection；
- web/URL retrieval、citation/source snapshot 与 SourceTrace mapping；
- Provider Files/vector index 的 corpus/chunker/embedding/ranker/revision/retention/deletion identity；
- hosted code sandbox、runtime/network/Secret/output/cleanup policy；
- read-only/disposable computer-use Verification adapter；禁止点击生产编辑器或 approval surface；
- parallel read、proposal staging/canonical join、conflict/cancel/fan-out/depth policy；
- opaque managed agent、arbitrary MCP、ambient memory 与 external side effect hard cut。

完成条件：

- registry 外动态 tool、hidden Provider call、opaque effect、unbounded code/network、stale/poisoned retrieval、
  computer-use authoring 与 managed-agent delegation全部被拒绝；
- dynamic/deferred tool 仍只从 frozen registry 展开并逐调用 authorize；
- late/nested/sibling callback 无法进入新 generation Context/Proposal；
- Provider file/index 可按 exact corpus lifecycle删除并留下 receipt；
- hosted capability 只有独立 qualification 后才可进入 production support claim。

### V4：Task/Run control plane、tools 与 recovery

Global Phase：G4。目标 Product Gate：V4 Implemented。

交付：

- Task create/idempotency、Run reducer/phase/outcome/attempt lineage；
- budget atomic reserve/settle、timeout/cancel/retry；
- tool registry effect classification 与完整生命周期；
- Backend PostgreSQL repository、claim lease、generation fence、event hash chain；
- process restart/worker loss/provider disconnect/late callback recovery；
- bounded sanitized audit export。

完成条件：

- repeated create/start/tool/finalize 不产生重复 side effect；
- cancel/timeout 后 late delta/tool result/ACK 被 fencing；
- restart 可恢复 awaiting approval/commit reconciliation/verification，不盲目续写模型流；
- budget crash reservation 采用保守结算；
- PostgreSQL 并发与 restart Gate 使用隔离 schema 可重复运行。

### V5：Proposal、domain planning、approval 与 Transaction

Global Phase：G4。目标 Product Gate：V5 Implemented。

交付：

- stable AgentAction registry 与 first-party PIR/Route/Data/NodeGraph/Animation/Code/Workspace actions；
- strict proposal decoder、scope/capability/policy preflight；
- domain dry-run、ephemeral candidate snapshot、semantic diff/Impact/risk/SourceTrace；
- proposal target VerificationPlan；
- exact approval decision、stale invalidation、commit reconciliation；
- reverse Transaction 与 policy-bound rollback。

完成条件：

- 模型输出不能直接成为 Command/Patch/WorkspaceOperation；
- multi-domain proposal 只形成一个原子 Transaction，任一 action 失败全部不写；
- preview/approval/transaction 任一 digest drift 都停止；
- 409 不自动 rebase，必须重新 proposal/approval；
- Workspace History/undo 与 Atomic Commit 不出现第二条 AI 写入协议。

### V6：Verification、repair、eval 与 counterexample

Global Phase：G4。目标 Product Gate：V6 Implemented。

交付：

- actual target revision committed Plan compatibility；
- G3 execution/Evidence/Closure binding；
- bounded repair round、failure-grounded Context Pack 与 new approval；
- counterexample/regression corpus；
- policy 防止 Agent 修改 required check/baseline/exemption 制造绿色；
- explain/propose/apply mode-specific terminal semantics。

完成条件：

- apply 无 satisfied Closure 永不 succeeded；
- fake tool/model “tests passed” 不产生 Evidence；
- failed attempt/Evidence 不被 retry/repair 覆盖；
- repair 每轮新 proposal、approval、transaction 与 Plan；
- auto rollback 只在 exact pre-authorized reverse Transaction 上发生并再次验证。

### V7：Web、CLI 与产品闭环

Global Phase：G4。目标 Product Gate：V7 Implemented。

交付：

- Task composer、Run timeline、Context inspector、Proposal review、Approval、Verification/Repair、Audit；
- semantic diff、Impact、Plan、permission、cost、rollback 可审阅；
- stale/blocked/security/cleanup/recovery state；
- provider-neutral CLI 与 strict JSON output；
- Web/CLI state/diagnostic/identity parity；
- keyboard/focus/screen-reader/reduced-motion/a11y。

完成条件：

- approval surface 无暗示性默认、overlay 欺骗或隐藏权限；
- refresh/reconnect 恢复 active/awaiting approval/verification view；
- CLI 不提供跳过 exact approval 的通用 flag；
- no-code 默认路径不暴露 wire/provider noise，高级诊断仍可展开全部 identity。

### V8：Security 与 real-model evaluation matrix

Global Phase：G4。目标 Product Gate：V8 Implemented / real-model durable evidence pending。

交付：

- prompt injection/untrusted structured output adversarial corpus；
- Secret/network/residency/retention/cost/permission escalation Gate；
- callback-bound server/native secret transport；
- deterministic scripted provider/tool adapters 作为完整 conformance matrix；
- `openai-responses`、`anthropic-messages`、`gemini-interactions` native adapters 与
  `openai-compatible` generic compatibility adapter；
- role/content block、stream/tool call、structured output、refusal/stop/truncation、usage/cache/reasoning、
  state/context-transform/background/error/retry-after/cancel normalization conformance；
- required text/visual/document profiles、media transform、hosted capability 与 computer-use boundary conformance；
- stateless/storage-disabled default、opaque continuation、ambient-memory prohibition 与显式
  provider-side state/cache/retention/deletion conformance；
- `release-evaluated` / `admission-only` / `disabled` 按 exact configuration × model × capability × policy slice；
- provider failure/rate-limit/truncated stream/malformed output/retry/recovery matrix；
- per-adapter bounded smoke，只作为 adapter admission evidence；
- `AgentModelEvaluationPlan` planner、repository、shard/checkpoint/resume 与 strict manifest；
- 至少 12 positive/32 cases、20 adversarial/48 cases、8 recovery/16 cases、12 capability/differential/32 cases，
  总计 52 families/128 concrete cases，且每个 primary bucket 至少 25% protected holdout；
- small/representative/near-limit Context tiers、至少 24 个 context sentinels，以及至少 16 个三档 media
  representation sentinels；
- OpenAI Responses、Anthropic Messages、Gemini Interactions 三个 native protocol family 各至少一个
  independently operated/versioned model configuration，provider operator 与 model-family owner 分别互异；
- ordinary 每 case/configuration 至少 10 attempts，48 critical cases 至少 30 attempts，至少 12 个
  high-assurance cases 至少 100 attempts；规范性最低 11,640 journeys，critical sentinel 会继续增加；
- protected/rotating holdout、预注册 sequential stopping/confidence bound、attempt denominator 与 leak prevention；
- deterministic grader/G3 Closure 优先、LLM judge辅助、sampled subjective visual cases blind human rubric；
- grounding、proposal validity、tool/action choice、dry-run、Closure、repair、unsafe-attempt、stability、
  latency/token/cost metrics 与 pre-run overall/per-provider thresholds；
- logical/billable/cache/unknown usage vector、media/tool/compute/storage/human capacity 与原子 budget reservation；
- model/prompt/Context/tool/action registry drift 后 evidence expiry 与 affected-slice rerun；
- sanitized audit artifact 与 redaction scanner。

完成条件：

- security negatives 全部 fail closed，且失败后 grant 未扩大、Workspace 未写；
- Secret canary 不出现在 Context/Prompt/Model request/Tool/Trace/Artifact/Diagnostic；
- 网络 redirect/DNS/IP/purpose drift 被拒绝；
- 四个 production adapter family 均通过 deterministic conformance；三个 native family 各有独立
  release-evaluated configuration，generic compatibility 至少有一个 hosted 与一个 local/self-hosted smoke；
- scripted matrix 证明 deterministic authority，真实模型 matrix 独立证明行为质量；两类 evidence 均不可省略；
- model-eval plan 在运行前冻结 provider/capability/corpus/holdout/context/media/repetition/grader/threshold/budget，
  manifest 无 missing shard、unknown identity、holdout leak 或 expired slice；
- aggregator、同一 adapter 下换模型或同一模型的多个 endpoint 未被误计为 native protocol/operator/model-family
  diversity；
- 三个 required configuration 分别满足 provider-specific floor；missing/timeout attempt 留在分母中，
  不被 overall average 掩盖；
- actual logical/billable/cache/unknown usage、media/tool units、cost、confidence、human review 与失败 attempt
  全部可审计；
- 本地 controlled Gate、scheduled/release model-eval 与 CI closure 产生 exact commit/run/job/artifact identity。

### V9：G4 Golden closure

Global Phase：G4。目标 Product Gate：Passed。

Golden 使用 authenticated Catalog 的真实 canonical Workspace，并至少包含：

1. 用户要求跨 PIR、Data operation、Route、NodeGraph、Animation 与 shared CodeSlot 修改一个功能；
2. Context Pack 只从 exact revision/semantic/source trace/media transformation 构建；
3. required visual/document input、cross-modal injection 与 screenshot-to-typed-target链通过；
4. scripted provider 生成 multi-domain proposal，领域 owner dry-run 为单一 Transaction；
5. generated media 仅以 G2-scanned candidate/typed Asset proposal进入 exact preview；
6. 用户审批 exact diff/Impact/Plan/permission/usage/cost/rollback；
7. PostgreSQL Agent service 经过 restart/duplicate request/late background/tool callback与 provider-job reconcile；
8. hosted tool/retrieval/parallel/computer-use negatives不形成隐藏 effect 或 alternate write；
9. Atomic Commit ACK 后 React/Vue Preview/Export/CI 执行 canonical G3 Plan并形成 satisfied Closure；
10. prompt/cross-modal injection、Secret、permission、state/memory、stale approval、budget、failed repair/rollback
    negative 均不静默写 truth；
11. Web 与 CLI 能根据同一 ids/digests 重建完整 sanitized audit；
12. 三个 native Provider/operator/model-family required capability profiles进入 128-case、11,640+ attempt、
    holdout/statistical/human-review manifest，满足预先冻结 thresholds 且未 expired。

只有 `g4-closure-evidence.md` 的 deterministic Gate、real-model evaluation Gate、closure manifest 与同一
exact commit 的 durable CI terminal success 均已取得，才更新 current-status 为 G4 Passed。

## 测试策略与真实能力成本

大多数 G4 correctness 测试不调用真实模型，但 G4 Exit 的真实模型、媒体、Hosted Tool 与人工评审不是小量 smoke：

- pure/property：reducer、digest、budget、policy、grant、schema、canonical order；
- conformance：scripted/mock provider、capability probe、media transform、hosted tool、domain action registry；
- integration：Workspace/Backend/PostgreSQL/Atomic Commit/G3 Evidence；
- E2E：Web/CLI approval/recovery/verification；
- adversarial：text/cross-modal injection、Secret、network、state/memory、hidden tool/effect、malformed output；
- adapter smoke：少量固定 task，只证明连接、streaming、structured output 与 basic tool round-trip；
- scheduled model eval：完整 corpus/configuration/repetition，证明真实行为质量；
- release closure：消费未 expired 的 exact-identity evaluation manifest。

容量规划使用以下非规范性包络；exact authority 是运行前冻结的 plan budget 与实际 provider receipts：

| Suite                                          | 典型规划量级                        | 用途                                               |
| ---------------------------------------------- | ----------------------------------- | -------------------------------------------------- |
| ordinary PR deterministic Gate                 | 0 remote-model units                | contract、security、state、permission、recovery    |
| per-adapter smoke                              | 10 万–100 万 logical tokens/adapter | transport/stream/schema/basic capability admission |
| engineering shakedown                          | 3 亿–10 亿 logical tokens           | 尚未满足全部 statistical floor                     |
| first full three-Provider G4 closure           | 10 亿–50 亿 + media/tool units      | 128 cases、11,640+ journeys、required profiles     |
| credible release/counterexample matrix         | 30 亿–100 亿 + media/tool/human     | holdout、critical、visual、repair                  |
| provider/model-upgrade differential regression | 50 亿–200 亿 + media/tool/human     | old/new 对照、更多 configurations、expired slices  |

最低 attempt 由 3,840 ordinary base、2,880 critical增量、2,520 high-assurance增量、1,440 context-tier增量和
960 media-representation增量组成，共 11,640 journeys；critical/high-assurance sentinel、Optional profile、更多
configuration与 rotating counterexample 会继续增加。cache 只降低 billable cost，不从 logical volume 删除；
Token 也不能表达 image/PDF/audio/video、search、sandbox compute、storage 或 human review。Scripted provider证明
deterministic authority，真实模型 eval证明 usefulness/grounding/repair/stability，G3 Closure证明 exact committed
revision，blind human rubric只判断主观质量；四者互不替代。

## Aggregate Gate 规划

`verify:g4:boundaries` 与 `verify:g4:boundaries:postgres` 已在 V0 落地；下表其余命令名仍是后续 milestone
冻结接口，不表示脚本已经存在：

| Gate                              | 范围                                                                   |
| --------------------------------- | ---------------------------------------------------------------------- |
| `verify:g4:boundaries`            | owner/current/wire/Workspace/diagnostics/hard cut                      |
| `verify:g4:context-policy`        | Policy/Context/grounding/privacy/residency                             |
| `verify:g4:provider-capabilities` | provider/model/profile/state/cache/job/usage conformance               |
| `verify:g4:multimodal`            | media source/transform/injection/generated-asset required profiles     |
| `verify:g4:hosted-capabilities`   | hosted tool/retrieval/MCP/computer/concurrency boundaries              |
| `verify:g4:control-plane`         | Task/Run/tool/budget/cancel/recovery/PostgreSQL                        |
| `verify:g4:proposal-approval`     | domain dry-run/Impact/Plan/approval/Transaction/rollback               |
| `verify:g4:verification`          | G3 Closure/repair/eval/counterexample                                  |
| `verify:g4:product`               | Web/CLI/a11y/reconnect/audit                                           |
| `verify:g4:security`              | text/media injection/Secret/network/state/permission/adapter negatives |
| `verify:g4:model-eval`            | 3 Providers/required profiles/128 cases/11,640+ journeys/stats/budget  |
| `verify:g4:golden`                | authenticated Catalog full loop                                        |
| `verify:g4`                       | zero-remote-token deterministic V0-V9 aggregate                        |
| `verify:g4:closure`               | exact-commit deterministic + model-eval + Golden manifest              |

## 验证证据

每个 Gate 必须记录：

- exact repository commit；
- Workspace/policy/base/target revisions 与 transaction identity；
- Task/Run/Context/Model/Tool/Proposal/Approval/Plan/Evidence/Closure digests；
- provider protocol/adapter/operator/endpoint/model lineage/capability/inference/state/job/cache identity；
- media source/transform/representation、tool registry/discovery/retrieval/index/computer-use identity；
- multi-dimensional usage/cost/budget ledger；
- model-eval plan/corpus/holdout/context/media sentinel/provider/profile/risk repetition/grader/threshold/manifest
  identities；
- logical/billable/cache/unknown usage、media/tool units、confidence bounds、human review、metric distribution 与
  expired-slice view；
- positive/negative matrix 与 exact outcome；
- local command 或 CI run/job/artifact；
- started/completed instant、known limitations 与外部 evidence pending。

不得记录 Secret、raw credential/capability、完整 prompt/private reasoning、未清洗 tool output 或伪造 cost。

## 风险与停止条件

- 若实现需要 model-callable apply/approval/commit、generic patch 或第二 Workspace write path，停止并修订 ADR。
- 若 Context Pack 只能通过扫描 editor private state 构建，停止 V1。
- 若 media transform无法绑定原件/输出/omission，或 generated Provider bytes绕过 G2，停止 V2。
- 若 hosted tool、dynamic MCP、retrieval、computer use或 managed agent effect无法逐调用授权/审计，停止 V3。
- 若 provider credential 必须进入 Browser 才能完成 production apply，停止 V8。
- 若 proposal Plan 与 committed Plan 无法判定 compatibility，停止写后自动 Verification，不宣称 apply success。
- 若 cancel/restart/duplicate request 可能重复 tool/transaction side effect，停止 V4/V5。
- 若 G3 Evidence/Closure 无法绑定 exact target revision，停止 V6/V9。
- 若 real-provider spend 无法被 coordinator hard ceiling，停止真实 provider Gate；scripted conformance 可继续，
  但 `verify:g4:model-eval` / `verify:g4:closure` 保持 Pending，G4 不得 Passed。
- 若无法区分 protocol family、provider operator、aggregator upstream 与 model-family owner，相关 configuration
  只能是 `admission-only`，不能满足三 Provider closure。
- 若 corpus/configuration/repetition/threshold 在看到结果后变化，作废该 evaluation plan 与全部派生结论。
- 若 protected holdout泄漏、attempt被删、LLM judge成为唯一 authority 或无法执行 statistical floor，
  `verify:g4:model-eval` 保持 Incomplete。
- 若 model/prompt/Context/tool/action identity drift 后没有重跑受影响 slice，model-eval evidence 视为 expired。
- 若 G5/G6 能力成为 G4 closure 前提，先明确拆界，不扩大当前 contract。

## 验收标准

- [x] G4 owner、truth、lifecycle、security 与 Verification contract 已冻结。
- [x] ADR 65–69、V0-V9 顺序、Golden 与 required evidence 已冻结。
- [x] V0 范围内没有第二套生产写入协议或领域私有真相源。
- [x] V0 公开 current/wire contract、错误语义和诊断落点已实现。
- [ ] 本地所有 required Gate 可重复通过。
- [ ] exact commit 的 durable CI Gate 与 artifact 已通过。
- [x] `ImplementationStatus` 与 `ProductGateStatus` 已按 V0 本地证据和 durable CI pending 分层更新。
