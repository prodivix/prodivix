# Semantic Diagnostics 编码规范（SEM）

## 状态

- Accepted / Implemented
- 日期：2026-07-14
- 关联：
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/implementation/g1-semantic-component-collection.md`

## 范围

`SEM-xxxx` 表达 Workspace Semantic Index 在统一 reference graph 上产生的跨领域解析结果。领域文档形状错误继续使用 PIR、Route、Workspace、NodeGraph、Animation 或 Code 等 owner domain 的诊断码。

### `SEM-2001` 语义引用目标不存在

- Severity: `warning`
- Stage: resolution
- Retryable: false
- Trigger: reference target 在当前 SemanticSnapshotIdentity 中没有对应 symbol，且该 fact 未声明等待宿主上下文 composition 的 `diagnosticPolicy: defer`
- User action: 修正或重新绑定引用目标
- Developer notes: `meta.referenceId`、`targetRef` 与可选 `SourceSpan` 定位引用来源

### `SEM-2002` 语义引用目标在当前作用域不可见

- Severity: `warning`
- Stage: resolution
- Retryable: false
- Trigger: symbol 存在，但不在 reference 的 lexical/import scope 中可见
- User action: 通过显式参数、binding、import 或合法 owner scope 引入目标
- Developer notes: 不得用全局名称搜索绕过 visibility policy

### `SEM-2003` 语义引用解析结果不唯一

- Severity: `warning`
- Stage: resolution
- Retryable: false
- Trigger: 同一优先级内存在多个满足 name、kind、type 与 capability 的候选 symbol
- User action: 使用稳定 symbol identity 或收窄作用域与类型约束
- Developer notes: `meta.candidateSymbolIds` 保留确定性排序的候选地址

### `SEM-2004` 语义引用目标类型或能力不兼容

- Severity: `warning`
- Stage: resolution
- Retryable: false
- Trigger: 候选 symbol 存在且可见，但不满足 `expectedTypeRefs`、capability 或 durable target 约束
- User action: 绑定满足宿主 contract 的目标
- Developer notes: 类型集合表达合法并集，capability 集合表达同时要求

### `SEM-2005` 语义索引快照已过期

- Severity: `warning`
- Stage: resolution
- Retryable: false
- Trigger: query 的 expected SemanticSnapshotIdentity 与当前 index identity 不一致
- User action: 使用最新 Workspace snapshot 重建查询或计划
- Developer notes: stale 结果不得返回旧 definition、reference、completion 或 impact 作为当前结果
