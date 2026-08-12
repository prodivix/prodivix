import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  decodeAgentEvaluationCapabilityProbeAdmissionRequest,
  decodeAgentEvaluationCapabilityProbeReferenceBundle,
  type AgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  type AgentEvaluationCapabilityProbeAdmissionRequest,
  type AgentEvaluationCapabilityProbeReferenceEntry,
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

export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_FORMAT =
  'prodivix.agent-evaluation-capability-probe-reference-receipt-ingress' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-reference-receipt-ingress-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_VERSION =
  1 as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_TIMEOUT_MS =
  30_000 as const;

const maximumRequestBytes = 524_288;
const maximumResponseBytes = 65_536;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type AgentEvaluationCapabilityProbeReferenceIngress = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  admissionRequestDigest: CanonicalDigest;
  entry: AgentEvaluationCapabilityProbeReferenceEntry;
  ingressDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeReferenceIngressResponse = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_VERSION;
  ingressDigest: CanonicalDigest;
  admissionRequestDigest: CanonicalDigest;
  kind: AgentEvaluationCapabilityProbeReferenceEntry['kind'];
  ordinal: number;
  receiptDigest: CanonicalDigest;
  replayed: boolean;
}>;

export type AgentEvaluationCapabilityProbeReferenceBundleIngressInput =
  Readonly<{
    request: AgentEvaluationCapabilityProbeAdmissionRequest;
    authorityResult: AgentEvaluationCapabilityProbeAdmissionAuthorityResult;
    ownerImplementationDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    referenceBundle: readonly AgentEvaluationCapabilityProbeReferenceEntry[];
  }>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClientInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    forbiddenCanaries: () => readonly string[];
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    timeoutMs?: number;
  }>;

export interface AgentEvaluationCapabilityProbeReferenceIngressClient {
  storeReferenceBundle(
    input: AgentEvaluationCapabilityProbeReferenceBundleIngressInput
  ): Promise<readonly AgentEvaluationCapabilityProbeReferenceIngressResponse[]>;
}

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

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, value: unknown) => {
      if (key.length > 0 && isUnsafeObjectKey(key)) {
        throw new TypeError('unsafe-key');
      }
      return value;
    }) as unknown;
  } catch {
    return responseInvalid();
  }
};

const exactJsonMediaType = (value: string | null): boolean =>
  value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

const awaitWithAbort = async <T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> => {
  if (signal.aborted) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
    );
  }
  let rejectAbort: ((reason: AgentEvaluationRunnerError) => void) | undefined;
  const aborted = new Promise<T>((_resolve, reject) => {
    rejectAbort = reject;
  });
  const abort = (): void =>
    rejectAbort?.(
      new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
      )
    );
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
    rejectAbort = undefined;
  }
};

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
      const next = await awaitWithAbort(reader.read(), signal);
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
  } catch (caught) {
    await reader.cancel().catch(() => undefined);
    throw safeRunnerError(caught);
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

const scanForbiddenCanaries = (
  value: unknown,
  source: () => readonly string[],
  code:
    | typeof AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
    | typeof AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
): void => {
  try {
    assertProductionAgentEvaluationG3SandboxCanaryClean(value, source);
  } catch {
    throw new AgentEvaluationRunnerError(code);
  }
};

const createIngress = (
  namespaceId: string,
  repositoryCommit: string,
  admissionRequestDigest: CanonicalDigest,
  entry: AgentEvaluationCapabilityProbeReferenceEntry
): AgentEvaluationCapabilityProbeReferenceIngress => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_VERSION,
    namespaceId,
    repositoryCommit,
    admissionRequestDigest,
    entry,
  });
  return Object.freeze({
    ...base,
    ingressDigest: digestAgentCanonicalValue(base),
  });
};

const decodeResponse = (
  value: unknown,
  ingress: AgentEvaluationCapabilityProbeReferenceIngress,
  ordinal: number
): AgentEvaluationCapabilityProbeReferenceIngressResponse => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'ingressDigest',
      'admissionRequestDigest',
      'kind',
      'ordinal',
      'receiptDigest',
      'replayed',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_RESPONSE_FORMAT ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_VERSION ||
    value.ingressDigest !== ingress.ingressDigest ||
    value.admissionRequestDigest !== ingress.admissionRequestDigest ||
    value.kind !== ingress.entry.kind ||
    value.ordinal !== ordinal ||
    value.receiptDigest !== ingress.entry.receiptDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationCapabilityProbeReferenceIngressResponse),
  });
};

export const createEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityProbeReferenceIngressClientInput
  ): AgentEvaluationCapabilityProbeReferenceIngressClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const environmentNamespace = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const environmentCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      environmentNamespace !== options.namespaceId ||
      !isAgentControlIdentity(options.namespaceId) ||
      environmentCommit !== options.repositoryCommit ||
      !exactCommitPattern.test(options.repositoryCommit) ||
      typeof options.forbiddenCanaries !== 'function' ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_INGRESS_TIMEOUT_MS
    ) {
      return unavailable();
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return unavailable();
    const url = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-reference-receipts`;

    const post = async (
      ingress: AgentEvaluationCapabilityProbeReferenceIngress,
      ordinal: number
    ): Promise<AgentEvaluationCapabilityProbeReferenceIngressResponse> => {
      const body = canonicalJsonText(ingress);
      if (
        textEncoder.encode(body).byteLength > maximumRequestBytes ||
        !isAgentCanonicalDigest(ingress.ingressDigest)
      ) {
        return responseInvalid();
      }
      scanForbiddenCanaries(
        ingress,
        options.forbiddenCanaries,
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
      let tokenSource: string | undefined;
      let tokenBytes: Uint8Array | undefined;
      let authorization: string | undefined;
      let headers: Headers | undefined;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        try {
          tokenSource = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
          );
        }
        if (!isAgentEvaluationServiceToken(tokenSource)) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
          );
        }
        tokenBytes = textEncoder.encode(tokenSource);
        tokenSource = undefined;
        const credentialSignatures =
          createCredentialCanarySignatures(tokenBytes);
        if (
          textContainsCredentialCanary(body, credentialSignatures) ||
          textContainsCredentialCanary(url, credentialSignatures)
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
          );
        }
        authorization = `Bearer ${textDecoder.decode(tokenBytes)}`;
        headers = new Headers({
          Accept: 'application/json',
          Authorization: authorization,
          'Content-Type': 'application/json',
          'Idempotency-Key': ingress.ingressDigest,
        });
        let response: Response;
        try {
          response = await awaitWithAbort(
            fetchImplementation(url, {
              method: 'POST',
              headers,
              body,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            }),
            controller.signal
          );
        } catch (caught) {
          throw safeRunnerError(caught);
        } finally {
          headers.delete('Authorization');
          authorization = undefined;
        }
        const responseBytes = await readBoundedBody(
          response,
          controller.signal
        );
        let responseText: string;
        try {
          responseText = textDecoder.decode(responseBytes);
        } catch {
          return responseInvalid();
        } finally {
          responseBytes.fill(0);
        }
        if (textContainsCredentialCanary(responseText, credentialSignatures)) {
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
        if (
          valueContainsCredentialCanary(
            decoded,
            tokenBytes,
            credentialSignatures
          )
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
            response.status
          );
        }
        scanForbiddenCanaries(
          decoded,
          options.forbiddenCanaries,
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
        return decodeResponse(decoded, ingress, ordinal);
      } catch (caught) {
        throw safeRunnerError(caught);
      } finally {
        clearTimeout(timeout);
        headers?.delete('Authorization');
        authorization = undefined;
        tokenSource = undefined;
        tokenBytes?.fill(0);
      }
    };

    return Object.freeze({
      async storeReferenceBundle(
        input: AgentEvaluationCapabilityProbeReferenceBundleIngressInput
      ) {
        const request = decodeAgentEvaluationCapabilityProbeAdmissionRequest(
          input.request
        );
        if (
          request.namespaceId !== options.namespaceId ||
          request.repositoryCommit !== options.repositoryCommit ||
          !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
          !isAgentCanonicalDigest(input.stageDigest)
        ) {
          return responseInvalid();
        }
        const authorityResult =
          decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
            input.authorityResult,
            request,
            input.ownerImplementationDigest,
            input.stageDigest
          );
        const entries = decodeAgentEvaluationCapabilityProbeReferenceBundle(
          input.referenceBundle,
          request,
          authorityResult.probeEvidence,
          input.ownerImplementationDigest
        );
        const responses: AgentEvaluationCapabilityProbeReferenceIngressResponse[] =
          [];
        for (let ordinal = 0; ordinal < entries.length; ordinal += 1) {
          const ingress = createIngress(
            options.namespaceId,
            options.repositoryCommit,
            request.requestDigest,
            entries[ordinal]!
          );
          responses.push(await post(ingress, ordinal));
        }
        return Object.freeze(responses);
      },
    });
  };
