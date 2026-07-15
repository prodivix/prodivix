# 贡献指南

Prodivix 欢迎代码、文档、设计、诊断规范和测试贡献。项目仍处于 alpha，重大变更会直接收敛到 current architecture，不以保留旧兼容层为目标。

## 报告问题

提交 Issue 前请搜索已有记录，并提供：

- 最小复现步骤
- 期望与实际结果
- 浏览器、操作系统和 revision/commit
- Issues 中的诊断码与可复制错误内容
- 必要时附截图；不要附 secret 或完整私人 Workspace

架构或产品提案应说明用户问题、owner、Canonical Workspace 影响、迁移边界和退出 Gate，而不只描述一个 UI 控件。

## 本地开发

```bash
git clone https://github.com/Mdr-Tutorials/prodivix.git
cd prodivix
corepack enable
pnpm install
pnpm dev:web
```

详细环境见[开发环境](/developer/setup)。

## 修改原则

- 先确认 package owner，不把核心逻辑写回 `apps/web`。
- 作者态写入必须使用可逆 Command/Transaction、History、Durable Outbox 和 Atomic Commit。
- Code-owned 能力接入 Code Authoring Environment。
- 跨领域 symbol/reference/impact 接入 Workspace Semantic Index。
- PIR 生产代码只使用 PIR-current；数字版本只存在于 wire/migration 边界。
- 不新增旧 API 兼容层或编辑器私有持久化镜像。

完整规则以根 `AGENTS.md` 为准。

## 测试

按改动风险选择最小充分验证：

```bash
pnpm --filter @prodivix/web test
pnpm test:golden
pnpm lint
pnpm build
pnpm run format
```

属性测试统一使用 `<subject>.property.test.ts(x)`。避免依赖 DOM 层级、内部 class、`querySelector` 或快照的耦合测试。详见[测试与产品 Gate](/developer/testing-and-gates)。

## 提交

Commit message 使用英文 Conventional Commit 格式：

```text
type(scope): description
```

示例：

```text
feat(authoring): add asset reference contribution
fix(renderer): preserve author-only hidden state
docs(site): rebuild product documentation
```

提交前检查 diff，保留工作区中不属于你的改动。Pull Request 应说明行为变化、架构 owner、验证命令和未覆盖风险。

## 文档贡献

产品教程写在 `apps/docs`，协议与决策写在 `specs`。诊断参考页由生成器维护，不要直接编辑生成文件。见[维护文档](/developer/documentation)。
