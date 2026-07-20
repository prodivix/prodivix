# G3 Behavior & Verification Closure milestones

> 本文件是 G3 阶段状态的唯一里程碑来源。Global Phase 退出条件见
> [`global-phases.md`](global-phases.md)，总实施编排见
> [`../implementation/g3-behavior-verification-closure.md`](../implementation/g3-behavior-verification-closure.md)，
> ADR 索引见 [`../decisions/README.md`](../decisions/README.md)，退出证据结构见
> [`g3-closure-evidence.md`](g3-closure-evidence.md)。

## 当前判断

G3 的 ADR 56-63 与实施计划已冻结 contract 和预期 Gate，但实现尚未开始；Global G3 Product Gate 被 G2 Exit Gate
阻塞。本文中的命令和 Evidence 项是后续实施必须建立的验收入口，不代表当前已存在或已通过。

| Milestone                  | 状态        | 目标闭环                                                                                        | 退出证据                                                   |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| V0 Owner/contract hard cut | Not Started | `@prodivix/behavior`、`@prodivix/verification`、Workspace document/Command、BHV/VER diagnostics | boundary、codec、Command、migration conformance            |
| V1 Scenario authoring      | Not Started | semantic target、typed action/observation、recorder draft、`BehaviorScenarioProgram`            | authoring/recorder/compiler/target relocation Gate         |
| V2 Cross-domain behavior   | Not Started | Route/PIR/Data/Auth/NodeGraph/Animation composition 与 SourceTrace                              | invoked Catalog behavior parity                            |
| V3 Deterministic replay    | Not Started | clock/random/scheduler/network/storage/render controls、ReplayRecord/debugger                   | repeat/divergence/isolation/provider conformance           |
| V4 Impact/Policy/Plan      | Not Started | semantic ImpactSet、canonical Policy、deterministic DAG/matrix/budget                           | byte-stable plan、required hard-cut、explain Gate          |
| V5 Evidence plane          | Not Started | promotion、artifact、provenance/trust、retention、Closure                                       | PostgreSQL/object store/security/attestation/recovery Gate |
| V6 Adapter matrix          | Not Started | functional/visual/a11y/performance/security across surface/target/browser                       | adapter conformance 与 controlled matrix                   |
| V7 Product/CLI/CI          | Not Started | Scenarios/Verification/Issues/Execution/SourceTrace、CLI/CI attestation                         | product a11y/recovery 与 Web/CLI/CI digest parity          |
| V8 G3 Golden closure       | Not Started | Authenticated Catalog full behavior and evidence closure                                        | all required cells current/compatible/trusted/passed       |

## V0：Owner 与 contract hard cut

### 必须完成

- [ ] 新建 `@prodivix/behavior`，只拥有 Scenario/Program/recorder semantic。
- [ ] 新建 `@prodivix/verification`，只拥有 Impact/Policy/Plan/adapter SPI/Evidence/Closure contract。
- [ ] 新建 `behavior-scenario`、`verification-policy` Workspace document 与 `core.behavior`、
      `core.verification` Command namespace。
- [ ] current/wire/codec/migration、Backend/Workspace validation conformance。
- [ ] `behavior`/`verification` diagnostic domain、target 和 `BHV-*`/`VER-*` registry。
- [ ] package ownership/dependency/boundary Gate，`apps/web` 无 duplicate domain type。

### 停止条件

G2 exact snapshot、ExportProgram、SourceTrace、Browser/Remote provider 或 controlled Vue target 未稳定前，不进入
V2/V6/V8 产品 closure；V0 contract 可继续，但不得用 mock application shell 宣称 G3 vertical。

## V1：Scenario authoring

### 必须完成

- [ ] manual/Route/PIR/Data trigger/action/observation first set。
- [ ] stable semantic target exact/relocated/ambiguous/missing/incompatible。
- [ ] Scenario CRUD/step editor/target picker/impact preview/undo/redo。
- [ ] bounded Secret-free recorder draft、review、atomic adoption。
- [ ] deterministic `BehaviorScenarioProgram`、capability manifest、SourceTrace 和 digest。
- [ ] React/Vite 与 Vue/Vite semantic target conformance。

### Golden slice

登录 fixture → Catalog route → semantic add-item form → Data mutation → visible result，不保存 CSS/XPath、DOM handle 或
framework component identity。

## V2：Cross-domain behavior

### NodeGraph

- [ ] typed port/edge、descriptor、planner 和旧 edge migration。
- [ ] pure/state/Data/Route/Animation/CodeSlot nodes。
- [ ] async/error/retry/cancel/parallel/subgraph 与 temporary state transaction。
- [ ] debugger lease、step/call stack/value projection/SourceTrace。
- [ ] Preview/Export/CI invoked graph semantic parity。

### Animation/Route

- [ ] typed play/pause/resume/seek/cancel 与 marker observation。
- [ ] sequence/parallel/stagger/nested composition 和 conflict arbitration。
- [ ] Route exit/commit/materialize/enter、replacement/back/forward/deep link。
- [ ] decorative/spatial/essential/continuous reduced-motion variant。
- [ ] visual/a11y stable observation 与 React/Vue target conformance。

### Golden slice

Catalog optimistic mutation 触发 graph 派生状态；Route detail transition 包含 full/reduced animation；mutation conflict 经
typed retry/rollback 后回到稳定、可访问状态。

## V3：Deterministic replay

### 必须完成

- [ ] explicit control profile/capability preflight/digest。
- [ ] logical clock、scoped random/id、scheduler lane/barrier/deadline。
- [ ] fixture-only network、fault profile、unmatched/live egress denial。
- [ ] fresh storage/auth/service-worker/session isolation 与 residual canary。
- [ ] viewport/DPR/color/locale/timezone/font/full-reduced render controls。
- [ ] typed condition wait/settle，无固定 sleep。
- [ ] bounded ReplayRecord、first divergence、fresh replay debugger。

### Golden slice

相同 Catalog conflict/retry Scenario 连续运行至少三次并在 Browser、Remote 与 CI-controlled environment 中产生相同
semantic sequence；注入 random/schedule/network drift 必须准确失败。

## V4：Impact、Policy 与 Plan

### 必须完成

- [ ] before/after semantic ImpactSet 和 domain contributors。
- [ ] incomplete/unknown impact conservative expansion。
- [ ] Policy rule precedence、required/advisory/forbidden、matrix profile、budget、retry、exemption。
- [ ] deterministic check discovery、matrix expansion、DAG/resource dependency、plan digest。
- [ ] blocked/unsupported/skipped/not-applicable/unstable 严格语义。
- [ ] Impact/Plan explain UI 与 CLI JSON parity。

### Golden slice

分别修改 Catalog PIR、Data operation、Route guard、NodeGraph、Animation 和 shared CodeSlot；每次 Plan 必须选择正确的
Scenario/check，并显示完整影响路径。删除 Semantic provider 时 Plan 保守扩大或 blocked，不能漏测。

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

- [ ] G2 Exit Gate 已 Passed。
- [ ] V0-V7 所有 required milestone 已 Implemented 并有可重复 Gate。
- [ ] Golden Plan digest 固定且所有 required cell current、compatible、trusted、passed。
- [ ] 失败/blocked/unstable/过期/revoked negative Golden 正确阻止 Closure。
- [ ] Preview、Export、CI 使用同一 Scenario；无 editor-private state 或 framework-private canonical fork。
- [ ] 无 production Secret/live production data；artifacts/diagnostics/ReplayRecord Secret canary clean。
- [ ] evidence manifest、CI run link/digest、target/browser/motion matrix 和复现命令写入 G3 closure evidence 文档。

## 计划 Gate 入口

这些入口在实现时建立；当前均不得标记 Passed：

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
