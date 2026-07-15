# 视觉与代码双向编辑

受控 round-trip 的目标不是把任意 React 源码无损变成可视节点，而是在明确 owner 与受控区域内，让 PIR-current、React/JSX 和 standalone CSS 可预测地往返。

## 1. 理解 owner

- PIR-owned 结构由 Blueprint 和 PIR Command 管理。
- code-owned 源码由 Canonical Workspace code document 管理。
- 受控源码区域携带稳定标记与 SourceTrace，用于映射 PIR location。
- 标记外的未知代码仍归 code owner，不会被视觉更新吞掉。

## 2. 从视觉生成受控代码

在 Blueprint 中选中支持 round-trip 的目标，打开 Code 相关入口。系统从当前 revision 生成受控 JSX 与 CSS 投影，并记录它们对应的 PIR location 和 code artifact。

生成结果是可编辑的 Workspace code document，不是只读预览，也不是从浏览器 DOM 反推的字符串。

## 3. 修改代码并应用

在受控 JSX 中修改支持的文字、属性或结构，在 standalone CSS 中修改可映射的声明。应用前系统会解析受控区域、验证 owner 和 revision，并生成 proposal。

可安全映射的变更会转换为 PIR/Code Transaction；无法证明安全的变更应 fail closed，并在 Issues 或编辑器中说明原因。

## 4. 回到视觉表面验证

重新选择目标，确认画布与 Inspector 反映代码修改。然后在 Inspector 修改同一属性，返回代码文档，确认受控区域被更新，而区域外的 imports、helper 或手写模块保持不变。

## 5. 使用语义重命名

把光标放在支持的代码符号上按 `F2`。Language Capability 生成 rename proposal，Workspace Semantic Index 补充跨领域引用和影响，最终由可逆 Transaction 应用。

Language Service 本身不能直接写 VFS。若目标 revision 已变化，旧 proposal 必须重新计算。

## 6. 绑定 Code Slot

事件 handler、NodeGraph executor、Animation function、mounted CSS、shader 和外部库 adapter 通过 Code Slot 绑定。Slot 声明 owner、输入、输出、能力约束和诊断落点；领域文档保存 `CodeSlotBinding` 与 `CodeReference`。

删除或重命名 code artifact 时，先查看引用影响。仍被 slot 引用的 artifact 不应静默成为 orphan。

## 不要这样做

- 不要手工删除或复制受控区域标记。
- 不要假设所有 React 语法都能回写为 PIR。
- 不要把 handler 或 shader 以裸字符串塞进 Inspector state。
- 不要在 revision conflict 时强行套用旧 proposal。

深入阅读：[Code 与 Shader](/editors/code-and-shaders)、[Semantic Authoring](/concepts/semantic-authoring)和[Preview 与 Export](/concepts/preview-and-export)。
