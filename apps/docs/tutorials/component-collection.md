# 组件与 Collection 复用

Prodivix 把复用建模为 Component Definition、Public Contract、Component Instance 和一等 Collection，而不是简单复制一棵节点子树。

## 1. 准备可抽取的子树

在 Blueprint 中组合一个具有明确职责的区域，例如卡片：容器、标题、说明和操作按钮。确保所选根节点包含完整视觉结构，且没有无意依赖外部临时选择状态。

## 2. 发起组件抽取

选择子树并发起“抽取为组件”。抽取预览应展示：

- 将创建的 Component Definition
- 原位置将替换成的 Component Instance
- 需要提升为公开属性、事件或 slot 的边界
- 受影响引用与 relocation 风险

确认后，抽取作为一个原子 Workspace Transaction 提交。任一步校验失败都不能留下“定义已创建但原树未替换”的半成品。

## 3. 定义 Public Contract

进入 Component 作者页，为可复用组件维护公开契约：

- props：调用者可提供的数据
- events：组件向外发布的交互
- slots：调用者可插入的结构区域
- variants：受约束的视觉或行为变体

内部节点与代码符号不自动变成公共 API。契约变更前先查看引用和影响，避免让实例绑定静默失效。

## 4. 创建和复用 Instance

回到 Blueprint，从组件资源中插入该定义的实例。实例保存对 Definition 的类型化引用和自己的 binding，不复制 Definition 的内部 PIR。

修改公开属性后，确认多个实例共享定义，同时保留各自输入。需要改内部结构时，应进入 Component Definition 编辑，而不是拆开某个实例的投影。

## 5. 用 Collection 渲染列表

选择适合作为重复模板的组件或结构，添加 Collection，并配置：

- 数据源引用
- `item` 与可选 `index` 绑定
- 稳定 key
- empty、loading、error 等状态
- 对模板中 props、文本或 slot 的字段绑定

Collection 是 PIR-current 中的一等领域模型。它不依赖画布层临时 `map()` 字符串，也不要求复制 N 份子树。

## 6. 验证语义和导出

打开 Issues，处理缺失 Definition、无效 prop、重复 key、不可解析 source 或越界 binding。随后查看 Export，确认 Component 与 Collection 被编译为目标框架的模块与迭代结构。

## 常见误区

- **把内部字段全部公开**：Public Contract 应保持最小、稳定和有类型。
- **用数组索引当长期 key**：数据可重排时应使用稳定业务标识。
- **在 UI state 中保存裸代码**：复杂变换应绑定 Code Slot/CodeReference。
- **抽取后手工删除旧子树**：应由原子 extraction transaction 完成替换。

概念背景见[Blueprint 编辑器](/editors/blueprint)、[组件作者页](/editors/components)和[PIR-current](/concepts/pir-current)。
