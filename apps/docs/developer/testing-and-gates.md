# 测试与产品 Gate

测试的目的是验证稳定语义、积累产品证据，而不是锁死 DOM 层级、class 名或内部实现细节。

## 测试层次

| 类型        | 命名                               | 适合验证                                 |
| ----------- | ---------------------------------- | ---------------------------------------- |
| 示例/单元   | `<subject>.test.ts(x)`             | 小粒度的公开行为与明确示例               |
| 属性测试    | `<subject>.property.test.ts(x)`    | 不变量、往返一致性、幂等性及任意输入组合 |
| Conformance | `<subject>.conformance.test.ts(x)` | 跨实现的稳定契约与产品 Gate              |
| Integration | `<subject>.integration.test.ts(x)` | 多 owner 的边界组合                      |
| E2E         | `<journey>.spec.ts`                | 真实用户旅程                             |

针对 codec round-trip、Command apply/revert、operation idempotency、graph normalization 和 source projection，应优先采用属性测试。当属性测试已覆盖某一语义后，不必再保留大量重复的示例测试。

不要编写依赖 `querySelector`、`closest`、`parentElement`、具体标签层级、内部 class 或快照的耦合测试。UI 测试应关注用户可感知的结果与公开状态。

## 常用命令

```bash
pnpm test
pnpm test:web
pnpm test:golden
pnpm test:e2e:smoke
pnpm lint
pnpm build
```

针对单个 package 时可使用 pnpm filter，避免每次都运行整个仓库的测试。

## G0 与 G1 Gate

```bash
pnpm verify:g0
pnpm verify:g1:standalone
pnpm verify:g1:browser
```

- G0 Gate 验证非浏览器 Truth & Change Kernel。
- G1 standalone Gate 会在独立目录中执行安装、类型检查、测试和构建导出项目。
- G1 browser Gate 在真实浏览器中验证 route/form 行为，并使用真实 WebGL2 以及（环境可用时的）WebGPU 编译最小 shader。

WebGPU 不可用时，必须如实记录为环境能力结果，不得伪造成功。视觉回归、accessibility、performance 和正式的 `VerificationEvidence` 属于独立的 Gate。

## Workspace Test 运行

编辑器中的 Test 页面用于运行当前 Canonical Workspace revision 导出的独立 React/Vite 或 Vue/Vite 工程。framework target 与 Browser/Remote Test ExecutionProvider 可分别选择；如果存在 blocking export diagnostic，运行将被阻断。准备就绪后，会在 `test` runtime zone 中启动该 snapshot 声明的 Vitest plan；Remote 模式需要已登录的会话。

Preview 与 Test 是两个独立的 Provider：它们拥有各自的 descriptor、ExecutionJob、Session、取消和结果，仅共享 `BrowserProjectRuntimeHost` 的 filesystem、依赖安装与 browser Node runtime。这样既能复用昂贵的安装资源，也不会把预览 server 和测试进程混为同一个生命周期。

Vitest JSON 只在 Browser/Worker adapter 边界转换为 `@prodivix/runtime-core` 的 `ExecutionTestReport`。Test 页面展示 file/case status、duration 与 failure message，并通过共享 Execution Center 提供日志、停止和重跑。Browser 与 Remote 均强制使用 snapshot fixture 的 mock-only Data runtime；Test 不接受 environment binding，也不会在 fixture miss 时回退到 live。

`TST-5001` 表示已取得报告后的用例/测试失败；`TST-5002` 表示宿主准备、命令执行或报告转换环节的失败。两者均属于 G2 Workspace Test execution diagnostic，而非 VerificationEvidence code。

这个 G2 纵切是 Workspace 导出工程的测试宿主，不等同于 G3 的 `BehaviorScenario`、`VerificationPlan` 或 `VerificationEvidence`。运行报告与 Session event 属于可丢弃的运行态数据，不会写入 Canonical Workspace 或 Outbox。

## G2 Data closure Gate

```bash
pnpm verify:g2:data-protocols
pnpm verify:g2:vue-target
pnpm verify:g2:vue-product
pnpm verify:g2:data-security-matrix
pnpm verify:g2:data-closure
pnpm verify:g2:execution-source-debugger
```

`data-protocols` 验证 Data core、HTTP/OpenAPI、GraphQL、AsyncAPI、Web authoring 和 Backend Workspace contract；`vue-target` 验证 Data portability；`vue-product` 在临时目录中执行 Vue PIR/Route/Auth/Server/Asset authenticated Catalog 的 install、typecheck、Vitest、build 和真实 Chrome smoke，并验证 Web target selector；`data-security-matrix` 验证 Remote、Worker、Web、Backend 和 credential canary 边界；`data-closure` 串联当前整组 D8 有界 Gate。`execution-source-debugger` 验证 Console/Artifact、Test Report 和 Runtime Files 仅通过 exact Job/provider/snapshot correlation 和唯一 SourceTrace 返回当前作者态，stale/ambiguous source 一律 fail closed。

当前有界 target matrix 覆盖了 React/Vue、HTTP/GraphQL/AsyncAPI、Preview/Test/Build、client/mock 和显式 server/edge gateway；GraphQL subscription 和 AsyncAPI SSE/NDJSON stream 采用 pull-driven bounded bridge。以下能力仍处于阻断状态：真实 Remote authenticated Catalog、Vue layout/outlet、完整 Asset delivery/sanitize UI matrix、stream reconnect/resume、Secret stream 及更多 transport。

## Closure evidence

通过 Gate 需要提供可重复的证据，而不是”测试大概都绿了”这样的模糊判断。当前证据保存在：

- `specs/roadmap/g0-closure-evidence.md`
- `specs/roadmap/g1-closure-evidence.md`
- `specs/roadmap/g2-closure-evidence.md`

阶段定义保存在 `specs/roadmap/global-phases.md`，产品文档仅作摘要引用，不另建第二份状态表。
