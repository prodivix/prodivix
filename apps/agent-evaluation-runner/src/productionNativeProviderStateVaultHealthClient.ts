import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentNativeProviderStateVaultAuthority,
  type AgentNativeProviderStateVaultAuthority,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE,
  PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER,
} from './productionNativeProviderStateVaultClient';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-health' as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION =
  1 as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS =
  5_880 as const;
export const PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID' as const;

const maximumResponseBytes = 32_768;
const pathSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationProductionNativeProviderStateVaultHealth = Readonly<{
  format: typeof PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT;
  version: typeof PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION;
  authority: AgentNativeProviderStateVaultAuthority;
  vaultOwnerInstanceId: string;
  status: 'ready' | 'unavailable';
  maximumRecords: typeof PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS;
  sealedRecordCount: number;
  activeEncryptedRecordCount: number;
  retiredRecordCount: number;
  retirementCounts: Readonly<{
    cancelled: number;
    consumed: number;
    expired: number;
  }>;
  overdueActiveRecordCount: number;
  forcedExpiryTombstoneCount: number;
  checkedAt: string;
  healthDigest: CanonicalDigest;
}>;

export type AgentEvaluationProductionNativeProviderStateVaultHealthReader =
  Readonly<{
    authority: AgentNativeProviderStateVaultAuthority;
    readHealth(): Promise<
      AgentEvaluationProductionNativeProviderStateVaultHealth | undefined
    >;
  }>;

export type CreateEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReaderInput =
  Readonly<{
    expectedAuthority: AgentNativeProviderStateVaultAuthority;
    environment?: Environment;
    fetch?: typeof fetch;
    clock?: () => Date;
  }>;

const healthKeys = Object.freeze([
  'format',
  'version',
  'authority',
  'vaultOwnerInstanceId',
  'status',
  'maximumRecords',
  'sealedRecordCount',
  'activeEncryptedRecordCount',
  'retiredRecordCount',
  'retirementCounts',
  'overdueActiveRecordCount',
  'forcedExpiryTombstoneCount',
  'checkedAt',
  'healthDigest',
] as const);

const retirementCountKeys = Object.freeze([
  'cancelled',
  'consumed',
  'expired',
] as const);

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && keys.includes(key)
  );

const boundedCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <=
    PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS;

export const decodeAgentEvaluationProductionNativeProviderStateVaultHealth = (
  value: unknown,
  expectedAuthority: AgentNativeProviderStateVaultAuthority,
  expectedVaultOwnerInstanceId: string,
  now: Date
): AgentEvaluationProductionNativeProviderStateVaultHealth | undefined => {
  if (
    !Number.isFinite(now.getTime()) ||
    !isAgentNativeProviderStateVaultAuthority(expectedAuthority) ||
    !isAgentControlIdentity(expectedVaultOwnerInstanceId) ||
    !exactRecord(value, healthKeys) ||
    value.format !==
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_FORMAT ||
    value.version !==
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_HEALTH_VERSION ||
    !isAgentNativeProviderStateVaultAuthority(value.authority) ||
    !sameCanonicalJson(value.authority, expectedAuthority) ||
    value.vaultOwnerInstanceId !== expectedVaultOwnerInstanceId ||
    (value.status !== 'ready' && value.status !== 'unavailable') ||
    value.maximumRecords !==
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_RECORDS ||
    !boundedCount(value.sealedRecordCount) ||
    !boundedCount(value.activeEncryptedRecordCount) ||
    !boundedCount(value.retiredRecordCount) ||
    !exactRecord(value.retirementCounts, retirementCountKeys) ||
    !boundedCount(value.retirementCounts.cancelled) ||
    !boundedCount(value.retirementCounts.consumed) ||
    !boundedCount(value.retirementCounts.expired) ||
    !boundedCount(value.overdueActiveRecordCount) ||
    !boundedCount(value.forcedExpiryTombstoneCount) ||
    !isAgentControlInstant(value.checkedAt) ||
    !isAgentCanonicalDigest(value.healthDigest)
  ) {
    return undefined;
  }
  const { healthDigest: _healthDigest, ...base } = value;
  const retiredByDisposition =
    value.retirementCounts.cancelled +
    value.retirementCounts.consumed +
    value.retirementCounts.expired;
  if (
    value.healthDigest !== digestAgentCanonicalValue(base) ||
    value.sealedRecordCount !==
      value.activeEncryptedRecordCount +
        value.retiredRecordCount +
        value.forcedExpiryTombstoneCount ||
    value.retiredRecordCount !== retiredByDisposition ||
    value.overdueActiveRecordCount > value.activeEncryptedRecordCount ||
    (value.status === 'ready') !==
      (value.overdueActiveRecordCount === 0 &&
        value.forcedExpiryTombstoneCount === 0) ||
    Date.parse(value.checkedAt) > now.getTime() + 30_000 ||
    now.getTime() - Date.parse(value.checkedAt) > 30_000 ||
    new TextEncoder().encode(canonicalJsonText(value)).byteLength >
      maximumResponseBytes
  ) {
    return undefined;
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationProductionNativeProviderStateVaultHealth),
    authority: Object.freeze({ ...value.authority }),
    retirementCounts: Object.freeze({
      cancelled: value.retirementCounts.cancelled,
      consumed: value.retirementCounts.consumed,
      expired: value.retirementCounts.expired,
    }),
  });
};

const readEnvironment = (
  environment: Environment
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const readBoundedResponse = async (
  response: Response
): Promise<Uint8Array | undefined> => {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength === 0) return undefined;
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const decodeCanonicalJson = (bytes: Uint8Array): unknown | undefined => {
  try {
    const text = textDecoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as unknown;
    return canonicalJsonText(value) === text ? value : undefined;
  } catch {
    return undefined;
  }
};

export const createEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReader =
  (
    input: CreateEnvironmentProductionAgentEvaluationNativeProviderStateVaultHealthReaderInput
  ): AgentEvaluationProductionNativeProviderStateVaultHealthReader => {
    const environment = input.environment ?? process.env;
    const read = readEnvironment(environment);
    const namespaceId = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const vaultOwnerInstanceId = read(
      PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ENVIRONMENT_NAME
    );
    if (
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      typeof namespaceId !== 'string' ||
      !pathSegmentPattern.test(namespaceId) ||
      !isAgentControlIdentity(vaultOwnerInstanceId) ||
      !isAgentNativeProviderStateVaultAuthority(input.expectedAuthority)
    ) {
      throw new TypeError(
        'G4_PRODUCTION_STATE_VAULT_HEALTH_INVALID: composition'
      );
    }
    const fetchImplementation = input.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') {
      throw new TypeError('G4_PRODUCTION_STATE_VAULT_HEALTH_INVALID: fetch');
    }
    const clock = input.clock ?? (() => new Date());
    return Object.freeze({
      authority: input.expectedAuthority,
      async readHealth() {
        let token: string | undefined;
        try {
          token = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
        } catch {
          return undefined;
        }
        if (!isAgentEvaluationServiceToken(token)) return undefined;
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          [PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE_HEADER]:
            PRODUCTION_AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_PURPOSE,
        });
        token = undefined;
        let response: Response;
        try {
          response = await fetchImplementation(
            `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${encodeURIComponent(namespaceId)}/native-provider-state-vault/health`,
            {
              method: 'GET',
              headers,
              cache: 'no-store',
              credentials: 'omit',
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              signal: AbortSignal.timeout(10_000),
            }
          );
        } catch {
          headers.delete('Authorization');
          return undefined;
        }
        headers.delete('Authorization');
        if (
          (response.status !== 200 && response.status !== 503) ||
          response.headers.get('cache-control') !== 'no-store' ||
          response.headers.get('content-type') !==
            'application/json; charset=utf-8'
        ) {
          return undefined;
        }
        const bytes = await readBoundedResponse(response);
        if (!bytes) return undefined;
        const decoded =
          decodeAgentEvaluationProductionNativeProviderStateVaultHealth(
            decodeCanonicalJson(bytes),
            input.expectedAuthority,
            vaultOwnerInstanceId,
            clock()
          );
        if (
          !decoded ||
          (response.status === 200) !== (decoded.status === 'ready')
        ) {
          return undefined;
        }
        return decoded.status === 'ready' ? decoded : undefined;
      },
    });
  };
