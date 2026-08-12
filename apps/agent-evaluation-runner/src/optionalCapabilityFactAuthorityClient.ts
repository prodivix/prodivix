import {
  createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  isAgentEvaluationProviderCapabilityFactAuthority,
  isAgentEvaluationProviderCapabilityObservedFact,
  isAgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentEvaluationProviderCapabilityFactAuthority,
  type AgentEvaluationProviderCapabilityObservationSanitization,
  type AgentEvaluationProviderCapabilityObservedFact,
  type AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  type AgentCapabilityProbeProgram,
  type AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
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
} from './ledgerClient';
import {
  createCredentialCanarySignatures,
  textContainsCredentialCanary,
  valueContainsCredentialCanary,
  type AgentEvaluationEnvironmentReader,
} from './secretResolver';
import { isAgentEvaluationServiceToken } from './serviceToken';

export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-request' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_RECEIPT_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-source-seal-receipt' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_REQUEST_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-stage-request' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-stage-response' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-stage' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_DISPATCH_ACK_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-dispatch-ack' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_COMMAND_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-command' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-optional-capability-fact-authority-response' as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION = 1 as const;
export const AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_OPERATION_TIMEOUT_MS =
  30_000 as const;
export const AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_READ_FORMAT =
  'prodivix.agent-evaluation-native-optional-capability-bootstrap-source-read' as const;

const maximumWireBytes = 17_039_360;
const maximumResponseBytes = 65_536;
const maximumNativeBootstrapSourceReadBytes = 36_864;
const maximumTurns = 7;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type NativeProtocol =
  'openai-responses' | 'anthropic-messages' | 'gemini-interactions';

export type AgentEvaluationOptionalCapabilityFactEffectSource = Readonly<{
  kind: 'sealed-provider-response-metadata' | 'sealed-hosted-owner-result';
  ownerRequestDigest: CanonicalDigest;
  ownerReceiptDigest: CanonicalDigest;
  effectSourceReceiptDigest: CanonicalDigest;
  nativeBootstrapSourceRequestDigest?: never;
}>;

export type AgentEvaluationOptionalCapabilityFactNativeBootstrapSource =
  Readonly<{
    kind: 'sealed-provider-response-metadata';
    nativeBootstrapSourceRequestDigest: CanonicalDigest;
    ownerRequestDigest?: never;
    ownerReceiptDigest?: never;
    effectSourceReceiptDigest?: never;
  }>;

export type AgentEvaluationOptionalCapabilityFactSource =
  | AgentEvaluationOptionalCapabilityFactEffectSource
  | AgentEvaluationOptionalCapabilityFactNativeBootstrapSource;

export type AgentEvaluationOptionalCapabilityFactSourceRequest = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  targetId: string;
  targetDigest: CanonicalDigest;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  capabilityId:
    | 'provider.background-job'
    | 'provider.hosted-retrieval'
    | 'provider.isolated-cache'
    | 'provider.reasoning-continuation';
  supportExpectation: 'required' | 'expected-blocked';
  turnIndex: number;
  invocationId: string;
  protocolFamily: NativeProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  providerRequestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest | null;
  normalizedEventSetDigest: CanonicalDigest;
  source: AgentEvaluationOptionalCapabilityFactSource;
}>;

export type CreateAgentEvaluationOptionalCapabilityFactSourceRequestInput =
  Omit<
    AgentEvaluationOptionalCapabilityFactSourceRequest,
    'format' | 'version'
  >;

type AgentEvaluationOptionalCapabilityFactSourceSealReceiptCommon = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_RECEIPT_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  namespaceId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  targetId: string;
  targetDigest: CanonicalDigest;
  capabilityProfileId: string;
  capabilityProfileDigest: CanonicalDigest;
  capabilityDescriptorDigest: CanonicalDigest;
  capabilityId: AgentEvaluationOptionalCapabilityFactSourceRequest['capabilityId'];
  supportExpectation: AgentEvaluationOptionalCapabilityFactSourceRequest['supportExpectation'];
  turnIndex: number;
  invocationId: string;
  protocolFamily: NativeProtocol;
  providerConfigurationId: string;
  modelId: string;
  modelLineageDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  providerRequestDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  resultSpoolReceiptDigest: CanonicalDigest | null;
  normalizedEventSetDigest: CanonicalDigest;
  targetAuthorityDigest: CanonicalDigest;
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  sourceAuthorityRouteBinding: string;
  registrationAuthorityIssuerId: string;
  registrationReceiptDigest: CanonicalDigest;
  sourceKind: AgentEvaluationOptionalCapabilityFactSource['kind'];
  sourceDigest: CanonicalDigest;
  sourceRequestDigest: CanonicalDigest;
  outcome: 'observed' | 'unavailable' | 'failed';
  observedAt: string;
  sealedAt: string;
  ownerStageDigest: CanonicalDigest;
  ownerDispatchAckDigest: CanonicalDigest;
  fact?: AgentEvaluationProviderCapabilityObservedFact;
  sourceSealDigest: CanonicalDigest;
}>;

export type AgentEvaluationOptionalCapabilityFactEffectSourceSealReceipt =
  AgentEvaluationOptionalCapabilityFactSourceSealReceiptCommon &
    Readonly<{
      ownerRequestDigest: CanonicalDigest;
      ownerReceiptDigest: CanonicalDigest;
      preEffectIntentDigest: CanonicalDigest;
      providerRuntimeJournalResultRecordDigest: CanonicalDigest;
      providerRuntimeResultSealReceiptDigest: CanonicalDigest;
      effectSourceReceiptDigest: CanonicalDigest;
      effectSourceFactDigest: CanonicalDigest | null;
      businessResultDigest: CanonicalDigest;
      nativeBootstrapSourceRequestDigest?: never;
      nativeBootstrapSourceReceiptDigest?: never;
      nativeProviderSourceReceiptDigest?: never;
      nativeProviderSourceDigest?: never;
      nativeProviderSourceFactDigest?: never;
    }>;

export type AgentEvaluationOptionalCapabilityFactNativeBootstrapSourceSealReceipt =
  AgentEvaluationOptionalCapabilityFactSourceSealReceiptCommon &
    Readonly<{
      nativeBootstrapSourceRequestDigest: CanonicalDigest;
      nativeBootstrapSourceReceiptDigest: CanonicalDigest;
      nativeProviderSourceReceiptDigest: CanonicalDigest | null;
      nativeProviderSourceDigest: CanonicalDigest | null;
      nativeProviderSourceFactDigest: CanonicalDigest | null;
      ownerRequestDigest?: never;
      ownerReceiptDigest?: never;
      preEffectIntentDigest?: never;
      providerRuntimeJournalResultRecordDigest?: never;
      providerRuntimeResultSealReceiptDigest?: never;
      effectSourceReceiptDigest?: never;
      effectSourceFactDigest?: never;
      businessResultDigest?: never;
    }>;

export type AgentEvaluationOptionalCapabilityFactSourceSealReceipt =
  | AgentEvaluationOptionalCapabilityFactEffectSourceSealReceipt
  | AgentEvaluationOptionalCapabilityFactNativeBootstrapSourceSealReceipt;

export type AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead =
  Readonly<{
    format: typeof AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_READ_FORMAT;
    version: 1;
    attemptId: string;
    turnIndex: 0;
    sourceRequestDigest: CanonicalDigest;
    sourceReceiptDigest: CanonicalDigest;
    sourceReceipt: AgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt;
    readDigest: CanonicalDigest;
  }>;

export type AgentEvaluationOptionalCapabilityFactStageRequest = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  sourceSealDigest: CanonicalDigest;
}>;

export type AgentEvaluationOptionalCapabilityFactStageResponse = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  authorityRequestDigest: CanonicalDigest;
  sourceSealDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  replayed: boolean;
}>;

export type AgentEvaluationOptionalCapabilityFactCommand = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_COMMAND_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  attemptId: string;
  turnIndex: number;
  authorityRequestDigest: CanonicalDigest;
  sourceSealDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
}>;

export type AgentEvaluationOptionalCapabilityFactAuthorityResponse = Readonly<{
  format: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT;
  version: typeof AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION;
  outcome: 'observed' | 'unavailable' | 'failed';
  authorityRequestDigest: CanonicalDigest;
  sourceAuthorityId: string;
  sourceAuthorityImplementationDigest: CanonicalDigest;
  stageDigest: CanonicalDigest;
  dispatchAckDigest: CanonicalDigest;
  runtimeFactEnvelopes: readonly AgentEvaluationProviderCapabilityRuntimeFactEnvelope[];
  factAuthorities: readonly AgentEvaluationProviderCapabilityFactAuthority[];
  resultDigest: CanonicalDigest;
}>;

export type AgentEvaluationOptionalCapabilityFactAuthorityResult = Readonly<{
  sourceSealReceipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt;
  stage: AgentEvaluationOptionalCapabilityFactStageResponse;
  authorityResponse: AgentEvaluationOptionalCapabilityFactAuthorityResponse;
}>;

export type CreateEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClientInput =
  Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    environment?: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;
    fetch?: typeof fetch;
    timeoutMs?: number;
    forbiddenCanaries: () => readonly string[];
    sanitization: () => AgentEvaluationProviderCapabilityObservationSanitization;
  }>;

export interface AgentEvaluationOptionalCapabilityFactAuthorityClient {
  readNativeBootstrapSource(
    input: Readonly<{
      attemptId: string;
      program: AgentCapabilityProbeProgram;
    }>
  ): Promise<
    AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead | undefined
  >;
  sealSource(
    request: AgentEvaluationOptionalCapabilityFactSourceRequest
  ): Promise<AgentEvaluationOptionalCapabilityFactSourceSealReceipt>;
  stage(
    request: AgentEvaluationOptionalCapabilityFactSourceRequest,
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt
  ): Promise<AgentEvaluationOptionalCapabilityFactStageResponse>;
  seal(
    request: AgentEvaluationOptionalCapabilityFactSourceRequest,
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
    stage: AgentEvaluationOptionalCapabilityFactStageResponse
  ): Promise<AgentEvaluationOptionalCapabilityFactAuthorityResponse>;
  reconcile(
    request: AgentEvaluationOptionalCapabilityFactSourceRequest,
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
    stage: AgentEvaluationOptionalCapabilityFactStageResponse
  ): Promise<AgentEvaluationOptionalCapabilityFactAuthorityResponse>;
  observe(
    request: AgentEvaluationOptionalCapabilityFactSourceRequest
  ): Promise<AgentEvaluationOptionalCapabilityFactAuthorityResult>;
}

const unavailable = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.productionShardRuntimeUnavailable
  );
};

const responseInvalid = (): never => {
  throw new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.responseInvalid
  );
};

const exactRecord = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) =>
      !isUnsafeObjectKey(key) &&
      (required.includes(key) || optional.includes(key))
  );

const canonicalTurn = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value < maximumTurns;

const capabilityFactKind = (
  capabilityId: AgentEvaluationOptionalCapabilityFactSourceRequest['capabilityId']
): AgentEvaluationProviderCapabilityObservedFact['factKind'] => {
  switch (capabilityId) {
    case 'provider.background-job':
      return 'provider-job-receipt';
    case 'provider.hosted-retrieval':
      return 'retrieval-query-receipt';
    case 'provider.isolated-cache':
      return 'provider-cache-receipt';
    case 'provider.reasoning-continuation':
      return 'opaque-continuation';
  }
};

const readEnvironment = (
  environment: NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader
): AgentEvaluationEnvironmentReader =>
  typeof environment === 'function' ? environment : (name) => environment[name];

const sourceProjection = (
  request: AgentEvaluationOptionalCapabilityFactSourceRequest
): Readonly<Record<string, unknown>> => Object.freeze({ ...request });

export const digestAgentEvaluationOptionalCapabilityFactSourceRequest = (
  request: AgentEvaluationOptionalCapabilityFactSourceRequest
): CanonicalDigest => digestAgentCanonicalValue(sourceProjection(request));

export const createAgentEvaluationOptionalCapabilityFactSourceRequest = (
  input: CreateAgentEvaluationOptionalCapabilityFactSourceRequestInput
): AgentEvaluationOptionalCapabilityFactSourceRequest => {
  const request = Object.freeze({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    ...input,
    source: Object.freeze({ ...input.source }),
  }) as AgentEvaluationOptionalCapabilityFactSourceRequest;
  return decodeAgentEvaluationOptionalCapabilityFactSourceRequest(request);
};

export const decodeAgentEvaluationOptionalCapabilityFactSourceRequest = (
  value: unknown
): AgentEvaluationOptionalCapabilityFactSourceRequest => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'attemptId',
      'descriptorDigest',
      'targetId',
      'targetDigest',
      'capabilityProfileId',
      'capabilityProfileDigest',
      'capabilityDescriptorDigest',
      'capabilityId',
      'supportExpectation',
      'turnIndex',
      'invocationId',
      'protocolFamily',
      'providerConfigurationId',
      'modelId',
      'modelLineageDigest',
      'adapterDigest',
      'providerRequestDigest',
      'responseDigest',
      'dispatchIntentDigest',
      'transportReceiptDigest',
      'resultSpoolReceiptDigest',
      'normalizedEventSetDigest',
      'source',
    ]) ||
    value.format !==
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_REQUEST_FORMAT ||
    value.version !== AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION ||
    ![
      value.attemptId,
      value.targetId,
      value.capabilityProfileId,
      value.capabilityId,
      value.invocationId,
      value.providerConfigurationId,
      value.modelId,
    ].every(isAgentControlIdentity) ||
    ![
      value.descriptorDigest,
      value.targetDigest,
      value.capabilityProfileDigest,
      value.capabilityDescriptorDigest,
      value.modelLineageDigest,
      value.adapterDigest,
      value.providerRequestDigest,
      value.responseDigest,
      value.dispatchIntentDigest,
      value.transportReceiptDigest,
      value.normalizedEventSetDigest,
    ].every(isAgentCanonicalDigest) ||
    (value.resultSpoolReceiptDigest !== null &&
      !isAgentCanonicalDigest(value.resultSpoolReceiptDigest)) ||
    ![
      'provider.background-job',
      'provider.hosted-retrieval',
      'provider.isolated-cache',
      'provider.reasoning-continuation',
    ].includes(String(value.capabilityId)) ||
    !['required', 'expected-blocked'].includes(
      String(value.supportExpectation)
    ) ||
    !canonicalTurn(value.turnIndex) ||
    !['openai-responses', 'anthropic-messages', 'gemini-interactions'].includes(
      String(value.protocolFamily)
    ) ||
    !isPlainObject(value.source)
  ) {
    return responseInvalid();
  }
  const request =
    value as unknown as AgentEvaluationOptionalCapabilityFactSourceRequest;
  const source = value.source;
  const nativeBootstrapSource =
    exactRecord(source, ['kind', 'nativeBootstrapSourceRequestDigest']) &&
    source.kind === 'sealed-provider-response-metadata' &&
    isAgentCanonicalDigest(source.nativeBootstrapSourceRequestDigest);
  const effectSource =
    exactRecord(source, [
      'kind',
      'ownerRequestDigest',
      'ownerReceiptDigest',
      'effectSourceReceiptDigest',
    ]) &&
    [
      'sealed-provider-response-metadata',
      'sealed-hosted-owner-result',
    ].includes(String(source.kind)) &&
    isAgentCanonicalDigest(source.ownerRequestDigest) &&
    isAgentCanonicalDigest(source.ownerReceiptDigest) &&
    isAgentCanonicalDigest(source.effectSourceReceiptDigest);
  if (
    (!nativeBootstrapSource && !effectSource) ||
    (nativeBootstrapSource &&
      (request.turnIndex !== 0 || request.resultSpoolReceiptDigest === null))
  ) {
    return responseInvalid();
  }
  if (
    textEncoder.encode(canonicalJsonText(request)).byteLength >
      maximumWireBytes ||
    !isAgentCanonicalDigest(
      digestAgentEvaluationOptionalCapabilityFactSourceRequest(request)
    )
  ) {
    return responseInvalid();
  }
  return Object.freeze({ ...request, source: Object.freeze(request.source) });
};

const sourceReceiptCommonRequiredKeys = Object.freeze([
  'format',
  'version',
  'namespaceId',
  'planDigest',
  'repositoryCommit',
  'attemptId',
  'descriptorDigest',
  'targetId',
  'targetDigest',
  'capabilityProfileId',
  'capabilityProfileDigest',
  'capabilityDescriptorDigest',
  'capabilityId',
  'supportExpectation',
  'turnIndex',
  'invocationId',
  'protocolFamily',
  'providerConfigurationId',
  'modelId',
  'modelLineageDigest',
  'adapterDigest',
  'providerRequestDigest',
  'responseDigest',
  'dispatchIntentDigest',
  'transportReceiptDigest',
  'resultSpoolReceiptDigest',
  'normalizedEventSetDigest',
  'targetAuthorityDigest',
  'sourceAuthorityId',
  'sourceAuthorityImplementationDigest',
  'sourceAuthorityRouteBinding',
  'registrationAuthorityIssuerId',
  'registrationReceiptDigest',
  'sourceKind',
  'sourceDigest',
  'sourceRequestDigest',
  'outcome',
  'observedAt',
  'sealedAt',
  'ownerStageDigest',
  'ownerDispatchAckDigest',
  'sourceSealDigest',
] as const);

const effectSourceReceiptRequiredKeys = Object.freeze([
  ...sourceReceiptCommonRequiredKeys,
  'ownerRequestDigest',
  'ownerReceiptDigest',
  'preEffectIntentDigest',
  'providerRuntimeJournalResultRecordDigest',
  'providerRuntimeResultSealReceiptDigest',
  'effectSourceReceiptDigest',
  'effectSourceFactDigest',
  'businessResultDigest',
] as const);

const nativeBootstrapSourceReceiptRequiredKeys = Object.freeze([
  ...sourceReceiptCommonRequiredKeys,
  'nativeBootstrapSourceRequestDigest',
  'nativeBootstrapSourceReceiptDigest',
  'nativeProviderSourceReceiptDigest',
  'nativeProviderSourceDigest',
  'nativeProviderSourceFactDigest',
] as const);

const sourceReceiptOptionalKeys = Object.freeze(['fact'] as const);

const digestWithoutKey = (
  value: Readonly<Record<string, unknown>>,
  key: string
): CanonicalDigest => {
  const base: Record<string, unknown> = { ...value };
  delete base[key];
  return digestAgentCanonicalValue(base);
};

export const decodeAgentEvaluationNativeOptionalCapabilityBootstrapSourceRead =
  (
    value: unknown,
    input: Readonly<{
      program: AgentCapabilityProbeProgram;
      attemptId: string;
      sanitization?: AgentEvaluationProviderCapabilityObservationSanitization;
    }>
  ): AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead => {
    if (
      !exactRecord(value, [
        'format',
        'version',
        'attemptId',
        'turnIndex',
        'sourceRequestDigest',
        'sourceReceiptDigest',
        'sourceReceipt',
        'readDigest',
      ]) ||
      value.format !==
        AGENT_EVALUATION_NATIVE_OPTIONAL_CAPABILITY_BOOTSTRAP_SOURCE_READ_FORMAT ||
      value.version !== 1 ||
      value.attemptId !== input.attemptId ||
      !isAgentControlIdentity(value.attemptId) ||
      value.turnIndex !== 0 ||
      !isAgentCanonicalDigest(value.sourceRequestDigest) ||
      !isAgentCanonicalDigest(value.sourceReceiptDigest) ||
      !isAgentCanonicalDigest(value.readDigest) ||
      !isAgentEvaluationNativeOptionalCapabilityBootstrapSourceReceipt(
        value.sourceReceipt,
        input.program,
        input.sanitization
      ) ||
      value.sourceReceipt.sourceRequest.attemptId !== value.attemptId ||
      value.sourceReceipt.sourceRequest.turnIndex !== value.turnIndex ||
      value.sourceReceipt.sourceRequest.requestDigest !==
        value.sourceRequestDigest ||
      value.sourceReceipt.receiptDigest !== value.sourceReceiptDigest ||
      digestWithoutKey(value, 'readDigest') !== value.readDigest ||
      textEncoder.encode(canonicalJsonText(value)).byteLength >
        maximumNativeBootstrapSourceReadBytes
    ) {
      return responseInvalid();
    }
    return Object.freeze({
      ...(value as unknown as AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead),
      sourceReceipt: Object.freeze({
        ...value.sourceReceipt,
        sourceRequest: Object.freeze({ ...value.sourceReceipt.sourceRequest }),
      }),
    });
  };

const sameRequestBinding = (
  receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
  request: AgentEvaluationOptionalCapabilityFactSourceRequest
): boolean => {
  if (
    receipt.attemptId !== request.attemptId ||
    receipt.descriptorDigest !== request.descriptorDigest ||
    receipt.targetId !== request.targetId ||
    receipt.targetDigest !== request.targetDigest ||
    receipt.capabilityProfileId !== request.capabilityProfileId ||
    receipt.capabilityProfileDigest !== request.capabilityProfileDigest ||
    receipt.capabilityDescriptorDigest !== request.capabilityDescriptorDigest ||
    receipt.capabilityId !== request.capabilityId ||
    receipt.supportExpectation !== request.supportExpectation ||
    receipt.turnIndex !== request.turnIndex ||
    receipt.invocationId !== request.invocationId ||
    receipt.protocolFamily !== request.protocolFamily ||
    receipt.providerConfigurationId !== request.providerConfigurationId ||
    receipt.modelId !== request.modelId ||
    receipt.modelLineageDigest !== request.modelLineageDigest ||
    receipt.adapterDigest !== request.adapterDigest ||
    receipt.providerRequestDigest !== request.providerRequestDigest ||
    receipt.responseDigest !== request.responseDigest ||
    receipt.dispatchIntentDigest !== request.dispatchIntentDigest ||
    receipt.transportReceiptDigest !== request.transportReceiptDigest ||
    receipt.resultSpoolReceiptDigest !== request.resultSpoolReceiptDigest ||
    receipt.normalizedEventSetDigest !== request.normalizedEventSetDigest ||
    receipt.sourceKind !== request.source.kind ||
    receipt.sourceRequestDigest !==
      digestAgentEvaluationOptionalCapabilityFactSourceRequest(request)
  ) {
    return false;
  }
  if (request.source.nativeBootstrapSourceRequestDigest !== undefined) {
    return (
      receipt.nativeBootstrapSourceRequestDigest !== undefined &&
      receipt.nativeBootstrapSourceRequestDigest ===
        request.source.nativeBootstrapSourceRequestDigest
    );
  }
  return (
    'ownerRequestDigest' in receipt &&
    receipt.ownerRequestDigest === request.source.ownerRequestDigest &&
    receipt.ownerReceiptDigest === request.source.ownerReceiptDigest &&
    receipt.effectSourceReceiptDigest ===
      request.source.effectSourceReceiptDigest
  );
};

const digestNativeBootstrapSource = (
  receipt: AgentEvaluationOptionalCapabilityFactNativeBootstrapSourceSealReceipt
): CanonicalDigest =>
  digestAgentCanonicalValue({
    kind: receipt.sourceKind,
    planDigest: receipt.planDigest,
    repositoryCommit: receipt.repositoryCommit,
    attemptId: receipt.attemptId,
    descriptorDigest: receipt.descriptorDigest,
    turnIndex: receipt.turnIndex,
    invocationId: receipt.invocationId,
    providerRequestDigest: receipt.providerRequestDigest,
    responseDigest: receipt.responseDigest,
    dispatchIntentDigest: receipt.dispatchIntentDigest,
    transportReceiptDigest: receipt.transportReceiptDigest,
    resultSpoolReceiptDigest: receipt.resultSpoolReceiptDigest,
    normalizedEventSetDigest: receipt.normalizedEventSetDigest,
    nativeBootstrapSourceRequestDigest:
      receipt.nativeBootstrapSourceRequestDigest,
    nativeBootstrapSourceReceiptDigest:
      receipt.nativeBootstrapSourceReceiptDigest,
    ownerStageDigest: receipt.ownerStageDigest,
    ownerDispatchAckDigest: receipt.ownerDispatchAckDigest,
    nativeProviderSourceReceiptDigest:
      receipt.nativeProviderSourceReceiptDigest,
    nativeProviderSourceDigest: receipt.nativeProviderSourceDigest,
    nativeProviderSourceFactDigest: receipt.nativeProviderSourceFactDigest,
    outcome: receipt.outcome,
  });

export const decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt = (
  value: unknown,
  input: Readonly<{
    namespaceId: string;
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    request: AgentEvaluationOptionalCapabilityFactSourceRequest;
  }>
): AgentEvaluationOptionalCapabilityFactSourceSealReceipt => {
  const nativeBootstrapReceipt =
    isPlainObject(value) &&
    Object.hasOwn(value, 'nativeBootstrapSourceRequestDigest');
  const requiredKeys = nativeBootstrapReceipt
    ? nativeBootstrapSourceReceiptRequiredKeys
    : effectSourceReceiptRequiredKeys;
  if (
    !exactRecord(value, requiredKeys, sourceReceiptOptionalKeys) ||
    value.format !==
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_SOURCE_RECEIPT_FORMAT ||
    value.version !== AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION ||
    value.namespaceId !== input.namespaceId ||
    value.planDigest !== input.planDigest ||
    value.repositoryCommit !== input.repositoryCommit ||
    !isAgentControlIdentity(value.sourceAuthorityId) ||
    !isAgentControlIdentity(value.sourceAuthorityRouteBinding) ||
    !isAgentControlIdentity(value.registrationAuthorityIssuerId) ||
    !isAgentControlInstant(value.observedAt) ||
    !isAgentControlInstant(value.sealedAt) ||
    !['observed', 'unavailable', 'failed'].includes(String(value.outcome)) ||
    ![
      value.targetAuthorityDigest,
      value.sourceAuthorityImplementationDigest,
      value.registrationReceiptDigest,
      value.sourceDigest,
      value.sourceRequestDigest,
      value.ownerStageDigest,
      value.ownerDispatchAckDigest,
      value.sourceSealDigest,
    ].every(isAgentCanonicalDigest)
  ) {
    return responseInvalid();
  }
  const receipt =
    value as unknown as AgentEvaluationOptionalCapabilityFactSourceSealReceipt;
  if (
    !sameRequestBinding(receipt, input.request) ||
    Date.parse(receipt.sealedAt) < Date.parse(receipt.observedAt) ||
    digestWithoutKey(value, 'sourceSealDigest') !== receipt.sourceSealDigest
  ) {
    return responseInvalid();
  }
  const observed = receipt.outcome === 'observed';
  if (
    (observed && receipt.resultSpoolReceiptDigest === null) ||
    observed !== Object.hasOwn(receipt, 'fact') ||
    (observed &&
      (!isAgentEvaluationProviderCapabilityObservedFact(receipt.fact) ||
        receipt.fact.factKind !== capabilityFactKind(receipt.capabilityId)))
  ) {
    return responseInvalid();
  }
  if (receipt.nativeBootstrapSourceRequestDigest !== undefined) {
    if (
      receipt.sourceKind !== 'sealed-provider-response-metadata' ||
      ![
        receipt.nativeBootstrapSourceRequestDigest,
        receipt.nativeBootstrapSourceReceiptDigest,
      ].every(isAgentCanonicalDigest) ||
      ![
        receipt.nativeProviderSourceReceiptDigest,
        receipt.nativeProviderSourceDigest,
        receipt.nativeProviderSourceFactDigest,
      ].every((digest) => digest === null || isAgentCanonicalDigest(digest)) ||
      (observed &&
        (!isAgentCanonicalDigest(receipt.nativeProviderSourceReceiptDigest) ||
          !isAgentCanonicalDigest(receipt.nativeProviderSourceDigest) ||
          !isAgentCanonicalDigest(receipt.nativeProviderSourceFactDigest) ||
          receipt.nativeProviderSourceFactDigest !==
            receipt.fact?.factDigest)) ||
      (!observed &&
        (receipt.nativeProviderSourceReceiptDigest !== null ||
          receipt.nativeProviderSourceDigest !== null ||
          receipt.nativeProviderSourceFactDigest !== null)) ||
      digestNativeBootstrapSource(receipt) !== receipt.sourceDigest
    ) {
      return responseInvalid();
    }
  } else if (
    ![
      receipt.ownerRequestDigest,
      receipt.ownerReceiptDigest,
      receipt.preEffectIntentDigest,
      receipt.providerRuntimeJournalResultRecordDigest,
      receipt.providerRuntimeResultSealReceiptDigest,
      receipt.effectSourceReceiptDigest,
      receipt.businessResultDigest,
    ].every(isAgentCanonicalDigest) ||
    !(
      receipt.effectSourceFactDigest === null ||
      isAgentCanonicalDigest(receipt.effectSourceFactDigest)
    ) ||
    observed !== isAgentCanonicalDigest(receipt.effectSourceFactDigest) ||
    (!observed && receipt.effectSourceFactDigest !== null) ||
    (observed && receipt.effectSourceFactDigest !== receipt.fact?.factDigest)
  ) {
    return responseInvalid();
  }
  if (
    textEncoder.encode(canonicalJsonText(receipt)).byteLength >
    maximumResponseBytes
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...receipt,
    ...(receipt.fact === undefined
      ? {}
      : { fact: Object.freeze(receipt.fact) }),
  });
};

export const createAgentEvaluationOptionalCapabilityFactStageRequest = (
  input: Omit<
    AgentEvaluationOptionalCapabilityFactStageRequest,
    'format' | 'version'
  >
): AgentEvaluationOptionalCapabilityFactStageRequest => {
  const request = Object.freeze({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_REQUEST_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    ...input,
  });
  if (
    !isAgentCanonicalDigest(request.planDigest) ||
    !exactCommitPattern.test(request.repositoryCommit) ||
    !isAgentControlIdentity(request.attemptId) ||
    !isAgentCanonicalDigest(request.descriptorDigest) ||
    !canonicalTurn(request.turnIndex) ||
    !isAgentCanonicalDigest(request.sourceSealDigest)
  ) {
    return unavailable();
  }
  return request;
};

export const digestAgentEvaluationOptionalCapabilityFactAuthorityRequest = (
  request: AgentEvaluationOptionalCapabilityFactStageRequest
): CanonicalDigest => digestAgentCanonicalValue(request);

export const digestAgentEvaluationOptionalCapabilityFactStage = (
  authorityRequestDigest: CanonicalDigest,
  receipt: Pick<
    AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
    | 'targetAuthorityDigest'
    | 'sourceAuthorityId'
    | 'sourceAuthorityImplementationDigest'
    | 'sourceAuthorityRouteBinding'
    | 'registrationAuthorityIssuerId'
    | 'registrationReceiptDigest'
    | 'sourceKind'
    | 'sourceDigest'
  >
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    authorityRequestDigest,
    targetAuthorityDigest: receipt.targetAuthorityDigest,
    sourceAuthorityId: receipt.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      receipt.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: receipt.sourceAuthorityRouteBinding,
    registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
    registrationReceiptDigest: receipt.registrationReceiptDigest,
    sourceKind: receipt.sourceKind,
    sourceDigest: receipt.sourceDigest,
  });

export const decodeAgentEvaluationOptionalCapabilityFactStageResponse = (
  value: unknown,
  input: Readonly<{
    request: AgentEvaluationOptionalCapabilityFactStageRequest;
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt;
  }>
): AgentEvaluationOptionalCapabilityFactStageResponse => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'authorityRequestDigest',
      'sourceSealDigest',
      'stageDigest',
      'replayed',
    ]) ||
    value.format !==
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_STAGE_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION ||
    value.sourceSealDigest !== input.receipt.sourceSealDigest ||
    typeof value.replayed !== 'boolean'
  ) {
    return responseInvalid();
  }
  const authorityRequestDigest =
    digestAgentEvaluationOptionalCapabilityFactAuthorityRequest(input.request);
  if (
    value.authorityRequestDigest !== authorityRequestDigest ||
    value.stageDigest !==
      digestAgentEvaluationOptionalCapabilityFactStage(
        authorityRequestDigest,
        input.receipt
      )
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    format: value.format,
    version: value.version,
    authorityRequestDigest,
    sourceSealDigest: input.receipt.sourceSealDigest,
    stageDigest: value.stageDigest as CanonicalDigest,
    replayed: value.replayed,
  });
};

export const createAgentEvaluationOptionalCapabilityFactCommand = (
  receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
  stage: AgentEvaluationOptionalCapabilityFactStageResponse
): AgentEvaluationOptionalCapabilityFactCommand => {
  if (
    receipt.attemptId.length === 0 ||
    receipt.turnIndex < 0 ||
    stage.sourceSealDigest !== receipt.sourceSealDigest
  ) {
    return unavailable();
  }
  return Object.freeze({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_COMMAND_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    attemptId: receipt.attemptId,
    turnIndex: receipt.turnIndex,
    authorityRequestDigest: stage.authorityRequestDigest,
    sourceSealDigest: receipt.sourceSealDigest,
    stageDigest: stage.stageDigest,
  });
};

export const digestAgentEvaluationOptionalCapabilityFactDispatchAck = (
  receipt: Pick<
    AgentEvaluationOptionalCapabilityFactSourceSealReceipt,
    | 'targetAuthorityDigest'
    | 'sourceAuthorityId'
    | 'sourceAuthorityImplementationDigest'
    | 'sourceAuthorityRouteBinding'
    | 'registrationAuthorityIssuerId'
    | 'registrationReceiptDigest'
    | 'sourceKind'
    | 'sourceDigest'
    | 'outcome'
    | 'observedAt'
    | 'fact'
  >,
  stage: Pick<
    AgentEvaluationOptionalCapabilityFactStageResponse,
    'authorityRequestDigest' | 'stageDigest'
  >
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_DISPATCH_ACK_FORMAT,
    version: AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION,
    authorityRequestDigest: stage.authorityRequestDigest,
    stageDigest: stage.stageDigest,
    targetAuthorityDigest: receipt.targetAuthorityDigest,
    sourceAuthorityId: receipt.sourceAuthorityId,
    sourceAuthorityImplementationDigest:
      receipt.sourceAuthorityImplementationDigest,
    sourceAuthorityRouteBinding: receipt.sourceAuthorityRouteBinding,
    registrationAuthorityIssuerId: receipt.registrationAuthorityIssuerId,
    registrationReceiptDigest: receipt.registrationReceiptDigest,
    sourceKind: receipt.sourceKind,
    sourceDigest: receipt.sourceDigest,
    outcome: receipt.outcome,
    observedAt: receipt.observedAt,
    ...(receipt.fact === undefined
      ? {}
      : {
          factKind: receipt.fact.factKind,
          factDigest: receipt.fact.factDigest,
        }),
  });

const runtimeEnvelopeMatches = (
  envelope: AgentEvaluationProviderCapabilityRuntimeFactEnvelope,
  input: Readonly<{
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt;
  }>
): boolean => {
  const receipt = input.receipt;
  return (
    envelope.sourceAuthorityKind === 'shared-durable-capability' &&
    envelope.sourceAuthorityId === receipt.sourceAuthorityId &&
    envelope.sourceAuthorityImplementationDigest ===
      receipt.sourceAuthorityImplementationDigest &&
    envelope.sourceKind === receipt.sourceKind &&
    envelope.routeBinding === receipt.sourceAuthorityRouteBinding &&
    envelope.registrationAuthorityIssuerId ===
      receipt.registrationAuthorityIssuerId &&
    envelope.registrationReceiptDigest === receipt.registrationReceiptDigest &&
    envelope.runtimeFactSourceAuthorityDigest ===
      receipt.targetAuthorityDigest &&
    envelope.stageDigest === receipt.ownerStageDigest &&
    envelope.dispatchAckDigest === receipt.ownerDispatchAckDigest &&
    envelope.planDigest === input.planDigest &&
    envelope.repositoryCommit === input.repositoryCommit &&
    envelope.attemptId === receipt.attemptId &&
    envelope.descriptorDigest === receipt.descriptorDigest &&
    envelope.turnIndex === receipt.turnIndex &&
    envelope.invocationId === receipt.invocationId &&
    envelope.requestDigest === receipt.providerRequestDigest &&
    envelope.responseDigest === receipt.responseDigest &&
    envelope.protocolFamily === receipt.protocolFamily &&
    envelope.providerConfigurationId === receipt.providerConfigurationId &&
    envelope.modelLineageDigest === receipt.modelLineageDigest &&
    envelope.adapterDigest === receipt.adapterDigest &&
    envelope.dispatchIntentDigest === receipt.dispatchIntentDigest &&
    (receipt.nativeBootstrapSourceRequestDigest === undefined ||
      (envelope.transportReceiptDigest === receipt.transportReceiptDigest &&
        envelope.resultSpoolReceiptDigest ===
          receipt.resultSpoolReceiptDigest &&
        envelope.normalizedEventSetDigest ===
          receipt.normalizedEventSetDigest)) &&
    envelope.observedAt === receipt.observedAt &&
    receipt.fact !== undefined &&
    sameCanonicalJson(envelope.fact, receipt.fact)
  );
};

export const decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse = (
  value: unknown,
  input: Readonly<{
    planDigest: CanonicalDigest;
    repositoryCommit: string;
    receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt;
    stage: AgentEvaluationOptionalCapabilityFactStageResponse;
    sanitization: AgentEvaluationProviderCapabilityObservationSanitization;
  }>
): AgentEvaluationOptionalCapabilityFactAuthorityResponse => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'outcome',
      'authorityRequestDigest',
      'sourceAuthorityId',
      'sourceAuthorityImplementationDigest',
      'stageDigest',
      'dispatchAckDigest',
      'runtimeFactEnvelopes',
      'factAuthorities',
      'resultDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_RESPONSE_FORMAT ||
    value.version !== AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_VERSION ||
    value.outcome !== input.receipt.outcome ||
    value.authorityRequestDigest !== input.stage.authorityRequestDigest ||
    value.sourceAuthorityId !== input.receipt.sourceAuthorityId ||
    value.sourceAuthorityImplementationDigest !==
      input.receipt.sourceAuthorityImplementationDigest ||
    value.stageDigest !== input.stage.stageDigest ||
    !Array.isArray(value.runtimeFactEnvelopes) ||
    !Array.isArray(value.factAuthorities) ||
    !isAgentCanonicalDigest(value.dispatchAckDigest) ||
    !isAgentCanonicalDigest(value.resultDigest) ||
    digestWithoutKey(value, 'resultDigest') !== value.resultDigest
  ) {
    return responseInvalid();
  }
  const dispatchAckDigest =
    digestAgentEvaluationOptionalCapabilityFactDispatchAck(
      input.receipt,
      input.stage
    );
  if (value.dispatchAckDigest !== dispatchAckDigest) {
    return responseInvalid();
  }
  if (value.outcome === 'observed') {
    if (
      value.runtimeFactEnvelopes.length !== 1 ||
      value.factAuthorities.length !== 1
    ) {
      return responseInvalid();
    }
    const envelope = value.runtimeFactEnvelopes[0];
    const authority = value.factAuthorities[0];
    if (
      !isAgentEvaluationProviderCapabilityRuntimeFactEnvelope(
        envelope,
        input.sanitization
      ) ||
      !runtimeEnvelopeMatches(envelope, {
        planDigest: input.planDigest,
        repositoryCommit: input.repositoryCommit,
        receipt: input.receipt,
      }) ||
      !isAgentEvaluationProviderCapabilityFactAuthority(authority) ||
      !sameCanonicalJson(
        authority,
        createAgentEvaluationProviderCapabilityFactAuthorityFromRuntimeEnvelope(
          envelope,
          input.sanitization
        )
      )
    ) {
      return responseInvalid();
    }
  } else if (
    value.runtimeFactEnvelopes.length !== 0 ||
    value.factAuthorities.length !== 0
  ) {
    return responseInvalid();
  }
  return Object.freeze({
    ...(value as unknown as AgentEvaluationOptionalCapabilityFactAuthorityResponse),
    runtimeFactEnvelopes: Object.freeze([
      ...(value.runtimeFactEnvelopes as AgentEvaluationProviderCapabilityRuntimeFactEnvelope[]),
    ]),
    factAuthorities: Object.freeze([
      ...(value.factAuthorities as AgentEvaluationProviderCapabilityFactAuthority[]),
    ]),
  });
};

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
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
    rejectAbort = undefined;
  }
};

const readBoundedBody = async (
  response: Response,
  signal: AbortSignal,
  maximumBytes = maximumResponseBytes
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
      if (byteLength > maximumBytes) {
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

const exactJsonMediaType = (value: string | null): boolean =>
  value?.split(';', 1)[0]?.trim().toLowerCase() === 'application/json';

const validSanitization = (
  value: unknown
): value is AgentEvaluationProviderCapabilityObservationSanitization => {
  if (
    !exactRecord(value, ['protectedMaterialCanaries', 'secretCanaries']) ||
    !Array.isArray(value.protectedMaterialCanaries) ||
    !Array.isArray(value.secretCanaries) ||
    value.protectedMaterialCanaries.length < 1 ||
    value.protectedMaterialCanaries.length > 256 ||
    value.secretCanaries.length < 1 ||
    value.secretCanaries.length > 256
  ) {
    return false;
  }
  const canaries = [
    ...value.protectedMaterialCanaries,
    ...value.secretCanaries,
  ];
  return (
    canaries.every(
      (canary) =>
        typeof canary === 'string' &&
        canary.length >= 8 &&
        canary.length <= 8_192
    ) && new Set(canaries).size === canaries.length
  );
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

export const createEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClient =
  (
    options: CreateEnvironmentAgentEvaluationOptionalCapabilityFactAuthorityClientInput
  ): AgentEvaluationOptionalCapabilityFactAuthorityClient => {
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
      AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_OPERATION_TIMEOUT_MS;
    if (
      baseUrl !== AGENT_EVALUATION_LEDGER_BASE_URL ||
      environmentNamespace !== options.namespaceId ||
      !isAgentControlIdentity(options.namespaceId) ||
      environmentCommit !== options.repositoryCommit ||
      !exactCommitPattern.test(options.repositoryCommit) ||
      !isAgentCanonicalDigest(options.planDigest) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs >
        AGENT_EVALUATION_OPTIONAL_CAPABILITY_FACT_OPERATION_TIMEOUT_MS ||
      typeof options.forbiddenCanaries !== 'function' ||
      typeof options.sanitization !== 'function'
    ) {
      return unavailable();
    }
    const fetchImplementation = options.fetch ?? globalThis.fetch;
    if (typeof fetchImplementation !== 'function') return unavailable();
    const basePath = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/${encodeURIComponent(options.planDigest)}/${encodeURIComponent(options.repositoryCommit)}`;

    const currentSanitization =
      (): AgentEvaluationProviderCapabilityObservationSanitization => {
        let value: unknown;
        try {
          value = options.sanitization();
        } catch {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
          );
        }
        if (!validSanitization(value)) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUnavailable
          );
        }
        return Object.freeze({
          protectedMaterialCanaries: Object.freeze([
            ...value.protectedMaterialCanaries,
          ]),
          secretCanaries: Object.freeze([...value.secretCanaries]),
        });
      };

    const post = async (
      path: string,
      bodyValue: unknown,
      idempotencyKey: CanonicalDigest,
      maximumRequestBytes: number
    ): Promise<unknown> => {
      const body = canonicalJsonText(bodyValue);
      if (
        textEncoder.encode(body).byteLength > maximumRequestBytes ||
        !isAgentCanonicalDigest(idempotencyKey)
      ) {
        return unavailable();
      }
      scanForbiddenCanaries(
        bodyValue,
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
        const url = `${basePath}${path}`;
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
          'Idempotency-Key': idempotencyKey,
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
        return decoded;
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

    const getNativeBootstrapSource = async (
      input: Readonly<{
        attemptId: string;
        program: AgentCapabilityProbeProgram;
      }>
    ): Promise<
      AgentEvaluationNativeOptionalCapabilityBootstrapSourceRead | undefined
    > => {
      if (!isAgentControlIdentity(input.attemptId)) return unavailable();
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
        const url = `${basePath}/attempt-turns/${encodeURIComponent(input.attemptId)}/0/native-optional-capability-bootstrap-source`;
        if (textContainsCredentialCanary(url, credentialSignatures)) {
          throw new AgentEvaluationRunnerError(
            AGENT_EVALUATION_RUNNER_ERROR_CODES.secretUseDenied
          );
        }
        authorization = `Bearer ${textDecoder.decode(tokenBytes)}`;
        headers = new Headers({
          Accept: 'application/json',
          Authorization: authorization,
        });
        let response: Response;
        try {
          response = await awaitWithAbort(
            fetchImplementation(url, {
              method: 'GET',
              headers,
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
          controller.signal,
          maximumNativeBootstrapSourceReadBytes
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
        if (response.status === 404) return undefined;
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
        return decodeAgentEvaluationNativeOptionalCapabilityBootstrapSourceRead(
          decoded,
          {
            attemptId: input.attemptId,
            program: input.program,
            sanitization: currentSanitization(),
          }
        );
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

    const validateReceipt = (
      request: AgentEvaluationOptionalCapabilityFactSourceRequest,
      receipt: AgentEvaluationOptionalCapabilityFactSourceSealReceipt
    ): AgentEvaluationOptionalCapabilityFactSourceSealReceipt =>
      decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(receipt, {
        namespaceId: options.namespaceId,
        planDigest: options.planDigest,
        repositoryCommit: options.repositoryCommit,
        request:
          decodeAgentEvaluationOptionalCapabilityFactSourceRequest(request),
      });

    const client: AgentEvaluationOptionalCapabilityFactAuthorityClient = {
      readNativeBootstrapSource: getNativeBootstrapSource,
      async sealSource(request) {
        const canonicalRequest =
          decodeAgentEvaluationOptionalCapabilityFactSourceRequest(request);
        const value = await post(
          '/optional-capability-fact-sources/seal',
          canonicalRequest,
          digestAgentEvaluationOptionalCapabilityFactSourceRequest(
            canonicalRequest
          ),
          maximumWireBytes
        );
        if (
          !exactRecord(value, ['sourceSealReceipt', 'replayed']) ||
          typeof value.replayed !== 'boolean'
        ) {
          return responseInvalid();
        }
        return decodeAgentEvaluationOptionalCapabilityFactSourceSealReceipt(
          value.sourceSealReceipt,
          {
            namespaceId: options.namespaceId,
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            request: canonicalRequest,
          }
        );
      },

      async stage(request, receipt) {
        const canonicalReceipt = validateReceipt(request, receipt);
        const stageRequest =
          createAgentEvaluationOptionalCapabilityFactStageRequest({
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            attemptId: canonicalReceipt.attemptId,
            descriptorDigest: canonicalReceipt.descriptorDigest,
            turnIndex: canonicalReceipt.turnIndex,
            sourceSealDigest: canonicalReceipt.sourceSealDigest,
          });
        const value = await post(
          '/optional-capability-facts/stage',
          stageRequest,
          digestAgentEvaluationOptionalCapabilityFactAuthorityRequest(
            stageRequest
          ),
          maximumResponseBytes
        );
        return decodeAgentEvaluationOptionalCapabilityFactStageResponse(value, {
          request: stageRequest,
          receipt: canonicalReceipt,
        });
      },

      async seal(request, receipt, stage) {
        const canonicalReceipt = validateReceipt(request, receipt);
        const stageRequest =
          createAgentEvaluationOptionalCapabilityFactStageRequest({
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            attemptId: canonicalReceipt.attemptId,
            descriptorDigest: canonicalReceipt.descriptorDigest,
            turnIndex: canonicalReceipt.turnIndex,
            sourceSealDigest: canonicalReceipt.sourceSealDigest,
          });
        const canonicalStage =
          decodeAgentEvaluationOptionalCapabilityFactStageResponse(stage, {
            request: stageRequest,
            receipt: canonicalReceipt,
          });
        const command = createAgentEvaluationOptionalCapabilityFactCommand(
          canonicalReceipt,
          canonicalStage
        );
        const value = await post(
          '/optional-capability-facts/seal',
          command,
          command.authorityRequestDigest,
          maximumResponseBytes
        );
        if (
          !exactRecord(value, ['authorityResponse', 'replayed']) ||
          typeof value.replayed !== 'boolean'
        ) {
          return responseInvalid();
        }
        return decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
          value.authorityResponse,
          {
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            receipt: canonicalReceipt,
            stage: canonicalStage,
            sanitization: currentSanitization(),
          }
        );
      },

      async reconcile(request, receipt, stage) {
        const canonicalReceipt = validateReceipt(request, receipt);
        const stageRequest =
          createAgentEvaluationOptionalCapabilityFactStageRequest({
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            attemptId: canonicalReceipt.attemptId,
            descriptorDigest: canonicalReceipt.descriptorDigest,
            turnIndex: canonicalReceipt.turnIndex,
            sourceSealDigest: canonicalReceipt.sourceSealDigest,
          });
        const canonicalStage =
          decodeAgentEvaluationOptionalCapabilityFactStageResponse(stage, {
            request: stageRequest,
            receipt: canonicalReceipt,
          });
        const command = createAgentEvaluationOptionalCapabilityFactCommand(
          canonicalReceipt,
          canonicalStage
        );
        const value = await post(
          '/optional-capability-facts/reconcile',
          command,
          command.authorityRequestDigest,
          maximumResponseBytes
        );
        if (
          !exactRecord(value, ['authorityResponse', 'replayed']) ||
          value.replayed !== true
        ) {
          return responseInvalid();
        }
        return decodeAgentEvaluationOptionalCapabilityFactAuthorityResponse(
          value.authorityResponse,
          {
            planDigest: options.planDigest,
            repositoryCommit: options.repositoryCommit,
            receipt: canonicalReceipt,
            stage: canonicalStage,
            sanitization: currentSanitization(),
          }
        );
      },

      async observe(request) {
        const sourceSealReceipt = await client.sealSource(request);
        const stage = await client.stage(request, sourceSealReceipt);
        let authorityResponse: AgentEvaluationOptionalCapabilityFactAuthorityResponse;
        try {
          authorityResponse = await client.seal(
            request,
            sourceSealReceipt,
            stage
          );
        } catch (caught) {
          const failure = safeRunnerError(caught);
          if (
            failure.code !==
              AGENT_EVALUATION_RUNNER_ERROR_CODES.transportFailed &&
            failure.code !== AGENT_EVALUATION_RUNNER_ERROR_CODES.aborted
          ) {
            throw failure;
          }
          authorityResponse = await client.reconcile(
            request,
            sourceSealReceipt,
            stage
          );
        }
        return Object.freeze({ sourceSealReceipt, stage, authorityResponse });
      },
    };
    return Object.freeze(client);
  };
