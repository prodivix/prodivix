import { describe, expect, it } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
  createAgentEvaluationOwnerStateIdentity,
  decodeAgentEvaluationOwnerStateBundle,
  decodeAgentEvaluationOwnerStatePrior,
  decodeAgentEvaluationOwnerStateTransition,
  digestAgentEvaluationOwnerStateDispatchAck,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStateTransition,
} from './ownerState';

const commit = 'b'.repeat(40);
const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);

const controlledIdentity = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  namespaceId: 'evaluation.namespace.owner-state',
  planDigest: digest('owner-state-plan'),
  repositoryCommit: commit,
  attemptId: 'evaluation-attempt.owner-state',
  descriptorDigest: digest('owner-state-descriptor'),
  generation: 4,
  grantOrAuthorityDigest: digest('owner-state-grant'),
});

const operation = 'session.load-or-reattach';
const routeBinding = 'sessions/load-or-reattach';
const requestDigest = digest('owner-state-request');
const implementationDigest = digest('owner-state-implementation');

const createOperationRecord = (sequence = 1) => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence,
    operation,
    routeBinding,
    requestDigest,
    stageDigest: digest(`owner-state-record-stage-${sequence}`),
    responseDigest: digest(`owner-state-record-response-${sequence}`),
  });
  return Object.freeze({ ...base, recordDigest: digest(base) });
};

const createControlledBundle = (
  identity: AgentEvaluationOwnerStateIdentityInput = controlledIdentity,
  tools: readonly unknown[] = Object.freeze([
    Object.freeze({ toolId: 'tool.\u{e000}', schemaDigest: digest('tool-1') }),
    Object.freeze({ toolId: 'tool.\u{10000}', schemaDigest: digest('tool-2') }),
  ])
): AgentEvaluationOwnerStateBundle => {
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 3,
  });
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const g3VerificationPlan = Object.freeze({
    format: 'prodivix.verification-plan',
    cells: Object.freeze([]),
  });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const initialCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state.initial',
    attemptId: identity.attemptId,
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    snapshotDigest: digest(workspaceSnapshot),
    securePersistenceReceiptDigest: digest(
      'owner-state-initial-checkpoint-persistence'
    ),
  });
  const initialCheckpoint = Object.freeze({
    ...initialCheckpointBase,
    checkpointDigest: digest(initialCheckpointBase),
  });
  const currentCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state.current',
    attemptId: identity.attemptId,
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
    snapshotDigest: digest(workspaceSnapshot),
    securePersistenceReceiptDigest: digest(
      'owner-state-current-checkpoint-persistence'
    ),
  });
  const currentCheckpoint = Object.freeze({
    ...currentCheckpointBase,
    checkpointDigest: digest(currentCheckpointBase),
  });
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: identity.namespaceId,
    planDigest: identity.planDigest,
    repositoryCommit: identity.repositoryCommit,
    attemptId: identity.attemptId,
    descriptorDigest: identity.descriptorDigest,
    caseId: 'case.owner-state',
    materialDigest: digest('owner-state-material'),
    fixtureDigest: digest('owner-state-fixture'),
    grantDigest: identity.grantOrAuthorityDigest,
    generation: identity.generation,
    sessionId: 'controlled-session.owner-state',
    isolationPolicyDigest: digest('owner-state-isolation'),
    revision: 1,
    state: 'active' as const,
    initialCheckpoint,
    initialCheckpointDigest: initialCheckpoint.checkpointDigest,
    currentCheckpoint,
    currentCheckpointDigest: currentCheckpoint.checkpointDigest,
    workspaceSnapshot,
    workspaceSnapshotDigest: digest(workspaceSnapshot),
    toolDefinitions: tools,
    toolDefinitionSetDigest: digest(tools),
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
    namespaceId: identity.namespaceId,
    planDigest: identity.planDigest,
    repositoryCommit: identity.repositoryCommit,
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

const createTransition = (
  bundle = createControlledBundle()
): AgentEvaluationOwnerStateTransition => {
  const publicResult = Object.freeze({
    status: 'loaded',
    sessionId: 'controlled-session.owner-state',
  });
  const stageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: controlledIdentity.serviceKind,
    operation,
    routeBinding,
    requestDigest,
    ownerImplementationDigest: implementationDigest,
    ownerStateId: bundle.ownerStateId,
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: controlledIdentity.serviceKind,
    operation,
    routeBinding,
    requestDigest,
    ownerImplementationDigest: implementationDigest,
    ownerStateId: bundle.ownerStateId,
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
    stageDigest,
    publicResult,
    responseDigest: digest(publicResult),
    ownerStateRevision: 1,
    ownerStateRootDigest: digest(bundle),
  });
  const withAck = Object.freeze({
    ...base,
    dispatchAckDigest: digestAgentEvaluationOwnerStateDispatchAck(base),
  });
  const sealed = Object.freeze({
    ...withAck,
    resultReceiptDigest: digest(withAck),
  });
  return Object.freeze({ ...sealed, ownerStateBundle: bundle });
};

const createVerificationBundle = (): Readonly<{
  identity: AgentEvaluationOwnerStateIdentityInput;
  bundle: AgentEvaluationOwnerStateBundle;
}> => {
  const identity = Object.freeze({
    ...controlledIdentity,
    serviceKind: 'verification-evidence' as const,
    grantOrAuthorityDigest: digest('verification-authority'),
  });
  const candidate = Object.freeze({ candidateId: 'candidate.owner-state' });
  const uploadedArtifactManifests = Object.freeze([
    Object.freeze({ artifactId: 'artifact.1', digest: digest('artifact-1') }),
  ]);
  const verifiedClaims = Object.freeze([
    Object.freeze({ claimDigest: digest('claim-1'), status: 'verified' }),
  ]);
  const evidenceRecords = Object.freeze([
    Object.freeze({ evidenceId: 'evidence.1', digest: digest('evidence-1') }),
  ]);
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: identity.namespaceId,
    planDigest: identity.planDigest,
    repositoryCommit: identity.repositoryCommit,
    attemptId: identity.attemptId,
    descriptorDigest: identity.descriptorDigest,
    generation: identity.generation,
    authorityDigest: identity.grantOrAuthorityDigest,
    sandboxRegistrationReceiptDigest: digest('sandbox-registration'),
    revision: 1,
    state: 'active' as const,
    promotionId: 'promotion.owner-state',
    evidenceId: 'evidence.owner-state',
    projectId: 'project.owner-state',
    workspaceId: 'workspace.owner-state',
    workspaceRevision: 3,
    verificationPlanDigest: digest('verification-plan'),
    adapterRegistryDigest: digest('adapter-registry'),
    candidate,
    candidateDigest: digest(candidate),
    createdAt: '2026-08-09T06:00:00.000Z',
    deadlineAt: '2026-08-09T06:03:00.000Z',
    uploadCapabilityDigest: digest('upload-capability'),
    attestationNonceDigest: null,
    attestationStatement: null,
    attestationStatementDigest: null,
    uploadedArtifactManifests,
    artifactManifestSetDigest: digest(uploadedArtifactManifests),
    verifiedClaims,
    verifiedClaimSetDigest: digest(verifiedClaims),
    finalManifest: null,
    finalManifestDigest: null,
    evidenceRecords,
    evidenceRecordSetDigest: digest(evidenceRecords),
  });
  const snapshot = Object.freeze({
    ...snapshotBase,
    snapshotDigest: digest(snapshotBase),
  });
  const casArtifacts = Object.freeze([]);
  const recentOperations = Object.freeze([createOperationRecord()]);
  const bundle = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: identity.serviceKind,
    namespaceId: identity.namespaceId,
    planDigest: identity.planDigest,
    repositoryCommit: identity.repositoryCommit,
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
  return Object.freeze({ identity, bundle });
};

describe('owner state canonical wire', () => {
  it('matches the Go owner-state identity, stage, root, ACK, and result-receipt vector', () => {
    const vectorIdentity = Object.freeze({
      serviceKind: 'controlled-workspace' as const,
      namespaceId: 'evaluation/ns',
      planDigest:
        'sha256-1111111111111111111111111111111111111111111111111111111111111111' as CanonicalDigest,
      repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
      attemptId: 'attempt/1',
      descriptorDigest:
        'sha256-2222222222222222222222222222222222222222222222222222222222222222' as CanonicalDigest,
      generation: 1,
      grantOrAuthorityDigest:
        'sha256-3333333333333333333333333333333333333333333333333333333333333333' as CanonicalDigest,
    });
    const vectorOwnerStateId =
      'sha256-d33f30a81dbf9a900322cc74e6b925db0a87540a056229397533d1f148064cd7' as CanonicalDigest;
    const vectorRequestDigest =
      'sha256-9999999999999999999999999999999999999999999999999999999999999999' as CanonicalDigest;
    const vectorImplementationDigest =
      'sha256-1212121212121212121212121212121212121212121212121212121212121212' as CanonicalDigest;
    const vectorStageDigest =
      'sha256-729f406b8717af7da54ea9a581bf05cd4b12c3e61f353eed4f4605a4836b6f14' as CanonicalDigest;
    const vectorBundleRoot =
      'sha256-d313bcb878f695fd1394a12b3c857fa42c29c3dbd7c9ff442d6b8ad579c3ebd9' as CanonicalDigest;
    const vectorDispatchAckDigest =
      'sha256-835ea90a5cc7628f22c3df1c7056c7fc4585d67db397fcf5ceb69bae1dcaf94d' as CanonicalDigest;
    const vectorResultReceiptDigest =
      'sha256-bd1db3ab8469e66ec144bd3009fe0c890d43ea9c1155b46b0ea98fe9bec22977' as CanonicalDigest;

    expect(createAgentEvaluationOwnerStateIdentity(vectorIdentity)).toBe(
      vectorOwnerStateId
    );
    expect(
      digestAgentEvaluationOwnerStateStage({
        ...vectorIdentity,
        operation,
        routeBinding,
        requestDigest: vectorRequestDigest,
        ownerImplementationDigest: vectorImplementationDigest,
        ownerStateId: vectorOwnerStateId,
        priorOwnerStateRevision: 0,
        priorOwnerStateRootDigest: null,
      })
    ).toBe(vectorStageDigest);

    const workspaceSnapshot = Object.freeze({
      format: 'prodivix.workspace-snapshot',
      revision: 1,
    });
    const toolDefinitions = Object.freeze([]);
    const actionRegistry = Object.freeze([]);
    const g3VerificationPlan = Object.freeze({
      format: 'prodivix.g3-verification-plan',
      cells: Object.freeze([]),
    });
    const adapterRegistry = Object.freeze([]);
    const artifactDescriptors = Object.freeze([]);
    const initialCheckpointBase = Object.freeze({
      checkpointRef: 'checkpoint/initial',
      attemptId: vectorIdentity.attemptId,
      grantDigest: vectorIdentity.grantOrAuthorityDigest,
      generation: vectorIdentity.generation,
      snapshotDigest:
        'sha256-7777777777777777777777777777777777777777777777777777777777777777' as CanonicalDigest,
      securePersistenceReceiptDigest:
        'sha256-8888888888888888888888888888888888888888888888888888888888888888' as CanonicalDigest,
    });
    const initialCheckpoint = Object.freeze({
      ...initialCheckpointBase,
      checkpointDigest: digest(initialCheckpointBase),
    });
    const currentCheckpointBase = Object.freeze({
      checkpointRef: 'checkpoint/current',
      attemptId: vectorIdentity.attemptId,
      grantDigest: vectorIdentity.grantOrAuthorityDigest,
      generation: vectorIdentity.generation,
      predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
      snapshotDigest:
        'sha256-9999999999999999999999999999999999999999999999999999999999999999' as CanonicalDigest,
      securePersistenceReceiptDigest:
        'sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as CanonicalDigest,
    });
    const currentCheckpoint = Object.freeze({
      ...currentCheckpointBase,
      checkpointDigest: digest(currentCheckpointBase),
    });
    const snapshotBase = Object.freeze({
      format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      namespaceId: vectorIdentity.namespaceId,
      planDigest: vectorIdentity.planDigest,
      repositoryCommit: vectorIdentity.repositoryCommit,
      attemptId: vectorIdentity.attemptId,
      descriptorDigest: vectorIdentity.descriptorDigest,
      caseId: 'case/1',
      materialDigest:
        'sha256-4444444444444444444444444444444444444444444444444444444444444444' as CanonicalDigest,
      fixtureDigest:
        'sha256-5555555555555555555555555555555555555555555555555555555555555555' as CanonicalDigest,
      grantDigest: vectorIdentity.grantOrAuthorityDigest,
      generation: vectorIdentity.generation,
      sessionId: 'session/1',
      isolationPolicyDigest:
        'sha256-6666666666666666666666666666666666666666666666666666666666666666' as CanonicalDigest,
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
    const publicResult = Object.freeze({ facts: Object.freeze([]) });
    const responseDigest = digest(publicResult);
    const operationBase = Object.freeze({
      format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      sequence: 1,
      operation,
      routeBinding,
      requestDigest: vectorRequestDigest,
      stageDigest: vectorStageDigest,
      responseDigest,
    });
    const recentOperations = Object.freeze([
      Object.freeze({
        ...operationBase,
        recordDigest: digest(operationBase),
      }),
    ]);
    const casArtifacts = Object.freeze([]);
    const bundle = Object.freeze({
      format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      serviceKind: vectorIdentity.serviceKind,
      namespaceId: vectorIdentity.namespaceId,
      planDigest: vectorIdentity.planDigest,
      repositoryCommit: vectorIdentity.repositoryCommit,
      ownerStateId: vectorOwnerStateId,
      revision: 1,
      previousOwnerStateRootDigest: null,
      snapshotKind: vectorIdentity.serviceKind,
      snapshot,
      snapshotDigest: snapshot.snapshotDigest,
      casArtifacts,
      casArtifactSetDigest: digest(casArtifacts),
      recentOperations,
      recentOperationSetDigest: digest(recentOperations),
    });
    expect(digest(bundle)).toBe(vectorBundleRoot);

    const sealedBase = Object.freeze({
      format: AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
      version: AGENT_EVALUATION_OWNER_STATE_VERSION,
      serviceKind: vectorIdentity.serviceKind,
      operation,
      routeBinding,
      requestDigest: vectorRequestDigest,
      ownerImplementationDigest: vectorImplementationDigest,
      ownerStateId: vectorOwnerStateId,
      priorOwnerStateRevision: 0,
      priorOwnerStateRootDigest: null,
      stageDigest: vectorStageDigest,
      publicResult,
      responseDigest,
      ownerStateRevision: 1,
      ownerStateRootDigest: vectorBundleRoot,
    });
    const dispatchAckDigest =
      digestAgentEvaluationOwnerStateDispatchAck(sealedBase);
    expect(dispatchAckDigest).toBe(vectorDispatchAckDigest);
    expect(digest({ ...sealedBase, dispatchAckDigest })).toBe(
      vectorResultReceiptDigest
    );

    expect(
      decodeAgentEvaluationOwnerStateBundle(bundle, {
        ...vectorIdentity,
        revision: 1,
        previousOwnerStateRootDigest: null,
      })
    ).toEqual(bundle);
  });

  it('decodes controlled and verification bundles with their exact identity roots', () => {
    const controlled = createControlledBundle();
    expect(
      decodeAgentEvaluationOwnerStateBundle(controlled, {
        ...controlledIdentity,
        revision: 1,
        previousOwnerStateRootDigest: null,
      })
    ).toEqual(controlled);
    expect(
      decodeAgentEvaluationOwnerStatePrior(
        {
          revision: 1,
          bundle: controlled,
          rootDigest: digest(controlled),
        },
        controlledIdentity
      ).ownerStateId
    ).toBe(controlled.ownerStateId);

    const verification = createVerificationBundle();
    expect(
      decodeAgentEvaluationOwnerStateBundle(verification.bundle, {
        ...verification.identity,
        revision: 1,
        previousOwnerStateRootDigest: null,
      })
    ).toEqual(verification.bundle);
  });

  it('uses Unicode code-point order for persisted tool definitions', () => {
    expect(() =>
      decodeAgentEvaluationOwnerStateBundle(createControlledBundle(), {
        ...controlledIdentity,
        revision: 1,
        previousOwnerStateRootDigest: null,
      })
    ).not.toThrow();
    const swapped = createControlledBundle(
      controlledIdentity,
      Object.freeze([
        Object.freeze({
          toolId: 'tool.\u{10000}',
          schemaDigest: digest('tool-2'),
        }),
        Object.freeze({
          toolId: 'tool.\u{e000}',
          schemaDigest: digest('tool-1'),
        }),
      ])
    );
    expect(() =>
      decodeAgentEvaluationOwnerStateBundle(swapped, {
        ...controlledIdentity,
        revision: 1,
        previousOwnerStateRootDigest: null,
      })
    ).toThrow(/snapshot is invalid/u);
  });

  it('decodes an already-ingressed transition and rejects root or fence swaps', () => {
    const transition = createTransition();
    const expected = Object.freeze({
      ...controlledIdentity,
      operation,
      routeBinding,
      requestDigest,
      ownerImplementationDigest: implementationDigest,
      priorOwnerStateRevision: 0,
      priorOwnerStateRootDigest: null,
    });
    expect(
      decodeAgentEvaluationOwnerStateTransition(transition, expected)
    ).toEqual(transition);

    for (const drift of [
      { stageDigest: digest('fake-stage') },
      { dispatchAckDigest: digest('fake-ack') },
      { ownerStateRootDigest: digest('fake-root') },
    ]) {
      expect(() =>
        decodeAgentEvaluationOwnerStateTransition(
          Object.freeze({ ...transition, ...drift }),
          expected
        )
      ).toThrow(/invalid|drifted/u);
    }
  });

  it('requires revision zero to carry an empty prior state triple', () => {
    expect(
      decodeAgentEvaluationOwnerStatePrior(
        { revision: 0, bundle: null, rootDigest: null },
        controlledIdentity
      )
    ).toMatchObject({ revision: 0, bundle: null, rootDigest: null });
    expect(() =>
      decodeAgentEvaluationOwnerStatePrior(
        {
          revision: 0,
          bundle: createControlledBundle(),
          rootDigest: null,
        },
        controlledIdentity
      )
    ).toThrow(/must be empty/u);

    const bundle = createControlledBundle();
    const noOperations = Object.freeze([]);
    expect(() =>
      decodeAgentEvaluationOwnerStateBundle(
        Object.freeze({
          ...bundle,
          recentOperations: noOperations,
          recentOperationSetDigest: digest(noOperations),
        }),
        {
          ...controlledIdentity,
          revision: 1,
          previousOwnerStateRootDigest: null,
        }
      )
    ).toThrow(/bundle is invalid/u);
  });
});
