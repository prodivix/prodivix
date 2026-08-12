import {
  createAgentNativeProviderStateVaultRetirementReceipt,
  createAgentNativeProviderStateVaultRetireRequest,
  digestAgentCanonicalValue,
  resolveAgentNativeProviderStateVaultState,
  retireAgentNativeProviderStateVaultState,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RESULT_FORMAT,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_SEAL_COMMAND_FORMAT,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION,
  createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient,
} from './productionNativeProviderStateVaultClient';
import { createAgentEvaluationNativeProviderStateVaultEncryptionProfile } from './runConfig';
import {
  createAgentEvaluationTestStateVaultConsumedLifecycle,
  createAgentEvaluationTestStateVaultSeal,
} from './stateVault.fixture';

const namespaceId = 'evaluation.namespace.state-vault';
const planDigest =
  'sha256-1111111111111111111111111111111111111111111111111111111111111111';
const repositoryCommit = '0123456789abcdef0123456789abcdef01234567';
const token = 'state-vault-service-token-0123456789abcdef';
const profile =
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile();
const seal = createAgentEvaluationTestStateVaultSeal({
  purpose: 'background-job-state',
  attemptId: 'attempt.state-vault.1',
  protocolFamily: 'openai-responses',
  invocationId: 'invocation.state-vault.source.1',
  requestDigest:
    'sha256-2222222222222222222222222222222222222222222222222222222222222222',
  responseDigest:
    'sha256-3333333333333333333333333333333333333333333333333333333333333333',
  providerConfigurationId: 'provider.openai.state-vault.1',
  modelLineageDigest:
    'sha256-4444444444444444444444444444444444444444444444444444444444444444',
  adapterDigest:
    'sha256-5555555555555555555555555555555555555555555555555555555555555555',
  taskId: 'task.state-vault.1',
  runId: 'run.state-vault.1',
  generation: 1,
  observedAt: '2026-08-08T00:00:00.000Z',
  expiresAt: '2026-08-08T00:02:05.000Z',
  callbackLocalProviderStateHandle: 'resp.state-vault.1',
  authorityDigest: profile.authority.authorityDigest,
});
const lifecycle = createAgentEvaluationTestStateVaultConsumedLifecycle(seal, {
  consumerAttemptId: seal.sealRequest.attemptId,
  consumerInvocationId: 'invocation.state-vault.consumer.1',
  requestedAt: '2026-08-08T00:00:00.500Z',
});

const environment = (name: string): string | undefined => {
  switch (name) {
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl:
      return AGENT_EVALUATION_LEDGER_BASE_URL;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace:
      return namespaceId;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit:
      return repositoryCommit;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token:
      return token;
    default:
      return undefined;
  }
};

const response = (value: unknown, status: number): Response =>
  new Response(canonicalJsonText(value), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

describe('production Native Provider state-vault client', () => {
  it('executes the exact seal, resolve, retire, and ACK-loss lookup lifecycle', async () => {
    const paths: string[] = [];
    const fetchImplementation: typeof globalThis.fetch = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        const url = String(source);
        paths.push(new URL(url).pathname);
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
        expect(
          headers.get(
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER
          )
        ).toBe(PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE);
        if (url.endsWith('/seal')) {
          const command = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          expect(command).toMatchObject({
            format:
              PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_SEAL_COMMAND_FORMAT,
            version:
              PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION,
            callbackLocalProviderStateHandle:
              seal.callbackLocalProviderStateHandle,
          });
          expect(sameCanonicalJson(command.request, seal.sealRequest)).toBe(
            true
          );
          expect(headers.get('Idempotency-Key')).toBe(
            seal.sealRequest.sealRequestDigest
          );
          return response(seal.sealReceipt, 201);
        }
        if (url.endsWith('/resolve')) {
          expect(
            sameCanonicalJson(
              JSON.parse(String(init?.body)),
              lifecycle.stateVaultResolveRequest
            )
          ).toBe(true);
          expect(headers.get('Idempotency-Key')).toBe(
            lifecycle.stateVaultResolveRequest.resolveRequestDigest
          );
          return response(
            {
              format:
                PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RESULT_FORMAT,
              version:
                PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION,
              receipt: lifecycle.stateVaultResolveReceipt,
              callbackLocalProviderStateHandle:
                seal.callbackLocalProviderStateHandle,
            },
            201
          );
        }
        if (url.endsWith('/retire')) {
          expect(
            sameCanonicalJson(
              JSON.parse(String(init?.body)),
              lifecycle.stateVaultRetireRequest
            )
          ).toBe(true);
          expect(headers.get('Idempotency-Key')).toBe(
            lifecycle.stateVaultRetireRequest.retireRequestDigest
          );
          return response(lifecycle.stateVaultRetirementReceipt, 201);
        }
        expect(url).toContain('/retirements/sha256-');
        expect(init?.method).toBe('GET');
        expect(headers.get('Idempotency-Key')).toBeNull();
        return response(lifecycle.stateVaultRetirementReceipt, 200);
      }
    ) as unknown as typeof globalThis.fetch;
    const client =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient({
        planDigest,
        repositoryCommit,
        expectedAuthority: profile.authority,
        environment,
        fetch: fetchImplementation,
        forbiddenCanaries: () => Object.freeze([]),
      });

    await expect(
      client.seal({
        request: seal.sealRequest,
        callbackLocalProviderStateHandle: seal.callbackLocalProviderStateHandle,
      })
    ).resolves.toMatchObject({
      status: 'sealed',
      opaqueProviderStateRef: seal.sealReceipt.opaqueProviderStateRef,
    });
    await expect(
      resolveAgentNativeProviderStateVaultState(
        client,
        lifecycle.stateVaultResolveRequest
      )
    ).resolves.toEqual({
      receipt: lifecycle.stateVaultResolveReceipt,
      callbackLocalProviderStateHandle: seal.callbackLocalProviderStateHandle,
    });
    await expect(
      retireAgentNativeProviderStateVaultState(
        client,
        lifecycle.stateVaultRetireRequest,
        seal.sealRequest,
        seal.sealReceipt
      )
    ).resolves.toEqual(lifecycle.stateVaultRetirementReceipt);
    expect(paths).toEqual([
      `/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/native-provider-state-vault/seal`,
      `/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/native-provider-state-vault/resolve`,
      `/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/native-provider-state-vault/retire`,
      `/v1/evaluations/${namespaceId}/${planDigest}/${repositoryCommit}/native-provider-state-vault/retirements/${lifecycle.stateVaultRetireRequest.retireRequestDigest}`,
    ]);
  });

  it('returns null for an absent retirement and rejects a drifted resolved handle', async () => {
    const absentClient =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient({
        planDigest,
        repositoryCommit,
        expectedAuthority: profile.authority,
        environment,
        fetch: vi.fn(
          async () =>
            new Response(null, {
              status: 404,
              headers: { 'Cache-Control': 'no-store' },
            })
        ) as unknown as typeof globalThis.fetch,
      });
    await expect(
      absentClient.lookupRetirementReceipt(
        lifecycle.stateVaultRetireRequest.retireRequestDigest
      )
    ).resolves.toBeNull();

    const driftedClient =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient({
        planDigest,
        repositoryCommit,
        expectedAuthority: profile.authority,
        environment,
        fetch: vi.fn(async () =>
          response(
            {
              format:
                PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_RESOLVE_RESULT_FORMAT,
              version:
                PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_WIRE_VERSION,
              receipt: lifecycle.stateVaultResolveReceipt,
              callbackLocalProviderStateHandle: 'resp.state-vault.drifted',
            },
            200
          )
        ) as unknown as typeof globalThis.fetch,
      });
    await expect(
      driftedClient.resolve({
        request: lifecycle.stateVaultResolveRequest,
      })
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
  });

  it('accepts a durable overdue tombstone and rejects recomputed policy-field tampering', async () => {
    const overdueRequest = createAgentNativeProviderStateVaultRetireRequest({
      sealRequest: seal.sealRequest,
      sealReceipt: seal.sealReceipt,
      resolveRequest: null,
      resolveReceipt: null,
      disposition: 'overdue-expired',
      requestedAt: '2026-08-08T01:00:00.000Z',
    });
    const overdueReceipt = createAgentNativeProviderStateVaultRetirementReceipt(
      overdueRequest,
      seal.sealRequest,
      seal.sealReceipt,
      {
        status: 'retired',
        stateKeyDestructionReceiptDigest: digestAgentCanonicalValue({
          fixture: 'overdue-state-key-destroyed',
        }),
        opaqueRecordDeletionReceiptDigest: digestAgentCanonicalValue({
          fixture: 'overdue-vault-record-deleted',
        }),
        retiredAt: '2026-08-08T01:00:00.250Z',
      }
    );
    const createLookupClient = (receipt: unknown) =>
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient({
        planDigest,
        repositoryCommit,
        expectedAuthority: profile.authority,
        environment,
        fetch: vi.fn(async () =>
          response(receipt, 200)
        ) as unknown as typeof fetch,
      });
    await expect(
      createLookupClient(overdueReceipt).lookupRetirementReceipt(
        overdueRequest.retireRequestDigest
      )
    ).resolves.toEqual(overdueReceipt);

    const { receiptDigest: _receiptDigest, ...tamperedBase } = overdueReceipt;
    const recomputedTamperBase = Object.freeze({
      ...tamperedBase,
      retirementTimeliness: 'within-policy',
    });
    await expect(
      createLookupClient({
        ...recomputedTamperBase,
        receiptDigest: digestAgentCanonicalValue(recomputedTamperBase),
      }).lookupRetirementReceipt(overdueRequest.retireRequestDigest)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable,
    });
  });

  it('rejects a protected canary in the callback-local handle before transport', async () => {
    const fetchImplementation = vi.fn();
    const client =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultClient({
        planDigest,
        repositoryCommit,
        expectedAuthority: profile.authority,
        environment,
        fetch: fetchImplementation as unknown as typeof globalThis.fetch,
        forbiddenCanaries: () =>
          Object.freeze([seal.callbackLocalProviderStateHandle]),
      });
    await expect(
      client.seal({
        request: seal.sealRequest,
        callbackLocalProviderStateHandle: seal.callbackLocalProviderStateHandle,
      })
    ).rejects.toThrow();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
