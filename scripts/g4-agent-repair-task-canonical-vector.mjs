import {
  createAgentRepairTaskRequest, createAgentVerificationClosureReceipt, encodeAgentControlFact,
  encodeAgentRepairTaskRequest, encodeAgentVerificationFact, encodeAgentPolicy,
  finalizeAgentRun, digestAgentCanonicalValue,
} from '../packages/ai/src/index.ts';
import { createVerificationEvidenceVerifiedView, encodeVerificationClosure, encodeVerificationPlan, evaluateVerificationClosure } from '../packages/verification/src/index.ts';
import { deriveWorkspaceAgentRepairCounterexamples } from '../packages/workspace-sync/src/index.ts';
import { GOLDEN_G4_V5_TASK, GOLDEN_G4_V5_POLICY } from '../packages/golden-conformance/src/goldenG4V5ProposalApprovalFixture.ts';
import { GOLDEN_G4_V6_FAILED_FLOW, GOLDEN_G4_V6_REPAIRING_RUN } from '../packages/golden-conformance/src/goldenG4V6VerificationRepairFixture.ts';

/** Missing required Evidence is a real owner-produced unsatisfied Closure; this vector is not release evidence. */
export const createG4AgentRepairTaskCanonicalVector = () => {
  const flow = GOLDEN_G4_V6_FAILED_FLOW;
  const at = '2026-08-01T12:04:00.000Z';
  const view = createVerificationEvidenceVerifiedView({ closureEvaluationInstant: at, revocationRecordDigest: digestAgentCanonicalValue([]), records: [] });
  const result = evaluateVerificationClosure({ ...flow.closureInput, evidence: [], verifiedEvidenceView: view, revocationRecordDigest: view.revocationRecordDigest });
  if (result.status !== 'ready') throw new TypeError('Public repair vector Closure is invalid.');
  const closure = result.closure;
  const { receiptDigest: _receiptDigest, ...priorReceipt } = flow.closureReceipt;
  const receipt = createAgentVerificationClosureReceipt({ ...priorReceipt, evidenceRefs: [], evidenceSetDigest: closure.evidenceSetDigest,
    verifiedEvidenceViewDigest: view.viewDigest, closureDigest: closure.closureDigest, verdict: closure.verdict });
  const counterexamples = deriveWorkspaceAgentRepairCounterexamples({ plan: flow.plan, closure, evidence: [] });
  if (counterexamples.status !== 'ready') throw new TypeError('Public repair vector counterexamples are missing.');
  const finalized = finalizeAgentRun(GOLDEN_G4_V5_TASK, GOLDEN_G4_V6_REPAIRING_RUN, {
    eventId: 'event.repair.parent.failed', idempotencyKey: 'event.repair.parent.failed', occurredAt: at,
    producer: { kind: 'service', principalId: 'agent.runtime' }, outcome: 'failed',
  });
  if (!finalized.accepted) throw new TypeError(finalized.issues.map(({ message }) => message).join(';'));
  const usageFacts = { acknowledgedCommits: 1, promotedArtifactBytes: 0, openedRepairRounds: 0 };
  const request = createAgentRepairTaskRequest({ requestId: 'request.repair.vector', parentTask: GOLDEN_G4_V5_TASK, parentRun: finalized.state,
    failedClosureReceipt: receipt, counterexamples: counterexamples.value, currentRevision: receipt.targetRevision, usageFacts, requestedAt: '2026-08-01T12:04:01.000Z' });
  return { parentTask: encodeAgentControlFact({ factType: 'task-record', value: GOLDEN_G4_V5_TASK }),
    parentRun: encodeAgentControlFact({ factType: 'run-snapshot', value: finalized.state }), plan: encodeVerificationPlan(flow.plan), closure: encodeVerificationClosure(closure),
    closureReceipt: encodeAgentVerificationFact({ factType: 'verification-closure-receipt', value: receipt }), evidence: [], counterexamples: counterexamples.value,
    request: encodeAgentRepairTaskRequest(request), usageFacts, policy: encodeAgentPolicy(GOLDEN_G4_V5_POLICY) };
};
