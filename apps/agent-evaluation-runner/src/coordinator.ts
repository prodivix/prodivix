import {
  AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
  AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES,
  AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT,
  createAgentEvaluationValidatedHumanReviewArtifact,
  createAgentEvaluationValidatedHumanMetricObservations,
  createAgentHumanReviewRating,
  createAgentHumanReviewReport,
  digestAgentCanonicalValue,
  digestAgentEvaluationBlindReviewMappingRefSet,
  digestAgentEvaluationInvocationTurnReceiptSet,
  digestAgentEvaluationValidatedHumanMetricObservationSet,
  isAgentEvaluationReviewCandidate,
  isAgentEvaluationExecutionReceipt,
  isAgentEvaluationInvocationTurnReceipt,
  isAgentEvaluationInvocationTurnSetReceipt,
  isAgentEvaluationReviewCandidateRef,
  isAgentEvaluationReviewRasterScanReceipt,
  isAgentEvaluationValidatedHumanReviewArtifact,
  isAgentEvaluationValidatedHumanMetricObservation,
  isAgentHumanReviewReport,
  isAgentModelEvaluationManifest,
  isAgentModelEvaluationAttempt,
  planAgentModelEvaluationAttempts,
  scanAndRedactAgentEvaluationPublicArtifact,
  scanAgentArtifactForProtectedHoldoutLeak,
  scanAgentArtifactForSecretCanaries,
  validateAgentEvaluationEvidenceAuthenticity,
  validateAgentModelEvaluationPlan,
  type AgentBudgetDemand,
  type AgentBudgetLedgerState,
  type AgentEvaluationEndpointSmokeReceipt,
  type AgentEvaluationEndpointSmokeDispatchIntent,
  type AgentEvaluationEndpointSmokeResultSpoolReceipt,
  type AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt,
  type AgentEvaluationEndpointSmokeValidationFailureReceipt,
  type AgentEvaluationCapabilityExecutionReceipt,
  type AgentEvaluationCapabilitySpecificReceipt,
  type AgentEvaluationAttemptAuthorityOwnerReceipt,
  type AgentEvaluationExecutionReceipt,
  type AgentEvaluationGraderReport,
  type AgentEvaluationHumanReviewArtifactAuthority,
  type AgentEvaluationHumanReviewArtifactPayload,
  type AgentEvaluationHumanReviewImport,
  type AgentEvaluationHumanReviewAdjudicationPolicy,
  type AgentEvaluationHumanReviewTrustRegistry,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationBlindReviewMappingRef,
  type AgentEvaluationInvocationTurnReceipt,
  type AgentEvaluationInvocationTurnSetReceipt,
  type AgentEvaluationProviderResultSpoolDispositionReceipt,
  type AgentEvaluationProviderResultSpoolReceipt,
  type AgentEvaluationProviderCapabilityObservationReceipt,
  type AgentEvaluationPreDispatchFailureReceipt,
  type AgentEvaluationResultSubmissionReceipt,
  type AgentEvaluationReviewRasterScanReceipt,
  type AgentEvaluationMetricReport,
  type AgentEvaluationReviewCandidate,
  type AgentEvaluationReviewCandidateRef,
  type AgentEvaluationShardCheckpoint,
  type AgentEvaluationShardRunResult,
  type AgentEvaluationSourceReceipt,
  type AgentEvaluationTransportDispatchIntent,
  type AgentEvaluationValidatedHumanReviewArtifact,
  type AgentEvaluationValidatedHumanMetricObservation,
  type AgentEvaluationVerificationAttemptGrantReceipt,
  type AgentEvaluationTransportReceipt as AgentEvaluationEvidenceTransportReceipt,
  type AgentHoldoutExecutionReceipt,
  type AgentHumanReviewReport,
  type AgentModelEvaluationAttempt,
  type AgentModelEvaluationAuthorityPayload,
  type AgentModelEvaluationManifest,
  type AgentModelEvaluationPlan,
} from '@prodivix/ai';
export type {
  AgentEvaluationHumanReviewAdjudicationDecision,
  AgentEvaluationHumanReviewArtifactAuthority,
  AgentEvaluationHumanReviewArtifactPayload,
  AgentEvaluationHumanReviewCandidateAdjudication,
  AgentEvaluationHumanReviewImport,
  AgentEvaluationHumanReviewIndependenceAttestation,
  AgentEvaluationHumanReviewSignedRating,
  AgentEvaluationHumanReviewSourceProvenance,
  AgentEvaluationHumanReviewValidationReceipt,
  AgentEvaluationValidatedHumanReviewArtifact,
} from '@prodivix/ai';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  decodeCanonicalBase64,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  validateAgentEvaluationPublicReviewRubric,
  type AgentEvaluationPublicReviewRubric,
} from './reviewWorkflow';
import {
  decodeAgentEvaluationHumanReviewImport,
  humanReviewArtifactPayloadFromImport,
} from './reviewValidation';
import type { AgentEvaluationEvidenceArchiveExportInput } from './evidenceArchiveExporter';

const coordinatorFormatPrefix = 'prodivix.g4-model-evaluation';
const identityPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const digestPattern = /^sha256-[0-9a-f]{64}$/u;
const commitPattern = /^[0-9a-f]{40}$/u;
const utf8Encoder = new TextEncoder();

export const AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES = 18;
export const AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANONICAL_BYTES = 67_108_864;

export const AGENT_EVALUATION_COORDINATOR_ERROR_CODES = Object.freeze({
  artifactUnsafe: 'artifact-unsafe',
  evidenceInvalid: 'evidence-invalid',
  incomplete: 'evaluation-incomplete',
  inputInvalid: 'input-invalid',
  partitionMismatch: 'partition-mismatch',
  persistenceConflict: 'persistence-conflict',
  runnerFailed: 'runner-failed',
  signatureInvalid: 'signature-invalid',
} as const);

export type AgentEvaluationCoordinatorErrorCode =
  (typeof AGENT_EVALUATION_COORDINATOR_ERROR_CODES)[keyof typeof AGENT_EVALUATION_COORDINATOR_ERROR_CODES];

export class AgentEvaluationCoordinatorError extends Error {
  readonly code: AgentEvaluationCoordinatorErrorCode;

  constructor(code: AgentEvaluationCoordinatorErrorCode) {
    super(`Agent evaluation coordinator failed (${code}).`);
    this.name = 'AgentEvaluationCoordinatorError';
    this.code = code;
  }
}

export type AgentEvaluationPartition = Readonly<{
  planDigest: string;
  repositoryCommit: string;
}>;

export type AgentEvaluationDurableSnapshot = Readonly<{
  partition: AgentEvaluationPartition;
  plan: AgentModelEvaluationPlan;
  attempts: readonly AgentModelEvaluationAttempt[];
  checkpoints: readonly AgentEvaluationShardCheckpoint[];
  budgetLedger: AgentBudgetLedgerState;
  endpointSmokeReceipts: readonly AgentEvaluationEndpointSmokeReceipt[];
  endpointSmokeDispatchIntents: readonly AgentEvaluationEndpointSmokeDispatchIntent[];
  endpointSmokeTransportReceipts: readonly AgentEvaluationEvidenceTransportReceipt[];
  endpointSmokeResultSpoolReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolReceipt[];
  endpointSmokeResultSpoolDispositionReceipts: readonly AgentEvaluationEndpointSmokeResultSpoolDispositionReceipt[];
  endpointSmokeValidationFailureReceipts: readonly AgentEvaluationEndpointSmokeValidationFailureReceipt[];
  preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
  transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
  transportReceipts: readonly AgentEvaluationEvidenceTransportReceipt[];
  providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
  providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
  providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
  invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
  invocationTurnSetReceipts: readonly AgentEvaluationInvocationTurnSetReceipt[];
  resultSubmissionReceipts: readonly AgentEvaluationResultSubmissionReceipt[];
  controlledRuntimeReceipts: readonly AgentEvaluationControlledRuntimeReceipt[];
  capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
  capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  sourceReceipts: readonly AgentEvaluationSourceReceipt[];
  executionReceipts: readonly AgentEvaluationExecutionReceipt[];
  reviewRasterScanReceipts: readonly AgentEvaluationReviewRasterScanReceipt[];
  reviewCandidateRefs: readonly AgentEvaluationReviewCandidateRef[];
  blindReviewMappingRefs: readonly AgentEvaluationBlindReviewMappingRef[];
  validatedHumanReviewArtifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[];
  validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
  metricReport?: AgentEvaluationMetricReport;
  graderReport?: AgentEvaluationGraderReport;
  humanReviewReport?: AgentHumanReviewReport;
  holdoutExecutionReceipt?: AgentHoldoutExecutionReceipt;
  manifest?: AgentModelEvaluationManifest;
}>;

export interface AgentEvaluationCoordinatorFilePort {
  readJson(path: string): Promise<unknown>;
  /** Reads JSON only when its exact UTF-8 bytes already equal canonicalJsonText(value). */
  readCanonicalJson?(path: string): Promise<unknown>;
  writeCanonicalJson(path: string, value: unknown): Promise<void>;
  /** Must use exclusive creation; an existing path is a hard failure. */
  createCanonicalJson(path: string, value: unknown): Promise<void>;
}

export interface AgentEvaluationProductionPlanFactory {
  create(
    input: Readonly<{
      config: unknown;
      repositoryCommit: string;
      now: string;
    }>
  ): AgentModelEvaluationPlan | Promise<AgentModelEvaluationPlan>;
}

export type AgentEvaluationLedgerBudgetReservation = Readonly<{
  reservationId: string;
  revision: number;
}>;

/**
 * Async durable boundary implemented by the PostgreSQL ledger client. Every
 * method is partition-bound and must use canonical bytes plus immutable replay.
 */
export interface AgentEvaluationCoordinatorLedger {
  putPlan(plan: AgentModelEvaluationPlan): Promise<void>;
  snapshot(): Promise<AgentEvaluationDurableSnapshot>;
  reserveBudget(
    input: Readonly<{
      reservationId: string;
      demand: AgentBudgetDemand;
      reservedAt: string;
    }>
  ): Promise<AgentEvaluationLedgerBudgetReservation>;
  settleBudget(
    input: Readonly<{
      reservationId: string;
      actual: AgentBudgetDemand;
      settledAt: string;
    }>
  ): Promise<void>;
  reconcileBudget(
    input: Readonly<{
      reservationId: string;
      reason: 'ack-loss' | 'provider-disconnect' | 'timeout' | 'worker-loss';
      settledAt: string;
    }>
  ): Promise<void>;
  putEndpointSmokeReceipt(
    receipt: AgentEvaluationEndpointSmokeReceipt
  ): Promise<void>;
  putSourceReceipt(receipt: AgentEvaluationSourceReceipt): Promise<void>;
  putHumanReviewReport(report: AgentHumanReviewReport): Promise<void>;
  putValidatedHumanReview(
    input: Readonly<{
      artifact: AgentEvaluationValidatedHumanReviewArtifact;
      humanReviewReport: AgentHumanReviewReport;
      validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
    }>
  ): Promise<void>;
  putHoldoutExecutionReceipt(
    receipt: AgentHoldoutExecutionReceipt
  ): Promise<void>;
  putFinalization(
    input: Readonly<{
      metricReport: AgentEvaluationMetricReport;
      graderReport: AgentEvaluationGraderReport;
      humanReviewReport: AgentHumanReviewReport;
      holdoutExecutionReceipt: AgentHoldoutExecutionReceipt;
      manifest: AgentModelEvaluationManifest;
    }>
  ): Promise<void>;
}

export interface AgentEvaluationCoordinatorLedgerFactory {
  open(partition: AgentEvaluationPartition): AgentEvaluationCoordinatorLedger;
}

export interface AgentEvaluationCoordinatorShardRunner {
  run(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId: string;
      signal?: AbortSignal;
    }>
  ): Promise<AgentEvaluationShardRunResult>;
}

export interface AgentEvaluationCoordinatorShardRunnerFactory {
  create(
    input: Readonly<{
      partition: AgentEvaluationPartition;
      ledger: AgentEvaluationCoordinatorLedger;
    }>
  ): AgentEvaluationCoordinatorShardRunner;
}

export interface AgentEvaluationCoordinatorHoldoutSealer {
  sealIfComplete(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      ledger: AgentEvaluationCoordinatorLedger;
    }>
  ): Promise<'pending' | 'sealed'>;
}

export type AgentEvaluationSmokeQualificationReport = Readonly<{
  format: 'prodivix.g4-model-evaluation-smoke-qualification';
  version: 2;
  planDigest: string;
  repositoryCommit: string;
  endpointSmokeDispatchIntentSetDigest: string;
  endpointSmokeTransportReceiptSetDigest: string;
  endpointSmokeResultSpoolReceiptSetDigest: string;
  endpointSmokeResultSpoolDispositionReceiptSetDigest: string;
  endpointSmokeReceiptSetDigest: string;
  qualifiedTargetCount: number;
  budgetReservationId: string;
  outcome: 'completed' | 'failed';
  failureCode: string | null;
  completedAt: string;
  reportDigest: string;
}>;

/**
 * Server-side smoke qualification owns reserve-before-dispatch, the five
 * immutable endpoint journals, encrypted result spools, atomic settlement and
 * exact replay. The coordinator only publishes its bounded sanitized report.
 */
export interface AgentEvaluationCoordinatorSmokeQualifier {
  qualify(
    input: Readonly<{
      config: unknown;
      plan: AgentModelEvaluationPlan;
    }>
  ): Promise<AgentEvaluationSmokeQualificationReport>;
}

/** Bounded server projection; production implementations must not load facts. */
export interface AgentEvaluationCoordinatorStatusSource {
  load(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      shardId?: string;
      observedAt: string;
    }>
  ): Promise<AgentEvaluationStatusReport>;
}

export type AgentEvaluationReviewLeaseEvidence = Readonly<{
  planDigest: string;
  repositoryCommit: string;
  reviewLeaseDigest: string;
  blindReviewMappingSetDigest: string;
  attempts: readonly AgentModelEvaluationAttempt[];
  invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
  invocationTurnSetReceipts: readonly AgentEvaluationInvocationTurnSetReceipt[];
  executionReceipts: readonly AgentEvaluationExecutionReceipt[];
  reviewRasterScanReceipts: readonly AgentEvaluationReviewRasterScanReceipt[];
  reviewCandidateRefs: readonly AgentEvaluationReviewCandidateRef[];
}>;

/** Opens or reopens one immutable server-side machine-review phase lease. */
export interface AgentEvaluationCoordinatorReviewLeaseSource {
  open(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      expectedReviewLeaseDigest?: string;
    }>
  ): Promise<AgentEvaluationReviewLeaseEvidence>;
}

export type AgentEvaluationFinalizationInspection = Readonly<{
  format: 'prodivix.g4-model-evaluation-finalization-inspection';
  version: 1;
  planDigest: string;
  repositoryCommit: string;
  missingFacts: readonly string[];
  reviewedAttempts: readonly AgentModelEvaluationAttempt[];
  validatedHumanReviewArtifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[];
  validatedHumanMetricObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
  humanReviewReport?: AgentHumanReviewReport;
  inspectionDigest: string;
}>;

/** Bounded server-side closure over sealed family roots and singleton facts. */
export interface AgentEvaluationCoordinatorFinalizationService {
  resolveIntent(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      proposedCompletedAt: string;
    }>
  ): Promise<AgentEvaluationFinalizationIntent>;
  inspect(
    input: Readonly<{ plan: AgentModelEvaluationPlan }>
  ): Promise<AgentEvaluationFinalizationInspection>;
  finalize(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      completedAt: string;
      reviewLeaseDigest: string;
      validatedHumanReviewArtifactDigest: string;
      validatedHumanMetricObservationSetDigest: string;
    }>
  ): Promise<AgentEvaluationFinalizationReport>;
}

export type AgentEvaluationFinalizationIntent = Readonly<{
  planDigest: string;
  repositoryCommit: string;
  completedAt: string;
  intentDigest: string;
  replayed: boolean;
}>;

export interface AgentEvaluationBlindReviewArtifactSource {
  load(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      attempt: AgentModelEvaluationAttempt;
      invocationReceipt: AgentEvaluationInvocationTurnReceipt;
    }>
  ): Promise<AgentEvaluationReviewCandidate>;
}

export interface AgentEvaluationPublicReviewRubricSource {
  load(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      rubricDigest: string;
    }>
  ): Promise<AgentEvaluationPublicReviewRubric>;
}

export type AgentEvaluationBlindReviewMapping = Readonly<{
  format: 'prodivix.g4-model-evaluation-blind-review-mapping';
  version: 1;
  mappingId: string;
  planDigest: string;
  repositoryCommit: string;
  candidateId: string;
  attemptId: string;
  candidateDigest: string;
  bytesDigest: string;
  rubricDigest: string;
  randomizedPresentationPolicyDigest: string;
  randomizedPresentationId: string;
  createdAt: string;
  mappingDigest: string;
}>;

export interface AgentEvaluationBlindReviewMappingStore {
  getOrCreate(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      candidateRef: AgentEvaluationReviewCandidateRef;
      rubricDigest: string;
      createdAt: string;
    }>
  ): Promise<AgentEvaluationBlindReviewMapping>;
  load(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      candidateRef: AgentEvaluationReviewCandidateRef;
      rubricDigest: string;
    }>
  ): Promise<AgentEvaluationBlindReviewMapping>;
}

export interface AgentEvaluationReviewerIndependenceVerifier {
  verifyArtifact(
    input: Readonly<{
      payload: AgentEvaluationHumanReviewArtifactPayload;
      authority: AgentEvaluationHumanReviewArtifactAuthority;
    }>
  ): boolean | Promise<boolean>;
  verify(
    input: Readonly<{
      planDigest: string;
      reviewerPseudonym: string;
      reviewerAuthorityDigest: string;
      independenceAttestationDigest: string;
      testedModelFamilyOwnerIds: readonly string[];
    }>
  ): boolean | Promise<boolean>;
}

export interface AgentEvaluationHumanReviewImportVerifier {
  verify(
    input: Readonly<{
      plan: AgentModelEvaluationPlan;
      artifact: AgentEvaluationHumanReviewImport;
    }>
  ):
    | AgentEvaluationHumanReviewAuthorityContext
    | undefined
    | Promise<AgentEvaluationHumanReviewAuthorityContext | undefined>;
}

export type AgentEvaluationHumanReviewAuthorityContext = Readonly<{
  publicRubrics: readonly AgentEvaluationPublicReviewRubric[];
  trustRegistry: AgentEvaluationHumanReviewTrustRegistry;
  adjudicationPolicy: AgentEvaluationHumanReviewAdjudicationPolicy;
  randomizedPresentationPolicyDigest: string;
}>;

export type AgentEvaluationAttestationIdentity = Readonly<{
  authorityId: string;
  keyId: string;
  publicKeyBase64Url: string;
  workflowName: string;
  workflowRunId: string;
  workflowRunAttempt: number;
  jobId: string;
  environmentDigest: string;
}>;

export interface AgentEvaluationAuthoritySigner {
  identity():
    | AgentEvaluationAttestationIdentity
    | Promise<AgentEvaluationAttestationIdentity>;
  sign(
    input: Readonly<{
      payload: AgentModelEvaluationAuthorityPayload;
      message: Uint8Array;
    }>
  ): Promise<string>;
  verify(
    input: Readonly<{
      publicKeyBase64Url: string;
      signatureBase64Url: string;
      message: Uint8Array;
    }>
  ): boolean | Promise<boolean>;
}

/** Resolves a signer only after the exact plan is known and cross-bound. */
export interface AgentEvaluationAuthoritySignerFactory {
  create(
    input: Readonly<{ plan: AgentModelEvaluationPlan }>
  ): AgentEvaluationAuthoritySigner | Promise<AgentEvaluationAuthoritySigner>;
}

export interface AgentEvaluationCanarySource {
  secretCanaries(): readonly string[] | Promise<readonly string[]>;
  protectedHoldoutCanaries(): readonly string[] | Promise<readonly string[]>;
}

export type AgentEvaluationPlanCommand = Readonly<{
  configPath: string;
  outputPath: string;
  shardsOutputPath: string;
}>;

export type AgentEvaluationSmokeCommand = Readonly<{
  configPath: string;
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationRunShardCommand = Readonly<{
  planPath: string;
  shardId: string;
  signal?: AbortSignal;
}>;

export type AgentEvaluationStatusCommand = Readonly<{
  planPath: string;
  shardId?: string;
  outputPath: string;
}>;

export type AgentEvaluationExportReviewCommand = Readonly<{
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationImportReviewCommand = Readonly<{
  planPath: string;
  inputPath: string;
}>;

export type AgentEvaluationFinalizeCommand = Readonly<{
  planPath: string;
  outputPath: string;
}>;

export type AgentEvaluationExportEvidenceCommand = Readonly<{
  planPath: string;
  manifestPath: string;
  archiveOutputPath: string;
  rootOutputPath: string;
}>;

export type AgentEvaluationValidateReviewCommand = Readonly<{
  reviewBundlePath: string;
  submissionId: string;
  inboxRoot: string;
  sourceRunId: string;
  sourceRunAttempt: number;
  sourceArtifactName: string;
  /** GitHub REST artifact digest; this deliberately uses the sha256: namespace. */
  sourceArtifactDigest: string;
  configPath: string;
  outputPath: string;
}>;

export interface AgentEvaluationReviewValidationService {
  validate(
    input: AgentEvaluationValidateReviewCommand
  ): Promise<AgentEvaluationHumanReviewImport>;
}

export interface AgentEvaluationCommandCoordinator {
  plan(input: AgentEvaluationPlanCommand): Promise<unknown>;
  smoke(input: AgentEvaluationSmokeCommand): Promise<unknown>;
  runShard(input: AgentEvaluationRunShardCommand): Promise<unknown>;
  status(input: AgentEvaluationStatusCommand): Promise<unknown>;
  exportReview(input: AgentEvaluationExportReviewCommand): Promise<unknown>;
  importReview(input: AgentEvaluationImportReviewCommand): Promise<unknown>;
  finalize(input: AgentEvaluationFinalizeCommand): Promise<unknown>;
  exportEvidence(input: AgentEvaluationExportEvidenceCommand): Promise<unknown>;
  validateReview(input: AgentEvaluationValidateReviewCommand): Promise<unknown>;
}

export type AgentEvaluationCoordinatorDependencies = Readonly<{
  files: AgentEvaluationCoordinatorFilePort;
  planFactory: AgentEvaluationProductionPlanFactory;
  ledgerFactory: AgentEvaluationCoordinatorLedgerFactory;
  shardRunnerFactory: AgentEvaluationCoordinatorShardRunnerFactory;
  holdoutSealer: AgentEvaluationCoordinatorHoldoutSealer;
  smokeQualifier: AgentEvaluationCoordinatorSmokeQualifier;
  statusSource: AgentEvaluationCoordinatorStatusSource;
  reviewLeaseSource: AgentEvaluationCoordinatorReviewLeaseSource;
  finalizationService: AgentEvaluationCoordinatorFinalizationService;
  reviewArtifactSource: AgentEvaluationBlindReviewArtifactSource;
  reviewRubrics: AgentEvaluationPublicReviewRubricSource;
  blindReviewMappings: AgentEvaluationBlindReviewMappingStore;
  reviewValidator?: AgentEvaluationReviewValidationService;
  reviewImportVerifier?: AgentEvaluationHumanReviewImportVerifier;
  evidenceArchiveExporter: Readonly<{
    export(input: AgentEvaluationEvidenceArchiveExportInput): Promise<unknown>;
  }>;
  canaries: AgentEvaluationCanarySource;
  repositoryCommit: () => string | Promise<string>;
  now: () => string;
}>;

type AgentEvaluationShardManifest = Readonly<{
  format: 'prodivix.g4-model-evaluation-shards';
  version: 1;
  planDigest: string;
  repositoryCommit: string;
  plannedAttemptCount: number;
  shards: readonly Readonly<{
    shardId: string;
    descriptorCount: number;
    descriptorSetDigest: string;
  }>[];
  manifestDigest: string;
}>;

export type AgentEvaluationStatusReport = Readonly<{
  format: 'prodivix.g4-model-evaluation-status';
  version: 1;
  planDigest: string;
  repositoryCommit: string;
  shardId?: string;
  plannedAttemptCount: number;
  recordedAttemptCount: number;
  missingAttemptCount: number;
  missingAttemptSetDigest: string;
  attemptStatusCounts: Readonly<Record<string, number>>;
  checkpointCounts: Readonly<Record<string, number>>;
  unsettledBudgetReservationCount: number;
  endpointSmokeDispatchIntentCount: number;
  endpointSmokeTransportReceiptCount: number;
  endpointSmokeResultSpoolReceiptCount: number;
  endpointSmokeResultSpoolDispositionReceiptCount: number;
  endpointSmokeValidationFailureReceiptCount: number;
  endpointSmokeReceiptCount: number;
  transportDispatchIntentCount: number;
  transportReceiptCount: number;
  providerResultSpoolReceiptCount: number;
  providerResultSpoolDispositionReceiptCount: number;
  invocationTurnReceiptCount: number;
  invocationTurnSetReceiptCount: number;
  resultSubmissionReceiptCount: number;
  controlledRuntimeReceiptCount: number;
  capabilityExecutionReceiptCount: number;
  verificationAttemptGrantReceiptCount: number;
  reviewRasterScanReceiptCount: number;
  reviewCandidateRefCount: number;
  blindReviewMappingRefCount: number;
  validatedHumanReviewArtifactCount: number;
  validatedHumanMetricObservationCount: number;
  sourceReceiptCount: number;
  executionReceiptCount: number;
  readyForFinalization: boolean;
  observedAt: string;
  statusDigest: string;
}>;

export type AgentEvaluationBlindReviewBundle = Readonly<{
  format: 'prodivix.g4-model-evaluation-blind-review';
  version: 1;
  reviewLeaseDigest: string;
  randomizedPresentationPolicyDigest: string;
  rubrics: readonly AgentEvaluationPublicReviewRubric[];
  candidates: readonly Readonly<{
    randomizedPresentationId: string;
    rubricDigest: string;
    mediaType: AgentEvaluationReviewCandidate['mediaType'];
    width: number;
    height: number;
    bytesBase64: string;
    bytesDigest: string;
    byteLength: number;
  }>[];
  blindedArtifactSetDigest: string;
  exportedAt: string;
  bundleDigest: string;
}>;

export type AgentEvaluationFinalizationReport = Readonly<{
  format: 'prodivix.g4-model-evaluation-finalization';
  version: 1;
  planDigest: string;
  repositoryCommit: string;
  outcome: 'incomplete' | AgentModelEvaluationManifest['outcome'];
  missingFacts: readonly string[];
  manifest?: AgentModelEvaluationManifest;
  completedAt: string;
  reportDigest: string;
}>;

const fail = (code: AgentEvaluationCoordinatorErrorCode): never => {
  throw new AgentEvaluationCoordinatorError(code);
};

const requireDefined = <T>(
  value: T | undefined,
  code: AgentEvaluationCoordinatorErrorCode
): T => (value === undefined ? fail(code) : value);

const exactKeys = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = []
): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
};

const partitionFor = (
  plan: AgentModelEvaluationPlan
): AgentEvaluationPartition =>
  Object.freeze({
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
  });

const assertInstant = (value: string): void => {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
  }
};

const assertProductionPlan = (
  plan: AgentModelEvaluationPlan,
  repositoryCommit: string
): void => {
  if (
    !commitPattern.test(repositoryCommit) ||
    plan.repositoryCommit !== repositoryCommit ||
    validateAgentModelEvaluationPlan(plan).length > 0 ||
    plan.plannedJourneyCount !==
      AGENT_PRODUCTION_RELEASE_EVALUATION_JOURNEY_COUNT ||
    plan.providerConfigurations.length !== 3 ||
    plan.capabilityQualificationTargets.length !==
      plan.providerConfigurations.length *
        AGENT_PRODUCTION_EVALUATION_CAPABILITY_PROFILES.length
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.partitionMismatch);
  }
};

const requirePlan = async (
  files: AgentEvaluationCoordinatorFilePort,
  path: string,
  expectedRepositoryCommit: string
): Promise<AgentModelEvaluationPlan> => {
  const value = await files.readJson(path);
  const plan = value as AgentModelEvaluationPlan;
  assertProductionPlan(plan, expectedRepositoryCommit);
  return plan;
};

const shardManifestFor = (
  plan: AgentModelEvaluationPlan
): AgentEvaluationShardManifest => {
  const groups = new Map<string, string[]>();
  for (const descriptor of planAgentModelEvaluationAttempts(plan)) {
    const values = groups.get(descriptor.shardId) ?? [];
    values.push(descriptor.descriptorDigest);
    groups.set(descriptor.shardId, values);
  }
  const shards = Object.freeze(
    [...groups.entries()]
      .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
      .map(([shardId, descriptorDigests]) =>
        Object.freeze({
          shardId,
          descriptorCount: descriptorDigests.length,
          descriptorSetDigest: digestAgentCanonicalValue(
            [...descriptorDigests].sort(compareUnicodeCodePoints)
          ),
        })
      )
  );
  const base = Object.freeze({
    format: `${coordinatorFormatPrefix}-shards` as const,
    version: 1 as const,
    planDigest: plan.planDigest,
    repositoryCommit: plan.repositoryCommit,
    plannedAttemptCount: plan.plannedJourneyCount,
    shards,
  });
  return Object.freeze({
    ...base,
    manifestDigest: digestAgentCanonicalValue(base),
  });
};

const unsettledBudgetReservations = (
  ledger: AgentBudgetLedgerState
): readonly string[] =>
  Object.freeze(
    ledger.reservations
      .filter(
        ({ status, settlement }) =>
          status !== 'settled' ||
          !settlement ||
          settlement.requiresReconciliation
      )
      .map(({ reservationId }) => reservationId)
      .sort(compareUnicodeCodePoints)
  );

const latestCheckpoints = (
  checkpoints: readonly AgentEvaluationShardCheckpoint[]
): readonly AgentEvaluationShardCheckpoint[] => {
  const latest = new Map<string, AgentEvaluationShardCheckpoint>();
  const revisions = new Set<string>();
  for (const checkpoint of checkpoints) {
    const revisionKey = `${checkpoint.shardId}\u0000${checkpoint.revision}`;
    if (revisions.has(revisionKey)) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.persistenceConflict);
    }
    revisions.add(revisionKey);
    const current = latest.get(checkpoint.shardId);
    if (!current || checkpoint.revision > current.revision) {
      latest.set(checkpoint.shardId, checkpoint);
    }
  }
  return Object.freeze(
    [...latest.values()].sort((left, right) =>
      compareUnicodeCodePoints(left.shardId, right.shardId)
    )
  );
};

const countBy = (
  values: readonly string[]
): Readonly<Record<string, number>> => {
  const counts: Record<string, number> = Object.create(null) as Record<
    string,
    number
  >;
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(counts).sort(([left], [right]) =>
        compareUnicodeCodePoints(left, right)
      )
    )
  );
};

export const createAgentEvaluationStatusReport = (
  snapshot: AgentEvaluationDurableSnapshot,
  shardId: string | undefined,
  observedAt: string
): AgentEvaluationStatusReport => {
  const allDescriptors = planAgentModelEvaluationAttempts(snapshot.plan);
  const descriptors = shardId
    ? allDescriptors.filter((descriptor) => descriptor.shardId === shardId)
    : allDescriptors;
  if (shardId && descriptors.length === 0) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
  }
  const plannedIds = new Set(descriptors.map(({ attemptId }) => attemptId));
  const attempts = snapshot.attempts.filter(({ descriptor }) =>
    plannedIds.has(descriptor.attemptId)
  );
  const recordedIds = new Set(
    attempts.map(({ descriptor }) => descriptor.attemptId)
  );
  const missingIds = descriptors
    .filter(({ attemptId }) => !recordedIds.has(attemptId))
    .map(({ attemptId }) => attemptId)
    .sort(compareUnicodeCodePoints);
  const currentCheckpoints = latestCheckpoints(snapshot.checkpoints);
  const checkpoints = shardId
    ? currentCheckpoints.filter((checkpoint) => checkpoint.shardId === shardId)
    : currentCheckpoints;
  const unsettled = unsettledBudgetReservations(snapshot.budgetLedger);
  const expectedShardIds = new Set(
    allDescriptors.map((descriptor) => descriptor.shardId)
  );
  const completedShardIds = new Set(
    currentCheckpoints
      .filter(
        ({ state, missingAttemptRefs }) =>
          state === 'completed' && missingAttemptRefs.length === 0
      )
      .map(({ shardId }) => shardId)
  );
  let validatedHumanMetricAuthority = false;
  const validatedReviewArtifact = snapshot.validatedHumanReviewArtifacts[0];
  if (snapshot.humanReviewReport && validatedReviewArtifact) {
    try {
      validatedHumanMetricAuthority = sameCanonicalJson(
        snapshot.validatedHumanMetricObservations,
        createAgentEvaluationValidatedHumanMetricObservations({
          plan: snapshot.plan,
          attempts: snapshot.attempts,
          humanReviewReport: snapshot.humanReviewReport,
          validatedHumanReviewArtifact: validatedReviewArtifact,
        })
      );
    } catch {
      validatedHumanMetricAuthority = false;
    }
  }
  const readyForFinalization =
    shardId === undefined &&
    missingIds.length === 0 &&
    unsettled.length === 0 &&
    [...expectedShardIds].every((id) => completedShardIds.has(id)) &&
    snapshot.endpointSmokeDispatchIntents.length ===
      snapshot.plan.endpointSmokeTargets.length &&
    snapshot.endpointSmokeTransportReceipts.length ===
      snapshot.plan.endpointSmokeTargets.length &&
    snapshot.endpointSmokeResultSpoolReceipts.length ===
      snapshot.plan.endpointSmokeTargets.length &&
    snapshot.endpointSmokeResultSpoolDispositionReceipts.length ===
      snapshot.plan.endpointSmokeTargets.length &&
    snapshot.endpointSmokeValidationFailureReceipts.length === 0 &&
    snapshot.endpointSmokeReceipts.length ===
      snapshot.plan.endpointSmokeTargets.length &&
    snapshot.endpointSmokeReceipts.every(
      ({ outcome }) => outcome === 'passed'
    ) &&
    validateAgentEvaluationEvidenceAuthenticity({
      plan: snapshot.plan,
      descriptors: allDescriptors,
      attempts: snapshot.attempts,
      preDispatchFailureReceipts: snapshot.preDispatchFailureReceipts,
      transportDispatchIntents: snapshot.transportDispatchIntents,
      transportReceipts: snapshot.transportReceipts,
      providerResultSpoolReceipts: snapshot.providerResultSpoolReceipts,
      providerResultSpoolDispositionReceipts:
        snapshot.providerResultSpoolDispositionReceipts,
      providerCapabilityObservationReceipts:
        snapshot.providerCapabilityObservationReceipts,
      invocationTurnReceipts: snapshot.invocationTurnReceipts,
      invocationTurnSetReceipts: snapshot.invocationTurnSetReceipts,
      resultSubmissionReceipts: snapshot.resultSubmissionReceipts,
      controlledRuntimeReceipts: snapshot.controlledRuntimeReceipts,
      capabilityExecutionReceipts: snapshot.capabilityExecutionReceipts,
      capabilitySpecificReceipts: snapshot.capabilitySpecificReceipts,
      attemptAuthorityOwnerReceipts: snapshot.attemptAuthorityOwnerReceipts,
      verificationAttemptGrantReceipts:
        snapshot.verificationAttemptGrantReceipts,
      reviewRasterScanReceipts: snapshot.reviewRasterScanReceipts,
      reviewCandidateRefs: snapshot.reviewCandidateRefs,
      blindReviewMappingRefs: snapshot.blindReviewMappingRefs,
      executionReceipts: snapshot.executionReceipts,
      budgetLedger: snapshot.budgetLedger,
    }).length === 0 &&
    snapshot.executionReceipts.length === allDescriptors.length &&
    snapshot.humanReviewReport !== undefined &&
    snapshot.validatedHumanReviewArtifacts.length === 1 &&
    isAgentEvaluationValidatedHumanReviewArtifact(
      snapshot.validatedHumanReviewArtifacts[0],
      snapshot.humanReviewReport
    ) &&
    validatedHumanMetricAuthority &&
    snapshot.holdoutExecutionReceipt !== undefined;
  const base = Object.freeze({
    format: `${coordinatorFormatPrefix}-status` as const,
    version: 1 as const,
    planDigest: snapshot.plan.planDigest,
    repositoryCommit: snapshot.plan.repositoryCommit,
    ...(shardId ? { shardId } : {}),
    plannedAttemptCount: descriptors.length,
    recordedAttemptCount: attempts.length,
    missingAttemptCount: missingIds.length,
    missingAttemptSetDigest: digestAgentCanonicalValue(missingIds),
    attemptStatusCounts: countBy(attempts.map(({ status }) => status)),
    checkpointCounts: countBy(checkpoints.map(({ state }) => state)),
    unsettledBudgetReservationCount: unsettled.length,
    endpointSmokeDispatchIntentCount:
      snapshot.endpointSmokeDispatchIntents.length,
    endpointSmokeTransportReceiptCount:
      snapshot.endpointSmokeTransportReceipts.length,
    endpointSmokeResultSpoolReceiptCount:
      snapshot.endpointSmokeResultSpoolReceipts.length,
    endpointSmokeResultSpoolDispositionReceiptCount:
      snapshot.endpointSmokeResultSpoolDispositionReceipts.length,
    endpointSmokeValidationFailureReceiptCount:
      snapshot.endpointSmokeValidationFailureReceipts.length,
    endpointSmokeReceiptCount: snapshot.endpointSmokeReceipts.length,
    transportDispatchIntentCount: snapshot.transportDispatchIntents.length,
    transportReceiptCount: snapshot.transportReceipts.length,
    providerResultSpoolReceiptCount:
      snapshot.providerResultSpoolReceipts.length,
    providerResultSpoolDispositionReceiptCount:
      snapshot.providerResultSpoolDispositionReceipts.length,
    invocationTurnReceiptCount: snapshot.invocationTurnReceipts.length,
    invocationTurnSetReceiptCount: snapshot.invocationTurnSetReceipts.length,
    resultSubmissionReceiptCount: snapshot.resultSubmissionReceipts.length,
    controlledRuntimeReceiptCount: snapshot.controlledRuntimeReceipts.length,
    capabilityExecutionReceiptCount:
      snapshot.capabilityExecutionReceipts.length,
    verificationAttemptGrantReceiptCount:
      snapshot.verificationAttemptGrantReceipts.length,
    reviewRasterScanReceiptCount: snapshot.reviewRasterScanReceipts.length,
    reviewCandidateRefCount: snapshot.reviewCandidateRefs.length,
    blindReviewMappingRefCount: snapshot.blindReviewMappingRefs.length,
    validatedHumanReviewArtifactCount:
      snapshot.validatedHumanReviewArtifacts.length,
    validatedHumanMetricObservationCount:
      snapshot.validatedHumanMetricObservations.length,
    sourceReceiptCount: snapshot.sourceReceipts.length,
    executionReceiptCount: snapshot.executionReceipts.length,
    readyForFinalization,
    observedAt,
  });
  return Object.freeze({
    ...base,
    statusDigest: digestAgentCanonicalValue(base),
  });
};

const isStatusCountMap = (value: unknown): boolean =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([key, count]) =>
      identityPattern.test(key) &&
      Number.isSafeInteger(count) &&
      (count as number) >= 0
  );

const assertStatusReport = (
  value: AgentEvaluationStatusReport,
  plan: AgentModelEvaluationPlan,
  shardId: string | undefined,
  observedAt: string
): AgentEvaluationStatusReport => {
  const countFields = [
    'plannedAttemptCount',
    'recordedAttemptCount',
    'missingAttemptCount',
    'unsettledBudgetReservationCount',
    'endpointSmokeDispatchIntentCount',
    'endpointSmokeTransportReceiptCount',
    'endpointSmokeResultSpoolReceiptCount',
    'endpointSmokeResultSpoolDispositionReceiptCount',
    'endpointSmokeValidationFailureReceiptCount',
    'endpointSmokeReceiptCount',
    'transportDispatchIntentCount',
    'transportReceiptCount',
    'providerResultSpoolReceiptCount',
    'providerResultSpoolDispositionReceiptCount',
    'invocationTurnReceiptCount',
    'invocationTurnSetReceiptCount',
    'resultSubmissionReceiptCount',
    'controlledRuntimeReceiptCount',
    'capabilityExecutionReceiptCount',
    'verificationAttemptGrantReceiptCount',
    'reviewRasterScanReceiptCount',
    'reviewCandidateRefCount',
    'blindReviewMappingRefCount',
    'validatedHumanReviewArtifactCount',
    'validatedHumanMetricObservationCount',
    'sourceReceiptCount',
    'executionReceiptCount',
  ] as const;
  const required = [
    'format',
    'version',
    'planDigest',
    'repositoryCommit',
    ...countFields,
    'missingAttemptSetDigest',
    'attemptStatusCounts',
    'checkpointCounts',
    'readyForFinalization',
    'observedAt',
    'statusDigest',
  ] as const;
  const expectedPlannedAttemptCount = planAgentModelEvaluationAttempts(
    plan
  ).filter(
    (descriptor) => shardId === undefined || descriptor.shardId === shardId
  ).length;
  if (
    !exactKeys(value, required, ['shardId']) ||
    value.format !== `${coordinatorFormatPrefix}-status` ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    value.shardId !== shardId ||
    value.observedAt !== observedAt ||
    !digestPattern.test(value.missingAttemptSetDigest) ||
    !digestPattern.test(value.statusDigest) ||
    !isStatusCountMap(value.attemptStatusCounts) ||
    !isStatusCountMap(value.checkpointCounts) ||
    typeof value.readyForFinalization !== 'boolean' ||
    countFields.some(
      (field) =>
        !Number.isSafeInteger(value[field]) || (value[field] as number) < 0
    ) ||
    value.plannedAttemptCount !== expectedPlannedAttemptCount ||
    value.recordedAttemptCount + value.missingAttemptCount !==
      value.plannedAttemptCount ||
    (value.readyForFinalization &&
      (shardId !== undefined ||
        value.missingAttemptCount !== 0 ||
        value.unsettledBudgetReservationCount !== 0))
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  assertInstant(value.observedAt);
  const { statusDigest: _statusDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== value.statusDigest) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

const assertSmokeQualificationReport = (
  value: AgentEvaluationSmokeQualificationReport,
  plan: AgentModelEvaluationPlan
): AgentEvaluationSmokeQualificationReport => {
  if (
    !exactKeys(value, [
      'format',
      'version',
      'planDigest',
      'repositoryCommit',
      'endpointSmokeDispatchIntentSetDigest',
      'endpointSmokeTransportReceiptSetDigest',
      'endpointSmokeResultSpoolReceiptSetDigest',
      'endpointSmokeResultSpoolDispositionReceiptSetDigest',
      'endpointSmokeReceiptSetDigest',
      'qualifiedTargetCount',
      'budgetReservationId',
      'outcome',
      'failureCode',
      'completedAt',
      'reportDigest',
    ]) ||
    value.format !== 'prodivix.g4-model-evaluation-smoke-qualification' ||
    value.version !== 2 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    ![
      value.endpointSmokeDispatchIntentSetDigest,
      value.endpointSmokeTransportReceiptSetDigest,
      value.endpointSmokeResultSpoolReceiptSetDigest,
      value.endpointSmokeResultSpoolDispositionReceiptSetDigest,
      value.endpointSmokeReceiptSetDigest,
      value.reportDigest,
    ].every(
      (digest) => typeof digest === 'string' && digestPattern.test(digest)
    ) ||
    !Number.isSafeInteger(value.qualifiedTargetCount) ||
    value.qualifiedTargetCount < 0 ||
    value.qualifiedTargetCount > plan.endpointSmokeTargets.length ||
    !identityPattern.test(value.budgetReservationId) ||
    !['completed', 'failed'].includes(value.outcome) ||
    (value.outcome === 'completed') !== (value.failureCode === null) ||
    (value.failureCode !== null &&
      !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(value.failureCode)) ||
    (value.outcome === 'completed' &&
      value.qualifiedTargetCount !== plan.endpointSmokeTargets.length)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  assertInstant(value.completedAt);
  const { reportDigest: _reportDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== value.reportDigest) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

type ReviewAssignment = Readonly<{
  attempt: AgentModelEvaluationAttempt;
  invocationReceipt: AgentEvaluationInvocationTurnReceipt;
  executionReceipt: AgentEvaluationExecutionReceipt;
  candidateRef: AgentEvaluationReviewCandidateRef;
  reviewCandidateId: string;
  rubricDigest: string;
  artifactDigest: string;
  caseTargetKey: string;
}>;

type BoundReviewAssignment = ReviewAssignment &
  Readonly<{ mapping: AgentEvaluationBlindReviewMapping }>;

const reviewRubricDigests = (
  plan: AgentModelEvaluationPlan
): readonly string[] =>
  Object.freeze(
    plan.graderPlan.graders
      .filter(({ graderId }) =>
        plan.graderPlan.blindHumanGraderIds.includes(graderId)
      )
      .map(({ configurationDigest }) => configurationDigest)
      .sort(compareUnicodeCodePoints)
  );

const reviewAssignments = (
  plan: AgentModelEvaluationPlan,
  evidence: AgentEvaluationReviewLeaseEvidence
): readonly ReviewAssignment[] => {
  const subjectiveCases = new Set(
    plan.concreteCases
      .filter(
        ({ access, subjectiveVisualQuality }) =>
          access === 'public' && subjectiveVisualQuality
      )
      .map(({ caseId }) => caseId)
  );
  const rubricDigests = reviewRubricDigests(plan);
  if (subjectiveCases.size === 0 || rubricDigests.length !== 1) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const turnSetByAttempt = new Map(
    evidence.invocationTurnSetReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  const turnsByAttempt = new Map<
    string,
    AgentEvaluationInvocationTurnReceipt[]
  >();
  for (const receipt of evidence.invocationTurnReceipts) {
    const turns = turnsByAttempt.get(receipt.attemptId) ?? [];
    turns.push(receipt);
    turnsByAttempt.set(receipt.attemptId, turns);
  }
  const executionByAttempt = new Map(
    evidence.executionReceipts.map((receipt) => [receipt.attemptId, receipt])
  );
  const candidateRefByAttempt = new Map(
    evidence.reviewCandidateRefs.map((reference) => [
      reference.attemptId,
      reference,
    ])
  );
  if (
    turnSetByAttempt.size !== evidence.invocationTurnSetReceipts.length ||
    executionByAttempt.size !== evidence.executionReceipts.length ||
    candidateRefByAttempt.size !== evidence.reviewCandidateRefs.length
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const candidates = new Map<string, ReviewAssignment>();
  for (const attempt of [...evidence.attempts].sort((left, right) =>
    compareUnicodeCodePoints(
      left.descriptor.attemptId,
      right.descriptor.attemptId
    )
  )) {
    const descriptor = attempt.descriptor;
    if (
      attempt.status !== 'completed' ||
      !subjectiveCases.has(descriptor.caseId)
    ) {
      continue;
    }
    const turnSetReceipt = turnSetByAttempt.get(descriptor.attemptId);
    const attemptTurns = (turnsByAttempt.get(descriptor.attemptId) ?? []).sort(
      (left, right) => left.turnIndex - right.turnIndex
    );
    const invocationReceipt = attemptTurns.at(-1);
    const executionReceipt = executionByAttempt.get(descriptor.attemptId);
    const candidateRef = candidateRefByAttempt.get(descriptor.attemptId);
    if (
      !turnSetReceipt ||
      !invocationReceipt ||
      invocationReceipt.status !== 'completed' ||
      !invocationReceipt.terminal ||
      !invocationReceipt.responseArtifactDigest ||
      turnSetReceipt.terminalStatus !== 'completed' ||
      turnSetReceipt.receiptDigest !== attempt.invocationTurnSetReceiptDigest ||
      digestAgentEvaluationInvocationTurnReceiptSet(attemptTurns) !==
        attempt.invocationTurnReceiptSetDigest ||
      !executionReceipt ||
      !candidateRef ||
      candidateRef.planDigest !== plan.planDigest ||
      candidateRef.repositoryCommit !== plan.repositoryCommit ||
      candidateRef.descriptorDigest !== descriptor.descriptorDigest ||
      candidateRef.responseDigest !==
        invocationReceipt.responseArtifactDigest ||
      candidateRef.responseDigest !== attempt.responseDigest ||
      candidateRef.executionReceiptDigest !== executionReceipt.receiptDigest
    ) {
      continue;
    }
    const caseTargetKey = `${descriptor.caseId}\u0000${descriptor.targetId}`;
    if (candidates.has(caseTargetKey)) continue;
    const candidateDigest = digestAgentCanonicalValue({
      planDigest: plan.planDigest,
      caseId: descriptor.caseId,
      targetId: descriptor.targetId,
      attemptId: descriptor.attemptId,
      randomizedPresentationPolicyDigest:
        plan.graderPlan.randomizedPresentationPolicyDigest,
    });
    const reviewCandidateId = `review-candidate:${candidateDigest.slice('sha256-'.length)}`;
    if (candidateRef.candidateId !== reviewCandidateId) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
    }
    candidates.set(
      caseTargetKey,
      Object.freeze({
        attempt,
        invocationReceipt,
        executionReceipt,
        candidateRef,
        reviewCandidateId,
        rubricDigest: rubricDigests[0]!,
        artifactDigest: candidateRef.bytesDigest,
        caseTargetKey,
      })
    );
  }
  const expectedKeys = new Set(
    planAgentModelEvaluationAttempts(plan)
      .filter(({ caseId }) => subjectiveCases.has(caseId))
      .map(({ caseId, targetId }) => `${caseId}\u0000${targetId}`)
  );
  if (
    expectedKeys.size < 1 ||
    expectedKeys.size > AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES ||
    candidates.size !== expectedKeys.size ||
    [...expectedKeys].some((key) => !candidates.has(key))
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.incomplete);
  }
  return Object.freeze(
    [...candidates.values()].sort((left, right) =>
      compareUnicodeCodePoints(left.reviewCandidateId, right.reviewCandidateId)
    )
  );
};

const assertReviewLeaseEvidence = (
  value: AgentEvaluationReviewLeaseEvidence,
  plan: AgentModelEvaluationPlan,
  expectedReviewLeaseDigest?: string
): AgentEvaluationReviewLeaseEvidence => {
  if (
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !digestPattern.test(value.reviewLeaseDigest) ||
    !digestPattern.test(value.blindReviewMappingSetDigest) ||
    (expectedReviewLeaseDigest !== undefined &&
      value.reviewLeaseDigest !== expectedReviewLeaseDigest) ||
    !Array.isArray(value.attempts) ||
    value.attempts.length < 1 ||
    value.attempts.length > AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES ||
    !value.attempts.every(isAgentModelEvaluationAttempt) ||
    !Array.isArray(value.invocationTurnReceipts) ||
    value.invocationTurnReceipts.length < value.attempts.length ||
    value.invocationTurnReceipts.length >
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES * 256 ||
    !value.invocationTurnReceipts.every(
      isAgentEvaluationInvocationTurnReceipt
    ) ||
    !Array.isArray(value.invocationTurnSetReceipts) ||
    value.invocationTurnSetReceipts.length !== value.attempts.length ||
    !value.invocationTurnSetReceipts.every(
      isAgentEvaluationInvocationTurnSetReceipt
    ) ||
    !Array.isArray(value.executionReceipts) ||
    value.executionReceipts.length !== value.attempts.length ||
    !value.executionReceipts.every(isAgentEvaluationExecutionReceipt) ||
    !Array.isArray(value.reviewRasterScanReceipts) ||
    value.reviewRasterScanReceipts.length !== value.attempts.length ||
    !value.reviewRasterScanReceipts.every(
      isAgentEvaluationReviewRasterScanReceipt
    ) ||
    !Array.isArray(value.reviewCandidateRefs) ||
    value.reviewCandidateRefs.length !== value.attempts.length ||
    !value.reviewCandidateRefs.every(isAgentEvaluationReviewCandidateRef)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const plannedDescriptors = new Map(
    planAgentModelEvaluationAttempts(plan).map((descriptor) => [
      descriptor.attemptId,
      descriptor,
    ])
  );
  const subjectiveCaseIds = new Set(
    plan.concreteCases
      .filter(
        ({ access, subjectiveVisualQuality }) =>
          access === 'public' && subjectiveVisualQuality
      )
      .map(({ caseId }) => caseId)
  );
  const attemptIds = new Set<string>();
  const caseTargetKeys = new Set<string>();
  for (const attempt of value.attempts) {
    const descriptor = plannedDescriptors.get(attempt.descriptor.attemptId);
    const caseTargetKey = `${attempt.descriptor.caseId}\u0000${attempt.descriptor.targetId}`;
    if (
      !descriptor ||
      !sameCanonicalJson(descriptor, attempt.descriptor) ||
      attempt.status !== 'completed' ||
      !subjectiveCaseIds.has(attempt.descriptor.caseId) ||
      attemptIds.has(attempt.descriptor.attemptId) ||
      caseTargetKeys.has(caseTargetKey)
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
    }
    attemptIds.add(attempt.descriptor.attemptId);
    caseTargetKeys.add(caseTargetKey);
  }
  if (
    value.invocationTurnReceipts.some(
      ({ attemptId }) => !attemptIds.has(attemptId)
    ) ||
    value.invocationTurnSetReceipts.some(
      ({ attemptId }) => !attemptIds.has(attemptId)
    ) ||
    value.executionReceipts.some(
      ({ attemptId }) => !attemptIds.has(attemptId)
    ) ||
    value.reviewRasterScanReceipts.some(
      ({ attemptId }) => !attemptIds.has(attemptId)
    ) ||
    value.reviewCandidateRefs.some(
      ({ attemptId }) => !attemptIds.has(attemptId)
    )
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const scanByAttempt = new Map(
    value.reviewRasterScanReceipts.map((receipt) => [
      receipt.attemptId,
      receipt,
    ])
  );
  if (
    scanByAttempt.size !== value.reviewRasterScanReceipts.length ||
    value.reviewCandidateRefs.some((candidate) => {
      const scan = scanByAttempt.get(candidate.attemptId);
      return (
        !scan ||
        scan.verdict !== 'safe' ||
        scan.planDigest !== plan.planDigest ||
        scan.repositoryCommit !== plan.repositoryCommit ||
        scan.descriptorDigest !== candidate.descriptorDigest ||
        scan.projectionAuthorityDigest !==
          candidate.projectionAuthorityDigest ||
        scan.mediaType !== candidate.mediaType ||
        scan.width !== candidate.width ||
        scan.height !== candidate.height ||
        scan.byteLength !== candidate.byteLength ||
        scan.bytesDigest !== candidate.bytesDigest ||
        scan.receiptDigest !== candidate.publicArtifactScanDigest
      );
    })
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

const validateBlindReviewMapping = (
  plan: AgentModelEvaluationPlan,
  assignment: ReviewAssignment,
  mapping: AgentEvaluationBlindReviewMapping
): AgentEvaluationBlindReviewMapping => {
  if (
    !exactKeys(mapping, [
      'format',
      'version',
      'mappingId',
      'planDigest',
      'repositoryCommit',
      'candidateId',
      'attemptId',
      'candidateDigest',
      'bytesDigest',
      'rubricDigest',
      'randomizedPresentationPolicyDigest',
      'randomizedPresentationId',
      'createdAt',
      'mappingDigest',
    ]) ||
    mapping.format !== 'prodivix.g4-model-evaluation-blind-review-mapping' ||
    mapping.version !== 1 ||
    !identityPattern.test(mapping.mappingId) ||
    !/^blind-review:[A-Za-z0-9_-]{43}$/u.test(
      mapping.randomizedPresentationId
    ) ||
    mapping.planDigest !== plan.planDigest ||
    mapping.repositoryCommit !== plan.repositoryCommit ||
    mapping.candidateId !== assignment.candidateRef.candidateId ||
    mapping.attemptId !== assignment.candidateRef.attemptId ||
    mapping.candidateDigest !== assignment.candidateRef.candidateDigest ||
    mapping.bytesDigest !== assignment.candidateRef.bytesDigest ||
    mapping.rubricDigest !== assignment.rubricDigest ||
    mapping.randomizedPresentationPolicyDigest !==
      plan.graderPlan.randomizedPresentationPolicyDigest ||
    !digestPattern.test(mapping.mappingDigest)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  assertInstant(mapping.createdAt);
  const { mappingDigest: _mappingDigest, ...base } = mapping;
  if (
    mapping.mappingDigest !== digestAgentCanonicalValue(base) ||
    Date.parse(mapping.createdAt) <
      Math.max(
        Date.parse(assignment.attempt.completedAt),
        Date.parse(assignment.candidateRef.generatedAt)
      ) ||
    Date.parse(mapping.createdAt) > Date.parse(plan.expiresAt)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return mapping;
};

const bindReviewMappings = async (
  plan: AgentModelEvaluationPlan,
  assignments: readonly ReviewAssignment[],
  store: AgentEvaluationBlindReviewMappingStore,
  mode: 'create' | 'load',
  createdAt?: string
): Promise<readonly BoundReviewAssignment[]> => {
  if (mode === 'create' && createdAt === undefined) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
  }
  const bound: BoundReviewAssignment[] = [];
  for (const assignment of assignments) {
    const mapping = validateBlindReviewMapping(
      plan,
      assignment,
      mode === 'create'
        ? await store.getOrCreate({
            plan,
            candidateRef: assignment.candidateRef,
            rubricDigest: assignment.rubricDigest,
            createdAt: createdAt!,
          })
        : await store.load({
            plan,
            candidateRef: assignment.candidateRef,
            rubricDigest: assignment.rubricDigest,
          })
    );
    bound.push(Object.freeze({ ...assignment, mapping }));
  }
  if (
    new Set(bound.map(({ mapping }) => mapping.randomizedPresentationId))
      .size !== bound.length ||
    new Set(bound.map(({ mapping }) => mapping.mappingDigest)).size !==
      bound.length
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return Object.freeze(
    bound.sort((left, right) =>
      compareUnicodeCodePoints(
        left.mapping.randomizedPresentationId,
        right.mapping.randomizedPresentationId
      )
    )
  );
};

const assertReviewLeaseMappingSet = (
  evidence: AgentEvaluationReviewLeaseEvidence,
  assignments: readonly BoundReviewAssignment[]
): void => {
  const references = Object.freeze(
    assignments
      .map(({ mapping }) =>
        Object.freeze({
          mappingId: mapping.mappingId,
          mappingDigest: mapping.mappingDigest,
        })
      )
      .sort((left, right) =>
        compareUnicodeCodePoints(left.mappingId, right.mappingId)
      )
  );
  if (
    digestAgentEvaluationBlindReviewMappingRefSet(references) !==
    evidence.blindReviewMappingSetDigest
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
};

const canarySets = async (
  source: AgentEvaluationCanarySource
): Promise<
  Readonly<{
    secretCanaries: readonly string[];
    protectedHoldoutCanaries: readonly string[];
  }>
> => {
  const secretCanaries = Object.freeze(
    [...(await source.secretCanaries())].sort(compareUnicodeCodePoints)
  );
  const protectedHoldoutCanaries = Object.freeze(
    [...(await source.protectedHoldoutCanaries())].sort(
      compareUnicodeCodePoints
    )
  );
  if (
    secretCanaries.length === 0 ||
    protectedHoldoutCanaries.length === 0 ||
    new Set(secretCanaries).size !== secretCanaries.length ||
    new Set(protectedHoldoutCanaries).size !==
      protectedHoldoutCanaries.length ||
    [...secretCanaries, ...protectedHoldoutCanaries].some(
      (canary) => typeof canary !== 'string' || canary.length < 8
    )
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
  }
  return Object.freeze({ secretCanaries, protectedHoldoutCanaries });
};

const scanPublicArtifact = (
  value: unknown,
  canaries: Readonly<{
    secretCanaries: readonly string[];
    protectedHoldoutCanaries: readonly string[];
  }>
): unknown => {
  const result = scanAndRedactAgentEvaluationPublicArtifact('artifact', value, {
    protectedMaterialCanaries: canaries.protectedHoldoutCanaries,
    secretCanaries: canaries.secretCanaries,
  });
  if (!result.safe || result.redactedArtifact === null) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.artifactUnsafe);
  }
  return result.redactedArtifact;
};

const scanRasterCandidateBytes = (
  bytesBase64: string,
  canaries: Readonly<{
    secretCanaries: readonly string[];
    protectedHoldoutCanaries: readonly string[];
  }>
): void => {
  const bytes = decodeCanonicalBase64(bytesBase64, {
    label: 'Evaluation review candidate raster',
    maximumBytes: AGENT_EVALUATION_REVIEW_CANDIDATE_MAXIMUM_BYTES,
  });
  try {
    const findings = [
      ...scanAgentArtifactForProtectedHoldoutLeak(
        bytes,
        canaries.protectedHoldoutCanaries
      ),
      ...scanAgentArtifactForSecretCanaries(bytes, canaries.secretCanaries),
    ];
    if (findings.some(({ blocking }) => blocking)) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.artifactUnsafe);
    }
  } finally {
    bytes.fill(0);
  }
};

const blindedSetDigest = (
  assignments: readonly BoundReviewAssignment[]
): string =>
  digestAgentCanonicalValue(
    assignments
      .map(({ mapping, rubricDigest, artifactDigest }) => ({
        randomizedPresentationId: mapping.randomizedPresentationId,
        rubricDigest,
        artifactDigest,
      }))
      .sort((left, right) =>
        compareUnicodeCodePoints(
          left.randomizedPresentationId,
          right.randomizedPresentationId
        )
      )
  );

export const humanReviewArtifactPayload = (
  value: AgentEvaluationHumanReviewImport
): AgentEvaluationHumanReviewArtifactPayload =>
  humanReviewArtifactPayloadFromImport(value);

const parseHumanReviewImport = (
  value: unknown
): AgentEvaluationHumanReviewImport =>
  decodeAgentEvaluationHumanReviewImport(value);

const finalizationReport = (
  input: Omit<AgentEvaluationFinalizationReport, 'reportDigest'>
): AgentEvaluationFinalizationReport => {
  const base = Object.freeze({ ...input });
  return Object.freeze({
    ...base,
    reportDigest: digestAgentCanonicalValue(base),
  });
};

const assertFinalizationInspection = (
  value: AgentEvaluationFinalizationInspection,
  plan: AgentModelEvaluationPlan
): AgentEvaluationFinalizationInspection => {
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'repositoryCommit',
        'missingFacts',
        'reviewedAttempts',
        'validatedHumanReviewArtifacts',
        'validatedHumanMetricObservations',
        'inspectionDigest',
      ],
      ['humanReviewReport']
    ) ||
    value.format !== 'prodivix.g4-model-evaluation-finalization-inspection' ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !Array.isArray(value.missingFacts) ||
    value.missingFacts.length > 128 ||
    value.missingFacts.some(
      (fact) =>
        typeof fact !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(fact)
    ) ||
    new Set(value.missingFacts).size !== value.missingFacts.length ||
    !sameCanonicalJson(
      value.missingFacts,
      [...value.missingFacts].sort(compareUnicodeCodePoints)
    ) ||
    !Array.isArray(value.reviewedAttempts) ||
    value.reviewedAttempts.length >
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANDIDATES ||
    !value.reviewedAttempts.every(isAgentModelEvaluationAttempt) ||
    !Array.isArray(value.validatedHumanReviewArtifacts) ||
    value.validatedHumanReviewArtifacts.length > 1 ||
    !value.validatedHumanReviewArtifacts.every((artifact) =>
      isAgentEvaluationValidatedHumanReviewArtifact(
        artifact,
        value.humanReviewReport
      )
    ) ||
    !Array.isArray(value.validatedHumanMetricObservations) ||
    !value.validatedHumanMetricObservations.every(
      isAgentEvaluationValidatedHumanMetricObservation
    ) ||
    (value.humanReviewReport !== undefined &&
      !isAgentHumanReviewReport(value.humanReviewReport)) ||
    !digestPattern.test(value.inspectionDigest)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const { inspectionDigest: _inspectionDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== value.inspectionDigest) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

const assertFinalizationIntent = (
  value: AgentEvaluationFinalizationIntent,
  plan: AgentModelEvaluationPlan
): AgentEvaluationFinalizationIntent => {
  if (
    !exactKeys(value, [
      'planDigest',
      'repositoryCommit',
      'completedAt',
      'intentDigest',
      'replayed',
    ]) ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    typeof value.completedAt !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.completedAt) ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    typeof value.replayed !== 'boolean' ||
    !digestPattern.test(value.intentDigest)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  if (
    value.intentDigest !==
    digestAgentCanonicalValue({
      format: 'prodivix.g4-model-evaluation-finalization-intent',
      version: 1,
      planDigest: plan.planDigest,
      repositoryCommit: plan.repositoryCommit,
      completedAt: value.completedAt,
    })
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

export const assertAgentEvaluationFinalizationReport = (
  value: AgentEvaluationFinalizationReport,
  plan: AgentModelEvaluationPlan,
  completedAt: string
): AgentEvaluationFinalizationReport => {
  const missingFacts = Array.isArray(value.missingFacts)
    ? value.missingFacts
    : undefined;
  const missingFactsValid =
    missingFacts !== undefined &&
    missingFacts.length <= 128 &&
    missingFacts.every(
      (fact) =>
        typeof fact === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/u.test(fact)
    ) &&
    new Set(missingFacts).size === missingFacts.length &&
    sameCanonicalJson(
      missingFacts,
      [...missingFacts].sort(compareUnicodeCodePoints)
    );
  const manifest = value.manifest;
  const incompleteValid =
    manifest === undefined &&
    value.outcome === 'incomplete' &&
    missingFacts !== undefined &&
    missingFacts.length > 0;
  const completeValid =
    manifest !== undefined &&
    missingFacts !== undefined &&
    missingFacts.length === 0 &&
    isAgentModelEvaluationManifest(manifest) &&
    manifest.planDigest === plan.planDigest &&
    manifest.completedAt === completedAt &&
    value.outcome === manifest.outcome;
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'repositoryCommit',
        'outcome',
        'missingFacts',
        'completedAt',
        'reportDigest',
      ],
      ['manifest']
    ) ||
    value.format !== `${coordinatorFormatPrefix}-finalization` ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    value.completedAt !== completedAt ||
    !missingFactsValid ||
    (!incompleteValid && !completeValid) ||
    !digestPattern.test(value.reportDigest)
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  const { reportDigest: _reportDigest, ...base } = value;
  if (digestAgentCanonicalValue(base) !== value.reportDigest) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return value;
};

const parseFinalizationManifest = (
  value: unknown,
  plan: AgentModelEvaluationPlan
): AgentModelEvaluationManifest => {
  if (
    !exactKeys(
      value,
      [
        'format',
        'version',
        'planDigest',
        'repositoryCommit',
        'outcome',
        'missingFacts',
        'completedAt',
        'reportDigest',
      ],
      ['manifest']
    ) ||
    value.format !== `${coordinatorFormatPrefix}-finalization` ||
    value.version !== 1 ||
    value.planDigest !== plan.planDigest ||
    value.repositoryCommit !== plan.repositoryCommit ||
    !Array.isArray(value.missingFacts) ||
    value.missingFacts.length !== 0 ||
    !value.manifest ||
    typeof value.manifest !== 'object'
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.incomplete);
  }
  const record = value as Record<string, unknown>;
  const { reportDigest: _reportDigest, ...base } = record;
  const manifest = record.manifest as AgentModelEvaluationManifest;
  if (
    digestAgentCanonicalValue(base) !== record.reportDigest ||
    !isAgentModelEvaluationManifest(manifest) ||
    manifest.planDigest !== plan.planDigest ||
    manifest.completedAt !== record.completedAt ||
    manifest.outcome !== record.outcome
  ) {
    fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
  }
  return manifest;
};

/**
 * CI-facing G4 coordinator. It owns orchestration and public artifact assembly;
 * credentials, transport, PostgreSQL, files, clock, and environment metadata
 * stay behind injected server-only ports.
 */
export class AgentEvaluationCoordinator implements AgentEvaluationCommandCoordinator {
  readonly #dependencies: AgentEvaluationCoordinatorDependencies;

  constructor(dependencies: AgentEvaluationCoordinatorDependencies) {
    this.#dependencies = dependencies;
  }

  async plan(
    input: AgentEvaluationPlanCommand
  ): Promise<AgentModelEvaluationPlan> {
    const repositoryCommit = await this.#dependencies.repositoryCommit();
    const now = this.#dependencies.now();
    assertInstant(now);
    const config = await this.#dependencies.files.readJson(input.configPath);
    const plan = await this.#dependencies.planFactory.create({
      config,
      repositoryCommit,
      now,
    });
    assertProductionPlan(plan, repositoryCommit);
    const ledger = this.#dependencies.ledgerFactory.open(partitionFor(plan));
    await ledger.putPlan(plan);
    await this.#dependencies.files.writeCanonicalJson(input.outputPath, plan);
    await this.#dependencies.files.writeCanonicalJson(
      input.shardsOutputPath,
      shardManifestFor(plan)
    );
    return plan;
  }

  async smoke(
    input: AgentEvaluationSmokeCommand
  ): Promise<AgentEvaluationSmokeQualificationReport> {
    const plan = await this.#readPlan(input.planPath);
    const config = await this.#dependencies.files.readJson(input.configPath);
    const report = assertSmokeQualificationReport(
      await this.#dependencies.smokeQualifier.qualify({ config, plan }),
      plan
    );
    const safeReport = scanPublicArtifact(
      report,
      await canarySets(this.#dependencies.canaries)
    );
    if (!sameCanonicalJson(report, safeReport)) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.artifactUnsafe);
    }
    await this.#dependencies.files.writeCanonicalJson(
      input.outputPath,
      safeReport
    );
    if (report.outcome !== 'completed') {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.runnerFailed);
    }
    return report;
  }
  async runShard(
    input: AgentEvaluationRunShardCommand
  ): Promise<AgentEvaluationShardRunResult> {
    const plan = await this.#readPlan(input.planPath);
    if (
      !planAgentModelEvaluationAttempts(plan).some(
        ({ shardId }) => shardId === input.shardId
      )
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
    }
    const partition = partitionFor(plan);
    const ledger = this.#dependencies.ledgerFactory.open(partition);
    const runner = this.#dependencies.shardRunnerFactory.create({
      partition,
      ledger,
    });
    const result = await runner.run({
      plan,
      shardId: input.shardId,
      ...(input.signal ? { signal: input.signal } : {}),
    });
    if (!result.ok) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.runnerFailed);
    }
    await this.#dependencies.holdoutSealer.sealIfComplete({ plan, ledger });
    return result;
  }

  async status(
    input: AgentEvaluationStatusCommand
  ): Promise<AgentEvaluationStatusReport> {
    const plan = await this.#readPlan(input.planPath);
    if (
      input.shardId !== undefined &&
      !planAgentModelEvaluationAttempts(plan).some(
        ({ shardId }) => shardId === input.shardId
      )
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.inputInvalid);
    }
    const observedAt = this.#dependencies.now();
    assertInstant(observedAt);
    const report = assertStatusReport(
      await this.#dependencies.statusSource.load({
        plan,
        ...(input.shardId !== undefined ? { shardId: input.shardId } : {}),
        observedAt,
      }),
      plan,
      input.shardId,
      observedAt
    );
    await this.#dependencies.files.writeCanonicalJson(input.outputPath, report);
    return report;
  }

  async exportReview(
    input: AgentEvaluationExportReviewCommand
  ): Promise<AgentEvaluationBlindReviewBundle> {
    const plan = await this.#readPlan(input.planPath);
    const reviewLease = assertReviewLeaseEvidence(
      await this.#dependencies.reviewLeaseSource.open({ plan }),
      plan
    );
    const exportedAt = this.#dependencies.now();
    assertInstant(exportedAt);
    const assignments = await bindReviewMappings(
      plan,
      reviewAssignments(plan, reviewLease),
      this.#dependencies.blindReviewMappings,
      'create',
      exportedAt
    );
    assertReviewLeaseMappingSet(reviewLease, assignments);
    const canaries = await canarySets(this.#dependencies.canaries);
    const rubrics = Object.freeze(
      await Promise.all(
        reviewRubricDigests(plan).map(async (rubricDigest) => {
          const rubric = validateAgentEvaluationPublicReviewRubric(
            await this.#dependencies.reviewRubrics.load({
              plan,
              rubricDigest,
            }),
            rubricDigest
          );
          const scanned = scanPublicArtifact(rubric, canaries);
          if (!sameCanonicalJson(scanned, rubric)) {
            fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.artifactUnsafe);
          }
          return rubric;
        })
      )
    );
    const candidates = [];
    for (const assignment of assignments) {
      const candidate = await this.#dependencies.reviewArtifactSource.load({
        plan,
        attempt: assignment.attempt,
        invocationReceipt: assignment.invocationReceipt,
      });
      if (
        !isAgentEvaluationReviewCandidate(candidate) ||
        candidate.candidateId !== assignment.reviewCandidateId ||
        candidate.attemptId !== assignment.attempt.descriptor.attemptId ||
        candidate.planDigest !== plan.planDigest ||
        candidate.repositoryCommit !== plan.repositoryCommit ||
        candidate.descriptorDigest !==
          assignment.attempt.descriptor.descriptorDigest ||
        candidate.responseDigest !==
          assignment.invocationReceipt.responseArtifactDigest ||
        candidate.executionReceiptDigest !==
          assignment.executionReceipt.receiptDigest
      ) {
        fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
      }
      const {
        format: _format,
        version: _version,
        bytesBase64: _bytesBase64,
        ...candidateRef
      } = candidate;
      if (!sameCanonicalJson(candidateRef, assignment.candidateRef)) {
        fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
      }
      scanRasterCandidateBytes(candidate.bytesBase64, canaries);
      candidates.push(
        Object.freeze({
          randomizedPresentationId: assignment.mapping.randomizedPresentationId,
          rubricDigest: assignment.rubricDigest,
          mediaType: candidate.mediaType,
          width: candidate.width,
          height: candidate.height,
          bytesBase64: candidate.bytesBase64,
          bytesDigest: candidate.bytesDigest,
          byteLength: candidate.byteLength,
        })
      );
    }
    const base = Object.freeze({
      format: `${coordinatorFormatPrefix}-blind-review` as const,
      version: 1 as const,
      reviewLeaseDigest: reviewLease.reviewLeaseDigest,
      randomizedPresentationPolicyDigest:
        plan.graderPlan.randomizedPresentationPolicyDigest,
      rubrics,
      candidates: Object.freeze(
        candidates.sort((left, right) =>
          compareUnicodeCodePoints(
            left.randomizedPresentationId,
            right.randomizedPresentationId
          )
        )
      ),
      blindedArtifactSetDigest: blindedSetDigest(assignments),
      exportedAt,
    });
    const bundle = Object.freeze({
      ...base,
      bundleDigest: digestAgentCanonicalValue(base),
    });
    scanPublicArtifact(
      {
        ...bundle,
        candidates: bundle.candidates.map(
          ({ bytesBase64: _bytesBase64, ...metadata }) => metadata
        ),
      },
      canaries
    );
    if (
      utf8Encoder.encode(canonicalJsonText(bundle)).byteLength >
      AGENT_EVALUATION_BLIND_REVIEW_MAXIMUM_CANONICAL_BYTES
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.artifactUnsafe);
    }
    await this.#dependencies.files.createCanonicalJson(
      input.outputPath,
      bundle
    );
    return bundle;
  }

  async importReview(
    input: AgentEvaluationImportReviewCommand
  ): Promise<AgentHumanReviewReport> {
    const plan = await this.#readPlan(input.planPath);
    const raw = await this.#dependencies.files.readJson(input.inputPath);
    const canaries = await canarySets(this.#dependencies.canaries);
    scanPublicArtifact(raw, canaries);
    const imported = parseHumanReviewImport(raw);
    const reviewLease = assertReviewLeaseEvidence(
      await this.#dependencies.reviewLeaseSource.open({
        plan,
        expectedReviewLeaseDigest: imported.reviewLeaseDigest,
      }),
      plan,
      imported.reviewLeaseDigest
    );
    const importVerifier = this.#dependencies.reviewImportVerifier;
    const authorityContext = importVerifier
      ? await importVerifier.verify({ plan, artifact: imported })
      : undefined;
    if (
      imported.planDigest !== plan.planDigest ||
      imported.repositoryCommit !== plan.repositoryCommit ||
      !authorityContext
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
    }
    const verifiedAuthorityContext = requireDefined(
      authorityContext,
      AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid
    );
    const assignments = await bindReviewMappings(
      plan,
      reviewAssignments(plan, reviewLease),
      this.#dependencies.blindReviewMappings,
      'load'
    );
    assertReviewLeaseMappingSet(reviewLease, assignments);
    const assignmentById = new Map(
      assignments.map((assignment) => [
        assignment.mapping.randomizedPresentationId,
        assignment,
      ])
    );
    if (
      imported.blindedArtifactSetDigest !== blindedSetDigest(assignments) ||
      imported.randomizedPresentationPolicyDigest !==
        plan.graderPlan.randomizedPresentationPolicyDigest
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.partitionMismatch);
    }
    const adjudicationByPresentation = new Map(
      imported.validationReceipt.candidateAdjudications.map((entry) => [
        entry.randomizedPresentationId,
        entry,
      ])
    );
    if (
      adjudicationByPresentation.size !==
        imported.validationReceipt.candidateAdjudications.length ||
      adjudicationByPresentation.size !== assignments.length
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
    }
    for (const assignment of assignments) {
      const candidate = await this.#dependencies.reviewArtifactSource.load({
        plan,
        attempt: assignment.attempt,
        invocationReceipt: assignment.invocationReceipt,
      });
      const adjudication = adjudicationByPresentation.get(
        assignment.mapping.randomizedPresentationId
      );
      if (
        !adjudication ||
        !isAgentEvaluationReviewCandidate(candidate) ||
        candidate.candidateDigest !== assignment.candidateRef.candidateDigest ||
        adjudication.rubricDigest !== assignment.rubricDigest ||
        adjudication.candidateDigest !==
          digestAgentCanonicalValue({
            randomizedPresentationId:
              assignment.mapping.randomizedPresentationId,
            rubricDigest: assignment.rubricDigest,
            mediaType: candidate.mediaType,
            width: candidate.width,
            height: candidate.height,
            bytesBase64: candidate.bytesBase64,
            bytesDigest: candidate.bytesDigest,
            byteLength: candidate.byteLength,
          })
      ) {
        fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
      }
      scanRasterCandidateBytes(candidate.bytesBase64, canaries);
    }
    const ratingIds = new Set<string>();
    const reviewerAssignments = new Set<string>();
    const reviewersByCaseTarget = new Map<string, Set<string>>();
    const ratings = imported.signedRatings.map((rating) => {
      const assignment = requireDefined(
        assignmentById.get(rating.randomizedPresentationId),
        AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid
      );
      if (
        ratingIds.has(rating.ratingId) ||
        rating.rubricDigest !== assignment.rubricDigest
      ) {
        fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
      }
      ratingIds.add(rating.ratingId);
      const reviewerAssignment = `${assignment.caseTargetKey}\u0000${rating.reviewerPseudonym}`;
      if (reviewerAssignments.has(reviewerAssignment)) {
        fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
      }
      reviewerAssignments.add(reviewerAssignment);
      const assigned =
        reviewersByCaseTarget.get(assignment.caseTargetKey) ??
        new Set<string>();
      assigned.add(rating.reviewerPseudonym);
      reviewersByCaseTarget.set(assignment.caseTargetKey, assigned);
      return createAgentHumanReviewRating({
        ratingId: rating.ratingId,
        attemptId: assignment.attempt.descriptor.attemptId,
        reviewerPseudonym: rating.reviewerPseudonym,
        randomizedPresentationId: rating.randomizedPresentationId,
        rubricDigest: rating.rubricDigest,
        criterionVerdicts: rating.criterionVerdicts,
        verdict: rating.verdict,
      });
    });
    if (
      imported.signedRatings.length > plan.budget.maxHumanRatings ||
      assignments.some(
        ({ caseTargetKey }) =>
          (reviewersByCaseTarget.get(caseTargetKey)?.size ?? 0) <
          plan.graderPlan.minimumIndependentVisualRatings
      )
    ) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.incomplete);
    }
    const generatedAt = this.#dependencies.now();
    assertInstant(generatedAt);
    const report = createAgentHumanReviewReport({
      reportId: `evaluation-human-review:${plan.planDigest.slice('sha256-'.length)}`,
      planDigest: plan.planDigest,
      blindedArtifactSetDigest: imported.blindedArtifactSetDigest,
      ratings: Object.freeze(ratings),
      adjudicationDigest: imported.validationReceipt.adjudicationDigest,
      generatedAt,
    });
    if (!isAgentHumanReviewReport(report)) {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.evidenceInvalid);
    }
    const publicRubrics = Object.freeze(
      await Promise.all(
        [...new Set(assignments.map(({ rubricDigest }) => rubricDigest))]
          .sort(compareUnicodeCodePoints)
          .map((rubricDigest) =>
            this.#dependencies.reviewRubrics.load({ plan, rubricDigest })
          )
      )
    );
    const validatedArtifact = createAgentEvaluationValidatedHumanReviewArtifact(
      {
        reviewArtifact: imported,
        humanReviewReport: report,
        publicRubrics,
        trustRegistry: verifiedAuthorityContext.trustRegistry,
        adjudicationPolicy: verifiedAuthorityContext.adjudicationPolicy,
      }
    );
    const validatedHumanMetricObservations =
      createAgentEvaluationValidatedHumanMetricObservations({
        plan,
        attempts: Object.freeze(assignments.map(({ attempt }) => attempt)),
        humanReviewReport: report,
        validatedHumanReviewArtifact: validatedArtifact,
      });
    const ledger = this.#dependencies.ledgerFactory.open(partitionFor(plan));
    await ledger.putValidatedHumanReview({
      artifact: validatedArtifact,
      humanReviewReport: report,
      validatedHumanMetricObservations,
    });
    return report;
  }

  async finalize(
    input: AgentEvaluationFinalizeCommand
  ): Promise<AgentEvaluationFinalizationReport> {
    const plan = await this.#readPlan(input.planPath);
    const inspection = assertFinalizationInspection(
      await this.#dependencies.finalizationService.inspect({ plan }),
      plan
    );
    const missingFacts = [...inspection.missingFacts];
    if (
      !(await this.#verifyDurableHumanReview(
        plan,
        inspection.reviewedAttempts,
        inspection.validatedHumanReviewArtifacts,
        inspection.validatedHumanMetricObservations,
        inspection.humanReviewReport
      ))
    ) {
      missingFacts.push('validated-human-review-authority');
      missingFacts.sort(compareUnicodeCodePoints);
    }
    if (missingFacts.length > 0) {
      const completedAt = this.#dependencies.now();
      assertInstant(completedAt);
      const report = finalizationReport({
        format: `${coordinatorFormatPrefix}-finalization`,
        version: 1,
        planDigest: plan.planDigest,
        repositoryCommit: plan.repositoryCommit,
        outcome: 'incomplete',
        missingFacts,
        completedAt,
      });
      await this.#dependencies.files.writeCanonicalJson(
        input.outputPath,
        report
      );
      return report;
    }
    const proposedCompletedAt = this.#dependencies.now();
    assertInstant(proposedCompletedAt);
    const intent = assertFinalizationIntent(
      await this.#dependencies.finalizationService.resolveIntent({
        plan,
        proposedCompletedAt,
      }),
      plan
    );
    const completedAt = intent.completedAt;
    assertInstant(completedAt);
    const artifact = inspection.validatedHumanReviewArtifacts[0]!;
    const report = assertAgentEvaluationFinalizationReport(
      await this.#dependencies.finalizationService.finalize({
        plan,
        completedAt,
        reviewLeaseDigest: artifact.reviewLeaseDigest,
        validatedHumanReviewArtifactDigest: artifact.artifactDigest,
        validatedHumanMetricObservationSetDigest:
          digestAgentEvaluationValidatedHumanMetricObservationSet(
            inspection.validatedHumanMetricObservations
          ),
      }),
      plan,
      completedAt
    );
    await this.#dependencies.files.writeCanonicalJson(input.outputPath, report);
    return report;
  }

  async exportEvidence(
    input: AgentEvaluationExportEvidenceCommand
  ): Promise<unknown> {
    const plan = await this.#readPlan(input.planPath);
    const manifest = parseFinalizationManifest(
      await this.#dependencies.files.readJson(input.manifestPath),
      plan
    );
    if (manifest.outcome !== 'satisfied') {
      fail(AGENT_EVALUATION_COORDINATOR_ERROR_CODES.incomplete);
    }
    return this.#dependencies.evidenceArchiveExporter.export({
      plan,
      manifest,
      archiveOutputPath: input.archiveOutputPath,
      rootOutputPath: input.rootOutputPath,
    });
  }
  async validateReview(
    input: AgentEvaluationValidateReviewCommand
  ): Promise<AgentEvaluationHumanReviewImport> {
    const validator = requireDefined(
      this.#dependencies.reviewValidator,
      AGENT_EVALUATION_COORDINATOR_ERROR_CODES.runnerFailed
    );
    return validator.validate(input);
  }

  async #readPlan(path: string): Promise<AgentModelEvaluationPlan> {
    return requirePlan(
      this.#dependencies.files,
      path,
      await this.#dependencies.repositoryCommit()
    );
  }

  async #verifyDurableHumanReview(
    plan: AgentModelEvaluationPlan,
    attempts: readonly AgentModelEvaluationAttempt[],
    artifacts: readonly AgentEvaluationValidatedHumanReviewArtifact[],
    observations: readonly AgentEvaluationValidatedHumanMetricObservation[],
    report: AgentHumanReviewReport | undefined
  ): Promise<boolean> {
    const artifact = artifacts[0];
    const verifier = this.#dependencies.reviewImportVerifier;
    if (
      artifacts.length !== 1 ||
      !artifact ||
      !report ||
      !verifier ||
      !isAgentEvaluationValidatedHumanReviewArtifact(artifact, report)
    ) {
      return false;
    }
    const authorityContext = await verifier.verify({
      plan,
      artifact: artifact.reviewArtifact,
    });
    let expectedObservations: readonly AgentEvaluationValidatedHumanMetricObservation[];
    try {
      expectedObservations =
        createAgentEvaluationValidatedHumanMetricObservations({
          plan,
          attempts,
          humanReviewReport: report,
          validatedHumanReviewArtifact: artifact,
        });
    } catch {
      return false;
    }
    return (
      authorityContext !== undefined &&
      sameCanonicalJson(observations, expectedObservations) &&
      sameCanonicalJson(
        authorityContext.trustRegistry,
        artifact.trustRegistry
      ) &&
      sameCanonicalJson(
        authorityContext.adjudicationPolicy,
        artifact.adjudicationPolicy
      ) &&
      sameCanonicalJson(
        authorityContext.publicRubrics,
        artifact.publicRubrics
      ) &&
      authorityContext.randomizedPresentationPolicyDigest ===
        artifact.reviewArtifact.randomizedPresentationPolicyDigest
    );
  }
}
