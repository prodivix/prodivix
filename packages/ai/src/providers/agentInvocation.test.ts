import { describe, expect, it } from 'vitest';
import {
  TEST_ADAPTER,
  TEST_DATA_POLICY,
  TEST_EXPIRY,
  TEST_INSTANT,
  TEST_MODEL,
  TEST_PROFILE,
  TEST_PROVIDER,
  createV1EffectivePolicy,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import type { AgentInvocationPlan } from './agentProvider.types';
import {
  createAgentCapabilityProfile,
  createAgentInferenceConfiguration,
  createAgentProviderConfigurationIdentity,
  createAgentProviderDataPolicy,
} from './agentProviderIdentity';
import {
  createDeterministicCapabilityProbeAdapter,
  qualifyAgentProviderCapability,
  runAgentCapabilityProbe,
} from './agentCapabilityQualification';
import {
  createAgentContextTransformReceipt,
  createAgentOpaqueContinuation,
  createAgentProviderCacheReceipt,
  createAgentProviderEvent,
  createAgentProviderStateReceipt,
  finalizeAgentModelInvocation,
  preflightAgentInvocation,
  validateAgentOpaqueContinuation,
} from './agentInvocation';
import {
  createAgentUsageVector,
  createUnknownAgentUsageVector,
} from '../usage/agentUsage';

const createPlan = async (): Promise<AgentInvocationPlan> => {
  const policy = createV1EffectivePolicy();
  const probe = await runAgentCapabilityProbe({
    probeId: 'probe.invocation',
    adapter: createDeterministicCapabilityProbeAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
    }),
    provider: TEST_PROVIDER,
    model: TEST_MODEL,
    profile: TEST_PROFILE,
    probedAt: TEST_INSTANT,
    expiresAt: TEST_EXPIRY,
  });
  if (!probe.ok) throw new Error('Expected capability probe.');
  const qualified = qualifyAgentProviderCapability({
    provider: TEST_PROVIDER,
    providerDataPolicy: TEST_DATA_POLICY,
    model: TEST_MODEL,
    profile: TEST_PROFILE,
    probe: probe.receipt,
    policy,
    sensitivity: 'internal',
    evaluatedAt: TEST_INSTANT,
    expiresAt: TEST_EXPIRY,
  });
  if (!qualified.ok) throw new Error('Expected capability qualification.');
  const workspaceRevision = {
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    documents: [],
  } as const;
  const manifestBase = {
    taskId: 'task.invocation',
    runId: 'run.invocation',
    workspaceRevision,
    semanticSnapshotRef: 'semantic:test@1',
    semanticProviderSetDigest: testDigest('semantic-providers'),
    contextContributorSetDigest: testDigest('context-contributors'),
    providerSetDigest: testDigest([TEST_PROVIDER]),
    policyDigest: policy.evaluation.effectivePolicyDigest,
    items: [],
    omitted: [],
    budget: { maxItems: 8, maxBytes: 4096 },
  } as const;
  const manifestDigest = testDigest(manifestBase);
  const inferenceConfiguration = createAgentInferenceConfiguration({
    temperature: 0,
    maxOutputUnits: { unit: 'text-token-output', maximum: '500' },
    reasoningMode: 'none',
    outputSchemaDigest: testDigest('output-schema'),
    promptPolicyDigest: testDigest('prompt-policy'),
    toolRegistryDigest: testDigest('tool-registry'),
    toolChoicePolicy: 'registered-only',
    parallelToolPolicy: 'forbidden',
    providerStateMode: 'stateless',
    contextMutationMode: 'none',
    cacheMode: 'disabled',
    deliveryMode: 'stream',
  });
  return Object.freeze({
    invocationId: 'invocation.1',
    taskId: 'task.invocation',
    runId: 'run.invocation',
    taskMode: 'plan',
    generation: 1,
    attempt: 1,
    provider: TEST_PROVIDER,
    providerDataPolicy: TEST_DATA_POLICY,
    model: TEST_MODEL,
    capabilityProfile: TEST_PROFILE,
    qualification: qualified.qualification,
    inferenceConfiguration,
    contextPack: Object.freeze({
      contextPackId: `context-pack:${manifestDigest.slice(7)}`,
      ...manifestBase,
      manifestDigest,
    }),
    policyDigest: policy.evaluation.effectivePolicyDigest,
    grantCapabilities: ['execute', 'read'] as const,
    startedAt: '2026-08-01T00:01:00.000Z',
  });
};

describe('G4 V1 canonical provider invocation', () => {
  it('preflights and produces an immutable receipt with normalized events and usage', async () => {
    const plan = await createPlan();
    expect(
      preflightAgentInvocation(plan, {
        at: '2026-08-01T00:01:01.000Z',
      })
    ).toMatchObject({ ok: true });
    const event = createAgentProviderEvent({
      eventId: 'provider-event.0',
      invocationId: plan.invocationId,
      sequence: 0,
      type: 'completed',
      payloadDigest: testDigest('completed'),
      occurredAt: '2026-08-01T00:01:02.000Z',
    });
    const usage = createAgentUsageVector([
      {
        unit: 'text-token-input',
        logicalAmount: '100',
        billableAmount: '80',
        cachedAmount: '20',
        confidence: 'reported',
      },
      {
        unit: 'text-token-output',
        logicalAmount: '20',
        billableAmount: '20',
        confidence: 'reported',
      },
    ]);
    const result = finalizeAgentModelInvocation({
      plan,
      preflightAt: '2026-08-01T00:01:01.000Z',
      events: [event],
      outcome: 'completed',
      responseDigest: testDigest('sanitized-response'),
      usage,
      costStatus: 'priced',
      cost: [{ currency: 'USD', amount: '0.01', confidence: 'reported' }],
      completedAt: '2026-08-01T00:01:03.000Z',
    });
    expect(result).toMatchObject({
      ok: true,
      receipt: {
        requestDigest: expect.stringMatching(/^sha256-/u),
        outcome: 'completed',
        usage,
      },
    });
  });

  it('normalizes refusal as a terminal outcome and rejects outcome drift', async () => {
    const plan = await createPlan();
    const event = createAgentProviderEvent({
      eventId: 'provider-event.refusal',
      invocationId: plan.invocationId,
      sequence: 0,
      type: 'refusal',
      payloadDigest: testDigest('refusal'),
      occurredAt: '2026-08-01T00:01:02.000Z',
    });
    const base = {
      plan,
      preflightAt: '2026-08-01T00:01:01.000Z',
      events: [event],
      usage: createUnknownAgentUsageVector(['text-token-output']),
      costStatus: 'unknown',
      cost: [],
      completedAt: '2026-08-01T00:01:03.000Z',
    } as const;
    expect(
      finalizeAgentModelInvocation({ ...base, outcome: 'refused' })
    ).toMatchObject({ ok: true });
    expect(
      finalizeAgentModelInvocation({ ...base, outcome: 'completed' })
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '/outcome' }),
      ]),
    });
  });

  it('rejects ambient memory and mutable model/runtime drift', async () => {
    const plan = await createPlan();
    const { policyDigest: _policyDigest, ...dataBase } = TEST_DATA_POLICY;
    const ambientPolicy = createAgentProviderDataPolicy({
      ...dataBase,
      ambientMemory: 'enabled',
    });
    const ambientProvider = createAgentProviderConfigurationIdentity({
      ...TEST_PROVIDER,
      dataPolicyDigest: ambientPolicy.policyDigest,
    });
    const ambient = preflightAgentInvocation(
      {
        ...plan,
        provider: ambientProvider,
        providerDataPolicy: ambientPolicy,
      },
      { at: '2026-08-01T00:01:01.000Z' }
    );
    expect(ambient).toMatchObject({ ok: false });
    if (!ambient.ok) {
      expect(ambient.issues).toContainEqual(
        expect.objectContaining({
          code: 'AI-6011',
          path: '/providerDataPolicy/ambientMemory',
        })
      );
    }

    const drifted = preflightAgentInvocation(
      {
        ...plan,
        model: {
          ...plan.model,
          runtimeBackendDigest: testDigest('new-runtime'),
        },
      },
      { at: '2026-08-01T00:01:01.000Z' }
    );
    expect(drifted).toMatchObject({ ok: false });
    if (!drifted.ok) {
      expect(drifted.issues).toContainEqual(
        expect.objectContaining({ code: 'AI-6010' })
      );
    }

    const oversizedOutput = preflightAgentInvocation(
      {
        ...plan,
        inferenceConfiguration: createAgentInferenceConfiguration({
          ...(() => {
            const { configurationDigest: _configurationDigest, ...base } =
              plan.inferenceConfiguration;
            return base;
          })(),
          maxOutputUnits: {
            unit: 'text-token-output',
            maximum: '2001',
          },
        }),
      },
      { at: '2026-08-01T00:01:01.000Z' }
    );
    expect(oversizedOutput).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/inferenceConfiguration/maxOutputUnits',
        }),
      ]),
    });
  });

  it('confines opaque continuation to the exact parent and generation', () => {
    const continuation = createAgentOpaqueContinuation({
      continuationId: 'continuation.1',
      encryptedBlobRef: 'encrypted-artifact:continuation.1',
      providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
      modelLineageDigest: TEST_MODEL.lineageDigest,
      taskId: 'task.1',
      runId: 'run.1',
      generation: 2,
      parentInvocationId: 'invocation.parent',
      purpose: 'provider-tool-loop-continuation',
      createdAt: TEST_INSTANT,
      expiresAt: TEST_EXPIRY,
    });
    expect(
      validateAgentOpaqueContinuation(continuation, {
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        taskId: 'task.1',
        runId: 'run.1',
        generation: 2,
        parentInvocationId: 'invocation.parent',
        at: '2026-08-01T01:00:00.000Z',
      })
    ).toEqual([]);
    expect(
      validateAgentOpaqueContinuation(continuation, {
        providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
        modelLineageDigest: TEST_MODEL.lineageDigest,
        taskId: 'task.other',
        runId: 'run.1',
        generation: 2,
        parentInvocationId: 'invocation.parent',
        at: '2026-08-01T01:00:00.000Z',
      })
    ).toEqual([expect.objectContaining({ code: 'AI-6011' })]);
  });

  it('rejects unknown compaction, cross-tenant cache, and zeroed unknown usage', async () => {
    expect(() =>
      createAgentContextTransformReceipt({
        invocationId: 'invocation.1',
        submittedContextPackDigest: testDigest('context'),
        transformMode: 'provider-compaction',
        confidence: 'unknown',
      })
    ).toThrow(/explainable/u);
    expect(() =>
      createAgentProviderCacheReceipt({
        receipt: {
          cacheMode: 'prompt',
          cacheScope: 'task',
          prefixOrItemDigests: [testDigest('prefix')],
          usageRef: 'usage.cache.1',
        },
        isolation: 'cross-tenant',
      })
    ).toThrow(/isolation/u);

    const plan = await createPlan();
    const event = createAgentProviderEvent({
      eventId: 'provider-event.0',
      invocationId: plan.invocationId,
      sequence: 0,
      type: 'failed',
      payloadDigest: testDigest('failed'),
      occurredAt: '2026-08-01T00:01:02.000Z',
    });
    expect(
      finalizeAgentModelInvocation({
        plan,
        preflightAt: '2026-08-01T00:01:01.000Z',
        events: [event],
        outcome: 'provider-error',
        usage: createAgentUsageVector([]),
        costStatus: 'unknown',
        cost: [],
        completedAt: '2026-08-01T00:01:03.000Z',
      })
    ).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-6013' }),
      ]),
    });
    expect(createUnknownAgentUsageVector(['text-token-input']).amounts).toEqual(
      [{ unit: 'text-token-input', confidence: 'unknown' }]
    );
  });

  it('keeps optional state modes isolated in independently qualified profiles', () => {
    const { profileDigest: _profileDigest, ...profileBase } = TEST_PROFILE;
    const stateful = createAgentCapabilityProfile({
      ...profileBase,
      profileId: 'g4-provider-parent-state',
      providerStateModes: ['provider-stored-parent'],
      contextMutationModes: ['provider-compaction'],
    });
    expect(stateful.profileDigest).not.toBe(TEST_PROFILE.profileDigest);
    expect(stateful.providerStateModes).toEqual(['provider-stored-parent']);
  });

  it('rejects forged usage, stateless state claims, and events outside the invocation lifetime', async () => {
    const plan = await createPlan();
    const event = createAgentProviderEvent({
      eventId: 'provider-event.outside-lifetime',
      invocationId: plan.invocationId,
      sequence: 0,
      type: 'failed',
      payloadDigest: testDigest('failed-outside-lifetime'),
      occurredAt: '2026-08-01T00:00:59.000Z',
    });
    const amounts = [
      {
        unit: 'text-token-output' as const,
        logicalAmount: '01',
        confidence: 'reported' as const,
      },
    ];
    const result = finalizeAgentModelInvocation({
      plan,
      preflightAt: '2026-08-01T00:01:01.000Z',
      events: [event],
      outcome: 'provider-error',
      usage: { amounts, vectorDigest: testDigest(amounts) },
      costStatus: 'unknown',
      cost: [],
      providerStateReceipt: createAgentProviderStateReceipt({
        stateMode: 'stateless',
        storage: 'disabled',
        ambientMemory: 'disabled',
        retentionDays: 0,
      }),
      completedAt: '2026-08-01T00:01:03.000Z',
    });
    expect(result).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ path: '/events' }),
        expect.objectContaining({ path: '/providerStateReceipt' }),
        expect.objectContaining({ path: '/usage' }),
      ]),
    });
  });
});
