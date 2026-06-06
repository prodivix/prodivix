# PIR Contract v1.2 草案（Data Scope + List Render + Animation）

## 文档状态

- Draft
- 日期：2026-02-22
- 关联 ADR：
  - `specs/decisions/10.pir-contract-validation.md`
  - `specs/decisions/15.pir-data-scope-and-list-render.md`

## 1. 目标

在 v1.1 基础上，为“数据驱动渲染 + 动画编排”补齐能力：

1. 节点级数据模型继承（`data`）
2. 节点级列表模板渲染（`list`）
3. 关键帧动画、CSS Filter 动画、SVG Filter 动画（`animation` 域）

## 2. 与 v1.1 的差异

新增：

1. 引用类型：`$data`、`$item`、`$index`
2. 节点字段：`ComponentNode.data`
3. 节点字段：`ComponentNode.list`
4. 顶层字段：`animation`
5. 编辑态扩展：`animation['x-animationEditor']`

保留：

1. `ui.root`、`logic.props`、`logic.state`、`logic.graphs`
2. `$param/$state` 原有语义

## 3. 核心结构（Draft）

```ts
type DataReference = { $data: string };
type ItemReference = { $item: string };
type IndexReference = { $index: true };

type ValueOrRef =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[]
  | { $param: string }
  | { $state: string }
  | DataReference
  | ItemReference
  | IndexReference;

type NodeDataScope = {
  source?:
    | { $param: string }
    | { $state: string }
    | DataReference
    | ItemReference;
  pick?: string;
  extend?: Record<string, ValueOrRef>;
};

type NodeListRender = {
  source:
    | { $param: string }
    | { $state: string }
    | DataReference
    | ItemReference;
  itemAs?: string; // default: item
  indexAs?: string; // default: index
  keyBy?: string;
  emptyNodeId?: string;
};

type AnimationIterations = number | 'infinite';

type AnimationKeyframe = {
  atMs: number;
  value: number | string;
  easing?: string;
  hold?: boolean;
};

type AnimationTrack =
  | {
      id: string;
      kind: 'style';
      property:
        | 'opacity'
        | 'transform.translateX'
        | 'transform.translateY'
        | 'transform.scale'
        | 'color';
      keyframes: AnimationKeyframe[];
    }
  | {
      id: string;
      kind: 'css-filter';
      fn:
        | 'blur'
        | 'brightness'
        | 'contrast'
        | 'grayscale'
        | 'hue-rotate'
        | 'invert'
        | 'saturate'
        | 'sepia';
      unit?: 'px' | '%' | 'deg';
      keyframes: AnimationKeyframe[];
    }
  | {
      id: string;
      kind: 'svg-filter-attr';
      filterId: string;
      primitiveId: string;
      attr: string;
      keyframes: AnimationKeyframe[];
    };

type AnimationBinding = {
  id: string;
  targetNodeId: string;
  tracks: AnimationTrack[];
};

type SvgFilterDef = {
  id: string;
  units?: 'objectBoundingBox' | 'userSpaceOnUse';
  primitives: Array<{
    id: string;
    type:
      | 'feGaussianBlur'
      | 'feColorMatrix'
      | 'feComponentTransfer'
      | 'feOffset'
      | 'feBlend'
      | 'feMerge';
    in?: string;
    in2?: string;
    result?: string;
    attrs?: Record<string, number | string>;
  }>;
};

type PirAnimation = {
  version: 1;
  timelines: Array<{
    id: string;
    name: string;
    durationMs: number;
    delayMs?: number;
    iterations?: AnimationIterations;
    direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
    fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
    easing?: string;
    bindings: AnimationBinding[];
  }>;
  svgFilters?: SvgFilterDef[];
  'x-animationEditor'?: AnimationEditorState;
};

type AnimationEditorState = {
  version: 1;
  activeTimelineId?: string;
  cursorMs?: number;
  zoom?: number;
  expandedTrackIds?: string[];
};

type ComponentNodeV12 = {
  id: string;
  type: string;
  text?:
    | string
    | { $param: string }
    | { $state: string }
    | DataReference
    | ItemReference
    | IndexReference;
  style?: Record<string, ValueOrRef>;
  props?: Record<string, ValueOrRef>;
  data?: NodeDataScope;
  list?: NodeListRender;
  events?: Record<
    string,
    {
      trigger: string;
      action?: string;
      params?: Record<string, ValueOrRef>;
    }
  >;
  children?: ComponentNodeV12[];
};

type PIRDocumentV12 = {
  version: '1.2';
  ui: { root: ComponentNodeV12 };
  logic?: {
    props?: Record<string, unknown>;
    state?: Record<string, unknown>;
    graphs?: unknown[];
  };
  animation?: PirAnimation;
};
```

## 4. 关键约束

1. `list.source` 必填，且运行时必须解析为数组
2. `itemAs/indexAs` 需满足标识符命名规则
3. `list` 与 `data` 可同时存在，`list` 迭代上下文优先于继承上下文
4. `emptyNodeId` 若声明，必须可解析为同文档节点
5. `animation.timelines[*].durationMs` 必须大于 0
6. `keyframes[*].atMs` 必须位于 `[0, durationMs]` 且升序
7. `AnimationBinding.targetNodeId` 必须可在 `ui.root` 中解析
8. `svg-filter-attr` 轨道必须引用存在的 `svgFilters[].id + primitiveId`
9. 非核心扩展字段继续使用 `x-<namespace>` 前缀

## 5. 作用域继承语义

1. 根节点初始 scope 为 `{}`（可由运行时注入）
2. 子节点默认继承父 scope
3. 执行 `data.source` 后替换 scope 根
4. 执行 `data.pick` 后下钻子路径
5. 执行 `data.extend` 后合并派生字段（同名覆盖）

## 6. List 渲染语义

1. `list` 节点视为模板节点
2. 每个数组元素生成一份模板实例
3. 当前项通过 `$item` 读取，索引通过 `$index` 读取
4. 子节点可继续声明 `data` 或嵌套 `list`

## 7. 错误模型（建议）

```json
{
  "details": [
    {
      "code": "PIR_LIST_SOURCE_NOT_ARRAY",
      "path": "/ui/root/children/0/list/source",
      "message": "list.source must resolve to an array"
    }
  ]
}
```

说明：

1. `details` 必须为数组；每项至少包含 `code/path/message`
2. `path` 使用 JSON Pointer（示例：`/ui/root/children/0/list/source`）

建议错误码：

1. `PIR_DATA_SOURCE_INVALID`
2. `PIR_DATA_PICK_INVALID`
3. `PIR_LIST_SOURCE_REQUIRED`
4. `PIR_LIST_SOURCE_NOT_ARRAY`
5. `PIR_LIST_ALIAS_INVALID`
6. `PIR_LIST_EMPTY_NODE_NOT_FOUND`

## 8. 落地顺序（建议）

1. 冻结 `specs/pir/PIR-v1.2.json`（含 `data/list/animation`）
2. 渲染器支持 `data/list` 与新引用
3. 动画运行时支持 timeline + css filter + svg filter 轨道求值
4. Inspector 增加“数据模型/列表/动画轨道”配置能力
5. 代码生成器支持 list 输出（如 React `.map()`）与动画导出
6. 校验器与导出链路完成一致性回归

## 9. Animation 分层约束（v1.2 增补）

1. `animation` 与 `logic` 为并列域，分别服务动画编辑器与节点图编辑器。
2. `animation` 运行语义由 `timelines/svgFilters` 承载；时间轴 UI 状态写入 `animation['x-animationEditor']`。
3. 导出代码只消费 `animation` 运行语义；PIR 文档导出需透传 `x-animationEditor`。
4. 迁移旧文档时，若发现运行层混入 UI 字段（如 `panelWidth/zoomLevel`），保存时必须自动迁移到 `x-animationEditor`。
