import {
  createAgentApprovalDecision,
  createAgentRunControl,
  createAgentTaskRecord,
  createDefaultAgentPolicy,
  digestAgentPolicy,
  encodeAgentControlFact,
  encodeAgentPolicy,
  encodeAgentProposalFact,
  startAgentRun,
  transitionAgentRunPhase,
  finalizeAgentRun,
} from '../packages/ai/src/index.ts';
import { createG4AgentProposalCanonicalVector } from './g4-agent-proposal-canonical-vector.mjs';

/** Public owner facts for ordinary repair service tests; no real-model qualification or execution evidence. */
export const createG4AgentRuntimeRepairCanonicalVector = () => {
  const original = createG4AgentProposalCanonicalVector();
  const originalTask = original.controlFacts.task.value;
  const budget = { ...originalTask.spec.budget, maxElapsedMs: 3_600_000 };
  const policy = {
    ...createDefaultAgentPolicy(
      originalTask.spec.policyRef.documentId,
      'Runtime repair integration policy'
    ),
    budgetCeiling: budget,
  };
  const task = createAgentTaskRecord({
    ...originalTask.spec,
    policyDigest: digestAgentPolicy(policy),
    budget,
  });
  const producer = { kind: 'service', principalId: 'agent.coordinator.g4-v5' };
  const accepted = (result) => {
    if (!result.accepted)
      throw new TypeError(
        result.issues.map(({ message }) => message).join('; ')
      );
    return result;
  };
  const command = (index) => {
    const event = original.controlFacts.sequence[index].event.value;
    return {
      eventId: event.eventId,
      idempotencyKey: event.idempotencyKey,
      occurredAt: event.occurredAt,
      producer,
    };
  };
  let current = accepted(
    createAgentRunControl(task, {
      runId: original.controlFacts.sequence[0].run.value.run.runId,
      command: command(0),
    })
  );
  const sequence = [
    {
      name: original.controlFacts.sequence[0].name,
      run: encodeAgentControlFact({
        factType: 'run-snapshot',
        value: current.state,
      }),
      event: encodeAgentControlFact({
        factType: 'run-event',
        value: current.event,
      }),
    },
  ];
  for (let index = 1; index < original.controlFacts.sequence.length; index++) {
    current =
      index === 1
        ? accepted(
            startAgentRun(task, current.state, {
              ...command(index),
              attemptId: 'attempt.g4-v5.vector.1',
            })
          )
        : accepted(
            transitionAgentRunPhase(task, current.state, {
              ...command(index),
              phase: original.controlFacts.sequence[index].run.value.run.phase,
            })
          );
    sequence.push({
      name: original.controlFacts.sequence[index].name,
      run: encodeAgentControlFact({
        factType: 'run-snapshot',
        value: current.state,
      }),
      event: encodeAgentControlFact({
        factType: 'run-event',
        value: current.event,
      }),
    });
  }
  const approval = createAgentApprovalDecision({
    ...original.facts.approval.value,
    policyDigest: task.spec.policyDigest,
  });
  const failed = accepted(
    finalizeAgentRun(task, current.state, {
      eventId: 'event.runtime.repair.failed',
      idempotencyKey: 'event.runtime.repair.failed',
      occurredAt: '2026-08-01T09:00:00.300Z',
      producer,
      outcome: 'failed',
    })
  );
  return {
    policy: encodeAgentPolicy(policy),
    task: encodeAgentControlFact({ factType: 'task-record', value: task }),
    sequence,
    terminal: {
      run: encodeAgentControlFact({
        factType: 'run-snapshot',
        value: failed.state,
      }),
      event: encodeAgentControlFact({
        factType: 'run-event',
        value: failed.event,
      }),
    },
    approval: encodeAgentProposalFact(original.registry, {
      factType: 'approval',
      value: approval,
    }),
  };
};
