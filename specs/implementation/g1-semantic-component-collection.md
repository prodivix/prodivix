# G1 Semantic Authoring、Component 与 Collection 实施计划

## 状态

- Global Phase：G1
- ProductGateStatus：In Progress
- ImplementationStatus：S0-S4 Implemented / S5 In Progress / S6 In Progress
- 关联：
  - `specs/roadmap/global-phases.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/28.code-authoring-environment.md`
  - `specs/decisions/38.blueprint-component-instance-and-collection.md`
  - `specs/decisions/39.pir-current-evolution.md`

## 目标

G1 建立可验证的语义混合作者环境：Blueprint、NodeGraph、Animation、Code、Issues、
Preview 与 Export 从同一 Canonical Workspace 和 Workspace Semantic Index 工作，并完成
Component Definition、Public Contract、Component Instance、一等 Collection 与原子 subtree
extraction。

整个 G1 只面向无版本号的 `PIR-current` 领域模型。数字 PIR 版本只属于 wire schema、
codec、migration、transport 与 persistence；不得进入 Workspace、Renderer、Compiler、
Semantic Index 或 Web 产品 API。

## 核心边界

| Owner                          | G1 职责                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `@prodivix/authoring`          | WorkspaceSymbol/Scope/Reference、provider composition、resolution/visibility/impact query                                  |
| `@prodivix/pir/wire`           | version dispatch、strict codec、generated wire contract 与 deterministic migration                                         |
| `@prodivix/pir`                | PIR-current model、validator、mutation、projection、Component/Collection semantic contribution                             |
| `@prodivix/workspace`          | Canonical snapshot/revisions、current PIR read/write、Component graph、Transaction、projection、Semantic Index composition |
| `@prodivix/pir-react-renderer` | current PIR React projection；不拥有作者态状态                                                                             |
| `@prodivix/prodivix-compiler`  | 相同 current projection 的 ExportProgram、modules、SourceTrace 与 React/Vite 输出                                          |
| `@prodivix/diagnostics`        | provider snapshot lifecycle、去重、presentation 与 Issues query                                                            |
| `apps/web`                     | Blueprint、Component、Collection、Resources、Issues 与 Code navigation 的产品表面                                          |

Language Service 只通过 Code Semantic Contribution / Language Capability Provider 接入。
领域 owner 保留类型化引用和 identity policy；Semantic Index 不取代领域保存态。

## 写入与读取链路

```text
Blueprint gesture / AI proposal / extension intent
  -> semantic definition/reference/impact query
  -> PIR + Workspace domain planner
  -> reversible Commands / atomic Transaction
  -> Workspace + PIR + Component graph validation
  -> local History
  -> WorkspaceOperation
  -> Durable Outbox / Atomic Commit
  -> Canonical Workspace @ new revision
  -> rebuilt Semantic Index
  -> Renderer / Compiler / Issues / Code navigation
```

Web state 只保存 selection、open document、viewport、draft interaction 与 Collection preview
偏好。Component、Collection、Contract、binding 与代码引用必须保存到 Canonical Workspace。

## S0：PIR-current contract 与演进边界

状态：Implemented。

1. 建立 Element、ComponentInstance、ComponentSlotOutlet 与 Collection node kind。
2. 建立 stable Component member id、Public Contract、instance binding 与 slot regions。
3. 建立 Collection source、explicit key、item/index/error symbol id 与四状态 regions。
4. 领域 `PIRDocument`、`PIRUiGraph`、`PIRComponentContract` 不携带数字 wire version。
5. wire decoder/encoder 负责 version dispatch、migration、strict shape validation，以及
   version 字段的注入和剥离。
6. generated `PIRWire*` 只在 codec/persistence 边界可见。
7. 仓库检查禁止版本化生产目录/API、数字版本分支和 wire type 泄漏。

完成证据：codec/normalizer deterministic round-trip；migration registry、strict validator
与属性测试通过。

## S1：Workspace Semantic Index

状态：Kernel Implemented / Provider Expansion In Progress。

已实现：

1. `SemanticSnapshotIdentity` 绑定 Workspace partitioned revisions、semantic schema 与
   provider-set digest。
2. immutable snapshot、stable address、scope/visibility、definition、references、impact、
   completion 与 discriminated resolution。
3. semantic schema 覆盖 Component、Contract member、variant option、slot/slot-prop 与
   Collection item/index/error identity。
4. Workspace、Route、PIR-current、standalone NodeGraph 与 standalone Animation provider composition。
5. semantic diagnostics 以 provider snapshot 进入 `@prodivix/diagnostics`。

继续交付：

1. NodeGraph typed port 与 executor CodeReference contribution。
2. 项目 Token provider。

## S1-L：Code language capabilities

状态：Implemented。

1. TypeScript/JavaScript、CSS/SCSS 与 GLSL/WGSL Language Capability adapter 已接入。
2. Code provider 发布 module/symbol/scope/import/reference facts；shader provider 额外发布 stage-aware entry facts。
3. Language capability provider 保留 language-native lexical/module/type resolution、
   completion、definition、references 与 rename edit。
4. Workspace Semantic Index 编排跨领域结果与 capability policy，不重写语言规则。
5. source edit 转为 Code Command / Transaction，Language Service 不直接写 VFS。

完成条件：code/domain definition、reference、completion、rename 与 diagnostic 在统一结果
协议下通过 conformance。

## S2：Component domain 与跨文档事务

状态：Implemented。

1. Component Contract、Instance、slot outlet 与 binding validator。
2. `pir-component -> pir-component` dependency graph、Tarjan SCC 与 cycle rejection。
3. Definition create、Instance insert、Contract update、delete/rename impact planner。
4. subtree extraction：
   - 从完整 normalized subtree 分析边界；
   - 派生最小 public prop/event Contract；
   - 生成 Definition graph、source Instance replacement 与 relocation facts；
   - 通过 reference provider 分类 moves-with-subtree、public Contract rewrite、stable
     external target 与 blocking dependency。
5. extraction、reference rewrite 与新文档创建组成一个原子 Workspace Transaction。
6. Transaction 通过 History、undo、redo、replay、Durable Outbox 与 Atomic Commit。

无法安全迁移的外部引用在 apply 前阻断；禁止 consumer 裸引用 Definition internal node。

## S3：Component Renderer 与 Compiler parity

状态：Implemented on PIR-current stable API。

1. Workspace 提供 immutable、revision-bound current projection plan。
2. plan 固定 entry、可达 Definition、partition revisions、dependency-first order、Component
   DAG 与 Contract validation。
3. Renderer 支持多实例、nested instance、instance state isolation，以及 props/events/
   slots/variants 的 consumer、Definition 与 slot scope。
4. Compiler 为每个 Definition 生成共享 module；多个 Instance 复用 import。
5. Preview/Export 使用相同 slot consumer content 与 definition fallback 规则。
6. SourceTrace 保留 Definition、Instance、Contract member、slot region 与 generated module。
7. missing Definition、cycle、Contract mismatch 与 unsupported target fail closed，不输出部分
   projection/module。

## S4：Collection domain 与 parity

状态：Implemented on PIR-current stable API。

1. current evaluator 统一 source、explicit key、item/index/error lexical scope 与
   item/empty/loading/error regions。
2. source 在 parent scope 求值，key 在 item scope 求值；非法或重复 key 不回退为 index。
3. `auto` 根据 source 选择 item/empty；显式 preview state 是运行时/UI 偏好，不进入作者态。
4. 支持 nested Collection、parent-scope access 与 Collection 内 Component Instance。
5. typed key 与完整 projection path 隔离实例状态和 per-instance preview。
6. Compiler standalone runtime 通过共享 oracle conformance 约束，并保留 Collection
   SourceTrace、warning fact 与动态 issue replace/clear。

真实 Data/API query lifecycle、pagination、cache、retry 与 virtualization 属于 G2。

## S5：Blueprint 产品表面

状态：In Progress。

1. Component 页面展示 Definition graph、Contract、dependencies 与 references。
2. Canvas 提供 extraction plan 预览和原子 apply。
3. Resources/palette 创建 Definition、插入 Instance，并双向跳转 definition/references。
4. Inspector 只展示 Contract 暴露的 props/events/slots/variants。
5. Collection Inspector 提供 source、key、state region 与 scope-aware binding，不要求用户
   手写隐式字段名。
6. Issues、Canvas、Inspector、NodeGraph、Animation 与 Code Editor 使用同一 semantic
   navigation。
7. Web 只消费无版本 Workspace/PIR/Renderer API，使用唯一 current authoring 与 projection
   path。

Blueprint 已接入 canonical Component Instance Public Contract Inspector，并提供一等
Collection Inspector 编辑 source、key、item/index/error symbols、item/empty/loading/error
regions、scope-aware binding candidates 与 manual preview。Inspector 只从 Definition Public
Contract 投影 Instance 可编辑面；Component binding 与 Collection 领域写入均通过
canonical Workspace Transaction 进入 History 与 WorkspaceOperation 链路。

完成条件：产品旅程不依赖 editor-private domain mirror；刷新后从 canonical/local replica
恢复全部领域状态。

## S6：Golden G1 Gate

状态：In Progress。

```text
create page subtree
  -> extract Component Definition
  -> insert multiple Instances
  -> bind props/events/slots/variants
  -> reuse Instance inside nested Collection
  -> edit Definition and observe all consumers
  -> undo/redo
  -> save/reload and conflict-safe replay
  -> Preview
  -> export standalone React/Vite project
  -> install / typecheck / test / build / browser smoke
```

Golden G1 conformance 已覆盖原子 subtree extraction、3 个 Component Instance、双层
nested Collection、Definition 修改对所有 consumer 的联动、History undo/redo、codec
reload 与 WorkspaceOperation replay，并验证 Preview projection、ExportProgram 与
SourceTrace 的稳定性。

S6 使用同一 PIR-current 稳定架构验证 G1 产品闭环。完成条件是 Preview/Export parity、
SourceTrace、Issues navigation、跨文档 reference integrity 与独立项目构建均有可重复证据。
下一批 Gate 证据聚焦 Contract props/events/slots/variants 全量绑定旅程、独立导出
项目 install/typecheck/test/build/browser smoke、Code Language 与 visual/code round-trip；
这些证据齐备后再评估 S5、S6 与 G1 Product Gate。

## 测试策略

1. codec、migration、index、dependency graph、extraction、reference rewrite 与 evaluator 优先
   使用属性测试验证 round-trip、确定性、DAG、作用域和 reverse/replay 不变量。
2. 示例测试只覆盖公开 API 与少量代表性错误语义，不与属性测试重复。
3. Renderer/Compiler parity 使用少量 conformance，不固定 DOM、class 或生成代码快照。
4. Web 只写用户可感知 integration，不依赖标签层级、`querySelector`、`closest` 或内部
   store 形状。
5. 历史 wire version 只测试 migration fixture，不复制整套产品测试。

## 非目标

1. G1 不实现任意深层 instance override、component inheritance 或 mixin。
2. G1 不实现真实 API query lifecycle、pagination、cache、retry、optimistic update 或
   virtualization。
3. G1 不完成第二 framework target。
4. G1 不完成 NodeGraph/Animation 的全部 G3 行为闭环。

## 验收清单

- [x] PIR-current 领域模型与 wire version 隔离。
- [x] Workspace Semantic Index kernel、稳定查询与核心属性测试。
- [x] Component/Collection semantic identities 与 provider API。
- [x] Component Definition、Contract、Instance、slot、DAG 与 subtree extraction。
- [x] 原子 extraction Transaction、History undo/redo/replay 与 reference rewrite。
- [x] Component/Collection Preview 与 Compiler 共享语义和 conformance。
- [x] NodeGraph standalone 与 Animation standalone provider 进入 current Semantic Index composition。
- [x] Renderer、Compiler、Workspace、Semantic Index 与 Web 统一使用无版本 PIR-current API。
- [ ] Code Language、NodeGraph typed port/executor 与 Token provider 完整进入 current Semantic Index composition。
- [ ] 全部生产领域写入经过 Command / Transaction、History、Outbox 与 Atomic Commit。
- [ ] S5 Blueprint 产品表面完整。
- [ ] S6 Golden journey 与独立导出项目验证完整。
