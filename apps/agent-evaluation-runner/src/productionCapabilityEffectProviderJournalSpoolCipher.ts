import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';
import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES,
  createAgentEvaluationCapabilityEffectProviderSpoolRef,
  createAgentEvaluationProviderResultSpoolEnvelope,
  digestAgentCanonicalValue,
  digestAgentEvaluationCapabilityEffectProviderSpoolAad,
  isAgentEvaluationCapabilityEffectProviderSpoolAad,
  isAgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationCapabilityEffectProviderSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentJsonValue,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export type AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyAuthority =
  Readonly<{
    keyId: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID;
    keyVersion: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION;
    keyRefDigest: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST;
    encryptionProfileDigest: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST;
  }>;

export interface AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver {
  readonly authority: AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyAuthority;
  use<T>(
    input: Readonly<{
      useId: string;
      purpose: 'encrypt' | 'decrypt';
    }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export interface AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher {
  readonly authority: AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyAuthority;
  encrypt(
    aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
    sealedResponseJson: AgentJsonValue
  ): Promise<AgentEvaluationProviderResultSpoolEnvelope>;
  useDecrypted<T>(
    envelope: AgentEvaluationProviderResultSpoolEnvelope,
    aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
    callback: (sealedResponseJson: AgentJsonValue) => Promise<T>
  ): Promise<T>;
}

const keyAuthority = Object.freeze({
  keyId: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ID,
  keyVersion: AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_VERSION,
  keyRefDigest:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_REF_DIGEST,
  encryptionProfileDigest:
    AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_ENCRYPTION_PROFILE_DIGEST,
});
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const useIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u;

const fail = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
  );
};

const canonicalBase64Url = (value: Uint8Array): string =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

const decodeCanonicalBase64Url = (
  value: string,
  maximumBytes: number,
  exactBytes?: number
): Uint8Array => {
  if (
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    value.length % 4 === 1 ||
    value.length > Math.ceil((maximumBytes * 4) / 3)
  ) {
    return fail();
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const bytes = new Uint8Array(
    Buffer.from(
      `${value.replaceAll('-', '+').replaceAll('_', '/')}${padding}`,
      'base64'
    )
  );
  if (
    bytes.byteLength > maximumBytes ||
    (exactBytes !== undefined && bytes.byteLength !== exactBytes) ||
    canonicalBase64Url(bytes) !== value
  ) {
    bytes.fill(0);
    return fail();
  }
  return bytes;
};

const parseCanonicalJson = (bytes: Uint8Array): AgentJsonValue => {
  try {
    const text = decoder.decode(bytes);
    const value = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as AgentJsonValue;
    return canonicalJsonText(value) === text ? value : fail();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return fail();
  }
};

const assertAadEnvelopeBinding = (
  aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
  envelope: AgentEvaluationProviderResultSpoolEnvelope
): void => {
  if (
    !isAgentEvaluationCapabilityEffectProviderSpoolAad(aad) ||
    !isAgentEvaluationProviderResultSpoolEnvelope(envelope) ||
    envelope.spoolId !==
      createAgentEvaluationCapabilityEffectProviderSpoolRef(aad) ||
    envelope.aadDigest !==
      digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad) ||
    envelope.algorithm !== 'aes-256-gcm' ||
    envelope.keyId !== keyAuthority.keyId ||
    envelope.keyVersion !== keyAuthority.keyVersion ||
    envelope.keyRefDigest !== keyAuthority.keyRefDigest ||
    envelope.encryptionProfileDigest !== keyAuthority.encryptionProfileDigest ||
    envelope.ciphertextSizeBytes >
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
  ) {
    return fail();
  }
};

export class EnvironmentAgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver implements AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver {
  readonly authority = keyAuthority;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;

  constructor(
    environment:
      AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv = process.env
  ) {
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  async use<T>(
    input: Readonly<{ useId: string; purpose: 'encrypt' | 'decrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T> {
    if (
      !useIdPattern.test(input.useId) ||
      !['encrypt', 'decrypt'].includes(input.purpose) ||
      typeof callback !== 'function'
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    let source = this.#readEnvironment(
      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_KEY_ENVIRONMENT_NAME
    );
    let key: Uint8Array | undefined;
    try {
      if (typeof source !== 'string') {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      key = decodeCanonicalBase64(source, {
        maximumBytes: 32,
        label: 'Capability-effect Provider journal spool key',
      });
      if (key.byteLength !== 32) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      return await callback(key);
    } finally {
      source = '';
      key?.fill(0);
    }
  }
}

export const createAgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher =
  (input: {
    keys: AgentEvaluationProductionCapabilityEffectProviderJournalSpoolKeyResolver;
    randomBytes?: (size: number) => Uint8Array;
  }): AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher => {
    if (
      input.keys.authority.keyId !== keyAuthority.keyId ||
      input.keys.authority.keyVersion !== keyAuthority.keyVersion ||
      input.keys.authority.keyRefDigest !== keyAuthority.keyRefDigest ||
      input.keys.authority.encryptionProfileDigest !==
        keyAuthority.encryptionProfileDigest
    ) {
      return fail();
    }
    const nonceSource = input.randomBytes ?? nodeRandomBytes;
    return Object.freeze({
      authority: keyAuthority,
      async encrypt(
        aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
        sealedResponseJson: AgentJsonValue
      ): Promise<AgentEvaluationProviderResultSpoolEnvelope> {
        if (
          !isAgentEvaluationCapabilityEffectProviderSpoolAad(aad) ||
          digestAgentCanonicalValue(sealedResponseJson) !==
            aad.responseBodyDigest
        ) {
          return fail();
        }
        const plaintext = encoder.encode(canonicalJsonText(sealedResponseJson));
        const aadBytes = encoder.encode(canonicalJsonText(aad));
        const nonce = new Uint8Array(nonceSource(12));
        try {
          if (
            plaintext.byteLength < 1 ||
            plaintext.byteLength >
              AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES ||
            nonce.byteLength !== 12
          ) {
            return fail();
          }
          return await input.keys.use(
            {
              useId: `provider-journal.encrypt.${aad.executionSequence}.${aad.transportReceiptDigest.slice('sha256-'.length)}`,
              purpose: 'encrypt',
            },
            async (key) => {
              const cipher = createCipheriv('aes-256-gcm', key, nonce, {
                authTagLength: 16,
              });
              cipher.setAAD(aadBytes);
              const ciphertext = Buffer.concat([
                cipher.update(plaintext),
                cipher.final(),
              ]);
              const tag = cipher.getAuthTag();
              try {
                return createAgentEvaluationProviderResultSpoolEnvelope({
                  spoolId:
                    createAgentEvaluationCapabilityEffectProviderSpoolRef(aad),
                  algorithm: 'aes-256-gcm',
                  keyId: keyAuthority.keyId,
                  keyVersion: keyAuthority.keyVersion,
                  keyRefDigest: keyAuthority.keyRefDigest,
                  encryptionProfileDigest: keyAuthority.encryptionProfileDigest,
                  nonceBase64Url: canonicalBase64Url(nonce),
                  authenticationTagBase64Url: canonicalBase64Url(tag),
                  ciphertextBase64Url: canonicalBase64Url(ciphertext),
                  aadDigest:
                    digestAgentEvaluationCapabilityEffectProviderSpoolAad(aad),
                });
              } finally {
                ciphertext.fill(0);
                tag.fill(0);
              }
            }
          );
        } finally {
          plaintext.fill(0);
          aadBytes.fill(0);
          nonce.fill(0);
        }
      },
      async useDecrypted<T>(
        envelope: AgentEvaluationProviderResultSpoolEnvelope,
        aad: AgentEvaluationCapabilityEffectProviderSpoolAad,
        callback: (sealedResponseJson: AgentJsonValue) => Promise<T>
      ): Promise<T> {
        assertAadEnvelopeBinding(aad, envelope);
        const aadBytes = encoder.encode(canonicalJsonText(aad));
        const nonce = decodeCanonicalBase64Url(envelope.nonceBase64Url, 12, 12);
        const tag = decodeCanonicalBase64Url(
          envelope.authenticationTagBase64Url,
          16,
          16
        );
        const ciphertext = decodeCanonicalBase64Url(
          envelope.ciphertextBase64Url,
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
        );
        let plaintext: Uint8Array | undefined;
        try {
          return await input.keys.use(
            {
              useId: `provider-journal.decrypt.${aad.executionSequence}.${aad.transportReceiptDigest.slice('sha256-'.length)}`,
              purpose: 'decrypt',
            },
            async (key) => {
              const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
                authTagLength: 16,
              });
              decipher.setAAD(aadBytes);
              decipher.setAuthTag(tag);
              plaintext = new Uint8Array(
                Buffer.concat([decipher.update(ciphertext), decipher.final()])
              );
              const value = parseCanonicalJson(plaintext);
              if (digestAgentCanonicalValue(value) !== aad.responseBodyDigest) {
                return fail();
              }
              return callback(value);
            }
          );
        } catch (caught) {
          if (caught instanceof AgentEvaluationRunnerError) throw caught;
          return fail();
        } finally {
          plaintext?.fill(0);
          aadBytes.fill(0);
          nonce.fill(0);
          tag.fill(0);
          ciphertext.fill(0);
        }
      },
    });
  };
