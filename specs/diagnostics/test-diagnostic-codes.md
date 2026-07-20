# Workspace Test Diagnostics 编码规范（TST）

## 状态

- Draft
- 日期：2026-07-15
- Global Phase：G2 Executable Full-stack Workspace
- 关联：
  - `specs/diagnostics/README.md`
  - `specs/decisions/40.execution-provider-and-job.md`
  - `specs/decisions/44.browser-test-execution-and-runtime-host.md`

## 1. 范围

`TST-xxxx` 覆盖 Workspace 导出工程在 Browser 或 Remote ExecutionProvider 中运行测试时的稳定失败语义。当前诊断使用 `domain: workspace` 和 Workspace/SourceTrace target，便于 Issues 与 Test 页面定位同一个 revision-bound 工程目标。

不覆盖：

1. 生成独立工程前的 compiler/export blocking diagnostic，使用 `GEN-xxxx`。
2. 测试进程的普通 stdout/stderr，继续作为 ExecutionJob log，不为每行创建诊断。
3. G3 `BehaviorScenario` 的 authoring/compile/replay failure，使用 `BHV-xxxx`；`VerificationPlan`、adapter、
   `VerificationEvidence` 与 Closure failure，使用 `VER-xxxx`。

## 2. 阶段

```ts
type WorkspaceTestDiagnosticStage = 'execute' | 'report';
```

## 3. 编码分段

| 段位       | 阶段                 | 说明                                            |
| ---------- | -------------------- | ----------------------------------------------- |
| `TST-50xx` | `execute` / `report` | 导出工程测试执行、工具报告读取与 canonical 转换 |
| `TST-90xx` | `execute` / `report` | 尚未分类的 Workspace Test 宿主异常              |

## 4. 已占用码位

### `TST-5001` 项目测试失败

- Severity: `error`
- Domain: `workspace`
- Stage: `execute`
- Retryable: false
- Trigger: Test provider 取得有效 canonical report，且一个或多个 test file/case 失败
- User action: 打开 Test report 与 Console，检查失败用例、SourceTrace 和断言信息后重新运行
- Developer notes: 有 file 级结果时按失败文件发布，meta 保留 `reportId`、path、failed file/case count；不得把 assertion source、Secret 或任意用户输入复制到 meta

### `TST-5002` 测试宿主或报告读取失败

- Severity: `error`
- Domain: `workspace`
- Stage: `report`
- Retryable: true
- Trigger: Browser/Remote test host 无法准备 snapshot、启动 test command、测试进程在无失败断言报告时异常退出、读取 report artifact，或工具私有报告无法转换为完整 `ExecutionTestReport`
- User action: 检查导出工程的测试命令、依赖和报告配置后重试；同时查看 Console 中的宿主错误
- Developer notes: 该码与 assertion failure 分离；provider 使用 Workspace target，并将供应商/工具异常映射为可传输 message，不暴露 SDK 对象或敏感环境值

## 5. G2/G3 边界

`TST-5001` 和 `TST-5002` 只描述一次 Workspace Test ExecutionJob 的失败。它们不会创建
BehaviorScenario identity，也不会把 report 自动持久化为 VerificationEvidence。G3 的 Scenario 诊断使用
[`BHV-xxxx`](behavior-diagnostic-codes.md)，Impact/Policy/Plan/adapter/Evidence/Closure 诊断使用
[`VER-xxxx`](verification-diagnostic-codes.md)；只有经 promotion contract 的 candidate 才能成为 Evidence。
