import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import type { CanonicalDigest } from '../domain/agent.types';

export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME =
  'production-run-config.json' as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_FORMAT =
  'prodivix.agent-evaluation-production-run-config-artifact-binding' as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_VERSION =
  1 as const;
export const AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES = 16_777_216;

export const AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_FORMAT =
  'prodivix.g4-model-evaluation-frozen-run-commitment' as const;
export const AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_VERSION = 1 as const;
export const AGENT_EVALUATION_HOLDOUT_ACCESS_POLICY_FORMAT =
  'prodivix.g4-model-evaluation-holdout-access-policy' as const;
export const AGENT_EVALUATION_ENCRYPTED_HOLDOUT_CORPUS_FORMAT =
  'prodivix.g4-model-evaluation-encrypted-holdout-corpus' as const;
export const AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY' as const;
export const AGENT_EVALUATION_HOLDOUT_KEY_ENVIRONMENT_NAME =
  'PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64' as const;
export const AGENT_EVALUATION_HOLDOUT_KEY_REF =
  'secret.g4-model-eval.holdout-envelope.v1' as const;
export const AGENT_EVALUATION_HOLDOUT_EXECUTOR_PRINCIPAL_ID =
  'authority.prodivix.g4-holdout-sealer.v1' as const;

const maximumCommitmentBytes = 1_048_576;
const maximumProtectedEnvelopeCount = 2_048;
const repositoryCommitPattern = /^[0-9a-f]{40}$/u;
const relativeEnvelopeSegmentPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const canonicalEd25519SignaturePattern = /^[A-Za-z0-9_-]{85}[AQgw]$/u;
const artifactNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u;
const artifactDigestPattern = /^sha256:[0-9a-f]{64}$/u;
const workflowRunIdPattern = /^[1-9][0-9]{0,19}$/u;

export type AgentEvaluationProductionRunConfigArtifactBinding = Readonly<{
  format: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_FORMAT;
  version: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_VERSION;
  sourcePlanArtifactName: string;
  sourcePlanArtifactDigest: string;
  sourcePlanWorkflowRunId: string;
  sourcePlanWorkflowRunAttempt: number;
  runConfigFileName: typeof AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME;
  runConfigByteLength: number;
  runConfigCanonicalBytesDigest: CanonicalDigest;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  bindingDigest: CanonicalDigest;
}>;

const runConfigArtifactBindingKeys = Object.freeze([
  'format',
  'version',
  'sourcePlanArtifactName',
  'sourcePlanArtifactDigest',
  'sourcePlanWorkflowRunId',
  'sourcePlanWorkflowRunAttempt',
  'runConfigFileName',
  'runConfigByteLength',
  'runConfigCanonicalBytesDigest',
  'sourceConfigDigest',
  'frozenRunDigest',
  'planDigest',
  'repositoryCommit',
  'bindingDigest',
] as const);

export type CreateAgentEvaluationProductionRunConfigArtifactBindingInput = Omit<
  AgentEvaluationProductionRunConfigArtifactBinding,
  'bindingDigest' | 'format' | 'version'
>;

export const createAgentEvaluationProductionRunConfigArtifactBinding = (
  input: CreateAgentEvaluationProductionRunConfigArtifactBindingInput
): AgentEvaluationProductionRunConfigArtifactBinding => {
  if (
    !hasExactAgentControlKeys(input, [
      'sourcePlanArtifactName',
      'sourcePlanArtifactDigest',
      'sourcePlanWorkflowRunId',
      'sourcePlanWorkflowRunAttempt',
      'runConfigFileName',
      'runConfigByteLength',
      'runConfigCanonicalBytesDigest',
      'sourceConfigDigest',
      'frozenRunDigest',
      'planDigest',
      'repositoryCommit',
    ]) ||
    !artifactNamePattern.test(input.sourcePlanArtifactName) ||
    !artifactDigestPattern.test(input.sourcePlanArtifactDigest) ||
    !workflowRunIdPattern.test(input.sourcePlanWorkflowRunId) ||
    !Number.isSafeInteger(input.sourcePlanWorkflowRunAttempt) ||
    input.sourcePlanWorkflowRunAttempt < 1 ||
    input.runConfigFileName !==
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_FILE_NAME ||
    !Number.isSafeInteger(input.runConfigByteLength) ||
    input.runConfigByteLength < 2 ||
    input.runConfigByteLength >
      AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_MAXIMUM_BYTES ||
    !isAgentCanonicalDigest(input.runConfigCanonicalBytesDigest) ||
    input.runConfigCanonicalBytesDigest !== input.sourceConfigDigest ||
    !isAgentCanonicalDigest(input.sourceConfigDigest) ||
    !isAgentCanonicalDigest(input.frozenRunDigest) ||
    !isAgentCanonicalDigest(input.planDigest) ||
    !repositoryCommitPattern.test(input.repositoryCommit)
  ) {
    throw new TypeError(
      'Evaluation production run-config artifact binding is invalid.'
    );
  }
  const base = Object.freeze({
    format: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_FORMAT,
    version: AGENT_EVALUATION_PRODUCTION_RUN_CONFIG_ARTIFACT_BINDING_VERSION,
    ...input,
  });
  return Object.freeze({
    ...base,
    bindingDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationProductionRunConfigArtifactBinding = (
  value: unknown
): value is AgentEvaluationProductionRunConfigArtifactBinding => {
  if (!hasExactAgentControlKeys(value, runConfigArtifactBindingKeys)) {
    return false;
  }
  try {
    const {
      bindingDigest,
      format: _format,
      version: _version,
      ...input
    } = value as AgentEvaluationProductionRunConfigArtifactBinding;
    const canonical =
      createAgentEvaluationProductionRunConfigArtifactBinding(input);
    return (
      bindingDigest === canonical.bindingDigest &&
      sameCanonicalJson(value, canonical) &&
      inspectAgentControlJson(value, 16_384).length === 0
    );
  } catch {
    return false;
  }
};

export type AgentEvaluationFrozenConfigProtectedEnvelope = Readonly<{
  caseId: string;
  fixtureRef: string;
  caseDigest: CanonicalDigest;
  access: 'protected-holdout';
  capabilityDescriptorDigest: CanonicalDigest;
  caseDefinitionDigest: CanonicalDigest;
  expectedAuthorityDigest: CanonicalDigest;
  gradingPolicyDigest: CanonicalDigest;
  resolverRef: string;
  relativePath: string;
  encryptedMaterialDigest: CanonicalDigest;
  encryptionPolicyDigest: CanonicalDigest;
  locatorDigest: CanonicalDigest;
}>;

export type AgentEvaluationFrozenConfigCommitmentBase = Readonly<{
  format: typeof AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_FORMAT;
  version: typeof AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_VERSION;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  protectedHoldoutManifestDigest: CanonicalDigest;
  restrictedMaterialManifestDigest: CanonicalDigest;
  accessPolicyDigest: CanonicalDigest;
  protectedEnvelopeAllowlist: readonly AgentEvaluationFrozenConfigProtectedEnvelope[];
  committedAt: string;
  workflowName: 'g4-real-model-evaluation';
  workflowRunId: string;
  jobId: 'full_shards';
  environmentDigest: CanonicalDigest;
  authorityId: string;
  keyId: string;
  algorithm: 'Ed25519';
}>;

export type AgentEvaluationFrozenConfigCommitmentSigningPayload =
  AgentEvaluationFrozenConfigCommitmentBase &
    Readonly<{ commitmentDigest: CanonicalDigest }>;

export type AgentEvaluationFrozenConfigCommitment =
  AgentEvaluationFrozenConfigCommitmentSigningPayload &
    Readonly<{ signatureBase64Url: string }>;

export type AgentEvaluationEncryptedHoldoutCorpusCommitment = Readonly<{
  encryptedCorpusDigest: CanonicalDigest;
}>;

const protectedEnvelopeKeys = Object.freeze([
  'caseId',
  'fixtureRef',
  'caseDigest',
  'access',
  'capabilityDescriptorDigest',
  'caseDefinitionDigest',
  'expectedAuthorityDigest',
  'gradingPolicyDigest',
  'resolverRef',
  'relativePath',
  'encryptedMaterialDigest',
  'encryptionPolicyDigest',
  'locatorDigest',
] as const);

const commitmentBaseKeys = Object.freeze([
  'format',
  'version',
  'runConfigArtifactBinding',
  'sourceConfigDigest',
  'frozenRunDigest',
  'planDigest',
  'repositoryCommit',
  'protectedHoldoutManifestDigest',
  'restrictedMaterialManifestDigest',
  'accessPolicyDigest',
  'protectedEnvelopeAllowlist',
  'committedAt',
  'workflowName',
  'workflowRunId',
  'jobId',
  'environmentDigest',
  'authorityId',
  'keyId',
  'algorithm',
] as const);

const exact = (value: unknown, keys: readonly string[]): boolean =>
  hasExactAgentControlKeys(value, keys) &&
  inspectAgentControlJson(value, maximumCommitmentBytes).length === 0;

const relativeEnvelopePathIsValid = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 512 &&
  !value.includes('\\') &&
  !value.startsWith('/') &&
  !value.endsWith('/') &&
  value.endsWith('.json') &&
  value
    .split('/')
    .every((segment) => relativeEnvelopeSegmentPattern.test(segment));

const locatorDigestBase = (
  value: Omit<
    AgentEvaluationFrozenConfigProtectedEnvelope,
    'fixtureRef' | 'locatorDigest' | 'relativePath'
  >
) =>
  Object.freeze({
    caseId: value.caseId,
    caseDigest: value.caseDigest,
    access: value.access,
    capabilityDescriptorDigest: value.capabilityDescriptorDigest,
    caseDefinitionDigest: value.caseDefinitionDigest,
    expectedAuthorityDigest: value.expectedAuthorityDigest,
    gradingPolicyDigest: value.gradingPolicyDigest,
    resolverRef: value.resolverRef,
    encryptedMaterialDigest: value.encryptedMaterialDigest,
    encryptionPolicyDigest: value.encryptionPolicyDigest,
  });

export const digestAgentEvaluationFrozenConfigLocator = (
  value: Omit<
    AgentEvaluationFrozenConfigProtectedEnvelope,
    'fixtureRef' | 'locatorDigest' | 'relativePath'
  >
): CanonicalDigest => digestAgentCanonicalValue(locatorDigestBase(value));

export const isAgentEvaluationFrozenConfigProtectedEnvelope = (
  value: unknown
): value is AgentEvaluationFrozenConfigProtectedEnvelope => {
  if (!exact(value, protectedEnvelopeKeys)) return false;
  const envelope = value as AgentEvaluationFrozenConfigProtectedEnvelope;
  return (
    isAgentControlIdentity(envelope.caseId) &&
    isAgentControlIdentity(envelope.fixtureRef) &&
    envelope.access === 'protected-holdout' &&
    isAgentCanonicalDigest(envelope.caseDigest) &&
    isAgentCanonicalDigest(envelope.capabilityDescriptorDigest) &&
    isAgentCanonicalDigest(envelope.caseDefinitionDigest) &&
    isAgentCanonicalDigest(envelope.expectedAuthorityDigest) &&
    isAgentCanonicalDigest(envelope.gradingPolicyDigest) &&
    isAgentControlIdentity(envelope.resolverRef) &&
    relativeEnvelopePathIsValid(envelope.relativePath) &&
    isAgentCanonicalDigest(envelope.encryptedMaterialDigest) &&
    isAgentCanonicalDigest(envelope.encryptionPolicyDigest) &&
    isAgentCanonicalDigest(envelope.locatorDigest) &&
    envelope.locatorDigest ===
      digestAgentEvaluationFrozenConfigLocator(envelope)
  );
};

export const createAgentEvaluationFrozenConfigProtectedEnvelope = (
  input: Omit<AgentEvaluationFrozenConfigProtectedEnvelope, 'locatorDigest'> &
    Readonly<{ locatorDigest?: CanonicalDigest }>
): AgentEvaluationFrozenConfigProtectedEnvelope => {
  const locatorDigest = digestAgentEvaluationFrozenConfigLocator(input);
  if (
    input.locatorDigest !== undefined &&
    input.locatorDigest !== locatorDigest
  ) {
    throw new TypeError('Evaluation frozen config locator digest drifted.');
  }
  const value = Object.freeze({
    caseId: input.caseId,
    fixtureRef: input.fixtureRef,
    caseDigest: input.caseDigest,
    access: input.access,
    capabilityDescriptorDigest: input.capabilityDescriptorDigest,
    caseDefinitionDigest: input.caseDefinitionDigest,
    expectedAuthorityDigest: input.expectedAuthorityDigest,
    gradingPolicyDigest: input.gradingPolicyDigest,
    resolverRef: input.resolverRef,
    relativePath: input.relativePath,
    encryptedMaterialDigest: input.encryptedMaterialDigest,
    encryptionPolicyDigest: input.encryptionPolicyDigest,
    locatorDigest,
  });
  if (!isAgentEvaluationFrozenConfigProtectedEnvelope(value)) {
    throw new TypeError(
      'Evaluation frozen config protected envelope is invalid.'
    );
  }
  return value;
};

const canonicalProtectedEnvelopeAllowlist = (
  values: readonly AgentEvaluationFrozenConfigProtectedEnvelope[]
): readonly AgentEvaluationFrozenConfigProtectedEnvelope[] => {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > maximumProtectedEnvelopeCount
  ) {
    throw new TypeError('Evaluation protected envelope allowlist is invalid.');
  }
  const result = values
    .map((value) => createAgentEvaluationFrozenConfigProtectedEnvelope(value))
    .sort((left, right) => compareUnicodeCodePoints(left.caseId, right.caseId));
  const caseIds = new Set<string>();
  const resolverRefs = new Set<string>();
  const relativePaths = new Set<string>();
  for (const value of result) {
    if (
      caseIds.has(value.caseId) ||
      resolverRefs.has(value.resolverRef) ||
      relativePaths.has(value.relativePath)
    ) {
      throw new TypeError(
        'Evaluation protected envelope allowlist is duplicated.'
      );
    }
    caseIds.add(value.caseId);
    resolverRefs.add(value.resolverRef);
    relativePaths.add(value.relativePath);
  }
  return Object.freeze(result);
};

export const digestAgentEvaluationRestrictedMaterialManifest = (
  values: readonly AgentEvaluationFrozenConfigProtectedEnvelope[]
): CanonicalDigest =>
  digestAgentCanonicalValue(
    values.map(({ caseId, locatorDigest }) => ({ caseId, locatorDigest }))
  );

type AccessPolicyDigestInput = Readonly<{
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  protectedHoldoutManifestDigest: CanonicalDigest;
  protectedEnvelopeAllowlist: readonly AgentEvaluationFrozenConfigProtectedEnvelope[];
}>;

export const digestAgentEvaluationHoldoutAccessPolicy = (
  input: AccessPolicyDigestInput
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_HOLDOUT_ACCESS_POLICY_FORMAT,
    version: 1,
    runConfigArtifactBindingDigest:
      input.runConfigArtifactBinding.bindingDigest,
    sourceConfigDigest: input.sourceConfigDigest,
    frozenRunDigest: input.frozenRunDigest,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    protectedHoldoutManifestDigest: input.protectedHoldoutManifestDigest,
    runtimeZone: 'server',
    purpose: 'protected-holdout-decryption',
    directoryEnvironmentName:
      AGENT_EVALUATION_HOLDOUT_DIRECTORY_ENVIRONMENT_NAME,
    keyEnvironmentName: AGENT_EVALUATION_HOLDOUT_KEY_ENVIRONMENT_NAME,
    keyRef: AGENT_EVALUATION_HOLDOUT_KEY_REF,
    executorPrincipalId: AGENT_EVALUATION_HOLDOUT_EXECUTOR_PRINCIPAL_ID,
    allowlist: input.protectedEnvelopeAllowlist.map((envelope) => ({
      caseId: envelope.caseId,
      caseDigest: envelope.caseDigest,
      access: envelope.access,
      resolverRef: envelope.resolverRef,
      relativePath: envelope.relativePath,
      locatorDigest: envelope.locatorDigest,
      encryptionPolicyDigest: envelope.encryptionPolicyDigest,
    })),
  });

type EncryptedCorpusDigestInput = Readonly<{
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  protectedHoldoutManifestDigest: CanonicalDigest;
  protectedEnvelopeAllowlist: readonly AgentEvaluationFrozenConfigProtectedEnvelope[];
}>;

export const digestAgentEvaluationEncryptedHoldoutCorpus = (
  input: EncryptedCorpusDigestInput
): CanonicalDigest =>
  digestAgentCanonicalValue({
    format: AGENT_EVALUATION_ENCRYPTED_HOLDOUT_CORPUS_FORMAT,
    version: 1,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    protectedHoldoutManifestDigest: input.protectedHoldoutManifestDigest,
    envelopes: input.protectedEnvelopeAllowlist.map((envelope) => ({
      caseId: envelope.caseId,
      resolverRef: envelope.resolverRef,
      relativePath: envelope.relativePath,
      locatorDigest: envelope.locatorDigest,
      encryptedMaterialDigest: envelope.encryptedMaterialDigest,
      encryptionPolicyDigest: envelope.encryptionPolicyDigest,
    })),
  });

const isCanonicalProtectedEnvelopeAllowlist = (
  value: unknown
): value is readonly AgentEvaluationFrozenConfigProtectedEnvelope[] => {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > maximumProtectedEnvelopeCount
  ) {
    return false;
  }
  const caseIds = new Set<string>();
  const resolverRefs = new Set<string>();
  const relativePaths = new Set<string>();
  return value.every((entry, index) => {
    if (!isAgentEvaluationFrozenConfigProtectedEnvelope(entry)) return false;
    if (
      (index > 0 &&
        compareUnicodeCodePoints(value[index - 1]!.caseId, entry.caseId) >=
          0) ||
      caseIds.has(entry.caseId) ||
      resolverRefs.has(entry.resolverRef) ||
      relativePaths.has(entry.relativePath)
    ) {
      return false;
    }
    caseIds.add(entry.caseId);
    resolverRefs.add(entry.resolverRef);
    relativePaths.add(entry.relativePath);
    return true;
  });
};

export const isAgentEvaluationFrozenConfigCommitmentBase = (
  value: unknown
): value is AgentEvaluationFrozenConfigCommitmentBase => {
  if (!exact(value, commitmentBaseKeys)) return false;
  const base = value as AgentEvaluationFrozenConfigCommitmentBase;
  if (
    base.format !== AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_FORMAT ||
    base.version !== AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_VERSION ||
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      base.runConfigArtifactBinding
    ) ||
    !isAgentCanonicalDigest(base.sourceConfigDigest) ||
    !isAgentCanonicalDigest(base.frozenRunDigest) ||
    !isAgentCanonicalDigest(base.planDigest) ||
    !repositoryCommitPattern.test(base.repositoryCommit) ||
    !isAgentCanonicalDigest(base.protectedHoldoutManifestDigest) ||
    !isAgentCanonicalDigest(base.restrictedMaterialManifestDigest) ||
    base.protectedHoldoutManifestDigest !==
      base.restrictedMaterialManifestDigest ||
    !isAgentCanonicalDigest(base.accessPolicyDigest) ||
    !isCanonicalProtectedEnvelopeAllowlist(base.protectedEnvelopeAllowlist) ||
    !isAgentControlInstant(base.committedAt) ||
    base.workflowName !== 'g4-real-model-evaluation' ||
    !isAgentControlIdentity(base.workflowRunId) ||
    base.jobId !== 'full_shards' ||
    !isAgentCanonicalDigest(base.environmentDigest) ||
    !isAgentControlIdentity(base.authorityId) ||
    !isAgentControlIdentity(base.keyId) ||
    base.algorithm !== 'Ed25519'
  ) {
    return false;
  }
  if (
    base.runConfigArtifactBinding.sourceConfigDigest !==
      base.sourceConfigDigest ||
    base.runConfigArtifactBinding.frozenRunDigest !== base.frozenRunDigest ||
    base.runConfigArtifactBinding.planDigest !== base.planDigest ||
    base.runConfigArtifactBinding.repositoryCommit !== base.repositoryCommit ||
    base.runConfigArtifactBinding.sourcePlanWorkflowRunId !== base.workflowRunId
  ) {
    return false;
  }
  const manifestDigest = digestAgentEvaluationRestrictedMaterialManifest(
    base.protectedEnvelopeAllowlist
  );
  return (
    manifestDigest === base.restrictedMaterialManifestDigest &&
    manifestDigest === base.protectedHoldoutManifestDigest &&
    base.accessPolicyDigest === digestAgentEvaluationHoldoutAccessPolicy(base)
  );
};

export type CreateAgentEvaluationFrozenConfigCommitmentBaseInput = Omit<
  AgentEvaluationFrozenConfigCommitmentBase,
  'accessPolicyDigest' | 'format' | 'protectedEnvelopeAllowlist' | 'version'
> &
  Readonly<{
    protectedEnvelopeAllowlist: readonly AgentEvaluationFrozenConfigProtectedEnvelope[];
  }>;

export const createAgentEvaluationFrozenConfigCommitmentBase = (
  input: CreateAgentEvaluationFrozenConfigCommitmentBaseInput
): AgentEvaluationFrozenConfigCommitmentBase => {
  const protectedEnvelopeAllowlist = canonicalProtectedEnvelopeAllowlist(
    input.protectedEnvelopeAllowlist
  );
  const baseWithoutAccessPolicy = Object.freeze({
    format: AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_FORMAT,
    version: AGENT_EVALUATION_FROZEN_CONFIG_COMMITMENT_VERSION,
    runConfigArtifactBinding: input.runConfigArtifactBinding,
    sourceConfigDigest: input.sourceConfigDigest,
    frozenRunDigest: input.frozenRunDigest,
    planDigest: input.planDigest,
    repositoryCommit: input.repositoryCommit,
    protectedHoldoutManifestDigest: input.protectedHoldoutManifestDigest,
    restrictedMaterialManifestDigest: input.restrictedMaterialManifestDigest,
    protectedEnvelopeAllowlist,
    committedAt: input.committedAt,
    workflowName: input.workflowName,
    workflowRunId: input.workflowRunId,
    jobId: input.jobId,
    environmentDigest: input.environmentDigest,
    authorityId: input.authorityId,
    keyId: input.keyId,
    algorithm: input.algorithm,
  });
  const base = Object.freeze({
    ...baseWithoutAccessPolicy,
    accessPolicyDigest: digestAgentEvaluationHoldoutAccessPolicy(
      baseWithoutAccessPolicy
    ),
  });
  if (!isAgentEvaluationFrozenConfigCommitmentBase(base)) {
    throw new TypeError('Evaluation frozen config commitment base is invalid.');
  }
  return base;
};

export const isAgentEvaluationFrozenConfigCommitmentSigningPayload = (
  value: unknown
): value is AgentEvaluationFrozenConfigCommitmentSigningPayload => {
  if (!exact(value, [...commitmentBaseKeys, 'commitmentDigest'])) return false;
  const { commitmentDigest, ...base } = value as Record<string, unknown>;
  return (
    isAgentEvaluationFrozenConfigCommitmentBase(base) &&
    isAgentCanonicalDigest(commitmentDigest) &&
    commitmentDigest === digestAgentCanonicalValue(base)
  );
};

export const createAgentEvaluationFrozenConfigCommitmentSigningPayload = (
  base: AgentEvaluationFrozenConfigCommitmentBase
): AgentEvaluationFrozenConfigCommitmentSigningPayload => {
  if (!isAgentEvaluationFrozenConfigCommitmentBase(base)) {
    throw new TypeError('Evaluation frozen config commitment base is invalid.');
  }
  return Object.freeze({
    ...base,
    commitmentDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentEvaluationFrozenConfigCommitment = (
  value: unknown
): value is AgentEvaluationFrozenConfigCommitment => {
  if (
    !exact(value, [
      ...commitmentBaseKeys,
      'commitmentDigest',
      'signatureBase64Url',
    ])
  ) {
    return false;
  }
  const { signatureBase64Url, ...payload } = value as Record<string, unknown>;
  return (
    typeof signatureBase64Url === 'string' &&
    canonicalEd25519SignaturePattern.test(signatureBase64Url) &&
    isAgentEvaluationFrozenConfigCommitmentSigningPayload(payload)
  );
};

export const createAgentEvaluationFrozenConfigCommitment = (input: {
  payload: AgentEvaluationFrozenConfigCommitmentSigningPayload;
  signatureBase64Url: string;
}): AgentEvaluationFrozenConfigCommitment => {
  const value = Object.freeze({
    ...input.payload,
    signatureBase64Url: input.signatureBase64Url,
  });
  if (!isAgentEvaluationFrozenConfigCommitment(value)) {
    throw new TypeError('Evaluation frozen config commitment is invalid.');
  }
  return value;
};

export const decodeAgentEvaluationFrozenConfigCommitment = (
  value: unknown
): AgentEvaluationFrozenConfigCommitment => {
  if (!isAgentEvaluationFrozenConfigCommitment(value)) {
    throw new TypeError('Evaluation frozen config commitment is invalid.');
  }
  return value;
};
