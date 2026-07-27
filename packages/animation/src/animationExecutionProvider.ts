import {
  createExecutionJobController,
  createExecutionProviderDescriptor,
  getExecutionProviderCompatibility,
  isExecutionJobTerminalStatus,
  type ExecutionJob,
  type ExecutionJobController,
  type ExecutionJobResult,
  type ExecutionProvider,
  type ExecutionRequest,
  type ExecutionSourceTrace,
  type ExecutionValue,
} from '@prodivix/runtime-core';
import { isSupportedAnimationEasing } from './animationEvaluation';
import {
  prepareAnimationCodeRuntime,
  type AnimationCodeRuntimeGateway,
  type AnimationCodeRuntimeSession,
} from './animationCodeRuntime';
import { startAnimationPlayback } from './animationPlayback';
import type {
  AnimationDefinition,
  AnimationTimeline,
  AnimationTrack,
} from './animation.types';
import {
  getAnimationTimelineTotalDurationMs,
  getAnimationTrackEffectCapability,
  type AnimationEffectLease,
  type AnimationPlayback,
  type AnimationPlaybackResult,
  type AnimationRuntimePort,
} from './animationRuntime';
import { validateAnimationDefinition } from './animationValidator';

export const ANIMATION_EXECUTION_PROVIDER_ID =
  'prodivix.animation.same-context';

export type ResolveAnimationExecutionDocument = (
  request: ExecutionRequest
) => AnimationDefinition | Promise<AnimationDefinition>;

export type ResolveAnimationExecutionRuntime = (
  request: ExecutionRequest
) => AnimationRuntimePort | Promise<AnimationRuntimePort>;

export type ResolveAnimationCodeRuntime = (
  request: ExecutionRequest
) =>
  | AnimationCodeRuntimeGateway
  | null
  | Promise<AnimationCodeRuntimeGateway | null>;

export type CreateAnimationExecutionProviderOptions = Readonly<{
  resolveDocument: ResolveAnimationExecutionDocument;
  resolveRuntime: ResolveAnimationExecutionRuntime;
  resolveCodeRuntime?: ResolveAnimationCodeRuntime;
  createJobId?: (request: ExecutionRequest) => string;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, timeoutMs: number) => () => void;
}>;

export type AnimationExecutionJobOutput = Readonly<{
  status: 'completed';
  timelineId: string;
  elapsedMs: number;
  framesApplied: number;
}>;

type AnimationRuntimeIssue = Readonly<{
  code: string;
  message: string;
  targetRef:
    | Readonly<{
        kind: 'animation-timeline';
        documentId: string;
        timelineId: string;
      }>
    | Readonly<{
        kind: 'animation-track';
        documentId: string;
        timelineId: string;
        bindingId: string;
        trackId: string;
      }>;
}>;

const descriptor = createExecutionProviderDescriptor({
  id: ANIMATION_EXECUTION_PROVIDER_ID,
  version: '1',
  displayName: 'Animation Execution Provider',
  isolation: 'same-context',
  profiles: ['preview', 'test'],
  runtimeZones: ['client', 'test'],
  invocationKinds: ['animation'],
  capabilities: [
    'cancellation',
    'diagnostics',
    'source-trace',
    'streaming-logs',
    'timeout',
  ],
});

type ExecutionTimerHost = Readonly<{
  setTimeout(callback: () => void, timeoutMs: number): unknown;
  clearTimeout(handle: unknown): void;
}>;

const scheduleHostTimeout = (
  callback: () => void,
  timeoutMs: number
): (() => void) => {
  const host = globalThis as unknown as Partial<ExecutionTimerHost>;
  if (!host.setTimeout || !host.clearTimeout) {
    throw new Error('The execution host does not provide timeout scheduling.');
  }
  const handle = host.setTimeout(callback, timeoutMs);
  return () => host.clearTimeout?.(handle);
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );

export const createAnimationExecutionInvocationInput = (
  timelineId: string
): ExecutionValue => {
  const normalizedTimelineId = timelineId.trim();
  if (!normalizedTimelineId) {
    throw new TypeError('Animation timelineId must not be empty.');
  }
  return Object.freeze({ timelineId: normalizedTimelineId });
};

const resolveExecutionTarget = (
  request: ExecutionRequest
): Readonly<{ documentId: string; timelineId: string }> => {
  const target = request.invocation.targetRef;
  if (target.kind === 'animation-timeline') {
    return Object.freeze({
      documentId: target.documentId,
      timelineId: target.timelineId,
    });
  }
  const input = request.invocation.input;
  if (target.kind === 'document' && isPlainRecord(input)) {
    const timelineId = input.timelineId;
    if (typeof timelineId === 'string' && timelineId.trim()) {
      return Object.freeze({
        documentId: target.documentId,
        timelineId: timelineId.trim(),
      });
    }
  }
  throw new TypeError(
    'Animation execution requires an animation timeline target.'
  );
};

const timelineTarget = (
  documentId: string,
  timelineId: string
): AnimationRuntimeIssue['targetRef'] => ({
  kind: 'animation-timeline',
  documentId,
  timelineId,
});

const trackTarget = (
  documentId: string,
  timelineId: string,
  bindingId: string,
  trackId: string
): AnimationRuntimeIssue['targetRef'] => ({
  kind: 'animation-track',
  documentId,
  timelineId,
  bindingId,
  trackId,
});

const sourceTrace = (
  targetRef: AnimationRuntimeIssue['targetRef']
): readonly ExecutionSourceTrace[] =>
  Object.freeze([Object.freeze({ sourceRef: targetRef })]);

const findUnsupportedEasing = (
  documentId: string,
  timeline: AnimationTimeline
): AnimationRuntimeIssue | undefined => {
  if (!isSupportedAnimationEasing(timeline.easing)) {
    return {
      code: 'ANI-5102',
      message: `Timeline easing "${timeline.easing}" is not supported by this runtime.`,
      targetRef: timelineTarget(documentId, timeline.id),
    };
  }
  for (const binding of timeline.bindings) {
    for (const track of binding.tracks) {
      const unsupported = track.keyframes.find(
        (keyframe) => !isSupportedAnimationEasing(keyframe.easing)
      );
      if (unsupported) {
        return {
          code: 'ANI-5102',
          message: `Keyframe easing "${unsupported.easing}" is not supported by this runtime.`,
          targetRef: trackTarget(documentId, timeline.id, binding.id, track.id),
        };
      }
    }
  }
  return undefined;
};

const findRuntimeIssue = (
  documentId: string,
  definition: AnimationDefinition,
  timeline: AnimationTimeline,
  runtime: AnimationRuntimePort
): AnimationRuntimeIssue | undefined => {
  const easingIssue = findUnsupportedEasing(documentId, timeline);
  if (easingIssue) return easingIssue;
  const declaredCapabilities = new Set(runtime.effects.descriptor.capabilities);
  for (const binding of timeline.bindings) {
    for (const track of binding.tracks) {
      const capability = getAnimationTrackEffectCapability(track);
      const targetRef = trackTarget(
        documentId,
        timeline.id,
        binding.id,
        track.id
      );
      if (!declaredCapabilities.has(capability)) {
        return {
          code: 'ANI-5201',
          message: `The animation effect host does not support ${capability} tracks.`,
          targetRef,
        };
      }
      if (
        !runtime.effects.supportsTarget({
          targetDocumentId: definition.target.documentId,
          targetNodeId: binding.targetNodeId,
          capability,
        })
      ) {
        return {
          code: 'ANI-5202',
          message: `Animation target "${binding.targetNodeId}" is unavailable in the effect host.`,
          targetRef,
        };
      }
    }
  }
  return undefined;
};

const withCodeRuntimeSession = (
  runtime: AnimationRuntimePort,
  session: AnimationCodeRuntimeSession
): AnimationRuntimePort =>
  Object.freeze({
    scheduler: runtime.scheduler,
    effects: Object.freeze({
      descriptor: runtime.effects.descriptor,
      supportsTarget: runtime.effects.supportsTarget,
      async acquire(
        input: Parameters<AnimationRuntimePort['effects']['acquire']>[0]
      ) {
        if (session.contextLost()) {
          throw new Error(
            'Animation CodeSlot context was lost before effect acquisition.'
          );
        }
        let lease;
        try {
          lease = await runtime.effects.acquire(input);
        } catch (error) {
          await session.release('failed');
          throw error;
        }
        let released = false;
        return Object.freeze({
          applyFrame(frame: Parameters<AnimationEffectLease['applyFrame']>[0]) {
            if (session.contextLost()) {
              throw new Error(
                'Animation CodeSlot context was lost during playback.'
              );
            }
            return lease.applyFrame(frame);
          },
          async release(
            outcome: Parameters<AnimationEffectLease['release']>[0]
          ) {
            if (released) return;
            released = true;
            try {
              await lease.release(outcome);
            } finally {
              await session.release(outcome.outcome);
            }
          },
        });
      },
    }),
  });

const findTrackForFailure = (
  documentId: string,
  timeline: AnimationTimeline
): AnimationRuntimeIssue['targetRef'] => {
  const binding = timeline.bindings[0];
  const track: AnimationTrack | undefined = binding?.tracks[0];
  return binding && track
    ? trackTarget(documentId, timeline.id, binding.id, track.id)
    : timelineTarget(documentId, timeline.id);
};

const canPublish = (controller: ExecutionJobController): boolean =>
  !isExecutionJobTerminalStatus(controller.job.getSnapshot().status);

export const readAnimationExecutionJobOutput = (
  result: ExecutionJobResult
): AnimationExecutionJobOutput | undefined => {
  if (result.status !== 'succeeded' || !isPlainRecord(result.output)) {
    return undefined;
  }
  if (
    result.output.status !== 'completed' ||
    typeof result.output.timelineId !== 'string' ||
    typeof result.output.elapsedMs !== 'number' ||
    typeof result.output.framesApplied !== 'number'
  ) {
    return undefined;
  }
  return result.output as AnimationExecutionJobOutput;
};

/** Maps domain playback and effect ports to the canonical ExecutionJob. */
export const createAnimationExecutionProvider = (
  options: CreateAnimationExecutionProviderOptions
): ExecutionProvider => {
  let jobSequence = 0;

  return Object.freeze({
    descriptor,
    start: async (request): Promise<ExecutionJob> => {
      const compatibility = getExecutionProviderCompatibility(
        descriptor,
        request
      );
      if (!compatibility.compatible) {
        throw new TypeError(
          'The Animation execution provider cannot satisfy this request.'
        );
      }
      const { documentId, timelineId } = resolveExecutionTarget(request);
      const cancellation = {
        aborted: false,
        reason: undefined as unknown,
      };
      let playback: AnimationPlayback | undefined;
      let timeoutRequested = false;
      const controller: ExecutionJobController = createExecutionJobController({
        jobId:
          options.createJobId?.(request) ??
          `animation:${request.requestId}:${++jobSequence}`,
        request,
        provider: descriptor,
        ...(options.now ? { now: options.now } : {}),
        requestCancellation: ({ reason }) => {
          cancellation.aborted = true;
          cancellation.reason = reason ?? 'Animation execution was cancelled.';
          if (playback) {
            void playback.cancel(String(cancellation.reason));
          }
          return 'accepted';
        },
      });

      const target = timelineTarget(documentId, timelineId);
      const trace = sourceTrace(target);
      const spanId = `${controller.job.id}:timeline:${timelineId}`;

      const publishEndTrace = (
        status: AnimationPlaybackResult['status'],
        result: AnimationPlaybackResult
      ): void => {
        if (!canPublish(controller)) return;
        controller.emitTrace({
          traceId: controller.job.id,
          spanId,
          name: 'animation.timeline',
          phase: 'end',
          detail: {
            status,
            elapsedMs: result.elapsedMs,
            framesApplied: result.framesApplied,
          },
          sourceTrace: trace,
        });
      };

      const settlePlayback = (result: AnimationPlaybackResult): void => {
        if (!canPublish(controller)) return;
        publishEndTrace(result.status, result);
        if (result.status === 'completed') {
          controller.succeed({
            output: Object.freeze({
              status: 'completed',
              timelineId,
              elapsedMs: result.elapsedMs,
              framesApplied: result.framesApplied,
            }),
          });
          return;
        }
        if (result.status === 'timed-out' || timeoutRequested) {
          controller.finishTimedOut(request.timeoutMs);
          return;
        }
        if (result.status === 'cancelled') {
          controller.finishCancelled(result.reason);
          return;
        }
        const message = result.reason ?? 'Animation effect playback failed.';
        const failureTarget = findTrackForFailure(documentId, currentTimeline);
        controller.emitDiagnostic({
          code: 'ANI-5001',
          severity: 'error',
          domain: 'animation',
          message,
          retryable: true,
          targetRef: failureTarget,
          meta: { documentId, timelineId, runId: controller.job.id },
        });
        controller.fail({
          code: 'ANIMATION_EFFECT_FAILED',
          message,
          retryable: true,
          sourceTrace: sourceTrace(failureTarget),
        });
      };

      let currentTimeline: AnimationTimeline = {
        id: timelineId,
        name: timelineId,
        durationMs: 1,
        motionIntent: 'decorative',
        reducedMotion: { kind: 'final-state' },
        markers: [],
        bindings: [],
      };

      const execute = async (): Promise<void> => {
        let codeRuntimeSession: AnimationCodeRuntimeSession | undefined;
        if (cancellation.aborted) {
          controller.finishCancelled(String(cancellation.reason));
          return;
        }
        controller.markStarting();
        try {
          const [resolvedDefinition, resolvedRuntime] = await Promise.all([
            options.resolveDocument(request),
            options.resolveRuntime(request),
          ]);
          if (!canPublish(controller)) return;
          if (cancellation.aborted) {
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          const validation = validateAnimationDefinition(resolvedDefinition);
          if (!validation.valid) {
            throw new TypeError('The Animation document is invalid.');
          }
          const definition = validation.definition;
          const timeline = definition.timelines.find(
            (candidate) => candidate.id === timelineId
          );
          if (!timeline) {
            const message = `Animation timeline "${timelineId}" does not exist.`;
            controller.emitDiagnostic({
              code: 'ANI-5002',
              severity: 'error',
              domain: 'animation',
              message,
              retryable: false,
              targetRef: target,
            });
            controller.fail({
              code: 'ANIMATION_TIMELINE_NOT_FOUND',
              message,
              retryable: false,
              sourceTrace: trace,
            });
            return;
          }
          currentTimeline = timeline;
          const issue = findRuntimeIssue(
            documentId,
            definition,
            timeline,
            resolvedRuntime
          );
          if (issue) {
            controller.emitDiagnostic({
              code: issue.code,
              severity: 'error',
              domain: 'animation',
              message: issue.message,
              retryable: false,
              targetRef: issue.targetRef,
            });
            controller.fail({
              code: 'ANIMATION_RUNTIME_UNSUPPORTED',
              message: issue.message,
              retryable: false,
              sourceTrace: sourceTrace(issue.targetRef),
            });
            return;
          }
          const codeSlots = timeline.codeSlots;
          const hasCodeSlots = Boolean(
            codeSlots?.customEasing || codeSlots?.shader || codeSlots?.script
          );
          if (hasCodeSlots) {
            const gateway = await options.resolveCodeRuntime?.(request);
            if (!gateway) {
              const message =
                'This animation uses a CodeSlot that is not executable in the selected runtime.';
              controller.emitDiagnostic({
                code: 'ANI-5101',
                severity: 'error',
                domain: 'animation',
                message,
                retryable: false,
                targetRef: target,
              });
              controller.fail({
                code: 'ANIMATION_RUNTIME_UNSUPPORTED',
                message,
                retryable: false,
                sourceTrace: trace,
              });
              return;
            }
            const prepared = await prepareAnimationCodeRuntime({
              bindings: codeSlots ?? {},
              gateway,
              motionMode: 'full',
              signal: cancellation,
            });
            if (prepared.status === 'blocked') {
              controller.emitDiagnostic({
                code:
                  prepared.issue.code === 'code-slot-capability-forbidden'
                    ? 'ANI-5103'
                    : prepared.issue.code === 'code-slot-contract-invalid'
                      ? 'ANI-5104'
                      : 'ANI-5101',
                severity: 'error',
                domain: 'animation',
                message: prepared.issue.safeMessage,
                retryable: false,
                targetRef: target,
              });
              controller.fail({
                code: 'ANIMATION_RUNTIME_UNSUPPORTED',
                message: prepared.issue.safeMessage,
                retryable: false,
                sourceTrace: trace,
              });
              return;
            }
            codeRuntimeSession = prepared.session;
            for (const log of prepared.session.compileLogs) {
              controller.emitLog({
                stream: 'console',
                level: 'info',
                message: `[${log.role}] ${log.text}`,
                sourceTrace: trace,
              });
            }
          }
          if (cancellation.aborted) {
            await codeRuntimeSession?.release('cancelled');
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          const runtime = codeRuntimeSession
            ? withCodeRuntimeSession(resolvedRuntime, codeRuntimeSession)
            : resolvedRuntime;
          const lease = await runtime.effects.acquire({
            playbackId: controller.job.id,
            animationDocumentId: documentId,
            timelineId,
            targetDocumentId: definition.target.documentId,
            signal: cancellation,
          });
          if (!canPublish(controller)) {
            await lease.release({
              outcome: 'timed-out',
              finalFramePolicy: 'clear',
            });
            return;
          }
          if (cancellation.aborted) {
            await lease.release({
              outcome: 'cancelled',
              finalFramePolicy: 'clear',
            });
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          controller.markRunning();
          controller.emitTrace({
            traceId: controller.job.id,
            spanId,
            name: 'animation.timeline',
            phase: 'start',
            detail: {
              timelineId,
              totalDurationMs: Number.isFinite(
                getAnimationTimelineTotalDurationMs(timeline)
              )
                ? getAnimationTimelineTotalDurationMs(timeline)
                : 'infinite',
              effectHostId: runtime.effects.descriptor.id,
            },
            sourceTrace: trace,
          });
          controller.emitLog({
            stream: 'console',
            level: 'info',
            message: `Playing animation timeline ${timeline.name || timeline.id}.`,
            sourceTrace: trace,
          });
          playback = startAnimationPlayback({
            playbackId: controller.job.id,
            animationDocumentId: documentId,
            definition,
            timeline,
            runtime,
            lease,
            signal: cancellation,
          });
          settlePlayback(await playback.completion);
        } catch (error) {
          await codeRuntimeSession?.release(
            timeoutRequested
              ? 'timed-out'
              : cancellation.aborted
                ? 'cancelled'
                : 'failed'
          );
          if (!canPublish(controller)) return;
          if (cancellation.aborted && !timeoutRequested) {
            controller.finishCancelled(String(cancellation.reason));
            return;
          }
          const message =
            error instanceof Error ? error.message : String(error);
          controller.emitDiagnostic({
            code: 'ANI-9001',
            severity: 'error',
            domain: 'animation',
            message,
            retryable: true,
            targetRef: target,
            meta: { documentId, timelineId, runId: controller.job.id },
          });
          controller.fail({
            code: 'ANIMATION_EXECUTION_FAILED',
            message,
            retryable: true,
            sourceTrace: trace,
          });
        }
      };

      const cancelTimeout =
        request.timeoutMs === undefined
          ? undefined
          : (options.scheduleTimeout ?? scheduleHostTimeout)(() => {
              if (!canPublish(controller)) return;
              timeoutRequested = true;
              cancellation.aborted = true;
              cancellation.reason = `Animation execution timed out after ${request.timeoutMs}ms.`;
              if (!playback) {
                controller.finishTimedOut(request.timeoutMs);
                return;
              }
              void playback
                .cancel(String(cancellation.reason), 'timed-out')
                .then(settlePlayback);
            }, request.timeoutMs);
      if (cancelTimeout) {
        void controller.job.completion.finally(cancelTimeout);
      }
      void Promise.resolve().then(execute);
      return controller.job;
    },
  });
};
