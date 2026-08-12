import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonText } from '../packages/shared/src/canonical/index.ts';
import {
  decodeG4EvaluationOwnerActivationHealth,
  decodeG4EvaluationOwnerAuthorityHealth,
  decodeG4EvaluationOwnerAuthorityShutdownReceipt,
  encodeG4EvaluationPublicResponseCanaries,
  waitForG4EvaluationOwnerActivationHealth,
  waitForG4EvaluationOwnerAuthorityHealth,
} from './verify-g4-evaluation-owner-lifecycle.mjs';

const digestCanonicalValue = (value) =>
  `sha256-${createHash('sha256')
    .update(canonicalJsonText(value), 'utf8')
    .digest('hex')}`;
const digest = (character) => `sha256-${character.repeat(64)}`;

const createActivationHealth = ({
  phase = 'bootstrap',
  purpose = 'preplan',
  ownerAuthorityHealthDigest = null,
} = {}) => {
  const base = {
    activatedAt: phase === 'active' ? '2026-08-11T01:02:03.456Z' : null,
    format: 'prodivix.agent-evaluation-owner-activation-health',
    ownerAuthorityHealthDigest,
    phase,
    purpose,
    status: phase === 'active' ? 'ready' : 'waiting-for-owner-authority',
    version: 1,
  };
  return canonicalJsonText({
    ...base,
    healthDigest: digestCanonicalValue(base),
  });
};

const createOwnerHealth = (purpose = 'preplan') => {
  const base =
    purpose === 'preplan'
      ? {
          capabilityProbeAuthorityDigest: digest('1'),
          capabilityProbeProviderResourceAuthorityDigest: digest('2'),
          capabilityProbeProviderResourceCleanupAuthorityDigest: digest('3'),
          format: 'prodivix.agent-evaluation-owner-authority-health',
          purpose,
          replayJournalImplementationDigest: digest('4'),
          runtimeFactSourceRegistrationAuthorityDigest: digest('5'),
          status: 'ready',
          version: 1,
        }
      : {
          attemptGradingAuthorityDigest: digest('6'),
          controlledWorkspaceAuthorityDigest: digest('7'),
          format: 'prodivix.agent-evaluation-owner-authority-health',
          providerCapabilityAuthorityDigest: digest('8'),
          purpose,
          replayJournalImplementationDigest: digest('9'),
          status: 'ready',
          verificationEvidenceAuthorityDigest: digest('a'),
          version: 1,
        };
  return canonicalJsonText({
    ...base,
    healthDigest: digestCanonicalValue(base),
  });
};

const createShutdownReceipt = (purpose = 'preplan') => {
  const authorityImplementationDigests =
    purpose === 'preplan'
      ? {
          capabilityProbe: digest('1'),
          capabilityProbeProviderResource: digest('2'),
          capabilityProbeProviderResourceCleanup: digest('3'),
          runtimeFactSourceRegistration: digest('5'),
        }
      : {
          attemptGrading: digest('6'),
          controlledWorkspace: digest('7'),
          providerCapability: digest('8'),
          verificationEvidence: digest('a'),
        };
  const residualResourceIds = Object.fromEntries(
    Object.keys(authorityImplementationDigests).map((key) => [key, []])
  );
  const retirement = {
    authorityImplementationDigests,
    format: 'prodivix.agent-evaluation-owner-authority-resource-retirement',
    residualCanaryIds: [],
    residualResourceIds,
    status: 'clean',
    version: 1,
  };
  const base = {
    authorityImplementationDigests,
    format: 'prodivix.agent-evaluation-owner-authority-shutdown',
    replayJournalImplementationDigest:
      purpose === 'preplan' ? digest('4') : digest('9'),
    residualCanaryIds: [],
    residualResourceIds,
    resourceRetirementReceiptDigest: digestCanonicalValue(retirement),
    startupHealthDigest: digest('b'),
    status: 'clean',
    version: 1,
  };
  return {
    expectedAuthorityDigests: authorityImplementationDigests,
    expectedReplayJournalDigest: base.replayJournalImplementationDigest,
    expectedStartupHealthDigest: base.startupHealthDigest,
    source: canonicalJsonText({
      ...base,
      receiptDigest: digestCanonicalValue(base),
    }),
  };
};

test('decodes canonical bootstrap and active owner activation health', () => {
  const bootstrap = decodeG4EvaluationOwnerActivationHealth({
    source: createActivationHealth(),
    purpose: 'preplan',
    phase: 'bootstrap',
  });
  assert.equal(bootstrap.status, 'waiting-for-owner-authority');

  const ownerHealthDigest = digest('c');
  const active = decodeG4EvaluationOwnerActivationHealth({
    source: createActivationHealth({
      phase: 'active',
      purpose: 'full-attempt',
      ownerAuthorityHealthDigest: ownerHealthDigest,
    }),
    purpose: 'full-attempt',
    phase: 'active',
    expectedOwnerAuthorityHealthDigest: ownerHealthDigest,
  });
  assert.equal(active.status, 'ready');
});

test('decodes purpose-separated owner health and clean shutdown receipts', () => {
  for (const purpose of ['preplan', 'full-attempt']) {
    const health = decodeG4EvaluationOwnerAuthorityHealth({
      source: createOwnerHealth(purpose),
      purpose,
    });
    assert.equal(health.purpose, purpose);

    const input = createShutdownReceipt(purpose);
    const receipt = decodeG4EvaluationOwnerAuthorityShutdownReceipt({
      ...input,
      purpose,
    });
    assert.equal(receipt.status, 'clean');
  }
});

test('rejects canonical drift, duplicate keys, purpose swaps, and recomputed residuals', () => {
  const preplanHealth = createOwnerHealth('preplan');
  assert.throws(() =>
    decodeG4EvaluationOwnerAuthorityHealth({
      source: `${preplanHealth}\n`,
      purpose: 'preplan',
    })
  );
  assert.throws(() =>
    decodeG4EvaluationOwnerAuthorityHealth({
      source: preplanHealth.replace(
        '"format":',
        '"format":"prodivix.agent-evaluation-owner-authority-health","format":'
      ),
      purpose: 'preplan',
    })
  );
  assert.throws(() =>
    decodeG4EvaluationOwnerAuthorityHealth({
      source: preplanHealth,
      purpose: 'full-attempt',
    })
  );

  const input = createShutdownReceipt('full-attempt');
  const value = JSON.parse(input.source);
  value.residualResourceIds.attemptGrading.push('residual');
  const { receiptDigest: _ignored, ...base } = value;
  value.receiptDigest = digestCanonicalValue(base);
  assert.throws(() =>
    decodeG4EvaluationOwnerAuthorityShutdownReceipt({
      ...input,
      source: canonicalJsonText(value),
      purpose: 'full-attempt',
    })
  );
});

test('encodes response canaries with the shared Unicode code-point order', () => {
  assert.equal(
    encodeG4EvaluationPublicResponseCanaries({
      secretSource: canonicalJsonText(['zzzzzzzz', 'aaaaaaaa']),
      protectedSource: canonicalJsonText(['bbbbbbbb', 'aaaaaaaa']),
    }),
    canonicalJsonText(
      ['zzzzzzzz', 'aaaaaaaa', 'bbbbbbbb']
        .map((value) => Buffer.from(value).toString('base64url'))
        .sort()
    )
  );
});

test('polls only exact loopback owner lifecycle endpoints', async () => {
  const ownerHealthSource = createOwnerHealth('preplan');
  const ownerRequests = [];
  const ownerHealth = await waitForG4EvaluationOwnerAuthorityHealth({
    purpose: 'preplan',
    timeoutMs: 100,
    baseUrl: 'http://127.0.0.1:8791',
    fetchImplementation: async (url, init) => {
      ownerRequests.push({ url: String(url), init });
      return new Response(ownerHealthSource, {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(ownerHealth.purpose, 'preplan');
  assert.equal(ownerRequests[0].url, 'http://127.0.0.1:8791/healthz');

  const activationRequests = [];
  const activationHealth = await waitForG4EvaluationOwnerActivationHealth({
    phase: 'bootstrap',
    purpose: 'preplan',
    timeoutMs: 100,
    baseUrl: 'http://127.0.0.1:8790',
    namespace: 'namespace.release',
    serviceToken: 'ledger-token-0123456789abcdef0123456789',
    fetchImplementation: async (url, init) => {
      activationRequests.push({ url: String(url), init });
      return new Response(createActivationHealth(), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(activationHealth.phase, 'bootstrap');
  assert.equal(
    activationRequests[0].url,
    'http://127.0.0.1:8790/v1/evaluations/namespace.release/owner-activation/health'
  );
  assert.equal(
    activationRequests[0].init.headers.Authorization,
    'Bearer ledger-token-0123456789abcdef0123456789'
  );
});
