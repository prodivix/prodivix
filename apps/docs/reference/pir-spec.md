# PIR 语法规范

本文描述 `pir-page`、`pir-layout` 与 `pir-component` Workspace documents 使用的无版本 `PIR-current` 领域模型。在单个 PIR 文档内部，`ui.graph` 是 UI 结构的规范写态。

项目级唯一作者态真相是 **Canonical Workspace VFS**。它在同一个 `WorkspaceSnapshot` 中持有 Route Manifest、PIR、独立 NodeGraph / Animation documents、Code Documents、Assets 与 Project Config。

## Workspace 文档边界

| Workspace document type                     | 内容与 owner                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `pir-page` / `pir-layout` / `pir-component` | 无版本 `PIRDocument`；graph、binding、Component、Collection、projection 与 validator 由 `@prodivix/pir` 持有 |
| `pir-graph`                                 | 独立 NodeGraph document，由 `@prodivix/nodegraph` 持有领域 contract                                          |
| `pir-animation`                             | 独立 Animation document，由 `@prodivix/animation` 持有领域 contract                                          |
| `code` / `asset` / `project-config`         | 与 PIR 并列存在于 Workspace VFS，不嵌入 `ui.graph`                                                           |

PIR 可以通过类型化 Trigger / Reference 指向 NodeGraph、Animation 与 CodeArtifact，但不保存这些领域的文档镜像。`pir-animation` 使用 document-qualified target 指向 PIR document 与 node；Animation timeline、track 和 evaluator 状态不进入 PIR。

## Current model 与 wire 版本

- 当前领域契约：无版本号的 `@prodivix/pir` `PIRDocument` / `PIRNode`
- 当前写出格式：`specs/pir/PIR-current.version.json` 选择的 wire snapshot
- 当前权威 wire schema：`specs/pir/PIR-current.json`
- 不可变 wire snapshots：`specs/pir/PIR-v<version>.json`
- 低成本演进规则：`specs/decisions/39.pir-current-evolution.md`

数字 PIR 版本只属于 wire schema、generated wire types、codec、migration 与 persistence 边界。读取时，wire decoder 严格校验输入并通过确定性 migration 返回同一 `PIRDocument`；写出时，encoder 只生成 current wire contract。Workspace、Renderer、Compiler、Semantic Index 与 Web 不比较数字版本，也不随版本升级改名或复制。

普通 wire 升级只新增下一份冻结 snapshot、更新 activation manifest、同步 generated wire contracts，并增加一段确定性 migration。若领域语义没有变化，所有生产消费者都保持不变。

## Canonical 领域结构

Canonical Workspace 中的 PIR document 不包含 wire `version`：

```json
{
  "metadata": {
    "name": "HomePage",
    "description": "应用首页"
  },
  "ui": {
    "graph": {
      "rootId": "root",
      "nodesById": {
        "root": {
          "id": "root",
          "kind": "element",
          "type": "container",
          "props": {
            "title": { "kind": "literal", "value": "Home" }
          }
        }
      },
      "childIdsById": {
        "root": []
      },
      "regionsById": {}
    }
  }
}
```

wire encoder 会在持久化边界注入 manifest 选中的顶层 `version`，以及 schema 要求的嵌套结构版本。generated `PIRWire*` types 仅供该边界使用，不是 Workspace document content 或公共作者 API。

## 顶层字段

| 字段                | 类型   | 说明                                                         |
| ------------------- | ------ | ------------------------------------------------------------ |
| `ui`                | object | UI 领域容器                                                  |
| `ui.graph`          | object | normalized UI graph，唯一 UI 结构写态                        |
| `metadata`          | object | 可选文档元信息                                               |
| `componentContract` | object | `pir-component` 的可选 Public Contract                       |
| `logic`             | object | 可选的文档本地 props / state 声明，不拥有独立 NodeGraph 文档 |

## Graph 字段

| 字段                    | 类型   | 说明                               |
| ----------------------- | ------ | ---------------------------------- |
| `ui.graph.rootId`       | string | 根节点稳定 ID                      |
| `ui.graph.nodesById`    | object | 节点字典，不表达结构顺序           |
| `ui.graph.childIdsById` | object | 默认 children region 的有序节点 ID |
| `ui.graph.regionsById`  | object | 可选具名 region 的有序节点 ID      |
| `ui.graph.order`        | object | 可选的显式顺序策略                 |

## 节点类型

`PIRNode` 是以 `kind` 判别的严格 union：

- `element`：native、built-in 或 adapter-backed runtime element。
- `component-instance`：通过稳定 `componentDocumentId` 引用 `pir-component` Definition。
- `component-slot-outlet`：在 Definition 中声明 Contract slot 的投影位置。
- `collection`：声明 source、typed key、稳定 item/index/error symbols 与状态 regions，不承诺额外 DOM。

节点必须拥有稳定 `id`。名称、path、React element、实例化 Definition 副本、Collection iteration 节点和预览状态都不是节点身份，也不进入保存态。

## Binding 与作用域

PIR 使用显式 discriminated binding 表示数据来源：

```json
{ "kind": "literal", "value": "Hello" }
{ "kind": "param", "paramId": "route-title" }
{ "kind": "state", "stateId": "current-user", "path": "name" }
{ "kind": "data", "dataId": "products", "path": "items" }
{ "kind": "collection-symbol", "symbolId": "product-item", "path": "name" }
{ "kind": "component-prop", "memberId": "label" }
{ "kind": "slot-prop", "memberId": "tone" }
```

跨 scope 引用使用稳定 member / symbol identity；显示名称只用于作者体验。`CodeReference` 连接 Code Authoring Environment，PIR 不保存任意裸代码字符串。

## 结构与复用语义

- `nodesById` 只表示节点身份和字段，不表示顺序。
- `childIdsById` 表示默认 children region 的顺序。
- `regionsById` 表示 Component slot、Collection item/empty/loading/error 与其他具名 region。
- Component Instance 不复制 Definition graph，也不允许任意内部 node override。
- Collection 的 item/index/error lexical scope 由 stable symbol id 解析。
- Renderer 与 Compiler 消费同一 revision-bound `WorkspacePirProjectionPlan`，不从保存态重建另一份领域模型。
- PIR document 通过 Command / Transaction、History、Durable Outbox 与 Atomic Commit 写入 Canonical Workspace；编辑器不保存第二份 PIR 真相。

## 验证规则

PIR validator 至少检查：

1. `rootId` 存在于 `nodesById`。
2. `nodesById` 的 key 与节点内部 `id` 一致。
3. child / region 引用的节点全部存在。
4. 结构无环、无重复父级、无孤儿。
5. Component Contract member、Instance binding 与 slot outlet 可以解析。
6. Collection source、key、symbols、lexical scope 与状态 region 合法。
7. code、route、NodeGraph 与 Animation 引用保持类型化，并由对应 owner 与 Workspace Semantic Index 完成跨文档 resolution。

## Owner

`@prodivix/pir` 拥有 current 领域模型、factory、normalization、mutation、projection 与 semantic validation；`@prodivix/pir/wire` 拥有版本 dispatch、strict wire codec 与 migration。`@prodivix/workspace` 负责编排跨文档 Transaction 与 current projection；`@prodivix/pir-react-renderer` 和 `@prodivix/prodivix-compiler` 只消费稳定 projection contract；`apps/web` 通过这些无版本 package API 组合 Blueprint 与 Preview。

[查看 PIR 错误码与诊断](/reference/diagnostic-codes)。
