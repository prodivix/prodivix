# 维护文档

文档站面向产品使用者和贡献者；`specs/` 面向协议、架构决策与可重复证据。不要让两处内容重复维护同一份契约，以免各自演进后出现不一致。

## 信息架构

- `guide/`：认识产品、快速上手与导航
- `tutorials/`：可跟随完成的端到端任务
- `editors/`：各产品表面的使用与边界
- `concepts/`：长期稳定的心智模型
- `developer/`：仓库开发、架构、测试和维护
- `reference/`：稳定契约索引与生成参考
- `roadmap/`：从唯一的阶段文档中提炼的当前状态

## 写作原则

1. 先写当前可观察事实，再写路线图。
2. 用“已验证”“已有基础”“尚未交付”区分成熟度。
3. 产品指南解释如何使用；协议细节链接到 `specs/decisions/`。
4. 不要在 current 生产 API 中使用旧版本名。
5. 当路径、命令或 owner 发生变化时，应在同一次改动中更新相关的手写页面。

## 诊断参考是生成内容

`apps/docs/reference/diagnostics/` 下的诊断参考页和诊断总览均由 `specs/diagnostics/` 生成。修改诊断码时，应先改规范源，再运行：

```bash
pnpm docs:diagnostics
pnpm docs:diagnostics:check
```

不要手工修改单个生成页，下一次生成时会覆盖你的改动。

## 本地验证

```bash
pnpm build:docs
```

Docs build 会先检查诊断页是否与规范源同步，再执行 VitePress build。新增页面时，还应确认导航、站内链接、Mermaid 图和代码块能被构建器正确解析。

## 语言

文档站当前以简体中文为主。根 `README.md` 保持英文，`README.zh-CN.md` 保持简体中文；同一文档内不要无故切换语言。
