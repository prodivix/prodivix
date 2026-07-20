# G3 NodeGraph Typed Flow 与 Debugger 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/nodegraph`、`@prodivix/runtime-core`、`@prodivix/behavior`、Code/Data/Route/Animation owners、`apps/web`
- 关联：
  - `specs/decisions/60.nodegraph-typed-flow-and-behavior-debugging.md`
  - `specs/decisions/20.node-graph-port-semantics.md`
  - `specs/decisions/42.nodegraph-execution-session.md`
  - `specs/implementation/g2-nodegraph-execution-session.md`
  - `specs/implementation/g3-deterministic-replay-runtime-controls.md`

## 目标

在不破坏 G2 deterministic kernel 和 same-context Session 的前提下，把 NodeGraph 扩展为 typed control/data
flow，可被 Route/PIR/Data/BehaviorScenario 真实调用，并在 Preview、Export、CI 中保持相同 semantic trace。调试器
必须基于 domain execution protocol，而不是读取 React Flow/DOM 状态。

## 范围

- typed port/edge、node descriptor、effect/runtime-zone/capability model；
- compile-time plan、type/cycle/capability validation 与 digest；
- first-party pure/state/Data/Route/Animation/CodeSlot/async/error/retry/subgraph nodes；
- runtime temporary state transaction、parallel/join/cancel/late completion fencing；
- subgraph public contract 与 CodeSlot binding；
- breakpoint/step/stack/value projection/replay debugger；
- Behavior trigger/action/observation 与 SourceTrace；
- current/wire migration、backend/compiler/export/provider conformance。

## 非目标

- 通用 arbitrary JavaScript、直接 fetch/environment/Secret/Workspace patch node；
- durable distributed workflow、每个 node 的 Remote RPC 或逐节点 queue；
- 把 graph temporary state 自动采纳为 Workspace authoring；
- 递归 graph、unbounded loop、unbounded stream/buffer；
- G4 agent node 与 G6 public third-party node marketplace。

## Document model 演进

扩展 current model：

```ts
interface NodeGraphPort {
  id: NodeGraphPortId;
  direction: 'input' | 'output';
  flow: 'control' | 'data';
  typeRef?: TypeReference;
  required: boolean;
  cardinality: 'single' | 'multiple';
}

interface NodeGraphNode {
  id: NodeGraphNodeId;
  descriptorRef: NodeDescriptorRef;
  ports: readonly NodeGraphPort[];
  configuration: NodeConfiguration;
  editor: NodeGraphEditorMetadata;
}

interface NodeGraphEdge {
  id: NodeGraphEdgeId;
  source: NodeGraphPortReference;
  target: NodeGraphPortReference;
}
```

- port id 在 node 内稳定，label 只用于显示；
- control port 不携带任意值，data port 值 immutable/transport-safe；
- editor position/collapse/color 不参与 runtime plan digest；
- descriptor schema 决定允许的 configuration，不保存 executor closure；
- CodeSlot node 只保存 `CodeSlotBinding`；
- 旧 node-level edge 只能通过 descriptor-aware migration 唯一映射到 port，否则 migration fail closed 并生成
  actionable diagnostic；alpha 阶段不长期保留双模型。

## Node descriptor registry

descriptor 至少声明：

- stable kind/executor id 与 implementation compatibility；
- static/dynamic port schema 和 type constraints；
- configuration schema、default canonicalization；
- purity/effect class：`pure`、`temporary-state`、`idempotent-effect`、`mutation-effect`；
- runtime zone：browser/client、server/edge gateway、test-only；
- required capability、permission、fixture/control requirement；
- cancellation/retry/idempotency/timeout contract；
- input/output redaction、value budget、SourceTrace；
- compiler/runtime conformance suite。

registry 是构建期受控贡献，不从 Workspace 下载任意 executor。未知、版本不兼容或 capability 未授权的 descriptor
阻止 compile。

## Type 与 flow planner

planner 输入 exact document revision、descriptor registry digest、Semantic Index/CodeArtifact snapshot、target/runtime
capability 和 control profile。输出 immutable `NodeGraphProgram`。

阶段：

1. node/port/edge identity 与 structural validation；
2. descriptor/configuration resolution；
3. data type assignability、required/cardinality 和 merge policy；
4. control reachability、terminal、error/cancel scope、cycle/loop validation；
5. subgraph/CodeSlot/domain reference resolution；
6. effect/runtime zone/capability/permission planning；
7. lane、parallel/join、state transaction 与 resource budget；
8. SourceTrace table、canonical order/serialization/digest。

禁止隐式行为：按 label 接线、读取“最近输出”、executor 扫描 graph、data edge 自动 cast、多个 input last-write-wins、
由运行完成顺序决定 merge。conversion/loop/delay/merge 都必须是一等 typed node。

## First-party node groups

### Pure/control

start/end、constant、map/shape、compare、branch/switch、merge、assert、structured-log、checkpoint。pure node 对相同输入
必须无副作用且 deterministic；复杂代码通过 pure CodeSlot。

### Temporary state

state read/update/transaction begin/commit/rollback，作用域为 invocation/Scenario attempt。state schema 来自 graph public
contract 或 registered state host；输出 `RuntimeStatePatch`，不等于 Workspace patch。

### Domain effect

- Data query/mutation/retry/page/cancel 使用 `@prodivix/data` dispatch；
- Route navigate/back/params 使用 Router capability；
- Animation play/pause/marker wait 使用 Animation runtime lease；
- Auth/Server function 仅通过 G2 typed gateway 和 permission；
- 每个 result 转为 bounded typed outcome，并保留 domain correlation/SourceTrace。

executor 不得直接 import provider SDK、fetch、Secret resolver 或 Workspace store。

### Async/error/cancel/retry

async wait 节点等待 typed observation；timeout、retry 和 schedule 使用 shared deterministic scheduler。error boundary 接收
sanitized error `{ code, category, retryable, sourceRef, safeMessage }`，不接收 exception/stack/provider payload。

cancel scope 沿 active child/subgraph/domain invocation 传播；terminal/cancel 后 completion 通过 attempt+generation fence 丢弃。
retry 仅允许 descriptor 声明 + domain idempotency contract 同时满足，且每次 attempt 可审计。

### Parallel/join

fork 声明 branches、max concurrency；join 声明 all/any/quorum、cancel-losers、timeout；merge 声明 stable branch order 和
per-port rule。结果排序不按完成时刻，race winner 仅在显式 `first-success` node 中允许并记录选择原因。

## Subgraph 与 graph function

被调用 graph 暴露 stable public contract：typed input/output、errors、effects、capabilities、budgets。caller 保存
document-qualified reference + expected contract digest，不复制子图。

compile 必须检测 missing/revision drift/contract mismatch/dependency cycle/recursion/capability escalation。G3 默认禁止递归；
subgraph call 创建 stack frame、scoped state 和 cancellation child。Export/Remote materialization 按 resolved dependency closure
包含唯一 graph revision。

## CodeSlot node

Binding 包含 CodeSlot/CodeArtifact/symbol reference、expected input/output types、effect/capability/zone、implementation digest。
Code Authoring Environment 负责解析和编译；NodeGraph 只调用受控 executor port。

- stale/missing artifact、type/effect/capability mismatch 阻止 graph compile；
- output 必须 schema-valid、serializable、bounded；
- test-zone 默认无 network/environment/Secret/Workspace write；
- 需要 Data/Server effect 时 CodeSlot 通过传入的 typed gateway，不自行 fetch；
- exception 被 CodeSlot adapter 清洗为 typed error，source span 通过 SourceTrace 引用。

## Runtime state transaction

state host API：begin/read/stage/commit/rollback/snapshot-safe。一个 graph state transaction 的 staged writes 在 commit 前对
外部不可见，失败/cancel 回滚；并发 conflict 按 declared version/CAS 产生 typed error，不用 last-write-wins。

Graph 完成后 state 可继续存在于 application/session scope，Verification fresh attempt 必须重置。若用户要把 runtime result
采纳到作者态，domain-specific planner 展示 impact/diff 并提交 Workspace Transaction；NodeGraph 不提供 generic
`applyPatchToWorkspace`。

## Behavior integration

`@prodivix/behavior` 注册：

- trigger：graph input/event/checkpoint；
- action：invoke/resume/cancel graph，参数按 public contract；
- observation：node enter/exit、port output、checkpoint、graph result/error/cancel；
- target：graph/node/port/checkpoint stable identity；
- impact：graph/descriptor/CodeSlot/domain ref 变化影响引用 Scenario。

`BehaviorScenarioProgram` 引用 compiled graph digest；runtime 在同一 project sandbox/context 执行 graph program，不为每个 node 发
Remote RPC。privileged domain action 仍走 G2 gateway。

## Debug protocol

### Control

`attach`、`setBreakpoints`、`pause`、`stepInto`、`stepOver`、`stepOut`、`continue`、`cancel`、`detach`。每个 command
绑定 execution job、attempt、graph program、generation、lease 和 expected debug sequence；stale/duplicate/expired lease fail
closed。

### Snapshot/event

- current instruction/node/edge/phase；
- bounded call stack、subgraph frame、active branches/scopes；
- declared port values、temporary state safe projection；
- pending task/deadline/cancellation/error；
- Scenario step/barrier 与 SourceTrace correlation；
- breakpoint/replay divergence/cleanup event。

value projector 按 type 允许字段，并限制 depth/count/string/UTF-8 bytes；Secret/credential/sensitive fields 只显示 redacted
marker 和 safe type。UI 不请求任意 expression eval。

### Step semantics

- step into：进入 subgraph/CodeSlot 的下一可观察 instruction；
- step over：执行当前 node 到其 declared outcome；
- step out：运行到当前 subgraph frame 返回；
- mutation effect 后逆向 step 触发 fresh replay，不回滚外部世界；
- pause 不冻结不可控 provider indefinitely，lease/deadline 到期自动 cancel/cleanup。

breakpoint 默认是 attempt/view preference；需要共享 assertion/checkpoint 时通过 NodeGraph/Scenario Command 保存。

## 产品表面

- ports 用 shape/icon/color + accessible label 区分 control/data/type/direction，连接时只展示兼容目标；
- compile error 在 node/port/edge 上显示简洁标记，详细原因进入 Inspector/Issues；
- debug toolbar 使用紧凑 icon，tooltip/shortcut/aria-label 完整；
- graph canvas、call stack、variables、timeline、SourceTrace 可调整布局并复用 IDE bottom panel；
- variables 默认折叠且 redacted，值查看受预算；
- stale revision/result 明确冻结，不把旧 trace 高亮在当前 graph 上。

## 实施阶段

### N0：Current model、migration 与 validator

- typed port/edge/descriptor model；
- strict codec/backend/workspace validation；
- node-level edge migration；
- Semantic Index contribution。

完成条件：可唯一迁移的数据 round-trip；歧义/非法 edge fail closed；无双模型长期分叉。

### N1：Planner 与 pure/state nodes

- type/reachability/cycle/effect/capability planner；
- pure/control/state transaction/parallel/loop nodes；
- deterministic Program/digest。

完成条件：property tests 覆盖 arbitrary DAG、cycle、merge、conflict、budget。

### N2：Domain/async/subgraph/CodeSlot

- Data/Route/Animation/Auth/Server capability nodes；
- async/error/cancel/retry；
- subgraph public contract；
- CodeSlot resolution/execution。

完成条件：domain gateway hard cut、late completion fencing、capability escalation negative tests 通过。

### N3：Behavior 与 debugger

- trigger/action/observation/impact；
- debug lease/control/snapshot/value projector；
- NodeGraph editor/debug panels/Issues/SourceTrace。

完成条件：Scenario 可在 node/checkpoint 断点、step/replay；UI 无 React Flow internal dependency。

### N4：Cross-surface Golden

- Browser/Remote/Export/CI graph Program conformance；
- React/Vue Catalog journey 中真实 graph trigger；
- failure/cancel/retry/reduced-motion correlation。

完成条件：同 input/fixture/control 的 semantic trace/result compatible，runtime state 不写 Workspace。

## 验证证据

计划 Gate：`pnpm run verify:g3:behavior-composition` 中的 NodeGraph suite。

必须覆盖：

- migration unique/ambiguous、codec/validator/backend parity；
- port type/cardinality/required/cast、control/data cycle、reachability；
- parallel/join/merge/loop/budget/state CAS/rollback；
- async/error/timeout/retry/cancel/late completion；
- subgraph missing/drift/cycle/recursion/capability escalation；
- CodeSlot stale/type/effect/output/exception/Secret canary；
- debugger lease/stale command/step semantics/value budgets/redaction；
- Scenario/SourceTrace correlation、Preview/Export/CI and React/Vue parity；
- Remote aggregate execution，断言无 per-node network scheduling。

## 风险与停止条件

- descriptor 或 executor 需要 arbitrary code/config 时，改用 typed CodeSlot，不扩展通用 node。
- 任何 domain node 绕过 owner gateway 时停止合入。
- migration 无法唯一映射旧 edge 时保留诊断并要求用户修复，不猜端口。
- debug projection 可能泄露 Secret 或无界 value 时拒绝展开，不返回 raw object。
- graph 需要跨 worker durable scheduling 时明确移出 G3，保持项目内 aggregate execution。
- runtime patch 被当作 Workspace patch 时停止产品入口并补领域 adoption planner。

## 验收标准

- [ ] typed ports/edges、descriptor、planner、codec/migration 在所有 owner 间一致。
- [ ] async/error/cancel/retry/parallel/subgraph 在 deterministic scheduler 下可重复。
- [ ] domain 与 CodeSlot node capability/permission/effect fail closed。
- [ ] debugger 使用稳定 execution protocol，值 bounded/redacted 且可 SourceTrace。
- [ ] Preview、Export、CI 的 invoked graph semantic trace/result compatible。
- [ ] runtime state/result 不直接写 Workspace，Remote 不按 node 分布式调度。
