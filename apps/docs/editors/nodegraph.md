# NodeGraph 编辑器

NodeGraph 用于表达可执行的数据流、控制流和行为组合。它拥有独立的 `pir-graph` 文档，不嵌进 PIR UI 节点，也不由 React Flow 的界面 state 充当保存态。

## 文档与画布

节点、边、端口语义、图元数据与代码引用由 `@prodivix/nodegraph` 的 current contract 解码和校验。Web 编辑器只负责图形交互与浏览器 adapter。

创建、连接、移动或删除节点时，作者操作会转换成 NodeGraph/Workspace Command。画布位置属于可持久化作者信息，但 React Flow 实例对象不进入 Workspace。

## 节点执行

NodeGraph kernel 提供 transport-neutral executor、确定性 trace 与扩展 registry。浏览器执行能力由 `@prodivix/runtime-browser` 适配，不能把 DOM 或网络副作用硬编码进领域 package。

具有副作用、网络或秘密依赖的生产执行需要通过 ExecutionProvider/Job 和明确 runtime zone 建模。完整远程 runner 尚未交付。

## 自定义 Executor

需要代码的节点通过 executor/transform Code Slot 绑定 Workspace code artifact。Slot 声明输入、输出、能力和诊断目标；NodeGraph 文档只保存类型化 `CodeReference`。

## Revision conflict

当本地和远端基于同一 base 修改图时，冲突视图按语义实体展示节点、边和字段差异，而不是比较 React Flow DOM。颜色约定为：绿色新增、红色删除、黄色本地冲突、紫色远端冲突。

更多说明见[Issues、History 与冲突](/editors/issues-history-conflicts)和[Change 与 Sync](/concepts/change-and-sync)。
