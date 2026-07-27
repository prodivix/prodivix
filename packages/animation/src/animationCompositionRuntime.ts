import { redactExecutionConsoleText } from '@prodivix/runtime-core';
import type {
  AnimationCompositionProgram,
  AnimationCompositionProgramEvent,
} from './animationCompositionCompiler';
import type { AnimationMotionMode } from './animation.types';

export type AnimationCompositionCancellationSignal = Readonly<{
  readonly aborted: boolean;
  readonly reason?: unknown;
}>;

export type AnimationCompositionCancellationController = Readonly<{
  signal: AnimationCompositionCancellationSignal;
  abort(reason?: unknown): void;
}>;

export const createAnimationCompositionCancellationController =
  (): AnimationCompositionCancellationController => {
    let aborted = false;
    let reason: unknown;
    return Object.freeze({
      signal: Object.freeze({
        get aborted() {
          return aborted;
        },
        get reason() {
          return reason;
        },
      }),
      abort(nextReason = 'Animation composition was cancelled.') {
        if (aborted) return;
        aborted = true;
        reason = nextReason;
      },
    });
  };

export type AnimationCompositionObservation = Readonly<{
  kind:
    | 'composition-started'
    | AnimationCompositionProgramEvent['kind']
    | 'composition-completed'
    | 'composition-cancelled'
    | 'composition-failed';
  instanceId: string;
  generation: string;
  animationDocumentId: string;
  compositionId: string;
  targetDocumentId: string;
  motionMode: AnimationMotionMode;
  programDigest: string;
  logicalTimeMs: number;
  sequence: number;
  compositionNodeId?: string;
  timelineId?: string;
  resolvedTimelineId?: string;
  timelineDigest?: string;
  markerId?: string;
  iteration?: number;
  reason?: string;
}>;

export type AnimationCompositionRuntimePort = Readonly<{
  clock: Readonly<{
    advanceTo(
      logicalTimeMs: number,
      signal: AnimationCompositionCancellationSignal
    ): void | Promise<void>;
  }>;
  effects: Readonly<{
    apply(
      event: AnimationCompositionProgramEvent,
      context: Readonly<{
        instanceId: string;
        generation: string;
        animationDocumentId: string;
        targetDocumentId: string;
        motionMode: AnimationMotionMode;
        programDigest: string;
        signal: AnimationCompositionCancellationSignal;
      }>
    ): void | Promise<void>;
  }>;
  observations: Readonly<{
    publish(observation: AnimationCompositionObservation): void | Promise<void>;
  }>;
}>;

export type AnimationCompositionExecutionResult = Readonly<{
  status: 'completed' | 'cancelled' | 'failed';
  logicalTimeMs: number;
  eventsApplied: number;
  observations: readonly AnimationCompositionObservation[];
  reason?: string;
}>;

const canonicalIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new TypeError(`${label} must be a canonical non-empty string.`);
  }
  return normalized;
};

const sanitizedReason = (reason: unknown): string => {
  const source = reason instanceof Error ? reason.message : String(reason);
  const normalized = source
    .replaceAll(/[\r\n\t]+/gu, ' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  return redactExecutionConsoleText(
    (normalized || 'Animation composition failed.').slice(0, 512)
  ).value.slice(0, 512);
};

const eventObservation = (
  input: Readonly<{
    event: AnimationCompositionProgramEvent;
    instanceId: string;
    generation: string;
    animationDocumentId: string;
    targetDocumentId: string;
    program: AnimationCompositionProgram;
  }>
): AnimationCompositionObservation =>
  Object.freeze({
    kind: input.event.kind,
    instanceId: input.instanceId,
    generation: input.generation,
    animationDocumentId: input.animationDocumentId,
    compositionId: input.program.compositionId,
    targetDocumentId: input.targetDocumentId,
    motionMode: input.program.motionMode,
    programDigest: input.program.programDigest,
    logicalTimeMs: input.event.atMs,
    sequence: input.event.sequence,
    compositionNodeId: input.event.compositionNodeId,
    ...(input.event.timelineId ? { timelineId: input.event.timelineId } : {}),
    ...(input.event.resolvedTimelineId
      ? { resolvedTimelineId: input.event.resolvedTimelineId }
      : {}),
    ...(input.event.timelineDigest
      ? { timelineDigest: input.event.timelineDigest }
      : {}),
    ...(input.event.markerId ? { markerId: input.event.markerId } : {}),
    ...(input.event.iteration !== undefined
      ? { iteration: input.event.iteration }
      : {}),
  });

/**
 * Executes one immutable program against an explicit logical clock. The port
 * owns target effects; the domain runtime only applies stable program order.
 */
export const executeAnimationCompositionProgram = async (
  input: Readonly<{
    program: AnimationCompositionProgram;
    runtime: AnimationCompositionRuntimePort;
    signal: AnimationCompositionCancellationSignal;
    instanceId: string;
    generation: string;
    animationDocumentId: string;
    targetDocumentId: string;
  }>
): Promise<AnimationCompositionExecutionResult> => {
  const instanceId = canonicalIdentity(input.instanceId, 'Animation instance');
  const generation = canonicalIdentity(
    input.generation,
    'Animation generation'
  );
  const animationDocumentId = canonicalIdentity(
    input.animationDocumentId,
    'Animation document'
  );
  const targetDocumentId = canonicalIdentity(
    input.targetDocumentId,
    'Animation target document'
  );
  const observations: AnimationCompositionObservation[] = [];
  let logicalTimeMs = 0;
  let eventsApplied = 0;
  let terminalSequence = 0;
  const publish = async (
    observation: AnimationCompositionObservation
  ): Promise<void> => {
    await input.runtime.observations.publish(observation);
    observations.push(observation);
  };
  const terminal = (
    kind:
      | 'composition-started'
      | 'composition-completed'
      | 'composition-cancelled'
      | 'composition-failed',
    reason?: string
  ): AnimationCompositionObservation =>
    Object.freeze({
      kind,
      instanceId,
      generation,
      animationDocumentId,
      compositionId: input.program.compositionId,
      targetDocumentId,
      motionMode: input.program.motionMode,
      programDigest: input.program.programDigest,
      logicalTimeMs,
      sequence: terminalSequence,
      ...(reason ? { reason } : {}),
    });

  try {
    terminalSequence = 0;
    await publish(terminal('composition-started'));
    for (const event of input.program.events) {
      if (input.signal.aborted) {
        const reason = sanitizedReason(
          input.signal.reason ?? 'Animation composition was cancelled.'
        );
        terminalSequence = event.sequence;
        await publish(terminal('composition-cancelled', reason));
        return Object.freeze({
          status: 'cancelled',
          logicalTimeMs,
          eventsApplied,
          observations: Object.freeze([...observations]),
          reason,
        });
      }
      if (!Number.isFinite(event.atMs) || event.atMs < logicalTimeMs) {
        throw new TypeError(
          'Animation composition program contains a non-monotonic logical time.'
        );
      }
      await input.runtime.clock.advanceTo(event.atMs, input.signal);
      if (input.signal.aborted) {
        const reason = sanitizedReason(
          input.signal.reason ?? 'Animation composition was cancelled.'
        );
        terminalSequence = event.sequence;
        await publish(terminal('composition-cancelled', reason));
        return Object.freeze({
          status: 'cancelled',
          logicalTimeMs,
          eventsApplied,
          observations: Object.freeze([...observations]),
          reason,
        });
      }
      logicalTimeMs = event.atMs;
      await input.runtime.effects.apply(event, {
        instanceId,
        generation,
        animationDocumentId,
        targetDocumentId,
        motionMode: input.program.motionMode,
        programDigest: input.program.programDigest,
        signal: input.signal,
      });
      eventsApplied += 1;
      await publish(
        eventObservation({
          event,
          instanceId,
          generation,
          animationDocumentId,
          targetDocumentId,
          program: input.program,
        })
      );
    }
    if (logicalTimeMs < input.program.durationMs) {
      await input.runtime.clock.advanceTo(
        input.program.durationMs,
        input.signal
      );
      logicalTimeMs = input.program.durationMs;
    }
    if (input.signal.aborted) {
      const reason = sanitizedReason(
        input.signal.reason ?? 'Animation composition was cancelled.'
      );
      terminalSequence = input.program.events.length + 1;
      await publish(terminal('composition-cancelled', reason));
      return Object.freeze({
        status: 'cancelled',
        logicalTimeMs,
        eventsApplied,
        observations: Object.freeze([...observations]),
        reason,
      });
    }
    terminalSequence = input.program.events.length + 1;
    await publish(terminal('composition-completed'));
    return Object.freeze({
      status: 'completed',
      logicalTimeMs,
      eventsApplied,
      observations: Object.freeze([...observations]),
    });
  } catch (error) {
    const reason = sanitizedReason(error);
    terminalSequence = input.program.events.length + 1;
    try {
      await publish(terminal('composition-failed', reason));
    } catch {
      // The original runtime failure remains the stable result.
    }
    return Object.freeze({
      status: 'failed',
      logicalTimeMs,
      eventsApplied,
      observations: Object.freeze([...observations]),
      reason,
    });
  }
};
