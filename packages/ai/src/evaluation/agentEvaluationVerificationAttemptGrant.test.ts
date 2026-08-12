import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
  AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
  canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests,
  canonicalAgentEvaluationVerificationAttemptGrantReceipts,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  isAgentEvaluationVerificationAttemptGrantReceipt,
  type AgentEvaluationVerificationAttemptGrant,
  type AgentEvaluationVerificationAttemptGrantReceipt,
} from './agentEvaluationVerificationAttemptGrant';

const digest = (label: string) => digestAgentCanonicalValue({ label });

const receipt = (
  attemptId = 'evaluation-attempt:grant-test',
  cellId = 'cell.grant-test'
): AgentEvaluationVerificationAttemptGrantReceipt => {
  const identity = Object.freeze({
    namespaceId: 'namespace.g4',
    evaluationPlanDigest: digest('evaluation-plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    evaluationAttemptId: attemptId,
    descriptorDigest: digest(`descriptor:${attemptId}`),
    capabilityDescriptorDigest: digest('capability-descriptor'),
    caseId: 'case.g4',
    generation: 3,
    verificationPlanDigest: digest('verification-plan'),
    cellId,
  });
  const grantBase = Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: 'workspace.g4',
    projectId: 'project.g4',
    workspaceRevision: 7,
    partitionRevisionsDigest: digest('partitions'),
    policyRevision: 1,
    policyDigest: digest('policy'),
    policyEvaluationInstant: '2026-08-08T00:00:00.000Z',
    impactDigest: digest('impact'),
    planDigest: identity.verificationPlanDigest,
    cellId,
    checkId: 'check.g4',
    checkKind: 'integration',
    targetId: 'target.g4',
    attemptId,
    runId: 'run.g4',
    providerId: 'provider.g4',
    jobId: 'job.g4',
    sessionId: 'session.g4',
    producerId: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID,
    trustCeiling: 'local-unattested' as const,
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: false,
    }),
    maximumClosureEvidenceRecords: 32,
    issuedBy: `g4-evaluation.${digest('binding').slice(7)}`,
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-08T00:05:00.000Z',
  });
  const grantDigest = digestAgentCanonicalValue(grantBase);
  const grant: AgentEvaluationVerificationAttemptGrant = Object.freeze({
    grantId: `attempt-grant-${grantDigest.slice(7)}`,
    grantDigest,
    workspaceId: grantBase.workspaceId,
    projectId: grantBase.projectId,
    workspaceRevision: grantBase.workspaceRevision,
    partitionRevisionsDigest: grantBase.partitionRevisionsDigest,
    policyRevision: grantBase.policyRevision,
    policyDigest: grantBase.policyDigest,
    policyEvaluationInstant: grantBase.policyEvaluationInstant,
    impactDigest: grantBase.impactDigest,
    verificationPlanDigest: grantBase.planDigest,
    cellId: grantBase.cellId,
    checkId: grantBase.checkId,
    checkKind: grantBase.checkKind,
    targetId: grantBase.targetId,
    attemptId: grantBase.attemptId,
    runId: grantBase.runId,
    providerId: grantBase.providerId,
    jobId: grantBase.jobId,
    sessionId: grantBase.sessionId,
    producerId: grantBase.producerId,
    trustCeiling: grantBase.trustCeiling,
    retentionRequest: grantBase.retentionRequest,
    maximumClosureEvidenceRecords: grantBase.maximumClosureEvidenceRecords,
    issuedBy: grantBase.issuedBy,
    issuedAt: grantBase.issuedAt,
    expiresAt: grantBase.expiresAt,
  });
  const issuanceBindingDigest = digestAgentCanonicalValue({
    namespaceId: identity.namespaceId,
    evaluationPlanDigest: identity.evaluationPlanDigest,
    repositoryCommit: identity.repositoryCommit,
    evaluationAttemptId: identity.evaluationAttemptId,
    descriptorDigest: identity.descriptorDigest,
    capabilityDescriptorDigest: identity.capabilityDescriptorDigest,
    caseId: identity.caseId,
    generation: identity.generation,
    workspaceId: grant.workspaceId,
    workspaceRevision: grant.workspaceRevision,
    projectId: grant.projectId,
    verificationPlanDigest: identity.verificationPlanDigest,
    cellId: identity.cellId,
  });
  const base = Object.freeze({
    format: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION,
    ...identity,
    requestDigest: digest('request'),
    issuanceBindingDigest,
    grant,
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

describe('Agent evaluation Verification AttemptGrant authority', () => {
  it('validates the complete evaluation, descriptor, G3, and grant binding', () => {
    const value = receipt();
    expect(isAgentEvaluationVerificationAttemptGrantReceipt(value)).toBe(true);
    expect(
      isAgentEvaluationVerificationAttemptGrantReceipt({
        ...value,
        caseId: 'case.drifted',
      })
    ).toBe(false);
  });

  it('orders receipts by attempt, cell, and grant and owns both set semantics', () => {
    const later = receipt('evaluation-attempt:z', 'cell.z');
    const earlier = receipt('evaluation-attempt:a', 'cell.a');
    expect(
      canonicalAgentEvaluationVerificationAttemptGrantReceipts([later, earlier])
    ).toEqual([earlier, later]);
    expect(digestAgentEvaluationVerificationAttemptGrantReceiptSet([])).toBe(
      digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests: [],
      })
    );
    expect(
      digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet([])
    ).toBe(
      digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests: [],
      })
    );
    expect(
      digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet([
        earlier.receiptDigest,
        later.receiptDigest,
      ])
    ).toBe(
      digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests: [
          earlier.receiptDigest,
          later.receiptDigest,
        ].sort(),
      })
    );
    expect(
      digestAgentEvaluationVerificationAttemptGrantReceiptSet([later, earlier])
    ).toBe(
      digestAgentCanonicalValue({
        verificationAttemptGrantReceiptDigests: [
          earlier.receiptDigest,
          later.receiptDigest,
        ],
      })
    );
    expect(
      digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet([])
    ).toBeUndefined();
  });

  it('keeps one attempt bounded while canonicalizing a full release archive linearly', () => {
    const perAttemptDigests = Array.from({ length: 129 }, (_, index) =>
      digest(`per-attempt:${index}`)
    );
    expect(() =>
      canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(
        perAttemptDigests
      )
    ).toThrow(TypeError);

    const archive = Array.from({ length: 14_040 }, (_, index) =>
      receipt(`evaluation-attempt:archive-${index}`, `cell.archive-${index}`)
    );
    expect(
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        [...archive].reverse()
      )
    ).toMatch(/^sha256-[a-f0-9]{64}$/u);
  }, 30_000);
});
