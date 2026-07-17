import {
  createExecutionSecretLeakGuard,
  createExecutionSecretTextStreamRedactor,
  createExecutionTerminalController,
  type ExecutionTerminalCloseReason,
} from '@prodivix/runtime-core';
import {
  REMOTE_EXECUTION_TERMINAL_LIMITS,
  REMOTE_EXECUTION_TERMINAL_PROTOCOL,
  REMOTE_EXECUTION_TERMINAL_VERSION,
  type RemoteExecutionTerminalBroker,
  type RemoteExecutionTerminalCommand,
  type RemoteExecutionTerminalOpenResult,
  type RemoteExecutionTerminalResolvedExecution,
} from './remoteExecutionTerminal.types';
import type {
  RemoteExecutionPrincipal,
  RemoteExecutionStoredRecord,
} from './remoteExecutionControlPlane.types';
import {
  createRemoteExecutionTerminalTokenDigest as tokenDigest,
  getRemoteExecutionTerminalCommandSize as commandSize,
  hasRemoteExecutionTerminalScope as terminalScopeAllowed,
  normalizeRemoteExecutionTerminalIdentifier as identifier,
  normalizeRemoteExecutionTerminalPositiveInteger as boundedPositiveInteger,
  remoteExecutionTerminalActiveStatuses as activeStatuses,
  RemoteExecutionTerminalBrokerError,
  type CreateRemoteExecutionTerminalBrokerOptions,
  type RemoteExecutionTerminalCommandInput,
  type StoredRemoteExecutionTerminal as StoredTerminal,
} from './remoteExecutionTerminalBrokerSupport';
import { createRemoteExecutionTerminalWorkerBroker } from './remoteExecutionTerminalWorkerBroker';

export {
  REMOTE_EXECUTION_TERMINAL_ERROR_CODES,
  RemoteExecutionTerminalBrokerError,
} from './remoteExecutionTerminalBrokerSupport';
export type {
  CreateRemoteExecutionTerminalBrokerOptions,
  RemoteExecutionTerminalErrorCode,
} from './remoteExecutionTerminalBrokerSupport';

/**
 * Creates an ephemeral, process-local Remote Terminal broker. Raw stdin exists
 * only in the bounded unacknowledged command queue; tokens are stored as
 * digests and all terminal state is destroyed with the execution generation.
 */
export const createRemoteExecutionTerminalBroker = (
  options: CreateRemoteExecutionTerminalBrokerOptions
): RemoteExecutionTerminalBroker => {
  const now = options.now ?? Date.now;
  const accessTokenTtlMs = boundedPositiveInteger(
    options.accessTokenTtlMs ??
      REMOTE_EXECUTION_TERMINAL_LIMITS.defaultAccessTokenTtlMs,
    'Remote Terminal access token TTL',
    15 * 60_000
  );
  const maximumSessions = boundedPositiveInteger(
    options.maximumSessions ?? REMOTE_EXECUTION_TERMINAL_LIMITS.maximumSessions,
    'Remote Terminal session budget',
    REMOTE_EXECUTION_TERMINAL_LIMITS.maximumSessions
  );
  const maximumCommands = boundedPositiveInteger(
    options.maximumCommands ?? REMOTE_EXECUTION_TERMINAL_LIMITS.maximumCommands,
    'Remote Terminal command budget',
    REMOTE_EXECUTION_TERMINAL_LIMITS.maximumCommands
  );
  const maximumCommandBytes = boundedPositiveInteger(
    options.maximumCommandBytes ??
      REMOTE_EXECUTION_TERMINAL_LIMITS.maximumCommandBytes,
    'Remote Terminal command byte budget',
    REMOTE_EXECUTION_TERMINAL_LIMITS.maximumCommandBytes
  );
  const secretValues = Object.freeze([...(options.secretValues ?? [])]);
  const outputGuard = createExecutionSecretLeakGuard({ secretValues });
  const sessions = new Map<string, StoredTerminal>();
  const sessionByExecution = new Map<string, string>();

  const readAccessToken = (): Readonly<{ token: string; digest: string }> => {
    const token = identifier(
      options.createAccessToken(),
      'Remote Terminal access token'
    );
    if (
      token.length > REMOTE_EXECUTION_TERMINAL_LIMITS.maximumAccessTokenLength
    )
      throw new TypeError('Remote Terminal access token exceeds its budget.');
    return Object.freeze({ token, digest: tokenDigest(token) });
  };

  const resolveActiveExecution = async (
    executionId: string
  ): Promise<RemoteExecutionTerminalResolvedExecution> => {
    const execution = await options.resolveExecution(
      identifier(executionId, 'Remote Terminal execution id')
    );
    const current = now();
    if (
      !execution?.lease ||
      execution.lease.expiresAt <= current ||
      !activeStatuses.has(execution.record.status) ||
      !execution.record.provider.capabilities.includes('terminal')
    )
      throw new RemoteExecutionTerminalBrokerError(
        'unavailable',
        'Remote Terminal execution is not available.'
      );
    return Object.freeze({ execution, lease: execution.lease });
  };

  const assertPrincipal = (
    principal: RemoteExecutionPrincipal,
    execution: RemoteExecutionStoredRecord
  ): void => {
    if (
      !terminalScopeAllowed(principal) ||
      principal.subjectId !== execution.ownerId
    )
      throw new RemoteExecutionTerminalBrokerError(
        'forbidden',
        'Remote Terminal access is forbidden.'
      );
  };

  const flushOutput = (stored: StoredTerminal): void => {
    (['stdout', 'stderr'] as const).forEach((stream) => {
      const flushed = stored.outputRedactors[stream].flush();
      if (!flushed.value) return;
      stored.controller.emitOutput({
        stream,
        data: flushed.value,
        redacted: flushed.redacted,
      });
    });
  };

  const closeStored = (
    stored: StoredTerminal,
    reason: ExecutionTerminalCloseReason,
    exitCode?: number
  ): void => {
    flushOutput(stored);
    stored.controller.close(reason, exitCode);
    stored.accessTokenDigest = '';
    stored.accessTokenExpiresAt = 0;
    stored.commands = [];
    stored.commandBytes = 0;
  };

  const validateCurrentLease = async (
    stored: StoredTerminal
  ): Promise<RemoteExecutionTerminalResolvedExecution> => {
    let resolved: RemoteExecutionTerminalResolvedExecution;
    try {
      resolved = await resolveActiveExecution(stored.executionId);
    } catch (error) {
      closeStored(stored, 'execution-ended');
      throw error;
    }
    if (
      resolved.lease.workerId !== stored.workerId ||
      resolved.lease.attempt !== stored.workerAttempt ||
      tokenDigest(resolved.lease.token) !== stored.workerLeaseTokenDigest
    ) {
      closeStored(stored, 'transport-lost');
      throw new RemoteExecutionTerminalBrokerError(
        'identity-conflict',
        'Remote Terminal worker lease changed.'
      );
    }
    stored.controller.renewGrant({
      grantId: `worker-lease:${resolved.lease.attempt}`,
      executionId: stored.executionId,
      jobId: stored.executionId,
      providerId: resolved.execution.record.provider.id,
      expiresAt: resolved.lease.expiresAt,
    });
    return resolved;
  };

  const requireStored = (
    executionId: string,
    terminalSessionId: string
  ): StoredTerminal => {
    const normalizedExecutionId = identifier(
      executionId,
      'Remote Terminal execution id'
    );
    const normalizedSessionId = identifier(
      terminalSessionId,
      'Remote Terminal session id'
    );
    const stored = sessions.get(normalizedSessionId);
    if (!stored || stored.executionId !== normalizedExecutionId)
      throw new RemoteExecutionTerminalBrokerError(
        'not-found',
        'Remote Terminal session was not found.'
      );
    return stored;
  };

  const requireAccess = async (input: {
    accessToken: string;
    executionId: string;
    terminalSessionId: string;
  }): Promise<StoredTerminal> => {
    const stored = requireStored(input.executionId, input.terminalSessionId);
    const accessToken = identifier(
      input.accessToken,
      'Remote Terminal access token'
    );
    if (
      stored.accessTokenExpiresAt <= now() ||
      !stored.accessTokenDigest ||
      tokenDigest(accessToken) !== stored.accessTokenDigest
    )
      throw new RemoteExecutionTerminalBrokerError(
        'access-expired',
        'Remote Terminal access expired.'
      );
    await validateCurrentLease(stored);
    return stored;
  };

  const enqueueCommand = (
    stored: StoredTerminal,
    command: RemoteExecutionTerminalCommandInput
  ): void => {
    if (stored.commands.length >= maximumCommands)
      throw new RemoteExecutionTerminalBrokerError(
        'quota-exceeded',
        'Remote Terminal command budget was exceeded.'
      );
    const next = Object.freeze({
      ...command,
      cursor: stored.commandCursor + 1,
    }) as RemoteExecutionTerminalCommand;
    const bytes = commandSize(next);
    if (stored.commandBytes + bytes > maximumCommandBytes)
      throw new RemoteExecutionTerminalBrokerError(
        'quota-exceeded',
        'Remote Terminal command byte budget was exceeded.'
      );
    stored.commandCursor = next.cursor;
    stored.commandBytes += bytes;
    stored.commands.push(next);
  };

  const rotateAccess = (
    stored: StoredTerminal
  ): RemoteExecutionTerminalOpenResult => {
    const access = readAccessToken();
    stored.accessTokenDigest = access.digest;
    stored.accessTokenExpiresAt = now() + accessTokenTtlMs;
    return Object.freeze({
      protocol: REMOTE_EXECUTION_TERMINAL_PROTOCOL,
      version: REMOTE_EXECUTION_TERMINAL_VERSION,
      snapshot: stored.controller.session.getSnapshot(),
      access: Object.freeze({
        token: access.token,
        expiresAt: stored.accessTokenExpiresAt,
      }),
    });
  };

  const workerBroker = createRemoteExecutionTerminalWorkerBroker({
    sessionByExecution,
    requireStored,
    validateCurrentLease,
    closeStored,
  });
  const broker: RemoteExecutionTerminalBroker = Object.freeze({
    async open(input) {
      const resolved = await resolveActiveExecution(input.executionId);
      assertPrincipal(input.principal, resolved.execution);
      const existingId = sessionByExecution.get(input.executionId);
      if (existingId) {
        const existing = sessions.get(existingId);
        if (existing?.controller.session.getSnapshot().status !== 'closed')
          throw new RemoteExecutionTerminalBrokerError(
            'identity-conflict',
            'Remote Terminal execution already has an active session.'
          );
      }
      if (sessions.size >= maximumSessions)
        throw new RemoteExecutionTerminalBrokerError(
          'quota-exceeded',
          'Remote Terminal session budget was exceeded.'
        );
      const terminalSessionId = identifier(
        options.createTerminalSessionId(),
        'Remote Terminal session id'
      );
      if (sessions.has(terminalSessionId))
        throw new RemoteExecutionTerminalBrokerError(
          'identity-conflict',
          'Remote Terminal session identity already exists.'
        );
      let stored: StoredTerminal;
      const controller = createExecutionTerminalController({
        terminalSessionId,
        executionId: resolved.execution.record.executionId,
        jobId: resolved.execution.record.executionId,
        provider: resolved.execution.record.provider,
        capability: 'shell',
        grant: {
          grantId: `worker-lease:${resolved.lease.attempt}`,
          executionId: resolved.execution.record.executionId,
          jobId: resolved.execution.record.executionId,
          providerId: resolved.execution.record.provider.id,
          expiresAt: resolved.lease.expiresAt,
        },
        size: input.size,
        requestInput: ({ data, clientSequence }) =>
          enqueueCommand(stored, {
            kind: 'input',
            terminalSessionId,
            clientSequence,
            data,
          }),
        requestResize: (size) =>
          enqueueCommand(stored, {
            kind: 'resize',
            terminalSessionId,
            size,
          }),
        requestSignal: (signal) =>
          enqueueCommand(stored, {
            kind: 'signal',
            terminalSessionId,
            signal,
          }),
        requestClose: (reason) =>
          enqueueCommand(stored, {
            kind: 'close',
            terminalSessionId,
            reason,
          }),
        secretLeakGuard: outputGuard,
        now,
      });
      stored = {
        principalSubjectId: input.principal.subjectId,
        executionId: resolved.execution.record.executionId,
        terminalSessionId,
        workerId: resolved.lease.workerId,
        workerLeaseTokenDigest: tokenDigest(resolved.lease.token),
        workerAttempt: resolved.lease.attempt,
        controller,
        outputRedactors: Object.freeze({
          stdout: createExecutionSecretTextStreamRedactor({ secretValues }),
          stderr: createExecutionSecretTextStreamRedactor({ secretValues }),
        }),
        workerOutputFingerprints: new Map(),
        accessTokenDigest: '',
        accessTokenExpiresAt: 0,
        commandCursor: 0,
        acknowledgedCommandCursor: 0,
        commandBytes: 0,
        commands: [],
      };
      enqueueCommand(stored, {
        kind: 'open',
        terminalSessionId,
        size: controller.session.getSnapshot().size,
      });
      sessions.set(terminalSessionId, stored);
      sessionByExecution.set(stored.executionId, terminalSessionId);
      return rotateAccess(stored);
    },
    async resume(input) {
      const stored = requireStored(input.executionId, input.terminalSessionId);
      const resolved = await validateCurrentLease(stored);
      assertPrincipal(input.principal, resolved.execution);
      if (stored.principalSubjectId !== input.principal.subjectId)
        throw new RemoteExecutionTerminalBrokerError(
          'forbidden',
          'Remote Terminal access is forbidden.'
        );
      return rotateAccess(stored);
    },
    async read(input) {
      const stored = await requireAccess(input);
      return stored.controller.session.read({
        afterCursor: input.afterCursor,
        ...(input.maximumRecords === undefined
          ? {}
          : { maximumRecords: input.maximumRecords }),
      });
    },
    async write(input) {
      const stored = await requireAccess(input);
      return stored.controller.session.write({
        data: input.data,
        clientSequence: input.clientSequence,
      });
    },
    async resize(input) {
      const stored = await requireAccess(input);
      return stored.controller.session.resize(input.size);
    },
    async signal(input) {
      const stored = await requireAccess(input);
      return stored.controller.session.signal(input.signal);
    },
    async close(input) {
      const stored = await requireAccess(input);
      flushOutput(stored);
      const result = await stored.controller.session.close();
      stored.accessTokenDigest = '';
      stored.accessTokenExpiresAt = 0;
      return result;
    },
    ...workerBroker,
    closeExecution(executionId, reason = 'execution-ended') {
      const sessionId = sessionByExecution.get(executionId);
      if (!sessionId) return 0;
      const stored = sessions.get(sessionId);
      if (!stored) return 0;
      closeStored(stored, reason);
      return 1;
    },
    sweepExpired() {
      let swept = 0;
      sessions.forEach((stored, sessionId) => {
        let snapshot = stored.controller.session.getSnapshot();
        if (snapshot.status === 'closed' && stored.accessTokenDigest) {
          closeStored(
            stored,
            snapshot.closeReason ?? 'provider-closed',
            snapshot.exitCode
          );
          snapshot = stored.controller.session.getSnapshot();
        }
        if (
          snapshot.status === 'closed' &&
          stored.accessTokenExpiresAt <= now()
        ) {
          sessions.delete(sessionId);
          if (sessionByExecution.get(stored.executionId) === sessionId)
            sessionByExecution.delete(stored.executionId);
          swept += 1;
        }
      });
      return swept;
    },
  });
  return broker;
};
