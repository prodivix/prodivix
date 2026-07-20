# Verification Diagnostics 编码规范（VER）

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- 日期：2026-07-20
- Global Phase：G3 Behavior & Verification Closure
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/57.verification-plan-impact-and-policy.md`
  - `specs/decisions/58.verification-evidence-provenance-and-retention.md`
  - `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md`

## 1. 范围

`VER-xxxx` 覆盖 Impact、Policy、Plan、adapter/run normalization、Evidence promotion/provenance/comparison、retention 与
Closure 的稳定失败语义。Domain 固定为 `verification`。

工具/领域内部诊断继续保留自己的 code，并通过 Plan cell/attempt correlation 关联；`VER` 不用一个“测试失败”码覆盖
所有 product finding。

## 2. 阶段与分段

```ts
type VerificationDiagnosticStage =
  | 'impact'
  | 'policy'
  | 'plan'
  | 'execute'
  | 'promote'
  | 'compare'
  | 'retain'
  | 'close';
```

| 段位       | 阶段                  | 说明                                       |
| ---------- | --------------------- | ------------------------------------------ |
| `VER-10xx` | `impact`              | semantic impact/completeness               |
| `VER-20xx` | `policy`              | rule/exemption/evidence requirement        |
| `VER-30xx` | `plan`                | cell/matrix/budget/capability              |
| `VER-40xx` | `execute`             | adapter/result/candidate                   |
| `VER-50xx` | `promote` / `compare` | Evidence/artifact/provenance/compatibility |
| `VER-60xx` | `retain` / `close`    | retention/tombstone/Closure                |
| `VER-90xx` | 任意                  | 未分类安全兜底                             |

## 3. 已占用码位

### `VER-1001` VerificationImpactSet 已失效或输入错配

- Severity: `error`
- Stage: `impact`
- Retryable: true
- Trigger: before/after revision、semantic schema、provider set 或 stored impact digest 不匹配
- User action: 重新构建 Impact 和 Plan
- Developer notes: 不在旧 Impact 上继续执行

### `VER-1002` Impact provider 不完整，已扩大验证范围

- Severity: `warning`
- Stage: `impact`
- Retryable: false
- Trigger: domain contributor 缺失、graph budget exceeded、before revision 不可用或 completeness 降级
- User action: 检查被扩大范围；若 required budget 超限，修复 provider 或调整显式 Policy
- Developer notes: 未发现影响不能等同无影响

### `VER-2001` VerificationPolicy 无效

- Severity: `error`
- Stage: `policy`
- Retryable: false
- Trigger: rule selector/kind 未知、同 specificity 冲突、matrix/budget/retry/evidence requirement 非法
- User action: 打开 Policy editor 修复标记规则
- Developer notes: 禁止按数组顺序猜冲突结果

### `VER-2002` Verification exemption 已过期或不适用

- Severity: `error`
- Stage: `policy`
- Retryable: false
- Trigger: exemption expired、revoked、scope/revision/rule 不匹配或试图降低 forbidden hard cut
- User action: 修复问题或通过正式 authoring 创建新的有界 exemption
- Developer notes: runner/CI 不得自动续期

### `VER-3001` Required Scenario 或 check 缺失

- Severity: `error`
- Stage: `plan`
- Retryable: false
- Trigger: Policy/Impact 选中的 required Scenario/check 无法发现、引用损坏或 definition invalid
- User action: 恢复 definition、修复引用或显式修改 Policy
- Developer notes: 不降级为 skipped

### `VER-3002` Required matrix cell 不受支持

- Severity: `error`
- Stage: `plan`
- Retryable: false
- Trigger: target/browser/provider/adapter/runtime control 不支持 required cell
- User action: 提供兼容 adapter/provider，或显式修改 Policy/matrix
- Developer notes: 记录 capability mismatch，不执行 fallback 私有路径

### `VER-3003` Required cell 依赖无法满足

- Severity: `error`
- Stage: `plan`
- Retryable: true
- Trigger: fixture、baseline、build、permission、artifact input 或 prerequisite missing/blocked
- User action: 修复对应 dependency 后重建/执行 Plan
- Developer notes: dependency graph 保留 blocked path

### `VER-3004` VerificationPlan 超出预算

- Severity: `error`
- Stage: `plan`
- Retryable: false
- Trigger: required cells 在去重和显式 critical subset 后仍超过 compute/time/artifact/concurrency budget
- User action: 调整 canonical Policy、拆分 scope 或创建有界 exemption
- Developer notes: 不能在 runner/UI 静默裁剪 required cell

### `VER-4001` Verification adapter 失败

- Severity: `error`
- Stage: `execute`
- Retryable: true
- Trigger: adapter preflight/prepare/execute/normalize/cleanup 失败、tool schema 未知或 exit/result 不一致
- User action: 查看 adapter/toolchain 和安全日志，修复环境或更新兼容 adapter
- Developer notes: assertion/product finding 使用其 normalized rule/code；本码描述 adapter boundary 失败

### `VER-4002` EvidenceCandidate 无效或超出预算

- Severity: `error`
- Stage: `execute`
- Retryable: false
- Trigger: candidate codec、count/depth/bytes、artifact manifest、event ordering 或 redaction report 无效
- User action: 修复 adapter 输出后重跑
- Developer notes: 无效 candidate 不能 promotion

### `VER-5001` Evidence identity 或 digest 链不匹配

- Severity: `fatal`
- Stage: `promote`
- Retryable: false
- Trigger: workspace/revision/plan/cell/attempt/tool/control/input/artifact/manifest 任一 exact identity 错配
- User action: 丢弃 staging 并从正确 Plan 创建新 attempt
- Developer notes: 视为安全边界事件；不尝试字段级修补

### `VER-5002` Evidence 中检测到 Secret 或敏感数据

- Severity: `fatal`
- Stage: `promote`
- Retryable: false
- Trigger: candidate、log、trace、network、screenshot/source/artifact 中命中 Secret/credential/禁止 PII policy
- User action: 撤销相关 credential，修复 adapter/fixture/redaction 后创建全新 attempt
- Developer notes: message/meta 不回显命中 value；整个 trusted promotion fail closed

### `VER-5003` Evidence attestation 无效

- Severity: `error`
- Stage: `promote`
- Retryable: false
- Trigger: issuer/audience/subject/nonce/expiry/signature/key/revision/plan/cell/attempt/toolchain 验证失败或 replay
- User action: 使用受控 runner/CI identity 重新运行
- Developer notes: 最多保留 imported-untrusted 安全记录，不能降级为 trusted

### `VER-5004` Evidence 或 baseline 不兼容，无法比较

- Severity: `warning`
- Stage: `compare`
- Retryable: false
- Trigger: family/target/browser/viewport/DPR/motion/font/tool/normalizer/baseline/control compatibility 不满足
- User action: 选择兼容 Evidence/baseline 或重新运行对应 cell
- Developer notes: 可允许 view-only；不能生成 pass/fail diff

### `VER-5005` Artifact promotion 或安全校验失败

- Severity: `error`
- Stage: `promote`
- Retryable: true
- Trigger: upload/digest/media/structural scan/active content/path/archive/image budget/store/atomic finalize 失败
- User action: 根据安全详情修复 artifact 或恢复存储后幂等重试
- Developer notes: 数据库/object store 不得留下可见半提交 Evidence

### `VER-6001` Evidence 已过期、撤销或受保护而无法执行 retention 操作

- Severity: `warning`
- Stage: `retain`
- Retryable: false
- Trigger: Evidence 因 TTL/trust revocation 不再满足 Closure，或 release/protection/hold 阻止删除/降级
- User action: 重新运行获得当前 Evidence，或由正确 owner 解除 protection
- Developer notes: retention worker 默认保守，不误删

### `VER-6002` VerificationClosure 不完整或已失效

- Severity: `error`
- Stage: `close`
- Retryable: false
- Trigger: required cell failed/missing/blocked/unsupported/unstable，或 revision/policy/plan/evidence freshness 已变化
- User action: 打开 Closure 查看具体 cell 和 impact path，修复后重新执行/提升 Evidence
- Developer notes: meta 只放 counts/ids/digests，不复制 findings/artifacts

### `VER-9001` 未分类的 Verification 异常

- Severity: `error`
- Stage: runtime-selected
- Retryable: false
- Trigger: 未匹配到稳定语义的内部异常
- User action: 复制 code、plan/cell/attempt/request id 和安全详情后上报
- Developer notes: 只作为兜底，应收敛为具体码位

## 4. Target 与 meta 安全

诊断 target 可指向 Impact reason、Policy rule/exemption、Plan/cell/dependency、attempt、Evidence/artifact、Closure item。
必须保留 exact revision/plan identity。`meta` 禁止 credential、OIDC assertion、artifact locator、raw tool payload、源码、
请求 header/body、cookie、PII 或 Secret；长 finding 通过受权 Evidence query 获取。
