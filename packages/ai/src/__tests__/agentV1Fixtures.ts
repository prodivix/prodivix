import {
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
  type AgentEffectivePolicy,
  type AgentPolicy,
  type AgentPolicyLayer,
} from '../index';
import {
  createAgentCapabilityProfile,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
} from '../providers/agentProviderIdentity';

export const TEST_INSTANT = '2026-08-01T00:00:00.000Z';
export const TEST_EXPIRY = '2026-08-01T12:00:00.000Z';

export const testDigest = (value: unknown): string =>
  digestAgentCanonicalValue(value);

export const createV1Policy = (id: string): AgentPolicy => {
  const base = createDefaultAgentPolicy(id, `Policy ${id}`);
  return Object.freeze({
    ...base,
    providerRules: Object.freeze([
      Object.freeze({
        id: 'provider.allow.test',
        effect: 'allow' as const,
        providerConfigurationIds: Object.freeze(['provider.openai.test']),
        protocolFamilies: Object.freeze(['openai-responses'] as const),
        endpointClasses: Object.freeze(['first-party-hosted'] as const),
        regions: Object.freeze(['us-east-1']),
        minimumSupportTier: 'admission-only' as const,
        maximumSensitivity: 'internal' as const,
      }),
    ]),
    modelRules: Object.freeze([
      Object.freeze({
        id: 'model.allow.test',
        effect: 'allow' as const,
        modelIds: Object.freeze(['model.test']),
        modelFamilyIds: Object.freeze(['family.test']),
        capabilityProfileIds: Object.freeze(['g4-core-text-code']),
        minimumSupportTier: 'admission-only' as const,
      }),
    ]),
    contextRules: Object.freeze({
      allowedAuthorities: Object.freeze([
        'canonical',
        'derived',
        'external-untrusted',
        'user-provided',
      ] as const),
      allowedItemKinds: Object.freeze([
        'agent-policy',
        'behavior-scenario',
        'code-reference',
        'issue',
        'semantic-symbol',
        'source-trace',
        'user-intent',
        'verification-closure',
        'verification-evidence',
        'verification-plan',
        'workspace-document',
      ]),
      maximumSensitivity: 'internal' as const,
      maxItems: 128,
      maxBytes: 262_144,
      requireSourceTrace: true,
      externalInstructionBoundary: 'data-only' as const,
    }),
    budgetCeiling: Object.freeze({
      usageLimits: Object.freeze([
        Object.freeze({ unit: 'image' as const, maximum: '8' }),
        Object.freeze({ unit: 'text-token-input' as const, maximum: '10000' }),
        Object.freeze({ unit: 'text-token-output' as const, maximum: '2000' }),
      ]),
      costLimits: Object.freeze([
        Object.freeze({ currency: 'USD', maximum: '10' }),
      ]),
      maxModelInvocations: 8,
      maxToolCalls: 8,
      maxRepairRounds: 1,
      maxTransactions: 1,
      maxArtifactBytes: 1_048_576,
      maxElapsedMs: 300_000,
    }),
    retentionRules: Object.freeze({
      auditDays: 30,
      sanitizedTraceDays: 7,
      rawPrivateArtifactDays: 0,
      providerStateDays: 0,
      requireDeletionReceipt: true,
    }),
    privacy: Object.freeze({
      maximumSensitivity: 'internal' as const,
      allowedRegions: Object.freeze(['us-east-1']),
      providerTraining: 'deny' as const,
      providerTelemetry: 'deny' as const,
      rawArtifactCapture: 'deny' as const,
    }),
  });
};

export const createV1EffectivePolicy = (
  transform?: (
    policy: AgentPolicy,
    kind: AgentPolicyLayer['kind']
  ) => AgentPolicy
): AgentEffectivePolicy => {
  const layers = (
    ['platform', 'organization', 'project', 'actor', 'grant'] as const
  ).map((kind): AgentPolicyLayer => {
    const policy =
      transform?.(createV1Policy(`policy.${kind}`), kind) ??
      createV1Policy(`policy.${kind}`);
    return Object.freeze({
      kind,
      issuer: `issuer.${kind}`,
      policy,
      policyDigest: digestAgentPolicy(policy),
    });
  });
  const result = evaluateEffectiveAgentPolicy({
    projectPolicyRef: { documentId: 'policy.project' },
    layers,
    actorAuthorizationDigest: testDigest('actor-authorization'),
    evaluatedAt: TEST_INSTANT,
  });
  if (!result.ok) {
    throw new Error(result.issues.map(({ message }) => message).join('; '));
  }
  return result.value;
};

export const TEST_ADAPTER = createAgentProviderAdapterIdentity({
  adapterId: 'adapter.openai-responses.test',
  adapterVersion: '1.0.0',
  protocolFamily: 'openai-responses',
  transportSchemaDigest: testDigest('openai-responses-schema'),
  eventNormalizationDigest: testDigest('provider-events-v1'),
});

export const TEST_DATA_POLICY = createAgentProviderDataPolicy({
  region: 'us-east-1',
  maximumSensitivity: 'internal',
  training: 'disabled',
  telemetry: 'disabled',
  retentionDays: 0,
  deletionReceipt: 'available',
  ambientMemory: 'disabled',
  storage: 'disabled',
  cacheIsolation: 'task',
});

export const TEST_PROVIDER = createAgentProviderConfigurationIdentity({
  providerConfigurationId: 'provider.openai.test',
  providerOperatorId: 'operator.openai.test',
  endpointClass: 'first-party-hosted',
  endpointProfileDigest: testDigest('endpoint.openai.test'),
  providerRegion: 'us-east-1',
  apiRevision: '2026-08-01',
  adapter: TEST_ADAPTER,
  dataPolicyDigest: TEST_DATA_POLICY.policyDigest,
});

export const TEST_MODEL = createAgentModelLineage({
  modelId: 'model.test',
  modelFamilyId: 'family.test',
  modelFamilyOwnerId: 'owner.test',
  immutableVersion: '2026-08-01',
});

export const TEST_PROFILE = createAgentCapabilityProfile({
  profileId: 'g4-core-text-code',
  inputModalityRefs: ['text', 'code'],
  outputModalityRefs: ['text'],
  outputContracts: ['structured', 'text', 'tool-call'],
  toolExecutionLoci: ['client-hosted'],
  deliveryModes: ['response', 'stream'],
  providerStateModes: ['stateless'],
  cacheModes: ['disabled'],
  contextMutationModes: ['none'],
  reasoningModes: ['none', 'summary'],
  featureFlags: [
    'bounded-text-input',
    'bounded-code-input',
    'structured-output',
    'client-hosted-tool-calling',
    'streaming',
    'refusal-normalization',
    'truncation-normalization',
    'usage-reporting',
  ],
  hardLimits: {
    maxInputBytes: 262_144,
    maxOutputUnits: [{ unit: 'text-token-output', maximum: '2000' }],
    maxToolCalls: 8,
    maxParallelToolCalls: 1,
    maxBackgroundRuntimeMs: 0,
  },
});
