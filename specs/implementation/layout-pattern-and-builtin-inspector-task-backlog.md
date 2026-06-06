# 布局范式与内置 Inspector Schema 执行任务清单（Backlog v0）

## 状态

- In Progress
- 日期：2026-02-17
- 关联：
  - `specs/decisions/19.layout-pattern-and-builtin-inspector-schema.md`
  - `specs/decisions/16.class-protocol-editor.md`
  - `specs/decisions/17.external-library-runtime-and-adapter.md`
  - `apps/web/src/editor/features/design/BlueprintEditor.palette.ts`
  - `apps/web/src/editor/features/design/inspector/panels/LayoutPanel.tsx`

## 0. 边界与执行原则

1. 布局范式必须输出标准 `ComponentNode`，不新增 PIR 顶层结构。
2. 范式元信息统一写入 `props.dataAttributes`，值使用字符串，避免序列化歧义。
3. 所有参数更新必须走 `updatePirDoc`，禁止旁路 mutate。
4. 内置组件 metadata 与外部组件 metadata 必须分仓管理，避免 key 空间互相覆盖。
5. 迁移期允许“schema 面板 + 手写面板”并存，但同字段不可重复可编辑。

## 0.1 当前基线（2026-02-17）

1. 已有 layout 原语：`PdxDiv/PdxSection/PdxCard/PdxPanel`（`packages/ui/src/container/*`）。
2. 已有布局分组：`LayoutGroup`（`apps/web/src/editor/features/design/blueprint/data/groups/LayoutGroup.tsx`）。
3. 已有布局面板：`LayoutPanel`（硬编码字段渲染）。
4. 已有外部组件 metadata 链路：`metaStore + InspectorExternalPropsFields`。
5. 已完成决策文档：`specs/decisions/19.layout-pattern-and-builtin-inspector-schema.md`。

## 0.2 Gate A 落地进展（2026-02-17）

1. 已落地 `LPAT-001`：新增布局范式协议类型（参数 DSL / `build` / `update`）。
   - 结果：`apps/web/src/editor/features/design/blueprint/layoutPatterns/layoutPattern.types.ts`
2. 已落地 `LPAT-002`：冻结 `data-layout-*` 键与 root/version 约定，补齐读取与合并 helper。
   - 结果：`apps/web/src/editor/features/design/blueprint/layoutPatterns/dataAttributes.ts`
3. 已落地 `LPAT-003`：新增内置 Inspector Schema 类型定义（字段/分组/控件/可见规则）。
   - 结果：`apps/web/src/editor/features/design/inspector/meta/builtInMeta.types.ts`
4. 已落地 `LPAT-004`：冻结内置与外部 metadata 命名空间及 source 优先级策略。
   - 结果：`apps/web/src/editor/features/design/inspector/meta/builtInMetaPolicy.ts`

## 0.3 Gate B 落地进展（2026-02-17）

1. 已落地 `LPAT-101`：新增布局范式 registry（register/list/get/reset/build）。
   - 结果：`apps/web/src/editor/features/design/blueprint/layoutPatterns/registry.ts`
2. 已落地 `LPAT-102`：实现首批 preset（`split` / `holy-grail` / `dashboard-shell`）。
   - 结果：`apps/web/src/editor/features/design/blueprint/layoutPatterns/presets/*`
3. 已落地 `LPAT-103`：新增 Palette 分组 `layout-pattern`。
   - 结果：`apps/web/src/editor/features/design/blueprint/data/groups/LayoutPatternGroup.tsx`
4. 已落地 `LPAT-104`：`createNodeFromPaletteItem` 支持布局范式创建链路。
   - 结果：`apps/web/src/editor/features/design/BlueprintEditor.palette.ts`
5. 已落地 `LPAT-105`：组件组注册与宽预览缩放策略接入 `layout-pattern`。
   - 结果：`apps/web/src/editor/features/design/blueprint/data/ComponentGroups.tsx`、`apps/web/src/editor/features/design/blueprint/data/helpers.ts`

## 0.4 Gate C 落地进展（2026-02-17）

1. 已落地 `LPAT-201`：新增 `LayoutPatternPanel`，仅匹配范式 root 节点。
   - 结果：`apps/web/src/editor/features/design/inspector/panels/LayoutPatternPanel.tsx`
2. 已落地 `LPAT-202`：`layout-pattern` 面板已注册至 `INSPECTOR_PANELS`。
   - 结果：`apps/web/src/editor/features/design/inspector/panels/registry.ts`
3. 已落地 `LPAT-203`：参数回写已接入 preset `update` 链路并通过 `updatePirDoc` 生效。
   - 结果：`apps/web/src/editor/features/design/blueprint/layoutPatterns/presets/*`、`apps/web/src/editor/features/design/BlueprintEditorInspector.controller.ts`
4. 已落地 `LPAT-204`：子树更新后选中态回退策略已接入（回退到 pattern root）。
   - 结果：`apps/web/src/editor/features/design/BlueprintEditorInspector.controller.ts`

## 1. 里程碑与 Gate

1. `M1 / Gate A`：协议与类型冻结（Pattern + BuiltIn Schema）
2. `M2 / Gate B`：布局范式注册与插入闭环
3. `M3 / Gate C`：LayoutPatternPanel 参数回写闭环
4. `M4 / Gate D`：BuiltIn Meta Store 与通用字段渲染闭环
5. `M5 / Gate E`：Schema 生成器与人工覆盖链路闭环
6. `M6 / Gate F`：迁移收敛与质量门

## 2. 可执行任务（按阶段）

### A. 协议冻结（Gate A）

- [x] `LPAT-001` 冻结 `LayoutPatternDefinition` 类型与参数 DSL。
  - 产出：`layoutPattern.types.ts`
  - 依赖：无
  - 验收：所有 preset 共享统一 `build/update` 签名

- [x] `LPAT-002` 冻结布局 dataAttributes 约定（pattern/root/role/version）。
  - 产出：协议常量 + 文档示例
  - 依赖：`LPAT-001`
  - 验收：插入节点均携带规范字段

- [x] `LPAT-003` 冻结 BuiltIn Inspector Schema 类型（fields/groups/controls/visibility）。
  - 产出：`builtInMeta.types.ts`
  - 依赖：无
  - 验收：可表达 `enum/length/number/boolean/color/object` 控件

- [x] `LPAT-004` 定义内置与外部 metadata 分层规则。
  - 产出：优先级与命名空间规范
  - 依赖：`LPAT-003`
  - 验收：文档明确 `builtIn` 与 `external` 数据源边界

### B. 范式注册与 Palette 插入（Gate B）

- [x] `LPAT-101` 新建 `LayoutPatternRegistry`（register/list/get）。
  - 产出：registry + 单测
  - 依赖：`LPAT-001`
  - 验收：重复 id 注册可诊断、可预测

- [x] `LPAT-102` 实现首批 preset：`split`、`holy-grail`、`dashboard-shell`。
  - 产出：`presets/*.ts`
  - 依赖：`LPAT-101`
  - 验收：每个 preset 可独立 `build` 出完整子树

- [x] `LPAT-103` 新增 Palette 分组 `layout-pattern` 与预览项。
  - 产出：`LayoutPatternGroup.tsx`
  - 依赖：`LPAT-102`
  - 验收：侧边栏可见，预览不报错

- [x] `LPAT-104` 改造 `createNodeFromPaletteItem` 支持 pattern item。
  - 产出：`BlueprintEditor.palette.ts` 插入分支
  - 依赖：`LPAT-103`
  - 验收：拖拽插入后节点树可正常渲染与保存

- [x] `LPAT-105` 对接组件组注册顺序与宽组件缩放策略。
  - 产出：`ComponentGroups.tsx` + `helpers.ts` 调整
  - 依赖：`LPAT-103`
  - 验收：不破坏现有 layout/base/form 分组展示

### C. LayoutPatternPanel 参数回写（Gate C）

- [x] `LPAT-201` 新增 `LayoutPatternPanel`（匹配 pattern root）。
  - 产出：`LayoutPatternPanel.tsx`
  - 依赖：`LPAT-102`
  - 验收：仅范式根节点出现面板

- [x] `LPAT-202` 将 panel 注册到 `INSPECTOR_PANELS`。
  - 产出：`inspector/panels/registry.ts`
  - 依赖：`LPAT-201`
  - 验收：面板折叠/展开状态稳定

- [x] `LPAT-203` 实现 `update(root, patch)` 参数回写链路。
  - 产出：preset `update` + controller 回写适配
  - 依赖：`LPAT-201`
  - 验收：`gap/padding/sidebarWidth/columns` 调整后结构与样式同步更新

- [x] `LPAT-204` 处理选中节点稳定性（子树重写时 fallback root）。
  - 产出：inspector controller 选中策略
  - 依赖：`LPAT-203`
  - 验收：参数更新不出现“选中丢失”或空 inspector

### D. BuiltIn Meta Store 与通用字段面板（Gate D）

- [ ] `LPAT-301` 新建 `BuiltInMetaStore`（set/get/reset）。
  - 产出：`inspector/meta/builtInMetaStore.ts`
  - 依赖：`LPAT-003`
  - 验收：可按 `runtimeType` 稳定读取 metadata

- [ ] `LPAT-302` 首批内置字段建模：`PdxDiv/PdxSection/PdxCard/PdxPanel`。
  - 产出：`builtInMeta.layout.ts`
  - 依赖：`LPAT-301`
  - 验收：字段覆盖率 >= 70%，可表达条件显示

- [ ] `LPAT-303` 抽象通用 props 渲染器（内置/外部复用）。
  - 产出：`InspectorComponentPropsFields.tsx`
  - 依赖：`LPAT-302`
  - 验收：同一控件组件可渲染内置与外部字段

- [ ] `LPAT-304` 改造 inspector context，注入 builtIn meta resolve。
  - 产出：`BlueprintEditorInspector.controller.ts`
  - 依赖：`LPAT-301`
  - 验收：内置组件可读取 schema 字段并编辑

- [ ] `LPAT-305` 处理布局字段与 `LayoutPanel` 重复渲染冲突（gating）。
  - 产出：字段互斥规则
  - 依赖：`LPAT-303`
  - 验收：同字段仅存在一个可编辑入口

### E. Schema 生成器与覆盖链路（Gate E）

- [ ] `LPAT-401` 编写 `@prodivix/ui` props 抽取脚本（ts-morph）。
  - 产出：`generate-builtin-inspector-schema.mjs`
  - 依赖：`LPAT-003`
  - 验收：可提取 union literal/primitive/可选性

- [ ] `LPAT-402` 生成 `builtInSchema.json` 快照并接入加载。
  - 产出：生成产物 + 读取模块
  - 依赖：`LPAT-401`
  - 验收：运行时可加载并 fallback 到手工配置

- [ ] `LPAT-403` 支持手工 override 覆盖生成字段。
  - 产出：merge 策略（generated -> manual override）
  - 依赖：`LPAT-402`
  - 验收：复杂字段（如 spacing 四边联动）可通过 override 定制

- [ ] `LPAT-404` 添加脚本命令与文档说明。
  - 产出：`package.json` script + 开发文档
  - 依赖：`LPAT-401`
  - 验收：本地可一键更新 schema 快照

### F. 收敛、回归与发布（Gate F）

- [ ] `LPAT-501` 回归测试：插入范式、参数回写、保存恢复。
  - 产出：Blueprint 测试扩展
  - 依赖：`LPAT-203`
  - 验收：reload 后 pattern 元信息与结构一致

- [ ] `LPAT-502` 回归测试：内置字段 schema 渲染与更新。
  - 产出：Inspector 测试扩展
  - 依赖：`LPAT-305`
  - 验收：字段更新写入正确 `props/style/dataAttributes`

- [ ] `LPAT-503` i18n 与文案完善（中英文）。
  - 产出：`zh-CN` / `en-US` 资源项
  - 依赖：`LPAT-103`, `LPAT-201`, `LPAT-303`
  - 验收：无硬编码文案遗漏

- [ ] `LPAT-504` 旧面板迁移收口与开关策略。
  - 产出：迁移开关（feature flag）与回退路径
  - 依赖：`LPAT-503`
  - 验收：可安全灰度，不影响现有用户编辑链路

## 3. 冲突与兼容专项任务

- [ ] `LPAT-COMPAT-001` PIR 兼容检查：确保仅写 `props.dataAttributes`，不引入 schema 破坏。
  - 验收：现有 PIR 校验与保存流程通过

- [ ] `LPAT-COMPAT-002` Registry 兼容检查：BuiltIn Meta 不复用 external metaStore。
  - 验收：外部组件 Inspector 行为无回归

- [ ] `LPAT-COMPAT-003` Inspector 重复字段检查：layout panel 与 schema 面板无重复输入源。
  - 验收：字段互斥规则自动化测试通过

- [ ] `LPAT-COMPAT-004` 批量回写稳定性检查：参数更新不破坏当前选中态与历史栈。
  - 验收：undo/redo 可回放，选中节点可预期

## 4. 关键依赖图（简化）

```txt
LPAT-001/002/003/004 -> LPAT-101 -> LPAT-102 -> LPAT-103/104/105
LPAT-102 -> LPAT-201 -> LPAT-202 -> LPAT-203 -> LPAT-204
LPAT-003 -> LPAT-301 -> LPAT-302 -> LPAT-303 -> LPAT-304 -> LPAT-305
LPAT-003 -> LPAT-401 -> LPAT-402 -> LPAT-403 -> LPAT-404
LPAT-203/305 -> LPAT-501/502 -> LPAT-503 -> LPAT-504
LPAT-COMPAT-* 跨阶段并行执行，Gate F 前必须全部完成
```

## 5. Ready / Done 标准

### Ready（可开工）

1. 任务依赖已完成或可并行。
2. 输入输出文件与接口明确。
3. 验收口径可通过测试或稳定复现实测。

### Done（可关闭）

1. 代码、文档、测试三者同步更新。
2. 不破坏现有 external d.ts 推断链路。
3. 不引入新的 PIR 破坏性字段。
4. 通过冲突兼容专项任务对应验收。

## 6. 第一批开工建议（按顺序）

1. `LPAT-001` + `LPAT-003`（先冻结类型协议，避免后续返工）
2. `LPAT-101` + `LPAT-102`（尽快拿到可插入的范式骨架）
3. `LPAT-201` + `LPAT-203`（打通参数回写核心价值）
4. `LPAT-301` + `LPAT-302`（并行推进内置 schema 化）
5. `LPAT-COMPAT-001/002/003`（早做兼容防线，减少后期风险）
