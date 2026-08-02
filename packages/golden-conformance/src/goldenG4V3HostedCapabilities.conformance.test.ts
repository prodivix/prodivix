import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  admitAgentHostedSandbox,
  admitAgentMcpServer,
  admitAgentRetrievalIndex,
  authorizeAgentComputerUseAction,
  createAgentBudgetLedger,
  createAgentComputerUseSession,
  createAgentExternalSourceResult,
  createAgentHostedSandboxDescriptor,
  createAgentManagedAgentAdmission,
  createAgentMcpServerIdentity,
  createAgentParallelToolPlan,
  createAgentRetrievalIndexIdentity,
  createAgentToolCleanupReceipt,
  createScriptedAgentHostedToolAdapter,
  decodeAgentHostedFact,
  digestAgentCanonicalValue,
  discoverAgentTools,
  encodeAgentHostedFact,
  executeAgentHostedToolCall,
  joinAgentParallelToolResults,
  type AgentParallelToolCall,
  type AgentToolCallRequest,
  type AgentToolFenceState,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  GOLDEN_G4_V3_LATER,
  GOLDEN_G4_V3_NOW,
  createGoldenG4V3Context,
  createGoldenG4V3Demand,
  createGoldenG4V3Grant,
  createGoldenG4V3Registry,
} from './goldenG4V3HostedCapabilitiesFixture';

const digest = digestAgentCanonicalValue;

describe('Golden G4 V3 authenticated Catalog Hosted capability boundary', () => {
  it('discovers only the frozen Provider tool and runs it through the exact per-call fence', async () => {
    const context = createGoldenG4V3Context();
    const registry = createGoldenG4V3Registry();
    const grant = createGoldenG4V3Grant({ context, registry });
    const descriptor = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.golden.catalog.search'
    )!;
    const discovery = discoverAgentTools({
      registry,
      invocationId: 'invocation.golden.g4-v3.catalog',
      query: 'authenticated catalog product facts',
      matchedToolIds: [descriptor.toolId],
      expandedToolIds: [descriptor.toolId],
    });
    expect(discovery.expandedDescriptorDigests).toEqual([
      descriptor.descriptorDigest,
    ]);
    expect(() =>
      discoverAgentTools({
        registry,
        invocationId: 'invocation.golden.g4-v3.hidden',
        query: 'hidden capability',
        matchedToolIds: [descriptor.toolId],
        expandedToolIds: ['tool.marketplace.hidden'],
      })
    ).toThrow(/registry expansion/iu);

    const payload = Object.freeze({ query: 'catalog products' });
    const request: AgentToolCallRequest = Object.freeze({
      identity: Object.freeze({
        callId: 'call.golden.g4-v3.catalog-search',
        invocationId: 'invocation.golden.g4-v3.catalog',
        taskId: context.taskId,
        runId: context.runId,
        generation: 1,
        depth: 0,
      }),
      registryDigest: registry.registryDigest,
      descriptorDigest: descriptor.descriptorDigest,
      grant,
      effectivePolicyDigest: context.policy.evaluation.effectivePolicyDigest,
      contextPackDigest: digest('golden-g4-v3-context-pack'),
      capabilityQualificationDigest: digest('golden-g4-v3-qualification'),
      runtimeZone: 'server',
      workspaceRevision: context.workspaceRevision,
      targetScope: context.targetScope,
      inputDigest: digest(payload),
      inputByteLength: new TextEncoder().encode(canonicalJsonText(payload))
        .byteLength,
      observability: 'per-call',
      budgetDemand: createGoldenG4V3Demand(),
      requestedAt: GOLDEN_G4_V3_NOW,
    });
    const fence = (): AgentToolFenceState =>
      Object.freeze({
        taskId: context.taskId,
        runId: context.runId,
        generation: 1,
        registryDigest: registry.registryDigest,
        descriptorDigest: descriptor.descriptorDigest,
        effectivePolicyDigest: context.policy.evaluation.effectivePolicyDigest,
        contextPackDigest: request.contextPackDigest,
        grantId: grant.grantId,
        revoked: false,
        at: GOLDEN_G4_V3_LATER,
      });
    const result = await executeAgentHostedToolCall({
      request,
      registry,
      ledger: createAgentBudgetLedger(grant.limits.budget),
      payload,
      currentGeneration: 1,
      preflightAt: GOLDEN_G4_V3_NOW,
      readFence: fence,
      adapter: createScriptedAgentHostedToolAdapter({
        descriptorDigest: descriptor.descriptorDigest,
        async execute() {
          return Object.freeze({
            status: 'succeeded' as const,
            output: Object.freeze({
              products: Object.freeze(['Catalog Product A']),
              authority: 'external-untrusted',
              instructionBoundary: 'data-only',
            }),
            artifactRefs: Object.freeze([]),
            actualDemand: createGoldenG4V3Demand(),
            completedAt: GOLDEN_G4_V3_LATER,
            cleanup: createAgentToolCleanupReceipt({
              cleanupId: 'cleanup.golden.g4-v3.catalog-search',
              residualState: 'none',
              providerStateDeleted: false,
              completedAt: GOLDEN_G4_V3_LATER,
            }),
          });
        },
      }),
    });
    expect(result).toMatchObject({
      status: 'completed',
      receipt: {
        terminalStatus: 'succeeded',
        resultDisposition: 'context-data-only',
      },
      ledger: { revision: 2 },
    });
  });

  it('canonically joins independent reads and fences late siblings', () => {
    const registry = createGoldenG4V3Registry();
    const descriptor = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.golden.catalog.search'
    )!;
    const calls: readonly AgentParallelToolCall[] = Object.freeze(
      ['details', 'inventory'].map((name) =>
        Object.freeze({
          callId: `call.golden.g4-v3.${name}`,
          descriptorDigest: descriptor.descriptorDigest,
          effect: 'read' as const,
          concurrencyPolicyDigest: descriptor.concurrencyPolicy.policyDigest,
          targetScopeDigest: digest(`target-${name}`),
          sourceSnapshotDigest: digest(`snapshot-${name}`),
          inputDigest: digest(`input-${name}`),
        })
      )
    );
    const planned = createAgentParallelToolPlan({
      groupId: 'group.golden.g4-v3.catalog-read',
      taskId: 'task.g4-v1.catalog',
      runId: 'run.g4-v1.catalog',
      generation: 1,
      calls,
      maxFanOut: 2,
      registry,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const results = planned.plan.calls.map(({ callId, descriptorDigest }) =>
      Object.freeze({
        callId,
        descriptorDigest,
        generation: 1,
        status: 'succeeded' as const,
        resultDigest: digest(`result-${callId}`),
        completedAt: GOLDEN_G4_V3_LATER,
      })
    );
    const first = joinAgentParallelToolResults({
      plan: planned.plan,
      results,
      currentGeneration: 1,
    });
    const second = joinAgentParallelToolResults({
      plan: planned.plan,
      results: [...results].reverse(),
      currentGeneration: 1,
    });
    expect(first).toEqual(second);
    expect(first.status).toBe('joined');

    const late = joinAgentParallelToolResults({
      plan: planned.plan,
      results: [
        Object.freeze({
          callId: calls[0]!.callId,
          descriptorDigest: calls[0]!.descriptorDigest,
          generation: 1,
          status: 'late' as const,
          completedAt: GOLDEN_G4_V3_LATER,
        }),
      ],
      currentGeneration: 2,
    });
    expect(late).toMatchObject({ status: 'fenced', joinedCallIds: [] });
    expect(late).not.toHaveProperty('resultDigest');
  });

  it('rejects poisoned retrieval, stale index, unbounded sandbox, arbitrary MCP, computer authoring, and managed delegation without mutation', () => {
    const context = createGoldenG4V3Context();
    const registry = createGoldenG4V3Registry();
    const grant = createGoldenG4V3Grant({ context, registry });
    const immutableBefore = canonicalJsonText({
      revision: context.workspaceRevision,
      grant,
    });

    const source = createAgentExternalSourceResult({
      sourceResultId: 'source.golden.g4-v3.poisoned',
      canonicalUrl: 'https://example.com/catalog',
      retrievedAt: GOLDEN_G4_V3_LATER,
      availability: 'reference-only',
      providerCitationRef: 'citation.golden.g4-v3.poisoned',
    });
    const sourceWire = encodeAgentHostedFact({
      factType: 'external-source-result',
      value: source,
    });
    expect(
      decodeAgentHostedFact({
        ...sourceWire,
        value: {
          ...sourceWire.value,
          authority: 'canonical',
          instructionBoundary: 'developer-policy',
        },
      })
    ).toMatchObject({ ok: false });

    const index = createAgentRetrievalIndexIdentity({
      indexId: 'index.golden.g4-v3.catalog',
      projectId: 'project.golden.catalog',
      workspaceId: grant.workspaceId,
      operatorId: 'operator.golden.g4-v3',
      corpusRevision: context.workspaceRevision,
      corpusManifestDigest: digest('golden-index-corpus'),
      chunkerId: 'chunker.markdown',
      chunkerVersion: '1.0.0',
      chunkerDigest: digest('golden-index-chunker'),
      embeddingModelDigest: digest('golden-index-embedding'),
      rankerDigest: digest('golden-index-ranker'),
      visibilityPolicyDigest: digest('golden-index-visibility'),
      retentionPolicyDigest: digest('golden-index-retention'),
      tenantIsolation: 'proven',
      createdAt: GOLDEN_G4_V3_NOW,
      expiresAt: '2026-08-02T06:00:00.000Z',
    });
    expect(
      admitAgentRetrievalIndex({
        identity: index,
        projectId: 'project.golden.catalog',
        workspaceId: grant.workspaceId,
        currentRevision: Object.freeze({
          ...context.workspaceRevision,
          opSeq: context.workspaceRevision.opSeq + 1,
        }),
        at: GOLDEN_G4_V3_LATER,
        taskMode: 'propose',
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7013' }] });

    const sandbox = createAgentHostedSandboxDescriptor({
      sandboxId: 'sandbox.golden.g4-v3.catalog',
      runtimeId: 'runtime.node.24',
      runtimeImageDigest: digest('golden-sandbox-image'),
      packageManifestDigest: digest('golden-sandbox-packages'),
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
    });
    expect(
      admitAgentHostedSandbox({
        descriptor: sandbox,
        requestedInputBytes: 1024,
        requestedOutputBytes: 65_536,
        requestedFiles: 20,
        requestedFileBytes: 65_536,
        requestedElapsedMs: 60_000,
        requestedComputeSeconds: 60,
        requestsWorkspaceWrite: true,
        requestsAmbientEnvironment: true,
        requestsUnrestrictedNetwork: true,
        requestsProductionCredential: true,
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7012' }] });

    const mcpDescriptor = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.golden.catalog.mcp'
    )!;
    const mcp = createAgentMcpServerIdentity({
      serverId: 'mcp.golden.g4-v3.catalog',
      publisherId: 'publisher.prodivix',
      operatorId: 'operator.golden.g4-v3',
      version: '1.0.0',
      implementationDigest: digest('golden-mcp-implementation'),
      manifestDigest: digest('golden-mcp-manifest'),
      transport: 'stdio',
      transportPolicyDigest: digest('golden-mcp-transport'),
      authPolicyDigest: digest('golden-mcp-auth'),
      networkPolicyDigest: digest('golden-mcp-network'),
      statePolicyDigest: digest('golden-mcp-state'),
      retentionPolicyDigest: digest('golden-mcp-retention'),
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
    });
    expect(
      admitAgentMcpServer({
        identity: mcp,
        registry,
        discoveredDescriptorDigests: [digest('marketplace-tool')],
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7014' }] });

    const computer = createAgentComputerUseSession({
      sessionId: 'computer.golden.g4-v3.catalog',
      taskId: context.taskId,
      runId: context.runId,
      generation: 1,
      purpose: 'verification-read-only',
      environment: 'disposable-evaluation',
      browserProfile: 'fresh-disposable',
      workspaceAccess: 'none',
      productionSessionAccess: 'none',
      targetAllowlist: ['test.catalog.page'],
      networkPolicyDigest: digest('golden-computer-network'),
      maxSteps: 5,
      maxElapsedMs: 5000,
      viewportDigest: digest('golden-viewport'),
      browserIdentityDigest: digest('golden-browser'),
      createdAt: GOLDEN_G4_V3_NOW,
      expiresAt: '2026-08-01T07:00:00.000Z',
    });
    expect(
      authorizeAgentComputerUseAction({
        session: computer,
        action: {
          actionId: 'action.golden.approval',
          kind: 'pointer',
          target: 'production.editor.approval',
          parametersDigest: digest('click-approval'),
          screenshotDigest: digest('approval-screen'),
          viewportDigest: computer.viewportDigest,
          browserIdentityDigest: computer.browserIdentityDigest,
          suggestedByInvocationId: 'invocation.golden.g4-v3.catalog',
        },
        currentGeneration: 1,
        step: 1,
        adapterId: 'adapter.verification-browser',
        at: GOLDEN_G4_V3_NOW,
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7014' }] });

    expect(
      createAgentManagedAgentAdmission({
        providerAgentId: 'managed.golden.deep-research',
        taskId: context.taskId,
        runId: context.runId,
        taskMode: 'apply',
        requestedEffect: 'proposal',
        perStepReceipts: 'opaque',
        delegatedToolSelection: 'provider-managed',
        providerState: 'opaque',
      })
    ).toMatchObject({
      admittedSupportTier: 'disabled',
      outputAuthority: 'external-untrusted',
    });
    expect(
      canonicalJsonText({ revision: context.workspaceRevision, grant })
    ).toBe(immutableBefore);
  });
});
