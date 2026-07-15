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

如果远端已有提交，先使用非破坏方式集成。仓库可能包含其他人的未提交改动，不要用 `git reset --hard` 或覆盖无关文件。

## 启动入口

```bash
pnpm dev:web
pnpm dev:backend
pnpm dev:docs
pnpm storybook:ui
```

通常只需启动正在修改的表面。Web 的本地项目作者链路不要求后端先运行。

## 修改落点

先判断能力 owner：

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

在与风险相称的范围运行测试，然后格式化：

```bash
pnpm test
pnpm --filter @prodivix/web typecheck
pnpm run format
```

仓库级边界由 `pnpm lint` 一并检查。更细的 Gate 见[测试与产品 Gate](/developer/testing-and-gates)。
