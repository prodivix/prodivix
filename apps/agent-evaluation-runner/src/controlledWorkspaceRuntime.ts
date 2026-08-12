import {
  createAgentEvaluationControlledContinuationOutput,
  createAgentEvaluationControlledRuntimeReceipt,
  createAgentEvaluationControlledToolExecutionOutput,
  digestAgentCanonicalValue,
  isAgentCanonicalDigest,
  isAgentControlIdentity,
  isAgentControlInstant,
  inspectAgentControlJson,
  isAgentActionDescriptor,
  type AgentEvaluationCaseMaterial,
  type AgentEvaluationControlledContinuationInput,
  type AgentEvaluationControlledContinuationOutput,
  type AgentEvaluationControlledPersistedArtifactRef,
  type AgentEvaluationControlledPreviewRaster,
  type AgentEvaluationControlledRuntime,
  type AgentEvaluationControlledRuntimeInput,
  type AgentEvaluationControlledRuntimeReceipt,
  type AgentEvaluationControlledRuntimeResult,
  type AgentEvaluationControlledToolExecutionInput,
  type AgentEvaluationControlledToolExecutionOutput,
  type AgentEvaluationResultArtifactRef,
  type AgentEvaluationResultSubmission,
  type AgentEvaluationToolInputMaterial,
  type AgentEvaluationWorkspaceFixtureMaterial,
  type AgentJsonValue,
  type CanonicalDigest,
} from '@prodivix/ai';
import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { AgentEvaluationControlledRuntimeConfiguration } from './runConfig';
import { compileControlledWorkspaceToolSchema } from './controlledWorkspaceRuntimeSchema';

const operationFormat =
  'prodivix.agent-evaluation-controlled-workspace-operation' as const;
const grantFormat =
  'prodivix.agent-evaluation-controlled-workspace-grant' as const;
const cleanupFormat =
  'prodivix.agent-evaluation-controlled-workspace-cleanup' as const;
const maximumReceiptCount = 128;
const frozenMaximumTurnsPerAttempt = 7;
const frozenMaximumToolCallsPerAttempt = 4;
const frozenMaximumRepairRoundsPerAttempt = 2;
const frozenMaximumToolResultBytes = 2_097_152;
const frozenMaximumAggregateToolResultBytes = 8_388_608;
const maximumPersistedArtifactBytes = 2_097_152;
const maximumAggregateArtifactBytes = 8_388_608;
const maximumPreviewBytes = 2_097_152;
const maximumRasterDimension = 4_096;
const maximumAuthorityReceiptCount = 32;
const maximumArtifactCount = 16;

export const CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES = Object.freeze({
  authorityDenied: 'G4_CONTROLLED_WORKSPACE_AUTHORITY_DENIED',
  cleanupFailed: 'G4_CONTROLLED_WORKSPACE_CLEANUP_FAILED',
  materialInvalid: 'G4_CONTROLLED_WORKSPACE_MATERIAL_INVALID',
  operationUnknown: 'G4_CONTROLLED_WORKSPACE_OPERATION_UNKNOWN',
  ownerReceiptInvalid: 'G4_CONTROLLED_WORKSPACE_OWNER_RECEIPT_INVALID',
  persistenceInvalid: 'G4_CONTROLLED_WORKSPACE_PERSISTENCE_INVALID',
  staleRevision: 'G4_CONTROLLED_WORKSPACE_STALE_REVISION',
} as const);

export type ControlledWorkspaceRuntimeErrorCode =
  (typeof CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES)[keyof typeof CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES];

/** Context-free by design: protected case identities never enter logs. */
export class ControlledWorkspaceRuntimeError extends Error {
  readonly code: ControlledWorkspaceRuntimeErrorCode;

  constructor(code: ControlledWorkspaceRuntimeErrorCode) {
    super(code);
    this.name = 'ControlledWorkspaceRuntimeError';
    this.code = code;
  }
}

export type AgentEvaluationControlledWorkspaceGrantInput = Readonly<{
  grantId: string;
  authorityId: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  fixtureDigest: CanonicalDigest;
  baseSnapshotDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  allowedToolIds: readonly string[];
  allowedActionIds: readonly string[];
  allowedTargetRefs: readonly string[];
  generation: number;
  maximumUses: number;
  issuedAt: string;
  expiresAt: string;
}>;

export type AgentEvaluationControlledWorkspaceGrant =
  AgentEvaluationControlledWorkspaceGrantInput &
    Readonly<{
      format: typeof grantFormat;
      version: 1;
      grantDigest: CanonicalDigest;
    }>;

export type AgentEvaluationControlledWorkspaceAuthorizationInput = Readonly<{
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  access: AgentEvaluationCaseMaterial['access'];
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  toolIds: readonly string[];
  actionIds: readonly string[];
  targetRefs: readonly string[];
}>;

export interface AgentEvaluationControlledWorkspaceAuthorizer {
  issue(
    input: AgentEvaluationControlledWorkspaceAuthorizationInput
  ):
    | AgentEvaluationControlledWorkspaceGrant
    | Promise<AgentEvaluationControlledWorkspaceGrant>;
}

export interface AgentEvaluationControlledWorkspaceMaterialSource {
  /** Protected bytes and locators are valid only during this callback. */
  use<T>(
    input: Readonly<{
      planDigest: CanonicalDigest;
      attemptId: string;
      descriptorDigest: CanonicalDigest;
      caseId: string;
      materialDigest: CanonicalDigest;
    }>,
    callback: (material: AgentEvaluationCaseMaterial) => Promise<T>
  ): Promise<T>;
}

export type AgentEvaluationControlledWorkspaceCheckpoint = Readonly<{
  checkpointRef: string;
  attemptId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  checkpointDigest: CanonicalDigest;
  predecessorCheckpointDigest?: CanonicalDigest;
  snapshotDigest: CanonicalDigest;
  securePersistenceReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspacePreflightCode =
  | 'arguments-invalid'
  | 'capability-expected-blocked'
  | 'direct-write-denied'
  | 'grant-denied'
  | 'scope-denied'
  | 'unknown-action'
  | 'unknown-tool';

/** Opaque sandbox authority result. Protected registry values remain inside the session. */
export type AgentEvaluationControlledWorkspacePreflightReceipt = Readonly<{
  toolId: string;
  argumentsDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  generation: number;
  status: 'ready' | 'rejected';
  code?: AgentEvaluationControlledWorkspacePreflightCode;
  effect?: AgentEvaluationToolInputMaterial['effect'];
  toolDefinitionDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  actionId?: string;
  actionDescriptorDigest?: CanonicalDigest;
  targetRef?: string;
  preflightReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspacePublicScanReceipt = Readonly<{
  intentDigest: CanonicalDigest;
  candidateDigest: CanonicalDigest;
  safe: boolean;
  canarySetDigest: CanonicalDigest;
  fingerprintDigest: CanonicalDigest;
  scanReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceEffectKind =
  | 'read'
  | 'proposal-dry-run'
  | 'verification-transaction'
  | 'repair-transaction'
  | 'controlled-preview'
  | 'rejected';

export type AgentEvaluationControlledWorkspaceEffect = Readonly<{
  intentDigest: CanonicalDigest;
  dispatchReceiptDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  generation: number;
  status: 'succeeded' | 'rejected';
  effectKind: AgentEvaluationControlledWorkspaceEffectKind;
  result: AgentJsonValue;
  snapshotBeforeDigest: CanonicalDigest;
  snapshotAfterDigest: CanonicalDigest;
  canonicalWriteObserved: false;
  persistedArtifacts: readonly AgentEvaluationControlledPersistedArtifactRef[];
  commandReceiptDigests: readonly CanonicalDigest[];
  transactionReceiptDigests: readonly CanonicalDigest[];
  authorityReceiptDigests: readonly CanonicalDigest[];
  repairRoundCount: number;
  changedDocumentIds: readonly string[];
  domainDryRun?: Readonly<{
    actionId: string;
    targetRef: string;
    typedProposalValidationReceiptDigest: CanonicalDigest;
    transactionPlanDigest: CanonicalDigest;
    reverseTransactionDigest: CanonicalDigest;
  }>;
  g3Verification?: Readonly<{
    verificationPlanReceiptDigest: CanonicalDigest;
    verificationClosureDigest: CanonicalDigest;
    verdict: 'passed' | 'failed';
    verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
  }>;
  checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  controlledPreview?: AgentEvaluationControlledPreviewRaster;
  publicScan: AgentEvaluationControlledWorkspacePublicScanReceipt;
  effectReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceFinalAuthority = Readonly<{
  attemptId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  finalSnapshotDigest: CanonicalDigest;
  finalCheckpointDigest: CanonicalDigest;
  proposalValidation: Readonly<{
    verdict: 'passed' | 'failed';
    typedProposalValidationReceiptDigest: CanonicalDigest;
  }>;
  g3Verification: Readonly<{
    verificationPlanArtifactRef: string;
    verificationPlanArtifactDigest: CanonicalDigest;
    verificationPlanReceiptDigest: CanonicalDigest;
    verificationClosureArtifactRef: string;
    verificationClosureDigest: CanonicalDigest;
    verdict: 'passed' | 'failed';
    verificationAttemptGrantReceiptDigests: readonly CanonicalDigest[];
  }>;
  repairRoundCount: number;
  controlledPreview?: AgentEvaluationControlledPreviewRaster;
  authorityReceiptDigests: readonly CanonicalDigest[];
  authorityReceiptSetDigest: CanonicalDigest;
  publicScan: AgentEvaluationControlledWorkspacePublicScanReceipt;
  finalAuthorityReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceCleanupReceipt = Readonly<{
  attemptId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  sessionId: string;
  reason: 'completed' | 'failed' | 'discarded' | 'orphaned';
  cleanupIntentDigest: CanonicalDigest;
  cleanupDispatchReceiptDigest: CanonicalDigest;
  cleanupReceiptDigest: CanonicalDigest;
  sourceReferencesRevoked: true;
  sandboxDestroyed: true;
  residualReferenceCount: 0;
  reverseCleanupReceiptDigest?: CanonicalDigest;
}>;

export interface AgentEvaluationControlledWorkspaceSession {
  readonly sessionId: string;
  readonly planDigest: CanonicalDigest;
  readonly attemptId: string;
  readonly descriptorDigest: CanonicalDigest;
  readonly caseId: string;
  readonly materialDigest: CanonicalDigest;
  readonly fixtureDigest: CanonicalDigest;
  readonly baseSnapshotDigest: CanonicalDigest;
  readonly grantDigest: CanonicalDigest;
  readonly toolRegistryDigest: CanonicalDigest;
  readonly actionRegistryDigest: CanonicalDigest;
  readonly generation: number;
  readonly isolationPolicyDigest: CanonicalDigest;
  readonly initialCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  /** Latest durable checkpoint when an existing sandbox is reattached. */
  readonly currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;

  preflight(
    input: Readonly<{
      toolId: string;
      arguments: AgentJsonValue;
      argumentsDigest: CanonicalDigest;
      grantDigest: CanonicalDigest;
      generation: number;
    }>
  ): Promise<AgentEvaluationControlledWorkspacePreflightReceipt>;

  restoreCheckpoint(
    checkpoint: AgentEvaluationControlledWorkspaceCheckpoint
  ): Promise<void>;
  execute(
    input: Readonly<{
      operationId: string;
      intentDigest: CanonicalDigest;
      claimId: string;
      dispatchReceiptDigest: CanonicalDigest;
      stagingRef: string;
      generation: number;
      preflight: AgentEvaluationControlledWorkspacePreflightReceipt;
      arguments: AgentJsonValue;
      maximumResultBytes: number;
      secretCanaries: readonly string[];
    }>
  ): Promise<AgentEvaluationControlledWorkspaceEffect>;
  /** Queries the durable dispatch-keyed staging receipt without repeating an effect. */
  reconcileDispatched(
    input: Readonly<{
      operationId: string;
      intentDigest: CanonicalDigest;
      dispatchReceiptDigest: CanonicalDigest;
      grantDigest: CanonicalDigest;
      generation: number;
    }>
  ): Promise<
    | Readonly<{
        status: 'completed';
        effect: AgentEvaluationControlledWorkspaceEffect;
      }>
    | Readonly<{
        status: 'unknown';
        intentDigest: CanonicalDigest;
        dispatchReceiptDigest: CanonicalDigest;
        grantDigest: CanonicalDigest;
        generation: number;
        reconciliationReceiptDigest: CanonicalDigest;
        cleanupReceiptDigest: CanonicalDigest;
      }>
  >;
  resolveArtifact(
    artifact: AgentEvaluationResultArtifactRef
  ): Promise<AgentEvaluationControlledPersistedArtifactRef>;
  assessFinal(
    input: Readonly<{
      submission: AgentEvaluationResultSubmission;
      finalAssessmentIntentDigest: CanonicalDigest;
      proposalValidationPolicyDigest: CanonicalDigest;
      g3VerificationPolicyDigest: CanonicalDigest;
      maximumRepairRounds: number;
      secretCanaries: readonly string[];
    }>
  ): Promise<AgentEvaluationControlledWorkspaceFinalAuthority>;
  /** Dispatch-keyed and idempotent; an exact receipt is replayed after restart. */
  destroy(
    input: Readonly<{
      reason: 'completed' | 'failed' | 'discarded' | 'orphaned';
      cleanupIntentDigest: CanonicalDigest;
      cleanupDispatchReceiptDigest: CanonicalDigest;
      idempotencyKey: string;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt>;
}

export type AgentEvaluationControlledWorkspaceSessionAttachment = Readonly<{
  status: 'loaded' | 'reattached';
  session: AgentEvaluationControlledWorkspaceSession;
  sessionId: string;
  attemptId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  currentCheckpointDigest: CanonicalDigest;
  attachmentReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceOrphanSession = Readonly<{
  planDigest: CanonicalDigest;
  attemptId: string;
  modelDescriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  generation: number;
  sessionId: string;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  orphanReceiptDigest: CanonicalDigest;
}>;

export interface AgentEvaluationControlledWorkspaceSessionLoader {
  /** Must clone material or reattach the exact durable session before the callback ends. */
  loadOrReattach(
    input: Readonly<{
      material: AgentEvaluationCaseMaterial;
      fixture: AgentEvaluationWorkspaceFixtureMaterial;
      grant: AgentEvaluationControlledWorkspaceGrant;
      isolationPolicyDigest: CanonicalDigest;
    }>
  ):
    | AgentEvaluationControlledWorkspaceSessionAttachment
    | Promise<AgentEvaluationControlledWorkspaceSessionAttachment>;
  listOrphanedSessions(): Promise<
    readonly AgentEvaluationControlledWorkspaceOrphanSession[]
  >;
  /** Orphan destroy is dispatch-keyed, idempotent, and never reloads protected material. */
  destroyOrphanedSession(
    input: Readonly<{
      orphan: AgentEvaluationControlledWorkspaceOrphanSession;
      cleanupIntentDigest: CanonicalDigest;
      cleanupDispatchReceiptDigest: CanonicalDigest;
      idempotencyKey: string;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt>;
}

export type AgentEvaluationControlledWorkspaceOperationIntent = Readonly<{
  format: typeof operationFormat;
  version: 1;
  operationId: string;
  idempotencyKey: string;
  intentDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  turnIndex: number;
  toolCallId: string;
  toolId: string;
  argumentsDigest: CanonicalDigest;
  grantDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  toolDefinitionDigest: CanonicalDigest;
  inputSchemaDigest: CanonicalDigest;
  generation: number;
  sessionId: string;
  priorCheckpointDigest: CanonicalDigest;
  grantExpiresAt: string;
  maximumToolCallsPerAttempt: number;
  maximumRepairRoundsPerAttempt: number;
  maximumAggregateToolResultBytes: number;
}>;

export type AgentEvaluationControlledWorkspaceOperationClaim = Readonly<{
  claimId: string;
  intentDigest: CanonicalDigest;
  operationId: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  useOrdinal: number;
  priorCheckpoint?: AgentEvaluationControlledWorkspaceCheckpoint;
  claimReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceDispatchReceipt = Readonly<{
  claimId: string;
  intentDigest: CanonicalDigest;
  operationId: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  priorCheckpointDigest: CanonicalDigest;
  stagingRef: string;
  dispatchReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceOperationSeal = Readonly<{
  intentDigest: CanonicalDigest;
  operationId: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  dispatchReceiptDigest?: CanonicalDigest;
  toolExecution: AgentEvaluationControlledToolExecutionOutput;
  effect?: AgentEvaluationControlledWorkspaceEffect;
  authorityReceiptDigests: readonly CanonicalDigest[];
  authorityReceiptSetDigest: CanonicalDigest;
  checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  sealReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceAttemptState = Readonly<{
  attemptId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  toolExecutionReceiptDigests: readonly CanonicalDigest[];
  aggregateToolResultBytes: number;
  repairRoundCount: number;
  completedTurnIndexes: readonly number[];
  stateReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceCleanupIntent = Readonly<{
  format: typeof cleanupFormat;
  version: 1;
  operationId: string;
  idempotencyKey: string;
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  checkpointDigest: CanonicalDigest;
  reason: 'completed' | 'failed' | 'discarded' | 'orphaned';
  intentDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceCleanupClaim = Readonly<{
  claimId: string;
  intentDigest: CanonicalDigest;
  attemptId: string;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  claimReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceCleanupDispatchReceipt =
  Readonly<{
    claimId: string;
    intentDigest: CanonicalDigest;
    attemptId: string;
    sessionId: string;
    grantDigest: CanonicalDigest;
    generation: number;
    dispatchReceiptDigest: CanonicalDigest;
  }>;

export type AgentEvaluationControlledWorkspaceCleanupSeal = Readonly<{
  intentDigest: CanonicalDigest;
  attemptId: string;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt;
  dispatchReceiptDigest: CanonicalDigest;
  cleanupReceipt: AgentEvaluationControlledWorkspaceCleanupReceipt;
  sealReceiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationControlledWorkspaceCleanupClaimResult =
  | Readonly<{
      status: 'claimed';
      claim: AgentEvaluationControlledWorkspaceCleanupClaim;
    }>
  | Readonly<{
      status: 'dispatched';
      claim: AgentEvaluationControlledWorkspaceCleanupClaim;
      dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt;
    }>
  | Readonly<{
      status: 'sealed';
      seal: AgentEvaluationControlledWorkspaceCleanupSeal;
    }>;

export type AgentEvaluationControlledWorkspaceOperationClaimResult =
  | Readonly<{
      status: 'claimed';
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
    }>
  | Readonly<{
      status: 'dispatched';
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
      dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt;
    }>
  | Readonly<{
      status: 'sealed';
      seal: AgentEvaluationControlledWorkspaceOperationSeal;
    }>
  | Readonly<{
      status: 'unknown';
      reconciliationReceiptDigest: CanonicalDigest;
      cleanupReceiptDigest: CanonicalDigest;
    }>
  | Readonly<{ status: 'denied' }>;

export interface AgentEvaluationControlledWorkspaceOperationLedger {
  loadAttemptState(
    input: Readonly<{
      attemptId: string;
      grantDigest: CanonicalDigest;
      generation: number;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceAttemptState | undefined>;
  claim(
    intent: AgentEvaluationControlledWorkspaceOperationIntent
  ): Promise<AgentEvaluationControlledWorkspaceOperationClaimResult>;
  markDispatched(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceOperationIntent;
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceDispatchReceipt>;
  sealRejected(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceOperationIntent;
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
      output: AgentEvaluationControlledToolExecutionOutput;
      authorityReceiptDigests: readonly CanonicalDigest[];
      checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal>;
  sealAtomic(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceOperationIntent;
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
      dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt;
      output: AgentEvaluationControlledToolExecutionOutput;
      effect: AgentEvaluationControlledWorkspaceEffect;
      authorityReceiptDigests: readonly CanonicalDigest[];
      checkpoint: AgentEvaluationControlledWorkspaceCheckpoint;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal>;
  reconcileDispatched(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceOperationIntent;
      claim: AgentEvaluationControlledWorkspaceOperationClaim;
      dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt;
      reason: 'seal-ack-loss';
    }>
  ): Promise<
    | Readonly<{
        status: 'sealed';
        seal: AgentEvaluationControlledWorkspaceOperationSeal;
      }>
    | Readonly<{
        status: 'unsealed';
        reconciliationReceiptDigest: CanonicalDigest;
      }>
  >;
  loadSealedToolExecution(
    input: Readonly<{
      attemptId: string;
      grantDigest: CanonicalDigest;
      generation: number;
      receiptDigest: CanonicalDigest;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceOperationSeal | undefined>;
  listSealedToolExecutions(
    input: Readonly<{
      attemptId: string;
      grantDigest: CanonicalDigest;
      generation: number;
    }>
  ): Promise<readonly AgentEvaluationControlledWorkspaceOperationSeal[]>;
  claimCleanup(
    intent: AgentEvaluationControlledWorkspaceCleanupIntent
  ): Promise<AgentEvaluationControlledWorkspaceCleanupClaimResult>;
  markCleanupDispatched(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceCleanupIntent;
      claim: AgentEvaluationControlledWorkspaceCleanupClaim;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceCleanupDispatchReceipt>;
  sealCleanup(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceCleanupIntent;
      claim: AgentEvaluationControlledWorkspaceCleanupClaim;
      dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt;
      cleanupReceipt: AgentEvaluationControlledWorkspaceCleanupReceipt;
    }>
  ): Promise<AgentEvaluationControlledWorkspaceCleanupSeal>;
  reconcileCleanup(
    input: Readonly<{
      intent: AgentEvaluationControlledWorkspaceCleanupIntent;
      claim: AgentEvaluationControlledWorkspaceCleanupClaim;
      dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt;
      reason: 'resume' | 'destroy-failed' | 'seal-ack-loss';
    }>
  ): Promise<
    Readonly<{
      status: 'sealed';
      seal: AgentEvaluationControlledWorkspaceCleanupSeal;
    }>
  >;
}

export type CreateAgentEvaluationControlledWorkspaceRuntimeInput = Readonly<{
  repositoryCommit: string;
  configuration: AgentEvaluationControlledRuntimeConfiguration;
  materialSource: AgentEvaluationControlledWorkspaceMaterialSource;
  authorizer: AgentEvaluationControlledWorkspaceAuthorizer;
  loader: AgentEvaluationControlledWorkspaceSessionLoader;
  operations: AgentEvaluationControlledWorkspaceOperationLedger;
  now: () => string;
  secretCanaries?: () => readonly string[];
}>;

type MaterialBinding = {
  session: AgentEvaluationControlledWorkspaceSession;
  grant: AgentEvaluationControlledWorkspaceGrant;
  fixtureDigest: CanonicalDigest;
  baseSnapshotDigest: CanonicalDigest;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
  loopPolicyDigest: CanonicalDigest;
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint;
  cleanupReceipt?: AgentEvaluationControlledWorkspaceCleanupReceipt;
};

type ControlledWorkspaceAssessmentProjection = Pick<
  AgentEvaluationControlledRuntimeResult,
  | 'artifactResolution'
  | 'proposalValidation'
  | 'isolatedExecution'
  | 'g3Verification'
  | 'controlledPreview'
>;

const fail = (code: ControlledWorkspaceRuntimeErrorCode): never => {
  throw new ControlledWorkspaceRuntimeError(code);
};

const exactCommit = (value: string): boolean => /^[0-9a-f]{40}$/u.test(value);

const boundedCount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= maximumReceiptCount;

const boundedAggregateToolBytes = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0 &&
  value <= frozenMaximumAggregateToolResultBytes;

const exactRecord = (value: unknown): value is Record<string, unknown> =>
  isPlainObject(value) &&
  Object.getOwnPropertySymbols(value).length === 0 &&
  Object.keys(value).every((key) => !isUnsafeObjectKey(key));

const canonicalIdentities = (
  values: readonly string[],
  allowEmpty = true
): readonly string[] => {
  if (
    (!allowEmpty && values.length === 0) ||
    values.length > maximumReceiptCount ||
    values.some((value) => !isAgentControlIdentity(value)) ||
    new Set(values).size !== values.length
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const canonicalDigests = (
  values: readonly CanonicalDigest[],
  allowEmpty = true
): readonly CanonicalDigest[] => {
  if (
    (!allowEmpty && values.length === 0) ||
    values.length > maximumReceiptCount ||
    values.some((value) => !isAgentCanonicalDigest(value)) ||
    new Set(values).size !== values.length
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return Object.freeze([...values].sort(compareUnicodeCodePoints));
};

const checkpointBase = (
  checkpoint: AgentEvaluationControlledWorkspaceCheckpoint
) => ({
  checkpointRef: checkpoint.checkpointRef,
  attemptId: checkpoint.attemptId,
  grantDigest: checkpoint.grantDigest,
  generation: checkpoint.generation,
  ...(checkpoint.predecessorCheckpointDigest
    ? { predecessorCheckpointDigest: checkpoint.predecessorCheckpointDigest }
    : {}),
  snapshotDigest: checkpoint.snapshotDigest,
  securePersistenceReceiptDigest: checkpoint.securePersistenceReceiptDigest,
});

const validateCheckpoint = (
  checkpoint: AgentEvaluationControlledWorkspaceCheckpoint,
  binding?: Readonly<{
    attemptId: string;
    grantDigest: CanonicalDigest;
    generation: number;
  }>
): AgentEvaluationControlledWorkspaceCheckpoint => {
  if (
    !exactRecord(checkpoint) ||
    Object.keys(checkpoint).length !==
      (checkpoint.predecessorCheckpointDigest === undefined ? 7 : 8) ||
    !isAgentControlIdentity(checkpoint.checkpointRef) ||
    !isAgentControlIdentity(checkpoint.attemptId) ||
    !isAgentCanonicalDigest(checkpoint.grantDigest) ||
    !boundedCount(checkpoint.generation) ||
    checkpoint.generation < 1 ||
    (checkpoint.predecessorCheckpointDigest !== undefined &&
      !isAgentCanonicalDigest(checkpoint.predecessorCheckpointDigest)) ||
    !isAgentCanonicalDigest(checkpoint.checkpointDigest) ||
    !isAgentCanonicalDigest(checkpoint.snapshotDigest) ||
    !isAgentCanonicalDigest(checkpoint.securePersistenceReceiptDigest) ||
    (binding !== undefined &&
      (checkpoint.attemptId !== binding.attemptId ||
        checkpoint.grantDigest !== binding.grantDigest ||
        checkpoint.generation !== binding.generation)) ||
    checkpoint.checkpointDigest !==
      digestAgentCanonicalValue(checkpointBase(checkpoint))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return checkpoint;
};

const cleanupBase = (
  receipt: AgentEvaluationControlledWorkspaceCleanupReceipt
) => ({
  attemptId: receipt.attemptId,
  grantDigest: receipt.grantDigest,
  generation: receipt.generation,
  sessionId: receipt.sessionId,
  reason: receipt.reason,
  cleanupIntentDigest: receipt.cleanupIntentDigest,
  cleanupDispatchReceiptDigest: receipt.cleanupDispatchReceiptDigest,
  sourceReferencesRevoked: receipt.sourceReferencesRevoked,
  sandboxDestroyed: receipt.sandboxDestroyed,
  residualReferenceCount: receipt.residualReferenceCount,
  ...(receipt.reverseCleanupReceiptDigest
    ? { reverseCleanupReceiptDigest: receipt.reverseCleanupReceiptDigest }
    : {}),
});

const validateCleanup = (
  receipt: AgentEvaluationControlledWorkspaceCleanupReceipt,
  expected: Readonly<{
    attemptId: string;
    grantDigest: CanonicalDigest;
    generation: number;
    sessionId: string;
    reason: 'completed' | 'failed' | 'discarded' | 'orphaned';
    cleanupIntentDigest: CanonicalDigest;
    cleanupDispatchReceiptDigest: CanonicalDigest;
  }>
): AgentEvaluationControlledWorkspaceCleanupReceipt => {
  if (
    !exactRecord(receipt) ||
    receipt.attemptId !== expected.attemptId ||
    receipt.grantDigest !== expected.grantDigest ||
    receipt.generation !== expected.generation ||
    receipt.sessionId !== expected.sessionId ||
    receipt.reason !== expected.reason ||
    receipt.cleanupIntentDigest !== expected.cleanupIntentDigest ||
    receipt.cleanupDispatchReceiptDigest !==
      expected.cleanupDispatchReceiptDigest ||
    !isAgentCanonicalDigest(receipt.cleanupReceiptDigest) ||
    receipt.sourceReferencesRevoked !== true ||
    receipt.sandboxDestroyed !== true ||
    receipt.residualReferenceCount !== 0 ||
    (receipt.reverseCleanupReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(receipt.reverseCleanupReceiptDigest)) ||
    receipt.cleanupReceiptDigest !==
      digestAgentCanonicalValue(cleanupBase(receipt))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.cleanupFailed);
  }
  return receipt;
};

type CleanupIdentity = Readonly<{
  planDigest: CanonicalDigest;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  caseId: string;
  materialDigest: CanonicalDigest;
  sessionId: string;
  grantDigest: CanonicalDigest;
  generation: number;
  checkpointDigest: CanonicalDigest;
}>;

const createCleanupIntent = (
  identity: CleanupIdentity,
  reason: AgentEvaluationControlledWorkspaceCleanupIntent['reason']
): AgentEvaluationControlledWorkspaceCleanupIntent => {
  const identityBase = Object.freeze({ ...identity, reason });
  const identityDigest = digestAgentCanonicalValue(identityBase);
  const base = Object.freeze({
    format: cleanupFormat,
    version: 1 as const,
    operationId: `operation.controlled-cleanup.${identityDigest.slice(7)}`,
    idempotencyKey: `idempotency.controlled-cleanup.${identityDigest.slice(7)}`,
    ...identityBase,
  });
  return Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
};

const cleanupClaimBase = (
  claim: AgentEvaluationControlledWorkspaceCleanupClaim
) => ({
  claimId: claim.claimId,
  intentDigest: claim.intentDigest,
  attemptId: claim.attemptId,
  sessionId: claim.sessionId,
  grantDigest: claim.grantDigest,
  generation: claim.generation,
});

const validateCleanupClaim = (
  claim: AgentEvaluationControlledWorkspaceCleanupClaim,
  intent: AgentEvaluationControlledWorkspaceCleanupIntent
): AgentEvaluationControlledWorkspaceCleanupClaim => {
  if (
    !isAgentControlIdentity(claim.claimId) ||
    claim.intentDigest !== intent.intentDigest ||
    claim.attemptId !== intent.attemptId ||
    claim.sessionId !== intent.sessionId ||
    claim.grantDigest !== intent.grantDigest ||
    claim.generation !== intent.generation ||
    !isAgentCanonicalDigest(claim.claimReceiptDigest) ||
    claim.claimReceiptDigest !==
      digestAgentCanonicalValue(cleanupClaimBase(claim))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return claim;
};

const cleanupDispatchBase = (
  dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt
) => ({
  claimId: dispatch.claimId,
  intentDigest: dispatch.intentDigest,
  attemptId: dispatch.attemptId,
  sessionId: dispatch.sessionId,
  grantDigest: dispatch.grantDigest,
  generation: dispatch.generation,
});

const validateCleanupDispatch = (
  dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt,
  claim: AgentEvaluationControlledWorkspaceCleanupClaim,
  intent: AgentEvaluationControlledWorkspaceCleanupIntent
): AgentEvaluationControlledWorkspaceCleanupDispatchReceipt => {
  if (
    dispatch.claimId !== claim.claimId ||
    dispatch.intentDigest !== intent.intentDigest ||
    dispatch.attemptId !== intent.attemptId ||
    dispatch.sessionId !== intent.sessionId ||
    dispatch.grantDigest !== intent.grantDigest ||
    dispatch.generation !== intent.generation ||
    !isAgentCanonicalDigest(dispatch.dispatchReceiptDigest) ||
    dispatch.dispatchReceiptDigest !==
      digestAgentCanonicalValue(cleanupDispatchBase(dispatch))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return dispatch;
};

const cleanupSealBase = (
  seal: AgentEvaluationControlledWorkspaceCleanupSeal
) => ({
  intentDigest: seal.intentDigest,
  attemptId: seal.attemptId,
  sessionId: seal.sessionId,
  grantDigest: seal.grantDigest,
  generation: seal.generation,
  dispatch: seal.dispatch,
  dispatchReceiptDigest: seal.dispatchReceiptDigest,
  cleanupReceiptDigest: seal.cleanupReceipt.cleanupReceiptDigest,
});

const validateCleanupSeal = (
  seal: AgentEvaluationControlledWorkspaceCleanupSeal,
  intent: AgentEvaluationControlledWorkspaceCleanupIntent,
  dispatch: AgentEvaluationControlledWorkspaceCleanupDispatchReceipt
): AgentEvaluationControlledWorkspaceCleanupSeal => {
  validateCleanup(seal.cleanupReceipt, {
    attemptId: intent.attemptId,
    grantDigest: intent.grantDigest,
    generation: intent.generation,
    sessionId: intent.sessionId,
    reason: intent.reason,
    cleanupIntentDigest: intent.intentDigest,
    cleanupDispatchReceiptDigest: dispatch.dispatchReceiptDigest,
  });
  validateCleanupDispatch(
    seal.dispatch,
    {
      claimId: seal.dispatch.claimId,
      intentDigest: intent.intentDigest,
      attemptId: intent.attemptId,
      sessionId: intent.sessionId,
      grantDigest: intent.grantDigest,
      generation: intent.generation,
      claimReceiptDigest: digestAgentCanonicalValue({
        claimId: seal.dispatch.claimId,
        intentDigest: intent.intentDigest,
        attemptId: intent.attemptId,
        sessionId: intent.sessionId,
        grantDigest: intent.grantDigest,
        generation: intent.generation,
      }),
    },
    intent
  );
  if (
    seal.intentDigest !== intent.intentDigest ||
    seal.attemptId !== intent.attemptId ||
    seal.sessionId !== intent.sessionId ||
    seal.grantDigest !== intent.grantDigest ||
    seal.generation !== intent.generation ||
    !sameCanonicalJson(seal.dispatch, dispatch) ||
    seal.dispatchReceiptDigest !== dispatch.dispatchReceiptDigest ||
    !isAgentCanonicalDigest(seal.sealReceiptDigest) ||
    seal.sealReceiptDigest !== digestAgentCanonicalValue(cleanupSealBase(seal))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return seal;
};

const orphanBase = (
  orphan: AgentEvaluationControlledWorkspaceOrphanSession
) => ({
  planDigest: orphan.planDigest,
  attemptId: orphan.attemptId,
  modelDescriptorDigest: orphan.modelDescriptorDigest,
  caseId: orphan.caseId,
  materialDigest: orphan.materialDigest,
  grantDigest: orphan.grantDigest,
  generation: orphan.generation,
  sessionId: orphan.sessionId,
  currentCheckpoint: orphan.currentCheckpoint,
});

const validateOrphan = (
  orphan: AgentEvaluationControlledWorkspaceOrphanSession
): AgentEvaluationControlledWorkspaceOrphanSession => {
  validateCheckpoint(orphan.currentCheckpoint, {
    attemptId: orphan.attemptId,
    grantDigest: orphan.grantDigest,
    generation: orphan.generation,
  });
  if (
    !isAgentCanonicalDigest(orphan.planDigest) ||
    !isAgentControlIdentity(orphan.attemptId) ||
    !isAgentCanonicalDigest(orphan.modelDescriptorDigest) ||
    !isAgentControlIdentity(orphan.caseId) ||
    !isAgentCanonicalDigest(orphan.materialDigest) ||
    !isAgentCanonicalDigest(orphan.grantDigest) ||
    !boundedCount(orphan.generation) ||
    orphan.generation < 1 ||
    !isAgentControlIdentity(orphan.sessionId) ||
    !isAgentCanonicalDigest(orphan.orphanReceiptDigest) ||
    orphan.orphanReceiptDigest !== digestAgentCanonicalValue(orphanBase(orphan))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return orphan;
};

export const createAgentEvaluationControlledWorkspaceGrant = (
  input: AgentEvaluationControlledWorkspaceGrantInput
): AgentEvaluationControlledWorkspaceGrant => {
  const allowedToolIds = canonicalIdentities(input.allowedToolIds, false);
  const allowedActionIds = canonicalIdentities(input.allowedActionIds);
  const allowedTargetRefs = canonicalIdentities(input.allowedTargetRefs, false);
  if (
    !isAgentControlIdentity(input.grantId) ||
    !isAgentControlIdentity(input.authorityId) ||
    !isAgentCanonicalDigest(input.planDigest) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    !isAgentCanonicalDigest(input.fixtureDigest) ||
    !isAgentCanonicalDigest(input.baseSnapshotDigest) ||
    !isAgentCanonicalDigest(input.toolRegistryDigest) ||
    !isAgentCanonicalDigest(input.actionRegistryDigest) ||
    !boundedCount(input.generation) ||
    input.generation < 1 ||
    !boundedCount(input.maximumUses) ||
    input.maximumUses < 1 ||
    !isAgentControlInstant(input.issuedAt) ||
    !isAgentControlInstant(input.expiresAt) ||
    Date.parse(input.expiresAt) <= Date.parse(input.issuedAt)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
  const base = Object.freeze({
    format: grantFormat,
    version: 1 as const,
    grantId: input.grantId,
    authorityId: input.authorityId,
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    fixtureDigest: input.fixtureDigest,
    baseSnapshotDigest: input.baseSnapshotDigest,
    toolRegistryDigest: input.toolRegistryDigest,
    actionRegistryDigest: input.actionRegistryDigest,
    allowedToolIds,
    allowedActionIds,
    allowedTargetRefs,
    generation: input.generation,
    maximumUses: input.maximumUses,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
  });
  return Object.freeze({
    ...base,
    grantDigest: digestAgentCanonicalValue(base),
  });
};

export const validateAgentEvaluationControlledWorkspaceMaterial = (
  material: AgentEvaluationCaseMaterial,
  identity: Readonly<{
    caseId: string;
    materialDigest: CanonicalDigest;
  }>
): Readonly<{
  fixture: AgentEvaluationWorkspaceFixtureMaterial;
  toolRegistryDigest: CanonicalDigest;
  actionRegistryDigest: CanonicalDigest;
}> => {
  const { materialDigest, ...materialBase } = material;
  if (
    material.caseId !== identity.caseId ||
    materialDigest !== identity.materialDigest ||
    materialDigest !== digestAgentCanonicalValue(materialBase) ||
    !Array.isArray(material.invocation.blocks) ||
    !Array.isArray(material.invocation.tools)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.materialInvalid);
  }
  const fixtureBlocks = material.invocation.blocks.filter(
    (block) => block.kind === 'workspace-fixture'
  );
  if (fixtureBlocks.length !== 1) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.materialInvalid);
  }
  const fixture = fixtureBlocks[0]!.fixture;
  const { fixtureDigest, ...fixtureBase } = fixture;
  const { snapshotDigest, ...snapshotBase } = fixture.snapshot;
  if (
    fixtureDigest !== digestAgentCanonicalValue(fixtureBase) ||
    snapshotDigest !== digestAgentCanonicalValue(snapshotBase) ||
    fixture.workspaceSnapshotDigest !==
      digestAgentCanonicalValue(fixture.workspaceSnapshot)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.materialInvalid);
  }
  const tools = [...material.invocation.tools].sort((left, right) =>
    compareUnicodeCodePoints(left.toolId, right.toolId)
  );
  if (
    new Set(tools.map(({ toolId }) => toolId)).size !== tools.length ||
    tools.some((tool) => {
      const { definitionDigest, ...base } = tool;
      return (
        definitionDigest !== digestAgentCanonicalValue(base) ||
        !compileControlledWorkspaceToolSchema(tool.inputSchema).ok
      );
    })
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.materialInvalid);
  }
  const actions = [...fixture.actionRegistry].sort((left, right) =>
    compareUnicodeCodePoints(left.actionId, right.actionId)
  );
  if (
    new Set(actions.map(({ actionId }) => actionId)).size !== actions.length ||
    actions.some((action) => {
      return (
        !isAgentActionDescriptor(action.descriptor) ||
        action.actionId !== action.descriptor.descriptorId ||
        action.descriptorDigest !== action.descriptor.descriptorDigest ||
        action.actionDigest !== digestAgentCanonicalValue(action.action) ||
        action.action.ownerId !== action.descriptor.ownerId ||
        action.action.actionType !== action.descriptor.actionType ||
        action.action.inputSchemaId !== action.descriptor.inputSchemaId ||
        action.action.target.id !== action.targetRef
      );
    })
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.materialInvalid);
  }
  return Object.freeze({
    fixture,
    toolRegistryDigest: digestAgentCanonicalValue({
      tools: tools.map(({ toolId, definitionDigest }) => ({
        toolId,
        definitionDigest,
      })),
    }),
    actionRegistryDigest: fixture.actionRegistryDigest,
  });
};

const validateGrant = (
  value: AgentEvaluationControlledWorkspaceGrant,
  expected: AgentEvaluationControlledWorkspaceAuthorizationInput,
  configuration: AgentEvaluationControlledRuntimeConfiguration,
  now: string
): AgentEvaluationControlledWorkspaceGrant => {
  const recreated = createAgentEvaluationControlledWorkspaceGrant({
    grantId: value.grantId,
    authorityId: value.authorityId,
    planDigest: value.planDigest,
    attemptId: value.attemptId,
    descriptorDigest: value.descriptorDigest,
    caseId: value.caseId,
    materialDigest: value.materialDigest,
    fixtureDigest: value.fixtureDigest,
    baseSnapshotDigest: value.baseSnapshotDigest,
    toolRegistryDigest: value.toolRegistryDigest,
    actionRegistryDigest: value.actionRegistryDigest,
    allowedToolIds: value.allowedToolIds,
    allowedActionIds: value.allowedActionIds,
    allowedTargetRefs: value.allowedTargetRefs,
    generation: value.generation,
    maximumUses: value.maximumUses,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  });
  if (
    !sameCanonicalJson(value, recreated) ||
    value.authorityId !== configuration.authorityId ||
    value.planDigest !== expected.planDigest ||
    value.attemptId !== expected.attemptId ||
    value.descriptorDigest !== expected.descriptorDigest ||
    value.caseId !== expected.caseId ||
    value.materialDigest !== expected.materialDigest ||
    value.fixtureDigest !== expected.fixture.fixtureDigest ||
    value.baseSnapshotDigest !== expected.fixture.workspaceSnapshotDigest ||
    value.toolRegistryDigest !== expected.toolRegistryDigest ||
    value.actionRegistryDigest !== expected.actionRegistryDigest ||
    value.maximumUses > configuration.loop.maximumToolCallsPerAttempt ||
    value.allowedToolIds.some((toolId) => !expected.toolIds.includes(toolId)) ||
    value.allowedActionIds.some(
      (actionId) => !expected.actionIds.includes(actionId)
    ) ||
    value.allowedTargetRefs.some(
      (targetRef) => !expected.targetRefs.includes(targetRef)
    ) ||
    !isAgentControlInstant(now) ||
    Date.parse(now) < Date.parse(value.issuedAt) ||
    Date.parse(now) >= Date.parse(value.expiresAt)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
  return value;
};

const validateSession = (
  session: AgentEvaluationControlledWorkspaceSession,
  expected: AgentEvaluationControlledWorkspaceAuthorizationInput,
  grant: AgentEvaluationControlledWorkspaceGrant,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): AgentEvaluationControlledWorkspaceSession => {
  const checkpointBinding = Object.freeze({
    attemptId: expected.attemptId,
    grantDigest: grant.grantDigest,
    generation: grant.generation,
  });
  validateCheckpoint(session.initialCheckpoint, checkpointBinding);
  validateCheckpoint(session.currentCheckpoint, checkpointBinding);
  if (
    !isAgentControlIdentity(session.sessionId) ||
    session.planDigest !== expected.planDigest ||
    session.attemptId !== expected.attemptId ||
    session.descriptorDigest !== expected.descriptorDigest ||
    session.caseId !== expected.caseId ||
    session.materialDigest !== expected.materialDigest ||
    session.fixtureDigest !== expected.fixture.fixtureDigest ||
    session.baseSnapshotDigest !== expected.fixture.workspaceSnapshotDigest ||
    session.grantDigest !== grant.grantDigest ||
    session.toolRegistryDigest !== expected.toolRegistryDigest ||
    session.actionRegistryDigest !== expected.actionRegistryDigest ||
    session.generation !== grant.generation ||
    session.isolationPolicyDigest !== configuration.isolationPolicyDigest ||
    session.initialCheckpoint.snapshotDigest !== session.baseSnapshotDigest ||
    session.initialCheckpoint.predecessorCheckpointDigest !== undefined
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return session;
};

const attachmentBase = (
  attachment: AgentEvaluationControlledWorkspaceSessionAttachment
) => ({
  status: attachment.status,
  sessionId: attachment.sessionId,
  attemptId: attachment.attemptId,
  grantDigest: attachment.grantDigest,
  generation: attachment.generation,
  currentCheckpointDigest: attachment.currentCheckpointDigest,
});

const validateAttachment = (
  attachment: AgentEvaluationControlledWorkspaceSessionAttachment,
  expected: AgentEvaluationControlledWorkspaceAuthorizationInput,
  grant: AgentEvaluationControlledWorkspaceGrant,
  configuration: AgentEvaluationControlledRuntimeConfiguration,
  attemptState: AgentEvaluationControlledWorkspaceAttemptState | undefined
): AgentEvaluationControlledWorkspaceSession => {
  const session = validateSession(
    attachment.session,
    expected,
    grant,
    configuration
  );
  if (
    !['loaded', 'reattached'].includes(attachment.status) ||
    attachment.sessionId !== session.sessionId ||
    attachment.attemptId !== expected.attemptId ||
    attachment.grantDigest !== grant.grantDigest ||
    attachment.generation !== grant.generation ||
    attachment.currentCheckpointDigest !==
      session.currentCheckpoint.checkpointDigest ||
    !isAgentCanonicalDigest(attachment.attachmentReceiptDigest) ||
    attachment.attachmentReceiptDigest !==
      digestAgentCanonicalValue(attachmentBase(attachment)) ||
    (attachment.status === 'loaded') !== (attemptState === undefined) ||
    (attemptState !== undefined &&
      attemptState.currentCheckpoint.checkpointDigest !==
        session.currentCheckpoint.checkpointDigest)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return session;
};

const attemptStateBase = (
  state: AgentEvaluationControlledWorkspaceAttemptState
) => ({
  attemptId: state.attemptId,
  grantDigest: state.grantDigest,
  generation: state.generation,
  currentCheckpoint: state.currentCheckpoint,
  toolExecutionReceiptDigests: state.toolExecutionReceiptDigests,
  aggregateToolResultBytes: state.aggregateToolResultBytes,
  repairRoundCount: state.repairRoundCount,
  completedTurnIndexes: state.completedTurnIndexes,
});

const validateAttemptState = (
  state: AgentEvaluationControlledWorkspaceAttemptState | undefined,
  expected: Readonly<{
    attemptId: string;
    grantDigest: CanonicalDigest;
    generation: number;
  }>,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): AgentEvaluationControlledWorkspaceAttemptState | undefined => {
  if (state === undefined) return undefined;
  validateCheckpoint(state.currentCheckpoint, expected);
  const receiptDigests = canonicalDigests(state.toolExecutionReceiptDigests);
  const turns = [...state.completedTurnIndexes].sort(
    (left, right) => left - right
  );
  if (
    state.attemptId !== expected.attemptId ||
    state.grantDigest !== expected.grantDigest ||
    state.generation !== expected.generation ||
    !boundedAggregateToolBytes(state.aggregateToolResultBytes) ||
    state.aggregateToolResultBytes >
      configuration.loop.maximumAggregateToolResultBytes ||
    !boundedCount(state.repairRoundCount) ||
    state.repairRoundCount > configuration.loop.maximumRepairRoundsPerAttempt ||
    receiptDigests.length > configuration.loop.maximumToolCallsPerAttempt ||
    !sameCanonicalJson(receiptDigests, state.toolExecutionReceiptDigests) ||
    turns.some(
      (turn, index) =>
        !Number.isSafeInteger(turn) ||
        turn < 0 ||
        turn >= configuration.loop.maximumTurnsPerAttempt ||
        (index > 0 && turns[index - 1] === turn)
    ) ||
    !sameCanonicalJson(turns, state.completedTurnIndexes) ||
    !isAgentCanonicalDigest(state.stateReceiptDigest) ||
    state.stateReceiptDigest !==
      digestAgentCanonicalValue(attemptStateBase(state))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return state;
};

const preflightBase = (
  receipt: AgentEvaluationControlledWorkspacePreflightReceipt
) => ({
  toolId: receipt.toolId,
  argumentsDigest: receipt.argumentsDigest,
  grantDigest: receipt.grantDigest,
  generation: receipt.generation,
  status: receipt.status,
  ...(receipt.code ? { code: receipt.code } : {}),
  ...(receipt.effect ? { effect: receipt.effect } : {}),
  toolDefinitionDigest: receipt.toolDefinitionDigest,
  inputSchemaDigest: receipt.inputSchemaDigest,
  ...(receipt.actionId ? { actionId: receipt.actionId } : {}),
  ...(receipt.actionDescriptorDigest
    ? { actionDescriptorDigest: receipt.actionDescriptorDigest }
    : {}),
  ...(receipt.targetRef ? { targetRef: receipt.targetRef } : {}),
});

const validatePreflight = (
  receipt: AgentEvaluationControlledWorkspacePreflightReceipt,
  input: AgentEvaluationControlledToolExecutionInput,
  binding: MaterialBinding
): AgentEvaluationControlledWorkspacePreflightReceipt => {
  const actionFields = [
    receipt.actionId,
    receipt.actionDescriptorDigest,
    receipt.targetRef,
  ];
  const hasAction = actionFields.every((value) => value !== undefined);
  const forbiddenTool = [
    'workspace.direct-write',
    'workspace.commit',
    'approval.self-issue',
  ].includes(input.toolId);
  const proposalActionMatches =
    exactRecord(input.arguments) &&
    input.arguments.actionId === receipt.actionId &&
    input.arguments.descriptorDigest === receipt.actionDescriptorDigest &&
    exactRecord(input.arguments.target) &&
    input.arguments.target.id === receipt.targetRef;
  if (
    receipt.toolId !== input.toolId ||
    receipt.argumentsDigest !== input.argumentsDigest ||
    receipt.grantDigest !== binding.grant.grantDigest ||
    receipt.generation !== binding.grant.generation ||
    !['ready', 'rejected'].includes(receipt.status) ||
    !isAgentCanonicalDigest(receipt.toolDefinitionDigest) ||
    !isAgentCanonicalDigest(receipt.inputSchemaDigest) ||
    !isAgentCanonicalDigest(receipt.preflightReceiptDigest) ||
    receipt.preflightReceiptDigest !==
      digestAgentCanonicalValue(preflightBase(receipt)) ||
    (actionFields.some((value) => value !== undefined) && !hasAction) ||
    (hasAction &&
      (!isAgentControlIdentity(receipt.actionId!) ||
        !isAgentCanonicalDigest(receipt.actionDescriptorDigest!) ||
        !isAgentControlIdentity(receipt.targetRef!))) ||
    (receipt.status === 'ready' &&
      (!receipt.effect ||
        receipt.code !== undefined ||
        receipt.effect === 'transaction-only' ||
        forbiddenTool ||
        !binding.grant.allowedToolIds.includes(input.toolId))) ||
    (receipt.status === 'rejected' &&
      (!receipt.code || receipt.actionId !== undefined)) ||
    (forbiddenTool &&
      (receipt.status !== 'rejected' ||
        receipt.code !== 'direct-write-denied')) ||
    (receipt.status === 'ready' &&
      receipt.effect === 'proposal-only' &&
      (!hasAction ||
        !proposalActionMatches ||
        !binding.grant.allowedActionIds.includes(receipt.actionId!) ||
        !binding.grant.allowedTargetRefs.includes(receipt.targetRef!))) ||
    (receipt.status === 'ready' &&
      receipt.effect !== 'proposal-only' &&
      hasAction)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return receipt;
};

const operationIntent = (
  input: AgentEvaluationControlledToolExecutionInput,
  binding: MaterialBinding,
  preflight: AgentEvaluationControlledWorkspacePreflightReceipt
): AgentEvaluationControlledWorkspaceOperationIntent => {
  const identityBase = Object.freeze({
    planDigest: input.planDigest,
    attemptId: input.attemptId,
    descriptorDigest: input.descriptorDigest,
    caseId: input.caseId,
    materialDigest: input.materialDigest,
    loopPolicyDigest: input.loopPolicyDigest,
    turnIndex: input.turnIndex,
    toolCallId: input.toolCallId,
    toolId: input.toolId,
    argumentsDigest: input.argumentsDigest,
    grantDigest: binding.grant.grantDigest,
    toolRegistryDigest: binding.toolRegistryDigest,
    toolDefinitionDigest: preflight.toolDefinitionDigest,
    inputSchemaDigest: preflight.inputSchemaDigest,
    generation: binding.grant.generation,
    sessionId: binding.session.sessionId,
    priorCheckpointDigest: binding.currentCheckpoint.checkpointDigest,
    grantExpiresAt: binding.grant.expiresAt,
    maximumToolCallsPerAttempt: frozenMaximumToolCallsPerAttempt,
    maximumRepairRoundsPerAttempt: frozenMaximumRepairRoundsPerAttempt,
    maximumAggregateToolResultBytes: frozenMaximumAggregateToolResultBytes,
  });
  const identityDigest = digestAgentCanonicalValue(identityBase);
  const operationId = `operation.controlled-tool.${identityDigest.slice(7)}`;
  const idempotencyKey = `idempotency.controlled-tool.${identityDigest.slice(7)}`;
  const base = Object.freeze({
    format: operationFormat,
    version: 1 as const,
    operationId,
    idempotencyKey,
    ...identityBase,
  });
  return Object.freeze({
    ...base,
    intentDigest: digestAgentCanonicalValue(base),
  });
};

const claimBase = (
  claim: AgentEvaluationControlledWorkspaceOperationClaim
) => ({
  claimId: claim.claimId,
  intentDigest: claim.intentDigest,
  operationId: claim.operationId,
  planDigest: claim.planDigest,
  attemptId: claim.attemptId,
  sessionId: claim.sessionId,
  grantDigest: claim.grantDigest,
  generation: claim.generation,
  useOrdinal: claim.useOrdinal,
  ...(claim.priorCheckpoint
    ? { priorCheckpointDigest: claim.priorCheckpoint.checkpointDigest }
    : {}),
});

const validateClaim = (
  claim: AgentEvaluationControlledWorkspaceOperationClaim,
  binding: MaterialBinding,
  intent: AgentEvaluationControlledWorkspaceOperationIntent
): AgentEvaluationControlledWorkspaceOperationClaim => {
  if (claim.priorCheckpoint) {
    validateCheckpoint(claim.priorCheckpoint, {
      attemptId: intent.attemptId,
      grantDigest: intent.grantDigest,
      generation: intent.generation,
    });
  }
  if (
    !isAgentControlIdentity(claim.claimId) ||
    claim.intentDigest !== intent.intentDigest ||
    claim.operationId !== intent.operationId ||
    claim.planDigest !== intent.planDigest ||
    claim.attemptId !== intent.attemptId ||
    claim.sessionId !== intent.sessionId ||
    claim.grantDigest !== intent.grantDigest ||
    claim.generation !== binding.grant.generation ||
    !boundedCount(claim.useOrdinal) ||
    claim.useOrdinal < 1 ||
    claim.useOrdinal > binding.grant.maximumUses ||
    !isAgentCanonicalDigest(claim.claimReceiptDigest) ||
    claim.claimReceiptDigest !== digestAgentCanonicalValue(claimBase(claim))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return claim;
};

const dispatchBase = (
  dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt
) => ({
  claimId: dispatch.claimId,
  intentDigest: dispatch.intentDigest,
  operationId: dispatch.operationId,
  planDigest: dispatch.planDigest,
  attemptId: dispatch.attemptId,
  sessionId: dispatch.sessionId,
  grantDigest: dispatch.grantDigest,
  generation: dispatch.generation,
  priorCheckpointDigest: dispatch.priorCheckpointDigest,
  stagingRef: dispatch.stagingRef,
});

const validateDispatch = (
  dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt,
  claim: AgentEvaluationControlledWorkspaceOperationClaim,
  intent: AgentEvaluationControlledWorkspaceOperationIntent,
  currentCheckpoint: AgentEvaluationControlledWorkspaceCheckpoint
): AgentEvaluationControlledWorkspaceDispatchReceipt => {
  if (
    dispatch.claimId !== claim.claimId ||
    dispatch.intentDigest !== intent.intentDigest ||
    dispatch.operationId !== intent.operationId ||
    dispatch.planDigest !== intent.planDigest ||
    dispatch.attemptId !== intent.attemptId ||
    dispatch.sessionId !== intent.sessionId ||
    dispatch.grantDigest !== intent.grantDigest ||
    dispatch.generation !== claim.generation ||
    dispatch.priorCheckpointDigest !== currentCheckpoint.checkpointDigest ||
    !isAgentControlIdentity(dispatch.stagingRef) ||
    !isAgentCanonicalDigest(dispatch.dispatchReceiptDigest) ||
    dispatch.dispatchReceiptDigest !==
      digestAgentCanonicalValue(dispatchBase(dispatch))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return dispatch;
};

const recreateToolExecution = (
  input: AgentEvaluationControlledToolExecutionInput,
  output: AgentEvaluationControlledToolExecutionOutput
): AgentEvaluationControlledToolExecutionOutput =>
  createAgentEvaluationControlledToolExecutionOutput(input, {
    grantDigest: output.receipt.grantDigest,
    toolRegistryDigest: output.receipt.toolRegistryDigest,
    toolDefinitionDigest: output.receipt.toolDefinitionDigest,
    inputSchemaDigest: output.receipt.inputSchemaDigest,
    generation: output.receipt.generation,
    idempotencyKey: output.receipt.idempotencyKey,
    operationIntentDigest: output.receipt.operationIntentDigest,
    status: output.receipt.status,
    result: output.result,
    persistedArtifacts: output.receipt.persistedArtifacts,
    commandReceiptDigests: output.receipt.commandReceiptDigests,
    transactionReceiptDigests: output.receipt.transactionReceiptDigests,
  });

const sealBase = (seal: AgentEvaluationControlledWorkspaceOperationSeal) => ({
  intentDigest: seal.intentDigest,
  operationId: seal.operationId,
  planDigest: seal.planDigest,
  attemptId: seal.attemptId,
  sessionId: seal.sessionId,
  grantDigest: seal.grantDigest,
  generation: seal.generation,
  ...(seal.dispatchReceiptDigest
    ? { dispatchReceiptDigest: seal.dispatchReceiptDigest }
    : {}),
  toolExecutionReceiptDigest: seal.toolExecution.receipt.receiptDigest,
  ...(seal.effect
    ? { effectReceiptDigest: seal.effect.effectReceiptDigest }
    : {}),
  authorityReceiptDigests: seal.authorityReceiptDigests,
  authorityReceiptSetDigest: seal.authorityReceiptSetDigest,
  checkpoint: seal.checkpoint,
});

const validateSeal = (
  seal: AgentEvaluationControlledWorkspaceOperationSeal,
  input: AgentEvaluationControlledToolExecutionInput,
  intent: AgentEvaluationControlledWorkspaceOperationIntent,
  dispatch?: AgentEvaluationControlledWorkspaceDispatchReceipt
): AgentEvaluationControlledWorkspaceOperationSeal => {
  validateCheckpoint(seal.checkpoint, {
    attemptId: intent.attemptId,
    grantDigest: intent.grantDigest,
    generation: intent.generation,
  });
  const recreated = recreateToolExecution(input, seal.toolExecution);
  const authorityReceiptDigests = canonicalDigests(
    seal.authorityReceiptDigests,
    false
  );
  if (
    seal.intentDigest !== intent.intentDigest ||
    seal.operationId !== intent.operationId ||
    seal.planDigest !== intent.planDigest ||
    seal.attemptId !== intent.attemptId ||
    seal.sessionId !== intent.sessionId ||
    seal.grantDigest !== intent.grantDigest ||
    seal.generation !== intent.generation ||
    (dispatch !== undefined &&
      seal.dispatchReceiptDigest !== dispatch.dispatchReceiptDigest) ||
    (seal.dispatchReceiptDigest !== undefined &&
      !isAgentCanonicalDigest(seal.dispatchReceiptDigest)) ||
    (seal.dispatchReceiptDigest !== undefined) !==
      (seal.effect !== undefined) ||
    (seal.effect !== undefined &&
      (seal.effect.intentDigest !== intent.intentDigest ||
        seal.effect.dispatchReceiptDigest !== seal.dispatchReceiptDigest ||
        seal.effect.effectReceiptDigest !==
          digestAgentCanonicalValue(effectBase(seal.effect)) ||
        !sameCanonicalJson(seal.effect.result, recreated.result) ||
        !sameCanonicalJson(
          seal.effect.persistedArtifacts,
          recreated.receipt.persistedArtifacts
        ))) ||
    !sameCanonicalJson(recreated, seal.toolExecution) ||
    !sameCanonicalJson(authorityReceiptDigests, seal.authorityReceiptDigests) ||
    authorityReceiptDigests.length > maximumAuthorityReceiptCount ||
    !isAgentCanonicalDigest(seal.authorityReceiptSetDigest) ||
    seal.authorityReceiptSetDigest !==
      authoritySetDigest(authorityReceiptDigests) ||
    !isAgentCanonicalDigest(seal.sealReceiptDigest) ||
    seal.sealReceiptDigest !== digestAgentCanonicalValue(sealBase(seal))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return seal;
};

const validateStoredSeal = (
  seal: AgentEvaluationControlledWorkspaceOperationSeal,
  binding: MaterialBinding,
  expectedExecution?: AgentEvaluationControlledToolExecutionOutput
): AgentEvaluationControlledWorkspaceOperationSeal => {
  const execution = seal.toolExecution;
  const { receiptDigest, ...receiptBase } = execution.receipt;
  const authorityReceiptDigests = canonicalDigests(
    seal.authorityReceiptDigests,
    false
  );
  validateCheckpoint(seal.checkpoint, {
    attemptId: binding.grant.attemptId,
    grantDigest: binding.grant.grantDigest,
    generation: binding.grant.generation,
  });
  if (
    seal.planDigest !== binding.grant.planDigest ||
    seal.attemptId !== binding.grant.attemptId ||
    seal.sessionId !== binding.session.sessionId ||
    seal.grantDigest !== binding.grant.grantDigest ||
    seal.generation !== binding.grant.generation ||
    execution.receipt.planDigest !== binding.grant.planDigest ||
    execution.receipt.attemptId !== binding.grant.attemptId ||
    execution.receipt.descriptorDigest !== binding.grant.descriptorDigest ||
    execution.receipt.caseId !== binding.grant.caseId ||
    execution.receipt.materialDigest !== binding.grant.materialDigest ||
    execution.receipt.loopPolicyDigest !== binding.loopPolicyDigest ||
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(receiptBase) ||
    execution.receipt.resultDigest !==
      digestAgentCanonicalValue(execution.result) ||
    !sameCanonicalJson(authorityReceiptDigests, seal.authorityReceiptDigests) ||
    seal.authorityReceiptSetDigest !==
      authoritySetDigest(authorityReceiptDigests) ||
    (seal.effect !== undefined &&
      seal.effect.effectReceiptDigest !==
        digestAgentCanonicalValue(effectBase(seal.effect))) ||
    seal.sealReceiptDigest !== digestAgentCanonicalValue(sealBase(seal)) ||
    (expectedExecution !== undefined &&
      !sameCanonicalJson(execution, expectedExecution))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
  }
  return seal;
};

const expectedEffectKind = (
  preflight: AgentEvaluationControlledWorkspacePreflightReceipt
): AgentEvaluationControlledWorkspaceEffectKind | undefined => {
  if (preflight.effect === 'read-only') return 'read';
  if (preflight.effect === 'proposal-only') return 'proposal-dry-run';
  if (preflight.toolId === 'verification.plan.request') {
    return 'verification-transaction';
  }
  if (preflight.toolId === 'verification.repair.request') {
    return 'repair-transaction';
  }
  if (preflight.toolId === 'preview.raster.render') return 'controlled-preview';
  return undefined;
};

const validatePreview = (
  preview: AgentEvaluationControlledPreviewRaster,
  renderPolicyDigest: CanonicalDigest
): boolean =>
  isAgentControlIdentity(preview.artifactRef) &&
  isAgentCanonicalDigest(preview.artifactDigest) &&
  ['image/png', 'image/webp'].includes(preview.mediaType) &&
  Number.isSafeInteger(preview.width) &&
  preview.width >= 1 &&
  preview.width <= maximumRasterDimension &&
  Number.isSafeInteger(preview.height) &&
  preview.height >= 1 &&
  preview.height <= maximumRasterDimension &&
  Number.isSafeInteger(preview.byteLength) &&
  preview.byteLength >= 1 &&
  preview.byteLength <= maximumPreviewBytes &&
  preview.renderPolicyDigest === renderPolicyDigest;

const validatePersistedArtifacts = (
  artifacts: readonly AgentEvaluationControlledPersistedArtifactRef[]
): readonly AgentEvaluationControlledPersistedArtifactRef[] => {
  if (
    !Array.isArray(artifacts) ||
    artifacts.length > maximumArtifactCount ||
    artifacts.some(
      (artifact) =>
        !isAgentControlIdentity(artifact.artifactRef) ||
        !isAgentCanonicalDigest(artifact.artifactDigest) ||
        !Number.isSafeInteger(artifact.byteLength) ||
        artifact.byteLength < 0 ||
        artifact.byteLength > maximumPersistedArtifactBytes ||
        !isAgentCanonicalDigest(artifact.persistenceReceiptDigest)
    ) ||
    new Set(
      artifacts.map(
        ({ artifactKind, artifactRef }) => `${artifactKind}\u0000${artifactRef}`
      )
    ).size !== artifacts.length
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  const totalBytes = artifacts.reduce(
    (total, { byteLength }) => total + byteLength,
    0
  );
  if (
    !Number.isSafeInteger(totalBytes) ||
    totalBytes > maximumAggregateArtifactBytes
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return artifacts;
};

const effectPublicCandidate = (
  effect: AgentEvaluationControlledWorkspaceEffect
): AgentJsonValue =>
  Object.freeze({
    result: effect.result,
    persistedArtifacts: effect.persistedArtifacts,
    changedDocumentIds: effect.changedDocumentIds,
    snapshotBeforeDigest: effect.snapshotBeforeDigest,
    snapshotAfterDigest: effect.snapshotAfterDigest,
    checkpoint: effect.checkpoint,
    ...(effect.domainDryRun ? { domainDryRun: effect.domainDryRun } : {}),
    ...(effect.g3Verification ? { g3Verification: effect.g3Verification } : {}),
    ...(effect.controlledPreview
      ? { controlledPreview: effect.controlledPreview }
      : {}),
  }) as AgentJsonValue;

const publicScanBase = (
  scan: AgentEvaluationControlledWorkspacePublicScanReceipt
) => ({
  intentDigest: scan.intentDigest,
  candidateDigest: scan.candidateDigest,
  safe: scan.safe,
  canarySetDigest: scan.canarySetDigest,
  fingerprintDigest: scan.fingerprintDigest,
});

const effectBase = (effect: AgentEvaluationControlledWorkspaceEffect) => ({
  intentDigest: effect.intentDigest,
  dispatchReceiptDigest: effect.dispatchReceiptDigest,
  grantDigest: effect.grantDigest,
  generation: effect.generation,
  status: effect.status,
  effectKind: effect.effectKind,
  result: effect.result,
  snapshotBeforeDigest: effect.snapshotBeforeDigest,
  snapshotAfterDigest: effect.snapshotAfterDigest,
  canonicalWriteObserved: effect.canonicalWriteObserved,
  persistedArtifacts: effect.persistedArtifacts,
  commandReceiptDigests: effect.commandReceiptDigests,
  transactionReceiptDigests: effect.transactionReceiptDigests,
  authorityReceiptDigests: effect.authorityReceiptDigests,
  repairRoundCount: effect.repairRoundCount,
  changedDocumentIds: effect.changedDocumentIds,
  ...(effect.domainDryRun ? { domainDryRun: effect.domainDryRun } : {}),
  ...(effect.g3Verification ? { g3Verification: effect.g3Verification } : {}),
  checkpoint: effect.checkpoint,
  ...(effect.controlledPreview
    ? { controlledPreview: effect.controlledPreview }
    : {}),
  publicScan: effect.publicScan,
});

const validateEffect = (
  effect: AgentEvaluationControlledWorkspaceEffect,
  preflight: AgentEvaluationControlledWorkspacePreflightReceipt,
  intent: AgentEvaluationControlledWorkspaceOperationIntent,
  dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt,
  configuration: AgentEvaluationControlledRuntimeConfiguration,
  expectedSnapshotDigest: CanonicalDigest,
  expectedCheckpointDigest: CanonicalDigest
): AgentEvaluationControlledWorkspaceEffect => {
  validateCheckpoint(effect.checkpoint, {
    attemptId: intent.attemptId,
    grantDigest: intent.grantDigest,
    generation: intent.generation,
  });
  const commandReceiptDigests = canonicalDigests(effect.commandReceiptDigests);
  const transactionReceiptDigests = canonicalDigests(
    effect.transactionReceiptDigests
  );
  const authorityReceiptDigests = canonicalDigests(
    effect.authorityReceiptDigests,
    false
  );
  const changedDocumentIds = canonicalIdentities(effect.changedDocumentIds);
  validatePersistedArtifacts(effect.persistedArtifacts);
  const publicScan = effect.publicScan;
  if (
    effect.intentDigest !== intent.intentDigest ||
    effect.dispatchReceiptDigest !== dispatch.dispatchReceiptDigest ||
    effect.grantDigest !== intent.grantDigest ||
    effect.generation !== intent.generation ||
    !['succeeded', 'rejected'].includes(effect.status) ||
    !isAgentCanonicalDigest(effect.snapshotBeforeDigest) ||
    !isAgentCanonicalDigest(effect.snapshotAfterDigest) ||
    effect.snapshotBeforeDigest !== expectedSnapshotDigest ||
    effect.canonicalWriteObserved !== false ||
    inspectAgentControlJson(
      effect.result,
      configuration.loop.maximumToolResultBytes
    ).length > 0 ||
    authorityReceiptDigests.length > maximumAuthorityReceiptCount ||
    !boundedCount(effect.repairRoundCount) ||
    effect.repairRoundCount >
      configuration.loop.maximumRepairRoundsPerAttempt ||
    effect.checkpoint.snapshotDigest !== effect.snapshotAfterDigest ||
    (effect.snapshotAfterDigest === expectedSnapshotDigest
      ? effect.checkpoint.checkpointDigest !== expectedCheckpointDigest ||
        effect.checkpoint.predecessorCheckpointDigest !== undefined
      : effect.checkpoint.predecessorCheckpointDigest !==
        expectedCheckpointDigest) ||
    !sameCanonicalJson(commandReceiptDigests, effect.commandReceiptDigests) ||
    !sameCanonicalJson(
      transactionReceiptDigests,
      effect.transactionReceiptDigests
    ) ||
    !sameCanonicalJson(
      authorityReceiptDigests,
      effect.authorityReceiptDigests
    ) ||
    !sameCanonicalJson(changedDocumentIds, effect.changedDocumentIds) ||
    publicScan.intentDigest !== intent.intentDigest ||
    !isAgentCanonicalDigest(publicScan.candidateDigest) ||
    typeof publicScan.safe !== 'boolean' ||
    !isAgentCanonicalDigest(publicScan.canarySetDigest) ||
    !isAgentCanonicalDigest(publicScan.fingerprintDigest) ||
    !isAgentCanonicalDigest(publicScan.scanReceiptDigest) ||
    publicScan.scanReceiptDigest !==
      digestAgentCanonicalValue(publicScanBase(publicScan)) ||
    !authorityReceiptDigests.includes(publicScan.scanReceiptDigest) ||
    !authorityReceiptDigests.includes(publicScan.fingerprintDigest) ||
    (publicScan.safe &&
      publicScan.candidateDigest !==
        digestAgentCanonicalValue(effectPublicCandidate(effect))) ||
    (!publicScan.safe && effect.status !== 'rejected') ||
    !isAgentCanonicalDigest(effect.effectReceiptDigest) ||
    effect.effectReceiptDigest !== digestAgentCanonicalValue(effectBase(effect))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  if (effect.status === 'rejected') {
    if (
      effect.effectKind !== 'rejected' ||
      effect.snapshotAfterDigest !== expectedSnapshotDigest ||
      effect.persistedArtifacts.length > 0 ||
      commandReceiptDigests.length > 0 ||
      transactionReceiptDigests.length > 0 ||
      changedDocumentIds.length > 0 ||
      effect.domainDryRun !== undefined ||
      effect.g3Verification !== undefined ||
      effect.controlledPreview !== undefined
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    if (
      !publicScan.safe &&
      !sameCanonicalJson(effect.result, {
        status: 'rejected',
        code: 'unsafe-result',
      })
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    return effect;
  }
  const expectedKind = expectedEffectKind(preflight);
  if (!expectedKind || effect.effectKind !== expectedKind) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  if (expectedKind === 'read') {
    if (
      effect.snapshotAfterDigest !== expectedSnapshotDigest ||
      effect.persistedArtifacts.length > 0 ||
      commandReceiptDigests.length > 0 ||
      transactionReceiptDigests.length > 0 ||
      changedDocumentIds.length > 0 ||
      effect.domainDryRun !== undefined ||
      effect.g3Verification !== undefined ||
      effect.controlledPreview !== undefined
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    return effect;
  }
  if (expectedKind === 'proposal-dry-run') {
    const dryRun = effect.domainDryRun;
    if (
      !dryRun ||
      dryRun.actionId !== preflight.actionId ||
      dryRun.targetRef !== preflight.targetRef ||
      !isAgentCanonicalDigest(dryRun.typedProposalValidationReceiptDigest) ||
      !isAgentCanonicalDigest(dryRun.transactionPlanDigest) ||
      !isAgentCanonicalDigest(dryRun.reverseTransactionDigest) ||
      effect.snapshotAfterDigest !== expectedSnapshotDigest ||
      commandReceiptDigests.length > 0 ||
      transactionReceiptDigests.length > 0 ||
      changedDocumentIds.length > 0 ||
      effect.g3Verification !== undefined ||
      effect.controlledPreview !== undefined ||
      !effect.persistedArtifacts.some(
        ({ artifactKind }) => artifactKind === 'proposal'
      )
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    return effect;
  }
  if (expectedKind === 'controlled-preview') {
    if (
      !effect.controlledPreview ||
      !validatePreview(
        effect.controlledPreview,
        configuration.controlledRenderPolicyDigest
      ) ||
      effect.snapshotAfterDigest !== expectedSnapshotDigest ||
      commandReceiptDigests.length > 0 ||
      transactionReceiptDigests.length > 0 ||
      changedDocumentIds.length > 0 ||
      effect.domainDryRun !== undefined ||
      effect.g3Verification !== undefined
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    return effect;
  }
  const g3 = effect.g3Verification;
  const verificationAttemptGrantReceiptDigests = g3
    ? canonicalDigests(g3.verificationAttemptGrantReceiptDigests, false)
    : Object.freeze([]);
  if (
    !g3 ||
    !isAgentCanonicalDigest(g3.verificationPlanReceiptDigest) ||
    !isAgentCanonicalDigest(g3.verificationClosureDigest) ||
    !['passed', 'failed'].includes(g3.verdict) ||
    !sameCanonicalJson(
      verificationAttemptGrantReceiptDigests,
      g3.verificationAttemptGrantReceiptDigests
    ) ||
    !verificationAttemptGrantReceiptDigests.every((digest) =>
      authorityReceiptDigests.includes(digest)
    ) ||
    effect.controlledPreview !== undefined ||
    !effect.persistedArtifacts.some(
      ({ artifactKind }) => artifactKind === 'verification-plan'
    ) ||
    !effect.persistedArtifacts.some(
      ({ artifactKind }) => artifactKind === 'verification-closure'
    )
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  if (expectedKind === 'verification-transaction') {
    if (
      commandReceiptDigests.length < 1 ||
      transactionReceiptDigests.length < 1 ||
      changedDocumentIds.length < 1 ||
      transactionReceiptDigests.length > 0 ===
        (effect.snapshotAfterDigest === expectedSnapshotDigest)
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
  } else if (
    effect.repairRoundCount < 1 ||
    commandReceiptDigests.length < 1 ||
    transactionReceiptDigests.length < 1 ||
    effect.snapshotAfterDigest === expectedSnapshotDigest
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return effect;
};

const createRejectedOutput = (
  input: AgentEvaluationControlledToolExecutionInput,
  intent: AgentEvaluationControlledWorkspaceOperationIntent,
  code: string
): AgentEvaluationControlledToolExecutionOutput =>
  createAgentEvaluationControlledToolExecutionOutput(input, {
    grantDigest: intent.grantDigest,
    toolRegistryDigest: intent.toolRegistryDigest,
    toolDefinitionDigest: intent.toolDefinitionDigest,
    inputSchemaDigest: intent.inputSchemaDigest,
    generation: intent.generation,
    idempotencyKey: intent.idempotencyKey,
    operationIntentDigest: intent.intentDigest,
    status: 'rejected',
    result: Object.freeze({ status: 'rejected', code }),
    persistedArtifacts: Object.freeze([]),
    commandReceiptDigests: Object.freeze([]),
    transactionReceiptDigests: Object.freeze([]),
  });

const outputForEffect = (
  input: AgentEvaluationControlledToolExecutionInput,
  intent: AgentEvaluationControlledWorkspaceOperationIntent,
  effect: AgentEvaluationControlledWorkspaceEffect
): AgentEvaluationControlledToolExecutionOutput =>
  createAgentEvaluationControlledToolExecutionOutput(input, {
    grantDigest: intent.grantDigest,
    toolRegistryDigest: intent.toolRegistryDigest,
    toolDefinitionDigest: intent.toolDefinitionDigest,
    inputSchemaDigest: intent.inputSchemaDigest,
    generation: intent.generation,
    idempotencyKey: intent.idempotencyKey,
    operationIntentDigest: intent.intentDigest,
    status: effect.status,
    result: effect.result,
    persistedArtifacts: effect.persistedArtifacts,
    commandReceiptDigests: effect.commandReceiptDigests,
    transactionReceiptDigests: effect.transactionReceiptDigests,
  });

const authoritySetDigest = (
  authorityReceiptDigests: readonly CanonicalDigest[]
): CanonicalDigest =>
  digestAgentCanonicalValue({
    authorityReceiptDigests: canonicalDigests(authorityReceiptDigests, false),
  });

const finalAuthorityBase = (
  authority: AgentEvaluationControlledWorkspaceFinalAuthority
) => ({
  attemptId: authority.attemptId,
  grantDigest: authority.grantDigest,
  generation: authority.generation,
  finalSnapshotDigest: authority.finalSnapshotDigest,
  finalCheckpointDigest: authority.finalCheckpointDigest,
  proposalValidation: authority.proposalValidation,
  g3Verification: authority.g3Verification,
  repairRoundCount: authority.repairRoundCount,
  ...(authority.controlledPreview
    ? { controlledPreview: authority.controlledPreview }
    : {}),
  authorityReceiptDigests: authority.authorityReceiptDigests,
  authorityReceiptSetDigest: authority.authorityReceiptSetDigest,
  publicScan: authority.publicScan,
});

const finalPublicCandidate = (
  authority: AgentEvaluationControlledWorkspaceFinalAuthority
): AgentJsonValue =>
  Object.freeze({
    attemptId: authority.attemptId,
    finalSnapshotDigest: authority.finalSnapshotDigest,
    finalCheckpointDigest: authority.finalCheckpointDigest,
    proposalValidation: authority.proposalValidation,
    g3Verification: authority.g3Verification,
    repairRoundCount: authority.repairRoundCount,
    ...(authority.controlledPreview
      ? { controlledPreview: authority.controlledPreview }
      : {}),
  }) as AgentJsonValue;

const verifyFinalAuthority = (
  authority: AgentEvaluationControlledWorkspaceFinalAuthority,
  input: AgentEvaluationControlledRuntimeInput,
  binding: MaterialBinding,
  resolvedArtifacts: readonly AgentEvaluationControlledPersistedArtifactRef[],
  sealedExecutions: readonly AgentEvaluationControlledWorkspaceOperationSeal[],
  finalAssessmentIntentDigest: CanonicalDigest
): AgentEvaluationControlledWorkspaceFinalAuthority => {
  const authorityReceiptDigests = canonicalDigests(
    authority.authorityReceiptDigests,
    false
  );
  const verificationAttemptGrantReceiptDigests = canonicalDigests(
    authority.g3Verification.verificationAttemptGrantReceiptDigests,
    false
  );
  const effects = sealedExecutions
    .filter(
      (
        seal
      ): seal is AgentEvaluationControlledWorkspaceOperationSeal &
        Readonly<{ effect: AgentEvaluationControlledWorkspaceEffect }> =>
        seal.effect !== undefined
    )
    .sort(
      (left, right) =>
        left.toolExecution.receipt.turnIndex -
        right.toolExecution.receipt.turnIndex
    )
    .map(({ effect }) => effect);
  let lineageSnapshotDigest = binding.baseSnapshotDigest;
  for (const effect of effects) {
    if (effect.snapshotBeforeDigest !== lineageSnapshotDigest) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
    }
    lineageSnapshotDigest = effect.snapshotAfterDigest;
  }
  const proposalEffect = effects.find(
    ({ effectKind }) => effectKind === 'proposal-dry-run'
  );
  const verificationEffect = [...effects]
    .reverse()
    .find(({ g3Verification }) => g3Verification !== undefined);
  const repairRoundCount = effects.filter(
    ({ effectKind }) => effectKind === 'repair-transaction'
  ).length;
  const previewEffect = effects.find(
    ({ effectKind }) => effectKind === 'controlled-preview'
  );
  const publicScan = authority.publicScan;
  if (
    authority.attemptId !== input.attemptId ||
    authority.grantDigest !== binding.grant.grantDigest ||
    authority.generation !== binding.grant.generation ||
    authority.finalSnapshotDigest !==
      binding.currentCheckpoint.snapshotDigest ||
    authority.finalCheckpointDigest !==
      binding.currentCheckpoint.checkpointDigest ||
    lineageSnapshotDigest !== authority.finalSnapshotDigest ||
    !['passed', 'failed'].includes(authority.proposalValidation.verdict) ||
    !isAgentCanonicalDigest(
      authority.proposalValidation.typedProposalValidationReceiptDigest
    ) ||
    !proposalEffect?.domainDryRun ||
    proposalEffect.domainDryRun.typedProposalValidationReceiptDigest !==
      authority.proposalValidation.typedProposalValidationReceiptDigest ||
    !isAgentControlIdentity(
      authority.g3Verification.verificationPlanArtifactRef
    ) ||
    !isAgentCanonicalDigest(
      authority.g3Verification.verificationPlanArtifactDigest
    ) ||
    !isAgentCanonicalDigest(
      authority.g3Verification.verificationPlanReceiptDigest
    ) ||
    !isAgentControlIdentity(
      authority.g3Verification.verificationClosureArtifactRef
    ) ||
    !isAgentCanonicalDigest(
      authority.g3Verification.verificationClosureDigest
    ) ||
    !['passed', 'failed'].includes(authority.g3Verification.verdict) ||
    !verificationEffect?.g3Verification ||
    verificationEffect.g3Verification.verificationPlanReceiptDigest !==
      authority.g3Verification.verificationPlanReceiptDigest ||
    verificationEffect.g3Verification.verificationClosureDigest !==
      authority.g3Verification.verificationClosureDigest ||
    verificationEffect.g3Verification.verdict !==
      authority.g3Verification.verdict ||
    !sameCanonicalJson(
      verificationEffect.g3Verification.verificationAttemptGrantReceiptDigests,
      verificationAttemptGrantReceiptDigests
    ) ||
    !verificationAttemptGrantReceiptDigests.every((digest) =>
      authorityReceiptDigests.includes(digest)
    ) ||
    repairRoundCount !== authority.repairRoundCount ||
    authority.repairRoundCount !== input.submission.plan.repairRoundCount ||
    authority.g3Verification.verificationPlanArtifactRef !==
      input.submission.plan.planRef ||
    authority.g3Verification.verificationPlanArtifactDigest !==
      input.submission.plan.planDigest ||
    authority.g3Verification.verificationClosureArtifactRef !==
      input.submission.closure.closureRef ||
    authority.g3Verification.verificationClosureDigest !==
      input.submission.closure.closureDigest ||
    authority.g3Verification.verdict !== input.submission.closure.verdict ||
    !resolvedArtifacts.some(
      ({ artifactKind, artifactRef, artifactDigest }) =>
        artifactKind === 'verification-plan' &&
        artifactRef === authority.g3Verification.verificationPlanArtifactRef &&
        artifactDigest ===
          authority.g3Verification.verificationPlanArtifactDigest
    ) ||
    !resolvedArtifacts.some(
      ({ artifactKind, artifactRef, artifactDigest }) =>
        artifactKind === 'verification-closure' &&
        artifactRef ===
          authority.g3Verification.verificationClosureArtifactRef &&
        artifactDigest === authority.g3Verification.verificationClosureDigest
    ) ||
    (authority.controlledPreview !== undefined &&
      (!validatePreview(
        authority.controlledPreview,
        input.controlledRenderPolicyDigest
      ) ||
        !previewEffect?.controlledPreview ||
        !sameCanonicalJson(
          previewEffect.controlledPreview,
          authority.controlledPreview
        ))) ||
    !sameCanonicalJson(
      authorityReceiptDigests,
      authority.authorityReceiptDigests
    ) ||
    authorityReceiptDigests.length > maximumAuthorityReceiptCount ||
    authority.authorityReceiptSetDigest !==
      authoritySetDigest(authorityReceiptDigests) ||
    publicScan.intentDigest !== finalAssessmentIntentDigest ||
    publicScan.safe !== true ||
    publicScan.candidateDigest !==
      digestAgentCanonicalValue(finalPublicCandidate(authority)) ||
    publicScan.scanReceiptDigest !==
      digestAgentCanonicalValue(publicScanBase(publicScan)) ||
    !authorityReceiptDigests.includes(publicScan.scanReceiptDigest) ||
    !authorityReceiptDigests.includes(publicScan.fingerprintDigest) ||
    !isAgentCanonicalDigest(authority.finalAuthorityReceiptDigest) ||
    authority.finalAuthorityReceiptDigest !==
      digestAgentCanonicalValue(finalAuthorityBase(authority))
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
  }
  return authority;
};

const runtimeConfigurationMatches = (
  input: AgentEvaluationControlledRuntimeInput,
  repositoryCommit: string,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): boolean =>
  input.repositoryCommit === repositoryCommit &&
  input.runtimeAuthorityId === configuration.authorityId &&
  input.runtimeImplementationDigest ===
    configuration.runtimeImplementationDigest &&
  input.artifactResolutionPolicyDigest ===
    configuration.artifactResolutionPolicyDigest &&
  input.proposalValidationPolicyDigest ===
    configuration.proposalValidationPolicyDigest &&
  input.isolationPolicyDigest === configuration.isolationPolicyDigest &&
  input.g3VerificationPolicyDigest ===
    configuration.g3VerificationPolicyDigest &&
  input.controlledRenderPolicyDigest ===
    configuration.controlledRenderPolicyDigest &&
  input.loopPolicyDigest === configuration.loop.loopPolicyDigest &&
  input.maximumTurnsPerAttempt === configuration.loop.maximumTurnsPerAttempt &&
  input.maximumToolCallsPerAttempt ===
    configuration.loop.maximumToolCallsPerAttempt &&
  input.maximumRepairRoundsPerAttempt ===
    configuration.loop.maximumRepairRoundsPerAttempt &&
  input.maximumAggregateArtifactBytes ===
    configuration.loop.maximumAggregateArtifactBytes;

const hasExactKeys = (
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> =>
  exactRecord(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const admitToolInput = (
  input: AgentEvaluationControlledToolExecutionInput,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): void => {
  if (
    !hasExactKeys(input, [
      'planDigest',
      'attemptId',
      'descriptorDigest',
      'caseId',
      'materialDigest',
      'loopPolicyDigest',
      'turnIndex',
      'toolCallId',
      'toolId',
      'arguments',
      'argumentsDigest',
      'maximumToolResultBytes',
    ]) ||
    !isAgentCanonicalDigest(input.planDigest) ||
    !isAgentControlIdentity(input.attemptId) ||
    !isAgentCanonicalDigest(input.descriptorDigest) ||
    !isAgentControlIdentity(input.caseId) ||
    !isAgentCanonicalDigest(input.materialDigest) ||
    input.loopPolicyDigest !== configuration.loop.loopPolicyDigest ||
    !Number.isSafeInteger(input.turnIndex) ||
    input.turnIndex < 0 ||
    input.turnIndex >= configuration.loop.maximumTurnsPerAttempt ||
    !isAgentControlIdentity(input.toolCallId) ||
    !isAgentControlIdentity(input.toolId) ||
    input.maximumToolResultBytes !==
      configuration.loop.maximumToolResultBytes ||
    inspectAgentControlJson(
      input.arguments,
      configuration.loop.maximumToolResultBytes
    ).length > 0 ||
    !isAgentCanonicalDigest(input.argumentsDigest) ||
    input.argumentsDigest !== digestAgentCanonicalValue(input.arguments)
  ) {
    fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
};

const admitContinuationInput = (
  input: AgentEvaluationControlledContinuationInput,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): AgentEvaluationControlledContinuationOutput => {
  if (
    input.loopPolicyDigest !== configuration.loop.loopPolicyDigest ||
    input.maximumAggregateToolResultBytes !==
      configuration.loop.maximumAggregateToolResultBytes ||
    !Number.isSafeInteger(input.completedTurnIndex) ||
    input.completedTurnIndex < 0 ||
    input.completedTurnIndex >= configuration.loop.maximumTurnsPerAttempt - 1
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
  try {
    return createAgentEvaluationControlledContinuationOutput(input);
  } catch {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
};

const admitRuntimeInput = (
  input: AgentEvaluationControlledRuntimeInput,
  repositoryCommit: string,
  configuration: AgentEvaluationControlledRuntimeConfiguration
): void => {
  const submission = input.submission;
  const { argumentsDigest, submissionDigest, ...submissionBase } = submission;
  if (
    !exactRecord(input.submissionReceipt) ||
    !Array.isArray(input.toolExecutionReceipts) ||
    !Array.isArray(input.continuationReceipts)
  ) {
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
  const { receiptDigest, ...submissionReceiptBase } = input.submissionReceipt;
  const toolReceiptDigests = input.toolExecutionReceipts.map(
    (receipt) => receipt.receiptDigest
  );
  const toolReceiptsValid = input.toolExecutionReceipts.every((receipt) => {
    const { receiptDigest: toolReceiptDigest, ...receiptBase } = receipt;
    return (
      receipt.planDigest === input.planDigest &&
      receipt.attemptId === input.attemptId &&
      receipt.descriptorDigest === input.descriptorDigest &&
      receipt.caseId === input.caseId &&
      receipt.materialDigest === input.materialDigest &&
      receipt.loopPolicyDigest === input.loopPolicyDigest &&
      Number.isSafeInteger(receipt.turnIndex) &&
      receipt.turnIndex >= 0 &&
      receipt.turnIndex < configuration.loop.maximumTurnsPerAttempt &&
      isAgentControlIdentity(receipt.toolCallId) &&
      isAgentControlIdentity(receipt.toolId) &&
      isAgentCanonicalDigest(toolReceiptDigest) &&
      toolReceiptDigest === digestAgentCanonicalValue(receiptBase) &&
      Array.isArray(receipt.persistedArtifacts) &&
      receipt.persistedArtifacts.length <= maximumArtifactCount &&
      Array.isArray(receipt.commandReceiptDigests) &&
      receipt.commandReceiptDigests.length <= maximumReceiptCount &&
      Array.isArray(receipt.transactionReceiptDigests) &&
      receipt.transactionReceiptDigests.length <= maximumReceiptCount
    );
  });
  const continuationReceiptsValid = input.continuationReceipts.every(
    (receipt) => {
      const { receiptDigest: continuationReceiptDigest, ...receiptBase } =
        receipt;
      return (
        receipt.planDigest === input.planDigest &&
        receipt.attemptId === input.attemptId &&
        receipt.descriptorDigest === input.descriptorDigest &&
        receipt.caseId === input.caseId &&
        receipt.materialDigest === input.materialDigest &&
        receipt.loopPolicyDigest === input.loopPolicyDigest &&
        Number.isSafeInteger(receipt.completedTurnIndex) &&
        receipt.completedTurnIndex >= 0 &&
        receipt.nextTurnIndex === receipt.completedTurnIndex + 1 &&
        receipt.nextTurnIndex < configuration.loop.maximumTurnsPerAttempt &&
        Array.isArray(receipt.toolExecutionReceiptDigests) &&
        receipt.toolExecutionReceiptDigests.length <=
          configuration.loop.maximumToolCallsPerAttempt &&
        receipt.toolExecutionReceiptDigests.every((digest: CanonicalDigest) =>
          toolReceiptDigests.includes(digest)
        ) &&
        isAgentCanonicalDigest(continuationReceiptDigest) &&
        continuationReceiptDigest === digestAgentCanonicalValue(receiptBase)
      );
    }
  );
  if (
    !runtimeConfigurationMatches(input, repositoryCommit, configuration) ||
    !hasExactKeys(submission, [
      'resultSchemaVersion',
      'resultSchemaDigest',
      'caseId',
      'caseDigest',
      'materialDigest',
      'caseDefinitionDigest',
      'expectedAuthorityDigest',
      'gradingPolicyDigest',
      'graderMaterialDigest',
      'targetRefs',
      'actionIds',
      'contextSourceRefs',
      'diagnosticCodes',
      'plan',
      'closure',
      'artifactRefs',
      'argumentsDigest',
      'submissionDigest',
    ]) ||
    inspectAgentControlJson(
      submission,
      configuration.loop.maximumAggregateArtifactBytes
    ).length > 0 ||
    !isAgentCanonicalDigest(argumentsDigest) ||
    !isAgentCanonicalDigest(submissionDigest) ||
    submissionDigest !==
      digestAgentCanonicalValue({ argumentsDigest, result: submissionBase }) ||
    input.submission.caseId !== input.caseId ||
    input.submission.caseDigest !== input.caseDigest ||
    input.submission.materialDigest !== input.materialDigest ||
    input.submissionReceipt.attemptId !== input.attemptId ||
    input.submissionReceipt.descriptorDigest !== input.descriptorDigest ||
    input.submissionReceipt.submissionDigest !==
      input.submission.submissionDigest ||
    input.submissionReceipt.toolArgumentsDigest !== argumentsDigest ||
    !isAgentCanonicalDigest(receiptDigest) ||
    receiptDigest !== digestAgentCanonicalValue(submissionReceiptBase) ||
    !Array.isArray(input.toolExecutionReceipts) ||
    input.toolExecutionReceipts.length >
      configuration.loop.maximumToolCallsPerAttempt ||
    !Array.isArray(input.continuationReceipts) ||
    input.continuationReceipts.length >=
      configuration.loop.maximumTurnsPerAttempt ||
    new Set(toolReceiptDigests).size !== toolReceiptDigests.length ||
    !toolReceiptsValid ||
    !continuationReceiptsValid ||
    input.submission.artifactRefs.length > maximumArtifactCount ||
    input.submission.artifactRefs.some(
      (artifact) =>
        !Number.isSafeInteger(artifact.byteLength) ||
        artifact.byteLength < 0 ||
        artifact.byteLength > maximumPersistedArtifactBytes
    )
  ) {
    fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
  }
};

/**
 * Durable orchestration around the Workspace and G3 owner ports. The runner
 * never receives a direct VFS mutation primitive: the injected isolated
 * session is the only component allowed to call the Workspace Agent Action
 * Registry, reversible Command/Transaction APIs, and G3 planner/evaluator.
 */
export class AgentEvaluationControlledWorkspaceRuntime implements AgentEvaluationControlledRuntime {
  readonly #input: CreateAgentEvaluationControlledWorkspaceRuntimeInput;
  readonly #bindings = new Map<string, MaterialBinding>();
  readonly #queues = new Map<string, Promise<void>>();

  constructor(input: CreateAgentEvaluationControlledWorkspaceRuntimeInput) {
    if (
      !exactCommit(input.repositoryCommit) ||
      input.configuration.loop.maximumTurnsPerAttempt !==
        frozenMaximumTurnsPerAttempt ||
      input.configuration.loop.maximumToolCallsPerAttempt !==
        frozenMaximumToolCallsPerAttempt ||
      input.configuration.loop.maximumRepairRoundsPerAttempt !==
        frozenMaximumRepairRoundsPerAttempt ||
      input.configuration.loop.maximumToolResultBytes !==
        frozenMaximumToolResultBytes ||
      input.configuration.loop.maximumAggregateToolResultBytes !==
        frozenMaximumAggregateToolResultBytes ||
      input.configuration.loop.maximumAggregateArtifactBytes !==
        maximumAggregateArtifactBytes
    ) {
      fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
    }
    this.#input = input;
  }

  async #serialized<T>(
    attemptId: string,
    action: () => Promise<T>
  ): Promise<T> {
    const previous = this.#queues.get(attemptId) ?? Promise.resolve();
    let release = (): void => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => barrier);
    this.#queues.set(attemptId, tail);
    await previous;
    try {
      return await action();
    } finally {
      release();
      if (this.#queues.get(attemptId) === tail) this.#queues.delete(attemptId);
    }
  }

  async #binding(
    identity: Readonly<{
      planDigest: CanonicalDigest;
      attemptId: string;
      descriptorDigest: CanonicalDigest;
      caseId: string;
      materialDigest: CanonicalDigest;
    }>
  ): Promise<MaterialBinding> {
    const existing = this.#bindings.get(identity.attemptId);
    if (existing) {
      const currentInstant = this.#input.now();
      if (
        existing.session.planDigest !== identity.planDigest ||
        existing.session.descriptorDigest !== identity.descriptorDigest ||
        existing.session.caseId !== identity.caseId ||
        existing.session.materialDigest !== identity.materialDigest ||
        !isAgentControlInstant(currentInstant) ||
        Date.parse(currentInstant) < Date.parse(existing.grant.issuedAt) ||
        Date.parse(currentInstant) >= Date.parse(existing.grant.expiresAt)
      ) {
        return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
      }
      return existing;
    }
    const binding = await this.#input.materialSource.use(
      identity,
      async (material) => {
        const validated = validateAgentEvaluationControlledWorkspaceMaterial(
          material,
          identity
        );
        const authorizationInput = Object.freeze({
          ...identity,
          access: material.access,
          fixture: validated.fixture,
          toolRegistryDigest: validated.toolRegistryDigest,
          actionRegistryDigest: validated.actionRegistryDigest,
          toolIds: Object.freeze(
            material.invocation.tools.map(({ toolId }) => toolId)
          ),
          actionIds: Object.freeze(
            validated.fixture.actionRegistry.map(({ actionId }) => actionId)
          ),
          targetRefs: validated.fixture.targetRefs,
        });
        const grant = validateGrant(
          await this.#input.authorizer.issue(authorizationInput),
          authorizationInput,
          this.#input.configuration,
          this.#input.now()
        );
        const attemptState = validateAttemptState(
          await this.#input.operations.loadAttemptState({
            attemptId: identity.attemptId,
            grantDigest: grant.grantDigest,
            generation: grant.generation,
          }),
          {
            attemptId: identity.attemptId,
            grantDigest: grant.grantDigest,
            generation: grant.generation,
          },
          this.#input.configuration
        );
        const session = validateAttachment(
          await this.#input.loader.loadOrReattach({
            material,
            fixture: validated.fixture,
            grant,
            isolationPolicyDigest:
              this.#input.configuration.isolationPolicyDigest,
          }),
          authorizationInput,
          grant,
          this.#input.configuration,
          attemptState
        );
        return {
          session,
          grant,
          fixtureDigest: validated.fixture.fixtureDigest,
          baseSnapshotDigest: validated.fixture.workspaceSnapshotDigest,
          toolRegistryDigest: validated.toolRegistryDigest,
          actionRegistryDigest: validated.actionRegistryDigest,
          loopPolicyDigest: this.#input.configuration.loop.loopPolicyDigest,
          currentCheckpoint: session.currentCheckpoint,
        } satisfies MaterialBinding;
      }
    );
    this.#bindings.set(identity.attemptId, binding);
    return binding;
  }

  async #restoreClaimCheckpoint(
    binding: MaterialBinding,
    claim: AgentEvaluationControlledWorkspaceOperationClaim
  ): Promise<void> {
    const checkpoint = claim.priorCheckpoint;
    if (!checkpoint) {
      if (
        binding.currentCheckpoint.checkpointDigest !==
        binding.session.initialCheckpoint.checkpointDigest
      ) {
        fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
      }
      return;
    }
    validateCheckpoint(checkpoint, {
      attemptId: binding.grant.attemptId,
      grantDigest: binding.grant.grantDigest,
      generation: binding.grant.generation,
    });
    if (
      binding.currentCheckpoint.checkpointDigest !== checkpoint.checkpointDigest
    ) {
      fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
    }
  }

  async #acceptSeal(
    input: AgentEvaluationControlledToolExecutionInput,
    intent: AgentEvaluationControlledWorkspaceOperationIntent,
    binding: MaterialBinding,
    sealValue: AgentEvaluationControlledWorkspaceOperationSeal,
    dispatch?: AgentEvaluationControlledWorkspaceDispatchReceipt
  ): Promise<AgentEvaluationControlledToolExecutionOutput> {
    const seal = validateSeal(sealValue, input, intent, dispatch);
    if (dispatch !== undefined) {
      if (
        binding.session.currentCheckpoint.checkpointDigest !==
        seal.checkpoint.checkpointDigest
      ) {
        fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
      }
      binding.currentCheckpoint = seal.checkpoint;
    } else if (
      seal.checkpoint.checkpointDigest !==
        binding.currentCheckpoint.checkpointDigest &&
      seal.toolExecution.receipt.status === 'rejected'
    ) {
      fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
    }
    return seal.toolExecution;
  }

  async #destroyBinding(
    attemptId: string,
    binding: MaterialBinding,
    reason: 'completed' | 'failed' | 'discarded'
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    const intent = createCleanupIntent(
      {
        planDigest: binding.session.planDigest,
        attemptId,
        descriptorDigest: binding.session.descriptorDigest,
        caseId: binding.session.caseId,
        materialDigest: binding.session.materialDigest,
        sessionId: binding.session.sessionId,
        grantDigest: binding.grant.grantDigest,
        generation: binding.grant.generation,
        checkpointDigest: binding.currentCheckpoint.checkpointDigest,
      },
      reason
    );
    try {
      const claimed = await this.#input.operations.claimCleanup(intent);
      if (claimed.status === 'sealed') {
        const seal = validateCleanupSeal(
          claimed.seal,
          intent,
          claimed.seal.dispatch
        );
        this.#bindings.delete(attemptId);
        return seal.cleanupReceipt;
      }
      const claim = validateCleanupClaim(claimed.claim, intent);
      const dispatch =
        claimed.status === 'dispatched'
          ? validateCleanupDispatch(claimed.dispatch, claim, intent)
          : validateCleanupDispatch(
              await this.#input.operations.markCleanupDispatched({
                intent,
                claim,
              }),
              claim,
              intent
            );
      let cleanup = binding.cleanupReceipt;
      if (!cleanup) {
        try {
          cleanup = validateCleanup(
            await binding.session.destroy({
              reason,
              cleanupIntentDigest: intent.intentDigest,
              cleanupDispatchReceiptDigest: dispatch.dispatchReceiptDigest,
              idempotencyKey: intent.idempotencyKey,
            }),
            {
              attemptId,
              grantDigest: binding.grant.grantDigest,
              generation: binding.grant.generation,
              sessionId: binding.session.sessionId,
              reason,
              cleanupIntentDigest: intent.intentDigest,
              cleanupDispatchReceiptDigest: dispatch.dispatchReceiptDigest,
            }
          );
          binding.cleanupReceipt = cleanup;
        } catch {
          const reconciled = await this.#input.operations.reconcileCleanup({
            intent,
            claim,
            dispatch,
            reason: 'destroy-failed',
          });
          const seal = validateCleanupSeal(reconciled.seal, intent, dispatch);
          this.#bindings.delete(attemptId);
          return seal.cleanupReceipt;
        }
      }
      let seal: AgentEvaluationControlledWorkspaceCleanupSeal;
      try {
        seal = validateCleanupSeal(
          await this.#input.operations.sealCleanup({
            intent,
            claim,
            dispatch,
            cleanupReceipt: cleanup,
          }),
          intent,
          dispatch
        );
      } catch {
        const reconciled = await this.#input.operations.reconcileCleanup({
          intent,
          claim,
          dispatch,
          reason: 'seal-ack-loss',
        });
        seal = validateCleanupSeal(reconciled.seal, intent, dispatch);
      }
      this.#bindings.delete(attemptId);
      return seal.cleanupReceipt;
    } catch {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.cleanupFailed);
    }
  }

  async #unknownOperation(
    attemptId: string,
    binding: MaterialBinding,
    reconciliation: Readonly<{
      reconciliationReceiptDigest: CanonicalDigest;
      cleanupReceiptDigest: CanonicalDigest;
    }>
  ): Promise<never> {
    if (
      !isAgentCanonicalDigest(reconciliation.reconciliationReceiptDigest) ||
      !isAgentCanonicalDigest(reconciliation.cleanupReceiptDigest)
    ) {
      fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
    }
    await this.#destroyBinding(attemptId, binding, 'failed');
    return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.operationUnknown);
  }

  async #sealStagedEffect(
    input: AgentEvaluationControlledToolExecutionInput,
    intent: AgentEvaluationControlledWorkspaceOperationIntent,
    binding: MaterialBinding,
    claim: AgentEvaluationControlledWorkspaceOperationClaim,
    dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt,
    preflight: AgentEvaluationControlledWorkspacePreflightReceipt,
    effect: AgentEvaluationControlledWorkspaceEffect
  ): Promise<AgentEvaluationControlledToolExecutionOutput> {
    const output = outputForEffect(input, intent, effect);
    const authorityReceiptDigests = canonicalDigests(
      [preflight.preflightReceiptDigest, ...effect.authorityReceiptDigests],
      false
    );
    const sealInput = Object.freeze({
      intent,
      claim,
      dispatch,
      output,
      effect,
      authorityReceiptDigests,
      checkpoint: effect.checkpoint,
    });
    try {
      const seal = await this.#input.operations.sealAtomic(sealInput);
      return this.#acceptSeal(input, intent, binding, seal, dispatch);
    } catch {
      const reconciled = await this.#input.operations.reconcileDispatched({
        intent,
        claim,
        dispatch,
        reason: 'seal-ack-loss',
      });
      if (reconciled.status === 'sealed') {
        return this.#acceptSeal(
          input,
          intent,
          binding,
          reconciled.seal,
          dispatch
        );
      }
      if (!isAgentCanonicalDigest(reconciled.reconciliationReceiptDigest)) {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid
        );
      }
      try {
        const seal = await this.#input.operations.sealAtomic(sealInput);
        return this.#acceptSeal(input, intent, binding, seal, dispatch);
      } catch {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid
        );
      }
    }
  }

  async #recoverStagedEffect(
    input: AgentEvaluationControlledToolExecutionInput,
    intent: AgentEvaluationControlledWorkspaceOperationIntent,
    binding: MaterialBinding,
    claim: AgentEvaluationControlledWorkspaceOperationClaim,
    dispatch: AgentEvaluationControlledWorkspaceDispatchReceipt,
    preflight: AgentEvaluationControlledWorkspacePreflightReceipt
  ): Promise<AgentEvaluationControlledToolExecutionOutput> {
    const recovered = await binding.session.reconcileDispatched({
      operationId: intent.operationId,
      intentDigest: intent.intentDigest,
      dispatchReceiptDigest: dispatch.dispatchReceiptDigest,
      grantDigest: intent.grantDigest,
      generation: intent.generation,
    });
    if (recovered.status === 'unknown') {
      if (
        recovered.intentDigest !== intent.intentDigest ||
        recovered.dispatchReceiptDigest !== dispatch.dispatchReceiptDigest ||
        recovered.grantDigest !== intent.grantDigest ||
        recovered.generation !== intent.generation
      ) {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid
        );
      }
      return this.#unknownOperation(input.attemptId, binding, recovered);
    }
    const effect = validateEffect(
      recovered.effect,
      preflight,
      intent,
      dispatch,
      this.#input.configuration,
      binding.currentCheckpoint.snapshotDigest,
      binding.currentCheckpoint.checkpointDigest
    );
    return this.#sealStagedEffect(
      input,
      intent,
      binding,
      claim,
      dispatch,
      preflight,
      effect
    );
  }

  async executeTool(
    input: AgentEvaluationControlledToolExecutionInput
  ): Promise<AgentEvaluationControlledToolExecutionOutput> {
    admitToolInput(input, this.#input.configuration);
    return this.#serialized(input.attemptId, async () => {
      const binding = await this.#binding(input);
      const preflight = validatePreflight(
        await binding.session.preflight({
          toolId: input.toolId,
          arguments: input.arguments,
          argumentsDigest: input.argumentsDigest,
          grantDigest: binding.grant.grantDigest,
          generation: binding.grant.generation,
        }),
        input,
        binding
      );
      const intent = operationIntent(input, binding, preflight);
      const claimResult = await this.#input.operations.claim(intent);
      if (claimResult.status === 'denied') {
        return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.authorityDenied);
      }
      if (claimResult.status === 'unknown') {
        return this.#unknownOperation(input.attemptId, binding, claimResult);
      }
      if (claimResult.status === 'sealed') {
        return this.#acceptSeal(input, intent, binding, claimResult.seal);
      }
      const claim = validateClaim(claimResult.claim, binding, intent);
      await this.#restoreClaimCheckpoint(binding, claim);
      if (claimResult.status === 'dispatched') {
        const dispatch = validateDispatch(
          claimResult.dispatch,
          claim,
          intent,
          binding.currentCheckpoint
        );
        return this.#recoverStagedEffect(
          input,
          intent,
          binding,
          claim,
          dispatch,
          preflight
        );
      }
      if (preflight.status === 'rejected') {
        const authorityReceiptDigests = canonicalDigests(
          [
            preflight.preflightReceiptDigest,
            digestAgentCanonicalValue({
              kind: 'controlled-workspace-preflight-rejection',
              code: preflight.code,
              intentDigest: intent.intentDigest,
              grantDigest: binding.grant.grantDigest,
              toolRegistryDigest: binding.toolRegistryDigest,
              toolDefinitionDigest: intent.toolDefinitionDigest,
              inputSchemaDigest: intent.inputSchemaDigest,
              generation: binding.grant.generation,
            }),
          ],
          false
        );
        const output = createRejectedOutput(input, intent, preflight.code!);
        const seal = await this.#input.operations.sealRejected({
          intent,
          claim,
          output,
          authorityReceiptDigests,
          checkpoint: binding.currentCheckpoint,
        });
        return this.#acceptSeal(input, intent, binding, seal);
      }
      const dispatch = validateDispatch(
        await this.#input.operations.markDispatched({ intent, claim }),
        claim,
        intent,
        binding.currentCheckpoint
      );
      let effect: AgentEvaluationControlledWorkspaceEffect;
      try {
        effect = validateEffect(
          await binding.session.execute({
            operationId: intent.operationId,
            intentDigest: intent.intentDigest,
            claimId: claim.claimId,
            dispatchReceiptDigest: dispatch.dispatchReceiptDigest,
            stagingRef: dispatch.stagingRef,
            generation: claim.generation,
            preflight,
            arguments: input.arguments,
            maximumResultBytes: input.maximumToolResultBytes,
            secretCanaries: Object.freeze([
              ...(this.#input.secretCanaries?.() ?? []),
            ]),
          }),
          preflight,
          intent,
          dispatch,
          this.#input.configuration,
          binding.currentCheckpoint.snapshotDigest,
          binding.currentCheckpoint.checkpointDigest
        );
      } catch {
        return this.#recoverStagedEffect(
          input,
          intent,
          binding,
          claim,
          dispatch,
          preflight
        );
      }
      return this.#sealStagedEffect(
        input,
        intent,
        binding,
        claim,
        dispatch,
        preflight,
        effect
      );
    });
  }

  async continue(
    input: AgentEvaluationControlledContinuationInput
  ): Promise<AgentEvaluationControlledContinuationOutput> {
    const continuation = admitContinuationInput(
      input,
      this.#input.configuration
    );
    return this.#serialized(input.attemptId, async () => {
      const binding = await this.#binding(input);
      for (const execution of input.executions) {
        const sealed = await this.#input.operations.loadSealedToolExecution({
          attemptId: input.attemptId,
          grantDigest: binding.grant.grantDigest,
          generation: binding.grant.generation,
          receiptDigest: execution.receipt.receiptDigest,
        });
        if (
          !sealed ||
          !sameCanonicalJson(
            validateStoredSeal(sealed, binding, execution).toolExecution,
            execution
          )
        ) {
          return fail(
            CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid
          );
        }
      }
      return continuation;
    });
  }

  async assessFinal(
    input: AgentEvaluationControlledRuntimeInput
  ): Promise<AgentEvaluationControlledRuntimeReceipt> {
    admitRuntimeInput(
      input,
      this.#input.repositoryCommit,
      this.#input.configuration
    );
    return this.#serialized(input.attemptId, async () => {
      const binding = await this.#binding(input);
      let assessment: ControlledWorkspaceAssessmentProjection | undefined;
      let finalAuthority:
        AgentEvaluationControlledWorkspaceFinalAuthority | undefined;
      let operationSealReceiptDigests: readonly CanonicalDigest[] =
        Object.freeze([]);
      let failure: unknown;
      let reason: 'completed' | 'failed' = 'failed';
      try {
        const sealedExecutions = (
          await this.#input.operations.listSealedToolExecutions({
            attemptId: input.attemptId,
            grantDigest: binding.grant.grantDigest,
            generation: binding.grant.generation,
          })
        ).map((seal) => validateStoredSeal(seal, binding));
        const durableReceipts = sealedExecutions
          .map(({ toolExecution }) => toolExecution.receipt)
          .sort((left, right) =>
            compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
          );
        const submittedReceipts = [...input.toolExecutionReceipts].sort(
          (left, right) =>
            compareUnicodeCodePoints(left.receiptDigest, right.receiptDigest)
        );
        if (!sameCanonicalJson(durableReceipts, submittedReceipts)) {
          fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
        }
        const persistedArtifacts = sealedExecutions
          .flatMap(({ toolExecution }) =>
            toolExecution.receipt.persistedArtifacts.map((artifact) => artifact)
          )
          .sort((left, right) =>
            compareUnicodeCodePoints(
              `${left.artifactKind}\u0000${left.artifactRef}`,
              `${right.artifactKind}\u0000${right.artifactRef}`
            )
          );
        const resolvedArtifacts: AgentEvaluationControlledPersistedArtifactRef[] =
          [];
        for (const artifact of input.submission.artifactRefs) {
          const resolved = await binding.session.resolveArtifact(artifact);
          if (
            resolved.artifactKind !== artifact.artifactKind ||
            resolved.artifactRef !== artifact.artifactRef ||
            resolved.artifactDigest !== artifact.artifactDigest ||
            resolved.byteLength !== artifact.byteLength ||
            !isAgentCanonicalDigest(resolved.persistenceReceiptDigest)
          ) {
            fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
          }
          resolvedArtifacts.push(resolved);
        }
        resolvedArtifacts.sort((left, right) =>
          compareUnicodeCodePoints(
            `${left.artifactKind}\u0000${left.artifactRef}`,
            `${right.artifactKind}\u0000${right.artifactRef}`
          )
        );
        if (!sameCanonicalJson(persistedArtifacts, resolvedArtifacts)) {
          fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
        }
        const finalAssessmentIntentDigest = digestAgentCanonicalValue({
          kind: 'controlled-workspace-final-assessment',
          planDigest: input.planDigest,
          attemptId: input.attemptId,
          descriptorDigest: input.descriptorDigest,
          caseId: input.caseId,
          materialDigest: input.materialDigest,
          submissionDigest: input.submission.submissionDigest,
          grantDigest: binding.grant.grantDigest,
          generation: binding.grant.generation,
          checkpointDigest: binding.currentCheckpoint.checkpointDigest,
        });
        const authority = verifyFinalAuthority(
          await binding.session.assessFinal({
            submission: input.submission,
            finalAssessmentIntentDigest,
            proposalValidationPolicyDigest:
              input.proposalValidationPolicyDigest,
            g3VerificationPolicyDigest: input.g3VerificationPolicyDigest,
            maximumRepairRounds: input.maximumRepairRoundsPerAttempt,
            secretCanaries: Object.freeze([
              ...(this.#input.secretCanaries?.() ?? []),
            ]),
          }),
          input,
          binding,
          resolvedArtifacts,
          sealedExecutions,
          finalAssessmentIntentDigest
        );
        finalAuthority = authority;
        operationSealReceiptDigests = canonicalDigests(
          sealedExecutions.map(({ sealReceiptDigest }) => sealReceiptDigest),
          false
        );
        const passed =
          authority.proposalValidation.verdict === 'passed' &&
          authority.g3Verification.verdict === 'passed';
        if (
          (!input.requiresControlledPreview &&
            authority.controlledPreview !== undefined) ||
          (passed &&
            input.requiresControlledPreview &&
            authority.controlledPreview === undefined)
        ) {
          fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
        }
        const toolReceiptDigests = input.toolExecutionReceipts
          .map(({ receiptDigest }) => receiptDigest)
          .sort(compareUnicodeCodePoints);
        const commandReceiptDigests = input.toolExecutionReceipts
          .flatMap(({ commandReceiptDigests }) => commandReceiptDigests)
          .sort(compareUnicodeCodePoints);
        const transactionReceiptDigests = input.toolExecutionReceipts
          .flatMap(({ transactionReceiptDigests }) => transactionReceiptDigests)
          .sort(compareUnicodeCodePoints);
        const persistenceReceiptDigests = resolvedArtifacts
          .map(({ persistenceReceiptDigest }) => persistenceReceiptDigest)
          .sort(compareUnicodeCodePoints);
        const resolvedArtifactBytes = resolvedArtifacts.reduce(
          (total, { byteLength }) => total + byteLength,
          0
        );
        if (
          !Number.isSafeInteger(resolvedArtifactBytes) ||
          resolvedArtifactBytes > maximumAggregateArtifactBytes
        ) {
          fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid);
        }
        assessment = Object.freeze({
          artifactResolution: Object.freeze({
            resolvedArtifactCount: resolvedArtifacts.length,
            resolvedArtifactBytes,
            artifactResolutionReceiptSetDigest: digestAgentCanonicalValue({
              artifactPersistenceReceiptDigests: persistenceReceiptDigests,
            }),
          }),
          proposalValidation: authority.proposalValidation,
          isolatedExecution: Object.freeze({
            isolationPolicyDigest: input.isolationPolicyDigest,
            toolCallCount: toolReceiptDigests.length,
            ...(toolReceiptDigests.length > 0
              ? {
                  toolReceiptSetDigest: digestAgentCanonicalValue({
                    toolReceiptDigests,
                  }),
                }
              : {}),
            repairRoundCount: authority.repairRoundCount,
            commandCount: commandReceiptDigests.length,
            commandReceiptSetDigest: digestAgentCanonicalValue({
              commandReceiptDigests,
            }),
            transactionCount: transactionReceiptDigests.length,
            ...(transactionReceiptDigests.length > 0
              ? {
                  transactionReceiptSetDigest: digestAgentCanonicalValue({
                    transactionReceiptDigests,
                  }),
                }
              : {}),
          }),
          g3Verification: Object.freeze({
            verificationPlanReceiptDigest:
              authority.g3Verification.verificationPlanReceiptDigest,
            verificationClosureDigest:
              authority.g3Verification.verificationClosureDigest,
            verdict: authority.g3Verification.verdict,
          }),
          ...(passed && authority.controlledPreview
            ? { controlledPreview: authority.controlledPreview }
            : {}),
        });
        reason = passed ? 'completed' : 'failed';
      } catch (caught) {
        failure = caught;
      }
      const cleanup = await this.#destroyBinding(
        input.attemptId,
        binding,
        reason
      );
      if (failure !== undefined) throw failure;
      if (!assessment || !finalAuthority) {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.ownerReceiptInvalid
        );
      }
      const runtimeResult: AgentEvaluationControlledRuntimeResult =
        Object.freeze({
          grantDigest: binding.grant.grantDigest,
          grantGeneration: binding.grant.generation,
          toolRegistryDigest: binding.toolRegistryDigest,
          actionRegistryDigest: binding.actionRegistryDigest,
          operationSealReceiptDigests,
          ownerAuthorityReceiptDigests: canonicalDigests(
            [
              ...finalAuthority.authorityReceiptDigests,
              finalAuthority.finalAuthorityReceiptDigest,
            ],
            false
          ),
          verificationAttemptGrantReceiptDigests:
            finalAuthority.g3Verification
              .verificationAttemptGrantReceiptDigests,
          baseSnapshotDigest: binding.baseSnapshotDigest,
          finalSnapshotDigest: finalAuthority.finalSnapshotDigest,
          cleanupReceiptDigest: cleanup.cleanupReceiptDigest,
          sourceReferencesRevoked: cleanup.sourceReferencesRevoked,
          sandboxDestroyed: cleanup.sandboxDestroyed,
          ...assessment,
        });
      return createAgentEvaluationControlledRuntimeReceipt(
        input,
        runtimeResult
      );
    });
  }

  async #destroyOrphan(
    orphanValue: AgentEvaluationControlledWorkspaceOrphanSession
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt> {
    const orphan = validateOrphan(orphanValue);
    const intent = createCleanupIntent(
      {
        planDigest: orphan.planDigest,
        attemptId: orphan.attemptId,
        descriptorDigest: orphan.modelDescriptorDigest,
        caseId: orphan.caseId,
        materialDigest: orphan.materialDigest,
        sessionId: orphan.sessionId,
        grantDigest: orphan.grantDigest,
        generation: orphan.generation,
        checkpointDigest: orphan.currentCheckpoint.checkpointDigest,
      },
      'orphaned'
    );
    const claimed = await this.#input.operations.claimCleanup(intent);
    if (claimed.status === 'sealed') {
      return validateCleanupSeal(claimed.seal, intent, claimed.seal.dispatch)
        .cleanupReceipt;
    }
    const claim = validateCleanupClaim(claimed.claim, intent);
    const dispatch =
      claimed.status === 'dispatched'
        ? validateCleanupDispatch(claimed.dispatch, claim, intent)
        : validateCleanupDispatch(
            await this.#input.operations.markCleanupDispatched({
              intent,
              claim,
            }),
            claim,
            intent
          );
    let cleanup: AgentEvaluationControlledWorkspaceCleanupReceipt;
    try {
      cleanup = validateCleanup(
        await this.#input.loader.destroyOrphanedSession({
          orphan,
          cleanupIntentDigest: intent.intentDigest,
          cleanupDispatchReceiptDigest: dispatch.dispatchReceiptDigest,
          idempotencyKey: intent.idempotencyKey,
        }),
        {
          attemptId: orphan.attemptId,
          grantDigest: orphan.grantDigest,
          generation: orphan.generation,
          sessionId: orphan.sessionId,
          reason: 'orphaned',
          cleanupIntentDigest: intent.intentDigest,
          cleanupDispatchReceiptDigest: dispatch.dispatchReceiptDigest,
        }
      );
    } catch {
      const reconciled = await this.#input.operations.reconcileCleanup({
        intent,
        claim,
        dispatch,
        reason: 'destroy-failed',
      });
      return validateCleanupSeal(reconciled.seal, intent, dispatch)
        .cleanupReceipt;
    }
    try {
      return validateCleanupSeal(
        await this.#input.operations.sealCleanup({
          intent,
          claim,
          dispatch,
          cleanupReceipt: cleanup,
        }),
        intent,
        dispatch
      ).cleanupReceipt;
    } catch {
      const reconciled = await this.#input.operations.reconcileCleanup({
        intent,
        claim,
        dispatch,
        reason: 'seal-ack-loss',
      });
      return validateCleanupSeal(reconciled.seal, intent, dispatch)
        .cleanupReceipt;
    }
  }

  /** Startup sweeper: every loader-reported orphan is destroyed and durably sealed. */
  async cleanupOrphanedSessions(): Promise<
    readonly AgentEvaluationControlledWorkspaceCleanupReceipt[]
  > {
    const orphans = await this.#input.loader.listOrphanedSessions();
    if (
      orphans.length > maximumReceiptCount ||
      new Set(orphans.map(({ sessionId }) => sessionId)).size !== orphans.length
    ) {
      return fail(CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid);
    }
    const receipts: AgentEvaluationControlledWorkspaceCleanupReceipt[] = [];
    for (const orphan of [...orphans].sort((left, right) =>
      compareUnicodeCodePoints(left.sessionId, right.sessionId)
    )) {
      if (this.#bindings.has(orphan.attemptId)) {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid
        );
      }
      receipts.push(await this.#destroyOrphan(orphan));
    }
    return Object.freeze(receipts);
  }

  /** Required on provider failure/cancel paths that never reach assessFinal. */
  async discardAttempt(
    attemptId: string
  ): Promise<AgentEvaluationControlledWorkspaceCleanupReceipt | undefined> {
    return this.#serialized(attemptId, async () => {
      const binding = this.#bindings.get(attemptId);
      if (binding) {
        return this.#destroyBinding(attemptId, binding, 'discarded');
      }
      const orphans = await this.#input.loader.listOrphanedSessions();
      const matching = orphans.filter(
        (orphan) => orphan.attemptId === attemptId
      );
      if (matching.length > 1) {
        return fail(
          CONTROLLED_WORKSPACE_RUNTIME_ERROR_CODES.persistenceInvalid
        );
      }
      return matching[0] ? this.#destroyOrphan(matching[0]) : undefined;
    });
  }
}

export const createAgentEvaluationControlledWorkspaceRuntime = (
  input: CreateAgentEvaluationControlledWorkspaceRuntimeInput
): AgentEvaluationControlledWorkspaceRuntime =>
  new AgentEvaluationControlledWorkspaceRuntime(input);
