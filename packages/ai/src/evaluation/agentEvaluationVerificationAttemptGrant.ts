import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import type { CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';

export const AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-verification-attempt-grant-receipt' as const;
export const AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION = 1 as const;
export const AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID =
  'prodivix.g4-evaluation-controlled-runtime' as const;

const maximumReceiptDigestsPerAttempt = 128;
const maximumArchivedReceipts = 2_000_000;
const checkKinds = new Set([
  'diagnostics',
  'build',
  'unit',
  'integration',
  'e2e',
  'visual',
  'accessibility',
  'performance',
  'security',
]);
const trustClasses = new Set([
  'local-unattested',
  'remote-attested',
  'ci-attested',
]);
const retentionClasses = new Set(['session', 'change', 'release']);

export type AgentEvaluationVerificationAttemptGrant = Readonly<{
  grantId: string;
  grantDigest: CanonicalDigest;
  workspaceId: string;
  projectId: string;
  workspaceRevision: number;
  partitionRevisionsDigest: CanonicalDigest;
  policyRevision: number;
  policyDigest: CanonicalDigest;
  policyEvaluationInstant: string;
  impactDigest: CanonicalDigest;
  verificationPlanDigest: CanonicalDigest;
  cellId: string;
  checkId: string;
  checkKind: string;
  targetId: string;
  attemptId: string;
  runId: string;
  providerId: string;
  jobId?: string;
  sessionId?: string;
  producerId: typeof AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID;
  trustCeiling: 'local-unattested' | 'remote-attested' | 'ci-attested';
  retentionRequest: Readonly<{
    successful: 'session' | 'change' | 'release';
    failed: 'session' | 'change' | 'release';
    protectReleaseEvidence: boolean;
  }>;
  maximumClosureEvidenceRecords: number;
  issuedBy: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type AgentEvaluationVerificationAttemptGrantReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION;
  namespaceId: string;
  evaluationPlanDigest: CanonicalDigest;
  repositoryCommit: string;
  evaluationAttemptId: string;
  descriptorDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  caseId: string;
  generation: number;
  verificationPlanDigest: CanonicalDigest;
  cellId: string;
  /** Attests the bounded full descriptor/plan/run request retained by Backend. */
  requestDigest: CanonicalDigest;
  issuanceBindingDigest: CanonicalDigest;
  grant: AgentEvaluationVerificationAttemptGrant;
  receiptDigest: CanonicalDigest;
}>;

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const safePositive = (
  value: unknown,
  maximum = Number.MAX_SAFE_INTEGER
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 1 &&
  value <= maximum;

const repositoryCommit = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);

const grantDigestBase = (grant: AgentEvaluationVerificationAttemptGrant) =>
  Object.freeze({
    format: 'prodivix.verification-attempt-grant',
    version: 1,
    workspaceId: grant.workspaceId,
    projectId: grant.projectId,
    workspaceRevision: grant.workspaceRevision,
    partitionRevisionsDigest: grant.partitionRevisionsDigest,
    policyRevision: grant.policyRevision,
    policyDigest: grant.policyDigest,
    policyEvaluationInstant: grant.policyEvaluationInstant,
    impactDigest: grant.impactDigest,
    planDigest: grant.verificationPlanDigest,
    cellId: grant.cellId,
    checkId: grant.checkId,
    checkKind: grant.checkKind,
    targetId: grant.targetId,
    attemptId: grant.attemptId,
    runId: grant.runId,
    providerId: grant.providerId,
    ...(grant.jobId ? { jobId: grant.jobId } : {}),
    ...(grant.sessionId ? { sessionId: grant.sessionId } : {}),
    producerId: grant.producerId,
    trustCeiling: grant.trustCeiling,
    retentionRequest: grant.retentionRequest,
    maximumClosureEvidenceRecords: grant.maximumClosureEvidenceRecords,
    issuedBy: grant.issuedBy,
    issuedAt: grant.issuedAt,
    expiresAt: grant.expiresAt,
  });

export const isAgentEvaluationVerificationAttemptGrantReceipt = (
  value: unknown
): value is AgentEvaluationVerificationAttemptGrantReceipt => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'evaluationPlanDigest',
      'repositoryCommit',
      'evaluationAttemptId',
      'descriptorDigest',
      'capabilityDescriptorDigest',
      'caseId',
      'generation',
      'verificationPlanDigest',
      'cellId',
      'requestDigest',
      'issuanceBindingDigest',
      'grant',
      'receiptDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_RECEIPT_FORMAT ||
    value.version !== AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_VERSION ||
    !isAgentControlIdentity(value.namespaceId) ||
    !isAgentCanonicalDigest(value.evaluationPlanDigest) ||
    !repositoryCommit(value.repositoryCommit) ||
    !isAgentControlIdentity(value.evaluationAttemptId) ||
    !isAgentCanonicalDigest(value.descriptorDigest) ||
    !isAgentCanonicalDigest(value.capabilityDescriptorDigest) ||
    !isAgentControlIdentity(value.caseId) ||
    !safePositive(value.generation) ||
    !isAgentCanonicalDigest(value.verificationPlanDigest) ||
    !isAgentControlIdentity(value.cellId) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !isAgentCanonicalDigest(value.issuanceBindingDigest) ||
    !isAgentCanonicalDigest(value.receiptDigest)
  ) {
    return false;
  }
  const rawGrant = value.grant;
  if (
    !exactRecord(
      rawGrant,
      [
        'grantId',
        'grantDigest',
        'workspaceId',
        'projectId',
        'workspaceRevision',
        'partitionRevisionsDigest',
        'policyRevision',
        'policyDigest',
        'policyEvaluationInstant',
        'impactDigest',
        'verificationPlanDigest',
        'cellId',
        'checkId',
        'checkKind',
        'targetId',
        'attemptId',
        'runId',
        'providerId',
        'producerId',
        'trustCeiling',
        'retentionRequest',
        'maximumClosureEvidenceRecords',
        'issuedBy',
        'issuedAt',
        'expiresAt',
      ],
      ['jobId', 'sessionId']
    ) ||
    !exactRecord(rawGrant.retentionRequest, [
      'successful',
      'failed',
      'protectReleaseEvidence',
    ])
  ) {
    return false;
  }
  const receipt =
    value as unknown as AgentEvaluationVerificationAttemptGrantReceipt;
  const grant = receipt.grant;
  const { receiptDigest, ...receiptBase } = receipt;
  const expectedIssuanceBindingDigest = digestAgentCanonicalValue({
    namespaceId: receipt.namespaceId,
    evaluationPlanDigest: receipt.evaluationPlanDigest,
    repositoryCommit: receipt.repositoryCommit,
    evaluationAttemptId: receipt.evaluationAttemptId,
    descriptorDigest: receipt.descriptorDigest,
    capabilityDescriptorDigest: receipt.capabilityDescriptorDigest,
    caseId: receipt.caseId,
    generation: receipt.generation,
    workspaceId: grant.workspaceId,
    workspaceRevision: grant.workspaceRevision,
    projectId: grant.projectId,
    verificationPlanDigest: receipt.verificationPlanDigest,
    cellId: receipt.cellId,
  });
  return (
    isAgentControlIdentity(grant.grantId) &&
    isAgentCanonicalDigest(grant.grantDigest) &&
    grant.grantId === `attempt-grant-${grant.grantDigest.slice(7)}` &&
    isAgentControlIdentity(grant.workspaceId) &&
    isAgentControlIdentity(grant.projectId) &&
    safePositive(grant.workspaceRevision) &&
    isAgentCanonicalDigest(grant.partitionRevisionsDigest) &&
    safePositive(grant.policyRevision) &&
    isAgentCanonicalDigest(grant.policyDigest) &&
    isAgentControlInstant(grant.policyEvaluationInstant) &&
    isAgentCanonicalDigest(grant.impactDigest) &&
    grant.verificationPlanDigest === receipt.verificationPlanDigest &&
    grant.cellId === receipt.cellId &&
    isAgentControlIdentity(grant.checkId) &&
    checkKinds.has(grant.checkKind) &&
    isAgentControlIdentity(grant.targetId) &&
    grant.attemptId === receipt.evaluationAttemptId &&
    isAgentControlIdentity(grant.runId) &&
    isAgentControlIdentity(grant.providerId) &&
    (grant.jobId === undefined || isAgentControlIdentity(grant.jobId)) &&
    (grant.sessionId === undefined ||
      isAgentControlIdentity(grant.sessionId)) &&
    grant.producerId ===
      AGENT_EVALUATION_VERIFICATION_ATTEMPT_GRANT_PRODUCER_ID &&
    trustClasses.has(grant.trustCeiling) &&
    retentionClasses.has(grant.retentionRequest.successful) &&
    retentionClasses.has(grant.retentionRequest.failed) &&
    typeof grant.retentionRequest.protectReleaseEvidence === 'boolean' &&
    safePositive(grant.maximumClosureEvidenceRecords, 1_000) &&
    isAgentControlIdentity(grant.issuedBy) &&
    isAgentControlInstant(grant.issuedAt) &&
    isAgentControlInstant(grant.expiresAt) &&
    Date.parse(grant.issuedAt) < Date.parse(grant.expiresAt) &&
    grant.grantDigest === digestAgentCanonicalValue(grantDigestBase(grant)) &&
    receipt.issuanceBindingDigest === expectedIssuanceBindingDigest &&
    receiptDigest === digestAgentCanonicalValue(receiptBase)
  );
};

export const canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests = (
  values: readonly CanonicalDigest[]
): readonly CanonicalDigest[] => {
  if (
    !Array.isArray(values) ||
    values.length > maximumReceiptDigestsPerAttempt ||
    values.some((value) => !isAgentCanonicalDigest(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new TypeError(
      'Evaluation Verification AttemptGrant receipt digests are invalid.'
    );
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

/** Required digest-list commitment; the canonical empty set has a digest. */
export const digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet = (
  values: readonly CanonicalDigest[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    verificationAttemptGrantReceiptDigests:
      canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(values),
  });

export const digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet = (
  values: readonly CanonicalDigest[]
): CanonicalDigest | undefined => {
  const verificationAttemptGrantReceiptDigests =
    canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(values);
  return verificationAttemptGrantReceiptDigests.length === 0
    ? undefined
    : digestAgentEvaluationVerificationAttemptGrantReceiptDigestSet(
        verificationAttemptGrantReceiptDigests
      );
};

export const canonicalAgentEvaluationVerificationAttemptGrantReceipts = (
  values: readonly AgentEvaluationVerificationAttemptGrantReceipt[]
): readonly AgentEvaluationVerificationAttemptGrantReceipt[] => {
  if (
    !Array.isArray(values) ||
    values.length > maximumArchivedReceipts ||
    values.some(
      (value) => !isAgentEvaluationVerificationAttemptGrantReceipt(value)
    ) ||
    new Set(values.map(({ receiptDigest }) => receiptDigest)).size !==
      values.length
  ) {
    throw new TypeError(
      'Evaluation Verification AttemptGrant receipts are invalid.'
    );
  }
  const ordered = [...values].sort((left, right) =>
    compareUnicodeCodePoints(
      `${left.evaluationAttemptId}\u0000${left.cellId}\u0000${left.grant.grantId}`,
      `${right.evaluationAttemptId}\u0000${right.cellId}\u0000${right.grant.grantId}`
    )
  );
  const identities = ordered.map(
    ({ evaluationAttemptId, cellId, grant }) =>
      `${evaluationAttemptId}\u0000${cellId}\u0000${grant.grantId}`
  );
  if (new Set(identities).size !== identities.length) {
    throw new TypeError(
      'Evaluation Verification AttemptGrant receipt identities are duplicated.'
    );
  }
  return Object.freeze(ordered);
};

/** Required global Evidence identity; the canonical empty set has a digest. */
export const digestAgentEvaluationVerificationAttemptGrantReceiptSet = (
  values: readonly AgentEvaluationVerificationAttemptGrantReceipt[]
): CanonicalDigest => {
  const verificationAttemptGrantReceiptDigests =
    canonicalAgentEvaluationVerificationAttemptGrantReceipts(values).map(
      ({ receiptDigest }) => receiptDigest
    );
  return digestAgentCanonicalValue({
    verificationAttemptGrantReceiptDigests,
  });
};
