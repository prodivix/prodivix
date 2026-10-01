import { describe, expect, it, vi } from 'vitest';
import { runAgentRuntimeDaemon } from '#src/daemon.js';

describe('ordinary runtime admission fairness and shutdown', () => {
  it('handles new admission challenges while a single long Task holds the execution lane', async () => {
    const controller = new AbortController();
    let active = 0;
    let maximum = 0;
    let challenges = 0;
    let taskSettled = false;
    const poll = vi.fn(
      async (
        signal?: AbortSignal,
        _options?: { includeAdmissions?: boolean }
      ) => {
        maximum = Math.max(maximum, ++active);
        try {
          await new Promise<void>((resolve) =>
            signal!.addEventListener('abort', () => resolve(), { once: true })
          );
        } finally {
          active--;
          taskSettled = true;
        }
        return [];
      }
    );
    const pollAdmissions = vi.fn(async () => {
      challenges++;
      if (challenges === 3) controller.abort();
    });
    await runAgentRuntimeDaemon({
      consumer: { poll, pollAdmissions },
      intervalMs: 20,
      signal: controller.signal,
    });
    expect(challenges).toBe(3);
    expect(maximum).toBe(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(taskSettled).toBe(true);
    expect(active).toBe(0);
    expect(poll.mock.calls[0]![1]).toEqual({ includeAdmissions: false });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(pollAdmissions).toHaveBeenCalledTimes(3);
  });
  it('awaits pending requests on shutdown and preserves one-cycle admission behavior for --once', async () => {
    const controller = new AbortController();
    let taskSettled = false;
    let admissionSettled = false;
    const wait = (signal: AbortSignal) =>
      new Promise<void>((resolve) =>
        signal.addEventListener('abort', () => setTimeout(resolve, 10), {
          once: true,
        })
      );
    const poll = vi.fn(async (signal?: AbortSignal) => {
      await wait(signal!);
      taskSettled = true;
      return [];
    });
    const pollAdmissions = vi.fn(async (signal?: AbortSignal) => {
      await wait(signal!);
      admissionSettled = true;
    });
    const running = runAgentRuntimeDaemon({
      consumer: { poll, pollAdmissions },
      intervalMs: 100,
      signal: controller.signal,
    });
    controller.abort();
    await running;
    expect(taskSettled && admissionSettled).toBe(true);
    const oncePoll = vi.fn(async () => []);
    const onceAdmissions = vi.fn(async () => {});
    await runAgentRuntimeDaemon({
      consumer: { poll: oncePoll, pollAdmissions: onceAdmissions },
      intervalMs: 100,
      signal: new AbortController().signal,
      once: true,
    });
    expect(oncePoll).toHaveBeenCalledTimes(1);
    expect(onceAdmissions).not.toHaveBeenCalled();
  });
});
