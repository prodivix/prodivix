import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
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
  evaluateAgentProviderAdmission,
  type AgentEffectivePolicy,
} from '../policy/agentPolicyEvaluation';
import type {
  AgentCapabilityProbeReceipt,
  AgentCapabilityProfile,
  AgentCapabilityQualification,
  AgentModelEvaluationQualification,
  AgentModelLineage,
  AgentProviderAdapterIdentity,
  AgentProviderConfigurationIdentity,
  AgentProviderDataPolicy,
} from './agentProvider.types';
import { validateAgentCoreCapabilityProfile } from './agentProviderIdentity';

export type AgentCapabilityProbeObservation = Readonly<{
  status: 'supported' | 'unsupported' | 'inconclusive';
  observedProfileDigest?: CanonicalDigest;
  observedLimitDigest: CanonicalDigest;
}>;

export type AgentCapabilityProbeAdapter = Readonly<{
  identity: AgentProviderAdapterIdentity;
  declaredProfileDigests: readonly CanonicalDigest[];
  probe(
    input: Readonly<{
      providerConfigurationId: string;
      modelLineageDigest: CanonicalDigest;
      profileDigest: CanonicalDigest;
    }>
  ): AgentCapabilityProbeObservation | Promise<AgentCapabilityProbeObservation>;
}>;

export type AgentCapabilityIssue = Readonly<{
  code: 'AI-6010' | 'AI-6011' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentCapabilityProbeResult =
  | Readonly<{ ok: true; receipt: AgentCapabilityProbeReceipt }>
  | Readonly<{ ok: false; issues: readonly AgentCapabilityIssue[] }>;

export type AgentCapabilityQualificationResult =
  | Readonly<{ ok: true; qualification: AgentCapabilityQualification }>
  | Readonly<{ ok: false; issues: readonly AgentCapabilityIssue[] }>;

const issue = (
  code: AgentCapabilityIssue['code'],
  path: string,
  message: string
): AgentCapabilityIssue =>
  Object.freeze({ code, path, message, blocking: true });

const compareIssues = (
  left: AgentCapabilityIssue,
  right: AgentCapabilityIssue
): number =>
  compareUnicodeCodePoints(left.path, right.path) ||
  compareUnicodeCodePoints(left.code, right.code) ||
  compareUnicodeCodePoints(left.message, right.message);

const validInstant = (value: Instant): boolean =>
  Number.isFinite(Date.parse(value));

const qualificationSliceDigest = (
  input: Readonly<{
    provider: AgentProviderConfigurationIdentity;
    model: AgentModelLineage;
    capabilityProfileDigest: CanonicalDigest;
    policyProfileDigest: CanonicalDigest;
  }>
): CanonicalDigest =>
  digestAgentCanonicalValue({
    capabilityProfileDigest: input.capabilityProfileDigest,
    modelLineageDigest: input.model.lineageDigest,
    policyProfileDigest: input.policyProfileDigest,
    providerConfigurationId: input.provider.providerConfigurationId,
    providerIdentityDigest: digestAgentCanonicalValue(input.provider),
  });

export const createDeterministicCapabilityProbeAdapter = (
  input: Readonly<{
    identity: AgentProviderAdapterIdentity;
    declaredProfileDigests: readonly CanonicalDigest[];
    supportedProfileDigests: readonly CanonicalDigest[];
  }>
): AgentCapabilityProbeAdapter => {
  const declared = Object.freeze(
    [...input.declaredProfileDigests].sort(compareUnicodeCodePoints)
  );
  const supported = new Set(input.supportedProfileDigests);
  return Object.freeze({
    identity: input.identity,
    declaredProfileDigests: declared,
    probe({ profileDigest }) {
      const isDeclared = declared.includes(profileDigest);
      const isSupported = isDeclared && supported.has(profileDigest);
      return Object.freeze({
        status: isSupported
          ? 'supported'
          : isDeclared
            ? 'unsupported'
            : 'inconclusive',
        ...(isSupported ? { observedProfileDigest: profileDigest } : {}),
        observedLimitDigest: digestAgentCanonicalValue({
          adapterDigest: input.identity.adapterDigest,
          profileDigest,
          supported: isSupported,
        }),
      });
    },
  });
};

/** Executes a data-free active probe and binds the observation to an exact endpoint/model slice. */
export const runAgentCapabilityProbe = async (
  input: Readonly<{
    probeId: string;
    adapter: AgentCapabilityProbeAdapter;
    provider: AgentProviderConfigurationIdentity;
    model: AgentModelLineage;
    profile: AgentCapabilityProfile;
    probedAt: Instant;
    expiresAt: Instant;
  }>
): Promise<AgentCapabilityProbeResult> => {
  const issues: AgentCapabilityIssue[] = [];
  const { adapterDigest: _adapterDigest, ...adapterBase } =
    input.adapter.identity;
  const { lineageDigest: _lineageDigest, ...modelBase } = input.model;
  const { profileDigest: _profileDigest, ...profileBase } = input.profile;
  if (
    !input.probeId.trim() ||
    !input.provider.providerConfigurationId.trim() ||
    digestAgentCanonicalValue(adapterBase) !==
      input.adapter.identity.adapterDigest ||
    digestAgentCanonicalValue(modelBase) !== input.model.lineageDigest ||
    digestAgentCanonicalValue(profileBase) !== input.profile.profileDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/probeSlice',
        'Capability probe identity, adapter, model, or profile has drifted.'
      )
    );
  }
  if (
    input.adapter.identity.adapterDigest !==
    input.provider.adapter.adapterDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/adapter',
        'Capability probe adapter does not match the provider configuration.'
      )
    );
  }
  if (
    !validInstant(input.probedAt) ||
    !validInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.probedAt)
  ) {
    issues.push(
      issue('AI-9001', '/expiresAt', 'Capability probe expiry is invalid.')
    );
  }
  const declaredProfileDigests = [...input.adapter.declaredProfileDigests].sort(
    compareUnicodeCodePoints
  );
  if (
    declaredProfileDigests.some((digest) => !isAgentCanonicalDigest(digest)) ||
    new Set(declaredProfileDigests).size !== declaredProfileDigests.length
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/declaredProfileDigests',
        'Provider capability declaration is not canonical.'
      )
    );
  }
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }

  let observation: AgentCapabilityProbeObservation;
  try {
    observation = await input.adapter.probe({
      providerConfigurationId: input.provider.providerConfigurationId,
      modelLineageDigest: input.model.lineageDigest,
      profileDigest: input.profile.profileDigest,
    });
  } catch {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          'AI-6010',
          '/observation',
          'Capability probe transport failed before producing a bounded observation.'
        ),
      ]),
    });
  }
  if (
    !['supported', 'unsupported', 'inconclusive'].includes(
      observation.status
    ) ||
    !isAgentCanonicalDigest(observation.observedLimitDigest) ||
    (observation.observedProfileDigest !== undefined &&
      !isAgentCanonicalDigest(observation.observedProfileDigest)) ||
    (observation.status !== 'supported' &&
      observation.observedProfileDigest !== undefined)
  ) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        issue(
          'AI-6010',
          '/observation',
          'Capability probe returned an invalid status, profile, or limit observation.'
        ),
      ]),
    });
  }
  const status =
    observation.status === 'supported' &&
    observation.observedProfileDigest !== input.profile.profileDigest
      ? 'inconclusive'
      : observation.status;
  const declaredCapabilityDigest = digestAgentCanonicalValue(
    declaredProfileDigests
  );
  const probedCapabilityDigest = digestAgentCanonicalValue({
    observedLimitDigest: observation.observedLimitDigest,
    observedProfileDigest: observation.observedProfileDigest ?? null,
    status,
  });
  const base = {
    declaredCapabilityDigest,
    expiresAt: input.expiresAt,
    modelLineageDigest: input.model.lineageDigest,
    probeId: input.probeId,
    probedAt: input.probedAt,
    probedCapabilityDigest,
    providerConfigurationDigest: digestAgentCanonicalValue(input.provider),
    requestedProfileDigest: input.profile.profileDigest,
    status,
    observedLimitDigest: observation.observedLimitDigest,
  } as const;
  return Object.freeze({
    ok: true,
    receipt: Object.freeze({
      ...base,
      receiptDigest: digestAgentCanonicalValue(base),
    }),
  });
};

const validateLocalLineage = (
  provider: AgentProviderConfigurationIdentity,
  model: AgentModelLineage
): readonly AgentCapabilityIssue[] => {
  if (
    provider.endpointClass !== 'local' &&
    provider.endpointClass !== 'self-hosted'
  ) {
    return Object.freeze([]);
  }
  const issues: AgentCapabilityIssue[] = [];
  for (const [field, value] of [
    ['tokenizerDigest', model.tokenizerDigest],
    ['chatTemplateDigest', model.chatTemplateDigest],
    ['quantizationDigest', model.quantizationDigest],
    ['runtimeBackendDigest', model.runtimeBackendDigest],
  ] as const) {
    if (!value) {
      issues.push(
        issue(
          'AI-6010',
          `/model/${field}`,
          `Local/self-hosted qualification requires ${field}.`
        )
      );
    }
  }
  return Object.freeze(issues);
};

export const qualifyAgentProviderCapability = (
  input: Readonly<{
    provider: AgentProviderConfigurationIdentity;
    providerDataPolicy: AgentProviderDataPolicy;
    model: AgentModelLineage;
    profile: AgentCapabilityProfile;
    probe: AgentCapabilityProbeReceipt;
    policy: AgentEffectivePolicy;
    sensitivity: AgentProviderDataPolicy['maximumSensitivity'];
    evaluatedAt: Instant;
    expiresAt: Instant;
    evaluation?: AgentModelEvaluationQualification;
  }>
): AgentCapabilityQualificationResult => {
  const issues: AgentCapabilityIssue[] = [
    ...validateLocalLineage(input.provider, input.model),
  ];
  const { receiptDigest: _probeReceiptDigest, ...probeBase } = input.probe;
  if (
    digestAgentCanonicalValue(probeBase) !== input.probe.receiptDigest ||
    !input.probe.probeId.trim() ||
    !isAgentCanonicalDigest(input.probe.providerConfigurationDigest) ||
    !isAgentCanonicalDigest(input.probe.modelLineageDigest) ||
    !isAgentCanonicalDigest(input.probe.requestedProfileDigest) ||
    !isAgentCanonicalDigest(input.probe.declaredCapabilityDigest) ||
    !isAgentCanonicalDigest(input.probe.probedCapabilityDigest) ||
    !isAgentCanonicalDigest(input.probe.observedLimitDigest) ||
    !validInstant(input.probe.probedAt) ||
    !validInstant(input.probe.expiresAt) ||
    Date.parse(input.probe.probedAt) > Date.parse(input.evaluatedAt)
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/probe/receiptDigest',
        'Capability probe receipt is invalid, future-dated, or has drifted.'
      )
    );
  }
  const missingCore = validateAgentCoreCapabilityProfile(input.profile);
  if (missingCore.length > 0) {
    issues.push(
      issue(
        'AI-6010',
        '/profile',
        `Core capability profile is incomplete: ${missingCore.join(', ')}.`
      )
    );
  }
  if (
    input.probe.providerConfigurationDigest !==
      digestAgentCanonicalValue(input.provider) ||
    input.probe.modelLineageDigest !== input.model.lineageDigest ||
    input.probe.requestedProfileDigest !== input.profile.profileDigest ||
    input.probe.status !== 'supported'
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/probe',
        'Active capability probe does not support this exact provider/model/profile slice.'
      )
    );
  }
  if (
    !validInstant(input.evaluatedAt) ||
    !validInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.evaluatedAt) ||
    Date.parse(input.expiresAt) > Date.parse(input.probe.expiresAt)
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/expiresAt',
        'Capability qualification must expire within its active probe.'
      )
    );
  }
  if (
    !input.model.immutableVersion &&
    Date.parse(input.expiresAt) - Date.parse(input.evaluatedAt) > 86_400_000
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/model/immutableVersion',
        'Mutable or unknown model aliases require qualification freshness of at most 24 hours.'
      )
    );
  }

  const sliceDigest = qualificationSliceDigest({
    provider: input.provider,
    model: input.model,
    capabilityProfileDigest: input.profile.profileDigest,
    policyProfileDigest: input.policy.evaluation.effectivePolicyDigest,
  });
  const evaluationIsUsable =
    input.evaluation !== undefined &&
    input.evaluation.manifestRef.trim().length > 0 &&
    input.evaluation.qualificationSliceDigest === sliceDigest &&
    isAgentCanonicalDigest(input.evaluation.planDigest) &&
    isAgentCanonicalDigest(input.evaluation.qualificationTargetDigest) &&
    isAgentCanonicalDigest(input.evaluation.qualificationSliceDigest) &&
    validInstant(input.evaluation.evaluatedAt) &&
    validInstant(input.evaluation.expiresAt) &&
    Date.parse(input.evaluation.expiresAt) >= Date.parse(input.expiresAt) &&
    Date.parse(input.evaluation.evaluatedAt) <= Date.parse(input.evaluatedAt) &&
    isAgentCanonicalDigest(input.evaluation.manifestDigest) &&
    isAgentCanonicalDigest(input.evaluation.qualificationDigest) &&
    digestAgentCanonicalValue({
      manifestRef: input.evaluation.manifestRef,
      manifestDigest: input.evaluation.manifestDigest,
      planDigest: input.evaluation.planDigest,
      qualificationTargetDigest: input.evaluation.qualificationTargetDigest,
      qualificationSliceDigest: input.evaluation.qualificationSliceDigest,
      evaluatedAt: input.evaluation.evaluatedAt,
      expiresAt: input.evaluation.expiresAt,
    }) === input.evaluation.qualificationDigest;
  const supportTier: AgentProviderSupportTier = evaluationIsUsable
    ? 'release-evaluated'
    : 'admission-only';
  const admission = evaluateAgentProviderAdmission(input.policy, {
    provider: input.provider,
    model: input.model,
    capabilityProfile: input.profile,
    supportTier,
    sensitivity: input.sensitivity,
    dataPolicy: input.providerDataPolicy,
  });
  if (!admission.allowed) {
    issues.push(
      ...admission.issues.map((entry) =>
        issue(
          entry.code === 'AI-9001' ? 'AI-9001' : 'AI-6010',
          entry.path,
          entry.message
        )
      )
    );
  }
  if (issues.length > 0) {
    return Object.freeze({
      ok: false,
      issues: Object.freeze(issues.sort(compareIssues)),
    });
  }

  const base = {
    provider: input.provider,
    model: input.model,
    capabilityProfileDigest: input.profile.profileDigest,
    policyProfileDigest: input.policy.evaluation.effectivePolicyDigest,
    declaredCapabilityDigest: input.probe.declaredCapabilityDigest,
    probedCapabilityDigest: input.probe.probedCapabilityDigest,
    ...(evaluationIsUsable
      ? { evaluationManifestRef: input.evaluation!.manifestRef }
      : {}),
    supportTier,
    evaluatedAt: input.evaluatedAt,
    expiresAt: input.expiresAt,
  } as const;
  return Object.freeze({
    ok: true,
    qualification: Object.freeze({
      ...base,
      qualificationDigest: digestAgentCanonicalValue(base),
    }),
  });
};

const repositoryKey = (
  input: Readonly<{
    providerConfigurationId: string;
    modelLineageDigest: CanonicalDigest;
    capabilityProfileDigest: CanonicalDigest;
    policyProfileDigest: CanonicalDigest;
  }>
): string =>
  digestAgentCanonicalValue({
    capabilityProfileDigest: input.capabilityProfileDigest,
    modelLineageDigest: input.modelLineageDigest,
    policyProfileDigest: input.policyProfileDigest,
    providerConfigurationId: input.providerConfigurationId,
  });

export class InMemoryAgentCapabilityQualificationRepository {
  readonly #qualifications = new Map<string, AgentCapabilityQualification>();

  put(qualification: AgentCapabilityQualification): void {
    const { qualificationDigest: _digest, ...base } = qualification;
    if (digestAgentCanonicalValue(base) !== qualification.qualificationDigest) {
      throw new TypeError('Capability qualification digest has drifted.');
    }
    const key = repositoryKey({
      providerConfigurationId: qualification.provider.providerConfigurationId,
      modelLineageDigest: qualification.model.lineageDigest,
      capabilityProfileDigest: qualification.capabilityProfileDigest,
      policyProfileDigest: qualification.policyProfileDigest,
    });
    const current = this.#qualifications.get(key);
    if (
      current &&
      current.qualificationDigest !== qualification.qualificationDigest
    ) {
      throw new TypeError('Exact capability qualification is immutable.');
    }
    this.#qualifications.set(key, Object.freeze(qualification));
  }

  find(
    input: Readonly<{
      providerConfigurationId: string;
      modelLineageDigest: CanonicalDigest;
      capabilityProfileDigest: CanonicalDigest;
      policyProfileDigest: CanonicalDigest;
      at: Instant;
    }>
  ):
    | Readonly<{ status: 'found'; qualification: AgentCapabilityQualification }>
    | Readonly<{
        status: 'expired';
        qualification: AgentCapabilityQualification;
      }>
    | Readonly<{ status: 'missing' }> {
    const qualification = this.#qualifications.get(repositoryKey(input));
    if (!qualification) return Object.freeze({ status: 'missing' });
    return Date.parse(input.at) < Date.parse(qualification.expiresAt)
      ? Object.freeze({ status: 'found', qualification })
      : Object.freeze({ status: 'expired', qualification });
  }
}

export const createAgentQualificationSliceDigest = qualificationSliceDigest;
