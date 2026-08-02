import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { AgentToolRegistrySnapshot } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentHostedCapabilityIssue,
  AgentParallelToolCall,
  AgentParallelToolJoinReceipt,
  AgentParallelToolPlan,
  AgentStagedToolResult,
} from './agentHosted.types';
import { validateAgentToolRegistrySnapshot } from './agentToolRegistry';

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;

const compareCalls = (
  left: AgentParallelToolCall,
  right: AgentParallelToolCall
): number =>
  compareUnicodeCodePoints(left.descriptorDigest, right.descriptorDigest) ||
  compareUnicodeCodePoints(left.callId, right.callId);

const fail = (
  path: string,
  message: string
): Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> =>
  Object.freeze({
    ok: false,
    issues: Object.freeze([
      Object.freeze({
        code: 'AI-7015' as const,
        path,
        message,
        blocking: true as const,
      }),
    ]),
  });

export const createAgentParallelToolPlan = (
  input: Readonly<{
    groupId: string;
    taskId: string;
    runId: string;
    generation: number;
    calls: readonly AgentParallelToolCall[];
    maxFanOut: number;
    registry: AgentToolRegistrySnapshot;
  }>
):
  | Readonly<{ ok: true; plan: AgentParallelToolPlan }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> => {
  if (
    !identityPattern.test(input.groupId) ||
    !identityPattern.test(input.taskId) ||
    !identityPattern.test(input.runId) ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !Number.isSafeInteger(input.maxFanOut) ||
    input.maxFanOut < 1 ||
    !validateAgentToolRegistrySnapshot(input.registry)
  ) {
    return fail('/plan', 'Parallel Tool plan identity or registry is invalid.');
  }
  if (
    input.calls.length < 2 ||
    input.calls.length > input.maxFanOut ||
    new Set(input.calls.map(({ callId }) => callId)).size !== input.calls.length
  ) {
    return fail('/calls', 'Parallel Tool fan-out is invalid or duplicated.');
  }
  const descriptors = new Map(
    input.registry.descriptors.map((descriptor) => [
      descriptor.descriptorDigest,
      descriptor,
    ])
  );
  for (const [index, call] of input.calls.entries()) {
    const descriptor = descriptors.get(call.descriptorDigest);
    if (
      !identityPattern.test(call.callId) ||
      !descriptor ||
      descriptor.effect !== call.effect ||
      descriptor.concurrencyPolicy.policyDigest !==
        call.concurrencyPolicyDigest ||
      descriptor.concurrencyPolicy.execution === 'serial' ||
      descriptor.concurrencyPolicy.maxFanOut < input.maxFanOut ||
      descriptor.concurrencyPolicy.maxTotalCalls < input.calls.length ||
      descriptor.effect === 'external-side-effect' ||
      !isAgentCanonicalDigest(call.targetScopeDigest) ||
      !isAgentCanonicalDigest(call.inputDigest) ||
      (descriptor.effect === 'read' &&
        !isAgentCanonicalDigest(call.sourceSnapshotDigest))
    ) {
      return fail(
        `/calls/${index}`,
        'Parallel call lacks an exact safe descriptor, source snapshot, or owner proof.'
      );
    }
  }
  const calls = Object.freeze([...input.calls].sort(compareCalls));
  const base = {
    groupId: input.groupId,
    taskId: input.taskId,
    runId: input.runId,
    generation: input.generation,
    calls,
    maxFanOut: input.maxFanOut,
  } as const;
  return Object.freeze({
    ok: true,
    plan: Object.freeze({
      ...base,
      planDigest: digestAgentCanonicalValue(base),
    }),
  });
};

const canonicalCallIds = (values: readonly string[]): readonly string[] =>
  Object.freeze([...values].sort(compareUnicodeCodePoints));

export const joinAgentParallelToolResults = (
  input: Readonly<{
    plan: AgentParallelToolPlan;
    results: readonly AgentStagedToolResult[];
    currentGeneration: number;
  }>
): AgentParallelToolJoinReceipt => {
  const { planDigest: _digest, ...planBase } = input.plan;
  if (
    digestAgentCanonicalValue(planBase) !== input.plan.planDigest ||
    new Set(input.results.map(({ callId }) => callId)).size !==
      input.results.length
  ) {
    throw new TypeError(
      'Parallel Tool plan or results are duplicated or drifted.'
    );
  }
  const planned = new Map(input.plan.calls.map((call) => [call.callId, call]));
  if (
    input.results.some(
      (result) =>
        !planned.has(result.callId) ||
        planned.get(result.callId)!.descriptorDigest !==
          result.descriptorDigest ||
        !Number.isFinite(Date.parse(result.completedAt)) ||
        !Number.isSafeInteger(result.generation) ||
        result.generation < 0 ||
        !['succeeded', 'failed', 'cancelled', 'late'].includes(result.status) ||
        (result.status === 'succeeded') !==
          (result.resultDigest !== undefined) ||
        (result.resultDigest !== undefined &&
          !isAgentCanonicalDigest(result.resultDigest))
    )
  ) {
    throw new TypeError('Parallel Tool result is invalid or outside its plan.');
  }
  const byCall = new Map(
    input.results.map((result) => [result.callId, result])
  );
  const generationFenced =
    input.currentGeneration !== input.plan.generation ||
    input.results.some(
      (result) =>
        result.generation !== input.plan.generation || result.status === 'late'
    );
  const lateCallIds = canonicalCallIds(
    input.results
      .filter(
        (result) =>
          result.status === 'late' ||
          result.generation !== input.plan.generation ||
          input.currentGeneration !== input.plan.generation
      )
      .map(({ callId }) => callId)
  );
  const incomplete = input.plan.calls.some((call) => !byCall.has(call.callId));
  const failed = input.results.some(
    ({ status }) => status === 'failed' || status === 'cancelled'
  );
  const proposalTargetCounts = new Map<string, number>();
  for (const call of input.plan.calls) {
    if (call.effect !== 'proposal') continue;
    proposalTargetCounts.set(
      call.targetScopeDigest,
      (proposalTargetCounts.get(call.targetScopeDigest) ?? 0) + 1
    );
  }
  const conflicted = [...proposalTargetCounts.values()].some(
    (count) => count > 1
  );
  const status: AgentParallelToolJoinReceipt['status'] = generationFenced
    ? 'fenced'
    : conflicted
      ? 'conflicted'
      : incomplete || failed
        ? 'incomplete'
        : 'joined';
  const joinedCallIds = canonicalCallIds(
    status === 'joined'
      ? input.results
          .filter(({ status: resultStatus }) => resultStatus === 'succeeded')
          .map(({ callId }) => callId)
      : []
  );
  const cancelledCallIds = canonicalCallIds(
    status === 'joined'
      ? []
      : input.plan.calls
          .filter((call) => !lateCallIds.includes(call.callId))
          .map(({ callId }) => callId)
  );
  const joinedResultDigest =
    status === 'joined'
      ? digestAgentCanonicalValue(
          input.plan.calls.map((call) => ({
            callId: call.callId,
            resultDigest: byCall.get(call.callId)!.resultDigest!,
          }))
        )
      : undefined;
  const base = {
    groupId: input.plan.groupId,
    planDigest: input.plan.planDigest,
    generation: input.plan.generation,
    joinedCallIds,
    cancelledCallIds,
    lateCallIds,
    status,
    ...(joinedResultDigest ? { resultDigest: joinedResultDigest } : {}),
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};
