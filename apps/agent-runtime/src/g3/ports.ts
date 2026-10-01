import type {
  NormalizeVerificationCheckReportInput,
  VerificationEvidenceCandidate,
  VerificationPlan,
  VerificationRunSnapshot,
  VerificationRunEventInput,
  VerificationEvidenceStatement,
  VerificationBaselineEntry,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type {
  DriverCoordinates,
  DriverExecution,
  DriverCancellation,
} from '#src/g3/contract.js';

export type DriverCanonicalContext = Readonly<{
  started: true;
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan;
  run: VerificationRunSnapshot;
  projectId: string;
  requestDigest: string;
}>;
export type DriverCancellationContext = Readonly<{
  started: boolean;
  workspace: WorkspaceSnapshot;
  plan: VerificationPlan | null;
  run: VerificationRunSnapshot;
  projectId: string;
  requestDigest: string;
}>;
export type DriverPromotion = Readonly<{
  promotionId: string;
  evidenceId: string;
  state: string;
  uploadCapability?: string;
  attestationNonce?: string;
  attestationStatement?: VerificationEvidenceStatement;
  attestationStatementDigest?: string;
}>;
export type DriverAttestation = Readonly<Record<string, unknown>>;
export type DriverAttemptGrant = Readonly<{
  issuedAt: string;
  expiresAt: string;
}>;
export type DriverBackendPort = Readonly<{
  context(
    request: DriverExecution,
    signal: AbortSignal
  ): Promise<DriverCanonicalContext>;
  acquire(
    context: DriverCanonicalContext,
    coordinates: DriverCoordinates,
    cellId: string,
    attemptId: string,
    run: VerificationEvidenceCandidate['run'],
    signal: AbortSignal
  ): Promise<DriverAttemptGrant>;
  event(
    context: Pick<DriverCanonicalContext, 'workspace'>,
    coordinates: DriverCoordinates,
    event: VerificationRunEventInput,
    signal: AbortSignal
  ): Promise<VerificationRunSnapshot>;
  promote(
    context: DriverCanonicalContext,
    coordinates: DriverCoordinates,
    candidate: VerificationEvidenceCandidate,
    signal: AbortSignal
  ): Promise<DriverPromotion>;
  upload(
    context: DriverCanonicalContext,
    coordinates: DriverCoordinates,
    promotion: DriverPromotion,
    artifactId: string,
    mediaType: string,
    bytes: Uint8Array,
    signal: AbortSignal
  ): Promise<void>;
  finalize(
    context: DriverCanonicalContext,
    coordinates: DriverCoordinates,
    promotion: DriverPromotion,
    attestation: DriverAttestation | undefined,
    signal: AbortSignal
  ): Promise<Readonly<{ promotion?: DriverPromotion; evidenceId?: string }>>;
  cancel(
    request: DriverCancellation,
    signal: AbortSignal,
    executionRequestDigest?: string
  ): Promise<DriverCancellationContext>;
  cleanup(
    workspaceId: string,
    coordinates: DriverCoordinates,
    clean: boolean,
    signal: AbortSignal,
    completedAt: string
  ): Promise<void>;
  asset(
    context: DriverCanonicalContext,
    coordinates: DriverCoordinates,
    cellId: string,
    baseline: VerificationBaselineEntry,
    signal: AbortSignal
  ): Promise<Uint8Array>;
}>;
export type DriverAttemptResult = Readonly<{
  input: NormalizeVerificationCheckReportInput;
  artifacts: ReadonlyMap<string, Uint8Array>;
}>;
