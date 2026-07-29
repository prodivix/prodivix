import type { DiagnosticTargetRef } from '@prodivix/diagnostics';
import {
  canReachExecutionJobStatus,
  type ExecutionJobStatus,
  type ExecutionRequest,
} from '@prodivix/runtime-core';
import {
  createRemoteExecutionCreatePayload,
  createRemoteExecutionRequestEnvelope,
  decodeRemoteExecutionArtifactResult,
  decodeRemoteExecutionCancelResult,
  decodeRemoteExecutionCreateResult,
  decodeRemoteExecutionEventsResult,
  decodeRemoteExecutionRecord,
  decodeRemoteExecutionResponseEnvelope,
} from './remoteExecutionProtocolCodec';
import { exactRecord, safeInteger } from './remoteExecutionCodecPrimitives';
import {
  REMOTE_EXECUTION_PROTOCOL_VERSIONS,
  type RemoteExecutionArtifactResult,
  type RemoteExecutionCancelResult,
  type RemoteExecutionClient,
  type RemoteExecutionClientDiagnostic,
  type RemoteExecutionCreateResult,
  type RemoteExecutionErrorCode,
  type RemoteExecutionEventsResult,
  type RemoteExecutionOperation,
  type RemoteExecutionProtocolVersion,
  type RemoteExecutionRecord,
  type RemoteExecutionSnapshotSource,
  type RemoteExecutionTransport,
  type RemoteExecutionWireError,
} from './remoteExecutionProtocol.types';

export type RemoteExecutionRetryPolicy = Readonly<{
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
}>;

export type CreateRemoteExecutionClientOptions = Readonly<{
  transport: RemoteExecutionTransport;
  supportedVersions?: readonly RemoteExecutionProtocolVersion[];
  retryPolicy?: Partial<RemoteExecutionRetryPolicy>;
  createMessageId?: (operation: RemoteExecutionOperation) => string;
  random?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
}>;

const DEFAULT_RETRY_POLICY: RemoteExecutionRetryPolicy = Object.freeze({
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 2_000,
  jitterRatio: 0.2,
});

const diagnosticByError: Readonly<
  Record<RemoteExecutionErrorCode, Readonly<{ code: string; message: string }>>
> = Object.freeze({
  'protocol-version-unsupported': {
    code: 'EXE-4001',
    message: 'The remote runner protocol version is not supported.',
  },
  'invalid-request': {
    code: 'EXE-4002',
    message: 'The remote runner rejected the execution request.',
  },
  'identity-conflict': {
    code: 'EXE-4091',
    message:
      'The remote execution identity conflicts with an existing request.',
  },
  'not-found': {
    code: 'EXE-4041',
    message: 'The remote execution resource no longer exists.',
  },
  unauthorized: {
    code: 'EXE-4011',
    message: 'Remote execution authorization is required.',
  },
  forbidden: {
    code: 'EXE-4031',
    message: 'The remote execution operation is not permitted.',
  },
  'quota-exceeded': {
    code: 'EXE-4291',
    message: 'The remote execution quota has been exceeded.',
  },
  unavailable: {
    code: 'EXE-5001',
    message: 'The remote runner is temporarily unavailable.',
  },
  timeout: {
    code: 'EXE-5002',
    message: 'The remote runner request timed out.',
  },
  internal: {
    code: 'EXE-5003',
    message: 'The remote runner failed without exposing internal details.',
  },
});

const createDiagnostic = (
  error: RemoteExecutionWireError,
  operation: RemoteExecutionOperation,
  targetRef?: DiagnosticTargetRef
): RemoteExecutionClientDiagnostic => {
  const mapped = diagnosticByError[error.code];
  return Object.freeze({
    code: mapped.code,
    severity: 'error',
    domain: 'workspace',
    message: mapped.message,
    hint: error.retryable
      ? 'Retry with the same idempotency identity or restore from the last confirmed cursor.'
      : 'Review the request, authorization, capability, and runner policy before retrying.',
    retryable: error.retryable,
    ...(targetRef ? { targetRef } : {}),
    meta: Object.freeze({ operation, remoteErrorCode: error.code }),
  });
};

export class RemoteExecutionClientError extends Error {
  readonly remoteCode: RemoteExecutionErrorCode;
  readonly retryable: boolean;
  readonly operation: RemoteExecutionOperation;
  readonly diagnostic: RemoteExecutionClientDiagnostic;

  constructor(
    error: RemoteExecutionWireError,
    operation: RemoteExecutionOperation,
    targetRef?: DiagnosticTargetRef
  ) {
    const diagnostic = createDiagnostic(error, operation, targetRef);
    super(diagnostic.message);
    this.name = 'RemoteExecutionClientError';
    this.remoteCode = error.code;
    this.retryable = error.retryable;
    this.operation = operation;
    this.diagnostic = diagnostic;
  }
}

export class RemoteExecutionRecoveryRequiredError extends Error {
  readonly operation: RemoteExecutionOperation;
  readonly diagnostic: RemoteExecutionClientDiagnostic;

  constructor(message: string, operation: RemoteExecutionOperation) {
    super(message);
    this.name = 'RemoteExecutionRecoveryRequiredError';
    this.operation = operation;
    this.diagnostic = Object.freeze({
      code: 'EXE-4092',
      severity: 'error',
      domain: 'workspace',
      message,
      hint: 'Read authoritative execution status and resume from its confirmed cursor.',
      retryable: true,
      meta: Object.freeze({ operation, recovery: 'refresh-status' }),
    });
  }
}

const defaultDelay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    const timer = (
      globalThis as unknown as {
        setTimeout(callback: () => void, delay: number): unknown;
      }
    ).setTimeout;
    timer(resolve, milliseconds);
  });

const retryPolicy = (
  input: Partial<RemoteExecutionRetryPolicy> | undefined
): RemoteExecutionRetryPolicy => {
  const policy = { ...DEFAULT_RETRY_POLICY, ...input };
  if (!Number.isSafeInteger(policy.maxAttempts) || policy.maxAttempts < 1) {
    throw new TypeError('Remote retry maxAttempts must be a positive integer.');
  }
  if (
    !Number.isSafeInteger(policy.initialDelayMs) ||
    policy.initialDelayMs < 0 ||
    !Number.isSafeInteger(policy.maxDelayMs) ||
    policy.maxDelayMs < policy.initialDelayMs
  ) {
    throw new TypeError('Remote retry delays are invalid.');
  }
  if (
    !Number.isFinite(policy.jitterRatio) ||
    policy.jitterRatio < 0 ||
    policy.jitterRatio > 1
  ) {
    throw new TypeError('Remote retry jitterRatio must be between 0 and 1.');
  }
  return Object.freeze(policy);
};

const sourceDigest = (source: RemoteExecutionSnapshotSource): string =>
  source.kind === 'reference'
    ? source.contentDigest
    : source.snapshot.contentDigest;

const sourceSnapshotId = (source: RemoteExecutionSnapshotSource): string =>
  source.kind === 'reference'
    ? source.snapshotId
    : source.snapshot.workspace.snapshotId;

const assertSourceMatchesRequest = (
  request: ExecutionRequest,
  source: RemoteExecutionSnapshotSource
): void => {
  if (sourceSnapshotId(source) !== request.workspace.snapshotId) {
    throw new TypeError(
      'Remote snapshot identity does not match ExecutionRequest.'
    );
  }
  if (
    source.kind === 'upload' &&
    source.snapshot.workspace.workspaceId !== request.workspace.workspaceId
  ) {
    throw new TypeError(
      'Remote snapshot workspace does not match ExecutionRequest.'
    );
  }
};

/** Creates the adapter-neutral E2 client; it owns correlation, retry, and recovery checks. */
export const createRemoteExecutionClient = (
  options: CreateRemoteExecutionClientOptions
): RemoteExecutionClient => {
  const policy = retryPolicy(options.retryPolicy);
  const supportedVersions = Object.freeze(
    [
      ...new Set(
        options.supportedVersions ?? REMOTE_EXECUTION_PROTOCOL_VERSIONS
      ),
    ].sort((left, right) => right - left)
  );
  if (!supportedVersions.length) {
    throw new TypeError(
      'Remote client must support at least one protocol version.'
    );
  }
  const random = options.random ?? Math.random;
  const delay = options.delay ?? defaultDelay;
  let messageSequence = 0;
  const createMessageId =
    options.createMessageId ??
    ((operation: RemoteExecutionOperation) => {
      messageSequence += 1;
      return `${operation}:${messageSequence}`;
    });
  let selectedVersion: RemoteExecutionProtocolVersion | undefined;
  const identitiesByExecution = new Map<
    string,
    Readonly<{
      providerId: string;
      requestId: string;
      snapshotDigest: string;
      status: ExecutionJobStatus;
      latestCursor: number;
    }>
  >();
  const digestByRequest = new Map<string, string>();

  const backoff = async (attempt: number): Promise<void> => {
    const exponential = Math.min(
      policy.maxDelayMs,
      policy.initialDelayMs * 2 ** Math.max(0, attempt - 1)
    );
    const jitter = exponential * policy.jitterRatio * (random() * 2 - 1);
    await delay(Math.max(0, Math.round(exponential + jitter)));
  };

  const send = async (
    version: RemoteExecutionProtocolVersion,
    operation: RemoteExecutionOperation,
    payload: unknown,
    targetRef?: DiagnosticTargetRef
  ): Promise<unknown> => {
    const messageId = createMessageId(operation);
    const envelope = createRemoteExecutionRequestEnvelope(
      version,
      messageId,
      operation,
      payload
    );
    let lastTransportFailure = false;
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      try {
        const raw = await options.transport.send(envelope);
        const response = decodeRemoteExecutionResponseEnvelope(raw, {
          version,
          messageId,
          operation,
        });
        if (response.ok) return response.payload;
        if (!response.error.retryable || attempt === policy.maxAttempts) {
          throw new RemoteExecutionClientError(
            response.error,
            operation,
            targetRef
          );
        }
        lastTransportFailure = false;
      } catch (error) {
        if (error instanceof RemoteExecutionClientError) throw error;
        if (error instanceof TypeError) {
          throw new RemoteExecutionClientError(
            {
              code: 'invalid-request',
              message: 'Remote response validation failed.',
              retryable: false,
            },
            operation,
            targetRef
          );
        }
        lastTransportFailure = true;
        if (attempt === policy.maxAttempts) break;
      }
      await backoff(attempt);
    }
    throw new RemoteExecutionClientError(
      {
        code: lastTransportFailure ? 'unavailable' : 'internal',
        message: 'Remote request failed.',
        retryable: true,
      },
      operation,
      targetRef
    );
  };

  const negotiate = async (): Promise<RemoteExecutionProtocolVersion> => {
    if (selectedVersion !== undefined) return selectedVersion;
    const bootstrapVersion = supportedVersions[0]!;
    const payload = await send(bootstrapVersion, 'negotiate', {
      supportedVersions,
    });
    const record = exactRecord(
      payload,
      ['selectedVersion'],
      ['selectedVersion'],
      'Remote negotiation result'
    );
    const version = safeInteger(
      record.selectedVersion,
      'Remote selected protocol version',
      1
    ) as RemoteExecutionProtocolVersion;
    if (!supportedVersions.includes(version)) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote runner selected an unadvertised protocol version.',
        'negotiate'
      );
    }
    selectedVersion = version;
    return version;
  };

  const remember = (execution: RemoteExecutionRecord): void => {
    const previous = identitiesByExecution.get(execution.executionId);
    if (
      previous &&
      (previous.providerId !== execution.provider.id ||
        previous.requestId !== execution.requestId ||
        previous.snapshotDigest !== execution.snapshotDigest ||
        previous.latestCursor > execution.latestCursor ||
        !canReachExecutionJobStatus(previous.status, execution.status))
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote execution identity or provider drifted.',
        'get'
      );
    }
    identitiesByExecution.set(
      execution.executionId,
      Object.freeze({
        providerId: execution.provider.id,
        requestId: execution.requestId,
        snapshotDigest: execution.snapshotDigest,
        status: execution.status,
        latestCursor: execution.latestCursor,
      })
    );
  };

  const create = async (input: {
    request: ExecutionRequest;
    snapshot: RemoteExecutionSnapshotSource;
  }): Promise<RemoteExecutionCreateResult> => {
    assertSourceMatchesRequest(input.request, input.snapshot);
    const digest = sourceDigest(input.snapshot);
    const previousDigest = digestByRequest.get(input.request.requestId);
    if (previousDigest && previousDigest !== digest) {
      throw new RemoteExecutionClientError(
        {
          code: 'identity-conflict',
          message: 'Request identity conflict.',
          retryable: false,
        },
        'create',
        input.request.invocation.targetRef
      );
    }
    const version = await negotiate();
    const result = decodeRemoteExecutionCreateResult(
      await send(
        version,
        'create',
        createRemoteExecutionCreatePayload(input),
        input.request.invocation.targetRef
      )
    );
    if (
      result.execution.requestId !== input.request.requestId ||
      result.execution.snapshotDigest !== digest
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote create result identity does not match the request.',
        'create'
      );
    }
    digestByRequest.set(input.request.requestId, digest);
    remember(result.execution);
    return result;
  };

  const get = async (executionId: string): Promise<RemoteExecutionRecord> => {
    const version = await negotiate();
    const result = decodeRemoteExecutionRecord(
      await send(version, 'get', { executionId })
    );
    if (result.executionId !== executionId) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote status returned a different execution identity.',
        'get'
      );
    }
    remember(result);
    return result;
  };

  const cancel = async (input: {
    executionId: string;
    cancellationId: string;
    reason?: string;
  }): Promise<RemoteExecutionCancelResult> => {
    const version = await negotiate();
    const result = decodeRemoteExecutionCancelResult(
      await send(version, 'cancel', input)
    );
    if (
      result.executionId !== input.executionId ||
      result.cancellationId !== input.cancellationId
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote cancellation correlation identity drifted.',
        'cancel'
      );
    }
    return result;
  };

  const readEvents = async (input: {
    executionId: string;
    afterCursor: number;
    limit?: number;
  }): Promise<RemoteExecutionEventsResult> => {
    const version = await negotiate();
    const result = decodeRemoteExecutionEventsResult(
      await send(version, 'events.read', {
        executionId: input.executionId,
        afterCursor: input.afterCursor,
        limit: input.limit ?? 200,
      })
    );
    const identity = identitiesByExecution.get(input.executionId);
    if (
      result.executionId !== input.executionId ||
      result.afterCursor !== input.afterCursor ||
      (identity && identity.providerId !== result.providerId)
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote event stream identity or provider drifted.',
        'events.read'
      );
    }
    let expectedCursor = input.afterCursor + 1;
    result.events.forEach((record) => {
      if (
        record.cursor !== expectedCursor ||
        record.event.jobId !== input.executionId
      ) {
        throw new RemoteExecutionRecoveryRequiredError(
          'Remote event stream contains a gap or out-of-order event.',
          'events.read'
        );
      }
      expectedCursor += 1;
    });
    const finalCursor = result.events.at(-1)?.cursor ?? input.afterCursor;
    if (result.latestCursor < finalCursor) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote event stream latest cursor regressed.',
        'events.read'
      );
    }
    return result;
  };

  const resolveArtifact = async (input: {
    executionId: string;
    artifactId: string;
  }): Promise<RemoteExecutionArtifactResult> => {
    const version = await negotiate();
    const result = decodeRemoteExecutionArtifactResult(
      await send(version, 'artifact.resolve', input)
    );
    const identity = identitiesByExecution.get(input.executionId);
    if (
      result.executionId !== input.executionId ||
      result.artifact.artifactId !== input.artifactId ||
      (identity && identity.providerId !== result.providerId)
    ) {
      throw new RemoteExecutionRecoveryRequiredError(
        'Remote artifact identity or provider drifted.',
        'artifact.resolve'
      );
    }
    return result;
  };

  return Object.freeze({
    negotiate,
    create,
    get,
    cancel,
    readEvents,
    resolveArtifact,
  });
};
