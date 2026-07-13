import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  normalizeAnimationDefinition,
  resolveKeyframedValue,
  resolveTimelineCursorMs,
} from './index';
import type { AnimationTimeline } from './index';

describe('animation domain properties', () => {
  it('normalization is deterministic, idempotent, and canonical', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (source) => {
        const normalized = normalizeAnimationDefinition(source);
        if (!normalized) return;

        expect(normalizeAnimationDefinition(normalized)).toEqual(normalized);
        expect(new Set(normalized.timelines.map(({ id }) => id)).size).toBe(
          normalized.timelines.length
        );
        normalized.timelines.forEach((timeline) => {
          expect(timeline.durationMs).toBeGreaterThan(0);
          expect(new Set(timeline.bindings.map(({ id }) => id)).size).toBe(
            timeline.bindings.length
          );
          timeline.bindings.forEach((binding) => {
            expect(new Set(binding.tracks.map(({ id }) => id)).size).toBe(
              binding.tracks.length
            );
            binding.tracks.forEach((track) => {
              expect(track.keyframes.length).toBeGreaterThan(0);
              track.keyframes.forEach((keyframe, index) => {
                expect(keyframe.atMs).toBeGreaterThanOrEqual(0);
                expect(keyframe.atMs).toBeLessThanOrEqual(timeline.durationMs);
                if (index > 0) {
                  expect(keyframe.atMs).toBeGreaterThan(
                    track.keyframes[index - 1].atMs
                  );
                }
              });
            });
          });
        });
      })
    );
  });

  it('linear keyframes interpolate within their endpoints', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20_000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: -10_000, max: 10_000 }),
        fc.integer({ min: 0, max: 20_000 }),
        (durationMs, from, to, cursorSeed) => {
          const cursorMs = cursorSeed % (durationMs + 1);
          const value = resolveKeyframedValue(
            [
              { atMs: 0, value: from },
              { atMs: durationMs, value: to },
            ],
            cursorMs
          );
          const expected = from + ((to - from) * cursorMs) / durationMs;
          expect(value).toBeCloseTo(expected, 10);
          expect(Number(value)).toBeGreaterThanOrEqual(Math.min(from, to));
          expect(Number(value)).toBeLessThanOrEqual(Math.max(from, to));
        }
      )
    );
  });

  it('timeline direction consistently maps iteration parity', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.constantFrom<NonNullable<AnimationTimeline['direction']>>(
          'normal',
          'reverse',
          'alternate',
          'alternate-reverse'
        ),
        (durationMs, iteration, offsetSeed, direction) => {
          const offset = offsetSeed % durationMs;
          const timeline: AnimationTimeline = {
            id: 'timeline',
            name: 'Timeline',
            durationMs,
            iterations: 'infinite',
            direction,
            bindings: [],
          };
          const reversed =
            direction === 'reverse' ||
            (direction === 'alternate' && iteration % 2 === 1) ||
            (direction === 'alternate-reverse' && iteration % 2 === 0);
          expect(
            resolveTimelineCursorMs(timeline, iteration * durationMs + offset)
          ).toBe(reversed ? durationMs - offset : offset);
        }
      )
    );
  });
});
