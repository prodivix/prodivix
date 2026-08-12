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
} from './controlledWorkspaceRuntime';
import {
  AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateCASDescriptor,
} from './ownerState';
import type {
  ProductionControlledWorkspaceOwnerStateCASReader,
  ProductionControlledWorkspaceSessionProjection,
} from './productionControlledWorkspaceSessionEngine';
import {
  createProductionControlledWorkspaceTransactionSessionAuthority,
  type ProductionControlledWorkspaceTransactionG3Authority,
} from './productionControlledWorkspaceTransactionSessionAuthority';
import type { OwnerStateExecutionContext } from './productionWorkspaceVerificationOwnerAuthorityPorts';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const digestBytes = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const namespaceId = 'namespace.production-transaction-session';
const planDigest = digest('production-transaction-session-plan');
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const attemptId = 'attempt.production-transaction-session';
const descriptorDigest = digest('production-transaction-session-descriptor');
const isolationPolicyDigest = digest(
  'production-transaction-session-isolation'
);

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
  throw new TypeError('Missing production controlled Workspace material.');
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
    grantId: 'grant.production-transaction-session',
    authorityId: 'authority.production-transaction-session',
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

const contextFor = (
  grant: AgentEvaluationControlledWorkspaceGrant
): OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot> =>
  ({
    identity: Object.freeze({
      serviceKind: 'controlled-workspace',
      namespaceId,
      planDigest,
      repositoryCommit,
      attemptId,
      descriptorDigest,
      generation: grant.generation,
      grantOrAuthorityDigest: grant.grantDigest,
    }),
  }) as OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>;

const unavailableCAS: ProductionControlledWorkspaceOwnerStateCASReader =
  Object.freeze({
    use(): Promise<never> {
      throw new TypeError('CAS must not be read for a fresh load.');
    },
  });

const g3Authority = (): Readonly<{
  authority: ProductionControlledWorkspaceTransactionG3Authority;
  evaluate: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}> => {
  const evaluate = vi.fn(async () => {
    throw new TypeError('G3 must not execute in this test.');
  });
  const close = vi.fn(async () =>
    Object.freeze({
      status: 'clean' as const,
      residualResourceIds: Object.freeze([]) as readonly [],
      residualCanaryIds: Object.freeze([]) as readonly [],
    })
  );
  return Object.freeze({
    evaluate,
    close,
    authority: Object.freeze({
      evaluate,
      close,
    }) as ProductionControlledWorkspaceTransactionG3Authority,
  });
};

const descriptorFor = (
  artifact: ProductionControlledWorkspaceSessionProjection['casArtifacts'][number]
): AgentEvaluationOwnerStateCASDescriptor => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_CAS_DESCRIPTOR_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    artifactRef: artifact.artifactRef,
    artifactKind: artifact.artifactKind,
    mediaType: artifact.mediaType,
    artifactDigest: digestBytes(artifact.content),
    byteLength: artifact.content.byteLength,
    casReceiptDigest: digest({
      kind: 'production-transaction-session-cas',
      artifactRef: artifact.artifactRef,
      artifactDigest: digestBytes(artifact.content),
    }),
  });
  return Object.freeze({ ...base, descriptorDigest: digest(base) });
};

const restoreInputs = (
  projection: ProductionControlledWorkspaceSessionProjection,
  grant: AgentEvaluationControlledWorkspaceGrant,
  session: Awaited<
    ReturnType<
      ReturnType<
        typeof createProductionControlledWorkspaceTransactionSessionAuthority
      >['loadOrReattach']
    >
  >['handle']['session']
): Readonly<{
  snapshot: AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
  bundle: AgentEvaluationOwnerStateBundle;
  cas: ProductionControlledWorkspaceOwnerStateCASReader;
  contents: Map<string, Uint8Array>;
}> => {
  const descriptors = projection.casArtifacts.map(descriptorFor);
  const contents = new Map(
    projection.casArtifacts.map(
      (artifact) => [artifact.artifactRef, artifact.content] as const
    )
  );
  const snapshot = {
    attemptId,
    descriptorDigest,
    caseId: session.caseId,
    materialDigest: session.materialDigest,
    fixtureDigest: session.fixtureDigest,
    grantDigest: grant.grantDigest,
    generation: grant.generation,
    initialCheckpoint: session.initialCheckpoint,
    currentCheckpoint: session.currentCheckpoint,
    currentCheckpointDigest: session.currentCheckpoint.checkpointDigest,
    workspaceSnapshotDigest: digest(projection.workspaceSnapshot),
    artifactDescriptors: projection.artifactDescriptors,
  } as unknown as AgentEvaluationControlledWorkspaceOwnerStateSnapshot;
  const bundle = {
    casArtifacts: descriptors,
  } as unknown as AgentEvaluationOwnerStateBundle;
  const cas: ProductionControlledWorkspaceOwnerStateCASReader = Object.freeze({
    async use<T>(
      descriptor: AgentEvaluationOwnerStateCASDescriptor,
      callback: (content: Uint8Array) => Promise<T>
    ): Promise<T> {
      const content = contents.get(descriptor.artifactRef);
      if (!content || digestBytes(content) !== descriptor.artifactDigest) {
        throw new TypeError('Test CAS binding failed.');
      }
      return callback(new Uint8Array(content));
    },
  });
  return Object.freeze({ snapshot, bundle, cas, contents });
};

describe('production controlled Workspace transaction session authority', () => {
  it('loads frozen material and persists proposal/session/checkpoint commitments without protected oracles', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const g3 = g3Authority();
    const authority =
      createProductionControlledWorkspaceTransactionSessionAuthority({
        g3: g3.authority,
        forbiddenCanaries: () => Object.freeze(['forbidden-production-canary']),
      });
    const loaded = await authority.loadOrReattach({
      context: contextFor(grant),
      material,
      fixture,
      grant,
      isolationPolicyDigest,
      previousSnapshot: null,
      previousBundle: null,
      cas: unavailableCAS,
    });
    expect(loaded.status).toBe('loaded');

    const expected = fixture.expectedOutcome.proposal;
    if (expected.status !== 'ready')
      throw new TypeError('Expected ready proposal.');
    const registered = fixture.actionRegistry.find(
      ({ actionId }) => actionId === expected.actionId
    );
    if (!registered) throw new TypeError('Expected registered action.');
    const argumentsValue = Object.freeze({
      actionId: registered.actionId,
      descriptorDigest: registered.descriptorDigest,
      ownerId: registered.action.ownerId,
      actionType: registered.action.actionType,
      inputSchemaId: registered.action.inputSchemaId,
      target: registered.action.target,
      input: expected.arguments,
      sourceRefs: expected.sourceRefs,
      summary: `Apply ${registered.actionId} through the canonical transaction owner.`,
    });
    const preflight = await loaded.handle.session.preflight({
      toolId: 'agent.proposal.create',
      arguments: argumentsValue,
      argumentsDigest: digest(argumentsValue),
      grantDigest: grant.grantDigest,
      generation: grant.generation,
    });
    expect(preflight.status).toBe('ready');
    const executeInput = Object.freeze({
      operationId: 'operation.production-proposal',
      intentDigest: digest('production-proposal-intent'),
      claimId: 'claim.production-proposal',
      dispatchReceiptDigest: digest('production-proposal-dispatch'),
      stagingRef: 'staging.production-proposal',
      generation: grant.generation,
      preflight,
      arguments: argumentsValue,
      maximumResultBytes: 2_097_152,
      secretCanaries: Object.freeze(['test-secret-canary']),
    });
    const effect = await loaded.handle.session.execute(executeInput);
    expect(effect).toMatchObject({
      status: 'succeeded',
      effectKind: 'proposal-dry-run',
      canonicalWriteObserved: false,
    });
    await expect(loaded.handle.session.execute(executeInput)).resolves.toEqual(
      effect
    );
    expect(g3.evaluate).not.toHaveBeenCalled();

    const projection = await loaded.handle.capture();
    const checkpointArtifact = projection.casArtifacts.find(
      ({ artifactKind }) => artifactKind === 'controlled-checkpoint'
    );
    const stateArtifact = projection.casArtifacts.find(
      ({ artifactKind }) => artifactKind === 'controlled-session-state'
    );
    expect(checkpointArtifact?.semanticSnapshotDigest).toBe(
      digest(projection.workspaceSnapshot)
    );
    const encodedCheckpoint = JSON.parse(
      new TextDecoder().decode(checkpointArtifact?.content)
    ) as {
      semanticSnapshotDigest: CanonicalDigest;
      workspaceSnapshot: WorkspaceSnapshot;
    };
    expect(encodedCheckpoint.semanticSnapshotDigest).toBe(
      digest(encodedCheckpoint.workspaceSnapshot)
    );
    const encodedState = new TextDecoder().decode(stateArtifact?.content);
    expect(encodedState).not.toContain('visualOracle');
    expect(encodedState).not.toContain('documentOracle');
    expect(encodedState).not.toContain('test-secret-canary');

    await expect(authority.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: [],
      residualCanaryIds: [],
    });
    expect(g3.close).toHaveBeenCalledOnce();
  }, 60_000);

  it('restores on another host from owner-state descriptors and rejects swapped session bytes before reuse', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const firstG3 = g3Authority();
    const first =
      createProductionControlledWorkspaceTransactionSessionAuthority({
        g3: firstG3.authority,
        forbiddenCanaries: () => Object.freeze([]),
      });
    const loaded = await first.loadOrReattach({
      context: contextFor(grant),
      material,
      fixture,
      grant,
      isolationPolicyDigest,
      previousSnapshot: null,
      previousBundle: null,
      cas: unavailableCAS,
    });
    const projection = await loaded.handle.capture();
    const restore = restoreInputs(projection, grant, loaded.handle.session);

    const secondG3 = g3Authority();
    const second =
      createProductionControlledWorkspaceTransactionSessionAuthority({
        g3: secondG3.authority,
        forbiddenCanaries: () => Object.freeze([]),
      });
    const restored = await second.restore({
      context: contextFor(grant),
      snapshot: restore.snapshot,
      bundle: restore.bundle,
      cas: restore.cas,
    });
    expect(restored.session.currentCheckpoint).toEqual(
      loaded.handle.session.currentCheckpoint
    );
    await expect(restored.capture()).resolves.toMatchObject({
      workspaceSnapshot: fixture.workspaceSnapshot,
      finalWorkspaceSnapshotDigest: null,
    });
    expect(secondG3.evaluate).not.toHaveBeenCalled();

    const stateArtifact = projection.casArtifacts.find(
      ({ artifactKind }) => artifactKind === 'controlled-session-state'
    );
    if (!stateArtifact) throw new TypeError('Missing state artifact.');
    const original = restore.contents.get(stateArtifact.artifactRef);
    if (!original) throw new TypeError('Missing state bytes.');
    const swapped = new Uint8Array(original);
    swapped[swapped.length - 2] = swapped[swapped.length - 2]! ^ 1;
    restore.contents.set(stateArtifact.artifactRef, swapped);
    await expect(
      second.restore({
        context: contextFor(grant),
        snapshot: restore.snapshot,
        bundle: restore.bundle,
        cas: restore.cas,
      })
    ).rejects.toThrow('Test CAS binding failed');
  }, 60_000);

  it('fails closed when the supplied fixture drifts from the material-bound snapshot', async () => {
    const { material, fixture } = materialFixture();
    const grant = grantFor(material, fixture);
    const g3 = g3Authority();
    const authority =
      createProductionControlledWorkspaceTransactionSessionAuthority({
        g3: g3.authority,
        forbiddenCanaries: () => Object.freeze([]),
      });
    const driftedFixture = Object.freeze({
      ...fixture,
      workspaceSnapshot: Object.freeze({
        ...(fixture.workspaceSnapshot as WorkspaceSnapshot),
        id: 'workspace.production-drift',
      }),
    }) as AgentEvaluationWorkspaceFixtureMaterial;
    await expect(
      authority.loadOrReattach({
        context: contextFor(grant),
        material,
        fixture: driftedFixture,
        grant,
        isolationPolicyDigest,
        previousSnapshot: null,
        previousBundle: null,
        cas: unavailableCAS,
      })
    ).rejects.toThrow('load-binding');
    expect(g3.evaluate).not.toHaveBeenCalled();
  });
});
