import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  createAgentEvaluationOwnerStateIdentity,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
} from './ownerState';
import {
  AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_CAS_READ_RESPONSE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_READ_RESPONSE_FORMAT,
  createEnvironmentAgentEvaluationOwnerStateQueryClient,
} from './ownerStateQueryClient';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const namespaceId = 'evaluation.owner-state-query';
const planDigest = digest('owner-state-query-plan');
const token = 'ledger-token-value-0123456789-abcdef';
const updatedAt = '2026-08-09T06:00:00.000Z';

const identity = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  namespaceId,
  planDigest,
  repositoryCommit,
  attemptId: 'attempt.owner-state-query',
  descriptorDigest: digest('owner-state-query-descriptor'),
  generation: 1,
  grantOrAuthorityDigest: digest('owner-state-query-grant'),
}) satisfies AgentEvaluationOwnerStateIdentityInput;

const createOperationRecord = () => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation: 'session.load-or-reattach',
    routeBinding: 'sessions/load-or-reattach',
    requestDigest: digest('owner-state-query-request'),
    stageDigest: digest('owner-state-query-stage'),
    responseDigest: digest('owner-state-query-response'),
  });
  return Object.freeze({ ...base, recordDigest: digest(base) });
};

const createBundle = (): AgentEvaluationOwnerStateBundle => {
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 1,
  });
  const toolDefinitions = Object.freeze([
    Object.freeze({ toolId: 'tool.owner-state-query' }),
  ]);
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const g3VerificationPlan = Object.freeze({
    format: 'prodivix.verification-plan',
    cells: Object.freeze([]),
  });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const initialCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-query.initial',
    attemptId: identity.attemptId,
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    snapshotDigest: digest('owner-state-query-initial-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-query-initial-persistence'
    ),
  });
  const initialCheckpoint = Object.freeze({
    ...initialCheckpointBase,
    checkpointDigest: digest(initialCheckpointBase),
  });
  const currentCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-query.current',
    attemptId: identity.attemptId,
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
    snapshotDigest: digest('owner-state-query-current-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-query-current-persistence'
    ),
  });
  const currentCheckpoint = Object.freeze({
    ...currentCheckpointBase,
    checkpointDigest: digest(currentCheckpointBase),
  });
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId: identity.attemptId,
    descriptorDigest: identity.descriptorDigest,
    caseId: 'case.owner-state-query',
    materialDigest: digest('owner-state-query-material'),
    fixtureDigest: digest('owner-state-query-fixture'),
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    sessionId: 'session.owner-state-query',
    isolationPolicyDigest: digest('owner-state-query-isolation'),
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
  const recentOperations = Object.freeze([createOperationRecord()]);
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: identity.serviceKind,
    namespaceId,
    planDigest,
    repositoryCommit,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: identity.serviceKind,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts,
    casArtifactSetDigest: digest(casArtifacts),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
};

const metadataFor = (bundle: AgentEvaluationOwnerStateBundle) =>
  Object.freeze({
    ownerStateId: bundle.ownerStateId,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest: digest(bundle),
    snapshotKind: bundle.snapshotKind,
    snapshotDigest: bundle.snapshotDigest,
    snapshotState: bundle.snapshot.state,
    updatedAt,
  });

const listResponseFor = (bundle: AgentEvaluationOwnerStateBundle) => {
  const states = Object.freeze([metadataFor(bundle)]);
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: 'controlled-workspace' as const,
    operation: 'session.orphans.list' as const,
    cursor: null,
    states,
    stateSetDigest: digest(states),
    nextCursor: null,
  });
  return Object.freeze({ ...base, responseDigest: digest(base) });
};

const readResponseFor = (bundle: AgentEvaluationOwnerStateBundle) => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_READ_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: 'controlled-workspace' as const,
    operation: 'session.orphans.list' as const,
    ...metadataFor(bundle),
    ownerStateBundle: bundle,
  });
  return Object.freeze({ ...base, responseDigest: digest(base) });
};

const descriptorFor = (
  content: Uint8Array,
  artifactRef = 'artifact.owner-state-query'
): AgentEvaluationOwnerStateCASDescriptor => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    artifactRef,
    artifactKind: 'controlled-checkpoint',
    mediaType: 'application/octet-stream',
    artifactDigest: digestBytes(content),
    byteLength: content.byteLength,
    casReceiptDigest: digest(`owner-state-query-cas-receipt:${artifactRef}`),
  });
  return Object.freeze({ ...base, descriptorDigest: digest(base) });
};

const withDescriptor = (
  bundle: AgentEvaluationOwnerStateBundle,
  descriptor: AgentEvaluationOwnerStateCASDescriptor
): AgentEvaluationOwnerStateBundle => {
  const casArtifacts = Object.freeze([descriptor]);
  return Object.freeze({
    ...bundle,
    casArtifacts,
    casArtifactSetDigest: digest(casArtifacts),
  });
};

const casReadResponseFor = (
  bundle: AgentEvaluationOwnerStateBundle,
  descriptor: AgentEvaluationOwnerStateCASDescriptor,
  content: Uint8Array
) => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_READ_RESPONSE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: 'controlled-workspace' as const,
    operation: 'session.orphans.list' as const,
    ownerStateId: bundle.ownerStateId,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest: digest(bundle),
    descriptor,
    contentBase64: Buffer.from(content).toString('base64'),
  });
  return Object.freeze({ ...base, responseDigest: digest(base) });
};

const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const response = (value: unknown) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

describe('production owner-state bounded query client', () => {
  it('lists metadata then reads and revalidates the exact durable bundle', async () => {
    const bundle = createBundle();
    const pendingResponses = [
      response(listResponseFor(bundle)),
      response(readResponseFor(bundle)),
    ];
    const observedAuthorization: (string | null)[] = [];
    const fetchImplementation = vi.fn<typeof fetch>(async (_url, request) => {
      observedAuthorization.push(
        new Headers(request?.headers).get('authorization')
      );
      const next = pendingResponses.shift();
      if (!next) throw new Error('unexpected query');
      return next;
    });
    const client = createEnvironmentAgentEvaluationOwnerStateQueryClient({
      namespaceId,
      planDigest,
      repositoryCommit,
      forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
      environment,
      fetch: fetchImplementation,
    });
    const binding = Object.freeze({
      serviceKind: 'controlled-workspace' as const,
      operation: 'session.orphans.list' as const,
    });

    const page = await client.list(binding, { limit: 32 });
    const restored = await client.read(binding, bundle.ownerStateId);

    expect(page.states).toEqual([metadataFor(bundle)]);
    expect(restored.ownerStateBundle).toEqual(bundle);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const [listUrl, listRequest] = fetchImplementation.mock.calls[0]!;
    const [readUrl, readRequest] = fetchImplementation.mock.calls[1]!;
    expect(String(listUrl)).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/owner-states?serviceKind=controlled-workspace&operation=session.orphans.list&limit=32`
    );
    expect(String(readUrl)).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/owner-states/${bundle.ownerStateId}?serviceKind=controlled-workspace&operation=session.orphans.list`
    );
    for (const request of [listRequest, readRequest]) {
      expect(request?.method).toBe('GET');
      expect(request?.body).toBeUndefined();
      expect(request?.cache).toBe('no-store');
      expect(request?.credentials).toBe('omit');
    }
    expect(observedAuthorization).toEqual([
      `Bearer ${token}`,
      `Bearer ${token}`,
    ]);
  });

  it('rejects an outer root swap even when the response self-digest is recomputed', async () => {
    const bundle = createBundle();
    const valid = readResponseFor(bundle);
    const { responseDigest: _responseDigest, ...base } = valid;
    const tamperedBase = Object.freeze({
      ...base,
      ownerStateRootDigest: digest('swapped-owner-state-root'),
    });
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      response(
        Object.freeze({
          ...tamperedBase,
          responseDigest: digest(tamperedBase),
        })
      )
    );
    const client = createEnvironmentAgentEvaluationOwnerStateQueryClient({
      namespaceId,
      planDigest,
      repositoryCommit,
      forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      client.read(
        {
          serviceKind: 'controlled-workspace',
          operation: 'session.orphans.list',
        },
        bundle.ownerStateId
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('reads exact current-bundle CAS bytes and rejects content or descriptor swaps', async () => {
    const content = new TextEncoder().encode('durable checkpoint bytes');
    const descriptor = descriptorFor(content);
    const bundle = withDescriptor(createBundle(), descriptor);
    const pendingResponses = [
      response(readResponseFor(bundle)),
      response(casReadResponseFor(bundle, descriptor, content)),
    ];
    const fetchImplementation = vi.fn<typeof fetch>(async () => {
      const next = pendingResponses.shift();
      if (!next) throw new Error('unexpected query');
      return next;
    });
    const client = createEnvironmentAgentEvaluationOwnerStateQueryClient({
      namespaceId,
      planDigest,
      repositoryCommit,
      forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
      environment,
      fetch: fetchImplementation,
    });
    const binding = Object.freeze({
      serviceKind: 'controlled-workspace' as const,
      operation: 'session.orphans.list' as const,
    });
    const state = await client.read(binding, bundle.ownerStateId);
    const artifact = await client.readArtifact(binding, state, descriptor);

    expect(artifact.content).toEqual(content);
    expect(String(fetchImplementation.mock.calls[1]![0])).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/owner-state-cas/${bundle.ownerStateId}?serviceKind=controlled-workspace&operation=session.orphans.list&artifactRef=${descriptor.artifactRef}&descriptorDigest=${descriptor.descriptorDigest}`
    );

    const swappedDescriptor = descriptorFor(content, 'artifact.swapped');
    await expect(
      client.readArtifact(binding, state, swappedDescriptor)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);

    const swappedContent = new TextEncoder().encode('swapped checkpoint');
    const swappedBase = {
      ...casReadResponseFor(bundle, descriptor, content),
      contentBase64: Buffer.from(swappedContent).toString('base64'),
      responseDigest: undefined,
    };
    const { responseDigest: _responseDigest, ...responseBase } = swappedBase;
    const swappedClient = createEnvironmentAgentEvaluationOwnerStateQueryClient(
      {
        namespaceId,
        planDigest,
        repositoryCommit,
        forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
        environment,
        fetch: vi.fn<typeof fetch>(async () =>
          response(
            Object.freeze({
              ...responseBase,
              responseDigest: digest(responseBase),
            })
          )
        ),
      }
    );
    await expect(
      swappedClient.readArtifact(binding, state, descriptor)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
  });

  it('scans decoded CAS bytes so base64 cannot conceal a dynamic canary', async () => {
    const content = new TextEncoder().encode('owner-state-canary-value');
    const descriptor = descriptorFor(content, 'artifact.canary');
    const bundle = withDescriptor(createBundle(), descriptor);
    const pendingResponses = [
      response(readResponseFor(bundle)),
      response(casReadResponseFor(bundle, descriptor, content)),
    ];
    const client = createEnvironmentAgentEvaluationOwnerStateQueryClient({
      namespaceId,
      planDigest,
      repositoryCommit,
      forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
      environment,
      fetch: vi.fn<typeof fetch>(async () => {
        const next = pendingResponses.shift();
        if (!next) throw new Error('unexpected query');
        return next;
      }),
    });
    const binding = Object.freeze({
      serviceKind: 'controlled-workspace' as const,
      operation: 'session.orphans.list' as const,
    });
    const state = await client.read(binding, bundle.ownerStateId);

    await expect(
      client.readArtifact(binding, state, descriptor)
    ).rejects.toThrow('forbidden Secret or holdout canary');
  });

  it('rejects an unsorted metadata page and a mismatched service-operation pair before dispatch', async () => {
    const first = createBundle();
    const secondSnapshot = Object.freeze({
      ...first.snapshot,
      attemptId: 'attempt.owner-state-query.second',
      snapshotDigest: undefined,
    });
    const { snapshotDigest: _snapshotDigest, ...secondSnapshotBase } =
      secondSnapshot;
    const secondIdentity = Object.freeze({
      ...identity,
      attemptId: secondSnapshotBase.attemptId,
    });
    const secondBundleBase = Object.freeze({
      ...first,
      ownerStateId: createAgentEvaluationOwnerStateIdentity(secondIdentity),
      snapshot: Object.freeze({
        ...secondSnapshotBase,
        snapshotDigest: digest(secondSnapshotBase),
      }),
    });
    const secondBundle = Object.freeze({
      ...secondBundleBase,
      snapshotDigest: secondBundleBase.snapshot.snapshotDigest,
    });
    const states = Object.freeze(
      [metadataFor(first), metadataFor(secondBundle)].sort((left, right) =>
        compareUnicodeCodePoints(right.ownerStateId, left.ownerStateId)
      )
    );
    const listBase = Object.freeze({
      format: AGENT_EVALUATION_OWNER_STATE_LIST_RESPONSE_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      serviceKind: 'controlled-workspace' as const,
      operation: 'session.orphans.list' as const,
      cursor: null,
      states,
      stateSetDigest: digest(states),
      nextCursor: null,
    });
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      response(Object.freeze({ ...listBase, responseDigest: digest(listBase) }))
    );
    const client = createEnvironmentAgentEvaluationOwnerStateQueryClient({
      namespaceId,
      planDigest,
      repositoryCommit,
      forbiddenCanaries: () => Object.freeze(['owner-state-canary-value']),
      environment,
      fetch: fetchImplementation,
    });

    await expect(
      client.list(
        {
          serviceKind: 'controlled-workspace',
          operation: 'session.orphans.list',
        },
        { limit: 2 }
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    await expect(
      client.list(
        {
          serviceKind: 'controlled-workspace',
          operation: 'verified-view.resolve',
        } as never,
        { limit: 1 }
      )
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid,
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });
});
