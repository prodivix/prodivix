import type {
  AnimationDefinition,
  AnimationEditorState,
  AnimationKeyframe,
  AnimationTimeline,
  AnimationTrack,
  SvgFilterDefinition,
} from './animation.types';
import { resolveTrackFallbackValue } from './animationCodec';

export const resolveActiveTimelineId = (animation: AnimationDefinition) =>
  animation['x-animationEditor']?.activeTimelineId ||
  animation.timelines[0]?.id;

export const clampMs = (value: number, durationMs: number) => {
  const parsed = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(durationMs, parsed));
};

export const normalizeKeyframeRows = (
  track: AnimationTrack,
  keyframes: AnimationKeyframe[],
  durationMs: number
) => {
  const fallbackValue = resolveTrackFallbackValue(track);
  const rows = keyframes.length
    ? keyframes
    : [{ atMs: 0, value: fallbackValue }];
  const dedupedByTime = new Map<number, AnimationKeyframe>();
  rows.forEach((row) => {
    dedupedByTime.set(clampMs(row.atMs, durationMs), {
      ...row,
      atMs: clampMs(row.atMs, durationMs),
      value:
        typeof row.value === 'string' || typeof row.value === 'number'
          ? row.value
          : fallbackValue,
    });
  });
  return Array.from(dedupedByTime.values()).sort(
    (left, right) => left.atMs - right.atMs
  );
};

export const coerceKeyframeValueInput = (
  track: AnimationTrack,
  rawValue: string,
  fallbackValue: number | string
): number | string => {
  if (track.kind === 'style' && track.property === 'color') return rawValue;
  const trimmed = rawValue.trim();
  if (!trimmed) return fallbackValue;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isFinite(parsed)) return parsed;
  return track.kind === 'svg-filter-attr' ? rawValue : fallbackValue;
};

export const hasAnySvgTrack = (timelines: AnimationTimeline[]) =>
  timelines.some((timeline) =>
    timeline.bindings.some((binding) =>
      binding.tracks.some((track) => track.kind === 'svg-filter-attr')
    )
  );

export const reconcileSvgTrackReferences = (
  timelines: AnimationTimeline[],
  svgFilters: SvgFilterDefinition[]
) => {
  const fallbackFilter = svgFilters[0];
  const fallbackFilterId = fallbackFilter?.id ?? 'filter-1';
  const fallbackPrimitiveId =
    fallbackFilter?.primitives[0]?.id ?? 'primitive-1';
  const filterPrimitives = new Map(
    svgFilters.map((filter) => [
      filter.id,
      new Set(filter.primitives.map((primitive) => primitive.id)),
    ])
  );

  let changed = false;
  const nextTimelines = timelines.map((timeline) => {
    let timelineChanged = false;
    const bindings = timeline.bindings.map((binding) => {
      let bindingChanged = false;
      const tracks = binding.tracks.map((track) => {
        if (track.kind !== 'svg-filter-attr') return track;
        const primitiveIds = filterPrimitives.get(track.filterId);
        if (primitiveIds?.has(track.primitiveId)) return track;

        changed = true;
        timelineChanged = true;
        bindingChanged = true;
        if (primitiveIds?.size) {
          return { ...track, primitiveId: primitiveIds.values().next().value! };
        }
        return {
          ...track,
          filterId: fallbackFilterId,
          primitiveId: fallbackPrimitiveId,
        };
      });
      return bindingChanged ? { ...binding, tracks } : binding;
    });
    return timelineChanged ? { ...timeline, bindings } : timeline;
  });
  return changed ? nextTimelines : timelines;
};

export const withEditorState = (
  state: AnimationDefinition['x-animationEditor'] | undefined,
  updater: (draft: AnimationEditorState) => void
): AnimationDefinition['x-animationEditor'] => {
  const nextState: AnimationEditorState = {
    ...(state ?? { version: 1 }),
    version: 1,
  };
  updater(nextState);
  return nextState;
};
