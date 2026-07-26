# 开发环境

## 前置条件

- Node.js 22+
- pnpm 11.9.0（通过 Corepack 使用仓库固定版本）
- Git
- Go 与 PostgreSQL（仅后端开发需要）

```bash
corepack enable
pnpm install
```

## 开始一次开发 session

先同步远端并确认当前分支状态：

```bash
git fetch
git status -sb
git rev-list --left-right --count HEAD...@{upstream}
```

如果远端已有新提交，先以非破坏性的方式合入。仓库中可能有其他人尚未提交的改动，不要用 `git reset --hard` 或覆盖无关文件。

## 启动入口

```bash
pnpm dev:web
pnpm dev:backend
pnpm dev:docs
pnpm storybook:ui
```

通常只需启动你正在修改的表面即可。Web 端的本地项目编辑流程不要求后端先行启动。

## 修改落点

先确认能力所属的 owner：

- React 交互表面与 composition：`apps/web`
- Canonical model、Command、History：`packages/workspace`
- revision/outbox/conflict：`packages/workspace-sync`
- UI graph：`packages/pir`
- 语义索引与 Code Artifact：`packages/authoring`
- 语言能力：`packages/code-language`
- React 投影：`packages/pir-react-renderer`
- 生产导出：`packages/prodivix-compiler`

不要因为调用点位于 Web 就把 transport-neutral 逻辑写回 `apps/web/src`。

## 完成前

根据改动的风险范围运行相应测试，然后格式化代码：

```bash
pnpm test
pnpm --filter @prodivix/web typecheck
pnpm run format
```

仓库级边界由 `pnpm lint` 一并检查。更细的 Gate 见[测试与产品 Gate](/developer/testing-and-gates)。
