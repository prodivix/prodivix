# Prodivix 当前状态

> StatusDate: 2026-08-02
> 本文件是 G0/G1/G2/G3/G4 当前完成状态的唯一来源。`global-phases.md` 定义阶段目标与退出条件；evidence 文档保存可重复验证证据，不重复声明当前状态。

## 全局阶段

| Phase                              | Product Gate | 当前判断                                                                                                                                                                                 |
| ---------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0 Truth & Change Kernel           | Passed       | Canonical Workspace、可逆 change、唯一生产写入链、conflict/outbox/local replica 与 Issues closure 已验证。                                                                               |
| G1 Semantic Hybrid Authoring       | Passed       | PIR-current、Semantic Index、Code/Shader、Component/Collection、controlled round-trip、Asset semantic surface 与 React/Vite Golden 已验证。                                              |
| G2 Executable Full-stack Workspace | Passed       | current G2 scope 的本地 implementation/product/security closure 与 commit `3f3047b8` 的 non-cloud GitHub evidence 已通过；AWS/真实云 evidence 继续作为外部 pending，不宣称 Passed。      |
| G3 Behavior & Verification Closure | Passed       | V0-V8 已实现；本地 PostgreSQL 18.4 aggregate 与 commit `08db3e0f` 的 V7 product/OIDC、V8 trusted Closure、manifest artifact 和分布式 CI aggregate 全部通过。                             |
| G4 Verified Agentic Development    | In Progress  | V0–V7 已实现且 exact-commit durable CI 通过；V8–V9 已本地实现，V9 browser/PostgreSQL Golden 已通过；exact-commit deterministic CI、real-model evidence 与 Global G4 Closure 仍 Pending。 |
| G5 Collaborative Production Loop   | Blocked      | 等待前置阶段。                                                                                                                                                                           |
| G6 Trusted Ecosystem               | Blocked      | 等待前置阶段。                                                                                                                                                                           |

阶段定义与退出条件：[`global-phases.md`](./global-phases.md)。G0/G1 重复验证边界：
[`g0-closure-evidence.md`](./g0-closure-evidence.md)、[`g1-closure-evidence.md`](./g1-closure-evidence.md)。
G2 可重复证据与外部 pending：[`g2-closure-evidence.md`](./g2-closure-evidence.md)。
G3 contract 与阶段状态：[`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)、
[`g3-behavior-verification-milestones.md`](./g3-behavior-verification-milestones.md)；证据模板：
[`g3-closure-evidence.md`](./g3-closure-evidence.md)。
G4 contract 与阶段状态：
[`../decisions/65.verified-agent-task-and-control-plane.md`](../decisions/65.verified-agent-task-and-control-plane.md)、
[`ADR 66`](../decisions/66.model-provider-capability-and-invocation.md)、
[`ADR 67`](../decisions/67.multimodal-context-and-generated-artifact.md)、
[`ADR 68`](../decisions/68.hosted-tool-retrieval-and-computer-use-boundary.md)、
[`ADR 69`](../decisions/69.real-model-evaluation-and-release-qualification.md)、
[`../implementation/g4-verified-agentic-development.md`](../implementation/g4-verified-agentic-development.md)、
[`g4-verified-agentic-development-milestones.md`](./g4-verified-agentic-development-milestones.md)；证据结构：
[`g4-closure-evidence.md`](./g4-closure-evidence.md)。

## G4 当前进度

2026-08-01，G4 ADR 65–69 production contract set 已冻结；V0 已实现并取得 durable CI evidence；V1 已实现并通过
`verify:g4:context-policy` 与 `verify:g4:provider-capabilities` 本地 Gate；V2 已实现 media current/wire、确定性
transform/omission、三 native Provider block normalization、视觉 typed target resolution、realtime fencing与
G2-scanned generated Asset proposal，并通过 `verify:g4:multimodal` 本地 Gate。V3 已实现 exact
registry/discovery、逐调用 grant/budget/generation fence、web retrieval与
Provider index lifecycle、bounded sandbox、pinned MCP、disposable computer-use、parallel canonical join、
managed-agent hard cut与 strict wire/codec，并通过 `verify:g4:hosted-capabilities` 本地 Gate。V4 已实现 immutable
Task、Run reducer/attempt/generation、atomic budget、cancel/retry/recovery、V3 tool receipt bridge、strict wire/Go
admission、PostgreSQL repository/lease/dispatch/hash chain与 bounded audit export；`verify:g4:control-plane:core`和
真实 PostgreSQL 18 Gate均本地通过。V5 已实现六领域 first-party action registry、strict proposal wire/Go admission、
exact dry-run与单一可逆 Transaction、semantic diff/Impact/SourceTrace/VerificationPlan、actor-bound approval、唯一
Outbox/Atomic Commit ACK、409 fresh-proposal fence、rollback和 PostgreSQL v24 append-only ledger；deterministic core
与真实 PostgreSQL 18 proposal→approval→commit→rollback Gate均本地通过。V6 已实现 actual committed Plan、G3
VerificationRun/promoted Evidence/verified view/Closure binding、satisfied-only apply、failure-grounded bounded repair、
counterexample/regression requirement、新 proposal/approval/Outbox Transaction、rerun-to-green fence、post-rollback
re-verification与 PostgreSQL v25 append-only ledger；`verify:g4:verification:core`和真实 PostgreSQL 18 Gate均本地
通过。V7 已实现 strict Agent product projection、Backend PostgreSQL v26 durable ledger、Web 三入口 Task composer、
Run/Context/Proposal/Verification/Audit surface、独立可访问 approval/rejection、CLI exact loop、Web/CLI JSON parity、
Golden/OpenAPI/workflow；`verify:g4:product:core`和真实 PostgreSQL 18 Gate均本地通过。2026-08-02，exact
implementation commit `76e4d027a66be44a40f7b387854f9ae1115313da` 的 G4 V1–V7 独立 workflows 全部 terminal
success，且普通 PR Gate 的 remote-model units 为 0。V8 已在当前 working tree实现四类原生/兼容 adapter、
fail-closed security、128-case/52-family planner、11,640+ schedule、statistical manifest、TypeScript/Go wire、
PostgreSQL v27 immutable facts与 CAS budget ledger、Golden与 zero-remote-token CI workflow；本地 deterministic和
真实 PostgreSQL Gate
已通过。V9 也已在当前 working tree实现 authenticated Catalog exact proposal/approval/Commit、66-cell/80-attempt
React/Vue Preview/Export/CI trusted Evidence、按 surface 分离的三 VerificationRun binding、satisfied Closure、
terminal success、8 类 recovery、15 类 fail-closed negative、Web/CLI audit parity、strict G4 Closure manifest、
PostgreSQL v28 immutable Run-set ledger与 zero-remote-model workflow；本地 browser Golden和完整 G4 PostgreSQL
aggregate已通过。当前改动尚未形成 exact-commit durable CI，rootless runtime、三个真实 Provider matrix、bounded
endpoint smoke、受保护 holdout operation、真实 human review与未过期 release qualification仍 Pending；最终
`verify:g4:golden`/`verify:g4`/`verify:g4:closure` durable evidence与 Global G4 Closure也仍 Pending。
当前实现与已确定边界如下：

- `@prodivix/ai` 已成为 G4 transport-neutral current/wire 唯一 owner；旧 `packages/shared/src/llm` 已删除，
  Blueprint assistant 迁移到只产出 bounded plan 的 `AiDraft*` boundary，不具备 proposal/apply/approval/commit 权限。
- `agent-policy` 已成为 typed singleton Workspace document；current/wire v0→v1 migration、canonical digest、
  TypeScript/Go schema/semantic conformance、reversible `core.agent` Command、Outbox/Atomic Commit/Reload 和
  PostgreSQL migration/unique constraint 已实现。
- AI diagnostics registry、generated docs、package/application/wire/Workspace boundary checker 与独立 G4 CI
  workflow 已落地。本地 `verify:g4:boundaries` 和 `verify:g4:boundaries:postgres` 已通过；commit `b9d4bbcd`
  的 G4 run `30674224519` / job `91298020728` 又在 Ubuntu、Node 22、Go 与 PostgreSQL 16 上通过相同
  deterministic aggregate 和真实 PostgreSQL round-trip。

- `@prodivix/ai` 是 AgentPolicy、Task/Run、Context、Provider/capability、media/tool/evaluation current domain 的
  唯一 owner；各领域、Asset、Runtime与 Verification owner继续唯一生成各自 mutation/asset/evidence truth。
- Workspace 只新增 `agent-policy` typed document；Task、Run、Context、trace、approval 与 Evidence 属于
  derived projection 或 Agent service durable facts，不形成第二作者态。
- 模型只能产出不可信 typed proposal；生产写入必须经领域 dry-run、exact human approval、现有
  Durable Outbox / Atomic Commit，并在 actual target revision 上取得 G3 satisfied Closure。
- exact capability qualification按 configuration × model × profile × policy slice；reasoning/state/cache/context
  transform/background job、ambient memory与 multi-dimensional usage均进入 identity/receipt。
- required visual/document profile冻结媒体 source/transform/omission、cross-modal injection和 generated candidate
  到 G2 Asset pipeline；V2 已实现 exact screenshot capture identity、OpenAI/Anthropic/Gemini media block
  normalization、typed SourceTrace resolution、callback-bound generated bytes 与 PNG/JPEG sanitizer/scanner proposal；
  视觉坐标、OCR或 Provider URL不能直接写作者态。
- Provider-hosted tool、retrieval/files/index、dynamic tool/MCP、code execution、computer use、parallel/nested call与
  managed-agent boundary 已实现；四 execution loci 共用 exact registry、逐调用 grant/budget/audit/fence，opaque或
  unrestricted effect禁止进入 production apply，late result仅进入 audit。
- Task/Run/Event/Audit strict control fact、pure reducer和 PostgreSQL v23 durable control plane 已实现；Task、
  attempt version与 event append-only，Run projection以 cursor/snapshot digest CAS，worker lease与 operation
  dispatch lease共同 fencing，crash reservation保守结算，五个 restart位置不盲目重复 side effect。V4仍不拥有
  proposal/approval/Transaction或 Workspace write authority；该 authority由后续 V5 exact flow独立取得。
- V5 模型输出只形成 untrusted typed action；PIR/Route/Data/NodeGraph/Animation/Code六领域 owner在 exact base
  revision上 dry-run，统一生成 candidate、semantic diff、Impact、SourceTrace、proposal VerificationPlan与一个
  reversible Transaction。actor-bound approval重新绑定 preview/transaction/Impact/Plan/policy/grant/expiry，唯一
  Workspace Sync coordinator才可进入既有 Outbox/Atomic Commit；409不自动 rebase，rollback只使用批准时的 exact
  reverse Transaction。Backend migration v24将 Proposal、Preview、Decision与 Mutation Receipt保存为append-only
  service facts，不进入 Workspace。
- V6/V9 在 commit/rollback ACK 后重新绑定 actual target revision Plan与按 Preview/Export/CI surface分离的
  VerificationRun set；G3 Closure只消费 promoted
  immutable Evidence和 Backend-verified view。失败 Closure生成 stable counterexample/regression requirement，下一轮
  必须使用新的 proposal/approval/Transaction/Plan并受累计 repair/transaction budget约束；同一 Run只要出现过失败，
  后续 satisfied Closure若无 exact `proposal-bound` repair ledger仍不能 terminal succeeded。Rollback本身也作为新的
  acknowledged mutation重新规划和验证，`post-rollback` Closure不冒充 apply success。
- Secret、network、text/media injection、untrusted content、permission escalation、budget、cancel/retry/recovery
  全部 fail closed；Agent 不得自我审批、扩大 grant、点击 UI绕过 proposal或自报验证通过。
- G4 correctness/security 的普通 PR aggregate 使用 deterministic provider，消耗 0 remote-model tokens；
  per-adapter smoke 只证明 transport admission。G4 baseline 冻结 OpenAI Responses、Anthropic Messages、
  Gemini Interactions 三个 native adapters 和 generic OpenAI-compatible compatibility adapter。
- G4 Exit另需未过期 `verify:g4:model-eval`：128 cases/52 families、每 bucket至少 25% protected holdout、
  24 context与16 media sentinels；ordinary 10、48 critical 30、至少12 high-assurance 100 attempts/configuration，
  首次规范性最低11,640 journeys。三个 native Provider/operator/model-family required text/visual/document profiles
  分别满足 floor；同 adapter换模型或 aggregator alias不能凑数。
- 非规范性容量规划：engineering shakedown约3亿–10亿 logical tokens；首次完整三 Provider closure约
  10亿–50亿加 media/tool units；credible release约30亿–100亿加 human review；upgrade differential可能
  50亿–200亿。authority是冻结的 provider/profile/corpus/holdout/tier/repetition/grader/threshold/usage budget与
  实际 receipt，不能只用 token或成本表达工作量。
- V0-V9、required Gate、Golden positive/negative matrix 与 evidence manifest 已提前冻结；V0–V7 为
  `Implemented / Durable CI Evidence Passed`；V8–V9 为 `Implemented Locally / Exact-commit Deterministic CI and
Real-model Evidence Pending`。本地 V9 Golden或 PostgreSQL通过不等于 Global G4 `Passed`。

## G3 当前进度

截至 2026-07-31，V0 已建立 `@prodivix/behavior`、`@prodivix/verification`、五种 Workspace document、
`core.behavior` / `core.verification` Command namespace、严格 current/wire codec、Backend schema/migration、
BHV/VER registry/reference 和 package/application boundary Gate。V1 已建立 domain-owned Behavior registry、
revision-bound semantic target、Scenario CRUD/impact/history、Secret-free recorder review/atomic adoption、
deterministic Program/SourceTrace/digest，以及 React/Vue 共用 Program 的 authenticated Catalog browser Golden。
V2 已建立 canonical parallel/barrier lowering、provider-neutral capability runtime 与真实 Preview/Export/CI
surface adapter。NodeGraph 已完成 current/wire v2、deterministic v1 migration、TypeScript/Go/DB hard cut、
strict planner、bounded loop/Auth/subgraph closure、first-party runtime、frame/Behavior correlation 与产品
Runtime Inspector；Animation/Route 已完成 wire v2、stable-instance controls、composition、target/property
conflict、deterministic lifecycle、motion policy、CodeSlot/shader 与 full/reduced required marker parity。
React/Vue standalone projection 共用 NodeGraph/Animation compiler/runtime helper；独立项目 install/typecheck/
test/build/Chromium smoke验证 authenticated Catalog optimistic conflict、目标特定 visual hash、ARIA、
focus 与 operability兼容。
V3 已增加 canonical scheduler、logical clock/scoped random/id、control profile/preflight/digest、
fixture-only network、fresh storage/auth/service-worker isolation、render/motion controls、bounded
ReplayRecord codec/first divergence/fresh replay debugger，以及 Browser/Remote/Export/CI provider
conformance。NodeGraph 产品 Inspector 现通过与普通 Run 互斥的 identity-fenced Debug attempt执行
pause/step/continue/cancel/fresh replay，避免 sidecar重复 effect；16 个 semantic matrix cell 与真实
React/Vue Chromium full/reduced target均完成三次
fresh replay，random/schedule/network drift negative可定位首个分歧。
V4 已建立 before/after Semantic Index ImpactSet 与 domain contributor、unknown/incomplete conservative
expansion、可逆 verification-policy Command、required/advisory/forbidden precedence、matrix/budget/retry/
exemption evaluator，以及 deterministic discovery、DAG/resource dependency、canonical Plan/Closure/
explanation projection。Web Verification resource surface与可执行 CLI 共用 exact JSON projector；Catalog
PIR、Data、Route guard、NodeGraph、Animation、shared CodeSlot 六个隔离域 Golden 与组合 Golden
固定 Plan digest
`sha256-99a7139cd204c124c94b5ff36b74d7a62d0596feb70ff34177bdaf863db0fcd8`。
V5 已建立独立于 Workspace/Execution 的 append-only Evidence plane：strict Candidate/Plan/manifest/artifact
codec、server-issued immutable AttemptGrant 与一次性 claim、PostgreSQL atomic promotion、content-addressed
artifact store、local/remote/CI/import trust、两阶段 attestation、revocation/comparison/supersession、retention/
protection/tombstone/GC，以及可重算 Closure。Web Evidence panel 使用 strict verified-view codec 和安全
JSON/raster/text viewer，SourceTrace 只导航到实际持久化引用。`protectReleaseEvidence` 在 V5 只作为
Plan/AttemptGrant policy signal；真实 change/release owner 的 external reference protection 由后续 owner
materialize，Backend 不伪造 G5 identity。
V6 已新增 `@prodivix/verification-adapters` 与 `@prodivix/verification-browser` owner，接入
diagnostics/build/unit/integration 与 E2E/visual/accessibility/performance/security 的 controlled boundary；
root `verify:g3:adapter-matrix` 聚合 Verification Core、两类 adapter、Runtime providers、Compiler production
probe、66-cell/8-row/80-attempt Golden、Scenario-internal Data/Auth/Recovery companion Gate 与 owner
boundaries。2026-07-29 本地 root aggregate 已完整通过：80 attempts 全部 reported/passed，真实三浏览器 adapter
tests、Backend verification contract、remote worker 与 rootless snapshot contract 同步通过。独立 workflow 已
pin `ubuntu-24.04`，并由共享 registry 按 pre-adopted runner `ImageVersion` 绑定同族 Podman、OCI runtime、
conmon 与受支持的 cgroup manager；Linux controlled static install 已将 image build 的 frozen package-manager
验证与 runtime immutable package seed 物化分离，并以 30 秒 bounded Node authority command 取代
network-none runtime 中不确定的 package-manager 调用，重算完整 toolchain file-set identity。commit
[`bd6ef590`](https://github.com/prodivix/prodivix/commit/bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb)
的 [V6 CI Job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
又在 pre-adopted runner、真实 rootless Podman 与 Chromium/Firefox/WebKit 上完成 post-install authority
attestation 和 80-attempt matrix，形成 durable evidence。
V7 已建立 strict versioned Verification Run/Closure/CI job contract、Backend v21 durable run registry 与
revision/plan-bound API、provider-neutral `verify` CLI，以及 Scenarios/Verification/Execution Center/Issues/
SourceTrace 一体产品表面。root `pnpm run verify:g3:product` 于 2026-07-31 在本地通过：Verification
255 tests、CLI 6 tests、V4 planner Golden 12 tests 与 CLI parity、Web 80 tests、Backend 三个 Go package、
29-package build closure 和 Core/G3/wire boundaries 全部通过；设置隔离测试 URL 后，本机 PostgreSQL 18.4
restart/idempotency Gate 与完整 product Gate 也通过，随机 schema 已自动清理。commit
[`08db3e0f`](https://github.com/prodivix/prodivix/commit/08db3e0fe9f17ca4dc8fbd16829a43f85c0a012a)
的 [V7 product job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91082654078)
又在 PostgreSQL 16 上通过；不持有 OIDC 权限的 product job 与仅在 `push/workflow_dispatch`
取得短期 identity 的
[trusted OIDC job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91083228854)
均成功，fork/untrusted hard cut 与 GitHub immutable `name@id` subject admission 取得真实远端证据。
因此 V7 为 `Implemented / durable CI Evidence Passed`。
V8 已锁定 Authenticated Catalog trusted Plan digest
`sha256-67676af5b3930e32906ba9d5a835d82a11bd2f6a2d48100497082d0b685ee011`，并复用 V6
controlled execution path 实际执行 80 个 attempts。每个 required cell 精确选择一个结果并规范化为
66 个 Evidence，其中 Preview 为 14 个 `remote-attested`，Export/CI 为 52 个 `ci-attested`；
Backend-verified trust/artifact/revocation view 重算得到 66 cell 全部 `passed` 的 `satisfied` Closure。
missing、failed、retryable blocked、unstable、expired、revoked、unverified 与 artifact missing negative
均阻止 Closure。机器 manifest 现逐 cell 记录 Plan identity、selected attempt、accepted Evidence、
trust/attestation、compatibility、176 个 artifact availability 与 verdict；66 个唯一 cell/Evidence 的
本地 cell manifest digest 为
`sha256-85cf2d6e569c31541feffac32bc7dbe91bbb5f51c5ef9e25790a2f1c98ec7009`。root
`pnpm run verify:g3:golden` 与增强后 V8 package Gate 已在本地通过。同一 commit 的
[V8 CI Job](https://github.com/prodivix/prodivix/actions/runs/30607438729/job/91085620980)
又在 fixed runner、rootless controlled static sandbox 与 Chromium/Firefox/WebKit authority 上通过并上传
[manifest artifact](https://github.com/prodivix/prodivix/actions/runs/30607438729/artifacts/8784654298)：
66 个唯一 cell、176/176 个 `available` artifacts，远端 cell manifest digest
`sha256-0c1c8c91f6247243ec6159c212d440de85f387cbc0b5c6ed6b9c283fea7de073`，顶层
manifest digest
`sha256-bd756f69a90c2048d5da0fe333c5421d2ed7eb9dc78cb04ad93eb6ffa1711019`，Closure 为
`satisfied`。
`pnpm run verify:g3:boundaries`、
`pnpm run verify:g3:scenario-authoring`、`pnpm run verify:g3:behavior-composition` 与 `pnpm run build`
在本地通过；commit
[`90fcf961`](https://github.com/prodivix/prodivix/commit/90fcf96134d880156c19c0da64692a3a39564841)
的 [G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30260091776) 三个独立 Job 全部通过并形成
V0-V2 durable evidence。`pnpm run verify:g3:deterministic-replay` 已在本地通过；commit
[`3def9168`](https://github.com/prodivix/prodivix/commit/3def9168a436594db1145274e011632e228a0db9)
的 [V3 CI Job](https://github.com/prodivix/prodivix/actions/runs/30319894969/job/90153389007)
也已通过并形成 durable evidence。`pnpm run verify:g3:verification-plan` 已在本地通过；commit
[`a6aa0bf9`](https://github.com/prodivix/prodivix/commit/a6aa0bf9452d66598c168e01f695f4d85deeacad)
的 [V4 CI Job](https://github.com/prodivix/prodivix/actions/runs/30327609403/job/90176153041)
也已通过并形成 durable evidence。`pnpm run verify:g3:evidence` 已于 2026-07-28 在本地通过，包含
真实 PostgreSQL integration、184 个 Verification tests、16 个 V5 Golden tests、52 个 Web tests、
Backend short suite 与 owner/wire boundaries；commit
[`f3d91b9d`](https://github.com/prodivix/prodivix/commit/f3d91b9dfc786b167fa5df825cd45116441c725c)
的 [V5 CI Job](https://github.com/prodivix/prodivix/actions/runs/30343213393/job/90223334935)
也已通过并形成 durable evidence。V6 Adapter matrix 的本地 Gate 与上述固定 commit CI Job 均已通过。
2026-07-31，连接本机 PostgreSQL 18.4 的完整 `pnpm run verify:g3` 在约 `32m55s` 内以 exit code `0`
连续通过 V0-V8；增强后的逐-cell manifest 又通过当前 V8 package Gate。commit `08db3e0f` 的
[G3 CI run](https://github.com/prodivix/prodivix/actions/runs/30607438729) 随后以 10 个 G3 jobs 全部
terminal success 闭合 V0-V8、V7 OIDC、V6 三浏览器与 V8 manifest upload；同一 SHA 触发的
CodeQL、Security、Tests、Rootless、Docker、Smoke 与 G0/G1 workflows 也全部成功。Global G3
Product Gate 因此为 `Passed`。

## G2 当前完成面

2026-07-20，统一 `pnpm run verify:g2` 已在本机 PostgreSQL 18 下完整通过（596.1s），Runner/DR、Data、
Auth/Server 与 Binary Asset 四个 aggregate 全部闭合；monorepo test、lint 与 build 也通过。随后 current-scope
GitHub PostgreSQL、authenticated Catalog rootless Preview/Test/Build、ClamAV + YARA-X real-engine 与相关 matrix
全部取得通过证据。commit `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184` 又完成 regional operator、MRK v2、
PIR wire migration 与相关回归的远端闭环：14/14 个自动 workflow、25/25 个 check-run 全部成功。因此 current-scope
G2 Exit Gate 已通过；真实云 regional RPO/RTO 与 A14 AWS OIDC/KMS/MRK live run 继续作为明确的外部 evidence pending，
不升级对应 provider milestone，也不构成已经取得真实云证据的声明。

| 主线                  | current G2 closure                                                                                                                                                                                                                                                                                                                                                               | 未取得的外部证据                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Execution             | neutral Request/Provider/Job/Session/Snapshot；Browser/Remote Preview/Test/Build/production；rootless contract/real Gate；Console/Terminal/Network/Files/Test/SourceTrace；bounded reconnect/artifact/quota/worker-loss；NodeGraph/Animation G2 slice；regional DR exact/batch/one-shot operator/source-unavailable fencing/attested-RPO/sanitized evidence本地PostgreSQL Gate。 | 真实云 regional promotion/fencing/RPO/RTO；AWS KMS/MRK live evidence。 |
| Data                  | typed authoring、HTTP/OpenAPI、GraphQL、受限 AsyncAPI、mock/live policy、CRUD/retry/pagination/cache/optimistic lifecycle、same-execution stream recovery、React/Vue target matrix、authenticated Remote Catalog 与 D8 security matrix。                                                                                                                                         | 无 current G2 external evidence 缺口。                                 |
| Auth / Server Runtime | A0-A13/A15-A17 current-scope closure；A17 sharing/editor已有GitHub PostgreSQL/product/rootless evidence；A14 official `aws.kms/v2` exact-ARN/MRK stable-identity adapter、Environment/Terminal跨区contract、本地/PostgreSQL Gate、OIDC workflow与参考IaC；完整current-surface canary/Golden matrix。                                                                             | A14真实AWS OIDC/KMS/MRK run。                                          |
| Binary Asset          | B0-B7 exact-byte local/cloud store、full-raster PNG/JPEG、required ClamAV/YARA-X、delivery、retention、Git/LFS、runtime import/replace、Browser JPEG 与 React/Vue cross-target matrix；双引擎 rootless real Gate 已通过。                                                                                                                                                        | 无 current G2 external evidence 缺口。                                 |

Auth/Server milestone：[`g2-auth-server-runtime-milestones.md`](./g2-auth-server-runtime-milestones.md)。
Binary Asset milestone：[`g2-binary-asset-milestones.md`](./g2-binary-asset-milestones.md)。

## 明确的 post-G2 边界

以下能力不再作为 G2 Passed 的伪阻塞项：

- WebSocket/GraphQL WS、Kafka/MQTT、durable/cross-execution stream recovery；
- 第三方 Auth/managed KMS provider、更高 organization permission/role；
- 更宽 isolated source mutation profile、未来 producer-specific debugger；
- 更多 raster 格式、额外 malware vendor、durable public-CDN promotion 与 public Target SDK。

## 状态维护规则

1. 当前完成状态只在本文件更新；不要在 `AGENTS.md`、ADR 或 architecture 文档中追加“最新状态”或“覆盖上方描述”。
2. milestone 文件记录子系统阶段状态与剩余 Gate；implementation 文档记录 contract 和验证方法；evidence 文档记录具体运行证据。
3. 未取得本地或远端证据时，不把“workflow 已配置”写成“Gate 已通过”。
4. 当前 worktree 的本地 closure 不能替代未执行的 GitHub isolation、真实 daemon 或云 provider evidence。
