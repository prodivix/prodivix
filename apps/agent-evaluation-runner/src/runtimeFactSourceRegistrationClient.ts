import {
  createAgentEvaluationRuntimeFactSourceAuthority,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type AgentEvaluationRuntimeFactSourceAuthority,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
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
import {
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest,
  digestAgentEvaluationRuntimeFactSourceOwnerAdmission,
  digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck,
  digestAgentEvaluationRuntimeFactSourceRegistrationStage,
  type AgentEvaluationRuntimeFactSourceRegistrationRequest,
} from './runtimeFactSourceRegistration';

export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt' as const;
export const AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_CLIENT_TIMEOUT_MS =
  30_000 as const;

const maximumResponseBytes = 65_536;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationRuntimeFactSourceRegistrationReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT;
  version: 1;
  namespaceId: string;
  repositoryCommit: string;
  requestDigest: CanonicalDigest;
  sourceAuthorityKind: 'shared-durable-capability';
  sourceKind:
    'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  routeBinding: string;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  protocolFamily:
    'openai-responses' | 'anthropic-messages' | 'gemini-interactions';
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  registrationAuthorityIssuerId: string;
  ownerHealthDigest: CanonicalDigest;
  ownerAdmissionDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  registeredAt: string;
  expiresAt: string;
  registrationReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationRuntimeFactSourceRegistration = Readonly<{
  receipt: AgentEvaluationRuntimeFactSourceRegistrationReceipt;
  authority: AgentEvaluationRuntimeFactSourceAuthority;
}>;

export type AgentEvaluationRuntimeFactSourceRegistrationClient = Readonly<{
  register(
    request: AgentEvaluationRuntimeFactSourceRegistrationRequest
  ): Promise<AgentEvaluationRuntimeFactSourceRegistration>;
}>;

export type CreateEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClientInput =
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

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

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

export const decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt = (
  value: unknown,
  request: AgentEvaluationRuntimeFactSourceRegistrationRequest
): AgentEvaluationRuntimeFactSourceRegistrationReceipt => {
  decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(request);
  const keys = [
    'format',
    'version',
    'namespaceId',
    'repositoryCommit',
    'requestDigest',
    'sourceAuthorityKind',
    'sourceKind',
    'sourceAuthorityId',
    'sourceAuthorityImplementationDigest',
    'routeBinding',
    'capabilityProfileId',
    'capabilityProfileDigest',
    'capabilityId',
    'protocolFamily',
    'providerConfigurationId',
    'modelId',
    'modelLineageDigest',
    'adapterDigest',
    'registrationAuthorityIssuerId',
    'ownerHealthDigest',
    'ownerAdmissionDigest',
    'stageDigest',
    'dispatchAckDigest',
    'registeredAt',
    'expiresAt',
    'registrationReceiptDigest',
  ] as const;
  if (!exactRecord(value, keys)) return invalid();
  const receipt =
    value as unknown as AgentEvaluationRuntimeFactSourceRegistrationReceipt;
  const requestBindings = [
    ['namespaceId', request.namespaceId],
    ['repositoryCommit', request.repositoryCommit],
    ['requestDigest', request.requestDigest],
    ['sourceAuthorityKind', request.sourceAuthorityKind],
    ['sourceKind', request.sourceKind],
    ['sourceAuthorityId', request.sourceAuthorityId],
    [
      'sourceAuthorityImplementationDigest',
      request.sourceAuthorityImplementationDigest,
    ],
    ['routeBinding', request.routeBinding],
    ['capabilityProfileId', request.capabilityProfileId],
    ['capabilityProfileDigest', request.capabilityProfileDigest],
    ['capabilityId', request.capabilityId],
    ['protocolFamily', request.protocolFamily],
    ['providerConfigurationId', request.providerConfigurationId],
    ['modelId', request.modelId],
    ['modelLineageDigest', request.modelLineageDigest],
    ['adapterDigest', request.adapterDigest],
  ] as const;
  const registeredAt = Date.parse(receipt.registeredAt);
  const expiresAt = Date.parse(receipt.expiresAt);
  const { registrationReceiptDigest, ...base } = receipt;
  if (
    receipt.format !==
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_RECEIPT_FORMAT ||
    receipt.version !== 1 ||
    requestBindings.some(([key, expected]) => receipt[key] !== expected) ||
    !isAgentControlIdentity(receipt.registrationAuthorityIssuerId) ||
    ![
      receipt.ownerHealthDigest,
      receipt.ownerAdmissionDigest,
      receipt.stageDigest,
      receipt.dispatchAckDigest,
      registrationReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    !isAgentControlInstant(receipt.registeredAt) ||
    !isAgentControlInstant(receipt.expiresAt) ||
    expiresAt <= registeredAt ||
    expiresAt - registeredAt > maximumRegistrationLifetimeMs ||
    expiresAt < Date.parse(request.minimumExpiresAt) ||
    receipt.stageDigest !==
      digestAgentEvaluationRuntimeFactSourceRegistrationStage(
        request,
        receipt.registrationAuthorityIssuerId
      ) ||
    receipt.ownerAdmissionDigest !==
      digestAgentEvaluationRuntimeFactSourceOwnerAdmission(
        request.requestDigest,
        receipt.ownerHealthDigest,
        receipt.stageDigest
      ) ||
    receipt.dispatchAckDigest !==
      digestAgentEvaluationRuntimeFactSourceRegistrationDispatchAck({
        requestDigest: request.requestDigest,
        ownerHealthDigest: receipt.ownerHealthDigest,
        ownerAdmissionDigest: receipt.ownerAdmissionDigest,
        stageDigest: receipt.stageDigest,
        registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
      }) ||
    registrationReceiptDigest !== digestAgentCanonicalValue(base)
  ) {
    return invalid();
  }
  return Object.freeze({ ...receipt });
};

export const createEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClient =
  (
    options: CreateEnvironmentAgentEvaluationRuntimeFactSourceRegistrationClientInput
  ): AgentEvaluationRuntimeFactSourceRegistrationClient => {
    const environment = options.environment ?? process.env;
    const read = readEnvironment(environment);
    const baseUrl = read(AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.baseUrl);
    const tokenNamespace = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
    );
    const repositoryCommit = read(
      AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.repositoryCommit
    );
    const timeoutMs =
      options.timeoutMs ??
      AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_CLIENT_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      tokenNamespace !== options.namespaceId ||
      repositoryCommit !== options.repositoryCommit ||
      !isAgentControlIdentity(options.namespaceId) ||
      !/^[a-f0-9]{40}$/u.test(options.repositoryCommit) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs >
        AGENT_EVALUATION_RUNTIME_FACT_SOURCE_REGISTRATION_CLIENT_TIMEOUT_MS
    ) {
      return unavailable();
    }
    const endpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/runtime-fact-source-owner-registrations`;
    const fetchImplementation = options.fetch ?? fetch;
    return Object.freeze({
      async register(requestInput) {
        const request =
          decodeAgentEvaluationRuntimeFactSourceRegistrationRequest(
            requestInput
          );
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
            const receipt =
              decodeAgentEvaluationRuntimeFactSourceRegistrationReceipt(
                decoded,
                request
              );
            return Object.freeze({
              receipt,
              authority: createAgentEvaluationRuntimeFactSourceAuthority({
                kind: request.sourceAuthorityKind,
                sourceKind: request.sourceKind,
                sourceAuthorityId: request.sourceAuthorityId,
                sourceAuthorityImplementationDigest:
                  request.sourceAuthorityImplementationDigest,
                routeBinding: request.routeBinding,
                capabilityProfileId: request.capabilityProfileId,
                capabilityProfileDigest: request.capabilityProfileDigest,
                capabilityId: request.capabilityId,
                protocolFamily: request.protocolFamily,
                providerConfigurationId: request.providerConfigurationId,
                modelId: request.modelId,
                modelLineageDigest: request.modelLineageDigest,
                adapterDigest: request.adapterDigest,
                ...(request.hostedRetrievalRuntimeResourceRegistrationIntentDigest
                  ? {
                      hostedRetrievalRuntimeResourceRegistrationIntentDigest:
                        request.hostedRetrievalRuntimeResourceRegistrationIntentDigest,
                    }
                  : {}),
                registrationAuthorityIssuerId:
                  receipt.registrationAuthorityIssuerId,
                registrationReceiptDigest: receipt.registrationReceiptDigest,
              }),
            });
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
