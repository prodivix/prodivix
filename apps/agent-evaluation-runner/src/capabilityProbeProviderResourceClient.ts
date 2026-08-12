import {
  createAgentModelLineage,
  createAgentProviderConfigurationIdentity,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProviderResourceAuthority,
  isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeProviderResourceAuthority,
  type AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt,
  type AgentModelLineage,
  type AgentProviderConfigurationIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
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

export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-registration-request' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-registration-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT =
  'prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-response' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION =
  1 as const;

const stageFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-stage';
const ownerAdmissionFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-owner-admission';
const dispatchAckFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-dispatch-ack';
const resultIngressReceiptFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-result-ingress-receipt';
const resultFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-result';
const manifestFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-manifest';
const uploadReceiptFormat =
  'prodivix.agent-evaluation-capability-probe-provider-resource-content-upload-receipt';
const maximumRequestBytes = 262_144;
const maximumResponseBytes = 65_536;
const maximumResultBytes = 262_144;
const maximumRegistrationLifetimeMs = 8 * 24 * 60 * 60 * 1_000;
const exactCommitPattern = /^[a-f0-9]{40}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });

type Environment = NodeJS.ProcessEnv | AgentEvaluationEnvironmentReader;

export type AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_REQUEST_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    providerConfiguration: AgentProviderConfigurationIdentity;
    modelLineage: AgentModelLineage;
    probeProgram: AgentCapabilityProbeProgram;
    minimumExpiresAt: string;
    requestDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_RESPONSE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    providerResourceAuthority: AgentCapabilityProbeProviderResourceAuthority;
    resourceResultDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    registrationReceiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceResult = Readonly<{
  format: typeof resultFormat;
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION;
  requestDigest: CanonicalDigest;
  resourceManifest: Readonly<Record<string, unknown>>;
  contentUploadReceipt: Readonly<Record<string, unknown>>;
  deletionAuthorityReceipt: AgentCapabilityProbeProviderResourceDeletionAuthorityReceipt;
  providerResourceAuthority: AgentCapabilityProbeProviderResourceAuthority;
  resultDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeProviderResourceResultIngressRequest =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION;
    namespaceId: string;
    repositoryCommit: string;
    requestDigest: CanonicalDigest;
    ownerImplementationDigest: CanonicalDigest;
    stageDigest: CanonicalDigest;
    resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult;
    resourceResultDigest: CanonicalDigest;
    ownerAdmissionDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    ingressDigest: CanonicalDigest;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse =
  Readonly<{
    format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT;
    version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION;
    requestDigest: CanonicalDigest;
    ingressDigest: CanonicalDigest;
    resourceResultDigest: CanonicalDigest;
    dispatchAckDigest: CanonicalDigest;
    resultIngressReceiptDigest: CanonicalDigest;
    replayed: boolean;
  }>;

export type AgentEvaluationCapabilityProbeProviderResourceClient = Readonly<{
  register(
    request: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
    signal: AbortSignal
  ): Promise<AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse>;
  storeResult(
    request: AgentEvaluationCapabilityProbeProviderResourceResultIngressRequest,
    signal: AbortSignal
  ): Promise<AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse>;
}>;

export type CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceClientInput =
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

const canonicalWithin = (value: unknown, maximumBytes: number): boolean => {
  try {
    return (
      textEncoder.encode(canonicalJsonText(value)).byteLength <= maximumBytes
    );
  } catch {
    return false;
  }
};

const exactProvider = (
  value: AgentProviderConfigurationIdentity
): AgentProviderConfigurationIdentity => {
  try {
    const recreated = createAgentProviderConfigurationIdentity(value);
    if (!sameCanonicalJson(recreated, value)) return invalid();
    return Object.freeze({
      ...value,
      adapter: Object.freeze({ ...value.adapter }),
    });
  } catch {
    return invalid();
  }
};

const exactModel = (value: AgentModelLineage): AgentModelLineage => {
  try {
    const { lineageDigest: _lineageDigest, ...base } = value;
    const recreated = createAgentModelLineage(base);
    if (!sameCanonicalJson(recreated, value)) return invalid();
    return Object.freeze({ ...value });
  } catch {
    return invalid();
  }
};

export const createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest =
  (
    input: Omit<
      AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest,
      'format' | 'version' | 'requestDigest'
    >
  ): AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest => {
    const providerConfiguration = exactProvider(input.providerConfiguration);
    const modelLineage = exactModel(input.modelLineage);
    const descriptor =
      input.probeProgram.providerRequestIntent.publicProbeResource;
    if (
      !isAgentControlIdentity(input.namespaceId) ||
      !exactCommitPattern.test(input.repositoryCommit) ||
      !isAgentControlInstant(input.minimumExpiresAt) ||
      !isAgentCapabilityProbeProgram(input.probeProgram) ||
      input.probeProgram.profileProjection.capabilityId !==
        'provider.hosted-retrieval' ||
      descriptor === null ||
      !['gemini-interactions', 'openai-responses'].includes(
        providerConfiguration.adapter.protocolFamily
      ) ||
      inspectAgentControlJson(input, maximumRequestBytes).length > 0
    ) {
      return invalid();
    }
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_REQUEST_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      providerConfiguration,
      modelLineage,
      probeProgram: input.probeProgram,
      minimumExpiresAt: input.minimumExpiresAt,
    });
    const request = Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    });
    if (!canonicalWithin(request, maximumRequestBytes)) return invalid();
    return request;
  };

export const decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest =
  (
    value: unknown
  ): AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest => {
    if (
      !exactRecord(value, [
        'format',
        'version',
        'namespaceId',
        'repositoryCommit',
        'providerConfiguration',
        'modelLineage',
        'probeProgram',
        'minimumExpiresAt',
        'requestDigest',
      ])
    ) {
      return invalid();
    }
    const candidate =
      value as unknown as AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
    const {
      format: _format,
      version: _version,
      requestDigest,
      ...input
    } = candidate;
    const recreated =
      createAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
        input
      );
    if (requestDigest !== recreated.requestDigest) return invalid();
    return recreated;
  };

export const digestAgentEvaluationCapabilityProbeProviderResourceStage = (
  requestDigest: CanonicalDigest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: stageFormat,
    version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
    requestDigest,
    ownerImplementationDigest,
  });

export const digestAgentEvaluationCapabilityProbeProviderResourceOwnerAdmission =
  (
    requestDigest: CanonicalDigest,
    resourceResultDigest: CanonicalDigest,
    ownerImplementationDigest: CanonicalDigest,
    stageDigest: CanonicalDigest
  ): CanonicalDigest =>
    digestAgentCanonicalValue({
      format: ownerAdmissionFormat,
      version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
      requestDigest,
      resourceResultDigest,
      ownerImplementationDigest,
      stageDigest,
    });

export const digestAgentEvaluationCapabilityProbeProviderResourceDispatchAck = (
  requestDigest: CanonicalDigest,
  resourceResultDigest: CanonicalDigest,
  ownerAdmissionDigest: CanonicalDigest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: dispatchAckFormat,
    version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
    requestDigest,
    resourceResultDigest,
    ownerAdmissionDigest,
    ownerImplementationDigest,
    stageDigest,
  });

export const digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt =
  (
    requestDigest: CanonicalDigest,
    ingressDigest: CanonicalDigest,
    resourceResultDigest: CanonicalDigest,
    dispatchAckDigest: CanonicalDigest
  ): CanonicalDigest =>
    digestAgentCanonicalValue({
      format: resultIngressReceiptFormat,
      version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
      requestDigest,
      ingressDigest,
      resourceResultDigest,
      dispatchAckDigest,
    });

export const decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse =
  (
    value: unknown,
    requestInput: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest
  ): AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse => {
    const request =
      decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
        requestInput
      );
    if (
      !exactRecord(value, [
        'format',
        'version',
        'requestDigest',
        'providerResourceAuthority',
        'resourceResultDigest',
        'ownerImplementationDigest',
        'stageDigest',
        'dispatchAckDigest',
        'registrationReceiptDigest',
      ]) ||
      value.format !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_REGISTRATION_RESPONSE_FORMAT ||
      value.version !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION ||
      value.requestDigest !== request.requestDigest ||
      !isAgentCapabilityProbeProviderResourceAuthority(
        value.providerResourceAuthority,
        request.probeProgram
      ) ||
      ![
        value.resourceResultDigest,
        value.ownerImplementationDigest,
        value.stageDigest,
        value.dispatchAckDigest,
        value.registrationReceiptDigest,
      ].every(isAgentCanonicalDigest)
    ) {
      return invalid();
    }
    const response =
      value as unknown as AgentEvaluationCapabilityProbeProviderResourceRegistrationResponse;
    const authority = response.providerResourceAuthority;
    const expectedStage =
      digestAgentEvaluationCapabilityProbeProviderResourceStage(
        request.requestDigest,
        response.ownerImplementationDigest
      );
    const ownerAdmissionDigest =
      digestAgentEvaluationCapabilityProbeProviderResourceOwnerAdmission(
        request.requestDigest,
        response.resourceResultDigest,
        response.ownerImplementationDigest,
        expectedStage
      );
    const expectedAck =
      digestAgentEvaluationCapabilityProbeProviderResourceDispatchAck(
        request.requestDigest,
        response.resourceResultDigest,
        ownerAdmissionDigest,
        response.ownerImplementationDigest,
        expectedStage
      );
    const { registrationReceiptDigest, ...base } = response;
    if (
      authority.protocolFamily !==
        request.providerConfiguration.adapter.protocolFamily ||
      authority.providerConfigurationId !==
        request.providerConfiguration.providerConfigurationId ||
      authority.modelId !== request.modelLineage.modelId ||
      authority.modelLineageDigest !== request.modelLineage.lineageDigest ||
      authority.adapterDigest !==
        request.providerConfiguration.adapter.adapterDigest ||
      authority.probeProgramDigest !== request.probeProgram.programDigest ||
      authority.publicResourceDescriptorDigest !==
        request.probeProgram.providerRequestIntent.publicProbeResource
          ?.descriptorDigest ||
      Date.parse(authority.expiresAt) < Date.parse(request.minimumExpiresAt) ||
      Date.parse(authority.expiresAt) - Date.parse(authority.registeredAt) >
        maximumRegistrationLifetimeMs ||
      response.stageDigest !== expectedStage ||
      response.dispatchAckDigest !== expectedAck ||
      registrationReceiptDigest !== digestAgentCanonicalValue(base)
    ) {
      return invalid();
    }
    return Object.freeze({
      ...response,
      providerResourceAuthority: Object.freeze({ ...authority }),
    });
  };

const componentDigest = (
  value: unknown,
  format: string,
  exactKeys: readonly string[],
  digestField: string
): CanonicalDigest => {
  if (
    !exactRecord(value, exactKeys) ||
    value.format !== format ||
    value.version !==
      AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION ||
    !Object.hasOwn(value, digestField)
  ) {
    return invalid();
  }
  const base = { ...value };
  delete base[digestField];
  const digest = digestAgentCanonicalValue(base);
  if (value[digestField] !== digest) return invalid();
  return digest;
};

export const createAgentEvaluationCapabilityProbeProviderResourceResultIngressRequest =
  (
    input: Readonly<{
      namespaceId: string;
      repositoryCommit: string;
      registrationRequest: AgentEvaluationCapabilityProbeProviderResourceRegistrationRequest;
      ownerImplementationDigest: CanonicalDigest;
      stageDigest: CanonicalDigest;
      resourceResult: AgentEvaluationCapabilityProbeProviderResourceResult;
    }>
  ): AgentEvaluationCapabilityProbeProviderResourceResultIngressRequest => {
    const registrationRequest =
      decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
        input.registrationRequest
      );
    const result = input.resourceResult;
    if (
      input.namespaceId !== registrationRequest.namespaceId ||
      input.repositoryCommit !== registrationRequest.repositoryCommit ||
      !isAgentCanonicalDigest(input.ownerImplementationDigest) ||
      input.stageDigest !==
        digestAgentEvaluationCapabilityProbeProviderResourceStage(
          registrationRequest.requestDigest,
          input.ownerImplementationDigest
        ) ||
      !exactRecord(result, [
        'format',
        'version',
        'requestDigest',
        'resourceManifest',
        'contentUploadReceipt',
        'deletionAuthorityReceipt',
        'providerResourceAuthority',
        'resultDigest',
      ]) ||
      result.format !== resultFormat ||
      result.version !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION ||
      result.requestDigest !== registrationRequest.requestDigest ||
      !isAgentCapabilityProbeProviderResourceAuthority(
        result.providerResourceAuthority,
        registrationRequest.probeProgram
      ) ||
      !canonicalWithin(result, maximumResultBytes) ||
      inspectAgentControlJson(result, maximumResultBytes).length > 0
    ) {
      return invalid();
    }
    const manifestDigest = componentDigest(
      result.resourceManifest,
      manifestFormat,
      [
        'format',
        'version',
        'requestDigest',
        'probeProgramDigest',
        'publicResourceDescriptorDigest',
        'protocolFamily',
        'providerConfigurationId',
        'modelId',
        'modelLineageDigest',
        'adapterDigest',
        'providerResourceKind',
        'providerResourceId',
        'contentDigest',
        'documentBytesDigest',
        'registeredAt',
        'expiresAt',
        'manifestDigest',
      ],
      'manifestDigest'
    );
    const uploadDigest = componentDigest(
      result.contentUploadReceipt,
      uploadReceiptFormat,
      [
        'format',
        'version',
        'requestDigest',
        'resourceManifestDigest',
        'publicResourceDescriptorDigest',
        'providerResourceKind',
        'providerResourceId',
        'contentDigest',
        'documentBytesDigest',
        'dispatchIntentDigest',
        'transportReceiptDigest',
        'responseSpoolDigest',
        'uploadedAt',
        'contentUploadReceiptDigest',
      ],
      'contentUploadReceiptDigest'
    );
    const manifest = result.resourceManifest;
    const upload = result.contentUploadReceipt;
    const deletion = result.deletionAuthorityReceipt;
    const authority = result.providerResourceAuthority;
    if (
      !isAgentCapabilityProbeProviderResourceDeletionAuthorityReceipt(deletion)
    ) {
      return invalid();
    }
    const deletionDigest = deletion.deletionAuthorityReceiptDigest;
    const descriptor =
      registrationRequest.probeProgram.providerRequestIntent
        .publicProbeResource;
    if (
      descriptor === null ||
      manifest.requestDigest !== registrationRequest.requestDigest ||
      manifest.probeProgramDigest !==
        registrationRequest.probeProgram.programDigest ||
      manifest.publicResourceDescriptorDigest !== descriptor.descriptorDigest ||
      manifest.protocolFamily !==
        registrationRequest.providerConfiguration.adapter.protocolFamily ||
      manifest.providerConfigurationId !==
        registrationRequest.providerConfiguration.providerConfigurationId ||
      manifest.modelId !== registrationRequest.modelLineage.modelId ||
      manifest.modelLineageDigest !==
        registrationRequest.modelLineage.lineageDigest ||
      manifest.adapterDigest !==
        registrationRequest.providerConfiguration.adapter.adapterDigest ||
      manifest.providerResourceKind !== authority.providerResourceKind ||
      manifest.providerResourceId !== authority.providerResourceId ||
      manifest.contentDigest !== descriptor.contentDigest ||
      !sameCanonicalJson(
        manifest.documentBytesDigest,
        descriptor.documentBytesDigest
      ) ||
      manifest.registeredAt !== authority.registeredAt ||
      manifest.expiresAt !== authority.expiresAt ||
      upload.requestDigest !== registrationRequest.requestDigest ||
      upload.resourceManifestDigest !== manifestDigest ||
      upload.publicResourceDescriptorDigest !== descriptor.descriptorDigest ||
      upload.providerResourceKind !== authority.providerResourceKind ||
      upload.providerResourceId !== authority.providerResourceId ||
      upload.contentDigest !== descriptor.contentDigest ||
      !sameCanonicalJson(
        upload.documentBytesDigest,
        descriptor.documentBytesDigest
      ) ||
      ![
        upload.dispatchIntentDigest,
        upload.transportReceiptDigest,
        upload.responseSpoolDigest,
      ].every(isAgentCanonicalDigest) ||
      !isAgentControlInstant(upload.uploadedAt) ||
      deletion.requestDigest !== registrationRequest.requestDigest ||
      deletion.resourceManifestDigest !== manifestDigest ||
      deletion.providerResourceKind !== authority.providerResourceKind ||
      deletion.providerResourceId !== authority.providerResourceId ||
      deletion.deletionRouteBinding !== 'provider-resource.delete' ||
      !isAgentCanonicalDigest(deletion.deletionRequestProjectionDigest) ||
      deletion.registeredAt !== authority.registeredAt ||
      deletion.expiresAt !== authority.expiresAt ||
      authority.resourceManifestDigest !== manifestDigest ||
      authority.contentUploadReceiptDigest !== uploadDigest ||
      authority.deletionAuthorityReceiptDigest !== deletionDigest
    ) {
      return invalid();
    }
    const { resultDigest: _resultDigest, ...resultBase } = result;
    const resourceResultDigest = digestAgentCanonicalValue(resultBase);
    if (result.resultDigest !== resourceResultDigest) return invalid();
    const ownerAdmissionDigest =
      digestAgentEvaluationCapabilityProbeProviderResourceOwnerAdmission(
        registrationRequest.requestDigest,
        resourceResultDigest,
        input.ownerImplementationDigest,
        input.stageDigest
      );
    const dispatchAckDigest =
      digestAgentEvaluationCapabilityProbeProviderResourceDispatchAck(
        registrationRequest.requestDigest,
        resourceResultDigest,
        ownerAdmissionDigest,
        input.ownerImplementationDigest,
        input.stageDigest
      );
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_FORMAT,
      version: AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION,
      namespaceId: input.namespaceId,
      repositoryCommit: input.repositoryCommit,
      requestDigest: registrationRequest.requestDigest,
      ownerImplementationDigest: input.ownerImplementationDigest,
      stageDigest: input.stageDigest,
      resourceResult: result,
      resourceResultDigest,
      ownerAdmissionDigest,
      dispatchAckDigest,
    });
    return Object.freeze({
      ...base,
      ingressDigest: digestAgentCanonicalValue(base),
    });
  };

export const decodeAgentEvaluationCapabilityProbeProviderResourceResultIngressResponse =
  (
    value: unknown,
    request: AgentEvaluationCapabilityProbeProviderResourceResultIngressRequest
  ): AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse => {
    if (
      !exactRecord(value, [
        'format',
        'version',
        'requestDigest',
        'ingressDigest',
        'resourceResultDigest',
        'dispatchAckDigest',
        'resultIngressReceiptDigest',
        'replayed',
      ]) ||
      value.format !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_RESULT_INGRESS_RESPONSE_FORMAT ||
      value.version !==
        AGENT_EVALUATION_CAPABILITY_PROBE_PROVIDER_RESOURCE_VERSION ||
      value.requestDigest !== request.requestDigest ||
      value.ingressDigest !== request.ingressDigest ||
      value.resourceResultDigest !== request.resourceResultDigest ||
      value.dispatchAckDigest !== request.dispatchAckDigest ||
      typeof value.replayed !== 'boolean' ||
      !isAgentCanonicalDigest(value.resultIngressReceiptDigest)
    ) {
      return invalid();
    }
    const expectedReceipt =
      digestAgentEvaluationCapabilityProbeProviderResourceResultIngressReceipt(
        request.requestDigest,
        request.ingressDigest,
        request.resourceResultDigest,
        request.dispatchAckDigest
      );
    if (value.resultIngressReceiptDigest !== expectedReceipt) return invalid();
    return Object.freeze({
      ...(value as unknown as AgentEvaluationCapabilityProbeProviderResourceResultIngressResponse),
    });
  };

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

export const createEnvironmentAgentEvaluationCapabilityProbeProviderResourceClient =
  (
    options: CreateEnvironmentAgentEvaluationCapabilityProbeProviderResourceClientInput
  ): AgentEvaluationCapabilityProbeProviderResourceClient => {
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
    const registrationsEndpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-provider-resource-registrations`;
    const resultsEndpoint = `${baseUrl}/v1/evaluations/${encodeURIComponent(options.namespaceId)}/capability-probe-provider-resource-results`;
    const fetchImplementation = options.fetch ?? fetch;

    const post = async (
      endpoint: string,
      body: unknown,
      idempotencyKey: CanonicalDigest,
      signal: AbortSignal
    ): Promise<unknown> => {
      if (signal.aborted) return unavailable();
      const requestText = canonicalJsonText(body);
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
        const headers = new Headers({
          Accept: 'application/json',
          Authorization: `Bearer ${textDecoder.decode(credential)}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        });
        try {
          const response = await fetchImplementation(endpoint, {
            method: 'POST',
            headers,
            body: requestText,
            signal,
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
          const bytes = await readBoundedBody(response, signal);
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
          if (signal.aborted) return unavailable();
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
      async register(requestInput, signal) {
        const request =
          decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationRequest(
            requestInput
          );
        if (
          request.namespaceId !== options.namespaceId ||
          request.repositoryCommit !== options.repositoryCommit
        ) {
          return unavailable();
        }
        return decodeAgentEvaluationCapabilityProbeProviderResourceRegistrationResponse(
          await post(
            registrationsEndpoint,
            request,
            request.requestDigest,
            signal
          ),
          request
        );
      },
      async storeResult(request, signal) {
        if (
          request.namespaceId !== options.namespaceId ||
          request.repositoryCommit !== options.repositoryCommit
        ) {
          return unavailable();
        }
        return decodeAgentEvaluationCapabilityProbeProviderResourceResultIngressResponse(
          await post(resultsEndpoint, request, request.requestDigest, signal),
          request
        );
      },
    });
  };
