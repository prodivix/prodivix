import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { digestAgentCanonicalValue, type CanonicalDigest } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createVerificationEvidenceStatementDigest } from '@prodivix/verification';
import {
  AGENT_EVALUATION_CONTROLLED_WORKSPACE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
  createAgentEvaluationOwnerStateIdentity,
  digestAgentEvaluationOwnerStateDispatchAck,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationOwnerStateBundle,
  type AgentEvaluationOwnerStateIdentityInput,
  type AgentEvaluationOwnerStateTransition,
} from './ownerState';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  createAgentEvaluationOwnerAuthorityDurability,
  createAgentEvaluationOwnerAuthorityResourceRetirementReceipt,
  createProductionAgentEvaluationOwnerAuthoritySidecar,
  type AgentEvaluationOwnerAuthorityRequest,
  type AgentEvaluationProductionFullAttemptOwnerAuthorityPorts,
} from './productionOwnerAuthoritySidecar';
import { createFileAgentEvaluationOwnerAuthorityReplayJournal } from './productionOwnerAuthoritySidecarJournal';
import { createVerificationEvidenceOwnerTestStatement } from './productionVerificationEvidenceLifecycleEngine.fixture';

const directories: string[] = [];
const serviceToken = 'owner-state-sidecar-token-'.padEnd(40, 'x');
const commit = 'd'.repeat(40);
const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const planDigest = digest('owner-state-sidecar-plan');
const namespaceId = 'evaluation.namespace.owner-state-sidecar';
const ownerImplementationDigest = digest('owner-state-sidecar-owner');

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const directory = async () => {
  const value = await mkdtemp(join(tmpdir(), 'prodivix-owner-state-sidecar-'));
  directories.push(value);
  return value;
};

const controlledIdentity = Object.freeze({
  serviceKind: 'controlled-workspace' as const,
  namespaceId,
  planDigest,
  repositoryCommit: commit,
  attemptId: 'evaluation-attempt.owner-state-sidecar',
  descriptorDigest: digest('owner-state-sidecar-descriptor'),
  generation: 3,
  grantOrAuthorityDigest: digest('owner-state-sidecar-grant'),
});
const controlledOperation = 'session.load-or-reattach';
const controlledRouteBinding = 'sessions/load-or-reattach';
const controlledRequestDigest = digest('controlled-owner-state-request');
const controlledPublicResult = Object.freeze({
  status: 'loaded',
  sessionId: 'controlled-session.owner-state-sidecar',
});

const createRecentOperations = (input: {
  identity: AgentEvaluationOwnerStateIdentityInput;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  publicResult: unknown;
}) => {
  const stageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(input.identity),
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    stageDigest,
    responseDigest: digest(input.publicResult),
  });
  return Object.freeze([
    Object.freeze({ ...base, recordDigest: digest(base) }),
  ]);
};

const createControlledBundle = (): AgentEvaluationOwnerStateBundle => {
  const workspaceSnapshot = Object.freeze({
    format: 'prodivix.workspace.snapshot',
    revision: 4,
  });
  const toolDefinitions = Object.freeze([]);
  const actionRegistry = Object.freeze({ actions: Object.freeze([]) });
  const verificationPlan = Object.freeze({ cells: Object.freeze([]) });
  const adapterRegistry = Object.freeze({ entries: Object.freeze([]) });
  const artifactDescriptors = Object.freeze([]);
  const initialCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-sidecar.initial',
    attemptId: controlledIdentity.attemptId,
    grantDigest: controlledIdentity.grantOrAuthorityDigest,
    generation: controlledIdentity.generation,
    snapshotDigest: digest('owner-state-sidecar-initial-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-sidecar-initial-persistence'
    ),
  });
  const initialCheckpoint = Object.freeze({
    ...initialCheckpointBase,
    checkpointDigest: digest(initialCheckpointBase),
  });
  const currentCheckpointBase = Object.freeze({
    checkpointRef: 'checkpoint.owner-state-sidecar.current',
    attemptId: controlledIdentity.attemptId,
    grantDigest: controlledIdentity.grantOrAuthorityDigest,
    generation: controlledIdentity.generation,
    predecessorCheckpointDigest: initialCheckpoint.checkpointDigest,
    snapshotDigest: digest('owner-state-sidecar-current-snapshot'),
    securePersistenceReceiptDigest: digest(
      'owner-state-sidecar-current-persistence'
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
    repositoryCommit: commit,
    attemptId: controlledIdentity.attemptId,
    descriptorDigest: controlledIdentity.descriptorDigest,
    caseId: 'case.owner-state-sidecar',
    materialDigest: digest('owner-state-sidecar-material'),
    fixtureDigest: digest('owner-state-sidecar-fixture'),
    grantDigest: controlledIdentity.grantOrAuthorityDigest,
    generation: controlledIdentity.generation,
    sessionId: 'controlled-session.owner-state-sidecar',
    isolationPolicyDigest: digest('owner-state-sidecar-isolation'),
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
    g3VerificationPlan: verificationPlan,
    verificationPlanDigest: digest(verificationPlan),
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
  const empty = Object.freeze([]);
  const recentOperations = createRecentOperations({
    identity: controlledIdentity,
    operation: controlledOperation,
    routeBinding: controlledRouteBinding,
    requestDigest: controlledRequestDigest,
    publicResult: controlledPublicResult,
  });
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: controlledIdentity.serviceKind,
    namespaceId,
    planDigest,
    repositoryCommit: commit,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(controlledIdentity),
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: controlledIdentity.serviceKind,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts: empty,
    casArtifactSetDigest: digest(empty),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
};

const verificationIdentity = Object.freeze({
  ...controlledIdentity,
  serviceKind: 'verification-evidence' as const,
  grantOrAuthorityDigest: digest('owner-state-verification-authority'),
});

const uploadCapability = 'upload-capability-'.padEnd(48, 'u');
const attestationNonce = 'attestation-nonce-'.padEnd(32, 'n');
const attestationStatement = createVerificationEvidenceOwnerTestStatement(
  'evidence.owner-state-sidecar',
  verificationIdentity.attemptId
);
const attestationStatementDigest =
  createVerificationEvidenceStatementDigest(attestationStatement);
const responseReceiptDigest = digest('verification-response-receipt');
const rawVerificationResponse = Object.freeze({
  format: 'prodivix.agent-evaluation-verification-evidence-bridge',
  version: 1,
  kind: 'promotion-prepared',
  requestDigest: digest('verification-owner-state-request'),
  promotionId: 'promotion.owner-state-sidecar',
  evidenceId: 'evidence.owner-state-sidecar',
  attestationNonce,
  attestationStatement,
  attestationStatementDigest,
  receiptDigest: responseReceiptDigest,
});
const verificationPublicProjection = Object.freeze({
  kind: rawVerificationResponse.kind,
  promotionId: rawVerificationResponse.promotionId,
  evidenceId: rawVerificationResponse.evidenceId,
  attestationNonceDigest: digest(attestationNonce),
  attestationStatement,
  attestationStatementDigest:
    rawVerificationResponse.attestationStatementDigest,
});
const verificationPublicResult = Object.freeze({
  format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
  version: 1 as const,
  operation: 'promotion.prepare' as const,
  requestDigest: rawVerificationResponse.requestDigest,
  responseReceiptDigest,
  responseProjection: verificationPublicProjection,
  responseProjectionDigest: digest(verificationPublicProjection),
});

const createVerificationBundle = (): AgentEvaluationOwnerStateBundle => {
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId,
    planDigest,
    repositoryCommit: commit,
    attemptId: verificationIdentity.attemptId,
    descriptorDigest: verificationIdentity.descriptorDigest,
    generation: verificationIdentity.generation,
    authorityDigest: verificationIdentity.grantOrAuthorityDigest,
    sandboxRegistrationReceiptDigest: digest('sandbox-registration'),
    revision: 1,
    state: 'prepared' as const,
    promotionId: rawVerificationResponse.promotionId,
    evidenceId: rawVerificationResponse.evidenceId,
    projectId: 'project.owner-state-sidecar',
    workspaceId: 'workspace.owner-state-sidecar',
    workspaceRevision: 4,
    verificationPlanDigest: digest('verification-plan'),
    adapterRegistryDigest: digest('verification-adapter-registry'),
    candidate: null,
    candidateDigest: null,
    createdAt: '2026-08-09T06:00:00.000Z',
    deadlineAt: '2026-08-09T06:03:00.000Z',
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
  const snapshot = Object.freeze({
    ...snapshotBase,
    snapshotDigest: digest(snapshotBase),
  });
  const empty = Object.freeze([]);
  const recentOperations = createRecentOperations({
    identity: verificationIdentity,
    operation: 'promotion.prepare',
    routeBinding: 'promotions/{promotionId}/prepare',
    requestDigest: rawVerificationResponse.requestDigest,
    publicResult: verificationPublicResult,
  });
  return Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: verificationIdentity.serviceKind,
    namespaceId,
    planDigest,
    repositoryCommit: commit,
    ownerStateId: createAgentEvaluationOwnerStateIdentity(verificationIdentity),
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: verificationIdentity.serviceKind,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts: empty,
    casArtifactSetDigest: digest(empty),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
};

const createTransition = (input: {
  identity: AgentEvaluationOwnerStateIdentityInput;
  bundle: AgentEvaluationOwnerStateBundle;
  operation: string;
  routeBinding: string;
  requestDigest: CanonicalDigest;
  publicResult: unknown;
}): AgentEvaluationOwnerStateTransition => {
  const ownerStateId = createAgentEvaluationOwnerStateIdentity(input.identity);
  const stageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest,
    ownerStateId,
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_SEALED_OWNER_OPERATION_FORMAT,
    version: 1 as const,
    serviceKind: input.identity.serviceKind,
    operation: input.operation,
    routeBinding: input.routeBinding,
    requestDigest: input.requestDigest,
    ownerImplementationDigest,
    ownerStateId,
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
    stageDigest,
    publicResult: input.publicResult,
    responseDigest: digest(input.publicResult),
    ownerStateRevision: 1,
    ownerStateRootDigest: digest(input.bundle),
  });
  const withAck = Object.freeze({
    ...base,
    dispatchAckDigest: digestAgentEvaluationOwnerStateDispatchAck(base),
  });
  return Object.freeze({
    ...withAck,
    resultReceiptDigest: digest(withAck),
    ownerStateBundle: input.bundle,
  });
};

type State = {
  executeCalls: number;
  reconcileCalls: number;
  controlledTransition: AgentEvaluationOwnerStateTransition;
  verificationTransition: AgentEvaluationOwnerStateTransition;
};

const createPorts = (
  state: State
): AgentEvaluationProductionFullAttemptOwnerAuthorityPorts => {
  const durability = createAgentEvaluationOwnerAuthorityDurability();
  const base = (authorityId: string) =>
    Object.freeze({
      authorityId,
      implementationDigest: ownerImplementationDigest,
      durability,
      async stage() {
        throw new Error('stateful stage is canonical at the sidecar');
      },
      async execute(request: AgentEvaluationOwnerAuthorityRequest) {
        state.executeCalls += 1;
        if (request.serviceKind === 'verification-evidence') {
          return Object.freeze({
            transition: state.verificationTransition,
            response: rawVerificationResponse,
          });
        }
        return state.controlledTransition;
      },
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        state.reconcileCalls += 1;
        return Object.freeze({
          response:
            request.serviceKind === 'verification-evidence'
              ? rawVerificationResponse
              : null,
          reconciled: request.serviceKind === 'verification-evidence',
        });
      },
    });
  const controlledBase = base('controlled-workspace.owner-state');
  const verificationBase = base('verification-evidence.owner-state');
  const attemptBase = base('attempt.owner-state');
  const ports = {
    purpose: 'full-attempt' as const,
    controlledWorkspace: Object.freeze({
      ...controlledBase,
      async read() {
        return Object.freeze([]);
      },
      async execute(request: AgentEvaluationOwnerAuthorityRequest) {
        return (await controlledBase.execute(
          request
        )) as AgentEvaluationOwnerStateTransition;
      },
      async reconcile() {
        throw new Error('controlled state reconcile uses sealed 8790 state');
      },
    }),
    verificationEvidence: Object.freeze({
      ...verificationBase,
      async read() {
        return Object.freeze({});
      },
    }),
    providerCapability: attemptBase,
    attemptGrading: attemptBase,
  };
  return Object.freeze({
    ...ports,
    async close() {
      return createAgentEvaluationOwnerAuthorityResourceRetirementReceipt(
        ports
      );
    },
  });
};

const controlledRequestBase = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: 1 as const,
  serviceKind: 'controlled-workspace' as const,
  namespaceId,
  planDigest,
  repositoryCommit: commit,
  operation: controlledOperation,
  routeBinding: controlledRouteBinding,
  requestDigest: controlledRequestDigest,
  attemptId: controlledIdentity.attemptId,
  descriptorDigest: controlledIdentity.descriptorDigest,
  generation: controlledIdentity.generation,
  controlledWorkspaceGrantDigest: controlledIdentity.grantOrAuthorityDigest,
  ownerImplementationDigest,
  ownerStateRevision: 0,
  ownerStateBundle: null,
  ownerStateRootDigest: null,
  claimGeneration: 1,
  payload: Object.freeze({ kind: 'load-or-reattach-request' }),
});

const verificationRequestBase = Object.freeze({
  ...controlledRequestBase,
  serviceKind: 'verification-evidence' as const,
  operation: 'promotion.prepare',
  routeBinding: 'promotions/{promotionId}/prepare',
  requestDigest: rawVerificationResponse.requestDigest,
  controlledWorkspaceGrantDigest: digest('verification-controlled-grant'),
  authorityDigest: verificationIdentity.grantOrAuthorityDigest,
  sandboxRegistrationReceiptDigest: digest('sandbox-registration'),
  payload: Object.freeze({ kind: 'promotion-prepare-request' }),
});

const post = (
  baseUrl: string,
  path: string,
  request: AgentEvaluationOwnerAuthorityRequest
): Promise<Response> =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': request.requestDigest,
    },
    body: canonicalJsonText(request),
  });

const start = async (stateDirectory: string, state: State) => {
  const authorities = createPorts(state);
  const sidecar = createProductionAgentEvaluationOwnerAuthoritySidecar({
    serviceToken,
    authorities,
    journal:
      await createFileAgentEvaluationOwnerAuthorityReplayJournal(
        stateDirectory
      ),
    forbiddenCanaries: () => Object.freeze(['forbidden-owner-state-canary']),
  });
  return sidecar.listen({ host: '127.0.0.1', port: 0 });
};

const createState = (): State => ({
  executeCalls: 0,
  reconcileCalls: 0,
  controlledTransition: createTransition({
    identity: controlledIdentity,
    bundle: createControlledBundle(),
    operation: controlledRequestBase.operation,
    routeBinding: controlledRequestBase.routeBinding,
    requestDigest: controlledRequestBase.requestDigest,
    publicResult: controlledPublicResult,
  }),
  verificationTransition: createTransition({
    identity: verificationIdentity,
    bundle: createVerificationBundle(),
    operation: verificationRequestBase.operation,
    routeBinding: verificationRequestBase.routeBinding,
    requestDigest: verificationRequestBase.requestDigest,
    publicResult: verificationPublicResult,
  }),
});

describe('production owner authority owner-state wire', () => {
  it('stages canonically, executes one effect, and reconciles an empty host from sealed state with execute=0', async () => {
    const hostAState = createState();
    const hostADirectory = await directory();
    const hostA = await start(hostADirectory, hostAState);
    const stageRequest = Object.freeze({
      ...controlledRequestBase,
      mode: 'stage' as const,
    }) satisfies AgentEvaluationOwnerAuthorityRequest;
    const expectedStage = hostAState.controlledTransition.stageDigest;
    try {
      const staged = await post(
        hostA.baseUrl,
        '/v1/controlled-workspace/stage',
        stageRequest
      );
      expect(staged.status).toBe(200);
      expect(await staged.json()).toMatchObject({
        mode: 'stage',
        ownerStateId: hostAState.controlledTransition.ownerStateId,
        priorOwnerStateRevision: 0,
        priorOwnerStateRootDigest: null,
        stageDigest: expectedStage,
      });

      const executeRequest = Object.freeze({
        ...controlledRequestBase,
        mode: 'execute' as const,
        stageDigest: expectedStage,
      }) satisfies AgentEvaluationOwnerAuthorityRequest;
      const executed = await post(
        hostA.baseUrl,
        '/v1/controlled-workspace/execute',
        executeRequest
      );
      expect(executed.status).toBe(200);
      expect(await executed.json()).toMatchObject({
        mode: 'execute',
        ownerStateRevision: 1,
        resultReceiptDigest:
          hostAState.controlledTransition.resultReceiptDigest,
      });
      expect(hostAState.executeCalls).toBe(1);
    } finally {
      await hostA.close();
    }
    const hostAFiles = await readdir(hostADirectory, { recursive: true });
    const hostARecordPath = hostAFiles.find((entry) => entry.endsWith('.json'));
    expect(hostARecordPath).toBeDefined();
    const hostARecord = JSON.parse(
      await readFile(join(hostADirectory, hostARecordPath!), 'utf8')
    ) as Readonly<{ requestBindingDigest: CanonicalDigest }>;

    const hostBState = createState();
    const hostBDirectory = await directory();
    const hostB = await start(hostBDirectory, hostBState);
    try {
      const transition = hostAState.controlledTransition;
      const { ownerStateBundle: _bundle, ...sealedOwnerOperation } = transition;
      const reconcileRequest = Object.freeze({
        ...controlledRequestBase,
        mode: 'reconcile' as const,
        ownerStateRevision: transition.ownerStateRevision,
        ownerStateBundle: transition.ownerStateBundle,
        ownerStateRootDigest: transition.ownerStateRootDigest,
        stageDigest: transition.stageDigest,
        dispatchAckDigest: transition.dispatchAckDigest,
        sealedOwnerOperation,
      }) satisfies AgentEvaluationOwnerAuthorityRequest;
      const reconciled = await post(
        hostB.baseUrl,
        '/v1/controlled-workspace/reconcile',
        reconcileRequest
      );
      expect(reconciled.status).toBe(200);
      expect(await reconciled.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        resultReceiptDigest: transition.resultReceiptDigest,
      });
      expect(hostBState.executeCalls).toBe(0);
      expect(hostBState.reconcileCalls).toBe(0);
      const hostBFiles = await readdir(hostBDirectory, { recursive: true });
      const hostBRecordPath = hostBFiles.find((entry) =>
        entry.endsWith('.json')
      );
      expect(hostBRecordPath).toBeDefined();
      const hostBRecord = JSON.parse(
        await readFile(join(hostBDirectory, hostBRecordPath!), 'utf8')
      ) as Readonly<{ requestBindingDigest: CanonicalDigest }>;
      expect(hostBRecord.requestBindingDigest).not.toBe(
        hostARecord.requestBindingDigest
      );

      const forged = Object.freeze({
        ...reconcileRequest,
        dispatchAckDigest: digest('forged-owner-state-ack'),
      });
      expect(
        (
          await post(
            hostB.baseUrl,
            '/v1/controlled-workspace/reconcile',
            forged
          )
        ).status
      ).toBe(503);
    } finally {
      await hostB.close();
    }
  });

  it('returns callback-bound Verification secrets while persisting only the safe public-result receipt', async () => {
    const stateDirectory = await directory();
    const state = createState();
    const listener = await start(stateDirectory, state);
    try {
      const request = Object.freeze({
        ...verificationRequestBase,
        mode: 'execute' as const,
        stageDigest: state.verificationTransition.stageDigest,
      }) satisfies AgentEvaluationOwnerAuthorityRequest;
      const response = await post(
        listener.baseUrl,
        '/v1/verification-evidence/execute',
        request
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        publicResult: verificationPublicResult,
        response: rawVerificationResponse,
      });
      const journalFiles = await readdir(stateDirectory, { recursive: true });
      const journalFile = journalFiles.find((entry) => entry.endsWith('.json'));
      expect(journalFile).toBeDefined();
      const journalText = await readFile(
        join(stateDirectory, journalFile!),
        'utf8'
      );
      expect(journalText).not.toContain(uploadCapability);
      expect(journalText).not.toContain(attestationNonce);
      expect(journalText).toContain(
        state.verificationTransition.resultReceiptDigest
      );
    } finally {
      await listener.close();
    }
  });

  it('rehydrates a callback-bound Verification response from sealed state on an empty host with execute=0', async () => {
    const hostAState = createState();
    const hostA = await start(await directory(), hostAState);
    try {
      const request = Object.freeze({
        ...verificationRequestBase,
        mode: 'execute' as const,
        stageDigest: hostAState.verificationTransition.stageDigest,
      }) satisfies AgentEvaluationOwnerAuthorityRequest;
      const response = await post(
        hostA.baseUrl,
        '/v1/verification-evidence/execute',
        request
      );
      expect(response.status).toBe(200);
      expect(hostAState.executeCalls).toBe(1);
    } finally {
      await hostA.close();
    }

    const hostBDirectory = await directory();
    const hostBState = createState();
    const hostB = await start(hostBDirectory, hostBState);
    try {
      const transition = hostAState.verificationTransition;
      const { ownerStateBundle: _bundle, ...sealedOwnerOperation } = transition;
      const request = Object.freeze({
        ...verificationRequestBase,
        mode: 'reconcile' as const,
        ownerStateRevision: transition.ownerStateRevision,
        ownerStateBundle: transition.ownerStateBundle,
        ownerStateRootDigest: transition.ownerStateRootDigest,
        stageDigest: transition.stageDigest,
        dispatchAckDigest: transition.dispatchAckDigest,
        sealedOwnerOperation,
      }) satisfies AgentEvaluationOwnerAuthorityRequest;
      const response = await post(
        hostB.baseUrl,
        '/v1/verification-evidence/reconcile',
        request
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        mode: 'reconcile',
        reconciled: true,
        publicResult: verificationPublicResult,
        response: rawVerificationResponse,
        resultReceiptDigest: transition.resultReceiptDigest,
      });
      expect(hostBState.executeCalls).toBe(0);
      expect(hostBState.reconcileCalls).toBe(1);

      const journalFiles = await readdir(hostBDirectory, { recursive: true });
      const journalFile = journalFiles.find((entry) => entry.endsWith('.json'));
      expect(journalFile).toBeDefined();
      const journalText = await readFile(
        join(hostBDirectory, journalFile!),
        'utf8'
      );
      expect(journalText).not.toContain(uploadCapability);
      expect(journalText).not.toContain(attestationNonce);
      expect(journalText).toContain(transition.resultReceiptDigest);
    } finally {
      await hostB.close();
    }
  });
});
