import { createDecipheriv, createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute, normalize } from 'node:path';
import {
  digestAgentCanonicalValue,
  hasExactAgentControlKeys,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  scanAndRedactAgentEvaluationPublicArtifact,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationRestrictedMaterialLocator,
  type AgentEvaluationRestrictedMaterialSource,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';

export const AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64' as const;
export const AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF =
  'secret.g4-model-eval.holdout-envelope.v1' as const;

const envelopeFormat = 'prodivix.g4-protected-material' as const;
const envelopeVersion = 1 as const;
const envelopeAlgorithm = 'AES-256-GCM' as const;
const keyBytes = 32;
const nonceBytes = 12;
const authenticationTagBytes = 16;
const maximumPlaintextBytes = 2_097_152;
const maximumEnvelopeBytes = 3_000_000;
const maximumEnvelopeFiles = 2_048;
const maximumRememberedKeyUses = 100_000;
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

const safeProtectedMaterialError = (
  caught: unknown
): AgentEvaluationRunnerError =>
  caught instanceof AgentEvaluationRunnerError
    ? new AgentEvaluationRunnerError(caught.code, caught.httpStatus)
    : new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
      );

export type AgentEvaluationProtectedMaterialEnvelopeV1 = Readonly<{
  format: typeof envelopeFormat;
  version: typeof envelopeVersion;
  algorithm: typeof envelopeAlgorithm;
  keyRef: typeof AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  caseId: string;
  caseDigest: CanonicalDigest;
  resolverRef: string;
  encryptionPolicyDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  plaintextByteLength: number;
  nonceBase64: string;
  authenticationTagBase64: string;
  ciphertextBase64: string;
}>;

export type AgentEvaluationProtectedMaterialAadInput = Readonly<{
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  caseId: string;
  caseDigest: CanonicalDigest;
  resolverRef: string;
  encryptionPolicyDigest: CanonicalDigest;
  materialDigest: CanonicalDigest;
  plaintextByteLength: number;
}>;

export type AgentEvaluationProtectedMaterialKeyUseRequest = Readonly<{
  keyRef: typeof AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  purpose: 'protected-holdout-decryption';
  runtimeZone: 'server';
  useId: string;
}>;

export interface AgentEvaluationProtectedMaterialKeyResolver {
  use<T>(
    request: AgentEvaluationProtectedMaterialKeyUseRequest,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export type AgentEvaluationProtectedMaterialEnvironmentReader = (
  name: string
) => string | undefined;

export type AgentEvaluationProtectedMaterialEnvelopeFile = Readonly<{
  caseId: string;
  resolverRef: string;
  path: string;
}>;

export type AgentEvaluationProtectedMaterialFileReader = (
  path: string,
  maximumBytes: number
) => Promise<Uint8Array>;

const repositoryCommitIsExact = (value: string): boolean =>
  /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value);

const assertAadInput = (
  input: AgentEvaluationProtectedMaterialAadInput
): void => {
  if (
    !isAgentCanonicalDigest(input.planDigest) ||
    !repositoryCommitIsExact(input.repositoryCommit) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.caseDigest) ||
    !isAgentControlIdentity(input.resolverRef) ||
    !isAgentCanonicalDigest(input.encryptionPolicyDigest) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    !Number.isSafeInteger(input.plaintextByteLength) ||
    input.plaintextByteLength < 1 ||
    input.plaintextByteLength > maximumPlaintextBytes
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
};

/** Exact authenticated identity for a single plan, commit, case, and envelope. */
export const createAgentEvaluationProtectedMaterialAdditionalData = (
  input: AgentEvaluationProtectedMaterialAadInput
): Uint8Array => {
  assertAadInput(input);
  return new TextEncoder().encode(
    canonicalJsonText({
      domain: 'prodivix.g4-protected-material.aes-256-gcm',
      format: envelopeFormat,
      version: envelopeVersion,
      algorithm: envelopeAlgorithm,
      keyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
      ...input,
    })
  );
};

/** Raw-byte identity; whitespace or ciphertext representation drift is visible. */
export const digestAgentEvaluationProtectedMaterialEnvelopeBytes = (
  value: Uint8Array
): CanonicalDigest =>
  `sha256-${createHash('sha256')
    .update(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
    .digest('hex')}`;

const canonicalBase64Bytes = (
  value: string,
  expectedBytes?: number
): Buffer => {
  if (
    value.length === 0 ||
    value.length > Math.ceil((maximumPlaintextBytes * 4) / 3) + 4 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value
    )
  ) {
    throw new Error('invalid');
  }
  const bytes = Buffer.from(value, 'base64');
  if (
    bytes.toString('base64') !== value ||
    (expectedBytes !== undefined && bytes.byteLength !== expectedBytes)
  ) {
    bytes.fill(0);
    throw new Error('invalid');
  }
  return bytes;
};

const keyCanarySignatures = (key: Uint8Array): readonly string[] => {
  const bytes = Buffer.from(key.buffer, key.byteOffset, key.byteLength);
  const base64 = bytes.toString('base64');
  const hex = bytes.toString('hex');
  return Object.freeze([
    base64,
    base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''),
    hex,
    hex.toUpperCase(),
    JSON.stringify([...bytes]),
    [...bytes]
      .map((byte) => `%${byte.toString(16).toUpperCase().padStart(2, '0')}`)
      .join(''),
  ]);
};

const protectedMaterialByteArraySignatures = (
  canaries: readonly string[]
): readonly string[] =>
  Object.freeze(
    canaries.map((canary) =>
      JSON.stringify([...new TextEncoder().encode(canary)])
    )
  );

const serializedContains = (
  value: unknown,
  signatures: readonly string[]
): boolean => {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
    return (
      typeof serialized === 'string' &&
      signatures.some((signature) => serialized!.includes(signature))
    );
  } catch {
    return true;
  } finally {
    serialized = undefined;
  }
};

/** Reads the fixed server slot for one callback and clears its byte buffer. */
export class EnvironmentAgentEvaluationProtectedMaterialKeyResolver implements AgentEvaluationProtectedMaterialKeyResolver {
  readonly #planDigest: CanonicalDigest;
  readonly #repositoryCommit: string;
  readonly #readEnvironment: AgentEvaluationProtectedMaterialEnvironmentReader;
  readonly #used = new Set<string>();

  constructor(input: {
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?:
      | Readonly<Record<string, string | undefined>>
      | AgentEvaluationProtectedMaterialEnvironmentReader;
  }) {
    if (
      !isAgentCanonicalDigest(input.planDigest) ||
      !repositoryCommitIsExact(input.repositoryCommit)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    this.#planDigest = input.planDigest;
    this.#repositoryCommit = input.repositoryCommit;
    const environment = input.environment ?? process.env;
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  async use<T>(
    request: AgentEvaluationProtectedMaterialKeyUseRequest,
    callback: (key: Uint8Array) => Promise<T>
  ): Promise<T> {
    if (
      request.keyRef !== AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF ||
      request.planDigest !== this.#planDigest ||
      request.repositoryCommit !== this.#repositoryCommit ||
      request.purpose !== 'protected-holdout-decryption' ||
      request.runtimeZone !== 'server' ||
      !isAgentControlIdentity(request.useId) ||
      this.#used.has(request.useId) ||
      this.#used.size >= maximumRememberedKeyUses ||
      typeof callback !== 'function'
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    this.#used.add(request.useId);
    let source: string | undefined = this.#readEnvironment(
      AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV
    );
    let key: Buffer | undefined;
    try {
      if (
        typeof source !== 'string' ||
        source.length !== 44 ||
        source !== source.trim() ||
        source.includes('\0') ||
        source.includes('\r') ||
        source.includes('\n')
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      try {
        key = canonicalBase64Bytes(source, keyBytes);
      } catch {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      const result = await callback(key);
      if (serializedContains(result, keyCanarySignatures(key))) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return result;
    } catch (caught) {
      throw safeProtectedMaterialError(caught);
    } finally {
      key?.fill(0);
      source = undefined;
    }
  }
}

const defaultFileReader: AgentEvaluationProtectedMaterialFileReader = async (
  path,
  maximumBytes
) => {
  const handle = await open(path, 'r');
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      !Number.isSafeInteger(stat.size) ||
      stat.size < 1 ||
      stat.size > maximumBytes
    ) {
      throw new Error('invalid');
    }
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < stat.size) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        stat.size - offset,
        offset
      );
      if (bytesRead < 1) {
        bytes.fill(0);
        throw new Error('invalid');
      }
      offset += bytesRead;
    }
    const finalStat = await handle.stat();
    if (!finalStat.isFile() || finalStat.size !== stat.size) {
      bytes.fill(0);
      throw new Error('invalid');
    }
    return bytes;
  } finally {
    await handle.close();
  }
};

const parseEnvelope = (
  bytes: Uint8Array
): AgentEvaluationProtectedMaterialEnvelopeV1 => {
  let text: string | undefined;
  try {
    text = utf8Decoder.decode(bytes);
    const value: unknown = JSON.parse(text);
    if (
      !hasExactAgentControlKeys(value, [
        'format',
        'version',
        'algorithm',
        'keyRef',
        'planDigest',
        'repositoryCommit',
        'caseId',
        'caseDigest',
        'resolverRef',
        'encryptionPolicyDigest',
        'materialDigest',
        'plaintextByteLength',
        'nonceBase64',
        'authenticationTagBase64',
        'ciphertextBase64',
      ]) ||
      value.format !== envelopeFormat ||
      value.version !== envelopeVersion ||
      value.algorithm !== envelopeAlgorithm ||
      value.keyRef !== AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF ||
      !isAgentCanonicalDigest(value.planDigest) ||
      typeof value.repositoryCommit !== 'string' ||
      !repositoryCommitIsExact(value.repositoryCommit) ||
      !isAgentControlIdentity(value.caseId) ||
      !isAgentCanonicalDigest(value.caseDigest) ||
      !isAgentControlIdentity(value.resolverRef) ||
      !isAgentCanonicalDigest(value.encryptionPolicyDigest) ||
      !isAgentCanonicalDigest(value.materialDigest) ||
      typeof value.plaintextByteLength !== 'number' ||
      !Number.isSafeInteger(value.plaintextByteLength) ||
      Number(value.plaintextByteLength) < 1 ||
      Number(value.plaintextByteLength) > maximumPlaintextBytes ||
      typeof value.nonceBase64 !== 'string' ||
      typeof value.authenticationTagBase64 !== 'string' ||
      typeof value.ciphertextBase64 !== 'string' ||
      canonicalJsonText(value) !== text
    ) {
      throw new Error('invalid');
    }
    return value as AgentEvaluationProtectedMaterialEnvelopeV1;
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
    );
  } finally {
    text = undefined;
  }
};

const scrubJson = (value: unknown, seen = new Set<object>()): void => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      scrubJson(value[index], seen);
      value[index] = null;
    }
    return;
  }
  for (const key of Object.keys(value)) {
    const record = value as Record<string, unknown>;
    scrubJson(record[key], seen);
    record[key] = null;
  }
};

const revocableMaterialView = (
  material: AgentEvaluationCaseMaterial
): Readonly<{
  value: AgentEvaluationCaseMaterial;
  revoke: () => void;
}> => {
  const proxies = new WeakMap<object, object>();
  const revocations: Array<() => void> = [];
  const wrap = (value: unknown): unknown => {
    if (value === null || typeof value !== 'object') return value;
    const found = proxies.get(value);
    if (found) return found;
    const revocable = Proxy.revocable(value, {
      get(target, property, receiver) {
        return wrap(Reflect.get(target, property, receiver));
      },
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
        return descriptor && 'value' in descriptor
          ? { ...descriptor, value: wrap(descriptor.value) }
          : descriptor;
      },
      preventExtensions() {
        return false;
      },
    });
    proxies.set(value, revocable.proxy);
    revocations.push(revocable.revoke);
    return revocable.proxy;
  };
  return Object.freeze({
    value: wrap(material) as AgentEvaluationCaseMaterial,
    revoke: () => {
      for (const revoke of revocations.reverse()) revoke();
      revocations.length = 0;
    },
  });
};

function validateMaterialBinding(
  material: unknown,
  envelope: AgentEvaluationProtectedMaterialEnvelopeV1,
  locator: AgentEvaluationRestrictedMaterialLocator
): asserts material is AgentEvaluationCaseMaterial {
  if (
    !isPlainObject(material) ||
    material.caseId !== locator.caseId ||
    material.caseDigest !== locator.caseDigest ||
    material.access !== 'protected-holdout' ||
    material.caseDefinitionDigest !== locator.caseDefinitionDigest ||
    material.expectedAuthorityDigest !== locator.expectedAuthorityDigest ||
    material.gradingPolicyDigest !== locator.gradingPolicyDigest ||
    material.materialDigest !== envelope.materialDigest ||
    !Array.isArray(material.protectedLeakCanaries) ||
    material.protectedLeakCanaries.length < 1 ||
    material.protectedLeakCanaries.some(
      (value) => typeof value !== 'string' || value.length < 8
    )
  ) {
    throw new Error('invalid');
  }
  const { materialDigest, ...base } = material;
  if (digestAgentCanonicalValue(base) !== materialDigest) {
    throw new Error('invalid');
  }
}

/**
 * Reads only predeclared absolute files. Protected bytes and parsed material
 * live for one callback and are cleared/revoked on every outcome.
 */
export class FileAgentEvaluationProtectedMaterialSource implements AgentEvaluationRestrictedMaterialSource {
  readonly #planDigest: CanonicalDigest;
  readonly #repositoryCommit: string;
  readonly #files: ReadonlyMap<
    string,
    AgentEvaluationProtectedMaterialEnvelopeFile
  >;
  readonly #keyResolver: AgentEvaluationProtectedMaterialKeyResolver;
  readonly #readFile: AgentEvaluationProtectedMaterialFileReader;
  #keyUseSequence = 0;

  constructor(input: {
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    files: readonly AgentEvaluationProtectedMaterialEnvelopeFile[];
    environment?:
      | Readonly<Record<string, string | undefined>>
      | AgentEvaluationProtectedMaterialEnvironmentReader;
    readFile?: AgentEvaluationProtectedMaterialFileReader;
  }) {
    if (
      !isAgentCanonicalDigest(input.planDigest) ||
      !repositoryCommitIsExact(input.repositoryCommit) ||
      input.files.length < 1 ||
      input.files.length > maximumEnvelopeFiles ||
      new Set(input.files.map(({ caseId }) => caseId)).size !==
        input.files.length
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    for (const file of input.files) {
      if (
        !isAgentControlIdentity(file.caseId) ||
        !isAgentControlIdentity(file.resolverRef) ||
        !isAbsolute(file.path) ||
        normalize(file.path) !== file.path ||
        file.path.includes('\0')
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
    }
    this.#planDigest = input.planDigest;
    this.#repositoryCommit = input.repositoryCommit;
    this.#files = new Map(input.files.map((file) => [file.caseId, file]));
    this.#keyResolver =
      new EnvironmentAgentEvaluationProtectedMaterialKeyResolver({
        planDigest: input.planDigest,
        repositoryCommit: input.repositoryCommit,
        ...(input.environment ? { environment: input.environment } : {}),
      });
    this.#readFile = input.readFile ?? defaultFileReader;
  }

  async use<T>(
    locator: AgentEvaluationRestrictedMaterialLocator,
    callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
  ): Promise<T> {
    const file = this.#files.get(locator.caseId);
    const { locatorDigest, ...locatorBase } = locator;
    if (
      locator.access !== 'protected-holdout' ||
      digestAgentCanonicalValue(locatorBase) !== locatorDigest ||
      !file ||
      file.resolverRef !== locator.resolverRef ||
      typeof callback !== 'function' ||
      this.#keyUseSequence >= maximumRememberedKeyUses
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    let envelopeBytes: Uint8Array | undefined;
    let envelope: AgentEvaluationProtectedMaterialEnvelopeV1 | undefined;
    try {
      envelopeBytes = await this.#readFile(file.path, maximumEnvelopeBytes);
      if (
        !(envelopeBytes instanceof Uint8Array) ||
        envelopeBytes.byteLength < 1 ||
        envelopeBytes.byteLength > maximumEnvelopeBytes ||
        digestAgentEvaluationProtectedMaterialEnvelopeBytes(envelopeBytes) !==
          locator.encryptedMaterialDigest
      ) {
        throw new Error('invalid');
      }
      envelope = parseEnvelope(envelopeBytes);
      if (
        envelope.planDigest !== this.#planDigest ||
        envelope.repositoryCommit !== this.#repositoryCommit ||
        envelope.caseId !== locator.caseId ||
        envelope.caseDigest !== locator.caseDigest ||
        envelope.resolverRef !== locator.resolverRef ||
        envelope.encryptionPolicyDigest !== locator.encryptionPolicyDigest
      ) {
        throw new Error('invalid');
      }
      this.#keyUseSequence += 1;
      const useId = `holdout-key-use.${this.#keyUseSequence}`;
      return await this.#keyResolver.use(
        {
          keyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
          planDigest: this.#planDigest,
          repositoryCommit: this.#repositoryCommit,
          purpose: 'protected-holdout-decryption',
          runtimeZone: 'server',
          useId,
        },
        async (key) => {
          let nonce: Buffer | undefined;
          let authenticationTag: Buffer | undefined;
          let ciphertext: Buffer | undefined;
          let plaintext: Buffer | undefined;
          let plaintextText: string | undefined;
          let material: AgentEvaluationCaseMaterial | undefined;
          let view: ReturnType<typeof revocableMaterialView> | undefined;
          try {
            if (!(key instanceof Uint8Array) || key.byteLength !== keyBytes) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
              );
            }
            nonce = canonicalBase64Bytes(envelope!.nonceBase64, nonceBytes);
            authenticationTag = canonicalBase64Bytes(
              envelope!.authenticationTagBase64,
              authenticationTagBytes
            );
            ciphertext = canonicalBase64Bytes(envelope!.ciphertextBase64);
            if (ciphertext.byteLength !== envelope!.plaintextByteLength) {
              throw new Error('invalid');
            }
            const decipher = createDecipheriv(
              'aes-256-gcm',
              Buffer.from(key.buffer, key.byteOffset, key.byteLength),
              nonce
            );
            const aad = createAgentEvaluationProtectedMaterialAdditionalData({
              planDigest: envelope!.planDigest,
              repositoryCommit: envelope!.repositoryCommit,
              caseId: envelope!.caseId,
              caseDigest: envelope!.caseDigest,
              resolverRef: envelope!.resolverRef,
              encryptionPolicyDigest: envelope!.encryptionPolicyDigest,
              materialDigest: envelope!.materialDigest,
              plaintextByteLength: envelope!.plaintextByteLength,
            });
            try {
              decipher.setAAD(
                Buffer.from(aad.buffer, aad.byteOffset, aad.byteLength)
              );
              decipher.setAuthTag(authenticationTag);
              plaintext = Buffer.concat([
                decipher.update(ciphertext),
                decipher.final(),
              ]);
            } finally {
              aad.fill(0);
            }
            if (plaintext.byteLength !== envelope!.plaintextByteLength) {
              throw new Error('invalid');
            }
            plaintextText = utf8Decoder.decode(plaintext);
            const parsed: unknown = JSON.parse(plaintextText);
            if (canonicalJsonText(parsed) !== plaintextText) {
              throw new Error('invalid');
            }
            validateMaterialBinding(parsed, envelope!, locator);
            material = parsed;
            view = revocableMaterialView(material);
            const result = await callback(view.value);
            const scan = scanAndRedactAgentEvaluationPublicArtifact(
              'artifact',
              result,
              { protectedMaterialCanaries: material.protectedLeakCanaries }
            );
            if (
              !scan.safe ||
              serializedContains(result, [
                ...keyCanarySignatures(key),
                ...protectedMaterialByteArraySignatures(
                  material.protectedLeakCanaries
                ),
              ])
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
              );
            }
            return result;
          } catch (caught) {
            throw safeProtectedMaterialError(caught);
          } finally {
            view?.revoke();
            if (material) scrubJson(material);
            material = undefined;
            plaintextText = undefined;
            plaintext?.fill(0);
            ciphertext?.fill(0);
            authenticationTag?.fill(0);
            nonce?.fill(0);
            key.fill(0);
          }
        }
      );
    } catch (caught) {
      throw safeProtectedMaterialError(caught);
    } finally {
      envelope = undefined;
      envelopeBytes?.fill(0);
    }
  }
}
