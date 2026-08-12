import { describe, expect, it } from 'vitest';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  createAgentEvaluationAttemptAuthorityOwnerReceipt,
  createAgentEvaluationAttemptAuthorityResponseProjection,
} from './agentEvaluationAttemptAuthorityOwnerReceipt';
import {
  createAgentEvaluationCapabilityOwnerFact,
  createAgentEvaluationCapabilitySpecificReceipt,
  digestAgentEvaluationCapabilitySpecificAuthoritySemantic,
} from './agentEvaluationCapabilitySpecificReceipt';
import {
  matchAgentEvaluationCapabilityBudgetAuthority,
  matchAgentEvaluationCapabilitySpecificOwnerAuthority,
  matchAgentEvaluationCapabilityTerminalAuthority,
} from './agentEvaluationCapabilitySpecificOwnerBinding';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentBudgetReservation } from '../usage/agentBudgetLedger';
import type { AgentEvaluationResultSubmissionReceipt } from './agentEvaluationResultContract';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const completedAt = '2026-08-08T00:00:01.000Z';

describe('agent evaluation capability-specific owner binding', () => {
  it('binds the producer request and rejects an owner or lease swap', () => {
    const requestDigest = digest('owner-request');
    const resultDigest = digest('timeout-result');
    const ownerImplementationDigest = digest('owner-implementation');
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'recovery-authority',
      category: 'timeout-receipt',
      authorityId: 'authority.timeout',
      authorityImplementationDigest: ownerImplementationDigest,
      authorityRequestDigest: requestDigest,
      authorityResultDigest: resultDigest,
      shardLeaseOwnerId: 'lease-owner.primary',
      shardLeaseGeneration: 3,
      dispatchState: 'dispatched',
      authorityInstant: completedAt,
      fenceDigest: resultDigest,
      fenceOutcome: 'timed-out',
      observedAt: completedAt,
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: 'capability-specific.timeout',
      receiptKind: 'timeout-receipt',
      planDigest: digest('plan'),
      repositoryCommit,
      attemptId: 'attempt.timeout',
      descriptorDigest: digest('descriptor'),
      caseId: 'case.timeout',
      materialDigest: digest('material'),
      capabilityDescriptorDigest: digest('capability-descriptor'),
      turnIndex: 1,
      invocationId: 'invocation.timeout',
      requestDigest: digest('provider-request'),
      resultDigest,
      startedAt: '2026-08-08T00:00:00.000Z',
      completedAt,
      authority: Object.freeze({
        authorityKind: 'recovery-authority' as const,
        receiptKind: 'timeout-receipt' as const,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'recovery-authority',
            receiptKind: 'timeout-receipt',
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });
    const responseProjection =
      createAgentEvaluationAttemptAuthorityResponseProjection(
        'capability-runtime',
        'assess-capability',
        { outcome: 'failed', specificReceipts: [receipt] },
        {
          bindingKind: 'assess-capability',
          terminalTurnIndex: 1,
          terminalInvocationId: receipt.invocationId,
          materialDigest: receipt.materialDigest,
          capabilityDescriptorDigest: receipt.capabilityDescriptorDigest,
        }
      );
    const ownerFor = (shardLeaseOwnerId: string) =>
      createAgentEvaluationAttemptAuthorityOwnerReceipt({
        serviceKind: 'capability-runtime',
        operation: 'assess-capability',
        namespaceId: 'namespace.test',
        planDigest: receipt.planDigest,
        repositoryCommit,
        attemptId: receipt.attemptId,
        descriptorDigest: receipt.descriptorDigest,
        shardLeaseOwnerId,
        shardLeaseGeneration: 3,
        verificationGrantGeneration: 2,
        verificationAttemptGrantReceiptSetDigest: digest('grant-set'),
        requestDigest,
        responseProjection,
        ownerImplementationDigest,
        completedAt,
      });

    expect(
      matchAgentEvaluationCapabilitySpecificOwnerAuthority(
        receipt,
        ownerFor('lease-owner.primary')
      )
    ).toBe(true);
    expect(
      matchAgentEvaluationCapabilitySpecificOwnerAuthority(
        receipt,
        ownerFor('lease-owner.swapped')
      )
    ).toBe(false);
  });

  it('binds budget facts to the exact settled ledger authority', () => {
    const settlementDigest = digest('settlement');
    const reservationId = 'reservation.budget';
    const demandDigest = digest('demand');
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'recovery-authority',
      category: 'budget-reservation-receipt',
      authorityId: 'authority.budget',
      authorityImplementationDigest: digest('budget-implementation'),
      authorityRequestDigest: digest('budget-request'),
      authorityResultDigest: settlementDigest,
      reservationId,
      demandDigest,
      settlementDigest,
      reservationStatus: 'reconciled',
      observedAt: completedAt,
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: 'capability-specific.budget',
      receiptKind: 'budget-reservation-receipt',
      planDigest: digest('plan'),
      repositoryCommit,
      attemptId: 'attempt.budget',
      descriptorDigest: digest('descriptor'),
      caseId: 'case.budget',
      materialDigest: digest('material'),
      capabilityDescriptorDigest: digest('capability-descriptor'),
      turnIndex: 1,
      invocationId: 'invocation.budget',
      requestDigest: digest('provider-request'),
      resultDigest: settlementDigest,
      startedAt: '2026-08-08T00:00:00.000Z',
      completedAt,
      authority: Object.freeze({
        authorityKind: 'recovery-authority' as const,
        receiptKind: 'budget-reservation-receipt' as const,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'recovery-authority',
            receiptKind: 'budget-reservation-receipt',
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });
    const emptyDemand = Object.freeze({
      usage: createAgentUsageVector([]),
      cost: Object.freeze([]),
      modelInvocations: 0,
      toolCalls: 0,
      repairRounds: 0,
      transactions: 0,
      artifactBytes: 0,
      elapsedMs: 0,
    });
    const reservation: AgentBudgetReservation = Object.freeze({
      reservationId,
      demand: emptyDemand,
      demandDigest,
      reservedAt: '2026-08-08T00:00:00.000Z',
      status: 'settled',
      settlement: Object.freeze({
        actual: emptyDemand,
        charged: emptyDemand,
        requiresReconciliation: true,
        reconciliationReason: 'ack-loss',
        settledAt: completedAt,
        settlementDigest,
      }),
    });

    expect(
      matchAgentEvaluationCapabilityBudgetAuthority(receipt, reservation)
    ).toBe(true);
    expect(
      matchAgentEvaluationCapabilityBudgetAuthority(receipt, {
        ...reservation,
        demandDigest: digest('swapped-demand'),
      })
    ).toBe(false);
  });

  it('binds terminal normalization to the exact result-submit event', () => {
    const terminalEventDigest = digest('terminal-event');
    const fact = createAgentEvaluationCapabilityOwnerFact({
      authorityKind: 'terminal-normalization',
      category: 'refusal-receipt',
      authorityId: 'authority.terminal-normalization',
      authorityImplementationDigest: digest('terminal-implementation'),
      authorityRequestDigest: digest('terminal-request'),
      authorityResultDigest: terminalEventDigest,
      terminalEventDigest,
      normalizedOutcome: 'refused',
      normalizationPolicyDigest: digest('normalization-policy'),
      observedAt: completedAt,
    });
    const receipt = createAgentEvaluationCapabilitySpecificReceipt({
      receiptId: 'capability-specific.refusal',
      receiptKind: 'refusal-receipt',
      planDigest: digest('plan'),
      repositoryCommit,
      attemptId: 'attempt.terminal',
      descriptorDigest: digest('descriptor'),
      caseId: 'case.terminal',
      materialDigest: digest('material'),
      capabilityDescriptorDigest: digest('capability-descriptor'),
      turnIndex: 2,
      invocationId: 'invocation.terminal',
      requestDigest: digest('provider-request'),
      providerCapabilityObservationReceiptDigest: digest(
        'provider-capability-observation.terminal'
      ),
      resultDigest: terminalEventDigest,
      startedAt: '2026-08-08T00:00:00.000Z',
      completedAt,
      authority: Object.freeze({
        authorityKind: 'terminal-normalization' as const,
        receiptKind: 'refusal-receipt' as const,
        factDigest: fact.factDigest,
        semanticDigest:
          digestAgentEvaluationCapabilitySpecificAuthoritySemantic({
            authorityKind: 'terminal-normalization',
            receiptKind: 'refusal-receipt',
            factDigest: fact.factDigest,
          }),
        fact,
      }),
    });
    const submissionBase = Object.freeze({
      format: 'prodivix.agent-evaluation-result-submission-receipt' as const,
      version: 1 as const,
      attemptId: receipt.attemptId,
      invocationId: receipt.invocationId,
      descriptorDigest: receipt.descriptorDigest,
      caseId: receipt.caseId,
      caseDigest: digest('case'),
      materialDigest: receipt.materialDigest,
      caseDefinitionDigest: digest('case-definition'),
      toolId: 'evaluation.result.submit' as const,
      nativeToolName: 'evaluation_result_submit' as const,
      toolVersion: 'v1' as const,
      schemaDigest: digest('schema'),
      inputSchemaDigest: digest('input-schema'),
      toolDefinitionDigest: digest('tool-definition'),
      providerToolCallId: 'provider-tool-call.terminal',
      toolArgumentsDigest: digest('arguments'),
      toolEventSequence: 1,
      toolEventDigest: digest('tool-event'),
      terminalEventSequence: 2,
      terminalEventDigest,
      submissionDigest: digest('submission'),
    });
    const submission: AgentEvaluationResultSubmissionReceipt = Object.freeze({
      ...submissionBase,
      receiptDigest: digestAgentCanonicalValue(submissionBase),
    });

    expect(
      matchAgentEvaluationCapabilityTerminalAuthority(receipt, submission)
    ).toBe(true);
    const driftedBase = Object.freeze({
      ...submissionBase,
      terminalEventDigest: digest('drifted-terminal-event'),
    });
    expect(
      matchAgentEvaluationCapabilityTerminalAuthority(receipt, {
        ...driftedBase,
        receiptDigest: digestAgentCanonicalValue(driftedBase),
      })
    ).toBe(false);
  });
});
