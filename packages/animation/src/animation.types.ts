export type AnimationIterations = number | 'infinite';

export type AnimationKeyframe = {
  atMs: number;
  value: number | string;
  easing?: string;
  hold?: boolean;
};

export type AnimationStyleTrack = {
  id: string;
  kind: 'style';
  property:
    | 'opacity'
    | 'transform.translateX'
    | 'transform.translateY'
    | 'transform.scale'
    | 'color';
  keyframes: AnimationKeyframe[];
};

export type AnimationCssFilterTrack = {
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
};

export type AnimationSvgFilterAttributeTrack = {
  id: string;
  kind: 'svg-filter-attr';
  filterId: string;
  primitiveId: string;
  attr: string;
  keyframes: AnimationKeyframe[];
};

export type AnimationTrack =
  | AnimationStyleTrack
  | AnimationCssFilterTrack
  | AnimationSvgFilterAttributeTrack;

export type AnimationBinding = {
  id: string;
  targetNodeId: string;
  tracks: AnimationTrack[];
};

export type SvgFilterPrimitive = {
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
};

export type SvgFilterDefinition = {
  id: string;
  units?: 'objectBoundingBox' | 'userSpaceOnUse';
  primitives: SvgFilterPrimitive[];
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

export type AnimationDefinition = {
  version: 1;
  timelines: AnimationTimeline[];
  svgFilters?: SvgFilterDefinition[];
  'x-animationEditor'?: AnimationEditorState;
};

export type AnimationEntityKind =
  'timeline' | 'binding' | 'track' | 'filter' | 'primitive';

export type AnimationIdFactory = (kind: AnimationEntityKind) => string;

export type AnimationNodeStyle = {
  opacity?: number;
  color?: string;
  transform?: string;
  filter?: string;
};

export type AnimationFrame = {
  stylesByNodeId: ReadonlyMap<string, AnimationNodeStyle>;
  svgFilters: SvgFilterDefinition[];
};
