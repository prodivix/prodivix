import { utf8ToBytes } from '@noble/hashes/utils.js';
import { redactExecutionConsoleText } from './executionConsole';
import {
  EXECUTION_TERMINAL_LIMITS,
  createFingerprintSalt,
  createInputFingerprint,
  freezeSnapshot,
  normalizeClientSequence,
  normalizeCursor,
  normalizeIdentifier,
  normalizePositiveLimit,
  normalizeSize,
  normalizeTimestamp,
  terminalCloseReasons,
  terminalSignals,
  truncateUtf8,
  type CreateExecutionTerminalControllerInput,
  type ExecutionTerminalCloseReason,
  type ExecutionTerminalController,
  type ExecutionTerminalListener,
  type ExecutionTerminalOutputRecord,
  type ExecutionTerminalSession,
  type ExecutionTerminalSnapshot,
  type InputFingerprint,
} from './executionTerminal';
import { normalizeExecutionTerminalControllerConfiguration } from './executionTerminalControllerSupport';

/**
 * Creates the shared in-process Terminal state machine used by concrete PTY
 * adapters. Raw stdin is forwarded once and never retained; only a salted,
 * bounded fingerprint tail remains for reconnect-safe idempotency checks.
 */
export const createExecutionTerminalController = (
  input: CreateExecutionTerminalControllerInput
): ExecutionTerminalController => {
  const {
    terminalSessionId,
    executionId,
    jobId,
    maximumOutputRecords,
    maximumRetainedOutputBytes,
    maximumInputFingerprints,
    maximumOutputChunkBytes,
    initialSize,
  } = normalizeExecutionTerminalControllerConfiguration(input);
  let lastTimestamp = Number.NEGATIVE_INFINITY;
  const readTimestamp = (): number => {
    const current = normalizeTimestamp(
      (input.now ?? Date.now)(),
      'Execution terminal clock'
    );
    lastTimestamp = Math.max(lastTimestamp, current);
    return lastTimestamp;
  };
  const openedAt = readTimestamp();
  const leaseExpiresAt = normalizeTimestamp(
    input.grant.expiresAt,
    'Execution terminal grant expiry'
  );
  if (leaseExpiresAt <= openedAt)
    throw new TypeError('Execution terminal grant must be unexpired.');

  const retainedOutputs: ExecutionTerminalOutputRecord[] = [];
  const inputFingerprints = new Map<number, InputFingerprint>();
  const subscribers = new Set<ExecutionTerminalListener>();
  const fingerprintSalt = createFingerprintSalt();
  let operationTail: Promise<void> = Promise.resolve();
  let forcedCloseRequested = false;
  let outputCursor = 0;
  let retainedOutputBytes = 0;
  let droppedOutputRecords = 0;
  let droppedOutputBytes = 0;
  let snapshot = freezeSnapshot({
    terminalSessionId,
    executionId,
    jobId,
    providerId: input.provider.id,
    providerVersion: input.provider.version,
    capability: input.capability,
    status: 'open',
    revision: 1,
    size: initialSize,
    openedAt,
    updatedAt: openedAt,
    leaseExpiresAt,
    latestOutputCursor: 0,
    earliestRetainedOutputCursor: 0,
    retainedOutputBytes: 0,
    droppedOutputRecords: 0,
    droppedOutputBytes: 0,
    latestClientSequence: 0,
  });

  const reportSubscriberError = (error: unknown): void => {
    try {
      input.onSubscriberError?.(error);
    } catch {
      // Subscriber reporting is observational and cannot alter the session.
    }
  };

  const publish = (output?: ExecutionTerminalOutputRecord): void => {
    subscribers.forEach((listener) => {
      try {
        listener(snapshot, output);
      } catch (error) {
        reportSubscriberError(error);
      }
    });
  };

  const replaceSnapshot = (
    update: Omit<
      Partial<ExecutionTerminalSnapshot>,
      | 'terminalSessionId'
      | 'executionId'
      | 'jobId'
      | 'providerId'
      | 'providerVersion'
      | 'capability'
      | 'openedAt'
      | 'leaseExpiresAt'
    >,
    output?: ExecutionTerminalOutputRecord
  ): ExecutionTerminalSnapshot => {
    snapshot = freezeSnapshot({
      ...snapshot,
      ...update,
      revision: snapshot.revision + 1,
    });
    publish(output);
    return snapshot;
  };

  const closeFromProvider = (
    reason: ExecutionTerminalCloseReason = 'provider-closed',
    exitCode?: number
  ): ExecutionTerminalSnapshot => {
    if (snapshot.status === 'closed') return snapshot;
    if (!terminalCloseReasons.has(reason))
      throw new TypeError('Execution terminal close reason is invalid.');
    if (exitCode !== undefined && !Number.isSafeInteger(exitCode))
      throw new TypeError(
        'Execution terminal exitCode must be a safe integer.'
      );
    const closedAt = readTimestamp();
    return replaceSnapshot({
      status: 'closed',
      updatedAt: closedAt,
      closedAt,
      closeReason: reason,
      ...(exitCode === undefined ? {} : { exitCode }),
    });
  };

  const requestForcedClose = (reason: ExecutionTerminalCloseReason): void => {
    if (forcedCloseRequested) return;
    forcedCloseRequested = true;
    void Promise.resolve(input.requestClose(reason)).catch(() => undefined);
  };

  const expireLease = (): boolean => {
    if (snapshot.status === 'closed') return true;
    if (readTimestamp() < leaseExpiresAt) return false;
    closeFromProvider('lease-expired');
    requestForcedClose('lease-expired');
    return true;
  };

  const enqueue = <Result>(
    operation: () => Promise<Result>
  ): Promise<Result> => {
    const pending = operationTail.then(operation, operation);
    operationTail = pending.then(
      () => undefined,
      () => undefined
    );
    return pending;
  };

  const session: ExecutionTerminalSession = Object.freeze({
    id: terminalSessionId,
    executionId,
    jobId,
    provider: input.provider,
    getSnapshot: () => {
      expireLease();
      return snapshot;
    },
    read: ({ afterCursor, maximumRecords }) => {
      expireLease();
      const normalizedAfterCursor = normalizeCursor(
        afterCursor,
        'Execution terminal afterCursor'
      );
      if (normalizedAfterCursor > outputCursor)
        throw new RangeError(
          'Execution terminal afterCursor is ahead of the latest cursor.'
        );
      const recordLimit = normalizePositiveLimit(
        maximumRecords,
        EXECUTION_TERMINAL_LIMITS.maximumReadRecords,
        'Execution terminal read record limit',
        EXECUTION_TERMINAL_LIMITS.maximumReadRecords
      );
      const earliestAvailableCursor =
        retainedOutputs[0]?.cursor ?? outputCursor;
      const records = Object.freeze(
        retainedOutputs
          .filter((record) => record.cursor > normalizedAfterCursor)
          .slice(0, recordLimit)
      );
      const nextCursor = records.at(-1)?.cursor ?? normalizedAfterCursor;
      return Object.freeze({
        terminalSessionId,
        executionId,
        jobId,
        status: snapshot.status,
        afterCursor: normalizedAfterCursor,
        nextCursor,
        latestCursor: outputCursor,
        earliestAvailableCursor,
        gap:
          droppedOutputRecords > 0 &&
          normalizedAfterCursor < earliestAvailableCursor - 1,
        hasMore: nextCursor < outputCursor,
        records,
      });
    },
    write: ({ data, clientSequence }) => {
      if (typeof data !== 'string')
        throw new TypeError('Execution terminal input must be a string.');
      if (
        utf8ToBytes(data).byteLength >
        EXECUTION_TERMINAL_LIMITS.maximumInputBytes
      )
        throw new TypeError(
          'Execution terminal input exceeds its byte budget.'
        );
      const sequence = normalizeClientSequence(clientSequence);
      const digest = createInputFingerprint(fingerprintSalt, sequence, data);
      return enqueue(async () => {
        if (expireLease() || snapshot.status !== 'open')
          return Object.freeze({
            status: 'closed',
            clientSequence: sequence,
          });
        const expectedClientSequence = snapshot.latestClientSequence + 1;
        if (sequence < expectedClientSequence) {
          const retained = inputFingerprints.get(sequence);
          if (!retained)
            return Object.freeze({
              status: 'stale',
              clientSequence: sequence,
            });
          return Object.freeze({
            status: retained.digest === digest ? 'duplicate' : 'conflict',
            clientSequence: sequence,
          });
        }
        if (sequence > expectedClientSequence)
          return Object.freeze({
            status: 'out-of-order',
            clientSequence: sequence,
            expectedClientSequence,
          });
        try {
          await input.requestInput(
            Object.freeze({ data, clientSequence: sequence })
          );
        } catch {
          return Object.freeze({
            status: 'rejected',
            clientSequence: sequence,
          });
        }
        inputFingerprints.set(
          sequence,
          Object.freeze({ clientSequence: sequence, digest })
        );
        while (inputFingerprints.size > maximumInputFingerprints) {
          const oldest = inputFingerprints.keys().next().value;
          if (oldest === undefined) break;
          inputFingerprints.delete(oldest);
        }
        const updatedAt = readTimestamp();
        replaceSnapshot({
          latestClientSequence: sequence,
          updatedAt,
        });
        return Object.freeze({
          status: 'accepted',
          clientSequence: sequence,
        });
      });
    },
    resize: (size) => {
      const normalizedSize = normalizeSize(size);
      return enqueue(async () => {
        if (expireLease() || snapshot.status !== 'open')
          return Object.freeze({ status: 'closed', size: snapshot.size });
        if (
          snapshot.size.columns === normalizedSize.columns &&
          snapshot.size.rows === normalizedSize.rows
        )
          return Object.freeze({ status: 'unchanged', size: snapshot.size });
        try {
          await input.requestResize(normalizedSize);
        } catch {
          return Object.freeze({ status: 'rejected', size: snapshot.size });
        }
        const updatedAt = readTimestamp();
        replaceSnapshot({ size: normalizedSize, updatedAt });
        return Object.freeze({ status: 'accepted', size: snapshot.size });
      });
    },
    signal: (signal) => {
      if (!terminalSignals.has(signal))
        throw new TypeError('Execution terminal signal is invalid.');
      return enqueue(async () => {
        if (expireLease() || snapshot.status !== 'open')
          return Object.freeze({ status: 'closed', signal });
        try {
          await input.requestSignal(signal);
          return Object.freeze({ status: 'accepted', signal });
        } catch {
          return Object.freeze({ status: 'rejected', signal });
        }
      });
    },
    close: () =>
      enqueue(async () => {
        if (expireLease() || snapshot.status === 'closed')
          return Object.freeze({ status: 'already-closed' });
        const closingAt = readTimestamp();
        replaceSnapshot({ status: 'closing', updatedAt: closingAt });
        try {
          await input.requestClose('client-closed');
        } catch {
          if (snapshot.status === 'closing') {
            const reopenedAt = readTimestamp();
            replaceSnapshot({ status: 'open', updatedAt: reopenedAt });
          }
          return Object.freeze({ status: 'rejected' });
        }
        closeFromProvider('client-closed');
        return Object.freeze({ status: 'closed' });
      }),
    subscribe: (listener) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
  });

  return Object.freeze({
    session,
    renewGrant: (grant) => {
      if (
        normalizeIdentifier(
          grant.executionId,
          'Execution terminal grant execution id'
        ) !== executionId ||
        normalizeIdentifier(grant.jobId, 'Execution terminal grant job id') !==
          jobId ||
        normalizeIdentifier(
          grant.providerId,
          'Execution terminal grant provider id'
        ) !== input.provider.id
      )
        throw new TypeError(
          'Execution terminal renewed grant does not match the execution/provider fence.'
        );
      normalizeIdentifier(grant.grantId, 'Execution terminal grant id');
      const expiresAt = normalizeTimestamp(
        grant.expiresAt,
        'Execution terminal renewed grant expiry'
      );
      if (snapshot.status === 'closed') return snapshot;
      const renewedAt = readTimestamp();
      if (expiresAt <= renewedAt)
        throw new TypeError(
          'Execution terminal renewed grant must be unexpired.'
        );
      if (expiresAt < snapshot.leaseExpiresAt)
        throw new TypeError(
          'Execution terminal renewed grant must not shorten the active lease.'
        );
      if (expiresAt === snapshot.leaseExpiresAt) return snapshot;
      snapshot = freezeSnapshot({
        ...snapshot,
        leaseExpiresAt: expiresAt,
        revision: snapshot.revision + 1,
        updatedAt: renewedAt,
      });
      publish();
      return snapshot;
    },
    emitOutput: (output) => {
      if (expireLease() || snapshot.status === 'closed') return undefined;
      if (output.stream !== 'stdout' && output.stream !== 'stderr')
        throw new TypeError('Execution terminal output stream is invalid.');
      if (typeof output.data !== 'string' || !output.data)
        throw new TypeError(
          'Execution terminal output must be a non-empty string.'
        );
      const inspection = input.secretLeakGuard?.inspectText(
        'terminal',
        output.data
      );
      const canaryRedacted = inspection?.safe === false;
      const credentialRedaction = redactExecutionConsoleText(
        canaryRedacted ? '[REDACTED]' : output.data
      );
      const bounded = truncateUtf8(
        credentialRedaction.value,
        maximumOutputChunkBytes
      );
      const emittedAt = readTimestamp();
      outputCursor += 1;
      const record: ExecutionTerminalOutputRecord = Object.freeze({
        terminalSessionId,
        executionId,
        jobId,
        cursor: outputCursor,
        emittedAt,
        stream: output.stream,
        data: bounded.value,
        byteLength: utf8ToBytes(bounded.value).byteLength,
        redacted:
          Boolean(output.redacted) ||
          canaryRedacted ||
          credentialRedaction.redacted,
        truncated: Boolean(output.truncated) || bounded.truncated,
      });
      retainedOutputs.push(record);
      retainedOutputBytes += record.byteLength;
      while (
        retainedOutputs.length > maximumOutputRecords ||
        retainedOutputBytes > maximumRetainedOutputBytes
      ) {
        const removed = retainedOutputs.shift();
        if (!removed) break;
        retainedOutputBytes -= removed.byteLength;
        droppedOutputRecords += 1;
        droppedOutputBytes += removed.byteLength;
      }
      replaceSnapshot(
        {
          latestOutputCursor: outputCursor,
          earliestRetainedOutputCursor:
            retainedOutputs[0]?.cursor ?? outputCursor,
          retainedOutputBytes,
          droppedOutputRecords,
          droppedOutputBytes,
          updatedAt: emittedAt,
        },
        record
      );
      return record;
    },
    close: closeFromProvider,
  });
};
