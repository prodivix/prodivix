# Prodivix G2 缺口与 G3 就绪度评估

## 1. 元信息

| 项目             | 内容                                                                                            |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| 评估日期         | 2026-07-26                                                                                      |
| 评估对象         | Global Phase G2(已判定 Passed)的实现缺口,与 G3(判定 In Progress)的实现状态与就绪度              |
| G2 Exit baseline | `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184`                                                      |
| 评估时 HEAD      | `c572d6df`                                                                                      |
| 方法             | 代码与门禁的确定性核验 + 9 维度并行契约分析(9 个 agent,543 次工具调用)                          |
| 关联             | [`2026-07-26-static-review.md`](2026-07-26-static-review.md)(同日全量静态审查,175 条已验证发现) |
| 报告语言         | 简体中文(GitHub Flavored Markdown)                                                              |

本文不改变任何阶段状态。状态唯一来源仍是 [`../../roadmap/current-status.md`](../../roadmap/current-status.md);
里程碑状态见 [`../../roadmap/g2-auth-server-runtime-milestones.md`](../../roadmap/g2-auth-server-runtime-milestones.md)、
[`../../roadmap/g3-behavior-verification-milestones.md`](../../roadmap/g3-behavior-verification-milestones.md)。

---

## 2. 第一部分:G2 实现现状与缺口

### 2.1 结论

G2 的 `Passed` 判定**有实据**:实现真实、门禁密集、状态纪律良好。但它证明的是
「所选门禁在所选 commit 上通过」,不等于「G2 表面无缺陷」。本次核验找出 7 类已证实的缺口,
其中 3 类会直接成为 G3 的硬前置。

### 2.2 实现量(确定性统计)

G2 专属包与应用合计 **约 98k LOC / 369 个受版本控制文件**(不含 `apps/backend` Go 模块):

| 子系统                                                           | 文件数 | LOC    |
| ---------------------------------------------------------------- | ------ | ------ |
| `runtime-remote` + `-postgres` + `-browser` + `-vitest`          | 103    | 26,623 |
| `runtime-core`                                                   | 54     | 16,186 |
| `remote-runner-worker` + `control-plane` + `remote-preview-host` | 72     | 19,057 |
| `data` + `-http` + `-graphql` + `-asyncapi` + `-mock`            | 73     | 21,505 |
| `asset-delivery-host` + `assets`                                 | 45     | 9,661  |
| `server-runtime`                                                 | 22     | 4,892  |

对照:G2 区间(G1 收口 → G2 Exit)共 1,039 个文件、+205,192 / −5,032 行,新建 14 个 package/app。

### 2.3 门禁机械核验(全部通过)

| 核验项                                       | 结果                                                                                     |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `verify:g2:*` script 数量                    | 39                                                                                       |
| 这些 script 引用的不同测试文件               | 59 个,**全部存在**,零失效引用                                                            |
| 被引用文件内的 `it/test/describe.skip        | todo`                                                                                    | **0 处** |
| 全仓库 skip 总数                             | 3 处,全部为 `databaseUrl ? describe : describe.skip` 的环境条件跳过(Postgres),非静默关闭 |
| 本机实跑 `pnpm run verify:g2:data-protocols` | **通过**(data-asyncapi 9 tests、apps/web 16 tests、Go backend workspace tests 全过)      |

### 2.4 CI 触发覆盖(健康)

`tests`、`g0-g1-gates`、全部 `g2-*`(除 managed-KMS)、`security`、`smoke`、`codeql` 均在
**push to `main` 与 pull_request 双触发**。`g2-managed-kms.yml` 仅 `workflow_dispatch` —— 这是正确的,
它需要真实 AWS OIDC,正对应 A14 的 pending 状态。

### 2.5 状态纪律(优秀)

A0–A13、A15–A17 与 B0–B7 全部 `Implemented`;**A14 诚实地停在 `Configured / Evidence pending`**,
并在 6 处文档反复写明「真实 AWS OIDC/KMS/MRK run 尚未取得」。`current-status.md` 明确写
「AWS/真实云 evidence 继续作为外部 pending,不宣称 Passed」。evidence 文档记录具体 test count、
耗时(如 `data-closure` 168.0s、aggregate 596.1s)与 GitHub run ID,不是绿色徽章倒推。

### 2.6 已证实的 G2 缺口清单

以下缺口均来自同日静态审查的已验证发现或本次直接核验,并按对 G3 的阻碍程度排序。

| 编号      | 严重度  | 标题                                                                           |
| --------- | ------- | ------------------------------------------------------------------------------ |
| G2-GAP-01 | Blocker | controlled Vue target 并未消费同一 ExportProgram,与 ADR 31 明文冲突            |
| G2-GAP-02 | Blocker | Vue data operation manifest 把 `subscription` 写入只允许 `query                | mutation` 的类型,生成工程必然构建失败 |
| G2-GAP-03 | Blocker | Remote 执行/预览表面端到端失效(4 条已确认缺陷叠加)                             |
| G2-GAP-04 | Blocker | canonical 序列化与执行身份依赖 locale:全仓 166 处非测试 `localeCompare`        |
| G2-GAP-05 | High    | 导出入口链可被用户代码文档静默抢占                                             |
| G2-GAP-06 | High    | `verify:g2:vue-target` 在全部 17 个 workflow 中零命中                          |
| G2-GAP-07 | High    | `pnpm docs:diagnostics:check` 当前失败,且其 domain 白名单漏掉 5 个已在发码的域 |

#### G2-GAP-01(Blocker) controlled Vue target 并未消费同一 ExportProgram,与 ADR 31 明文冲突

- **位置**: `packages/prodivix-compiler/src/vue/workspacePirRuntime.ts:585-634;packages/prodivix-compiler/src/vue/workspaceProject.ts:574-694`

**详情**: `specs/decisions/31.production-export-planner.md:344` 写明「第二 target 必须消费相同 `ExportProgram`…不得复制 PIR、Data、NodeGraph 或 Animation domain compiler」。实际:React 路径把每个 PIR 文档编译成独立 `kind: "react-component"` 模块;Vue 路径自建 `compileWorkspaceToVueViteExportProgram`,把全部 PIR 文档折叠进**一个** `kind: "runtime-helper"` 的运行时解释器模块 `src/prodivix-pir-runtime.ts`,逐节点 `h(node.type, props, children)` 解释 `ui.graph.nodesById`,外加手写模板字符串产出的 `src/App.vue`。两 target 的模块拓扑、SourceTrace 粒度与产物形态都不同构。

**影响**: 这是结构性差异而非零星 bug。G3 的 V1/V2「React/Vue semantic target conformance」、V6 Target 维度、V8「无 framework-private canonical fork」在当前实现上不可能等价达成。现有产品 Gate 只能证明「跑起来了」,不能证明「同一 Scenario 在两 target 语义等价」。

**修复建议**: 二选一并落地:(a) 让 Vue target 复用 `compileWorkspaceToExportProgram` 的 PIR 模块编译产物,只替换 preset/渲染层;或 (b) 显式修订 ADR 31:344,把「Vue 为运行时解释器 target」写成受限契约,并在 G3 evidence 的 Golden matrix 中把 Vue 行降为 capability 子集。在此之前应判定 controlled Vue target 为「未稳定」。

#### G2-GAP-02(Blocker) Vue data operation manifest 把 `subscription` 写入只允许 `query|mutation` 的类型,生成工程必然构建失败

- **位置**: `packages/prodivix-compiler/src/vue/workspaceProject.ts:112,151,155`

**详情**: `:112` 直接透传 `kind: operation.kind`,而 `DATA_OPERATION_KINDS` 含 `subscription`;生成的 manifest 在 `:151` 声明 `kind: "query" | "mutation"` 并在 `:155` 用 `as const satisfies`。Vue 预设的 `package.json` 把 `vue-tsc --noEmit` 同时挂在 `typecheck` 与 `build` 上。**覆盖漏洞是精确互补的**:唯一覆盖 Vue×subscription 的用例(`goldenG2DataTargetMatrix.conformance.test.ts:508-552`)只做字符串包含断言、从不 typecheck;而唯一真正跑 `vue-tsc` 的两个 Gate 的 fixture(`goldenG2VueTargetFixture.ts:64-125`)只有 query/mutation。

**影响**: 任何含 subscription 的 Workspace 导出 Vue 工程即 typecheck/build 失败,而 golden conformance 却断言它是 `ready`。G3 evidence 中 4 个必需 cell 依赖 Vue/Vite(Preview、Export、CI、Firefox/WebKit critical subset)。由于 G2 evidence 已把 Vue target 记为 Passed,该缺陷会被当作「已稳定的前置依赖」带进 G3。

**修复建议**: 把 `ProdivixDataOperation.kind` 扩为三值,或在 `dataOperations()` 显式过滤并发 `VUE-TARGET-*` 编译诊断(不得静默丢弃)。同时给 `goldenG2VueTargetFixture.ts` 加一个 subscription 操作,让 browser 用例真正 typecheck 它。

#### G2-GAP-03(Blocker) Remote 执行/预览表面端到端失效(4 条已确认缺陷叠加)

- **位置**: `apps/remote-preview-host/src/previewSecurityPolicy.ts:60;apps/remote-runner-worker/src/httpControlPlaneClient.ts:251;apps/web/src/editor/features/testing/projectTestExecutionClient.ts:61;apps/web/src/editor/features/execution/remoteDataStreamRunCoordinator.ts:236`

**详情**: (1) 预览宿主 CSP 以 `sandbox allow-scripts` 结尾且无 `allow-same-origin`,CSP sandbox 标志与 iframe 属性取并集,预览文档必然落在不透明 origin;编辑器关卡 `acceptsPreviewMessageOrigin` 要求 `messageOrigin === preview.origin`(8 处调用),于是所有远程 Data Gateway 请求、流打开/拉取与 console 桥接被静默丢弃。(2) HTTP artifact 上传丢弃 `label`/`sourceTrace`/`metadata`,浏览器侧 provider 因契约校验失败拒绝,HTTP control plane 上没有一次远程执行能成功完成。(3) 远程项目测试用 `JSON.stringify` 比较两个排序规则不同的 partitionRevisions,provider 永远无法启动。(4) 同一 checkpoint 二次重连触发自造 trace conflict,摧毁刚恢复的流。四条全部 fail-closed 且无诊断。

**影响**: 现有 G2 浏览器 Gate 之所以绿,是因为 `goldenG2VueCatalogRemote.browser.test.ts` 使用了自己的 harness 宿主页,只做 `event.source` 校验并用 `postMessage(..., "*")` —— 没有加载 remote-preview-host 的真实响应头。G3 的 V3 Golden slice 要求「在 Browser、**Remote** 与 CI 三处产生相同 semantic sequence」,V6 Preview surface、V8 第 8 项全部无法启动。

**修复建议**: 统一 origin 模型(去掉 CSP sandbox 指令,或在帧身份校验通过且 `provider === "remote"` 时接受 `messageOrigin === "null"` 并用 `"*"` 回复),并补一个真正加载 remote-preview-host 真实响应头的浏览器级一致性测试;同步修复其余三条。

#### G2-GAP-04(Blocker) canonical 序列化与执行身份依赖 locale:全仓 166 处非测试 `localeCompare`

- **位置**: `packages/workspace/src/workspaceCodec.ts:605(canonical Workspace 序列化本身)`

**详情**: 实测排除测试文件后全仓库 **166 处 `localeCompare`,分布 94 个文件**。最关键一处是 canonical Workspace 编码顺序:`left.path.localeCompare(right.path) || left.id.localeCompare(right.id)`。其余集中在 `apps/web`、`prodivix-compiler`(导出 import 顺序 → 驱动 `export-manifest.json`/`origins.json`/`licenses.json` 与 `contentHash`)、`runtime-core`(execution request)、`runtime-remote`(control plane 幂等 identity key,直达 `remote_executions.identity_key`)、`server-runtime`、`diagnostics`。仓库内已存在三份正确实现(`compareUnicodeCodePoints`、`compareExecutableProjectText`、`compareText`),只是没有统一。

**影响**: 直接威胁 G2 自身的 exact snapshot / 可重算 identity 基础,并且**已有三条从 Low 升级为真实生产故障**(本地项目永久无法打开;远程测试 provider 无法启动;sandbox 与 host Secret 字段排序分歧导致整次执行 exitCode 125)。对 G3 是地基级阻塞:V4「byte-stable plan digest」、V5 evidence digest、V7「Web/CLI/CI 生成相同 digest」全部不成立。

**修复建议**: 抽取共享码点比较器与 canonical JSON 辅助,按「进入 digest / 持久化字节 / 跨进程契约」优先级迁移:先 `packages/workspace` codec、`runtime-core` executionRequest、`prodivix-compiler` export/import planner、`runtime-remote` codec 与 regional recovery,再 diagnostics/server-runtime。同时加 lint 规则禁止在这些包内使用 `localeCompare`。

#### G2-GAP-05(High) 导出入口链可被用户代码文档静默抢占

- **位置**: `packages/prodivix-compiler/src/export/presets/reactVite.ts:221`

**详情**: `ProductionExportPlanner.plan()` 先为 `program.modules` 预留路径,再处理 file contribution。Workspace code 文档以 `desiredPath: joinExportPath("src", normalizeExportCodeArtifactPath(document.path))` 贡献,而该归一化会剥掉前导 `/`、`code/`、`src/` —— 于是 `/App.tsx`、`/src/App.tsx`、`/code/App.tsx` 全部塌缩为 `src/App.tsx`,正是生成的 React entry 想要的路径。用户文档先被规划,真正的 app entry 被推到 `src/App-2.tsx`,而 scaffold 生成的 `src/main.tsx` 仍硬编码 `import App from "./App"`。

**影响**: 导出工程构建失败,或静默启动用户组件而非编译后的应用(所有路由缺失)。`bundle.metadata.pathRewrites` 记录了重命名但不阻断、不发诊断。这破坏 G3 Exit Gate「Preview、Export、CI 使用同一 Scenario」的前提。

**修复建议**: 让 scaffold 入口文件参与路径规划(作为 module 发出,或其 import specifier 经 `resolveInternalModuleImports` 重写),或在规划 modules 之前预留 scaffold 拥有的路径并在冲突时发诊断。

#### G2-GAP-06(High) `verify:g2:vue-target` 在全部 17 个 workflow 中零命中

- **位置**: `packages/golden-conformance/package.json:16`

**详情**: G2 Vue/Vite 独立包浏览器 Gate 受 `describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_TARGET === "1")` 保护,但没有任何 GitHub workflow 设置该变量或调用 `pnpm run verify:g2:vue-target`。它仍被 `specs/roadmap/g2-closure-evidence.md:53` 列为 G2 收口复现命令。

**影响**: 真实的 install/typecheck/build 加浏览器 CRUD 全流程从未在 CI 跑过 —— 这正是 G2-GAP-02 得以存活的原因。

**修复建议**: 把 `pnpm run verify:g2:vue-target` 接入 `.github/workflows/g2-data-closure.yml` 的 `vue-vite-portability` 作业。

#### G2-GAP-07(High) `pnpm docs:diagnostics:check` 当前失败,且其 domain 白名单漏掉 5 个已在发码的域

- **位置**: `apps/docs/reference/diagnostic-codes.md;scripts/generate-diagnostic-docs.mjs:15-29`

**详情**: 本次核验实测该命令 **exit 1**:`Outdated generated file: apps\docs\reference\diagnostic-codes.md`。原因是有人手工润色了这个**生成文件**的中文措辞(4 处),而全部输入源(`specs/diagnostics/`、`packages/plugin-contracts/src/diagnostics.ts`、生成器)均干净 —— 属既有未提交改动。另外 `domainOrder` 硬编码 13 个域(PIR/WKS/PLG/EDT/UX/COD/SEM/GEN/API/AI/RTE/NGR/ANI),**漏掉 DAT/TST/EXE/AST/SVR 五个已在代码中真实发射 63 个 distinct code 的域**。

**影响**: 这是 CLAUDE.md 列出的常用命令之一,当前处于失败状态。domain 白名单缺口意味着 G3 的 `verify:g3:boundaries` 所声称的 diagnostic hard cut 目前没有任何工具背书。

**修复建议**: 重新运行生成器覆盖手工编辑(措辞改动应落到生成器的源,而非产物);把缺失的 5 个域补进 `domainOrder`/`domainInfo`,再随 V0 加入 BHV/VER。

### 2.7 已知且已被正确围栏的外部 pending(不计为缺口)

A14 AWS managed-cloud KMS adapter 的真实 AWS OIDC/KMS/MRK live run 尚未取得。该项在 6 处文档被明确
标注为 `Configured / Evidence pending`,`g2-managed-kms.yml` 也正确地只保留 `workflow_dispatch` 触发。
这是**诚实的未完成声明**,不构成状态漂移。

---

## 3. 第二部分:G3 实现状态与就绪度评估

### 3.1 实现量核验:零

逐项代码检索(非文档推断)结果:

| V0 要求的交付物                                                                              | 代码中实际状态                                                                        |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/behavior`、`packages/verification`                                                 | 不存在                                                                                |
| `behavior-scenario` / `verification-policy` document kind                                    | 零命中                                                                                |
| `core.behavior` / `core.verification` Command namespace                                      | 仅存在于 specs                                                                        |
| `BHV-*` / `VER-*` 诊断码                                                                     | 零命中(grep 命中的 `VER-` 全为 `SERVER-` 子串,如 `WKS-EXPORT-SERVER-PROFILE-INVALID`) |
| `BehaviorScenario` / `VerificationPlan` / `ImpactSet` / `EvidenceCandidate` / `ReplayRecord` | 零命中                                                                                |
| `verify:g3:*` gate script                                                                    | 0 个(对比 `verify:g2*` 39 个)                                                         |
| G3 GitHub workflow                                                                           | 0 个                                                                                  |

git 历史印证:全部 G3 文档由单个 commit `3f3047b8`(2026-07-20,即 G2 Exit 那次提交)一次性创建;
此后 3 个 commit 全部是审查修复与 CI 稳定化,无任何 G3 功能提交,也无 G3 分支。

### 3.2 文档层自洽性:无状态漂移

ADR 56–63 全部 `DecisionStatus: Accepted` + `ImplementationStatus: Not Started`;8 份 `specs/implementation/g3-*.md`、
V0–V8 里程碑、10 个 Gate manifest、2 份 BHV/VER 诊断规范,全部 `Not Started` / `Not Run`。
没有任何一处把「contract 已冻结」写成「已实现」,也没有把「workflow 已配置」写成「Gate 已通过」。

**因此 G3 的问题不是「进度落后」,而是「契约层尚未到可开工状态」。**

### 3.3 就绪度评估总览

| 指标     | 数值 |
| -------- | ---- |
| 分析维度 | 9    |
| 发现总数 | 90   |
| Blocker  | 14   |
| High     | 36   |
| Medium   | 38   |
| Low      | 2    |

| 类别                  | 中文         | 数量 |
| --------------------- | ------------ | ---- |
| contract-gap          | 契约缺口     | 36   |
| inconsistency         | 契约不一致   | 17   |
| readiness             | 就绪度       | 14   |
| dependency-risk       | 依赖风险     | 13   |
| sequencing            | 顺序安排     | 6    |
| determinism           | 确定性       | 2    |
| fail-closed-semantics | 失败关闭语义 | 1    |
| correctness           | 正确性       | 1    |

| 分析维度              | 范围                           | Blocker | High | Medium | Low |
| --------------------- | ------------------------------ | ------- | ---- | ------ | --- |
| `adr-surface`         | ADR 60-63 契约完整性           | 3       | 4    | 3      | 0   |
| `blockers-from-audit` | 本轮静态审查发现对 G3 的阻碍   | 3       | 4    | 3      | 0   |
| `adr-core`            | ADR 56-59 契约完整性           | 2       | 4    | 4      | 0   |
| `scale-risk`          | 规模与风险评估(对比 G2 实绩)   | 2       | 4    | 4      | 0   |
| `stop-conditions`     | 停止条件与前置依赖稳定性       | 2       | 3    | 5      | 0   |
| `evidence-gate`       | 证据模板与 Exit Gate 可验收性  | 1       | 5    | 4      | 0   |
| `impl-mapping`        | 实施文档 ↔ ADR ↔ 里程碑映射    | 1       | 4    | 4      | 1   |
| `v0-readiness`        | V0 就绪度:扩展点现状           | 0       | 5    | 5      | 0   |
| `diagnostics`         | BHV/VER 诊断契约与工具链就绪度 | 0       | 3    | 6      | 1   |

### 3.4 Blocker(14 条)

以下 14 条在写第一行 V0 代码之前必须有结论 —— 其中多条是**同一类型在两份 `Accepted` 文档中被定义了两遍且互不兼容**,
实现者只能任选一份,另一份立刻变成 stale contract。

#### 契约缺口(contract-gap)

##### G3-B-CG-01 BehaviorScenario 结构在 ADR 56 与实施契约之间断裂,57/58/62 消费的 lane/checkpoint/assertion/criticality 身份在落地模型中不存在

- **位置**: `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:56-72 vs specs/implementation/g3-behavior-scenario-authoring-and-composition.md:49-72`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `adr-core`

**详情**: ADR 56:56-69 冻结的 current model 是 `criticality: 'smoke' | 'standard' | 'critical'`、`entry: BehaviorScenarioEntry`、`controls: BehaviorControlProfile`、`lanes`、`checkpoints`、`assertions`、`matrixHints?`,并在 56:72 声明「每个 lane、step、checkpoint 和 assertion 都有稳定 id」。而将要实现的 impl 56:49-61 模型是 `entry: BehaviorTrigger`、`steps`、`controlProfileRef?`、`baselineRefs`、`timeoutPolicy`——lanes、checkpoints、assertions、criticality、matrixHints 全部消失,`BehaviorScenarioEntry` 这个类型在任何文档中都没有定义。下游三个 ADR 都在消费这些已消失的身份:ADR 57:65 要求 ImpactSet 记录「impacted BehaviorScenario/checkpoint/assertion」;ADR 57:76 的 policy predicate 使用「scenario id/tag/criticality」;ADR 57:132 的最小闭合矩阵是「critical scenario 在 Preview、Export、CI 三个 surface 运行」;ADR 58:105 的比较 key「至少包含 Scenario/check stable id」;ADR 62:79-80 的 baseline compatibility key「至少包含 Scenario/checkpoint」;ADR 59:56 的确定性并发是「由 lane、barrier 和 deterministic scheduler 表达」,而 impl 56:89 把 parallel/barrier 降为普通 action kind,没有 lane 概念。

**影响**: 按 impl 56 落地后,ImpactSet 无法产出 checkpoint/assertion 级影响,Policy 无法按 criticality 选择 required cell,visual baseline compatibility key 无法构造,ADR 59 的确定性调度失去它所定义的 lane 载体。这不是措辞差异,而是 V1 建包时就会把 V4/V5/V6 需要的身份维度永久丢掉,后续只能靠加字段+迁移补救。

**建议**: 在 V0 owner hard cut 之前统一一份 BehaviorScenario current model:要么把 lanes/checkpoints/assertions/criticality 补回 impl 56,要么修订 ADR 56 并同步改掉 57:65、57:76、57:132、58:105、62:79 的引用。同时定义或删除 `BehaviorScenarioEntry` 与 `matrixHints`(见另一条发现)。

##### G3-B-CG-02 ADR 62 与其实施文档定义了两份互不兼容的 adapter SPI,核心类型全部对不上

- **位置**: `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:34-47 / specs/implementation/g3-verification-adapters-product-ci.md:49-73`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `adr-surface`

**详情**: ADR 62:34-42 定义 `VerificationAdapterDescriptor = { id; version; checkKinds: readonly VerificationCheckKind[]; surfaces; targets; capabilities; trustInputs }`,并在 46-47 行规定「Adapter…输出 bounded `VerificationCheckReportCandidate`。Core负责strict normalization、identity、budget、SourceTrace和Evidence intake」。实施文档 49-59 行给出的同名 interface 只保留了 `id`:`version`→`implementation: ImplementationIdentity`、`checkKinds`(复数数组)→`family: VerificationCheckFamily`(单数)、`surfaces`+`targets`→`supportedCells: VerificationCapabilityPredicate`、`capabilities`→`requiredControls`、`trustInputs`→`trustCapabilities`,并新增 `inputKinds`/`artifactKinds`/`budgets`。更严重的是 61-73 行把 adapter 从单次调用改成 preflight/prepare/execute/normalize/cleanup 五段生命周期,且 71 行 `normalize(...): Promise<EvidenceCandidate>` 直接由 adapter 产出 Evidence candidate,与 ADR 62:47「Core负责strict normalization」的信任边界相反。`VerificationCheckReportCandidate` 全仓库只在 ADR 62:46 出现一次,无定义文档;`VerificationCheckFamily` 只在实施文档 51 行出现,亦无定义。ADR 57:86-96 定义的是 `VerificationCheckKind`。

**影响**: V6 无法开工:实现者必须先在两份 Accepted 文档间二选一。若按实施文档实现,normalization 落在 adapter 内,ADR 62 的「Web/Backend不解析工具私有payload」信任边界失守,而 ADR 58 的 candidate intake gate 就变成对 adapter 自述结果的复核而非对原始输出的规范化。若按 ADR 62 实现,则 `preflight/prepare/execute/cleanup` 与 budget/artifact 语义全部缺失。另外 `supportedCells: VerificationCapabilityPredicate` 是不可枚举、不可 digest 的谓词,与实施文档 89 行「Planner 使用 immutable snapshot;runner 执行前 exact match」和 ADR 57:122「Plan ID 由 canonical normalized input digest 派生」的确定性要求直接冲突——谓词无法进入 digest,也无法用于确定性 matrix 展开。

**建议**: 以 ADR 62 为 owner 冻结一份 descriptor 与 SPI:(1) 明确 adapter 是否可服务多个 check kind,统一 `checkKinds` 或 `family` 之一;(2) 把 `supportedCells` 改回可枚举的 `surfaces`/`targets`/`browserEngines`/`controlCapabilities` 数组,谓词只允许作为 preflight 的运行期二次判定,不进入 registry snapshot;(3) 明确 normalize 的执行位置与信任级别,并在 ADR 58 中定义 `VerificationCheckReportCandidate` → `VerificationEvidenceCandidate` 的转换 owner;(4) 删除或定义 `VerificationCheckFamily`。修订后把实施文档改为引用而非重述。

##### G3-B-CG-03 `VerificationPlanCell` 无法表达 motion/viewport/color-scheme/locale 轴,Closure 与 matrix UI 无法按 motion 逐 cell 判定

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:79,107-115 / specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:127 / specs/roadmap/g3-closure-evidence.md:49-58`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `adr-surface`

**详情**: ADR 57:107-115 的 cell 类型是 `{ id; scenarioId?; targetId; surface; browserEngine?; controlsDigest; checkIds }`——只有 3 个可读轴。但 ADR 57:79 允许的 policy 轴是「framework target、surface、browser engine、viewport、color scheme、motion、locale」共 7 个,其中 viewport/color scheme/motion/locale 只能被压进不透明的 `controlsDigest`。而 `specs/roadmap/g3-closure-evidence.md:49-58` 的 Required Golden matrix 把 Motion 作为独立列,要求逐行记录「full + reduced」;ADR 62:127 要求「每个cell独立报告unsupported/blocked」;ADR 63:69 要求 matrix「使用紧凑cell状态:queued/running/passed/failed/blocked/unsupported/stale/unstable」。

**影响**: full 与 reduced 两个 required cell 在类型层只差一个 `controlsDigest` 字符串。Closure evaluator(ADR 57:161)无法在不反解 digest 的前提下断言「full 与 reduced 两个 required cell 都存在且都 passed」;ADR 63 的 matrix 表面无法渲染 Motion 列,也无法把某个 cell 标为「reduced 不支持」;`verify:g3:adapter-matrix`(closure-evidence:40)要证明「all required check families/surfaces/targets/browsers/motion」时,motion 维度没有可断言的结构化字段。这会导致实现期临时在 cell 上挂扩展字段,破坏 plan digest 的字节稳定性(ADR 57:122 与 milestones V4 的「byte-stable plan」退出证据)。

**建议**: 在 ADR 57 把 cell 结构改为显式携带 required matrix 轴(至少 `motion: 'full'|'reduced'`,以及 viewport/colorScheme/locale 的可选具名字段),`controlsDigest` 保留为其余 control profile 的摘要;或者反过来,把 closure-evidence 与 ADR 62/63 的「逐 cell motion」要求下调为「按 controls profile 分组」。两者必须选其一,并让 `VerificationPlanCell` 与 g3-closure-evidence.md 的表头列一一对应。

##### G3-B-CG-04 Plan/Closure digest 的两个决定性时间输入未进入 Evidence identity,导致「可重算」条款无法机械验收

- **位置**: `specs/roadmap/g3-closure-evidence.md:20-26`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: ADR 57 明确把 `policyEvaluationInstant` 作为 plan digest 的显式输入并禁止 planner 读 ambient clock:`specs/decisions/57.verification-plan-impact-and-policy.md:43` 「输入包含显式 `policyEvaluationInstant`，用于判断 exemption/freshness，planner 禁止读取 ambient current time」,`:122` 「Plan ID 由 canonical normalized input digest 派生，其中包含调用方提供并被记录的 `policyEvaluationInstant`」,实施文档 `specs/implementation/g3-verification-plan-impact-policy.md:160` 把它列进 Plan 内容、`:181` 要求 planning service「从可信 clock 取得一次 `policyEvaluationInstant` 并将其作为显式输入」。Closure 同样有第二个时间输入:`specs/implementation/g3-verification-plan-impact-policy.md:221` 「Closure 输入是 revision + Policy + immutable Plan + current acceptable Evidence set + evaluation time/retention view」。但 `g3-closure-evidence.md:20-26` 的 Evidence identity 清单只要求记录 repository commit、各类 revision、registry digests、`ImpactSet、VerificationPlan、BehaviorScenarioProgram 和 Closure digest`、identities、run URL 与「开始/完成时间」,没有 `policyEvaluationInstant`,也没有 closure evaluation instant / retention-revocation view 快照。`specs/implementation/g3-verification-evidence-provenance-retention.md:64-85` 的 manifest 接口同样只有 `createdAt`,没有这两个字段。

**影响**: milestone Exit Gate 第 3 条「Golden Plan digest 固定」(`specs/roadmap/g3-behavior-verification-milestones.md:200`)、V8 第 12 项「Closure 从 revision + plan + Evidence 重算 passed」(`:192`) 与 Product journey 第 6 项「Web、CLI、CI 对同一输入生成相同 Plan/Closure digest」(`g3-closure-evidence.md:84`) 都无法被第三方复核:拿到 commit + revision + policy revision 仍然重算不出同一个 plan digest,digest 相等只能靠出证据的人自证。所有以 digest 相等为基础的 Gate 退化为主观陈述。

**建议**: 在 `g3-closure-evidence.md` 的 Evidence identity 中增加两条必填项:(1) 生成 Golden Plan 时使用的 `policyEvaluationInstant`(精确到毫秒的显式值,非「开始时间」);(2) Closure 重算所用的 evaluation instant 与当时的 retention/revocation view 摘要(如 evidence set digest + revocation record digest)。同时在 `g3-verification-evidence-provenance-retention.md:64-85` 的 manifest 中补上对应字段,使复现命令能以 `--policy-evaluation-instant`/`--closure-instant` 参数重放。

##### G3-B-CG-05 VerificationPlanCell 的结构在 ADR 57 与其实施文档中互相矛盾:一个 cell 是「多 check」还是「单 check」没有唯一答案

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:106-116 vs specs/implementation/g3-verification-plan-impact-policy.md:146-154`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `impl-mapping`

**详情**: ADR 57 冻结的 cell 形状是多 check 容器:`type VerificationPlanCell = Readonly<{ id; scenarioId?; targetId; surface; browserEngine?; controlsDigest; checkIds: readonly string[] }>`,并在 line 161 用「每个 required cell/check」把两者当成两级。实施文档则把 cell 定义为单 check 的不可变 identity:「一个 matrix cell 是不可变 identity:`check + scenario + surface + target + browser/runtime + environment profile + control profile + fixture set + baseline set + adapter/tool identity`」,并在 line 196-206 的状态表中给出 per-cell 的 `passed/failed/blocked/unsupported/skipped/not-applicable/unstable` 判定。两者的字段集也不一致:ADR 版本没有 environment profile、fixture set、baseline set、adapter/tool identity;实施版本没有 `controlsDigest`、`checkIds`。Evidence 侧进一步倒向单 check 模型:`specs/implementation/g3-verification-evidence-provenance-retention.md:73-74` 的 manifest 只有一个 `cellId` 和一个 `result: VerificationNormalizedResult`,line 179 的唯一键是 `(workspace_id, plan_digest, cell_id, attempt_id)`。

**影响**: cell identity 是 plan digest、Evidence 唯一键、Closure「required cell 是否满足」和 `verify:g3:verification-plan` / `verify:g3:evidence` 两个 Gate 的共同地基。按 ADR 实现会得到一个 cell 对应 N 个 check 结果,Evidence 的唯一键立刻冲突(同一 cell/attempt 下多条 result 无处安放);按实施文档实现则 ADR 冻结的 `VerificationPlanCell` 类型直接作废。V4 开工第一天就会在两份 Accepted 文档之间二选一,且选错要重写 Plan digest 与 Evidence schema。

**建议**: 在 V0 contract hard cut 之前先修 ADR 57:确定 cell = 单 check(与 Evidence 唯一键、cell 状态表一致),把 `checkIds` 拆成 `checkId`,并把 environment/fixture/baseline/adapter identity 补进 ADR 的 cell 形状;同时把「多 check 分组」显式建模为 Plan 内的 group/DAG 节点而非 cell。修改后同步 `g3-verification-plan-impact-policy.md:146-154` 与 `g3-verification-evidence-provenance-retention.md:179` 的措辞,确保三处引用同一个 identity 定义。

##### G3-B-CG-06 ADR 56（已 Accepted 冻结）与 scenario 实施文档的 BehaviorScenario 结构性冲突，V0 无法冻结 codec

- **位置**: `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:56-69 vs specs/implementation/g3-behavior-scenario-authoring-and-composition.md:49-71`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `scale-risk`

**详情**: ADR 56:56-69 的 `type BehaviorScenario = Readonly<{...}>` 含 `criticality: 'smoke' | 'standard' | 'critical'`、`lanes: readonly BehaviorScenarioLane[]`、`checkpoints: readonly BehaviorCheckpoint[]`、`assertions: readonly BehaviorAssertion[]`、`matrixHints?`，且 control profile 是**内嵌必填**字段 `controls: BehaviorControlProfile;`（第 64 行）。而 g3-behavior-scenario-authoring-and-composition.md:49-61 的 `interface BehaviorScenario` 完全不同：有 `owner?`、`steps: readonly BehaviorStep[]`、`baselineRefs`、`timeoutPolicy`，control profile 变成**可选引用** `controlProfileRef?: BehaviorControlProfileRef;`（第 58 行），且没有 lanes/checkpoints/assertions/criticality/matrixHints。两份文档都标 DecisionStatus: Accepted。milestone 第 35 行要求 V0 交付 “current/wire/codec/migration、Backend/Workspace validation conformance”。

**影响**: V0 的第一件实质工作就是写 `behavior-scenario` 的 current model + strict wire codec + Go validator + migration。两份冻结文档给出两个不兼容的字段集（step 模型 vs lane/checkpoint/assertion 模型是两种不同的执行语义），实现者只能任选一份，另一份立刻变成 stale contract；等到 V1/V3 发现选错，codec、Command 集合、backend validator、generated schema 要整体返工。

**建议**: 在写第一行 V0 代码之前先合并成唯一一份 `BehaviorScenario` 冻结形状（建议以实施文档的 step 模型为准，把 ADR 56 的 `criticality`/`matrixHints` 作为 Policy selector 元数据保留，明确 lanes/checkpoints/assertions 是否降级为 step 的 parallel group / observation），并同步更新 ADR 56 与 diagnostics 文档。这是成本最低、收益最高的一次修订。

##### G3-B-CG-07 control profile / fixture set / baseline set 是被引用的作者态输入，但 V0 只创建两个 document kind，无 owner

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:33-34 vs specs/implementation/g3-deterministic-replay-runtime-controls.md:60 与 specs/implementation/g3-behavior-verification-closure.md:77-78`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `scale-risk`

**详情**: milestone:33-34 只要求 “新建 `behavior-scenario`、`verification-policy` Workspace document 与 `core.behavior`、`core.verification` Command namespace”。但 g3-deterministic-replay-runtime-controls.md:60 写 “Profile 是 Scenario/Policy 引用的 Workspace authoring input 或受控内置 preset”；g3-behavior-verification-closure.md:77-78 写 “Baseline 是被 Scenario 或 Policy 引用的作者态输入。Baseline 更新必须通过 Workspace Transaction”；scenario 模型同时含 `fixtureRefs: readonly BehaviorFixtureRef[]`（同文件第 57 行）。三类被引用对象都没有分配 document kind、Command namespace 或 codec owner。

**影响**: V1 一开始就需要保存 fixture / baseline / control profile，届时只有两条路：临时在 `apps/web` 造第二份 contract（正是 milestone:41-42 停止条件禁止的 “不得用 mock application shell 宣称 G3 vertical”，以及总编排文档第 61 行 “不允许由 `apps/web` 私自定义第二份 contract”），或中途追加 document kind 导致 wire schema 与 backend validator 二次破坏性变更。同时 Evidence manifest 的 `inputs: VerificationInputIdentity` 与 comparison compatibility（evidence 文档 205-213 行）都依赖 baseline digest，缺 owner 会让 V5 的兼容性判定无处取数。

**建议**: 在 V0 的 checklist 中显式补上第三/第四类 owner 决策：control profile 与 fixture/baseline 是（a）`behavior-scenario` 内嵌、（b）新 document kind、还是（c）Asset/Code 领域已有 document 的复用。至少要在 V0 冻结它们的 identity 与 digest 形状，因为它们同时是 Program digest、plan cell identity 和 Evidence manifest 的输入。

##### G3-B-CG-08 controlled Vue target 并未消费同一 ExportProgram,PIR 走独立解释器路径,与 ADR 31 明文冲突

- **位置**: `packages/prodivix-compiler/src/vue/workspacePirRuntime.ts:585-634;packages/prodivix-compiler/src/vue/workspaceProject.ts:574-694`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `stop-conditions`

**详情**: ADR 31 `specs/decisions/31.production-export-planner.md:344` 写明「第二 target 必须消费相同 `ExportProgram`、Data current model、runtime requirement 和 SourceTrace,不得复制 PIR、Data、NodeGraph 或 Animation domain compiler」。实际代码不是这样:React 路径由 `packages/prodivix-compiler/src/react/documentCompiler.ts:582-597` 把每个 PIR 文档编译成独立的 `kind: 'react-component'` 模块(带 `ownerRootId: documentId`);Vue 路径则由 `compileWorkspaceToVueViteExportProgram`(`vue/workspaceProject.ts:574`)自建,把全部 PIR 文档折叠进**一个** `kind: 'runtime-helper'` 的运行时解释器模块 `src/prodivix-pir-runtime.ts`(`workspacePirRuntime.ts:585-589`,内部用 `h(node.type, props, children)` 逐节点解释 `ui.graph.nodesById`,见 :391-478),外加一个手写模板字符串产出的 `src/App.vue`(`vue/workspaceProject.ts:685-694`)。两个 target 的 ExportProgram 模块拓扑、SourceTrace 粒度与产物形态都不同构。

**影响**: V1「React/Vite 与 Vue/Vite semantic target conformance」、V2「React/Vue target conformance」、V6 Target 维度与 V8「无 framework-private canonical fork」在当前实现上不可能等价达成。Vue 侧不存在 per-document 文件边界,任何按文件/模块归因的 behavior finding、visual baseline、SourceTrace 导航都无法与 React 侧对齐;现有产品 Gate 只能证明「跑起来了」,不能证明「同一 Scenario 在两个 target 上语义等价」。

**建议**: 进入 V2/V6 前先决策并落地二选一:(a) 让 Vue target 复用 `compileWorkspaceToExportProgram` 的 PIR 模块编译产物,只替换 preset/渲染层,使两 target 共享同一模块与 SourceTrace 拓扑;或 (b) 显式修订 ADR 31:344,把「Vue 为运行时解释器 target」写成受限契约,并同步在 `g3-closure-evidence.md` 的 Required Golden matrix 中把 Vue 行降为 capability 子集。在此之前 V0 停止条件应判定 controlled Vue target 为「未稳定」。

##### G3-B-CG-09 Vue data operation manifest 把 'subscription' 写入只允许 'query'|'mutation' 的类型,生成工程 vue-tsc 必然失败,且无任何 Gate 覆盖

- **位置**: `packages/prodivix-compiler/src/vue/workspaceProject.ts:112,151,155`
- **严重度**: Blocker ｜ **类别**: contract-gap ｜ **分析维度**: `stop-conditions`

**详情**: `vue/workspaceProject.ts:112` 直接透传 `kind: operation.kind`,而 `packages/data/src/data.types.ts:81-85` 的 `DATA_OPERATION_KINDS` 是 `['query','mutation','subscription']`。生成的 manifest 源码在 :151 声明 `kind: 'query' | 'mutation';`,并在 :155 用 `... as const satisfies readonly ProdivixDataOperation[]`。只要 Workspace 里存在任一 subscription 操作,`src/prodivix-data-operations.ts` 就会包含 `"kind": "subscription"` 并被 `satisfies` 拒绝;而 `packages/prodivix-compiler/src/export/presets/vueVite.ts:80,82` 生成的 package.json 把 `vue-tsc --noEmit` 同时挂在 `typecheck` 与 `build` 上。覆盖漏洞是精确互补的:唯一覆盖 Vue×subscription 的用例 `packages/golden-conformance/src/goldenG2DataTargetMatrix.conformance.test.ts:508-552` 只断言 `capabilityRequirements` 与 `src/prodivix-data-runtime.ts` 的字符串包含,从不 typecheck;而唯一真正跑 `vue-tsc` 的两个 Gate(`goldenG2VueCatalog.browser.test.ts:6`、`goldenG2VueTarget.browser.test.ts:6`)的 fixture 都只有 query/mutation(`goldenG2VueTargetFixture.ts:64-125`)。

**影响**: 任何含 subscription 的 Workspace 导出 Vue 工程即 typecheck/build 失败。这直接击穿 V6 required matrix 的 `Export / Vue-Vite` 与 `CI / Vue-Vite` 两个 cell(`specs/roadmap/g3-closure-evidence.md:54,56` 都要求 build family),也击穿 V8 第 11、12 条。由于 G2 evidence 已把 Vue target 记为 Passed,这个缺陷会被当成「已稳定的前置依赖」带进 G3。

**建议**: 把 `ProdivixDataOperation.kind` 扩为 `'query' | 'mutation' | 'subscription'`,或在 `dataOperations()` 显式过滤并对被过滤操作发 compile diagnostic(不能静默丢弃)。同时给 `goldenG2VueTargetFixture.ts` 加一个 subscription 操作,让 `test:g2-vue-target` 的 browser 用例真正 typecheck 它。此项修复前不得进入 V6/V8。

#### 依赖风险(dependency-risk)

##### G3-B-DR-01 NodeGraph/Animation current model 是全字段破坏性重写,但两个包既无 wire 版本继任者也无迁移基础设施,ADR 60/61 均未引用 ADR 39 的演进协议

- **位置**: `specs/decisions/60.nodegraph-typed-flow-and-behavior-debugging.md:34,39,158 / specs/implementation/g3-nodegraph-typed-flow-debugger.md:48-69,77-78 / packages/nodegraph/src/nodeGraph.types.ts:10-46`
- **严重度**: Blocker ｜ **类别**: dependency-risk ｜ **分析维度**: `adr-surface`

**详情**: 现状 `packages/nodegraph/src/nodeGraph.types.ts:10-46`:`NodeGraphPort` 用 `kind: 'control'|'data'`、`typeRef?`、`required?`、`multiple?`;`NodeGraphNode` 用 `type?` + `data: Record<string, unknown>`(label/description/value 与 runtime 语义混在一起);`NodeGraphEdge.source/target` 是 node id 字符串 + `sourceHandle?: string|null`;`NodeGraphDocument` 携带 `version: 1`。实施文档 48-69 行要求 `flow`、`cardinality: 'single'|'multiple'`、`required: boolean`(必填)、`descriptorRef`、`configuration` + `editor` 分离、`source: NodeGraphPortReference`——每一个字段都被重命名或改型,没有一个字段原样保留。同一份 wire 契约在三处硬编码:`packages/nodegraph/src/wire.ts:18` `version: { const: 1 }`、`packages/nodegraph/src/nodeGraphCodec.ts:345-347` 硬拒绝 `version !== 1`、`apps/backend/internal/modules/workspace/nodegraph_validator.go:53-54` 独立 Go 副本,外加 `apps/backend/internal/modules/workspace/patch.go:61-78` 与 `packages/workspace/src/workspaceContractRegistry.ts:88` 的按字段名 patch 白名单。Animation 同样:`packages/animation/src/animation.types.ts:81-119` 是单 timeline 模型,无 marker/motion intent/priority/blend,`patch.go:80-97` 与 `workspaceContractRegistry.ts:89-94` 把 root 固定为 target/timelines/svgFilters/x-animationEditor。对照 PIR:`specs/pir/PIR-v1.0.json`…`PIR-v1.6.json` 不可变快照 + `PIR-current.version.json` activation manifest + `packages/pir/src/codec/pirMigrationRegistry.ts` + `apps/backend/internal/platform/database/pir_wire_migration.go` + `pnpm run pir:activate-wire`(ADR 39:113-124)。nodegraph/animation 没有任何对应物,`git ls-files` 下不存在 specs/nodegraph 或 specs/animation 快照目录。ADR 60 关联列表(11-17 行)与 ADR 61 关联列表(12-16 行)都没有列 ADR 39。

**影响**: 实施文档 77-78 行的「旧 node-level edge 只能通过 descriptor-aware migration 唯一映射到 port」在当前基础设施上没有落点:没有版本分派入口(codec 直接拒绝非 1),没有 migration chain 注册表,没有 backend 侧迁移编排,也没有说明已持久化的 `pir-graph`/`pir-animation` 文档在何时被迁移(读时?一次性 Workspace Transaction?)。ADR 60:39「Backend、Workspace、Semantic Index、Compiler 与 package codec必须 conformance-equivalent」在三份手写副本之间无法机械保证。N0 阶段(实施文档 234-241)会先撞上「需要先建一套 nodegraph wire 演进协议」这个未被任何里程碑计入的前置工作。

**建议**: 在 V0 之前新增一份决策或扩展 ADR 39,把 wire 快照 + activation manifest + migration chain + backend 编排的协议推广到 `pir-graph` 与 `pir-animation`(至少:`specs/nodegraph/NodeGraph-v1.json` 起始快照、`nodeGraphMigrationRegistry`、Go 侧从生成物而非手写常量取字段白名单)。同时在 ADR 60/61 的关联列表补上 ADR 39,并在实施文档 N0/A0 完成条件里显式写明「已持久化文档的迁移触发点与回滚策略」。

##### G3-B-DR-02 Remote 执行/预览表面当前端到端失效(4 条已确认发现叠加),而 V3/V6/V8 把 Remote 当作必需的独立环境

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:284(H-C-07)、:409(H-CV-01)、:467(M-C-03)、:480(M-C-04);apps/remote-preview-host/src/previewSecurityPolicy.ts:60`
- **严重度**: Blocker ｜ **类别**: dependency-risk ｜ **分析维度**: `blockers-from-audit`

**详情**: H-C-07:`previewSecurityPolicy.ts:60` 的 CSP 以 `'sandbox allow-scripts'` 结尾且无 `allow-same-origin`(已实读确认),CSP sandbox 标志与 iframe 属性取并集,预览文档必然落在不透明 origin;编辑器关卡 `acceptsPreviewMessageOrigin`(apps/web/src/editor/features/blueprint/editor/runner/blueprintProjectNetworkBridge.ts:46,被 :76/:87/:98/:110/:121/:132/:144/:157 共 8 处调用)要求 `input.messageOrigin === preview.origin`,于是「所有远程 Data Gateway 请求、流的打开/拉取以及 console 桥接记录都被静默丢弃,因此远程预览既没有数据也没有 console 输出,而且任何地方都没有诊断信息」。同一集群还有三条独立缺陷:H-CV-01 —— HTTP artifact 上传丢弃 `label`/`sourceTrace`/`metadata`,「在 HTTP control plane 上没有任何一次远程执行能够成功完成」;M-C-03 —— `projectTestExecutionClient.ts:61` 用 JSON.stringify 比较两个排序规则不同的 partitionRevisions,「远程测试 provider 永远无法启动」;M-C-04 —— 同一 checkpoint 二次重连触发自造 trace conflict,「摧毁一条刚刚成功恢复的流」。四条全部 fail-closed 且无诊断。

**影响**: V3 Golden slice 要求「相同 Catalog conflict/retry Scenario 连续运行至少三次并在 Browser、Remote 与 CI-controlled environment 中产生相同 semantic sequence」(specs/roadmap/g3-behavior-verification-milestones.md:97);V6 Required matrix 的 Surface 维度含 Preview,g3-closure-evidence.md:51-52 明确要求 Preview × React/Vite 与 Vue/Vite 在「Chromium Browser/Remote」两种 runtime 上出证据。Remote 侧今天连一次成功执行都跑不出来,V3 的三次重复一致性、V6 的 Preview/Remote cell、V8 第 8 项 cancel/timeout/worker loss/resume 全部无法启动。此外 H-C-07 的验证备注指出「唯一真正跑通该桥接的浏览器关卡(goldenG2VueCatalogRemote.browser.test.ts)使用了自己的 harness 宿主页,只做 event.source 校验并使用 postMessage(..., '*')」—— 也就是说现有 G2 关卡结构性地看不见这个问题,G3 若沿用同一 harness 会继续绿灯。

**建议**: P1(与 V0 并行,V3 开工前必须完成):先按 H-C-07 修复建议统一 origin 模型(去掉 CSP sandbox 指令,或让编辑器在帧身份校验通过且 provider==='remote' 时接受 messageOrigin==='null' 并用 '*' 回复),并补一个真正加载 remote-preview-host 真实响应头的浏览器级一致性测试而非字符串级单测;同步修 H-CV-01(传输完整描述符)、M-C-03(逐条目比较而非 JSON.stringify)、M-C-04(恢复连接使用独立 span 身份)。修复顺序上 H-C-07 与 H-CV-01 必须先于任何 V3/V6 Remote cell 的设计。

#### 契约不一致(inconsistency)

##### G3-B-IC-01 失败/状态 taxonomy 被四处独立定义且互不兼容,`unstable` 同时是单 attempt outcome 和多 attempt 派生状态

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:98-99 / specs/decisions/58.verification-evidence-provenance-and-retention.md:59 / specs/implementation/g3-verification-plan-impact-policy.md:196-208 / specs/implementation/g3-verification-evidence-provenance-retention.md:88`
- **严重度**: Blocker ｜ **类别**: inconsistency ｜ **分析维度**: `adr-core`

**详情**: ADR 57:34 声明 `@prodivix/verification` 拥有「stable failure taxonomy」,但四处枚举各不相同:(1) ADR 57:98-99「required check 的 skipped、missing、unsupported、blocked、infrastructure-error、stale 或 incompatible evidence 都不能满足 closure」;(2) ADR 58:59 Evidence outcome 是 `passed / failed / blocked / cancelled / infrastructure-error / unstable`;(3) impl 57:196-206 cell status 是 planned/running/passed/failed/blocked/unsupported/skipped/not-applicable/unstable;(4) impl 58:88「`result` 保留 passed/failed/blocked/unstable」。`cancelled` 与 `infrastructure-error` 在 cell status 表中没有落点;`skipped`/`unsupported`/`not-applicable`/`stale`/`incompatible` 在 Evidence outcome 中没有落点。更严重的是 `unstable`:ADR 57:143 定义为「显式 stability sampling 必须保留所有 attempt,结果不一致标记 `unstable`」、impl 57:206 定义为「attempts 在同输入下不一致」——这是跨多个 attempt 的派生判断,却被 ADR 58:59 和 impl 58:88 放进单条 immutable、per-attempt 的 Evidence manifest 里,而 ADR 58:135 又规定「Evidence 创建后不可编辑」。单个 attempt 在物理上无法为自己判定 unstable。

**影响**: Closure evaluator 需要把 cell status 与 Evidence outcome 做映射才能求值,而映射关系没有定义;实现者只能各自猜测,极易在 `cancelled`、`unsupported`、`stale` 这几个洞上写出 fail-open 的默认分支。`unstable` 若真写进 immutable manifest,要么需要事后改写(违反 append-only),要么永远写不出来(该状态死掉)。

**建议**: 在 ADR 57 冻结唯一一张状态表并区分三层:per-attempt EvidenceOutcome(passed/failed/blocked/cancelled/infrastructure-error)、per-cell derived status(在前者之上加 unsupported/skipped/not-applicable/unstable/stale)、closure verdict。明确 unstable 只存在于 cell 层;明确每个 per-cell status 是否需要 Evidence 支撑、无 Evidence 时 Closure 从哪里取事实。ADR 58:59 与 impl 58:88 改为只列 per-attempt 值。

#### 确定性(determinism)

##### G3-B-DT-01 163 处非测试 `localeCompare` 贯穿 canonical codec/导出/执行身份路径,V4「byte-stable plan digest」与 V5 evidence digest 无法建立

- **位置**: `packages/workspace/src/workspaceCodec.ts:605;specs/implementation/reviews/2026-07-26-static-review.md:1970-2085(L-DET-01..09)、:394(H-DET-01)、:1137(M-DET-01)`
- **严重度**: Blocker ｜ **类别**: determinism ｜ **分析维度**: `blockers-from-audit`

**详情**: 实测统计:排除测试文件后全仓库 163 处 `localeCompare`,集中在 apps/web(46)、prodivix-compiler(29)、workspace(15)、runtime-remote(11)、runtime-core(9)、server-runtime(8)、diagnostics(6)。最关键的一处是 canonical Workspace 序列化本身:`workspaceCodec.ts:605` 用 `left.path.localeCompare(right.path) || left.id.localeCompare(right.id)` 决定 documents 数组顺序。审查报告 determinism 类共 11 条,已覆盖导出产物(L-DET-03:`importPlanner.ts:43` 决定 import 语句顺序,并驱动 `.prodivix/export-manifest.json`/`origins.json`/`licenses.json` 与 `package.json` 依赖键顺序,而 `hashExportFileContents`(planner.ts:397-405)对输出字节做哈希,「记录的 contentHash 会随导出用户的区域设置而变化」)、执行请求(L-DET-04:`executionRequest.ts:68`)、control plane 幂等身份键(L-DET-05:`remoteExecutionCodecPrimitives.ts:126`,链路直达 `remote_executions.identity_key`)、区域恢复证据摘要(L-DET-06)、Issues 排序与代表诊断选取(L-DET-08)。已经有三条从 Low 升级为真实生产故障:H-DET-01(本地项目永久无法打开)、M-C-03、M-DET-01(sandbox 与 host Secret 字段排序分歧,整次执行 exitCode 125)。特别注意 L-DET-03 的验证备注明确写道「specs/roadmap/global-phases.md 把『可复现产物』列在 G3 这一未来阶段之下,而不是当前要求」—— 这批 Low 评级正是**以推迟到 G3 为理由**给出的,G3 因此完整继承了这笔债。

**影响**: specs/implementation/g3-verification-plan-impact-policy.md:160-167 要求 Plan 绑定「exact Workspace、Scenario、Policy、Impact、semantic/provider/compiler/planner digests」并产出「canonical plan digest」,:271 的完成条件是「跨进程/OS canonical fixture 得到相同 plan bytes」;g3-verification-evidence-provenance-retention.md:112 要求「digest mismatch fail closed」,:179 要求 `(workspace_id, plan_digest, cell_id, attempt_id)` 唯一;V7 要求「Web/CLI/CI 生成相同 Plan/Closure digest」。只要 canonical Workspace 编码顺序依赖宿主 ICU/区域设置,Web(浏览器 locale)、CLI(LANG)与 CI(容器 locale)就会对同一 revision 算出不同 digest,V4/V5/V7 的核心验收标准在实现层直接不成立。更糟的是:一旦 V5 已经把 evidence 落库并绑定 plan_digest,再统一比较器会使全部历史 Evidence 失效 —— 这是典型的「越晚修成本越高」。

**建议**: P0(V0 之前完成):抽取一个共享码点比较器与 canonical JSON 辅助(仓库已有三份实现:`executableProjectNormalization.ts:54` 的 compareExecutableProjectText、`isolatedServerFunctionImportGraph.ts:48` 的 compareText、`react/workspaceProject.ts:184` 的 compareUnicodeCodePoints),按「进入 digest/持久化字节/跨进程契约」优先级迁移:先 packages/workspace codec、runtime-core executionRequest、prodivix-compiler export/import planner、runtime-remote codec 与 regional recovery,再 diagnostics/server-runtime。同时按 L-DET-03 建议加一条 lint 规则禁止在这些包内使用 `localeCompare`,并把规则纳入 `verify:g3:boundaries` 的门禁内容 —— 否则 V4 之后新增代码会继续引入新的非确定性点。

#### 就绪度(readiness)

##### G3-B-RD-01 Vue/Vite controlled target 既有正确性缺陷又无 CI 浏览器门禁,而 V0 停止条件已把它写成 V2/V6/V8 的硬前置

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:232(H-C-03)、:1167(M-CI-01)、:1970(L-DET-01);packages/prodivix-compiler/src/vue/workspaceProject.ts:155;packages/golden-conformance/package.json:16`
- **严重度**: Blocker ｜ **类别**: readiness ｜ **分析维度**: `blockers-from-audit`

**详情**: H-C-03 已端到端复现:`dataOperations` 不按 kind 过滤,而 `operationManifestSource` 把生成类型写成 `kind: 'query' | 'mutation'`,一个 server 区 core.graphql subscription 会让导出的 `src/prodivix-data-operations.ts` 触发 `error TS2322: Type '"subscription"' is not assignable to type '"query" | "mutation"'`;Vue 预设的构建脚本是 `vue-tsc --noEmit && vite build`,「因此生成的项目确实无法构建」,而「golden conformance 恰恰断言它是 'ready'」。M-CI-01 证实 `verify:g2:vue-target` 在全部 17 个 workflow 中零命中,受 `describe.runIf(process.env.PRODIVIX_VERIFY_G2_VUE_TARGET === '1')` 保护的浏览器套件「未被覆盖的只是真实的 install/typecheck/build 加浏览器 CRUD 全流程」,但它仍被 `specs/roadmap/g2-closure-evidence.md:53` 列为 G2 收口复现命令。L-DET-01 另证 Vue 数据操作 manifest 比较器违反反对称性(`compare(mutation, subscription) === 1` 两个方向都成立)。

**影响**: g3-behavior-verification-milestones.md:41-42 的 V0 停止条件原文:「G2 exact snapshot、ExportProgram、SourceTrace、Browser/Remote provider 或 controlled Vue target 未稳定前,不进入 V2/V6/V8 产品 closure」。V1 必须完成「React/Vite 与 Vue/Vite semantic target conformance」(:53);g3-closure-evidence.md:52/54/56/57/58 共 4 个必需 cell 依赖 Vue/Vite(Preview、Export、CI、Firefox/WebKit critical subset)。Vue 目标当前既有确认可复现的构建破坏,又缺少能发现该破坏的 CI 门禁 —— 也就是说 G3 会在一个「未稳定且不受门禁保护」的 target 上建 4 个必需 cell,V6/V8 的 Vue 列随时可能整列失效。

**建议**: P1(V1 之前完成):先修 H-C-03(过滤 subscription 并发 `VUE-TARGET-*` 诊断,或放宽生成类型并补 subscription 分支)与 L-DET-01(用 kindRank 全序 + compareText),再按 M-CI-01 建议把 `pnpm run verify:g2:vue-target` 接入 `.github/workflows/g2-data-closure.yml` 的 `vue-vite-portability` 作业。注意这属于补 G2 债而非 G3 新工作 —— 应在 V0 期间以「G2 稳定性修复」名义单独闭环,不要混入 V1 的 scenario authoring 交付。

### 3.5 High(36 条)

#### 契约缺口(contract-gap)

##### G3-H-CG-01 plan digest 包含 `policyEvaluationInstant`,而 Evidence 绑定 planDigest,Evidence 能否跨 plan 复用完全没有定义

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:43-44,122-123,161-163 与 specs/implementation/g3-verification-evidence-provenance-retention.md:71,179`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `adr-core`

**详情**: ADR 57:122-123:「Plan ID 由 canonical normalized input digest 派生,其中包含调用方提供并被记录的 `policyEvaluationInstant`」。这意味着 revision/policy/impact 完全不变,只要评估时刻推进,plan digest 就会改变。同时 ADR 58:55 要求 Evidence 引用「Plan、cell、check」,impl 58:71 把 `planDigest: Digest` 放进 manifest,impl 58:179 把 `(workspace_id, plan_digest, cell_id, attempt_id)` 设为唯一键。ADR 57:161-163 定义 Closure「绑定 target Workspace revision、plan digest 和 evidence digests」。但没有任何一处说明:在新 plan digest 下,cell identity 相同(impl 57:148-154 的 cell identity 不含 plan digest 与 instant)的既有 Evidence 是否仍可满足 required cell。

**影响**: 两个分支都很糟:若 Evidence 是 plan-scoped,则每一次重新 planning(CI 每次触发都会取新的 instant)都作废全部既有 Evidence,ADR 57:130-137 的最小闭合矩阵(三 surface × 两 framework × 三 browser × full/reduced motion)每次改动都要从零跑满,增量验证在契约层被堵死;若默认可跨 plan 复用,则复用条件(policy revision 是否变、exemption 是否在新 instant 下已过期)没有规则,直接构成 fail-open。

**建议**: 在 ADR 57 明确 Evidence 的作用域是 cell identity 而非 plan digest,并写出跨 plan 复用的准入条件(cell identity 相同 + policy/scenario/baseline/adapter revision 相同 + freshness/trust 满足);或把 `policyEvaluationInstant` 从 plan digest 输入中移出、改为量化的 policy epoch,使同一 change 在时间推进时保持稳定 plan digest。同时修正 impl 58:179 的唯一键。

##### G3-H-CG-02 control profile、fixture、visual baseline 三类作者态输入没有 owner document kind / Command namespace / codec,但它们的 digest 是 cell identity 与 Program digest 的组成部分

- **位置**: `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:31-44、specs/decisions/58.verification-evidence-provenance-and-retention.md:138-140、specs/implementation/g3-verification-plan-impact-policy.md:148-154、AGENTS.md:25`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `adr-core`

**详情**: ADR 59:31「每个 Scenario Program 必须绑定完整、可摘要的 `BehaviorControlProfile`」,impl 59:60「Profile 是 Scenario/Policy 引用的 Workspace authoring input 或受控内置 preset」;impl 59:111「fixture 必须通过 Workspace authoring/approved import」;ADR 58:138-139「Baseline digest/reference 存于 canonical `behavior-scenario` 或 `verification-policy`,bytes 复用 exact-byte blob primitive」。但 G3 只冻结了两个 document kind(ADR 56:46 `behavior-scenario`、ADR 57:38 `verification-policy`),`AGENTS.md:25` 的不变量清单里也只有 BehaviorScenario 与 VerificationPolicy。control profile 与 fixture 既不是这两种文档,也没有自己的 kind、`core.*` namespace、wire codec 或 validator;impl 56:131-132 只有 `core.behavior.set-fixtures` / `core.behavior.set-control-profile` 这类「在 scenario 上设一个 ref」的命令,被指向的对象无人拥有。baseline 的归属更是被写成「`behavior-scenario` 或 `verification-policy`」的二选一,而 impl 56:133 只给了 `core.behavior.set-baselines`,impl 57:112-125 的 policy 命令里没有任何 baseline 命令,baseline bytes 存在哪里(是否为 Workspace Asset、预算多少)全文未定义。

**影响**: 这三者的 digest 都是硬依赖:impl 57:148-154 的 cell identity 含「control profile + fixture set + baseline set」,ADR 56:163 的 Program 含 fixture digest,ADR 62:79 的 baseline compatibility key 含 font set/viewport。没有 owner 文档就没有 revision,没有 revision 就无法做「baseline 更新是可逆 Workspace Transaction」(ADR 58:139)和「Policy/Scenario revision 变化使 closure stale」(ADR 57:163)。总编排文档 g3-behavior-verification-closure.md:60-61 明确要求「G3 开始前必须冻结 Workspace document kind」,而这一步现在冻结不了。

**建议**: 在 V0 之前决定:control profile 与 fixture 是独立 document kind(需补 kind/namespace/codec/validator/迁移),还是内嵌于 `behavior-scenario`/`verification-policy` 的子结构(需补 impl 56 模型字段)。baseline 归属必须唯一(建议归 `behavior-scenario`,与 `core.behavior.set-baselines` 一致),并明确 bytes 是否走 `@prodivix/assets` 与 Git projection 及其大小预算。同步更新 AGENTS.md:25 的文档清单。

##### G3-H-CG-03 trust revocation 是 Evidence 平面唯一可翻转已通过 Closure 的可变输入,ADR 58 全文未定义它

- **位置**: `specs/decisions/58.verification-evidence-provenance-and-retention.md:89-91,135-136 vs specs/implementation/g3-verification-evidence-provenance-retention.md:157,169 与 specs/diagnostics/verification-diagnostic-codes.md:189`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `adr-core`

**详情**: ADR 58:135「Evidence 创建后不可编辑、重新签名或覆盖」,58:89-91 只说「验证 key、algorithm 和 key id 可轮换」,通篇没有 revocation 概念。但下游已经在依赖它:impl 58:157「后续 trust revocation 通过独立 revocation record 影响 Closure,不改写历史 manifest」、impl 58:169 有 `verification_trust_revocations` 表、impl 58:287 完成条件是「过期/删除/revoked 立即影响重算 Closure」、`VER-6001`(verification-diagnostic-codes.md:189)的 Trigger 写明「Evidence 因 TTL/trust revocation 不再满足 Closure」、impl 57:293 的测试矩阵含「Closure stale/expired/revoked」。谁有权创建 revocation record、作用域是 issuer/key 还是单条 Evidence、生效是否追溯、是否需要审计与授权、以及它与 ADR 58:28「immutable、append-only」的关系,ADR 层一概没写。

**影响**: revocation 是唯一能把一个已经 passed 的 Closure 变成 failed 的输入,却处在契约真空里。实现者可能把它做成后台任务可静默写入的表,形成一个绕过 Command/Transaction 与审计的「负向写路径」;或者反过来 ADR 的 immutability 措辞被解读为「不允许 revocation」,导致泄露的 CI 签名密钥所签出的历史 Evidence 无法失效。

**建议**: 在 ADR 58 增加 revocation record 一节:一等对象、append-only、含 issuer/key/evidence scope、reason、actor、生效时刻;明确它不改写 manifest 只影响 Closure 重算;明确授权边界(runner 与 adapter 不得写)与审计要求;并把它加入 g3-behavior-verification-closure.md:65-75 的 Canonical artifact matrix。

##### G3-H-CG-04 Issues 的 revision 绑定会静默丢弃旧 revision 的 Evidence 诊断,ADR 63 未处理这一冲突

- **位置**: `packages/diagnostics/src/diagnosticIssueCollection.ts:262-271 / packages/diagnostics/src/diagnosticIssue.types.ts:12-18 / specs/decisions/63.verification-product-surface-diagnostics-and-ci.md:38,140`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `adr-surface`

**详情**: `diagnosticIssueCollection.ts:262-271` 的 `applyProviderSnapshot` 规则是:当 snapshot 的 revision sequence 低于集合当前 revision 时返回 `{ status: 'ignored-stale' }`,相同 sequence 但 key 不同则 `revision-collision` 拒绝。`diagnosticIssue.types.ts:12-18` 的 `DiagnosticProviderSnapshot` 绑定单一 `workspaceId` + 单调 `revision: { key, sequence }`。ADR 63:38 要求「Issues聚合authoring、plan、run和evidence诊断」,140 行要求「stale revision/plan在UI显式,不自动把旧passed套到新revision」,94 行要求「所有presentation与Quick Fix继续使用 `@prodivix/diagnostics`」。但 Evidence 天然是跨 revision 的持久对象(ADR 58),一次 run 的 VER 诊断属于运行时的那个 revision。

**影响**: VER provider 只有两种选择,都错:(a) 用运行时的旧 revision 提交 → workspace 一旦推进就被 `ignored-stale` 静默丢弃,failed Evidence 从 Issues 消失,违反 ADR 63:72「Closure明确列出missing/failed/incompatible evidence」;(b) 用当前 revision 提交 → 把旧 revision 的失败错误归属到新 revision,违反 ADR 63:140。ADR 63 只说「继续使用 `@prodivix/diagnostics`」,没有为跨 revision 诊断定义任何新语义,而 `DiagnosticIssueStatus` 现有的 `'stale'` 是由 collection 内部推导的,不是 provider 可声明的。

**建议**: 在 ADR 63 明确 Evidence 诊断进入 Issues 的机制:要么由 `@prodivix/diagnostics` 扩展 provider snapshot 以允许携带 `sourceRevision ≠ collectionRevision` 并自动标 `stale`(需要改 `applyProviderSnapshot` 的接收规则),要么规定 Evidence 诊断只在 Verification surface 呈现、Issues 只承载当前 revision 重算出的 VER 诊断。同时把该改动列入 V0「`behavior`/`verification` diagnostic domain、target 和 registry」的必须完成项。

##### G3-H-CG-05 导出入口链被路径规划器静默改写,破坏 G3 Exit Gate「Preview、Export、CI 使用同一 Scenario」的前提

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:245(H-C-04);packages/prodivix-compiler/src/export/presets/reactVite.ts:221`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `blockers-from-audit`

**详情**: 审查者用最小 WorkspaceSnapshot 实测:codePath 为 `/src/App.tsx`、`/App.tsx`、`/code/App.tsx` 三种情形下 `generateWorkspaceReactViteBundle` 都产出 `entryFilePath` 为 `src/App-2.tsx`,而脚手架 `src/main.tsx` 仍包含 `import App from './App';`,`metadata.pathRewrites` 记录了改写但「blockingDiagnostics 保持为空」,「'/App.tsx' 的情形根本没有产生任何 Workspace 校验诊断」。后果二选一:`pnpm build` 以 "Module './App' has no default export" 失败,或「导出的应用会静默启动那个组件而不是编译后的应用,所有路由都会缺失」。Vue 侧的等价变体是位于 `/main.ts` 的代码文档抢走 `src/main.ts`。

**影响**: G3 Exit Gate 明确列出「Preview、Export、CI 使用同一 Scenario;无 editor-private state 或 framework-private canonical fork」(g3-behavior-verification-milestones.md:202);V6 Required matrix 的 Surface 维度含 standalone Export,g3-closure-evidence.md:53-54 有 2 个 Export cell 要求 build/behavior/visual/a11y/performance/security 六个 family。若导出产物可能静默运行的是用户代码文档而非编译后的应用,则 Export cell 的行为观测与 Preview cell 根本不是同一个程序,V6 的 target/surface parity 与 V8 的 Closure 都建立在错误前提上,而且因为无诊断,失败会表现为「visual diff 莫名不一致」而不是明确 blocked —— 这正是 G3 最不该出现的失败模式。

**建议**: P1(V6 设计前完成):按 H-C-04 建议,把脚手架入口文件纳入路径规划(让 `src/main.tsx` 作为模块输出并经 `targetModuleId`+`resolveInternalModuleImports` 解析),或在规划 program.modules 之前先把脚手架自有路径预留进 `usedPaths`,并在 Workspace 代码文档请求这些路径时发出**阻断性**诊断。G3 的 V6 adapter 一旦对 Export surface 建立 baseline,这类静默改写会被固化进 visual/performance baseline,届时回溯成本远高于现在。

##### G3-H-CG-06 执行期机密泄露守卫对 base64 内容结构性失效,V5 的 Secret hard cut 与对应 negative evidence 会假通过

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:794(M-SEC-09);apps/remote-runner-worker/src/rootlessPodmanSandbox.ts:1566`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `blockers-from-audit`

**详情**: 审查者端到端验证「无法推翻」:`createExecutionSecretLeakGuard`(packages/runtime-core/src/executionSecretLeakGuard.ts:275-300)只做字面 UTF-8 匹配,`normalizeSecretValues`「只做去重/排序/限界,不添加任何编码变体(没有 base64、没有 JSON 转义、没有百分号编码)」;而 `entry.mjs` 的 contentRecord(345-350)把每个变更文件正文存为 `contents.toString('base64')`,「整个差异信封在第 459 行又被 base64 一次,因此守卫所看到的内容中结构性地不存在原始机密字节」。两处检查点(rootlessPodmanSandbox.ts:1566 与 workerAgent.ts:76-85)同时受影响,结论是「守卫的 artifact-content 检查面对所有文件正文实际上完全失效 —— 该流水线中的每一份 artifact 载荷都是 base64」。

**影响**: V5 必须完成「Secret/PII/active-content/path/archive/image budget hard cut」(milestones:123);g3-verification-evidence-provenance-retention.md:122 要求 promotion 时「流式计算 digest、size、media sniffing 和 class-specific structural validation」,:241 要求扫描器只报 class/path/count;g3-closure-evidence.md:68 把「Secret/credential/PII/active artifact/path/archive bomb 阻止 promotion」列为必需 negative evidence。`createExecutionSecretLeakGuard` 是当前唯一的 fail-closed Secret 控制,也是 V5 promotion sanitizer 最自然的复用基座。若 V5 直接复用而不先解决编码盲区,`verify:g3:evidence` 的 Secret negative 用例会以「守卫返回未检出」的方式**假通过** —— 这比缺失控制更危险,因为它会写进 closure evidence manifest 作为已验证结论。

**建议**: P2(V5 设计阶段之前完成):按 M-SEC-09 建议改为「先解码再检查」—— 在 `canonicalizeSandboxFilesystemDiff` 中对已解码的 `change.baseline.contents`/`change.runtime.contents` 运行守卫,并对 preview/build bundle、Vitest 报告等所有包装 base64 载荷的 artifact 媒体类型同样处理。V5 的 promotion sanitizer 在设计时应把「守卫必须作用于解码后的规范形态」写成显式契约,并在 negative evidence 中加入一个 base64 包装的机密用例作为回归。

##### G3-H-CG-07 `exemptable` 动作条件被硬编码为 domain === 'ux',VER 的 exemption 入口在 presentation 层结构上不可能实现

- **位置**: `packages/diagnostics/src/buildDiagnosticPresentation.ts:185-186`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: `hasRequirement` 的实现是 `case 'exemptable': return diagnostic.domain === 'ux';`。而 `createExemptionAction`(packages/diagnostics/src/diagnosticShared.ts:68-73)的 `requires: ['exemptable', 'targetRef']`。VER 码表多处把 "创建有界 exemption" 写成用户主动作:`VER-2002` User action「通过正式 authoring 创建新的有界 exemption」(verification-diagnostic-codes.md:83)、`VER-3004`「调整 canonical Policy、拆分 scope 或创建有界 exemption」(第 118 行)、`VER-2001`/`VER-6002` 同样依赖 Policy 编辑路径。ADR 63 第 94 行也写明「baseline/exemption/repair只返回proposal或Workspace Command reference」,即 exemption 必须从诊断发起。`specs/implementation/g3-verification-plan-impact-policy.md:123-124` 已冻结 `core.verification.add-exemption` / `revoke-exemption` Command。

**影响**: 任何 `domain: 'verification'` 的诊断,`create-exemption` 动作永远 `enabled: false`。V7 产品面要交付的 "failed check → 创建有界 exemption" 路径在 `@prodivix/diagnostics` 里被一行硬编码堵死,且没有任何 G3 文档提到需要修改它——会在 V7 才被发现,届时改动 presentation contract 的成本远高于 V0。

**建议**: 把 `exemptable` 从 domain 硬编码改为由 `DiagnosticDefinition` 或 `diagnostic.meta` 显式声明(例如 definition 上加 `exemptable: boolean`),并在 ADR 63 的 "Diagnostics domains" 小节补一句 exemption 动作的 gating 契约。这属于 V0 的 `@prodivix/diagnostics` 改动,不应推迟到 V7。

##### G3-H-CG-08 「run URL 或可重放的本地/CI命令」的「或」与 Evidence trust class 冲突,允许纯本地证据支撑 Passed

- **位置**: `specs/roadmap/g3-closure-evidence.md:25`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: `g3-closure-evidence.md:25` 写「run URL 或可重放的本地/CI命令」。而 ADR 58 `specs/decisions/58.verification-evidence-provenance-and-retention.md:84` 定义 `local-unattested` 为「本机 Preview/Browser run，适合即时反馈，不满足默认 CI closure」,`:86` 定义 `ci-attested` 为默认 change/CI closure;实施文档 `specs/implementation/g3-verification-evidence-provenance-retention.md:137-142` 的 trust 表同样规定 local 与 imported「不能满足 required cell」。G2 的实际做法是两者都给且明确区分:每节同时给出「本地重复命令」代码块、本地复跑日期,以及 workflow 名 + commit SHA + Actions run 链接(如 `specs/roadmap/g2-closure-evidence.md:42-44`、`:112-114`),并在只有本地证据时显式声明远端证据待取得(`:280-282`、`:266-270` 的 `Configured / Evidence pending`)。

**影响**: 文档层的「或」把 contract 层的 trust hard cut 打开了一个口子:G3 Exit 可以由一次本机运行的 digest 记录支撑,而这类证据按 ADR 58 根本不能满足 required closure,形成文档与契约互相矛盾的两套标准。

**建议**: 把 :25 改成「本地可重放命令与远端 run URL 两者都必须记录,并标注该 Gate 所依赖 Evidence 的 trust class;trust 为 `local-unattested` 时该行只能写 `Configured / Evidence pending`,不得写 `Passed`」,与 :89-95 的状态词汇表打通。

##### G3-H-CG-09 Exit Gate 第 5 条「无 editor-private state 或 framework-private canonical fork」没有映射到任何 Gate

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:202`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: milestone Exit Gate 要求「Preview、Export、CI 使用同一 Scenario；无 editor-private state 或 framework-private canonical fork」。这是一个全称否定命题,但 `g3-closure-evidence.md:34` 的 `verify:g3:boundaries` 行只承诺证明「package owner、Workspace document/Command、codec/diagnostic hard cut」,没有 editor-private state 扫描,也没有跨 surface / 跨 target 的 Scenario identity 相等断言。仓库已有可复用的机械化先例:`scripts/check-editor-hard-cut.mjs` 扫描 `apps/web` 与 `apps/backend` 生产源码并维护 allowlist,已由 `verify:g0` 阶段 2 消费(`specs/roadmap/g0-closure-evidence.md:33`),`check:core-boundaries`、`check:pir-current-boundary` 同理。另外「同一 Scenario」缺少可判定谓词:`g3-closure-evidence.md:22` 把 `BehaviorScenarioProgram` digest 写成单数,而 `specs/implementation/g3-behavior-verification-closure.md:71` 规定 Program 身份绑定「scenario/revision/compiler digest」,compiler digest 天然按 target 不同,单一 digest 字段无法表达「哪一部分必须跨 surface/target 相等」。

**影响**: 该条 Exit Gate 只能靠人眼审阅代码得出结论,与 G0 把同类不变量做成扫描脚本的既有标准相比是倒退;并且随 G3 新增 `@prodivix/behavior`/`@prodivix/verification` 领域类型,`apps/web` 私自复制 domain type 的风险恰恰更高(总编排 `specs/implementation/g3-behavior-verification-closure.md:149-150` 已明令「任何 G3 domain type 不得先落在 apps/web」)。

**建议**: (1) 在 `verify:g3:boundaries` 行显式加入「扩展 `check-editor-hard-cut.mjs` 覆盖 behavior/verification domain type 与 Scenario/Program 私有镜像」;(2) 在 Evidence identity 中把 Program digest 拆成 `scenarioId + scenarioRevision + programSemanticDigest`(必须跨 surface/target 相等)与 `programTargetProjectionDigest`(允许按 target 不同),并要求 closure manifest 断言前者在 Preview/Export/CI 与 React/Vue cell 上完全一致。

##### G3-H-CG-10 Evidence identity 不记录 applied exemption、advisory 裁剪与 budget 决策,且缺少 G0 式反作弊条款

- **位置**: `specs/roadmap/g3-closure-evidence.md:16-28`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: G3 引入了三条 G0-G2 不存在的「合法降级」通道:exemption(`specs/decisions/57.verification-plan-impact-and-policy.md:148-157`,以及 `specs/implementation/g3-verification-plan-impact-policy.md:127-129` 的 Command `core.verification.add-exemption`)、budget 裁剪 advisory cell(`specs/implementation/g3-verification-plan-impact-policy.md:190` 「advisory cells 可按稳定优先级裁剪，并记录未计划 reason」)、以及 retry/unstable 判定。Closure 输出本身要求包含「applied exemptions 和即将过期项」「advisory summary」(`同文件:226-227`),但 `g3-closure-evidence.md:16-28` 的 Evidence identity 六条里一条都没有,Gate 表(:32-43)和 Golden matrix(:49-58)也没有对应列。对照 G0:`specs/roadmap/g0-closure-evidence.md:123` 有明确反作弊条款「不得通过删除失败测试、缩小 package filter、扩大持久化 allowlist 或把 blocking diagnostic 当作正向能力来取得绿色结果」,并在 :121 要求记录「未豁免失败 `0`」;G3 模板没有任何等价条款。

**影响**: 一次 G3 Passed 可以建立在大量 exemption 与被裁剪的 advisory cell 之上而在退出证据中完全不可见,审阅者看到的仍是全绿矩阵;这正是 G0 用一句话堵住、而 G3 由于新增 exemption 机制风险更高的场景。

**建议**: 在 Evidence identity 增加必填项:applied exemption 清单(id、scope、reason、expiresAt)、即将过期 exemption 数、被 budget 裁剪的 advisory cell 数与 reason 分布、unstable/retry attempt 数;并补一条 G0 同级的反作弊条款,明确禁止通过新增 exemption、下调 required→advisory、缩小 matrix profile、放宽 budget 或调整 baseline mask 取得绿色 Closure。

##### G3-H-CG-11 Adapter SPI 在 ADR 62 与实施文档之间是两套不兼容的类型:字段、输出类型、check 分类全部不同

- **位置**: `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:33-46 vs specs/implementation/g3-verification-adapters-product-ci.md:48-73`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `impl-mapping`

**详情**: ADR 62 冻结:`type VerificationAdapterDescriptor = Readonly<{ id; version; checkKinds: readonly VerificationCheckKind[]; surfaces; targets; capabilities; trustInputs }>`,adapter「输出 bounded `VerificationCheckReportCandidate`」。实施文档冻结的同名接口是 `{ id; family: VerificationCheckFamily; implementation: ImplementationIdentity; supportedCells: VerificationCapabilityPredicate; requiredControls; inputKinds; artifactKinds; trustCapabilities; budgets }`,`normalize()` 返回 `EvidenceCandidate`。除 `id` 外无一字段同名。check 分类同样分叉:ADR 57:86-96 定义 `VerificationCheckKind = 'diagnostics'|'build'|'unit'|'integration'|'e2e'|'visual'|'accessibility'|'performance'|'security'`,而 `g3-verification-plan-impact-policy.md:143-144` 写「初始 family:`diagnostics`、`build`、`unit`、`integration`、`behavior-e2e`、`visual`、`accessibility`、`performance`、`security`」——枚举名 kind vs family、成员 `e2e` vs `behavior-e2e`。

**影响**: adapter descriptor 是 planner capability preflight、registry snapshot digest、`verify:g3:adapter-matrix` conformance 与 Evidence `toolchain` identity 的输入。两套字段并存意味着 registry snapshot digest 无法确定,Policy rule 的 `check family` selector 也无法确定字面量。V6 一旦按实施文档落地,ADR 62 的 Accepted contract 就成了明知失效却仍被 README 索引为「已冻结」的文档,后续 G6 第三方 adapter 会继承错误基线。

**建议**: 以实施文档版本为准修订 ADR 62 的代码块(它包含 requiredControls/budgets/artifactKinds 等 planner 真正需要的字段),统一输出类型为 `EvidenceCandidate`,并在 ADR 57 与 ADR 62 之间统一 `VerificationCheckFamily` 一个名字、一份成员表(建议保留 `behavior-e2e` 以区别于 G2 的 unit/integration E2E 语义)。修订后在 `specs/decisions/README.md:211,216` 的摘要中注明字段基线来源。

##### G3-H-CG-12 Backend(Go) validator 在 ADR 与里程碑中被要求,却没有任何实施文档承担:三份 owner 文档都不列 apps/backend

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:35 与 specs/implementation/g3-behavior-scenario-authoring-and-composition.md:10 / g3-verification-plan-impact-policy.md:10 / g3-animation-route-composition-reduced-motion.md:10`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `impl-mapping`

**详情**: milestone V0 line 35 要求「current/wire/codec/migration、Backend/Workspace validation conformance」。ADR 侧同样要求:ADR 56「Workspace 与 Backend 需要新增 `behavior-scenario` typed document、`behavior` Command domain 和 validator」;ADR 57「Workspace 增加 `verification-policy` typed document 与 validator」;ADR 60 验收「typed ports/edges、planner、codec/backend validation和migration conformance完成」;ADR 61 验收「typed play/control/marker和Route lifecycle binding通过前后端codec/validator」。但对这四类 document 的 owner 实施文档做全文检索,`g3-behavior-scenario-authoring-and-composition.md`、`g3-verification-plan-impact-policy.md`、`g3-animation-route-composition-reduced-motion.md` 三份文档中 backend/Backend 零命中,Owner 行也不含 `apps/backend`;只有 `g3-nodegraph-typed-flow-debugger.md:33,237,282` 提到 backend validation。列出 `apps/backend` 为 owner 的只有 Evidence 文档(line 10,负责 Evidence store)与 adapters 文档(line 10,负责 run correlation)。

**影响**: 两个新 Workspace document kind 的 Go 侧 schema/validator/migration 是 Atomic Commit 能否接受 `core.behavior.*` / `core.verification.*` 写入的前提,却没有任何文档给出它的阶段、完成条件和测试范围。按现有 G2 惯例(`package.json:44-72` 中多个 verify:g2 脚本都以 `cd apps/backend && go test ./internal/modules/workspace` 收尾),这部分工作量不小且必须与前端 codec 同版本演进。现在它落在三份文档的缝隙里,`verify:g3:boundaries` 也没有对应的 go test 入口描述。

**建议**: 在 `g3-behavior-scenario-authoring-and-composition.md` 的 B0 与 `g3-verification-plan-impact-policy.md` 的 P1 中各补一条 Backend validator/migration 交付项并把 `apps/backend` 加入 Owner 行;Animation/NodeGraph 的 wire 演进同样在 A0/N0 中补 backend 侧条目。同时在 `g3-closure-evidence.md:34` 的 `verify:g3:boundaries` 行「必须证明」里加入「apps/backend workspace validator 前后端 parity」。

##### G3-H-CG-13 跨域 SourceTrace 在 execution 边界被 default 分支塌缩为 workspace 粒度,V2/V3/V7 的定位要求不可验收

- **位置**: `packages/prodivix-compiler/src/executableProject/workspaceExecutableProject.ts:89-110`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `stop-conditions`

**详情**: `executionTargetRef` 只显式映射 `workspace`/`workspace-document`/`code`/`code-artifact`/`route` 五个 domain,:107-108 的 `default: return { kind: 'workspace', workspaceId }` 把其余全部吞掉。实际被 compiler 发出的 domain 至少还有 `pir`、`nodegraph`、`animation`、`route-runtime`、`route-module`、`scaffold`、`export`、`domain-module`、`deployment`(可用 `git grep -o "domain: '[a-z-]*'" packages/prodivix-compiler/src` 枚举)。即 NodeGraph 节点、Animation 时间线、PIR 节点与 route runtime 的来源进入 Execution 层后一律退化成「整个 Workspace」。同时存在两套不兼容的 target ref 形状:`packages/diagnostics/src/diagnostic.types.ts:19-70` 是以 `kind` 判别的联合,`packages/prodivix-compiler/src/export/types.ts:82-86` 是扁平 `{domain,id,path?}`;`SourceSpan` 也不同(diagnostics :72-78 要求 `artifactId`,compiler :88-93 没有,桥接在 `workspaceExecutableProject.ts:121` 用 `trace.artifactId ?? trace.sourceRef.id` 补)。此外 `sourceSpan` 全仓只在 code artifact 路径产生,PIR/Route/NodeGraph/Animation 的 ExportSourceTrace 一律无 span。消费端 `apps/web/src/editor/features/execution/executionSourceTraceModel.ts:21-24` 又规定 `sourceTrace.length !== 1` 直接返回 undefined,而生成文件普遍携带多条 trace。

**影响**: V2 完成条件「Golden Scenario 同时跨越 Route、PIR、Data、NodeGraph、Animation,且每一步可定位到 SourceTrace」(`specs/implementation/g3-behavior-verification-closure.md:177`)、V2 的 debugger value projection/SourceTrace、V7 的「failed Closure 可导航到 Scenario step、domain source」在当前实现上无法验收:大多数跨域步骤要么落到 workspace 根,要么因多 trace 而完全没有 Source 链接。

**建议**: 进入 V2 前先做 SourceTrace 收敛:(1) 把 `executionTargetRef` 的 `default` 改为 fail-closed(抛错或产出显式 unmapped 诊断),并补齐 `pir`→`pir-node`、`nodegraph`→`nodegraph-node`、`animation`→`animation-timeline` 映射;(2) 删除 `export/types.ts:82-93` 的私有 `DiagnosticTargetRef`/`SourceSpan`,统一引用 `@prodivix/diagnostics`;(3) 为 PIR/Route/NodeGraph/Animation 补 `sourceSpan`,或明确把「无 span」写成既定契约并相应降级 V7 导航要求。

##### G3-H-CG-14 export planner 路径预留顺序让用户 code document 抢占 src/App.tsx,scaffold 硬编码 './App' 导入,且冲突只记 metadata 不发诊断

- **位置**: `packages/prodivix-compiler/src/export/planner.ts:623-625,696-700,826-847`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `stop-conditions`

**详情**: `plan()` 先在 :623-625 按 `program.modules` 顺序预留模块路径,之后才在 :696-700 预留 file contributions。`program.modules` 的拼装顺序由 `packages/prodivix-compiler/src/react/workspaceProject.ts:1267-1327` 决定:`code.contribution` 在第 2 位,承载 app entry 的 contribution 在最后一位。用户 TS/JS code document 在 `workspaceProject.ts:339-346` 被编成 `kind: 'workspace-module'`、`desiredPath: joinExportPath('src', normalizeExportCodeArtifactPath(document.path))`,而 `normalizeExportCodeArtifactPath`(`export/codeArtifactPlanner.ts:78-90`)会剥掉前缀 `code/` 或 `src/`——`/code/App.tsx` 直接映射成 `src/App.tsx` 并先预留。随后 `id: 'workspace-react-entry'`、`suggestedName: 'App'`、`kind: 'react-entry'` 的应用入口(`workspaceProject.ts:765-767`,`export/planner.ts:101` 使其目录为 `src`)撞车,被 `createUniqueExportPath` 改名为 `src/App-2.tsx`。而 scaffold 生成的 `src/main.tsx` 与 `src/App.test.tsx` 仍硬编码 `import App from './App'`(`export/presets/reactVite.ts:193,221`)。`reservePath`(:826-847)遇冲突只 push 一条 `pathRewrites`,不产生任何 `EXP-*` 诊断。

**影响**: 导出工程静默渲染用户任意 code 模块而非 Workspace 应用入口;若该模块无 default export 则 tsc 与 scaffold 自带的 `src/App.test.tsx`(断言 `typeof App === 'function'`)失败。因为无诊断,`blockingDiagnostics` 为空,项目生成仍返回 `ready`。这直接影响 V6 的 `export` surface 定义(`specs/implementation/g3-verification-adapters-product-ci.md:150`「从 exact ExportProgram 物化的 standalone app」)与 V8「Preview/Export/CI 使用同一 Scenario」。

**建议**: 把 preset scaffold 声明的保留路径(`src/main.tsx`、`src/App.tsx`、`src/App.test.tsx`、`index.html`、`package.json`)在 `plan()` 最开始就注入 `usedPaths` 并标为不可抢占,用户文档请求这些路径时产出 error 级 `EXP-*` 诊断。退一步:凡 `reason: 'conflict'` 的 `pathRewrites` 一律升级为 warning 级诊断,使 export Gate 至少可见。

##### G3-H-CG-15 新增 document kind 的内容校验分散在 TS 4 处 + Go 2 处平行 if-链，且对未覆盖的 kind 默认 fail-open

- **位置**: `packages/workspace/src/workspaceDocumentValidation.ts:157;packages/workspace/src/workspaceCodec.ts:302-307;packages/workspace/src/workspaceCommand.ts:1492-1509;apps/backend/internal/modules/workspace/store_helpers.go:404-407`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `v0-readiness`

**详情**: 只要把 'behavior-scenario' 加进 WORKSPACE_DOCUMENT_TYPES，四条独立的内容校验链就会立刻把它当成合法文档放行：`workspaceDocumentValidation.ts:157` 的 `if (documentType !== 'code') return true;` 直接返回 true；`workspaceCodec.ts` 的 else-if 链在 302-307 行以 `else if (type === 'code' && ...)` 结束，未匹配的 type 保留原始 `content` 不解码、不校验；`workspaceCommand.ts` 的 1353-1508 行 kind 断言链结束后于 1509 行 `return {` ok；Go 侧 `store_helpers.go:375-408` 的 `validateWorkspaceDocumentContent` 末尾 `return nil`，`patch.go:43-46` 落到 `validateGenericWorkspaceDocumentPatchPath`。这四处没有任何 exhaustive switch 或 `satisfies` 约束强制补齐。

**影响**: V0 完成条件 2「current model 不暴露数字版本，wire/codec/migration 明确 fail closed」（specs/implementation/g3-behavior-verification-closure.md:155）与当前默认行为相反。漏掉任一处，非法 BehaviorScenario/VerificationPolicy content 会通过 Command、codec 或 Atomic Commit 写入 Canonical Workspace，之后只能靠 V1 编译期报错发现，且已污染 revision 历史无法用 undo 清除。

**建议**: 在 V0 把 kind→content validator 提升为注册表：在 workspaceContractRegistry.ts 增加 `WORKSPACE_DOCUMENT_CONTENT_VALIDATORS satisfies Record<WorkspaceDocumentType, (content, ctx) => boolean>`，让 workspaceDocumentValidation / workspaceCodec / workspaceCommand 三处统一查表；未注册即编译失败。Go 侧同样把 store_helpers.go 与 patch.go 的分支改成 map 查找，并对未知 kind 返回错误而不是 nil。

##### G3-H-CG-16 Backend 有 4 处彼此独立的 domain/namespace/capability 硬编码列表，任一未更新都会让 core.behavior.* 在 Atomic Commit 处被拒

- **位置**: `apps/backend/internal/modules/workspace/operation_commit_types.go:380-386,448-450,455-479;apps/backend/internal/modules/workspace/operation_commit_apply.go:154-173;apps/backend/internal/modules/workspace/response.go:289-312;apps/backend/internal/modules/workspace/store_helpers.go:543-550`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `v0-readiness`

**详情**: （1）operation_commit_types.go:381-385 `switch command.DomainHint { case "pir", "workspace", "route", "nodegraph", "animation", "token", "code", "data", "resource": default: return commitValidation(... "domainHint must use a canonical registered domain")}`；（2）同文件 448-450 `if documentDomain != "pir" && ... != "resource" { return commitValidation(... "document-targeted commands require pir, nodegraph, animation, token, code, data, or resource domain")}`；（3）455-479 `commitNamespaceDomain` 的 `matchesCommitNamespace` switch；（4）operation_commit_apply.go:154-173 `workspaceDocumentCommandDomain` 对未知 kind 返回 ""，131-134 行随即 `if domain != expectedDomain` 报错；另有 response.go:289-312 `DefaultCapabilities()` 的静态 capability map 和 store_helpers.go:543-550 `isValidWorkspaceDocumentType`。TS 侧对应的只有 workspaceContractRegistry.ts 一处（domain 联合类型 + 前缀规则表），Go 完全是手抄副本。

**影响**: 这 6 处任意一处漏改，前端可以在本地成功 dispatch core.behavior Command 并写入 Outbox，但 Atomic Commit 会以不可重试的 400 永久失败，Outbox 条目卡死。由于失败点在 Backend 而非本地校验，Web 侧单测无法发现，只能靠端到端 commit 测试。

**建议**: V0 建立 TS→Go 的契约投影（复用 scripts/sync-nodegraph-wire-contract.mjs 模式：从 workspaceContractRegistry.ts 生成 apps/backend/internal/platform/workspacecontract/document_contract.generated.json，Go 侧读取该文件而非硬编码），并把校验脚本挂进 `lint` 与 `verify:g3:boundaries`；至少要为这 6 个位置写一条覆盖 behavior/verification 的 Go commit 集成测试。

##### G3-H-CG-17 verification-policy 被定义为「唯一 project-level document」，但 Workspace 内不存在任何按 kind 的基数（singleton）约束机制

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:38;packages/workspace/src/validateWorkspaceVfs.ts;packages/workspace/src/workspaceDocumentValidation.ts:166-300`
- **严重度**: High ｜ **类别**: contract-gap ｜ **分析维度**: `v0-readiness`

**详情**: ADR 57 第 38 行：「Workspace 新增唯一 project-level typed document `verification-policy`，由 `core.verification` Command namespace 管理」。但 `validateWorkspaceDocumentRecord` 只做单文档字段/内容校验，`validateWorkspaceVfs.ts` 只做 tree/path/revision 不变量；现有 11 种 kind 全部允许任意多份（design-tokens、data-source、asset 都是多实例）。Backend 侧 store_snapshot.go:66-100 的导入校验同样只做 id/path 唯一性，没有 per-type 基数检查。`core.verification.create-policy`（specs/implementation/g3-verification-plan-impact-policy.md:114）也无法在单命令内感知全局已有几份 policy。

**影响**: 没有约束机制时，import、并发 Atomic Commit、Workspace 复制或用户手动创建都可能产生第二份 verification-policy。之后 planner 面对两份 policy 无法确定 canonical 输入，plan digest 不再确定，直接破坏 V4「相同输入生成 byte-stable plan」。这是 V0 阶段就必须落地的不变量，拖到 V4 会需要数据修复。

**建议**: V0 在 validateWorkspaceVfs 增加 per-kind cardinality 不变量（新增 WKS_DOCUMENT_CARDINALITY_INVALID 类诊断码）并在 workspaceContractRegistry 的 policy 里显式声明 `cardinality: 'single' | 'many'`；Backend 在 store_snapshot.go 与 operation_commit 的 structural 命令路径做同样检查。如果 ADR 57 的「唯一」实际只是产品约定而非硬不变量，则应在 ADR 里改写措辞，不要让实现去猜。

#### 契约不一致(inconsistency)

##### G3-H-IC-01 reduced-motion cell 何时成为 required,三份文档给出三条互斥规则

- **位置**: `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:121 / specs/decisions/57.verification-plan-impact-and-policy.md:135 / specs/roadmap/g3-closure-evidence.md:51-56`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `adr-surface`

**详情**: ADR 62:121 的风险分层表第一行写「所有critical Scenario | Preview、Export、CI;primary engine;full/reduced(若有motion)」——条件是 scenario 含 motion。ADR 57:135 的最小 closure matrix 第 4 条写「impacted Animation/Route transition 至少覆盖 full-motion 与 reduced-motion」——条件是 impact 命中 Animation/Route。而 `specs/roadmap/g3-closure-evidence.md:51-56` 的六个 Chromium 行全部无条件写死 `full + reduced`,与 scenario 是否含 motion、impact 是否命中 Animation 无关。ADR 61:90 又写「Verification Plan对受影响animation/route强制full/reduced两个matrix cell」,与 ADR 57 一致但与 ADR 62 和 closure-evidence 不一致。

**影响**: planner 必须是确定性的(ADR 57:122),但三条规则会展开出不同的 required cell 集合:按 ADR 62,一个纯 CRUD 无动画的 critical scenario 不需要 reduced cell;按 closure-evidence,它需要。这直接决定 V8 Golden 的 required cell 数量与 `verify:g3:golden` 能否通过。实现期若按其中一条编码,另外两份 Accepted 文档立即变成失效契约,且这种失效不会被任何 Gate 检出(Gate 本身就是按其中一条写的)。

**建议**: 把 required-motion 规则的唯一 owner 定为 ADR 57(它拥有 Policy 与 matrix expansion),ADR 62 的分层表与 g3-closure-evidence 的矩阵改为引用 ADR 57 的规则并给出该 Golden 项目下的展开结果(而不是重新叙述规则)。若确实希望 Golden 无条件跑 full+reduced,应写成「Golden Policy profile 声明 motion 轴为 always-required」,而不是在三处各写一条判定条件。

##### G3-H-IC-02 reduced-motion policy 的优先级顺序在 ADR 59 / ADR 61 / 实施文档之间不一致,来源集合也不同

- **位置**: `specs/decisions/61.animation-route-composition-and-reduced-motion.md:89 / specs/implementation/g3-animation-route-composition-reduced-motion.md:144-145 / specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:86-87`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `adr-surface`

**详情**: ADR 61:89 写「system preference、project policy和verification override按稳定优先级解析;runtime只能收到resolved policy」——声明有稳定优先级,但没给顺序。实施文档 144 行给出「Policy resolution 优先级:用户/browser preference → Verification control profile → document variant」:第三个来源从 ADR 的「project policy」变成了「document variant」,箭头方向是「优先级递减」还是「解析管线顺序」也未说明。实施文档 145 行进一步写「Verification 不得覆盖真实产品默认,而是分别执行 full/reduced cell」。但 ADR 59:86-87 写「motion axis 至少支持 `full` 与 `reduced`。override 只存在于 verification context,并同时投影标准 `prefers-reduced-motion` 与 Prodivix Animation policy;应用看见的两者必须一致」——即在 verification run 内,control profile 就是要覆盖真实浏览器 preference 的。

**影响**: 若按实施文档 144 行把「用户/browser preference」排在最高优先级,则 CI runner 的实际 `prefers-reduced-motion`(通常是 no-preference)会压过 control profile,reduced cell 会静默地跑成 full,并且仍然报告 passed——这正是 g3-closure-evidence.md:65「random/time/network/storage/motion drift 触发 replay/control failure」要防止的失败模式,而且此处的漂移不会被检出。ADR 61 未给顺序意味着实现者只能采信实施文档,从而与 ADR 59 冲突。

**建议**: 在 ADR 59(runtime controls owner)冻结唯一的 motion resolution 顺序,明确 verification context 内 control profile 高于系统 preference,并要求 resolved motion mode 进入 Program digest 与 evidence compatibility key;ADR 61 与其实施文档改为引用。同时统一第三来源命名(project policy 还是 document variant),并把箭头改写成明确的「优先级由高到低」措辞。

##### G3-H-IC-03 BHV-2001/2002 与 SEM-2001/2003/2004/2005 语义重叠且 severity 冲突,BHV 的「不覆盖」列表漏掉了 SEM

- **位置**: `specs/diagnostics/behavior-diagnostic-codes.md:19-24, 54-69;specs/diagnostics/semantic-diagnostic-codes.md:15-45`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `diagnostics`

**详情**: `BHV-2001` 的 Trigger 是「semantic target missing、ambiguous、revision/provider snapshot 不匹配」,这三项与 `SEM-2001` 语义引用目标不存在、`SEM-2003` 语义引用解析结果不唯一、`SEM-2005` 语义索引快照已过期 一一对应;`BHV-2002` Trigger「target 存在,但不支持 action/observation kind、input type、runtime zone 或 required permission」与 `SEM-2004` 语义引用目标类型或能力不兼容 高度重叠。severity 直接冲突:SEM-2001~2005 全部是 `warning`,BHV-2001/2002 是 `error`。而 BHV §1 的「不覆盖」清单(第 19-24 行)只列了 RTE/DAT/NGR/ANI、VER、TST、progress event,**完全没有提 SEM**。CLAUDE.md 与 `specs/decisions/25.authoring-symbol-environment.md:254` 又规定「Workspace Semantic Index 只产出 resolution、scope、reference、type compatibility 和 stale snapshot 等 semantic diagnostics」,即这类失败本应由 Semantic Index 拥有。

**影响**: 同一个 "Scenario 目标解析不了" 的事实会有两条合法归属路径。实现时要么双发(Issues 里同一问题出现两条不同 severity 的诊断,`@prodivix/diagnostics` 的 fingerprint 去重无法合并跨 domain 的不同 code),要么各自实现一半导致漏发。`specs/roadmap/g3-closure-evidence.md:62` 的 negative evidence「missing/ambiguous semantic target 阻止 Scenario compile」无法确定该断言哪个 code。

**建议**: 在 behavior-diagnostic-codes.md §1「不覆盖」中补第 5 条,明确划界:通用 symbol/reference 解析失败由 SEM 拥有并保持 warning,BHV-2001/2002 只在 "Scenario compile/execute 因该解析失败而阻断" 时作为 error 发出并通过 `meta` 关联上游 SEM code;或反过来完全取消 BHV-20xx 段。同时对齐 severity 语义(warning=可继续编辑,error=阻断 compile)。

##### G3-H-IC-04 Required Golden matrix 表头维度远少于 plan cell identity,与「逐 cell 记录」的要求自相矛盾

- **位置**: `specs/roadmap/g3-closure-evidence.md:45-58`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `evidence-gate`

**详情**: `g3-closure-evidence.md:47` 要求「最终表必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict」,但 :49-58 的表头只有 `Surface | Target | Browser/runtime | Motion | Required families | 状态` 六列,唯一的结果列是「状态」,没有 requirement、Evidence id、trust、compatibility、verdict 五列中的任何一列。更根本的是 cell 定义不匹配:`specs/implementation/g3-verification-plan-impact-policy.md:146-154` 规定 matrix cell identity 为「check + scenario + surface + target + browser/runtime + environment profile + control profile + fixture set + baseline set + adapter/tool identity」,而表格缺 scenario、environment profile、control profile、fixture set、baseline set、adapter/tool 六个维度。milestone 的 required controlled matrix(`specs/roadmap/g3-behavior-verification-milestones.md:146-154`)另有 Data、Auth/Server、Recovery 三行维度,表格也完全没有承载。另外 :51-52 把 Preview 的 runtime 写成合并的「Chromium Browser/Remote」,而 ADR 58 的 trust class(`specs/decisions/58.verification-evidence-provenance-and-retention.md:84-85`)区分 `local-unattested`(Browser,「不满足默认 CI closure」)与 `remote-attested`,表格没有 trust 列意味着 Preview 行可以只靠本机 Browser 证据被标 Not Run→Passed。

**影响**: 填表时无论怎么填都无法同时满足 :47 的逐 cell 要求;Data/Auth/Recovery 维度与 control/fixture/baseline identity 在退出证据里彻底消失,审阅者无法判断 required cell 是否真的被覆盖;Preview 行还会用 local-unattested 证据冒充满足 trust 要求。

**建议**: 要么把表格列扩成 cell identity 的投影(至少补 Scenario、control profile digest、baseline set digest、adapter/tool identity、trust、compatibility、Evidence id、verdict,并把 Preview 拆成 Browser 与 Remote 两行),要么把 :47 改成「表格只记录 required-cell 分组聚合,逐 cell 明细由机器生成的 closure manifest 承载」并给出该 manifest 的路径与 digest 字段(见另一条发现)。两者必须二选一,不能保留当前的矛盾。

##### G3-H-IC-05 plan cell identity 使用 exact adapter/tool identity，与 check definition 的 “adapter kind/version range” 矛盾，导致 plan digest 与 Evidence 兼容性随依赖升级整体作废

- **位置**: `specs/implementation/g3-verification-plan-impact-policy.md:141,150,271`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `scale-risk`

**详情**: 第 141 行 canonical check definition 声明 “adapter kind/version range”；但第 148-150 行的 matrix cell identity 是 “check + scenario + surface + target + browser/runtime + environment profile + control profile、fixture set、baseline set、adapter/tool identity”，用的是 exact identity 而非 range；第 271 行要求 “跨进程/OS canonical fixture 得到相同 plan bytes”。同时 Evidence manifest 含 `toolchain: VerificationToolchainIdentity`（g3-verification-evidence-provenance-retention.md:74），comparison compatibility 又要校验 “tool/adapter schema … normalization version”（同文件 206-207 行）。

**影响**: 仓库中 `@playwright/test` 固定在 `^1.61.1`（package.json:125、packages/golden-conformance/package.json:36），browser 二进制随之滚动。若 tool version 进入 cell identity，任何一次 `pnpm update` 或 Playwright 浏览器更新都会改变全部 cell id → plan digest 变化 → 所有历史 Evidence 对新 plan 变成 incompatible/stale，Closure 立刻 incomplete。这会把 Evidence plane 变成一次性的，retention/comparison/supersession 全部失去意义。

**建议**: 在 V0 就明确 cell identity 里使用的是 **compatibility class**（adapter id + normalization version + 声明的 tool version range），把 exact tool version 只放进 Evidence 的 `toolchain` 供审计与 compatibility 判定，并在 Policy 中定义 “哪些 version 变化触发 re-verify”。同时统一 141 行与 150 行的措辞。

##### G3-H-IC-06 ADR/实施文档列出的 core.behavior.create-scenario / core.verification.create-policy 与内核「结构性写入走 core.workspace + domainHint: workspace」的既有约定冲突

- **位置**: `specs/implementation/g3-behavior-scenario-authoring-and-composition.md:122-134;specs/implementation/g3-verification-plan-impact-policy.md:112-125;packages/workspace/src/workspaceDocumentFactory.ts:359-370`
- **严重度**: High ｜ **类别**: inconsistency ｜ **分析维度**: `v0-readiness`

**详情**: 实施文档把 `core.behavior.create-scenario`、`core.verification.create-policy` 列为该 namespace 的初始 Command。但现有内核里，任何创建文档（写 `/docsById/*` 与 `/treeById/*`）的命令都由 `createWorkspaceDocumentAtPathCommand` 产出，固定为 `namespace: 'core.workspace'`、`type: 'document.create-at-path'`、`domainHint: 'workspace'`（workspaceDocumentFactory.ts:361-366）；Backend 也据此在 operation_commit_types.go:440-442 明确禁止 documentId + workspace/route hint 的组合，并在 448-450 要求 document-targeted 命令使用 document 域。domain 与 documentType 的绑定由 workspaceCommand.ts:1299-1312 `getWorkspaceDocumentDomain` 强制，create/rename/delete 这类无 documentId 的结构写入根本不走该路径。

**影响**: 若按文档字面实现 `core.behavior.create-scenario`（namespace 域 = behavior、无 target.documentId、patch 写 /docsById 与 /treeById），会同时踩到 Go 的 domainHint 白名单与 TS 的 domain 分派假设；若改为复用 core.workspace.document.create，则 ADR/实施文档列出的 Command 清单与实现不一致，V0 验收项「新增 core.behavior、core.verification Command namespace」变成不可判定。

**建议**: V0 开工前先在实施文档中区分两类命令：结构性生命周期（create/rename/delete/替换整篇文档）沿用 `core.workspace.document.*` + `domainHint: 'workspace'`，`core.behavior.*` / `core.verification.*` 只覆盖 document-targeted 的内容级 Command（insert-step、update-rule 等）；或明确决定扩展内核允许 domain namespace 发起结构写入，并同步修改 workspaceCommand.ts:833-843 与 operation_commit_types.go:380-386/440-450。

#### 依赖风险(dependency-risk)

##### G3-H-DR-01 `apps/cli` 是打印字符串的空壳,ADR 63 的 CLI/CI 契约等于从零建 CLI,里程碑未单独计量

- **位置**: `apps/cli/src/cli.ts:6-14 / apps/cli/src/commands/build.ts / specs/decisions/63.verification-product-surface-diagnostics-and-ci.md:98-115 / specs/roadmap/g3-behavior-verification-milestones.md:169-175`
- **严重度**: High ｜ **类别**: dependency-risk ｜ **分析维度**: `adr-surface`

**详情**: `apps/cli/src/cli.ts:6-14` 只注册 build/export 两个命令。`commands/build.ts` 与 `commands/export.ts` 各 6 行,action 体只有 `console.log('build 命令已连接')` / `console.log('export 命令已连接')`。`commands/deploy.ts` 是 0 字节且未被注册。`apps/cli/package.json` 没有 `test` script,唯一 runtime dependency 是 `commander`,不依赖任何 `@prodivix/*` 包——即没有 workspace 解析、没有配置加载、没有认证、没有输出契约、没有 exit code 约定。ADR 63:98-115 要求 `prodivix verify plan|run|upload|inspect` 四个子命令,并满足 non-interactive、machine-readable canonical JSON summary、stable exit code、exact digest 输入、OIDC 短期凭据、幂等 resume upload、upload 前本地 schema/digest/canary validation。实施文档 g3-verification-adapters-product-ci.md:242 进一步要求 exit code 区分 5 类。里程碑把这一切与整个产品表面合并成一个 V7(milestones:158-175)。

**影响**: V7 的 CLI 部分不是「给现有 CLI 加命令」,而是先要建 CLI 的基础层(workspace/snapshot 解析、backend client、凭据处理、NDJSON 事件流、退出码规范、测试基建),再实现 4 个 verify 命令。这一部分工作量与 V7 的产品表面部分相当,却没有独立的退出证据。milestones:175「Web/CLI/CI 生成相同 Plan/Closure digest」意味着 CLI 必须复用与 Web 完全相同的 planner 实现,而当前 CLI 与 `@prodivix/*` 之间没有任何依赖边,包边界(V0 的 boundary Gate)尚未设计到 CLI。

**建议**: 把 V7 拆成 V7a(产品表面)与 V7b(CLI/CI 契约),或在 V0 的 boundary Gate 中加入「`apps/cli` 依赖 `@prodivix/verification` 且不重复实现 planner」这一条。同时在 ADR 63 的「后果」里显式写出 CLI 基础层(配置/认证/输出/退出码/测试)是新建而非扩展,避免实现期把它当成小改动。

##### G3-H-DR-02 Durable Outbox / 三方合并 / 本地 codec 存在 5 条会永久停滞或静默丢数据的缺陷,而 V0 要在同一条链路上新增两类 Workspace document

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:299(H-SI-01)、:312(H-SI-02)、:338(H-SI-04)、:394(H-DET-01)、:1051(M-SI-05)、:928(M-SI-02)`
- **严重度**: High ｜ **类别**: dependency-risk ｜ **分析维度**: `blockers-from-audit`

**详情**: H-SI-01:null-operation 冲突解决不清除被阻塞条目,「此后每一个 authoring operation 都被排在 E 之后而永远发不出去」「不存在脱困路径」。H-SI-04:三方合并留下悬空 `activeDocumentId`,「零冲突的合并」被判 invalid,条目变 failed,「该 workspace 之后的每一个操作都被永久阻塞」,且「唯一的出路是 requeueFailedWorkspaceOutboxOperation,而它会重放同样的 base/local/remote 三元组并以相同方式失败」。H-SI-02:`WorkspaceOutboxEffects.tsx:157` 无三方合并地用陈旧会话 snapshot 覆盖实时 Workspace。H-DET-01:codec 往返后的 snapshot 与内存 snapshot 用 JSON.stringify 比较必然分歧,本地项目「彻底无法再打开」。M-SI-05 尤其关键:`STABLE_ID_ARRAY_FIELDS`(packages/workspace-sync/src/jsonValue.ts:45-56)当前含 bindings/edges/graphs/groups/keyframes/nodes/primitives/svgFilters/timelines/tracks,该分支「完全忽略元素顺序」,纯重排序在三方合并中被静默丢弃且不产生冲突。M-SI-02:导入路径不传 documentID 导致 data-source 交叉引用校验被跳过,可持久化一份让「此后的每一次提交都失败」的文档。

**影响**: V0 必须完成「新建 `behavior-scenario`、`verification-policy` Workspace document 与 `core.behavior`、`core.verification` Command namespace」和「current/wire/codec/migration、Backend/Workspace validation conformance」(milestones:33-35)。这两类新文档会完整继承上述 Outbox/合并/codec 语义。风险有三层:(1) 现存缺陷会在 Scenario/Policy 编辑时同样触发,并把 G3 的作者态可靠性问题误判为 G3 新代码 bug;(2) BehaviorScenario 的 `steps` 天然是**有序**的稳定 id 数组 —— 若 V0 把它加入 `STABLE_ID_ARRAY_FIELDS`,M-SI-05 会让 Scenario 步骤重排在合并中静默丢失,若不加入则失去按 id 合并能力,这是 V0 必须先决策的 contract 缺口;(3) M-SI-02 显示导入路径与提交路径的校验存在不对称,V0 新增 document kind 的 validation conformance 极易复制同一漏洞。

**建议**: P0(V0 之前完成 H-SI-01/H-SI-04/H-DET-01,V0 同期完成 M-SI-05 决策):先修三条会导致队列永久停滞的缺陷(它们与新增 document kind 无关,是既有基线故障),再在 V0 的 codec/merge conformance 设计中显式回答「Scenario steps 与 Policy rules 的顺序是否语义承载」;若承载,必须先按 M-SI-05 建议让 stable-id 数组的相等性考虑顺序并把顺序冲突升级为 structural conflict,再引入新 document kind。M-SI-02 的修法(把 documentID 变为必填参数而非可变参数)应作为 V0 validation conformance 的模板,防止新 document kind 重蹈覆辙。

##### G3-H-DR-03 deterministic replay 零基础且规范自认上限是 partially-controlled，V8 的“重复三次相同序列”有静默缩矩阵风险

- **位置**: `specs/implementation/g3-deterministic-replay-runtime-controls.md:61-62,214-215 vs specs/roadmap/g3-behavior-verification-milestones.md:97-98`
- **严重度**: High ｜ **类别**: dependency-risk ｜ **分析维度**: `scale-risk`

**详情**: replay 文档 61-62 行定义 preflight 输出 “`supported`、`emulated`、`partially-controlled`、`unsupported` 及 reason；required cell 不接受 silent partial control”；214-215 行进一步承认 “若浏览器能力只支持部分 virtual time，Policy 可选择 semantic-only cell；visual/performance required cell 必须使用具备所需 control 的 provider”。而 milestone:97-98 的 V3 golden slice 要求 “相同 Catalog conflict/retry Scenario 连续运行至少三次并在 Browser、Remote 与 CI-controlled environment 中产生相同 semantic sequence”。仓库中不存在任何 logical clock / scheduler / 网络 fixture 拦截 / storage 隔离 canary 基础设施（G2 的 runtime-core 增量 15,854 行不含虚拟时间）。

**影响**: 这是 G3 最长的技术长杆，也是唯一一个“做不出来就只能改矩阵”的项。真实浏览器对 virtual time 的控制能力有限（WAAPI/rAF/字体加载/合成线程不可虚拟化），最可能的结局是大部分 browser cell 落到 `partially-controlled`，然后 Policy 把它们改成 semantic-only，g3-closure-evidence.md:49-58 的 8 行 Golden matrix 里 visual/performance 两族被实质架空，而 Gate 表面仍然全绿。

**建议**: V0 结束前先做一次 spike：在 Chromium/Firefox/WebKit 上实测 clock、rAF、字体加载、IndexedDB/SW 清理、network deny 五项的可控程度，把结果写进 `g3-closure-evidence.md` 作为 capability baseline。用实测能力反推 Policy 的 required cell 集合，而不是先写死 8 行矩阵再发现做不到。

##### G3-H-DR-04 NodeGraph typed port 破坏性 migration 会对现存 null-handle edge 全量 fail closed，且没有作者态修复流程

- **位置**: `packages/nodegraph/src/nodeGraph.types.ts:34-40、apps/backend/internal/platform/nodegraphcontract/current_schema.generated.json:89-90 vs specs/implementation/g3-nodegraph-typed-flow-debugger.md:65-69,76-78,296`
- **严重度**: High ｜ **类别**: dependency-risk ｜ **分析维度**: `scale-risk`

**详情**: 当前 `NodeGraphEdge` 的 handle 是可选可空：`sourceHandle?: string | null; targetHandle?: string | null;`（nodeGraph.types.ts:37-39），后端 generated schema 同样允许 null（`"sourceHandle": { "type": ["string", "null"] }`，第 89-90 行）。ADR 60/实施文档要求改为强制端口引用 `source: NodeGraphPortReference; target: NodeGraphPortReference;`（第 66-69 行）。迁移规则是第 76-78 行 “旧 node-level edge 只能通过 descriptor-aware migration 唯一映射到 port，否则 migration fail closed 并生成 actionable diagnostic；alpha 阶段不长期保留双模型”，第 296 行 “migration 无法唯一映射旧 edge 时保留诊断并要求用户修复，不猜端口”。

**影响**: 任何 handle 为 null 的既有 edge 按定义就不是唯一可映射的 → 全部 fail closed。爆炸半径已核实覆盖：`packages/nodegraph`（codec/wire/executor/semantic provider 共 1,532 行 src）、`apps/backend/internal/modules/workspace/nodegraph_validator.go:53-54,133,142`、generated schema、以及 `apps/web/src/editor/features/development/reactflow/` 下 5 个文件（graphConnectionValidation.ts、nodeGraphConnectionActions.ts、nodeGraphDocumentProjection.ts、nodeGraphFlowNodes.ts、nodeGraphNodeActions.ts）。文档只描述 “产生诊断要求用户修复”，没有任何一处描述这个修复 UI/批量 Quick Fix 长什么样。

**建议**: 在 N0 阶段之前补一个 “pre-migration 端口补全” 作者态流程：先在旧模型上让用户/自动 descriptor 推断补齐 handle 并落 Workspace Transaction，再执行 typed port hard cut。同时把这个流程写进 milestone V2 的必须完成项，否则 V2 会卡在无法迁移的既有 graph 上。

#### 就绪度(readiness)

##### G3-H-RD-01 `apps/web` 关闭 strict(实测 81 条错误,含 11 条真实空安全),而 V7 要在该表面新建整套 Scenarios/Verification/Issues 产品面

- **位置**: `apps/web/tsconfig.json:5;specs/implementation/reviews/2026-07-26-static-review.md:424(H-BC-01)、:126-165(3.2 节实测)`
- **严重度**: High ｜ **类别**: readiness ｜ **分析维度**: `blockers-from-audit`

**详情**: 已实读确认 `apps/web/tsconfig.json:5` 字面为 `"strict": false`,并同时关闭 `noUnusedLocals`/`noUnusedParameters`,覆盖 `tsconfig.base.json:13` 的仓库级 `"strict": true`。审查报告 3.2 节实测开启 `--strict` 后有 81 条错误(TS7006 37 / TS2345 13 / TS2322 9 / TS7016 5 / 空安全 11)。`apps/web/tsconfig.app.json` 看似恢复严格但「没有任何东西引用它」且 include 路径解析到不存在的 `apps/web/apps/web/src`。没有补偿控制:「vitest 不做类型检查,apps/web/eslint.config.js 使用的是不带类型信息的 tseslint.configs.recommended」。值得注意的是 11 条空安全错误中有 3 条正是 `BlueprintProjectRunnerSurface.tsx(128/163/192) 'frameWindow' is possibly 'null' or 'undefined'` —— 与 H-C-07 的预览桥接指向同一段代码。

**影响**: V7 要求新建「Scenarios authoring/record/debug surface」「Verification Impact/Plan/Runs/Evidence/Compare/Closure surface」「Execution Center bottom panel 可拖拽、折叠、最大化、keyboard resize」「Issues 聚合 BHV/VER」(milestones:162-167),这是 G1 以来 apps/web 最大的一次新表面增量。在 strict:false 下开发意味着这批新代码的空安全与隐式 any 完全不受门禁约束,而 `.github/workflows/tests.yml` 的 `Type check web` 步骤会持续绿灯。更关键的是成本曲线:今天是 81 条错误 / 659 个文件,等 V7 落地后再开 strict,修复面会随新表面同比例膨胀,且 G3 产品面涉及 digest/trust/attestation 等 fail-closed 语义,空指针在这里的后果比现有编辑器表面更严重。

**建议**: P0(V0 期间完成,最迟不晚于 V7 启动):删除 `apps/web/tsconfig.json` 中三处覆盖并修掉 81 条错误(可先从 `strictNullChecks` 起步分阶段收紧),同时删除或修正孤立的 `tsconfig.app.json`/`tsconfig.node.json`。这条不阻塞 V0-V6 的领域实现,但必须在 V7 大规模写 UI 之前完成 —— 它是本清单中唯一「延后不会导致返工、但会线性放大工作量」的项目。

##### G3-H-RD-02 docs:diagnostics:check 的 domain 白名单硬编码 13 个域,BHV/VER 完全在检查之外——当前 EXIT=0 是漏报不是健康

- **位置**: `scripts/generate-diagnostic-docs.mjs:15-29, 199-217`
- **严重度**: High ｜ **类别**: readiness ｜ **分析维度**: `diagnostics`

**详情**: `domainOrder` 硬编码为 `['PIR','WKS','PLG','EDT','UX','COD','SEM','GEN','API','AI','RTE','NGR','ANI']`(第 15-29 行),`readDiagnostics()`(第 202 行)只遍历这个数组。我实际运行 `node scripts/generate-diagnostic-docs.mjs check`,结果为 `Checked 318 diagnostic pages.`、EXIT=0;`apps/docs/reference/diagnostics/` 下的页面前缀去重后只有 `ai ani api cod edt gen ngr pir plg rte sem ux wks` 13 个。也就是说 `specs/diagnostics/behavior-diagnostic-codes.md` 与 `verification-diagnostic-codes.md` 目前是**纯孤立 markdown**,既不生成文档页,也不参与任何一致性校验。这不是 G3 新引入的问题:`DAT`(代码中 3 个 distinct code)、`TST`(2)、`EXE`(18)、`AST`(24)、`SVR`(16)共 63 个在 `packages/`/`apps/` 中真实发射的错误码同样不在白名单内。README §5(specs/diagnostics/README.md:95-116)把这 21 份码表全部列为权威码表,但工具只认其中 13 份。

**影响**: G3 实现期间 BHV/VER 码表与代码可以任意分叉而 CI 全绿;`specs/roadmap/g3-closure-evidence.md:34` 的 `verify:g3:boundaries` 声称要证明 "codec/diagnostic hard cut",但当前仓库没有任何工具能对 BHV/VER 做这件事。同时 32 个 BHV/VER 码位不会出现在用户文档站,产品里 Issues 面板的 "Open docs" 会指向不存在的页面(见另一条 docsUrl 发现)。

**建议**: 在 V0 checklist(`specs/roadmap/g3-behavior-verification-milestones.md:36`)里把 "接入 `scripts/generate-diagnostic-docs.mjs` 的 domainOrder/domainInfo" 写成显式交付项,并把 `pnpm docs:diagnostics:check` 加进 `verify:g3:boundaries` 的 Gate 命令(参照 `specs/roadmap/g0-closure-evidence.md:35` 的既有先例)。同时建议把 domainOrder 从硬编码改为按 `specs/diagnostics/*.md` 目录发现 + 显式 opt-out,否则 BHV/VER 只是变成第 6、7 个孤岛。

##### G3-H-RD-03 「逐 cell 记录」在数量级上不可执行,且模板没有要求任何机器生成的 closure manifest 工件

- **位置**: `specs/roadmap/g3-closure-evidence.md:47`
- **严重度**: High ｜ **类别**: readiness ｜ **分析维度**: `evidence-gate`

**详情**: 按 `specs/implementation/g3-verification-plan-impact-policy.md:143-144` 的 9 个 family 与 :146-154 的 cell identity,再叠加 `g3-closure-evidence.md:49-58` 的 3 surface × 2 target × full/reduced motion,以及 V8(`specs/roadmap/g3-behavior-verification-milestones.md:177-192`)覆盖 12 条旅程所需的 Golden Scenario 集合,仅 behavior/visual/accessibility 三个 scenario-展开型 family 就是约 3 × 10 scenarios × 2 targets × 3 surfaces × 2 motion ≈ 360 个 Chromium cell,再加 Firefox/WebKit critical subset 与 diagnostics/build/unit/integration/performance/security,required cell 量级在数百到上千。而模板要求「逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict」= 数千个 Markdown 表格单元,并要在 Policy/baseline/adapter 每次变化后手工维护。同时 `verify:g3` 行(:43)要求证明「aggregate with no omitted required cell」,而 required cell 总数与已满足数这两个关键数字在模板里没有任何字段。

**影响**: 实施到 V8 时唯一现实的做法是手写一个缩略表并声称覆盖,退出证据反而比 G2 的做法更容易被稀释;「no omitted required cell」永远无法被外部核验。

**建议**: 模板改为两层:(1) Markdown 只保留当前 8 行的聚合状态,并新增必填字段 `required cell 总数 / satisfied / failed / blocked / unsupported / unstable / advisory trimmed`;(2) 强制附一份由 `pnpm run verify:g3:golden` 产出、随 commit 提交或作为 CI artifact 上传的 closure manifest(JSON),在文档中记录其路径、SHA-256 与 closure digest,逐 cell 明细由该文件承载。这与 G2 记录 rootless evidence artifact id + ZIP SHA-256(`specs/roadmap/g2-closure-evidence.md:352-354`)的做法一致。

##### G3-H-RD-04 V0 停止条件的五项前置依赖没有可执行判定入口,closure evidence 的 Gate manifest 也无对应行

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:39-42;specs/roadmap/g3-closure-evidence.md:30-43`
- **严重度**: High ｜ **类别**: readiness ｜ **分析维度**: `stop-conditions`

**详情**: 停止条件原文为「G2 exact snapshot、ExportProgram、SourceTrace、Browser/Remote provider 或 controlled Vue target 未稳定前,不进入 V2/V6/V8 产品 closure」,但全文没有定义「稳定」的判据、检查命令或证据格式。`g3-closure-evidence.md:30-43` 的 Required Gate manifest 只有 `verify:g3:boundaries` 起的 10 行,无一行对应这五项前置依赖;`specs/implementation/g3-behavior-verification-closure.md:50-53` 的「前置条件」同样只是散文陈述。相比之下 G2 的每个子 Gate 都有可重复命令与证据表。另外 `verify:g2:vue-target`(`package.json:54`)并未被 `verify:g2:local-closure`(`package.json:38,56`)引用,也不在任何 workflow 中（仅 `verify:g2:vue-product` 出现在 `.github/workflows/g2-data-closure.yml:137`）。

**影响**: V0 完成后,「能否进入 V2」完全依赖人工主观判断。本轮已在 SourceTrace 与 controlled Vue target 两项上找到确凿的未稳定证据,却没有任何机制会在实现推进时阻止 V2 启动——停止条件事实上不可执行。

**建议**: 在 `g3-closure-evidence.md` 的 Gate manifest 顶部增加一行 `verify:g3:prereq`(Not Run),并在 `package.json` 中定义它:聚合 (a) exact snapshot 身份一致性测试、(b) export planner 路径冲突 fail-closed 测试、(c) 跨域 SourceTrace 映射完整性测试、(d) Browser+Remote 共享 provider conformance、(e) 含 subscription 的 Vue 工程 `vue-tsc` Gate。把「进入 V2 前 `verify:g3:prereq` 必须 Passed」写进停止条件。

#### 顺序安排(sequencing)

##### G3-H-SQ-01 V0 是唯一允许的实施入口,却没有专属实施文档,且它声明的交付物被子文档排进了 V4/V5/V6

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:27-42 与 specs/implementation/g3-behavior-verification-closure.md:145-158`
- **严重度**: High ｜ **类别**: sequencing ｜ **分析维度**: `impl-mapping`

**详情**: 9 个里程碑对应 7 个子实施文档 + 1 份总编排,数量差来自 V0 与 V8 没有子文档(总编排 §V0 共 14 行、§V8 共 16 行)、以及 ADR 62+63 合并为一份 `g3-verification-adapters-product-ci.md`。V8 由总编排承担是合理的(它本来就是汇总),但 V0 不是:milestone line 31-37 要求 V0 交付两个包、两种 Workspace document、`core.behavior`/`core.verification` Command namespace、current/wire/codec/migration、Backend/Workspace validation conformance、BHV/VER diagnostic registry 与 boundary Gate。而真正拥有这些内容的子文档把它们排在了后面:`verification-policy` 的 Command 清单与 document 在 `g3-verification-plan-impact-policy.md:110-124` 定义、阶段归属是 P1(line 258-263),而总编排 line 189-197 把该文档整体映射到 V4;`@prodivix/verification` 应在 V0 拥有的「adapter SPI」在 `g3-verification-adapters-product-ci.md:280-286` 的阶段里(总编排映射到 V6);「Evidence/Closure contract」在 `g3-verification-evidence-provenance-retention.md:257-263` 的 E0(总编排映射到 V5)。只有 `@prodivix/behavior` 一侧的 B0(`g3-behavior-scenario-authoring-and-composition.md:224-230`)是真正的 V0 内容。

**影响**: V0 的完成判定无法执行:按 milestone,V0 结束时 `@prodivix/verification` 必须已拥有 Impact/Policy/Plan/adapter SPI/Evidence/Closure 六类 contract;按子文档,这六类里有四类要等到 V4-V6 才定义。实施者要么把 V0 做成一个空壳包(随后 V0 的 boundary/codec/migration conformance Gate 无内容可验),要么把 V4/V5/V6 的契约设计提前塞进 V0 而没有文档支撑。`verify:g3:boundaries` 的通过标准因此不可判定。

**建议**: 补一份 `specs/implementation/g3-owner-contract-hard-cut.md`(或在总编排 §V0 内扩写),逐条列出 V0 需要冻结到「类型骨架 + codec + 边界」级别的对象清单,并明确每个对象的完整语义留给哪个后续里程碑;同时在 `g3-verification-plan-impact-policy.md`、`g3-verification-evidence-provenance-retention.md`、`g3-verification-adapters-product-ci.md` 三份文档的阶段表里,把「类型/codec 骨架属于 V0」与「行为实现属于本文档阶段」分开标注。

##### G3-H-SQ-02 里程碑顺序把 V2 跨领域行为排在 V3 deterministic replay 之前,但 V2 的两份实施文档都依赖 V3 的 scheduler 与 control profile

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:60-81 vs specs/implementation/g3-deterministic-replay-runtime-controls.md:43-58,88-98`
- **严重度**: High ｜ **类别**: sequencing ｜ **分析维度**: `impl-mapping`

**详情**: `BehaviorControlProfile` 与 canonical scheduler 由 V3 文档定义(`g3-deterministic-replay-runtime-controls.md:43-58` 的接口、line 88-98 的 lane/barrier/并发语义、R0/R1 阶段 line 219-235)。但 V2 的两份文档在完成条件里直接依赖它们:`g3-nodegraph-typed-flow-debugger.md:141` 「timeout、retry 和 schedule 使用 shared deterministic scheduler」、line 249 N1 完成条件要求 deterministic Program/digest;`g3-animation-route-composition-reduced-motion.md:30` 范围内含「deterministic scheduler」、line 144 的 reduced-motion 解析优先级明确写「用户/browser preference → Verification control profile → document variant」。更早的耦合出现在 V1:`g3-behavior-scenario-authoring-and-composition.md:59` 的 `BehaviorScenario` current model 直接持有 `controlProfileRef?: BehaviorControlProfileRef`,line 171 的 compiler 输入含「control profile、fixture 与 baseline manifests」。同时 milestone V2 line 75 已要求交付「decorative/spatial/essential/continuous reduced-motion variant」,而 `prefers-reduced-motion` 的 render control 属于 R2(line 236-242,即 V3)。

**影响**: 按 V0→V1→V2→V3 的顺序推进,V1 冻结 Scenario wire codec 时必须先定义一个 V3 才规格化的 `BehaviorControlProfileRef`,V2 验收 reduced-motion variant 时必须先有 V3 的 motion control。结果是 V2 的完成条件在 V3 完成前无法真实通过,团队要么把 V3 的一部分偷偷提前(破坏里程碑状态的可信度),要么 V2 长期停在 In Progress。`BehaviorControlProfile` 的持久化归属也未定:`g3-deterministic-replay-runtime-controls.md:60` 称它是「Scenario/Policy 引用的 Workspace authoring input 或受控内置 preset」,但 V0 只创建 `behavior-scenario` 与 `verification-policy` 两种 document kind,没有第三种 document,也没有说明它是内嵌于 Scenario 还是独立 preset registry。

**建议**: 把 R0(control model/preset/digest/capability snapshot)与 `BehaviorControlProfile` 的持久化归属前移到 V0/V1,在 milestone V0 的「必须完成」里显式加一条;或者调换 milestone 顺序为 V0→V1→V3→V2。同时在 V0 清单中明确 `BehaviorControlProfile` 是 `behavior-scenario` 内嵌结构、独立 document kind 还是内置 preset 表——这个选择会改变 Workspace document kind 的数量与 codec。

##### G3-H-SQ-03 V2 对 V3 的 deterministic scheduler 存在反向依赖，milestone 顺序倒置

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:60-81 vs specs/implementation/g3-deterministic-replay-runtime-controls.md:228-234`
- **严重度**: High ｜ **类别**: sequencing ｜ **分析维度**: `scale-risk`

**详情**: roadmap 把 V2 Cross-domain behavior（NodeGraph + Animation/Route）排在 V3 Deterministic replay 之前。但 g3-nodegraph-typed-flow-debugger.md:140 明确要求 “async wait 节点等待 typed observation；timeout、retry 和 schedule 使用 shared deterministic scheduler”，g3-animation-route-composition-reduced-motion.md:30 把 “pause/resume/seek/cancel、generation/effect lease 与 deterministic scheduler” 列入范围，而这个 scheduler 由 replay 文档的 R1 阶段交付（第 228-234 行 “### R1：Scheduler、wait 与 isolation — canonical lane/task/barrier”）。另外 milestone:80-81 的 V2 golden slice 要求 “Route detail transition 包含 full/reduced animation”，reduced motion 的 render control 属于 R2（replay 文档第 236-242 行）。经核实 `git grep -l "LogicalClock|ClockPort|virtualTime|deterministicClock"` 在 packages/apps 中只命中一个无关测试文件，即 scheduler 目前完全不存在。

**影响**: 按现顺序做 V2，NodeGraph 的 parallel/join/retry/timeout 和 Animation 的 settle/marker 只能先接一套临时时序实现，V3 落地后 `NodeGraphProgram`/`CompositionProgram` 的 digest 与 trace 语义全部改变，V2 的所有 conformance 测试与 golden slice 需重写。

**建议**: 把 V3 拆成 V3a（R0 control model + R1 scheduler/lane/barrier/condition wait，前置到 V0/V1）和 V3b（R2-R4 browser/network/storage/render controls + ReplayRecord + divergence，保留在 V2 之后）。V2 只依赖 V3a。

##### G3-H-SQ-04 Postgres doc_type CHECK 约束位于已应用的 migration version 1 内，直接改字面量对存量库无效

- **位置**: `apps/backend/internal/platform/database/database.go:136,142,588-591`
- **严重度**: High ｜ **类别**: sequencing ｜ **分析维度**: `v0-readiness`

**详情**: 两处 doc_type 白名单 `CHECK (doc_type IN ('pir-page', ..., 'project-config'))` 都写在 `migrations := []migration{{version: 1, name: "baseline"` 的 statements 里（database.go:52-53）。RunMigrations 在 588-591 行先查 `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`，`if applied { continue }`。当前最大版本是 13（database.go:547）。

**影响**: 实施者最自然的动作是在 136/142 行的两个字符串里追加 'behavior-scenario', 'verification-policy'。新建数据库正常，但所有已存在 schema_migrations version=1 记录的环境（含 CI 复用库、开发者本地库、生产库）不会重跑该语句，插入新 kind 时会以 constraint violation 失败。这类失败只在部署后出现，不会被 go test 或 verify:g3:boundaries 捕获。

**建议**: 新增 `version: 14` 的 migration，statements 只包含 `ALTER TABLE workspace_documents DROP CONSTRAINT IF EXISTS workspace_documents_type_check, ADD CONSTRAINT ... IN (...11 项 + 2 项新 kind)`；同时保持 136/142 行同步（新库正确），并在 apps/backend/internal/platform/database/database_test.go 追加对 version 14 的 `INSERT INTO schema_migrations` 断言（现有断言覆盖 2-13）。

#### 失败关闭语义(fail-closed-semantics)

##### G3-H-FC-01 ADR 59 允许把失控的 clock/random 访问「降级为 non-deterministic advisory evidence」,与 ADR 57 的 required 不可降级规则直接冲突

- **位置**: `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:50-51 vs specs/decisions/57.verification-plan-impact-and-policy.md:98-99,128`
- **严重度**: High ｜ **类别**: fail-closed-semantics ｜ **分析维度**: `adr-core`

**详情**: ADR 59:50-51:「无法控制的 direct clock/random access 形成 diagnostic 或降低为 non-deterministic advisory evidence,不能满足 required deterministic closure」。这里的「或」把选择权留给了运行期,而 ADR 57:98-99 规定 required check 的 unsupported/blocked 都不能满足 closure、57:128「不能任意截断最后若干 cell,也不能偷偷降级 required matrix」,诊断规范 `BHV-4005`(behavior-diagnostic-codes.md:132)也写明「unsupported/partial control 不能生成可信 pass」。impl 59:60-62 进一步引入 `supported`/`emulated`/`partially-controlled`/`unsupported` 四态,只说「required cell 不接受 silent partial control」——「silent」这个限定词等价于承认非静默的 partial control 可被接受,但没有说由谁、依据什么规则接受,`emulated` 与 `partially-controlled` 也没有映射到 ADR 57 的任何 cell status。

**影响**: 这是整份 G3 契约里最容易被实现成 fail-open 的一处:adapter 只要发一条 warning 诊断,就可以把一个失控的 required cell 变成 advisory,Closure 里该 cell 消失或不再阻断,而所有文档都还宣称 fail closed。

**建议**: 删除 ADR 59:50-51 的「或」分支:required cell 上任何未受控 clock/random/network 访问一律 blocked 并出 `BHV-4005`;是否允许 semantic-only(降级 control 要求)必须是 VerificationPolicy 里的显式声明(impl 59:215-216 已有此思路),不能由 provider 或 runner 在运行期决定。同时把 `emulated`/`partially-controlled` 明确映射到 ADR 57 的 cell status 表。

### 3.6 Medium(38 条)

#### 契约缺口(contract-gap)

##### G3-M-CG-01 Closure 求值时刻没有被定义为显式输入,与「Closure 可确定性重算」的验收标准矛盾

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:43-44,161-165 与 specs/implementation/g3-verification-plan-impact-policy.md:221,310`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `adr-core`

**详情**: ADR 57:43-44 对 planner 给出了非常具体的确定性规则:「输入包含显式 `policyEvaluationInstant`,用于判断 exemption/freshness,planner 禁止读取 ambient current time」。但同一份 ADR 在 57:161-165 描述 Closure 时,只说它绑定 revision/plan digest/evidence digests,完全没有为 Closure evaluator 规定时间输入——而 Closure 必须判断 evidence freshness(57:162「current」)、retention 是否已过期、exemption 是否已过期(57:151「过期、target drift 或 policy 不允许时 fail closed」)。impl 57:221 才补了一句 Closure 输入含「evaluation time/retention view」,于是系统里出现了两个互不相关的时间输入,且没有定义 plan 时刻与 closure 时刻不一致时以哪个为准。

**影响**: impl 57:310 的验收标准「Closure 只接受满足 trust、freshness、compatibility 的 Evidence,并可确定性重算」在契约层不可达:同一 plan + 同一 Evidence 集合在两个时刻会得到不同 verdict,却没有把时刻记进 closure digest,审计时无法复现结论。一个在 plan 时刻有效、在 closure 时刻已过期的 exemption 该 fail closed 还是继续生效,也无从裁决。

**建议**: 在 ADR 57 的 Closure 一节按 planner 同样的写法规定 `closureEvaluationInstant` 为显式、被记录的输入,进入 closure digest;并写明 exemption 过期以 closure 时刻为准(fail closed 方向),plan 时刻只用于 matrix 展开。

##### G3-M-CG-02 React 与 Vue target 发出不同的语义身份属性,跨 target 共享 Scenario target 缺少落地契约

- **位置**: `packages/prodivix-compiler/src/react/controlledReactJsx.ts:14,16 / packages/prodivix-compiler/src/vue/workspaceProject.ts / specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:120-123 / specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:158`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `adr-surface`

**详情**: React target 通过 `controlledReactJsx.ts:14,16` 强制每个受控 JSX 元素带 `data-prodivix-node-id` 与 `data-prodivix-slot-member-id`(498 行「Each controlled JSX element requires data-prodivix-node-id」)。Vue target 走的是另一条路:`packages/prodivix-compiler/src/vue/workspaceProject.ts` 发 `data-testid`,`packages/golden-conformance/src/goldenG2VueTarget.browser.test.ts` 有 39 处 `getByTestId`,`goldenG2VueCatalog.browser.test.ts` 有 15 处。ADR 56:120-123 规定可持久化 target 只能是 `DiagnosticTargetRef`、Semantic Index symbol、Route/Component public contract/accessible role-name,或「编译器生成的 opaque verification target id」。ADR 62:158 要求「target adapter只负责projection;Scenario identity和semantic assertions共享」。但没有任何文档定义这个 opaque verification target id 的属性名、生成规则、以及两个 target 输出一致性的 Gate。

**影响**: V1「React/Vite 与 Vue/Vite semantic target conformance」(milestones:53)没有可实现的具体契约:实现者要么把 `data-prodivix-node-id` 推广到 Vue(需要改 Vue codegen 且与现有 39 处 testid 断言并存),要么新建第三套 id。同时 ADR 62:65「禁止把CSS/XPath保存回Scenario」在 testid 上语义模糊——testid 不是 CSS/XPath,但也不是 accessible role/name,现有 Golden 断言若被直接复用为 Scenario target,会绕过 ADR 56 的 target 白名单。

**建议**: 在 ADR 56 或 60 补一节「compiler verification target id」:属性名、由哪一层生成(PIR node id 还是独立 opaque id)、SourceTrace manifest 的反解规则、以及 React/Vue 必须发出同一 id 的 conformance 断言。明确既有 `data-testid` 只是 Golden fixture 的内部约定,不构成 Scenario 可持久化 target。

##### G3-M-CG-03 V2 Animation/Route 的两个领域前置缺陷:反向缓动语义偏离 WAAPI、Animation 预览无插件 registry

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:675(M-C-19)、:545(M-C-09);packages/animation/src/animationEvaluation.ts:197、apps/web/src/editor/features/animation/panels/AnimationEditorPreviewCanvas.tsx:232`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `blockers-from-audit`

**详情**: M-C-19:`resolveTimelineCursorMs` 先缓动后镜像(`cursor = D * (1 - f(p))`),而 CSS/WAAPI 是先定向后缓动(`cursor = D * f(1 - p)`),「两者只在 f 为线性或完全点对称时才一致;对于非对称的 CSS 预设 ease、ease-in、ease-out 以及任意 cubic-bezier(...),除端点外处处不同」,示例偏差约 28% 时间轴长度;而「整个 timeline 模型是 CSS 的直接映射」,specs/decisions/43 规定播放必须执行 canonical 方向加 timeline 缓动。M-C-09:Animation 预览使用不带扩展 registry 的 `pirWebRendererHost` 单例,单个未知元素类型就让「整份投影」阻塞,「页面没有任何部分被渲染,因此动画根本无法预览」,而 Blueprint 画布走的是插件感知 host。

**影响**: V2 必须完成「typed play/pause/resume/seek/cancel 与 marker observation」「decorative/spatial/essential/continuous reduced-motion variant」「visual/a11y stable observation 与 React/Vue target conformance」(milestones:72-76);V6 与 g3-closure-evidence.md:51-58 每一个 cell 都要求 full + reduced 两种 motion。M-C-19 的后果是:V2/V6 一旦为 Animation 建立 visual baseline,这条与 CSS 语义不一致的曲线会被固化进 baseline,后续修正会导致所有 visual evidence 需要重新 promote(而 V5 的 Evidence 是 immutable/superseding,重建成本高)。M-C-09 则直接使 Animation marker observation 的作者态入口对任何含官方插件组件的页面不可用 —— 而 V8 Golden 的 Catalog 页面几乎必然含插件组件。

**建议**: P2(V2 之前完成,均为小改动):按 M-C-19 建议改为「先反转,再缓动」,并把该语义作为 V2 的 conformance 断言之一(现有属性测试 animation.property.test.ts:180 只覆盖不带 timeline 缓动的方向组合,需扩展);按 M-C-09 建议让 Animation 预览用 `createPirWebRendererHost(createRendererProjectionRegistry(useWebExtensionRegistrySnapshot()))` 构建自己的 host。两者都必须先于任何 Animation visual baseline 的建立,否则会被 immutable Evidence 固化。

##### G3-M-CG-04 `ProdivixDiagnosticDomain` 与运行时白名单缺 behavior/verification,且 Web 端对未知 domain 静默降级为 'backend'

- **位置**: `packages/diagnostics/src/diagnostic.types.ts:3-17;packages/diagnostics/src/isDiagnostic.ts:14-29;apps/web/src/infra/api/apiClient.ts:71-74`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: `ProdivixDiagnosticDomain` 当前是 14 项,缺 `behavior` 与 `verification`;`isDiagnostic.ts:14-29` 的运行时集合 `PRODIVIX_DIAGNOSTIC_DOMAINS` 同样缺这两项,`isDiagnostic()`(第 44-52 行)会对携带这两个 domain 的对象返回 `false`。而 `specs/diagnostics/README.md:44-60` 已经把 `behavior` 和 `verification` 写进了 `ProdivixDiagnostic.domain` 的类型定义——规范先行于代码但没有任何检查能发现这个漂移。更危险的是 `apps/web/src/infra/api/apiClient.ts:71-74`:`const normalizeDomain = (domain) => domain && isDiagnosticDomain(domain) ? domain : 'backend';`——未知 domain 被**静默改写**成 `'backend'`,不抛错、不告警。

**影响**: 后端 Evidence service 按 ADR 63 返回 `domain: 'verification'` + `VER-5002`(fatal,Evidence 中检测到 Secret)时,Web 会把它标成 `backend` 域的诊断,Issues 的 verification 过滤器直接漏掉这条最高危诊断。这是 fail-open,与 VER-5002 developer notes「整个 trusted promotion fail closed」的安全姿态相反。

**建议**: V0 同批次修改三处:`ProdivixDiagnosticDomain`、`PRODIVIX_DIAGNOSTIC_DOMAINS`、并把 `normalizeDomain` 的静默降级改为保留原值 + 记一条 `API-9001` 级别的协议告警(或至少在 dev 下抛出)。参照 `specs/implementation/ux-diagnostics-implementation-plan.md:37-38` 的既有 UX 接入清单写法。

##### G3-M-CG-05 ADR 56 用「DiagnosticTargetRef 可表达」定义 Scenario 可持久化 target,但该 union 含 runtime-dom DOM 兜底,与自身的禁止 CSS/XPath 条款矛盾

- **位置**: `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:116-123;packages/diagnostics/src/diagnostic.types.ts:64;specs/decisions/26.ux-diagnostics.md:201`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: ADR 56 第 116-117 行:「Scenario 禁止保存 CSS/XPath、DOM 序号、React component instance、编辑器 store path 或供应商 locator」,紧接着第 120 行把第一类可持久化 target 定义为「`DiagnosticTargetRef` 可表达的稳定领域目标」。但 `DiagnosticTargetRef` 的第 64 行就是 `| { kind: 'runtime-dom'; routeId?: string; stablePath: string }`,而 ADR 26 第 201 行明确它的用途是「只在 materialized DOM 中出现且无法反向映射时,使用 `runtime-dom` 并保留可复现 snapshot」——即它就是 DOM 路径兜底。`BHV-2001` developer notes(behavior-diagnostic-codes.md:60)进一步写「禁止 fallback 到 CSS/XPath」。

**影响**: 按字面读 ADR 56,`runtime-dom` 是合法的 Scenario 持久化 target,等于把明令禁止的 DOM 定位从后门放回来。`specs/roadmap/g3-closure-evidence.md:62` 的 negative evidence「无 selector fallback」在契约层就不成立,实现者可以合规地做出不合意图的东西。

**建议**: 在 ADR 56 第 120 行显式排除 `runtime-dom`(以及任何未来的 DOM 兜底 kind),或改为正列举允许的 kind 集合而不是引用整个 union;并在 `behavior-scenario` document 的 codec 层加 hard cut 拒绝 `runtime-dom` target,让它成为可测的 negative evidence 而不只是文字约定。

##### G3-M-CG-06 BHV-9001 / VER-9001 的 Stage 值 `runtime-selected` 不是各自 §2 声明的 stage union 成员

- **位置**: `specs/diagnostics/behavior-diagnostic-codes.md:28-31, 164;specs/diagnostics/verification-diagnostic-codes.md:25-35, 206`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: BHV §2 声明 `type BehaviorDiagnosticStage = 'validate' | 'resolve' | 'compile' | 'execute' | 'replay' | 'record';`,VER §2 声明 8 个成员的 `VerificationDiagnosticStage`。但 `BHV-9001`(第 164 行)与 `VER-9001`(第 206 行)的字段都写成 `- Stage: runtime-selected`——这个值不属于任一 union,而且是全仓 21 份码表中唯一出现的 stage 值(我逐文件抽取了所有 `- Stage:` 值确认)。其他域的兜底码都落在自己的枚举内,例如 `TST-90xx` 标 `execute`/`report`(test-diagnostic-codes.md:38)、`DAT-90xx` 标 `execute`/`adapt`(data-diagnostic-codes.md 分段表)。

**影响**: 如果按 §2 的 TS union 实现 `DiagnosticDefinition.stage`,这两个兜底码位无法赋值,实现者只能扩 union 或退回 `stage: string`(`DiagnosticDefinition.stage` 目前确实是 `string`,diagnosticShared.ts:30),后者让 §2 的类型声明失去约束力。文档生成器会把 `阶段 | \`runtime-selected\`` 原样渲染到用户页面,是一个用户看不懂的内部词。

**建议**: 二选一并写进码表:(a) 给两个 union 加 `'unknown'` 成员,把 BHV-9001/VER-9001 的 Stage 改为 `unknown`(与生成器 `parseStandardSpec` 的默认值 `'unknown'` 一致,scripts/generate-diagnostic-docs.mjs:160);(b) 把 stage 定义成运行时可选的 `BehaviorDiagnosticStage`,并在 §2 明说兜底码 stage 由发射点决定。

##### G3-M-CG-07 全仓只有 PLG 有 spec↔code 漂移校验,V0 要求的「BHV-_/VER-_ registry」既没定义形态也没有对应 Gate

- **位置**: `scripts/generate-diagnostic-docs.mjs:219-247;specs/roadmap/g3-behavior-verification-milestones.md:36`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: `validatePluginDiagnosticCoverage` 是唯一的码表-代码一致性校验,且完全硬编码:源路径写死 `packages/plugin-contracts/src/diagnostics.ts`,正则写死 `/'(?<code>PLG-\d{4})'/g`,只在 `readDiagnostics()`(第 214 行)里对 PLG 调用一次。UX 虽然有真正的代码 registry(`packages/diagnostics/src/catalogs/uxDiagnosticRegistry.ts`,通过 ADR 34:112 描述的 `@prodivix/diagnostics/ux` opt-in subpath 暴露)也没有任何漂移校验。因此仓库里存在两种互不兼容的 "registry" 形态:PLG 的字符串常量式 vs UX 的 `createDefinition` catalog 式。V0 checklist 第 36 行只写「`behavior`/`verification` diagnostic domain、target 和 `BHV-*`/`VER-*` registry」,没有指定用哪种。

**影响**: 实现者会随意选一种,而且无论选哪种都没有 Gate 能防止 32 个 BHV/VER 码位与代码分叉。README §6 第 7 条「码位文档先于或随实现一起提交,不能在实现后补猜」在 BHV/VER 上是纯人工纪律。

**建议**: 在 V0 明确 BHV/VER 采用 `createDefinition` catalog 形态(与 UX 一致,因为 BHV/VER 需要 presentation template 和 action),并把 `validatePluginDiagnosticCoverage` 泛化成按 domain 配置源文件 + 前缀的通用漂移校验,至少覆盖 PLG/UX/BHV/VER 四个有代码 registry 的域。

##### G3-M-CG-08 12 条 negative evidence 没有绑定 BHV/VER code 与产出 Gate,其中 3 条目前无任何码位或命名检查

- **位置**: `specs/roadmap/g3-closure-evidence.md:60-73`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: :62-73 的 12 条 negative evidence 全部是散文式复选框,既没有列出必须命中的 diagnostic code,也没有列出由哪个 `verify:g3:*` Gate 产出。仓库已有把诊断码做成机械化清单的先例(`pnpm run docs:diagnostics:check` / `specs/diagnostics/README.md`),且 G3 码表已经写好:`specs/diagnostics/verification-diagnostic-codes.md:49-202` 定义 VER-1001/1002/2001/2002/3001-3004/4001/4002/5001-5005/6001/6002/9001,`specs/diagnostics/behavior-diagnostic-codes.md:44-161` 定义 BHV-1001/2001/2002/3001/3002/4001-4006/5001/5002/9001。逐条比对后,以下三条没有任何对应码位或命名检查::66「mutation conflict/retry/cancel/worker loss 保持 attempt/generation fencing」、:71「failed → retry passed 保留全部 attempts，并按 Policy 标 unstable/failed/pass」、:73「production bundle 不包含 verification-only probe、fixture 或 credential」(ADR 62 `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:70` 只写「production artifact必须通过hard-cut检查确认未包含probe control endpoint」,未给检查名)。

**影响**: 12 条负向证据只能靠人工声明「已验证」,与 G0 把每项能力对应到具体测试文件的做法相比无法核验;三条无码位的项目在实现时极可能被静默跳过。

**建议**: 给 negative evidence 表加两列「产出 Gate」与「必须命中的 code」,例如 :62→BHV-2001/BHV-3001、:63→VER-1002、:64→VER-3002/3003/3004、:65→BHV-4003/BHV-4005、:68→VER-5002/5005、:69→VER-5003、:70→VER-5004、:72→VER-6001/6002;并为 :66、:71、:73 三条补码位或命名检查(建议新增 `check:verification-probe-hard-cut`,与 `check:editor-hard-cut` 同形)。

##### G3-M-CG-09 「禁止记录 Secret/OIDC assertion/credential/cookie」只有文字约束,仓库无任何 secret 扫描;且「raw artifact locator」禁令与 G2 已验证的记录方式冲突

- **位置**: `specs/roadmap/g3-closure-evidence.md:28`
- **严重度**: Medium ｜ **类别**: contract-gap ｜ **分析维度**: `evidence-gate`

**详情**: `:28` 「禁止记录 Secret、OIDC assertion、credential、cookie、生产 payload、raw artifact locator 或未清洗工具输出」是纯文字约束。Evidence plane 内部确实有机械化设计(`g3-closure-evidence.md:39` 的 `verify:g3:evidence` 承诺 Secret hard cut,`specs/implementation/g3-verification-evidence-provenance-retention.md:239-245` 定义 canary/entropy/结构化 redaction,VER-5002 是对应码位),但**这份 Markdown 本身、CI job summary 与 :75-87 允许附上的产品截图/视频**没有任何扫描。仓库现状核实:`.github/workflows/security.yml` 只有 Dependency Audit 与 CodeQL 两个 job,没有 gitleaks/trufflehog 类 secret 扫描;`package.json` 的 `docs:*` 只有 `docs:diagnostics` / `docs:diagnostics:check`。另一方面,「raw artifact locator」禁令与 G2 的既有做法直接冲突:`specs/roadmap/g2-closure-evidence.md:352-354`、`:400-403`、`:462-464` 都记录了 GitHub artifact id 与 ZIP SHA-256,而那正是 G2 evidence 可核验性的关键。

**影响**: 这条禁令目前只能靠写文档的人自律;同时因为「raw artifact locator」没有定义边界,要么导致过度删减(连 artifact id + digest 都不敢写,退出证据失去可核验锚点),要么导致实际写入签名 URL 而无人拦截。

**建议**: (1) 新增 `docs:g3-evidence:check` 脚本(与 `docs:diagnostics:check` 同形),对本文件与 CI summary 做 canary/模式扫描(`ghs_`/`gho_`/`AKIA`/`eyJ` JWT 前缀/`Authorization:`/`Cookie:`/`-----BEGIN`),同时校验「Passed 行必须带 commit SHA + run URL + digest」「Passed 状态下不得残留 Not Run」,并把它挂进 `verify:g3`;(2) 把 :28 的「raw artifact locator」明确为「object-store key、签名 URL、内部 locator」,并显式允许记录 CI artifact id + 内容 digest;(3) 对 :75-87 允许附的截图/视频补一条 redaction 要求。

#### 契约不一致(inconsistency)

##### G3-M-IC-01 `VerificationPlanCell` 类型缺少 fixture/baseline/environment/adapter 维度,与 cell identity 定义和 Evidence 比较 key 不一致

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:107-116 vs specs/implementation/g3-verification-plan-impact-policy.md:148-154 与 specs/decisions/58.verification-evidence-provenance-and-retention.md:105`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `adr-core`

**详情**: ADR 57:107-116 冻结的 `VerificationPlanCell` 只有 `id`、`scenarioId?`、`targetId`、`surface`、`browserEngine?`、`controlsDigest`、`checkIds`。impl 57:148-152 定义的 cell identity 是「check + scenario + surface + target + browser/runtime + environment profile + control profile + fixture set + baseline set + adapter/tool identity」,多出四个维度。ADR 58:105 的比较 key「至少包含 Scenario/check stable id、matrix cell、target、control profile、baseline compatibility、tool major/adapter schema」也依赖 baseline 与 adapter 维度,ADR 62:34-42 的 `VerificationAdapterDescriptor` 带 `version`。此外 impl 57:153-154 特别强调「若某维度不适用,使用 canonical `none` 或不纳入该 family 的 identity,不能由 adapter 自行省略并产生不同 digest」,而 ADR 版本的 `browserEngine?`、`scenarioId?` 用 optional 表达缺省,正是它警告的那种写法。

**影响**: cell id 的派生规则是整条 digest 链的地基(cell → evidence 唯一键 → plan digest → closure digest)。两份定义并存,实现时按 ADR 写就会导致 adapter/tool 升级不改变 cell id,从而让旧工具产出的 Evidence 静默满足新 adapter 下的 required cell——这正是 ADR 62:134「Tool upgrade 造成 normalization 或 baseline compatibility 变化时显式使历史 comparison incompatible」要防的情况。

**建议**: 以 impl 57:148-154 为准修订 ADR 57:107-116 的类型,补齐 environment profile、fixture set、baseline set、adapter/tool identity,并把 optional 字段改为 canonical `none` 显式取值,同时写明 cell id 的派生函数(哪些字段参与、顺序、缺省表示)。

##### G3-M-IC-02 「编译器生成的 opaque verification target id」与「instrumentation 不进入 production profile」冲突,export surface 上的 target 可解析性未建模

- **位置**: `specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:117-123,208 vs specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:146 与 specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:69-74,112`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `adr-core`

**详情**: ADR 56:117-123 把可持久化 target 限定为四类,第四类是「编译器生成的 opaque verification target id,并由 SourceTrace manifest 反解到作者态」,56:208 相应要求「Compiler/Runtime 增加 Scenario Program 和 verification target manifest」。但 ADR 59:146 的 provider conformance 要求「instrumentation 不进入 production profile 或获得生产 write authority」,ADR 62:70-73 进一步要求 white-box probe「只在 verification/test profile 激活」「production artifact 必须通过 hard-cut 检查确认未包含 probe control endpoint」。而 ADR 62:112 定义 `export` surface 是「从 exact ExportProgram 构建的 standalone app/bundle」。四个 ADR 都没有回答:export surface 构建的是 production profile 还是 verification profile;若是前者,第四类 target 不可解析;若是后者,export cell 验证的就不是真正会发布的产物。ADR 62:66 只给了「优先使用 accessible role/name」这样的偏好排序,没有给出 target class × surface 的可用性矩阵,也没有规定不可解析时是 blocked 还是 unsupported。

**影响**: ADR 57:132 要求「critical scenario 在 Preview、Export、CI 三个 surface 运行共享 semantic assertions」。一个完全用 opaque verification target id 编写的 critical Scenario 会在 Preview 通过、在 export cell 上无法解析,而现有契约既没有在 compile 期拦截(ADR 56:166 只说 unsupported capability 形成 plan/diagnostic failure,未把 target class 纳入 capability),也没有规定运行期的落点状态。

**建议**: 在 ADR 56 的 target 一节加入 target class × surface 可用性声明,并把它纳入 `BehaviorScenarioProgram` 的 capability manifest,使 planner 在 matrix 展开时就能对 export/CI cell 做 preflight;明确 export surface 构建的 profile 归属,以及若使用 verification profile,如何另行证明 production artifact 与之等价(ADR 62:73 的 hard-cut 目前只证明「没有 probe」,不证明「行为等价」)。

##### G3-M-IC-03 required check family 词表与 `VerificationCheckKind` 枚举不一致,Gate 表无法机械校验

- **位置**: `specs/decisions/57.verification-plan-impact-and-policy.md:86-96 / specs/roadmap/g3-closure-evidence.md:40,51-58 / specs/roadmap/g3-behavior-verification-milestones.md:138`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `adr-surface`

**详情**: ADR 57:86-96 冻结的 `VerificationCheckKind` 是九个值:`diagnostics | build | unit | integration | e2e | visual | accessibility | performance | security`。但 `specs/roadmap/g3-closure-evidence.md:51-58` 的「Required families」列使用的是 `behavior`、`a11y`(例如 51 行「behavior、visual、a11y、security」),这两个名字都不在枚举内——`behavior` 最接近 `e2e`,`a11y` 最接近 `accessibility`。里程碑 milestones:138 写「Behavior E2E」,ADR 62 的小节标题是「E2E/Behavior」(53-105 行区段)和「Accessibility」。closure-evidence:40 要求 `verify:g3:adapter-matrix` 证明「all required check families/surfaces/targets/browsers/motion」。

**影响**: g3-closure-evidence 的矩阵表被定位为 Exit Gate 的机器可核对清单(文件 47 行「必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict」),但它的 family 列无法与 Plan 中的 `checkIds`/`VerificationCheckKind` 自动比对,只能靠人工翻译。这正是该文档 12-13 行想要避免的「用零散日志倒推验收标准」。

**建议**: 统一词表:要么把 `VerificationCheckKind` 的 `'e2e'` 改名为 `'behavior'`、`'accessibility'` 保留全称,要么把 closure-evidence 与 milestones 的列名改回枚举值,并在 ADR 62/63 中一律使用枚举值。此外补一条约束:g3-closure-evidence 的 family 列只允许出现 `VerificationCheckKind` 的字面量。

##### G3-M-IC-04 两份文档给出两套不同的 G3 Exit 判定条件

- **位置**: `specs/roadmap/g3-closure-evidence.md:95`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `evidence-gate`

**详情**: `g3-closure-evidence.md:95` 写「Global G3 只有 aggregate、Golden matrix、negative evidence、product journey 与 trusted Closure 全部 Passed 才能通过」——五类。而 `specs/roadmap/g3-behavior-verification-milestones.md:196-204` 的 G3 Exit Gate 是七条,其中「V0-V7 所有 required milestone 已 Implemented」(:199)、「无 editor-private state 或 framework-private canonical fork」(:202)、「无 production Secret/live production data」(:203)、「evidence 写入 G3 closure evidence 文档」(:204) 在证据文档的五类里没有对应项;反过来证据文档的「product journey」在 milestone 七条里也没有独立条目。而 milestone 自称「本文件是 G3 阶段状态的唯一里程碑来源」(:3)。

**影响**: 到判定时会出现两份都自称权威的清单,实际执行者可以挑更松的一份;这与 CLAUDE.md/AGENTS.md 要求的「链接到 owner 文档而不是复制权威内容」的文档边界也冲突。

**建议**: 把 `g3-closure-evidence.md:95` 改为引用 milestone 的 Exit Gate(链接 + 「本文只负责证据结构,判定条件以 milestone 为准」),或反过来让 milestone 引用证据文档;两处不要各写一份不同的清单。

##### G3-M-IC-05 `g3-verification-adapters-product-ci.md` 的阶段编号 V0-V5 与 roadmap 里程碑 V0-V8 撞名,同名指向完全不同的工作

- **位置**: `specs/implementation/g3-verification-adapters-product-ci.md:280,288,297,306,314,323`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `impl-mapping`

**详情**: 该文档的实施阶段标题依次是「V0:Adapter core 与 diagnostics/build/unit」「V1:Behavior/visual/a11y」「V2:Integration/performance/security 与 target/browser matrix」「V3:Product surface」「V4:CLI/CI 与 attested promotion」「V5:Full Golden matrix」。按总编排 line 209-227 的映射,它的 V0-V2 属于 roadmap 里程碑 V6,V3-V4 属于 V7,V5 属于 V8。也就是说该文档的 `V0` 与 roadmap `V0 Owner/contract hard cut` 完全无关,它的 `V3` 与 roadmap `V3 Deterministic replay` 完全无关。其余 6 份子文档都用了不撞名的前缀:B0-B4(behavior)、P0-P3(plan/policy)、E0-E4(evidence)、R0-R4(replay)、N0-N4(nodegraph)、A0-A4(animation)——说明前缀区分本来就是这套文档的既定约定,只有这一份破例。

**影响**: 任何跨文档的进度沟通(「V2 完成了吗」「V0 的完成条件是什么」)在这份文档上会产生真实歧义,尤其它同时是 V6、V7、V8 三个里程碑的唯一实施来源、并同时挂 `verify:g3:adapter-matrix`、`verify:g3:product`、`verify:g3:golden` 三个 Gate。状态表里写「V0 Not Started」时无法区分是 roadmap V0 还是本文档 V0。

**建议**: 把该文档阶段重命名为不撞名的前缀(如 D0-D5 或 C0-C5),并在文档开头加一句显式映射:「D0-D2 → 里程碑 V6;D3-D4 → V7;D5 → V8」。同时在总编排 line 248-256 的子计划索引表里补一列「对应里程碑」,让 7 份子文档到 9 个里程碑的映射在一处可读。

##### G3-M-IC-06 adapters 实施文档复用 V0-V5 编号，与 roadmap 的 V0-V8 里程碑编号直接冲突

- **位置**: `specs/implementation/g3-verification-adapters-product-ci.md:280,288,297,306,314,323`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `scale-risk`

**详情**: 该文档的实施阶段用 “### V0：Adapter core 与 diagnostics/build/unit”（280）、“### V1：Behavior/visual/a11y”（288）、“### V2：Integration/performance/security 与 target/browser matrix”（297）、“### V3：产品表面/Product surface”（306）、“### V4：CLI/CI 与 attested promotion”（314）、“### V5：Full Golden matrix”（323）。其余 6 份子实施文档都用了不冲突的前缀：B0-B4（scenario）、P0-P3（plan）、E0-E4（evidence）、R0-R4（replay）、N0-N4（nodegraph）、A0-A4（animation）。而 roadmap 的 V3 是 Deterministic replay、V5 是 Evidence plane、V7 是产品/CLI/CI、V8 是 Golden closure。

**影响**: 该文档的 “V3” 实际对应 roadmap 的 V7，“V5” 对应 roadmap 的 V8，“V4” 对应 roadmap V7 的 CLI/CI 部分。任何跨文档的进度陈述（如 “V3 完成”）都会产生歧义，milestone 文件又是 “G3 阶段状态的唯一里程碑来源”（milestone:3），状态追踪会被污染。

**建议**: 把该文档的阶段改为与同族一致的独立前缀（如 D0-D5 或 X0-X5），并在 g3-behavior-verification-closure.md 的子计划索引表（第 248-256 行）加一列标明每个子阶段对应哪个 roadmap milestone。

##### G3-M-IC-07 partitionRevisions 前端 optional / 后端强制,snapshotId 客户端无界而后端有 16 KiB、4096 分区硬上限,缺客户端守卫与诊断

- **位置**: `packages/runtime-core/src/execution.types.ts:72-76;apps/backend/internal/modules/remoteexecution/handler.go:142-152`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `stop-conditions`

**详情**: TS 契约 `ExecutionWorkspaceSnapshotRef.partitionRevisions?` 是可选的,`packages/runtime-core/src/executionRequest.ts:143-162` 在缺失时直接省略该字段。后端则强制:`handler.go:143` 要求 `len(revisions) != 0 && len(revisions) <= 4096 && len(snapshotID) <= 16*1024 && revisions["workspace"] != ""`,`store.go:302` 再次要求 partition 数在 1..4096。而客户端构造是 O(文档数)无界的:`apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:24-36` 每个文档产出 2 个 partition(约 2047 个文档即越界),`:14-21` 的 snapshotId 拼接每个文档的 `encodeURIComponent(id)@contentRev.metaRev`(文档多或 id 长时可超 16 KiB)。

**影响**: 行为是 fail-closed(后端拒绝),不是安全问题,但对 G3 是可用性悬崖:V6 required matrix 与 V8 Authenticated Catalog 会把 Workspace 规模推高到远超 G2 fixture,届时 Remote/CI surface 会在没有任何领域诊断的情况下整体拒绝执行,表现为 `EXE-4001` 一类通用错误;V3「capability preflight」清单中也没有对应的 snapshot-size preflight 条目。

**建议**: 把 `partitionRevisions` 在 `ExecutionRequestInput` 中改为必填(或在 `createExecutionRequest` 中对缺失抛错),并在客户端构造处加入与后端一致的上限检查,越界时产出明确诊断。若确定要支持大 Workspace,改用摘要式 snapshotId(对文档修订表做 hash)而非全量拼接。

##### G3-M-IC-08 required Vue cell 返回 unsupported/blocked 在实施文档被允许,却被 milestone Exit Gate 与 closure evidence 明确禁止

- **位置**: `specs/implementation/g3-verification-adapters-product-ci.md:161;specs/roadmap/g3-behavior-verification-milestones.md:200;specs/roadmap/g3-closure-evidence.md:64`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `stop-conditions`

**详情**: 实施文档 :161 写「若某 capability 尚未在 Vue public contract 支持,对 required cell 返回 unsupported/blocked,不能用 React-only 私有 probe 假装通过」。但 milestone Exit Gate :200 要求「Golden Plan digest 固定且所有 required cell current、compatible、trusted、passed」,closure evidence 的 negative 清单 :64 要求「required cell unsupported/over-budget/missing dependency 阻止 Closure,无 skipped 降级」,而 :49-58 的 Required Golden matrix 把 Preview/Export/CI × Vue/Vite 三行都列为 required。

**影响**: 给定本轮已确认的 Vue target 缺口(PIR 解释器化、无 per-document SourceTrace、subscription typecheck 失败),Vue required cell 返回 blocked 是大概率事件。届时同一套 spec 既说「允许返回 blocked」又说「blocked 阻止 Closure」,G3 Exit Gate 无法判定。这是一个会在 V6/V8 阶段才爆发、但现在就可消除的契约矛盾。

**建议**: 二选一并同步三处文档:(a) 把 Vue 的部分 family 从 required 降为 advisory,在 `g3-closure-evidence.md` 的 Required Golden matrix 中显式标注哪些 Vue cell 是 required、哪些允许 unsupported;或 (b) 删除 `g3-verification-adapters-product-ci.md:161` 对 required cell 的 unsupported/blocked 豁免,改为「Vue 不支持的 capability 必须先补齐 public contract,否则该 family 不得列为 required」。

##### G3-M-IC-09 Workspace document type 的两份权威契约文档已经落后于代码，V0 会在已漂移的基线上继续叠加

- **位置**: `specs/workspace/workspace-model.md:29-37;specs/api/workspace-sync.openapi.yaml:507-519`
- **严重度**: Medium ｜ **类别**: inconsistency ｜ **分析维度**: `v0-readiness`

**详情**: specs/workspace/workspace-model.md 标注 `ImplementationStatus：Implemented`、`ProductGateStatus：Passed`，其 29-37 行的 `type WorkspaceDocumentType = 'pir-page' | 'pir-layout' | 'pir-component' | 'pir-graph' | 'pir-animation' | 'code' | 'asset' | 'project-config'` 只有 8 项，缺 design-tokens、design-token-resolver、data-source；105-115 行的领域 owner 表同样没有 Token 与 Data owner。specs/api/workspace-sync.openapi.yaml:507-519 的 `WorkspaceDocumentType` enum 有 10 项，缺 data-source。代码里的权威列表是 packages/workspace/src/workspaceContractRegistry.ts:1-13 的 11 项。git grep 显示没有任何脚本或测试读取这两个文件做一致性校验。

**影响**: V0 的「Workspace document 契约」审阅者会以这两份文档为准，得到与代码不一致的结论；OpenAPI 是对外/对 CLI 的契约来源，缺项会让第三方生成的客户端拒绝合法文档。在已漂移的基线上再加两种 kind，会让漂移从 3 项扩大到 5 项且更难察觉。

**建议**: V0 一并补齐这两份文档到 13 种 kind，并新增一个轻量 check（可挂在 verify:g3:boundaries 或 lint）比对 WORKSPACE_DOCUMENT_TYPES 与 openapi enum、workspace-model.md 代码块，使之后任何 kind 变更都 fail closed。

#### 就绪度(readiness)

##### G3-M-RD-01 Golden browser harness 硬编码 chromium,Firefox/WebKit required cell 没有执行路径

- **位置**: `packages/golden-conformance/src/generatedProjectHarness.ts:6,511-513 / specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:123,174 / specs/roadmap/g3-closure-evidence.md:57-58`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `adr-surface`

**详情**: `generatedProjectHarness.ts:6` 只 `import { chromium, type Browser, type Page } from '@playwright/test'`,511-513 行 `browser = await chromium.launch({ channel: browserChannel === 'chromium' ? undefined : browserChannel })`——`E2E_BROWSER_CHANNEL` 只能在 Chromium 系列内切 channel,无法切换到 firefox/webkit。这是 G2 用来验证导出产物(React/Vue standalone)的唯一 browser harness。ADR 62:123 要求「Cross-browser critical subset | Chromium、Firefox、WebKit的black-box semantic/a11y」,g3-closure-evidence.md:57-58 有独立的 Firefox / WebKit critical subset 行。`tests/e2e/playwright.config.mts:47-59` 确实配置了 chromium/firefox/webkit 三个 project,但那套跑的是 Prodivix 编辑器自身的 E2E,不是导出应用。ADR 62:174 的后果只写「Golden conformance扩展为Scenario×surface×target×control matrix」,未提 harness 的引擎抽象改造。

**影响**: V6/V8 的 Firefox/WebKit required cell 在现有基建下只能返回 unsupported,而 g3-closure-evidence.md:64 明确「required cell unsupported/over-budget/missing dependency 阻止 Closure,无 skipped 降级」——即这两行会直接阻断 G3 Exit Gate。改造涉及 harness 的浏览器工厂抽象、三引擎的 dev server/静态服务复用、以及 CI 上三引擎的安装与并行预算,这些都未被任何里程碑条目单独承认。

**建议**: 在 V6 的必须完成项中加入「`generatedProjectHarness` 引擎抽象:chromium/firefox/webkit 可参数化启动,单引擎不可用时 cell 明确 blocked 而非静默跳过」,并在 ADR 62 的后果段写明 Golden harness 需要从单引擎改为引擎中立。同时确认 CI 预算:三引擎 × 2 target × Preview/Export/CI 的安装与运行时间。

##### G3-M-RD-02 质量与门禁基建覆盖不足(lint 仅 3/51 包、env-guarded 套件可在 CI 中不可达),而 G3 要新增 10 个 verify:g3:* 门禁

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:1152(M-BC-01)、:1167(M-CI-01);package.json:90`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `blockers-from-audit`

**详情**: M-BC-01 经 `turbo run lint --dry=json` 实证:「依赖图中有 50 个包,其中只有 @prodivix/cli、@prodivix/vscode、@prodivix/web 解析出真实命令 —— 其余每一项都是 <NONEXISTENT>」,包括 workspace、prodivix-compiler、plugin-host、server-runtime、golden-conformance 以及 remote-runner-worker 等安全关键应用;`no-explicit-any`/`no-empty` 规则集「只在 apps/web 内部生效」。M-CI-01 是同一类基建问题的另一个表现:受环境变量守卫的浏览器套件可以在所有 workflow 中不可达,却仍被写进 closure evidence 的复现命令。已确认 `package.json` 中零个 `verify:g3:*` script、`.github/workflows/` 中零个 G3 workflow。

**影响**: V0 要求「package ownership/dependency/boundary Gate」(milestones:37);g3-closure-evidence.md:34-43 列出 10 个必需 Gate(`verify:g3:boundaries` 到 `verify:g3`),g3-behavior-verification-milestones.md:210-219 同样列出这 10 个入口。新建的 `@prodivix/behavior` 与 `@prodivix/verification` 若沿用现有惯例(不定义 lint 脚本),将默认不受 ESLint 约束;而 M-CI-01 证明本仓库已经出现过「Gate 脚本存在、被写进 closure evidence、但在 CI 中零调用」的情况 —— G3 一次性新增 10 个 Gate,重复这个模式的概率很高,且 G3 的整个价值主张就是「可重复、可审计的 Gate」,门禁自身不可信会直接否定阶段结论。

**建议**: P1(与 V0 并行):在仓库根建立共享 flat ESLint 配置并为每个 workspace 包加 `lint` 脚本(或加一个覆盖 `apps/**` 与 `packages/**` 的根级 `eslint .` CI 步骤),使新建的两个 G3 包一开始就在门禁内;同时补一个元门禁 —— 校验 `package.json` 中每个 `verify:*` 脚本都至少被一个 `.github/workflows/*.yml` 调用,顺带闭合 M-CI-01,并防止 10 个 `verify:g3:*` 出现同样的悬空。

##### G3-M-RD-03 G2 已验证的两项证据实践未被 G3 模板沿用:per-Gate 规模计数与「延后外部 evidence / post-G3 边界」章节

- **位置**: `specs/roadmap/g3-closure-evidence.md:30-43`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `evidence-gate`

**详情**: 其一,G2 的每个 Gate 都是一节,内含子 Gate 表并记录规模量,例如 `specs/roadmap/g2-closure-evidence.md:22` 「1 file / 4 tests passed」、`:26` 「11 files / 72 tests passed」、`:100` 「Compiler 17 files / 116 tests、Golden 11 files / 53 tests、Web 88 files / 317 tests」、`:409` 记录 `verify:g2` 退出码 0 与 596.1s。这些数字使「缩小 filter 换绿」立即可见。G3 的 Gate manifest(`g3-closure-evidence.md:32-43`)只给每个 Gate 一格「Evidence」,没有任何规模字段。其二,G2 有独立章节 `specs/roadmap/g2-closure-evidence.md:470-484` 「延后的真实云 evidence 与明确 post-G2 边界」,把外部 pending(真实云 DR、A14 AWS KMS/OIDC)与「明确的 post-G2 扩展,不再作为伪阻塞项」分开列出。G3 会遇到同类问题(CI OIDC attestation、object store、PostgreSQL Evidence store、Firefox/WebKit runner),但模板里没有承载这类声明的位置,只有 Evidence identity 末尾一句「已知限制」(:26)。

**影响**: 缺规模计数,G3 的 10 个 Gate 只能以「通过/未通过」呈现,退出证据的抗稀释能力弱于 G2;缺 post-G3 边界章节,实施到最后会在「为等一个外部条件而整体 Blocked」与「悄悄把它算进 Passed」之间二选一,而 G2 已经证明第三条路(显式 external `Configured / Evidence pending`)可行。

**建议**: (1) 给 Gate manifest 增加「规模」列或要求每个 Gate 单独成节,记录 files/tests 数、耗时、退出码,以及 required cell 覆盖数;(2) 新增固定章节「延后的外部 evidence 与明确 post-G3 边界」,并规定:列在该章节的项目必须同时标注 trust class 与为何不阻塞 Exit,未列入者不得以「后续再补」通过 Gate(呼应 `specs/roadmap/global-phases.md:230`)。

##### G3-M-RD-04 closure evidence 的 Required Golden matrix 只有 Surface/Target/Browser/Motion 四维,缺 milestone V6 required matrix 的 Data、Auth/Server、Recovery 三维

- **位置**: `specs/roadmap/g3-closure-evidence.md:45-58 vs specs/roadmap/g3-behavior-verification-milestones.md:144-156`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `impl-mapping`

**详情**: milestone V6「Required controlled matrix」是七维表(line 146-154):Surface、Target、Browser、Motion、Data(loading/empty/error/retry/pagination/optimistic mutation/conflict)、Auth/Server(signed-out/signed-in/expired-denied/authorized function result)、Recovery(cancel/timeout/worker loss/cursor resume/duplicate/out-of-order result)。`g3-closure-evidence.md:49-58` 的 Required Golden matrix 表头只有 `Surface | Target | Browser/runtime | Motion | Required families | 状态` 五列 8 行,Data/Auth/Recovery 三维完全不出现。这三维只在 V8 的 Golden Scenario 叙述(milestone line 179-192 的第 3、4、7、8 条)和 evidence 文档的 Product journey(line 80)里以散文形式出现,而 Product journey 明确被 line 87 降级为「只能证明产品表面,不能替代 canonical digest、自动化 Gate」。

**影响**: `verify:g3:adapter-matrix` 的证据表是逐 cell 填写的(line 47「必须逐 cell 记录 Plan requirement、latest accepted Evidence、trust、compatibility 和 verdict」)。按现表填满 8 行即可宣称 matrix 通过,而 Data 冲突、Auth 过期/拒绝、Recovery worker loss 这三类正是 G3 最容易漏测、也最需要 deterministic replay 支撑的维度。这会让 V6 的 Gate 在证据结构上就允许漏项。

**建议**: 在 evidence 文档的 Required Golden matrix 中显式声明这三维的处理方式:如果它们是 Scenario 内部维度而非 cell 维度,就加一段说明并要求每个 cell 的「Required families」列引用覆盖了哪些 Data/Auth/Recovery 分支;如果它们参与 cell identity(按 `g3-verification-plan-impact-policy.md:148-151` 的 fixture set 属于 cell identity,Data/Auth fixture 确实参与),就把表扩成含 fixture/recovery 列。

##### G3-M-RD-05 10 个 Gate 中 `verify:g3:boundaries` 无实施文档归属、`verify:g3:behavior-composition` 由三份文档共享却无聚合定义,`verify:g3:product` 的证据行漏掉 CLI/CI

- **位置**: `specs/roadmap/g3-closure-evidence.md:34,36,41 与 specs/implementation/g3-behavior-verification-closure.md:258-270`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `impl-mapping`

**详情**: Gate 名称与数量本身逐项对齐(milestone line 210-219 与 evidence line 34-43 完全一致,10 对 10,顺序相同),但归属存在三处缺口。(1) `verify:g3:boundaries` 不出现在任何子文档的「计划 Gate」段,也不出现在总编排 line 260-270 的 G3 需求追踪表(该表 9 行覆盖了其余 9 个 Gate),它的全部定义只有 evidence line 34 的一句「package owner、Workspace document/Command、codec/diagnostic hard cut」。(2) `verify:g3:behavior-composition` 被三份文档同时认领:`g3-behavior-scenario-authoring-and-composition.md:266` 直接认领,`g3-nodegraph-typed-flow-debugger.md:278` 认领「其中的 NodeGraph suite」,`g3-animation-route-composition-reduced-motion.md:240` 认领「其中的 Animation/Route suite」,但没有任何文档定义这三块如何聚合成一个 Gate 及聚合后的必须覆盖全集。(3) evidence line 41 给 `verify:g3:product` 的「必须证明」是「Scenarios/Verification/Issues/Execution/SourceTrace UX/a11y/recovery」,完全没有 CLI/CI;而 milestone V7 line 171-175 把 versioned JSON/NDJSON、稳定 exit code、CI OIDC/job attestation、fork hard cut、「Web/CLI/CI 生成相同 Plan/Closure digest」都归在 V7,`g3-verification-adapters-product-ci.md:333` 也把这些归到 `verify:g3:product`(其 line 342-343、346 的必须覆盖列表含 CLI codec/exit codes/NDJSON 与 CI OIDC/fork/duplicate finalize)。

**影响**: (1) 与 (2) 使两个 Gate 的通过标准只能靠实施者临场发挥;(3) 更直接:closure evidence 是「预先冻结证据结构、避免事后倒推验收」的文档(line 12),但它给 product Gate 的行不要求任何 CLI/CI 证据,填表时可以完全跳过 digest parity 与 OIDC/fork hard cut——而这正是 G3 相对 G2 最关键的新增可信性来源。

**建议**: 在 evidence line 41 的 `verify:g3:product` 行补上「CLI versioned JSON/exit code、CI attestation/fork hard cut、Web/CLI/CI Plan/Closure digest parity」;在总编排的 G3 需求追踪表补一行把 `verify:g3:boundaries` 挂到 V0 owner hard cut;在总编排或新建的 V0 文档中定义 `verify:g3:behavior-composition` 的三段聚合(Scenario 跨领域 + NodeGraph suite + Animation/Route suite)与统一入口。

##### G3-M-RD-06 9 个 required check family 中 visual / performance / security 三族在仓库中零工具基础，a11y 仅有单包 devDependency

- **位置**: `specs/implementation/g3-verification-adapters-product-ci.md:124-143 与 packages/ui/package.json:77、package.json:125`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `scale-risk`

**详情**: adapters 文档 96-143 行定义 9 个 family：diagnostics、build、unit、integration、behavior-e2e、visual、accessibility、performance、security。仓库实况：behavior-e2e 有基础（`@playwright/test` ^1.61.1 在 package.json:125 与 packages/golden-conformance/package.json:36，且 `test:e2e:firefox`/`test:e2e:webkit` 已配置，package.json:81-82）；accessibility 只有 `axe-core: ^4.12.1` 且仅是 `packages/ui` 的 devDependency（packages/ui/package.json:77），不在任何可复用的 adapter 位置；visual（第 124-129 行要求 “diff 算法/version/threshold/mask semantic refs 进入 identity”）、performance（136-138 行）、security（140-143 行）三族在全仓 package.json 中检索 pixelmatch/odiff/resemblejs/lighthouse/jest-image-snapshot 均零命中。

**影响**: V6 的 9 族里有 3 族需要从选型开始（含 visual diff 算法与 baseline 存储、performance 指标采集与阈值模型、security 的 bundle/CSP/网络 allowlist 扫描），这部分工作量在 milestone V6 的 6 行 checklist（第 137-142 行）里被压缩得完全看不出来。visual baseline 还要按 target/browser 分别管理（evidence 文档 213 行 “React/Vue 默认使用各 target 自己的 visual baseline”），进一步放大。

**建议**: 把 V6 拆成 V6a（diagnostics/build/unit/integration/behavior-e2e——有基础，可快速闭环）与 V6b（visual/a11y/performance/security——需选型 + baseline 存储 + 阈值模型）。V6b 的选型评审提前到 V0/V1 并行做，因为 visual baseline 的 identity 形状会反向影响 V0 要冻结的 `EvidenceCandidate` artifact class（evidence 文档第 116 行已列出 `visual-diff`、`performance-profile`、`security-report`）。

##### G3-M-RD-07 新增 diagnostic domain 必须改动 generate-diagnostic-docs.mjs 核心配置，且已有 5 个域长期漂移，BHV/VER registry 无通用机制

- **位置**: `scripts/generate-diagnostic-docs.mjs:15-29,31-111,219-247;specs/diagnostics/README.md:107-113`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `v0-readiness`

**详情**: 文档生成器的 `domainOrder = ['PIR','WKS','PLG','EDT','UX','COD','SEM','GEN','API','AI','RTE','NGR','ANI']`（15-29 行）与 `domainInfo`（31-111 行）都是硬编码常量，readDiagnostics()（199-217）只遍历 domainOrder。specs/diagnostics 目录里实际有 21 个码表，其中 `data-`、`asset-`、`test-`、`execution-`、`server-runtime-` 五个域（README.md:107-113 已正式登记 DAT/AST/TST/EXE/SVR）不在 domainOrder 中，apps/docs/reference/diagnostics 下也确实没有 dat-/ast-/tst-/exe-/svr- 页面。另外 source↔spec 漂移检查只有 PLG 一个特例实现（validatePluginDiagnosticCoverage，219-247 行）。

**影响**: V0 验收项「`behavior`/`verification` diagnostic domain、target 和 `BHV-*`/`VER-*` registry」（milestones:36）如果照 DAT/TST 的先例执行，就会变成「码表存在但没有任何自动化保证代码里的 BHV-/VER- 与码表一致」，等于没有 registry。而 `docs:diagnostics:check` 的现状也说明这条防线在最近 3 个域上已被跳过。

**建议**: V0 把 domainOrder/domainInfo 改为从 specs/diagnostics 目录 + README 编码域表推导（或至少一次性补齐 DAT/AST/TST/EXE/SVR 并加入 BHV/VER），并把 validatePluginDiagnosticCoverage 泛化为「域 → 源码文件 glob」的通用 coverage 校验，让 BHV-/VER- 从第一天起就有 spec↔source 双向漂移检查。

##### G3-M-RD-08 V0 要求「apps/web 无 duplicate domain type」，但现有 hard-cut 脚本的禁止模式只覆盖 Workspace 契约，没有可执行入口

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:37;scripts/check-editor-hard-cut.mjs:98-107`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `v0-readiness`

**详情**: milestones V0 第 6 条：「package ownership/dependency/boundary Gate，`apps/web` 无 duplicate domain type」。check-editor-hard-cut.mjs 的 forbiddenPatterns 只有两条与「Web 私有重复契约」相关：`/export\s+type\s+(?:WorkspaceSnapshot|WorkspaceDocumentRecord|WorkspaceDocumentType)\b/`（98-102 行）和 WorkspaceOperation/History 系列（103-107 行）。没有任何模式覆盖 BehaviorScenario、BehaviorScenarioProgram、VerificationPolicy、VerificationPlan、ImpactSet、EvidenceCandidate、ReplayRecord。check-core-package-boundaries.mjs 只检查 packages/* 的 package.json 依赖与 import，完全不检查 apps/web 是否自建领域类型。

**影响**: 该验收项目前无法用命令判定通过与否，只能靠人工 review；而 V1 起 Scenarios/Verification UI 都在 apps/web 落地，正是最容易先在 Web 里手写一份 draft 类型再「以后搬走」的阶段。没有 Gate 就等于没有 hard cut。

**建议**: V0 在 check-editor-hard-cut.mjs 增加 `export\s+(?:type|interface)\s+(?:BehaviorScenario|BehaviorScenarioProgram|BehaviorTargetRef|VerificationPolicy|VerificationPlan|VerificationImpactSet|VerificationEvidence|EvidenceCandidate|ReplayRecord)\b` 一类禁止模式，并把 check:editor-hard-cut 显式纳入 verify:g3:boundaries 的组成命令。

##### G3-M-RD-09 V0 的「current/wire/codec/migration conformance」没有指定落盘 artifact 与判定口径，验收不可判定

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:35;specs/implementation/g3-behavior-verification-closure.md:152-158;specs/roadmap/g3-closure-evidence.md:34`
- **严重度**: Medium ｜ **类别**: readiness ｜ **分析维度**: `v0-readiness`

**详情**: milestones V0 第 4 条只写「current/wire/codec/migration、Backend/Workspace validation conformance」，closure 文档 155 行只写「current model 不暴露数字版本，wire/codec/migration 明确 fail closed」，g3-closure-evidence.md:34 的 `verify:g3:boundaries` 只写「package owner、Workspace document/Command、codec/diagnostic hard cut」。对比现有两种成熟形态：PIR 有 specs/pir/PIR-current.json + PIR-current.version.json + 逐版本不可变快照 + scripts/check-pir-current-boundary.mjs；NodeGraph 有 packages/nodegraph/src/wire.ts + 生成的 apps/backend/internal/platform/nodegraphcontract/current_schema.generated.json + check:nodegraph-wire-contract。8 份 G3 ADR/实施文档中没有任何一处指定 behavior/verification 的 wire schema 存放位置、版本 manifest 或激活流程。

**影响**: 「migration conformance」对全新 kind 本无历史数据可迁移，实际含义只能是「从第一天建立数字版本隔离与 fail-closed decode 边界」。口径不写清，V0 很可能只交付一个 current 模型 + 一个 TS 类型守卫就声称完成，等到 V4/V5 需要跨 revision 比较 Program/Plan digest 时才发现 wire 边界从未建立，届时已有存量文档。

**建议**: V0 开工前补写具体口径：指定 specs/behavior/ 与 specs/verification/ 下的 current schema 与 version manifest 文件名，规定 wire 类型只经 `@prodivix/behavior/wire` 子入口暴露（对齐 @prodivix/pir/wire 与 @prodivix/nodegraph/wire），并把 `verify:g3:boundaries` 的组成命令逐条列出（至少包含 check:core-boundaries、check:editor-hard-cut、新的 workspace 契约投影 check、两个新包的 test、apps/backend go test ./internal/modules/workspace）。

#### 依赖风险(dependency-risk)

##### G3-M-DR-01 runtime-core 的执行保留模型有一处无界增长与一处投影陈旧,而它是 ReplayRecord 与 deterministic controls 的声明 owner

- **位置**: `specs/implementation/reviews/2026-07-26-static-review.md:982(M-RL-02)、:941(M-SI-03);packages/runtime-core/src/executionJob.ts:247、packages/runtime-core/src/executionSession.ts:585`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `blockers-from-audit`

**详情**: M-RL-02:`commitEvent` 把每个事件推入 `history` 且无任何裁剪,「本包中其他每一处保留面都有明确的预算(EXECUTION_CONSOLE_LIMITS.maximumRecords、EXECUTION_TERMINAL_LIMITS.maximumOutputRecords、createExecutionSessionCoordinator 的 maxEvents、EXECUTION_TEST_REPORT_LIMITS),因此此处缺少上界是一处遗漏而非设计选择」;单条日志上限 64 KiB,「约 10 万行嘈杂输出之后,浏览器标签页持有数百 MB」。M-SI-03:`publishTrace` 只更新 `events`/`observations` 而漏掉 `consoleObservations`,「snapshot 与协调器自身的保留状态互相矛盾」,而其他四处写入点都赋值三者。

**影响**: g3-behavior-verification-closure.md 的 owner 表把 `@prodivix/runtime-core` 定为「deterministic controls、attempt/replay event、cancellation/budget、runtime observation ports」的 owner;V3 必须完成「bounded ReplayRecord、first divergence、fresh replay debugger」(milestones:93)。ReplayRecord 的 bounded 语义会直接建在现有 retention 模型之上:M-RL-02 说明该模型存在一条无预算通道,M-SI-03 说明投影与保留状态可以不一致 —— 而 V3 的核心验收正是「连续运行至少三次产生相同 semantic sequence」与「first divergence」定位,两者都要求投影与保留状态严格一致且有确定的截断语义。若不先修,V3 会把「因保留截断/投影陈旧导致的序列差异」误报为 divergence,或反过来漏报。

**建议**: P2(V3 设计前完成,工作量小):按建议在 `CreateExecutionJobControllerInput` 增加 `maxRetainedEvents` 预算并在 `commitEvent` 裁剪 `history`,同时记录最早保留 sequence 使 `subscribe({ afterSequence })` 能报告重放缺口;在 `publishTrace` 的 snapshot 更新补上 `consoleObservations: projected.consoleObservations`。V3 在此基础上再定义 ReplayRecord 的 bounded 契约,并把「截断必须可被 divergence 检测区分」写成显式要求。

##### G3-M-DR-02 DiagnosticTargetRef / DiagnosticSurface / DiagnosticPlacement 均无 Scenario、step、Plan cell、attempt、Evidence 表达,且 kind 列表在至少 6 处被穷举复制

- **位置**: `packages/diagnostics/src/diagnostic.types.ts:19-70, 103-113;packages/diagnostics/src/diagnosticShared.ts:19-26`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `diagnostics`

**详情**: BHV §4(behavior-diagnostic-codes.md:170-174)要求诊断 target 能指向「Scenario、step、semantic target、domain source 或 ReplayRecord event」;VER §4(verification-diagnostic-codes.md:211-215)要求指向「Impact reason、Policy rule/exemption、Plan/cell/dependency、attempt、Evidence/artifact、Closure item」。当前 `DiagnosticTargetRef` 的 17 个 kind 里没有任何一个能表达这些。同时 `DiagnosticSurface`(第 103-113 行)与 `DiagnosticPlacement`(diagnosticShared.ts:19-26)也没有 Scenarios / Verification / Execution Center / Evidence 面板,而 ADR 63 与 `specs/implementation/g3-verification-adapters-product-ci.md:223` 都要求这些面。该 union 的 kind 被穷举复制在:`buildDiagnosticPresentation.ts:131-133`、`packages/runtime-core/src/executionFilesystemDiff.ts:113-114`、`packages/runtime-remote/src/remoteExecutionCodecPrimitives.ts:215-216`、`packages/runtime-core/src/executionTestReport.ts:626-633`、`apps/web/src/editor/navigation/workspaceSemanticNavigation.ts:258-268`、`apps/web/src/editor/features/component/ComponentAuthoringPage.tsx:30-59`。

**影响**: V0 checklist 只有一行「`behavior`/`verification` diagnostic domain、target 和 `BHV-*`/`VER-*` registry」(g3-behavior-verification-milestones.md:36),严重低估了实际工作量:新增约 6-8 个 target kind 会连带修改 `@prodivix/diagnostics`、`@prodivix/runtime-core`(含 remote execution wire codec)、`@prodivix/runtime-remote`、`apps/web` 导航——其中 remote codec 是跨进程 wire 契约,改动需要版本兼容处理。这个依赖链在任何 G3 实施文档中都没有出现。

**建议**: 在 `specs/implementation/g3-behavior-verification-closure.md` 的 V0 段落里显式列出 target kind 清单和受影响的 5 个包/文件,并评估 remote execution codec 的兼容策略(新增 kind 对旧 runner 是否 reject)。参照 `specs/implementation/ux-diagnostics-implementation-plan.md:39-44` 的 UX 接入写法,把新增 kind 逐项写死。

##### G3-M-DR-03 `@prodivix/verification-browser` 是幽灵包:仅在 ADR 62 出现一次,不在 V0 建包清单、不在 package boundaries、不在其实施文档

- **位置**: `specs/decisions/62.verification-adapter-matrix-and-cross-target-closure.md:10`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `impl-mapping`

**详情**: ADR 62 的 Owner 行写「`@prodivix/verification`、目标 `@prodivix/verification-browser`、controlled tool adapters、Compiler/Runtime providers」。全仓检索 `verification-browser` 只有这一处命中。milestone V0 line 31-32 只建两个包;`specs/decisions/34.core-package-boundaries.md:114,126,304,309` 也只登记 `@prodivix/behavior` 与 `@prodivix/verification` 两个 G3 target 包(line 309 列出可独立 build/test 的无 DOM 包清单时同样只有这两个);`g3-verification-adapters-product-ci.md` 全文不提这个包,它只说「每个受控 adapter 包导出 descriptor + factory」(line 46)而不指名。

**影响**: V0 的 package ownership/dependency/boundary Gate 与 `check:core-boundaries` 的等价物无法覆盖一个未登记的包:它是否允许依赖 DOM、是否允许被 `@prodivix/verification` 反向 import、是否需要独立 build/test 都没有规则。到 V6 需要落地 Browser Scenario driver 时,这个包会以「临时决定」的方式出现,或者其内容被塞进 `@prodivix/runtime-browser` / `apps/web`,而后者正是 ADR 62 明令禁止的(「Web/Backend不解析工具私有payload」,line 47)。

**建议**: 二选一:要么把 `@prodivix/verification-browser` 补进 milestone V0 的建包清单与 `34.core-package-boundaries.md`(声明它允许 DOM、只承载 Browser adapter、不得被 Core 反向依赖),要么从 ADR 62 Owner 行删除并改写为「受控 Browser adapter 包(命名在 V6 实施时冻结)」。不要让一个包名在 Accepted ADR 里悬空。

##### G3-M-DR-04 V6 矩阵组合爆炸只由作者态 Policy 数据约束，代码层无硬上限，Gate 时长不可预算

- **位置**: `specs/roadmap/g3-behavior-verification-milestones.md:146-154 与 specs/implementation/g3-verification-plan-impact-policy.md:183-193`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `scale-risk`

**详情**: milestone V6 的 required controlled matrix 声明 7 个维度（第 148-154 行）：Surface 3、Target 2、Browser 3、Motion 2、Data 6（loading/empty/error/retry/pagination/optimistic mutation-conflict）、Auth/Server 4、Recovery 5。朴素笛卡尔积 3×2×3×2×6×4×5 = 2,160 种组合，再乘 9 个 check family ≈ 1.9 万 cell。唯一刹车是 plan 文档 183-193 行的 matrix budget，其中第 189 行明确 “按 Policy 中显式声明的 equivalence/critical subset 选择，而不是 runtime 随机抽样”——即 critical subset 是 `verification-policy` Workspace document 里的作者态数据。

**影响**: G3 Golden 的实际运行时长由某个作者写的 Policy 决定，而不是由任何 Gate 脚本固定。参考基准：`pnpm run verify:g2` 本机全量已需 596.1s（specs/roadmap/current-status.md:27），且不含跨 3 浏览器 × 2 target × 3 surface × 2 motion 的 E2E/visual/a11y/perf。V8 极易演变成 CI 上跑不完，然后被临时缩 Policy，而缩 Policy 又不会被任何 Gate 检出（因为 Policy 就是 canonical 输入）。

**建议**: 在 `g3-closure-evidence.md` 的 Golden matrix 表之外，额外冻结一份 “Golden Policy digest” 作为 Exit Gate 的一部分：required cell 集合必须与该 digest 一致，任何缩减矩阵的 Policy 修订都会改变 digest 从而使 Closure 失效。同时在 V4 就给 budget 定一个明确的 wall-clock 目标（例如 CI 单次 ≤ 30 分钟）反推 critical subset 规模。

##### G3-M-DR-05 exact snapshot 身份算法在 web 与 compiler 中双份实现,无共享源、无一致性测试

- **位置**: `apps/web/src/editor/features/execution/workspaceExecutionIdentity.ts:11-45;packages/prodivix-compiler/src/executableProject/workspaceExecutableProject.ts:131-157`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `stop-conditions`

**详情**: 两处各自实现了同一个 snapshotId 构造规则 `${workspace.id}|w=...|r=...|o=...|d=${documentRevisions}` 与同一套 partitionRevisions(`workspace`/`route` 加每文档 `content`/`meta`)。当前逐字符一致,但没有任何测试断言二者相等,也没有 lint 边界阻止漂移。消费侧是交叉的:`apps/web/src/editor/features/execution/ExecutionCenter.tsx:242` 与 `workspaceExecutionSourceNavigation.ts:26` 用 web 版本判 stale,`apps/web/src/editor/features/issues/workspaceIssueProviders.ts:345` 却用 compiler 导出的版本。

**影响**: 任一侧修改(例如为支持 behavior-scenario / verification-policy 两个新 document kind 而调整 partition key 命名)都会让 Execution Center 的 stale 判定与 Issues 的 exact-revision 判定悄悄分叉,表现为「Source 链接时有时无」而不是明确失败。V0 边界 Gate 的目标之一正是「`apps/web` 无 duplicate domain type」(`specs/roadmap/g3-behavior-verification-milestones.md:37`),这是现成的、必须清掉的实例。

**建议**: 删除 `apps/web` 的本地副本,统一 re-export `@prodivix/prodivix-compiler` 的 `createWorkspaceExecutionSnapshotRef`;若 web 只需 snapshotId,从同一函数派生。把这条纳入 V0 `verify:g3:boundaries` 的检查项。

##### G3-M-DR-06 没有共享 ExecutionProvider conformance kit,Browser 与 Remote 覆盖严重不对称;V3/V6 所需 capability 与 CI surface 扩展未列入任何 milestone

- **位置**: `packages/runtime-core/src/__tests__/executionProvider.conformance.test.ts:12-116;packages/runtime-core/src/execution.types.ts:28-59`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `stop-conditions`

**详情**: runtime-core 里名为 conformance 的套件只有 2 个用例(:13、:116),且针对内存假 provider,不是可被各 provider 复用的契约执行体。实际覆盖各写各的:`packages/runtime-remote/src/remoteExecutionProvider.conformance.test.ts` 19 个用例,`packages/runtime-browser/src/browserProjectRunner.conformance.test.ts` 仅 1 个。此外 `EXECUTION_PROVIDER_CAPABILITIES`(`execution.types.ts:41-59`)没有任何 deterministic replay control 位(clock/random/scheduler/network-fixture/storage-isolation/render-controls),`EXECUTION_INVOCATION_KINDS`(:28-36)没有 `behavior`,`EXECUTION_PROFILES`(:8-13)只有 preview/test/build/production、没有 V6 需要的 `ci` surface;后端 `apps/backend/internal/modules/remoteexecution/handler.go:110-123` 是 4 项硬编码的 `(profile, runtimeZone) -> providerId` 白名单。而 V3「必须完成」清单(`milestones.md:87-93`)与 V6(:135-156)都没有任何 Backend/provider registry/wire 扩展条目。

**影响**: V3 退出证据里的「provider conformance」目前没有可复用载体——只会变成再写一批 provider 私有测试,无法证明 Browser 与 Remote 支持/拒绝相同 control capability(这正是 `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:141` 的要求)。同时 V3/V6 需要的枚举扩展横跨 TS 枚举、Remote codec、Go handler 与 `remote_execution_grants` 迁移,工作量被 milestone 清单低估。

**建议**: 在 V3 启动前先建立一个从 `@prodivix/runtime-core` 导出的、参数化的 provider conformance 套件,让 runtime-browser 与 runtime-remote 各自实例化执行;把 capability/invocation/profile 枚举扩展与后端白名单加迁移显式写入 V3 的「必须完成」清单,以及 V6 的 CI surface 前置项。

##### G3-M-DR-07 TS 与 Go 的 patch root 允许列表是两份手工副本，没有任何一致性 Gate

- **位置**: `packages/workspace/src/workspaceContractRegistry.ts:72-112;apps/backend/internal/modules/workspace/patch.go:24-59`
- **严重度**: Medium ｜ **类别**: dependency-risk ｜ **分析维度**: `v0-readiness`

**详情**: TS 侧 `WORKSPACE_DOCUMENT_POLICIES` 逐 kind 声明 patch roots（如 `'data-source': roots('data', ['/source','/schemasById','/operationsById','/importProvenanceById'])`）。Go 侧在 patch.go:49-51 重复同一份：`validateWorkspaceDataSourcePatchPath` → `validateWorkspaceDocumentRootPath(path, "source", "schemasById", "operationsById", "importProvenanceById")`，asset/project-config 同理（53-59 行）。git grep 显示除 packages/workspace 内部外，没有任何脚本或测试同时读取这两份定义。

**影响**: 新 kind 的 patch root 需要在两个语言里各写一遍。若 Go 侧更宽松（例如漏写而落入 patch.go:43-45 的 generic validator），本地会拒绝的 patch 在 Backend 被接受，形成本地/服务端语义不对称；若 Go 更严格，本地成功的 Command 在 commit 时失败并卡住 Outbox。目前的 design-tokens/design-token-resolver 已经是「TS top-level vs Go generic」的隐式约定，没有文档也没有测试固定。

**建议**: 复用已经存在且已挂进 lint 的 nodegraph 模式（scripts/sync-nodegraph-wire-contract.mjs:5-11 从 packages/nodegraph/src/wire.ts 生成 apps/backend/internal/platform/nodegraphcontract/current_schema.generated.json，`pnpm check:nodegraph-wire-contract`）：V0 把 WORKSPACE_DOCUMENT_POLICIES 投影为 Go 可读的 generated JSON，Go patch validator 改为读表，并把 check 脚本加入 lint 与 verify:g3:boundaries。

#### 顺序安排(sequencing)

##### G3-M-SQ-01 createDefinition 硬编码 docsUrl 指向 /reference/diagnostics/<code>,BHV/VER 落地即产生 32 条死链;而现在就接入生成器又会向用户站发布零实现的错误码

- **位置**: `packages/diagnostics/src/diagnosticShared.ts:197-198;scripts/generate-diagnostic-docs.mjs:144-197`
- **严重度**: Medium ｜ **类别**: sequencing ｜ **分析维度**: `diagnostics`

**详情**: `createDefinition` 无条件生成 `docsPath: \`/reference/diagnostics/${code.toLowerCase()}\``和同值`docsUrl`。`openDocsAction`(diagnosticShared.ts:52-58)的 `requires: ['docsUrl']` 意味着只要有 docsUrl 就渲染 "Open docs" 按钮。BHV/VER 共 14 + 18 = 32 个码位,若按 UX catalog 形态实现而生成器 domainOrder 未同步更新,就是 32 条 404。反方向也有问题:如果现在就把两个域加进 domainOrder,`buildExpectedFiles`(第 412-439 行)会立刻向文档站发布 32 个用户可见错误码页,而代码中一个都发不出来(已确认 `BHV-`/`VER-`在`_.ts/_.tsx/*.go` 中零命中)。`parseStandardSpec`(第 144-197 行)只识别 severity/stage/retryable/trigger/user action 五个字段,没有 `Status`/`Reserved` 概念可以把未实现码位标为预留。

**影响**: 这是一个必须在 V0 之前决定的顺序问题,两个方向都有代价。`ImplementationStatus：Not Started` 只写在两份 spec 的头部(behavior:6、verification:6),生成器读不到,渲染出的用户页面不会带任何 "尚未实现" 提示。

**建议**: 给 `parseStandardSpec` 增加可选 `- Status: reserved|active` 字段,生成器对 reserved 码位仍生成页面但打上明确标记(或只进域索引不进主索引);BHV/VER 在 V0 就以 reserved 全量接入,随实现逐条翻成 active,并让 `check` 校验 "active 码位必须在代码 registry 中存在"。这样既拿到漂移保护,又不误导用户。

##### G3-M-SQ-02 V4 planner 依赖 V6 才交付的 adapter capability snapshot，plan digest 在 V6 前无法真正稳定

- **位置**: `specs/implementation/g3-verification-plan-impact-policy.md:174,302 vs specs/roadmap/g3-behavior-verification-milestones.md:23`
- **严重度**: Medium ｜ **类别**: sequencing ｜ **分析维度**: `scale-risk`

**详情**: plan 文档第 174 行规划算法第 4 步是 “展开 matrix profile，并按 adapter capability 预检”，第 302 行停止条件是 “adapter capability snapshot 与执行时不一致时，该 cell blocked 并要求重建 Plan”。adapter registry / SPI / capability snapshot 由 g3-verification-adapters-product-ci.md 的第一阶段交付（第 280-286 行），对应 roadmap V6（milestone:23）。即 V4 的核心输入来自 V6。

**影响**: V4 只能对着 fixture registry 做 planner，P2 的 “跨进程/OS 得到相同 plan bytes”（第 271 行）可以通过，但 Golden 的真实 plan digest 到 V6 才第一次成立；届时 V4 的 digest 稳定性证据需要重跑，V5 已入库的 Evidence 也可能因 planDigest 变化失效。

**建议**: 把 `VerificationAdapterDescriptor` + registry snapshot codec + capability predicate 提前到 V0 冻结（只冻 contract 与 codec，不实现任何 adapter），让 V4 从第一天就对真实 registry 形状规划。这条与建议 5 是同一次修订。

#### 确定性(determinism)

##### G3-M-DT-01 canonical serialization 与 digest 规则只为 Evidence 定义了一次,Program digest、plan digest、control profile digest 停留在「byte-identical」口号

- **位置**: `specs/decisions/58.verification-evidence-provenance-and-retention.md:98-104 vs specs/decisions/56.behavior-scenario-and-cross-domain-action-contract.md:161-166、specs/decisions/57.verification-plan-impact-and-policy.md:42-44,122-123、specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:44`
- **严重度**: Medium ｜ **类别**: determinism ｜ **分析维度**: `adr-core`

**详情**: ADR 58:98-104 是四份文档里唯一给出可执行规则的地方:「object key canonical ordering;semantically unordered set 排序、ordered step/result 保持顺序;UTF-8、finite number、exact key、duplicate identity 和 byte budget hard cut」。而 ADR 56:161-166 的 Program、ADR 57:42-44 与 122-123 的 plan(「相同输入必须得到相同 canonical plan 和 digest」「由 canonical normalized input digest 派生」)、ADR 59:44(「省略字段由 canonical default 补齐并进入 digest」)全都只有结论没有规则,且都未引用 58:98-104。整份 G3 文档没有指定 hash 算法与 digest 字符串编码,而仓库已有明确先例:ADR 47:71「digest 使用 canonical `sha256-` + 64 位小写十六进制」。impl 57:271 的完成条件是「跨进程/OS canonical fixture 得到相同 plan bytes」,但没有可据以实现的 canonicalization 规范。

**影响**: digest 链(scenario → program → controls → cell → plan → evidence manifest → attestation 签名输入)横跨 `@prodivix/behavior`、`@prodivix/verification`、`@prodivix/runtime-core`、`apps/backend` 四个 owner 与 Go/TS 两种语言。缺少共享规范时,浮点表示、Unicode 规范化、集合排序、空值省略这些差异会在跨语言、跨进程处产生不可复现的 digest,而这正是 attestation 验证(`VER-5001`「digest 链不匹配」为 fatal)最先炸掉的地方。

**建议**: 把 ADR 58:98-104 提升为 G3 共享的 canonical serialization/digest 规范(或指向一份独立小 ADR),并在 ADR 56/57/59 中显式引用;补上 hash 算法与编码(建议沿用 ADR 47:71 的 `sha256-` + 64 位小写十六进制),补上数字、Unicode normalization、optional 字段缺省表示与跨语言(Go/TS)一致性的 conformance 要求。

#### 正确性(correctness)

##### G3-M-CO-01 Vue data operation 排序比较器在三种 kind 下不满足反对称性,破坏 Vue 导出确定性

- **位置**: `packages/prodivix-compiler/src/vue/workspaceProject.ts:116-120`
- **严重度**: Medium ｜ **类别**: correctness ｜ **分析维度**: `stop-conditions`

**详情**: 比较器为 `(left.kind === right.kind ? 0 : left.kind === 'query' ? -1 : 1) || compareText(left.key, right.key)`。当同时存在 `mutation` 与 `subscription` 时:compare(mutation, subscription) 走「kind 不同且 left 不是 query」返回 1;compare(subscription, mutation) 同样返回 1。两个方向都返回正数,违反 `Array.prototype.sort` 对比较函数的一致性要求,结果依赖引擎实现与输入初始顺序。当前 fixture 只有 query/mutation,此时它恰好是合法全序(query < mutation,同 kind 落到 key 比较),所以现有 Gate 全绿。

**影响**: 一旦 Workspace 含 subscription,生成的 `src/prodivix-data-operations.ts` 内容顺序可能在不同运行间变化,导出 bundle 不再 byte-stable。这直接威胁 V4「byte-stable plan」、V8「Golden Plan digest 固定」以及 G2 evidence 中记录的 Vue Catalog snapshot digest 机制(`specs/roadmap/g2-closure-evidence.md:432`)。

**建议**: 改为显式 kind 序数比较,例如 `const rank = { query: 0, mutation: 1, subscription: 2 }` 后用 `rank[left.kind] - rank[right.kind] || compareText(left.key, right.key)`,并补一条同时含三种 kind 的确定性断言(重复编译 digest 相等)。

### 3.7 Low(2 条)

#### 契约缺口(contract-gap)

##### G3-L-CG-01 retryable 语义在 BHV/VER 上没有所有权:BHV-4006 是全仓唯一 fatal+retryable,VER-4001 与 EXE-5001/5002 存在双层重试

- **位置**: `specs/diagnostics/behavior-diagnostic-codes.md:134-141;specs/diagnostics/verification-diagnostic-codes.md:120-128;specs/diagnostics/execution-diagnostic-codes.md:19-38`
- **严重度**: Low ｜ **类别**: contract-gap ｜ **分析维度**: `diagnostics`

**详情**: 两个问题。其一:`BHV-4006` 是我逐份码表扫描后全仓 21 份中**唯一**的 `Severity: fatal` + `Retryable: true` 组合(另外三个 fatal 码 BHV-4004、VER-5001、VER-5002 都是 false),但它的 developer notes 写「当前 session 不得复用」、User action 写「销毁并重建运行环境后重试」。`retryAction`(diagnosticShared.ts:60-66,`requires: ['retryable']`)会因 `buildDiagnosticPresentation.ts:181-182` 的 `diagnostic.retryable === true` 判定而在 UI 上给出普通 Retry 按钮,语义是原地重试。其二:VER §1(第 20-22 行)只说明了工具/领域诊断保留自己的 code,但「不覆盖」清单从头到尾没提 `EXE-xxxx`。当 verification adapter 通过 Remote ExecutionProvider 执行 cell 而 runner 不可用时,`EXE-5001`(retryable true,execution-diagnostic-codes.md:32)和 `VER-4001`(retryable true)同时成立,而 EXE §3 第 3 条要求 client 自己做 bounded exponential backoff,VerificationPolicy 又有自己的 retry 预算(g3-verification-plan-impact-policy.md:27)。

**影响**: 第一点会让用户对一个 fatal + 「不得复用 session」的诊断点普通重试,重试必然再次失败或产生不可信结果。第二点会造成重试次数相乘(Policy retry × EXE backoff),以及 attempt lineage 里出现来源不明的重复 attempt,影响 `verify:g3:evidence` 的 attempt 记录完整性。

**建议**: BHV-4006 改为 `Retryable: false` 并把 "重建环境后重跑" 表达为一个显式 Quick Fix / Command 而非通用 retry;或在 presentation 层为该码位覆盖 action。VER §1 的「不覆盖」清单补一条 EXE:remote transport/quota/idempotency 失败保留 `EXE-xxxx`,并明确 retry 所有权归 VerificationPolicy,transport 层只做单次 bounded 恢复。

#### 契约不一致(inconsistency)

##### G3-L-IC-01 跨文档类型名与 CLI 动词漂移,且 16 份 G3 文档的 ProductGateStatus 仍写 Blocked by G2 Exit Gate

- **位置**: `specs/decisions/59.deterministic-scenario-replay-and-runtime-controls.md:8,102;specs/decisions/58.verification-evidence-provenance-and-retention.md:8,37;specs/decisions/63.verification-product-surface-diagnostics-and-ci.md:8,100-105`
- **严重度**: Low ｜ **类别**: inconsistency ｜ **分析维度**: `impl-mapping`

**详情**: 类型名漂移:ADR 59 line 102 写「每次 run 产生 bounded `BehaviorReplayRecord`」,而总编排 canonical artifact matrix(line 72)、`g3-deterministic-replay-runtime-controls.md:160,178,244,272,290`、milestone line 20,93,203 一律用 `ReplayRecord`;ADR 58 line 37 写 `VerificationEvidenceCandidate`,而总编排 line 73、`g3-verification-evidence-provenance-retention.md:45,99`、`g3-verification-adapters-product-ci.md:71`、milestone line 120、`verification-diagnostic-codes.md:130`(VER-4002)一律用 `EvidenceCandidate`。CLI 动词漂移:ADR 63 line 100-105 给出 `prodivix verify plan / run / upload / inspect`,而 `g3-verification-adapters-product-ci.md:232-238` 给出 `plan / explain / run / resume / cancel / promote / closure`,milestone V7 line 172 写「plan/run/resume/cancel/promote/closure commands」——ADR 独有的 `upload`、`inspect` 在下游两处均无归属。状态漂移:ADR 56-63 与 7 份子实施文档 + 总编排共 16 处仍写 `ProductGateStatus:Blocked by G2 Exit Gate`,而 `specs/roadmap/current-status.md:13`、`g3-closure-evidence.md:6` 与 milestone line 11-12 都已确认 G2 Exit Gate 通过、G3 进入 In Progress。

**影响**: 类型名漂移会在 V0 冻结 public API 时产生两个候选导出名,`grep` 检索契约实现进度时也会漏命中(本次审查即因 ADR 用了 `BehaviorReplayRecord` 而需要额外一轮检索)。CLI 动词漂移使 `upload`/`inspect` 的功能是否被 `promote`/`closure` 覆盖成为未决问题。ProductGateStatus 过期虽不影响实施,但它是这套文档自己定义的状态字段(milestone line 223-227 有专门的状态变更规则),16 处集体过期会削弱状态字段的可信度,也让读者误以为 G3 仍被 G2 阻塞。

**建议**: 统一为 `ReplayRecord` 与 `EvidenceCandidate`(下游用法占绝对多数且已进入诊断码文档),修订 ADR 58/59 的两处;在 ADR 63 line 100-105 补注 `upload`/`inspect` 与 `promote`/`closure` 的对应关系或直接对齐为实施文档的七个动词;把 16 处 `ProductGateStatus` 批量改为 `In Progress(G2 Exit Gate 已通过,G3 从 V0 开始)`,与 current-status.md 保持单一来源。

### 3.8 各维度整体判断与健康面

负面结论(「查过且是对的」)与发现同样重要,可避免下一轮重复投入。

#### `adr-core` — ADR 56-59 契约完整性

**整体判断**: ADR 56-59 在**架构立场**上是自洽且守住不变量的:Workspace 唯一作者态、Evidence 外置只读、可逆 Command/Transaction、Secret hard cut、retry 不覆盖失败,这几条在四份文档里被反复且一致地表述,与 AGENTS.md:25/34 无冲突。问题全部集中在**契约衔接的具体面**:Scenario(56)→ Plan(57)→ Evidence(58)的数据流有两处硬断裂——56 冻结的 lane/checkpoint/assertion/criticality 身份在将要落地的模型里不存在,而 57/58/62 都在消费它们;失败状态 taxonomy 被四处独立定义且互不兼容,`unstable` 甚至被同时定义为单 attempt outcome 与多 attempt 派生状态,而 Closure 只以 Evidence 为输入。identity/digest 链也未首尾相接:plan digest 含评估时刻、Evidence 绑定 plan digest,但跨 plan 复用规则空缺,导致增量验证在契约层要么不可能、要么 fail-open。fail-closed 语义总体偏严,唯一明确的 fail-open 缺口在 ADR 59:50-51 的「或降级为 advisory evidence」,它与 57:128「不能偷偷降级 required matrix」正面冲突。determinism 方面,只有 ADR 58:98-104 给出了可执行的 canonicalization 规则,Program/plan/control profile 的 digest 都停留在「byte-identical」口号且未指定 hash 算法,而这条链横跨四个 owner 与 Go/TS 两种语言。此外,control profile、fixture、visual baseline 三类作者态输入没有 owner document kind,而总编排文档要求 G3 开工前必须冻结 document kind——这一步现在冻结不了。这些都是**在写第一行代码前应当先在 ADR 层收敛的问题**,而不是实现细节。

**健康面**: 几个维度检查下来确实健康,有依据:\n\n1. **Owner 边界的正反两面都写清楚了,且与 AGENTS.md 不冲突。** ADR 56:41-42 明确列出 `@prodivix/behavior` 不拥有什么(Route matching、Data lifecycle、NodeGraph scheduling、Animation evaluation、DOM、Browser automation、ExecutionProvider、VerificationEvidence);56:172-174 显式规定依赖方向为「领域 contribution/adapter 依赖 `@prodivix/behavior` 的公开 descriptor contract」且「不反向 import Route、Data、NodeGraph、Animation 或 React/Vue package,避免领域环依赖」;ADR 58:142-153 单独给出 Backend service boundary。总编排文档 g3-behavior-verification-closure.md:82-92 的 owner 表把「明确不拥有」列成一等列。这与 AGENTS.md:25 的不变量一致,AGENTS.md 也已把 BehaviorScenario、VerificationPolicy 预登记为领域 owner 管理的文档。\n\n2. **Canonical Workspace 唯一作者态真相这条不变量守住了。** ADR 58:28-30 明确 Evidence「不属于 Canonical Workspace,不进入 Workspace replica、History、Outbox 或 publication projection」,并在 58:161-163 的拒绝方案里给出理由(append-only report/blob 会污染作者态 revision、同步和 Git projection);ADR 57:43-44、165 明确 Plan 与 Closure 是 derived projection「不写回 Workspace」「不能成为第二作者态」;ADR 58:138-140 把 baseline 采纳规定为「显式可逆 Workspace Transaction」,Evidence「只能建议 baseline update,不能自动改写」;ADR 59:160-162 拒绝把 browser storage/runtime snapshot 写入 Workspace。可逆 Command/Transaction 这条也守住了:ADR 56:46-48 规定创建、编辑、录制采纳、baseline 更新和删除「均进入可逆 Command/Transaction、Durable Outbox 与 Atomic Commit」。\n\n3. **Secret hard cut 是全篇最一致、最没有 fail-open 余地的部分,与 AGENTS.md:34 严格对齐。** ADR 56:143-144(不进 draft/Scenario/diagnostic/evidence)、58:64(不进 manifest)、58:125-131(schema 级 denylist + canary,且「canary 命中时整个 candidate fail closed,不能只删掉命中字段后继续标为 passed」)、59:66(「Secret/environment resolver 在 test/fixture mode 不可用」)、59:73-74(header/query/body/cookie/signed URL 禁止进入 control log/evidence)、59:111(ReplayRecord 不保存 Secret)。诊断层同步:`BHV-4004` 与 `VER-5002` 都是 `fatal` + 不可 retry,`VER-5002` 的 Developer notes 明确「message/meta 不回显命中 value;整个 trusted promotion fail closed」。四处独立表述互相加强,没有留下「删字段后继续」的路径。\n\n4. **Retry / flaky / immutability 三者之间闭合。** ADR 57:140-146 与 ADR 58:135-137 说的是同一件事且不打架:每次 retry 产生独立 attempt 与完整 lineage、retry 不能覆盖或删除先前 failure、错误归类或 policy/baseline 改变必须形成新 Plan/Evidence;两份文档的「拒绝的方案」(57:181-183「自动重跑失败直到通过」、58:169-171「重跑成功后覆盖失败」)也是同一立场的两次陈述。\n\n5. **ADR 57 对 planner 的 determinism 给的是可执行规则而非口号。** 57:43-44 与 122-123 明确禁止 planner 读 ambient current time、禁止生成随机 UUID,把评估时刻改为显式输入并要求记录,attempt/run identity 单独生成。这一条在同类文档里是少见的具体规则(问题不在这条本身,而在 Closure 侧没有同等待遇,以及该输入进入 plan digest 带来的副作用,见 findings)。\n\n6. **诊断码位与 ADR 的 fail-closed 断言对应良好,没有悬空引用。** ADR 57:128 引用的 `VER-3004` 在 verification-diagnostic-codes.md:112 有定义且语义一致(「不能在 runner/UI 静默裁剪 required cell」);`VER-3001` 的 Developer notes「不降级为 skipped」直接对应 ADR 57:98-99;`BHV-4005`「unsupported/partial control 不能生成可信 pass」直接对应 ADR 59 的 control profile 要求。BHV 与 VER 的职责切分(behavior-diagnostic-codes.md:19-24)也没有重叠。

#### `adr-surface` — ADR 60-63 契约完整性

**整体判断**: ADR 60-63 的文档层自洽度不错(状态标记、关联列表、拒绝方案都完整),但**契约层有三处会直接阻断实现的硬伤**。最严重的是 ADR 62 与它自己的实施文档 `g3-verification-adapters-product-ci.md` 定义了两份互不兼容的 adapter SPI:descriptor 除 `id` 外全部字段被改名或改型,输出类型从 `VerificationCheckReportCandidate` 变成 `EvidenceCandidate`,normalization 的执行方从 Core 挪到 adapter,而 `VerificationCheckFamily` 和 `VerificationCheckReportCandidate` 两个类型在全仓库都没有定义文档——V6 无法在这个状态下开工。

关于 60/61 与现有实现的差距:**Route 侧是真增量,NodeGraph 与 Animation 侧是破坏性重写**。`packages/nodegraph/src/nodeGraph.types.ts:10-46` 的每一个字段在实施文档 48-69 行里都被重命名或改型(`kind`→`flow`、`data`→`configuration`+`editor`、edge 从 node-id 字符串变成 port reference),Animation 则要在 `animation.types.ts:81-119` 的单 timeline 模型上加 composition/marker/motion intent。但这两个包的 wire 是三处手写副本(TS type、TS schema/codec、Go validator)加两处按字段名的 patch 白名单,`version: 1` 硬编码且 codec 直接拒绝其他版本,**没有任何迁移基础设施**——PIR 有 `PIR-v1.0..1.6.json` 快照链 + `pirMigrationRegistry.ts` + Go 侧 `pir_wire_migration.go` + `pnpm run pir:activate-wire`,nodegraph/animation 一个都没有,而 ADR 60/61 的关联列表都没引 ADR 39。

关于 62 的 matrix 规模:**分层规则本身写了,但收敛不可执行**。`VerificationPlanCell` 只有 targetId/surface/browserEngine 三个可读轴,motion/viewport/color-scheme/locale 全被压进不透明的 `controlsDigest`,导致 closure-evidence 逐行要求的 Motion 列和 ADR 62:127「每个cell独立报告」在类型层无法表达;更麻烦的是 reduced cell 何时 required,ADR 62:121、ADR 57:135、closure-evidence:51-56 给了三条互斥判定,而 planner 必须确定性。

63 的产品面差距分布不均:Execution Center 的拖拽/折叠/最大化/键盘 resize 已在 G2 完成(零工作量),但 `apps/cli` 是打印字符串的空壳(build/export 各 6 行,deploy 0 字节),ADR 63 的 CLI/CI 契约等于从零建 CLI,而里程碑把它和整个产品表面塞进同一个 V7。CI/adapter 侧的方向是对的(复用 `ExecutionTestReport`、`runtime-vitest`、Playwright、已有 OIDC workflow),但 Golden 的导出产物 harness 硬编码 chromium,Firefox/WebKit required cell 目前无执行路径。

**健康面**: 几个方面确实是健康的,给依据:

1. **ADR 63 的 Execution Center docked panel 要求已在 G2 兑现,是零工作量项。** `apps/web/src/editor/features/execution/ExecutionCenter.tsx:188-193` 已有 `collapsed` / `panelHeight` / `panelMaximized` 状态;`315-317` 行按 maximized 计算可见高度;`709-719` 行的分隔条带 `role="separator"` + `aria-orientation="horizontal"` + `onKeyDown={resizePanelWithKeyboard}`;`679-681` 行处理 `ArrowUp`/`ArrowDown` 键盘 resize;`95` 与 `353` 行把高度存进 localStorage 作为本地 UI preference。ADR 63:39「可拖拽/折叠/最大化的 docked IDE panel…layout preference 只保存为本地 UI preference」与 milestones:164 已完全满足。

2. **ADR 62「复用 G2 而不是另起一套」的方向与代码现状吻合。** `packages/runtime-core/src/executionTestReport.ts:91-102` 的 `ExecutionTestReport` 与 `packages/runtime-vitest/src/vitestExecutionTestReport.ts` 确实存在,ADR 62:57 明确保留这条路径;`tests/e2e/playwright.config.mts:47-59` 已配置 chromium/firefox/webkit 三个 project;`.github/workflows/docs-pages.yml:29`、`g2-managed-kms.yml:12`、`npm-packages.yml:15` 已在用 `id-token: write`,ADR 63 的 OIDC upload 不需要新建 CI 身份体系。这一维度不需要另起一套。

3. **ADR 60 对 CodeSlot 的硬性要求已经是现状,不是新工作。** `packages/nodegraph/src/nodeGraph.types.ts:31` 已是 `executor?: CodeSlotBinding`;`nodeGraphCodec.ts:251-261` 已经对 `data.kind === 'code'` 且带 `code`/`codeLanguage` 字段的节点 fail closed(「Code nodes must bind a Workspace CodeArtifact through executor; embedded source fields are not canonical」)。ADR 60:37 与 142 行「拒绝通用 JavaScript node」已被代码执行。

4. **ADR 60:74「`RuntimeStatePatch` 不等于 Workspace Patch」已经成立。** `nodeGraph.types.ts:5` 从 `@prodivix/runtime-core` 导入 `RuntimeStatePatch`,`nodeGraphExecutor.ts:209` 只做 `mergeRuntimeStatePatch`,executor 没有任何 Workspace 写入路径。ADR 60 的这条约束是在固化现状而非要求改造。

5. **ADR 61 在 Route 侧的改造面明显小于 Animation 侧,属于真增量。** `packages/router/src/routeTypes.ts:12-16` 的 `WorkspaceRouteRuntime` 是三个可选 ref 的开放结构,增加 enter/ready/leave/error transition binding 只需扩 `packages/router/src/routeCodec.ts:51` 的 `ROUTE_RUNTIME_KEYS`,不改变 manifest 形状,也不触碰 `WorkspaceRouteManifest.version`(它是 string 不是数字常量)。generation fence 原语也已有可复用实现:`packages/runtime-browser/src/browserAnimationEffectStore.ts:113,164-177,221-224`(虽然需要从单 lease 扩到多 contributor)。

6. **56-63 之间没有发现真正的 package/子系统 owner 冲突。** Plan/Policy=57、Evidence/Retention=58、runtime controls=59、产品表面=63,顶层划分是干净的。真正的重复出现在 adapter SPI(ADR 62 vs 其实施文档,见发现 1)、matrix 规则(57 vs 62 vs closure-evidence,见发现 3/4)和 motion 优先级(59 vs 61,见发现 5)。此外 Execution 底部面板的布局要求在四处各写了一遍(ADR 63:39、g3-animation-route-composition-reduced-motion.md:189、g3-nodegraph-typed-flow-debugger.md:228、milestones:164),这不是 owner 冲突但有措辞漂移风险,建议统一由 ADR 63 拥有、其余引用。

#### `impl-mapping` — 实施文档 ↔ ADR ↔ 里程碑映射

**整体判断**: 三层映射的骨架健康、缝隙致命。ADR 56-63 到 7 份子实施文档到 10 个 Gate 的归属关系完整无孤儿,里程碑与 closure evidence 的 10 个 Gate 逐项对齐,「9 里程碑 vs 8 文件」的数量差有合理解释(V8 归总编排、ADR 62+63 合并),这些都不是问题。真正的问题集中在两类:一是同名类型在 ADR 与实施文档之间被定义了两遍且互不兼容,`VerificationPlanCell` 的 cell=多 check(ADR 57)与 cell=单 check(实施文档 + Evidence 唯一键)之矛盾是 blocker,因为 plan digest、Evidence 主键与 Closure required 语义全部建在它上面;`VerificationAdapterDescriptor` 与 check kind/family 枚举同样双版本。二是 V0 这个「唯一允许的实施入口」被架空:它没有专属实施文档,而它声明必须在 V0 冻结的 verification-policy Command、adapter SPI、Evidence contract 被子文档分别排到了 V4/V5/V6,同时两个新 Workspace document 的 Go 后端 validator 没有任何文档承担 owner。此外里程碑顺序把 V2 排在 V3 之前,但 V2 的 NodeGraph/Animation 文档与 V1 的 Scenario current model 都已直接依赖 V3 的 scheduler 与 `BehaviorControlProfile`,存在真实的顺序倒置。建议在写第一行代码前先修 finding 1-5,尤其是 cell 模型与 V0 清单——这两项一旦选错,V4/V5 需要重写 schema。

**健康面**: 映射的骨架是健康的,以下几处经逐条核对确认无缺口。(1)Gate 三方对齐:milestone `g3-behavior-verification-milestones.md:210-219` 的 10 个计划 Gate 与 `g3-closure-evidence.md:34-43` 的 10 行 Gate manifest 在名称、数量、顺序上逐项一致,无多余项也无遗漏项;命名也与既有 `package.json:37-78` 的 `verify:g0/g1/g2` 惯例一致(有 aggregate `verify:g3`,对应 `verify:g2` 的 aggregate 写法)。(2)ADR→Gate 追踪完整:总编排 `g3-behavior-verification-closure.md:260-270` 的需求追踪表 9 行中,ADR 56-63 各作为唯一 owner 出现恰好一次,再加一行 V8 组合行,没有任何 ADR 缺 Gate 归属、也没有两个 ADR 争抢同一职责。(3)子计划索引无孤儿:`g3-behavior-verification-closure.md:248-256` 的 7 行索引精确覆盖 7 份子实施文档,没有存在于目录却未被索引的文档,也没有索引指向不存在的文档;ADR 62+63 合并到一份 adapters/product/CI 文档、V0/V8 由总编排承担,是「9 里程碑 vs 8 文件」数量差的完整解释(V8 作为 Golden 汇总由总编排承担合理,V0 的问题另见 finding 3)。(4)matrix 三方一致:ADR 62 的最小 Golden matrix(line 117-127)、milestone V6 的 Browser 维度(line 150)与 evidence 的 8 行 Golden matrix(line 49-58)在 Chromium 完整 / Firefox+WebKit critical subset 的分层上完全一致;evidence 表按 surface 差异化 required families(Preview 不含 performance、Export 不含 diagnostics/unit/integration、CI 全量)是有意设计而非漏项。(5)诊断码分层清晰:`specs/diagnostics/behavior-diagnostic-codes.md` 与 `verification-diagnostic-codes.md` 的分段(BHV-10xx..90xx / VER-10xx..90xx)与 ADR 63:84-91 声明的两个 domain 一致,两份文档各自的「不覆盖」清单相互指认且与 `test-diagnostic-codes.md:63-64` 的 TST 边界双向对齐,`specs/diagnostics/README.md:108-109` 也已登记两个前缀。(6)子文档结构统一:7 份子文档全部具备「目标 / 范围 / 非目标 / 实施阶段 / 验证证据(计划 Gate + 必须覆盖) / 风险与停止条件 / 验收标准」同构七段,且各自的「必须覆盖」清单与所属里程碑的「必须完成」条目大体逐条对应(V1↔B1-B4、V3↔R0-R4、V4↔P0-P3、V5↔E0-E4 均可逐项追溯,未发现里程碑有而实施文档完全缺失的交付项)。

#### `v0-readiness` — V0 就绪度:扩展点现状

**整体判断**: 现有代码对 V0 的准备度是「一半开放、一半硬编码」。开放的一半质量很高：Workspace 的 document→domain 绑定与 patch root 由 `workspaceContractRegistry.ts` 单一注册表驱动并有 `satisfies Record<WorkspaceDocumentType, ...>` 编译期强制；Command domain 与 History domain 是派生类型；namespace→domain 是前缀规则表；VFS 挂载、Semantic Index、Compiler、Export 全部对未知 kind 惰性。硬编码的一半集中在两个方向：一是**内容校验**在 TS 三处（workspaceDocumentValidation / workspaceCodec / workspaceCommand）与 Go 两处（store_helpers / patch）平行重复，且对未覆盖的 kind 一律 fail-open 放行，与 V0「fail closed」的完成条件正相反；二是 **Backend 完全是 TS 契约的手抄副本**，domainHint 白名单、document 域列表、namespace→domain、docType→domain、capability map、doc_type CHECK 约束共 6 处需要同步，且其中 DB 约束写在已应用的 migration version 1 里，直接改字面量对存量库无效。契约层面还有两个必须先解决的定义问题：`verification-policy` 的「唯一 project-level document」在 Workspace 内没有任何基数约束机制；实施文档列出的 `core.behavior.create-scenario` / `core.verification.create-policy` 与内核「结构性写入必须走 core.workspace + domainHint: workspace」的既有约定直接冲突，不先澄清就无法动工。工作量判断：需要修改约 18 个既有 TS/脚本文件 + 8 个 Go 文件 + 5 份 spec，新建约 30-40 个文件（两个包各 10-14 个，参照 `packages/data` 规模；两个 Go validator；一个 TS→Go 契约投影脚本与 generated JSON；`verify:g3:boundaries` 脚本与 CI workflow）。真正的难点不是文件数，而是四条 fail-open 校验链的收敛、DB migration 版本陷阱、以及 TS↔Go 契约目前完全没有一致性 Gate——这三项如果不在 V0 一次性解决，后续 V4/V5 的 plan digest 确定性与 Evidence 可信性都会建立在不可靠的基座上。

**健康面**: 多个关键扩展点确实是为「新增一种 document kind / 一个 Command domain」设计的，不需要改核心：\n\n1. `packages/workspace/src/workspaceContractRegistry.ts:112` 的 `} satisfies Record<WorkspaceDocumentType, WorkspaceDocumentPolicy>)` 是全仓唯一编译期强制点——往 WORKSPACE_DOCUMENT_TYPES 加一项而不补 policy 会直接 tsc 失败，因此 document→command domain 绑定与 patch root 白名单是单一真相且不会漏。`workspaceCommand.ts:1299-1312` 的 `getWorkspaceDocumentDomain` 校验也完全由这张表驱动。\n2. domain 联合类型是派生的：`WorkspaceDocumentCommandDomain = Exclude<WorkspaceCommandDomain, 'workspace' | 'route'>`（workspaceContractRegistry.ts:31-34）、`WorkspaceHistoryDocumentDomain = WorkspaceDocumentCommandDomain`（workspaceOperation.ts:12）。在 WORKSPACE_COMMAND_DOMAINS 加 'behavior'、'verification' 会自动传播到 History scope、Operation domain 与 Web 快捷键类型，无需逐处修改。\n3. namespace→domain 是规则表驱动：`WORKSPACE_COMMAND_NAMESPACE_DOMAIN_RULES`（114-132 行）+ `resolveWorkspaceCommandNamespaceDomain`（171-176 行）用 `namespace === prefix || namespace.startsWith(prefix + '.')` 匹配。新增 `core.behavior`、`core.verification` 两条即可，且与既有前缀无包含关系（`core.workspace-sync` / `core.workspace` 因为要求 `.` 分隔也不冲突），不存在顺序陷阱。\n4. VFS 挂载完全 kind 无关：`planWorkspaceDocumentAtPath` / `createWorkspaceDocumentAtPathCommand`（workspaceDocumentFactory.ts:163-371）只依赖 `document.id` / `document.path`，`workspaceVfsIntent.ts:222-230` 的 createDocument 已经用 `'type' in payload ? payload.type : 'code'` 参数化。新 kind 的创建/重命名/删除可以零成本复用现有 `core.workspace.document.*` 通路与 `core.workspace.document.create@1.0` capability。\n5. Diagnostic domain 扩展成本极低且部分 fail-closed：只需改 `packages/diagnostics/src/diagnostic.types.ts:3-17` 的联合类型与 `isDiagnostic.ts:14-29` 的 `PRODIVIX_DIAGNOSTIC_DOMAINS` 两处；而新增 DiagnosticTargetRef kind 会让 `buildDiagnosticPresentation.ts:97-135` 的 exhaustive switch 编译失败，属于正确的 fail-closed 行为。\n6. 所有下游读投影都是「正向 filter」而非「穷举 switch」：`createWorkspaceSemanticIndexFromSnapshot.ts:245,320,361`、`prodivix-compiler/src/react/workspaceProject.ts:1159`、`workspaceGitAssetProjection.ts:23`、`workspaceSemanticDiff.ts:228-288` 都是 `document.type === 'x'` 命中才处理。新增两种 kind 在 V0 阶段对 Semantic Index、Compiler、Export、Git projection 是惰性的，不会打破任何既有 G0/G1/G2 Gate。\n7. TS→Go 契约投影已有可复用模板：`scripts/sync-nodegraph-wire-contract.mjs` 从 `packages/nodegraph/src/wire.ts` 生成 `apps/backend/internal/platform/nodegraphcontract/current_schema.generated.json`，check 模式已挂在 `pnpm lint` 里。V0 不需要发明新机制，照抄即可。\n8. 新包骨架有清晰参照：`packages/data`（33 个源文件、package.json 依赖仅 authoring + runtime-core、含 dataWireCodec.ts）与 `packages/nodegraph`（含 wire.ts 子入口）可以直接作为 `@prodivix/behavior` / `@prodivix/verification` 的目录与构建脚本模板。

#### `stop-conditions` — 停止条件与前置依赖稳定性

**整体判断**: V0 停止条件所列的五项前置依赖,逐项核实后判定为:G2 exact snapshot「基本稳定,有两处应在 V0 顺带清理的缺陷」;ExportProgram「类型契约稳定,但 planner 的路径预留顺序存在会静默产出错误工程的缺陷」;SourceTrace「未稳定」;Browser/Remote provider「Remote 稳、Browser 弱,缺共享 conformance kit,V3/V6 所需扩展被低估」;controlled Vue target「未稳定,且是五项中最严重的」。因此停止条件的结论方向是对的——V2/V6/V8 确实应当推迟,SourceTrace 与 Vue target 两项各自单独就足以构成推迟理由。Vue target 的问题不是零星 bug 而是结构性的:它并未按 ADR 31:344 消费同一 ExportProgram,而是把全部 PIR 文档折叠进一个运行时解释器模块,这使 V1/V2/V6 反复要求的「React/Vue target conformance」在当前实现上不可能等价达成;prompt 提到的 `kind: 'subscription'` 只是这条独立编译路径上的一个可见症状,它之所以存活,是因为覆盖 subscription 的 Vue 用例不 typecheck、而真正跑 `vue-tsc` 的 Gate 的 fixture 没有 subscription——两者恰好互补漏掉。SourceTrace 的问题同样是结构性的:compiler 与 diagnostics 维护着两套不兼容的 target ref 与 span 形状,桥接函数用 default 分支把 pir/nodegraph/animation/route-* 全部塌缩成 workspace 粒度,而 PIR/Route/NodeGraph/Animation 根本不产生 sourceSpan,消费端又对多 trace 直接放弃导航。最后一个也是最可操作的问题在文档层:这条停止条件没有任何可执行判定入口,`g3-closure-evidence.md` 的 Gate manifest 也没有为这五项预留证据行,导致「是否稳定」完全依赖人工判断——建议在 V0 阶段就补一个 `verify:g3:prereq` 聚合 Gate 并写入停止条件,否则这条停止条件在实现推进时不会真正生效。

**健康面**: 这一维度并非全面告急,有四块确实健康,依据如下。(1) exact snapshot 的后端权威链是真 fail-closed:`apps/backend/internal/modules/remoteexecution/handler.go:142-152` 对 workspaceID/snapshotID/partition 逐项校验并设上限,`store.go:298-346` 在持久化时二次校验并用 `ON CONFLICT ... WHERE` 全字段比对实现强幂等,`store_test.go:374`(`TestGetExecutionAuthorityAndDataDocumentRequireExactSnapshotPartitions`)与 `:404` 的 drift 用例真实覆盖漂移拒绝;Data/Server gateway 也确实按 `authority.PartitionRevisions["document:<id>:content"]` 取精确修订(`data_gateway.go:127,154`、`server_function_gateway.go:585`)。(2) ExportProgram 的类型契约本身完整且单一 owner:`packages/prodivix-compiler/src/export/types.ts:423-440` 覆盖 roots/modules/styles/assets/artifacts/files/sources/deployments/runtimeRequirements/dependencies/routes/diagnostics/metadata,`ExportProgramContribution`(:442-458)提供干净的增量组装入口,`programBuilder.ts` 与 `ProductionExportPlanner` 是两 target 共用的,origin/license/deployment 汇总与 `.prodivix/origins.json`、`.prodivix/licenses.json`、manifest 产物由 planner 统一生成(`planner.ts:740-772`);ADR 31:320 的类型建立项已标 [已完成],这一层不需要为 G3 重做。(3) Vue 独立产品 Gate 是真实端到端验证而非快照比对:`packages/golden-conformance/src/goldenG2VueCatalog.browser.test.ts:64-70` 断言 `completedCommands` 必须依次包含 `install/typecheck/test/build/browser-smoke`,即真的执行 `pnpm install`、`vue-tsc --noEmit`、`vitest`、`vite build` 并用 Chrome 验证 CRUD 与命名 outlet;`verify:g2:vue-product` 也确实挂在 `.github/workflows/g2-data-closure.yml:137` 上。问题不在 Gate 强度,而在 fixture 覆盖面。(4) Remote provider 的 conformance 面扎实:`packages/runtime-remote/src/remoteExecutionProvider.conformance.test.ts` 的 19 个用例中大多数是负向的——provider identity 独立、result identity drift、reconnect 游标重放、授权丢失、network/binding 拒绝、cancellation 与陈旧事件、drifted provider contract、Build 无 verified bundle、Preview unhealthy readiness、Test 声称 live network、失败报告保留等,正是 G3 V3「divergence/isolation」所需的断言风格,可直接作为共享 conformance kit 的模板。另外 `specs/roadmap/g2-closure-evidence.md:470-485` 诚实地把 AWS 真实云 evidence 与若干 post-G2 边界标为未取得或明确排除,没有用本地通过冒充远端证据,这个记录纪律值得在 G3 沿用。

#### `evidence-gate` — 证据模板与 Exit Gate 可验收性

**整体判断**: G3 证据模板的**方向**是正确且优于前三阶段的:它是唯一在实现前冻结的退出证据结构,状态词汇表、negative evidence 清单和「截图不能替代 digest」的条款都比 G0/G1/G2 严格,Gate 命名在三份文档间无分叉,manifest 要求的各类 digest/identity 也都能在 ADR 与实施文档中找到明确 owner——「字段没有产生者」这一担忧基本不成立。真正的问题集中在**可机械判定性**上:Plan/Closure digest 的两个决定性时间输入(`policyEvaluationInstant` 与 closure evaluation instant/retention view)没有进入 Evidence identity,导致所有以「digest 相等/可重算」为基础的 Exit 条件都退化成自证;Required Golden matrix 的表头只有 6 列,却要承载 10 维的 plan cell identity 和 milestone 的 Data/Auth/Recovery 三行维度,并且「逐 cell 记录 5 个属性」在数百到上千 cell 的规模下不可能用 Markdown 维护,模板却没有要求任何机器生成的 closure manifest 工件。与 G2 对比有三处明确倒退:「run URL **或**本地命令」的「或」与 ADR 58 的 `local-unattested` trust hard cut 直接冲突;G2 每个 Gate 都记录的 files/tests 规模计数与「延后外部 evidence / post-G2 边界」章节在 G3 模板中都消失了;而 G3 新增的 exemption、advisory budget 裁剪、retry/unstable 三条合法降级通道,既没有进入 Evidence identity,也没有 G0 `g0-closure-evidence.md:123` 那样的反作弊条款兜底。Exit Gate 七条中,第 5 条「无 editor-private state 或 framework-private canonical fork」没有映射到任何 Gate,尽管仓库已有 `scripts/check-editor-hard-cut.mjs` 这样的现成机械化先例;「禁止记录 Secret/OIDC assertion/credential/cookie」目前也纯属文字约束——`.github/workflows/security.yml` 只有 dependency audit 与 CodeQL,仓库没有任何 secret 扫描,而同一句里的「raw artifact locator」禁令又与 G2 靠 artifact id + ZIP digest 建立可核验性的成功做法相冲突。这些都是在写第一行 G3 代码之前就能低成本修掉的模板缺陷,一旦等到 V8 再改,就会变成用已有结果反推标准——恰恰是这份文档 :12 声称要避免的事。

**健康面**: 以下几点检查下来是健康的,给出依据:

1. **时序上比 G0/G1/G2 都严**:G3 evidence 是唯一在实现开始前就冻结的证据模板(`g3-closure-evidence.md:12-14` 「本文预先冻结 G3 Exit Gate 的证据结构，避免实现完成后用零散日志、绿色徽章或一次本机运行倒推验收标准」)。G0(`g0-closure-evidence.md:10` 最终验证记录 2026-07-13)、G1、G2 都是事后书写。这从结构上消除了「用已有结果倒推标准」的最大风险。

2. **状态词汇表是对 G2 实战经验的正确提炼**:`g3-closure-evidence.md:89-94` 定义 `Not Run` / `Failed` / `Configured / Evidence pending` / `Passed` 四值。其中 `Configured / Evidence pending` 正是 G2 用来处理 A14 AWS 未取得 live run 的真实状态(`g2-closure-evidence.md:266-270`),而 G0/G1 只有二值。这是明确的严格度提升。

3. **Gate 名称三处完全一致,无分叉**:`g3-closure-evidence.md:32-43` 的 10 个 Gate、`g3-behavior-verification-milestones.md:210-219` 的计划 Gate 入口、`specs/implementation/g3-behavior-verification-closure.md:275-285` 的计划 Gate 列表,三份文档字符级一致(`verify:g3:boundaries` … `verify:g3`),没有出现命名漂移或第二套入口。

4. **manifest 字段基本都有明确 owner,「无产生者字段」问题不成立**(除发现 #1 指出的两个时间输入):`semantic/provider/compiler/planner digests` 由 planner 产出并写入 Plan(`specs/implementation/g3-verification-plan-impact-policy.md:160`);adapter registry digest 由 registry entry 产出(`specs/implementation/g3-verification-adapters-product-ci.md:88`);`ImpactSet` digest 由 `VerificationImpactSet.digest` 承载(`g3-verification-plan-impact-policy.md:58`);Closure digest 由 Closure evaluator 确定性产出(`同文件:229`);fixture/control/baseline/toolchain/target/browser/sandbox identity 全部落在 Evidence manifest 的 identity chain(`specs/implementation/g3-verification-evidence-provenance-retention.md:93-97`)。这一维度的契约是完整的,缺的是执行层代码而非 owner 定义。

5. **negative evidence 覆盖面是 G0-G3 中最强的**:12 条(`g3-closure-evidence.md:62-73`)显式覆盖 selector fallback、漏测、降级 skipped、drift、fencing、adapter drift、Secret、伪造 attestation、不兼容比较、retry 掩盖失败、过期证据、production probe 泄漏。G0 只有一列「不足以代替的证据」(`g0-closure-evidence.md:76-87`),G2 只有每节末尾的「当前声明边界」。问题在于绑定方式(见发现 #7),不在覆盖面。

6. **明确挡住了薄证据**:`g3-closure-evidence.md:87` 「截图/视频只能证明产品表面，不能替代 canonical digest、自动化 Gate、negative behavior 和 Evidence provenance」,以及 `:13-14` 「不得把 contract、状态切换或文档存在解释为 G3 milestone 已实现或 Passed」。这两句直接封死了 G1 evidence 那种 39 行、无 run link、无 commit 的写法重演。

7. **G2 Exit baseline commit 已锚定**:`g3-closure-evidence.md:8` 记录 `3f3047b895cf2806a0f8a6f7ecf4d7ab4ede0184`,与 `g2-closure-evidence.md:444` 一致,起点可核验。

#### `diagnostics` — BHV/VER 诊断契约与工具链就绪度

**整体判断**: 两份新码表本身写得比仓库里多数既有码表更严谨——结构与生成器解析器完全兼容、分段合规、meta 安全条款具体、与 TST 的边界双向闭合。真正的问题不在文档内部,而在文档与工具链/共享类型之间的接缝。

最关键的一点是:`pnpm docs:diagnostics:check` 现在返回 EXIT=0、`Checked 318 diagnostic pages.`,但这是漏报不是健康。`scripts/generate-diagnostic-docs.mjs:15-29` 的 `domainOrder` 硬编码 13 个域,BHV/VER 连同已有的 DAT/TST/EXE/AST/SVR 全部在检查之外——后 5 个域在代码中已真实发射 63 个 distinct code 却没有一页文档、没有一条校验。G3 若照此推进,`verify:g3:boundaries` 声称的 \"diagnostic hard cut\" 没有任何工具背书。

其次是三处共享类型的结构性阻塞,全部不在任何 G3 实施文档的视野内:`buildDiagnosticPresentation.ts:185-186` 把 `exemptable` 硬编码为 `domain === 'ux'`,使 VER 的 exemption 入口在 presentation 层不可能实现;`DiagnosticTargetRef`/`DiagnosticSurface`/`DiagnosticPlacement` 完全没有 Scenario/step/Plan cell/attempt/Evidence 的表达,而该 union 的 kind 在至少 6 个文件(含 remote execution wire codec)被穷举复制;`apps/web/src/infra/api/apiClient.ts:71-74` 对未知 domain 静默降级为 `'backend'`,会让后端返回的 `VER-5002`(Secret 检出,fatal)被无声改标——fail-open,与 VER 规范的 fail-closed 姿态相反。

契约层面还有两处会在实现时产生归属争议:BHV-2001/2002 与 SEM-2001/2003/2004/2005 语义一一重叠且 severity 冲突(SEM 全 warning、BHV 是 error),而 BHV 的「不覆盖」清单漏掉了 SEM;ADR 56:120 用「`DiagnosticTargetRef` 可表达」定义 Scenario 可持久化 target,但该 union 含 `runtime-dom` DOM 兜底,与它自己第 116 行禁止 CSS/XPath 的条款直接矛盾,使 g3-closure-evidence 的 \"无 selector fallback\" negative evidence 在契约层就不成立。

最后是一个必须在 V0 之前决定的顺序问题:现在接入生成器会向用户文档站发布 32 个零实现的错误码页,不接入则 `createDefinition`(diagnosticShared.ts:197)硬编码的 docsUrl 会产生 32 条死链——生成器没有 `Status: reserved` 概念可以区分两者。V0 checklist 第 36 行那一行「diagnostic domain、target 和 registry」严重低估了这些工作量。

**健康面**: 健康的部分有四处,都有具体依据。

一、**两份新码表的 markdown 结构与现有生成器完全兼容,是 21 份码表里接入成本最低的两份**。`parseStandardSpec`(scripts/generate-diagnostic-docs.mjs:148)的标题正则是 `/^### \\`([A-Z]+-\\d{4})\\` (.+)$/`,BHV/VER 的 `### \\`BHV-1001\\` BehaviorScenario 无效` 形式精确匹配;字段正则 `/^- ([^:]+):\\s*(.*)$/`(第 171 行)所需的 `Severity`/`Stage`/`Retryable`/`Trigger`/`User action` 五个 key 两份码表全部齐备且拼写一致,反引号会被第 181-185 行的 `replaceAll('\\`','')` 正确剥离。作为对比,`asset-diagnostic-codes.md:16-24`和`execution-diagnostic-codes.md:19-33`用的是表格式,生成器解析结果为空。接入只需在`domainOrder`(第 15-29 行)和 `domainInfo`(第 31-111 行)各加 2 项。

二、**码位格式与前缀无冲突**。`validateDiagnosticsShape`(第 463 行)的 `^${domain}-\\d{4}$` 校验对 14 个 BHV 码和 18 个 VER 码全部通过。`BHV`/`VER` 三字母前缀与现有 18 个前缀无碰撞;主审查者提到的 `SERVER-` grep 噪音只影响检索,`WKS-EXPORT-SERVER-PROFILE-INVALID` 这类字符串不是 `VER-\\d{4}` 形态,不会造成码位歧义。分段模型也合规:README §7(第 128-141 行)允许「域内可以根据实际链路调整分段,但必须在对应码表中说明」,BHV §2(第 33-40 行)与 VER §2(第 37-45 行)都给出了完整段位表;VER 使用 `60xx` 段并非首创,`API-6001`/`API-6010` 已在用。

三、**TST ↔ BHV/VER 的边界是双向声明的,这在本仓库码表里少见**。`test-diagnostic-codes.md:21-22` 明确「G3 `BehaviorScenario` 的 authoring/compile/replay failure,使用 `BHV-xxxx`;`VerificationPlan`、adapter、`VerificationEvidence` 与 Closure failure,使用 `VER-xxxx`」,第 60-66 行的 §5 G2/G3 边界进一步说明 TST-5001/5002 不创建 Scenario identity、不自动持久化为 Evidence;BHV §1 第 3 条反向指回 TST。ADR 63 第 86-87 行也重申「`TST-5001/5002`继续表达一次G2 Workspace Test job。Verification adapter可以将其关联到check,但不得改写原code」。三处一致,不会产生归属争议。

四、**VER 正确避开了 \"一个测试失败码吞掉所有 product finding\" 的反模式**。verification-diagnostic-codes.md:20-22 明写「工具/领域内部诊断继续保留自己的 code,并通过 Plan cell/attempt correlation 关联;`VER` 不用一个『测试失败』码覆盖所有 product finding」,`VER-4001` developer notes(第 128 行)再次强调「assertion/product finding 使用其 normalized rule/code;本码描述 adapter boundary 失败」。两份码表的 meta 安全条款(BHV §4:170-174、VER §4:211-215)也与 README §3 的 `meta` 字段要求和 `asset-diagnostic-codes.md` 头部禁令一致,且比多数既有码表更具体(逐条列出禁止的 DOM handle、cookie、header、artifact locator、OIDC assertion)。

#### `scale-risk` — 规模与风险评估(对比 G2 实绩)

**整体判断**: 以 G2 实绩为刻度：G2 区间（`0ff417bb..3f3047b8`，即 G1 收口到 G2 Exit）共 1,039 个文件、205,192 行新增、5,032 行删除，新建 14 个 package/app（其中 4 个是独立部署 app：remote-runner-worker 12,777 行、control-plane 7,039 行、asset-delivery-host 5,550 行、remote-preview-host 933 行），落地 39 个 `verify:g2:*` script key、6 个 G2 专属 workflow、9 份 g2 实施文档，本机 aggregate 耗时 596.1s；作为对照 G1 区间为 859 文件 / 97,352 行。G3 的声明交付面是 8 份 ADR（1,488 行）+ 8 份实施文档（2,472 行）+ 9 个 milestone + 10 个计划 Gate + 9 个 check family + 8 行 Golden matrix，目前 `verify:g3` 相关 script key 为 0。我的判断是 **G3 的原始代码量约为 G2 的 1.0-1.3 倍，但风险加权工作量约为 G2 的 1.5-2 倍**：向上的因素是两个新领域包（behavior = model+registry+compiler+recorder+runtime；verification = impact+policy+plan+SPI+evidence+retention+closure）单个契约面都超过 G2 最大的新包 runtime-remote（18,952 行），deterministic controls 在 runtime-core 中零基础（全仓 grep `LogicalClock|ClockPort|virtualTime` 仅命中一个无关测试文件），NodeGraph 需从现有 1,532 行 src 扩张 6-10 倍并做破坏性 migration，Evidence plane 需新增 ≥10 张逻辑表（后端现共 38 处 `CREATE TABLE`），以及 7 个领域 owner × (trigger/action/observation/impact contributor/SourceTrace) ≈ 35 个集成面；`apps/cli` 更是近乎绿地（现仅 6 个源文件 cli.ts/build.ts/deploy.ts/export.ts/logger.ts），V7 却要求 7 条带版本化 JSON/NDJSON 与 cursor resume 的新命令。向下的因素是 G3 不新建独立部署 app（G2 这部分约 26k 行），且 golden-conformance matrix harness、ExecutionProvider/Session、SourceTrace、Vue controlled target、Playwright 三浏览器配置可直接复用。真正拉高风险倍数的不是行数，而是性质差异：G2 的硬骨头（rootless sandbox、KMS/MRK、regional DR、ClamAV/YARA-X）都是“集成已知可用的外部技术”，G3 的硬骨头（跨浏览器 deterministic replay、byte-stable plan digest、跨框架语义等价、Evidence 原子幂等 promotion）没有现成答案；更关键的是 G3 要自举——必须用普通 Vitest/Playwright 去验证一个正在被建造的验证系统。当前最紧迫的不是排期而是两个 V0 入口级 blocker：ADR 56 与 scenario 实施文档的 `BehaviorScenario` 结构性冲突，以及 control profile / fixture / baseline 三类被引用作者态输入无 owner——这两条不解决，V0 写下的第一个 codec 就是错的。

**健康面**: 三处明确健康，有依据：

一、证据模板的“先冻结后实现”纪律是真实有效的，不是形式主义。`specs/roadmap/g3-closure-evidence.md` 在零实现的前提下已预先冻结 10 个 Gate（第 32-43 行，全部 `Not Run`）、8 行 Golden matrix（第 49-58 行）、12 条 required negative evidence（第 62-73 行）和 7 项 product journey evidence（第 77-85 行），并在第 89-95 行给出 `Not Run`/`Failed`/`Configured / Evidence pending`/`Passed` 四态定义；milestone 第 221-227 行进一步规定 “ADR/implementation 文件存在只代表 contract Accepted，不代表 Implemented”“workflow 已配置但没有可信远端 Evidence 时写 Configured / Evidence pending”。这套机制正是 G0/G1/G2 evidence 可审计的原因，也是本次能一眼确认 “G3 实现量为零而文档自洽” 的直接原因。

二、可复用的 G2 底座是实打实的，不是纸面复用。已核实存在：`packages/golden-conformance` 已有 7 个 `test:g2-*` matrix 脚本与 goldenG2ExecutionMatrix / DataTargetMatrix / DataSecurityMatrix / AuthServerMatrix / BinaryAssetTargetMatrix / VueTarget / VueCatalog 共 33 个源文件（6,445 行 G2 增量），G3 的 adapter matrix 可以直接沿用这套 harness 形状；`apps/web/src/editor/features/execution` 已有 53 个文件含 ExecutionCenter、executionSourceTraceModel、executionConsoleModel、executionNetworkModel、workspaceExecutionSourceNavigation，V7 的 Runs/Execution 复用要求（adapters 文档 200 行 “Runs：cell/attempt progress，复用 Execution Center”）有真实落点；Playwright 的 chromium/firefox/webkit 三 project 已配置（package.json:80-83）；`packages/assets` + `apps/asset-delivery-host`（G2 共 9,879 行增量）是 Evidence artifact content-addressed store 的直接先例。

三、Owner 边界与依赖方向定义得足够机械化，V0 的 boundary Gate 可以自动化。`specs/implementation/g3-behavior-verification-closure.md:82-92` 的 owner 表带有 “明确不拥有” 一列（例如 `@prodivix/behavior` 明确不拥有 “Workspace persistence、browser driver、Evidence store”，`apps/web` 明确不拥有 “domain contract、plan selection、证据可信性判断”），第 96-113 行的 mermaid 给出单向依赖图，第 65-75 行的 Canonical artifact matrix 逐项标注 owner/可变性/身份绑定/禁止承载。这与仓库已有的 `scripts/check-core-package-boundaries.mjs`、`scripts/check-editor-hard-cut.mjs` 是同构的，`verify:g3:boundaries` 可以低成本落地。同样健康的是 8 份实施文档的“风险与停止条件”都是 fail-closed 的具体判据而非愿望（例如 replay 文档 278-283 行、nodegraph 文档 294-299 行、plan 文档 296-302 行）。

#### `blockers-from-audit` — 本轮静态审查发现对 G3 的阻碍

**整体判断**: 本轮 175 条已验证发现中,有约 25 条会直接阻碍或显著抬高 G3 实施成本,且它们高度集中在三个 G3 最依赖的平面上:确定性序列化(11 条 determinism 发现 + 全仓库 163 处非测试 `localeCompare`)、Remote/Preview 执行表面(H-C-07/H-CV-01/M-C-03/M-C-04 四条独立 fail-closed 缺陷)、以及 Durable Outbox 与三方合并(H-SI-01/02/04、H-DET-01、M-SI-05 五条会导致永久停滞或静默丢数据)。特别值得警惕的是,报告中多条 determinism 发现之所以被评为 Low,理由正是「可复现产物属于 G3 这一未来阶段而非当前要求」(见 L-DET-03 验证备注)—— 也就是说 G3 是这批债务的**指定接盘方**,V4「byte-stable plan digest」与 V5 evidence digest 无法在现有 `workspaceCodec.ts:605` 之类的区域设置敏感排序之上成立。同时 G3 里程碑文档自身已经把部分前置写进 V0 停止条件(milestones:41-42「controlled Vue target 未稳定前,不进入 V2/V6/V8 产品 closure」),而 Vue target 当前既有已复现的构建破坏(H-C-03)又缺 CI 浏览器门禁(M-CI-01),该停止条件事实上尚未满足。建议的前置修复顺序为:**P0(V0 之前)** 1) 统一 canonical 路径的码点比较器并加 lint 禁令 2) 修 H-SI-01/H-SI-04/H-DET-01 三条 outbox 永久停滞缺陷并就 Scenario `steps` 顺序语义做出 M-SI-05 决策 3) 恢复 `apps/web` 的 `strict`;**P1(与 V0/V1 并行)** 4) Remote 表面四条(H-C-07 优先)5) Vue target 三条 6) 导出入口链 H-C-04 7) lint/门禁基建 M-BC-01 + 元门禁;**P2(V3/V5/V2 各自设计前)** 8) M-SEC-09 base64 机密守卫盲区 9) runtime-core 保留模型 M-RL-02/M-SI-03 10) Animation M-C-19/M-C-09。P0 的排序依据是成本曲线而非严重度 —— 这三项一旦被 V4 plan digest、V5 immutable Evidence 或 V7 新 UI 表面固化,返工成本会从「改几个比较器」变成「作废全部已记录 digest 与 Evidence」。

**健康面**: 健康部分(有依据):(1) 静态门禁基线扎实 —— 报告 3 节记录 `pnpm turbo run typecheck`、`pnpm lint`、`go vet ./...`、`gofmt -l .` 以及 4 项仓库自有架构门禁(core-package-boundaries / editor-hard-cut / pir-current-boundary / property-test-names)全部通过,3.1 节实测 `as any` 0 处、`@ts-ignore` 0 处、`@ts-expect-error` 0 处、`eval(`/`new Function(` 0 处、Go `_ = err`/`//nolint`/`interface{}` 0 处。这意味着 G3 新建 `@prodivix/behavior`、`@prodivix/verification` 可以直接继承 `tsconfig.base.json:13` 的 `strict: true` 基线与既有边界门禁框架,V0 的「package ownership/dependency/boundary Gate」不需要先做类型债清理。(2) 报告方法论对 G3 有直接可用价值 —— 175 条全部经对抗验证(200 条原始声明中 25 条被驳回),多条附有实际执行代码的验证备注,可直接作为 G3 回归用例的素材而无需重新复现。

明确**不应**绑定为 G3 前置的发现(避免把全部技术债挂到 G3 上):X-SEC-01(plugin-protocol `__proto__` 原型污染,Critical —— 严重度最高但属于插件运行时协议层,与 Behavior/Verification 平面无交集,应作为独立安全修复立即处理,而不是 G3 里程碑的一部分);H-C-01(data gateway 重试策略 CPU DoS);H-C-02(router 同级比较器不自洽);H-C-05(GraphQL offset 分页 JSON Pointer 误用);H-C-06(`scripts/start-all.sh:211` 构建库包而非 `./cmd/server`);H-SEC-01(GitHub installation 越权);H-SEC-02(`PdxIframe` 无默认 sandbox);H-SEC-03 / M-SEC-06(esm.sh 未固定版本 ESM);M-SEC-01 / M-SEC-10(LLM API key 明文存 localStorage);M-SEC-03(execution_environments.id 客户端提供);M-SEC-04(生产 gin debug 模式泄露 token 到日志);M-SEC-08(deploy/.env 权限);M-MS-01(迁移单事务 2 分钟超时);M-C-10(发布 component/nodegraph 项目 500);M-C-12(privateHostname 误判 fc/fd 前缀);M-C-17/M-C-18(TS 导出符号碰撞、radix 未外部化);M-RL-01/M-RL-03/M-RL-04;M-EH-07(start-dev-postgres.ps1);以及 3.3 节的依赖漏洞(`react-router` 升 `^8.3.0`、`dompurify` 需 pnpm overrides)。这些都是真实问题、值得排期,但它们既不进入 G3 的 digest/determinism 链路,也不属于 V0-V8 任何里程碑的验收面,把它们列为 G3 前置只会稀释真正的阻塞项。另有两条边界情况需要说明:M-A11Y-01(PdxTree 的 `aria-expanded` 位于兄弟按钮,axe 报 `aria-required-children` critical)与 V6「accessibility automated + keyboard/focus journey」、V7「accessible label」相关,但 PdxTree 处于 lab 成熟度且不必然出现在 Golden Catalog 路径上,建议归入 V6/V7 实施期内处理而非 V0 前置;M-ARCH-01(`textMode` 编辑器 UI 偏好被写入 canonical PIR props 并泄漏到导出源码)违反 AGENTS 的架构不变量、且会污染 V6 Export cell 的产物字节,建议与 H-C-04 同批修复但严重度低于后者。

---

## 4. 第三部分:建议行动顺序

### 4.1 P0 —— 写第一行 V0 代码之前

| #   | 事项                                                                                   | 理由                                                                              |
| --- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 1   | 合并 `BehaviorScenario` 两份冲突契约(lane/checkpoint/assertion 模型 vs step 模型)      | V0 第一件实质工作就是写它的 codec + Go validator + migration;选错则整体返工       |
| 2   | 确定 `VerificationPlanCell` 是单 check 还是多 check                                    | 它是 plan digest、Evidence 唯一键与 Closure required 语义的共同地基               |
| 3   | 冻结唯一一张失败状态表,分三层(per-attempt outcome / per-cell status / closure verdict) | 现有四处定义互不兼容,`unstable` 层级错位会导致 fail-open 默认分支                 |
| 4   | 给 control profile / fixture set / baseline set 定 owner                               | 三者的 digest 是 cell identity 与 Program digest 的组成部分,V1 一开工就要保存它们 |
| 5   | 统一码点比较器并从 `workspaceCodec` 开始迁移,加 lint 禁令纳入 `verify:g3:boundaries`   | 见 G2-GAP-04;V4/V5/V7 的核心验收标准直接依赖它                                    |
| 6   | 把 `policyEvaluationInstant` 与 closure evaluation instant 补进 Evidence identity      | 否则所有「digest 可重算」的 Exit 条件退化为自证                                   |

### 4.2 P1 —— 与 V0 并行,V1/V3/V6 开工之前

| #   | 事项                                                                          | 阻塞的里程碑                                       |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| 7   | 修复 Remote 表面四条缺陷(CSP origin 模型优先)                                 | V3 Golden slice、V6 Preview surface、V8 第 8 项    |
| 8   | 修复 Vue target 正确性缺陷并接入 CI 浏览器门禁                                | V1/V2 target conformance、V6/V8 的 4 个 Vue cell   |
| 9   | 决策 Vue target 是复用 ExportProgram 还是修订 ADR 31                          | V2/V6/V8 —— 当前实现下语义等价不可能达成           |
| 10  | 修复导出入口链抢占(G2-GAP-05)                                                 | Exit Gate「Preview、Export、CI 使用同一 Scenario」 |
| 11  | 恢复 `apps/web` 的 `strict`                                                   | V7 要在该表面新建整套产品面                        |
| 12  | 为 NodeGraph/Animation 建立 wire 快照链与 migration registry(参照 PIR/ADR 39) | V2 破坏性重写目前无任何迁移设施                    |

> 第 7–10 项属于**补 G2 稳定性债**,建议以独立名义闭环,不要混入 V1 的 scenario authoring 交付。

### 4.3 规模参考

以 G2 实绩为刻度(1,039 文件 / +205k 行 / 14 个新包 / 39 个 gate script / aggregate 596.1s):
G3 原始代码量约为 **G2 的 1.0–1.3 倍**,风险加权工作量约 **1.5–2 倍**。
向上因素:两个新领域包的单个契约面都超过 G2 最大新包 `runtime-remote`(18,952 行);
deterministic controls 在 `runtime-core` 中零基础(全仓 grep `LogicalClock|ClockPort|virtualTime` 无命中);
NodeGraph 需从现有 1,532 行扩张 6–10 倍并做破坏性 migration。

---

## 5. 备注

1. 本文不修改任何源码,也不改变任何阶段状态判定。
2. 第二部分的发现由 9 个并行分析 agent 产出,均要求给出具体文档/文件行号并引用原文;严重度为 agent 判定值,未经第二轮对抗验证(与同日静态审查报告的处理方式不同,引用时请注意这一区别)。
3. 第一部分的门禁、CI、LOC 与 `localeCompare` 统计由确定性工具直接产出,可复现:

```bash
pnpm run verify:g2:data-protocols
```

```bash
pnpm docs:diagnostics:check
```

4. 同日全量静态审查见 [`2026-07-26-static-review.md`](2026-07-26-static-review.md);第一部分多条缺口引用其中的已验证发现。
