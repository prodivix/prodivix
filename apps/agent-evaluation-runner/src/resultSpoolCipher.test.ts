import { readFileSync } from 'node:fs';
import {
  createAgentEvaluationProviderResultSpoolAad,
  createAgentEvaluationProviderResultSpoolId,
  digestAgentCanonicalBytes,
  digestAgentCanonicalValue,
  isAgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationProviderResultSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { AGENT_EVALUATION_RUNNER_ERROR_CODES } from './errors';
import {
  createAgentEvaluationAesGcmResultSpoolCipher,
  EnvironmentAgentEvaluationResultSpoolKeyResolver,
} from './resultSpoolCipher';
import { decodeAgentEvaluationFrozenRunConfig } from './runConfig';
import { materializeAgentEvaluationTestProductionRunConfig } from './runConfig.fixture';

const examplePath = new URL(
  '../../../specs/evaluation/g4-real-model-evaluation.example.json',
  import.meta.url
);
const exactCommit = '0123456789abcdef0123456789abcdef01234567';
const config = decodeAgentEvaluationFrozenRunConfig(
  materializeAgentEvaluationTestProductionRunConfig(
    JSON.parse(readFileSync(examplePath, 'utf8')) as Record<string, unknown>
  ),
  {
    clock: () => '2026-08-08T00:00:00.000Z',
    expectedRepositoryCommit: exactCommit,
  }
);
const keyBase64 = Buffer.alloc(32, 7).toString('base64');

const digest = (label: string): string => digestAgentCanonicalValue({ label });

const aadFor = (
  canonicalEventBytes: Uint8Array,
  overrides: Partial<AgentEvaluationProviderResultSpoolAad> = {}
): AgentEvaluationProviderResultSpoolAad =>
  createAgentEvaluationProviderResultSpoolAad({
    namespaceDigest: config.responseSpoolEncryption.namespaceDigest,
    planDigest: config.plan.planDigest,
    repositoryCommit: exactCommit,
    attemptId: 'attempt.result-spool-test',
    descriptorDigest: digest('descriptor'),
    turnIndex: 1,
    invocationId: 'invocation.result-spool-test.1',
    dispatchIntentDigest: digest('dispatch-intent'),
    transportReceiptDigest: digest('transport-receipt'),
    responseBodyDigest: digest('response-body'),
    normalizedEventSetDigest: digestAgentCanonicalBytes(canonicalEventBytes),
    ...overrides,
  });

const envelopeAuthority = (
  envelope: AgentEvaluationProviderResultSpoolEnvelope
) =>
  Object.freeze({
    algorithm: envelope.algorithm,
    keyId: envelope.keyId,
    keyVersion: envelope.keyVersion,
    keyRefDigest: envelope.keyRefDigest,
    encryptionProfileDigest: envelope.encryptionProfileDigest,
    nonceBase64Url: envelope.nonceBase64Url,
    authenticationTagBase64Url: envelope.authenticationTagBase64Url,
    ciphertextDigest: envelope.ciphertextDigest,
    ciphertextSizeBytes: envelope.ciphertextSizeBytes,
    aadDigest: envelope.aadDigest,
  });

describe('agent evaluation encrypted provider-result spool', () => {
  it('matches the frozen cross-package spool identity vector', () => {
    expect(
      createAgentEvaluationProviderResultSpoolId({
        namespaceDigest: digest('namespace'),
        planDigest: digest('plan'),
        repositoryCommit: 'a'.repeat(40),
        attemptId: 'attempt.1',
        descriptorDigest: digest('descriptor'),
        turnIndex: 0,
        invocationId: 'invocation.1',
      })
    ).toBe(
      'evaluation-result-spool:9422d876796646b49cb1d49520d1a4f5fd96c7b50ee44351a3bf339de74c942d'
    );
  });

  it('matches the shared authority digest and zeroizes callback-bound material', async () => {
    const resolver = new EnvironmentAgentEvaluationResultSpoolKeyResolver({
      profile: config.responseSpoolEncryption,
      environment: {
        PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: keyBase64,
      },
    });
    let keyReference: Uint8Array | undefined;
    await resolver.use(
      { useId: 'result-spool.key-zeroization', purpose: 'encrypt' },
      async (key) => {
        keyReference = key;
        expect(key).toEqual(new Uint8Array(32).fill(7));
      }
    );
    expect(keyReference).toBeDefined();
    expect(keyReference?.every((byte) => byte === 0)).toBe(true);

    const cipher = createAgentEvaluationAesGcmResultSpoolCipher({
      keys: resolver,
      randomBytes: (size) => new Uint8Array(size).fill(3),
    });
    const events = Object.freeze([
      Object.freeze({ type: 'response.created', response: { id: 'resp_1' } }),
      Object.freeze({ type: 'response.completed', response: { id: 'resp_1' } }),
    ]);
    const sourceBytes = new TextEncoder().encode(canonicalJsonText(events));
    const aad = aadFor(sourceBytes);
    const envelope = await cipher.encrypt({
      aad,
      canonicalEventBytes: sourceBytes,
    });

    expect(sourceBytes.every((byte) => byte === 0)).toBe(true);
    expect(isAgentEvaluationProviderResultSpoolEnvelope(envelope)).toBe(true);
    expect(envelope.envelopeDigest).toBe(
      digestAgentCanonicalValue(envelopeAuthority(envelope))
    );
    expect(envelope.ciphertextBase64Url).not.toContain('resp_1');

    let plaintextReference: Uint8Array | undefined;
    const recovered = await cipher.useDecrypted(
      envelope,
      aad,
      async (canonicalEventBytes) => {
        plaintextReference = canonicalEventBytes;
        return JSON.parse(
          new TextDecoder().decode(canonicalEventBytes)
        ) as unknown;
      }
    );
    expect(recovered).toEqual(events);
    expect(plaintextReference).toBeDefined();
    expect(plaintextReference?.every((byte) => byte === 0)).toBe(true);
  });

  it('fails closed when AAD or ciphertext authority is changed', async () => {
    const resolver = new EnvironmentAgentEvaluationResultSpoolKeyResolver({
      profile: config.responseSpoolEncryption,
      environment: {
        PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64: keyBase64,
      },
    });
    const cipher = createAgentEvaluationAesGcmResultSpoolCipher({
      keys: resolver,
      randomBytes: (size) => new Uint8Array(size).fill(5),
    });
    const sourceBytes = new TextEncoder().encode(
      canonicalJsonText([{ type: 'response.completed' }])
    );
    const aad = aadFor(sourceBytes);
    const envelope = await cipher.encrypt({
      aad,
      canonicalEventBytes: sourceBytes,
    });
    const mismatchedAad = createAgentEvaluationProviderResultSpoolAad({
      ...aad,
      responseBodyDigest: digest('different-response-body'),
    });

    await expect(
      cipher.useDecrypted(envelope, mismatchedAad, async () => undefined)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });

    const first = envelope.ciphertextBase64Url[0];
    const tampered = Object.freeze({
      ...envelope,
      ciphertextBase64Url: `${first === 'A' ? 'B' : 'A'}${envelope.ciphertextBase64Url.slice(1)}`,
    }) as AgentEvaluationProviderResultSpoolEnvelope;
    await expect(
      cipher.useDecrypted(tampered, aad, async () => undefined)
    ).rejects.toMatchObject({
      code: AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
    });
  });
});
