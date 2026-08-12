import { describe, expect, it, vi } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import type { AgentEvaluationControlledWorkspaceCheckpoint } from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
} from './ownerState';
import type {
  AgentEvaluationOwnerStateListPage,
  AgentEvaluationOwnerStateMetadata,
  AgentEvaluationOwnerStateQueryClient,
  AgentEvaluationOwnerStateReadResult,
} from './ownerStateQueryClient';
import {
  createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority,
  PRODUCTION_AGENT_EVALUATION_MAXIMUM_ORPHAN_FACTS,
  PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES,
} from './productionControlledWorkspaceOwnerRead';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const namespaceId = 'evaluation.controlled-owner-read';
const planDigest = digest('controlled-owner-read-plan');
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const updatedAt = '2026-08-09T07:00:00.000Z';

const checkpoint = (
  label: string,
  predecessorCheckpointDigest?: CanonicalDigest
): AgentEvaluationControlledWorkspaceCheckpoint => {
  const base = Object.freeze({
    checkpointRef: `checkpoint.${label}`,
    attemptId: `attempt.${label}`,
    grantDigest: digest(`grant:${label}`),
    generation: 1,
    ...(predecessorCheckpointDigest ? { predecessorCheckpointDigest } : {}),
    snapshotDigest: digest(`snapshot:${label}`),
    securePersistenceReceiptDigest: digest(`persistence:${label}`),
  });
  return Object.freeze({ ...base, checkpointDigest: digest(base) });
};

const durableStateFor = (
  label: string
): AgentEvaluationOwnerStateReadResult => {
  const initialCheckpoint = checkpoint(label);
  const currentCheckpoint = checkpoint(
    label,
    initialCheckpoint.checkpointDigest
  );
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 1,
  });
  const toolDefinitions = Object.freeze([]);
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const g3VerificationPlan = Object.freeze({ cells: Object.freeze([]) });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId: `attempt.${label}`,
    descriptorDigest: digest(`descriptor:${label}`),
    caseId: `case.${label}`,
    materialDigest: digest(`material:${label}`),
    fixtureDigest: digest(`fixture:${label}`),
    grantDigest: digest(`grant:${label}`),
    generation: 1,
    sessionId: `session.${label}`,
    isolationPolicyDigest: digest(`isolation:${label}`),
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
  }) satisfies AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
  const casArtifacts = Object.freeze([]);
  const operationBase = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation: 'session.load-or-reattach',
    routeBinding: 'sessions/load-or-reattach',
    requestDigest: digest(`request:${label}`),
    stageDigest: digest(`stage:${label}`),
    responseDigest: digest(`response:${label}`),
  });
  const recentOperations = Object.freeze([
    Object.freeze({
      ...operationBase,
      recordDigest: digest(operationBase),
    }),
  ]);
  const bundle = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: 'controlled-workspace' as const,
    namespaceId,
    planDigest,
    repositoryCommit,
    ownerStateId: digest(`owner-state:${label}`),
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: 'controlled-workspace' as const,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts,
    casArtifactSetDigest: digest(casArtifacts),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  }) satisfies AgentEvaluationOwnerStateBundle;
  const metadata = Object.freeze({
    ownerStateId: bundle.ownerStateId,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest: digest(bundle),
    snapshotKind: bundle.snapshotKind,
    snapshotDigest: bundle.snapshotDigest,
    snapshotState: snapshot.state,
    updatedAt,
  }) satisfies AgentEvaluationOwnerStateMetadata;
  return Object.freeze({
    ...metadata,
    serviceKind: 'controlled-workspace',
    operation: 'session.orphans.list',
    ownerStateBundle: bundle,
    responseDigest: digest({ metadata, bundle }),
  });
};

const metadataFor = (
  state: AgentEvaluationOwnerStateReadResult
): AgentEvaluationOwnerStateMetadata =>
  Object.freeze({
    ownerStateId: state.ownerStateId,
    ownerStateRevision: state.ownerStateRevision,
    ownerStateRootDigest: state.ownerStateRootDigest,
    snapshotKind: state.snapshotKind,
    snapshotDigest: state.snapshotDigest,
    snapshotState: state.snapshotState,
    updatedAt: state.updatedAt,
  });

const pageFor = (
  states: readonly AgentEvaluationOwnerStateMetadata[],
  cursor: CanonicalDigest | null = null,
  nextCursor: CanonicalDigest | null = null
): AgentEvaluationOwnerStateListPage =>
  Object.freeze({
    serviceKind: 'controlled-workspace',
    operation: 'session.orphans.list',
    cursor,
    states: Object.freeze([...states]),
    stateSetDigest: digest(states),
    nextCursor,
    responseDigest: digest({ states, cursor, nextCursor }),
  });

const request = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  serviceKind: 'controlled-workspace',
  mode: 'read',
  namespaceId,
  planDigest,
  repositoryCommit,
  operation: 'session.orphans.list',
  routeBinding: 'sessions/orphans/list',
  requestDigest: digest('controlled-owner-read-request'),
  claimGeneration: 0,
  payload: Object.freeze({}),
}) satisfies AgentEvaluationOwnerAuthorityRequest;

const queryFor = (
  state: AgentEvaluationOwnerStateReadResult,
  metadata: AgentEvaluationOwnerStateMetadata = metadataFor(state)
) => {
  const list = vi.fn(async () => pageFor([metadata]));
  const read = vi.fn(async () => state);
  const client = Object.freeze({
    list,
    read,
    async readArtifact() {
      throw new Error('CAS bytes are outside orphan projection.');
    },
  }) satisfies AgentEvaluationOwnerStateQueryClient;
  return { client, list, read };
};

describe('production controlled Workspace owner read authority', () => {
  it('rebuilds the exact orphan from durable owner state on every host read', async () => {
    const state = durableStateFor('cross-host');
    const query = queryFor(state);
    const ownerStateQueryFor = vi.fn(() => query.client);
    const authority =
      createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority({
        ownerStateQueryFor,
        forbiddenCanaries: () => Object.freeze(['forbidden-orphan-canary']),
      });

    const first = await authority.read(request);
    const second = await authority.read(request);
    const snapshot = state.ownerStateBundle.snapshot;
    if (
      snapshot.format !==
        AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT ||
      snapshot.currentCheckpoint === null
    ) {
      throw new Error('expected active controlled snapshot');
    }
    const base = Object.freeze({
      planDigest,
      attemptId: snapshot.attemptId,
      modelDescriptorDigest: snapshot.descriptorDigest,
      caseId: snapshot.caseId,
      materialDigest: snapshot.materialDigest,
      grantDigest: snapshot.grantDigest,
      generation: snapshot.generation,
      sessionId: snapshot.sessionId,
      currentCheckpoint: snapshot.currentCheckpoint,
    });
    const expected = Object.freeze({
      ...base,
      orphanReceiptDigest: digest(base),
    });

    expect(first).toEqual([expected]);
    expect(second).toEqual([expected]);
    expect(ownerStateQueryFor).toHaveBeenCalledTimes(2);
    expect(query.list).toHaveBeenCalledTimes(2);
    expect(query.read).toHaveBeenCalledTimes(2);
  });

  it('fails closed when list metadata races the exact bundle read', async () => {
    const state = durableStateFor('race');
    const query = queryFor(state, {
      ...metadataFor(state),
      ownerStateRootDigest: digest('stale-root'),
    });
    const authority =
      createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority({
        ownerStateQueryFor: () => query.client,
        forbiddenCanaries: () => Object.freeze(['forbidden-orphan-canary']),
      });

    await expect(authority.read(request)).rejects.toThrow(
      'owner-state-read-race'
    );
  });

  it('rejects truncated pagination and an attempt-scoped orphan query', async () => {
    const state = durableStateFor('pagination');
    const nextCursor = digest('next-owner-state-page');
    const list = vi.fn(async () =>
      pageFor([metadataFor(state)], null, nextCursor)
    );
    const client = Object.freeze({
      list,
      async read() {
        return state;
      },
      async readArtifact() {
        throw new Error('CAS bytes are outside orphan projection.');
      },
    }) satisfies AgentEvaluationOwnerStateQueryClient;
    const ownerStateQueryFor = vi.fn(() => client);
    const authority =
      createProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority({
        ownerStateQueryFor,
        forbiddenCanaries: () => Object.freeze(['forbidden-orphan-canary']),
      });

    await expect(authority.read(request)).rejects.toThrow(
      'owner-state-page-binding'
    );
    await expect(
      authority.read({ ...request, attemptId: 'attempt.out-of-scope' })
    ).rejects.toThrow('request-binding');
    expect(ownerStateQueryFor).toHaveBeenCalledTimes(1);
  });

  it('freezes the 14,040-state and 128-orphan production bounds', () => {
    expect(PRODUCTION_AGENT_EVALUATION_MAXIMUM_OWNER_STATES).toBe(14_040);
    expect(PRODUCTION_AGENT_EVALUATION_MAXIMUM_ORPHAN_FACTS).toBe(128);
  });
});
