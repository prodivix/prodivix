import { sameCanonicalJson } from '@prodivix/shared/canonical';
import type {
  AgentProviderSupportTier,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentUsageVector,
  normalizeAgentCosts,
} from '../usage/agentUsage';
import type {
  AgentContextTransformReceipt,
  AgentCost,
  AgentInvocationPlan,
  AgentModelInvocationReceipt,
  AgentProviderCacheReceipt,
  AgentProviderEvent,
  AgentProviderJobReceipt,
  AgentProviderStateReceipt,
  AgentUsageVector,
} from './agentProvider.types';
import {
  createAgentContextTransformReceipt,
  createAgentProviderCacheReceipt,
  createAgentProviderStateReceipt,
  validateAgentProviderEventSequence,
} from './agentInvocationFacts';
import { preflightAgentInvocation } from './agentInvocationPreflight';
import {
  agentCacheScopeOrder as cacheScopeOrder,
  compareAgentInvocationIssues as compareIssues,
  createAgentInvocationIssue as issue,
  isValidAgentInvocationInstant as validInstant,
  type AgentInvocationIssue,
  type AgentInvocationReceiptResult,
} from './agentInvocationValidation';

export const finalizeAgentModelInvocation = (
  input: Readonly<{
    plan: AgentInvocationPlan;
    preflightAt: Instant;
    minimumSupportTier?: Exclude<AgentProviderSupportTier, 'disabled'>;
    events: readonly AgentProviderEvent[];
    outcome: AgentModelInvocationReceipt['outcome'];
    responseDigest?: CanonicalDigest;
    usage: AgentUsageVector;
    costStatus: AgentModelInvocationReceipt['costStatus'];
    cost: readonly AgentCost[];
    pricingSnapshotRef?: string;
    contextTransformReceipt?: AgentContextTransformReceipt;
    cacheReceipt?: AgentProviderCacheReceipt;
    providerStateReceipt?: AgentProviderStateReceipt;
    providerJobReceipt?: AgentProviderJobReceipt;
    completedAt: Instant;
  }>
): AgentInvocationReceiptResult => {
  const preflight = preflightAgentInvocation(input.plan, {
    at: input.preflightAt,
    ...(input.minimumSupportTier
      ? { minimumSupportTier: input.minimumSupportTier }
      : {}),
  });
  const issues: AgentInvocationIssue[] = preflight.ok
    ? []
    : [...preflight.issues];
  let normalizedCosts: readonly AgentCost[] = [];
  try {
    normalizedCosts = normalizeAgentCosts(input.cost);
  } catch {
    issues.push(issue('AI-6013', '/cost', 'Invocation cost is invalid.'));
  }
  if (
    (input.costStatus === 'priced' &&
      (normalizedCosts.length === 0 ||
        normalizedCosts.some(({ amount }) => amount === undefined))) ||
    (input.costStatus === 'not-applicable' && normalizedCosts.length > 0)
  ) {
    issues.push(
      issue(
        'AI-6013',
        '/costStatus',
        'Invocation cost status does not match its priced/unknown cost vector.'
      )
    );
  }
  issues.push(
    ...validateAgentProviderEventSequence(input.plan.invocationId, input.events)
  );
  const terminalType = input.events.at(-1)?.type;
  const outcomeMatchesTerminal =
    (terminalType === 'completed' && input.outcome === 'completed') ||
    (terminalType === 'refusal' && input.outcome === 'refused') ||
    (terminalType === 'safety-block' && input.outcome === 'safety-blocked') ||
    (terminalType === 'truncation' && input.outcome === 'truncated') ||
    (terminalType === 'failed' &&
      (input.outcome === 'provider-error' ||
        input.outcome === 'schema-failed')) ||
    (terminalType === 'cancelled' && input.outcome === 'cancelled') ||
    (terminalType === 'timed-out' && input.outcome === 'timed-out') ||
    (terminalType === 'partial' && input.outcome === 'partial');
  if (!outcomeMatchesTerminal) {
    issues.push(
      issue(
        'AI-6011',
        '/outcome',
        'Invocation outcome does not match its normalized terminal event.'
      )
    );
  }
  if (
    !validInstant(input.completedAt) ||
    Date.parse(input.completedAt) < Date.parse(input.plan.startedAt)
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/completedAt',
        'Invocation completion instant is invalid.'
      )
    );
  }
  if (
    input.events.some(
      ({ occurredAt }) =>
        !validInstant(occurredAt) ||
        Date.parse(occurredAt) < Date.parse(input.plan.startedAt) ||
        Date.parse(occurredAt) > Date.parse(input.completedAt)
    )
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/events',
        'Provider event time falls outside the invocation lifetime.'
      )
    );
  }
  let usageIsCanonical = false;
  try {
    usageIsCanonical = sameCanonicalJson(
      createAgentUsageVector(input.usage.amounts),
      input.usage
    );
  } catch {
    usageIsCanonical = false;
  }
  if (!usageIsCanonical || input.usage.amounts.length === 0) {
    issues.push(
      issue(
        'AI-6013',
        '/usage',
        'Invocation usage must be non-empty and canonically receipted; unknown is not zero.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.contextMutationMode !== 'none' &&
    (!input.contextTransformReceipt ||
      input.contextTransformReceipt.confidence === 'unknown')
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/contextTransformReceipt',
        'Provider Context mutation requires an explainable effective-context receipt.'
      )
    );
  }
  if (
    input.contextTransformReceipt &&
    (input.contextTransformReceipt.invocationId !== input.plan.invocationId ||
      input.contextTransformReceipt.submittedContextPackDigest !==
        input.plan.contextPack.manifestDigest ||
      input.contextTransformReceipt.transformMode !==
        input.plan.inferenceConfiguration.contextMutationMode)
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/contextTransformReceipt',
        'Context transform receipt does not bind this invocation and Context Pack.'
      )
    );
  }
  const submittedItemDigests = new Set(
    input.plan.contextPack.items.map(({ contentDigest }) => contentDigest)
  );
  if (
    input.contextTransformReceipt &&
    [
      ...(input.contextTransformReceipt.retainedItemDigests ?? []),
      ...(input.contextTransformReceipt.omittedOrCompacted?.map(
        ({ itemDigest }) => itemDigest
      ) ?? []),
    ].some((digest) => !submittedItemDigests.has(digest))
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/contextTransformReceipt/items',
        'Context transform receipt references an item outside the submitted Context Pack.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.cacheMode !== 'disabled' &&
    !input.cacheReceipt
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/cacheReceipt',
        'Enabled provider cache requires a receipt.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.cacheMode === 'disabled' &&
    input.cacheReceipt
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/cacheReceipt',
        'Disabled provider cache cannot emit a cache receipt.'
      )
    );
  }
  if (
    input.cacheReceipt &&
    (input.cacheReceipt.cacheMode !==
      input.plan.inferenceConfiguration.cacheMode ||
      input.cacheReceipt.provenIsolation !==
        input.plan.providerDataPolicy.cacheIsolation ||
      !Object.hasOwn(cacheScopeOrder, input.cacheReceipt.cacheScope) ||
      !Object.hasOwn(cacheScopeOrder, input.cacheReceipt.provenIsolation) ||
      cacheScopeOrder[input.cacheReceipt.cacheScope] >
        cacheScopeOrder[input.cacheReceipt.provenIsolation] ||
      (input.cacheReceipt.providerRegion !== undefined &&
        input.cacheReceipt.providerRegion !==
          (input.plan.providerDataPolicy.region ??
            input.plan.provider.providerRegion)))
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/cacheReceipt/provenIsolation',
        'Provider cache receipt does not match the admitted mode, region, or isolation boundary.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.providerStateMode !== 'stateless' &&
    !input.providerStateReceipt
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerStateReceipt',
        'Provider state requires a receipt.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.providerStateMode === 'stateless' &&
    input.providerStateReceipt
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerStateReceipt',
        'Stateless invocation cannot claim provider-side state.'
      )
    );
  }
  if (
    input.providerStateReceipt &&
    (input.providerStateReceipt.stateMode !==
      input.plan.inferenceConfiguration.providerStateMode ||
      input.providerStateReceipt.storage !==
        input.plan.providerDataPolicy.storage ||
      input.providerStateReceipt.ambientMemory !==
        input.plan.providerDataPolicy.ambientMemory ||
      input.providerStateReceipt.retentionDays >
        input.plan.providerDataPolicy.retentionDays ||
      (input.providerStateReceipt.providerRegion !== undefined &&
        input.providerStateReceipt.providerRegion !==
          (input.plan.providerDataPolicy.region ??
            input.plan.provider.providerRegion)))
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/providerStateReceipt',
        'Provider state receipt does not match the admitted state/data-policy boundary.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.deliveryMode === 'background' &&
    (!input.providerJobReceipt || input.providerJobReceipt.phase !== 'terminal')
  ) {
    issues.push(
      issue(
        'AI-6012',
        '/providerJobReceipt',
        'Background invocation requires a terminal provider-job receipt.'
      )
    );
  }
  if (
    input.plan.inferenceConfiguration.deliveryMode !== 'background' &&
    input.providerJobReceipt
  ) {
    issues.push(
      issue(
        'AI-6012',
        '/providerJobReceipt',
        'Non-background invocation cannot claim a provider job receipt.'
      )
    );
  }
  if (
    input.providerJobReceipt &&
    (input.providerJobReceipt.invocationId !== input.plan.invocationId ||
      input.providerJobReceipt.taskId !== input.plan.taskId ||
      input.providerJobReceipt.runId !== input.plan.runId ||
      input.providerJobReceipt.generation !== input.plan.generation ||
      !input.providerJobReceipt.providerJobId.trim() ||
      input.providerJobReceipt.callbackAuthority !== 'revoked')
  ) {
    issues.push(
      issue(
        'AI-6012',
        '/providerJobReceipt',
        'Provider job receipt does not bind this invocation or revoke terminal callback authority.'
      )
    );
  }
  try {
    if (
      input.contextTransformReceipt &&
      !sameCanonicalJson(
        createAgentContextTransformReceipt(
          (() => {
            const { receiptDigest: _digest, ...base } =
              input.contextTransformReceipt!;
            return base;
          })()
        ),
        input.contextTransformReceipt
      )
    ) {
      throw new TypeError('Context transform receipt is not canonical.');
    }
    if (
      input.cacheReceipt &&
      !sameCanonicalJson(
        createAgentProviderCacheReceipt({
          receipt: (() => {
            const {
              receiptDigest: _digest,
              provenIsolation: _isolation,
              ...base
            } = input.cacheReceipt!;
            return base;
          })(),
          isolation: input.cacheReceipt.provenIsolation,
        }),
        input.cacheReceipt
      )
    ) {
      throw new TypeError('Provider cache receipt is not canonical.');
    }
    if (
      input.providerStateReceipt &&
      !sameCanonicalJson(
        createAgentProviderStateReceipt(
          (() => {
            const { receiptDigest: _digest, ...base } =
              input.providerStateReceipt!;
            return base;
          })()
        ),
        input.providerStateReceipt
      )
    ) {
      throw new TypeError('Provider state receipt is not canonical.');
    }
    if (input.providerJobReceipt) {
      const { receiptDigest: _digest, ...base } = input.providerJobReceipt;
      if (
        digestAgentCanonicalValue(base) !==
          input.providerJobReceipt.receiptDigest ||
        (input.providerJobReceipt.phase === 'terminal') !==
          (input.providerJobReceipt.outcome !== undefined)
      ) {
        throw new TypeError('Provider job receipt is not canonical.');
      }
    }
  } catch (caught) {
    issues.push(
      issue(
        'AI-6011',
        '/providerReceipts',
        caught instanceof Error
          ? caught.message
          : 'Provider receipt semantic validation failed.'
      )
    );
  }
  if (input.responseDigest && !isAgentCanonicalDigest(input.responseDigest)) {
    issues.push(
      issue(
        'AI-9001',
        '/responseDigest',
        'Sanitized response digest is invalid.'
      )
    );
  }
  if (
    input.pricingSnapshotRef !== undefined &&
    !input.pricingSnapshotRef.trim()
  ) {
    issues.push(
      issue(
        'AI-6013',
        '/pricingSnapshotRef',
        'Pricing snapshot reference must not be empty.'
      )
    );
  }
  if (issues.length > 0 || !preflight.ok) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }

  const base = {
    invocationId: input.plan.invocationId,
    taskId: input.plan.taskId,
    runId: input.plan.runId,
    generation: input.plan.generation,
    attempt: input.plan.attempt,
    provider: input.plan.provider,
    model: input.plan.model,
    capabilityQualificationDigest: input.plan.qualification.qualificationDigest,
    inferenceConfigurationDigest:
      input.plan.inferenceConfiguration.configurationDigest,
    contextPackDigest: input.plan.contextPack.manifestDigest,
    ...(input.plan.multimodalContextManifestDigest
      ? {
          multimodalContextManifestDigest:
            input.plan.multimodalContextManifestDigest,
          providerMediaBlockManifestDigest:
            input.plan.providerMediaBlockManifestDigest,
        }
      : {}),
    ...(input.contextTransformReceipt
      ? {
          contextTransformReceiptRef:
            input.contextTransformReceipt.receiptDigest,
        }
      : {}),
    ...(input.cacheReceipt
      ? { cacheReceiptRef: input.cacheReceipt.receiptDigest }
      : {}),
    ...(input.providerStateReceipt
      ? { providerStateReceiptRef: input.providerStateReceipt.receiptDigest }
      : {}),
    ...(input.providerJobReceipt
      ? { providerJobReceiptRef: input.providerJobReceipt.receiptDigest }
      : {}),
    requestDigest: preflight.requestDigest,
    ...(input.responseDigest ? { responseDigest: input.responseDigest } : {}),
    outcome: input.outcome,
    usage: input.usage,
    costStatus: input.costStatus,
    cost: normalizedCosts,
    ...(input.pricingSnapshotRef
      ? { pricingSnapshotRef: input.pricingSnapshotRef }
      : {}),
    startedAt: input.plan.startedAt,
    completedAt: input.completedAt,
  } as const;
  return Object.freeze({
    ok: true,
    receipt: Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    }),
  });
};
