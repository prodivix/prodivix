import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentEvaluationProductionCapabilityProbeEvidence,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  digestAgentEvaluationCapabilityProbeAdmissionStage,
  digestAgentEvaluationCapabilityProbeDispatchAck,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
} from './capabilityProbeAdmissionClient';
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

export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_CLIENT_TIMEOUT_MS =
  125_000 as const;

const maximumResponseBytes = 262_144;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationCapabilityProbeAdmissionResponse = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT;
  version: 1;
  requestDigest: CanonicalDigest;
  probeEvidence: AgentEvaluationProductionCapabilityProbeEvidence;
  ownerImplementationDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  admissionReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeAdmissionHttpClient = Readonly<{
  admit(
    request: AgentEvaluationCapabilityProbeAdmissionRequest
  ): Promise<AgentEvaluationCapabilityProbeAdmissionResponse>;
}>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClientInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const invalid = (): never => {
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

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return value;
    }) as unknown;
  } catch {
    return invalid();
  }
};

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

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
        await reader.cancel().catch(() => undefined);
        return unavailable();
      }
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return invalid();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

export const decodeAgentEvaluationCapabilityProbeAdmissionResponse = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest
): AgentEvaluationCapabilityProbeAdmissionResponse => {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest(request);
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'probeEvidence',
      'ownerImplementationDigest',
      'ownerAdmissionDigest',
      'stageDigest',
      'dispatchAckDigest',
      'admissionReceiptDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_RESPONSE_FORMAT ||
    value.version !== 1 ||
    value.requestDigest !== request.requestDigest ||
    !isAgentCanonicalDigest(value.ownerImplementationDigest) ||
    !isAgentCanonicalDigest(value.stageDigest) ||
    !isAgentCanonicalDigest(value.dispatchAckDigest) ||
    !isAgentCanonicalDigest(value.admissionReceiptDigest)
  ) {
    return invalid();
  }
  const ownerImplementationDigest = value.ownerImplementationDigest;
  const stageDigest = digestAgentEvaluationCapabilityProbeAdmissionStage(
    request,
    ownerImplementationDigest
  );
  if (value.stageDigest !== stageDigest) return invalid();
  let result: ReturnType<
    typeof decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult
  >;
  try {
    result = decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
      Object.freeze({
        probeEvidence: value.probeEvidence,
        ownerAdmissionDigest: value.ownerAdmissionDigest,
      }),
      request,
      ownerImplementationDigest,
      stageDigest
    );
  } catch {
    return invalid();
  }
  const response =
    value as unknown as AgentEvaluationCapabilityProbeAdmissionResponse;
  const { admissionReceiptDigest, ...base } = response;
  if (
    response.dispatchAckDigest !==
      digestAgentEvaluationCapabilityProbeDispatchAck(
        request,
        result,
        ownerImplementationDigest,
        stageDigest
      ) ||
    admissionReceiptDigest !== digestAgentCanonicalValue(base)
  ) {
    return invalid();
  }
  return Object.freeze({
    ...response,
    probeEvidence: result.probeEvidence,
  });
};

export const createEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityProbeAdmissionHttpClientInput
  ): AgentEvaluationCapabilityProbeAdmissionHttpClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const configuredNamespace = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const configuredCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_CLIENT_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      configuredNamespace !== options.namespaceId ||
      configuredCommit !== options.repositoryCommit ||
      !isAgentControlIdentity(options.namespaceId) ||
      !/^[a-f0-9]{40}$/u.test(options.repositoryCommit) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_CLIENT_TIMEOUT_MS
    ) {
      return unavailable();
    }
    const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-admissions`;
    const fetchImplementation = options.fetch ?? fetch;
    return Object.freeze({
      async admit(requestInput) {
        const request =
          decodeAgentEvaluationCapabilityProbeAdmissionRequest(requestInput);
        if (
          request.namespaceId !== options.namespaceId ||
          request.repositoryCommit !== options.repositoryCommit
        ) {
          return unavailable();
        }
        const requestText = canonicalJsonText(request);
        let credentialSource: string | undefined = read(
          AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
        );
        let credential: Uint8Array | undefined;
        try {
          if (!isAgentEvaluationServiceToken(credentialSource)) {
            return unavailable();
          }
          credential = textEncoder.encode(credentialSource);
          const signatures = createCredentialCanarySignatures(credential);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          const headers = new Headers({
            Accept: 'application/json',
            Authorization: `Bearer ${textDecoder.decode(credential)}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.requestDigest,
          });
          try {
            const response = await fetchImplementation(endpoint, {
              method: 'POST',
              headers,
              body: requestText,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            });
            headers.delete('Authorization');
            const mediaType = response.headers
              .get('Content-Type')
              ?.split(';', 1)[0]
              ?.trim()
              .toLowerCase();
            if (!response.ok || mediaType !== 'application/json') {
              return unavailable();
            }
            const bytes = await readBoundedBody(response, controller.signal);
            const responseText = textDecoder.decode(bytes);
            if (textContainsCredentialCanary(responseText, signatures)) {
              return invalid();
            }
            const decoded = parseSafeJson(responseText);
            if (
              responseText !== canonicalJsonText(decoded) ||
              valueContainsCredentialCanary(decoded, credential, signatures)
            ) {
              return invalid();
            }
            return decodeAgentEvaluationCapabilityProbeAdmissionResponse(
              decoded,
              request
            );
          } catch (caught) {
            if (caught instanceof AgentEvaluationRunnerError) throw caught;
            if (controller.signal.aborted) return unavailable();
            throw safeRunnerError(caught);
          } finally {
            clearTimeout(timeout);
            headers.delete('Authorization');
          }
        } finally {
          credential?.fill(0);
          credential = undefined;
          credentialSource = undefined;
        }
      },
    });
  };
