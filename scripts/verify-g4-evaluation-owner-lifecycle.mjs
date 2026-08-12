import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '../packages/shared/src/canonical/index.ts';
import { isPlainObject } from '../packages/shared/src/safety/index.ts';
import { parseStrictJsonDocument } from '../packages/plugin-contracts/src/parseStrictJsonDocument.ts';

const ACTIVATION_HEALTH_FORMAT =
  'prodivix.agent-evaluation-owner-activation-health';
const OWNER_HEALTH_FORMAT = 'prodivix.agent-evaluation-owner-authority-health';
const OWNER_SHUTDOWN_FORMAT =
  'prodivix.agent-evaluation-owner-authority-shutdown';
const OWNER_RETIREMENT_FORMAT =
  'prodivix.agent-evaluation-owner-authority-resource-retirement';
const OWNER_VERSION = 1;
const MAXIMUM_HEALTH_BYTES = 32_768;
const MAXIMUM_SHUTDOWN_RECEIPT_BYTES = 1_048_576;
const MAXIMUM_CONFIG_BYTES = 33_554_432;
const MAXIMUM_WAIT_MS = 130_000;

const DIGEST_PATTERN = /^sha256-[0-9a-f]{64}$/u;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$/u;

const ACTIVATION_HEALTH_KEYS = Object.freeze(
  [
    'activatedAt',
    'format',
    'healthDigest',
    'ownerAuthorityHealthDigest',
    'phase',
    'purpose',
    'status',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const PREPLAN_HEALTH_KEYS = Object.freeze(
  [
    'capabilityProbeAuthorityDigest',
    'capabilityProbeProviderResourceAuthorityDigest',
    'capabilityProbeProviderResourceCleanupAuthorityDigest',
    'format',
    'healthDigest',
    'purpose',
    'replayJournalImplementationDigest',
    'runtimeFactSourceRegistrationAuthorityDigest',
    'status',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const FULL_ATTEMPT_HEALTH_KEYS = Object.freeze(
  [
    'attemptGradingAuthorityDigest',
    'controlledWorkspaceAuthorityDigest',
    'format',
    'healthDigest',
    'providerCapabilityAuthorityDigest',
    'purpose',
    'replayJournalImplementationDigest',
    'status',
    'verificationEvidenceAuthorityDigest',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const SHUTDOWN_KEYS = Object.freeze(
  [
    'authorityImplementationDigests',
    'format',
    'receiptDigest',
    'replayJournalImplementationDigest',
    'residualCanaryIds',
    'residualResourceIds',
    'resourceRetirementReceiptDigest',
    'startupHealthDigest',
    'status',
    'version',
  ].sort(compareUnicodeCodePoints)
);
const PREPLAN_AUTHORITY_KEYS = Object.freeze(
  [
    'capabilityProbe',
    'capabilityProbeProviderResource',
    'capabilityProbeProviderResourceCleanup',
    'runtimeFactSourceRegistration',
  ].sort(compareUnicodeCodePoints)
);
const FULL_ATTEMPT_AUTHORITY_KEYS = Object.freeze(
  [
    'attemptGrading',
    'controlledWorkspace',
    'providerCapability',
    'verificationEvidence',
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

const decodeCanonicalDocument = (source, maximumBytes, maximumNodes = 256) => {
  if (
    typeof source !== 'string' ||
    Buffer.byteLength(source, 'utf8') < 1 ||
    Buffer.byteLength(source, 'utf8') > maximumBytes
  ) {
    fail('G4 owner lifecycle document is missing or exceeds its byte budget.');
  }
  const parsed = parseStrictJsonDocument(Buffer.from(source, 'utf8'), {
    documentKind: 'contribution',
    maxBytes: maximumBytes,
    maxDepth: 128,
    maxNodes: maximumNodes,
  });
  if (!parsed.ok) {
    fail('G4 owner lifecycle document is not strict JSON.');
  }
  return parsed.value;
};

const assertCanonicalDocument = (source, maximumBytes, maximumNodes) => {
  const value = decodeCanonicalDocument(source, maximumBytes, maximumNodes);
  if (source !== canonicalJsonText(value)) {
    fail('G4 owner lifecycle document is not canonical JSON.');
  }
  return value;
};

const assertPurpose = (purpose) => {
  if (!['preplan', 'full-attempt'].includes(purpose)) {
    fail('G4 owner lifecycle purpose is invalid.');
  }
};

export const decodeG4EvaluationOwnerActivationHealth = ({
  source,
  purpose,
  phase,
  expectedOwnerAuthorityHealthDigest = null,
}) => {
  assertPurpose(purpose);
  if (!['bootstrap', 'active'].includes(phase)) {
    fail('G4 owner activation phase is invalid.');
  }
  const value = assertCanonicalDocument(source, MAXIMUM_HEALTH_BYTES);
  const active = phase === 'active';
  const activatedAtEpochMs =
    typeof value.activatedAt === 'string' ? Date.parse(value.activatedAt) : NaN;
  if (
    !hasExactKeys(value, ACTIVATION_HEALTH_KEYS) ||
    value.format !== ACTIVATION_HEALTH_FORMAT ||
    value.version !== OWNER_VERSION ||
    value.purpose !== purpose ||
    value.phase !== phase ||
    value.status !== (active ? 'ready' : 'waiting-for-owner-authority') ||
    !DIGEST_PATTERN.test(value.healthDigest) ||
    (active
      ? !DIGEST_PATTERN.test(expectedOwnerAuthorityHealthDigest ?? '') ||
        value.ownerAuthorityHealthDigest !==
          expectedOwnerAuthorityHealthDigest ||
        typeof value.activatedAt !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
          value.activatedAt
        ) ||
        !Number.isFinite(activatedAtEpochMs) ||
        new Date(activatedAtEpochMs).toISOString() !== value.activatedAt
      : value.ownerAuthorityHealthDigest !== null || value.activatedAt !== null)
  ) {
    fail('G4 owner activation health authority is invalid.');
  }
  const { healthDigest, ...base } = value;
  if (healthDigest !== digestCanonicalValue(base)) {
    fail('G4 owner activation health digest is invalid.');
  }
  return Object.freeze(value);
};

export const decodeG4EvaluationOwnerAuthorityHealth = ({ source, purpose }) => {
  assertPurpose(purpose);
  const value = assertCanonicalDocument(source, MAXIMUM_HEALTH_BYTES);
  const expectedKeys =
    purpose === 'preplan' ? PREPLAN_HEALTH_KEYS : FULL_ATTEMPT_HEALTH_KEYS;
  if (
    !hasExactKeys(value, expectedKeys) ||
    value.format !== OWNER_HEALTH_FORMAT ||
    value.version !== OWNER_VERSION ||
    value.purpose !== purpose ||
    value.status !== 'ready' ||
    expectedKeys
      .filter((key) => key.endsWith('Digest'))
      .some((key) => !DIGEST_PATTERN.test(value[key]))
  ) {
    fail('G4 owner authority health is invalid.');
  }
  const { healthDigest, ...base } = value;
  if (healthDigest !== digestCanonicalValue(base)) {
    fail('G4 owner authority health digest is invalid.');
  }
  return Object.freeze(value);
};

const expectedAuthorityKeysForPurpose = (purpose) =>
  purpose === 'preplan' ? PREPLAN_AUTHORITY_KEYS : FULL_ATTEMPT_AUTHORITY_KEYS;

export const decodeG4EvaluationOwnerAuthorityShutdownReceipt = ({
  source,
  purpose,
  expectedAuthorityDigests,
  expectedReplayJournalDigest,
  expectedStartupHealthDigest,
}) => {
  assertPurpose(purpose);
  const value = assertCanonicalDocument(
    source,
    MAXIMUM_SHUTDOWN_RECEIPT_BYTES,
    1_024
  );
  const expectedAuthorityKeys = expectedAuthorityKeysForPurpose(purpose);
  const authorities = value.authorityImplementationDigests;
  const residualResources = value.residualResourceIds;
  if (
    !hasExactKeys(value, SHUTDOWN_KEYS) ||
    !hasExactKeys(authorities, expectedAuthorityKeys) ||
    !hasExactKeys(residualResources, expectedAuthorityKeys) ||
    !hasExactKeys(expectedAuthorityDigests, expectedAuthorityKeys) ||
    value.format !== OWNER_SHUTDOWN_FORMAT ||
    value.version !== OWNER_VERSION ||
    value.status !== 'clean' ||
    !Array.isArray(value.residualCanaryIds) ||
    value.residualCanaryIds.length !== 0 ||
    !DIGEST_PATTERN.test(value.replayJournalImplementationDigest) ||
    value.replayJournalImplementationDigest !== expectedReplayJournalDigest ||
    !DIGEST_PATTERN.test(value.startupHealthDigest) ||
    value.startupHealthDigest !== expectedStartupHealthDigest ||
    !DIGEST_PATTERN.test(value.resourceRetirementReceiptDigest) ||
    !DIGEST_PATTERN.test(value.receiptDigest)
  ) {
    fail('G4 owner authority shutdown receipt is invalid.');
  }
  for (const key of expectedAuthorityKeys) {
    if (
      !DIGEST_PATTERN.test(authorities[key]) ||
      !DIGEST_PATTERN.test(expectedAuthorityDigests[key]) ||
      authorities[key] !== expectedAuthorityDigests[key] ||
      !Array.isArray(residualResources[key]) ||
      residualResources[key].length !== 0
    ) {
      fail('G4 owner authority shutdown receipt retained residuals.');
    }
  }
  const retirementBase = Object.freeze({
    authorityImplementationDigests: authorities,
    format: OWNER_RETIREMENT_FORMAT,
    residualCanaryIds: Object.freeze([]),
    residualResourceIds: residualResources,
    status: 'clean',
    version: OWNER_VERSION,
  });
  if (
    value.resourceRetirementReceiptDigest !==
    digestCanonicalValue(retirementBase)
  ) {
    fail('G4 owner authority resource-retirement digest is invalid.');
  }
  const { receiptDigest, ...base } = value;
  if (receiptDigest !== digestCanonicalValue(base)) {
    fail('G4 owner authority shutdown receipt digest is invalid.');
  }
  return Object.freeze(value);
};

const decodeCanarySet = (source) => {
  const values = decodeCanonicalDocument(source, 2_900_000, 512);
  if (!Array.isArray(values) || values.length < 1 || values.length > 256) {
    fail('G4 evaluation canary source is invalid.');
  }
  for (const value of values) {
    if (
      typeof value !== 'string' ||
      Buffer.byteLength(value, 'utf8') < 8 ||
      Buffer.byteLength(value, 'utf8') > 4_096
    ) {
      fail('G4 evaluation canary is invalid.');
    }
  }
  return values;
};

export const encodeG4EvaluationPublicResponseCanaries = ({
  secretSource,
  protectedSource,
}) => {
  const encoded = new Set();
  for (const source of [secretSource, protectedSource]) {
    for (const value of decodeCanarySet(source)) {
      encoded.add(Buffer.from(value, 'utf8').toString('base64url'));
    }
  }
  return canonicalJsonText([...encoded].sort(compareUnicodeCodePoints));
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
  return /^[A-Za-z0-9._~+/-]+={0,2}$/u.test(value);
};

const readBoundedResponse = async (response, maximumBytes) => {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength) ||
      Number(contentLength) > maximumBytes)
  ) {
    fail('G4 owner lifecycle response exceeds its byte budget.');
  }
  if (response.body === null) {
    fail('G4 owner lifecycle response is empty.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel();
        fail('G4 owner lifecycle response exceeds its byte budget.');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength < 1) {
    fail('G4 owner lifecycle response is empty.');
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Buffer.concat(chunks, byteLength)
    );
  } catch {
    fail('G4 owner lifecycle response is not UTF-8.');
  }
};

const fetchCanonicalHealth = async ({
  endpoint,
  headers = {},
  signal,
  fetchImplementation,
}) => {
  const response = await fetchImplementation(endpoint, {
    method: 'GET',
    redirect: 'error',
    signal,
    headers: { Accept: 'application/json', ...headers },
  });
  if (
    response.status !== 200 ||
    !/^application\/json(?:;|$)/u.test(
      response.headers.get('content-type') ?? ''
    )
  ) {
    fail('G4 owner lifecycle health endpoint is unavailable.');
  }
  return readBoundedResponse(response, MAXIMUM_HEALTH_BYTES);
};

const waitForExactHealth = async ({ timeoutMs, read }) => {
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAXIMUM_WAIT_MS
  ) {
    fail('G4 owner lifecycle wait is invalid.');
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
      return await read(controller.signal);
    } catch {
      // A later poll may expose the exact ready authority.
    } finally {
      clearTimeout(timeout);
    }
    const delayMs = Math.min(1_000, deadline - Date.now());
    if (delayMs > 0) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, delayMs));
    }
  } while (Date.now() < deadline);
  fail('G4 owner lifecycle health did not become valid in time.');
};

export const waitForG4EvaluationOwnerActivationHealth = async ({
  phase,
  purpose,
  timeoutMs,
  baseUrl,
  namespace,
  serviceToken,
  expectedOwnerAuthorityHealthDigest = null,
  fetchImplementation = globalThis.fetch,
}) => {
  const parsedBaseUrl = new URL(baseUrl);
  if (
    parsedBaseUrl.href !== 'http://127.0.0.1:8790/' ||
    !IDENTITY_PATTERN.test(namespace ?? '') ||
    !validateServiceToken(serviceToken) ||
    typeof fetchImplementation !== 'function'
  ) {
    fail('G4 owner activation request authority is invalid.');
  }
  assertPurpose(purpose);
  const endpoint = new URL(
    `/v1/evaluations/${encodeURIComponent(namespace)}/owner-activation/health`,
    parsedBaseUrl
  );
  const health = await waitForExactHealth({
    timeoutMs,
    read: async (signal) =>
      decodeG4EvaluationOwnerActivationHealth({
        source: await fetchCanonicalHealth({
          endpoint,
          headers: { Authorization: `Bearer ${serviceToken}` },
          signal,
          fetchImplementation,
        }),
        purpose,
        phase,
        expectedOwnerAuthorityHealthDigest,
      }),
  });
  if (phase === 'active') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);
    try {
      const response = await fetchImplementation(
        new URL('/healthz', parsedBaseUrl),
        { method: 'GET', redirect: 'error', signal: controller.signal }
      );
      if (response.status !== 204) {
        fail('G4 activated evaluation ledger health is unavailable.');
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  return health;
};

export const waitForG4EvaluationOwnerAuthorityHealth = async ({
  purpose,
  timeoutMs,
  baseUrl,
  fetchImplementation = globalThis.fetch,
}) => {
  const parsedBaseUrl = new URL(baseUrl);
  if (
    parsedBaseUrl.href !== 'http://127.0.0.1:8791/' ||
    typeof fetchImplementation !== 'function'
  ) {
    fail('G4 owner authority health base URL is invalid.');
  }
  assertPurpose(purpose);
  return waitForExactHealth({
    timeoutMs,
    read: async (signal) =>
      decodeG4EvaluationOwnerAuthorityHealth({
        source: await fetchCanonicalHealth({
          endpoint: new URL('/healthz', parsedBaseUrl),
          signal,
          fetchImplementation,
        }),
        purpose,
      }),
  });
};

const assertProtectedFile = async (path, maximumBytes) => {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    fail('G4 owner lifecycle protected path is invalid.');
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (
      !metadata.isFile() ||
      (metadata.mode & 0o777) !== 0o600 ||
      metadata.size < 1 ||
      metadata.size > maximumBytes
    ) {
      fail('G4 owner lifecycle protected file authority is invalid.');
    }
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
};

const expectedDigestsFromEnvironment = (purpose) =>
  purpose === 'preplan'
    ? {
        capabilityProbe: process.env.EXPECTED_CAPABILITY_PROBE_DIGEST,
        capabilityProbeProviderResource:
          process.env.EXPECTED_CAPABILITY_PROBE_PROVIDER_RESOURCE_DIGEST,
        capabilityProbeProviderResourceCleanup:
          process.env
            .EXPECTED_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_DIGEST,
        runtimeFactSourceRegistration:
          process.env.EXPECTED_RUNTIME_FACT_SOURCE_REGISTRATION_DIGEST,
      }
    : {
        attemptGrading: process.env.EXPECTED_ATTEMPT_GRADING_DIGEST,
        controlledWorkspace: process.env.EXPECTED_CONTROLLED_WORKSPACE_DIGEST,
        providerCapability: process.env.EXPECTED_PROVIDER_CAPABILITY_DIGEST,
        verificationEvidence: process.env.EXPECTED_VERIFICATION_EVIDENCE_DIGEST,
      };

const assertPreplanCleanupReceiptCount = async (path) => {
  const source = await readFile(path, 'utf8');
  const config = decodeCanonicalDocument(
    source,
    MAXIMUM_CONFIG_BYTES,
    1_000_000
  );
  const cleanupReceipts =
    config?.qualificationAuthorityBundle?.providerResourceCleanupReceipts;
  if (!isPlainObject(cleanupReceipts)) {
    fail('G4 preplan cleanup receipt authority is missing.');
  }
  let cleanupReceiptCount = 0;
  for (const receipts of Object.values(cleanupReceipts)) {
    if (!isPlainObject(receipts)) {
      fail('G4 preplan cleanup receipt authority is invalid.');
    }
    cleanupReceiptCount += Object.keys(receipts).length;
  }
  if (cleanupReceiptCount !== 4) {
    fail('G4 preplan cleanup receipt count is invalid.');
  }
};

const ownerHealthOutput = (health) => {
  if (health.purpose === 'preplan') {
    return [
      `capability_probe_digest=${health.capabilityProbeAuthorityDigest}`,
      `capability_probe_provider_resource_digest=${health.capabilityProbeProviderResourceAuthorityDigest}`,
      `capability_probe_provider_resource_cleanup_digest=${health.capabilityProbeProviderResourceCleanupAuthorityDigest}`,
      `replay_journal_digest=${health.replayJournalImplementationDigest}`,
      `runtime_fact_source_registration_digest=${health.runtimeFactSourceRegistrationAuthorityDigest}`,
      `startup_health_digest=${health.healthDigest}`,
    ];
  }
  return [
    `attempt_grading_digest=${health.attemptGradingAuthorityDigest}`,
    `controlled_workspace_digest=${health.controlledWorkspaceAuthorityDigest}`,
    `provider_capability_digest=${health.providerCapabilityAuthorityDigest}`,
    `replay_journal_digest=${health.replayJournalImplementationDigest}`,
    `startup_health_digest=${health.healthDigest}`,
    `verification_evidence_digest=${health.verificationEvidenceAuthorityDigest}`,
  ];
};

const isMain =
  typeof process.argv[1] === 'string' &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const [command, ...args] = process.argv.slice(2);
  const execute = async () => {
    if (command === 'activation') {
      const [phase, purpose, timeoutSource, ...extra] = args;
      if (extra.length !== 0) {
        fail('G4 owner activation command arguments are invalid.');
      }
      const health = await waitForG4EvaluationOwnerActivationHealth({
        phase,
        purpose,
        timeoutMs: Number(timeoutSource),
        baseUrl: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_BASE_URL,
        namespace: process.env.PRODIVIX_G4_MODEL_EVAL_NAMESPACE,
        serviceToken: process.env.PRODIVIX_G4_MODEL_EVAL_SERVICE_TOKEN,
        expectedOwnerAuthorityHealthDigest:
          process.env.EXPECTED_OWNER_HEALTH_DIGEST ?? null,
      });
      process.stdout.write(`${health.healthDigest}\n`);
      return;
    }
    if (command === 'owner-health') {
      const [purpose, timeoutSource, ...extra] = args;
      if (extra.length !== 0) {
        fail('G4 owner health command arguments are invalid.');
      }
      const health = await waitForG4EvaluationOwnerAuthorityHealth({
        purpose,
        timeoutMs: Number(timeoutSource),
        baseUrl: process.env.PRODIVIX_G4_MODEL_EVAL_OWNER_AUTHORITY_BASE_URL,
      });
      process.stdout.write(`${ownerHealthOutput(health).join('\n')}\n`);
      return;
    }
    if (command === 'shutdown-receipt') {
      const [purpose, ...extra] = args;
      if (extra.length !== 0) {
        fail('G4 owner shutdown command arguments are invalid.');
      }
      if (purpose === 'preplan') {
        await assertPreplanCleanupReceiptCount(process.env.GENERATED_CONFIG);
      }
      const source = await assertProtectedFile(
        process.env.OWNER_AUTHORITY_SHUTDOWN_RECEIPT_PATH,
        MAXIMUM_SHUTDOWN_RECEIPT_BYTES
      );
      const receipt = decodeG4EvaluationOwnerAuthorityShutdownReceipt({
        source,
        purpose,
        expectedAuthorityDigests: expectedDigestsFromEnvironment(purpose),
        expectedReplayJournalDigest: process.env.EXPECTED_REPLAY_JOURNAL_DIGEST,
        expectedStartupHealthDigest: process.env.EXPECTED_STARTUP_HEALTH_DIGEST,
      });
      process.stdout.write(`${receipt.receiptDigest}\n`);
      return;
    }
    if (command === 'encode-public-response-canaries' && args.length === 0) {
      process.stdout.write(
        `${encodeG4EvaluationPublicResponseCanaries({
          secretSource: process.env.PRODIVIX_G4_MODEL_EVAL_SECRET_CANARIES,
          protectedSource:
            process.env.PRODIVIX_G4_MODEL_EVAL_PROTECTED_HOLDOUT_CANARIES,
        })}\n`
      );
      return;
    }
    fail('G4 owner lifecycle command is invalid.');
  };
  execute().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
