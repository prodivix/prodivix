import { describe, expect, it } from 'vitest';
import { buildAnimationPreviewSnapshotFromTimelines } from './animationPreview';
import type { AnimationTimeline } from '@/core/types/engine.types';

describe('buildAnimationPreviewSnapshotFromTimelines', () => {
  it('merges all timelines and keeps deterministic override order', () => {
    const timelines: AnimationTimeline[] = [
      {
        id: 'timeline-1',
        name: 'Timeline 1',
        durationMs: 1000,
        bindings: [
          {
            id: 'binding-1',
            targetNodeId: 'node-1',
            tracks: [
              {
                id: 'track-1',
                kind: 'style',
                property: 'opacity',
                keyframes: [
                  { atMs: 0, value: 0 },
                  { atMs: 1000, value: 1 },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'timeline-2',
        name: 'Timeline 2',
        durationMs: 1000,
        bindings: [
          {
            id: 'binding-2',
            targetNodeId: 'node-1',
            tracks: [
              {
                id: 'track-2',
                kind: 'style',
                property: 'opacity',
                keyframes: [
                  { atMs: 0, value: 1 },
                  { atMs: 1000, value: 0.5 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const snapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines,
      globalMs: 500,
      svgFilters: [],
    });

    expect(snapshot.cssText).toContain('[data-pir-node-id="node-1"] > *');
    expect(snapshot.cssText).toContain('opacity:0.75;');
  });

  it('respects delay and fill mode when resolving timeline cursor', () => {
    const timeline: AnimationTimeline = {
      id: 'timeline-delay',
      name: 'Timeline Delay',
      durationMs: 1000,
      delayMs: 300,
      fillMode: 'backwards',
      bindings: [
        {
          id: 'binding-delay',
          targetNodeId: 'node-delay',
          tracks: [
            {
              id: 'track-delay',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0.2 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    };

    const beforeStart = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [timeline],
      globalMs: 100,
      svgFilters: [],
    });
    expect(beforeStart.cssText).toContain('opacity:0.2;');

    const afterEndNoForwards = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [{ ...timeline, fillMode: 'none' }],
      globalMs: 1400,
      svgFilters: [],
    });
    expect(afterEndNoForwards.cssText).toBe('');
  });

  it('supports direction reverse and alternate', () => {
    const reverseTimeline: AnimationTimeline = {
      id: 'timeline-reverse',
      name: 'Timeline Reverse',
      durationMs: 1000,
      direction: 'reverse',
      bindings: [
        {
          id: 'binding-reverse',
          targetNodeId: 'node-reverse',
          tracks: [
            {
              id: 'track-reverse',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    };

    const reverseSnapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [reverseTimeline],
      globalMs: 250,
      svgFilters: [],
    });
    expect(reverseSnapshot.cssText).toContain('opacity:0.75;');

    const alternateTimeline: AnimationTimeline = {
      id: 'timeline-alternate',
      name: 'Timeline Alternate',
      durationMs: 1000,
      direction: 'alternate',
      iterations: 2,
      fillMode: 'forwards',
      bindings: [
        {
          id: 'binding-alternate',
          targetNodeId: 'node-alternate',
          tracks: [
            {
              id: 'track-alternate',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    };

    const alternateSnapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [alternateTimeline],
      globalMs: 1250,
      svgFilters: [],
    });
    expect(alternateSnapshot.cssText).toContain('opacity:0.75;');
  });

  it('applies svg filter track edits into output svg defs', () => {
    const snapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [
        {
          id: 'timeline-svg',
          name: 'Timeline Svg',
          durationMs: 1000,
          bindings: [
            {
              id: 'binding-svg',
              targetNodeId: 'node-svg',
              tracks: [
                {
                  id: 'track-svg',
                  kind: 'svg-filter-attr',
                  filterId: 'filter-1',
                  primitiveId: 'primitive-1',
                  attr: 'stdDeviation',
                  keyframes: [
                    { atMs: 0, value: 0 },
                    { atMs: 1000, value: 8 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      globalMs: 500,
      svgFilters: [
        {
          id: 'filter-1',
          units: 'objectBoundingBox',
          primitives: [
            {
              id: 'primitive-1',
              type: 'feGaussianBlur',
              attrs: { stdDeviation: 0 },
            },
          ],
        },
      ],
    });

    expect(snapshot.cssText).toContain('filter:url(#filter-1);');
    expect(snapshot.svgFilters[0]?.primitives[0]?.attrs?.stdDeviation).toBe(4);
  });

  it('respects forwards fill mode after finite iterations', () => {
    const timeline: AnimationTimeline = {
      id: 'timeline-fill-forwards',
      name: 'Timeline Fill Forwards',
      durationMs: 1000,
      iterations: 2,
      fillMode: 'forwards',
      bindings: [
        {
          id: 'binding-fill-forwards',
          targetNodeId: 'node-fill-forwards',
          tracks: [
            {
              id: 'track-fill-forwards',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0.1 },
                { atMs: 1000, value: 0.9 },
              ],
            },
          ],
        },
      ],
    };

    const snapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [timeline],
      globalMs: 3000,
      svgFilters: [],
    });
    expect(snapshot.cssText).toContain('opacity:0.9;');
  });

  it('loops correctly for infinite iterations', () => {
    const timeline: AnimationTimeline = {
      id: 'timeline-infinite',
      name: 'Timeline Infinite',
      durationMs: 1000,
      iterations: 'infinite',
      bindings: [
        {
          id: 'binding-infinite',
          targetNodeId: 'node-infinite',
          tracks: [
            {
              id: 'track-infinite',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    };

    const snapshot = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [timeline],
      globalMs: 2500,
      svgFilters: [],
    });
    expect(snapshot.cssText).toContain('opacity:0.5;');
  });

  it('keeps empty output when no timeline is active at given time', () => {
    const timeline: AnimationTimeline = {
      id: 'timeline-none',
      name: 'Timeline None',
      durationMs: 1000,
      delayMs: 500,
      fillMode: 'none',
      bindings: [
        {
          id: 'binding-none',
          targetNodeId: 'node-none',
          tracks: [
            {
              id: 'track-none',
              kind: 'style',
              property: 'opacity',
              keyframes: [
                { atMs: 0, value: 0 },
                { atMs: 1000, value: 1 },
              ],
            },
          ],
        },
      ],
    };

    const beforeStart = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [timeline],
      globalMs: 200,
      svgFilters: [],
    });
    expect(beforeStart.cssText).toBe('');

    const afterEnd = buildAnimationPreviewSnapshotFromTimelines({
      timelines: [{ ...timeline, delayMs: 0 }],
      globalMs: 2000,
      svgFilters: [],
    });
    expect(afterEnd.cssText).toBe('');
  });
});
