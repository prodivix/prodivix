import { describe, expect, it } from 'vitest';
import {
  createDeterministicAttemptFence,
  createDeterministicScheduler,
} from '../deterministicScheduler';

describe('deterministic scheduler', () => {
  it('runs same-time work by canonical lane and enqueue sequence', async () => {
    const order: string[] = [];
    const scheduler = createDeterministicScheduler({
      initialTime: 10,
      maximumTurns: 16,
    });
    scheduler.enqueue({
      id: 'task-z',
      lane: 'z-route',
      readyAt: 20,
      run: () => {
        order.push('z');
      },
    });
    scheduler.enqueue({
      id: 'task-a-1',
      lane: 'a-data',
      readyAt: 20,
      run: () => {
        order.push('a1');
      },
    });
    scheduler.enqueue({
      id: 'task-a-2',
      lane: 'a-data',
      readyAt: 20,
      run: () => {
        order.push('a2');
      },
    });

    const snapshot = await scheduler.runUntilIdle();

    expect(order).toEqual(['a1', 'a2', 'z']);
    expect(snapshot).toMatchObject({
      status: 'idle',
      logicalTime: 20,
      turns: 3,
    });
  });

  it('checks current observation before advancing and unsubscribes', async () => {
    const value = 'ready';
    let subscriptions = 0;
    let unsubscriptions = 0;
    const scheduler = createDeterministicScheduler({ maximumTurns: 4 });
    const result = await scheduler.waitForCondition({
      conditionId: 'route-ready',
      source: {
        read: () => value,
        subscribe: () => {
          subscriptions += 1;
          return () => {
            unsubscriptions += 1;
          };
        },
      },
      matches: (candidate) => candidate === 'ready',
      deadline: 100,
    });

    expect(result).toMatchObject({
      status: 'satisfied',
      cause: 'initial-state',
      logicalTime: 0,
    });
    expect({ subscriptions, unsubscriptions, value }).toEqual({
      subscriptions: 1,
      unsubscriptions: 1,
      value: 'ready',
    });
  });

  it('advances declared work for a typed wait without a wall-clock sleep', async () => {
    let value = 'loading';
    const listeners = new Set<() => void>();
    const scheduler = createDeterministicScheduler({ maximumTurns: 4 });
    scheduler.enqueue({
      id: 'data-completion',
      lane: 'data',
      readyAt: 30,
      run: () => {
        value = 'ready';
        listeners.forEach((listener) => listener());
      },
    });

    const result = await scheduler.waitForCondition({
      conditionId: 'data-ready',
      source: {
        read: () => value,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
      matches: (candidate) => candidate === 'ready',
      deadline: 50,
    });

    expect(result).toEqual({
      status: 'satisfied',
      value: 'ready',
      logicalTime: 30,
      cause: 'notification',
    });
    expect(listeners.size).toBe(0);
  });

  it('reports timeout and barrier deadlock with bounded state', async () => {
    const timeoutScheduler = createDeterministicScheduler({
      maximumTurns: 4,
    });
    const timedOut = await timeoutScheduler.waitForCondition({
      conditionId: 'missing-marker',
      source: {
        read: () => false,
        subscribe: () => () => undefined,
      },
      matches: Boolean,
      deadline: 25,
    });
    expect(timedOut).toMatchObject({
      status: 'timed-out',
      logicalTime: 25,
    });

    const deadlockScheduler = createDeterministicScheduler({
      maximumTurns: 4,
    });
    deadlockScheduler.createBarrier('join', ['left', 'right']);
    deadlockScheduler.arrive('join', 'left');
    const deadlocked = await deadlockScheduler.runUntilIdle();
    expect(deadlocked.status).toBe('deadlocked');
    expect(deadlocked.pendingBarrierIds).toEqual(['join']);
  });

  it('shares one monotonic logical time with an injected clock', async () => {
    let clockTime = 5;
    const scheduler = createDeterministicScheduler({
      maximumTurns: 4,
      clock: {
        now: () => clockTime,
        advanceTo(logicalTime) {
          clockTime = logicalTime;
        },
      },
    });
    scheduler.enqueue({
      id: 'clock-bound-task',
      lane: 'scenario',
      readyAt: 10,
      run: () => {
        expect(clockTime).toBe(10);
        clockTime = 12;
      },
    });

    await expect(scheduler.runNext()).resolves.toEqual({
      status: 'completed',
      taskId: 'clock-bound-task',
    });
    expect(scheduler.snapshot().logicalTime).toBe(12);

    const timedOut = await scheduler.waitForCondition({
      conditionId: 'clock-bound-timeout',
      source: {
        read: () => false,
        subscribe: () => () => undefined,
      },
      matches: Boolean,
      deadline: 15,
    });
    expect(timedOut).toMatchObject({ status: 'timed-out', logicalTime: 15 });
    expect(clockTime).toBe(15);

    expect(scheduler.pause()).toBe(true);
    scheduler.enqueue({
      id: 'paused-task',
      lane: 'scenario',
      readyAt: 15,
      run: () => undefined,
    });
    await expect(
      scheduler.waitForCondition({
        conditionId: 'paused-wait',
        source: {
          read: () => false,
          subscribe: () => () => undefined,
        },
        matches: Boolean,
        deadline: 20,
      })
    ).resolves.toMatchObject({ status: 'paused', logicalTime: 15 });
    expect(clockTime).toBe(15);
  });

  it('fences late completions after generation replacement', () => {
    const fence = createDeterministicAttemptFence(3);
    const invocationGeneration = fence.generation;
    expect(fence.isCurrent(invocationGeneration)).toBe(true);
    expect(fence.next()).toBe(4);
    expect(fence.isCurrent(invocationGeneration)).toBe(false);
    expect(fence.cancel()).toBe(5);
  });

  it('fails closed on unbounded task production', () => {
    const scheduler = createDeterministicScheduler({
      maximumTurns: 2,
      maximumTasks: 1,
    });
    scheduler.enqueue({
      id: 'first',
      lane: 'scenario',
      readyAt: 0,
      run: () => undefined,
    });
    expect(() =>
      scheduler.enqueue({
        id: 'second',
        lane: 'scenario',
        readyAt: 0,
        run: () => undefined,
      })
    ).toThrow('task budget exceeded');
    expect(scheduler.snapshot().status).toBe('budget-exceeded');
  });

  it.each([
    { maximumTurns: Number.NaN },
    { maximumTurns: 1, maximumTasks: Number.NaN },
    { maximumTurns: 1, maximumEvents: 0 },
    { maximumTurns: Number.MAX_SAFE_INTEGER },
  ])('rejects invalid or overflowing scheduler budgets', (input) => {
    expect(() => createDeterministicScheduler(input)).toThrow(
      'positive safe integer'
    );
  });
});
