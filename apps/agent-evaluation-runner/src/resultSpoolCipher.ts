import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';
import type {
  AgentEvaluationProviderResultSpoolAad,
  AgentEvaluationProviderResultSpoolEnvelope,
} from '@prodivix/ai';
import {
  createAgentEvaluationProviderResultSpoolEnvelope,
  createAgentEvaluationProviderResultSpoolId,
  digestAgentEvaluationProviderResultSpoolAad,
  isAgentEvaluationProviderResultSpoolAad,
  isAgentEvaluationProviderResultSpoolEnvelope,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';
import type { AgentEvaluationResponseSpoolEncryptionProfile } from './runConfig';

export const AGENT_EVALUATION_RESULT_SPOOL_KEY_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64';
export const AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES =
  16 * 1_024 * 1_024;

export type AgentEvaluationResultSpoolKeyAuthority = Readonly<{
  keyId: string;
  keyVersion: number;
  keyRefDigest: string;
  encryptionProfileDigest: string;
}>;

export type AgentEvaluationResultSpoolPlaintext = Readonly<{
  aad: AgentEvaluationProviderResultSpoolAad;
  canonicalEventBytes: Uint8Array;
}>;

export interface AgentEvaluationResultSpoolKeyResolver {
  readonly authority: AgentEvaluationResultSpoolKeyAuthority;
  use<T>(
    input: Readonly<{ useId: string; purpose: 'encrypt' | 'decrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export interface AgentEvaluationResultSpoolCipher {
  readonly authority: AgentEvaluationResultSpoolKeyAuthority;
  encrypt(
    plaintext: AgentEvaluationResultSpoolPlaintext
  ): Promise<AgentEvaluationProviderResultSpoolEnvelope>;
  useDecrypted<T>(
    envelope: AgentEvaluationProviderResultSpoolEnvelope,
    aad: AgentEvaluationProviderResultSpoolAad,
    callback: (canonicalEventBytes: Uint8Array) => Promise<T>
  ): Promise<T>;
}

const digest = (value: Uint8Array | string): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

const canonicalIdentity = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const exactDigest = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256-[0-9a-f]{64}$/u.test(value);

const canonicalBase64Url = (value: Uint8Array): string =>
  Buffer.from(value)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');

const decodeBase64Url = (
  value: unknown,
  maximumBytes: number,
  label: string
): Uint8Array => {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !/^[A-Za-z0-9_-]+$/u.test(value) ||
    value.length > Math.ceil((maximumBytes * 4) / 3)
  ) {
    throw new TypeError(`${label} must be bounded canonical base64url.`);
  }
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const bytes = new Uint8Array(
    Buffer.from(
      `${value.replaceAll('-', '+').replaceAll('_', '/')}${padding}`,
      'base64'
    )
  );
  if (bytes.byteLength > maximumBytes || canonicalBase64Url(bytes) !== value) {
    bytes.fill(0);
    throw new TypeError(`${label} must be bounded canonical base64url.`);
  }
  return bytes;
};

const assertAad = (value: AgentEvaluationProviderResultSpoolAad): void => {
  if (!isAgentEvaluationProviderResultSpoolAad(value)) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
    );
  }
};

const assertEnvelope = (
  envelope: AgentEvaluationProviderResultSpoolEnvelope
): void => {
  if (!isAgentEvaluationProviderResultSpoolEnvelope(envelope)) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
    );
  }
};

export class EnvironmentAgentEvaluationResultSpoolKeyResolver implements AgentEvaluationResultSpoolKeyResolver {
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;
  readonly authority: AgentEvaluationResultSpoolKeyAuthority;

  constructor(
    input: Readonly<{
      profile: AgentEvaluationResponseSpoolEncryptionProfile;
      environment?: AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv;
    }>
  ) {
    const environment = input.environment ?? process.env;
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
    if (
      input.profile.algorithm !== 'AES-256-GCM' ||
      input.profile.nonceBytes !== 12 ||
      input.profile.authenticationTagBytes !== 16 ||
      input.profile.aadFormat !==
        'prodivix.agent-evaluation-provider-result-spool-aad' ||
      input.profile.aadVersion !== 1 ||
      input.profile.keyEnvironmentName !==
        AGENT_EVALUATION_RESULT_SPOOL_KEY_ENVIRONMENT_NAME ||
      input.profile.maximumPlaintextBytes !==
        AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
      !canonicalIdentity(input.profile.keyId) ||
      !Number.isSafeInteger(input.profile.keyVersion) ||
      input.profile.keyVersion < 1 ||
      !exactDigest(input.profile.keyRefDigest) ||
      !exactDigest(input.profile.encryptionProfileDigest)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    this.authority = Object.freeze({
      keyId: input.profile.keyId,
      keyVersion: input.profile.keyVersion,
      keyRefDigest: input.profile.keyRefDigest,
      encryptionProfileDigest: input.profile.encryptionProfileDigest,
    });
  }

  async use<T>(
    input: Readonly<{ useId: string; purpose: 'encrypt' | 'decrypt' }>,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T> {
    if (
      !canonicalIdentity(input.useId) ||
      !['encrypt', 'decrypt'].includes(input.purpose)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    let source = this.#readEnvironment(
      AGENT_EVALUATION_RESULT_SPOOL_KEY_ENVIRONMENT_NAME
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
        label: 'Evaluation result-spool key',
      });
      if (key.byteLength !== 32) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      return await callback(key);
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
      );
    } finally {
      source = '';
      key?.fill(0);
    }
  }
}

export const createAgentEvaluationAesGcmResultSpoolCipher = (input: {
  keys: AgentEvaluationResultSpoolKeyResolver;
  randomBytes?: (size: number) => Uint8Array;
}): AgentEvaluationResultSpoolCipher => {
  const nonceSource = input.randomBytes ?? nodeRandomBytes;
  return Object.freeze({
    authority: input.keys.authority,
    async encrypt(
      plaintext: AgentEvaluationResultSpoolPlaintext
    ): Promise<AgentEvaluationProviderResultSpoolEnvelope> {
      assertAad(plaintext.aad);
      if (
        !(plaintext.canonicalEventBytes instanceof Uint8Array) ||
        plaintext.canonicalEventBytes.byteLength < 1 ||
        plaintext.canonicalEventBytes.byteLength >
          AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
        digest(plaintext.canonicalEventBytes) !==
          plaintext.aad.normalizedEventSetDigest
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
      const aad = new TextEncoder().encode(canonicalJsonText(plaintext.aad));
      const nonce = new Uint8Array(nonceSource(12));
      try {
        if (nonce.byteLength !== 12) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
          );
        }
        return await input.keys.use(
          {
            useId: `result-spool.encrypt.${plaintext.aad.transportReceiptDigest.slice('sha256-'.length)}`,
            purpose: 'encrypt',
          },
          async (key) => {
            const cipher = createCipheriv('aes-256-gcm', key, nonce, {
              authTagLength: 16,
            });
            cipher.setAAD(aad);
            const ciphertext = Buffer.concat([
              cipher.update(plaintext.canonicalEventBytes),
              cipher.final(),
            ]);
            const tag = cipher.getAuthTag();
            try {
              const envelope = createAgentEvaluationProviderResultSpoolEnvelope(
                {
                  spoolId: createAgentEvaluationProviderResultSpoolId(
                    plaintext.aad
                  ),
                  algorithm: 'aes-256-gcm' as const,
                  keyId: input.keys.authority.keyId,
                  keyVersion: input.keys.authority.keyVersion,
                  keyRefDigest: input.keys.authority.keyRefDigest,
                  encryptionProfileDigest:
                    input.keys.authority.encryptionProfileDigest,
                  nonceBase64Url: canonicalBase64Url(nonce),
                  authenticationTagBase64Url: canonicalBase64Url(tag),
                  ciphertextBase64Url: canonicalBase64Url(ciphertext),
                  aadDigest: digestAgentEvaluationProviderResultSpoolAad(
                    plaintext.aad
                  ),
                }
              );
              assertEnvelope(envelope);
              return envelope;
            } finally {
              ciphertext.fill(0);
              tag.fill(0);
            }
          }
        );
      } finally {
        plaintext.canonicalEventBytes.fill(0);
        aad.fill(0);
        nonce.fill(0);
      }
    },
    async useDecrypted<T>(
      envelope: AgentEvaluationProviderResultSpoolEnvelope,
      aadValue: AgentEvaluationProviderResultSpoolAad,
      callback: (canonicalEventBytes: Uint8Array) => Promise<T>
    ): Promise<T> {
      assertEnvelope(envelope);
      assertAad(aadValue);
      const aad = new TextEncoder().encode(canonicalJsonText(aadValue));
      const nonce = decodeBase64Url(
        envelope.nonceBase64Url,
        12,
        'Result-spool nonce'
      );
      const tag = decodeBase64Url(
        envelope.authenticationTagBase64Url,
        16,
        'Result-spool authentication tag'
      );
      const ciphertext = decodeBase64Url(
        envelope.ciphertextBase64Url,
        AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
        'Result-spool ciphertext'
      );
      let plaintext: Uint8Array | undefined;
      try {
        if (
          digestAgentEvaluationProviderResultSpoolAad(aadValue) !==
            envelope.aadDigest ||
          digest(ciphertext) !== envelope.ciphertextDigest ||
          ciphertext.byteLength !== envelope.ciphertextSizeBytes ||
          envelope.keyId !== input.keys.authority.keyId ||
          envelope.keyVersion !== input.keys.authority.keyVersion ||
          envelope.keyRefDigest !== input.keys.authority.keyRefDigest ||
          envelope.encryptionProfileDigest !==
            input.keys.authority.encryptionProfileDigest
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
          );
        }
        return await input.keys.use(
          {
            useId: `result-spool.decrypt.${aadValue.transportReceiptDigest.slice('sha256-'.length)}`,
            purpose: 'decrypt',
          },
          async (key) => {
            const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
              authTagLength: 16,
            });
            decipher.setAAD(aad);
            decipher.setAuthTag(tag);
            plaintext = new Uint8Array(
              Buffer.concat([decipher.update(ciphertext), decipher.final()])
            );
            if (
              plaintext.byteLength < 1 ||
              plaintext.byteLength >
                AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
              digest(plaintext) !== aadValue.normalizedEventSetDigest
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
              );
            }
            return await callback(plaintext);
          }
        );
      } catch {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      } finally {
        plaintext?.fill(0);
        aad.fill(0);
        nonce.fill(0);
        tag.fill(0);
        ciphertext.fill(0);
      }
    },
  });
};
