import type { AgentTaskRecord } from '../control/agentControl.types';
import { isAgentTaskRecord } from '../control/agentTask';
import {
  decodeAgentTaskAdmission,
  decodeAgentTaskAdmissionChallenge,
  type AgentTaskAdmissionResult,
} from './agentTaskAdmission';

export type AgentTaskAdmissionTransport = Readonly<{
  create: (signal: AbortSignal) => Promise<unknown>;
  load: (admissionId: string, signal: AbortSignal) => Promise<unknown>;
}>;

const aborted = (signal: AbortSignal): unknown =>
  signal.reason ??
  new DOMException('Agent Task admission was cancelled.', 'AbortError');
const waitFor = <T>(operation: Promise<T>, signal: AbortSignal): Promise<T> =>
  new Promise((resolve, reject) => {
    const cancel = () => {
      signal.removeEventListener('abort', cancel);
      reject(aborted(signal));
    };
    if (signal.aborted) {
      void operation.catch(() => undefined);
      reject(aborted(signal));
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener('abort', cancel);
        if (signal.aborted) reject(aborted(signal));
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', cancel);
        reject(signal.aborted ? aborted(signal) : error);
      }
    );
  });

const pause = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(aborted(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve();
    }, milliseconds);
    if (signal.aborted) {
      cancel();
      return;
    }
    signal.addEventListener('abort', cancel, { once: true });
  });

/** A bounded, cancellable admission journey shared by browser and CLI transport adapters. */
export const resolveAgentTaskAdmission = async (
  input: Readonly<{
    requestedTask: AgentTaskRecord;
    transport: AgentTaskAdmissionTransport;
    signal?: AbortSignal;
    maximumElapsedMs?: number;
    pollIntervalMs?: number;
  }>
): Promise<AgentTaskAdmissionResult> => {
  if (!isAgentTaskRecord(input.requestedTask))
    throw new TypeError('Expected one strict immutable Task for admission.');
  const maximumElapsedMs = input.maximumElapsedMs ?? 60_000;
  const pollIntervalMs = input.pollIntervalMs ?? 250;
  if (
    !Number.isSafeInteger(maximumElapsedMs) ||
    maximumElapsedMs < 1 ||
    maximumElapsedMs > 300_000 ||
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs < 1 ||
    pollIntervalMs > 5_000
  )
    throw new TypeError('Admission polling bounds are invalid.');
  const controller = new AbortController();
  const cancel = () =>
    controller.abort(
      input.signal?.reason ??
        new DOMException('Agent Task admission was cancelled.', 'AbortError')
    );
  input.signal?.addEventListener('abort', cancel, { once: true });
  if (input.signal?.aborted) cancel();
  const deadline = setTimeout(
    () =>
      controller.abort(
        new Error(
          'Agent Task admission timed out. Retry after checking the configured runtime worker.'
        )
      ),
    maximumElapsedMs
  );
  try {
    controller.signal.throwIfAborted();
    const challenge = decodeAgentTaskAdmissionChallenge(
      await waitFor(
        input.transport.create(controller.signal),
        controller.signal
      )
    );
    if (!challenge.ok)
      throw new TypeError(
        'Agent Task admission challenge failed strict validation.'
      );
    while (true) {
      controller.signal.throwIfAborted();
      const state = decodeAgentTaskAdmission(
        await waitFor(
          input.transport.load(challenge.value.admissionId, controller.signal),
          controller.signal
        ),
        { requestedTask: input.requestedTask }
      );
      if (!state.ok)
        throw new TypeError(
          'Agent Task admission response failed strict validation.'
        );
      if (
        state.value.admissionId !== challenge.value.admissionId ||
        state.value.challengeDigest !== challenge.value.challengeDigest
      )
        throw new TypeError('Agent Task admission challenge identity changed.');
      if (state.value.status === 'blocked')
        throw new Error(
          `Agent Task admission was blocked (${state.value.diagnosticCodes.join(', ')}). Check the current policy, configured runtime qualification and grant, then retry.`
        );
      if (state.value.status === 'admitted' && 'task' in state.value)
        return state.value;
      await pause(pollIntervalMs, controller.signal);
    }
  } finally {
    clearTimeout(deadline);
    input.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
};
