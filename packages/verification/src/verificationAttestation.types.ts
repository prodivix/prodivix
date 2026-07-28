import type {
  VerificationBrowserEngine,
  VerificationCheckKind,
  VerificationColorScheme,
  VerificationEvidenceTrust,
  VerificationMotion,
  VerificationRetentionClass,
  VerificationSurface,
  VerificationViewportAxis,
} from './verification.types';
import type { VerificationCiIdentity } from './verificationCiIdentity';

export const VERIFICATION_EVIDENCE_STATEMENT_FORMAT =
  'prodivix.verification-evidence-statement' as const;
export const VERIFICATION_EVIDENCE_STATEMENT_VERSION = 1 as const;
export const VERIFICATION_ATTESTATION_CLAIMS_FORMAT =
  'prodivix.verification-attestation-claims' as const;
export const VERIFICATION_ATTESTATION_CLAIMS_VERSION = 1 as const;
export const VERIFICATION_ATTESTATION_PRESENTATION_FORMAT =
  'prodivix.verification-attestation-presentation' as const;
export const VERIFICATION_ATTESTATION_PRESENTATION_VERSION = 1 as const;
export const VERIFICATION_ATTESTATION_ERROR_CODE = 'VER-5003' as const;

export type VerificationAttestedTrust = Extract<
  VerificationEvidenceTrust,
  'remote-attested' | 'ci-attested'
>;

export type VerificationEvidenceOrigin = 'local' | 'remote' | 'ci' | 'import';

export type VerificationEvidenceArtifactStatement = Readonly<{
  id: string;
  path: string;
  kind: string;
  digest: string;
  sourceTraceDigest?: string;
  size: number;
  mediaType: string;
}>;

type VerificationEvidenceProducerStatementBase = Readonly<{
  producerId: string;
  providerId: string;
  runId: string;
  jobId?: string;
  sessionId?: string;
  workerId?: string;
  workerAttempt?: number;
  sandboxImageDigest?: string;
}>;

export type VerificationEvidenceProducerStatement =
  VerificationEvidenceProducerStatementBase &
    (
      | Readonly<{
          origin: 'ci';
          ci: VerificationCiIdentity;
        }>
      | Readonly<{
          origin: Exclude<VerificationEvidenceOrigin, 'ci'>;
          ci?: never;
        }>
    );

export type VerificationEvidenceExecutionStatement = Readonly<{
  surface: VerificationSurface;
  frameworkTarget: string;
  runtimeZone: string;
  browserEngine?: VerificationBrowserEngine;
  operatingSystemIdentity?: string;
  viewport: VerificationViewportAxis;
  devicePixelRatio: number;
  colorScheme: VerificationColorScheme;
  motion: VerificationMotion;
  locale: string;
  timezone: string;
  fontSetDigest: string;
  sandboxImageDigest?: string;
}>;

/**
 * Immutable facts signed before an attestation exists. Keeping this statement
 * detached prevents a digest cycle between manifestDigest and
 * provenance.attestationDigest.
 */
export type VerificationEvidenceStatement = Readonly<{
  evidenceId: string;
  candidateId: string;
  candidateDigest: string;
  evidenceCoreDigest: string;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  partitionRevisionsDigest: string;
  executableSnapshotDigest: string;
  policyDigest: string;
  planDigest: string;
  cellId: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  targetId: string;
  targetPolicyDigest: string;
  attemptId: string;
  producer: VerificationEvidenceProducerStatement;
  execution: VerificationEvidenceExecutionStatement;
  toolchainDigest: string;
  normalizationDigest: string;
  controlDigest: string;
  inputDigest: string;
  resultDigest: string;
  sourceTraceDigest: string;
  createdAt: string;
  retention: VerificationRetentionClass;
  artifacts: readonly VerificationEvidenceArtifactStatement[];
}>;

export type VerificationAttestationExpectedClaims = Readonly<{
  trust: VerificationAttestedTrust;
  issuer: string;
  audience: string;
  subject: string;
  nonce: string;
  policyGeneration: number;
  verificationInstant: string;
  maximumLifetimeMs: number;
  statement: VerificationEvidenceStatement;
}>;

type VerificationAttestationCommonClaims = Readonly<{
  format: typeof VERIFICATION_ATTESTATION_CLAIMS_FORMAT;
  version: typeof VERIFICATION_ATTESTATION_CLAIMS_VERSION;
  issuer: string;
  audience: string;
  subject: string;
  nonce: string;
  policyGeneration: number;
  statementDigest: string;
  candidateDigest: string;
  evidenceCoreDigest: string;
  artifactSetDigest: string;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  executableSnapshotDigest: string;
  planDigest: string;
  cellId: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  targetId: string;
  targetPolicyDigest: string;
  attemptId: string;
  producerDigest: string;
  executionDigest: string;
  toolchainDigest: string;
  normalizationDigest: string;
}>;

type VerificationAttestationTrustClaims =
  | Readonly<{
      trust: 'remote-attested';
      ci?: never;
    }>
  | Readonly<{
      trust: 'ci-attested';
      ci: VerificationCiIdentity;
    }>;

export type VerificationAttestationPresentationClaims =
  VerificationAttestationCommonClaims & VerificationAttestationTrustClaims;

export type VerificationAttestationClaimSet =
  VerificationAttestationPresentationClaims &
    Readonly<{
      issuedAt: string;
      notBefore: string;
      expiresAt: string;
    }>;

export type VerificationAttestationVerifierClaims =
  VerificationAttestationClaimSet &
    Readonly<{
      claimsDigest: string;
      proofDigest: string;
      algorithm: string;
      keyId: string;
      verifierId: string;
      verifierVersion: string;
      verifiedAt: string;
    }>;

/**
 * Secret-free persisted projection of a successfully verified attestation.
 * The presentation nonce is reduced to a digest and replay key; proof bytes,
 * signatures, OIDC assertions, and the nonce itself never leave the callback.
 */
type VerificationVerifiedClaimsBase = Readonly<{
  issuer: string;
  audience: string;
  subject: string;
  keyId: string;
  algorithm: string;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  nonceDigest: string;
  replayKey: string;
  claimsDigest: string;
  proofDigest: string;
  attestationDigest: string;
  verifierId: string;
  verifierVersion: string;
  verifiedAt: string;
  policyGeneration: number;
  statementDigest: string;
  candidateDigest: string;
  evidenceCoreDigest: string;
  artifactSetDigest: string;
  projectId: string;
  workspaceId: string;
  workspaceRevision: number;
  executableSnapshotDigest: string;
  planDigest: string;
  cellId: string;
  checkId: string;
  checkKind: VerificationCheckKind;
  targetId: string;
  targetPolicyDigest: string;
  attemptId: string;
  producerDigest: string;
  executionDigest: string;
  toolchainDigest: string;
  normalizationDigest: string;
}>;

export type VerificationVerifiedClaims = VerificationVerifiedClaimsBase &
  VerificationAttestationTrustClaims;

export type VerificationEvidenceAttestationDecision =
  | Readonly<{ kind: 'unverified' }>
  | Readonly<{
      kind: 'verified';
      claims: VerificationAttestationVerifierClaims;
    }>;

export type VerificationEvidenceAttestationVerifier = Readonly<{
  /**
   * `proof` is the provider-canonical cryptographic proof byte sequence, not a
   * transport encoding. Implementations must verify these exact bytes, return
   * their SHA-256 `proofDigest`, and never place the bytes in their decision,
   * logs, diagnostics, Evidence, or durable storage.
   */
  verify(
    expected: Readonly<{
      claims: VerificationAttestationPresentationClaims;
      verificationInstant: string;
      maximumLifetimeMs: number;
    }>,
    proof: Uint8Array
  ): Promise<VerificationEvidenceAttestationDecision>;
}>;

export type VerificationEvidenceAttestationResult =
  | Readonly<{ status: 'verified'; claims: VerificationVerifiedClaims }>
  | Readonly<{
      status: 'invalid';
      reasonCode: typeof VERIFICATION_ATTESTATION_ERROR_CODE;
      message: 'Evidence attestation is invalid.';
    }>;
