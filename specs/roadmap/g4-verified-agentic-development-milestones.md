# G4 Verified Agentic Development milestones

> 本文件是 G4 子阶段状态的唯一里程碑来源。Global Phase 目标与退出条件见
> [`global-phases.md`](global-phases.md)，canonical contract 见
> [`../decisions/65.verified-agent-task-and-control-plane.md`](../decisions/65.verified-agent-task-and-control-plane.md)、
> [`ADR 66`](../decisions/66.model-provider-capability-and-invocation.md)、
> [`ADR 67`](../decisions/67.multimodal-context-and-generated-artifact.md)、
> [`ADR 68`](../decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md) 与
> [`ADR 69`](../decisions/69.real-model-evaluation-and-release-qualification.md)，
> 总实施计划见
> [`../implementation/g4-verified-agentic-development.md`](../implementation/g4-verified-agentic-development.md)，
> 退出证据结构见 [`g4-closure-evidence.md`](g4-closure-evidence.md)。

## 当前判断

状态：`V0 Implemented / Durable CI Evidence Passed；V1–V9 Not Started`。

2026-07-31 已冻结 G4 owner、AgentPolicy、Task/Run lifecycle、Context Pack、Provider capability/invocation、
多模态 transformation/generated asset、hosted tool/retrieval/MCP/computer-use boundary、multi-dimensional usage、
Proposal/dry-run、human approval、Atomic Commit、G3 Verification/repair、rollback、audit、recovery、security、
四类 Provider adapter 与三 Provider statistical real-model evaluation contract。G3 已 Passed，因此
Global G4 前置阻塞解除。V0 已完成 `@prodivix/ai` owner/current/wire hard cut、AgentPolicy Workspace/Backend
路径、plan-only draft boundary、diagnostics 与 boundary Gate，本地 deterministic aggregate 和真实 PostgreSQL
Gate 已通过；2026-08-01，commit `b9d4bbcd` 的 durable G4 run `30674224519` / job `91298020728` 又通过相同
deterministic 与 PostgreSQL Gate，因此 V0 为 `Implemented / Durable CI Evidence Passed`。Global G4 仍是
`In Progress`，V1–V9 尚未开始。

| Milestone                             | 状态                    | 目标闭环                                                        | 升级所需证据                                                       |
| ------------------------------------- | ----------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ |
| V0 Owner/current/wire hard cut        | Implemented / CI Passed | `@prodivix/ai`、agent-policy、codec、diagnostics、boundary      | commit `b9d4bbcd` / run `30674224519` / job `91298020728`          |
| V1 Provider/Policy/Context/invocation | Not Started             | capability/state/cache/job/usage + grounded Context             | `verify:g4:context-policy` + `verify:g4:provider-capabilities`     |
| V2 Multimodal/generated asset         | Not Started             | media transform/injection/visual target/G2 asset candidate      | local + CI `verify:g4:multimodal`                                  |
| V3 Hosted capability boundary         | Not Started             | hosted tool/retrieval/MCP/computer/concurrency                  | local + CI `verify:g4:hosted-capabilities`                         |
| V4 Task/Run/tool control plane        | Not Started             | lifecycle、budget、cancel/retry/recovery、PostgreSQL            | local + CI `verify:g4:control-plane`                               |
| V5 Proposal/approval/Transaction      | Not Started             | domain dry-run、exact approval、Atomic Commit、rollback         | local + CI `verify:g4:proposal-approval`                           |
| V6 Verification/repair/eval           | Not Started             | committed Plan、Evidence/Closure、bounded repair/regression     | local + CI `verify:g4:verification`                                |
| V7 Web/CLI product loop               | Not Started             | Task/Trace/Proposal/Approval/Verification/Audit UX              | local + CI `verify:g4:product`                                     |
| V8 Security/model evaluation          | Not Started             | fail-closed + 4 adapters + 3-Provider/128-case/11,640+ journeys | CI `verify:g4:security` + scheduled/release `verify:g4:model-eval` |
| V9 G4 Golden closure                  | Not Started             | authenticated Catalog exact-write-to-satisfied-Closure loop     | exact-commit `verify:g4:golden`/`verify:g4`/`verify:g4:closure`    |

## V0：Owner、current/wire 与 diagnostics hard cut

### 必须完成

- [x] `@prodivix/ai` 成为 G4 transport-neutral current domain 唯一 owner。
- [x] 迁移/删除 `@prodivix/shared/src/llm` 与 Web/Backend 中 duplicate Task/Action/Trace contract。
- [x] `agent-policy` typed Workspace document、`core.agent` Command/Transaction 与 Backend validator。
- [x] current/wire/codec/migration、canonical digest、TypeScript/Go conformance。
- [x] AI task/context/tool/approval/verification/audit diagnostics。
- [x] package/application/wire/Workspace boundary checker。
- [x] 禁止 model-callable apply/approval/commit/rollback 与 generic file/JSON patch。

### Golden

Policy 创建、编辑、undo/redo、outbox/commit、reload round-trip；旧 wire 唯一迁移到 current；unknown version、
unsafe key、oversize、duplicate id、non-canonical order fail closed。

### V0 本地与 durable CI 证据

- `pnpm run verify:g4:boundaries`：Passed；使用 scripted/deterministic fixtures，remote-model units 为 0。
- `pnpm run verify:g4:boundaries:postgres`：Passed；真实 PostgreSQL 18 上执行 AgentPolicy Atomic Commit、
  幂等重放、snapshot reload、跨 TS/Go digest 与独立 JSONB/migration round-trip。
- durable CI：commit `b9d4bbcd4378bed945c15272d346af6521cec9f6` 的
  [`G4 Agent Boundaries` run `30674224519`](https://github.com/prodivix/prodivix/actions/runs/30674224519) / job
  [`91298020728`](https://github.com/prodivix/prodivix/actions/runs/30674224519/job/91298020728) terminal success；
  deterministic aggregate 与真实 PostgreSQL AgentPolicy round-trip 均通过。
- V0 durable promotion 已满足；这不代表 V1–V9、model evaluation、Golden、closure artifact 或 Global G4 Passed。

### 停止条件

G4 current contract 仍散落在 shared/Web/backend，或需要在 UI 内解释领域 action 才能继续时，不进入 V1。

## V1：Provider capability、Policy、Context Pack 与 invocation

### 必须完成

- [ ] provider protocol/adapter/operator/endpoint、model/fine-tune/local-runtime lineage 与 inference configuration。
- [ ] typed capability profile、active probe、configuration × model × capability × policy qualification/support tier。
- [ ] platform/organization/project/actor/grant effective-policy intersection 与 digest。
- [ ] Context Pack item authority、instruction boundary、revision/source/digest/sensitivity/omission。
- [ ] Semantic Index、Code、SourceTrace、Issues、Scenario、Verification contribution。
- [ ] privacy、retention、training eligibility 与 data-residency evaluation。
- [ ] reasoning/opaque continuation、stateless default、ambient memory prohibition、state/cache/context transform。
- [ ] background job/webhook/cancel/reconciliation 与 generation fence。
- [ ] multi-dimensional logical/billable/cache/unknown usage、pricing、hard budget 与 confidence。
- [ ] Secret scan、untrusted content/prompt injection separation。

### Golden

同一 authenticated Catalog revision、Policy、provider set 与 budget 重建出 byte-stable Context Pack；删除
Semantic provider、插入外部恶意 instruction、Secret canary、residency mismatch、revision drift 都产生稳定
blocking diagnostic，不扩大上下文或换 provider。

同时注入 unknown compaction、cross-task continuation、ambient memory、cross-tenant cache、late background callback
和 mutable model/runtime drift；相关 invocation/qualification被拒绝或 expired，usage不记零。

### 停止条件

Context 必须依赖 DOM、React store、editor private state、完整 Workspace dump 或 Browser credential 时停止。

## V2：Multimodal Context 与 generated asset pipeline

### 必须完成

- [ ] `g4-visual-input` 与 `g4-document-input` required capability profile。
- [ ] raster/screenshot/PDF/document source descriptor、transform lineage、omission 与 Provider block normalization。
- [ ] screenshot revision/renderer/viewport/DPR/font/locale/reduced-motion identity。
- [ ] OCR、PDF layer、QR、metadata、caption与 tool media result固定 data-only。
- [ ] visual observation/coordinates 解析回 typed target/SourceTrace；unresolved target不写入。
- [ ] generated artifact candidate 经 G2 materialize/verify/scan/sanitize/provenance 后形成 typed Asset proposal。
- [ ] optional audio/video/realtime session、ephemeral authorization、partial output fencing。
- [ ] pixel/page/second/frame/transform/storage/artifact usage budget与 diagnostics。

### Golden

同一 Catalog page 的 screenshot 与 mixed image/text PDF 经 exact transform chain进入 Context，视觉目标正确映射到
PIR/Code/Asset reference；图片/PDF隐藏 injection、cropped omission和 corrupt media不会扩大权限。Provider生成图片
只有在 G2 scanner和 exact human approval后，才由一个 Asset Transaction写入 Workspace。

### 停止条件

无法绑定 source/transform/output/omission，视觉坐标或 OCR 可以直接写作者态，或 Provider URL/bytes绕过 G2 时停止。

## V3：Hosted tools、retrieval、MCP 与 computer-use boundary

### 必须完成

- [ ] exact descriptor/registry snapshot、tool effect × execution locus 与 dynamic discovery receipt。
- [ ] Provider-hosted/programmatic/nested calls逐调用 preflight/grant/budget/fence/audit。
- [ ] web/URL search/fetch、citation/source snapshot 与 SourceTrace mapping。
- [ ] Provider Files/vector index 的 corpus/chunker/embedding/ranker/revision/retention/deletion identity。
- [ ] hosted code sandbox、network/Secret/output/cleanup boundary。
- [ ] pinned MCP admission；arbitrary MCP/public marketplace/ambient memory hard cut。
- [ ] computer use仅限 read-only/disposable Verification；不能点击编辑器、approval或 production session。
- [ ] parallel read/proposal staging、canonical join、conflict/cancel/fan-out/depth policy。
- [ ] opaque managed agent仅 admission-only explain/read，无 production proposal/apply authority。

### Golden

Provider动态发现只展开 frozen registry内工具；并发 read与proposal可重复 join，late sibling被 fence。poisoned retrieval、
stale vector index、hidden nested call、unbounded sandbox、computer-use authoring、arbitrary MCP和managed-agent
delegation均产生稳定拒绝，Workspace与grant不变化。

### 停止条件

任何实际 effect无法逐调用识别、授权、预算、取消和审计，或必须给 Provider/MCP/computer use unrestricted
credential/network/filesystem/write authority时停止。

## V4：Task/Run、Tool 与 durable control plane

### 必须完成

- [ ] immutable Task 与 mode-specific success。
- [ ] Run phase/outcome reducer、attempt lineage、idempotent create/start/finalize。
- [ ] atomic budget reserve/settle、timeout/cancel/retry。
- [ ] tool effect taxonomy、preflight/authorize/execute/normalize/stage/finalize/cleanup。
- [ ] PostgreSQL Task/Run/event repository、claim lease、generation fence、hash chain。
- [ ] refresh/process restart/worker loss/provider disconnect/late callback recovery。
- [ ] bounded sanitized audit export。

### Golden

在 model stream、tool execute、awaiting approval、commit ACK reconciliation 与 verification 五个位置分别
注入 restart/duplicate/cancel；每个 side effect至多一次，旧 generation callback无权改变新状态，所有 usage/
failure/cleanup事实保留。

### 停止条件

无法证明 cancel/timeout/restart 后 callback 已失权，或数据库重试可能重复 side effect 时停止。

## V5：Proposal、approval 与 Transaction

### 必须完成

- [ ] first-party domain action registry 与 strict proposal decoder。
- [ ] target/scope/capability/policy validation。
- [ ] exact base revision dry-run 与单一 multi-domain atomic Transaction。
- [ ] candidate snapshot、semantic diff、Impact、risk、SourceTrace、proposal VerificationPlan。
- [ ] actor-bound exact approval 与 stale/digest/policy/grant invalidation。
- [ ] Durable Outbox/Atomic Commit ACK reconciliation。
- [ ] exact reverse Transaction 与 policy-bound rollback。

### Golden

同一 proposal 修改 PIR、Route、Data、NodeGraph、Animation 与 CodeSlot；任一 action invalid 时零写入。合法 proposal
展示完整 semantic diff/Impact/Plan 后获批并提交一个 Transaction。批准后注入 revision/policy/transaction/actor
任一 drift 均阻止提交；409 创建新 proposal，不自动 rebase。

### 停止条件

任何路径让 model output、tool result、UI patch 或 bearer token直接进入 Workspace write 时停止并修订 ADR。

## V6：Verification、repair、eval 与 counterexample

### 必须完成

- [ ] committed target revision Plan compatibility。
- [ ] G3 adapter、promoted Evidence 与 Closure binding。
- [ ] apply mode 只有 satisfied Closure 才 succeeded。
- [ ] bounded failure-grounded repair，每轮新 proposal/approval/transaction。
- [ ] counterexample/regression corpus 进入下一 Plan。
- [ ] 禁止 Agent 通过改 Policy/required check/baseline/exemption 制造绿色。
- [ ] pre-authorized rollback 后重新验证。

### Golden

首个提交故意产生行为 regression；失败 Evidence 保留，Agent 基于 exact failure/SourceTrace 提出修复。用户批准
第二个 Transaction，G3 Closure satisfied。另一路 budget/permission/repair round exhausted 后 blocked，不重复
运行到绿色；rollback negative 不删除原 Evidence。

### 停止条件

若 Agent 自述 test、临时 run log 或未 promotion artifact 能满足 Closure，停止 V4。

## V7：Web、CLI 与产品闭环

### 必须完成

- [ ] Task composer 与 target/policy/budget summary。
- [ ] Run timeline、cancel/cleanup/recovery、model/tool/cost identity。
- [ ] Context source/authority/sensitivity/omission inspector。
- [ ] Proposal semantic diff/Impact/Plan/permission/risk/rollback review。
- [ ] 独立、可访问、不可被 prompt 内容混淆的 approval/rejection。
- [ ] Verification/repair 复用 G3 surface。
- [ ] Web/CLI strict JSON identity/status/diagnostic parity。
- [ ] audit export、keyboard/focus/screen-reader/reduced-motion/reconnect。

### Golden

用户从 Catalog component、Route 和 Issue 三个入口创建同一 target-scoped task；刷新后恢复 awaiting approval；
screen reader 能读出 risk/permission/Plan；CLI 用相同 task/run/preview/closure ids 检查，不可跳过 approval。

### 停止条件

产品只显示自然语言总结、隐藏 exact diff/Plan，或 streaming 文本被渲染为已应用时停止。

## V8：Security 与 real-model evaluation matrix

### 必须完成

- [ ] prompt injection、tool poisoning、malformed structured output adversarial fixtures。
- [ ] target/permission/self-approval/model/provider/policy drift negatives。
- [ ] Secret callback-bound transport 与 end-to-end canary scan。
- [ ] network allowlist/redirect/DNS/IP/method/size/time enforcement。
- [ ] budget/cost/retention/residency fail-closed。
- [ ] scripted provider/tool full matrix、provider failure/retry/recovery。
- [ ] `openai-responses`、`anthropic-messages`、`gemini-interactions` native adapters 和
      `openai-compatible` generic compatibility adapter。
- [ ] role/block、stream/tool call、schema/refusal/stop/truncation、usage/cache/reasoning、
      state/context-transform/background/error/retry-after/cancel normalization conformance。
- [ ] required text/visual/document profiles、media transform、hosted capability 与 computer-use boundary conformance。
- [ ] stateless default、opaque continuation、ambient-memory prohibition；provider state/cache/job/retention/deletion
      进入 exact identity。
- [ ] `release-evaluated` / `admission-only` / `disabled` 按 exact configuration/model/capability/policy slice；
      generic compatibility 至少一个 hosted 与一个 local/self-hosted endpoint smoke。
- [ ] 每个 production-eligible adapter 的 bounded smoke；只作为 transport/stream/schema/tool admission。
- [ ] `AgentModelEvaluationPlan`、repository、shard/checkpoint/resume、attempt dedupe 与 strict manifest。
- [ ] 12 positive/32 cases、20 adversarial/48 cases、8 recovery/16 cases、12 capability/32 cases，合计
      52 families/128 concrete cases；每个 primary bucket至少 25% protected holdout。
- [ ] `small`/`representative`/`near-limit` 与至少 24 context sentinels；至少 16 media sentinels在三档
      representation重复。
- [ ] OpenAI Responses、Anthropic Messages、Gemini Interactions 三个 native protocol family 各一个
      independently operated/versioned model configuration，provider operator 与 model-family owner 分别互异。
- [ ] ordinary至少 10、48 critical至少 30、至少 12 high-assurance至少 100 attempts/configuration；
      首次 closure最低 11,640 journeys，critical sentinel继续增加。
- [ ] 运行前冻结 corpus/holdout/context/media/configuration/profile/repetition/sequential rule/grader/threshold/budget；
      保留全部 attempt、missing/timeout denominator与失败 lineage。
- [ ] protected/rotating holdout access/leak prevention与 counterexample adoption。
- [ ] deterministic grader/G3 Closure优先、LLM judge辅助、sampled visual subjective cases blind human rubric。
- [ ] proposal validity、grounding、hallucinated target、tool/action choice、scope、dry-run、Closure、repair、
      unnecessary change、unsafe attempt、control rejection、stability、latency/token/cost metrics，以及
      overall/per-provider thresholds。
- [ ] logical/billable/cache/unknown usage vector、media/tool/compute/storage/human capacity、provider receipt 与 cost。
- [ ] model/prompt/Context builder/provider set/output schema/tool/action registry/Policy/repository drift 后
      evidence expiry 与 affected-slice rerun。
- [ ] isolated disposable evaluation Workspace、evaluation-only role-separated approval、exact commit CI identity
      与 sanitized artifact。

### 真实模型边界

ordinary PR 的 `verify:g4` 使用 deterministic scripted provider 和真实系统边界，远端模型 token 为零；它证明
schema、state machine、permission、approval、transaction、recovery 与 security authority。每个 adapter 的固定
smoke 只证明连接、stream、structured output 与 basic tool round-trip，不能证明 Agent 行为质量或满足 G4 Exit。

`verify:g4:model-eval` 是独立 scheduled/release Gate，证明 usefulness、grounding、proposal-to-Closure、repair、
adversarial behavior 与 stochastic stability。engineering shakedown约 3 亿–10 亿 logical tokens；首次完整
三 Provider closure的非规范性规划包络为 10 亿–50 亿 logical tokens加 media/tool units；credible release约
30 亿–100 亿再加 human review；upgrade differential可能 50 亿–200 亿。最终 authority是预先冻结的
multi-dimensional budget与实际 receipt，不是为了命中估算而填造 token；token也不能替代媒体、搜索、计算、
存储或人工评审单位。

安全 authority 始终属于 deterministic control plane：即使模型服从 injection，也必须在 grant/schema/approval/
commit boundary 被拒绝。real-model eval 额外记录 unsafe-attempt rate，不能用“最终未写成功”掩盖模型行为。

### 停止条件

无法硬限制费用、provider identity、data residency、Secret transport 或 egress 时，不运行远端 provider Gate；
`verify:g4:model-eval` 与 `verify:g4:closure` 保持 `Pending`。若 plan 在看到结果后改变 corpus、repetition 或
threshold/grader，删除attempt或泄漏holdout，或 identity drift 后没有重跑受影响 slice，则 evidence 为
`expired`/`incomplete`，不能进入 V9。
若同一 adapter 下换模型、aggregator alias 或同一模型的多个 endpoint 被计作三个独立 Provider，则 matrix
invalid，不能进入 V9。

## V9：G4 Golden closure

### 必须完成

- [ ] authenticated Catalog multi-domain Task/Context/Proposal/Approval/Commit。
- [ ] React/Vue Preview/Export/CI required Plan 全部产生 trusted Evidence。
- [ ] satisfied Closure 与 mode-specific terminal success。
- [ ] restart/idempotency/cancel/late-callback recovery。
- [ ] text/cross-modal injection、Secret/state/memory/hidden-tool/computer-use/permission/stale/budget/failed
      Closure/repair/rollback negatives。
- [ ] Web/CLI sanitized audit parity。
- [ ] local PostgreSQL/rootless/browser zero-remote-token deterministic aggregate。
- [ ] 三个 native protocol/provider operator/model-family owner 的 required capability qualifications，以及
      128 cases/11,640+ attempts/holdout/statistics/human-review manifest。
- [ ] exact commit durable `verify:g4:golden`、`verify:g4` 与 `verify:g4:closure` aggregate/manifest artifact。

### Global G4 Exit

以下条件缺一不可：

1. 每次生产写入都可解释、可预览、可撤销、可验证；
2. approval 绑定 exact revision/transaction/Impact/Plan/permission；
3. only Atomic Commit ACK + satisfied G3 Closure 可成功；
4. 失败、取消、恢复、repair、rollback 不扩大权限或重写 truth；
5. deterministic control-plane/media/hosted-capability Gates 与三 native protocol/operator/model-family required
   profile 的 version-bound statistical model evaluation分别通过；smoke、同协议换模型或 aggregator alias不能替代；
6. Evidence manifest 满足 [`g4-closure-evidence.md`](g4-closure-evidence.md)；
7. `current-status.md` 只在上述证据取得后改为 `Passed`。

## 状态维护规则

1. 本文件只维护 V0-V9 状态与下一 Gate；Global G4 判断只在 `current-status.md` 更新。
2. `Configured` 只表示 workflow/adapter 已接入；没有执行证据不能写 `Passed`。
3. 本地测试不能替代明确要求的 PostgreSQL、browser、rootless、provider 或远端 CI evidence。
4. 真实 provider 因 credential/费用/region 暂不可运行时标记 external evidence pending；adapter smoke 即使
   通过也不能替代 `verify:g4:model-eval`。
5. 每个 milestone 更新时同时更新 implementation/evidence 的真实命令与限制，不在 `AGENTS.md` 写临时状态。
