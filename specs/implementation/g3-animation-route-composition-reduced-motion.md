# G3 Animation / Route Composition 与 Reduced Motion 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：A0-A3 Implemented / A4 V2 Golden slice Implemented
- ProductGateStatus：V2 slice Passed / Global G3 In Progress
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-27
- Owner：`@prodivix/animation`、Route/PIR renderer owner、`@prodivix/runtime-core`、`@prodivix/behavior`、target adapters、`apps/web`
- 关联：
  - `specs/decisions/61.animation-route-composition-and-reduced-motion.md`
  - `specs/decisions/43.animation-runtime-and-execution-session.md`
  - `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md`
  - `specs/implementation/g2-animation-runtime-execution-session.md`
  - `specs/implementation/g3-deterministic-replay-runtime-controls.md`

## 目标

把 G2 的单 timeline/runtime lease 扩展为由 typed action 驱动的 Animation composition，并与 Route lifecycle、
semantic target、deterministic scheduler 和 reduced-motion policy 对齐。相同行为在 Preview、Export、CI 与 React/Vue
controlled target 中保持相同的 semantic markers/state；视觉差异通过 target/browser-compatible baseline 验证。

## 范围

- typed Animation action/observation 与 stable instance identity；
- sequence/parallel/stagger/nested timeline composition、conflict/arbitration；
- Route enter/exit/shared handoff/lifecycle cancellation；
- reduced-motion intent/category/variant/verification；
- pause/resume/seek/cancel、generation/effect lease 与 deterministic scheduler；
- CodeSlot/shader capability boundary；
- BehaviorScenario/NodeGraph integration、visual/a11y observation 与 SourceTrace；
- authoring/preview/debug UI、target compiler/runtime conformance。

## 非目标

- 保存 CSS selector/class toggle、React component instance、Vue ref 或 browser Animation object；
- 逐帧 Remote RPC、服务端视频流或跨浏览器 pixel identity；
- `duration = 0` 作为所有 reduced-motion 的统一实现；
- 任意 shader/CodeSlot 获得 network/Secret/Workspace write；
- 将 screenshot 视为完整 Animation Evidence，或自动接受 baseline。

## Typed action 与 observation

Behavior/NodeGraph 可调用：

```ts
type AnimationAction =
  | {
      kind: 'animation.play';
      timeline: AnimationTimelineRef;
      target: SemanticTargetRef;
      options: PlayOptions;
    }
  | { kind: 'animation.pause'; instance: AnimationInstanceRef }
  | { kind: 'animation.resume'; instance: AnimationInstanceRef }
  | {
      kind: 'animation.seek';
      instance: AnimationInstanceRef;
      position: AnimationPosition;
    }
  | {
      kind: 'animation.cancel';
      instance: AnimationInstanceRef;
      reason: AnimationCancelReason;
    };
```

Observation：`started`、`marker-reached`、`paused`、`resumed`、`settled`、`completed`、`cancelled`、`failed`，均
包含 timeline/instance/generation/target、logical time、motion mode、marker 和 SourceTrace；不包含 DOM/WAAPI object。

`play` 返回 attempt-scoped instance identity。pause/resume/seek/cancel 必须绑定 exact instance + generation；旧 Route/
revision/generation 的 command fail closed，不能误控新 animation。

## Composition model

Animation document 保留 timeline/track/keyframe owner，新增 composition 节点：

- `sequence`：前项按 declared completion/marker 进入后项；
- `parallel`：显式 join `all`/`any`/`first-success` 与 cancel-losers；
- `stagger`：固定/typed function 产生有界 offset，顺序由 stable target order；
- `timeline-ref`：引用另一 timeline public contract；
- `conditional-variant`：只基于 motion mode、target capability 或显式 input；
- `marker`：semantic checkpoint，不是 UI-only label；
- `hold`/`settle`：声明稳定帧与 observation condition。

compile 检测 nested reference cycle、unbounded duration/repeat、missing marker、target cardinality、unsupported property、
runtime zone/capability 和 reduced variant。CompositionProgram canonical sort/digest 不包含 editor layout。

## Target 与 property ownership

target 使用 PIR/semantic identity + instance scope；renderer 在 attempt 内解析 element/object handle。track property 来自
受控 registry，声明 type、interpolation、compositing、layout/paint cost、reduced-motion behavior 和 target support。

- unknown/custom CSS property 默认 unsupported；
- layout-affecting property 可由 Policy 标记 performance-sensitive；
- target 列表排序来自 canonical collection/semantic order，不按 DOM enumeration；
- target disappear/recreate 触发 typed target lifecycle，不把 stale handle 继续写入；
- shared element handoff 使用 stable handoff key + source/target Route scope，不使用选择器匹配。

## Conflict 与 arbitration

同一 target/property/slot 的 active effect 必须有显式 composition slot 和 policy：

- `replace`：新 generation 原子接管并取消旧 effect；
- `queue`：按 canonical invocation sequence；
- `add`/`accumulate`：仅 property registry 明确支持；
- `reject`：产生 conflict diagnostic；
- priority 只来自 authoring policy，不按调用来源/完成时间隐式决定。

arbitration 结果写入 semantic trace。不同 Route generation 的旧 effect 永远不能覆盖新页面；cancel/cleanup 后 residual
style/effect lease 通过 canary 检查。

## Route lifecycle

Route owner 暴露：before-leave、leave-started、left、before-enter、enter-started、entered、loader/guard result、cancelled。
Animation composition 可以绑定明确 lifecycle slot：

1. guard/loader preflight；
2. optional exit animation；
3. route commit/handoff barrier；
4. target materialize/semantic ready；
5. enter animation；
6. entered + stable observation。

规则：

- guard/loader failure 不启动新 Route enter；
- navigation replacement 取消旧 lifecycle generation 和 child effect；
- exit animation 不可无限阻止 navigation，受 deadline/reduced policy；
- browser back/forward/deep link 使用同一 lifecycle contract；
- shared handoff source/target missing 按 authored fallback，而不是 DOM 猜测；
- data-loading skeleton/content transition 通过 typed Data observation/barrier 协调。

## Reduced-motion policy

每个 timeline/composition 必须声明 motion intent：

- `decorative`：reduced 默认跳到稳定 final state 或禁用；
- `spatial`：保留状态关系，使用 bounded fade/scale/static handoff 替代大位移；
- `essential`：保留功能反馈，但必须提供低位移/低频/短时 variant；
- `continuous`：reduced 停止并提供 static representation 或 user-controlled motion。

Policy resolution 优先级：用户/browser preference → Verification control profile → document variant；Verification 不得覆盖
真实产品默认，而是分别执行 full/reduced cell。resolved variant/digest 进入 Program、trace、artifact compatibility。

禁止机械把 duration 设 0，因为这可能跳过 marker、Route barrier、focus handoff 或最终 style commit。reduced variant 仍要
发出相同必要 semantic observation；允许 duration/visual path 不同。

## Pause、resume、seek 与 settle

- pause 记录 logical position、active child、marker state，不以 wall time 推算；
- resume 仅对当前 lease/generation；
- seek 只允许 timeline 声明 seekable 且 effect 可确定重建，外部/Data mutation 不在 animation timeline 内；
- seek 跨 marker 时明确 `preview-only` 或发出受控 marker policy，默认不伪造业务 event；
- cancel 应用 authored cancel/final-state policy并释放 effect；
- settle 依赖 declared stable marker、renderer frame/font/layout readiness 和 scheduler budget，不仅是 duration 到期。

Debugger pause/seek 是 runtime command，不写 Workspace；Evidence required run 必须无人工 debug intervention 重跑。

## CodeSlot 与 shader

复杂 easing/transform generator 通过 pure CodeSlot：typed numeric/geometry input/output、deterministic、无 effect。shader/Canvas/
WebGL adapter 必须声明 target/browser capability、resource budget、fallback、context loss/cleanup 和 readback policy。

- 禁止动态源码字符串、eval 和 arbitrary module import；
- 禁止 network/environment/Secret/Workspace write；
- output/parameter finite、bounded，NaN/Infinity fail closed；
- shader compile log 清洗、bounded；
- reduced-motion 必须有非 shader 或低 motion fallback；
- unsupported target 不得静默改用不同 semantic behavior。

## Behavior、NodeGraph 与 Verification

- Behavior action 调用 animation，observation 等待 marker/settled/completed/cancelled；
- NodeGraph animation node 复用同一 action port，不直接操作 runtime object；
- Route lifecycle correlation 进入 Scenario ReplayRecord；
- visual adapter 在 declared stable region 采集 screenshot/diff；
- accessibility adapter 检查 focus、hidden state、live region、reduced-motion preference 和 animation 后可操作性；
- performance adapter读取受控 frame/long-task/layout metric，不以本机绝对 FPS 作为跨环境硬阈值；
- semantic Evidence 证明 marker/order/lifecycle/final state，visual Evidence 证明 target-specific appearance，两者不可互相替代。

## 产品表面

- timeline/composition tree 和 keyframe editor 分离；主画布只显示当前必要控制；
- full/reduced variant 可切换预览，并显示 intent、fallback、unsupported target；
- conflict、Route lifecycle、marker、SourceTrace 以紧凑 icon/overlay 呈现，详情进入 Inspector/Issues；
- playback/debug toolbar 支持 play/pause/seek/step marker、快捷键、aria-label；
- bottom Execution panel 可拖拽/最大化/布局切换，trace 与 Route/Data/NodeGraph correlation 同步；
- 不在空白页放置巨大播放框；未选择 timeline 时提供紧凑创建/选择入口。

## 实施阶段

### A0：Action/observation 与 CompositionProgram

状态：Implemented。`@prodivix/animation` 已贡献 timeline play、pause、
resume、seek、cancel 与 animation-state registry/semantic target/runtime adapter。play 使用 stable instance +
generation；后续控制绑定 exact attempt + instance，跨 attempt 或失效实例 fail closed。playback 使用 explicit
logical clock，pause 不计入 wall-clock duration，保留 effect lease；resume、seek、cancel 与 signal cancellation
执行确定性 frame/cleanup，并发布 started/paused/resumed/marker-reached/settled/completed/cancelled/failed
bounded observation。seek 默认不伪造业务 marker，可通过显式 crossing policy 开启。

Animation current domain 已移除数字版本；wire v2、TypeScript/Go fail-closed codec/validator、v1 deterministic
migration、数据库 migration 18 和 Workspace/Compiler/Web hard cut 已落地。Composition compiler 支持
sequence、parallel、stagger、nested timeline/composition ref、conditional full/reduced、marker、hold 与 settle，
并验证 cycle、unbounded timeline、duration/event/node/iteration budget、settle order 与 required marker parity。
输出 full/reduced immutable program、canonical digest 和 stable event order；logical runtime 通过注入 clock/effect/
observation port 执行，取消和异常产生 sanitized terminal result，不写 Workspace。

composition Program 已接入 Behavior play/composition-result/required-marker action-observation 与真实
Preview/Export/CI effect host；stable composition semantic symbol、Program digest、instance/generation 和
marker SourceTrace 贯穿 compiler/runtime/Golden。产品 command generation 与 Inspector 也通过 Workspace
Command 修改 composition，不保存第二作者态。

- typed registry、instance/generation/lease；
- sequence/parallel/stagger/ref/marker/hold；
- compiler/digest/cycle/budget；
- Behavior/NodeGraph ports。

完成条件：相同 composition 在 same-context runtime 产生稳定 marker/order/result。

### A1：Target/property/conflict runtime

状态：Implemented。semantic target/property registry 支持 replace/queue/add/reject，所有 contender 使用
generation fence；replace/cancel/error/context-loss 都幂等释放 lease，late frame 不得污染新 generation。

- semantic target resolver、property registry；
- replace/queue/add/reject arbitration；
- cancellation/residual cleanup；
- renderer adapter conformance。

完成条件：target lifecycle/revision drift/conflict/late frame 不污染新 generation。

### A2：Route lifecycle composition

状态：Implemented。Route coordinator 以 resolve → guard → loader → scope prepare → exit/enter transition →
handoff marker → outlet commit 的固定阶段运行，支持 replace/back/forward/deep-link、rapid replacement、
loader/guard failure、missing/cancelled handoff 和 scope cleanup；真实 Route surface adapter供
Preview/Export/CI 与 Behavior 共用。

- guard/loader/navigation lifecycle；
- exit/commit/materialize/enter barrier；
- replace/back/forward/deep link/shared handoff；
- Data loading/content coordination。

完成条件：路由取消、loader error、rapid navigation 和 missing handoff 均确定性结束。

### A3：Reduced motion、CodeSlot/shader 与 verification

状态：Implemented。timeline/composition current model 已声明 decorative/spatial/
essential/continuous intent 与 disabled/final-state/retain/timeline-ref policy；validator 拒绝 essential 无
bounded retained variant、continuous retain 和 invalid ref。compiler 同时生成 full/reduced Program，reduced
模式可跳过视觉时长但必须保留 required semantic marker/settle，Golden 已验证两个模式业务 marker 等价且
reduced logical duration 更短。

system/project/verification override 按 verification > project > system precedence 解析。revision/digest/type/
effect/determinism/budget-bound CodeSlot runtime拒绝 network、Secret、Workspace write；shader 只允许显式
WebGL2/WebGPU capability，并要求 full/reduced non-shader fallback，compile log bounded/sanitized，context loss
幂等清理。React/Vue Chromium full/reduced Golden 验证必要 marker、focus、operability、ARIA 与目标特定
visual signature。

- motion intent/variant/fallback；
- pure CodeSlot 与 controlled shader；
- visual/a11y/performance adapter hooks；
- full/reduced target matrix。

完成条件：两个 motion mode semantic completion equivalent；unsupported/unsafe capability fail closed。

### A4：Cross-target Golden 与 product

状态：V2 Golden slice Implemented。React/Vue standalone snapshot 共享 Animation compiler contribution 与
framework-neutral runtime helper；Preview/Export/CI 六个 full/reduced cell 真实执行 composition、Route
lifecycle 与 NodeGraph correlation。生成的两套独立项目实际完成 install、typecheck、test、production build、
Chromium smoke，跨框架版面几何/ARIA/focus/操作结果兼容，并保留各 target screenshot hash。V6/V8 的完整
Remote、Firefox/WebKit、performance/security Evidence matrix仍未运行。

- authoring/preview/debug/Issues UI；
- React/Vite、Vue/Vite Preview/Export/CI；
- Authenticated Catalog Route transition + optimistic conflict journey。

完成条件：Route/Animation/Behavior/NodeGraph correlation 完整，target-specific visual Evidence 可比较。

## 验证证据

Gate：`pnpm run verify:g3:behavior-composition` 中 Animation 9 files / 46 tests、Router 5 files / 20 tests、
Compiler React/Vue 19 tests、Web product 7 tests、V2 composition 7 tests与 Chromium browser Golden 1 test
已在 2026-07-27 当前未提交 worktree 本地通过；`verify:g3:boundaries` 同时覆盖 Workspace/Go wire hard cut。
workflow 已配置但缺少 commit/CI identity；完整 G3 V6/V8 adapter/evidence matrix仍待实现。

必须覆盖：

- composition order/parallel/join/stagger/nested cycle/repeat/duration budget；
- target missing/recreate/cardinality/property unsupported；
- replace/queue/add/reject conflict 和 generation fencing；
- guard/loader failure、rapid replacement、back/forward/deep link/shared handoff；
- pause/resume/seek/cancel/marker/settle/late frame；
- decorative/spatial/essential/continuous full/reduced variant；
- focus/visibility/operability/a11y after transition；
- CodeSlot/shader type/budget/context loss/cleanup/Secret canary；
- React/Vue and Preview/Export/CI semantic trace parity；
- browser-specific visual baseline compatibility。

## 风险与停止条件

- target 只能靠 CSS/DOM selector 解析时停止集成并补 semantic identity。
- Route transition 无 generation/cancel fence 时不允许进入 Golden。
- reduced variant 缺失或跳过必要 marker/focus/final state 时 required reduced cell blocked。
- CodeSlot/shader 需要任意代码、网络或 Secret 时拒绝该 capability。
- visual environment 字体/DPR/browser 不兼容时只允许 view-only，不产出误导性 diff verdict。
- renderer cleanup canary 发现 residual effect 时销毁 attempt/session，不能继续复用。

## 验收标准

- [x] Animation action/observation、composition、target 和 effect lease 是 typed/current contract。
- [x] Route enter/exit/replace 与 Data readiness 在 deterministic scheduler 下有显式 barrier。
- [x] reduced-motion 由 motion intent 和 variant 驱动，保持必要 semantic behavior。
- [x] CodeSlot/shader capability 有严格 type、budget、sandbox 和 fallback。
- [x] Preview、Export、CI 与 React/Vue 的 semantic trace compatible，visual comparison 使用兼容 baseline。
