import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  G4_V8_WORKSPACE_ACTION_REGISTRY_IDENTITY,
  createAgentActionRegistrySnapshot,
  digestAgentCanonicalValue,
  getG4V8PublicEvaluationCaseMaterials,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { type WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createAgentEvaluationControlledWorkspaceGrant,
  validateAgentEvaluationControlledWorkspaceMaterial,
  type AgentEvaluationControlledWorkspaceCheckpoint,
  type AgentEvaluationControlledWorkspaceCleanupReceipt,
  type AgentEvaluationControlledWorkspaceGrant,
  type AgentEvaluationControlledWorkspacePreflightReceipt,
  type AgentEvaluationControlledWorkspaceSession,
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  createAgentEvaluationOwnerStateIdentity,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
  type AgentEvaluationOwnerStateIdentityInput,
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
  PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT,
  PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION,
  createProductionControlledWorkspaceSessionEngine,
  type ProductionControlledWorkspaceStatelessOwnerAuthority,
  type ProductionControlledWorkspaceSessionHandle,
  type ProductionControlledWorkspaceSessionProjection,
  type ProductionControlledWorkspaceTransactionSessionAuthority,
} from './productionControlledWorkspaceSessionEngine';
import type { ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority } from './productionControlledWorkspaceOwnerRead';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import type { OwnerStateExecutionContext } from './productionWorkspaceVerificationOwnerAuthorityPorts';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;
const namespaceId = 'evaluation.namespace.production-session-engine';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const planDigest = digest('production-session-engine-plan');
const descriptorDigest = digest('production-session-engine-descriptor');
const attemptId = 'attempt.production-session-engine';
const isolationPolicyDigest = digest('production-session-engine-isolation');
const forbiddenCanary = 'production-session-engine-forbidden-canary';
const publicMaterials = getG4V8PublicEvaluationCaseMaterials();

const materialFixture = (): Readonly<{
  material: AgentEvaluationCaseMaterial;
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
}> => {
  const material = publicMaterials.find((candidate) =>
    candidate.invocation.blocks.some(
      (block) =>
        block.kind === 'workspace-fixture' &&
        block.fixture.expectedOutcome.proposal.status === 'ready' &&
        block.fixture.expectedOutcome.transaction.expectedCommandCount > 0
    )
  );
  const block = material?.invocation.blocks.find(
    (candidate) => candidate.kind === 'workspace-fixture'
  );
  if (!material || block?.kind !== 'workspace-fixture') {
    throw new TypeError('Missing public controlled Workspace material.');
  }
  return Object.freeze({ material, fixture: block.fixture });
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
    grantId: 'grant.production-session-engine',
    authorityId: 'authority.production-session-engine',
    planDigest,
    attemptId,
    descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    fixtureDigest: fixture.fixtureDigest,
    baseSnapshotDigest: fixture.workspaceSnapshotDigest,
    toolRegistryDigest: validated.toolRegistryDigest,
    actionRegistryDigest: validated.actionRegistryDigest,
    allowedToolIds: Object.freeze(
      material.invocation.tools.map(({ toolId }) => toolId)
    ),
    allowedActionIds: Object.freeze(
      fixture.actionRegistry.map(({ actionId }) => actionId)
    ),
    allowedTargetRefs: fixture.targetRefs,
    generation: 1,
    maximumUses: 16,
    issuedAt: '2026-08-09T00:00:00.000Z',
    expiresAt: '2026-08-09T00:30:00.000Z',
  });
};

const actionRegistry = (() => {
  const descriptors = new Map(
    publicMaterials.flatMap((material) =>
      material.invocation.blocks.flatMap((block) =>
        block.kind === 'workspace-fixture'
          ? block.fixture.actionRegistry.map(
              (entry) =>
                [entry.descriptor.descriptorId, entry.descriptor] as const
            )
          : []
      )
    )
  );
  const registry = createAgentActionRegistrySnapshot(
    G4_V8_WORKSPACE_ACTION_REGISTRY_IDENTITY.registryId,
    [...descriptors.values()]
  );
  if (
    registry.registryDigest !==
    G4_V8_WORKSPACE_ACTION_REGISTRY_IDENTITY.registryDigest
  ) {
    throw new TypeError('Public Workspace action registry drifted.');
  }
  return registry;
})();

const checkpointBytes = (workspace: WorkspaceSnapshot): Uint8Array =>
  new TextEncoder().encode(
    canonicalJsonText(
      Object.freeze({
        format: PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_FORMAT,
        version: PRODUCTION_CONTROLLED_WORKSPACE_CHECKPOINT_ARTIFACT_VERSION,
        semanticSnapshotDigest: digest(workspace),
        workspaceSnapshot: workspace,
      })
    )
  );

const checkpoint = (
  grant: AgentEvaluationControlledWorkspaceGrant,
  snapshotDigest: CanonicalDigest,
  predecessorCheckpointDigest?: CanonicalDigest
): AgentEvaluationControlledWorkspaceCheckpoint => {
  const base = Object.freeze({
    checkpointRef: predecessorCheckpointDigest
      ? 'checkpoint.production-session-engine.current'
      : 'checkpoint.production-session-engine.initial',
    attemptId,
    grantDigest: grant.grantDigest,
    generation: grant.generation,
    ...(predecessorCheckpointDigest ? { predecessorCheckpointDigest } : {}),
    snapshotDigest,
    securePersistenceReceiptDigest: digest({
      kind: 'production-session-engine-checkpoint',
      snapshotDigest,
      predecessorCheckpointDigest: predecessorCheckpointDigest ?? null,
    }),
  });
  return Object.freeze({ ...base, checkpointDigest: digest(base) });
};

const descriptorFor = (
  input: AgentEvaluationOwnerStateCASArtifactInput
): AgentEvaluationOwnerStateCASDescriptor => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    artifactRef: input.artifactRef,
    artifactKind: input.artifactKind,
    mediaType: input.mediaType,
    artifactDigest: digestBytes(input.content),
    byteLength: input.content.byteLength,
    casReceiptDigest: digest({
      artifactRef: input.artifactRef,
      requestDigest: input.requestDigest,
    }),
  });
  return Object.freeze({ ...base, descriptorDigest: digest(base) });
};

type SessionHarness = Readonly<{
  session: AgentEvaluationControlledWorkspaceSession;
  handle: ProductionControlledWorkspaceSessionHandle;
  projection: ProductionControlledWorkspaceSessionProjection;
  setCASArtifacts(
    artifacts: ProductionControlledWorkspaceSessionProjection['casArtifacts']
  ): void;
  setCleanupReceiptDigest(value: CanonicalDigest): void;
}>;

const sessionHarness = (
  material: AgentEvaluationCaseMaterial,
  fixture: AgentEvaluationWorkspaceFixtureMaterial,
  grant: AgentEvaluationControlledWorkspaceGrant
): SessionHarness => {
  const workspaceSnapshot = fixture.workspaceSnapshot as WorkspaceSnapshot;
  const workspaceSnapshotDigest = digest(workspaceSnapshot);
  expect(workspaceSnapshotDigest).toBe(fixture.workspaceSnapshotDigest);
  const initialCheckpoint = checkpoint(grant, workspaceSnapshotDigest);
  let cleanupReceiptDigest: CanonicalDigest | null = null;
  let casArtifacts: ProductionControlledWorkspaceSessionProjection['casArtifacts'] =
    Object.freeze([
      Object.freeze({
        artifactRef: initialCheckpoint.checkpointRef,
        artifactKind: 'controlled-checkpoint',
        mediaType: 'application/json',
        semanticSnapshotDigest: workspaceSnapshotDigest,
        content: checkpointBytes(workspaceSnapshot),
      }),
    ]);
  const preflight = vi.fn(
    async (
      input: Parameters<
        AgentEvaluationControlledWorkspaceSession['preflight']
      >[0]
    ): Promise<AgentEvaluationControlledWorkspacePreflightReceipt> => {
      const tool = material.invocation.tools.find(
        ({ toolId }) => toolId === input.toolId
      );
      if (!tool) throw new TypeError('Unknown test tool.');
      const base = Object.freeze({
        toolId: input.toolId,
        argumentsDigest: input.argumentsDigest,
        grantDigest: input.grantDigest,
        generation: input.generation,
        status: 'ready' as const,
        effect: tool.effect,
        toolDefinitionDigest: tool.definitionDigest,
        inputSchemaDigest: digest(tool.inputSchema),
      });
      return Object.freeze({ ...base, preflightReceiptDigest: digest(base) });
    }
  );
  const destroy = vi.fn(
    async (
      input: Parameters<AgentEvaluationControlledWorkspaceSession['destroy']>[0]
    ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> => {
      const base = Object.freeze({
        attemptId,
        grantDigest: grant.grantDigest,
        generation: grant.generation,
        sessionId: 'session.production-session-engine',
        reason: input.reason,
        cleanupIntentDigest: input.cleanupIntentDigest,
        cleanupDispatchReceiptDigest: input.cleanupDispatchReceiptDigest,
        sourceReferencesRevoked: true as const,
        sandboxDestroyed: true as const,
        residualReferenceCount: 0 as const,
      });
      cleanupReceiptDigest = digest(base);
      return Object.freeze({ ...base, cleanupReceiptDigest });
    }
  );
  const session: AgentEvaluationControlledWorkspaceSession = Object.freeze({
    sessionId: 'session.production-session-engine',
    planDigest,
    attemptId,
    descriptorDigest,
    caseId: material.caseId,
    materialDigest: material.materialDigest,
    fixtureDigest: fixture.fixtureDigest,
    baseSnapshotDigest: fixture.workspaceSnapshotDigest,
    grantDigest: grant.grantDigest,
    toolRegistryDigest: grant.toolRegistryDigest,
    actionRegistryDigest: grant.actionRegistryDigest,
    generation: grant.generation,
    isolationPolicyDigest,
    initialCheckpoint,
    currentCheckpoint: initialCheckpoint,
    preflight,
    async restoreCheckpoint() {
      throw new Error('restoreCheckpoint is outside this test.');
    },
    async execute() {
      throw new Error('execute is outside this test.');
    },
    async reconcileDispatched() {
      throw new Error('reconcileDispatched is outside this test.');
    },
    async resolveArtifact() {
      throw new Error('resolveArtifact is outside this test.');
    },
    async assessFinal() {
      throw new Error('assessFinal is outside this test.');
    },
    destroy,
  });
  const projection = (): ProductionControlledWorkspaceSessionProjection =>
    Object.freeze({
      workspaceSnapshot,
      toolDefinitions: Object.freeze(
        [...material.invocation.tools].sort((left, right) =>
          compareUnicodeCodePoints(left.toolId, right.toolId)
        )
      ),
      actionRegistry,
      g3VerificationPlan: fixture.verificationFixture,
      adapterRegistry: fixture.verificationFixture.adapters,
      finalWorkspaceSnapshotDigest: null,
      artifactDescriptors: Object.freeze([]),
      finalAuthorityReceiptDigest: null,
      cleanupReceiptDigest,
      casArtifacts,
    });
  return Object.freeze({
    session,
    handle: Object.freeze({ session, capture: async () => projection() }),
    get projection() {
      return projection();
    },
    setCASArtifacts(artifacts) {
      casArtifacts = artifacts;
    },
    setCleanupReceiptDigest(value) {
      cleanupReceiptDigest = value;
    },
  });
};

const requestFor = (
  grant: AgentEvaluationControlledWorkspaceGrant,
  operation: string,
  payload: unknown,
  revision: number,
  sessionId?: string
): AgentEvaluationOwnerAuthorityRequest =>
  Object.freeze({
    format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
    version: 1,
    serviceKind: 'controlled-workspace',
    mode: 'execute',
    namespaceId,
    planDigest,
    repositoryCommit,
    operation,
    routeBinding: `controlled-workspace/${operation}`,
    ...(sessionId ? { sessionId } : {}),
    requestDigest: digest({ operation, revision }),
    attemptId,
    descriptorDigest,
    generation: grant.generation,
    controlledWorkspaceGrantDigest: grant.grantDigest,
    ownerStateRevision: revision,
    ownerStateBundle: null,
    ownerStateRootDigest: null,
    claimGeneration: 1,
    payload,
  });

const identityFor = (
  grant: AgentEvaluationControlledWorkspaceGrant
): AgentEvaluationOwnerStateIdentityInput =>
  Object.freeze({
    serviceKind: 'controlled-workspace',
    namespaceId,
    planDigest,
    repositoryCommit,
    attemptId,
    descriptorDigest,
    generation: grant.generation,
    grantOrAuthorityDigest: grant.grantDigest,
  });

const contextFor = (
  request: AgentEvaluationOwnerAuthorityRequest,
  identity: AgentEvaluationOwnerStateIdentityInput,
  ingress: AgentEvaluationOwnerStateIngressClient,
  previousBundle: AgentEvaluationOwnerStateBundle | null
): OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot> => {
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);
  const revision = previousBundle?.revision ?? 0;
  return Object.freeze({
    request,
    identity,
    prior: Object.freeze({
      ownerStateId,
      revision,
      bundle: previousBundle,
      rootDigest: previousBundle ? digest(previousBundle) : null,
    }),
    ownerStateId,
    nextRevision: revision + 1,
    stageDigest: digest({ operation: request.operation, revision }),
    ingress,
    previousBundle,
    previousSnapshot: previousBundle
      ? (previousBundle.snapshot as AgentEvaluationControlledWorkspaceOwnerStateSnapshot)
      : null,
  });
};

const operationRecord = (request: AgentEvaluationOwnerAuthorityRequest) => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation: request.operation,
    routeBinding: request.routeBinding,
    requestDigest: request.requestDigest,
    stageDigest: digest('production-session-engine-load-stage'),
    responseDigest: digest('production-session-engine-load-response'),
  });
  return Object.freeze({ ...base, recordDigest: digest(base) });
};

const bundleFor = (
  identity: AgentEvaluationOwnerStateIdentityInput,
  request: AgentEvaluationOwnerAuthorityRequest,
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  casArtifacts: readonly AgentEvaluationOwnerStateCASDescriptor[]
): AgentEvaluationOwnerStateBundle => {
  const recentOperations = Object.freeze([operationRecord(request)]);
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: 'controlled-workspace',
    namespaceId,
    planDigest,
    repositoryCommit,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
    revision: snapshot.revision,
    previousOwnerStateRootDigest: null,
    snapshotKind: 'controlled-workspace',
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts,
    casArtifactSetDigest: digest(casArtifacts),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
};

const readResultFor = (
  bundle: AgentEvaluationOwnerStateBundle
): AgentEvaluationOwnerStateReadResult =>
  Object.freeze({
    serviceKind: 'controlled-workspace',
    operation: 'session.orphans.list',
    ownerStateId: bundle.ownerStateId,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest: digest(bundle),
    snapshotKind: bundle.snapshotKind,
    snapshotDigest: bundle.snapshotDigest,
    snapshotState: bundle.snapshot.state,
    updatedAt: '2026-08-09T00:01:00.000Z',
    ownerStateBundle: bundle,
    responseDigest: digest({ kind: 'production-session-engine-read' }),
  });

const clean = () =>
  Promise.resolve(
    Object.freeze({
      status: 'clean' as const,
      residualResourceIds: Object.freeze([]) as readonly [],
      residualCanaryIds: Object.freeze([]) as readonly [],
    })
  );

const stateless = (): ProductionControlledWorkspaceStatelessOwnerAuthority =>
  Object.freeze({
    async read() {
      throw new Error('Stateless read is outside this test.');
    },
    async execute() {
      throw new Error('Stateless execute is outside this test.');
    },
    async reconcile() {
      throw new Error('Stateless reconcile is outside this test.');
    },
    close: clean,
  });

const orphanRead =
  (): ProductionAgentEvaluationControlledWorkspaceOwnerReadAuthority =>
    Object.freeze({
      async read() {
        throw new Error('Orphan read is outside this test.');
      },
    });

describe('production controlled Workspace session engine', () => {
  it('loads canonical material and emits a full checkpoint-bound snapshot plus durable CAS descriptor', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const harness = sessionHarness(material, fixture, grant);
    const uploads: AgentEvaluationOwnerStateCASArtifactInput[] = [];
    const ingress: AgentEvaluationOwnerStateIngressClient = Object.freeze({
      async uploadArtifact(input: AgentEvaluationOwnerStateCASArtifactInput) {
        const descriptor = descriptorFor(input);
        uploads.push(
          Object.freeze({ ...input, content: Uint8Array.from(input.content) })
        );
        return descriptor;
      },
      async commitTransition() {
        throw new Error('The outer owner port commits the transition.');
      },
    });
    const query: AgentEvaluationOwnerStateQueryClient = Object.freeze({
      async list() {
        throw new Error('Initial load has no durable state.');
      },
      async read() {
        throw new Error('Initial load has no durable state.');
      },
      async readArtifact() {
        throw new Error('Initial load has no durable state.');
      },
    });
    const load = vi.fn(async () =>
      Object.freeze({ status: 'loaded' as const, handle: harness.handle })
    );
    const sessions: ProductionControlledWorkspaceTransactionSessionAuthority =
      Object.freeze({
        loadOrReattach: load,
        async restore() {
          throw new Error('Restore is outside the initial load.');
        },
        close: clean,
      });
    const request = requestFor(
      grant,
      'session.load-or-reattach',
      Object.freeze({ material, fixture, grant, isolationPolicyDigest }),
      0
    );
    const engine = createProductionControlledWorkspaceSessionEngine({
      orphanRead: orphanRead(),
      ownerStateQueryFor: () => query,
      sessions,
      stateless: stateless(),
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });

    const result = await engine.execute(
      contextFor(request, identityFor(grant), ingress, null)
    );

    expect(load).toHaveBeenCalledOnce();
    expect(result.facts).toHaveLength(1);
    expect(result.snapshot).toMatchObject({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
      revision: 1,
      state: 'active',
      initialCheckpoint: harness.session.initialCheckpoint,
      currentCheckpoint: harness.session.currentCheckpoint,
      initialCheckpointDigest:
        harness.session.initialCheckpoint.checkpointDigest,
      currentCheckpointDigest:
        harness.session.currentCheckpoint.checkpointDigest,
      workspaceSnapshotDigest: fixture.workspaceSnapshotDigest,
      cleanupReceiptDigest: null,
    });
    expect(result.snapshot.snapshotDigest).toBe(
      digest(
        Object.freeze(
          Object.fromEntries(
            Object.entries(result.snapshot).filter(
              ([key]) => key !== 'snapshotDigest'
            )
          )
        )
      )
    );
    expect(uploads).toHaveLength(1);
    expect(result.casArtifacts).toEqual([descriptorFor(uploads[0]!)]);
    await expect(engine.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
  });

  it('restores a cross-host session from the exact 8790 bundle and callback-bound CAS bytes', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const harness = sessionHarness(material, fixture, grant);
    const identity = identityFor(grant);
    const uploaded = descriptorFor(
      Object.freeze({
        serviceKind: 'controlled-workspace',
        requestDigest: digest('production-session-engine-cas-request'),
        ownerImplementationDigest: digest(
          'production-session-engine-owner-implementation'
        ),
        stageDigest: digest('production-session-engine-cas-stage'),
        ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
        artifactRef: harness.session.initialCheckpoint.checkpointRef,
        artifactKind: 'controlled-checkpoint',
        mediaType: 'application/json',
        content: checkpointBytes(
          fixture.workspaceSnapshot as WorkspaceSnapshot
        ),
      })
    );
    const loadRequest = requestFor(
      grant,
      'session.load-or-reattach',
      Object.freeze({ material, fixture, grant, isolationPolicyDigest }),
      0
    );
    const snapshotBase = Object.freeze({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      namespaceId,
      planDigest,
      repositoryCommit,
      attemptId,
      descriptorDigest,
      caseId: material.caseId,
      materialDigest: material.materialDigest,
      fixtureDigest: fixture.fixtureDigest,
      grantDigest: grant.grantDigest,
      generation: grant.generation,
      sessionId: harness.session.sessionId,
      isolationPolicyDigest,
      revision: 1,
      state: 'active' as const,
      initialCheckpoint: harness.session.initialCheckpoint,
      initialCheckpointDigest:
        harness.session.initialCheckpoint.checkpointDigest,
      currentCheckpoint: harness.session.currentCheckpoint,
      currentCheckpointDigest:
        harness.session.currentCheckpoint.checkpointDigest,
      workspaceSnapshot: harness.projection.workspaceSnapshot,
      workspaceSnapshotDigest: fixture.workspaceSnapshotDigest,
      toolDefinitions: harness.projection.toolDefinitions,
      toolDefinitionSetDigest: digest(harness.projection.toolDefinitions),
      actionRegistry: harness.projection.actionRegistry,
      actionRegistryDigest: digest(harness.projection.actionRegistry),
      g3VerificationPlan: harness.projection.g3VerificationPlan,
      verificationPlanDigest: digest(harness.projection.g3VerificationPlan),
      adapterRegistry: harness.projection.adapterRegistry,
      adapterRegistryDigest: digest(harness.projection.adapterRegistry),
      finalWorkspaceSnapshotDigest: null,
      artifactDescriptors: harness.projection.artifactDescriptors,
      artifactDescriptorSetDigest: digest(
        harness.projection.artifactDescriptors
      ),
      finalAuthorityReceiptDigest: null,
      cleanupReceiptDigest: null,
    });
    const snapshot = Object.freeze({
      ...snapshotBase,
      snapshotDigest: digest(snapshotBase),
    });
    const bundle = bundleFor(identity, loadRequest, snapshot, [uploaded]);
    const readResult = readResultFor(bundle);
    const queryBytes = checkpointBytes(
      fixture.workspaceSnapshot as WorkspaceSnapshot
    );
    const queryRead = vi.fn(async () => readResult);
    const queryReadArtifact = vi.fn(
      async (): Promise<AgentEvaluationOwnerStateCASReadResult> =>
        Object.freeze({
          serviceKind: 'controlled-workspace',
          operation: 'session.orphans.list',
          ownerStateId: bundle.ownerStateId,
          ownerStateRevision: bundle.revision,
          ownerStateRootDigest: digest(bundle),
          descriptor: uploaded,
          content: queryBytes,
          responseDigest: digest('production-session-engine-cas-response'),
        })
    );
    const query: AgentEvaluationOwnerStateQueryClient = Object.freeze({
      async list() {
        throw new Error('List is outside session restore.');
      },
      read: queryRead,
      readArtifact: queryReadArtifact,
    });
    let callbackBytes: Uint8Array | undefined;
    const restore = vi.fn(
      async ({
        cas,
      }: Parameters<
        ProductionControlledWorkspaceTransactionSessionAuthority['restore']
      >[0]) => {
        await cas.use(uploaded, async (content: Uint8Array) => {
          callbackBytes = content;
          const decoded = JSON.parse(
            new TextDecoder().decode(content)
          ) as Readonly<{ workspaceSnapshot: unknown }>;
          expect(digest(decoded.workspaceSnapshot)).toBe(
            harness.session.currentCheckpoint.snapshotDigest
          );
        });
        return harness.handle;
      }
    );
    harness.setCASArtifacts(Object.freeze([]));
    const sessions: ProductionControlledWorkspaceTransactionSessionAuthority =
      Object.freeze({
        async loadOrReattach() {
          throw new Error('Load is outside cross-host restore.');
        },
        restore,
        close: clean,
      });
    const ingress: AgentEvaluationOwnerStateIngressClient = Object.freeze({
      async uploadArtifact() {
        throw new Error('No new CAS artifact is captured.');
      },
      async commitTransition() {
        throw new Error('The outer owner port commits the transition.');
      },
    });
    const tool = material.invocation.tools[0]!;
    const argumentsValue = Object.freeze({ targetRef: fixture.targetRefs[0] });
    const request = requestFor(
      grant,
      'session.preflight',
      Object.freeze({
        sessionId: harness.session.sessionId,
        attemptId,
        grantDigest: grant.grantDigest,
        generation: grant.generation,
        value: Object.freeze({
          toolId: tool.toolId,
          arguments: argumentsValue,
          argumentsDigest: digest(argumentsValue),
          grantDigest: grant.grantDigest,
          generation: grant.generation,
        }),
      }),
      1,
      harness.session.sessionId
    );
    const engine = createProductionControlledWorkspaceSessionEngine({
      orphanRead: orphanRead(),
      ownerStateQueryFor: () => query,
      sessions,
      stateless: stateless(),
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });

    const result = await engine.execute(
      contextFor(request, identity, ingress, bundle)
    );

    expect(queryRead).toHaveBeenCalledOnce();
    expect(queryReadArtifact).toHaveBeenCalledOnce();
    expect(restore).toHaveBeenCalledOnce();
    expect(result.snapshot.revision).toBe(2);
    expect(result.casArtifacts).toEqual([uploaded]);
    expect(callbackBytes).toBeDefined();
    expect([...callbackBytes!]).toEqual(
      Array.from({ length: callbackBytes!.byteLength }, () => 0)
    );
    expect([...queryBytes]).toEqual(
      Array.from({ length: queryBytes.byteLength }, () => 0)
    );
  });

  it('binds destroy cleanup to the captured projection and fails closed on residual resources', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const harness = sessionHarness(material, fixture, grant);
    const identity = identityFor(grant);
    const loadRequest = requestFor(
      grant,
      'session.load-or-reattach',
      Object.freeze({ material, fixture, grant, isolationPolicyDigest }),
      0
    );
    const snapshotBase = Object.freeze({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      namespaceId,
      planDigest,
      repositoryCommit,
      attemptId,
      descriptorDigest,
      caseId: material.caseId,
      materialDigest: material.materialDigest,
      fixtureDigest: fixture.fixtureDigest,
      grantDigest: grant.grantDigest,
      generation: grant.generation,
      sessionId: harness.session.sessionId,
      isolationPolicyDigest,
      revision: 1,
      state: 'active' as const,
      initialCheckpoint: harness.session.initialCheckpoint,
      initialCheckpointDigest:
        harness.session.initialCheckpoint.checkpointDigest,
      currentCheckpoint: harness.session.currentCheckpoint,
      currentCheckpointDigest:
        harness.session.currentCheckpoint.checkpointDigest,
      workspaceSnapshot: harness.projection.workspaceSnapshot,
      workspaceSnapshotDigest: fixture.workspaceSnapshotDigest,
      toolDefinitions: harness.projection.toolDefinitions,
      toolDefinitionSetDigest: digest(harness.projection.toolDefinitions),
      actionRegistry: harness.projection.actionRegistry,
      actionRegistryDigest: digest(harness.projection.actionRegistry),
      g3VerificationPlan: harness.projection.g3VerificationPlan,
      verificationPlanDigest: digest(harness.projection.g3VerificationPlan),
      adapterRegistry: harness.projection.adapterRegistry,
      adapterRegistryDigest: digest(harness.projection.adapterRegistry),
      finalWorkspaceSnapshotDigest: null,
      artifactDescriptors: harness.projection.artifactDescriptors,
      artifactDescriptorSetDigest: digest(
        harness.projection.artifactDescriptors
      ),
      finalAuthorityReceiptDigest: null,
      cleanupReceiptDigest: null,
    });
    const snapshot = Object.freeze({
      ...snapshotBase,
      snapshotDigest: digest(snapshotBase),
    });
    const durableDescriptor = descriptorFor(
      Object.freeze({
        serviceKind: 'controlled-workspace',
        requestDigest: loadRequest.requestDigest,
        ownerImplementationDigest: digest(
          'production-session-engine-owner-implementation'
        ),
        stageDigest: digest('production-session-engine-destroy-stage'),
        ownerStateId: createAgentEvaluationOwnerStateIdentity(identity),
        artifactRef: harness.session.currentCheckpoint.checkpointRef,
        artifactKind: 'controlled-checkpoint',
        mediaType: 'application/json',
        content: checkpointBytes(
          fixture.workspaceSnapshot as WorkspaceSnapshot
        ),
      })
    );
    const bundle = bundleFor(identity, loadRequest, snapshot, [
      durableDescriptor,
    ]);
    const query: AgentEvaluationOwnerStateQueryClient = Object.freeze({
      async list() {
        throw new Error('List is outside destroy.');
      },
      async read() {
        return readResultFor(bundle);
      },
      async readArtifact() {
        throw new Error('Destroy does not restore a CAS artifact.');
      },
    });
    harness.setCASArtifacts(Object.freeze([]));
    const sessions: ProductionControlledWorkspaceTransactionSessionAuthority =
      Object.freeze({
        async loadOrReattach() {
          throw new Error('Load is outside destroy.');
        },
        async restore() {
          return harness.handle;
        },
        async close() {
          return Object.freeze({
            status: 'clean' as const,
            residualResourceIds: Object.freeze([
              'sandbox.production-session-engine',
            ]) as unknown as readonly [],
            residualCanaryIds: Object.freeze([]) as readonly [],
          });
        },
      });
    const ingress: AgentEvaluationOwnerStateIngressClient = Object.freeze({
      async uploadArtifact() {
        throw new Error('Destroy captures no new CAS artifact.');
      },
      async commitTransition() {
        throw new Error('The outer owner port commits the transition.');
      },
    });
    const cleanupInput = Object.freeze({
      reason: 'completed' as const,
      cleanupIntentDigest: digest('production-session-engine-cleanup-intent'),
      cleanupDispatchReceiptDigest: digest(
        'production-session-engine-cleanup-dispatch'
      ),
      idempotencyKey: 'cleanup.production-session-engine',
    });
    const request = requestFor(
      grant,
      'session.destroy',
      Object.freeze({
        sessionId: harness.session.sessionId,
        attemptId,
        grantDigest: grant.grantDigest,
        generation: grant.generation,
        value: cleanupInput,
      }),
      1,
      harness.session.sessionId
    );
    const engine = createProductionControlledWorkspaceSessionEngine({
      orphanRead: orphanRead(),
      ownerStateQueryFor: () => query,
      sessions,
      stateless: stateless(),
      forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
    });

    const result = await engine.execute(
      contextFor(request, identity, ingress, bundle)
    );

    expect(result.snapshot.state).toBe('destroyed');
    expect(result.snapshot.cleanupReceiptDigest).toBe(
      (result.facts[0] as AgentEvaluationControlledWorkspaceCleanupReceipt)
        .cleanupReceiptDigest
    );
    await expect(engine.close()).rejects.toThrow('resource-retirement');
  });
});
