# PIR Diagnostics 编码规范（PIR）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/pir/pir-contract-v1.3.md`
  - `specs/decisions/10.pir-contract-validation.md`
  - `specs/decisions/15.pir-data-scope-and-list-render.md`

## 1. 范围

`PIR-xxxx` 覆盖 PIR 文档形状、UI graph 语义、ValueRef 解析、materialize 中间层和 PIR 运行前校验。

不覆盖：

1. Workspace 文档保存和同步冲突，使用 `WKS-xxxx`。
2. 编辑器拖拽、选择、Inspector 交互，使用 `EDT-xxxx`。
3. 代码生成阶段策略失败，使用 `GEN-xxxx`。

## 2. 阶段

```ts
type PirDiagnosticStage =
  'schema' | 'graph' | 'value-ref' | 'materialize' | 'runtime';
```

## 3. 编码分段

| 段位       | 阶段          | 说明                                      |
| ---------- | ------------- | ----------------------------------------- |
| `PIR-10xx` | `schema`      | 文档形状、版本、禁止字段、必需字段        |
| `PIR-20xx` | `graph`       | root、节点 key、父子关系、环、孤儿节点    |
| `PIR-30xx` | `value-ref`   | `$param`、`$state`、`$data`、`$item` 解析 |
| `PIR-40xx` | `materialize` | 临时树生成、region 展开、重复父级         |
| `PIR-90xx` | `runtime`     | PIR 运行时未知异常                        |

## 4. 已占用码位

### `PIR-1001` 禁止保存树形 UI 根节点

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: 保存态 PIR 文档中出现 `ui.root`
- User action: 使用新版编辑器重新保存，或执行导入迁移
- Developer notes: 写入链路必须输出 `ui.graph`；树形结构只能作为 materialize 后的临时中间层

### `PIR-1002` UI graph 缺失

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: PIR 文档缺少 `ui.graph`
- User action: 检查导入文件是否为支持的 PIR 文档
- Developer notes: 新建模板、导入器和后端自愈逻辑必须生成 graph

### `PIR-1003` 节点字段非法

- Severity: `error`
- Stage: `schema`
- Retryable: false
- Trigger: `nodesById` 中的节点缺少合法 `id` 或 `type`
- User action: 重新导入或修复该 PIR 文档
- Developer notes: 组件创建、导入和外部库组件注册必须提供稳定节点 ID 与类型

### `PIR-2001` 根节点不存在

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: `ui.graph.rootId` 无法在 `nodesById` 中找到
- User action: 回到最近一次有效保存，或执行 graph repair
- Developer notes: 检查删除节点、路由切换、patch 应用和导入链路

### `PIR-2002` 节点 key 与节点 ID 不一致

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: `nodesById` 的 key 与节点内部 `id` 不一致
- User action: 重新导入或修复该 PIR 文档
- Developer notes: 节点重命名必须同步更新索引 key 与引用关系

### `PIR-2003` 子节点引用不存在

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: `childIdsById` 或 `regionsById` 引用了不存在的节点 ID
- User action: 回退最近一次结构编辑，或执行 graph repair
- Developer notes: 删除节点时必须清理父级、region、animation target 与 list empty node 引用

### `PIR-2004` UI graph 存在环

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: 从 `rootId` 遍历时发现环形父子关系
- User action: 撤销最近一次移动或导入操作
- Developer notes: 拖拽移动、AI patch 和批量导入必须阻止祖先节点移动到自身后代内

### `PIR-2005` 节点存在多个结构父级

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: 同一节点同时出现在多个 `childIdsById` 或 `regionsById` 位置
- User action: 撤销最近一次移动或执行 graph repair
- Developer notes: 同一文档内，一个可渲染节点只能拥有一个结构父级位置

### `PIR-2006` 存在未受控孤儿节点

- Severity: `warning`
- Stage: `graph`
- Retryable: false
- Trigger: `nodesById` 中存在无法从 `rootId` 到达的节点，且未标记为受控扩展
- User action: 删除无用节点或把节点重新接入页面
- Developer notes: 临时剪贴板、模板缓存等特殊场景必须使用受控扩展标记

### `PIR-2007` 跨结构节点引用不存在

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: animation target、list empty node 或其他节点引用无法解析到 `nodesById`
- User action: 重新选择目标节点，或恢复被删除的节点
- Developer notes: 删除节点时必须清理 animation、list、event 和扩展协议中的节点引用

### `PIR-2011` 组件组合规则不满足

- Severity: `error`
- Stage: `graph`
- Retryable: false
- Trigger: 插入、拖拽、复制、移动或删除导致插件声明的 parent/slot/sequence 组合约束不成立
- User action: 保留 compound component 所需的 parent 与 primitive 顺序，或把节点移动到允许的位置
- Developer notes: 规则必须来自当前 owner generation 的 composition contribution 投影；编辑器不得按具体组件库或 runtime type prefix 硬编码结构

### `PIR-3001` ValueRef 路径无法解析

- Severity: `warning`
- Stage: `value-ref`
- Retryable: true
- Trigger: `$param`、`$state`、`$data` 或 `$item` 指向不存在的路径
- User action: 检查绑定的数据源、参数名或列表作用域
- Developer notes: 渲染器与代码生成器应共享 ValueRef 解析语义

### `PIR-3002` 数据作用域配置非法

- Severity: `warning`
- Stage: `value-ref`
- Retryable: false
- Trigger: `data.source`、`data.pick` 或 `data.extend` 不满足 PIR 数据作用域契约
- User action: 检查数据源、pick 路径和扩展字段
- Developer notes: Inspector 字段、导入器和 AI patch 应共享数据作用域校验

### `PIR-3010` 列表渲染配置非法

- Severity: `warning`
- Stage: `value-ref`
- Retryable: false
- Trigger: `list.source`、`itemAs`、`indexAs`、`keyBy`、`arrayField` 或 `emptyNodeId` 不满足列表渲染契约
- User action: 检查列表数据源、别名、key 字段和空状态节点
- Developer notes: 列表渲染 runtime 与 generator 应共享同一诊断语义

### `PIR-4001` Materialize 失败

- Severity: `error`
- Stage: `materialize`
- Retryable: false
- Trigger: `materializeUiTree` 遇到缺失节点、环或重复父级，无法生成完整临时树
- User action: 先修复 PIR graph 诊断，再重新预览或导出
- Developer notes: 渲染与代码生成不得绕过 materialize 诊断直接消费不完整树

### `PIR-9001` PIR 未知异常

- Severity: `error`
- Stage: `runtime`
- Retryable: true
- Trigger: PIR 校验、解析、materialize 或运行时出现未分类异常
- User action: 重试操作；若复现，携带错误码和项目上下文上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `PIR-2010`：region 名称非法或无法识别。
2. `PIR-3020`：数据作用域 `pick` 路径类型不匹配。
3. `PIR-4010`：具名 region materialize 降级。
