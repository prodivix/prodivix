# PIR Wire Contract v1.6（Frozen Snapshot）

PIR wire v1.6 是不可变持久化 snapshot，在 v1.5 Data operation identity/lifecycle 基础上增加 query activation、typed input mapping 与 Blueprint mutation event。生产代码仍只消费无版本号的 `PIR-current`；`1.6` 只存在于 schema、codec、migration 与 persistence boundary。

## Query durable authoring

`logic.dataById` 继续拥有文档局部 `dataId`，并可保存：

```ts
type PIRDataOperationBinding = {
  operation: DataOperationReference;
  input?: DataOperationInputBinding;
  activations?: Array<
    | { kind: 'document' }
    | { kind: 'route'; routeId: string }
    | { kind: 'input-change'; dependencyId: string }
  >;
};
```

`input-change` 必须引用同一 input tree 中的 `runtime-value.valueId`。query 不允许读取 `trigger-payload`；document、route 与 dependency change 只描述显式 activation，refresh/pagination 仍由运行控件触发。

## Mutation event

Element event 可以保存：

```ts
type PIRDataOperationTriggerBinding = {
  kind: 'dispatch-data-operation';
  operation: DataOperationReference;
  input: DataOperationInputBinding;
};
```

dispatch identity、sequence、attempt、environment 与 lifecycle 是 session-local 运行态，不进入 PIR。Workspace authoring transaction 在写入前解析 exact DataSourceDocument，并要求 query binding 指向 query、event trigger 指向 mutation。

## Typed input 与 CodeSlot

`DataOperationInputBinding` 支持 `literal`、`trigger-payload`、`runtime-value`、`object`、`array` 与 `code`。`code` 只保存 `slotId + CodeReference + nested input`；对应 transform 必须由 Code Authoring Environment 的 `data-input-transform` CodeSlot 发布，PIR 不保存裸函数。

## Migration

v1.6 字段均为 additive optional contract。v1.5 → v1.6 migration 只不可变地提升 wire envelope 的 `version`，不改写既有作者态内容。

v1.6 Canonical Backend production rollout 已采用 backend coordinated migration：database migration 12 在服务接受 current 路径 patch 前以写阻断 table lock 和有界 keyset batch 锁定全部 PIR 保存态，把 1.3 canonical baseline 及后续已激活版本确定性升级到 1.6，并通过 current schema 与 `contentRev + content_json` CAS 后原子写回；随后安装 database CHECK constraint，持续拒绝旧进程或旁路再次写入非 1.6 PIR。wire-only 升级不推进作者态 revision 或 `opSeq`；任一文档无法安全迁移时整批回滚并阻止启动。TypeScript 与 Backend 使用同一 `specs/pir/fixtures/pir-v1.3-to-current.json` fixture 验证确定性结果。
