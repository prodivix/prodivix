import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import {
  createAgentEvaluationTransportReceipt,
  digestAgentCanonicalValue,
  isAgentControlIdentity,
  normalizeNativeAgentProviderRuntimeEvents,
  validateAgentEvaluationEndpointSmokeTargetBinding,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeTarget,
  type AgentEvaluationTransportErrorCategory,
  type AgentEvaluationTransportReceipt,
  type AgentProviderProtocolFamily,
  type AgentUsageVector,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject } from '@prodivix/shared/safety';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationNativeProtocol,
} from './config';
import {
  authorizeAgentEvaluationEgress,
  isPublicAgentEvaluationAddress,
  resolveAgentEvaluationHost,
  type AgentEvaluationHostResolver,
} from './egress';
import {
  agentEvaluationEndpointSmokeBoundFetch,
  type AgentEvaluationEndpointSmokeBoundFetch,
} from './endpointSmokeEgressBoundFetch';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
  safeRunnerError,
  type AgentEvaluationRunnerErrorCode,
} from './errors';
import {
  createAgentEvaluationEndpointSmokeNormalizedResult,
  type AgentEvaluationEndpointSmokePreparedTransport,
  type AgentEvaluationEndpointSmokeTargetAuthority,
  type AgentEvaluationEndpointSmokeTransportFactory,
  type AgentEvaluationEndpointSmokeTransportObservation,
} from './smokeQualifier';
import type {
  AgentEvaluationProductionFrozenRunConfig,
  AgentEvaluationRunConfigProviderKey,
} from './runConfig';
import type { AgentEvaluationEnvironmentReader } from './secretResolver';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
} from './secretResolver';
import { containsAsciiControlCharacter } from './textSafety';

const maximumResponseBytes = 1_048_576;
const maximumEvents = 1_024;
const maximumCredentialBytes = 16_384;
const prompt =
  'Reply with exactly PRODIVIX_G4_SMOKE_OK and no other text.' as const;

const sha256 = (value: string | Uint8Array): string =>
  `sha256-${createHash('sha256').update(value).digest('hex')}`;

const durableCategories = new Set<AgentEvaluationTransportErrorCategory>([
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

const durableCategory = (
  code: AgentEvaluationRunnerErrorCode
): AgentEvaluationTransportErrorCategory =>
  durableCategories.has(code as AgentEvaluationTransportErrorCategory)
    ? (code as AgentEvaluationTransportErrorCategory)
    : 'G4_RUNNER_TRANSPORT_FAILED';

export type AgentEvaluationEndpointSmokeSecretUseRequest = Readonly<{
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  secretEnvironmentName: string;
  secretRef: string;
  useId: string;
}>;

export interface AgentEvaluationEndpointSmokeSecretResolver {
  use<T>(
    request: AgentEvaluationEndpointSmokeSecretUseRequest,
    callback: (credential: Uint8Array) => Promise<T>
  ): Promise<T>;
}

export class EnvironmentAgentEvaluationEndpointSmokeSecretResolver implements AgentEvaluationEndpointSmokeSecretResolver {
  readonly #bindings: ReadonlyMap<
    string,
    Readonly<{ environmentName: string; secretRef: string }>
  >;
  readonly #readEnvironment: AgentEvaluationEnvironmentReader;

  constructor(
    input: Readonly<{
      config: AgentEvaluationProductionFrozenRunConfig;
      environment?: AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv;
    }>
  ) {
    const entries = [
      ...Object.values(input.config.providers).map(
        (provider) =>
          [
            provider.providerConfigurationId,
            Object.freeze({
              environmentName: provider.secretEnvironmentName,
              secretRef: provider.secretRef,
            }),
          ] as const
      ),
      ...Object.values(input.config.compatibilitySmokeRuntimes).map(
        (runtime) =>
          [
            runtime.providerConfigurationId,
            Object.freeze({
              environmentName: runtime.authentication.secretEnvironmentName,
              secretRef: runtime.authentication.secretRef,
            }),
          ] as const
      ),
    ];
    if (
      new Set(entries.map(([providerId]) => providerId)).size !== entries.length
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    this.#bindings = new Map(entries);
    const environment = input.environment ?? process.env;
    this.#readEnvironment =
      typeof environment === 'function'
        ? environment
        : (name) => environment[name];
  }

  async use<T>(
    request: AgentEvaluationEndpointSmokeSecretUseRequest,
    callback: (credential: Uint8Array) => Promise<T>
  ): Promise<T> {
    const binding = this.#bindings.get(request.providerConfigurationId);
    if (
      !binding ||
      binding.environmentName !== request.secretEnvironmentName ||
      binding.secretRef !== request.secretRef ||
      !isAgentControlIdentity(request.useId)
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
      );
    }
    let source = this.#readEnvironment(binding.environmentName);
    let material: Uint8Array | undefined;
    try {
      if (
        typeof source !== 'string' ||
        source.length < 8 ||
        source !== source.trim() ||
        containsAsciiControlCharacter(source)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      material = new TextEncoder().encode(source);
      if (material.byteLength > maximumCredentialBytes) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
        );
      }
      return await callback(material);
    } finally {
      source = undefined;
      material?.fill(0);
    }
  }
}

type EndpointBinding = Readonly<{
  endpoint: string;
  endpointId: string;
  secretEnvironmentName: string;
  secretRef: string;
  prompt: string;
  maximumOutputTokens: number;
}>;

const nativeProviderKey: Readonly<
  Record<AgentEvaluationNativeProtocol, AgentEvaluationRunConfigProviderKey>
> = Object.freeze({
  'openai-responses': 'openaiResponses',
  'anthropic-messages': 'anthropicMessages',
  'gemini-interactions': 'geminiInteractions',
});

const endpointBindingFor = (
  config: AgentEvaluationProductionFrozenRunConfig,
  authority: AgentEvaluationEndpointSmokeTargetAuthority
): EndpointBinding => {
  const { target } = authority;
  if (target.protocolFamily === 'openai-compatible') {
    const runtime =
      target.endpointClass === 'local'
        ? config.compatibilitySmokeRuntimes.local
        : config.compatibilitySmokeRuntimes.hosted;
    if (
      runtime.providerConfigurationId !== target.providerConfigurationId ||
      runtime.modelId !== target.modelId ||
      runtime.immutableModelVersion !== target.immutableModelVersion ||
      runtime.modelLineageDigest !== target.modelLineageDigest ||
      runtime.inferenceConfigurationDigest !==
        target.inferenceConfigurationDigest ||
      runtime.adapterDigest !== target.adapterDigest ||
      runtime.request.expectedText !== authority.expectedText ||
      runtime.pricing.authorityDigest !== target.pricingAuthorityDigest
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
      );
    }
    return Object.freeze({
      endpoint: runtime.endpoint,
      endpointId: runtime.endpointId,
      secretEnvironmentName: runtime.authentication.secretEnvironmentName,
      secretRef: runtime.authentication.secretRef,
      prompt: runtime.request.prompt,
      maximumOutputTokens: runtime.request.maximumOutputTokens,
    });
  }
  const protocol = target.protocolFamily as AgentEvaluationNativeProtocol;
  const provider = config.providers[nativeProviderKey[protocol]];
  const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocol];
  if (
    !provider ||
    provider.protocolFamily !== protocol ||
    provider.providerConfigurationId !== target.providerConfigurationId ||
    provider.modelId !== target.modelId ||
    definition.providerConfigurationId !== target.providerConfigurationId
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
    );
  }
  return Object.freeze({
    endpoint: definition.endpoint,
    endpointId: definition.endpointId,
    secretEnvironmentName: provider.secretEnvironmentName,
    secretRef: provider.secretRef,
    prompt,
    maximumOutputTokens: 16,
  });
};

const requestBodyFor = (
  target: AgentEvaluationEndpointSmokeTarget,
  binding: EndpointBinding
): string => {
  const body =
    target.protocolFamily === 'openai-responses'
      ? {
          model: target.modelId,
          input: [
            {
              role: 'user',
              content: [{ type: 'input_text', text: binding.prompt }],
            },
          ],
          max_output_tokens: binding.maximumOutputTokens,
          stream: true,
          store: false,
        }
      : target.protocolFamily === 'anthropic-messages'
        ? {
            model: target.modelId,
            messages: [{ role: 'user', content: binding.prompt }],
            max_tokens: binding.maximumOutputTokens,
            temperature: 0,
            stream: true,
          }
        : target.protocolFamily === 'gemini-interactions'
          ? {
              model: target.modelId,
              input: [
                {
                  type: 'user_input',
                  content: [{ type: 'text', text: binding.prompt }],
                },
              ],
              generation_config: {
                max_output_tokens: binding.maximumOutputTokens,
              },
              stream: true,
              store: false,
            }
          : {
              model: target.modelId,
              messages: [{ role: 'user', content: binding.prompt }],
              max_tokens: binding.maximumOutputTokens,
              temperature: 0,
              stream: true,
            };
  return canonicalJsonText(body);
};

type EgressAuthority = Readonly<{
  approvedAddresses: readonly string[];
}>;

const authorizeCompatibilityEgress = async (
  endpointText: string,
  endpointClass: AgentEvaluationEndpointSmokeTarget['endpointClass'],
  resolveHost: AgentEvaluationHostResolver
): Promise<EgressAuthority> => {
  let endpoint: URL;
  try {
    endpoint = new URL(endpointText);
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  const hostname = endpoint.hostname.replace(/^\[|\]$/gu, '');
  if (endpointClass === 'local') {
    if (
      endpoint.protocol !== 'http:' ||
      !['127.0.0.1', '::1'].includes(hostname) ||
      endpoint.port === '' ||
      endpoint.username !== '' ||
      endpoint.password !== '' ||
      endpoint.hash !== ''
    ) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
      );
    }
    return Object.freeze({ approvedAddresses: Object.freeze([hostname]) });
  }
  if (
    endpoint.protocol !== 'https:' ||
    endpoint.port !== '' ||
    endpoint.username !== '' ||
    endpoint.password !== '' ||
    endpoint.hash !== '' ||
    isIP(hostname) !== 0
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  let addresses: readonly string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  if (
    addresses.length === 0 ||
    new Set(addresses).size !== addresses.length ||
    addresses.some((address) => !isPublicAgentEvaluationAddress(address))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.egressDenied
    );
  }
  return Object.freeze({ approvedAddresses: Object.freeze([...addresses]) });
};

const authorizeEgress = async (
  target: AgentEvaluationEndpointSmokeTarget,
  binding: EndpointBinding,
  requestBytes: number,
  timeoutMs: number,
  resolveHost: AgentEvaluationHostResolver
): Promise<EgressAuthority> =>
  target.protocolFamily === 'openai-compatible'
    ? authorizeCompatibilityEgress(
        binding.endpoint,
        target.endpointClass,
        resolveHost
      )
    : authorizeAgentEvaluationEgress({
        protocolFamily: target.protocolFamily,
        endpoint: binding.endpoint,
        requestBytes,
        maximumResponseBytes,
        timeoutMs,
        resolveHost,
      });

const requestHeaders = (
  protocolFamily: AgentProviderProtocolFamily,
  credential: string
): Headers => {
  const headers = new Headers({
    Accept: 'text/event-stream, application/json',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
    'User-Agent': 'prodivix-g4-endpoint-smoke/1',
  });
  if (protocolFamily === 'anthropic-messages') {
    headers.set('anthropic-version', '2023-06-01');
    headers.set('x-api-key', credential);
  } else if (protocolFamily === 'gemini-interactions') {
    headers.set('x-goog-api-key', credential);
  } else {
    headers.set('Authorization', `Bearer ${credential}`);
  }
  return headers;
};

const clearCredentialHeaders = (headers: Headers): void => {
  headers.delete('Authorization');
  headers.delete('x-api-key');
  headers.delete('x-goog-api-key');
};

const readBoundedResponse = async (response: Response): Promise<Uint8Array> => {
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
      if (length > maximumResponseBytes) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
        );
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
};

const parseEvents = (
  text: string,
  contentType: string | null
): readonly unknown[] => {
  if (
    contentType?.split(';', 1)[0]?.trim().toLowerCase() === 'text/event-stream'
  ) {
    const events: unknown[] = [];
    let data: string[] = [];
    const flush = (): void => {
      if (data.length === 0) return;
      const source = data.join('\n');
      data = [];
      if (source === '[DONE]') return;
      if (events.length >= maximumEvents) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseTooLarge
        );
      }
      const parsed: unknown = JSON.parse(source);
      if (!isPlainObject(parsed)) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
        );
      }
      events.push(parsed);
    };
    for (const line of text
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
      if (field === 'data') data.push(value);
    }
    flush();
    if (events.length === 0) {
      throw new AgentEvaluationRunnerError(
        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
      );
    }
    return Object.freeze(events);
  }
  const mediaType = contentType?.split(';', 1)[0]?.trim().toLowerCase();
  if (
    mediaType !== 'application/json' &&
    !(mediaType?.startsWith('application/') && mediaType.endsWith('+json'))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  const parsed: unknown = JSON.parse(text);
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (
    events.length === 0 ||
    events.length > maximumEvents ||
    events.some((event) => !isPlainObject(event))
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  return Object.freeze(events);
};

const stringAt = (
  value: unknown,
  path: readonly string[]
): string | undefined => {
  let current = value;
  for (const field of path) {
    if (!isPlainObject(current)) return undefined;
    current = current[field];
  }
  return typeof current === 'string' && isAgentControlIdentity(current)
    ? current
    : undefined;
};

const exactMetadata = (
  values: readonly (string | undefined)[]
): string | undefined => {
  const present = [
    ...new Set(values.filter((value): value is string => value !== undefined)),
  ];
  if (present.length > 1) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  return present[0];
};

type ResponseModelMetadata = Readonly<{
  responseId?: string;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
}>;

const modelMetadata = (
  protocolFamily: AgentProviderProtocolFamily,
  events: readonly unknown[]
): ResponseModelMetadata => {
  const paths =
    protocolFamily === 'openai-responses'
      ? {
          id: [['response', 'id'], ['id']],
          model: [['response', 'model'], ['model']],
          version: [] as string[][],
        }
      : protocolFamily === 'anthropic-messages'
        ? {
            id: [['message', 'id'], ['id']],
            model: [['message', 'model'], ['model']],
            version: [] as string[][],
          }
        : protocolFamily === 'gemini-interactions'
          ? {
              id: [['interaction', 'id'], ['id']],
              model: [['interaction', 'model'], ['model']],
              version: [['interaction', 'model_version'], ['model_version']],
            }
          : {
              id: [['id']],
              model: [['model']],
              version: [] as string[][],
            };
  const select = (selectedPaths: readonly string[][]) =>
    exactMetadata(
      events.flatMap((event) =>
        selectedPaths.map((path) => stringAt(event, path))
      )
    );
  return Object.freeze({
    ...(select(paths.id) ? { responseId: select(paths.id) } : {}),
    ...(select(paths.model) ? { resolvedModelId: select(paths.model) } : {}),
    ...(select(paths.version)
      ? { resolvedModelVersion: select(paths.version) }
      : {}),
  });
};

const responseHeaderAuthority = (
  protocolFamily: AgentProviderProtocolFamily,
  headers: Headers,
  canaries: readonly string[]
): Readonly<{ digest: string; providerRequestId?: string }> => {
  const requestHeaderNames =
    protocolFamily === 'openai-responses'
      ? ['x-request-id']
      : protocolFamily === 'anthropic-messages'
        ? ['request-id', 'x-request-id']
        : protocolFamily === 'gemini-interactions'
          ? ['x-goog-request-id', 'x-request-id']
          : ['x-request-id', 'request-id'];
  const selected = requestHeaderNames
    .flatMap((name) => {
      const value = headers.get(name);
      if (value === null) return [];
      if (
        !isAgentControlIdentity(value) ||
        textContainsCredentialCanary(value, canaries)
      ) {
        throw new AgentEvaluationRunnerError(
          AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
        );
      }
      return [`${name}\0${value}`];
    })
    .sort(compareUnicodeCodePoints);
  return Object.freeze({
    digest: sha256(selected.join('\n')),
    ...(exactMetadata(
      requestHeaderNames.map((name) => headers.get(name) ?? undefined)
    )
      ? {
          providerRequestId: exactMetadata(
            requestHeaderNames.map((name) => headers.get(name) ?? undefined)
          ),
        }
      : {}),
  });
};

const normalizedResult = (
  protocolFamily: AgentProviderProtocolFamily,
  events: readonly unknown[],
  input: Readonly<{
    target: AgentEvaluationEndpointSmokeTarget;
    intent: AgentEvaluationEndpointSmokeDispatchIntent;
    transportReceipt: AgentEvaluationTransportReceipt;
    responseBodyDigest: string;
    observedAt: string;
  }>
) => {
  const facts = normalizeNativeAgentProviderRuntimeEvents(
    protocolFamily,
    events,
    { invocationId: input.intent.invocationId, occurredAt: input.observedAt },
    {
      maximumEvents,
      maximumAggregateEventBytes: maximumResponseBytes,
      maximumOutputBytes: 256,
      maximumToolCalls: 1,
      maximumToolArgumentBytes: 1_024,
      maximumAggregateToolArgumentBytes: 1_024,
    }
  );
  const eventFacts = facts.filter((fact) => fact.factType === 'provider-event');
  const usageFact = facts.find((fact) => fact.factType === 'usage-vector');
  const terminalTypes = eventFacts.filter(({ value }) =>
    [
      'completed',
      'failed',
      'refusal',
      'safety-block',
      'truncation',
      'cancelled',
      'partial',
    ].includes(value.durableEvent.type)
  );
  if (
    !usageFact ||
    terminalTypes.length !== 1 ||
    terminalTypes[0]!.value.durableEvent.type !== 'completed'
  ) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  const outputText = eventFacts
    .filter(({ value }) => value.durableEvent.type === 'output-delta')
    .map(({ value }) =>
      isPlainObject(value.payload) && typeof value.payload.delta === 'string'
        ? value.payload.delta
        : ''
    )
    .join('');
  const usage: AgentUsageVector = usageFact.value;
  const metadata = modelMetadata(protocolFamily, events);
  if (!metadata.resolvedModelId || outputText.length > 256) {
    throw new AgentEvaluationRunnerError(
      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
    );
  }
  const normalizedEventSetDigest = digestAgentCanonicalValue(
    facts.map((fact) => {
      switch (fact.factType) {
        case 'provider-event':
          return fact.value.durableEvent.eventDigest;
        case 'usage-vector':
          return fact.value.vectorDigest;
        case 'provider-job-receipt':
        case 'provider-cache-receipt':
          return fact.value.receiptDigest;
        case 'opaque-continuation':
          return fact.value.continuationDigest;
      }
    })
  );
  return Object.freeze({
    metadata,
    outputText,
    usage,
    normalizedEventSetDigest,
    responseDigest: digestAgentCanonicalValue({
      responseBodyDigest: input.responseBodyDigest,
      normalizedEventSetDigest,
      outputText,
      usageDigest: usage.vectorDigest,
      resolvedModelId: metadata.resolvedModelId,
      ...(metadata.resolvedModelVersion
        ? { resolvedModelVersion: metadata.resolvedModelVersion }
        : {}),
    }),
  });
};

const createReceipt = (
  intent: AgentEvaluationEndpointSmokeDispatchIntent,
  input: Omit<
    AgentEvaluationTransportReceipt,
    | 'format'
    | 'version'
    | 'receiptDigest'
    | 'receiptId'
    | 'protocolFamily'
    | 'providerConfigurationId'
    | 'invocationId'
    | 'dispatchIntentDigest'
    | 'requestDigest'
    | 'endpointId'
    | 'endpointClass'
    | 'requestBodyDigest'
    | 'requestBytes'
  >
): AgentEvaluationTransportReceipt =>
  createAgentEvaluationTransportReceipt({
    receiptId: `endpoint-smoke-transport.${sha256(
      `${intent.intentDigest}\0${input.outcome}\0${input.completedAt}`
    ).slice('sha256-'.length)}`,
    protocolFamily: intent.protocolFamily,
    providerConfigurationId: intent.providerConfigurationId,
    invocationId: intent.invocationId,
    dispatchIntentDigest: intent.intentDigest,
    requestDigest: intent.requestDigest,
    endpointId: intent.endpointId,
    endpointClass: intent.endpointClass,
    requestBodyDigest: intent.requestBodyDigest,
    requestBytes: intent.requestBytes,
    ...input,
  });

export type CreateAgentEvaluationEndpointSmokeTransportFactoryInput = Readonly<{
  secrets: AgentEvaluationEndpointSmokeSecretResolver;
  fetch?: AgentEvaluationEndpointSmokeBoundFetch;
  resolveHost?: AgentEvaluationHostResolver;
  now: () => string;
}>;

export const createAgentEvaluationProductionEndpointSmokeTransportFactory = (
  input: CreateAgentEvaluationEndpointSmokeTransportFactoryInput
): AgentEvaluationEndpointSmokeTransportFactory => {
  const fetch = input.fetch ?? agentEvaluationEndpointSmokeBoundFetch;
  const resolveHost = input.resolveHost ?? resolveAgentEvaluationHost;
  return Object.freeze({
    prepare(
      preparedInput: Readonly<{
        config: AgentEvaluationProductionFrozenRunConfig;
        authority: AgentEvaluationEndpointSmokeTargetAuthority;
      }>
    ): AgentEvaluationEndpointSmokePreparedTransport {
      const { config, authority } = preparedInput;
      const binding = endpointBindingFor(config, authority);
      const requestBody = requestBodyFor(authority.target, binding);
      const requestBytes = new TextEncoder().encode(requestBody).byteLength;
      const requestBodyDigest = sha256(requestBody);
      const requestDigest = digestAgentCanonicalValue({
        smokeTargetDigest: authority.target.targetDigest,
        endpointId: binding.endpointId,
        requestBodyDigest,
      });
      return Object.freeze({
        endpointId: binding.endpointId,
        requestDigest,
        requestBodyDigest,
        requestBytes,
        async execute(
          executeInput: Readonly<{
            intent: AgentEvaluationEndpointSmokeDispatchIntent;
            signal?: AbortSignal;
          }>
        ): Promise<AgentEvaluationEndpointSmokeTransportObservation> {
          const { intent, signal } = executeInput;
          validateAgentEvaluationEndpointSmokeTargetBinding(
            authority.target,
            intent
          );
          if (
            intent.endpointId !== binding.endpointId ||
            intent.requestDigest !== requestDigest ||
            intent.requestBodyDigest !== requestBodyDigest ||
            intent.requestBytes !== requestBytes
          ) {
            throw new AgentEvaluationRunnerError(
              AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
            );
          }
          const startedAt = input.now();
          let dispatched = false;
          try {
            return await input.secrets.use(
              {
                protocolFamily: authority.target.protocolFamily,
                providerConfigurationId:
                  authority.target.providerConfigurationId,
                secretEnvironmentName: binding.secretEnvironmentName,
                secretRef: binding.secretRef,
                useId: `endpoint-smoke.${intent.invocationId}`,
              },
              async (credentialBytes) => {
                const canaries =
                  createCredentialCanarySignatures(credentialBytes);
                const credential = new TextDecoder('utf-8', {
                  fatal: true,
                }).decode(credentialBytes);
                const egress = await authorizeEgress(
                  authority.target,
                  binding,
                  requestBytes,
                  authority.maximumElapsedMs,
                  resolveHost
                );
                const headers = requestHeaders(
                  authority.target.protocolFamily,
                  credential
                );
                let responseBytes: Uint8Array | undefined;
                try {
                  dispatched = true;
                  const response = await fetch(
                    binding.endpoint,
                    {
                      method: 'POST',
                      headers,
                      body: requestBody,
                      redirect: 'manual',
                      signal,
                    },
                    {
                      endpointClass: authority.target.endpointClass,
                      approvedAddresses: egress.approvedAddresses,
                    }
                  );
                  responseBytes = await readBoundedResponse(response);
                  const completedAt = input.now();
                  const responseBodyDigest = sha256(responseBytes);
                  const responseText = new TextDecoder('utf-8', {
                    fatal: true,
                  }).decode(responseBytes);
                  if (textContainsCredentialCanary(responseText, canaries)) {
                    throw new AgentEvaluationRunnerError(
                      AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
                    );
                  }
                  const headerAuthority = responseHeaderAuthority(
                    authority.target.protocolFamily,
                    response.headers,
                    canaries
                  );
                  const responseAuthority = {
                    httpStatus: response.status,
                    responseHeaderDigest: headerAuthority.digest,
                    responseBodyDigest,
                    ...(headerAuthority.providerRequestId
                      ? {
                          providerRequestId: headerAuthority.providerRequestId,
                        }
                      : {}),
                  };
                  if (response.status < 200 || response.status > 299) {
                    const code =
                      response.status === 401 || response.status === 403
                        ? AGENT_EVALUATION_RUNNER_ERROR_CODES.providerAuthenticationRejected
                        : response.status === 429
                          ? AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRateLimited
                          : AGENT_EVALUATION_RUNNER_ERROR_CODES.providerRejected;
                    return Object.freeze({
                      kind: 'failed' as const,
                      receipt: createReceipt(intent, {
                        responseBytes: responseBytes.byteLength,
                        ...responseAuthority,
                        sseEventCount: 0,
                        dispatchState: 'dispatched',
                        outcome: 'failed',
                        errorCategory: durableCategory(code),
                        startedAt,
                        completedAt,
                      }),
                    });
                  }
                  let events: readonly unknown[];
                  try {
                    events = parseEvents(
                      responseText,
                      response.headers.get('content-type')
                    );
                    if (
                      valueContainsCredentialCanary(
                        events,
                        credentialBytes,
                        canaries
                      )
                    ) {
                      throw new AgentEvaluationRunnerError(
                        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseSecretLeak
                      );
                    }
                    const metadata = modelMetadata(
                      authority.target.protocolFamily,
                      events
                    );
                    const provisionalReceipt = createReceipt(intent, {
                      responseBytes: responseBytes.byteLength,
                      ...responseAuthority,
                      ...(metadata.responseId
                        ? {
                            providerIdentityKind:
                              authority.target.protocolFamily ===
                              'gemini-interactions'
                                ? ('interaction-id' as const)
                                : authority.target.protocolFamily ===
                                    'anthropic-messages'
                                  ? ('message-id' as const)
                                  : ('response-id' as const),
                            providerResponseId: metadata.responseId,
                          }
                        : {}),
                      ...(metadata.resolvedModelId
                        ? { resolvedModelId: metadata.resolvedModelId }
                        : {}),
                      ...(metadata.resolvedModelVersion
                        ? {
                            resolvedModelVersion: metadata.resolvedModelVersion,
                          }
                        : {}),
                      sseEventCount: events.length,
                      dispatchState: 'dispatched',
                      outcome: 'completed',
                      startedAt,
                      completedAt,
                    });
                    if (!headerAuthority.providerRequestId) {
                      throw new AgentEvaluationRunnerError(
                        AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
                      );
                    }
                    const normalized = normalizedResult(
                      authority.target.protocolFamily,
                      events,
                      {
                        target: authority.target,
                        intent,
                        transportReceipt: provisionalReceipt,
                        responseBodyDigest,
                        observedAt: completedAt,
                      }
                    );
                    return Object.freeze({
                      kind: 'normalized' as const,
                      receipt: provisionalReceipt,
                      result:
                        createAgentEvaluationEndpointSmokeNormalizedResult({
                          smokeTargetId: authority.target.smokeTargetId,
                          invocationId: intent.invocationId,
                          transportReceiptDigest:
                            provisionalReceipt.receiptDigest,
                          responseDigest: normalized.responseDigest,
                          normalizedEventSetDigest:
                            normalized.normalizedEventSetDigest,
                          outputText: normalized.outputText,
                          resolvedModelId: normalized.metadata.resolvedModelId!,
                          ...(normalized.metadata.resolvedModelVersion
                            ? {
                                resolvedModelVersion:
                                  normalized.metadata.resolvedModelVersion,
                              }
                            : {}),
                          reportedUsage: normalized.usage,
                          observedAt: completedAt,
                        }),
                    });
                  } catch (caught) {
                    const failure = safeRunnerError(caught);
                    return Object.freeze({
                      kind: 'provider-response-invalid' as const,
                      receipt: createReceipt(intent, {
                        responseBytes: responseBytes.byteLength,
                        ...responseAuthority,
                        sseEventCount: 0,
                        dispatchState: 'dispatched',
                        outcome: 'failed',
                        errorCategory: durableCategory(failure.code),
                        startedAt,
                        completedAt,
                      }),
                    });
                  }
                } finally {
                  responseBytes?.fill(0);
                  clearCredentialHeaders(headers);
                }
              }
            );
          } catch (caught) {
            const failure = safeRunnerError(caught);
            const completedAt = input.now();
            return Object.freeze({
              kind: 'failed' as const,
              receipt: createReceipt(intent, {
                responseBytes: 0,
                sseEventCount: 0,
                dispatchState: dispatched ? 'dispatched' : 'not-dispatched',
                outcome: dispatched ? 'post-dispatch-unknown' : 'failed',
                errorCategory: durableCategory(failure.code),
                startedAt,
                completedAt,
              }),
            });
          }
        },
      });
    },
  });
};

export type CreateEnvironmentAgentEvaluationEndpointSmokeTransportFactoryInput =
  Omit<CreateAgentEvaluationEndpointSmokeTransportFactoryInput, 'secrets'> &
    Readonly<{
      environment?: AgentEvaluationEnvironmentReader | NodeJS.ProcessEnv;
    }>;

/** Binds each prepared request to the exact decoded config before resolving its credential. */
export const createEnvironmentAgentEvaluationEndpointSmokeTransportFactory = (
  input: CreateEnvironmentAgentEvaluationEndpointSmokeTransportFactoryInput
): AgentEvaluationEndpointSmokeTransportFactory =>
  Object.freeze({
    async prepare(
      preparedInput: Readonly<{
        config: AgentEvaluationProductionFrozenRunConfig;
        authority: AgentEvaluationEndpointSmokeTargetAuthority;
      }>
    ): Promise<AgentEvaluationEndpointSmokePreparedTransport> {
      const secrets = new EnvironmentAgentEvaluationEndpointSmokeSecretResolver(
        {
          config: preparedInput.config,
          ...(input.environment ? { environment: input.environment } : {}),
        }
      );
      return await createAgentEvaluationProductionEndpointSmokeTransportFactory(
        {
          secrets,
          ...(input.fetch ? { fetch: input.fetch } : {}),
          ...(input.resolveHost ? { resolveHost: input.resolveHost } : {}),
          now: input.now,
        }
      ).prepare(preparedInput);
    },
  });
