import type {
  AnimationFrame,
  AnimationKeyframe,
  AnimationNodeStyle,
  AnimationTimeline,
  SvgFilterDefinition,
} from './animation.types';
import { resolveCssFilterUnit } from './animationCodec';

type EasingFunction = (value: number) => number;
type SvgFilterEditMap = Map<
  string,
  Map<string, Record<string, number | string>>
>;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parseCubicBezier = (
  easing: string
): [number, number, number, number] | null => {
  const match = easing
    .trim()
    .match(
      /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i
    );
  if (!match) return null;
  const numbers = match.slice(1).map((value) => Number.parseFloat(value));
  return numbers.some(Number.isNaN)
    ? null
    : (numbers as [number, number, number, number]);
};

const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): EasingFunction => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (time: number) => ((ax * time + bx) * time + cx) * time;
  const sampleY = (time: number) => ((ay * time + by) * time + cy) * time;
  const derivativeX = (time: number) => (3 * ax * time + 2 * bx) * time + cx;

  const solveX = (value: number) => {
    let time = value;
    for (let index = 0; index < 8; index += 1) {
      const difference = sampleX(time) - value;
      const derivative = derivativeX(time);
      if (Math.abs(difference) < 1e-6) return time;
      if (Math.abs(derivative) < 1e-6) break;
      time -= difference / derivative;
    }
    let lower = 0;
    let upper = 1;
    time = value;
    for (let index = 0; index < 12; index += 1) {
      const sampled = sampleX(time);
      if (Math.abs(sampled - value) < 1e-6) return time;
      if (value > sampled) lower = time;
      else upper = time;
      time = (upper + lower) / 2;
    }
    return time;
  };

  return (value) => {
    const clamped = clamp01(value);
    return clamped === 0 || clamped === 1 ? clamped : sampleY(solveX(clamped));
  };
};

const resolveEasing = (easing?: string): EasingFunction => {
  const value = easing?.trim() || 'linear';
  if (value === 'linear') return (progress) => progress;
  if (value === 'ease') return cubicBezier(0.25, 0.1, 0.25, 1);
  if (value === 'ease-in') return cubicBezier(0.42, 0, 1, 1);
  if (value === 'ease-out') return cubicBezier(0, 0, 0.58, 1);
  if (value === 'ease-in-out') return cubicBezier(0.42, 0, 0.58, 1);
  const cubic = parseCubicBezier(value);
  return cubic ? cubicBezier(...cubic) : (progress) => progress;
};

export const resolveKeyframedValue = (
  keyframes: AnimationKeyframe[],
  atMs: number
): number | string => {
  if (!keyframes.length) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  const cursorMs = Math.max(0, atMs);
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (cursorMs <= first.atMs) return first.value;
  if (cursorMs >= last.atMs) return last.value;

  let previous = first;
  let next = last;
  for (const keyframe of keyframes) {
    if (keyframe.atMs <= cursorMs) previous = keyframe;
    if (keyframe.atMs >= cursorMs) {
      next = keyframe;
      break;
    }
  }
  if (previous.atMs === next.atMs || previous.hold) return previous.value;
  if (typeof previous.value !== 'number' || typeof next.value !== 'number') {
    return previous.value;
  }
  const durationMs = next.atMs - previous.atMs;
  if (durationMs <= 0) return previous.value;
  const progress = resolveEasing(previous.easing)(
    clamp01((cursorMs - previous.atMs) / durationMs)
  );
  return previous.value + (next.value - previous.value) * progress;
};

const isReversedIteration = (
  direction: AnimationTimeline['direction'] | undefined,
  iterationIndex: number
) =>
  direction === 'reverse' ||
  (direction === 'alternate' && iterationIndex % 2 === 1) ||
  (direction === 'alternate-reverse' && iterationIndex % 2 === 0);

export const resolveTimelineCursorMs = (
  timeline: AnimationTimeline,
  globalMs: number
): number | null => {
  const durationMs = Math.max(1, timeline.durationMs);
  const elapsedMs = globalMs - Math.max(0, timeline.delayMs ?? 0);
  const iterations =
    timeline.iterations === 'infinite'
      ? 'infinite'
      : typeof timeline.iterations === 'number' && timeline.iterations > 0
        ? Math.floor(timeline.iterations)
        : 1;
  const totalDurationMs =
    iterations === 'infinite'
      ? Number.POSITIVE_INFINITY
      : durationMs * iterations;

  if (elapsedMs < 0) {
    if (timeline.fillMode !== 'backwards' && timeline.fillMode !== 'both')
      return null;
    return isReversedIteration(timeline.direction, 0) ? durationMs : 0;
  }
  if (elapsedMs >= totalDurationMs) {
    if (iterations === 'infinite') {
      const iterationIndex = Math.floor(elapsedMs / durationMs);
      const loopMs = elapsedMs % durationMs;
      return isReversedIteration(timeline.direction, iterationIndex)
        ? durationMs - loopMs
        : loopMs;
    }
    if (timeline.fillMode !== 'forwards' && timeline.fillMode !== 'both')
      return null;
    return isReversedIteration(timeline.direction, Math.max(0, iterations - 1))
      ? 0
      : durationMs;
  }

  const iterationIndex = Math.floor(elapsedMs / durationMs);
  const loopMs = elapsedMs - iterationIndex * durationMs;
  return isReversedIteration(timeline.direction, iterationIndex)
    ? durationMs - loopMs
    : loopMs;
};

const coerceNumber = (value: number | string) => {
  if (typeof value === 'number') return value;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const applyTimeline = (
  timeline: AnimationTimeline,
  cursorMs: number,
  stylesByNodeId: Map<string, AnimationNodeStyle>,
  filterEditsByFilterId: SvgFilterEditMap
) => {
  timeline.bindings.forEach((binding) => {
    const targetNodeId = binding.targetNodeId.trim();
    if (!targetNodeId) return;
    let opacity: number | undefined;
    let color: string | undefined;
    const translateX: number[] = [];
    const translateY: number[] = [];
    const scales: number[] = [];
    const filters: string[] = [];

    binding.tracks.forEach((track) => {
      const value = resolveKeyframedValue(track.keyframes, cursorMs);
      if (track.kind === 'style') {
        if (track.property === 'opacity') opacity = coerceNumber(value);
        else if (track.property === 'color' && typeof value === 'string')
          color = value;
        else if (track.property === 'transform.translateX')
          translateX.push(coerceNumber(value));
        else if (track.property === 'transform.translateY')
          translateY.push(coerceNumber(value));
        else if (track.property === 'transform.scale')
          scales.push(coerceNumber(value));
        return;
      }
      if (track.kind === 'css-filter') {
        const filter = `${track.fn}(${coerceNumber(value)}${
          track.unit ?? resolveCssFilterUnit(track.fn)
        })`;
        if (!filters.includes(filter)) filters.push(filter);
        return;
      }

      const filter = `url(#${track.filterId})`;
      if (!filters.includes(filter)) filters.push(filter);
      const primitives = filterEditsByFilterId.get(track.filterId) ?? new Map();
      const attributes = primitives.get(track.primitiveId) ?? {};
      primitives.set(track.primitiveId, { ...attributes, [track.attr]: value });
      filterEditsByFilterId.set(track.filterId, primitives);
    });

    const transforms: string[] = [];
    if (translateX.length)
      transforms.push(`translateX(${translateX.at(-1)}px)`);
    if (translateY.length)
      transforms.push(`translateY(${translateY.at(-1)}px)`);
    if (scales.length) transforms.push(`scale(${scales.at(-1)})`);
    const style: AnimationNodeStyle = {};
    if (opacity !== undefined && Number.isFinite(opacity))
      style.opacity = opacity;
    if (color) style.color = color;
    if (transforms.length) style.transform = transforms.join(' ');
    if (filters.length) style.filter = filters.join(' ');
    if (Object.keys(style).length) {
      stylesByNodeId.set(targetNodeId, {
        ...(stylesByNodeId.get(targetNodeId) ?? {}),
        ...style,
      });
    }
  });
};

const buildFrame = (
  stylesByNodeId: Map<string, AnimationNodeStyle>,
  filterEditsByFilterId: SvgFilterEditMap,
  svgFilters: SvgFilterDefinition[]
): AnimationFrame => ({
  stylesByNodeId,
  svgFilters: svgFilters.map((filter) => {
    const edits = filterEditsByFilterId.get(filter.id);
    if (!edits) return filter;
    return {
      ...filter,
      primitives: filter.primitives.map((primitive) => {
        const attributes = edits.get(primitive.id);
        return attributes
          ? {
              ...primitive,
              attrs: { ...(primitive.attrs ?? {}), ...attributes },
            }
          : primitive;
      }),
    };
  }),
});

export const evaluateAnimationTimelineAtCursor = ({
  timeline,
  cursorMs,
  svgFilters,
}: {
  timeline: AnimationTimeline | undefined;
  cursorMs: number;
  svgFilters: SvgFilterDefinition[];
}): AnimationFrame => {
  const styles = new Map<string, AnimationNodeStyle>();
  const edits: SvgFilterEditMap = new Map();
  if (timeline) applyTimeline(timeline, Math.max(0, cursorMs), styles, edits);
  return buildFrame(styles, edits, svgFilters);
};

/** Evaluates all active timelines in declaration order into a neutral frame. */
export const evaluateAnimationFrame = ({
  timelines,
  globalMs,
  svgFilters,
}: {
  timelines: AnimationTimeline[];
  globalMs: number;
  svgFilters: SvgFilterDefinition[];
}): AnimationFrame => {
  const styles = new Map<string, AnimationNodeStyle>();
  const edits: SvgFilterEditMap = new Map();
  timelines.forEach((timeline) => {
    const cursorMs = resolveTimelineCursorMs(timeline, Math.max(0, globalMs));
    if (cursorMs !== null) applyTimeline(timeline, cursorMs, styles, edits);
  });
  return buildFrame(styles, edits, svgFilters);
};
