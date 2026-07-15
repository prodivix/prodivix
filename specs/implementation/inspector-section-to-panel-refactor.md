# Inspector Section-to-Panel 重构规格书

> **历史规格，已被当前 Code Authoring Environment 架构取代。** 本文中的 Panel 结构整理仍可作为历史背景；`ExternalCodePanel` 占位壳与 `props.externalCode` 不再是生产方案。当前实现统一使用 Canonical Workspace Code Artifact、CodeReference、CodeSlot 和受控源码入口，见 `specs/decisions/28.code-authoring-environment.md`。

## Context

Inspector 当前存在旧 Section 和新 Panel 双轨并行的问题：

1. 4 个旧 Section 组件（Basic/Style/Animation/Triggers）已是死代码，无人导入
2. InspectorStyleTab/CodeTab 内部仍有 `<section>` 硬编码 accordion，这些逻辑本应是 Panel
3. `InspectorSectionContext` 名字带 "Section" 但实际是全局 context，命名误导
4. `ExpandedSectionsState` 硬编码 4 个 key，与动态 `expandedPanels: Record<string, boolean>` 重复
5. `sections/` 目录下混杂了死代码（旧 Section）、活跃代码（Context 定义、\*Fields 组件）
6. InspectorClassNameFields / ClassProtocolEditor 和 InspectorExternalPropsFields 在重构过程中丢失了渲染路径
7. Panel 缺少统一壳层，标题栏、展开折叠按钮、header actions 的结构没有收敛

目标：**统一层级为 Tab → Panel → Group → Field，消灭 Section，并让所有 Panel 使用统一的 Panel Frame。**

---

## 设计原则

### 1. 统一层级

最终 Inspector 层级必须统一为：

```text
Tab -> Panel -> Group -> Field
```

约束：

- `Panel` 是 Inspector 中唯一合法的一级折叠单元
- `Group` 只负责 Panel 内部字段分组，不负责替代 Panel 语义
- `Field` 是最小编辑单元
- 不再允许旧 Section 残留在运行时渲染树中

### 2. 所有 Panel 都必须有统一标题栏

每个 Panel 的标题栏必须是完整一整行，结构固定为：

```text
| 左侧：Panel 标题 | 右侧：一个或多个 action icon buttons + 展开折叠按钮 |
```

约束：

- 每个 Panel 都必须有展开折叠按钮
- 其他 action buttons 只能放在标题栏右侧
- 不允许再出现 tab 顶部独立悬浮 action button 行
- Panel body 只负责内容，不负责渲染 header

### 3. 所有 Panel 必须继承统一父组件

所有 Panel 组件都应通过统一父组件渲染，例如：

- `InspectorPanelFrame`
- `BaseInspectorPanel`

该父组件至少负责：

- 标题栏结构
- 标题文字样式
- header actions 区布局
- 展开/折叠交互
- body 容器和基础 spacing

说明：

- 这层抽象应保持轻量，不要过度封装业务 body
- 当前可复用内容主要是 header/frame，但必须统一

### 4. Panel / Group 必须按能力条件出现

所有 Panel 和 Group 都必须是条件化渲染，而不是固定显示。

约束：

- `panel.match(node)` 决定某个 Panel 是否出现
- `group.match?(node, context)` 决定某个 Group 是否出现
- 只有“该节点此刻确实可编辑这类内容”时，Panel/Group 才允许出现

示例：

- `TypographyPanel` 仅在节点具有文本能力时出现
- `LayoutPanel` 仅在容器型/布局型节点出现
- 选中布局范式根节点时，只显示 `LayoutPatternPanel`，不显示 `LayoutPanel`
- `ExternalCodePanel` 仅在支持挂载外部代码的节点出现

---

## 当前问题总结

### 架构问题

1. 当前活跃 UI 已经主要按 Tab 拆分，但 Section 时代的 context 命名和部分折叠状态仍残留
2. Style Tab 已切到动态 panel registry，但 panel header 尚未抽象
3. Code Tab 仍是旧 `<section>` 硬编码结构，没有纳入 panel registry
4. Basic/Data Tab 仍直接拼 fields，尚未彻底完成新层级命名迁移

### 已知功能缺口

1. `InspectorStyleTab` 把 `t` 错传成 `updateNode`
2. `InspectorClassNameFields` 未接回活跃渲染路径
3. `InspectorExternalPropsFields` 未接回活跃渲染路径
4. Mounted CSS button 位置不对，应该属于 `ClassNamePanel` 标题栏 action
5. Style Tab 目前只覆盖一部分样式域，缺少 Typography / Background / Border 等独立样式 Panel
6. Code Tab 目前只有 trigger 编辑方向，未为“挂载外部代码”预留独立 Panel

---

## 当前渲染树（重构前）

### Basic Tab (`tabs/InspectorBasicTab.tsx`)

```text
InspectorBasicTab
├── InspectorNodeIdentityFields
├── InspectorNodeCapabilitiesFields
└── ❌ LOST: InspectorExternalPropsFields
```

### Style Tab (`tabs/InspectorStyleTab.tsx`)

```text
InspectorStyleTab
├── ❌ 独立 Mounted CSS button 行
└── matchedPanels accordion loop
    ├── LayoutPatternPanel
    ├── LayoutPanel
    └── AnimationPanel
└── ❌ LOST: InspectorClassNameFields
```

### Data Tab (`tabs/InspectorDataTab.tsx`)

```text
InspectorDataTab
├── InspectorDataScopeFields
└── InspectorListTemplateFields
```

### Code Tab (`tabs/InspectorCodeTab.tsx`)

```text
InspectorCodeTab
└── <section> hardcoded accordion
    └── triggers UI
```

---

## 目标渲染树

### Basic Tab

```text
InspectorBasicTab
├── InspectorNodeIdentityFields
├── InspectorNodeCapabilitiesFields
└── InspectorExternalPropsFields
```

说明：

- Basic Tab 暂时继续使用 field 直出，不强制包成 Panel
- 该 Tab 的重点是恢复缺失字段和完成 context/目录迁移

### Style Tab

```text
InspectorStyleTab
└── matchedPanels accordion loop (resolveInspectorPanels(node, 'style'))
    ├── ClassNamePanel
    │   └── Header actions: Mounted CSS button + expand/collapse button
    ├── LayoutPatternPanel
    ├── LayoutPanel
    │   └── Group loop
    │       ├── SpacingGroup
    │       ├── SizeGroup
    │       ├── AppearanceGroup
    │       ├── FlexGroup
    │       └── GridGroup
    ├── TypographyPanel
    │   └── 可按需拆分 Font / Text / Decoration groups
    ├── BackgroundPanel
    ├── BorderPanel
    └── AnimationPanel
```

说明：

- `ClassNamePanel` 用来承载 `ClassProtocolEditor`
- Typography / Background / Border 优先拆为不同 Panel，而不是先塞进 LayoutPanel
- LayoutPanel 只承载布局语义，不继续膨胀成“大样式总 Panel”

### Data Tab

```text
InspectorDataTab
├── InspectorDataScopeFields
└── InspectorListTemplateFields
```

说明：

- 当前先保持现状
- 后续若 Data 能力继续增多，再评估是否升级为 DataPanels

### Code Tab

```text
InspectorCodeTab
└── matchedPanels accordion loop (resolveInspectorPanels(node, 'code'))
    ├── TriggersPanel
    │   └── Header actions: Add Trigger button + expand/collapse button
    └── ExternalCodePanel
        └── 用于挂载节点外部执行代码（例如未来 Canvas / WebGL / 自定义执行逻辑）
```

说明：

- `TriggersPanel` 和 `ExternalCodePanel` 是不同语义域，不能混成一个 Panel
- `ExternalCodePanel` 第一阶段允许只搭好壳层与 registry 接入，不要求一次性做完完整编辑器能力

---

## Panel Frame 设计

### 统一父组件

```typescript
type InspectorPanelFrameProps = {
  panelKey: string;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
};
```

职责：

- 渲染整行标题栏
- 左侧显示 title
- 右侧统一渲染 `actions + expand/collapse`
- 管理 body 外层容器
- 提供统一样式和测试锚点

标题栏目标结构：

```text
header
├── title
└── actions
    ├── custom action button 1
    ├── custom action button 2
    └── expand/collapse button
```

### 展开折叠按钮要求

每个 Panel 必须始终包含展开折叠按钮，不能省略。

推荐：

- 由 `InspectorPanelFrame` 内部统一渲染
- Panel 调用方只提供 `isExpanded` / `onToggle`

### Header Actions 规则

- `Mounted CSS` 属于 `ClassNamePanel` header actions
- `Add Trigger` 属于 `TriggersPanel` header actions
- 后续如 `Open External Code Editor` 之类动作，也应属于对应 Panel header actions

---

## Panel / Group 可见性规则

### Panel 可见性

建议统一为：

```typescript
type InspectorPanelDefinition = {
  key: string;
  title: string;
  tab: InspectorTab;
  match: (node: ComponentNode) => boolean;
  render: (props: InspectorPanelRenderProps) => React.ReactNode;
};
```

其中 `match(node)` 仅负责“这个 Panel 是否应该出现”。

建议的首批规则：

- `ClassNamePanel`
  - `supportsClassProtocol === true`
- `LayoutPatternPanel`
  - `isLayoutPatternRootNode(node) === true`
- `LayoutPanel`
  - 节点是普通布局型节点
  - 且不是 layout pattern root
- `TypographyPanel`
  - 节点存在文本内容或文本样式能力
- `BackgroundPanel`
  - 节点支持背景样式编辑
- `BorderPanel`
  - 节点支持边框样式编辑
- `AnimationPanel`
  - 节点允许挂载 animation binding
- `TriggersPanel`
  - 节点支持事件/动作绑定
- `ExternalCodePanel`
  - 节点支持挂载外部执行代码

### Group 可见性

建议 Group 层也支持条件化：

```typescript
type InspectorGroupDefinition = {
  key: string;
  title: string;
  match?: (node: ComponentNode, context: InspectorContextValue) => boolean;
  render: () => React.ReactNode;
};
```

适用场景：

- `LayoutPanel` 内部继续区分 FlexGroup / GridGroup
- `TypographyPanel` 内按能力区分 Font / Text / Decoration
- 某些 Group 只对部分节点类型出现

原则：

- 不要为了“有 group 能力”而把本该独立成 panel 的语义域塞进同一个 panel

---

## Style Tab 规划

### Panel 划分策略

Style Tab 中以下内容应优先作为独立 Panel：

- `ClassNamePanel`
- `LayoutPatternPanel`
- `LayoutPanel`
- `TypographyPanel`
- `BackgroundPanel`
- `BorderPanel`
- `AnimationPanel`

理由：

1. 这些语义域的出现条件不同
2. 折叠状态应独立
3. 未来扩展更稳，不会把单个 Panel 撑成杂糅大杂烩

### 为什么不先合并成一个“大样式 Panel”

不建议把 Typography / Background / Border 先放进一个通用样式 Panel 的不同 Group，原因：

1. 用户难以感知当前节点到底支持哪些样式域
2. 可见性条件会变复杂
3. 后续继续扩展时维护成本更高
4. 这会稀释 Panel 作为一等语义单元的作用

结论：

- `Panel` 负责大语义域
- `Group` 负责 Panel 内部组织

---

## Code Tab 规划

### TriggersPanel

职责：

- 展示 trigger 列表
- 添加 trigger
- 删除 trigger
- 编辑 action params
- 显示 link conflict warning

标题栏右侧：

- `Add Trigger` icon button
- `Expand/Collapse` button

### ExternalCodePanel

职责：

- 挂载节点外部代码入口
- 为未来 Canvas / WebGL / 自定义绘制或执行逻辑预留载体

第一阶段最低要求：

- 进入 registry
- 具备统一 Panel Frame
- 有明确 capability-based `match`
- body 可以先是占位内容或基础配置入口

---

## 文件树目标

```text
inspector/
  InspectorContext.tsx
  InspectorContext.types.ts
  capabilities/
  classProtocol/
  components/
    InspectorPanelFrame.tsx
    InspectorRow.tsx
    ...
  fields/
    InspectorNodeIdentityFields.tsx
    InspectorNodeCapabilitiesFields.tsx
    InspectorClassNameFields.tsx
    InspectorDataScopeFields.tsx
    InspectorListTemplateFields.tsx
    InspectorExternalPropsFields.tsx
    triggers/
      InspectorTriggerItem.tsx
      TriggerNavigateFields.tsx
      TriggerGraphFields.tsx
  groups/
    layout/
    typography/      // 如有必要再落地
  panels/
    types.ts
    registry.ts
    ClassNamePanel.tsx
    LayoutPanel.tsx
    LayoutPatternPanel.tsx
    TypographyPanel.tsx
    BackgroundPanel.tsx
    BorderPanel.tsx
    AnimationPanel.tsx
    TriggersPanel.tsx
    ExternalCodePanel.tsx
    layoutGroup/
  tabs/
    InspectorBasicTab.tsx
    InspectorStyleTab.tsx
    InspectorDataTab.tsx
    InspectorCodeTab.tsx
```

删除：

```text
inspector/sections/
  InspectorBasicSection.tsx
  InspectorStyleSection.tsx
  InspectorAnimationSection.tsx
  InspectorTriggersSection.tsx
  InspectorSectionContext.tsx
  InspectorSectionContext.types.ts
  basic/
  triggers/
```

说明：

- `fields/` 承载可复用字段块
- `panels/` 承载一等语义容器
- 如 group 数量明显增长，再单独抽 `groups/`

---

## Context 重命名

| 旧名                                        | 新名                        |
| ------------------------------------------- | --------------------------- |
| `InspectorSectionContext`                   | `InspectorContext`          |
| `useInspectorSectionContext()`              | `useInspectorContext()`     |
| `InspectorSectionContextValue`              | `InspectorContextValue`     |
| `sections/InspectorSectionContext.tsx`      | `InspectorContext.tsx`      |
| `sections/InspectorSectionContext.types.ts` | `InspectorContext.types.ts` |

同时：

- 删除 `ExpandedSectionsState`
- 所有折叠状态统一走 `expandedPanels: Record<string, boolean>`

---

## 折叠状态统一

Controller 当前维护：

- `expandedSections: { basic, style, animation, triggers }` -> 删除
- `expandedPanels: Record<string, boolean>` -> 保留并接管全部 Panel 折叠状态

统一规则：

- Style Tab 的每个 panel 都走 `togglePanel(panel.key)`
- Code Tab 的每个 panel 都走 `togglePanel(panel.key)`
- Data Tab 当前保留 field 内部 accordion，也统一走 `togglePanel(...)`

说明：

- Basic Tab 当前不强制引入 Panel，因此不需要 panel-level 折叠

---

## 实施计划

## Phase 0: 基线冻结与约束确认

目标：

- 冻结本次重构范围，只处理 Inspector 架构与运行时渲染树
- 明确“不先处理测试”的阶段边界
- 明确 panel / group / field 的职责边界

交付物：

- 本 implementation 文档
- ADR：`specs/decisions/21.inspector-panel-architecture.md`

完成标准：

- 团队对目标层级、Panel Frame、显示规则没有歧义

---

## Phase 1: 删除 Section 残留并完成 Context 迁移

目标：

- 删除死代码 Section 文件
- `InspectorSectionContext` 重命名为 `InspectorContext`
- import 路径和 hook 全量迁移
- 删除 `expandedSections`

主要任务：

- 删除 `InspectorBasicSection.tsx`
- 删除 `InspectorStyleSection.tsx`
- 删除 `InspectorAnimationSection.tsx`
- 删除 `InspectorTriggersSection.tsx`
- 将 `sections/InspectorSectionContext.tsx` 移到 inspector 根目录并重命名
- 将 `sections/InspectorSectionContext.types.ts` 移到 inspector 根目录并重命名
- 将所有 `useInspectorSectionContext` 替换为 `useInspectorContext`
- 删除 controller 中 `persistedExpandedSections`
- 删除 controller 中 `expandedSections`
- 删除 controller 中 `toggleSection`

主要文件：

- `apps/web/src/editor/features/design/BlueprintEditorInspector.tsx`
- `apps/web/src/editor/features/design/BlueprintEditorInspector.controller.ts`
- `apps/web/src/editor/features/design/inspector/InspectorContext.tsx`
- `apps/web/src/editor/features/design/inspector/InspectorContext.types.ts`
- `apps/web/src/editor/features/design/inspector/tabs/*.tsx`
- `apps/web/src/editor/features/design/inspector/panels/*.tsx`

完成标准：

- 运行时代码中不再引用 `InspectorSectionContext`
- 所有折叠状态只保留 `expandedPanels`

---

## Phase 2: 目录迁移为 fields / panels / groups

目标：

- 将活跃 field 组件从 `sections/` 迁出
- 清理旧目录命名
- 为后续 panel/group 扩展建立稳定文件结构

主要任务：

- 将 `sections/basic/InspectorNodeIdentityFields.tsx` 移到 `fields/`
- 将 `sections/basic/InspectorNodeCapabilitiesFields.tsx` 移到 `fields/`
- 将 `sections/basic/InspectorClassNameFields.tsx` 移到 `fields/`
- 将 `sections/basic/InspectorDataScopeFields.tsx` 移到 `fields/`
- 将 `sections/basic/InspectorListTemplateFields.tsx` 移到 `fields/`
- 将 `sections/basic/InspectorExternalPropsFields.tsx` 移到 `fields/`
- 将 `sections/triggers/*` 移到 `fields/triggers/`
- 按需评估 `layoutGroup/` 是否后续上提为 `groups/`
- 删除空 `sections/` 目录

主要文件：

- `apps/web/src/editor/features/design/inspector/fields/*`
- `apps/web/src/editor/features/design/inspector/fields/triggers/*`
- `apps/web/src/editor/features/design/inspector/panels/layoutGroup/*`

完成标准：

- 活跃代码目录中不再存在 `sections/basic` 和 `sections/triggers`
- import 路径全部切到 `fields/`

---

## Phase 3: 引入统一 Panel Frame

目标：

- 新建 `InspectorPanelFrame`
- 所有 Panel 必须通过该父组件输出
- 统一标题栏结构、header actions 和 expand/collapse 交互

主要任务：

- 设计 `InspectorPanelFrameProps`
- 在 `components/` 新增 `InspectorPanelFrame.tsx`
- 抽象标题栏左/右布局
- 将展开折叠按钮内聚到 `InspectorPanelFrame`
- 为 actions 区保留多个 icon button 的扩展位
- 为 panel body 统一 spacing 和容器样式

主要文件：

- `apps/web/src/editor/features/design/inspector/components/InspectorPanelFrame.tsx`
- `apps/web/src/editor/features/design/inspector/panels/types.ts`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorStyleTab.tsx`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorCodeTab.tsx`

完成标准：

- 不再允许 panel 自己重复拼 header
- 每个 panel 都有整行标题栏
- 每个 panel 都始终有展开折叠按钮

---

## Phase 4: 修复现有缺失能力并接回渲染路径

目标：

- 新建 `ClassNamePanel`
- 恢复 `InspectorClassNameFields` 的活跃渲染路径
- 将 `Mounted CSS` 按钮移入 `ClassNamePanel` 标题栏
- 在 `BasicTab` 恢复 `InspectorExternalPropsFields`
- 修复 `InspectorStyleTab` 中 `updateNode: t as any`

主要任务：

- 新增 `panels/ClassNamePanel.tsx`
- 将 `ClassProtocolEditor` 放入 `ClassNamePanel` body
- 将 Mounted CSS action button 挂到 `ClassNamePanel` header actions
- 在 `InspectorBasicTab.tsx` 接回 `InspectorExternalPropsFields`
- 修改 `InspectorStyleTab.tsx`，传入真正的 `updateSelectedNode`
- 校正 controller/context 中相关字段依赖

主要文件：

- `apps/web/src/editor/features/design/inspector/panels/ClassNamePanel.tsx`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorBasicTab.tsx`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorStyleTab.tsx`
- `apps/web/src/editor/features/design/BlueprintEditorInspector.controller.ts`

完成标准：

- className 编辑重新可达
- external props 编辑重新可达
- Mounted CSS action button 不再独立漂浮在 tab 顶部

---

## Phase 5: 收敛 Panel Registry 到按 Tab 渲染

目标：

- registry 支持 tab 维度筛选
- `InspectorStyleTab` 与 `InspectorCodeTab` 统一使用 panel loop
- Panel 结构不再散落在 tab 内部硬编码

主要任务：

- 扩展 `InspectorPanelDefinition`，至少包含 `tab`
- 新增 `resolveInspectorPanels(node, tab)`
- 修改 `INSPECTOR_PANELS` 注册方式
- `InspectorStyleTab` 使用 `resolveInspectorPanels(node, 'style')`
- `InspectorCodeTab` 使用 `resolveInspectorPanels(node, 'code')`
- 将 Code Tab 中旧 `<section>` accordion 删除

主要文件：

- `apps/web/src/editor/features/design/inspector/panels/types.ts`
- `apps/web/src/editor/features/design/inspector/panels/registry.ts`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorStyleTab.tsx`
- `apps/web/src/editor/features/design/inspector/tabs/InspectorCodeTab.tsx`

完成标准：

- Style/Code 两个 tab 的 panel 都来源于同一 registry 机制

---

## Phase 6: 建立 Code Tab 的一等 Panel

目标：

- 将 triggers 升级为真正的 `TriggersPanel`
- 为未来可执行代码挂载建立 `ExternalCodePanel`

主要任务：

- 新增 `panels/TriggersPanel.tsx`
- 将 Add Trigger button 挂到 `TriggersPanel` header actions
- 将冲突提示、空态、列表编辑迁入 `TriggersPanel`
- 新增 `panels/ExternalCodePanel.tsx`
- 为 `ExternalCodePanel` 增加占位 body 或基础配置入口
- 为二者定义清晰的 `match(node)` 规则

主要文件：

- `apps/web/src/editor/features/design/inspector/panels/TriggersPanel.tsx`
- `apps/web/src/editor/features/design/inspector/panels/ExternalCodePanel.tsx`
- `apps/web/src/editor/features/design/inspector/fields/triggers/*`
- `apps/web/src/editor/features/design/BlueprintEditorInspector.controller.ts`

完成标准：

- Code Tab 中不再有手写 section 结构
- Triggers 和 External Code 具备独立 panel 语义

---

## Phase 7: 扩展 Style Tab 的样式域 Panel

目标：

- 在 layout 之外补齐可扩展样式域
- 将样式域拆成独立 panel，而不是继续堆进 LayoutPanel

主要任务：

- 新增 `TypographyPanel`
- 新增 `BackgroundPanel`
- 新增 `BorderPanel`
- 为每个 Panel 定义最小字段范围或占位结构
- 明确哪些字段属于 LayoutPanel，哪些必须移出
- 若 Panel 内字段较多，再拆成 group

建议字段方向：

- `TypographyPanel`
  - font family
  - font size
  - font weight
  - line height
  - letter spacing
  - text align
  - color
- `BackgroundPanel`
  - background color
  - background image
  - background size
  - background position
- `BorderPanel`
  - border
  - border width
  - border color
  - border radius
  - box shadow

主要文件：

- `apps/web/src/editor/features/design/inspector/panels/TypographyPanel.tsx`
- `apps/web/src/editor/features/design/inspector/panels/BackgroundPanel.tsx`
- `apps/web/src/editor/features/design/inspector/panels/BorderPanel.tsx`
- `apps/web/src/editor/features/design/inspector/panels/registry.ts`

完成标准：

- Style Tab 可承载 layout 之外的独立样式域
- 不再把非布局样式继续塞进 LayoutPanel

---

## Phase 8: 收敛 capability-based visibility

目标：

- 明确定义各 Panel 的 `match(node)` 规则
- 明确定义各 Group 的出现条件
- 保证不会出现“不该出现的 Panel/Group”

主要任务：

- 定义“文本能力”判定
- 定义“布局能力”判定
- 定义“外部代码挂载能力”判定
- 为 layout pattern root 增加互斥规则
- 为 group 层补充 `match?`
- 规范 panel 可见性与 context 依赖，不在 panel 内部临时硬编码散落判断

完成标准：

- `LayoutPatternPanel` 与 `LayoutPanel` 不错误共存
- `TypographyPanel` 只在有文本能力时出现
- `ExternalCodePanel` 只在有外部代码能力时出现

---

## Phase 9: 收尾与后续工作

目标：

- 收敛文档、命名和残留实现
- 为后续测试补齐留出稳定接口

主要任务：

- 清理过时注释和旧术语（Section）
- 校正文档注释中的调用链描述
- 检查 panel key / title / capability helper 命名
- 记录后续测试补齐清单

完成标准：

- 代码和文档术语统一
- 后续测试和回归项有清晰挂单

---

## 建议提交切分

1. `refactor(inspector): rename section context to inspector context`
2. `refactor(inspector): move active inspector fields out of sections`
3. `refactor(inspector): add shared panel frame`
4. `fix(inspector): restore classname and external props editing`
5. `refactor(inspector): move code tab panels into registry`
6. `feat(inspector): add external code panel scaffold`
7. `feat(inspector): scaffold typography background and border panels`
8. `refactor(inspector): align inspector panel visibility rules`

---

## 验收标准

### 结构验收

1. 运行时渲染树中不再存在旧 Section 组件
2. 所有活跃 Panel 都通过统一 `InspectorPanelFrame` 渲染
3. 所有 Panel 标题栏右侧都至少有展开折叠按钮

### 功能验收

1. `ClassNamePanel` 可见时，标题栏右侧出现 Mounted CSS action button
2. `BasicTab` 中重新出现 `InspectorExternalPropsFields`
3. `CodeTab` 至少包含 `TriggersPanel` 和 `ExternalCodePanel`
4. `StyleTab` 支持 layout 之外的样式 panel 扩展入口

### 条件渲染验收

1. `LayoutPatternPanel` 与 `LayoutPanel` 不会错误共存
2. `TypographyPanel` 仅在有文本能力节点出现
3. `ExternalCodePanel` 仅在支持外部代码挂载的节点出现
4. 所有 Group 只在该出现时出现

---

## 暂不处理

当前阶段先不把测试作为主计划的一部分。

说明：

- 当前优先级是架构边界、Panel 抽象和显示规则收敛
- 待 Panel 结构稳定后，再统一补测试和回归验证
