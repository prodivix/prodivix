import {
  createAgentEvaluationProductionCapabilityProbeEvidence,
  createAgentModelLineage,
  createAgentProviderConfigurationIdentity,
  digestAgentCanonicalValue,
  inspectAgentControlJson,
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProviderResourceAuthority,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  type AgentEvaluationProductionCapabilityProbeEvidence,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeProviderResourceAuthority,
  type AgentModelLineage,
  type AgentProviderConfigurationIdentity,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';

export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT =
  'prodivix.agent-evaluation-capability-probe-admission-request' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION = 1 as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_OPERATION =
  'capability.probe' as const;
export const AGENT_EVALUATION_CAPABILITY_PROBE_ROUTE_BINDING =
  'capability-probe-admission' as const;

const maximumRequestBytes = 1_048_576;
const maximumEvidenceBytes = 65_536;
const maximumReferenceBundleBytes = 1_048_576;
const maximumSourceReceiptBytes = 262_144;
const exactCommitPattern = /^[a-f0-9]{40}$/u;

export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS = Object.freeze([
  'probe-request',
  'probe-response',
  'dispatch',
  'transport',
  'encrypted-response-spool',
  'normalized-event-set',
] as const);

export const AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS =
  Object.freeze([
    'prodivix.agent-evaluation-capability-probe-request',
    'prodivix.agent-evaluation-capability-probe-response',
    'prodivix.agent-evaluation-capability-probe-dispatch-receipt',
    'prodivix.agent-evaluation-capability-probe-transport-receipt',
    'prodivix.agent-evaluation-capability-probe-encrypted-response-spool-receipt',
    'prodivix.agent-evaluation-capability-probe-normalized-event-set-receipt',
  ] as const);

const capabilityByProfile: Readonly<Record<string, string>> = Object.freeze({
  'g4-provider-background-job': 'provider.background-job',
  'g4-provider-hosted-retrieval-core': 'provider.hosted-retrieval',
  'g4-provider-hosted-retrieval-document': 'provider.hosted-retrieval',
  'g4-provider-parallel-tool': 'provider.parallel-tool',
  'g4-provider-isolated-cache': 'provider.isolated-cache',
  'g4-provider-reasoning-continuation': 'provider.reasoning-continuation',
} satisfies Readonly<Record<string, string>>);

export type AgentEvaluationCapabilityProbeAdmissionRequest = Readonly<{
  format: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT;
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION;
  namespaceId: string;
  repositoryCommit: string;
  providerConfiguration: AgentProviderConfigurationIdentity;
  modelLineage: AgentModelLineage;
  qualificationCapabilityProfileId: string;
  qualificationCapabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  declaredCapabilityProfileDigests: readonly CanonicalDigest[];
  probeProgram: AgentCapabilityProbeProgram;
  probeProviderResourceAuthority: AgentCapabilityProbeProviderResourceAuthority | null;
  minimumExpiresAt: string;
  requestDigest: CanonicalDigest;
}>;

export type CreateAgentEvaluationCapabilityProbeAdmissionRequestInput = Omit<
  AgentEvaluationCapabilityProbeAdmissionRequest,
  'format' | 'version' | 'requestDigest'
>;

export type AgentEvaluationCapabilityProbeReferenceReceipt = Readonly<{
  format: (typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS)[number];
  version: typeof AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION;
  admissionRequestDigest: CanonicalDigest;
  providerConfigurationDigest: CanonicalDigest;
  modelLineageDigest: CanonicalDigest;
  qualificationCapabilityProfileDigest: CanonicalDigest;
  capabilityId: string;
  probeProgramDigest: CanonicalDigest;
  profileProjectionDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  ownerImplementationDigest: CanonicalDigest;
  authorityIssuerId: string;
  previousReceiptDigest: CanonicalDigest | null;
  observedAt: string;
  sourceReceipt: unknown;
  sourceReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeReferenceEntry = Readonly<{
  kind: (typeof AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS)[number];
  receipt: AgentEvaluationCapabilityProbeReferenceReceipt;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeAdmissionAuthorityResult = Readonly<{
  probeEvidence: AgentEvaluationProductionCapabilityProbeEvidence;
  ownerAdmissionDigest: CanonicalDigest;
}>;

export type AgentEvaluationCapabilityProbeSealedObservation =
  AgentEvaluationCapabilityProbeAdmissionAuthorityResult &
    Readonly<{
      referenceBundle: readonly AgentEvaluationCapabilityProbeReferenceEntry[];
    }>;

const fail = (message: string): never => {
  throw new TypeError(`G4_CAPABILITY_PROBE_ADMISSION_INVALID: ${message}`);
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
      new TextEncoder().encode(canonicalJsonText(value)).byteLength <=
      maximumBytes
    );
  } catch {
    return false;
  }
};

const exactProvider = (value: unknown): AgentProviderConfigurationIdentity => {
  if (
    !exactRecord(
      value,
      [
        'providerConfigurationId',
        'providerOperatorId',
        'endpointClass',
        'endpointProfileDigest',
        'adapter',
        'dataPolicyDigest',
      ],
      ['providerRegion', 'apiRevision']
    ) ||
    !exactRecord(value.adapter, [
      'adapterId',
      'adapterVersion',
      'adapterDigest',
      'protocolFamily',
      'transportSchemaDigest',
      'eventNormalizationDigest',
    ]) ||
    !isAgentControlIdentity(value.providerConfigurationId) ||
    !isAgentControlIdentity(value.providerOperatorId) ||
    !['first-party-hosted', 'aggregator', 'self-hosted', 'local'].includes(
      String(value.endpointClass)
    ) ||
    !isAgentCanonicalDigest(value.endpointProfileDigest) ||
    !isAgentCanonicalDigest(value.dataPolicyDigest) ||
    (value.providerRegion !== undefined &&
      !isAgentControlIdentity(value.providerRegion)) ||
    (value.apiRevision !== undefined &&
      !isAgentControlIdentity(value.apiRevision)) ||
    !isAgentControlIdentity(value.adapter.adapterId) ||
    !isAgentControlIdentity(value.adapter.adapterVersion) ||
    ![
      'openai-responses',
      'anthropic-messages',
      'gemini-interactions',
      'openai-compatible',
    ].includes(String(value.adapter.protocolFamily)) ||
    !isAgentCanonicalDigest(value.adapter.adapterDigest) ||
    !isAgentCanonicalDigest(value.adapter.transportSchemaDigest) ||
    !isAgentCanonicalDigest(value.adapter.eventNormalizationDigest) ||
    !canonicalWithin(value, 65_536)
  ) {
    return fail('Provider configuration is invalid.');
  }
  try {
    const candidate = value as unknown as AgentProviderConfigurationIdentity;
    const recreated = createAgentProviderConfigurationIdentity(candidate);
    if (!sameCanonicalJson(recreated, candidate)) {
      return fail('Provider configuration drifted.');
    }
    return Object.freeze({
      ...candidate,
      adapter: Object.freeze({ ...candidate.adapter }),
    });
  } catch {
    return fail('Provider configuration digest drifted.');
  }
};

const exactModel = (value: unknown): AgentModelLineage => {
  if (
    !exactRecord(
      value,
      ['modelId', 'modelFamilyId', 'modelFamilyOwnerId', 'lineageDigest'],
      [
        'immutableVersion',
        'baseModelRef',
        'fineTuneRef',
        'tokenizerDigest',
        'chatTemplateDigest',
        'quantizationDigest',
        'runtimeBackendDigest',
      ]
    ) ||
    !isAgentControlIdentity(value.modelId) ||
    !isAgentControlIdentity(value.modelFamilyId) ||
    !isAgentControlIdentity(value.modelFamilyOwnerId) ||
    !isAgentCanonicalDigest(value.lineageDigest) ||
    !canonicalWithin(value, 65_536)
  ) {
    return fail('Model lineage is invalid.');
  }
  const candidate = value as unknown as AgentModelLineage;
  const { lineageDigest: _lineageDigest, ...base } = candidate;
  try {
    const recreated = createAgentModelLineage(base);
    if (!sameCanonicalJson(recreated, candidate)) {
      return fail('Model lineage digest drifted.');
    }
    return Object.freeze({ ...candidate });
  } catch {
    return fail('Model lineage is invalid.');
  }
};

export const createAgentEvaluationCapabilityProbeAdmissionRequest = (
  input: CreateAgentEvaluationCapabilityProbeAdmissionRequestInput
): AgentEvaluationCapabilityProbeAdmissionRequest => {
  const base = Object.freeze({
    format: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT,
    version: AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION,
    ...input,
    providerConfiguration: Object.freeze({
      ...input.providerConfiguration,
      adapter: Object.freeze({ ...input.providerConfiguration.adapter }),
    }),
    modelLineage: Object.freeze({ ...input.modelLineage }),
    declaredCapabilityProfileDigests: Object.freeze([
      ...input.declaredCapabilityProfileDigests,
    ]),
    probeProgram: Object.freeze({ ...input.probeProgram }),
    probeProviderResourceAuthority:
      input.probeProviderResourceAuthority === null
        ? null
        : Object.freeze({ ...input.probeProviderResourceAuthority }),
  });
  return decodeAgentEvaluationCapabilityProbeAdmissionRequest(
    Object.freeze({
      ...base,
      requestDigest: digestAgentCanonicalValue(base),
    })
  );
};

export const decodeAgentEvaluationCapabilityProbeAdmissionRequest = (
  value: unknown
): AgentEvaluationCapabilityProbeAdmissionRequest => {
  if (
    !exactRecord(value, [
      'format',
      'version',
      'namespaceId',
      'repositoryCommit',
      'providerConfiguration',
      'modelLineage',
      'qualificationCapabilityProfileId',
      'qualificationCapabilityProfileDigest',
      'capabilityId',
      'declaredCapabilityProfileDigests',
      'probeProgram',
      'probeProviderResourceAuthority',
      'minimumExpiresAt',
      'requestDigest',
    ]) ||
    value.format !==
      AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_REQUEST_FORMAT ||
    value.version !== AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION ||
    !isAgentControlIdentity(value.namespaceId) ||
    !exactCommitPattern.test(String(value.repositoryCommit)) ||
    !isAgentControlIdentity(value.qualificationCapabilityProfileId) ||
    !isAgentCanonicalDigest(value.qualificationCapabilityProfileDigest) ||
    !isAgentControlIdentity(value.capabilityId) ||
    capabilityByProfile[value.qualificationCapabilityProfileId] !==
      value.capabilityId ||
    !Array.isArray(value.declaredCapabilityProfileDigests) ||
    value.declaredCapabilityProfileDigests.length < 1 ||
    value.declaredCapabilityProfileDigests.length > 128 ||
    value.declaredCapabilityProfileDigests.some(
      (digest) => !isAgentCanonicalDigest(digest)
    ) ||
    new Set(value.declaredCapabilityProfileDigests).size !==
      value.declaredCapabilityProfileDigests.length ||
    !sameCanonicalJson(
      value.declaredCapabilityProfileDigests,
      [...value.declaredCapabilityProfileDigests].sort(compareUnicodeCodePoints)
    ) ||
    !isAgentControlInstant(value.minimumExpiresAt) ||
    !isAgentCanonicalDigest(value.requestDigest) ||
    !canonicalWithin(value, maximumRequestBytes)
  ) {
    return fail('Admission request is invalid.');
  }
  const providerConfiguration = exactProvider(value.providerConfiguration);
  const modelLineage = exactModel(value.modelLineage);
  if (
    !isAgentCapabilityProbeProgram(value.probeProgram) ||
    value.probeProgram.profileProjection.capabilityProfileId !==
      value.qualificationCapabilityProfileId ||
    value.probeProgram.profileProjection.capabilityProfileDigest !==
      value.qualificationCapabilityProfileDigest ||
    value.probeProgram.profileProjection.capabilityId !== value.capabilityId
  ) {
    return fail('Capability probe program drifted.');
  }
  const resourceRequired =
    value.capabilityId === 'provider.hosted-retrieval' &&
    ['gemini-interactions', 'openai-responses'].includes(
      providerConfiguration.adapter.protocolFamily
    );
  if (
    resourceRequired !== (value.probeProviderResourceAuthority !== null) ||
    (value.probeProviderResourceAuthority !== null &&
      (!isAgentCapabilityProbeProviderResourceAuthority(
        value.probeProviderResourceAuthority,
        value.probeProgram
      ) ||
        value.probeProviderResourceAuthority.protocolFamily !==
          providerConfiguration.adapter.protocolFamily ||
        value.probeProviderResourceAuthority.providerConfigurationId !==
          providerConfiguration.providerConfigurationId ||
        value.probeProviderResourceAuthority.modelId !== modelLineage.modelId ||
        value.probeProviderResourceAuthority.modelLineageDigest !==
          modelLineage.lineageDigest ||
        value.probeProviderResourceAuthority.adapterDigest !==
          providerConfiguration.adapter.adapterDigest ||
        Date.parse(value.probeProviderResourceAuthority.expiresAt) <
          Date.parse(value.minimumExpiresAt)))
  ) {
    return fail('Capability probe provider resource authority drifted.');
  }
  const request =
    value as unknown as AgentEvaluationCapabilityProbeAdmissionRequest;
  const { requestDigest, ...base } = request;
  if (requestDigest !== digestAgentCanonicalValue(base)) {
    return fail('Admission request digest drifted.');
  }
  return Object.freeze({
    ...request,
    providerConfiguration,
    modelLineage,
    probeProgram: Object.freeze({
      ...(request.probeProgram as AgentCapabilityProbeProgram),
    }),
    probeProviderResourceAuthority:
      request.probeProviderResourceAuthority === null
        ? null
        : Object.freeze({ ...request.probeProviderResourceAuthority }),
    declaredCapabilityProfileDigests: Object.freeze([
      ...request.declaredCapabilityProfileDigests,
    ]),
  });
};

export const digestAgentEvaluationCapabilityProbeAdmissionStage = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  ownerImplementationDigest: CanonicalDigest
): CanonicalDigest => {
  decodeAgentEvaluationCapabilityProbeAdmissionRequest(request);
  if (!isAgentCanonicalDigest(ownerImplementationDigest)) {
    return fail('Probe owner implementation digest is invalid.');
  }
  return digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-capability-probe-admission-stage',
    version: 1,
    requestDigest: request.requestDigest,
    ownerImplementationDigest,
  });
};

export const digestAgentEvaluationCapabilityProbeOwnerAdmission = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  evidenceDigest: CanonicalDigest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-capability-probe-owner-admission',
    version: 1,
    requestDigest: request.requestDigest,
    evidenceDigest,
    ownerImplementationDigest,
    stageDigest,
  });

export const digestAgentEvaluationCapabilityProbeDispatchAck = (
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  result: AgentEvaluationCapabilityProbeAdmissionAuthorityResult,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: 'prodivix.agent-evaluation-capability-probe-dispatch-ack',
    version: 1,
    requestDigest: request.requestDigest,
    evidenceDigest: result.probeEvidence.evidenceDigest,
    ownerImplementationDigest,
    ownerAdmissionDigest: result.ownerAdmissionDigest,
    stageDigest,
  });

const evidenceFor = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  ownerImplementationDigest: CanonicalDigest
): AgentEvaluationProductionCapabilityProbeEvidence => {
  if (
    !exactRecord(value, [
      'authorityKind',
      'authorityIssuerId',
      'ownerImplementationDigest',
      'adapterDigest',
      'probeRequestDigest',
      'probeResponseDigest',
      'dispatchReceiptDigest',
      'transportReceiptDigest',
      'responseSpoolDigest',
      'normalizedEventSetDigest',
      'probeProgram',
      'normalizedObservation',
      'receipt',
      'evidenceDigest',
    ]) ||
    !canonicalWithin(value, maximumEvidenceBytes)
  ) {
    return fail('Probe evidence shape is invalid.');
  }
  const candidate =
    value as unknown as AgentEvaluationProductionCapabilityProbeEvidence;
  const { evidenceDigest, ...base } = candidate;
  let recreated: AgentEvaluationProductionCapabilityProbeEvidence;
  try {
    recreated = createAgentEvaluationProductionCapabilityProbeEvidence(base);
  } catch {
    return fail('Probe evidence is invalid.');
  }
  if (
    evidenceDigest !== recreated.evidenceDigest ||
    !sameCanonicalJson(recreated, candidate) ||
    recreated.ownerImplementationDigest !== ownerImplementationDigest ||
    recreated.adapterDigest !==
      request.providerConfiguration.adapter.adapterDigest ||
    !sameCanonicalJson(recreated.probeProgram, request.probeProgram) ||
    recreated.receipt.providerConfigurationDigest !==
      digestAgentCanonicalValue(request.providerConfiguration) ||
    recreated.receipt.modelLineageDigest !==
      request.modelLineage.lineageDigest ||
    recreated.receipt.requestedProfileDigest !==
      request.qualificationCapabilityProfileDigest ||
    recreated.receipt.declaredCapabilityDigest !==
      digestAgentCanonicalValue(request.declaredCapabilityProfileDigests) ||
    Date.parse(recreated.receipt.expiresAt) <
      Date.parse(request.minimumExpiresAt)
  ) {
    return fail('Probe evidence binding drifted.');
  }
  return recreated;
};

export const decodeAgentEvaluationCapabilityProbeReferenceBundle = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  evidence: AgentEvaluationProductionCapabilityProbeEvidence,
  ownerImplementationDigest: CanonicalDigest
): readonly AgentEvaluationCapabilityProbeReferenceEntry[] => {
  if (
    !Array.isArray(value) ||
    value.length !== AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS.length ||
    !canonicalWithin(value, maximumReferenceBundleBytes)
  ) {
    return fail('Probe reference bundle is invalid.');
  }
  const expectedEvidenceDigests = Object.freeze([
    evidence.probeRequestDigest,
    evidence.probeResponseDigest,
    evidence.dispatchReceiptDigest,
    evidence.transportReceiptDigest,
    evidence.responseSpoolDigest,
    evidence.normalizedEventSetDigest,
  ]);
  const providerConfigurationDigest = digestAgentCanonicalValue(
    request.providerConfiguration
  );
  const entries: AgentEvaluationCapabilityProbeReferenceEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (
      !exactRecord(raw, ['kind', 'receipt', 'receiptDigest']) ||
      !exactRecord(raw.receipt, [
        'format',
        'version',
        'admissionRequestDigest',
        'providerConfigurationDigest',
        'modelLineageDigest',
        'qualificationCapabilityProfileDigest',
        'capabilityId',
        'probeProgramDigest',
        'profileProjectionDigest',
        'adapterDigest',
        'ownerImplementationDigest',
        'authorityIssuerId',
        'previousReceiptDigest',
        'observedAt',
        'sourceReceipt',
        'sourceReceiptDigest',
      ]) ||
      raw.kind !== AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_KINDS[index] ||
      raw.receipt.format !==
        AGENT_EVALUATION_CAPABILITY_PROBE_REFERENCE_FORMATS[index] ||
      raw.receipt.version !==
        AGENT_EVALUATION_CAPABILITY_PROBE_ADMISSION_VERSION ||
      raw.receipt.admissionRequestDigest !== request.requestDigest ||
      raw.receipt.providerConfigurationDigest !== providerConfigurationDigest ||
      raw.receipt.modelLineageDigest !== request.modelLineage.lineageDigest ||
      raw.receipt.qualificationCapabilityProfileDigest !==
        request.qualificationCapabilityProfileDigest ||
      raw.receipt.capabilityId !== request.capabilityId ||
      raw.receipt.probeProgramDigest !== request.probeProgram.programDigest ||
      raw.receipt.profileProjectionDigest !==
        request.probeProgram.profileProjectionDigest ||
      raw.receipt.adapterDigest !==
        request.providerConfiguration.adapter.adapterDigest ||
      raw.receipt.ownerImplementationDigest !== ownerImplementationDigest ||
      raw.receipt.authorityIssuerId !== evidence.authorityIssuerId ||
      !isAgentControlIdentity(raw.receipt.authorityIssuerId) ||
      !isAgentControlInstant(raw.receipt.observedAt) ||
      (index === 0
        ? raw.receipt.previousReceiptDigest !== null
        : raw.receipt.previousReceiptDigest !==
          entries[index - 1]!.receiptDigest) ||
      inspectAgentControlJson(
        raw.receipt.sourceReceipt,
        maximumSourceReceiptBytes
      ).length > 0 ||
      !isAgentCanonicalDigest(raw.receipt.sourceReceiptDigest) ||
      raw.receipt.sourceReceiptDigest !==
        digestAgentCanonicalValue(raw.receipt.sourceReceipt) ||
      !isAgentCanonicalDigest(raw.receiptDigest) ||
      raw.receiptDigest !== digestAgentCanonicalValue(raw.receipt) ||
      raw.receiptDigest !== expectedEvidenceDigests[index]
    ) {
      return fail(`Probe reference ${String(index)} drifted.`);
    }
    entries.push(
      Object.freeze({
        kind: raw.kind,
        receipt: Object.freeze({ ...raw.receipt }),
        receiptDigest: raw.receiptDigest,
      }) as AgentEvaluationCapabilityProbeReferenceEntry
    );
  }
  return Object.freeze(entries);
};

export const decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): AgentEvaluationCapabilityProbeAdmissionAuthorityResult => {
  if (
    !exactRecord(value, ['probeEvidence', 'ownerAdmissionDigest']) ||
    !isAgentCanonicalDigest(ownerImplementationDigest) ||
    stageDigest !==
      digestAgentEvaluationCapabilityProbeAdmissionStage(
        request,
        ownerImplementationDigest
      )
  ) {
    return fail('Probe authority result is invalid.');
  }
  const evidence = evidenceFor(
    value.probeEvidence,
    request,
    ownerImplementationDigest
  );
  const expectedOwnerAdmission =
    digestAgentEvaluationCapabilityProbeOwnerAdmission(
      request,
      evidence.evidenceDigest,
      ownerImplementationDigest,
      stageDigest
    );
  if (value.ownerAdmissionDigest !== expectedOwnerAdmission) {
    return fail('Probe owner admission digest drifted.');
  }
  return Object.freeze({
    probeEvidence: evidence,
    ownerAdmissionDigest: expectedOwnerAdmission,
  });
};

/**
 * The ledger owns the six-reference ingress and joins it to the raw owner
 * result before reconciliation. Keeping this decoder separate prevents the
 * 8791 executor from presenting its own evidence references as ledger-sealed
 * authority.
 */
export const decodeAgentEvaluationCapabilityProbeSealedObservation = (
  value: unknown,
  request: AgentEvaluationCapabilityProbeAdmissionRequest,
  ownerImplementationDigest: CanonicalDigest,
  stageDigest: CanonicalDigest
): AgentEvaluationCapabilityProbeSealedObservation => {
  if (
    !exactRecord(value, [
      'probeEvidence',
      'referenceBundle',
      'ownerAdmissionDigest',
    ])
  ) {
    return fail('Sealed probe observation is invalid.');
  }
  const result = decodeAgentEvaluationCapabilityProbeAdmissionAuthorityResult(
    Object.freeze({
      probeEvidence: value.probeEvidence,
      ownerAdmissionDigest: value.ownerAdmissionDigest,
    }),
    request,
    ownerImplementationDigest,
    stageDigest
  );
  return Object.freeze({
    ...result,
    referenceBundle: decodeAgentEvaluationCapabilityProbeReferenceBundle(
      value.referenceBundle,
      request,
      result.probeEvidence,
      ownerImplementationDigest
    ),
  });
};

export const digestAgentEvaluationCapabilityProbeSealedObservation = (
  observation: AgentEvaluationCapabilityProbeSealedObservation
): CanonicalDigest => digestAgentCanonicalValue(observation);
