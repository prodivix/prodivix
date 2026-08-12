import {
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import type { AgentEvaluationNativeProtocol } from './config';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  authorizeAgentEvaluationHostedRetrievalProviderResourceEgress,
  type AgentEvaluationHostResolver,
  type AgentEvaluationHostedRetrievalProviderResourceEgressMethod,
} from './egress';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  createCredentialCanarySignatures,
  EnvironmentAgentProviderSecretResolver,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
  type AgentProviderSecretResolver,
  type AgentProviderSecretUseRequest,
} from './secretResolver';

const transportCloseReceiptFormat =
  'prodivix.agent-evaluation-provider-resource-transport-close-receipt' as const;
const requestProjectionFormat =
  'prodivix.agent-evaluation-provider-resource-request-projection' as const;
const version = 1 as const;
const maximumProviderResponseBytes = 1_048_576;
const maximumResponseHeaders = 128;
const maximumResponseHeaderBytes = 32_768;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

export type AgentEvaluationProviderResourceRequestProjection = Readonly<{
  format: typeof requestProjectionFormat;
  version: typeof version;
  protocolFamily: Extract<
    AgentEvaluationNativeProtocol,
    'gemini-interactions' | 'openai-responses'
  >;
  method: AgentEvaluationHostedRetrievalProviderResourceEgressMethod;
  endpoint: string;
  queryEntries: readonly Readonly<{
    name: string;
    valueDigest: CanonicalDigest;
  }>[];
  requestBytes: number;
  requestBodyDigest: CanonicalDigest | null;
}>;

export type AgentEvaluationProviderResourceRequest = Readonly<{
  protocolFamily: Extract<
    AgentEvaluationNativeProtocol,
    'gemini-interactions' | 'openai-responses'
  >;
  method: AgentEvaluationHostedRetrievalProviderResourceEgressMethod;
  endpoint: string;
  body?: string | Uint8Array;
  headers?: Readonly<Record<string, string>>;
  signal: AbortSignal;
  acceptedStatuses?: readonly number[];
}>;

export type AgentEvaluationProviderResourceResponse = Readonly<{
  body: unknown;
  status: number;
  providerRequestId: string | null;
  continuationEndpoint: string | null;
  requestBytes: number;
  responseBytes: number;
  requestProjection: AgentEvaluationProviderResourceRequestProjection;
  requestProjectionDigest: CanonicalDigest;
  responseProjection: Readonly<{ status: number; body: unknown }>;
  responseProjectionDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest;
  startedAt: Instant;
  completedAt: Instant;
}>;

export type AgentEvaluationProviderResourceTransportSession = Readonly<{
  execute(
    request: AgentEvaluationProviderResourceRequest
  ): Promise<AgentEvaluationProviderResourceResponse>;
}>;

export type AgentEvaluationProviderResourceTransportCloseReceipt = Readonly<{
  format: typeof transportCloseReceiptFormat;
  version: typeof version;
  status: 'clean';
  acceptedSessionCount: number;
  completedSessionCount: number;
  inFlightSessionCount: 0;
  closedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationProviderResourceTransport = Readonly<{
  use<T>(
    request: AgentProviderSecretUseRequest,
    consumer: (
      session: AgentEvaluationProviderResourceTransportSession
    ) => Promise<T>
  ): Promise<T>;
  close(): Promise<AgentEvaluationProviderResourceTransportCloseReceipt>;
}>;

export type CreateAgentEvaluationProviderResourceTransportInput = Readonly<{
  environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
  secrets?: AgentProviderSecretResolver;
  fetch?: AgentEvaluationEgressBoundFetch;
  resolveHost?: AgentEvaluationHostResolver;
  clock?: () => Instant;
}>;

const configurationInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const currentInstant = (): Instant => new Date().toISOString() as Instant;

const canonicalInstant = (clock: () => Instant): Instant => {
  const value = clock();
  if (!isAgentControlInstant(value)) return configurationInvalid();
  return value;
};

const concatenate = (parts: readonly Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0)
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const boundedResponseBytes = async (
  response: Response
): Promise<Uint8Array> => {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength !== null &&
    (!/^\d+$/u.test(contentLength) ||
      Number(contentLength) > maximumProviderResponseBytes)
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
    );
  }
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumProviderResponseBytes) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
        );
      }
      chunks.push(value);
    }
    return concatenate(chunks);
  } finally {
    reader.releaseLock();
  }
};

const providerError = (
  status: number,
  protocolFamily: AgentEvaluationProviderResourceRequest['protocolFamily']
): AgentEvaluationRunnerError =>
  status === 401 || status === 403
    ? new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected,
        status,
        protocolFamily
      )
    : status === 429
      ? new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRateLimited,
          status,
          protocolFamily
        )
      : new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected,
          status,
          protocolFamily
        );

const cloneBody = (
  body: AgentEvaluationProviderResourceRequest['body']
): string | Uint8Array | undefined =>
  typeof body === 'string'
    ? body
    : body === undefined
      ? undefined
      : Uint8Array.from(body);

const bodyByteLength = (body: string | Uint8Array | undefined): number =>
  typeof body === 'string'
    ? textEncoder.encode(body).byteLength
    : (body?.byteLength ?? 0);

export const projectAgentEvaluationProviderResourceRequest = (
  request: Pick<
    AgentEvaluationProviderResourceRequest,
    'body' | 'endpoint' | 'headers' | 'method' | 'protocolFamily'
  >
): AgentEvaluationProviderResourceRequestProjection => {
  let endpoint: URL;
  try {
    endpoint = new URL(request.endpoint);
  } catch {
    return configurationInvalid();
  }
  const body = cloneBody(request.body);
  const requestBytes = bodyByteLength(body);
  const queryEntries = Object.freeze(
    [...endpoint.searchParams.entries()]
      .map(([name, value]) =>
        Object.freeze({
          name,
          valueDigest: digestAgentCanonicalValue(value),
        })
      )
      .sort((left, right) => {
        const byName = compareUnicodeCodePoints(left.name, right.name);
        return byName !== 0
          ? byName
          : compareUnicodeCodePoints(left.valueDigest, right.valueDigest);
      })
  );
  return Object.freeze({
    format: requestProjectionFormat,
    version,
    protocolFamily: request.protocolFamily,
    method: request.method,
    endpoint: endpoint.pathname,
    queryEntries,
    requestBytes,
    requestBodyDigest:
      body === undefined
        ? null
        : digestAgentCanonicalValue({
            byteLength: requestBytes,
            body:
              typeof body === 'string'
                ? body
                : Buffer.from(body).toString('base64'),
          }),
  });
};

const safeResponseMetadata = (
  headers: Headers,
  request: AgentEvaluationProviderResourceRequest,
  credential: Uint8Array,
  signatures: readonly string[]
): Readonly<{
  providerRequestId: string | null;
  continuationEndpoint: string | null;
}> => {
  const entries = [...headers.entries()].sort(([left], [right]) =>
    compareUnicodeCodePoints(left, right)
  );
  const serialized = entries
    .map(([name, value]) => `${name}:${value}`)
    .join('\n');
  if (
    entries.length > maximumResponseHeaders ||
    textEncoder.encode(serialized).byteLength > maximumResponseHeaderBytes
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  if (
    textContainsCredentialCanary(serialized, signatures) ||
    valueContainsCredentialCanary(entries, credential, signatures)
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
    );
  }
  const projected = Object.fromEntries(entries);
  let providerRequestId: string | null = null;
  for (const name of ['x-request-id', 'request-id', 'x-goog-request-id']) {
    const value = projected[name];
    if (value !== undefined && isAgentControlIdentity(value)) {
      providerRequestId = value;
      break;
    }
  }
  const uploadUrl = projected['x-goog-upload-url'];
  let continuationEndpoint: string | null = null;
  if (uploadUrl !== undefined) {
    let endpoint: URL;
    try {
      endpoint = new URL(uploadUrl);
    } catch {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
    const requestHeaders = new Headers(request.headers);
    const keys = [...endpoint.searchParams.keys()];
    if (
      request.protocolFamily !== 'gemini-interactions' ||
      request.method !== 'POST' ||
      requestHeaders.get('x-goog-upload-command') !== 'start' ||
      endpoint.origin !== 'https://generativelanguage.googleapis.com' ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.port !== '' ||
      endpoint.hash !== '' ||
      !/^\/upload\/v1\/fileSearchStores\/[a-z0-9-]{1,64}:uploadToFileSearchStore$/u.test(
        endpoint.pathname
      ) ||
      keys.length < 1 ||
      keys.length > 2 ||
      new Set(keys).size !== keys.length ||
      keys.some((key) => key !== 'upload_id' && key !== 'upload_protocol') ||
      [...endpoint.searchParams.values()].some(
        (value) =>
          value.length < 1 ||
          value.length > 2_048 ||
          !/^[A-Za-z0-9._~-]+$/u.test(value)
      )
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
    continuationEndpoint = endpoint.href;
  }
  return Object.freeze({ providerRequestId, continuationEndpoint });
};

export const createAgentEvaluationProviderResourceTransport = (
  input: CreateAgentEvaluationProviderResourceTransportInput = {}
): AgentEvaluationProviderResourceTransport => {
  const environment = input.environment ?? process.env;
  const secrets =
    input.secrets ?? new EnvironmentAgentProviderSecretResolver(environment);
  const boundFetch = input.fetch ?? agentEvaluationEgressBoundFetch;
  const clock = input.clock ?? currentInstant;
  const activeSessions = new Set<Promise<unknown>>();
  let acceptedSessionCount = 0;
  let completedSessionCount = 0;
  let closed = false;
  let closePromise:
    Promise<AgentEvaluationProviderResourceTransportCloseReceipt> | undefined;

  const use = async <T>(
    secretRequest: AgentProviderSecretUseRequest,
    consumer: (
      session: AgentEvaluationProviderResourceTransportSession
    ) => Promise<T>
  ): Promise<T> => {
    if (closed || typeof consumer !== 'function') return configurationInvalid();
    acceptedSessionCount += 1;
    let callbackOpen = true;
    const operation = secrets.use(secretRequest, async (credential) => {
      const signatures = createCredentialCanarySignatures(credential);
      const execute = async (
        request: AgentEvaluationProviderResourceRequest
      ): Promise<AgentEvaluationProviderResourceResponse> => {
        if (
          !callbackOpen ||
          request.signal.aborted ||
          request.protocolFamily !== secretRequest.protocolFamily ||
          (request.method !== 'DELETE' &&
            request.method !== 'GET' &&
            request.method !== 'POST') ||
          (request.method === 'POST'
            ? request.body === undefined || bodyByteLength(request.body) < 1
            : request.body !== undefined) ||
          (request.acceptedStatuses !== undefined &&
            (request.acceptedStatuses.length < 1 ||
              request.acceptedStatuses.length > 16 ||
              new Set(request.acceptedStatuses).size !==
                request.acceptedStatuses.length ||
              request.acceptedStatuses.some(
                (status) =>
                  !Number.isSafeInteger(status) || status < 100 || status > 599
              )))
        ) {
          return configurationInvalid();
        }
        const startedAt = canonicalInstant(clock);
        const body = cloneBody(request.body);
        const requestBytes = bodyByteLength(body);
        const requestProjection = projectAgentEvaluationProviderResourceRequest(
          {
            protocolFamily: request.protocolFamily,
            method: request.method,
            endpoint: request.endpoint,
            ...(body === undefined ? {} : { body }),
            ...(request.headers === undefined
              ? {}
              : { headers: request.headers }),
          }
        );
        const admission =
          await authorizeAgentEvaluationHostedRetrievalProviderResourceEgress({
            protocolFamily: request.protocolFamily,
            method: request.method,
            endpoint: request.endpoint,
            requestBytes,
            maximumResponseBytes: maximumProviderResponseBytes,
            timeoutMs: 30_000,
            ...(input.resolveHost === undefined
              ? {}
              : { resolveHost: input.resolveHost }),
          });
        let credentialText: string;
        try {
          credentialText = textDecoder.decode(credential);
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
          );
        }
        const headers = new Headers(request.headers);
        if (
          headers.has('authorization') ||
          headers.has('x-goog-api-key') ||
          (request.protocolFamily === 'openai-responses' &&
            request.method === 'POST' &&
            (headers.get('idempotency-key') === null ||
              !/^[A-Za-z0-9][A-Za-z0-9._:@-]{15,1023}$/u.test(
                headers.get('idempotency-key')!
              ))) ||
          valueContainsCredentialCanary(
            Object.freeze([...headers.entries()]),
            credential,
            signatures
          ) ||
          (body !== undefined &&
            valueContainsCredentialCanary(body, credential, signatures))
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
          );
        }
        if (request.protocolFamily === 'openai-responses') {
          headers.set('Authorization', `Bearer ${credentialText}`);
        } else {
          headers.set('x-goog-api-key', credentialText);
        }
        let response: Response;
        try {
          response = await boundFetch(
            request.endpoint,
            {
              method: request.method,
              headers,
              ...(body === undefined
                ? {}
                : { body: body as unknown as BodyInit }),
              redirect: 'manual',
              signal: request.signal,
            },
            admission.approvedAddresses
          );
        } catch (caught) {
          throw safeRunnerError(caught);
        }
        const responseBytes = await boundedResponseBytes(response);
        let text: string;
        try {
          text = textDecoder.decode(responseBytes);
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
          );
        }
        let value: unknown = null;
        if (text.length > 0) {
          try {
            value = JSON.parse(text) as unknown;
          } catch {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
            );
          }
        }
        const responseMetadata = safeResponseMetadata(
          response.headers,
          request,
          credential,
          signatures
        );
        if (
          textContainsCredentialCanary(text, signatures) ||
          valueContainsCredentialCanary(value, credential, signatures)
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
          );
        }
        if (
          inspectAgentControlJson(value, maximumProviderResponseBytes).length >
          0
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
          );
        }
        const accepted = request.acceptedStatuses ?? [200, 201];
        if (!accepted.includes(response.status)) {
          throw providerError(response.status, request.protocolFamily);
        }
        const responseProjection = Object.freeze({
          status: response.status,
          body: value,
        });
        return Object.freeze({
          body: value,
          status: response.status,
          providerRequestId: responseMetadata.providerRequestId,
          continuationEndpoint: responseMetadata.continuationEndpoint,
          requestBytes,
          responseBytes: responseBytes.byteLength,
          requestProjection,
          requestProjectionDigest: digestAgentCanonicalValue(requestProjection),
          responseProjection,
          responseProjectionDigest:
            digestAgentCanonicalValue(responseProjection),
          responseBodyDigest: digestAgentCanonicalValue({
            byteLength: responseBytes.byteLength,
            body: Buffer.from(responseBytes).toString('base64'),
          }),
          startedAt,
          completedAt: canonicalInstant(clock),
        });
      };
      const session = Object.freeze({ execute });
      try {
        return await consumer(session);
      } finally {
        callbackOpen = false;
      }
    });
    const tracked = operation.finally(() => {
      completedSessionCount += 1;
      activeSessions.delete(tracked);
    });
    activeSessions.add(tracked);
    return await tracked;
  };

  const close =
    (): Promise<AgentEvaluationProviderResourceTransportCloseReceipt> => {
      if (closePromise !== undefined) return closePromise;
      closed = true;
      const pending = Object.freeze([...activeSessions]);
      closePromise = (async () => {
        await Promise.allSettled(pending);
        const base = Object.freeze({
          format: transportCloseReceiptFormat,
          version,
          status: 'clean' as const,
          acceptedSessionCount,
          completedSessionCount,
          inFlightSessionCount: 0 as const,
          closedAt: canonicalInstant(clock),
        });
        return Object.freeze({
          ...base,
          receiptDigest: digestAgentCanonicalValue(base),
        });
      })();
      return closePromise;
    };

  return Object.freeze({ use, close });
};
