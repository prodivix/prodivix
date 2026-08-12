import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
  createAgentEvaluationControlledWorkspaceServiceAcknowledgement,
  digestAgentEvaluationControlledWorkspaceServiceRequest,
  type AgentEvaluationControlledWorkspaceServiceOperation,
} from './controlledWorkspaceRuntimeService';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest,
  createAgentEvaluationControlledWorkspaceDirectStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import {
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_RESULT_FORMAT,
  PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
  createEnvironmentProductionControlledWorkspaceDirectAuthority,
  type ProductionControlledWorkspaceOrphanRetirementAuthority,
} from './productionControlledWorkspaceDirectAuthority';

const namespaceId = 'evaluation.namespace.controlled-direct';
const planDigest = digestAgentCanonicalValue('controlled-direct-plan');
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const token = 'controlled-direct-token-0123456789abcdef';
const outerOwnerImplementationDigest = digestAgentCanonicalValue(
  'controlled-direct-outer-owner'
);

const environment = (name: string): string | undefined => {
  switch (name) {
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl:
      return AGENT_EVALUATION_LEDGER_BASE_URL;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace:
      return namespaceId;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit:
      return repositoryCommit;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token:
      return token;
    default:
      return undefined;
  }
};

const response = (value: unknown): Response =>
  new Response(canonicalJsonText(value), {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const health = (
  implementationDigest = PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST
): Response =>
  response({
    format: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_HEALTH_FORMAT,
    version: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
    purpose: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
    status: 'ready',
    authorityId: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_ID,
    implementationDigest,
    maximumRequestBytes:
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_REQUEST_BYTES,
    maximumResponseBytes:
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_RESPONSE_BYTES,
    maximumFacts:
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_MAXIMUM_FACTS,
  });

const clean = () =>
  Promise.resolve(
    Object.freeze({
      status: 'clean' as const,
      residualResourceIds: Object.freeze([]) as readonly [],
      residualCanaryIds: Object.freeze([]) as readonly [],
    })
  );

const orphanRetirement = (
  fact: unknown,
  execute = vi.fn(async () => Object.freeze([fact])),
  reconstruct = vi.fn(async () => Object.freeze([fact])),
  close = clean
): ProductionControlledWorkspaceOrphanRetirementAuthority =>
  Object.freeze({ execute, reconstruct, close });

const requestFor = (
  operation: AgentEvaluationControlledWorkspaceServiceOperation,
  routeBinding: string,
  mode: 'execute' | 'read' | 'reconcile',
  payload: unknown,
  dispatchedFacts?: readonly unknown[]
): AgentEvaluationOwnerAuthorityRequest => {
  const inner = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
    version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
    operation,
    namespaceId,
    planDigest,
    repositoryCommit,
    payload,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: 1,
    serviceKind: 'controlled-workspace',
    mode,
    namespaceId,
    planDigest,
    repositoryCommit,
    operation,
    routeBinding,
    requestDigest:
      digestAgentEvaluationControlledWorkspaceServiceRequest(inner),
    claimGeneration: mode === 'read' ? 0 : 1,
    payload,
  } as const);
  if (mode === 'read') return base;
  const stageDigest = createAgentEvaluationControlledWorkspaceDirectStageDigest(
    base,
    outerOwnerImplementationDigest
  );
  return Object.freeze({
    ...base,
    ownerImplementationDigest: outerOwnerImplementationDigest,
    stageDigest,
    ...(mode === 'reconcile'
      ? {
          dispatchAckDigest:
            createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
              base,
              dispatchedFacts ?? Object.freeze([]),
              outerOwnerImplementationDigest,
              stageDigest
            ),
        }
      : {}),
  });
};

type DirectEnvelope = Readonly<{
  format: string;
  version: number;
  purpose: string;
  mode: 'execute' | 'read' | 'reconcile';
  request: Readonly<{
    operation: AgentEvaluationControlledWorkspaceServiceOperation;
    requestDigest: CanonicalDigest;
  }>;
  ownerResultFacts: readonly unknown[] | null;
  ownerImplementationDigest: CanonicalDigest | null;
  stageDigest: CanonicalDigest | null;
  dispatchAckDigest: CanonicalDigest | null;
  requestDigest: CanonicalDigest;
}>;

const successfulFetch = (captured: DirectEnvelope[]): typeof fetch =>
  vi.fn(async (source: string | URL | Request, init?: RequestInit) => {
    const url = String(source);
    const headers = new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
    expect(headers.get('X-Prodivix-Controlled-Workspace-Owner-Purpose')).toBe(
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE
    );
    if (url.endsWith('/health')) {
      expect(init?.method).toBe('GET');
      return health();
    }
    expect(init?.method).toBe('POST');
    const envelope = JSON.parse(String(init?.body)) as DirectEnvelope;
    captured.push(envelope);
    expect(headers.get('Idempotency-Key')).toBe(envelope.requestDigest);
    const facts =
      envelope.ownerResultFacts ??
      Object.freeze([
        Object.freeze({
          operation: envelope.request.operation,
          sealed: true,
        }),
      ]);
    const inner =
      createAgentEvaluationControlledWorkspaceServiceAcknowledgement({
        format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
        version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
        operation: envelope.request.operation,
        requestDigest: envelope.request.requestDigest,
        facts,
      });
    const dispatchAckDigest =
      envelope.mode === 'read'
        ? null
        : createAgentEvaluationControlledWorkspaceDirectDispatchAckDigest(
            {
              serviceKind: 'controlled-workspace',
              operation: envelope.request.operation,
              routeBinding: Object.entries({
                'operation.claim': 'operations/claim',
                'operation.dispatch': 'operations/dispatch',
                'session.orphan.destroy': 'sessions/orphans/destroy',
              }).find(
                ([operation]) => operation === envelope.request.operation
              )![1],
              namespaceId,
              planDigest,
              repositoryCommit,
              requestDigest: envelope.request.requestDigest,
            },
            facts,
            envelope.ownerImplementationDigest!,
            envelope.stageDigest!
          );
    return response({
      format: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_RESULT_FORMAT,
      version: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_VERSION,
      purpose: PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_PURPOSE,
      mode: envelope.mode,
      requestDigest: envelope.requestDigest,
      facts,
      receiptDigest: inner.receiptDigest,
      ownerImplementationDigest: envelope.ownerImplementationDigest,
      stageDigest: envelope.stageDigest,
      dispatchAckDigest,
      ...(envelope.mode === 'reconcile' ? { reconciled: true } : {}),
    });
  }) as typeof fetch;

describe('production Controlled Workspace direct authority', () => {
  it('pins health and writes an exact purpose envelope to the direct 8790 ledger', async () => {
    expect(
      PRODUCTION_CONTROLLED_WORKSPACE_DIRECT_AUTHORITY_IMPLEMENTATION_DIGEST
    ).toBe(
      'sha256-04ba8faf3ff8ad0794ef9e7543d956c9c6e03b70f75cf7f4270b242e40321fb5'
    );
    const captured: DirectEnvelope[] = [];
    const source = orphanRetirement(Object.freeze({}));
    const fetch = successfulFetch(captured);
    const authority =
      await createEnvironmentProductionControlledWorkspaceDirectAuthority({
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        orphanRetirement: source,
        fetch,
      });
    const payload = Object.freeze({ intent: 'bounded-operation' });
    const request = requestFor(
      'operation.claim',
      'operations/claim',
      'execute',
      payload
    );

    await expect(authority.execute(request)).resolves.toEqual([
      { operation: 'operation.claim', sealed: true },
    ]);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      request: {
        operation: 'operation.claim',
        namespaceId,
        planDigest,
        repositoryCommit,
        payload,
        requestDigest: request.requestDigest,
      },
      ownerResultFacts: null,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(authority.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
  });

  it('uses the same sealed request for cross-host ACK reconciliation', async () => {
    const captured: DirectEnvelope[] = [];
    const authority =
      await createEnvironmentProductionControlledWorkspaceDirectAuthority({
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        orphanRetirement: orphanRetirement(Object.freeze({})),
        fetch: successfulFetch(captured),
      });
    const payload = Object.freeze({ intent: 'ack-loss' });
    const executed = requestFor(
      'operation.dispatch',
      'operations/dispatch',
      'execute',
      payload
    );
    const reconciled = Object.freeze({
      ...requestFor(
        'operation.dispatch',
        'operations/dispatch',
        'reconcile',
        payload,
        Object.freeze([
          Object.freeze({ operation: 'operation.dispatch', sealed: true }),
        ])
      ),
    });

    await authority.execute(executed);
    await expect(authority.reconcile(reconciled)).resolves.toMatchObject({
      reconciled: true,
    });
    expect(captured).toHaveLength(2);
    expect(captured[1]).toMatchObject({
      mode: 'reconcile',
      request: captured[0]!.request,
      ownerResultFacts: captured[0]!.ownerResultFacts,
      requestDigest: captured[0]!.requestDigest,
      ownerImplementationDigest: captured[0]!.ownerImplementationDigest,
      stageDigest: captured[0]!.stageDigest,
    });
    expect(captured[1]!.dispatchAckDigest).toBeTruthy();
  });

  it('separates first orphan retirement from zero-execution reconstruction', async () => {
    const cleanupBase = Object.freeze({
      attemptId: 'attempt.controlled-direct',
      grantDigest: digestAgentCanonicalValue('controlled-direct-grant'),
      generation: 1,
      sessionId: 'session.controlled-direct',
      reason: 'orphaned',
      cleanupIntentDigest: digestAgentCanonicalValue('cleanup-intent'),
      cleanupDispatchReceiptDigest:
        digestAgentCanonicalValue('cleanup-dispatch'),
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
      residualReferenceCount: 0,
    });
    const cleanup = Object.freeze({
      ...cleanupBase,
      cleanupReceiptDigest: digestAgentCanonicalValue(cleanupBase),
    });
    const execute = vi.fn(async () => Object.freeze([cleanup]));
    const reconstruct = vi.fn(async () => Object.freeze([cleanup]));
    const captured: DirectEnvelope[] = [];
    const authority =
      await createEnvironmentProductionControlledWorkspaceDirectAuthority({
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        orphanRetirement: orphanRetirement(cleanup, execute, reconstruct),
        fetch: successfulFetch(captured),
      });
    const payload = Object.freeze({
      orphan: Object.freeze({
        attemptId: cleanup.attemptId,
        grantDigest: cleanup.grantDigest,
        generation: cleanup.generation,
        sessionId: cleanup.sessionId,
      }),
      cleanupIntentDigest: cleanup.cleanupIntentDigest,
      cleanupDispatchReceiptDigest: cleanup.cleanupDispatchReceiptDigest,
      idempotencyKey: 'cleanup.controlled-direct',
    });
    const first = requestFor(
      'session.orphan.destroy',
      'sessions/orphans/destroy',
      'execute',
      payload
    );
    const replay = requestFor(
      'session.orphan.destroy',
      'sessions/orphans/destroy',
      'reconcile',
      payload,
      Object.freeze([cleanup])
    );

    await authority.execute(first);
    await authority.reconcile(replay);
    expect(execute).toHaveBeenCalledOnce();
    expect(reconstruct).toHaveBeenCalledOnce();
    expect(captured[0]?.ownerResultFacts).toEqual([cleanup]);
    expect(captured[1]).toMatchObject({
      mode: 'reconcile',
      request: captured[0]!.request,
      ownerResultFacts: captured[0]!.ownerResultFacts,
      requestDigest: captured[0]!.requestDigest,
      ownerImplementationDigest: captured[0]!.ownerImplementationDigest,
      stageDigest: captured[0]!.stageDigest,
    });
  });

  it('fails closed before any operation when the Backend implementation drifts', async () => {
    const fetch = vi.fn(async () =>
      health(digestAgentCanonicalValue('controlled-direct-drift'))
    );
    await expect(
      createEnvironmentProductionControlledWorkspaceDirectAuthority({
        environment,
        forbiddenCanaries: () => Object.freeze([]),
        orphanRetirement: orphanRetirement(Object.freeze({})),
        fetch,
      })
    ).rejects.toThrow('health');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retires the orphan authority when environment validation fails before probe', async () => {
    const close = vi.fn(clean);
    const fetch = vi.fn();
    await expect(
      createEnvironmentProductionControlledWorkspaceDirectAuthority({
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([]),
        orphanRetirement: orphanRetirement(
          Object.freeze({}),
          undefined,
          undefined,
          close
        ),
        fetch: fetch as typeof globalThis.fetch,
      })
    ).rejects.toThrow('environment');
    expect(fetch).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
