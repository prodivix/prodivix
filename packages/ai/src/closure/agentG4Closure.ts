import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
} from '../domain/agentCanonical';
import {
  containsAgentControlCredentialLikeText,
  hasExactAgentControlKeys,
  inspectAgentControlJson,
  isAgentControlIdentity,
  isAgentControlInstant,
} from '../control/agentControlValidation';
import { isAgentEvaluationProductionRunConfigArtifactBinding } from '../evaluation/agentEvaluationFrozenConfigCommitment';
import {
  AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS,
  AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS,
  AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES,
  AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS,
  AGENT_G4_REQUIRED_RECOVERY_CASE_IDS,
  type AgentG4ClosureArtifactRef,
  type AgentG4GateEvidenceRef,
  type AgentG4GoldenClosureManifest,
  type AgentG4GoldenJourneyIdentity,
  type AgentG4ModelEvaluationSummary,
  type AgentG4NegativeVerdict,
  type AgentG4ProductParitySummary,
  type AgentG4RecoveryVerdict,
  type AgentG4SatisfiedModelEvaluationSummary,
  type AgentG4VerificationMatrixSummary,
} from './agentG4Closure.types';

const maximumClosureBytes = 8_388_608;
const maximumClosureArtifactBytes = 536_870_912;
const maximumEvidenceIndexBytes = 8_388_608;
const maximumEvidenceRootBytes = 1_048_576;
const maximumEvidenceArchiveBytes = 8_589_934_592;
const maximumEvidenceArchiveRecords = 2_000_000;
const commitPattern = /^[a-f0-9]{40}$/u;
const diagnosticPattern = /^AI-\d{4}$/u;

const assertSafe = (value: unknown, label: string): void => {
  const issues = inspectAgentControlJson(value, maximumClosureBytes);
  if (issues.length > 0) {
    throw new TypeError(
      `${label} is not bounded safe JSON: ${issues.map(({ message }) => message).join('; ')}`
    );
  }
};

const assertIdentity: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentControlIdentity(value)) {
    throw new TypeError(`${label} is invalid.`);
  }
};

const assertDigest: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentCanonicalDigest(value)) {
    throw new TypeError(`${label} is not a canonical digest.`);
  }
};

const assertInstant: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (!isAgentControlInstant(value)) {
    throw new TypeError(`${label} is not a canonical instant.`);
  }
};

const assertExactText: (
  value: unknown,
  label: string
) => asserts value is string = (value, label) => {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    [...value].length > 512 ||
    containsAgentControlCredentialLikeText(value)
  ) {
    throw new TypeError(`${label} is empty, oversized, or credential-like.`);
  }
};

const canonicalDigestRecord = <T extends object>(
  value: T,
  digestKey: keyof T,
  label: string
): T => {
  const base = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== digestKey)
  );
  const digest = value[digestKey];
  assertDigest(digest, `${label} digest`);
  if (digestAgentCanonicalValue(base) !== digest) {
    throw new TypeError(`${label} digest drifted.`);
  }
  return Object.freeze({ ...value });
};

const canonicalJourney = (
  value: AgentG4GoldenJourneyIdentity
): AgentG4GoldenJourneyIdentity => {
  if (
    !hasExactAgentControlKeys(value, [
      'projectId',
      'workspaceId',
      'baseRevisionDigest',
      'targetRevisionDigest',
      'taskDigest',
      'runDigest',
      'contextPackDigest',
      'proposalDigest',
      'previewDigest',
      'approvalDigest',
      'transactionDigest',
      'reverseTransactionDigest',
      'commitReceiptDigest',
      'verificationPlanDigest',
      'verificationEvidenceSetDigest',
      'verificationClosureDigest',
      'auditDigest',
      'productViewDigest',
      'journeyDigest',
    ])
  ) {
    throw new TypeError('G4 Golden journey shape is invalid.');
  }
  assertIdentity(value.projectId, 'G4 Golden project id');
  assertIdentity(value.workspaceId, 'G4 Golden Workspace id');
  for (const [key, digest] of Object.entries(value)) {
    if (key.endsWith('Digest')) assertDigest(digest, `G4 Golden ${key}`);
  }
  return canonicalDigestRecord(value, 'journeyDigest', 'G4 Golden journey');
};

const canonicalVerification = (
  value: AgentG4VerificationMatrixSummary
): AgentG4VerificationMatrixSummary => {
  if (
    !hasExactAgentControlKeys(value, [
      'planDigest',
      'g3ClosureManifestDigest',
      'matrixEvidenceDigest',
      'evidenceSetDigest',
      'closureDigest',
      'requiredCellCount',
      'totalAttemptCount',
      'evidenceCount',
      'frameworkTargets',
      'surfaces',
      'closureVerdict',
      'summaryDigest',
    ]) ||
    value.requiredCellCount !== 66 ||
    !Number.isSafeInteger(value.totalAttemptCount) ||
    value.totalAttemptCount < 66 ||
    value.evidenceCount !== 66 ||
    value.closureVerdict !== 'satisfied' ||
    !sameCanonicalJson(value.frameworkTargets, ['react-vite', 'vue-vite']) ||
    !sameCanonicalJson(value.surfaces, ['ci', 'export', 'preview'])
  ) {
    throw new TypeError('G4 Verification matrix summary is invalid.');
  }
  for (const [key, digest] of Object.entries(value)) {
    if (key.endsWith('Digest')) assertDigest(digest, `G4 Verification ${key}`);
  }
  return canonicalDigestRecord(
    value,
    'summaryDigest',
    'G4 Verification summary'
  );
};

const canonicalRecovery = (
  value: AgentG4RecoveryVerdict
): AgentG4RecoveryVerdict => {
  if (
    !hasExactAgentControlKeys(value, [
      'caseId',
      'evidenceDigest',
      'outcome',
      'sideEffectCount',
      'generationFenced',
      'workspaceUnchanged',
      'auditRecorded',
      'verdictDigest',
    ]) ||
    !AGENT_G4_REQUIRED_RECOVERY_CASE_IDS.includes(value.caseId) ||
    value.outcome !== 'reconciled' ||
    value.sideEffectCount !== 1 ||
    value.generationFenced !== true ||
    value.workspaceUnchanged !== true ||
    value.auditRecorded !== true
  ) {
    throw new TypeError('G4 recovery verdict is invalid.');
  }
  assertDigest(value.evidenceDigest, 'G4 recovery evidence');
  return canonicalDigestRecord(value, 'verdictDigest', 'G4 recovery verdict');
};

const canonicalNegative = (
  value: AgentG4NegativeVerdict
): AgentG4NegativeVerdict => {
  if (
    !hasExactAgentControlKeys(value, [
      'caseId',
      'evidenceDigest',
      'outcome',
      'diagnosticCode',
      'workspaceUnchanged',
      'authorityUnexpanded',
      'auditRecorded',
      'sensitiveDataAbsent',
      'failurePreserved',
      'verdictDigest',
    ]) ||
    !AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS.includes(value.caseId) ||
    !new Set(['blocked', 'fenced', 'reconciled']).has(value.outcome) ||
    !diagnosticPattern.test(value.diagnosticCode) ||
    value.workspaceUnchanged !== true ||
    value.authorityUnexpanded !== true ||
    value.auditRecorded !== true ||
    value.sensitiveDataAbsent !== true ||
    value.failurePreserved !== true
  ) {
    throw new TypeError('G4 negative verdict is invalid.');
  }
  assertDigest(value.evidenceDigest, 'G4 negative evidence');
  return canonicalDigestRecord(value, 'verdictDigest', 'G4 negative verdict');
};

const canonicalProductParity = (
  value: AgentG4ProductParitySummary
): AgentG4ProductParitySummary => {
  if (
    !hasExactAgentControlKeys(value, [
      'webViewDigest',
      'cliViewDigest',
      'auditEventCount',
      'auditHeadDigest',
      'sanitizedAuditDigest',
      'parity',
      'summaryDigest',
    ]) ||
    value.parity !== 'exact' ||
    value.webViewDigest !== value.cliViewDigest ||
    !Number.isSafeInteger(value.auditEventCount) ||
    value.auditEventCount < 1
  ) {
    throw new TypeError('G4 Web/CLI product parity summary is invalid.');
  }
  for (const [key, digest] of Object.entries(value)) {
    if (key.endsWith('Digest')) assertDigest(digest, `G4 product ${key}`);
  }
  return canonicalDigestRecord(value, 'summaryDigest', 'G4 product parity');
};

const canonicalGateEvidence = (
  value: AgentG4GateEvidenceRef
): AgentG4GateEvidenceRef => {
  if (
    !hasExactAgentControlKeys(
      value,
      [
        'gateId',
        'command',
        'repositoryCommit',
        'executionMode',
        'status',
        'remoteModelUnits',
        'evidenceDigest',
        'completedAt',
        'refDigest',
      ],
      ['runId', 'jobId']
    ) ||
    !AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS.includes(value.gateId) ||
    !commitPattern.test(value.repositoryCommit) ||
    value.status !== 'passed' ||
    value.remoteModelUnits !== 0 ||
    !new Set(['local', 'github-actions']).has(value.executionMode) ||
    (value.executionMode === 'github-actions' &&
      (!value.runId || !value.jobId)) ||
    (value.executionMode === 'local' &&
      (value.runId !== undefined || value.jobId !== undefined))
  ) {
    throw new TypeError('G4 deterministic Gate evidence is invalid.');
  }
  assertExactText(value.command, 'G4 Gate command');
  if (value.runId !== undefined) assertIdentity(value.runId, 'G4 Gate run id');
  if (value.jobId !== undefined) assertIdentity(value.jobId, 'G4 Gate job id');
  assertDigest(value.evidenceDigest, 'G4 Gate evidence');
  assertInstant(value.completedAt, 'G4 Gate completion');
  return canonicalDigestRecord(value, 'refDigest', 'G4 Gate evidence');
};

const assertCanonicalIdentities = (
  values: readonly string[],
  label: string,
  minimum = 1
): readonly string[] => {
  if (
    !Array.isArray(values) ||
    values.length < minimum ||
    new Set(values).size !== values.length ||
    values.some((value) => !isAgentControlIdentity(value)) ||
    values.some(
      (value, index) =>
        index > 0 && compareUnicodeCodePoints(values[index - 1]!, value) >= 0
    )
  ) {
    throw new TypeError(`${label} is not a canonical identity set.`);
  }
  return Object.freeze([...values]);
};

const canonicalModelEvaluation = (
  value: AgentG4ModelEvaluationSummary
): AgentG4ModelEvaluationSummary => {
  const commonKeys = [
    'status',
    'planDigest',
    'requiredAttemptCount',
    'actualAttemptCount',
    'requiredProtocolFamilies',
    'requiredCapabilityProfileIds',
    'summaryDigest',
  ];
  const satisfiedKeys = [
    ...commonKeys,
    'manifestRef',
    'manifestDigest',
    'bundleDigest',
    'evidenceSetDigest',
    'runConfigArtifactBinding',
    'sourceConfigDigest',
    'frozenRunDigest',
    'capabilityProbeAdmissionSetDigest',
    'capabilityProbeReferenceReceiptSetDigest',
    'runtimeFactSourceOwnerRegistrationSetDigest',
    'optionalCapabilityFactSourceSetDigest',
    'optionalCapabilityFactAuthoritySetDigest',
    'endpointSmokeDispatchIntentSetDigest',
    'endpointSmokeTransportReceiptSetDigest',
    'endpointSmokeResultSpoolReceiptSetDigest',
    'endpointSmokeResultSpoolDispositionReceiptSetDigest',
    'endpointSmokeValidationFailureReceiptSetDigest',
    'endpointSmokeSetDigest',
    'preDispatchFailureReceiptSetDigest',
    'transportDispatchIntentSetDigest',
    'transportReceiptSetDigest',
    'providerResultSpoolReceiptSetDigest',
    'providerResultSpoolDispositionReceiptSetDigest',
    'invocationTurnReceiptSetDigest',
    'invocationTurnSetReceiptSetDigest',
    'resultSubmissionReceiptSetDigest',
    'controlledRuntimeReceiptSetDigest',
    'capabilityExecutionReceiptSetDigest',
    'verificationAttemptGrantReceiptSetDigest',
    'validatedHumanReviewArtifactSetDigest',
    'validatedHumanMetricObservationSetDigest',
    'reviewLeaseDigest',
    'reviewRasterScanReceiptSetDigest',
    'reviewCandidateRefSetDigest',
    'blindReviewMappingSetDigest',
    'sourceReceiptSetDigest',
    'executionReceiptSetDigest',
    'authorityAttestationDigest',
    'archiveAttestationDigest',
    'evidenceRootDigest',
    'evidenceRootArtifactDigest',
    'evidenceRootArtifactSize',
    'evidenceIndexDigest',
    'evidenceIndexArtifactDigest',
    'evidenceIndexArtifactSize',
    'shardSetDigest',
    'totalShardBytes',
    'totalRecordCount',
    'providerConfigurationIds',
    'providerOperatorIds',
    'modelFamilyOwnerIds',
    'qualificationTargetDigests',
    'holdoutReceiptDigest',
    'holdoutExecutionReceiptDigest',
    'secretCanarySetDigest',
    'protectedHoldoutCanarySetDigest',
    'metricReportDigest',
    'graderReportDigest',
    'humanReviewReportDigest',
    'completedAt',
    'expiresAt',
  ];
  if (
    !hasExactAgentControlKeys(
      value,
      value.status === 'satisfied' ? satisfiedKeys : commonKeys
    ) ||
    !new Set(['pending', 'satisfied']).has(value.status) ||
    value.requiredAttemptCount !== 11_640 ||
    !sameCanonicalJson(
      value.requiredProtocolFamilies,
      AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES
    ) ||
    !sameCanonicalJson(
      value.requiredCapabilityProfileIds,
      AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS
    )
  ) {
    throw new TypeError('G4 model-evaluation summary is invalid.');
  }
  assertDigest(value.planDigest, 'G4 evaluation plan');
  if (value.status === 'pending') {
    if (value.actualAttemptCount !== 0) {
      throw new TypeError('Pending G4 evaluation cannot claim attempts.');
    }
    return canonicalDigestRecord(
      value,
      'summaryDigest',
      'G4 pending evaluation'
    );
  }
  const satisfied = value as AgentG4SatisfiedModelEvaluationSummary;
  if (
    !Number.isSafeInteger(satisfied.actualAttemptCount) ||
    satisfied.actualAttemptCount < satisfied.requiredAttemptCount ||
    !Number.isSafeInteger(satisfied.evidenceIndexArtifactSize) ||
    satisfied.evidenceIndexArtifactSize < 1 ||
    satisfied.evidenceIndexArtifactSize > maximumEvidenceIndexBytes ||
    !Number.isSafeInteger(satisfied.evidenceRootArtifactSize) ||
    satisfied.evidenceRootArtifactSize < 1 ||
    satisfied.evidenceRootArtifactSize > maximumEvidenceRootBytes ||
    !Number.isSafeInteger(satisfied.totalShardBytes) ||
    satisfied.totalShardBytes < 1 ||
    satisfied.totalShardBytes > maximumEvidenceArchiveBytes ||
    !Number.isSafeInteger(satisfied.totalRecordCount) ||
    satisfied.totalRecordCount < satisfied.actualAttemptCount ||
    satisfied.totalRecordCount > maximumEvidenceArchiveRecords ||
    satisfied.providerConfigurationIds.length < 3 ||
    satisfied.providerOperatorIds.length < 3 ||
    satisfied.modelFamilyOwnerIds.length < 3 ||
    satisfied.qualificationTargetDigests.length < 3 ||
    !isAgentEvaluationProductionRunConfigArtifactBinding(
      satisfied.runConfigArtifactBinding
    ) ||
    satisfied.runConfigArtifactBinding.sourceConfigDigest !==
      satisfied.sourceConfigDigest ||
    satisfied.runConfigArtifactBinding.frozenRunDigest !==
      satisfied.frozenRunDigest ||
    satisfied.runConfigArtifactBinding.planDigest !== satisfied.planDigest ||
    satisfied.holdoutReceiptDigest !== satisfied.holdoutExecutionReceiptDigest
  ) {
    throw new TypeError('Satisfied G4 evaluation is below the frozen floor.');
  }
  assertIdentity(satisfied.manifestRef, 'G4 evaluation manifest ref');
  for (const [key, digest] of Object.entries(satisfied)) {
    if (key.endsWith('Digest')) assertDigest(digest, `G4 evaluation ${key}`);
  }
  assertCanonicalIdentities(
    satisfied.providerConfigurationIds,
    'G4 provider configurations',
    3
  );
  assertCanonicalIdentities(
    satisfied.providerOperatorIds,
    'G4 provider operators',
    3
  );
  assertCanonicalIdentities(
    satisfied.modelFamilyOwnerIds,
    'G4 model-family owners',
    3
  );
  if (
    new Set(satisfied.providerOperatorIds).size < 3 ||
    new Set(satisfied.modelFamilyOwnerIds).size < 3 ||
    satisfied.qualificationTargetDigests.some(
      (digest, index) =>
        !isAgentCanonicalDigest(digest) ||
        (index > 0 &&
          compareUnicodeCodePoints(
            satisfied.qualificationTargetDigests[index - 1]!,
            digest
          ) >= 0)
    )
  ) {
    throw new TypeError(
      'G4 evaluation diversity or qualification set drifted.'
    );
  }
  assertInstant(satisfied.completedAt, 'G4 evaluation completion');
  assertInstant(satisfied.expiresAt, 'G4 evaluation expiry');
  if (Date.parse(satisfied.expiresAt) <= Date.parse(satisfied.completedAt)) {
    throw new TypeError('G4 evaluation expiry must follow completion.');
  }
  return canonicalDigestRecord(
    satisfied,
    'summaryDigest',
    'G4 satisfied evaluation'
  );
};

const canonicalArtifact = (
  value: AgentG4ClosureArtifactRef
): AgentG4ClosureArtifactRef => {
  if (
    !hasExactAgentControlKeys(value, [
      'artifactId',
      'digest',
      'size',
      'mediaType',
      'availability',
      'artifactDigest',
    ]) ||
    value.availability !== 'available' ||
    !Number.isSafeInteger(value.size) ||
    value.size < 1 ||
    value.size > maximumClosureArtifactBytes
  ) {
    throw new TypeError('G4 closure artifact is invalid.');
  }
  assertIdentity(value.artifactId, 'G4 artifact id');
  assertDigest(value.digest, 'G4 artifact content');
  assertExactText(value.mediaType, 'G4 artifact media type');
  return canonicalDigestRecord(value, 'artifactDigest', 'G4 artifact');
};

const exactIdentitySet = (
  values: readonly string[],
  expected: readonly string[]
): boolean => sameCanonicalJson(values, expected);

const closureOutcome = (input: {
  worktreeState: AgentG4GoldenClosureManifest['worktreeState'];
  completedAt: string;
  goldenSatisfied: boolean;
  gateEvidence: readonly AgentG4GateEvidenceRef[];
  modelEvaluation: AgentG4ModelEvaluationSummary;
}): AgentG4GoldenClosureManifest['closureVerdict'] => {
  if (!input.goldenSatisfied) return 'unsatisfied';
  if (input.modelEvaluation.status !== 'satisfied') return 'incomplete';
  if (
    Date.parse(input.completedAt) >= Date.parse(input.modelEvaluation.expiresAt)
  ) {
    return 'expired';
  }
  return input.worktreeState === 'clean' &&
    input.gateEvidence.every(
      ({ executionMode, runId, jobId }) =>
        executionMode === 'github-actions' && Boolean(runId) && Boolean(jobId)
    )
    ? 'satisfied'
    : 'incomplete';
};

export const createAgentG4GoldenClosureManifest = (
  input: Omit<
    AgentG4GoldenClosureManifest,
    'goldenVerdict' | 'closureVerdict' | 'manifestDigest'
  >
): AgentG4GoldenClosureManifest => {
  assertSafe(input, 'G4 Golden Closure manifest');
  assertIdentity(input.manifestId, 'G4 Golden Closure manifest id');
  if (
    input.targetId !== 'authenticated-catalog' ||
    !commitPattern.test(input.repositoryCommit) ||
    !new Set(['clean', 'dirty']).has(input.worktreeState)
  ) {
    throw new TypeError('G4 Golden Closure source identity is invalid.');
  }
  assertInstant(input.completedAt, 'G4 Golden Closure completion');
  const journey = canonicalJourney(input.journey);
  const verification = canonicalVerification(input.verification);
  const recoveryVerdicts = Object.freeze(
    input.recoveryVerdicts
      .map(canonicalRecovery)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.caseId, right.caseId)
      )
  );
  const negativeVerdicts = Object.freeze(
    input.negativeVerdicts
      .map(canonicalNegative)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.caseId, right.caseId)
      )
  );
  const productParity = canonicalProductParity(input.productParity);
  const deterministicGateEvidence = Object.freeze(
    input.deterministicGateEvidence
      .map(canonicalGateEvidence)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.gateId, right.gateId)
      )
  );
  const modelEvaluation = canonicalModelEvaluation(input.modelEvaluation);
  if (
    modelEvaluation.status === 'satisfied' &&
    Date.parse(modelEvaluation.completedAt) > Date.parse(input.completedAt)
  ) {
    throw new TypeError(
      'G4 Closure cannot predate its real-model evaluation evidence.'
    );
  }
  const artifacts = Object.freeze(
    input.artifacts
      .map(canonicalArtifact)
      .sort((left, right) =>
        compareUnicodeCodePoints(left.artifactId, right.artifactId)
      )
  );
  if (modelEvaluation.status === 'satisfied') {
    const expectedIndexArtifactId = `g4-model-evaluation-index:${modelEvaluation.evidenceIndexDigest.slice('sha256-'.length)}`;
    const expectedRootArtifactId = `g4-model-evaluation-root:${modelEvaluation.evidenceRootDigest.slice('sha256-'.length)}`;
    const indexArtifacts = artifacts.filter(
      ({ artifactId }) => artifactId === expectedIndexArtifactId
    );
    const rootArtifacts = artifacts.filter(
      ({ artifactId }) => artifactId === expectedRootArtifactId
    );
    if (
      indexArtifacts.length !== 1 ||
      indexArtifacts[0]!.digest !==
        modelEvaluation.evidenceIndexArtifactDigest ||
      indexArtifacts[0]!.size !== modelEvaluation.evidenceIndexArtifactSize ||
      indexArtifacts[0]!.mediaType !==
        'application/vnd.prodivix.agent-model-evaluation-evidence-index+json' ||
      rootArtifacts.length !== 1 ||
      rootArtifacts[0]!.digest !== modelEvaluation.evidenceRootArtifactDigest ||
      rootArtifacts[0]!.size !== modelEvaluation.evidenceRootArtifactSize ||
      rootArtifacts[0]!.mediaType !==
        'application/vnd.prodivix.agent-model-evaluation-evidence-root+json'
    ) {
      throw new TypeError(
        'G4 Closure must bind the exact signed real-model evidence index and root artifacts.'
      );
    }
  }
  const expectedGates = [...AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS].sort(
    compareUnicodeCodePoints
  );
  const expectedRecovery = [...AGENT_G4_REQUIRED_RECOVERY_CASE_IDS].sort(
    compareUnicodeCodePoints
  );
  const expectedNegatives = [...AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS].sort(
    compareUnicodeCodePoints
  );
  if (
    !exactIdentitySet(
      deterministicGateEvidence.map(({ gateId }) => gateId),
      expectedGates
    ) ||
    !exactIdentitySet(
      recoveryVerdicts.map(({ caseId }) => caseId),
      expectedRecovery
    ) ||
    !exactIdentitySet(
      negativeVerdicts.map(({ caseId }) => caseId),
      expectedNegatives
    ) ||
    deterministicGateEvidence.some(
      ({ repositoryCommit, completedAt }) =>
        repositoryCommit !== input.repositoryCommit ||
        Date.parse(completedAt) > Date.parse(input.completedAt)
    ) ||
    artifacts.length < 3
  ) {
    throw new TypeError(
      'G4 Golden Closure required evidence set is incomplete.'
    );
  }
  const goldenSatisfied =
    verification.closureVerdict === 'satisfied' &&
    recoveryVerdicts.length === expectedRecovery.length &&
    negativeVerdicts.length === expectedNegatives.length &&
    productParity.parity === 'exact' &&
    artifacts.every(({ availability }) => availability === 'available');
  const goldenVerdict = goldenSatisfied ? 'satisfied' : 'unsatisfied';
  const closureVerdict = closureOutcome({
    worktreeState: input.worktreeState,
    completedAt: input.completedAt,
    goldenSatisfied,
    gateEvidence: deterministicGateEvidence,
    modelEvaluation,
  });
  const base = Object.freeze({
    manifestId: input.manifestId,
    targetId: input.targetId,
    repositoryCommit: input.repositoryCommit,
    worktreeState: input.worktreeState,
    journey,
    verification,
    recoveryVerdicts,
    negativeVerdicts,
    productParity,
    deterministicGateEvidence,
    modelEvaluation,
    artifacts,
    goldenVerdict,
    closureVerdict,
    completedAt: input.completedAt,
  });
  return Object.freeze({
    ...base,
    manifestDigest: digestAgentCanonicalValue(base),
  });
};

export const isAgentG4GoldenClosureManifest = (
  value: unknown
): value is AgentG4GoldenClosureManifest => {
  try {
    if (
      !hasExactAgentControlKeys(value, [
        'manifestId',
        'targetId',
        'repositoryCommit',
        'worktreeState',
        'journey',
        'verification',
        'recoveryVerdicts',
        'negativeVerdicts',
        'productParity',
        'deterministicGateEvidence',
        'modelEvaluation',
        'artifacts',
        'goldenVerdict',
        'closureVerdict',
        'completedAt',
        'manifestDigest',
      ]) ||
      !isAgentCanonicalDigest(value.manifestDigest)
    ) {
      return false;
    }
    const candidate = value as AgentG4GoldenClosureManifest;
    const {
      goldenVerdict: _goldenVerdict,
      closureVerdict: _closureVerdict,
      manifestDigest: _manifestDigest,
      ...input
    } = candidate;
    return sameCanonicalJson(
      createAgentG4GoldenClosureManifest(input),
      candidate
    );
  } catch {
    return false;
  }
};
