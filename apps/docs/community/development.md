# 开发索引

这页保留为社区入口，具体内容已按职责拆分，避免维护第二套开发手册。

| 目标                         | 文档                                            |
| ---------------------------- | ----------------------------------------------- |
| 安装依赖、启动应用           | [开发环境](/developer/setup)                    |
| 判断代码应该放在哪个 package | [架构与 Package Owner](/developer/architecture) |
| 选择测试类型与运行 Gate      | [测试与产品 Gate](/developer/testing-and-gates) |
| 更新 VitePress 或诊断参考    | [维护文档](/developer/documentation)            |
| 提交 Issue、Commit 或 PR     | [贡献指南](/community/contributing)             |
| 查看阶段与当前主线           | [当前产品状态](/roadmap/current-status)         |

## 常用入口

```bash
pnpm dev:web
pnpm dev:backend
pnpm dev:docs
pnpm storybook:ui
pnpm test
pnpm lint
pnpm run format
```

当前要求 Node.js 22+ 和 pnpm 11.9.0。仓库架构、命令和依赖版本以代码与根文档为准，不在本页复制易漂移清单。
