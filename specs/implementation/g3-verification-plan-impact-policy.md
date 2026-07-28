# G3 Verification Impact、Policy 与 Plan 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：G3 In Progress / V4 Ready
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/verification`、`@prodivix/authoring`、`@prodivix/workspace`、`apps/web`
- 关联：
  - `specs/decisions/57.verification-plan-impact-and-policy.md`
  - `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md`
  - `specs/implementation/g3-behavior-verification-closure.md`

## 目标

把“应该验证什么”从页面按钮、CI YAML、文件 glob 和人工经验中抽离，建立 revision-bound、可解释、
确定性的 Impact → Policy → Plan contract。相同 Workspace revision、before revision、Policy、Scenario registry、
provider/capability snapshot、显式 `policyEvaluationInstant` 和 planner 版本必须得到 byte-identical
`VerificationPlan` 与 plan digest。

## 范围

- `VerificationImpactSet` semantic change model 与 conservative fallback；
- `verification-policy` Workspace document 与 authoring Command；
- required/advisory/forbidden rule、matrix selector、budget、retry、exemption；
- Scenario/check discovery 与 `VerificationPlan` DAG；
- unsupported、blocked、not-applicable、missing 的严格语义，并明确不设 `skipped`；
- Closure input requirement 与 UI explainability；
- property/conformance/Golden plan evidence。

## 非目标

- 用 CI YAML、package scripts 或测试工具 config 作为 canonical Policy；
- 根据 UI 当前页面、最近失败或用户点击动态改变 required plan；
- 自动创建 exemption、自动缩小矩阵或把缺失 provider 当作可忽略项；
- G4 的 AI 测试生成/修复，G5 的 review approval/deploy decision；
- 把所有 revision 永远展开为所有 browser/target/check 的无界笛卡尔积。

## VerificationImpactSet

ImpactSet 是 before/after revision 的可重建 projection：

```ts
interface VerificationImpactSet {
  beforeRevision?: WorkspaceRevision;
  afterRevision: WorkspaceRevision;
  semanticSchemaDigest: Digest;
  providerSetDigest: Digest;
  changedDocuments: readonly ImpactedDocument[];
  changedSymbols: readonly ImpactedSymbol[];
  affectedScenarios: readonly ImpactedScenario[];
  affectedCapabilities: readonly CapabilityImpact[];
  targetImpacts: readonly TargetImpact[];
  completeness: 'complete' | 'conservative' | 'unknown';
  reasons: readonly ImpactReason[];
  digest: Digest;
}
```

输入来源按优先级合并：

1. Workspace exact semantic diff；
2. typed reference graph 的 direct/transitive consumer；
3. CodeSlot/Symbol impact 与 compiler dependency；
4. Route/Data/NodeGraph/Animation/Auth/Asset domain contribution；
5. target/compiler/runtime capability change；
6. schema/provider/planner change；
7. 无法证明完整时的 conservative scope expansion。

Impact 不按路径字符串猜测。文件或 document changed 只是 reason；选择 Scenario/check 依赖 stable document/symbol/
capability reference。若 before revision 不可用、provider contribution 丢失、schema drift 或 graph budget exceeded，
`completeness` 必须降级，planner 按 Policy 扩大到 project/global required scope。

## VerificationPolicy current model

Policy 是 `verification-policy` Workspace document。至少包含：

```ts
interface VerificationPolicy {
  id: VerificationPolicyId;
  name: string;
  defaultRequirement: 'required' | 'advisory' | 'forbidden';
  rules: readonly VerificationPolicyRule[];
  matrixProfiles: readonly VerificationMatrixProfile[];
  budgets: VerificationPlanBudgets;
  retryPolicies: readonly VerificationRetryPolicy[];
  exemptions: readonly VerificationExemption[];
  evidenceRequirements: VerificationEvidenceRequirements;
}
```

Rule predicate 只能使用 canonical metadata：impact kind、document/capability/tag/owner、Scenario tag、check family、
surface、target、browser、risk class 和 trust requirement。禁止任意 JavaScript predicate、用户身份隐式分支或
读取 runtime result 后回改 requirement。

Rule evaluation 输出：

- matched rule ids 和优先级；
- `required` / `advisory` / `forbidden`；
- matrix profile；
- evidence freshness/trust/comparison requirement；
- retry policy；
- budget cost 与解释。

冲突规则按明确 precedence 解析：`forbidden` 安全 hard cut 优先；更具体 selector 优先于默认；同 specificity 的
矛盾 required/advisory 是 Policy invalid，不能靠数组顺序解决。

## Workspace Command

namespace/domain：`core.verification`。初始 Command：

- `core.verification.create-policy`
- `core.verification.rename-policy`
- `core.verification.add-rule`
- `core.verification.update-rule`
- `core.verification.move-rule`
- `core.verification.remove-rule`
- `core.verification.set-matrix-profile`
- `core.verification.set-budgets`
- `core.verification.set-retry-policy`
- `core.verification.add-exemption`
- `core.verification.revoke-exemption`
- `core.verification.replace-policy`

Exemption 是显式、可审计的 authoring decision，必须包含 stable id、scope、reason、creator、createdAt、expiresAt、
允许降低的 requirement 和关联 issue/ref。过期 exemption 不能应用；修改 scope 或 expiry 创建新 revision。G3
不实现组织审批流，但保留 approval metadata extension point，默认不能由 runner/CI 自动新增。

## Check 与 matrix model

一个 canonical check definition 包含：

- stable check id、family、owner、input scope；
- Scenario 或 source target reference；
- supported surface/target/browser/runtime/capability constraints；
- determinism、isolation、fixture、artifact 和 evidence requirements；
- estimated cost、timeout/retry eligibility；
- adapter kind/version range；
- SourceTrace contribution。

初始 family：`diagnostics`、`build`、`unit`、`integration`、`e2e`(即 Behavior E2E;拼写以 ADR 57 的 VerificationCheckKind 为准)、`visual`、`accessibility`、
`performance`、`security`。

**一个 cell 就是一个 check。** cell 的字段形状由 ADR 57「Plan DAG 与 matrix cell」冻结，本节不重述；
它同时是 Evidence 唯一键、Closure required 判定单位和 matrix UI 的一格，不存在多 check 容器或并列分组构造。

matrix 轴（surface、target、browser engine、viewport、color scheme、motion、locale）是 cell 上的具名字段；
control profile 文档拥有其余确定性控制。两者不重叠，因此没有 `controlsDigest` 这类既进 digest 又与具名字段
重复的摘要。

cell identity 不包含 attempt；retry/replay 创建同一 cell 下的新 attempt。若某维度不适用，使用 canonical `none`
或不纳入该 family 的 identity，不能由 adapter 自行省略并产生不同 digest。

## VerificationPlan DAG

Plan 包含：

- exact Workspace、Scenario、Policy、Impact、semantic/provider/compiler/planner digests 与 `policyEvaluationInstant`；
- deterministic ordered cells；
- dependency DAG（build/materialize → seed → run → compare → promote）；
- per-cell requirement、timeout、retry、trust、retention 和 artifacts；
- shared resource/lane/barrier；
- budget decision 与 expansion reasons；
- blocked/unsupported preflight cells；
- canonical plan digest。

规划算法：

1. 验证所有输入 identity、codec 与显式 policy evaluation instant；
2. 从 ImpactSet 发现 candidate Scenario/check；
3. 求值 Policy，保留解释 trace；
4. 展开 matrix profile，并按 adapter capability 预检；
5. 去重共享 build/fixture/baseline dependency；
6. 计算 bounded cost 并应用 deterministic budget rule；
7. 构建 DAG、检查 cycle/resource conflict；
8. canonical sort/serialize/digest。

Plan 生成不分配 worker、不读取 ambient clock/current queue、不生成时间戳或随机 id。planning service 从可信 clock
取得一次 `policyEvaluationInstant` 并将其作为显式输入；执行系统可以调度 DAG，但不得改变 cell requirement 或 identity。

## Matrix budget

预算至少限制 total cells、per-family cells、target/browser expansion、estimated compute、artifact bytes、wall-clock
和 concurrency。超预算处理：

1. 先共享/去重前置 dependency；
2. 按 Policy 中显式声明的 equivalence/critical subset 选择，而不是 runtime 随机抽样；
3. advisory cells 可按稳定优先级裁剪，并记录未计划 reason；
4. required cells 仍超预算则 Plan 为 blocked，要求修改 Policy、scope 或显式 exemption；
5. 绝不静默删除 required browser/target/check。

## Cell status semantics

状态词汇表的唯一定义在 ADR 57「状态 taxonomy」；本节只说明每个 `VerificationCellStatus` 值的推导来源，
不重述枚举，也不新增值。

| 状态                   | 推导来源                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `pending`              | 已规划、尚无 attempt                                                                 |
| `running`              | 当前 attempt 执行中                                                                  |
| `passed`               | 存在可接受 Evidence，且通过 trust/freshness/compatibility                            |
| `failed`               | latest/required attempt 的 outcome 为 `failed`                                       |
| `blocked`              | attempt outcome 为 `blocked`：contract/permission/budget/fixture/dependency 阻止执行 |
| `cancelled`            | attempt outcome 为 `cancelled`                                                       |
| `infrastructure-error` | attempt outcome 为 `infrastructure-error` 且已耗尽 retry                             |
| `unsupported`          | adapter registry snapshot 宣告不支持该 cell 的 required capability                   |
| `not-applicable`       | semantic predicate 证明不适用，因而不形成 required cell                              |
| `unstable`             | 同输入下多个 attempt 的 outcome 不一致                                               |
| `stale`                | Evidence 存在但绑定的 revision/plan/baseline 已改变                                  |
| `incompatible`         | Evidence 存在但 baseline/toolchain compatibility key 不匹配                          |
| `missing`              | required cell 完全没有 Evidence                                                      |

只有 `passed` 满足 required Closure；其余值一律不满足，Closure evaluator 必须穷举而不设默认分支。

**没有 `skipped`。** adapter 未安装、browser 缺失、baseline 不兼容、runner 无 deterministic control 都各有
对应状态（`unsupported` / `incompatible`），不得折叠为一个「允许不跑」的口子；Policy 明确允许不跑的情形是
exemption，记录在 Evidence 的 applied exemption 中，不是 cell 状态。

## Retry 与 flaky semantics

- retry policy 是 Policy 输入，不由 adapter 或 CI 临时决定；
- 每次 retry 是新 attempt，保留所有结果和 order；
- 只有明确 classified transient infrastructure failure 可以按策略重试而不改变 semantic verdict；
- assertion/visual/a11y/security failure 的后续通过不会删除失败，cell 可标 `unstable` 或按 policy 判定 failed；
- retry 不能改变 fixture、control、tool、target 或 baseline digest，否则是新 cell/Plan；
- max attempts、backoff 和 wall budget 都必须 bounded。

## Closure contract

Closure 输入是 revision + Policy + immutable Plan + current acceptable Evidence set + evaluation time/retention view。
输出至少包含：

- verdict：`VerificationClosureVerdict`(`satisfied` / `unsatisfied` / `stale`,唯一定义见 ADR 57「状态 taxonomy」;本文不重述取值);
- satisfied/failed/missing/blocked/unstable required cells；
- advisory summary；
- applied exemptions 和即将过期项；
- evidence trust/freshness/compatibility summary；
- deterministic closure digest 和 explanation graph。

Closure 是 projection，不写回 Workspace，也不代表 deployment/release approval。新 revision、Policy revision、Plan
digest、Evidence revocation/expiry 或 adapter compatibility change 都使旧 Closure 不再适用于当前输入。

## 产品表面

Verification 的 Impact/Plan 视图必须显示：

- “为什么被选中”：change → reference/capability → Scenario/check → Policy rule；
- required/advisory/blocked 的紧凑 icon 状态及可访问 tooltip；
- surface/target/browser matrix，可按 family/owner/impact 折叠；
- budget 使用、被裁剪 advisory、required over-budget；
- Policy editor 的 rule conflict、exemption expiry 和预览 diff；
- 从 cell 导航 Scenario/SourceTrace，不能只显示工具 command 或 CI job 名。

UI 只能请求 planner 生成/刷新 Plan，不得在客户端过滤 required cell 后创建“本地计划”。

## 实施阶段

### P0：Impact model 与 contributor SPI

- 定义 semantic diff/current model、domain contributor、completeness；
- 接入 Workspace、PIR/Route/Data/CodeSlot，后续接 NodeGraph/Animation/Auth；
- 建立 conservative fallback/property tests。

完成条件：删除/重命名/迁移/target change/provider drift 均能产生可解释 impact；缺 contributor 扩大 scope。

### P1：Policy document 与 evaluator

- Workspace document/Command/undo/codec；
- selector、precedence、conflict、matrix profile、budget、retry、exemption；
- Policy authoring/preview diagnostic。

完成条件：同输入和 policy evaluation instant 的规则求值稳定；冲突、过期、未知 selector fail closed。

### P2：Planner 与 DAG

- check discovery、matrix expansion、capability preflight；
- resource dependency、canonical ordering、digest；
- blocked/unsupported/not-applicable/missing semantics。

完成条件：跨进程/OS canonical fixture 得到相同 plan bytes；required cell 永不静默消失。

### P3：Closure evaluator 与产品集成

- Evidence requirement evaluation、freshness/trust/compatibility；
- Impact/Plan/Closure UI 与 Issues navigation；
- CLI plan/explain JSON。

完成条件：Web/CLI/CI 对同一输入得到相同 Plan 和 Closure；explanation graph 可审计。

## 验证证据

计划 Gate：`pnpm run verify:g3:verification-plan`。

必须覆盖：

- semantic diff direct/transitive/cycle/budget/missing-before/provider drift；
- Policy precedence/conflict/unknown/forbidden/expiry/exemption scope；
- matrix expansion、critical subset、required over-budget、advisory trimming；
- DAG cycle、shared dependency、canonical sort/digest 跨进程稳定；
- unsupported vs blocked vs not-applicable vs missing；
- retry infrastructure/assertion/unstable/max-attempt；
- Closure stale/expired/revoked/incompatible/missing evidence；
- UI/CLI/CI contract conformance 与 SourceTrace explain journey。

## 风险与停止条件

- Impact contributor 不完整时停止精确缩小，切换 conservative plan；不得假定“未发现即未影响”。
- Policy rule 需要任意代码或运行结果才能求值时，拒绝该 rule kind。
- required matrix 超预算时停止执行并要求 authoring decision；不能在 runner 端裁剪。
- planner 输出受 ambient current time、queue 或随机数影响时，停止 promotion，先恢复显式输入确定性。
- adapter capability snapshot 与执行时不一致时，该 cell blocked 并要求重建 Plan。

## 验收标准

- [ ] ImpactSet 对 exact revision 可重建、可解释，并在不完整时保守扩大。
- [ ] Policy 仅由 Workspace Command 修改，规则、预算、retry 和 exemption 有稳定语义。
- [ ] Plan 对完整输入 byte-stable，required matrix 不被 UI/CI/adapter 隐式改变。
- [ ] blocked/unsupported/not-applicable/missing/unstable 不混用，且不产生 `skipped`。
- [ ] Closure 只接受满足 trust、freshness、compatibility 的 Evidence，并可确定性重算。
