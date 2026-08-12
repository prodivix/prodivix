import type { AgentEvaluationEndpointSmokeTarget } from './agentEvaluation.types';
import {
  isAgentEvaluationEndpointSmokeDispatchIntent,
  isAgentEvaluationEndpointSmokeReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  isAgentEvaluationEndpointSmokeResultSpoolReceipt,
  isAgentEvaluationEndpointSmokeValidationFailureReceipt,
  validateAgentEvaluationEndpointSmokeTargetBinding,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolReceipt,
  type AgentEvaluationEndpointSmokeValidationFailureReceipt,
} from './agentEvaluationEndpointSmoke';
import { isAgentEvaluationTransportReceipt } from './agentEvaluationEvidenceAuthenticity';
import type { AgentEvaluationTransportReceipt } from './agentEvaluationEvidenceAuthenticity.types';
import type { AgentBudgetReservation } from '../usage/agentBudgetLedger';

export type AgentEvaluationEndpointSmokeAuthorityFacts = Readonly<{
  planDigest: string;
  repositoryCommit: string;
  target: AgentEvaluationEndpointSmokeTarget;
  intent: AgentEvaluationEndpointSmokeDispatchIntent;
  transport: AgentEvaluationTransportReceipt;
  spool?: AgentEvaluationEndpointSmokeResultSpoolReceipt;
  disposition?: AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt;
  validationFailure?: AgentEvaluationEndpointSmokeValidationFailureReceipt;
  receipt: AgentEvaluationEndpointSmokeReceipt;
}>;

export const matchAgentEvaluationEndpointSmokeBudgetAuthority = (
  receipt: AgentEvaluationEndpointSmokeReceipt,
  reservation: AgentBudgetReservation | undefined
): boolean => {
  const settlement = reservation?.settlement;
  return (
    reservation !== undefined &&
    reservation.reservationId === receipt.budgetReservationId &&
    reservation.status === 'settled' &&
    settlement !== undefined &&
    reservation.demandDigest === receipt.demandDigest &&
    settlement.settlementDigest === receipt.settlementDigest &&
    Date.parse(settlement.settledAt) >= Date.parse(receipt.completedAt)
  );
};

const targetMatchesIntent = (
  target: AgentEvaluationEndpointSmokeTarget,
  intent: AgentEvaluationEndpointSmokeDispatchIntent
): boolean => {
  try {
    validateAgentEvaluationEndpointSmokeTargetBinding(target, intent);
    return true;
  } catch {
    return false;
  }
};

const transportMatchesFailure = (
  receipt: AgentEvaluationEndpointSmokeReceipt,
  transport: AgentEvaluationTransportReceipt
): boolean => {
  if (receipt.outcome === 'passed') {
    return (
      transport.dispatchState === 'dispatched' &&
      transport.outcome === 'completed'
    );
  }
  switch (receipt.failureCategory) {
    case 'transport-not-dispatched':
      return (
        transport.dispatchState === 'not-dispatched' &&
        transport.outcome === 'failed'
      );
    case 'transport-post-dispatch-unknown':
      return (
        transport.dispatchState === 'dispatched' &&
        transport.outcome === 'post-dispatch-unknown'
      );
    case 'transport-failed':
      return (
        transport.dispatchState === 'dispatched' &&
        transport.outcome === 'failed'
      );
    case 'provider-response-invalid':
    case 'model-identity-drift':
    case 'usage-unavailable':
    case 'cost-unavailable':
      return (
        transport.dispatchState === 'dispatched' &&
        transport.outcome === 'completed'
      );
  }
};

const resolvedModelMatchesFrozenTarget = (
  receipt: AgentEvaluationEndpointSmokeReceipt
): boolean =>
  receipt.resolvedModelId === receipt.modelId &&
  (receipt.protocolFamily === 'gemini-interactions'
    ? receipt.resolvedModelVersion === receipt.immutableModelVersion
    : receipt.modelId === receipt.immutableModelVersion &&
      (receipt.resolvedModelVersion === undefined ||
        receipt.resolvedModelVersion === receipt.immutableModelVersion));

const releaseNativeProtocols = new Set([
  'openai-responses',
  'anthropic-messages',
  'gemini-interactions',
]);

const hasFrozenReleaseSmokeComposition = (
  targets: readonly AgentEvaluationEndpointSmokeTarget[]
): boolean => {
  const nativeTargets = targets.filter(({ protocolFamily }) =>
    releaseNativeProtocols.has(protocolFamily)
  );
  const compatibleTargets = targets.filter(
    ({ protocolFamily }) => protocolFamily === 'openai-compatible'
  );
  const nativeProtocols = new Set(
    nativeTargets.map(({ protocolFamily }) => protocolFamily)
  );
  const compatibleById = new Map(
    compatibleTargets.map((target) => [target.smokeTargetId, target])
  );
  const hosted = compatibleById.get('smoke.release.openai-compatible.hosted');
  const local = compatibleById.get('smoke.release.openai-compatible.local');
  return (
    nativeTargets.length === releaseNativeProtocols.size &&
    nativeProtocols.size === releaseNativeProtocols.size &&
    nativeTargets.every(
      ({ smokeTargetId, endpointClass, protocolFamily }) =>
        smokeTargetId === `smoke.release.${protocolFamily}.native` &&
        endpointClass === 'first-party-hosted'
    ) &&
    compatibleTargets.length === 2 &&
    hosted !== undefined &&
    hosted.endpointClass !== 'local' &&
    local?.endpointClass === 'local'
  );
};

/**
 * Verifies the exact cross-fact authority chain for one endpoint-smoke target.
 * Accounting source receipts are joined by the evidence-bundle owner because
 * they share the global source-receipt uniqueness and pricing authority sets.
 */
export const matchAgentEvaluationEndpointSmokeAuthorityFacts = (
  input: AgentEvaluationEndpointSmokeAuthorityFacts
): boolean => {
  const {
    target,
    intent,
    transport,
    spool,
    disposition,
    validationFailure,
    receipt,
  } = input;
  if (
    !isAgentEvaluationEndpointSmokeDispatchIntent(intent) ||
    !isAgentEvaluationTransportReceipt(transport) ||
    !isAgentEvaluationEndpointSmokeReceipt(receipt) ||
    (spool !== undefined &&
      !isAgentEvaluationEndpointSmokeResultSpoolReceipt(spool)) ||
    (disposition !== undefined &&
      !isAgentEvaluationEndpointSmokeResultSpoolDispositionReceipt(
        disposition
      )) ||
    (validationFailure !== undefined &&
      !isAgentEvaluationEndpointSmokeValidationFailureReceipt(
        validationFailure
      )) ||
    !targetMatchesIntent(target, intent)
  ) {
    return false;
  }

  const hasResponse = receipt.providerRequestId !== undefined;
  const hasModel = receipt.resolvedModelId !== undefined;
  const hasSpool = receipt.spoolReceiptDigest !== undefined;
  const validationFailureReceiptDigest =
    receipt.outcome === 'failed'
      ? receipt.validationFailureReceiptDigest
      : undefined;
  const hasValidationFailure = validationFailureReceiptDigest !== undefined;
  const modelMatchesTarget =
    hasModel && resolvedModelMatchesFrozenTarget(receipt);
  if (
    receipt.planDigest !== input.planDigest ||
    receipt.repositoryCommit !== input.repositoryCommit ||
    receipt.smokeTargetId !== target.smokeTargetId ||
    receipt.smokeTargetDigest !== target.targetDigest ||
    receipt.endpointClass !== target.endpointClass ||
    receipt.protocolFamily !== target.protocolFamily ||
    receipt.providerConfigurationId !== target.providerConfigurationId ||
    receipt.modelId !== target.modelId ||
    receipt.immutableModelVersion !== target.immutableModelVersion ||
    receipt.modelLineageDigest !== target.modelLineageDigest ||
    receipt.inferenceConfigurationDigest !==
      target.inferenceConfigurationDigest ||
    receipt.adapterDigest !== target.adapterDigest ||
    receipt.smokeProfileDigest !== target.smokeProfileDigest ||
    receipt.pricingAuthorityDigest !== target.pricingAuthorityDigest ||
    receipt.responseSpoolEncryptionPolicyDigest !==
      target.responseSpoolEncryptionPolicyDigest ||
    intent.planDigest !== input.planDigest ||
    intent.repositoryCommit !== input.repositoryCommit ||
    intent.smokeTargetId !== receipt.smokeTargetId ||
    intent.smokeTargetDigest !== receipt.smokeTargetDigest ||
    receipt.invocationId !== intent.invocationId ||
    receipt.budgetReservationId !== intent.budgetReservationId ||
    receipt.demandDigest !== intent.demandDigest ||
    receipt.requestDigest !== intent.requestDigest ||
    receipt.dispatchIntentDigest !== intent.intentDigest ||
    transport.receiptDigest !== receipt.transportReceiptDigest ||
    transport.protocolFamily !== intent.protocolFamily ||
    transport.providerConfigurationId !== intent.providerConfigurationId ||
    transport.invocationId !== intent.invocationId ||
    transport.dispatchIntentDigest !== intent.intentDigest ||
    transport.requestDigest !== intent.requestDigest ||
    transport.endpointId !== intent.endpointId ||
    transport.endpointClass !== intent.endpointClass ||
    transport.requestBodyDigest !== intent.requestBodyDigest ||
    transport.requestBytes !== intent.requestBytes ||
    !transportMatchesFailure(receipt, transport) ||
    receipt.startedAt !== transport.startedAt ||
    Date.parse(receipt.completedAt) < Date.parse(transport.completedAt) ||
    hasResponse !== (transport.providerRequestId !== undefined) ||
    (hasResponse &&
      (transport.providerRequestId !== receipt.providerRequestId ||
        transport.responseHeaderDigest !== receipt.responseHeaderDigest)) ||
    hasModel !== (transport.resolvedModelId !== undefined) ||
    (hasModel &&
      (transport.resolvedModelId !== receipt.resolvedModelId ||
        transport.resolvedModelVersion !== receipt.resolvedModelVersion)) ||
    (receipt.outcome === 'failed' &&
      receipt.failureCategory === 'model-identity-drift' &&
      modelMatchesTarget) ||
    (receipt.outcome === 'failed' &&
      [
        'provider-response-invalid',
        'usage-unavailable',
        'cost-unavailable',
      ].includes(receipt.failureCategory) &&
      hasModel &&
      !modelMatchesTarget) ||
    (spool !== undefined &&
      (Date.parse(spool.createdAt) < Date.parse(transport.completedAt) ||
        Date.parse(spool.createdAt) > Date.parse(receipt.completedAt))) ||
    (spool !== undefined &&
      disposition !== undefined &&
      Date.parse(disposition.disposedAt) < Date.parse(spool.createdAt)) ||
    hasValidationFailure !== (validationFailure !== undefined) ||
    (validationFailure !== undefined &&
      (receipt.outcome !== 'failed' ||
        receipt.failureCategory !== 'provider-response-invalid' ||
        validationFailure.receiptDigest !== validationFailureReceiptDigest ||
        validationFailure.planDigest !== input.planDigest ||
        validationFailure.repositoryCommit !== input.repositoryCommit ||
        validationFailure.smokeTargetId !== target.smokeTargetId ||
        validationFailure.smokeTargetDigest !== target.targetDigest ||
        validationFailure.invocationId !== intent.invocationId ||
        validationFailure.dispatchIntentDigest !== intent.intentDigest ||
        validationFailure.transportReceiptDigest !== transport.receiptDigest ||
        validationFailure.spoolReceiptDigest !== receipt.spoolReceiptDigest ||
        Date.parse(validationFailure.observedAt) <
          Date.parse(transport.completedAt) ||
        Date.parse(validationFailure.observedAt) >
          Date.parse(receipt.completedAt)))
  ) {
    return false;
  }

  if (!hasSpool) {
    return (
      spool === undefined &&
      disposition === undefined &&
      transport.outcome !== 'completed'
    );
  }
  return (
    spool !== undefined &&
    disposition !== undefined &&
    hasResponse &&
    spool.receiptDigest === receipt.spoolReceiptDigest &&
    spool.planDigest === input.planDigest &&
    spool.repositoryCommit === input.repositoryCommit &&
    spool.smokeTargetId === target.smokeTargetId &&
    spool.smokeTargetDigest === target.targetDigest &&
    spool.invocationId === intent.invocationId &&
    spool.dispatchIntentDigest === intent.intentDigest &&
    spool.transportReceiptDigest === transport.receiptDigest &&
    spool.responseBodyDigest === transport.responseBodyDigest &&
    spool.responseDigest === receipt.responseDigest &&
    disposition.receiptDigest === receipt.spoolDispositionReceiptDigest &&
    disposition.spoolRef === spool.spoolRef &&
    disposition.spoolReceiptDigest === spool.receiptDigest &&
    disposition.planDigest === input.planDigest &&
    disposition.repositoryCommit === input.repositoryCommit &&
    disposition.smokeTargetId === target.smokeTargetId &&
    disposition.smokeTargetDigest === target.targetDigest &&
    disposition.invocationId === intent.invocationId &&
    disposition.retentionPolicyDigest === spool.retentionPolicyDigest
  );
};

export const qualifiesAgentEvaluationEndpointSmokeReceipt = (
  receipt: AgentEvaluationEndpointSmokeReceipt
): boolean => receipt.outcome === 'passed';

export const qualifiesAgentEvaluationEndpointSmokeSet = (
  targets: readonly AgentEvaluationEndpointSmokeTarget[],
  receipts: readonly AgentEvaluationEndpointSmokeReceipt[]
): boolean => {
  if (
    targets.length !== 5 ||
    receipts.length !== 5 ||
    !hasFrozenReleaseSmokeComposition(targets) ||
    receipts.some(
      (receipt) =>
        !isAgentEvaluationEndpointSmokeReceipt(receipt) ||
        !qualifiesAgentEvaluationEndpointSmokeReceipt(receipt)
    )
  ) {
    return false;
  }
  const targetIds = targets.map(({ smokeTargetId }) => smokeTargetId);
  const receiptTargetIds = receipts.map(({ smokeTargetId }) => smokeTargetId);
  const receiptsByTarget = new Map(
    receipts.map((receipt) => [receipt.smokeTargetId, receipt])
  );
  return (
    new Set(targetIds).size === targetIds.length &&
    new Set(receiptTargetIds).size === receiptTargetIds.length &&
    targets.every((target) => {
      const receipt = receiptsByTarget.get(target.smokeTargetId);
      return (
        receipt?.smokeTargetDigest === target.targetDigest &&
        receipt.endpointClass === target.endpointClass &&
        receipt.protocolFamily === target.protocolFamily &&
        receipt.providerConfigurationId === target.providerConfigurationId &&
        receipt.modelId === target.modelId &&
        receipt.immutableModelVersion === target.immutableModelVersion &&
        receipt.modelLineageDigest === target.modelLineageDigest &&
        receipt.inferenceConfigurationDigest ===
          target.inferenceConfigurationDigest &&
        receipt.adapterDigest === target.adapterDigest &&
        receipt.smokeProfileDigest === target.smokeProfileDigest &&
        receipt.pricingAuthorityDigest === target.pricingAuthorityDigest &&
        receipt.responseSpoolEncryptionPolicyDigest ===
          target.responseSpoolEncryptionPolicyDigest
      );
    })
  );
};
