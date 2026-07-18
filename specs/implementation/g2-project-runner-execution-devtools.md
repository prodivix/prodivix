# G2 Project Runner 与 Execution Devtools 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Browser/Remote Runner + Network/Test/Structured Console + Remote PTY + Runtime FS Proposal + Manual Recovery Implemented / Full Recovery UX In Progress
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-17
- Owner：`@prodivix/runtime-browser`、`@prodivix/runtime-core`、`@prodivix/runtime-remote`、Remote Control Plane / Worker、Backend gateway、`apps/web` composition root
- 关联：
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/implementation/g2-execution-provider-remote-runner.md`
  - `specs/decisions/41.project-runner-and-canvas-modes.md`
  - `specs/decisions/40.execution-provider-and-job.md`

## 目标

把蓝图画布的 `design / interactive / run` 三种使用意图收敛为清晰的执行边界，并提供与
Project Runner 同源的 Console、Terminal、Network、Files 和 Test 调试面。用户能够从运行结果回到
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
- Structured Console 已将 state/log/diagnostic/artifact/trace/application observation 投影为共享、
  有界且带 execution correlation 的产品记录；Test report 与 Issues 继续消费共享 contract。
- Compiler 已直接产出 provider-neutral Executable Project Snapshot，Browser Project Runner 只消费。
- Blueprint Run Mode 已显式选择 Browser/Remote Preview；Remote artifact 经短期 capability origin
  materialize，Browser/Remote Test 与 Remote Build 使用同一 neutral snapshot contract。
- `@prodivix/runtime-core` 已建立独立 Terminal session/controller：exact execution/provider grant fence、
  lease expiry、stdin client-sequence 幂等、resize/signal/close 串行化、output cursor replay、条数/字节预算、
  Secret/credential redaction 与 bounded copy；Execution Center 从 active Job capability 与 permission 投影
  `unavailable / unsupported / permission-required / denied / available`。Remote Preview 已通过独立短期 token、
  polling transport 与 rootless inner PTY 接入，Browser provider 继续显式 unsupported，不伪造 fallback。
- Backend 只用 product session 验证 execution owner；Control Plane service credential 仅用于 open/resume，
  Web 收到的短期 Terminal token 通过独立 header 转发且不进入 React state。Control Plane 只保存 token digest，
  worker stdin 只在有界、未确认 command mailbox 中短暂存在，ack 后立即删除。
- Worker 在 install network 断开并重新 inspect 后才连接 inner PTY；command cursor 只在本地 PTY effect 成功后
  ack，output id 可幂等重试，stdout/stderr 分流执行跨 chunk Secret redaction。execution/lease/session 终止会
  关闭 PTY、清空 mailbox、revoke token，cursor reconnect 不重放已确认输入。
- `runtime-core` 已建立 strict、有界 `ExecutionFilesystemDiff` artifact；rootless entry 在主命令结束后先请求
  Worker 关闭 PTY，再捕获 added/modified/deleted，排除 dependency、build/test output 与 runtime-managed files。
  Worker 按 exact snapshot bytes/Workspace identity 重建 SourceTrace 并 canonical encode，Secret guard 在 artifact
  出站和 Control Plane 入站继续 fail closed。Remote resolver 校验 grant、descriptor、digest 与 diff identity。
- Execution Center Files 只按需下载 diff，默认不选择任何变更。modified/deleted 必须是 whole-file UTF-8、
  单一 `code-artifact` SourceTrace、exact partition revision 与 baseline byte 全匹配；deleted 额外要求 exact
  Workspace/Route revision、可解析 lifecycle、无 active CodeSlot，并通过 canonical delete Intent 预检。added
  必须是受支持扩展名的完整 UTF-8 CodeArtifact、无伪造 SourceTrace、exact Workspace revision、目标 path/id
  无冲突，并通过 canonical create Intent 预检。显式选择按 add -> modify -> delete 确定性排序，组成一个经过
  dry-apply 的可逆 Workspace Transaction，再进入 controlled round-trip Gate、Durable Outbox 和 Atomic Commit；
  runtime FS 从不直接覆盖 Workspace。

### 未实现

- Terminal/Files 尚缺完整 SourceTrace 导航与终端仿真器；Network 已建立 metadata-only strict current contract、
  Remote install proxy、Browser fetch、Data HTTP adapter、operation/invocation correlation 与基础产品视图，
  generated-project mock/public-live runtime、Browser/Remote runtime asset projection 与 Remote server/edge
  gateway 已接入。finite Remote Preview 后续 Data trace 通过 exact active-job Session observation 进入同一
  Execution Center，旧 generation/stop 后的响应被拒绝。
- Browser/Remote provider 基础切换及 manual cancel/restart 已实现；重连、artifact expiry、quota 与
  permission UX 未完成。
- 当前 Remote Terminal broker 是 Control Plane 进程内、可丢弃短期态；第一纵切要求单副本或
  terminal session 粘性路由。跨 Control Plane 副本共享 broker、故障接管与 resume continuity
  属于完整 Remote recovery，尚未完成。
- Remote 当前 durable 输出的 Secret canary Gate 已覆盖 log/diagnostic/trace/artifact/test-report/cache/crash；
  Structured Console 已增加 generated serializer、父窗口 strict decoder、runtime-core normalization 与 copy
  boundary 四层常见 credential 脱敏。Remote Terminal 已在 Worker 出站、Control Plane 入站和 copy projection
  逐层执行已知 Secret/常见 credential 脱敏，并以跨任意 chunk 与 stdout/stderr 分流 canary 覆盖；Console/Issues/Data 的完整可导航
  correlation 与 Golden CRUD 调试旅程未完成。

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

当前 `@prodivix/runtime-core` 已实现 strict iframe bridge、结构化 log normalization、Session 在 finite
Remote Preview terminal 后的 exact-job Console observation，以及 event/observation 共享 retention 预算。
React/Vite 生成工程只在 iframe embed 模式包装 application Console 与 window error；顶层 standalone
运行不改变原 Console。Browser exact origin、Remote opaque capability origin 与 exact `message.source`
共同构成接收 fence。父窗口不信任应用上报的 `redacted` 标记，copy 动作也只消费再次脱敏后的有界投影。

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

当前 Core controller 已实现上述 transport-neutral 操作语义，并且不提供 cwd 选择、runtime FS 导出或
Workspace 写入 API。stdin 原文只转交 adapter，不进入 replay/history；Core 仅保留 salted、有限的指纹尾部
以判定 reconnect retry 的 duplicate/conflict。Remote broker/client/HTTP transport、Backend owner gateway、
Worker command coordinator 与 rootless Podman inner PTY 已实现；Web 只保留短期 bearer 的 ref，并以 output cursor
恢复。runtime filesystem 只通过 artifact/proposal 产品流采纳 whole-file CodeArtifact 与显式 Asset import/replace：
Code modified 使用 fenced `source.update`，added/deleted 使用 fenced canonical VFS create/delete Intent；Asset added/modified
要求 exact document/baseline/media 与 local/Backend upload receipt，再使用 `document.create` / `asset.content.replace`。
所选 Code/Asset change 进入同一个可逆 Workspace Transaction；partial/aggregated、未知 binary、runtime Asset delete、
active CodeSlot、controlled PIR projection、stale、path conflict、缺失/伪造 receipt 与 incomplete change 明确 blocked，
不存在直接 Workspace 写入 API。

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

- [x] 定义 Console record/strict bridge/Session observation 与条数、字节、深度、节点预算。
- [x] Browser/Remote process、runtime error 和 generated application Console adapter。
- [ ] source map/source trace、Issues 和 Data correlation。
- [x] all/error/application/system filter、bounded clear、copy-safe-payload 与 redaction/truncation UX。
- [ ] pause 与不清除 Session history 的纯 view clear。

完成条件：同一错误从 Console 和 Issues 定位到同一作者态目标；clear 不删除 authoritative session。

### R3：Terminal

- [x] transport-neutral Terminal session/controller、lease fence、cursor replay、stdin 幂等、resize/signal/close 与双预算 contract。
- [x] Remote PTY transport adapter、短期 token、disconnect/reconnect 与 execution cleanup。
- [x] capability/permission/unsupported product state；Remote Preview 显式 available，Browser 显式 unsupported，不提供 fallback。
- [x] execution FS diff artifact、revision-fenced whole-file CodeArtifact add/modify/delete VFS proposal 与显式原子采纳；不提供直接 Workspace 写入。

完成条件：disconnect/reconnect 不乱序；终止 execution 会关闭 terminal 和 revoke token。

### R4：Network

- [x] transport-neutral metadata-only Network trace/span current contract 与 durable event 预算复用。
- [x] Remote install allowlist proxy/agent、Browser client-safe fetch 与 Data HTTP adapter。
- [x] Data operation/invocation/sequence/attempt/source trace correlation；generated public live runtime 已覆盖
      retry/pagination/cache/optimistic correlation。
- [x] header/query/body/credential 在 contract 层不可表达，Web 只接受 strict decode。
- [x] Remote finite Preview 使用 bounded Session observation；exact active Job identity、generation stale fence、
      duplicate/conflict 处理与 Session 总 retention budget 已验证，不复活 terminal Job。
- [x] Remote Network durable ingestion 复用统一 Secret guard，canary 不进入 trace 或客户端 replay。
- [x] Console generated/bridge/core/copy 四层 credential redaction 与 Remote durable canary guard。
- [x] Terminal Core output/copy 的已知 Secret 与常见 credential redaction、copy byte budget。
- [x] Remote PTY 跨 chunk/transport canary、stdout/stderr 独立 streaming redaction 与 export-safe copy Gate。

完成条件：Browser/Remote 的 trace 字段语义一致，敏感字段不会抵达客户端。

### R5：Provider-neutral Runner UX

- [ ] capability、zone、environment、target 与 provider selector。
- [ ] queue/install/start/ready/reconnecting/stopping/terminal 状态。
- [ ] quota、network denial、artifact expiry、worker loss 和 retry guidance。
- [x] cancel acknowledgement、`cancelling` 等待、terminal fence 与 manual new-request restart；保留旧事件且
      mutation 永不自动重放。
- [ ] design/interactive/run 切换保留 selection/view preference，不保存 runtime truth。

完成条件：所有失败都可操作；不存在假 loading、沉默 fallback 或无限重试。

### R6：Golden 调试旅程

- [ ] CRUD 页面从 Collection 触发 query/mutation。
- [ ] loading/empty/error/retry/pagination/optimistic 在 Preview 可观察。
- [ ] Console、Network 与 Test report 使用同一 correlation/source trace。
- [x] Remote Terminal 执行真实 PTY 命令、resize 与 execution-local FS 写入；rootless Gate 验证无 host Workspace 回写并清理 orphan。
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
- [x] Project Runner 可在 Browser/Remote 间切换且运行 exact revision。
- [x] Console、Network 与 Test 使用 transport-neutral contract。
- [x] Terminal 使用 transport-neutral contract；Remote PTY/token/reconnect/cleanup 已接入产品路径。
- [ ] 所有运行诊断都能回到稳定作者态目标或明确说明不可定位。
- [x] Secret 不进入 runtime FS artifact；runtime FS 只有经用户显式确认的可逆 Transaction 才能进入作者态。
- [ ] Golden CRUD 调试旅程通过。
