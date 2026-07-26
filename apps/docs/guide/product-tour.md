# 产品导览

一个 Prodivix 项目由多个编辑界面协同编辑，但它们读取的是同一个 Workspace revision。左侧项目导航用于切换界面，顶部状态栏可查看保存状态、诊断信息和当前选中项。

## 主要表面

| 表面       | 用途                                      | 当前状态                 |
| ---------- | ----------------------------------------- | ------------------------ |
| 项目首页   | 查看项目入口与最近文档                    | 可用                     |
| Blueprint  | 编辑页面、布局、组件和 Collection         | 可用                     |
| NodeGraph  | 编辑行为与数据流图                        | 基础能力可用             |
| Animation  | 编辑时间轴与动画文档                      | 基础能力可用             |
| Component  | 编辑组件定义与公开契约                    | 可用                     |
| Code       | 编辑共享脚本、样式、Shader 与 Adapter     | 可用                     |
| Resources  | 管理资源、依赖、Token、导入代码与项目文件 | 可用                     |
| Issues     | 汇总 Workspace、PIR、Code、Graph 等诊断   | 可用                     |
| Export     | 检查并生成生产导出计划                    | React/Vite target 已验证 |
| Test       | 运行当前导出工程并查看用例报告与日志      | Browser 纵切可用         |
| Deployment | 未来部署工作流入口                        | 尚未完成                 |

## Blueprint 的工作区

Blueprint 通常包含资源/组件入口、组件树、画布和 Inspector。组件树呈现作者结构，画布是 PIR 的 React 投影，Inspector 用于编辑所选目标的稳定语义属性。切换节点不会产生另一份页面副本。

在组件树中隐藏节点只是一种编辑视图偏好，便于检查遮挡和嵌套关系，但预览与导出仍按真实项目状态渲染。

## 一处选择，多处定位

Workspace Semantic Index 为 Route、PIR、Component、Collection、NodeGraph、Animation、Code、Token 和 Asset 建立统一地址与引用图。因此 Issues、Inspector、Resources 和代码编辑器可以跳转到同一个语义目标，同时仍受各自 scope 和类型约束。

## 保存与历史

视觉编辑和代码编辑最终都会生成可逆 Command 或原子 Transaction。变更先进入本地 History，再作为 exact `WorkspaceOperation` 写入 Durable Outbox，最后通过 Atomic Commit 持久化。保存失败时不会悄悄产生第二份项目真相。

常用操作：

- `Ctrl/Cmd+Z`：撤销
- `Ctrl/Cmd+Shift+Z`：重做
- Windows/Linux 也可用 `Ctrl+Y` 重做
- `Alt+0`：Issues
- `F2`：对支持的符号发起 rename proposal

完整导航键见[快捷键参考](/reference/keyboard-shortcuts)。

## 从视觉进入代码

三个编辑器通过 Code Slot 引用代码，而非将任意源码字符串存入面板状态。Blueprint 的受控 JSX/CSS、事件 handler，NodeGraph executor，Animation function 和 Shader 都在共享代码环境中编辑，并向同一个 Issues 视图发布诊断。

继续阅读：[Blueprint 编辑器](/editors/blueprint)、[Code 与 Shader](/editors/code-and-shaders)和[视觉与代码双向编辑](/tutorials/visual-code-round-trip)。
