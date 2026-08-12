import {
  createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck,
  digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage,
  digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngress,
  digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  isAgentCapabilityProbeProviderResourceCleanupReceipt,
  isAgentCapabilityProbeProviderResourceCleanupResponse,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
  type AgentCapabilityProbeProviderResourceCleanupReceipt,
  type AgentCapabilityProbeProviderResourceCleanupResponse,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
  type AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse,
  type AgentEvaluationCapabilityProbeProviderResourceResult,
} from './capabilityProbeProviderResourceClient';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
} from './ledgerClient';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-list' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_REGISTRATION_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-registration' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_ENVELOPE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-envelope' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-cleanup-result-ingress-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION =
  1 as const;

const maximumListBytes = 3_145_728;
const maximumCleanupBytes = 131_072;
const maximumIngressBytes = 196_608;
const maximumResponseBytes = 131_072;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupRegistration =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_REGISTRATION_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION;
    resourceRegistrationRequest: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
    providerResourceResult: AgentEvaluationCapabilityProbeProviderResourceResult;
    registrationResponse: AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse;
    cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
    deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
    cleanupResponse: AgentCapabilityProbeProviderResourceCleanupResponse | null;
    recordDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupList =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    records: readonly AgentEvaluationCapabilityProbeProviderResourceCleanupRegistration[];
    listDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_ENVELOPE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    cleanupRequestDigest: CanonicalDigest;
    resourceRegistrationRequestDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
    cleanupReceiptDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    resultIngressDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION;
    cleanupRequestDigest: CanonicalDigest;
    cleanupReceiptDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    resultIngressDigest: CanonicalDigest;
    resultIngressReceiptDigest: CanonicalDigest;
    replayed: boolean;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceCleanupClient =
  Readonly<{
    list(
      signal: AbortSignal
    ): Promise<AgentEvaluationCapabilityProbeProviderResourceCleanupList>;
    cleanup(
      request: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest,
      signal: AbortSignal
    ): Promise<AgentCapabilityProbeProviderResourceCleanupResponse>;
    storeResult(
      request: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope,
      signal: AbortSignal
    ): Promise<AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse>;
  }>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClientInput =
  Readonly<{
    namespaceId: string;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
  }>;

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const invalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const exactRecord = (
  value: unknown,
  keys: readonly string[]
): value is Readonly<Record<string, unknown>> =>
  isPlainObject(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

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

const canonicalWithin = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      textEncoder.encode(canonicalJsonText(value)).byteLength <= maximumBytes &&
      inspectAgentControlJson(value, maximumBytes).length === 0
    );
  } catch {
    return false;
  }
};

const decodeCleanupRegistration = (
  value: unknown
): AgentEvaluationCapabilityProbeProviderResourceCleanupRegistration => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'resourceRegistrationRequest',
      'providerResourceResult',
      'registrationResponse',
      'cleanupRequest',
      'deletionAuthorityReceipt',
      'cleanupResponse',
      'recordDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_REGISTRATION_FORMAT ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION ||
    !isAgentCanonicalDigest(value.recordDigest)
  ) {
    return invalid();
  }
  const request =
    decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
      value.resourceRegistrationRequest
    );
  const response =
    decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse(
      value.registrationResponse,
      request
    );
  const result =
    value.providerResourceResult as AgentEvaluationCapabilityProbeProviderResourceResult;
  const resultIngress =
    createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest({
      namespaceId: request.namespaceId,
      repositoryCommit: request.repositoryCommit,
      registrationRequest: request,
      ownerImplementationDigest: response.ownerImplementationDigest,
      stageDigest: response.stageDigest,
      resourceResult: result,
    });
  const deletion = value.deletionAuthorityReceipt;
  if (
    !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(deletion) ||
    !sameCanonicalJson(result.deletionAuthorityReceipt, deletion) ||
    resultIngress.resourceResultDigest !== response.resourceResultDigest ||
    resultIngress.dispatchAckDigest !== response.dispatchAckDigest ||
    !sameCanonicalJson(
      result.providerResourceAuthority,
      response.providerResourceAuthority
    )
  ) {
    return invalid();
  }
  const expectedCleanupRequest =
    createAgentCapabilityProbeProviderResourceCleanupAuthorityRequest({
      repositoryCommit: request.repositoryCommit,
      resourceRegistrationRequestDigest: request.requestDigest,
      deletionAuthorityReceiptDigest: deletion.deletionAuthorityReceiptDigest,
    });
  if (
    !isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
      value.cleanupRequest
    ) ||
    !sameCanonicalJson(value.cleanupRequest, expectedCleanupRequest) ||
    (value.cleanupResponse !== null &&
      (!isAgentCapabilityProbeProviderResourceCleanupResponse(
        value.cleanupResponse
      ) ||
        value.cleanupResponse.repositoryCommit !== request.repositoryCommit ||
        value.cleanupResponse.resourceRegistrationRequestDigest !==
          request.requestDigest ||
        value.cleanupResponse.cleanupRequestDigest !==
          expectedCleanupRequest.cleanupRequestDigest ||
        value.cleanupResponse.deletionAuthorityReceiptDigest !==
          deletion.deletionAuthorityReceiptDigest))
  ) {
    return invalid();
  }
  const { recordDigest, ...base } = value;
  if (recordDigest !== digestAgentCanonicalValue(base)) return invalid();
  return Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_REGISTRATION_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
    resourceRegistrationRequest: request,
    providerResourceResult: Object.freeze({ ...result }),
    registrationResponse: response,
    cleanupRequest: expectedCleanupRequest,
    deletionAuthorityReceipt: deletion,
    cleanupResponse:
      value.cleanupResponse === null
        ? null
        : Object.freeze({ ...value.cleanupResponse }),
    recordDigest,
  });
};

export const decodeAgentEvaluationCapabilityProbeProviderResourceCleanupList = (
  value: unknown,
  binding: Readonly<{ namespaceId: string; repositoryCommit: string }>
): AgentEvaluationCapabilityProbeProviderResourceCleanupList => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'repositoryCommit',
      'records',
      'listDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION ||
    value.namespaceId !== binding.namespaceId ||
    value.repositoryCommit !== binding.repositoryCommit ||
    !Array.isArray(value.records) ||
    value.records.length > 4 ||
    !isAgentCanonicalDigest(value.listDigest) ||
    !canonicalWithin(value, maximumListBytes)
  ) {
    return invalid();
  }
  const records = Object.freeze(value.records.map(decodeCleanupRegistration));
  if (
    records.some(
      (record) =>
        record.resourceRegistrationRequest.namespaceId !==
          binding.namespaceId ||
        record.resourceRegistrationRequest.repositoryCommit !==
          binding.repositoryCommit
    ) ||
    records.some(
      (record, index) =>
        index > 0 &&
        compareUnicodeCodePoints(
          records[index - 1]!.resourceRegistrationRequest.requestDigest,
          record.resourceRegistrationRequest.requestDigest
        ) >= 0
    )
  ) {
    return invalid();
  }
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_LIST_FORMAT,
    version:
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
    namespaceId: binding.namespaceId,
    repositoryCommit: binding.repositoryCommit,
    records,
  });
  if (value.listDigest !== digestAgentCanonicalValue(base)) return invalid();
  return Object.freeze({ ...base, listDigest: value.listDigest });
};

export const createAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope =
  (input: {
    namespaceId: string;
    repositoryCommit: string;
    cleanupRequest: AgentCapabilityProbeProviderResourceCleanupAuthorityRequest;
    ownerImplementationDigest: CanonicalDigest;
    cleanupReceipt: AgentCapabilityProbeProviderResourceCleanupReceipt;
  }): AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope => {
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !exactCommitPattern.test(input.repositoryCommit) ||
      !isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
        input.cleanupRequest
      ) ||
      input.cleanupRequest.repositoryCommit !== input.repositoryCommit ||
      !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
      !isAgentCapabilityProbeProviderResourceCleanupReceipt(
        input.cleanupReceipt
      ) ||
      input.cleanupReceipt.requestDigest !==
        input.cleanupRequest.resourceRegistrationRequestDigest ||
      input.cleanupReceipt.deletionAuthorityReceiptDigest !==
        input.cleanupRequest.deletionAuthorityReceiptDigest
    ) {
      return invalid();
    }
    const stageDigest =
      digestAgentCapabilityProbeProviderResourceCleanupAuthorityStage({
        cleanupRequestDigest: input.cleanupRequest.cleanupRequestDigest,
        ownerImplementationDigest: input.ownerImplementationDigest,
      });
    const ownerAdmissionDigest =
      digestAgentCapabilityProbeProviderResourceCleanupOwnerAdmission({
        cleanupRequestDigest: input.cleanupRequest.cleanupRequestDigest,
        stageDigest,
        ownerImplementationDigest: input.ownerImplementationDigest,
      });
    const dispatchAckDigest =
      digestAgentCapabilityProbeProviderResourceCleanupAuthorityDispatchAck({
        cleanupRequestDigest: input.cleanupRequest.cleanupRequestDigest,
        stageDigest,
        ownerAdmissionDigest,
        cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
      });
    const resultIngressDigest =
      digestAgentCapabilityProbeProviderResourceCleanupResultIngress({
        cleanupRequestDigest: input.cleanupRequest.cleanupRequestDigest,
        dispatchAckDigest,
        cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
      });
    const envelope = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_ENVELOPE_FORMAT,
      version:
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION,
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      cleanupRequestDigest: input.cleanupRequest.cleanupRequestDigest,
      resourceRegistrationRequestDigest:
        input.cleanupRequest.resourceRegistrationRequestDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
      stageDigest,
      cleanupReceipt: input.cleanupReceipt,
      cleanupReceiptDigest: input.cleanupReceipt.cleanupReceiptDigest,
      ownerAdmissionDigest,
      dispatchAckDigest,
      resultIngressDigest,
    });
    if (!canonicalWithin(envelope, maximumIngressBytes)) return invalid();
    return envelope;
  };

export const decodeAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse =
  (
    value: unknown,
    request: AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressEnvelope
  ): AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse => {
    if (
      !exactRecord(value, [
        'format',
        'version',
        'cleanupRequestDigest',
        'cleanupReceiptDigest',
        'dispatchAckDigest',
        'resultIngressDigest',
        'resultIngressReceiptDigest',
        'replayed',
      ]) ||
      value.format !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_RESULT_INGRESS_RESPONSE_FORMAT ||
      value.version !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_CLEANUP_VERSION ||
      value.cleanupRequestDigest !== request.cleanupRequestDigest ||
      value.cleanupReceiptDigest !== request.cleanupReceiptDigest ||
      value.dispatchAckDigest !== request.dispatchAckDigest ||
      value.resultIngressDigest !== request.resultIngressDigest ||
      typeof value.replayed !== 'boolean' ||
      value.resultIngressReceiptDigest !==
        digestAgentCapabilityProbeProviderResourceCleanupResultIngressReceipt({
          resultIngressDigest: request.resultIngressDigest,
          cleanupReceiptDigest: request.cleanupReceiptDigest,
        })
    ) {
      return invalid();
    }
    return Object.freeze({
      ...(value as unknown as AgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse),
    });
  };

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal,
  maximumBytes: number
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
      if (byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        return invalid();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
};

export const createEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceCleanupClientInput
  ): AgentEvaluationCapabilityProbeProviderResourceCleanupClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace) !==
        options.namespaceId ||
      read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit) !==
        options.repositoryCommit ||
      !isAgentControlIdentity(options.namespaceId) ||
      !exactCommitPattern.test(options.repositoryCommit)
    ) {
      return unavailable();
    }
    const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-provider-resource-cleanups`;
    const listEndpoint = `${endpoint}/${options.repositoryCommit}`;
    const resultEndpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-provider-resource-cleanup-results`;
    const fetchImplementation = options.fetch ?? fetch;

    const request = async (input: {
      endpoint: string;
      method: 'GET' | 'POST';
      signal: AbortSignal;
      maximumBytes: number;
      body?: unknown;
      idempotencyKey?: CanonicalDigest;
    }): Promise<unknown> => {
      if (input.signal.aborted) return unavailable();
      let credentialSource = read(
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
      );
      let credential: Uint8Array | undefined;
      try {
        if (!isAgentEvaluationServiceToken(credentialSource)) {
          return unavailable();
        }
        credential = textEncoder.encode(credentialSource);
        const signatures = createCredentialCanarySignatures(credential);
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${textDecoder.decode(credential)}`,
          ...(input.method === 'POST'
            ? {
                'Content-Type': 'application/json',
                'Idempotency-Key': input.idempotencyKey!,
              }
            : {}),
        });
        try {
          const response = await fetchImplementation(input.endpoint, {
            method: input.method,
            headers,
            ...(input.body === undefined
              ? {}
              : { body: canonicalJsonText(input.body) }),
            signal: input.signal,
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
          const bytes = await readBoundedBody(
            response,
            input.signal,
            input.maximumBytes
          );
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
          return decoded;
        } catch (caught) {
          if (caught instanceof AgentEvaluationRunnerError) throw caught;
          if (input.signal.aborted) return unavailable();
          throw safeRunnerError(caught);
        } finally {
          headers.delete('Authorization');
        }
      } finally {
        credential?.fill(0);
        credential = undefined;
        credentialSource = undefined;
      }
    };

    return Object.freeze({
      async list(signal) {
        return decodeAgentEvaluationCapabilityProbeProviderResourceCleanupList(
          await request({
            endpoint: listEndpoint,
            method: 'GET',
            signal,
            maximumBytes: maximumListBytes,
          }),
          options
        );
      },
      async cleanup(requestInput, signal) {
        if (
          !isAgentCapabilityProbeProviderResourceCleanupAuthorityRequest(
            requestInput
          ) ||
          requestInput.repositoryCommit !== options.repositoryCommit ||
          !canonicalWithin(requestInput, maximumCleanupBytes)
        ) {
          return invalid();
        }
        const response = await request({
          endpoint,
          method: 'POST',
          body: requestInput,
          idempotencyKey: requestInput.cleanupRequestDigest,
          signal,
          maximumBytes: maximumCleanupBytes,
        });
        if (
          !isAgentCapabilityProbeProviderResourceCleanupResponse(response) ||
          response.repositoryCommit !== options.repositoryCommit ||
          response.resourceRegistrationRequestDigest !==
            requestInput.resourceRegistrationRequestDigest ||
          response.cleanupRequestDigest !== requestInput.cleanupRequestDigest ||
          response.deletionAuthorityReceiptDigest !==
            requestInput.deletionAuthorityReceiptDigest
        ) {
          return invalid();
        }
        return Object.freeze({ ...response });
      },
      async storeResult(requestInput, signal) {
        if (
          requestInput.namespaceId !== options.namespaceId ||
          requestInput.repositoryCommit !== options.repositoryCommit ||
          !canonicalWithin(requestInput, maximumIngressBytes)
        ) {
          return invalid();
        }
        return decodeAgentEvaluationCapabilityProbeProviderResourceCleanupResultIngressResponse(
          await request({
            endpoint: resultEndpoint,
            method: 'POST',
            body: requestInput,
            idempotencyKey: requestInput.cleanupRequestDigest,
            signal,
            maximumBytes: maximumResponseBytes,
          }),
          requestInput
        );
      },
    });
  };
