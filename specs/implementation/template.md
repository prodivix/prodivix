# 实施计划标题

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked
- Global Phase：G0-G6 中的一个阶段
- 日期：YYYY-MM-DD
- Owner：待定
- 关联：
  - `specs/roadmap/global-phases.md`

实施计划必须分别更新决策、实现和产品 Gate 状态。局部阶段编号只表示本计划内部顺序，不代表同名 Global Phase 已经通过。

## 目标

说明本计划要交付的用户闭环和长期 owner。

## 前置条件

列出不可绕过的 Global Phase、contract 和数据依赖。

## 范围

列出本次要实现的 contract、Command、persistence、projection、diagnostics 和 verification。

## 非目标

列出延后到其他 Global Phase 的能力。

## 写入与读取链路

明确 canonical truth、Command / Transaction、持久化、同步、读取投影和 Adapter 边界。

## 实施阶段

每个局部阶段都注明：

1. 所属 Global Phase。
2. 目标 Product Gate。
3. 可独立验证的完成条件。

## 验证证据

列出自动化命令、Golden scenario、conformance 或运行证据。证据必须能证明目标 Gate，而不只是证明文件存在或类型通过。

## 风险与停止条件

说明失败模式、阻断条件和安全回滚方式。

## 验收标准

- [ ] 没有第二套生产写入协议或领域私有真相源。
- [ ] 公开 contract、错误语义和诊断落点已稳定。
- [ ] 可重复验证命令通过。
- [ ] `ImplementationStatus` 与 `ProductGateStatus` 已按真实证据更新。
