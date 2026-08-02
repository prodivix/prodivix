import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { CanonicalDigest, Instant } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type {
  AgentContextTransformReceipt,
  AgentOpaqueContinuationRef,
  AgentProviderCacheReceipt,
  AgentProviderEvent,
  AgentProviderStateReceipt,
} from './agentProvider.types';
import {
  agentCacheScopeOrder as cacheScopeOrder,
  compareAgentInvocationIssues as compareIssues,
  createAgentInvocationIssue as issue,
  isValidAgentInvocationInstant as validInstant,
  type AgentInvocationIssue,
} from './agentInvocationValidation';

export const createAgentOpaqueContinuation = (
  input: Omit<AgentOpaqueContinuationRef, 'continuationDigest'>
): AgentOpaqueContinuationRef => {
  if (
    !input.continuationId.trim() ||
    !input.encryptedBlobRef.trim() ||
    !input.providerConfigurationId.trim() ||
    !input.taskId.trim() ||
    !input.runId.trim() ||
    !input.parentInvocationId.trim() ||
    !Number.isSafeInteger(input.generation) ||
    input.generation < 0 ||
    !isAgentCanonicalDigest(input.modelLineageDigest) ||
    input.purpose !== 'provider-tool-loop-continuation' ||
    !validInstant(input.createdAt) ||
    !validInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.createdAt)
  ) {
    throw new TypeError('Opaque continuation identity or lifetime is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    continuationDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentOpaqueContinuation = (
  continuation: AgentOpaqueContinuationRef,
  expected: Readonly<{
    providerConfigurationId: string;
    modelLineageDigest: CanonicalDigest;
    taskId: string;
    runId: string;
    generation: number;
    parentInvocationId: string;
    at: Instant;
  }>
): readonly AgentInvocationIssue[] => {
  const { continuationDigest: _digest, ...base } = continuation;
  const valid =
    digestAgentCanonicalValue(base) === continuation.continuationDigest &&
    validInstant(continuation.createdAt) &&
    validInstant(continuation.expiresAt) &&
    validInstant(expected.at) &&
    Date.parse(continuation.expiresAt) > Date.parse(continuation.createdAt) &&
    continuation.providerConfigurationId === expected.providerConfigurationId &&
    continuation.modelLineageDigest === expected.modelLineageDigest &&
    continuation.taskId === expected.taskId &&
    continuation.runId === expected.runId &&
    continuation.generation === expected.generation &&
    continuation.parentInvocationId === expected.parentInvocationId &&
    Date.parse(expected.at) >= Date.parse(continuation.createdAt) &&
    Date.parse(expected.at) < Date.parse(continuation.expiresAt);
  return valid
    ? Object.freeze([])
    : Object.freeze([
        issue(
          'AI-6011',
          '/continuation',
          'Opaque continuation cannot cross provider/model/Task/Run/generation/parent boundaries.'
        ),
      ]);
};

export const createAgentContextTransformReceipt = (
  input: Omit<AgentContextTransformReceipt, 'receiptDigest'>
): AgentContextTransformReceipt => {
  const retainedItemDigests = input.retainedItemDigests ?? [];
  const omittedItemDigests =
    input.omittedOrCompacted?.map(({ itemDigest }) => itemDigest) ?? [];
  if (
    !input.invocationId.trim() ||
    !isAgentCanonicalDigest(input.submittedContextPackDigest) ||
    (input.transformConfigurationDigest !== undefined &&
      !isAgentCanonicalDigest(input.transformConfigurationDigest)) ||
    (input.effectiveContextDigest !== undefined &&
      !isAgentCanonicalDigest(input.effectiveContextDigest)) ||
    [...retainedItemDigests, ...omittedItemDigests].some(
      (digest) => !isAgentCanonicalDigest(digest)
    ) ||
    new Set(retainedItemDigests).size !== retainedItemDigests.length ||
    new Set(omittedItemDigests).size !== omittedItemDigests.length ||
    retainedItemDigests.some((digest) => omittedItemDigests.includes(digest))
  ) {
    throw new TypeError(
      'Provider Context transformation identity or item partition is invalid.'
    );
  }
  if (input.transformMode === 'none') {
    if (
      input.confidence !== 'verified' ||
      input.effectiveContextDigest !== input.submittedContextPackDigest ||
      (input.omittedOrCompacted?.length ?? 0) > 0 ||
      input.transformConfigurationDigest !== undefined
    ) {
      throw new TypeError(
        'No-transform receipt must verify the submitted Context exactly.'
      );
    }
  } else if (
    input.confidence === 'unknown' ||
    !input.effectiveContextDigest ||
    input.omittedOrCompacted?.some(({ reason }) => reason === 'unknown')
  ) {
    throw new TypeError('Provider Context transformation must be explainable.');
  }
  const base = Object.freeze({
    ...input,
    ...(input.retainedItemDigests
      ? {
          retainedItemDigests: Object.freeze(
            [...input.retainedItemDigests].sort(compareUnicodeCodePoints)
          ),
        }
      : {}),
    ...(input.omittedOrCompacted
      ? {
          omittedOrCompacted: Object.freeze(
            [...input.omittedOrCompacted].sort((left, right) =>
              compareUnicodeCodePoints(left.itemDigest, right.itemDigest)
            )
          ),
        }
      : {}),
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderCacheReceipt = (
  input: Readonly<{
    receipt: Omit<
      AgentProviderCacheReceipt,
      'receiptDigest' | 'provenIsolation'
    >;
    isolation: 'invocation' | 'task' | 'workspace' | 'cross-tenant' | 'unknown';
  }>
): AgentProviderCacheReceipt => {
  const hasCreatedAt = input.receipt.createdAt !== undefined;
  const hasExpiresAt = input.receipt.expiresAt !== undefined;
  if (
    input.receipt.cacheMode === 'disabled' ||
    input.isolation === 'cross-tenant' ||
    input.isolation === 'unknown' ||
    !Object.hasOwn(cacheScopeOrder, input.receipt.cacheScope) ||
    !Object.hasOwn(cacheScopeOrder, input.isolation) ||
    cacheScopeOrder[input.receipt.cacheScope] >
      cacheScopeOrder[input.isolation as keyof typeof cacheScopeOrder] ||
    !input.receipt.usageRef.trim() ||
    (input.receipt.providerRegion !== undefined &&
      !input.receipt.providerRegion.trim()) ||
    (input.receipt.cacheKeyDigest !== undefined &&
      !isAgentCanonicalDigest(input.receipt.cacheKeyDigest)) ||
    input.receipt.prefixOrItemDigests.some(
      (digest) => !isAgentCanonicalDigest(digest)
    ) ||
    new Set(input.receipt.prefixOrItemDigests).size !==
      input.receipt.prefixOrItemDigests.length ||
    (input.receipt.cacheKeyDigest === undefined &&
      input.receipt.prefixOrItemDigests.length === 0) ||
    hasCreatedAt !== hasExpiresAt ||
    (hasCreatedAt &&
      (!validInstant(input.receipt.createdAt!) ||
        !validInstant(input.receipt.expiresAt!) ||
        Date.parse(input.receipt.expiresAt!) <=
          Date.parse(input.receipt.createdAt!)))
  ) {
    throw new TypeError('Provider cache scope exceeds its proven isolation.');
  }
  const base = Object.freeze({
    ...input.receipt,
    provenIsolation: input.isolation,
    prefixOrItemDigests: Object.freeze(
      [...input.receipt.prefixOrItemDigests].sort(compareUnicodeCodePoints)
    ),
  });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderStateReceipt = (
  input: Omit<AgentProviderStateReceipt, 'receiptDigest'>
): AgentProviderStateReceipt => {
  const isStateless = input.stateMode === 'stateless';
  if (
    input.ambientMemory !== 'disabled' ||
    !Number.isSafeInteger(input.retentionDays) ||
    input.retentionDays < 0 ||
    (input.providerRegion !== undefined && !input.providerRegion.trim()) ||
    (input.deletionReceiptRef !== undefined &&
      !input.deletionReceiptRef.trim()) ||
    (isStateless &&
      (input.storage !== 'disabled' || input.retentionDays !== 0)) ||
    (!isStateless &&
      input.storage !== 'task-scoped' &&
      input.storage !== 'workspace-scoped')
  ) {
    throw new TypeError(
      'Provider state receipt violates stateless/ambient-memory policy.'
    );
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentProviderEvent = (
  event: Omit<AgentProviderEvent, 'eventDigest'>
): AgentProviderEvent => {
  if (
    !event.eventId.trim() ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence < 0 ||
    !isAgentCanonicalDigest(event.payloadDigest) ||
    !validInstant(event.occurredAt)
  ) {
    throw new TypeError('Normalized provider event is invalid.');
  }
  const base = Object.freeze({ ...event });
  return Object.freeze({
    ...base,
    eventDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentProviderEventSequence = (
  invocationId: string,
  events: readonly AgentProviderEvent[]
): readonly AgentInvocationIssue[] => {
  const issues: AgentInvocationIssue[] = [];
  let terminalSeen = false;
  let previousOccurredAt = Number.NEGATIVE_INFINITY;
  const eventIds = new Set<string>();
  for (const [index, event] of events.entries()) {
    const { eventDigest: _digest, ...base } = event;
    const occurredAt = Date.parse(event.occurredAt);
    if (
      event.invocationId !== invocationId ||
      event.sequence !== index ||
      digestAgentCanonicalValue(base) !== event.eventDigest ||
      !event.eventId.trim() ||
      eventIds.has(event.eventId) ||
      !Number.isFinite(occurredAt) ||
      occurredAt < previousOccurredAt
    ) {
      issues.push(
        issue(
          'AI-6011',
          `/events/${index}`,
          'Provider event identity, order, time, uniqueness, or digest is invalid.'
        )
      );
    }
    eventIds.add(event.eventId);
    previousOccurredAt = occurredAt;
    if (terminalSeen) {
      issues.push(
        issue(
          'AI-6011',
          `/events/${index}`,
          'Provider emitted an event after terminal finalization.'
        )
      );
    }
    if (
      event.type === 'completed' ||
      event.type === 'failed' ||
      event.type === 'refusal' ||
      event.type === 'safety-block' ||
      event.type === 'truncation' ||
      event.type === 'cancelled' ||
      event.type === 'timed-out' ||
      event.type === 'partial'
    ) {
      terminalSeen = true;
    }
  }
  if (!terminalSeen) {
    issues.push(
      issue(
        'AI-6011',
        '/events',
        'Provider event sequence has no terminal event.'
      )
    );
  }
  return Object.freeze(issues.sort(compareIssues));
};
