import { describe, expect, it, vi } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createVerificationEvidenceStatementDigest } from '@prodivix/verification';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
  decodeAgentEvaluationOwnerStateTransition,
  digestAgentEvaluationOwnerStateDispatchAck,
  type AgentEvaluationControlledWorkspaceOwnerStateSnapshot,
  type AgentEvaluationOwnerStateTransition,
  type AgentEvaluationVerificationEvidenceOwnerStateSnapshot,
} from './ownerState';
import type {
  AgentEvaluationOwnerStateCommitTransitionInput,
  AgentEvaluationOwnerStateIngressClient,
} from './ownerStateIngressClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import {
  createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts,
  type OwnerStateExecutionContext,
  type ProductionControlledWorkspaceOwnerEngine,
  type ProductionVerificationEvidenceOwnerEngine,
} from './productionWorkspaceVerificationOwnerAuthorityPorts';
import { createVerificationEvidenceOwnerTestStatement } from './productionVerificationEvidenceLifecycleEngine.fixture';

const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const namespaceId = 'evaluation.namespace.workspace-verification-owner';
const planDigest = digest('workspace-verification-owner-plan');
const repositoryCommit = 'a'.repeat(40);
const attemptId = 'evaluation-attempt.workspace-verification-owner';
const descriptorDigest = digest('workspace-verification-owner-descriptor');
const generation = 2;
const forbiddenCanary = 'forbidden-production-owner-canary';

const transitionFor = (
  input: AgentEvaluationOwnerStateCommitTransitionInput
): AgentEvaluationOwnerStateTransition => {
  const ownerStateRootDigest = digest(input.ownerStateBundle);
  const responseDigest = digest(input.publicResult);
  const ackBase = Object.freeze({
    format: AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest: input.ownerImplementationDigest,
    ownerStateId: input.ownerStateBundle.ownerStateId,
    priorOwnerStateRevision: input.priorOwnerStateRevision,
    priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    stageDigest: input.stageDigest,
    publicResult: input.publicResult,
    responseDigest,
    ownerStateRevision: input.ownerStateBundle.revision,
    ownerStateRootDigest,
  });
  const receiptBase = Object.freeze({
    ...ackBase,
    dispatchAckDigest: digestAgentEvaluationOwnerStateDispatchAck(ackBase),
  });
  return decodeAgentEvaluationOwnerStateTransition(
    Object.freeze({
      ...receiptBase,
      resultReceiptDigest: digest(receiptBase),
      ownerStateBundle: input.ownerStateBundle,
    }),
    {
      ...input.identity,
      operation: input.operation,
      routeBinding: input.routeBinding,
      requestDigest: input.requestDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
      priorOwnerStateRevision: input.priorOwnerStateRevision,
      priorOwnerStateRootDigest: input.priorOwnerStateRootDigest,
    }
  );
};

const createIngress = (
  commits: AgentEvaluationOwnerStateCommitTransitionInput[]
): AgentEvaluationOwnerStateIngressClient =>
  Object.freeze({
    async uploadArtifact() {
      throw new Error('No CAS artifact is used by this contract test.');
    },
    async commitTransition(
      input: AgentEvaluationOwnerStateCommitTransitionInput
    ) {
      commits.push(input);
      return transitionFor(input);
    },
  });

const controlledSnapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
): AgentEvaluationControlledWorkspaceOwnerStateSnapshot => {
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 12,
  });
  const toolDefinitions = Object.freeze([]);
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const g3VerificationPlan = Object.freeze({ cells: Object.freeze([]) });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const initialCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.workspace-verification-owner.initial',
    attemptId: context.identity.attemptId,
    grantDigest: context.identity.grantOrAuthorityDigest,
    generation: context.identity.generation,
    snapshotDigest: digest('workspace-verification-owner-initial-snapshot'),
    securePersistenceReceiptDigest: digest(
      'workspace-verification-owner-initial-persistence'
    ),
  });
  const initialCheckpoint = Object.freeze({
    ...initialCheckpointBase,
    checkpointDigest: digest(initialCheckpointBase),
  });
  const currentCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.workspace-verification-owner.current',
    attemptId: context.identity.attemptId,
    grantDigest: context.identity.grantOrAuthorityDigest,
    generation: context.identity.generation,
    predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
    snapshotDigest: digest('workspace-verification-owner-current-snapshot'),
    securePersistenceReceiptDigest: digest(
      'workspace-verification-owner-current-persistence'
    ),
  });
  const currentCheckpoint = Object.freeze({
    ...currentCheckpointBase,
    checkpointDigest: digest(currentCheckpointBase),
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: context.identity.namespaceId,
    planDigest: context.identity.planDigest,
    repositoryCommit: context.identity.repositoryCommit,
    attemptId: context.identity.attemptId,
    descriptorDigest: context.identity.descriptorDigest,
    caseId: 'case.workspace-verification-owner',
    materialDigest: digest('workspace-verification-owner-material'),
    fixtureDigest: digest('workspace-verification-owner-fixture'),
    grantDigest: context.identity.grantOrAuthorityDigest,
    generation: context.identity.generation,
    sessionId: 'controlled-session.workspace-verification-owner',
    isolationPolicyDigest: digest('workspace-verification-owner-isolation'),
    revision: context.nextRevision,
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
  return Object.freeze({ ...base, snapshotDigest: digest(base) });
};

const uploadCapability = 'upload-capability-'.padEnd(48, 'u');
const attestationNonce = 'attestation-nonce-'.padEnd(32, 'n');
const attestationStatement = createVerificationEvidenceOwnerTestStatement(
  'evidence.workspace-verification-owner',
  attemptId
);
const attestationStatementDigest =
  createVerificationEvidenceStatementDigest(attestationStatement);

const verificationResponse = (requestDigest: CanonicalDigest) =>
  Object.freeze({
    format: 'prodivix.agent-evaluation-verification-evidence-bridge',
    version: 1,
    kind: 'promotion-prepared',
    requestDigest,
    promotionId: 'promotion.workspace-verification-owner',
    evidenceId: 'evidence.workspace-verification-owner',
    attestationNonce,
    attestationStatement,
    attestationStatementDigest,
    receiptDigest: digest('workspace-verification-owner-response-receipt'),
  });

const verificationPublicResult = (requestDigest: CanonicalDigest) => {
  const response = verificationResponse(requestDigest);
  const responseProjection = Object.freeze({
    kind: response.kind,
    promotionId: response.promotionId,
    evidenceId: response.evidenceId,
    attestationNonceDigest: digest(response.attestationNonce),
    attestationStatement: response.attestationStatement,
    attestationStatementDigest: response.attestationStatementDigest,
  });
  return Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    operation: 'promotion.prepare' as const,
    requestDigest,
    responseReceiptDigest: response.receiptDigest,
    responseProjection,
    responseProjectionDigest: digest(responseProjection),
  });
};

const verificationSnapshot = (
  context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>
): AgentEvaluationVerificationEvidenceOwnerStateSnapshot => {
  const candidate = Object.freeze({
    descriptorDigest: context.identity.descriptorDigest,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId: context.identity.namespaceId,
    planDigest: context.identity.planDigest,
    repositoryCommit: context.identity.repositoryCommit,
    attemptId: context.identity.attemptId,
    descriptorDigest: context.identity.descriptorDigest,
    generation: context.identity.generation,
    authorityDigest: context.identity.grantOrAuthorityDigest,
    sandboxRegistrationReceiptDigest: digest(
      'workspace-verification-owner-sandbox-registration'
    ),
    revision: context.nextRevision,
    state: 'prepared' as const,
    promotionId: 'promotion.workspace-verification-owner',
    evidenceId: 'evidence.workspace-verification-owner',
    projectId: 'project.workspace-verification-owner',
    workspaceId: 'workspace.workspace-verification-owner',
    workspaceRevision: 12,
    verificationPlanDigest: digest(
      'workspace-verification-owner-verification-plan'
    ),
    adapterRegistryDigest: digest(
      'workspace-verification-owner-adapter-registry'
    ),
    candidate,
    candidateDigest: digest(candidate),
    createdAt: '2026-08-09T00:00:00.000Z',
    deadlineAt: '2026-08-09T00:03:00.000Z',
    uploadCapabilityDigest: digest(uploadCapability),
    attestationNonceDigest: digest(attestationNonce),
    attestationStatement,
    attestationStatementDigest,
    uploadedArtifactManifests: null,
    artifactManifestSetDigest: null,
    verifiedClaims: null,
    verifiedClaimSetDigest: null,
    finalManifest: null,
    finalManifestDigest: null,
    evidenceRecords: null,
    evidenceRecordSetDigest: null,
  });
  return Object.freeze({ ...base, snapshotDigest: digest(base) });
};

const requestBase = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: 1 as const,
  namespaceId,
  planDigest,
  repositoryCommit,
  attemptId,
  descriptorDigest,
  generation,
  ownerStateRevision: 0,
  ownerStateBundle: null,
  ownerStateRootDigest: null,
  claimGeneration: 1,
});

const controlledRequest = Object.freeze({
  ...requestBase,
  serviceKind: 'controlled-workspace' as const,
  mode: 'stage' as const,
  operation: 'session.load-or-reattach',
  routeBinding: 'sessions/load-or-reattach',
  requestDigest: digest('workspace-verification-owner-controlled-request'),
  controlledWorkspaceGrantDigest: digest(
    'workspace-verification-owner-controlled-grant'
  ),
  payload: Object.freeze({ kind: 'load-or-reattach-request' }),
}) satisfies AgentEvaluationOwnerAuthorityRequest;

const verificationRequest = Object.freeze({
  ...requestBase,
  serviceKind: 'verification-evidence' as const,
  mode: 'stage' as const,
  operation: 'promotion.prepare',
  routeBinding: 'promotions/{promotionId}/prepare',
  requestDigest: digest('workspace-verification-owner-verification-request'),
  authorityDigest: digest('workspace-verification-owner-authority'),
  sandboxRegistrationReceiptDigest: digest(
    'workspace-verification-owner-sandbox-registration'
  ),
  payload: Object.freeze({ kind: 'promotion-prepare-request' }),
}) satisfies AgentEvaluationOwnerAuthorityRequest;

const clean = () =>
  Promise.resolve(
    Object.freeze({
      status: 'clean' as const,
      residualResourceIds: Object.freeze([]) as readonly [],
      residualCanaryIds: Object.freeze([]) as readonly [],
    })
  );

describe('production Workspace and Verification owner authority ports', () => {
  it('commits a controlled transition whose final bounded operation record exactly binds the ingress input', async () => {
    const commits: AgentEvaluationOwnerStateCommitTransitionInput[] = [];
    const execute = vi.fn(
      async (
        context: OwnerStateExecutionContext<AgentEvaluationControlledWorkspaceOwnerStateSnapshot>
      ) =>
        Object.freeze({
          facts: Object.freeze([
            Object.freeze({
              kind: 'controlled-workspace-session-attachment',
              sessionId: 'controlled-session.workspace-verification-owner',
            }),
          ]),
          snapshot: controlledSnapshot(context),
        })
    );
    const controlledWorkspace: ProductionControlledWorkspaceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze([]);
        },
        execute,
        async executeStateless() {
          return Object.freeze([]);
        },
        async reconcileStateless() {
          return Object.freeze({ facts: Object.freeze([]), reconciled: false });
        },
        close: clean,
      });
    const verificationEvidence: ProductionVerificationEvidenceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze({});
        },
        async execute() {
          throw new Error('Verification is outside this test.');
        },
        async reconstructResponse() {
          throw new Error('Verification is outside this test.');
        },
        close: clean,
      });
    const ports =
      createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts({
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        controlledWorkspace,
        verificationEvidence,
        createIngressClient: () => createIngress(commits),
      });

    const stageDigest =
      await ports.controlledWorkspace.stage(controlledRequest);
    const transition = await ports.controlledWorkspace.execute(
      Object.freeze({
        ...controlledRequest,
        mode: 'execute' as const,
        stageDigest,
      })
    );
    expect(Array.isArray(transition)).toBe(false);
    const sealed = transition as AgentEvaluationOwnerStateTransition;
    expect(execute).toHaveBeenCalledOnce();
    expect(commits).toHaveLength(1);
    const current = sealed.ownerStateBundle.recentOperations.at(-1)!;
    expect(sealed.ownerStateBundle.recentOperations).toHaveLength(1);
    expect(current).toMatchObject({
      operation: commits[0]!.operation,
      routeBinding: commits[0]!.routeBinding,
      requestDigest: commits[0]!.requestDigest,
      stageDigest: commits[0]!.stageDigest,
      responseDigest: digest(commits[0]!.publicResult),
    });
    await expect(
      ports.controlledWorkspace.reconcile(
        Object.freeze({
          ...controlledRequest,
          mode: 'reconcile' as const,
          ownerStateRevision: sealed.ownerStateRevision,
          ownerStateBundle: sealed.ownerStateBundle,
          ownerStateRootDigest: sealed.ownerStateRootDigest,
          stageDigest: sealed.stageDigest,
        })
      )
    ).rejects.toThrow('controlled-stateful-reconcile-must-use-sealed-state');
    await expect(ports.close()).resolves.toEqual({
      status: 'clean',
      residualResourceIds: {
        controlledWorkspace: [],
        verificationEvidence: [],
      },
      residualCanaryIds: [],
    });
  });

  it('persists only the Verification public projection and reconstructs callback-bound secrets with execute=0', async () => {
    const commits: AgentEvaluationOwnerStateCommitTransitionInput[] = [];
    const execute = vi.fn(
      async (
        context: OwnerStateExecutionContext<AgentEvaluationVerificationEvidenceOwnerStateSnapshot>
      ) =>
        Object.freeze({
          response: verificationResponse(context.request.requestDigest),
          publicResult: verificationPublicResult(context.request.requestDigest),
          snapshot: verificationSnapshot(context),
        })
    );
    const reconstructResponse = vi.fn(async ({ request }) =>
      verificationResponse(request.requestDigest)
    );
    const controlledWorkspace: ProductionControlledWorkspaceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze([]);
        },
        async execute() {
          throw new Error('Controlled Workspace is outside this test.');
        },
        async executeStateless() {
          return Object.freeze([]);
        },
        async reconcileStateless() {
          return Object.freeze({ facts: Object.freeze([]), reconciled: false });
        },
        close: clean,
      });
    const verificationEvidence: ProductionVerificationEvidenceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze({});
        },
        execute,
        reconstructResponse,
        close: clean,
      });
    const ports =
      createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts({
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        controlledWorkspace,
        verificationEvidence,
        createIngressClient: () => createIngress(commits),
      });

    const stageDigest =
      await ports.verificationEvidence.stage(verificationRequest);
    const result = (await ports.verificationEvidence.execute(
      Object.freeze({
        ...verificationRequest,
        mode: 'execute' as const,
        stageDigest,
      })
    )) as Readonly<{
      transition: AgentEvaluationOwnerStateTransition;
      response: unknown;
    }>;
    expect(result.response).toEqual(
      verificationResponse(verificationRequest.requestDigest)
    );
    const persisted = canonicalJsonText(result.transition);
    expect(persisted).not.toContain(uploadCapability);
    expect(persisted).not.toContain(attestationNonce);
    expect(
      result.transition.ownerStateBundle.recentOperations.at(-1)
    ).toMatchObject({
      operation: 'promotion.prepare',
      responseDigest: digest(commits[0]!.publicResult),
    });

    const { ownerStateBundle: _bundle, ...sealedOwnerOperation } =
      result.transition;
    const reconciled = await ports.verificationEvidence.reconcile(
      Object.freeze({
        ...verificationRequest,
        mode: 'reconcile' as const,
        stageDigest: result.transition.stageDigest,
        dispatchAckDigest: result.transition.dispatchAckDigest,
        ownerStateRevision: result.transition.ownerStateRevision,
        ownerStateRootDigest: result.transition.ownerStateRootDigest,
        ownerStateBundle: result.transition.ownerStateBundle,
        sealedOwnerOperation,
      })
    );
    expect(reconciled).toEqual({
      response: verificationResponse(verificationRequest.requestDigest),
      reconciled: true,
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(reconstructResponse).toHaveBeenCalledOnce();
    expect(commits).toHaveLength(1);
  });

  it('fails shutdown closed when either owner reports a residual resource', async () => {
    const dirtyClose = () =>
      Promise.resolve({
        status: 'clean' as const,
        residualResourceIds: Object.freeze([
          'controlled-session.workspace-verification-owner',
        ]) as unknown as readonly [],
        residualCanaryIds: Object.freeze([]) as readonly [],
      });
    const controlledWorkspace: ProductionControlledWorkspaceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze([]);
        },
        async execute() {
          throw new Error('Execution is outside this test.');
        },
        async executeStateless() {
          return Object.freeze([]);
        },
        async reconcileStateless() {
          return Object.freeze({ facts: Object.freeze([]), reconciled: false });
        },
        close: dirtyClose,
      });
    const verificationEvidence: ProductionVerificationEvidenceOwnerEngine =
      Object.freeze({
        async read() {
          return Object.freeze({});
        },
        async execute() {
          throw new Error('Execution is outside this test.');
        },
        async reconstructResponse() {
          throw new Error('Reconciliation is outside this test.');
        },
        close: clean,
      });
    const ports =
      createProductionAgentEvaluationWorkspaceVerificationOwnerAuthorityPorts({
        environment: () => undefined,
        forbiddenCanaries: () => Object.freeze([forbiddenCanary]),
        controlledWorkspace,
        verificationEvidence,
        createIngressClient: () => createIngress([]),
      });

    await expect(ports.close()).rejects.toThrow('resource-retirement-residual');
  });
});
