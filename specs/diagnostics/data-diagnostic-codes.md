# Data Diagnostics 编码规范（DAT）

## 状态

- Draft
- 日期：2026-07-15
- Global Phase：G2 Executable Full-stack Workspace
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/45.data-operation-and-environment-reference-foundation.md`

## 1. 范围

`DAT-xxxx` 覆盖 DataSourceDocument、DataOperationReference、Data runtime、environment/Secret binding 与 protocol adapter 的稳定失败语义，使用 `domain: data` 和 `data-source` / `data-operation` target。

不覆盖：

1. `data-source` Workspace document envelope、revision 或 Atomic Commit 失败，使用 `WKS-xxxx`。
2. 跨领域 snapshot identity、visibility 或通用 resolution 失败，使用 `SEM-xxxx`；Data operation 自身缺失或不兼容使用 `DAT-xxxx`。
3. 后端 Prodivix HTTP/auth/persistence 失败，使用 `API-xxxx`；这里的 API 指用户项目 Data source，不是 Prodivix backend API。
4. 自定义 adapter/transform 的源码与 Language Capability 诊断，使用 `COD-xxxx`。

## 2. 阶段

```ts
type DataDiagnosticStage =
  'validate' | 'resolve' | 'bind' | 'execute' | 'adapt';
```

## 3. 编码分段

| 段位       | 阶段                | 说明                                       |
| ---------- | ------------------- | ------------------------------------------ |
| `DAT-10xx` | `validate`          | DataSourceDocument、schema、operation 形状 |
| `DAT-20xx` | `resolve`           | schema、operation 与跨领域引用解析         |
| `DAT-30xx` | `bind`              | environment、Secret 与 runtime zone 绑定   |
| `DAT-40xx` | `execute` / `adapt` | operation execution 与 protocol adapter    |
| `DAT-90xx` | `execute` / `adapt` | 尚未分类的 Data runtime 异常               |

## 4. 已占用码位

### `DAT-1001` Data source document 无效

- Severity: `error`
- Domain: `data`
- Stage: `validate`
- Retryable: false
- Target: `data-source`
- Trigger: DataSourceDocument 无法通过 current contract 或 wire codec 校验，包括 source、schema、operation、policy 或引用式 configuration 形状无效
- User action: 打开 Data source，修正被标记的 schema、operation 或 configuration 后重新保存
- Developer notes: Workspace envelope/revision 错误继续使用 `WKS-xxxx`；meta 只保留 document/field identity，不复制 literal configuration、environment value 或 Secret material

### `DAT-2001` Data operation 引用无法解析

- Severity: `error`
- Domain: `data`
- Stage: `resolve`
- Retryable: false
- Trigger: DataOperationReference 无法解析，或目标 operation 已不存在于被引用的 Data source
- User action: 在 Inspector 中重新选择一个存在的 Data operation，或恢复被删除的 operation
- Developer notes: PIR data binding transaction 在规划阶段发布该 issue 并 fail closed；meta 只保留 document/operation identity，不复制 configuration 或运行时值

## 5. 后续 runtime 码位预留

以下码位在对应 runtime 纵切实现前只保留语义，不表示当前已经发布执行诊断：

1. `DAT-2002`：operation 引用的 schema 不存在或不兼容。
2. `DAT-3001`：ExecutionEnvironmentSnapshotRef 或公开 environment binding 不可用。
3. `DAT-3002`：SecretRef 无法在目标 runtime zone 获授权解析。
4. `DAT-4001`：runtime adapter 不支持 operation capability 或 runtime zone。
5. `DAT-4002`：Data operation 执行失败，并已安全移除 credential、响应隐私数据与供应商私有对象。

## 6. 敏感信息边界

Data diagnostics 可以记录 source/document/operation/binding identity、adapter id、runtime zone 与可安全展示的状态码，不得记录 Secret value、authorization header、cookie、完整 request/response body、connection string 或 environment value。可重试性由稳定语义决定，不根据供应商原始错误字符串猜测。
