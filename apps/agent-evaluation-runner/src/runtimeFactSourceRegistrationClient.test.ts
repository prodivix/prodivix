import {
  digestAgentCapabilityProbeProfile,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceOwnerAdmission,
  digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
} from './runtimeFactSourceRegistration';
import {
  AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT,
  createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient,
} from './runtimeFactSourceRegistrationClient';

const namespaceId = 'evaluation.runtime-registration.test';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const issuer = 'prodivix.g4-model-evaluation-ledger';
const token = 'runtime-registration-service-token-123456789';
const environment = Object.freeze({
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl]:
    AGENT_EVALUATION_LEDGER_BASE_URL,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace]: namespaceId,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit]:
    repositoryCommit,
  [AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token]: token,
});

const request = createAgentEvaluationRuntimeFactSourceRegistrationRequest({
  namespaceId,
  repositoryCommit,
  sourceAuthorityKind: 'shared-durable-capability',
  sourceKind: 'sealed-provider-response-metadata',
  sourceAuthorityId: 'runtime-source.test.openai.cache',
  sourceAuthorityImplementationDigest: digestAgentCanonicalValue({
    owner: 'runtime-source.test',
  }),
  routeBinding: 'provider-runtime-metadata.g4-provider-isolated-cache',
  capabilityProfileId: 'g4-provider-isolated-cache',
  capabilityProfileDigest: digestAgentCapabilityProbeProfile(
    'g4-provider-isolated-cache'
  ),
  capabilityId: 'provider.isolated-cache',
  protocolFamily: 'openai-responses',
  providerConfigurationId: 'provider.openai-responses.v8',
  modelId: 'model.openai.immutable.2026-08-08',
  modelLineageDigest: digestAgentCanonicalValue({ model: 'openai' }),
  adapterDigest: digestAgentCanonicalValue({ adapter: 'openai-responses' }),
  minimumExpiresAt: '2026-08-15T00:00:00.000Z',
});

const receiptFor = () => {
  const ownerHealthDigest = digestAgentCanonicalValue({ health: 'ready' });
  const stageDigest = digestAgentEvaluationRuntimeFactSourceRegistrationStage(
    request,
    issuer
  );
  const ownerAdmissionDigest =
    digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
      request.requestDigest,
      ownerHealthDigest,
      stageDigest
    );
  const dispatchAckDigest =
    digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
      requestDigest: request.requestDigest,
      ownerHealthDigest,
      ownerAdmissionDigest,
      stageDigest,
      registrationAuthorityIssuerId: issuer,
    });
  const base = Object.freeze({
    format: AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT,
    version: 1 as const,
    namespaceId: request.namespaceId,
    repositoryCommit: request.repositoryCommit,
    requestDigest: request.requestDigest,
    sourceAuthorityKind: request.sourceAuthorityKind,
    sourceKind: request.sourceKind,
    sourceAuthorityId: request.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      request.sourceAuthorityImplementationDigest,
    routeBinding: request.routeBinding,
    capabilityProfileId: request.capabilityProfileId,
    capabilityProfileDigest: request.capabilityProfileDigest,
    capabilityId: request.capabilityId,
    protocolFamily: request.protocolFamily,
    providerConfigurationId: request.providerConfigurationId,
    modelId: request.modelId,
    modelLineageDigest: request.modelLineageDigest,
    adapterDigest: request.adapterDigest,
    registrationAuthorityIssuerId: issuer,
    ownerHealthDigest,
    ownerAdmissionDigest,
    stageDigest,
    dispatchAckDigest,
    registeredAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-08-16T00:00:00.000Z',
  });
  return Object.freeze({
    ...base,
    registrationReceiptDigest: digestAgentCanonicalValue(base),
  });
};

const response = (value: unknown, status = 200): Response =>
  new Response(canonicalJsonText(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

describe('runtime fact source registration client', () => {
  it('posts one canonical idempotent request and returns the 8790-sealed authority', async () => {
    const receipt = receiptFor();
    const fetchSpy = vi.fn<typeof fetch>(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('Idempotency-Key')).toBe(request.requestDigest);
      expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
      expect(init).toMatchObject({
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      expect(init?.body).toBe(canonicalJsonText(request));
      return response(receipt);
    });
    const client =
      createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient({
        namespaceId,
        repositoryCommit,
        environment,
        fetch: fetchSpy,
      });

    const first = await client.register(request);
    const replay = await client.register(request);

    expect(first).toEqual(replay);
    expect(first.receipt).toEqual(receipt);
    expect(first.authority).toMatchObject({
      sourceAuthorityId: request.sourceAuthorityId,
      registrationAuthorityIssuerId: issuer,
      registrationReceiptDigest: receipt.registrationReceiptDigest,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
      `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/runtime-fact-source-owner-registrations`
    );
  });

  it('rejects an ACK, issuer, receipt, or response-shape swap', async () => {
    for (const mutate of [
      (value: Record<string, unknown>) => {
        value.dispatchAckDigest = digestAgentCanonicalValue('swapped-ack');
      },
      (value: Record<string, unknown>) => {
        value.registrationAuthorityIssuerId = 'authority.swapped';
      },
      (value: Record<string, unknown>) => {
        value.registrationReceiptDigest =
          digestAgentCanonicalValue('swapped-receipt');
      },
      (value: Record<string, unknown>) => {
        value.extra = true;
      },
    ]) {
      const tampered = structuredClone(receiptFor()) as Record<string, unknown>;
      mutate(tampered);
      const client =
        createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient({
          namespaceId,
          repositoryCommit,
          environment,
          fetch: async () => response(tampered),
        });
      await expect(client.register(request)).rejects.toMatchObject({
        code: 'G4_RUNNER_RESPONSE_INVALID',
      });
    }
  });

  it('matches the Go registration stage, owner admission, and ACK vector', () => {
    const requestDigest = `sha256-${'1'.repeat(64)}`;
    const ownerHealthDigest = `sha256-${'2'.repeat(64)}`;
    const stageDigest = digestAgentCanonicalValue({
      format:
        'prodivix.agent-evaluation-runtime-fact-source-owner-registration-stage',
      version: 1,
      requestDigest,
      registrationAuthorityIssuerId: issuer,
    });
    expect(stageDigest).toBe(
      'sha256-14b5676084d177f77212cc4513bfc73a997c90b66f0c77d605cdd4a4588cab02'
    );
    const ownerAdmissionDigest =
      digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
        requestDigest,
        ownerHealthDigest,
        stageDigest
      );
    expect(ownerAdmissionDigest).toBe(
      'sha256-d3f680b832a18c3cb4bd14c2ae05f25a9acab5846bd68778d7fd5668d5452785'
    );
    expect(
      digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
        requestDigest,
        ownerHealthDigest,
        ownerAdmissionDigest,
        stageDigest,
        registrationAuthorityIssuerId: issuer,
      })
    ).toBe(
      'sha256-bf8036bb8c8f718cbe9e23da49646f505fedb85ca58ea683e4cacfe7dbd7c682'
    );
  });
});
