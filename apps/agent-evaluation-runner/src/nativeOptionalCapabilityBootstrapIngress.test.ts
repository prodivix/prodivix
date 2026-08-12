import {
  createAgentCapabilityProbeProgram,
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationProviderResultSpoolId,
  createAgentEvaluationTransportReceipt,
  createAgentNativeProviderExecutionIdentityAuthority,
  createAgentNativeProviderOptionalCapabilitySourceReceipt,
  digestAgentCanonicalValue,
  digestAgentCapabilityProbeProfile,
  digestAgentEvaluationProviderResultSpoolAad,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentNativeProviderTransportRequest,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  nativeOptionalCapabilityBootstrapIngressMatchesTransport,
} from './nativeOptionalCapabilityBootstrapIngress';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const completedAt = '2026-08-09T08:00:00.000Z';
const program = createAgentCapabilityProbeProgram({
  capabilityProfileId: 'g4-provider-background-job',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-background-job'
  ),
});
const descriptorBase = Object.freeze({
  attemptId: `evaluation-attempt:${digest('sampling').slice('sha256-'.length)}`,
  planDigest: digest('plan'),
  shardId: 'evaluation-shard.native-bootstrap',
  caseId: 'case.native-bootstrap',
  capabilityDescriptorDigest: digest('capability-descriptor'),
  targetId: 'target.native-bootstrap',
  targetDigest: digest('target'),
  riskClass: 'ordinary' as const,
  repetitionIndex: 0,
  samplingIdentityDigest: digest('sampling'),
});
const descriptor: AgentModelEvaluationAttemptDescriptor = Object.freeze({
  ...descriptorBase,
  descriptorDigest: digestAgentCanonicalValue(descriptorBase),
});
const request: AgentNativeProviderTransportRequest = Object.freeze({
  protocolFamily: 'openai-responses',
  invocation: Object.freeze({
    invocationId: 'invocation.native-bootstrap.1',
    requestDigest: digest('provider-request'),
    providerConfigurationId: 'provider.native-bootstrap',
    modelLineageDigest: digest('model-lineage'),
    capabilityProfileDigest: program.profileProjection.capabilityProfileDigest,
    inferenceConfigurationDigest: digest('inference'),
    contextPackDigest: digest('context'),
  }),
});
const dispatchIntentDigest = digest('dispatch-intent');
const responseBodyDigest = digest('response-body');
const responseDigest = digest('provider-response');
const transportReceipt = createAgentEvaluationTransportReceipt({
  receiptId: 'transport-receipt.native-bootstrap',
  protocolFamily: request.protocolFamily,
  providerConfigurationId: request.invocation.providerConfigurationId,
  invocationId: request.invocation.invocationId,
  requestDigest: request.invocation.requestDigest,
  endpointId: 'endpoint.native-bootstrap',
  endpointClass: 'first-party-hosted',
  dispatchIntentDigest,
  requestBodyDigest: digest('request-body'),
  requestBytes: 16,
  responseBytes: 32,
  httpStatus: 200,
  responseHeaderDigest: digest('response-headers'),
  responseBodyDigest,
  providerRequestId: 'provider-request.native-bootstrap',
  providerIdentityKind: 'response-id',
  providerResponseId: 'provider-response.native-bootstrap',
  resolvedModelId: 'model.native-bootstrap',
  sseEventCount: 2,
  dispatchState: 'dispatched',
  outcome: 'completed',
  startedAt: completedAt,
  completedAt,
});
const resultSpoolAad = createAgentEvaluationProviderResultSpoolAad({
  namespaceDigest: digest('namespace'),
  planDigest: descriptor.planDigest,
  repositoryCommit: '0'.repeat(40),
  attemptId: descriptor.attemptId,
  descriptorDigest: descriptor.descriptorDigest,
  turnIndex: 0,
  invocationId: request.invocation.invocationId,
  dispatchIntentDigest,
  transportReceiptDigest: transportReceipt.receiptDigest,
  responseBodyDigest,
  normalizedEventSetDigest: digest('normalized-events'),
});
const encryptedResultSpool = createAgentEvaluationProviderResultSpoolEnvelope({
  spoolId: createAgentEvaluationProviderResultSpoolId(resultSpoolAad),
  algorithm: 'aes-256-gcm',
  keyId: 'key.native-bootstrap',
  keyVersion: 1,
  keyRefDigest: digest('key-ref'),
  encryptionProfileDigest: digest('encryption-profile'),
  nonceBase64Url: 'AAAAAAAAAAAAAAAA',
  authenticationTagBase64Url: 'AAAAAAAAAAAAAAAAAAAAAA',
  ciphertextBase64Url: 'AQID',
  aadDigest: digestAgentEvaluationProviderResultSpoolAad(resultSpoolAad),
});
const executionIdentityAuthority =
  createAgentNativeProviderExecutionIdentityAuthority({
    invocationId: request.invocation.invocationId,
    taskId: 'task.native-bootstrap',
    runId: 'run.native-bootstrap',
    generation: 1,
  });
const nativeSourceReceipt =
  createAgentNativeProviderOptionalCapabilitySourceReceipt(program, {
    protocolFamily: 'openai-responses',
    capabilityProfileDigest: request.invocation.capabilityProfileDigest,
    invocationId: request.invocation.invocationId,
    requestDigest: request.invocation.requestDigest,
    responseDigest,
    providerConfigurationId: request.invocation.providerConfigurationId,
    modelLineageDigest: request.invocation.modelLineageDigest,
    adapterDigest: digest('adapter'),
    executionIdentityAuthority,
    observedAt: completedAt,
    source: Object.freeze({
      sourceKind: 'provider-job-terminal-status',
      providerStateReferenceDigest: digest('provider-state-reference'),
      opaqueProviderStateRef: 'provider-state.native-job-reference',
      stateVaultAuthorityDigest: digest('state-vault-authority'),
      stateVaultSealRequestDigest: digest('state-vault-seal-request'),
      stateVaultSealReceiptDigest: digest('state-vault-seal-receipt'),
      taskId: 'task.native-bootstrap',
      runId: 'run.native-bootstrap',
      generation: 1,
      providerStatus: 'completed',
    }),
  });

const createIngress = () =>
  createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress({
    descriptor,
    turnIndex: 0,
    request,
    transportReceipt,
    responseDigest,
    resultSpoolAad,
    encryptedResultSpool,
    resolution: Object.freeze({
      program,
      outcome: 'observed',
      nativeSourceReceipt,
    }),
  });

describe('native optional capability bootstrap close ingress', () => {
  it('binds the raw Provider source to the exact closed transport roots', () => {
    const ingress = createIngress();

    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(ingress)
    ).toBe(true);
    expect(
      nativeOptionalCapabilityBootstrapIngressMatchesTransport(ingress, {
        turnIndex: 0,
        transportReceipt,
        responseDigest,
        resultSpoolAad,
        encryptedResultSpool,
      })
    ).toBe(true);
    expect(ingress.nativeSourceReceipt).toEqual(nativeSourceReceipt);
  });

  it('creates an explicit unavailable source without fabricating a receipt', () => {
    const ingress =
      createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress({
        descriptor,
        turnIndex: 0,
        request,
        transportReceipt,
        responseDigest,
        resultSpoolAad,
        encryptedResultSpool,
        resolution: Object.freeze({
          program,
          outcome: 'unavailable',
          nativeSourceReceipt: null,
        }),
      });

    expect(ingress).toMatchObject({
      outcome: 'unavailable',
      nativeSourceReceipt: null,
    });
  });

  it('rejects turn, receipt, and recomputed-root substitutions', () => {
    expect(() =>
      createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress({
        descriptor,
        turnIndex: 1,
        request,
        transportReceipt,
        responseDigest,
        resultSpoolAad,
        encryptedResultSpool,
        resolution: Object.freeze({
          program,
          outcome: 'observed',
          nativeSourceReceipt,
        }),
      })
    ).toThrow('close binding is invalid');

    const ingress = createIngress();
    const { ingressDigest: _ingressDigest, ...ingressBase } = ingress;
    const driftedBase = Object.freeze({
      ...ingressBase,
      resultSpoolEnvelopeDigest: digest('swapped-envelope'),
    });
    const drifted = Object.freeze({
      ...driftedBase,
      ingressDigest: digestAgentCanonicalValue(driftedBase),
    });
    expect(
      isAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(drifted)
    ).toBe(true);
    expect(
      nativeOptionalCapabilityBootstrapIngressMatchesTransport(drifted, {
        turnIndex: 0,
        transportReceipt,
        responseDigest,
        resultSpoolAad,
        encryptedResultSpool,
      })
    ).toBe(false);
    expect(
      nativeOptionalCapabilityBootstrapIngressMatchesTransport(
        Object.freeze({
          ...ingress,
          providerResponseDigest: digest('swapped-response'),
        }),
        {
          turnIndex: 0,
          transportReceipt,
          responseDigest,
          resultSpoolAad,
          encryptedResultSpool,
        }
      )
    ).toBe(false);
  });
});
