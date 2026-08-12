import { isPlainObject } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationEnvironment,
  type AgentEvaluationNativeProtocol,
} from './config';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import { containsAsciiControlCharacter } from './textSafety';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const maximumCredentialBytes = 16 * 1_024;
const maximumRememberedUses = 100_000;

export type AgentProviderSecretUseRequest = Readonly<{
  protocolFamily: AgentEvaluationNativeProtocol;
  providerConfigurationId: string;
  secretRef: string;
  purpose:
    | 'capability-probe-resource'
    | 'hosted-retrieval-resource-lifecycle'
    | 'model-invocation';
  runtimeZone: 'server' | 'native';
  useId: string;
}>;

export interface AgentProviderSecretResolver {
  use<T>(
    request: AgentProviderSecretUseRequest,
    consumer: (material: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export type AgentEvaluationEnvironmentReader = (
  name: string
) => string | undefined;

const canonicalIdentity = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const readCredential = (
  readEnvironment: AgentEvaluationEnvironmentReader,
  environmentName: string
): Uint8Array => {
  let source: string | undefined = readEnvironment(environmentName);
  try {
    if (
      typeof source !== 'string' ||
      source.length < 8 ||
      source !== source.trim() ||
      containsAsciiControlCharacter(source)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
      );
    }
    const material = textEncoder.encode(source);
    if (material.byteLength > maximumCredentialBytes) {
      material.fill(0);
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
      );
    }
    return material;
  } finally {
    source = undefined;
  }
};

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const bytesToBase64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString('base64');

/** Exact raw and common encoded signatures used only inside the secret callback. */
export const createCredentialCanarySignatures = (
  material: Uint8Array
): readonly string[] => {
  const value = textDecoder.decode(material);
  const base64 = bytesToBase64(material);
  const base64Url = base64.replaceAll('+', '-').replaceAll('/', '_');
  const hex = bytesToHex(material);
  const percentEncoded = [...material]
    .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
    .join('');
  return Object.freeze([
    ...new Set([
      value,
      JSON.stringify(value).slice(1, -1),
      encodeURIComponent(value),
      percentEncoded,
      percentEncoded.toUpperCase(),
      hex,
      hex.toUpperCase(),
      base64,
      base64Url,
      base64Url.replace(/=+$/u, ''),
    ]),
  ]);
};

export const textContainsCredentialCanary = (
  value: string,
  signatures: readonly string[]
): boolean => signatures.some((signature) => value.includes(signature));

const bytesContain = (
  source: ArrayLike<number>,
  credential: Uint8Array
): boolean => {
  if (source.length < credential.byteLength) return false;
  for (
    let offset = 0;
    offset <= source.length - credential.byteLength;
    offset += 1
  ) {
    let equal = true;
    for (let index = 0; index < credential.byteLength; index += 1) {
      if (source[offset + index] !== credential[index]) {
        equal = false;
        break;
      }
    }
    if (equal) return true;
  }
  return false;
};

/** Deep decoded-value scan that also blocks copied credential byte material. */
export const valueContainsCredentialCanary = (
  value: unknown,
  credential: Uint8Array,
  signatures: readonly string[] = createCredentialCanarySignatures(credential)
): boolean => {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): boolean => {
    nodes += 1;
    if (nodes > 100_000 || depth > 48) return true;
    if (typeof candidate === 'string') {
      return textContainsCredentialCanary(candidate, signatures);
    }
    if (
      candidate === null ||
      candidate === undefined ||
      typeof candidate === 'boolean' ||
      typeof candidate === 'number'
    ) {
      return false;
    }
    if (typeof candidate !== 'object' || seen.has(candidate)) return true;
    seen.add(candidate);
    try {
      if (ArrayBuffer.isView(candidate)) {
        try {
          return bytesContain(
            new Uint8Array(
              candidate.buffer,
              candidate.byteOffset,
              candidate.byteLength
            ),
            credential
          );
        } catch {
          return true;
        }
      }
      if (candidate instanceof ArrayBuffer) {
        try {
          return bytesContain(new Uint8Array(candidate), credential);
        } catch {
          return true;
        }
      }
      if (
        Array.isArray(candidate) &&
        candidate.every(
          (entry) =>
            typeof entry === 'number' &&
            Number.isInteger(entry) &&
            entry >= 0 &&
            entry <= 255
        ) &&
        bytesContain(candidate as number[], credential)
      ) {
        return true;
      }
      if (!Array.isArray(candidate) && !isPlainObject(candidate)) return true;
      if (Object.getOwnPropertySymbols(candidate).length > 0) return true;
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (key === 'length' && Array.isArray(candidate)) continue;
        if (
          textContainsCredentialCanary(key, signatures) ||
          !('value' in descriptor) ||
          visit(descriptor.value, depth + 1)
        ) {
          return true;
        }
      }
      return false;
    } catch {
      return true;
    } finally {
      seen.delete(candidate);
    }
  };
  return visit(value, 0);
};

/**
 * Release-worker resolver. It knows only the three fixed environment slots,
 * never caches their values, and zeroes the callback buffer on every outcome.
 */
export class EnvironmentAgentProviderSecretResolver implements AgentProviderSecretResolver {
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;
  readonly #used = new Set<string>();

  constructor(
    environment:
      | AgentEvaluationEnvironment
      | AgentEvaluationEnvironmentReader = process.env
  ) {
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  async use<T>(
    request: AgentProviderSecretUseRequest,
    consumer: (material: Uint8Array) => Promise<T>
  ): Promise<T> {
    const definition =
      AGENT_EVALUATION_PROVIDER_DEFINITIONS[request.protocolFamily];
    if (
      !definition ||
      request.providerConfigurationId !== definition.providerConfigurationId ||
      request.secretRef !== definition.secretRef ||
      (request.purpose !== 'model-invocation' &&
        request.purpose !== 'capability-probe-resource' &&
        request.purpose !== 'hosted-retrieval-resource-lifecycle') ||
      (request.runtimeZone !== 'server' && request.runtimeZone !== 'native') ||
      !canonicalIdentity(request.useId) ||
      typeof consumer !== 'function' ||
      this.#used.has(request.useId) ||
      this.#used.size >= maximumRememberedUses
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }

    let material: Uint8Array;
    try {
      material = readCredential(
        this.#readEnvironment,
        definition.secretEnvironmentName
      );
    } catch (caught) {
      if (caught instanceof AgentEvaluationRunnerError) throw caught;
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
      );
    }
    this.#used.add(request.useId);
    try {
      let result: T;
      try {
        result = await consumer(material);
      } catch (caught) {
        throw safeRunnerError(caught);
      }
      const signatures = createCredentialCanarySignatures(material);
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(result);
      } catch {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
        );
      }
      if (
        valueContainsCredentialCanary(result, material, signatures) ||
        (typeof serialized === 'string' &&
          textContainsCredentialCanary(serialized, signatures))
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return result;
    } finally {
      material.fill(0);
    }
  }
}
