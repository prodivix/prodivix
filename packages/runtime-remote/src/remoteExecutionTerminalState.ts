import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';

export const REMOTE_EXECUTION_TERMINAL_STATE_FORMAT =
  'prodivix.remote-terminal-state' as const;
export const REMOTE_EXECUTION_TERMINAL_STATE_VERSION = 1 as const;
export const REMOTE_EXECUTION_TERMINAL_STATE_LIMITS = Object.freeze({
  maximumPlaintextBytes: 2 * 1024 * 1024,
  maximumSealedBytes: 2 * 1024 * 1024 + 4 * 1024,
  maximumCompareAndSwapAttempts: 8,
  maximumSweepRecords: 100,
});

/** Opaque encrypted record. Store adapters never receive terminal plaintext. */
export type RemoteExecutionTerminalStateRecord = Readonly<{
  executionId: string;
  terminalSessionId: string;
  revision: number;
  expiresAt: number;
  sealedState: Uint8Array;
}>;

export type RemoteExecutionTerminalStateCreateResult =
  'created' | 'identity-conflict' | 'quota-exceeded';

export type RemoteExecutionTerminalStateStore = Readonly<{
  getByExecution(
    executionId: string
  ): Promise<RemoteExecutionTerminalStateRecord | undefined>;
  get(
    executionId: string,
    terminalSessionId: string
  ): Promise<RemoteExecutionTerminalStateRecord | undefined>;
  create(
    record: RemoteExecutionTerminalStateRecord,
    maximumRecords: number
  ): Promise<RemoteExecutionTerminalStateCreateResult>;
  compareAndSwap(
    expectedRevision: number,
    record: RemoteExecutionTerminalStateRecord
  ): Promise<boolean>;
  delete(
    executionId: string,
    terminalSessionId: string,
    expectedRevision: number
  ): Promise<boolean>;
  listExpired(
    expiresAtOrBefore: number,
    maximumRecords: number
  ): Promise<readonly RemoteExecutionTerminalStateRecord[]>;
}>;

export type RemoteExecutionTerminalStateCipher = Readonly<{
  seal(
    input: Readonly<{
      executionId: string;
      terminalSessionId: string;
      revision: number;
      expiresAt: number;
      plaintext: Uint8Array;
    }>
  ): Promise<Uint8Array>;
  open(
    input: Readonly<{
      executionId: string;
      terminalSessionId: string;
      revision: number;
      expiresAt: number;
      sealedState: Uint8Array;
    }>
  ): Promise<Uint8Array>;
}>;

/** Retryable dependency failure; distinct from authenticated-state drift. */
export class RemoteExecutionTerminalStateCipherUnavailableError extends Error {
  constructor() {
    super('Remote Terminal state cipher is temporarily unavailable.');
    this.name = 'RemoteExecutionTerminalStateCipherUnavailableError';
  }
}

const cloneRecord = (
  record: RemoteExecutionTerminalStateRecord
): RemoteExecutionTerminalStateRecord =>
  Object.freeze({
    ...record,
    sealedState: Uint8Array.from(record.sealedState),
  });

/** Deterministic shared store used to exercise multi-replica broker semantics. */
export const createMemoryRemoteExecutionTerminalStateStore =
  (): RemoteExecutionTerminalStateStore => {
    const byExecution = new Map<string, RemoteExecutionTerminalStateRecord>();
    const executionBySession = new Map<string, string>();
    return Object.freeze({
      async getByExecution(executionId) {
        const record = byExecution.get(executionId);
        return record ? cloneRecord(record) : undefined;
      },
      async get(executionId, terminalSessionId) {
        const record = byExecution.get(executionId);
        return record?.terminalSessionId === terminalSessionId
          ? cloneRecord(record)
          : undefined;
      },
      async create(record, maximumRecords) {
        if (
          byExecution.has(record.executionId) ||
          executionBySession.has(record.terminalSessionId)
        )
          return 'identity-conflict';
        if (byExecution.size >= maximumRecords) return 'quota-exceeded';
        const stored = cloneRecord(record);
        byExecution.set(record.executionId, stored);
        executionBySession.set(record.terminalSessionId, record.executionId);
        return 'created';
      },
      async compareAndSwap(expectedRevision, record) {
        const current = byExecution.get(record.executionId);
        if (
          !current ||
          current.terminalSessionId !== record.terminalSessionId ||
          current.revision !== expectedRevision ||
          record.revision !== expectedRevision + 1
        )
          return false;
        byExecution.set(record.executionId, cloneRecord(record));
        return true;
      },
      async delete(executionId, terminalSessionId, expectedRevision) {
        const current = byExecution.get(executionId);
        if (
          !current ||
          current.terminalSessionId !== terminalSessionId ||
          current.revision !== expectedRevision
        )
          return false;
        byExecution.delete(executionId);
        executionBySession.delete(terminalSessionId);
        return true;
      },
      async listExpired(expiresAtOrBefore, maximumRecords) {
        return Object.freeze(
          [...byExecution.values()]
            .filter((record) => record.expiresAt <= expiresAtOrBefore)
            .sort(
              (left, right) =>
                left.expiresAt - right.expiresAt ||
                compareUnicodeCodePoints(left.executionId, right.executionId)
            )
            .slice(0, maximumRecords)
            .map(cloneRecord)
        );
      },
    });
  };
