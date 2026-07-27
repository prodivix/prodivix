import {
  BEHAVIOR_EMPTY_SCHEMA_DIGEST,
  type BehaviorJsonValue,
  type BehaviorRegistryContribution,
  type BehaviorRegistryDescriptor,
  type BehaviorRuntimeCapabilityAdapter,
  type BehaviorRuntimeInvocation,
} from '@prodivix/behavior';
import type { AnimationCompositionProgramBundle } from './animationCompositionCompiler';
import {
  createAnimationCompositionCancellationController,
  executeAnimationCompositionProgram,
  type AnimationCompositionCancellationController,
  type AnimationCompositionExecutionResult,
  type AnimationCompositionRuntimePort,
} from './animationCompositionRuntime';
import { startAnimationPlayback } from './animationPlayback';
import type { AnimationSurfaceRuntimeAdapter } from './animationSurfaceRuntime';
import type {
  AnimationDefinition,
  AnimationMotionMode,
  AnimationTimeline,
} from './animation.types';
import {
  getAnimationTrackEffectCapability,
  type AnimationPlayback,
  type AnimationPlaybackSnapshot,
  type AnimationRuntimePort,
} from './animationRuntime';

const descriptor = (
  kind: string,
  targetCapability: string,
  effect: BehaviorRegistryDescriptor['effect'],
  cancellation: BehaviorRegistryDescriptor['cancellation']
): BehaviorRegistryDescriptor =>
  Object.freeze({
    kind,
    owner: 'animation',
    inputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    outputSchemaDigest: BEHAVIOR_EMPTY_SCHEMA_DIGEST,
    targetCapability,
    runtimeZones: Object.freeze(['client', 'test'] as const),
    effect,
    cancellation,
    determinism: 'controlled',
    sourceTraceResolverId: 'animation.timeline-source',
    redactionPolicyId: 'animation.public-state',
  });

export const ANIMATION_BEHAVIOR_REGISTRY_CONTRIBUTION: BehaviorRegistryContribution =
  Object.freeze({
    contributorId: 'core.animation',
    triggers: Object.freeze([
      descriptor(
        'animation.marker-reached',
        'behavior:animation:marker',
        'read',
        'none'
      ),
      descriptor(
        'animation.settled',
        'behavior:animation:settled',
        'read',
        'none'
      ),
    ]),
    actions: Object.freeze([
      descriptor(
        'animation.play',
        'behavior:animation:play',
        'write',
        'required'
      ),
      descriptor(
        'animation.pause',
        'behavior:animation:pause',
        'write',
        'cooperative'
      ),
      descriptor(
        'animation.resume',
        'behavior:animation:resume',
        'write',
        'cooperative'
      ),
      descriptor(
        'animation.seek',
        'behavior:animation:seek',
        'write',
        'cooperative'
      ),
      descriptor(
        'animation.cancel',
        'behavior:animation:cancel',
        'write',
        'cooperative'
      ),
    ]),
    observations: Object.freeze([
      descriptor(
        'animation.animation-state',
        'behavior:animation:state',
        'read',
        'none'
      ),
      descriptor(
        'animation.composition-result',
        'behavior:animation:composition',
        'read',
        'none'
      ),
      descriptor(
        'animation.composition-marker',
        'behavior:animation:marker',
        'read',
        'none'
      ),
    ]),
  });

export type AnimationBehaviorTimelineExecutionTarget = Readonly<{
  animationDocumentId: string;
  definition: AnimationDefinition;
  timeline: AnimationTimeline;
  runtime: AnimationRuntimePort;
}>;

export type AnimationBehaviorCompositionExecutionTarget = Readonly<{
  animationDocumentId: string;
  definition: AnimationDefinition;
  compositionBundle: AnimationCompositionProgramBundle;
  compositionRuntime: AnimationCompositionRuntimePort;
  motionMode: AnimationMotionMode;
  generation?: string;
  surfaceAdapter?: AnimationSurfaceRuntimeAdapter;
}>;

export type AnimationBehaviorExecutionTarget =
  | AnimationBehaviorTimelineExecutionTarget
  | AnimationBehaviorCompositionExecutionTarget;

export type ResolveAnimationBehaviorExecutionTarget = (
  invocation: BehaviorRuntimeInvocation
) =>
  | AnimationBehaviorExecutionTarget
  | null
  | Promise<AnimationBehaviorExecutionTarget | null>;

export type CreateAnimationBehaviorRuntimeAdaptersInput = Readonly<{
  resolveTarget: ResolveAnimationBehaviorExecutionTarget;
  maximumActiveInstances?: number;
  maximumRetainedStates?: number;
}>;

const targetMissing = (invocation: BehaviorRuntimeInvocation) =>
  Object.freeze({
    status: 'failed' as const,
    error: Object.freeze({
      code: 'animation-target-missing',
      safeMessage: `Animation target is unavailable for ${invocation.stepId}.`,
    }),
  });

type AnimationBehaviorInstance = Readonly<{
  instanceId: string;
  targetKey: string;
  playback: AnimationPlayback;
}>;

type AnimationBehaviorCompositionInstance = Readonly<{
  instanceId: string;
  targetKey: string;
  controller: AnimationCompositionCancellationController;
  completion: Promise<AnimationCompositionExecutionResult>;
}>;

const isCompositionTarget = (
  target: AnimationBehaviorExecutionTarget
): target is AnimationBehaviorCompositionExecutionTarget =>
  'compositionBundle' in target;

type AnimationBehaviorControlInput = Readonly<{
  instanceId?: string;
  settle?: 'started' | 'completed';
  positionMs?: number;
  reason?: string;
}>;

const readControlInput = (
  invocation: BehaviorRuntimeInvocation
): AnimationBehaviorControlInput | null => {
  const value = invocation.input;
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as { readonly [key: string]: BehaviorJsonValue };
  const instanceId = record.instanceId;
  const settle = record.settle;
  const positionMs = record.positionMs;
  const reason = record.reason;
  if (
    (instanceId !== undefined &&
      (typeof instanceId !== 'string' ||
        !instanceId.trim() ||
        instanceId !== instanceId.trim() ||
        instanceId.length > 512)) ||
    (settle !== undefined && settle !== 'started' && settle !== 'completed') ||
    (positionMs !== undefined &&
      (typeof positionMs !== 'number' ||
        !Number.isFinite(positionMs) ||
        positionMs < 0)) ||
    (reason !== undefined &&
      (typeof reason !== 'string' || reason.length > 512))
  ) {
    return null;
  }
  return Object.freeze({
    ...(typeof instanceId === 'string' ? { instanceId } : {}),
    ...(settle === 'started' || settle === 'completed' ? { settle } : {}),
    ...(typeof positionMs === 'number' ? { positionMs } : {}),
    ...(typeof reason === 'string' ? { reason } : {}),
  });
};

const isTerminalPlaybackState = (
  state: AnimationPlaybackSnapshot['status']
): boolean =>
  state === 'completed' ||
  state === 'cancelled' ||
  state === 'timed-out' ||
  state === 'failed';

const behaviorSnapshot = (
  instanceId: string,
  snapshot: AnimationPlaybackSnapshot
) =>
  Object.freeze({
    instanceId,
    state: snapshot.status,
    elapsedMs: snapshot.elapsedMs,
    cursorMs: snapshot.cursorMs,
    framesApplied: snapshot.framesApplied,
  });

const invalidControlInput = () =>
  Object.freeze({
    status: 'failed' as const,
    error: Object.freeze({
      code: 'animation-control-input-invalid',
      safeMessage:
        'Animation control input must use a bounded instance identity and valid control values.',
    }),
  });

const instanceUnavailable = () =>
  Object.freeze({
    status: 'failed' as const,
    error: Object.freeze({
      code: 'animation-instance-unavailable',
      safeMessage:
        'The requested Animation instance is not active in this Scenario attempt.',
    }),
  });

const controlFailed = () =>
  Object.freeze({
    status: 'failed' as const,
    error: Object.freeze({
      code: 'animation-control-failed',
      safeMessage:
        'Animation control failed before producing a safe instance state.',
    }),
  });

/**
 * Bridges Behavior to generation-fenced Animation instances. Active playback
 * and retained state stay attempt-local and never enter the Workspace.
 */
export const createAnimationBehaviorRuntimeAdapters = (
  input: CreateAnimationBehaviorRuntimeAdaptersInput
): readonly BehaviorRuntimeCapabilityAdapter[] => {
  const maximumActiveInstances = Math.max(
    1,
    Math.trunc(input.maximumActiveInstances ?? 64)
  );
  const maximumRetainedStates = Math.max(
    1,
    Math.trunc(input.maximumRetainedStates ?? 256)
  );
  const activeInstances = new Map<string, AnimationBehaviorInstance>();
  const activeCompositionInstances = new Map<
    string,
    AnimationBehaviorCompositionInstance
  >();
  const latestInstanceByTarget = new Map<string, string>();
  const stateByTargetId = new Map<
    string,
    AnimationPlaybackSnapshot['status']
  >();
  const compositionResultByTargetId = new Map<
    string,
    AnimationCompositionExecutionResult
  >();
  const stateKey = (invocation: BehaviorRuntimeInvocation): string =>
    `${invocation.attemptId}\u0000${invocation.target?.targetId ?? ''}`;
  const instanceKey = (attemptId: string, instanceId: string): string =>
    `${attemptId}\u0000${instanceId}`;
  const recordTargetState = (
    key: string,
    state: AnimationPlaybackSnapshot['status']
  ): void => {
    stateByTargetId.delete(key);
    stateByTargetId.set(key, state);
    while (stateByTargetId.size > maximumRetainedStates) {
      const oldest = stateByTargetId.keys().next().value;
      if (typeof oldest !== 'string') break;
      stateByTargetId.delete(oldest);
    }
  };
  const readInstance = (
    invocation: BehaviorRuntimeInvocation,
    controlInput: AnimationBehaviorControlInput
  ): AnimationBehaviorInstance | null => {
    const targetKey = stateKey(invocation);
    const instanceId =
      controlInput.instanceId ?? latestInstanceByTarget.get(targetKey);
    if (!instanceId) return null;
    const instance = activeInstances.get(
      instanceKey(invocation.attemptId, instanceId)
    );
    return instance?.targetKey === targetKey ? instance : null;
  };

  const play: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'animation.play',
    owner: 'animation',
    async invoke(invocation) {
      if (!invocation.target) return targetMissing(invocation);
      const controlInput = readControlInput(invocation);
      if (!controlInput) return invalidControlInput();
      const target = await input.resolveTarget(invocation);
      if (!target) return targetMissing(invocation);
      if (invocation.signal.aborted) {
        recordTargetState(stateKey(invocation), 'cancelled');
        return Object.freeze({
          status: 'cancelled',
          reason: 'Animation invocation was cancelled before playback.',
        });
      }
      if (isCompositionTarget(target)) {
        if (
          activeInstances.size + activeCompositionInstances.size >=
          maximumActiveInstances
        ) {
          return Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'animation-instance-budget-exceeded',
              safeMessage:
                'The Animation active-instance budget is exhausted for this runtime.',
            }),
          });
        }
        const instanceId = controlInput.instanceId ?? invocation.invocationId;
        const key = instanceKey(invocation.attemptId, instanceId);
        if (activeInstances.has(key) || activeCompositionInstances.has(key)) {
          return Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'animation-instance-conflict',
              safeMessage:
                'An Animation instance with this identity is already active.',
            }),
          });
        }
        const targetKey = stateKey(invocation);
        const controller = createAnimationCompositionCancellationController();
        const abortLike = invocation.signal as typeof invocation.signal & {
          addEventListener?: (
            type: 'abort',
            listener: () => void,
            options?: { once?: boolean }
          ) => void;
          removeEventListener?: (type: 'abort', listener: () => void) => void;
        };
        const abort = () =>
          controller.abort('Animation composition Behavior was cancelled.');
        abortLike.addEventListener?.('abort', abort, { once: true });
        const program = target.compositionBundle[target.motionMode];
        const generation =
          target.generation ??
          `${invocation.workspaceRevision}:${invocation.invocationId}`;
        const completion = target.surfaceAdapter
          ? target.surfaceAdapter
              .invoke({
                bundle: target.compositionBundle,
                motionMode: target.motionMode,
                runtime: target.compositionRuntime,
                signal: controller.signal,
                instanceId,
                generation,
                animationDocumentId: target.animationDocumentId,
                targetDocumentId: target.definition.target.documentId,
              })
              .then((execution) => execution.result)
          : executeAnimationCompositionProgram({
              program,
              runtime: target.compositionRuntime,
              signal: controller.signal,
              instanceId,
              generation,
              animationDocumentId: target.animationDocumentId,
              targetDocumentId: target.definition.target.documentId,
            });
        activeCompositionInstances.set(
          key,
          Object.freeze({
            instanceId,
            targetKey,
            controller,
            completion,
          })
        );
        latestInstanceByTarget.set(targetKey, instanceId);
        recordTargetState(targetKey, 'running');
        void completion.then((result) => {
          abortLike.removeEventListener?.('abort', abort);
          activeCompositionInstances.delete(key);
          if (latestInstanceByTarget.get(targetKey) === instanceId) {
            latestInstanceByTarget.delete(targetKey);
          }
          compositionResultByTargetId.set(targetKey, result);
          recordTargetState(targetKey, result.status);
        });
        if (controlInput.settle === 'started') {
          return Object.freeze({
            status: 'succeeded' as const,
            output: Object.freeze({
              instanceId,
              state: 'running',
              compositionId: program.compositionId,
              motionMode: program.motionMode,
              programDigest: program.programDigest,
            }),
          });
        }
        const result = await completion;
        if (result.status === 'cancelled') {
          return Object.freeze({
            status: 'cancelled' as const,
            reason: result.reason ?? 'Animation composition was cancelled.',
          });
        }
        if (result.status === 'failed') {
          return Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'animation-composition-failed',
              safeMessage:
                'Animation composition failed before its settle barrier.',
            }),
          });
        }
        return Object.freeze({
          status: 'succeeded' as const,
          output: Object.freeze({
            status: result.status,
            compositionId: program.compositionId,
            motionMode: program.motionMode,
            programDigest: program.programDigest,
            eventsApplied: result.eventsApplied,
          }),
        });
      }
      const unsupportedTarget = target.timeline.bindings
        .flatMap((binding) =>
          binding.tracks.map((track) => ({
            binding,
            capability: getAnimationTrackEffectCapability(track),
          }))
        )
        .find(
          ({ binding, capability }) =>
            !target.runtime.effects.supportsTarget({
              targetDocumentId: target.definition.target.documentId,
              targetNodeId: binding.targetNodeId,
              capability,
            })
        );
      if (unsupportedTarget) {
        return Object.freeze({
          status: 'failed',
          error: Object.freeze({
            code: 'animation-target-unsupported',
            safeMessage:
              'Animation effect host does not support the authored target capability.',
          }),
        });
      }
      if (
        activeInstances.size + activeCompositionInstances.size >=
        maximumActiveInstances
      ) {
        return Object.freeze({
          status: 'failed' as const,
          error: Object.freeze({
            code: 'animation-instance-budget-exceeded',
            safeMessage:
              'The Animation active-instance budget is exhausted for this runtime.',
          }),
        });
      }
      const instanceId = controlInput.instanceId ?? invocation.invocationId;
      const key = instanceKey(invocation.attemptId, instanceId);
      if (activeInstances.has(key)) {
        return Object.freeze({
          status: 'failed' as const,
          error: Object.freeze({
            code: 'animation-instance-conflict',
            safeMessage:
              'An Animation instance with this identity is already active.',
          }),
        });
      }
      const lease = await target.runtime.effects.acquire({
        playbackId: instanceId,
        animationDocumentId: target.animationDocumentId,
        timelineId: target.timeline.id,
        targetDocumentId: target.definition.target.documentId,
        signal: invocation.signal,
      });
      const playback = startAnimationPlayback({
        playbackId: instanceId,
        animationDocumentId: target.animationDocumentId,
        definition: target.definition,
        timeline: target.timeline,
        runtime: target.runtime,
        lease,
        signal: invocation.signal,
      });
      const targetKey = stateKey(invocation);
      activeInstances.set(
        key,
        Object.freeze({ instanceId, targetKey, playback })
      );
      latestInstanceByTarget.set(targetKey, instanceId);
      void playback.completion.then((result) => {
        activeInstances.delete(key);
        if (latestInstanceByTarget.get(targetKey) === instanceId) {
          latestInstanceByTarget.delete(targetKey);
        }
        recordTargetState(targetKey, result.status);
      });

      if (controlInput.settle === 'started') {
        const started = await playback.ready;
        recordTargetState(targetKey, started.status);
        if (started.status === 'failed') return controlFailed();
        if (started.status === 'cancelled' || started.status === 'timed-out') {
          return Object.freeze({
            status: 'cancelled' as const,
            reason: 'Animation playback was cancelled before it started.',
          });
        }
        return Object.freeze({
          status: 'succeeded' as const,
          output: behaviorSnapshot(instanceId, started),
        });
      }
      const result = await playback.completion;
      if (result.status === 'cancelled' || result.status === 'timed-out') {
        return Object.freeze({
          status: 'cancelled',
          reason:
            result.reason ?? `Animation playback ended with ${result.status}.`,
        });
      }
      if (result.status === 'failed') {
        return Object.freeze({
          status: 'failed',
          error: Object.freeze({
            code: 'animation-playback-failed',
            safeMessage: 'Animation playback failed before settle.',
          }),
        });
      }
      return Object.freeze({
        status: 'succeeded',
        output: result.status,
      });
    },
  });

  const createControlAdapter = (
    capabilityId: 'animation.pause' | 'animation.resume' | 'animation.seek'
  ): BehaviorRuntimeCapabilityAdapter =>
    Object.freeze({
      capabilityId,
      owner: 'animation',
      async invoke(invocation) {
        if (!invocation.target) return targetMissing(invocation);
        const controlInput = readControlInput(invocation);
        if (!controlInput) return invalidControlInput();
        const instance = readInstance(invocation, controlInput);
        if (!instance) return instanceUnavailable();
        if (isTerminalPlaybackState(instance.playback.snapshot().status)) {
          return instanceUnavailable();
        }
        try {
          const snapshot =
            capabilityId === 'animation.pause'
              ? await instance.playback.pause()
              : capabilityId === 'animation.resume'
                ? await instance.playback.resume()
                : controlInput.positionMs === undefined
                  ? null
                  : await instance.playback.seek(controlInput.positionMs);
          if (!snapshot) return invalidControlInput();
          recordTargetState(instance.targetKey, snapshot.status);
          return Object.freeze({
            status: 'succeeded' as const,
            output: behaviorSnapshot(instance.instanceId, snapshot),
          });
        } catch {
          return controlFailed();
        }
      },
    });

  const cancel: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'animation.cancel',
    owner: 'animation',
    async invoke(invocation) {
      if (!invocation.target) return targetMissing(invocation);
      const controlInput = readControlInput(invocation);
      if (!controlInput) return invalidControlInput();
      const instance = readInstance(invocation, controlInput);
      if (!instance) {
        const targetKey = stateKey(invocation);
        const instanceId =
          controlInput.instanceId ?? latestInstanceByTarget.get(targetKey);
        const compositionInstance = instanceId
          ? activeCompositionInstances.get(
              instanceKey(invocation.attemptId, instanceId)
            )
          : undefined;
        if (
          !compositionInstance ||
          compositionInstance.targetKey !== targetKey
        ) {
          return instanceUnavailable();
        }
        compositionInstance.controller.abort(
          controlInput.reason ??
            'Animation composition was cancelled by Behavior.'
        );
        const result = await compositionInstance.completion;
        recordTargetState(compositionInstance.targetKey, result.status);
        return Object.freeze({
          status: 'succeeded' as const,
          output: Object.freeze({
            instanceId: compositionInstance.instanceId,
            state: result.status,
            eventsApplied: result.eventsApplied,
          }),
        });
      }
      try {
        const result = await instance.playback.cancel(
          controlInput.reason ?? 'Animation instance was cancelled by Behavior.'
        );
        recordTargetState(instance.targetKey, result.status);
        return Object.freeze({
          status: 'succeeded' as const,
          output: behaviorSnapshot(
            instance.instanceId,
            instance.playback.snapshot()
          ),
        });
      } catch {
        return controlFailed();
      }
    },
  });

  const observeState: BehaviorRuntimeCapabilityAdapter = Object.freeze({
    capabilityId: 'animation.animation-state',
    owner: 'animation',
    invoke(invocation) {
      if (!invocation.target) return targetMissing(invocation);
      const targetKey = stateKey(invocation);
      const latestInstanceId = latestInstanceByTarget.get(targetKey);
      const active = latestInstanceId
        ? activeInstances.get(
            instanceKey(invocation.attemptId, latestInstanceId)
          )
        : undefined;
      const state =
        active?.playback.snapshot().status ?? stateByTargetId.get(targetKey);
      return state
        ? Object.freeze({ status: 'succeeded' as const, output: state })
        : Object.freeze({
            status: 'failed' as const,
            error: Object.freeze({
              code: 'animation-state-unavailable',
              safeMessage:
                'Animation state is unavailable for this Scenario attempt.',
            }),
          });
    },
  });

  const observeCompositionResult: BehaviorRuntimeCapabilityAdapter =
    Object.freeze({
      capabilityId: 'animation.composition-result',
      owner: 'animation',
      invoke(invocation) {
        if (!invocation.target) return targetMissing(invocation);
        const result = compositionResultByTargetId.get(stateKey(invocation));
        return result
          ? Object.freeze({
              status: 'succeeded' as const,
              output: Object.freeze({
                status: result.status,
                logicalTimeMs: result.logicalTimeMs,
                eventsApplied: result.eventsApplied,
                ...(result.reason ? { reason: result.reason } : {}),
              }),
            })
          : Object.freeze({
              status: 'failed' as const,
              error: Object.freeze({
                code: 'animation-composition-result-unavailable',
                safeMessage:
                  'Animation composition result is unavailable for this Scenario attempt.',
              }),
            });
      },
    });

  const observeCompositionMarker: BehaviorRuntimeCapabilityAdapter =
    Object.freeze({
      capabilityId: 'animation.composition-marker',
      owner: 'animation',
      invoke(invocation) {
        if (!invocation.target) return targetMissing(invocation);
        const result = compositionResultByTargetId.get(stateKey(invocation));
        const selector =
          invocation.input &&
          typeof invocation.input === 'object' &&
          !Array.isArray(invocation.input)
            ? (invocation.input as Readonly<Record<string, BehaviorJsonValue>>)
                .markerId
            : undefined;
        const marker = result?.observations
          .filter(
            (observation) =>
              observation.kind === 'marker-reached' &&
              (typeof selector !== 'string' ||
                observation.markerId === selector)
          )
          .at(-1);
        return marker
          ? Object.freeze({
              status: 'succeeded' as const,
              output: Object.freeze({
                markerId: marker.markerId ?? '',
                logicalTimeMs: marker.logicalTimeMs,
                sequence: marker.sequence,
                motionMode: marker.motionMode,
                programDigest: marker.programDigest,
              }),
            })
          : Object.freeze({
              status: 'failed' as const,
              error: Object.freeze({
                code: 'animation-composition-marker-unavailable',
                safeMessage:
                  'Animation composition marker is unavailable for this Scenario attempt.',
              }),
            });
      },
    });

  const echoTrigger = (
    capabilityId: string
  ): BehaviorRuntimeCapabilityAdapter =>
    Object.freeze({
      capabilityId,
      owner: 'animation',
      invoke(invocation) {
        return invocation.input === undefined
          ? Object.freeze({ status: 'succeeded' as const })
          : Object.freeze({
              status: 'succeeded' as const,
              output: invocation.input,
            });
      },
    });

  return Object.freeze([
    play,
    createControlAdapter('animation.pause'),
    createControlAdapter('animation.resume'),
    createControlAdapter('animation.seek'),
    cancel,
    observeState,
    observeCompositionResult,
    observeCompositionMarker,
    echoTrigger('animation.marker-reached'),
    echoTrigger('animation.settled'),
  ]);
};
