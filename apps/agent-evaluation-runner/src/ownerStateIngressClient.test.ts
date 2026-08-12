import { afterEach, describe, expect, it, vi } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  createAgentEvaluationOwnerStateIdentity,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateIdentityInput,
} from './ownerState';
import {
  AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_RESPONSE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_CAS_RECEIPT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_RESPONSE_FORMAT,
  createEnvironmentAgentEvaluationOwnerStateIngressClient,
} from './ownerStateIngressClient';

const token = 'owner-state-service-token-'.padEnd(40, 'x');
const commit = 'c'.repeat(40);
const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const namespaceId = 'evaluation.namespace.owner-state-ingress';
const planDigest = digest('owner-state-ingress-plan');
const forbiddenCanary = 'forbidden-owner-state-canary';

const environment = Object.freeze({
  PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL: 'http://127.0.0.1:8790',
  PRODIVIX_G4_MODEL_EVAL_NAMESPACE: namespaceId,
  PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT: commit,
  PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN: token,
});

const identity = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  namespaceId,
  planDigest,
  repositoryCommit: commit,
  attemptId: 'evaluation-attempt.owner-state-ingress',
  descriptorDigest: digest('owner-state-ingress-descriptor'),
  generation: 2,
  grantOrAuthorityDigest: digest('owner-state-ingress-grant'),
});
const operation = 'session.load-or-reattach';
const routeBinding = 'sessions/load-or-reattach';
const requestDigest = digest('owner-state-ingress-request');
const ownerImplementationDigest = digest('owner-state-ingress-owner');
const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
const stageDigest = digestAgentEvaluationOwnerStateStage({
  serviceKind: identity.serviceKind,
  operation,
  routeBinding,
  requestDigest,
  ownerImplementationDigest,
  ownerStateId,
  priorOwnerStateRevision: 0,
  priorOwnerStateRootDigest: null,
});
const loadedPublicResult = Object.freeze({
  status: 'loaded',
  sessionId: 'controlled-session.owner-state-ingress',
});

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(canonicalJsonText(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const createBundle = (
  identityInput: AgentEvaluationOwnerStateIdentityInput = identity
): AgentEvaluationOwnerStateBundle => {
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 7,
  });
  const toolDefinitions = Object.freeze([]);
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const g3VerificationPlan = Object.freeze({ cells: Object.freeze([]) });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const initialCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-ingress.initial',
    attemptId: identityInput.attemptId,
    grantDigest: identityInput.grantOrAuthorityDigest,
    generation: identityInput.generation,
    snapshotDigest: digest('owner-state-ingress-initial-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-ingress-initial-persistence'
    ),
  });
  const initialCheckpoint = Object.freeze({
    ...initialCheckpointBase,
    checkpointDigest: digest(initialCheckpointBase),
  });
  const currentCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-ingress.current',
    attemptId: identityInput.attemptId,
    grantDigest: identityInput.grantOrAuthorityDigest,
    generation: identityInput.generation,
    predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
    snapshotDigest: digest('owner-state-ingress-current-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-ingress-current-persistence'
    ),
  });
  const currentCheckpoint = Object.freeze({
    ...currentCheckpointBase,
    checkpointDigest: digest(currentCheckpointBase),
  });
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: identityInput.namespaceId,
    planDigest: identityInput.planDigest,
    repositoryCommit: identityInput.repositoryCommit,
    attemptId: identityInput.attemptId,
    descriptorDigest: identityInput.descriptorDigest,
    caseId: 'case.owner-state-ingress',
    materialDigest: digest('owner-state-ingress-material'),
    fixtureDigest: digest('owner-state-ingress-fixture'),
    grantDigest: identityInput.grantOrAuthorityDigest,
    generation: identityInput.generation,
    sessionId: 'controlled-session.owner-state-ingress',
    isolationPolicyDigest: digest('owner-state-ingress-isolation'),
    revision: 1,
    state: 'active' as const,
    initialCheckpoint,
    initialCheckpointDigest: initialCheckpoint.checkpointDigest,
    currentCheckpoint,
    currentCheckpointDigest: currentCheckpoint.checkpointDigest,
    workspaceSnapshot,
    workspaceSnapshotDigest: digest(workspaceSnapshot),
    toolDefinitions,
    toolDefinitionSetDigest: digest(toolDefinitions),
    actionRegistry,
    actionRegistryDigest: digest(actionRegistry),
    g3VerificationPlan,
    verificationPlanDigest: digest(g3VerificationPlan),
    adapterRegistry,
    adapterRegistryDigest: digest(adapterRegistry),
    finalWorkspaceSnapshotDigest: null,
    artifactDescriptors,
    artifactDescriptorSetDigest: digest(artifactDescriptors),
    finalAuthorityReceiptDigest: null,
    cleanupReceiptDigest: null,
  });
  const snapshot = Object.freeze({
    ...snapshotBase,
    snapshotDigest: digest(snapshotBase),
  });
  const casArtifacts = Object.freeze([]);
  const operationBase = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation,
    routeBinding,
    requestDigest,
    stageDigest,
    responseDigest: digest(loadedPublicResult),
  });
  const recentOperations = Object.freeze([
    Object.freeze({
      ...operationBase,
      recordDigest: digest(operationBase),
    }),
  ]);
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: identityInput.serviceKind,
    namespaceId: identityInput.namespaceId,
    planDigest: identityInput.planDigest,
    repositoryCommit: identityInput.repositoryCommit,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(identityInput),
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: identityInput.serviceKind,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts,
    casArtifactSetDigest: digest(casArtifacts),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
};

afterEach(() => vi.restoreAllMocks());

describe('owner state ingress client', () => {
  it('uploads exact CAS bytes and verifies the acyclic final descriptor receipt', async () => {
    const seen: Array<
      Readonly<{
        url: string;
        body: Record<string, unknown>;
        init: RequestInit;
      }>
    > = [];
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        seen.push(Object.freeze({ url: String(input), body, init: init! }));
        const casReceiptDigest = digest({
          format: AGENT_EVALUATION_OWNER_STATE_CAS_RECEIPT_FORMAT,
          version: 1,
          serviceKind: body.serviceKind,
          requestDigest: body.requestDigest,
          ownerImplementationDigest: body.ownerImplementationDigest,
          stageDigest: body.stageDigest,
          ownerStateId: body.ownerStateId,
          artifactIdentityDigest: body.artifactIdentityDigest,
          uploadDigest: body.uploadDigest,
        });
        const descriptorBase = Object.freeze({
          format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
          version: 1,
          artifactRef: body.artifactRef,
          artifactKind: body.artifactKind,
          mediaType: body.mediaType,
          artifactDigest: body.artifactDigest,
          byteLength: body.byteLength,
          casReceiptDigest,
        });
        return jsonResponse({
          format: AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_RESPONSE_FORMAT,
          version: 1,
          uploadDigest: body.uploadDigest,
          descriptor: {
            ...descriptorBase,
            descriptorDigest: digest(descriptorBase),
          },
          replayed: false,
        });
      }
    );
    const client = createEnvironmentAgentEvaluationOwnerStateIngressClient({
      namespaceId,
      planDigest,
      repositoryCommit: commit,
      environment,
      fetch: fetchMock as typeof fetch,
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });
    const content = new TextEncoder().encode('canonical artifact bytes');
    const descriptor = await client.uploadArtifact({
      serviceKind: identity.serviceKind,
      requestDigest,
      ownerImplementationDigest,
      stageDigest,
      ownerStateId,
      artifactRef: 'artifact.owner-state-ingress',
      artifactKind: 'controlled-workspace-checkpoint',
      mediaType: 'application/octet-stream',
      content,
    });
    expect(descriptor.byteLength).toBe(content.byteLength);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toContain('/owner-state-cas');
    expect(new Headers(seen[0]!.init.headers).get('Idempotency-Key')).toBe(
      seen[0]!.body.uploadDigest
    );
    expect(seen[0]!.init.cache).toBe('no-store');
    expect(seen[0]!.init.credentials).toBe('omit');
    expect(seen[0]!.body).not.toHaveProperty('descriptorDigest');
  });

  it('commits a transition before returning and replays an ambiguous 503 with identical bytes', async () => {
    const calls: Array<
      Readonly<{ body: string; idempotencyKey: string | null }>
    > = [];
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const bodyText = String(init?.body);
        const body = JSON.parse(bodyText) as Record<string, unknown>;
        calls.push(
          Object.freeze({
            body: bodyText,
            idempotencyKey: new Headers(init?.headers).get('Idempotency-Key'),
          })
        );
        if (calls.length === 1) return jsonResponse({ status: 'retry' }, 503);
        const sealedBase = Object.freeze({
          format: 'prodivix.agent-evaluation-sealed-owner-operation',
          version: 1,
          serviceKind: body.serviceKind,
          operation: body.operation,
          routeBinding: body.routeBinding,
          requestDigest: body.requestDigest,
          ownerImplementationDigest: body.ownerImplementationDigest,
          ownerStateId: ownerStateId,
          priorOwnerStateRevision: body.priorOwnerStateRevision,
          priorOwnerStateRootDigest: body.priorOwnerStateRootDigest,
          stageDigest: body.stageDigest,
          publicResult: body.publicResult,
          responseDigest: body.responseDigest,
          ownerStateRevision: body.ownerStateRevision,
          ownerStateRootDigest: body.ownerStateRootDigest,
          dispatchAckDigest: body.dispatchAckDigest,
        });
        return jsonResponse({
          format: AGENT_EVALUATION_OWNER_STATE_RESULT_INGRESS_RESPONSE_FORMAT,
          version: 1,
          ingressDigest: body.ingressDigest,
          resultReceiptDigest: digest(sealedBase),
          ownerStateRevision: body.ownerStateRevision,
          ownerStateRootDigest: body.ownerStateRootDigest,
          replayed: true,
        });
      }
    );
    const client = createEnvironmentAgentEvaluationOwnerStateIngressClient({
      namespaceId,
      planDigest,
      repositoryCommit: commit,
      environment,
      fetch: fetchMock as typeof fetch,
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });
    const publicResult = loadedPublicResult;
    const transition = await client.commitTransition({
      identity,
      operation,
      routeBinding,
      requestDigest,
      ownerImplementationDigest,
      priorOwnerStateRevision: 0,
      priorOwnerStateRootDigest: null,
      stageDigest,
      publicResult,
      ownerStateBundle: createBundle(),
    });
    expect(transition.publicResult).toEqual(publicResult);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]!.idempotencyKey).toBe(
      (JSON.parse(calls[0]!.body) as Record<string, unknown>).ingressDigest
    );
  });

  it('rejects a bundle whose current operation record drifts before result ingress', async () => {
    const fetchMock = vi.fn();
    const client = createEnvironmentAgentEvaluationOwnerStateIngressClient({
      namespaceId,
      planDigest,
      repositoryCommit: commit,
      environment,
      fetch: fetchMock as typeof fetch,
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });
    const bundle = createBundle();
    const current = bundle.recentOperations.at(-1)!;
    const operationBase = Object.freeze({
      format: current.format,
      version: current.version,
      sequence: current.sequence,
      operation: current.operation,
      routeBinding: current.routeBinding,
      requestDigest: current.requestDigest,
      stageDigest: current.stageDigest,
      responseDigest: digest('drifted-owner-state-response'),
    });
    const recentOperations = Object.freeze([
      Object.freeze({
        ...operationBase,
        recordDigest: digest(operationBase),
      }),
    ]);
    await expect(
      client.commitTransition({
        identity,
        operation,
        routeBinding,
        requestDigest,
        ownerImplementationDigest,
        priorOwnerStateRevision: 0,
        priorOwnerStateRootDigest: null,
        stageDigest,
        publicResult: loadedPublicResult,
        ownerStateBundle: Object.freeze({
          ...bundle,
          recentOperations,
          recentOperationSetDigest: digest(recentOperations),
        }),
      })
    ).rejects.toMatchObject({
      code: 'G4_RUNNER_RESPONSE_INVALID',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a swapped CAS receipt and scans dynamic canaries before dispatch', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const descriptorBase = Object.freeze({
          format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
          version: 1,
          artifactRef: body.artifactRef,
          artifactKind: body.artifactKind,
          mediaType: body.mediaType,
          artifactDigest: body.artifactDigest,
          byteLength: body.byteLength,
          casReceiptDigest: digest('swapped-cas-receipt'),
        });
        return jsonResponse({
          format: AGENT_EVALUATION_OWNER_STATE_CAS_INGRESS_RESPONSE_FORMAT,
          version: 1,
          uploadDigest: body.uploadDigest,
          descriptor: {
            ...descriptorBase,
            descriptorDigest: digest(descriptorBase),
          },
          replayed: false,
        });
      }
    );
    const client = createEnvironmentAgentEvaluationOwnerStateIngressClient({
      namespaceId,
      planDigest,
      repositoryCommit: commit,
      environment,
      fetch: fetchMock as typeof fetch,
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });
    await expect(
      client.uploadArtifact({
        serviceKind: identity.serviceKind,
        requestDigest,
        ownerImplementationDigest,
        stageDigest,
        ownerStateId,
        artifactRef: 'artifact.owner-state-swapped',
        artifactKind: 'controlled-workspace-checkpoint',
        mediaType: 'application/octet-stream',
        content: new TextEncoder().encode('safe artifact'),
      })
    ).rejects.toThrow(/G4_RUNNER_RESPONSE_INVALID/u);

    fetchMock.mockClear();
    await expect(
      client.uploadArtifact({
        serviceKind: identity.serviceKind,
        requestDigest,
        ownerImplementationDigest,
        stageDigest,
        ownerStateId,
        artifactRef: 'artifact.owner-state-canary',
        artifactKind: 'controlled-workspace-checkpoint',
        mediaType: 'application/octet-stream',
        content: new TextEncoder().encode(forbiddenCanary),
      })
    ).rejects.toThrow(/forbidden Secret or holdout canary/u);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
