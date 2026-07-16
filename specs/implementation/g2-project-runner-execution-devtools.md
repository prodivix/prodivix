# G2 Project Runner 与 Execution Devtools 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Browser Runner + Neutral Snapshot Implemented / Devtools Planned
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-16
- Owner：`@prodivix/runtime-browser`、`@prodivix/runtime-core`、`apps/web` composition root
- 关联：
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/implementation/g2-execution-provider-remote-runner.md`
  - `specs/decisions/41.project-runner-and-canvas-modes.md`
  - `specs/decisions/40.execution-provider-and-job.md`

## 目标

把蓝图画布的 `design / interactive / run` 三种使用意图收敛为清晰的执行边界，并提供与
Project Runner 同源的 Console、Terminal、Network 和 Test 调试面。用户能够从运行结果回到
Workspace 文档、PIR 节点、CodeArtifact、Data operation 或生成源码 SourceTrace，而不是面对
无法定位的 iframe、终端文本或网络日志。

## 三种模式

| Mode          | Canonical input                                               | Runtime                            | 适用场景                                              | 明确限制                                         |
| ------------- | ------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| `design`      | revision-bound PIR-current projection                         | editor process renderer            | 选择、布局、拖拽、Inspector 编辑                      | 不执行完整项目副作用                             |
| `interactive` | 同一 PIR projection + lightweight domain runtime              | same-context                       | hover/click、局部事件、轻量 Collection/Animation 反馈 | 不伪装完整路由、依赖、server/edge 或真实工程进程 |
| `run`         | exact Workspace revision 编译出的 Executable Project Snapshot | Browser 或 Remote Project Provider | 完整路由、模块、依赖、Data runtime、项目测试          | 不直接读 editor React state，不回写 runtime FS   |

`interactive` 是可预测的快速反馈，不是缩小版的任意 JavaScript 沙箱。某项行为需要未获准
capability、真实 network、server/edge Secret、完整 bundler 或独立 process 时，必须给出稳定的
“请使用 run”诊断，不能静默降级或执行一半。

## 当前基础与缺口

### 已实现

- 蓝图画布已有三种 mode 与 revision-bound 切换。
- `run` 已通过 compiler、Browser Preview provider 与 Browser Runtime Host 启动完整 React/Vite
  工程，并以 preview artifact 原位呈现。
- runtime host 已按 owner 管理 filesystem、install、process 与 dispose。
- Console、Test report 与 Issues 已有共享 execution/diagnostic contract 基础。
- Compiler 已直接产出 provider-neutral Executable Project Snapshot，Browser Project Runner 只消费。

### 未实现

- Console 尚未形成完整的 structured、bounded、SourceTrace-aware 产品面。
- Terminal 尚无 transport-neutral session contract；Network 已建立 metadata-only strict current contract、
  Remote install proxy、Browser fetch、Data HTTP adapter、operation/invocation correlation 与基础产品视图，
  generated-project mock query runtime 与 Browser/Remote runtime asset projection 已接入；standalone
  mutation/live HTTP、policy correlation 与 Remote server/edge Data adapter 尚未接入。
- Browser/Remote provider 切换、重连、artifact expiry、quota 与 permission UX 未完成。
- Data operation correlation、Secret redaction 与 Golden CRUD 调试旅程未完成。

## 不变量

1. mode 是产品意图，不是三个作者态真相或三份 Workspace 镜像。
2. `run` 的输入只能来自 exact Canonical Workspace revision；未保存草稿必须显式保存或使用
   明确的 ephemeral draft snapshot，不能暗中混入。
3. Runtime filesystem、HMR state、Console、Terminal、Network 和 Test report 都是可丢弃运行态。
4. 从 runtime 采纳变更必须生成显式 proposal，再通过 Command/Transaction/Outbox/Atomic Commit；
   runtime 不能直接写 Workspace。
5. Devtools 消费 execution/session/source-trace contract，不扫描 iframe 或 provider 内部对象。
6. Secret、auth header、cookie 与受保护 response body 默认不进入客户端 Devtools。

## Project Runtime Host 生命周期

Host 是 composition-root-owned 的长期服务，但每次 Project Runner 启动都拥有独立 generation：

```text
Workspace revision + target + dependency fingerprint + provider policy
  -> acquire host
  -> materialize immutable project generation
  -> install/reuse matching dependency cache
  -> start owner-scoped process
  -> publish readiness + preview artifact + devtool session refs
  -> stop/release generation
```

- filesystem generation 与 dependency cache 分离；cache 命中不能复用旧 Workspace 文件。
- 只有 fingerprint、runtime implementation 和 policy 一致时才共享 install cache。
- Preview 与 Test 可以复用 install cache，但不得共享 provider identity、active Job、Session、
  cancellation 或 result。
- 新 generation ready 前保留旧 preview；切换成功后再 retire 旧 generation，失败则保持旧画面并
  明确显示 stale revision。
- route/entrypoint 变化通过新 generation 或 runtime 明确支持的 HMR plan 生效，不对文件增删猜测。

## Console contract

Console 使用结构化事件而不是拼接 stdout 字符串。每条记录至少包含：

- execution/session id、provider、generation、monotonic sequence 和 timestamp；
- `debug / info / warn / error` level 与 category；
- bounded transport-safe arguments；
- optional `DiagnosticTargetRef`、`SourceSpan`、`SourceTrace` 与 Data operation correlation id；
- truncation/redaction marker。

记录按条数和字节双预算截断；对象深度、字符串、数组和 stack frame 数量均有上限。循环引用、
getter、Proxy 或不可序列化值不能中断 session。Secret canary 命中后只发布安全事件。

## Terminal contract

Terminal 是独立的 transport-neutral interactive session，不复用无限增长的 `ExecutionEvent`：

```text
OpenTerminal(executionId, capability, cols, rows)
  -> terminalSessionId + initial cursor
WriteTerminal(sessionId, input, clientSequence)
ResizeTerminal(sessionId, cols, rows)
SignalTerminal(sessionId, interrupt | terminate)
ReadTerminal(sessionId, afterCursor)
CloseTerminal(sessionId)
```

- 只有声明 `terminal` capability 且 policy 允许的 provider 才可打开。
- Browser provider 可以声明 unsupported；UI 必须明确呈现，不用隐藏 fallback。
- Remote terminal token 短期、execution-scoped、不可写 Workspace，且不可暴露 control-plane credential。
- stdin、resize、signal、reconnect 和 output replay 均有序、有预算、可取消。
- terminal cwd 位于 execution-local project root；所有文件变化随 generation 销毁。
- “应用到项目”只能打开 diff/proposal flow，经用户确认形成 Workspace Transaction。

## Network contract

Network Devtools 消费 runtime/data adapters 发布的 sanitized trace，而不是依赖 Browser DevTools
Protocol 或抓取 iframe DOM。最小字段：

- request id、execution/session/generation、start/end/duration；
- method、sanitized URL、protocol/adapter、status/outcome、request/response size；
- cache/retry/pagination attempt、Data operation reference 与 source trace；
- runtime zone、mock/live mode 和 explicit redaction/truncation marker。

默认不采集 request/response body、authorization、cookie、set-cookie、Secret、signed URL query。
schema-aware preview 必须由 adapter 明确选择安全字段并执行大小限制。redirect、retry、pagination 与
GraphQL 子请求作为相关 span 呈现，不覆盖成一条含糊记录。

## 实施阶段

### R0：现有 Runner baseline

- [x] 三 mode 产品表面。
- [x] Browser Preview Provider 与原位 iframe artifact。
- [x] instance-owned Runtime Host 和 generation 基础。
- [ ] 固化 mode transition、stale revision 和失败恢复 contract tests。

### R1：Neutral project plan 与 composition

- [x] 迁移到 Executable Project Snapshot current contract。
- [ ] 将 mode selection、provider selection、target 与 environment policy 组合为 immutable run plan。
- [ ] 统一 Browser/Remote readiness、artifact、stop/restart 与 recovery 状态。
- [x] 移除 Web 内 Browser command/file 私有拼装。

完成条件：Web composition root 只组装 stable contracts；切换 provider 不改变工程内容。

### R2：Structured Console

- [ ] 定义 Console record/session codec 与预算。
- [ ] Browser/Remote process、runtime error 和 application console adapter。
- [ ] source map/source trace、Issues 和 Data correlation。
- [ ] filter、pause、clear-view、copy-safe-payload 与 redaction UX。

完成条件：同一错误从 Console 和 Issues 定位到同一作者态目标；clear 不删除 authoritative session。

### R3：Terminal

- [ ] transport-neutral Terminal session contract。
- [ ] Remote PTY adapter、lease、cursor replay、resize、signal 与 cleanup。
- [ ] capability/permission/unsupported product state。
- [ ] execution FS diff proposal，不提供直接 Workspace 写入。

完成条件：disconnect/reconnect 不乱序；终止 execution 会关闭 terminal 和 revoke token。

### R4：Network

- [x] transport-neutral metadata-only Network trace/span current contract 与 durable event 预算复用。
- [x] Remote install allowlist proxy/agent、Browser client-safe fetch 与 Data HTTP adapter。
- [x] Data operation/invocation/sequence/attempt/source trace correlation；cache/retry/pagination 待实现。
- [x] header/query/body/credential 在 contract 层不可表达，Web 只接受 strict decode。
- [ ] Secret canary 和 export-safe copy。

完成条件：Browser/Remote 的 trace 字段语义一致，敏感字段不会抵达客户端。

### R5：Provider-neutral Runner UX

- [ ] capability、zone、environment、target 与 provider selector。
- [ ] queue/install/start/ready/reconnecting/stopping/terminal 状态。
- [ ] quota、network denial、artifact expiry、worker loss 和 retry guidance。
- [ ] design/interactive/run 切换保留 selection/view preference，不保存 runtime truth。

完成条件：所有失败都可操作；不存在假 loading、沉默 fallback 或无限重试。

### R6：Golden 调试旅程

- [ ] CRUD 页面从 Collection 触发 query/mutation。
- [ ] loading/empty/error/retry/pagination/optimistic 在 Preview 可观察。
- [ ] Console、Network 与 Test report 使用同一 correlation/source trace。
- [ ] Remote Terminal 执行允许命令并验证 FS 不回写 Workspace。
- [ ] Browser/Remote 切换保持相同 revision 与 snapshot digest。

## 横向 Gate

| Gate         | 断言                                                                |
| ------------ | ------------------------------------------------------------------- |
| Mode         | design/interactive/run 边界清楚，unsupported 行为 fail closed       |
| Revision     | Runner 精确显示正在运行和当前作者态 revision，stale 可见            |
| Lifecycle    | generation/process/session/artifact 无泄漏，无跨 owner cancellation |
| Devtools     | Console/Terminal/Network 都是 shared contract consumer              |
| Security     | Secret/auth/cookie/body 默认不采集；copy/export 仍脱敏              |
| Traceability | runtime 事件能定位 Workspace/PIR/Code/Data/SourceTrace              |
| Persistence  | runtime FS 和调试记录不成为 Workspace 或 local replica              |

## 风险与停止条件

- 如果 `interactive` 开始复制完整 Project Runner、依赖安装或 server runtime，停止扩张并改用
  `run`。
- 如果 Terminal 或 Network 只能通过 provider 私有 payload 接入 Web，先补 shared contract。
- 如果 Runtime FS 能自动覆盖 Workspace，立即移除该路径并改为 proposal/transaction。
- 如果 Browser/Remote 对同一字段使用不同语义，不做 UI 兼容分支，先修 conformance。
- 如果 body/header 未完成分类和脱敏，Network 只发布 metadata，不开放内容查看。

## 验收标准

- [ ] 三种 mode 具有稳定、可测试的 capability 边界。
- [ ] Project Runner 可在 Browser/Remote 间切换且运行 exact revision。
- [ ] Console、Terminal、Network 与 Test 使用 transport-neutral contract。
- [ ] 所有运行诊断都能回到稳定作者态目标或明确说明不可定位。
- [ ] Secret 与 runtime FS 不进入作者态或客户端泄漏面。
- [ ] Golden CRUD 调试旅程通过。
