import type { AgentBudgetReservation } from '../usage/agentBudgetLedger';
import { isAgentEvaluationResultSubmissionReceipt } from './agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationResultSubmissionReceipt } from './agentEvaluationResultContract';
import {
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import {
  isAgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilityOwnerFact,
  type AgentEvaluationCapabilitySpecificReceipt,
} from './agentEvaluationCapabilitySpecificReceipt';

const ownerFact = (
  receipt: AgentEvaluationCapabilitySpecificReceipt
): AgentEvaluationCapabilityOwnerFact | undefined => {
  const { authority } = receipt;
  return authority.authorityKind === 'terminal-normalization' ||
    authority.authorityKind === 'recovery-authority' ||
    authority.authorityKind === 'capability-denial'
    ? authority.fact
    : undefined;
};

export type AgentEvaluationCapabilitySpecificOwnerAuthorityProjection = Pick<
  AgentEvaluationAttemptAuthorityOwnerReceipt,
  | 'serviceKind'
  | 'planDigest'
  | 'repositoryCommit'
  | 'attemptId'
  | 'descriptorDigest'
  | 'shardLeaseOwnerId'
  | 'shardLeaseGeneration'
  | 'requestDigest'
  | 'responseProjection'
  | 'ownerImplementationDigest'
  | 'completedAt'
>;

const ownerListsReceipt = (
  owner: AgentEvaluationCapabilitySpecificOwnerAuthorityProjection,
  receipt: AgentEvaluationCapabilitySpecificReceipt
): boolean =>
  owner.responseProjection.serviceKind === 'capability-runtime' &&
  owner.responseProjection.specificReceiptDigests.some(
    ({ receiptKind, receiptDigest }) =>
      receiptKind === receipt.receiptKind &&
      receiptDigest === receipt.receiptDigest
  );

/** Exact matcher for facts whose individual guards already passed. */
export const matchGuardedAgentEvaluationCapabilitySpecificOwnerAuthority = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  owner: AgentEvaluationCapabilitySpecificOwnerAuthorityProjection
): boolean => {
  const fact = ownerFact(receipt);
  if (
    !fact ||
    owner.serviceKind !== 'capability-runtime' ||
    owner.planDigest !== receipt.planDigest ||
    owner.repositoryCommit !== receipt.repositoryCommit ||
    owner.attemptId !== receipt.attemptId ||
    owner.descriptorDigest !== receipt.descriptorDigest ||
    fact.authorityRequestDigest !== owner.requestDigest ||
    fact.authorityResultDigest !== receipt.resultDigest ||
    fact.authorityImplementationDigest !== owner.ownerImplementationDigest ||
    Date.parse(fact.observedAt) > Date.parse(owner.completedAt) ||
    !ownerListsReceipt(owner, receipt)
  ) {
    return false;
  }
  if (
    fact.authorityKind === 'recovery-authority' &&
    (fact.category === 'cancellation-receipt' ||
      fact.category === 'late-callback-rejection-receipt' ||
      fact.category === 'late-output-fence-receipt' ||
      fact.category === 'lease-fence-receipt' ||
      fact.category === 'state-fence-receipt' ||
      fact.category === 'timeout-receipt') &&
    (fact.shardLeaseOwnerId !== owner.shardLeaseOwnerId ||
      fact.shardLeaseGeneration !== owner.shardLeaseGeneration)
  ) {
    return false;
  }
  const projection = owner.responseProjection;
  if (projection.operation === 'execute-tool') {
    return (
      receipt.toolId !== undefined &&
      receipt.invocationId === projection.invocationId &&
      receipt.turnIndex === projection.turnIndex &&
      receipt.toolId === projection.toolId &&
      receipt.toolCallId === projection.toolCallId &&
      receipt.providerToolCallId === projection.providerToolCallId &&
      receipt.requestDigest === projection.providerRequestDigest &&
      receipt.resultDigest === projection.resultDigest
    );
  }
  return (
    projection.operation === 'assess-capability' &&
    receipt.toolId === undefined &&
    receipt.turnIndex <= projection.terminalTurnIndex
  );
};

/**
 * Exact, acyclic producer binding. The owner receipt points to the specific
 * receipt; the specific fact points only to the already-known owner request.
 */
export const matchAgentEvaluationCapabilitySpecificOwnerAuthority = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  owner: AgentEvaluationAttemptAuthorityOwnerReceipt
): boolean =>
  isAgentEvaluationCapabilitySpecificReceipt(receipt) &&
  isAgentEvaluationAttemptAuthorityOwnerReceipt(owner) &&
  matchGuardedAgentEvaluationCapabilitySpecificOwnerAuthority(receipt, owner);

/** Ledger fields are the sole authority for a budget capability receipt. */
export const matchAgentEvaluationCapabilityBudgetAuthority = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  reservation: AgentBudgetReservation | undefined
): boolean => {
  const fact = ownerFact(receipt);
  if (
    !fact ||
    fact.authorityKind !== 'recovery-authority' ||
    fact.category !== 'budget-reservation-receipt' ||
    reservation?.status !== 'settled' ||
    reservation.settlement === undefined
  ) {
    return false;
  }
  return (
    fact.reservationId === reservation.reservationId &&
    fact.demandDigest === reservation.demandDigest &&
    fact.settlementDigest === reservation.settlement.settlementDigest &&
    fact.reservationStatus ===
      (reservation.settlement.requiresReconciliation ? 'reconciled' : 'settled')
  );
};

/** Completed result-submit terminals expose the exact normalized event leaf. */
export const matchAgentEvaluationCapabilityTerminalAuthority = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  submission: AgentEvaluationResultSubmissionReceipt | undefined
): boolean => {
  const fact = ownerFact(receipt);
  return Boolean(
    fact &&
    fact.authorityKind === 'terminal-normalization' &&
    submission &&
    isAgentEvaluationResultSubmissionReceipt(submission) &&
    submission.attemptId === receipt.attemptId &&
    submission.descriptorDigest === receipt.descriptorDigest &&
    submission.invocationId === receipt.invocationId &&
    submission.terminalEventDigest === fact.terminalEventDigest
  );
};
