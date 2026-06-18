/* eslint-disable */
/**
 * Generated from specs/pir/PIR-current.json
 * DO NOT EDIT - Run `pnpm --filter @prodivix/shared generate-types` to regenerate.
 */

export type NodeId = string;
export type PathString = string;
export type ValueOrRef =
  | string
  | number
  | boolean
  | null
  | {
      [k: string]: unknown;
    }
  | unknown[]
  | ParamRef
  | StateRef
  | DataRef
  | ItemRef
  | IndexRef;
export type ScopeSourceRef = ParamRef | StateRef | DataRef | ItemRef;
export type Identifier = string;
export type AnimationIterations = number | 'infinite';
export type AnimationTrack =
  | AnimationStyleTrack
  | AnimationCssFilterTrack
  | AnimationSvgFilterAttrTrack;
export type StyleTrackProperty =
  | 'opacity'
  | 'transform.translateX'
  | 'transform.translateY'
  | 'transform.scale'
  | 'color';
export type CssFilterFn =
  | 'blur'
  | 'brightness'
  | 'contrast'
  | 'grayscale'
  | 'hue-rotate'
  | 'invert'
  | 'saturate'
  | 'sepia';
export type SvgFilterPrimitiveType =
  | 'feGaussianBlur'
  | 'feColorMatrix'
  | 'feComponentTransfer'
  | 'feOffset'
  | 'feBlend'
  | 'feMerge';

export interface PIRDocument {
  version: '1.3';
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
     */
    [k: string]: unknown;
  };
  ui: {
    graph: UiGraph;
  };
  logic?: {
    props?: {
      [k: string]: PropDef;
    };
    state?: {
      [k: string]: StateDef;
    };
    graphs?: {
      [k: string]: unknown;
    }[];
    [k: string]: unknown;
  };
  animation?: AnimationDef;
  /**
   * This interface was referenced by `PIRDocument`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface UiGraph {
  version: 1;
  rootId: NodeId;
  nodesById: {
    [k: string]: ComponentNodeData;
  };
  childIdsById: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^[A-Za-z0-9][A-Za-z0-9_.:-]*$".
     */
    [k: string]: NodeId[];
  };
  regionsById?: {
    [k: string]: NodeRegionMap;
  };
  order?: {
    strategy: 'childIdsById';
  };
  /**
   * This interface was referenced by `UiGraph`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z0-9][A-Za-z0-9_.:-]*$".
 */
export interface ComponentNodeData {
  id: NodeId;
  type: string;
  text?: string | ParamRef | StateRef | DataRef | ItemRef | IndexRef;
  style?: {
    [k: string]: ValueOrRef;
  };
  props?: {
    [k: string]: ValueOrRef;
  };
  data?: NodeDataScope;
  list?: NodeListRender;
  events?: {
    [k: string]: EventBinding;
  };
  /**
   * This interface was referenced by `ComponentNodeData`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface ParamRef {
  $param: string;
}
export interface StateRef {
  $state: string;
}
export interface DataRef {
  $data: PathString;
}
export interface ItemRef {
  $item: PathString;
}
export interface IndexRef {
  $index: true;
}
export interface NodeDataScope {
  source?: ScopeSourceRef;
  pick?: PathString;
  value?: ValueOrRef;
  mock?: ValueOrRef;
  extend?: {
    [k: string]: ValueOrRef;
  };
  /**
   * This interface was referenced by `NodeDataScope`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface NodeListRender {
  source?: ScopeSourceRef;
  arrayField?: PathString;
  itemAs?: Identifier;
  indexAs?: Identifier;
  keyBy?: PathString;
  emptyNodeId?: NodeId;
  /**
   * This interface was referenced by `NodeListRender`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface EventBinding {
  trigger: string;
  action?: string;
  params?: {
    [k: string]: ValueOrRef;
  };
  /**
   * This interface was referenced by `EventBinding`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
/**
 * This interface was referenced by `undefined`'s JSON-Schema definition
 * via the `patternProperty` "^[A-Za-z0-9][A-Za-z0-9_.:-]*$".
 */
export interface NodeRegionMap {
  /**
   * This interface was referenced by `NodeRegionMap`'s JSON-Schema definition
   * via the `patternProperty` "^[a-zA-Z_$][a-zA-Z0-9_$-]*$".
   */
  [k: string]: NodeId[];
}
export interface PropDef {
  type: string;
  description?: string;
  default?: unknown;
  [k: string]: unknown;
}
export interface StateDef {
  type?: string;
  initial: unknown;
  [k: string]: unknown;
}
export interface AnimationDef {
  version: 1;
  timelines: AnimationTimeline[];
  svgFilters?: SvgFilterDef[];
  'x-animationEditor'?: AnimationEditorState;
  /**
   * This interface was referenced by `AnimationDef`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationTimeline {
  id: Identifier;
  name: string;
  durationMs: number;
  delayMs?: number;
  iterations?: AnimationIterations;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  easing?: string;
  /**
   * @minItems 1
   */
  bindings: AnimationBinding[];
  /**
   * This interface was referenced by `AnimationTimeline`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationBinding {
  id: Identifier;
  targetNodeId: Identifier;
  /**
   * @minItems 1
   */
  tracks: AnimationTrack[];
  /**
   * This interface was referenced by `AnimationBinding`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationStyleTrack {
  id: NodeId;
  kind: 'style';
  property: StyleTrackProperty;
  /**
   * @minItems 1
   */
  keyframes: AnimationKeyframe[];
  /**
   * This interface was referenced by `AnimationStyleTrack`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationKeyframe {
  atMs: number;
  value: number | string;
  easing?: string;
  hold?: boolean;
  /**
   * This interface was referenced by `AnimationKeyframe`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationCssFilterTrack {
  id: Identifier;
  kind: 'css-filter';
  fn: CssFilterFn;
  unit?: 'px' | '%' | 'deg';
  /**
   * @minItems 1
   */
  keyframes: AnimationKeyframe[];
  /**
   * This interface was referenced by `AnimationCssFilterTrack`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationSvgFilterAttrTrack {
  id: Identifier;
  kind: 'svg-filter-attr';
  filterId: Identifier;
  primitiveId: Identifier;
  attr: string;
  /**
   * @minItems 1
   */
  keyframes: AnimationKeyframe[];
  /**
   * This interface was referenced by `AnimationSvgFilterAttrTrack`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface SvgFilterDef {
  id: Identifier;
  units?: 'objectBoundingBox' | 'userSpaceOnUse';
  /**
   * @minItems 1
   */
  primitives: SvgFilterPrimitiveDef[];
  /**
   * This interface was referenced by `SvgFilterDef`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface SvgFilterPrimitiveDef {
  id: Identifier;
  type: SvgFilterPrimitiveType;
  in?: string;
  in2?: string;
  result?: string;
  attrs?: {
    [k: string]: number | string;
  };
  /**
   * This interface was referenced by `SvgFilterPrimitiveDef`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}
export interface AnimationEditorState {
  version: 1;
  activeTimelineId?: Identifier;
  cursorMs?: number;
  zoom?: number;
  expandedTrackIds?: Identifier[];
  /**
   * This interface was referenced by `AnimationEditorState`'s JSON-Schema definition
   * via the `patternProperty` "^x-[a-zA-Z0-9_.-]+$".
   */
  [k: string]: unknown;
}

export const CURRENT_PIR_VERSION = '1.3' as PIRDocument['version'];
