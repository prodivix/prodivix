import type {
  AnimationBinding,
  AnimationDefinition,
  AnimationEditorState,
  AnimationIdFactory,
  AnimationKeyframe,
  AnimationTrack,
  AnimationTimeline,
  AnimationTimelineCodeSlots,
  AnimationTargetReference,
  SvgFilterDefinition,
  SvgFilterPrimitive,
} from './animation.types';
import type { CodeReference, CodeSlotBinding } from '@prodivix/authoring';

export const DEFAULT_TIMELINE_DURATION_MS = 1000;
export const DEFAULT_TIMELINE_NAME = 'Timeline';
export const DEFAULT_BINDING_TARGET_NODE_ID = 'root';

type StyleTrack = Extract<AnimationTrack, { kind: 'style' }>;
type CssFilterTrack = Extract<AnimationTrack, { kind: 'css-filter' }>;
type SvgFilterAttrTrack = Extract<AnimationTrack, { kind: 'svg-filter-attr' }>;

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

const normalizeId = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : '';

const normalizeCodeReference = (source: unknown): CodeReference | null => {
  if (!isPlainObject(source)) return null;
  const artifactId = normalizeId(source.artifactId);
  if (!artifactId) return null;
  const reference: CodeReference = { artifactId };
  const exportName = normalizeId(source.exportName);
  const symbolId = normalizeId(source.symbolId);
  if (exportName) reference.exportName = exportName;
  if (symbolId) reference.symbolId = symbolId;
  if (isPlainObject(source.sourceSpan)) {
    const spanArtifactId = normalizeId(source.sourceSpan.artifactId);
    const coordinates = [
      source.sourceSpan.startLine,
      source.sourceSpan.startColumn,
      source.sourceSpan.endLine,
      source.sourceSpan.endColumn,
    ];
    if (
      spanArtifactId === artifactId &&
      coordinates.every(
        (value) =>
          typeof value === 'number' && Number.isInteger(value) && value >= 1
      )
    ) {
      reference.sourceSpan = {
        artifactId,
        startLine: coordinates[0] as number,
        startColumn: coordinates[1] as number,
        endLine: coordinates[2] as number,
        endColumn: coordinates[3] as number,
      };
    }
  }
  return reference;
};

const normalizeCodeSlotBinding = (source: unknown): CodeSlotBinding | null => {
  if (!isPlainObject(source)) return null;
  const slotId = normalizeId(source.slotId);
  const reference = normalizeCodeReference(source.reference);
  return slotId && reference ? { slotId, reference } : null;
};

const normalizeTimelineCodeSlots = (
  source: unknown
): AnimationTimelineCodeSlots | undefined => {
  if (!isPlainObject(source)) return undefined;
  const codeSlots: AnimationTimelineCodeSlots = {};
  for (const field of ['customEasing', 'shader', 'script'] as const) {
    const binding = normalizeCodeSlotBinding(source[field]);
    if (binding) codeSlots[field] = binding;
  }
  return Object.keys(codeSlots).length ? codeSlots : undefined;
};

const normalizeAnimationTarget = (
  source: unknown
): AnimationTargetReference | null => {
  if (
    !isPlainObject(source) ||
    source.kind !== 'pir-document' ||
    !normalizeId(source.documentId)
  ) {
    return null;
  }
  return {
    kind: 'pir-document',
    documentId: normalizeId(source.documentId),
  };
};

const allocateUniqueId = (
  sourceId: unknown,
  fallbackId: string,
  usedIds: Set<string>
) => {
  const preferredId = normalizeId(sourceId);
  const baseId =
    preferredId && !usedIds.has(preferredId) ? preferredId : fallbackId;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(id);
  return id;
};

const clampDurationMs = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMELINE_DURATION_MS;

const clampKeyframeAtMs = (atMs: number, durationMs: number) =>
  Math.min(durationMs, Math.max(0, atMs));

export const resolveCssFilterUnit = (
  fn: CssFilterTrack['fn']
): NonNullable<CssFilterTrack['unit']> => {
  if (fn === 'hue-rotate') return 'deg';
  if (fn === 'blur') return 'px';
  return '%';
};

export const resolveTrackFallbackValue = (
  track: AnimationTrack
): number | string => {
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
  }
  return 0;
};

const normalizeKeyframe = (
  source: unknown,
  durationMs: number,
  fallbackValue: number | string
): AnimationKeyframe | null => {
  if (!isPlainObject(source)) return null;
  const keyframe: AnimationKeyframe = {
    atMs: isFiniteNumber(source.atMs)
      ? clampKeyframeAtMs(source.atMs, durationMs)
      : 0,
    value:
      typeof source.value === 'string' || isFiniteNumber(source.value)
        ? source.value
        : fallbackValue,
  };
  if (typeof source.easing === 'string' && source.easing.trim()) {
    keyframe.easing = source.easing.trim();
  }
  if (typeof source.hold === 'boolean') keyframe.hold = source.hold;
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
        .filter((item): item is AnimationKeyframe => item !== null)
    : [];
  if (!rows.length) return [{ atMs: 0, value: fallbackValue }];

  const byTime = new Map<number, AnimationKeyframe>();
  rows.forEach((row) => byTime.set(row.atMs, row));
  return Array.from(byTime.values()).sort(
    (left, right) => left.atMs - right.atMs
  );
};

const normalizeSvgPrimitive = (
  source: unknown,
  index: number,
  usedIds: Set<string>
): SvgFilterPrimitive | null => {
  if (!isPlainObject(source)) return null;
  const primitive: SvgFilterPrimitive = {
    id: allocateUniqueId(source.id, `primitive-${index + 1}`, usedIds),
    type: SVG_FILTER_PRIMITIVE_VALUES.has(
      source.type as SvgFilterPrimitive['type']
    )
      ? (source.type as SvgFilterPrimitive['type'])
      : 'feGaussianBlur',
  };
  if (typeof source.in === 'string' && source.in.trim())
    primitive.in = source.in.trim();
  if (typeof source.in2 === 'string' && source.in2.trim())
    primitive.in2 = source.in2.trim();
  if (typeof source.result === 'string' && source.result.trim()) {
    primitive.result = source.result.trim();
  }
  if (isPlainObject(source.attrs)) {
    const attrs = Object.entries(source.attrs).reduce<
      Record<string, number | string>
    >((result, [key, value]) => {
      if (typeof value === 'string' || isFiniteNumber(value))
        result[key] = value;
      return result;
    }, {});
    if (Object.keys(attrs).length) primitive.attrs = attrs;
  }
  return primitive;
};

const normalizeSvgFilter = (
  source: unknown,
  index: number,
  usedIds: Set<string>
): SvgFilterDefinition | null => {
  if (!isPlainObject(source)) return null;
  const primitiveIds = new Set<string>();
  const primitives = (Array.isArray(source.primitives) ? source.primitives : [])
    .map((primitive, primitiveIndex) =>
      normalizeSvgPrimitive(primitive, primitiveIndex, primitiveIds)
    )
    .filter((primitive): primitive is SvgFilterPrimitive => primitive !== null);
  if (!primitives.length) {
    primitives.push({
      id: 'primitive-1',
      type: 'feGaussianBlur',
      attrs: { stdDeviation: 0 },
    });
  }
  const filter: SvgFilterDefinition = {
    id: allocateUniqueId(source.id, `filter-${index + 1}`, usedIds),
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
  const usedIds = new Set<string>();
  return source
    .map((filter, index) => normalizeSvgFilter(filter, index, usedIds))
    .filter((filter): filter is SvgFilterDefinition => filter !== null);
};

const resolveSvgTrackDefaults = (
  filters: SvgFilterDefinition[]
): Pick<SvgFilterAttrTrack, 'filterId' | 'primitiveId' | 'attr'> => ({
  filterId: filters[0]?.id ?? 'filter-1',
  primitiveId: filters[0]?.primitives[0]?.id ?? 'primitive-1',
  attr: 'stdDeviation',
});

const normalizeTrack = (
  source: unknown,
  durationMs: number,
  svgFilters: SvgFilterDefinition[],
  fallbackId: string,
  usedIds: Set<string>
): AnimationTrack | null => {
  if (!isPlainObject(source) || typeof source.kind !== 'string') return null;
  const id = allocateUniqueId(source.id, fallbackId, usedIds);
  if (source.kind === 'style') {
    const property = STYLE_TRACK_PROPERTY_VALUES.has(
      source.property as StyleTrack['property']
    )
      ? (source.property as StyleTrack['property'])
      : 'opacity';
    const track: StyleTrack = { id, kind: 'style', property, keyframes: [] };
    return {
      ...track,
      keyframes: normalizeKeyframes(
        source.keyframes,
        durationMs,
        resolveTrackFallbackValue(track)
      ),
    };
  }
  if (source.kind === 'css-filter') {
    const fn = CSS_FILTER_FN_VALUES.has(source.fn as CssFilterTrack['fn'])
      ? (source.fn as CssFilterTrack['fn'])
      : 'blur';
    const track: CssFilterTrack = {
      id,
      kind: 'css-filter',
      fn,
      unit: CSS_FILTER_UNIT_VALUES.has(
        source.unit as NonNullable<CssFilterTrack['unit']>
      )
        ? (source.unit as NonNullable<CssFilterTrack['unit']>)
        : resolveCssFilterUnit(fn),
      keyframes: [],
    };
    return {
      ...track,
      keyframes: normalizeKeyframes(
        source.keyframes,
        durationMs,
        resolveTrackFallbackValue(track)
      ),
    };
  }
  if (source.kind !== 'svg-filter-attr') return null;

  const defaults = resolveSvgTrackDefaults(svgFilters);
  const filterId = normalizeId(source.filterId) || defaults.filterId;
  const filter =
    svgFilters.find((candidate) => candidate.id === filterId) ?? svgFilters[0];
  const track: SvgFilterAttrTrack = {
    id,
    kind: 'svg-filter-attr',
    filterId,
    primitiveId:
      normalizeId(source.primitiveId) ||
      filter?.primitives[0]?.id ||
      defaults.primitiveId,
    attr:
      typeof source.attr === 'string' && source.attr.trim()
        ? source.attr.trim()
        : defaults.attr,
    keyframes: [],
  };
  return {
    ...track,
    keyframes: normalizeKeyframes(
      source.keyframes,
      durationMs,
      resolveTrackFallbackValue(track)
    ),
  };
};

const normalizeBinding = (
  source: unknown,
  timelineIndex: number,
  bindingIndex: number,
  durationMs: number,
  svgFilters: SvgFilterDefinition[],
  usedIds: Set<string>
): AnimationBinding | null => {
  if (!isPlainObject(source)) return null;
  const trackIds = new Set<string>();
  const tracks = (Array.isArray(source.tracks) ? source.tracks : [])
    .map((track, trackIndex) =>
      normalizeTrack(
        track,
        durationMs,
        svgFilters,
        `track-${timelineIndex + 1}-${bindingIndex + 1}-${trackIndex + 1}`,
        trackIds
      )
    )
    .filter((track): track is AnimationTrack => track !== null);
  return {
    id: allocateUniqueId(
      source.id,
      `binding-${timelineIndex + 1}-${bindingIndex + 1}`,
      usedIds
    ),
    targetNodeId:
      normalizeId(source.targetNodeId) || DEFAULT_BINDING_TARGET_NODE_ID,
    tracks,
  };
};

const normalizeTimeline = (
  source: unknown,
  index: number,
  svgFilters: SvgFilterDefinition[],
  usedIds: Set<string>
): AnimationTimeline | null => {
  if (!isPlainObject(source)) return null;
  const durationMs = clampDurationMs(
    isFiniteNumber(source.durationMs)
      ? source.durationMs
      : DEFAULT_TIMELINE_DURATION_MS
  );
  const bindingIds = new Set<string>();
  const timeline: AnimationTimeline = {
    id: allocateUniqueId(source.id, `timeline-${index + 1}`, usedIds),
    name:
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : `${DEFAULT_TIMELINE_NAME} ${index + 1}`,
    durationMs,
    bindings: (Array.isArray(source.bindings) ? source.bindings : [])
      .map((binding, bindingIndex) =>
        normalizeBinding(
          binding,
          index,
          bindingIndex,
          durationMs,
          svgFilters,
          bindingIds
        )
      )
      .filter((binding): binding is AnimationBinding => binding !== null),
  };
  if (isFiniteNumber(source.delayMs) && source.delayMs >= 0) {
    timeline.delayMs = source.delayMs;
  }
  if (
    source.iterations === 'infinite' ||
    (typeof source.iterations === 'number' &&
      Number.isInteger(source.iterations) &&
      source.iterations > 0)
  ) {
    timeline.iterations = source.iterations;
  }
  if (
    DIRECTION_VALUES.has(
      source.direction as NonNullable<AnimationTimeline['direction']>
    )
  ) {
    timeline.direction = source.direction as NonNullable<
      AnimationTimeline['direction']
    >;
  }
  if (
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
  const codeSlots = normalizeTimelineCodeSlots(source.codeSlots);
  if (codeSlots) timeline.codeSlots = codeSlots;
  return timeline;
};

const normalizeAnimationEditorState = (
  source: unknown
): AnimationEditorState | undefined => {
  if (!isPlainObject(source)) return undefined;
  const state: AnimationEditorState = { version: 1 };
  const activeTimelineId = normalizeId(source.activeTimelineId);
  if (activeTimelineId) state.activeTimelineId = activeTimelineId;
  if (isFiniteNumber(source.cursorMs) && source.cursorMs >= 0) {
    state.cursorMs = source.cursorMs;
  }
  if (isFiniteNumber(source.zoom) && source.zoom > 0) state.zoom = source.zoom;
  if (Array.isArray(source.expandedTrackIds)) {
    const trackIds = Array.from(
      new Set(source.expandedTrackIds.map(normalizeId).filter(Boolean))
    );
    if (trackIds.length) state.expandedTrackIds = trackIds;
  }
  return state;
};

export const createEmptyAnimationDefinition = (input: {
  targetDocumentId: string;
}): AnimationDefinition => {
  const targetDocumentId = input.targetDocumentId.trim();
  if (!targetDocumentId) {
    throw new TypeError('Animation target document id is required.');
  }
  return {
    version: 1,
    target: { kind: 'pir-document', documentId: targetDocumentId },
    timelines: [],
  };
};

export const createDefaultTimeline = ({
  idFactory,
  index = 0,
}: {
  idFactory: AnimationIdFactory;
  index?: number;
}): AnimationTimeline => ({
  id: idFactory('timeline'),
  name: `${DEFAULT_TIMELINE_NAME} ${index + 1}`,
  durationMs: DEFAULT_TIMELINE_DURATION_MS,
  bindings: [],
});

export const createDefaultBinding = ({
  idFactory,
  targetNodeId = DEFAULT_BINDING_TARGET_NODE_ID,
}: {
  idFactory: AnimationIdFactory;
  targetNodeId?: string;
}): AnimationBinding => ({
  id: idFactory('binding'),
  targetNodeId: targetNodeId.trim() || DEFAULT_BINDING_TARGET_NODE_ID,
  tracks: [],
});

const createKeyframes = (
  durationMs: number,
  from: number | string,
  to: number | string
): AnimationKeyframe[] => [
  { atMs: 0, value: from },
  { atMs: clampDurationMs(durationMs), value: to },
];

export const createDefaultTrack = ({
  idFactory,
  kind = 'style',
  durationMs,
  svgFilters = [],
}: {
  idFactory: AnimationIdFactory;
  kind?: AnimationTrack['kind'];
  durationMs: number;
  svgFilters?: SvgFilterDefinition[];
}): AnimationTrack => {
  const id = idFactory('track');
  if (kind === 'style') {
    return {
      id,
      kind,
      property: 'opacity',
      keyframes: createKeyframes(durationMs, 0, 1),
    };
  }
  if (kind === 'css-filter') {
    return {
      id,
      kind,
      fn: 'blur',
      unit: 'px',
      keyframes: createKeyframes(durationMs, 0, 8),
    };
  }
  const defaults = resolveSvgTrackDefaults(svgFilters);
  return {
    id,
    kind,
    ...defaults,
    keyframes: createKeyframes(durationMs, 0, 4),
  };
};

export const createDefaultSvgPrimitive = ({
  idFactory,
}: {
  idFactory: AnimationIdFactory;
}): SvgFilterPrimitive => ({
  id: idFactory('primitive'),
  type: 'feGaussianBlur',
  attrs: { stdDeviation: 0 },
});

export const createDefaultSvgFilter = ({
  idFactory,
}: {
  idFactory: AnimationIdFactory;
}): SvgFilterDefinition => ({
  id: idFactory('filter'),
  units: 'objectBoundingBox',
  primitives: [createDefaultSvgPrimitive({ idFactory })],
});

/**
 * Decodes persisted animation input into the canonical authoring model. Repair
 * IDs are derived from document position so the same source always normalizes
 * to the same result and can be safely compared across history revisions.
 */
export const normalizeAnimationDefinition = (
  source: unknown
): AnimationDefinition | null => {
  if (!isPlainObject(source)) return null;
  const target = normalizeAnimationTarget(source.target);
  if (!target) return null;
  const svgFilters = normalizeSvgFilters(source.svgFilters);
  const timelineIds = new Set<string>();
  const timelines = (Array.isArray(source.timelines) ? source.timelines : [])
    .map((timeline, index) =>
      normalizeTimeline(timeline, index, svgFilters, timelineIds)
    )
    .filter((timeline): timeline is AnimationTimeline => timeline !== null);
  const definition: AnimationDefinition = { version: 1, target, timelines };
  if (svgFilters.length) definition.svgFilters = svgFilters;
  const editorState = normalizeAnimationEditorState(
    source['x-animationEditor']
  );
  if (editorState) definition['x-animationEditor'] = editorState;
  return definition;
};

export const ensureAnimationDefinition = (
  source: unknown,
  targetDocumentId: string
): AnimationDefinition =>
  normalizeAnimationDefinition(source) ??
  createEmptyAnimationDefinition({ targetDocumentId });

export const serializeAnimationDefinition = (source: AnimationDefinition) =>
  JSON.stringify(source);
