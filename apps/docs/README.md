# @prodivix/docs

Prodivix 的 VitePress 产品文档站。

## 信息架构

```text
apps/docs/
├─ guide/       # 认识产品、启动与导览
├─ tutorials/   # 端到端用户任务
├─ editors/     # Blueprint、NodeGraph、Animation、Code、Resources、Issues
├─ concepts/    # Workspace、PIR-current、Semantic、Change、Export
├─ developer/   # 环境、架构、测试与文档维护
├─ roadmap/     # 当前产品状态摘要
├─ reference/   # 稳定参考与生成的诊断页
├─ api/         # UI/host、CLI、Backend 的能力边界
├─ community/   # 贡献与变更记录
└─ .vitepress/  # 导航与站点配置
```

## 与 `specs/` 的关系

- `apps/docs` 解释如何使用产品以及当前交付边界。
- `specs/` 保存 schema、ADR、wire contract、Global Phase 与验证证据。
- `specs/roadmap/global-phases.md` 是阶段状态唯一来源。
- `specs/pir/PIR-current.json` 与 activation manifest 定义 PIR wire 边界。
- `specs/api/workspace-sync.openapi.yaml` 定义 Workspace sync wire contract。

产品文档不复制完整协议，也不把 Accepted ADR 或存在 UI 误写成 Passed product gate。

## 生成内容

`reference/diagnostic-codes.md` 与 `reference/diagnostics/` 从 `specs/diagnostics/` 生成。不要直接编辑生成页。

```bash
pnpm docs:diagnostics
pnpm docs:diagnostics:check
```

## 开发

```bash
pnpm dev:docs
pnpm build:docs
pnpm --filter @prodivix/docs preview
```

`build:docs` 会先检查诊断参考是否同步，再构建 VitePress。
