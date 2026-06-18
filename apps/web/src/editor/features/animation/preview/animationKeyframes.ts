import type { AnimationKeyframe } from '@prodivix/shared/types/pir';

type EasingFn = (value: number) => number;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const parseCubicBezier = (
  easing: string
): [number, number, number, number] | null => {
  const trimmed = easing.trim();
  const match = trimmed.match(
    /^cubic-bezier\(\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*,\s*(-?\d*\.?\d+)\s*\)$/i
  );
  if (!match) return null;
  const nums = match.slice(1).map((value) => Number.parseFloat(value));
  if (nums.some((value) => Number.isNaN(value))) return null;
  return nums as [number, number, number, number];
};

const cubicBezier = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): EasingFn => {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveY = (t: number) => ((ay * t + by) * t + cy) * t;
  const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  const solveCurveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const x2 = sampleCurveX(t) - x;
      const d2 = sampleCurveDerivativeX(t);
      if (Math.abs(x2) < 1e-6) return t;
      if (Math.abs(d2) < 1e-6) break;
      t -= x2 / d2;
    }

    let t0 = 0;
    let t1 = 1;
    t = x;

    for (let i = 0; i < 12; i += 1) {
      const x2 = sampleCurveX(t);
      if (Math.abs(x2 - x) < 1e-6) return t;
      if (x > x2) t0 = t;
      else t1 = t;
      t = (t1 + t0) / 2;
    }
    return t;
  };

  return (value: number) => {
    const clamped = clamp01(value);
    if (clamped === 0 || clamped === 1) return clamped;
    return sampleCurveY(solveCurveX(clamped));
  };
};

const resolveEasing = (easing?: string): EasingFn => {
  if (!easing) return (value) => value;
  const trimmed = easing.trim();
  if (!trimmed || trimmed === 'linear') return (value) => value;

  if (trimmed === 'ease') return cubicBezier(0.25, 0.1, 0.25, 1);
  if (trimmed === 'ease-in') return cubicBezier(0.42, 0, 1, 1);
  if (trimmed === 'ease-out') return cubicBezier(0, 0, 0.58, 1);
  if (trimmed === 'ease-in-out') return cubicBezier(0.42, 0, 0.58, 1);

  const cubic = parseCubicBezier(trimmed);
  if (cubic) return cubicBezier(...cubic);

  return (value) => value;
};

export const resolveKeyframedValue = (
  keyframes: AnimationKeyframe[],
  atMs: number
): number | string => {
  if (!keyframes.length) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  const clampedAtMs = Math.max(0, Math.round(atMs));
  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];

  if (clampedAtMs <= first.atMs) return first.value;
  if (clampedAtMs >= last.atMs) return last.value;

  let prev = first;
  let next = last;

  for (let index = 0; index < keyframes.length; index += 1) {
    const row = keyframes[index];
    if (row.atMs <= clampedAtMs) prev = row;
    if (row.atMs >= clampedAtMs) {
      next = row;
      break;
    }
  }

  if (prev.atMs === next.atMs) return prev.value;
  if (prev.hold) return prev.value;

  if (typeof prev.value !== 'number' || typeof next.value !== 'number') {
    return prev.value;
  }

  const duration = next.atMs - prev.atMs;
  if (duration <= 0) return prev.value;

  const raw = (clampedAtMs - prev.atMs) / duration;
  const eased = resolveEasing(prev.easing)(clamp01(raw));
  return prev.value + (next.value - prev.value) * eased;
};
