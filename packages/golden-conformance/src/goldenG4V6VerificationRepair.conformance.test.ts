import { describe, expect, it } from 'vitest';
import { finalizeAgentRun, transitionAgentRunPhase } from '@prodivix/ai';
import {
  createWorkspaceAgentApplySuccessProof,
  createWorkspaceAgentVerificationPlanBinding,
  digestWorkspaceAgentStableVerificationCell,
  evaluateWorkspaceAgentVerificationClosure,
  prepareWorkspaceAgentRepairRound,
} from '@prodivix/workspace-sync';
import {
  createGoldenG4V5ApprovalContext,
  GOLDEN_G4_V5_BASE_WORKSPACE,
  GOLDEN_G4_V5_PROJECTION,
  GOLDEN_G4_V5_TASK,
} from './goldenG4V5ProposalApprovalFixture';
import {
  GOLDEN_G4_V6_COMMIT_RECEIPT,
  GOLDEN_G4_V6_FAILED_CELL_ID,
  GOLDEN_G4_V6_FAILED_FLOW,
  GOLDEN_G4_V6_FAILURE_CONTEXT_PACK,
  GOLDEN_G4_V6_PASSED_FLOW,
  GOLDEN_G4_V6_PRODUCER,
  GOLDEN_G4_V6_REPAIRED_FLOW,
  GOLDEN_G4_V6_REPAIRED_SUCCESS_PROOF,
  GOLDEN_G4_V6_REPAIRING_RUN,
  GOLDEN_G4_V6_REPAIR_ACKNOWLEDGED,
  GOLDEN_G4_V6_REPAIR_APPROVAL,
  GOLDEN_G4_V6_REPAIR_BOUND_RECEIPT,
  GOLDEN_G4_V6_REPAIR_PREPARATION,
  GOLDEN_G4_V6_REPAIR_PREPARED_COMMIT,
  GOLDEN_G4_V6_REPAIR_PROJECTION,
  GOLDEN_G4_V6_REPAIR_PROPOSAL,
  GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED,
  GOLDEN_G4_V6_ROLLBACK_FLOW,
  GOLDEN_G4_V6_ROLLBACK_PREPARED,
  GOLDEN_G4_V6_TIME,
  GOLDEN_G4_V6_VERIFYING_RUN,
} from './goldenG4V6VerificationRepairFixture';

describe('G4 V6 committed Verification, repair, and counterexample Golden', () => {
  it('keeps a failed G3 Closure and its promoted Evidence from becoming apply success', () => {
    expect(GOLDEN_G4_V6_FAILED_FLOW.closure).toMatchObject({
      verdict: 'unsatisfied',
      cellStatuses: {
        [GOLDEN_G4_V6_FAILED_CELL_ID]: 'failed',
      },
    });
    expect(
      GOLDEN_G4_V6_FAILED_FLOW.closureReceipt.evidenceRefs.filter(
        ({ outcome }) => outcome !== 'passed'
      )
    ).toEqual([
      expect.objectContaining({
        evidenceId: expect.any(String),
        manifestDigest: expect.stringMatching(/^sha256-[a-f0-9]{64}$/u),
        outcome: 'failed',
      }),
    ]);
    expect(
      createWorkspaceAgentApplySuccessProof({
        projection: GOLDEN_G4_V5_PROJECTION,
        approval: createGoldenG4V5ApprovalContext(),
        mutationReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
        binding: GOLDEN_G4_V6_FAILED_FLOW.binding,
        closureReceipt: GOLDEN_G4_V6_FAILED_FLOW.closureReceipt,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'AI-6001' }],
    });
  });

  it('accepts only the actual committed Plan, verified Evidence view, attached Run, and satisfied Closure', () => {
    expect(GOLDEN_G4_V6_PASSED_FLOW.closure.verdict).toBe('satisfied');
    expect(
      createWorkspaceAgentApplySuccessProof({
        projection: GOLDEN_G4_V5_PROJECTION,
        approval: createGoldenG4V5ApprovalContext(),
        mutationReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
        binding: GOLDEN_G4_V6_PASSED_FLOW.binding,
        closureReceipt: GOLDEN_G4_V6_PASSED_FLOW.closureReceipt,
      })
    ).toMatchObject({
      status: 'ready',
      value: {
        mode: 'apply',
        planCompatibility: 'exact',
        verificationClosureOutcome: 'satisfied',
      },
    });

    expect(
      evaluateWorkspaceAgentVerificationClosure({
        binding: GOLDEN_G4_V6_PASSED_FLOW.binding,
        verificationRuns: GOLDEN_G4_V6_PASSED_FLOW.verificationRuns,
        closureInput: {
          ...GOLDEN_G4_V6_PASSED_FLOW.closureInput,
          verifiedEvidenceView: undefined,
        },
        receiptId: 'receipt.golden.g4-v6.raw-log-is-not-evidence',
        producer: GOLDEN_G4_V6_PRODUCER,
        evaluatedAt: GOLDEN_G4_V6_TIME.closure,
      })
    ).toMatchObject({
      status: 'blocked',
      issues: [{ code: 'AI-6001' }],
    });

    const policyDriftPlan = {
      ...GOLDEN_G4_V6_PASSED_FLOW.plan,
      policyDigest: GOLDEN_G4_V6_PASSED_FLOW.plan.compilerDigest,
    };
    expect(
      createWorkspaceAgentVerificationPlanBinding({
        projection: GOLDEN_G4_V5_PROJECTION,
        approval: createGoldenG4V5ApprovalContext(),
        mutationReceipt: GOLDEN_G4_V6_COMMIT_RECEIPT,
        actualPlan: policyDriftPlan,
        verificationRuns: GOLDEN_G4_V6_PASSED_FLOW.verificationRuns,
        bindingId: 'binding.golden.g4-v6.policy-drift',
        producer: GOLDEN_G4_V6_PRODUCER,
        boundAt: GOLDEN_G4_V6_TIME.verifying,
      })
    ).toMatchObject({ status: 'blocked' });
  });

  it('creates a fresh approval-bound repair Transaction and preserves the failed regression cell', () => {
    const failedCell = GOLDEN_G4_V6_FAILED_FLOW.plan.cells.find(
      ({ id }) => id === GOLDEN_G4_V6_FAILED_CELL_ID
    );
    expect(failedCell).toBeDefined();
    if (!failedCell) return;
    const failedStableDigest =
      digestWorkspaceAgentStableVerificationCell(failedCell);
    expect(GOLDEN_G4_V6_REPAIR_PREPARATION.receipt).toMatchObject({
      state: 'started',
      round: 1,
      failedClosureDigest: GOLDEN_G4_V6_FAILED_FLOW.closure.closureDigest,
      failureContextPackDigest:
        GOLDEN_G4_V6_FAILURE_CONTEXT_PACK.manifestDigest,
    });
    expect(
      GOLDEN_G4_V6_REPAIR_PREPARATION.counterexamples.requirements
    ).toContainEqual(
      expect.objectContaining({
        sourceCellId: GOLDEN_G4_V6_FAILED_CELL_ID,
        stableCellDigest: failedStableDigest,
      })
    );
    expect(GOLDEN_G4_V6_REPAIR_PROPOSAL.proposalId).not.toBe(
      GOLDEN_G4_V5_PROJECTION.preview.proposalId
    );
    expect(GOLDEN_G4_V6_REPAIR_PROJECTION.preview.previewId).not.toBe(
      GOLDEN_G4_V5_PROJECTION.preview.previewId
    );
    expect(GOLDEN_G4_V6_REPAIR_PROJECTION.planning.transactionDigest).not.toBe(
      GOLDEN_G4_V5_PROJECTION.planning.transactionDigest
    );
    expect(GOLDEN_G4_V6_REPAIR_PREPARED_COMMIT).toMatchObject({
      status: 'ready',
      outboxEntry: { entryKind: 'operation' },
      receipt: { state: 'started', kind: 'commit' },
    });
    expect(GOLDEN_G4_V6_REPAIR_BOUND_RECEIPT).toMatchObject({
      state: 'proposal-bound',
      proposalId: GOLDEN_G4_V6_REPAIR_PROPOSAL.proposalId,
      decisionId: GOLDEN_G4_V6_REPAIR_APPROVAL.decision.decisionId,
      transactionDigest:
        GOLDEN_G4_V6_REPAIR_PROJECTION.planning.transactionDigest,
      regressionRequirementSetDigest:
        GOLDEN_G4_V6_REPAIR_PREPARATION.counterexamples
          .regressionRequirementSetDigest,
    });
    expect(
      GOLDEN_G4_V6_REPAIR_PROJECTION.verificationPlan.cells
        .filter(({ requirement }) => requirement === 'required')
        .map(digestWorkspaceAgentStableVerificationCell)
    ).toContain(failedStableDigest);
  });

  it('reverifies the repaired revision and allows terminal success only with its new Closure proof', () => {
    expect(GOLDEN_G4_V6_REPAIR_ACKNOWLEDGED).toMatchObject({
      status: 'acknowledged',
      receipt: { kind: 'commit', state: 'acknowledged' },
    });
    expect(GOLDEN_G4_V6_REPAIRED_FLOW).toMatchObject({
      closure: { verdict: 'satisfied' },
      binding: {
        proposalId: GOLDEN_G4_V6_REPAIR_PROPOSAL.proposalId,
        planCompatibility: 'exact',
      },
    });

    const committing = transitionAgentRunPhase(
      GOLDEN_G4_V5_TASK,
      GOLDEN_G4_V6_REPAIRING_RUN,
      {
        eventId: 'event.golden.g4-v6.repair-committing',
        idempotencyKey: 'idempotency.golden.g4-v6.repair-committing',
        occurredAt: GOLDEN_G4_V6_TIME.repairCommit,
        producer: GOLDEN_G4_V6_PRODUCER,
        phase: 'committing',
      }
    );
    expect(committing.accepted).toBe(true);
    const verifying = transitionAgentRunPhase(
      GOLDEN_G4_V5_TASK,
      committing.state,
      {
        eventId: 'event.golden.g4-v6.repair-verifying',
        idempotencyKey: 'idempotency.golden.g4-v6.repair-verifying',
        occurredAt: GOLDEN_G4_V6_TIME.repairAck,
        producer: GOLDEN_G4_V6_PRODUCER,
        phase: 'verifying',
      }
    );
    expect(verifying.accepted).toBe(true);
    expect(
      finalizeAgentRun(GOLDEN_G4_V5_TASK, verifying.state, {
        eventId: 'event.golden.g4-v6.repair-succeeded',
        idempotencyKey: 'idempotency.golden.g4-v6.repair-succeeded',
        occurredAt: '2026-08-01T12:04:01.000Z',
        producer: GOLDEN_G4_V6_PRODUCER,
        outcome: 'succeeded',
        successProof: GOLDEN_G4_V6_REPAIRED_SUCCESS_PROOF,
      })
    ).toMatchObject({
      accepted: true,
      state: { run: { phase: 'terminal', outcome: 'succeeded' } },
    });
    expect(
      finalizeAgentRun(GOLDEN_G4_V5_TASK, GOLDEN_G4_V6_VERIFYING_RUN, {
        eventId: 'event.golden.g4-v6.missing-proof',
        idempotencyKey: 'idempotency.golden.g4-v6.missing-proof',
        occurredAt: '2026-08-01T12:04:01.000Z',
        producer: GOLDEN_G4_V6_PRODUCER,
        outcome: 'succeeded',
      })
    ).toMatchObject({ accepted: false });
  });

  it('durably blocks a second repair round when the bounded budget is exhausted', () => {
    const exhausted = prepareWorkspaceAgentRepairRound({
      task: GOLDEN_G4_V5_TASK,
      run: GOLDEN_G4_V6_REPAIRING_RUN,
      policy: GOLDEN_G4_V6_REPAIR_APPROVAL.policy,
      failedClosureReceipt: GOLDEN_G4_V6_FAILED_FLOW.closureReceipt,
      failedClosure: GOLDEN_G4_V6_FAILED_FLOW.closure,
      failedPlan: GOLDEN_G4_V6_FAILED_FLOW.plan,
      failedEvidence: GOLDEN_G4_V6_FAILED_FLOW.evidence,
      failureContextPack: GOLDEN_G4_V6_FAILURE_CONTEXT_PACK,
      previousRepairReceipts: [GOLDEN_G4_V6_REPAIR_PREPARATION.receipt],
      receiptId: 'receipt.golden.g4-v6.repair.exhausted',
      repairRoundId: 'repair-round.golden.g4-v6.2',
      producer: GOLDEN_G4_V6_PRODUCER,
      recordedAt: '2026-08-01T12:04:02.000Z',
    });
    expect(exhausted).toMatchObject({
      status: 'ready',
      value: {
        receipt: {
          state: 'blocked',
          round: 2,
          blockReason: 'repair-round-exhausted',
        },
      },
    });
  });

  it('treats rollback as another acknowledged mutation and reverifies the restored revision', () => {
    expect(GOLDEN_G4_V6_ROLLBACK_PREPARED).toMatchObject({
      status: 'ready',
      receipt: { kind: 'rollback', state: 'started' },
    });
    expect(GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED).toMatchObject({
      status: 'acknowledged',
      receipt: { kind: 'rollback', state: 'acknowledged' },
    });
    expect(
      GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED.snapshot.docsById[
        'graph-catalog-derived-state'
      ]?.content
    ).toEqual(
      GOLDEN_G4_V5_BASE_WORKSPACE.docsById['graph-catalog-derived-state']
        ?.content
    );
    expect(GOLDEN_G4_V6_ROLLBACK_FLOW).toMatchObject({
      binding: { mutationKind: 'rollback', planCompatibility: 'post-rollback' },
      closure: { verdict: 'satisfied' },
      closureReceipt: { verdict: 'satisfied' },
    });
    expect(
      createWorkspaceAgentApplySuccessProof({
        projection: GOLDEN_G4_V5_PROJECTION,
        approval: createGoldenG4V5ApprovalContext(),
        mutationReceipt: GOLDEN_G4_V6_ROLLBACK_ACKNOWLEDGED.receipt,
        binding: GOLDEN_G4_V6_ROLLBACK_FLOW.binding,
        closureReceipt: GOLDEN_G4_V6_ROLLBACK_FLOW.closureReceipt,
      })
    ).toMatchObject({ status: 'blocked' });
  });
});
