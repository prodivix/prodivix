import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import type {
  AgentToolRegistrySnapshot,
  CanonicalDigest,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import type {
  AgentHostedCapabilityIssue,
  AgentMcpServerIdentity,
} from './agentHosted.types';
import {
  assertHostedDigest,
  assertHostedIdentity,
  canonicalHostedDigests,
  createHostedBlockedResult,
} from './agentHostedBoundaryValidation';
import { validateAgentToolRegistrySnapshot } from './agentToolRegistry';

const requiredDisabledCapabilities = Object.freeze([
  'elicitation',
  'filesystem',
  'nested-model-call',
  'notifications',
  'roots',
  'sampling',
] as const);

export const createAgentMcpServerIdentity = (
  input: Omit<AgentMcpServerIdentity, 'identityDigest'>
): AgentMcpServerIdentity => {
  for (const [label, value] of [
    ['MCP server id', input.serverId],
    ['MCP publisher id', input.publisherId],
    ['MCP operator id', input.operatorId],
    ['MCP version', input.version],
  ] as const) {
    assertHostedIdentity(value, label);
  }
  for (const [label, digest] of [
    ['MCP implementation digest', input.implementationDigest],
    ['MCP manifest digest', input.manifestDigest],
    ['MCP transport policy digest', input.transportPolicyDigest],
    ['MCP auth policy digest', input.authPolicyDigest],
    ['MCP network policy digest', input.networkPolicyDigest],
    ['MCP state policy digest', input.statePolicyDigest],
    ['MCP retention policy digest', input.retentionPolicyDigest],
  ] as const) {
    assertHostedDigest(digest, label);
  }
  if (!['stdio', 'streamable-http'].includes(input.transport)) {
    throw new TypeError('MCP transport is invalid.');
  }
  const disabledCapabilities = Object.freeze(
    [...input.disabledCapabilities].sort(compareUnicodeCodePoints)
  );
  if (
    !sameCanonicalJson(disabledCapabilities, requiredDisabledCapabilities) ||
    input.installation !== 'preinstalled' ||
    input.trust !== 'operator-pinned'
  ) {
    throw new TypeError(
      'MCP server is not preinstalled, pinned, and capability-bounded.'
    );
  }
  const base = {
    serverId: input.serverId,
    publisherId: input.publisherId,
    operatorId: input.operatorId,
    version: input.version,
    implementationDigest: input.implementationDigest,
    manifestDigest: input.manifestDigest,
    transport: input.transport,
    transportPolicyDigest: input.transportPolicyDigest,
    authPolicyDigest: input.authPolicyDigest,
    networkPolicyDigest: input.networkPolicyDigest,
    statePolicyDigest: input.statePolicyDigest,
    retentionPolicyDigest: input.retentionPolicyDigest,
    admittedToolDescriptorDigests: canonicalHostedDigests(
      input.admittedToolDescriptorDigests,
      'MCP Tool descriptor digest'
    ),
    disabledCapabilities,
    installation: 'preinstalled' as const,
    trust: 'operator-pinned' as const,
  } as const;
  return Object.freeze({
    ...base,
    identityDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentMcpServerIdentity = (
  identity: AgentMcpServerIdentity
): boolean => {
  try {
    const { identityDigest: _digest, ...base } = identity;
    return sameCanonicalJson(createAgentMcpServerIdentity(base), identity);
  } catch {
    return false;
  }
};

export const admitAgentMcpServer = (
  input: Readonly<{
    identity: AgentMcpServerIdentity;
    registry: AgentToolRegistrySnapshot;
    discoveredDescriptorDigests: readonly CanonicalDigest[];
  }>
):
  | Readonly<{ ok: true; identityDigest: CanonicalDigest }>
  | Readonly<{ ok: false; issues: readonly AgentHostedCapabilityIssue[] }> => {
  if (
    !validateAgentMcpServerIdentity(input.identity) ||
    !validateAgentToolRegistrySnapshot(input.registry)
  ) {
    return createHostedBlockedResult(
      'AI-7014',
      '/mcp',
      'MCP identity or registry is invalid.'
    );
  }
  const registryDigests = new Set(
    input.registry.descriptors
      .filter(({ executionLocus }) => executionLocus === 'pinned-mcp')
      .map(({ descriptorDigest }) => descriptorDigest)
  );
  const admitted = new Set(input.identity.admittedToolDescriptorDigests);
  if (
    input.discoveredDescriptorDigests.some(
      (digest) => !registryDigests.has(digest) || !admitted.has(digest)
    )
  ) {
    return createHostedBlockedResult(
      'AI-7014',
      '/discoveredDescriptorDigests',
      'MCP discovery attempted arbitrary capability expansion.'
    );
  }
  return Object.freeze({
    ok: true,
    identityDigest: input.identity.identityDigest,
  });
};
