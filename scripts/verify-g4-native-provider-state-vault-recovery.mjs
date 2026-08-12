import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isAgentModelEvaluationPlan } from '../packages/ai/src/evaluation/agentEvaluationPlan.ts';
import { isAgentNativeProviderStateVaultAuthority } from '../packages/ai/src/providers/agentNativeProviderStateVault.ts';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import { isPlainObject } from '../packages/shared/src/safety/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';

const RECOVERY_HEALTH_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-recovery-health';
const RECOVERY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-recovery-request';
const RECOVERY_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt';
const RECOVERY_ZERO_FORMAT =
  'prodivix.agent-evaluation-native-provider-state-vault-recovery-zero-residual-receipt';
const RECOVERY_VERSION = 1;
const RECOVERY_REASON = 'owner-crash-recovery';
const RECOVERY_PURPOSE = 'native-provider-state-vault-recovery-owner';
const RECOVERY_PURPOSE_HEADER =
  'X-Prodivix-Native-Provider-State-Vault-Purpose';
const MAXIMUM_COMPONENT_BYTES = 16_384;
const MAXIMUM_PLAN_BYTES = 16_777_216;
const MAXIMUM_RECORDS = 5_880;
const MAXIMUM_POLL_TIMEOUT_MS = 130_000;
const HEALTH_LIFETIME_MS = 125_000;
const MAXIMUM_HEALTH_AGE_MS = 30_000;
const MAXIMUM_FUTURE_SKEW_MS = 5_000;
const EXPECTED_AUTHORITY_IMPLEMENTATION_DIGEST =
  'sha256-70a8bce30a4b87debb41cb0be08966110f40cfe6ecec009f0483063097cf43a6';
const EXPECTED_AUTHORITY_DIGEST =
  'sha256-d00e2b445724baa7a611628b3861496c676dcdeff026f3405c221bbcea2debcf';

const RECOVERY_HEALTH_KEYS = Object.freeze(
  [
    'activeEncryptedRecordCount',
    'authority',
    'checkedAt',
    'expiresAt',
    'format',
    'healthDigest',
    'mode',
    'overdueActiveRecordCount',
    'recoveryRequired',
    'status',
    'vaultOwnerInstanceId',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const RECOVERY_REQUEST_KEYS = Object.freeze(
  [
    'authorityDigest',
    'format',
    'namespaceId',
    'planDigest',
    'reason',
    'recoveryRequestDigest',
    'repositoryCommit',
    'requestedAt',
    'vaultOwnerInstanceId',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const RECOVERY_RECEIPT_KEYS = Object.freeze(
  [
    'authorityDigest',
    'cancelledRetirementCount',
    'completedAt',
    'consumedRetirementCount',
    'expiredRetirementCount',
    'forcedExpiryTombstoneCount',
    'format',
    'namespaceId',
    'planDigest',
    'reason',
    'receiptDigest',
    'recoveryRequestDigest',
    'repositoryCommit',
    'residualActiveEncryptedRecordCount',
    'retiredRecordCount',
    'terminalRecordSetDigest',
    'vaultOwnerInstanceId',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const RECOVERY_ZERO_KEYS = Object.freeze(
  [
    'activeEncryptedRecordCount',
    'authorityDigest',
    'checkedAt',
    'expiresAt',
    'format',
    'namespaceId',
    'planDigest',
    'recoveryReceiptDigest',
    'recoveryRequestDigest',
    'repositoryCommit',
    'vaultOwnerInstanceId',
    'version',
    'zeroResidualReceiptDigest',
  ].sort(compareUnicodeCodePoints)
);

const fail = (message) => {
  throw new Error(message);
};

const hasExactKeys = (value, expectedKeys) =>
  isPlainObject(value) &&
  canonicalJsonText(Object.keys(value).sort(compareUnicodeCodePoints)) ===
    canonicalJsonText(expectedKeys);

const digestCanonicalValue = (value) =>
  `sha256-${createHash('sha256')
    .update(canonicalJsonText(value), 'utf8')
    .digest('hex')}`;

const isDigest = (value) =>
  typeof value === 'string' && /^sha256-[0-9a-f]{64}$/u.test(value);
const isRepositoryCommit = (value) =>
  typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value);
const isNamespace = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u.test(value);
const isOwnerInstanceId = (value) =>
  typeof value === 'string' &&
  /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$/u.test(value);
const isBoundedCount = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= MAXIMUM_RECORDS;

const decodeCanonicalInstant = (value, label) => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    fail(`${label} is invalid.`);
  }
  const epochMs = Date.parse(value);
  if (!Number.isFinite(epochMs) || new Date(epochMs).toISOString() !== value) {
    fail(`${label} is invalid.`);
  }
  return epochMs;
};

const decodeExactCanonicalObject = (source, expectedKeys, label) => {
  if (
    typeof source !== 'string' ||
    Buffer.byteLength(source, 'utf8') < 1 ||
    Buffer.byteLength(source, 'utf8') > MAXIMUM_COMPONENT_BYTES
  ) {
    fail(`${label} input is invalid.`);
  }
  const parsed = parseStrictJsonDocument(Buffer.from(source, 'utf8'), {
    documentKind: 'contribution',
    maxBytes: MAXIMUM_COMPONENT_BYTES,
    maxDepth: 16,
    maxNodes: 128,
  });
  if (
    !parsed.ok ||
    !hasExactKeys(parsed.value, expectedKeys) ||
    source !== canonicalJsonText(parsed.value)
  ) {
    fail(`${label} is not exact canonical bounded JSON.`);
  }
  return parsed.value;
};

const validateAuthority = (authority) =>
  isAgentNativeProviderStateVaultAuthority(authority) &&
  authority.authorityImplementationDigest ===
    EXPECTED_AUTHORITY_IMPLEMENTATION_DIGEST &&
  authority.authorityDigest === EXPECTED_AUTHORITY_DIGEST;

const validateFreshLifetime = ({ checkedAt, expiresAt, nowEpochMs, label }) => {
  const checkedAtEpochMs = decodeCanonicalInstant(
    checkedAt,
    `${label} checkedAt`
  );
  const expiresAtEpochMs = decodeCanonicalInstant(
    expiresAt,
    `${label} expiresAt`
  );
  if (
    expiresAtEpochMs - checkedAtEpochMs !== HEALTH_LIFETIME_MS ||
    checkedAtEpochMs < nowEpochMs - MAXIMUM_HEALTH_AGE_MS ||
    checkedAtEpochMs > nowEpochMs + MAXIMUM_FUTURE_SKEW_MS ||
    expiresAtEpochMs <= nowEpochMs
  ) {
    fail(`${label} lifetime is invalid.`);
  }
  return checkedAtEpochMs;
};

export const decodeG4NativeProviderStateVaultRecoveryHealth = ({
  source,
  expectedVaultOwnerInstanceId,
  nowEpochMs = Date.now(),
}) => {
  if (
    !isOwnerInstanceId(expectedVaultOwnerInstanceId) ||
    !Number.isSafeInteger(nowEpochMs) ||
    nowEpochMs < 0
  ) {
    fail('Native Provider state-vault recovery health input is invalid.');
  }
  const value = decodeExactCanonicalObject(
    source,
    RECOVERY_HEALTH_KEYS,
    'Native Provider state-vault recovery health'
  );
  if (
    value.format !== RECOVERY_HEALTH_FORMAT ||
    value.version !== RECOVERY_VERSION ||
    value.mode !== 'recovery-only' ||
    value.status !== 'ready' ||
    value.vaultOwnerInstanceId !== expectedVaultOwnerInstanceId ||
    !validateAuthority(value.authority) ||
    !isBoundedCount(value.activeEncryptedRecordCount) ||
    !isBoundedCount(value.overdueActiveRecordCount) ||
    value.overdueActiveRecordCount > value.activeEncryptedRecordCount ||
    value.recoveryRequired !== (value.activeEncryptedRecordCount !== 0) ||
    !isDigest(value.healthDigest)
  ) {
    fail('Native Provider state-vault recovery health authority is invalid.');
  }
  validateFreshLifetime({
    checkedAt: value.checkedAt,
    expiresAt: value.expiresAt,
    nowEpochMs,
    label: 'Native Provider state-vault recovery health',
  });
  const { healthDigest, ...base } = value;
  if (healthDigest !== digestCanonicalValue(base)) {
    fail('Native Provider state-vault recovery health digest is invalid.');
  }
  return Object.freeze(value);
};

export const createG4NativeProviderStateVaultRecoveryRequest = ({
  namespace,
  planDigest,
  repositoryCommit,
  vaultOwnerInstanceId,
  authorityDigest,
  requestedAtEpochMs = Date.now(),
}) => {
  if (
    !isNamespace(namespace) ||
    !isDigest(planDigest) ||
    !isRepositoryCommit(repositoryCommit) ||
    !isOwnerInstanceId(vaultOwnerInstanceId) ||
    !isDigest(authorityDigest) ||
    !Number.isSafeInteger(requestedAtEpochMs) ||
    requestedAtEpochMs < 0
  ) {
    fail('Native Provider state-vault recovery request input is invalid.');
  }
  const base = Object.freeze({
    authorityDigest,
    format: RECOVERY_REQUEST_FORMAT,
    namespaceId: namespace,
    planDigest,
    reason: RECOVERY_REASON,
    repositoryCommit,
    requestedAt: new Date(requestedAtEpochMs).toISOString(),
    vaultOwnerInstanceId,
    version: RECOVERY_VERSION,
  });
  const value = Object.freeze({
    ...base,
    recoveryRequestDigest: digestCanonicalValue(base),
  });
  if (!hasExactKeys(value, RECOVERY_REQUEST_KEYS)) {
    fail('Native Provider state-vault recovery request shape is invalid.');
  }
  return value;
};

export const decodeG4NativeProviderStateVaultRecoveryReceipt = ({
  source,
  request,
  nowEpochMs = Date.now(),
}) => {
  if (
    !hasExactKeys(request, RECOVERY_REQUEST_KEYS) ||
    !Number.isSafeInteger(nowEpochMs) ||
    nowEpochMs < 0
  ) {
    fail('Native Provider state-vault recovery receipt input is invalid.');
  }
  const value = decodeExactCanonicalObject(
    source,
    RECOVERY_RECEIPT_KEYS,
    'Native Provider state-vault recovery receipt'
  );
  const requestedAtEpochMs = decodeCanonicalInstant(
    request.requestedAt,
    'Native Provider state-vault recovery requestedAt'
  );
  const completedAtEpochMs = decodeCanonicalInstant(
    value.completedAt,
    'Native Provider state-vault recovery completedAt'
  );
  if (
    value.format !== RECOVERY_RECEIPT_FORMAT ||
    value.version !== RECOVERY_VERSION ||
    value.recoveryRequestDigest !== request.recoveryRequestDigest ||
    value.namespaceId !== request.namespaceId ||
    value.planDigest !== request.planDigest ||
    value.repositoryCommit !== request.repositoryCommit ||
    value.vaultOwnerInstanceId !== request.vaultOwnerInstanceId ||
    value.authorityDigest !== request.authorityDigest ||
    value.reason !== RECOVERY_REASON ||
    !isBoundedCount(value.retiredRecordCount) ||
    !isBoundedCount(value.cancelledRetirementCount) ||
    !isBoundedCount(value.consumedRetirementCount) ||
    !isBoundedCount(value.expiredRetirementCount) ||
    !isBoundedCount(value.forcedExpiryTombstoneCount) ||
    value.retiredRecordCount !==
      value.cancelledRetirementCount +
        value.consumedRetirementCount +
        value.expiredRetirementCount ||
    value.retiredRecordCount + value.forcedExpiryTombstoneCount >
      MAXIMUM_RECORDS ||
    value.residualActiveEncryptedRecordCount !== 0 ||
    !isDigest(value.terminalRecordSetDigest) ||
    !isDigest(value.receiptDigest) ||
    completedAtEpochMs < requestedAtEpochMs ||
    completedAtEpochMs > nowEpochMs + MAXIMUM_FUTURE_SKEW_MS
  ) {
    fail('Native Provider state-vault recovery receipt is invalid.');
  }
  const { receiptDigest, ...base } = value;
  if (receiptDigest !== digestCanonicalValue(base)) {
    fail('Native Provider state-vault recovery receipt digest is invalid.');
  }
  return Object.freeze(value);
};

export const decodeG4NativeProviderStateVaultRecoveryZeroResidual = ({
  source,
  request,
  recoveryReceipt,
  nowEpochMs = Date.now(),
}) => {
  const value = decodeExactCanonicalObject(
    source,
    RECOVERY_ZERO_KEYS,
    'Native Provider state-vault recovery zero-residual receipt'
  );
  if (
    value.format !== RECOVERY_ZERO_FORMAT ||
    value.version !== RECOVERY_VERSION ||
    value.namespaceId !== request.namespaceId ||
    value.planDigest !== request.planDigest ||
    value.repositoryCommit !== request.repositoryCommit ||
    value.vaultOwnerInstanceId !== request.vaultOwnerInstanceId ||
    value.authorityDigest !== request.authorityDigest ||
    value.recoveryRequestDigest !== request.recoveryRequestDigest ||
    value.recoveryReceiptDigest !== recoveryReceipt.receiptDigest ||
    value.activeEncryptedRecordCount !== 0 ||
    !isDigest(value.zeroResidualReceiptDigest)
  ) {
    fail(
      'Native Provider state-vault recovery zero-residual binding is invalid.'
    );
  }
  const checkedAtEpochMs = validateFreshLifetime({
    checkedAt: value.checkedAt,
    expiresAt: value.expiresAt,
    nowEpochMs,
    label: 'Native Provider state-vault recovery zero-residual receipt',
  });
  if (
    checkedAtEpochMs <
    decodeCanonicalInstant(
      recoveryReceipt.completedAt,
      'Native Provider state-vault recovery completedAt'
    )
  ) {
    fail(
      'Native Provider state-vault recovery zero-residual order is invalid.'
    );
  }
  const { zeroResidualReceiptDigest, ...base } = value;
  if (zeroResidualReceiptDigest !== digestCanonicalValue(base)) {
    fail(
      'Native Provider state-vault recovery zero-residual digest is invalid.'
    );
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

const validateClientAuthority = ({
  baseUrl,
  namespace,
  serviceToken,
  expectedVaultOwnerInstanceId,
}) => {
  let parsedBaseUrl;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    fail('Native Provider state-vault recovery base URL is invalid.');
  }
  if (
    parsedBaseUrl.href !== 'http://127.0.0.1:8790/' ||
    !isNamespace(namespace) ||
    !validateServiceToken(serviceToken) ||
    !isOwnerInstanceId(expectedVaultOwnerInstanceId)
  ) {
    fail('Native Provider state-vault recovery request authority is invalid.');
  }
  return parsedBaseUrl;
};

const readBoundedResponse = async (response, expectedStatuses, label) => {
  if (
    !expectedStatuses.includes(response.status) ||
    !/^application\/json(?:;|$)/u.test(
      response.headers.get('content-type') ?? ''
    )
  ) {
    fail(`${label} endpoint is unavailable.`);
  }
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      Number(contentLength) > MAXIMUM_COMPONENT_BYTES)
  ) {
    fail(`${label} response is too large.`);
  }
  if (response.body === null) fail(`${label} response is empty.`);
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAXIMUM_COMPONENT_BYTES) {
        await reader.cancel();
        fail(`${label} response is too large.`);
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 1) fail(`${label} response is empty.`);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, byteLength)
    );
  } catch {
    fail(`${label} response is not UTF-8.`);
  }
};

const requestHeaders = (serviceToken, includeContentType = false) => ({
  Accept: 'application/json',
  Authorization: `Bearer ${serviceToken}`,
  [RECOVERY_PURPOSE_HEADER]: RECOVERY_PURPOSE,
  ...(includeContentType ? { 'Content-Type': 'application/json' } : {}),
});

const fetchWithTimeout = async ({
  endpoint,
  method,
  headers,
  body,
  timeoutMs,
  fetchImplementation,
}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImplementation(endpoint, {
      method,
      redirect: 'error',
      signal: controller.signal,
      headers,
      ...(body === undefined ? {} : { body }),
    });
  } finally {
    clearTimeout(timeout);
  }
};

const pollExactResponse = async ({
  endpoint,
  headers,
  deadline,
  label,
  decode,
  fetchImplementation,
}) => {
  do {
    const remainingMs = Math.max(1, deadline - Date.now());
    try {
      const response = await fetchWithTimeout({
        endpoint,
        method: 'GET',
        headers,
        timeoutMs: Math.min(3_000, remainingMs),
        fetchImplementation,
      });
      const source = await readBoundedResponse(response, [200], label);
      return decode(source);
    } catch {
      // Only a later exact, purpose-bound response can end the bounded poll.
    }
    const delayMs = Math.min(1_000, deadline - Date.now());
    if (delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  } while (Date.now() < deadline);
  fail(`${label} did not become valid within the bounded wait.`);
};

const readFrozenPlan = async ({ planPath, expectedRepositoryCommit }) => {
  if (
    typeof planPath !== 'string' ||
    planPath.length < 1 ||
    !isRepositoryCommit(expectedRepositoryCommit)
  ) {
    fail('Native Provider state-vault recovery plan authority is invalid.');
  }
  const status = await lstat(planPath);
  if (!status.isFile() || status.isSymbolicLink() || status.size < 1) {
    fail('Native Provider state-vault recovery plan file is invalid.');
  }
  if (status.size > MAXIMUM_PLAN_BYTES) {
    fail('Native Provider state-vault recovery plan file is too large.');
  }
  const source = await readFile(planPath);
  const parsed = parseStrictJsonDocument(source, {
    documentKind: 'contribution',
    maxBytes: MAXIMUM_PLAN_BYTES,
    maxDepth: 128,
    maxNodes: 1_000_000,
  });
  if (
    !parsed.ok ||
    !isAgentModelEvaluationPlan(parsed.value) ||
    parsed.value.repositoryCommit !== expectedRepositoryCommit
  ) {
    fail('Native Provider state-vault recovery plan contract is invalid.');
  }
  return parsed.value;
};

export const recoverG4NativeProviderStateVault = async ({
  timeoutMs,
  baseUrl,
  namespace,
  serviceToken,
  expectedVaultOwnerInstanceId,
  planPath,
  expectedRepositoryCommit,
  fetchImplementation = globalThis.fetch,
  readPlanImplementation = readFrozenPlan,
}) => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUM_POLL_TIMEOUT_MS ||
    typeof fetchImplementation !== 'function' ||
    typeof readPlanImplementation !== 'function'
  ) {
    fail('Native Provider state-vault recovery configuration is invalid.');
  }
  const parsedBaseUrl = validateClientAuthority({
    baseUrl,
    namespace,
    serviceToken,
    expectedVaultOwnerInstanceId,
  });
  const plan = await readPlanImplementation({
    planPath,
    expectedRepositoryCommit,
  });
  if (
    !isPlainObject(plan) ||
    !isDigest(plan.planDigest) ||
    plan.repositoryCommit !== expectedRepositoryCommit
  ) {
    fail('Native Provider state-vault recovery plan binding is invalid.');
  }
  const deadline = Date.now() + timeoutMs;
  const healthEndpoint = new URL(
    `/v1/evaluations/${encodeURIComponent(namespace)}/native-provider-state-vault/health`,
    parsedBaseUrl
  );
  const health = await pollExactResponse({
    endpoint: healthEndpoint,
    headers: requestHeaders(serviceToken),
    deadline,
    label: 'Native Provider state-vault recovery health',
    decode: (source) =>
      decodeG4NativeProviderStateVaultRecoveryHealth({
        source,
        expectedVaultOwnerInstanceId,
        nowEpochMs: Date.now(),
      }),
    fetchImplementation,
  });
  const recoveryRequest = createG4NativeProviderStateVaultRecoveryRequest({
    namespace,
    planDigest: plan.planDigest,
    repositoryCommit: expectedRepositoryCommit,
    vaultOwnerInstanceId: expectedVaultOwnerInstanceId,
    authorityDigest: health.authority.authorityDigest,
    requestedAtEpochMs: Date.now(),
  });
  const partitionPath = `/v1/evaluations/${encodeURIComponent(namespace)}/${encodeURIComponent(plan.planDigest)}/${expectedRepositoryCommit}/native-provider-state-vault`;
  const recoveryEndpoint = new URL(`${partitionPath}/recovery`, parsedBaseUrl);
  let recoveryReceipt;
  try {
    const remainingMs = Math.max(1, deadline - Date.now());
    const response = await fetchWithTimeout({
      endpoint: recoveryEndpoint,
      method: 'POST',
      headers: {
        ...requestHeaders(serviceToken, true),
        'Idempotency-Key': recoveryRequest.recoveryRequestDigest,
      },
      body: canonicalJsonText(recoveryRequest),
      timeoutMs: Math.min(10_000, remainingMs),
      fetchImplementation,
    });
    const source = await readBoundedResponse(
      response,
      [200, 201],
      'Native Provider state-vault recovery'
    );
    recoveryReceipt = decodeG4NativeProviderStateVaultRecoveryReceipt({
      source,
      request: recoveryRequest,
      nowEpochMs: Date.now(),
    });
  } catch {
    // A committed recovery can lose its POST acknowledgment; the durable GET is authoritative.
  }
  const lookupEndpoint = new URL(
    `${partitionPath}/recoveries/${encodeURIComponent(recoveryRequest.recoveryRequestDigest)}`,
    parsedBaseUrl
  );
  if (recoveryReceipt === undefined) {
    recoveryReceipt = await pollExactResponse({
      endpoint: lookupEndpoint,
      headers: requestHeaders(serviceToken),
      deadline,
      label: 'Native Provider state-vault stored recovery receipt',
      decode: (source) =>
        decodeG4NativeProviderStateVaultRecoveryReceipt({
          source,
          request: recoveryRequest,
          nowEpochMs: Date.now(),
        }),
      fetchImplementation,
    });
  }
  const zeroEndpoint = new URL(
    `${partitionPath}/recoveries/${encodeURIComponent(recoveryRequest.recoveryRequestDigest)}/zero-residual`,
    parsedBaseUrl
  );
  const zeroResidualReceipt = await pollExactResponse({
    endpoint: zeroEndpoint,
    headers: requestHeaders(serviceToken),
    deadline,
    label: 'Native Provider state-vault recovery zero-residual receipt',
    decode: (source) =>
      decodeG4NativeProviderStateVaultRecoveryZeroResidual({
        source,
        request: recoveryRequest,
        recoveryReceipt,
        nowEpochMs: Date.now(),
      }),
    fetchImplementation,
  });
  return Object.freeze({
    health,
    recoveryRequest,
    recoveryReceipt,
    zeroResidualReceipt,
  });
};

const isMain =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [command, timeoutSource, ...extra] = process.argv.slice(2);
  if (command !== 'recover' || extra.length !== 0) {
    fail('Native Provider state-vault recovery command arguments are invalid.');
  }
  recoverG4NativeProviderStateVault({
    timeoutMs: Number(timeoutSource),
    baseUrl: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL,
    namespace: process.env.PRODIVIX_G4_MODEL_EVAL_NAMESPACE,
    serviceToken: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN,
    expectedVaultOwnerInstanceId:
      process.env
        .PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_OWNER_INSTANCE_ID,
    planPath: process.env.PRODIVIX_G4_MODEL_EVAL_PLAN_PATH,
    expectedRepositoryCommit:
      process.env.PRODIVIX_G4_MODEL_EVAL_REPOSITORY_COMMIT,
  })
    .then(({ zeroResidualReceipt }) =>
      process.stdout.write(`${zeroResidualReceipt.zeroResidualReceiptDigest}\n`)
    )
    .catch((error) => {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    });
}
