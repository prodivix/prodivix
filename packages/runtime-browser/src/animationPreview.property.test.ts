import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildAnimationPreviewSnapshotFromTimelines } from './index';
import type { AnimationTimeline } from '@prodivix/animation';

const createOpacityTimeline = (
  id: string,
  targetNodeId: string,
  durationMs: number,
  from: number,
  to: number
): AnimationTimeline => ({
  id,
  name: id,
  durationMs,
  bindings: [
    {
      id: `${id}-binding`,
      targetNodeId,
      tracks: [
        {
          id: `${id}-track`,
          kind: 'style',
          property: 'opacity',
          keyframes: [
            { atMs: 0, value: from },
            { atMs: durationMs, value: to },
          ],
        },
      ],
    },
  ],
});

describe('browser animation projection properties', () => {
  it('projects the last timeline override at every cursor', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        (durationMs, cursorSeed, from, to) => {
          const cursorMs = cursorSeed % durationMs;
          const snapshot = buildAnimationPreviewSnapshotFromTimelines({
            timelines: [
              createOpacityTimeline('first', 'node', durationMs, 0, 0),
              createOpacityTimeline('last', 'node', durationMs, from, to),
            ],
            globalMs: cursorMs,
            svgFilters: [],
          });
          const expected = from + ((to - from) * cursorMs) / durationMs;
          expect(snapshot.cssText).toContain('data-pir-node-id="node"');
          const opacity = snapshot.cssText.match(/opacity:([^;]+);/)?.[1];
          expect(Number(opacity)).toBeCloseTo(expected, 10);
        }
      )
    );
  });

  it('projects SVG attribute tracks without mutating source filters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 0, max: 10_000 }),
        (durationMs, cursorSeed) => {
          const cursorMs = cursorSeed % durationMs;
          const timeline: AnimationTimeline = {
            id: 'svg',
            name: 'SVG',
            durationMs,
            bindings: [
              {
                id: 'binding',
                targetNodeId: 'node',
                tracks: [
                  {
                    id: 'track',
                    kind: 'svg-filter-attr',
                    filterId: 'filter',
                    primitiveId: 'primitive',
                    attr: 'stdDeviation',
                    keyframes: [
                      { atMs: 0, value: 0 },
                      { atMs: durationMs, value: 10 },
                    ],
                  },
                ],
              },
            ],
          };
          const svgFilters = [
            {
              id: 'filter',
              primitives: [
                {
                  id: 'primitive',
                  type: 'feGaussianBlur' as const,
                  attrs: { stdDeviation: 0 },
                },
              ],
            },
          ];
          const snapshot = buildAnimationPreviewSnapshotFromTimelines({
            timelines: [timeline],
            globalMs: cursorMs,
            svgFilters,
          });
          expect(
            snapshot.svgFilters[0].primitives[0].attrs?.stdDeviation
          ).toBeCloseTo((10 * cursorMs) / durationMs, 10);
          expect(svgFilters[0].primitives[0].attrs.stdDeviation).toBe(0);
        }
      )
    );
  });
});
