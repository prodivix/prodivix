import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  AGENT_EVALUATION_PRE_DISPATCH_FAILURE_REASON_CODES,
  AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON,
  createAgentEvaluationPreDispatchFailureReceipt,
  isAgentEvaluationPreDispatchFailureReceipt,
  type CreateAgentEvaluationPreDispatchFailureReceiptInput,
  type AgentEvaluationPreDispatchFailureReasonCode,
  type AgentEvaluationPreDispatchFailureStage,
} from './agentEvaluationPreDispatchFailure';
import {
  canonicalAgentEvaluationAuthenticityOrder,
  digestAgentEvaluationPreDispatchFailureReceiptSet,
} from './agentEvaluationEvidenceAuthenticity';

const digest = (value: string): string => digestAgentCanonicalValue(value);

const stageForReason = (
  reasonCode: AgentEvaluationPreDispatchFailureReasonCode
): AgentEvaluationPreDispatchFailureStage => {
  switch (reasonCode) {
    case 'protected-material-unavailable':
    case 'protected-material-integrity-failed':
    case 'protected-material-policy-rejected':
    case 'protected-material-leak-blocked':
      return 'protected-material-resolution';
    case 'invocation-payload-invalid':
      return 'invocation-payload-encoding';
    case 'budget-admission-rejected':
      return 'budget-admission';
    case 'verification-attempt-grant-unavailable':
    case 'cancelled-before-dispatch':
      return 'dispatch-admission';
  }
};

const receiptFor = (
  reasonCode: AgentEvaluationPreDispatchFailureReasonCode = 'protected-material-leak-blocked',
  overrides: Partial<CreateAgentEvaluationPreDispatchFailureReceiptInput> = {}
) =>
  createAgentEvaluationPreDispatchFailureReceipt({
    failureReceiptId: `pre-dispatch-failure.${reasonCode}`,
    planDigest: digest('plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    attemptId: 'attempt.g4-evaluation.1',
    descriptorDigest: digest('descriptor'),
    turnIndex: 0,
    invocationId: 'invocation.g4-evaluation.1.0',
    stage: stageForReason(reasonCode),
    reasonCode,
    policyDigest: digest('frozen-policy'),
    inputDigest: digest('restricted-material-or-request'),
    findingDigest: digest('sanitized-finding-set'),
    occurredAt: '2026-08-08T06:00:00.000Z',
    ...overrides,
  });

describe('Agent evaluation pre-dispatch failure authority', () => {
  it('freezes every produced reason to its exact pre-dispatch stage', () => {
    for (const reasonCode of AGENT_EVALUATION_PRE_DISPATCH_FAILURE_REASON_CODES) {
      const receipt = receiptFor(reasonCode);
      expect(isAgentEvaluationPreDispatchFailureReceipt(receipt)).toBe(true);
      expect(receipt.stage).toBe(stageForReason(reasonCode));
      expect(Object.isFrozen(receipt)).toBe(true);
    }
    expect(AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON).toEqual({
      'protected-material-unavailable': 'infrastructure-error',
      'protected-material-integrity-failed': 'blocked',
      'protected-material-policy-rejected': 'blocked',
      'protected-material-leak-blocked': 'blocked',
      'invocation-payload-invalid': 'schema-failed',
      'budget-admission-rejected': 'blocked',
      'verification-attempt-grant-unavailable': 'infrastructure-error',
      'cancelled-before-dispatch': 'cancelled',
    });
    expect(
      Object.keys(AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON)
    ).toEqual(AGENT_EVALUATION_PRE_DISPATCH_FAILURE_REASON_CODES);
    expect(
      Object.isFrozen(AGENT_EVALUATION_PRE_DISPATCH_FAILURE_STATUS_BY_REASON)
    ).toBe(true);
  });

  it('rejects stage drift, mutable model identifiers, digest drift, and unbounded turns', () => {
    const receipt = receiptFor();
    expect(
      isAgentEvaluationPreDispatchFailureReceipt({
        ...receipt,
        stage: 'dispatch-admission',
      })
    ).toBe(false);
    expect(
      isAgentEvaluationPreDispatchFailureReceipt({
        ...receipt,
        repositoryCommit: 'main',
      })
    ).toBe(false);
    expect(
      isAgentEvaluationPreDispatchFailureReceipt({
        ...receipt,
        turnIndex: 65,
      })
    ).toBe(false);
    expect(
      isAgentEvaluationPreDispatchFailureReceipt({
        ...receipt,
        findingDigest: digest('drift'),
      })
    ).toBe(false);
    expect(() =>
      createAgentEvaluationPreDispatchFailureReceipt({
        ...receipt,
        stage: 'dispatch-admission',
      })
    ).toThrow(/invalid/u);
  });

  it('fails closed when plaintext, paths, canaries, keys, or extra fields are attached', () => {
    const receipt = receiptFor();
    const prohibited = {
      path: '/protected/body',
      body: 'holdout plaintext',
      canary: 'protected-holdout-canary-9f86d081884c',
      key: 'key-material',
      secret: 'secret-material',
    } as const;
    for (const [key, value] of Object.entries(prohibited)) {
      expect(
        isAgentEvaluationPreDispatchFailureReceipt({
          ...receipt,
          [key]: value,
        })
      ).toBe(false);
    }
    const serialized = JSON.stringify(receipt);
    for (const value of Object.values(prohibited)) {
      expect(serialized).not.toContain(value);
    }
  });

  it('uses attempt, turn, and failure id as the canonical durable order', () => {
    const values = [
      receiptFor('cancelled-before-dispatch', {
        failureReceiptId: 'failure.b.1.z',
        attemptId: 'attempt.b',
        turnIndex: 1,
      }),
      receiptFor('invocation-payload-invalid', {
        failureReceiptId: 'failure.a.1.z',
        attemptId: 'attempt.a',
        turnIndex: 1,
      }),
      receiptFor('budget-admission-rejected', {
        failureReceiptId: 'failure.a.0.z',
        attemptId: 'attempt.a',
        turnIndex: 0,
      }),
      receiptFor('protected-material-policy-rejected', {
        failureReceiptId: 'failure.a.1.a',
        attemptId: 'attempt.a',
        turnIndex: 1,
      }),
    ];
    const ordered =
      canonicalAgentEvaluationAuthenticityOrder.preDispatchFailureReceipts(
        values
      );
    expect(ordered.map(({ failureReceiptId }) => failureReceiptId)).toEqual([
      'failure.a.0.z',
      'failure.a.1.a',
      'failure.a.1.z',
      'failure.b.1.z',
    ]);
    expect(digestAgentEvaluationPreDispatchFailureReceiptSet(ordered)).toBe(
      digestAgentCanonicalValue(
        ordered.map(({ receiptDigest }) => receiptDigest)
      )
    );
  });
});
