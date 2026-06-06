/**
 * PIR 核心类型定义 v1.3
 */

export type ParamReference = { $param: string };
export type StateReference = { $state: string };
export type DataReference = { $data: string };
export type ItemReference = { $item: string };
export type IndexReference = { $index: true };
export type ScopeSourceReference =
  | ParamReference
  | StateReference
  | DataReference
  | ItemReference;

export type ValueOrRef =
  | unknown
  | ParamReference
  | StateReference
  | DataReference
  | ItemReference
  | IndexReference;

export type NodeDataScope = {
  source?: ScopeSourceReference;
  pick?: string;
  value?: ValueOrRef;
  mock?: ValueOrRef;
  extend?: Record<string, ValueOrRef>;
};

export type NodeListRender = {
  source?: ScopeSourceReference;
  arrayField?: string;
  itemAs?: string;
  indexAs?: string;
  keyBy?: string;
  emptyNodeId?: string;
};

export type AnimationIterations = number | 'infinite';

export type AnimationKeyframe = {
  atMs: number;
  value: number | string;
  easing?: string;
  hold?: boolean;
};

export type AnimationTrack =
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

export type AnimationBinding = {
  id: string;
  targetNodeId: string;
  tracks: AnimationTrack[];
};

export type SvgFilterDefinition = {
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

export type AnimationTimeline = {
  id: string;
  name: string;
  durationMs: number;
  delayMs?: number;
  iterations?: AnimationIterations;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  easing?: string;
  bindings: AnimationBinding[];
};

export type AnimationEditorState = {
  version: 1;
  activeTimelineId?: string;
  cursorMs?: number;
  zoom?: number;
  expandedTrackIds?: string[];
};

export interface AnimationDefinition {
  version: 1;
  timelines: AnimationTimeline[];
  svgFilters?: SvgFilterDefinition[];
  'x-animationEditor'?: AnimationEditorState;
}

export interface ComponentNode {
  id: string;
  type: string;
  text?: ValueOrRef;
  style?: Record<string, ValueOrRef>;
  props?: Record<string, ValueOrRef>;
  data?: NodeDataScope;
  list?: NodeListRender;
  children?: ComponentNode[];
  events?: Record<
    string,
    {
      trigger: string;
      action?: string;
      params?: Record<string, ValueOrRef>;
    }
  >;
}

export type NodeId = string;

export type ComponentNodeData = Omit<ComponentNode, 'children'>;

export type UiGraph = {
  version: 1;
  rootId: NodeId;
  nodesById: Record<NodeId, ComponentNodeData>;
  childIdsById: Record<NodeId, NodeId[]>;
  regionsById?: Record<NodeId, Record<string, NodeId[]>>;
};

// 3. 逻辑层定义 (State & Props)
export interface LogicDefinition {
  props?: Record<
    string,
    {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array' | string;
      description?: string;
      default?: unknown;
    }
  >;

  // 组件内部状态
  state?: Record<
    string,
    {
      type?: string;
      initial: unknown;
    }
  >;

  // 节点图逻辑
  graphs?: unknown[];
}

// 4. 根文档结构
export interface PIRDocument {
  version: '1.3';
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  ui: {
    graph: UiGraph;
  };
  logic?: LogicDefinition; // 👈 挂载逻辑定义
  animation?: AnimationDefinition;
}
