# RFC 标题

## 状态

- DecisionStatus：Draft
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked
- Global Phase：G0-G6 中的一个阶段
- 日期：YYYY-MM-DD
- Owner：待定
- 关联：
  - `specs/roadmap/global-phases.md`

以上三条状态轴必须分别维护。ADR 被接受、代码开始实现或局部测试通过，都不能自动把 Product Gate 标记为 Passed。

## 背景与问题

说明用户问题、当前事实、约束，以及为什么需要现在做出决策。

## 目标

列出本 RFC 要形成的用户闭环和稳定工程能力。

## 非目标

列出明确延后或不属于当前 Global Phase 的范围。

## 方案

描述 owner、核心 contract、数据流、写入路径、读取投影和错误语义。

## Truth 与边界

明确 canonical truth、可重建 projection、Adapter，以及禁止出现的第二写入路径。

## 实施计划

每个局部阶段都必须注明所属 Global Phase 和目标 Product Gate，避免把局部 Phase 编号误读为全局项目进度。

## 验证与证据

列出可重复运行的命令、Golden scenario 或其他证据。没有可重复证据时，ProductGateStatus 不得标记为 Passed。

## 风险与回滚

说明失败模式、兼容性或迁移策略，以及安全停止或回滚方式。Alpha 阶段的 Hard Cut 不需要保留旧兼容层。

## 验收标准

- [ ] Contract 已冻结并有明确 owner。
- [ ] 所有 durable mutation 进入统一 Command / Transaction 路径。
- [ ] Preview、Export、Diagnostics 和 Verification 的适用链路已说明。
- [ ] 自动化证据可以从干净环境重复执行。
