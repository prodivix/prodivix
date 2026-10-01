import {
  createAgentCapabilityProfile,
  createAgentInferenceConfiguration,
  createAgentModelLineage,
  createAgentProviderAdapterIdentity,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
  createAgentTaskRecord,
  createAgentUsageVector,
  createDefaultAgentPolicy,
  digestAgentCanonicalValue,
  digestAgentPolicy,
  evaluateEffectiveAgentPolicy,
  type AgentPolicy,
  type AgentTaskMode,
} from '@prodivix/ai';
import {
  createAgentWorkspaceRevisionFromSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  AGENT_RUNTIME_OUTPUT_SCHEMA,
  AGENT_RUNTIME_PROMPT_POLICY,
} from '#src/composition.js';
import type {
  AgentRuntimeBinding,
  AgentRuntimeConfiguration,
} from '#src/config.js';

export const time = '2026-10-01T00:00:00.000Z';
export const expiry = '2026-10-01T01:00:00.000Z';
const digest = digestAgentCanonicalValue;

/** Deterministic fixtures only; these identities and admission vectors are never release evidence. */
export const runtimeFixture = (mode: AgentTaskMode = 'explain') => {
  const endpoint = 'https://model.invalid/v1/responses';
  const endpointProfile = {
    endpoint,
    method: 'POST' as const,
    redirectPolicy: 'deny' as const,
  };
  const policy: AgentPolicy = {
    ...createDefaultAgentPolicy('policy.runtime'),
    providerRules: [
      {
        id: 'allow.provider',
        effect: 'allow',
        providerConfigurationIds: ['provider.fixture'],
        protocolFamilies: ['openai-responses'],
        endpointClasses: ['first-party-hosted'],
        regions: ['us'],
        minimumSupportTier: 'admission-only',
        maximumSensitivity: 'internal',
      },
    ],
    modelRules: [
      {
        id: 'allow.model',
        effect: 'allow',
        modelIds: ['model.fixture'],
        modelFamilyIds: ['family.fixture'],
        capabilityProfileIds: ['profile.fixture'],
        minimumSupportTier: 'admission-only',
      },
    ],
    capabilityRules: [
      {
        id: 'allow.execute',
        effect: 'allow',
        capabilities: ['execute', 'propose', 'read'],
        targetScope: {
          targets: [{ kind: 'workspace', id: 'workspace.runtime' }],
        },
        toolIds: [],
        runtimeZones: ['server'],
        maximumRisk: 'critical',
      },
    ],
    networkRules: [
      {
        id: 'network.fixture',
        effect: 'allow',
        hosts: ['model.invalid'],
        methods: ['POST'],
        maxRequestBytes: 1_048_576,
        maxResponseBytes: 1_048_576,
        redirectPolicy: 'deny',
        tls: 'required',
      },
    ],
    secretRules: [
      {
        id: 'secret.fixture',
        effect: 'allow',
        referenceKinds: ['environment'],
        purposes: ['model-invocation'],
        runtimeZones: ['server'],
      },
    ],
    budgetCeiling: {
      usageLimits: [
        { unit: 'text-token-input', maximum: '10000' },
        { unit: 'text-token-output', maximum: '2000' },
      ],
      costLimits: [],
      maxModelInvocations: 1,
      maxToolCalls: 0,
      maxRepairRounds: 0,
      maxTransactions: 1,
      maxArtifactBytes: 0,
      maxElapsedMs: 60_000,
    },
    privacy: {
      ...createDefaultAgentPolicy('policy.runtime').privacy,
      allowedRegions: ['us'],
    },
  };
  const workspace: WorkspaceSnapshot = {
    id: 'workspace.runtime',
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['node.policy', 'node.code'],
      },
      'node.policy': {
        id: 'node.policy',
        kind: 'doc',
        name: 'policy.json',
        parentId: 'root',
        docId: policy.id,
      },
      'node.code': {
        id: 'node.code',
        kind: 'doc',
        name: 'entry.ts',
        parentId: 'root',
        docId: 'code.entry',
      },
    },
    docsById: {
      [policy.id]: {
        id: policy.id,
        type: 'agent-policy',
        path: '/policy.json',
        contentRev: 1,
        metaRev: 1,
        content: policy,
      },
      'code.entry': {
        id: 'code.entry',
        type: 'code',
        path: '/entry.ts',
        contentRev: 1,
        metaRev: 1,
        content: { language: 'ts', source: 'export const count = 1;' },
      },
    },
    routeManifest: { version: '1', root: { id: 'route.root' } },
  };
  const task = createAgentTaskRecord({
    taskId: `task.runtime.${mode}`,
    projectId: 'project.runtime',
    workspaceId: workspace.id,
    actor: { kind: 'user', principalId: 'user.fixture' },
    mode,
    baseRevision: createAgentWorkspaceRevisionFromSnapshot(workspace),
    intent: 'Explain the current exported count.',
    intentDigest: digest('Explain the current exported count.'),
    targetScope: { targets: [{ kind: 'workspace', id: workspace.id }] },
    policyRef: { documentId: policy.id },
    policyDigest: digestAgentPolicy(policy),
    initialGrantRef: { grantId: 'grant.fixture' },
    budget: policy.budgetCeiling,
    verificationRequirement: {
      policyRef: 'verification.fixture',
      requiredCheckKinds: ['typecheck'],
    },
    createdAt: time,
    idempotencyKey: `task.runtime.${mode}`,
  });
  const effective = evaluateEffectiveAgentPolicy({
    projectPolicyRef: task.spec.policyRef,
    actorAuthorizationDigest: digest('actor.fixture'),
    evaluatedAt: time,
    layers: (['platform', 'project', 'actor', 'grant'] as const).map(
      (kind) => ({
        kind,
        issuer: `fixture.${kind}`,
        policy,
        policyDigest: digestAgentPolicy(policy),
      })
    ),
  });
  if (!effective.ok) throw new Error('Fixture effective policy failed.');
  const adapter = createAgentProviderAdapterIdentity({
    adapterId: 'adapter.fixture',
    adapterVersion: '1',
    protocolFamily: 'openai-responses',
    transportSchemaDigest: digest('fixture.schema'),
    eventNormalizationDigest: digest('fixture.normalization'),
  });
  const dataPolicy = createAgentProviderDataPolicy({
    region: 'us',
    maximumSensitivity: 'internal',
    training: 'disabled',
    telemetry: 'disabled',
    retentionDays: 0,
    deletionReceipt: 'available',
    ambientMemory: 'disabled',
    storage: 'disabled',
    cacheIsolation: 'task',
  });
  const provider = createAgentProviderConfigurationIdentity({
    providerConfigurationId: 'provider.fixture',
    providerOperatorId: 'operator.fixture',
    endpointClass: 'first-party-hosted',
    endpointProfileDigest: digest(endpointProfile),
    providerRegion: 'us',
    adapter,
    dataPolicyDigest: dataPolicy.policyDigest,
  });
  const model = createAgentModelLineage({
    modelId: 'model.fixture',
    modelFamilyId: 'family.fixture',
    modelFamilyOwnerId: 'owner.fixture',
    immutableVersion: 'fixture',
  });
  const capabilityProfile = createAgentCapabilityProfile({
    profileId: 'profile.fixture',
    inputModalityRefs: ['text', 'code'],
    outputModalityRefs: ['text'],
    outputContracts: ['structured', 'text'],
    toolExecutionLoci: [],
    deliveryModes: ['stream'],
    providerStateModes: ['stateless'],
    cacheModes: ['disabled'],
    contextMutationModes: ['none'],
    reasoningModes: ['none'],
    featureFlags: [
      'bounded-text-input',
      'bounded-code-input',
      'structured-output',
      'streaming',
      'usage-reporting',
    ],
    hardLimits: {
      maxInputBytes: 262_144,
      maxOutputUnits: [{ unit: 'text-token-output', maximum: '2000' }],
      maxToolCalls: 0,
      maxParallelToolCalls: 1,
      maxBackgroundRuntimeMs: 0,
    },
  });
  const qualificationBase = {
    provider,
    model,
    capabilityProfileDigest: capabilityProfile.profileDigest,
    policyProfileDigest: effective.value.evaluation.effectivePolicyDigest,
    declaredCapabilityDigest: digest('fixture.declared'),
    probedCapabilityDigest: digest('fixture.probed'),
    supportTier: 'admission-only' as const,
    evaluatedAt: time,
    expiresAt: expiry,
  };
  const binding: AgentRuntimeBinding = {
    taskId: task.spec.taskId,
    catalog: { provider, model, dataPolicy, capabilityProfile },
    qualification: {
      ...qualificationBase,
      qualificationDigest: digest(qualificationBase),
    },
    inference: createAgentInferenceConfiguration({
      maxOutputUnits: { unit: 'text-token-output', maximum: '2000' },
      reasoningMode: 'none',
      outputSchemaDigest: digest(AGENT_RUNTIME_OUTPUT_SCHEMA),
      promptPolicyDigest: digest(AGENT_RUNTIME_PROMPT_POLICY),
      toolRegistryDigest: digest([]),
      toolChoicePolicy: 'none',
      parallelToolPolicy: 'forbidden',
      providerStateMode: 'stateless',
      contextMutationMode: 'none',
      cacheMode: 'disabled',
      deliveryMode: 'stream',
    }),
    policy: effective.value,
    grant: {
      grantId: 'grant.fixture',
      subject: task.spec.actor,
      taskId: task.spec.taskId,
      workspaceId: workspace.id,
      baseRevision: task.spec.baseRevision,
      targetScope: task.spec.targetScope,
      capabilities: ['execute', 'propose', 'read'],
      toolIds: [],
      runtimeZones: ['server'],
      networkPolicyRef: 'network.fixture',
      secretRefs: [
        {
          kind: 'environment',
          referenceId: 'MODEL_FIXTURE_KEY',
          purpose: 'model-invocation',
        },
      ],
      limits: { budget: task.spec.budget, maxUses: 1 },
      policyRef: task.spec.policyRef,
      policyDigest: task.spec.policyDigest,
      issuedAt: time,
      expiresAt: expiry,
      maxUses: 1,
    },
    reservation: {
      usage: createAgentUsageVector([
        {
          unit: 'text-token-input',
          logicalAmount: '10000',
          billableAmount: '10000',
          confidence: 'estimated',
        },
        {
          unit: 'text-token-output',
          logicalAmount: '2000',
          billableAmount: '2000',
          confidence: 'estimated',
        },
      ]),
      cost: [],
      modelInvocations: 1,
      toolCalls: 0,
      repairRounds: 0,
      transactions: 0,
      artifactBytes: 0,
      elapsedMs: 60_000,
    },
    transport: {
      endpoint,
      endpointProfile,
      credentialEnvironmentVariable: 'MODEL_FIXTURE_KEY',
    },
  };
  const config: AgentRuntimeConfiguration = {
    backendURL: 'http://127.0.0.1:8080/api',
    workerId: 'worker.fixture',
    bearerEnvironmentVariable: 'WORKER_FIXTURE_TOKEN',
    pollIntervalMs: 1_000,
    leaseMs: 300_000,
    bindings: [binding],
  };
  return { task, workspace, binding, config };
};
