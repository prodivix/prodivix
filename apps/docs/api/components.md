# 组件与 Renderer Host

在 Prodivix 中，”组件”至少有三种不同含义。使用相关 API 前，请先确认其 owner。

## `@prodivix/ui`

这是 Prodivix 编辑器自身使用的 React UI 组件库，采用 SCSS 和产品主题变量。它不等同于用户项目中的 Component Definition，也不应被 PIR 当作唯一的 runtime component catalog。

```tsx
import { PdxButton } from '@prodivix/ui';

export function SaveAction() {
  return <PdxButton text="Save" category="Primary" />;
}
```

组件的 props、状态和交互示例，以[在线 Storybook](/storybook/) 及 package 导出的 TypeScript 类型为准。手动维护一份涵盖几十个组件的静态 API 清单很容易与实际实现产生偏差，因此本页不再复制完整 props 表。

## PIR Component Definition

用户项目中的可复用组件是 `pir-component` Workspace document，拥有 Public Contract、Definition graph 和稳定 identity。Blueprint 中的 Component Instance 保存类型化引用与 binding。

它通过 `@prodivix/pir`、Workspace Semantic Index、Renderer 和 Compiler 协同工作，不通过 `@prodivix/ui` 的 React props 直接持久化。详见[组件作者页](/editors/components)。

## Runtime component host

Native、Built-in、Adapted 和 Embedded component 通过 host/adapter capability 投影为 PIR element。React host 位于 renderer/plugin 边界，不允许将第三方 React 实例或闭包写入 Canonical Workspace。

外部库只需承诺其 capability level 支持的体验：

- Native：完整稳定的视觉与代码能力
- Adapted：通过显式 adapter 暴露契约
- Embedded：以宿主边界运行，视觉编辑受限
- Code-only：以 Code Artifact 使用，仍支持引用、诊断和导出

插件包格式见[插件包与 Blueprint Template](/reference/plugin-package-and-blueprint-template)。

## 变更兼容性

`@prodivix/ui`、PIR Public Contract 和 plugin component contract 是三套独立的兼容边界。修改其中任何一套时，不应假设其他两套会自动同步，而应通过 adapter、semantic impact 和 conformance 来明确建立连接。
