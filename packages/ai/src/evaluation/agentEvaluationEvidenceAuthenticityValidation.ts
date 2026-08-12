import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentBudgetLedgerState } from '../usage/agentBudgetLedger';
import type {
  AgentEvaluationIssue,
  AgentEvaluationShardCheckpoint,
  AgentModelEvaluationAttempt,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationPlan,
} from './agentEvaluation.types';
import { createAgentEvaluationBlindReviewPreviewProjection } from './agentEvaluationBlindReviewProjection';
import {
  digestAgentEvaluationCapabilityExecutionReceiptSet,
  isAgentEvaluationCapabilityExecutionReceipt,
} from './agentEvaluationCapabilityExecution';
import { validateAgentEvaluationCapabilitySpecificEvidence } from './agentEvaluationCapabilitySpecificEvidenceValidation';
import { resolveAgentEvaluationCapabilityDescriptor } from './agentEvaluationPlan';
import {
  AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON,
  isAgentEvaluationPreDispatchFailureReceipt,
} from './agentEvaluationPreDispatchFailure';
import { isAgentEvaluationReviewRasterScanReceipt } from './agentEvaluationResults';
import {
  canonicalAgentEvaluationAuthenticityOrder,
  createAgentEvaluationInvocationTurnSetReceipt,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationResolvedModelIdentity,
  digestAgentEvaluationTransportDispatchIntentSet,
  digestAgentEvaluationTransportReceiptSet,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentEvaluationBlindReviewMappingRef,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationProviderResultSpoolDispositionReceipt,
  isAgentEvaluationProviderResultSpoolReceipt,
  isAgentEvaluationResultSubmissionReceipt,
  isAgentEvaluationReviewCandidateEvidenceRef,
  isAgentEvaluationTransportDispatchIntent,
  isAgentEvaluationTransportReceipt,
} from './agentEvaluationEvidenceAuthenticity';
import type {
  AgentEvaluationEvidenceAuthenticityArrays,
  AgentEvaluationInvocationTurnReceipt,
} from './agentEvaluationEvidenceAuthenticity.types';
import type { AgentEvaluationExecutionReceipt } from './agentEvaluationEvidenceBundle';
import {
  canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests,
  digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet,
  digestAgentEvaluationVerificationAttemptGrantReceiptSet,
  isAgentEvaluationVerificationAttemptGrantReceipt,
} from './agentEvaluationVerificationAttemptGrant';

export type AgentEvaluationEvidenceAuthenticityValidationInput =
  AgentEvaluationEvidenceAuthenticityArrays &
    Readonly<{
      plan: AgentModelEvaluationPlan;
      attempts: readonly AgentModelEvaluationAttempt[];
      descriptors: readonly AgentModelEvaluationAttemptDescriptor[];
      executionReceipts: readonly AgentEvaluationExecutionReceipt[];
      budgetLedger: AgentBudgetLedgerState;
      checkpoints?: readonly AgentEvaluationShardCheckpoint[];
    }>;

const issue = (path: string, message: string): AgentEvaluationIssue =>
  Object.freeze({ code: 'AI-8011', path, message, blocking: true });

const addDuplicateIssues = <T>(
  values: readonly T[],
  identity: (value: T) => string,
  path: string,
  issues: AgentEvaluationIssue[]
): void => {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    const current = identity(value);
    if (seen.has(current)) {
      issues.push(issue(`${path}/${index}`, `Duplicate authority ${current}.`));
    }
    seen.add(current);
  }
};

const groupBy = <T>(
  values: readonly T[],
  identity: (value: T) => string
): ReadonlyMap<string, readonly T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = identity(value);
    const current = grouped.get(key) ?? [];
    current.push(value);
    grouped.set(key, current);
  }
  return grouped;
};

/** Verifies the durable fact behind every turn that failed before dispatch creation. */
export const validateAgentEvaluationPreDispatchFailureCoverage = (
  input: Pick<
    AgentEvaluationEvidenceAuthenticityArrays,
    'preDispatchFailureReceipts' | 'invocationTurnReceipts'
  >
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  addDuplicateIssues(
    input.preDispatchFailureReceipts,
    ({ failureReceiptId }) => failureReceiptId,
    '/preDispatchFailureReceipts',
    issues
  );
  addDuplicateIssues(
    input.preDispatchFailureReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/preDispatchFailureReceipts',
    issues
  );
  const receiptsByDigest = new Map(
    input.preDispatchFailureReceipts.map((receipt) => [
      receipt.receiptDigest,
      receipt,
    ])
  );
  const usedReceiptIds = new Set<string>();
  for (const [index, receipt] of input.preDispatchFailureReceipts.entries()) {
    if (!isAgentEvaluationPreDispatchFailureReceipt(receipt)) {
      issues.push(
        issue(
          `/preDispatchFailureReceipts/${index}`,
          'Pre-dispatch failure receipt is malformed.'
        )
      );
    }
  }
  for (const [index, turn] of input.invocationTurnReceipts.entries()) {
    const receipt = turn.executionFailureAuthorityReceiptDigest
      ? receiptsByDigest.get(turn.executionFailureAuthorityReceiptDigest)
      : undefined;
    if (turn.dispatchState === 'not-created') {
      if (
        !receipt ||
        !isAgentEvaluationPreDispatchFailureReceipt(receipt) ||
        receipt.planDigest !== turn.planDigest ||
        receipt.repositoryCommit !== turn.repositoryCommit ||
        receipt.attemptId !== turn.attemptId ||
        receipt.descriptorDigest !== turn.descriptorDigest ||
        receipt.turnIndex !== turn.turnIndex ||
        receipt.invocationId !== turn.invocationId ||
        AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON[
          receipt.reasonCode
        ] !== turn.status
      ) {
        issues.push(
          issue(
            `/invocationTurnReceipts/${index}/executionFailureAuthorityReceiptDigest`,
            'A not-created turn requires one exact pre-dispatch failure receipt.'
          )
        );
      } else {
        usedReceiptIds.add(receipt.failureReceiptId);
      }
    } else if (receipt) {
      issues.push(
        issue(
          `/invocationTurnReceipts/${index}/executionFailureAuthorityReceiptDigest`,
          'A created dispatch cannot cite pre-dispatch failure authority.'
        )
      );
    }
  }
  for (const [index, receipt] of input.preDispatchFailureReceipts.entries()) {
    if (!usedReceiptIds.has(receipt.failureReceiptId)) {
      issues.push(
        issue(
          `/preDispatchFailureReceipts/${index}`,
          'Pre-dispatch failure receipt is orphaned.'
        )
      );
    }
  }
  return Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
};

/** Verifies one safe structured raster scan for every blind-review candidate. */
export const validateAgentEvaluationReviewRasterScanCoverage = (
  input: Pick<
    AgentEvaluationEvidenceAuthenticityArrays,
    'reviewCandidateRefs' | 'reviewRasterScanReceipts'
  >
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  addDuplicateIssues(
    input.reviewRasterScanReceipts,
    ({ scanReceiptId }) => scanReceiptId,
    '/reviewRasterScanReceipts',
    issues
  );
  addDuplicateIssues(
    input.reviewRasterScanReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/reviewRasterScanReceipts',
    issues
  );
  addDuplicateIssues(
    input.reviewRasterScanReceipts,
    ({ attemptId }) => attemptId,
    '/reviewRasterScanReceipts',
    issues
  );
  const candidatesByAttempt = new Map(
    input.reviewCandidateRefs.map((reference) => [
      reference.attemptId,
      reference,
    ])
  );
  const scansByAttempt = groupBy(
    input.reviewRasterScanReceipts,
    ({ attemptId }) => attemptId
  );
  for (const [index, reference] of input.reviewCandidateRefs.entries()) {
    const scans = scansByAttempt.get(reference.attemptId) ?? [];
    const scan = scans[0];
    if (
      scans.length !== 1 ||
      !scan ||
      !isAgentEvaluationReviewRasterScanReceipt(scan) ||
      scan.verdict !== 'safe' ||
      scan.planDigest !== reference.planDigest ||
      scan.repositoryCommit !== reference.repositoryCommit ||
      scan.attemptId !== reference.attemptId ||
      scan.descriptorDigest !== reference.descriptorDigest ||
      scan.projectionAuthorityDigest !== reference.projectionAuthorityDigest ||
      scan.mediaType !== reference.mediaType ||
      scan.width !== reference.width ||
      scan.height !== reference.height ||
      scan.byteLength !== reference.byteLength ||
      scan.bytesDigest !== reference.bytesDigest ||
      scan.receiptDigest !== reference.publicArtifactScanDigest
    ) {
      issues.push(
        issue(
          `/reviewCandidateRefs/${index}/publicArtifactScanDigest`,
          'Review candidate requires one exact safe raster scan receipt.'
        )
      );
    }
  }
  for (const [index, scan] of input.reviewRasterScanReceipts.entries()) {
    if (!candidatesByAttempt.has(scan.attemptId)) {
      issues.push(
        issue(
          `/reviewRasterScanReceipts/${index}`,
          'Review raster scan receipt is orphaned.'
        )
      );
    }
  }
  return Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
};

const invocationOutcomeMatchesStatus = (
  turn: AgentEvaluationInvocationTurnReceipt
): boolean => {
  const receipt = turn.invocationReceipt;
  if (!receipt) return true;
  switch (turn.status) {
    case 'completed':
      return receipt.outcome === 'completed';
    case 'timed-out':
      return receipt.outcome === 'timed-out';
    case 'schema-failed':
      return receipt.outcome === 'schema-failed';
    case 'cancelled':
      return receipt.outcome === 'cancelled';
    case 'blocked':
      return ['refused', 'safety-blocked'].includes(receipt.outcome);
    case 'provider-error':
    case 'rate-limited':
    case 'infrastructure-error':
      return receipt.outcome === 'provider-error';
  }
};

const transportOutcomeMatchesTurn = (
  turn: AgentEvaluationInvocationTurnReceipt,
  outcome: 'completed' | 'failed' | 'post-dispatch-unknown'
): boolean =>
  turn.status === 'completed'
    ? outcome === 'completed'
    : turn.dispatchState === 'dispatched'
      ? outcome === 'failed' || outcome === 'post-dispatch-unknown'
      : outcome === 'failed';

export const digestAgentEvaluationReviewGraderArtifactAuthority = (
  input: Readonly<{
    attempt: AgentModelEvaluationAttempt;
    executionReceiptDigest: string;
    controlledRuntimeReceiptDigest: string;
    graderPlanDigest: string;
  }>
): string =>
  digestAgentCanonicalValue({
    attemptId: input.attempt.descriptor.attemptId,
    descriptorDigest: input.attempt.descriptor.descriptorDigest,
    executionReceiptDigest: input.executionReceiptDigest,
    controlledRuntimeReceiptDigest: input.controlledRuntimeReceiptDigest,
    graderPlanDigest: input.graderPlanDigest,
    metricObservationDigests: input.attempt.metricObservations.map(
      ({ observationDigest }) => observationDigest
    ),
  });

/** Cross-validates the durable intent→transport→turn→runtime authority chain. */
export const validateAgentEvaluationEvidenceAuthenticity = (
  input: AgentEvaluationEvidenceAuthenticityValidationInput
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const plan = input.plan;
  const descriptors = new Map(
    input.descriptors.map((descriptor) => [descriptor.attemptId, descriptor])
  );
  const attempts = new Map(
    input.attempts.map((attempt) => [attempt.descriptor.attemptId, attempt])
  );
  const executions = new Map(
    input.executionReceipts.map((receipt) => [receipt.attemptId, receipt])
  );
  const cases = new Map(
    plan.concreteCases.map((concreteCase) => [
      concreteCase.caseId,
      concreteCase,
    ])
  );
  const targets = new Map(
    plan.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  const providers = new Map(
    plan.providerConfigurations.map((provider) => [
      provider.providerConfigurationId,
      provider,
    ])
  );
  const models = new Map(
    plan.modelConfigurations.map((model) => [model.lineageDigest, model])
  );
  const reservations = new Map(
    input.budgetLedger.reservations.map((reservation) => [
      reservation.reservationId,
      reservation,
    ])
  );

  issues.push(...validateAgentEvaluationPreDispatchFailureCoverage(input));
  issues.push(...validateAgentEvaluationReviewRasterScanCoverage(input));
  issues.push(...validateAgentEvaluationCapabilitySpecificEvidence(input));

  addDuplicateIssues(
    input.capabilityExecutionReceipts,
    ({ capabilityExecutionReceiptId }) => capabilityExecutionReceiptId,
    '/capabilityExecutionReceipts',
    issues
  );

  addDuplicateIssues(
    input.verificationAttemptGrantReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/verificationAttemptGrantReceipts',
    issues
  );
  addDuplicateIssues(
    input.verificationAttemptGrantReceipts,
    ({ evaluationAttemptId, cellId }) =>
      `${evaluationAttemptId}\u0000${cellId}`,
    '/verificationAttemptGrantReceipts',
    issues
  );
  for (const [
    index,
    receipt,
  ] of input.verificationAttemptGrantReceipts.entries()) {
    const descriptor = descriptors.get(receipt.evaluationAttemptId);
    if (
      !isAgentEvaluationVerificationAttemptGrantReceipt(receipt) ||
      !descriptor ||
      receipt.evaluationPlanDigest !== plan.planDigest ||
      receipt.repositoryCommit !== plan.repositoryCommit ||
      receipt.descriptorDigest !== descriptor.descriptorDigest ||
      receipt.capabilityDescriptorDigest !==
        descriptor.capabilityDescriptorDigest ||
      receipt.caseId !== descriptor.caseId
    ) {
      issues.push(
        issue(
          `/verificationAttemptGrantReceipts/${index}`,
          'Verification AttemptGrant receipt drifted from its exact plan, commit, descriptor, capability, or case partition.'
        )
      );
    }
  }
  for (const [index, receipt] of input.capabilityExecutionReceipts.entries()) {
    if (!descriptors.has(receipt.attemptId)) {
      issues.push(
        issue(
          `/capabilityExecutionReceipts/${index}`,
          'Capability execution receipt is orphaned from the planned attempt set.'
        )
      );
    }
  }
  addDuplicateIssues(
    input.capabilityExecutionReceipts,
    ({ receiptDigest }) => receiptDigest,
    '/capabilityExecutionReceipts',
    issues
  );

  addDuplicateIssues(
    input.transportDispatchIntents,
    ({ intentId }) => intentId,
    '/transportDispatchIntents',
    issues
  );
  addDuplicateIssues(
    input.transportDispatchIntents,
    ({ intentDigest }) => intentDigest,
    '/transportDispatchIntents',
    issues
  );
  addDuplicateIssues(
    input.transportReceipts,
    ({ receiptId }) => receiptId,
    '/transportReceipts',
    issues
  );
  addDuplicateIssues(
    input.transportReceipts,
    ({ dispatchIntentDigest }) => dispatchIntentDigest,
    '/transportReceipts',
    issues
  );
  addDuplicateIssues(
    input.providerResultSpoolReceipts,
    ({ spoolRef }) => spoolRef,
    '/providerResultSpoolReceipts',
    issues
  );
  addDuplicateIssues(
    input.providerResultSpoolDispositionReceipts,
    ({ spoolRef }) => spoolRef,
    '/providerResultSpoolDispositionReceipts',
    issues
  );
  addDuplicateIssues(
    input.invocationTurnReceipts,
    ({ attemptId, turnIndex }) => `${attemptId}\u0000${turnIndex}`,
    '/invocationTurnReceipts',
    issues
  );
  addDuplicateIssues(
    input.invocationTurnReceipts,
    ({ evidenceDigest }) => evidenceDigest,
    '/invocationTurnReceipts',
    issues
  );
  addDuplicateIssues(
    input.invocationTurnSetReceipts,
    ({ attemptId }) => attemptId,
    '/invocationTurnSetReceipts',
    issues
  );
  addDuplicateIssues(
    input.blindReviewMappingRefs,
    ({ mappingId }) => mappingId,
    '/blindReviewMappingRefs',
    issues
  );
  addDuplicateIssues(
    input.blindReviewMappingRefs,
    ({ mappingDigest }) => mappingDigest,
    '/blindReviewMappingRefs',
    issues
  );
  if (
    input.blindReviewMappingRefs.length !== input.reviewCandidateRefs.length ||
    input.blindReviewMappingRefs.some(
      (reference) => !isAgentEvaluationBlindReviewMappingRef(reference)
    )
  ) {
    issues.push(
      issue(
        '/blindReviewMappingRefs',
        'Opaque blind-review mapping authority must exactly cover every review candidate with unique valid references.'
      )
    );
  }

  const intentsByDigest = new Map(
    input.transportDispatchIntents.map((intent) => [
      intent.intentDigest,
      intent,
    ])
  );
  const transportsByDigest = new Map(
    input.transportReceipts.map((receipt) => [receipt.receiptDigest, receipt])
  );
  const transportsByIntent = groupBy(
    input.transportReceipts,
    ({ dispatchIntentDigest }) => dispatchIntentDigest
  );
  for (const [index, intent] of input.transportDispatchIntents.entries()) {
    const descriptor = descriptors.get(intent.attemptId);
    const target = descriptor ? targets.get(descriptor.targetId) : undefined;
    const reservation = reservations.get(intent.budgetReservationId);
    if (
      !isAgentEvaluationTransportDispatchIntent(intent) ||
      !descriptor ||
      !target ||
      intent.planDigest !== plan.planDigest ||
      intent.repositoryCommit !== plan.repositoryCommit ||
      intent.descriptorDigest !== descriptor.descriptorDigest ||
      intent.protocolFamily !== target.protocolFamily ||
      intent.providerConfigurationId !== target.providerConfigurationId ||
      intent.modelLineageDigest !== target.modelLineageDigest ||
      intent.inferenceConfigurationDigest !==
        target.inferenceConfigurationDigest ||
      !reservation ||
      reservation.demandDigest !== intent.demandDigest ||
      (transportsByIntent.get(intent.intentDigest)?.length ?? 0) !== 1
    ) {
      issues.push(
        issue(
          `/transportDispatchIntents/${index}`,
          'Dispatch intent drifted from plan, descriptor, model, budget, or its exact sealed transport receipt.'
        )
      );
    }
  }

  for (const [index, transport] of input.transportReceipts.entries()) {
    const intent = intentsByDigest.get(transport.dispatchIntentDigest);
    if (
      !isAgentEvaluationTransportReceipt(transport) ||
      !intent ||
      transport.protocolFamily !== intent.protocolFamily ||
      transport.providerConfigurationId !== intent.providerConfigurationId ||
      transport.invocationId !== intent.invocationId ||
      transport.requestDigest !== intent.requestDigest ||
      transport.endpointId !== intent.endpointId ||
      transport.endpointClass !== intent.endpointClass ||
      transport.requestBodyDigest !== intent.requestBodyDigest ||
      transport.requestBytes !== intent.requestBytes ||
      Date.parse(transport.startedAt) < Date.parse(intent.createdAt)
    ) {
      issues.push(
        issue(
          `/transportReceipts/${index}`,
          'Transport receipt drifted from its durable dispatch intent.'
        )
      );
    }
  }

  const spoolsByDigest = new Map(
    input.providerResultSpoolReceipts.map((receipt) => [
      receipt.receiptDigest,
      receipt,
    ])
  );
  const spoolsByTransport = groupBy(
    input.providerResultSpoolReceipts,
    ({ transportReceiptDigest }) => transportReceiptDigest
  );
  const dispositionsBySpool = groupBy(
    input.providerResultSpoolDispositionReceipts,
    ({ spoolRef }) => spoolRef
  );
  for (const [index, spool] of input.providerResultSpoolReceipts.entries()) {
    const transport = transportsByDigest.get(spool.transportReceiptDigest);
    const intent = intentsByDigest.get(spool.dispatchIntentDigest);
    const disposition = dispositionsBySpool.get(spool.spoolRef)?.[0];
    if (
      !isAgentEvaluationProviderResultSpoolReceipt(spool) ||
      !transport ||
      !intent ||
      transport.dispatchIntentDigest !== spool.dispatchIntentDigest ||
      transport.responseBodyDigest !== spool.responseBodyDigest ||
      transport.invocationId !== spool.invocationId ||
      spool.planDigest !== intent.planDigest ||
      spool.repositoryCommit !== intent.repositoryCommit ||
      spool.attemptId !== intent.attemptId ||
      spool.descriptorDigest !== intent.descriptorDigest ||
      spool.turnIndex !== intent.turnIndex ||
      spool.keyId.length === 0 ||
      spool.keyVersion < 1 ||
      Date.parse(spool.createdAt) < Date.parse(transport.completedAt) ||
      !disposition ||
      dispositionsBySpool.get(spool.spoolRef)?.length !== 1 ||
      !isAgentEvaluationProviderResultSpoolDispositionReceipt(disposition) ||
      disposition.spoolReceiptDigest !== spool.receiptDigest ||
      disposition.planDigest !== spool.planDigest ||
      disposition.repositoryCommit !== spool.repositoryCommit ||
      disposition.attemptId !== spool.attemptId ||
      disposition.descriptorDigest !== spool.descriptorDigest ||
      disposition.turnIndex !== spool.turnIndex ||
      disposition.invocationId !== spool.invocationId ||
      disposition.retentionPolicyDigest !== spool.retentionPolicyDigest ||
      Date.parse(disposition.disposedAt) < Date.parse(spool.createdAt) ||
      (disposition.retainedUntil !== undefined &&
        Date.parse(disposition.retainedUntil) > Date.parse(spool.expiresAt))
    ) {
      issues.push(
        issue(
          `/providerResultSpoolReceipts/${index}`,
          'Encrypted provider-result spool or terminal disposition authority drifted.'
        )
      );
    }
  }
  for (const [index, transport] of input.transportReceipts.entries()) {
    if (
      transport.responseBodyDigest !== undefined
        ? spoolsByTransport.get(transport.receiptDigest)?.length !== 1
        : spoolsByTransport.has(transport.receiptDigest)
    ) {
      issues.push(
        issue(
          `/transportReceipts/${index}/responseBodyDigest`,
          'Every captured response body requires one encrypted spool and bodyless failures forbid one.'
        )
      );
    }
  }

  const turnsByAttempt = groupBy(
    input.invocationTurnReceipts,
    ({ attemptId }) => attemptId
  );
  const providerCapabilityObservationsByDigest = new Map(
    input.providerCapabilityObservationReceipts.map((receipt) => [
      receipt.receiptDigest,
      receipt,
    ])
  );
  const turnSetsByAttempt = new Map(
    input.invocationTurnSetReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  for (const [index, turn] of input.invocationTurnReceipts.entries()) {
    const descriptor = descriptors.get(turn.attemptId);
    const attempt = attempts.get(turn.attemptId);
    const target = descriptor ? targets.get(descriptor.targetId) : undefined;
    const concreteCase = descriptor ? cases.get(descriptor.caseId) : undefined;
    const provider = target
      ? providers.get(target.providerConfigurationId)
      : undefined;
    const model = target ? models.get(target.modelLineageDigest) : undefined;
    const intent = turn.dispatchIntentDigest
      ? intentsByDigest.get(turn.dispatchIntentDigest)
      : undefined;
    const transport = turn.transportReceiptDigest
      ? transportsByDigest.get(turn.transportReceiptDigest)
      : undefined;
    const spool = turn.providerResultSpoolReceiptDigest
      ? spoolsByDigest.get(turn.providerResultSpoolReceiptDigest)
      : undefined;
    const bootstrapObservation =
      turn.providerCapabilityObservationReceiptDigest === undefined
        ? undefined
        : providerCapabilityObservationsByDigest.get(
            turn.providerCapabilityObservationReceiptDigest
          );
    const expectedBootstrapFactKind =
      turn.capabilityEffectBindingKind === 'provider-job'
        ? 'provider-job-receipt'
        : turn.capabilityEffectBindingKind === 'provider-cache'
          ? 'provider-cache-receipt'
          : turn.capabilityEffectBindingKind === 'opaque-continuation'
            ? 'opaque-continuation'
            : undefined;
    const hasExpectedBootstrapFact =
      expectedBootstrapFactKind !== undefined &&
      bootstrapObservation?.facts.some(
        ({ factKind }) => factKind === expectedBootstrapFactKind
      );
    const hasTerminalBootstrapFact =
      bootstrapObservation?.facts.some(
        ({ factKind, value }) =>
          factKind === 'provider-event' &&
          [
            'cancelled',
            'completed',
            'failed',
            'partial',
            'refusal',
            'safety-block',
          ].includes(value.type)
      ) ?? false;
    const expectedMediaDigest =
      descriptor?.mediaRepresentationTier === undefined
        ? undefined
        : plan.mediaRepresentationTiers.find(
            ({ caseId, tier }) =>
              caseId === descriptor.caseId &&
              tier === descriptor.mediaRepresentationTier
          )?.representationManifestDigest;
    const resolvedIdentityMatches =
      !turn.invocationReceipt ||
      !target ||
      !model ||
      turn.resolvedModelIdentityDigest ===
        digestAgentEvaluationResolvedModelIdentity({
          protocolFamily: target.protocolFamily,
          transportReceiptDigest: turn.transportReceiptDigest!,
          frozenModelId: model.modelId,
          ...(model.immutableVersion
            ? { frozenImmutableModelVersion: model.immutableVersion }
            : {}),
          ...(turn.resolvedModelId
            ? { resolvedModelId: turn.resolvedModelId }
            : {}),
          ...(turn.resolvedModelVersion
            ? { resolvedModelVersion: turn.resolvedModelVersion }
            : {}),
        });
    if (
      !isAgentEvaluationInvocationTurnReceipt(turn) ||
      !descriptor ||
      !attempt ||
      !target ||
      !concreteCase ||
      turn.planDigest !== plan.planDigest ||
      turn.repositoryCommit !== plan.repositoryCommit ||
      turn.descriptorDigest !== descriptor.descriptorDigest ||
      turn.caseDefinitionDigest !== concreteCase.caseDefinitionDigest ||
      turn.mediaRepresentationManifestDigest !== expectedMediaDigest ||
      (turn.dispatchState === 'not-created'
        ? intent !== undefined || transport !== undefined
        : !intent ||
          !transport ||
          intent.attemptId !== turn.attemptId ||
          intent.descriptorDigest !== turn.descriptorDigest ||
          intent.turnIndex !== turn.turnIndex ||
          intent.invocationId !== turn.invocationId ||
          transport.dispatchState !== turn.dispatchState ||
          transport.invocationId !== turn.invocationId ||
          transportOutcomeMatchesTurn(turn, transport.outcome) === false ||
          transport.providerRequestId !== turn.providerRequestId ||
          transport.responseHeaderDigest !== turn.responseHeaderDigest ||
          transport.resolvedModelId !== turn.resolvedModelId ||
          transport.resolvedModelVersion !== turn.resolvedModelVersion) ||
      (turn.invocationReceipt !== undefined &&
        (!provider ||
          !model ||
          turn.invocationReceipt.runId !== attempt.independentRunId ||
          turn.invocationReceipt.inferenceConfigurationDigest !==
            target.inferenceConfigurationDigest ||
          !sameCanonicalJson(turn.invocationReceipt.provider, provider) ||
          !sameCanonicalJson(turn.invocationReceipt.model, model) ||
          !invocationOutcomeMatchesStatus(turn))) ||
      !resolvedIdentityMatches ||
      (turn.zeroToolCallDisposition !== undefined &&
        (!bootstrapObservation ||
          !target ||
          turn.bootstrapProviderRequestAuthority?.providerRequestProjection
            .protocolFamily !== target.protocolFamily ||
          turn.bootstrapProviderRequestAuthority?.requestBodyDigest !==
            intent?.requestBodyDigest ||
          bootstrapObservation.planDigest !== plan.planDigest ||
          bootstrapObservation.repositoryCommit !== plan.repositoryCommit ||
          bootstrapObservation.attemptId !== turn.attemptId ||
          bootstrapObservation.descriptorDigest !== turn.descriptorDigest ||
          bootstrapObservation.turnIndex !== turn.turnIndex ||
          bootstrapObservation.invocationId !== turn.invocationId ||
          bootstrapObservation.requestDigest !== turn.requestArtifactDigest ||
          bootstrapObservation.responseDigest !== turn.responseArtifactDigest ||
          bootstrapObservation.dispatchIntentDigest !==
            turn.dispatchIntentDigest ||
          bootstrapObservation.transportReceiptDigest !==
            turn.transportReceiptDigest ||
          bootstrapObservation.resultSpoolReceiptDigest !==
            turn.providerResultSpoolReceiptDigest ||
          (turn.zeroToolCallDisposition === 'seal-observation-and-continue'
            ? !hasExpectedBootstrapFact
            : hasExpectedBootstrapFact || !hasTerminalBootstrapFact))) ||
      (transport?.responseBodyDigest !== undefined
        ? !spool ||
          spool.transportReceiptDigest !== transport.receiptDigest ||
          spool.responseDigest !== turn.responseArtifactDigest
        : spool !== undefined)
    ) {
      issues.push(
        issue(
          `/invocationTurnReceipts/${index}`,
          'Invocation turn drifted from plan, durable dispatch, transport, model lineage, encrypted result spool, or terminal status.'
        )
      );
    }
  }

  for (const descriptor of input.descriptors) {
    const attempt = attempts.get(descriptor.attemptId);
    const turns = [...(turnsByAttempt.get(descriptor.attemptId) ?? [])].sort(
      (left, right) => left.turnIndex - right.turnIndex
    );
    const turnSet = turnSetsByAttempt.get(descriptor.attemptId);
    const execution = executions.get(descriptor.attemptId);
    let recreated;
    try {
      recreated = createAgentEvaluationInvocationTurnSetReceipt({
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        attemptId: descriptor.attemptId,
        descriptorDigest: descriptor.descriptorDigest,
        turns,
      });
    } catch {
      recreated = undefined;
    }
    const attemptIntents =
      canonicalAgentEvaluationAuthenticityOrder.transportDispatchIntents(
        input.transportDispatchIntents.filter(
          ({ attemptId }) => attemptId === descriptor.attemptId
        )
      );
    const attemptTransports =
      canonicalAgentEvaluationAuthenticityOrder.transportReceipts(
        input.transportReceipts.filter(({ dispatchIntentDigest }) =>
          attemptIntents.some(
            ({ intentDigest }) => intentDigest === dispatchIntentDigest
          )
        )
      );
    const terminal = turns.at(-1);
    if (
      !attempt ||
      !turnSet ||
      !execution ||
      !recreated ||
      !isAgentEvaluationInvocationTurnSetReceipt(turnSet) ||
      !sameCanonicalJson(turnSet, recreated) ||
      attempt.dispatchIntentSetDigest !==
        digestAgentEvaluationTransportDispatchIntentSet(attemptIntents) ||
      attempt.transportReceiptSetDigest !==
        digestAgentEvaluationTransportReceiptSet(attemptTransports) ||
      attempt.invocationTurnReceiptSetDigest !==
        digestAgentEvaluationInvocationTurnReceiptSet(turns) ||
      attempt.invocationTurnSetReceiptDigest !== turnSet.receiptDigest ||
      attempt.status !== turnSet.terminalStatus ||
      attempt.responseDigest !== terminal?.responseArtifactDigest ||
      !sameCanonicalJson(attempt.usage, turnSet.aggregateUsage) ||
      !sameCanonicalJson(attempt.cost, turnSet.aggregateCost) ||
      execution.modelInvocations !== turnSet.dispatchedInvocationCount
    ) {
      issues.push(
        issue(
          `/invocationTurnSetReceipts/${descriptor.attemptId}`,
          'Attempt turn sequence, aggregate accounting, execution count, or four-level set authority drifted.'
        )
      );
    }
  }

  const submissionsByAttempt = groupBy(
    input.resultSubmissionReceipts,
    ({ attemptId }) => attemptId
  );
  const runtimesByAttempt = groupBy(
    input.controlledRuntimeReceipts,
    ({ attemptId }) => attemptId
  );
  const capabilitiesByAttempt = groupBy(
    input.capabilityExecutionReceipts,
    ({ attemptId }) => attemptId
  );
  const verificationGrantsByAttempt = groupBy(
    input.verificationAttemptGrantReceipts,
    ({ evaluationAttemptId }) => evaluationAttemptId
  );
  const reviewRefsByAttempt = groupBy(
    input.reviewCandidateRefs,
    ({ attemptId }) => attemptId
  );
  for (const descriptor of input.descriptors) {
    const attempt = attempts.get(descriptor.attemptId);
    const execution = executions.get(descriptor.attemptId);
    const turns = turnsByAttempt.get(descriptor.attemptId) ?? [];
    const terminal = turns.at(-1);
    const concreteCase = cases.get(descriptor.caseId);
    const submissions = submissionsByAttempt.get(descriptor.attemptId) ?? [];
    const runtimes = runtimesByAttempt.get(descriptor.attemptId) ?? [];
    const capabilityReceipts =
      capabilitiesByAttempt.get(descriptor.attemptId) ?? [];
    const verificationGrantReceipts =
      verificationGrantsByAttempt.get(descriptor.attemptId) ?? [];
    const reviewRefs = reviewRefsByAttempt.get(descriptor.attemptId) ?? [];
    if (!attempt || !execution || !terminal || !concreteCase) continue;
    const capabilityReceipt = capabilityReceipts[0];
    const capabilityTurn = capabilityReceipt
      ? turns.find(
          ({ turnIndex, invocationId }) =>
            turnIndex === capabilityReceipt.turnIndex &&
            invocationId === capabilityReceipt.invocationId
        )
      : undefined;
    const target = targets.get(descriptor.targetId);
    let resolvedCapabilityDescriptor:
      typeof concreteCase.capabilityDescriptor | undefined;
    try {
      resolvedCapabilityDescriptor = target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
    } catch {
      resolvedCapabilityDescriptor = undefined;
    }
    const capabilitySetDigest =
      digestAgentEvaluationCapabilityExecutionReceiptSet(capabilityReceipts);
    const capabilityRuntime = runtimes[0];
    let verificationAttemptGrantReceiptSetDigest: string | undefined;
    let verificationAttemptGrantReceiptDigests: readonly string[] | undefined;
    try {
      verificationAttemptGrantReceiptSetDigest =
        digestAgentEvaluationVerificationAttemptGrantReceiptSet(
          verificationGrantReceipts
        );
      verificationAttemptGrantReceiptDigests =
        canonicalAgentEvaluationVerificationAttemptGrantReceiptDigests(
          verificationGrantReceipts.map(({ receiptDigest }) => receiptDigest)
        );
    } catch {
      verificationAttemptGrantReceiptSetDigest = undefined;
      verificationAttemptGrantReceiptDigests = undefined;
    }
    const expectedRuntimeVerificationGrantSetDigest =
      verificationAttemptGrantReceiptDigests
        ? digestAgentEvaluationOptionalVerificationAttemptGrantReceiptSet(
            verificationAttemptGrantReceiptDigests
          )
        : undefined;
    if (
      !verificationAttemptGrantReceiptSetDigest ||
      !verificationAttemptGrantReceiptDigests ||
      attempt.verificationAttemptGrantReceiptSetDigest !==
        verificationAttemptGrantReceiptSetDigest ||
      execution.verificationAttemptGrantReceiptSetDigest !==
        verificationAttemptGrantReceiptSetDigest ||
      (capabilityRuntime
        ? !sameCanonicalJson(
            capabilityRuntime.verificationAttemptGrantReceiptDigests,
            verificationAttemptGrantReceiptDigests
          ) ||
          capabilityRuntime.verificationAttemptGrantReceiptSetDigest !==
            expectedRuntimeVerificationGrantSetDigest
        : verificationGrantReceipts.length !== 0)
    ) {
      issues.push(
        issue(
          `/verificationAttemptGrantReceipts/${descriptor.attemptId}`,
          'Verification AttemptGrant receipts drifted from the exact attempt, execution, controlled-runtime leaf set, or canonical empty-set authority.'
        )
      );
    }
    if (
      capabilityReceipts.length !== 1 ||
      !capabilityReceipt ||
      !isAgentEvaluationCapabilityExecutionReceipt(capabilityReceipt) ||
      !capabilityTurn ||
      !target ||
      !resolvedCapabilityDescriptor ||
      capabilityReceipt.planDigest !== plan.planDigest ||
      capabilityReceipt.repositoryCommit !== plan.repositoryCommit ||
      capabilityReceipt.descriptorDigest !== descriptor.descriptorDigest ||
      capabilityReceipt.caseId !== descriptor.caseId ||
      capabilityReceipt.caseDigest !== concreteCase.caseDigest ||
      capabilityReceipt.targetId !== descriptor.targetId ||
      capabilityReceipt.targetDigest !== descriptor.targetDigest ||
      capabilityReceipt.capabilityProfileId !==
        concreteCase.capabilityProfileId ||
      capabilityReceipt.capabilityProfileId !== target.capabilityProfileId ||
      resolvedCapabilityDescriptor.descriptorDigest !==
        descriptor.capabilityDescriptorDigest ||
      capabilityReceipt.capabilityDescriptorDigest !==
        descriptor.capabilityDescriptorDigest ||
      capabilityReceipt.capabilityId !==
        resolvedCapabilityDescriptor.capabilityId ||
      capabilityReceipt.supportExpectation !==
        resolvedCapabilityDescriptor.supportExpectation ||
      !sameCanonicalJson(
        capabilityReceipt.expectedToolIds,
        resolvedCapabilityDescriptor.expectedToolIds
      ) ||
      !sameCanonicalJson(
        capabilityReceipt.expectedReceiptKinds,
        resolvedCapabilityDescriptor.expectedReceiptKinds
      ) ||
      capabilityReceipt.policyDigest !== plan.policyDigest ||
      capabilityReceipt.toolRegistryDigest !== plan.toolRegistryDigest ||
      Date.parse(capabilityReceipt.observedAt) <
        Date.parse(attempt.startedAt) ||
      Date.parse(capabilityReceipt.observedAt) >
        Date.parse(attempt.completedAt) ||
      (attempt.outcome === 'passed' &&
        capabilityReceipt.verdict !== 'passed') ||
      (capabilityReceipt.verdict === 'failed' &&
        attempt.outcome === 'passed') ||
      new Set(
        capabilityReceipt.specificReceiptDigests.map(
          ({ receiptDigest }) => receiptDigest
        )
      ).size !== capabilityReceipt.specificReceiptDigests.length ||
      attempt.capabilityExecutionReceiptSetDigest !== capabilitySetDigest ||
      execution.capabilityExecutionReceiptSetDigest !== capabilitySetDigest
    ) {
      issues.push(
        issue(
          `/capabilityExecutionReceipts/${descriptor.attemptId}`,
          'Capability execution authority drifted from its exact plan, attempt, turn, case, target, policy, runtime-specific facts, or execution set binding.'
        )
      );
    }
    const completed = attempt.status === 'completed';
    const completedCapabilityUnavailable =
      completed && terminal.zeroToolCallDisposition === 'grade-unavailable';
    if (
      (completed &&
        !completedCapabilityUnavailable &&
        (submissions.length !== 1 || runtimes.length !== 1)) ||
      (completedCapabilityUnavailable &&
        (submissions.length !== 0 || runtimes.length !== 0)) ||
      (!completed && (submissions.length !== 0 || runtimes.length !== 0))
    ) {
      issues.push(
        issue(
          `/resultSubmissionReceipts/${descriptor.attemptId}`,
          'Completed result attempts require exactly one submission/runtime pair; capability-unavailable completions and terminal failures forbid one.'
        )
      );
      continue;
    }
    if (!completed || completedCapabilityUnavailable) {
      if (reviewRefs.length > 0) {
        issues.push(
          issue(
            `/reviewCandidateRefs/${descriptor.attemptId}`,
            'Terminal failures and capability-unavailable completions forbid review candidates.'
          )
        );
      }
      continue;
    }
    const submission = submissions[0]!;
    const runtime = runtimes[0]!;
    if (
      !isAgentEvaluationResultSubmissionReceipt(submission) ||
      !isAgentEvaluationControlledRuntimeReceipt(runtime) ||
      terminal.resultSubmissionReceiptDigest !== submission.receiptDigest ||
      terminal.controlledRuntimeReceiptDigest !== runtime.receiptDigest ||
      submission.attemptId !== descriptor.attemptId ||
      submission.invocationId !== terminal.invocationId ||
      submission.descriptorDigest !== descriptor.descriptorDigest ||
      submission.caseId !== concreteCase.caseId ||
      submission.caseDigest !== concreteCase.caseDigest ||
      submission.caseDefinitionDigest !== concreteCase.caseDefinitionDigest ||
      runtime.planDigest !== plan.planDigest ||
      runtime.repositoryCommit !== plan.repositoryCommit ||
      runtime.attemptId !== descriptor.attemptId ||
      runtime.descriptorDigest !== descriptor.descriptorDigest ||
      runtime.caseId !== submission.caseId ||
      runtime.caseDigest !== submission.caseDigest ||
      runtime.materialDigest !== submission.materialDigest ||
      runtime.submissionReceiptDigest !== submission.receiptDigest ||
      runtime.isolatedExecution.toolCallCount !== execution.toolCalls ||
      runtime.isolatedExecution.repairRoundCount !== execution.repairRounds ||
      runtime.isolatedExecution.transactionCount !== execution.transactions ||
      runtime.artifactResolution.resolvedArtifactBytes !==
        execution.artifactBytes ||
      runtime.isolatedExecution.toolReceiptSetDigest !==
        execution.toolReceiptSetDigest ||
      runtime.isolatedExecution.transactionReceiptSetDigest !==
        execution.transactionReceiptSetDigest ||
      runtime.g3Verification.verificationClosureDigest !==
        execution.verificationClosureDigest
    ) {
      issues.push(
        issue(
          `/controlledRuntimeReceipts/${descriptor.attemptId}`,
          'Submission, controlled runtime, execution accounting, artifacts, or G3 closure authority drifted.'
        )
      );
    }
    const subjective = concreteCase.subjectiveVisualQuality;
    if (subjective !== (reviewRefs.length === 1)) {
      issues.push(
        issue(
          `/reviewCandidateRefs/${descriptor.attemptId}`,
          'Completed subjective attempts require exactly one review candidate and objective attempts forbid one.'
        )
      );
      continue;
    }
    if (!subjective) continue;
    const reference = reviewRefs[0]!;
    const preview = runtime.controlledPreview;
    let projectionAuthorityDigest: string | undefined;
    try {
      projectionAuthorityDigest =
        createAgentEvaluationBlindReviewPreviewProjection({
          runtimeReceipt: runtime,
          blindPresentationPolicyDigest:
            plan.graderPlan.randomizedPresentationPolicyDigest,
        }).authorityBinding.authorityBindingDigest;
    } catch {
      projectionAuthorityDigest = undefined;
    }
    if (
      !isAgentEvaluationReviewCandidateEvidenceRef(reference) ||
      !preview ||
      reference.planDigest !== plan.planDigest ||
      reference.repositoryCommit !== plan.repositoryCommit ||
      reference.descriptorDigest !== descriptor.descriptorDigest ||
      reference.responseDigest !== attempt.responseDigest ||
      reference.executionReceiptDigest !== execution.receiptDigest ||
      reference.graderArtifactDigest !==
        digestAgentEvaluationReviewGraderArtifactAuthority({
          attempt,
          executionReceiptDigest: execution.receiptDigest,
          controlledRuntimeReceiptDigest: runtime.receiptDigest,
          graderPlanDigest: plan.graderPlan.planDigest,
        }) ||
      reference.projectionAuthorityDigest !== projectionAuthorityDigest ||
      reference.mediaType !== preview.mediaType ||
      reference.width !== preview.width ||
      reference.height !== preview.height ||
      reference.byteLength !== preview.byteLength ||
      reference.bytesDigest !== preview.artifactDigest
    ) {
      issues.push(
        issue(
          `/reviewCandidateRefs/${descriptor.attemptId}`,
          'Review candidate drifted from controlled preview, blind projection, grading authority, or execution receipt.'
        )
      );
    }
  }

  for (const [path, count, expected] of [
    [
      '/invocationTurnSetReceipts',
      input.invocationTurnSetReceipts.length,
      input.descriptors.length,
    ],
    ['/attempts', input.attempts.length, input.descriptors.length],
    [
      '/executionReceipts',
      input.executionReceipts.length,
      input.descriptors.length,
    ],
    [
      '/capabilityExecutionReceipts',
      input.capabilityExecutionReceipts.length,
      input.descriptors.length,
    ],
  ] as const) {
    if (count !== expected) {
      issues.push(issue(path, 'Authority coverage does not match the plan.'));
    }
  }

  return Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
};
