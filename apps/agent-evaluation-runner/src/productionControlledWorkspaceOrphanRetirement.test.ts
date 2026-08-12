import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createAgentEvaluationControlledWorkspaceGrant,
  validateAgentEvaluationControlledWorkspaceMaterial,
  type AgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspaceOrphanSession,
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
  digestAgentEvaluationControlledWorkspaceServiceRequest,
} from './controlledWorkspaceRuntimeService';
import {
  AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  createAgentEvaluationOwnerStateIdentity,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStatePrior,
  type AgentEvaluationOwnerStateTransition,
} from './ownerState';
import type {
  AgentEvaluationOwnerStateCASArtifactInput,
  AgentEvaluationOwnerStateIngressClient,
} from './ownerStateIngressClient';
import type {
  AgentEvaluationOwnerStateCASReadResult,
  AgentEvaluationOwnerStateQueryClient,
  AgentEvaluationOwnerStateReadResult,
} from './ownerStateQueryClient';
import {
  createProductionControlledWorkspaceOwnerStateSnapshot,
  type ProductionControlledWorkspaceSessionProjection,
} from './productionControlledWorkspaceSessionEngine';
import { createProductionControlledWorkspaceOrphanRetirementAuthority } from './productionControlledWorkspaceOrphanRetirement';
import {
  createProductionControlledWorkspaceTransactionSessionAuthority,
  type ProductionControlledWorkspaceTransactionG3Authority,
} from './productionControlledWorkspaceTransactionSessionAuthority';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import {
  PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
  createProductionAgentEvaluationOwnerStateBundle,
  type OwnerStateExecutionContext,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const namespaceId = 'namespace.production-orphan-retirement';
const planDigest = digest('production-orphan-retirement-plan');
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const attemptId = 'attempt.production-orphan-retirement';
const descriptorDigest = digest('production-orphan-retirement-descriptor');
const isolationPolicyDigest = digest('production-orphan-retirement-isolation');

const materialFixture = (): Readonly<{
  material: AgentEvaluationCaseMaterial;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
}> => {
  for (const material of getG4V8PublicEvaluationCaseMaterials()) {
    const block = material.invocation.blocks.find(
      (candidate) => candidate.kind === 'workspace-fixture'
    );
    if (
      block?.kind === 'workspace-fixture' &&
      block.fixture.expectedOutcome.proposal.status === 'ready' &&
      block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
    ) {
      return Object.freeze({ material, fixture: block.fixture });
    }
  }
  throw new TypeError('Missing orphan retirement Workspace material.');
};

const grantFor = (
  material: AgentEvaluationCaseMaterial,
  fixture: AgentEvaluationWorkspaceFixtureMaterial
): AgentEvaluationControlledWorkspaceGrant => {
  const validated = validateAgentEvaluationControlledWorkspaceMaterial(
    material,
    { caseId: material.caseId, materialDigest: material.materialDigest }
  );
  return createAgentEvaluationControlledWorkspaceGrant({
    grantId: 'grant.production-orphan-retirement',
    authorityId: 'authority.production-orphan-retirement',
    planDigest,
    attemptId,
    descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    fixtureDigest: fixture.fixtureDigest,
    baseSnapshotDigest: fixture.workspaceSnapshotDigest,
    toolRegistryDigest: validated.toolRegistryDigest,
    actionRegistryDigest: validated.actionRegistryDigest,
    allowedToolIds: material.invocation.tools.map(({ toolId }) => toolId),
    allowedActionIds: fixture.actionRegistry.map(({ actionId }) => actionId),
    allowedTargetRefs: fixture.targetRefs,
    generation: 1,
    maximumUses: 16,
    issuedAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-09T00:30:00.000Z',
  });
};

const descriptorFor = (input: {
  artifactRef: string;
  artifactKind: string;
  mediaType: string;
  content: Uint8Array;
}): AgentEvaluationOwnerStateCASDescriptor => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    artifactRef: input.artifactRef,
    artifactKind: input.artifactKind,
    mediaType: input.mediaType,
    artifactDigest: digestBytes(input.content),
    byteLength: input.content.byteLength,
    casReceiptDigest: digest({
      kind: 'production-orphan-retirement-cas',
      artifactRef: input.artifactRef,
      artifactDigest: digestBytes(input.content),
    }),
  });
  return Object.freeze({ ...base, descriptorDigest: digest(base) });
};

const g3Authority = (): ProductionControlledWorkspaceTransactionG3Authority =>
  Object.freeze({
    async evaluate() {
      throw new TypeError('Orphan retirement must not run G3.');
    },
    async close() {
      return Object.freeze({
        status: 'clean' as const,
        residualResourceIds: Object.freeze([]) as readonly [],
        residualCanaryIds: Object.freeze([]) as readonly [],
      });
    },
  });

const loadContext = (
  identity: AgentEvaluationOwnerStateIdentityInput
): OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot> =>
  ({
    identity,
    previousSnapshot: null,
    previousBundle: null,
    prior: Object.freeze({
      ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
      revision: 0,
      bundle: null,
      rootDigest: null,
    }),
    nextRevision: 1,
    request: Object.freeze({
      operation: 'session.load-or-reattach',
      routeBinding: 'sessions/load-or-reattach',
      requestDigest: digest('production-orphan-load-request'),
    }),
    stageDigest: digest('production-orphan-load-stage'),
  }) as OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;

type DurableHarness = Readonly<{
  query: AgentEvaluationOwnerStateQueryClient;
  ingress: AgentEvaluationOwnerStateIngressClient;
  commit: ReturnType<typeof vi.fn>;
  current(): AgentEvaluationOwnerStateReadResult;
}>;

const durableHarness = (input: {
  identity: AgentEvaluationOwnerStateIdentityInput;
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
  projection: ProductionControlledWorkspaceSessionProjection;
  loadRequest: AgentEvaluationOwnerAuthorityRequest;
}): DurableHarness => {
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(input.identity);
  const rootDigest = digest('production-orphan-owner-state-root.1');
  const contents = new Map<string, Uint8Array>();
  const initialDescriptors = input.projection.casArtifacts.map((artifact) => {
    contents.set(artifact.artifactRef, Uint8Array.from(artifact.content));
    return descriptorFor(artifact);
  });
  const prior: AgentEvaluationOwnerStatePrior = Object.freeze({
    ownerStateId,
    revision: 0,
    bundle: null,
    rootDigest: null,
  });
  const initialBundle = createProductionAgentEvaluationOwnerStateBundle({
    identity: input.identity,
    prior,
    request: input.loadRequest,
    stageDigest: input.loadRequest.stageDigest!,
    publicResult: Object.freeze({ facts: Object.freeze([]) }),
    snapshot: input.snapshot,
    casArtifacts: initialDescriptors,
  });
  let currentRoot = rootDigest;
  let currentBundle: AgentEvaluationOwnerStateBundle = initialBundle;
  const current = (): AgentEvaluationOwnerStateReadResult =>
    Object.freeze({
      serviceKind: 'controlled-workspace' as const,
      operation: 'session.orphans.list' as const,
      ownerStateId,
      ownerStateRevision: currentBundle.revision,
      ownerStateRootDigest: currentRoot,
      snapshotKind: 'controlled-workspace' as const,
      snapshotDigest: currentBundle.snapshotDigest,
      snapshotState: (
        currentBundle.snapshot as AgentEvaluationControlledWorkspaceOwnerStateSnapshot
      ).state,
      updatedAt: '2026-08-09T00:01:00.000Z',
      ownerStateBundle: currentBundle,
      responseDigest: digest({
        ownerStateId,
        revision: currentBundle.revision,
        rootDigest: currentRoot,
      }),
    });
  const query: AgentEvaluationOwnerStateQueryClient = Object.freeze({
    async list() {
      throw new TypeError('Orphan retirement performs an identity-bound read.');
    },
    async read(
      _binding: Parameters<AgentEvaluationOwnerStateQueryClient['read']>[0],
      requestedOwnerStateId: Parameters<
        AgentEvaluationOwnerStateQueryClient['read']
      >[1]
    ) {
      if (requestedOwnerStateId !== ownerStateId) {
        throw new TypeError('Owner state id drifted.');
      }
      return current();
    },
    async readArtifact(
      _binding: Parameters<
        AgentEvaluationOwnerStateQueryClient['readArtifact']
      >[0],
      ownerState: Parameters<
        AgentEvaluationOwnerStateQueryClient['readArtifact']
      >[1],
      descriptor: Parameters<
        AgentEvaluationOwnerStateQueryClient['readArtifact']
      >[2]
    ) {
      const content = contents.get(descriptor.artifactRef);
      if (
        ownerState.ownerStateRootDigest !== currentRoot ||
        !content ||
        digestBytes(content) !== descriptor.artifactDigest
      ) {
        throw new TypeError('CAS read binding drifted.');
      }
      return Object.freeze({
        serviceKind: 'controlled-workspace' as const,
        operation: 'session.orphans.list' as const,
        ownerStateId,
        ownerStateRevision: ownerState.ownerStateRevision,
        ownerStateRootDigest: ownerState.ownerStateRootDigest,
        descriptor,
        content: Uint8Array.from(content),
        responseDigest: digest({
          descriptorDigest: descriptor.descriptorDigest,
        }),
      }) satisfies AgentEvaluationOwnerStateCASReadResult;
    },
  });
  const commit = vi.fn(
    async (
      commitInput: Parameters<
        AgentEvaluationOwnerStateIngressClient['commitTransition']
      >[0]
    ): Promise<AgentEvaluationOwnerStateTransition> => {
      currentBundle = commitInput.ownerStateBundle;
      currentRoot = digest({
        priorRoot: currentRoot,
        bundle: currentBundle,
      });
      return {
        serviceKind: 'controlled-workspace',
        operation: commitInput.operation,
        routeBinding: commitInput.routeBinding,
        requestDigest: commitInput.requestDigest,
        ownerImplementationDigest: commitInput.ownerImplementationDigest,
        ownerStateId,
        priorOwnerStateRevision: commitInput.priorOwnerStateRevision,
        priorOwnerStateRootDigest: commitInput.priorOwnerStateRootDigest,
        stageDigest: commitInput.stageDigest,
        publicResult: commitInput.publicResult,
        responseDigest: digest(commitInput.publicResult),
        ownerStateRevision: currentBundle.revision,
        ownerStateRootDigest: currentRoot,
        dispatchAckDigest: digest('production-orphan-dispatch-ack'),
        resultReceiptDigest: digest('production-orphan-result-receipt'),
        ownerStateBundle: currentBundle,
      } as AgentEvaluationOwnerStateTransition;
    }
  );
  const ingress: AgentEvaluationOwnerStateIngressClient = Object.freeze({
    async uploadArtifact(
      artifact: AgentEvaluationOwnerStateCASArtifactInput
    ): Promise<AgentEvaluationOwnerStateCASDescriptor> {
      const content = Uint8Array.from(artifact.content);
      contents.set(artifact.artifactRef, content);
      return descriptorFor({ ...artifact, content });
    },
    commitTransition: commit,
  });
  return Object.freeze({ query, ingress, commit, current });
};

const orphanDestroyRequest = (
  orphan: AgentEvaluationControlledWorkspaceOrphanSession,
  mode: 'execute' | 'reconcile'
): AgentEvaluationOwnerAuthorityRequest => {
  const payload = Object.freeze({
    orphan,
    cleanupIntentDigest: digest('production-orphan-cleanup-intent'),
    cleanupDispatchReceiptDigest: digest('production-orphan-cleanup-dispatch'),
    idempotencyKey: 'cleanup.production-orphan-retirement',
  });
  const inner = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_FORMAT,
    version: AGENT_EVALUATION_CONTROLLED_WORKSPACE_SERVICE_VERSION,
    operation: 'session.orphan.destroy' as const,
    namespaceId,
    planDigest,
    repositoryCommit,
    payload,
  });
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
    serviceKind: 'controlled-workspace',
    mode,
    namespaceId,
    planDigest,
    repositoryCommit,
    operation: 'session.orphan.destroy',
    routeBinding: 'sessions/orphans/destroy',
    requestDigest:
      digestAgentEvaluationControlledWorkspaceServiceRequest(inner),
    claimGeneration: 1,
    payload,
  });
};

describe('production controlled Workspace orphan retirement', () => {
  it('seals the destroyed owner state before returning and reconstructs ACK-loss on another host with zero effect', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const identity: AgentEvaluationOwnerStateIdentityInput = Object.freeze({
      serviceKind: 'controlled-workspace',
      namespaceId,
      planDigest,
      repositoryCommit,
      attemptId,
      descriptorDigest,
      generation: grant.generation,
      grantOrAuthorityDigest: grant.grantDigest,
    });
    const sessions =
      createProductionControlledWorkspaceTransactionSessionAuthority({
        g3: g3Authority(),
        forbiddenCanaries: () => Object.freeze([]),
      });
    const loaded = await sessions.loadOrReattach({
      context: loadContext(identity),
      material,
      fixture,
      grant,
      isolationPolicyDigest,
      previousSnapshot: null,
      previousBundle: null,
      cas: Object.freeze({
        async use(): Promise<never> {
          throw new TypeError('Fresh load cannot read CAS.');
        },
      }),
    });
    const projection = await loaded.handle.capture();
    const loadRequest = Object.freeze({
      format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
      version: AGENT_EVALUATION_OWNER_AUTHORITY_VERSION,
      serviceKind: 'controlled-workspace' as const,
      mode: 'execute' as const,
      namespaceId,
      planDigest,
      repositoryCommit,
      operation: 'session.load-or-reattach',
      routeBinding: 'sessions/load-or-reattach',
      requestDigest: digest('production-orphan-load-request'),
      ownerImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
      stageDigest: digestAgentEvaluationOwnerStateStage({
        serviceKind: 'controlled-workspace',
        operation: 'session.load-or-reattach',
        routeBinding: 'sessions/load-or-reattach',
        requestDigest: digest('production-orphan-load-request'),
        ownerImplementationDigest:
          PRODUCTION_AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_IMPLEMENTATION_DIGEST,
        ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
        priorOwnerStateRevision: 0,
        priorOwnerStateRootDigest: null,
      }),
      claimGeneration: 1,
      payload: Object.freeze({}),
    });
    const initialContext = Object.freeze({
      ...loadContext(identity),
      request: loadRequest,
      stageDigest: loadRequest.stageDigest,
    });
    const snapshot = createProductionControlledWorkspaceOwnerStateSnapshot(
      initialContext,
      loaded.handle.session,
      projection,
      'active'
    );
    const durable = durableHarness({
      identity,
      snapshot,
      projection,
      loadRequest,
    });
    const orphanBase = Object.freeze({
      planDigest,
      attemptId,
      modelDescriptorDigest: descriptorDigest,
      caseId: material.caseId,
      materialDigest: material.materialDigest,
      grantDigest: grant.grantDigest,
      generation: grant.generation,
      sessionId: loaded.handle.session.sessionId,
      currentCheckpoint: loaded.handle.session.currentCheckpoint,
    });
    const orphan: AgentEvaluationControlledWorkspaceOrphanSession =
      Object.freeze({
        ...orphanBase,
        orphanReceiptDigest: digest(orphanBase),
      });
    const executeRequest = orphanDestroyRequest(orphan, 'execute');
    const retirement =
      createProductionControlledWorkspaceOrphanRetirementAuthority({
        sessions,
        ownerStateQueryFor: () => durable.query,
        createIngressClient: () => durable.ingress,
        forbiddenCanaries: () => Object.freeze([]),
      });
    const facts = await retirement.execute(executeRequest);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      reason: 'orphaned',
      sourceReferencesRevoked: true,
      sandboxDestroyed: true,
      residualReferenceCount: 0,
    });
    expect(durable.commit).toHaveBeenCalledOnce();
    expect(
      (
        durable.current().ownerStateBundle
          .snapshot as AgentEvaluationControlledWorkspaceOwnerStateSnapshot
      ).state
    ).toBe('destroyed');

    const otherHost =
      createProductionControlledWorkspaceOrphanRetirementAuthority({
        sessions,
        ownerStateQueryFor: () => durable.query,
        createIngressClient: () => {
          throw new TypeError('Reconcile cannot create ingress.');
        },
        forbiddenCanaries: () => Object.freeze([]),
      });
    await expect(
      otherHost.reconstruct(orphanDestroyRequest(orphan, 'reconcile'))
    ).resolves.toEqual(facts);
    expect(durable.commit).toHaveBeenCalledOnce();
  }, 60_000);

  it('rejects a forged orphan commitment before reading durable state', async () => {
    const query = Object.freeze({
      read: vi.fn(),
      list: vi.fn(),
      readArtifact: vi.fn(),
    }) as unknown as AgentEvaluationOwnerStateQueryClient;
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const checkpointBase = Object.freeze({
      checkpointRef: 'checkpoint.production-orphan-forged',
      attemptId,
      grantDigest: grant.grantDigest,
      generation: grant.generation,
      snapshotDigest: digest(fixture.workspaceSnapshot as WorkspaceSnapshot),
      securePersistenceReceiptDigest: digest('forged-checkpoint-persistence'),
    });
    const orphanBase = Object.freeze({
      planDigest,
      attemptId,
      modelDescriptorDigest: descriptorDigest,
      caseId: material.caseId,
      materialDigest: material.materialDigest,
      grantDigest: grant.grantDigest,
      generation: grant.generation,
      sessionId: 'session.production-orphan-forged',
      currentCheckpoint: Object.freeze({
        ...checkpointBase,
        checkpointDigest: digest(checkpointBase),
      }),
    });
    const forged = Object.freeze({
      ...orphanBase,
      orphanReceiptDigest: digest('forged-orphan-receipt'),
    });
    const retirement =
      createProductionControlledWorkspaceOrphanRetirementAuthority({
        sessions: Object.freeze({
          loadOrReattach: vi.fn(),
          restore: vi.fn(),
          close: vi.fn(),
        }),
        ownerStateQueryFor: () => query,
        createIngressClient: vi.fn(),
        forbiddenCanaries: () => Object.freeze([]),
      });
    await expect(
      retirement.execute(orphanDestroyRequest(forged, 'execute'))
    ).rejects.toThrow('orphan');
    expect(query.read).not.toHaveBeenCalled();
  });
});
