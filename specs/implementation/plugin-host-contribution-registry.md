# Plugin Host Contribution Registry 与事务协议

## 状态

- Phase 2 implemented contract
- 日期：2026-07-10
- 上位决策：`specs/decisions/29.plugin-extension-points.md`
- 生命周期协议：`specs/implementation/plugin-host-lifecycle-and-permissions.md`

## 1. 目的

本文冻结 Host contribution contract registry、resolved contribution registry、transaction、ownership、lifetime、冲突和 cleanup 语义。

该 registry 是 Host 内部 resolved model 的统一入口，不是 Manifest、sandbox message 或任意 `Map<string, unknown>` 的公开包装。

当前实现位于 `packages/plugin-host/src/contribution/`，公开只暴露 contract definition、reader、record/event 与 runtime scoped transaction；Host 写入口仍由 lifecycle composition 内部持有。

## 2. 类型映射

Host Core 不认识 Palette、Inspector 或 React 类型。composition root 定义宿主支持的 resolved point map：

```ts
type HostContributionPointMap = Partial<Record<ContributionPoint, unknown>>;
```

具体应用可以形成：

```ts
type WebContributionPointMap = {
  paletteContribution: ResolvedPaletteContribution;
  inspectorContribution: ResolvedInspectorContribution;
  codegenPolicy: ResolvedCodegenPolicy;
};
```

规则：

1. point key 必须来自 Manifest v1 `ContributionPoint`。
2. value 是 Host 内部 resolved 类型，可以包含受信任函数或 React 投影，但不得跨 sandbox。
3. `plugin-host` 只使用 generic map，不 import surface 类型。
4. 未注册 contract 的 point 不退化为 `unknown` 接受，而是明确 unsupported diagnostic。

## 3. Contribution contract registry

```ts
type ContributionContract<
  TMap extends HostContributionPointMap,
  TPoint extends keyof TMap & ContributionPoint,
  TDescriptor,
> = {
  point: TPoint;
  contractVersion: string;
  validateDescriptor(input: JsonValue): PluginHostResult<TDescriptor>;
  prepare(
    context: ContributionPrepareContext<TDescriptor>
  ): Promise<PluginHostResult<PreparedContribution<TMap[TPoint]>>>;
};
```

### 3.1 Contract key

公共 key 使用结构对象：

```ts
type ContributionContractIdentity = {
  point: ContributionPoint;
  contractVersion: string;
};
```

Host 内部可以生成 canonical key，但调用方不拼接或解析 `point@version` 字符串。

### 3.2 Contract 规则

1. exact version match；无隐式 latest、minor fallback 或旧版转换。
2. contract registry 在 Host composition 阶段注册并冻结。
3. 插件不能注册、替换或删除 Host contract validator。
4. 重复 point + version 是 Host 配置错误，创建 Host 失败。
5. unsupported contract 产生 PLG diagnostic，插件不能进入 `ready`。
6. validator 只处理 descriptor shape；resolver 处理宿主投影和 point-specific 业务冲突。
7. resolver 是受信任 Host adapter，不执行插件任意代码。
8. contractVersion migration 必须注册显式新 contract 或 converter，不在 lookup 中猜测兼容。

## 4. Descriptor 获取与准备

### 4.1 Inline source

1. 使用 Manifest validator 已确认的 JSON descriptor。
2. 再执行 point-specific `validateDescriptor`。
3. 不允许 resolver 绕过 validator 直接 cast。

### 4.2 Resource source

1. 检查对应 `extension.register` grant。
2. 通过 `PluginPackageReader.readResource` 读取受限 bytes。
3. 检查单资源和单插件总量限制。
4. 验证 Manifest 声明的 integrity。
5. 使用 `plugin-contracts.parseStrictJsonDocument` 解析。
6. 执行 point-specific validator。
7. 调用 Host resolver prepare。

resource path 即使已通过 Manifest semantic validation，reader 仍必须限制在真实 package root 内。

### 4.3 Prepare context

```ts
type ContributionPrepareContext<TDescriptor> = {
  owner: PluginOwnerRef;
  attestation: PluginPackageAttestation;
  declaration: ContributionDeclaration;
  descriptor: TDescriptor;
  permission: PermissionSnapshotReader;
  operationId: string;
  signal: AbortSignal;
};
```

`attestation` 是安装层验证后传入的只读 package identity，至少包含 `sourceId`、`packageDigest`、`trustLevel` 与 `publisherVerified`。需要绑定宿主 runtime projection 或 build-time implementation 的 resolver 必须同时使用 package attestation 与 contribution identity，不能只按 `pluginId/contributionId` 查询 module-scope side channel；否则并发 generation replacement 可能读取另一 package 的实现。

Prepare context 不暴露：

- Workspace store 或 PIR graph。
- raw permission mutation API。
- Host registry writer。
- DOM、Worker 或 iframe handle。
- 其他插件的内部 resolved value。

## 5. Prepared contribution 与 lifetime

```ts
type ContributionLifetime = 'installation' | 'activation';

type PreparedContribution<T> = {
  value: T;
  lifetime: ContributionLifetime;
  dependsOnCapabilities: readonly CapabilityIdentity[];
  order?: number;
  dispose?: () => void | Promise<void>;
};
```

### 5.1 Installation lifetime

- 插件 availability 为 `ready` 时可见。
- runtime 为 `inactive` 时仍保留。
- disable、required capability revoke、generation replacement 或 uninstall 前清理。
- 适合纯数据 palette descriptor、静态 Inspector metadata 等。

### 5.2 Activation lifetime

- 只在 runtime session active 时可见。
- activation transaction commit 后发布。
- deactivate、runtime crash、required revoke 或 disable 时清理。
- 适合 runtime command handler、executor binding、live provider 或 transport proxy。

### 5.3 Lifetime 规则

1. resolver 必须显式选择 lifetime，Host 不从字段名或函数存在性猜测。
2. 同一 declaration 默认产生一个 prepared contribution；需要拆成多条 record 时由 point contract 明确类型与 identity 规则。
3. `dependsOnCapabilities` 必须是 Manifest 已请求能力的子集。
4. transaction commit 重新检查每项依赖的当前 grant。
5. dispose 被 transaction 接管后最多执行一次。
6. dispose throw 不中断后续 cleanup；Host 汇总 diagnostics。

## 6. Contribution record

```ts
type ContributionRecord<T> = {
  identity: ContributionIdentity;
  owner: PluginOwnerRef;
  point: ContributionPoint;
  contractVersion: string;
  lifetime: ContributionLifetime;
  registrationOrdinal: number;
  requiredCapabilities: readonly CapabilityIdentity[];
  value: T;
};
```

约束：

- stable identity 是 plugin id + contribution local id。
- owner 必须带 installation id 与 generation。
- record 不保存原始 Manifest bytes 或 descriptor 全文。
- value 只在 Host 内存中存在，不持久化。
- record snapshot 不暴露 dispose function。

## 7. Registry 公开读 API

```ts
type ContributionRegistryReader<TMap extends HostContributionPointMap> = {
  get<TPoint extends keyof TMap & ContributionPoint>(
    point: TPoint,
    identity: ContributionIdentity
  ): ContributionRecord<TMap[TPoint]> | undefined;
  list<TPoint extends keyof TMap & ContributionPoint>(
    point: TPoint
  ): readonly ContributionRecord<TMap[TPoint]>[];
  listByOwner(
    owner: PluginOwnerRef,
    options?: { lifetime?: ContributionLifetime }
  ): readonly ContributionRecord<TMap[keyof TMap]>[];
  getRevision(): number;
  subscribe(listener: ContributionRegistryListener<TMap>): Disposable;
};
```

### 7.1 Read 规则

1. 返回 readonly snapshot，不暴露内部数组或 Map。
2. `get` 同时校验 point 与 stable identity。
3. `listByOwner` 使用完整 owner generation，不按 plugin id 模糊匹配。
4. 默认顺序由 order、registration ordinal、plugin id、contribution id 的确定性组合决定。
5. surface adapter 可以对 snapshot 做 view sort，但不能改变 registry identity 或 ownership。
6. 读操作不等待 in-flight transaction，只看最近一次 commit。

### 7.2 Subscription

subscriber 接收 batch event：

```ts
type ContributionRegistryEvent<TMap> = {
  revision: number;
  operationId: string;
  added: readonly ContributionRecord<TMap[keyof TMap]>[];
  removed: readonly ContributionRecord<TMap[keyof TMap]>[];
};
```

- 一个 commit / owner dispose 只产生一个 event。
- 不发布 staged 或逐项中间状态。
- listener throw 被隔离并产生 diagnostic/audit，不回滚已提交 state。
- listener 在 registry mutation 临界区结束后调用。

## 8. Registry 写入口

没有公开 `register()` 或 `unregister()`。写入口只有：

1. `beginTransaction(context)`。
2. `disposeByOwner(owner, { lifetime? })`。
3. Host 内部 generation replacement transaction。

plugin runtime、surface adapter 和 resolver 都不能直接写 registry。

## 9. Contribution transaction

```ts
type ContributionTransactionContext = {
  owner: PluginOwnerRef;
  expectedRegistryRevision: number;
  expectedPermissionRevision: number;
  lifetime: ContributionLifetime;
  operationId: string;
};
```

### 9.1 Transaction 状态

```text
open -> committed
open -> rolled-back
```

- `stage(record)`：只写 transaction 私有 staging area。
- `commit()`：验证 conflict、generation、grant 和 identity 后原子发布。
- `rollback()`：逆序 dispose staged resources。
- commit/rollback 重复调用返回稳定 no-op result，不重复 dispose。
- committed transaction 不能继续 stage。

### 9.2 Stage 规则

1. record owner 必须与 transaction owner 完全相同。
2. record lifetime 必须与 transaction lifetime 相同。
3. transaction 内 stable identity 唯一。
4. point + value 类型由 generic contract 保证。
5. capability dependency 必须来自当前 Manifest request。
6. stage 失败不影响已 stage 项；最终由调用方 rollback 整体 transaction。

### 9.3 Commit 前检查

1. transaction 仍是 `open`。
2. owner generation 仍是 current generation。
3. registry revision 等于 expected revision。
4. permission revision 等于 expected revision。
5. 每项所需 capability 当前仍 granted。
6. stable identity 没有未声明冲突。
7. transaction staging 内没有 duplicate identity。
8. operation token 未被 disable、revoke 或新 generation supersede。

任一失败都不发布部分 record，并逆序清理 staged disposable。

### 9.4 Atomic commit

commit 顺序：

1. 在临界区内重新执行所有 precondition。
2. 基于当前 registry snapshot 构造 next snapshot。
3. 一次替换内部 snapshot 并增加 revision。
4. 标记 transaction committed。
5. 离开临界区。
6. 生成 immutable batch event。
7. 通知 subscriber 与 audit sink。

外部 callback 不在步骤 1-4 中执行。

## 10. 冲突策略

### 10.1 Stable identity

- 同一 `<pluginId>/<contributionId>` 在同 generation 重复：error。
- 不同 plugin 使用相同 local id：允许。
- point 不同但 stable identity 相同：仍是 error；一个 local id 只代表一个 contribution declaration。
- 不允许 last-write-wins。

### 10.2 Generation replacement

- 旧 generation 与新 generation 同 identity 只有显式 replacement transaction 可以替换。
- 普通 activation transaction 不能删除或覆盖 installation lifetime。
- replacement commit 必须同时发布 removed old records 与 added new records 的单个 batch。
- 旧 generation late cleanup 只能 dispose 已转移前仍归它所有的 lease。

### 10.3 Point-specific 业务冲突

不同 stable identity 可能声明同一业务 id，例如同一个全局 command id。该冲突由 point contract resolver 在 prepare 阶段诊断，Host registry 不理解业务字段，也不静默覆盖。

### 10.4 Revision conflict

registry revision 变化时不做隐式 merge，即使变化看似不影响当前 identity。transaction 返回 conflict，由 Host 读取新 snapshot 后显式重试。

该策略牺牲少量并发吞吐，换取确定性和易审计性。不同 plugin 的 prepare 可以并行，commit 仍保持短临界区。

## 11. Rollback 与 dispose

### 11.1 Rollback

1. 按 stage 逆序执行 dispose。
2. 每项 dispose 最多一次。
3. dispose throw 被转成 diagnostic，继续清理剩余项。
4. rollback 返回全部 cleanup diagnostics。
5. rolled-back record 从未进入 registry，不发 removed event。

### 11.2 Dispose by owner

```ts
disposeByOwner(
  owner: PluginOwnerRef,
  options?: { lifetime?: ContributionLifetime; operationId: string }
): Promise<PluginHostResult<ContributionRegistryEvent<TMap>>>;
```

规则：

- 使用完整 owner generation。
- 先原子从 registry snapshot 移除，再在临界区外 dispose。
- subscriber 看到 record 已不可用后，cleanup 才可继续异步完成。
- cleanup failure 不把 record 放回 registry。
- repeated dispose 返回成功 no-op。

### 11.3 Capability-scoped cleanup

optional `extension.register` revoke 时，Host 查找 `requiredCapabilities` 包含该 capability 的 record，并在一个 transaction 中原子移除。不能要求每个 surface 自己监听权限再 unregister。

## 12. Reentrancy 与 callback 隔离

1. contract validator 和 resolver 不在 registry lock 内执行。
2. dispose 不在 registry lock 内执行。
3. subscriber 不在 registry lock 内执行。
4. audit sink 不在 registry lock 内执行。
5. callback 触发的新 transaction 排入后续 operation，不能重入当前 commit。
6. callback throw 不改变已提交 revision。

## 13. Deterministic ordering

registry 不把 `Map` insertion order 当作产品协议。

默认比较键：

1. prepared `order`，缺省为 0。
2. registration ordinal，即 Manifest declaration index 或 contract 明确产生的稳定 ordinal。
3. plugin id。
4. contribution id。

batch event 的 added/removed 也使用同一排序。audit、测试和 surface 初始读取因此得到一致顺序。

## 14. Registry diagnostics

计划使用：

- `PLG-1013`：unsupported point + contractVersion。
- `PLG-1014`：descriptor contract Schema 失败。
- `PLG-3010`：stable identity 冲突。
- `PLG-3011`：transaction revision conflict。
- `PLG-3012`：Host resolver 失败。
- `PLG-3013`：owner generation 过期。
- `PLG-4004`：rollback 或 owner cleanup 不完整。
- `PLG-4006`：transaction 被 supersede。

meta 至少包含 plugin id、installation id、generation、operation id、point、contract version、contribution id、registry revision 和 permission revision。

## 15. Registry 测试要求

### 15.1 Contract registry

- exact point + version 成功。
- unsupported version 失败，不 fallback。
- duplicate contract 在 Host 创建时失败。
- validator 失败时 resolver 不执行。
- resolver throw 被收敛。

### 15.2 Transaction

- staged record commit 前不可见。
- commit 后只产生一个 batch。
- transaction 内 duplicate identity 被拒绝。
- registry revision 变化导致整体 rollback。
- permission revision 变化导致整体 rollback。
- stale generation 不能 commit。
- superseded operation 不能 commit。

### 15.3 Cleanup

- rollback 逆序 dispose。
- 每个 disposable exactly once。
- 一个 dispose throw 不阻止后续项。
- installation 与 activation lifetime 独立清理。
- 旧 generation dispose 不影响新 generation。
- capability-scoped cleanup 原子移除相关 records。

### 15.4 Public behavior

- list 顺序稳定。
- snapshot readonly。
- subscriber 只看到 batch 后状态。
- listener throw 不传播、不回滚。
- 不断言内部 Map、private field、具体 lock 或函数调用栈。
