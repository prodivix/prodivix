import type { CodeSlotBinding } from '@prodivix/authoring';

export type AnimationIterations = number | 'infinite';

export type AnimationMotionMode = 'full' | 'reduced';

export type AnimationMotionIntent =
  'decorative' | 'spatial' | 'essential' | 'continuous';

export type AnimationMarkerKind = 'checkpoint' | 'handoff' | 'settle';

export type AnimationMarker = {
  id: string;
  atMs: number;
  kind: AnimationMarkerKind;
  requiredInReducedMotion: boolean;
};

export type AnimationReducedMotionPolicy =
  | Readonly<{ kind: 'disabled' }>
  | Readonly<{ kind: 'final-state' }>
  | Readonly<{ kind: 'retain' }>
  | Readonly<{ kind: 'timeline-ref'; timelineId: string }>;

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
  motionIntent: AnimationMotionIntent;
  reducedMotion: AnimationReducedMotionPolicy;
  markers: AnimationMarker[];
  delayMs?: number;
  iterations?: AnimationIterations;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  easing?: string;
  codeSlots?: AnimationTimelineCodeSlots;
  bindings: AnimationBinding[];
};

export type AnimationTimelineCodeSlots = {
  customEasing?: CodeSlotBinding;
  shader?: CodeSlotBinding;
  script?: CodeSlotBinding;
};

export type AnimationEditorState = {
  version: 1;
  activeTimelineId?: string;
  cursorMs?: number;
  zoom?: number;
  expandedTrackIds?: string[];
};

export type AnimationTargetReference = {
  kind: 'pir-document';
  documentId: string;
};

type AnimationCompositionNodeBase = Readonly<{
  id: string;
}>;

export type AnimationTimelineReferenceNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'timeline-ref';
    timelineId: string;
  }>;

export type AnimationCompositionReferenceNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'composition-ref';
    compositionId: string;
  }>;

export type AnimationSequenceNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'sequence';
    children: readonly AnimationCompositionNode[];
  }>;

export type AnimationParallelNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'parallel';
    join: 'all' | 'any' | 'first-success';
    cancelLosers: boolean;
    children: readonly AnimationCompositionNode[];
  }>;

export type AnimationStaggerNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'stagger';
    intervalMs: number;
    children: readonly AnimationCompositionNode[];
  }>;

export type AnimationConditionalVariantNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'conditional-variant';
    full: AnimationCompositionNode;
    reduced: AnimationCompositionNode;
  }>;

export type AnimationCompositionMarkerNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'marker';
    markerId: string;
    markerKind: AnimationMarkerKind;
    requiredInReducedMotion: boolean;
  }>;

export type AnimationHoldNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'hold';
    durationMs: number;
  }>;

export type AnimationSettleNode = AnimationCompositionNodeBase &
  Readonly<{
    kind: 'settle';
    markerId?: string;
  }>;

export type AnimationCompositionNode =
  | AnimationTimelineReferenceNode
  | AnimationCompositionReferenceNode
  | AnimationSequenceNode
  | AnimationParallelNode
  | AnimationStaggerNode
  | AnimationConditionalVariantNode
  | AnimationCompositionMarkerNode
  | AnimationHoldNode
  | AnimationSettleNode;

export type AnimationComposition = Readonly<{
  id: string;
  name: string;
  motionIntent: AnimationMotionIntent;
  root: AnimationCompositionNode;
  reducedRoot?: AnimationCompositionNode;
}>;

export type AnimationDefinition = {
  target: AnimationTargetReference;
  timelines: AnimationTimeline[];
  compositions: AnimationComposition[];
  entryCompositionId?: string;
  svgFilters?: SvgFilterDefinition[];
  'x-animationEditor'?: AnimationEditorState;
};

export type AnimationDecodeIssue = Readonly<{
  path: string;
  message: string;
}>;

export type AnimationDecodeResult =
  | Readonly<{
      ok: true;
      value: AnimationDefinition;
      sourceWireVersion: number;
      appliedMigrations: readonly Readonly<{
        fromVersion: number;
        toVersion: number;
      }>[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly AnimationDecodeIssue[];
    }>;

export type AnimationEntityKind =
  | 'timeline'
  | 'binding'
  | 'track'
  | 'filter'
  | 'primitive'
  | 'composition'
  | 'composition-node'
  | 'marker';

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
