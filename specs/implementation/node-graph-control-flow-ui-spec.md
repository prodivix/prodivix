# Node Graph 控制流 UI 规范（Canvas）

## 状态

- Draft
- 日期：2026-02-18
- 范围：仅定义节点图视觉/交互规范，不含颜色主题规范

## 1. 目标

1. 为纯 Canvas 节点图提供统一、可实现、可测试的 UI 规范。
2. 控制流节点在无端口常显文案的前提下，仍保持连接可理解性与可操作性。
3. 支持“节点尺寸自适应内容”，不设置节点最小宽高。

## 2. 术语

1. NodeFrame：节点外框区域。
2. Header：节点头部区域（类型与标题）。
3. Body：节点正文区域（配置摘要）。
4. Port：连接接头（输入/输出）。
5. Slot：端口槽位（用于定义端口垂直顺序，不等同于文案）。
6. Edge：节点之间的控制流连线。

## 3. 全局视觉骨架（无最小宽高）

### 3.1 节点尺寸

1. 节点宽高由内容测量结果决定。
2. 不设置最小宽高，不强制固定模板尺寸。
3. 内边距建议：`paddingX=12`，`paddingY=10`。
4. 圆角建议：`radius=10~12`。
5. 文本超长采用单行省略（ellipsis），避免节点异常拉伸。

### 3.2 文本层级

1. `type` 文本：10px，半粗，英文可大写（如 `IF-ELSE`）。
2. `title` 文本：13px，半粗，主语义名。
3. `meta` 文本：11px，常规，显示关键配置摘要。
4. `code/meta-key`：11px，等宽字体（可选，用于字段名或表达式片段）。

### 3.3 布局节奏

1. Header 行高建议：20~24。
2. Body 每行行高建议：16~18。
3. Header 与 Body 间距建议：6。
4. Body 行间距建议：4~6。

## 4. 端口规范（无常显文本）

### 4.0 Port 语义与形状映射

1. `control` 端口使用圆形。
2. `data` 端口使用方形。
3. `node`（分支/节点类语义）端口使用菱形。
4. `out` 端口为实心，`in` 端口为空心。
5. `multiplicity=multi` 端口保留灰色外圈（或同等弱强调）样式。
6. 若实现层历史字段仍为 `condition`，在渲染与校验中按 `node` 语义处理。

### 4.1 端口几何

1. 端口视觉尺寸：`8~10`。
2. 端口命中热区：`16~20`（独立于视觉尺寸）。
3. 输入端口固定在左边缘，输出端口固定在右边缘。
4. 多端口纵向分布按 Slot 顺序排列。

### 4.2 Slot 顺序规则

1. 同侧多端口从上到下按 `slotOrder` 排列。
2. `slotOrder` 必须是稳定、可序列化的数字。
3. 不显示端口文本时，分支语义由 Slot 顺序和节点内部结构共同表达。

### 4.3 无文案情况下的可理解性补偿

1. Hover 到端口时可显示短浮层（可选），默认不常显。
2. 连线拖拽时高亮可连接端口，降低误连成本。
3. 端口语义通过形状与实心/空心表达，不依赖颜色。

### 4.4 连接约束（必须）

1. 仅允许 `out -> in`。
2. 仅允许同类别连接：
   - `control -> control`
   - `data -> data`
   - `node -> node`
3. 跨类别连接默认禁止；只有在节点端口显式声明白名单时才可放开。

### 4.5 默认连接数（multiplicity）

默认规则如下（节点定义可覆写）：

1. 控制流：`control.out=single`，`control.in=multi`。
2. 数据流：`data.out=multi`，`data.in=single`。
3. 节点类：`node.in=single`，`node.out=multi`。

### 4.6 单连接端口替换策略

1. `single` 源端口发起新连接时，替换该源端口旧连接。
2. `single` 目标端口接收新连接时，替换该目标端口旧连接。
3. 不提示“已占用”；连线结果本身即为反馈。

## 5. 连线规范（控制流）

1. 曲线：贝塞尔曲线。
2. 线宽：默认 `2`，选中 `3`。
3. 终点箭头：统一显示。
4. 拖拽中的临时线：虚线（如 `6 4`）。
5. 控制流 Edge 类型固定为 `control`。
6. 边锚点来自端口中心点，进入/离开边缘时加短水平偏移（减少贴边锯齿感）。

## 6. 节点类型与组成规范

以下定义结构、文本组成、端口槽位，不定义颜色。

### 6.1 `start`

1. 组成：Header（type + title），可无 Body。
2. 端口：`out.next(slot=0)`。
3. 文本：标题建议“Start”或业务入口名。

### 6.2 `end`

1. 组成：Header（type + title），可无 Body。
2. 端口：`in.prev(slot=0)`。
3. 文本：标题建议“End”或业务终点名。

### 6.3 `if-else`

1. 组成：Header + Body（条件摘要 1 行）。
2. 端口：`in.prev(slot=0)`；`out.true(slot=0)`；`out.false(slot=1)`。
3. Slot 顺序约定：`true` 在上，`false` 在下。

### 6.4 `switch`

1. 组成：Header + Body（表达式 + case 数摘要）。
2. 端口：`in.prev(slot=0)`；`out.case-0(slot=0..n)`；`out.default(slot=999)`。
3. Slot 顺序约定：所有 case 在上，`default` 永远最后。

### 6.5 `for-each`

1. 组成：Header + Body（集合来源、item/index scope identity）。
2. 端口：`in.prev(slot=0)`；`out.loop(slot=0)`；`out.done(slot=1)`。
3. Slot 顺序约定：`loop` 在上，`done` 在下。

### 6.6 `while`

1. 组成：Header + Body（条件摘要）。
2. 端口：`in.prev(slot=0)`；`out.loop(slot=0)`；`out.done(slot=1)`。
3. Slot 顺序约定：`loop` 在上，`done` 在下。

### 6.7 `break`

1. 组成：紧凑 Header（可无 Body）。
2. 端口：`in.prev(slot=0)`；`out.break(slot=0)`。
3. 用途：仅允许在循环作用域内。

### 6.8 `continue`

1. 组成：紧凑 Header（可无 Body）。
2. 端口：`in.prev(slot=0)`；`out.continue(slot=0)`。
3. 用途：仅允许在循环作用域内。

### 6.9 `merge`

1. 组成：Header + 可选 Body（汇合说明）。
2. 端口：`in.in0..inN(slot=0..n)`；`out.next(slot=0)`。
3. 输入端口数量可动态扩展。

### 6.10 `parallel-fork`（可选）

1. 组成：Header + Body（并行数摘要）。
2. 端口：`in.prev(slot=0)`；`out.branch-0..n(slot=0..n)`。

### 6.11 `join`（可选）

1. 组成：Header + Body（汇合策略摘要）。
2. 端口：`in.in0..inN(slot=0..n)`；`out.next(slot=0)`。

## 7. 状态态规范

1. `default`：标准外框与端口。
2. `hover`：节点外框增强，端口热区可视化。
3. `selected`：节点/边加粗或双描边。
4. `running`：节点右上角运行标记，边可做轻微流动效果。
5. `error`：节点右上角错误标记，Body 首行显示错误摘要。
6. `readonly`：禁用连线修改与拖拽，保留可读交互。

## 8. 纯 Canvas 渲染接口建议

```ts
type PortDef = {
  id: string;
  side: 'left' | 'right';
  slotOrder: number;
  role: 'in' | 'out';
  kind: 'control' | 'data' | 'node';
  multiplicity?: 'single' | 'multi';
  acceptsKinds?: Array<'control' | 'data' | 'node'>;
};

type NodeRenderDef = {
  type: string; // kebab-case
  measure: (
    data: unknown,
    textMeasurer: TextMeasurer
  ) => { width: number; height: number };
  draw: (ctx: CanvasRenderingContext2D, box: Rect, state: RenderState) => void;
  ports: (data: unknown) => PortDef[];
  hitTest: (point: Point, box: Rect) => HitResult | null;
};
```

## 9. 校验与验收要点

1. 无端口文案下，端口 hover/拖拽可识别。
2. 所有控制流节点端口顺序稳定，不因内容变化抖动。
3. 节点尺寸随内容变化但不破坏端口对齐。
4. `if-else/for-each/while` 的上下分支位置固定。
5. 连线创建、重连、删除交互一致。
6. 跨类别连线被拒绝，不产生脏边数据。
7. `single` 端口重复连线时表现为稳定替换，且无“已占用”提示。

## 10. 非目标

1. 不定义节点颜色、主题 token。
2. 不定义业务执行语义细节（由执行器规范负责）。
3. 不定义拖拽新建节点（本期不做）。
4. 不提供“端口已占用”提示文案（菜单项、toast 等）。
