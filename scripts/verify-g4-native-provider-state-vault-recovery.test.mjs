import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  createG4NativeProviderStateVaultRecoveryRequest,
  decodeG4NativeProviderStateVaultRecoveryHealth,
  decodeG4NativeProviderStateVaultRecoveryReceipt,
  decodeG4NativeProviderStateVaultRecoveryZeroResidual,
  recoverG4NativeProviderStateVault,
} from './verify-g4-native-provider-state-vault-recovery.mjs';

const template = JSON.parse(
  await readFile(
    new URL(
      '../specs/evaluation/g4-real-model-evaluation.example.json',
      import.meta.url
    ),
    'utf8'
  )
);
const authority = template.nativeProviderStateVaultEncryption.authority;
const namespace = 'namespace.release';
const ownerInstanceId = '123456789.2.evaluation-shard:abcdef';
const serviceToken = 'ledger-token-state-vault-0123456789abcdef';
const planDigest = `sha256-${'a'.repeat(64)}`;
const repositoryCommit = 'b'.repeat(40);
const nowEpochMs = Date.parse('2026-08-10T12:00:00.000Z');

const digestCanonicalValue = (value) =>
  `sha256-${createHash('sha256')
    .update(canonicalJsonText(value), 'utf8')
    .digest('hex')}`;

const withDigest = (base, digestKey) =>
  canonicalJsonText({ ...base, [digestKey]: digestCanonicalValue(base) });

const createHealth = ({
  active = 2,
  overdue = 1,
  owner = ownerInstanceId,
  expectedAuthority = authority,
  checkedAtEpochMs = nowEpochMs,
  expiresAtEpochMs = checkedAtEpochMs + 125_000,
  recoveryRequired = active !== 0,
} = {}) =>
  withDigest(
    {
      activeEncryptedRecordCount: active,
      authority: expectedAuthority,
      checkedAt: new Date(checkedAtEpochMs).toISOString(),
      expiresAt: new Date(expiresAtEpochMs).toISOString(),
      format:
        'prodivix.agent-evaluation-native-provider-state-vault-recovery-health',
      mode: 'recovery-only',
      overdueActiveRecordCount: overdue,
      recoveryRequired,
      status: 'ready',
      vaultOwnerInstanceId: owner,
      version: 1,
    },
    'healthDigest'
  );

const createRequest = (requestedAtEpochMs = nowEpochMs) =>
  createG4NativeProviderStateVaultRecoveryRequest({
    namespace,
    planDigest,
    repositoryCommit,
    vaultOwnerInstanceId: ownerInstanceId,
    authorityDigest: authority.authorityDigest,
    requestedAtEpochMs,
  });

const createReceipt = (request, overrides = {}) => {
  const base = {
    authorityDigest: request.authorityDigest,
    cancelledRetirementCount: 1,
    completedAt: request.requestedAt,
    consumedRetirementCount: 1,
    expiredRetirementCount: 1,
    forcedExpiryTombstoneCount: 1,
    format:
      'prodivix.agent-evaluation-native-provider-state-vault-recovery-receipt',
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    reason: 'owner-crash-recovery',
    recoveryRequestDigest: request.recoveryRequestDigest,
    repositoryCommit: request.repositoryCommit,
    residualActiveEncryptedRecordCount: 0,
    retiredRecordCount: 3,
    terminalRecordSetDigest: `sha256-${'c'.repeat(64)}`,
    vaultOwnerInstanceId: request.vaultOwnerInstanceId,
    version: 1,
    ...overrides,
  };
  return withDigest(base, 'receiptDigest');
};

const createZero = (request, receipt, overrides = {}) => {
  const checkedAtEpochMs = Date.parse(receipt.completedAt);
  const base = {
    activeEncryptedRecordCount: 0,
    authorityDigest: request.authorityDigest,
    checkedAt: new Date(checkedAtEpochMs).toISOString(),
    expiresAt: new Date(checkedAtEpochMs + 125_000).toISOString(),
    format:
      'prodivix.agent-evaluation-native-provider-state-vault-recovery-zero-residual-receipt',
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    recoveryReceiptDigest: receipt.receiptDigest,
    recoveryRequestDigest: request.recoveryRequestDigest,
    repositoryCommit: request.repositoryCommit,
    vaultOwnerInstanceId: request.vaultOwnerInstanceId,
    version: 1,
    ...overrides,
  };
  return withDigest(base, 'zeroResidualReceiptDigest');
};

test('decodes exact recovery health, receipt, and zero-residual closure', () => {
  const health = decodeG4NativeProviderStateVaultRecoveryHealth({
    source: createHealth(),
    expectedVaultOwnerInstanceId: ownerInstanceId,
    nowEpochMs,
  });
  assert.equal(health.recoveryRequired, true);

  const request = createRequest();
  const receipt = decodeG4NativeProviderStateVaultRecoveryReceipt({
    source: createReceipt(request),
    request,
    nowEpochMs,
  });
  assert.equal(receipt.retiredRecordCount, 3);
  const zero = decodeG4NativeProviderStateVaultRecoveryZeroResidual({
    source: createZero(request, receipt),
    request,
    recoveryReceipt: receipt,
    nowEpochMs,
  });
  assert.equal(zero.activeEncryptedRecordCount, 0);
});

test('rejects recovery health owner, authority, freshness, lifetime, shape, and count drift', () => {
  const foreignAuthority = {
    ...authority,
    authorityDigest: `sha256-${'d'.repeat(64)}`,
  };
  const cases = [
    createHealth({ owner: '123456789.2.foreign' }),
    createHealth({ expectedAuthority: foreignAuthority }),
    createHealth({ checkedAtEpochMs: nowEpochMs - 30_001 }),
    createHealth({ expiresAtEpochMs: nowEpochMs + 125_001 }),
    createHealth({ recoveryRequired: false }),
    createHealth({ active: 0, overdue: 1 }),
    `${createHealth()}\n`,
    createHealth().replace(
      '"activeEncryptedRecordCount":2',
      '"activeEncryptedRecordCount":2,"activeEncryptedRecordCount":2'
    ),
  ];
  for (const source of cases) {
    assert.throws(() =>
      decodeG4NativeProviderStateVaultRecoveryHealth({
        source,
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      })
    );
  }
});

test('rejects receipt and zero-residual identity, count, digest, residual, and time drift', () => {
  const request = createRequest();
  const goodReceipt = decodeG4NativeProviderStateVaultRecoveryReceipt({
    source: createReceipt(request),
    request,
    nowEpochMs,
  });
  const receiptCases = [
    createReceipt(request, { planDigest: `sha256-${'e'.repeat(64)}` }),
    createReceipt(request, { retiredRecordCount: 2 }),
    createReceipt(request, { residualActiveEncryptedRecordCount: 1 }),
    createReceipt(request, {
      completedAt: new Date(nowEpochMs - 1).toISOString(),
    }),
    createReceipt(request).replace(
      /"receiptDigest":"sha256-[0-9a-f]{64}"/u,
      '"receiptDigest":"sha256-ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"'
    ),
  ];
  for (const source of receiptCases) {
    assert.throws(() =>
      decodeG4NativeProviderStateVaultRecoveryReceipt({
        source,
        request,
        nowEpochMs,
      })
    );
  }
  const zeroCases = [
    createZero(request, goodReceipt, { activeEncryptedRecordCount: 1 }),
    createZero(request, goodReceipt, {
      recoveryReceiptDigest: `sha256-${'f'.repeat(64)}`,
    }),
    createZero(request, goodReceipt, {
      expiresAt: new Date(nowEpochMs + 125_001).toISOString(),
    }),
  ];
  for (const source of zeroCases) {
    assert.throws(() =>
      decodeG4NativeProviderStateVaultRecoveryZeroResidual({
        source,
        request,
        recoveryReceipt: goodReceipt,
        nowEpochMs,
      })
    );
  }
});

const exerciseRecovery = async ({ losePostAcknowledgment }) => {
  const requests = [];
  let recoveryRequest;
  let recoveryReceipt;
  const fetchImplementation = async (url, init) => {
    const href = String(url);
    requests.push({ href, init });
    if (href.endsWith('/native-provider-state-vault/health')) {
      const observedAt = Date.now();
      return new Response(
        createHealth({
          checkedAtEpochMs: observedAt,
          expiresAtEpochMs: observedAt + 125_000,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (href.endsWith('/native-provider-state-vault/recovery')) {
      recoveryRequest = JSON.parse(init.body);
      recoveryReceipt = JSON.parse(createReceipt(recoveryRequest));
      if (losePostAcknowledgment) throw new Error('simulated ACK loss');
      return new Response(canonicalJsonText(recoveryReceipt), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.endsWith(`recoveries/${recoveryRequest.recoveryRequestDigest}`)) {
      return new Response(canonicalJsonText(recoveryReceipt), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.endsWith('/zero-residual')) {
      return new Response(createZero(recoveryRequest, recoveryReceipt), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected endpoint ${href}`);
  };
  const result = await recoverG4NativeProviderStateVault({
    timeoutMs: 1_000,
    baseUrl: 'http://127.0.0.1:8790',
    namespace,
    serviceToken,
    expectedVaultOwnerInstanceId: ownerInstanceId,
    planPath: '/test/frozen-plan.json',
    expectedRepositoryCommit: repositoryCommit,
    fetchImplementation,
    readPlanImplementation: async () => ({ planDigest, repositoryCommit }),
  });
  return { requests, result };
};

test('runs purpose-bound health, POST, and zero recovery with exact authorities', async () => {
  const { requests, result } = await exerciseRecovery({
    losePostAcknowledgment: false,
  });
  assert.equal(requests.length, 3);
  assert.equal(requests[0].init.method, 'GET');
  assert.equal(requests[1].init.method, 'POST');
  assert.equal(requests[2].init.method, 'GET');
  assert.equal(
    requests[1].init.headers['Idempotency-Key'],
    result.recoveryRequest.recoveryRequestDigest
  );
  assert.equal(
    requests[1].init.headers['X-Prodivix-Native-Provider-State-Vault-Purpose'],
    'native-provider-state-vault-recovery-owner'
  );
  assert.equal(
    result.zeroResidualReceipt.recoveryReceiptDigest,
    result.recoveryReceipt.receiptDigest
  );
});

test('resolves a committed recovery through durable GET after POST ACK loss', async () => {
  const { requests, result } = await exerciseRecovery({
    losePostAcknowledgment: true,
  });
  assert.equal(requests.length, 4);
  assert.match(requests[2].href, /\/recoveries\/sha256-[0-9a-f]{64}$/u);
  assert.match(requests[3].href, /\/zero-residual$/u);
  assert.equal(result.recoveryReceipt.residualActiveEncryptedRecordCount, 0);
});

test('rejects a Unicode credential before any recovery endpoint is called', async () => {
  let fetchCount = 0;
  await assert.rejects(
    recoverG4NativeProviderStateVault({
      timeoutMs: 1,
      baseUrl: 'http://127.0.0.1:8790',
      namespace,
      serviceToken: `${serviceToken.slice(0, -1)}é`,
      expectedVaultOwnerInstanceId: ownerInstanceId,
      planPath: '/test/frozen-plan.json',
      expectedRepositoryCommit: repositoryCommit,
      fetchImplementation: async () => {
        fetchCount += 1;
        throw new Error('fetch must remain unreachable');
      },
      readPlanImplementation: async () => ({
        planDigest,
        repositoryCommit,
      }),
    })
  );
  assert.equal(fetchCount, 0);
});
