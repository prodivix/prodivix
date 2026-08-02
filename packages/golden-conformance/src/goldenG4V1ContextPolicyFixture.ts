import {
  createAgentCapabilityProfile,
  createAgentContextContributorDescriptor,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
  type AgentContextBuildRequest,
  type AgentContextCandidate,
  type AgentContextContributor,
  type AgentContextProviderBinding,
  type AgentEffectivePolicy,
  type AgentPolicy,
  type AgentPolicyLayer,
} from '@prodivix/ai';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  createWorkspaceAgentContextContributors,
  createWorkspaceSemanticIndexFromSnapshot,
} from '@prodivix/workspace';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { GOLDEN_G3_CATALOG_WORKSPACE } from './goldenG3ScenarioFixture';

const PROVIDER_CONFIGURATION_ID = 'provider.g4-v1.catalog';
const MODEL_ID = 'model.g4-v1.catalog';
const PROFILE_ID = 'g4-core-text-code';
const GOLDEN_INSTANT = '2026-08-01T00:00:00.000Z';

const createPolicy = (): AgentPolicy => {
  const base = createDefaultAgentPolicy(
    'agent.policy.g4-v1.catalog',
    'Authenticated Catalog G4 V1 policy'
  );
  return Object.freeze({
    ...base,
    providerRules: Object.freeze([
      Object.freeze({
        id: 'provider.catalog.allow',
        effect: 'allow' as const,
        providerConfigurationIds: Object.freeze([PROVIDER_CONFIGURATION_ID]),
        protocolFamilies: Object.freeze(['openai-responses'] as const),
        endpointClasses: Object.freeze(['first-party-hosted'] as const),
        regions: Object.freeze(['us-east-1']),
        minimumSupportTier: 'admission-only' as const,
        maximumSensitivity: 'internal' as const,
      }),
    ]),
    modelRules: Object.freeze([
      Object.freeze({
        id: 'model.catalog.allow',
        effect: 'allow' as const,
        modelIds: Object.freeze([MODEL_ID]),
        modelFamilyIds: Object.freeze(['family.g4-v1.catalog']),
        capabilityProfileIds: Object.freeze([PROFILE_ID]),
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
      maxItems: 2_048,
      maxBytes: 1_048_576,
      requireSourceTrace: true,
      externalInstructionBoundary: 'data-only' as const,
    }),
    budgetCeiling: Object.freeze({
      usageLimits: Object.freeze([
        Object.freeze({
          unit: 'text-token-input' as const,
          maximum: '100000',
        }),
        Object.freeze({
          unit: 'text-token-output' as const,
          maximum: '10000',
        }),
      ]),
      costLimits: Object.freeze([
        Object.freeze({ currency: 'USD', maximum: '20' }),
      ]),
      maxModelInvocations: 4,
      maxToolCalls: 8,
      maxRepairRounds: 0,
      maxTransactions: 0,
      maxArtifactBytes: 1_048_576,
      maxElapsedMs: 300_000,
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

export const createGoldenG4V1EffectivePolicy = (): AgentEffectivePolicy => {
  const policy = createPolicy();
  const policyDigest = digestAgentPolicy(policy);
  const layers = (
    ['platform', 'organization', 'project', 'actor', 'grant'] as const
  ).map((kind): AgentPolicyLayer =>
    Object.freeze({
      kind,
      issuer: `golden.${kind}`,
      policy,
      policyDigest,
    })
  );
  const result = evaluateEffectiveAgentPolicy({
    projectPolicyRef: { documentId: policy.id },
    layers,
    actorAuthorizationDigest: digestAgentCanonicalValue(
      'golden-catalog-owner:workspace.owner'
    ),
    evaluatedAt: GOLDEN_INSTANT,
  });
  if (!result.ok) {
    throw new Error(
      `Golden G4 V1 effective policy is blocked: ${JSON.stringify(result.issues)}`
    );
  }
  return result.value;
};

export const createGoldenG4V1ProviderBinding = (
  region = 'us-east-1'
): AgentContextProviderBinding => {
  const dataPolicy = createAgentProviderDataPolicy({
    region,
    maximumSensitivity: 'internal',
    training: 'disabled',
    telemetry: 'disabled',
    retentionDays: 0,
    deletionReceipt: 'available',
    ambientMemory: 'disabled',
    storage: 'disabled',
    cacheIsolation: 'task',
  });
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.g4-v1.catalog',
    adapterVersion: '1.0.0',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digestAgentCanonicalValue('catalog-transport-v1'),
    eventNormalizationDigest: digestAgentCanonicalValue(
      'catalog-provider-events-v1'
    ),
  });
  return Object.freeze({
    provider: createAgentProviderConfigurationIdentity({
      providerConfigurationId: PROVIDER_CONFIGURATION_ID,
      providerOperatorId: 'operator.g4-v1.catalog',
      endpointClass: 'first-party-hosted',
      endpointProfileDigest: digestAgentCanonicalValue({ region }),
      providerRegion: region,
      apiRevision: '2026-08-01',
      adapter,
      dataPolicyDigest: dataPolicy.policyDigest,
    }),
    dataPolicy,
  });
};

export const GOLDEN_G4_V1_MODEL = createAgentModelLineage({
  modelId: MODEL_ID,
  modelFamilyId: 'family.g4-v1.catalog',
  modelFamilyOwnerId: 'owner.g4-v1.catalog',
  immutableVersion: '2026-08-01',
});

export const GOLDEN_G4_V1_PROFILE = createAgentCapabilityProfile({
  profileId: PROFILE_ID,
  inputModalityRefs: ['code', 'text'],
  outputModalityRefs: ['text'],
  outputContracts: ['structured', 'text', 'tool-call'],
  toolExecutionLoci: ['client-hosted'],
  deliveryModes: ['response', 'stream'],
  providerStateModes: ['stateless'],
  cacheModes: ['disabled'],
  contextMutationModes: ['none'],
  reasoningModes: ['none', 'summary'],
  featureFlags: [
    'bounded-code-input',
    'bounded-text-input',
    'client-hosted-tool-calling',
    'refusal-normalization',
    'streaming',
    'structured-output',
    'truncation-normalization',
    'usage-reporting',
  ],
  hardLimits: {
    maxInputBytes: 1_048_576,
    maxOutputUnits: [{ unit: 'text-token-output', maximum: '10000' }],
    maxToolCalls: 8,
    maxParallelToolCalls: 1,
    maxBackgroundRuntimeMs: 0,
  },
});

export const createGoldenG4V1ContextRequest = (
  input: Readonly<{
    snapshot?: WorkspaceSnapshot;
    providerBinding?: AgentContextProviderBinding;
    extraContributors?: readonly AgentContextContributor[];
  }> = {}
): AgentContextBuildRequest => {
  const snapshot = input.snapshot ?? GOLDEN_G3_CATALOG_WORKSPACE;
  const semantic = createWorkspaceSemanticIndexFromSnapshot(snapshot);
  if (semantic.status !== 'ready') {
    throw new Error(
      `Golden G4 V1 Semantic Index is blocked: ${JSON.stringify(semantic.issues)}`
    );
  }
  const contributors = createWorkspaceAgentContextContributors({
    snapshot,
    semanticIndex: semantic.index,
    sourceTraces: [
      {
        traceId: 'trace.g4-v1.catalog.workspace',
        targetId: snapshot.id,
        value: {
          authenticatedPrincipal: 'golden-catalog-owner',
          workspaceId: snapshot.id,
          workspaceRev: snapshot.workspaceRev,
        },
      },
    ],
    issues: [
      {
        code: 'G4-GOLDEN-CATALOG',
        severity: 'info',
        domain: 'workspace',
        message: 'Authenticated Catalog context fixture.',
      },
    ],
    verification: [
      {
        ref: 'verification.plan.g4-v1.catalog',
        kind: 'verification-plan',
        digest: digestAgentCanonicalValue('catalog-verification-plan'),
        summary: {
          requiredChecks: ['behavior', 'visual', 'accessibility'],
        },
        sourceTraceRef: 'trace.g4-v1.catalog.workspace',
      },
    ],
  });
  const semanticDescriptor = contributors.find(
    ({ descriptor }) => descriptor.kind === 'semantic-index'
  )?.descriptor;
  if (
    !semanticDescriptor?.semanticSnapshotRef ||
    !semanticDescriptor.semanticProviderSetDigest
  ) {
    throw new Error('Golden G4 V1 Semantic contributor binding is missing.');
  }
  return Object.freeze({
    taskId: 'task.g4-v1.catalog',
    runId: 'run.g4-v1.catalog',
    workspaceRevision: createAgentWorkspaceRevisionFromSnapshot(snapshot),
    semanticSnapshotRef: semanticDescriptor.semanticSnapshotRef,
    semanticProviderSetDigest: semanticDescriptor.semanticProviderSetDigest,
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'workspace' as const, id: snapshot.id }),
      ]),
    }),
    policy: createGoldenG4V1EffectivePolicy(),
    providerSet: Object.freeze([
      input.providerBinding ?? createGoldenG4V1ProviderBinding(),
    ]),
    contributors: Object.freeze([
      ...contributors,
      ...(input.extraContributors ?? []),
    ]),
    budget: Object.freeze({ maxItems: 2_048, maxBytes: 1_048_576 }),
    secretCanaries: Object.freeze(['G4-V1-CATALOG-SECRET-CANARY']),
  });
};

export const createGoldenG4V1ExternalContributor = (
  input: Readonly<{
    contributorId: string;
    content: string;
    revisionOffset?: number;
  }>
): AgentContextContributor => {
  const descriptor = createAgentContextContributorDescriptor({
    contributorId: input.contributorId,
    kind: 'issues',
    implementationDigest: digestAgentCanonicalValue(
      'golden-g4-v1-external-contributor'
    ),
    configurationDigest: digestAgentCanonicalValue(input),
  });
  return Object.freeze({
    descriptor,
    contribute({ workspaceRevision }) {
      const candidate: AgentContextCandidate = Object.freeze({
        kind: 'issue',
        authority: 'external-untrusted',
        source: Object.freeze({ kind: 'issue', id: input.contributorId }),
        revision: Object.freeze({
          ...workspaceRevision,
          workspaceRev:
            workspaceRevision.workspaceRev + (input.revisionOffset ?? 0),
        }),
        mediaType: 'text/plain',
        content: input.content,
        sensitivity: 'internal',
        instructionBoundary: 'data-only',
        sourceTraceRef: 'trace.g4-v1.catalog.workspace',
      });
      return Object.freeze({
        status: 'ready' as const,
        candidates: Object.freeze([candidate]),
      });
    },
  });
};
