import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createRootlessPodmanLifecycleTimeout,
  resolveRootlessPodmanExecutionTimeoutMs,
  resolveRootlessPodmanPreparationTimeoutMs,
  ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS,
  ROOTLESS_PODMAN_MAXIMUM_PREPARATION_TIMEOUT_MS,
  type RootlessPodmanTimeoutPhase,
} from './rootlessPodmanLifecycleTimeout';

afterEach(() => {
  vi.useRealTimers();
});

describe('rootless Podman lifecycle timeout', () => {
  it('gives preparation and execution independent bounded deadlines', () => {
    vi.useFakeTimers();
    const expired: RootlessPodmanTimeoutPhase[] = [];
    const timeout = createRootlessPodmanLifecycleTimeout({
      preparationTimeoutMs: 30_000,
      executionTimeoutMs: 15_000,
      onTimeout: (phase) => expired.push(phase),
    });

    vi.advanceTimersByTime(29_999);
    expect(expired).toEqual([]);
    expect(timeout.enterExecutionPhase()).toBe(true);
    expect(timeout.activePhase()).toBe('execution');

    vi.advanceTimersByTime(14_999);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(expired).toEqual(['execution']);
    expect(timeout.activePhase()).toBeUndefined();
    expect(timeout.enterExecutionPhase()).toBe(false);
  });

  it('fails closed when preparation never reaches the isolation handoff', () => {
    vi.useFakeTimers();
    const expired: RootlessPodmanTimeoutPhase[] = [];
    const timeout = createRootlessPodmanLifecycleTimeout({
      preparationTimeoutMs: ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS,
      executionTimeoutMs: 15_000,
      onTimeout: (phase) => expired.push(phase),
    });

    vi.advanceTimersByTime(ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS);

    expect(expired).toEqual(['preparation']);
    expect(timeout.activePhase()).toBeUndefined();
  });

  it('rejects unbounded preparation budgets', () => {
    expect(resolveRootlessPodmanPreparationTimeoutMs()).toBe(
      ROOTLESS_PODMAN_DEFAULT_PREPARATION_TIMEOUT_MS
    );
    expect(() => resolveRootlessPodmanPreparationTimeoutMs(0)).toThrow(
      /positive safe integer/u
    );
    expect(() =>
      resolveRootlessPodmanPreparationTimeoutMs(
        ROOTLESS_PODMAN_MAXIMUM_PREPARATION_TIMEOUT_MS + 1
      )
    ).toThrow(/must not exceed/u);
    expect(() => resolveRootlessPodmanExecutionTimeoutMs(Number.NaN)).toThrow(
      /positive safe integer/u
    );
  });
});
