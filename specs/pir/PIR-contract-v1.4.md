# PIR Wire Contract v1.4（Frozen Snapshot）

## 状态

- ContractStatus：Frozen
- ImplementationStatus：Frozen Wire Snapshot（Activated 2026-07-14）
- ProductGateStatus：Not Applicable
- Global Phase：G1 Semantic Hybrid Authoring
- 日期：2026-07-14
- 关联：`specs/decisions/38.blueprint-component-instance-and-collection.md`、`specs/implementation/g1-semantic-component-collection.md`

## 1. 定位

PIR wire v1.4 是 2026-07-14 激活的不可变持久化 snapshot。`specs/pir/PIR-v1.4.json` 记录 wire 形状；任意时刻的当前写出格式只由 `PIR-current.version.json` activation manifest 决定，并同步为 `specs/pir/PIR-current.json`。本文永久记录 v1.4 如何编码 Component Definition、Public Contract、Component Instance、slot outlet 与一等 Collection，不会在后续版本激活时改写为新的领域架构。

v1.4 不是生产领域架构名称。`@prodivix/pir` 只公开无版本号的 `PIRDocument`、`PIRNode`、codec、validator、mutation、projection 与 semantic contribution；Workspace、Renderer、Compiler、Semantic Index 和 Web 只消费这套 current model。数字版本只允许存在于 wire schema、generated wire type、codec、migration 与 persistence 边界。

## 2. Wire snapshot 与稳定领域 API

边界与领域 owner 分为：

1. `specs/pir/PIR-v1.4.json`：不可变 JSON Schema wire snapshot。
2. generated `PIRWire*` types 与 `@prodivix/pir/wire`：严格 wire decode/encode 和 migration 边界，不从默认领域入口泄漏。
3. `@prodivix/pir`：无版本 current factory、normalizer、semantic validator、mutation、projection 与 `createPirSemanticContributionProvider`。
4. `@prodivix/workspace`：稳定的 Workspace document narrowing、Component graph validator、Transaction 与 `createWorkspacePirProjectionPlan`。
5. `@prodivix/pir-react-renderer` 与 `@prodivix/prodivix-compiler`：只消费同一 current projection contract，不读取数字版本。

```ts
// Wire-only shape. The `version` and nested structural version fields are
// removed while decoding into the unversioned domain model.
type PIRWireDocument = {
  version: '1.4';
  metadata?: PIRWireMetadata;
  componentContract?: PIRWireComponentContract;
  ui: {
    graph: PIRWireUiGraph;
  };
  logic?: PIRWireLogicDefinition;
};

type PIRWireUiGraph = {
  version: 1;
  rootId: string;
  nodesById: Record<string, PIRWireNode>;
  childIdsById: Record<string, string[]>;
  regionsById?: Record<string, Record<string, string[]>>;
  order?: { strategy: 'childIdsById' };
};

type PIRDocument = {
  metadata?: PIRMetadata;
  componentContract?: PIRComponentContract;
  ui: { graph: PIRUiGraph };
  logic?: PIRLogicDefinition;
};
```

wire decoder 校验数字版本并迁移后，只返回无版本 `PIRDocument`。`ui.graph` 是唯一作者态 UI 结构真相；`nodesById` 保存稳定节点身份和字段，`childIdsById` 保存默认 children 顺序，`regionsById` 保存 Component slot 与 Collection 状态 region 顺序。派生树、React element、生成代码和预览状态都不进入保存态。

## 3. 四种节点

`PIRNode` 是严格 discriminated union。每个节点都必须声明稳定 `id` 与明确 `kind`，codec 不根据字段组合猜测节点类型。

### 3.1 Element

```ts
type PIRElementNode = {
  id: string;
  kind: 'element';
  type: string;
  text?: PIRValueBinding;
  style?: Record<string, PIRValueBinding>;
  props?: Record<string, PIRValueBinding>;
  data?: PIRDataScope;
  events?: Record<string, PIRTriggerBinding>;
};
```

Element 表示 native、built-in 或 adapter-backed runtime element。`type` 只选择已声明的 runtime projection；代码能力通过 `CodeReference` 与 `TriggerBinding` 接入，不保存任意裸代码字符串。

### 3.2 Component Instance

```ts
type PIRComponentInstanceNode = {
  id: string;
  kind: 'component-instance';
  componentDocumentId: string;
  bindings: {
    props: Record<string, PIRValueBinding>;
    events: Record<string, PIRTriggerBinding>;
    variants: Record<string, string>;
  };
};
```

Instance 以稳定 `componentDocumentId` 引用 Canonical Workspace 中的 `pir-component` Definition。binding 的 key 是 Contract member id；name、path 或当前显示文本都不是引用身份。Instance 不复制 Definition graph，也不允许任意内部 node override。

Instance 的 slot 内容保存在消费方 graph：

```ts
regionsById[instanceNodeId][slotMemberId] = consumerOwnedNodeIds;
```

### 3.3 Component Slot Outlet

```ts
type PIRComponentSlotOutletNode = {
  id: string;
  kind: 'component-slot-outlet';
  slotMemberId: string;
  bindings: {
    props: Record<string, PIRValueBinding>;
  };
};
```

Slot Outlet 只在 Component Definition 内声明投影位置。`slotMemberId` 指向自身 `componentContract.slotsById`；`bindings.props` 的 key 必须是该 slot Contract 的 prop member id，value 在 Definition lexical scope 中求值。`childIdsById[outletNodeId]` 表示 fallback。实例提供对应 named region 时投影消费方内容，否则投影 fallback；投影后的消费方节点通过 `slot-prop` 读取这些值。

### 3.4 Collection

```ts
type PIRCollectionNode = {
  id: string;
  kind: 'collection';
  source: PIRCollectionSourceBinding;
  key: PIRCollectionKeyBinding;
  symbols: {
    itemId: string;
    itemName: string;
    indexId: string;
    indexName: string;
    errorId?: string;
  };
};
```

Collection 是不承诺额外 DOM 的结构节点。它使用显式 source、显式 key 与稳定 lexical symbol identity，不再把列表行为附着到 Element，也不使用隐式 source 或 index fallback。

## 4. Component Contract

`componentContract` 由 `pir-component` document 所有，所属 Component identity 使用外层 Workspace `documentId`，Contract 内不保存第个 component id 或数字领域版本。

```ts
type PIRWireComponentContract = {
  propsById: Record<string, PIRWireComponentPropContract>;
  eventsById: Record<string, PIRWireComponentEventContract>;
  slotsById: Record<string, PIRWireComponentSlotContract>;
  variantAxesById: Record<string, PIRWireComponentVariantContract>;
  partsById?: Record<string, PIRWireComponentPartContract>;
  tokenBindings?: PIRWireComponentTokenContract[];
  accessibility?: PIRWireComponentAccessibilityContract;
};
```

所有公开 member 都有稳定 `id` 和可变显示 `name`。Props 声明类型、required/default 与 capability；Events 声明 payload contract；Slots 声明 children 数量、能力与 slot props；Variants 以稳定 axis/option id 绑定；Parts、Token 与 Accessibility 只暴露 Contract 明确允许的公共表面。

Definition 内部 state、data 与 node 默认不可由 Instance 遍历或覆写。Contract breaking change 必须通过 Workspace Semantic Index 生成 references 与 impact 证据，再由领域 planner 形成可逆 Command 或原子 Transaction。

## 5. Value 与 Trigger Binding

`PIRValueBinding` 明确区分 literal、param、state、data、collection symbol、Definition prop、Definition variant、consumer slot prop 与 code reference。所有跨 scope 引用都使用稳定 id；`path` 只在已解析的根对象内继续取值。

```ts
type PIRValueBinding =
  | { kind: 'literal'; value: PIRJsonValue }
  | { kind: 'param'; paramId: string; path?: string }
  | { kind: 'state'; stateId: string; path?: string }
  | { kind: 'data'; dataId: string; path?: string }
  | { kind: 'collection-symbol'; symbolId: string; path?: string }
  | { kind: 'component-prop'; memberId: string; path?: string }
  | { kind: 'component-variant'; memberId: string; path?: string }
  | { kind: 'slot-prop'; memberId: string; path?: string }
  | { kind: 'code'; reference: CodeReference };

type PIRTriggerBinding =
  | TriggerBinding
  | {
      kind: 'emit-component-event';
      memberId: string;
      payload?: PIRValueBinding;
    };
```

`PIRTriggerBinding` 保留共享 Authoring `TriggerBinding` 对 open URL、route navigation、NodeGraph execution、Animation command 与 CodeSlot call 的表达，并增加 Definition 内的 `emit-component-event`。它按稳定 `memberId` 转发当前 Component Contract 声明的 event；`payload` 存在时在触发节点的 lexical scope 中求值，省略时转发当前 trigger 的 incoming payload。Element event 与 Component Instance event binding 使用同一 union，因此 Instance 收到的事件也可以继续转发为外层 Definition event，而不保存裸回调或复制内部事件实现。Renderer、Compiler 与 Semantic Provider 消费同一 discriminated binding。

## 6. Collection lexical scope 与 named regions

Collection 的结构只保存在具名 region：

```ts
regionsById[collectionNodeId] = {
  item: itemTemplateNodeIds,
  empty: emptyStateNodeIds,
  loading: loadingStateNodeIds,
  error: errorStateNodeIds,
};
```

其中 `item` 是必需模板；`empty`、`loading`、`error` 是显式互斥状态。G1 支持 literal/local binding source 与手动状态预览；预览选择属于 UI 偏好，不进入 PIR 保存态。真实 query lifecycle 在后续 Data/API provider 中驱动同一四状态 contract。

Lexical 规则如下：

1. source 在 Collection 的父 scope 中求值。
2. 每个 item iteration 创建由 `itemId`、`indexId` 标识的 scope；`itemName`、`indexName` 仅用于显示。
3. binding key 在 item scope 中求值；只有 `{ kind: 'index' }` 可以显式选择 index key，非法或重复 binding key 不得回退为 index。
4. error region 在配置 `errorId` 时获得对应 error symbol。
5. 嵌套 Collection 可以读取合法父 scope，并以 stable symbol id 解析遮蔽关系。
6. Instance slot region 保留消费方 lexical scope，包括外层 Collection item/index；Definition body 只读取 Definition 自身 state/data、Contract props 与显式 shared references。
7. `component-prop` 与 `component-variant` 分别只能引用当前 Definition Contract 的 prop 与 variant axis。
8. `slot-prop` 只在 Component Instance 的 named slot region 内可见，并引用目标 Definition 对应 slot Contract 的 prop；普通 Instance children、Definition body 与 Slot Outlet 自身都不获得该 scope。
9. Slot Outlet 的 `bindings.props` value 始终在 Definition scope 中求值，其 key 将值投影到消费方 slot scope，不从消费方 scope 反向读取。

S4 runtime input 使用 `{ state: 'auto' | 'item' | 'empty' | 'loading' | 'error', errorValue? }`，由 `documentId/nodeId/instancePath` 定位同一 Definition 的不同实例。`auto` 读取 source 并按长度选择 item/empty；显式 item 要求非空 array；显式 empty/loading/error 不读取 source。code-backed source/key 通过 `(CodeReference, lexical scope)` resolver 求值。key 只接受 finite number 或 string，并生成类型敏感的 canonical identity；非法或重复 key 阻断整个 Collection projection，不能产生部分 items。显式 index key 发布 warning fact，但不作为任何失败的 fallback。

Renderer 直接消费共享 evaluator；Compiler 消费相同 plan/oracle，并在独立导出源码中生成受 conformance 约束的等价 runtime。四类 length-prefixed projection path helper统一 root、Component Instance、slot 与 Collection item identity；preview state、resolved items、iteration scope 和动态 issue 都是可丢弃投影，不进入保存态。

`regionsById` 是 region children 的唯一保存位置。Collection node、Component Instance 与 Slot Outlet 都不复制 region tree。

## 7. Strict Schema、Codec 与 Validator

### 7.1 Schema

`specs/pir/PIR-v1.4.json` 是不可变 wire snapshot。闭合对象使用 `additionalProperties: false`；只有 `Record<string, T>`、递归 JSON value 与显式 `unknown` 字段保持相应开放性。四类 node、Value/Trigger binding、Contract 与 graph regions 都由明确字段和 discriminant 表达。

### 7.2 Codec

`decodePirDocument` 接收 `unknown`，在 wire boundary 按数字版本选择 strict decoder 与 migration，按字段路径返回完整 decode issue；成功结果只返回无版本 `PIRDocument`。v1.4 decoder 验证 discriminant、必需字段、闭合对象、JSON-only value、CodeReference 与 TriggerBinding。数字版本 dispatch 不向 Workspace 或其他消费者泄漏。

### 7.3 Semantic Validator

validator 在 strict decode 之后验证：

1. `rootId`、map key/node id、所有 child/region target、单一结构父级、无环与无孤儿。
2. Collection 只使用 `item`、`empty`、`loading`、`error` regions，`item` 存在，symbols 稳定且互异，source/key binding 合法。
3. `component-prop`、`component-variant` 与 `emit-component-event` 分别引用当前 Definition Contract 中存在的 prop、variant axis 与 event，并返回稳定字段路径 issue。
4. `slot-prop` 只出现在 Component Instance named slot region 的 lexical scope；提供跨文档 Contract resolver 时，它必须引用目标 Definition 对应 slot 的现有 prop。
5. Component Instance 的 binding key 与 slot region key 使用稳定、非空的 Contract member id；target document 与 member resolution 由 Workspace 层验证。
6. Slot Outlet 只在带本地 Component Contract 的 Definition 内容中使用，指向现有 slot member，且同一 member 只有一个 outlet；`bindings.props` 的每个 key 必须存在于该 slot Contract。
7. Component part target、variant default/option、token target 与 slot cardinality 可解析。
8. 跨文档 component dependency graph 无直接或间接 cycle。
9. scope/reference/type/capability 问题形成可定位 diagnostic，不由 Renderer 或 Compiler 静默修复。

单文档图与 Contract 不变量由 `@prodivix/pir` 验证。持久化边界先把 wire document 解码、迁移为 current model，Canonical Workspace 中的 `pir-page`、`pir-layout` 与 `pir-component` 只保存无版本 `PIRDocument`。`decodeWorkspacePirDocument` 验证 document role、current domain shape 与 semantic invariants，并保留 Workspace、document、path 与字段路径；它不比较数字 PIR 版本。

Workspace Component graph validator 验证 Contract document role、Instance target existence/type/local validity、Contract ownership、member binding、required prop/variant、slot cardinality 与 Component dependency graph。无环图提供 dependency-first topological order，直接循环与间接循环按 SCC 聚合为稳定 issue。impact 与 revision 一致性继续由 Semantic Index 和 Transaction planner 协同验证。

### 7.4 Semantic schema 与稳定 PIR Provider

Semantic schema 已定义 Component scope/symbol、Contract prop/event/slot/variant/part、variant option、slot scope/prop，以及 Collection scope/item/index/error 的 canonical identities。`createPirSemanticContributionProvider` 接收带 document type 与 revision 的 validated current documents，发布 Component/Contract/Instance/Collection 的 scope、symbol、reference 与 dependency facts，并校验 `SemanticSnapshotIdentity`。`component-prop`、`component-variant`、`emit-component-event`、Slot Outlet prop key 与 `slot-prop` 都产生指向对应稳定 Contract symbol 的 reference；consumer-owned slot region 的节点 scope 连接到目标 Component slot scope。

该 Provider 是无版本 current API。未来 wire 版本升级不会改名、复制或更换 WorkspaceSnapshot composition；只有真实 semantic schema 变化才需要扩展 contribution facts。

## 8. 写入与派生规则

所有 PIR-current 作者态写入都修改 normalized graph、Contract 或 Logic 的 canonical 字段，并先规划为可逆 Command 或原子 Transaction。Component extraction、Contract breaking change、Instance target 更新与跨文档 relocation 必须在一个 Workspace Transaction 中完成，再进入 Durable Outbox 与 Atomic Commit。Extraction 的 binding scan 覆盖 Trigger payload 与 Slot Outlet binding；选区内的 `emit-component-event` 按源 event 去重并提升为新 Definition event，源位置的 Component Instance 再把该 event 转发回源 Definition Contract。缺失源 event Contract 时 extraction 必须阻塞。包含 Slot Outlet 的 selection 在具备显式 Contract relocation 语义前保持阻塞，不能产生语义不完整的 Definition。

Renderer、Compiler、Semantic Provider 与 Blueprint 可以建立可丢弃 projection，但不得写回树副本、实例化 Definition 快照、Collection iteration 节点或预览状态。

## 9. 低成本 wire 演进

`PIR-current.version.json` 是唯一 activation manifest。工具从它指向的不可变 `PIR-v<version>.json` 同步 `PIR-current.json`、generated wire types 与后端 current schema；不得扫描目录并自动选择最高版本。

一次普通 wire 升级只包含：

1. 新增下一份不可变 `PIR-v<version>.json` snapshot。
2. 更新 activation manifest 指向该 snapshot。
3. 重新生成或同步 `PIR-current.json`、wire-only generated types 与后端 schema/constants。
4. 增加从上一 wire version 到 current model 的纯函数、确定性、fail-closed migration。
5. 用少量 migration/property fixtures 验证旧 wire 输入进入同一 current model，保存端只写 current wire contract。

若升级只改变 wire 表达，不得修改 Workspace、Renderer、Compiler、Semantic Index 或 Web。若升级增加真实领域语义，只扩展无版本 current model 及确实消费该语义的稳定 API；仍不得创建版本目录、版本化公开类型或并行产品实现。Golden journey 验证产品语义，不承担数字版本切换。

## 10. Owner

1. `@prodivix/pir/wire` 拥有 v1.4 wire decoder/encoder 与 migration registration；`specs/pir/PIR-v1.4.json` 保持不可变。
2. `@prodivix/pir` 拥有无版本 current contract、validator、graph/region mutation、binding evaluator 与 projection helper。
3. `@prodivix/workspace` 拥有跨文档 Transaction、History、revision、Atomic Commit 与 target document validation。
4. `@prodivix/pir-react-renderer` 拥有 React projection，不拥有 Definition、Contract、scope 或 preview 保存态。
5. `@prodivix/prodivix-compiler` 拥有共享模块与 ExportProgram projection，并与 Renderer 复用 binding/Collection semantic contract。
6. `@prodivix/authoring` 组合 owner contribution；`@prodivix/diagnostics` 统一 Issues lifecycle 与 presentation。
