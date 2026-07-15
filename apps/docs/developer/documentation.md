# 维护文档

文档站面向产品使用者和贡献者；`specs/` 面向协议、架构决策与可重复证据。不要让两者复制并独立演进同一契约。

## 信息架构

- `guide/`：认识产品、启动和导航
- `tutorials/`：可完成的端到端任务
- `editors/`：各产品表面的使用与边界
- `concepts/`：长期稳定的心智模型
- `developer/`：仓库开发、架构、测试和维护
- `reference/`：稳定契约索引与生成参考
- `roadmap/`：从唯一阶段文档提炼的当前状态

## 写作原则

1. 先写当前可观察事实，再写路线图。
2. 用“已验证”“已有基础”“尚未交付”区分成熟度。
3. 产品指南解释如何使用；协议细节链接到 `specs/decisions/`。
4. 不把旧版本名写进 current 生产 API。
5. 路径、命令和 owner 变化时，同一改动更新相关手写页面。

## 诊断参考是生成内容

`apps/docs/reference/diagnostics/` 和诊断总览由 `specs/diagnostics/` 生成。修改诊断码时，先改规范源，再运行：

```bash
pnpm docs:diagnostics
pnpm docs:diagnostics:check
```

不要手工修补单个生成页；下一次生成会覆盖它。

## 本地验证

```bash
pnpm build:docs
```

Docs build 会先检查诊断页是否与规范同步，再执行 VitePress build。新增页面时还应确认导航、站内链接、Mermaid 和代码块能被构建器解析。

## 语言

文档站当前以简体中文为主。根 `README.md` 保持英文，`README.zh-CN.md` 保持简体中文；同一文档内部不要无目的切换语言。
