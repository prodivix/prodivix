# PIR 语法规范

本文档描述 Prodivix 当前使用的 PIR v1.3 语法。它不再是树形保存格式，而是以 `ui.graph` 作为唯一写入真相源。

## 版本

- 规范版本：`1.3`
- 权威 schema：`specs/pir/PIR-v1.3.json`
- 契约说明：`specs/pir/pir-contract-v1.3.md`

## 顶层结构

```json
{
  "version": "1.3",
  "metadata": {
    "name": "HomePage",
    "description": "应用首页"
  },
  "ui": {
    "graph": {
      "version": 1,
      "rootId": "root",
      "nodesById": {},
      "childIdsById": {},
      "regionsById": {}
    }
  },
  "logic": {
    "props": {},
    "state": {},
    "graphs": []
  },
  "animation": {
    "version": 1,
    "timelines": [],
    "svgFilters": []
  }
}
```

## 必需字段

| 字段                    | 类型   | 说明               |
| ----------------------- | ------ | ------------------ |
| `version`               | string | 固定为 `1.3`       |
| `ui`                    | object | UI 容器            |
| `ui.graph`              | object | 规范化 UI 图       |
| `ui.graph.version`      | number | 固定为 `1`         |
| `ui.graph.rootId`       | string | 根节点 ID          |
| `ui.graph.nodesById`    | object | 节点字典           |
| `ui.graph.childIdsById` | object | 默认 children 顺序 |

## 可选字段

| 字段                   | 类型   | 说明       |
| ---------------------- | ------ | ---------- |
| `metadata`             | object | 元信息     |
| `logic`                | object | 逻辑层定义 |
| `animation`            | object | 动画层定义 |
| `ui.graph.regionsById` | object | 具名区域   |

## 节点结构

`nodesById` 中的每个节点至少包含：

```json
{
  "id": "root",
  "type": "div"
}
```

支持的常见字段：

- `text`
- `style`
- `props`
- `data`
- `list`
- `events`

### 数据引用

PIR v1.3 使用显式引用对象，不再把引用值混写成旧式树结构。

```json
{ "$param": "title" }
{ "$state": "user.name" }
{ "$data": "items.0.label" }
{ "$item": "item.name" }
{ "$index": true }
```

## 结构语义

- `nodesById` 只表示节点身份和节点字段，不表示顺序。
- `childIdsById` 表示默认 children 区域的顺序。
- `regionsById` 表示 slot、layout region、fallback 等具名区域。
- 任何需要树的读取场景，都应先 materialize，而不是把树重新保存回文档。

## 验证规则

PIR validator 至少需要检查：

1. `rootId` 必须存在于 `nodesById`。
2. `nodesById` 的 key 必须与节点内部 `id` 一致。
3. `childIdsById` 和 `regionsById` 引用的节点都必须存在。
4. 结构中不能有环。
5. 同一节点不能出现多个结构父级。
6. `ui.root` 不允许出现在保存态。

## 兼容说明

v1.3 只定义当前保存格式，不再保留旧树形保存形态的兼容语义。

## 下一步

- [错误码与诊断](/reference/diagnostic-codes) - 查看 PIR 相关错误码
