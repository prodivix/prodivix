import { describe, expect, it } from 'vitest';
import {
  V3_LATER,
  V3_NOW,
  V3_REVISION,
  createV3Registry,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import {
  createAgentComputerUseSession,
  createAgentHostedSandboxDescriptor,
  createAgentMcpServerIdentity,
} from './agentCapabilityBoundaries';
import {
  decodeAgentHostedFact,
  encodeAgentHostedFact,
  serializeAgentHostedFact,
} from './agentHostedCodec';
import type { AgentHostedFact } from './agentHosted.types';
import {
  createAgentExternalSourceResult,
  createAgentRetrievalIndexIdentity,
} from './agentRetrieval';
import { discoverAgentTools } from './agentToolRegistry';

const createFacts = (): readonly AgentHostedFact[] => {
  const registry = createV3Registry();
  const mcpDescriptor = registry.descriptors.find(
    ({ toolId }) => toolId === 'tool.catalog.mcp.read'
  )!;
  return Object.freeze([
    Object.freeze({
      factType: 'tool-descriptor',
      value: registry.descriptors[0]!,
    }),
    Object.freeze({ factType: 'tool-registry-snapshot', value: registry }),
    Object.freeze({
      factType: 'tool-discovery-receipt',
      value: discoverAgentTools({
        registry,
        invocationId: 'invocation.g4-v3.codec',
        query: 'catalog',
        matchedToolIds: ['tool.catalog.search'],
        expandedToolIds: ['tool.catalog.search'],
      }),
    }),
    Object.freeze({
      factType: 'external-source-result',
      value: createAgentExternalSourceResult({
        sourceResultId: 'source.g4-v3.codec',
        canonicalUrl: 'https://example.com/catalog',
        retrievedAt: V3_LATER,
        availability: 'reference-only',
        providerCitationRef: 'citation.g4-v3.codec',
      }),
    }),
    Object.freeze({
      factType: 'retrieval-index-identity',
      value: createAgentRetrievalIndexIdentity({
        indexId: 'index.g4-v3.codec',
        projectId: 'project.catalog',
        workspaceId: 'workspace.catalog',
        operatorId: 'operator.provider.test',
        corpusRevision: V3_REVISION,
        corpusManifestDigest: v3Digest('codec-corpus'),
        chunkerId: 'chunker.markdown',
        chunkerVersion: '1.0.0',
        chunkerDigest: v3Digest('codec-chunker'),
        embeddingModelDigest: v3Digest('codec-embedding'),
        rankerDigest: v3Digest('codec-ranker'),
        visibilityPolicyDigest: v3Digest('codec-visibility'),
        retentionPolicyDigest: v3Digest('codec-retention'),
        tenantIsolation: 'proven',
        createdAt: V3_NOW,
        expiresAt: '2026-08-02T06:00:00.000Z',
      }),
    }),
    Object.freeze({
      factType: 'hosted-sandbox-descriptor',
      value: createAgentHostedSandboxDescriptor({
        sandboxId: 'sandbox.g4-v3.codec',
        runtimeId: 'runtime.node.24',
        runtimeImageDigest: v3Digest('codec-runtime-image'),
        packageManifestDigest: v3Digest('codec-package-manifest'),
        workspaceMount: 'none',
        network: 'none',
        secretInjection: 'none',
        ambientEnvironment: 'disabled',
        maxInputBytes: 4096,
        maxOutputBytes: 8192,
        maxFiles: 2,
        maxFileBytes: 4096,
        maxElapsedMs: 5000,
        maxComputeSeconds: 5,
        cleanupRequired: true,
      }),
    }),
    Object.freeze({
      factType: 'mcp-server-identity',
      value: createAgentMcpServerIdentity({
        serverId: 'mcp.g4-v3.codec',
        publisherId: 'publisher.prodivix',
        operatorId: 'operator.prodivix.test',
        version: '1.0.0',
        implementationDigest: v3Digest('codec-mcp-implementation'),
        manifestDigest: v3Digest('codec-mcp-manifest'),
        transport: 'stdio',
        transportPolicyDigest: v3Digest('codec-mcp-transport'),
        authPolicyDigest: v3Digest('codec-mcp-auth'),
        networkPolicyDigest: v3Digest('codec-mcp-network'),
        statePolicyDigest: v3Digest('codec-mcp-state'),
        retentionPolicyDigest: v3Digest('codec-mcp-retention'),
        admittedToolDescriptorDigests: [mcpDescriptor.descriptorDigest],
        disabledCapabilities: [
          'sampling',
          'roots',
          'filesystem',
          'elicitation',
          'notifications',
          'nested-model-call',
        ],
        installation: 'preinstalled',
        trust: 'operator-pinned',
      }),
    }),
    Object.freeze({
      factType: 'computer-use-session',
      value: createAgentComputerUseSession({
        sessionId: 'computer.g4-v3.codec',
        taskId: 'task.g4-v3.catalog',
        runId: 'run.g4-v3.catalog',
        generation: 1,
        purpose: 'verification-read-only',
        environment: 'disposable-evaluation',
        browserProfile: 'fresh-disposable',
        workspaceAccess: 'none',
        productionSessionAccess: 'none',
        targetAllowlist: ['test.catalog.page'],
        networkPolicyDigest: v3Digest('codec-computer-network'),
        maxSteps: 4,
        maxElapsedMs: 5000,
        viewportDigest: v3Digest('codec-viewport'),
        browserIdentityDigest: v3Digest('codec-browser'),
        createdAt: V3_NOW,
        expiresAt: '2026-08-01T07:00:00.000Z',
      }),
    }),
  ]);
};

describe('G4 V3 Hosted capability wire codec', () => {
  it('round-trips canonical current facts with a wire-only version', () => {
    for (const fact of createFacts()) {
      const wire = encodeAgentHostedFact(fact);
      expect(wire.wireVersion).toBe(1);
      expect('wireVersion' in fact).toBe(false);
      expect(decodeAgentHostedFact(wire)).toEqual({ ok: true, value: fact });
      expect(JSON.parse(serializeAgentHostedFact(fact))).toEqual(wire);
    }
  });

  it('rejects future versions, unknown fields, unsafe keys, accessors, and digest drift', () => {
    const fact = createFacts()[0]!;
    const wire = encodeAgentHostedFact(fact);
    if (wire.factType !== 'tool-descriptor') {
      throw new Error('Expected the descriptor codec fixture.');
    }
    expect(decodeAgentHostedFact({ ...wire, wireVersion: 2 })).toMatchObject({
      ok: false,
    });
    expect(
      decodeAgentHostedFact({
        ...wire,
        value: { ...wire.value, hiddenCapability: 'workspace.commit' },
      })
    ).toMatchObject({ ok: false });
    expect(
      decodeAgentHostedFact({
        ...wire,
        value: { ...wire.value, descriptorDigest: v3Digest('drift') },
      })
    ).toMatchObject({ ok: false });

    const { descriptorDigest: _descriptorDigest, ...descriptorBase } =
      wire.value;
    const invalidEnumBase = { ...descriptorBase, effect: 'teleport' };
    expect(
      decodeAgentHostedFact({
        ...wire,
        value: {
          ...invalidEnumBase,
          descriptorDigest: v3Digest(invalidEnumBase),
        },
      })
    ).toMatchObject({ ok: false });

    const unsafe = JSON.parse(
      '{"wireVersion":1,"factType":"tool-descriptor","value":{"__proto__":{}}}'
    ) as unknown;
    expect(decodeAgentHostedFact(unsafe)).toMatchObject({
      ok: false,
      issues: [{ path: '/value/__proto__' }],
    });

    let accessed = false;
    const accessor = { wireVersion: 1, factType: 'tool-descriptor' } as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessor, 'value', {
      enumerable: true,
      get() {
        accessed = true;
        return wire.value;
      },
    });
    expect(decodeAgentHostedFact(accessor)).toMatchObject({ ok: false });
    expect(accessed).toBe(false);
  });
});
