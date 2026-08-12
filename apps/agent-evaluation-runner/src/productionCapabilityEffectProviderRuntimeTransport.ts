import {
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS,
  AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
  createAgentEvaluationCapabilityEffectProviderExecutionReceipt,
  createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest,
  createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite,
  createAgentEvaluationCapabilityEffectProviderJournalResultRecord,
  createAgentEvaluationCapabilityEffectProviderJournalStageRecord,
  createAgentEvaluationCapabilityEffectProviderReadinessReceipt,
  createAgentEvaluationCapabilityEffectProviderRuntimeResult,
  createAgentEvaluationCapabilityEffectProviderStageRequest,
  createAgentEvaluationCapabilityEffectProviderSpoolAad,
  createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt,
  createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority,
  createAgentEvaluationCapabilityEffectProviderSpoolReceipt,
  createAgentEvaluationTransportDispatchIntent,
  createAgentEvaluationTransportReceipt,
  createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  createAgentNativeProviderCapabilityRuntimeRequestMaterial,
  decodeAgentNativeProviderCapabilityRuntimeResponse,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  type AgentCapabilityProbeProgram,
  type AgentEvaluationCapabilityEffectProviderExecutionReceipt,
  type AgentEvaluationCapabilityEffectProviderJournalExecutionRecord,
  type AgentEvaluationCapabilityEffectProviderJournalSnapshot,
  type AgentEvaluationProviderResultSpoolEnvelope,
  type AgentEvaluationTransportErrorCategory,
  type AgentJsonValue,
  type AgentNativeProviderCapabilityRuntimeCacheWarmAuthority,
  type AgentNativeProviderCapabilityRuntimeRequestMaterial,
  type AgentNativeProviderCapabilityRuntimeResponseDecodeResult,
  type AgentNativeProviderOptionalCapabilitySourceReceipt,
  type AgentNativeProviderStateVaultResolveReceipt,
  type AgentNativeProviderStateVaultResolveRequest,
  type CanonicalDigest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationNativeProtocol,
} from './config';
import {
  authorizeAgentEvaluationCapabilityProbeEgress,
  type AgentEvaluationHostResolver,
} from './egress';
import {
  agentEvaluationEgressBoundFetch,
  type AgentEvaluationEgressBoundFetch,
} from './egressBoundFetch';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient,
  createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader,
  PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME,
  type AgentEvaluationProductionCapabilityEffectProviderJournalClient,
  type AgentEvaluationProductionCapabilityEffectProviderJournalHealthReader,
} from './productionCapabilityEffectProviderJournalClient';
import type { AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher } from './productionCapabilityEffectProviderJournalSpoolCipher';
import type {
  AgentEvaluationProductionSharedEffectExecutionMaterial,
  AgentEvaluationProductionSharedEffectExternalOwnerHealth,
  AgentEvaluationProductionSharedEffectMetadataOwner,
} from './productionSharedEffectExecutor';
import type { AgentEvaluationProductionSharedEffectStatefulTransport } from './productionSharedEffectStatefulOwner';
import type {
  AgentEvaluationProductionSharedEffectHostedResourceContext,
  AgentEvaluationProductionSharedEffectHostedPreactivationTransport,
  AgentEvaluationProductionSharedEffectHostedTransport,
} from './productionSharedEffectHostedOwner';
import type {
  AgentEvaluationProductionSharedEffectBinding,
  AgentEvaluationProductionSharedEffectHealthInput,
  AgentEvaluationProductionSharedEffectStage,
} from './productionSharedEffectOwner';
import {
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
  AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
} from './productionSharedEffectExecutor';
import {
  EnvironmentAgentProviderSecretResolver,
  type AgentEvaluationEnvironmentReader,
  type AgentProviderSecretResolver,
} from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';
import { AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES } from './ledgerClient';

const maximumResponseBytes = 32_768;
const requestTimeoutMs = 120_000;
const maximumIdentityBytes = 256;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const isNativeProtocol = (
  value: string
): value is AgentEvaluationNativeProtocol =>
  value === 'openai-responses' ||
  value === 'anthropic-messages' ||
  value === 'gemini-interactions';

const transportErrorCategory = (
  caught: unknown
): AgentEvaluationTransportErrorCategory => {
  if (caught instanceof AgentEvaluationRunnerError) {
    switch (caught.code) {
      case 'G4_RUNNER_ABORTED':
      case 'G4_RUNNER_CAPTURE_FAILED':
      case 'G4_RUNNER_CONFIGURATION_INVALID':
      case 'G4_RUNNER_DISABLED':
      case 'G4_RUNNER_EGRESS_DENIED':
      case 'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE':
      case 'G4_RUNNER_PROVIDER_AUTH_REJECTED':
      case 'G4_RUNNER_PROVIDER_RATE_LIMITED':
      case 'G4_RUNNER_PROVIDER_REJECTED':
      case 'G4_RUNNER_RESPONSE_INVALID':
      case 'G4_RUNNER_RESPONSE_SECRET_LEAK':
      case 'G4_RUNNER_RESPONSE_TOO_LARGE':
      case 'G4_RUNNER_SECRET_UNAVAILABLE':
      case 'G4_RUNNER_SECRET_USE_DENIED':
      case 'G4_RUNNER_SERVER_ONLY':
      case 'G4_RUNNER_TRANSPORT_FAILED':
        return caught.code;
    }
  }
  return AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed;
};

type RuntimeExecutionInput = Readonly<{
  binding: AgentEvaluationProductionSharedEffectBinding;
  outerStage: AgentEvaluationProductionSharedEffectStage;
  program: AgentCapabilityProbeProgram;
  nativeSourceReceipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null;
  hostedResourceContext: AgentEvaluationProductionSharedEffectHostedResourceContext | null;
  readinessOwnerInstanceId: string | null;
  callbackLocalProviderStateHandle: string | null;
  stateVaultResolveRequest: AgentNativeProviderStateVaultResolveRequest | null;
  stateVaultResolveReceipt: AgentNativeProviderStateVaultResolveReceipt | null;
  vaultOwnerInstanceId: string | null;
  vaultHealthDigest: CanonicalDigest | null;
  completeStateLifecycle?: Parameters<
    AgentEvaluationProductionSharedEffectStatefulTransport['execute']
  >[0]['completeStateLifecycle'];
}>;

export type AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport =
  Readonly<{
    authorityKind: 'production-capability-effect-provider-runtime';
    execute(
      input: RuntimeExecutionInput
    ): Promise<
      AgentEvaluationProductionSharedEffectExecutionMaterial | undefined
    >;
    checkReadiness(
      input: AgentEvaluationProductionSharedEffectHealthInput,
      ownerKind?: AgentEvaluationProductionSharedEffectExternalOwnerHealth['ownerKind']
    ): Promise<
      AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
    >;
    close(): Promise<
      Readonly<{
        status: 'clean';
        residualResourceIds: readonly [];
        residualCanaryIds: readonly [];
      }>
    >;
  }>;

export type CreateProductionAgentEvaluationCapabilityEffectProviderRuntimeTransportInput =
  Readonly<{
    environment: AgentEvaluationEnvironmentReader;
    forbiddenCanaries: () => readonly string[];
    spoolCipher: AgentEvaluationProductionCapabilityEffectProviderJournalSpoolCipher;
    executionEnabled: boolean;
    fetch?: typeof fetch;
    secrets?: AgentProviderSecretResolver;
    fetcher?: AgentEvaluationEgressBoundFetch;
    resolveHost?: AgentEvaluationHostResolver;
    clock?: () => Date;
    journalFor?: (input: {
      planDigest: CanonicalDigest;
      repositoryCommit: string;
    }) => AgentEvaluationProductionCapabilityEffectProviderJournalClient;
    journalHealth?: AgentEvaluationProductionCapabilityEffectProviderJournalHealthReader;
  }>;

type RawDispatchResult = Readonly<{
  requestMaterial: AgentNativeProviderCapabilityRuntimeRequestMaterial;
  response: AgentNativeProviderCapabilityRuntimeResponseDecodeResult;
  dispatchIntent: ReturnType<
    typeof createAgentEvaluationTransportDispatchIntent
  >;
  transportReceipt: ReturnType<typeof createAgentEvaluationTransportReceipt>;
  sealedResponseJson: AgentJsonValue | null;
  observedAt: string;
  executedAt: string;
}>;

const fail = (code: string): never => {
  throw new TypeError(
    `G4_PRODUCTION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_INVALID: ${code}`
  );
};

const validIdentity = (value: string | undefined): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  encoder.encode(value).byteLength <= maximumIdentityBytes &&
  value === value.trim() &&
  !containsAsciiControlCharacter(value);

const parseJson = (bytes: Uint8Array): AgentJsonValue => {
  try {
    return JSON.parse(decoder.decode(bytes), (key, value: unknown) => {
      if (key && isUnsafeObjectKey(key)) throw new TypeError('unsafe-key');
      return value;
    }) as AgentJsonValue;
  } catch {
    return fail('response-json');
  }
};

const readResponse = async (response: Response): Promise<Uint8Array> => {
  if (!response.body) return fail('response-body');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length <= 0 || length > maximumResponseBytes) {
        return fail('response-size');
      }
      chunks.push(next.value);
    }
    if (length === 0) return fail('response-empty');
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    await reader.cancel().catch(() => undefined);
    for (const chunk of chunks) chunk.fill(0);
  }
};

const headersFor = (
  protocolFamily: AgentEvaluationNativeProtocol,
  credential: Uint8Array
): Headers => {
  const value = decoder.decode(credential);
  const headers = new Headers({
    Accept: 'application/json',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'User-Agent': 'prodivix-g4-agent-evaluation/1',
  });
  switch (protocolFamily) {
    case 'openai-responses':
      headers.set('Authorization', `Bearer ${value}`);
      break;
    case 'anthropic-messages':
      headers.set('anthropic-version', '2023-06-01');
      headers.set('x-api-key', value);
      break;
    case 'gemini-interactions':
      headers.set('x-goog-api-key', value);
      break;
  }
  return headers;
};

const clearCredentialHeaders = (headers: Headers): void => {
  headers.delete('Authorization');
  headers.delete('x-api-key');
  headers.delete('x-goog-api-key');
};

const responseHeaderDigest = (response: Response): CanonicalDigest =>
  digestAgentCanonicalValue({
    contentType: response.headers.get('content-type'),
    requestId:
      response.headers.get('x-request-id') ??
      response.headers.get('request-id') ??
      response.headers.get('x-goog-request-id'),
  });

const errorCategoryForStatus = (
  status: number
): import('@prodivix/ai').AgentEvaluationTransportErrorCategory =>
  status === 401 || status === 403
    ? 'G4_RUNNER_PROVIDER_AUTH_REJECTED'
    : status === 429
      ? 'G4_RUNNER_PROVIDER_RATE_LIMITED'
      : 'G4_RUNNER_PROVIDER_REJECTED';

const materialFromResultRecord = (
  snapshot: AgentEvaluationCapabilityEffectProviderJournalSnapshot
): AgentEvaluationProductionSharedEffectExecutionMaterial | undefined => {
  const result = snapshot.resultRecord;
  const terminal = snapshot.executionRecords.at(-1);
  if (result === null || terminal === undefined) {
    return undefined;
  }
  return Object.freeze({
    businessResult: result.businessResult,
    effectSourceFact: result.effectSourceFact,
    providerRuntimeJournalResultRecordDigest: result.recordDigest,
    providerRuntimeResultSealReceiptDigest:
      result.resultSealReceipt.receiptDigest,
    transportReceiptDigest:
      terminal.executionReceipt.transportReceipt.receiptDigest,
    resultSpoolReceiptDigest:
      terminal.executionReceipt.resultSpoolReceipt?.receiptDigest ?? null,
    normalizedEventSetDigest:
      terminal.executionReceipt.responseProjection.normalizedEventSetDigest,
    stateVaultResolveRequest:
      snapshot.stageRecord.stageRequest.stateVaultResolveRequest,
    stateVaultResolveReceipt:
      snapshot.stageRecord.stageRequest.stateVaultResolveReceipt,
    stateVaultRetireRequest: result.stateVaultRetireRequest,
    stateVaultRetirementReceipt: result.stateVaultRetirementReceipt,
    sealedAt: result.resultSealReceipt.sealedAt,
  });
};

const cacheKeyFrom = (
  receipt: AgentNativeProviderOptionalCapabilitySourceReceipt | null
): CanonicalDigest | null =>
  receipt?.source.sourceKind === 'provider-cache-usage'
    ? receipt.source.cacheKeyDigest
    : null;

/**
 * Dedicated 8791 Provider runtime. A durable stage claim precedes every
 * external call; a reconciled empty stage is ambiguous and therefore never
 * redispatched. Terminal records are read-only ACK-loss recovery authority.
 */
export const createProductionAgentEvaluationCapabilityEffectProviderRuntimeTransport =
  (
    input: CreateProductionAgentEvaluationCapabilityEffectProviderRuntimeTransportInput
  ): AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport => {
    if (
      typeof input.environment !== 'function' ||
      typeof input.forbiddenCanaries !== 'function' ||
      typeof input.spoolCipher?.encrypt !== 'function' ||
      typeof input.executionEnabled !== 'boolean'
    ) {
      return fail('composition');
    }
    const ownerInstanceId = input.environment(
      PRODUCTION_AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_JOURNAL_OWNER_INSTANCE_ENVIRONMENT_NAME
    );
    if (!isAgentControlIdentity(ownerInstanceId)) return fail('owner-instance');
    const clock = input.clock ?? (() => new Date());
    const secrets =
      input.secrets ??
      new EnvironmentAgentProviderSecretResolver(input.environment);
    const fetcher = input.fetcher ?? agentEvaluationEgressBoundFetch;
    const journalFor =
      input.journalFor ??
      ((scope: { planDigest: CanonicalDigest; repositoryCommit: string }) =>
        createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalClient(
          {
            ...scope,
            environment: input.environment,
            ...(input.fetch ? { fetch: input.fetch } : {}),
            forbiddenCanaries: input.forbiddenCanaries,
          }
        ));
    const journalHealth =
      input.journalHealth ??
      createEnvironmentProductionAgentEvaluationCapabilityEffectProviderJournalHealthReader(
        {
          environment: input.environment,
          ...(input.fetch ? { fetch: input.fetch } : {}),
          forbiddenCanaries: input.forbiddenCanaries,
        }
      );
    const attempts = new Map<
      string,
      Readonly<{
        attemptId: string;
        planDigest: CanonicalDigest;
        repositoryCommit: string;
      }>
    >();
    let closed = false;
    let closePromise:
      | Promise<
          Readonly<{
            status: 'clean';
            residualResourceIds: readonly [];
            residualCanaryIds: readonly [];
          }>
        >
      | undefined;
    let lastInstantMs = 0;
    const instant = (minimumMs = 0): string => {
      const observed = clock().getTime();
      if (!Number.isFinite(observed)) return fail('clock');
      lastInstantMs = Math.max(observed, minimumMs, lastInstantMs + 1);
      return new Date(lastInstantMs).toISOString();
    };

    const probeRuntimeHealth = async (healthInput: {
      sourceIdentity: AgentEvaluationProductionSharedEffectHealthInput['sourceIdentity'];
      healthKeyDigest: CanonicalDigest;
      ownerKind: AgentEvaluationProductionSharedEffectExternalOwnerHealth['ownerKind'];
    }): Promise<
      AgentEvaluationProductionSharedEffectExternalOwnerHealth | undefined
    > => {
      if (closed) return undefined;
      const identity = healthInput.sourceIdentity;
      const protocolFamily = identity.protocolFamily;
      if (!isNativeProtocol(protocolFamily)) return undefined;
      const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
      if (
        definition.providerConfigurationId !==
          identity.providerConfigurationId ||
        input.environment(definition.modelEnvironmentName) !== identity.modelId
      ) {
        return undefined;
      }
      const checkedAt = instant();
      const currentJournalHealth = await journalHealth.readHealth();
      if (!currentJournalHealth) return undefined;
      let egressDigest: CanonicalDigest | undefined;
      try {
        egressDigest = await secrets.use(
          {
            protocolFamily,
            providerConfigurationId: identity.providerConfigurationId,
            secretRef: definition.secretRef,
            purpose: 'model-invocation',
            runtimeZone: 'server',
            useId: `provider-runtime-health.${healthInput.healthKeyDigest.slice('sha256-'.length)}.${Date.parse(checkedAt)}`,
          },
          async () => {
            const authority =
              await authorizeAgentEvaluationCapabilityProbeEgress({
                protocolFamily,
                method: 'POST',
                endpoint: definition.endpoint,
                requestBytes: 1,
                maximumResponseBytes: 1,
                timeoutMs: 1,
                ...(input.resolveHost
                  ? { resolveHost: input.resolveHost }
                  : {}),
              });
            return digestAgentCanonicalValue(authority);
          }
        );
      } catch {
        return undefined;
      }
      if (!isAgentCanonicalDigest(egressDigest)) return undefined;
      const expiresAt = new Date(
        Date.parse(checkedAt) +
          AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_RUNTIME_MAXIMUM_LIFETIME_MS
      ).toISOString();
      const base = Object.freeze({
        format:
          AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_FORMAT,
        version:
          AGENT_EVALUATION_PRODUCTION_SHARED_EFFECT_EXTERNAL_OWNER_HEALTH_VERSION,
        ownerKind: healthInput.ownerKind,
        sourceIdentityDigest: digestAgentCanonicalValue(identity),
        status: 'ready' as const,
        checkedAt,
        expiresAt,
      });
      return Object.freeze({
        ...base,
        healthDigest: digestAgentCanonicalValue(base),
      });
    };

    const externalHealth = (
      healthInput: AgentEvaluationProductionSharedEffectHealthInput,
      ownerKind: AgentEvaluationProductionSharedEffectExternalOwnerHealth['ownerKind']
    ) =>
      probeRuntimeHealth({
        sourceIdentity: healthInput.sourceIdentity,
        healthKeyDigest: healthInput.registrationRequest.requestDigest,
        ownerKind,
      });

    const dispatch = async (
      executionInput: RuntimeExecutionInput,
      requestMaterial: AgentNativeProviderCapabilityRuntimeRequestMaterial,
      sequence: number
    ): Promise<RawDispatchResult> => {
      const { binding, program } = executionInput;
      const intent = binding.toolInput.preEffectIntent;
      const identity = binding.sourceIdentity;
      const protocolFamily = identity.protocolFamily;
      if (!isNativeProtocol(protocolFamily)) return fail('protocol-family');
      const budgetReservationId =
        executionInput.hostedResourceContext?.providerResourceAuthority
          .budgetReservationAuthority.reservationId ??
        binding.toolInput.budgetReservationId;
      if (!isAgentControlIdentity(budgetReservationId)) {
        return fail('budget-reservation');
      }
      const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
      const endpoint = new URL(
        requestMaterial.callbackLocalPath,
        definition.endpoint
      );
      const createdAt = instant();
      const dispatchIntent = createAgentEvaluationTransportDispatchIntent({
        intentId: `provider-runtime.${intent.ownerRequestDigest.slice('sha256-'.length)}.${sequence}`,
        planDigest: intent.planDigest,
        repositoryCommit: intent.repositoryCommit,
        attemptId: intent.attemptId,
        descriptorDigest: intent.descriptorDigest,
        turnIndex: intent.turnIndex,
        protocolFamily,
        providerConfigurationId: identity.providerConfigurationId,
        modelLineageDigest: identity.modelLineageDigest,
        inferenceConfigurationDigest: digestAgentCanonicalValue({
          programDigest: program.programDigest,
          requestDigest: requestMaterial.projection.requestDigest,
        }),
        invocationId: intent.invocationId,
        budgetReservationId,
        demandDigest: intent.ownerRequestDigest,
        requestDigest: requestMaterial.projection.requestDigest,
        endpointId: definition.endpointId,
        endpointClass: 'first-party-hosted',
        requestBodyDigest: requestMaterial.projection.requestBodyDigest,
        requestBytes: requestMaterial.projection.requestBytes,
        createdAt,
      });
      const startedAt = instant(Date.parse(createdAt));
      let bodyBytes: Uint8Array | undefined;
      let dispatchAttempted = false;
      try {
        const result = await secrets.use<
          Readonly<{ providerResponse: Response; bytes: Uint8Array }>
        >(
          {
            protocolFamily,
            providerConfigurationId: identity.providerConfigurationId,
            secretRef: definition.secretRef,
            purpose: 'model-invocation',
            runtimeZone: 'server',
            useId: `provider-runtime-dispatch.${intent.ownerRequestDigest.slice('sha256-'.length)}.${sequence}`,
          },
          async (credential) => {
            const authority =
              await authorizeAgentEvaluationCapabilityProbeEgress({
                protocolFamily,
                method: requestMaterial.projection.httpMethod,
                endpoint: endpoint.toString(),
                requestBytes:
                  requestMaterial.projection.httpMethod === 'GET'
                    ? 1
                    : requestMaterial.projection.requestBytes,
                maximumResponseBytes,
                timeoutMs: requestTimeoutMs,
                ...(input.resolveHost
                  ? { resolveHost: input.resolveHost }
                  : {}),
              });
            const headers = headersFor(protocolFamily, credential);
            try {
              dispatchAttempted = true;
              const providerResponse = await fetcher(
                endpoint,
                {
                  method: requestMaterial.projection.httpMethod,
                  headers,
                  ...(requestMaterial.callbackLocalBody === null
                    ? {}
                    : {
                        body: canonicalJsonText(
                          requestMaterial.callbackLocalBody
                        ),
                      }),
                  cache: 'no-store',
                  credentials: 'omit',
                  redirect: 'manual',
                  referrerPolicy: 'no-referrer',
                  signal: AbortSignal.timeout(requestTimeoutMs),
                },
                authority.approvedAddresses
              );
              const bytes = await readResponse(providerResponse);
              return Object.freeze({ providerResponse, bytes });
            } finally {
              clearCredentialHeaders(headers);
            }
          }
        );
        const response = result.providerResponse;
        bodyBytes = result.bytes;
        const sealedResponseJson = parseJson(bodyBytes);
        const observedAt = instant();
        const bodyDigest = digestAgentCanonicalValue(sealedResponseJson);
        const decoded = decodeAgentNativeProviderCapabilityRuntimeResponse(
          program,
          requestMaterial.projection,
          {
            transportOutcome: 'received',
            httpStatus: response.status,
            responseBodyDigest: bodyDigest,
            sealedResponseJson,
            observedAt,
          }
        );
        const completedAt = instant(Date.parse(startedAt));
        const providerRequestId =
          response.headers.get('x-request-id') ??
          response.headers.get('request-id') ??
          response.headers.get('x-goog-request-id') ??
          (isPlainObject(sealedResponseJson) &&
          typeof sealedResponseJson.id === 'string'
            ? sealedResponseJson.id
            : undefined);
        const successful = response.status >= 200 && response.status < 300;
        const transportReceipt = createAgentEvaluationTransportReceipt({
          receiptId: `provider-runtime-transport.${intent.ownerRequestDigest.slice('sha256-'.length)}.${sequence}`,
          protocolFamily,
          providerConfigurationId: identity.providerConfigurationId,
          invocationId: intent.invocationId,
          dispatchIntentDigest: dispatchIntent.intentDigest,
          requestDigest: requestMaterial.projection.requestDigest,
          endpointId: definition.endpointId,
          endpointClass: 'first-party-hosted',
          requestBodyDigest: requestMaterial.projection.requestBodyDigest,
          requestBytes: requestMaterial.projection.requestBytes,
          responseBytes: bodyBytes.byteLength,
          httpStatus: response.status,
          responseHeaderDigest: responseHeaderDigest(response),
          responseBodyDigest: bodyDigest,
          ...(validIdentity(providerRequestId) ? { providerRequestId } : {}),
          sseEventCount: 0,
          dispatchState: 'dispatched',
          outcome: successful ? 'completed' : 'failed',
          ...(successful
            ? {}
            : { errorCategory: errorCategoryForStatus(response.status) }),
          startedAt,
          completedAt,
        });
        return Object.freeze({
          requestMaterial,
          response: decoded,
          dispatchIntent,
          transportReceipt,
          sealedResponseJson,
          observedAt,
          executedAt: instant(Date.parse(observedAt)),
        });
      } catch (caught) {
        const completedAt = instant(Date.parse(startedAt));
        const timedOut =
          caught instanceof DOMException && caught.name === 'TimeoutError';
        const transportReceipt = createAgentEvaluationTransportReceipt({
          receiptId: `provider-runtime-transport.${intent.ownerRequestDigest.slice('sha256-'.length)}.${sequence}`,
          protocolFamily,
          providerConfigurationId: identity.providerConfigurationId,
          invocationId: intent.invocationId,
          dispatchIntentDigest: dispatchIntent.intentDigest,
          requestDigest: requestMaterial.projection.requestDigest,
          endpointId: definition.endpointId,
          endpointClass: 'first-party-hosted',
          requestBodyDigest: requestMaterial.projection.requestBodyDigest,
          requestBytes: requestMaterial.projection.requestBytes,
          responseBytes: 0,
          sseEventCount: 0,
          dispatchState: dispatchAttempted ? 'dispatched' : 'not-dispatched',
          outcome: 'failed',
          errorCategory: timedOut
            ? 'G4_RUNNER_TRANSPORT_FAILED'
            : transportErrorCategory(caught),
          startedAt,
          completedAt,
        });
        const observedAt = instant(Date.parse(completedAt));
        return Object.freeze({
          requestMaterial,
          response: decodeAgentNativeProviderCapabilityRuntimeResponse(
            program,
            requestMaterial.projection,
            {
              transportOutcome: timedOut ? 'timed-out' : 'failed',
              httpStatus: null,
              responseBodyDigest: null,
              sealedResponseJson: null,
              observedAt,
            }
          ),
          dispatchIntent,
          transportReceipt,
          sealedResponseJson: null,
          observedAt,
          executedAt: instant(Date.parse(observedAt)),
        });
      } finally {
        bodyBytes?.fill(0);
      }
    };

    const owner: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport =
      {
        authorityKind: 'production-capability-effect-provider-runtime',
        checkReadiness(healthInput, ownerKind = 'provider-metadata-transport') {
          return externalHealth(healthInput, ownerKind);
        },
        async execute(executionInput) {
          if (closed) return fail('closed');
          if (!input.executionEnabled) return undefined;
          const { binding, program, nativeSourceReceipt } = executionInput;
          const intent = binding.toolInput.preEffectIntent;
          const bindingKind = intent.inputAuthorityBinding.bindingKind;
          const hosted = bindingKind === 'hosted-retrieval-query';
          const resourceContext = executionInput.hostedResourceContext;
          if (
            hosted !== (resourceContext !== null) ||
            hosted !== (nativeSourceReceipt === null) ||
            hosted !== (executionInput.readinessOwnerInstanceId !== null)
          ) {
            return undefined;
          }
          const protocolFamily = binding.sourceIdentity.protocolFamily;
          if (!isNativeProtocol(protocolFamily)) return undefined;
          const journal = journalFor({
            planDigest: intent.planDigest,
            repositoryCommit: intent.repositoryCommit,
          });
          attempts.set(
            digestAgentCanonicalValue({
              attemptId: intent.attemptId,
              planDigest: intent.planDigest,
              repositoryCommit: intent.repositoryCommit,
            }),
            {
              attemptId: intent.attemptId,
              planDigest: intent.planDigest,
              repositoryCommit: intent.repositoryCommit,
            }
          );
          const priorSnapshot = await journal.readSnapshot(
            intent.ownerRequestDigest
          );
          if (
            priorSnapshot?.resultRecord !== null &&
            priorSnapshot !== undefined
          ) {
            return materialFromResultRecord(priorSnapshot);
          }
          if (priorSnapshot !== undefined) {
            // A stage without a terminal result may have crossed the Provider
            // boundary. It is left for durable cleanup and never redispatched.
            return undefined;
          }
          const transportHealth = await probeRuntimeHealth({
            sourceIdentity: binding.sourceIdentity,
            healthKeyDigest: intent.registrationReceiptDigest,
            ownerKind:
              executionInput.vaultOwnerInstanceId === null
                ? 'provider-metadata-transport'
                : 'provider-state-vault',
          });
          if (!transportHealth) return undefined;
          const checkedAt = transportHealth.checkedAt;
          const stageExpiresAt = new Date(
            Math.min(
              Date.parse(transportHealth.expiresAt),
              Date.parse(executionInput.outerStage.expiresAt),
              ...(resourceContext === null
                ? []
                : [
                    Date.parse(
                      resourceContext.providerResourceAuthority.expiresAt
                    ),
                    Date.parse(
                      resourceContext.providerResourceReadReceipt.expiresAt
                    ),
                  ])
            )
          ).toISOString();
          const operation =
            bindingKind === 'provider-job'
              ? ('background-poll' as const)
              : bindingKind === 'opaque-continuation'
                ? ('continuation-resume' as const)
                : bindingKind === 'hosted-retrieval-query'
                  ? ('hosted-retrieval-query' as const)
                  : ('cache-cold' as const);
          const firstRequest =
            createAgentNativeProviderCapabilityRuntimeRequestMaterial(program, {
              operation,
              protocolFamily,
              providerConfigurationId:
                binding.sourceIdentity.providerConfigurationId,
              modelId: binding.sourceIdentity.modelId,
              modelLineageDigest: binding.sourceIdentity.modelLineageDigest,
              adapterDigest: binding.sourceIdentity.adapterDigest,
              callbackLocalBaseRequestBody: null,
              callbackLocalProviderStateHandle:
                executionInput.callbackLocalProviderStateHandle,
              providerResourceAuthority:
                resourceContext?.providerResourceAuthority ?? null,
              providerResourceReadRequest:
                resourceContext?.providerResourceReadRequest ?? null,
              providerResourceReadReceipt:
                resourceContext?.providerResourceReadReceipt ?? null,
              cacheKeyDigest: cacheKeyFrom(nativeSourceReceipt),
              observedAt: instant(Date.parse(checkedAt)),
            });
          const readiness =
            createAgentEvaluationCapabilityEffectProviderReadinessReceipt(
              intent,
              {
                ownerInstanceId:
                  executionInput.readinessOwnerInstanceId ?? ownerInstanceId,
                transportOwnerInstanceId: ownerInstanceId,
                transportHealthDigest: transportHealth.healthDigest,
                vaultOwnerInstanceId: executionInput.vaultOwnerInstanceId,
                vaultHealthDigest: executionInput.vaultHealthDigest,
                status: 'healthy',
                unavailableReason: null,
                checkedAt,
                expiresAt: stageExpiresAt,
              }
            );
          const stageRequest =
            createAgentEvaluationCapabilityEffectProviderStageRequest(
              program,
              intent,
              {
                readinessReceipt: readiness,
                requestProjection: firstRequest.projection,
                nativeSourceReceipt,
                stateVaultResolveRequest:
                  executionInput.stateVaultResolveRequest,
                stateVaultResolveReceipt:
                  executionInput.stateVaultResolveReceipt,
                providerResourceSetCommitment:
                  resourceContext?.providerResourceSetCommitment ?? null,
                providerResourceAuthority:
                  resourceContext?.providerResourceAuthority ?? null,
                providerResourceReadRequest:
                  resourceContext?.providerResourceReadRequest ?? null,
                providerResourceReadReceipt:
                  resourceContext?.providerResourceReadReceipt ?? null,
                stagedAt: instant(Date.parse(checkedAt)),
                expiresAt: stageExpiresAt,
              }
            );
          const stageRecord =
            createAgentEvaluationCapabilityEffectProviderJournalStageRecord(
              intent,
              stageRequest
            );
          const claim = await journal.claimStage(stageRecord);
          if (!claim || claim.disposition !== 'created') return undefined;

          const executionRecords: AgentEvaluationCapabilityEffectProviderJournalExecutionRecord[] =
            [];
          const executionReceipts: AgentEvaluationCapabilityEffectProviderExecutionReceipt[] =
            [];
          const responses: AgentNativeProviderCapabilityRuntimeResponseDecodeResult[] =
            [];
          const spoolReceipts: Array<ReturnType<
            typeof createAgentEvaluationCapabilityEffectProviderSpoolReceipt
          > | null> = [];
          let request = firstRequest;
          let cacheWarmAuthority: AgentNativeProviderCapabilityRuntimeCacheWarmAuthority | null =
            null;
          const maximumExecutions =
            stageRequest.bindingKind === 'provider-job'
              ? 4
              : stageRequest.bindingKind === 'provider-cache'
                ? 2
                : 1;
          for (let index = 0; index < maximumExecutions; index += 1) {
            const sequence =
              stageRequest.bindingKind === 'provider-job' ? index + 1 : index;
            const raw = await dispatch(executionInput, request, sequence);
            const aad =
              raw.response.projection.responseBodyDigest === null
                ? null
                : createAgentEvaluationCapabilityEffectProviderSpoolAad({
                    namespaceDigest: digestAgentCanonicalValue({
                      namespaceId: intent.namespaceId,
                    }),
                    planDigest: intent.planDigest,
                    repositoryCommit: intent.repositoryCommit,
                    attemptId: intent.attemptId,
                    descriptorDigest: intent.descriptorDigest,
                    turnIndex: intent.turnIndex,
                    invocationId: intent.invocationId,
                    ownerRequestDigest: intent.ownerRequestDigest,
                    stageDigest: stageRequest.stageDigest,
                    executionSequence: sequence,
                    dispatchIntentDigest: raw.dispatchIntent.intentDigest,
                    transportReceiptDigest: raw.transportReceipt.receiptDigest,
                    responseBodyDigest:
                      raw.response.projection.responseBodyDigest,
                    responseProjectionDigest:
                      raw.response.projection.projectionDigest,
                    responseDigest: raw.response.projection.responseDigest,
                    normalizedEventSetDigest:
                      raw.response.projection.normalizedEventSetDigest,
                  });
            const envelope: AgentEvaluationProviderResultSpoolEnvelope | null =
              aad === null || raw.sealedResponseJson === null
                ? null
                : await input.spoolCipher.encrypt(aad, raw.sealedResponseJson);
            const envelopeAuthority =
              envelope === null
                ? null
                : createAgentEvaluationCapabilityEffectProviderSpoolEnvelopeAuthority(
                    envelope
                  );
            const spoolReceipt =
              aad === null || envelopeAuthority === null
                ? null
                : createAgentEvaluationCapabilityEffectProviderSpoolReceipt({
                    aad,
                    envelopeAuthority,
                    retentionPolicyDigest:
                      AGENT_EVALUATION_CAPABILITY_EFFECT_PROVIDER_SPOOL_RETENTION_POLICY_DIGEST,
                    createdAt: raw.observedAt,
                    expiresAt: stageExpiresAt,
                  });
            const priorExecutionReceipt = executionReceipts.at(-1) ?? null;
            const executionReceipt =
              createAgentEvaluationCapabilityEffectProviderExecutionReceipt(
                program,
                intent,
                stageRequest,
                {
                  requestProjection: request.projection,
                  cacheWarmAuthority,
                  dispatchIntent: raw.dispatchIntent,
                  transportReceipt: raw.transportReceipt,
                  resultSpoolReceipt: spoolReceipt,
                  responseProjection: raw.response.projection,
                  pollSequence: sequence,
                  priorExecutionReceipt,
                  executedAt: raw.executedAt,
                }
              );
            const priorExecutionRecord = executionRecords.at(-1) ?? null;
            const executionRecord =
              createAgentEvaluationCapabilityEffectProviderJournalExecutionRecord(
                {
                  stageRecord,
                  executionReceipt,
                  priorExecutionRecord,
                  spoolAad: aad,
                  spoolEnvelopeAuthority: envelopeAuthority,
                }
              );
            const persisted = await journal.writeExecution({
              write:
                createAgentEvaluationCapabilityEffectProviderJournalExecutionWrite(
                  executionRecord,
                  envelope
                ),
              stageRecord,
              priorExecutionRecord,
            });
            if (!persisted) return undefined;
            executionRecords.push(persisted);
            executionReceipts.push(executionReceipt);
            responses.push(raw.response);
            spoolReceipts.push(spoolReceipt);
            if (executionReceipt.executionStatus !== 'in-progress') break;
            if (stageRequest.bindingKind === 'provider-cache') {
              const warmRequest =
                createAgentNativeProviderCapabilityRuntimeRequestMaterial(
                  program,
                  {
                    operation: 'cache-warm',
                    protocolFamily,
                    providerConfigurationId:
                      binding.sourceIdentity.providerConfigurationId,
                    modelId: binding.sourceIdentity.modelId,
                    modelLineageDigest:
                      binding.sourceIdentity.modelLineageDigest,
                    adapterDigest: binding.sourceIdentity.adapterDigest,
                    callbackLocalBaseRequestBody: null,
                    callbackLocalProviderStateHandle: null,
                    providerResourceAuthority: null,
                    providerResourceReadRequest: null,
                    providerResourceReadReceipt: null,
                    cacheKeyDigest: cacheKeyFrom(nativeSourceReceipt),
                    observedAt: instant(),
                  }
                );
              cacheWarmAuthority =
                createAgentNativeProviderCapabilityRuntimeCacheWarmAuthority(
                  program,
                  {
                    coldRequest: request.projection,
                    coldResponse: raw.response.projection,
                    warmRequest: warmRequest.projection,
                    preparedAt: instant(),
                    expiresAt: stageExpiresAt,
                  }
                );
              request = warmRequest;
            }
          }
          const terminalExecution = executionReceipts.at(-1);
          const terminalResponse = responses.at(-1);
          if (
            !terminalExecution ||
            !terminalResponse ||
            terminalExecution.executionStatus === 'in-progress'
          ) {
            return undefined;
          }
          const stateLifecycle = executionInput.completeStateLifecycle
            ? await executionInput.completeStateLifecycle({
                requestMaterial: request,
                response: terminalResponse,
                executionStatus: terminalExecution.executionStatus,
              })
            : Object.freeze({
                stateVaultRetireRequest: null,
                stateVaultRetirementReceipt: null,
                nextStateVaultSealRequest: null,
                nextStateVaultSealReceipt: null,
                sealedAt: instant(Date.parse(terminalExecution.executedAt)),
              });
          const sealedAt = instant(Date.parse(stateLifecycle.sealedAt));
          const runtimeResult =
            createAgentEvaluationCapabilityEffectProviderRuntimeResult(
              program,
              intent,
              stageRequest,
              terminalExecution,
              {
                response: terminalResponse,
                priorExecutionReceipt: executionReceipts.at(-2) ?? null,
                stateVaultRetireRequest: stateLifecycle.stateVaultRetireRequest,
                stateVaultRetirementReceipt:
                  stateLifecycle.stateVaultRetirementReceipt,
                nextStateVaultSealRequest:
                  stateLifecycle.nextStateVaultSealRequest,
                nextStateVaultSealReceipt:
                  stateLifecycle.nextStateVaultSealReceipt,
                sealedAt,
              }
            );
          const dispositions = spoolReceipts.flatMap((receipt) =>
            receipt === null
              ? []
              : [
                  createAgentEvaluationCapabilityEffectProviderSpoolDispositionReceipt(
                    {
                      spoolRef: receipt.spoolRef,
                      spoolReceiptDigest: receipt.receiptDigest,
                      planDigest: receipt.planDigest,
                      repositoryCommit: receipt.repositoryCommit,
                      attemptId: receipt.attemptId,
                      descriptorDigest: receipt.descriptorDigest,
                      turnIndex: receipt.turnIndex,
                      invocationId: receipt.invocationId,
                      ownerRequestDigest: receipt.ownerRequestDigest,
                      stageDigest: receipt.stageDigest,
                      executionSequence: receipt.executionSequence,
                      disposition: 'consumed-and-destroyed',
                      resultSealReceiptDigest:
                        runtimeResult.resultSealReceipt.receiptDigest,
                      abandonmentReason: null,
                      retentionPolicyDigest: receipt.retentionPolicyDigest,
                      disposedAt: sealedAt,
                    }
                  ),
                ]
          );
          const resultRecord =
            createAgentEvaluationCapabilityEffectProviderJournalResultRecord({
              stageRecord,
              executionRecords,
              businessResult: runtimeResult.businessResult,
              effectSourceFact: runtimeResult.fact,
              stateVaultRetireRequest: stateLifecycle.stateVaultRetireRequest,
              stateVaultRetirementReceipt:
                stateLifecycle.stateVaultRetirementReceipt,
              nextStateVaultSealRequest:
                stateLifecycle.nextStateVaultSealRequest,
              nextStateVaultSealReceipt:
                stateLifecycle.nextStateVaultSealReceipt,
              resultSealReceipt: runtimeResult.resultSealReceipt,
              spoolDispositionReceipts: dispositions,
            });
          const persistedResult = await journal.writeResult({
            resultRecord,
            stageRecord,
            executionRecords,
          });
          if (!persistedResult) return undefined;
          const terminalSpool = spoolReceipts.at(-1) ?? null;
          return Object.freeze({
            businessResult: runtimeResult.businessResult,
            effectSourceFact: runtimeResult.fact,
            providerRuntimeJournalResultRecordDigest:
              persistedResult.recordDigest,
            providerRuntimeResultSealReceiptDigest:
              runtimeResult.resultSealReceipt.receiptDigest,
            transportReceiptDigest:
              terminalExecution.transportReceipt.receiptDigest,
            resultSpoolReceiptDigest: terminalSpool?.receiptDigest ?? null,
            normalizedEventSetDigest:
              terminalExecution.responseProjection.normalizedEventSetDigest,
            stateVaultResolveRequest: executionInput.stateVaultResolveRequest,
            stateVaultResolveReceipt: executionInput.stateVaultResolveReceipt,
            stateVaultRetireRequest: stateLifecycle.stateVaultRetireRequest,
            stateVaultRetirementReceipt:
              stateLifecycle.stateVaultRetirementReceipt,
            sealedAt,
          });
        },
        close() {
          closePromise ??= (async () => {
            closed = true;
            for (const scope of attempts.values()) {
              const journal = journalFor(scope);
              const requestedAt = instant();
              const cleanup =
                createAgentEvaluationCapabilityEffectProviderJournalCleanupRequest(
                  {
                    namespaceId:
                      input.environment(
                        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.namespace
                      ) ?? fail('namespace'),
                    planDigest: scope.planDigest,
                    repositoryCommit: scope.repositoryCommit,
                    attemptId: scope.attemptId,
                    reason: 'cleanup-requested',
                    requestedAt,
                  }
                );
              if (!(await journal.cleanup(cleanup))) return fail('cleanup');
              if (!(await journal.readZeroResidual(scope.attemptId))) {
                return fail('zero-residual');
              }
            }
            attempts.clear();
            return Object.freeze({
              status: 'clean' as const,
              residualResourceIds: Object.freeze([]) as readonly [],
              residualCanaryIds: Object.freeze([]) as readonly [],
            });
          })();
          return closePromise;
        },
      };
    return Object.freeze(owner);
  };

export const createProductionAgentEvaluationSharedEffectStatefulRuntimeTransport =
  (
    runtime: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport
  ): AgentEvaluationProductionSharedEffectStatefulTransport =>
    Object.freeze({
      authorityKind: 'production-native-provider-state-shared-effect' as const,
      readinessAuthority: 'state-vault-and-provider-effect-owner' as const,
      execute(
        input: Parameters<
          AgentEvaluationProductionSharedEffectStatefulTransport['execute']
        >[0]
      ) {
        return runtime.execute({
          binding: input.binding,
          outerStage: input.stage,
          program: input.program,
          nativeSourceReceipt: input.nativeSourceReceipt,
          hostedResourceContext: null,
          readinessOwnerInstanceId: null,
          callbackLocalProviderStateHandle:
            input.callbackLocalProviderStateHandle,
          stateVaultResolveRequest: input.stateVaultResolveRequest,
          stateVaultResolveReceipt: input.stateVaultResolveReceipt,
          vaultOwnerInstanceId: input.vaultOwnerInstanceId,
          vaultHealthDigest: input.vaultHealthDigest,
          completeStateLifecycle: input.completeStateLifecycle,
        });
      },
      checkReadiness(
        input: Parameters<
          AgentEvaluationProductionSharedEffectStatefulTransport['checkReadiness']
        >[0]
      ) {
        return runtime.checkReadiness(input, 'provider-state-vault');
      },
      close: runtime.close,
    });

export const createProductionAgentEvaluationSharedEffectMetadataRuntimeOwner = (
  runtime: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport
): AgentEvaluationProductionSharedEffectMetadataOwner =>
  Object.freeze({
    lifecycle: 'native-provider-transport-metadata-source' as const,
    execute(
      input: Parameters<
        AgentEvaluationProductionSharedEffectMetadataOwner['execute']
      >[0]
    ) {
      return runtime.execute({
        binding: input.binding,
        outerStage: input.stage,
        program: input.program,
        nativeSourceReceipt: input.nativeSourceReceipt,
        hostedResourceContext: null,
        readinessOwnerInstanceId: null,
        callbackLocalProviderStateHandle: null,
        stateVaultResolveRequest: null,
        stateVaultResolveReceipt: null,
        vaultOwnerInstanceId: null,
        vaultHealthDigest: null,
      });
    },
    checkReadiness(
      input: Parameters<
        AgentEvaluationProductionSharedEffectMetadataOwner['checkReadiness']
      >[0]
    ) {
      return runtime.checkReadiness(input, 'provider-metadata-transport');
    },
    close: runtime.close,
  });

export const createProductionAgentEvaluationSharedEffectHostedRuntimeTransport =
  (
    runtime: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport
  ): AgentEvaluationProductionSharedEffectHostedTransport =>
    Object.freeze({
      authorityKind: 'production-hosted-retrieval-shared-effect' as const,
      readinessAuthority:
        'hosted-resource-read-and-provider-query-owner' as const,
      async execute(
        input: Parameters<
          AgentEvaluationProductionSharedEffectHostedTransport['execute']
        >[0]
      ) {
        const material = await runtime.execute({
          binding: input.binding,
          outerStage: input.stage,
          program: input.program,
          nativeSourceReceipt: null,
          hostedResourceContext: input.resourceContext,
          readinessOwnerInstanceId:
            input.resourceContext.providerResourceReadRequest
              .readerOwnerInstanceId,
          callbackLocalProviderStateHandle: null,
          stateVaultResolveRequest: null,
          stateVaultResolveReceipt: null,
          vaultOwnerInstanceId: null,
          vaultHealthDigest: null,
        });
        if (
          !material ||
          material.stateVaultResolveRequest !== null ||
          material.stateVaultResolveReceipt !== null ||
          material.stateVaultRetireRequest !== null ||
          material.stateVaultRetirementReceipt !== null
        ) {
          return undefined;
        }
        const {
          stateVaultResolveRequest: _stateVaultResolveRequest,
          stateVaultResolveReceipt: _stateVaultResolveReceipt,
          stateVaultRetireRequest: _stateVaultRetireRequest,
          stateVaultRetirementReceipt: _stateVaultRetirementReceipt,
          ...hostedMaterial
        } = material;
        return Object.freeze(hostedMaterial);
      },
      checkReadiness(
        input: Parameters<
          AgentEvaluationProductionSharedEffectHostedTransport['checkReadiness']
        >[0]
      ) {
        return runtime.checkReadiness(
          input.healthInput,
          'hosted-retrieval-resource'
        );
      },
      close: runtime.close,
    });

export const createProductionAgentEvaluationSharedEffectHostedPreactivationRuntimeTransport =
  (
    runtime: AgentEvaluationProductionCapabilityEffectProviderRuntimeTransport
  ): AgentEvaluationProductionSharedEffectHostedPreactivationTransport =>
    Object.freeze({
      authorityKind: 'production-hosted-retrieval-shared-effect' as const,
      readinessAuthority:
        'hosted-owner-bootstrap-and-provider-query-owner' as const,
      checkReadiness(
        input: Parameters<
          AgentEvaluationProductionSharedEffectHostedPreactivationTransport['checkReadiness']
        >[0]
      ) {
        return runtime.checkReadiness(
          input.healthInput,
          'hosted-retrieval-resource'
        );
      },
      close: runtime.close,
    });
