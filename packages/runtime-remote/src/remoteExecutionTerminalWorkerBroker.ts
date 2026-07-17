import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  EXECUTION_TERMINAL_LIMITS,
  type ExecutionTerminalCloseReason,
} from '@prodivix/runtime-core';
import {
  REMOTE_EXECUTION_TERMINAL_LIMITS,
  type RemoteExecutionTerminalBroker,
  type RemoteExecutionTerminalResolvedExecution,
} from './remoteExecutionTerminal.types';
import {
  createRemoteExecutionTerminalTokenDigest as tokenDigest,
  getRemoteExecutionTerminalCommandSize as commandSize,
  normalizeRemoteExecutionTerminalIdentifier as identifier,
  normalizeRemoteExecutionTerminalPositiveInteger as boundedPositiveInteger,
  RemoteExecutionTerminalBrokerError,
  type StoredRemoteExecutionTerminal,
} from './remoteExecutionTerminalBrokerSupport';

type WorkerBrokerOperations = Pick<
  RemoteExecutionTerminalBroker,
  'readWorkerCommands' | 'publishWorkerOutput' | 'closeFromWorker'
>;

export type CreateRemoteExecutionTerminalWorkerBrokerOptions = Readonly<{
  sessionByExecution: Map<string, string>;
  requireStored(
    executionId: string,
    terminalSessionId: string
  ): StoredRemoteExecutionTerminal;
  validateCurrentLease(
    stored: StoredRemoteExecutionTerminal
  ): Promise<RemoteExecutionTerminalResolvedExecution>;
  closeStored(
    stored: StoredRemoteExecutionTerminal,
    reason: ExecutionTerminalCloseReason,
    exitCode?: number
  ): void;
}>;

/** Owns the worker-facing half of the broker so client and worker trust paths stay separate. */
export const createRemoteExecutionTerminalWorkerBroker = (
  options: CreateRemoteExecutionTerminalWorkerBrokerOptions
): WorkerBrokerOperations =>
  Object.freeze({
    async readWorkerCommands(input) {
      const sessionId = options.sessionByExecution.get(input.executionId);
      if (!sessionId) return undefined;
      const stored = options.requireStored(input.executionId, sessionId);
      const resolved = await options.validateCurrentLease(stored);
      if (
        resolved.lease.workerId !== input.workerId ||
        resolved.lease.token !== input.leaseToken
      )
        return undefined;
      if (
        !Number.isSafeInteger(input.acknowledgedCommandCursor) ||
        input.acknowledgedCommandCursor < stored.acknowledgedCommandCursor ||
        input.acknowledgedCommandCursor > stored.commandCursor
      )
        throw new RemoteExecutionTerminalBrokerError(
          'identity-conflict',
          'Remote Terminal command acknowledgement is invalid.'
        );
      stored.acknowledgedCommandCursor = input.acknowledgedCommandCursor;
      const retained = stored.commands.filter(
        (command) => command.cursor > stored.acknowledgedCommandCursor
      );
      stored.commands = retained;
      stored.commandBytes = retained.reduce(
        (sum, command) => sum + commandSize(command),
        0
      );
      const maximum = boundedPositiveInteger(
        input.maximumCommands ??
          REMOTE_EXECUTION_TERMINAL_LIMITS.maximumWorkerReadCommands,
        'Remote Terminal worker command limit',
        REMOTE_EXECUTION_TERMINAL_LIMITS.maximumWorkerReadCommands
      );
      const commands = Object.freeze(retained.slice(0, maximum));
      return Object.freeze({
        terminalSessionId: stored.terminalSessionId,
        executionId: stored.executionId,
        acknowledgedCommandCursor: stored.acknowledgedCommandCursor,
        latestCommandCursor: stored.commandCursor,
        hasMore:
          (commands.at(-1)?.cursor ?? stored.acknowledgedCommandCursor) <
          stored.commandCursor,
        commands,
      });
    },
    async publishWorkerOutput(input) {
      const stored = options.requireStored(
        input.executionId,
        input.terminalSessionId
      );
      let resolved: RemoteExecutionTerminalResolvedExecution;
      try {
        resolved = await options.validateCurrentLease(stored);
      } catch {
        return 'lease-rejected';
      }
      if (
        resolved.lease.workerId !== input.workerId ||
        resolved.lease.token !== input.leaseToken
      )
        return 'lease-rejected';
      if (stored.controller.session.getSnapshot().status === 'closed')
        return 'session-closed';
      const workerOutputId = identifier(
        input.workerOutputId,
        'Remote Terminal worker output id'
      );
      const digest = tokenDigest(
        `${input.stream}\0${input.redacted ? '1' : '0'}\0${input.data}`
      );
      const previous = stored.workerOutputFingerprints.get(workerOutputId);
      if (previous !== undefined) {
        if (previous === digest) return 'existing';
        options.closeStored(stored, 'policy-revoked');
        return 'identity-conflict';
      }
      if (
        utf8ToBytes(input.data).byteLength >
        EXECUTION_TERMINAL_LIMITS.maximumOutputChunkBytes
      )
        throw new RemoteExecutionTerminalBrokerError(
          'invalid-request',
          'Remote Terminal output exceeds its chunk budget.'
        );
      const redaction = stored.outputRedactors[input.stream].push(input.data);
      if (redaction.value)
        stored.controller.emitOutput({
          stream: input.stream,
          data: redaction.value,
          redacted: input.redacted || redaction.redacted,
        });
      stored.workerOutputFingerprints.set(workerOutputId, digest);
      while (
        stored.workerOutputFingerprints.size >
        REMOTE_EXECUTION_TERMINAL_LIMITS.maximumOutputFingerprints
      ) {
        const oldest = stored.workerOutputFingerprints.keys().next().value;
        if (oldest === undefined) break;
        stored.workerOutputFingerprints.delete(oldest);
      }
      return 'stored';
    },
    async closeFromWorker(input) {
      const stored = options.requireStored(
        input.executionId,
        input.terminalSessionId
      );
      let resolved: RemoteExecutionTerminalResolvedExecution;
      try {
        resolved = await options.validateCurrentLease(stored);
      } catch {
        return false;
      }
      if (
        resolved.lease.workerId !== input.workerId ||
        resolved.lease.token !== input.leaseToken
      )
        return false;
      options.closeStored(stored, input.reason, input.exitCode);
      return true;
    },
  });
