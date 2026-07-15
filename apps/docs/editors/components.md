# 组件作者页

组件作者页用于编辑项目级 `pir-component` Definition 及其 Public Contract。Blueprint 中的实例引用这里的定义，而不是复制内部节点。

## 稳定身份

每个 Definition 具有 Workspace 内稳定 identity。重命名显示名称不应改变引用地址；删除、移动或修改契约前，Semantic Index 会提供 references 与 impact。

## Public Contract

公开契约描述实例与定义之间允许跨越的边界：

| 契约    | 作用                         |
| ------- | ---------------------------- |
| Prop    | 调用者向组件提供类型化输入   |
| Event   | 组件向外发布可绑定事件       |
| Slot    | 调用者插入受约束的子结构     |
| Variant | 组件声明有限的视觉或行为组合 |

内部 PIR location、私有 code symbol 和临时作者状态不会自动成为公共 API。

## Instance

Component Instance 保存 Definition 引用与 binding。Renderer、Semantic Index 和 Compiler 都解析同一个引用；不存在只对画布有效的实例格式。

契约发生变化时，先查看受影响实例。安全重命名应生成跨文档 transaction，而不是只改 Definition 一侧的字符串。

## 抽取事务

从 Blueprint 抽取组件包含 definition 创建、subtree relocation、instance replacement、binding 提升和引用更新。整个过程必须原子提交并可撤销。

完整操作见[组件与 Collection 复用](/tutorials/component-collection)。底层契约见[PIR-current](/concepts/pir-current)。
