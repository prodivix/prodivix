import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  createAgentEvaluationCapabilityEffectProviderSpoolAad,
  digestAgentCanonicalValue,
} from '@prodivix/ai';
import { describe, expect, it } from 'vitest';
import {
  EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver,
  createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher,
} from './productionCapabilityEffectProviderJournalSpoolCipher';

const digest = (label: string) => digestAgentCanonicalValue({ label });
const response = Object.freeze({
  id: 'response.provider-journal.1',
  status: 'completed',
  output: Object.freeze([
    Object.freeze({ type: 'output_text', text: 'bounded-public-output' }),
  ]),
});
const aad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
  namespaceDigest: digest('namespace'),
  planDigest: digest('plan'),
  repositoryCommit: '0123456789abcdef0123456789abcdef01234567',
  attemptId: 'attempt.provider-journal-spool.1',
  descriptorDigest: digest('descriptor'),
  turnIndex: 0,
  invocationId: 'invocation.provider-journal-spool.1',
  ownerRequestDigest: digest('owner-request'),
  stageDigest: digest('stage'),
  executionSequence: 1,
  dispatchIntentDigest: digest('dispatch'),
  transportReceiptDigest: digest('transport'),
  responseBodyDigest: digestAgentCanonicalValue(response),
  responseProjectionDigest: digest('response-projection'),
  responseDigest: digest('response'),
  normalizedEventSetDigest: digest('normalized-events'),
});
const key = Buffer.alloc(32, 0x5a).toString('base64');
const environment = (name: string): string | undefined =>
  name ===
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME
    ? key
    : undefined;

describe('production capability-effect Provider journal spool cipher', () => {
  it('uses only the fixed journal key authority and round-trips canonical JSON', async () => {
    const cipher =
      createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher(
        {
          keys: new EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver(
            environment
          ),
          randomBytes: (size) => new Uint8Array(size).fill(0x19),
        }
      );

    const envelope = await cipher.encrypt(aad, response);
    expect(envelope).toMatchObject({
      keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
      keyRefDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
      encryptionProfileDigest:
        AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
      aadDigest: digestAgentCanonicalValue(aad),
    });
    expect(envelope.ciphertextBase64Url).not.toContain('bounded-public-output');
    await expect(
      cipher.useDecrypted(envelope, aad, async (value) => value)
    ).resolves.toEqual(response);
  });

  it('fails closed without the dedicated key and on an AAD swap', async () => {
    const missingKeyCipher =
      createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher(
        {
          keys: new EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver(
            () => undefined
          ),
          randomBytes: (size) => new Uint8Array(size).fill(0x23),
        }
      );
    await expect(missingKeyCipher.encrypt(aad, response)).rejects.toMatchObject(
      {
        code: 'G4_RUNNER_SECRET_UNAVAILABLE',
      }
    );

    const cipher =
      createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher(
        {
          keys: new EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver(
            environment
          ),
          randomBytes: (size) => new Uint8Array(size).fill(0x31),
        }
      );
    const envelope = await cipher.encrypt(aad, response);
    const swappedAad = createAgentEvaluationCapabilityEffectProviderSpoolAad({
      ...aad,
      ownerRequestDigest: digest('foreign-owner-request'),
    });
    await expect(
      cipher.useDecrypted(envelope, swappedAad, async (value) => value)
    ).rejects.toMatchObject({ code: 'G4_RUNNER_CAPTURE_FAILED' });
  });
});
