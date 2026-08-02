import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCommittedVerificationPlanBinding,
  createAgentRepairRoundReceipt,
  createAgentVerificationClosureReceipt,
} from './agentVerification';
import {
  decodeAgentVerificationFact,
  encodeAgentVerificationFact,
} from './agentVerificationCodec';

const digest = (value: string): string =>
  digestAgentCanonicalValue({ suite: 'g4-v6', value });

const revision = Object.freeze({
  workspaceRev: 43,
  routeRev: 9,
  opSeq: 145,
  documents: Object.freeze([
    Object.freeze({
      documentId: 'page.catalog',
      contentRev: 22,
      metaRev: 3,
    }),
  ]),
});
const producer = Object.freeze({
  kind: 'service' as const,
  principalId: 'agent.verification-coordinator',
});

const binding = createAgentCommittedVerificationPlanBinding({
  bindingId: 'binding.catalog.1',
  taskId: 'task.catalog.1',
  runId: 'run.catalog.1',
  proposalId: 'proposal.catalog.1',
  previewId: 'preview.catalog.1',
  decisionId: 'decision.catalog.1',
  mutationReceiptId: 'receipt.commit.ack.1',
  mutationKind: 'commit',
  verificationRunId: 'verification.run.catalog.1',
  targetRevision: revision,
  approvedPlanDigest: digest('plan.actual'),
  actualPlanDigest: digest('plan.actual'),
  planCompatibility: 'exact',
  impactDigest: digest('impact'),
  policyDigest: digest('policy'),
  approvedRequiredCellSetDigest: digest('cells'),
  actualRequiredCellSetDigest: digest('cells'),
  regressionRequirementSetDigest: digest('regressions.empty'),
  producer,
  boundAt: '2026-08-02T00:00:01.000Z',
});

describe('G4 V6 Agent Verification facts', () => {
  it('binds exact committed plans and canonical promoted Closure receipts', () => {
    const closure = createAgentVerificationClosureReceipt({
      receiptId: 'receipt.closure.1',
      bindingId: binding.bindingId,
      taskId: binding.taskId,
      runId: binding.runId,
      verificationRunId: binding.verificationRunId,
      targetRevision: revision,
      planDigest: binding.actualPlanDigest,
      evidenceRefs: [
        Object.freeze({
          evidenceId: 'evidence.catalog.1',
          manifestDigest: digest('evidence.1'),
          outcome: 'passed' as const,
        }),
      ],
      evidenceSetDigest: digest('evidence-set'),
      verifiedEvidenceViewDigest: digest('verified-view'),
      closureDigest: digest('closure'),
      verdict: 'satisfied',
      producer,
      evaluatedAt: '2026-08-02T00:00:02.000Z',
    });

    for (const fact of [
      Object.freeze({
        factType: 'committed-plan-binding' as const,
        value: binding,
      }),
      Object.freeze({
        factType: 'verification-closure-receipt' as const,
        value: closure,
      }),
    ]) {
      const encoded = encodeAgentVerificationFact(fact);
      expect(decodeAgentVerificationFact(encoded)).toEqual({
        ok: true,
        value: fact,
      });
    }
  });

  it('records append-only started, proposal-bound, and blocked repair states', () => {
    const common = {
      repairRoundId: 'repair.round.catalog.1',
      taskId: binding.taskId,
      runId: binding.runId,
      round: 1,
      failedClosureReceiptId: 'receipt.closure.failed.1',
      failedClosureDigest: digest('closure.failed'),
      failedEvidenceManifestDigests: [digest('evidence.failed')],
      failureContextPackDigest: digest('failure-context'),
      counterexampleSetDigest: digest('counterexamples'),
      regressionRequirementSetDigest: digest('regressions'),
      cumulativeBudgetLedgerDigest: digest('budget-ledger'),
      producer,
      recordedAt: '2026-08-02T00:01:00.000Z',
    } as const;
    const started = createAgentRepairRoundReceipt({
      ...common,
      receiptId: 'receipt.repair.started.1',
      state: 'started',
    });
    const bound = createAgentRepairRoundReceipt({
      ...common,
      receiptId: 'receipt.repair.bound.1',
      state: 'proposal-bound',
      proposalId: 'proposal.catalog.repair.1',
      previewId: 'preview.catalog.repair.1',
      decisionId: 'decision.catalog.repair.1',
      transactionDigest: digest('transaction.repair'),
      verificationPlanDigest: digest('plan.repair'),
    });
    const blocked = createAgentRepairRoundReceipt({
      ...common,
      receiptId: 'receipt.repair.blocked.1',
      state: 'blocked',
      blockReason: 'repair-round-exhausted',
    });
    expect(started.receiptDigest).not.toBe(bound.receiptDigest);
    expect(bound.receiptDigest).not.toBe(blocked.receiptDigest);
  });

  it('fails closed on fake success, authority drift, and non-canonical facts', () => {
    expect(() =>
      createAgentVerificationClosureReceipt({
        receiptId: 'receipt.fake',
        bindingId: binding.bindingId,
        taskId: binding.taskId,
        runId: binding.runId,
        verificationRunId: binding.verificationRunId,
        targetRevision: revision,
        planDigest: binding.actualPlanDigest,
        evidenceRefs: [],
        evidenceSetDigest: digest('empty'),
        verifiedEvidenceViewDigest: digest('view'),
        closureDigest: digest('fake-closure'),
        verdict: 'satisfied',
        producer,
        evaluatedAt: '2026-08-02T00:00:02.000Z',
      })
    ).toThrow(/promoted Evidence/u);

    expect(() =>
      createAgentCommittedVerificationPlanBinding({
        ...binding,
        bindingId: 'binding.invalid',
        approvedPlanDigest: digest('approved'),
        actualPlanDigest: digest('actual'),
        planCompatibility: 'exact',
      })
    ).toThrow(/invalid/u);

    const encoded = encodeAgentVerificationFact({
      factType: 'committed-plan-binding',
      value: binding,
    });
    expect(
      decodeAgentVerificationFact({
        ...encoded,
        value: { ...encoded.value, approval: true },
      }).ok
    ).toBe(false);
    expect(
      decodeAgentVerificationFact({
        ...encoded,
        value: {
          ...encoded.value,
          producer: { kind: 'user', principalId: 'user.1' },
        },
      }).ok
    ).toBe(false);
  });
});
