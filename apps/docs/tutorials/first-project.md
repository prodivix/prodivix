# 创建第一个项目

这条教程带你走完一次最小但完整的作者闭环：创建项目、编辑 Blueprint、检查诊断、使用 History，并查看生产导出。

## 1. 启动并创建项目

先按[本地启动](/guide/getting-started)运行 Web 编辑器。在首页创建一个本地项目，并进入项目工作区。

本地项目使用正式 Workspace replica 与 outbox adapter。它不是只存在于组件 state 或 `localStorage` 中的临时草稿。

## 2. 在 Blueprint 放入内容

打开 Blueprint，从可用资源中拖入一个基础元素或内置组件。选中画布中的节点后，在 Inspector 修改文字、样式或公开属性。

此时应同时看到：

- 组件树中的作者结构
- 画布中的渲染投影
- Inspector 中当前节点的稳定属性
- 保存状态或待处理操作状态

如果节点被其他内容遮挡，可在组件树中临时隐藏它。这个按钮只控制作者画布，不会改变预览和导出结果。

## 3. 试一次撤销与重做

修改一个明显的属性，然后使用：

- `Ctrl/Cmd+Z` 撤销
- `Ctrl/Cmd+Shift+Z` 重做
- Windows/Linux 也可用 `Ctrl+Y` 重做

History 回放的是领域 Command/Transaction，不是对 DOM 的快照还原。

## 4. 查看 Resources

打开 Code Workspace 编辑项目级 Workspace 代码文档。Resources 汇总项目文件、外部依赖、公共资源、国际化资源、Design Token、可复用组件，以及导入、外部和资源归属代码文件的完整编辑表面。

选择一个代码文档时，代码编辑器和语言能力应绑定当前 Workspace revision。诊断、跳转和重命名建议不会直接覆盖其他领域文档。

## 5. 检查 Issues

按 `Alt+0` 打开 Issues。Issues 会合并 Workspace、PIR、Route、Code、NodeGraph、Animation、Plugin 等 provider 的 revision-bound snapshot。

如果存在问题：

1. 选择一条诊断查看目标、来源和严重程度。
2. 使用“打开目标”或“打开文档”回到对应作者表面。
3. 只有提供稳定修复契约的诊断才会显示 Quick Fix。

错误图标可以复制错误内容；复制反馈保持中性样式，不代表问题已经修复。

## 6. 查看导出计划

打开 Export，选择当前已验证的 React/Vite target。导出前先处理会阻止生成的错误，再检查源码、样式、运行时、资源、配置和依赖计划。

导出不是截图或画布 DOM 序列化。Compiler 会从 Canonical Workspace 构建 Export Program，再由 target preset 规划文件拓扑和 imports。

## 完成标准

完成后，你应该能够解释：

- 为什么 Blueprint、Code、Issues 和 Export 没有各自保存一份项目
- 作者画布隐藏与真实运行时可见性的区别
- 为什么撤销、保存和远端同步共用同一变更契约

下一步建议：[组件与 Collection 复用](/tutorials/component-collection)或[视觉与代码双向编辑](/tutorials/visual-code-round-trip)。
