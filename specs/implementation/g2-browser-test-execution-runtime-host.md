# G2 Browser Test Execution 与 Runtime Host 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：G2 Browser/Remote Test Contract + Product Gate Implemented Locally / Post-G2 Scale Extensions Deferred
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-16
- Owner：`@prodivix/runtime-core`、`@prodivix/runtime-browser`、`@prodivix/runtime-remote`、
  Remote Worker、Compiler、`apps/web` composition root
- 关联：
  - `specs/implementation/g2-executable-full-stack-workspace.md`
  - `specs/implementation/g2-execution-provider-remote-runner.md`
  - `specs/decisions/44.browser-test-execution-and-runtime-host.md`
  - `specs/decisions/40.execution-provider-and-job.md`

## 目标

让 Workspace Test 作为导出工程测试宿主运行 exact Canonical Workspace revision，并通过共享
Execution contract 返回工具无关的 `ExecutionTestReport`。Preview 与 Test 可以复用匹配的依赖
install cache，但必须拥有独立 provider、Job、Session、取消与结果；Browser 与 Remote Test
通过同一 conformance，而不是让 Web 理解 Vitest、Playwright 或容器供应商私有 JSON。

G2 的 Test 验证工程运行、Data runtime 和导出 parity。它不是 G3 的 BehaviorScenario、
VerificationPlan 或 VerificationEvidence，也不把运行报告持久化为 Workspace 作者态。

## 当前基础与缺口

### 已实现

- transport-neutral `ExecutionTestReport` 与 `test.report` trace contract 位于
  `@prodivix/runtime-core`。
- Browser Test Provider 具有独立 descriptor、invocation/capability、Job 与 Session。
- `@prodivix/runtime-browser` 在 adapter 边界把 Vitest 私有结果转换为 shared report。
- `BrowserProjectRuntimeHost` 管理 filesystem snapshot、dependency install、process 与 dispose。
- Preview/Test owner-scoped process 相互独立，可复用匹配 dependency install。
- Web 测试表面消费 shared report，不解析 Vitest JSON。
- Compiler 直接产出 provider-neutral Executable Project Snapshot，Browser Test 只消费。
- Browser/Remote Test 在 canonical report 被接受后发布 strict metadata-only `server.function` invocation trace；
  generated JSONL 受 4 MiB/10,000 records/16 KiB line预算、mode-0600 与 exact CodeArtifact SourceTrace约束，
  私有 trace artifact不进入用户可下载或 durable artifact列表。

### G2 后续扩展边界

- G2 固定执行 exact snapshot 的全 Workspace Test plan，并支持 run/rerun；预运行 discovery、selected run、
  watch 与 re-run failed 属于后续 authoring/product-scale capability，不是 G2 CRUD closure 的隐含条件。
- canonical report 已在 Core 与 Vitest adapter 双层固定 4,000,000-byte、256 files、4,096 cases、
  failure message 与 SourceTrace 预算；超预算 fail closed 为 `TST-5002`，不伪造 truncation 或 partial assertion report。
- 完整 CRUD/live/capability target matrix 已由 React/Vue、Browser/Remote Test 与独立 Preview/production live journey
  关闭；live gateway不得穿透 Workspace Test。
- Vue/Vite 已进入同一 mock-only contract，并由 ADR 54 完成 layout/outlet、deterministic authenticated Catalog 产品
  Golden与独立 Remote live snapshot、strict parent bridge、Backend PostgreSQL Golden。

## Test request 与 report

Test request 必须显式声明：

- exact Workspace/snapshot revision 与 target；
- `profile=test`、`runtimeZone=test`、`invocation=test`；
- test selection/filter、timeout、required capabilities；
- deterministic fixture identity 和强制 mock-only policy；environment snapshot reference 禁止出现；
- stable diagnostic target 与非秘密 metadata。

当前 `ExecutionTestReport` 已稳定表达：

- report id、tool identity、started/completed/duration 与 passed/failed report outcome；
- file/case stable id、display name、`passed / failed / skipped / todo` status 与 duration；
- bounded failure message，以及 file/case 级 optional SourceTrace；
- deterministic summary。

request/job/provider/snapshot identity 由包含 report 的 Job、Session、`test.report` trace 和 report
artifact correlation 负责，不复制进 report domain object。`cancelled / timed-out` 是 Job terminal
outcome；如果执行未形成完整工具报告，不能伪造 passed/failed report。唯一规则已经冻结：

- report、failure、SourceTrace 与 tool metadata 受 Core canonical budget 和 adapter 私有输入 budget 双重限制；
  canonical report 不使用 truncation marker，超限一律作为宿主/转换失败；
- stdout/stderr 使用有界 Session log，attachment 只能作为 digest/size/media type 已验证的独立
  `ExecutionArtifact` 引用，不嵌入 report，也不接受供应商 URL 或未知私有字段；
- 只有完整 canonical report 才能发布。cancel/timeout 前尚未完成 report 时不发布 report artifact/trace；
  已进入 terminal 后不能追加 report，因而不存在 partial report 或 terminal outcome 漂移。

工具 adapter 负责把 Vitest 等私有结构转换为这些字段。共享层不承诺 snapshot serializer、hook
内部状态、runner task object 或供应商 artifact URL。

Server Function Test invocation不扩张 report domain object。provider只在 canonical `test.report` 后消费独立 strict
trace file，校验 request/provider/snapshot `server-function` capability、deterministic fixture provision、exact span/function/
attempt与唯一 CodeArtifact SourceTrace，再投影同一 Session observation；missing report、stale file、unknown field、
credential-shaped field与source drift均 fail closed。

## Runtime Host 不变量

1. Host 由 composition root 长期拥有，单个 React component 不自行创建全局 runtime。
2. 每次 Preview/Test 执行有 owner scope 与 generation；stop/dispose 不能终止其他 owner process。
3. dependency cache key 至少绑定 runtime implementation、target、manifest、lock/install fingerprint
   与 policy；不能只按 Workspace id 复用。
4. filesystem generation 始终从 immutable snapshot materialize；cache 不携带旧项目文件。
5. Test 和 Preview 可共享 install cache，不共享 active server、Job、Session、cancel 或 result。
6. report/session event 是可丢弃运行态，不写 Workspace、local replica 或 outbox。
7. runtime FS 变化不自动回写；采纳必须通过 diff proposal 与 Workspace Transaction。

## Test isolation 与环境策略

- Workspace Test 强制使用 deterministic mock environment；当前 Browser/Remote Test contract 不提供 live
  opt-in。需要生产探测时必须建立独立、显式且 query-only/isolated 的后续 capability，不能复用 Test provider。
- mutation fixture 需要 per-run namespace、cleanup 或事务回滚策略，禁止无隔离访问生产环境。
- clock、random、id 和 scheduler 通过 runtime test ports 注入，以便 retry/pagination/optimistic
  行为可重复。
- Test composition 拒绝 environment resolver/`environment-binding`；Secret 不得进入 report、console、snapshot
  或 attachment。
- test file、generated source 与 user code 运行在 provider sandbox 中，受 timeout、memory、process、
  filesystem、network 和 output budget 限制。

## 实施阶段

### T0：Shared report contract

- [x] transport-neutral report、file/case/outcome 与 trace contract。
- [x] strict adapter boundary；Web 不解析工具私有 payload。
- [x] Core/adapter 双层 report budget、unknown-field hard cut、独立 attachment artifact 边界与 SourceTrace conformance。
- [x] request/job/provider/snapshot/report/artifact 使用 exact execution/report identity 与 SourceTrace correlation。
- [x] cancel/timeout 无完整 report 时不发布 artifact/trace；partial report 不可表达，terminal 后不可追加。

### T1：Browser Test Provider

- [x] 独立 provider descriptor、request/job/session lifecycle。
- [x] Browser runner adapter 与 Vitest result conversion。
- [x] run/cancel/result/error 产品表面。

### T2：Shared Runtime Host

- [x] composition-root-owned host。
- [x] filesystem/install/process owner scope 与 dispose。
- [x] Preview/Test dependency install reuse，不共享 execution state。
- [x] generation race、stale lease、owner-scoped cancel 和 failed-install retry recovery conformance。

### T3：Neutral snapshot migration

- [x] Test compiler/plan 产出 Executable Project Snapshot current contract。
- [x] Browser Test consumer 去除 Browser-owned snapshot dependency。
- [x] snapshot digest、target 与 source trace 纳入 request/result correlation；selection 继续为全 Workspace Test plan。
- [x] 删除兼容层。

完成条件：Browser Preview/Test 与 Remote Test 可以消费同一 snapshot，不复制工程 planner。

### T4：Remote Test Provider

- [x] Remote descriptor、start/cancel/event/report/artifact adapter。
- [x] worker-side Vitest adapter 私有 payload 只在 Worker 内转换，公开 shared report。
- [x] cursor replay、disconnect、timeout、bounded worker loss 与 manual recovery semantics。
- [x] artifact digest/TTL/authorization、bounded report upload，以及 upload-before-trace 顺序。
- [x] metadata-only Server invocation JSONL capture、report-before-invocation ordering、private artifact exclusion、
      exact snapshot SourceTrace与 Worker/Remote provider双重 strict validation。
- [x] Web 使用 Browser/Remote selector、同一 Session/state/report UI；未登录 Remote fail closed。

完成条件：Web 对 Browser/Remote Test 使用同一 selector、state 与 report UI。

### T5：Data 与 environment test runtime

- [x] deterministic mock adapter/fixtures 是唯一 Test environment，mock miss 不回退 live。
- [x] Data operation trigger、loading/empty/error/retry/pagination/optimistic fixture kernel。
- [x] Browser/Remote 两层 live/environment denial、network policy、Secret canary 与 mutation namespace isolation。
- [x] Console/Network/Test report 通过同一 Job/Session、operation identity 与 SourceTrace 关联。

完成条件：mock 缺失 fail closed，不静默访问 live；test report 无 Secret。

### T6：Test authoring/product flow

- [x] G2 使用 immutable 全 Workspace Test plan，支持 run all/rerun；selected/watch/re-run failed 明确延后为产品规模扩展。
- [x] 当前 revision、运行 revision 和 stale result 明确可见。
- [x] report failure 可按 SourceTrace 跳转 Workspace 作者态。
- [x] canonical report 与 Session retention 已有硬预算；large-suite virtualization 明确延后，不以无限 DOM/report 承载冒充 G2 closure。

完成条件：用户可以从一个失败用例直接定位作者态，并判断结果是否已 stale。

### T7：Parity 与 Golden

- [x] Browser/Remote shared canonical report conformance suite。
- [x] React/Vite 与 controlled Vue/Vite 投影同一 mock-only runtime/test contract。
- [x] Golden CRUD journey 覆盖 Test mock，以及与 Test 隔离的显式受控 Preview/live environment。
- [x] standalone install/typecheck/test/build/browser-smoke first vertical。

完成条件：同一 snapshot/fixture 的语义结果一致；runner/tool 差异不会泄漏到产品 contract。

## G3 明确延后

- BehaviorScenario、VerificationPlan、VerificationEvidence；
- 可视化行为录制、proof artifact 与发布阻断策略；
- 跨浏览器矩阵、视觉回归治理和测试智能生成闭环。

G2 report 可以成为未来 Evidence 的输入，但不能提前宣称自己就是 Evidence。

## Gate

| Gate               | 断言                                                                |
| ------------------ | ------------------------------------------------------------------- |
| Provider isolation | Preview/Test provider、Job、Session、cancel/result 不共享           |
| Host lifecycle     | install 可复用，project generation/process 不串 owner               |
| Report neutrality  | Web/shared package 不解析 Vitest/Remote 私有 JSON                   |
| Revision           | request/report 精确绑定 snapshot digest 与 Workspace revision       |
| Data safety        | Test 强制 mock-only；environment/live/Secret 穿透在多层 fail closed |
| Parity             | Browser/Remote 和两个 target 使用同一 conformance/runtime journey   |
| Persistence        | report/event/attachment 不成为 Workspace truth                      |

## 风险与停止条件

- 如果 Preview/Test 为了复用而共享 active process 或 cancellation，先修 owner scope。
- 如果 Web 需要判断 Vitest task shape 或 Remote payload，先修 adapter/report contract。
- 如果 mock miss 会 fallback live，停止 Data test integration 并改为稳定错误。
- 如果测试报告无限保存 stdout、stack 或 attachment，先加预算和 artifact reference。
- 如果普通 G2 report 被持久化为 VerificationEvidence，保持运行态并延后 G3 模型。

## 验收标准

- [x] Browser Test 已使用独立 provider 和 shared report contract。
- [x] Preview/Test 只复用安全的 install cache。
- [x] neutral snapshot、Remote Test 与 recovery conformance 完成。
- [x] deterministic Data test runtime 与 Secret/mutation safety Gate 完成。
- [x] Browser/Remote、React/Vite/第二 target 的 bounded产品 Golden CRUD 通过。
