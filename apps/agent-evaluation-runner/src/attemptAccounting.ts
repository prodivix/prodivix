import {
  createAgentEvaluationPlanPricingSourceReceiptId,
  createAgentEvaluationSourceReceipt,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  digestAgentEvaluationCostCalculationSource,
  digestAgentEvaluationCostValues,
  digestAgentEvaluationResolvedModelIdentity,
  normalizeAgentCosts,
  priceAgentUsage,
  type AgentCost,
  type AgentEvaluationSourceReceipt,
  type AgentUsageVector,
  type CanonicalDigest,
} from '@prodivix/ai';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentEvaluationAttemptAccounting,
  AgentEvaluationAttemptAccountingInput,
  AgentEvaluationAttemptAccountingPersistence,
  AgentEvaluationAttemptNativeProtocol,
} from './attemptExecutor';
import { digestAgentEvaluationAttemptAccounting } from './attemptExecutor';
import type { AgentEvaluationTransportReceipt } from './providerTransport';
import type {
  AgentEvaluationFrozenPricingAuthority,
  AgentEvaluationProductionFrozenRunConfig,
  AgentEvaluationRunConfigProviderKey,
} from './runConfig';
const failureSourceUri = 'transport-receipt:agent-evaluation-attempt';

export type AgentEvaluationAttemptAccountingRecord = Readonly<{
  format: 'prodivix.agent-evaluation-attempt-accounting-record';
  version: 1;
  planDigest: CanonicalDigest;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
  resolvedModelIdentityDigest: CanonicalDigest;
  pricingAuthorityDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  pricingSourceReceiptDigest?: CanonicalDigest;
  dispatchState: AgentEvaluationAttemptAccounting['dispatchState'];
  costStatus: AgentEvaluationAttemptAccounting['costStatus'];
  accountingDigest: CanonicalDigest;
  recordDigest: CanonicalDigest;
}>;

export type AgentEvaluationAttemptAccountingRecordPersistence = (
  record: AgentEvaluationAttemptAccountingRecord
) =>
  | AgentEvaluationAttemptAccountingRecord
  | Promise<AgentEvaluationAttemptAccountingRecord>;

export type CreateAgentEvaluationProductionAttemptAccountingInput = Readonly<{
  runConfig: AgentEvaluationProductionFrozenRunConfig;
  persistAccountingRecord: AgentEvaluationAttemptAccountingRecordPersistence;
}>;

const providerKeyFor = (
  protocolFamily: AgentEvaluationAttemptNativeProtocol
): AgentEvaluationRunConfigProviderKey => {
  switch (protocolFamily) {
    case 'openai-responses':
      return 'openaiResponses';
    case 'anthropic-messages':
      return 'anthropicMessages';
    case 'gemini-interactions':
      return 'geminiInteractions';
  }
};

const withUsageSource = (
  usage: AgentUsageVector,
  sourceDigest: CanonicalDigest
): AgentUsageVector =>
  createAgentUsageVector(
    usage.amounts.map((amount) => Object.freeze({ ...amount, sourceDigest }))
  );

const withCostSource = (
  cost: readonly AgentCost[],
  sourceDigest: CanonicalDigest
): readonly AgentCost[] =>
  normalizeAgentCosts(
    cost.map((value) => Object.freeze({ ...value, sourceDigest }))
  );

const hasBillableAuthoritativeUsage = (usage: AgentUsageVector): boolean =>
  usage.amounts.length > 0 &&
  usage.amounts.every(
    ({ confidence, logicalAmount, billableAmount }) =>
      confidence !== 'unknown' &&
      (billableAmount !== undefined || logicalAmount !== undefined)
  );

const sourceReceiptId = (
  kind: 'cost' | 'usage',
  input: AgentEvaluationAttemptAccountingInput
): string =>
  `evaluation-source.${kind}.${digestAgentCanonicalValue({
    descriptorDigest: input.descriptor.descriptorDigest,
    invocationId: input.invocation.invocationId,
    requestDigest: input.invocation.requestDigest,
  }).slice('sha256-'.length)}`;

const responseHeaderDigestFor = (
  receipt: AgentEvaluationTransportReceipt
): CanonicalDigest =>
  receipt.responseHeaderDigest ??
  digestAgentCanonicalValue({
    transportReceiptDigest: receipt.receiptDigest,
    responseHeaders: 'unavailable',
  });

const failureAuthorityFor = (
  receipt: AgentEvaluationTransportReceipt
): Readonly<{
  executionFailureAuthorityReceiptDigest: CanonicalDigest;
  executionFailureSourceUri: string;
}> =>
  Object.freeze({
    executionFailureAuthorityReceiptDigest: receipt.receiptDigest,
    executionFailureSourceUri: failureSourceUri,
  });

const resolvedModelIdentityFor = (
  protocolFamily: AgentEvaluationAttemptNativeProtocol,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority
): Readonly<{
  resolvedModelId?: string;
  resolvedModelVersion?: string;
  resolvedModelIdentityDigest: CanonicalDigest;
}> => {
  const base = Object.freeze({
    protocolFamily,
    transportReceiptDigest: receipt.receiptDigest,
    frozenModelId: authority.modelId,
    frozenImmutableModelVersion: authority.immutableModelVersion,
    ...(receipt.resolvedModelId
      ? { resolvedModelId: receipt.resolvedModelId }
      : {}),
    ...(receipt.resolvedModelVersion
      ? { resolvedModelVersion: receipt.resolvedModelVersion }
      : {}),
  });
  return Object.freeze({
    ...(receipt.resolvedModelId
      ? { resolvedModelId: receipt.resolvedModelId }
      : {}),
    ...(receipt.resolvedModelVersion
      ? { resolvedModelVersion: receipt.resolvedModelVersion }
      : {}),
    resolvedModelIdentityDigest:
      digestAgentEvaluationResolvedModelIdentity(base),
  });
};

const responseReportedModelMatches = (
  protocolFamily: AgentEvaluationAttemptNativeProtocol,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority
): boolean =>
  receipt.resolvedModelId === authority.modelId &&
  (receipt.resolvedModelVersion === undefined ||
    receipt.resolvedModelVersion === authority.immutableModelVersion) &&
  (protocolFamily !== 'gemini-interactions' ||
    receipt.resolvedModelVersion === authority.immutableModelVersion);

const assertInputBinding = (
  input: AgentEvaluationAttemptAccountingInput,
  runConfig: AgentEvaluationProductionFrozenRunConfig,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority
): void => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  );
  const provider = target
    ? input.plan.providerConfigurations.find(
        ({ providerConfigurationId }) =>
          providerConfigurationId === target.providerConfigurationId
      )
    : undefined;
  const model = target
    ? input.plan.modelConfigurations.find(
        ({ lineageDigest }) => lineageDigest === target.modelLineageDigest
      )
    : undefined;
  if (
    input.plan.planDigest !== runConfig.plan.planDigest ||
    !sameCanonicalJson(input.plan, runConfig.plan) ||
    runConfig.execution.retry.maximumAttempts !== 1 ||
    !target ||
    !provider ||
    !model ||
    target.protocolFamily !== input.protocolFamily ||
    target.providerConfigurationId !== authority.providerConfigurationId ||
    target.modelId !== authority.modelId ||
    model.modelId !== authority.modelId ||
    model.immutableVersion !== authority.immutableModelVersion ||
    authority.snapshot.providerConfigurationId !==
      authority.providerConfigurationId ||
    authority.snapshot.serviceTier !== authority.modelTier ||
    authority.snapshot.region !== provider.providerRegion ||
    receipt.protocolFamily !== input.protocolFamily ||
    receipt.providerConfigurationId !== target.providerConfigurationId ||
    receipt.invocationId !== input.invocation.invocationId ||
    receipt.requestDigest !== input.invocation.requestDigest ||
    Date.parse(receipt.startedAt) < Date.parse(input.startedAt) ||
    Date.parse(receipt.completedAt) > Date.parse(input.completedAt)
  ) {
    throw new TypeError(
      'Evaluation accounting plan, pricing, transport, or invocation binding drifted.'
    );
  }
};

export type CreateAgentEvaluationPlanPricingSourceReceiptInput = Readonly<{
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  modelLineageDigest: CanonicalDigest;
  authority: AgentEvaluationFrozenPricingAuthority;
}>;

/** One canonical pricing-snapshot receipt is reused across every plan invocation for this authority. */
export const createAgentEvaluationPlanPricingSourceReceipt = (
  input: CreateAgentEvaluationPlanPricingSourceReceiptInput
): AgentEvaluationSourceReceipt => {
  const { authority } = input;
  return createAgentEvaluationSourceReceipt({
    sourceReceiptId: createAgentEvaluationPlanPricingSourceReceiptId({
      planDigest: input.planDigest,
      providerConfigurationId: authority.providerConfigurationId,
      modelLineageDigest: input.modelLineageDigest,
      pricingAuthorityDigest: authority.authorityDigest,
      pricingSnapshotDigest: authority.snapshot.snapshotDigest,
    }),
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    sourceKind: 'pricing-snapshot',
    providerConfigurationId: authority.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    sourceUri: authority.source.sourceUri,
    sourceContentDigest: authority.snapshot.snapshotDigest,
    pricingSnapshot: authority.snapshot,
    observedAt: authority.source.observedAt,
  });
};

const createPricingSourceReceipt = (
  input: AgentEvaluationAttemptAccountingInput,
  authority: AgentEvaluationFrozenPricingAuthority
): AgentEvaluationSourceReceipt =>
  createAgentEvaluationPlanPricingSourceReceipt({
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    modelLineageDigest: input.plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === input.descriptor.targetId
    )!.modelLineageDigest,
    authority,
  });

const createAccountingRecord = (
  input: AgentEvaluationAttemptAccountingInput,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority,
  accounting: AgentEvaluationAttemptAccounting
): AgentEvaluationAttemptAccountingRecord => {
  const base = Object.freeze({
    format: 'prodivix.agent-evaluation-attempt-accounting-record' as const,
    version: 1 as const,
    planDigest: input.plan.planDigest,
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocation.invocationId,
    requestDigest: input.invocation.requestDigest,
    responseDigest: input.responseDigest,
    transportReceiptDigest: receipt.receiptDigest,
    ...(accounting.resolvedModelId
      ? { resolvedModelId: accounting.resolvedModelId }
      : {}),
    ...(accounting.resolvedModelVersion
      ? { resolvedModelVersion: accounting.resolvedModelVersion }
      : {}),
    resolvedModelIdentityDigest: accounting.resolvedModelIdentityDigest,
    pricingAuthorityDigest: authority.authorityDigest,
    usageSourceReceiptDigest: accounting.usageSourceReceipt.receiptDigest,
    costSourceReceiptDigest: accounting.costSourceReceipt.receiptDigest,
    ...(accounting.pricingSourceReceipt
      ? {
          pricingSourceReceiptDigest:
            accounting.pricingSourceReceipt.receiptDigest,
        }
      : {}),
    dispatchState: accounting.dispatchState,
    costStatus: accounting.costStatus,
    accountingDigest: accounting.accountingDigest,
  });
  return Object.freeze({
    ...base,
    recordDigest: digestAgentCanonicalValue(base),
  });
};

const exactPersist = async (
  record: AgentEvaluationAttemptAccountingRecord,
  persist: AgentEvaluationAttemptAccountingRecordPersistence
): Promise<void> => {
  const stored = await persist(record);
  if (!sameCanonicalJson(stored, record)) {
    throw new Error('Evaluation accounting record persistence drifted.');
  }
};

const sourceBase = (
  input: AgentEvaluationAttemptAccountingInput,
  authority: AgentEvaluationFrozenPricingAuthority
) => {
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  )!;
  return Object.freeze({
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    providerConfigurationId: authority.providerConfigurationId,
    modelLineageDigest: target.modelLineageDigest,
    observedAt: input.completedAt,
  });
};

const buildPricedAccounting = (
  input: AgentEvaluationAttemptAccountingInput,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority,
  canonicalReportedUsage: AgentUsageVector
): AgentEvaluationAttemptAccounting => {
  if (receipt.dispatchState !== 'dispatched') {
    throw new TypeError(
      'Not-dispatched evaluation turns have zero actual accounting and no provider source receipts.'
    );
  }
  const providerRequestId = receipt.providerRequestId!;
  const modelIdentity = resolvedModelIdentityFor(
    input.protocolFamily,
    receipt,
    authority
  );
  const usageContentDigest = digestAgentCanonicalValue({
    sourceKind: 'provider-reported-usage',
    transportReceiptDigest: receipt.receiptDigest,
    providerRequestId,
    reportedUsageDigest: canonicalReportedUsage.vectorDigest,
  });
  const usage = withUsageSource(canonicalReportedUsage, usageContentDigest);
  const calculatedCost = priceAgentUsage(usage, authority.snapshot);
  if (
    calculatedCost.length === 0 ||
    calculatedCost.some(
      ({ amount, confidence }) =>
        amount === undefined || confidence === 'unknown'
    )
  ) {
    throw new TypeError('Evaluation authoritative usage was not priceable.');
  }
  const outputCostDigest = digestAgentEvaluationCostValues(calculatedCost);
  const costContentDigest = digestAgentEvaluationCostCalculationSource({
    providerConfigurationId: authority.providerConfigurationId,
    modelLineageDigest: sourceBase(input, authority).modelLineageDigest,
    providerRequestId,
    pricingSnapshotDigest: authority.snapshot.snapshotDigest,
    inputUsageDigest: usage.vectorDigest,
    outputCostDigest,
  });
  const cost = withCostSource(calculatedCost, costContentDigest);
  const base = sourceBase(input, authority);
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: sourceReceiptId('usage', input),
    ...base,
    sourceKind: 'provider-reported-usage',
    providerRequestId,
    sourceContentDigest: usageContentDigest,
    inputUsageDigest: usage.vectorDigest,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: sourceReceiptId('cost', input),
    ...base,
    sourceKind: 'cost-calculation',
    providerRequestId,
    sourceContentDigest: costContentDigest,
    pricingSnapshot: authority.snapshot,
    inputUsageDigest: usage.vectorDigest,
    outputCostDigest,
  });
  const pricingSourceReceipt = createPricingSourceReceipt(input, authority);
  const sourceReceiptDigests = [
    usageSourceReceipt.receiptDigest,
    costSourceReceipt.receiptDigest,
    pricingSourceReceipt.receiptDigest,
  ];
  const responseHeaderDigest = responseHeaderDigestFor(receipt);
  const accountingDigest = digestAgentEvaluationAttemptAccounting({
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocation.invocationId,
    requestDigest: input.invocation.requestDigest,
    responseDigest: input.responseDigest,
    status: input.status,
    costStatus: 'priced',
    usageVectorDigest: usage.vectorDigest,
    cost,
    sourceReceiptDigests,
    transportReceiptDigest: receipt.receiptDigest,
    resolvedModelIdentityDigest: modelIdentity.resolvedModelIdentityDigest,
    providerRequestId,
    responseHeaderDigest,
  });
  return Object.freeze({
    usage,
    dispatchState: 'dispatched',
    costStatus: 'priced',
    cost,
    usageSourceReceipt,
    costSourceReceipt,
    pricingSourceReceipt,
    providerRequestId,
    transportReceiptDigest: receipt.receiptDigest,
    ...modelIdentity,
    responseHeaderDigest,
    accountingDigest,
  });
};

const buildUnpricedAccounting = (
  input: AgentEvaluationAttemptAccountingInput,
  receipt: AgentEvaluationTransportReceipt,
  authority: AgentEvaluationFrozenPricingAuthority
): AgentEvaluationAttemptAccounting => {
  if (receipt.dispatchState !== 'dispatched') {
    throw new TypeError(
      'Not-dispatched evaluation turns have zero actual accounting and no provider source receipts.'
    );
  }
  const statusOverride =
    input.status === 'completed'
      ? ('infrastructure-error' as const)
      : undefined;
  const effectiveStatus = statusOverride ?? input.status;
  const modelIdentity = resolvedModelIdentityFor(
    input.protocolFamily,
    receipt,
    authority
  );
  const usage = createAgentUsageVector([]);
  const cost = normalizeAgentCosts([]);
  const providerAuthority = receipt.providerRequestId
    ? Object.freeze({ providerRequestId: receipt.providerRequestId })
    : undefined;
  const failureAuthority = providerAuthority
    ? undefined
    : failureAuthorityFor(receipt);
  const sourceAuthority = providerAuthority ?? failureAuthority!;
  const usageContentDigest = digestAgentCanonicalValue({
    sourceKind: 'provider-reported-usage',
    transportReceiptDigest: receipt.receiptDigest,
    dispatchState: receipt.dispatchState,
    reportedUsageDigest: input.reportedUsage.vectorDigest,
  });
  const base = sourceBase(input, authority);
  const usageSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: sourceReceiptId('usage', input),
    ...base,
    sourceKind: 'provider-reported-usage',
    ...sourceAuthority,
    ...(failureAuthority ? { sourceUri: failureSourceUri } : {}),
    sourceContentDigest: usageContentDigest,
    inputUsageDigest: usage.vectorDigest,
  });
  const outputCostDigest = digestAgentEvaluationCostValues(cost);
  const costContentDigest = digestAgentCanonicalValue({
    sourceKind: 'provider-reported-cost',
    transportReceiptDigest: receipt.receiptDigest,
    dispatchState: receipt.dispatchState,
    outputCostDigest,
  });
  const costSourceReceipt = createAgentEvaluationSourceReceipt({
    sourceReceiptId: sourceReceiptId('cost', input),
    ...base,
    sourceKind: 'provider-reported-cost',
    ...sourceAuthority,
    ...(failureAuthority ? { sourceUri: failureSourceUri } : {}),
    sourceContentDigest: costContentDigest,
    outputCostDigest,
  });
  const sourceReceiptDigests = [
    usageSourceReceipt.receiptDigest,
    costSourceReceipt.receiptDigest,
  ];
  const costStatus = 'unknown' as const;
  const responseHeaderDigest = responseHeaderDigestFor(receipt);
  const accountingDigest = digestAgentEvaluationAttemptAccounting({
    descriptorDigest: input.descriptor.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocation.invocationId,
    requestDigest: input.invocation.requestDigest,
    responseDigest: input.responseDigest,
    status: effectiveStatus,
    costStatus,
    usageVectorDigest: usage.vectorDigest,
    cost,
    sourceReceiptDigests,
    transportReceiptDigest: receipt.receiptDigest,
    resolvedModelIdentityDigest: modelIdentity.resolvedModelIdentityDigest,
    ...(providerAuthority ?? {
      executionFailureAuthorityReceiptDigest:
        failureAuthority!.executionFailureAuthorityReceiptDigest,
      executionFailureSourceUri: failureSourceUri,
    }),
    responseHeaderDigest,
  });
  return Object.freeze({
    usage,
    ...(statusOverride ? { statusOverride } : {}),
    dispatchState: 'dispatched',
    costStatus,
    cost,
    usageSourceReceipt,
    costSourceReceipt,
    ...(providerAuthority ?? {
      executionFailureAuthorityReceiptDigest:
        failureAuthority!.executionFailureAuthorityReceiptDigest,
      executionFailureSourceUri: failureSourceUri,
    }),
    transportReceiptDigest: receipt.receiptDigest,
    ...modelIdentity,
    responseHeaderDigest,
    accountingDigest,
  });
};

/**
 * Creates the production usage/cost projection from frozen run pricing and one
 * exact captured transport receipt. No environment, fetch, or credential owner
 * is reachable through this factory.
 */
export const createAgentEvaluationProductionAttemptAccounting = (
  factory: CreateAgentEvaluationProductionAttemptAccountingInput
): AgentEvaluationAttemptAccountingPersistence => {
  if (
    factory.runConfig.purpose !== 'production' ||
    factory.runConfig.execution.retry.maximumAttempts !== 1
  ) {
    throw new TypeError(
      'Production accounting requires a production run with one transport attempt.'
    );
  }
  return async (input) => {
    const providerKey = providerKeyFor(input.protocolFamily);
    const authority = factory.runConfig.pricingAuthorities[providerKey];
    const target = input.plan.capabilityQualificationTargets.find(
      ({ targetId }) => targetId === input.descriptor.targetId
    );
    if (!authority || !target) {
      throw new TypeError('Evaluation pricing authority is unavailable.');
    }
    const receipt = input.transportReceipt;
    assertInputBinding(input, factory.runConfig, receipt, authority);
    const canonicalReportedUsage = createAgentUsageVector(
      input.reportedUsage.amounts
    );
    if (!sameCanonicalJson(canonicalReportedUsage, input.reportedUsage)) {
      throw new TypeError('Evaluation provider usage digest drifted.');
    }
    const canPrice =
      receipt.dispatchState === 'dispatched' &&
      receipt.providerRequestId !== undefined &&
      responseReportedModelMatches(input.protocolFamily, receipt, authority) &&
      hasBillableAuthoritativeUsage(canonicalReportedUsage);
    const accounting = canPrice
      ? buildPricedAccounting(input, receipt, authority, canonicalReportedUsage)
      : buildUnpricedAccounting(input, receipt, authority);
    await exactPersist(
      createAccountingRecord(input, receipt, authority, accounting),
      factory.persistAccountingRecord
    );
    return accounting;
  };
};

export const AGENT_EVALUATION_ATTEMPT_FAILURE_SOURCE_URI = failureSourceUri;
