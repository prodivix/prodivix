# Plugin Host 生命周期与权限协议

## 状态

- Phase 2 contract + Phase 4.0 runtime artifact/shutdown extension implemented
- 日期：2026-07-10
- 上位决策：`specs/decisions/29.plugin-extension-points.md`
- 相关协议：`specs/implementation/plugin-host-contribution-registry.md`

## 1. 目的

本文冻结 `@prodivix/plugin-host` 的状态、identity、package source、Capability policy、runtime adapter、并发和 audit 边界。

Contribution contract、registry 和 transaction 的详细规则由 `plugin-host-contribution-registry.md` 定义。

当前实现位于 `packages/plugin-host/src/lifecycle/`、`packages/plugin-host/src/runtime/` 与 `packages/plugin-host/src/audit/`，公开入口由 `packages/plugin-host/src/index.ts` 导出。Browser sandbox transport 与具体 Host Gateway 由 `specs/implementation/plugin-browser-sandbox-phase4.md` 继续规划。

## 2. 双轴状态模型

### 2.1 Availability state

```ts
type PluginAvailabilityState =
  'discovered' | 'validating' | 'blocked' | 'ready' | 'disabled' | 'failed';
```

| 状态         | 含义                                                                  |
| ------------ | --------------------------------------------------------------------- |
| `discovered` | 已取得 package source，但尚未完成 Host 验证                           |
| `validating` | 正在校验 package attestation、Manifest、权限和静态 descriptor         |
| `blocked`    | 输入有效，但 required capability 被拒绝或宿主策略禁止                 |
| `ready`      | 已启用、授权满足、静态 contribution 已原子提交                        |
| `disabled`   | 安装仍存在，但所有 runtime 与 contribution lease 已清理               |
| `failed`     | 验证、descriptor prepare、registry commit 或必要 cleanup 出现操作故障 |

`blocked` 是正常策略结果，不使用 `failed` 表示权限拒绝。

### 2.2 Runtime state

```ts
type PluginRuntimeState =
  | 'not-applicable'
  | 'inactive'
  | 'activating'
  | 'active'
  | 'deactivating'
  | 'failed';
```

| 状态             | 含义                                                     |
| ---------------- | -------------------------------------------------------- |
| `not-applicable` | 插件没有 runtime entrypoint                              |
| `inactive`       | runtime 可用但尚未启动，静态 contribution 可以已经存在   |
| `activating`     | runtime adapter 正在建立 session 与 activation lease     |
| `active`         | runtime session 与 activation-lifetime contribution 有效 |
| `deactivating`   | 正在停止 runtime 并清理 activation lifetime              |
| `failed`         | runtime activation、执行、transport 或 deactivation 失败 |

### 2.3 合法组合

- `ready + not-applicable`：纯声明插件，已经可用。
- `ready + inactive`：静态 contribution 可用，runtime 等待 activation event。
- `ready + active`：静态与 activation-lifetime contribution 都可用。
- `blocked | disabled | failed` 时 runtime 不得保持 `active`。
- availability 离开 `ready` 前，必须先终止 `activating/active` runtime。
- runtime failure 通常不改变 availability；Host 可以继续保留明确声明为 installation lifetime 的静态贡献。

### 2.4 状态快照

```ts
type PluginHostSnapshot = {
  pluginId: string;
  pluginVersion: string;
  installationId: string;
  generation: number;
  permissionRevision?: number;
  registryRevision?: number;
  revision: number;
  availability: PluginAvailabilityState;
  runtime: PluginRuntimeState;
  permissionRevision: number;
  diagnostics: readonly PluginDiagnostic[];
};
```

规则：

1. 快照不可变。
2. 任何已提交状态变更增加 `revision`。
3. subscriber 只接收提交后的完整快照。
4. in-flight operation、AbortController 和 runtime handle 不进入快照。
5. diagnostics 保存当前可操作问题，不充当无限历史；历史进入 audit sink。

## 3. Identity 与 generation

```ts
type PluginOwnerRef = {
  pluginId: string;
  installationId: string;
  generation: number;
};

type ContributionIdentity = {
  pluginId: string;
  contributionId: string;
};
```

### 3.1 Identity 规则

- 对外稳定 contribution identity 是 `<pluginId>/<contributionId>`。
- 内部 ownership 包含 `installationId + generation`，防止旧 activation 或 cleanup 删除新资源。
- plugin version 不作为 contribution identity；版本升级是同一 installation 的新 generation。
- Phase 2 不公开字符串拆分 API；需要索引时由 Host 内部生成 canonical key。
- 一个 Host scope 内同一 plugin id 只有一个 current generation。

### 3.2 Generation 规则

1. 每次重新发现、重新验证或替换同一 plugin id 的 package candidate 都创建新 generation。
2. async operation 捕获启动时 generation。
3. transaction commit 时 generation 不一致，返回 stale-operation diagnostic 并 rollback。
4. 旧 generation 的 dispose 只能处理自己的 lease，不得按 plugin id 宽泛删除新 generation。
5. generation 是进程内单调值，不替代 package digest、installation id 或持久化版本。

## 4. 统一结果类型

Host operation 可能成功但附带 warning，因此不复用“成功时 diagnostics 必为空”的 Manifest validator result。

```ts
type PluginHostResult<T> =
  | {
      ok: true;
      value: T;
      diagnostics: readonly PluginDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: readonly [PluginDiagnostic, ...PluginDiagnostic[]];
    };
```

规则：

- `ok: false` 至少有一个 error diagnostic。
- warning/info 可以出现在成功结果中。
- 原始 throw 只进入开发态日志或受控 `cause`，不进入可持久化 audit payload。
- policy、resolver、runtime adapter 和 audit sink 使用同一结果形态。
- 公开 Host 边界捕获外部 adapter throw，不让其传播到编辑器主循环。

## 5. Package source 边界

Host 不接收磁盘根路径或 URL，而接收受限 package source：

```ts
type PluginTrustLevel =
  'core' | 'official' | 'verified' | 'community' | 'development';

type PluginPackageAttestation = {
  sourceId: string;
  packageDigest: string;
  trustLevel: PluginTrustLevel;
  publisherVerified: boolean;
  signatureKeyId?: string;
};

type PluginPackageReader = {
  readManifest(signal: AbortSignal): Promise<PluginHostResult<Uint8Array>>;
  readResource(
    path: string,
    options: { maxBytes: number; signal: AbortSignal }
  ): Promise<PluginHostResult<Uint8Array>>;
};

type PluginPackageSource = {
  installationId: string;
  attestation: PluginPackageAttestation;
  reader: PluginPackageReader;
};
```

### 5.1 Reader 规则

1. path 已由 `plugin-contracts` 校验为 package-relative，但 reader 仍必须在真实 package root 内 resolve。
2. reader 不返回文件系统 handle、Response、stream 或绝对路径。
3. Host 读取 contribution resource 后先验证 integrity，再解析 JSON。
4. Host 在 activation transaction 前读取 runtime entrypoint，二次检查独立 byte limit、计算实际 SHA-256，并与 Manifest integrity 比较。
5. verified runtime artifact 绑定 path、实际 digest、package digest、installation 与 generation 后才传给 runtime adapter。
6. package signature 与 publisher attestation 由安装层验证；Host 只消费结构化 attestation。
7. resource bytes、descriptor depth、descriptor node count、单插件资源数和总 bytes 分别设限。
8. AbortSignal canceled 后 reader 不得继续向 Host 发布结果；Host shutdown 使用独立 signal 覆盖尚未取得 plugin id 的 Manifest read。

### 5.2 plugin-contracts 前置重构

resource descriptor 必须与 Manifest 使用同一严格 JSON 行为。Phase 2 首先在 `plugin-contracts` 抽出通用 `parseStrictJsonDocument`：

- 复用 BOM、fatal UTF-8、注释、尾逗号、重复 key、depth、node 与 byte limit。
- `parsePluginManifest` 变为通用 parser 的领域 wrapper。
- 不复制 parser 到 `plugin-host`。
- 保持现有 Manifest 公开行为和诊断码。

## 6. Capability policy

### 6.1 Capability identity

```ts
type CapabilityIdentity = {
  id: CapabilityRequest['id'];
  scope?: string;
};

type CapabilityDecision = {
  capability: CapabilityIdentity;
  decision: 'grant' | 'deny';
  source: 'host-safety' | 'administrator' | 'user' | 'trust-default';
  reasonCode: string;
};
```

Manifest 面向人的 request `reason` 与授权 decision 的机器 `reasonCode` 分离。

### 6.2 Policy port

```ts
type CapabilityPolicyInput = {
  owner: PluginOwnerRef;
  manifest: PluginManifestV1;
  attestation: PluginPackageAttestation;
  previous?: PermissionSnapshot;
};

type CapabilityPolicy = {
  resolve(
    input: CapabilityPolicyInput,
    signal: AbortSignal
  ): Promise<PluginHostResult<PermissionSnapshot>>;
};
```

Policy 由 composition root 注入。Host Core 不读取 localStorage、用户 store 或管理员 API。

### 6.3 Permission snapshot

`PermissionSnapshot` 至少包含：

- owner 与 plugin version。
- 单调增加的 `permissionRevision`。
- 每个 Manifest capability 的 effective decision 与 decision source。
- required denied、optional denied、granted 的确定性分组。
- policy revision / policy source 摘要，不含用户隐私或完整策略文档。

### 6.4 Resolution 规则

1. capability 未请求则永远 denied。
2. 相同 id 不同 scope 是不同 capability。
3. deny source 优先级：host safety / administrator deny > user deny > allow。
4. required request 被 deny 时 availability 进入 `blocked`，不得 activation。
5. optional `extension.register` 被 deny 时，对应 point 的 contribution 不进入 registry。
6. optional 非注册能力被 deny 时 runtime 可以启动，但 Gateway 返回 capability denied。
7. plugin update 必须重新跑 policy；旧 grant 只能由 policy 对完全相同 capability 显式继承。
8. `@prodivix/core` 可以由 trust policy 预授权，但仍使用 PermissionSnapshot、transaction 和 audit。
9. permission snapshot 不暴露可由插件修改的 Map 或 Set。

## 7. 撤权与 reconciliation

### 7.1 Required capability revoke

1. 增加 permission revision。
2. abort in-flight sensitive operation 和 activation。
3. deactivate runtime。
4. 清理 activation 与 installation lease。
5. availability 进入 `blocked`。
6. 只有新的 permission resolution 通过后才允许显式 enable/retry。

### 7.2 Optional extension.register revoke

1. 增加 permission revision。
2. 原子清理依赖该 point grant 的 contribution lease。
3. 其他 required grant 满足时 runtime 可以保留。
4. 被撤销 point 的读取结果在 registry revision 更新后立即不可见。

### 7.3 Optional Gateway capability revoke

- 现有 session 可以保留。
- 下一次调用检查当前 revision 并立即 denied。
- in-flight 调用收到 abort。
- adapter 不得缓存永久 allow boolean。

### 7.4 与 activation 并发

撤权先增加 permission revision。旧 activation transaction 即使随后成功返回，也因 revision 不一致而不能 commit，只能清理自己的 staged resource。

## 8. Runtime adapter port

```ts
type PluginRuntimeAdapter = {
  activate(
    input: PluginRuntimeActivationInput,
    signal: AbortSignal
  ): Promise<PluginHostResult<PluginRuntimeSession>>;
};

type PluginRuntimeActivationInput = {
  owner: PluginOwnerRef;
  manifest: PluginManifestV1;
  runtimeArtifact: VerifiedPluginRuntimeArtifact;
  event: ActivationEvent;
  operationId: string;
  sessionToken: string;
  permission: LivePermissionGuard;
  contributions: ScopedContributionTransaction;
};

type PluginRuntimeSession = {
  deactivate(
    reason: RuntimeDeactivationReason,
    signal: AbortSignal
  ): Promise<PluginHostResult<void>>;
  onDidTerminate(
    listener: (event: RuntimeTerminationEvent) => void
  ): Disposable;
};
```

约束：

1. adapter 由 Browser/official transport composition root 提供，Host Core 不创建 Worker 或 iframe。
2. activation context 暴露经过 Host 校验的 runtime artifact、live permission guard 与 scoped activation transaction；具体 Gateway 由 Phase 4 Browser adapter 绑定。
3. runtime 不直接 commit contribution；注册请求只能 stage 到 activation transaction。
4. timeout、cancel 和 permission revoke 统一通过 AbortSignal。
5. session crash 清理 activation lifetime，runtime state 进入 `failed`。
6. `deactivate` throw/timeout 不阻止 Host owner cleanup；cleanup 结果另行诊断和审计。
7. termination listener 必须携带 session token，旧 session 事件不能终止新 session。
8. activation audit 记录 runtime path、实际 digest 与 package digest，不记录 runtime bytes。

Phase 2 测试使用 fake runtime adapter；真实 Browser transport 留到 Phase 4。

## 9. Host operation 流程

### 9.1 Discover / validate / enable

```text
package source
  -> read manifest bytes
  -> parseAndValidatePluginManifest
  -> verify structured attestation policy
  -> resolve permission snapshot
  -> required denied? -> blocked
  -> load authorized contribution resources
  -> strict JSON + integrity + contract validation
  -> prepare installation-lifetime contributions
  -> installation transaction commit
  -> ready + runtime inactive/not-applicable
```

细则：

1. Host version 和 known command catalog 必须传给 Manifest validator。
2. required deny 后不继续读取非必要 contribution resource。
3. optional `extension.register` deny 的 point 不加载、不 prepare、不注册。
4. 所有已授权 descriptor 通过对应 contract 后才允许进入 `ready`。
5. 纯声明插件在 installation transaction commit 后即可使用，不伪造 active runtime。

### 9.2 Activate

1. availability 必须为 `ready`，runtime 必须为 `inactive`。
2. 同一 plugin 的并发 activate 共享同一 in-flight result。
3. 捕获 generation、permission revision 和 registry revision。
4. 创建 activation AbortController，并在 timeout 内读取、限额、digest 与验证 runtime artifact。
5. 创建 activation transaction，调用 runtime adapter；runtime registration 仅 stage。
6. adapter 成功后 commit transaction，再提交 runtime `active`。
7. artifact 或 adapter timeout 会发布 runtime `failed`；superseded operation 不得覆盖新状态。
8. 任一失败：rollback、deactivate partial session、runtime `failed`。

### 9.3 Deactivate

1. `inactive/not-applicable` 返回成功 no-op。
2. `activating` 时先 abort，等待 rollback，再继续 cleanup。
3. `active` 时进入 `deactivating`，请求 session deactivate。
4. 无论 adapter 结果如何，Host 都清理 activation-lifetime lease 和 listener。
5. cleanup 完成后进入 `inactive`；不完整则进入 runtime `failed`。
6. installation-lifetime static contribution 不因普通 runtime deactivation 被删除。

### 9.4 Disable

1. serialize 当前 plugin operation。
2. deactivate runtime。
3. dispose activation 与 installation 两类 lease。
4. availability 进入 `disabled`。
5. 后续 enable 重新检查 package generation 和 permission revision，不直接恢复旧 lease。

### 9.5 Runtime crash

1. 只接受当前 session token 的 termination event。
2. 清理 activation lifetime。
3. runtime 进入 `failed`，availability 通常保持 `ready`。
4. installation lifetime 仍可见；需要 runtime 的 surface 必须声明 activation lifetime。
5. Host Core 不硬编码自动重启，由上层显式调用 retry activation。

### 9.6 Host shutdown

1. `shutdown()` 首次调用后立即拒绝新的 discover/enable/activate/reconcile/retry 操作。
2. Host-level AbortSignal 先取消尚未取得 plugin id 的 Manifest read，再 supersede 当前 per-plugin operation。
3. 每个当前 owner 以 `host-shutdown` reason deactivation，并继续清理 activation/installation lifetime。
4. cleanup failure 不阻止其他 owner cleanup；最终结果聚合 diagnostics。
5. 清空 record、permission、generation、Host subscriber 与 registry subscriber。
6. 重复 `shutdown()` 返回同一个 in-flight/final Promise，不重复 deactivate 或 dispose。

## 10. 并发、取消与幂等

### 10.1 Operation serialization

- 同一 plugin id 的状态变更 operation 串行执行。
- 不同 plugin 可以并发，registry commit 使用全局 revision 检测。
- 读 snapshot 不排队，返回最近一次已提交状态。

### 10.2 Idempotency

- activate(active) -> success no-op。
- activate(activating) -> 返回同一 in-flight Promise。
- deactivate(inactive) -> success no-op。
- disable(disabled) -> success no-op。
- dispose 已释放 lease -> success no-op。
- retry failed 必须使用显式 API，不把任意 activate 隐式当重试。

### 10.3 Supersede

disable、required revoke 和新 generation 可以 supersede activation：

1. abort 旧 operation。
2. 旧 operation 完成时检查 token/generation/revision。
3. stale result 只能 cleanup 自己的资源，不能写状态或 registry。

不使用“最后完成者获胜”；状态提交由 operation token 决定。

## 11. Audit event

```ts
type PluginAuditEvent = {
  eventId: string;
  occurredAt: string;
  operationId: string;
  pluginId: string;
  pluginVersion: string;
  installationId: string;
  generation: number;
  category: 'validation' | 'permission' | 'registry' | 'runtime' | 'cleanup';
  action: string;
  outcome: 'success' | 'denied' | 'failed' | 'canceled';
  capability?: CapabilityIdentity;
  contribution?: ContributionIdentity;
  diagnosticCodes?: readonly string[];
  durationMs?: number;
};
```

规则：

1. event 是 JSON 可序列化 append-only fact，不保存 Manifest、descriptor、源码、Secret 或 Token 全文。
2. Clock 与 event id factory 注入，测试不依赖 `Date.now()` 或随机 UUID。
3. audit sink 接收 batch；sink throw 被 Host 收敛，不传播到 editor loop。
4. Phase 2 lifecycle audit 暂时 best-effort；Phase 4 敏感 Gateway 可以在 audit unavailable 时 fail closed。
5. retry 产生新 operation id，不覆盖旧 event。
6. permission/registry revision 在可用时直接进入 event，和 operation id、generation 共同定位并发顺序。

## 12. 持久化边界

Phase 2 Host Core 维护进程内状态，但不选择持久化介质。

- 安装层持久化：package source、digest、attestation、Manifest bytes、启用状态。
- permission adapter 持久化：用户/管理员 decision 与 policy revision。
- Host Core 临时态：in-flight operation、runtime session、lease、registry snapshot。
- audit sink 持久化：结构化 event。

Host Core 不直接写 localStorage、IndexedDB、Git、Workspace VFS 或 backend。恢复时由 composition root 重新提供 package source 和 permission state，Host 重新验证；不序列化 runtime handle 或 resolved function。

## 13. 生命周期测试要求

- 纯声明插件达到 `ready + not-applicable`。
- runtime 插件达到 `ready + inactive`，激活后为 `ready + active`。
- required deny 是 blocked，不是 failed。
- optional deny 不阻断无关 contribution。
- 普通 deactivate 不移除 installation lifetime。
- activation failure 不残留 session、listener 或 activation contribution。
- runtime artifact read/integrity/limit failure 不调用 adapter。
- runtime artifact 与 activation adapter timeout 都进入 `failed`，不残留 `activating`。
- required revoke 先 cleanup 再 blocked。
- 双 activate 只调用 adapter 一次。
- activating 中 disable/revoke 能 abort 并等待 rollback。
- stale completion 不修改快照。
- runtime crash 只接受当前 session token。
- shutdown abort 未知 plugin id 的 Manifest read，并 exactly-once 清理 active/pending runtime 与全部 contribution lease。
- shutdown 后所有 mutation API 返回稳定 invalid-transition diagnostic。
- audit redaction 与 sink throw 行为稳定。
