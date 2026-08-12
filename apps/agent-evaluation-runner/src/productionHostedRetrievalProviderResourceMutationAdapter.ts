import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
  type AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt,
  type AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest,
  type CanonicalDigest,
  type Instant,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  projectAgentEvaluationProviderResourceRequest,
  type AgentEvaluationProviderResourceRequest,
  type AgentEvaluationProviderResourceRequestProjection,
  type AgentEvaluationProviderResourceResponse,
  type AgentEvaluationProviderResourceTransportSession,
} from './productionProviderResourceTransport';
import { containsAsciiControlCharacter } from './textSafety';

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS =
  Object.freeze({
    openAiFiles: 'endpoint.openai.hosted-retrieval.files',
    openAiVectorStores: 'endpoint.openai.hosted-retrieval.vector-stores',
    geminiFileSearchStores:
      'endpoint.gemini.hosted-retrieval.file-search-stores',
    geminiFileSearchStoreUpload:
      'endpoint.gemini.hosted-retrieval.file-search-store-upload',
  } as const);

type ProtocolFamily = 'gemini-interactions' | 'openai-responses';
type ResourceRole = 'auxiliary' | 'primary';

export type AgentEvaluationHostedRetrievalProviderResourceMutation =
  | Readonly<{
      mutationKind: 'upload-content';
      protocolFamily: 'openai-responses';
      contentBytes: Uint8Array;
      filename: string;
      lifetimeSeconds: number;
      signal: AbortSignal;
    }>
  | Readonly<{
      mutationKind: 'create-primary';
      protocolFamily: 'openai-responses';
      displayName: string;
      auxiliaryResourceId: string;
      signal: AbortSignal;
    }>
  | Readonly<{
      mutationKind: 'create-primary';
      protocolFamily: 'gemini-interactions';
      displayName: string;
      signal: AbortSignal;
    }>
  | Readonly<{
      mutationKind: 'upload-content-start';
      protocolFamily: 'gemini-interactions';
      providerResourceId: string;
      filename: string;
      contentBytes: number;
      signal: AbortSignal;
    }>
  | Readonly<{
      mutationKind: 'upload-content-finalize';
      protocolFamily: 'gemini-interactions';
      providerResourceId: string;
      continuationEndpoint: string;
      contentBytes: Uint8Array;
      signal: AbortSignal;
    }>
  | Readonly<{
      mutationKind: 'delete-resource';
      protocolFamily: ProtocolFamily;
      resourceId: string;
      resourceRole: ResourceRole;
      signal: AbortSignal;
    }>;

export type AgentEvaluationHostedRetrievalProviderResourceReconciliation =
  | Readonly<{
      reconciliationKind: 'list-primary';
      protocolFamily: 'gemini-interactions';
      displayName: string;
      pageToken?: string;
      signal: AbortSignal;
    }>
  | Readonly<{
      reconciliationKind: 'read-resource';
      protocolFamily: ProtocolFamily;
      resourceId: string;
      resourceRole: ResourceRole;
      expectedContentBytes?: number;
      signal: AbortSignal;
    }>;

export type AgentEvaluationHostedRetrievalProviderResourceMutationProjection =
  Readonly<{
    endpointId: string;
    method: 'DELETE' | 'GET' | 'POST';
    requestBytes: number;
    requestBodyDigest: CanonicalDigest;
    requestProjection: AgentEvaluationProviderResourceRequestProjection;
    requestProjectionDigest: CanonicalDigest;
  }>;

export type AgentEvaluationHostedRetrievalProviderResourceMutationResult =
  Readonly<{
    protocolFamily: ProtocolFamily;
    mutationKind:
      | AgentEvaluationHostedRetrievalProviderResourceMutation['mutationKind']
      | 'reconcile-list-primary'
      | 'reconcile-read-resource';
    outcome: 'accepted' | 'already-absent' | 'created' | 'deleted' | 'uploaded';
    resourceId: string | null;
    resourceRole: ResourceRole | null;
    resourceManifestDigest: CanonicalDigest | null;
    readiness: 'empty' | 'pending' | 'ready' | null;
    matchingResourceId: string | null;
    nextPageToken: string | null;
    continuationEndpoint: string | null;
    transport: AgentEvaluationProviderResourceResponse;
  }>;

export type AgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt =
  | Readonly<{
      status: 'observed';
      result: AgentEvaluationHostedRetrievalProviderResourceMutationResult;
    }>
  | Readonly<{
      status: 'unresolved';
      reason:
        | 'frozen-resource-identity-unavailable'
        | 'observation-authority-unavailable'
        | 'provider-authoritative-read-unavailable';
      dispatchIntentDigest: CanonicalDigest;
      protocolFamily: ProtocolFamily;
      mutationKind: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent['mutationKind'];
    }>;

type BuiltRequest = Readonly<{
  endpointId: string;
  request: AgentEvaluationProviderResourceRequest;
}>;

const textEncoder = new TextEncoder();
const openAiIdempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:@-]{15,1023}$/u;
const fileNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const geminiResourcePattern = /^fileSearchStores\/[a-z0-9-]{1,64}$/u;
const geminiPageTokenPattern = /^[A-Za-z0-9._~+/=-]{1,2048}$/u;

const configurationInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const identity = (value: string): string => {
  if (!isAgentControlIdentity(value)) return configurationInvalid();
  return value;
};

const displayName = (value: string): string => {
  if (
    value.length < 1 ||
    value.length > 128 ||
    value !== value.trim() ||
    containsAsciiControlCharacter(value)
  ) {
    return configurationInvalid();
  }
  return value;
};

const filename = (value: string): string => {
  if (!fileNamePattern.test(value)) return configurationInvalid();
  return value;
};

const content = (value: Uint8Array): Uint8Array => {
  if (!(value instanceof Uint8Array) || value.byteLength < 1) {
    return configurationInvalid();
  }
  return Uint8Array.from(value);
};

const safeObject = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) return responseInvalid();
  return value;
};

const stringField = (value: Record<string, unknown>, key: string): string => {
  const member = value[key];
  if (
    typeof member !== 'string' ||
    member.length < 1 ||
    member.length > 2_048 ||
    member !== member.trim()
  ) {
    return responseInvalid();
  }
  return member;
};

const numberField = (value: Record<string, unknown>, key: string): number => {
  const member = value[key];
  if (!Number.isSafeInteger(member) || (member as number) < 0) {
    return responseInvalid();
  }
  return member as number;
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

const openAiMultipart = (
  mutation: Extract<
    AgentEvaluationHostedRetrievalProviderResourceMutation,
    { mutationKind: 'upload-content' }
  >
): Readonly<{ boundary: string; body: Uint8Array }> => {
  const bytes = content(mutation.contentBytes);
  const boundary = `prodivix-${digestAgentCanonicalValue({
    filename: mutation.filename,
    lifetimeSeconds: mutation.lifetimeSeconds,
    contentDigest: digestAgentCanonicalValue(
      Buffer.from(bytes).toString('base64')
    ),
  }).slice(7, 39)}`;
  const body = concatenate([
    textEncoder.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nuser_data\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="expires_after[anchor]"\r\n\r\ncreated_at\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="expires_after[seconds]"\r\n\r\n${mutation.lifetimeSeconds}\r\n` +
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename(mutation.filename)}"\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n`
    ),
    bytes,
    textEncoder.encode(`\r\n--${boundary}--\r\n`),
  ]);
  return Object.freeze({ boundary, body });
};

const buildMutationRequest = (
  mutation: AgentEvaluationHostedRetrievalProviderResourceMutation,
  providerIdempotencyKey: string | null
): BuiltRequest => {
  if (mutation.signal.aborted) return configurationInvalid();
  if (
    mutation.protocolFamily === 'openai-responses' &&
    mutation.mutationKind !== 'delete-resource' &&
    (providerIdempotencyKey === null ||
      !openAiIdempotencyPattern.test(providerIdempotencyKey))
  ) {
    return configurationInvalid();
  }
  if (
    mutation.protocolFamily === 'gemini-interactions' &&
    providerIdempotencyKey !== null
  ) {
    return configurationInvalid();
  }

  if (mutation.mutationKind === 'upload-content') {
    if (
      !Number.isSafeInteger(mutation.lifetimeSeconds) ||
      mutation.lifetimeSeconds < 3_600 ||
      mutation.lifetimeSeconds > 8 * 24 * 60 * 60
    ) {
      return configurationInvalid();
    }
    const multipart = openAiMultipart(mutation);
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiFiles,
      request: Object.freeze({
        protocolFamily: 'openai-responses' as const,
        method: 'POST' as const,
        endpoint: 'https://api.openai.com/v1/files',
        body: multipart.body,
        headers: Object.freeze({
          'content-type': `multipart/form-data; boundary=${multipart.boundary}`,
          'idempotency-key': providerIdempotencyKey!,
        }),
        signal: mutation.signal,
      }),
    });
  }
  if (
    mutation.mutationKind === 'create-primary' &&
    mutation.protocolFamily === 'openai-responses'
  ) {
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiVectorStores,
      request: Object.freeze({
        protocolFamily: 'openai-responses' as const,
        method: 'POST' as const,
        endpoint: 'https://api.openai.com/v1/vector_stores',
        body: canonicalJsonText({
          name: displayName(mutation.displayName),
          file_ids: [identity(mutation.auxiliaryResourceId)],
          expires_after: { anchor: 'last_active_at', days: 8 },
        }),
        headers: Object.freeze({
          'content-type': 'application/json',
          'idempotency-key': providerIdempotencyKey!,
        }),
        signal: mutation.signal,
      }),
    });
  }
  if (
    mutation.mutationKind === 'create-primary' &&
    mutation.protocolFamily === 'gemini-interactions'
  ) {
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStores,
      request: Object.freeze({
        protocolFamily: 'gemini-interactions' as const,
        method: 'POST' as const,
        endpoint:
          'https://generativelanguage.googleapis.com/v1/fileSearchStores',
        body: canonicalJsonText({
          displayName: displayName(mutation.displayName),
          embeddingModel: 'models/gemini-embedding-2',
        }),
        headers: Object.freeze({ 'content-type': 'application/json' }),
        signal: mutation.signal,
      }),
    });
  }
  if (mutation.mutationKind === 'upload-content-start') {
    if (
      !geminiResourcePattern.test(mutation.providerResourceId) ||
      !Number.isSafeInteger(mutation.contentBytes) ||
      mutation.contentBytes < 1
    ) {
      return configurationInvalid();
    }
    const storeId = mutation.providerResourceId.slice(
      'fileSearchStores/'.length
    );
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStoreUpload,
      request: Object.freeze({
        protocolFamily: 'gemini-interactions' as const,
        method: 'POST' as const,
        endpoint: `https://generativelanguage.googleapis.com/upload/v1/fileSearchStores/${storeId}:uploadToFileSearchStore`,
        body: canonicalJsonText({
          displayName: filename(mutation.filename),
          mimeType: 'text/plain',
        }),
        headers: Object.freeze({
          'content-type': 'application/json',
          'x-goog-upload-command': 'start',
          'x-goog-upload-header-content-length': String(mutation.contentBytes),
          'x-goog-upload-header-content-type': 'text/plain',
          'x-goog-upload-protocol': 'resumable',
        }),
        signal: mutation.signal,
      }),
    });
  }
  if (mutation.mutationKind === 'upload-content-finalize') {
    if (!geminiResourcePattern.test(mutation.providerResourceId)) {
      return configurationInvalid();
    }
    const bytes = content(mutation.contentBytes);
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStoreUpload,
      request: Object.freeze({
        protocolFamily: 'gemini-interactions' as const,
        method: 'POST' as const,
        endpoint: mutation.continuationEndpoint,
        body: bytes,
        headers: Object.freeze({
          'content-length': String(bytes.byteLength),
          'content-type': 'text/plain',
          'x-goog-upload-command': 'upload, finalize',
          'x-goog-upload-offset': '0',
        }),
        signal: mutation.signal,
      }),
    });
  }
  if (mutation.mutationKind === 'delete-resource') {
    identity(mutation.resourceId);
    const endpoint =
      mutation.protocolFamily === 'openai-responses'
        ? mutation.resourceRole === 'primary'
          ? `https://api.openai.com/v1/vector_stores/${encodeURIComponent(mutation.resourceId)}`
          : `https://api.openai.com/v1/files/${encodeURIComponent(mutation.resourceId)}`
        : (() => {
            if (
              mutation.resourceRole !== 'primary' ||
              !geminiResourcePattern.test(mutation.resourceId)
            ) {
              return configurationInvalid();
            }
            return `https://generativelanguage.googleapis.com/v1/${mutation.resourceId}?force=true`;
          })();
    return Object.freeze({
      endpointId:
        mutation.protocolFamily === 'openai-responses'
          ? mutation.resourceRole === 'primary'
            ? AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiVectorStores
            : AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiFiles
          : AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStores,
      request: Object.freeze({
        protocolFamily: mutation.protocolFamily,
        method: 'DELETE' as const,
        endpoint,
        signal: mutation.signal,
        acceptedStatuses: Object.freeze(
          mutation.protocolFamily === 'gemini-interactions'
            ? [200, 204, 404]
            : [200, 404]
        ),
      }),
    });
  }
  return configurationInvalid();
};

const buildReconciliationRequest = (
  reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation
): BuiltRequest => {
  if (reconciliation.signal.aborted) return configurationInvalid();
  if (reconciliation.reconciliationKind === 'list-primary') {
    const endpoint = new URL(
      'https://generativelanguage.googleapis.com/v1/fileSearchStores'
    );
    endpoint.searchParams.set('pageSize', '20');
    if (reconciliation.pageToken !== undefined) {
      if (!geminiPageTokenPattern.test(reconciliation.pageToken)) {
        return configurationInvalid();
      }
      endpoint.searchParams.set('pageToken', reconciliation.pageToken);
    }
    displayName(reconciliation.displayName);
    return Object.freeze({
      endpointId:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStores,
      request: Object.freeze({
        protocolFamily: 'gemini-interactions' as const,
        method: 'GET' as const,
        endpoint: endpoint.href,
        signal: reconciliation.signal,
      }),
    });
  }
  identity(reconciliation.resourceId);
  if (
    reconciliation.expectedContentBytes !== undefined &&
    (!Number.isSafeInteger(reconciliation.expectedContentBytes) ||
      reconciliation.expectedContentBytes < 1)
  ) {
    return configurationInvalid();
  }
  const endpoint =
    reconciliation.protocolFamily === 'openai-responses'
      ? reconciliation.resourceRole === 'primary'
        ? `https://api.openai.com/v1/vector_stores/${encodeURIComponent(reconciliation.resourceId)}`
        : `https://api.openai.com/v1/files/${encodeURIComponent(reconciliation.resourceId)}`
      : (() => {
          if (
            reconciliation.resourceRole !== 'primary' ||
            !geminiResourcePattern.test(reconciliation.resourceId)
          ) {
            return configurationInvalid();
          }
          return `https://generativelanguage.googleapis.com/v1/${reconciliation.resourceId}`;
        })();
  return Object.freeze({
    endpointId:
      reconciliation.protocolFamily === 'openai-responses'
        ? reconciliation.resourceRole === 'primary'
          ? AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiVectorStores
          : AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.openAiFiles
        : AGENT_EVALUATION_HOSTED_RETRIEVAL_PROVIDER_RESOURCE_ENDPOINT_IDS.geminiFileSearchStores,
    request: Object.freeze({
      protocolFamily: reconciliation.protocolFamily,
      method: 'GET' as const,
      endpoint,
      signal: reconciliation.signal,
      acceptedStatuses: Object.freeze([200, 404]),
    }),
  });
};

const projectionFor = (
  built: BuiltRequest
): AgentEvaluationHostedRetrievalProviderResourceMutationProjection => {
  const requestProjection = projectAgentEvaluationProviderResourceRequest(
    built.request
  );
  return Object.freeze({
    endpointId: built.endpointId,
    method: built.request.method,
    requestBytes: requestProjection.requestBytes,
    requestBodyDigest:
      requestProjection.requestBodyDigest ?? digestAgentCanonicalValue(null),
    requestProjection,
    requestProjectionDigest: digestAgentCanonicalValue(requestProjection),
  });
};

export const projectAgentEvaluationHostedRetrievalProviderResourceMutation = (
  mutation: AgentEvaluationHostedRetrievalProviderResourceMutation
): AgentEvaluationHostedRetrievalProviderResourceMutationProjection =>
  projectionFor(
    buildMutationRequest(
      mutation,
      mutation.protocolFamily === 'openai-responses' &&
        mutation.mutationKind !== 'delete-resource'
        ? 'idempotency.projection.placeholder'
        : null
    )
  );

export const projectAgentEvaluationHostedRetrievalProviderResourceReconciliation =
  (
    reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation
  ): AgentEvaluationHostedRetrievalProviderResourceMutationProjection =>
    projectionFor(buildReconciliationRequest(reconciliation));

const result = (
  input: Omit<
    AgentEvaluationHostedRetrievalProviderResourceMutationResult,
    'resourceManifestDigest'
  >
): AgentEvaluationHostedRetrievalProviderResourceMutationResult =>
  Object.freeze({
    ...input,
    resourceManifestDigest:
      input.resourceId === null
        ? null
        : digestAgentCanonicalValue({
            protocolFamily: input.protocolFamily,
            mutationKind: input.mutationKind,
            outcome: input.outcome,
            resourceId: input.resourceId,
            resourceRole: input.resourceRole,
            responseBodyDigest: input.transport.responseBodyDigest,
          }),
  });

const parseMutation = (
  mutation: AgentEvaluationHostedRetrievalProviderResourceMutation,
  transport: AgentEvaluationProviderResourceResponse
): AgentEvaluationHostedRetrievalProviderResourceMutationResult => {
  if (mutation.mutationKind === 'upload-content') {
    const value = safeObject(transport.body);
    const resourceId = identity(stringField(value, 'id'));
    if (
      value.object !== 'file' ||
      value.purpose !== 'user_data' ||
      numberField(value, 'bytes') !== mutation.contentBytes.byteLength
    ) {
      return responseInvalid();
    }
    return result({
      protocolFamily: mutation.protocolFamily,
      mutationKind: mutation.mutationKind,
      outcome: 'uploaded',
      resourceId,
      resourceRole: 'auxiliary',
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  if (mutation.mutationKind === 'create-primary') {
    const value = safeObject(transport.body);
    const resourceId =
      mutation.protocolFamily === 'openai-responses'
        ? identity(stringField(value, 'id'))
        : stringField(value, 'name');
    if (
      (mutation.protocolFamily === 'openai-responses' &&
        value.object !== 'vector_store') ||
      (mutation.protocolFamily === 'gemini-interactions' &&
        (value.displayName !== mutation.displayName ||
          !geminiResourcePattern.test(resourceId)))
    ) {
      return responseInvalid();
    }
    return result({
      protocolFamily: mutation.protocolFamily,
      mutationKind: mutation.mutationKind,
      outcome: 'created',
      resourceId,
      resourceRole: 'primary',
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  if (mutation.mutationKind === 'upload-content-start') {
    if (transport.continuationEndpoint === null) return responseInvalid();
    return result({
      protocolFamily: mutation.protocolFamily,
      mutationKind: mutation.mutationKind,
      outcome: 'accepted',
      resourceId: mutation.providerResourceId,
      resourceRole: 'primary',
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: transport.continuationEndpoint,
      transport,
    });
  }
  if (mutation.mutationKind === 'upload-content-finalize') {
    const value = safeObject(transport.body);
    const operationName = stringField(value, 'name');
    const storeId = mutation.providerResourceId.slice(
      'fileSearchStores/'.length
    );
    if (
      !new RegExp(
        `^fileSearchStores/${storeId}/upload/operations/[A-Za-z0-9._~-]{1,512}$`,
        'u'
      ).test(operationName)
    ) {
      return responseInvalid();
    }
    return result({
      protocolFamily: mutation.protocolFamily,
      mutationKind: mutation.mutationKind,
      outcome: 'uploaded',
      resourceId: mutation.providerResourceId,
      resourceRole: 'primary',
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  if (mutation.mutationKind === 'delete-resource') {
    if (transport.status !== 404 && transport.status >= 200) {
      if (mutation.protocolFamily === 'openai-responses') {
        const value = safeObject(transport.body);
        if (value.deleted !== true) return responseInvalid();
      } else if (transport.status !== 204) {
        safeObject(transport.body);
      }
    }
    return result({
      protocolFamily: mutation.protocolFamily,
      mutationKind: mutation.mutationKind,
      outcome: transport.status === 404 ? 'already-absent' : 'deleted',
      resourceId: mutation.resourceId,
      resourceRole: mutation.resourceRole,
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  return responseInvalid();
};

const parseReconciliation = (
  reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation,
  transport: AgentEvaluationProviderResourceResponse
): AgentEvaluationHostedRetrievalProviderResourceMutationResult => {
  if (reconciliation.reconciliationKind === 'list-primary') {
    const value = safeObject(transport.body);
    const stores = value.fileSearchStores;
    if (stores !== undefined && !Array.isArray(stores)) {
      return responseInvalid();
    }
    if ((stores?.length ?? 0) > 20) return responseInvalid();
    const matching: string[] = [];
    for (const candidate of stores ?? []) {
      const store = safeObject(candidate);
      const name = stringField(store, 'name');
      const candidateDisplayName = stringField(store, 'displayName');
      if (!geminiResourcePattern.test(name)) return responseInvalid();
      if (candidateDisplayName === reconciliation.displayName) {
        matching.push(name);
      }
    }
    if (matching.length > 1) return responseInvalid();
    const rawNextPageToken = value.nextPageToken;
    const nextPageToken =
      rawNextPageToken === undefined
        ? null
        : typeof rawNextPageToken === 'string' &&
            geminiPageTokenPattern.test(rawNextPageToken)
          ? rawNextPageToken
          : responseInvalid();
    return result({
      protocolFamily: reconciliation.protocolFamily,
      mutationKind: 'reconcile-list-primary',
      outcome: 'accepted',
      resourceId: matching[0] ?? null,
      resourceRole: matching.length === 1 ? 'primary' : null,
      readiness: null,
      matchingResourceId: matching[0] ?? null,
      nextPageToken,
      continuationEndpoint: null,
      transport,
    });
  }
  if (transport.status === 404) {
    return result({
      protocolFamily: reconciliation.protocolFamily,
      mutationKind: 'reconcile-read-resource',
      outcome: 'already-absent',
      resourceId: reconciliation.resourceId,
      resourceRole: reconciliation.resourceRole,
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  const value = safeObject(transport.body);
  if (
    reconciliation.protocolFamily === 'openai-responses' &&
    reconciliation.resourceRole === 'auxiliary'
  ) {
    const observedBytes = numberField(value, 'bytes');
    if (
      value.id !== reconciliation.resourceId ||
      value.object !== 'file' ||
      value.purpose !== 'user_data' ||
      (reconciliation.expectedContentBytes !== undefined &&
        observedBytes !== reconciliation.expectedContentBytes)
    ) {
      return responseInvalid();
    }
    return result({
      protocolFamily: reconciliation.protocolFamily,
      mutationKind: 'reconcile-read-resource',
      outcome: 'uploaded',
      resourceId: reconciliation.resourceId,
      resourceRole: reconciliation.resourceRole,
      readiness: null,
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  if (
    reconciliation.protocolFamily === 'openai-responses' &&
    reconciliation.resourceRole === 'primary'
  ) {
    const counts = safeObject(value.file_counts);
    const status = stringField(value, 'status');
    const failed = numberField(counts, 'failed');
    const cancelled = numberField(counts, 'cancelled');
    const completed = numberField(counts, 'completed');
    const inProgress = numberField(counts, 'in_progress');
    const total = numberField(counts, 'total');
    if (
      value.id !== reconciliation.resourceId ||
      value.object !== 'vector_store' ||
      failed !== 0 ||
      cancelled !== 0 ||
      completed > 1 ||
      inProgress > 1 ||
      total !== 1 ||
      completed + inProgress !== 1
    ) {
      return responseInvalid();
    }
    const ready = status === 'completed' && completed === 1 && inProgress === 0;
    const pending =
      status === 'in_progress' && completed === 0 && inProgress === 1;
    if (!ready && !pending) return responseInvalid();
    return result({
      protocolFamily: reconciliation.protocolFamily,
      mutationKind: 'reconcile-read-resource',
      outcome: 'created',
      resourceId: reconciliation.resourceId,
      resourceRole: reconciliation.resourceRole,
      readiness: ready ? 'ready' : 'pending',
      matchingResourceId: null,
      nextPageToken: null,
      continuationEndpoint: null,
      transport,
    });
  }
  if (!geminiResourcePattern.test(reconciliation.resourceId)) {
    return responseInvalid();
  }
  const active = numberField(value, 'activeDocumentsCount');
  const pending = numberField(value, 'pendingDocumentsCount');
  const failed = numberField(value, 'failedDocumentsCount');
  if (
    value.name !== reconciliation.resourceId ||
    failed > 0 ||
    active > 1 ||
    pending > 1 ||
    active + pending > 1
  ) {
    return responseInvalid();
  }
  return result({
    protocolFamily: reconciliation.protocolFamily,
    mutationKind: 'reconcile-read-resource',
    outcome: active === 1 ? 'uploaded' : 'created',
    resourceId: reconciliation.resourceId,
    resourceRole: reconciliation.resourceRole,
    readiness: active === 1 ? 'ready' : pending === 1 ? 'pending' : 'empty',
    matchingResourceId: null,
    nextPageToken: null,
    continuationEndpoint: null,
    transport,
  });
};

const executeMutation = async (
  session: AgentEvaluationProviderResourceTransportSession,
  mutation: AgentEvaluationHostedRetrievalProviderResourceMutation,
  providerIdempotencyKey: string | null
): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> => {
  const built = buildMutationRequest(mutation, providerIdempotencyKey);
  return parseMutation(mutation, await session.execute(built.request));
};

export const executeAgentEvaluationCapabilityProbeProviderResourceMutation = (
  session: AgentEvaluationProviderResourceTransportSession,
  input: Readonly<{
    mutation: AgentEvaluationHostedRetrievalProviderResourceMutation;
    providerIdempotencyKey?: string;
  }>
): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> =>
  executeMutation(
    session,
    input.mutation,
    input.providerIdempotencyKey ?? null
  );

export const executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceMutation =
  (
    session: AgentEvaluationProviderResourceTransportSession,
    input: Readonly<{
      dispatchIntent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
      dispatchStageClaimReceipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
      observedAt: Instant;
      mutation: AgentEvaluationHostedRetrievalProviderResourceMutation;
    }>
  ): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> => {
    const { dispatchIntent, dispatchStageClaimReceipt, mutation, observedAt } =
      input;
    const projection =
      projectAgentEvaluationHostedRetrievalProviderResourceMutation(mutation);
    const mutationResourceId =
      mutation.mutationKind === 'delete-resource'
        ? mutation.resourceId
        : mutation.mutationKind === 'upload-content-start' ||
            mutation.mutationKind === 'upload-content-finalize'
          ? mutation.providerResourceId
          : null;
    const mutationResourceRole =
      mutation.mutationKind === 'delete-resource'
        ? mutation.resourceRole
        : mutation.mutationKind === 'upload-content'
          ? 'auxiliary'
          : 'primary';
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(
        dispatchIntent
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        dispatchStageClaimReceipt
      ) ||
      !isAgentControlInstant(observedAt) ||
      !matchAgentHostedRetrievalRuntimeResourceLifecycleDispatchAuthorization(
        dispatchIntent,
        dispatchStageClaimReceipt,
        observedAt
      ) ||
      dispatchIntent.protocolFamily !== mutation.protocolFamily ||
      dispatchIntent.mutationKind !== mutation.mutationKind ||
      dispatchIntent.method !== projection.method ||
      dispatchIntent.endpointId !== projection.endpointId ||
      dispatchIntent.requestBytes !== projection.requestBytes ||
      dispatchIntent.requestBodyDigest !== projection.requestBodyDigest ||
      dispatchIntent.requestProjectionDigest !==
        projection.requestProjectionDigest ||
      dispatchIntent.resourceId !== mutationResourceId ||
      dispatchIntent.resourceRole !== mutationResourceRole
    ) {
      return configurationInvalid();
    }
    return executeMutation(
      session,
      mutation,
      mutation.protocolFamily === 'openai-responses' &&
        mutation.mutationKind !== 'delete-resource'
        ? dispatchIntent.intentDigest
        : null
    ).then((executed) => {
      if (
        executed.transport.requestProjectionDigest !==
          dispatchIntent.requestProjectionDigest ||
        executed.transport.requestBytes !== dispatchIntent.requestBytes ||
        (executed.transport.requestProjection.requestBodyDigest ??
          digestAgentCanonicalValue(null)) !== dispatchIntent.requestBodyDigest
      ) {
        return configurationInvalid();
      }
      return executed;
    });
  };

const executeReconciliation = async (
  session: AgentEvaluationProviderResourceTransportSession,
  reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation
): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> => {
  const built = buildReconciliationRequest(reconciliation);
  return parseReconciliation(
    reconciliation,
    await session.execute(built.request)
  );
};

export const executeAgentEvaluationCapabilityProbeProviderResourceReconciliation =
  (
    session: AgentEvaluationProviderResourceTransportSession,
    reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation
  ): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> =>
    executeReconciliation(session, reconciliation);

export const executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceReconciliation =
  (
    session: AgentEvaluationProviderResourceTransportSession,
    input: Readonly<{
      dispatchIntent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
      dispatchStageClaimReceipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
      observationRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest;
      reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation;
    }>
  ): Promise<AgentEvaluationHostedRetrievalProviderResourceMutationResult> => {
    const projection =
      projectAgentEvaluationHostedRetrievalProviderResourceReconciliation(
        input.reconciliation
      );
    const deleteIdentityMismatch =
      input.dispatchIntent.operation === 'delete' &&
      (input.reconciliation.reconciliationKind !== 'read-resource' ||
        input.reconciliation.resourceId !== input.dispatchIntent.resourceId ||
        input.reconciliation.resourceRole !==
          input.dispatchIntent.resourceRole);
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(
        input.dispatchIntent
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        input.dispatchStageClaimReceipt
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest(
        input.observationRequest
      ) ||
      input.dispatchStageClaimReceipt.dispatchIntentDigest !==
        input.dispatchIntent.intentDigest ||
      (input.dispatchStageClaimReceipt.deliveryDisposition !==
        'dispatch-authorized-first-delivery' &&
        input.dispatchStageClaimReceipt.deliveryDisposition !==
          'reconcile-only-replay') ||
      Date.parse(input.observationRequest.requestedAt) <
        Date.parse(input.dispatchStageClaimReceipt.claimedAt) ||
      Date.parse(input.observationRequest.requestedAt) >=
        Date.parse(input.dispatchStageClaimReceipt.claimExpiresAt) ||
      input.observationRequest.dispatchIntentDigest !==
        input.dispatchIntent.intentDigest ||
      input.observationRequest.dispatchStageClaimReceiptDigest !==
        input.dispatchStageClaimReceipt.receiptDigest ||
      input.observationRequest.mutationKind !==
        input.dispatchIntent.mutationKind ||
      input.observationRequest.mutationSequence !==
        input.dispatchIntent.mutationSequence ||
      input.observationRequest.providerConfigurationId !==
        input.dispatchIntent.providerConfigurationId ||
      input.observationRequest.endpointId !== projection.endpointId ||
      input.observationRequest.method !== projection.method ||
      input.reconciliation.protocolFamily !==
        input.dispatchIntent.protocolFamily ||
      !isAgentCanonicalDigest(
        input.observationRequest.transportReceiptDigest
      ) ||
      deleteIdentityMismatch
    ) {
      return configurationInvalid();
    }
    return executeReconciliation(session, input.reconciliation);
  };

/**
 * Selects only credential-bound GET/list reconciliation. When the frozen
 * Provider identity cannot support an authoritative read, no mutation is sent
 * and the caller receives an explicit unresolved result for health closure.
 */
export const executeAgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt =
  async (
    session: AgentEvaluationProviderResourceTransportSession,
    input: Readonly<{
      dispatchIntent: AgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent;
      dispatchStageClaimReceipt: AgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt;
      observationRequest: AgentHostedRetrievalRuntimeResourceLifecycleReconciliationObservationRequest | null;
      providerResourceId: string | null;
      resourceRole: ResourceRole | null;
      geminiDisplayName: string | null;
      expectedContentBytes?: number;
      signal: AbortSignal;
    }>
  ): Promise<AgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt> => {
    if (
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchIntent(
        input.dispatchIntent
      ) ||
      !isAgentHostedRetrievalRuntimeResourceLifecycleDispatchStageClaimReceipt(
        input.dispatchStageClaimReceipt
      ) ||
      input.dispatchStageClaimReceipt.dispatchIntentDigest !==
        input.dispatchIntent.intentDigest ||
      (input.dispatchStageClaimReceipt.deliveryDisposition !==
        'dispatch-authorized-first-delivery' &&
        input.dispatchStageClaimReceipt.deliveryDisposition !==
          'reconcile-only-replay') ||
      input.signal.aborted
    ) {
      return configurationInvalid();
    }
    const unresolved = (
      reason: Extract<
        AgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt,
        { status: 'unresolved' }
      >['reason']
    ): AgentEvaluationHostedRetrievalProviderResourceReconciliationAttempt =>
      Object.freeze({
        status: 'unresolved' as const,
        reason,
        dispatchIntentDigest: input.dispatchIntent.intentDigest,
        protocolFamily: input.dispatchIntent.protocolFamily,
        mutationKind: input.dispatchIntent.mutationKind,
      });

    let reconciliation: AgentEvaluationHostedRetrievalProviderResourceReconciliation | null =
      null;
    if (input.providerResourceId !== null && input.resourceRole !== null) {
      reconciliation = Object.freeze({
        reconciliationKind: 'read-resource' as const,
        protocolFamily: input.dispatchIntent.protocolFamily,
        resourceId: input.providerResourceId,
        resourceRole: input.resourceRole,
        ...(input.expectedContentBytes === undefined
          ? {}
          : { expectedContentBytes: input.expectedContentBytes }),
        signal: input.signal,
      });
    } else if (
      input.dispatchIntent.protocolFamily === 'gemini-interactions' &&
      input.dispatchIntent.mutationKind === 'create-primary' &&
      input.geminiDisplayName !== null
    ) {
      reconciliation = Object.freeze({
        reconciliationKind: 'list-primary' as const,
        protocolFamily: 'gemini-interactions' as const,
        displayName: input.geminiDisplayName,
        signal: input.signal,
      });
    } else if (
      input.dispatchIntent.protocolFamily === 'openai-responses' &&
      input.providerResourceId === null
    ) {
      return unresolved('provider-authoritative-read-unavailable');
    } else {
      return unresolved('frozen-resource-identity-unavailable');
    }

    if (input.observationRequest === null) {
      return unresolved('observation-authority-unavailable');
    }
    const result =
      await executeAgentEvaluationAuthorizedHostedRetrievalProviderResourceReconciliation(
        session,
        {
          dispatchIntent: input.dispatchIntent,
          dispatchStageClaimReceipt: input.dispatchStageClaimReceipt,
          observationRequest: input.observationRequest,
          reconciliation,
        }
      );
    return Object.freeze({ status: 'observed' as const, result });
  };
