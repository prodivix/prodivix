import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  AgentCapability,
  AgentToolBudgetProfile,
  AgentToolConcurrencyPolicy,
  AgentToolDescriptor,
  AgentToolRegistrySnapshot,
  AgentToolTargetScopePolicy,
  AgentUsageLimit,
  AgentUsageUnit,
  CanonicalDigest,
} from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentUsageVector,
  normalizeAgentDecimal,
} from '../usage/agentUsage';
import type { AgentToolDiscoveryReceipt } from './agentHosted.types';

const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u;
const forbiddenToolIdentity =
  /(?:^|[._:/-])(?:apply|approve|approval|commit|rollback)(?:$|[._:/-])|(?:^|[._:/-])(?:workspace[._:/-]patch|json[._:/-]patch|file[._:/-]write|secret[._:/-](?:read|value)|deploy)(?:$|[._:/-])/iu;
const forbiddenCapabilities = new Set<AgentCapability>([
  'approve',
  'commit',
  'rollback',
]);
const targetKinds = new Set(['workspace', 'document', 'semantic-target']);
const toolEffects = new Set([
  'read',
  'ephemeral-execute',
  'proposal',
  'external-side-effect',
]);
const executionLoci = new Set([
  'client-hosted',
  'prodivix-runtime',
  'provider-hosted',
  'pinned-mcp',
]);

const assertIdentity = (value: string, label: string): string => {
  if (!identityPattern.test(value) || isUnsafeObjectKey(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
  return value;
};

const assertDigest = (
  value: CanonicalDigest,
  label: string
): CanonicalDigest => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
  return value;
};

const assertCount = (value: number, label: string, minimum = 0): number => {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer >= ${minimum}.`);
  }
  return value;
};

const canonicalIdentities = (
  values: readonly string[],
  label: string
): readonly string[] => {
  const normalized = values.map((value) => assertIdentity(value, label));
  if (new Set(normalized).size !== normalized.length) {
    throw new TypeError(`${label} entries must be unique.`);
  }
  return Object.freeze([...normalized].sort(compareUnicodeCodePoints));
};

const canonicalCapabilities = (
  capabilities: readonly AgentCapability[]
): readonly AgentCapability[] => {
  const allowed = new Set<AgentCapability>([
    'read',
    'execute',
    'propose',
    'approve',
    'commit',
    'rollback',
  ]);
  if (
    capabilities.some((capability) => !allowed.has(capability)) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new TypeError('Tool capabilities must be known and unique.');
  }
  return Object.freeze([...capabilities].sort(compareUnicodeCodePoints));
};

export const createAgentToolTargetScopePolicy = (
  input: Omit<AgentToolTargetScopePolicy, 'policyDigest'>
): AgentToolTargetScopePolicy => {
  const kinds = canonicalIdentities(
    input.allowedTargetKinds,
    'Tool target kind'
  ) as AgentToolTargetScopePolicy['allowedTargetKinds'];
  if (
    kinds.some((kind) => !targetKinds.has(kind)) ||
    typeof input.allowEmpty !== 'boolean' ||
    typeof input.requireExactGrantMatch !== 'boolean'
  ) {
    throw new TypeError('Tool target scope policy is invalid.');
  }
  if (kinds.length === 0 && !input.allowEmpty) {
    throw new TypeError('A non-empty Tool target policy needs a target kind.');
  }
  const base = {
    allowedTargetKinds: kinds,
    allowEmpty: input.allowEmpty,
    requireExactGrantMatch: input.requireExactGrantMatch,
  } as const;
  return Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
};

const canonicalUsageLimits = (
  limits: readonly AgentUsageLimit[]
): readonly AgentUsageLimit[] => {
  const seen = new Set<string>();
  const normalized = limits.map(({ unit, maximum }) => {
    if (seen.has(unit)) {
      throw new TypeError('Tool usage limits must have unique units.');
    }
    seen.add(unit);
    return Object.freeze({ unit, maximum: normalizeAgentDecimal(maximum) });
  });
  const vector = createAgentUsageVector(
    normalized.map(({ unit, maximum }) => ({
      unit: unit as AgentUsageUnit,
      logicalAmount: maximum,
      confidence: 'measured' as const,
    }))
  );
  return Object.freeze(
    vector.amounts.map((amount) =>
      Object.freeze({
        unit: amount.unit,
        maximum: amount.logicalAmount!,
      })
    )
  );
};

export const createAgentToolBudgetProfile = (
  input: Omit<AgentToolBudgetProfile, 'profileDigest'>
): AgentToolBudgetProfile => {
  const base = {
    maxInputBytes: assertCount(input.maxInputBytes, 'Maximum input bytes', 1),
    maxOutputBytes: assertCount(
      input.maxOutputBytes,
      'Maximum output bytes',
      1
    ),
    maxArtifactBytes: assertCount(
      input.maxArtifactBytes,
      'Maximum artifact bytes'
    ),
    maxElapsedMs: assertCount(
      input.maxElapsedMs,
      'Maximum elapsed milliseconds',
      1
    ),
    maxNetworkRequests: assertCount(
      input.maxNetworkRequests,
      'Maximum network requests'
    ),
    maxNestedCalls: assertCount(input.maxNestedCalls, 'Maximum nested calls'),
    usageLimits: canonicalUsageLimits(input.usageLimits),
  } as const;
  return Object.freeze({
    ...base,
    profileDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentToolConcurrencyPolicy = (
  input: Omit<AgentToolConcurrencyPolicy, 'policyDigest'>
): AgentToolConcurrencyPolicy => {
  if (
    !['parallel-read', 'parallel-stage', 'serial'].includes(input.execution) ||
    !['proven', 'not-proven'].includes(input.idempotency) ||
    !['proven', 'not-proven'].includes(input.commutativity) ||
    !['none', 'target', 'runtime', 'session'].includes(input.sharedState)
  ) {
    throw new TypeError('Tool concurrency policy enum is invalid.');
  }
  if (
    input.execution !== 'serial' &&
    (input.idempotency !== 'proven' ||
      input.commutativity !== 'proven' ||
      input.sharedState !== 'none' ||
      !input.proofDigest)
  ) {
    throw new TypeError(
      'Parallel Tool execution requires owner proof and no shared state.'
    );
  }
  if (input.proofDigest) {
    assertDigest(input.proofDigest, 'Concurrency proof digest');
  }
  const base = {
    execution: input.execution,
    idempotency: input.idempotency,
    commutativity: input.commutativity,
    sharedState: input.sharedState,
    maxDepth: assertCount(input.maxDepth, 'Maximum nested depth'),
    maxFanOut: assertCount(input.maxFanOut, 'Maximum fan-out', 1),
    maxTotalCalls: assertCount(input.maxTotalCalls, 'Maximum total calls', 1),
    ...(input.proofDigest ? { proofDigest: input.proofDigest } : {}),
  } as const;
  return Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
};

type AgentToolDescriptorInput = Omit<
  AgentToolDescriptor,
  'descriptorDigest' | 'requiredCapabilities' | 'secretPurposeRefs'
> &
  Readonly<{
    requiredCapabilities: readonly AgentCapability[];
    secretPurposeRefs: readonly string[];
  }>;

export const createAgentToolDescriptor = (
  input: AgentToolDescriptorInput
): AgentToolDescriptor => {
  assertIdentity(input.toolId, 'Tool id');
  assertIdentity(input.name, 'Tool name');
  assertIdentity(input.version, 'Tool version');
  assertIdentity(input.operatorId, 'Tool operator id');
  if (
    !toolEffects.has(input.effect) ||
    !executionLoci.has(input.executionLocus)
  ) {
    throw new TypeError('Tool effect or execution locus is invalid.');
  }
  if (
    forbiddenToolIdentity.test(input.toolId) ||
    forbiddenToolIdentity.test(input.name)
  ) {
    throw new TypeError(
      'Model-callable authoring or authority tools are forbidden.'
    );
  }
  const requiredCapabilities = canonicalCapabilities(
    input.requiredCapabilities
  );
  if (requiredCapabilities.some((value) => forbiddenCapabilities.has(value))) {
    throw new TypeError(
      'Tool descriptors cannot request approval, commit, or rollback authority.'
    );
  }
  if (input.effect === 'read' && !requiredCapabilities.includes('read')) {
    throw new TypeError('Read tools require read capability.');
  }
  if (
    input.effect === 'ephemeral-execute' &&
    !requiredCapabilities.includes('execute')
  ) {
    throw new TypeError(
      'Ephemeral execution tools require execute capability.'
    );
  }
  if (
    input.effect === 'proposal' &&
    !requiredCapabilities.includes('propose')
  ) {
    throw new TypeError('Proposal tools require propose capability.');
  }
  if (input.effect === 'external-side-effect') {
    throw new TypeError(
      'Model-reachable external side effects are outside the G4 registry.'
    );
  }
  if (
    input.concurrencyPolicy.execution === 'parallel-read' &&
    input.effect !== 'read'
  ) {
    throw new TypeError('Only read tools can use parallel-read execution.');
  }
  if (
    input.concurrencyPolicy.execution === 'parallel-stage' &&
    input.effect !== 'proposal'
  ) {
    throw new TypeError(
      'Only proposal tools can use parallel-stage execution.'
    );
  }
  const targetScopePolicy = createAgentToolTargetScopePolicy(
    input.targetScopePolicy
  );
  const budgetProfile = createAgentToolBudgetProfile(input.budgetProfile);
  const concurrencyPolicy = createAgentToolConcurrencyPolicy(
    input.concurrencyPolicy
  );
  for (const [label, value] of [
    ['Implementation digest', input.implementationDigest],
    ['Input schema digest', input.inputSchemaDigest],
    ['Output schema digest', input.outputSchemaDigest],
    ['State policy digest', input.statePolicyDigest],
    ['Retention policy digest', input.retentionPolicyDigest],
    ['Normalization digest', input.normalizationDigest],
  ] as const) {
    assertDigest(value, label);
  }
  const base = {
    toolId: input.toolId,
    name: input.name,
    version: input.version,
    implementationDigest: input.implementationDigest,
    inputSchemaDigest: input.inputSchemaDigest,
    outputSchemaDigest: input.outputSchemaDigest,
    effect: input.effect,
    executionLocus: input.executionLocus,
    operatorId: input.operatorId,
    requiredCapabilities,
    targetScopePolicy,
    ...(input.networkPolicyRef
      ? {
          networkPolicyRef: assertIdentity(
            input.networkPolicyRef,
            'Network policy ref'
          ),
        }
      : {}),
    secretPurposeRefs: canonicalIdentities(
      input.secretPurposeRefs,
      'Secret purpose ref'
    ),
    statePolicyDigest: input.statePolicyDigest,
    retentionPolicyDigest: input.retentionPolicyDigest,
    budgetProfile,
    concurrencyPolicy,
    normalizationDigest: input.normalizationDigest,
  } as const;
  return Object.freeze({
    ...base,
    descriptorDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentToolDescriptor = (
  descriptor: AgentToolDescriptor
): boolean => {
  try {
    const { descriptorDigest: _digest, ...base } = descriptor;
    return (
      sameCanonicalJson(createAgentToolDescriptor(base), descriptor) &&
      digestAgentCanonicalValue(base) === descriptor.descriptorDigest
    );
  } catch {
    return false;
  }
};

export const createAgentToolRegistrySnapshot = (
  input: Omit<AgentToolRegistrySnapshot, 'registryDigest'>
): AgentToolRegistrySnapshot => {
  assertIdentity(input.registryId, 'Tool registry id');
  assertDigest(input.discoveryPolicyDigest, 'Discovery policy digest');
  if (
    input.descriptors.some(
      (descriptor) => !validateAgentToolDescriptor(descriptor)
    )
  ) {
    throw new TypeError('Tool registry contains an invalid descriptor.');
  }
  const descriptors = Object.freeze(
    [...input.descriptors].sort((left, right) =>
      compareUnicodeCodePoints(left.toolId, right.toolId)
    )
  );
  if (
    new Set(descriptors.map(({ toolId }) => toolId)).size !== descriptors.length
  ) {
    throw new TypeError('Tool registry ids must be unique.');
  }
  const searchableDescriptorIds = canonicalIdentities(
    input.searchableDescriptorIds,
    'Searchable Tool id'
  );
  const alwaysVisibleDescriptorIds = canonicalIdentities(
    input.alwaysVisibleDescriptorIds,
    'Always-visible Tool id'
  );
  const known = new Set(descriptors.map(({ toolId }) => toolId));
  if (
    [...searchableDescriptorIds, ...alwaysVisibleDescriptorIds].some(
      (toolId) => !known.has(toolId)
    )
  ) {
    throw new TypeError('Tool visibility cannot expand outside the registry.');
  }
  const base = {
    registryId: input.registryId,
    descriptors,
    searchableDescriptorIds,
    alwaysVisibleDescriptorIds,
    discoveryPolicyDigest: input.discoveryPolicyDigest,
  } as const;
  return Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentToolRegistrySnapshot = (
  registry: AgentToolRegistrySnapshot
): boolean => {
  try {
    const { registryDigest: _digest, ...base } = registry;
    return (
      sameCanonicalJson(createAgentToolRegistrySnapshot(base), registry) &&
      digestAgentCanonicalValue(base) === registry.registryDigest
    );
  } catch {
    return false;
  }
};

export const discoverAgentTools = (
  input: Readonly<{
    registry: AgentToolRegistrySnapshot;
    invocationId: string;
    query: string;
    matchedToolIds: readonly string[];
    expandedToolIds: readonly string[];
    providerReceiptDigest?: CanonicalDigest;
  }>
): AgentToolDiscoveryReceipt => {
  if (!validateAgentToolRegistrySnapshot(input.registry)) {
    throw new TypeError('Tool discovery requires an exact registry snapshot.');
  }
  assertIdentity(input.invocationId, 'Invocation id');
  if (
    !input.query.trim() ||
    new TextEncoder().encode(input.query).byteLength > 4096
  ) {
    throw new TypeError('Tool discovery query is empty or oversized.');
  }
  const matchedIds = canonicalIdentities(
    input.matchedToolIds,
    'Matched Tool id'
  );
  const expandedIds = canonicalIdentities(
    input.expandedToolIds,
    'Expanded Tool id'
  );
  const searchable = new Set(input.registry.searchableDescriptorIds);
  const matched = new Set(matchedIds);
  if (
    matchedIds.some((toolId) => !searchable.has(toolId)) ||
    expandedIds.some((toolId) => !matched.has(toolId))
  ) {
    throw new TypeError('Dynamic Tool discovery attempted registry expansion.');
  }
  if (input.providerReceiptDigest) {
    assertDigest(
      input.providerReceiptDigest,
      'Provider discovery receipt digest'
    );
  }
  const byId = new Map(
    input.registry.descriptors.map((descriptor) => [
      descriptor.toolId,
      descriptor,
    ])
  );
  const base = {
    invocationId: input.invocationId,
    registryDigest: input.registry.registryDigest,
    queryDigest: digestAgentCanonicalValue(input.query),
    matchedDescriptorDigests: Object.freeze(
      matchedIds.map((toolId) => byId.get(toolId)!.descriptorDigest)
    ),
    expandedDescriptorDigests: Object.freeze(
      expandedIds.map((toolId) => byId.get(toolId)!.descriptorDigest)
    ),
    ...(input.providerReceiptDigest
      ? { providerReceiptDigest: input.providerReceiptDigest }
      : {}),
  } as const;
  return Object.freeze({
    ...base,
    receiptDigest: digestAgentCanonicalValue(base),
  });
};
