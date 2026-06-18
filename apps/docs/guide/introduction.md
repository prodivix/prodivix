# 简介

Prodivix（简称 MFE）是一款**浏览器内运行**的面向现代 Web 开发的**可视化前端构建平台**。它以**页面**为基本组织单元，以**组件**为核心构建模块，支持从原型设计到生产部署的全流程开发。

## 设计理念

> "融合蓝图、节点图与代码；贯通设计、开发、测试、构建与部署；面向跨领域前端开发、快速 MVP 开发，以及前端学习的优质选择。"

MFE 的核心设计理念是：

1. **低门槛，高上限** - 初学者可以通过可视化界面快速上手，专业开发者可以深入定制每个细节
2. **设计即开发** - 打破设计与开发的边界，让设计稿直接转化为可运行代码
3. **一次设计，多端运行** - 通过 PIR 中间表示，支持导出为多种前端框架代码
4. **开放生态** - 完全开源，鼓励社区贡献组件、模板和最佳实践

## 核心特性

### 可视化蓝图编辑器

蓝图编辑器是 MFE 的核心功能，提供直观的拖拽式 UI 设计体验：

- **组件面板** - 从丰富的组件库中拖拽组件到画布
- **组件树** - 层级化管理页面结构，支持拖拽排序
- **属性检查器** - 实时编辑组件属性，即时预览效果
- **视口工具栏** - 缩放、平移、重置视口，适配不同设计场景

### AI 辅助开发

MFE 的 AI 能力采用重前端、轻后端的设计。当前版本在蓝图编辑器右下角提供最小 AI 助手闭环：

- **Mock / OpenAI-compatible Provider** - 可在本地模拟，也可直接连接兼容 OpenAI Chat Completions 的服务
- **模型发现** - 可从 `{baseURL}/models` 读取可用模型基础信息
- **结构化计划** - 根据当前路由和选中节点上下文生成可审阅计划
- **调试可见** - Hover 查看真实 Prompt 和模型原始返回文本，便于排查解析问题

### PIR 中间表示

PIR（Modular Intermediate Representation）是 MFE 的核心创新：

```json
{
  "type": "PdxButton",
  "props": {
    "variant": "primary",
    "size": "medium"
  },
  "children": ["点击我"]
}
```

PIR 是一种框架无关的组件描述格式，可以转换为：

| 目标框架 | 输出格式              |
| -------- | --------------------- |
| React    | JSX + Hooks           |
| Vue 3    | SFC + Composition API |
| Angular  | 组件类 + 模板         |
| SolidJS  | JSX + 响应式          |
| 原生 Web | HTML + CSS + JS       |

### 一键部署

MFE 内置多种部署选项：

- **静态托管** - GitHub Pages、Vercel、Netlify
- **Web3 部署** - IPFS、Arweave 去中心化存储
- **自托管** - 导出静态文件，部署到任意服务器

## 系统架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Prodivix                              │
├─────────────┬──────────────┬────────────┬───────────────┬───────────┤
│   apps/web  │ apps/backend │  apps/cli  │  apps/vscode  │ apps/docs │
│ (React 编辑器)│ (Go + PG 服务)│ (命令行工具)│ (VS Code 扩展) │ (VitePress)│
├─────────────┴──────────────┴────────────┴───────────────┴───────────┤
│                            packages/                                 │
├──────┬──────────────┬────────┬────────┬──────┬──────┬───────────────┤
│  ui  │ prodivix-compiler │ shared │ themes │ i18n │  ai  │vscode-debugger│
└──────┴──────────────┴────────┴────────┴──────┴──────┴───────────────┘
```

前端编辑器统一收敛到 **PIR**，由后端 **Workspace VFS** 持久化；
前后端共用当前 **PIR** 校验逻辑（`apps/web/src/pir/validator` ↔ `apps/backend/internal/modules/workspace/pir_validator.go`）。

## 与同类工具对比

| 特性       |      Prodivix      | Figma to Code | 传统 IDE  |
| ---------- | :----------------: | :-----------: | :-------: |
| 可视化设计 |         ✅         |      ✅       |    ❌     |
| 逻辑编排   | ✅ (节点图 + 代码) |      ❌       | ✅ (代码) |
| 多框架导出 |         ✅         |     部分      |    ❌     |
| 实时预览   |         ✅         |      ✅       |  需配置   |
| 调试支持   |         ✅         |      ❌       |    ✅     |
| 开源免费   |         ✅         |      ❌       |   部分    |
| 本地运行   |         ✅         |      ❌       |    ✅     |
| 外部库集成 |         ✅         |      ❌       |    ✅     |
| 协作编辑   |         ✅         |      ✅       |    ❌     |

## 功能实现状态

### 已完成功能 ✅

| 功能模块          | 说明                                                                |
| ----------------- | ------------------------------------------------------------------- |
| 蓝图编辑器        | 拖拽式 UI 设计、组件树、Inspector Panel 架构、布局范式              |
| 组件库            | 75+ 内置组件 + Radix 子集，覆盖常见 UI 场景                         |
| 外部库运行时      | esm.sh 桥接 + Canonical External IR，支持 Ant Design / MUI 动态加载 |
| PIR 渲染器        | 运行时渲染、ValueRef 解析、列表渲染、数据作用域                     |
| React 代码生成    | PIR → JSX + Hooks（mitosis 桥接）                                   |
| Workspace VFS     | 多文档工作区、文件树、路由清单、文档级保存                          |
| 同步协议          | 分区 rev 乐观并发（workspaceRev/routeRev/contentRev）+ 冲突检测     |
| 路由清单 + Outlet | 多级路由 / 布局路由 / Outlet 占位 + 编辑器结构诊断                  |
| PIR 双端校验      | 前后端共用 v1.3 graph 校验（循环 / 孤立节点 / 父子关系）            |
| 后端服务          | 用户认证、项目管理、Workspace 同步、Capability 协商                 |
| 国际化            | 支持中文、英文                                                      |
| AI 助手           | Provider 抽象（Mock / OpenAI 兼容）+ 模型发现 + 调试可见            |

### 开发中功能 🚧

| 功能模块     | 说明                             |
| ------------ | -------------------------------- |
| 节点图编辑器 | 可视化逻辑编排（基础框架已搭建） |
| 动画编辑器   | 时间线和关键帧编辑               |
| 调试系统     | 断点、状态监控、时间线           |
| 执行引擎     | 节点图运行时执行                 |

### 计划功能 📋

- Vue 3 / Angular / Solid / Svelte / Qwik 代码生成
- 原生 HTML/CSS/JS 导出
- 团队协作（CRDT 作为 rev 模式后置层，见 `specs/decisions/07.workspace-sync.md`）
- 插件沙箱与 Capability 治理（`specs/decisions/14.plugin-sandbox-and-capability.md`）
- 类协议样式编辑器（`specs/decisions/16.class-protocol-editor.md`）
- LLM 深度集成（`specs/decisions/22.llm-integration-architecture.md`）
- GitHub App 与 Git 集成（`specs/decisions/23.github-app-integration.md`）
- 文件上传 API
- OAuth 第三方登录

## 下一步

- [快速开始](/guide/getting-started) - 5 分钟内创建你的第一个项目
- [AI 助手](/guide/ai-assistant) - 配置 LLM Provider 并查看调试输出
- [PIR 规范](/reference/pir-spec) - 了解中间表示格式
