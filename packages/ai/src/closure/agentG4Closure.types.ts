import type {
  AgentProviderProtocolFamily,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type { AgentEvaluationProductionRunConfigArtifactBinding } from '../evaluation/agentEvaluationFrozenConfigCommitment';

export const AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS = Object.freeze([
  'verify:g4:boundaries',
  'verify:g4:context-policy',
  'verify:g4:provider-capabilities',
  'verify:g4:multimodal',
  'verify:g4:hosted-capabilities',
  'verify:g4:control-plane',
  'verify:g4:proposal-approval',
  'verify:g4:verification',
  'verify:g4:product',
  'verify:g4:security',
  'verify:g4:model-eval:contract',
] as const);

export type AgentG4DeterministicGateId =
  (typeof AGENT_G4_REQUIRED_DETERMINISTIC_GATE_IDS)[number];

export const AGENT_G4_REQUIRED_RECOVERY_CASE_IDS = Object.freeze([
  'awaiting-approval-restart',
  'cancel-late-callback',
  'commit-ack-restart',
  'duplicate-request',
  'late-background-callback',
  'model-stream-restart',
  'tool-execute-restart',
  'verification-restart',
] as const);

export type AgentG4RecoveryCaseId =
  (typeof AGENT_G4_REQUIRED_RECOVERY_CASE_IDS)[number];

export const AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS = Object.freeze([
  'budget-exhaustion',
  'cherry-picked-evaluation',
  'computer-use-authoring',
  'cross-modal-injection',
  'failed-closure',
  'failed-repair',
  'fake-evidence',
  'hidden-tool-effect',
  'holdout-leak',
  'permission-escalation',
  'provider-state-memory',
  'rollback-conflict',
  'secret-leak',
  'stale-approval',
  'text-injection',
] as const);

export type AgentG4NegativeCaseId =
  (typeof AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS)[number];

export type AgentG4GateEvidenceRef = Readonly<{
  gateId: AgentG4DeterministicGateId;
  command: string;
  repositoryCommit: string;
  executionMode: 'local' | 'github-actions';
  runId?: string;
  jobId?: string;
  status: 'passed';
  remoteModelUnits: 0;
  evidenceDigest: CanonicalDigest;
  completedAt: Instant;
  refDigest: CanonicalDigest;
}>;

export type AgentG4GoldenJourneyIdentity = Readonly<{
  projectId: string;
  workspaceId: string;
  baseRevisionDigest: CanonicalDigest;
  targetRevisionDigest: CanonicalDigest;
  taskDigest: CanonicalDigest;
  runDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  proposalDigest: CanonicalDigest;
  previewDigest: CanonicalDigest;
  approvalDigest: CanonicalDigest;
  transactionDigest: CanonicalDigest;
  reverseTransactionDigest: CanonicalDigest;
  commitReceiptDigest: CanonicalDigest;
  verificationPlanDigest: CanonicalDigest;
  verificationEvidenceSetDigest: CanonicalDigest;
  verificationClosureDigest: CanonicalDigest;
  auditDigest: CanonicalDigest;
  productViewDigest: CanonicalDigest;
  journeyDigest: CanonicalDigest;
}>;

export type AgentG4VerificationMatrixSummary = Readonly<{
  planDigest: CanonicalDigest;
  g3ClosureManifestDigest: CanonicalDigest;
  matrixEvidenceDigest: CanonicalDigest;
  evidenceSetDigest: CanonicalDigest;
  closureDigest: CanonicalDigest;
  requiredCellCount: 66;
  totalAttemptCount: number;
  evidenceCount: 66;
  frameworkTargets: readonly ['react-vite', 'vue-vite'];
  surfaces: readonly ['ci', 'export', 'preview'];
  closureVerdict: 'satisfied';
  summaryDigest: CanonicalDigest;
}>;

export type AgentG4RecoveryVerdict = Readonly<{
  caseId: AgentG4RecoveryCaseId;
  evidenceDigest: CanonicalDigest;
  outcome: 'reconciled';
  sideEffectCount: 1;
  generationFenced: true;
  workspaceUnchanged: true;
  auditRecorded: true;
  verdictDigest: CanonicalDigest;
}>;

export type AgentG4NegativeVerdict = Readonly<{
  caseId: AgentG4NegativeCaseId;
  evidenceDigest: CanonicalDigest;
  outcome: 'blocked' | 'fenced' | 'reconciled';
  diagnosticCode: string;
  workspaceUnchanged: true;
  authorityUnexpanded: true;
  auditRecorded: true;
  sensitiveDataAbsent: true;
  failurePreserved: true;
  verdictDigest: CanonicalDigest;
}>;

export type AgentG4ProductParitySummary = Readonly<{
  webViewDigest: CanonicalDigest;
  cliViewDigest: CanonicalDigest;
  auditEventCount: number;
  auditHeadDigest: CanonicalDigest;
  sanitizedAuditDigest: CanonicalDigest;
  parity: 'exact';
  summaryDigest: CanonicalDigest;
}>;

export const AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES = Object.freeze([
  'anthropic-messages',
  'gemini-interactions',
  'openai-responses',
] as const satisfies readonly AgentProviderProtocolFamily[]);

export const AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS = Object.freeze([
  'g4-core-text-tools',
  'g4-document-input',
  'g4-visual-input',
] as const);

export type AgentG4PendingModelEvaluationSummary = Readonly<{
  status: 'pending';
  planDigest: CanonicalDigest;
  requiredAttemptCount: 11_640;
  actualAttemptCount: 0;
  requiredProtocolFamilies: typeof AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES;
  requiredCapabilityProfileIds: typeof AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS;
  summaryDigest: CanonicalDigest;
}>;

export type AgentG4SatisfiedModelEvaluationSummary = Readonly<{
  status: 'satisfied';
  planDigest: CanonicalDigest;
  manifestRef: string;
  manifestDigest: CanonicalDigest;
  bundleDigest: CanonicalDigest;
  evidenceSetDigest: CanonicalDigest;
  runConfigArtifactBinding: AgentEvaluationProductionRunConfigArtifactBinding;
  sourceConfigDigest: CanonicalDigest;
  frozenRunDigest: CanonicalDigest;
  capabilityProbeAdmissionSetDigest: CanonicalDigest;
  capabilityProbeReferenceReceiptSetDigest: CanonicalDigest;
  runtimeFactSourceOwnerRegistrationSetDigest: CanonicalDigest;
  optionalCapabilityFactSourceSetDigest: CanonicalDigest;
  optionalCapabilityFactAuthoritySetDigest: CanonicalDigest;
  endpointSmokeDispatchIntentSetDigest: CanonicalDigest;
  endpointSmokeTransportReceiptSetDigest: CanonicalDigest;
  endpointSmokeResultSpoolReceiptSetDigest: CanonicalDigest;
  endpointSmokeResultSpoolDispositionReceiptSetDigest: CanonicalDigest;
  endpointSmokeValidationFailureReceiptSetDigest: CanonicalDigest;
  endpointSmokeSetDigest: CanonicalDigest;
  preDispatchFailureReceiptSetDigest: CanonicalDigest;
  transportDispatchIntentSetDigest: CanonicalDigest;
  transportReceiptSetDigest: CanonicalDigest;
  providerResultSpoolReceiptSetDigest: CanonicalDigest;
  providerResultSpoolDispositionReceiptSetDigest: CanonicalDigest;
  invocationTurnReceiptSetDigest: CanonicalDigest;
  invocationTurnSetReceiptSetDigest: CanonicalDigest;
  resultSubmissionReceiptSetDigest: CanonicalDigest;
  controlledRuntimeReceiptSetDigest: CanonicalDigest;
  capabilityExecutionReceiptSetDigest: CanonicalDigest;
  verificationAttemptGrantReceiptSetDigest: CanonicalDigest;
  validatedHumanReviewArtifactSetDigest: CanonicalDigest;
  validatedHumanMetricObservationSetDigest: CanonicalDigest;
  reviewLeaseDigest: CanonicalDigest;
  reviewRasterScanReceiptSetDigest: CanonicalDigest;
  reviewCandidateRefSetDigest: CanonicalDigest;
  blindReviewMappingSetDigest: CanonicalDigest;
  sourceReceiptSetDigest: CanonicalDigest;
  executionReceiptSetDigest: CanonicalDigest;
  authorityAttestationDigest: CanonicalDigest;
  archiveAttestationDigest: CanonicalDigest;
  evidenceRootDigest: CanonicalDigest;
  evidenceRootArtifactDigest: CanonicalDigest;
  evidenceRootArtifactSize: number;
  evidenceIndexDigest: CanonicalDigest;
  evidenceIndexArtifactDigest: CanonicalDigest;
  evidenceIndexArtifactSize: number;
  shardSetDigest: CanonicalDigest;
  totalShardBytes: number;
  totalRecordCount: number;
  requiredAttemptCount: 11_640;
  actualAttemptCount: number;
  requiredProtocolFamilies: typeof AGENT_G4_REQUIRED_NATIVE_PROTOCOL_FAMILIES;
  requiredCapabilityProfileIds: typeof AGENT_G4_REQUIRED_CAPABILITY_PROFILE_IDS;
  providerConfigurationIds: readonly string[];
  providerOperatorIds: readonly string[];
  modelFamilyOwnerIds: readonly string[];
  qualificationTargetDigests: readonly CanonicalDigest[];
  holdoutReceiptDigest: CanonicalDigest;
  holdoutExecutionReceiptDigest: CanonicalDigest;
  secretCanarySetDigest: CanonicalDigest;
  protectedHoldoutCanarySetDigest: CanonicalDigest;
  metricReportDigest: CanonicalDigest;
  graderReportDigest: CanonicalDigest;
  humanReviewReportDigest: CanonicalDigest;
  completedAt: Instant;
  expiresAt: Instant;
  summaryDigest: CanonicalDigest;
}>;

export type AgentG4ModelEvaluationSummary =
  AgentG4PendingModelEvaluationSummary | AgentG4SatisfiedModelEvaluationSummary;

export type AgentG4ClosureArtifactRef = Readonly<{
  artifactId: string;
  digest: CanonicalDigest;
  size: number;
  mediaType: string;
  availability: 'available';
  artifactDigest: CanonicalDigest;
}>;

export type AgentG4GoldenClosureManifest = Readonly<{
  manifestId: string;
  targetId: 'authenticated-catalog';
  repositoryCommit: string;
  worktreeState: 'clean' | 'dirty';
  journey: AgentG4GoldenJourneyIdentity;
  verification: AgentG4VerificationMatrixSummary;
  recoveryVerdicts: readonly AgentG4RecoveryVerdict[];
  negativeVerdicts: readonly AgentG4NegativeVerdict[];
  productParity: AgentG4ProductParitySummary;
  deterministicGateEvidence: readonly AgentG4GateEvidenceRef[];
  modelEvaluation: AgentG4ModelEvaluationSummary;
  artifacts: readonly AgentG4ClosureArtifactRef[];
  goldenVerdict: 'satisfied' | 'unsatisfied';
  closureVerdict: 'satisfied' | 'unsatisfied' | 'incomplete' | 'expired';
  completedAt: Instant;
  manifestDigest: CanonicalDigest;
}>;
