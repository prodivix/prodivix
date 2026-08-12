import { createHash } from 'node:crypto';
import {
  createAgentNativeProviderRuntimeFactEnvelope,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  digestAgentNativeProviderRuntimeResponse,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf,
  isAgentModelEvaluationAttemptDescriptor,
  type AgentModelEvaluationAttemptDescriptor,
  scanAgentArtifactForProtectedHoldoutLeak,
  type AgentEvaluationProviderResultSpoolAad,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationTransportErrorCategory,
  type AgentEvaluationTransportReceipt,
  type AgentNativeProviderControlRequest,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
  type AgentNativeProviderRuntimeFactEnvelope,
  type AgentNativeProviderTransport,
  type AgentNativeProviderTransportRequest,
  normalizeNativeAgentProviderRuntimeEvents,
} from '@prodivix/ai';
export type {
  AgentEvaluationTransportDispatchIntent,
  AgentEvaluationTransportReceipt,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  requireEnabledAgentEvaluationRunnerConfig,
  type AgentEvaluationNativeProtocol,
  type AgentEvaluationRunnerConfig,
} from './config';
import {
  authorizeAgentEvaluationCapabilityProbeEgress,
  authorizeAgentEvaluationEgress,
  type AgentEvaluationHostResolver,
} from './egress';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
  type AgentEvaluationRunnerErrorCode,
} from './errors';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentProviderSecretResolver,
} from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';
import type {
  AgentEvaluationResultSpoolCipher,
  AgentEvaluationResultSpoolPlaintext,
} from './resultSpoolCipher';
import { AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES } from './resultSpoolCipher';
import type { AgentEvaluationResponseSpoolEncryptionProfile } from './runConfig';
import {
  createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  type AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress,
  type AgentEvaluationNativeOptionalCapabilityBootstrapResolution,
} from './nativeOptionalCapabilityBootstrapIngress';

const durableTransportErrorCategories =
  new Set<AgentEvaluationTransportErrorCategory>([
    'G4_RUNNER_ABORTED',
    'G4_RUNNER_CAPTURE_FAILED',
    'G4_RUNNER_CONFIGURATION_INVALID',
    'G4_RUNNER_DISABLED',
    'G4_RUNNER_EGRESS_DENIED',
    'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE',
    'G4_RUNNER_PROVIDER_AUTH_REJECTED',
    'G4_RUNNER_PROVIDER_RATE_LIMITED',
    'G4_RUNNER_PROVIDER_REJECTED',
    'G4_RUNNER_RESPONSE_INVALID',
    'G4_RUNNER_RESPONSE_SECRET_LEAK',
    'G4_RUNNER_RESPONSE_TOO_LARGE',
    'G4_RUNNER_SECRET_UNAVAILABLE',
    'G4_RUNNER_SECRET_USE_DENIED',
    'G4_RUNNER_SERVER_ONLY',
    'G4_RUNNER_TRANSPORT_FAILED',
  ]);

const durableTransportErrorCategory = (
  code: AgentEvaluationRunnerErrorCode
): AgentEvaluationTransportErrorCategory =>
  durableTransportErrorCategories.has(
    code as AgentEvaluationTransportErrorCategory
  )
    ? (code as AgentEvaluationTransportErrorCategory)
    : 'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE';

export type AgentEvaluationJsonValue =
  | boolean
  | null
  | number
  | string
  | readonly AgentEvaluationJsonValue[]
  | AgentEvaluationJsonObject;

export type AgentEvaluationJsonObject = Readonly<{
  [key: string]: AgentEvaluationJsonValue;
}>;

export type AgentEvaluationProviderPayload = Readonly<{
  body: AgentEvaluationJsonObject;
  /** Callback-bound exact runtime request for a native optional-capability operation. */
  capabilityRuntimeRequestMaterial?: AgentNativeProviderCapabilityRuntimeRequestMaterial;
  timeoutMs?: number;
  maximumResponseBytes?: number;
  /** Callback-bound holdout canaries; never serialized into the provider body. */
  protectedLeakCanaries?: readonly string[];
  /** Optional prior-continuation binding; all other spool authority is derived locally. */
  resultSpoolAuthority?: Readonly<{
    opaqueContinuationDigest?: string;
  }>;
}>;

export type AgentEvaluationProviderPayloadResolver = (
  request: AgentNativeProviderTransportRequest
) => AgentEvaluationProviderPayload | Promise<AgentEvaluationProviderPayload>;

export type AgentEvaluationTransportDispatchIntentAuthority = Readonly<{
  descriptor: AgentModelEvaluationAttemptDescriptor;
  repositoryCommit: string;
  turnIndex: number;
  budgetReservationId: string;
  demandDigest: string;
}>;

export type AgentEvaluationTransportDispatchFenceInput = Readonly<{
  descriptor: AgentModelEvaluationAttemptDescriptor;
  intent: AgentEvaluationTransportDispatchIntent;
}>;

export type AgentEvaluationTransportDispatchIntentAuthorityResolver = (
  request: AgentNativeProviderTransportRequest
) =>
  | AgentEvaluationTransportDispatchIntentAuthority
  | Promise<AgentEvaluationTransportDispatchIntentAuthority>;

export type AgentEvaluationProviderIdentityKind =
  'interaction-id' | 'message-id' | 'response-id';

export type AgentEvaluationTransportDispatchIntentAcknowledgement = Readonly<{
  intentDigest: string;
  disposition: 'created';
}>;

export type AgentEvaluationTransportCloseInput = Readonly<{
  receipt: AgentEvaluationTransportReceipt;
  responseDigest?: string;
  resultSpoolAad?: AgentEvaluationProviderResultSpoolAad;
  encryptedResultSpool?: AgentEvaluationProviderResultSpoolEnvelope;
  nativeOptionalCapabilityBootstrapIngress?: AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress;
}>;

export type AgentEvaluationTransportCloseAcknowledgement = Readonly<{
  dispatchIntentDigest: string;
  transportReceiptDigest: string;
  resultSpoolDigest?: string;
  disposition: 'closed';
}>;

export type AgentEvaluationTransportObservation = Readonly<{
  phase: 'completed' | 'failed' | 'started';
  protocolFamily: AgentEvaluationNativeProtocol;
  providerConfigurationId: string;
  invocationId: string;
  requestDigest: string;
  endpointId: string;
  requestBytes: number;
  responseBytes?: number;
  httpStatus?: number;
  sseEventCount?: number;
  errorCategory?: AgentEvaluationRunnerErrorCode;
  occurredAt: string;
}>;

export type AgentEvaluationProviderExecution = Readonly<{
  events: readonly unknown[];
  runtimeEvents: readonly AgentNativeProviderRuntimeFactEnvelope[];
  receipt: AgentEvaluationTransportReceipt;
}>;

export type AgentEvaluationNativeOptionalCapabilityBootstrapResolverInput =
  Readonly<{
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    request: AgentNativeProviderTransportRequest;
    providerEvents: readonly unknown[];
    runtimeEvents: readonly AgentNativeProviderRuntimeFactEnvelope[];
    transportReceipt: AgentEvaluationTransportReceipt;
    responseDigest: string;
    resultSpoolAad: AgentEvaluationProviderResultSpoolAad;
    encryptedResultSpool: AgentEvaluationProviderResultSpoolEnvelope;
  }>;

export type AgentEvaluationNativeOptionalCapabilityBootstrapResolver = (
  input: AgentEvaluationNativeOptionalCapabilityBootstrapResolverInput
) =>
  | AgentEvaluationNativeOptionalCapabilityBootstrapResolution
  | undefined
  | Promise<
      AgentEvaluationNativeOptionalCapabilityBootstrapResolution | undefined
    >;

export type AgentEvaluationNativeOptionalCapabilityBootstrapRecovery = (
  input: Readonly<{
    ingress: AgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress;
    program: AgentEvaluationNativeOptionalCapabilityBootstrapResolution['program'];
  }>
) => 'missing' | 'sealed' | Promise<'missing' | 'sealed'>;

export type AgentEvaluationFetch = AgentEvaluationEgressBoundFetch;

export type CreateAgentEvaluationProviderTransportInput = Readonly<{
  config: AgentEvaluationRunnerConfig;
  secrets: AgentProviderSecretResolver;
  resolvePayload: AgentEvaluationProviderPayloadResolver;
  resolveDispatchIntentAuthority?: AgentEvaluationTransportDispatchIntentAuthorityResolver;
  fetcher?: AgentEvaluationFetch;
  resolveHost?: AgentEvaluationHostResolver;
  now?: () => Date;
  observe?: (event: AgentEvaluationTransportObservation) => void;
  putDispatchIntent?: (
    input: AgentEvaluationTransportDispatchFenceInput
  ) => unknown | Promise<unknown>;
  recordReceipt?: (
    receipt: AgentEvaluationTransportReceipt
  ) => unknown | Promise<unknown>;
  /** Atomically persists the receipt and encrypted recovery spool. */
  closeTransport?: (
    input: AgentEvaluationTransportCloseInput
  ) => unknown | Promise<unknown>;
  resultSpoolCipher?: AgentEvaluationResultSpoolCipher;
  responseSpoolEncryption?: AgentEvaluationResponseSpoolEncryptionProfile;
  resolveNativeOptionalCapabilityBootstrap?: AgentEvaluationNativeOptionalCapabilityBootstrapResolver;
  recoverNativeOptionalCapabilityBootstrap?: AgentEvaluationNativeOptionalCapabilityBootstrapRecovery;
}>;

export type CreateAgentEvaluationProductionProviderTransportInput = Readonly<
  Omit<
    CreateAgentEvaluationProviderTransportInput,
    | 'fetcher'
    | 'putDispatchIntent'
    | 'recordReceipt'
    | 'closeTransport'
    | 'resultSpoolCipher'
    | 'responseSpoolEncryption'
    | 'resolveDispatchIntentAuthority'
  > & {
    resolveDispatchIntentAuthority: AgentEvaluationTransportDispatchIntentAuthorityResolver;
    putDispatchIntent: (
      input: AgentEvaluationTransportDispatchFenceInput
    ) => Promise<AgentEvaluationTransportDispatchIntentAcknowledgement>;
    closeTransport: (
      input: AgentEvaluationTransportCloseInput
    ) => Promise<AgentEvaluationTransportCloseAcknowledgement>;
    resultSpoolCipher: AgentEvaluationResultSpoolCipher;
    responseSpoolEncryption: AgentEvaluationResponseSpoolEncryptionProfile;
  }
>;

const maximumSseEvents = 10_000;
const defaultTimeoutMs = 60_000;
const defaultMaximumResponseBytes = 16 * 1_024 * 1_024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

const credentialObjectKeys = new Set([
  'accesstoken',
  'apikey',
  'authtoken',
  'authorization',
  'clientsecret',
  'cookie',
  'credential',
  'credentials',
  'idtoken',
  'password',
  'privatekey',
  'refreshtoken',
  'secret',
  'sessiontoken',
  'token',
  'xapikey',
  'xgoogapikey',
]);
const reservedBodyKeys = new Set(['model', 'stream', 'store']);

const responseHeaderAllowlist: Readonly<
  Record<AgentEvaluationNativeProtocol, readonly string[]>
> = Object.freeze({
  'openai-responses': Object.freeze([
    'openai-processing-ms',
    'openai-version',
    'x-request-id',
  ]),
  'anthropic-messages': Object.freeze([
    'anthropic-version',
    'request-id',
    'x-request-id',
  ]),
  'gemini-interactions': Object.freeze(['x-goog-request-id', 'x-request-id']),
});

const providerRequestIdHeaders: Readonly<
  Record<AgentEvaluationNativeProtocol, readonly string[]>
> = Object.freeze({
  'openai-responses': Object.freeze(['x-request-id']),
  'anthropic-messages': Object.freeze(['request-id', 'x-request-id']),
  'gemini-interactions': Object.freeze(['x-goog-request-id', 'x-request-id']),
});

const sha256Digest = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

const canonicalMetadata = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const plainRecord = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value);

const inspectJsonPayload = (value: unknown): void => {
  const ancestors = new Set<object>();
  let nodes = 0;
  const visit = (candidate: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 100_000 || depth > 48) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (
      candidate === null ||
      typeof candidate === 'string' ||
      typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate === 'number') {
      if (Number.isFinite(candidate)) return;
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (typeof candidate !== 'object' || ancestors.has(candidate)) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const names = Object.getOwnPropertyNames(candidate);
        if (
          Object.getPrototypeOf(candidate) !== Array.prototype ||
          Object.getOwnPropertySymbols(candidate).length > 0 ||
          candidate.length > 100_000 ||
          names.length !== candidate.length + 1
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
          );
        }
        for (let index = 0; index < candidate.length; index += 1) {
          const descriptor = descriptors[String(index)];
          if (!descriptor?.enumerable || !('value' in descriptor)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
            );
          }
          visit(descriptor.value, depth + 1);
        }
        return;
      }
      if (!plainRecord(candidate)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      if (Object.getOwnPropertySymbols(candidate).length > 0) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
      for (const key of Object.getOwnPropertyNames(candidate)) {
        const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, '');
        const descriptor = descriptors[key];
        if (
          isUnsafeObjectKey(key) ||
          credentialObjectKeys.has(normalizedKey) ||
          !descriptor?.enumerable ||
          !('value' in descriptor)
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
          );
        }
        visit(descriptor.value, depth + 1);
      }
    } finally {
      ancestors.delete(candidate);
    }
  };
  visit(value, 0);
};

const buildRequestBody = (
  protocolFamily: AgentEvaluationNativeProtocol,
  modelId: string,
  payload: AgentEvaluationJsonObject
): string => {
  inspectJsonPayload(payload);
  if (Object.keys(payload).some((key) => reservedBodyKeys.has(key))) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  if (
    (protocolFamily === 'anthropic-messages' &&
      (!Array.isArray(payload.messages) ||
        typeof payload.max_tokens !== 'number')) ||
    (protocolFamily !== 'anthropic-messages' && !('input' in payload))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  return JSON.stringify({
    ...payload,
    model: modelId,
    stream: true,
    ...(protocolFamily === 'anthropic-messages' ? {} : { store: false }),
  });
};

const resolveCapabilityRuntimeRequest = (
  material: AgentNativeProviderCapabilityRuntimeRequestMaterial,
  request: AgentNativeProviderTransportRequest,
  provider: Readonly<{
    endpoint: string;
    modelId: string;
    providerConfigurationId: string;
  }>
): Readonly<{
  body: string;
  endpoint: string;
  requestBodyDigest: string;
  requestBytes: number;
}> => {
  const { projection, callbackLocalBody, callbackLocalPath } = material;
  if (
    !isAgentNativeProviderCapabilityRuntimeRequestProjectionSelf(projection) ||
    callbackLocalBody === null ||
    !isPlainObject(callbackLocalBody) ||
    projection.requestDigest !== request.invocation.requestDigest ||
    projection.protocolFamily !== request.protocolFamily ||
    projection.capabilityProfileDigest !==
      request.invocation.capabilityProfileDigest ||
    projection.providerConfigurationId !== provider.providerConfigurationId ||
    projection.modelId !== provider.modelId ||
    projection.modelLineageDigest !== request.invocation.modelLineageDigest ||
    projection.httpMethod !== 'POST' ||
    projection.responseMode !== 'application-json' ||
    projection.stream !== false ||
    callbackLocalPath !==
      `${projection.pathTemplate}${
        projection.responseQuery === null ? '' : `?${projection.responseQuery}`
      }` ||
    digestAgentCanonicalValue({ path: callbackLocalPath }) !==
      projection.pathDigest ||
    digestAgentCanonicalValue({ body: callbackLocalBody }) !==
      projection.requestBodyDigest
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  inspectJsonPayload(callbackLocalBody);
  let endpoint: URL;
  let configuredEndpoint: URL;
  try {
    configuredEndpoint = new URL(provider.endpoint);
    endpoint = new URL(callbackLocalPath, configuredEndpoint);
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  if (
    endpoint.origin !== configuredEndpoint.origin ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.hash !== '' ||
    `${endpoint.pathname}${endpoint.search}` !== callbackLocalPath
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  const body = canonicalJsonText(callbackLocalBody);
  const requestBytes =
    textEncoder.encode(callbackLocalPath).byteLength +
    textEncoder.encode(body).byteLength;
  if (requestBytes !== projection.requestBytes) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  return Object.freeze({
    body,
    endpoint: endpoint.toString(),
    requestBodyDigest: projection.requestBodyDigest,
    requestBytes,
  });
};

const buildHeaders = (
  protocolFamily: AgentEvaluationNativeProtocol,
  credential: string
): Headers => {
  const headers = new Headers({
    Accept: 'text/event-stream, application/json',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'User-Agent': 'prodivix-g4-agent-evaluation/1',
  });
  switch (protocolFamily) {
    case 'openai-responses':
      headers.set('Authorization', `Bearer ${credential}`);
      break;
    case 'anthropic-messages':
      headers.set('anthropic-version', '2023-06-01');
      headers.set('x-api-key', credential);
      break;
    case 'gemini-interactions':
      headers.set('x-goog-api-key', credential);
      break;
  }
  return headers;
};

const clearCredentialHeaders = (headers: Headers): void => {
  headers.delete('Authorization');
  headers.delete('x-api-key');
  headers.delete('x-goog-api-key');
};

const readBoundedResponse = async (
  response: Response,
  maximumBytes: number
): Promise<Uint8Array> => {
  if (!response.body) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maximumBytes) {
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
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
};

const parseSseJsonEvents = (source: string): readonly unknown[] => {
  const events: unknown[] = [];
  let dataLines: string[] = [];
  const flush = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
    if (!plainRecord(parsed) || events.length >= maximumSseEvents) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
    events.push(parsed);
  };
  for (const line of source
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .split('\n')) {
    if (line === '') {
      flush();
      continue;
    }
    if (line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? '' : line.slice(separator + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
  }
  flush();
  if (events.length === 0) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  return Object.freeze(events);
};

const parseJsonEvents = (source: string): readonly unknown[] => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (
    events.length === 0 ||
    events.length > maximumSseEvents ||
    events.some((event) => !plainRecord(event))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  return Object.freeze(events);
};

const responseMediaType = (headers: Headers): string | undefined =>
  headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();

const isJsonMediaType = (value: string | undefined): boolean =>
  value === 'application/json' ||
  (typeof value === 'string' &&
    /^application\/[a-z0-9!#$&^_.+-]+\+json$/u.test(value));

type SelectedResponseHeaderMetadata = Readonly<{
  digest: string;
  providerRequestId?: string;
}>;

const selectedResponseHeaderMetadata = (
  protocolFamily: AgentEvaluationNativeProtocol,
  headers: Headers,
  credentialSignatures: readonly string[]
): SelectedResponseHeaderMetadata => {
  const selected = responseHeaderAllowlist[protocolFamily]
    .flatMap((name) => {
      const value = headers.get(name);
      if (value === null) return [];
      if (
        !canonicalMetadata(value) ||
        textContainsCredentialCanary(value, credentialSignatures)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return [`${name}\0${value}`];
    })
    .sort(compareUnicodeCodePoints);
  const providerRequestId = exactMetadata(
    providerRequestIdHeaders[protocolFamily].map(
      (name) => headers.get(name) ?? undefined
    )
  );
  return Object.freeze({
    digest: sha256Digest(selected.join('\n')),
    ...(providerRequestId ? { providerRequestId } : {}),
  });
};

type ProviderMetadata = Readonly<{
  identityKind?: AgentEvaluationProviderIdentityKind;
  responseId?: string;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
}>;

const stringAt = (
  value: unknown,
  path: readonly string[]
): string | undefined => {
  let current = value;
  for (const field of path) {
    if (!plainRecord(current)) return undefined;
    current = current[field];
  }
  return typeof current === 'string' ? current : undefined;
};

const exactMetadata = (
  values: readonly (string | undefined)[]
): string | undefined => {
  const present = [...new Set(values.filter(canonicalMetadata))];
  if (present.length > 1) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  return present[0];
};

const extractProviderMetadata = (
  protocolFamily: AgentEvaluationNativeProtocol,
  events: readonly unknown[]
): ProviderMetadata => {
  switch (protocolFamily) {
    case 'openai-responses':
      return Object.freeze({
        identityKind: 'response-id',
        responseId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['response', 'id']),
            stringAt(event, ['id']),
          ])
        ),
        resolvedModelId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['response', 'model']),
            stringAt(event, ['model']),
          ])
        ),
      });
    case 'anthropic-messages':
      return Object.freeze({
        identityKind: 'message-id',
        responseId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['message', 'id']),
            stringAt(event, ['id']),
          ])
        ),
        resolvedModelId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['message', 'model']),
            stringAt(event, ['model']),
          ])
        ),
      });
    case 'gemini-interactions':
      return Object.freeze({
        identityKind: 'interaction-id',
        responseId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['interaction', 'id']),
            stringAt(event, ['id']),
          ])
        ),
        resolvedModelId: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['interaction', 'model']),
            stringAt(event, ['model']),
          ])
        ),
        resolvedModelVersion: exactMetadata(
          events.flatMap((event) => [
            stringAt(event, ['interaction', 'model_version']),
            stringAt(event, ['model_version']),
          ])
        ),
      });
  }
};

const createReceipt = (
  input: Omit<
    AgentEvaluationTransportReceipt,
    'format' | 'version' | 'receiptDigest' | 'receiptId'
  >
): AgentEvaluationTransportReceipt => {
  const receiptId = `provider-transport-receipt:${sha256Digest(
    `${input.invocationId}\0${input.requestDigest}\0${input.startedAt}`
  ).slice('sha256-'.length)}`;
  return createAgentEvaluationTransportReceipt({ receiptId, ...input });
};

const createDispatchIntent = (
  input: Omit<
    AgentEvaluationTransportDispatchIntent,
    'format' | 'version' | 'intentDigest' | 'intentId' | 'endpointClass'
  >
): AgentEvaluationTransportDispatchIntent => {
  const intentId = `provider-transport-intent:${sha256Digest(
    `${input.invocationId}\0${input.requestDigest}`
  ).slice('sha256-'.length)}`;
  return createAgentEvaluationTransportDispatchIntent({
    intentId,
    ...input,
    endpointClass: 'first-party-hosted',
  });
};

const statusError = (status: number): AgentEvaluationRunnerError => {
  if (status === 401 || status === 403) {
    return new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
      status
    );
  }
  if (status === 429) {
    return new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRateLimited,
      status
    );
  }
  return new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected,
    status
  );
};

const combinedSignal = (
  source: AbortSignal | undefined,
  timeoutMs: number
): Readonly<{ signal: AbortSignal; close(): void }> => {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  if (source?.aborted) abort();
  else source?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  return Object.freeze({
    signal: controller.signal,
    close() {
      clearTimeout(timeout);
      source?.removeEventListener('abort', abort);
    },
  });
};

export class AgentEvaluationProviderTransport implements AgentNativeProviderTransport {
  readonly #config: Extract<AgentEvaluationRunnerConfig, { enabled: true }>;
  readonly #secrets: AgentProviderSecretResolver;
  readonly #resolvePayload: AgentEvaluationProviderPayloadResolver;
  readonly #resolveDispatchIntentAuthority?: AgentEvaluationTransportDispatchIntentAuthorityResolver;
  readonly #fetcher: AgentEvaluationFetch;
  readonly #resolveHost?: AgentEvaluationHostResolver;
  readonly #now: () => Date;
  readonly #observe?: (event: AgentEvaluationTransportObservation) => void;
  readonly #putDispatchIntent?: (
    input: AgentEvaluationTransportDispatchFenceInput
  ) => unknown | Promise<unknown>;
  readonly #recordReceipt?: (
    receipt: AgentEvaluationTransportReceipt
  ) => unknown | Promise<unknown>;
  readonly #closeTransport?: (
    input: AgentEvaluationTransportCloseInput
  ) => unknown | Promise<unknown>;
  readonly #resultSpoolCipher?: AgentEvaluationResultSpoolCipher;
  readonly #resultSpoolNamespaceDigest?: string;
  readonly #resolveNativeOptionalCapabilityBootstrap?: AgentEvaluationNativeOptionalCapabilityBootstrapResolver;
  readonly #recoverNativeOptionalCapabilityBootstrap?: AgentEvaluationNativeOptionalCapabilityBootstrapRecovery;
  readonly #active = new Map<
    string,
    Readonly<{ requestDigest: string; controller: AbortController }>
  >();

  constructor(input: CreateAgentEvaluationProviderTransportInput) {
    this.#config = requireEnabledAgentEvaluationRunnerConfig(input.config);
    for (const protocolFamily of Object.keys(
      AGENT_EVALUATION_PROVIDER_DEFINITIONS
    ) as AgentEvaluationNativeProtocol[]) {
      const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
      const provider = this.#config.providers[protocolFamily];
      if (
        !provider ||
        provider.protocolFamily !== protocolFamily ||
        provider.providerConfigurationId !==
          definition.providerConfigurationId ||
        provider.endpoint !== definition.endpoint ||
        provider.endpointId !== definition.endpointId ||
        provider.secretRef !== definition.secretRef ||
        !canonicalMetadata(provider.modelId)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
    }
    this.#secrets = input.secrets;
    this.#resolvePayload = input.resolvePayload;
    this.#resolveDispatchIntentAuthority = input.resolveDispatchIntentAuthority;
    this.#fetcher = input.fetcher ?? agentEvaluationEgressBoundFetch;
    this.#resolveHost = input.resolveHost;
    this.#now = input.now ?? (() => new Date());
    this.#observe = input.observe;
    this.#putDispatchIntent = input.putDispatchIntent;
    this.#recordReceipt = input.recordReceipt;
    this.#closeTransport = input.closeTransport;
    this.#resultSpoolCipher = input.resultSpoolCipher;
    this.#resolveNativeOptionalCapabilityBootstrap =
      input.resolveNativeOptionalCapabilityBootstrap;
    this.#recoverNativeOptionalCapabilityBootstrap =
      input.recoverNativeOptionalCapabilityBootstrap;
    this.#resultSpoolNamespaceDigest =
      input.responseSpoolEncryption?.namespaceDigest;
    const spoolFeatures = [
      input.closeTransport,
      input.resultSpoolCipher,
      input.responseSpoolEncryption,
    ].filter((value) => value !== undefined).length;
    if (
      (spoolFeatures !== 0 && spoolFeatures !== 3) ||
      (input.resolveNativeOptionalCapabilityBootstrap !== undefined &&
        spoolFeatures !== 3) ||
      (input.recoverNativeOptionalCapabilityBootstrap !== undefined &&
        spoolFeatures !== 3) ||
      (input.resolveNativeOptionalCapabilityBootstrap !== undefined) !==
        (input.recoverNativeOptionalCapabilityBootstrap !== undefined) ||
      (input.closeTransport !== undefined && input.recordReceipt !== undefined)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (
      input.responseSpoolEncryption &&
      (input.responseSpoolEncryption.algorithm !== 'AES-256-GCM' ||
        input.responseSpoolEncryption.maximumPlaintextBytes !==
          AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
        !isAgentCanonicalDigest(
          input.responseSpoolEncryption.namespaceDigest
        ) ||
        input.resultSpoolCipher?.authority.keyId !==
          input.responseSpoolEncryption.keyId ||
        input.resultSpoolCipher?.authority.keyVersion !==
          input.responseSpoolEncryption.keyVersion ||
        input.resultSpoolCipher?.authority.keyRefDigest !==
          input.responseSpoolEncryption.keyRefDigest ||
        input.resultSpoolCipher?.authority.encryptionProfileDigest !==
          input.responseSpoolEncryption.encryptionProfileDigest)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
  }

  #emitObservation(event: AgentEvaluationTransportObservation): void {
    try {
      this.#observe?.(event);
    } catch {
      // Optional telemetry is isolated from the credential transport boundary.
    }
  }

  async #tryCloseTransport(
    receipt: AgentEvaluationTransportReceipt,
    resultSpoolPlaintext?: AgentEvaluationResultSpoolPlaintext,
    responseDigest?: string,
    nativeBootstrapContext?: Readonly<{
      descriptor: AgentModelEvaluationAttemptDescriptor;
      turnIndex: number;
      request: AgentNativeProviderTransportRequest;
      providerEvents: readonly unknown[];
      runtimeEvents: readonly AgentNativeProviderRuntimeFactEnvelope[];
    }>
  ): Promise<boolean> {
    try {
      if (this.#closeTransport && this.#resultSpoolCipher) {
        const encryptedResultSpool = resultSpoolPlaintext
          ? await this.#resultSpoolCipher.encrypt(resultSpoolPlaintext)
          : undefined;
        const nativeBootstrapResolution =
          encryptedResultSpool &&
          resultSpoolPlaintext &&
          responseDigest &&
          nativeBootstrapContext &&
          this.#resolveNativeOptionalCapabilityBootstrap
            ? await this.#resolveNativeOptionalCapabilityBootstrap(
                Object.freeze({
                  ...nativeBootstrapContext,
                  transportReceipt: receipt,
                  responseDigest,
                  resultSpoolAad: resultSpoolPlaintext.aad,
                  encryptedResultSpool,
                })
              )
            : undefined;
        const nativeOptionalCapabilityBootstrapIngress =
          nativeBootstrapResolution &&
          encryptedResultSpool &&
          resultSpoolPlaintext &&
          responseDigest &&
          nativeBootstrapContext
            ? createAgentEvaluationNativeOptionalCapabilityBootstrapCloseIngress(
                {
                  descriptor: nativeBootstrapContext.descriptor,
                  turnIndex: nativeBootstrapContext.turnIndex,
                  request: nativeBootstrapContext.request,
                  transportReceipt: receipt,
                  responseDigest,
                  resultSpoolAad: resultSpoolPlaintext.aad,
                  encryptedResultSpool,
                  resolution: nativeBootstrapResolution,
                }
              )
            : undefined;
        const closeInput = Object.freeze({
          receipt,
          ...(responseDigest ? { responseDigest } : {}),
          ...(encryptedResultSpool && resultSpoolPlaintext
            ? {
                resultSpoolAad: resultSpoolPlaintext.aad,
                encryptedResultSpool,
              }
            : {}),
          ...(nativeOptionalCapabilityBootstrapIngress
            ? { nativeOptionalCapabilityBootstrapIngress }
            : {}),
        });
        try {
          await this.#closeTransport(closeInput);
        } catch (caught) {
          if (
            !nativeOptionalCapabilityBootstrapIngress ||
            !nativeBootstrapResolution ||
            !this.#recoverNativeOptionalCapabilityBootstrap
          ) {
            throw caught;
          }
          const recovered =
            await this.#recoverNativeOptionalCapabilityBootstrap(
              Object.freeze({
                ingress: nativeOptionalCapabilityBootstrapIngress,
                program: nativeBootstrapResolution.program,
              })
            );
          if (recovered === 'missing') {
            await this.#closeTransport(closeInput);
          } else if (recovered !== 'sealed') {
            throw caught;
          }
        }
      } else {
        resultSpoolPlaintext?.canonicalEventBytes.fill(0);
        await this.#recordReceipt?.(receipt);
      }
      return true;
    } catch {
      resultSpoolPlaintext?.canonicalEventBytes.fill(0);
      return false;
    }
  }

  async execute(
    request: AgentNativeProviderTransportRequest,
    signal?: AbortSignal
  ): Promise<AgentEvaluationProviderExecution> {
    const protocolFamily =
      request.protocolFamily as AgentEvaluationNativeProtocol;
    const provider = this.#config.providers[protocolFamily];
    const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
    if (
      !provider ||
      !definition ||
      request.invocation.providerConfigurationId !==
        provider.providerConfigurationId ||
      !canonicalMetadata(request.invocation.invocationId) ||
      !isAgentCanonicalDigest(request.invocation.requestDigest) ||
      !isAgentCanonicalDigest(request.invocation.modelLineageDigest) ||
      !isAgentCanonicalDigest(request.invocation.capabilityProfileDigest) ||
      !isAgentCanonicalDigest(
        request.invocation.inferenceConfigurationDigest
      ) ||
      !isAgentCanonicalDigest(request.invocation.contextPackDigest) ||
      (request.invocation.multimodalContextManifestDigest !== undefined &&
        !isAgentCanonicalDigest(
          request.invocation.multimodalContextManifestDigest
        )) ||
      (request.invocation.providerMediaBlockManifestDigest !== undefined &&
        !isAgentCanonicalDigest(
          request.invocation.providerMediaBlockManifestDigest
        )) ||
      this.#active.has(request.invocation.invocationId)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (signal?.aborted) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
        undefined,
        protocolFamily
      );
    }
    let payload: AgentEvaluationProviderPayload;
    try {
      payload = await this.#resolvePayload(request);
    } catch {
      if (signal?.aborted) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
          undefined,
          protocolFamily
        );
      }
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    let dispatchAuthority: AgentEvaluationTransportDispatchIntentAuthority;
    try {
      if (!this.#resolveDispatchIntentAuthority) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
        );
      }
      dispatchAuthority = await this.#resolveDispatchIntentAuthority(request);
    } catch {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (
      !isPlainObject(dispatchAuthority) ||
      Object.keys(dispatchAuthority).length !== 5 ||
      !isAgentModelEvaluationAttemptDescriptor(dispatchAuthority.descriptor) ||
      !/^[0-9a-f]{40}$/u.test(dispatchAuthority.repositoryCommit) ||
      !Number.isSafeInteger(dispatchAuthority.turnIndex) ||
      dispatchAuthority.turnIndex < 0 ||
      !isAgentControlIdentity(dispatchAuthority.budgetReservationId) ||
      !isAgentCanonicalDigest(dispatchAuthority.demandDigest) ||
      (payload.resultSpoolAuthority?.opaqueContinuationDigest !== undefined &&
        !isAgentCanonicalDigest(
          payload.resultSpoolAuthority.opaqueContinuationDigest
        ))
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (
      payload.protectedLeakCanaries !== undefined &&
      (payload.protectedLeakCanaries.length === 0 ||
        payload.protectedLeakCanaries.length > 1_024 ||
        new Set(payload.protectedLeakCanaries).size !==
          payload.protectedLeakCanaries.length ||
        payload.protectedLeakCanaries.some(
          (canary) =>
            typeof canary !== 'string' ||
            canary.length < 8 ||
            canary.length > 512
        ))
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    if (signal?.aborted) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
        undefined,
        protocolFamily
      );
    }
    const capabilityRuntimeRequest = payload.capabilityRuntimeRequestMaterial
      ? resolveCapabilityRuntimeRequest(
          payload.capabilityRuntimeRequestMaterial,
          request,
          provider
        )
      : undefined;
    const body =
      capabilityRuntimeRequest?.body ??
      buildRequestBody(protocolFamily, provider.modelId, payload.body);
    const endpoint = capabilityRuntimeRequest?.endpoint ?? provider.endpoint;
    const requestBytes =
      capabilityRuntimeRequest?.requestBytes ??
      textEncoder.encode(body).byteLength;
    const requestBodyDigest =
      capabilityRuntimeRequest?.requestBodyDigest ?? sha256Digest(body);
    const timeoutMs = payload.timeoutMs ?? defaultTimeoutMs;
    const maximumResponseBytes =
      payload.maximumResponseBytes ?? defaultMaximumResponseBytes;
    const authorizedEgress = await (capabilityRuntimeRequest
      ? authorizeAgentEvaluationCapabilityProbeEgress({
          protocolFamily,
          method: 'POST',
          endpoint,
          requestBytes,
          maximumResponseBytes,
          timeoutMs,
          ...(this.#resolveHost ? { resolveHost: this.#resolveHost } : {}),
        })
      : authorizeAgentEvaluationEgress({
          protocolFamily,
          endpoint,
          requestBytes,
          maximumResponseBytes,
          timeoutMs,
          ...(this.#resolveHost ? { resolveHost: this.#resolveHost } : {}),
        }));
    if (signal?.aborted) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted,
        undefined,
        protocolFamily
      );
    }

    const startedAt = this.#now().toISOString();
    const dispatchIntent = createDispatchIntent({
      planDigest: dispatchAuthority.descriptor.planDigest,
      repositoryCommit: dispatchAuthority.repositoryCommit,
      attemptId: dispatchAuthority.descriptor.attemptId,
      descriptorDigest: dispatchAuthority.descriptor.descriptorDigest,
      turnIndex: dispatchAuthority.turnIndex,
      budgetReservationId: dispatchAuthority.budgetReservationId,
      demandDigest: dispatchAuthority.demandDigest,
      protocolFamily,
      providerConfigurationId: provider.providerConfigurationId,
      modelLineageDigest: request.invocation.modelLineageDigest,
      inferenceConfigurationDigest:
        request.invocation.inferenceConfigurationDigest,
      invocationId: request.invocation.invocationId,
      requestDigest: request.invocation.requestDigest,
      endpointId: provider.endpointId,
      requestBodyDigest,
      requestBytes,
      createdAt: startedAt,
    });
    const activeController = new AbortController();
    this.#active.set(request.invocation.invocationId, {
      requestDigest: request.invocation.requestDigest,
      controller: activeController,
    });
    const callerAbort = (): void => activeController.abort();
    if (signal?.aborted) callerAbort();
    else signal?.addEventListener('abort', callerAbort, { once: true });
    this.#emitObservation(
      Object.freeze({
        phase: 'started',
        protocolFamily,
        providerConfigurationId: provider.providerConfigurationId,
        invocationId: request.invocation.invocationId,
        requestDigest: request.invocation.requestDigest,
        endpointId: provider.endpointId,
        requestBytes,
        occurredAt: startedAt,
      })
    );

    let httpStatus: number | undefined;
    let responseHeaderDigest: string | undefined;
    let responseBodyDigest: string | undefined;
    let providerRequestId: string | undefined;
    let responseBytes = 0;
    let observedSseEventCount = 0;
    let dispatched = false;
    try {
      const result = await this.#secrets.use(
        {
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          secretRef: provider.secretRef,
          purpose: 'model-invocation',
          runtimeZone: 'server',
          useId: `${request.invocation.invocationId}:${request.invocation.requestDigest}`,
        },
        async (material) => {
          const signatures = createCredentialCanarySignatures(material);
          if (textContainsCredentialCanary(body, signatures)) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
            );
          }
          let credential = textDecoder.decode(material);
          const headers = buildHeaders(protocolFamily, credential);
          const boundedSignal = combinedSignal(
            activeController.signal,
            timeoutMs
          );
          try {
            let response: Response;
            try {
              await this.#putDispatchIntent?.(
                Object.freeze({
                  descriptor: dispatchAuthority.descriptor,
                  intent: dispatchIntent,
                })
              );
            } catch {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
              );
            }
            try {
              dispatched = true;
              response = await this.#fetcher(
                endpoint,
                {
                  method: 'POST',
                  headers,
                  body,
                  redirect: 'manual',
                  cache: 'no-store',
                  signal: boundedSignal.signal,
                },
                authorizedEgress.approvedAddresses
              );
            } catch (caught) {
              if (boundedSignal.signal.aborted) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
                );
              }
              const safeError = safeRunnerError(caught);
              if (
                safeError.code ===
                AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
              ) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
                );
              }
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed
              );
            } finally {
              clearCredentialHeaders(headers);
              credential = '';
            }

            httpStatus = response.status;
            const headerMetadata = selectedResponseHeaderMetadata(
              protocolFamily,
              response.headers,
              signatures
            );
            responseHeaderDigest = headerMetadata.digest;
            providerRequestId = headerMetadata.providerRequestId;
            if (!response.ok) {
              await response.body?.cancel().catch(() => undefined);
              throw statusError(response.status);
            }
            let responseBytesValue: Uint8Array;
            try {
              responseBytesValue = await readBoundedResponse(
                response,
                maximumResponseBytes
              );
            } catch (caught) {
              if (boundedSignal.signal.aborted) {
                throw new AgentEvaluationRunnerError(
                  AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
                );
              }
              throw caught;
            }
            responseBytes = responseBytesValue.byteLength;
            const responseBodyDigestValue = sha256Digest(responseBytesValue);
            responseBodyDigest = responseBodyDigestValue;
            let responseText: string;
            try {
              responseText = textDecoder.decode(responseBytesValue);
            } catch {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            if (textContainsCredentialCanary(responseText, signatures)) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
              );
            }
            const contentType = responseMediaType(response.headers);
            const isSse = contentType === 'text/event-stream';
            const isJson = isJsonMediaType(contentType);
            if (
              (!isSse && !isJson) ||
              (capabilityRuntimeRequest !== undefined && !isJson)
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
              );
            }
            const events = isSse
              ? parseSseJsonEvents(responseText)
              : parseJsonEvents(responseText);
            observedSseEventCount = isSse ? events.length : 0;
            if (valueContainsCredentialCanary(events, material, signatures)) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
              );
            }
            if (
              payload.protectedLeakCanaries &&
              scanAgentArtifactForProtectedHoldoutLeak(
                events,
                payload.protectedLeakCanaries
              ).length > 0
            ) {
              throw new AgentEvaluationRunnerError(
                AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
              );
            }
            const metadata = extractProviderMetadata(protocolFamily, events);
            const runtimeFacts = normalizeNativeAgentProviderRuntimeEvents(
              protocolFamily,
              events,
              {
                invocationId: request.invocation.invocationId,
                occurredAt: startedAt,
              }
            );
            const runtimeEvents = Object.freeze(
              runtimeFacts.map((fact) =>
                createAgentNativeProviderRuntimeFactEnvelope(
                  {
                    protocolFamily,
                    invocationId: request.invocation.invocationId,
                    requestDigest: request.invocation.requestDigest,
                    providerConfigurationId:
                      request.invocation.providerConfigurationId,
                    modelLineageDigest: request.invocation.modelLineageDigest,
                    fact,
                  },
                  {
                    protectedMaterialCanaries:
                      payload.protectedLeakCanaries ?? Object.freeze([]),
                    secretCanaries: Object.freeze([
                      textDecoder.decode(material),
                    ]),
                  }
                )
              )
            );
            return Object.freeze({
              events,
              headerDigest: headerMetadata.digest,
              providerRequestId: headerMetadata.providerRequestId,
              metadata,
              responseBytes: responseBytesValue.byteLength,
              responseBodyDigest: responseBodyDigestValue,
              responseDigest: digestAgentNativeProviderRuntimeResponse(
                request.invocation.requestDigest,
                runtimeFacts
              ),
              runtimeEvents,
              sseEventCount: isSse ? events.length : 0,
            });
          } finally {
            boundedSignal.close();
            clearCredentialHeaders(headers);
            credential = '';
          }
        }
      );
      const runtimeEvents = result.runtimeEvents;
      const responseDigest = result.responseDigest;
      const completedAt = this.#now().toISOString();
      const receipt = createReceipt({
        protocolFamily,
        providerConfigurationId: provider.providerConfigurationId,
        invocationId: request.invocation.invocationId,
        requestDigest: request.invocation.requestDigest,
        endpointId: provider.endpointId,
        endpointClass: 'first-party-hosted',
        dispatchIntentDigest: dispatchIntent.intentDigest,
        requestBodyDigest,
        requestBytes,
        responseBytes: result.responseBytes,
        httpStatus,
        responseHeaderDigest: result.headerDigest,
        responseBodyDigest: result.responseBodyDigest,
        ...(result.providerRequestId
          ? { providerRequestId: result.providerRequestId }
          : {}),
        ...(result.metadata.identityKind && result.metadata.responseId
          ? {
              providerIdentityKind: result.metadata.identityKind,
              providerResponseId: result.metadata.responseId,
            }
          : {}),
        ...(result.metadata.resolvedModelId
          ? { resolvedModelId: result.metadata.resolvedModelId }
          : {}),
        ...(result.metadata.resolvedModelVersion
          ? { resolvedModelVersion: result.metadata.resolvedModelVersion }
          : {}),
        sseEventCount: result.sseEventCount,
        dispatchState: 'dispatched',
        outcome: 'completed',
        startedAt,
        completedAt,
      });
      const canonicalEventBytes = textEncoder.encode(
        canonicalJsonText(runtimeEvents)
      );
      if (
        canonicalEventBytes.byteLength < 1 ||
        canonicalEventBytes.byteLength >
          AGENT_EVALUATION_RESULT_SPOOL_MAXIMUM_PLAINTEXT_BYTES
      ) {
        canonicalEventBytes.fill(0);
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge,
          httpStatus,
          protocolFamily
        );
      }
      const resultSpoolPlaintext = this.#resultSpoolNamespaceDigest
        ? Object.freeze({
            aad: Object.freeze({
              format:
                'prodivix.agent-evaluation-provider-result-spool-aad' as const,
              version: 1 as const,
              namespaceDigest: this.#resultSpoolNamespaceDigest,
              planDigest: dispatchAuthority.descriptor.planDigest,
              repositoryCommit: dispatchAuthority.repositoryCommit,
              attemptId: dispatchAuthority.descriptor.attemptId,
              descriptorDigest: dispatchAuthority.descriptor.descriptorDigest,
              turnIndex: dispatchAuthority.turnIndex,
              invocationId: request.invocation.invocationId,
              dispatchIntentDigest: dispatchIntent.intentDigest,
              transportReceiptDigest: receipt.receiptDigest,
              responseBodyDigest: result.responseBodyDigest,
              normalizedEventSetDigest:
                digestAgentCanonicalValue(runtimeEvents),
              ...(payload.resultSpoolAuthority?.opaqueContinuationDigest
                ? {
                    opaqueContinuationDigest:
                      payload.resultSpoolAuthority.opaqueContinuationDigest,
                  }
                : {}),
            }),
            canonicalEventBytes,
          })
        : undefined;
      if (!resultSpoolPlaintext) canonicalEventBytes.fill(0);
      if (
        !(await this.#tryCloseTransport(
          receipt,
          resultSpoolPlaintext,
          responseDigest,
          Object.freeze({
            descriptor: dispatchAuthority.descriptor,
            turnIndex: dispatchAuthority.turnIndex,
            request,
            providerEvents: Object.freeze([...result.events]),
            runtimeEvents,
          })
        ))
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
          httpStatus,
          protocolFamily
        );
      }
      this.#emitObservation(
        Object.freeze({
          phase: 'completed',
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          invocationId: request.invocation.invocationId,
          requestDigest: request.invocation.requestDigest,
          endpointId: provider.endpointId,
          requestBytes,
          responseBytes: result.responseBytes,
          httpStatus,
          sseEventCount: result.sseEventCount,
          occurredAt: completedAt,
        })
      );
      return Object.freeze({
        events: result.events,
        runtimeEvents,
        receipt,
      });
    } catch (caught) {
      const safeError = safeRunnerError(caught);
      const error = new AgentEvaluationRunnerError(
        safeError.code,
        safeError.httpStatus,
        protocolFamily
      );
      const completedAt = this.#now().toISOString();
      const receipt = createReceipt({
        protocolFamily,
        providerConfigurationId: provider.providerConfigurationId,
        invocationId: request.invocation.invocationId,
        requestDigest: request.invocation.requestDigest,
        endpointId: provider.endpointId,
        endpointClass: 'first-party-hosted',
        dispatchIntentDigest: dispatchIntent.intentDigest,
        requestBodyDigest,
        requestBytes,
        responseBytes,
        ...(httpStatus === undefined ? {} : { httpStatus }),
        ...(responseHeaderDigest === undefined ? {} : { responseHeaderDigest }),
        ...(responseBodyDigest === undefined ? {} : { responseBodyDigest }),
        ...(providerRequestId === undefined ? {} : { providerRequestId }),
        sseEventCount: observedSseEventCount,
        dispatchState: dispatched ? 'dispatched' : 'not-dispatched',
        outcome: 'failed',
        errorCategory: durableTransportErrorCategory(error.code),
        startedAt,
        completedAt,
      });
      if (error.code !== AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed) {
        if (!(await this.#tryCloseTransport(receipt))) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed,
            httpStatus,
            protocolFamily
          );
        }
      }
      this.#emitObservation(
        Object.freeze({
          phase: 'failed',
          protocolFamily,
          providerConfigurationId: provider.providerConfigurationId,
          invocationId: request.invocation.invocationId,
          requestDigest: request.invocation.requestDigest,
          endpointId: provider.endpointId,
          requestBytes,
          responseBytes,
          ...(httpStatus === undefined ? {} : { httpStatus }),
          sseEventCount: observedSseEventCount,
          errorCategory: error.code,
          occurredAt: completedAt,
        })
      );
      throw error;
    } finally {
      signal?.removeEventListener('abort', callerAbort);
      this.#active.delete(request.invocation.invocationId);
    }
  }

  async *stream(
    request: AgentNativeProviderTransportRequest,
    signal?: AbortSignal
  ): AsyncIterable<unknown> {
    const execution = await this.execute(request, signal);
    for (const event of execution.runtimeEvents) yield event;
  }

  async cancel(
    request: AgentNativeProviderControlRequest
  ): Promise<Readonly<{ cancelled: boolean }>> {
    const active = this.#active.get(request.invocationId);
    if (!active || active.requestDigest !== request.requestDigest) {
      return Object.freeze({ cancelled: false });
    }
    active.controller.abort();
    return Object.freeze({ cancelled: true });
  }
}

export const createAgentEvaluationProviderTransport = (
  input: CreateAgentEvaluationProviderTransportInput
): AgentEvaluationProviderTransport =>
  new AgentEvaluationProviderTransport(input);

/** Production construction always uses the address-pinned HTTPS port and durable fences. */
export const createAgentEvaluationProductionProviderTransport = (
  input: CreateAgentEvaluationProductionProviderTransportInput
): AgentEvaluationProviderTransport =>
  new AgentEvaluationProviderTransport({
    ...input,
    fetcher: agentEvaluationEgressBoundFetch,
    putDispatchIntent: async (fenceInput) => {
      const acknowledgement = await input.putDispatchIntent(fenceInput);
      if (
        !isPlainObject(acknowledgement) ||
        Object.keys(acknowledgement).length !== 2 ||
        acknowledgement.intentDigest !== fenceInput.intent.intentDigest ||
        acknowledgement.disposition !== 'created'
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
    },
    resultSpoolCipher: input.resultSpoolCipher,
    responseSpoolEncryption: input.responseSpoolEncryption,
    closeTransport: async (closeInput) => {
      const completed = closeInput.receipt.outcome === 'completed';
      if (
        completed !== (closeInput.responseDigest !== undefined) ||
        (closeInput.responseDigest !== undefined &&
          !isAgentCanonicalDigest(closeInput.responseDigest)) ||
        completed !== (closeInput.resultSpoolAad !== undefined) ||
        completed !== (closeInput.encryptedResultSpool !== undefined) ||
        (closeInput.resultSpoolAad !== undefined &&
          (closeInput.resultSpoolAad.dispatchIntentDigest !==
            closeInput.receipt.dispatchIntentDigest ||
            closeInput.resultSpoolAad.transportReceiptDigest !==
              closeInput.receipt.receiptDigest ||
            closeInput.resultSpoolAad.responseBodyDigest !==
              closeInput.receipt.responseBodyDigest ||
            closeInput.encryptedResultSpool?.aadDigest !==
              digestAgentCanonicalValue(closeInput.resultSpoolAad)))
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
      const acknowledgement = await input.closeTransport(closeInput);
      const expectedKeyCount = completed ? 4 : 3;
      if (
        !isPlainObject(acknowledgement) ||
        Object.keys(acknowledgement).length !== expectedKeyCount ||
        acknowledgement.dispatchIntentDigest !==
          closeInput.receipt.dispatchIntentDigest ||
        acknowledgement.transportReceiptDigest !==
          closeInput.receipt.receiptDigest ||
        acknowledgement.disposition !== 'closed' ||
        (completed
          ? acknowledgement.resultSpoolDigest !==
            closeInput.encryptedResultSpool?.envelopeDigest
          : acknowledgement.resultSpoolDigest !== undefined)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.captureFailed
        );
      }
    },
  });
