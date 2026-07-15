# AI 助手边界

Prodivix 把 AI 看作语义化作者环境的参与者，而不是绕开项目模型的第二套编辑器。

## AI 可以做什么

AI 可以基于当前 Workspace revision、可见 scope、语义引用和诊断生成：

- 修改意图与变更 proposal
- 受控代码 patch
- 组件抽取或引用调整建议
- 对 Issues 的解释与修复候选
- 导出、依赖和影响分析建议

这些能力会随产品阶段逐步开放；出现入口不表示它已经具有自主执行或生产安全保证。

## AI 不可以绕过什么

AI 不得直接覆盖 Canonical Workspace VFS，也不得把源码或领域状态持久化到私有聊天状态。可写 proposal 必须转换为可逆 Command 或原子 Transaction，经过领域校验、History、Durable Outbox 和 Atomic Commit。

```mermaid
flowchart LR
  Prompt["用户意图"] --> Planner["Proposal Planner"]
  Planner --> Review["预览 / 影响分析"]
  Review --> Command["Command / Transaction"]
  Command --> Validate["Domain Validators"]
  Validate --> Workspace["Canonical Workspace"]
```

## 上下文与秘密

全项目符号可寻址并不等于对 AI 全部可见。Scope、capability、权限和敏感数据边界仍然有效。未来 Data/API 与执行能力使用 `SecretRef` 引用秘密；密钥本体不应进入 PIR、代码 proposal、诊断 payload 或可导出的 Workspace 文档。

## 当前状态

当前作者环境已经提供 AI 所需的基础：稳定语义地址、引用图、Code Artifact、诊断目标和可逆写入链路。真实 Runner、数据源、权限策略、审计和可验证自动执行尚未形成完整产品能力。

架构细节见[Semantic Authoring](/concepts/semantic-authoring)和[Change 与 Sync](/concepts/change-and-sync)。
