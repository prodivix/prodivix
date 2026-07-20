# G3 BehaviorScenario Authoring 与跨领域 Composition 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
- Owner：`@prodivix/behavior`、`@prodivix/workspace`、`@prodivix/authoring`、各 domain capability owner、`apps/web`
- 关联：
  - `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md`
  - `specs/decisions/60.nodegraph-typed-flow-and-behavior-debugging.md`
  - `specs/decisions/61.animation-route-composition-and-reduced-motion.md`
  - `specs/implementation/g3-behavior-verification-closure.md`

## 目标

交付一个不依赖框架 DOM、编辑器 React state 或测试工具脚本的 canonical BehaviorScenario authoring
环境。Scenario 只编排公开的 semantic target、typed trigger/action/observation 与显式 control/fixture；具体
行为仍由 Route、PIR、Data、NodeGraph、Animation、Auth/Server 等 owner 执行。

最终用户可以手工作者、从运行中录制候选步骤、审查 impact、编译和调试同一 Scenario，并把它交给
VerificationPlan 在 Preview、Export 和 CI 中运行。

## 范围

- `@prodivix/behavior` current model、builder、validator、compiler 与 provider-neutral Program；
- `behavior-scenario` Workspace document、Command/Transaction、migration/import/export；
- semantic target query、reference contribution、impact/relocation；
- typed trigger、action、observation、fixture/control/baseline reference；
- recorder draft、歧义消解、显式提交；
- Scenarios product surface、compile diagnostic、step SourceTrace 与 debugger handoff；
- framework-neutral conformance 与 React/Vite、Vue/Vite controlled target vertical。

## 非目标

- 保存 Playwright/Cypress/Vitest 脚本或 CSS/XPath selector 作为 canonical Scenario；
- 复制 Data retry、Route guard、Animation timeline、NodeGraph executor 或 Auth semantics；
- 由 recorder、AI、plugin 或 runtime 直接写 Workspace；
- 自动修复失败步骤、自动接受 visual baseline 或自动扩大 production permission；
- G5 的多人 review/approval 和 G6 的第三方 Scenario adapter marketplace。

## Current model

公开 current model 不带数字版本；wire codec 才携带 `schemaVersion`。核心对象至少包含：

```ts
interface BehaviorScenario {
  id: BehaviorScenarioId;
  name: string;
  description?: string;
  owner?: WorkspacePrincipalRef;
  tags: readonly string[];
  entry: BehaviorTrigger;
  steps: readonly BehaviorStep[];
  fixtureRefs: readonly BehaviorFixtureRef[];
  controlProfileRef?: BehaviorControlProfileRef;
  baselineRefs: readonly BehaviorBaselineRef[];
  timeoutPolicy: BehaviorTimeoutPolicy;
}

interface BehaviorStep {
  id: BehaviorStepId;
  label?: string;
  action: BehaviorAction;
  preconditions: readonly BehaviorObservation[];
  postconditions: readonly BehaviorObservation[];
  source?: BehaviorSourceRef;
  failureMode: 'stop' | 'collect-and-stop' | 'advisory';
}
```

约束：

1. `id` 是稳定 opaque identity，重命名不会改变引用；名称不参与文件名、target resolve 或 Evidence identity。
2. `BehaviorSourceRef` 指向 authoring location，不保存 editor component 或 DOM node handle。
3. timeout 是有界 policy；禁止无界 wait 和以固定 sleep 作为 readiness 语义。
4. fixture/control/baseline 都是 reference，不能内嵌 Secret、production payload 或任意大 binary。
5. unknown union kind、重复 step id、循环 composition、不可达 step、错误 capability parameter 均 fail closed。

## Trigger、Action 与 Observation registry

registry entry 包含稳定 kind、owner、input/output schema、target capability、side-effect class、可用 surface、
redaction policy、compile contribution 和 conformance suite。初始受控集合：

| Domain      | Trigger                          | Action                                           | Observation                                 |
| ----------- | -------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| Scenario    | manual、scenario.call            | group、branch、repeat-bounded、parallel、barrier | completed、failed、output                   |
| Route       | entered、left、param.changed     | navigate、back、forward、reload                  | location、params、loader、guard result      |
| PIR/UI      | mounted、event                   | semantic click/input/select/submit/focus         | visible、enabled、value、text role/state    |
| Data        | lifecycle、stream event          | query、mutation、retry、next-page、cancel        | loading/empty/error/data/page/conflict      |
| Auth/Server | session changed、function result | sign-in fixture、sign-out、invoke function       | authenticated、permission、result/error     |
| NodeGraph   | graph input/event                | invoke、resume、cancel                           | port output、node state、graph result/error |
| Animation   | marker、completed                | play、pause、resume、seek、cancel                | stable frame、marker、motion mode、failure  |
| Runtime     | attempt started                  | storage seed/reset、viewport set                 | console/network/diagnostic budget、settled  |

新增 kind 必须由 domain owner 注册，并提供 schema、capability check、determinism classification、SourceTrace
mapping、redaction 与 conformance。`apps/web` 不得注册生产 domain kind。

依赖方向是 domain contribution/adapter 依赖 `@prodivix/behavior` 的 descriptor contract，并由 Web、Compiler 或
Runtime composition root 聚合 registry；Behavior Core 不 import Route/Data/NodeGraph/Animation 或 framework package。

## Semantic target contract

`BehaviorTargetRef` 至少由 `workspaceDocumentId`、stable semantic identity、capability kind 和可选 instance scope
构成。resolve 输入必须包含 Workspace revision、semantic schema digest 和 provider set digest。

resolve 返回：

- exact：唯一目标和 capability；
- relocated：稳定 identity 未变但 authoring location 变化，可通过 Transaction 更新 SourceRef；
- ambiguous：多个候选，阻止 compile 并要求用户选择；
- missing：目标删除，产生 `BHV-2xxx` 与 impact；
- incompatible：目标存在但 capability 改变，必须修改 action，不允许 selector fallback。

PIR renderer 可以在 runtime 把 semantic identity 映射为内部 element handle，但该 handle 只在当前 attempt 存活，
不得回写 Scenario 或 Evidence。

## Workspace document 与 Command

document kind：`behavior-scenario`；namespace/domain：`core.behavior`。初始 Command：

- `core.behavior.create-scenario`
- `core.behavior.rename-scenario`
- `core.behavior.set-entry-trigger`
- `core.behavior.insert-step`
- `core.behavior.update-step`
- `core.behavior.move-step`
- `core.behavior.remove-step`
- `core.behavior.set-fixtures`
- `core.behavior.set-control-profile`
- `core.behavior.set-baselines`
- `core.behavior.replace-scenario`

每个 Command 必须提供 precondition revision、schema validation、semantic reference validation、inverse、impact
preview 和 stable diff。多步 recorder adoption、subscenario extraction、target relocation、baseline reference update
必须以单个 Workspace Transaction 提交。

文件名只使用 Workspace VFS 的 opaque document id 或经统一 path allocator 生成的安全 slug；用户输入名称只作为
metadata。禁止直接把包含空格、斜杠、保留名、Unicode normalization 差异的 Scenario 名拼入路径。

## Recorder pipeline

```text
runtime raw event
  -> bounded recorder adapter
  -> semantic candidate lookup
  -> recorder draft with confidence and alternatives
  -> dedupe/coalesce/redact
  -> user review and target resolution
  -> Command/Transaction preview
  -> explicit commit
```

规则：

1. raw coordinates、DOM path、framework fiber 或 browser handle 只能帮助即时候选解析，完成后丢弃；
2. password、token、cookie、Authorization、Secret-like input 永不进入 draft；敏感字段只记录 typed fixture reference；
3. 高频 input/animation/network event 必须 bounded/coalesced，超过预算产生诊断并停止 recording；
4. recorder 不猜测等待条件；用户从可用 semantic observation 中选择，或步骤保持 unresolved；
5. draft 关闭、刷新或 revision drift 时不得静默提交；可导出的 draft 也必须使用受控无 Secret 格式。

## Scenario compiler

compiler 输入：

- exact Workspace revision；
- BehaviorScenario document revision；
- Semantic Index snapshot identity；
- target/runtime capability snapshot；
- control profile、fixture 与 baseline manifests；
- compiler/registry digest。

输出 `BehaviorScenarioProgram`：排序稳定的 instruction DAG、resolved capability requirements、observation automata、
SourceTrace table、resource budgets 和 deterministic program digest。Program 不包含 provider handle、temporary URL、
credential 或工具私有 callback。

编译阶段：

1. schema 与 reference preflight；
2. subscenario expansion 和 cycle detection；
3. target/capability resolve；
4. branch/parallel/barrier/control-flow lowering；
5. domain action lowering 为 owner-neutral capability invocation；
6. observation condition automata 与 timeout budget；
7. SourceTrace、redaction、determinism 和 security manifest；
8. canonical serialization 与 digest。

相同输入必须产生 byte-identical Program。任何 unresolved/unsupported required action 都阻止 Program，不能在
provider 侧跳过。

## Runtime composition

Behavior runtime 只调度 Program，并通过 capability ports 调用 domain owner。每个 action 有 invocation identity、
step attempt、deadline、cancellation token 和 trace context；每个 observation 有 source、logical timestamp、sequence、
normalized value digest 和 redaction classification。

- sequential step 仅在 postcondition 成立后推进；
- parallel group 使用显式 join policy 和 bounded concurrency；
- branch 只读取 declared observation，不执行隐藏 JS；
- repeat 必须有 max iteration/deadline；
- subscenario 拥有独立 frame，但继承允许的 fixture/control scope；
- mutation action 通过 G2 domain idempotency/replay fence；Behavior runtime 不自行重放未知 effect。

## 产品表面

Scenarios surface 至少提供：

- 左侧 Scenario/step outline，主区 typed step editor，右侧 target/fixture/control/impact inspector；
- semantic target picker 与 capability-filtered action picker；
- picker/menu 使用 `@prodivix/ui` 的可访问 primitive，不新增 raw HTML `select`；
- record、review draft、compile、run/debug、查看计划影响；
- 状态主要用 icon、color、tooltip、accessible name 表达；不重复堆砌说明文字；
- compile/runtime diagnostic 直达 step 和 domain source；
- 只在名称旁展示必要状态，provider/debug 元数据按需展开；
- 无 Scenario 时提供紧凑的 create/import/record affordance，不使用占满主区的大空框和大运行按钮。

所有 icon-only action 必须有 `aria-label`、tooltip、focus ring 和 disabled reason。复杂 destructive action 保留明确
文本确认，不能为了“极简”隐藏风险。

## 实施阶段

### B0：包、schema 与 registry

- 建立 package public API、current model、strict wire codec、kind registry；
- 建立 Workspace document codec、Command 与 boundary check；
- 接入 `behavior` diagnostic domain/target。

完成条件：round-trip/property/unknown-kind/fuzz budget 测试通过，应用无私有 duplicate type。

### B1：Semantic target 与最小 compiler

- 接入 PIR、Route、Data stable target；
- 实现 exact/relocated/ambiguous/missing/incompatible；
- 编译 manual trigger、click/input/navigation、visible/value/data observation。

完成条件：重命名和布局变化不破坏 Scenario；删除或 capability drift 明确 fail closed。

### B2：Authoring surface 与 recorder

- Scenario CRUD/outline/step editor/target picker；
- bounded recorder、draft review、Transaction preview；
- keyboard/accessibility 与 revision drift handling。

完成条件：录制不会保存 DOM selector/Secret；取消 draft 不产生 Workspace operation。

### B3：Cross-domain composition

- 接入 Auth/Server、NodeGraph、Animation 与 Runtime actions/observations；
- branch/parallel/barrier/repeat/subscenario；
- unified SourceTrace/debug event。

完成条件：跨领域 Catalog journey 编译并运行，mutation replay 与 cancel 保持 owner 语义。

### B4：Controlled targets 与 hardening

- React/Vite、Vue/Vite semantic target conformance；
- Browser/Remote Program codec；
- import/migration、large scenario budget、property tests。

完成条件：两 target 运行同一 Program contract；任何 framework-specific target 泄漏被 boundary Gate 拦截。

## 验证证据

计划 Gate：`pnpm run verify:g3:scenario-authoring`、`pnpm run verify:g3:behavior-composition`。

必须覆盖：

- current/wire codec round-trip、unknown kind、duplicate id、cycle、oversize；
- Command inverse/redo、Transaction atomicity、revision conflict、outbox replay；
- target rename/relocation/delete/capability drift/ambiguous；
- recorder Secret canary、event flood、revision drift、cancel；
- compiler byte stability、Program digest、SourceTrace completeness；
- branch/parallel/barrier/cancel/timeout/mutation retry；
- Preview/Export/CI Program parity 与 React/Vue semantic parity；
- keyboard-only authoring、screen-reader labels、reduced-motion UI。

## 风险与停止条件

- 如果某 domain 只能通过 editor-private state 或 arbitrary JS 暴露行为，停止接入并先补该 domain capability。
- 如果 semantic target 不稳定，不得使用 CSS/XPath 临时补洞；该 step 保持 blocked。
- 如果 recorder 不能在进入 draft 前清洗敏感输入，禁用该 event kind。
- 如果 Program 必须携带 provider handle 或临时 credential，重新切分 runtime capability，不得扩展 codec。
- 如果 Scenario 开始复制应用业务状态机，退回 typed observation/action composition，而不是扩展巨型 BehaviorGraph。

## 验收标准

- [ ] Scenario 只能通过 Workspace Command/Transaction 修改，可逆、可迁移、revision-bound。
- [ ] canonical target 只使用 stable semantic identity，不保存 DOM/test-tool locator。
- [ ] recorder 只生成受审查 draft，且 Secret 和事件预算 fail closed。
- [ ] compiler 确定性产生 provider-neutral Program、SourceTrace 与 capability manifest。
- [ ] Route/PIR/Data/Auth/NodeGraph/Animation 由各自 owner 执行，不形成第二行为真相源。
- [ ] React/Vite 与 Vue/Vite 能运行同一 Scenario semantic contract。
