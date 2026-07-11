# Plugin Host Palette Phase 3 实现计划

> 状态：Implemented
> 完成日期：2026-07-10
> 对应 ADR：`specs/decisions/29.plugin-extension-points.md`
> 前置实现：`specs/implementation/plugin-host-core-phase2.md`
> Phase 4.4 后续状态：Palette contract/resolver 保留，module-scope Host、registry adapter 与 React hook 已迁入 workspace-scoped Web Plugin Platform。
> Phase 4.6-4.8 后续状态：当时的 core-embedded external owner、ESM profile 与 hard-coded Headless group 已删除，由 AntD/MUI/Radix bundled official package owner 直接取代。

## 1. 目标

Phase 3 用 Blueprint component Palette 建立第一条真实的 Host surface 闭环：

1. 定义独立版本的 `paletteContribution@1.0` JSON Schema。
2. 将可序列化 descriptor 解析为含 React preview/callback 的 host-side resolved model。
3. Native catalog 与 Phase 3 当时的 core-embedded external profiles 通过同一 Plugin Host contribution registry 发布。
4. Sidebar、Palette 建节点和 Inspector 元数据查询只读取 resolved registry。
5. 删除旧 `apps/web/src/editor/features/blueprint/registry.ts`，不保留双写、兼容 shim 或备用读取路径。

Phase 3 不执行不受信任插件代码，也不把普通 same-origin Worker 当作安全边界。Browser Sandbox、Host Gateway、official plugin 打包和外部库 render/codegen policy 迁移属于 Phase 4。

## 2. 稳定边界

### 2.1 Wire descriptor 与 runtime projection 分层

`palette-contribution-v1.schema.json` 只允许 JSON 数据：

- surface、group、placement 和 component item identity；
- `runtimeType`、`defaultProps`、`propOptions`；
- size、variant、status 等可序列化展示元数据。

以下对象只允许存在于 web host resolver 生成的 `ResolvedPaletteContribution`：

- `ReactNode` preview；
- React component / module namespace；
- `renderPreview`、`renderElement` 等 callback；
- status icon 和其他宿主运行时对象。

因此插件协议不会泄漏 React 类型，Host Core 也继续不依赖 React、DOM 或 Blueprint。

### 2.2 契约独立版本化

Manifest 仍由 `schemaVersion: "1.0"` 选择 Plugin Manifest Schema；Palette payload 由：

```text
point = paletteContribution
contractVersion = 1.0
```

选择 `palette-contribution-v1.schema.json`。Palette Schema 演进不要求同步升级 Manifest Schema。

### 2.3 Placement 不是注册分支

所有 group 进入同一个 typed contribution registry。`builtIn`、`headless`、`external + libraryId` 只作为 Sidebar view query 的 placement metadata，不决定注册路径。

### 2.4 ID 所有权

- group id 在整个 resolved Palette 中唯一；
- item id 在整个 resolved Palette 中唯一；
- descriptor 内重复由 `PLG-1014` 拒绝；
- 不同 owner 的业务 ID 冲突由 `PLG-3010` 拒绝，不允许静默覆盖；
- 同一 `<pluginId>/<contributionId>` 新 generation 可以原子替换旧 generation；
- claim 使用 identity lease count，replacement commit、rollback 和最终 disable 都不会错误释放上一代或下一代所有权。

## 3. Schema

Schema 人工维护源：

```text
specs/plugins/palette-contribution-v1.schema.json
```

生成产物：

```text
packages/plugin-contracts/src/generated/paletteContribution.generated.ts
packages/plugin-contracts/src/generated/paletteContributionSchema.generated.ts
```

包导出：

```text
@prodivix/plugin-contracts
@prodivix/plugin-contracts/schema/palette-contribution-v1
@prodivix/plugin-contracts/schema/palette-contribution-v1.json
```

结构约束：

| 字段                   | 约束                                                 |
| ---------------------- | ---------------------------------------------------- |
| `schemaVersion`        | 固定 `1.0`                                           |
| `surface`              | 固定 `blueprint.components`                          |
| `groups`               | 1–128 个                                             |
| `group.id` / `item.id` | 稳定小写 local id                                    |
| `placement`            | `builtIn`、`headless` 或带 `libraryId` 的 `external` |
| `item.kind`            | Phase 3 固定为 `component`                           |
| `defaultProps`         | 递归 JSON object                                     |
| `presentation`         | scale、sizes、variants、status                       |

choice id 与 group/item identity 分离。choice id 允许保留 `Small`、`Primary` 等既有稳定值，不错误套用插件 local-id 的小写规则。

语义校验额外保证：

1. group id 不重复。
2. item id 跨 group 不重复。
3. size/status option id 与 value 各自唯一。
4. variant id 在 item 内唯一。
5. status default 必须引用已声明 option value。

## 4. 运行链路

```mermaid
flowchart LR
    Source[Native catalog / core-embedded external profile]
    Descriptor[Palette descriptor v1]
    Projection[Trusted runtime projection]
    Contract[paletteContribution@1.0 contract]
    Resolver[Host-side Palette resolver]
    Host[Plugin Host transaction]
    Registry[Typed contribution reader]
    Sidebar[Blueprint Sidebar]
    Factory[Palette node factory]
    Inspector[Inspector metadata query]

    Source --> Descriptor
    Source --> Projection
    Descriptor --> Contract --> Resolver
    Projection --> Resolver
    Resolver --> Host --> Registry
    Registry --> Sidebar
    Registry --> Factory
    Registry --> Inspector
```

### 4.1 Native catalog

`COMPONENT_GROUPS` 在模块启动时投影为纯 JSON descriptor，并以：

```text
pluginId       = @prodivix/core
contributionId = blueprint.palette
trustLevel     = core
lifetime       = installation
```

经过完整 Manifest parse、capability policy、contract validation、resolver 和 Host transaction 发布。Native 不再直接写 Blueprint 局部数组。

### 4.2 Phase 3 过渡路径（已删除）

Phase 3 当时，MUI / Ant Design profile 由 ESM loader 取得 React component，并将 Palette groups 以独立受信任 owner 发布：

```text
@prodivix/core.external.<libraryId>
```

这条 app-local loader/profile/ELIB 路径已在 Phase 4.6-4.8 cutover 中删除。当前三个库均由真实 bundled package artifact、official owner 和通用 Host reconciliation 安装；本段只记录 Phase 3 的历史过渡语义，不是可恢复的 fallback。

### 4.3 消费面

`plugins/platform/paletteQueryService.ts` 对当前 workspace Host reader 建立 revision snapshot 和稳定索引：

- `groups`
- `itemsById`
- `itemsByRuntimeType`

React 使用 `useSyncExternalStore` 订阅 Host batch event。Sidebar 只对 snapshot 做 placement/library/search view query；建节点与 Inspector 查询同一 snapshot，不自行扫描 catalog 或 external runtime 内部结构。

## 5. 文件结构

```text
apps/web/src/editor/features/blueprint/palette/
  descriptor.ts
  index.ts
  projectionResolver.ts
  types.ts

apps/web/src/plugins/platform/
  createWebPluginPlatform.ts
  createWorkspaceWebPluginPlatform.ts
  nativeCorePlugin.ts
  paletteQueryService.ts
  WebPluginPlatformProvider.tsx
  __tests__/webPluginPlatform.test.tsx
```

职责：

- `descriptor.ts`：从 trusted runtime projection 提取 JSON descriptor。
- `projectionResolver.ts`：Schema bridge、运行时 hydration、业务 ID claim 和 dispose lease。
- `createWebPluginPlatform.ts`：workspace Host composition、trusted package source、policy、audit 与 cleanup。
- `createWorkspaceWebPluginPlatform.ts`：Browser adapter、Gateway 与 workspace audit composition。
- `nativeCorePlugin.ts`：`@prodivix/core` 启动注册。
- `paletteQueryService.ts`：Host reader 的只读 revision snapshot 与查询索引。
- `WebPluginPlatformProvider.tsx`：React external-store adapter、query/runtime service injection 与串行 workspace lifecycle。

## 6. 执行阶段

### Phase 3.1：契约

- [x] 新增 `palette-contribution-v1.schema.json`。
- [x] 生成 TypeScript 类型与 runtime Schema module。
- [x] 导出原始 Schema。
- [x] 实现 JSON、结构和语义校验。
- [x] 增加有效、非 JSON、placement、重复 ID、option 和 status default 测试。

### Phase 3.2：Resolver

- [x] 定义 `ResolvedPaletteContribution` 与 web contribution point map。
- [x] 实现 trusted runtime projection binding。
- [x] 按 descriptor hydrate preview、callback、variant 和 status icon。
- [x] 实现跨 owner group/item ID claim。
- [x] 实现 replacement/rollback/disable 安全的 claim lease。

### Phase 3.3：Host composition

- [x] 注册 `paletteContribution@1.0` contract。
- [x] 只对 `core` trust source 授予 Phase 3 registration capability。
- [x] 使用真实 Plugin Host discover/permission/transaction/audit 链路。
- [x] 保持 Browser runtime adapter 关闭，不执行插件代码。

### Phase 3.4：Surface 迁移

- [x] Native catalog 以 `@prodivix/core` owner 注册。
- [x] core-embedded external profiles 以 library owner 注册。
- [x] Sidebar 改为 `useSyncExternalStore` 消费 resolved registry。
- [x] Palette node factory 与 Inspector metadata 查询改读同一 snapshot。
- [x] 删除旧 Blueprint component registry，不保留双写。

### Phase 3.5：验证

- [x] Native catalog 能从 Host registry 查询。
- [x] contribution publish/disable 行为测试。
- [x] 同 identity generation 原子替换测试。
- [x] 跨 owner ID 冲突与 no-overwrite 测试。
- [x] 非 JSON runtime value 在 discovery 前拒绝。
- [x] external engine 异步注册与重复 ensure 测试。

## 7. 验收结果

1. Plugin Manifest、Palette descriptor 与 React runtime projection 已形成明确三层边界。
2. Phase 3 当时的 Native、headless 和 core-embedded external groups 进入同一个 owner-aware registry；后两者已由 Radix/AntD/MUI official contribution 取代。
3. Sidebar、建节点和 Inspector 不再读取旧 Blueprint registry。
4. `apps/web/src/editor/features/blueprint/registry.ts` 已删除。
5. group/item 冲突不再静默覆盖。
6. Host Core 未引入 React、DOM、Blueprint 或具体组件库依赖。
7. Phase 3 没有新增 PLG 码位；继续复用 `PLG-1014`、`PLG-3010`、`PLG-3012` 与现有 docs 生成链路。

Phase 3 首个真实扩展点暴露并修正了一个 Host 类型约束问题：`TDescriptor extends JsonValue` 会错误拒绝由封闭 JSON Schema 生成、但没有字符串索引签名的 TypeScript interface。`ContributionContractDefinition` 现由 `validateDescriptor(JsonValue)` 保证 wire 输入，泛型 resolved descriptor 不再要求索引签名；Host 的运行时 JSON 校验、transaction 和 lifecycle 语义没有改变。

## 8. Phase 4 输入

Phase 4 的安全事实源是 `specs/implementation/plugin-browser-sandbox-phase4.md`，Phase 4.6-4.8 的逐库实现记录是 `specs/implementation/official-component-plugins-phase46-48.md`。Phase 4.0-4.9 已复用当前 typed registry、contract 和 resolver 完成：

1. [x] transport-neutral sandbox message protocol；
2. [x] isolated/opaque origin 与严格 CSP；
3. [x] Host Gateway capability enforcement；
4. [x] build-attested Host implementation identity binding；
5. [x] workspace-scoped Web Plugin Platform，替换 Palette module singleton；
6. [x] Ant Design official plugin 试点，并以 MUI 验证 contract 复用；
7. [x] 删除 core 中对应 external profile、manifest、renderer/codegen/icon 专属分支；
8. [x] 建立 `blueprintTemplate@1.0`，并由 AntD Form.Item、MUI Accordion 与 Radix compound/portal 逐级验证。
9. [x] 完成 protocol property/fuzz、三浏览器 sandbox matrix、production sandbox deployment 与全仓 hardening。

Phase 4 不应恢复旧 Blueprint registry，也不应为 official/community plugin 建立第二套 Palette 数据路径。
