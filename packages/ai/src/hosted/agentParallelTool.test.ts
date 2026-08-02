import { describe, expect, it } from 'vitest';
import {
  V3_LATER,
  createV3Registry,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import type {
  AgentParallelToolCall,
  AgentStagedToolResult,
} from './agentHosted.types';
import {
  createAgentParallelToolPlan,
  joinAgentParallelToolResults,
} from './agentParallelTool';

const createCalls = (
  effect: 'read' | 'proposal'
): readonly AgentParallelToolCall[] => {
  const registry = createV3Registry();
  const descriptor = registry.descriptors.find(
    (candidate) => candidate.effect === effect
  )!;
  return Object.freeze(
    ['b', 'a'].map((suffix) =>
      Object.freeze({
        callId: `call.parallel.${effect}.${suffix}`,
        descriptorDigest: descriptor.descriptorDigest,
        effect,
        concurrencyPolicyDigest: descriptor.concurrencyPolicy.policyDigest,
        targetScopeDigest:
          effect === 'proposal'
            ? v3Digest('same-proposal-target')
            : v3Digest(`read-target-${suffix}`),
        ...(effect === 'read'
          ? { sourceSnapshotDigest: v3Digest(`snapshot-${suffix}`) }
          : {}),
        inputDigest: v3Digest(`input-${effect}-${suffix}`),
      })
    )
  );
};

const makePlan = (effect: 'read' | 'proposal') => {
  const result = createAgentParallelToolPlan({
    groupId: `group.parallel.${effect}`,
    taskId: 'task.g4-v3.catalog',
    runId: 'run.g4-v3.catalog',
    generation: 1,
    calls: createCalls(effect),
    maxFanOut: 4,
    registry: createV3Registry(),
  });
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return result.plan;
};

const succeeded = (
  callId: string,
  descriptorDigest: string
): AgentStagedToolResult =>
  Object.freeze({
    callId,
    descriptorDigest,
    generation: 1,
    status: 'succeeded',
    resultDigest: v3Digest(`result-${callId}`),
    completedAt: V3_LATER,
  });

describe('G4 V3 parallel Tool planning and canonical join', () => {
  it('joins independent reads deterministically regardless of arrival order', () => {
    const plan = makePlan('read');
    expect(plan.calls.map(({ callId }) => callId)).toEqual([
      'call.parallel.read.a',
      'call.parallel.read.b',
    ]);
    const results = plan.calls.map(({ callId, descriptorDigest }) =>
      succeeded(callId, descriptorDigest)
    );
    const forward = joinAgentParallelToolResults({
      plan,
      results,
      currentGeneration: 1,
    });
    const reverse = joinAgentParallelToolResults({
      plan,
      results: [...results].reverse(),
      currentGeneration: 1,
    });
    expect(forward).toEqual(reverse);
    expect(forward).toMatchObject({
      status: 'joined',
      joinedCallIds: ['call.parallel.read.a', 'call.parallel.read.b'],
      cancelledCallIds: [],
      lateCallIds: [],
    });
  });

  it('stages proposal conflicts without finalizing a partial result', () => {
    const plan = makePlan('proposal');
    const receipt = joinAgentParallelToolResults({
      plan,
      results: plan.calls.map(({ callId, descriptorDigest }) =>
        succeeded(callId, descriptorDigest)
      ),
      currentGeneration: 1,
    });
    expect(receipt).toMatchObject({
      status: 'conflicted',
      joinedCallIds: [],
      cancelledCallIds: [
        'call.parallel.proposal.a',
        'call.parallel.proposal.b',
      ],
    });
    expect(receipt).not.toHaveProperty('resultDigest');
  });

  it('fences late generations and cancels incomplete siblings', () => {
    const plan = makePlan('read');
    const first = plan.calls[0]!;
    const late = joinAgentParallelToolResults({
      plan,
      results: [
        Object.freeze({
          callId: first.callId,
          descriptorDigest: first.descriptorDigest,
          generation: 1,
          status: 'late' as const,
          completedAt: V3_LATER,
        }),
      ],
      currentGeneration: 2,
    });
    expect(late).toMatchObject({
      status: 'fenced',
      joinedCallIds: [],
      lateCallIds: [first.callId],
    });
    expect(late.cancelledCallIds).toEqual([
      plan.calls.find(({ callId }) => callId !== first.callId)!.callId,
    ]);

    const unsafe = createAgentParallelToolPlan({
      groupId: 'group.parallel.sandbox',
      taskId: 'task.g4-v3.catalog',
      runId: 'run.g4-v3.catalog',
      generation: 1,
      calls: createCalls('read').map((call) => ({
        ...call,
        sourceSnapshotDigest: undefined,
      })),
      maxFanOut: 4,
      registry: createV3Registry(),
    });
    expect(unsafe).toMatchObject({ ok: false, issues: [{ code: 'AI-7015' }] });
  });
});
