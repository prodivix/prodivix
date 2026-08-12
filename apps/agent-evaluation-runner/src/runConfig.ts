import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import { Buffer } from 'node:buffer';
import {
  AGENT_PRODUCTION_EVALUATION_CANONICAL_CASE_SET_DIGEST,
  AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST,
  AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_METADATA_BYTES,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY,
  AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY_DIGEST,
  AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS,
  AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST,
  AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT,
  createAgentEvaluationCorpusMaterialCatalogFromPublicBasis,
  createAgentEvaluationPublicMaterialCatalogBasis,
  createAgentEvaluationRestrictedMaterialLocator,
  createAgentCapabilityProbeResponseSpoolEncryptionProfile,
  createAgentModelEvaluationBudget,
  createAgentPricingSnapshot,
  createAgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  createAgentProductionEvaluationQualificationAuthorityBundle,
  createAgentProductionEvaluationRuntimeFactSourceIdentity,
  createAgentNativeProviderStateVaultAuthority,
  createAgentProviderAdapterIdentity,
  createAgentProductionReleaseEvaluationPlan,
  digestAgentCanonicalValue,
  G4_V8_MINIMUM_EVALUATION_CORPUS,
  getG4V8PublicEvaluationCaseMaterials,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentCapabilityProbeProgram,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  planAgentModelEvaluationAttempts,
  type AgentEvaluationCorpusMaterialCatalog,
  type AgentCapabilityProbeProgram,
  type AgentCapabilityProbeResponseSpoolEncryptionProfile,
  type AgentEvaluationPublicMaterialCatalogBasis,
  type AgentEvaluationRestrictedMaterialLocator,
  type AgentModelEvaluationBudget,
  type AgentNativeProviderStateVaultAuthority,
  type AgentModelEvaluationPlan,
  type AgentPricingSnapshot,
  type AgentProductionEvaluationAuxiliaryJudgeIdentity,
  type AgentProductionEvaluationCompatibilitySmoke,
  type AgentProductionEvaluationNativeIdentity,
  type AgentProductionEvaluationNativeProtocolFamily,
  type AgentProductionEvaluationPolicyDigests,
  type AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  type AgentProductionEvaluationQualificationAuthorityBundle,
  type AgentProductionEvaluationRuntimeFactSourceIdentity,
  type AgentUsageUnit,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  AGENT_EVALUATION_PROVIDER_DEFINITIONS,
  type AgentEvaluationEnvironment,
} from './config';
import {
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ID,
  AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_REF,
} from './capabilityProbeResponseSpoolKey';
import {
  AGENT_EVALUATION_RUNNER_ERROR_CODES,
  AgentEvaluationRunnerError,
} from './errors';
import {
  AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV,
  AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
  type AgentEvaluationProtectedMaterialEnvelopeFile,
} from './protectedMaterial';
import {
  createAgentEvaluationAttemptRetryPolicy,
  type AgentEvaluationAttemptRetryPolicy,
  type AgentEvaluationRetryableStatus,
} from './attemptExecutor';
import {
  validateAgentEvaluationPublicReviewRubric,
  type AgentEvaluationPublicReviewRubric,
} from './reviewWorkflow';

export const AGENT_EVALUATION_RUN_CONFIG_FORMAT =
  'prodivix.g4-real-model-evaluation-run-config' as const;
export const AGENT_EVALUATION_RUN_CONFIG_VERSION = 1 as const;
export const AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY' as const;
export const AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY' as const;
export const AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_REF =
  'secret.g4-model-eval.attestation.ed25519.v1' as const;
export const AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_ENV =
  'PRODIVIX_G4_MODEL_EVAL_HOSTED_COMPATIBLE_API_KEY' as const;
export const AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_REF =
  'secret.provider.openai-compatible.hosted' as const;
export const AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_ENV =
  'PRODIVIX_G4_MODEL_EVAL_LOCAL_COMPATIBLE_API_KEY' as const;
export const AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_REF =
  'secret.provider.openai-compatible.local' as const;
export const AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_RESULT_SPOOL_KEY_BASE64' as const;
export const AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF =
  'secret.g4-model-eval.result-spool.aes256gcm.v1' as const;
export const AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID =
  'key.g4-model-eval.result-spool.v1' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV =
  'PRODIVIX_G4_MODEL_EVAL_NATIVE_PROVIDER_STATE_VAULT_KEY_BASE64' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ID =
  'g4-model-evaluation-native-provider-state-vault' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_REF =
  'secret://g4-model-evaluation/native-provider-state-vault' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_ID =
  'evaluation.native-provider-state-vault.owner.v1' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_VERSION =
  1 as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AAD_FORMAT =
  'prodivix.agent-native-provider-state-vault-aad' as const;
export const AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_PLAINTEXT_BYTES =
  512 as const;
export const AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID =
  'namespace.g4-model-eval.result-spool.v1' as const;
export const AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_NAMESPACE_ID =
  'namespace.g4-model-eval.endpoint-smoke-result-spool.v1' as const;
export const AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_AAD_FORMAT =
  'prodivix.agent-evaluation-endpoint-smoke-result-spool-aad' as const;
export const AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES =
  16 * 1_024 * 1_024;
export const AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS =
  24 * 60 * 60 * 1_000;

const maximumRunConfigBytes = 1_048_576;
const maximumPlanLifetimeMs = 90 * 24 * 60 * 60 * 1_000;
const minimumPlanLifetimeMs = 60 * 60 * 1_000;
const maximumBudgetCount = 10_000_000;
const maximumBudgetBytes = 1_000_000_000_000;
const maximumShards = 64;
const maximumParallelShards = 8;
const maximumReviewArtifactBytes = 64 * 1_024 * 1_024;

let cachedG4V8PublicMaterialCatalogBasis:
  AgentEvaluationPublicMaterialCatalogBasis | undefined;

const getG4V8PublicMaterialCatalogBasis =
  (): AgentEvaluationPublicMaterialCatalogBasis => {
    cachedG4V8PublicMaterialCatalogBasis ??=
      createAgentEvaluationPublicMaterialCatalogBasis(
        G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
        getG4V8PublicEvaluationCaseMaterials()
      );
    return cachedG4V8PublicMaterialCatalogBasis;
  };

const g4V8CaseMatrixRequiresParallelDomainToolCalls =
  G4_V8_MINIMUM_EVALUATION_CORPUS.cases.some(
    ({ familyId }) => familyId === 'capability.parallel-tool'
  );

const providerKeys = Object.freeze([
  'openaiResponses',
  'anthropicMessages',
  'geminiInteractions',
] as const);

export type AgentEvaluationRunConfigProviderKey = (typeof providerKeys)[number];

const runConfigRootKeys = Object.freeze([
  'format',
  'version',
  'purpose',
  'repositoryCommit',
  'providers',
  'compatibilitySmokes',
  'controlledRuntime',
  'responseSpoolEncryption',
  'capabilityProbeResponseSpoolEncryption',
  'hostedRetrievalRuntimeResourceLifecycleSpool',
  'nativeProviderStateVaultEncryption',
  'endpointSmokeResponseSpoolEncryption',
  'material',
  'policies',
  'graders',
  'thresholds',
  'auxiliaryJudge',
  'budget',
  'planLifetimeMs',
  'execution',
  'attestation',
] as const);

const pricingAuthorityKeys = Object.freeze([
  ...providerKeys,
  'hostedCompatibility',
  'localCompatibility',
] as const);

export type AgentEvaluationRunConfigPricingAuthorityKey =
  (typeof pricingAuthorityKeys)[number];

const protocolByProviderKey: Readonly<
  Record<
    AgentEvaluationRunConfigProviderKey,
    AgentProductionEvaluationNativeProtocolFamily
  >
> = Object.freeze({
  openaiResponses: 'openai-responses',
  anthropicMessages: 'anthropic-messages',
  geminiInteractions: 'gemini-interactions',
});

const requiredUsageUnits = Object.freeze([
  'text-token-input',
  'text-token-output',
  'image-pixel',
  'document-page',
  'hosted-search-query',
  'hosted-tool-call',
  'provider-upload-byte',
  'sandbox-compute-second',
  'provider-storage-byte-second',
  'generated-artifact-byte',
] as const satisfies readonly AgentUsageUnit[]);

const allowedUsageUnits = new Set<AgentUsageUnit>([
  'text-token-input',
  'text-token-output',
  'reasoning-token',
  'cache-read-token',
  'cache-write-token',
  'image',
  'image-pixel',
  'media-source-byte',
  'media-processed-byte',
  'document-page',
  'document-rendered-pixel',
  'ocr-character',
  'audio-second',
  'audio-sample',
  'video-second',
  'video-input-frame',
  'video-frame',
  'transform-compute-millisecond',
  'transform-memory-byte-second',
  'provider-upload-byte',
  'hosted-search-query',
  'hosted-tool-call',
  'sandbox-compute-second',
  'provider-storage-byte-second',
  'generated-artifact',
  'generated-artifact-byte',
]);

type AgentEvaluationPricingProtocolFamily =
  AgentProductionEvaluationNativeProtocolFamily | 'openai-compatible';

const pricingUnitsByProtocol = Object.freeze({
  'openai-responses': Object.freeze([
    'cache-read-token',
    'reasoning-token',
    'text-token-input',
    'text-token-output',
  ]),
  'anthropic-messages': Object.freeze([
    'cache-read-token',
    'cache-write-token',
    'text-token-input',
    'text-token-output',
  ]),
  'gemini-interactions': Object.freeze([
    'cache-read-token',
    'reasoning-token',
    'text-token-input',
    'text-token-output',
  ]),
  'openai-compatible': Object.freeze([
    'cache-read-token',
    'reasoning-token',
    'text-token-input',
    'text-token-output',
  ]),
} as const satisfies Readonly<
  Record<AgentEvaluationPricingProtocolFamily, readonly AgentUsageUnit[]>
>);

const retryableStatuses = new Set<AgentEvaluationRetryableStatus>([
  'provider-error',
  'timed-out',
  'rate-limited',
  'schema-failed',
  'infrastructure-error',
]);

type ProviderSecretBinding = Readonly<{
  secretEnvironmentName: string;
  secretRef: string;
}>;

export type AgentEvaluationRunConfigProvider = Omit<
  AgentProductionEvaluationNativeIdentity,
  'protocolFamily'
> &
  ProviderSecretBinding &
  Readonly<{ pricing: AgentEvaluationFrozenPricingAuthority }>;

export type AgentEvaluationFrozenPricingAuthority = Readonly<{
  providerConfigurationId: string;
  modelId: string;
  immutableModelVersion: string;
  modelTier: string;
  source: Readonly<{
    sourceUri: string;
    observedAt: string;
    sourceContentDigest: CanonicalDigest;
    sourceReceiptDigest: CanonicalDigest;
  }>;
  snapshot: AgentPricingSnapshot;
  authorityDigest: CanonicalDigest;
}>;

export type AgentEvaluationRunConfigRestrictedEnvelopeLocator = Readonly<{
  caseId: string;
  resolverRef: string;
  relativePath: string;
  encryptedMaterialDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
}>;

export type AgentEvaluationFrozenRestrictedEnvelopeLocator = Readonly<{
  locator: AgentEvaluationRestrictedMaterialLocator;
  relativePath: string;
}>;

export type AgentEvaluationCompatibilitySmokeRuntime = Readonly<{
  providerConfigurationId: string;
  endpoint: string;
  endpointId: string;
  region: string;
  modelId: string;
  immutableModelVersion: string;
  modelLineageDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  adapterDigest: CanonicalDigest;
  redirectPolicy: 'deny';
  authentication: Readonly<{
    mode: 'bearer-secret-ref';
    secretEnvironmentName:
      | typeof AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_ENV
      | typeof AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_ENV;
    secretRef:
      | typeof AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_REF
      | typeof AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_REF;
  }>;
  request: Readonly<{
    apiShape: 'chat-completions';
    prompt: string;
    expectedText: 'PRODIVIX_G4_SMOKE_OK';
    maximumOutputTokens: number;
    temperature: '0';
    requestProfileDigest: CanonicalDigest;
  }>;
  pricing: AgentEvaluationFrozenPricingAuthority;
  runtimeDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledRuntimeConfiguration = Readonly<{
  authorityId: string;
  runtimeImplementationDigest: CanonicalDigest;
  artifactResolutionPolicyDigest: CanonicalDigest;
  proposalValidationPolicyDigest: CanonicalDigest;
  isolationPolicyDigest: CanonicalDigest;
  g3VerificationPolicyDigest: CanonicalDigest;
  controlledRenderPolicyDigest: CanonicalDigest;
  loop: Readonly<{
    domainToolChoice: 'required';
    allowParallelDomainToolCalls: boolean;
    maximumTurnsPerAttempt: number;
    maximumToolCallsPerAttempt: number;
    maximumRepairRoundsPerAttempt: number;
    maximumToolResultBytes: number;
    maximumAggregateToolResultBytes: number;
    maximumAggregateArtifactBytes: number;
    continuationTimeoutMs: number;
    loopPolicyDigest: CanonicalDigest;
  }>;
  runtimePolicyDigest: CanonicalDigest;
}>;

type AgentEvaluationResponseSpoolEncryptionProfileBase<
  TFormat extends string,
  TAadFormat extends string,
  TNamespaceId extends string,
  TDisposition extends string,
> = Readonly<{
  format: TFormat;
  version: 1;
  algorithm: 'AES-256-GCM';
  nonceBytes: 12;
  authenticationTagBytes: 16;
  aadFormat: TAadFormat;
  aadVersion: 1;
  namespaceId: TNamespaceId;
  namespaceDigest: CanonicalDigest;
  keyId: typeof AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID;
  keyVersion: 1;
  keyEnvironmentName: typeof AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV;
  keyRef: typeof AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF;
  keyRefDigest: CanonicalDigest;
  maximumPlaintextBytes: typeof AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES;
  retention: Readonly<{
    maximumAgeMs: typeof AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS;
    disposition: TDisposition;
    retentionPolicyDigest: CanonicalDigest;
  }>;
  encryptionProfileDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
}>;

export type AgentEvaluationResponseSpoolEncryptionProfile =
  AgentEvaluationResponseSpoolEncryptionProfileBase<
    'prodivix.g4-model-evaluation-response-spool-encryption',
    'prodivix.agent-evaluation-provider-result-spool-aad',
    typeof AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID,
    'delete-after-durable-attempt-commit-or-maximum-age'
  >;

export type AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile =
  AgentEvaluationResponseSpoolEncryptionProfileBase<
    'prodivix.g4-endpoint-smoke-response-spool-encryption',
    typeof AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_AAD_FORMAT,
    typeof AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_NAMESPACE_ID,
    'delete-after-durable-endpoint-smoke-commit-or-maximum-age'
  >;

export type AgentEvaluationNativeProviderStateVaultEncryptionProfile =
  Readonly<{
    format: 'prodivix.g4-native-provider-state-vault-encryption-profile';
    version: 1;
    algorithm: 'aes-256-gcm';
    nonceBytes: 12;
    authenticationTagBytes: 16;
    aadFormat: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AAD_FORMAT;
    aadVersion: 1;
    maximumPlaintextBytes: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_PLAINTEXT_BYTES;
    keyId: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ID;
    keyVersion: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_VERSION;
    keyEnvironmentName: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV;
    keyRef: typeof AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_REF;
    keyRefDigest: CanonicalDigest;
    retention: Readonly<{
      maximumAgeMs: typeof AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS;
      disposition: 'expire-after-source-seal-or-maximum-lifetime';
      retentionPolicyDigest: CanonicalDigest;
    }>;
    deletionReceiptPolicy: Readonly<{
      plaintextResidency: 'callback-only';
      encryptedReferenceDisposition: 'cryptographic-expiry';
      deletionReceipt: 'source-seal-or-expiry-authority';
      deletionReceiptPolicyDigest: CanonicalDigest;
    }>;
    encryptionProfileDigest: CanonicalDigest;
    authority: AgentNativeProviderStateVaultAuthority;
    encryptionPolicyDigest: CanonicalDigest;
  }>;

export const AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_PROFILE_FORMAT =
  'prodivix.g4-model-evaluation-hosted-retrieval-runtime-resource-lifecycle-spool-profile' as const;

export type AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile =
  Readonly<{
    format: typeof AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_PROFILE_FORMAT;
    version: 1;
    keyReference: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY;
    keyRefDigest: CanonicalDigest;
    encryptionProfile: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE;
    encryptionProfileDigest: CanonicalDigest;
    retentionPolicy: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY;
    retentionPolicyDigest: CanonicalDigest;
    maximumMetadataBytes: typeof AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_METADATA_BYTES;
    profileDigest: CanonicalDigest;
  }>;

export type AgentEvaluationRunExecutionSettings = Readonly<{
  shard: Readonly<{
    count: number;
    maximumParallel: number;
    leaseDurationMs: number;
  }>;
  checkpoint: Readonly<{
    completedAttemptInterval: number;
    maximumIntervalMs: number;
  }>;
  retry: AgentEvaluationAttemptRetryPolicy;
  humanReview: Readonly<{
    minimumIndependentRatings: number;
    reviewerAuthorityIds: readonly string[];
    adjudicationAuthorityId: string;
    artifactMaximumBytes: number;
    reviewerTrustRegistryDigest: CanonicalDigest;
    randomizedPresentationPolicyDigest: CanonicalDigest;
    publicRubrics: readonly AgentEvaluationPublicReviewRubric[];
    trustRegistry: AgentEvaluationHumanReviewTrustRegistry;
    adjudicationPolicy: AgentEvaluationHumanReviewAdjudicationPolicy;
  }>;
}>;

export type AgentEvaluationHumanReviewTrustAuthority = Readonly<{
  authorityId: string;
  pseudonym: string;
  role: 'reviewer' | 'adjudicator';
  keyId: string;
  publicKeyBase64Url: string;
  validFrom: string;
  validUntil: string;
  independencePolicyDigest: CanonicalDigest;
  authorityDigest: CanonicalDigest;
}>;

export type AgentEvaluationHumanReviewTrustRegistry = Readonly<{
  format: 'prodivix.g4-human-review-trust-registry';
  version: 1;
  registryId: string;
  authorities: readonly AgentEvaluationHumanReviewTrustAuthority[];
  authoritySetDigest: CanonicalDigest;
  registryDigest: CanonicalDigest;
}>;

export type AgentEvaluationHumanReviewAdjudicationPolicy = Readonly<{
  minimumIndependentRatings: number;
  reviewerAuthorityIds: readonly string[];
  adjudicationAuthorityId: string;
  adjudicatorKeyId: string;
  trigger: 'reviewer-disagreement';
  trustRegistryDigest: CanonicalDigest;
  independencePolicyDigest: CanonicalDigest;
  consensusRule: 'unanimous';
  disagreementRule: 'escalate-to-independent-adjudicator';
  reviewerRatingSignaturesRequired: true;
  adjudicatorDecisionSignatureRequired: true;
  signatureAlgorithm: 'Ed25519';
  decisionPayloadFields: readonly string[];
  policyDigest: CanonicalDigest;
}>;

export type AgentEvaluationRunAttestation = Readonly<{
  authorityId: string;
  keyId: string;
  algorithm: 'Ed25519';
  privateKeyEnvironmentName: typeof AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_ENV;
  privateKeyRef: typeof AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_REF;
}>;

export type AgentEvaluationFrozenRunConfig = Readonly<{
  format: typeof AGENT_EVALUATION_RUN_CONFIG_FORMAT;
  version: typeof AGENT_EVALUATION_RUN_CONFIG_VERSION;
  purpose: 'template' | 'production';
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  plan: AgentModelEvaluationPlan;
  qualificationAuthorityBundle: AgentProductionEvaluationQualificationAuthorityBundle;
  probeProviderResourceAuthorityBundle: AgentProductionEvaluationProbeProviderResourceAuthorityBundle;
  providers: Readonly<
    Record<
      AgentEvaluationRunConfigProviderKey,
      Readonly<{
        protocolFamily: AgentProductionEvaluationNativeProtocolFamily;
        providerConfigurationId: string;
        modelId: string;
        secretEnvironmentName: string;
        secretRef: string;
      }>
    >
  >;
  pricingAuthorities: Readonly<
    Record<
      AgentEvaluationRunConfigPricingAuthorityKey,
      AgentEvaluationFrozenPricingAuthority
    >
  >;
  materialCatalog: AgentEvaluationCorpusMaterialCatalog;
  compatibilitySmokeRuntimes: Readonly<{
    hosted: AgentEvaluationCompatibilitySmokeRuntime;
    local: AgentEvaluationCompatibilitySmokeRuntime;
  }>;
  controlledRuntime: AgentEvaluationControlledRuntimeConfiguration;
  responseSpoolEncryption: AgentEvaluationResponseSpoolEncryptionProfile;
  capabilityProbeResponseSpoolEncryption: AgentCapabilityProbeResponseSpoolEncryptionProfile;
  hostedRetrievalRuntimeResourceLifecycleSpool: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile;
  nativeProviderStateVaultEncryption: AgentEvaluationNativeProviderStateVaultEncryptionProfile;
  endpointSmokeResponseSpoolEncryption: AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile;
  restrictedEnvelopeLocators: readonly AgentEvaluationFrozenRestrictedEnvelopeLocator[];
  holdoutDirectoryEnvironmentName: typeof AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV;
  holdoutKeyEnvironmentName: typeof AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV;
  holdoutKeyRef: typeof AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF;
  execution: AgentEvaluationRunExecutionSettings;
  attestation: AgentEvaluationRunAttestation;
}>;

export type AgentEvaluationProductionFrozenRunConfig =
  AgentEvaluationFrozenRunConfig & Readonly<{ purpose: 'production' }>;

export type AgentEvaluationRunConfigClock = () => string | Date;

export type DecodeAgentEvaluationFrozenRunConfigOptions = Readonly<{
  clock: AgentEvaluationRunConfigClock;
  expectedRepositoryCommit?: string;
}>;

export type AgentEvaluationRunConfigQualificationTemplate = Readonly<{
  format: typeof AGENT_EVALUATION_RUN_CONFIG_FORMAT;
  version: typeof AGENT_EVALUATION_RUN_CONFIG_VERSION;
  purpose: 'template';
  repositoryCommit: string;
  planLifetimeMs: number;
  sourceConfigDigest: CanonicalDigest;
  nativeIdentities: readonly AgentProductionEvaluationNativeIdentity[];
  capabilityProbeResponseSpoolEncryption: AgentCapabilityProbeResponseSpoolEncryptionProfile;
  hostedRetrievalRuntimeResourceLifecycleSpool: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile;
  nativeProviderStateVaultEncryption: AgentEvaluationNativeProviderStateVaultEncryptionProfile;
}>;

export type DecodeAgentEvaluationRunConfigQualificationTemplateOptions =
  Readonly<{
    expectedRepositoryCommit?: string;
  }>;

const invalidConfiguration = (): AgentEvaluationRunnerError =>
  new AgentEvaluationRunnerError(
    AGENT_EVALUATION_RUNNER_ERROR_CODES.configurationInvalid
  );

const fail = (): never => {
  throw invalidConfiguration();
};

const exact = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> => {
  if (!hasExactAgentControlKeys(value, required, optional)) fail();
  return value as Record<string, unknown>;
};

const identity = (value: unknown): string => {
  if (!isAgentControlIdentity(value)) fail();
  return value as string;
};

const digest = (value: unknown): CanonicalDigest => {
  if (!isAgentCanonicalDigest(value)) fail();
  return value as CanonicalDigest;
};

const boundedInteger = (
  value: unknown,
  minimum: number,
  maximum: number
): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail();
  }
  return value as number;
};

const positiveDecimal = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length > 64 ||
    !/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/u.test(value) ||
    /^0(?:\.0+)?$/u.test(value)
  ) {
    fail();
  }
  return value as string;
};

const mutableVersionSuffix =
  /(?:^|[._:/-])(?:current|latest|preview|stable)$/iu;

const immutableIdentity = (value: unknown): string => {
  const result = identity(value);
  if (mutableVersionSuffix.test(result)) fail();
  return result;
};

const secretLookingText =
  /(?:\bBearer\s+[A-Za-z0-9._~+/=-]{8,}|\bsk-(?:ant-)?[A-Za-z0-9_-]{8,}|\bAIza[A-Za-z0-9_-]{20,}|\bxox[baprs]-[A-Za-z0-9-]{8,}|\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{8,}|\bgithub_pat_[A-Za-z0-9_]{8,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----|https?:\/\/[^\s/@:]+:[^\s/@]+@)/iu;

const rejectSecretLookingValues = (value: unknown): void => {
  const visit = (candidate: unknown): void => {
    if (typeof candidate === 'string') {
      if (secretLookingText.test(candidate)) fail();
      return;
    }
    if (Array.isArray(candidate)) {
      for (const entry of candidate) visit(entry);
      return;
    }
    if (candidate && typeof candidate === 'object') {
      for (const entry of Object.values(candidate)) visit(entry);
    }
  };
  visit(value);
};

const deepFreeze = <T>(value: T, seen = new Set<object>()): T => {
  if (value === null || typeof value !== 'object' || seen.has(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
};

const parseJson = (input: string | Uint8Array | unknown): unknown => {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) {
    if (inspectAgentControlJson(input, maximumRunConfigBytes).length > 0)
      fail();
    return input;
  }
  let text: string;
  try {
    if (typeof input === 'string') {
      if (new TextEncoder().encode(input).byteLength > maximumRunConfigBytes)
        fail();
      text = input;
    } else {
      if (input.byteLength > maximumRunConfigBytes) fail();
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    }
    const parsed: unknown = JSON.parse(text);
    if (inspectAgentControlJson(parsed, maximumRunConfigBytes).length > 0)
      fail();
    return parsed;
  } catch {
    fail();
  }
};

const parsePricingSourceUri = (value: unknown): string => {
  const sourceUri = boundedPublicText(value, 12, 2_048);
  const url = (() => {
    try {
      return new URL(sourceUri);
    } catch {
      return fail();
    }
  })();
  if (
    url.protocol !== 'https:' ||
    url.href !== sourceUri ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    fail();
  }
  return sourceUri;
};

const parsePricingAuthority = (
  protocolFamily: AgentEvaluationPricingProtocolFamily,
  providerConfigurationId: string,
  modelId: string,
  immutableModelVersion: string,
  region: string,
  value: unknown
): AgentEvaluationFrozenPricingAuthority => {
  const record = exact(value, [
    'modelTier',
    'source',
    'snapshot',
    'authorityDigest',
  ]);
  const modelTier = immutableIdentity(record.modelTier);
  const sourceRecord = exact(record.source, [
    'sourceUri',
    'observedAt',
    'sourceContentDigest',
    'sourceReceiptDigest',
  ]);
  const observedAt = isAgentControlInstant(sourceRecord.observedAt)
    ? sourceRecord.observedAt
    : fail();
  const sourceBase = Object.freeze({
    sourceUri: parsePricingSourceUri(sourceRecord.sourceUri),
    observedAt,
    sourceContentDigest: digest(sourceRecord.sourceContentDigest),
  });
  const source = Object.freeze({
    ...sourceBase,
    sourceReceiptDigest: digestAgentCanonicalValue({
      format: 'prodivix.g4-pricing-source-observation',
      version: 1,
      ...sourceBase,
    }),
  });
  if (sourceRecord.sourceReceiptDigest !== source.sourceReceiptDigest) fail();

  const snapshotRecord = exact(record.snapshot, [
    'pricingSnapshotId',
    'providerConfigurationId',
    'serviceTier',
    'region',
    'effectiveAt',
    'rates',
    'sourceDigest',
    'snapshotDigest',
  ]);
  if (
    snapshotRecord.providerConfigurationId !== providerConfigurationId ||
    snapshotRecord.serviceTier !== modelTier ||
    snapshotRecord.region !== region ||
    snapshotRecord.sourceDigest !== source.sourceContentDigest ||
    !isAgentControlInstant(snapshotRecord.effectiveAt) ||
    !Array.isArray(snapshotRecord.rates)
  ) {
    fail();
  }
  const allowedPricingUnits: ReadonlySet<AgentUsageUnit> = new Set(
    pricingUnitsByProtocol[protocolFamily]
  );
  const rates = (snapshotRecord.rates as unknown[]).map((entry) => {
    const rate = exact(entry, ['unit', 'currency', 'unitPrice']);
    if (
      typeof rate.unit !== 'string' ||
      !allowedPricingUnits.has(rate.unit as AgentUsageUnit) ||
      rate.currency !== 'USD'
    ) {
      fail();
    }
    return Object.freeze({
      unit: rate.unit as AgentUsageUnit,
      currency: 'USD',
      unitPrice: positiveDecimal(rate.unitPrice),
    });
  });
  if (
    !sameCanonicalJson(
      rates.map(({ unit }) => unit),
      pricingUnitsByProtocol[protocolFamily]
    )
  ) {
    fail();
  }
  const effectiveAt = isAgentControlInstant(snapshotRecord.effectiveAt)
    ? snapshotRecord.effectiveAt
    : fail();
  const snapshot = createAgentPricingSnapshot({
    pricingSnapshotId: identity(snapshotRecord.pricingSnapshotId),
    providerConfigurationId,
    serviceTier: modelTier,
    region,
    effectiveAt,
    rates: Object.freeze(rates),
    sourceDigest: source.sourceContentDigest,
  });
  if (
    snapshotRecord.snapshotDigest !== snapshot.snapshotDigest ||
    !sameCanonicalJson(snapshotRecord, snapshot)
  ) {
    fail();
  }
  const base = Object.freeze({
    providerConfigurationId,
    modelId,
    immutableModelVersion,
    modelTier,
    source,
    snapshot,
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
  if (record.authorityDigest !== authority.authorityDigest) fail();
  return authority;
};

const parseCapabilityProbeProgram = (
  value: unknown
): AgentCapabilityProbeProgram => {
  if (!isAgentCapabilityProbeProgram(value)) fail();
  return deepFreeze(value as AgentCapabilityProbeProgram);
};

const parseRuntimeFactSourceIdentity = (
  value: unknown
): AgentProductionEvaluationRuntimeFactSourceIdentity => {
  try {
    const canonical = createAgentProductionEvaluationRuntimeFactSourceIdentity(
      value as AgentProductionEvaluationRuntimeFactSourceIdentity
    );
    if (!sameCanonicalJson(value, canonical)) fail();
    return canonical;
  } catch {
    return fail();
  }
};

const parseProvider = (
  key: AgentEvaluationRunConfigProviderKey,
  value: unknown
): AgentProductionEvaluationNativeIdentity &
  ProviderSecretBinding &
  Readonly<{ pricing: AgentEvaluationFrozenPricingAuthority }> => {
  const record = exact(value, [
    'providerConfigurationId',
    'providerOperatorId',
    'apiRevision',
    'region',
    'endpointProfileDigest',
    'dataPolicyDigest',
    'secretEnvironmentName',
    'secretRef',
    'adapter',
    'model',
    'capabilityInferenceConfigurationDigests',
    'declaredCapabilityProfileDigests',
    'capabilityProbePrograms',
    'expectedRuntimeFactSourceIdentities',
    'smokeProfileDigest',
    'pricing',
  ]);
  const protocolFamily = protocolByProviderKey[key];
  const definition = AGENT_EVALUATION_PROVIDER_DEFINITIONS[protocolFamily];
  if (
    record.providerConfigurationId !== definition.providerConfigurationId ||
    record.secretEnvironmentName !== definition.secretEnvironmentName ||
    record.secretRef !== definition.secretRef
  ) {
    fail();
  }
  const adapter = exact(record.adapter, [
    'adapterId',
    'adapterVersion',
    'transportSchemaDigest',
    'eventNormalizationDigest',
  ]);
  const model = exact(
    record.model,
    ['modelId', 'modelFamilyId', 'modelFamilyOwnerId', 'immutableVersion'],
    ['tokenizerDigest', 'chatTemplateDigest', 'runtimeBackendDigest']
  );
  const inference = exact(
    record.capabilityInferenceConfigurationDigests,
    AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES
  );
  if (!Array.isArray(record.declaredCapabilityProfileDigests)) fail();
  const declaredCapabilityProfileDigests =
    record.declaredCapabilityProfileDigests as unknown[];
  if (
    declaredCapabilityProfileDigests.some(
      (value) => !isAgentCanonicalDigest(value)
    ) ||
    new Set(declaredCapabilityProfileDigests).size !==
      declaredCapabilityProfileDigests.length ||
    !sameCanonicalJson(
      declaredCapabilityProfileDigests,
      [...declaredCapabilityProfileDigests].sort((left, right) =>
        compareUnicodeCodePoints(String(left), String(right))
      )
    )
  ) {
    fail();
  }
  const probePrograms = exact(
    record.capabilityProbePrograms,
    AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES
  );
  const expectedRuntimeFactSourceIdentities = exact(
    record.expectedRuntimeFactSourceIdentities,
    AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES
  );
  const parsedModel = Object.freeze({
    modelId: immutableIdentity(model.modelId),
    modelFamilyId: identity(model.modelFamilyId),
    modelFamilyOwnerId: identity(model.modelFamilyOwnerId),
    immutableVersion: immutableIdentity(model.immutableVersion),
    ...(model.tokenizerDigest === undefined
      ? {}
      : { tokenizerDigest: digest(model.tokenizerDigest) }),
    ...(model.chatTemplateDigest === undefined
      ? {}
      : { chatTemplateDigest: digest(model.chatTemplateDigest) }),
    ...(model.runtimeBackendDigest === undefined
      ? {}
      : { runtimeBackendDigest: digest(model.runtimeBackendDigest) }),
  });
  if (
    protocolFamily !== 'gemini-interactions' &&
    parsedModel.modelId !== parsedModel.immutableVersion
  ) {
    fail();
  }
  const providerConfigurationId = identity(record.providerConfigurationId);
  const region = identity(record.region);
  const canonicalAdapter = createAgentProviderAdapterIdentity({
    adapterId: identity(adapter.adapterId),
    adapterVersion: immutableIdentity(adapter.adapterVersion),
    protocolFamily,
    transportSchemaDigest: digest(adapter.transportSchemaDigest),
    eventNormalizationDigest: digest(adapter.eventNormalizationDigest),
  });
  const capabilityProbePrograms = Object.freeze(
    Object.fromEntries(
      AGENT_PRODUCTION_EVALUATION_OPTIONAL_CAPABILITY_PROFILES.map(
        (profileId) => [
          profileId,
          parseCapabilityProbeProgram(probePrograms[profileId]),
        ]
      )
    )
  ) as AgentProductionEvaluationNativeIdentity['capabilityProbePrograms'];
  const pricing = parsePricingAuthority(
    protocolFamily,
    providerConfigurationId,
    parsedModel.modelId,
    parsedModel.immutableVersion,
    region,
    record.pricing
  );
  return Object.freeze({
    protocolFamily,
    providerConfigurationId,
    providerOperatorId: identity(record.providerOperatorId),
    apiRevision: immutableIdentity(record.apiRevision),
    region,
    endpointProfileDigest: digest(record.endpointProfileDigest),
    dataPolicyDigest: digest(record.dataPolicyDigest),
    secretEnvironmentName: identity(record.secretEnvironmentName),
    secretRef: identity(record.secretRef),
    adapter: Object.freeze({
      adapterId: canonicalAdapter.adapterId,
      adapterVersion: canonicalAdapter.adapterVersion,
      transportSchemaDigest: canonicalAdapter.transportSchemaDigest,
      eventNormalizationDigest: canonicalAdapter.eventNormalizationDigest,
    }),
    model: parsedModel,
    capabilityInferenceConfigurationDigests: Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES.map((profileId) => [
          profileId,
          digest(inference[profileId]),
        ])
      )
    ) as AgentProductionEvaluationNativeIdentity['capabilityInferenceConfigurationDigests'],
    declaredCapabilityProfileDigests: Object.freeze(
      declaredCapabilityProfileDigests.map(digest)
    ),
    capabilityProbePrograms,
    expectedRuntimeFactSourceIdentities: Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_FACT_BACKED_OPTIONAL_CAPABILITY_PROFILES.map(
          (profileId) => [
            profileId,
            parseRuntimeFactSourceIdentity(
              expectedRuntimeFactSourceIdentities[profileId]
            ),
          ]
        )
      )
    ) as AgentProductionEvaluationNativeIdentity['expectedRuntimeFactSourceIdentities'],
    pricingAuthorityDigest: pricing.authorityDigest,
    smokeProfileDigest: digest(record.smokeProfileDigest),
    pricing,
  });
};

const nativeIdentityForProvider = (
  provider: ReturnType<typeof parseProvider>
): AgentProductionEvaluationNativeIdentity => {
  const {
    secretEnvironmentName: _secretEnvironmentName,
    secretRef: _secretRef,
    pricing: _pricing,
    ...identity
  } = provider;
  return Object.freeze(identity);
};

const boundedPublicText = (
  value: unknown,
  minimum: number,
  maximum: number
): string => {
  if (
    typeof value !== 'string' ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    fail();
  }
  return value as string;
};

const endpointIsPrivateOrLoopback = (hostname: string): boolean => {
  const value = hostname.toLowerCase();
  if (
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value === '[::1]' ||
    value === '::1' ||
    value.startsWith('127.') ||
    value.startsWith('10.') ||
    value.startsWith('192.168.') ||
    value.startsWith('169.254.')
  ) {
    return true;
  }
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  return match
    ? Number(match[1]) === 172 &&
        Number(match[2]) >= 16 &&
        Number(match[2]) <= 31
    : false;
};

const parseCompatibilityEndpoint = (
  value: unknown,
  role: 'hosted' | 'local',
  endpointClass: AgentProductionEvaluationCompatibilitySmoke['endpointClass']
): string => {
  const endpoint = boundedPublicText(value, 12, 2_048);
  const url = (() => {
    try {
      return new URL(endpoint);
    } catch {
      return fail();
    }
  })();
  if (
    url.href !== endpoint ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.pathname === '/' ||
    url.pathname.includes('//')
  ) {
    fail();
  }
  if (
    (role === 'hosted' &&
      (url.protocol !== 'https:' ||
        endpointIsPrivateOrLoopback(url.hostname))) ||
    (role === 'local' &&
      ((endpointClass === 'local' &&
        (!['http:', 'https:'].includes(url.protocol) ||
          !endpointIsPrivateOrLoopback(url.hostname) ||
          url.port === '')) ||
        (endpointClass === 'self-hosted' && url.protocol !== 'https:')))
  ) {
    fail();
  }
  return endpoint;
};

const parseCompatibilitySmoke = (
  value: unknown,
  role: 'hosted' | 'local'
): Readonly<{
  plan: AgentProductionEvaluationCompatibilitySmoke;
  runtime: AgentEvaluationCompatibilitySmokeRuntime;
}> => {
  const record = exact(value, [
    'providerConfigurationId',
    'endpointClass',
    'modelId',
    'immutableModelVersion',
    'modelLineageDigest',
    'inferenceConfigurationDigest',
    'adapterDigest',
    'smokeBehaviorProfileDigest',
    'smokeProfileDigest',
    'runtime',
  ]);
  if (
    !['first-party-hosted', 'aggregator', 'self-hosted', 'local'].includes(
      String(record.endpointClass)
    )
  ) {
    fail();
  }
  const endpointClass =
    record.endpointClass as AgentProductionEvaluationCompatibilitySmoke['endpointClass'];
  const providerConfigurationId = identity(record.providerConfigurationId);
  const modelId = immutableIdentity(record.modelId);
  const immutableModelVersion = immutableIdentity(record.immutableModelVersion);
  const modelLineageDigest = digest(record.modelLineageDigest);
  const inferenceConfigurationDigest = digest(
    record.inferenceConfigurationDigest
  );
  const adapterDigest = digest(record.adapterDigest);
  const runtimeRecord = exact(record.runtime, [
    'providerConfigurationId',
    'endpoint',
    'endpointId',
    'region',
    'modelId',
    'immutableModelVersion',
    'modelLineageDigest',
    'inferenceConfigurationDigest',
    'adapterDigest',
    'redirectPolicy',
    'authentication',
    'request',
    'pricing',
    'runtimeDigest',
  ]);
  const authentication = exact(runtimeRecord.authentication, [
    'mode',
    'secretEnvironmentName',
    'secretRef',
  ]);
  const expectedSecret =
    role === 'hosted'
      ? Object.freeze({
          environment: AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_ENV,
          ref: AGENT_EVALUATION_HOSTED_COMPATIBLE_SECRET_REF,
        })
      : Object.freeze({
          environment: AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_ENV,
          ref: AGENT_EVALUATION_LOCAL_COMPATIBLE_SECRET_REF,
        });
  if (
    runtimeRecord.redirectPolicy !== 'deny' ||
    authentication.mode !== 'bearer-secret-ref' ||
    authentication.secretEnvironmentName !== expectedSecret.environment ||
    authentication.secretRef !== expectedSecret.ref
  ) {
    fail();
  }
  const request = exact(runtimeRecord.request, [
    'apiShape',
    'prompt',
    'expectedText',
    'maximumOutputTokens',
    'temperature',
    'requestProfileDigest',
  ]);
  if (
    request.apiShape !== 'chat-completions' ||
    request.expectedText !== 'PRODIVIX_G4_SMOKE_OK' ||
    request.temperature !== '0'
  ) {
    fail();
  }
  const requestBase = Object.freeze({
    apiShape: 'chat-completions' as const,
    prompt: boundedPublicText(request.prompt, 1, 512),
    expectedText: 'PRODIVIX_G4_SMOKE_OK' as const,
    maximumOutputTokens: boundedInteger(request.maximumOutputTokens, 1, 64),
    temperature: '0' as const,
  });
  const requestProfileDigest = digestAgentCanonicalValue(requestBase);
  if (request.requestProfileDigest !== requestProfileDigest) fail();
  const runtimeModelId = immutableIdentity(runtimeRecord.modelId);
  const runtimeImmutableModelVersion = immutableIdentity(
    runtimeRecord.immutableModelVersion
  );
  const runtimeProviderConfigurationId = identity(
    runtimeRecord.providerConfigurationId
  );
  const runtimeRegion = identity(runtimeRecord.region);
  const runtimeModelLineageDigest = digest(runtimeRecord.modelLineageDigest);
  const runtimeInferenceConfigurationDigest = digest(
    runtimeRecord.inferenceConfigurationDigest
  );
  const runtimeAdapterDigest = digest(runtimeRecord.adapterDigest);
  if (
    runtimeProviderConfigurationId !== providerConfigurationId ||
    runtimeModelId !== modelId ||
    runtimeImmutableModelVersion !== immutableModelVersion ||
    runtimeModelLineageDigest !== modelLineageDigest ||
    runtimeInferenceConfigurationDigest !== inferenceConfigurationDigest ||
    runtimeAdapterDigest !== adapterDigest ||
    modelId !== immutableModelVersion
  ) {
    fail();
  }
  const pricing = parsePricingAuthority(
    'openai-compatible',
    providerConfigurationId,
    modelId,
    immutableModelVersion,
    runtimeRegion,
    runtimeRecord.pricing
  );
  const runtimeBase = Object.freeze({
    providerConfigurationId,
    endpoint: parseCompatibilityEndpoint(
      runtimeRecord.endpoint,
      role,
      endpointClass
    ),
    endpointId: identity(runtimeRecord.endpointId),
    region: runtimeRegion,
    modelId: runtimeModelId,
    immutableModelVersion: runtimeImmutableModelVersion,
    modelLineageDigest: runtimeModelLineageDigest,
    inferenceConfigurationDigest: runtimeInferenceConfigurationDigest,
    adapterDigest: runtimeAdapterDigest,
    redirectPolicy: 'deny' as const,
    authentication: Object.freeze({
      mode: 'bearer-secret-ref' as const,
      secretEnvironmentName: expectedSecret.environment,
      secretRef: expectedSecret.ref,
    }),
    request: Object.freeze({ ...requestBase, requestProfileDigest }),
    pricing,
  });
  const runtime = Object.freeze({
    ...runtimeBase,
    runtimeDigest: digestAgentCanonicalValue(runtimeBase),
  });
  if (runtimeRecord.runtimeDigest !== runtime.runtimeDigest) fail();
  const smokeBehaviorProfileDigest = digest(record.smokeBehaviorProfileDigest);
  const smokeProfileDigest = digestAgentCanonicalValue({
    runtimeDigest: runtime.runtimeDigest,
    smokeBehaviorProfileDigest,
  });
  if (record.smokeProfileDigest !== smokeProfileDigest) fail();
  const plan = Object.freeze({
    providerConfigurationId,
    endpointClass,
    modelId,
    immutableModelVersion,
    modelLineageDigest,
    inferenceConfigurationDigest,
    adapterDigest,
    pricingAuthorityDigest: pricing.authorityDigest,
    smokeProfileDigest,
  });
  return Object.freeze({ plan, runtime });
};

const parseControlledRuntime = (
  value: unknown
): AgentEvaluationControlledRuntimeConfiguration => {
  const record = exact(value, [
    'authorityId',
    'runtimeImplementationDigest',
    'artifactResolutionPolicyDigest',
    'proposalValidationPolicyDigest',
    'isolationPolicyDigest',
    'g3VerificationPolicyDigest',
    'controlledRenderPolicyDigest',
    'loop',
    'runtimePolicyDigest',
  ]);
  const loopRecord = exact(record.loop, [
    'domainToolChoice',
    'allowParallelDomainToolCalls',
    'maximumTurnsPerAttempt',
    'maximumToolCallsPerAttempt',
    'maximumRepairRoundsPerAttempt',
    'maximumToolResultBytes',
    'maximumAggregateToolResultBytes',
    'maximumAggregateArtifactBytes',
    'continuationTimeoutMs',
    'loopPolicyDigest',
  ]);
  if (loopRecord.domainToolChoice !== 'required') fail();
  const allowParallelDomainToolCalls =
    typeof loopRecord.allowParallelDomainToolCalls === 'boolean'
      ? loopRecord.allowParallelDomainToolCalls
      : fail();
  const maximumTurnsPerAttempt = boundedInteger(
    loopRecord.maximumTurnsPerAttempt,
    2,
    16
  );
  if (
    maximumTurnsPerAttempt !==
    AGENT_EVALUATION_PROVIDER_CAPABILITY_OBSERVATION_MAXIMUM_TURNS_PER_ATTEMPT
  ) {
    fail();
  }
  const loopBase = Object.freeze({
    domainToolChoice: 'required' as const,
    allowParallelDomainToolCalls,
    maximumTurnsPerAttempt,
    maximumToolCallsPerAttempt: boundedInteger(
      loopRecord.maximumToolCallsPerAttempt,
      1,
      32
    ),
    maximumRepairRoundsPerAttempt: boundedInteger(
      loopRecord.maximumRepairRoundsPerAttempt,
      1,
      8
    ),
    maximumToolResultBytes: boundedInteger(
      loopRecord.maximumToolResultBytes,
      1_024,
      2_097_152
    ),
    maximumAggregateToolResultBytes: boundedInteger(
      loopRecord.maximumAggregateToolResultBytes,
      1_024,
      16_777_216
    ),
    maximumAggregateArtifactBytes: boundedInteger(
      loopRecord.maximumAggregateArtifactBytes,
      1_024,
      8_388_608
    ),
    continuationTimeoutMs: boundedInteger(
      loopRecord.continuationTimeoutMs,
      1_000,
      300_000
    ),
  });
  if (
    (g4V8CaseMatrixRequiresParallelDomainToolCalls &&
      !loopBase.allowParallelDomainToolCalls) ||
    loopBase.maximumAggregateToolResultBytes <
      loopBase.maximumToolResultBytes ||
    loopBase.maximumAggregateArtifactBytes >
      loopBase.maximumAggregateToolResultBytes ||
    loopBase.maximumToolCallsPerAttempt >= loopBase.maximumTurnsPerAttempt
  ) {
    fail();
  }
  const loop = Object.freeze({
    ...loopBase,
    loopPolicyDigest: digestAgentCanonicalValue(loopBase),
  });
  if (!sameCanonicalJson(loopRecord, loop)) fail();
  const base = Object.freeze({
    authorityId: identity(record.authorityId),
    runtimeImplementationDigest: digest(record.runtimeImplementationDigest),
    artifactResolutionPolicyDigest: digest(
      record.artifactResolutionPolicyDigest
    ),
    proposalValidationPolicyDigest: digest(
      record.proposalValidationPolicyDigest
    ),
    isolationPolicyDigest: digest(record.isolationPolicyDigest),
    g3VerificationPolicyDigest: digest(record.g3VerificationPolicyDigest),
    controlledRenderPolicyDigest: digest(record.controlledRenderPolicyDigest),
    loop,
  });
  const result = Object.freeze({
    ...base,
    runtimePolicyDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(record, result)) fail();
  return result;
};

type AgentEvaluationResponseSpoolEncryptionSpecification<
  TFormat extends string,
  TAadFormat extends string,
  TNamespaceId extends string,
  TDisposition extends string,
> = Readonly<{
  format: TFormat;
  aadFormat: TAadFormat;
  namespaceId: TNamespaceId;
  namespaceDigestFormat: string;
  disposition: TDisposition;
}>;

const parseResponseSpoolEncryptionProfile = <
  TFormat extends string,
  TAadFormat extends string,
  TNamespaceId extends string,
  TDisposition extends string,
>(
  value: unknown,
  specification: AgentEvaluationResponseSpoolEncryptionSpecification<
    TFormat,
    TAadFormat,
    TNamespaceId,
    TDisposition
  >
): AgentEvaluationResponseSpoolEncryptionProfileBase<
  TFormat,
  TAadFormat,
  TNamespaceId,
  TDisposition
> => {
  const record = exact(value, [
    'format',
    'version',
    'algorithm',
    'nonceBytes',
    'authenticationTagBytes',
    'aadFormat',
    'aadVersion',
    'namespaceId',
    'namespaceDigest',
    'keyId',
    'keyVersion',
    'keyEnvironmentName',
    'keyRef',
    'keyRefDigest',
    'maximumPlaintextBytes',
    'retention',
    'encryptionProfileDigest',
    'encryptionPolicyDigest',
  ]);
  const retentionRecord = exact(record.retention, [
    'maximumAgeMs',
    'disposition',
    'retentionPolicyDigest',
  ]);
  if (
    record.format !== specification.format ||
    record.version !== 1 ||
    record.algorithm !== 'AES-256-GCM' ||
    record.nonceBytes !== 12 ||
    record.authenticationTagBytes !== 16 ||
    record.aadFormat !== specification.aadFormat ||
    record.aadVersion !== 1 ||
    record.namespaceId !== specification.namespaceId ||
    record.keyId !== AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID ||
    record.keyVersion !== 1 ||
    record.keyEnvironmentName !== AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV ||
    record.keyRef !== AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF ||
    record.maximumPlaintextBytes !==
      AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES ||
    retentionRecord.maximumAgeMs !==
      AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS ||
    retentionRecord.disposition !== specification.disposition
  ) {
    fail();
  }
  const namespaceDigest = digestAgentCanonicalValue({
    format: specification.namespaceDigestFormat,
    version: 1,
    namespaceId: specification.namespaceId,
  });
  if (record.namespaceDigest !== namespaceDigest) fail();
  const keyRefBase = Object.freeze({
    keyId: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ID,
    keyVersion: 1 as const,
    keyEnvironmentName: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_ENV,
    keyRef: AGENT_EVALUATION_RESPONSE_SPOOL_KEY_REF,
  });
  const keyRefDigest = digestAgentCanonicalValue(keyRefBase);
  if (record.keyRefDigest !== keyRefDigest) fail();
  const retentionBase = Object.freeze({
    maximumAgeMs: AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_RETENTION_MS,
    disposition: specification.disposition,
  });
  const retention = Object.freeze({
    ...retentionBase,
    retentionPolicyDigest: digestAgentCanonicalValue(retentionBase),
  });
  if (!sameCanonicalJson(retentionRecord, retention)) fail();
  const encryptionProfileBase = Object.freeze({
    algorithm: 'AES-256-GCM' as const,
    nonceBytes: 12 as const,
    authenticationTagBytes: 16 as const,
    aadFormat: specification.aadFormat,
    aadVersion: 1 as const,
    maximumPlaintextBytes:
      AGENT_EVALUATION_RESPONSE_SPOOL_MAXIMUM_PLAINTEXT_BYTES,
  });
  const encryptionProfileDigest = digestAgentCanonicalValue(
    encryptionProfileBase
  );
  if (record.encryptionProfileDigest !== encryptionProfileDigest) fail();
  const base = Object.freeze({
    format: specification.format,
    version: 1 as const,
    ...encryptionProfileBase,
    namespaceId: specification.namespaceId,
    namespaceDigest,
    ...keyRefBase,
    keyRefDigest,
    retention,
    encryptionProfileDigest,
  });
  const result = Object.freeze({
    ...base,
    encryptionPolicyDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(record, result)) fail();
  return result;
};

const parseResponseSpoolEncryption = (
  value: unknown
): AgentEvaluationResponseSpoolEncryptionProfile =>
  parseResponseSpoolEncryptionProfile(
    value,
    Object.freeze({
      format: 'prodivix.g4-model-evaluation-response-spool-encryption' as const,
      aadFormat: 'prodivix.agent-evaluation-provider-result-spool-aad' as const,
      namespaceId: AGENT_EVALUATION_RESPONSE_SPOOL_NAMESPACE_ID,
      namespaceDigestFormat:
        'prodivix.g4-model-evaluation-response-spool-namespace',
      disposition:
        'delete-after-durable-attempt-commit-or-maximum-age' as const,
    })
  );

const parseCapabilityProbeResponseSpoolEncryption = (
  value: unknown
): AgentCapabilityProbeResponseSpoolEncryptionProfile => {
  const record = exact(value, [
    'format',
    'version',
    'algorithm',
    'nonceBytes',
    'authenticationTagBytes',
    'aadFormat',
    'aadVersion',
    'namespaceId',
    'namespaceDigest',
    'keyId',
    'keyVersion',
    'keyEnvironmentName',
    'keyRef',
    'keyRefDigest',
    'maximumPlaintextBytes',
    'retention',
    'encryptionProfileDigest',
    'encryptionPolicyDigest',
  ]);
  const profile = createAgentCapabilityProbeResponseSpoolEncryptionProfile({
    keyId: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ID,
    keyVersion: 1,
    keyEnvironmentName:
      AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_ENVIRONMENT_NAME,
    keyRef: AGENT_EVALUATION_CAPABILITY_PROBE_RESPONSE_SPOOL_KEY_REF,
  });
  if (!sameCanonicalJson(record, profile)) fail();
  return profile;
};

export const createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile =
  (): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile => {
    const base = Object.freeze({
      format:
        AGENT_EVALUATION_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_PROFILE_FORMAT,
      version: 1 as const,
      keyReference:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_AUTHORITY,
      keyRefDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_KEY_REF_DIGEST,
      encryptionProfile:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE,
      encryptionProfileDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_ENCRYPTION_PROFILE_DIGEST,
      retentionPolicy:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY,
      retentionPolicyDigest:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_RETENTION_POLICY_DIGEST,
      maximumMetadataBytes:
        AGENT_HOSTED_RETRIEVAL_RUNTIME_RESOURCE_LIFECYCLE_SPOOL_MAXIMUM_METADATA_BYTES,
    });
    return Object.freeze({
      ...base,
      profileDigest: digestAgentCanonicalValue(base),
    });
  };

const parseHostedRetrievalRuntimeResourceLifecycleSpool = (
  value: unknown
): AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile => {
  const record = exact(value, [
    'format',
    'version',
    'keyReference',
    'keyRefDigest',
    'encryptionProfile',
    'encryptionProfileDigest',
    'retentionPolicy',
    'retentionPolicyDigest',
    'maximumMetadataBytes',
    'profileDigest',
  ]);
  const profile =
    createAgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile();
  if (!sameCanonicalJson(record, profile)) fail();
  return profile;
};

export const createAgentEvaluationNativeProviderStateVaultEncryptionProfile =
  (): AgentEvaluationNativeProviderStateVaultEncryptionProfile => {
    const keyRefBase = Object.freeze({
      keyId: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ID,
      keyVersion: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_VERSION,
      keyEnvironmentName: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_ENV,
      keyRef: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_REF,
    });
    const keyRefDigest = digestAgentCanonicalValue(keyRefBase);
    const retentionBase = Object.freeze({
      maximumAgeMs: AGENT_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_LIFETIME_MS,
      disposition: 'expire-after-source-seal-or-maximum-lifetime' as const,
    });
    const retention = Object.freeze({
      ...retentionBase,
      retentionPolicyDigest: digestAgentCanonicalValue(retentionBase),
    });
    const deletionReceiptPolicyBase = Object.freeze({
      plaintextResidency: 'callback-only' as const,
      encryptedReferenceDisposition: 'cryptographic-expiry' as const,
      deletionReceipt: 'source-seal-or-expiry-authority' as const,
    });
    const deletionReceiptPolicy = Object.freeze({
      ...deletionReceiptPolicyBase,
      deletionReceiptPolicyDigest: digestAgentCanonicalValue(
        deletionReceiptPolicyBase
      ),
    });
    const encryptionProfileBase = Object.freeze({
      algorithm: 'aes-256-gcm' as const,
      nonceBytes: 12 as const,
      authenticationTagBytes: 16 as const,
      aadFormat: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AAD_FORMAT,
      aadVersion: 1 as const,
      maximumPlaintextBytes:
        AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_MAXIMUM_PLAINTEXT_BYTES,
    });
    const encryptionProfileDigest = digestAgentCanonicalValue(
      encryptionProfileBase
    );
    const authorityImplementationDigest = digestAgentCanonicalValue({
      component: 'production-native-provider-state-vault',
      version: 1,
      algorithm: 'aes-256-gcm',
      ciphertextEncoding: 'identity-safe-base64url',
      plaintextResidency: 'callback-only',
    });
    const authority = createAgentNativeProviderStateVaultAuthority({
      authorityId: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_AUTHORITY_ID,
      authorityImplementationDigest,
      algorithm: 'aes-256-gcm',
      keyReferenceDigest: keyRefDigest,
      keyVersion: AGENT_EVALUATION_NATIVE_PROVIDER_STATE_VAULT_KEY_VERSION,
      encryptionProfileDigest,
      retentionPolicyDigest: retention.retentionPolicyDigest,
      deletionReceiptPolicyDigest:
        deletionReceiptPolicy.deletionReceiptPolicyDigest,
    });
    const base = Object.freeze({
      format:
        'prodivix.g4-native-provider-state-vault-encryption-profile' as const,
      version: 1 as const,
      ...encryptionProfileBase,
      ...keyRefBase,
      keyRefDigest,
      retention,
      deletionReceiptPolicy,
      encryptionProfileDigest,
      authority,
    });
    return Object.freeze({
      ...base,
      encryptionPolicyDigest: digestAgentCanonicalValue(base),
    });
  };

const parseNativeProviderStateVaultEncryption = (
  value: unknown
): AgentEvaluationNativeProviderStateVaultEncryptionProfile => {
  const record = exact(value, [
    'format',
    'version',
    'algorithm',
    'nonceBytes',
    'authenticationTagBytes',
    'aadFormat',
    'aadVersion',
    'maximumPlaintextBytes',
    'keyId',
    'keyVersion',
    'keyEnvironmentName',
    'keyRef',
    'keyRefDigest',
    'retention',
    'deletionReceiptPolicy',
    'encryptionProfileDigest',
    'authority',
    'encryptionPolicyDigest',
  ]);
  const profile =
    createAgentEvaluationNativeProviderStateVaultEncryptionProfile();
  if (!sameCanonicalJson(record, profile)) fail();
  return profile;
};

const assertIndependentNativeProviderStateVaultEncryption = (
  stateVault: AgentEvaluationNativeProviderStateVaultEncryptionProfile,
  resultSpool: AgentEvaluationResponseSpoolEncryptionProfile,
  probeSpool: AgentCapabilityProbeResponseSpoolEncryptionProfile
): void => {
  if (
    [resultSpool, probeSpool].some(
      (profile) =>
        stateVault.keyId === profile.keyId ||
        stateVault.keyEnvironmentName === profile.keyEnvironmentName ||
        stateVault.keyRef === profile.keyRef ||
        stateVault.keyRefDigest === profile.keyRefDigest ||
        stateVault.encryptionProfileDigest === profile.encryptionProfileDigest
    )
  ) {
    fail();
  }
};

const assertIndependentHostedRetrievalRuntimeResourceLifecycleSpool = (
  lifecycle: AgentEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolProfile,
  resultSpool: AgentEvaluationResponseSpoolEncryptionProfile,
  probeSpool: AgentCapabilityProbeResponseSpoolEncryptionProfile,
  stateVault: AgentEvaluationNativeProviderStateVaultEncryptionProfile
): void => {
  const keyReference = lifecycle.keyReference;
  if (
    [resultSpool, probeSpool, stateVault].some(
      (profile) =>
        keyReference.keyId === profile.keyId ||
        keyReference.keyEnvironmentName === profile.keyEnvironmentName ||
        keyReference.keyRef === profile.keyRef ||
        lifecycle.keyRefDigest === profile.keyRefDigest ||
        lifecycle.encryptionProfileDigest === profile.encryptionProfileDigest
    )
  ) {
    fail();
  }
};

const parseEndpointSmokeResponseSpoolEncryption = (
  value: unknown
): AgentEvaluationEndpointSmokeResponseSpoolEncryptionProfile =>
  parseResponseSpoolEncryptionProfile(
    value,
    Object.freeze({
      format: 'prodivix.g4-endpoint-smoke-response-spool-encryption' as const,
      aadFormat: AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_AAD_FORMAT,
      namespaceId: AGENT_EVALUATION_ENDPOINT_SMOKE_RESPONSE_SPOOL_NAMESPACE_ID,
      namespaceDigestFormat:
        'prodivix.g4-endpoint-smoke-response-spool-namespace',
      disposition:
        'delete-after-durable-endpoint-smoke-commit-or-maximum-age' as const,
    })
  );

const parsePolicies = (
  policiesValue: unknown,
  gradersValue: unknown,
  thresholdsValue: unknown
): AgentProductionEvaluationPolicyDigests => {
  const policies = exact(policiesValue, [
    'policyDigest',
    'contextBuilderDigest',
    'semanticProviderSetDigest',
    'promptPolicyDigest',
    'outputSchemaDigest',
    'toolRegistryDigest',
    'actionRegistryDigest',
    'rotatingCorpusPolicyDigest',
    'samplingIndependencePolicyDigest',
    'cacheAndStateIsolationPolicyDigest',
    'sequentialStoppingRuleDigests',
    'capabilityProfileDigests',
  ]);
  const sequential = exact(policies.sequentialStoppingRuleDigests, [
    'ordinary',
    'critical',
    'high-assurance',
  ]);
  const profiles = exact(
    policies.capabilityProfileDigests,
    AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES
  );
  const graders = exact(gradersValue, [
    'configurationDigests',
    'disagreementPolicyDigest',
    'randomizedPresentationPolicyDigest',
  ]);
  const configurations = exact(graders.configurationDigests, [
    'strictDecoder',
    'deterministicRule',
    'domainDryRun',
    'g3Closure',
    'perceptualMetric',
    'blindHumanRubric',
  ]);
  const thresholds = exact(thresholdsValue, [
    'metricCatalogDigest',
    'multipleComparisonPolicyDigest',
    'slicePolicyDigest',
  ]);
  if (
    thresholds.metricCatalogDigest !==
      AGENT_PRODUCTION_EVALUATION_METRIC_CATALOG_DIGEST ||
    policies.outputSchemaDigest !==
      AGENT_EVALUATION_RESULT_SUBMISSION_SCHEMA_DIGEST
  ) {
    fail();
  }
  return Object.freeze({
    policyDigest: digest(policies.policyDigest),
    contextBuilderDigest: digest(policies.contextBuilderDigest),
    semanticProviderSetDigest: digest(policies.semanticProviderSetDigest),
    promptPolicyDigest: digest(policies.promptPolicyDigest),
    outputSchemaDigest: digest(policies.outputSchemaDigest),
    toolRegistryDigest: digest(policies.toolRegistryDigest),
    actionRegistryDigest: digest(policies.actionRegistryDigest),
    rotatingCorpusPolicyDigest: digest(policies.rotatingCorpusPolicyDigest),
    samplingIndependencePolicyDigest: digest(
      policies.samplingIndependencePolicyDigest
    ),
    cacheAndStateIsolationPolicyDigest: digest(
      policies.cacheAndStateIsolationPolicyDigest
    ),
    sequentialStoppingRuleDigests: Object.freeze({
      ordinary: digest(sequential.ordinary),
      critical: digest(sequential.critical),
      'high-assurance': digest(sequential['high-assurance']),
    }),
    capabilityProfileDigests: Object.freeze(
      Object.fromEntries(
        AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES.map((profileId) => [
          profileId,
          digest(profiles[profileId]),
        ])
      )
    ) as AgentProductionEvaluationPolicyDigests['capabilityProfileDigests'],
    multipleComparisonPolicyDigest: digest(
      thresholds.multipleComparisonPolicyDigest
    ),
    slicePolicyDigest: digest(thresholds.slicePolicyDigest),
    graderConfigurationDigests: Object.freeze({
      strictDecoder: digest(configurations.strictDecoder),
      deterministicRule: digest(configurations.deterministicRule),
      domainDryRun: digest(configurations.domainDryRun),
      g3Closure: digest(configurations.g3Closure),
      perceptualMetric: digest(configurations.perceptualMetric),
      blindHumanRubric: digest(configurations.blindHumanRubric),
    }),
    disagreementPolicyDigest: digest(graders.disagreementPolicyDigest),
    randomizedPresentationPolicyDigest: digest(
      graders.randomizedPresentationPolicyDigest
    ),
  });
};

const parseAuxiliaryJudge = (
  value: unknown
): AgentProductionEvaluationAuxiliaryJudgeIdentity => {
  const record = exact(value, [
    'providerConfigurationId',
    'modelLineageDigest',
    'modelFamilyOwnerId',
    'configurationDigest',
    'promptDigest',
    'outputSchemaDigest',
    'capabilityProfileDigest',
  ]);
  return Object.freeze({
    providerConfigurationId: identity(record.providerConfigurationId),
    modelLineageDigest: digest(record.modelLineageDigest),
    modelFamilyOwnerId: identity(record.modelFamilyOwnerId),
    configurationDigest: digest(record.configurationDigest),
    promptDigest: digest(record.promptDigest),
    outputSchemaDigest: digest(record.outputSchemaDigest),
    capabilityProfileDigest: digest(record.capabilityProfileDigest),
  });
};

const parseBudget = (value: unknown): AgentModelEvaluationBudget => {
  const record = exact(value, [
    'budget',
    'maxProviderJobs',
    'maxShards',
    'maxHumanRatings',
    'reservePolicyDigest',
    'budgetDigest',
  ]);
  const budget = exact(record.budget, [
    'usageLimits',
    'costLimits',
    'maxModelInvocations',
    'maxToolCalls',
    'maxRepairRounds',
    'maxTransactions',
    'maxArtifactBytes',
    'maxElapsedMs',
  ]);
  if (!Array.isArray(budget.usageLimits) || !Array.isArray(budget.costLimits))
    fail();
  const usageValues = budget.usageLimits as unknown[];
  const costValues = budget.costLimits as unknown[];
  const usageLimits = usageValues.map((entry) => {
    const limit = exact(entry, ['unit', 'maximum']);
    if (!allowedUsageUnits.has(limit.unit as AgentUsageUnit)) fail();
    return Object.freeze({
      unit: limit.unit as AgentUsageUnit,
      maximum: positiveDecimal(limit.maximum),
    });
  });
  const costLimits = costValues.map((entry) => {
    const limit = exact(entry, ['currency', 'maximum']);
    if (
      typeof limit.currency !== 'string' ||
      !/^[A-Z]{3}$/u.test(limit.currency)
    )
      fail();
    return Object.freeze({
      currency: limit.currency as string,
      maximum: positiveDecimal(limit.maximum),
    });
  });
  if (
    new Set(usageLimits.map(({ unit }) => unit)).size !== usageLimits.length ||
    new Set(costLimits.map(({ currency }) => currency)).size !==
      costLimits.length ||
    requiredUsageUnits.some(
      (unit) => !usageLimits.some((limit) => limit.unit === unit)
    ) ||
    !costLimits.some(({ currency }) => currency === 'USD')
  ) {
    fail();
  }
  const normalized = createAgentModelEvaluationBudget({
    budget: Object.freeze({
      usageLimits: Object.freeze(usageLimits),
      costLimits: Object.freeze(costLimits),
      maxModelInvocations: boundedInteger(
        budget.maxModelInvocations,
        1,
        maximumBudgetCount
      ),
      maxToolCalls: boundedInteger(budget.maxToolCalls, 1, maximumBudgetCount),
      maxRepairRounds: boundedInteger(
        budget.maxRepairRounds,
        1,
        maximumBudgetCount
      ),
      maxTransactions: boundedInteger(
        budget.maxTransactions,
        1,
        maximumBudgetCount
      ),
      maxArtifactBytes: boundedInteger(
        budget.maxArtifactBytes,
        1,
        maximumBudgetBytes
      ),
      maxElapsedMs: boundedInteger(
        budget.maxElapsedMs,
        1,
        maximumPlanLifetimeMs
      ),
    }),
    maxProviderJobs: boundedInteger(
      record.maxProviderJobs,
      1,
      maximumBudgetCount
    ),
    maxShards: boundedInteger(record.maxShards, 1, maximumShards),
    maxHumanRatings: boundedInteger(
      record.maxHumanRatings,
      1,
      maximumBudgetCount
    ),
    reservePolicyDigest: digest(record.reservePolicyDigest),
  });
  if (
    record.budgetDigest !== normalized.budgetDigest ||
    !sameCanonicalJson(value, normalized)
  ) {
    fail();
  }
  return normalized;
};

const parseRelativeEnvelopePath = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 512 ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(value) ||
    value.startsWith('/') ||
    value.endsWith('/') ||
    value.split('/').some((segment) => segment === '.' || segment === '..') ||
    !value.endsWith('.json')
  ) {
    fail();
  }
  return value as string;
};

const parseMaterial = (
  value: unknown
): Readonly<{
  catalog: AgentEvaluationCorpusMaterialCatalog;
  locators: readonly AgentEvaluationFrozenRestrictedEnvelopeLocator[];
}> => {
  const record = exact(value, [
    'catalogDigests',
    'holdoutDirectoryEnvironmentName',
    'holdoutKeyEnvironmentName',
    'holdoutKeyRef',
    'restrictedEnvelopeLocators',
  ]);
  if (
    record.holdoutDirectoryEnvironmentName !==
      AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV ||
    record.holdoutKeyEnvironmentName !==
      AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV ||
    record.holdoutKeyRef !== AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF ||
    !Array.isArray(record.restrictedEnvelopeLocators)
  ) {
    fail();
  }
  const restrictedEnvelopeLocators =
    record.restrictedEnvelopeLocators as unknown[];
  const restrictedCases = G4_V8_MINIMUM_EVALUATION_CORPUS.cases
    .filter(({ access }) => access !== 'public')
    .sort((left, right) => compareUnicodeCodePoints(left.caseId, right.caseId));
  if (restrictedEnvelopeLocators.length !== restrictedCases.length) fail();
  const caseById = new Map(
    restrictedCases.map((entry) => [entry.caseId, entry])
  );
  const parsed = restrictedEnvelopeLocators.map((entry) => {
    const locator = exact(entry, [
      'caseId',
      'resolverRef',
      'relativePath',
      'encryptedMaterialDigest',
      'encryptionPolicyDigest',
    ]);
    const caseId = identity(locator.caseId);
    const evaluationCase = caseById.get(caseId) ?? fail();
    return Object.freeze({
      locator: createAgentEvaluationRestrictedMaterialLocator(evaluationCase, {
        resolverRef: identity(locator.resolverRef),
        encryptedMaterialDigest: digest(locator.encryptedMaterialDigest),
        encryptionPolicyDigest: digest(locator.encryptionPolicyDigest),
      }),
      relativePath: parseRelativeEnvelopePath(locator.relativePath),
    });
  });
  const caseIds = parsed.map(({ locator }) => locator.caseId);
  const resolverRefs = parsed.map(({ locator }) => locator.resolverRef);
  const paths = parsed.map(({ relativePath }) => relativePath);
  if (
    new Set(caseIds).size !== parsed.length ||
    new Set(resolverRefs).size !== parsed.length ||
    new Set(paths).size !== parsed.length ||
    !sameCanonicalJson(caseIds, [...caseIds].sort(compareUnicodeCodePoints))
  ) {
    fail();
  }
  const catalog = createAgentEvaluationCorpusMaterialCatalogFromPublicBasis(
    G4_V8_MINIMUM_EVALUATION_CORPUS.cases,
    getG4V8PublicMaterialCatalogBasis(),
    parsed.map(({ locator }) => locator)
  );
  const catalogDigests = exact(record.catalogDigests, [
    'caseSetDigest',
    'publicMaterialSetDigest',
    'restrictedMaterialManifestDigest',
    'catalogDigest',
  ]);
  if (
    catalogDigests.caseSetDigest !==
      AGENT_PRODUCTION_EVALUATION_CANONICAL_CASE_SET_DIGEST ||
    catalogDigests.caseSetDigest !== catalog.caseSetDigest ||
    catalogDigests.publicMaterialSetDigest !==
      catalog.publicMaterialSetDigest ||
    catalogDigests.restrictedMaterialManifestDigest !==
      catalog.restrictedMaterialManifestDigest ||
    catalogDigests.catalogDigest !== catalog.catalogDigest
  ) {
    fail();
  }
  return Object.freeze({ catalog, locators: Object.freeze(parsed) });
};

const humanReviewRegistryFormat =
  'prodivix.g4-human-review-trust-registry' as const;
const humanReviewDecisionPayloadFields = Object.freeze([
  'adjudicationAuthorityId',
  'adjudicatorPseudonym',
  'blindedArtifactSetDigest',
  'candidateDigest',
  'criterionVerdicts',
  'decidedAt',
  'decision',
  'decisionId',
  'format',
  'keyId',
  'planDigest',
  'policyDigest',
  'randomizedPresentationId',
  'ratingDigests',
  'reviewerAuthorityIds',
  'rubricDigest',
  'version',
]);

const canonicalEd25519PublicKey = (value: unknown): string => {
  if (typeof value !== 'string') fail();
  const encoded = value as string;
  if (!/^[A-Za-z0-9_-]{43}$/u.test(encoded)) fail();
  let bytes: Buffer | undefined;
  try {
    bytes = Buffer.from(encoded, 'base64url');
    if (bytes.byteLength !== 32 || bytes.toString('base64url') !== encoded)
      fail();
    return encoded;
  } catch {
    return fail();
  } finally {
    bytes?.fill(0);
  }
};

const parseHumanReviewTrustAuthority = (
  value: unknown
): AgentEvaluationHumanReviewTrustAuthority => {
  const record = exact(value, [
    'authorityId',
    'pseudonym',
    'role',
    'keyId',
    'publicKeyBase64Url',
    'validFrom',
    'validUntil',
    'independencePolicyDigest',
    'authorityDigest',
  ]);
  if (
    !['reviewer', 'adjudicator'].includes(String(record.role)) ||
    !isAgentControlInstant(record.validFrom) ||
    !isAgentControlInstant(record.validUntil) ||
    Date.parse(record.validUntil) <= Date.parse(record.validFrom)
  ) {
    fail();
  }
  const base = Object.freeze({
    authorityId: identity(record.authorityId),
    pseudonym: identity(record.pseudonym),
    role: record.role as 'reviewer' | 'adjudicator',
    keyId: identity(record.keyId),
    publicKeyBase64Url: canonicalEd25519PublicKey(record.publicKeyBase64Url),
    validFrom: record.validFrom as string,
    validUntil: record.validUntil as string,
    independencePolicyDigest: digest(record.independencePolicyDigest),
  });
  const authority = Object.freeze({
    ...base,
    authorityDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(record, authority)) fail();
  return authority;
};

const parseHumanReviewTrustRegistry = (
  value: unknown
): AgentEvaluationHumanReviewTrustRegistry => {
  const record = exact(value, [
    'format',
    'version',
    'registryId',
    'authorities',
    'authoritySetDigest',
    'registryDigest',
  ]);
  if (
    record.format !== humanReviewRegistryFormat ||
    record.version !== 1 ||
    !Array.isArray(record.authorities) ||
    record.authorities.length < 3 ||
    record.authorities.length > 17
  ) {
    fail();
  }
  const authorities = (record.authorities as unknown[]).map(
    parseHumanReviewTrustAuthority
  );
  if (
    new Set(authorities.map(({ authorityId }) => authorityId)).size !==
      authorities.length ||
    new Set(authorities.map(({ pseudonym }) => pseudonym)).size !==
      authorities.length ||
    new Set(authorities.map(({ keyId }) => keyId)).size !==
      authorities.length ||
    !sameCanonicalJson(
      authorities.map(({ authorityId }) => authorityId),
      authorities
        .map(({ authorityId }) => authorityId)
        .sort(compareUnicodeCodePoints)
    )
  ) {
    fail();
  }
  const authoritySetDigest = digestAgentCanonicalValue({
    format: 'prodivix.g4-human-review-authority-set',
    version: 1,
    authorityDigests: authorities.map(({ authorityDigest }) => authorityDigest),
  });
  if (record.authoritySetDigest !== authoritySetDigest) fail();
  const base = Object.freeze({
    format: humanReviewRegistryFormat,
    version: 1 as const,
    registryId: identity(record.registryId),
    authorities: Object.freeze(authorities),
    authoritySetDigest,
  });
  const registry = Object.freeze({
    ...base,
    registryDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(record, registry)) fail();
  return registry;
};

const parseHumanReviewAdjudicationPolicy = (
  value: unknown,
  minimumIndependentRatings: number,
  reviewerAuthorityIds: readonly string[],
  adjudicationAuthorityId: string,
  trustRegistry: AgentEvaluationHumanReviewTrustRegistry
): AgentEvaluationHumanReviewAdjudicationPolicy => {
  const record = exact(value, [
    'minimumIndependentRatings',
    'reviewerAuthorityIds',
    'adjudicationAuthorityId',
    'adjudicatorKeyId',
    'trigger',
    'trustRegistryDigest',
    'independencePolicyDigest',
    'consensusRule',
    'disagreementRule',
    'reviewerRatingSignaturesRequired',
    'adjudicatorDecisionSignatureRequired',
    'signatureAlgorithm',
    'decisionPayloadFields',
    'policyDigest',
  ]);
  if (
    record.minimumIndependentRatings !== minimumIndependentRatings ||
    !sameCanonicalJson(record.reviewerAuthorityIds, reviewerAuthorityIds) ||
    record.adjudicationAuthorityId !== adjudicationAuthorityId ||
    record.trigger !== 'reviewer-disagreement' ||
    record.trustRegistryDigest !== trustRegistry.registryDigest ||
    record.consensusRule !== 'unanimous' ||
    record.disagreementRule !== 'escalate-to-independent-adjudicator' ||
    record.reviewerRatingSignaturesRequired !== true ||
    record.adjudicatorDecisionSignatureRequired !== true ||
    record.signatureAlgorithm !== 'Ed25519' ||
    !sameCanonicalJson(
      record.decisionPayloadFields,
      humanReviewDecisionPayloadFields
    )
  ) {
    fail();
  }
  const adjudicator =
    trustRegistry.authorities.find(
      ({ authorityId, role }) =>
        authorityId === adjudicationAuthorityId && role === 'adjudicator'
    ) ?? fail();
  if (record.adjudicatorKeyId !== adjudicator.keyId) fail();
  const base = Object.freeze({
    minimumIndependentRatings,
    reviewerAuthorityIds,
    adjudicationAuthorityId,
    adjudicatorKeyId: adjudicator.keyId,
    trigger: 'reviewer-disagreement' as const,
    trustRegistryDigest: trustRegistry.registryDigest,
    independencePolicyDigest: digest(record.independencePolicyDigest),
    consensusRule: 'unanimous' as const,
    disagreementRule: 'escalate-to-independent-adjudicator' as const,
    reviewerRatingSignaturesRequired: true as const,
    adjudicatorDecisionSignatureRequired: true as const,
    signatureAlgorithm: 'Ed25519' as const,
    decisionPayloadFields: humanReviewDecisionPayloadFields,
  });
  const policy = Object.freeze({
    ...base,
    policyDigest: digestAgentCanonicalValue(base),
  });
  if (!sameCanonicalJson(record, policy)) fail();
  return policy;
};

const parseExecution = (
  value: unknown
): AgentEvaluationRunExecutionSettings => {
  const record = exact(value, ['shard', 'checkpoint', 'retry', 'humanReview']);
  const shard = exact(record.shard, [
    'count',
    'maximumParallel',
    'leaseDurationMs',
  ]);
  const checkpoint = exact(record.checkpoint, [
    'completedAttemptInterval',
    'maximumIntervalMs',
  ]);
  const retry = exact(record.retry, [
    'maximumAttempts',
    'retryableStatuses',
    'policyDigest',
  ]);
  if (!Array.isArray(retry.retryableStatuses)) fail();
  const statuses = (retry.retryableStatuses as unknown[]).map((status) => {
    if (!retryableStatuses.has(status as AgentEvaluationRetryableStatus))
      fail();
    return status as AgentEvaluationRetryableStatus;
  });
  const retryPolicy = createAgentEvaluationAttemptRetryPolicy({
    maximumAttempts: boundedInteger(retry.maximumAttempts, 1, 1),
    retryableStatuses: statuses,
  });
  if (retry.policyDigest !== retryPolicy.policyDigest) fail();
  const human = exact(record.humanReview, [
    'minimumIndependentRatings',
    'reviewerAuthorityIds',
    'adjudicationAuthorityId',
    'artifactMaximumBytes',
    'reviewerTrustRegistryDigest',
    'randomizedPresentationPolicyDigest',
    'publicRubrics',
    'trustRegistry',
    'adjudicationPolicy',
  ]);
  if (
    !Array.isArray(human.reviewerAuthorityIds) ||
    human.reviewerAuthorityIds.length < 2 ||
    human.reviewerAuthorityIds.length > 16
  ) {
    fail();
  }
  const reviewerAuthorityIds = (human.reviewerAuthorityIds as unknown[]).map(
    identity
  );
  const adjudicationAuthorityId = identity(human.adjudicationAuthorityId);
  const minimumIndependentRatings = boundedInteger(
    human.minimumIndependentRatings,
    2,
    8
  );
  if (
    new Set(reviewerAuthorityIds).size !== reviewerAuthorityIds.length ||
    reviewerAuthorityIds.length < minimumIndependentRatings ||
    reviewerAuthorityIds.includes(adjudicationAuthorityId)
  ) {
    fail();
  }
  const trustRegistry = parseHumanReviewTrustRegistry(human.trustRegistry);
  if (human.reviewerTrustRegistryDigest !== trustRegistry.registryDigest)
    fail();
  if (!Array.isArray(human.publicRubrics) || human.publicRubrics.length !== 1)
    fail();
  const publicRubrics = Object.freeze(
    (human.publicRubrics as unknown[]).map((rubric) =>
      validateAgentEvaluationPublicReviewRubric(rubric)
    )
  );
  const reviewerAuthorities = trustRegistry.authorities.filter(
    ({ role }) => role === 'reviewer'
  );
  const adjudicatorAuthorities = trustRegistry.authorities.filter(
    ({ role }) => role === 'adjudicator'
  );
  if (
    !sameCanonicalJson(
      reviewerAuthorities.map(({ authorityId }) => authorityId),
      reviewerAuthorityIds
    ) ||
    adjudicatorAuthorities.length !== 1 ||
    adjudicatorAuthorities[0]!.authorityId !== adjudicationAuthorityId
  ) {
    fail();
  }
  const adjudicationPolicy = parseHumanReviewAdjudicationPolicy(
    human.adjudicationPolicy,
    minimumIndependentRatings,
    Object.freeze(reviewerAuthorityIds),
    adjudicationAuthorityId,
    trustRegistry
  );
  if (
    trustRegistry.authorities.some(
      ({ independencePolicyDigest }) =>
        independencePolicyDigest !== adjudicationPolicy.independencePolicyDigest
    )
  ) {
    fail();
  }
  const leaseDurationMs = boundedInteger(
    shard.leaseDurationMs,
    60_000,
    3_600_000
  );
  const maximumIntervalMs = boundedInteger(
    checkpoint.maximumIntervalMs,
    1_000,
    300_000
  );
  if (maximumIntervalMs >= leaseDurationMs) fail();
  return Object.freeze({
    shard: Object.freeze({
      count: boundedInteger(shard.count, 1, maximumShards),
      maximumParallel: boundedInteger(
        shard.maximumParallel,
        1,
        maximumParallelShards
      ),
      leaseDurationMs,
    }),
    checkpoint: Object.freeze({
      completedAttemptInterval: boundedInteger(
        checkpoint.completedAttemptInterval,
        1,
        10_000
      ),
      maximumIntervalMs,
    }),
    retry: retryPolicy,
    humanReview: Object.freeze({
      minimumIndependentRatings,
      reviewerAuthorityIds: Object.freeze(reviewerAuthorityIds),
      adjudicationAuthorityId,
      reviewerTrustRegistryDigest: trustRegistry.registryDigest,
      randomizedPresentationPolicyDigest: digest(
        human.randomizedPresentationPolicyDigest
      ),
      publicRubrics,
      trustRegistry,
      adjudicationPolicy,
      artifactMaximumBytes: boundedInteger(
        human.artifactMaximumBytes,
        1,
        maximumReviewArtifactBytes
      ),
    }),
  });
};

const parseAttestation = (value: unknown): AgentEvaluationRunAttestation => {
  const record = exact(value, [
    'authorityId',
    'keyId',
    'algorithm',
    'privateKeyEnvironmentName',
    'privateKeyRef',
  ]);
  if (
    record.algorithm !== 'Ed25519' ||
    record.privateKeyEnvironmentName !==
      AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_ENV ||
    record.privateKeyRef !== AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_REF
  ) {
    fail();
  }
  return Object.freeze({
    authorityId: identity(record.authorityId),
    keyId: identity(record.keyId),
    algorithm: 'Ed25519',
    privateKeyEnvironmentName: AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_ENV,
    privateKeyRef: AGENT_EVALUATION_ATTESTATION_PRIVATE_KEY_REF,
  });
};

const assertBudgetCanExecuteFrozenMatrix = (
  plan: AgentModelEvaluationPlan,
  execution: AgentEvaluationRunExecutionSettings,
  controlledRuntime: AgentEvaluationControlledRuntimeConfiguration,
  planLifetimeMs: number
): void => {
  const descriptors = planAgentModelEvaluationAttempts(plan);
  const caseById = new Map(
    plan.concreteCases.map((entry) => [entry.caseId, entry])
  );
  let subjectiveAttempts = 0;
  for (const descriptor of descriptors) {
    const evaluationCase = caseById.get(descriptor.caseId) ?? fail();
    if (evaluationCase.subjectiveVisualQuality) subjectiveAttempts += 1;
  }
  const requiredInvocations =
    descriptors.length *
    controlledRuntime.loop.maximumTurnsPerAttempt *
    execution.retry.maximumAttempts;
  const requiredToolCalls =
    descriptors.length * controlledRuntime.loop.maximumToolCallsPerAttempt;
  const requiredRepairRounds =
    descriptors.length * controlledRuntime.loop.maximumRepairRoundsPerAttempt;
  const requiredTransactions = requiredToolCalls;
  const requiredHumanRatings =
    subjectiveAttempts * execution.humanReview.minimumIndependentRatings;
  const budget = plan.budget;
  if (
    budget.budget.maxModelInvocations < requiredInvocations ||
    budget.maxProviderJobs < requiredInvocations ||
    budget.budget.maxToolCalls < requiredToolCalls ||
    budget.budget.maxRepairRounds < requiredRepairRounds ||
    budget.budget.maxTransactions < requiredTransactions ||
    budget.maxHumanRatings < requiredHumanRatings ||
    budget.maxShards < execution.shard.count ||
    execution.shard.maximumParallel > execution.shard.count ||
    budget.budget.maxArtifactBytes <
      execution.humanReview.artifactMaximumBytes ||
    budget.budget.maxElapsedMs > planLifetimeMs
  ) {
    fail();
  }
};

const observedInstant = (clock: AgentEvaluationRunConfigClock): string => {
  if (typeof clock !== 'function') fail();
  const value = clock();
  const instant = value instanceof Date ? value.toISOString() : value;
  if (!isAgentControlInstant(instant)) fail();
  return instant;
};

const assertPricingAuthorityTimes = (
  pricingAuthorities: Readonly<
    Record<
      AgentEvaluationRunConfigPricingAuthorityKey,
      AgentEvaluationFrozenPricingAuthority
    >
  >,
  plannedAt: string
): void => {
  const planned = Date.parse(plannedAt);
  const maximumObservationAgeMs = 30 * 24 * 60 * 60 * 1_000;
  for (const key of pricingAuthorityKeys) {
    const pricing = pricingAuthorities[key];
    const observed = Date.parse(pricing.source.observedAt);
    const effective = Date.parse(pricing.snapshot.effectiveAt);
    if (
      effective > observed ||
      observed > planned ||
      planned - observed > maximumObservationAgeMs
    ) {
      fail();
    }
  }
};

const assertRunConfigHeader = (
  root: Record<string, unknown>,
  purpose: 'template' | 'production',
  expectedRepositoryCommit?: string
): string => {
  if (
    root.format !== AGENT_EVALUATION_RUN_CONFIG_FORMAT ||
    root.version !== AGENT_EVALUATION_RUN_CONFIG_VERSION ||
    root.purpose !== purpose ||
    typeof root.repositoryCommit !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(root.repositoryCommit) ||
    (expectedRepositoryCommit !== undefined &&
      root.repositoryCommit !== expectedRepositoryCommit)
  ) {
    fail();
  }
  return root.repositoryCommit as string;
};

const parseNativeProviders = (
  value: unknown
): Readonly<
  Record<AgentEvaluationRunConfigProviderKey, ReturnType<typeof parseProvider>>
> => {
  const providers = exact(value, providerKeys);
  return Object.freeze({
    openaiResponses: parseProvider(
      'openaiResponses',
      providers.openaiResponses
    ),
    anthropicMessages: parseProvider(
      'anthropicMessages',
      providers.anthropicMessages
    ),
    geminiInteractions: parseProvider(
      'geminiInteractions',
      providers.geminiInteractions
    ),
  });
};

const nativeIdentitiesForProviders = (
  providers: ReturnType<typeof parseNativeProviders>
): readonly AgentProductionEvaluationNativeIdentity[] =>
  Object.freeze(
    providerKeys.map((key) => nativeIdentityForProvider(providers[key]))
  );

const canonicalQualificationAuthorityBundle = (
  value: AgentProductionEvaluationQualificationAuthorityBundle
): AgentProductionEvaluationQualificationAuthorityBundle => {
  try {
    const canonical =
      createAgentProductionEvaluationQualificationAuthorityBundle({
        capabilityProbeAuthorities: value.capabilityProbeAuthorities,
        runtimeFactSourceAuthorities: value.runtimeFactSourceAuthorities,
        providerResourceCleanupReceipts: value.providerResourceCleanupReceipts,
      });
    if (!sameCanonicalJson(value, canonical)) fail();
    return canonical;
  } catch {
    return fail();
  }
};

const canonicalProbeProviderResourceAuthorityBundle = (
  value: AgentProductionEvaluationProbeProviderResourceAuthorityBundle
): AgentProductionEvaluationProbeProviderResourceAuthorityBundle => {
  try {
    const canonical =
      createAgentProductionEvaluationProbeProviderResourceAuthorityBundle({
        authorities: value.authorities,
        deletionAuthorityReceipts: value.deletionAuthorityReceipts,
        cleanupReceipts: value.cleanupReceipts,
      });
    if (!sameCanonicalJson(value, canonical)) fail();
    return canonical;
  } catch {
    return fail();
  }
};

export const createAgentEvaluationProductionRunConfigDocument = (
  input: string | Uint8Array | unknown,
  qualificationAuthorityBundleInput: AgentProductionEvaluationQualificationAuthorityBundle,
  probeProviderResourceAuthorityBundleInput: AgentProductionEvaluationProbeProviderResourceAuthorityBundle,
  plannedAtInput: string | Date
): Readonly<Record<string, unknown>> => {
  try {
    const parsed = parseJson(input);
    rejectSecretLookingValues(parsed);
    const root = exact(parsed, runConfigRootKeys);
    assertRunConfigHeader(root, 'template');
    parseNativeProviders(root.providers);
    const planLifetimeMs = boundedInteger(
      root.planLifetimeMs,
      minimumPlanLifetimeMs,
      maximumPlanLifetimeMs
    );
    const plannedAt =
      plannedAtInput instanceof Date
        ? plannedAtInput.toISOString()
        : plannedAtInput;
    if (!isAgentControlInstant(plannedAt)) fail();
    const expiresAtMilliseconds = Date.parse(plannedAt) + planLifetimeMs;
    if (!Number.isSafeInteger(expiresAtMilliseconds)) fail();
    const qualificationAuthorityBundle = canonicalQualificationAuthorityBundle(
      qualificationAuthorityBundleInput
    );
    const probeProviderResourceAuthorityBundle =
      canonicalProbeProviderResourceAuthorityBundle(
        probeProviderResourceAuthorityBundleInput
      );
    return deepFreeze({
      ...(parsed as Record<string, unknown>),
      purpose: 'production',
      plannedAt,
      expiresAt: new Date(expiresAtMilliseconds).toISOString(),
      qualificationAuthorityBundle,
      probeProviderResourceAuthorityBundle,
    });
  } catch {
    throw invalidConfiguration();
  }
};

/**
 * Decodes the checked-in, evidence-free qualification template. Provider
 * resources, sealed probe observations, and runtime-source registrations enter
 * only at final freeze.
 */
export const decodeAgentEvaluationRunConfigQualificationTemplate = (
  input: string | Uint8Array | unknown,
  options: DecodeAgentEvaluationRunConfigQualificationTemplateOptions = {}
): AgentEvaluationRunConfigQualificationTemplate => {
  try {
    const parsed = parseJson(input);
    rejectSecretLookingValues(parsed);
    const root = exact(parsed, runConfigRootKeys);
    const repositoryCommit = assertRunConfigHeader(
      root,
      'template',
      options.expectedRepositoryCommit
    );
    const providers = parseNativeProviders(root.providers);
    const responseSpoolEncryption = parseResponseSpoolEncryption(
      root.responseSpoolEncryption
    );
    const capabilityProbeResponseSpoolEncryption =
      parseCapabilityProbeResponseSpoolEncryption(
        root.capabilityProbeResponseSpoolEncryption
      );
    const hostedRetrievalRuntimeResourceLifecycleSpool =
      parseHostedRetrievalRuntimeResourceLifecycleSpool(
        root.hostedRetrievalRuntimeResourceLifecycleSpool
      );
    const nativeProviderStateVaultEncryption =
      parseNativeProviderStateVaultEncryption(
        root.nativeProviderStateVaultEncryption
      );
    assertIndependentNativeProviderStateVaultEncryption(
      nativeProviderStateVaultEncryption,
      responseSpoolEncryption,
      capabilityProbeResponseSpoolEncryption
    );
    assertIndependentHostedRetrievalRuntimeResourceLifecycleSpool(
      hostedRetrievalRuntimeResourceLifecycleSpool,
      responseSpoolEncryption,
      capabilityProbeResponseSpoolEncryption,
      nativeProviderStateVaultEncryption
    );
    const planLifetimeMs = boundedInteger(
      root.planLifetimeMs,
      minimumPlanLifetimeMs,
      maximumPlanLifetimeMs
    );
    return deepFreeze({
      format: AGENT_EVALUATION_RUN_CONFIG_FORMAT,
      version: AGENT_EVALUATION_RUN_CONFIG_VERSION,
      purpose: 'template' as const,
      repositoryCommit,
      planLifetimeMs,
      sourceConfigDigest: digestAgentCanonicalValue(parsed),
      nativeIdentities: nativeIdentitiesForProviders(providers),
      capabilityProbeResponseSpoolEncryption,
      hostedRetrievalRuntimeResourceLifecycleSpool,
      nativeProviderStateVaultEncryption,
    });
  } catch {
    throw invalidConfiguration();
  }
};

/**
 * Finalizes one generated production run config carrying both externally
 * sealed authority bundles. The injected clock is sampled exactly once.
 */
export const decodeAgentEvaluationFrozenRunConfig = (
  input: string | Uint8Array | unknown,
  options: DecodeAgentEvaluationFrozenRunConfigOptions
): AgentEvaluationFrozenRunConfig => {
  try {
    const parsed = parseJson(input);
    rejectSecretLookingValues(parsed);
    const root = exact(parsed, [
      ...runConfigRootKeys,
      'plannedAt',
      'expiresAt',
      'qualificationAuthorityBundle',
      'probeProviderResourceAuthorityBundle',
    ]);
    const repositoryCommit = assertRunConfigHeader(
      root,
      'production',
      options.expectedRepositoryCommit
    );
    const providers = parseNativeProviders(root.providers);
    const nativeIdentities = nativeIdentitiesForProviders(providers);
    const qualificationAuthorityBundle = canonicalQualificationAuthorityBundle(
      root.qualificationAuthorityBundle as AgentProductionEvaluationQualificationAuthorityBundle
    );
    const probeProviderResourceAuthorityBundle =
      canonicalProbeProviderResourceAuthorityBundle(
        root.probeProviderResourceAuthorityBundle as AgentProductionEvaluationProbeProviderResourceAuthorityBundle
      );
    const compatibility = exact(root.compatibilitySmokes, ['hosted', 'local']);
    const compatibilityConfigurations = Object.freeze({
      hosted: parseCompatibilitySmoke(compatibility.hosted, 'hosted'),
      local: parseCompatibilitySmoke(compatibility.local, 'local'),
    });
    const pricingAuthorities = Object.freeze({
      openaiResponses: providers.openaiResponses.pricing,
      anthropicMessages: providers.anthropicMessages.pricing,
      geminiInteractions: providers.geminiInteractions.pricing,
      hostedCompatibility: compatibilityConfigurations.hosted.runtime.pricing,
      localCompatibility: compatibilityConfigurations.local.runtime.pricing,
    });
    const compatibilitySmokes = Object.freeze({
      hosted: compatibilityConfigurations.hosted.plan,
      local: compatibilityConfigurations.local.plan,
    });
    const controlledRuntime = parseControlledRuntime(root.controlledRuntime);
    const responseSpoolEncryption = parseResponseSpoolEncryption(
      root.responseSpoolEncryption
    );
    const capabilityProbeResponseSpoolEncryption =
      parseCapabilityProbeResponseSpoolEncryption(
        root.capabilityProbeResponseSpoolEncryption
      );
    const hostedRetrievalRuntimeResourceLifecycleSpool =
      parseHostedRetrievalRuntimeResourceLifecycleSpool(
        root.hostedRetrievalRuntimeResourceLifecycleSpool
      );
    const nativeProviderStateVaultEncryption =
      parseNativeProviderStateVaultEncryption(
        root.nativeProviderStateVaultEncryption
      );
    assertIndependentNativeProviderStateVaultEncryption(
      nativeProviderStateVaultEncryption,
      responseSpoolEncryption,
      capabilityProbeResponseSpoolEncryption
    );
    assertIndependentHostedRetrievalRuntimeResourceLifecycleSpool(
      hostedRetrievalRuntimeResourceLifecycleSpool,
      responseSpoolEncryption,
      capabilityProbeResponseSpoolEncryption,
      nativeProviderStateVaultEncryption
    );
    const endpointSmokeResponseSpoolEncryption =
      parseEndpointSmokeResponseSpoolEncryption(
        root.endpointSmokeResponseSpoolEncryption
      );
    const material = parseMaterial(root.material);
    const policyDigests = parsePolicies(
      root.policies,
      root.graders,
      root.thresholds
    );
    const auxiliaryJudge = parseAuxiliaryJudge(root.auxiliaryJudge);
    const budget = parseBudget(root.budget);
    const execution = parseExecution(root.execution);
    const attestation = parseAttestation(root.attestation);
    const [publicRubric] = execution.humanReview.publicRubrics;
    if (!publicRubric) fail();
    if (
      policyDigests.graderConfigurationDigests.domainDryRun !==
        controlledRuntime.runtimePolicyDigest ||
      policyDigests.graderConfigurationDigests.blindHumanRubric !==
        publicRubric.rubricDigest ||
      policyDigests.disagreementPolicyDigest !==
        execution.humanReview.adjudicationPolicy.policyDigest ||
      policyDigests.randomizedPresentationPolicyDigest !==
        execution.humanReview.randomizedPresentationPolicyDigest ||
      policyDigests.cacheAndStateIsolationPolicyDigest !==
        responseSpoolEncryption.encryptionPolicyDigest
    ) {
      fail();
    }
    const planLifetimeMs = boundedInteger(
      root.planLifetimeMs,
      minimumPlanLifetimeMs,
      maximumPlanLifetimeMs
    );
    if (
      !isAgentControlInstant(root.plannedAt) ||
      !isAgentControlInstant(root.expiresAt)
    ) {
      fail();
    }
    const plannedAt = root.plannedAt as string;
    const expiresAt = root.expiresAt as string;
    const expiresAtMilliseconds = Date.parse(expiresAt);
    if (
      !Number.isSafeInteger(expiresAtMilliseconds) ||
      expiresAtMilliseconds - Date.parse(plannedAt) !== planLifetimeMs
    ) {
      fail();
    }
    const decodedAt = Date.parse(observedInstant(options.clock));
    if (decodedAt < Date.parse(plannedAt) || decodedAt > expiresAtMilliseconds)
      fail();
    assertPricingAuthorityTimes(pricingAuthorities, plannedAt);
    if (
      execution.humanReview.trustRegistry.authorities.some(
        ({ validFrom, validUntil }) =>
          Date.parse(validFrom) > Date.parse(plannedAt) ||
          Date.parse(validUntil) < Date.parse(expiresAt)
      )
    ) {
      fail();
    }
    const plan = createAgentProductionReleaseEvaluationPlan({
      repositoryCommit,
      nativeIdentities,
      qualificationAuthorityBundle,
      probeProviderResourceAuthorityBundle,
      compatibilitySmokes,
      materialCatalogDigests: Object.freeze({
        caseSetDigest: material.catalog.caseSetDigest,
        publicMaterialSetDigest: material.catalog.publicMaterialSetDigest,
        restrictedMaterialManifestDigest:
          material.catalog.restrictedMaterialManifestDigest,
        catalogDigest: material.catalog.catalogDigest,
      }),
      policyDigests,
      auxiliaryJudge,
      budget,
      minimumIndependentVisualRatings:
        execution.humanReview.minimumIndependentRatings,
      endpointSmokeResponseSpoolEncryptionPolicyDigest:
        endpointSmokeResponseSpoolEncryption.encryptionPolicyDigest,
      plannedAt,
      expiresAt,
    });
    const prohibitedHumanAuthorityIds = new Set([
      ...providerKeys.flatMap((key) => [
        providers[key].providerOperatorId,
        providers[key].model.modelFamilyOwnerId,
      ]),
      auxiliaryJudge.modelFamilyOwnerId,
      controlledRuntime.authorityId,
      attestation.authorityId,
      ...plan.graderPlan.graders.map(({ graderId }) => graderId),
    ]);
    if (
      execution.humanReview.trustRegistry.authorities.some(({ authorityId }) =>
        prohibitedHumanAuthorityIds.has(authorityId)
      )
    ) {
      fail();
    }
    assertBudgetCanExecuteFrozenMatrix(
      plan,
      execution,
      controlledRuntime,
      planLifetimeMs
    );

    const sourceConfigDigest = digestAgentCanonicalValue(parsed);
    const publicProviders = Object.freeze(
      Object.fromEntries(
        providerKeys.map((key) => {
          const provider = providers[key];
          return [
            key,
            Object.freeze({
              protocolFamily: provider.protocolFamily,
              providerConfigurationId: provider.providerConfigurationId,
              modelId: provider.model.modelId,
              secretEnvironmentName: provider.secretEnvironmentName,
              secretRef: provider.secretRef,
            }),
          ];
        })
      )
    ) as AgentEvaluationFrozenRunConfig['providers'];
    const base = Object.freeze({
      format: AGENT_EVALUATION_RUN_CONFIG_FORMAT,
      version: AGENT_EVALUATION_RUN_CONFIG_VERSION,
      purpose: 'production' as const,
      sourceConfigDigest,
      plan,
      qualificationAuthorityBundle,
      probeProviderResourceAuthorityBundle,
      providers: publicProviders,
      pricingAuthorities,
      materialCatalog: material.catalog,
      compatibilitySmokeRuntimes: Object.freeze({
        hosted: compatibilityConfigurations.hosted.runtime,
        local: compatibilityConfigurations.local.runtime,
      }),
      controlledRuntime,
      responseSpoolEncryption,
      capabilityProbeResponseSpoolEncryption,
      hostedRetrievalRuntimeResourceLifecycleSpool,
      nativeProviderStateVaultEncryption,
      endpointSmokeResponseSpoolEncryption,
      restrictedEnvelopeLocators: material.locators,
      holdoutDirectoryEnvironmentName: AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV,
      holdoutKeyEnvironmentName: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_ENV,
      holdoutKeyRef: AGENT_EVALUATION_PROTECTED_MATERIAL_KEY_REF,
      execution,
      attestation,
    });
    return deepFreeze({
      ...base,
      frozenRunDigest: digestAgentCanonicalValue({
        attestation,
        controlledRuntime,
        execution,
        planDigest: plan.planDigest,
        qualificationAuthorityBundleDigest:
          qualificationAuthorityBundle.bundleDigest,
        probeProviderResourceAuthorityBundleDigest:
          probeProviderResourceAuthorityBundle.bundleDigest,
        pricingAuthorityDigests: Object.freeze(
          pricingAuthorityKeys.map(
            (key) => pricingAuthorities[key].authorityDigest
          )
        ),
        endpointSmokeResponseSpoolEncryption,
        capabilityProbeResponseSpoolEncryption,
        hostedRetrievalRuntimeResourceLifecycleSpool,
        nativeProviderStateVaultEncryption,
        responseSpoolEncryption,
        sourceConfigDigest,
      }),
    });
  } catch {
    throw invalidConfiguration();
  }
};

/** Rejects the checked-in example and optionally cross-binds the checkout. */
export const requireProductionAgentEvaluationFrozenRunConfig = (
  config: AgentEvaluationFrozenRunConfig,
  expectedRepositoryCommit?: string
): AgentEvaluationProductionFrozenRunConfig => {
  if (
    config.purpose !== 'production' ||
    (expectedRepositoryCommit !== undefined &&
      config.plan.repositoryCommit !== expectedRepositoryCommit)
  ) {
    throw invalidConfiguration();
  }
  return config as AgentEvaluationProductionFrozenRunConfig;
};

/**
 * Resolves the public machine-local holdout directory only at execution time,
 * producing the exact absolute allowlist accepted by the encrypted source.
 */
export const resolveAgentEvaluationProtectedMaterialFiles = (
  config: AgentEvaluationFrozenRunConfig,
  environment: AgentEvaluationEnvironment = process.env
): readonly AgentEvaluationProtectedMaterialEnvelopeFile[] => {
  try {
    const directory = environment[AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENV];
    if (
      typeof directory !== 'string' ||
      directory.length < 1 ||
      directory.length > 4_096 ||
      directory !== directory.trim() ||
      directory.includes('\0') ||
      !isAbsolute(directory) ||
      normalize(directory) !== directory
    ) {
      fail();
    }
    const protectedDirectory = directory as string;
    const files = config.restrictedEnvelopeLocators.map(
      ({ locator, relativePath }) => {
        const target = resolve(protectedDirectory, ...relativePath.split('/'));
        const fromDirectory = relative(protectedDirectory, target);
        if (
          fromDirectory.length < 1 ||
          isAbsolute(fromDirectory) ||
          fromDirectory === '..' ||
          fromDirectory.startsWith(`..${sep}`) ||
          fromDirectory.startsWith('../') ||
          normalize(target) !== target
        ) {
          fail();
        }
        return Object.freeze({
          caseId: locator.caseId,
          resolverRef: locator.resolverRef,
          path: target,
        });
      }
    );
    if (new Set(files.map(({ path }) => path)).size !== files.length) fail();
    return Object.freeze(files);
  } catch {
    throw invalidConfiguration();
  }
};
