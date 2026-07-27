import {
  evaluateAnimationFrame,
  resolveTimelineCursorMs,
} from './animationEvaluation';
import type { AnimationDefinition, AnimationTimeline } from './animation.types';
import type {
  AnimationEffectLease,
  AnimationPlayback,
  AnimationPlaybackObservation,
  AnimationPlaybackResult,
  AnimationPlaybackSnapshot,
  AnimationRuntimeContributor,
  AnimationRuntimeFrame,
  AnimationRuntimePort,
} from './animationRuntime';
import { getAnimationTimelineTotalDurationMs } from './animationRuntime';

export type StartAnimationPlaybackInput = Readonly<{
  playbackId: string;
  animationDocumentId: string;
  definition: AnimationDefinition;
  timeline: AnimationTimeline;
  runtime: AnimationRuntimePort;
  lease: AnimationEffectLease;
  signal: Readonly<{ readonly aborted: boolean; readonly reason?: unknown }>;
  generation?: string;
  motionMode?: 'full' | 'reduced';
  seekMarkerPolicy?: 'suppress' | 'emit-crossed';
  onObservation?(
    observation: AnimationPlaybackObservation
  ): void | Promise<void>;
}>;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const collectContributors = (
  animationDocumentId: string,
  definition: AnimationDefinition,
  timeline: AnimationTimeline
): readonly AnimationRuntimeContributor[] =>
  Object.freeze(
    timeline.bindings.flatMap((binding) =>
      binding.tracks.map((track) =>
        Object.freeze({
          animationDocumentId,
          timelineId: timeline.id,
          bindingId: binding.id,
          trackId: track.id,
          targetDocumentId: definition.target.documentId,
          targetNodeId: binding.targetNodeId,
        })
      )
    )
  );

type ActiveAnimationPlaybackStatus = 'running' | 'paused';

type TimelineMarkerOccurrence = Readonly<{
  markerId: string;
  markerKind: AnimationPlaybackObservation['markerKind'];
  iteration: number;
  elapsedMs: number;
}>;

const collectTimelineMarkerOccurrences = (
  timeline: AnimationTimeline,
  fromExclusiveMs: number,
  toInclusiveMs: number
): readonly TimelineMarkerOccurrence[] => {
  if (toInclusiveMs < fromExclusiveMs || timeline.markers.length === 0) {
    return [];
  }
  const delayMs = timeline.delayMs ?? 0;
  if (toInclusiveMs < delayMs) return [];
  const finiteIterations =
    timeline.iterations === 'infinite'
      ? Number.POSITIVE_INFINITY
      : (timeline.iterations ?? 1);
  const lastCandidateIteration = Math.max(
    0,
    Math.floor((toInclusiveMs - delayMs) / timeline.durationMs)
  );
  const lastIteration = Number.isFinite(finiteIterations)
    ? Math.min(lastCandidateIteration, finiteIterations - 1)
    : lastCandidateIteration;
  const occurrences: TimelineMarkerOccurrence[] = [];
  for (let iteration = 0; iteration <= lastIteration; iteration += 1) {
    const direction = timeline.direction ?? 'normal';
    const reverse =
      direction === 'reverse' ||
      (direction === 'alternate' && iteration % 2 === 1) ||
      (direction === 'alternate-reverse' && iteration % 2 === 0);
    timeline.markers.forEach((marker) => {
      const elapsedMs =
        delayMs +
        iteration * timeline.durationMs +
        (reverse ? timeline.durationMs - marker.atMs : marker.atMs);
      if (elapsedMs > fromExclusiveMs && elapsedMs <= toInclusiveMs) {
        occurrences.push({
          markerId: marker.id,
          markerKind: marker.kind,
          iteration,
          elapsedMs,
        });
      }
    });
  }
  return occurrences.sort(
    (left, right) =>
      left.elapsedMs - right.elapsedMs ||
      left.iteration - right.iteration ||
      timeline.markers.findIndex(({ id }) => id === left.markerId) -
        timeline.markers.findIndex(({ id }) => id === right.markerId)
  );
};

/** Drives one timeline with serialized effect writes and explicit clock controls. */
export const startAnimationPlayback = (
  input: StartAnimationPlaybackInput
): AnimationPlayback => {
  const generation = (input.generation ?? input.playbackId).trim();
  if (!generation) {
    throw new TypeError('Animation playback generation is required.');
  }
  const motionMode = input.motionMode ?? 'full';
  const initialSchedulerTimestampMs = input.runtime.scheduler.now();
  if (!Number.isFinite(initialSchedulerTimestampMs)) {
    throw new TypeError('Animation scheduler must return a finite timestamp.');
  }

  const totalDurationMs = getAnimationTimelineTotalDurationMs(input.timeline);
  const contributors = collectContributors(
    input.animationDocumentId,
    input.definition,
    input.timeline
  );
  let elapsedMs = 0;
  let cursorMs = resolveTimelineCursorMs(input.timeline, 0);
  let lastSchedulerTimestampMs = initialSchedulerTimestampMs;
  let framesApplied = 0;
  let sequence = 0;
  let observationSequence = 0;
  let startedEmitted = false;
  let lastMarkerElapsedMs = -1;
  let playbackStatus:
    ActiveAnimationPlaybackStatus | AnimationPlaybackResult['status'] =
    'running';
  let cancellationReason: string | undefined;
  let cancellationOutcome: 'cancelled' | 'timed-out' = 'cancelled';
  let cancelScheduledFrame: (() => void) | undefined;
  let finalization: Promise<AnimationPlaybackResult> | undefined;
  let work = Promise.resolve();
  let resolveCompletion: (result: AnimationPlaybackResult) => void = () =>
    undefined;
  const completion = new Promise<AnimationPlaybackResult>((resolve) => {
    resolveCompletion = resolve;
  });

  const emitObservation = async (
    kind: AnimationPlaybackObservation['kind'],
    details: Partial<
      Pick<
        AnimationPlaybackObservation,
        'markerId' | 'markerKind' | 'iteration' | 'reason' | 'logicalTimeMs'
      >
    > = {}
  ): Promise<void> => {
    observationSequence += 1;
    await input.onObservation?.(
      Object.freeze({
        kind,
        sequence: observationSequence,
        playbackId: input.playbackId,
        generation,
        animationDocumentId: input.animationDocumentId,
        timelineId: input.timeline.id,
        targetDocumentId: input.definition.target.documentId,
        logicalTimeMs: details.logicalTimeMs ?? elapsedMs,
        motionMode,
        ...(details.markerId ? { markerId: details.markerId } : {}),
        ...(details.markerKind ? { markerKind: details.markerKind } : {}),
        ...(details.iteration !== undefined
          ? { iteration: details.iteration }
          : {}),
        ...(details.reason ? { reason: details.reason } : {}),
      })
    );
  };

  const snapshot = (): AnimationPlaybackSnapshot =>
    Object.freeze({
      status: playbackStatus,
      elapsedMs,
      cursorMs,
      framesApplied,
      sequence,
    });

  const releasePolicy = (
    outcome: AnimationPlaybackResult['status']
  ): 'retain' | 'clear' =>
    outcome === 'completed' &&
    (input.timeline.fillMode === 'forwards' ||
      input.timeline.fillMode === 'both')
      ? 'retain'
      : 'clear';

  const finalize = (
    outcome: AnimationPlaybackResult['status'],
    reason?: string
  ): Promise<AnimationPlaybackResult> => {
    if (finalization) return finalization;
    cancelScheduledFrame?.();
    cancelScheduledFrame = undefined;
    finalization = (async () => {
      let finalStatus = outcome;
      let finalReason = reason;
      try {
        await input.lease.release({
          outcome,
          finalFramePolicy: releasePolicy(outcome),
        });
      } catch (error) {
        finalStatus = 'failed';
        finalReason = errorMessage(error);
      }
      try {
        if (finalStatus === 'completed') {
          await emitObservation('settled');
          await emitObservation('completed');
        } else if (finalStatus === 'cancelled' || finalStatus === 'timed-out') {
          await emitObservation('cancelled', {
            ...(finalReason ? { reason: finalReason } : {}),
          });
        } else {
          await emitObservation('failed', {
            ...(finalReason ? { reason: finalReason } : {}),
          });
        }
      } catch (error) {
        finalStatus = 'failed';
        finalReason = errorMessage(error);
      }
      playbackStatus = finalStatus;
      const result = Object.freeze({
        status: finalStatus,
        elapsedMs,
        framesApplied,
        ...(finalReason ? { reason: finalReason } : {}),
      });
      resolveCompletion(result);
      return result;
    })();
    return finalization;
  };

  const isCancelled = () => input.signal.aborted || Boolean(cancellationReason);

  const applyAtCurrentPosition = async (): Promise<void> => {
    if (isCancelled()) {
      await finalize(
        cancellationOutcome,
        cancellationReason ??
          'Animation playback was cancelled by its runtime signal.'
      );
      return;
    }

    sequence += 1;
    cursorMs = resolveTimelineCursorMs(input.timeline, elapsedMs);
    if (!startedEmitted) {
      try {
        await emitObservation('started');
        startedEmitted = true;
      } catch (error) {
        await finalize('failed', errorMessage(error));
        return;
      }
    }
    const runtimeFrame: AnimationRuntimeFrame = Object.freeze({
      sequence,
      elapsedMs,
      cursorMs,
      animationDocumentId: input.animationDocumentId,
      timelineId: input.timeline.id,
      targetDocumentId: input.definition.target.documentId,
      frame: evaluateAnimationFrame({
        timelines: [input.timeline],
        globalMs: elapsedMs,
        svgFilters: input.definition.svgFilters ?? [],
      }),
      contributors,
    });
    try {
      await input.lease.applyFrame(runtimeFrame);
      framesApplied += 1;
      const markerOccurrences = collectTimelineMarkerOccurrences(
        input.timeline,
        lastMarkerElapsedMs,
        elapsedMs
      );
      for (const occurrence of markerOccurrences) {
        await emitObservation('marker-reached', {
          markerId: occurrence.markerId,
          markerKind: occurrence.markerKind,
          iteration: occurrence.iteration,
          logicalTimeMs: occurrence.elapsedMs,
        });
      }
      lastMarkerElapsedMs = elapsedMs;
    } catch (error) {
      await finalize('failed', errorMessage(error));
      return;
    }

    if (isCancelled()) {
      await finalize(
        cancellationOutcome,
        cancellationReason ??
          'Animation playback was cancelled by its runtime signal.'
      );
      return;
    }
    if (elapsedMs >= totalDurationMs) {
      await finalize('completed');
    }
  };

  const scheduleNextFrame = (): void => {
    if (playbackStatus !== 'running' || finalization || cancelScheduledFrame)
      return;
    cancelScheduledFrame = input.runtime.scheduler.scheduleFrame(
      (nextTimestampMs) => {
        cancelScheduledFrame = undefined;
        work = work
          .then(async () => {
            if (playbackStatus !== 'running' || finalization) return;
            if (!Number.isFinite(nextTimestampMs)) {
              await finalize(
                'failed',
                'Animation scheduler emitted a non-finite timestamp.'
              );
              return;
            }
            const deltaMs = Math.max(
              0,
              nextTimestampMs - lastSchedulerTimestampMs
            );
            lastSchedulerTimestampMs = nextTimestampMs;
            elapsedMs = Number.isFinite(totalDurationMs)
              ? Math.min(elapsedMs + deltaMs, totalDurationMs)
              : elapsedMs + deltaMs;
            await applyAtCurrentPosition();
            scheduleNextFrame();
          })
          .catch(async (error: unknown) => {
            await finalize('failed', errorMessage(error));
          });
      }
    );
  };

  work = work
    .then(async () => {
      await applyAtCurrentPosition();
      scheduleNextFrame();
    })
    .catch(async (error: unknown) => {
      await finalize('failed', errorMessage(error));
    });
  const ready = work.then(() => snapshot());

  return Object.freeze({
    ready,
    completion,
    snapshot,
    pause: async () => {
      cancelScheduledFrame?.();
      cancelScheduledFrame = undefined;
      work = work.then(async () => {
        if (finalization) {
          await finalization;
          return;
        }
        if (isCancelled()) {
          await finalize(
            cancellationOutcome,
            cancellationReason ??
              'Animation playback was cancelled by its runtime signal.'
          );
          return;
        }
        playbackStatus = 'paused';
        await emitObservation('paused');
      });
      await work;
      return snapshot();
    },
    resume: async () => {
      work = work.then(async () => {
        if (finalization) {
          await finalization;
          return;
        }
        if (isCancelled()) {
          await finalize(
            cancellationOutcome,
            cancellationReason ??
              'Animation playback was cancelled by its runtime signal.'
          );
          return;
        }
        if (playbackStatus !== 'paused') return;
        const resumedAt = input.runtime.scheduler.now();
        if (!Number.isFinite(resumedAt)) {
          await finalize(
            'failed',
            'Animation scheduler must return a finite timestamp.'
          );
          return;
        }
        lastSchedulerTimestampMs = resumedAt;
        playbackStatus = 'running';
        await emitObservation('resumed');
        scheduleNextFrame();
      });
      await work;
      return snapshot();
    },
    seek: async (positionMs: number) => {
      if (!Number.isFinite(positionMs) || positionMs < 0) {
        throw new TypeError(
          'Animation seek position must be a finite non-negative number.'
        );
      }
      cancelScheduledFrame?.();
      cancelScheduledFrame = undefined;
      work = work.then(async () => {
        if (finalization) {
          await finalization;
          return;
        }
        if (isCancelled()) {
          await finalize(
            cancellationOutcome,
            cancellationReason ??
              'Animation playback was cancelled by its runtime signal.'
          );
          return;
        }
        const previousElapsedMs = elapsedMs;
        elapsedMs = Number.isFinite(totalDurationMs)
          ? Math.min(positionMs, totalDurationMs)
          : positionMs;
        if (
          input.seekMarkerPolicy !== 'emit-crossed' ||
          elapsedMs < previousElapsedMs
        ) {
          lastMarkerElapsedMs = elapsedMs;
        } else {
          lastMarkerElapsedMs = previousElapsedMs;
        }
        const seekTimestamp = input.runtime.scheduler.now();
        if (!Number.isFinite(seekTimestamp)) {
          await finalize(
            'failed',
            'Animation scheduler must return a finite timestamp.'
          );
          return;
        }
        lastSchedulerTimestampMs = seekTimestamp;
        await applyAtCurrentPosition();
        scheduleNextFrame();
      });
      await work;
      return snapshot();
    },
    cancel: async (
      reason = 'Animation playback was cancelled.',
      outcome: 'cancelled' | 'timed-out' = 'cancelled'
    ) => {
      if (finalization) return finalization;
      cancellationReason = reason;
      cancellationOutcome = outcome;
      cancelScheduledFrame?.();
      cancelScheduledFrame = undefined;
      await work;
      return finalize(outcome, reason);
    },
  });
};
