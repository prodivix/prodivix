import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import {
  V3_LATER,
  V3_NOW,
  V3_REVISION,
  createV3Demand,
  createV3Grant,
  createV3Registry,
  v3Digest,
} from '../__tests__/agentV3Fixtures';
import type {
  AgentJsonValue,
  AgentToolDescriptor,
} from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentBudgetLedger } from '../usage/agentBudgetLedger';
import {
  createAgentToolCleanupReceipt,
  createScriptedAgentHostedToolAdapter,
  executeAgentHostedToolCall,
  preflightAgentToolCall,
  type AgentToolFenceState,
} from './agentToolLifecycle';
import type { AgentToolCallRequest } from './agentHosted.types';

const createRequest = (
  input: Readonly<{
    descriptor: AgentToolDescriptor;
    payload: AgentJsonValue;
    observability?: AgentToolCallRequest['observability'];
    generation?: number;
  }>
): AgentToolCallRequest => {
  const registry = createV3Registry();
  const text = canonicalJsonText(input.payload);
  return Object.freeze({
    identity: Object.freeze({
      callId: `call.${input.descriptor.toolId}`,
      invocationId: 'invocation.g4-v3.catalog',
      taskId: 'task.g4-v3.catalog',
      runId: 'run.g4-v3.catalog',
      generation: input.generation ?? 1,
      depth: input.observability === 'opaque-chain' ? 1 : 0,
    }),
    registryDigest: registry.registryDigest,
    descriptorDigest: input.descriptor.descriptorDigest,
    grant: createV3Grant(registry),
    effectivePolicyDigest: v3Digest('effective-policy.g4-v3'),
    contextPackDigest: v3Digest('context-pack.g4-v3'),
    capabilityQualificationDigest: v3Digest('qualification.g4-v3'),
    runtimeZone:
      input.descriptor.effect === 'proposal'
        ? ('browser' as const)
        : ('server' as const),
    workspaceRevision: V3_REVISION,
    targetScope: Object.freeze({
      targets: Object.freeze([
        Object.freeze({ kind: 'document' as const, id: 'page.catalog' }),
      ]),
    }),
    inputDigest: digestAgentCanonicalValue(input.payload),
    inputByteLength: new TextEncoder().encode(text).byteLength,
    observability: input.observability ?? 'per-call',
    budgetDemand: createV3Demand({
      ...(input.descriptor.effect === 'ephemeral-execute'
        ? { sandboxComputeSeconds: '2' }
        : {}),
    }),
    requestedAt: V3_NOW,
  });
};

const fenceFor = (
  request: AgentToolCallRequest,
  generation = request.identity.generation
): AgentToolFenceState =>
  Object.freeze({
    taskId: request.identity.taskId,
    runId: request.identity.runId,
    generation,
    registryDigest: request.registryDigest,
    descriptorDigest: request.descriptorDigest,
    effectivePolicyDigest: request.effectivePolicyDigest,
    contextPackDigest: request.contextPackDigest,
    grantId: request.grant.grantId,
    revoked: false,
    at: V3_LATER,
  });

const cleanup = () =>
  createAgentToolCleanupReceipt({
    cleanupId: 'cleanup.g4-v3.catalog',
    residualState: 'none',
    providerStateDeleted: false,
    completedAt: V3_LATER,
  });

describe('G4 V3 hosted Tool per-call lifecycle', () => {
  it('preflights, reserves, executes, normalizes, stages, settles, and cleans each call', async () => {
    const registry = createV3Registry();
    const descriptor = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.catalog.proposal'
    )!;
    const payload = { ownerId: 'pir', target: 'page.catalog' } as const;
    const request = createRequest({ descriptor, payload });
    const ledger = createAgentBudgetLedger(request.grant.limits.budget);

    const preflight = preflightAgentToolCall(request, {
      registry,
      ledger,
      currentGeneration: 1,
      at: V3_NOW,
    });
    expect(preflight).toMatchObject({
      ok: true,
      ledger: { revision: 1 },
    });

    const result = await executeAgentHostedToolCall({
      request,
      registry,
      ledger,
      payload,
      currentGeneration: 1,
      preflightAt: V3_NOW,
      readFence: () => fenceFor(request),
      adapter: createScriptedAgentHostedToolAdapter({
        descriptorDigest: descriptor.descriptorDigest,
        async execute() {
          return Object.freeze({
            status: 'succeeded' as const,
            output: Object.freeze({ actionType: 'pir.update-props' }),
            artifactRefs: Object.freeze(['artifact.proposal-preview']),
            actualDemand: createV3Demand({ elapsedMs: 900 }),
            completedAt: V3_LATER,
            cleanup: cleanup(),
          });
        },
      }),
    });
    expect(result).toMatchObject({
      status: 'completed',
      receipt: {
        terminalStatus: 'succeeded',
        resultDisposition: 'staged-proposal-only',
        lifecycle: [
          'decoded',
          'preflighted',
          'authorized',
          'budget-reserved',
          'executed',
          'normalized',
          'redacted',
          'staged',
          'finalized',
          'cleaned',
        ],
      },
      ledger: { revision: 2 },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /workspaceOperation|"transaction"|approvalDecision|commitAuthority/iu
    );
  });

  it('fences a late sibling to audit-only and never exposes its output', async () => {
    const registry = createV3Registry();
    const descriptor = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.catalog.search'
    )!;
    const payload = { query: 'catalog' } as const;
    const request = createRequest({ descriptor, payload });
    let generation = 1;
    const result = await executeAgentHostedToolCall({
      request,
      registry,
      ledger: createAgentBudgetLedger(request.grant.limits.budget),
      payload,
      currentGeneration: 1,
      preflightAt: V3_NOW,
      readFence: () => fenceFor(request, generation),
      adapter: createScriptedAgentHostedToolAdapter({
        descriptorDigest: descriptor.descriptorDigest,
        async execute() {
          generation = 2;
          return Object.freeze({
            status: 'succeeded' as const,
            output: Object.freeze({ secretResult: 'must-not-enter-context' }),
            artifactRefs: Object.freeze(['artifact.late']),
            actualDemand: createV3Demand(),
            completedAt: V3_LATER,
            cleanup: cleanup(),
          });
        },
      }),
    });
    expect(result).toMatchObject({
      status: 'completed',
      receipt: {
        terminalStatus: 'fenced',
        resultDisposition: 'audit-only',
        outputByteLength: 0,
        artifactRefs: [],
      },
    });
    expect(result).not.toHaveProperty('normalizedOutput');
  });

  it('rejects hidden nested effects, grant drift, and unbounded demand before execution', () => {
    const registry = createV3Registry();
    const sandbox = registry.descriptors.find(
      ({ toolId }) => toolId === 'tool.catalog.sandbox'
    )!;
    const request = createRequest({
      descriptor: sandbox,
      payload: { script: 'return 1' },
      observability: 'opaque-chain',
    });
    const result = preflightAgentToolCall(
      {
        ...request,
        grant: Object.freeze({
          ...request.grant,
          policyDigest: v3Digest('drifted-policy'),
        }),
        budgetDemand: createV3Demand({
          elapsedMs: 20_000,
          sandboxComputeSeconds: '20',
        }),
      },
      {
        registry,
        ledger: createAgentBudgetLedger(request.grant.limits.budget),
        currentGeneration: 1,
        at: V3_NOW,
      }
    );
    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(['AI-6002', 'AI-7001', 'AI-7012'])
    );
    expect(result.ledger.revision).toBe(0);
  });
});
