import {
  createAgentEvaluationAttemptAuthorityResponseProjection,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentEvaluationCapabilityPreEffectIntent,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import { assertProductionAgentEvaluationG3SandboxCanaryClean } from './controlledWorkspaceG3CellAdapter';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
  AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS,
} from './ledgerClient';
import {
  createAgentEvaluationAttemptAuthorityDispatchAckDigest,
  createAgentEvaluationAttemptAuthorityDispatchStageDigest,
  type AgentEvaluationOwnerAuthorityRequest,
} from './productionOwnerAuthoritySidecar';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-result-ingress' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-result-ingress-response' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-attempt-authority-result-ingress-receipt' as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_VERSION =
  1 as const;
export const AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_TIMEOUT_MS =
  30_000 as const;

const maximumIngressBytes = 33_619_968;
const maximumResponseBytes = 65_536;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationAttemptAuthorityResultIngressResponse = Readonly<{
  format: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_VERSION;
  requestDigest: CanonicalDigest;
  ingressDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  resultIngressReceiptDigest: CanonicalDigest;
  replayed: boolean;
}>;

export interface AgentEvaluationAttemptAuthorityResultIngressClient {
  seal(
    input: Readonly<{
      request: AgentEvaluationOwnerAuthorityRequest;
      response: unknown;
      ownerImplementationDigest: CanonicalDigest;
    }>
  ): Promise<AgentEvaluationAttemptAuthorityResultIngressResponse>;
}

export type CreateEnvironmentAgentEvaluationAttemptAuthorityResultIngressClientInput =
  Readonly<{
    environment?: Environment;
    fetch?: typeof fetch;
    timeoutMs?: number;
    forbiddenCanaries: () => readonly string[];
  }>;

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

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const parseSafeJson = (source: string): unknown => {
  try {
    const value = JSON.parse(source, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) return responseInvalid();
      return entry;
    }) as unknown;
    if (canonicalJsonText(value) !== source) return responseInvalid();
    return value;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return responseInvalid();
  }
};

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (!reader) return responseInvalid();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return responseInvalid();
      }
      chunks.push(next.value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } finally {
    for (const chunk of chunks) chunk.fill(0);
    reader.releaseLock();
  }
};

const createRequestBindingDigest = (
  request: AgentEvaluationOwnerAuthorityRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-server-only-request-binding',
    version: 1,
    serviceKind: request.serviceKind,
    operation: request.operation,
    ownerImplementationDigest,
    routeBinding: request.routeBinding,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    requestDigest: request.requestDigest,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    shardLeaseOwnerId: request.shardLeaseOwnerId,
    shardLeaseGeneration: request.shardLeaseGeneration,
    verificationGrantGeneration: request.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest,
  });

const createIngress = (
  request: AgentEvaluationOwnerAuthorityRequest,
  response: unknown,
  ownerImplementationDigest: CanonicalDigest
) => {
  const payload = request.payload;
  const preEffectIntent =
    isPlainObject(payload) &&
    payload.executionAuthorityKind === 'shared-effect' &&
    isAgentEvaluationCapabilityPreEffectIntent(payload.preEffectIntent)
      ? payload.preEffectIntent
      : undefined;
  if (
    request.serviceKind !== 'provider-capability' ||
    request.operation !== 'tool.execute' ||
    request.routeBinding !== 'capability-runtime/execute-tool' ||
    !isAgentControlIdentity(request.namespaceId) ||
    !isAgentCanonicalDigest(request.planDigest) ||
    !exactCommitPattern.test(request.repositoryCommit) ||
    !isAgentControlIdentity(request.attemptId) ||
    !isAgentCanonicalDigest(request.descriptorDigest) ||
    !isAgentControlIdentity(request.shardLeaseOwnerId) ||
    !Number.isSafeInteger(request.shardLeaseGeneration) ||
    request.shardLeaseGeneration! < 1 ||
    !Number.isSafeInteger(request.verificationGrantGeneration) ||
    request.verificationGrantGeneration! < 1 ||
    !isAgentCanonicalDigest(request.verificationAttemptGrantReceiptSetDigest) ||
    !isAgentCanonicalDigest(
      request.providerCapabilityObservationReceiptSetDigest
    ) ||
    !isAgentCanonicalDigest(request.requestDigest) ||
    !isAgentCanonicalDigest(request.stageDigest) ||
    !isAgentCanonicalDigest(ownerImplementationDigest) ||
    request.ownerImplementationDigest !== ownerImplementationDigest ||
    !preEffectIntent ||
    preEffectIntent.intentDigest !==
      digestAgentCanonicalValue(
        Object.fromEntries(
          Object.entries(preEffectIntent).filter(
            ([key]) => key !== 'intentDigest'
          )
        )
      )
  ) {
    return responseInvalid();
  }
  createAgentEvaluationAttemptAuthorityResponseProjection(
    'capability-runtime',
    'execute-tool',
    response,
    {
      bindingKind: 'execute-tool',
      executionAuthorityKind: 'shared-effect',
      invocationId: preEffectIntent.invocationId,
      turnIndex: preEffectIntent.turnIndex,
      toolId: preEffectIntent.toolId,
      toolCallId: preEffectIntent.toolCallId,
      providerToolCallId: preEffectIntent.providerToolCallId,
      providerRequestDigest: preEffectIntent.providerRequestDigest,
      preEffectIntent,
    }
  );
  const stageDigest = createAgentEvaluationAttemptAuthorityDispatchStageDigest(
    request,
    ownerImplementationDigest
  );
  if (request.stageDigest !== stageDigest) return responseInvalid();
  const responseDigest = digestAgentCanonicalValue(response);
  const dispatchAckDigest =
    createAgentEvaluationAttemptAuthorityDispatchAckDigest(
      request,
      response,
      ownerImplementationDigest
    );
  const base = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_VERSION,
    namespaceId: request.namespaceId,
    planDigest: request.planDigest,
    repositoryCommit: request.repositoryCommit,
    serviceKind: 'provider-capability' as const,
    operation: 'tool.execute' as const,
    routeBinding: 'capability-runtime/execute-tool' as const,
    attemptId: request.attemptId,
    descriptorDigest: request.descriptorDigest,
    shardLeaseOwnerId: request.shardLeaseOwnerId,
    shardLeaseGeneration: request.shardLeaseGeneration,
    verificationGrantGeneration: request.verificationGrantGeneration,
    verificationAttemptGrantReceiptSetDigest:
      request.verificationAttemptGrantReceiptSetDigest,
    providerCapabilityObservationReceiptSetDigest:
      request.providerCapabilityObservationReceiptSetDigest,
    requestDigest: request.requestDigest,
    requestBindingDigest: createRequestBindingDigest(
      request,
      ownerImplementationDigest
    ),
    ownerImplementationDigest,
    stageDigest,
    preEffectIntent,
    preEffectIntentDigest: preEffectIntent.intentDigest,
    response,
    responseDigest,
    dispatchAckDigest,
  });
  return Object.freeze({
    ...base,
    ingressDigest: digestAgentCanonicalValue(base),
  });
};

const decodeResponse = (
  value: unknown,
  request: ReturnType<typeof createIngress>
): AgentEvaluationAttemptAuthorityResultIngressResponse => {
  const receiptBase = Object.freeze({
    format: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RECEIPT_FORMAT,
    version: AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_VERSION,
    requestDigest: request.requestDigest,
    ingressDigest: request.ingressDigest,
    responseDigest: request.responseDigest,
    dispatchAckDigest: request.dispatchAckDigest,
  });
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'ingressDigest',
      'responseDigest',
      'dispatchAckDigest',
      'resultIngressReceiptDigest',
      'replayed',
    ]) ||
    value.format !==
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_RESPONSE_FORMAT ||
    value.version !==
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_VERSION ||
    value.requestDigest !== request.requestDigest ||
    value.ingressDigest !== request.ingressDigest ||
    value.responseDigest !== request.responseDigest ||
    value.dispatchAckDigest !== request.dispatchAckDigest ||
    value.resultIngressReceiptDigest !==
      digestAgentCanonicalValue(receiptBase) ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  return Object.freeze(
    value as unknown as AgentEvaluationAttemptAuthorityResultIngressResponse
  );
};

export const createEnvironmentAgentEvaluationAttemptAuthorityResultIngressClient =
  (
    options: CreateEnvironmentAgentEvaluationAttemptAuthorityResultIngressClientInput
  ): AgentEvaluationAttemptAuthorityResultIngressClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_ATTEMPT_AUTHORITY_RESULT_INGRESS_TIMEOUT_MS;
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl) !==
        AGENT_EVALUATION_LEDGER_BASE_URL ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_LEDGER_MAXIMUM_OPERATION_TIMEOUT_MS ||
      typeof fetchImplementation !== 'function' ||
      typeof options.forbiddenCanaries !== 'function'
    ) {
      return unavailable();
    }

    const client: AgentEvaluationAttemptAuthorityResultIngressClient = {
      async seal(input) {
        const { request, response, ownerImplementationDigest } = input;
        const namespaceId = read(
          AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
        );
        const repositoryCommit = read(
          AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
        );
        if (
          namespaceId !== request.namespaceId ||
          repositoryCommit !== request.repositoryCommit
        ) {
          return unavailable();
        }
        const ingress = createIngress(
          request,
          response,
          ownerImplementationDigest
        );
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
        const body = canonicalJsonText(ingress);
        if (textEncoder.encode(body).byteLength > maximumIngressBytes) {
          return responseInvalid();
        }
        let tokenSource: string | undefined;
        let tokenBytes: Uint8Array | undefined;
        let headers: Headers | undefined;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          tokenSource = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token);
          if (!isAgentEvaluationServiceToken(tokenSource)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
            );
          }
          tokenBytes = textEncoder.encode(tokenSource);
          tokenSource = undefined;
          const credentialSignatures =
            createCredentialCanarySignatures(tokenBytes);
          const url = `${AGENT_EVALUATION_LEDGER_BASE_URL}/v1/evaluations/${encodeURIComponent(request.namespaceId)}/${encodeURIComponent(request.planDigest!)}/${encodeURIComponent(request.repositoryCommit)}/attempt-authority-results`;
          if (
            textContainsCredentialCanary(body, credentialSignatures) ||
            textContainsCredentialCanary(url, credentialSignatures)
          ) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
            );
          }
          headers = new Headers({
            Accept: 'application/json',
            Authorization: `Bearer ${textDecoder.decode(tokenBytes)}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': request.requestDigest,
          });
          let httpResponse: Response | undefined;
          for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
              httpResponse = await fetchImplementation(url, {
                method: 'POST',
                headers,
                body,
                signal: controller.signal,
                redirect: 'error',
                referrerPolicy: 'no-referrer',
                cache: 'no-store',
                credentials: 'omit',
              });
              if (
                httpResponse.ok ||
                httpResponse.status < 500 ||
                attempt === 1
              ) {
                break;
              }
              await httpResponse.body?.cancel().catch(() => undefined);
              httpResponse = undefined;
            } catch (caught) {
              if (attempt === 1 || controller.signal.aborted) {
                throw safeRunnerError(caught);
              }
            }
          }
          if (!httpResponse) return unavailable();
          const responseBytes = await readBoundedBody(
            httpResponse,
            controller.signal
          );
          let responseText = '';
          try {
            responseText = textDecoder.decode(responseBytes);
          } finally {
            responseBytes.fill(0);
          }
          if (
            textContainsCredentialCanary(responseText, credentialSignatures)
          ) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak,
              httpResponse.status
            );
          }
          if (!httpResponse.ok) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed,
              httpResponse.status
            );
          }
          if (
            httpResponse.headers
              .get('content-type')
              ?.split(';', 1)[0]
              ?.trim()
              .toLowerCase() !== 'application/json'
          ) {
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
              httpResponse.status
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
              httpResponse.status
            );
          }
          return decodeResponse(decoded, ingress);
        } catch (caught) {
          throw safeRunnerError(caught);
        } finally {
          clearTimeout(timeout);
          headers?.delete('Authorization');
          tokenSource = undefined;
          tokenBytes?.fill(0);
        }
      },
    };
    return Object.freeze(client);
  };
