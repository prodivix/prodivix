import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  decodeG4NativeProviderStateVaultHealth,
  waitForG4NativeProviderStateVaultHealth,
} from './verify-g4-native-provider-state-vault-health.mjs';

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
const ownerInstanceId = '123456789.2.evaluation-shard:abcdef';
const serviceToken = 'ledger-token-state-vault-0123456789abcdef';
const nowEpochMs = Date.parse('2026-08-09T12:00:10.000Z');

const createHealth = ({
  active = 0,
  cancelled = 0,
  consumed = 2,
  expired = 1,
  forcedExpiryTombstoneCount = 0,
  expectedAuthority = authority,
  owner = ownerInstanceId,
  checkedAt = '2026-08-09T12:00:00.000Z',
  status = 'ready',
} = {}) => {
  const retired = cancelled + consumed + expired;
  const base = {
    activeEncryptedRecordCount: active,
    authority: expectedAuthority,
    checkedAt,
    format: 'prodivix.agent-evaluation-native-provider-state-vault-health',
    forcedExpiryTombstoneCount,
    maximumRecords: 5_880,
    overdueActiveRecordCount: 0,
    retiredRecordCount: retired,
    retirementCounts: { cancelled, consumed, expired },
    sealedRecordCount: active + retired + forcedExpiryTombstoneCount,
    status,
    vaultOwnerInstanceId: owner,
    version: 1,
  };
  return canonicalJsonText({
    ...base,
    healthDigest: `sha256-${createHash('sha256')
      .update(canonicalJsonText(base), 'utf8')
      .digest('hex')}`,
  });
};

test('decodes exact instance-bound ready and zero-residual health', () => {
  const ready = decodeG4NativeProviderStateVaultHealth({
    source: createHealth({ active: 1 }),
    expectedVaultOwnerInstanceId: ownerInstanceId,
    nowEpochMs,
  });
  assert.equal(ready.activeEncryptedRecordCount, 1);

  const zero = decodeG4NativeProviderStateVaultHealth({
    source: createHealth(),
    expectedVaultOwnerInstanceId: ownerInstanceId,
    requireZeroResidual: true,
    nowEpochMs,
  });
  assert.equal(zero.sealedRecordCount, zero.retiredRecordCount);
});

test('rejects owner, authority, lifecycle, freshness, duplicate-key, and canonical drift', () => {
  const foreignAuthority = {
    ...authority,
    authorityImplementationDigest: `sha256-${'f'.repeat(64)}`,
    authorityDigest: `sha256-${'e'.repeat(64)}`,
  };
  const cases = [
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth(),
        expectedVaultOwnerInstanceId: '123456789.2.foreign',
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({ expectedAuthority: foreignAuthority }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({ active: 1 }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        requireZeroResidual: true,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth().replace(
          '"activeEncryptedRecordCount":0',
          '"activeEncryptedRecordCount":0,"activeEncryptedRecordCount":0'
        ),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: `${createHealth()}\n`,
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({
          checkedAt: new Date(nowEpochMs - 30_001).toISOString(),
        }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({
          checkedAt: new Date(nowEpochMs + 5_001).toISOString(),
        }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({
          forcedExpiryTombstoneCount: 1,
          status: 'unavailable',
        }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
    () =>
      decodeG4NativeProviderStateVaultHealth({
        source: createHealth({ forcedExpiryTombstoneCount: 1 }),
        expectedVaultOwnerInstanceId: ownerInstanceId,
        nowEpochMs,
      }),
  ];
  for (const run of cases) assert.throws(run);
});

test('polls the purpose-bound endpoint without exposing the credential', async () => {
  const source = createHealth({ checkedAt: new Date().toISOString() });
  const requests = [];
  const health = await waitForG4NativeProviderStateVaultHealth({
    mode: 'zero',
    timeoutMs: 100,
    baseUrl: 'http://127.0.0.1:8790',
    namespace: 'namespace.release',
    serviceToken,
    expectedVaultOwnerInstanceId: ownerInstanceId,
    fetchImplementation: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(source, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(health.activeEncryptedRecordCount, 0);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    'http://127.0.0.1:8790/v1/evaluations/namespace.release/native-provider-state-vault/health'
  );
  assert.deepEqual(requests[0].init.headers, {
    Accept: 'application/json',
    Authorization: `Bearer ${serviceToken}`,
    'X-Prodivix-Native-Provider-State-Vault-Purpose':
      'native-provider-state-vault-owner',
  });
});

test('rejects Unicode credential mapping and an oversized streamed body', async () => {
  let fetchCount = 0;
  await assert.rejects(
    waitForG4NativeProviderStateVaultHealth({
      mode: 'ready',
      timeoutMs: 1,
      baseUrl: 'http://127.0.0.1:8790',
      namespace: 'namespace.release',
      serviceToken: `${serviceToken.slice(0, -1)}é`,
      expectedVaultOwnerInstanceId: ownerInstanceId,
      fetchImplementation: async () => {
        fetchCount += 1;
        throw new Error('fetch must remain unreachable');
      },
    })
  );
  assert.equal(fetchCount, 0);

  await assert.rejects(
    waitForG4NativeProviderStateVaultHealth({
      mode: 'ready',
      timeoutMs: 1,
      baseUrl: 'http://127.0.0.1:8790',
      namespace: 'namespace.release',
      serviceToken,
      expectedVaultOwnerInstanceId: ownerInstanceId,
      fetchImplementation: async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(32_769));
              controller.close();
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        ),
    })
  );
});
