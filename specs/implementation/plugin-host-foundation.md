# 插件宿主基础实现计划

## 状态

- Phase 1：Manifest 契约包、validator 与 PLG diagnostics 已完成
- Phase 2：`@prodivix/plugin-host` Host Core 已完成
- Phase 3：Palette contract、resolver 与 Blueprint surface 闭环已完成
- Phase 4.0-4.8：Host ports、versioned protocol、Browser Sandbox、Host Gateway、quota、persistent audit、workspace-scoped Web Platform、exact official contribution contracts 与 AntD/MUI/Radix official plugin 已完成
- Phase 4.9：Completed（security/property/browser matrix、production sandbox deployment 与整阶段状态收口）
- 日期：2026-07-11
- 对应 ADR：`specs/decisions/29.plugin-extension-points.md`
- 关联 ADR：
  - `specs/decisions/12.intent-command-extension.md`
  - `specs/decisions/14.plugin-sandbox-and-capability.md`
  - `specs/decisions/25.authoring-symbol-environment.md`
  - `specs/decisions/27.diagnostic-presentation-contract.md`
  - `specs/decisions/28.code-authoring-environment.md`

## Context

`native-catalog-convergence-plan.md` 已完成 ADR 29 的内置侧收敛，`@prodivix/plugin-contracts`、`@prodivix/plugin-host`、`@prodivix/plugin-protocol` 与 `@prodivix/plugin-browser` 已分别提供 contract、Host Core、wire protocol、Browser Sandbox 与 Gateway。Phase 3 Palette surface、Phase 4.0-4.5 安全/平台/official contract 底座、Phase 4.6-4.8 AntD/MUI/Radix 迁移和 Phase 4.9 hardening 均已完成。当前缺口是 activation-time sandbox RPC implementation proxy、完整 write Gateway 与 broader extension points。Phase 4 安全与最终验收事实源是 `specs/implementation/plugin-browser-sandbox-phase4.md`，逐库实现记录是 `specs/implementation/official-component-plugins-phase46-48.md`。

本计划是 ADR 29 的第二份实现文档，覆盖 Phase 1（扩展点契约）和 Phase 2（宿主与注册表）的基础工程，并用 `paletteContribution` 建立第一条端到端闭环。

## 核心判断

### 1. Manifest 与运行时对象必须分层

Plugin Manifest、能力请求、激活事件和 contribution descriptor 必须是 JSON 可序列化数据，禁止出现：

- `ReactNode`
- React component / `ElementType`
- callback、class instance、Promise
- DOM node、Worker handle、模块 namespace object
- 任意无法通过 structured clone 的对象

当前 `ComponentPreviewItem` 含 `ReactNode` 与 `renderPreview` 函数，因此它只能作为宿主内部的 resolved projection，不能成为插件通信协议。

```text
Plugin package
  -> serializable Plugin Manifest
  -> serializable Contribution Descriptor
  -> schema + semantic validation
  -> capability authorization
  -> host-side resolver
  -> Resolved Contribution（可含宿主函数与 React 投影）
  -> Palette / Inspector / Renderer / Codegen
```

### 2. Manifest Schema 与扩展点 Schema 独立版本化

Manifest 只负责插件身份、宿主兼容范围、入口、权限请求、激活条件和贡献声明。Palette、Codegen、Animation 等扩展点的 payload 由各自 Schema 管理。

因此：

- Manifest 版本通过 `schemaVersion` 管理。
- 每个 contribution 通过 `point + contractVersion` 选择对应扩展点 Schema。
- Manifest Schema 不内嵌所有领域 payload，避免某个扩展点演进迫使整个 Manifest 升级。
- `source.kind = inline` 的 `descriptor` 仍需经过扩展点 Schema 二次校验。
- `source.kind = resource` 的 JSON 资源必须在插件包根目录内解析，并经过相同的扩展点 Schema 校验。

### 3. 结构校验与语义校验分离

JSON Schema 负责单文档结构、字段类型、枚举、格式和封闭对象校验。Plugin semantic validator 负责跨字段、跨资源和宿主状态校验。

不能为了把所有规则塞进 JSON Schema 而引入难维护的条件组合。

## 契约文件

```text
specs/plugins/
├── plugin-manifest-v1.schema.json
├── palette-contribution-v1.schema.json
├── external-library-contribution-v1.schema.json
├── blueprint-template-contribution-v1.schema.json
├── render-policy-contribution-v1.schema.json
├── codegen-policy-contribution-v1.schema.json
├── icon-provider-contribution-v1.schema.json
└── runtime/
    └── *.schema.json
```

Manifest 和每个扩展点 Schema 继续独立版本化。已删除早期 `plugin-antd.manifest.json` 示例；真实 package Manifest 位于 `packages/plugin-antd/plugin/manifest.json`，并与 contribution resource 一起生成确定性 artifact。

## Plugin Manifest v1

### 顶层字段

| 字段               | 必需 | 职责                                                        |
| ------------------ | ---- | ----------------------------------------------------------- |
| `schemaVersion`    | 是   | Manifest Schema 版本，v1 固定为 `1.0`                       |
| `id`               | 是   | 全局插件 identity，安装、授权、审计和贡献 owner 的稳定主键  |
| `displayName`      | 是   | 面向用户的显示名称，不参与 identity                         |
| `version`          | 是   | 插件 SemVer 版本                                            |
| `publisher`        | 是   | 发布者 identity，用于签名与市场归属                         |
| `engines.prodivix` | 是   | 宿主兼容范围，由 semantic validator 解析                    |
| `entrypoints`      | 否   | Runtime module 与隔离 UI 入口；纯声明型插件可以没有运行入口 |
| `activationEvents` | 否   | Runtime module 的懒激活条件                                 |
| `capabilities`     | 是   | 安装时需要审核的能力请求，可为空数组                        |
| `contributes`      | 是   | 静态可发现的 contribution 声明，至少一项                    |
| `metadata`         | 否   | 分类、标签等展示元数据                                      |

### Entrypoints

v1 支持两类入口：

1. `runtime`：插件主运行时 module。Manifest 不指定 Worker、iframe 或其他 realm，具体隔离 transport 由宿主安全策略选择。
2. `ui`：隔离 iframe 页面，按 id 声明多个 UI surface。

入口路径必须使用 `./` 开头的包内相对路径。路径归一化后不得逃逸插件包根目录。`integrity` 是可选的 SHA-256 SRI；包签名不放进 Manifest 自签名，而由安装记录或分发元数据管理。

普通 same-origin Web Worker 仍可直接使用 `fetch`、WebSocket、IndexedDB 等平台能力，不能单独视为 capability sandbox。community plugin 默认应在隔离 origin / opaque origin 与严格 CSP 下执行，禁止直接网络与持久化访问；所有敏感操作只能通过 Host Gateway。official plugin 可以使用优化 transport，但必须遵守同一 Manifest、Host API、capability 和审计协议。

### Activation Events

激活事件使用带 discriminator 的对象，不使用 `onCommand:x` 一类拼接字符串：

- `startup`
- `workspace.open`
- `command`
- `contribution.use`
- `manual`

对象形态可以稳定扩展，也能对 command id、扩展点和 contribution id 做独立校验。

### Capabilities

能力请求统一使用：

```ts
type CapabilityRequest = {
  id: CapabilityId;
  scope?: string;
  reason: string;
  optional?: boolean;
};
```

规则：

1. `reason` 必填，用于安装权限摘要和管理员审计。
2. `optional: false` 为默认语义；必需能力被拒绝时插件不得激活。
3. 可选能力被拒绝时，Host Gateway 返回明确的 capability denied 结果，插件可降级。
4. `document.read`、`document.write`、`network.request`、`secrets.read` 必须带 `scope`。
5. 扩展点注册统一使用 `extension.register`，`scope` 是 contribution point；不再同时维护 `palette.register`、`codegen.policy.register` 等平行命名。
6. Manifest 声明的是能力请求，不是最终授权。最终 grant 由用户决策、管理员策略和宿主安全策略共同决定。
7. contribution 对应的 `extension.register` 若为可选且未授权，该 contribution 不进入 resolved registry；若为必需且未授权，插件整体不得激活。
8. `document.write` 只允许调用受审计的 Host Gateway patch / intent 能力，不授予 Workspace store、PIR graph 或文件系统的直接写权限。

### Contribution Declarations

每项 contribution 使用统一声明：

```ts
type ContributionDeclaration = {
  id: string;
  point: ContributionPoint;
  contractVersion: string;
  source:
    | { kind: 'inline'; descriptor: Record<string, JsonValue> }
    | { kind: 'resource'; path: string; integrity?: string };
  enabledByDefault?: boolean;
  metadata?: {
    displayName?: string;
    description?: string;
    order?: number;
    tags?: string[];
  };
};
```

`id` 在插件内唯一，宿主稳定 identity 为 `<pluginId>/<contributionId>`。Manifest 不接收实现函数；需要运行时代码的扩展点由 runtime module 激活后，以同一稳定 identity 绑定实现。

## 两阶段校验

### JSON Schema 校验

`plugin-manifest-v1.schema.json` 负责：

- 必填字段、封闭对象和数组上限
- plugin id、local id、SemVer、包内路径、SRI 的基本格式
- capability 与 activation event 的 discriminated union
- contribution point 的规范 id 形态；Host exact contract registry 决定 point/version 是否受支持
- inline/resource source 互斥

### Semantic Validator

当前 `@prodivix/plugin-contracts` 已实现：

1. 从受大小限制的 UTF-8 JSON bytes 解析 Manifest，拒绝 BOM 歧义、重复对象键和非标准 JSON；签名、hash 与验证消费同一份 canonical bytes。
2. 对程序化输入执行递归 JSON value guard，拒绝非普通对象、`undefined`、函数、symbol、`BigInt`、非有限 number、Date、Map、Set 和自定义 prototype。
3. 使用 SemVer parser 校验 `version` 和 `engines.prodivix`。
4. 校验 capability `(id, scope)` 唯一。
5. 校验 contribution `id` 在插件内唯一。
6. 每个 contribution 必须存在 `extension.register` 且 scope 与 `point` 一致。
7. `contribution.use` 在 Manifest 内校验 point 与 contribution 引用；`command` 在宿主传入 `knownCommandIds` 时校验，不从 contribution local id 猜测全局 command identity。
8. 含 activation event 的插件必须声明 runtime entrypoint。
9. 归一化所有资源路径，并拒绝绝对路径、反斜杠、URL、查询串、fragment、`.` / `..` 段、Windows 保留设备名、尾随点空格和大小写折叠冲突。
10. 对 Manifest byte size、JSON node count 和递归深度设置宿主上限，避免解析或验证资源耗尽。
11. 将所有错误转换为统一 `PLG-xxxx` diagnostics，不抛出面向宿主的裸校验异常。

扩展点 resolver 与安装宿主后续负责：

1. 按 `point + contractVersion` 选择扩展点 Schema，并验证 inline 或 resource descriptor。
2. 对单个 descriptor、资源数量和资源总量应用独立上限。
3. 校验资源完整性、插件包签名、publisher 身份和安装来源策略。

### `@prodivix/plugin-contracts` 公开入口

- `parsePluginManifest`：严格 UTF-8 JSON 解析，返回原始 `sourceBytes`。
- `validatePluginManifest`：程序化 JSON guard、Manifest v1 Schema 与语义校验。
- `parseAndValidatePluginManifest`：安装发现链路的一次性组合入口。
- `PLUGIN_MANIFEST_V1_SCHEMA` 与 `./schema/plugin-manifest-v1.json`：运行时 Schema object 与原始 JSON Schema 导出。
- `PLUGIN_DIAGNOSTIC_CODES`：稳定 `PLG-xxxx` 码位；码表位于 `specs/diagnostics/plugin-diagnostic-codes.md`，docs 页面由统一生成器产出。

Schema 的唯一人工维护源仍是 `specs/plugins/plugin-manifest-v1.schema.json`。`pnpm --filter @prodivix/plugin-contracts generate` 生成 TypeScript 类型和运行时 Schema module，`check:generated` 阻止生成文件漂移。

## 宿主内核

当前核心包与浏览器适配层：

```text
packages/plugin-contracts/       # JSON-only 类型、schema loader、validator、diagnostics
packages/plugin-host/            # 生命周期、授权、注册表、事务、审计；不依赖 React / DOM
packages/plugin-protocol/        # versioned JSON wire protocol
packages/plugin-browser/         # opaque broker / Worker transport 与 Gateway session
packages/plugin-package/         # deterministic artifact、package source 与 bundled catalog
packages/plugin-react-host/      # build-attested React Host projection ABI
apps/web/src/plugins/platform/   # workspace composition root 与 Web surface/query bridge
```

依赖方向固定为：

```text
plugin-contracts
  <- plugin-host
       <- web browser adapter
       <- host-side surface adapters
```

`plugin-contracts` 和 `plugin-host` 不得依赖 `apps/web`、React、具体编辑器或具体外部库。

## 生命周期

Phase 2 不再使用单轴状态同时表达静态 contribution 可用性与 runtime module 状态。详细状态转换、并发和撤权语义以 `specs/implementation/plugin-host-lifecycle-and-permissions.md` 为准。

```text
Availability:
  discovered -> validating -> blocked / ready / failed
  ready -> disabled

Runtime:
  not-applicable
  inactive -> activating -> active -> deactivating -> inactive
  activating / active / deactivating -> failed
```

规则：

1. Manifest 与全部已授权静态 contribution 未通过校验和 installation transaction 前，不进入 `ready`。
2. required capability 被拒绝时进入 `blocked`，这是策略结果，不记为 Host failure。
3. runtime deactivation 只清理 activation lifetime；disable、required revoke 和卸载清理 owner 的全部 lifetime。
4. contribution registry 中每条记录必须带 owner plugin id、installation generation 与 lifetime。
5. activation 过程使用 transaction；任何注册失败都回滚本次 activation 的全部贡献和 runtime handle。
6. 插件异常不得传播到编辑器主循环；宿主产生诊断并执行降级或熔断。

## Contribution Registry

Registry 不是 `Map<string, unknown>`。它以稳定的 `ContributionPointMap` 建立扩展点到 resolved contract 的类型映射，并统一提供：

- owner-aware registration
- deterministic duplicate policy
- activation transaction
- dispose by owner / generation / lifetime
- list / get / subscribe
- capability guard
- audit event

冲突规则：同一 `<pluginId>/<contributionId>` 重复注册是错误；不同插件的 contribution local id 可以相同，但扩展点如要求全局业务 id 唯一，应由该扩展点 resolver 返回明确诊断，不能静默覆盖。

Phase 2 registry 的 transaction isolation、revision conflict、batch subscription 和 exactly-once dispose 见 `specs/implementation/plugin-host-contribution-registry.md`。

## 第一条纵向闭环：Palette

Palette 被选为第一条闭环，是因为内置与 external profile 原先只共享 `ComponentGroup` / `ComponentPreviewItem`，没有共享真正的插件协议。Phase 3 已按以下顺序完成，详细证据见 `plugin-host-palette-phase3.md`。

已完成的实现顺序：

1. 定义 `palette-contribution-v1.schema.json`，只包含 JSON 可序列化 descriptor。
2. 实现 host-side palette resolver，将 descriptor 转成 resolved palette model。
3. Native catalog 以受信任 owner `@prodivix/core` 注册。
4. 用新 registry 直接替换 `apps/web/src/editor/features/blueprint/registry.ts`，不保留双轨兼容层。
5. Sidebar 只消费 resolved palette registry；来源筛选属于 view query，不再决定注册路径。
6. Browser sandbox transport 稳定后，以 Ant Design 作为第一个 official plugin，删除 core 中对应 profile、manifest 与 compiler 专属分支。

## 分阶段执行

### Phase 1：契约

- [x] 新增 Manifest v1 JSON Schema。
- [x] 新增可验证 Manifest 示例。
- [x] 明确 Manifest 与扩展点 Schema 的版本边界。
- [x] 明确结构校验与语义校验职责。
- [x] 创建 `@prodivix/plugin-contracts`。
- [x] 实现 Manifest semantic validator 与 diagnostics。

### Phase 2：Host Core

详细顺序与阶段门禁：`specs/implementation/plugin-host-core-phase2.md`。

- [x] 创建 `@prodivix/plugin-host`。
- [x] 实现 availability/runtime 双轴生命周期。
- [x] 实现 capability policy 与 permission resolution。
- [x] 实现 typed owner-aware contribution registry。
- [x] 实现 activation transaction、rollback 和 dispose by owner。
- [x] 实现结构化 audit event。

### Phase 3：Palette 闭环

详细实现与验收：`specs/implementation/plugin-host-palette-phase3.md`。

- [x] 定义 Palette contribution Schema。
- [x] 实现 Palette resolver。
- [x] Native catalog 接入新 registry。
- [x] Phase 3 当时的 core-embedded external profile 接入同一 registry；Phase 4.6-4.8 已由 bundled official package owner 直接取代。
- [x] 删除旧 Blueprint component registry。
- [x] Sidebar、建节点与 Inspector 查询只消费 resolved registry snapshot。

### Phase 4：Browser Sandbox

- [x] 按 `plugin-browser-sandbox-phase4.md` 解耦 Manifest point，并实现 verified runtime artifact 与 Host shutdown port。
- [x] 定义 transport-neutral sandbox protocol，并实现 opaque/cross-origin broker + Dedicated Worker。
- [x] 实现 Capability Host Gateway、quota、persistent audit 与 crash cleanup。
- [x] 将 Web 收敛为单一 workspace-scoped Plugin Host，删除 Palette 私有 Host。
- [x] 实现 build-attested Host implementation binding registry 与 owner/generation invalidation。
- [x] 将 Ant Design 迁移为首个 official plugin 并直接删除 core 专属分支。
- [x] 用 MUI 验证 contract 可复用性，并以 Radix 验证 compound/portal contract。
- [ ] 实现 activation-time sandbox RPC implementation proxy 与完整 Workspace/Document write Gateway。

### Phase 5：SDK 与生态

- [ ] 提供 public plugin SDK、模板与 conformance 工具。
- [ ] 建立签名、审核、版本兼容与市场分发。
- [ ] 扩展 GSAP、react-spring、Three.js、React Flow、CodeMirror、Monaco 等插件族。

## 测试策略

只测试稳定行为和公开 API：

- 有效/无效 Manifest 的诊断结果
- capability grant / deny / revoke
- contribution 冲突与稳定 identity
- 激活失败整体回滚
- deactivation 与 sandbox crash 按 owner 清理
- 未授权插件无法触达 Host Gateway
- static descriptor 与 runtime implementation 的 identity 绑定

不测试 Map 内部结构、私有 class、DOM 层级、具体标签或实现细节。

## Phase 1-2 验收标准

- [x] Manifest、capability 和 inline contribution descriptor 由 Schema 限制为 JSON 可序列化数据。
- [x] JSON Schema 与 semantic validator 的职责无重叠歧义。
- [x] 必需能力被拒绝时插件无法激活。
- [x] 未授权 contribution 无法写入 registry。
- [x] 激活失败不残留任何 contribution。
- [x] 插件停用或 runtime crash 后不残留 Host-owned contribution 或订阅。
- [x] Browser Gateway handle cleanup 由 Phase 4 sandbox adapter 与 dispose/abort 测试验证。
- [x] Registry 不依赖 React、DOM、Blueprint 或具体外部库。
- [x] Diagnostics 能定位到 plugin id、manifest path、contribution id 和 capability。

## 非目标

1. 本阶段不实现插件市场、评分、搜索或分发 UI。
2. 本阶段不实现完整签名基础设施；但 Manifest 和安装记录边界必须允许后续加入。
3. 本阶段不一次定义所有扩展点 payload Schema。
4. Phase 4 只迁移 Ant Design、MUI 与通过 compound/portal 门禁后的 Radix，不迁移 GSAP、React Flow、CodeMirror 等全部候选。
5. 本阶段不让插件直接获得 Workspace store、PIR graph、DOM 或 compiler 内部对象。
6. 本阶段不保留旧 registry 与新 contribution registry 的长期双轨。
