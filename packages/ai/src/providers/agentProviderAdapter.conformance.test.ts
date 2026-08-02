import { describe, expect, it } from 'vitest';
import {
  TEST_ADAPTER,
  TEST_MODEL,
  TEST_PROFILE,
  TEST_PROVIDER,
  testDigest,
} from '../__tests__/agentV1Fixtures';
import {
  createAgentContextTransformReceipt,
  createAgentProviderEvent,
} from './agentInvocation';
import {
  createScriptedAgentProviderAdapter,
  runAgentProviderAdapterConformance,
  type AgentProviderAdapterInvocationRequest,
} from './agentProviderAdapter';
import { createUnknownAgentUsageVector } from '../usage/agentUsage';

const REQUEST: AgentProviderAdapterInvocationRequest = Object.freeze({
  invocationId: 'invocation.adapter.1',
  requestDigest: testDigest('request'),
  providerConfigurationId: TEST_PROVIDER.providerConfigurationId,
  modelLineageDigest: TEST_MODEL.lineageDigest,
  capabilityProfileDigest: TEST_PROFILE.profileDigest,
  inferenceConfigurationDigest: testDigest('inference'),
  contextPackDigest: testDigest('context'),
});

const terminalFacts = () =>
  Object.freeze([
    Object.freeze({
      factType: 'provider-event' as const,
      value: createAgentProviderEvent({
        eventId: 'event.adapter.completed',
        invocationId: REQUEST.invocationId,
        sequence: 0,
        type: 'completed',
        payloadDigest: testDigest('completed'),
        occurredAt: '2026-08-01T00:01:00.000Z',
      }),
    }),
    Object.freeze({
      factType: 'usage-vector' as const,
      value: createUnknownAgentUsageVector(['text-token-output']),
    }),
  ]);

describe('G4 V1 provider adapter SPI conformance', () => {
  it('admits a deterministic normalized stream with explicit unknown usage', async () => {
    const adapter = createScriptedAgentProviderAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
      facts: terminalFacts(),
    });
    await expect(
      runAgentProviderAdapterConformance(adapter, REQUEST)
    ).resolves.toMatchObject({ ok: true });
  });

  it('rejects missing usage, wrong invocation fences, and undeclared profiles', async () => {
    const wrongInvocation = createScriptedAgentProviderAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
      facts: [
        {
          factType: 'provider-event',
          value: createAgentProviderEvent({
            eventId: 'event.adapter.wrong',
            invocationId: 'invocation.other',
            sequence: 0,
            type: 'completed',
            payloadDigest: testDigest('wrong'),
            occurredAt: '2026-08-01T00:01:00.000Z',
          }),
        },
      ],
    });
    await expect(
      runAgentProviderAdapterConformance(wrongInvocation, REQUEST)
    ).resolves.toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-6013' }),
        expect.objectContaining({ code: 'AI-6011' }),
      ]),
    });

    const undeclared = createScriptedAgentProviderAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [testDigest('other-profile')],
      supportedProfileDigests: [],
      facts: terminalFacts(),
    });
    await expect(
      runAgentProviderAdapterConformance(undeclared, REQUEST)
    ).resolves.toMatchObject({
      ok: false,
      issues: [expect.objectContaining({ code: 'AI-6010' })],
    });
  });

  it('rejects normalized subordinate facts from a sibling invocation', async () => {
    const adapter = createScriptedAgentProviderAdapter({
      identity: TEST_ADAPTER,
      declaredProfileDigests: [TEST_PROFILE.profileDigest],
      supportedProfileDigests: [TEST_PROFILE.profileDigest],
      facts: [
        {
          factType: 'context-transform-receipt',
          value: createAgentContextTransformReceipt({
            invocationId: 'invocation.sibling',
            submittedContextPackDigest: REQUEST.contextPackDigest,
            transformMode: 'none',
            effectiveContextDigest: REQUEST.contextPackDigest,
            confidence: 'verified',
          }),
        },
        ...terminalFacts(),
      ],
    });
    await expect(
      runAgentProviderAdapterConformance(adapter, REQUEST)
    ).resolves.toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'AI-6011', path: '/facts/0' }),
      ]),
    });
  });
});
