# PIR Contract v1.3 草案（Normalized UI Graph）

## 状态

- Draft
- 日期：2026-05-02
- 关联：Command History、Intent/Command Envelope、LLM Integration

## 1. 设计目标

v1.3 只解决一个核心问题：让 PIR UI 层从“只适合读和渲染的嵌套树”，升级为“适合长期编辑、PATCH、Undo/Redo、AI command、协作同步的稳定图结构”。

v1.3 不继承旧项目兼容负担。已有 v1.0-v1.2 项目在当前开发阶段直接作废；运行态、保存态、测试 fixture 统一改为 v1.3。

## 2. 核心结构

```ts
type NodeId = string;

type ComponentNodeDataV13 = Omit<ComponentNodeV12, 'children'>;

type UiGraphV13 = {
  version: 1;
  rootId: NodeId;
  nodesById: Record<NodeId, ComponentNodeDataV13>;
  childIdsById: Record<NodeId, NodeId[]>;
  regionsById?: Record<NodeId, Record<string, NodeId[]>>;
};

type PIRDocumentV13 = {
  version: '1.3';
  ui: {
    graph: UiGraphV13;
  };
  metadata?: PIRMetadata;
  logic?: LogicDefinition;
  animation?: PirAnimation;
};
```

## 3. 真相源

1. `ui.graph` 是唯一写入真相源。
2. v1.3 文档禁止保存 `ui.root`。
3. 编辑器、同步、Undo/Redo、AI 写入都必须修改 `ui.graph`。
4. 渲染、代码生成、社区展示需要树时，必须调用 `materializeUiTree(ui.graph)` 得到派生读模型。
5. 后端收到包含 `ui.root` 的 v1.3 文档应拒绝，避免双真相源回流。

## 4. 长期不变量

这些语义进入 v1.3 稳定承诺，未来版本只能新增能力，不应改写：

1. `nodesById` 表示节点身份和节点字段，不表示顺序。
2. `childIdsById` 表示默认 children 区域的有序子节点。
3. `regionsById` 表示具名区域的有序子节点，用于 slot、layout region、fallback、trigger/content 等长期扩展。
4. 同一文档内，一个可渲染节点只能拥有一个结构父级位置。
5. `ui.root` 不属于 v1.3 保存格式。
6. 字段 PATCH path 永远指向 `ui.graph`。
7. 跨文档、路由、数据流、控制流不塞进 UI 图结构，分别交给 workspace、route manifest、logic graph、animation 或独立文档类型。

## 5. PATCH 路径

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

字段 PATCH 继续使用 API-002 的 `CommandEnvelope.forwardOps/reverseOps`。

## 6. Materialize

`materializeUiTree(graph)`：

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
7. `animation.targetNodeId`、`list.emptyNodeId` 等引用必须能解析到节点。
8. v1.3 文档不得包含 `ui.root`。

## 8. AI 规则

LLM 可以读派生 materialized tree 或局部 subtree，但写入必须输出 command/patch。系统流程：

```txt
read materialized tree -> LLM command -> dry-run on ui.graph -> validate -> apply
```

禁止 LLM 返回完整 `ui.root` 直接覆盖文档。

## 9. 旧项目策略

已有 v1.0-v1.2 项目不进入稳定支持范围。开发期采用 hard cutover：

1. 打开旧单 PIR 项目时返回结构化 retired single-PIR 错误。
2. 新建项目必须创建 workspace，并在 workspace document 中保存 v1.3 PIR。
3. 不提供运行态兼容、不提供自动导入、不从 `ui.root` 重建默认编辑态。

不要求 v1.3 -> v1.2 回退导出。

## 10. 错误码建议

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

## 11. 落地顺序

1. 新增 `PIR-v1.3.json`。
2. 实现 `createDefaultPirDocV13` 和 `materializeUiTree`。
3. Validator 只接受 v1.3 graph。
4. Store 删除 `ui.root` 运行态，所有读树场景使用 materialized 派生读模型。
5. 编辑器写入只走 graph command/patch。
6. 后端保存只接受 v1.3，后续让 `forwardOps/reverseOps` 从记录字段变成可执行 PATCH。
