import { describe, expect, it, vi } from 'vitest';
import type { AgentJsonValue, Instant } from '../domain/agent.types';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeSupportedSemanticProof,
  digestAgentCapabilityProbeProfile,
  type AgentCapabilityProbeProfileId,
} from './agentCapabilityProbeProgram';
import {
  digestAgentNativeProviderRuntimeResponse,
  normalizeNativeAgentProviderRuntimeEvents,
} from './agentNativeProviderAdapters';
import type { AgentNativeProviderProtocol } from './agentNativeProviderOptionalCapability';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  isAgentNativeProviderOptionalCapabilitySourceReceipt,
} from './agentNativeProviderOptionalCapability';
import {
  createAgentNativeProviderCacheIsolationAuthority,
  extractAgentNativeProviderOptionalCapability,
  isAgentNativeProviderOptionalCapabilityExtractionCandidate,
  isAgentNativeProviderCacheIsolationAuthority,
  matchAgentNativeProviderOptionalCapabilityExtractionBinding,
  type AgentNativeProviderOptionalCapabilityExtractionBinding,
} from './agentNativeProviderOptionalCapabilityExtractor';
import {
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  isAgentNativeProviderStateVaultSealReceipt,
  type AgentNativeProviderStateVaultPort,
} from './agentNativeProviderStateVault';

const runtimeFactOccurredAt = '2026-08-09T03:00:00.000Z' as Instant;
const transportCompletedAt = '2026-08-09T03:00:00.250Z' as Instant;
const observedAt = '2026-08-09T03:00:00.500Z' as Instant;
const vaultSealedAt = '2026-08-09T03:00:00.750Z' as Instant;
const digest = (label: string) => digestAgentCanonicalValue({ label });

const programFor = (capabilityProfileId: AgentCapabilityProbeProfileId) =>
  createAgentCapabilityProbeProgram({
    capabilityProfileId,
    capabilityProfileDigest:
      digestAgentCapabilityProbeProfile(capabilityProfileId),
  });

const events = (value: AgentJsonValue): readonly unknown[] =>
  Array.isArray(value) ? value : Object.freeze([value]);

const bindingFor = (
  protocolFamily: AgentNativeProviderProtocol,
  capabilityProfileId: AgentCapabilityProbeProfileId,
  sealedResponseJson: AgentJsonValue
): AgentNativeProviderOptionalCapabilityExtractionBinding => {
  const program = programFor(capabilityProfileId);
  const invocationId = 'invocation.native-extractor.1';
  const taskId = 'task.native-extractor.1';
  const runId = 'run.native-extractor.1';
  const generation = 2;
  const requestDigest = digest(
    `${protocolFamily}:${capabilityProfileId}:request`
  );
  const runtimeFacts = normalizeNativeAgentProviderRuntimeEvents(
    protocolFamily,
    events(sealedResponseJson),
    {
      invocationId: 'invocation.native-extractor.1',
      occurredAt: runtimeFactOccurredAt,
    }
  );
  return Object.freeze({
    protocolFamily,
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    invocationId,
    requestDigest,
    responseDigest: digestAgentNativeProviderRuntimeResponse(
      requestDigest,
      runtimeFacts
    ),
    providerConfigurationId: `provider.${protocolFamily}.native-extractor`,
    modelLineageDigest: digest(`${protocolFamily}:model`),
    adapterDigest: digest(`${protocolFamily}:adapter`),
    observedAt,
    responseBodyDigest: digestAgentCanonicalValue({
      exactProviderResponseBytes: sealedResponseJson,
    }),
    runtimeFactOccurredAt,
    transportCompletedAt,
    httpStatus: 200,
    attemptId: 'attempt.native-extractor.1',
    taskId,
    runId,
    generation,
    executionIdentityAuthority:
      createAgentNativeProviderExecutionIdentityAuthority({
        invocationId,
        taskId,
        runId,
        generation,
      }),
    cacheIsolationAuthority:
      capabilityProfileId === 'g4-provider-isolated-cache'
        ? createAgentNativeProviderCacheIsolationAuthority({
            program,
            semanticProof: createAgentCapabilityProbeSupportedSemanticProof(
              program,
              {
                proofKind: 'isolated-cache-roundtrip',
                cacheReceiptDigest: digest('cache-receipt'),
                usageVectorDigest: digest('cache-usage'),
                cachePrefixDescriptorDigest:
                  program.providerRequestIntent.cachePrefixResource!
                    .descriptorDigest,
                coldPrefixDigest:
                  program.providerRequestIntent.cachePrefixResource!
                    .prefixDigest,
                warmPrefixDigest:
                  program.providerRequestIntent.cachePrefixResource!
                    .prefixDigest,
                coldSuffixDigest:
                  program.providerRequestIntent.cachePrefixResource!
                    .coldSuffixDigest,
                warmSuffixDigest:
                  program.providerRequestIntent.cachePrefixResource!
                    .warmSuffixDigest,
                cacheKeyDigest: digest('cache-key'),
                coldResponseDigest: digest('cache-cold-response'),
                warmResponseDigest: digest('cache-warm-response'),
                usageDeltaDigest: digest('cache-usage-delta'),
                isolationScopeDigest: digest('cache-isolation-scope'),
                coldCachedTokenCount: 0,
                warmCachedTokenCount: 1,
                cacheHitObserved: true,
              }
            ),
            runtimeFactSourceAuthorityDigest: digest(
              `${protocolFamily}:runtime-fact-source-authority`
            ),
            providerConfigurationId: `provider.${protocolFamily}.native-extractor`,
          })
        : null,
    providerRegion:
      protocolFamily === 'gemini-interactions' ? 'us-central1' : null,
  });
};

const stateVaultAuthorityInput = Object.freeze({
  authorityId: 'provider-state-vault.production.1',
  authorityImplementationDigest: digest('provider-state-vault-implementation'),
  algorithm: 'aes-256-gcm' as const,
  keyReferenceDigest: digest('provider-state-vault-key-reference'),
  keyVersion: 1,
  encryptionProfileDigest: digest('provider-state-vault-encryption-profile'),
  retentionPolicyDigest: digest('provider-state-vault-retention-policy'),
  deletionReceiptPolicyDigest: digest(
    'provider-state-vault-deletion-receipt-policy'
  ),
});
const authority = createAgentNativeProviderStateVaultAuthority(
  stateVaultAuthorityInput
);

const vault = (
  status: 'failed' | 'sealed' | 'unavailable' = 'sealed'
): AgentNativeProviderStateVaultPort =>
  Object.freeze({
    authority,
    seal: vi.fn(async ({ request, callbackLocalProviderStateHandle }) => {
      expect(request.authorityDigest).toBe(authority.authorityDigest);
      expect(callbackLocalProviderStateHandle).toMatch(
        /^(?:interaction|resp)[._]/u
      );
      const stateKeyCreationReceiptDigest = digest(
        'provider-state-vault-state-key-creation'
      );
      return status === 'sealed'
        ? Object.freeze({
            status,
            opaqueProviderStateRef:
              createAgentNativeProviderStateVaultOpaqueRef({
                authorityDigest: request.authorityDigest,
                sealRequestDigest: request.sealRequestDigest,
                stateKeyCreationReceiptDigest,
              }),
            stateKeyCreationReceiptDigest,
            sealedAt: vaultSealedAt,
          })
        : Object.freeze({
            status,
            opaqueProviderStateRef: null,
            stateKeyCreationReceiptDigest: null,
            sealedAt: vaultSealedAt,
          });
    }),
    resolve: vi.fn(async () => {
      throw new Error('resolve is outside extraction callback');
    }),
    retire: vi.fn(async () => {
      throw new Error('retire is outside extraction callback');
    }),
    lookupRetirementReceipt: vi.fn(async () => null),
  });

const openAiResponse = (
  input: {
    status?: string;
    cachedTokens?: number;
    includeOutput?: boolean;
  } = {}
): AgentJsonValue =>
  Object.freeze({
    object: 'response',
    id: 'resp.native-extractor.1',
    status: input.status ?? 'completed',
    ...(input.includeOutput === false ? {} : { output: Object.freeze([]) }),
    usage: Object.freeze({
      input_tokens: 1_300,
      output_tokens: 8,
      input_tokens_details: Object.freeze({
        cached_tokens: input.cachedTokens ?? 1_024,
      }),
    }),
  });

const geminiInteraction = (
  input: {
    status?: string;
    cachedTokens?: number;
    legacyCacheFieldOnly?: boolean;
  } = {}
): AgentJsonValue =>
  Object.freeze({
    id: 'interaction.native-extractor.1',
    status: input.status ?? 'completed',
    outputs: Object.freeze([]),
    usage: Object.freeze({
      total_input_tokens: 4_200,
      total_output_tokens: 6,
      ...(input.legacyCacheFieldOnly
        ? { cachedContentTokenCount: input.cachedTokens ?? 4_096 }
        : { total_cached_tokens: input.cachedTokens ?? 4_096 }),
    }),
  });

describe('native Provider optional capability extraction conformance', () => {
  it.each([
    ['openai-responses', openAiResponse()],
    ['gemini-interactions', geminiInteraction()],
  ] as const)(
    'extracts a real terminal background fact from sealed %s state fields',
    async (protocolFamily, sealedResponseJson) => {
      const program = programFor('g4-provider-background-job');
      const binding = bindingFor(
        protocolFamily,
        'g4-provider-background-job',
        sealedResponseJson
      );
      const stateVault = vault();
      const candidate = await extractAgentNativeProviderOptionalCapability(
        program,
        {
          binding,
          sealedResponseJson,
          stateVault,
        }
      );

      expect(candidate.outcome).toBe('observed');
      expect(candidate.reason).toBeNull();
      expect(candidate.sourceReceipt).toMatchObject({
        capabilityProfileId: 'g4-provider-background-job',
        source: {
          sourceKind: 'provider-job-terminal-status',
          taskId: binding.taskId,
          runId: binding.runId,
          generation: binding.generation,
          providerStatus: 'completed',
        },
        fact: { factType: 'provider-job-receipt' },
      });
      expect(candidate.stateVaultSealRequest).not.toBeNull();
      expect(candidate.stateVaultSealReceipt).toMatchObject({
        status: 'sealed',
        opaqueProviderStateRef: expect.stringMatching(/^state-vault-ref\./u),
      });
      expect(
        isAgentNativeProviderStateVaultSealReceipt(
          candidate.stateVaultSealReceipt,
          candidate.stateVaultSealRequest!
        )
      ).toBe(true);
      expect(
        isAgentNativeProviderOptionalCapabilityExtractionCandidate(
          candidate,
          program
        )
      ).toBe(true);
      expect(
        matchAgentNativeProviderOptionalCapabilityExtractionBinding(
          candidate,
          program,
          binding,
          authority
        )
      ).toBe(true);
      expect(stateVault.seal).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(candidate)).not.toContain(
        protocolFamily === 'openai-responses'
          ? 'resp.native-extractor.1'
          : 'interaction.native-extractor.1'
      );
    }
  );

  it('requires the exact sealed cache-isolation and runtime-source authority', async () => {
    const sealedResponseJson = openAiResponse({ cachedTokens: 1_024 });
    const program = programFor('g4-provider-isolated-cache');
    const binding = bindingFor(
      'openai-responses',
      'g4-provider-isolated-cache',
      sealedResponseJson
    );
    await expect(
      extractAgentNativeProviderOptionalCapability(program, {
        binding: Object.freeze({
          ...binding,
          cacheIsolationAuthority: null,
        }),
        sealedResponseJson,
        stateVault: null,
      })
    ).rejects.toThrow(/extraction input is invalid/u);

    const swappedIsolationAuthority =
      createAgentNativeProviderCacheIsolationAuthority({
        program,
        semanticProof: binding.cacheIsolationAuthority!.semanticProof,
        runtimeFactSourceAuthorityDigest: digest(
          'swapped-runtime-fact-source-authority'
        ),
        providerConfigurationId: binding.providerConfigurationId,
      });
    const candidate = await extractAgentNativeProviderOptionalCapability(
      program,
      { binding, sealedResponseJson, stateVault: null }
    );
    expect(
      matchAgentNativeProviderOptionalCapabilityExtractionBinding(
        candidate,
        program,
        Object.freeze({
          ...binding,
          cacheIsolationAuthority: swappedIsolationAuthority,
        }),
        null
      )
    ).toBe(false);
    expect(
      isAgentNativeProviderCacheIsolationAuthority({
        ...binding.cacheIsolationAuthority!,
        isolationScopeDigest: digest('swapped-isolation-scope'),
      })
    ).toBe(false);
  });

  it.each([
    ['openai-responses', openAiResponse({ cachedTokens: 1_024 }), 1_024],
    ['gemini-interactions', geminiInteraction({ cachedTokens: 4_096 }), 4_096],
  ] as const)(
    'extracts cache evidence only from the official reported %s usage field',
    async (protocolFamily, sealedResponseJson, expectedCachedTokens) => {
      const program = programFor('g4-provider-isolated-cache');
      const binding = bindingFor(
        protocolFamily,
        'g4-provider-isolated-cache',
        sealedResponseJson
      );
      const candidate = await extractAgentNativeProviderOptionalCapability(
        program,
        {
          binding,
          sealedResponseJson,
          stateVault: null,
        }
      );

      expect(candidate.outcome).toBe('observed');
      expect(
        isAgentNativeProviderCacheIsolationAuthority(
          binding.cacheIsolationAuthority,
          program
        )
      ).toBe(true);
      expect(candidate.responseProjection.cachedTokenCount).toBe(
        expectedCachedTokens
      );
      expect(candidate.sourceReceipt?.source).toMatchObject({
        sourceKind: 'provider-cache-usage',
        prefixDescriptorDigest:
          program.providerRequestIntent.cachePrefixResource!.descriptorDigest,
        cachedTokenCount: expectedCachedTokens,
        cacheIsolationAuthorityDigest:
          binding.cacheIsolationAuthority!.authorityDigest,
        cacheScope: binding.cacheIsolationAuthority!.cacheScope,
        provenIsolation: binding.cacheIsolationAuthority!.provenCacheIsolation,
      });
      expect(candidate.sourceReceipt?.fact.factType).toBe(
        'provider-cache-receipt'
      );
      expect(candidate.stateVaultSealRequest).toBeNull();
      expect(
        isAgentNativeProviderOptionalCapabilityExtractionCandidate(
          candidate,
          program
        )
      ).toBe(true);
    }
  );

  it.each([
    ['openai-responses', openAiResponse({ cachedTokens: 0 })],
    [
      'gemini-interactions',
      geminiInteraction({ cachedTokens: 4_096, legacyCacheFieldOnly: true }),
    ],
  ] as const)(
    'keeps missing or zero official %s cache observations unavailable',
    async (protocolFamily, sealedResponseJson) => {
      const program = programFor('g4-provider-isolated-cache');
      const binding = bindingFor(
        protocolFamily,
        'g4-provider-isolated-cache',
        sealedResponseJson
      );
      const candidate = await extractAgentNativeProviderOptionalCapability(
        program,
        {
          binding,
          sealedResponseJson,
          stateVault: null,
        }
      );

      expect(candidate).toMatchObject({
        outcome: 'unavailable',
        reason: 'cache-hit-unobserved',
        sourceReceipt: null,
      });
      expect(
        isAgentNativeProviderOptionalCapabilityExtractionCandidate(
          candidate,
          program
        )
      ).toBe(true);
    }
  );

  it.each([
    ['openai-responses', openAiResponse()],
    ['gemini-interactions', geminiInteraction({ status: 'requires_action' })],
  ] as const)(
    'vaults the official %s state id before emitting an opaque continuation',
    async (protocolFamily, sealedResponseJson) => {
      const program = programFor('g4-provider-reasoning-continuation');
      const binding = bindingFor(
        protocolFamily,
        'g4-provider-reasoning-continuation',
        sealedResponseJson
      );
      const candidate = await extractAgentNativeProviderOptionalCapability(
        program,
        {
          binding,
          sealedResponseJson,
          stateVault: vault(),
        }
      );

      expect(candidate.outcome).toBe('observed');
      expect(candidate.stateVaultSealRequest?.expiresAt).toBe(
        '2026-08-09T03:02:05.500Z'
      );
      expect(candidate.sourceReceipt).toMatchObject({
        source: {
          sourceKind: 'provider-stored-continuation',
          taskId: binding.taskId,
          runId: binding.runId,
          generation: binding.generation,
          expiresAt: '2026-08-09T03:02:05.500Z',
        },
        fact: { factType: 'opaque-continuation' },
      });
      expect(
        isAgentNativeProviderOptionalCapabilityExtractionCandidate(
          candidate,
          program
        )
      ).toBe(true);
    }
  );

  it('seals an active job state and emits a real pollable job fact', async () => {
    const sealedResponseJson = openAiResponse({ status: 'in_progress' });
    const program = programFor('g4-provider-background-job');
    const binding = bindingFor(
      'openai-responses',
      'g4-provider-background-job',
      sealedResponseJson
    );
    const candidate = await extractAgentNativeProviderOptionalCapability(
      program,
      {
        binding,
        sealedResponseJson,
        stateVault: vault(),
      }
    );

    expect(candidate).toMatchObject({
      outcome: 'observed',
      reason: null,
      sourceReceipt: {
        source: {
          sourceKind: 'provider-job-active-status',
          providerStatus: 'in-progress',
        },
        fact: {
          factType: 'provider-job-receipt',
          value: {
            phase: 'running',
            callbackAuthority: 'active',
          },
        },
      },
      stateVaultSealReceipt: { status: 'sealed' },
    });
    expect(
      isAgentNativeProviderOptionalCapabilitySourceReceipt(
        candidate.sourceReceipt,
        program
      )
    ).toBe(true);
    expect(candidate.responseProjection).toMatchObject({
      providerStatus: 'in-progress',
      terminalEventType: null,
    });
    expect(
      isAgentNativeProviderStateVaultSealReceipt(
        candidate.stateVaultSealReceipt,
        candidate.stateVaultSealRequest!
      )
    ).toBe(true);
    expect(
      isAgentNativeProviderOptionalCapabilityExtractionCandidate(
        candidate,
        program
      )
    ).toBe(true);
  });

  it.each([
    [null, 'unavailable', 'provider-state-vault-unavailable'],
    [vault('unavailable'), 'unavailable', 'provider-state-vault-unavailable'],
    [vault('failed'), 'failed', 'provider-state-vault-failed'],
  ] as const)(
    'maps a missing or refusing vault to an exact %s candidate',
    async (stateVault, expectedOutcome, expectedReason) => {
      const sealedResponseJson = openAiResponse();
      const program = programFor('g4-provider-reasoning-continuation');
      const binding = bindingFor(
        'openai-responses',
        'g4-provider-reasoning-continuation',
        sealedResponseJson
      );
      const candidate = await extractAgentNativeProviderOptionalCapability(
        program,
        {
          binding,
          sealedResponseJson,
          stateVault,
        }
      );

      expect(candidate).toMatchObject({
        outcome: expectedOutcome,
        reason: expectedReason,
        sourceReceipt: null,
      });
      expect(
        isAgentNativeProviderOptionalCapabilityExtractionCandidate(
          candidate,
          program
        )
      ).toBe(true);
    }
  );

  it('fails closed for malformed terminal JSON, response commitment drift, and canary leakage', async () => {
    const malformed = openAiResponse({ includeOutput: false });
    const program = programFor('g4-provider-background-job');
    const malformedBinding = bindingFor(
      'openai-responses',
      'g4-provider-background-job',
      malformed
    );
    const failed = await extractAgentNativeProviderOptionalCapability(program, {
      binding: malformedBinding,
      sealedResponseJson: malformed,
      stateVault: vault(),
    });
    expect(failed).toMatchObject({
      outcome: 'failed',
      reason: 'provider-response-structure-invalid',
      sourceReceipt: null,
    });

    const response = openAiResponse();
    const binding = bindingFor(
      'openai-responses',
      'g4-provider-background-job',
      response
    );
    await expect(
      extractAgentNativeProviderOptionalCapability(program, {
        binding: Object.freeze({
          ...binding,
          responseDigest: digest('swapped-normalized-response'),
        }),
        sealedResponseJson: response,
        stateVault: vault(),
      })
    ).rejects.toThrow(/does not match normalized facts/u);

    await expect(
      extractAgentNativeProviderOptionalCapability(program, {
        binding,
        sealedResponseJson: Object.freeze({
          object: 'response',
          id: 'resp.native-extractor.1',
          status: 'completed',
          output: Object.freeze([
            Object.freeze({
              type: 'message',
              content: Object.freeze([
                Object.freeze({
                  type: 'output_text',
                  text: 'protected-native-extractor-canary',
                }),
              ]),
            }),
          ]),
          usage: Object.freeze({
            input_tokens: 1_300,
            output_tokens: 8,
            input_tokens_details: Object.freeze({ cached_tokens: 1_024 }),
          }),
        }),
        stateVault: vault(),
        sanitization: {
          protectedMaterialCanaries: Object.freeze([
            'protected-native-extractor-canary',
          ]),
          secretCanaries: Object.freeze([]),
        },
      })
    ).rejects.toThrow(/unsafe or unbounded/u);
  });

  it('rejects fully recomputed binding, vault-authority, and source swaps', async () => {
    const sealedResponseJson = openAiResponse();
    const program = programFor('g4-provider-background-job');
    const binding = bindingFor(
      'openai-responses',
      'g4-provider-background-job',
      sealedResponseJson
    );
    const candidate = await extractAgentNativeProviderOptionalCapability(
      program,
      {
        binding,
        sealedResponseJson,
        stateVault: vault(),
      }
    );
    const swappedBinding = Object.freeze({
      ...candidate.binding,
      providerConfigurationId: 'provider.openai-responses.swapped',
    });
    const { candidateDigest: _candidateDigest, ...candidateBase } = candidate;
    const swappedBase = Object.freeze({
      ...candidateBase,
      binding: swappedBinding,
      bindingDigest: digestAgentCanonicalValue(swappedBinding),
    });
    const recomputed = Object.freeze({
      ...swappedBase,
      candidateDigest: digestAgentCanonicalValue(swappedBase),
    });
    const swappedAuthority = createAgentNativeProviderStateVaultAuthority({
      ...stateVaultAuthorityInput,
      authorityId: 'provider-state-vault.production.swapped',
    });

    expect(
      isAgentNativeProviderOptionalCapabilityExtractionCandidate(
        recomputed,
        program
      )
    ).toBe(false);
    expect(
      matchAgentNativeProviderOptionalCapabilityExtractionBinding(
        candidate,
        program,
        binding,
        swappedAuthority
      )
    ).toBe(false);

    const swappedSourceBase = Object.freeze({
      ...candidateBase,
      sourceReceipt: Object.freeze({
        ...candidate.sourceReceipt!,
        providerConfigurationId: 'provider.openai-responses.swapped',
      }),
    });
    const swappedSource = Object.freeze({
      ...swappedSourceBase,
      candidateDigest: digestAgentCanonicalValue(swappedSourceBase),
    });
    expect(
      isAgentNativeProviderOptionalCapabilityExtractionCandidate(
        swappedSource,
        program
      )
    ).toBe(false);
  });
});
