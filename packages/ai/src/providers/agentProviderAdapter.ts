import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { CanonicalDigest } from '../domain/agent.types';
import { isAgentCanonicalDigest } from '../domain/agentCanonical';
import type {
  AgentCapabilityProbeAdapter,
  AgentCapabilityProbeObservation,
} from './agentCapabilityQualification';
import {
  decodeAgentProviderFact,
  encodeAgentProviderFact,
  type AgentProviderFact,
} from './agentProviderCodec';
import { validateAgentProviderEventSequence } from './agentInvocation';
import type { AgentProviderAdapterIdentity } from './agentProvider.types';

export type AgentProviderAdapterInvocationRequest = Readonly<{
  invocationId: string;
  requestDigest: CanonicalDigest;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  capabilityProfileDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  multimodalContextManifestDigest?: CanonicalDigest;
  providerMediaBlockManifestDigest?: CanonicalDigest;
}>;

/**
 * Transport-neutral provider SPI. Production adapters are server/native
 * composition objects; credentials are deliberately absent from this request.
 */
export interface AgentProviderAdapter extends AgentCapabilityProbeAdapter {
  readonly identity: AgentProviderAdapterIdentity;
  invoke(
    request: AgentProviderAdapterInvocationRequest,
    signal?: AbortSignal
  ): AsyncIterable<unknown>;
  cancel?(
    request: Readonly<{
      invocationId: string;
      requestDigest: CanonicalDigest;
    }>
  ): Promise<unknown>;
  reconcile?(
    request: Readonly<{
      invocationId: string;
      requestDigest: CanonicalDigest;
    }>
  ): Promise<unknown>;
}

export type AgentProviderAdapterConformanceIssue = Readonly<{
  code: 'AI-6010' | 'AI-6011' | 'AI-6013' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentProviderAdapterConformanceResult =
  | Readonly<{ ok: true; facts: readonly AgentProviderFact[] }>
  | Readonly<{
      ok: false;
      issues: readonly AgentProviderAdapterConformanceIssue[];
    }>;

const issue = (
  code: AgentProviderAdapterConformanceIssue['code'],
  path: string,
  message: string
): AgentProviderAdapterConformanceIssue =>
  Object.freeze({ code, path, message, blocking: true });

const compareIssues = (
  left: AgentProviderAdapterConformanceIssue,
  right: AgentProviderAdapterConformanceIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

const validateRequest = (
  request: AgentProviderAdapterInvocationRequest
): readonly AgentProviderAdapterConformanceIssue[] => {
  const issues: AgentProviderAdapterConformanceIssue[] = [];
  if (!request.invocationId.trim() || !request.providerConfigurationId.trim()) {
    issues.push(
      issue('AI-9001', '/request', 'Provider invocation identity is required.')
    );
  }
  for (const [field, digest] of [
    ['requestDigest', request.requestDigest],
    ['modelLineageDigest', request.modelLineageDigest],
    ['capabilityProfileDigest', request.capabilityProfileDigest],
    ['inferenceConfigurationDigest', request.inferenceConfigurationDigest],
    ['contextPackDigest', request.contextPackDigest],
  ] as const) {
    if (!isAgentCanonicalDigest(digest)) {
      issues.push(
        issue('AI-9001', `/request/${field}`, `${field} is not canonical.`)
      );
    }
  }
  if (
    (request.multimodalContextManifestDigest === undefined) !==
      (request.providerMediaBlockManifestDigest === undefined) ||
    (request.multimodalContextManifestDigest !== undefined &&
      (!isAgentCanonicalDigest(request.multimodalContextManifestDigest) ||
        !isAgentCanonicalDigest(request.providerMediaBlockManifestDigest)))
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/request/multimodalContext',
        'Multimodal Context and Provider media block manifests must be exact and paired.'
      )
    );
  }
  return Object.freeze(issues);
};

const isTerminalEvent = (type: string): boolean =>
  type === 'completed' ||
  type === 'failed' ||
  type === 'refusal' ||
  type === 'safety-block' ||
  type === 'truncation' ||
  type === 'cancelled' ||
  type === 'timed-out' ||
  type === 'partial';

/**
 * Normalizes one invocation stream and enforces the shared minimum contract.
 * Full native transport and failure matrices remain a V8 responsibility.
 */
export const runAgentProviderAdapterConformance = async (
  adapter: AgentProviderAdapter,
  request: AgentProviderAdapterInvocationRequest
): Promise<AgentProviderAdapterConformanceResult> => {
  const issues: AgentProviderAdapterConformanceIssue[] = [
    ...validateRequest(request),
  ];
  const declared = [...adapter.declaredProfileDigests].sort(
    compareUnicodeCodePoints
  );
  if (
    new Set(declared).size !== declared.length ||
    declared.some((digest) => !isAgentCanonicalDigest(digest)) ||
    !declared.includes(request.capabilityProfileDigest)
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/adapter/declaredProfileDigests',
        'Adapter does not canonically declare the requested capability profile.'
      )
    );
  }
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }

  const facts: AgentProviderFact[] = [];
  try {
    for await (const raw of adapter.invoke(request)) {
      if (facts.length >= 10_000) {
        issues.push(
          issue(
            'AI-9001',
            '/facts',
            'Provider invocation exceeded the normalized fact limit.'
          )
        );
        break;
      }
      const decoded = decodeAgentProviderFact(raw);
      if (!decoded.ok) {
        issues.push(
          ...decoded.issues.map((entry) =>
            issue(entry.code, `/facts${entry.path}`, entry.message)
          )
        );
        continue;
      }
      if (decoded.value.factType === 'provider-catalog-entry') {
        issues.push(
          issue(
            'AI-6010',
            '/facts',
            'Provider catalog declarations cannot mutate during an invocation.'
          )
        );
        continue;
      }
      facts.push(decoded.value);
    }
  } catch {
    issues.push(
      issue(
        'AI-6011',
        '/transport',
        'Provider transport failed without a normalized bounded fact.'
      )
    );
  }

  for (const [index, fact] of facts.entries()) {
    const factPath = `/facts/${index}`;
    if (
      fact.factType === 'context-transform-receipt' &&
      fact.value.invocationId !== request.invocationId
    ) {
      issues.push(
        issue(
          'AI-6011',
          factPath,
          'Context transform receipt belongs to another invocation.'
        )
      );
    }
    if (
      fact.factType === 'opaque-continuation' &&
      (fact.value.providerConfigurationId !== request.providerConfigurationId ||
        fact.value.modelLineageDigest !== request.modelLineageDigest ||
        fact.value.parentInvocationId !== request.invocationId)
    ) {
      issues.push(
        issue(
          'AI-6011',
          factPath,
          'Opaque continuation crossed its provider/model/parent invocation boundary.'
        )
      );
    }
    if (
      (fact.factType === 'provider-job-event' ||
        fact.factType === 'provider-job-receipt') &&
      fact.value.invocationId !== request.invocationId
    ) {
      issues.push(
        issue(
          'AI-6011',
          factPath,
          'Provider job fact belongs to another invocation.'
        )
      );
    }
  }

  const events = facts.flatMap((fact) =>
    fact.factType === 'provider-event' ? [fact.value] : []
  );
  const usage = facts.filter((fact) => fact.factType === 'usage-vector');
  if (usage.length !== 1) {
    issues.push(
      issue(
        'AI-6013',
        '/facts/usage',
        'Provider invocation must emit exactly one known-or-unknown usage vector.'
      )
    );
  }
  if (events.length === 0 || !isTerminalEvent(events.at(-1)?.type ?? '')) {
    issues.push(
      issue(
        'AI-6011',
        '/facts/events',
        'Provider invocation must terminate with a normalized terminal event.'
      )
    );
  }
  issues.push(
    ...validateAgentProviderEventSequence(request.invocationId, events).map(
      (entry) =>
        issue(
          entry.code === 'AI-9001' ? 'AI-9001' : 'AI-6011',
          `/facts/events${entry.path}`,
          entry.message
        )
    )
  );
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }
  return Object.freeze({ ok: true, facts: Object.freeze(facts) });
};

/** Deterministic zero-network adapter used by V1 correctness and failure tests. */
export const createScriptedAgentProviderAdapter = (
  input: Readonly<{
    identity: AgentProviderAdapterIdentity;
    declaredProfileDigests: readonly CanonicalDigest[];
    supportedProfileDigests: readonly CanonicalDigest[];
    facts:
      | readonly AgentProviderFact[]
      | ((
          request: AgentProviderAdapterInvocationRequest
        ) => readonly AgentProviderFact[]);
  }>
): AgentProviderAdapter => {
  const declaredProfileDigests = Object.freeze(
    [...input.declaredProfileDigests].sort(compareUnicodeCodePoints)
  );
  const supported = new Set(input.supportedProfileDigests);
  return Object.freeze({
    identity: input.identity,
    declaredProfileDigests,
    probe({
      profileDigest,
    }: Readonly<{
      providerConfigurationId: string;
      modelLineageDigest: CanonicalDigest;
      profileDigest: CanonicalDigest;
    }>): AgentCapabilityProbeObservation {
      const declared = declaredProfileDigests.includes(profileDigest);
      const isSupported = declared && supported.has(profileDigest);
      return Object.freeze({
        status: isSupported
          ? 'supported'
          : declared
            ? 'unsupported'
            : 'inconclusive',
        ...(isSupported ? { observedProfileDigest: profileDigest } : {}),
        observedLimitDigest: input.identity.adapterDigest,
      });
    },
    async *invoke(request: AgentProviderAdapterInvocationRequest) {
      const facts =
        typeof input.facts === 'function' ? input.facts(request) : input.facts;
      for (const fact of facts) yield encodeAgentProviderFact(fact);
    },
  });
};
