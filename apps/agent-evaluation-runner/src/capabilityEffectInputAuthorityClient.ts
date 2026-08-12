import {
  createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt,
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  isAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  isAgentModelEvaluationAttemptDescriptor,
  validateAgentProviderRuntimeEventBinding,
  type AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt,
  type AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt,
  type AgentModelEvaluationAttemptDescriptor,
  type AgentProviderRuntimeEvent,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_LEDGER_BASE_URL,
  AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES,
  AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS,
} from './ledgerClient';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-effect-request-ref-authority-request' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-effect-current-turn-event-request' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-effect-input-authority-registry-request' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-effect-request-ref-authority-response' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-effect-current-turn-event-response' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-effect-input-authority-registry-response' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-capability-effect-current-turn-event-receipt' as const;
export const AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION =
  1 as const;

const maximumRequestBytes = 131_072;
const maximumResponseBytes = 65_536;
const exactCommitPattern = /^[0-9a-f]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationCapabilityEffectRequestRefAuthorityRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_REQUEST_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    attemptId: string;
    descriptorDigest: CanonicalDigest;
    descriptor: AgentModelEvaluationAttemptDescriptor;
    turnIndex: number;
    invocationId: string;
    bindingKind: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt['bindingKind'];
    capabilityId: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt['capabilityId'];
    toolId: string;
    targetRef: string;
    protocolFamily: AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt['protocolFamily'];
    providerConfigurationId: string;
    modelLineageDigest: CanonicalDigest;
    adapterDigest: CanonicalDigest;
    runtimeFactSourceAuthorityDigest: CanonicalDigest;
    registrationReceiptDigest: CanonicalDigest;
    issuedAt: string;
    expiresAt: string;
    requestDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationCapabilityEffectRequestRefAuthorityRequestInput =
  Omit<
    AgentEvaluationCapabilityEffectRequestRefAuthorityRequest,
    'format' | 'version' | 'requestDigest'
  >;

export type AgentEvaluationCapabilityEffectCurrentTurnEventRequest = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestRefAuthorityReceiptDigest: CanonicalDigest;
  requestRef: string;
  targetRef: string;
  providerToolCallId: string;
  toolId: 'provider.retrieval.search';
  argumentsDigest: CanonicalDigest;
  selectedEventDigest: CanonicalDigest;
  normalizedEvents: readonly AgentProviderRuntimeEvent[];
  normalizedEventSetDigest: CanonicalDigest;
  recordedAt: string;
  requestDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityEffectCurrentTurnEventRequestInput =
  Omit<
    AgentEvaluationCapabilityEffectCurrentTurnEventRequest,
    'format' | 'version' | 'normalizedEventSetDigest' | 'requestDigest'
  >;

export type AgentEvaluationCapabilityEffectInputAuthorityRegistryRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_REQUEST_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION;
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    requestRefAuthorityReceiptDigest: CanonicalDigest;
    requestRef: string;
    targetRef: string;
    requestedAt: string;
    requestDigest: CanonicalDigest;
  }>;

export type CreateAgentEvaluationCapabilityEffectInputAuthorityRegistryRequestInput =
  Omit<
    AgentEvaluationCapabilityEffectInputAuthorityRegistryRequest,
    'format' | 'version' | 'requestDigest'
  >;

export type AgentEvaluationCapabilityEffectCurrentTurnEventReceipt = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  requestRefAuthorityReceiptDigest: CanonicalDigest;
  requestRef: string;
  targetRef: string;
  providerRequestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  selectedEventDigest: CanonicalDigest;
  providerToolCallId: string;
  toolId: 'provider.retrieval.search';
  argumentsDigest: CanonicalDigest;
  recordedAt: string;
  receiptDigest: CanonicalDigest;
}>;

export interface AgentEvaluationCapabilityEffectInputAuthorityClient {
  issueRequestRef(
    request: AgentEvaluationCapabilityEffectRequestRefAuthorityRequest
  ): Promise<AgentEvaluationCapabilityEffectRequestRefAuthorityReceipt>;
  sealCurrentTurnEvent(
    request: AgentEvaluationCapabilityEffectCurrentTurnEventRequest
  ): Promise<AgentEvaluationCapabilityEffectCurrentTurnEventReceipt>;
  resolveInputAuthority(
    request: AgentEvaluationCapabilityEffectInputAuthorityRegistryRequest
  ): Promise<AgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt>;
}

export type CreateEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClientInput =
  Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: Environment;
    fetch?: typeof fetch;
    timeoutMs?: number;
    forbiddenCanaries: () => readonly string[];
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

const assertCanonicalRequest = <T>(value: T): T => {
  try {
    if (
      textEncoder.encode(canonicalJsonText(value)).byteLength >
      maximumRequestBytes
    ) {
      return invalid();
    }
    return value;
  } catch {
    return invalid();
  }
};

const assertScope = (
  value: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
  }>
): void => {
  if (
    !isAgentControlIdentity(value.namespaceId) ||
    !isAgentCanonicalDigest(value.planDigest) ||
    !exactCommitPattern.test(value.repositoryCommit)
  ) {
    return invalid();
  }
};

export const createAgentEvaluationCapabilityEffectRequestRefAuthorityRequest = (
  input: CreateAgentEvaluationCapabilityEffectRequestRefAuthorityRequestInput
): AgentEvaluationCapabilityEffectRequestRefAuthorityRequest => {
  assertScope(input);
  if (
    !isAgentModelEvaluationAttemptDescriptor(input.descriptor) ||
    input.descriptor.descriptorDigest !== input.descriptorDigest ||
    input.descriptor.attemptId !== input.attemptId ||
    input.descriptor.planDigest !== input.planDigest
  ) {
    return invalid();
  }
  createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
    namespaceId: input.namespaceId,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    turnIndex: input.turnIndex,
    invocationId: input.invocationId,
    bindingKind: input.bindingKind,
    capabilityId: input.capabilityId,
    toolId: input.toolId,
    targetRef: input.targetRef,
    protocolFamily: input.protocolFamily,
    providerConfigurationId: input.providerConfigurationId,
    modelLineageDigest: input.modelLineageDigest,
    adapterDigest: input.adapterDigest,
    runtimeFactSourceAuthorityDigest: input.runtimeFactSourceAuthorityDigest,
    registrationReceiptDigest: input.registrationReceiptDigest,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_REQUEST_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION,
    ...input,
  });
  return assertCanonicalRequest(
    Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    })
  );
};

export const createAgentEvaluationCapabilityEffectCurrentTurnEventRequest = (
  input: CreateAgentEvaluationCapabilityEffectCurrentTurnEventRequestInput
): AgentEvaluationCapabilityEffectCurrentTurnEventRequest => {
  assertScope(input);
  if (
    !isAgentControlInstant(input.recordedAt) ||
    !Array.isArray(input.normalizedEvents) ||
    input.normalizedEvents.length < 1 ||
    input.normalizedEvents.length > 10_000 ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= 7 ||
    ![
      input.attemptId,
      input.invocationId,
      input.requestRef,
      input.targetRef,
      input.providerToolCallId,
      input.toolId,
    ].every(isAgentControlIdentity) ||
    ![
      input.descriptorDigest,
      input.requestRefAuthorityReceiptDigest,
      input.argumentsDigest,
      input.selectedEventDigest,
    ].every(isAgentCanonicalDigest) ||
    input.argumentsDigest !==
      digestAgentCanonicalValue({
        requestRef: input.requestRef,
        targetRef: input.targetRef,
      })
  ) {
    return invalid();
  }
  let normalizedEvents: readonly AgentProviderRuntimeEvent[];
  try {
    normalizedEvents = Object.freeze(
      input.normalizedEvents.map((event) =>
        validateAgentProviderRuntimeEventBinding(event)
      )
    );
  } catch {
    return invalid();
  }
  if (
    normalizedEvents.some(
      ({ durableEvent }, sequence) =>
        durableEvent.sequence !== sequence ||
        durableEvent.invocationId !== input.invocationId
    )
  ) {
    return invalid();
  }
  const selected = normalizedEvents.filter(
    ({ durableEvent }) => durableEvent.eventDigest === input.selectedEventDigest
  );
  const selectedPayload = selected[0]?.payload;
  const selectedCallId = isPlainObject(selectedPayload)
    ? typeof selectedPayload.itemId === 'string'
      ? selectedPayload.itemId
      : selectedPayload.id
    : undefined;
  const selectedArguments = isPlainObject(selectedPayload)
    ? selectedPayload.arguments
    : undefined;
  if (
    selected.length !== 1 ||
    selected[0]?.durableEvent.type !== 'tool-call' ||
    !isPlainObject(selectedPayload) ||
    !exactRecord(selectedArguments, ['requestRef', 'targetRef']) ||
    selectedCallId !== input.providerToolCallId ||
    selectedPayload.name !== input.toolId ||
    selectedPayload.argumentsDigest !== input.argumentsDigest ||
    selectedArguments.requestRef !== input.requestRef ||
    selectedArguments.targetRef !== input.targetRef
  ) {
    return invalid();
  }
  const base = Object.freeze({
    format:
      AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_REQUEST_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION,
    ...input,
    normalizedEvents,
    normalizedEventSetDigest: digestAgentCanonicalValue(normalizedEvents),
  });
  return assertCanonicalRequest(
    Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    })
  );
};

export const createAgentEvaluationCapabilityEffectInputAuthorityRegistryRequest =
  (
    input: CreateAgentEvaluationCapabilityEffectInputAuthorityRegistryRequestInput
  ): AgentEvaluationCapabilityEffectInputAuthorityRegistryRequest => {
    assertScope(input);
    if (
      !isAgentCanonicalDigest(input.requestRefAuthorityReceiptDigest) ||
      !isAgentControlIdentity(input.requestRef) ||
      !isAgentControlIdentity(input.targetRef) ||
      !isAgentControlInstant(input.requestedAt)
    ) {
      return invalid();
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_REQUEST_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION,
      ...input,
    });
    return assertCanonicalRequest(
      Object.freeze({
        ...base,
        requestDigest: digestAgentCanonicalValue(base),
      })
    );
  };

const decodeCurrentTurnEventReceipt = (
  value: unknown,
  request: AgentEvaluationCapabilityEffectCurrentTurnEventRequest
): AgentEvaluationCapabilityEffectCurrentTurnEventReceipt => {
  const keys = [
    'format',
    'version',
    'namespaceId',
    'planDigest',
    'repositoryCommit',
    'attemptId',
    'descriptorDigest',
    'turnIndex',
    'invocationId',
    'requestRefAuthorityReceiptDigest',
    'requestRef',
    'targetRef',
    'providerRequestDigest',
    'responseDigest',
    'dispatchIntentDigest',
    'transportReceiptDigest',
    'resultSpoolReceiptDigest',
    'normalizedEventSetDigest',
    'selectedEventDigest',
    'providerToolCallId',
    'toolId',
    'argumentsDigest',
    'recordedAt',
    'receiptDigest',
  ] as const;
  if (!exactRecord(value, keys)) return invalid();
  const receipt =
    value as unknown as AgentEvaluationCapabilityEffectCurrentTurnEventReceipt;
  const { receiptDigest, ...base } = receipt;
  if (
    receipt.format !==
      AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RECEIPT_FORMAT ||
    receipt.version !==
      AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION ||
    receipt.namespaceId !== request.namespaceId ||
    receipt.planDigest !== request.planDigest ||
    receipt.repositoryCommit !== request.repositoryCommit ||
    receipt.attemptId !== request.attemptId ||
    receipt.descriptorDigest !== request.descriptorDigest ||
    receipt.turnIndex !== request.turnIndex ||
    receipt.invocationId !== request.invocationId ||
    receipt.requestRefAuthorityReceiptDigest !==
      request.requestRefAuthorityReceiptDigest ||
    receipt.requestRef !== request.requestRef ||
    receipt.targetRef !== request.targetRef ||
    receipt.normalizedEventSetDigest !== request.normalizedEventSetDigest ||
    receipt.selectedEventDigest !== request.selectedEventDigest ||
    receipt.providerToolCallId !== request.providerToolCallId ||
    receipt.toolId !== request.toolId ||
    receipt.argumentsDigest !== request.argumentsDigest ||
    receipt.recordedAt !== request.recordedAt ||
    ![
      receipt.providerRequestDigest,
      receipt.responseDigest,
      receipt.dispatchIntentDigest,
      receipt.transportReceiptDigest,
      receipt.resultSpoolReceiptDigest,
      receipt.receiptDigest,
    ].every(isAgentCanonicalDigest) ||
    receiptDigest !== digestAgentCanonicalValue(base)
  ) {
    return invalid();
  }
  return Object.freeze({ ...receipt });
};

const readEnvironment = (environment: Environment) =>
  typeof environment === 'function'
    ? environment
    : (name: string): string | undefined => environment[name];

const parseSafeJson = (source: string): unknown => {
  try {
    return JSON.parse(source, (key, entry: unknown) => {
      if (key && isUnsafeObjectKey(key)) return invalid();
      return entry;
    }) as unknown;
  } catch (caught) {
    if (caught instanceof AgentEvaluationRunnerError) throw caught;
    return invalid();
  }
};

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal
): Promise<Uint8Array> => {
  const reader = response.body?.getReader();
  if (!reader) return invalid();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal.aborted) return unavailable();
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumResponseBytes) {
        await reader.cancel().catch(() => undefined);
        return invalid();
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

const responseReceipt = (
  value: unknown,
  format:
    | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT
    | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT
    | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
  requestDigest: CanonicalDigest
): unknown => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'requestDigest',
      'receipt',
      'replayed',
    ]) ||
    value.format !== format ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_VERSION ||
    value.requestDigest !== requestDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return invalid();
  }
  return value.receipt;
};

export const createEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityEffectInputAuthorityClientInput
  ): AgentEvaluationCapabilityEffectInputAuthorityClient => {
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
      options.timeoutMs ?? AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS;
    assertScope(options);
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      configuredNamespace !== options.namespaceId ||
      configuredCommit !== options.repositoryCommit ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > AGENT_EVALUATION_LEDGER_MAXIMUM_TIMEOUT_MS ||
      typeof options.forbiddenCanaries !== 'function'
    ) {
      return unavailable();
    }
    const endpointBase = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/${encodeURIComponent(options.planDigest)}/${options.repositoryCommit}`;
    const fetchImplementation = options.fetch ?? fetch;

    const post = async (
      path: string,
      format:
        | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT
        | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT
        | typeof AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
      request: Readonly<{
        namespaceId: string;
        planDigest: CanonicalDigest;
        repositoryCommit: string;
        requestDigest: CanonicalDigest;
      }>
    ): Promise<unknown> => {
      if (
        request.namespaceId !== options.namespaceId ||
        request.planDigest !== options.planDigest ||
        request.repositoryCommit !== options.repositoryCommit
      ) {
        return unavailable();
      }
      const requestText = canonicalJsonText(request);
      if (textEncoder.encode(requestText).byteLength > maximumRequestBytes) {
        return invalid();
      }
      let credentialSource: string | undefined = read(
        AGENT_EVALUATION_LEDGER_ENVIRONMENT_NAMES.token
      );
      let credential: Uint8Array | undefined;
      try {
        if (!isAgentEvaluationServiceToken(credentialSource))
          return unavailable();
        credential = textEncoder.encode(credentialSource);
        const signatures = createCredentialCanarySignatures(credential);
        const forbiddenCanaries = options.forbiddenCanaries();
        if (
          forbiddenCanaries.some(
            (canary) =>
              typeof canary !== 'string' ||
              canary.length === 0 ||
              requestText.includes(canary)
          )
        ) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
          );
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${textDecoder.decode(credential)}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': request.requestDigest,
        });
        try {
          const response = await fetchImplementation(
            `${endpointBase}/${path}`,
            {
              method: 'POST',
              headers,
              body: requestText,
              signal: controller.signal,
              redirect: 'error',
              referrerPolicy: 'no-referrer',
              cache: 'no-store',
              credentials: 'omit',
            }
          );
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
          if (
            textContainsCredentialCanary(responseText, signatures) ||
            forbiddenCanaries.some((canary) => responseText.includes(canary))
          ) {
            return invalid();
          }
          const decoded = parseSafeJson(responseText);
          if (
            responseText !== canonicalJsonText(decoded) ||
            valueContainsCredentialCanary(decoded, credential, signatures)
          ) {
            return invalid();
          }
          return responseReceipt(decoded, format, request.requestDigest);
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
    };

    const client: AgentEvaluationCapabilityEffectInputAuthorityClient =
      Object.freeze({
        async issueRequestRef(
          request: AgentEvaluationCapabilityEffectRequestRefAuthorityRequest
        ) {
          const receipt = await post(
            'capability-effect-request-ref-authorities',
            AGENT_EVALUATION_CAPABILITY_EFFECT_REQUEST_REF_AUTHORITY_RESPONSE_FORMAT,
            request
          );
          if (
            !isAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt(
              receipt
            )
          ) {
            return invalid();
          }
          const expected =
            createAgentEvaluationCapabilityEffectRequestRefAuthorityReceipt({
              namespaceId: request.namespaceId,
              planDigest: request.planDigest,
              repositoryCommit: request.repositoryCommit,
              attemptId: request.attemptId,
              descriptorDigest: request.descriptorDigest,
              turnIndex: request.turnIndex,
              invocationId: request.invocationId,
              bindingKind: request.bindingKind,
              capabilityId: request.capabilityId,
              toolId: request.toolId,
              targetRef: request.targetRef,
              protocolFamily: request.protocolFamily,
              providerConfigurationId: request.providerConfigurationId,
              modelLineageDigest: request.modelLineageDigest,
              adapterDigest: request.adapterDigest,
              runtimeFactSourceAuthorityDigest:
                request.runtimeFactSourceAuthorityDigest,
              registrationReceiptDigest: request.registrationReceiptDigest,
              issuedAt: request.issuedAt,
              expiresAt: request.expiresAt,
            });
          if (!sameCanonicalJson(receipt, expected)) return invalid();
          return receipt;
        },
        async sealCurrentTurnEvent(
          request: AgentEvaluationCapabilityEffectCurrentTurnEventRequest
        ) {
          const receipt = await post(
            'capability-effect-current-turn-events',
            AGENT_EVALUATION_CAPABILITY_EFFECT_CURRENT_TURN_EVENT_RESPONSE_FORMAT,
            request
          );
          return decodeCurrentTurnEventReceipt(receipt, request);
        },
        async resolveInputAuthority(
          request: AgentEvaluationCapabilityEffectInputAuthorityRegistryRequest
        ) {
          const receipt = await post(
            'capability-effect-input-authorities/resolve',
            AGENT_EVALUATION_CAPABILITY_EFFECT_INPUT_AUTHORITY_REGISTRY_RESPONSE_FORMAT,
            request
          );
          if (
            !isAgentEvaluationCapabilityEffectInputAuthorityRegistryReceipt(
              receipt
            ) ||
            receipt.requestRefAuthorityReceiptDigest !==
              request.requestRefAuthorityReceiptDigest ||
            receipt.requestRef !== request.requestRef ||
            receipt.targetRef !== request.targetRef
          ) {
            return invalid();
          }
          createAgentEvaluationCapabilityEffectInputAuthorityBindingFromRegistryReceipt(
            receipt
          );
          return receipt;
        },
      });
    return client;
  };
