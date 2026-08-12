import { readFileSync } from 'node:fs';

import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  digestAgentCanonicalValue,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationPlan,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  createVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceVerifiedView,
  type CreateVerificationEvidenceVerifiedViewInput,
} from '@prodivix/verification';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  createAgentEvaluationVerificationEvidenceBridgeAuthority,
} from './evaluationVerificationEvidenceBridge';
import {
  AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
  AGENT_EVALUATION_OWNER_STATE_VERSION,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
  createAgentEvaluationOwnerStateIdentity,
  digestAgentEvaluationOwnerStateStage,
  type AgentEvaluationOwnerStateBundle,
} from './ownerState';
import type {
  AgentEvaluationOwnerStateQueryClient,
  AgentEvaluationOwnerStateReadResult,
} from './ownerStateQueryClient';
import {
  AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import { PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST } from './productionWorkspaceVerificationOwnerAuthorityPorts';
import {
  createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority,
  type ProductionAgentEvaluationVerifiedViewAuthorityInput,
  type ProductionAgentEvaluationVerifiedViewAuthority,
} from './productionVerificationEvidenceOwnerRead';

const vector = JSON.parse(
  readFileSync(
    new URL(
      '../../../apps/backend/internal/platform/agentcontract/testdata/agent-evaluation-vector.json',
      import.meta.url
    ),
    'utf8'
  )
) as {
  facts: {
    plan: { value: AgentModelEvaluationPlan };
    attempt: { value: { descriptor: AgentModelEvaluationAttemptDescriptor } };
  };
};

const plan = vector.facts.plan.value;
const descriptor = vector.facts.attempt.value.descriptor;
const digest = (value: unknown): CanonicalDigest =>
  digestAgentCanonicalValue(value);
const namespaceId = 'evaluation.namespace.verification-owner-read';
const generation = 2;
const workspaceId = 'workspace.verification-owner-read';
const projectId = 'project.verification-owner-read';
const workspaceRevision = 12;
const verificationPlanDigest = digest('verification-owner-read-plan');
const controlledWorkspaceGrantDigest = digest(
  'verification-owner-read-controlled-grant'
);
const sandboxRegistrationReceiptDigest = digest(
  'verification-owner-read-sandbox-registration'
);
const evidenceId = 'evidence.verification-owner-read';

const grantReceipt = (): AgentEvaluationVerificationAttemptGrantReceipt => {
  const issuanceBindingDigest = digest({
    namespaceId,
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation,
    workspaceId,
    workspaceRevision,
    projectId,
    verificationPlanDigest,
    cellId: 'cell.verification-owner-read',
  });
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId,
    projectId,
    workspaceRevision,
    partitionRevisionsDigest: digest('verification-owner-read-partitions'),
    policyRevision: 1,
    policyDigest: digest('verification-owner-read-policy'),
    policyEvaluationInstant: '2026-08-09T06:00:00.000Z',
    impactDigest: digest('verification-owner-read-impact'),
    planDigest: verificationPlanDigest,
    cellId: 'cell.verification-owner-read',
    checkId: 'check.verification-owner-read',
    checkKind: 'integration',
    targetId: 'target.verification-owner-read',
    attemptId: descriptor.attemptId,
    runId: 'run.verification-owner-read',
    providerId: 'provider.verification-owner-read',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'remote-attested' as const,
    retentionRequest: Object.freeze({
      successful: 'release' as const,
      failed: 'session' as const,
      protectReleaseEvidence: true,
    }),
    maximumClosureEvidenceRecords: 32,
    issuedBy: `g4-evaluation.${issuanceBindingDigest.slice(7)}`,
    issuedAt: '2026-08-09T06:00:00.000Z',
    expiresAt: '2026-08-09T06:10:00.000Z',
  });
  const grantDigest = digest(grantBase);
  const receiptBase = Object.freeze({
    format:
      'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const,
    version: 1 as const,
    namespaceId,
    evaluationPlanDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    evaluationAttemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    capabilityDescriptorDigest: descriptor.capabilityDescriptorDigest,
    caseId: descriptor.caseId,
    generation,
    verificationPlanDigest,
    cellId: grantBase.cellId,
    requestDigest: digest('verification-owner-read-grant-request'),
    issuanceBindingDigest,
    grant: Object.freeze({
      grantId: `attempt-grant-${grantDigest.slice(7)}`,
      grantDigest,
      workspaceId,
      projectId,
      workspaceRevision,
      partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
      policyRevision: grantBase.policyRevision,
      policyDigest: grantBase.policyDigest,
      policyEvaluationInstant: grantBase.policyEvaluationInstant,
      impactDigest: grantBase.impactDigest,
      verificationPlanDigest,
      cellId: grantBase.cellId,
      checkId: grantBase.checkId,
      checkKind: grantBase.checkKind,
      targetId: grantBase.targetId,
      attemptId: grantBase.attemptId,
      runId: grantBase.runId,
      providerId: grantBase.providerId,
      producerId: grantBase.producerId,
      trustCeiling: grantBase.trustCeiling,
      retentionRequest: grantBase.retentionRequest,
      maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
      issuedBy: grantBase.issuedBy,
      issuedAt: grantBase.issuedAt,
      expiresAt: grantBase.expiresAt,
    }),
  });
  return Object.freeze({
    ...receiptBase,
    receiptDigest: digest(receiptBase),
  });
};

const authority = createAgentEvaluationVerificationEvidenceBridgeAuthority({
  namespaceId,
  evaluationPlanDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
  descriptor,
  generation,
  controlledWorkspaceGrantDigest,
  projectId,
  workspaceId,
  workspaceRevision,
  verificationPlanDigest,
  sandboxPolicyDigest: digest('verification-owner-read-sandbox-policy'),
  adapterRegistryDigest: digest('verification-owner-read-adapter-registry'),
  baseSnapshotDigest: digest('verification-owner-read-base-snapshot'),
  finalSnapshotDigest: digest('verification-owner-read-final-snapshot'),
  verificationAttemptGrantReceipts: Object.freeze([grantReceipt()]),
});

const view = createVerificationEvidenceVerifiedView({
  closureEvaluationInstant: '2026-08-09T06:05:00.000Z',
  revocationRecordDigest: digest('verification-owner-read-revocations'),
  records: Object.freeze([
    Object.freeze({
      evidenceId,
      manifestDigest: digest('verification-owner-read-manifest'),
      materializedEvidenceDigest: digest(
        'verification-owner-read-materialized-evidence'
      ),
      effectiveTrust: 'remote-attested' as const,
      trustStatus: 'verified' as const,
      attestationDigest: digest('verification-owner-read-attestation'),
      retentionState: 'active' as const,
      revocationRecordDigests: Object.freeze([]),
      artifacts: Object.freeze([
        Object.freeze({
          artifactId: 'artifact.verification-owner-read',
          digest: digest('verification-owner-read-artifact'),
          status: 'available' as const,
        }),
      ]),
    }),
  ] satisfies CreateVerificationEvidenceVerifiedViewInput['records']),
});

const payloadBase = Object.freeze({
  format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
  version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
  kind: 'verified-view-resolve-request' as const,
  authority,
  sandboxRegistrationReceiptDigest,
  evidenceIds: Object.freeze([evidenceId]),
  workspaceRevision,
  verificationPlanDigest,
  idempotencyKey: 'verified-view-read-idempotency',
});
const requestDigest = digest(payloadBase);
const payload = Object.freeze({ ...payloadBase, requestDigest });

const identity = Object.freeze({
  serviceKind: 'verification-evidence' as const,
  namespaceId,
  planDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
  attemptId: descriptor.attemptId,
  descriptorDigest: descriptor.descriptorDigest,
  generation,
  grantOrAuthorityDigest: authority.authorityDigest,
});
const ownerStateId = createAgentEvaluationOwnerStateIdentity(identity);

const createDurableState = (
  state: 'active' | 'finalized' = 'finalized'
): AgentEvaluationOwnerStateReadResult => {
  const finalManifest = Object.freeze({
    evidenceId,
    manifestDigest: view.records[0]!.manifestDigest,
  });
  const evidenceRecords = view.records;
  const attestationStatement = Object.freeze({
    format: 'prodivix.verification-attestation-statement',
    evidenceId,
  });
  const snapshotBase = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_STATE_SNAPSHOT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    attemptId: descriptor.attemptId,
    descriptorDigest: descriptor.descriptorDigest,
    generation,
    authorityDigest: authority.authorityDigest,
    sandboxRegistrationReceiptDigest,
    revision: 1,
    state,
    promotionId: 'promotion.verification-owner-read',
    evidenceId,
    projectId,
    workspaceId,
    workspaceRevision,
    verificationPlanDigest,
    adapterRegistryDigest: authority.adapterRegistryDigest,
    candidate: null,
    candidateDigest: null,
    createdAt: '2026-08-09T06:00:00.000Z',
    deadlineAt: '2026-08-09T06:03:00.000Z',
    uploadCapabilityDigest: digest('verification-owner-read-upload-capability'),
    attestationNonceDigest:
      state === 'finalized'
        ? digest('verification-owner-read-attestation-nonce')
        : null,
    attestationStatement: state === 'finalized' ? attestationStatement : null,
    attestationStatementDigest:
      state === 'finalized' ? digest(attestationStatement) : null,
    uploadedArtifactManifests: null,
    artifactManifestSetDigest: null,
    verifiedClaims: null,
    verifiedClaimSetDigest: null,
    finalManifest: state === 'finalized' ? finalManifest : null,
    finalManifestDigest: state === 'finalized' ? digest(finalManifest) : null,
    evidenceRecords: state === 'finalized' ? evidenceRecords : null,
    evidenceRecordSetDigest:
      state === 'finalized' ? digest(evidenceRecords) : null,
  });
  const snapshot = Object.freeze({
    ...snapshotBase,
    snapshotDigest: digest(snapshotBase),
  });
  const operation =
    state === 'finalized'
      ? ('promotion.final-commit' as const)
      : ('promotion.create' as const);
  const routeBinding =
    state === 'finalized'
      ? 'promotions/{promotionId}/final-commit'
      : 'promotions';
  const responseProjection =
    state === 'finalized'
      ? finalManifest
      : Object.freeze({
          kind: 'promotion-created' as const,
          promotionId: snapshot.promotionId,
          evidenceId,
          uploadCapabilityDigest: snapshot.uploadCapabilityDigest,
        });
  const publicResult = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_PUBLIC_RESULT_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    operation,
    requestDigest: digest(`verification-owner-read-${operation}-request`),
    responseReceiptDigest: digest(
      `verification-owner-read-${operation}-receipt`
    ),
    responseProjection,
    responseProjectionDigest: digest(responseProjection),
  });
  const stageDigest = digestAgentEvaluationOwnerStateStage({
    serviceKind: identity.serviceKind,
    operation,
    routeBinding,
    requestDigest: publicResult.requestDigest,
    ownerImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_VERIFICATION_EVIDENCE_OWNER_IMPLEMENTATION_DIGEST,
    ownerStateId,
    priorOwnerStateRevision: 0,
    priorOwnerStateRootDigest: null,
  });
  const operationBase = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_OPERATION_RECORD_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    sequence: 1,
    operation,
    routeBinding,
    requestDigest: publicResult.requestDigest,
    stageDigest,
    responseDigest: digest(publicResult),
  });
  const recentOperations = Object.freeze([
    Object.freeze({
      ...operationBase,
      recordDigest: digest(operationBase),
    }),
  ]);
  const empty = Object.freeze([]);
  const bundle: AgentEvaluationOwnerStateBundle = Object.freeze({
    format: AGENT_EVALUATION_OWNER_STATE_BUNDLE_FORMAT,
    version: AGENT_EVALUATION_OWNER_STATE_VERSION,
    serviceKind: identity.serviceKind,
    namespaceId,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    ownerStateId,
    revision: 1,
    previousOwnerStateRootDigest: null,
    snapshotKind: identity.serviceKind,
    snapshot,
    snapshotDigest: snapshot.snapshotDigest,
    casArtifacts: empty,
    casArtifactSetDigest: digest(empty),
    recentOperations,
    recentOperationSetDigest: digest(recentOperations),
  });
  return Object.freeze({
    serviceKind: identity.serviceKind,
    operation: 'verified-view.resolve' as const,
    ownerStateId,
    ownerStateRevision: bundle.revision,
    ownerStateRootDigest: digest(bundle),
    snapshotKind: identity.serviceKind,
    snapshotDigest: snapshot.snapshotDigest,
    snapshotState: state,
    updatedAt: '2026-08-09T06:05:00.000Z',
    ownerStateBundle: bundle,
    responseDigest: digest('verification-owner-read-state-response'),
  });
};

const request = Object.freeze({
  format: AGENT_EVALUATION_OWNER_AUTHORITY_REQUEST_FORMAT,
  version: 1 as const,
  serviceKind: 'verification-evidence' as const,
  mode: 'read' as const,
  namespaceId,
  planDigest: plan.planDigest,
  repositoryCommit: plan.repositoryCommit,
  operation: 'verified-view.resolve',
  routeBinding: 'verified-view/resolve',
  requestDigest,
  attemptId: descriptor.attemptId,
  descriptorDigest: descriptor.descriptorDigest,
  generation,
  controlledWorkspaceGrantDigest,
  authorityDigest: authority.authorityDigest,
  sandboxRegistrationReceiptDigest,
  claimGeneration: 0,
  payload,
}) satisfies AgentEvaluationOwnerAuthorityRequest;

const response = () => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_EVIDENCE_BRIDGE_VERSION,
    kind: 'verified-view-resolved' as const,
    requestDigest,
    verifiedEvidenceView: encodeVerificationEvidenceVerifiedView(view),
    revokedEvidenceIds: Object.freeze([]),
  });
  return Object.freeze({ ...base, receiptDigest: digest(base) });
};

const decodedResponse = () =>
  Object.freeze({
    ...response(),
    verifiedEvidenceView: view,
  });

describe('production Verification Evidence owner read authority', () => {
  it('derives the durable owner identity and resolves current mutable facts on every host read', async () => {
    const read = vi.fn(async () => createDurableState());
    const query = Object.freeze({
      async list() {
        throw new Error('List is outside the Verification read path.');
      },
      read,
      async readArtifact() {
        throw new Error('CAS is outside the Verification read path.');
      },
    }) satisfies AgentEvaluationOwnerStateQueryClient;
    const resolve = vi.fn(
      async (_input: ProductionAgentEvaluationVerifiedViewAuthorityInput) =>
        response()
    );
    const verifiedViewAuthority = Object.freeze({
      resolve,
    }) satisfies ProductionAgentEvaluationVerifiedViewAuthority;
    const ownerRead =
      createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority({
        ownerStateQueryFor: () => query,
        verifiedViewAuthority,
        forbiddenCanaries: () => Object.freeze(['forbidden-view-canary']),
      });

    await expect(ownerRead.read(request)).resolves.toEqual(decodedResponse());
    await expect(ownerRead.read(request)).resolves.toEqual(decodedResponse());
    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenNthCalledWith(
      1,
      {
        serviceKind: 'verification-evidence',
        operation: 'verified-view.resolve',
      },
      ownerStateId
    );
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve.mock.calls[0]![0]).toMatchObject({
      evidenceIds: [evidenceId],
      snapshot: { state: 'finalized', evidenceRecords: view.records },
    });
  });

  it('fails closed before the mutable authority when the durable state is not finalized', async () => {
    const query = Object.freeze({
      async list() {
        throw new Error('List is outside the Verification read path.');
      },
      async read() {
        return createDurableState('active');
      },
      async readArtifact() {
        throw new Error('CAS is outside the Verification read path.');
      },
    }) satisfies AgentEvaluationOwnerStateQueryClient;
    const resolve = vi.fn(
      async (_input: ProductionAgentEvaluationVerifiedViewAuthorityInput) =>
        response()
    );
    const ownerRead =
      createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority({
        ownerStateQueryFor: () => query,
        verifiedViewAuthority: Object.freeze({ resolve }),
        forbiddenCanaries: () => Object.freeze(['forbidden-view-canary']),
      });

    await expect(ownerRead.read(request)).rejects.toThrow(
      'durable-snapshot-binding'
    );
    expect(resolve).not.toHaveBeenCalled();
  });

  it('rejects a swapped current-view receipt after durable recovery', async () => {
    const query = Object.freeze({
      async list() {
        throw new Error('List is outside the Verification read path.');
      },
      async read() {
        return createDurableState();
      },
      async readArtifact() {
        throw new Error('CAS is outside the Verification read path.');
      },
    }) satisfies AgentEvaluationOwnerStateQueryClient;
    const ownerRead =
      createProductionAgentEvaluationVerificationEvidenceOwnerReadAuthority({
        ownerStateQueryFor: () => query,
        verifiedViewAuthority: Object.freeze({
          async resolve() {
            return Object.freeze({
              ...response(),
              receiptDigest: digest('swapped-view-receipt'),
            });
          },
        }),
        forbiddenCanaries: () => Object.freeze(['forbidden-view-canary']),
      });

    await expect(ownerRead.read(request)).rejects.toThrow(
      'verified-view-receipt'
    );
  });
});
