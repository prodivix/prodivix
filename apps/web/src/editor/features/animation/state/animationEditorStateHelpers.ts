import type {
  AnimationDefinition,
  AnimationEditorState,
  AnimationKeyframe,
  AnimationTimeline,
  AnimationTrack,
  ComponentNode,
  SvgFilterDefinition,
} from '@prodivix/shared/types/pir';

export type NodeTargetOption = {
  id: string;
  label: string;
};

export const resolveActiveTimelineId = (animation: AnimationDefinition) =>
  animation['x-animationEditor']?.activeTimelineId ||
  animation.timelines[0]?.id;

export const clampMs = (value: number, durationMs: number) => {
  const parsed = Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, Math.min(durationMs, parsed));
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
    return 0;
  }
  return 0;
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
  const dedupedByAtMs = new Map<number, AnimationKeyframe>();

  rows.forEach((row) => {
    const atMs = clampMs(row.atMs, durationMs);
    const value =
      typeof row.value === 'string' || typeof row.value === 'number'
        ? row.value
        : fallbackValue;
    dedupedByAtMs.set(atMs, {
      ...row,
      atMs,
      value,
    });
  });

  return Array.from(dedupedByAtMs.values()).sort((a, b) => a.atMs - b.atMs);
};

export const coerceKeyframeValueInput = (
  track: AnimationTrack,
  rawValue: string,
  fallbackValue: number | string
): number | string => {
  if (track.kind === 'style' && track.property === 'color') {
    return rawValue;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) return fallbackValue;
  const parsed = Number.parseFloat(trimmed);
  if (Number.isFinite(parsed)) {
    return parsed;
  }
  if (track.kind === 'svg-filter-attr') {
    return rawValue;
  }
  return fallbackValue;
};

export const collectNodeTargets = (root: ComponentNode): NodeTargetOption[] => {
  const rows: NodeTargetOption[] = [];

  const walk = (node: ComponentNode, depth: number) => {
    rows.push({
      id: node.id,
      label: `${'  '.repeat(depth)}${node.id} (${node.type})`,
    });
    (node.children ?? []).forEach((child) => walk(child, depth + 1));
  };

  walk(root, 0);
  return rows;
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
  const filterPrimitiveMap = new Map(
    svgFilters.map((filter) => [
      filter.id,
      new Set(filter.primitives.map((primitive) => primitive.id)),
    ])
  );

  let updated = false;
  const nextTimelines = timelines.map((timeline) => {
    let timelineChanged = false;
    const nextBindings = timeline.bindings.map((binding) => {
      let bindingChanged = false;
      const nextTracks = binding.tracks.map((track) => {
        if (track.kind !== 'svg-filter-attr') return track;
        const primitiveSet = filterPrimitiveMap.get(track.filterId);
        if (primitiveSet && primitiveSet.has(track.primitiveId)) {
          return track;
        }
        updated = true;
        bindingChanged = true;
        timelineChanged = true;
        if (primitiveSet && primitiveSet.size > 0) {
          const nextPrimitiveId = Array.from(primitiveSet.values())[0];
          return {
            ...track,
            primitiveId: nextPrimitiveId,
          };
        }
        return {
          ...track,
          filterId: fallbackFilterId,
          primitiveId: fallbackPrimitiveId,
        };
      });
      if (!bindingChanged) return binding;
      return {
        ...binding,
        tracks: nextTracks,
      };
    });
    if (!timelineChanged) return timeline;
    return {
      ...timeline,
      bindings: nextBindings,
    };
  });

  return updated ? nextTimelines : timelines;
};

export const withEditorState = (
  state: AnimationDefinition['x-animationEditor'] | undefined,
  updater: (draft: AnimationEditorState) => void
): AnimationDefinition['x-animationEditor'] => {
  const nextState: AnimationEditorState = {
    ...(state ?? { version: 1 as const }),
    version: 1 as const,
  };
  updater(nextState);
  return nextState;
};
