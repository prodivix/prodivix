# NodeGraph 编辑器

NodeGraph 用于表达可执行的数据流、控制流和行为组合。它拥有独立的 `pir-graph` 文档，不嵌入 PIR UI 节点，也不将 React Flow 的界面状态作为持久化数据。

## 文档与画布

节点、边、端口语义、图的元数据与代码引用由 `@prodivix/nodegraph` 的 current contract 负责解码和校验。Web 编辑器仅负责图形交互与浏览器 adapter。

创建、连接、移动或删除节点时，编辑操作会转换为 NodeGraph/Workspace Command。画布位置属于可持久化的编辑信息，但 React Flow 实例对象不会进入 Workspace。

## 节点执行

NodeGraph kernel 提供与传输方式无关的 executor、确定性 trace、扩展 registry 和 same-context ExecutionProvider。无论是编辑器中的 Run 操作还是 Blueprint 的 `run-nodegraph` trigger，都会基于精确的 Canonical Workspace revision 创建 `ExecutionRequest`，再由同一套 Job/Session 协议统一管理状态、日志、诊断、SourceTrace、取消、timeout 和结果。

NodeGraph 编辑器提供 Run/Stop，并复用共享 Execution Center 中的 All/Errors 视图、事件保留和重启控制。默认的 `start/process/switch/log/end` registry 支持确定性执行；未注册的节点会安全失败（fail closed）并报告 `NGR-1001`，不会被 Web UI 临时执行。需要网络、Secret 或服务端能力的节点，必须选用具备相应 capability 和 runtime zone 的 provider 来执行。

旧的 browser action 直接调用协议已经移除，`@prodivix/runtime-browser` 不再承担 NodeGraph 执行语义。Remote Isolated provider、完整的数据流/异步/错误/断点语义与 CodeSlot executor 将在 G2/G3 阶段逐步完善。

## 自定义 Executor

需要自定义代码的节点通过 executor/transform Code Slot 绑定 Workspace code artifact。Slot 声明输入、输出、能力和诊断目标；NodeGraph 文档仅保存类型化的 `CodeReference`。

## Revision conflict

当本地与远端基于同一 base revision 分别修改了同一张图时，冲突视图会按语义实体展示节点、边和字段的差异，而非比较 React Flow DOM。颜色约定为：绿色表示新增、红色表示删除、黄色表示本地冲突、紫色表示远端冲突。

更多说明见[Issues、History 与冲突](/editors/issues-history-conflicts)和[Change 与 Sync](/concepts/change-and-sync)。
