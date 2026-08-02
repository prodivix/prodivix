import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createAgentCommittedVerificationPlanBinding,
  createAgentRepairRoundReceipt,
  createAgentVerificationClosureReceipt,
  digestAgentCanonicalValue,
  encodeAgentControlFact,
  encodeAgentVerificationFact,
  finalizeAgentRun,
} from '../packages/ai/src/index.ts';
import { createG4AgentProposalCanonicalVector } from './g4-agent-proposal-canonical-vector.mjs';

const digest = (value) => digestAgentCanonicalValue({ g4: 'v6', value });
const proposalVector = createG4AgentProposalCanonicalVector();
const proposal = proposalVector.facts.proposal.value;
const planning = proposalVector.facts.planning.value;
const preview = proposalVector.facts.preview.value;
const approval = proposalVector.facts.approval.value;
const commit = proposalVector.facts.commitAcknowledged.value;
const revision = commit.targetRevision;
const producer = commit.producer;

const binding = createAgentCommittedVerificationPlanBinding({
  bindingId: 'binding.g4-v6.vector.commit',
  taskId: proposal.taskId,
  runId: proposal.runId,
  proposalId: proposal.proposalId,
  previewId: preview.previewId,
  decisionId: approval.decisionId,
  mutationReceiptId: commit.receiptId,
  mutationKind: 'commit',
  verificationRunId: 'verification-run.g4-v6.vector',
  targetRevision: revision,
  approvedPlanDigest: planning.verificationPlanDigest,
  actualPlanDigest: planning.verificationPlanDigest,
  planCompatibility: 'exact',
  impactDigest: planning.impactDigest,
  policyDigest: approval.policyDigest,
  approvedRequiredCellSetDigest: digest('required-cells'),
  actualRequiredCellSetDigest: digest('required-cells'),
  regressionRequirementSetDigest: digest([]),
  producer,
  boundAt: '2026-08-02T02:00:00.000Z',
});

const failedEvidence = Object.freeze({
  evidenceId: 'evidence.g4-v6.vector.failed',
  manifestDigest: digest('evidence.failed'),
  outcome: 'failed',
});
const closure = createAgentVerificationClosureReceipt({
  receiptId: 'receipt.g4-v6.vector.closure',
  bindingId: binding.bindingId,
  taskId: binding.taskId,
  runId: binding.runId,
  verificationRunId: binding.verificationRunId,
  targetRevision: revision,
  planDigest: binding.actualPlanDigest,
  evidenceRefs: Object.freeze([failedEvidence]),
  evidenceSetDigest: digest('evidence-set'),
  verifiedEvidenceViewDigest: digest('verified-view'),
  closureDigest: digest('closure.unsatisfied'),
  verdict: 'unsatisfied',
  producer,
  evaluatedAt: '2026-08-02T02:01:00.000Z',
});
const passedEvidence = Object.freeze({
  evidenceId: 'evidence.g4-v6.vector.passed',
  manifestDigest: digest('evidence.passed'),
  outcome: 'passed',
});
const satisfiedClosure = createAgentVerificationClosureReceipt({
  ...(() => {
    const { receiptDigest: _receiptDigest, ...base } = closure;
    return base;
  })(),
  receiptId: 'receipt.g4-v6.vector.closure.satisfied',
  evidenceRefs: Object.freeze([passedEvidence]),
  evidenceSetDigest: digest('evidence-set.satisfied'),
  verifiedEvidenceViewDigest: digest('verified-view.satisfied'),
  closureDigest: digest('closure.satisfied'),
  verdict: 'satisfied',
  evaluatedAt: '2026-08-02T02:01:30.000Z',
});

const verifyingControl = proposalVector.controlFacts.sequence.at(-1).run.value;
const terminalResult = finalizeAgentRun(
  proposalVector.controlFacts.task.value,
  verifyingControl,
  {
    eventId: 'event.g4-v6.vector.terminal',
    idempotencyKey: 'idempotency.event.g4-v6.vector.terminal',
    occurredAt: '2026-08-02T02:05:00.000Z',
    producer,
    outcome: 'succeeded',
    successProof: Object.freeze({
      mode: 'apply',
      proposalDigest: proposal.proposalDigest,
      approvalDigest: proposalVector.expectedDigests.approval,
      transactionDigest: planning.transactionDigest,
      commitAckDigest: commit.receiptDigest,
      committedPlanDigest: binding.approvedPlanDigest,
      actualPlanDigest: binding.actualPlanDigest,
      planCompatibility: binding.planCompatibility,
      verificationClosureDigest: satisfiedClosure.closureDigest,
      verificationClosureOutcome: 'satisfied',
    }),
  }
);
if (!terminalResult.accepted) {
  throw new Error(terminalResult.issues.map(({ message }) => message).join('; '));
}

const repairStarted = createAgentRepairRoundReceipt({
  receiptId: 'receipt.g4-v6.vector.repair.started',
  repairRoundId: 'repair-round.g4-v6.vector.1',
  state: 'started',
  taskId: binding.taskId,
  runId: binding.runId,
  round: 1,
  failedClosureReceiptId: closure.receiptId,
  failedClosureDigest: closure.closureDigest,
  failedEvidenceManifestDigests: Object.freeze([failedEvidence.manifestDigest]),
  failureContextPackDigest: digest('repair-context'),
  counterexampleSetDigest: digest('counterexamples'),
  regressionRequirementSetDigest: digest('regressions'),
  cumulativeBudgetLedgerDigest: verifyingControl.budgetLedger.ledgerDigest,
  producer,
  recordedAt: '2026-08-02T02:02:00.000Z',
});
const { receiptDigest: _repairStartedDigest, ...repairStartedBase } = repairStarted;
const repairProposalBound = createAgentRepairRoundReceipt({
  ...repairStartedBase,
  receiptId: 'receipt.g4-v6.vector.repair.proposal-bound',
  state: 'proposal-bound',
  proposalId: 'proposal.g4-v6.vector.repair-1',
  previewId: 'preview.g4-v6.vector.repair-1',
  decisionId: 'decision.g4-v6.vector.repair-1',
  transactionDigest: digest('repair-transaction'),
  verificationPlanDigest: digest('repair-plan'),
  recordedAt: '2026-08-02T02:03:00.000Z',
});
const repairBlocked = createAgentRepairRoundReceipt({
  ...repairStartedBase,
  receiptId: 'receipt.g4-v6.vector.repair.blocked',
  repairRoundId: 'repair-round.g4-v6.vector.2',
  state: 'blocked',
  round: 2,
  blockReason: 'repair-round-exhausted',
  recordedAt: '2026-08-02T02:04:00.000Z',
});

const values = Object.freeze({
  binding,
  closure,
  satisfiedClosure,
  repairStarted,
  repairProposalBound,
  repairBlocked,
});
const factTypes = Object.freeze({
  binding: 'committed-plan-binding',
  closure: 'verification-closure-receipt',
  satisfiedClosure: 'verification-closure-receipt',
  repairStarted: 'repair-round-receipt',
  repairProposalBound: 'repair-round-receipt',
  repairBlocked: 'repair-round-receipt',
});

/** Shared TypeScript/Go/PostgreSQL V6 verification and repair vector. */
export const createG4AgentVerificationCanonicalVector = () => {
  const facts = Object.freeze(
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => [
        name,
        encodeAgentVerificationFact({ factType: factTypes[name], value }),
      ])
    )
  );
  return Object.freeze({
    format: 'prodivix.agent-verification-canonical-vector',
    version: 1,
    controlFacts: Object.freeze({
      terminal: Object.freeze({
        run: encodeAgentControlFact({
          factType: 'run-snapshot',
          value: terminalResult.state,
        }),
        event: encodeAgentControlFact({
          factType: 'run-event',
          value: terminalResult.event,
        }),
      }),
    }),
    facts,
    canonicalJson: Object.freeze(
      Object.fromEntries(
        Object.entries(facts).map(([name, fact]) => [name, canonicalJsonText(fact)])
      )
    ),
    expectedDigests: Object.freeze({
      binding: binding.bindingDigest,
      closure: closure.receiptDigest,
      satisfiedClosure: satisfiedClosure.receiptDigest,
      repairStarted: repairStarted.receiptDigest,
      repairProposalBound: repairProposalBound.receiptDigest,
      repairBlocked: repairBlocked.receiptDigest,
    }),
  });
};
