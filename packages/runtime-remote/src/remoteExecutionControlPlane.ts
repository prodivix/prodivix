import {
  assertExecutableProjectCapabilitySupport,
  createExecutionSecretLeakDiagnostic,
  createExecutionSecretLeakGuard,
  EXECUTION_SECRET_LEAK_REASON,
  EXECUTION_TEST_REPORT_MEDIA_TYPE,
  EXECUTION_TEST_REPORT_TRACE_NAME,
  getExecutionProviderCompatibility,
  type ExecutionSecretLeakGuard,
  type ExecutionSecretLeakSurface,
  type ExecutionProviderDescriptor,
  type ExecutionRequest,
} from '@prodivix/runtime-core';
import {
  createRemoteExecutionFailureEnvelope,
  createRemoteExecutionSuccessEnvelope,
  decodeRemoteExecutionRequestEnvelope,
  type DecodedRemoteExecutionRequestEnvelope,
} from './remoteExecutionProtocolCodec';
import { decodeRemoteExecutionJobEvent } from './remoteExecutionEventCodec';
import type {
  RemoteExecutionAuthorizationPolicy,
  RemoteExecutionControlPlane,
  RemoteExecutionWorkerEvent,
  RemoteExecutionPrincipal,
  RemoteExecutionProviderRouter,
  RemoteExecutionQuotaPolicy,
  RemoteExecutionRepository,
  RemoteExecutionRequestContext,
  RemoteExecutionSnapshotStore,
  RemoteExecutionStoredRecord,
  RemoteExecutionIngestionLimits,
} from './remoteExecutionControlPlane.types';
import type {
  RemoteExecutionErrorCode,
  RemoteExecutionResponseEnvelope,
  RemoteExecutionSnapshotSource,
} from './remoteExecutionProtocol.types';

const normalizeWorkerEvent = (
  executionId: string,
  event: RemoteExecutionWorkerEvent
): RemoteExecutionWorkerEvent => {
  const decoded = decodeRemoteExecutionJobEvent({
    ...event,
    jobId: executionId,
    sequence: 1,
    emittedAt: 0,
  });
  switch (decoded.kind) {
    case 'log':
      return Object.freeze({ kind: decoded.kind, log: decoded.log });
    case 'diagnostic':
      return Object.freeze({
        kind: decoded.kind,
        diagnostic: decoded.diagnostic,
      });
    case 'trace':
      return Object.freeze({ kind: decoded.kind, trace: decoded.trace });
    default:
      throw new TypeError('Remote worker event kind is unsupported.');
  }
};

type ControlPlaneFailure = Readonly<{
  code: RemoteExecutionErrorCode;
  retryable: boolean;
  message: string;
}>;

export type CreateRemoteExecutionControlPlaneOptions = Readonly<{
  repository: RemoteExecutionRepository;
  snapshots: RemoteExecutionSnapshotStore;
  authorization: RemoteExecutionAuthorizationPolicy;
  quota: RemoteExecutionQuotaPolicy;
  router: RemoteExecutionProviderRouter;
  now?: () => number;
  createExecutionId: () => string;
  createLeaseToken: () => string;
  ingestionLimits?: Partial<RemoteExecutionIngestionLimits>;
  outputGuard?: ExecutionSecretLeakGuard;
}>;

const failureByCode: Readonly<
  Record<RemoteExecutionErrorCode, ControlPlaneFailure>
> = Object.freeze({
  'protocol-version-unsupported': {
    code: 'protocol-version-unsupported',
    retryable: false,
    message: 'No supported remote execution protocol version is available.',
  },
  'invalid-request': {
    code: 'invalid-request',
    retryable: false,
    message: 'The remote execution request is invalid.',
  },
  'identity-conflict': {
    code: 'identity-conflict',
    retryable: false,
    message:
      'The remote execution identity conflicts with an existing request.',
  },
  'not-found': {
    code: 'not-found',
    retryable: false,
    message: 'The remote execution resource was not found.',
  },
  unauthorized: {
    code: 'unauthorized',
    retryable: false,
    message: 'Remote execution authorization is required.',
  },
  forbidden: {
    code: 'forbidden',
    retryable: false,
    message: 'The remote execution operation is forbidden.',
  },
  'quota-exceeded': {
    code: 'quota-exceeded',
    retryable: false,
    message: 'The remote execution quota has been exceeded.',
  },
  unavailable: {
    code: 'unavailable',
    retryable: true,
    message: 'The remote execution control plane is unavailable.',
  },
  timeout: {
    code: 'timeout',
    retryable: true,
    message: 'The remote execution control plane timed out.',
  },
  internal: {
    code: 'internal',
    retryable: false,
    message: 'The remote execution control plane failed.',
  },
});

const sourceIdentity = (source: RemoteExecutionSnapshotSource) =>
  source.kind === 'reference'
    ? Object.freeze({
        snapshotId: source.snapshotId,
        contentDigest: source.contentDigest,
      })
    : Object.freeze({
        snapshotId: source.snapshot.workspace.snapshotId,
        contentDigest: source.snapshot.contentDigest,
      });

const identityKey = (
  request: ExecutionRequest,
  snapshotDigest: string
): string => JSON.stringify({ request, snapshotDigest });

const ownedExecution = (
  execution: RemoteExecutionStoredRecord | undefined,
  principal: RemoteExecutionPrincipal
): RemoteExecutionStoredRecord | undefined =>
  execution?.ownerId === principal.subjectId ? execution : undefined;

const respondFailure = (
  envelope: DecodedRemoteExecutionRequestEnvelope,
  code: RemoteExecutionErrorCode
): RemoteExecutionResponseEnvelope =>
  createRemoteExecutionFailureEnvelope(envelope, failureByCode[code]);

const authorize = async (
  policy: RemoteExecutionAuthorizationPolicy,
  envelope: DecodedRemoteExecutionRequestEnvelope,
  context: RemoteExecutionRequestContext,
  request?: ExecutionRequest,
  executionId?: string
): Promise<RemoteExecutionPrincipal | ControlPlaneFailure> => {
  const principal = context.principal;
  if (!principal) return failureByCode.unauthorized;
  const decision = await policy.authorize({
    principal,
    operation: envelope.request.operation,
    ...(request === undefined ? {} : { request }),
    ...(executionId === undefined ? {} : { executionId }),
  });
  return decision.allowed ? principal : failureByCode.forbidden;
};

const isFailure = (
  value: RemoteExecutionPrincipal | ControlPlaneFailure
): value is ControlPlaneFailure => 'code' in value;

/** Builds the E3 control-plane core without binding it to HTTP, a database, or a queue vendor. */
export const createRemoteExecutionControlPlane = (
  options: CreateRemoteExecutionControlPlaneOptions
): RemoteExecutionControlPlane => {
  const now = options.now ?? Date.now;
  const ingestionLimits: RemoteExecutionIngestionLimits = Object.freeze({
    maximumEvents: options.ingestionLimits?.maximumEvents ?? 10_000,
    maximumEventBytes:
      options.ingestionLimits?.maximumEventBytes ?? 16 * 1024 * 1024,
    maximumLogBytes:
      options.ingestionLimits?.maximumLogBytes ?? 8 * 1024 * 1024,
    maximumArtifacts: options.ingestionLimits?.maximumArtifacts ?? 128,
    maximumArtifactBytes:
      options.ingestionLimits?.maximumArtifactBytes ?? 256 * 1024 * 1024,
    maximumSingleArtifactBytes:
      options.ingestionLimits?.maximumSingleArtifactBytes ?? 64 * 1024 * 1024,
    maximumArtifactRetentionMs:
      options.ingestionLimits?.maximumArtifactRetentionMs ??
      24 * 60 * 60 * 1_000,
  });
  Object.entries(ingestionLimits).forEach(([name, value]) => {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new TypeError(`Remote ingestion limit ${name} must be positive.`);
  });

  const inspectValue = (
    surface: ExecutionSecretLeakSurface,
    value: unknown,
    leaseToken?: string
  ): boolean => {
    if (
      options.outputGuard &&
      !options.outputGuard.inspectValue(surface, value).safe
    )
      return true;
    return leaseToken === undefined
      ? false
      : !createExecutionSecretLeakGuard({
          secretValues: [leaseToken],
        }).inspectValue(surface, value).safe;
  };

  const inspectBytes = (
    surface: ExecutionSecretLeakSurface,
    value: Uint8Array,
    leaseToken?: string
  ): boolean => {
    if (
      options.outputGuard &&
      !options.outputGuard.inspectBytes(surface, value).safe
    )
      return true;
    return leaseToken === undefined
      ? false
      : !createExecutionSecretLeakGuard({
          secretValues: [leaseToken],
        }).inspectBytes(surface, value).safe;
  };

  const blockSecretLeak = async (
    input: Readonly<{
      executionId: string;
      workerId: string;
      leaseToken: string;
      surface: ExecutionSecretLeakSurface;
    }>
  ): Promise<RemoteExecutionStoredRecord | undefined> => {
    const emittedAt = now();
    await options.repository.appendWorkerEvent({
      executionId: input.executionId,
      workerId: input.workerId,
      leaseToken: input.leaseToken,
      emittedAt,
      workerEventId: 'prodivix:security:secret-leak',
      event: Object.freeze({
        kind: 'diagnostic',
        diagnostic: createExecutionSecretLeakDiagnostic({
          surface: input.surface,
        }),
      }),
      limits: ingestionLimits,
    });
    return options.repository.transition({
      executionId: input.executionId,
      workerId: input.workerId,
      leaseToken: input.leaseToken,
      status: 'failed',
      now: emittedAt,
      reason: EXECUTION_SECRET_LEAK_REASON,
    });
  };

  const handleCreate = async (
    envelope: DecodedRemoteExecutionRequestEnvelope,
    context: RemoteExecutionRequestContext,
    payload: Extract<
      DecodedRemoteExecutionRequestEnvelope['request'],
      { operation: 'create' }
    >['payload']
  ): Promise<RemoteExecutionResponseEnvelope> => {
    if (
      inspectValue('request', payload.request) ||
      inspectValue('snapshot', payload.snapshot)
    )
      return respondFailure(envelope, 'invalid-request');
    const principal = await authorize(
      options.authorization,
      envelope,
      context,
      payload.request
    );
    if (isFailure(principal))
      return createRemoteExecutionFailureEnvelope(envelope, principal);
    const source = sourceIdentity(payload.snapshot);
    if (
      source.snapshotId !== payload.request.workspace.snapshotId ||
      (payload.snapshot.kind === 'upload' &&
        payload.snapshot.snapshot.workspace.workspaceId !==
          payload.request.workspace.workspaceId)
    ) {
      return respondFailure(envelope, 'invalid-request');
    }
    const key = identityKey(payload.request, source.contentDigest);
    if (inspectValue('cache-key', key))
      return respondFailure(envelope, 'invalid-request');
    const existing = await options.repository.getByOwnerRequest(
      principal.subjectId,
      payload.request.requestId
    );
    if (existing) {
      return existing.identityKey === key
        ? createRemoteExecutionSuccessEnvelope(envelope, {
            execution: existing.record,
          })
        : respondFailure(envelope, 'identity-conflict');
    }
    const quota = await options.quota.check({
      principal,
      request: payload.request,
    });
    if (!quota.allowed) return respondFailure(envelope, 'quota-exceeded');
    const provider = await options.router.select(payload.request);
    if (!provider) return respondFailure(envelope, 'unavailable');
    const snapshot =
      payload.snapshot.kind === 'upload'
        ? await options.snapshots.put(
            principal.subjectId,
            payload.snapshot.snapshot,
            now()
          )
        : await options.snapshots.get(
            principal.subjectId,
            source.snapshotId,
            source.contentDigest
          );
    if (!snapshot) return respondFailure(envelope, 'not-found');
    if (inspectValue('snapshot', snapshot.snapshot))
      return respondFailure(envelope, 'invalid-request');
    if (payload.request.profile === 'production')
      return respondFailure(envelope, 'invalid-request');
    try {
      assertExecutableProjectCapabilitySupport(
        snapshot.snapshot,
        payload.request.profile,
        provider.capabilities
      );
    } catch {
      return respondFailure(envelope, 'invalid-request');
    }
    const result = await options.repository.createOrGet({
      ownerId: principal.subjectId,
      identityKey: key,
      request: payload.request,
      snapshotId: source.snapshotId,
      snapshotDigest: source.contentDigest,
      provider,
      executionId: options.createExecutionId(),
      createdAt: now(),
      maximumActiveExecutions: quota.maximumActiveExecutions,
    });
    if (result.kind === 'identity-conflict')
      return respondFailure(envelope, 'identity-conflict');
    if (result.kind === 'quota-exceeded')
      return respondFailure(envelope, 'quota-exceeded');
    return createRemoteExecutionSuccessEnvelope(envelope, {
      execution: result.execution.record,
    });
  };

  const handleOwned = async (
    envelope: DecodedRemoteExecutionRequestEnvelope,
    context: RemoteExecutionRequestContext,
    executionId: string
  ): Promise<
    | Readonly<{
        principal: RemoteExecutionPrincipal;
        execution: RemoteExecutionStoredRecord;
      }>
    | RemoteExecutionResponseEnvelope
  > => {
    const principal = await authorize(
      options.authorization,
      envelope,
      context,
      undefined,
      executionId
    );
    if (isFailure(principal))
      return createRemoteExecutionFailureEnvelope(envelope, principal);
    const execution = ownedExecution(
      await options.repository.get(executionId),
      principal
    );
    return execution
      ? Object.freeze({ principal, execution })
      : respondFailure(envelope, 'not-found');
  };

  const isEnvelopeResponse = (
    value:
      | Readonly<{
          principal: RemoteExecutionPrincipal;
          execution: RemoteExecutionStoredRecord;
        }>
      | RemoteExecutionResponseEnvelope
  ): value is RemoteExecutionResponseEnvelope => 'ok' in value;

  const handle = async (
    rawEnvelope: Parameters<RemoteExecutionControlPlane['handle']>[0],
    context: RemoteExecutionRequestContext
  ): Promise<RemoteExecutionResponseEnvelope> => {
    const envelope = decodeRemoteExecutionRequestEnvelope(rawEnvelope);
    const request = envelope.request;
    if (request.operation !== 'create' && inspectValue('request', request))
      return respondFailure(envelope, 'invalid-request');
    switch (request.operation) {
      case 'negotiate':
        return request.payload.supportedVersions.includes(envelope.version)
          ? createRemoteExecutionSuccessEnvelope(envelope, {
              selectedVersion: envelope.version,
            })
          : respondFailure(envelope, 'protocol-version-unsupported');
      case 'create':
        return handleCreate(envelope, context, request.payload);
      case 'get': {
        const owned = await handleOwned(
          envelope,
          context,
          request.payload.executionId
        );
        return isEnvelopeResponse(owned)
          ? owned
          : createRemoteExecutionSuccessEnvelope(
              envelope,
              owned.execution.record
            );
      }
      case 'cancel': {
        const owned = await handleOwned(
          envelope,
          context,
          request.payload.executionId
        );
        if (isEnvelopeResponse(owned)) return owned;
        const cancelled = await options.repository.cancel({
          ownerId: owned.principal.subjectId,
          executionId: request.payload.executionId,
          cancellationId: request.payload.cancellationId,
          ...(request.payload.reason === undefined
            ? {}
            : { reason: request.payload.reason }),
          cancelledAt: now(),
        });
        if (cancelled.kind === 'not-found')
          return respondFailure(envelope, 'not-found');
        if (cancelled.kind === 'forbidden')
          return respondFailure(envelope, 'forbidden');
        return createRemoteExecutionSuccessEnvelope(envelope, {
          executionId: request.payload.executionId,
          cancellationId: request.payload.cancellationId,
          result: { status: cancelled.result },
        });
      }
      case 'events.read': {
        const owned = await handleOwned(
          envelope,
          context,
          request.payload.executionId
        );
        if (isEnvelopeResponse(owned)) return owned;
        const events = owned.execution.events.filter(
          (event) => event.cursor > request.payload.afterCursor
        );
        const page = events.slice(0, request.payload.limit);
        return createRemoteExecutionSuccessEnvelope(envelope, {
          executionId: owned.execution.record.executionId,
          providerId: owned.execution.record.provider.id,
          afterCursor: request.payload.afterCursor,
          latestCursor: owned.execution.record.latestCursor,
          hasMore: events.length > page.length,
          events: page.map(({ cursor, event }) => ({ cursor, event })),
        });
      }
      case 'artifact.resolve': {
        const owned = await handleOwned(
          envelope,
          context,
          request.payload.executionId
        );
        if (isEnvelopeResponse(owned)) return owned;
        const artifact = owned.execution.artifacts.find(
          (candidate) =>
            candidate.artifactId === request.payload.artifactId &&
            candidate.expiresAt > now()
        );
        return artifact
          ? createRemoteExecutionSuccessEnvelope(envelope, {
              executionId: owned.execution.record.executionId,
              providerId: owned.execution.record.provider.id,
              artifact,
            })
          : respondFailure(envelope, 'not-found');
      }
    }
  };

  return Object.freeze({
    handle,
    async claimNext(input) {
      if (
        !Number.isSafeInteger(input.leaseDurationMs) ||
        input.leaseDurationMs < 1
      )
        throw new TypeError(
          'Remote lease duration must be a positive integer.'
        );
      return options.repository.claimNext({
        ...input,
        leaseToken: options.createLeaseToken(),
        now: now(),
      });
    },
    async renewLease(input) {
      if (
        !Number.isSafeInteger(input.leaseDurationMs) ||
        input.leaseDurationMs < 1
      )
        throw new TypeError(
          'Remote lease duration must be a positive integer.'
        );
      return options.repository.renewLease({ ...input, now: now() });
    },
    async transition(input) {
      if (inspectValue('crash', input.reason, input.leaseToken))
        return blockSecretLeak({
          executionId: input.executionId,
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          surface: 'crash',
        });
      return options.repository.transition({ ...input, now: now() });
    },
    async appendWorkerEvent(input) {
      if (input.workerEventId.startsWith('prodivix:'))
        return Object.freeze({ kind: 'identity-conflict' as const });
      const event = normalizeWorkerEvent(input.executionId, input.event);
      const surface: ExecutionSecretLeakSurface =
        event.kind === 'log'
          ? 'log'
          : event.kind === 'diagnostic'
            ? 'diagnostic'
            : event.trace.name === EXECUTION_TEST_REPORT_TRACE_NAME
              ? 'test-report'
              : 'trace';
      if (
        inspectValue(
          surface,
          { workerEventId: input.workerEventId, event },
          input.leaseToken
        )
      ) {
        await blockSecretLeak({
          executionId: input.executionId,
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          surface,
        });
        return Object.freeze({ kind: 'secret-leak' as const });
      }
      return options.repository.appendWorkerEvent({
        ...input,
        event,
        emittedAt: now(),
        limits: ingestionLimits,
      });
    },
    async putArtifact(input) {
      if (input.workerEventId.startsWith('prodivix:'))
        return Object.freeze({ kind: 'identity-conflict' as const });
      const contentSurface: ExecutionSecretLeakSurface =
        input.descriptor.mediaType === EXECUTION_TEST_REPORT_MEDIA_TYPE
          ? 'test-report'
          : 'artifact-content';
      const descriptorLeak = inspectValue(
        'artifact-descriptor',
        {
          workerEventId: input.workerEventId,
          descriptor: input.descriptor,
        },
        input.leaseToken
      );
      const contentLeak = inspectBytes(
        contentSurface,
        input.contents,
        input.leaseToken
      );
      if (descriptorLeak || contentLeak) {
        await blockSecretLeak({
          executionId: input.executionId,
          workerId: input.workerId,
          leaseToken: input.leaseToken,
          surface: descriptorLeak ? 'artifact-descriptor' : contentSurface,
        });
        return Object.freeze({ kind: 'secret-leak' as const });
      }
      return options.repository.putArtifact({
        ...input,
        emittedAt: now(),
        limits: ingestionLimits,
      });
    },
    async getArtifact(input) {
      return options.repository.getArtifact({
        ownerId: input.principal.subjectId,
        executionId: input.executionId,
        artifactId: input.artifactId,
        now: now(),
      });
    },
    async sweepExpiredArtifacts(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1)
        throw new TypeError('Remote artifact sweep limit must be positive.');
      return options.repository.sweepExpiredArtifacts({ now: now(), limit });
    },
  });
};

export const createScopeRemoteExecutionAuthorizationPolicy =
  (): RemoteExecutionAuthorizationPolicy =>
    Object.freeze({
      async authorize({ principal, operation }) {
        const scopes = new Set(principal.scopes);
        return Object.freeze({
          allowed:
            scopes.has('remote-execution:*') ||
            scopes.has(`remote-execution:${operation}`),
        });
      },
    });

export const createActiveExecutionQuotaPolicy = (
  maximumActiveExecutions: number
): RemoteExecutionQuotaPolicy => {
  if (
    !Number.isSafeInteger(maximumActiveExecutions) ||
    maximumActiveExecutions < 1
  ) {
    throw new TypeError('Remote active execution quota must be positive.');
  }
  return Object.freeze({
    async check() {
      return Object.freeze({
        allowed: true as const,
        maximumActiveExecutions,
      });
    },
  });
};

export const createStaticRemoteExecutionProviderRouter = (
  providers: readonly ExecutionProviderDescriptor[]
): RemoteExecutionProviderRouter => {
  const eligible = Object.freeze(
    providers.filter((provider) => provider.isolation === 'remote-isolated')
  );
  return Object.freeze({
    async select(request) {
      return eligible.find(
        (provider) =>
          getExecutionProviderCompatibility(provider, request).compatible
      );
    },
  });
};
