import { describe, expect, it } from 'vitest';
import {
  createV3ReadDescriptor,
  createV3Registry,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import {
  createAgentToolDescriptor,
  createAgentToolRegistrySnapshot,
  discoverAgentTools,
  validateAgentToolDescriptor,
  validateAgentToolRegistrySnapshot,
} from './agentToolRegistry';

describe('G4 V3 exact Tool registry and discovery', () => {
  it('freezes descriptor order and only expands tools already matched in the registry', () => {
    const registry = createV3Registry();
    expect(validateAgentToolRegistrySnapshot(registry)).toBe(true);
    expect(registry.descriptors.map(({ toolId }) => toolId)).toEqual(
      [...registry.descriptors.map(({ toolId }) => toolId)].sort()
    );
    expect(
      new Set(registry.descriptors.map(({ executionLocus }) => executionLocus))
    ).toEqual(
      new Set([
        'client-hosted',
        'prodivix-runtime',
        'provider-hosted',
        'pinned-mcp',
      ])
    );

    const receipt = discoverAgentTools({
      registry,
      invocationId: 'invocation.g4-v3.discovery',
      query: 'catalog search',
      matchedToolIds: ['tool.catalog.search', 'tool.catalog.mcp.read'],
      expandedToolIds: ['tool.catalog.search'],
      providerReceiptDigest: v3Digest('provider-discovery-receipt'),
    });
    expect(receipt).toMatchObject({
      registryDigest: registry.registryDigest,
      matchedDescriptorDigests: [
        registry.descriptors.find(
          ({ toolId }) => toolId === 'tool.catalog.mcp.read'
        )!.descriptorDigest,
        registry.descriptors.find(
          ({ toolId }) => toolId === 'tool.catalog.search'
        )!.descriptorDigest,
      ],
      expandedDescriptorDigests: [
        registry.descriptors.find(
          ({ toolId }) => toolId === 'tool.catalog.search'
        )!.descriptorDigest,
      ],
    });
  });

  it('rejects hidden dynamic expansion, digest drift, and model-callable authority tools', () => {
    const registry = createV3Registry();
    expect(() =>
      discoverAgentTools({
        registry,
        invocationId: 'invocation.g4-v3.hidden',
        query: 'hidden tool',
        matchedToolIds: ['tool.catalog.search'],
        expandedToolIds: ['tool.outside.registry'],
      })
    ).toThrow(/registry expansion/iu);

    const descriptor = createV3ReadDescriptor();
    expect(
      validateAgentToolDescriptor({
        ...descriptor,
        outputSchemaDigest: v3Digest('drifted-schema'),
      })
    ).toBe(false);
    expect(
      validateAgentToolRegistrySnapshot({
        ...registry,
        discoveryPolicyDigest: v3Digest('drifted-policy'),
      })
    ).toBe(false);

    expect(() =>
      createAgentToolDescriptor({
        ...descriptor,
        toolId: 'workspace.commit',
        name: 'workspace.commit',
        effect: 'proposal',
        requiredCapabilities: ['propose', 'commit'],
      })
    ).toThrow(/authoring|authority/iu);
    expect(() =>
      createAgentToolRegistrySnapshot({
        registryId: 'registry.invalid',
        descriptors: [descriptor],
        searchableDescriptorIds: ['tool.outside.registry'],
        alwaysVisibleDescriptorIds: [],
        discoveryPolicyDigest: v3Digest('discovery.invalid'),
      })
    ).toThrow(/outside/iu);
  });
});
