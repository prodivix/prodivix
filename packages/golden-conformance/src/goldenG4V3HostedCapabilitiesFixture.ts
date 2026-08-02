import {
  createAgentToolBudgetProfile,
  createAgentToolConcurrencyPolicy,
  createAgentToolDescriptor,
  createAgentToolRegistrySnapshot,
  createAgentToolTargetScopePolicy,
  createAgentUsageVector,
  digestAgentCanonicalValue,
  type AgentBudget,
  type AgentBudgetDemand,
  type AgentCapabilityGrant,
  type AgentContextBuildRequest,
  type AgentToolDescriptor,
  type AgentToolRegistrySnapshot,
} from '@prodivix/ai';
import { createGoldenG4V1ContextRequest } from './goldenG4V1ContextPolicyFixture';

export const GOLDEN_G4_V3_NOW = '2026-08-01T06:00:00.000Z';
export const GOLDEN_G4_V3_LATER = '2026-08-01T06:00:05.000Z';

const digest = digestAgentCanonicalValue;

const targetPolicy = () =>
  createAgentToolTargetScopePolicy({
    allowedTargetKinds: ['workspace'],
    allowEmpty: false,
    requireExactGrantMatch: true,
  });

const toolBudget = (sandbox = false) =>
  createAgentToolBudgetProfile({
    maxInputBytes: 4096,
    maxOutputBytes: 8192,
    maxArtifactBytes: 16_384,
    maxElapsedMs: 10_000,
    maxNetworkRequests: sandbox ? 0 : 2,
    maxNestedCalls: 2,
    usageLimits: [
      { unit: 'hosted-tool-call', maximum: '1' },
      ...(sandbox
        ? ([{ unit: 'sandbox-compute-second', maximum: '10' }] as const)
        : []),
    ],
  });

const parallelPolicy = (execution: 'parallel-read' | 'parallel-stage') =>
  createAgentToolConcurrencyPolicy({
    execution,
    idempotency: 'proven',
    commutativity: 'proven',
    sharedState: 'none',
    maxDepth: 2,
    maxFanOut: 4,
    maxTotalCalls: 8,
    proofDigest: digest(`golden-${execution}-proof`),
  });

const serialPolicy = () =>
  createAgentToolConcurrencyPolicy({
    execution: 'serial',
    idempotency: 'not-proven',
    commutativity: 'not-proven',
    sharedState: 'runtime',
    maxDepth: 1,
    maxFanOut: 1,
    maxTotalCalls: 4,
  });

const descriptor = (
  toolId: string,
  input: Pick<
    AgentToolDescriptor,
    'effect' | 'executionLocus' | 'requiredCapabilities'
  > &
    Readonly<{
      concurrencyPolicy: ReturnType<typeof serialPolicy>;
      networkPolicyRef?: string;
      sandbox?: boolean;
    }>
): AgentToolDescriptor =>
  createAgentToolDescriptor({
    toolId,
    name: toolId,
    version: '1.0.0',
    implementationDigest: digest(`${toolId}:implementation`),
    inputSchemaDigest: digest(`${toolId}:input`),
    outputSchemaDigest: digest(`${toolId}:output`),
    effect: input.effect,
    executionLocus: input.executionLocus,
    operatorId: 'operator.golden.g4-v3',
    requiredCapabilities: input.requiredCapabilities,
    targetScopePolicy: targetPolicy(),
    ...(input.networkPolicyRef
      ? { networkPolicyRef: input.networkPolicyRef }
      : {}),
    secretPurposeRefs: [],
    statePolicyDigest: digest(`${toolId}:state`),
    retentionPolicyDigest: digest(`${toolId}:retention`),
    budgetProfile: toolBudget(input.sandbox),
    concurrencyPolicy: input.concurrencyPolicy,
    normalizationDigest: digest(`${toolId}:normalization`),
  });

export const createGoldenG4V3Registry = (): AgentToolRegistrySnapshot => {
  const descriptors = [
    descriptor('tool.golden.catalog.search', {
      effect: 'read',
      executionLocus: 'provider-hosted',
      requiredCapabilities: ['read'],
      networkPolicyRef: 'network.golden.public-research',
      concurrencyPolicy: parallelPolicy('parallel-read'),
    }),
    descriptor('tool.golden.catalog.proposal', {
      effect: 'proposal',
      executionLocus: 'client-hosted',
      requiredCapabilities: ['propose', 'read'],
      concurrencyPolicy: parallelPolicy('parallel-stage'),
    }),
    descriptor('tool.golden.catalog.runtime', {
      effect: 'ephemeral-execute',
      executionLocus: 'prodivix-runtime',
      requiredCapabilities: ['execute', 'read'],
      concurrencyPolicy: serialPolicy(),
      sandbox: true,
    }),
    descriptor('tool.golden.catalog.mcp', {
      effect: 'read',
      executionLocus: 'pinned-mcp',
      requiredCapabilities: ['read'],
      networkPolicyRef: 'network.golden.public-research',
      concurrencyPolicy: parallelPolicy('parallel-read'),
    }),
  ];
  return createAgentToolRegistrySnapshot({
    registryId: 'registry.golden.g4-v3.catalog',
    descriptors,
    searchableDescriptorIds: descriptors.map(({ toolId }) => toolId),
    alwaysVisibleDescriptorIds: ['tool.golden.catalog.search'],
    discoveryPolicyDigest: digest('golden-g4-v3-discovery-policy'),
  });
};

export const GOLDEN_G4_V3_BUDGET: AgentBudget = Object.freeze({
  usageLimits: Object.freeze([
    Object.freeze({ unit: 'hosted-tool-call', maximum: '16' }),
    Object.freeze({ unit: 'sandbox-compute-second', maximum: '30' }),
  ]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 0,
  maxToolCalls: 16,
  maxRepairRounds: 0,
  maxTransactions: 0,
  maxArtifactBytes: 262_144,
  maxElapsedMs: 120_000,
});

export const createGoldenG4V3Demand = (
  sandboxComputeSeconds?: string
): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([
      {
        unit: 'hosted-tool-call',
        logicalAmount: '1',
        confidence: 'measured',
      },
      ...(sandboxComputeSeconds
        ? ([
            {
              unit: 'sandbox-compute-second' as const,
              logicalAmount: sandboxComputeSeconds,
              confidence: 'measured' as const,
            },
          ] as const)
        : []),
    ]),
    cost: Object.freeze([]),
    modelInvocations: 0,
    toolCalls: 1,
    repairRounds: 0,
    transactions: 0,
    artifactBytes: 0,
    elapsedMs: 1000,
  });

export const createGoldenG4V3Grant = (
  input: Readonly<{
    context: AgentContextBuildRequest;
    registry: AgentToolRegistrySnapshot;
  }>
): AgentCapabilityGrant =>
  Object.freeze({
    grantId: 'grant.golden.g4-v3.catalog',
    subject: Object.freeze({
      kind: 'user' as const,
      principalId: 'golden-catalog-owner',
    }),
    taskId: input.context.taskId,
    runId: input.context.runId,
    workspaceId: input.context.targetScope.targets[0]!.id,
    baseRevision: input.context.workspaceRevision,
    targetScope: input.context.targetScope,
    capabilities: Object.freeze(['execute', 'propose', 'read'] as const),
    toolIds: Object.freeze(
      input.registry.descriptors.map(({ toolId }) => toolId)
    ),
    runtimeZones: Object.freeze(['browser', 'sandbox', 'server'] as const),
    networkPolicyRef: 'network.golden.public-research',
    secretRefs: Object.freeze([]),
    limits: Object.freeze({ budget: GOLDEN_G4_V3_BUDGET, maxUses: 16 }),
    policyRef: input.context.policy.evaluation.projectPolicyRef,
    policyDigest: input.context.policy.evaluation.effectivePolicyDigest,
    issuedAt: GOLDEN_G4_V3_NOW,
    expiresAt: '2026-08-01T12:00:00.000Z',
    maxUses: 16,
  });

export const createGoldenG4V3Context = createGoldenG4V1ContextRequest;
