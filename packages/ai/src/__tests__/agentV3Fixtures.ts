import type {
  AgentBudget,
  AgentCapabilityGrant,
  AgentToolDescriptor,
  AgentToolRegistrySnapshot,
  AgentWorkspaceRevisionVector,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentToolBudgetProfile,
  createAgentToolConcurrencyPolicy,
  createAgentToolDescriptor,
  createAgentToolRegistrySnapshot,
  createAgentToolTargetScopePolicy,
} from '../hosted/agentToolRegistry';
import { createAgentUsageVector } from '../usage/agentUsage';
import type { AgentBudgetDemand } from '../usage/agentBudgetLedger';

export const V3_NOW = '2026-08-01T06:00:00.000Z';
export const V3_LATER = '2026-08-01T06:00:05.000Z';
export const V3_EXPIRY = '2026-08-01T12:00:00.000Z';

export const V3_REVISION: AgentWorkspaceRevisionVector = Object.freeze({
  workspaceRev: 21,
  routeRev: 5,
  opSeq: 89,
  documents: Object.freeze([
    Object.freeze({ documentId: 'page.catalog', contentRev: 13, metaRev: 2 }),
  ]),
});

export const v3Digest = (value: unknown): string =>
  digestAgentCanonicalValue(value);

const targetScopePolicy = () =>
  createAgentToolTargetScopePolicy({
    allowedTargetKinds: ['document', 'workspace'],
    allowEmpty: false,
    requireExactGrantMatch: false,
  });

const budgetProfile = (sandbox = false) =>
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
    proofDigest: v3Digest(`${execution}-proof`),
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

const descriptorBase = (toolId: string, version = '1.0.0') => ({
  toolId,
  name: toolId,
  version,
  implementationDigest: v3Digest(`${toolId}:implementation`),
  inputSchemaDigest: v3Digest(`${toolId}:input-schema`),
  outputSchemaDigest: v3Digest(`${toolId}:output-schema`),
  operatorId: 'operator.prodivix.test',
  targetScopePolicy: targetScopePolicy(),
  secretPurposeRefs: [] as readonly string[],
  statePolicyDigest: v3Digest(`${toolId}:state-policy`),
  retentionPolicyDigest: v3Digest(`${toolId}:retention-policy`),
  normalizationDigest: v3Digest(`${toolId}:normalization`),
});

export const createV3ReadDescriptor = (): AgentToolDescriptor =>
  createAgentToolDescriptor({
    ...descriptorBase('tool.catalog.search'),
    effect: 'read',
    executionLocus: 'provider-hosted',
    requiredCapabilities: ['read'],
    networkPolicyRef: 'network.public-research',
    budgetProfile: budgetProfile(),
    concurrencyPolicy: parallelPolicy('parallel-read'),
  });

export const createV3ProposalDescriptor = (): AgentToolDescriptor =>
  createAgentToolDescriptor({
    ...descriptorBase('tool.catalog.proposal'),
    effect: 'proposal',
    executionLocus: 'client-hosted',
    requiredCapabilities: ['propose', 'read'],
    budgetProfile: budgetProfile(),
    concurrencyPolicy: parallelPolicy('parallel-stage'),
  });

export const createV3SandboxDescriptor = (): AgentToolDescriptor =>
  createAgentToolDescriptor({
    ...descriptorBase('tool.catalog.sandbox'),
    effect: 'ephemeral-execute',
    executionLocus: 'provider-hosted',
    requiredCapabilities: ['execute', 'read'],
    budgetProfile: budgetProfile(true),
    concurrencyPolicy: serialPolicy(),
  });

export const createV3RuntimeDescriptor = (): AgentToolDescriptor =>
  createAgentToolDescriptor({
    ...descriptorBase('tool.catalog.runtime-check'),
    effect: 'ephemeral-execute',
    executionLocus: 'prodivix-runtime',
    requiredCapabilities: ['execute', 'read'],
    budgetProfile: budgetProfile(true),
    concurrencyPolicy: serialPolicy(),
  });

export const createV3McpDescriptor = (): AgentToolDescriptor =>
  createAgentToolDescriptor({
    ...descriptorBase('tool.catalog.mcp.read'),
    effect: 'read',
    executionLocus: 'pinned-mcp',
    requiredCapabilities: ['read'],
    networkPolicyRef: 'network.public-research',
    budgetProfile: budgetProfile(),
    concurrencyPolicy: parallelPolicy('parallel-read'),
  });

export const createV3Registry = (): AgentToolRegistrySnapshot => {
  const descriptors = [
    createV3ProposalDescriptor(),
    createV3ReadDescriptor(),
    createV3RuntimeDescriptor(),
    createV3SandboxDescriptor(),
    createV3McpDescriptor(),
  ];
  return createAgentToolRegistrySnapshot({
    registryId: 'registry.g4-v3.catalog',
    descriptors,
    searchableDescriptorIds: descriptors.map(({ toolId }) => toolId),
    alwaysVisibleDescriptorIds: ['tool.catalog.search'],
    discoveryPolicyDigest: v3Digest('g4-v3-discovery-policy'),
  });
};

export const V3_BUDGET: AgentBudget = Object.freeze({
  usageLimits: Object.freeze([
    Object.freeze({ unit: 'hosted-tool-call', maximum: '16' }),
    Object.freeze({ unit: 'sandbox-compute-second', maximum: '60' }),
  ]),
  costLimits: Object.freeze([]),
  maxModelInvocations: 0,
  maxToolCalls: 16,
  maxRepairRounds: 0,
  maxTransactions: 0,
  maxArtifactBytes: 262_144,
  maxElapsedMs: 120_000,
});

export const createV3Demand = (
  input: Readonly<{
    elapsedMs?: number;
    artifactBytes?: number;
    sandboxComputeSeconds?: string;
  }> = {}
): AgentBudgetDemand =>
  Object.freeze({
    usage: createAgentUsageVector([
      {
        unit: 'hosted-tool-call',
        logicalAmount: '1',
        confidence: 'measured',
      },
      ...(input.sandboxComputeSeconds
        ? ([
            {
              unit: 'sandbox-compute-second' as const,
              logicalAmount: input.sandboxComputeSeconds,
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
    artifactBytes: input.artifactBytes ?? 0,
    elapsedMs: input.elapsedMs ?? 1000,
  });

export const createV3Grant = (
  registry = createV3Registry()
): AgentCapabilityGrant =>
  Object.freeze({
    grantId: 'grant.g4-v3.catalog',
    subject: Object.freeze({ kind: 'user' as const, principalId: 'user.test' }),
    taskId: 'task.g4-v3.catalog',
    runId: 'run.g4-v3.catalog',
    workspaceId: 'workspace.catalog',
    baseRevision: V3_REVISION,
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'workspace' as const, id: 'workspace.catalog' }),
        Object.freeze({ kind: 'document' as const, id: 'page.catalog' }),
      ]),
    }),
    capabilities: Object.freeze(['execute', 'propose', 'read'] as const),
    toolIds: Object.freeze(registry.descriptors.map(({ toolId }) => toolId)),
    runtimeZones: Object.freeze(['browser', 'sandbox', 'server'] as const),
    networkPolicyRef: 'network.public-research',
    secretRefs: Object.freeze([]),
    limits: Object.freeze({ budget: V3_BUDGET, maxUses: 16 }),
    policyRef: Object.freeze({ documentId: 'policy.g4-v3.catalog' }),
    policyDigest: v3Digest('effective-policy.g4-v3'),
    issuedAt: V3_NOW,
    expiresAt: V3_EXPIRY,
    maxUses: 16,
  });
