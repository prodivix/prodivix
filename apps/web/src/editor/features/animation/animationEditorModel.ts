import type {
  AnimationBinding,
  AnimationDefinition,
  AnimationEditorState,
  AnimationKeyframe,
  AnimationTrack,
  AnimationTimeline,
  SvgFilterDefinition,
} from '@/core/types/engine.types';

const STORAGE_PREFIX = 'prodivix:animation:native';
const DEFAULT_TIMELINE_DURATION_MS = 1000;
const DEFAULT_TIMELINE_NAME = 'Timeline';
const DEFAULT_BINDING_TARGET_NODE_ID = 'root';
const DEFAULT_TRACK_KIND: AnimationTrack['kind'] = 'style';

type StyleTrack = Extract<AnimationTrack, { kind: 'style' }>;
type CssFilterTrack = Extract<AnimationTrack, { kind: 'css-filter' }>;
type SvgFilterAttrTrack = Extract<AnimationTrack, { kind: 'svg-filter-attr' }>;
type SvgFilterPrimitive = SvgFilterDefinition['primitives'][number];

export const STYLE_TRACK_PROPERTIES: StyleTrack['property'][] = [
  'opacity',
  'transform.translateX',
  'transform.translateY',
  'transform.scale',
  'color',
];

export const CSS_FILTER_FUNCTIONS: CssFilterTrack['fn'][] = [
  'blur',
  'brightness',
  'contrast',
  'grayscale',
  'hue-rotate',
  'invert',
  'saturate',
  'sepia',
];

export const CSS_FILTER_UNITS: NonNullable<CssFilterTrack['unit']>[] = [
  'px',
  '%',
  'deg',
];

export const SVG_FILTER_PRIMITIVE_TYPES: SvgFilterPrimitive['type'][] = [
  'feGaussianBlur',
  'feColorMatrix',
  'feComponentTransfer',
  'feOffset',
  'feBlend',
  'feMerge',
];

const DIRECTION_VALUES = new Set<NonNullable<AnimationTimeline['direction']>>([
  'normal',
  'reverse',
  'alternate',
  'alternate-reverse',
]);

const FILL_MODE_VALUES = new Set<NonNullable<AnimationTimeline['fillMode']>>([
  'none',
  'forwards',
  'backwards',
  'both',
]);
const STYLE_TRACK_PROPERTY_VALUES = new Set(STYLE_TRACK_PROPERTIES);
const CSS_FILTER_FN_VALUES = new Set(CSS_FILTER_FUNCTIONS);
const CSS_FILTER_UNIT_VALUES = new Set(CSS_FILTER_UNITS);
const SVG_FILTER_PRIMITIVE_VALUES = new Set(SVG_FILTER_PRIMITIVE_TYPES);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isAnimationTrack = (value: unknown): value is AnimationTrack =>
  isPlainObject(value) && typeof value.kind === 'string';

const clampDurationMs = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMELINE_DURATION_MS;

const clampKeyframeAtMs = (atMs: number, durationMs: number) =>
  Math.min(durationMs, Math.max(0, atMs));

const normalizeId = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

const createTimelineId = () =>
  `timeline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const createBindingId = () =>
  `binding-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const createTrackId = () =>
  `track-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const createSvgFilterId = (index: number) => `filter-${index + 1}`;

const createSvgPrimitiveId = (index: number) => `primitive-${index + 1}`;

const resolveCssFilterUnit = (
  fn: CssFilterTrack['fn']
): NonNullable<CssFilterTrack['unit']> => {
  if (fn === 'hue-rotate') return 'deg';
  if (fn === 'blur') return 'px';
  return '%';
};

const createKeyframes = (
  durationMs: number,
  from: number | string,
  to: number | string
): AnimationKeyframe[] => {
  const clampedDuration = clampDurationMs(durationMs);
  return [
    { atMs: 0, value: from },
    { atMs: clampedDuration, value: to },
  ];
};

const resolveTrackFallbackValue = (track: AnimationTrack): number | string => {
  if (track.kind === 'style') {
    if (track.property === 'color') return '#111111';
    if (track.property === 'transform.scale') return 1;
    return 0;
  }
  if (track.kind === 'css-filter') {
    if (
      track.fn === 'brightness' ||
      track.fn === 'contrast' ||
      track.fn === 'saturate'
    ) {
      return 100;
    }
    return 0;
  }
  return 0;
};

const normalizeKeyframe = (
  source: unknown,
  durationMs: number,
  fallbackValue: number | string
): AnimationKeyframe | null => {
  if (!isPlainObject(source)) return null;
  const atMs = isFiniteNumber(source.atMs)
    ? clampKeyframeAtMs(source.atMs, durationMs)
    : 0;
  const value =
    typeof source.value === 'string' || isFiniteNumber(source.value)
      ? source.value
      : fallbackValue;
  const keyframe: AnimationKeyframe = {
    atMs,
    value,
  };
  if (typeof source.easing === 'string' && source.easing.trim()) {
    keyframe.easing = source.easing.trim();
  }
  if (typeof source.hold === 'boolean') {
    keyframe.hold = source.hold;
  }
  return keyframe;
};

const normalizeKeyframes = (
  source: unknown,
  durationMs: number,
  fallbackValue: number | string
): AnimationKeyframe[] => {
  const rows = Array.isArray(source)
    ? source
        .map((item) => normalizeKeyframe(item, durationMs, fallbackValue))
        .filter((item): item is AnimationKeyframe => Boolean(item))
    : [];
  if (!rows.length) {
    return [{ atMs: 0, value: fallbackValue }];
  }
  const keyframeMap = new Map<number, AnimationKeyframe>();
  rows.forEach((row) => {
    keyframeMap.set(row.atMs, row);
  });
  return Array.from(keyframeMap.values()).sort((a, b) => a.atMs - b.atMs);
};

const normalizeSvgPrimitive = (
  source: unknown,
  index: number
): SvgFilterPrimitive | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeId(source.id) || createSvgPrimitiveId(index);
  const type = SVG_FILTER_PRIMITIVE_VALUES.has(
    source.type as SvgFilterPrimitive['type']
  )
    ? (source.type as SvgFilterPrimitive['type'])
    : 'feGaussianBlur';
  const primitive: SvgFilterPrimitive = {
    id,
    type,
  };
  if (typeof source.in === 'string' && source.in.trim()) {
    primitive.in = source.in.trim();
  }
  if (typeof source.in2 === 'string' && source.in2.trim()) {
    primitive.in2 = source.in2.trim();
  }
  if (typeof source.result === 'string' && source.result.trim()) {
    primitive.result = source.result.trim();
  }
  if (isPlainObject(source.attrs)) {
    const attrs = Object.entries(source.attrs).reduce<
      Record<string, number | string>
    >((acc, [key, value]) => {
      if (typeof value === 'string' || isFiniteNumber(value)) {
        acc[key] = value;
      }
      return acc;
    }, {});
    if (Object.keys(attrs).length) {
      primitive.attrs = attrs;
    }
  }
  return primitive;
};

const normalizeSvgFilter = (
  source: unknown,
  index: number
): SvgFilterDefinition | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeId(source.id) || createSvgFilterId(index);
  const primitiveIdSet = new Set<string>();
  const primitives: SvgFilterDefinition['primitives'] = [];
  const rawPrimitives = Array.isArray(source.primitives)
    ? source.primitives
    : [];
  rawPrimitives.forEach((primitive, primitiveIndex) => {
    const normalized = normalizeSvgPrimitive(primitive, primitiveIndex);
    if (!normalized) return;
    if (primitiveIdSet.has(normalized.id)) {
      normalized.id = createSvgPrimitiveId(primitives.length);
    }
    primitiveIdSet.add(normalized.id);
    primitives.push(normalized);
  });
  if (!primitives.length) {
    primitives.push({
      id: createSvgPrimitiveId(0),
      type: 'feGaussianBlur',
      attrs: { stdDeviation: 0 },
    });
  }
  const filter: SvgFilterDefinition = {
    id,
    primitives,
  };
  if (
    source.units === 'objectBoundingBox' ||
    source.units === 'userSpaceOnUse'
  ) {
    filter.units = source.units;
  }
  return filter;
};

const normalizeSvgFilters = (source: unknown): SvgFilterDefinition[] => {
  if (!Array.isArray(source)) return [];
  const filterIdSet = new Set<string>();
  const filters: SvgFilterDefinition[] = [];
  source.forEach((filter, filterIndex) => {
    const normalized = normalizeSvgFilter(filter, filterIndex);
    if (!normalized) return;
    if (filterIdSet.has(normalized.id)) {
      normalized.id = createSvgFilterId(filters.length);
    }
    filterIdSet.add(normalized.id);
    filters.push(normalized);
  });
  return filters;
};

const resolveSvgTrackDefaults = (
  filters: SvgFilterDefinition[]
): Pick<SvgFilterAttrTrack, 'filterId' | 'primitiveId' | 'attr'> => {
  const filterId = filters[0]?.id ?? createSvgFilterId(0);
  const primitiveId = filters[0]?.primitives[0]?.id ?? createSvgPrimitiveId(0);
  return {
    filterId,
    primitiveId,
    attr: 'stdDeviation',
  };
};

const normalizeTrack = (
  source: unknown,
  durationMs: number,
  svgFilters: SvgFilterDefinition[]
): AnimationTrack | null => {
  if (!isAnimationTrack(source)) return null;
  const id = normalizeId(source.id) || createTrackId();
  if (source.kind === 'style') {
    const property = STYLE_TRACK_PROPERTY_VALUES.has(
      source.property as StyleTrack['property']
    )
      ? (source.property as StyleTrack['property'])
      : 'opacity';
    const fallbackTrack: StyleTrack = {
      id,
      kind: 'style',
      property,
      keyframes: [
        {
          atMs: 0,
          value: resolveTrackFallbackValue({
            id,
            kind: 'style',
            property,
            keyframes: [],
          }),
        },
      ],
    };
    const fallbackValue = resolveTrackFallbackValue(fallbackTrack);
    return {
      id,
      kind: 'style',
      property,
      keyframes: normalizeKeyframes(
        source.keyframes,
        durationMs,
        fallbackValue
      ),
    };
  }
  if (source.kind === 'css-filter') {
    const fn = CSS_FILTER_FN_VALUES.has(source.fn as CssFilterTrack['fn'])
      ? (source.fn as CssFilterTrack['fn'])
      : 'blur';
    const unit = CSS_FILTER_UNIT_VALUES.has(
      source.unit as NonNullable<CssFilterTrack['unit']>
    )
      ? (source.unit as NonNullable<CssFilterTrack['unit']>)
      : resolveCssFilterUnit(fn);
    const fallbackTrack: CssFilterTrack = {
      id,
      kind: 'css-filter',
      fn,
      unit,
      keyframes: [{ atMs: 0, value: 0 }],
    };
    const fallbackValue = resolveTrackFallbackValue(fallbackTrack);
    return {
      id,
      kind: 'css-filter',
      fn,
      unit,
      keyframes: normalizeKeyframes(
        source.keyframes,
        durationMs,
        fallbackValue
      ),
    };
  }
  if (source.kind !== 'svg-filter-attr') return null;
  const defaults = resolveSvgTrackDefaults(svgFilters);
  const filterId = normalizeId(source.filterId) || defaults.filterId;
  const matchedFilter =
    svgFilters.find((filter) => filter.id === filterId) ?? svgFilters[0];
  const primitiveId =
    normalizeId(source.primitiveId) ||
    matchedFilter?.primitives[0]?.id ||
    defaults.primitiveId;
  const attr =
    typeof source.attr === 'string' && source.attr.trim()
      ? source.attr.trim()
      : defaults.attr;
  const fallbackTrack: SvgFilterAttrTrack = {
    id,
    kind: 'svg-filter-attr',
    filterId,
    primitiveId,
    attr,
    keyframes: [{ atMs: 0, value: 0 }],
  };
  const fallbackValue = resolveTrackFallbackValue(fallbackTrack);
  return {
    id,
    kind: 'svg-filter-attr',
    filterId,
    primitiveId,
    attr,
    keyframes: normalizeKeyframes(source.keyframes, durationMs, fallbackValue),
  };
};

const normalizeBinding = (
  source: unknown,
  durationMs: number,
  svgFilters: SvgFilterDefinition[]
): AnimationBinding | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeId(source.id) || createBindingId();
  const targetNodeId =
    normalizeId(source.targetNodeId) || DEFAULT_BINDING_TARGET_NODE_ID;
  const trackIdSet = new Set<string>();
  const tracks: AnimationTrack[] = [];
  const rawTracks = Array.isArray(source.tracks) ? source.tracks : [];
  rawTracks.forEach((track, trackIndex) => {
    const normalized = normalizeTrack(track, durationMs, svgFilters);
    if (!normalized) return;
    if (trackIdSet.has(normalized.id)) {
      normalized.id = createTrackId();
    }
    trackIdSet.add(normalized.id);
    tracks.push(normalized);
  });
  return {
    id,
    targetNodeId,
    tracks,
  };
};

const normalizeTimeline = (
  source: unknown,
  index: number,
  svgFilters: SvgFilterDefinition[]
): AnimationTimeline | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeId(source.id) || createTimelineId();
  const name =
    typeof source.name === 'string' && source.name.trim()
      ? source.name.trim()
      : `${DEFAULT_TIMELINE_NAME} ${index + 1}`;
  const durationMs = clampDurationMs(
    isFiniteNumber(source.durationMs)
      ? source.durationMs
      : DEFAULT_TIMELINE_DURATION_MS
  );
  const bindings = Array.isArray(source.bindings)
    ? source.bindings
        .map((binding, bindingIndex) =>
          normalizeBinding(binding, durationMs, svgFilters)
        )
        .filter((binding): binding is AnimationBinding => Boolean(binding))
    : [];
  const timeline: AnimationTimeline = {
    id,
    name,
    durationMs,
    bindings,
  };
  if (isFiniteNumber(source.delayMs) && source.delayMs >= 0) {
    timeline.delayMs = source.delayMs;
  }
  const iterations = source.iterations;
  if (
    iterations === 'infinite' ||
    (typeof iterations === 'number' &&
      Number.isInteger(iterations) &&
      iterations > 0)
  ) {
    timeline.iterations = iterations;
  }
  if (
    typeof source.direction === 'string' &&
    DIRECTION_VALUES.has(
      source.direction as NonNullable<AnimationTimeline['direction']>
    )
  ) {
    timeline.direction = source.direction as NonNullable<
      AnimationTimeline['direction']
    >;
  }
  if (
    typeof source.fillMode === 'string' &&
    FILL_MODE_VALUES.has(
      source.fillMode as NonNullable<AnimationTimeline['fillMode']>
    )
  ) {
    timeline.fillMode = source.fillMode as NonNullable<
      AnimationTimeline['fillMode']
    >;
  }
  if (typeof source.easing === 'string' && source.easing.trim()) {
    timeline.easing = source.easing.trim();
  }
  return timeline;
};

const normalizeAnimationEditorState = (
  source: unknown
): AnimationEditorState | undefined => {
  if (!isPlainObject(source)) return undefined;
  const nextState: AnimationEditorState = { version: 1 };
  const activeTimelineId = normalizeId(source.activeTimelineId);
  if (activeTimelineId) {
    nextState.activeTimelineId = activeTimelineId;
  }
  if (isFiniteNumber(source.cursorMs) && source.cursorMs >= 0) {
    nextState.cursorMs = source.cursorMs;
  }
  if (isFiniteNumber(source.zoom) && source.zoom > 0) {
    nextState.zoom = source.zoom;
  }
  if (Array.isArray(source.expandedTrackIds)) {
    const seen = new Set<string>();
    const trackIds = source.expandedTrackIds
      .map((item) => normalizeId(item))
      .filter((item) => {
        if (!item || seen.has(item)) return false;
        seen.add(item);
        return true;
      });
    if (trackIds.length) {
      nextState.expandedTrackIds = trackIds;
    }
  }
  return nextState;
};

export const createEmptyAnimationDefinition = (): AnimationDefinition => ({
  version: 1,
  timelines: [],
});

export const createAnimationStorageKey = (projectId: string) =>
  `${STORAGE_PREFIX}:${projectId}`;

export const createDefaultTimeline = (
  index: number = 0
): AnimationTimeline => ({
  id: createTimelineId(),
  name: `${DEFAULT_TIMELINE_NAME} ${index + 1}`,
  durationMs: DEFAULT_TIMELINE_DURATION_MS,
  bindings: [],
});

export const createDefaultBinding = (
  index: number = 0,
  targetNodeId: string = DEFAULT_BINDING_TARGET_NODE_ID
): AnimationBinding => ({
  id:
    index >= 0
      ? `binding-${index + 1}-${Math.random().toString(36).slice(2, 6)}`
      : createBindingId(),
  targetNodeId: targetNodeId.trim() || DEFAULT_BINDING_TARGET_NODE_ID,
  tracks: [],
});

export const createDefaultTrack = ({
  kind = DEFAULT_TRACK_KIND,
  durationMs,
  svgFilters = [],
}: {
  kind?: AnimationTrack['kind'];
  durationMs: number;
  svgFilters?: SvgFilterDefinition[];
}): AnimationTrack => {
  const clampedDuration = clampDurationMs(durationMs);
  const id = createTrackId();
  if (kind === 'style') {
    return {
      id,
      kind: 'style',
      property: 'opacity',
      keyframes: createKeyframes(clampedDuration, 0, 1),
    };
  }
  if (kind === 'css-filter') {
    return {
      id,
      kind: 'css-filter',
      fn: 'blur',
      unit: 'px',
      keyframes: createKeyframes(clampedDuration, 0, 8),
    };
  }
  const defaults = resolveSvgTrackDefaults(svgFilters);
  return {
    id,
    kind: 'svg-filter-attr',
    filterId: defaults.filterId,
    primitiveId: defaults.primitiveId,
    attr: defaults.attr,
    keyframes: createKeyframes(clampedDuration, 0, 4),
  };
};

export const createDefaultSvgPrimitive = (
  index: number = 0
): SvgFilterPrimitive => ({
  id: createSvgPrimitiveId(index),
  type: 'feGaussianBlur',
  attrs: { stdDeviation: 0 },
});

export const createDefaultSvgFilter = (
  index: number = 0
): SvgFilterDefinition => ({
  id: createSvgFilterId(index),
  units: 'objectBoundingBox',
  primitives: [createDefaultSvgPrimitive(0)],
});

export const normalizeAnimationDefinition = (
  source: unknown
): AnimationDefinition | null => {
  if (!isPlainObject(source)) return null;
  const svgFilters = normalizeSvgFilters(source.svgFilters);
  const rawTimelines = Array.isArray(source.timelines) ? source.timelines : [];
  const timelineIdSet = new Set<string>();
  const timelines: AnimationTimeline[] = [];
  rawTimelines.forEach((timeline, index) => {
    const normalized = normalizeTimeline(timeline, index, svgFilters);
    if (!normalized) return;
    if (timelineIdSet.has(normalized.id)) {
      normalized.id = createTimelineId();
    }
    timelineIdSet.add(normalized.id);
    timelines.push(normalized);
  });
  const normalized: AnimationDefinition = {
    version: 1,
    timelines,
  };
  if (svgFilters.length) {
    normalized.svgFilters = svgFilters;
  }
  const editorState = normalizeAnimationEditorState(
    source['x-animationEditor']
  );
  if (editorState) {
    normalized['x-animationEditor'] = editorState;
  }
  return normalized;
};

export const ensureAnimationDefinition = (
  source: unknown
): AnimationDefinition =>
  normalizeAnimationDefinition(source) ?? createEmptyAnimationDefinition();

export const serializeAnimationDefinition = (
  source: AnimationDefinition | null | undefined
) => JSON.stringify(source ?? createEmptyAnimationDefinition());

export const loadProjectAnimationSnapshot = (
  projectId: string
): AnimationDefinition => {
  const fallback = createEmptyAnimationDefinition();
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(
      createAnimationStorageKey(projectId)
    );
    if (!raw) return fallback;
    return ensureAnimationDefinition(JSON.parse(raw));
  } catch {
    return fallback;
  }
};
