import {
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  digestAgentCanonicalValue,
  type AgentJsonValue,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher,
  type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver,
} from './productionHostedRetrievalRuntimeResourceLifecycleSpoolCipher';
import { createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile } from './runConfig';

const digest = (label: string) => digestAgentCanonicalValue({ label });

const response = Object.freeze({
  status: 'created',
  resourceId: 'vs_prodivix_fixture',
  requestId: 'request_fixture',
  bodyDigest: digest('provider-body'),
}) satisfies AgentJsonValue;

const aad = createAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad({
  namespaceId: 'namespace.fixture',
  repositoryCommit: 'a'.repeat(40),
  planDigest: digest('plan'),
  frozenRunDigest: digest('frozen'),
  runConfigArtifactBindingDigest: digest('binding'),
  runtimeResourceSetId: 'hosted-runtime-set.fixture',
  lifecycleExpiresAt: '2026-08-20T00:00:00.000Z',
  registrationRequestDigest: digest('registration'),
  authorityDigest: null,
  lifecycleClaimReceiptDigest: null,
  operation: 'create',
  resourceId: null,
  resourceRole: null,
  dispatchIntentSetDigest: digest('intents'),
  dispatchStageClaimReceiptSetDigest: digest('claims'),
  dispatchStageClaimHistorySetDigest: digest('claim-history'),
  transportReceiptSetDigest: digest('transport'),
  businessResultDigest: digest('business'),
  plaintextDigest: digestAgentCanonicalValue(response),
});

const keys =
  (): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver =>
    Object.freeze({
      async use<T>(
        _input: Readonly<{ useId: string; purpose: 'decrypt' | 'encrypt' }>,
        callback: (key: Uint8Array) => Promise<T>
      ): Promise<T> {
        const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
        try {
          return await callback(key);
        } finally {
          key.fill(0);
        }
      },
    });

describe('production hosted lifecycle spool cipher', () => {
  it('round-trips only through callback-bound AES-GCM with the frozen profile', async () => {
    const cipher =
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher({
        profile:
          createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile(),
        keys: keys(),
        randomBytes: (size) => new Uint8Array(size).fill(9),
      });
    const encrypted = await cipher.encrypt(aad, response);

    expect(encrypted.envelope.ciphertextBase64Url).not.toContain(
      'vs_prodivix_fixture'
    );
    expect(encrypted.envelopeAuthority.plaintextDigest).toBe(
      aad.plaintextDigest
    );
    const decoded = await cipher.useDecrypted(
      encrypted,
      aad,
      async (value) => value
    );
    expect(decoded).toEqual(response);
  });

  it('fails closed for profile drift and authenticated-ciphertext drift', async () => {
    const profile =
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile();
    expect(() =>
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher({
        profile: {
          ...profile,
          profileDigest: digest('drift'),
        },
        keys: keys(),
      })
    ).toThrow();

    const cipher =
      createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher({
        profile,
        keys: keys(),
        randomBytes: (size) => new Uint8Array(size).fill(7),
      });
    const encrypted = await cipher.encrypt(aad, response);
    await expect(
      cipher.useDecrypted(
        {
          ...encrypted,
          envelope: {
            ...encrypted.envelope,
            ciphertextBase64Url: `${encrypted.envelope.ciphertextBase64Url.slice(0, -1)}A`,
          },
        },
        aad,
        async (value) => value
      )
    ).rejects.toThrow();
  });
});
