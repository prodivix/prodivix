import type {
  AgentCapabilityProbeProgram,
  AgentCapabilityProbePublicResourceMaterial,
  AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
  AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt,
  AgentHostedRetrievalRuntimeResourceRegistrationRequest,
  CanonicalDigest,
  Instant,
} from '@prodivix/ai';

export type AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence =
  Readonly<{
    providerResourceId: string;
    auxiliaryResourceIds: readonly string[];
    resourceManifestDigest: CanonicalDigest;
    contentUploadReceiptDigest: CanonicalDigest;
    creationDispatchIntentSetDigest: CanonicalDigest;
    creationTransportReceiptSetDigest: CanonicalDigest;
    creationResultSpoolReceiptSetDigest: CanonicalDigest;
  }>;

export type AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence =
  Omit<
    AgentHostedRetrievalRuntimeResourceCleanupResourceResult,
    'format' | 'resultDigest' | 'version'
  >;

/**
 * Secret-bearing Provider I/O stays behind this callback-bound port. Returned
 * evidence contains bounded identifiers and digests only; credentials and raw
 * Provider payloads never enter the run-level lifecycle contract.
 */
export type AgentEvaluationHostedRetrievalRuntimeResourceProvider = Readonly<{
  createResource(
    input: Readonly<{
      request: AgentHostedRetrievalRuntimeResourceRegistrationRequest;
      program: AgentCapabilityProbeProgram;
      material: AgentCapabilityProbePublicResourceMaterial;
      signal: AbortSignal;
    }>
  ): Promise<AgentEvaluationHostedRetrievalRuntimeResourceCreationEvidence>;
  deleteResource(
    input: Readonly<{
      claimReceipt: AgentHostedRetrievalRuntimeResourceRecoveryClaimReceipt;
      resourceId: string;
      resourceRole: 'auxiliary' | 'primary';
      signal: AbortSignal;
    }>
  ): Promise<AgentEvaluationHostedRetrievalRuntimeResourceDeletionEvidence>;
  close(): Promise<
    Readonly<{
      status: 'clean';
      acceptedSessionCount: number;
      completedSessionCount: number;
      inFlightSessionCount: 0;
      closedAt: Instant;
      receiptDigest: CanonicalDigest;
    }>
  >;
}>;
