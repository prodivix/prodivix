# Inspector 全面重构规格书

## 背景

Inspector 当前是蓝图编辑器右侧的一个垂直长条面板，四个 section（基础信息、样式、动画挂载、触发器）上下堆叠，全部展开时需要大量滚动。底层架构也存在严重问题。

### 当前架构问题

| 问题             | 现状                                           | 影响                                       |
| ---------------- | ---------------------------------------------- | ------------------------------------------ |
| 单体 controller  | 772 行 `useBlueprintEditorInspectorController` | 所有逻辑混合，难以维护和扩展               |
| `any` Context    | `createContext<any>(null)`                     | 零类型安全，约 40 个 `(current: any)` 断言 |
| 巨型 LayoutPanel | 1565 行单文件                                  | 全部布局编辑逻辑堆在一起                   |
| 扁平 Context     | ~55 个属性通过单一 Context 传播                | 任何属性变化触发全部子组件重渲染           |
| 模块级可变变量   | 4 个 `let` 变量做持久化                        | 非 React 正规状态，无法 DevTools 调试      |

### 用户需求

将 Inspector 改为**多 tab 切换布局**，用图标而非文字作为 tab 标识（文字写在 `title` 属性中），分为四个 tab：

| Tab          | 图标         | 内容                                                                             |
| ------------ | ------------ | -------------------------------------------------------------------------------- |
| **基础信息** | `Info`       | ID、文本、Icon、Link、Route/Outlet、External Props                               |
| **样式**     | `Paintbrush` | className、LayoutPanel、LayoutPatternPanel、Mounted CSS、Animation Mount/Unmount |
| **数据**     | `Database`   | Data Model、List Template                                                        |
| **代码**     | `Code2`      | 触发器 (Triggers)                                                                |

> className 是样式属性，放在样式 tab。
> Animation 是视觉效果，归样式 tab。
> MountedCssEditorModal 是 overlay，不属于任何 tab，但打开按钮在样式 tab。

---

## Phase 1: 类型系统重建 + Tab UI

### 1.1 定义类型

**新建**: `inspector/sections/InspectorSectionContext.types.ts`

按 tab 职责定义类型切片：

```typescript
export type InspectorTab = 'basic' | 'style' | 'data' | 'code';

// 核心 — 所有 tab 共享
export type InspectorCoreContext = {
  t: TFunction;
  projectId?: string;
  selectedNode: ComponentNode | null;
  updateSelectedNode: InspectorUpdateNode;
  expandedSections: ExpandedSectionsState;
  toggleSection: (key: keyof ExpandedSectionsState) => void;
  expandedPanels: Record<string, boolean>;
  togglePanel: (key: string) => void;
};

// 基础信息 tab — 标识 + 能力
export type InspectorIdentityContext = {
  draftId: string;
  setDraftId: (value: string) => void;
  applyRename: () => void;
  isDirty: boolean;
  canApply: boolean;
  isDuplicate: boolean;
  allNodeIds: string[];
  primaryTextField: { key: string; value: string } | null;
};

export type InspectorCapabilitiesContext = {
  isIconNode: boolean;
  SelectedIconComponent: React.ComponentType | null;
  selectedIconRef: IconRef | null;
  setIconPickerOpen: (open: boolean) => void;
  linkPropKey: string | null;
  linkDestination: string;
  linkTarget: '_self' | '_blank';
  linkRel: string;
  linkTitle: string;
  targetPropKey: string;
  relPropKey: string;
  titlePropKey: string;
  routeOptions: Array<{ id: string; path: string }>;
  outletRouteNodeId: string;
  activeRouteNodeId?: string;
  bindOutletToRoute: ...;
  selectedParentNode: ComponentNode | null;
  externalComponentItem: unknown | null;
  dataModelFieldPaths: string[];
};

// 样式 tab — 布局 + 动画
export type InspectorStyleContext = {
  matchedPanels: InspectorPanelDefinition[];
  hasAnimationDefinition: boolean;
  isAnimationMounted: boolean;
  mountedAnimationBindingCount: number;
  mountSelectedNodeToAnimation: () => void;
  unmountSelectedNodeFromAnimation: () => void;
  openAnimationEditor: () => void;
  canOpenAnimationEditor: boolean;
};

// 数据 tab
export type InspectorDataContext = {
  dataModelFieldPaths: string[];
};

// 代码 tab
export type TriggerEntry = {
  key: string;
  trigger: string;
  action?: string;
  params: Record<string, unknown>;
};

export type InspectorCodeContext = {
  addTrigger: () => void;
  updateTrigger: (triggerKey: string, updater: (event: TriggerEntry) => TriggerEntry) => void;
  removeTrigger: (triggerKey: string) => void;
  hasLinkTriggerConflict: boolean;
  triggerEntries: TriggerEntry[];
  graphOptions: Array<{ id: string; label: string }>;
};
```

组合：`InspectorSectionContextValue = Core & Identity & Capabilities & Style & Data & Code`

### 1.2 更新 Context

**修改**: `InspectorSectionContext.tsx`

```typescript
export const InspectorSectionContext = createContext<InspectorSectionContextValue | null>(null);
export const useInspectorSectionContext = (): InspectorSectionContextValue => { ... };
```

### 1.3 InspectorTabBar

**新建**: `inspector/components/InspectorTabBar.tsx`

- 四个图标按钮（Info / Paintbrush / Database / Code2），无文字
- 文字通过 i18n 写在 `title` 属性中
- active tab 用 `text-(--text-primary)`，inactive 用 `text-(--text-muted)`
- 数据属性 `data-testid="inspector-tab-{key}"`

### 1.4 四个 Tab 内容组件

**新建** (在 `inspector/tabs/` 目录):

| 文件                    | 组合的字段组件                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `InspectorBasicTab.tsx` | InspectorNodeIdentityFields + InspectorNodeCapabilitiesFields（含 className、Icon、Link、Route） |
| `InspectorStyleTab.tsx` | matchedPanels 渲染 + Mounted CSS 按钮 + Animation Mount/Unmount section                          |
| `InspectorDataTab.tsx`  | InspectorDataScopeFields + InspectorListTemplateFields                                           |
| `InspectorCodeTab.tsx`  | InspectorTriggersSection 内容（触发器列表 + CRUD）                                               |

### 1.5 重构入口

**修改**: `BlueprintEditorInspector.tsx`

- 引入 `InspectorTabBar` + 四个 Tab 组件
- `useState<InspectorTab>('basic')` 管理 activeTab
- 用 tab 条件渲染替代垂直 section 堆叠

### 1.6 className 从 CapabilitiesFields 独立

**新建**: `inspector/sections/basic/InspectorClassNameFields.tsx`

- 从 `InspectorNodeCapabilitiesFields` 中提取 className + ClassProtocolEditor 部分
- className 归基础信息 tab，但样式 tab 的 Mounted CSS 按钮仍需 `openMountedCssEditor`

### 1.7 移除所有 `any` 类型断言

移除 `(current: any)` / `(currentEvent: any)` / `(option: any)` casts：

| 文件                                | cast 数量 |
| ----------------------------------- | --------- |
| InspectorNodeIdentityFields.tsx     | 4         |
| InspectorNodeCapabilitiesFields.tsx | 10        |
| InspectorDataScopeFields.tsx        | 5         |
| InspectorExternalPropsFields.tsx    | 2         |
| InspectorListTemplateFields.tsx     | 2         |
| InspectorTriggerItem.tsx            | 3         |
| TriggerNavigateFields.tsx           | 4         |
| TriggerGraphFields.tsx              | 5         |
| InspectorTriggersSection.tsx        | 1         |

**方法**: `updateSelectedNode` 类型为 `(updater: (node: ComponentNode) => ComponentNode) => void`，`ComponentNode` 已包含所有必要字段，`(current: any)` 断言纯粹多余，直接删除即可。

`updateTrigger` 的 `updater` 参数改为 `(event: TriggerEntry) => TriggerEntry`，所有 `(currentEvent: any)` 改为 `(currentEvent)` 依赖类型推导。

---

## Phase 2: Controller 解耦

### 2.1 提取纯函数

**新建**: `inspector/controllerHelpers.ts`

| 函数                           | 来源 (controller 行号) |
| ------------------------------ | ---------------------- |
| `findLayoutPatternRootId`      | 646-659                |
| `findParentNodeById`           | 661-672                |
| `normalizeGraphOptionsFromPir` | 674-710                |
| `isPlainObject`                | 712-713                |
| `LEGACY_DATA_MODEL_KEYS`       | 715                    |
| `extractMountedDataModel`      | 717-737                |
| `collectDataModelFieldPaths`   | 739-758                |
| `findNodePathById`             | 760-772                |

### 2.2 创建子 hooks

**新建** (在 `inspector/hooks/` 目录):

| Hook                            | 对应 tab | 接收参数                                                                                      | 返回                                                         |
| ------------------------------- | -------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `useInspectorIdentityState`     | basic    | selectedNode, pirDocRoot, updatePirDoc, setBlueprintState, blueprintKey                       | InspectorIdentityContext                                     |
| `useInspectorCapabilitiesState` | basic    | selectedNode, updateSelectedNode, pirDoc, routeManifest, activeRouteNodeId, bindOutletToRoute | InspectorCapabilitiesContext                                 |
| `useInspectorStyleState`        | style    | selectedNode, pirDoc, updatePirDoc, projectId, navigate                                       | InspectorStyleContext                                        |
| `useInspectorDataState`         | data     | pirDocRoot, selectedId                                                                        | InspectorDataContext                                         |
| `useInspectorCodeState`         | code     | selectedNode, updateSelectedNode, pirDoc, linkCapability, linkDestination                     | InspectorCodeContext                                         |
| `useInspectorExpansionState`    | —        | selectedNode, matchedPanels                                                                   | expandedSections, expandedPanels, toggleSection, togglePanel |

### 2.3 瘦化主 controller

**修改**: `BlueprintEditorInspector.controller.ts` (772 → ~80-100 行)

变为编排器：读取 Zustand → selectedNode → 组合子 hooks → 组装 sectionContextValue

---

## Phase 3: Context 拆分

### 3.1 领域专用 Context

**新建** (在 `inspector/sections/` 目录):

| 文件                               | 类型                         |
| ---------------------------------- | ---------------------------- |
| `InspectorCoreContext.tsx`         | InspectorCoreContext         |
| `InspectorIdentityContext.tsx`     | InspectorIdentityContext     |
| `InspectorCapabilitiesContext.tsx` | InspectorCapabilitiesContext |
| `InspectorStyleContext.tsx`        | InspectorStyleContext        |
| `InspectorDataContext.tsx`         | InspectorDataContext         |
| `InspectorCodeContext.tsx`         | InspectorCodeContext         |

每个 Context 提供 `useXxxContext()` hook，null 时 throw error。

### 3.2 更新组件消费

每个 tab/field 组件只消费对应的 Context + CoreContext：

- `InspectorBasicTab` → Core + Identity + Capabilities
- `InspectorStyleTab` → Core + Style
- `InspectorDataTab` → Core + Data
- `InspectorCodeTab` → Core + Code

### 3.3 入口 Provider 组合

**修改**: `BlueprintEditorInspector.tsx` — 嵌套 Provider 替代单个 Provider。

**收益**: 切换 tab 时，非活动 tab 的组件不重渲染。

---

## Phase 4: LayoutPanel 拆分

### 4.1 提取纯函数

**新建**: `inspector/panels/layoutPanelHelpers.ts`

迁移所有类型（SpacingKey, LayoutValueKey, BoxSpacing 等）、常量、纯函数（~270 行）。

### 4.2 提取扩展状态

**新建**: `inspector/panels/layoutPanelExpansionState.ts`

迁移 `persistedExpandedSpacingState`, `persistedExpandedGroupsState`, `resetLayoutPanelExpansionPersistence`。

### 4.3 拆分为聚焦组件

**新建** (在 `inspector/panels/` 目录):

| 组件                  | 职责                               | 预估行数 |
| --------------------- | ---------------------------------- | -------- |
| `SpacingControl.tsx`  | margin/padding box-model           | ~90      |
| `DisplaySelector.tsx` | display mode + gap                 | ~80      |
| `SizeGroup.tsx`       | width/height                       | ~50      |
| `AppearanceGroup.tsx` | background, border, radius         | ~80      |
| `FlexGroup.tsx`       | flex direction/justify/align icons | ~210     |
| `GridGroup.tsx`       | grid template/auto-flow/align      | ~210     |

### 4.4 瘦化 LayoutPanelView

**修改**: `LayoutPanel.tsx` (1565 → ~120-150 行)

协调器：读取 node 值 → 管理扩展状态 → 渲染子组件。

---

## Phase 5: 状态管理改善

### 5.1 InspectorExpansion Zustand store

**新建**: `inspector/store/inspectorExpansionStore.ts`

统一管理：

- `expandedPanels`
- `expandedSpacing` (margin/padding)
- `expandedGroups` (spacing/size/appearance/flex/grid)
- `activeTab` (basic/style/data/code)

提供 `toggle*` 和 `resetAllExpansion` 操作。

### 5.2 替换模块级变量

- 删除 controller 中 `persistedExpandedSections/Panels`
- 删除 `layoutPanelExpansionState.ts`
- 测试中 `resetInspectorExpansionPersistence()` → `useInspectorExpansionStore.getState().resetAllExpansion()`

---

## Phase 6: UI 交互细节打磨

### 6.1 Sticky group headers

各 section/panel header 添加 `sticky top-0 z-1 bg-(--bg-canvas)`。

### 6.2 样式统一

section header: `text-[11px] font-semibold text-(--text-secondary)`
panel group header: `text-[10px] font-medium text-(--text-muted)`
hover: `hover:bg-black/3 rounded-md`

### 6.3 LayoutPanel 视觉层级

Display selector 常驻顶部，detail groups 紧凑 accordion (`gap-1`)。

### 6.4 Tab hover/active 微调

图标 tab 风格与 monochrome-ui 一致。

---

## Tab 内容映射详表

| 字段                            | Tab               | 说明                 |
| ------------------------------- | ----------------- | -------------------- |
| ID (draftId/applyRename)        | 基础信息          | 核心标识             |
| 文本 (primaryTextField)         | 基础信息          | 核心内容             |
| className (ClassProtocolEditor) | 基础信息          | 节点基础能力         |
| Icon (IconPickerModal)          | 基础信息          | 节点基础能力         |
| Link (LinkBasicsFields)         | 基础信息          | 节点基础能力         |
| Route/Outlet                    | 基础信息          | 节点基础能力         |
| External Props                  | 基础信息          | 节点基础能力         |
| LayoutPanel                     | 样式              | 视觉布局             |
| LayoutPatternPanel              | 样式              | 视觉模式             |
| Mounted CSS 按钮                | 样式              | CSS 编辑入口         |
| Animation Mount/Unmount         | 样式              | 动画是视觉属性       |
| MountedCssEditorModal           | overlay（跨 tab） | modal 不属于任何 tab |
| Data Model                      | 数据              | 数据绑定             |
| List Template                   | 数据              | 列表渲染             |
| 触发器 (Triggers)               | 代码              | 交互逻辑             |

---

## 执行顺序

```
Phase 1 (类型 + Tab UI)
  ↓
Phase 4 (LayoutPanel 拆分) ← 可与 Phase 2 并行
  ↓
Phase 2 (Controller 解耦) ← 需要 Phase 1 的类型定义
  ↓
Phase 3 (Context 拆分) ← 需要 Phase 2 的子 hooks
  ↓
Phase 5 (Zustand 状态) ← 需要 Phase 2 + 4
  ↓
Phase 6 (UI 打磨)
```

每个 Phase 内的步骤作为独立 commit，格式 `refactor(inspector): ...`。

---

## 验证方式

每个步骤完成后：

1. `tsc --noEmit` — 类型检查
2. `pnpm run test:web` — Inspector 测试
3. `pnpm run format` — 格式化
4. 手动视觉检查（dev server → 浏览器验证 tab 切换和各字段功能）

---

## 关键文件清单

| 文件                                                    | 作用                          |
| ------------------------------------------------------- | ----------------------------- |
| `inspector/sections/InspectorSectionContext.tsx`        | `any` Context → typed Context |
| `inspector/sections/InspectorSectionContext.types.ts`   | 新类型定义                    |
| `inspector/components/InspectorTabBar.tsx`              | 新 tab 栏                     |
| `inspector/tabs/InspectorBasicTab.tsx`                  | 基础信息 tab                  |
| `inspector/tabs/InspectorStyleTab.tsx`                  | 样式 tab                      |
| `inspector/tabs/InspectorDataTab.tsx`                   | 数据 tab                      |
| `inspector/tabs/InspectorCodeTab.tsx`                   | 代码 tab                      |
| `inspector/sections/basic/InspectorClassNameFields.tsx` | className 独立组件            |
| `BlueprintEditorInspector.tsx`                          | 入口重构                      |
| `BlueprintEditorInspector.controller.ts`                | controller 瘦化               |
| `inspector/controllerHelpers.ts`                        | 纯函数提取                    |
| `inspector/hooks/*.ts`                                  | 子 hooks                      |
| `inspector/panels/LayoutPanel.tsx`                      | LayoutPanel 瘦化              |
| `inspector/panels/layoutPanelHelpers.ts`                | LayoutPanel 纯函数            |
| `inspector/panels/SpacingControl.tsx`                   | 独立组件                      |
| `inspector/panels/DisplaySelector.tsx`                  | 独立组件                      |
| `inspector/panels/SizeGroup.tsx`                        | 独立组件                      |
| `inspector/panels/AppearanceGroup.tsx`                  | 独立组件                      |
| `inspector/panels/FlexGroup.tsx`                        | 独立组件                      |
| `inspector/panels/GridGroup.tsx`                        | 独立组件                      |
| `inspector/store/inspectorExpansionStore.ts`            | Zustand store                 |
