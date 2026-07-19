import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  normalizeAnimationDefinition,
  resolveKeyframedValue,
  resolveTimelineCursorMs,
  validateAnimationDefinition,
} from './index';
import type { AnimationTimeline } from './index';

describe('animation domain properties', () => {
  it('normalization is deterministic, idempotent, and canonical', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (source) => {
        const normalized = normalizeAnimationDefinition({
          ...(source && typeof source === 'object' && !Array.isArray(source)
            ? source
            : {}),
          target: { kind: 'pir-document', documentId: 'page-home' },
        });
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

  it('requires one explicit PIR document target', () => {
    expect(
      validateAnimationDefinition({ version: 1, timelines: [] })
    ).toMatchObject({
      valid: false,
      issues: [{ code: 'ANI_TARGET_INVALID', path: '/target' }],
    });
  });

  it('keeps repair normalization outside canonical persistence validation', () => {
    expect(
      validateAnimationDefinition({
        version: 1,
        target: { kind: 'pir-document', documentId: ' page-home ' },
        timelines: [],
      })
    ).toMatchObject({
      valid: false,
      issues: [{ code: 'ANI_DOCUMENT_INVALID', path: '/' }],
    });
  });

  it('round-trips timeline CodeSlot bindings without embedding source', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        (timelineId, artifactId) => {
          const definition = {
            version: 1 as const,
            target: {
              kind: 'pir-document' as const,
              documentId: 'page-home',
            },
            timelines: [
              {
                id: timelineId,
                name: 'Timeline',
                durationMs: 1000,
                codeSlots: {
                  shader: {
                    slotId: `animation-code-slot:${timelineId}:shader`,
                    reference: { artifactId },
                  },
                },
                bindings: [],
              },
            ],
          };

          expect(normalizeAnimationDefinition(definition)).toEqual(definition);
          expect(validateAnimationDefinition(definition)).toMatchObject({
            valid: true,
            definition,
          });
        }
      )
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

  it('resolves delay and terminal fill boundaries without wall-clock state', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom<NonNullable<AnimationTimeline['fillMode']>>(
          'none',
          'forwards',
          'backwards',
          'both'
        ),
        (durationMs, delayMs, iterations, fillMode) => {
          const timeline: AnimationTimeline = {
            id: 'timeline',
            name: 'Timeline',
            durationMs,
            delayMs,
            iterations,
            fillMode,
            bindings: [],
          };
          const before = resolveTimelineCursorMs(timeline, delayMs - 1);
          const atStart = resolveTimelineCursorMs(timeline, delayMs);
          const atEnd = resolveTimelineCursorMs(
            timeline,
            delayMs + durationMs * iterations
          );

          expect(before).toBe(
            fillMode === 'backwards' || fillMode === 'both' ? 0 : null
          );
          expect(atStart).toBe(0);
          expect(atEnd).toBe(
            fillMode === 'forwards' || fillMode === 'both' ? durationMs : null
          );
          expect(resolveTimelineCursorMs(timeline, delayMs)).toBe(atStart);
          expect(
            resolveTimelineCursorMs(timeline, delayMs + durationMs * iterations)
          ).toBe(atEnd);
        }
      )
    );
  });
});
