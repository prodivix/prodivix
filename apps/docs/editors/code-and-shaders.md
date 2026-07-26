# Code 与 Shader

Code Authoring Environment 是 Blueprint、NodeGraph 和 Animation 共享的代码基础设施。源码保存在 Canonical Workspace code document 中，编辑器仅消费 revision-bound artifact 与 language session。

单个 handler、validator 或 custom easing 使用小型代码弹窗；JSX、CSS、Shader、Adapter 以及多文件上下文则使用最大化弹窗或独立 Code Workspace。Resources 中的完整代码编辑界面继续承载导入文件、外部文件和资源归属文件。所有入口通过同一个 `CodeAuthoringRequest` 描述目标、SourceSpan、CodeSlot、来源和允许的能力，并共享 `CodeAuthoringSession` 提供的多文件草稿、并发过期保护、保存、诊断和语义会话。

## 支持的语言能力

当前纵切覆盖：

- TypeScript 与 JavaScript
- CSS 与 SCSS
- GLSL 与 WGSL

统一的 `CodeLanguageSession` 提供 definition、references、completion、diagnostics、hover、rename proposal 和 semantic contribution。Code Editor 与 Issues 消费同一份 snapshot identity，避免出现”编辑器已更新但诊断仍停留在旧 revision”的情况。

## Shader 的两层能力

Shader 语言层基于 parser-neutral symbol model 提取 entry、function、type 和 resource facts。GPU 编译层则按目标 profile 验证 WebGL2/GLSL 或 WebGPU/WGSL。

因此：

- 语言解析成功不等于 GPU 编译成功。
- WebGPU 不可用时必须明确报告 skipped/unavailable，不能伪装为通过。
- 编译诊断应定位回 Code Artifact 与 SourceSpan。

## Code Slot

事件 handler、executor、transform、easing、mounted CSS、shader 和 adapter 均通过 Code Slot 接入。Registry 负责聚合 slot 与 binding projection，但不拥有 binding 或源码本身。

删除 code artifact 之前会进行 lifecycle/impact 分析。如果仍存在引用，应先迁移 binding 或明确确认处置方式。

## 重命名

在支持重命名的符号上按 `F2` 发起 rename。Language Capability 仅生成 proposal；最终变更必须由 Workspace Transaction 来更新代码和跨领域的类型化引用。当 revision 发生变化后，旧的 proposal 即告失效。

## 受控源码

Blueprint 的 JSX/CSS round-trip 只更新明确受控的 source region。用户手写 imports、helper 和其他 code-owned 区域会被保留。详情见[视觉与代码双向编辑](/tutorials/visual-code-round-trip)。
