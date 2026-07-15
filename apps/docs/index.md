---
layout: home

hero:
  name: Prodivix
  text: 视觉编辑与真实代码共享同一个 Workspace
  tagline: 在浏览器中组合 Blueprint、NodeGraph、Animation、Code、Diagnostics 与生产导出，而不把项目压成一个巨型 JSON。
  image:
    src: /logo.svg
    alt: Prodivix
  actions:
    - theme: brand
      text: 创建第一个项目
      link: /tutorials/first-project
    - theme: alt
      text: 了解核心架构
      link: /concepts/workspace-vfs

features:
  - title: 三个视觉编辑器
    details: Blueprint、NodeGraph 与 Animation 各自拥有领域文档，通过稳定引用和共享语义环境协作。
  - title: Visual / Code Round-trip
    details: PIR-current 与受控 React/JSX、standalone CSS 双向同步，未知源码留在 code-owned 区域。
  - title: Canonical Workspace
    details: Route、PIR、Code、Graph、Animation、Token、Asset 与 Config 都是 Workspace VFS 中的一等文档。
  - title: Semantic Authoring
    details: Workspace Semantic Index 统一 definition、references、impact、scope 与跨编辑器导航。
  - title: Durable Change
    details: 作者态修改通过可逆 Command 或 Transaction，进入 History、Durable Outbox 与 Atomic Commit。
  - title: 可验证导出
    details: 当前 Golden target 是 React/Vite，并已有独立 install、typecheck、test、build 与浏览器 Gate。
---

## 当前能力边界

Prodivix 已经具备语义化视觉/代码混合作者闭环，包括 PIR-current、组件复用、受控源码往返、统一诊断、可逆 History、持久化写入链路和 React/Vite 导出验证。

::: warning Alpha 边界
Prodivix 尚未承诺生产稳定性。Test、Deployment、完整 Data/API lifecycle、多框架 target、远程执行与团队协作尚未交付。文档会明确区分“可用能力”和“尚未交付能力”。
:::

## 从哪里开始

| 你的目标                     | 推荐入口                                                  |
| ---------------------------- | --------------------------------------------------------- |
| 运行仓库并创建项目           | [本地启动](/guide/getting-started)                        |
| 快速认识编辑器               | [产品导览](/guide/product-tour)                           |
| 完成一个端到端作品           | [创建第一个项目](/tutorials/first-project)                |
| 抽取和复用组件               | [组件与 Collection 复用](/tutorials/component-collection) |
| 在视觉与代码之间往返         | [视觉与代码双向编辑](/tutorials/visual-code-round-trip)   |
| 理解为什么不会出现第二真相源 | [Canonical Workspace VFS](/concepts/workspace-vfs)        |
| 参与开发                     | [开发环境](/developer/setup)                              |

## 一条完整作者链路

```mermaid
flowchart LR
  Human["视觉编辑 / 代码编辑"] --> Plan["Command / Transaction"]
  Plan --> History["History"]
  History --> Outbox["Durable Outbox"]
  Outbox --> VFS["Canonical Workspace VFS"]
  VFS --> Index["Semantic Index"]
  VFS --> Preview["Preview"]
  VFS --> Export["React/Vite Export"]
```

视觉表面、代码编辑器、Issues 和 AI proposal 都必须复用这条链路；没有任何入口可以直接覆盖另一个编辑器的私有状态。
