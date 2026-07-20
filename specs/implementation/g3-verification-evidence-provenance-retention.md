# G3 VerificationEvidence、Provenance 与 Retention 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/verification`、`apps/backend` Evidence service、artifact store、`@prodivix/diagnostics`、`apps/web`
- 关联：
  - `specs/decisions/58.verification-evidence-provenance-and-retention.md`
  - `specs/decisions/63.verification-product-surface-diagnostics-and-ci.md`
  - `specs/implementation/g3-verification-plan-impact-policy.md`
  - `specs/implementation/g3-behavior-verification-closure.md`

## 目标

建立独立于 Workspace 和 Execution runtime 的 durable Verification Evidence plane。Evidence 必须证明“谁在
什么受控环境、对哪个 revision/plan/cell、用什么工具和输入、得到什么结果”，同时保持 append-only、Secret-free、
可比较、可保留、可撤销信任和可确定性用于 Closure。

## 范围

- canonical Evidence manifest、candidate、promotion、supersession 与 tombstone；
- local/remote/CI/imported provenance 和 attestation；
- artifact staging、sanitize、digest、media/budget validation 与 durable promotion；
- Backend repository/API/authorization/idempotency/retention；
- comparison compatibility、baseline reference、Closure query；
- Evidence/Compare/retention product surface 和 `VER-*` diagnostics；
- PostgreSQL/object-store/in-memory conformance 与 recovery/security Gate。

## 非目标

- 将 Execution Session/Test Report 原地标记 durable；
- 将 Evidence、artifact bytes 或 passed flag 写入 Canonical Workspace；
- 保存完整 browser profile、生产数据库快照、Secret、cookie、Authorization 或未清洗工具输出；
- 让本地未证明环境的结果默认满足 CI/release trust；
- G5 的 release approval/legal governance 和外部 production telemetry。

## 生命周期

```text
Execution result + normalized adapter output
  -> EvidenceCandidate
  -> identity/precondition validation
  -> artifact staging validation and redaction
  -> provenance/attestation verification
  -> atomic manifest + artifact promotion
  -> immutable VerificationEvidence
  -> compare / Closure consumption
  -> retention expiry or protected reference
  -> tombstone + delayed artifact collection
```

candidate、staging artifact 和 failed promotion 都不是 Evidence。promotion 必须是幂等 operation：相同
candidate identity + manifest/artifact digests 返回同一 Evidence；相同 identity 不同 payload 产生 conflict。

## Canonical Evidence manifest

公开 current model 至少包含：

```ts
interface VerificationEvidence {
  id: VerificationEvidenceId;
  workspaceId: WorkspaceId;
  workspaceRevision: WorkspaceRevision;
  scenarioRevision?: WorkspaceDocumentRevision;
  policyRevision: WorkspaceDocumentRevision;
  impactDigest: Digest;
  planDigest: Digest;
  cellId: VerificationCellId;
  attemptId: VerificationAttemptId;
  result: VerificationNormalizedResult;
  provenance: VerificationProvenance;
  toolchain: VerificationToolchainIdentity;
  controls: VerificationControlIdentity;
  inputs: VerificationInputIdentity;
  artifacts: readonly VerificationArtifactManifest[];
  sourceTraceDigest: Digest;
  createdAt: Instant;
  retention: VerificationRetentionClass;
  supersedes?: VerificationEvidenceId;
  manifestDigest: Digest;
}
```

`result` 保留 passed/failed/blocked/unstable、normalized assertions/findings/metrics、failure classification、event
summary 和 bounded diagnostic refs。它不保存工具私有 object 或任意 stdout。

identity chain 必须覆盖：

- Workspace/Scenario/Policy/Impact/Plan/Cell/Attempt；
- Program、fixture、baseline、control profile、target/browser/runtime；
- adapter/tool/compiler/provider/sandbox image；
- artifact manifest 与 SourceTrace；
- provenance issuer、subject、issued/expiry、attestation digest。

## EvidenceCandidate

candidate 由 adapter normalization boundary 创建：

- candidate id 与 attempt id；
- canonical normalized result；
- staged artifact refs + expected digest/size/media/classification；
- bounded replay/source trace manifests；
- claimed provenance/attestation；
- redaction report 和 dropped-field counters；
- promotion deadline/idempotency key。

candidate codec 对未知字段/kind、重复 artifact path、path traversal、oversize count/depth/string、NaN/Infinity、
non-normalized Unicode、时间逆序和 digest mismatch fail closed。

## Artifact promotion

Artifact class 初始包括：`screenshot`、`visual-diff`、`accessibility-report`、`trace`、`network-summary`、
`console-summary`、`coverage-summary`、`performance-profile`、`security-report`、`build-log`、`replay-record`。

promotion 步骤：

1. 从 attempt-scoped staging capability 读取，禁止 runner 提交任意 object-store key；
2. 流式计算 digest、size、media sniffing 和 class-specific structural validation；
3. 执行 Secret/PII/redaction scanner，active content 默认拒绝或转为安全派生物；
4. 规范化可确定内容，保留 raw digest 与 normalized digest；
5. 验证 artifact 与 manifest/attempt/source trace correlation；
6. 以 content-addressed key 写入 durable store；
7. 在数据库事务中创建 artifact reference、Evidence manifest 和审计事件；
8. 事务成功后删除 staging；失败可幂等重试，过期 staging 由回收任务清理。

HTML、SVG、JS、source map、archive、HAR、video 等高风险类型默认 attachment-only 或 unsupported；不得以内联
active content 在 Web 打开。图像解码、archive entry、压缩比、尺寸、像素、总字节和 artifact count 均有上限。

## Provenance 与 trust

初始 trust class：

| Trust                | 必要证明                                                                                    | 默认用途                               |
| -------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------- |
| `local-unattested`   | local app identity、exact plan/cell/attempt correlation                                     | 即时反馈、debug，不满足默认 CI closure |
| `remote-attested`    | Control Plane/worker identity、sandbox image、attempt grant、signed manifest                | 受控 remote closure，按 Policy 接受    |
| `ci-attested`        | CI OIDC/job identity、repository/ref/commit、plan digest、runner/toolchain、signed manifest | 默认 change/CI closure                 |
| `imported-untrusted` | importer identity、source digest、format decoder                                            | 只读参考，默认不能满足 required cell   |

attestation verifier 是 provider-neutral port；GitHub/AWS 等 provider adapter 只解析和验证外部声明，再输出
canonical verified claims。raw token、OIDC assertion、credential 不进入 Evidence。

验证要求：

- issuer/audience/subject/expiry/not-before 与 nonce；
- workspace/project/repository/ref/revision/plan/cell/attempt exact match；
- worker/provider/toolchain/image identity allowlist；
- manifest/artifact digest chain；
- replay protection 和一次性 promotion grant；
- key rotation/revocation metadata。

无法在线验证时可进入 `verification-pending` staging，但不得先创建 trusted Evidence。验证结果和 verifier version
进入 provenance；后续 trust revocation 通过独立 revocation record 影响 Closure，不改写历史 manifest。

## Storage model

Backend 至少需要逻辑表/集合：

- `verification_evidence`：immutable manifest、identity columns、digest、result summary、retention；
- `verification_artifacts`：content digest、media/size/class、store locator、scan state；
- `verification_evidence_artifacts`：Evidence→artifact reference；
- `verification_promotions`：idempotency key、candidate digest、state、attempt、error；
- `verification_attestations`：verified claims/digest/verifier/key metadata；
- `verification_supersessions`：old/new Evidence relation 和 reason；
- `verification_trust_revocations`：issuer/key/evidence scope；
- `verification_retention_protections`：change/release/legal-hold external reference；
- `verification_tombstones`：logical deletion/audit；
- `verification_audit_events`：append-only authorized operations。

数据库仅保存 object-store locator，不把大 artifact 塞进 row。locator 是内部 reference；客户端通过短期、只读、
Evidence-bound capability 获取安全派生物或 attachment。

唯一性和 CAS：

- `(workspace_id, plan_digest, cell_id, attempt_id)` 唯一；
- `promotion_idempotency_key` 唯一并绑定 candidate digest；
- supersedes 必须同 workspace/check semantic lineage，不能跨项目；
- retention/tombstone 使用 expected state/version；
- artifact refcount/lease 与 manifest transaction 一致，避免 orphan/early delete。

## Backend API

建议 provider-neutral endpoints（具体 route 可按 backend convention 调整）：

- `POST /workspaces/:id/verification/promotions`：创建/幂等恢复 promotion；
- `PUT /.../promotions/:promotionId/artifacts/:artifactId`：使用 staging capability 上传/确认；
- `POST /.../promotions/:promotionId/finalize`：验证并原子提升；
- `GET /workspaces/:id/verification/evidence`：按 revision/plan/cell/trust/result 分页查询；
- `GET /.../evidence/:evidenceId`：manifest + safe artifact descriptors；
- `POST /.../evidence/:evidenceId/compare`：服务端 compatibility preflight/compare descriptor；
- `POST /.../evidence/:evidenceId/supersede`：显式 relation，不删除旧 Evidence；
- `POST /.../evidence/:evidenceId/retention`：受权限约束调整/保护；
- `DELETE /.../evidence/:evidenceId`：只创建 tombstone，受 protection/hold 阻止；
- `GET /workspaces/:id/verification/closure`：以 revision/policy/plan 查询可重算 Closure。

mutation 需要 authenticated principal、workspace permission、CSRF/origin/intent、idempotency key、bounded body、
expected revision/state。runner 只获得 attempt-bound finalize capability，不能查询任意 Evidence 或改变 retention。

## Comparison compatibility

比较前必须验证 family、scenario/check semantic identity、target/browser category、viewport/DPR/color/motion/font、
tool/adapter schema、baseline digest、normalization version 和 relevant control profile。

- exact-compatible：可形成 pass/fail diff；
- policy-compatible：Policy 明确允许受控版本范围/target-specific baseline；
- view-only：可并排查看，但不能用于 Closure；
- incompatible：拒绝计算误导性 verdict，并给出 mismatch fields。

React/Vue 默认使用各 target 自己的 visual baseline；跨 target 比较 semantic/a11y/behavior result，不要求 pixel
identity。baseline 更新是 Workspace Transaction；Evidence 只可提出 candidate/diff，不能修改 baseline。

## Retention 与删除

Retention class：

- `session`：短期 debug/local，默认短 TTL；
- `change`：至少覆盖 revision/change closure 与审计窗口；
- `release`：被 release/review ref 保护，外部 owner 解除后才能降级；
- `legal-hold`：只保留 contract extension，G3 默认不可创建/解除。

retention worker：

1. 选择 expired 且未 protection/hold 的 Evidence；
2. CAS 创建 tombstone 和审计事件；
3. 从 Closure query 排除；
4. 延迟 grace period 后减少 artifact refcount；
5. 无其他引用/lease 时删除 object；
6. worker crash/retry 幂等，永不删除仍被引用内容。

删除后的 tombstone 保留 manifest digest、identity、reason、actor/time，不保留敏感 artifact locator。Closure 因证据
过期/删除变为 stale/incomplete，而不是继续使用缓存 passed。

## Secret 与隐私 hard cut

- candidate 和 artifact scanner 结合 exact secret canary、known credential pattern、header/cookie/env key、entropy 和
  domain-specific structured redaction；
- scanner 自身不能把匹配 value 写进 diagnostic，只报告 class/path/count/digest-safe fingerprint；
- network 只保存 sanitized method/host/path template/status/timing/operation correlation，默认无 query/body/header；
- console/trace source snapshot 只保存 SourceTrace ref 与 bounded safe excerpt，原源码通过 Workspace authority 读取；
- screenshot 对标记 sensitive surface 提供阻止/遮罩 policy；遮罩定义由 semantic target，而非像素坐标持久化；
- 任何 Secret canary 命中使整个 promotion fail closed，不能仅丢弃一个 artifact 后把 result 标 trusted。

## 产品表面

Evidence surface 提供 revision/plan/cell timeline、attempt history、trust/retention、manifest identity、artifact viewer、
compare 和 SourceTrace。失败和成功 attempt 并列保留；默认突出当前 Closure 相关 Evidence，但允许审计历史。

状态用 passed/failed/blocked/unstable/stale/trust icon 和 accessible label；低价值元数据放在 inspector，不把长 digest、
provider 名、工具命令堆在主列表。危险 artifact 只下载，不内联；删除/retention/supersede 有明确权限和确认。

## 实施阶段

### E0：Manifest、codec 与 in-memory conformance

- current model、candidate、artifact、provenance、retention、tombstone；
- canonical serialization/digest/strict decoder；
- in-memory repository、promotion state machine、Closure query port。

完成条件：codec/property/idempotency/conflict/attempt history 通过。

### E1：Backend/PostgreSQL 与 artifact store

- schema/repository/API/authorization；
- staging capability、stream validate、content-addressed store、atomic finalize；
- crash/retry/orphan recovery。

完成条件：双 backend replica 并发 finalize 只有一个 Evidence；数据库/object store 故障不产生半提交。

### E2：Attestation 与 trust

- remote/CI canonical claims 与 verifier SPI；
- key rotation/revocation/replay/expiry；
- local/import hard cut。

完成条件：伪造、错 audience、错 revision/attempt/digest、expired/replayed proof 全部拒绝。

### E3：Comparison、retention 与 product

- compatibility evaluator、safe artifact viewers、compare；
- retention worker/protection/tombstone；
- Evidence/Closure UI、Issues/SourceTrace。

完成条件：过期/删除/revoked 立即影响重算 Closure；受保护 artifact 不被 GC。

### E4：Security/recovery Golden

- Secret/PII/active artifact/bomb/path traversal canary；
- upload interruption、Backend restart、duplicate finalize、store outage；
- local/remote/CI trust matrix 与 revision drift。

完成条件：安全 Gate、PostgreSQL Gate 和 CI-attested Golden 均有真实证据。

## 验证证据

计划 Gate：`pnpm run verify:g3:evidence`。

必须覆盖：

- canonical digest 跨进程、strict codec、oversize/fuzz；
- promotion idempotency/conflict/crash/retry/concurrent replicas；
- artifact digest/media/path/active-content/archive/image budget；
- Secret/Authorization/cookie/PII/source canary；
- attestation issuer/audience/nonce/replay/expiry/revision/plan/cell/attempt/toolchain；
- local/imported trust 不能满足默认 required Closure；
- comparison exact/policy/view-only/incompatible；
- supersession 保留失败 history；
- retention protection/expiry/tombstone/refcount/lease/GC worker recovery；
- UI artifact isolation、download headers、authorization 与 SourceTrace navigation。

## 风险与停止条件

- 无法验证 candidate identity chain 或 attestation 时停止 promotion，保留安全诊断和 staging TTL。
- scanner/structural validator 不能处理某 artifact 类型时，该类型 unsupported，不以通用 binary 放行。
- 无法原子协调数据库 manifest 与 artifact reference 时，不创建 Evidence；先修复 promotion protocol。
- retention owner/外部 protection 状态不清楚时停止删除，宁可延迟 GC。
- comparison control/tool/baseline 不兼容时只允许 view-only，不产生 pass/fail。
- 任何 Secret canary 命中都阻止 trusted Evidence，并检查同 attempt 的所有 artifact/log。

## 验收标准

- [ ] Evidence 与 Workspace/Execution 明确隔离，append-only 且 identity/provenance 完整。
- [ ] promotion 对并发、重试、数据库/object-store 故障幂等且无半提交。
- [ ] 所有 artifact 经 bounded validation/redaction，Secret 和 active content fail closed。
- [ ] trust、attestation、revocation、freshness 和 compatibility 真实参与 Closure。
- [ ] retention/tombstone/GC 保留审计且不误删受保护或共享 artifact。
- [ ] 失败、retry、unstable history 不被后续成功覆盖。
