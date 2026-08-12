import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  cloneAgentControlJson,
  hasExactAgentControlKeys,
  isAgentControlIdentity,
  isAgentControlInstant,
  inspectAgentControlJson,
} from '../control/agentControlValidation';
import type { AgentBudget, CanonicalDigest } from '../domain/agent.types';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  createAgentModelLineage,
  createAgentProviderConfigurationIdentity,
} from '../providers/agentProviderIdentity';
import {
  createAgentCapabilityProbeProgram,
  createAgentCapabilityProbeProgramReceipt,
  isAgentCapabilityProbeProgram,
  isAgentCapabilityProbeProgramObservation,
  resolveAgentCapabilityProbePublicResource,
} from '../providers/agentCapabilityProbeProgram';
import { resolveAgentCapabilityProbeProviderRequestCodecAvailability } from '../providers/agentCapabilityProbeProviderRequest';
import {
  isAgentCapabilityProbeProviderResourceAuthority,
  matchAgentCapabilityProbeProviderResourceCleanupReceipt,
  matchAgentCapabilityProbeProviderResourceAuthority,
} from '../providers/agentCapabilityProbeProviderResource';
import { createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand } from '../providers/agentHostedRetrievalRuntimeResourceLifecycleBudget';
import {
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT,
  createAgentHostedRetrievalRuntimeResourceRegistrationIntent,
} from '../providers/agentHostedRetrievalRuntimeResourceRegistration';
import {
  compareAgentDecimals,
  normalizeAgentDecimal,
} from '../usage/agentUsage';
import type {
  AgentCapabilityQualificationTarget,
  AgentEvaluationContextTier,
  AgentEvaluationEndpointSmokeTarget,
  AgentEvaluationGraderPlan,
  AgentEvaluationIssue,
  AgentEvaluationMetricThreshold,
  AgentEvaluationOptionalCapabilitySupportAuthority,
  AgentEvaluationPrimaryBucket,
  AgentEvaluationProductionCapabilityProbeEvidence,
  AgentEvaluationRuntimeFactSourceAuthority,
  AgentEvaluationRepetitionPolicy,
  AgentEvaluationRepetitionRule,
  AgentEvaluationRiskClass,
  AgentMediaRepresentationTier,
  AgentMediaRepresentationTierName,
  AgentModelEvaluationAttemptDescriptor,
  AgentModelEvaluationBudget,
  AgentModelEvaluationCase,
  AgentModelEvaluationCaseExecutionRequirement,
  AgentModelEvaluationPlan,
  AgentModelEvaluationThresholds,
} from './agentEvaluation.types';
import {
  createAgentEvaluationCapabilityDescriptor,
  isAgentEvaluationCapabilityDescriptor,
} from './agentEvaluationCapabilityExecution';
import { hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity } from './agentEvaluationCapabilitySpecificReceipt';
import { hasExactAgentEvaluationPlanShape } from './agentEvaluationShape';
import { resolveAgentProductionEvaluationQualificationAuthorityBundleFromPlan } from './agentEvaluationQualificationAuthorityBundle';

const bucketRequirements: Readonly<
  Record<
    AgentEvaluationPrimaryBucket,
    Readonly<{ minimumFamilies: number; minimumCases: number }>
  >
> = Object.freeze({
  'positive-cross-domain': Object.freeze({
    minimumFamilies: 12,
    minimumCases: 32,
  }),
  'adversarial-security': Object.freeze({
    minimumFamilies: 20,
    minimumCases: 48,
  }),
  'recovery-repair-reconciliation': Object.freeze({
    minimumFamilies: 8,
    minimumCases: 16,
  }),
  'capability-differential': Object.freeze({
    minimumFamilies: 12,
    minimumCases: 32,
  }),
});

const riskMinimums: Readonly<Record<AgentEvaluationRiskClass, number>> =
  Object.freeze({ ordinary: 10, critical: 30, 'high-assurance': 100 });

const nativeProtocolFamilies = Object.freeze([
  'anthropic-messages',
  'gemini-interactions',
  'openai-responses',
] as const);

const requiredCapabilityProfiles = Object.freeze([
  'g4-core-text-tools',
  'g4-document-input',
  'g4-visual-input',
]);
const evaluationPrimaryBuckets = new Set(Object.keys(bucketRequirements));
const evaluationRiskClasses = new Set(Object.keys(riskMinimums));
const evaluationAccessClasses = new Set([
  'public',
  'protected-holdout',
  'rotating-counterexample',
]);
const evaluationContextTiers = new Set([
  'small',
  'representative',
  'near-limit',
]);
const evaluationMediaTiers = new Set([
  'source-faithful',
  'representative-transform',
  'near-limit-transform',
]);
const providerProtocolFamilies = new Set([
  ...nativeProtocolFamilies,
  'openai-compatible',
]);
const endpointClasses = new Set([
  'first-party-hosted',
  'aggregator',
  'self-hosted',
  'local',
]);
const evaluationGraderKinds = new Set([
  'strict-decoder',
  'deterministic-rule',
  'domain-dry-run',
  'g3-closure',
  'perceptual-metric',
  'model-judge',
  'blind-human-rubric',
]);

const planValidationCache = new WeakMap<
  object,
  readonly AgentEvaluationIssue[]
>();
const plannedDescriptorCache = new WeakMap<
  object,
  readonly AgentModelEvaluationAttemptDescriptor[]
>();

const issue = (
  code: AgentEvaluationIssue['code'],
  path: string,
  message: string
): AgentEvaluationIssue =>
  Object.freeze({ code, path, message, blocking: true });

const canonicalArray = <T>(
  values: readonly T[],
  identity: (value: T) => string
): readonly T[] =>
  Object.freeze(
    values
      .map((value) => Object.freeze(cloneAgentControlJson(value)))
      .sort((left, right) =>
        compareUnicodeCodePoints(identity(left), identity(right))
      )
  );

const assertIdentity = (value: string, label: string): void => {
  if (!isAgentControlIdentity(value)) {
    throw new TypeError(`${label} is not a bounded canonical identity.`);
  }
};

const assertDigest = (value: string, label: string): void => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
};

const assertCount = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} is not a non-negative safe integer.`);
  }
};

const omitDigest = <T extends Record<string, unknown>, K extends keyof T>(
  value: T,
  key: K
): Omit<T, K> => {
  const { [key]: _digest, ...base } = value;
  return base;
};

const executionRequirementKeys = Object.freeze([
  'minimumToolCalls',
  'minimumRepairRounds',
  'minimumTransactions',
  'verificationClosureRequired',
]);

export const createAgentModelEvaluationCaseExecutionRequirement = (
  input: Omit<AgentModelEvaluationCaseExecutionRequirement, 'requirementDigest'>
): AgentModelEvaluationCaseExecutionRequirement => {
  if (!hasExactAgentControlKeys(input, executionRequirementKeys)) {
    throw new TypeError('Evaluation case execution requirement is invalid.');
  }
  assertCount(input.minimumToolCalls, 'Minimum evaluation tool calls');
  assertCount(input.minimumRepairRounds, 'Minimum evaluation repair rounds');
  assertCount(input.minimumTransactions, 'Minimum evaluation transactions');
  if (typeof input.verificationClosureRequired !== 'boolean') {
    throw new TypeError('Evaluation Closure requirement is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    requirementDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentModelEvaluationCase = (
  input: Omit<AgentModelEvaluationCase, 'caseDigest'>
): AgentModelEvaluationCase => {
  assertIdentity(input.caseId, 'Evaluation case id');
  assertIdentity(input.familyId, 'Evaluation family id');
  assertIdentity(input.capabilityProfileId, 'Capability profile id');
  assertDigest(
    input.capabilityDescriptorDigest,
    'Capability descriptor digest'
  );
  if (
    !isAgentEvaluationCapabilityDescriptor(input.capabilityDescriptor) ||
    input.capabilityDescriptor.descriptorDigest !==
      input.capabilityDescriptorDigest ||
    !hasAgentEvaluationCanonicalCapabilitySpecificReceiptCapacity(
      input.capabilityDescriptor.expectedReceiptKinds
    )
  ) {
    throw new TypeError('Evaluation capability descriptor is invalid.');
  }
  assertDigest(input.caseDefinitionDigest, 'Case definition digest');
  assertDigest(input.expectedAuthorityDigest, 'Expected authority digest');
  assertDigest(input.gradingPolicyDigest, 'Grading policy digest');
  const {
    requirementDigest: suppliedRequirementDigest,
    ...executionRequirementInput
  } = input.executionRequirement;
  const executionRequirement =
    createAgentModelEvaluationCaseExecutionRequirement(
      executionRequirementInput
    );
  if (executionRequirement.requirementDigest !== suppliedRequirementDigest) {
    throw new TypeError('Evaluation case execution requirement drifted.');
  }
  if (
    !evaluationPrimaryBuckets.has(input.primaryBucket) ||
    !evaluationRiskClasses.has(input.riskClass) ||
    !evaluationAccessClasses.has(input.access) ||
    typeof input.contextSentinel !== 'boolean' ||
    typeof input.mediaSentinel !== 'boolean' ||
    typeof input.subjectiveVisualQuality !== 'boolean'
  ) {
    throw new TypeError('Evaluation case classification is invalid.');
  }
  if (
    !input.fixtureRef.trim() ||
    input.fixtureRef.length > 2_048 ||
    (input.access === 'protected-holdout' &&
      !input.fixtureRef.startsWith('holdout://')) ||
    (input.access !== 'protected-holdout' &&
      input.fixtureRef.startsWith('holdout://'))
  ) {
    throw new TypeError(
      'Evaluation fixture reference violates its public/holdout boundary.'
    );
  }
  const tags = Object.freeze([...input.tags].sort(compareUnicodeCodePoints));
  if (
    new Set(tags).size !== tags.length ||
    tags.some((tag) => !isAgentControlIdentity(tag))
  ) {
    throw new TypeError('Evaluation case tags must be unique identities.');
  }
  const {
    descriptorDigest: _capabilityDescriptorDigest,
    ...capabilityDescriptorInput
  } = input.capabilityDescriptor;
  const base = Object.freeze({
    ...input,
    capabilityDescriptor: createAgentEvaluationCapabilityDescriptor(
      capabilityDescriptorInput
    ),
    capabilityDescriptorDigest: input.capabilityDescriptorDigest,
    executionRequirement,
    tags,
  });
  return Object.freeze({
    ...base,
    caseDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationContextTier = (
  input: Omit<AgentEvaluationContextTier, 'tierDigest'>
): AgentEvaluationContextTier => {
  assertIdentity(input.caseId, 'Context sentinel case id');
  if (!evaluationContextTiers.has(input.tier)) {
    throw new TypeError('Context sentinel tier is invalid.');
  }
  for (const [label, digest] of [
    ['Context Pack digest', input.contextPackDigest],
    ['Context transform receipt digest', input.transformReceiptDigest],
    ['Context cache receipt digest', input.cacheReceiptDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    tierDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentMediaRepresentationTier = (
  input: Omit<AgentMediaRepresentationTier, 'tierDigest'>
): AgentMediaRepresentationTier => {
  assertIdentity(input.caseId, 'Media sentinel case id');
  if (!evaluationMediaTiers.has(input.tier)) {
    throw new TypeError('Media representation tier is invalid.');
  }
  for (const [label, digest] of [
    [
      'Media representation manifest digest',
      input.representationManifestDigest,
    ],
    ['Media transform receipt digest', input.transformReceiptDigest],
    ['Media omission receipt digest', input.omissionReceiptDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    tierDigest: digestAgentCanonicalValue(base),
  });
};

const capabilityProbeReceiptKeys = Object.freeze([
  'probeId',
  'providerConfigurationDigest',
  'modelLineageDigest',
  'requestedProfileDigest',
  'declaredCapabilityDigest',
  'probedCapabilityDigest',
  'status',
  'observedLimitDigest',
  'probeProgramDigest',
  'profileProjectionDigest',
  'normalizedObservationDigest',
  'probedAt',
  'expiresAt',
  'receiptDigest',
]);

export const createAgentEvaluationProductionCapabilityProbeEvidence = (
  input: Omit<
    AgentEvaluationProductionCapabilityProbeEvidence,
    'evidenceDigest'
  >
): AgentEvaluationProductionCapabilityProbeEvidence => {
  if (
    !hasExactAgentControlKeys(input, [
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
    ]) ||
    input.authorityKind !== 'sealed-provider-capability-probe' ||
    !isAgentControlIdentity(input.authorityIssuerId) ||
    inspectAgentControlJson(input, 65_536).length > 0
  ) {
    throw new TypeError(
      'Production capability probe evidence must be a bounded sealed authority.'
    );
  }
  const receipt = input.receipt;
  if (
    !isAgentCapabilityProbeProgram(input.probeProgram) ||
    !isAgentCapabilityProbeProgramObservation(
      input.normalizedObservation,
      input.probeProgram
    ) ||
    !hasExactAgentControlKeys(receipt, capabilityProbeReceiptKeys, [
      'observedProfileDigest',
    ]) ||
    !isAgentControlIdentity(receipt.probeId) ||
    (receipt.status !== 'supported' && receipt.status !== 'unsupported') ||
    !isAgentControlInstant(receipt.probedAt) ||
    !isAgentControlInstant(receipt.expiresAt) ||
    Date.parse(receipt.expiresAt) <= Date.parse(receipt.probedAt)
  ) {
    throw new TypeError(
      'Production capability probe receipt is invalid or inconclusive.'
    );
  }
  for (const [label, value] of [
    ['Probe owner implementation', input.ownerImplementationDigest],
    ['Probe adapter', input.adapterDigest],
    ['Probe request', input.probeRequestDigest],
    ['Probe response', input.probeResponseDigest],
    ['Probe dispatch receipt', input.dispatchReceiptDigest],
    ['Probe transport receipt', input.transportReceiptDigest],
    ['Probe response spool', input.responseSpoolDigest],
    ['Probe normalized event set', input.normalizedEventSetDigest],
    ['Probe program', receipt.probeProgramDigest],
    ['Probe profile projection', receipt.profileProjectionDigest],
    ['Probe normalized observation', receipt.normalizedObservationDigest],
    ['Probe provider configuration', receipt.providerConfigurationDigest],
    ['Probe model lineage', receipt.modelLineageDigest],
    ['Probe requested profile', receipt.requestedProfileDigest],
    ['Probe declared capability', receipt.declaredCapabilityDigest],
    ['Probe observed capability', receipt.probedCapabilityDigest],
    ['Probe observed limit', receipt.observedLimitDigest],
    ['Probe receipt', receipt.receiptDigest],
  ] as const) {
    assertDigest(value, `${label} digest`);
  }
  if (receipt.observedProfileDigest !== undefined) {
    assertDigest(
      receipt.observedProfileDigest,
      'Probe observed profile digest'
    );
  }
  const { receiptDigest: _receiptDigest, ...receiptBase } = receipt;
  const expectedProbedCapabilityDigest = digestAgentCanonicalValue({
    normalizedObservationDigest: receipt.normalizedObservationDigest,
    observedLimitDigest: receipt.observedLimitDigest,
    observedProfileDigest: receipt.observedProfileDigest ?? null,
    probeProgramDigest: receipt.probeProgramDigest,
    profileProjectionDigest: receipt.profileProjectionDigest,
    status: receipt.status,
  });
  if (
    receipt.receiptDigest !== digestAgentCanonicalValue(receiptBase) ||
    receipt.probedCapabilityDigest !== expectedProbedCapabilityDigest ||
    receipt.probeProgramDigest !== input.probeProgram.programDigest ||
    receipt.profileProjectionDigest !==
      input.probeProgram.profileProjectionDigest ||
    receipt.normalizedObservationDigest !==
      input.normalizedObservation.observationDigest ||
    receipt.providerConfigurationDigest !==
      input.normalizedObservation.providerConfigurationDigest ||
    receipt.modelLineageDigest !==
      input.normalizedObservation.modelLineageDigest ||
    receipt.requestedProfileDigest !==
      input.probeProgram.profileProjection.capabilityProfileDigest ||
    receipt.status !== input.normalizedObservation.status ||
    receipt.observedLimitDigest !==
      input.normalizedObservation.observedLimitDigest ||
    input.adapterDigest !== input.normalizedObservation.adapterDigest ||
    input.probeRequestDigest !==
      input.normalizedObservation.probeRequestDigest ||
    input.probeResponseDigest !==
      input.normalizedObservation.providerResponseDigest ||
    input.normalizedEventSetDigest !==
      input.normalizedObservation.normalizedEventSetDigest ||
    (receipt.status === 'supported'
      ? receipt.observedProfileDigest !== receipt.requestedProfileDigest
      : receipt.observedProfileDigest !== undefined)
  ) {
    throw new TypeError(
      'Production capability probe receipt or observed support digest drifted.'
    );
  }
  const base = Object.freeze({
    authorityKind: input.authorityKind,
    authorityIssuerId: input.authorityIssuerId,
    ownerImplementationDigest: input.ownerImplementationDigest,
    adapterDigest: input.adapterDigest,
    probeRequestDigest: input.probeRequestDigest,
    probeResponseDigest: input.probeResponseDigest,
    dispatchReceiptDigest: input.dispatchReceiptDigest,
    transportReceiptDigest: input.transportReceiptDigest,
    responseSpoolDigest: input.responseSpoolDigest,
    normalizedEventSetDigest: input.normalizedEventSetDigest,
    probeProgram: input.probeProgram,
    normalizedObservation: input.normalizedObservation,
    receipt: Object.freeze({ ...receipt }),
  });
  return Object.freeze({
    ...base,
    evidenceDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationRuntimeFactSourceAuthority = (
  input: Omit<AgentEvaluationRuntimeFactSourceAuthority, 'authorityDigest'>
): AgentEvaluationRuntimeFactSourceAuthority => {
  const requiresHostedRuntimeResourceIntent =
    input.capabilityId === 'provider.hosted-retrieval' &&
    ['openai-responses', 'gemini-interactions'].includes(input.protocolFamily);
  const expectedSourceKind =
    input.capabilityId === 'provider.hosted-retrieval'
      ? 'sealed-hosted-owner-result'
      : [
            'provider.background-job',
            'provider.isolated-cache',
            'provider.reasoning-continuation',
          ].includes(input.capabilityId)
        ? 'sealed-provider-response-metadata'
        : undefined;
  if (
    !hasExactAgentControlKeys(
      input,
      [
        'kind',
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
        'registrationReceiptDigest',
      ],
      ['hostedRetrievalRuntimeResourceRegistrationIntentDigest']
    ) ||
    input.kind !== 'shared-durable-capability' ||
    expectedSourceKind === undefined ||
    input.sourceKind !== expectedSourceKind ||
    ![
      'sealed-hosted-owner-result',
      'sealed-provider-response-metadata',
    ].includes(input.sourceKind) ||
    !providerProtocolFamilies.has(input.protocolFamily) ||
    ![
      input.sourceAuthorityId,
      input.routeBinding,
      input.capabilityProfileId,
      input.capabilityId,
      input.providerConfigurationId,
      input.modelId,
      input.registrationAuthorityIssuerId,
    ].every(isAgentControlIdentity) ||
    ![
      input.sourceAuthorityImplementationDigest,
      input.capabilityProfileDigest,
      input.modelLineageDigest,
      input.adapterDigest,
      input.registrationReceiptDigest,
    ].every(isAgentCanonicalDigest) ||
    requiresHostedRuntimeResourceIntent !==
      (input.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
        undefined) ||
    (input.hostedRetrievalRuntimeResourceRegistrationIntentDigest !==
      undefined &&
      !isAgentCanonicalDigest(
        input.hostedRetrievalRuntimeResourceRegistrationIntentDigest
      )) ||
    inspectAgentControlJson(input, 8_192).length > 0
  ) {
    throw new TypeError(
      'Evaluation runtime fact source authority is invalid or unbounded.'
    );
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

const factBackedOptionalCapabilityIds = new Set([
  'provider.background-job',
  'provider.hosted-retrieval',
  'provider.isolated-cache',
  'provider.reasoning-continuation',
]);

export const createAgentEvaluationOptionalCapabilitySupportAuthority = (
  input: Omit<
    AgentEvaluationOptionalCapabilitySupportAuthority,
    'authorityDigest'
  >
): AgentEvaluationOptionalCapabilitySupportAuthority => {
  if (
    !hasExactAgentControlKeys(
      input,
      [
        'qualificationAuthorityBundleDigest',
        'qualificationCapabilityProfileId',
        'qualificationCapabilityProfileDigest',
        'capabilityId',
        'supportExpectation',
        'declaredCapabilityProfileDigests',
        'probeEvidence',
        'resolvedCapabilityDescriptor',
      ],
      [
        'probeProviderResourceAuthority',
        'probeProviderResourceDeletionAuthorityReceipt',
        'probeProviderResourceCleanupReceipt',
        'runtimeFactSourceAuthority',
      ]
    )
  ) {
    throw new TypeError(
      'Optional capability support authority shape is invalid.'
    );
  }
  assertDigest(
    input.qualificationAuthorityBundleDigest,
    'Optional qualification authority bundle digest'
  );
  assertIdentity(
    input.qualificationCapabilityProfileId,
    'Optional qualification capability profile id'
  );
  assertIdentity(input.capabilityId, 'Optional capability id');
  assertDigest(
    input.qualificationCapabilityProfileDigest,
    'Optional qualification capability profile digest'
  );
  const declaredCapabilityProfileDigests = Object.freeze([
    ...input.declaredCapabilityProfileDigests,
  ]);
  if (
    declaredCapabilityProfileDigests.length === 0 ||
    declaredCapabilityProfileDigests.some(
      (value) => !isAgentCanonicalDigest(value)
    ) ||
    new Set(declaredCapabilityProfileDigests).size !==
      declaredCapabilityProfileDigests.length ||
    !sameCanonicalJson(
      declaredCapabilityProfileDigests,
      [...declaredCapabilityProfileDigests].sort(compareUnicodeCodePoints)
    )
  ) {
    throw new TypeError(
      'Optional declared capability profile digests must be non-empty, unique, and canonical.'
    );
  }
  const { evidenceDigest: suppliedEvidenceDigest, ...probeEvidenceInput } =
    input.probeEvidence;
  const probeEvidence =
    createAgentEvaluationProductionCapabilityProbeEvidence(probeEvidenceInput);
  if (probeEvidence.evidenceDigest !== suppliedEvidenceDigest) {
    throw new TypeError('Optional capability probe evidence digest drifted.');
  }
  const receipt = probeEvidence.receipt;
  const recreatedProgramReceipt = createAgentCapabilityProbeProgramReceipt({
    probeId: receipt.probeId,
    program: probeEvidence.probeProgram,
    observation: probeEvidence.normalizedObservation,
    declaredCapabilityProfileDigests,
    probedAt: receipt.probedAt,
    expiresAt: receipt.expiresAt,
  });
  const supportExpectation =
    receipt.status === 'supported' ? 'required' : 'expected-blocked';
  const {
    descriptorDigest: suppliedDescriptorDigest,
    ...resolvedCapabilityDescriptorInput
  } = input.resolvedCapabilityDescriptor;
  const resolvedCapabilityDescriptor =
    createAgentEvaluationCapabilityDescriptor(
      resolvedCapabilityDescriptorInput
    );
  let runtimeFactSourceAuthority:
    AgentEvaluationRuntimeFactSourceAuthority | undefined;
  if (input.runtimeFactSourceAuthority !== undefined) {
    const { authorityDigest: suppliedAuthorityDigest, ...sourceInput } =
      input.runtimeFactSourceAuthority;
    runtimeFactSourceAuthority =
      createAgentEvaluationRuntimeFactSourceAuthority(sourceInput);
    if (
      runtimeFactSourceAuthority.authorityDigest !== suppliedAuthorityDigest ||
      runtimeFactSourceAuthority.capabilityProfileId !==
        input.qualificationCapabilityProfileId ||
      runtimeFactSourceAuthority.capabilityProfileDigest !==
        input.qualificationCapabilityProfileDigest ||
      runtimeFactSourceAuthority.capabilityId !== input.capabilityId
    ) {
      throw new TypeError(
        'Optional runtime fact source authority drifted from its profile or capability.'
      );
    }
  }
  const probeProviderResourceAuthority = input.probeProviderResourceAuthority;
  const probeProviderResourceDeletionAuthorityReceipt =
    input.probeProviderResourceDeletionAuthorityReceipt;
  const probeProviderResourceCleanupReceipt =
    input.probeProviderResourceCleanupReceipt;
  const retrievalProbe = input.capabilityId === 'provider.hosted-retrieval';
  const providerProtocolFamily = runtimeFactSourceAuthority?.protocolFamily;
  const retrievalCodecAvailable =
    retrievalProbe &&
    providerProtocolFamily !== undefined &&
    providerProtocolFamily !== 'openai-compatible' &&
    resolveAgentCapabilityProbeProviderRequestCodecAvailability(
      providerProtocolFamily,
      input.qualificationCapabilityProfileId as
        | 'g4-provider-hosted-retrieval-core'
        | 'g4-provider-hosted-retrieval-document'
    ).availability === 'available';
  if (
    retrievalCodecAvailable !==
      (probeProviderResourceAuthority !== undefined &&
        probeProviderResourceDeletionAuthorityReceipt !== undefined &&
        probeProviderResourceCleanupReceipt !== undefined) ||
    (probeProviderResourceAuthority !== undefined &&
      probeProviderResourceDeletionAuthorityReceipt !== undefined &&
      probeProviderResourceCleanupReceipt !== undefined &&
      (!isAgentCapabilityProbeProviderResourceAuthority(
        probeProviderResourceAuthority,
        probeEvidence.probeProgram
      ) ||
        !matchAgentCapabilityProbeProviderResourceCleanupReceipt(
          probeProviderResourceCleanupReceipt,
          probeProviderResourceDeletionAuthorityReceipt,
          probeProviderResourceAuthority,
          probeEvidence.probeProgram,
          {
            probeObservedAt: receipt.probedAt,
            plannedAt: receipt.expiresAt,
          }
        )))
  ) {
    throw new TypeError(
      'Optional capability probe provider resource authority is missing or invalid.'
    );
  }
  const factBacked = factBackedOptionalCapabilityIds.has(input.capabilityId);
  if (
    suppliedDescriptorDigest !==
      resolvedCapabilityDescriptor.descriptorDigest ||
    !sameCanonicalJson(receipt, recreatedProgramReceipt) ||
    probeEvidence.probeProgram.profileProjection.capabilityProfileId !==
      input.qualificationCapabilityProfileId ||
    probeEvidence.probeProgram.profileProjection.capabilityId !==
      input.capabilityId ||
    receipt.requestedProfileDigest !==
      input.qualificationCapabilityProfileDigest ||
    receipt.declaredCapabilityDigest !==
      digestAgentCanonicalValue(declaredCapabilityProfileDigests) ||
    input.supportExpectation !== supportExpectation ||
    resolvedCapabilityDescriptor.capabilityId !== input.capabilityId ||
    resolvedCapabilityDescriptor.supportExpectation !== supportExpectation ||
    factBacked !== (runtimeFactSourceAuthority !== undefined) ||
    (supportExpectation === 'required' &&
      !declaredCapabilityProfileDigests.includes(
        input.qualificationCapabilityProfileDigest
      )) ||
    (supportExpectation === 'expected-blocked' &&
      (resolvedCapabilityDescriptor.expectedToolIds.length !== 0 ||
        !sameCanonicalJson(resolvedCapabilityDescriptor.expectedReceiptKinds, [
          'capability-unavailable-receipt',
        ])))
  ) {
    throw new TypeError(
      'Optional capability support authority drifted from its declaration, probe, or resolved descriptor.'
    );
  }
  const base = Object.freeze({
    qualificationAuthorityBundleDigest:
      input.qualificationAuthorityBundleDigest,
    qualificationCapabilityProfileId: input.qualificationCapabilityProfileId,
    qualificationCapabilityProfileDigest:
      input.qualificationCapabilityProfileDigest,
    capabilityId: input.capabilityId,
    supportExpectation,
    declaredCapabilityProfileDigests,
    probeEvidence,
    ...(probeProviderResourceAuthority
      ? { probeProviderResourceAuthority }
      : {}),
    ...(probeProviderResourceDeletionAuthorityReceipt
      ? { probeProviderResourceDeletionAuthorityReceipt }
      : {}),
    ...(probeProviderResourceCleanupReceipt
      ? { probeProviderResourceCleanupReceipt }
      : {}),
    ...(runtimeFactSourceAuthority ? { runtimeFactSourceAuthority } : {}),
    resolvedCapabilityDescriptor,
  });
  return Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentCapabilityQualificationTarget = (
  input: Omit<AgentCapabilityQualificationTarget, 'targetDigest'>
): AgentCapabilityQualificationTarget => {
  for (const [label, value] of [
    ['Evaluation target id', input.targetId],
    ['Provider configuration id', input.providerConfigurationId],
    ['Provider operator id', input.providerOperatorId],
    ['Model id', input.modelId],
    ['Model family owner id', input.modelFamilyOwnerId],
    ['Capability profile id', input.capabilityProfileId],
  ] as const) {
    assertIdentity(value, label);
  }
  if (!providerProtocolFamilies.has(input.protocolFamily)) {
    throw new TypeError('Evaluation target protocol family is invalid.');
  }
  for (const [label, digest] of [
    ['Provider identity digest', input.providerIdentityDigest],
    ['Model lineage digest', input.modelLineageDigest],
    ['Capability profile digest', input.capabilityProfileDigest],
    ['Inference configuration digest', input.inferenceConfigurationDigest],
    ['Qualification slice digest', input.qualificationSliceDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  let optionalCapabilitySupportAuthority:
    AgentEvaluationOptionalCapabilitySupportAuthority | undefined;
  if (input.optionalCapabilitySupportAuthority !== undefined) {
    const { authorityDigest: suppliedAuthorityDigest, ...authorityInput } =
      input.optionalCapabilitySupportAuthority;
    optionalCapabilitySupportAuthority =
      createAgentEvaluationOptionalCapabilitySupportAuthority(authorityInput);
    const receipt = optionalCapabilitySupportAuthority.probeEvidence.receipt;
    if (
      optionalCapabilitySupportAuthority.authorityDigest !==
        suppliedAuthorityDigest ||
      optionalCapabilitySupportAuthority.qualificationCapabilityProfileId !==
        input.capabilityProfileId ||
      optionalCapabilitySupportAuthority.qualificationCapabilityProfileDigest !==
        input.capabilityProfileDigest ||
      receipt.providerConfigurationDigest !== input.providerIdentityDigest ||
      receipt.modelLineageDigest !== input.modelLineageDigest ||
      (optionalCapabilitySupportAuthority.runtimeFactSourceAuthority !==
        undefined &&
        (optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
          .protocolFamily !== input.protocolFamily ||
          optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
            .providerConfigurationId !== input.providerConfigurationId ||
          optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
            .modelId !== input.modelId ||
          optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
            .modelLineageDigest !== input.modelLineageDigest)) ||
      (optionalCapabilitySupportAuthority.supportExpectation === 'required' &&
        resolveAgentCapabilityProbeProviderRequestCodecAvailability(
          input.protocolFamily as
            'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
          input.capabilityProfileId as
            | 'g4-provider-background-job'
            | 'g4-provider-hosted-retrieval-core'
            | 'g4-provider-hosted-retrieval-document'
            | 'g4-provider-isolated-cache'
            | 'g4-provider-parallel-tool'
            | 'g4-provider-reasoning-continuation'
        ).availability !== 'available') ||
      (optionalCapabilitySupportAuthority.probeProviderResourceAuthority !==
        undefined &&
        !matchAgentCapabilityProbeProviderResourceAuthority(
          optionalCapabilitySupportAuthority.probeProviderResourceAuthority,
          optionalCapabilitySupportAuthority.probeEvidence.probeProgram,
          {
            protocolFamily: input.protocolFamily as
              'anthropic-messages' | 'gemini-interactions' | 'openai-responses',
            providerConfigurationId: input.providerConfigurationId,
            modelId: input.modelId,
            modelLineageDigest: input.modelLineageDigest,
            adapterDigest:
              optionalCapabilitySupportAuthority.probeEvidence.adapterDigest,
            authorityDigest:
              optionalCapabilitySupportAuthority.probeProviderResourceAuthority
                .authorityDigest,
            observedAt: receipt.probedAt,
          }
        ))
    ) {
      throw new TypeError(
        'Optional capability target drifted from its declared and probed support authority.'
      );
    }
  }
  const base = Object.freeze({
    ...input,
    ...(optionalCapabilitySupportAuthority
      ? { optionalCapabilitySupportAuthority }
      : {}),
  });
  return Object.freeze({
    ...base,
    targetDigest: digestAgentCanonicalValue(base),
  });
};

export const createAgentEvaluationEndpointSmokeTarget = (
  input: Omit<AgentEvaluationEndpointSmokeTarget, 'targetDigest'>
): AgentEvaluationEndpointSmokeTarget => {
  assertIdentity(input.smokeTargetId, 'Endpoint smoke target id');
  assertIdentity(input.providerConfigurationId, 'Provider configuration id');
  assertIdentity(input.modelId, 'Endpoint smoke model id');
  assertIdentity(
    input.immutableModelVersion,
    'Endpoint smoke immutable model version'
  );
  if (
    ['current', 'latest', 'preview', 'stable'].includes(
      input.immutableModelVersion.toLowerCase()
    )
  ) {
    throw new TypeError(
      'Endpoint smoke model version must be an immutable public identity.'
    );
  }
  if (
    input.protocolFamily !== 'gemini-interactions' &&
    input.modelId !== input.immutableModelVersion
  ) {
    throw new TypeError(
      'Endpoint smoke protocol requires one exact model identity string.'
    );
  }
  assertDigest(input.modelLineageDigest, 'Endpoint smoke model lineage digest');
  assertDigest(
    input.inferenceConfigurationDigest,
    'Endpoint smoke inference configuration digest'
  );
  assertDigest(input.adapterDigest, 'Endpoint smoke adapter digest');
  assertDigest(
    input.pricingAuthorityDigest,
    'Endpoint smoke pricing authority digest'
  );
  assertDigest(
    input.responseSpoolEncryptionPolicyDigest,
    'Endpoint smoke response-spool encryption policy digest'
  );
  assertDigest(input.smokeProfileDigest, 'Endpoint smoke profile digest');
  if (
    !endpointClasses.has(input.endpointClass) ||
    !providerProtocolFamilies.has(input.protocolFamily)
  ) {
    throw new TypeError('Endpoint smoke classification is invalid.');
  }
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    targetDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeRule = (
  input: AgentEvaluationRepetitionRule
): AgentEvaluationRepetitionRule => {
  if (!evaluationRiskClasses.has(input.riskClass)) {
    throw new TypeError('Evaluation repetition risk class is invalid.');
  }
  const minimum = riskMinimums[input.riskClass];
  if (
    !Number.isSafeInteger(input.minimumIndependentAttempts) ||
    input.minimumIndependentAttempts < minimum
  ) {
    throw new TypeError(
      `${input.riskClass} evaluation requires at least ${minimum} independent attempts.`
    );
  }
  const confidenceLevel = normalizeAgentDecimal(input.confidenceLevel);
  if (
    compareAgentDecimals(confidenceLevel, '0') <= 0 ||
    compareAgentDecimals(confidenceLevel, '1') >= 0
  ) {
    throw new TypeError('Evaluation confidence level must be between 0 and 1.');
  }
  const maximumFailureRateBound =
    input.maximumFailureRateBound === undefined
      ? undefined
      : normalizeAgentDecimal(input.maximumFailureRateBound);
  if (
    maximumFailureRateBound !== undefined &&
    compareAgentDecimals(maximumFailureRateBound, '1') > 0
  ) {
    throw new TypeError('Maximum failure-rate bound cannot exceed 1.');
  }
  if (input.sequentialStoppingRuleDigest !== undefined) {
    assertDigest(
      input.sequentialStoppingRuleDigest,
      'Sequential stopping rule digest'
    );
  }
  return Object.freeze({
    riskClass: input.riskClass,
    minimumIndependentAttempts: input.minimumIndependentAttempts,
    confidenceLevel,
    ...(maximumFailureRateBound !== undefined
      ? { maximumFailureRateBound }
      : {}),
    ...(input.sequentialStoppingRuleDigest
      ? { sequentialStoppingRuleDigest: input.sequentialStoppingRuleDigest }
      : {}),
  });
};

export const createAgentEvaluationRepetitionPolicy = (
  input: AgentEvaluationRepetitionPolicy
): AgentEvaluationRepetitionPolicy => {
  assertDigest(
    input.samplingIndependencePolicyDigest,
    'Sampling independence policy digest'
  );
  assertDigest(
    input.cacheAndStateIsolationPolicyDigest,
    'Cache and state isolation policy digest'
  );
  const rules = canonicalArray(
    input.rules.map(normalizeRule),
    (rule) => rule.riskClass
  );
  if (
    rules.length !== 3 ||
    new Set(rules.map(({ riskClass }) => riskClass)).size !== 3
  ) {
    throw new TypeError(
      'Evaluation repetition policy requires all risk rules.'
    );
  }
  const highAssuranceCaseIds = Object.freeze(
    [...input.highAssuranceCaseIds].sort(compareUnicodeCodePoints)
  );
  if (
    highAssuranceCaseIds.length < 12 ||
    new Set(highAssuranceCaseIds).size !== highAssuranceCaseIds.length
  ) {
    throw new TypeError(
      'Evaluation repetition policy requires at least 12 unique high-assurance cases.'
    );
  }
  return Object.freeze({
    rules,
    highAssuranceCaseIds,
    samplingIndependencePolicyDigest: input.samplingIndependencePolicyDigest,
    cacheAndStateIsolationPolicyDigest:
      input.cacheAndStateIsolationPolicyDigest,
  });
};

export const createAgentEvaluationGraderPlan = (
  input: Omit<AgentEvaluationGraderPlan, 'planDigest'>
): AgentEvaluationGraderPlan => {
  assertDigest(input.disagreementPolicyDigest, 'Grader disagreement policy');
  assertDigest(
    input.randomizedPresentationPolicyDigest,
    'Randomized presentation policy'
  );
  if (
    !Number.isSafeInteger(input.minimumIndependentVisualRatings) ||
    input.minimumIndependentVisualRatings < 2
  ) {
    throw new TypeError('Visual quality requires at least two blind ratings.');
  }
  const graders = canonicalArray(input.graders, ({ graderId }) => graderId);
  if (
    new Set(graders.map(({ graderId }) => graderId)).size !== graders.length
  ) {
    throw new TypeError('Evaluation grader identities must be unique.');
  }
  for (const grader of graders) {
    assertIdentity(grader.graderId, 'Grader id');
    assertDigest(grader.configurationDigest, 'Grader configuration digest');
    if (
      !evaluationGraderKinds.has(grader.kind) ||
      !['deterministic', 'auxiliary', 'human'].includes(grader.authority) ||
      grader.testedModelFamilyOwnerIds.some(
        (ownerId) => !isAgentControlIdentity(ownerId)
      ) ||
      new Set(grader.testedModelFamilyOwnerIds).size !==
        grader.testedModelFamilyOwnerIds.length
    ) {
      throw new TypeError('Evaluation grader classification is invalid.');
    }
    if (
      (grader.kind === 'model-judge') !== (grader.authority === 'auxiliary') ||
      (grader.kind === 'blind-human-rubric') !== (grader.authority === 'human')
    ) {
      throw new TypeError('Grader kind and authority are inconsistent.');
    }
  }
  const graderIds = new Set(graders.map(({ graderId }) => graderId));
  const normalizeIds = (ids: readonly string[]): readonly string[] => {
    const normalized = Object.freeze([...ids].sort(compareUnicodeCodePoints));
    if (
      new Set(normalized).size !== normalized.length ||
      normalized.some((id) => !graderIds.has(id))
    ) {
      throw new TypeError(
        'Grader authority list contains an unknown identity.'
      );
    }
    return normalized;
  };
  const base = Object.freeze({
    graders,
    deterministicAuthorityGraderIds: normalizeIds(
      input.deterministicAuthorityGraderIds
    ),
    auxiliaryJudgeGraderIds: normalizeIds(input.auxiliaryJudgeGraderIds),
    blindHumanGraderIds: normalizeIds(input.blindHumanGraderIds),
    minimumIndependentVisualRatings: input.minimumIndependentVisualRatings,
    disagreementPolicyDigest: input.disagreementPolicyDigest,
    randomizedPresentationPolicyDigest:
      input.randomizedPresentationPolicyDigest,
  });
  if (base.deterministicAuthorityGraderIds.length === 0) {
    throw new TypeError('Evaluation requires deterministic grader authority.');
  }
  return Object.freeze({
    ...base,
    planDigest: digestAgentCanonicalValue(base),
  });
};

const normalizeThreshold = (
  threshold: AgentEvaluationMetricThreshold
): AgentEvaluationMetricThreshold => {
  assertIdentity(threshold.metricId, 'Evaluation metric id');
  assertCount(threshold.minimumSampleCount, 'Metric minimum sample count');
  if (
    threshold.minimumSampleCount < 1 ||
    !['deterministic', 'human'].includes(threshold.requiredAuthority)
  ) {
    throw new TypeError(
      'Evaluation metric threshold authority or sample floor is invalid.'
    );
  }
  const maximumObservedFailureRate = normalizeAgentDecimal(
    threshold.maximumObservedFailureRate
  );
  const maximumUpperConfidenceBound =
    threshold.maximumUpperConfidenceBound === undefined
      ? undefined
      : normalizeAgentDecimal(threshold.maximumUpperConfidenceBound);
  for (const value of [
    maximumObservedFailureRate,
    maximumUpperConfidenceBound,
  ]) {
    if (value !== undefined && compareAgentDecimals(value, '1') > 0) {
      throw new TypeError('Evaluation failure-rate threshold cannot exceed 1.');
    }
  }
  return Object.freeze({
    ...threshold,
    maximumObservedFailureRate,
    ...(maximumUpperConfidenceBound !== undefined
      ? { maximumUpperConfidenceBound }
      : {}),
  });
};

export const createAgentModelEvaluationThresholds = (
  input: Omit<AgentModelEvaluationThresholds, 'thresholdsDigest'>
): AgentModelEvaluationThresholds => {
  assertDigest(
    input.multipleComparisonPolicyDigest,
    'Multiple comparison policy digest'
  );
  assertDigest(input.slicePolicyDigest, 'Metric slice policy digest');
  const metrics = canonicalArray(
    input.metrics.map(normalizeThreshold),
    ({ metricId }) => metricId
  );
  if (
    metrics.length === 0 ||
    new Set(metrics.map(({ metricId }) => metricId)).size !== metrics.length
  ) {
    throw new TypeError('Evaluation thresholds require unique metrics.');
  }
  const base = Object.freeze({
    metrics,
    multipleComparisonPolicyDigest: input.multipleComparisonPolicyDigest,
    slicePolicyDigest: input.slicePolicyDigest,
  });
  return Object.freeze({
    ...base,
    thresholdsDigest: digestAgentCanonicalValue(base),
  });
};

const canonicalBudget = (budget: AgentBudget): AgentBudget => {
  const usageLimits = canonicalArray(budget.usageLimits, ({ unit }) => unit);
  const costLimits = canonicalArray(
    budget.costLimits,
    ({ currency }) => currency
  );
  if (
    new Set(usageLimits.map(({ unit }) => unit)).size !== usageLimits.length ||
    new Set(costLimits.map(({ currency }) => currency)).size !==
      costLimits.length ||
    costLimits.some(({ currency }) => !/^[A-Z]{3}$/u.test(currency))
  ) {
    throw new TypeError('Evaluation budget limit identities are invalid.');
  }
  for (const { maximum } of [...usageLimits, ...costLimits]) {
    normalizeAgentDecimal(maximum);
  }
  for (const [label, value] of [
    ['maxModelInvocations', budget.maxModelInvocations],
    ['maxToolCalls', budget.maxToolCalls],
    ['maxRepairRounds', budget.maxRepairRounds],
    ['maxTransactions', budget.maxTransactions],
    ['maxArtifactBytes', budget.maxArtifactBytes],
    ['maxElapsedMs', budget.maxElapsedMs],
  ] as const) {
    assertCount(value, label);
  }
  return Object.freeze({
    ...budget,
    usageLimits,
    costLimits,
  });
};

export const createAgentModelEvaluationBudget = (
  input: Omit<AgentModelEvaluationBudget, 'budgetDigest'>
): AgentModelEvaluationBudget => {
  assertDigest(input.reservePolicyDigest, 'Evaluation reserve policy digest');
  for (const [label, value] of [
    ['maxProviderJobs', input.maxProviderJobs],
    ['maxShards', input.maxShards],
    ['maxHumanRatings', input.maxHumanRatings],
  ] as const) {
    assertCount(value, label);
  }
  if (input.maxShards === 0) {
    throw new TypeError('Evaluation budget requires at least one shard.');
  }
  const base = Object.freeze({
    budget: canonicalBudget(input.budget),
    maxProviderJobs: input.maxProviderJobs,
    maxShards: input.maxShards,
    maxHumanRatings: input.maxHumanRatings,
    reservePolicyDigest: input.reservePolicyDigest,
  });
  return Object.freeze({
    ...base,
    budgetDigest: digestAgentCanonicalValue(base),
  });
};

type ScheduleKey = Readonly<{
  caseId: string;
  capabilityDescriptorDigest: CanonicalDigest;
  targetId: string;
  targetDigest: CanonicalDigest;
  riskClass: AgentEvaluationRiskClass;
  contextTier?: AgentEvaluationContextTier['tier'];
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
  repetitionIndex: number;
}>;

const repetitionCount = (
  policy: AgentEvaluationRepetitionPolicy,
  riskClass: AgentEvaluationRiskClass
): number =>
  policy.rules.find((rule) => rule.riskClass === riskClass)
    ?.minimumIndependentAttempts ?? 0;

const scheduleVariants = (
  evaluationCase: AgentModelEvaluationCase
): readonly Readonly<{
  contextTier?: AgentEvaluationContextTier['tier'];
  mediaRepresentationTier?: AgentMediaRepresentationTierName;
}>[] => {
  const base = Object.freeze({
    ...(evaluationCase.contextSentinel
      ? ({ contextTier: 'representative' as const } as const)
      : {}),
    ...(evaluationCase.mediaSentinel
      ? ({
          mediaRepresentationTier: 'representative-transform' as const,
        } as const)
      : {}),
  });
  return Object.freeze([
    base,
    ...(evaluationCase.contextSentinel
      ? [
          Object.freeze({
            ...base,
            contextTier: 'small' as const,
          }),
          Object.freeze({
            ...base,
            contextTier: 'near-limit' as const,
          }),
        ]
      : []),
    ...(evaluationCase.mediaSentinel
      ? [
          Object.freeze({
            ...base,
            mediaRepresentationTier: 'source-faithful' as const,
          }),
          Object.freeze({
            ...base,
            mediaRepresentationTier: 'near-limit-transform' as const,
          }),
        ]
      : []),
  ]);
};

const optionalProviderCapabilityIds = new Set([
  'provider.background-job',
  'provider.hosted-retrieval',
  'provider.isolated-cache',
  'provider.parallel-tool',
  'provider.reasoning-continuation',
]);

/** Resolves the exact target x case capability contract from sealed probe authority. */
export const resolveAgentEvaluationCapabilityDescriptor = (
  evaluationCase: AgentModelEvaluationCase,
  target: AgentCapabilityQualificationTarget
) => {
  if (evaluationCase.capabilityProfileId !== target.capabilityProfileId) {
    throw new TypeError(
      'Evaluation target and case capability profiles do not match.'
    );
  }
  const authority = target.optionalCapabilitySupportAuthority;
  const optional = optionalProviderCapabilityIds.has(
    evaluationCase.capabilityDescriptor.capabilityId
  );
  if (!authority) {
    if (optional) {
      throw new TypeError(
        'Optional provider capability case requires sealed target support authority.'
      );
    }
    return evaluationCase.capabilityDescriptor;
  }
  if (
    !optional ||
    authority.qualificationCapabilityProfileId !==
      evaluationCase.capabilityProfileId ||
    authority.capabilityId !==
      evaluationCase.capabilityDescriptor.capabilityId ||
    evaluationCase.capabilityDescriptor.supportExpectation !== 'required' ||
    (authority.supportExpectation === 'required' &&
      !sameCanonicalJson(
        authority.resolvedCapabilityDescriptor,
        evaluationCase.capabilityDescriptor
      ))
  ) {
    throw new TypeError(
      'Optional provider capability target authority drifted from its exact case contract.'
    );
  }
  return authority.resolvedCapabilityDescriptor;
};

/** Resolves release-affecting execution minima from typed case and target authority. */
export const resolveAgentModelEvaluationCaseExecutionRequirement = (
  evaluationCase: AgentModelEvaluationCase,
  target: AgentCapabilityQualificationTarget
): AgentModelEvaluationCaseExecutionRequirement => {
  const capabilityDescriptor = resolveAgentEvaluationCapabilityDescriptor(
    evaluationCase,
    target
  );
  const requirement = evaluationCase.executionRequirement;
  return createAgentModelEvaluationCaseExecutionRequirement({
    minimumToolCalls:
      capabilityDescriptor.expectedToolIds.length > 0
        ? requirement.minimumToolCalls
        : 0,
    minimumRepairRounds: capabilityDescriptor.expectedReceiptKinds.includes(
      'repair-round-receipt'
    )
      ? requirement.minimumRepairRounds
      : 0,
    minimumTransactions:
      capabilityDescriptor.supportExpectation === 'required'
        ? requirement.minimumTransactions
        : 0,
    verificationClosureRequired:
      requirement.verificationClosureRequired &&
      capabilityDescriptor.expectedReceiptKinds.includes(
        'verification-closure-receipt'
      ),
  });
};

const createScheduleKeys = (
  cases: readonly AgentModelEvaluationCase[],
  targets: readonly AgentCapabilityQualificationTarget[],
  repetitionPolicy: AgentEvaluationRepetitionPolicy
): readonly ScheduleKey[] => {
  const keys: ScheduleKey[] = [];
  for (const evaluationCase of cases) {
    const matchingTargets = targets.filter(
      ({ capabilityProfileId }) =>
        capabilityProfileId === evaluationCase.capabilityProfileId
    );
    const repetitions = repetitionCount(
      repetitionPolicy,
      evaluationCase.riskClass
    );
    for (const target of matchingTargets) {
      const capabilityDescriptor = resolveAgentEvaluationCapabilityDescriptor(
        evaluationCase,
        target
      );
      for (const variant of scheduleVariants(evaluationCase)) {
        for (
          let repetitionIndex = 0;
          repetitionIndex < repetitions;
          repetitionIndex += 1
        ) {
          keys.push(
            Object.freeze({
              caseId: evaluationCase.caseId,
              capabilityDescriptorDigest: capabilityDescriptor.descriptorDigest,
              targetId: target.targetId,
              targetDigest: target.targetDigest,
              riskClass: evaluationCase.riskClass,
              ...variant,
              repetitionIndex,
            })
          );
        }
      }
    }
  }
  const identity = (key: ScheduleKey): string =>
    [
      key.caseId,
      key.targetId,
      key.riskClass,
      key.contextTier ?? '',
      key.mediaRepresentationTier ?? '',
      String(key.repetitionIndex).padStart(6, '0'),
    ].join('\u0000');
  return Object.freeze(
    keys.sort((left, right) =>
      compareUnicodeCodePoints(identity(left), identity(right))
    )
  );
};

export type AgentModelEvaluationHostedRuntimeBudgetFloor = Readonly<{
  hostedSearchQueryCount: number;
  hostedToolCallCount: number;
  hostedAttemptToolCallCount: number;
  hostedLifecycleToolCallCount: number;
  providerUploadBytes: number;
  providerStorageByteSeconds: number;
}>;

const integerUsageAmount = (
  demand: ReturnType<
    typeof createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand
  >,
  unit:
    'hosted-tool-call' | 'provider-storage-byte-second' | 'provider-upload-byte'
): number => {
  const value = demand.usage.amounts.find(
    (amount) => amount.unit === unit
  )?.logicalAmount;
  if (value === undefined || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError('Hosted lifecycle budget demand is not integral.');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TypeError('Hosted lifecycle budget demand exceeds safe bounds.');
  }
  return parsed;
};

const safeBudgetSum = (left: number, right: number): number => {
  const sum = left + right;
  if (!Number.isSafeInteger(sum) || sum < 0) {
    throw new TypeError('Hosted evaluation budget floor exceeds safe bounds.');
  }
  return sum;
};

/** Derives the exact attempt and exact-four lifecycle demand from frozen plan material. */
export const resolveAgentModelEvaluationHostedRuntimeBudgetFloor = (
  input: Readonly<{
    concreteCases: readonly AgentModelEvaluationCase[];
    capabilityQualificationTargets: readonly AgentCapabilityQualificationTarget[];
    repetitionPolicy: AgentEvaluationRepetitionPolicy;
  }>
): AgentModelEvaluationHostedRuntimeBudgetFloor => {
  const keys = createScheduleKeys(
    input.concreteCases,
    input.capabilityQualificationTargets,
    input.repetitionPolicy
  );
  const targetsById = new Map(
    input.capabilityQualificationTargets.map((target) => [
      target.targetId,
      target,
    ])
  );
  const hostedAttemptToolCallCount = keys.filter(({ targetId }) => {
    const authority =
      targetsById.get(targetId)?.optionalCapabilitySupportAuthority;
    return (
      authority?.capabilityId === 'provider.hosted-retrieval' &&
      authority.supportExpectation === 'required'
    );
  }).length;
  let hostedLifecycleToolCallCount = 0;
  let providerUploadBytes = 0;
  let providerStorageByteSeconds = 0;
  let lifecycleIntentCount = 0;
  for (const target of input.capabilityQualificationTargets) {
    const source =
      target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority;
    if (!source?.hostedRetrievalRuntimeResourceRegistrationIntentDigest) {
      continue;
    }
    if (
      source.capabilityId !== 'provider.hosted-retrieval' ||
      source.sourceKind !== 'sealed-hosted-owner-result' ||
      (source.protocolFamily !== 'gemini-interactions' &&
        source.protocolFamily !== 'openai-responses') ||
      (source.capabilityProfileId !== 'g4-provider-hosted-retrieval-core' &&
        source.capabilityProfileId !== 'g4-provider-hosted-retrieval-document')
    ) {
      throw new TypeError(
        'Hosted runtime budget target identity is inconsistent.'
      );
    }
    const program = createAgentCapabilityProbeProgram({
      capabilityProfileId: source.capabilityProfileId,
      capabilityProfileDigest: source.capabilityProfileDigest,
    });
    const material = resolveAgentCapabilityProbePublicResource(program);
    if (!material) {
      throw new TypeError('Hosted runtime budget material is unavailable.');
    }
    const intent = createAgentHostedRetrievalRuntimeResourceRegistrationIntent({
      providerConfigurationId: source.providerConfigurationId,
      providerConfigurationDigest: target.providerIdentityDigest,
      protocolFamily: source.protocolFamily,
      modelId: source.modelId,
      modelLineageDigest: source.modelLineageDigest,
      adapterDigest: source.adapterDigest,
      capabilityProfileId: source.capabilityProfileId,
      capabilityProfileDigest: source.capabilityProfileDigest,
      probeProgramDigest: program.programDigest,
      publicResourceDescriptorDigest: material.descriptor.descriptorDigest,
    });
    if (
      intent.intentDigest !==
        source.hostedRetrievalRuntimeResourceRegistrationIntentDigest ||
      target.providerConfigurationId !== source.providerConfigurationId ||
      target.modelId !== source.modelId ||
      target.modelLineageDigest !== source.modelLineageDigest
    ) {
      throw new TypeError('Hosted runtime budget intent binding drifted.');
    }
    const demand =
      createAgentHostedRetrievalRuntimeResourceLifecycleBudgetDemand(
        intent,
        material
      );
    hostedLifecycleToolCallCount = safeBudgetSum(
      hostedLifecycleToolCallCount,
      integerUsageAmount(demand, 'hosted-tool-call')
    );
    providerUploadBytes = safeBudgetSum(
      providerUploadBytes,
      integerUsageAmount(demand, 'provider-upload-byte')
    );
    providerStorageByteSeconds = safeBudgetSum(
      providerStorageByteSeconds,
      integerUsageAmount(demand, 'provider-storage-byte-second')
    );
    lifecycleIntentCount += 1;
  }
  if (
    (hostedAttemptToolCallCount > 0 || lifecycleIntentCount > 0) &&
    lifecycleIntentCount !== AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_EXACT_COUNT
  ) {
    throw new TypeError(
      'Hosted runtime budget requires the exact four lifecycle intents.'
    );
  }
  return Object.freeze({
    hostedSearchQueryCount: hostedAttemptToolCallCount,
    hostedToolCallCount: safeBudgetSum(
      hostedAttemptToolCallCount,
      hostedLifecycleToolCallCount
    ),
    hostedAttemptToolCallCount,
    hostedLifecycleToolCallCount,
    providerUploadBytes,
    providerStorageByteSeconds,
  });
};

const validateCorpus = (
  cases: readonly AgentModelEvaluationCase[]
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const caseIds = cases.map(({ caseId }) => caseId);
  if (new Set(caseIds).size !== cases.length) {
    issues.push(issue('AI-8010', '/concreteCases', 'Case ids are not unique.'));
  }
  for (const [bucket, requirement] of Object.entries(bucketRequirements) as [
    AgentEvaluationPrimaryBucket,
    (typeof bucketRequirements)[AgentEvaluationPrimaryBucket],
  ][]) {
    const selected = cases.filter(
      ({ primaryBucket }) => primaryBucket === bucket
    );
    const familyCount = new Set(selected.map(({ familyId }) => familyId)).size;
    const holdoutCount = selected.filter(
      ({ access }) => access === 'protected-holdout'
    ).length;
    if (
      selected.length < requirement.minimumCases ||
      familyCount < requirement.minimumFamilies
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/concreteCases/${bucket}`,
          `${bucket} requires ${requirement.minimumCases} cases across ${requirement.minimumFamilies} families.`
        )
      );
    }
    if (holdoutCount < Math.ceil(selected.length / 4)) {
      issues.push(
        issue(
          'AI-8010',
          `/concreteCases/${bucket}/holdout`,
          'Every primary bucket requires at least 25% protected holdout cases.'
        )
      );
    }
  }
  return Object.freeze(issues);
};

const validateSentinelBindings = (
  input: Readonly<{
    cases: readonly AgentModelEvaluationCase[];
    contextCaseIds: readonly string[];
    mediaCaseIds: readonly string[];
    contextTiers: readonly AgentEvaluationContextTier[];
    mediaTiers: readonly AgentMediaRepresentationTier[];
  }>
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const caseById = new Map(input.cases.map((entry) => [entry.caseId, entry]));
  if (
    input.contextCaseIds.length < 24 ||
    new Set(input.contextCaseIds).size !== input.contextCaseIds.length
  ) {
    issues.push(
      issue(
        'AI-8010',
        '/contextSentinelCaseIds',
        'At least 24 unique Context sentinel cases are required.'
      )
    );
  }
  if (
    input.mediaCaseIds.length < 16 ||
    new Set(input.mediaCaseIds).size !== input.mediaCaseIds.length
  ) {
    issues.push(
      issue(
        'AI-8010',
        '/mediaSentinelCaseIds',
        'At least 16 unique media sentinel cases are required.'
      )
    );
  }
  for (const caseId of input.contextCaseIds) {
    const bound = input.contextTiers.filter((entry) => entry.caseId === caseId);
    if (
      !caseById.get(caseId)?.contextSentinel ||
      new Set(bound.map(({ tier }) => tier)).size !== 3
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/contextTiers/${caseId}`,
          'Every Context sentinel requires three exact independent tier bindings.'
        )
      );
    }
  }
  for (const caseId of input.mediaCaseIds) {
    const bound = input.mediaTiers.filter((entry) => entry.caseId === caseId);
    if (
      !caseById.get(caseId)?.mediaSentinel ||
      new Set(bound.map(({ tier }) => tier)).size !== 3
    ) {
      issues.push(
        issue(
          'AI-8010',
          `/mediaRepresentationTiers/${caseId}`,
          'Every media sentinel requires three exact representation bindings.'
        )
      );
    }
  }
  return Object.freeze(issues);
};

const validateDiversity = (
  providers: AgentModelEvaluationPlan['providerConfigurations'],
  models: AgentModelEvaluationPlan['modelConfigurations'],
  targets: AgentModelEvaluationPlan['capabilityQualificationTargets'],
  smokes: AgentModelEvaluationPlan['endpointSmokeTargets']
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  const providerById = new Map(
    providers.map((provider) => [provider.providerConfigurationId, provider])
  );
  const modelByDigest = new Map(
    models.map((model) => [model.lineageDigest, model])
  );
  const requiredConfigurations = nativeProtocolFamilies.map((family) => {
    const configurations = providers.filter(
      ({ adapter }) => adapter.protocolFamily === family
    );
    if (configurations.length !== 1) {
      issues.push(
        issue(
          'AI-6010',
          `/providerConfigurations/${family}`,
          `Exactly one required ${family} configuration must be frozen.`
        )
      );
    }
    return configurations[0];
  });
  if (
    new Set(
      requiredConfigurations
        .filter(Boolean)
        .map(({ providerOperatorId }) => providerOperatorId)
    ).size !== 3
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/providerConfigurations/providerOperatorId',
        'Required native configurations need three independent operators.'
      )
    );
  }
  const ownerIds = new Set<string>();
  for (const provider of requiredConfigurations.filter(Boolean)) {
    for (const profileId of requiredCapabilityProfiles) {
      const matching = targets.filter(
        (target) =>
          target.providerConfigurationId ===
            provider!.providerConfigurationId &&
          target.capabilityProfileId === profileId
      );
      if (matching.length !== 1) {
        issues.push(
          issue(
            'AI-6010',
            `/capabilityQualificationTargets/${provider!.providerConfigurationId}/${profileId}`,
            'Every required provider/profile slice needs one exact target.'
          )
        );
      }
      const target = matching[0];
      if (target) ownerIds.add(target.modelFamilyOwnerId);
    }
  }
  if (ownerIds.size !== 3) {
    issues.push(
      issue(
        'AI-6010',
        '/modelConfigurations/modelFamilyOwnerId',
        'Required native configurations need three independent model-family owners.'
      )
    );
  }
  for (const target of targets) {
    const provider = providerById.get(target.providerConfigurationId);
    const model = modelByDigest.get(target.modelLineageDigest);
    if (
      !provider ||
      !model ||
      digestAgentCanonicalValue(provider) !== target.providerIdentityDigest ||
      provider.adapter.protocolFamily !== target.protocolFamily ||
      provider.providerOperatorId !== target.providerOperatorId ||
      model.modelId !== target.modelId ||
      model.modelFamilyOwnerId !== target.modelFamilyOwnerId ||
      (target.optionalCapabilitySupportAuthority !== undefined &&
        target.optionalCapabilitySupportAuthority.probeEvidence
          .adapterDigest !== provider.adapter.adapterDigest) ||
      (target.optionalCapabilitySupportAuthority?.runtimeFactSourceAuthority !==
        undefined &&
        target.optionalCapabilitySupportAuthority.runtimeFactSourceAuthority
          .adapterDigest !== provider.adapter.adapterDigest)
    ) {
      issues.push(
        issue(
          'AI-6010',
          `/capabilityQualificationTargets/${target.targetId}`,
          'Evaluation target drifted from its provider/model identity.'
        )
      );
    }
  }
  const compatibleSmokes = smokes.filter(
    ({ protocolFamily }) => protocolFamily === 'openai-compatible'
  );
  for (const smoke of smokes.filter(
    ({ protocolFamily }) => protocolFamily !== 'openai-compatible'
  )) {
    const provider = providerById.get(smoke.providerConfigurationId);
    const model = modelByDigest.get(smoke.modelLineageDigest);
    const coreTarget = targets.find(
      (target) =>
        target.providerConfigurationId === smoke.providerConfigurationId &&
        target.capabilityProfileId === 'g4-core-text-tools'
    );
    if (
      !provider ||
      !model ||
      !coreTarget ||
      provider.adapter.protocolFamily !== smoke.protocolFamily ||
      model.modelId !== smoke.modelId ||
      model.immutableVersion !== smoke.immutableModelVersion ||
      coreTarget.modelLineageDigest !== smoke.modelLineageDigest ||
      coreTarget.inferenceConfigurationDigest !==
        smoke.inferenceConfigurationDigest
    ) {
      issues.push(
        issue(
          'AI-6010',
          `/endpointSmokeTargets/${smoke.smokeTargetId}`,
          'Native endpoint smoke target drifted from its exact provider, model lineage, or core inference identity.'
        )
      );
    }
  }
  if (
    !compatibleSmokes.some(({ endpointClass }) =>
      ['first-party-hosted', 'aggregator'].includes(endpointClass)
    ) ||
    !compatibleSmokes.some(({ endpointClass }) =>
      ['local', 'self-hosted'].includes(endpointClass)
    )
  ) {
    issues.push(
      issue(
        'AI-6010',
        '/endpointSmokeTargets',
        'Generic OpenAI-compatible requires hosted and local/self-hosted smoke targets.'
      )
    );
  }
  return Object.freeze(issues);
};

const validateOptionalCapabilitySupportMatrix = (
  cases: AgentModelEvaluationPlan['concreteCases'],
  targets: AgentModelEvaluationPlan['capabilityQualificationTargets']
): readonly AgentEvaluationIssue[] => {
  const issues: AgentEvaluationIssue[] = [];
  for (const target of targets) {
    const matchingCases = cases.filter(
      ({ capabilityProfileId }) =>
        capabilityProfileId === target.capabilityProfileId
    );
    if (
      target.optionalCapabilitySupportAuthority !== undefined &&
      matchingCases.length === 0
    ) {
      issues.push(
        issue(
          'AI-6010',
          `/capabilityQualificationTargets/${target.targetId}`,
          'Optional capability support authority is orphaned from the frozen case profile.'
        )
      );
      continue;
    }
    for (const evaluationCase of matchingCases) {
      try {
        resolveAgentEvaluationCapabilityDescriptor(evaluationCase, target);
      } catch (caught) {
        issues.push(
          issue(
            'AI-6010',
            `/capabilityQualificationTargets/${target.targetId}/cases/${evaluationCase.caseId}`,
            caught instanceof Error
              ? caught.message
              : 'Optional capability support authority is invalid.'
          )
        );
      }
    }
  }
  return Object.freeze(issues);
};

type PlanInput = Omit<
  AgentModelEvaluationPlan,
  'plannedJourneyCount' | 'plannedAttemptSetDigest' | 'planDigest'
>;

const canonicalizePlanInput = (input: PlanInput): PlanInput => {
  assertIdentity(input.evaluationPlanId, 'Evaluation plan id');
  assertIdentity(input.repositoryCommit, 'Repository commit');
  for (const [label, digest] of [
    ['Policy digest', input.policyDigest],
    ['Context builder digest', input.contextBuilderDigest],
    ['Semantic provider-set digest', input.semanticProviderSetDigest],
    ['Prompt-policy digest', input.promptPolicyDigest],
    ['Output-schema digest', input.outputSchemaDigest],
    ['Tool-registry digest', input.toolRegistryDigest],
    ['Action-registry digest', input.actionRegistryDigest],
    ['Public corpus digest', input.publicCorpusDigest],
    ['Protected holdout manifest digest', input.protectedHoldoutManifestDigest],
    ['Rotating corpus policy digest', input.rotatingCorpusPolicyDigest],
  ] as const) {
    assertDigest(digest, label);
  }
  if (
    !isAgentControlInstant(input.plannedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.plannedAt)
  ) {
    throw new TypeError('Evaluation plan expiry is invalid.');
  }
  const providers = canonicalArray(
    input.providerConfigurations.map((provider) =>
      createAgentProviderConfigurationIdentity(provider)
    ),
    ({ providerConfigurationId }) => providerConfigurationId
  );
  const models = canonicalArray(
    input.modelConfigurations.map((model) =>
      createAgentModelLineage(omitDigest(model, 'lineageDigest'))
    ),
    ({ lineageDigest }) => lineageDigest
  );
  const cases = canonicalArray(
    input.concreteCases.map((entry) =>
      createAgentModelEvaluationCase(omitDigest(entry, 'caseDigest'))
    ),
    ({ caseId }) => caseId
  );
  const contextTiers = canonicalArray(
    input.contextTiers.map((entry) =>
      createAgentEvaluationContextTier(omitDigest(entry, 'tierDigest'))
    ),
    (entry) => `${entry.caseId}\u0000${entry.tier}`
  );
  const mediaTiers = canonicalArray(
    input.mediaRepresentationTiers.map((entry) =>
      createAgentMediaRepresentationTier(omitDigest(entry, 'tierDigest'))
    ),
    (entry) => `${entry.caseId}\u0000${entry.tier}`
  );
  return Object.freeze({
    ...cloneAgentControlJson(input),
    providerConfigurations: providers,
    modelConfigurations: models,
    capabilityQualificationTargets: canonicalArray(
      input.capabilityQualificationTargets.map((entry) =>
        createAgentCapabilityQualificationTarget(
          omitDigest(entry, 'targetDigest')
        )
      ),
      ({ targetId }) => targetId
    ),
    endpointSmokeTargets: canonicalArray(
      input.endpointSmokeTargets.map((entry) =>
        createAgentEvaluationEndpointSmokeTarget(
          omitDigest(entry, 'targetDigest')
        )
      ),
      ({ smokeTargetId }) => smokeTargetId
    ),
    concreteCases: cases,
    contextTiers,
    mediaRepresentationTiers: mediaTiers,
    contextSentinelCaseIds: Object.freeze(
      [...input.contextSentinelCaseIds].sort(compareUnicodeCodePoints)
    ),
    mediaSentinelCaseIds: Object.freeze(
      [...input.mediaSentinelCaseIds].sort(compareUnicodeCodePoints)
    ),
    repetitionPolicy: createAgentEvaluationRepetitionPolicy(
      input.repetitionPolicy
    ),
    graderPlan: createAgentEvaluationGraderPlan(
      omitDigest(input.graderPlan, 'planDigest')
    ),
    thresholds: createAgentModelEvaluationThresholds(
      omitDigest(input.thresholds, 'thresholdsDigest')
    ),
    budget: createAgentModelEvaluationBudget(
      omitDigest(input.budget, 'budgetDigest')
    ),
  });
};

export const validateAgentModelEvaluationPlan = (
  plan: AgentModelEvaluationPlan
): readonly AgentEvaluationIssue[] => {
  const cached = planValidationCache.get(plan as object);
  if (cached) return cached;
  const issues: AgentEvaluationIssue[] = [];
  if (!hasExactAgentEvaluationPlanShape(plan)) {
    const invalidShape = Object.freeze([
      issue('AI-9001', '/', 'Evaluation plan shape or member set is invalid.'),
    ]);
    if (Object.isFrozen(plan)) planValidationCache.set(plan, invalidShape);
    return invalidShape;
  }
  if (inspectAgentControlJson(plan, 16_777_216).length > 0) {
    const unsafe = Object.freeze([
      issue('AI-9001', '/', 'Evaluation plan is not bounded safe JSON.'),
    ]);
    if (Object.isFrozen(plan)) planValidationCache.set(plan, unsafe);
    return unsafe;
  }
  try {
    const {
      planDigest: _planDigest,
      plannedJourneyCount,
      plannedAttemptSetDigest,
      ...input
    } = plan;
    const canonical = canonicalizePlanInput(input);
    if (!sameCanonicalJson(canonical, input)) {
      issues.push(
        issue('AI-9001', '/', 'Evaluation plan is not in canonical order.')
      );
    }
    issues.push(...validateCorpus(canonical.concreteCases));
    issues.push(
      ...validateSentinelBindings({
        cases: canonical.concreteCases,
        contextCaseIds: canonical.contextSentinelCaseIds,
        mediaCaseIds: canonical.mediaSentinelCaseIds,
        contextTiers: canonical.contextTiers,
        mediaTiers: canonical.mediaRepresentationTiers,
      })
    );
    issues.push(
      ...validateDiversity(
        canonical.providerConfigurations,
        canonical.modelConfigurations,
        canonical.capabilityQualificationTargets,
        canonical.endpointSmokeTargets
      )
    );
    issues.push(
      ...validateOptionalCapabilitySupportMatrix(
        canonical.concreteCases,
        canonical.capabilityQualificationTargets
      )
    );
    if (
      canonical.capabilityQualificationTargets.some(
        ({ optionalCapabilitySupportAuthority }) =>
          optionalCapabilitySupportAuthority !== undefined
      )
    ) {
      resolveAgentProductionEvaluationQualificationAuthorityBundleFromPlan(
        canonical
      );
    }
    const highAssurance = canonical.concreteCases
      .filter(({ riskClass }) => riskClass === 'high-assurance')
      .map(({ caseId }) => caseId)
      .sort(compareUnicodeCodePoints);
    if (
      highAssurance.length < 12 ||
      !sameCanonicalJson(
        highAssurance,
        canonical.repetitionPolicy.highAssuranceCaseIds
      )
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/repetitionPolicy/highAssuranceCaseIds',
          'High-assurance case identity must exactly match at least 12 corpus cases.'
        )
      );
    }
    if (
      canonical.concreteCases.some(
        ({ primaryBucket, riskClass }) =>
          primaryBucket === 'adversarial-security' && riskClass === 'ordinary'
      )
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/concreteCases/adversarial-security',
          'Every adversarial/security case must be critical or high-assurance.'
        )
      );
    }
    const keys = createScheduleKeys(
      canonical.concreteCases,
      canonical.capabilityQualificationTargets,
      canonical.repetitionPolicy
    );
    const hostedBudgetFloor =
      resolveAgentModelEvaluationHostedRuntimeBudgetFloor(canonical);
    const usageLimitByUnit = new Map(
      canonical.budget.budget.usageLimits.map((limit) => [limit.unit, limit])
    );
    const hostedUsageFloors = Object.freeze([
      Object.freeze({
        unit: 'hosted-search-query' as const,
        minimum: hostedBudgetFloor.hostedSearchQueryCount,
      }),
      Object.freeze({
        unit: 'hosted-tool-call' as const,
        minimum: hostedBudgetFloor.hostedToolCallCount,
      }),
      Object.freeze({
        unit: 'provider-upload-byte' as const,
        minimum: hostedBudgetFloor.providerUploadBytes,
      }),
      Object.freeze({
        unit: 'provider-storage-byte-second' as const,
        minimum: hostedBudgetFloor.providerStorageByteSeconds,
      }),
    ]);
    if (
      hostedUsageFloors.some(({ unit, minimum }) => {
        const limit = usageLimitByUnit.get(unit);
        return (
          minimum > 0 &&
          (!limit || compareAgentDecimals(limit.maximum, String(minimum)) < 0)
        );
      }) ||
      canonical.budget.budget.maxToolCalls <
        hostedBudgetFloor.hostedAttemptToolCallCount
    ) {
      issues.push(
        issue(
          'AI-6002',
          '/budget',
          'Evaluation budget cannot cover the exact hosted attempt and lifecycle demand floor.'
        )
      );
    }
    const expectedAttemptSetDigest = digestAgentCanonicalValue(keys);
    if (
      plannedJourneyCount !== keys.length ||
      plannedAttemptSetDigest !== expectedAttemptSetDigest ||
      keys.length < 11_640
    ) {
      issues.push(
        issue(
          'AI-8010',
          '/plannedJourneyCount',
          'Evaluation schedule drifted or falls below the 11,640 journey floor.'
        )
      );
    }
    if (
      canonical.budget.budget.maxModelInvocations < keys.length ||
      canonical.budget.maxShards <
        new Set(keys.map(({ targetId }) => targetId)).size ||
      canonical.budget.maxHumanRatings <
        canonical.concreteCases
          .filter(({ subjectiveVisualQuality }) => subjectiveVisualQuality)
          .reduce(
            (total, evaluationCase) =>
              total +
              canonical.capabilityQualificationTargets.filter(
                ({ capabilityProfileId }) =>
                  capabilityProfileId === evaluationCase.capabilityProfileId
              ).length *
                canonical.graderPlan.minimumIndependentVisualRatings,
            0
          )
    ) {
      issues.push(
        issue(
          'AI-6002',
          '/budget',
          'Evaluation budget cannot reserve the frozen attempt/shard schedule.'
        )
      );
    }
    const base = Object.freeze({
      ...canonical,
      plannedJourneyCount,
      plannedAttemptSetDigest,
    });
    if (digestAgentCanonicalValue(base) !== plan.planDigest) {
      issues.push(
        issue('AI-9001', '/planDigest', 'Evaluation plan digest drifted.')
      );
    }
  } catch (caught) {
    issues.push(
      issue(
        'AI-9001',
        '/',
        caught instanceof Error
          ? caught.message
          : 'Evaluation plan semantic validation failed.'
      )
    );
  }
  const result = Object.freeze(
    issues.sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.code, right.code) ||
        compareUnicodeCodePoints(left.message, right.message)
    )
  );
  if (Object.isFrozen(plan)) planValidationCache.set(plan, result);
  return result;
};

export const createAgentModelEvaluationPlan = (
  input: PlanInput
): AgentModelEvaluationPlan => {
  const canonical = canonicalizePlanInput(input);
  const keys = createScheduleKeys(
    canonical.concreteCases,
    canonical.capabilityQualificationTargets,
    canonical.repetitionPolicy
  );
  const base = Object.freeze({
    ...canonical,
    plannedJourneyCount: keys.length,
    plannedAttemptSetDigest: digestAgentCanonicalValue(keys),
  });
  const plan = Object.freeze({
    ...base,
    planDigest: digestAgentCanonicalValue(base),
  });
  const issues = validateAgentModelEvaluationPlan(plan);
  if (issues.length > 0) {
    throw new TypeError(issues.map(({ message }) => message).join('; '));
  }
  return plan;
};

export const isAgentModelEvaluationPlan = (
  value: unknown
): value is AgentModelEvaluationPlan => {
  if (!value || typeof value !== 'object') return false;
  return (
    validateAgentModelEvaluationPlan(value as AgentModelEvaluationPlan)
      .length === 0
  );
};

export const planAgentModelEvaluationAttempts = (
  plan: AgentModelEvaluationPlan
): readonly AgentModelEvaluationAttemptDescriptor[] => {
  const cached = plannedDescriptorCache.get(plan as object);
  if (cached) return cached;
  const issues = validateAgentModelEvaluationPlan(plan);
  if (issues.length > 0) {
    throw new TypeError(
      `Cannot schedule invalid evaluation plan: ${issues.map(({ message }) => message).join('; ')}`
    );
  }
  const descriptors = Object.freeze(
    createScheduleKeys(
      plan.concreteCases,
      plan.capabilityQualificationTargets,
      plan.repetitionPolicy
    ).map((key) => {
      const samplingIdentityDigest = digestAgentCanonicalValue({
        planDigest: plan.planDigest,
        ...key,
      });
      const base = Object.freeze({
        attemptId: `evaluation-attempt:${samplingIdentityDigest.slice('sha256-'.length)}`,
        planDigest: plan.planDigest,
        shardId: `evaluation-shard:${digestAgentCanonicalValue({ targetId: key.targetId }).slice('sha256-'.length)}`,
        caseId: key.caseId,
        capabilityDescriptorDigest: key.capabilityDescriptorDigest,
        targetId: key.targetId,
        targetDigest: key.targetDigest,
        riskClass: key.riskClass,
        ...(key.contextTier ? { contextTier: key.contextTier } : {}),
        ...(key.mediaRepresentationTier
          ? { mediaRepresentationTier: key.mediaRepresentationTier }
          : {}),
        repetitionIndex: key.repetitionIndex,
        samplingIdentityDigest,
      });
      return Object.freeze({
        ...base,
        descriptorDigest: digestAgentCanonicalValue(base),
      });
    })
  );
  if (Object.isFrozen(plan)) plannedDescriptorCache.set(plan, descriptors);
  return descriptors;
};

export const minimumAgentEvaluationJourneyFloor = 11_640;
export const agentEvaluationRequiredCapabilityProfiles =
  requiredCapabilityProfiles;
export const agentEvaluationNativeProtocolFamilies = nativeProtocolFamilies;
