import { notifyWorkspaceOutboxChanged } from './workspaceOutboxSignals';

/**
 * How many times a confirmed commit re-queues because its local replica write
 * keeps failing. The server already owns the commit, so past this point the
 * replica cache is abandoned rather than re-sending a confirmed commit forever
 * behind the causal chain head.
 */
export const MAX_ACKNOWLEDGEMENT_PERSISTENCE_ATTEMPTS = 3;

type SettleAcknowledgedEntryInput<Result> = Readonly<{
  /** Names the confirmed payload in the abandonment warning. */
  label: string;
  attemptCount: number;
  workspaceId: string;
  writeReplica: (() => Promise<void>) | undefined;
  /** Re-queues the entry for another replica attempt. */
  persistFailure: (error: unknown) => Promise<Result>;
  /** Removes the entry once the server-owned commit needs no further work. */
  removeEntry: () => Promise<void>;
  resolve: () => Result;
}>;

/**
 * The one owner of acknowledgement settlement for both the operation and the
 * settings outbox: cache the confirmed snapshot, retry a bounded number of
 * times when the cache write fails, then abandon the cache and retire the
 * entry. Operation and settings entries must never diverge on this policy —
 * a confirmed commit that retries forever blocks every later commit behind it.
 */
export const settleAcknowledgedEntry = async <Result>(
  input: SettleAcknowledgedEntryInput<Result>
): Promise<Result> => {
  try {
    await input.writeReplica?.();
  } catch (error) {
    if (input.attemptCount < MAX_ACKNOWLEDGEMENT_PERSISTENCE_ATTEMPTS) {
      return input.persistFailure(error);
    }
    console.warn(
      `[workspace-replica] confirmed ${input.label} was not cached`,
      error
    );
  }
  await input.removeEntry();
  notifyWorkspaceOutboxChanged(input.workspaceId);
  return input.resolve();
};
