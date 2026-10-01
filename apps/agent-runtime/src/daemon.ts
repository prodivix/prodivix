import { setTimeout as delay } from 'node:timers/promises';
import type { AgentRuntimeConsumer } from '#src/consumer.js';

/** Admission has its own bounded lane; provider execution stays serial in the Task lane. */
export const runAgentRuntimeDaemon = async (input: {
  consumer: Pick<AgentRuntimeConsumer, 'poll' | 'pollAdmissions'>;
  intervalMs: number;
  signal: AbortSignal;
  once?: boolean;
  onResults?: (
    results: Awaited<ReturnType<AgentRuntimeConsumer['poll']>>
  ) => void;
  onPollingFailure?: () => void;
}): Promise<void> => {
  if (input.once) {
    const results = await input.consumer.poll(input.signal);
    input.onResults?.(results);
    return;
  }
  const loop = async (callback: () => Promise<void>) => {
    while (!input.signal.aborted) {
      try {
        await callback();
      } catch {
        if (!input.signal.aborted) input.onPollingFailure?.();
      }
      if (!input.signal.aborted)
        await delay(input.intervalMs, undefined, {
          signal: input.signal,
        }).catch(() => {});
    }
  };
  await Promise.all([
    loop(async () => {
      const results = await input.consumer.poll(input.signal, {
        includeAdmissions: false,
      });
      input.onResults?.(results);
    }),
    loop(() => input.consumer.pollAdmissions(input.signal)),
  ]);
};
