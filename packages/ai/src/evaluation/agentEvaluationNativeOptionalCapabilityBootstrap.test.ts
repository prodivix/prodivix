import { describe, expect, it } from 'vitest';
import { digestAgentCanonicalValue } from '../domain/agentCanonical';
import {
  createAgentCapabilityProbeProgram,
  digestAgentCapabilityProbeProfile,
} from '../providers/agentCapabilityProbeProgram';
import {
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
} from '../providers/agentNativeProviderOptionalCapability';
import { createAgentEvaluationRuntimeFactSourceAuthority } from './agentEvaluationPlan';
import {
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt,
  digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck,
  digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage,
  isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest,
  reconcileAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  type CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput,
} from './agentEvaluationNativeOptionalCapabilityBootstrap';
import {
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  matchAgentEvaluationProviderCapabilityFactRuntimeSourceAuthority,
} from './agentEvaluationProviderCapabilityObservation';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const observedAt = '2026-08-09T03:00:01.000Z';
const transportCompletedAt = '2026-08-09T03:00:00.000Z';
const sealedAt = '2026-08-09T03:00:02.000Z';
const program = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-background-job',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  ),
});

const runtimeFactSourceAuthority =
  createAgentEvaluationRuntimeFactSourceAuthority({
    kind: 'shared-durable-capability',
    sourceKind: 'sealed-provider-response-metadata',
    sourceAuthorityId: 'authority.native-bootstrap.8790',
    sourceAuthorityImplementationDigest: digest(
      'native-bootstrap-source-implementation'
    ),
    routeBinding: 'route.native-bootstrap.8790',
    capabilityProfileId: program.profileProjection.capabilityProfileId,
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    capabilityId: 'provider.background-job',
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.openai.production',
    modelId: 'gpt-production-native-bootstrap',
    modelLineageDigest: digest('native-bootstrap-model-lineage'),
    adapterDigest: digest('native-bootstrap-adapter'),
    registrationAuthorityIssuerId: 'authority.backend-8790.production',
    registrationReceiptDigest: digest('native-bootstrap-registration'),
  });

const providerRequestDigest = digest('native-bootstrap-provider-request');
const providerResponseDigest = digest('native-bootstrap-provider-response');
const invocationId = 'invocation.native-bootstrap.1';

const nativeSourceReceipt =
  createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
    protocolFamily: 'openai-responses',
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    invocationId,
    requestDigest: providerRequestDigest,
    responseDigest: providerResponseDigest,
    providerConfigurationId: 'provider.openai.production',
    modelLineageDigest: digest('native-bootstrap-model-lineage'),
    adapterDigest: digest('native-bootstrap-adapter'),
    executionIdentityAuthority:
      createAgentNativeProviderExecutionIdentityAuthority({
        invocationId,
        taskId: 'task.native-bootstrap.1',
        runId: 'run.native-bootstrap.1',
        generation: 1,
      }),
    source: Object.freeze({
      sourceKind: 'provider-job-terminal-status',
      providerStateReferenceDigest: digest('native-bootstrap-job-state'),
      opaqueProviderStateRef: 'state-vault-ref.native-bootstrap-job-state',
      stateVaultAuthorityDigest: digest('native-bootstrap-vault-authority'),
      stateVaultSealRequestDigest: digest(
        'native-bootstrap-vault-seal-request'
      ),
      stateVaultSealReceiptDigest: digest(
        'native-bootstrap-vault-seal-receipt'
      ),
      taskId: 'task.native-bootstrap.1',
      runId: 'run.native-bootstrap.1',
      generation: 1,
      providerStatus: 'completed',
    }),
    observedAt,
  });

const sourceRequestInput = (
  overrides: Partial<CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput> = {}
): CreateAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequestInput =>
  Object.freeze({
    namespaceId: 'namespace.native-bootstrap.production',
    planDigest: digest('native-bootstrap-plan'),
    repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
    attemptId: 'attempt.native-bootstrap.1',
    descriptorDigest: digest('native-bootstrap-descriptor'),
    turnIndex: 0,
    invocationId,
    providerRequestDigest,
    providerResponseDigest,
    protocolFamily: 'openai-responses',
    providerConfigurationId: 'provider.openai.production',
    modelLineageDigest: digest('native-bootstrap-model-lineage'),
    adapterDigest: digest('native-bootstrap-adapter'),
    dispatchIntentDigest: digest('native-bootstrap-dispatch-intent'),
    transportReceiptDigest: digest('native-bootstrap-transport'),
    resultSpoolReceiptDigest: digest('native-bootstrap-spool'),
    normalizedEventSetDigest: digest('native-bootstrap-normalized-events'),
    transportCompletedAt,
    runtimeFactSourceAuthority,
    outcome: 'observed',
    nativeSourceReceipt,
    observedAt,
    ...overrides,
  });

const createObservedReceipt = () => {
  const sourceRequest =
    createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
      program,
      sourceRequestInput()
    );
  return createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
    program,
    { sourceRequest, sealedAt }
  );
};

describe('native optional capability bootstrap authority', () => {
  it('seals a raw Provider source and publishes one registered shared runtime fact', () => {
    const receipt = createObservedReceipt();
    const envelope =
      createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        receipt
      );

    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        receipt.sourceRequest,
        program
      )
    ).toBe(true);
    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        receipt,
        program
      )
    ).toBe(true);
    expect(receipt.sourceOwnerStageDigest).toBe(
      digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerStage(
        receipt.sourceRequest
      )
    );
    expect(receipt.sourceOwnerDispatchAckDigest).toBe(
      digestAgentEvaluationNativeOptionalCapabilityBootstrapSourceOwnerDispatchAck(
        receipt.sourceRequest,
        receipt.sourceOwnerStageDigest,
        sealedAt
      )
    );
    expect(envelope).toMatchObject({
      sourceAuthorityKind: 'shared-durable-capability',
      sourceAuthorityId: runtimeFactSourceAuthority.sourceAuthorityId,
      stageDigest: receipt.sourceOwnerStageDigest,
      dispatchAckDigest: receipt.sourceOwnerDispatchAckDigest,
      transportReceiptDigest: sourceRequestInput().transportReceiptDigest,
      resultSpoolReceiptDigest: sourceRequestInput().resultSpoolReceiptDigest,
      normalizedEventSetDigest: sourceRequestInput().normalizedEventSetDigest,
      fact: {
        factKind: 'provider-job-receipt',
        factDigest: receipt.sourceRequest.fact?.factDigest,
      },
    });
    const factAuthority =
      createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
        envelope!
      );
    expect(
      matchAgentEvaluationProviderCapabilityFactRuntimeSourceAuthority(
        factAuthority,
        runtimeFactSourceAuthority
      )
    ).toBe(true);
    expect(
      new TextEncoder().encode(JSON.stringify(receipt)).byteLength
    ).toBeLessThanOrEqual(32_768);
  });

  it.each(['unavailable', 'failed'] as const)(
    'seals %s without publishing or synthesizing an optional fact',
    (outcome) => {
      const sourceRequest =
        createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
          program,
          sourceRequestInput({
            outcome,
            nativeSourceReceipt: null,
          })
        );
      const receipt =
        createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
          program,
          { sourceRequest, sealedAt }
        );

      expect(sourceRequest.nativeSourceReceiptDigest).toBeNull();
      expect(sourceRequest.fact).toBeNull();
      expect(
        createAgentEvaluationProviderCapabilityRuntimeFactEnvelopeFromNativeOptionalCapabilityBootstrapSourceReceipt(
          program,
          receipt
        )
      ).toBeNull();
    }
  );

  it('reconciles ACK loss to the exact persisted receipt and rejects a swapped ACK', () => {
    const receipt = createObservedReceipt();
    expect(
      reconcileAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        receipt,
        receipt
      )
    ).toBe(receipt);
    const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
    const swappedBase = Object.freeze({
      ...receiptBase,
      sourceOwnerDispatchAckDigest: digest('swapped-bootstrap-ack'),
    });
    const swapped = Object.freeze({
      ...swappedBase,
      receiptDigest: digestAgentCanonicalValue(swappedBase),
    });
    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        swapped,
        program
      )
    ).toBe(false);
    expect(() =>
      reconcileAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        receipt,
        swapped
      )
    ).toThrow(/invalid|drifted/u);
  });

  it('rejects missing supported facts, hidden facts on unavailable, and binding swaps', () => {
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({ nativeSourceReceipt: null })
      )
    ).toThrow(/receipt drifted/u);
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({ outcome: 'unavailable' })
      )
    ).toThrow(/receipt drifted/u);
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({
          providerResponseDigest: digest('swapped-provider-response'),
        })
      )
    ).toThrow(/receipt drifted/u);
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({
          runtimeFactSourceAuthority: Object.freeze({
            ...runtimeFactSourceAuthority,
            authorityDigest: digest('swapped-runtime-authority'),
          }),
        })
      )
    ).toThrow(/authority drifted/u);

    const request =
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput()
      );
    const { requestDigest: _requestDigest, ...requestBase } = request;
    const tamperedBase = Object.freeze({
      ...requestBase,
      fact: Object.freeze({
        ...request.fact!,
        factDigest: digest('swapped-native-source-fact'),
      }),
    });
    const tamperedRequest = Object.freeze({
      ...tamperedBase,
      requestDigest: digestAgentCanonicalValue(tamperedBase),
    });
    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        tamperedRequest,
        program
      )
    ).toBe(false);
  });

  it('rejects observations before transport completion and receipts outside the 30s seal window', () => {
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({
          transportCompletedAt: '2026-08-09T03:00:02.000Z',
        })
      )
    ).toThrow(/request is invalid/u);
    const sourceRequest =
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput()
      );
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        program,
        {
          sourceRequest,
          sealedAt: '2026-08-09T03:00:31.001Z',
        }
      )
    ).toThrow(/receipt is invalid/u);
  });

  it('rejects secret and holdout canaries before a bootstrap request can be sealed', () => {
    const secretCanary = 'secret-bootstrap-canary-a665a4592042';
    const {
      authorityDigest: _authorityDigest,
      ...runtimeFactSourceAuthorityInput
    } = runtimeFactSourceAuthority;
    const unsafeAuthority = createAgentEvaluationRuntimeFactSourceAuthority({
      ...runtimeFactSourceAuthorityInput,
      routeBinding: secretCanary,
    });
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapSourceRequest(
        program,
        sourceRequestInput({
          runtimeFactSourceAuthority: unsafeAuthority,
        }),
        {
          protectedMaterialCanaries: Object.freeze([
            'protected-bootstrap-canary-9f86d081884c',
          ]),
          secretCanaries: Object.freeze([secretCanary]),
        }
      )
    ).toThrow(/unsafe or unbounded/u);
  });
});
