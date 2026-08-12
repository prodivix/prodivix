import { describe, expect, it } from 'vitest';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentEvaluationControlledToolExecutionOutput } from './agentEvaluationControlledRuntime';
import {
  isAgentEvaluationParallelToolJoinCapabilityFact,
  type AgentEvaluationParallelToolJoinCapabilityFact,
} from './agentEvaluationCapabilitySpecificAuthorityValidation';
import { matchAgentEvaluationControlledToolExecutionReceiptLeafSet } from './agentEvaluationCapabilitySpecificEvidenceValidation';
import {
  capabilitySpecificReceiptDigest,
  createAgentEvaluationCapabilityOwnerFact,
  createAgentEvaluationCapabilitySpecificReceipt,
  digestAgentEvaluationCapabilitySpecificReceiptSet,
  digestAgentEvaluationCapabilitySpecificAuthoritySemantic,
  hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity,
  isAgentEvaluationCapabilityOwnerFact,
  isAgentEvaluationCapabilitySpecificReceipt,
  maximumAgentEvaluationCapabilitySpecificReceiptFamilyBytes,
} from './agentEvaluationCapabilitySpecificReceipt';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const base = Object.freeze({
  receiptId: 'capability-specific.test',
  planDigest: digest('plan'),
  repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  attemptId: 'attempt.capability-specific.test',
  descriptorDigest: digest('descriptor'),
  caseId: 'case.capability-specific.test',
  materialDigest: digest('material'),
  capabilityDescriptorDigest: digest('capability-descriptor'),
  turnIndex: 1,
  invocationId: 'invocation.capability-specific.test',
  toolId: 'evaluation.attempt.reconcile',
  toolCallId: 'tool-call.capability-specific.test',
  providerToolCallId: 'provider-tool-call.capability-specific.test',
  requestDigest: digest('request'),
  resultDigest: digest('result'),
  startedAt: '2026-08-08T00:00:00.000Z',
  completedAt: '2026-08-08T00:00:01.000Z',
});

const recomputeReceiptKind = (
  receipt: ReturnType<typeof createAgentEvaluationCapabilitySpecificReceipt>,
  receiptKind: Parameters<
    typeof digestAgentEvaluationCapabilitySpecificAuthoritySemantic
  >[0]['receiptKind']
) => {
  const authority = {
    ...receipt.authority,
    receiptKind,
    semanticDigest: digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
      authorityKind: receipt.authority.authorityKind,
      receiptKind,
      factDigest: receipt.authority.factDigest,
    }),
  };
  const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
  const relabelledBase = { ...receiptBase, receiptKind, authority };
  return {
    ...relabelledBase,
    receiptDigest: digestAgentCanonicalValue(relabelledBase),
  };
};

describe('agent evaluation capability-specific receipts', () => {
  it('creates a bounded recovery authority and exact digest projection', () => {
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'recovery-authority',
      category: 'ack-reconciliation-receipt',
      authorityId: 'authority.capability-recovery',
      authorityImplementationDigest: digest('authority-implementation'),
      idempotencyKey: 'idempotency.capability-recovery',
      authorityRequestDigest: digest('reconciliation-request'),
      authorityResultDigest: base.resultDigest,
      replayDisposition: 'exact-replay',
      observedAt: base.completedAt,
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      ...base,
      receiptKind: 'ack-reconciliation-receipt',
      authority: Object.freeze({
        authorityKind: 'recovery-authority' as const,
        receiptKind: 'ack-reconciliation-receipt' as const,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'recovery-authority',
            receiptKind: 'ack-reconciliation-receipt',
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });

    expect(isAgentEvaluationCapabilitySpecificReceipt(receipt)).toBe(true);

    expect(capabilitySpecificReceiptDigest(receipt)).toEqual({
      receiptKind: receipt.receiptKind,
      receiptDigest: receipt.receiptDigest,
    });
    expect(digestAgentEvaluationCapabilitySpecificReceiptSet([receipt])).toBe(
      digestAgentCanonicalValue({ receiptDigests: [receipt.receiptDigest] })
    );
  });

  it('accepts a complete existing usage owner fact', () => {
    const usage = createAgentUsageVector([
      {
        unit: 'text-token-input',
        logicalAmount: '3',
        billableAmount: '3',
        confidence: 'reported',
      },
    ]);
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      ...base,
      receiptId: 'capability-specific.usage.test',
      receiptKind: 'usage-receipt',
      providerCapabilityObservationReceiptDigest: digest(
        'provider-capability-observation.usage'
      ),
      authority: Object.freeze({
        authorityKind: 'usage-vector' as const,
        receiptKind: 'usage-receipt' as const,
        factDigest: usage.vectorDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'usage-vector',
            receiptKind: 'usage-receipt',
            factDigest: usage.vectorDigest,
          }),
        fact: usage,
      }),
    });

    expect(isAgentEvaluationCapabilitySpecificReceipt(receipt)).toBe(true);

    const {
      providerCapabilityObservationReceiptDigest:
        _providerCapabilityObservationReceiptDigest,
      receiptDigest: _missingObservationReceiptDigest,
      ...missingObservationBase
    } = receipt;
    expect(
      isAgentEvaluationCapabilitySpecificReceipt({
        ...missingObservationBase,
        receiptDigest: digestAgentCanonicalValue(missingObservationBase),
      })
    ).toBe(false);

    const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
    const relabelledBase = {
      ...receiptBase,
      receiptKind: 'conservative-usage-receipt',
    } as const;
    const relabelled = {
      ...relabelledBase,
      receiptDigest: digestAgentCanonicalValue(relabelledBase),
    };
    expect(isAgentEvaluationCapabilitySpecificReceipt(relabelled)).toBe(false);
    expect(
      isAgentEvaluationCapabilitySpecificReceipt(
        recomputeReceiptKind(receipt, 'conservative-usage-receipt')
      )
    ).toBe(false);
    expect(
      isAgentEvaluationCapabilitySpecificReceipt(
        recomputeReceiptKind(receipt, 'usage-reconciliation-receipt')
      )
    ).toBe(false);
  });

  it('rejects a fully recomputed retrieval sibling relabel', () => {
    const retrievalFactBase = Object.freeze({
      queryId: 'retrieval-query.capability-specific.test',
      toolDescriptorDigest: digest('retrieval-tool'),
      queryDigest: digest('retrieval-query'),
      purpose: 'public-research' as const,
      networkPolicyDigest: digest('network-policy'),
      sourceResultRefs: Object.freeze(['source.result.test']),
      sourceResultDigests: Object.freeze([digest('source-result')]),
      usageRef: 'usage.retrieval.test',
      startedAt: base.startedAt,
      completedAt: base.completedAt,
    });
    const retrievalFact = Object.freeze({
      ...retrievalFactBase,
      receiptDigest: digestAgentCanonicalValue(retrievalFactBase),
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      ...base,
      receiptId: 'capability-specific.retrieval.test',
      receiptKind: 'retrieval-citation-receipt',
      providerCapabilityObservationReceiptDigest: digest(
        'provider-capability-observation.retrieval'
      ),
      authority: Object.freeze({
        authorityKind: 'retrieval-query' as const,
        receiptKind: 'retrieval-citation-receipt' as const,
        factDigest: retrievalFact.receiptDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'retrieval-query',
            receiptKind: 'retrieval-citation-receipt',
            factDigest: retrievalFact.receiptDigest,
          }),
        fact: retrievalFact,
      }),
    });

    expect(
      isAgentEvaluationCapabilitySpecificReceipt(
        recomputeReceiptKind(receipt, 'source-freshness-receipt')
      )
    ).toBe(false);
  });

  it('uses exact owner denial when a native optional fact is unavailable', () => {
    const providerCapabilityObservationReceiptDigest = digest(
      'provider-capability-observation.unavailable'
    );
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'capability-denial',
      category: 'capability-unavailable-receipt',
      authorityId: 'authority.capability-unavailable',
      authorityImplementationDigest: digest('unavailable-implementation'),
      policyDigest: digest('unavailable-policy'),
      authorityRequestDigest: digest('unavailable-request'),
      authorityResultDigest: base.resultDigest,
      reasonCode: 'native-observation-unavailable',
      decisionDigest: base.resultDigest,
      observedAt: base.completedAt,
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      ...base,
      receiptId: 'capability-specific.unavailable.test',
      receiptKind: 'capability-unavailable-receipt',
      providerCapabilityObservationReceiptDigest,
      authority: Object.freeze({
        authorityKind: 'capability-denial' as const,
        receiptKind: 'capability-unavailable-receipt' as const,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'capability-denial',
            receiptKind: 'capability-unavailable-receipt',
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });

    expect(isAgentEvaluationCapabilitySpecificReceipt(receipt)).toBe(true);
    expect(receipt.providerCapabilityObservationReceiptDigest).toBe(
      providerCapabilityObservationReceiptDigest
    );
    const {
      providerCapabilityObservationReceiptDigest:
        _providerCapabilityObservationReceiptDigest,
      receiptDigest: _receiptDigest,
      ...missingObservationBase
    } = receipt;
    expect(
      isAgentEvaluationCapabilitySpecificReceipt({
        ...missingObservationBase,
        receiptDigest: digestAgentCanonicalValue(missingObservationBase),
      })
    ).toBe(false);
  });

  it('rejects an owner fact reused under a different receipt kind', () => {
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'capability-denial',
      category: 'authority-denial-receipt',
      authorityId: 'authority.capability-denial',
      authorityImplementationDigest: digest('denial-implementation'),
      policyDigest: digest('denial-policy'),
      authorityRequestDigest: digest('denial-request'),
      authorityResultDigest: base.resultDigest,
      reasonCode: 'capability-policy-rejected',
      decisionDigest: base.resultDigest,
      observedAt: base.completedAt,
    });

    expect(() =>
      createAgentEvaluationCapabilitySpecificReceipt({
        ...base,
        receiptKind: 'timeout-receipt',
        authority: Object.freeze({
          authorityKind: 'capability-denial' as const,
          receiptKind: 'authority-denial-receipt' as const,
          factDigest: fact.factDigest,
          semanticDigest:
            digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
              authorityKind: 'capability-denial',
              receiptKind: 'authority-denial-receipt',
              factDigest: fact.factDigest,
            }),
          fact,
        }),
      })
    ).toThrowError('Evaluation capability-specific receipt is invalid.');
  });

  it('rejects a fabricated self-digested authority object', () => {
    const baseFact = {
      format: 'prodivix.agent-evaluation-capability-owner-fact',
      version: 1,
      authorityKind: 'recovery-authority',
      category: 'checkpoint-resume-receipt',
      authorityId: 'authority.checkpoint',
      authorityImplementationDigest: digest('checkpoint-implementation'),
      observedAt: base.completedAt,
      findingDigest: digest('opaque-finding'),
    } as const;
    const fabricated = {
      ...baseFact,
      factDigest: digestAgentCanonicalValue(baseFact),
    };

    expect(isAgentEvaluationCapabilityOwnerFact(fabricated)).toBe(false);
  });

  it('rejects semantic swapping between recovery mechanisms', () => {
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'recovery-authority',
      category: 'attempt-idempotency-receipt',
      authorityId: 'authority.idempotency',
      authorityImplementationDigest: digest('idempotency-implementation'),
      idempotencyKey: 'idempotency.attempt',
      authorityRequestDigest: digest('idempotency-request'),
      authorityResultDigest: digest('idempotency-result'),
      replayDisposition: 'first-applied',
      observedAt: base.completedAt,
    });
    const { factDigest: _factDigest, ...factBase } = fact;
    const swappedBase = {
      ...factBase,
      category: 'reconciliation-receipt',
    } as const;
    const swapped = {
      ...swappedBase,
      factDigest: digestAgentCanonicalValue(swappedBase),
    };

    expect(isAgentEvaluationCapabilityOwnerFact(swapped)).toBe(false);
  });

  it('binds a parallel join to the complete two-tool controlled receipt leaf set', () => {
    const createControlledToolReceipt = (suffix: 'a' | 'b') => {
      const argumentsValue = { operation: `parallel-${suffix}` } as const;
      return createAgentEvaluationControlledToolExecutionOutput(
        {
          planDigest: base.planDigest,
          attemptId: base.attemptId,
          descriptorDigest: base.descriptorDigest,
          caseId: base.caseId,
          materialDigest: base.materialDigest,
          loopPolicyDigest: digest('parallel-loop-policy'),
          turnIndex: base.turnIndex,
          toolCallId: `tool-call.parallel.${suffix}`,
          toolId: `workspace.parallel.${suffix}`,
          arguments: argumentsValue,
          argumentsDigest: digestAgentCanonicalValue(argumentsValue),
          maximumToolResultBytes: 4_096,
        },
        {
          grantDigest: digest('parallel-grant'),
          toolRegistryDigest: digest('parallel-tool-registry'),
          toolDefinitionDigest: digest(`parallel-tool-definition-${suffix}`),
          inputSchemaDigest: digest(`parallel-input-schema-${suffix}`),
          generation: 1,
          idempotencyKey: `idempotency.parallel.${suffix}`,
          operationIntentDigest: digest(`parallel-operation-intent-${suffix}`),
          status: 'succeeded',
          result: { completed: suffix },
          persistedArtifacts: [],
          commandReceiptDigests: [],
          transactionReceiptDigests: [],
        }
      ).receipt;
    };
    const controlledReceipts = [
      createControlledToolReceipt('a'),
      createControlledToolReceipt('b'),
    ] as const;
    const controlledToolExecutionReceiptDigests = Object.freeze(
      controlledReceipts
        .map(({ receiptDigest }) => receiptDigest)
        .sort(compareUnicodeCodePoints)
    );
    const joinedCallIds = Object.freeze(
      controlledReceipts
        .map(({ toolCallId }) => toolCallId)
        .sort(compareUnicodeCodePoints)
    );
    const createJoin = (
      receiptDigests: readonly (typeof controlledToolExecutionReceiptDigests)[number][]
    ): AgentEvaluationParallelToolJoinCapabilityFact => {
      const joinBase = Object.freeze({
        groupId: 'parallel.controlled.capability-specific',
        planDigest: digest('parallel-plan'),
        generation: 1,
        joinedCallIds,
        controlledToolExecutionReceiptDigests: Object.freeze(
          [...receiptDigests].sort(compareUnicodeCodePoints)
        ),
        cancelledCallIds: Object.freeze([]),
        lateCallIds: Object.freeze([]),
        status: 'joined' as const,
        resultDigest: digest('parallel-result'),
      });
      return Object.freeze({
        ...joinBase,
        receiptDigest: digestAgentCanonicalValue(joinBase),
      });
    };
    const join = createJoin(controlledToolExecutionReceiptDigests);
    const runtimeToolExecutionReceiptSetDigest = digestAgentCanonicalValue({
      toolReceiptDigests: controlledToolExecutionReceiptDigests,
    });

    expect(isAgentEvaluationParallelToolJoinCapabilityFact(join)).toBe(true);
    expect(
      matchAgentEvaluationControlledToolExecutionReceiptLeafSet({
        parallelJoinFacts: [join],
        controlledToolExecutionReceiptDigests: [
          controlledReceipts[0].receiptDigest,
        ],
        runtimeToolExecutionReceiptSetDigest,
      })
    ).toBe(true);

    const droppedAndRecomputed = createJoin([
      controlledReceipts[0].receiptDigest,
    ]);
    expect(
      isAgentEvaluationParallelToolJoinCapabilityFact(droppedAndRecomputed)
    ).toBe(false);
    expect(
      matchAgentEvaluationControlledToolExecutionReceiptLeafSet({
        parallelJoinFacts: [droppedAndRecomputed],
        controlledToolExecutionReceiptDigests: [
          controlledReceipts[0].receiptDigest,
        ],
        runtimeToolExecutionReceiptSetDigest,
      })
    ).toBe(false);

    const swappedAndRecomputed = createJoin([
      controlledReceipts[0].receiptDigest,
      digest('parallel-tool-receipt-swapped'),
    ]);
    expect(
      isAgentEvaluationParallelToolJoinCapabilityFact(swappedAndRecomputed)
    ).toBe(true);
    expect(
      matchAgentEvaluationControlledToolExecutionReceiptLeafSet({
        parallelJoinFacts: [swappedAndRecomputed],
        controlledToolExecutionReceiptDigests: [
          controlledReceipts[0].receiptDigest,
        ],
        runtimeToolExecutionReceiptSetDigest,
      })
    ).toBe(false);
  });

  it('proves the maximum denominator family remains below the archive ceiling', () => {
    expect(
      maximumAgentEvaluationCapabilitySpecificReceiptFamilyBytes(14_040)
    ).toBe(1_840_250_880);
    expect(
      maximumAgentEvaluationCapabilitySpecificReceiptFamilyBytes(14_040)
    ).toBeLessThan(8 * 1_024 * 1_024 * 1_024);
    expect(
      hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity([
        'receipt.one',
        'receipt.two',
      ])
    ).toBe(true);
    expect(
      hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity([
        'receipt.one',
        'receipt.two',
        'receipt.three',
      ])
    ).toBe(false);
  });
});
