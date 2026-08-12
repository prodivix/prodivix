import { readFileSync } from 'node:fs';
import {
  createAgentEvaluationTransportReceipt,
  createAgentNativeProviderStateVaultAuthority,
  createAgentNativeProviderStateVaultOpaqueRef,
  digestAgentCanonicalValue,
  digestAgentNativeProviderRuntimeResponse,
  normalizeNativeAgentProviderRuntimeEvents,
  planAgentModelEvaluationAttempts,
  type AgentJsonValue,
  type AgentNativeProviderStateVaultPort,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import { createProductionAgentEvaluationNativeOptionalCapabilityResolver } from './productionNativeProviderOptionalCapability';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const source = materializeAgentEvaluationTestProductionRunConfig(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../specs/evaluation/g4-real-model-evaluation.example.json',
        import.meta.url
      ),
      'utf8'
    )
  ) as Record<string, unknown>
);
const config = decodeAgentEvaluationFrozenRunConfig(source, {
  clock: () => '2026-08-08T00:00:00.000Z',
  expectedRepositoryCommit: '0123456789abcdef0123456789abcdef01234567',
});

const response = Object.freeze({
  type: 'response.completed',
  response: Object.freeze({
    object: 'response',
    id: 'resp.production-native-bootstrap.1',
    status: 'completed',
    output: Object.freeze([]),
    usage: Object.freeze({
      input_tokens: 32,
      output_tokens: 4,
      input_tokens_details: Object.freeze({ cached_tokens: 0 }),
    }),
  }),
}) satisfies AgentJsonValue;

describe('production native Provider optional capability authority', () => {
  it('extracts and seals a turn-zero Provider job through the durable state-vault port', async () => {
    const target = config.plan.capabilityQualificationTargets.find(
      (candidate) =>
        candidate.protocolFamily === 'openai-responses' &&
        candidate.optionalCapabilitySupportAuthority?.capabilityId ===
          'provider.background-job'
    );
    const descriptor = planAgentModelEvaluationAttempts(config.plan).find(
      (candidate) => candidate.targetId === target?.targetId
    );
    const provider = config.plan.providerConfigurations.find(
      (candidate) =>
        candidate.providerConfigurationId === target?.providerConfigurationId
    );
    if (!target || !descriptor || !provider) {
      throw new Error('Native Provider target fixture is unavailable.');
    }
    const invocationId = 'invocation.production-native-bootstrap.1';
    const requestDigest = digestAgentCanonicalValue({ invocationId });
    const startedAt = '2026-08-08T00:00:00.000Z';
    const completedAt = '2026-08-08T00:00:00.250Z';
    const runtimeEvents = normalizeNativeAgentProviderRuntimeEvents(
      'openai-responses',
      [response],
      { invocationId, occurredAt: startedAt }
    );
    const responseDigest = digestAgentNativeProviderRuntimeResponse(
      requestDigest,
      runtimeEvents
    );
    const transportReceipt = createAgentEvaluationTransportReceipt({
      receiptId: 'transport.production-native-bootstrap.1',
      protocolFamily: 'openai-responses',
      providerConfigurationId: target.providerConfigurationId,
      invocationId,
      dispatchIntentDigest: digestAgentCanonicalValue({ dispatch: 1 }),
      requestDigest,
      endpointId: 'endpoint.openai-responses.production-native-bootstrap',
      endpointClass: 'first-party-hosted',
      requestBodyDigest: digestAgentCanonicalValue({ requestBody: 1 }),
      requestBytes: 128,
      responseBytes: 256,
      sseEventCount: 1,
      dispatchState: 'dispatched',
      outcome: 'completed',
      httpStatus: 200,
      responseHeaderDigest: digestAgentCanonicalValue({ headers: 1 }),
      responseBodyDigest: digestAgentCanonicalValue({ response }),
      providerRequestId: 'request.openai.production-native-bootstrap.1',
      providerIdentityKind: 'response-id',
      providerResponseId: 'resp.production-native-bootstrap.1',
      startedAt,
      completedAt,
    });
    let callbackLocalProviderStateHandle: string | null = null;
    const stateVault: AgentNativeProviderStateVaultPort = Object.freeze({
      authority: config.nativeProviderStateVaultEncryption.authority,
      seal: async ({ request, callbackLocalProviderStateHandle: handle }) => {
        callbackLocalProviderStateHandle = handle;
        const stateKeyCreationReceiptDigest = digestAgentCanonicalValue({
          authorityDigest: request.authorityDigest,
          sealRequestDigest: request.sealRequestDigest,
          stateKey: 'created',
        });
        return Object.freeze({
          status: 'sealed' as const,
          opaqueProviderStateRef: createAgentNativeProviderStateVaultOpaqueRef({
            authorityDigest: request.authorityDigest,
            sealRequestDigest: request.sealRequestDigest,
            stateKeyCreationReceiptDigest,
          }),
          stateKeyCreationReceiptDigest,
          sealedAt: request.observedAt,
        });
      },
      resolve: async () => {
        throw new Error('unreachable');
      },
      retire: async () => {
        throw new Error('unreachable');
      },
      lookupRetirementReceipt: async () => null,
    });
    const resolver =
      createProductionAgentEvaluationNativeOptionalCapabilityResolver({
        plan: config.plan,
        expectedStateVaultAuthority:
          config.nativeProviderStateVaultEncryption.authority,
        stateVault,
        protectedMaterialCanaries: () => Object.freeze([]),
        secretCanaries: () => Object.freeze([]),
      });
    const resolution = await resolver(
      Object.freeze({
        descriptor,
        turnIndex: 0,
        request: Object.freeze({
          protocolFamily: 'openai-responses' as const,
          invocation: Object.freeze({
            invocationId,
            requestDigest,
            providerConfigurationId: target.providerConfigurationId,
            modelLineageDigest: target.modelLineageDigest,
            capabilityProfileDigest: target.capabilityProfileDigest,
            inferenceConfigurationDigest: target.inferenceConfigurationDigest,
            contextPackDigest: digestAgentCanonicalValue({ context: 1 }),
          }),
        }),
        providerEvents: Object.freeze([response]),
        runtimeEvents: Object.freeze([]),
        transportReceipt,
        responseDigest,
        resultSpoolAad: Object.freeze({}) as never,
        encryptedResultSpool: Object.freeze({}) as never,
      })
    );

    expect(resolution).toMatchObject({
      outcome: 'observed',
      nativeSourceReceipt: {
        source: {
          sourceKind: 'provider-job-terminal-status',
          taskId: descriptor.attemptId,
          providerStatus: 'completed',
        },
        fact: { factType: 'provider-job-receipt' },
      },
    });
    const sourceProjection = resolution?.nativeSourceReceipt?.source;
    expect(sourceProjection?.sourceKind).toBe('provider-job-terminal-status');
    if (sourceProjection?.sourceKind !== 'provider-job-terminal-status') {
      throw new Error('Native Provider job projection was not extracted.');
    }
    expect(callbackLocalProviderStateHandle).toBe(
      'resp.production-native-bootstrap.1'
    );
    expect(sourceProjection.opaqueProviderStateRef).toMatch(
      /^state-vault-ref\.[a-f0-9]{64}$/u
    );
    expect(sourceProjection.opaqueProviderStateRef).not.toContain(
      callbackLocalProviderStateHandle!
    );
  });

  it('rejects a state-vault port outside the frozen authority', () => {
    const expected = config.nativeProviderStateVaultEncryption.authority;
    const stateVault: AgentNativeProviderStateVaultPort = Object.freeze({
      authority: createAgentNativeProviderStateVaultAuthority({
        authorityId: expected.authorityId,
        authorityImplementationDigest: digestAgentCanonicalValue({
          authorityImplementation: 'drifted',
        }),
        algorithm: expected.algorithm,
        keyReferenceDigest: expected.keyReferenceDigest,
        keyVersion: expected.keyVersion,
        encryptionProfileDigest: expected.encryptionProfileDigest,
        retentionPolicyDigest: expected.retentionPolicyDigest,
        deletionReceiptPolicyDigest: expected.deletionReceiptPolicyDigest,
      }),
      seal: async () => {
        throw new Error('unreachable');
      },
      resolve: async () => {
        throw new Error('unreachable');
      },
      retire: async () => {
        throw new Error('unreachable');
      },
      lookupRetirementReceipt: async () => null,
    });
    expect(() =>
      createProductionAgentEvaluationNativeOptionalCapabilityResolver({
        plan: config.plan,
        expectedStateVaultAuthority: expected,
        stateVault,
        protectedMaterialCanaries: () => Object.freeze([]),
        secretCanaries: () => Object.freeze([]),
      })
    ).toThrowError(/authority drifted/u);
  });
});
