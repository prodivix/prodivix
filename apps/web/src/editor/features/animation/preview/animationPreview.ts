import type {
  AnimationTimeline,
  AnimationTrack,
  SvgFilterDefinition,
} from '@/core/types/engine.types';
import { resolveKeyframedValue } from './animationKeyframes';

type NodeStyleDraft = {
  opacity?: number | string;
  color?: string;
  transform?: string;
  filter?: string;
};

type PreviewSnapshot = {
  cssText: string;
  svgFilters: SvgFilterDefinition[];
};

type NodeFilterEditMap = Map<
  string,
  Map<string, Record<string, number | string>>
>;

const getTimelineIterations = (
  timeline: AnimationTimeline
): number | 'infinite' =>
  timeline.iterations === 'infinite'
    ? 'infinite'
    : typeof timeline.iterations === 'number' && timeline.iterations > 0
      ? Math.floor(timeline.iterations)
      : 1;

const isReverseAtIteration = (
  direction: AnimationTimeline['direction'] | undefined,
  iterationIndex: number
) => {
  if (direction === 'reverse') return true;
  if (direction === 'alternate') return iterationIndex % 2 === 1;
  if (direction === 'alternate-reverse') return iterationIndex % 2 === 0;
  return false;
};

const resolveTimelineCursorMs = (
  timeline: AnimationTimeline,
  globalMs: number
): number | null => {
  const durationMs = Math.max(1, timeline.durationMs);
  const delayMs = Math.max(0, timeline.delayMs ?? 0);
  const elapsedMs = globalMs - delayMs;
  const iterations = getTimelineIterations(timeline);
  const totalDurationMs =
    iterations === 'infinite'
      ? Number.POSITIVE_INFINITY
      : durationMs * iterations;

  if (elapsedMs < 0) {
    const fillMode = timeline.fillMode ?? 'none';
    if (fillMode !== 'backwards' && fillMode !== 'both') {
      return null;
    }
    return isReverseAtIteration(timeline.direction, 0) ? durationMs : 0;
  }

  if (elapsedMs >= totalDurationMs) {
    if (iterations === 'infinite') {
      const loopMs = elapsedMs % durationMs;
      return isReverseAtIteration(
        timeline.direction,
        Math.floor(elapsedMs / durationMs)
      )
        ? durationMs - loopMs
        : loopMs;
    }
    const fillMode = timeline.fillMode ?? 'none';
    if (fillMode !== 'forwards' && fillMode !== 'both') {
      return null;
    }
    const lastIterationIndex = Math.max(0, iterations - 1);
    return isReverseAtIteration(timeline.direction, lastIterationIndex)
      ? 0
      : durationMs;
  }

  const iterationIndex = Math.floor(elapsedMs / durationMs);
  const loopMs = elapsedMs - iterationIndex * durationMs;
  return isReverseAtIteration(timeline.direction, iterationIndex)
    ? durationMs - loopMs
    : loopMs;
};

const escapeAttrValue = (value: string) =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

const resolveCssFilterUnit = (
  fn: Extract<AnimationTrack, { kind: 'css-filter' }>['fn'],
  unit?: Extract<AnimationTrack, { kind: 'css-filter' }>['unit']
) => {
  if (unit) return unit;
  if (fn === 'hue-rotate') return 'deg';
  if (fn === 'blur') return 'px';
  return '%';
};

const coerceNumber = (value: number | string) => {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const ensureFilterPart = (parts: string[], nextPart: string) => {
  if (!nextPart) return;
  if (parts.includes(nextPart)) return;
  parts.push(nextPart);
};

const applyTimelineSnapshot = ({
  timeline,
  cursorMs,
  stylesByNodeId,
  filterEditsByFilterId,
}: {
  timeline: AnimationTimeline;
  cursorMs: number;
  stylesByNodeId: Map<string, NodeStyleDraft>;
  filterEditsByFilterId: NodeFilterEditMap;
}) => {
  timeline.bindings.forEach((binding) => {
    const targetNodeId = binding.targetNodeId.trim();
    if (!targetNodeId) return;
    const translateXTracks: number[] = [];
    const translateYTracks: number[] = [];
    const scaleTracks: number[] = [];
    const filterParts: string[] = [];

    let opacity: number | undefined;
    let color: string | undefined;

    binding.tracks.forEach((track) => {
      const value = resolveKeyframedValue(track.keyframes, cursorMs);

      if (track.kind === 'style') {
        if (track.property === 'opacity') {
          opacity = coerceNumber(value);
          return;
        }
        if (track.property === 'transform.translateX') {
          translateXTracks.push(coerceNumber(value));
          return;
        }
        if (track.property === 'transform.translateY') {
          translateYTracks.push(coerceNumber(value));
          return;
        }
        if (track.property === 'transform.scale') {
          scaleTracks.push(coerceNumber(value));
          return;
        }
        if (track.property === 'color' && typeof value === 'string') {
          color = value;
        }
        return;
      }

      if (track.kind === 'css-filter') {
        const resolvedUnit = resolveCssFilterUnit(track.fn, track.unit);
        const numeric = coerceNumber(value);
        ensureFilterPart(filterParts, `${track.fn}(${numeric}${resolvedUnit})`);
        return;
      }

      if (track.kind === 'svg-filter-attr') {
        ensureFilterPart(filterParts, `url(#${track.filterId})`);
        const nextValue =
          typeof value === 'string' || typeof value === 'number' ? value : 0;
        const primitiveMap =
          filterEditsByFilterId.get(track.filterId) ?? new Map();
        const attrs = primitiveMap.get(track.primitiveId) ?? {};
        primitiveMap.set(track.primitiveId, {
          ...attrs,
          [track.attr]: nextValue,
        });
        filterEditsByFilterId.set(track.filterId, primitiveMap);
      }
    });

    const transforms: string[] = [];
    if (translateXTracks.length) {
      transforms.push(`translateX(${translateXTracks.at(-1)}px)`);
    }
    if (translateYTracks.length) {
      transforms.push(`translateY(${translateYTracks.at(-1)}px)`);
    }
    if (scaleTracks.length) {
      transforms.push(`scale(${scaleTracks.at(-1)})`);
    }

    const draft: NodeStyleDraft = {};
    if (typeof opacity === 'number' && Number.isFinite(opacity)) {
      draft.opacity = opacity;
    }
    if (color) {
      draft.color = color;
    }
    if (transforms.length) {
      draft.transform = transforms.join(' ');
    }
    if (filterParts.length) {
      draft.filter = filterParts.join(' ');
    }

    if (Object.keys(draft).length) {
      const previousStyle = stylesByNodeId.get(targetNodeId);
      stylesByNodeId.set(targetNodeId, {
        ...(previousStyle ?? {}),
        ...draft,
      });
    }
  });
};

export const buildAnimationPreviewSnapshot = ({
  timeline,
  cursorMs,
  svgFilters,
}: {
  timeline: AnimationTimeline | undefined;
  cursorMs: number;
  svgFilters: SvgFilterDefinition[];
}): PreviewSnapshot => {
  if (!timeline) {
    return { cssText: '', svgFilters };
  }

  const stylesByNodeId = new Map<string, NodeStyleDraft>();
  const filterEditsByFilterId: NodeFilterEditMap = new Map();
  applyTimelineSnapshot({
    timeline,
    cursorMs,
    stylesByNodeId,
    filterEditsByFilterId,
  });

  return buildPreviewSnapshot({
    stylesByNodeId,
    filterEditsByFilterId,
    svgFilters,
  });
};

export const buildAnimationPreviewSnapshotFromTimelines = ({
  timelines,
  globalMs,
  svgFilters,
}: {
  timelines: AnimationTimeline[];
  globalMs: number;
  svgFilters: SvgFilterDefinition[];
}): PreviewSnapshot => {
  if (!timelines.length) {
    return { cssText: '', svgFilters };
  }
  const stylesByNodeId = new Map<string, NodeStyleDraft>();
  const filterEditsByFilterId: NodeFilterEditMap = new Map();
  timelines.forEach((timeline) => {
    const cursorMs = resolveTimelineCursorMs(timeline, Math.max(0, globalMs));
    if (cursorMs === null) return;
    applyTimelineSnapshot({
      timeline,
      cursorMs,
      stylesByNodeId,
      filterEditsByFilterId,
    });
  });

  return buildPreviewSnapshot({
    stylesByNodeId,
    filterEditsByFilterId,
    svgFilters,
  });
};

const buildPreviewSnapshot = ({
  stylesByNodeId,
  filterEditsByFilterId,
  svgFilters,
}: {
  stylesByNodeId: Map<string, NodeStyleDraft>;
  filterEditsByFilterId: NodeFilterEditMap;
  svgFilters: SvgFilterDefinition[];
}): PreviewSnapshot => {
  if (!stylesByNodeId.size && !filterEditsByFilterId.size) {
    return {
      cssText: '',
      svgFilters,
    };
  }

  const rules: string[] = [];
  stylesByNodeId.forEach((style, nodeId) => {
    const declarations: string[] = [];

    if (style.opacity !== undefined) {
      declarations.push(`opacity:${style.opacity};`);
    }
    if (style.color) {
      declarations.push(`color:${style.color};`);
    }
    if (style.transform) {
      declarations.push(`transform:${style.transform};`);
      declarations.push('transform-origin:center;');
    }
    if (style.filter) {
      declarations.push(`filter:${style.filter};`);
    }
    if (!declarations.length) return;

    rules.push(
      `[data-pir-node-id="${escapeAttrValue(nodeId)}"] > * {${declarations.join(
        ''
      )}}`
    );
  });

  const animatedSvgFilters = svgFilters.map((filter) => {
    const primitiveEdits = filterEditsByFilterId.get(filter.id);
    if (!primitiveEdits) return filter;

    return {
      ...filter,
      primitives: filter.primitives.map((primitive) => {
        const edits = primitiveEdits.get(primitive.id);
        if (!edits) return primitive;
        return {
          ...primitive,
          attrs: {
            ...(primitive.attrs ?? {}),
            ...edits,
          },
        };
      }),
    };
  });

  return { cssText: rules.join('\n'), svgFilters: animatedSvgFilters };
};
