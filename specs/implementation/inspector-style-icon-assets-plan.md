# Inspector Style Icon Assets Plan

## Context

Inspector 正在向更高密度、更图标化的交互形态演进。本轮图标化的重点不在 Panel 标题，也不在把所有通用动作都包装成项目图标，而在 Style Tab 内部的布局编辑控件，尤其是 Flex / Grid。

现状中 Flex 已经有一批自有图标组件，但 Grid 仍存在 `R` / `C` / `S` / `SB` 等字母占位。字母占位无法表达方向、分布、单元格对齐和整体内容对齐之间的差异，会削弱 Inspector 作为可视化开发工具的专业感。

## Goals

1. 为 Style Tab 的布局控件建立一套项目自有 SVG assets。
2. 优先补齐 Flex / Grid 布局语义，特别是 Grid 的 auto-flow、items alignment、content alignment。
3. 将产品专属图标集中放在 `apps/web/src/assets/icons/`。
4. 保持 Panel 标题文字化，不为 Panel 标题额外引入图标。
5. 通用 Header Action 图标继续直接使用图标库，除非项目组件包装能提供真实规范价值。

## Non Goals

1. 不要求完全自研所有图标。
2. 不把图标放进 `packages/ui`。
3. 不在 `assets/icons` 中做 `export { Plus as AddIcon } from 'lucide-react'` 这类纯别名包装。
4. 不为 Inspector Panel 标题设计图标。
5. 不在本计划中重构所有按钮样式；按钮规范应由独立的 Button / IconButton 组件承担。

## Directory

首批目录建议：

```text
apps/web/src/assets/
  icons/
    layout/
      flex/
      grid/
      spacing/
      size/
      index.ts
    status/
      index.ts
    index.ts
```

说明：

- `layout/`：Style Tab 中的布局语义图标，首批重点。
- `status/`：仅当状态图标具有 Prodivix 自有语义时才放入，例如 mounted / unmounted / missing。
- 不设置 `actions/` 目录，除非未来决定自研通用动作图标。
- Inspector 代码只消费 `@/assets/icons`，不在 Inspector 目录内维护 SVG。

## Source Policy

### Self-Owned Icons

以下场景应使用自研 SVG：

- Flex direction
- Flex justify / align
- Grid auto-flow
- Grid justify-items / align-items
- Grid justify-content / align-content
- spacing / margin / padding
- width / height / gap
- MFE 自有状态语义，如 mounted / unmounted

原因：

- 这些图标表达的是产品专业语义，不是通用动作。
- Grid 的 `items` 和 `content` 需要在图形上明显区分。
- 通用图标库很难准确覆盖 CSS layout inspector 的语义细节。

### Library Icons

以下通用动作继续直接使用图标库：

- add
- delete
- close
- search
- apply / check
- reset
- expand / collapse
- external open
- copy
- settings

原则：

- 业务代码可以直接 `import { Plus, Trash2 } from 'lucide-react'`。
- 不通过 `assets/icons/actions/AddIcon.tsx` 进行纯别名导出。
- 如果需要统一尺寸、strokeWidth、aria-hidden、主题规则，应在共享的 `IconButton` / `ActionButton` 组件层处理。

## First Batch Icon Scope

### Flex

| Icon Key                     | Meaning                                      |
| ---------------------------- | -------------------------------------------- |
| `layout-flex-row`            | `flex-direction: row`                        |
| `layout-flex-row-reverse`    | `flex-direction: row-reverse`                |
| `layout-flex-column`         | `flex-direction: column`                     |
| `layout-flex-column-reverse` | `flex-direction: column-reverse`             |
| `layout-justify-start-x`     | row axis `justify-content: start`            |
| `layout-justify-center-x`    | row axis `justify-content: center`           |
| `layout-justify-end-x`       | row axis `justify-content: end`              |
| `layout-justify-between-x`   | row axis `justify-content: space-between`    |
| `layout-justify-around-x`    | row axis `justify-content: space-around`     |
| `layout-justify-evenly-x`    | row axis `justify-content: space-evenly`     |
| `layout-justify-start-y`     | column axis `justify-content: start`         |
| `layout-justify-center-y`    | column axis `justify-content: center`        |
| `layout-justify-end-y`       | column axis `justify-content: end`           |
| `layout-justify-between-y`   | column axis `justify-content: space-between` |
| `layout-justify-around-y`    | column axis `justify-content: space-around`  |
| `layout-justify-evenly-y`    | column axis `justify-content: space-evenly`  |
| `layout-align-start-x`       | row-like `align-items: start`                |
| `layout-align-center-x`      | row-like `align-items: center`               |
| `layout-align-end-x`         | row-like `align-items: end`                  |
| `layout-align-stretch-x`     | row-like `align-items: stretch`              |
| `layout-align-baseline-x`    | row-like `align-items: baseline`             |
| `layout-align-start-y`       | column-like `align-items: start`             |
| `layout-align-center-y`      | column-like `align-items: center`            |
| `layout-align-end-y`         | column-like `align-items: end`               |
| `layout-align-stretch-y`     | column-like `align-items: stretch`           |
| `layout-align-baseline-y`    | column-like `align-items: baseline`          |

Notes:

- Flex 允许在组件层用同一绘制函数生成 x / y 方向变体，但导出的组件名必须明确。
- 现有 `FlexDirectionIcons` / `JustifyContentIcons` / `AlignItemsIcons` 可以迁入新目录并统一命名。

### Grid

| Icon Key                              | Meaning                         |
| ------------------------------------- | ------------------------------- |
| `layout-grid-flow-row`                | `grid-auto-flow: row`           |
| `layout-grid-flow-column`             | `grid-auto-flow: column`        |
| `layout-grid-flow-row-dense`          | `grid-auto-flow: row dense`     |
| `layout-grid-flow-column-dense`       | `grid-auto-flow: column dense`  |
| `layout-grid-justify-items-start`     | cell item inline start          |
| `layout-grid-justify-items-center`    | cell item inline center         |
| `layout-grid-justify-items-end`       | cell item inline end            |
| `layout-grid-justify-items-stretch`   | cell item inline stretch        |
| `layout-grid-align-items-start`       | cell item block start           |
| `layout-grid-align-items-center`      | cell item block center          |
| `layout-grid-align-items-end`         | cell item block end             |
| `layout-grid-align-items-stretch`     | cell item block stretch         |
| `layout-grid-align-items-baseline`    | cell item baseline              |
| `layout-grid-justify-content-start`   | whole grid inline start         |
| `layout-grid-justify-content-center`  | whole grid inline center        |
| `layout-grid-justify-content-end`     | whole grid inline end           |
| `layout-grid-justify-content-between` | whole grid inline space-between |
| `layout-grid-justify-content-around`  | whole grid inline space-around  |
| `layout-grid-justify-content-evenly`  | whole grid inline space-evenly  |
| `layout-grid-justify-content-stretch` | whole grid inline stretch       |
| `layout-grid-align-content-start`     | whole grid block start          |
| `layout-grid-align-content-center`    | whole grid block center         |
| `layout-grid-align-content-end`       | whole grid block end            |
| `layout-grid-align-content-between`   | whole grid block space-between  |
| `layout-grid-align-content-around`    | whole grid block space-around   |
| `layout-grid-align-content-evenly`    | whole grid block space-evenly   |
| `layout-grid-align-content-stretch`   | whole grid block stretch        |

Notes:

- `items` 图标必须表现为单个 cell 内的小块位置。
- `content` 图标必须表现为整组 grid 在外层容器中的位置。
- dense 图标应通过更紧密的填充块或补位箭头表达，不使用文字 `D`。

### Layout Basics

第二批可补：

| Icon Key               | Meaning       |
| ---------------------- | ------------- |
| `layout-display-block` | block display |
| `layout-display-flex`  | flex display  |
| `layout-display-grid`  | grid display  |
| `layout-display-none`  | hidden / none |
| `layout-width`         | width         |
| `layout-height`        | height        |
| `layout-gap`           | gap           |
| `layout-margin`        | margin        |
| `layout-padding`       | padding       |

## Component Naming

SVG component 文件使用 PascalCase：

```text
apps/web/src/assets/icons/layout/grid/GridFlowRowIcon.tsx
apps/web/src/assets/icons/layout/grid/GridJustifyItemsStartIcon.tsx
apps/web/src/assets/icons/layout/flex/FlexRowIcon.tsx
```

导出名称使用组件名：

```ts
import {
  GridFlowRowIcon,
  GridJustifyItemsStartIcon,
  FlexRowIcon,
} from '@/assets/icons';
```

图标 key 用于设计文档、测试 fixture 或后续 registry；React 代码中优先使用组件名。

## SVG Style Contract

首批图标应遵守：

- `viewBox="0 0 16 16"`
- 默认 `width={16}` / `height={16}`，允许通过 props 覆盖。
- 使用 `currentColor`。
- 线性图标优先，填充只用于表达 grid dense / stretch 等必要状态。
- stroke width 建议 `1.5`，复杂图标可局部调整但整体视觉重量要一致。
- 不在 SVG 内写死黑白之外的颜色。
- 默认 `aria-hidden="true"`，按钮的语义由外层 `aria-label` / `title` 提供。

## Implementation Order

1. 新建 `apps/web/src/assets/icons/layout/grid`，补齐 Grid 图标。
2. 替换 `GridGroup.tsx` 中所有字母占位 icon。
3. 迁移现有 Flex 自有图标到 `assets/icons/layout/flex`，统一导出路径。
4. 确认 `FlexGroup.tsx` 和 `GridGroup.tsx` 只从 `@/assets/icons` 消费布局图标。
5. 第二批补齐 display / spacing / size 图标。

## Acceptance Criteria

- GridGroup 不再使用 `R` / `C` / `S` / `SB` 等文字作为 icon。
- Flex 和 Grid 布局图标来自 `@/assets/icons`。
- `assets/icons` 中不存在对图标库的纯别名 re-export。
- Header Action 图标不进入 `assets/icons/actions`。
- Panel 标题仍然只显示文字。
