# G3 Animation / Route Composition 与 Reduced Motion 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：Not Started
- ProductGateStatus：Blocked by G2 Exit Gate
- Global Phase：G3 Behavior & Verification Closure
- 日期：2026-07-20
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

- typed registry、instance/generation/lease；
- sequence/parallel/stagger/ref/marker/hold；
- compiler/digest/cycle/budget；
- Behavior/NodeGraph ports。

完成条件：相同 composition 在 same-context runtime 产生稳定 marker/order/result。

### A1：Target/property/conflict runtime

- semantic target resolver、property registry；
- replace/queue/add/reject arbitration；
- cancellation/residual cleanup；
- renderer adapter conformance。

完成条件：target lifecycle/revision drift/conflict/late frame 不污染新 generation。

### A2：Route lifecycle composition

- guard/loader/navigation lifecycle；
- exit/commit/materialize/enter barrier；
- replace/back/forward/deep link/shared handoff；
- Data loading/content coordination。

完成条件：路由取消、loader error、rapid navigation 和 missing handoff 均确定性结束。

### A3：Reduced motion、CodeSlot/shader 与 verification

- motion intent/variant/fallback；
- pure CodeSlot 与 controlled shader；
- visual/a11y/performance adapter hooks；
- full/reduced target matrix。

完成条件：两个 motion mode semantic completion equivalent；unsupported/unsafe capability fail closed。

### A4：Cross-target Golden 与 product

- authoring/preview/debug/Issues UI；
- React/Vite、Vue/Vite Preview/Export/CI；
- Authenticated Catalog Route transition + optimistic conflict journey。

完成条件：Route/Animation/Behavior/NodeGraph correlation 完整，target-specific visual Evidence 可比较。

## 验证证据

计划 Gate：`pnpm run verify:g3:behavior-composition` 中的 Animation/Route suite。

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

- [ ] Animation action/observation、composition、target 和 effect lease 是 typed/current contract。
- [ ] Route enter/exit/replace 与 Data readiness 在 deterministic scheduler 下有显式 barrier。
- [ ] reduced-motion 由 motion intent 和 variant 驱动，保持必要 semantic behavior。
- [ ] CodeSlot/shader capability 有严格 type、budget、sandbox 和 fallback。
- [ ] Preview、Export、CI 与 React/Vue 的 semantic trace compatible，visual comparison 使用兼容 baseline。
