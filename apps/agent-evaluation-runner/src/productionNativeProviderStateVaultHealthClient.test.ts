import { digestAgentCanonicalValue } from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER,
} from './productionNativeProviderStateVaultClient';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME,
  createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader,
  decodeAgentEvaluationProductionNativeProviderStateVaultHealth,
} from './productionNativeProviderStateVaultHealthClient';
import { createAgentEvaluationNativeProviderStateVaultEncryptionProfile } from './runConfig';

const namespaceId = 'evaluation.namespace.state-vault-health';
const token = 'state-vault-health-service-token-0123456789abcdef';
const vaultOwnerInstanceId = 'run.123.attempt.1.shard.0';
const checkedAt = '2026-08-09T12:00:00.000Z';
const now = new Date('2026-08-09T12:00:00.001Z');
const authority =
  createAgentEvaluationNativeProviderStateVaultEncryptionProfile().authority;

const health = (
  input: Readonly<{
    status?: 'ready' | 'unavailable';
    overdueActiveRecordCount?: number;
    forcedExpiryTombstoneCount?: number;
  }> = {}
) => {
  const overdueActiveRecordCount = input.overdueActiveRecordCount ?? 0;
  const forcedExpiryTombstoneCount = input.forcedExpiryTombstoneCount ?? 0;
  const base = Object.freeze({
    format:
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT,
    version:
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION,
    authority,
    vaultOwnerInstanceId,
    status: input.status ?? ('ready' as const),
    maximumRecords:
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS,
    sealedRecordCount: 4 + forcedExpiryTombstoneCount,
    activeEncryptedRecordCount: 1,
    retiredRecordCount: 3,
    retirementCounts: Object.freeze({
      cancelled: 1,
      consumed: 1,
      expired: 1,
    }),
    overdueActiveRecordCount,
    forcedExpiryTombstoneCount,
    checkedAt,
  });
  return Object.freeze({
    ...base,
    healthDigest: digestAgentCanonicalValue(base),
  });
};

const environment = (name: string): string | undefined => {
  switch (name) {
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl:
      return AGENT_EVALUATION_LEDGER_BASE_URL;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace:
      return namespaceId;
    case AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token:
      return token;
    case PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME:
      return vaultOwnerInstanceId;
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

describe('production Native Provider state-vault health client', () => {
  it('accepts only the exact frozen ready authority over the purpose-bound route', async () => {
    const ready = health();
    const fetchImplementation: typeof globalThis.fetch = vi.fn(
      async (source: string | URL | Request, init?: RequestInit) => {
        expect(String(source)).toBe(
          `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${namespaceId}/native-provider-state-vault/health`
        );
        expect(init).toMatchObject({
          method: 'GET',
          cache: 'no-store',
          credentials: 'omit',
          redirect: 'error',
          referrerPolicy: 'no-referrer',
        });
        const headers = new Headers(init?.headers);
        expect(headers.get('Authorization')).toBe(`Bearer ${token}`);
        expect(
          headers.get(
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER
          )
        ).toBe(PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE);
        expect(headers.get('Idempotency-Key')).toBeNull();
        return response(ready, 200);
      }
    ) as unknown as typeof globalThis.fetch;
    const reader =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority: authority,
          environment,
          fetch: fetchImplementation,
          clock: () => now,
        }
      );

    await expect(reader.readHealth()).resolves.toEqual(ready);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('fails closed for overdue, swapped, and internally inconsistent health', async () => {
    const unavailable = health({
      status: 'unavailable',
      overdueActiveRecordCount: 1,
    });
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        unavailable,
        authority,
        vaultOwnerInstanceId,
        now
      )
    ).toEqual(unavailable);
    const forcedExpiry = health({
      status: 'unavailable',
      forcedExpiryTombstoneCount: 1,
    });
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        forcedExpiry,
        authority,
        vaultOwnerInstanceId,
        now
      )
    ).toEqual(forcedExpiry);
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        Object.freeze({ ...forcedExpiry, status: 'ready' }),
        authority,
        vaultOwnerInstanceId,
        now
      )
    ).toBeUndefined();
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        Object.freeze({
          ...health(),
          authority: Object.freeze({
            ...authority,
            authorityImplementationDigest: digestAgentCanonicalValue({
              swapped: 'implementation',
            }),
          }),
        }),
        authority,
        vaultOwnerInstanceId,
        now
      )
    ).toBeUndefined();
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        Object.freeze({
          ...health(),
          activeEncryptedRecordCount: 2,
        }),
        authority,
        vaultOwnerInstanceId,
        now
      )
    ).toBeUndefined();
    expect(
      decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
        health(),
        authority,
        'run.123.attempt.1.shard.swapped',
        now
      )
    ).toBeUndefined();

    const reader =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority: authority,
          environment,
          fetch: async () => response(unavailable, 503),
          clock: () => now,
        }
      );
    await expect(reader.readHealth()).resolves.toBeUndefined();

    const forcedExpiryReader =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority: authority,
          environment,
          fetch: async () => response(forcedExpiry, 503),
          clock: () => now,
        }
      );
    await expect(forcedExpiryReader.readHealth()).resolves.toBeUndefined();
  });

  it('does not call the route when the service credential is absent', async () => {
    const fetchImplementation = vi.fn<typeof globalThis.fetch>();
    const reader =
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority: authority,
          environment: (name) =>
            name === AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
              ? undefined
              : environment(name),
          fetch: fetchImplementation,
          clock: () => now,
        }
      );
    await expect(reader.readHealth()).resolves.toBeUndefined();
    expect(fetchImplementation).not.toHaveBeenCalled();

    expect(() =>
      createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader(
        {
          expectedAuthority: authority,
          environment: (name) =>
            name ===
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME
              ? undefined
              : environment(name),
          fetch: fetchImplementation,
          clock: () => now,
        }
      )
    ).toThrow('composition');
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
