import { timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentCapabilityProbeProgram,
  isAgentControlIdentity,
  isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  isAgentHostedRetrievalRuntimeResourceRegistrationRequest,
  isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection,
  isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord,
  isAgentControlInstant,
  resolveAgentCapabilityProbePublicResource,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbePublicResourceMaterial,
  type AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence,
  AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence,
  AgentEvaluationHostedRetrievalRuntimeResourceProvider,
} from './hostedRetrievalRuntimeResourceProvider';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
  AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES,
} from './productionOwnerAuthoritySidecarEnvironment';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';
import {
  AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST,
  type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot,
  type ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider,
} from './productionHostedRetrievalRuntimeResourceProvider';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_REQUEST_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-sidecar-request' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-sidecar-response' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-sidecar-health' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION =
  1 as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MAXIMUM_BYTES =
  1_048_576 as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS =
  110_000 as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_ROUTE =
  '/v1/hosted-retrieval-runtime-resource-lifecycle/provider' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_CLOSE_ROUTE =
  '/v1/hosted-retrieval-runtime-resource-lifecycle/close' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_ROUTE =
  '/healthz' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_ROUTE =
  '/v1/hosted-retrieval-runtime-resource-lifecycle/snapshot' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RECOVER_UNFINISHED_ROUTE =
  '/v1/hosted-retrieval-runtime-resource-lifecycle/recover-unfinished' as const;
export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_FORMAT =
  'prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-sidecar-snapshot' as const;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth =
  Readonly<{
    format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_FORMAT;
    version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION;
    status: 'ready';
    role: 'cleanup' | 'prepare' | 'recovery';
    namespaceId: string;
    lifecycleOwnerInstanceId: string;
    lifecycleOwnerImplementationDigest: CanonicalDigest;
    unfinishedMutationCount: number;
    overdueMutationCount: number;
    checkedAt: Instant;
    receiptDigest: CanonicalDigest;
  }>;

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot =
  ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot &
    Readonly<{
      format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_FORMAT;
      version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION;
      capturedAt: Instant;
      snapshotDigest: CanonicalDigest;
    }>;

type CreateRequest = Readonly<{
  format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION;
  operation: 'create';
  registrationRequest: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
  program: AgentCapabilityProbeProgram;
  material: AgentCapabilityProbePublicResourceMaterial;
  requestDigest: CanonicalDigest;
}>;

type DeleteRequest = Readonly<{
  format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION;
  operation: 'delete';
  claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt;
  resourceId: string;
  resourceRole: 'auxiliary' | 'primary';
  requestDigest: CanonicalDigest;
}>;

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest =
  CreateRequest | DeleteRequest;

type Response = Readonly<{
  format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION;
  operation: 'create' | 'delete';
  requestDigest: CanonicalDigest;
  evidence:
    | AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence
    | AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence;
  responseDigest: CanonicalDigest;
}>;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const fail = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const exact = (value: unknown, keys: readonly string[]): boolean =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth =
  (
    value: unknown
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth => {
    if (
      !exact(value, [
        'format',
        'version',
        'status',
        'role',
        'namespaceId',
        'lifecycleOwnerInstanceId',
        'lifecycleOwnerImplementationDigest',
        'unfinishedMutationCount',
        'overdueMutationCount',
        'checkedAt',
        'receiptDigest',
      ])
    )
      return false;
    const health =
      value as ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth;
    const { receiptDigest, ...base } = health;
    return (
      health.format ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_FORMAT &&
      health.version ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION &&
      health.status === 'ready' &&
      ['cleanup', 'prepare', 'recovery'].includes(health.role) &&
      isAgentControlIdentity(health.namespaceId) &&
      isAgentControlIdentity(health.lifecycleOwnerInstanceId) &&
      isAgentCanonicalDigest(health.lifecycleOwnerImplementationDigest) &&
      Number.isSafeInteger(health.unfinishedMutationCount) &&
      health.unfinishedMutationCount >= 0 &&
      Number.isSafeInteger(health.overdueMutationCount) &&
      health.overdueMutationCount >= 0 &&
      isAgentControlInstant(health.checkedAt) &&
      receiptDigest === digestAgentCanonicalValue(base)
    );
  };

const createHealth = (input: {
  role: 'cleanup' | 'prepare' | 'recovery';
  namespaceId: string;
  lifecycleOwnerInstanceId: string;
  snapshot: ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot;
  checkedAt: Instant;
}): ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_FORMAT,
    version:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION,
    status: 'ready' as const,
    role: input.role,
    namespaceId: input.namespaceId,
    lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
    lifecycleOwnerImplementationDigest:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_OWNER_IMPLEMENTATION_DIGEST,
    unfinishedMutationCount: input.snapshot.unfinishedMutationCount,
    overdueMutationCount: input.snapshot.overdueMutationCount,
    checkedAt: input.checkedAt,
  });
  const value = Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
  return isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth(
    value
  )
    ? value
    : fail();
};

export const isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot =
  (
    value: unknown
  ): value is ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot => {
    if (
      !exact(value, [
        'format',
        'version',
        'journalArchiveRecords',
        'budgetClosureProjections',
        'unfinishedMutationCount',
        'overdueMutationCount',
        'capturedAt',
        'snapshotDigest',
      ])
    )
      return false;
    const snapshot =
      value as ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot;
    const { snapshotDigest, ...base } = snapshot;
    return (
      snapshot.format ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_FORMAT &&
      snapshot.version ===
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION &&
      snapshot.journalArchiveRecords.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleTransportJournalArchiveRecord
      ) &&
      snapshot.budgetClosureProjections.every(
        isAgentHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjection
      ) &&
      Number.isSafeInteger(snapshot.unfinishedMutationCount) &&
      snapshot.unfinishedMutationCount >= 0 &&
      Number.isSafeInteger(snapshot.overdueMutationCount) &&
      snapshot.overdueMutationCount >= 0 &&
      isAgentControlInstant(snapshot.capturedAt) &&
      snapshotDigest === digestAgentCanonicalValue(base)
    );
  };

const createSnapshot = (
  snapshot: ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderSnapshot,
  capturedAt: Instant
): ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_FORMAT,
    version:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION,
    ...snapshot,
    capturedAt,
  });
  const value = Object.freeze({
    ...base,
    snapshotDigest: digestAgentCanonicalValue(base),
  });
  return isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot(
    value
  )
    ? value
    : fail();
};

const validCreationEvidence = (
  value: unknown
): value is AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence => {
  if (
    !exact(value, [
      'providerResourceId',
      'auxiliaryResourceIds',
      'resourceManifestDigest',
      'contentUploadReceiptDigest',
      'creationDispatchIntentSetDigest',
      'creationTransportReceiptSetDigest',
      'creationResultSpoolReceiptSetDigest',
    ])
  )
    return false;
  const evidence = value as Record<string, unknown>;
  return (
    isAgentControlIdentity(evidence.providerResourceId) &&
    Array.isArray(evidence.auxiliaryResourceIds) &&
    evidence.auxiliaryResourceIds.length <= 8 &&
    evidence.auxiliaryResourceIds.every(isAgentControlIdentity) &&
    new Set(evidence.auxiliaryResourceIds).size ===
      evidence.auxiliaryResourceIds.length &&
    [
      evidence.resourceManifestDigest,
      evidence.contentUploadReceiptDigest,
      evidence.creationDispatchIntentSetDigest,
      evidence.creationTransportReceiptSetDigest,
      evidence.creationResultSpoolReceiptSetDigest,
    ].every(isAgentCanonicalDigest)
  );
};

const validDeletionEvidence = (
  value: unknown
): value is AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence => {
  if (
    !exact(value, [
      'resourceId',
      'resourceRole',
      'outcome',
      'cleanupClaimAuthorityReceiptDigest',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'resultSpoolReceiptDigest',
      'resultSpoolDispositionReceiptDigest',
      'dispatchCreatedAt',
      'completedAt',
    ])
  )
    return false;
  const evidence = value as Record<string, unknown>;
  return (
    isAgentControlIdentity(evidence.resourceId) &&
    (evidence.resourceRole === 'auxiliary' ||
      evidence.resourceRole === 'primary') &&
    (evidence.outcome === 'already-absent' || evidence.outcome === 'deleted') &&
    [
      evidence.cleanupClaimAuthorityReceiptDigest,
      evidence.dispatchIntentDigest,
      evidence.transportReceiptDigest,
      evidence.resultSpoolReceiptDigest,
      evidence.resultSpoolDispositionReceiptDigest,
    ].every(isAgentCanonicalDigest) &&
    isAgentControlInstant(evidence.dispatchCreatedAt) &&
    isAgentControlInstant(evidence.completedAt)
  );
};

export const createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest =
  (
    input:
      | Omit<CreateRequest, 'format' | 'requestDigest' | 'version'>
      | Omit<DeleteRequest, 'format' | 'requestDigest' | 'version'>
  ): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_REQUEST_FORMAT,
      version:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION,
      ...input,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (
      !isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest(
        request
      )
    ) {
      return fail();
    }
    return request;
  };

export const isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest =
  (
    value: unknown
  ): value is AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest => {
    if (
      !exact(
        value,
        value &&
          typeof value === 'object' &&
          'operation' in value &&
          value.operation === 'create'
          ? [
              'format',
              'version',
              'operation',
              'registrationRequest',
              'program',
              'material',
              'requestDigest',
            ]
          : [
              'format',
              'version',
              'operation',
              'claimReceipt',
              'resourceId',
              'resourceRole',
              'requestDigest',
            ]
      )
    ) {
      return false;
    }
    const request =
      value as AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest;
    const { requestDigest, ...base } = request;
    if (
      request.format !==
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_REQUEST_FORMAT ||
      request.version !==
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION ||
      !isAgentCanonicalDigest(requestDigest) ||
      requestDigest !== digestAgentCanonicalValue(base)
    ) {
      return false;
    }
    if (request.operation === 'create') {
      const material = isAgentCapabilityProbeProgram(request.program)
        ? resolveAgentCapabilityProbePublicResource(request.program)
        : null;
      return (
        isAgentHostedRetrievalRuntimeResourceRegistrationRequest(
          request.registrationRequest
        ) &&
        material !== null &&
        sameCanonicalJson(material, request.material) &&
        request.registrationRequest.probeProgramDigest ===
          request.program.programDigest &&
        request.registrationRequest.publicResourceDescriptorDigest ===
          request.material.descriptor.descriptorDigest
      );
    }
    return (
      request.operation === 'delete' &&
      isAgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt(
        request.claimReceipt
      ) &&
      isAgentControlIdentity(request.resourceId) &&
      (request.resourceRole === 'auxiliary' ||
        request.resourceRole === 'primary') &&
      (request.resourceRole === 'primary'
        ? request.resourceId ===
          request.claimReceipt.registrationResult.authority.providerResourceId
        : request.claimReceipt.registrationResult.authority.auxiliaryResourceIds.includes(
            request.resourceId
          ))
    );
  };

const createResponse = (
  request: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest,
  evidence: Response['evidence']
): Response => {
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RESPONSE_FORMAT,
    version:
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION,
    operation: request.operation,
    requestDigest: request.requestDigest,
    evidence,
  });
  return Object.freeze({
    ...base,
    responseDigest: digestAgentCanonicalValue(base),
  });
};

const isResponse = (
  value: unknown,
  request: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest
): value is Response => {
  if (
    !exact(value, [
      'format',
      'version',
      'operation',
      'requestDigest',
      'evidence',
      'responseDigest',
    ])
  )
    return false;
  const response = value as Response;
  const { responseDigest, ...base } = response;
  return (
    response.format ===
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RESPONSE_FORMAT &&
    response.version ===
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_VERSION &&
    response.operation === request.operation &&
    response.requestDigest === request.requestDigest &&
    responseDigest === digestAgentCanonicalValue(base) &&
    (request.operation === 'create'
      ? validCreationEvidence(response.evidence)
      : validDeletionEvidence(response.evidence))
  );
};

const tokenMatches = (
  authorization: string | undefined,
  token: string
): boolean => {
  if (authorization === undefined || !authorization.startsWith('Bearer '))
    return false;
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(token, 'utf8');
  try {
    return (
      supplied.byteLength === expected.byteLength &&
      timingSafeEqual(supplied, expected)
    );
  } finally {
    supplied.fill(0);
    expected.fill(0);
  }
};

const readBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const source of request) {
    const chunk = Buffer.isBuffer(source) ? source : Buffer.from(source);
    length += chunk.byteLength;
    if (
      length >
      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MAXIMUM_BYTES
    ) {
      throw new TypeError('request-too-large');
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try {
    const text = decoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== text) throw new TypeError('non-canonical');
    return value;
  } finally {
    bytes.fill(0);
    chunks.forEach((chunk) => chunk.fill(0));
  }
};

const writeJson = (
  response: ServerResponse,
  status: number,
  value: unknown
): void => {
  const body = canonicalJsonText(value);
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(encoder.encode(body).byteLength),
  });
  response.end(body);
};

export type ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar =
  Readonly<{
    listen(): Promise<
      Readonly<{
        baseUrl: typeof AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL;
        close(): Promise<void>;
      }>
    >;
  }>;

export const createProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar =
  (input: {
    provider: ProductionAgentEvaluationHostedRetrievalRuntimeResourceProvider;
    serviceToken: string;
    role: 'cleanup' | 'prepare' | 'recovery';
    namespaceId: string;
    lifecycleOwnerInstanceId: string;
    clock?: () => Date;
  }): ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecar => {
    if (
      !isAgentEvaluationServiceToken(input.serviceToken) ||
      !['cleanup', 'prepare', 'recovery'].includes(input.role) ||
      !isAgentControlIdentity(input.namespaceId) ||
      !isAgentControlIdentity(input.lifecycleOwnerInstanceId) ||
      typeof input.provider?.snapshot !== 'function' ||
      typeof input.provider.recoverUnfinished !== 'function'
    )
      return fail();
    const clock = input.clock ?? (() => new Date());
    const now = (): Instant => {
      const value = clock();
      return Number.isFinite(value.getTime())
        ? (value.toISOString() as Instant)
        : fail();
    };
    let server: Server | undefined;
    return Object.freeze({
      async listen() {
        if (server !== undefined) return fail();
        server = createServer(async (request, response) => {
          try {
            if (
              !tokenMatches(request.headers.authorization, input.serviceToken)
            ) {
              response.writeHead(401, { 'cache-control': 'no-store' });
              response.end();
              return;
            }
            if (
              request.method === 'GET' &&
              request.url ===
                AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_ROUTE
            ) {
              const snapshot = await input.provider.snapshot();
              if (
                input.role !== 'recovery' &&
                (snapshot.unfinishedMutationCount !== 0 ||
                  snapshot.overdueMutationCount !== 0)
              ) {
                response.writeHead(503, { 'cache-control': 'no-store' });
                response.end();
                return;
              }
              writeJson(
                response,
                200,
                createHealth({
                  role: input.role,
                  namespaceId: input.namespaceId,
                  lifecycleOwnerInstanceId: input.lifecycleOwnerInstanceId,
                  snapshot,
                  checkedAt: now(),
                })
              );
              return;
            }
            if (
              request.method === 'GET' &&
              request.url ===
                AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_ROUTE
            ) {
              const snapshot = await input.provider.snapshot();
              writeJson(response, 200, createSnapshot(snapshot, now()));
              return;
            }
            if (
              request.method === 'POST' &&
              request.url ===
                AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RECOVER_UNFINISHED_ROUTE
            ) {
              if (input.role !== 'recovery') {
                response.writeHead(403, { 'cache-control': 'no-store' });
                response.end();
                return;
              }
              writeJson(
                response,
                200,
                createSnapshot(await input.provider.recoverUnfinished(), now())
              );
              return;
            }
            if (
              request.method === 'POST' &&
              request.url ===
                AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_CLOSE_ROUTE
            ) {
              writeJson(response, 200, await input.provider.close());
              return;
            }
            if (
              request.method !== 'POST' ||
              request.url !==
                AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_ROUTE
            ) {
              response.writeHead(404, { 'cache-control': 'no-store' });
              response.end();
              return;
            }
            const value = await readBody(request);
            if (
              !isAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest(
                value
              )
            ) {
              throw new TypeError('invalid-request');
            }
            const evidence =
              value.operation === 'create'
                ? await input.provider.createResource({
                    request: value.registrationRequest,
                    program: value.program,
                    material: value.material,
                    signal: AbortSignal.timeout(
                      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS
                    ),
                  })
                : await input.provider.deleteResource({
                    claimReceipt: value.claimReceipt,
                    resourceId: value.resourceId,
                    resourceRole: value.resourceRole,
                    signal: AbortSignal.timeout(
                      AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS
                    ),
                  });
            writeJson(response, 200, createResponse(value, evidence));
          } catch {
            response.writeHead(503, { 'cache-control': 'no-store' });
            response.end();
          }
        });
        await new Promise<void>((resolve, reject) => {
          server!.once('error', reject);
          server!.listen(
            { host: '127.0.0.1', port: 8791, exclusive: true },
            () => {
              server!.removeListener('error', reject);
              resolve();
            }
          );
        });
        return Object.freeze({
          baseUrl: AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL,
          close: async () => {
            await new Promise<void>((resolve, reject) =>
              server!.close((error) => (error ? reject(error) : resolve()))
            );
          },
        });
      },
    });
  };

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient =
  AgentEvaluationHostedRetrievalRuntimeResourceProvider &
    Readonly<{
      readHealth(): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth>;
      readSnapshot(): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot>;
      recoverUnfinished(): Promise<ProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot>;
    }>;

export const createEnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient =
  (input: {
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
  }): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleProviderClient => {
    const read = readEnvironment(input.environment ?? process.env);
    if (
      read(AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.baseUrl) !==
      AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL
    )
      return fail();
    const token = read(
      AGENT_EVALUATION_OWNER_AUTHORITY_ENVIRONMENT_NAMES.serviceToken
    );
    if (!isAgentEvaluationServiceToken(token)) return fail();
    const fetcher = input.fetch ?? globalThis.fetch;
    let acceptedSessionCount = 0;
    let completedSessionCount = 0;
    let closed = false;
    const invoke = async (
      request: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest
    ): Promise<Response> => {
      if (closed) return fail();
      acceptedSessionCount += 1;
      try {
        const response = await fetcher(
          `${AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL}${AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_ROUTE}`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json; charset=utf-8',
              accept: 'application/json',
            },
            body: canonicalJsonText(request),
            redirect: 'error',
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(
              AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS
            ),
          }
        );
        if (response.status !== 200) return fail();
        const text = await response.text();
        const value = JSON.parse(text) as unknown;
        return canonicalJsonText(value) === text && isResponse(value, request)
          ? value
          : fail();
      } finally {
        completedSessionCount += 1;
      }
    };
    const readProjection = async <T>(input: {
      route: string;
      guard(value: unknown): value is T;
    }): Promise<T> => {
      const response = await fetcher(
        `${AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL}${input.route}`,
        {
          method: 'GET',
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/json',
          },
          redirect: 'error',
          cache: 'no-store',
          credentials: 'omit',
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (response.status !== 200) return fail();
      const text = await response.text();
      if (
        encoder.encode(text).byteLength >
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MAXIMUM_BYTES
      ) {
        return fail();
      }
      const value = JSON.parse(text) as unknown;
      return canonicalJsonText(value) === text && input.guard(value)
        ? value
        : fail();
    };
    return Object.freeze({
      async createResource({ request, program, material, signal }) {
        if (signal.aborted) return fail();
        const value = await invoke(
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest(
            {
              operation: 'create',
              registrationRequest: request,
              program,
              material,
            }
          )
        );
        return validCreationEvidence(value.evidence) ? value.evidence : fail();
      },
      async deleteResource({ claimReceipt, resourceId, resourceRole, signal }) {
        if (signal.aborted) return fail();
        const value = await invoke(
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarRequest(
            {
              operation: 'delete',
              claimReceipt,
              resourceId,
              resourceRole,
            }
          )
        );
        return validDeletionEvidence(value.evidence) ? value.evidence : fail();
      },
      readHealth() {
        return readProjection({
          route:
            AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_HEALTH_ROUTE,
          guard:
            isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarHealth,
        });
      },
      readSnapshot() {
        return readProjection({
          route:
            AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_SNAPSHOT_ROUTE,
          guard:
            isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot,
        });
      },
      async recoverUnfinished() {
        if (closed) return fail();
        const response = await fetcher(
          `${AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL}${AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_RECOVER_UNFINISHED_ROUTE}`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              accept: 'application/json',
            },
            body: '',
            redirect: 'error',
            cache: 'no-store',
            credentials: 'omit',
            signal: AbortSignal.timeout(
              AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MUTATION_TIMEOUT_MS
            ),
          }
        );
        if (response.status !== 200) return fail();
        const text = await response.text();
        if (
          encoder.encode(text).byteLength >
          AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_MAXIMUM_BYTES
        ) {
          return fail();
        }
        const value = JSON.parse(text) as unknown;
        return canonicalJsonText(value) === text &&
          isProductionAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSidecarSnapshot(
            value
          )
          ? value
          : fail();
      },
      async close() {
        closed = true;
        const response = await fetcher(
          `${AGENT_EVALUATION_OWNER_AUTHORITY_DEFAULT_BASE_URL}${AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SIDECAR_CLOSE_ROUTE}`,
          {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` },
            body: '',
            redirect: 'error',
            cache: 'no-store',
            credentials: 'omit',
          }
        );
        if (response.status !== 200) return fail();
        const value = JSON.parse(await response.text()) as Awaited<
          ReturnType<
            AgentEvaluationHostedRetrievalRuntimeResourceProvider['close']
          >
        >;
        if (
          value.status !== 'clean' ||
          value.inFlightSessionCount !== 0 ||
          value.acceptedSessionCount < acceptedSessionCount ||
          value.completedSessionCount < completedSessionCount ||
          !isAgentCanonicalDigest(value.receiptDigest)
        )
          return fail();
        return value;
      },
    });
  };
