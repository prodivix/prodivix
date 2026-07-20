# G3 Verification Adapters、产品表面与 CI 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/verification`、verification adapters、`@prodivix/runtime-core`、`apps/backend`、`apps/web`、CI composition
- 关联：
  - `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md`
  - `specs/decisions/63.verification-product-surface-diagnostics-and-ci.md`
  - `specs/implementation/g3-verification-plan-impact-policy.md`
  - `specs/implementation/g3-verification-evidence-provenance-retention.md`
  - `specs/implementation/g3-deterministic-replay-runtime-controls.md`

## 目标

用受控 adapter 把 canonical VerificationPlan cell 映射到具体检查工具和 runner，并把私有结果规范化为
EvidenceCandidate。交付 Scenarios/Verification/Issues/Execution/SourceTrace 一体的产品 journey，以及与 Web 使用同一
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

每个受控 adapter 包导出 descriptor + factory：

```ts
interface VerificationAdapterDescriptor {
  id: VerificationAdapterId;
  family: VerificationCheckFamily;
  implementation: ImplementationIdentity;
  supportedCells: VerificationCapabilityPredicate;
  requiredControls: readonly RuntimeControlCapability[];
  inputKinds: readonly VerificationInputKind[];
  artifactKinds: readonly VerificationArtifactKind[];
  trustCapabilities: readonly VerificationTrustClass[];
  budgets: VerificationAdapterBudgets;
}

interface VerificationAdapter {
  preflight(
    cell: VerificationPlanCell,
    context: AdapterContext
  ): Promise<AdapterPreflight>;
  prepare(input: AdapterPrepareInput): Promise<PreparedVerificationInvocation>;
  execute(
    invocation: PreparedVerificationInvocation,
    sink: VerificationEventSink
  ): Promise<AdapterRawResultRef>;
  normalize(input: AdapterNormalizeInput): Promise<EvidenceCandidate>;
  cleanup(input: AdapterCleanupInput): Promise<AdapterCleanupResult>;
}
```

边界：

- descriptor 是构建期 registry contribution，不从 Workspace 动态加载代码；
- `preflight` 只判断 capability/contract，不执行检查或修改 Plan；
- `prepare` 只接收 exact plan cell 和 content-addressed inputs；
- raw tool output 留在 adapter/sandbox staging，只有 normalized candidate 越界；
- event sink 使用 canonical lifecycle/progress/diagnostic/artifact envelope 并有预算；
- cleanup 无论 success/failure/cancel/timeout 都运行，并报告 residual canary；
- adapter 不写 Workspace/Evidence DB，不解析 Secret，不改变 required/advisory。

## Registry 与 capability snapshot

registry entry 包含 adapter descriptor digest、package/build identity、tool/version/schema compatibility、target/browser/
runtime support、control support 和 known limitations。Planner 使用 immutable snapshot；runner 执行前 exact match，drift
则 cell blocked 并重建 Plan。

public adapter API 不暴露 Playwright `Page`、Vitest task、axe result、browser context、filesystem path 或 vendor SDK。
future G6 adapter 必须先通过相同 conformance/security boundary，G3 只允许 first-party/explicitly bundled adapters。

## Check families

### Diagnostics

输入 Workspace/Semantic/Compiler projection，运行 schema/reference/type/owner/boundary diagnostics。结果按 stable diagnostic
code/target/source normalized；不得只保存 console text。可在 Preview/CI 运行，Export surface 验证 standalone source mapping。

### Build

对 exact ExportProgram/materialized target 执行 install/build/static output validation，记录 toolchain、lockfile/content digest、
output manifest、bounded log。build 环境 network phase 严格受 G2 allowlist，runtime phase无 egress；本机泄漏的 binary 不算依赖。

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

### Accessibility

组合自动规则与 Scenario semantic assertions：可访问名称、role/state、focus order/restore、keyboard interaction、live region、
contrast、reduced motion。adapter 规范化 rule id/impact/target/source；自动扫描通过不替代关键 journey 的 keyboard/focus check。

### Performance

使用受控 fixture/control/browser image，记录 navigation/interaction/animation budget、long task/layout/asset metrics。阈值和
sampling policy 来自 Policy；环境不可比时只 view-only/unstable。G3 关注 regression budget，不承诺生产 RUM。

### Security

验证 no-Secret/client bundle、CSP/headers、network allowlist、permission denial、artifact redaction、verification probe stripped、
path/archive/binary bounds 和 known unsafe capability。它不取代完整供应链/渗透测试，也不执行未批准 live target。

## Surface / target / browser matrix

### Surface

- `preview`：Editor Browser 或受控 Remote Preview，适合快速 local/remote evidence；
- `export`：从 exact ExportProgram 物化的 standalone app，在隔离目录/origin 运行；
- `ci`：非交互 runner 执行 canonical Plan，并生成 CI-attested Evidence。

同一 Scenario/Check identity 跨 surface，cell identity 区分 surface。Preview pass 不能替代 required Export/CI cell。

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
