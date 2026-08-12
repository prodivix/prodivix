import type {
  AgentProviderProtocolFamily,
  CanonicalDigest,
  Instant,
} from '../domain/agent.types';
import type {
  AgentCost,
  AgentModelInvocationReceipt,
  AgentUsageVector,
} from '../providers/agentProvider.types';
import type {
  AgentEvaluationAttemptStatus,
  AgentEvaluationReviewCandidateRef,
  AgentEvaluationReviewRasterScanReceipt,
  AgentEvaluationTransportRetryReceipt,
} from './agentEvaluation.types';
import type { AgentEvaluationCapabilityExecutionReceipt } from './agentEvaluationCapabilityExecution';
import type {
  AgentEvaluationCapabilityEffectBootstrapInvocationAuthority,
  AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority,
  AgentEvaluationCapabilityEffectInputBindingKind,
  AgentEvaluationCapabilityEffectRequestRefIssuanceDecision,
} from './agentEvaluationCapabilityEffectAuthority';
import type { AgentEvaluationCapabilitySpecificReceipt } from './agentEvaluationCapabilitySpecificReceipt';
import type { AgentEvaluationAttemptAuthorityOwnerReceipt } from './agentEvaluationAttemptAuthorityOwnerReceipt';
import type { AgentEvaluationProviderCapabilityObservationReceipt } from './agentEvaluationProviderCapabilityObservation';
import type { AgentEvaluationControlledRuntimeReceipt } from './agentEvaluationControlledRuntime';
import type { AgentEvaluationPreDispatchFailureReceipt } from './agentEvaluationPreDispatchFailure';
import type { AgentEvaluationResultSubmissionReceipt } from './agentEvaluationResultContract';
import type { AgentEvaluationVerificationAttemptGrantReceipt } from './agentEvaluationVerificationAttemptGrant';

export type AgentEvaluationTransportProviderIdentityKind =
  'interaction-id' | 'message-id' | 'response-id';

export type AgentEvaluationTransportEndpointClass =
  'first-party-hosted' | 'aggregator' | 'self-hosted' | 'local';

export type AgentEvaluationTransportErrorCategory =
  | 'G4_RUNNER_ABORTED'
  | 'G4_RUNNER_CAPTURE_FAILED'
  | 'G4_RUNNER_CONFIGURATION_INVALID'
  | 'G4_RUNNER_DISABLED'
  | 'G4_RUNNER_EGRESS_DENIED'
  | 'G4_RUNNER_PRODUCTION_COMPOSITION_UNAVAILABLE'
  | 'G4_RUNNER_PROVIDER_AUTH_REJECTED'
  | 'G4_RUNNER_PROVIDER_RATE_LIMITED'
  | 'G4_RUNNER_PROVIDER_REJECTED'
  | 'G4_RUNNER_RESPONSE_INVALID'
  | 'G4_RUNNER_RESPONSE_SECRET_LEAK'
  | 'G4_RUNNER_RESPONSE_TOO_LARGE'
  | 'G4_RUNNER_SECRET_UNAVAILABLE'
  | 'G4_RUNNER_SECRET_USE_DENIED'
  | 'G4_RUNNER_SERVER_ONLY'
  | 'G4_RUNNER_TRANSPORT_FAILED';

/** Durable fence written before any credential-bound network dispatch. */
export type AgentEvaluationTransportDispatchIntent = Readonly<{
  format: 'prodivix.agent-evaluation-transport-dispatch-intent';
  version: 1;
  intentId: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  modelLineageDigest: CanonicalDigest;
  inferenceConfigurationDigest: CanonicalDigest;
  invocationId: string;
  budgetReservationId: string;
  demandDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  endpointId: string;
  endpointClass: AgentEvaluationTransportEndpointClass;
  requestBodyDigest: CanonicalDigest;
  requestBytes: number;
  createdAt: Instant;
  intentDigest: CanonicalDigest;
}>;

/** Sanitized hosted/native/compatible/local-loopback transport fact; payloads stay outside evidence. */
export type AgentEvaluationTransportReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-transport-receipt';
  version: 1;
  receiptId: string;
  protocolFamily: AgentProviderProtocolFamily;
  providerConfigurationId: string;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  requestDigest: CanonicalDigest;
  endpointId: string;
  endpointClass: AgentEvaluationTransportEndpointClass;
  requestBodyDigest: CanonicalDigest;
  requestBytes: number;
  responseBytes: number;
  httpStatus?: number;
  responseHeaderDigest?: CanonicalDigest;
  responseBodyDigest?: CanonicalDigest;
  providerRequestId?: string;
  providerIdentityKind?: AgentEvaluationTransportProviderIdentityKind;
  providerResponseId?: string;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
  sseEventCount: number;
  dispatchState: 'dispatched' | 'not-dispatched';
  outcome: 'completed' | 'failed' | 'post-dispatch-unknown';
  errorCategory?: AgentEvaluationTransportErrorCategory;
  startedAt: Instant;
  completedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationProviderResultSpoolAad = Readonly<{
  format: 'prodivix.agent-evaluation-provider-result-spool-aad';
  version: 1;
  namespaceDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  responseBodyDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  opaqueContinuationDigest?: CanonicalDigest;
}>;

/** Server-only encrypted envelope; this shape never enters final EvidenceBundle. */
export type AgentEvaluationProviderResultSpoolEnvelope = Readonly<{
  format: 'prodivix.agent-evaluation-provider-result-spool-envelope';
  version: 1;
  spoolId: string;
  algorithm: 'aes-256-gcm';
  keyId: string;
  keyVersion: number;
  keyRefDigest: CanonicalDigest;
  encryptionProfileDigest: CanonicalDigest;
  nonceBase64Url: string;
  authenticationTagBase64Url: string;
  ciphertextBase64Url: string;
  ciphertextDigest: CanonicalDigest;
  ciphertextSizeBytes: number;
  aadDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
}>;

/** Encrypted server-only continuation/result spool metadata; ciphertext is held outside evidence. */
export type AgentEvaluationProviderResultSpoolReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-provider-result-spool-receipt';
  version: 1;
  spoolRef: string;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  algorithm: 'aes-256-gcm';
  encryptionProfileDigest: CanonicalDigest;
  keyRefDigest: CanonicalDigest;
  keyId: string;
  keyVersion: number;
  aadDigest: CanonicalDigest;
  envelopeDigest: CanonicalDigest;
  ciphertextDigest: CanonicalDigest;
  ciphertextSizeBytes: number;
  responseBodyDigest: CanonicalDigest;
  normalizedEventSetDigest: CanonicalDigest;
  responseDigest: CanonicalDigest;
  opaqueContinuationDigest?: CanonicalDigest;
  retentionClass: 'attempt-resume-only';
  retentionPolicyDigest: CanonicalDigest;
  createdAt: Instant;
  expiresAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationProviderResultSpoolDispositionReceipt = Readonly<{
  format: 'prodivix.agent-evaluation-provider-result-spool-disposition-receipt';
  version: 1;
  spoolRef: string;
  spoolReceiptDigest: CanonicalDigest;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  disposition: 'consumed-and-destroyed' | 'retained-encrypted';
  retentionPolicyDigest: CanonicalDigest;
  retainedUntil?: Instant;
  disposedAt: Instant;
  receiptDigest: CanonicalDigest;
}>;

type AgentEvaluationInvocationTurnReceiptCommon = Readonly<{
  format: 'prodivix.agent-evaluation-invocation-turn-receipt';
  version: 1;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnIndex: number;
  invocationId: string;
  status: AgentEvaluationAttemptStatus;
  dispatchState: 'not-created' | 'not-dispatched' | 'dispatched';
  terminal: boolean;
  caseDefinitionDigest: CanonicalDigest;
  contextPackDigest: CanonicalDigest;
  mediaRepresentationManifestDigest?: CanonicalDigest;
  zeroToolCallDisposition?:
    'grade-unavailable' | 'seal-observation-and-continue';
  capabilityEffectBindingKind?: Exclude<
    AgentEvaluationCapabilityEffectInputBindingKind,
    'hosted-retrieval-query'
  >;
  postObservationRequestRefIssuanceDecision?: AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
  providerCapabilityObservationReceiptDigest?: CanonicalDigest;
  bootstrapInvocationAuthority?: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  bootstrapProviderRequestAuthority?: AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority;
  evidenceDigest: CanonicalDigest;
}>;

type AgentEvaluationInvocationTurnNoDispatch = Readonly<{
  status: Exclude<AgentEvaluationAttemptStatus, 'completed'>;
  dispatchState: 'not-created';
  terminal: true;
  requestArtifactDigest?: CanonicalDigest;
  dispatchIntentDigest?: never;
  transportReceiptDigest?: never;
  transportRetryReceipt?: never;
  invocationReceipt?: never;
  providerRequestId?: never;
  resolvedModelId?: never;
  resolvedModelVersion?: never;
  resolvedModelIdentityDigest?: never;
  responseHeaderDigest?: never;
  responseArtifactDigest?: never;
  providerResultSpoolReceiptDigest?: never;
  usageSourceDigest?: never;
  costSourceDigest?: never;
  usageSourceReceiptDigest?: never;
  costSourceReceiptDigest?: never;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest: CanonicalDigest;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}>;

type AgentEvaluationInvocationTurnNotDispatched = Readonly<{
  status: Exclude<AgentEvaluationAttemptStatus, 'completed'>;
  dispatchState: 'not-dispatched';
  terminal: true;
  requestArtifactDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  transportRetryReceipt: AgentEvaluationTransportRetryReceipt;
  invocationReceipt?: never;
  providerRequestId?: never;
  resolvedModelId?: never;
  resolvedModelVersion?: never;
  resolvedModelIdentityDigest?: never;
  responseHeaderDigest?: never;
  responseArtifactDigest?: never;
  providerResultSpoolReceiptDigest?: never;
  usageSourceDigest?: never;
  costSourceDigest?: never;
  usageSourceReceiptDigest?: never;
  costSourceReceiptDigest?: never;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest: CanonicalDigest;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}>;

type AgentEvaluationInvocationTurnDispatchedBase = Readonly<{
  dispatchState: 'dispatched';
  requestArtifactDigest: CanonicalDigest;
  dispatchIntentDigest: CanonicalDigest;
  transportReceiptDigest: CanonicalDigest;
  transportRetryReceipt: AgentEvaluationTransportRetryReceipt;
  invocationReceipt: AgentModelInvocationReceipt;
  providerRequestId?: string;
  resolvedModelId?: string;
  resolvedModelVersion?: string;
  resolvedModelIdentityDigest: CanonicalDigest;
  responseHeaderDigest?: CanonicalDigest;
  responseArtifactDigest?: CanonicalDigest;
  providerResultSpoolReceiptDigest?: CanonicalDigest;
  usageSourceDigest: CanonicalDigest;
  costSourceDigest: CanonicalDigest;
  usageSourceReceiptDigest?: CanonicalDigest;
  costSourceReceiptDigest?: CanonicalDigest;
}>;

type AgentEvaluationInvocationTurnWithoutCapabilityBootstrap = Readonly<{
  zeroToolCallDisposition?: never;
  capabilityEffectBindingKind?: never;
  postObservationRequestRefIssuanceDecision?: never;
  providerCapabilityObservationReceiptDigest?: never;
  bootstrapInvocationAuthority?: never;
  bootstrapProviderRequestAuthority?: never;
}>;

type AgentEvaluationInvocationTurnCompletedContinuation = Readonly<{
  status: 'completed';
  terminal: false;
  providerRequestId: string;
  responseHeaderDigest: CanonicalDigest;
  responseArtifactDigest: CanonicalDigest;
  providerResultSpoolReceiptDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  continuationReceiptDigest: CanonicalDigest;
  executionFailureAuthorityReceiptDigest?: never;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}> &
  AgentEvaluationInvocationTurnWithoutCapabilityBootstrap;

type AgentEvaluationInvocationTurnCompletedBootstrap = Readonly<{
  status: 'completed';
  terminal: false;
  providerRequestId: string;
  responseHeaderDigest: CanonicalDigest;
  responseArtifactDigest: CanonicalDigest;
  providerResultSpoolReceiptDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  zeroToolCallDisposition: 'seal-observation-and-continue';
  capabilityEffectBindingKind: Exclude<
    AgentEvaluationCapabilityEffectInputBindingKind,
    'hosted-retrieval-query'
  >;
  postObservationRequestRefIssuanceDecision: AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
  providerCapabilityObservationReceiptDigest: CanonicalDigest;
  bootstrapInvocationAuthority: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  bootstrapProviderRequestAuthority: AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest?: never;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}>;

type AgentEvaluationInvocationTurnCompletedTerminal = Readonly<{
  status: 'completed';
  terminal: true;
  providerRequestId: string;
  responseHeaderDigest: CanonicalDigest;
  responseArtifactDigest: CanonicalDigest;
  providerResultSpoolReceiptDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest?: never;
  resultSubmissionReceiptDigest: CanonicalDigest;
  controlledRuntimeReceiptDigest: CanonicalDigest;
}> &
  AgentEvaluationInvocationTurnWithoutCapabilityBootstrap;

type AgentEvaluationInvocationTurnCompletedCapabilityUnavailable = Readonly<{
  status: 'completed';
  terminal: true;
  providerRequestId: string;
  responseHeaderDigest: CanonicalDigest;
  responseArtifactDigest: CanonicalDigest;
  providerResultSpoolReceiptDigest: CanonicalDigest;
  usageSourceReceiptDigest: CanonicalDigest;
  costSourceReceiptDigest: CanonicalDigest;
  zeroToolCallDisposition: 'grade-unavailable';
  capabilityEffectBindingKind: Exclude<
    AgentEvaluationCapabilityEffectInputBindingKind,
    'hosted-retrieval-query'
  >;
  postObservationRequestRefIssuanceDecision: AgentEvaluationCapabilityEffectRequestRefIssuanceDecision;
  providerCapabilityObservationReceiptDigest: CanonicalDigest;
  bootstrapInvocationAuthority: AgentEvaluationCapabilityEffectBootstrapInvocationAuthority;
  bootstrapProviderRequestAuthority: AgentEvaluationCapabilityEffectBootstrapProviderRequestAuthority;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest?: never;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}>;

type AgentEvaluationInvocationTurnDispatchedFailure = Readonly<{
  status: Exclude<AgentEvaluationAttemptStatus, 'completed'>;
  terminal: true;
  continuationReceiptDigest?: never;
  executionFailureAuthorityReceiptDigest: CanonicalDigest;
  resultSubmissionReceiptDigest?: never;
  controlledRuntimeReceiptDigest?: never;
}> &
  AgentEvaluationInvocationTurnWithoutCapabilityBootstrap;

/** One ordered provider turn, including durable pre-dispatch failure states. */
export type AgentEvaluationInvocationTurnReceipt = Readonly<
  AgentEvaluationInvocationTurnReceiptCommon &
    (
      | AgentEvaluationInvocationTurnNoDispatch
      | AgentEvaluationInvocationTurnNotDispatched
      | (AgentEvaluationInvocationTurnDispatchedBase &
          (
            | AgentEvaluationInvocationTurnCompletedContinuation
            | AgentEvaluationInvocationTurnCompletedBootstrap
            | AgentEvaluationInvocationTurnCompletedTerminal
            | AgentEvaluationInvocationTurnCompletedCapabilityUnavailable
            | AgentEvaluationInvocationTurnDispatchedFailure
          ))
    )
>;

/** Attempt-level ordered authority over every turn and aggregate accounting. */
type AgentEvaluationInvocationTurnSetReceiptBase = Readonly<{
  format: 'prodivix.agent-evaluation-invocation-turn-set-receipt';
  version: 1;
  planDigest: CanonicalDigest;
  repositoryCommit: string;
  attemptId: string;
  descriptorDigest: CanonicalDigest;
  turnReceiptDigests: readonly CanonicalDigest[];
  terminalTurnIndex: number;
  terminalStatus: AgentEvaluationAttemptStatus;
  dispatchedInvocationCount: number;
  aggregateUsage: AgentUsageVector;
  aggregateUsageDigest: CanonicalDigest;
  aggregateCost: readonly AgentCost[];
  aggregateCostDigest: CanonicalDigest;
  sourceReceiptSetDigest: CanonicalDigest;
  receiptDigest: CanonicalDigest;
}>;

export type AgentEvaluationInvocationTurnSetReceipt = Readonly<
  AgentEvaluationInvocationTurnSetReceiptBase &
    (
      | Readonly<{
          terminalStatus: 'completed';
          terminalResultSubmissionReceiptDigest: CanonicalDigest;
          terminalControlledRuntimeReceiptDigest: CanonicalDigest;
          terminalExecutionFailureAuthorityReceiptDigest?: never;
          terminalZeroToolCallDisposition?: never;
          terminalCapabilityEffectBindingKind?: never;
          terminalPostObservationRequestRefIssuanceDecisionDigest?: never;
          terminalProviderCapabilityObservationReceiptDigest?: never;
          terminalBootstrapInvocationAuthorityDigest?: never;
          terminalBootstrapProviderRequestDigest?: never;
        }>
      | Readonly<{
          terminalStatus: 'completed';
          terminalResultSubmissionReceiptDigest?: never;
          terminalControlledRuntimeReceiptDigest?: never;
          terminalExecutionFailureAuthorityReceiptDigest?: never;
          terminalZeroToolCallDisposition: 'grade-unavailable';
          terminalCapabilityEffectBindingKind: Exclude<
            AgentEvaluationCapabilityEffectInputBindingKind,
            'hosted-retrieval-query'
          >;
          terminalPostObservationRequestRefIssuanceDecisionDigest: CanonicalDigest;
          terminalProviderCapabilityObservationReceiptDigest: CanonicalDigest;
          terminalBootstrapInvocationAuthorityDigest: CanonicalDigest;
          terminalBootstrapProviderRequestDigest: CanonicalDigest;
        }>
      | Readonly<{
          terminalStatus: Exclude<AgentEvaluationAttemptStatus, 'completed'>;
          terminalResultSubmissionReceiptDigest?: never;
          terminalControlledRuntimeReceiptDigest?: never;
          terminalExecutionFailureAuthorityReceiptDigest: CanonicalDigest;
          terminalZeroToolCallDisposition?: never;
          terminalCapabilityEffectBindingKind?: never;
          terminalPostObservationRequestRefIssuanceDecisionDigest?: never;
          terminalProviderCapabilityObservationReceiptDigest?: never;
          terminalBootstrapInvocationAuthorityDigest?: never;
          terminalBootstrapProviderRequestDigest?: never;
        }>
    )
>;

/** Opaque final-evidence commitment to a server-only candidate/presentation mapping. */
export type AgentEvaluationBlindReviewMappingRef = Readonly<{
  mappingId: string;
  mappingDigest: CanonicalDigest;
}>;

export type AgentEvaluationEvidenceAuthenticityArrays = Readonly<{
  preDispatchFailureReceipts: readonly AgentEvaluationPreDispatchFailureReceipt[];
  transportDispatchIntents: readonly AgentEvaluationTransportDispatchIntent[];
  transportReceipts: readonly AgentEvaluationTransportReceipt[];
  providerResultSpoolReceipts: readonly AgentEvaluationProviderResultSpoolReceipt[];
  providerResultSpoolDispositionReceipts: readonly AgentEvaluationProviderResultSpoolDispositionReceipt[];
  invocationTurnReceipts: readonly AgentEvaluationInvocationTurnReceipt[];
  invocationTurnSetReceipts: readonly AgentEvaluationInvocationTurnSetReceipt[];
  resultSubmissionReceipts: readonly AgentEvaluationResultSubmissionReceipt[];
  attemptAuthorityOwnerReceipts: readonly AgentEvaluationAttemptAuthorityOwnerReceipt[];
  controlledRuntimeReceipts: readonly AgentEvaluationControlledRuntimeReceipt[];
  capabilityExecutionReceipts: readonly AgentEvaluationCapabilityExecutionReceipt[];
  capabilitySpecificReceipts: readonly AgentEvaluationCapabilitySpecificReceipt[];
  providerCapabilityObservationReceipts: readonly AgentEvaluationProviderCapabilityObservationReceipt[];
  verificationAttemptGrantReceipts: readonly AgentEvaluationVerificationAttemptGrantReceipt[];
  reviewRasterScanReceipts: readonly AgentEvaluationReviewRasterScanReceipt[];
  reviewCandidateRefs: readonly AgentEvaluationReviewCandidateRef[];
  blindReviewMappingRefs: readonly AgentEvaluationBlindReviewMappingRef[];
}>;
