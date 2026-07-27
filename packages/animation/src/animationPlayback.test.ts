import { describe, expect, it, vi } from 'vitest';
import {
  startAnimationPlayback,
  type AnimationDefinition,
  type AnimationRuntimeFrame,
  type AnimationTimeline,
} from './index';

const timeline: AnimationTimeline = {
  id: 'detail-enter',
  name: 'Detail enter',
  durationMs: 100,
  motionIntent: 'decorative',
  reducedMotion: { kind: 'final-state' },
  markers: [
    {
      id: 'halfway',
      atMs: 50,
      kind: 'checkpoint',
      requiredInReducedMotion: true,
    },
    {
      id: 'ready',
      atMs: 100,
      kind: 'settle',
      requiredInReducedMotion: true,
    },
  ],
  fillMode: 'forwards',
  bindings: [],
};

const definition: AnimationDefinition = {
  target: { kind: 'pir-document', documentId: 'page-detail' },
  timelines: [timeline],
  compositions: [],
};

const settleMicrotasks = async (): Promise<void> => {
  for (let index = 0; index < 6; index += 1) {
    await Promise.resolve();
  }
};

const createPlaybackHarness = (
  onObservation?: Parameters<typeof startAnimationPlayback>[0]['onObservation']
) => {
  let now = 0;
  let nextId = 0;
  const scheduled = new Map<number, (timestampMs: number) => void>();
  const frames: AnimationRuntimeFrame[] = [];
  const release = vi.fn();
  const playback = startAnimationPlayback({
    playbackId: 'playback',
    animationDocumentId: 'animation-document',
    definition,
    timeline,
    runtime: {
      scheduler: {
        now: () => now,
        scheduleFrame(callback) {
          nextId += 1;
          const id = nextId;
          scheduled.set(id, callback);
          return () => {
            scheduled.delete(id);
          };
        },
      },
      effects: {
        descriptor: {
          id: 'test-effects',
          version: '1',
          capabilities: ['style', 'css-filter', 'svg-filter'],
        },
        supportsTarget: () => true,
        acquire: () => {
          throw new Error(
            'The playback test supplies an already acquired lease.'
          );
        },
      },
    },
    lease: {
      applyFrame(frame) {
        frames.push(frame);
      },
      release,
    },
    signal: { aborted: false },
    generation: 'generation-1',
    onObservation,
  });

  return {
    playback,
    frames,
    release,
    pendingFrameCount: () => scheduled.size,
    async advance(ms: number) {
      now += ms;
      const callbacks = [...scheduled.values()];
      scheduled.clear();
      callbacks.forEach((callback) => callback(now));
      await settleMicrotasks();
    },
  };
};

describe('Animation playback controls', () => {
  it('publishes bounded marker and settle observations in logical order', async () => {
    const observations: string[] = [];
    const harness = createPlaybackHarness((observation) => {
      observations.push(
        `${observation.kind}:${observation.markerId ?? ''}:${
          observation.logicalTimeMs
        }`
      );
    });
    await harness.playback.ready;
    await harness.advance(50);
    await harness.advance(50);
    await expect(harness.playback.completion).resolves.toMatchObject({
      status: 'completed',
    });

    expect(observations).toEqual([
      'started::0',
      'marker-reached:halfway:50',
      'marker-reached:ready:100',
      'settled::100',
      'completed::100',
    ]);
  });

  it('pauses logical time and resumes without charging wall-clock pause', async () => {
    const harness = createPlaybackHarness();
    await harness.playback.ready;
    await harness.advance(20);
    expect(harness.playback.snapshot()).toMatchObject({
      status: 'running',
      elapsedMs: 20,
      cursorMs: 20,
    });

    await expect(harness.playback.pause()).resolves.toMatchObject({
      status: 'paused',
      elapsedMs: 20,
      cursorMs: 20,
    });
    expect(harness.pendingFrameCount()).toBe(0);

    await harness.advance(1_000);
    await expect(harness.playback.resume()).resolves.toMatchObject({
      status: 'running',
      elapsedMs: 20,
    });
    await harness.advance(10);
    expect(harness.playback.snapshot()).toMatchObject({
      status: 'running',
      elapsedMs: 30,
      cursorMs: 30,
    });

    await harness.playback.cancel();
  });

  it('seeks deterministically while paused and completes at the bounded end', async () => {
    const harness = createPlaybackHarness();
    await harness.playback.ready;
    await harness.playback.pause();

    await expect(harness.playback.seek(75)).resolves.toMatchObject({
      status: 'paused',
      elapsedMs: 75,
      cursorMs: 75,
      framesApplied: 2,
    });
    await harness.playback.resume();
    await harness.advance(10);
    expect(harness.playback.snapshot()).toMatchObject({
      elapsedMs: 85,
      cursorMs: 85,
    });

    await expect(harness.playback.seek(1_000)).resolves.toMatchObject({
      status: 'completed',
      elapsedMs: 100,
      cursorMs: 100,
    });
    await expect(harness.playback.completion).resolves.toMatchObject({
      status: 'completed',
      elapsedMs: 100,
    });
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.release).toHaveBeenCalledWith({
      outcome: 'completed',
      finalFramePolicy: 'retain',
    });
  });

  it('cancels a paused instance and never leaves scheduled work or effects', async () => {
    const harness = createPlaybackHarness();
    await harness.playback.ready;
    await harness.playback.pause();

    await expect(harness.playback.cancel('replaced')).resolves.toMatchObject({
      status: 'cancelled',
      reason: 'replaced',
    });
    expect(harness.playback.snapshot().status).toBe('cancelled');
    expect(harness.pendingFrameCount()).toBe(0);
    expect(harness.release).toHaveBeenCalledWith({
      outcome: 'cancelled',
      finalFramePolicy: 'clear',
    });
  });

  it('rejects invalid seek positions without mutating the instance', async () => {
    const harness = createPlaybackHarness();
    await harness.playback.ready;
    const before = harness.playback.snapshot();

    await expect(harness.playback.seek(Number.NaN)).rejects.toThrow(
      'finite non-negative'
    );
    await expect(harness.playback.seek(-1)).rejects.toThrow(
      'finite non-negative'
    );
    expect(harness.playback.snapshot()).toEqual(before);

    await harness.playback.cancel();
  });
});
