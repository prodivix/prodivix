# 组件与 Renderer Host

Prodivix 中“组件”至少有三种不同含义。选择 API 前先确认 owner。

## `@prodivix/ui`

这是 Prodivix 自身编辑器使用的 React UI 组件库，采用 SCSS 和产品主题变量。它不等于用户项目中的 Component Definition，也不应该被 PIR 当作唯一 runtime component catalog。

```tsx
import { PdxButton } from '@prodivix/ui';

export function SaveAction() {
  return <PdxButton text="Save" category="Primary" />;
}
```

组件 props、状态和交互示例以[在线 Storybook](/storybook/)及 package 导出的 TypeScript 类型为准。手写一份包含几十个组件的静态 API 清单很容易与实现漂移，因此本页不复制完整 props 表。

## PIR Component Definition

用户项目中的可复用组件是 `pir-component` Workspace document，拥有 Public Contract、Definition graph 和稳定 identity。Blueprint 中的 Component Instance 保存类型化引用与 binding。

它通过 `@prodivix/pir`、Workspace Semantic Index、Renderer 与 Compiler 工作，不通过 `@prodivix/ui` 的 React props 直接持久化。参阅[组件作者页](/editors/components)。

## Runtime component host

Native、Built-in、Adapted 与 Embedded component 通过 host/adapter capability 投影 PIR element。React host 位于 renderer/plugin 边界，不能把第三方 React 实例或闭包写进 Canonical Workspace。

外部库只需承诺其 capability level 支持的体验：

- Native：完整稳定的视觉与代码能力
- Adapted：通过显式 adapter 暴露契约
- Embedded：以宿主边界运行，视觉编辑受限
- Code-only：以 Code Artifact 使用，仍支持引用、诊断和导出

插件包格式见[插件包与 Blueprint Template](/reference/plugin-package-and-blueprint-template)。

## 变更兼容性

`@prodivix/ui`、PIR Public Contract 和 plugin component contract 是三套独立兼容边界。修改其中一套时，不应假设其他两套会自动同步；需要由 adapter、semantic impact 和 conformance 明确连接。
