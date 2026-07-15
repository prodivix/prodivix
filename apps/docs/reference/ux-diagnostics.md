# UX 诊断

`UX-xxxx` 描述最终用户体验质量问题，包括 accessibility、键盘交互、响应式布局、内容、视觉反馈和检查器自身状态。

## 分段

| 范围      | 方向                           |
| --------- | ------------------------------ |
| `UX-10xx` | 可访问性、语义与辅助技术       |
| `UX-20xx` | 键盘、焦点、输入与交互反馈     |
| `UX-30xx` | 响应式、溢出、遮挡与视口       |
| `UX-40xx` | 文案、标签、说明与错误建议     |
| `UX-50xx` | 对比、层级、密度、动效与可读性 |
| `UX-90xx` | 检查器配置、证据与执行生命周期 |

完整、自动生成的码表见[UX 诊断分类](/reference/diagnostics/ux)。

## 与结构错误的区别

同一个目标可以同时存在多个诊断：CSS 解析失败属于 `COD-1001`；CSS 能运行但文本对比不足属于 UX 诊断。Issues 保留各 provider 的原始主码，不把结构、代码或运行时错误统一改写成 UX。

## 证据与状态

UX 检查必须区分 passed、failed、not-applicable 和 insufficient-evidence。无法获得浏览器、AX tree、视口或运行状态证据时，不能把“未检测到”当成通过。

## Quick Fix

只有能生成稳定、可逆领域变更的规则才提供 Quick Fix。修复仍通过 Workspace Command/Transaction 应用；检查器不得直接操作 DOM 并把结果当成作者态。

视觉回归、accessibility 和 performance 是后续独立产品 Gate。诊断目录存在不表示完整自动验证平台已经交付。
