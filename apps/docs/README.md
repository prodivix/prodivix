# @prodivix/docs

Prodivix 官方文档站点，基于 VitePress。

## 目录结构

```text
apps/docs
├── .vitepress/
│   └── config.mts       # 站点配置（侧栏、导航、主题）
├── guide/               # 使用与开发指南
│   ├── introduction.md
│   ├── getting-started.md
│   ├── blueprint-editor.md
│   ├── node-graph.md
│   ├── ai-assistant.md
│   ├── pir.md
│   ├── components.md
│   ├── i18n.md
│   ├── theming.md
│   ├── export.md
│   ├── deployment.md
│   └── project-structure.md
├── api/                 # API 文档
│   ├── backend.md       #   后端 REST/Workspace 同步 API
│   ├── cli.md           #   CLI 命令参考
│   └── components.md    #   内置组件 props 参考
├── reference/           # 规范与参考
│   ├── pir-spec.md
│   ├── component-spec.md
│   ├── node-spec.md
│   └── diagnostic-codes.md
├── community/           # 社区与协作
│   ├── changelog.md
│   ├── contributing.md
│   └── development.md
├── public/              # 静态资源
├── index.md             # 首页
└── package.json
```

## 与 specs/ 的关系

`apps/docs` 面向终端用户与生态贡献者，描述「能做什么」。
`specs/` 面向核心实现者，承载 ADR、契约、迁移计划等内部决策（参见 `specs/decisions/README.md`）。两者各有边界，不要把 ADR 复制到面向用户的 guide 中。

## 常用命令

```bash
pnpm dev:docs             # 本地预览（默认端口 5174）
pnpm build:docs           # 构建静态站点
cd apps/docs && pnpm preview
```
