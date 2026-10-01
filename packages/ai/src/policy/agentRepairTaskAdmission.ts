import { sameCanonicalJson } from '@prodivix/shared/canonical';
import {
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
} from '../control/agentControlValidation';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type { AgentProductView } from '../product/agentProduct.types';
import {
  decodeAgentRepairTaskRequest,
  type AgentRepairTaskRequest,
} from '../verification/agentRepairTask';
import {
  decodeAgentTaskAdmissionChallenge,
  type AgentTaskAdmissionChallenge,
} from './agentTaskAdmission';

export type AgentRepairTaskAdmissionScope = Readonly<{
  projectId: string;
  workspaceId: string;
  actorId: string;
  view: Pick<
    AgentProductView,
    | 'identity'
    | 'task'
    | 'run'
    | 'cleanupState'
    | 'budgetLedger'
    | 'verificationBindings'
    | 'verificationClosures'
    | 'availableActions'
  >;
  requestId?: string;
}>;

/** Both product transports select the preserved forward failure, including after a successful rollback. */
export const createAgentRepairTaskAdmissionInput = (
  input: AgentRepairTaskAdmissionScope
): Readonly<{
  requestId: string;
  expectedParentSnapshotDigest: string;
  expectedClosureDigest: string;
}> => {
  const { view } = input;
  const closure = [...view.verificationClosures]
    .reverse()
    .find(
      (item) =>
        item.verdict !== 'satisfied' &&
        view.verificationBindings.some(
          (binding) =>
            binding.bindingId === item.bindingId &&
            binding.mutationKind === 'commit'
        )
    );
  if (
    !closure ||
    !view.availableActions.includes('repair') ||
    view.run.phase !== 'terminal' ||
    view.run.outcome !== 'failed' ||
    !['clean', 'not-required'].includes(view.cleanupState) ||
    view.task.mode !== 'apply' ||
    view.identity.projectId !== input.projectId ||
    view.identity.workspaceId !== input.workspaceId ||
    view.task.actor.kind !== 'user' ||
    view.task.actor.principalId !== input.actorId
  )
    throw new TypeError(
      'Repair requires the authenticated failed Task and its preserved Closure.'
    );
  const requestId =
    input.requestId ??
    `repair.${digestAgentCanonicalValue({ parentSnapshotDigest: view.identity.runSnapshotDigest, failedClosureDigest: closure.closureDigest }).slice(7)}`;
  if (!isAgentControlIdentity(requestId))
    throw new TypeError('Repair request identity is invalid.');
  return Object.freeze({
    requestId,
    expectedParentSnapshotDigest: view.identity.runSnapshotDigest,
    expectedClosureDigest: closure.closureDigest,
  });
};

/** Strict public response validation precedes admission polling and creates no new grant or approval. */
export const decodeAgentRepairTaskAdmission = (
  response: unknown,
  input: AgentRepairTaskAdmissionScope
): Readonly<{
  request: AgentRepairTaskRequest;
  challenge: AgentTaskAdmissionChallenge;
}> => {
  const expected = createAgentRepairTaskAdmissionInput(input);
  if (
    inspectAgentControlJson(response).length ||
    !hasExactAgentControlKeys(response, [
      'request',
      'admissionId',
      'challengeDigest',
      'status',
    ])
  )
    throw new TypeError('Repair admission response is malformed.');
  const decoded = decodeAgentRepairTaskRequest(response.request);
  const challenge = decodeAgentTaskAdmissionChallenge({
    admissionId: response.admissionId,
    challengeDigest: response.challengeDigest,
    status: response.status,
  });
  if (!decoded.ok || !challenge.ok)
    throw new TypeError('Repair admission response failed strict validation.');
  const repair = decoded.value;
  const { view } = input;
  const closure = view.verificationClosures.find(
    (item) => item.closureDigest === expected.expectedClosureDigest
  );
  if (
    !closure ||
    repair.requestId !== expected.requestId ||
    repair.parentTaskId !== view.identity.taskId ||
    repair.parentTaskDigest !== view.identity.taskDigest ||
    repair.parentRunId !== view.identity.runId ||
    repair.expectedParentSnapshotDigest !==
      expected.expectedParentSnapshotDigest ||
    repair.expectedParentLedgerDigest !== view.budgetLedger.ledgerDigest ||
    repair.failedClosureReceiptId !== closure.receiptId ||
    repair.failedClosureDigest !== closure.closureDigest ||
    repair.requestedTask.spec.projectId !== input.projectId ||
    repair.requestedTask.spec.workspaceId !== input.workspaceId ||
    !sameCanonicalJson(repair.requestedTask.spec.actor, view.task.actor) ||
    !sameCanonicalJson(
      repair.requestedTask.spec.targetScope,
      view.task.targetScope
    ) ||
    repair.requestedTask.spec.policyDigest !== view.task.policyDigest ||
    !sameCanonicalJson(
      repair.requestedTask.spec.policyRef,
      view.task.policyRef
    ) ||
    !sameCanonicalJson(
      repair.requestedTask.spec.verificationRequirement,
      view.task.verificationRequirement
    )
  )
    throw new TypeError(
      'Repair admission does not bind the inspected failure.'
    );
  return Object.freeze({ request: repair, challenge: challenge.value });
};
