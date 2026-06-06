# Inspector Layout Grid System

## Context

Inspector 后续还需要做布局层面的优化。除了 Panel 标题之外，Inspector 内部的字段行、图标按钮、输入框、分段控件和组合控件都应落在统一的度量系统上，形成类似 Figma / Framer / Dify 等主流设计工具的网格对齐效果。

当前实现中存在若干不统一现象：

- 普通输入、UnitInput、ColorInput、IconButtonGroup 的高度不完全一致。
- 某些控件使用 `max-w-[100px]`、`w-9`、`min-w-15` 等临时宽度，缺少统一倍数关系。
- GridGroup 中的按钮布局与 FlexGroup 不一致，视觉上更像表单拼装而不是专业属性面板。
- `InspectorRow` 只负责 label/control 的粗略排列，没有强制行高、列宽、控件尺寸。

本规格用于定义 Inspector 内部的布局测量系统。它不改变 Panel 架构本身，也不要求 Panel 标题图标化。

## Goals

1. 除 Panel 标题之外，Inspector 字段行使用统一行高。
2. 字段行内所有核心元素宽度使用固定单位的整数倍。
3. 让 Style Tab 尤其是 Layout / Flex / Grid 控件呈现明显的网格对齐效果。
4. 建立可复用的 inspector layout token，避免在业务组件中继续散落临时尺寸。
5. 保持 monochrome-ui 风格，避免过度装饰。
6. 将 Panel body 和字段行建立在 9 列 grid 基底上。

## Non Goals

1. 不重做 Panel 标题结构。
2. 不要求所有字段都变成图标。
3. 不修改 PIR 数据结构。
4. 不把这些布局 token 放进 `packages/ui`。
5. 不在本规格中处理图标绘制细节，图标资产见 `inspector-style-icon-assets-plan.md`。

## Measurement Tokens

Inspector 应建立自己的局部 token。建议先用常量或 CSS custom properties 表达，后续再视情况收敛到主题系统。

```css
:root {
  --inspector-unit: 4px;
  --inspector-col: 32px;
  --inspector-cols: 9;
  --inspector-body-width: 288px;
  --inspector-panel-padding-x: 16px;
  --inspector-panel-width: 320px;
  --inspector-row-height: 32px;
  --inspector-control-height: 28px;
  --inspector-icon-cell: 24px;
  --inspector-icon-size: 16px;
  --inspector-label-width: 96px;
  --inspector-field-gap: 8px;
  --inspector-control-min: 96px;
  --inspector-control-sm: 128px;
  --inspector-control-md: 160px;
  --inspector-control-lg: 192px;
}
```

规则：

- 基础单位为 `4px`。
- 横向主栅格为 `32px`，每个标准 Inspector body 为 9 列。
- Inspector body 内容宽度为 `288px`，即 `32px * 9`。
- 标准 Inspector panel 建议宽度为 `320px`，即 `16px padding + 288px body + 16px padding`。
- 字段、控件、按钮的宽度优先落在 `32px` 列或半列 `16px` 上。
- 行高优先为 `32px`，复杂字段可以占用多个 `32px` 行单元。
- 普通控件高度为 `28px`，在 `32px` 行内容器中垂直居中。
- 图标按钮外部列宽优先为 `32px`，内部 icon cell 为 `24px`，图标 glyph 为 `16px`。

## Grid Foundation

Inspector 的布局基底应是 grid，但不要求每个控件内部都使用 grid。

```text
Panel body / Field rows: grid system
Concrete controls: flex or grid as needed
```

推荐：

```css
.inspector-panel-body {
  display: grid;
  grid-template-columns: repeat(9, var(--inspector-col));
  column-gap: 0;
  row-gap: 8px;
  width: var(--inspector-body-width);
}

.inspector-row {
  display: grid;
  grid-template-columns: repeat(9, var(--inspector-col));
  grid-column: 1 / -1;
  min-height: var(--inspector-row-height);
  align-items: center;
}

.inspector-label {
  grid-column: span 3;
}

.inspector-control {
  grid-column: span 6;
}
```

说明：

- 如果后续 browser target 明确支持 `subgrid`，`InspectorRow` 可以继承 Panel body 的 grid。
- 首阶段不依赖 `subgrid`，每个 `InspectorRow` 自己声明 9 列更稳。
- `UnitInput`、`ColorInput`、ClassProtocolEditor、RichTextEditor 等控件内部可以继续用 flex / block / local grid。
- 复杂控件必须从外层占据明确列宽，例如 `grid-column: span 9`，而不是用自身内容撑开布局。

## Row Rules

### Standard Row

标准字段行：

```text
row height: 32px
label width: 3 cols = 96px
control area: 6 cols = 192px
control height: 28px
```

适用：

- 文本输入
- select
- checkbox/toggle 行
- color input 单行模式
- width / height / gap / radius 等单值字段

### Multi-Line Row

当字段需要描述文本、富文本编辑器、class protocol editor、trigger item 等复杂内容时，不再强行塞进单行，但外层高度必须仍然按 `32px` 行单元增长：

```text
height = 32px * n
vertical gap = 8px
```

适用：

- `layout="vertical"` 的 `InspectorRow`
- rich text editor
- ClassProtocolEditor
- TriggerItem
- External Props 列表

### Panel Title Exception

Panel 标题不纳入字段行高系统。

原因：

- Panel 标题承担分区识别和折叠控制。
- 标题区可以有独立的 sticky / header action 规则。
- 字段行网格应从 Panel body 开始计算。

## Width Rules

所有核心子元素宽度必须优先落在 `32px` 列网格上；确需更细粒度时使用半列 `16px` 或基础单位 `4px`。

| Element             | Width                          |
| ------------------- | ------------------------------ |
| label column        | `96px`                         |
| label column span   | `3 cols`                       |
| control column      | `192px`                        |
| control column span | `6 cols`                       |
| full row control    | `288px`                        |
| full row span       | `9 cols`                       |
| icon button column  | `32px`                         |
| icon button cell    | `24px`                         |
| icon glyph          | `16px`                         |
| small numeric input | `64px` = `2 cols`              |
| unit input          | `96px` = `3 cols`              |
| compact select      | `96px` or `128px` = `3-4 cols` |
| normal input        | `160px` = `5 cols`             |
| long input          | `192px` = `6 cols`             |
| color swatch        | `24px`                         |
| 2-column field cell | `4 cols + 1 col gap + 4 cols`  |

Avoid:

- `w-9`
- `min-w-15`
- `max-w-[100px]`
- arbitrary values that are not aligned to 4px / 8px grid
- arbitrary values that are not aligned to 32px / 16px / 4px grid

Exception:

- Borders can remain `1px`.
- Divider lines can remain `1px`.
- Canvas-like preview content can use its own aspect ratio.

## InspectorRow Contract

`InspectorRow` should become the main alignment primitive.

Recommended props:

```ts
type InspectorRowProps = {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  layout?: 'horizontal' | 'vertical';
  controlWidth?: 'sm' | 'md' | 'lg' | 'full';
  rowSpan?: 1 | 2 | 3 | 'auto';
};
```

Behavior:

- `horizontal` rows use `min-height: var(--inspector-row-height)`.
- `horizontal` rows use a 9-column grid.
- `horizontal` label uses `span 3`; control uses `span 6`.
- `horizontal` rows align label and control to the same baseline grid.
- `vertical` rows use `gap: 8px` and consume full width.
- `vertical` rows should normally span all 9 columns.
- `description` pushes the row into multi-line mode instead of disturbing single-line row height.
- Control width should be chosen from token values, not arbitrary Tailwind widths.

## Control Rules

### Text Inputs / Selects

- Height: `28px`.
- Width: token driven.
- Text should vertically center within the control.
- Numeric fields should use tabular numbers.

### UnitInput

Target size:

```text
width: 96px
height: 28px
amount area: 48px
unit area: 40px
divider: 1px
padding / border included in component box
```

The current `max-w-[100px]` should be removed.

### ColorInput

Target size:

```text
full component width: 192px
input width: 160px
swatch cell: 24px
gap: 8px
height: 28px
```

The current `w-9` swatch should be changed to `24px`.

### IconButtonGroup

Icon layout controls should favor dense grid buttons without visible text when the icon is precise enough.

Target:

```text
button height: 28px
button width: 32px for dense icon-only controls
icon cell: 24px
gap: 4px / 8px
```

Rules:

- Flex direction can use a `2x2` grid.
- Justify / align groups can use same-size icon cells.
- Grid groups must not use text abbreviations as icons.
- Labels remain in `title` / `aria-label`; visible text is optional and should be avoided for high-density icon controls.

## Layout Tab Specific Rules

### Display Selector

Display mode should be a compact segmented control:

```text
Block | Flex | Grid | None
```

Each segment:

- fixed width: `32px` or `64px`
- height: `28px`
- icon centered
- label in `title`

### Spacing

Margin / Padding controls should align to a box model grid.

Rules:

- outer box dimensions should be multiples of `8px`
- side inputs should share the same width
- center input should align on the same x/y grid as side inputs
- collapsed row should still consume `32px`

### Size

Width / Height should use a two-column grid:

```text
width cell: 4 cols
gap: 1 col
height cell: 4 cols
each column control height: 28px
```

Column widths should be equal and derive from available width.

### Flex

Flex controls should use icon-only buttons when possible:

- direction: 2x2 grid
- justify: 6 equal cells, each `32px`
- align: 5 equal cells, each `32px`

When `flex-direction` changes from row-like to column-like, icons should change orientation but button dimensions must not change.

### Grid

Grid controls should be more explicit than Flex:

- `auto-flow`: 2x2 grid
- `justify-items` / `align-items`: item-in-cell icons
- `justify-content` / `align-content`: whole-grid-in-container icons
- 7-option groups can occupy the full 9-column row; visible options still use fixed `32px` cells.

All grid option buttons in one group must share width and height.

## Implementation Plan

1. Add local inspector sizing tokens.
2. Refactor Panel body to use a 9-column grid with `32px` columns.
3. Refactor `InspectorRow` to enforce row height, label width, 9-column placement, and control width modes.
4. Refactor `IconButtonGroup` to support icon-only dense mode and fixed `32px` option cells.
5. Normalize `UnitInput` to `96px x 28px`.
6. Normalize `ColorInput` to `192px x 28px` with `24px` swatch.
7. Apply the row/grid system to LayoutPanel groups.
8. Replace GridGroup text placeholders with icons from `@/assets/icons`.
9. Audit arbitrary width classes in Inspector and replace them with token-based sizes.

## Acceptance Criteria

- All standard Inspector field rows have a consistent `32px` visual row rhythm.
- Inspector Panel body uses a 9-column grid with `32px` columns.
- Common controls inside rows have a consistent `28px` height.
- Label column width is consistently `3 cols / 96px` across horizontal rows.
- Control column width is consistently `6 cols / 192px` for standard rows.
- Icon buttons use consistent `32px` columns, `24px` cells, and `16px` glyphs.
- UnitInput, ColorInput, IconButtonGroup widths are token-based.
- Grid/Flex option buttons do not resize when selected or when values change.
- GridGroup no longer uses letters as visual icons.
- Arbitrary widths in Inspector are either removed or documented as justified exceptions.
