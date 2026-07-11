# Codegen Diagnostics 编码规范（GEN）

## 状态

- Draft
- 日期：2026-05-03
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/codegen/react-production-policy-v1.md`
  - `specs/decisions/04.mitosis.md`

## 1. 范围

`GEN-xxxx` 覆盖 PIR 到目标代码的 canonical IR 构建、依赖解析、adapter 匹配、代码发射、项目脚手架和导出产物。

不覆盖：

1. PIR 本身的结构校验，使用 `PIR-xxxx`。
2. Plugin artifact/contribution validation 使用 `PLG-xxxx`；Compiler policy、dependency 与输出失败使用本 `GEN-xxxx` 域。
3. 部署平台失败，后续可使用 `API-xxxx` 或独立 Deploy 域。

## 2. 阶段

```ts
type CodegenDiagnosticStage =
  'canonical-ir' | 'adapter' | 'dependency' | 'emit' | 'export';
```

## 3. 编码分段

| 段位       | 阶段           | 说明                           |
| ---------- | -------------- | ------------------------------ |
| `GEN-10xx` | `canonical-ir` | PIR 到 Canonical IR 的转换     |
| `GEN-20xx` | `adapter`      | 组件 adapter、目标框架能力匹配 |
| `GEN-30xx` | `dependency`   | import、package、版本和许可证  |
| `GEN-40xx` | `emit`         | 代码发射、格式化、文件组织     |
| `GEN-50xx` | `export`       | ZIP、项目脚手架、导出包        |
| `GEN-90xx` | `export`       | Codegen 未知异常               |

## 4. 已占用码位

### `GEN-1001` Canonical IR 构建失败

- Severity: `error`
- Stage: `canonical-ir`
- Retryable: false
- Trigger: PIR 无法转换为目标无关的 Canonical IR
- User action: 先修复 PIR 诊断，再重新导出
- Developer notes: 该诊断应保留下游 PIR code 列表

### `GEN-2001` 组件 Adapter 缺失

- Severity: `warning`
- Stage: `adapter`
- Retryable: false
- Trigger: 目标框架没有当前组件类型的 adapter
- User action: 替换为支持的组件，或添加组件导出适配
- Developer notes: 可降级为原生元素或占位组件，但必须记录诊断

### `GEN-2002` 目标框架不支持该能力

- Severity: `warning`
- Stage: `adapter`
- Retryable: false
- Trigger: PIR 使用了目标框架 adapter 不支持的事件、slot、动画或数据能力
- User action: 调整设计或选择支持该能力的导出目标
- Developer notes: adapter capability matrix 应产出稳定诊断

### `GEN-3001` 依赖包无法解析

- Severity: `error`
- Stage: `dependency`
- Retryable: true
- Trigger: codegen 无法为组件或外部库解析 package/import
- User action: 检查外部库配置和依赖版本
- Developer notes: package resolver 应输出缺失 package、import path 和目标框架

### `GEN-3002` 依赖许可证策略不满足

- Severity: `warning`
- Stage: `dependency`
- Retryable: false
- Trigger: 导出依赖不满足项目配置的 license policy
- User action: 替换依赖或调整许可证策略
- Developer notes: 与 Git license 处理链路保持同一 code

### `GEN-4001` 代码发射失败

- Severity: `error`
- Stage: `emit`
- Retryable: true
- Trigger: 目标代码生成、格式化或文件写入失败
- User action: 重试导出；若复现，携带错误码上报
- Developer notes: meta 应包含 target、componentId 和 emit phase

### `GEN-5001` 导出包生成失败

- Severity: `error`
- Stage: `export`
- Retryable: true
- Trigger: 项目脚手架、ZIP 或下载产物生成失败
- User action: 重试导出或选择较小范围导出
- Developer notes: 大型项目导出失败应区分内存、文件系统和代码生成错误

### `GEN-9001` Codegen 未知异常

- Severity: `error`
- Stage: `export`
- Retryable: true
- Trigger: 代码生成或导出链路出现未分类异常
- User action: 重试操作；若复现，携带错误码和导出目标上报
- Developer notes: 新增稳定复现场景后应分配更具体的码位

## 5. 预留码位

1. `GEN-2010`：外部库 adapter policy 缺失。
2. `GEN-3010`：import 命名冲突。
3. `GEN-4010`：格式化失败。
4. `GEN-5010`：导出文件名冲突。
