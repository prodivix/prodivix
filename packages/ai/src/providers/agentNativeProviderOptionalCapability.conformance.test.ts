import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import { createAgentUsageVector } from '../usage/agentUsage';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
  type AgentCapabilityProbeProfileId,
} from './agentCapabilityProbeProgram';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
  createAgentNativeProviderOptionalCapabilitySourceProjection,
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
  isAgentNativeProviderOptionalCapabilitySourceProjection,
  matchAgentNativeProviderOptionalCapabilitySourceBinding,
  resolveAgentNativeProviderOptionalCapabilityCodecAvailability,
  type AgentNativeProviderOptionalCapabilitySourceProjection,
  type AgentNativeProviderProtocol,
} from './agentNativeProviderOptionalCapability';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const stateVaultSourceAuthority = Object.freeze({
  opaqueProviderStateRef: 'state-vault-ref.native-optional-1',
  stateVaultAuthorityDigest: digest('state-vault-authority'),
  stateVaultSealRequestDigest: digest('state-vault-seal-request'),
  stateVaultSealReceiptDigest: digest('state-vault-seal-receipt'),
});
const observedAt = '2026-08-09T03:00:00.000Z';
const expiresAt = '2026-08-09T03:02:00.000Z';

const programFor = (capabilityProfileId: AgentCapabilityProbeProfileId) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
  });

const binding = (
  protocolFamily: AgentNativeProviderProtocol,
  capabilityProfileId: AgentCapabilityProbeProfileId
) => {
  const invocationId = 'invocation.native-optional.1';
  return Object.freeze({
    protocolFamily,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
    invocationId,
    requestDigest: digest('native-optional-request'),
    responseDigest: digest('native-optional-response'),
    providerConfigurationId: 'provider.native-optional.1',
    modelLineageDigest: digest('native-optional-model'),
    adapterDigest: digest('native-optional-adapter'),
    executionIdentityAuthority:
      createAgentNativeProviderExecutionIdentityAuthority({
        invocationId,
        taskId: 'task.native-optional.1',
        runId: 'run.native-optional.1',
        generation: 1,
      }),
    observedAt,
  });
};

const jobSource = Object.freeze({
  sourceKind: 'provider-job-terminal-status' as const,
  providerStateReferenceDigest: digest('provider-job-reference'),
  ...stateVaultSourceAuthority,
  taskId: 'task.native-optional.1',
  runId: 'run.native-optional.1',
  generation: 1,
  providerStatus: 'completed' as const,
});

const cacheUsage = createAgentUsageVector([
  Object.freeze({
    unit: 'cache-read-token',
    logicalAmount: '4096',
    billableAmount: '4096',
    confidence: 'reported',
  }),
  Object.freeze({
    unit: 'text-token-output',
    logicalAmount: '2',
    billableAmount: '2',
    confidence: 'reported',
  }),
]);

const cacheSource = (
  profile: ReturnType<typeof programFor>
): AgentNativeProviderOptionalCapabilitySourceProjection =>
  Object.freeze({
    sourceKind: 'provider-cache-usage',
    cacheIsolationAuthorityDigest: digest('cache-isolation-authority'),
    cacheKeyDigest: digest('native-cache-key'),
    prefixDescriptorDigest:
      profile.providerRequestIntent.cachePrefixResource!.descriptorDigest,
    usageVector: cacheUsage,
    cachedTokenCount: 4096,
    cacheScope: 'task',
    provenIsolation: 'task',
    providerRegion: 'us-central1',
  });

const continuationSource = Object.freeze({
  sourceKind: 'provider-stored-continuation' as const,
  providerStateReferenceDigest: digest('provider-continuation-reference'),
  ...stateVaultSourceAuthority,
  taskId: 'task.native-optional.1',
  runId: 'run.native-optional.1',
  generation: 1,
  expiresAt,
});

describe('native provider optional capability source conformance', () => {
  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'derives a terminal job fact from a sealed %s status projection',
    (protocolFamily) => {
      const program = programFor('g4-provider-background-job');
      const common = binding(protocolFamily, 'g4-provider-background-job');
      const receipt = createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        {
          ...common,
          source: jobSource,
        }
      );

      expect(receipt.fact.factType).toBe('provider-job-receipt');
      expect(receipt.fact.value).toMatchObject({
        invocationId: common.invocationId,
        phase: 'terminal',
        outcome: 'completed',
        callbackAuthority: 'revoked',
      });
      expect(
        matchAgentNativeProviderOptionalCapabilitySourceBinding(
          receipt,
          program,
          common
        )
      ).toBe(true);
    }
  );

  it('canonicalizes a sealed raw metadata projection before producing a runtime fact', () => {
    const program = programFor('g4-provider-background-job');
    const common = binding('openai-responses', 'g4-provider-background-job');
    const source = createAgentNativeProviderOptionalCapabilitySourceProjection(
      program,
      {
        ...common,
        source: jobSource,
      }
    );

    expect(Object.isFrozen(source)).toBe(true);
    expect(
      isAgentNativeProviderOptionalCapabilitySourceProjection(
        source,
        program,
        common
      )
    ).toBe(true);
    expect(
      isAgentNativeProviderOptionalCapabilitySourceProjection(
        Object.freeze({
          ...source,
          providerStatus: 'in_progress',
        }),
        program,
        common
      )
    ).toBe(false);
  });

  it.each([
    'openai-responses',
    'anthropic-messages',
    'gemini-interactions',
  ] as const)(
    'derives a cache fact only from reported non-zero %s cache usage',
    (protocolFamily) => {
      const program = programFor('g4-provider-isolated-cache');
      const receipt = createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        {
          ...binding(protocolFamily, 'g4-provider-isolated-cache'),
          source: cacheSource(program),
        }
      );

      expect(receipt.fact.factType).toBe('provider-cache-receipt');
      expect(receipt.fact.value).toMatchObject({
        cacheMode: 'prompt',
        cacheScope: 'task',
        provenIsolation: 'task',
        usageRef: cacheUsage.vectorDigest,
      });
    }
  );

  it.each(['openai-responses', 'gemini-interactions'] as const)(
    'derives a bounded encrypted continuation from %s state metadata',
    (protocolFamily) => {
      const program = programFor('g4-provider-reasoning-continuation');
      const common = binding(
        protocolFamily,
        'g4-provider-reasoning-continuation'
      );
      const receipt = createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        {
          ...common,
          source: continuationSource,
        }
      );

      expect(receipt.fact.factType).toBe('opaque-continuation');
      expect(receipt.fact.value).toMatchObject({
        providerConfigurationId: common.providerConfigurationId,
        modelLineageDigest: common.modelLineageDigest,
        parentInvocationId: common.invocationId,
        encryptedBlobRef: continuationSource.opaqueProviderStateRef,
      });
    }
  );

  it('keeps codec availability separate from sealed support authority', () => {
    expect(
      resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
        'anthropic-messages',
        'g4-provider-background-job'
      )
    ).toMatchObject({
      availability: 'unavailable',
      unavailableReason: 'native-background-codec-unavailable',
    });
    expect(
      resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
        'anthropic-messages',
        'g4-provider-reasoning-continuation'
      )
    ).toMatchObject({
      availability: 'unavailable',
      unavailableReason: 'native-continuation-codec-unavailable',
    });
    expect(
      resolveAgentNativeProviderOptionalCapabilityCodecAvailability(
        'anthropic-messages',
        'g4-provider-isolated-cache'
      ).availability
    ).toBe('available');
  });

  it('fails closed for missing, swapped, recomputed, or unsafe source authority', () => {
    const program = programFor('g4-provider-background-job');
    const common = binding('openai-responses', 'g4-provider-background-job');
    const receipt = createAgentNativeProviderOptionalCapabilitySourceReceipt(
      program,
      { ...common, source: jobSource }
    );
    const swapped = Object.freeze({
      ...receipt,
      providerConfigurationId: 'provider.native-optional.swapped',
    });
    const { receiptDigest: _receiptDigest, ...swappedBase } = swapped;
    const recomputed = Object.freeze({
      ...swappedBase,
      receiptDigest: digestAgentCanonicalValue(swappedBase),
    });

    expect(
      isAgentNativeProviderOptionalCapabilitySourceReceipt(recomputed, program)
    ).toBe(true);
    expect(
      matchAgentNativeProviderOptionalCapabilitySourceBinding(
        recomputed,
        program,
        common
      )
    ).toBe(false);
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
        ...common,
        source: Object.freeze({
          ...jobSource,
          providerStatus: 'in_progress' as never,
        }),
      })
    ).toThrow(/source is invalid/u);
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
        ...common,
        source: Object.freeze({
          ...jobSource,
          taskId: 'task.native-optional.swapped',
        }),
      })
    ).toThrow(/source is invalid/u);
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(
        program,
        {
          ...common,
          source: Object.freeze({
            ...jobSource,
            opaqueProviderStateRef: 'protected-native-canary',
          }),
        },
        {
          protectedMaterialCanaries: Object.freeze(['protected-native-canary']),
          secretCanaries: Object.freeze([]),
        }
      )
    ).toThrow(/unsafe or unbounded/u);
  });

  it('rejects zero-cache evidence, cache-profile swaps, and expired continuations', () => {
    const cacheProgram = programFor('g4-provider-isolated-cache');
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(cacheProgram, {
        ...binding('openai-responses', 'g4-provider-isolated-cache'),
        source: Object.freeze({
          ...cacheSource(cacheProgram),
          cachedTokenCount: 0,
        }),
      })
    ).toThrow(/source is invalid/u);
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(
        programFor('g4-provider-background-job'),
        {
          ...binding('openai-responses', 'g4-provider-background-job'),
          source: cacheSource(cacheProgram),
        }
      )
    ).toThrow(/source is invalid/u);

    const continuationProgram = programFor(
      'g4-provider-reasoning-continuation'
    );
    expect(() =>
      createAgentNativeProviderOptionalCapabilitySourceReceipt(
        continuationProgram,
        {
          ...binding('openai-responses', 'g4-provider-reasoning-continuation'),
          source: Object.freeze({
            ...continuationSource,
            expiresAt: observedAt,
          }),
        }
      )
    ).toThrow(/source is invalid/u);
  });
});
