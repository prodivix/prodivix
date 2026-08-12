import {
  AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_KINDS,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  createAgentEvaluationCapabilityOwnerFact,
  createAgentEvaluationCapabilitySpecificReceipt,
  createAgentEvaluationControlledRuntimeCapabilityFact,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilitySpecificAuthoritySemantic,
  digestAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationCapabilityDescriptor,
  isAgentEvaluationCapabilityEffectSourceReceipt,
  isAgentEvaluationCapabilityOwnerFact,
  isAgentEvaluationCapabilityPreEffectIntent,
  isAgentEvaluationControlledToolExecutionCapabilityFact,
  isAgentEvaluationProviderCapabilityObservationReceipt,
  isAgentEvaluationProviderCapabilityObservationReceiptSet,
  isAgentEvaluationProviderCapabilityObservedFact,
  isAgentEvaluationCapabilitySpecificReceipt,
  isAgentEvaluationControlledRuntimeReceipt,
  isAgentModelEvaluationAttemptDescriptor,
  matchAgentEvaluationControlledToolExecutionReceiptLeafSet,
  matchAgentEvaluationCapabilitySpecificProviderObservation,
  matchAgentEvaluationCapabilitySpecificOwnerAuthority,
  resolveAgentEvaluationCapabilityDescriptor,
  validateAgentModelEvaluationPlan,
  type AgentEvaluationAttemptAuthorityResponseProjection,
  type AgentEvaluationCapabilityEffectSourceReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationCapabilitySpecificReceiptKind,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationProviderCapabilitySharedObservedFact,
  type AgentJsonValue,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentEvaluationCapabilityRuntimeAssessmentInput,
  AgentEvaluationCapabilityRuntimeToolInput,
} from './capabilityRuntime';
import type { AgentEvaluationOwnerAuthorityRequest } from './productionOwnerAuthoritySidecar';

const providerCapabilityAuthorityId = 'evaluation.provider-capability.owner.v1';
const maximumSpecificReceiptCount = 2;

export const PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-production-provider-capability-owner-implementation',
    version: 3,
    evidenceSource: 'required-shared-durable-authority-observation',
    unavailableDisposition: 'sealed-owner-capability-unavailable-receipt',
  });

type ProductionCapabilityExecuteResponseBase = Readonly<{
  outcome: 'supported' | 'unsupported' | 'failed';
  result: AgentJsonValue;
  resultDigest: CanonicalDigest;
  continuationReceiptDigest: CanonicalDigest;
}>;

export type ProductionCapabilityExecuteResponse =
  | (ProductionCapabilityExecuteResponseBase &
      Readonly<{
        executionAuthorityKind: 'observation-control';
        specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
      }>)
  | (ProductionCapabilityExecuteResponseBase &
      Readonly<{
        executionAuthorityKind: 'shared-effect';
        effectSourceReceipt: AgentEvaluationCapabilityEffectSourceReceipt;
        effectSourceFact: AgentEvaluationProviderCapabilitySharedObservedFact | null;
        specificReceipts: readonly [];
      }>);

export type ProductionCapabilityAssessmentResponse = Readonly<{
  outcome: 'supported' | 'unsupported' | 'failed';
  specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
}>;

export type ProductionCapabilityAuthorityResponse =
  ProductionCapabilityExecuteResponse | ProductionCapabilityAssessmentResponse;

const fail = (code: string): never => {
  throw new TypeError(`G4_PROVIDER_CAPABILITY_AUTHORITY_INVALID: ${code}`);
};

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

const canonicalKinds = (
  kinds: readonly AgentEvaluationCapabilitySpecificReceiptKind[]
): readonly AgentEvaluationCapabilitySpecificReceiptKind[] =>
  Object.freeze([...kinds].sort(compareUnicodeCodePoints));

const validatedReceiptKinds = (
  kinds: readonly string[]
): readonly AgentEvaluationCapabilitySpecificReceiptKind[] => {
  if (
    !kinds.every((kind) =>
      AGENT_EVALUATION_CAPABILITY_SPECIFIC_RECEIPT_KINDS.includes(
        kind as AgentEvaluationCapabilitySpecificReceiptKind
      )
    )
  ) {
    return fail('capability-receipt-kind');
  }
  return kinds as readonly AgentEvaluationCapabilitySpecificReceiptKind[];
};

const routeReceiptKinds = Object.freeze(
  new Map<string, readonly AgentEvaluationCapabilitySpecificReceiptKind[]>([
    [
      'evaluation.attempt.cancel',
      canonicalKinds(['cancellation-receipt', 'late-output-fence-receipt']),
    ],
    [
      'evaluation.attempt.reconcile',
      canonicalKinds([
        'ack-reconciliation-receipt',
        'attempt-idempotency-receipt',
      ]),
    ],
    [
      'evaluation.callback.inspect',
      canonicalKinds([
        'late-callback-rejection-receipt',
        'lease-fence-receipt',
      ]),
    ],
    [
      'evaluation.checkpoint.resume',
      canonicalKinds([
        'attempt-idempotency-receipt',
        'checkpoint-resume-receipt',
      ]),
    ],
    [
      'evaluation.timeout.inspect',
      canonicalKinds(['conservative-usage-receipt', 'timeout-receipt']),
    ],
    [
      'provider.background-job.poll',
      canonicalKinds(['background-job-receipt', 'reconciliation-receipt']),
    ],
    [
      'provider.cache.inspect',
      canonicalKinds(['cache-lineage-receipt', 'usage-receipt']),
    ],
    [
      'provider.continuation.resume',
      canonicalKinds(['continuation-receipt', 'state-fence-receipt']),
    ],
    [
      'provider.retrieval.search',
      canonicalKinds([
        'retrieval-citation-receipt',
        'source-freshness-receipt',
      ]),
    ],
    [
      'provider.usage.reconcile',
      canonicalKinds([
        'budget-reservation-receipt',
        'usage-reconciliation-receipt',
      ]),
    ],
  ])
);

const assertToolArguments = (value: unknown): void => {
  if (
    !exactRecord(value, ['requestRef', 'targetRef']) ||
    !isAgentControlIdentity(value.requestRef) ||
    !isAgentControlIdentity(value.targetRef)
  ) {
    return fail('tool-arguments');
  }
};

const exactToolObservation = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): boolean => {
  if (input.executionAuthorityKind !== 'observation-control') return false;
  const observation = input.providerCapabilityObservationReceipt;
  return (
    isAgentEvaluationProviderCapabilityObservationReceipt(observation) &&
    observation.planDigest === input.planDigest &&
    observation.repositoryCommit === input.repositoryCommit &&
    observation.attemptId === input.attemptId &&
    observation.descriptorDigest === input.descriptorDigest &&
    observation.turnIndex === input.turnIndex &&
    observation.invocationId === input.invocationId &&
    observation.requestDigest === input.requestDigest
  );
};

const exactToolPreEffectIntent = (
  input: AgentEvaluationCapabilityRuntimeToolInput
): boolean => {
  if (input.executionAuthorityKind !== 'shared-effect') return false;
  const intent = input.preEffectIntent;
  return (
    isAgentEvaluationCapabilityPreEffectIntent(intent) &&
    intent.namespaceId === input.namespaceId &&
    intent.planDigest === input.planDigest &&
    intent.repositoryCommit === input.repositoryCommit &&
    intent.attemptId === input.attemptId &&
    intent.descriptorDigest === input.descriptorDigest &&
    intent.caseId === input.caseId &&
    intent.materialDigest === input.materialDigest &&
    intent.turnIndex === input.turnIndex &&
    intent.invocationId === input.invocationId &&
    intent.toolId === input.toolId &&
    intent.toolCallId === input.toolCallId &&
    intent.providerToolCallId === input.providerToolCallId &&
    intent.providerRequestDigest === input.requestDigest &&
    intent.argumentsDigest === input.argumentsDigest
  );
};

export const assertProductionCapabilityExecuteInput = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationCapabilityRuntimeToolInput => {
  const value = request.payload as AgentEvaluationCapabilityRuntimeToolInput;
  if (
    request.serviceKind !== 'provider-capability' ||
    request.operation !== 'tool.execute' ||
    !isPlainObject(value) ||
    value.namespaceId !== request.namespaceId ||
    value.planDigest !== request.planDigest ||
    value.repositoryCommit !== request.repositoryCommit ||
    value.attemptId !== request.attemptId ||
    value.descriptorDigest !== request.descriptorDigest ||
    value.shardLeaseOwnerId !== request.shardLeaseOwnerId ||
    value.shardLeaseGeneration !== request.shardLeaseGeneration ||
    value.verificationGrantGeneration !== request.verificationGrantGeneration ||
    value.verificationAttemptGrantReceiptSetDigest !==
      request.verificationAttemptGrantReceiptSetDigest ||
    !isAgentEvaluationCapabilityDescriptor(value.capabilityDescriptor) ||
    !value.capabilityDescriptor.expectedToolIds.includes(value.toolId) ||
    !isAgentControlIdentity(value.caseId) ||
    !isAgentCanonicalDigest(value.caseDigest) ||
    !isAgentCanonicalDigest(value.materialDigest) ||
    !isAgentCanonicalDigest(value.loopPolicyDigest) ||
    !Number.isSafeInteger(value.turnIndex) ||
    value.turnIndex < 0 ||
    value.turnIndex > 64 ||
    !isAgentControlIdentity(value.invocationId) ||
    !isAgentControlIdentity(value.toolCallId) ||
    !isAgentControlIdentity(value.providerToolCallId) ||
    !isAgentControlIdentity(value.toolId) ||
    !isAgentCanonicalDigest(value.argumentsDigest) ||
    value.argumentsDigest !== digestAgentCanonicalValue(value.arguments) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !['shared-effect', 'observation-control'].includes(
      String(value.executionAuthorityKind)
    ) ||
    (value.executionAuthorityKind === 'observation-control'
      ? !exactToolObservation(value) ||
        request.providerCapabilityObservationReceiptSetDigest !==
          digestAgentEvaluationProviderCapabilityObservationReceiptSet([
            value.providerCapabilityObservationReceipt,
          ])
      : !isAgentControlIdentity(value.budgetReservationId) ||
        !exactToolPreEffectIntent(value) ||
        request.providerCapabilityObservationReceiptSetDigest !==
          digestAgentEvaluationProviderCapabilityObservationReceiptSet([])) ||
    !Number.isSafeInteger(value.maximumToolResultBytes) ||
    value.maximumToolResultBytes < 256 ||
    value.maximumToolResultBytes > 16_777_216
  ) {
    return fail('execute-binding');
  }
  assertToolArguments(value.arguments);
  return value;
};

export const assertProductionCapabilityAssessmentInput = (
  request: AgentEvaluationOwnerAuthorityRequest
): AgentEvaluationCapabilityRuntimeAssessmentInput => {
  const input =
    request.payload as AgentEvaluationCapabilityRuntimeAssessmentInput;
  if (
    request.serviceKind !== 'provider-capability' ||
    request.operation !== 'capability.assess' ||
    !isPlainObject(input) ||
    input.namespaceId !== request.namespaceId ||
    input.plan?.planDigest !== request.planDigest ||
    input.plan?.repositoryCommit !== request.repositoryCommit ||
    input.descriptor?.attemptId !== request.attemptId ||
    input.descriptor?.descriptorDigest !== request.descriptorDigest ||
    input.shardLeaseOwnerId !== request.shardLeaseOwnerId ||
    input.shardLeaseGeneration !== request.shardLeaseGeneration ||
    input.verificationGrantGeneration !== request.verificationGrantGeneration ||
    input.verificationAttemptGrantReceiptSetDigest !==
      request.verificationAttemptGrantReceiptSetDigest ||
    validateAgentModelEvaluationPlan(input.plan).length > 0 ||
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.planDigest !== input.plan.planDigest ||
    !isAgentEvaluationCapabilityDescriptor(input.capabilityDescriptor) ||
    input.descriptor.capabilityDescriptorDigest !==
      input.capabilityDescriptor.descriptorDigest ||
    !isPlainObject(input.material) ||
    input.material.caseId !== input.descriptor.caseId ||
    input.material.materialDigest !==
      digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(input.material).filter(
            ([key]) => key !== 'materialDigest'
          )
        )
      ) ||
    !Number.isSafeInteger(input.terminalTurnIndex) ||
    input.terminalTurnIndex < 0 ||
    input.terminalTurnIndex > 64 ||
    !isAgentControlIdentity(input.terminalInvocationId) ||
    !isAgentControlInstant(input.observedAt) ||
    !Array.isArray(input.capabilityToolExecutions) ||
    input.capabilityToolExecutions.length > 4 ||
    !Array.isArray(input.controlledToolExecutionReceipts) ||
    input.controlledToolExecutionReceipts.length > 4 ||
    !isAgentEvaluationProviderCapabilityObservationReceiptSet(
      input.providerCapabilityObservationReceipts,
      {
        planDigest: input.plan.planDigest,
        repositoryCommit: input.plan.repositoryCommit,
        attemptId: input.descriptor.attemptId,
        descriptorDigest: input.descriptor.descriptorDigest,
        maximumTurnCount: input.terminalTurnIndex + 1,
      }
    ) ||
    request.providerCapabilityObservationReceiptSetDigest !==
      digestAgentEvaluationProviderCapabilityObservationReceiptSet(
        input.providerCapabilityObservationReceipts
      ) ||
    (input.controlledRuntimeReceipt !== undefined &&
      !isAgentEvaluationControlledRuntimeReceipt(
        input.controlledRuntimeReceipt
      ))
  ) {
    return fail('assessment-binding');
  }
  const concreteCase = input.plan.concreteCases.find(
    ({ caseId }) => caseId === input.descriptor.caseId
  );
  const target = input.plan.capabilityQualificationTargets.find(
    ({ targetId }) => targetId === input.descriptor.targetId
  );
  let resolvedCapabilityDescriptor:
    typeof input.capabilityDescriptor | undefined;
  try {
    resolvedCapabilityDescriptor =
      concreteCase && target
        ? resolveAgentEvaluationCapabilityDescriptor(concreteCase, target)
        : undefined;
  } catch {
    resolvedCapabilityDescriptor = undefined;
  }
  if (
    !concreteCase ||
    !target ||
    !resolvedCapabilityDescriptor ||
    concreteCase.caseDigest !== input.material.caseDigest ||
    input.material.capabilityDescriptorDigest !==
      concreteCase.capabilityDescriptor.descriptorDigest ||
    !sameCanonicalJson(resolvedCapabilityDescriptor, input.capabilityDescriptor)
  ) {
    return fail('assessment-plan-capability');
  }
  return input;
};

const canonicalSpecificReceipts = (
  values: readonly AgentEvaluationCapabilitySpecificReceipt[]
): readonly AgentEvaluationCapabilitySpecificReceipt[] =>
  Object.freeze(
    [...values].sort((left, right) =>
      compareUnicodeCodePoints(
        `${left.receiptKind}\u0000${left.receiptDigest}`,
        `${right.receiptKind}\u0000${right.receiptDigest}`
      )
    )
  );

const providerObservationForSpecific = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  observations: readonly AgentEvaluationProviderCapabilityObservationReceipt[]
): AgentEvaluationProviderCapabilityObservationReceipt | undefined =>
  receipt.providerCapabilityObservationReceiptDigest === undefined
    ? undefined
    : observations.find(
        ({ receiptDigest }) =>
          receiptDigest === receipt.providerCapabilityObservationReceiptDigest
      );

const specificMatchesProviderObservation = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  observations: readonly AgentEvaluationProviderCapabilityObservationReceipt[]
): boolean => {
  if (receipt.providerCapabilityObservationReceiptDigest === undefined) {
    return true;
  }
  const observation = providerObservationForSpecific(receipt, observations);
  return Boolean(
    observation &&
    matchAgentEvaluationCapabilitySpecificProviderObservation(
      receipt,
      observation
    )
  );
};

const assertOwnerFactBinding = (
  receipt: AgentEvaluationCapabilitySpecificReceipt,
  request: AgentEvaluationOwnerAuthorityRequest
): void => {
  if (
    receipt.authority.authorityKind !== 'terminal-normalization' &&
    receipt.authority.authorityKind !== 'recovery-authority' &&
    receipt.authority.authorityKind !== 'capability-denial'
  ) {
    return;
  }
  const fact = receipt.authority.fact;
  if (
    !isAgentEvaluationCapabilityOwnerFact(fact) ||
    fact.authorityId !== providerCapabilityAuthorityId ||
    fact.authorityImplementationDigest !==
      PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST ||
    fact.authorityResultDigest !== receipt.resultDigest
  ) {
    return fail('owner-fact-binding');
  }
  if (fact.authorityRequestDigest === request.requestDigest) return;
  if (request.operation !== 'capability.assess') {
    return fail('owner-fact-request-binding');
  }
  const input = assertProductionCapabilityAssessmentInput(request);
  if (
    !input.capabilityToolExecutions.some(
      ({ output }) =>
        output.specificReceipts.some(
          ({ receiptDigest }) => receiptDigest === receipt.receiptDigest
        ) &&
        matchAgentEvaluationCapabilitySpecificOwnerAuthority(
          receipt,
          output.authorityReceipt
        )
    )
  ) {
    return fail('owner-fact-request-binding');
  }
};

const fixedExecuteResult = (
  input: AgentEvaluationCapabilityRuntimeToolInput,
  outcome: ProductionCapabilityExecuteResponse['outcome'],
  receiptKinds: readonly AgentEvaluationCapabilitySpecificReceiptKind[]
): AgentJsonValue =>
  Object.freeze({
    status: outcome,
    toolId: input.toolId,
    requestDigest: input.requestDigest,
    receiptKinds: canonicalKinds(receiptKinds),
  });

const continuationDigest = (
  input: AgentEvaluationCapabilityRuntimeToolInput,
  resultDigest: CanonicalDigest,
  specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-provider-tool-continuation',
    version: 1,
    requestDigest: input.requestDigest,
    resultDigest,
    specificReceiptDigests: specificReceipts.map(
      ({ receiptDigest }) => receiptDigest
    ),
  });

export const createUnavailableProductionCapabilityResponse = (
  request: AgentEvaluationOwnerAuthorityRequest
): ProductionCapabilityAuthorityResponse => {
  if (request.operation === 'tool.execute') {
    const input = assertProductionCapabilityExecuteInput(request);
    if (input.executionAuthorityKind === 'shared-effect') {
      return fail('shared-effect-owner-unavailable');
    }
    const result = fixedExecuteResult(input, 'failed', Object.freeze([]));
    const resultDigest = digestAgentCanonicalValue(result);
    return Object.freeze({
      executionAuthorityKind: input.executionAuthorityKind,
      outcome: 'failed' as const,
      result,
      resultDigest,
      continuationReceiptDigest: continuationDigest(
        input,
        resultDigest,
        Object.freeze([])
      ),
      specificReceipts: Object.freeze([]),
    });
  }
  const input = assertProductionCapabilityAssessmentInput(request);
  if (input.capabilityDescriptor.supportExpectation === 'expected-blocked') {
    const terminalObservations =
      input.providerCapabilityObservationReceipts.filter(
        (observation) =>
          observation.turnIndex === input.terminalTurnIndex &&
          observation.invocationId === input.terminalInvocationId
      );
    if (terminalObservations.length !== 1) {
      return Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
    }
    const terminalObservation = terminalObservations[0]!;
    const expectedKinds = canonicalKinds(
      validatedReceiptKinds(input.capabilityDescriptor.expectedReceiptKinds)
    );
    if (
      !expectedKinds.every((kind) =>
        [
          'authority-denial-receipt',
          'capability-unavailable-receipt',
          'verification-closure-receipt',
        ].includes(kind)
      ) ||
      expectedKinds.filter(
        (kind) =>
          kind === 'authority-denial-receipt' ||
          kind === 'capability-unavailable-receipt'
      ).length !== 1
    ) {
      return Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
    }
    const denialKind = expectedKinds.find(
      (
        kind
      ): kind is
        'authority-denial-receipt' | 'capability-unavailable-receipt' =>
        kind === 'authority-denial-receipt' ||
        kind === 'capability-unavailable-receipt'
    )!;
    const resultDigest = terminalObservation.responseDigest;
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'capability-denial',
      category: denialKind,
      authorityId: providerCapabilityAuthorityId,
      authorityImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
      authorityRequestDigest: request.requestDigest,
      authorityResultDigest: resultDigest,
      policyDigest: input.plan.policyDigest,
      reasonCode:
        denialKind === 'authority-denial-receipt'
          ? 'capability-policy-rejected'
          : 'native-observation-unavailable',
      decisionDigest: resultDigest,
      observedAt: terminalObservation.observedAt,
    });
    const authorityBase = Object.freeze({
      authorityKind: 'capability-denial' as const,
      receiptKind: denialKind,
      factDigest: fact.factDigest,
    });
    const denialReceipt = createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: `specific.denial.${denialKind}.${input.descriptor.samplingIdentityDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
      receiptKind: denialKind,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      caseId: input.material.caseId,
      materialDigest: input.material.materialDigest,
      capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
      turnIndex: terminalObservation.turnIndex,
      invocationId: terminalObservation.invocationId,
      providerCapabilityObservationReceiptDigest:
        terminalObservation.receiptDigest,
      requestDigest: terminalObservation.requestDigest,
      resultDigest,
      startedAt: terminalObservation.observedAt,
      completedAt: terminalObservation.observedAt,
      authority: Object.freeze({
        ...authorityBase,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic(
            authorityBase
          ),
        fact,
      }),
    });
    if (
      !matchAgentEvaluationCapabilitySpecificProviderObservation(
        denialReceipt,
        terminalObservation
      )
    ) {
      return Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
    }
    const receipts: AgentEvaluationCapabilitySpecificReceipt[] = [
      denialReceipt,
    ];
    if (expectedKinds.includes('verification-closure-receipt')) {
      const runtimeReceipt = input.controlledRuntimeReceipt;
      if (!runtimeReceipt) {
        return Object.freeze({
          outcome: 'failed' as const,
          specificReceipts: Object.freeze([]),
        });
      }
      const runtimeFact =
        createAgentEvaluationControlledRuntimeCapabilityFact(runtimeReceipt);
      if (
        runtimeFact.planDigest !== input.plan.planDigest ||
        runtimeFact.repositoryCommit !== input.plan.repositoryCommit ||
        runtimeFact.attemptId !== input.descriptor.attemptId ||
        runtimeFact.descriptorDigest !== input.descriptor.descriptorDigest ||
        runtimeFact.caseId !== input.material.caseId ||
        runtimeFact.materialDigest !== input.material.materialDigest ||
        runtimeFact.verificationVerdict !== 'passed'
      ) {
        return Object.freeze({
          outcome: 'failed' as const,
          specificReceipts: Object.freeze([]),
        });
      }
      const runtimeAuthority = Object.freeze({
        authorityKind: 'controlled-runtime' as const,
        receiptKind: 'verification-closure-receipt' as const,
        factDigest: runtimeFact.factDigest,
      });
      receipts.push(
        createAgentEvaluationCapabilitySpecificReceipt({
          receiptId: `specific.verification-closure.${runtimeFact.factDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
          receiptKind: 'verification-closure-receipt',
          planDigest: input.plan.planDigest,
          repositoryCommit: input.plan.repositoryCommit,
          attemptId: input.descriptor.attemptId,
          descriptorDigest: input.descriptor.descriptorDigest,
          caseId: input.material.caseId,
          materialDigest: input.material.materialDigest,
          capabilityDescriptorDigest:
            input.capabilityDescriptor.descriptorDigest,
          turnIndex: terminalObservation.turnIndex,
          invocationId: terminalObservation.invocationId,
          requestDigest: terminalObservation.requestDigest,
          resultDigest: runtimeFact.verificationClosureDigest,
          startedAt: terminalObservation.observedAt,
          completedAt: terminalObservation.observedAt,
          authority: Object.freeze({
            ...runtimeAuthority,
            semanticDigest:
              digestAgentEvaluationCapabilitySpecificAuthoritySemantic(
                runtimeAuthority
              ),
            fact: runtimeFact,
          }),
        })
      );
    }
    return Object.freeze({
      outcome: 'unsupported' as const,
      specificReceipts: canonicalSpecificReceipts(receipts),
    });
  }
  return Object.freeze({
    outcome: 'failed' as const,
    specificReceipts: Object.freeze([]),
  });
};

const validateExecuteResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: unknown
): ProductionCapabilityExecuteResponse => {
  const input = assertProductionCapabilityExecuteInput(request);
  if (
    !isPlainObject(response) ||
    response.executionAuthorityKind !== input.executionAuthorityKind ||
    !['supported', 'unsupported', 'failed'].includes(
      response.outcome as string
    ) ||
    !isAgentCanonicalDigest(response.resultDigest) ||
    !isAgentCanonicalDigest(response.continuationReceiptDigest) ||
    !Array.isArray(response.specificReceipts) ||
    response.specificReceipts.length > maximumSpecificReceiptCount
  ) {
    return fail('execute-response-shape');
  }
  const outcome =
    response.outcome as ProductionCapabilityExecuteResponse['outcome'];
  if (input.executionAuthorityKind === 'shared-effect') {
    if (
      !exactRecord(response, [
        'executionAuthorityKind',
        'outcome',
        'result',
        'resultDigest',
        'continuationReceiptDigest',
        'effectSourceReceipt',
        'effectSourceFact',
        'specificReceipts',
      ]) ||
      response.executionAuthorityKind !== 'shared-effect' ||
      response.specificReceipts.length !== 0 ||
      !isAgentEvaluationCapabilityEffectSourceReceipt(
        response.effectSourceReceipt,
        input.preEffectIntent
      ) ||
      response.effectSourceReceipt.businessResultDigest !==
        response.resultDigest ||
      response.continuationReceiptDigest !==
        continuationDigest(input, response.resultDigest, Object.freeze([])) ||
      new TextEncoder().encode(canonicalJsonText(response.result)).byteLength >
        input.maximumToolResultBytes ||
      (response.effectSourceReceipt.effectStatus === 'produced'
        ? outcome !== 'supported' ||
          !isAgentEvaluationProviderCapabilityObservedFact(
            response.effectSourceFact
          ) ||
          response.effectSourceFact.factKind === 'provider-event' ||
          response.effectSourceFact.factKind === 'usage-vector' ||
          response.effectSourceFact.factKind !==
            response.effectSourceReceipt.sourceFactKind ||
          response.effectSourceFact.factDigest !==
            response.effectSourceReceipt.sourceFactDigest
        : response.effectSourceFact !== null ||
          (response.effectSourceReceipt.effectStatus === 'unavailable'
            ? outcome !== 'unsupported'
            : outcome !== 'failed'))
    ) {
      return fail('shared-effect-response-binding');
    }
    const validated = Object.freeze({
      executionAuthorityKind: response.executionAuthorityKind,
      outcome,
      result: response.result as AgentJsonValue,
      resultDigest: response.resultDigest,
      continuationReceiptDigest: response.continuationReceiptDigest,
      effectSourceReceipt: response.effectSourceReceipt,
      effectSourceFact:
        response.effectSourceFact as AgentEvaluationProviderCapabilitySharedObservedFact | null,
      specificReceipts: Object.freeze([]) as readonly [],
    });
    createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      validated,
      {
        bindingKind: 'execute-tool',
        executionAuthorityKind: input.executionAuthorityKind,
        invocationId: input.invocationId,
        turnIndex: input.turnIndex,
        toolId: input.toolId,
        toolCallId: input.toolCallId,
        providerToolCallId: input.providerToolCallId,
        providerRequestDigest: input.requestDigest,
        preEffectIntent: input.preEffectIntent,
      }
    );
    return validated;
  }
  if (
    !exactRecord(response, [
      'executionAuthorityKind',
      'outcome',
      'result',
      'resultDigest',
      'continuationReceiptDigest',
      'specificReceipts',
    ]) ||
    response.executionAuthorityKind !== 'observation-control'
  ) {
    return fail('observation-control-response-shape');
  }
  const specificReceipts = canonicalSpecificReceipts(
    response.specificReceipts as AgentEvaluationCapabilitySpecificReceipt[]
  );
  const receiptKinds = specificReceipts.map(({ receiptKind }) => receiptKind);
  const expectedRouteKinds = routeReceiptKinds.get(input.toolId);
  const descriptorKinds = canonicalKinds(
    validatedReceiptKinds(input.capabilityDescriptor.expectedReceiptKinds)
  );
  if (
    new Set(receiptKinds).size !== receiptKinds.length ||
    specificReceipts.some(
      (receipt) =>
        !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
        receipt.planDigest !== input.planDigest ||
        receipt.repositoryCommit !== input.repositoryCommit ||
        receipt.attemptId !== input.attemptId ||
        receipt.descriptorDigest !== input.descriptorDigest ||
        receipt.caseId !== input.caseId ||
        receipt.materialDigest !== input.materialDigest ||
        receipt.capabilityDescriptorDigest !==
          input.capabilityDescriptor.descriptorDigest ||
        receipt.turnIndex !== input.turnIndex ||
        receipt.invocationId !== input.invocationId ||
        receipt.toolId !== input.toolId ||
        receipt.toolCallId !== input.toolCallId ||
        receipt.providerToolCallId !== input.providerToolCallId ||
        receipt.requestDigest !== input.requestDigest ||
        receipt.resultDigest !== response.resultDigest ||
        !specificMatchesProviderObservation(receipt, [
          input.providerCapabilityObservationReceipt,
        ])
    ) ||
    (outcome === 'supported'
      ? !expectedRouteKinds ||
        !sameCanonicalJson(expectedRouteKinds, descriptorKinds) ||
        !sameCanonicalJson(receiptKinds, descriptorKinds)
      : specificReceipts.length !== 0)
  ) {
    return fail('execute-authority-observation');
  }
  for (const receipt of specificReceipts) {
    assertOwnerFactBinding(receipt, request);
  }
  const expectedResult = fixedExecuteResult(input, outcome, receiptKinds);
  if (
    !sameCanonicalJson(response.result, expectedResult) ||
    response.resultDigest !== digestAgentCanonicalValue(expectedResult) ||
    response.continuationReceiptDigest !==
      continuationDigest(input, response.resultDigest, specificReceipts) ||
    new TextEncoder().encode(canonicalJsonText(expectedResult)).byteLength >
      input.maximumToolResultBytes
  ) {
    return fail('execute-result-binding');
  }
  const validated = Object.freeze({
    executionAuthorityKind: input.executionAuthorityKind,
    outcome,
    result: expectedResult,
    resultDigest: response.resultDigest,
    continuationReceiptDigest: response.continuationReceiptDigest,
    specificReceipts,
  });
  createAgentEvaluationAttemptAuthorityResponseProjection(
    'capability-runtime',
    'execute-tool',
    validated,
    {
      bindingKind: 'execute-tool',
      executionAuthorityKind: input.executionAuthorityKind,
      invocationId: input.invocationId,
      turnIndex: input.turnIndex,
      toolId: input.toolId,
      toolCallId: input.toolCallId,
      providerToolCallId: input.providerToolCallId,
      providerRequestDigest: input.requestDigest,
      providerCapabilityObservationReceiptDigest:
        input.providerCapabilityObservationReceipt.receiptDigest,
    }
  );
  return validated;
};

const observedToolIds = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): readonly string[] =>
  Object.freeze(
    [
      ...new Set([
        ...input.capabilityToolExecutions.map(({ input: tool }) => tool.toolId),
        ...input.controlledToolExecutionReceipts.map(({ toolId }) => toolId),
      ]),
    ].sort(compareUnicodeCodePoints)
  );

type ProviderObservationFact =
  AgentEvaluationProviderCapabilityObservationReceipt['facts'][number];

type ProviderObservationFactBinding = Readonly<{
  observation: AgentEvaluationProviderCapabilityObservationReceipt;
  fact: ProviderObservationFact;
}>;

const factSupportsReceiptKind = (
  fact: ProviderObservationFact,
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind
): boolean => {
  if (receiptKind === 'background-job-receipt') {
    return fact.factKind === 'provider-job-receipt';
  }
  if (receiptKind === 'cache-lineage-receipt') {
    return fact.factKind === 'provider-cache-receipt';
  }
  if (receiptKind === 'continuation-receipt') {
    return fact.factKind === 'opaque-continuation';
  }
  if (
    receiptKind === 'usage-receipt' ||
    receiptKind === 'conservative-usage-receipt' ||
    receiptKind === 'usage-reconciliation-receipt'
  ) {
    if (fact.factKind !== 'usage-vector') return false;
    if (receiptKind === 'usage-receipt') {
      return fact.value.amounts.every(
        ({ confidence, sourceDigest }) =>
          (confidence === 'reported' || confidence === 'measured') &&
          sourceDigest === undefined
      );
    }
    if (receiptKind === 'conservative-usage-receipt') {
      return fact.value.amounts.every(
        ({ confidence, sourceDigest }) =>
          (confidence === 'estimated' || confidence === 'unknown') &&
          sourceDigest === undefined
      );
    }
    return fact.value.amounts.every(
      ({ sourceDigest }) => sourceDigest !== undefined
    );
  }
  if (
    receiptKind === 'retrieval-citation-receipt' ||
    receiptKind === 'source-freshness-receipt'
  ) {
    if (fact.factKind !== 'retrieval-query-receipt') return false;
    return receiptKind === 'retrieval-citation-receipt'
      ? fact.value.sourceResultRefs.length > 0
      : fact.value.retrievalConfigurationDigest !== undefined;
  }
  return false;
};

const providerFactBindingsForReceiptKind = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput,
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind
): readonly ProviderObservationFactBinding[] =>
  Object.freeze(
    input.providerCapabilityObservationReceipts.flatMap((observation) =>
      observation.facts
        .filter((fact) => factSupportsReceiptKind(fact, receiptKind))
        .map((fact) => Object.freeze({ observation, fact }))
    )
  );

type ParallelControlledEvidence = Readonly<{
  observation: AgentEvaluationProviderCapabilityObservationReceipt;
  join: Readonly<{
    groupId: string;
    planDigest: CanonicalDigest;
    generation: number;
    joinedCallIds: readonly string[];
    controlledToolExecutionReceiptDigests: readonly CanonicalDigest[];
    cancelledCallIds: readonly string[];
    lateCallIds: readonly string[];
    status: 'joined';
    resultDigest: CanonicalDigest;
    receiptDigest: CanonicalDigest;
  }>;
  representative: AgentEvaluationCapabilityRuntimeAssessmentInput['controlledToolExecutionReceipts'][number];
}>;

const parallelControlledEvidenceFor = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): ParallelControlledEvidence | undefined => {
  if (input.capabilityDescriptor.capabilityId !== 'provider.parallel-tool') {
    return undefined;
  }
  const concreteCase = input.plan.concreteCases.find(
    ({ caseId }) => caseId === input.descriptor.caseId
  );
  const expectedToolIds = concreteCase
    ? [...concreteCase.capabilityDescriptor.expectedToolIds].sort(
        compareUnicodeCodePoints
      )
    : [];
  const relevant = input.controlledToolExecutionReceipts
    .filter(({ toolId }) => expectedToolIds.includes(toolId))
    .sort((left, right) =>
      compareUnicodeCodePoints(left.toolCallId, right.toolCallId)
    );
  if (
    expectedToolIds.length < 2 ||
    relevant.length !== expectedToolIds.length ||
    new Set(relevant.map(({ toolId }) => toolId)).size !==
      expectedToolIds.length ||
    new Set(relevant.map(({ toolCallId }) => toolCallId)).size !==
      relevant.length ||
    relevant.some(
      (receipt) =>
        !isAgentEvaluationControlledToolExecutionCapabilityFact(receipt) ||
        receipt.planDigest !== input.plan.planDigest ||
        receipt.attemptId !== input.descriptor.attemptId ||
        receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
        receipt.caseId !== input.material.caseId ||
        receipt.materialDigest !== input.material.materialDigest ||
        receipt.status !== 'succeeded' ||
        receipt.turnIndex !== relevant[0]!.turnIndex ||
        receipt.generation !== relevant[0]!.generation
    )
  ) {
    return undefined;
  }
  const observation = input.providerCapabilityObservationReceipts.find(
    ({ turnIndex }) => turnIndex === relevant[0]!.turnIndex
  );
  if (!observation) return undefined;
  const joinedCallIds = Object.freeze(
    relevant.map(({ toolCallId }) => toolCallId).sort(compareUnicodeCodePoints)
  );
  const controlledToolExecutionReceiptDigests = Object.freeze(
    relevant
      .map(({ receiptDigest }) => receiptDigest)
      .sort(compareUnicodeCodePoints)
  );
  if (
    new Set(controlledToolExecutionReceiptDigests).size !==
    controlledToolExecutionReceiptDigests.length
  ) {
    return undefined;
  }
  const planDigest = digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-parallel-controlled-tool-plan',
    version: 1,
    descriptorDigest: input.descriptor.descriptorDigest,
    baseCapabilityDescriptorDigest:
      concreteCase!.capabilityDescriptor.descriptorDigest,
    generation: relevant[0]!.generation,
    controlledToolExecutionReceiptDigests,
  });
  const resultDigest = digestAgentCanonicalValue({
    joinedCallResults: relevant.map(({ toolCallId, resultDigest: digest }) => ({
      toolCallId,
      resultDigest: digest,
    })),
  });
  const joinBase = Object.freeze({
    groupId: `parallel.controlled.${planDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
    planDigest,
    generation: relevant[0]!.generation,
    joinedCallIds,
    controlledToolExecutionReceiptDigests,
    cancelledCallIds: Object.freeze([]),
    lateCallIds: Object.freeze([]),
    status: 'joined' as const,
    resultDigest,
  });
  const join = Object.freeze({
    ...joinBase,
    receiptDigest: digestAgentCanonicalValue(joinBase),
  });
  const runtimeToolExecutionReceiptSetDigest =
    input.controlledRuntimeReceipt?.toolExecutionReceiptSetDigest ??
    digestAgentCanonicalValue({
      toolReceiptDigests: controlledToolExecutionReceiptDigests,
    });
  if (
    !matchAgentEvaluationControlledToolExecutionReceiptLeafSet({
      parallelJoinFacts: [join],
      controlledToolExecutionReceiptDigests: [relevant[0]!.receiptDigest],
      runtimeToolExecutionReceiptSetDigest,
    })
  ) {
    return undefined;
  }
  return Object.freeze({ observation, join, representative: relevant[0]! });
};

const capabilitySupportWasObserved = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput
): boolean => {
  const expectedFactKind =
    input.capabilityDescriptor.capabilityId === 'provider.background-job'
      ? 'provider-job-receipt'
      : input.capabilityDescriptor.capabilityId === 'provider.hosted-retrieval'
        ? 'retrieval-query-receipt'
        : input.capabilityDescriptor.capabilityId === 'provider.isolated-cache'
          ? 'provider-cache-receipt'
          : input.capabilityDescriptor.capabilityId ===
              'provider.reasoning-continuation'
            ? 'opaque-continuation'
            : undefined;
  return (
    (expectedFactKind !== undefined &&
      input.providerCapabilityObservationReceipts.some((observation) =>
        observation.facts.some(({ factKind }) => factKind === expectedFactKind)
      )) ||
    (input.capabilityDescriptor.capabilityId === 'provider.parallel-tool' &&
      parallelControlledEvidenceFor(input) !== undefined)
  );
};

const createObservedAssessmentSpecificReceipt = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput,
  receiptKind: AgentEvaluationCapabilitySpecificReceiptKind,
  binding: ProviderObservationFactBinding
): AgentEvaluationCapabilitySpecificReceipt => {
  const { observation, fact } = binding;
  const common = Object.freeze({
    receiptId: `specific.observed.${receiptKind}.${fact.factDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
    receiptKind,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    caseId: input.material.caseId,
    materialDigest: input.material.materialDigest,
    capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    turnIndex: observation.turnIndex,
    invocationId: observation.invocationId,
    providerCapabilityObservationReceiptDigest: observation.receiptDigest,
    requestDigest: observation.requestDigest,
    resultDigest: observation.responseDigest,
  });
  const create = (
    authority: AgentEvaluationCapabilitySpecificReceipt['authority'],
    startedAt = observation.observedAt,
    completedAt = observation.observedAt
  ): AgentEvaluationCapabilitySpecificReceipt =>
    createAgentEvaluationCapabilitySpecificReceipt({
      ...common,
      startedAt,
      completedAt,
      authority,
    });
  switch (fact.factKind) {
    case 'provider-job-receipt': {
      const semantic = Object.freeze({
        authorityKind: 'provider-job' as const,
        receiptKind,
        factDigest: fact.factDigest,
      });
      return create(
        Object.freeze({
          ...semantic,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
          fact: fact.value,
        })
      );
    }
    case 'provider-cache-receipt': {
      const semantic = Object.freeze({
        authorityKind: 'provider-cache' as const,
        receiptKind,
        factDigest: fact.factDigest,
      });
      return create(
        Object.freeze({
          ...semantic,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
          fact: fact.value,
        })
      );
    }
    case 'opaque-continuation': {
      const semantic = Object.freeze({
        authorityKind: 'opaque-continuation' as const,
        receiptKind,
        factDigest: fact.factDigest,
      });
      return create(
        Object.freeze({
          ...semantic,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
          fact: fact.value,
        })
      );
    }
    case 'retrieval-query-receipt': {
      const semantic = Object.freeze({
        authorityKind: 'retrieval-query' as const,
        receiptKind,
        factDigest: fact.factDigest,
      });
      return create(
        Object.freeze({
          ...semantic,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
          fact: fact.value,
        }),
        fact.value.startedAt,
        fact.value.completedAt
      );
    }
    case 'usage-vector': {
      const semantic = Object.freeze({
        authorityKind: 'usage-vector' as const,
        receiptKind,
        factDigest: fact.factDigest,
      });
      return create(
        Object.freeze({
          ...semantic,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
          fact: fact.value,
        })
      );
    }
    case 'provider-event':
      return fail('provider-event-specific-receipt');
  }
};

const createAssessmentRecoverySpecificReceipt = (
  request: AgentEvaluationOwnerAuthorityRequest,
  input: AgentEvaluationCapabilityRuntimeAssessmentInput,
  receiptKind: 'reconciliation-receipt' | 'state-fence-receipt',
  binding: ProviderObservationFactBinding
): AgentEvaluationCapabilitySpecificReceipt => {
  const { observation } = binding;
  const resultDigest = observation.responseDigest;
  const fact =
    receiptKind === 'reconciliation-receipt'
      ? createAgentEvaluationCapabilityOwnerFact({
          authorityKind: 'recovery-authority',
          category: receiptKind,
          authorityId: providerCapabilityAuthorityId,
          authorityImplementationDigest:
            PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
          authorityRequestDigest: request.requestDigest,
          authorityResultDigest: resultDigest,
          idempotencyKey: `capability.reconcile.${observation.receiptDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
          replayDisposition: 'reconciled',
          observedAt: observation.observedAt,
        })
      : createAgentEvaluationCapabilityOwnerFact({
          authorityKind: 'recovery-authority',
          category: receiptKind,
          authorityId: providerCapabilityAuthorityId,
          authorityImplementationDigest:
            PRODUCTION_AGENT_EVALUATION_PROVIDER_CAPABILITY_IMPLEMENTATION_DIGEST,
          authorityRequestDigest: request.requestDigest,
          authorityResultDigest: resultDigest,
          shardLeaseOwnerId: input.shardLeaseOwnerId,
          shardLeaseGeneration: input.shardLeaseGeneration,
          dispatchState: 'dispatched',
          authorityInstant: observation.observedAt,
          fenceDigest: digestAgentCanonicalValue({
            providerCapabilityObservationReceiptDigest:
              observation.receiptDigest,
            shardLeaseOwnerId: input.shardLeaseOwnerId,
            shardLeaseGeneration: input.shardLeaseGeneration,
          }),
          fenceOutcome: 'fenced',
          observedAt: observation.observedAt,
        });
  const semantic = Object.freeze({
    authorityKind: 'recovery-authority' as const,
    receiptKind,
    factDigest: fact.factDigest,
  });
  return createAgentEvaluationCapabilitySpecificReceipt({
    receiptId: `specific.owner.${receiptKind}.${observation.receiptDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
    receiptKind,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    caseId: input.material.caseId,
    materialDigest: input.material.materialDigest,
    capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    turnIndex: observation.turnIndex,
    invocationId: observation.invocationId,
    requestDigest: observation.requestDigest,
    resultDigest,
    startedAt: observation.observedAt,
    completedAt: observation.observedAt,
    authority: Object.freeze({
      ...semantic,
      semanticDigest:
        digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
      fact,
    }),
  });
};

const createParallelAssessmentSpecificReceipt = (
  input: AgentEvaluationCapabilityRuntimeAssessmentInput,
  receiptKind: 'parallel-call-set-receipt' | 'tool-execution-receipt',
  evidence: ParallelControlledEvidence
): AgentEvaluationCapabilitySpecificReceipt => {
  const { observation, join, representative } = evidence;
  if (receiptKind === 'parallel-call-set-receipt') {
    const semantic = Object.freeze({
      authorityKind: 'parallel-tool-join' as const,
      receiptKind,
      factDigest: join.receiptDigest,
    });
    return createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: `specific.parallel.join.${join.receiptDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
      receiptKind,
      planDigest: input.plan.planDigest,
      repositoryCommit: input.plan.repositoryCommit,
      attemptId: input.descriptor.attemptId,
      descriptorDigest: input.descriptor.descriptorDigest,
      caseId: input.material.caseId,
      materialDigest: input.material.materialDigest,
      capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
      turnIndex: observation.turnIndex,
      invocationId: observation.invocationId,
      requestDigest: observation.requestDigest,
      resultDigest: join.resultDigest,
      startedAt: observation.observedAt,
      completedAt: observation.observedAt,
      authority: Object.freeze({
        ...semantic,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
        fact: join,
      }),
    });
  }
  const semantic = Object.freeze({
    authorityKind: 'controlled-tool-execution' as const,
    receiptKind,
    factDigest: representative.receiptDigest,
  });
  return createAgentEvaluationCapabilitySpecificReceipt({
    receiptId: `specific.parallel.tool.${representative.receiptDigest.slice('sha256-'.length, 'sha256-'.length + 24)}`,
    receiptKind,
    planDigest: input.plan.planDigest,
    repositoryCommit: input.plan.repositoryCommit,
    attemptId: input.descriptor.attemptId,
    descriptorDigest: input.descriptor.descriptorDigest,
    caseId: input.material.caseId,
    materialDigest: input.material.materialDigest,
    capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    turnIndex: representative.turnIndex,
    invocationId: observation.invocationId,
    toolId: representative.toolId,
    toolCallId: representative.toolCallId,
    requestDigest: observation.requestDigest,
    resultDigest: representative.resultDigest,
    startedAt: observation.observedAt,
    completedAt: observation.observedAt,
    authority: Object.freeze({
      ...semantic,
      semanticDigest:
        digestAgentEvaluationCapabilitySpecificAuthoritySemantic(semantic),
      fact: representative,
    }),
  });
};

const createSealedProductionCapabilityAssessmentResponse = (
  request: AgentEvaluationOwnerAuthorityRequest
): ProductionCapabilityAssessmentResponse => {
  const input = assertProductionCapabilityAssessmentInput(request);
  if (input.capabilityDescriptor.supportExpectation === 'expected-blocked') {
    return capabilitySupportWasObserved(input)
      ? Object.freeze({
          outcome: 'failed' as const,
          specificReceipts: Object.freeze([]),
        })
      : (createUnavailableProductionCapabilityResponse(
          request
        ) as ProductionCapabilityAssessmentResponse);
  }
  if (
    !sameCanonicalJson(
      observedToolIds(input),
      Object.freeze(
        [...input.capabilityDescriptor.expectedToolIds].sort(
          compareUnicodeCodePoints
        )
      )
    )
  ) {
    return Object.freeze({
      outcome: 'failed' as const,
      specificReceipts: Object.freeze([]),
    });
  }
  const specifics: AgentEvaluationCapabilitySpecificReceipt[] = [];
  const parallelEvidence = parallelControlledEvidenceFor(input);
  for (const receiptKind of canonicalKinds(
    validatedReceiptKinds(input.capabilityDescriptor.expectedReceiptKinds)
  )) {
    const exactToolSpecifics = input.capabilityToolExecutions.flatMap(
      ({ output }) =>
        output.specificReceipts.filter(
          (specific) => specific.receiptKind === receiptKind
        )
    );
    if (exactToolSpecifics.length > 1) {
      return Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
    }
    if (exactToolSpecifics.length === 1) {
      specifics.push(exactToolSpecifics[0]!);
      continue;
    }
    if (
      parallelEvidence &&
      (receiptKind === 'parallel-call-set-receipt' ||
        receiptKind === 'tool-execution-receipt')
    ) {
      specifics.push(
        createParallelAssessmentSpecificReceipt(
          input,
          receiptKind,
          parallelEvidence
        )
      );
      continue;
    }
    let bindings = providerFactBindingsForReceiptKind(input, receiptKind);
    if (receiptKind === 'reconciliation-receipt') {
      bindings = providerFactBindingsForReceiptKind(
        input,
        'background-job-receipt'
      );
    } else if (receiptKind === 'state-fence-receipt') {
      bindings = providerFactBindingsForReceiptKind(
        input,
        'continuation-receipt'
      );
    }
    if (bindings.length !== 1) {
      return Object.freeze({
        outcome: 'failed' as const,
        specificReceipts: Object.freeze([]),
      });
    }
    specifics.push(
      receiptKind === 'reconciliation-receipt' ||
        receiptKind === 'state-fence-receipt'
        ? createAssessmentRecoverySpecificReceipt(
            request,
            input,
            receiptKind,
            bindings[0]!
          )
        : createObservedAssessmentSpecificReceipt(
            input,
            receiptKind,
            bindings[0]!
          )
    );
  }
  return Object.freeze({
    outcome: 'supported' as const,
    specificReceipts: canonicalSpecificReceipts(specifics),
  });
};

const validateAssessmentResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: unknown
): ProductionCapabilityAssessmentResponse => {
  const input = assertProductionCapabilityAssessmentInput(request);
  if (
    !exactRecord(response, ['outcome', 'specificReceipts']) ||
    !['supported', 'unsupported', 'failed'].includes(
      response.outcome as string
    ) ||
    !Array.isArray(response.specificReceipts) ||
    response.specificReceipts.length > maximumSpecificReceiptCount
  ) {
    return fail('assessment-response-shape');
  }
  const outcome =
    response.outcome as ProductionCapabilityAssessmentResponse['outcome'];
  const specificReceipts = canonicalSpecificReceipts(
    response.specificReceipts as AgentEvaluationCapabilitySpecificReceipt[]
  );
  const expectedKinds = canonicalKinds(
    validatedReceiptKinds(input.capabilityDescriptor.expectedReceiptKinds)
  );
  const receiptKinds = specificReceipts.map(({ receiptKind }) => receiptKind);
  const expectedTools = Object.freeze(
    [...input.capabilityDescriptor.expectedToolIds].sort(
      compareUnicodeCodePoints
    )
  );
  if (
    new Set(receiptKinds).size !== receiptKinds.length ||
    specificReceipts.some(
      (receipt) =>
        !isAgentEvaluationCapabilitySpecificReceipt(receipt) ||
        receipt.planDigest !== input.plan.planDigest ||
        receipt.repositoryCommit !== input.plan.repositoryCommit ||
        receipt.attemptId !== input.descriptor.attemptId ||
        receipt.descriptorDigest !== input.descriptor.descriptorDigest ||
        receipt.caseId !== input.material.caseId ||
        receipt.materialDigest !== input.material.materialDigest ||
        receipt.capabilityDescriptorDigest !==
          input.capabilityDescriptor.descriptorDigest ||
        receipt.turnIndex > input.terminalTurnIndex ||
        !specificMatchesProviderObservation(
          receipt,
          input.providerCapabilityObservationReceipts
        )
    ) ||
    (outcome === 'supported'
      ? !sameCanonicalJson(receiptKinds, expectedKinds) ||
        !sameCanonicalJson(observedToolIds(input), expectedTools)
      : outcome === 'unsupported'
        ? input.capabilityDescriptor.supportExpectation !==
            'expected-blocked' ||
          !sameCanonicalJson(receiptKinds, expectedKinds)
        : specificReceipts.length !== 0)
  ) {
    return fail('assessment-authority-observation');
  }
  for (const receipt of specificReceipts) {
    assertOwnerFactBinding(receipt, request);
  }
  const validated = Object.freeze({ outcome, specificReceipts });
  createAgentEvaluationAttemptAuthorityResponseProjection(
    'capability-runtime',
    'assess-capability',
    validated,
    {
      bindingKind: 'assess-capability',
      terminalTurnIndex: input.terminalTurnIndex,
      terminalInvocationId: input.terminalInvocationId,
      materialDigest: input.material.materialDigest,
      capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    }
  );
  return validated;
};

export const validateProductionCapabilityAuthorityResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: unknown
): ProductionCapabilityAuthorityResponse =>
  request.operation === 'tool.execute'
    ? validateExecuteResponse(request, response)
    : validateAssessmentResponse(request, response);

export const projectProductionCapabilityAuthorityResponse = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: ProductionCapabilityAuthorityResponse
): AgentEvaluationAttemptAuthorityResponseProjection => {
  const validated = validateProductionCapabilityAuthorityResponse(
    request,
    response
  );
  if (request.operation === 'tool.execute') {
    const input = assertProductionCapabilityExecuteInput(request);
    return createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      validated,
      input.executionAuthorityKind === 'shared-effect'
        ? {
            bindingKind: 'execute-tool',
            executionAuthorityKind: input.executionAuthorityKind,
            invocationId: input.invocationId,
            turnIndex: input.turnIndex,
            toolId: input.toolId,
            toolCallId: input.toolCallId,
            providerToolCallId: input.providerToolCallId,
            providerRequestDigest: input.requestDigest,
            preEffectIntent: input.preEffectIntent,
          }
        : {
            bindingKind: 'execute-tool',
            executionAuthorityKind: input.executionAuthorityKind,
            invocationId: input.invocationId,
            turnIndex: input.turnIndex,
            toolId: input.toolId,
            toolCallId: input.toolCallId,
            providerToolCallId: input.providerToolCallId,
            providerRequestDigest: input.requestDigest,
            providerCapabilityObservationReceiptDigest:
              input.providerCapabilityObservationReceipt.receiptDigest,
          }
    );
  }
  const input = assertProductionCapabilityAssessmentInput(request);
  return createAgentEvaluationAttemptAuthorityResponseProjection(
    'capability-runtime',
    'assess-capability',
    validated,
    {
      bindingKind: 'assess-capability',
      terminalTurnIndex: input.terminalTurnIndex,
      terminalInvocationId: input.terminalInvocationId,
      materialDigest: input.material.materialDigest,
      capabilityDescriptorDigest: input.capabilityDescriptor.descriptorDigest,
    }
  );
};

export const reconstructProductionCapabilityAuthorityResponse = (
  projection: Extract<
    AgentEvaluationAttemptAuthorityResponseProjection,
    { serviceKind: 'capability-runtime' }
  >,
  specificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[]
): ProductionCapabilityAuthorityResponse => {
  if (
    projection.operation === 'execute-tool' &&
    projection.executionAuthorityKind === 'shared-effect'
  ) {
    return fail('shared-effect-response-requires-sealed-source-replay');
  }
  const canonical = canonicalSpecificReceipts(specificReceipts);
  if (
    !sameCanonicalJson(
      canonical.map(({ receiptKind, receiptDigest }) => ({
        receiptKind,
        receiptDigest,
      })),
      projection.specificReceiptDigests
    )
  ) {
    return fail('persisted-specific-receipt-set');
  }
  if (projection.operation === 'assess-capability') {
    return Object.freeze({
      outcome: projection.outcome,
      specificReceipts: canonical,
    });
  }
  const result = Object.freeze({
    status: projection.outcome,
    toolId: projection.toolId,
    requestDigest: projection.providerRequestDigest,
    receiptKinds: canonicalKinds(
      canonical.map(({ receiptKind }) => receiptKind)
    ),
  });
  if (digestAgentCanonicalValue(result) !== projection.resultDigest) {
    return fail('persisted-execute-result-digest');
  }
  return Object.freeze({
    executionAuthorityKind: 'observation-control' as const,
    outcome: projection.outcome,
    result,
    resultDigest: projection.resultDigest,
    continuationReceiptDigest: projection.continuationReceiptDigest,
    specificReceipts: canonical,
  });
};

export type ProductionCapabilityAuthorityObservation = Readonly<{
  sourceAuthorityId: string;
  sourceImplementationDigest: CanonicalDigest;
  sourceDurability: 'shared-durable';
  authorityRequestDigest: CanonicalDigest;
  sourceStageReceiptDigest: CanonicalDigest;
  response: ProductionCapabilityAuthorityResponse;
  observedAt: Instant;
  observationDigest: CanonicalDigest;
}>;

/**
 * Required real authority dependency for supported capability evidence. Its
 * stage and reconcile operations are request-digest keyed in shared durable
 * storage; resolve may perform the single staged effect, while reconcile may
 * only recover an already-authoritative observation.
 */
export interface ProductionCapabilityAuthorityObservationSource {
  readonly sourceAuthorityId: string;
  readonly sourceImplementationDigest: CanonicalDigest;
  readonly sourceDurability: 'shared-durable';
  stage(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<CanonicalDigest>;
  resolve(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<ProductionCapabilityAuthorityObservation | undefined>;
  reconcile(
    request: AgentEvaluationOwnerAuthorityRequest
  ): Promise<ProductionCapabilityAuthorityObservation | undefined>;
  close(): Promise<
    Readonly<{
      status: 'clean';
      residualResourceIds: readonly [];
      residualCanaryIds: readonly [];
    }>
  >;
}

export const PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_AUTHORITY_ID =
  'evaluation.provider-capability.sealed-observation.v1' as const;
export const PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_IMPLEMENTATION_DIGEST =
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-sealed-capability-observation-source-implementation',
    version: 2,
    authority: 'backend-sealed-owner-request',
    durability: 'shared-durable',
    localState: 'none',
    projection: 'exact-native-facts-or-observed-unavailable',
  });

const sealedObservationSourceStageDigest = (
  request: AgentEvaluationOwnerAuthorityRequest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format:
      'prodivix.agent-evaluation-sealed-capability-observation-source-stage',
    version: 1,
    sourceAuthorityId:
      PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_AUTHORITY_ID,
    sourceImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_IMPLEMENTATION_DIGEST,
    authorityRequestDigest: request.requestDigest,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest,
  });

const reconstructSealedCapabilityObservation = (
  request: AgentEvaluationOwnerAuthorityRequest
): ProductionCapabilityAuthorityObservation => {
  const executeInput =
    request.operation === 'tool.execute'
      ? assertProductionCapabilityExecuteInput(request)
      : undefined;
  if (executeInput?.executionAuthorityKind === 'shared-effect') {
    return fail('sealed-observation-source-has-no-shared-effect-authority');
  }
  const observedAt = executeInput
    ? executeInput.providerCapabilityObservationReceipt.observedAt
    : assertProductionCapabilityAssessmentInput(request).observedAt;
  const response =
    request.operation === 'capability.assess'
      ? createSealedProductionCapabilityAssessmentResponse(request)
      : createUnavailableProductionCapabilityResponse(request);
  const base = Object.freeze({
    sourceAuthorityId:
      PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_AUTHORITY_ID,
    sourceImplementationDigest:
      PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_IMPLEMENTATION_DIGEST,
    sourceDurability: 'shared-durable' as const,
    authorityRequestDigest: request.requestDigest,
    sourceStageReceiptDigest: sealedObservationSourceStageDigest(request),
    response,
    observedAt,
  });
  return Object.freeze({
    ...base,
    observationDigest: digestAgentCanonicalValue(base),
  });
};

/**
 * Reconstructs the provider-capability authority exclusively from the exact
 * Backend-sealed request payload. The request already carries the canonical
 * observation-set commitment, so this source needs no host-local journal and
 * can reconcile the same observation after a cross-host ACK loss.
 */
export const createSealedProductionCapabilityAuthorityObservationSource =
  (): ProductionCapabilityAuthorityObservationSource =>
    Object.freeze({
      sourceAuthorityId:
        PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_AUTHORITY_ID,
      sourceImplementationDigest:
        PRODUCTION_AGENT_EVALUATION_SEALED_CAPABILITY_OBSERVATION_SOURCE_IMPLEMENTATION_DIGEST,
      sourceDurability: 'shared-durable' as const,
      async stage(request: AgentEvaluationOwnerAuthorityRequest) {
        if (request.serviceKind !== 'provider-capability') {
          return fail('sealed-source-service');
        }
        if (request.operation === 'tool.execute') {
          const input = assertProductionCapabilityExecuteInput(request);
          if (input.executionAuthorityKind === 'shared-effect') {
            return fail('sealed-source-shared-effect-unavailable');
          }
        } else {
          assertProductionCapabilityAssessmentInput(request);
        }
        return sealedObservationSourceStageDigest(request);
      },
      async resolve(request: AgentEvaluationOwnerAuthorityRequest) {
        return reconstructSealedCapabilityObservation(request);
      },
      async reconcile(request: AgentEvaluationOwnerAuthorityRequest) {
        return reconstructSealedCapabilityObservation(request);
      },
      async close() {
        return Object.freeze({
          status: 'clean' as const,
          residualResourceIds: Object.freeze([]) as readonly [],
          residualCanaryIds: Object.freeze([]) as readonly [],
        });
      },
    });

export const validateProductionCapabilityAuthorityObservation = (
  request: AgentEvaluationOwnerAuthorityRequest,
  value: unknown,
  expectedSourceStageReceiptDigest?: CanonicalDigest
): ProductionCapabilityAuthorityObservation => {
  if (
    !exactRecord(value, [
      'sourceAuthorityId',
      'sourceImplementationDigest',
      'sourceDurability',
      'authorityRequestDigest',
      'sourceStageReceiptDigest',
      'response',
      'observedAt',
      'observationDigest',
    ]) ||
    !isAgentControlIdentity(value.sourceAuthorityId) ||
    !isAgentCanonicalDigest(value.sourceImplementationDigest) ||
    value.sourceDurability !== 'shared-durable' ||
    value.authorityRequestDigest !== request.requestDigest ||
    !isAgentCanonicalDigest(value.sourceStageReceiptDigest) ||
    (expectedSourceStageReceiptDigest !== undefined &&
      value.sourceStageReceiptDigest !== expectedSourceStageReceiptDigest) ||
    !isAgentControlInstant(value.observedAt) ||
    !isAgentCanonicalDigest(value.observationDigest) ||
    value.observationDigest !==
      digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(value).filter(([key]) => key !== 'observationDigest')
        )
      )
  ) {
    return fail('observation-source');
  }
  return Object.freeze({
    sourceAuthorityId: value.sourceAuthorityId,
    sourceImplementationDigest: value.sourceImplementationDigest,
    sourceDurability: 'shared-durable',
    authorityRequestDigest: request.requestDigest,
    sourceStageReceiptDigest: value.sourceStageReceiptDigest,
    response: validateProductionCapabilityAuthorityResponse(
      request,
      value.response
    ),
    observedAt: value.observedAt,
    observationDigest: value.observationDigest,
  });
};
