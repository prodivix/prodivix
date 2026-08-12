import {
  createCipheriv,
  createDecipheriv,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';

import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES,
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef,
  digestAgentCanonicalValue,
  digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  isAgentEvaluationProviderResultSpoolEnvelope,
  isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  isAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
  type AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority,
  type AgentJsonValue,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile,
  type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile,
} from './runConfig';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleEncryptedSpool =
  Readonly<{
    envelope: AgentEvaluationProviderResultSpoolEnvelope;
    envelopeAuthority: AgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority;
  }>;

export interface AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver {
  use<T>(
    input: Readonly<{ useId: string; purpose: 'decrypt' | 'encrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export interface AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher {
  encrypt(
    aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
    normalizedResponse: AgentJsonValue
  ): Promise<AgentEvaluationHostedRetrievalRuntimeResourceLifecycleEncryptedSpool>;
  useDecrypted<T>(
    encrypted: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleEncryptedSpool,
    aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
    callback: (normalizedResponse: AgentJsonValue) => Promise<T>
  ): Promise<T>;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const useIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,511}$/u;

const fail = (
  code: (typeof AGENT_EVALUATION_RUNNER_ERROR_CODES)[keyof typeof AGENT_EVALUATION_RUNNER_ERROR_CODES] = AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
): never => {
  throw new AgentEvaluationRunnerError(code);
};

const base64Url = (value: Uint8Array): string =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

const decodeBase64Url = (
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
    base64Url(bytes) !== value
  ) {
    bytes.fill(0);
    return fail();
  }
  return bytes;
};

const decodePlaintext = (value: Uint8Array): AgentJsonValue => {
  try {
    const text = decoder.decode(value);
    const parsed = JSON.parse(text, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return entry;
    }) as AgentJsonValue;
    return canonicalJsonText(parsed) === text ? parsed : fail();
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return fail();
  }
};

export class EnvironmentAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver implements AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver {
  readonly #read: AgentEvaluationEnvironmentReader;

  constructor(
    environment:
      AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv = process.env
  ) {
    this.#read =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  async use<T>(
    input: Readonly<{ useId: string; purpose: 'decrypt' | 'encrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T> {
    if (
      !useIdPattern.test(input.useId) ||
      !['decrypt', 'encrypt'].includes(input.purpose) ||
      typeof callback !== 'function'
    ) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied);
    }
    let source = this.#read(
      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ENVIRONMENT_NAME
    );
    let key: Uint8Array | undefined;
    try {
      if (typeof source !== 'string') {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
      }
      key = decodeCanonicalBase64(source, {
        maximumBytes: 32,
        label: 'Hosted lifecycle result-spool key',
      });
      if (key.byteLength !== 32) {
        return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable);
      }
      return await callback(key);
    } finally {
      source = '';
      key?.fill(0);
    }
  }
}

export const createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher =
  (input: {
    profile: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile;
    keys: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolKeyResolver;
    randomBytes?: (size: number) => Uint8Array;
  }): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolCipher => {
    if (
      !sameCanonicalJson(
        input.profile,
        createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile()
      )
    ) {
      return fail(AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid);
    }
    const randomBytes = input.randomBytes ?? nodeRandomBytes;
    return Object.freeze({
      async encrypt(
        aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
        normalizedResponse: AgentJsonValue
      ) {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad) ||
          digestAgentCanonicalValue(normalizedResponse) !== aad.plaintextDigest
        ) {
          return fail();
        }
        const plaintext = encoder.encode(canonicalJsonText(normalizedResponse));
        const aadBytes = encoder.encode(canonicalJsonText(aad));
        const nonce = new Uint8Array(randomBytes(12));
        try {
          if (
            plaintext.byteLength < 1 ||
            plaintext.byteLength >
              AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES ||
            nonce.byteLength !== 12
          ) {
            return fail();
          }
          return await input.keys.use(
            {
              useId: `hosted-lifecycle.encrypt.${aad.operation}.${aad.transportReceiptSetDigest.slice('sha256-'.length)}`,
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
                const envelope =
                  createAgentEvaluationProviderResultSpoolEnvelope({
                    spoolId:
                      createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(
                        aad
                      ),
                    algorithm: 'aes-256-gcm',
                    keyId:
                      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
                    keyVersion:
                      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
                    keyRefDigest:
                      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
                    encryptionProfileDigest:
                      AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
                    nonceBase64Url: base64Url(nonce),
                    authenticationTagBase64Url: base64Url(tag),
                    ciphertextBase64Url: base64Url(ciphertext),
                    aadDigest:
                      digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(
                        aad
                      ),
                  });
                const envelopeAuthority =
                  createAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority(
                    {
                      spoolRef: envelope.spoolId,
                      algorithm: envelope.algorithm,
                      keyId:
                        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_ID,
                      keyVersion:
                        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_VERSION,
                      keyRefDigest: envelope.keyRefDigest,
                      encryptionProfileDigest: envelope.encryptionProfileDigest,
                      nonceBase64Url: envelope.nonceBase64Url,
                      authenticationTagBase64Url:
                        envelope.authenticationTagBase64Url,
                      ciphertextDigest: envelope.ciphertextDigest,
                      ciphertextSizeBytes: envelope.ciphertextSizeBytes,
                      aadDigest: envelope.aadDigest,
                      plaintextDigest: aad.plaintextDigest,
                    }
                  );
                return Object.freeze({ envelope, envelopeAuthority });
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
        encrypted: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleEncryptedSpool,
        aad: AgentHostedRetrievalRuntimeResourceLifecycleSpoolAad,
        callback: (normalizedResponse: AgentJsonValue) => Promise<T>
      ): Promise<T> {
        if (
          !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad) ||
          !isAgentEvaluationProviderResultSpoolEnvelope(encrypted.envelope) ||
          !isAgentHostedRetrievalRuntimeResourceLifecycleSpoolEnvelopeAuthority(
            encrypted.envelopeAuthority
          ) ||
          encrypted.envelope.spoolId !==
            createAgentHostedRetrievalRuntimeResourceLifecycleSpoolRef(aad) ||
          encrypted.envelope.aadDigest !==
            digestAgentHostedRetrievalRuntimeResourceLifecycleSpoolAad(aad) ||
          encrypted.envelope.envelopeDigest !==
            encrypted.envelopeAuthority.envelopeDigest ||
          encrypted.envelopeAuthority.plaintextDigest !== aad.plaintextDigest ||
          typeof callback !== 'function'
        ) {
          return fail();
        }
        const aadBytes = encoder.encode(canonicalJsonText(aad));
        const nonce = decodeBase64Url(
          encrypted.envelope.nonceBase64Url,
          12,
          12
        );
        const tag = decodeBase64Url(
          encrypted.envelope.authenticationTagBase64Url,
          16,
          16
        );
        const ciphertext = decodeBase64Url(
          encrypted.envelope.ciphertextBase64Url,
          AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_CIPHERTEXT_BYTES
        );
        let plaintext: Uint8Array | undefined;
        try {
          return await input.keys.use(
            {
              useId: `hosted-lifecycle.decrypt.${aad.operation}.${aad.transportReceiptSetDigest.slice('sha256-'.length)}`,
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
              const value = decodePlaintext(plaintext);
              if (digestAgentCanonicalValue(value) !== aad.plaintextDigest) {
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
