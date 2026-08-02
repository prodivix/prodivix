import { describe, expect, it } from 'vitest';
import {
  V3_LATER,
  V3_NOW,
  createV3Demand,
  createV3Registry,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import {
  admitAgentHostedSandbox,
  admitAgentMcpServer,
  authorizeAgentComputerUseAction,
  createAgentComputerUseSession,
  createAgentComputerUseStepReceipt,
  createAgentHostedSandboxDescriptor,
  createAgentHostedSandboxReceipt,
  createAgentManagedAgentAdmission,
  createAgentMcpServerIdentity,
} from './agentCapabilityBoundaries';
import { createAgentToolCleanupReceipt } from './agentToolLifecycle';

const createSandbox = () =>
  createAgentHostedSandboxDescriptor({
    sandboxId: 'sandbox.g4-v3.catalog',
    runtimeId: 'runtime.python.3-13',
    runtimeImageDigest: v3Digest('python-image'),
    packageManifestDigest: v3Digest('python-packages'),
    workspaceMount: 'none',
    network: 'none',
    secretInjection: 'none',
    ambientEnvironment: 'disabled',
    maxInputBytes: 4096,
    maxOutputBytes: 8192,
    maxFiles: 4,
    maxFileBytes: 16_384,
    maxElapsedMs: 10_000,
    maxComputeSeconds: 10,
    cleanupRequired: true,
  });

const createMcp = () => {
  const registry = createV3Registry();
  const descriptor = registry.descriptors.find(
    ({ toolId }) => toolId === 'tool.catalog.mcp.read'
  )!;
  return {
    registry,
    descriptor,
    identity: createAgentMcpServerIdentity({
      serverId: 'mcp.catalog.read',
      publisherId: 'publisher.prodivix',
      operatorId: 'operator.prodivix.test',
      version: '1.0.0',
      implementationDigest: v3Digest('mcp-implementation'),
      manifestDigest: v3Digest('mcp-manifest'),
      transport: 'stdio',
      transportPolicyDigest: v3Digest('mcp-transport'),
      authPolicyDigest: v3Digest('mcp-auth'),
      networkPolicyDigest: v3Digest('mcp-network'),
      statePolicyDigest: v3Digest('mcp-state'),
      retentionPolicyDigest: v3Digest('mcp-retention'),
      admittedToolDescriptorDigests: [descriptor.descriptorDigest],
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
  };
};

const createComputerSession = () =>
  createAgentComputerUseSession({
    sessionId: 'computer.g4-v3.catalog',
    taskId: 'task.g4-v3.catalog',
    runId: 'run.g4-v3.catalog',
    generation: 1,
    purpose: 'verification-read-only',
    environment: 'disposable-evaluation',
    browserProfile: 'fresh-disposable',
    workspaceAccess: 'read-only-snapshot',
    productionSessionAccess: 'none',
    targetAllowlist: ['test.catalog.page'],
    networkPolicyDigest: v3Digest('computer-network'),
    maxSteps: 10,
    maxElapsedMs: 60_000,
    viewportDigest: v3Digest('viewport-1440x900'),
    browserIdentityDigest: v3Digest('chromium-test'),
    createdAt: V3_NOW,
    expiresAt: '2026-08-01T07:00:00.000Z',
  });

describe('G4 V3 hosted capability hard cuts', () => {
  it('admits only bounded ephemeral sandboxes with cleanup evidence', () => {
    const descriptor = createSandbox();
    expect(
      admitAgentHostedSandbox({
        descriptor,
        requestedInputBytes: 1024,
        requestedOutputBytes: 2048,
        requestedFiles: 1,
        requestedFileBytes: 4096,
        requestedElapsedMs: 5000,
        requestedComputeSeconds: 5,
        requestsWorkspaceWrite: false,
        requestsAmbientEnvironment: false,
        requestsUnrestrictedNetwork: false,
        requestsProductionCredential: false,
      })
    ).toEqual({ ok: true, descriptorDigest: descriptor.descriptorDigest });
    expect(
      admitAgentHostedSandbox({
        descriptor,
        requestedInputBytes: 1024,
        requestedOutputBytes: 20_000,
        requestedFiles: 1,
        requestedFileBytes: 4096,
        requestedElapsedMs: 5000,
        requestedComputeSeconds: 5,
        requestsWorkspaceWrite: true,
        requestsAmbientEnvironment: true,
        requestsUnrestrictedNetwork: true,
        requestsProductionCredential: true,
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7012' }] });

    const cleanup = createAgentToolCleanupReceipt({
      cleanupId: 'cleanup.sandbox.g4-v3',
      residualState: 'none',
      providerStateDeleted: true,
      deletionReceiptRef: 'deletion.sandbox.g4-v3',
      completedAt: V3_LATER,
    });
    const receipt = createAgentHostedSandboxReceipt({
      sandboxId: descriptor.sandboxId,
      descriptorDigest: descriptor.descriptorDigest,
      callId: 'call.sandbox.g4-v3',
      runtimeImageDigest: descriptor.runtimeImageDigest,
      packageManifestDigest: descriptor.packageManifestDigest,
      inputDigest: v3Digest('sandbox-input'),
      outputDigest: v3Digest('sandbox-output'),
      outputByteLength: 20,
      filesystemDiffDigest: v3Digest('bounded-runtime-diff'),
      usage: createV3Demand({ sandboxComputeSeconds: '2' }).usage,
      cleanupReceiptDigest: cleanup.receiptDigest,
      cleanup,
      completedAt: V3_LATER,
    });
    expect(receipt.cleanupReceiptDigest).toBe(cleanup.receiptDigest);
  });

  it('admits only preinstalled pinned MCP tools in the frozen registry', () => {
    const { identity, registry, descriptor } = createMcp();
    expect(
      admitAgentMcpServer({
        identity,
        registry,
        discoveredDescriptorDigests: [descriptor.descriptorDigest],
      })
    ).toEqual({ ok: true, identityDigest: identity.identityDigest });
    expect(
      admitAgentMcpServer({
        identity,
        registry,
        discoveredDescriptorDigests: [v3Digest('public-marketplace-tool')],
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7014' }] });
    expect(() =>
      createAgentMcpServerIdentity({
        ...identity,
        disabledCapabilities: ['sampling'],
      })
    ).toThrow(/capability-bounded/iu);
  });

  it('reauthorizes every computer-use step inside a disposable read-only session', () => {
    const session = createComputerSession();
    const action = Object.freeze({
      actionId: 'action.observe.catalog',
      kind: 'observe' as const,
      target: 'test.catalog.page',
      parametersDigest: v3Digest('observe-parameters'),
      screenshotDigest: v3Digest('catalog-screenshot'),
      viewportDigest: session.viewportDigest,
      browserIdentityDigest: session.browserIdentityDigest,
      suggestedByInvocationId: 'invocation.g4-v3.catalog',
    });
    const admitted = authorizeAgentComputerUseAction({
      session,
      action,
      currentGeneration: 1,
      step: 1,
      adapterId: 'adapter.verification-browser',
      at: V3_NOW,
    });
    expect(admitted.ok).toBe(true);
    if (!admitted.ok) return;
    const receipt = createAgentComputerUseStepReceipt({
      session,
      action,
      authorization: admitted.authorization,
      currentGeneration: 1,
      resultDigest: v3Digest('observed-result'),
      usage: createV3Demand().usage,
      completedAt: V3_LATER,
    });
    expect(receipt.adapterAuthorizationDigest).toBe(
      admitted.authorization.authorizationDigest
    );
    expect(
      authorizeAgentComputerUseAction({
        session,
        action: { ...action, target: 'production.editor.approval' },
        currentGeneration: 1,
        step: 2,
        adapterId: 'adapter.verification-browser',
        at: V3_NOW,
      })
    ).toMatchObject({ ok: false, issues: [{ code: 'AI-7014' }] });
    expect(() =>
      createAgentComputerUseSession({
        ...session,
        targetAllowlist: ['production.editor'],
      })
    ).toThrow(/authoring|production/iu);
  });

  it('keeps opaque managed agents at admission-only explain/read', () => {
    const research = createAgentManagedAgentAdmission({
      providerAgentId: 'managed.deep-research',
      taskId: 'task.g4-v3.catalog',
      runId: 'run.g4-v3.catalog',
      taskMode: 'explain',
      requestedEffect: 'read',
      perStepReceipts: 'opaque',
      delegatedToolSelection: 'provider-managed',
      providerState: 'opaque',
    });
    expect(research).toMatchObject({
      outputAuthority: 'external-untrusted',
      admittedSupportTier: 'admission-only',
    });
    const delegation = createAgentManagedAgentAdmission({
      ...research,
      taskMode: 'apply',
      requestedEffect: 'proposal',
    });
    expect(delegation.admittedSupportTier).toBe('disabled');
    expect(JSON.stringify(delegation)).not.toMatch(
      /approvalAuthority|workspaceWrite|commitAuthority/iu
    );
  });
});
