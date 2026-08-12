import {
  createAgentHoldoutExecutionReceipt,
  digestAgentCanonicalValue,
  digestAgentEvaluationControlledRuntimeReceiptSet,
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationExecutionReceiptSet,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationInvocationTurnSetReceiptSet,
  digestAgentEvaluationProviderResultSpoolDispositionReceiptSet,
  digestAgentEvaluationProviderResultSpoolReceiptSet,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  digestAgentEvaluationPreDispatchFailureReceiptSet,
  digestAgentEvaluationResultSubmissionReceiptSet,
  digestAgentEvaluationReviewRasterScanReceiptSet,
  digestAgentEvaluationReviewCandidateRefSet,
  digestAgentEvaluationSourceReceiptSet,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  isAgentHoldoutExecutionReceipt,
  planAgentModelEvaluationAttempts,
  validateAgentEvaluationEvidenceAuthenticity,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_COORDINATOR_ERROR_CODES,
  AgentEvaluationCoordinatorError,
  type AgentEvaluationCoordinatorHoldoutSealer,
  type AgentEvaluationDurableSnapshot,
} from './coordinator';

const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;

const invalid = (): never => {
  throw new AgentEvaluationCoordinatorError(
    AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid
  );
};

export type AgentEvaluationProtectedHoldoutSealInput = Readonly<{
  planDigest: string;
  repositoryCommit: string;
  protectedHoldoutManifestDigest: string;
  protectedCaseIds: readonly string[];
  protectedAttemptIds: readonly string[];
  protectedAttemptSetDigest: string;
  preDispatchFailureReceiptSetDigest: string;
  transportDispatchIntentSetDigest: string;
  transportReceiptSetDigest: string;
  providerResultSpoolReceiptSetDigest: string;
  providerResultSpoolDispositionReceiptSetDigest: string;
  providerCapabilityObservationReceiptSetDigest: string;
  invocationTurnReceiptSetDigest: string;
  invocationTurnSetReceiptSetDigest: string;
  resultSubmissionReceiptSetDigest: string;
  controlledRuntimeReceiptSetDigest: string;
  capabilityExecutionReceiptSetDigest: string;
  verificationAttemptGrantReceiptSetDigest: string;
  reviewRasterScanReceiptSetDigest: string;
  reviewCandidateRefSetDigest: string;
  sourceReceiptSetDigest: string;
  executionReceiptSetDigest: string;
  protectedEvidenceSetDigest: string;
}>;

export type AgentEvaluationProtectedHoldoutSealAuthorityResult = Readonly<{
  protectedEvidenceSetDigest: string;
  accessPolicyDigest: string;
  encryptedCorpusDigest: string;
  /** Digest of the authority-owned structured public-artifact scan receipt. */
  scanReceiptDigest: string;
  leakedCaseIds: readonly string[];
  executorPrincipalId: string;
}>;

export interface AgentEvaluationProtectedHoldoutSealAuthority {
  seal(
    input: AgentEvaluationProtectedHoldoutSealInput
  ): Promise<AgentEvaluationProtectedHoldoutSealAuthorityResult>;
}

export type AgentEvaluationDurableHoldoutSealerOptions = Readonly<{
  authority: AgentEvaluationProtectedHoldoutSealAuthority;
}>;

const protectedCaseIdsFor = (
  snapshot: AgentEvaluationDurableSnapshot
): readonly string[] =>
  Object.freeze(
    snapshot.plan.concreteCases
      .filter(({ access }) => access === 'protected-holdout')
      .map(({ caseId }) => caseId)
      .sort(compareUnicodeCodePoints)
  );

const validateExistingSeal = (
  snapshot: AgentEvaluationDurableSnapshot,
  protectedCaseIds: readonly string[]
): boolean => {
  const receipt = snapshot.holdoutExecutionReceipt;
  if (!receipt) return false;
  if (
    !isAgentHoldoutExecutionReceipt(receipt) ||
    receipt.planDigest !== snapshot.plan.planDigest ||
    receipt.protectedHoldoutManifestDigest !==
      snapshot.plan.protectedHoldoutManifestDigest ||
    !sameCanonicalJson(receipt.executedCaseIds, protectedCaseIds) ||
    Date.parse(receipt.executedAt) < Date.parse(snapshot.plan.plannedAt) ||
    Date.parse(receipt.executedAt) > Date.parse(snapshot.plan.expiresAt)
  ) {
    return invalid();
  }
  return true;
};

const selectProtectedEvidence = (
  snapshot: AgentEvaluationDurableSnapshot,
  protectedAttemptIds: ReadonlySet<string>
) => {
  const preDispatchFailureReceipts = snapshot.preDispatchFailureReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const transportDispatchIntents = snapshot.transportDispatchIntents.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const intentDigests = new Set(
    transportDispatchIntents.map(({ intentDigest }) => intentDigest)
  );
  const transportReceipts = snapshot.transportReceipts.filter(
    ({ dispatchIntentDigest }) => intentDigests.has(dispatchIntentDigest)
  );
  const providerResultSpoolReceipts =
    snapshot.providerResultSpoolReceipts.filter(({ attemptId }) =>
      protectedAttemptIds.has(attemptId)
    );
  const providerResultSpoolDispositionReceipts =
    snapshot.providerResultSpoolDispositionReceipts.filter(({ attemptId }) =>
      protectedAttemptIds.has(attemptId)
    );
  const providerCapabilityObservationReceipts =
    snapshot.providerCapabilityObservationReceipts.filter(({ attemptId }) =>
      protectedAttemptIds.has(attemptId)
    );
  const invocationTurnReceipts = snapshot.invocationTurnReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const invocationTurnSetReceipts = snapshot.invocationTurnSetReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const resultSubmissionReceipts = snapshot.resultSubmissionReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const controlledRuntimeReceipts = snapshot.controlledRuntimeReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const capabilityExecutionReceipts =
    snapshot.capabilityExecutionReceipts.filter(({ attemptId }) =>
      protectedAttemptIds.has(attemptId)
    );
  const capabilitySpecificReceipts = snapshot.capabilitySpecificReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const attemptAuthorityOwnerReceipts =
    snapshot.attemptAuthorityOwnerReceipts.filter(({ attemptId }) =>
      protectedAttemptIds.has(attemptId)
    );
  const verificationAttemptGrantReceipts =
    snapshot.verificationAttemptGrantReceipts.filter(
      ({ evaluationAttemptId }) => protectedAttemptIds.has(evaluationAttemptId)
    );
  const reviewRasterScanReceipts = snapshot.reviewRasterScanReceipts.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const reviewCandidateRefs = snapshot.reviewCandidateRefs.filter(
    ({ attemptId }) => protectedAttemptIds.has(attemptId)
  );
  const attempts = snapshot.attempts.filter(({ descriptor }) =>
    protectedAttemptIds.has(descriptor.attemptId)
  );
  const executionReceipts = snapshot.executionReceipts.filter(({ attemptId }) =>
    protectedAttemptIds.has(attemptId)
  );
  return Object.freeze({
    preDispatchFailureReceipts: Object.freeze(preDispatchFailureReceipts),
    transportDispatchIntents: Object.freeze(transportDispatchIntents),
    transportReceipts: Object.freeze(transportReceipts),
    providerResultSpoolReceipts: Object.freeze(providerResultSpoolReceipts),
    providerResultSpoolDispositionReceipts: Object.freeze(
      providerResultSpoolDispositionReceipts
    ),
    providerCapabilityObservationReceipts: Object.freeze(
      providerCapabilityObservationReceipts
    ),
    invocationTurnReceipts: Object.freeze(invocationTurnReceipts),
    invocationTurnSetReceipts: Object.freeze(invocationTurnSetReceipts),
    resultSubmissionReceipts: Object.freeze(resultSubmissionReceipts),
    controlledRuntimeReceipts: Object.freeze(controlledRuntimeReceipts),
    capabilityExecutionReceipts: Object.freeze(capabilityExecutionReceipts),
    capabilitySpecificReceipts: Object.freeze(capabilitySpecificReceipts),
    attemptAuthorityOwnerReceipts: Object.freeze(attemptAuthorityOwnerReceipts),
    verificationAttemptGrantReceipts: Object.freeze(
      verificationAttemptGrantReceipts
    ),
    reviewRasterScanReceipts: Object.freeze(reviewRasterScanReceipts),
    reviewCandidateRefs: Object.freeze(reviewCandidateRefs),
    attempts: Object.freeze(attempts),
    executionReceipts: Object.freeze(executionReceipts),
  });
};

const sourceReceiptsFor = (
  snapshot: AgentEvaluationDurableSnapshot,
  invocationTurnReceipts: AgentEvaluationDurableSnapshot['invocationTurnReceipts']
): AgentEvaluationDurableSnapshot['sourceReceipts'] | undefined => {
  const available = new Map(
    snapshot.sourceReceipts.map((receipt) => [receipt.receiptDigest, receipt])
  );
  const referenced = invocationTurnReceipts
    .flatMap(({ usageSourceReceiptDigest, costSourceReceiptDigest }) =>
      [usageSourceReceiptDigest, costSourceReceiptDigest].filter(
        (value): value is string => value !== undefined
      )
    )
    .sort(compareUnicodeCodePoints);
  if (
    new Set(referenced).size !== referenced.length ||
    referenced.some((receiptDigest) => !available.has(receiptDigest))
  ) {
    return undefined;
  }
  return Object.freeze(
    referenced.map((receiptDigest) => available.get(receiptDigest)!)
  );
};

const sealInputFor = (
  snapshot: AgentEvaluationDurableSnapshot,
  protectedCaseIds: readonly string[]
): AgentEvaluationProtectedHoldoutSealInput | undefined => {
  const descriptors = planAgentModelEvaluationAttempts(snapshot.plan)
    .filter(({ caseId }) => protectedCaseIds.includes(caseId))
    .sort((left, right) =>
      compareUnicodeCodePoints(left.attemptId, right.attemptId)
    );
  const protectedAttemptIds = new Set(
    descriptors.map(({ attemptId }) => attemptId)
  );
  const evidence = selectProtectedEvidence(snapshot, protectedAttemptIds);
  const completeAttemptIds = new Set(
    evidence.attempts.map(({ descriptor }) => descriptor.attemptId)
  );
  const executionAttemptIds = new Set(
    evidence.executionReceipts.map(({ attemptId }) => attemptId)
  );
  const turnSetAttemptIds = new Set(
    evidence.invocationTurnSetReceipts.map(({ attemptId }) => attemptId)
  );
  if (
    descriptors.length === 0 ||
    completeAttemptIds.size !== descriptors.length ||
    executionAttemptIds.size !== descriptors.length ||
    turnSetAttemptIds.size !== descriptors.length ||
    descriptors.some(
      ({ attemptId }) =>
        !completeAttemptIds.has(attemptId) ||
        !executionAttemptIds.has(attemptId) ||
        !turnSetAttemptIds.has(attemptId)
    )
  ) {
    return undefined;
  }
  const sourceReceipts = sourceReceiptsFor(
    snapshot,
    evidence.invocationTurnReceipts
  );
  if (!sourceReceipts) return undefined;
  const issues = validateAgentEvaluationEvidenceAuthenticity({
    plan: snapshot.plan,
    descriptors,
    attempts: evidence.attempts,
    budgetLedger: snapshot.budgetLedger,
    executionReceipts: evidence.executionReceipts,
    preDispatchFailureReceipts: evidence.preDispatchFailureReceipts,
    transportDispatchIntents: evidence.transportDispatchIntents,
    transportReceipts: evidence.transportReceipts,
    providerResultSpoolReceipts: evidence.providerResultSpoolReceipts,
    providerResultSpoolDispositionReceipts:
      evidence.providerResultSpoolDispositionReceipts,
    providerCapabilityObservationReceipts:
      evidence.providerCapabilityObservationReceipts,
    invocationTurnReceipts: evidence.invocationTurnReceipts,
    invocationTurnSetReceipts: evidence.invocationTurnSetReceipts,
    resultSubmissionReceipts: evidence.resultSubmissionReceipts,
    controlledRuntimeReceipts: evidence.controlledRuntimeReceipts,
    capabilityExecutionReceipts: evidence.capabilityExecutionReceipts,
    capabilitySpecificReceipts: evidence.capabilitySpecificReceipts,
    attemptAuthorityOwnerReceipts: evidence.attemptAuthorityOwnerReceipts,
    verificationAttemptGrantReceipts: evidence.verificationAttemptGrantReceipts,
    reviewRasterScanReceipts: evidence.reviewRasterScanReceipts,
    reviewCandidateRefs: evidence.reviewCandidateRefs,
    blindReviewMappingRefs: Object.freeze([]),
  });
  if (issues.length > 0) return invalid();
  const protectedAttemptSetDigest = digestAgentCanonicalValue(
    evidence.attempts.map(({ attemptDigest }) => attemptDigest)
  );
  const base = Object.freeze({
    planDigest: snapshot.plan.planDigest,
    repositoryCommit: snapshot.plan.repositoryCommit,
    protectedHoldoutManifestDigest:
      snapshot.plan.protectedHoldoutManifestDigest,
    protectedCaseIds,
    protectedAttemptIds: Object.freeze(
      descriptors.map(({ attemptId }) => attemptId)
    ),
    protectedAttemptSetDigest,
    preDispatchFailureReceiptSetDigest:
      digestAgentEvaluationPreDispatchFailureReceiptSet(
        evidence.preDispatchFailureReceipts
      ),
    transportDispatchIntentSetDigest:
      digestAgentEvaluationTransportDispatchIntentSet(
        evidence.transportDispatchIntents
      ),
    transportReceiptSetDigest: digestAgentEvaluationTransportReceiptSet(
      evidence.transportReceipts
    ),
    providerResultSpoolReceiptSetDigest:
      digestAgentEvaluationProviderResultSpoolReceiptSet(
        evidence.providerResultSpoolReceipts
      ),
    providerResultSpoolDispositionReceiptSetDigest:
      digestAgentEvaluationProviderResultSpoolDispositionReceiptSet(
        evidence.providerResultSpoolDispositionReceipts
      ),
    providerCapabilityObservationReceiptSetDigest:
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        evidence.providerCapabilityObservationReceipts
      ),
    invocationTurnReceiptSetDigest:
      digestAgentEvaluationInvocationTurnReceiptSet(
        evidence.invocationTurnReceipts
      ),
    invocationTurnSetReceiptSetDigest:
      digestAgentEvaluationInvocationTurnSetReceiptSet(
        evidence.invocationTurnSetReceipts
      ),
    resultSubmissionReceiptSetDigest:
      digestAgentEvaluationResultSubmissionReceiptSet(
        evidence.resultSubmissionReceipts
      ),
    controlledRuntimeReceiptSetDigest:
      digestAgentEvaluationControlledRuntimeReceiptSet(
        evidence.controlledRuntimeReceipts
      ),
    capabilityExecutionReceiptSetDigest:
      digestAgentEvaluationCapabilityExecutionReceiptSet(
        evidence.capabilityExecutionReceipts
      ),
    verificationAttemptGrantReceiptSetDigest:
      digestAgentEvaluationVerificationAttemptGrantReceiptSet(
        evidence.verificationAttemptGrantReceipts
      ),
    reviewRasterScanReceiptSetDigest:
      digestAgentEvaluationReviewRasterScanReceiptSet(
        evidence.reviewRasterScanReceipts
      ),
    reviewCandidateRefSetDigest: digestAgentEvaluationReviewCandidateRefSet(
      evidence.reviewCandidateRefs
    ),
    sourceReceiptSetDigest:
      digestAgentEvaluationSourceReceiptSet(sourceReceipts),
    executionReceiptSetDigest: digestAgentEvaluationExecutionReceiptSet(
      evidence.executionReceipts
    ),
  });
  return Object.freeze({
    ...base,
    protectedEvidenceSetDigest: digestAgentCanonicalValue(base),
  });
};

/** Seals holdout evidence only after its complete exact durable authority chain exists. */
export class AgentEvaluationDurableHoldoutSealer implements AgentEvaluationCoordinatorHoldoutSealer {
  readonly #authority: AgentEvaluationProtectedHoldoutSealAuthority;

  constructor(options: AgentEvaluationDurableHoldoutSealerOptions) {
    this.#authority = options.authority;
  }

  async sealIfComplete(
    input: Parameters<
      AgentEvaluationCoordinatorHoldoutSealer['sealIfComplete']
    >[0]
  ): Promise<'pending' | 'sealed'> {
    const snapshot = await input.ledger.snapshot();
    if (!sameCanonicalJson(snapshot.plan, input.plan)) return invalid();
    const protectedCaseIds = protectedCaseIdsFor(snapshot);
    if (validateExistingSeal(snapshot, protectedCaseIds)) return 'sealed';
    const sealInput = sealInputFor(snapshot, protectedCaseIds);
    if (!sealInput) return 'pending';
    const authority = await this.#authority.seal(sealInput);
    const leakedCaseIds = [...authority.leakedCaseIds].sort(
      compareUnicodeCodePoints
    );
    if (
      authority.protectedEvidenceSetDigest !==
        sealInput.protectedEvidenceSetDigest ||
      !digestPattern.test(authority.accessPolicyDigest) ||
      !digestPattern.test(authority.encryptedCorpusDigest) ||
      !digestPattern.test(authority.scanReceiptDigest) ||
      !identityPattern.test(authority.executorPrincipalId) ||
      new Set(leakedCaseIds).size !== leakedCaseIds.length ||
      leakedCaseIds.some((caseId) => !protectedCaseIds.includes(caseId))
    ) {
      return invalid();
    }
    const executedAt = evidenceCompletedAt(
      snapshot,
      sealInput.protectedAttemptIds
    );
    const receipt = createAgentHoldoutExecutionReceipt({
      receiptId: `holdout-receipt:${snapshot.plan.planDigest.slice('sha256-'.length)}`,
      planDigest: snapshot.plan.planDigest,
      protectedHoldoutManifestDigest:
        snapshot.plan.protectedHoldoutManifestDigest,
      accessPolicyDigest: authority.accessPolicyDigest,
      encryptedCorpusDigest: authority.encryptedCorpusDigest,
      executedCaseIds: protectedCaseIds,
      publicArtifactScanDigest: digestAgentCanonicalValue({
        format: 'prodivix.g4-protected-holdout-public-artifact-scan-binding',
        version: 1,
        protectedEvidenceSetDigest: sealInput.protectedEvidenceSetDigest,
        scanReceiptDigest: authority.scanReceiptDigest,
      }),
      leakedCaseIds,
      executorPrincipalId: authority.executorPrincipalId,
      executedAt,
    });
    await input.ledger.putHoldoutExecutionReceipt(receipt);
    return 'sealed';
  }
}

const evidenceCompletedAt = (
  snapshot: AgentEvaluationDurableSnapshot,
  protectedAttemptIds: readonly string[]
): string => {
  const attempts = new Set(protectedAttemptIds);
  const completedAt = snapshot.attempts
    .filter(({ descriptor }) => attempts.has(descriptor.attemptId))
    .map(({ completedAt }) => completedAt)
    .sort(compareUnicodeCodePoints)
    .at(-1);
  if (
    !completedAt ||
    Date.parse(completedAt) < Date.parse(snapshot.plan.plannedAt) ||
    Date.parse(completedAt) > Date.parse(snapshot.plan.expiresAt)
  ) {
    return invalid();
  }
  return completedAt;
};

export const createAgentEvaluationDurableHoldoutSealer = (
  options: AgentEvaluationDurableHoldoutSealerOptions
): AgentEvaluationDurableHoldoutSealer =>
  new AgentEvaluationDurableHoldoutSealer(options);
