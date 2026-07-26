# 组件与 Collection 复用

Prodivix 把复用建模为 Component Definition、Public Contract、Component Instance 和一等 Collection，而不是简单地复制一棵节点子树。

## 1. 准备可抽取的子树

在 Blueprint 中组合一个具有明确职责的区域，例如卡片：容器、标题、说明和操作按钮。确保所选根节点包含完整视觉结构，且不会无意间依赖外部的临时选择状态。

## 2. 发起组件抽取

选择子树并发起“抽取为组件”。抽取预览应展示：

- 将创建的 Component Definition
- 原位置将替换成的 Component Instance
- 需要提升为公开属性、事件或 slot 的边界
- 受影响引用与 relocation 风险

确认后，抽取作为一个原子 Workspace Transaction 提交。任何一步校验失败都不能留下“定义已创建但原树未替换”的半成品。

## 3. 定义 Public Contract

进入 Component 作者页，为可复用组件维护公开契约：

- props：调用者可提供的数据
- events：组件向外发布的交互
- slots：调用者可插入的结构区域
- variants：受约束的视觉或行为变体

内部节点与代码符号不自动变成公共 API。变更契约前应先查看引用和影响，避免让实例绑定静默失效。

## 4. 创建和复用 Instance

回到 Blueprint，从组件资源中插入该定义的实例。实例保存对 Definition 的类型化引用和自己的 binding，不复制 Definition 的内部 PIR。

修改公开属性后，验证多个实例是否共享同一定义，同时各自保留独立的输入。需要修改内部结构时，应进入 Component Definition 编辑，而不是拆开某个实例的投影。

## 5. 用 Collection 渲染列表

选择适合作为重复模板的组件或结构，添加 Collection，并配置：

- literal、局部 Symbol 或 Data operation 数据源
- `item` 与可选 `index` 绑定
- 稳定 key
- empty、loading、error 等状态
- 对模板中 props、文本或 slot 的字段绑定

Collection 是 PIR-current 中的一等领域模型。它不依赖画布层临时 `map()` 字符串，也不要求复制 N 份子树。

选择 Data operation 时，Inspector 从当前 Workspace Semantic Index 列出 query。一次原子修改会同时保存 operation reference、局部 `dataId`、可选结果路径和 Collection lifecycle。运行状态固定映射到 loading、item、empty、error 区域；success 不会因为结果恰好是空数组而被误判为 empty。当 Data runtime 尚未提供匹配的 snapshot 时，Preview/Export 会明确阻断，而不是静默渲染 `undefined`。

## 6. 验证语义和导出

打开 Issues，处理缺失 Definition、无效 prop、重复 key、不可解析 source 或越界 binding。随后查看 Export，确认 Component 与 Collection 已被正确编译为目标框架的模块与迭代结构。

## 常见误区

- **把内部字段全部公开**：Public Contract 应保持精简、稳定，且有明确的类型约束。
- **用数组索引当长期 key**：当数据可能重排时，应使用稳定的业务标识。
- **在 UI state 中保存裸代码**：复杂的变换逻辑应绑定 Code Slot/CodeReference。
- **抽取后手工删除旧子树**：替换应由原子 extraction transaction 完成。

概念背景见[Blueprint 编辑器](/editors/blueprint)、[组件作者页](/editors/components)和[PIR-current](/concepts/pir-current)。
