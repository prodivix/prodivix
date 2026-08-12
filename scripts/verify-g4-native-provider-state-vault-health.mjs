import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isAgentNativeProviderStateVaultAuthority } from '../packages/ai/src/providers/agentNativeProviderStateVault.ts';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import { isPlainObject } from '../packages/shared/src/safety/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';

const HEALTH_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-health';
const HEALTH_VERSION = 1;
const MAXIMUM_RECORDS = 5_880;
const MAXIMUM_HEALTH_BYTES = 32_768;
const MAXIMUM_POLL_TIMEOUT_MS = 130_000;
const MAXIMUM_HEALTH_AGE_MS = 30_000;
const MAXIMUM_HEALTH_FUTURE_SKEW_MS = 5_000;
const STATE_VAULT_PURPOSE = 'native-provider-state-vault-owner';
const STATE_VAULT_PURPOSE_HEADER =
  'X-Prodivix-Native-Provider-State-Vault-Purpose';
const EXPECTED_AUTHORITY_IMPLEMENTATION_DIGEST =
  'sha256-70a8bce30a4b87debb41cb0be08966110f40cfe6ecec009f0483063097cf43a6';
const EXPECTED_AUTHORITY_DIGEST =
  'sha256-d00e2b445724baa7a611628b3861496c676dcdeff026f3405c221bbcea2debcf';

const HEALTH_KEYS = Object.freeze(
  [
    'activeEncryptedRecordCount',
    'authority',
    'checkedAt',
    'format',
    'forcedExpiryTombstoneCount',
    'healthDigest',
    'maximumRecords',
    'overdueActiveRecordCount',
    'retiredRecordCount',
    'retirementCounts',
    'sealedRecordCount',
    'status',
    'vaultOwnerInstanceId',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const RETIREMENT_COUNT_KEYS = Object.freeze(
  ['cancelled', 'consumed', 'expired'].sort(compareUnicodeCodePoints)
);

const fail = (message) => {
  throw new Error(message);
};

const hasExactKeys = (value, expectedKeys) =>
  isPlainObject(value) &&
  canonicalJsonText(Object.keys(value).sort(compareUnicodeCodePoints)) ===
    canonicalJsonText(expectedKeys);

const isBoundedCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAXIMUM_RECORDS;

const digestCanonicalValue = (value) =>
  `sha256-${createHash('sha256')
    .update(canonicalJsonText(value), 'utf8')
    .digest('hex')}`;

export const decodeG4NativeProviderStateVaultHealth = ({
  source,
  expectedVaultOwnerInstanceId,
  requireZeroResidual = false,
  nowEpochMs = Date.now(),
}) => {
  if (
    typeof source !== 'string' ||
    Buffer.byteLength(source, 'utf8') < 1 ||
    Buffer.byteLength(source, 'utf8') > MAXIMUM_HEALTH_BYTES ||
    typeof expectedVaultOwnerInstanceId !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(
      expectedVaultOwnerInstanceId
    ) ||
    !Number.isSafeInteger(nowEpochMs) ||
    nowEpochMs < 0
  ) {
    fail('Native Provider state-vault health input is invalid.');
  }
  const parsed = parseStrictJsonDocument(Buffer.from(source, 'utf8'), {
    documentKind: 'contribution',
    maxBytes: MAXIMUM_HEALTH_BYTES,
    maxDepth: 16,
    maxNodes: 128,
  });
  if (!parsed.ok || !hasExactKeys(parsed.value, HEALTH_KEYS)) {
    fail('Native Provider state-vault health is not exact bounded JSON.');
  }
  const value = parsed.value;
  if (source !== canonicalJsonText(value)) {
    fail('Native Provider state-vault health is not canonical JSON.');
  }
  const checkedAtEpochMs = Date.parse(value.checkedAt);
  if (
    value.format !== HEALTH_FORMAT ||
    value.version !== HEALTH_VERSION ||
    value.status !== 'ready' ||
    value.maximumRecords !== MAXIMUM_RECORDS ||
    value.vaultOwnerInstanceId !== expectedVaultOwnerInstanceId ||
    !isAgentNativeProviderStateVaultAuthority(value.authority) ||
    value.authority.authorityImplementationDigest !==
      EXPECTED_AUTHORITY_IMPLEMENTATION_DIGEST ||
    value.authority.authorityDigest !== EXPECTED_AUTHORITY_DIGEST ||
    typeof value.checkedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.checkedAt) ||
    !Number.isFinite(checkedAtEpochMs) ||
    new Date(value.checkedAt).toISOString() !== value.checkedAt ||
    checkedAtEpochMs < nowEpochMs - MAXIMUM_HEALTH_AGE_MS ||
    checkedAtEpochMs > nowEpochMs + MAXIMUM_HEALTH_FUTURE_SKEW_MS ||
    !/^sha256-[0-9a-f]{64}$/u.test(value.healthDigest) ||
    !hasExactKeys(value.retirementCounts, RETIREMENT_COUNT_KEYS)
  ) {
    fail('Native Provider state-vault health authority is invalid.');
  }
  const counts = [
    value.activeEncryptedRecordCount,
    value.forcedExpiryTombstoneCount,
    value.overdueActiveRecordCount,
    value.retiredRecordCount,
    value.sealedRecordCount,
    value.retirementCounts.cancelled,
    value.retirementCounts.consumed,
    value.retirementCounts.expired,
  ];
  if (
    counts.some((count) => !isBoundedCount(count)) ||
    value.sealedRecordCount !==
      value.activeEncryptedRecordCount +
        value.retiredRecordCount +
        value.forcedExpiryTombstoneCount ||
    value.retiredRecordCount !==
      value.retirementCounts.cancelled +
        value.retirementCounts.consumed +
        value.retirementCounts.expired ||
    value.overdueActiveRecordCount > value.activeEncryptedRecordCount ||
    value.overdueActiveRecordCount !== 0 ||
    value.forcedExpiryTombstoneCount !== 0 ||
    (requireZeroResidual && value.activeEncryptedRecordCount !== 0)
  ) {
    fail('Native Provider state-vault health counts are invalid.');
  }
  const { healthDigest, ...base } = value;
  if (healthDigest !== digestCanonicalValue(base)) {
    fail('Native Provider state-vault health digest is invalid.');
  }
  return Object.freeze(value);
};

const validateServiceToken = (value) => {
  if (
    typeof value !== 'string' ||
    value.length < 32 ||
    value.length > 4_096 ||
    Buffer.byteLength(value, 'utf8') !== value.length
  ) {
    return false;
  }
  let padding = 0;
  for (const character of Buffer.from(value, 'ascii')) {
    if (character === 0x3d) {
      padding += 1;
      if (padding > 2) return false;
      continue;
    }
    if (
      padding !== 0 ||
      !(
        (character >= 0x61 && character <= 0x7a) ||
        (character >= 0x41 && character <= 0x5a) ||
        (character >= 0x30 && character <= 0x39) ||
        [0x2e, 0x5f, 0x7e, 0x2b, 0x2f, 0x2d].includes(character)
      )
    ) {
      return false;
    }
  }
  return value.length - padding >= 1;
};

const fetchStateVaultHealth = async ({
  baseUrl,
  namespace,
  serviceToken,
  signal,
  fetchImplementation,
}) => {
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.href !== 'http://127.0.0.1:8790/') {
    fail('Native Provider state-vault health base URL is invalid.');
  }
  if (
    typeof namespace !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(namespace) ||
    !validateServiceToken(serviceToken)
  ) {
    fail('Native Provider state-vault health request authority is invalid.');
  }
  const endpoint = new URL(
    `/v1/evaluations/${encodeURIComponent(namespace)}/native-provider-state-vault/health`,
    parsedBaseUrl
  );
  const response = await fetchImplementation(endpoint, {
    method: 'GET',
    redirect: 'error',
    signal,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${serviceToken}`,
      [STATE_VAULT_PURPOSE_HEADER]: STATE_VAULT_PURPOSE,
    },
  });
  if (
    response.status !== 200 ||
    !/^application\/json(?:;|$)/u.test(
      response.headers.get('content-type') ?? ''
    )
  ) {
    fail('Native Provider state-vault health endpoint is unavailable.');
  }
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      Number(contentLength) > MAXIMUM_HEALTH_BYTES)
  ) {
    fail('Native Provider state-vault health response is too large.');
  }
  if (response.body === null) {
    fail('Native Provider state-vault health response is empty.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAXIMUM_HEALTH_BYTES) {
        await reader.cancel();
        fail('Native Provider state-vault health response is too large.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 1) {
    fail('Native Provider state-vault health response is empty.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, byteLength)
    );
  } catch {
    fail('Native Provider state-vault health response is not UTF-8.');
  }
};

export const waitForG4NativeProviderStateVaultHealth = async ({
  mode,
  timeoutMs,
  baseUrl,
  namespace,
  serviceToken,
  expectedVaultOwnerInstanceId,
  fetchImplementation = globalThis.fetch,
}) => {
  if (
    !['ready', 'zero'].includes(mode) ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUM_POLL_TIMEOUT_MS ||
    typeof fetchImplementation !== 'function'
  ) {
    fail('Native Provider state-vault health wait configuration is invalid.');
  }
  const deadline = Date.now() + timeoutMs;
  do {
    const remainingMs = Math.max(1, deadline - Date.now());
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(3_000, remainingMs)
    );
    try {
      const source = await fetchStateVaultHealth({
        baseUrl,
        namespace,
        serviceToken,
        signal: controller.signal,
        fetchImplementation,
      });
      return decodeG4NativeProviderStateVaultHealth({
        source,
        expectedVaultOwnerInstanceId,
        requireZeroResidual: mode === 'zero',
        nowEpochMs: Date.now(),
      });
    } catch {
      // The bounded poll accepts only a later exact, self-digested response.
    } finally {
      clearTimeout(timeout);
    }
    const delayMs = Math.min(1_000, deadline - Date.now());
    if (delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  } while (Date.now() < deadline);
  fail(
    `Native Provider state-vault ${mode} health did not become valid within the bounded wait.`
  );
};

const isMain =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [mode, timeoutSource, ...extra] = process.argv.slice(2);
  const timeoutMs = Number(timeoutSource);
  if (extra.length !== 0) {
    fail('Native Provider state-vault health command arguments are invalid.');
  }
  waitForG4NativeProviderStateVaultHealth({
    mode,
    timeoutMs,
    baseUrl: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL,
    namespace: process.env.PRODIVIX_G4_MODEL_EVAL_NAMESPACE,
    serviceToken: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN,
    expectedVaultOwnerInstanceId:
      process.env
        .PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID,
  })
    .then((health) => process.stdout.write(`${health.healthDigest}\n`))
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
