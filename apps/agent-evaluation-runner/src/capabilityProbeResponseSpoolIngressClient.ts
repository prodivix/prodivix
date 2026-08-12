import { createHash } from 'node:crypto';

import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type AgentCapabilityProbeProgram,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
} from './capabilityProbeAdmissionClient';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_FORMAT =
  'prodivix.agent-evaluation-capability-probe-response-spool-ingress' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-response-spool-ingress-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_TIMEOUT_MS =
  30_000 as const;

const maximumCiphertextBytes = 262_144;
const maximumRequestBytes = 524_288;
const maximumResponseBytes = 65_536;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const standardBase64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type ProbePhase =
  AgentCapabilityProbeProgram['providerRequestIntent']['requestPhases'][number];

export type AgentEvaluationCapabilityProbeResponseSpoolIngress = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  admissionRequestDigest: CanonicalDigest;
  phase: ProbePhase;
  sequence: number;
  spoolRef: string;
  responseDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
  ciphertextDigest: CanonicalDigest;
  ciphertextBase64: string;
  ciphertextByteLength: number;
  aadDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  spooledAt: string;
  expiresAt: string;
  ingressDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeResponseSpoolIngressResponse =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_VERSION;
    ingressDigest: CanonicalDigest;
    admissionRequestDigest: CanonicalDigest;
    phase: ProbePhase;
    sequence: number;
    spoolRef: string;
    ciphertextDigest: CanonicalDigest;
    replayed: boolean;
  }>;

export type StoreAgentEvaluationCapabilityProbeResponseSpoolInput = Readonly<{
  request: AgentEvaluationCapabilityProbeAdmissionRequest;
  phase: ProbePhase;
  sequence: number;
  spoolRef: string;
  responseDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
  ciphertextBase64: string;
  aadDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  spooledAt: string;
  expiresAt: string;
}>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClientInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    forbiddenCanaries: () => readonly string[];
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }>;

export interface AgentEvaluationCapabilityProbeResponseSpoolIngressClient {
  storeResponseSpool(
    input: StoreAgentEvaluationCapabilityProbeResponseSpoolInput
  ): Promise<AgentEvaluationCapabilityProbeResponseSpoolIngressResponse>;
}

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionCompositionUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const exactRecord = (
  value: unknown,
  required: readonly string[]
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => !isUnsafeObjectKey(key) && required.includes(key)
  );

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const sha256Digest = (value: Uint8Array): CanonicalDigest =>
  `sha256-${createHash('sha256').update(value).digest('hex')}` as CanonicalDigest;

const decodeStandardBase64 = (source: string): Uint8Array => {
  if (
    typeof source !== 'string' ||
    source.length < 4 ||
    !standardBase64Pattern.test(source)
  ) {
    return responseInvalid();
  }
  const bytes = Buffer.from(source, 'base64');
  if (
    bytes.byteLength < 1 ||
    bytes.byteLength > maximumCiphertextBytes ||
    bytes.toString('base64') !== source
  ) {
    bytes.fill(0);
    return responseInvalid();
  }
  return bytes;
};

const createIngress = (
  options: Readonly<{ namespaceId: string; repositoryCommit: string }>,
  input: StoreAgentEvaluationCapabilityProbeResponseSpoolInput
): AgentEvaluationCapabilityProbeResponseSpoolIngress => {
  const request = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
    input.request
  );
  if (
    request.namespaceId !== options.namespaceId ||
    request.repositoryCommit !== options.repositoryCommit ||
    !request.probeProgram.providerRequestIntent.requestPhases.includes(
      input.phase
    ) ||
    !Number.isSafeInteger(input.sequence) ||
    input.sequence < 0 ||
    !isAgentControlIdentity(input.spoolRef) ||
    ![
      input.responseDigest,
      input.transportReceiptDigest,
      input.envelopeDigest,
      input.aadDigest,
      input.encryptionProfileDigest,
      input.keyRefDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(input.spooledAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) < Date.parse(request.minimumExpiresAt) ||
    Date.parse(input.spooledAt) > Date.parse(input.expiresAt)
  ) {
    return responseInvalid();
  }
  const ciphertext = decodeStandardBase64(input.ciphertextBase64);
  try {
    const base = Object.freeze({
      format: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_VERSION,
      namespaceId: options.namespaceId,
      repositoryCommit: options.repositoryCommit,
      admissionRequestDigest: request.requestDigest,
      phase: input.phase,
      sequence: input.sequence,
      spoolRef: input.spoolRef,
      responseDigest: input.responseDigest,
      transportReceiptDigest: input.transportReceiptDigest,
      envelopeDigest: input.envelopeDigest,
      ciphertextDigest: sha256Digest(ciphertext),
      ciphertextBase64: input.ciphertextBase64,
      ciphertextByteLength: ciphertext.byteLength,
      aadDigest: input.aadDigest,
      encryptionProfileDigest: input.encryptionProfileDigest,
      keyRefDigest: input.keyRefDigest,
      spooledAt: input.spooledAt,
      expiresAt: input.expiresAt,
    });
    const ingress = Object.freeze({
      ...base,
      ingressDigest: digestAgentCanonicalValue(base),
    });
    if (
      textEncoder.encode(canonicalJsonText(ingress)).byteLength >
      maximumRequestBytes
    ) {
      return responseInvalid();
    }
    return ingress;
  } finally {
    ciphertext.fill(0);
  }
};

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key.length > 0 && isUnsafeObjectKey(key)) throw new TypeError();
      return value;
    }) as unknown;
  } catch {
    return responseInvalid();
  }
};

const exactJsonMediaType = (value: string | null): boolean =>
  value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      if (signal.aborted) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
        );
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};

const decodeResponse = (
  value: unknown,
  ingress: AgentEvaluationCapabilityProbeResponseSpoolIngress
): AgentEvaluationCapabilityProbeResponseSpoolIngressResponse => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'ingressDigest',
      'admissionRequestDigest',
      'phase',
      'sequence',
      'spoolRef',
      'ciphertextDigest',
      'replayed',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_RESPONSE_FORMAT ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_VERSION ||
    value.ingressDigest !== ingress.ingressDigest ||
    value.admissionRequestDigest !== ingress.admissionRequestDigest ||
    value.phase !== ingress.phase ||
    value.sequence !== ingress.sequence ||
    value.spoolRef !== ingress.spoolRef ||
    value.ciphertextDigest !== ingress.ciphertextDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationCapabilityProbeResponseSpoolIngressResponse),
  });
};

export const createEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityProbeResponseSpoolIngressClientInput
  ): AgentEvaluationCapabilityProbeResponseSpoolIngressClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace) !==
        options.namespaceId ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit) !==
        options.repositoryCommit ||
      !isAgentControlIdentity(options.namespaceId) ||
      !exactCommitPattern.test(options.repositoryCommit) ||
      typeof options.forbiddenCanaries !== 'function' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs >
        AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_INGRESS_TIMEOUT_MS
    ) {
      return unavailable();
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return unavailable();
    const url = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-response-spools`;

    return Object.freeze({
      async storeResponseSpool(
        input: StoreAgentEvaluationCapabilityProbeResponseSpoolInput
      ) {
        const ingress = createIngress(options, input);
        const body = canonicalJsonText(ingress);
        try {
          assertProductionAgentEvaluationG3SandboxCanaryClean(
            ingress,
            options.forbiddenCanaries
          );
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
          );
        }
        let token: Uint8Array | undefined;
        let headers: Headers | undefined;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const tokenSource = read(
            AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
          );
          if (!isAgentEvaluationServiceToken(tokenSource)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
            );
          }
          token = textEncoder.encode(tokenSource);
          const signatures = createCredentialCanarySignatures(token);
          if (
            textContainsCredentialCanary(body, signatures) ||
            textContainsCredentialCanary(url, signatures)
          ) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
            );
          }
          headers = new Headers({
            Accept: 'application/json',
            Authorization: `Bearer ${textDecoder.decode(token)}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': ingress.ingressDigest,
          });
          let response: Response;
          try {
            response = await fetchImplementation(url, {
              method: 'POST',
              headers,
              body,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            });
          } catch (caught) {
            throw safeRunnerError(caught);
          } finally {
            headers.delete('Authorization');
          }
          const responseBytes = await readBoundedBody(
            response,
            controller.signal
          );
          let responseText = '';
          try {
            responseText = textDecoder.decode(responseBytes);
          } catch {
            return responseInvalid();
          } finally {
            responseBytes.fill(0);
          }
          if (textContainsCredentialCanary(responseText, signatures)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          if (!response.ok) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
              response.status
            );
          }
          if (!exactJsonMediaType(response.headers.get('content-type'))) {
            return responseInvalid();
          }
          const decoded = parseSafeJson(responseText);
          if (valueContainsCredentialCanary(decoded, token, signatures)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          try {
            assertProductionAgentEvaluationG3SandboxCanaryClean(
              decoded,
              options.forbiddenCanaries
            );
          } catch {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              response.status
            );
          }
          return decodeResponse(decoded, ingress);
        } catch (caught) {
          throw safeRunnerError(caught);
        } finally {
          clearTimeout(timeout);
          headers?.delete('Authorization');
          token?.fill(0);
        }
      },
    }) satisfies AgentEvaluationCapabilityProbeResponseSpoolIngressClient;
  };
