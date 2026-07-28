import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export type DeterministicSchedulerTaskResult =
  | Readonly<{ status: 'completed' }>
  | Readonly<{ status: 'cancelled'; reason?: string }>;

export type DeterministicSchedulerTask = Readonly<{
  id: string;
  lane: string;
  readyAt: number;
  run():
    | void
    | DeterministicSchedulerTaskResult
    | Promise<void | DeterministicSchedulerTaskResult>;
}>;

export type DeterministicSchedulerEvent = Readonly<{
  sequence: number;
  logicalTime: number;
  kind:
    | 'task-enqueued'
    | 'task-started'
    | 'task-completed'
    | 'task-cancelled'
    | 'barrier-created'
    | 'barrier-arrived'
    | 'barrier-released'
    | 'wait-satisfied'
    | 'wait-timed-out'
    | 'deadlock'
    | 'task-flood'
    | 'paused'
    | 'resumed'
    | 'cancelled';
  taskId?: string;
  lane?: string;
  barrierId?: string;
  conditionId?: string;
  detail?: string;
}>;

export type DeterministicSchedulerSnapshot = Readonly<{
  status:
    | 'idle'
    | 'running'
    | 'paused'
    | 'cancelled'
    | 'deadlocked'
    | 'budget-exceeded';
  logicalTime: number;
  turns: number;
  pendingTaskIds: readonly string[];
  pendingBarrierIds: readonly string[];
  events: readonly DeterministicSchedulerEvent[];
  droppedEventCount: number;
}>;

export type DeterministicObservationSource<Value> = Readonly<{
  read(): Value;
  subscribe(listener: () => void): () => void;
}>;

export type DeterministicConditionWaitResult<Value> =
  | Readonly<{
      status: 'satisfied';
      value: Value;
      logicalTime: number;
      cause: 'initial-state' | 'notification' | 'scheduled-task';
    }>
  | Readonly<{
      status:
        'timed-out' | 'cancelled' | 'deadlocked' | 'paused' | 'budget-exceeded';
      value: Value;
      logicalTime: number;
      reason?: string;
    }>;

export type DeterministicScheduler = Readonly<{
  enqueue(task: DeterministicSchedulerTask): number;
  createBarrier(barrierId: string, participantIds: readonly string[]): void;
  arrive(barrierId: string, participantId: string): boolean;
  runNext(): Promise<
    | Readonly<{ status: 'completed'; taskId: string }>
    | Readonly<{
        status: 'idle' | 'paused' | 'cancelled' | 'budget-exceeded';
      }>
  >;
  runUntilIdle(): Promise<DeterministicSchedulerSnapshot>;
  waitForCondition<Value>(
    input: Readonly<{
      conditionId: string;
      source: DeterministicObservationSource<Value>;
      matches(value: Value): boolean;
      deadline: number;
    }>
  ): Promise<DeterministicConditionWaitResult<Value>>;
  pause(): boolean;
  resume(): boolean;
  cancel(reason?: string): void;
  snapshot(): DeterministicSchedulerSnapshot;
}>;

export type CreateDeterministicSchedulerInput = Readonly<{
  initialTime?: number;
  maximumTurns: number;
  maximumTasks?: number;
  maximumEvents?: number;
  clock?: DeterministicSchedulerClockPort;
}>;

export type DeterministicSchedulerClockPort = Readonly<{
  now(): number;
  advanceTo(logicalTime: number): void | number;
}>;

type PendingTask = DeterministicSchedulerTask &
  Readonly<{
    sequence: number;
  }>;

type BarrierState = {
  readonly participants: Set<string>;
  readonly arrived: Set<string>;
};

const canonicalIdentity = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 512 || normalized.includes('\u0000')) {
    throw new TypeError(`${label} must be a bounded canonical identity.`);
  }
  return normalized;
};

const freezeEvents = (
  events: readonly DeterministicSchedulerEvent[]
): readonly DeterministicSchedulerEvent[] => Object.freeze([...events]);

const positiveSafeInteger = (value: number, label: string): number => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive safe integer.`);
  }
  return value;
};

/**
 * Controls declared runtime work only. Browser engine internals remain outside
 * this scheduler and must be represented by an explicit completion task.
 */
export const createDeterministicScheduler = (
  input: CreateDeterministicSchedulerInput
): DeterministicScheduler => {
  if (
    input.initialTime !== undefined &&
    (!Number.isSafeInteger(input.initialTime) || input.initialTime < 0)
  ) {
    throw new TypeError(
      'Deterministic scheduler initial time must be a non-negative safe integer.'
    );
  }
  const maximumTurns = positiveSafeInteger(
    input.maximumTurns,
    'Deterministic scheduler turn budget'
  );
  const maximumTasks = positiveSafeInteger(
    input.maximumTasks ?? maximumTurns * 4,
    'Deterministic scheduler task budget'
  );
  const maximumEvents = positiveSafeInteger(
    input.maximumEvents ?? maximumTurns * 8,
    'Deterministic scheduler event budget'
  );
  const readClockTime = (): number => {
    const value = input.clock?.now() ?? input.initialTime ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new TypeError(
        'Deterministic scheduler clock must return a non-negative safe integer.'
      );
    }
    return value;
  };
  const initialClockTime = readClockTime();
  if (
    input.clock &&
    input.initialTime !== undefined &&
    input.initialTime !== initialClockTime
  ) {
    throw new TypeError(
      'Deterministic scheduler initial time must match its injected clock.'
    );
  }
  const tasks = new Map<string, PendingTask>();
  const barriers = new Map<string, BarrierState>();
  const events: DeterministicSchedulerEvent[] = [];
  let droppedEventCount = 0;
  let eventSequence = 0;
  let taskSequence = 0;
  let logicalTime = initialClockTime;
  let turns = 0;
  let status: DeterministicSchedulerSnapshot['status'] = 'idle';
  let cancellationReason: string | undefined;

  const synchronizeLogicalTime = (): number => {
    if (!input.clock) return logicalTime;
    const current = readClockTime();
    if (current < logicalTime) {
      throw new Error('Deterministic scheduler clock moved backwards.');
    }
    logicalTime = current;
    return logicalTime;
  };

  const advanceLogicalTime = (target: number): number => {
    synchronizeLogicalTime();
    if (!Number.isSafeInteger(target) || target < logicalTime) {
      throw new TypeError(
        'Deterministic scheduler cannot advance to a past or unsafe time.'
      );
    }
    if (target === logicalTime) return logicalTime;
    if (!input.clock) {
      logicalTime = target;
      return logicalTime;
    }
    input.clock.advanceTo(target);
    const applied = readClockTime();
    if (applied !== target) {
      throw new Error(
        'Deterministic scheduler clock did not apply the requested logical time.'
      );
    }
    logicalTime = applied;
    return logicalTime;
  };

  const append = (
    event: Omit<DeterministicSchedulerEvent, 'sequence' | 'logicalTime'>
  ): void => {
    synchronizeLogicalTime();
    eventSequence += 1;
    events.push(
      Object.freeze({
        sequence: eventSequence,
        logicalTime,
        ...event,
      })
    );
    if (events.length > maximumEvents) {
      events.shift();
      droppedEventCount += 1;
    }
  };

  const orderedTasks = (): readonly PendingTask[] =>
    [...tasks.values()].sort(
      (left, right) =>
        left.readyAt - right.readyAt ||
        compareUnicodeCodePoints(left.lane, right.lane) ||
        left.sequence - right.sequence
    );

  const snapshot = (): DeterministicSchedulerSnapshot => {
    synchronizeLogicalTime();
    return Object.freeze({
      status,
      logicalTime,
      turns,
      pendingTaskIds: Object.freeze(orderedTasks().map(({ id }) => id)),
      pendingBarrierIds: Object.freeze(
        [...barriers.keys()].sort(compareUnicodeCodePoints)
      ),
      events: freezeEvents(events),
      droppedEventCount,
    });
  };

  const scheduler: DeterministicScheduler = Object.freeze({
    enqueue(task) {
      synchronizeLogicalTime();
      const id = canonicalIdentity(task.id, 'Scheduler task id');
      const lane = canonicalIdentity(task.lane, 'Scheduler lane');
      if (
        !Number.isSafeInteger(task.readyAt) ||
        task.readyAt < logicalTime ||
        tasks.has(id)
      ) {
        throw new TypeError(
          'Scheduler tasks require a unique identity and a non-past logical ready time.'
        );
      }
      if (tasks.size >= maximumTasks) {
        status = 'budget-exceeded';
        append({
          kind: 'task-flood',
          taskId: id,
          lane,
          detail: 'maximum-tasks',
        });
        throw new Error('Deterministic scheduler task budget exceeded.');
      }
      taskSequence += 1;
      tasks.set(
        id,
        Object.freeze({
          id,
          lane,
          readyAt: task.readyAt,
          run: task.run,
          sequence: taskSequence,
        })
      );
      append({ kind: 'task-enqueued', taskId: id, lane });
      if (status === 'idle') status = 'running';
      return taskSequence;
    },
    createBarrier(barrierId, participantIds) {
      const id = canonicalIdentity(barrierId, 'Scheduler barrier id');
      const participants = participantIds.map((participantId) =>
        canonicalIdentity(participantId, 'Scheduler barrier participant')
      );
      if (
        participants.length === 0 ||
        new Set(participants).size !== participants.length ||
        barriers.has(id)
      ) {
        throw new TypeError(
          'Scheduler barriers require unique identities and participants.'
        );
      }
      barriers.set(id, {
        participants: new Set(participants),
        arrived: new Set(),
      });
      append({ kind: 'barrier-created', barrierId: id });
    },
    arrive(barrierId, participantId) {
      const id = canonicalIdentity(barrierId, 'Scheduler barrier id');
      const participant = canonicalIdentity(
        participantId,
        'Scheduler barrier participant'
      );
      const barrier = barriers.get(id);
      if (!barrier || !barrier.participants.has(participant)) {
        throw new TypeError(
          'Scheduler barrier arrival must name one declared participant.'
        );
      }
      if (!barrier.arrived.has(participant)) {
        barrier.arrived.add(participant);
        append({
          kind: 'barrier-arrived',
          barrierId: id,
          detail: participant,
        });
      }
      if (barrier.arrived.size !== barrier.participants.size) return false;
      barriers.delete(id);
      append({ kind: 'barrier-released', barrierId: id });
      return true;
    },
    async runNext() {
      synchronizeLogicalTime();
      if (status === 'paused') return Object.freeze({ status: 'paused' });
      if (status === 'cancelled') {
        return Object.freeze({ status: 'cancelled' });
      }
      if (status === 'budget-exceeded') {
        return Object.freeze({ status: 'budget-exceeded' });
      }
      const task = orderedTasks()[0];
      if (!task) {
        status = barriers.size ? 'deadlocked' : 'idle';
        if (barriers.size) append({ kind: 'deadlock' });
        return Object.freeze({ status: 'idle' });
      }
      if (turns >= maximumTurns) {
        status = 'budget-exceeded';
        append({ kind: 'task-flood', detail: 'maximum-turns' });
        return Object.freeze({ status: 'budget-exceeded' });
      }
      status = 'running';
      tasks.delete(task.id);
      advanceLogicalTime(Math.max(task.readyAt, logicalTime));
      turns += 1;
      append({
        kind: 'task-started',
        taskId: task.id,
        lane: task.lane,
      });
      const result = await task.run();
      synchronizeLogicalTime();
      if (result?.status === 'cancelled') {
        append({
          kind: 'task-cancelled',
          taskId: task.id,
          lane: task.lane,
          ...(result.reason ? { detail: result.reason } : {}),
        });
      } else {
        append({
          kind: 'task-completed',
          taskId: task.id,
          lane: task.lane,
        });
      }
      if (!tasks.size && !barriers.size) status = 'idle';
      return Object.freeze({ status: 'completed', taskId: task.id });
    },
    async runUntilIdle() {
      while (tasks.size && status !== 'cancelled') {
        const result = await scheduler.runNext();
        if (result.status !== 'completed') break;
      }
      if (!tasks.size && barriers.size && status !== 'cancelled') {
        status = 'deadlocked';
        append({ kind: 'deadlock' });
      }
      return snapshot();
    },
    async waitForCondition<Value>({
      conditionId,
      source,
      matches,
      deadline,
    }: Readonly<{
      conditionId: string;
      source: DeterministicObservationSource<Value>;
      matches(value: Value): boolean;
      deadline: number;
    }>): Promise<DeterministicConditionWaitResult<Value>> {
      synchronizeLogicalTime();
      const id = canonicalIdentity(conditionId, 'Wait condition id');
      if (!Number.isSafeInteger(deadline) || deadline < logicalTime) {
        throw new TypeError(
          'Wait deadlines must be safe logical times at or after now.'
        );
      }
      let notified = false;
      let active = true;
      const unsubscribe = source.subscribe(() => {
        if (active) notified = true;
      });
      try {
        let current = source.read();
        if (matches(current)) {
          append({ kind: 'wait-satisfied', conditionId: id });
          return Object.freeze({
            status: 'satisfied',
            value: current,
            logicalTime,
            cause: 'initial-state',
          });
        }
        while (logicalTime <= deadline) {
          if (status === 'cancelled') {
            return Object.freeze({
              status: 'cancelled',
              value: current,
              logicalTime,
              ...(cancellationReason ? { reason: cancellationReason } : {}),
            });
          }
          const next = orderedTasks()[0];
          if (!next || next.readyAt > deadline) {
            status = barriers.size ? 'deadlocked' : status;
            if (barriers.size) append({ kind: 'deadlock', conditionId: id });
            current = source.read();
            if (matches(current)) {
              append({ kind: 'wait-satisfied', conditionId: id });
              return Object.freeze({
                status: 'satisfied',
                value: current,
                logicalTime,
                cause: notified ? 'notification' : 'scheduled-task',
              });
            }
            if (barriers.size) {
              return Object.freeze({
                status: 'deadlocked',
                value: current,
                logicalTime,
              });
            }
            advanceLogicalTime(deadline);
            append({ kind: 'wait-timed-out', conditionId: id });
            return Object.freeze({
              status: 'timed-out',
              value: current,
              logicalTime,
            });
          }
          const result = await scheduler.runNext();
          if (result.status !== 'completed') {
            current = source.read();
            return Object.freeze({
              status:
                result.status === 'cancelled'
                  ? 'cancelled'
                  : result.status === 'paused'
                    ? 'paused'
                    : result.status === 'budget-exceeded'
                      ? 'budget-exceeded'
                      : 'deadlocked',
              value: current,
              logicalTime,
              ...(cancellationReason ? { reason: cancellationReason } : {}),
            });
          }
          current = source.read();
          if (matches(current)) {
            append({ kind: 'wait-satisfied', conditionId: id });
            return Object.freeze({
              status: 'satisfied',
              value: current,
              logicalTime,
              cause: notified ? 'notification' : 'scheduled-task',
            });
          }
          notified = false;
        }
        current = source.read();
        append({ kind: 'wait-timed-out', conditionId: id });
        return Object.freeze({
          status: 'timed-out',
          value: current,
          logicalTime,
        });
      } finally {
        active = false;
        unsubscribe();
      }
    },
    pause() {
      if (status !== 'running' && status !== 'idle') return false;
      status = 'paused';
      append({ kind: 'paused' });
      return true;
    },
    resume() {
      if (status !== 'paused') return false;
      status = tasks.size ? 'running' : 'idle';
      append({ kind: 'resumed' });
      return true;
    },
    cancel(reason) {
      if (status === 'cancelled') return;
      cancellationReason = reason;
      status = 'cancelled';
      tasks.clear();
      barriers.clear();
      append({
        kind: 'cancelled',
        ...(reason ? { detail: reason } : {}),
      });
    },
    snapshot,
  });
  return scheduler;
};

export type DeterministicAttemptFence = Readonly<{
  generation: number;
  isCurrent(generation: number): boolean;
  next(): number;
  cancel(): number;
}>;

/** Fences stale async completions without exposing AbortController instances. */
export const createDeterministicAttemptFence = (
  initialGeneration = 1
): DeterministicAttemptFence => {
  if (!Number.isSafeInteger(initialGeneration) || initialGeneration < 1) {
    throw new TypeError('Attempt fence generation must be a positive integer.');
  }
  let generation = initialGeneration;
  return Object.freeze({
    get generation() {
      return generation;
    },
    isCurrent(candidate) {
      return candidate === generation;
    },
    next() {
      generation += 1;
      return generation;
    },
    cancel() {
      generation += 1;
      return generation;
    },
  });
};
