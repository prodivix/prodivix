import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentBudget,
  AgentContextAuthority,
  AgentContextPolicy,
  AgentPolicy,
  AgentPolicyEvaluation,
  AgentPolicyRef,
  AgentPrivacyPolicy,
  AgentProviderRule,
  AgentProviderSupportTier,
  AgentRetentionRules,
  AgentSensitivity,
  AgentUsageLimit,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  digestAgentPolicy,
  validateAgentPolicy,
} from '../domain/agentPolicyCodec';
import type {
  AgentCapabilityProfile,
  AgentModelLineage,
  AgentProviderConfigurationIdentity,
  AgentProviderDataPolicy,
} from '../providers/agentProvider.types';

export type AgentPolicyLayerKind =
  'platform' | 'organization' | 'project' | 'actor' | 'grant';

export type AgentPolicyLayer = Readonly<{
  kind: AgentPolicyLayerKind;
  issuer: string;
  policy: AgentPolicy;
  policyDigest: CanonicalDigest;
}>;

export type AgentEffectivePolicy = Readonly<{
  evaluation: AgentPolicyEvaluation;
  layers: readonly AgentPolicyLayer[];
  contextRules: AgentContextPolicy;
  budgetCeiling: AgentBudget;
  retentionRules: AgentRetentionRules;
  privacy: AgentPrivacyPolicy;
}>;

export type AgentPolicyEvaluationIssue = Readonly<{
  code: 'AI-6010' | 'AI-6011' | 'AI-7001' | 'AI-9001';
  path: string;
  message: string;
  blocking: true;
}>;

export type AgentEffectivePolicyResult =
  | Readonly<{ ok: true; value: AgentEffectivePolicy }>
  | Readonly<{
      ok: false;
      issues: readonly AgentPolicyEvaluationIssue[];
    }>;

export type AgentProviderAdmissionCandidate = Readonly<{
  provider: AgentProviderConfigurationIdentity;
  model: AgentModelLineage;
  capabilityProfile: AgentCapabilityProfile;
  supportTier: AgentProviderSupportTier;
  sensitivity: AgentSensitivity;
  dataPolicy: AgentProviderDataPolicy;
}>;

export type AgentProviderAdmissionResult =
  | Readonly<{ allowed: true; policyDigest: CanonicalDigest }>
  | Readonly<{
      allowed: false;
      issues: readonly AgentPolicyEvaluationIssue[];
    }>;

const layerOrder: Readonly<Record<AgentPolicyLayerKind, number>> =
  Object.freeze({
    platform: 0,
    organization: 1,
    project: 2,
    actor: 3,
    grant: 4,
  });

const sensitivityOrder: Readonly<Record<AgentSensitivity, number>> =
  Object.freeze({
    public: 0,
    internal: 1,
    confidential: 2,
    restricted: 3,
  });

const supportTierOrder: Readonly<Record<AgentProviderSupportTier, number>> =
  Object.freeze({
    disabled: 0,
    'admission-only': 1,
    'release-evaluated': 2,
  });

const issue = (
  code: AgentPolicyEvaluationIssue['code'],
  path: string,
  message: string
): AgentPolicyEvaluationIssue =>
  Object.freeze({ code, path, message, blocking: true });

const intersectStrings = (
  sets: readonly (readonly string[])[]
): readonly string[] => {
  if (sets.length === 0) return Object.freeze([]);
  const [first, ...rest] = sets;
  return Object.freeze(
    [...new Set(first)]
      .filter((value) => rest.every((candidate) => candidate.includes(value)))
      .sort(compareUnicodeCodePoints)
  );
};

const minimumSensitivity = (
  values: readonly AgentSensitivity[]
): AgentSensitivity =>
  values.reduce((strictest, value) =>
    sensitivityOrder[value] < sensitivityOrder[strictest] ? value : strictest
  );

const minimumNumber = (values: readonly number[]): number =>
  Math.min(...values);

const minimumDecimal = (left: string, right: string): string => {
  const [leftWhole, leftFraction = ''] = left.split('.');
  const [rightWhole, rightFraction = ''] = right.split('.');
  const scale = Math.max(leftFraction.length, rightFraction.length);
  const leftValue = BigInt(`${leftWhole}${leftFraction.padEnd(scale, '0')}`);
  const rightValue = BigInt(`${rightWhole}${rightFraction.padEnd(scale, '0')}`);
  return leftValue <= rightValue ? left : right;
};

const intersectUsageLimits = (
  policies: readonly AgentPolicy[]
): readonly AgentUsageLimit[] => {
  const limits = new Map<string, string>();
  for (const policy of policies) {
    for (const limit of policy.budgetCeiling.usageLimits) {
      const current = limits.get(limit.unit);
      limits.set(
        limit.unit,
        current === undefined
          ? limit.maximum
          : minimumDecimal(current, limit.maximum)
      );
    }
  }
  return Object.freeze(
    [...limits.entries()]
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(
        ([unit, maximum]) => Object.freeze({ unit, maximum }) as AgentUsageLimit
      )
  );
};

const intersectCostLimits = (
  policies: readonly AgentPolicy[]
): AgentBudget['costLimits'] => {
  const limits = new Map<string, string>();
  for (const policy of policies) {
    for (const limit of policy.budgetCeiling.costLimits) {
      const current = limits.get(limit.currency);
      limits.set(
        limit.currency,
        current === undefined
          ? limit.maximum
          : minimumDecimal(current, limit.maximum)
      );
    }
  }
  return Object.freeze(
    [...limits.entries()]
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([currency, maximum]) => Object.freeze({ currency, maximum }))
  );
};

const intersectBudget = (policies: readonly AgentPolicy[]): AgentBudget =>
  Object.freeze({
    usageLimits: intersectUsageLimits(policies),
    costLimits: intersectCostLimits(policies),
    maxModelInvocations: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxModelInvocations)
    ),
    maxToolCalls: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxToolCalls)
    ),
    maxRepairRounds: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxRepairRounds)
    ),
    maxTransactions: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxTransactions)
    ),
    maxArtifactBytes: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxArtifactBytes)
    ),
    maxElapsedMs: minimumNumber(
      policies.map(({ budgetCeiling }) => budgetCeiling.maxElapsedMs)
    ),
  });

const intersectContextRules = (
  policies: readonly AgentPolicy[]
): AgentContextPolicy =>
  Object.freeze({
    allowedAuthorities: intersectStrings(
      policies.map(({ contextRules }) => contextRules.allowedAuthorities)
    ) as readonly AgentContextAuthority[],
    allowedItemKinds: intersectStrings(
      policies.map(({ contextRules }) => contextRules.allowedItemKinds)
    ),
    maximumSensitivity: minimumSensitivity(
      policies.map(({ contextRules }) => contextRules.maximumSensitivity)
    ),
    maxItems: minimumNumber(
      policies.map(({ contextRules }) => contextRules.maxItems)
    ),
    maxBytes: minimumNumber(
      policies.map(({ contextRules }) => contextRules.maxBytes)
    ),
    requireSourceTrace: policies.some(
      ({ contextRules }) => contextRules.requireSourceTrace
    ),
    externalInstructionBoundary: 'data-only',
  });

const intersectRetention = (
  policies: readonly AgentPolicy[]
): AgentRetentionRules =>
  Object.freeze({
    auditDays: minimumNumber(
      policies.map(({ retentionRules }) => retentionRules.auditDays)
    ),
    sanitizedTraceDays: minimumNumber(
      policies.map(({ retentionRules }) => retentionRules.sanitizedTraceDays)
    ),
    rawPrivateArtifactDays: minimumNumber(
      policies.map(
        ({ retentionRules }) => retentionRules.rawPrivateArtifactDays
      )
    ),
    providerStateDays: minimumNumber(
      policies.map(({ retentionRules }) => retentionRules.providerStateDays)
    ),
    requireDeletionReceipt: policies.some(
      ({ retentionRules }) => retentionRules.requireDeletionReceipt
    ),
  });

const intersectPrivacy = (
  policies: readonly AgentPolicy[]
): AgentPrivacyPolicy =>
  Object.freeze({
    maximumSensitivity: minimumSensitivity(
      policies.map(({ privacy }) => privacy.maximumSensitivity)
    ),
    allowedRegions: intersectStrings(
      policies.map(({ privacy }) => privacy.allowedRegions)
    ),
    providerTraining: policies.some(
      ({ privacy }) => privacy.providerTraining === 'deny'
    )
      ? 'deny'
      : 'policy-qualified',
    providerTelemetry: policies.some(
      ({ privacy }) => privacy.providerTelemetry === 'deny'
    )
      ? 'deny'
      : 'policy-qualified',
    rawArtifactCapture: policies.some(
      ({ privacy }) => privacy.rawArtifactCapture === 'deny'
    )
      ? 'deny'
      : 'role-restricted',
  });

const validateLayers = (
  layers: readonly AgentPolicyLayer[]
): readonly AgentPolicyEvaluationIssue[] => {
  const issues: AgentPolicyEvaluationIssue[] = [];
  const counts = new Map<AgentPolicyLayerKind, number>();
  for (const [index, layer] of layers.entries()) {
    counts.set(layer.kind, (counts.get(layer.kind) ?? 0) + 1);
    const validation = validateAgentPolicy(layer.policy);
    if (!validation.ok) {
      issues.push(
        issue(
          'AI-9001',
          `/layers/${index}/policy`,
          `The ${layer.kind} AgentPolicy layer is invalid.`
        )
      );
      continue;
    }
    if (
      !isAgentCanonicalDigest(layer.policyDigest) ||
      digestAgentPolicy(validation.value) !== layer.policyDigest
    ) {
      issues.push(
        issue(
          'AI-9001',
          `/layers/${index}/policyDigest`,
          `The ${layer.kind} AgentPolicy digest does not match its canonical policy.`
        )
      );
    }
    if (!layer.issuer.trim()) {
      issues.push(
        issue(
          'AI-9001',
          `/layers/${index}/issuer`,
          `The ${layer.kind} AgentPolicy issuer is missing.`
        )
      );
    }
  }
  for (const kind of ['platform', 'project', 'actor', 'grant'] as const) {
    if (counts.get(kind) !== 1) {
      issues.push(
        issue(
          'AI-9001',
          '/layers',
          `Effective AgentPolicy requires exactly one ${kind} layer.`
        )
      );
    }
  }
  if ((counts.get('organization') ?? 0) > 1) {
    issues.push(
      issue(
        'AI-9001',
        '/layers',
        'Effective AgentPolicy accepts at most one organization layer.'
      )
    );
  }
  return Object.freeze(issues);
};

export const evaluateEffectiveAgentPolicy = (
  input: Readonly<{
    projectPolicyRef: AgentPolicyRef;
    layers: readonly AgentPolicyLayer[];
    actorAuthorizationDigest: CanonicalDigest;
    evaluatedAt: Instant;
  }>
): AgentEffectivePolicyResult => {
  const issues = [...validateLayers(input.layers)];
  if (!isAgentCanonicalDigest(input.actorAuthorizationDigest)) {
    issues.push(
      issue(
        'AI-9001',
        '/actorAuthorizationDigest',
        'Actor authorization must have a canonical digest.'
      )
    );
  }
  if (!Number.isFinite(Date.parse(input.evaluatedAt))) {
    issues.push(
      issue('AI-9001', '/evaluatedAt', 'Policy evaluation instant is invalid.')
    );
  }
  const sortedLayers = [...input.layers].sort(
    (left, right) =>
      layerOrder[left.kind] - layerOrder[right.kind] ||
      compareUnicodeCodePoints(left.issuer, right.issuer)
  );
  const project = sortedLayers.find(({ kind }) => kind === 'project');
  if (
    project &&
    (project.policy.id !== input.projectPolicyRef.documentId ||
      project.policyDigest !== digestAgentPolicy(project.policy))
  ) {
    issues.push(
      issue(
        'AI-9001',
        '/projectPolicyRef',
        'Project policy reference does not bind the project policy layer.'
      )
    );
  }
  if (issues.length > 0 || !project) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }

  const policies = sortedLayers.map(({ policy }) => policy);
  const effectivePolicyDigest = digestAgentCanonicalValue({
    actorAuthorizationDigest: input.actorAuthorizationDigest,
    evaluatedAt: input.evaluatedAt,
    layers: sortedLayers.map(({ issuer, kind, policyDigest }) => ({
      issuer,
      kind,
      policyDigest,
    })),
    projectPolicyRef: input.projectPolicyRef,
  });
  const evaluation: AgentPolicyEvaluation = Object.freeze({
    projectPolicyRef: input.projectPolicyRef,
    projectPolicyDigest: project.policyDigest,
    enforcementPolicyDigests: Object.freeze(
      sortedLayers
        .filter(({ kind }) => kind === 'platform' || kind === 'organization')
        .map(({ policyDigest }) => policyDigest)
    ),
    actorAuthorizationDigest: input.actorAuthorizationDigest,
    effectivePolicyDigest,
    evaluatedAt: input.evaluatedAt,
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      evaluation,
      layers: Object.freeze(sortedLayers.map((layer) => Object.freeze(layer))),
      contextRules: intersectContextRules(policies),
      budgetCeiling: intersectBudget(policies),
      retentionRules: intersectRetention(policies),
      privacy: intersectPrivacy(policies),
    }),
  });
};

/** Re-evaluates every layer so callers cannot widen a derived policy view. */
export const validateAgentEffectivePolicy = (
  effective: AgentEffectivePolicy
): readonly AgentPolicyEvaluationIssue[] => {
  try {
    const evaluated = evaluateEffectiveAgentPolicy({
      projectPolicyRef: effective.evaluation.projectPolicyRef,
      layers: effective.layers,
      actorAuthorizationDigest: effective.evaluation.actorAuthorizationDigest,
      evaluatedAt: effective.evaluation.evaluatedAt,
    });
    if (!evaluated.ok) return evaluated.issues;
    return sameCanonicalJson(evaluated.value, effective)
      ? Object.freeze([])
      : Object.freeze([
          issue(
            'AI-9001',
            '/effectivePolicy',
            'Effective AgentPolicy derived intersections or digest have drifted.'
          ),
        ]);
  } catch {
    return Object.freeze([
      issue(
        'AI-9001',
        '/effectivePolicy',
        'Effective AgentPolicy cannot be safely re-evaluated.'
      ),
    ]);
  }
};

const listMatches = (values: readonly string[], candidate: string): boolean =>
  values.length === 0 || values.includes(candidate);

const providerRuleMatches = (
  rule: AgentProviderRule,
  candidate: AgentProviderAdmissionCandidate
): boolean =>
  listMatches(
    rule.providerConfigurationIds,
    candidate.provider.providerConfigurationId
  ) &&
  listMatches(
    rule.protocolFamilies,
    candidate.provider.adapter.protocolFamily
  ) &&
  listMatches(rule.endpointClasses, candidate.provider.endpointClass) &&
  listMatches(
    rule.regions,
    candidate.dataPolicy.region ?? candidate.provider.providerRegion ?? ''
  ) &&
  supportTierOrder[candidate.supportTier] >=
    supportTierOrder[rule.minimumSupportTier] &&
  sensitivityOrder[candidate.sensitivity] <=
    sensitivityOrder[rule.maximumSensitivity];

const modelRuleMatches = (
  rule: AgentPolicy['modelRules'][number],
  candidate: AgentProviderAdmissionCandidate
): boolean =>
  listMatches(rule.modelIds, candidate.model.modelId) &&
  listMatches(rule.modelFamilyIds, candidate.model.modelFamilyId) &&
  listMatches(
    rule.capabilityProfileIds,
    candidate.capabilityProfile.profileId
  ) &&
  supportTierOrder[candidate.supportTier] >=
    supportTierOrder[rule.minimumSupportTier];

const layerAllowsProvider = (
  layer: AgentPolicyLayer,
  candidate: AgentProviderAdmissionCandidate
): boolean => {
  const matching = layer.policy.providerRules.filter((rule) =>
    providerRuleMatches(rule, candidate)
  );
  return (
    matching.some(({ effect }) => effect === 'allow') &&
    !matching.some(({ effect }) => effect === 'deny')
  );
};

const layerAllowsModel = (
  layer: AgentPolicyLayer,
  candidate: AgentProviderAdmissionCandidate
): boolean => {
  const matching = layer.policy.modelRules.filter((rule) =>
    modelRuleMatches(rule, candidate)
  );
  return (
    matching.some(({ effect }) => effect === 'allow') &&
    !matching.some(({ effect }) => effect === 'deny')
  );
};

/** Applies every policy layer independently so no lower layer can widen one above it. */
export const evaluateAgentProviderAdmission = (
  effective: AgentEffectivePolicy,
  candidate: AgentProviderAdmissionCandidate
): AgentProviderAdmissionResult => {
  const issues: AgentPolicyEvaluationIssue[] = [
    ...validateAgentEffectivePolicy(effective),
  ];
  const { adapterDigest: _adapterDigest, ...adapterBase } =
    candidate.provider.adapter;
  const { policyDigest: _dataPolicyDigest, ...dataPolicyBase } =
    candidate.dataPolicy;
  const { lineageDigest: _lineageDigest, ...modelBase } = candidate.model;
  const { profileDigest: _profileDigest, ...profileBase } =
    candidate.capabilityProfile;
  if (
    digestAgentCanonicalValue(adapterBase) !==
      candidate.provider.adapter.adapterDigest ||
    digestAgentCanonicalValue(dataPolicyBase) !==
      candidate.dataPolicy.policyDigest ||
    digestAgentCanonicalValue(modelBase) !== candidate.model.lineageDigest ||
    digestAgentCanonicalValue(profileBase) !==
      candidate.capabilityProfile.profileDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/providerSlice',
        'Provider adapter, data policy, model lineage, or capability profile has drifted.'
      )
    );
  }
  if (
    candidate.provider.dataPolicyDigest !== candidate.dataPolicy.policyDigest
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/provider/dataPolicyDigest',
        'Provider configuration does not bind the evaluated data policy.'
      )
    );
  }
  if (candidate.dataPolicy.ambientMemory !== 'disabled') {
    issues.push(
      issue(
        'AI-6011',
        '/provider/ambientMemory',
        'Provider ambient memory must be disabled for an admitted slice.'
      )
    );
  }
  for (const layer of effective.layers) {
    if (!layerAllowsProvider(layer, candidate)) {
      issues.push(
        issue(
          'AI-6010',
          `/layers/${layer.kind}/providerRules`,
          `The ${layer.kind} policy does not admit this exact provider slice.`
        )
      );
    }
    if (!layerAllowsModel(layer, candidate)) {
      issues.push(
        issue(
          'AI-6010',
          `/layers/${layer.kind}/modelRules`,
          `The ${layer.kind} policy does not admit this exact model/capability slice.`
        )
      );
    }
  }

  const region =
    candidate.dataPolicy.region ?? candidate.provider.providerRegion;
  const isRegionlessLocal =
    candidate.provider.endpointClass === 'local' && region === undefined;
  if (
    !isRegionlessLocal &&
    (!region || !effective.privacy.allowedRegions.includes(region))
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/region',
        'Provider data residency is outside the effective allowed regions.'
      )
    );
  }
  if (
    sensitivityOrder[candidate.sensitivity] >
      sensitivityOrder[effective.privacy.maximumSensitivity] ||
    sensitivityOrder[candidate.sensitivity] >
      sensitivityOrder[candidate.dataPolicy.maximumSensitivity]
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/maximumSensitivity',
        'Provider data policy does not allow the requested sensitivity.'
      )
    );
  }
  if (
    effective.privacy.providerTraining === 'deny' &&
    candidate.dataPolicy.training !== 'disabled'
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/training',
        'Provider training must be disabled by the effective privacy policy.'
      )
    );
  }
  if (
    effective.privacy.providerTelemetry === 'deny' &&
    candidate.dataPolicy.telemetry !== 'disabled'
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/telemetry',
        'Provider telemetry must be disabled by the effective privacy policy.'
      )
    );
  }
  if (
    candidate.dataPolicy.retentionDays >
    effective.retentionRules.providerStateDays
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/retentionDays',
        'Provider retention exceeds the effective retention ceiling.'
      )
    );
  }
  if (
    effective.retentionRules.requireDeletionReceipt &&
    candidate.dataPolicy.retentionDays > 0 &&
    candidate.dataPolicy.deletionReceipt !== 'available'
  ) {
    issues.push(
      issue(
        'AI-6011',
        '/provider/deletionReceipt',
        'A provider deletion receipt is required for retained state.'
      )
    );
  }
  return issues.length > 0
    ? Object.freeze({ allowed: false, issues: Object.freeze(issues) })
    : Object.freeze({
        allowed: true,
        policyDigest: effective.evaluation.effectivePolicyDigest,
      });
};
