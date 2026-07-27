import { describe, expect, it, vi } from 'vitest';
import type { BehaviorRuntimeInvocation } from '@prodivix/behavior';
import {
  ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION,
  compileAnimationComposition,
  createAnimationBehaviorRuntimeAdapters,
  type AnimationDefinition,
  type AnimationRuntimePort,
} from './index';

const definition: AnimationDefinition = {
  target: { kind: 'pir-document', documentId: 'page' },
  timelines: [
    {
      id: 'detail-enter',
      name: 'Detail enter',
      durationMs: 10,
      motionIntent: 'decorative',
      reducedMotion: { kind: 'final-state' },
      markers: [],
      fillMode: 'forwards',
      bindings: [],
    },
  ],
  compositions: [],
};

const target = Object.freeze({
  targetId: 'timeline-target',
  semanticSymbolId: 'timeline-symbol',
  capability: 'behavior:animation:play',
  source: Object.freeze({
    workspaceDocumentId: 'animation-document',
    path: '/timelinesById/detail-enter',
  }),
});

const invocation = (
  capabilityId: string,
  overrides: Partial<BehaviorRuntimeInvocation> = {}
): BehaviorRuntimeInvocation =>
  Object.freeze({
    invocationId: `attempt:${capabilityId}`,
    attemptId: 'attempt',
    mode: capabilityId.endsWith('state') ? 'observation' : 'action',
    workspaceRevision: 3,
    programDigest: `sha256-${'2'.repeat(64)}`,
    instructionId: `instruction:${capabilityId}`,
    stepId: capabilityId,
    operation: capabilityId,
    capabilityId,
    target,
    source: target.source,
    signal: Object.freeze({ aborted: false }),
    readStepOutput: () => undefined,
    ...overrides,
  });

const runtime = () => {
  let now = 0;
  const applyFrame = vi.fn();
  const release = vi.fn();
  const port: AnimationRuntimePort = {
    scheduler: {
      now: () => now,
      scheduleFrame(callback) {
        let cancelled = false;
        void Promise.resolve().then(() => {
          now += 10;
          if (!cancelled) callback(now);
        });
        return () => {
          cancelled = true;
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
      acquire: () => ({ applyFrame, release }),
    },
  };
  return { port, applyFrame, release };
};

describe('Animation Behavior contribution', () => {
  it('registers generation-fenced play/control and state capabilities', () => {
    expect(
      ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION.triggers.map(({ kind }) => kind)
    ).toEqual(['animation.marker-reached', 'animation.settled']);
    expect(
      ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION.actions.map(({ kind }) => kind)
    ).toEqual([
      'animation.play',
      'animation.pause',
      'animation.resume',
      'animation.seek',
      'animation.cancel',
    ]);
    expect(
      ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION.observations.map(
        ({ kind }) => kind
      )
    ).toEqual([
      'animation.animation-state',
      'animation.composition-result',
      'animation.composition-marker',
    ]);
  });

  it('plays through the domain lease and exposes settled state for observation', async () => {
    const animationRuntime = runtime();
    const adapters = createAnimationBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        animationDocumentId: 'animation-document',
        definition,
        timeline: definition.timelines[0]!,
        runtime: animationRuntime.port,
      }),
    });
    const play = adapters.find(
      ({ capabilityId }) => capabilityId === 'animation.play'
    )!;
    const observeState = adapters.find(
      ({ capabilityId }) => capabilityId === 'animation.animation-state'
    )!;
    await expect(play.invoke(invocation('animation.play'))).resolves.toEqual({
      status: 'succeeded',
      output: 'completed',
    });
    expect(animationRuntime.applyFrame).toHaveBeenCalledTimes(2);
    expect(animationRuntime.release).toHaveBeenCalledWith({
      outcome: 'completed',
      finalFramePolicy: 'retain',
    });
    expect(
      await observeState.invoke(
        invocation('animation.animation-state', {
          target: {
            ...target,
            capability: 'behavior:animation:state',
          },
        })
      )
    ).toEqual({
      status: 'succeeded',
      output: 'completed',
    });
    expect(
      await observeState.invoke(
        invocation('animation.animation-state', {
          attemptId: 'other-attempt',
          target: {
            ...target,
            capability: 'behavior:animation:state',
          },
        })
      )
    ).toMatchObject({
      status: 'failed',
      error: { code: 'animation-state-unavailable' },
    });
  });

  it('does not acquire an effect lease after cancellation', async () => {
    const animationRuntime = runtime();
    const acquire = vi.spyOn(animationRuntime.port.effects, 'acquire');
    const [adapter] = createAnimationBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        animationDocumentId: 'animation-document',
        definition,
        timeline: definition.timelines[0]!,
        runtime: animationRuntime.port,
      }),
    });
    await expect(
      adapter!.invoke(
        invocation('animation.play', {
          signal: { aborted: true, reason: 'replaced' },
        })
      )
    ).resolves.toMatchObject({
      status: 'cancelled',
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it('controls one stable active instance without charging authoring state', async () => {
    let now = 0;
    let scheduled:
      | Readonly<{
          callback: (timestampMs: number) => void;
          cancelled: { value: boolean };
        }>
      | undefined;
    const applyFrame = vi.fn();
    const release = vi.fn();
    const runtimePort: AnimationRuntimePort = {
      scheduler: {
        now: () => now,
        scheduleFrame(callback) {
          const cancelled = { value: false };
          scheduled = { callback, cancelled };
          return () => {
            cancelled.value = true;
          };
        },
      },
      effects: {
        descriptor: {
          id: 'controlled-effects',
          version: '1',
          capabilities: ['style', 'css-filter', 'svg-filter'],
        },
        supportsTarget: () => true,
        acquire: () => ({ applyFrame, release }),
      },
    };
    const controlledDefinition: AnimationDefinition = {
      ...definition,
      timelines: [
        {
          ...definition.timelines[0]!,
          durationMs: 100,
        },
      ],
    };
    const adapters = createAnimationBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        animationDocumentId: 'animation-document',
        definition: controlledDefinition,
        timeline: controlledDefinition.timelines[0]!,
        runtime: runtimePort,
      }),
    });
    const adapter = (capabilityId: string) =>
      adapters.find((candidate) => candidate.capabilityId === capabilityId)!;
    const controlTarget = (capability: string) => ({
      ...target,
      capability,
    });
    const controlInput = Object.freeze({ instanceId: 'detail-instance' });

    await expect(
      adapter('animation.play').invoke(
        invocation('animation.play', {
          input: Object.freeze({
            ...controlInput,
            settle: 'started',
          }),
        })
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: {
        instanceId: 'detail-instance',
        state: 'running',
        elapsedMs: 0,
      },
    });
    expect(scheduled).toBeDefined();

    await expect(
      adapter('animation.pause').invoke(
        invocation('animation.pause', {
          target: controlTarget('behavior:animation:pause'),
          input: controlInput,
        })
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: { state: 'paused' },
    });
    expect(scheduled?.cancelled.value).toBe(true);

    now = 1_000;
    await expect(
      adapter('animation.seek').invoke(
        invocation('animation.seek', {
          target: controlTarget('behavior:animation:seek'),
          input: Object.freeze({ ...controlInput, positionMs: 40 }),
        })
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: { state: 'paused', elapsedMs: 40, cursorMs: 40 },
    });
    await expect(
      adapter('animation.resume').invoke(
        invocation('animation.resume', {
          target: controlTarget('behavior:animation:resume'),
          input: controlInput,
        })
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: { state: 'running', elapsedMs: 40 },
    });
    expect(
      await adapter('animation.animation-state').invoke(
        invocation('animation.animation-state', {
          target: controlTarget('behavior:animation:state'),
          input: undefined,
        })
      )
    ).toEqual({ status: 'succeeded', output: 'running' });

    await expect(
      adapter('animation.cancel').invoke(
        invocation('animation.cancel', {
          target: controlTarget('behavior:animation:cancel'),
          input: Object.freeze({
            ...controlInput,
            reason: 'route replaced',
          }),
        })
      )
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: { state: 'cancelled', elapsedMs: 40 },
    });
    expect(release).toHaveBeenCalledWith({
      outcome: 'cancelled',
      finalFramePolicy: 'clear',
    });
    expect(
      await adapter('animation.animation-state').invoke(
        invocation('animation.animation-state', {
          target: controlTarget('behavior:animation:state'),
          input: undefined,
        })
      )
    ).toEqual({ status: 'succeeded', output: 'cancelled' });
  });

  it('fails closed for invalid or cross-attempt instance controls', async () => {
    const animationRuntime = runtime();
    const adapters = createAnimationBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        animationDocumentId: 'animation-document',
        definition,
        timeline: definition.timelines[0]!,
        runtime: animationRuntime.port,
      }),
    });
    const pause = adapters.find(
      ({ capabilityId }) => capabilityId === 'animation.pause'
    )!;
    await expect(
      pause.invoke(
        invocation('animation.pause', {
          input: Object.freeze({ instanceId: '' }),
        })
      )
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'animation-control-input-invalid' },
    });
    await expect(
      pause.invoke(
        invocation('animation.pause', {
          attemptId: 'other-attempt',
          input: Object.freeze({ instanceId: 'attempt:animation.play' }),
        })
      )
    ).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'animation-instance-unavailable' },
    });
  });

  it('executes the compiled composition bundle through Behavior with resolved motion policy', async () => {
    const compositionDefinition: AnimationDefinition = {
      ...definition,
      timelines: [
        {
          ...definition.timelines[0]!,
          markers: [
            {
              id: 'route-handoff',
              atMs: 10,
              kind: 'handoff',
              requiredInReducedMotion: true,
            },
          ],
        },
      ],
      compositions: [
        {
          id: 'detail-enter-composition',
          name: 'Detail enter composition',
          motionIntent: 'spatial',
          root: {
            id: 'detail-enter-root',
            kind: 'sequence',
            children: [
              {
                id: 'detail-enter-ref',
                kind: 'timeline-ref',
                timelineId: 'detail-enter',
              },
              {
                id: 'detail-enter-settle',
                kind: 'settle',
                markerId: 'route-handoff',
              },
            ],
          },
        },
      ],
      entryCompositionId: 'detail-enter-composition',
    };
    const compiled = compileAnimationComposition({
      definition: compositionDefinition,
    });
    if (!compiled.ok) throw new Error(JSON.stringify(compiled.issues));
    const apply = vi.fn();
    const publish = vi.fn();
    const adapters = createAnimationBehaviorRuntimeAdapters({
      resolveTarget: () => ({
        animationDocumentId: 'animation-document',
        definition: compositionDefinition,
        compositionBundle: compiled.bundle,
        motionMode: 'reduced',
        generation: 'route-generation-4',
        compositionRuntime: {
          clock: { advanceTo: () => undefined },
          effects: { apply },
          observations: { publish },
        },
      }),
    });
    const adapter = (capabilityId: string) =>
      adapters.find((candidate) => candidate.capabilityId === capabilityId)!;

    await expect(
      adapter('animation.play').invoke(invocation('animation.play'))
    ).resolves.toMatchObject({
      status: 'succeeded',
      output: {
        status: 'completed',
        compositionId: 'detail-enter-composition',
        motionMode: 'reduced',
      },
    });
    expect(apply).toHaveBeenCalledTimes(compiled.bundle.reduced.events.length);
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'marker-reached',
        markerId: 'route-handoff',
        generation: 'route-generation-4',
        motionMode: 'reduced',
      })
    );
    expect(
      await adapter('animation.composition-marker').invoke(
        invocation('animation.composition-marker', {
          input: { markerId: 'route-handoff' },
          target: {
            ...target,
            capability: 'behavior:animation:marker',
          },
        })
      )
    ).toMatchObject({
      status: 'succeeded',
      output: {
        markerId: 'route-handoff',
        motionMode: 'reduced',
      },
    });
    expect(
      await adapter('animation.composition-result').invoke(
        invocation('animation.composition-result', {
          target: {
            ...target,
            capability: 'behavior:animation:composition',
          },
        })
      )
    ).toMatchObject({
      status: 'succeeded',
      output: { status: 'completed' },
    });
  });
});
