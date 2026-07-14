# PIR Wire Contract v1.3（Frozen Snapshot）

## 状态

- ContractStatus：Frozen
- ImplementationStatus：Historical Wire Snapshot
- ProductGateStatus：Not Applicable
- Global Phase：G0 Historical Contract
- 日期：2026-05-02
- 关联：Command History、Domain Command/Transaction、LLM Integration

## 1. 定位

PIR wire v1.3 是已经冻结的历史持久化格式。`specs/pir/PIR-v1.3.json` 是其不可变 schema snapshot；本文只记录该 wire 格式曾编码的 normalized UI graph 语义，不定义当前生产领域 API。

当前 Workspace、Renderer、Compiler、Semantic Index 与 Web 作者表面只消费无版本号的 `PIR-current` 领域模型。读取 v1.3 数据时，wire boundary 严格解码并通过确定性 migration 进入同一 current model；不得恢复 v1.3 专属 Renderer、Compiler、Workspace 或作者界面。

## 2. 核心结构

```ts
type NodeId = string;

type PIRWireNodeV13 = Omit<LegacyComponentNode, 'children'>;

type PIRWireUiGraphV13 = {
  version: 1;
  rootId: NodeId;
  nodesById: Record<NodeId, PIRWireNodeV13>;
  childIdsById: Record<NodeId, NodeId[]>;
  regionsById?: Record<NodeId, Record<string, NodeId[]>>;
};

type PIRWireDocumentV13 = {
  version: '1.3';
  ui: {
    graph: PIRWireUiGraphV13;
  };
  metadata?: PIRMetadata;
  logic?: LogicDefinition;
  // Historical wire field only. Current Animation is a standalone
  // Workspace `pir-animation` document.
  animation?: PirAnimation;
};
```

`version` 与 `ui.graph.version` 都属于 wire 表达。它们不会进入当前 `PIRDocument` / `PIRUiGraph` 领域对象，也不得成为下游行为分派条件。

## 3. 真相源

1. 在该 frozen snapshot 中，`ui.graph` 是唯一 UI 结构写入真相源。
2. v1.3 wire document 禁止保存 `ui.root`。
3. 历史数据迁移必须保留稳定节点身份、默认 children 顺序与具名 region。
4. 当前编辑、同步、Undo/Redo、渲染和代码生成只处理 migration 后的无版本 current model。
5. wire decoder 收到包含 `ui.root` 的 v1.3 文档应拒绝，避免双真相源回流。

## 4. 长期不变量

以下 normalized graph 语义已经由 current domain 继承；它们不要求生产消费者保留 v1.3 类型：

1. `nodesById` 表示节点身份和节点字段，不表示顺序。
2. `childIdsById` 表示默认 children 区域的有序子节点。
3. `regionsById` 表示具名区域的有序子节点，用于 slot、layout region、fallback、trigger/content 等长期扩展。
4. 同一文档内，一个可渲染节点只能拥有一个结构父级位置。
5. `ui.root` 不属于 v1.3 保存格式。
6. 字段级 Command operation path 始终指向 `ui.graph`。
7. 跨文档、路由、NodeGraph 与 Animation 不塞进 UI 图结构，分别交给 Workspace、Route Manifest、`pir-graph` 与 `pir-animation` owner。

## 5. Command operation paths

推荐：

```txt
/ui/graph/nodesById/{nodeId}/props/{propName}
/ui/graph/nodesById/{nodeId}/style/{styleName}
/ui/graph/childIdsById/{parentNodeId}
/ui/graph/regionsById/{parentNodeId}/{regionName}
```

禁止出现：

```txt
/ui/root/children/0/props/text
```

这些 path 仅用于解释历史 wire graph。当前字段级修改由无版本 current domain 的 `WorkspaceCommandEnvelope.forwardOps/reverseOps` 表达，Patch operation 只存在于 Command 内部。

## 6. Materialize

历史 v1.3 graph 迁移到 current model 后，临时树投影遵守：

1. 从 `rootId` 开始。
2. 按 `childIdsById[parentId]` 生成 `children`。
3. 按 `regionsById[parentId]` 生成稳定扩展字段，例如 `x-prodivix.regions`。
4. 将 `nodesById[nodeId]` 拷贝为树节点。
5. 遇到缺失节点、环、重复父级时返回诊断，不生成不完整树。

## 7. Validator 必须校验

JSON Schema 负责形状校验；PIR validator 负责图语义校验：

1. `rootId` 存在于 `nodesById`。
2. `nodesById` 的 key 等于节点内部 `id`。
3. `childIdsById` 和 `regionsById` 引用的所有 id 都存在。
4. 不存在环。
5. 不存在重复父级位置。
6. 默认不允许孤儿节点，除非使用受控扩展标记。
7. 历史 list 与 extension protocol 中的节点引用必须能解析到 `nodesById`；历史内嵌 Animation 只在 migration 边界读取，不作为当前 PIR 语义继续持有。
8. v1.3 文档不得包含 `ui.root`。

## 8. AI 规则

LLM 可以读派生 materialized tree 或局部 subtree，并输出由领域 planner 解释的 Action Proposal。系统流程：

```txt
read materialized tree -> Action Proposal -> domain planner -> Command / Transaction -> dry-run -> validate -> apply
```

禁止 LLM 返回完整 `ui.root` 直接覆盖文档。

## 9. 错误码

```txt
PIR-1001  保存态包含 ui.root
PIR-1002  文档版本或 ui.graph 缺失
PIR-1003  节点必需字段非法
PIR-2001  rootId 不存在于 nodesById
PIR-2002  nodesById key 与节点 id 不一致
PIR-2003  childIdsById / regionsById 引用不存在节点
PIR-2004  graph 存在环
PIR-2005  节点存在多个结构父级
PIR-2006  孤儿节点
PIR-2007  跨域节点引用不存在
PIR-3002  data 绑定结构非法
PIR-3010  list 渲染结构非法
PIR-4001  PIR materialize 或校验失败
```

## 10. Wire owner 与演进规则

1. `specs/pir/PIR-v1.3.json` 是不可变 wire snapshot，不随 current 领域能力继续修改。
2. `@prodivix/pir/wire` 在需要读取历史数据时拥有 v1.3 strict decoder 与到 current 的确定性 migration。
3. `@prodivix/pir` 默认入口只公开无版本 `PIRDocument`、factory、validator、mutation、projection 与 semantic contribution。
4. Workspace、Renderer、Compiler、Semantic Index 与 Web 不导入 v1.3 wire type，也不因 v1.3 数据存在而保留并行实现。
