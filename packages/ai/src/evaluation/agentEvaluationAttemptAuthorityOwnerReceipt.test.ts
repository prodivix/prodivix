import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentRetrievalQueryReceipt } from '../hosted/agentRetrieval';
import {
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
  isAgentEvaluationAttemptAuthorityOwnerReceipt,
  maximumAgentEvaluationAttemptAuthorityOwnerReceiptFamilyBytes,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import {
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  createAgentEvaluationCapabilityEffectSourceReceipt,
  createAgentEvaluationCapabilityPreEffectIntent,
  digestAgentEvaluationCapabilityEffectToolArguments,
} from './agentEvaluationCapabilityEffectAuthority';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const runtimeFactSourceAuthority =
  createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-hosted-owner-result',
    sourceAuthorityId: 'runtime-source.owner.test',
    sourceAuthorityImplementationDigest: digest(
      'runtime-source-implementation'
    ),
    routeBinding: 'runtime-fact-source.retrieval',
    capabilityProfileId: 'g4-provider-hosted-retrieval-core',
    capabilityProfileDigest: digest('profile'),
    capabilityId: 'provider.hosted-retrieval',
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.owner.test',
    modelId: 'model.owner.test',
    modelLineageDigest: digest('model-lineage'),
    adapterDigest: digest('adapter'),
    hostedRetrievalRuntimeResourceRegistrationIntentDigest: digest(
      'hosted-registration-intent'
    ),
    registrationAuthorityIssuerId: 'authority.runtime-registration',
    registrationReceiptDigest: digest('registration'),
  });
const sourceHandleDigest = digest('source-handle');
const targetRef = 'target.owner.test';
const requestRefAuthority =
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
    namespaceId: 'namespace.owner.test',
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    attemptId: 'attempt.owner.test',
    descriptorDigest: digest('descriptor'),
    turnIndex: 1,
    invocationId: 'invocation.owner.test',
    bindingKind: 'hosted-retrieval-query',
    capabilityId: 'provider.hosted-retrieval',
    toolId: 'provider.retrieval.search',
    targetRef,
    protocolFamily: 'openai-responses',
    providerConfigurationId: runtimeFactSourceAuthority.providerConfigurationId,
    modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
    adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    runtimeFactSourceAuthorityDigest:
      runtimeFactSourceAuthority.authorityDigest,
    registrationReceiptDigest:
      runtimeFactSourceAuthority.registrationReceiptDigest,
    issuedAt: '2026-08-09T02:59:58.000Z',
    expiresAt: '2026-08-09T03:02:03.000Z',
  });
const requestRef = requestRefAuthority.requestRef;
const argumentsDigest = digestAgentEvaluationCapabilityEffectToolArguments({
  requestRef,
  targetRef,
});
const inputAuthorityBinding =
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
    createAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt({
      bindingKind: 'hosted-retrieval-query',
      capabilityId: 'provider.hosted-retrieval',
      requestRef,
      targetRef,
      requestRefAuthority,
      requestRefAuthorityReceiptDigest: requestRefAuthority.receiptDigest,
      sourceAttemptId: 'attempt.owner.test',
      sourceTurnIndex: 1,
      sourceInvocationId: 'invocation.owner.test',
      sourceProviderRequestDigest: digest('provider-request'),
      sourceResponseDigest: digest('source-provider-response'),
      sourceDispatchIntentDigest: digest('source-dispatch'),
      sourceTransportReceiptDigest: digest('source-transport'),
      sourceResultSpoolReceiptDigest: digest('source-spool'),
      sourceNormalizedEventSetDigest: digest('source-normalized-events'),
      sourceObservationReceiptDigest: null,
      sourceFactKind: 'provider-event',
      sourceProviderEventType: 'tool-call',
      sourceProviderToolCallId: 'provider-tool-call.owner.test',
      sourceToolId: 'provider.retrieval.search',
      sourceArgumentsDigest: argumentsDigest,
      sourceHandleDigest,
      stateVaultSealRequest: null,
      stateVaultSealReceipt: null,
      protocolFamily: 'openai-responses',
      providerConfigurationId:
        runtimeFactSourceAuthority.providerConfigurationId,
      modelLineageDigest: runtimeFactSourceAuthority.modelLineageDigest,
      adapterDigest: runtimeFactSourceAuthority.adapterDigest,
    })
  );
const preEffectBinding = Object.freeze({
  namespaceId: 'namespace.owner.test',
  planDigest: digest('plan'),
  repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  attemptId: 'attempt.owner.test',
  descriptorDigest: digest('descriptor'),
  caseId: 'case.owner.test',
  materialDigest: digest('material'),
  turnIndex: 1,
  invocationId: 'invocation.owner.test',
  toolId: 'provider.retrieval.search',
  toolCallId: 'tool-call.owner.test',
  providerToolCallId: 'provider-tool-call.owner.test',
  providerRequestDigest: digest('provider-request'),
  argumentsDigest,
  requestedAt: '2026-08-09T03:00:00.000Z',
  inputAuthorityBinding,
  runtimeFactSourceAuthority,
  registrationReceiptDigest:
    runtimeFactSourceAuthority.registrationReceiptDigest,
});
const preEffectOwnerRequestIdentity =
  createAgentEvaluationCapabilityEffectOwnerRequestIdentity(preEffectBinding);
const preEffectIntent = createAgentEvaluationCapabilityPreEffectIntent({
  ...preEffectBinding,
  ...preEffectOwnerRequestIdentity,
});
const binding = Object.freeze({
  bindingKind: 'execute-tool' as const,
  executionAuthorityKind: 'shared-effect' as const,
  invocationId: 'invocation.owner.test',
  turnIndex: 1,
  toolId: 'provider.retrieval.search',
  toolCallId: 'tool-call.owner.test',
  providerToolCallId: 'provider-tool-call.owner.test',
  providerRequestDigest: digest('provider-request'),
  preEffectIntent,
});

const receiptFor = (
  specificReceiptDigests: readonly Readonly<{
    receiptKind: string;
    receiptDigest: string;
  }>[],
  publishEffectSourceFact = true
) => {
  const result = Object.freeze({ status: 'bounded' as const });
  const resultDigest = digestAgentCanonicalValue(result);
  const retrieval = createAgentRetrievalQueryReceipt({
    queryId: 'query.owner.test',
    toolDescriptorDigest: digest('retrieval-tool-descriptor'),
    queryDigest: digest('retrieval-query'),
    purpose: 'authorized-project-retrieval',
    networkPolicyDigest: digest('retrieval-network-policy'),
    sources: Object.freeze([]),
    indexDigest: digest('retrieval-index'),
    usageRef: 'usage.owner.test',
    startedAt: '2026-08-07T23:59:59.000Z',
    completedAt: '2026-08-08T00:00:00.000Z',
  });
  const effectSourceFact = Object.freeze({
    factKind: 'retrieval-query-receipt' as const,
    factDigest: retrieval.receiptDigest,
    value: retrieval,
  });
  const effectSourceReceipt =
    createAgentEvaluationCapabilityEffectSourceReceipt(preEffectIntent, {
      intentDigest: preEffectIntent.intentDigest,
      ownerRequestId: preEffectIntent.ownerRequestId,
      ownerRequestDigest: preEffectIntent.ownerRequestDigest,
      runtimeFactSourceAuthority,
      registrationReceiptDigest:
        runtimeFactSourceAuthority.registrationReceiptDigest,
      effectStatus: 'produced',
      businessResultDigest: resultDigest,
      providerRuntimeJournalResultRecordDigest: digest(
        'provider-runtime-result-record'
      ),
      providerRuntimeResultSealReceiptDigest: digest(
        'provider-runtime-result-seal'
      ),
      sourceFactKind: 'retrieval-query-receipt',
      sourceFactDigest: retrieval.receiptDigest,
      stageDigest: digest('stage'),
      dispatchAckDigest: digest('dispatch-ack'),
      transportReceiptDigest: digest('transport'),
      resultSpoolReceiptDigest: digest('spool'),
      normalizedEventSetDigest: digest('normalized-events'),
      stateVaultResolveRequest: null,
      stateVaultResolveReceipt: null,
      stateVaultRetireRequest: null,
      stateVaultRetirementReceipt: null,
      specificReceiptDigests: Object.freeze([]),
      sealedAt: '2026-08-08T00:00:00.000Z',
    });
  const responseProjection =
    createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      {
        executionAuthorityKind: 'shared-effect',
        outcome: 'supported',
        result,
        resultDigest,
        continuationReceiptDigest: digest('continuation'),
        effectSourceReceipt,
        effectSourceFact: publishEffectSourceFact ? effectSourceFact : null,
        specificReceipts: specificReceiptDigests,
      },
      binding
    );
  return createAgentEvaluationAttemptAuthorityOwnerReceipt({
    serviceKind: 'capability-runtime',
    operation: 'execute-tool',
    namespaceId: 'namespace.owner.test',
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    attemptId: 'attempt.owner.test',
    descriptorDigest: digest('descriptor'),
    shardLeaseOwnerId: 'lease-owner.owner.test',
    shardLeaseGeneration: 2,
    verificationGrantGeneration: 3,
    verificationAttemptGrantReceiptSetDigest: digest('grant-set'),
    requestDigest: digest('authority-request'),
    responseProjection,
    ownerImplementationDigest: digest('owner-implementation'),
    completedAt: '2026-08-08T00:00:00.000Z',
  });
};

describe('agent evaluation attempt-authority owner receipt', () => {
  it('retains a sanitized zero-specific execute response preimage', () => {
    const receipt = receiptFor([]);

    expect(isAgentEvaluationAttemptAuthorityOwnerReceipt(receipt)).toBe(true);
    expect(receipt.responseProjection).toMatchObject({
      operation: 'execute-tool',
      invocationId: binding.invocationId,
      toolCallId: binding.toolCallId,
      providerRequestDigest: binding.providerRequestDigest,
      specificReceiptDigests: [],
    });
    expect(receipt.responseDigest).toBe(
      digestAgentCanonicalValue(receipt.responseProjection)
    );
  });

  it('rejects pre-effect specific receipts before the final observation exists', () => {
    expect(() =>
      receiptFor([
        {
          receiptKind: 'retrieval-citation-receipt',
          receiptDigest: digest('citation'),
        },
      ])
    ).toThrow(/execute response authority is invalid/u);
    expect(() => receiptFor([], false)).toThrow(
      /shared-effect capability execute response authority/iu
    );
  });

  it('keeps observation-control execution independent from shared effect authority', () => {
    const result = Object.freeze({ status: 'cancelled' as const });
    const projection = createAgentEvaluationAttemptAuthorityResponseProjection(
      'capability-runtime',
      'execute-tool',
      {
        executionAuthorityKind: 'observation-control',
        outcome: 'supported',
        result,
        resultDigest: digestAgentCanonicalValue(result),
        continuationReceiptDigest: digest('control-continuation'),
        specificReceipts: Object.freeze([]),
      },
      {
        bindingKind: 'execute-tool',
        executionAuthorityKind: 'observation-control',
        invocationId: binding.invocationId,
        turnIndex: binding.turnIndex,
        toolId: 'evaluation.attempt.cancel',
        toolCallId: binding.toolCallId,
        providerToolCallId: binding.providerToolCallId,
        providerRequestDigest: binding.providerRequestDigest,
        providerCapabilityObservationReceiptDigest: digest(
          'provider-capability-observation'
        ),
      }
    );
    expect(projection).toMatchObject({
      executionAuthorityKind: 'observation-control',
      providerCapabilityObservationReceiptDigest: digest(
        'provider-capability-observation'
      ),
      specificReceiptDigests: [],
    });
    expect(() =>
      createAgentEvaluationAttemptAuthorityResponseProjection(
        'capability-runtime',
        'execute-tool',
        {
          executionAuthorityKind: 'observation-control',
          outcome: 'supported',
          result,
          resultDigest: digestAgentCanonicalValue(result),
          continuationReceiptDigest: digest('control-continuation'),
          effectSourceReceipt:
            createAgentEvaluationCapabilityEffectSourceReceipt(
              preEffectIntent,
              {
                intentDigest: preEffectIntent.intentDigest,
                ownerRequestId: preEffectIntent.ownerRequestId,
                ownerRequestDigest: preEffectIntent.ownerRequestDigest,
                runtimeFactSourceAuthority,
                registrationReceiptDigest:
                  runtimeFactSourceAuthority.registrationReceiptDigest,
                effectStatus: 'unavailable',
                businessResultDigest: digestAgentCanonicalValue(result),
                providerRuntimeJournalResultRecordDigest: digest(
                  'unavailable-provider-runtime-result-record'
                ),
                providerRuntimeResultSealReceiptDigest: digest(
                  'unavailable-provider-runtime-result-seal'
                ),
                sourceFactKind: null,
                sourceFactDigest: null,
                stageDigest: digest('control-stage'),
                dispatchAckDigest: digest('control-ack'),
                transportReceiptDigest: digest('control-transport'),
                resultSpoolReceiptDigest: digest('control-spool'),
                normalizedEventSetDigest: digest('control-events'),
                stateVaultResolveRequest: null,
                stateVaultResolveReceipt: null,
                stateVaultRetireRequest: null,
                stateVaultRetirementReceipt: null,
                specificReceiptDigests: Object.freeze([]),
                sealedAt: '2026-08-08T00:00:00.000Z',
              }
            ),
          effectSourceFact: null,
          specificReceipts: Object.freeze([]),
        },
        {
          bindingKind: 'execute-tool',
          executionAuthorityKind: 'observation-control',
          invocationId: binding.invocationId,
          turnIndex: binding.turnIndex,
          toolId: 'evaluation.attempt.cancel',
          toolCallId: binding.toolCallId,
          providerToolCallId: binding.providerToolCallId,
          providerRequestDigest: binding.providerRequestDigest,
          providerCapabilityObservationReceiptDigest: digest(
            'provider-capability-observation'
          ),
        }
      )
    ).toThrow(/observation-control capability execute response authority/iu);
  });

  it('commits a shared unavailable result without inventing a source fact', () => {
    const result = Object.freeze({ status: 'unavailable' as const });
    const resultDigest = digestAgentCanonicalValue(result);
    const effectSourceReceipt =
      createAgentEvaluationCapabilityEffectSourceReceipt(preEffectIntent, {
        intentDigest: preEffectIntent.intentDigest,
        ownerRequestId: preEffectIntent.ownerRequestId,
        ownerRequestDigest: preEffectIntent.ownerRequestDigest,
        runtimeFactSourceAuthority,
        registrationReceiptDigest:
          runtimeFactSourceAuthority.registrationReceiptDigest,
        effectStatus: 'unavailable',
        businessResultDigest: resultDigest,
        providerRuntimeJournalResultRecordDigest: digest(
          'unavailable-provider-runtime-result-record'
        ),
        providerRuntimeResultSealReceiptDigest: digest(
          'unavailable-provider-runtime-result-seal'
        ),
        sourceFactKind: null,
        sourceFactDigest: null,
        stageDigest: digest('unavailable-stage'),
        dispatchAckDigest: digest('unavailable-ack'),
        transportReceiptDigest: digest('unavailable-transport'),
        resultSpoolReceiptDigest: digest('unavailable-spool'),
        normalizedEventSetDigest: digest('unavailable-events'),
        stateVaultResolveRequest: null,
        stateVaultResolveReceipt: null,
        stateVaultRetireRequest: null,
        stateVaultRetirementReceipt: null,
        specificReceiptDigests: Object.freeze([]),
        sealedAt: '2026-08-08T00:00:00.000Z',
      });
    expect(
      createAgentEvaluationAttemptAuthorityResponseProjection(
        'capability-runtime',
        'execute-tool',
        {
          executionAuthorityKind: 'shared-effect',
          outcome: 'unsupported',
          result,
          resultDigest,
          continuationReceiptDigest: digest('unavailable-continuation'),
          effectSourceReceipt,
          effectSourceFact: null,
          specificReceipts: Object.freeze([]),
        },
        binding
      )
    ).toMatchObject({
      executionAuthorityKind: 'shared-effect',
      outcome: 'unsupported',
      effectSourceFactDigest: null,
      specificReceiptDigests: [],
    });
  });

  it('rejects a continuation projection swap without the durable owner fact', () => {
    const receipt = receiptFor([]);
    const responseProjection = {
      ...receipt.responseProjection,
      continuationReceiptDigest: digest('swapped-continuation'),
    };

    expect(
      isAgentEvaluationAttemptAuthorityOwnerReceipt({
        ...receipt,
        responseProjection,
      })
    ).toBe(false);
  });

  it('bounds the full owner family for the release denominator', () => {
    expect(
      maximumAgentEvaluationAttemptAuthorityOwnerReceiptFamilyBytes(14_040)
    ).toBe(1_380_188_160);
    expect(
      maximumAgentEvaluationAttemptAuthorityOwnerReceiptFamilyBytes(14_040)
    ).toBeLessThan(8 * 1_024 * 1_024 * 1_024);
  });
});
