import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes as nodeRandomBytes,
} from 'node:crypto';
import {
  createAgentEvaluationEndpointSmokeResultSpoolId,
  createAgentEvaluationProviderResultSpoolEnvelope,
  digestAgentEvaluationEndpointSmokeResultSpoolAad,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationEndpointSmokeResultSpoolAad,
  isAgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationEndpointSmokeResultSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  decodeCanonicalBase64,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import type {
  AgentEvaluationResultSpoolKeyAuthority,
  AgentEvaluationResultSpoolKeyResolver,
} from './resultSpoolCipher';
import {
  AGENT_EVALUATION_RESULT_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
} from './resultSpoolCipher';
import type { AgentEvaluationEndpointSmokeResultSpoolCipher } from './smokeQualifier';
import type { AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile } from './runConfig';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';

const digestBytes = (value: Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

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

const assertProfile = (
  profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile,
  authority?: AgentEvaluationResultSpoolKeyAuthority
): void => {
  if (
    profile.format !== 'prodivix.g4-endpoint-smoke-response-spool-encryption' ||
    profile.version !== 1 ||
    profile.algorithm !== 'AES-256-GCM' ||
    profile.nonceBytes !== 12 ||
    profile.authenticationTagBytes !== 16 ||
    profile.aadFormat !==
      'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad' ||
    profile.aadVersion !== 1 ||
    profile.keyEnvironmentName !==
      AGENT_EVALUATION_RESULT_SPOOL_KEY_ENVIRONMENT_NAME ||
    profile.maximumPlaintextBytes !==
      AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
    !isAgentControlIdentity(profile.keyId) ||
    !Number.isSafeInteger(profile.keyVersion) ||
    profile.keyVersion < 1 ||
    !isAgentCanonicalDigest(profile.keyRefDigest) ||
    !isAgentCanonicalDigest(profile.encryptionProfileDigest) ||
    !isAgentCanonicalDigest(profile.encryptionPolicyDigest) ||
    !isAgentCanonicalDigest(profile.namespaceDigest) ||
    (authority !== undefined &&
      (authority.keyId !== profile.keyId ||
        authority.keyVersion !== profile.keyVersion ||
        authority.keyRefDigest !== profile.keyRefDigest ||
        authority.encryptionProfileDigest !== profile.encryptionProfileDigest))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
};

export class EnvironmentAgentEvaluationEndpointSmokeResultSpoolKeyResolver implements AgentEvaluationResultSpoolKeyResolver {
  readonly authority: AgentEvaluationResultSpoolKeyAuthority;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;

  constructor(
    input: Readonly<{
      profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
      environment?: AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv;
    }>
  ) {
    assertProfile(input.profile);
    const environment = input.environment ?? process.env;
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
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
      !isAgentControlIdentity(input.useId) ||
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
        label: 'Evaluation endpoint-smoke result-spool key',
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

export const createAgentEvaluationAesGcmEndpointSmokeResultSpoolCipher = (
  input: Readonly<{
    keys: AgentEvaluationResultSpoolKeyResolver;
    randomBytes?: (size: number) => Uint8Array;
  }>
): AgentEvaluationEndpointSmokeResultSpoolCipher => {
  const nonceSource = input.randomBytes ?? nodeRandomBytes;
  return Object.freeze({
    async encrypt({
      profile,
      aad,
      canonicalResultBytes,
    }: Parameters<
      AgentEvaluationEndpointSmokeResultSpoolCipher['encrypt']
    >[0]) {
      assertProfile(profile, input.keys.authority);
      if (
        !isAgentEvaluationEndpointSmokeResultSpoolAad(aad) ||
        !(canonicalResultBytes instanceof Uint8Array) ||
        canonicalResultBytes.byteLength < 1 ||
        canonicalResultBytes.byteLength > profile.maximumPlaintextBytes
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
      const aadBytes = new TextEncoder().encode(canonicalJsonText(aad));
      const nonce = new Uint8Array(nonceSource(profile.nonceBytes));
      try {
        if (nonce.byteLength !== profile.nonceBytes) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
          );
        }
        return await input.keys.use(
          {
            useId: `endpoint-smoke-result-spool.encrypt.${aad.transportReceiptDigest.slice('sha256-'.length)}`,
            purpose: 'encrypt',
          },
          async (key) => {
            const cipher = createCipheriv('aes-256-gcm', key, nonce, {
              authTagLength: profile.authenticationTagBytes,
            });
            cipher.setAAD(aadBytes);
            const ciphertext = Buffer.concat([
              cipher.update(canonicalResultBytes),
              cipher.final(),
            ]);
            const tag = cipher.getAuthTag();
            try {
              return createAgentEvaluationProviderResultSpoolEnvelope({
                spoolId: createAgentEvaluationEndpointSmokeResultSpoolId(aad),
                algorithm: 'aes-256-gcm',
                keyId: profile.keyId,
                keyVersion: profile.keyVersion,
                keyRefDigest: profile.keyRefDigest,
                encryptionProfileDigest: profile.encryptionProfileDigest,
                nonceBase64Url: canonicalBase64Url(nonce),
                authenticationTagBase64Url: canonicalBase64Url(tag),
                ciphertextBase64Url: canonicalBase64Url(ciphertext),
                aadDigest:
                  digestAgentEvaluationEndpointSmokeResultSpoolAad(aad),
              });
            } finally {
              ciphertext.fill(0);
              tag.fill(0);
            }
          }
        );
      } finally {
        aadBytes.fill(0);
        nonce.fill(0);
      }
    },

    async useDecrypted<T>(
      {
        profile,
        aad,
        envelope,
      }: Readonly<{
        profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
        aad: Parameters<
          AgentEvaluationEndpointSmokeResultSpoolCipher['encrypt']
        >[0]['aad'];
        envelope: AgentEvaluationProviderResultSpoolEnvelope;
      }>,
      callback: (canonicalResultBytes: Uint8Array) => Promise<T>
    ): Promise<T> {
      assertProfile(profile, input.keys.authority);
      if (
        !isAgentEvaluationEndpointSmokeResultSpoolAad(aad) ||
        !isAgentEvaluationProviderResultSpoolEnvelope(envelope) ||
        envelope.spoolId !==
          createAgentEvaluationEndpointSmokeResultSpoolId(aad) ||
        envelope.aadDigest !==
          digestAgentEvaluationEndpointSmokeResultSpoolAad(aad) ||
        envelope.keyId !== profile.keyId ||
        envelope.keyVersion !== profile.keyVersion ||
        envelope.keyRefDigest !== profile.keyRefDigest ||
        envelope.encryptionProfileDigest !== profile.encryptionProfileDigest ||
        envelope.ciphertextSizeBytes > profile.maximumPlaintextBytes
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
      const aadBytes = new TextEncoder().encode(canonicalJsonText(aad));
      const nonce = decodeBase64Url(
        envelope.nonceBase64Url,
        profile.nonceBytes,
        'Endpoint-smoke result-spool nonce'
      );
      const tag = decodeBase64Url(
        envelope.authenticationTagBase64Url,
        profile.authenticationTagBytes,
        'Endpoint-smoke result-spool authentication tag'
      );
      const ciphertext = decodeBase64Url(
        envelope.ciphertextBase64Url,
        profile.maximumPlaintextBytes,
        'Endpoint-smoke result-spool ciphertext'
      );
      let plaintext: Uint8Array | undefined;
      try {
        if (
          ciphertext.byteLength !== envelope.ciphertextSizeBytes ||
          digestBytes(ciphertext) !== envelope.ciphertextDigest
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
          );
        }
        return await input.keys.use(
          {
            useId: `endpoint-smoke-result-spool.decrypt.${aad.transportReceiptDigest.slice('sha256-'.length)}`,
            purpose: 'decrypt',
          },
          async (key) => {
            const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
              authTagLength: profile.authenticationTagBytes,
            });
            decipher.setAAD(aadBytes);
            decipher.setAuthTag(tag);
            plaintext = new Uint8Array(
              Buffer.concat([decipher.update(ciphertext), decipher.final()])
            );
            if (
              plaintext.byteLength < 1 ||
              plaintext.byteLength > profile.maximumPlaintextBytes
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
        aadBytes.fill(0);
        nonce.fill(0);
        tag.fill(0);
        ciphertext.fill(0);
      }
    },
  });
};

export type CreateEnvironmentAgentEvaluationEndpointSmokeResultSpoolCipherInput =
  Readonly<{
    environment?: AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv;
    randomBytes?: (size: number) => Uint8Array;
  }>;

/** Resolves the frozen endpoint-smoke key authority from each operation profile. */
export const createEnvironmentAgentEvaluationEndpointSmokeResultSpoolCipher = (
  input: CreateEnvironmentAgentEvaluationEndpointSmokeResultSpoolCipherInput = {}
): AgentEvaluationEndpointSmokeResultSpoolCipher => {
  const cipherFor = (
    profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile
  ): AgentEvaluationEndpointSmokeResultSpoolCipher =>
    createAgentEvaluationAesGcmEndpointSmokeResultSpoolCipher({
      keys: new EnvironmentAgentEvaluationEndpointSmokeResultSpoolKeyResolver({
        profile,
        ...(input.environment ? { environment: input.environment } : {}),
      }),
      ...(input.randomBytes ? { randomBytes: input.randomBytes } : {}),
    });
  return Object.freeze({
    encrypt(
      operation: Parameters<
        AgentEvaluationEndpointSmokeResultSpoolCipher['encrypt']
      >[0]
    ) {
      return cipherFor(operation.profile).encrypt(operation);
    },
    useDecrypted<T>(
      operation: Readonly<{
        profile: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
        aad: AgentEvaluationEndpointSmokeResultSpoolAad;
        envelope: AgentEvaluationProviderResultSpoolEnvelope;
      }>,
      callback: (canonicalResultBytes: Uint8Array) => Promise<T>
    ): Promise<T> {
      return cipherFor(operation.profile).useDecrypted(operation, callback);
    },
  });
};
