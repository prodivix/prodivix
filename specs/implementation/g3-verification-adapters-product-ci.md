# G3 Verification Adapters、产品表面与 CI 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：V6 Implemented / durable CI Evidence Passed；V7 product/CLI pending
- ProductGateStatus：In Progress
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-30
- Owner：`@prodivix/verification`、`@prodivix/verification-adapters`、`@prodivix/verification-browser`、`@prodivix/runtime-core`、Compiler/Runtime providers、`apps/backend`、`apps/web`、CI composition
- 关联：
  - `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md`
  - `specs/decisions/63.verification-product-surface-diagnostics-and-ci.md`
  - `specs/implementation/g3-verification-plan-impact-policy.md`
  - `specs/implementation/g3-verification-evidence-provenance-retention.md`
  - `specs/implementation/g3-deterministic-replay-runtime-controls.md`

## 目标

用受控 adapter 把 canonical VerificationPlan cell 映射到具体检查工具和 runner，将工具私有结果收敛为 bounded、
未经信任的 `VerificationCheckReportCandidate`，再由 Verification Core 独家规范化为
`VerificationEvidenceCandidate`。交付
Scenarios/Verification/Issues/Execution/SourceTrace 一体的产品 journey，以及与 Web 使用同一
planner、codec、adapter 和 Closure evaluator 的 provider-neutral CLI/CI contract。

## 范围

- adapter registry/SPI、capability snapshot、tool identity、normalization/error classification；
- diagnostics/build/unit/integration/E2E/visual/a11y/performance/security families；
- Preview、Export、CI surface 与 React/Vite、Vue/Vite targets；
- Chromium primary matrix、Firefox/WebKit critical black-box subset；
- product navigation/layout/state/recovery/accessibility；
- plan/run/watch/cancel/resume/promote/closure CLI JSON；
- Backend run/evidence correlation、CI attestation/upload/finalize；
- aggregate adapter/product/Golden Gate。

## 非目标

- Web 直接解析 Playwright/Vitest/axe/visual tool 私有 JSON；
- 在每个 framework 复制 Scenario 或把 test source 作为 canonical behavior；
- 未受控第三方 adapter marketplace；
- 将 verification probe 打进 production bundle；
- 自动 baseline 接受、自动 exemption、自动 repair 或部署审批；
- 用单一 CI provider workflow 定义 VerificationPlan。

## Adapter SPI

每个受控 adapter 包导出 descriptor + factory。`VerificationAdapterDescriptor` 与 `VerificationAdapter`
的形状由 ADR 62「Adapter 生命周期与信任边界」冻结，本节不重述,只补运行期签名细节：

```ts
type VerificationAdapter = Readonly<{
  preflight(
    cell: VerificationPlanCell,
    context: VerificationAdapterContext
  ): Promise<VerificationAdapterPreflight>;
  prepare(
    input: VerificationAdapterPrepareInput
  ): Promise<VerificationAdapterPreparedInvocationCandidate>;
  execute(
    invocation: PreparedVerificationInvocation,
    sink: VerificationEventSink
  ): Promise<VerificationCheckReportCandidate>;
  cleanup(
    input: VerificationAdapterCleanupInput
  ): Promise<VerificationAdapterCleanupResult>;
}>;
```

两条约束直接来自 ADR 62，实现时不可绕过：

1. **adapter 没有 `normalize()`。** `execute` 的产物是 bounded、未经信任的
   `VerificationCheckReportCandidate`；normalization 与 `VerificationEvidenceCandidate` 构造由
   `@prodivix/verification` Core 独家负责。若 adapter 自己产出 Evidence candidate，ADR 58 的 intake gate
   就变成复核 adapter 的自述结论，Evidence 可信度随 adapter 数量线性劣化。
2. **能力声明是可枚举数组，不是谓词。** descriptor 用 `checkKinds`/`surfaces`/`targets`/`browserEngines`/
   `controlCapabilities` 数组，它们既驱动 matrix 展开，也进入 registry snapshot digest。
   `VerificationCapabilityPredicate` 与 `VerificationCheckFamily` 不存在 —— 谓词无法进入 digest、
   无法确定性展开，会击穿 ADR 57 的 byte-stable plan digest。

边界：

- descriptor 是构建期 registry contribution，不从 Workspace 动态加载代码；
- `preflight` 只判断 capability/contract，不执行检查或修改 Plan；
- `prepare` 只接收 exact plan cell 和 content-addressed inputs；
- raw tool output 留在 adapter/sandbox staging，只有 bounded、未经信任的
  `VerificationCheckReportCandidate` 越过 adapter 边界；Evidence normalization 仍只在 Core；
- event sink 使用 canonical lifecycle/progress/diagnostic/artifact envelope 并有预算；
- cleanup 无论 success/failure/cancel/timeout 都运行，并报告 residual canary；
- adapter 不写 Workspace/Evidence DB，不解析 Secret，不改变 required/advisory。

Core lifecycle kernel 对同一 attempt generation 强制 concurrent single-flight，并把 resolved input、event 与
artifact staging 绑定到 exact `planDigest/cellId/attemptId/generation`。registered first-party adapter 的
`cleanup` 是 terminal acknowledgement；cleanup 后 Core port 永久拒绝该 generation 的 event/stage，detached
JavaScript timer、late promise 或回调不能成为可追溯结果。跨进程/序贯 exact-once 继续由 V5 PostgreSQL
AttemptGrant 的 `UNIQUE(workspace, plan, cell, attempt)` 与一次性 claim authority负责；generation 不写入 V5
Evidence wire。

当前 package owner 配置为：

- `@prodivix/verification`：descriptor/registry/SPI、lifecycle kernel、candidate normalization 与 Evidence 构造；
- `@prodivix/verification-adapters`：diagnostics/build/unit/integration 的 first-party controlled factory；
- `@prodivix/verification-browser`：E2E/visual/accessibility/performance/security 的 private decoder、
  comparison kernel 与 Browser invocation port；
- Runtime/Compiler/Golden 只组合 exact snapshot/provider/probe 与 matrix，不重新拥有 adapter contract。

## Registry 与 capability snapshot

registry entry 包含 adapter descriptor digest、package/build identity、tool/version/schema compatibility、target/browser/
runtime support、control support 和 known limitations。Planner 使用 immutable snapshot；runner 执行前 exact match，drift
则 cell blocked 并重建 Plan。

public adapter API 不暴露 Playwright `Page`、Vitest task、axe result、browser context、filesystem path 或 vendor SDK。
future G6 adapter 必须先通过相同 conformance/security boundary，G3 只允许 first-party/explicitly bundled adapters。

Golden conformance 的 AJV runtime schema compile 暂时需要 `unsafe-eval`；受控 Golden CSP 基线显式声明该
能力并绑定独立固定 digest，Browser security cell 对同一 Golden production output验证 exact policy/no widening。
这不等于 hardened production CSP；移除 `unsafe-eval` 需由 Compiler 预编译 AJV validator 后另行收口。

## Check families

### Diagnostics

输入 Workspace/Semantic/Compiler projection，运行 schema/reference/type/owner/boundary diagnostics。结果按 stable diagnostic
code/target/source normalized；不得只保存 console text。可在 Preview/CI 运行，Export surface 验证 standalone source mapping。

### Build

对 exact ExportProgram/materialized target 执行 install/build/static output validation，记录 toolchain、lockfile/content digest、
output manifest、bounded log。Linux controlled static adapter 的 image build 以真实 frozen/offline pnpm
验证 exact fixture manifest/lock 并生成 immutable seed；runtime install 则在只含 `HOME`/`PATH` 的
`network=none` 环境中，以 bounded Node authority command 重算 control、manifest、lock、workspace、Vite
config 与 isolation probe 的 exact digest/file-set identity，不访问 network/store，也不物化 `node_modules`。
通过后才从 digest-bound image seed 物化依赖并验证 archive/content/manifest/file-set identity 与
entry/bytes/depth 上限；两步不得合并成一个隐式 package-manager install。
所有跨进程 raw/artifact base64 边界必须先验证 canonical padding 与 decoded-byte budget，再以
`O(n)` 线性 scanner 解码；禁止用 quantified-group regexp 校验多 MiB payload，也禁止在预算检查前
构造完整 decoded string/array。Node 22 阈值以上的合法 payload 必须有回归测试。
build 环境 network phase 严格受 G2 allowlist，runtime phase无 egress；本机泄漏的 binary 不算依赖。

### Unit

发现 Code Authoring Environment 注册的 canonical test definition/owned file，不扫描任意 editor state。Vitest 等 adapter
解码私有结果为 suite/case/assertion/coverage summary；test source ref 进入 SourceTrace，snapshot update 禁止。

### Integration

在 isolated runtime 中组合多个 domain/Server function/Data fixture，使用 exact snapshot 和 deterministic controls。数据库/
service fixture 只允许 ephemeral、seeded、network-isolated；禁止 production connection string。

### Behavior E2E

执行 `BehaviorScenarioProgram`，通过 semantic target/action/observation driver。verification-only white-box probe 只暴露 stable semantic
identity、normalized state、SourceTrace 和 owner-declared readiness；生产 bundle tree-shake/strip，并由 build Gate 搜索 canary。

黑盒操作覆盖用户可见/可访问行为；probe 不能绕过点击/输入权限或直接修改应用 state 使测试通过。

### Visual

在 declared stable state 和 compatible rendering profile 采集 region/full-page artifact，执行 target/browser-specific baseline
comparison。diff 算法/version/threshold/mask semantic refs 进入 identity；动态区域只能用 authored semantic mask，不能运行时
自动忽略失败像素。

Baseline 必须在 attempt 前已由 Workspace Transaction 采纳并 content-addressed；compatibility identity 至少绑定
OS/browser/font/viewport/DPR/color/motion/renderer。禁止把本次 current screenshot 同时当作 baseline，或在 failure
后自动改写 baseline/mask。
GitHub workflow 固定 `ubuntu-24.04` 仍不等于 exact environment identity；runner 必须把实际
`ImageVersion` 与 pre-adopted registry 精确匹配。缺失/未知/漂移时 fail closed，不能降级成泛化 Ubuntu label。
容器工具链同样按组合身份验证：Podman、OCI runtime 与 conmon 必须映射到同一个已采纳 runner image
toolchain family 的绝对路径。共享 CI owner 在初始化后读取 `podman info` 校验实际 runtime/conmon，
避免 PATH 搜索把静态 Podman 与发行版组件混合；组件路径或选择结果不一致时，V6 不得开始构建 sandbox。

### Accessibility

组合自动规则与 Scenario semantic assertions：可访问名称、role/state、focus order/restore、keyboard interaction、live region、
contrast、reduced motion。adapter 规范化 rule id/impact/target/source；自动扫描通过不替代关键 journey 的 keyboard/focus check。

### Performance

使用受控 fixture/control/browser image，记录 navigation/interaction/animation budget、long task/layout/asset metrics。阈值和
sampling policy 来自 Policy；环境不可比时只 view-only/unstable。G3 关注 regression budget，不承诺生产 RUM。

### Security

验证 no-Secret/client bundle、CSP/headers、network allowlist、permission denial、artifact redaction、verification probe stripped、
path/archive/binary bounds 和 known unsafe capability。它不取代完整供应链/渗透测试，也不执行未批准 live target。

Security report 采用固定的 `4 + 3 + 2 = 9` owner/时序：

1. `@prodivix/verification-browser` runtime 只采集 network、CSP、Permissions Policy、sandbox 四项；
2. adapter 通过 content-addressed `security-observation-set` 接收 Secret scanner、full production bundle
   probe scanner、output artifact inspector 三项 G2 authority-bound observation；Secret/output owner 是
   `@prodivix/runtime-core`，bundle scan owner 是 `@prodivix/prodivix-compiler`。adapter 逐项按 source digest 与
   exact attempt binding 向真实 owner re-resolve；四项与三项组成 strict seven-rule pre-finalization report；
3. `@prodivix/verification` Core 在 artifact staging descriptor/bytes exact match、transport drain、terminal-port
   fence 和 clean cleanup 全部成功后，才 finalization `security.artifact-digest-drift` 与
   `security.cleanup-residual` 两项，并以
   public decoder 要求 strict nine-rule report。失败路径不得伪造这两项为已观察，也不得产生 Evidence candidate。

production probe scanner 的输入必须是 Compiler 产出的 exact full production bundle/source manifest。
`page.content()`/rendered DOM 只代表某一时刻的渲染结果，会遗漏未执行 chunk、worker、source map 与其他输出，因此
不得作为 `security.production-probe-leak` 证据。
Browser-owned network/header/sandbox observation 必须在 browser/provider trusted boundary 采集；author realm 对
`window`、DOM prototype、frame state 或公开 collector 的 monkeypatch 不得改变安全 verdict。

## Surface / target / browser matrix

### Surface

- `preview`：Editor Browser 或受控 Remote Preview，适合快速 local/remote evidence；
- `export`：从 exact ExportProgram 物化的 standalone app，在隔离目录/origin 运行；
- `ci`：非交互 runner 执行 canonical Plan，并生成 CI-attested Evidence。

同一 Scenario/Check identity 跨 surface，cell identity 区分 surface。Preview pass 不能替代 required Export/CI cell。
controlled Golden 的 Preview Browser 与 Remote 是同一 Plan cell 的两个 required attempts，而不是新增 matrix axis。
Remote attempt 必须实际经过 `@prodivix/runtime-remote` execution/control-plane、exact bundle、readiness 与 cursor
lifecycle；仅回显 request/result 的 fake transport 只可用于单元测试，不能计入 matrix evidence。
Data、Auth 与 Recovery 使用 Scenario-internal controlled profiles，不继续扩张 66-cell Plan；V6 aggregate 必须直接
运行各 profile 的 owner test/manifest，并在 evidence 中逐项列出，不得用旧 V2/V3 结果代替。
canonical companion manifest 位于
`packages/golden-conformance/src/goldenG3V6ControlledDimensionManifest.ts`，由
`test:g3-v6-controlled-dimensions` 精确重跑 8 个 owner suites、绑定 28 个指定 cases，并拒绝所选文件中的任何
failed/skipped/todo；其 manifest digest 与实际计数必须进入 V6 local/CI evidence。

### Target

- React/Vite：primary authoring/export target；
- Vue/Vite：G2 controlled portability target，验证公开 Route/PIR/Data/Auth/Server/Asset/Behavior contract；
- target-specific build/visual artifact 独立；semantic behavior/a11y expectation 可共享。

G3 不在此阶段开放第三框架；若某 capability 尚未在 Vue public contract 支持，对 required cell 返回 unsupported/blocked，
不能用 React-only 私有 probe 假装通过。

### Browser

- Chromium：完整 required Browser/E2E/visual/a11y/performance matrix；
- Firefox/WebKit：Policy 指定的 critical black-box behavior/a11y/route/data subset；
- browser-specific visual/performance 默认分别 baseline/threshold；
- unit/build/server checks 不人为展开 browser 维度。

critical subset 是 Policy 的显式 profile，并由 Impact/Scenario tag 选择，不是在 CI 中随机挑一部分。
trusted performance probe 的完整 owner contract 只在 Chromium primary matrix 执行；Firefox/WebKit
不得复制不属于 critical subset 的 runner-timing 测试来扩大 required Gate。

## V6 local adapter-matrix evidence record

root `verify:g3:adapter-matrix` 的成功输出必须能重算，不接受只有绿色退出码或测试文件数量的摘要：

| Evidence section       | Required fields                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical identities   | `planDigest`、adapter registry digest、matrix manifest digest、browser identity registry digest、visual baseline set/asset/normalizer digests、controlled-dimension manifest digest、aggregate evidence digest |
| Matrix totals          | 66 required cells、8 rows、58 browser cells、72 browser attempts、8 static attempts、80 total attempts；blocked/unsupported/skipped/failed 均为 0                                                              |
| Per-row totals         | `7/14、7/14、10/10、10/10、12/12、12/12、4/4、4/4` 的 cells/attempts，顺序绑定 manifest row id                                                                                                                 |
| Per-attempt binding    | cell/check/surface/target/browser/motion/provider identity、attempt id、report digest、resolved input-set digest、artifact digest set、normalized verdict、terminal/cleanup status                             |
| Runtime control        | 每个 browser attempt 的 initial/terminal same-context attestation、exact attempt/context binding、terminal residual=0 与 cleanup release receipt；不能只记录 start-time applied-control digest                 |
| Static retirement      | 每个 static attempt 的 artifact retirement receipt/digest，以及 aggregate `activeAttemptCount=0 activeArtifactCount=0`                                                                                         |
| Remote Preview         | 14 个 execution/provider ids、exact snapshot/durable bundle/materialized bundle digests、ready/healthy、resume/terminal cursor、independent origin/entry、clean cleanup/retirement                             |
| Security               | 8 个 attempts 的三项 G2 owner resolution exact-once audit、七项 pre-finalization digest、Core successful staging/clean cleanup 后 exact 九项 hard-rule report digest                                           |
| Private-path hard cut  | `VerificationCoverageSummary`、`VerificationBuildSummary`、`VerificationTrace` 三类 projection 的 absolute path/URL/vendor-field negative、codec/projector conformance 与 Golden staged bytes no-canary        |
| Controlled dimensions  | 17 profile ids、8 exact owner suites、28 bound cases、all-selected-files total passed count、`failed=0 skipped=0 todo=0`                                                                                       |
| Environment / residual | exact OS/runner `ImageVersion`、browser versions/image digests、Node/pnpm/toolchain；target lease、authority、artifact、late event/write 与 cleanup residual 全部为 0                                          |

### 2026-07-29 local result

`pnpm run verify:g3:adapter-matrix` 已在 Windows 本地完整通过；这是一条连续 root aggregate，不以先前的局部
通过代替。它验证了 29-package dependency build closure，以及 Verification `242/242`、Verification Adapters
`40/40`、真实 Browser Adapters `193/193`、Runtime Core `142/142`、Runtime Vitest `20/20`、
Runtime Browser `35/35`、Runtime Remote `109/109`、Compiler production probe `14/14`、static Golden
`69/69` 与 browser Golden `3/3`。Core/G3 boundaries 和 wire-contract mirror 在同一命令末尾通过。下列
digests 绑定该次 pre-CI-hardening 本地运行；当前 durable Linux identity 链以下一节为准。

controlled Golden 实际执行 66 required cells、8 rows、72 browser attempts 与 8 static attempts，共 80 个
`reported` + normalized `passed`；blocked、unsupported、skipped、failed 与 residual 均为零。逐行
cells/attempts 为 `preview-react 7/14`、`preview-vue 7/14`、`export-react 10/10`、
`export-vue 10/10`、`ci-react 12/12`、`ci-vue 12/12`、`ci-firefox-critical 4/4`、
`ci-webkit-critical 4/4`。本次 root run 的 canonical/run-bound digests 为：

- Plan：`sha256-bb49ad3980a1e1a8d84a3f4f74ec3c48ebda7cd3c72ee2f0605eb57259ef23a9`；
- matrix manifest：`sha256-f9f137d4744e08a5f452611305c3e4295e4fce3a4992f8328f2673eb71a688f3`；
- attempt manifest：`sha256-5ef7da56d9e6fcb5c112bd8823e10a89b297f97bdbdd8becd4594dbc8b80849b`；
- adapter/browser/visual identities：`sha256-06f219930d74f9365a694b53fb18a553264460a550d6635ba9149a0bfde263d1`、
  `sha256-4f02035b5bd907b871099bab946f5468114d7b40b6e9407de284bec37314d6f5`、
  `sha256-384a345e825802dbc73fbf8449a026ff60106196056d93f437d5292758076734`；
- baseline set/asset/raster/normalizer：`sha256-acf94061ff276ba26aa7a14a9d1adfc62dc1a214a2b832d894b1c6cf2d727a56`、
  `sha256-774d02c24278eb5c0c9eb4f8d5f4eabb5891a6b9c01429492d43d5c89b7a3928`、
  `sha256-9ebde0e380725ce43da1288d7b5116011dbba8215a5b8ce1c73af23d64c9c5cc`、
  `sha256-a58ee5c8f675cdba49dee439fb7db48bbc5ff8efb0d066bc8758816db7101069`；
- controlled manifest/evidence/environment：`sha256-5d7140c03a80aaeb24b43b535dec058827535844ed3d6bc435afc54e3fceeeb9`、
  `sha256-d61ffd2a9f30867449cf0e28e44cb9a1cbfd3cfcb52944900f5a307d463ff215`、
  `sha256-6158d900c7e842d14fe71d062aec83330742e25e84f5825173336c579e26515e`；
- runtime-control evidence set：`sha256-7b9f087795da302a9c4f181f485d57e76362f28e1b24eb0ab86815bac8e6425a`；
- aggregate evidence：`sha256-ec243c6d645bfb58b7b869c09775c284f91b21fc5a8c345d91c35eb1eae1362e`。

补充 Gate 还验证 Backend verification/verificationcontract 非缓存 Go 测试、remote worker `75/75` 与
rootless snapshot contract digest
`sha256-9680cb1ff4fd3ae39a5e46b618ac97068000aad2a7939d8d84b9f7ac2846f8a6`。Windows 本地不伪装
rootless Podman runtime evidence；真实 rootless sandbox 的 runner registry 必须将 Podman、OCI runtime、
conmon 与 cgroup manager 作为一个不可混用的 family 绑定。固定 `ubuntu-24.04` runner identity 和 durable CI
identity 由下述固定 commit Job 提供。

### 2026-07-30 durable CI result

commit [`bd6ef590`](https://github.com/prodivix/prodivix/commit/bd6ef5900d8b9cfad1f0f792bd134c92e96c9ffb)
的 [V6 CI Job](https://github.com/prodivix/prodivix/actions/runs/30494182310/job/90719037327)
在 `ubuntu24` image `20260720.247.2`、kernel `6.17.0-1020-azure` 上通过。Job 在 expensive matrix 前
依次 attest runner、Podman/crun/conmon/systemd-cgroup family、controlled static sandbox image，以及安装后的
Chromium/Firefox/WebKit executable 与完整 file set；随后 29-package cold build、Verification `243/243`、
Adapters `40/40`、Browser Adapters `193/193`、Runtime Core `142/142`、Runtime Vitest `24/24`、
Runtime Browser `35/35`、Runtime Remote `109/109`、Compiler `14/14`、static Golden `69/69` 与 browser
Golden `3/3` 全部通过。

本次 Linux root run 仍精确覆盖 66 cells / 8 rows / 80 attempts，aggregate evidence digest 为
`sha256-10f2ac6393aaa598ae8676b1665705c5654e5498794772182431f9e999b9fe83`；完整 identity 链记录在
[`g3-closure-evidence.md`](../roadmap/g3-closure-evidence.md#v6-reproducible-run)。

aggregate evidence digest 必须覆盖每个 attempt 的 report/resolved-input/artifact identity；只绑定
`status: reported` 会遗漏仍在 passed threshold 内的 visual/performance/a11y/security 输出漂移。Remote evidence
不能只记录 `providerKind: remote`，也必须绑定上述 execution/materialization/cursor/cleanup identity。

## Result normalization

所有 family 归一到：

- lifecycle：queued/preparing/running/collecting/completed/failed/cancelled/timed-out；
- verdict：passed/failed/blocked/unsupported/unstable；
- normalized finding/assertion/metric + stable code/rule/check target；
- SourceTrace/Scenario step/domain correlation；
- artifact manifests、budgets、truncation；
- tool/provider/control/input identities；
- failure class：product assertion、environment、infrastructure transient、contract mismatch、security denial、cancel/timeout。

unknown tool schema 或 undecodable partial output 产生 adapter failure，不从 exit code 猜 passed。process exit 0 但 required result
缺失也失败；exit nonzero 与结构化 findings 一起保留。

## 产品信息架构

### Scenarios

负责 authoring、record/review、compile、run/debug，详见 Scenario implementation。顶部只保留名称、revision/state 和主要
run/debug affordance；no-code 默认使用项目 current target 与 Policy 生成的 Plan，不常驻 target/provider 下拉。只有创建
matrix profile、解决 unsupported cell 或高级调试时，才在 Inspector 中显示 target/provider 选择与影响。

### Verification

单一工作区包含：

- Impact：change→consumer→Scenario/check explanation；
- Plan：required/advisory matrix、DAG、budget、blocked preflight；
- Runs：cell/attempt progress，复用 Execution Center；
- Evidence：trust/retention/artifact/timeline；
- Compare：compatible attempt/baseline diff；
- Closure：verdict、missing/failed/blocked/unstable 和 exemptions。

不再创建独立“Test 大卡片 + 大运行按钮”页面。未运行时主区展示 compact plan/list 和直接操作；无内容状态不占据大面积。

### Shared IDE shell

- bottom panel 作为 docked layout 区域参与主页面尺寸计算，可拖拽高度、折叠、最大化、恢复，并支持
  Console/Terminal/Network/Server/Files/Verification tabs；除显式最大化外不覆盖主内容；
- layout preference 仅 local UI state，不进入 Workspace；
- 产品下拉、combobox 与 menu 使用 `@prodivix/ui` 的可样式化、可访问 primitive；不得新增 raw HTML `select`
  形成不可控外观和重复交互；
- toolbar icon-only action 必须 tooltip/aria-label/shortcut，状态用 check/x/warning/spinner/blocked icon；
- destructive、permission 或 promotion action保留必要文字/确认；
- panel、list、inspector 支持 keyboard resize/focus，不依赖 pointer；
- SourceTrace 从 finding/step/network/console/artifact 跳转 exact revision；旧 revision 使用历史只读 view。

### Issues

Issues 聚合 `BHV-*` / `VER-*`，filter 支持 Scenario/check/family/surface/target/provider/revision。主列表显示 code、简短
message、location 和 state；工具 command、长 schema URL、stack 和 digest 放 inspector/copy details。错误用错误 icon，不靠重复
“错误”文字；同时保留 accessible label。

## CLI contract

建议命令（最终名字在实现时保持稳定并写入根 scripts）：

```text
prodivix verify plan --workspace <snapshot> --policy <id> --out plan.json
prodivix verify explain --plan plan.json [--cell <id>]
prodivix verify run --plan plan.json --surface ci --events events.ndjson
prodivix verify resume --run <id> --cursor <cursor>
prodivix verify cancel --run <id>
prodivix verify promote --run <id>
prodivix verify closure --workspace-revision <revision> --plan <digest>
```

- stdout machine mode 只输出 versioned JSON/NDJSON；human progress 到 stderr；
- exit code 区分 passed、verification failed、blocked/incomplete、contract/config error、infrastructure error；
- plan file 使用 strict codec、digest 和 bounded size；
- CLI 不能通过 flags 删除 required cells，override 必须是新的 canonical Policy/exemption revision；
- resume 只恢复 event cursor/promotion state，不重放 mutation attempt；
- token/Secret 仅通过标准短期 credential channel，绝不写 plan/events/artifact。

## CI contract

CI workflow 只是 composition：

1. checkout/materialize exact commit/revision；
2. 获取短期 OIDC/attempt grant；
3. 用 canonical planner 生成或验证 plan digest；
4. 执行 required cells，事件可断点续传；
5. 对 artifacts/candidates 本地预检；
6. 签名/attest run manifest；
7. 幂等 upload/finalize Evidence；
8. 查询 Closure 并以规范 exit code 结束；
9. 输出 concise summary + Evidence/Closure link。

workflow 与 adapter composition 必须同时满足以下 Gate 不变式：

1. pushed commit 的 expected workflow 集合可枚举；`paths`/`paths-ignore` 必须覆盖每个 Gate 的代码、
   contract、fixture、toolchain 与 workflow dependency，不能因未触发而被解释为通过；
2. checkout 后从 cold workspace 以 frozen lockfile 物化，Gate 不读取开发机遗留 dist、cache、store、
   `node_modules` 或未跟踪文件；
3. runner `ImageOS`/`ImageVersion`、Node、package manager、Podman、OCI runtime、conmon 与 cgroup manager
   必须匹配同一个 pre-adopted toolchain family；部分匹配或 PATH 偶然命中均 fail closed；
4. rootless sandbox 必须保持 non-root、read-only rootfs、`network=none`、无 host mount/credential、
   bounded CPU/memory/pids/files/tmpfs，以及 success/failure/timeout 后零 residual container/process/workspace；
   typecheck 使用 non-emitting invocation，除显式 result allowlist 外每个 stage 的完整 filesystem diff 必须为零；
5. command、container、transport、artifact 与 parser 各自有正数上限；rootless preparation
   （container start、dependency install、network isolation handoff）与 authored execution/capture 使用独立计时器，
   preparation 默认与硬上限均为 60 秒（调用方只可下调），只有 isolation handoff 成功后才启动 execution budget；payload parser
   在分配前验证 byte/count/depth，且对合法最大输入保持线性时间与有界调用栈；
6. snapshot、manifest、lock、toolchain file set、package seed、stage/result/artifact 都由 exact digest 串联；
   每次跨边界重新解码、重算并拒绝 mutation、forgery、partial capture 或 source-owner drift；进入 wire、
   digest 或持久化字节的展平路径/identity 集合必须在收集完成后直接使用 shared canonical code-point
   comparator 做全局排序，sandbox 不得把 host ICU `localeCompare` 或目录遍历顺序当成 canonical 顺序；
7. required step 的非零退出、signal、timeout、truncation、cleanup failure 与 missing result 必须传播为 Gate failure；
   wrapper 不得吞错、转成 skipped，或用后续成功步骤覆盖；
8. expensive matrix 开始前必须重新观测并 attest 已物化的 runner、rootless toolchain、sandbox image 与每个
   browser engine file set，不能只信 pre-adopted registry；adapter lifecycle failure 必须携带稳定、有界且不泄漏
   raw error message 的 stage-owned `VER-*` code 穿过 Core，使 prepare、launch、runtime-control、navigation、
   identity、capture 与 cleanup 可独立归因；
9. `Configured`、`Local Pass` 与绑定 exact commit/job identity 的 durable `Passed` 分开记录；最终交付只在
   expected workflows 全部 terminal success、远端 SHA 等于本地 SHA 且工作区 clean 后成立。

GitHub Actions、其他 CI provider adapter 只负责 identity/token/job metadata，不定义 Policy/Plan。fork/untrusted PR 默认无 durable
write/Secret；可以运行 local check 或上传 untrusted artifact，但不能 promotion 为 trusted Evidence。Environment approval 属于
credential control，不等同于 verification approval。

## Backend orchestration 与恢复

run service 复用 G2 ExecutionProvider/Job/Session，新增 Verification correlation projection，不复制 runner：

- run identity 绑定 plan digest 和 selected cells；
- per-cell attempt idempotent start/cancel/result；
- cursor event replay、client reconnect、worker loss/reclaim；
- result-before-trace/artifact、duplicate/out-of-order event fencing；
- promotion 独立于 run terminal，可在 Backend restart 后恢复；
- Plan immutable，resume 不添加/删除 cell；
- UI 关闭不会取消 CI/Remote run，只有显式 cancel 触发 authority check。

## 实施阶段

### V0：Adapter core 与 diagnostics/build/unit

- registry/SPI/capability snapshot/conformance harness；
- diagnostic/compiler、build、Vitest unit adapter；
- normalization/failure taxonomy/budget/cleanup。

完成条件：tool payload 无泄漏、unknown schema/exit mismatch/residual cleanup negative Gate 通过。

### V1：Behavior/visual/a11y

- Browser Scenario driver 与 verification-only probe；
- visual capture/compare；
- a11y automated + keyboard/focus journey；
- Chromium Preview/Export first vertical。

完成条件：semantic target only、probe stripped、baseline compatibility 和 reduced-motion cells 通过。

### V2：Integration/performance/security 与 target/browser matrix

- isolated integration fixture；
- performance/security adapters；
- Vue/Vite、Firefox/WebKit critical subset；
- Remote/CI provider capability matrix。

完成条件：unsupported/matrix budget 真实反映，React/Vue semantic contract compatible。

### V3：Product surface

- Scenarios/Verification IA；
- resizable/shared bottom panel、Impact/Plan/Runs/Evidence/Compare/Closure；
- Issues/SourceTrace/keyboard/accessibility/recovery。

完成条件：从 failed Closure 三步内到 Scenario/domain source/artifact；UI 不自建 Plan/Closure。

### V4：CLI/CI 与 attested promotion

- versioned JSON/NDJSON CLI；
- CI provider identity adapters；
- run/upload/finalize/closure/recovery；
- untrusted fork hard cut。

完成条件：Web/CLI/CI 同 plan/closure digest；中断重试不重复 Evidence。

### V5：Full Golden matrix

- Authenticated Catalog Scenario；
- Preview/Export/CI、React/Vue、browser/motion/check family；
- failure injection、compare、retention、closure。

完成条件：G3 roadmap milestone 所有 required Gate 与证据完成。

## 验证证据

计划 Gate：`pnpm run verify:g3:adapter-matrix`、`pnpm run verify:g3:product`、`pnpm run verify:g3:golden`。

必须覆盖：

- adapter descriptor/capability drift/tool schema/exit mismatch/event budget/cleanup；
- diagnostics/build/unit/integration/E2E/visual/a11y/performance/security 正负向；
- verification probe production strip 和 Secret/network hard cut；
- Preview/Export/CI, React/Vue, Chromium + Firefox/WebKit critical subset；
- full/reduced motion、visual baseline compatibility、a11y focus/keyboard；
- CLI codec/exit codes/NDJSON/cancel/resume/truncation；
- CI OIDC claim/fork/no-secret/duplicate finalize/backend restart；
- resizable panel、keyboard/accessibility、compact empty/error/loading state；
- Issues/SourceTrace exact revision 与 stale historical navigation；
- 同一 inputs 在 Web/CLI/CI 得到相同 Plan/Closure digest。

## 风险与停止条件

- 工具只能输出无法规范化的私有对象时，先补 adapter decoder；Web 不得临时解析。
- verification-only probe 无法从 production bundle 移除时，停止 Export/CI promotion。
- required target/browser/control 不支持时 cell blocked，不缩小 matrix 或改成 skipped。
- visual/performance 环境不兼容时禁止 pass/fail 比较，只保留 view-only Evidence。
- CI 身份/attestation/plan correlation 不完整时最多生成 imported-untrusted/local evidence。
- UI 需要复制 planner/Closure logic 才能显示状态时停止，并补 domain query/projection。

## 验收标准

- [ ] 所有工具通过受控 adapter，私有 payload 不越过 normalization boundary。
- [ ] Preview、Export、CI 与 React/Vue/browser matrix 使用同一 Scenario/Plan contract。
- [ ] 产品面复用 Execution/Issues/SourceTrace，布局可调整、信息紧凑且可访问。
- [ ] CLI/CI 与 Web 共享 planner、codec、adapter、Evidence promotion 和 Closure evaluator。
- [ ] CI trust/fork/Secret/recovery fail closed，required matrix 所有 cell 都有可信状态。
