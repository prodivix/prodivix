import {
  cloneAgentControlJson,
  decodeAgentControlFact,
  decodeAgentVerificationFact,
  encodeAgentControlFact,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentTaskRecord,
  isAgentVerificationClosureReceipt,
  type AgentJsonValue,
  type AgentRepairCounterexampleSet,
  type AgentTaskRecord,
  type AgentVerificationClosureReceipt,
} from '@prodivix/ai';
import {
  decodeVerificationClosure,
  decodeVerificationEvidenceManifest,
  decodeVerificationPlan,
  encodeVerificationClosure,
  encodeVerificationPlan,
  isVerificationClosureForPlan,
  projectVerificationEvidenceManifest,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationPlan,
} from '@prodivix/verification';
import type { WorkspaceAgentVerificationContext } from '@prodivix/workspace';
import { deriveWorkspaceAgentRepairCounterexamples } from './workspaceAgentVerificationCoordinator';

export type WorkspaceAgentRepairFailure = Readonly<{
  parentTask: AgentTaskRecord;
  plan: VerificationPlan;
  closure: VerificationClosure;
  closureReceipt: AgentVerificationClosureReceipt;
  evidence: readonly VerificationEvidence[];
  counterexamples: AgentRepairCounterexampleSet;
}>;

/** Combines existing owner facts; it does not promote candidate reports into Evidence. */
export const createWorkspaceAgentRepairFailure = (
  input: Omit<WorkspaceAgentRepairFailure, 'counterexamples'>
): WorkspaceAgentRepairFailure => {
  const { parentTask, plan, closure, closureReceipt, evidence } = input;
  const decodedPlan = decodeVerificationPlan(encodeVerificationPlan(plan));
  const decodedClosure = decodeVerificationClosure(
    encodeVerificationClosure(closure)
  );
  if (
    !isAgentTaskRecord(parentTask) ||
    parentTask.spec.mode !== 'apply' ||
    !decodedPlan.ok ||
    !decodedClosure.ok ||
    !isAgentVerificationClosureReceipt(closureReceipt) ||
    !isVerificationClosureForPlan(closure, plan) ||
    closure.verdict === 'satisfied' ||
    closureReceipt.taskId !== parentTask.spec.taskId ||
    closureReceipt.closureDigest !== closure.closureDigest ||
    closureReceipt.planDigest !== plan.planDigest ||
    closureReceipt.verdict !== closure.verdict ||
    plan.workspaceId !== parentTask.spec.workspaceId ||
    inspectAgentControlJson(input, 16_777_216).length ||
    new Set(evidence.map(({ id }) => id)).size !== evidence.length ||
    evidence.length !== closureReceipt.evidenceRefs.length ||
    evidence.some(
      (entry) =>
        !closureReceipt.evidenceRefs.some(
          (ref) =>
            ref.evidenceId === entry.id &&
            ref.manifestDigest === entry.manifestDigest &&
            ref.outcome === entry.result.outcome
        )
    )
  )
    throw new TypeError(
      'Repair failure does not bind the public parent Plan, Closure and Evidence.'
    );
  const counterexamples = deriveWorkspaceAgentRepairCounterexamples({
    plan,
    closure,
    evidence,
  });
  if (counterexamples.status !== 'ready')
    throw new TypeError('Repair failure has no required counterexample.');
  return Object.freeze(
    cloneAgentControlJson({ ...input, counterexamples: counterexamples.value })
  );
};

/** Every nested wire is decoded by its existing public owner before failure grounding. */
export const decodeWorkspaceAgentRepairFailure = (
  wire: unknown
): WorkspaceAgentRepairFailure => {
  if (
    inspectAgentControlJson(wire, 16_777_216).length ||
    !hasExactAgentControlKeys(wire, [
      'parentTask',
      'plan',
      'closure',
      'closureReceipt',
      'evidence',
    ]) ||
    !Array.isArray(wire.evidence) ||
    wire.evidence.length > 1_024
  )
    throw new TypeError('Repair failure response is invalid.');
  const task = decodeAgentControlFact(wire.parentTask);
  const plan = decodeVerificationPlan(wire.plan);
  const closure = decodeVerificationClosure(wire.closure);
  const receipt = decodeAgentVerificationFact(wire.closureReceipt);
  if (
    !task.ok ||
    task.value.factType !== 'task-record' ||
    !plan.ok ||
    !closure.ok ||
    !receipt.ok ||
    receipt.value.factType !== 'verification-closure-receipt'
  )
    throw new TypeError('Repair failure owner wire is invalid.');
  const evidence = wire.evidence.map((raw) => {
    const manifest = decodeVerificationEvidenceManifest(raw);
    if (!manifest.ok)
      throw new TypeError('Repair failure Evidence manifest is invalid.');
    return projectVerificationEvidenceManifest(manifest.value);
  });
  return createWorkspaceAgentRepairFailure({
    parentTask: task.value.value,
    plan: plan.value,
    closure: closure.value,
    closureReceipt: receipt.value.value,
    evidence,
  });
};

/** The original requirement and precise counterexamples reach the provider as bounded data-only material. */
export const createWorkspaceAgentRepairContext = (
  failure: WorkspaceAgentRepairFailure
): readonly WorkspaceAgentVerificationContext[] => {
  const checked = createWorkspaceAgentRepairFailure(failure);
  const targetIds = checked.parentTask.spec.targetScope.targets.map(
    ({ id }) => id
  );
  const sourceTraceRef = checked.closure.closureDigest;
  const record = (
    ref: string,
    kind: WorkspaceAgentVerificationContext['kind'],
    digest: string,
    summary: unknown
  ): WorkspaceAgentVerificationContext =>
    Object.freeze({
      ref,
      kind,
      digest,
      summary: cloneAgentControlJson(summary) as AgentJsonValue,
      sourceTraceRef,
      targetIds,
    });
  return Object.freeze([
    record(
      checked.parentTask.spec.taskId,
      'verification-plan',
      checked.parentTask.taskDigest,
      {
        parentTask: encodeAgentControlFact({
          factType: 'task-record',
          value: checked.parentTask,
        }),
        counterexamples: checked.counterexamples,
      }
    ),
    record(
      `plan.${checked.plan.planDigest.slice(7)}`,
      'verification-plan',
      checked.plan.planDigest,
      encodeVerificationPlan(checked.plan)
    ),
    record(
      checked.closureReceipt.receiptId,
      'verification-closure',
      checked.closure.closureDigest,
      encodeVerificationClosure(checked.closure)
    ),
    ...checked.evidence.map((entry) =>
      record(entry.id, 'verification-evidence', entry.manifestDigest, entry)
    ),
  ]);
};
