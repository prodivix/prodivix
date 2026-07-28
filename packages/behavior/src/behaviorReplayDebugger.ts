import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type {
  BehaviorRuntimeDebugPort,
  BehaviorRuntimeResult,
} from './behaviorRuntime';
import type { BehaviorSourceRef } from './behavior.types';

export type BehaviorReplayDebugStatus =
  'running' | 'paused' | 'completed' | 'failed' | 'blocked' | 'cancelled';

export type BehaviorReplayDebugIdentity = Readonly<{
  attemptId: string;
  programDigest: string;
  generation: number;
  leaseId: string;
}>;

export type BehaviorReplayDebugCommand = BehaviorReplayDebugIdentity &
  Readonly<{
    expectedCommandSequence: number;
    kind:
      | 'pause'
      | 'step'
      | 'continue'
      | 'cancel'
      | 'fresh-replay'
      | 'set-breakpoints';
    stepIds?: readonly string[];
  }>;

export type BehaviorReplayDebugEvent = Readonly<{
  sequence: number;
  commandSequence: number;
  kind:
    | 'attached'
    | 'pause-requested'
    | 'paused'
    | 'resumed'
    | 'instruction-entered'
    | 'instruction-exited'
    | 'breakpoints-updated'
    | 'cancelled'
    | 'completed'
    | 'failed'
    | 'fresh-replay-requested';
  instructionId?: string;
  stepId?: string;
  source?: BehaviorSourceRef;
}>;

export type BehaviorReplayDebugSnapshot = Readonly<{
  identity: BehaviorReplayDebugIdentity;
  status: BehaviorReplayDebugStatus;
  commandSequence: number;
  eventSequence: number;
  current?: Readonly<{
    instructionId: string;
    stepId: string;
    source: BehaviorSourceRef;
  }>;
  breakpoints: readonly string[];
  events: readonly BehaviorReplayDebugEvent[];
  droppedEventCount: number;
}>;

export type BehaviorReplayDebugIssue = Readonly<{
  code:
    'stale-command' | 'invalid-state' | 'invalid-breakpoint' | 'lease-expired';
  safeMessage: string;
}>;

export type BehaviorReplayDebugCommandResult =
  | Readonly<{
      accepted: true;
      snapshot: BehaviorReplayDebugSnapshot;
      action?: 'fresh-replay';
    }>
  | Readonly<{
      accepted: false;
      issue: BehaviorReplayDebugIssue;
      snapshot: BehaviorReplayDebugSnapshot;
    }>;

export type BehaviorReplayDebugController = BehaviorRuntimeDebugPort &
  Readonly<{
    snapshot(): BehaviorReplayDebugSnapshot;
    command(
      command: BehaviorReplayDebugCommand
    ): BehaviorReplayDebugCommandResult;
    subscribe(listener: () => void): () => void;
  }>;

export type CreateBehaviorReplayDebugControllerInput = Readonly<{
  attemptId: string;
  programDigest: string;
  leaseId: string;
  stepIds: readonly string[];
  generation?: number;
  startPaused?: boolean;
  maximumCommands?: number;
  maximumEvents?: number;
  maximumBreakpoints?: number;
}>;

const canonicalIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new TypeError(`${label} must be a bounded canonical identity.`);
  }
  return normalized;
};

const boundedPositiveInteger = (
  value: number,
  maximum: number,
  label: string
): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new TypeError(
      `${label} must be a positive safe integer no greater than ${maximum}.`
    );
  }
  return value;
};

/**
 * Shares the runtime instruction boundary with replay. A backwards move never
 * mutates the active attempt; it returns a fresh-replay action to the host.
 */
export const createBehaviorReplayDebugController = (
  input: CreateBehaviorReplayDebugControllerInput
): BehaviorReplayDebugController => {
  const generation = input.generation ?? 1;
  if (!Number.isSafeInteger(generation) || generation < 1) {
    throw new TypeError('Behavior debugger generation must be positive.');
  }
  const identity = Object.freeze({
    attemptId: canonicalIdentity(input.attemptId, 'Debug attempt id'),
    programDigest: canonicalIdentity(
      input.programDigest,
      'Debug Program digest'
    ),
    generation,
    leaseId: canonicalIdentity(input.leaseId, 'Debug lease id'),
  });
  const allowedSteps = new Set(
    input.stepIds.map((stepId) =>
      canonicalIdentity(stepId, 'Debug Behavior step id')
    )
  );
  if (
    allowedSteps.size !== input.stepIds.length ||
    allowedSteps.size > 100_000
  ) {
    throw new TypeError(
      'Behavior debugger Program steps must be unique and bounded.'
    );
  }
  const maximumEvents = boundedPositiveInteger(
    input.maximumEvents ?? 2_048,
    100_000,
    'Behavior debugger event budget'
  );
  const maximumCommands = boundedPositiveInteger(
    input.maximumCommands ?? 4_096,
    100_000,
    'Behavior debugger command budget'
  );
  const maximumBreakpoints = boundedPositiveInteger(
    input.maximumBreakpoints ?? 256,
    10_000,
    'Behavior debugger breakpoint budget'
  );
  const events: BehaviorReplayDebugEvent[] = [];
  const breakpoints = new Set<string>();
  const listeners = new Set<() => void>();
  let status: BehaviorReplayDebugStatus = input.startPaused
    ? 'paused'
    : 'running';
  let commandSequence = 0;
  let eventSequence = 0;
  let droppedEventCount = 0;
  let pauseRequested = Boolean(input.startPaused);
  let stepBudget: number | undefined;
  let current:
    | Readonly<{
        instructionId: string;
        stepId: string;
        source: BehaviorSourceRef;
      }>
    | undefined;
  let resume: (() => void) | undefined;

  const notify = (): void => listeners.forEach((listener) => listener());
  const append = (
    event: Omit<BehaviorReplayDebugEvent, 'sequence' | 'commandSequence'>
  ): void => {
    eventSequence += 1;
    events.push(
      Object.freeze({
        sequence: eventSequence,
        commandSequence,
        ...event,
      })
    );
    if (events.length > maximumEvents) {
      events.shift();
      droppedEventCount += 1;
    }
    notify();
  };
  append({ kind: 'attached' });

  const snapshot = (): BehaviorReplayDebugSnapshot =>
    Object.freeze({
      identity,
      status,
      commandSequence,
      eventSequence,
      ...(current ? { current } : {}),
      breakpoints: Object.freeze(
        [...breakpoints].sort(compareUnicodeCodePoints)
      ),
      events: Object.freeze([...events]),
      droppedEventCount,
    });

  const reject = (
    issue: BehaviorReplayDebugIssue
  ): BehaviorReplayDebugCommandResult =>
    Object.freeze({ accepted: false, issue, snapshot: snapshot() });

  const validateCommand = (
    command: BehaviorReplayDebugCommand
  ): BehaviorReplayDebugIssue | null => {
    if (
      command.attemptId !== identity.attemptId ||
      command.programDigest !== identity.programDigest ||
      command.generation !== identity.generation
    ) {
      return Object.freeze({
        code: 'stale-command',
        safeMessage:
          'Behavior debug command belongs to a stale attempt or Program.',
      });
    }
    if (command.leaseId !== identity.leaseId) {
      return Object.freeze({
        code: 'lease-expired',
        safeMessage: 'Behavior debug lease is unavailable.',
      });
    }
    if (command.expectedCommandSequence !== commandSequence + 1) {
      return Object.freeze({
        code: 'stale-command',
        safeMessage: 'Behavior debug command sequence is stale.',
      });
    }
    if (commandSequence >= maximumCommands) {
      return Object.freeze({
        code: 'lease-expired',
        safeMessage: 'Behavior debug command lease budget is exhausted.',
      });
    }
    return null;
  };

  const release = (): void => {
    const pending = resume;
    resume = undefined;
    pending?.();
  };

  const controller: BehaviorReplayDebugController = Object.freeze({
    snapshot,
    command(command) {
      const invalid = validateCommand(command);
      if (invalid) return reject(invalid);
      commandSequence += 1;

      if (command.kind === 'set-breakpoints') {
        const stepIds = command.stepIds ?? [];
        if (
          status !== 'paused' ||
          stepIds.length > maximumBreakpoints ||
          new Set(stepIds).size !== stepIds.length ||
          stepIds.some((stepId) => !allowedSteps.has(stepId))
        ) {
          return reject(
            Object.freeze({
              code: 'invalid-breakpoint',
              safeMessage:
                'Behavior breakpoints must be unique bounded Program step identities while paused.',
            })
          );
        }
        breakpoints.clear();
        stepIds.forEach((stepId) => breakpoints.add(stepId));
        append({ kind: 'breakpoints-updated' });
        return Object.freeze({ accepted: true, snapshot: snapshot() });
      }

      if (command.kind === 'pause') {
        if (status !== 'running') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage: 'Behavior pause requires a running attempt.',
            })
          );
        }
        pauseRequested = true;
        append({ kind: 'pause-requested' });
        return Object.freeze({ accepted: true, snapshot: snapshot() });
      }

      if (command.kind === 'cancel') {
        if (status !== 'running' && status !== 'paused') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage: 'Behavior cancel requires an active attempt.',
            })
          );
        }
        status = 'cancelled';
        append({ kind: 'cancelled' });
        release();
        return Object.freeze({ accepted: true, snapshot: snapshot() });
      }

      if (command.kind === 'fresh-replay') {
        if (status === 'running') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'Fresh replay requires a paused or terminal attempt.',
            })
          );
        }
        if (status === 'paused') {
          status = 'cancelled';
          release();
        }
        append({ kind: 'fresh-replay-requested' });
        return Object.freeze({
          accepted: true,
          snapshot: snapshot(),
          action: 'fresh-replay',
        });
      }

      if (command.kind === 'continue' || command.kind === 'step') {
        if (status !== 'paused') {
          return reject(
            Object.freeze({
              code: 'invalid-state',
              safeMessage:
                'Behavior continue and step require one paused attempt.',
            })
          );
        }
        status = 'running';
        pauseRequested = false;
        stepBudget = command.kind === 'step' ? 1 : undefined;
        append({ kind: 'resumed' });
        release();
        return Object.freeze({ accepted: true, snapshot: snapshot() });
      }

      return reject(
        Object.freeze({
          code: 'invalid-state',
          safeMessage: 'Behavior debug command is unavailable.',
        })
      );
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async beforeInstruction(instruction) {
      if (
        status === 'cancelled' ||
        instruction.attemptId !== identity.attemptId ||
        !allowedSteps.has(instruction.stepId)
      ) {
        return 'cancel';
      }
      current = Object.freeze({
        instructionId: instruction.instructionId,
        stepId: instruction.stepId,
        source: instruction.source,
      });
      append({
        kind: 'instruction-entered',
        instructionId: instruction.instructionId,
        stepId: instruction.stepId,
        source: instruction.source,
      });
      const shouldPause =
        pauseRequested ||
        breakpoints.has(instruction.stepId) ||
        stepBudget === 0;
      if (!shouldPause) return;
      status = 'paused';
      pauseRequested = false;
      append({
        kind: 'paused',
        instructionId: instruction.instructionId,
        stepId: instruction.stepId,
        source: instruction.source,
      });
      await new Promise<void>((resolve) => {
        resume = resolve;
      });
      return snapshot().status === 'cancelled' ? 'cancel' : undefined;
    },
    afterInstruction(instruction) {
      if (
        instruction.attemptId !== identity.attemptId ||
        !allowedSteps.has(instruction.stepId)
      ) {
        return;
      }
      if (stepBudget !== undefined) {
        stepBudget = Math.max(0, stepBudget - 1);
      }
      append({
        kind: 'instruction-exited',
        instructionId: instruction.instructionId,
        stepId: instruction.stepId,
        source: instruction.source,
      });
    },
    finish(
      result: Readonly<{
        attemptId: string;
        status: BehaviorRuntimeResult['status'];
      }>
    ) {
      if (result.attemptId !== identity.attemptId || status === 'cancelled') {
        return;
      }
      status =
        result.status === 'completed'
          ? 'completed'
          : result.status === 'cancelled'
            ? 'cancelled'
            : result.status;
      append({
        kind:
          status === 'completed'
            ? 'completed'
            : status === 'cancelled'
              ? 'cancelled'
              : 'failed',
      });
      release();
    },
  });
  return controller;
};

export const createBehaviorReplayDebugCommand = (
  snapshot: BehaviorReplayDebugSnapshot,
  kind: BehaviorReplayDebugCommand['kind'],
  stepIds?: readonly string[]
): BehaviorReplayDebugCommand =>
  Object.freeze({
    ...snapshot.identity,
    expectedCommandSequence: snapshot.commandSequence + 1,
    kind,
    ...(stepIds ? { stepIds: Object.freeze([...stepIds]) } : {}),
  });
