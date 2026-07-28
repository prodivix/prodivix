import type { VerificationEvidenceTrust } from './verification.types';
import {
  createVerificationAttestationClaimSet,
  createVerificationAttestationProofDigest,
  exactVerificationAttestationRecord,
  matchesVerificationAttestationExpectedClaims,
  normalizeVerificationAttestationExpectedClaims,
  projectVerificationVerifiedClaims,
  readVerificationAttestationVerifierClaims,
} from './verificationAttestationCodec';
import {
  VERIFICATION_ATTESTATION_ERROR_CODE,
  type VerificationAttestationExpectedClaims,
  type VerificationAttestationPresentationClaims,
  type VerificationEvidenceAttestationResult,
  type VerificationEvidenceAttestationVerifier,
  type VerificationEvidenceOrigin,
} from './verificationAttestation.types';

export {
  createVerificationArtifactSetDigest,
  createVerificationAttestationClaimsDigest,
  createVerificationAttestationClaimSet,
  createVerificationAttestationPresentationDigest,
  createVerificationAttestationProofDigest,
  createVerificationEvidenceStatementDigest,
  normalizeVerificationEvidenceStatement,
  serializeVerificationEvidenceStatement,
} from './verificationAttestationCodec';
export {
  VERIFICATION_ATTESTATION_CLAIMS_FORMAT,
  VERIFICATION_ATTESTATION_CLAIMS_VERSION,
  VERIFICATION_ATTESTATION_ERROR_CODE,
  VERIFICATION_ATTESTATION_PRESENTATION_FORMAT,
  VERIFICATION_ATTESTATION_PRESENTATION_VERSION,
  VERIFICATION_EVIDENCE_STATEMENT_FORMAT,
  VERIFICATION_EVIDENCE_STATEMENT_VERSION,
} from './verificationAttestation.types';
export { normalizeVerificationCiIdentity } from './verificationCiIdentity';
export type { VerificationCiIdentity } from './verificationCiIdentity';
export type {
  VerificationAttestationClaimSet,
  VerificationAttestationExpectedClaims,
  VerificationAttestationPresentationClaims,
  VerificationAttestationVerifierClaims,
  VerificationAttestedTrust,
  VerificationEvidenceArtifactStatement,
  VerificationEvidenceAttestationDecision,
  VerificationEvidenceAttestationResult,
  VerificationEvidenceAttestationVerifier,
  VerificationEvidenceExecutionStatement,
  VerificationEvidenceOrigin,
  VerificationEvidenceProducerStatement,
  VerificationEvidenceStatement,
  VerificationVerifiedClaims,
} from './verificationAttestation.types';

const maximumProofBytes = 64 * 1_024;

const invalidAttestation = (): VerificationEvidenceAttestationResult =>
  Object.freeze({
    status: 'invalid',
    reasonCode: VERIFICATION_ATTESTATION_ERROR_CODE,
    message: 'Evidence attestation is invalid.',
  });

export const verificationTrustForOrigin = (
  origin: VerificationEvidenceOrigin
): VerificationEvidenceTrust => {
  switch (origin) {
    case 'local':
      return 'local-unattested';
    case 'remote':
      return 'remote-attested';
    case 'ci':
      return 'ci-attested';
    case 'import':
      return 'imported-untrusted';
  }
};

/**
 * Runs a provider adapter and independently rechecks every canonical claim.
 * Raw proof bytes stay callback-bound and never enter the returned projection.
 */
export const verifyVerificationEvidenceAttestation = async (
  input: Readonly<{
    expected: VerificationAttestationExpectedClaims;
    proof: Uint8Array;
    verifier: VerificationEvidenceAttestationVerifier;
  }>
): Promise<VerificationEvidenceAttestationResult> => {
  const normalized = normalizeVerificationAttestationExpectedClaims(
    input.expected
  );
  if (
    !normalized ||
    !(input.proof instanceof Uint8Array) ||
    input.proof.byteLength < 1 ||
    input.proof.byteLength > maximumProofBytes
  )
    return invalidAttestation();
  const canonicalProof = Uint8Array.from(input.proof);
  const proofDigest = createVerificationAttestationProofDigest(canonicalProof);

  const expectedClaims = createVerificationAttestationClaimSet({
    expected: normalized.expected,
    issuedAt: normalized.expected.verificationInstant,
    notBefore: normalized.expected.verificationInstant,
    expiresAt: normalized.expected.verificationInstant,
  });
  const presentationCommon = {
    format: expectedClaims.format,
    version: expectedClaims.version,
    issuer: expectedClaims.issuer,
    audience: expectedClaims.audience,
    subject: expectedClaims.subject,
    nonce: expectedClaims.nonce,
    policyGeneration: expectedClaims.policyGeneration,
    statementDigest: expectedClaims.statementDigest,
    candidateDigest: expectedClaims.candidateDigest,
    evidenceCoreDigest: expectedClaims.evidenceCoreDigest,
    artifactSetDigest: expectedClaims.artifactSetDigest,
    projectId: expectedClaims.projectId,
    workspaceId: expectedClaims.workspaceId,
    workspaceRevision: expectedClaims.workspaceRevision,
    executableSnapshotDigest: expectedClaims.executableSnapshotDigest,
    planDigest: expectedClaims.planDigest,
    cellId: expectedClaims.cellId,
    checkId: expectedClaims.checkId,
    checkKind: expectedClaims.checkKind,
    targetId: expectedClaims.targetId,
    targetPolicyDigest: expectedClaims.targetPolicyDigest,
    attemptId: expectedClaims.attemptId,
    producerDigest: expectedClaims.producerDigest,
    executionDigest: expectedClaims.executionDigest,
    toolchainDigest: expectedClaims.toolchainDigest,
    normalizationDigest: expectedClaims.normalizationDigest,
  };
  const presentationClaims: VerificationAttestationPresentationClaims =
    expectedClaims.trust === 'ci-attested'
      ? Object.freeze({
          ...presentationCommon,
          trust: expectedClaims.trust,
          ci: expectedClaims.ci,
        })
      : Object.freeze({
          ...presentationCommon,
          trust: expectedClaims.trust,
        });
  const adapterExpectation = Object.freeze({
    claims: presentationClaims,
    verificationInstant: normalized.expected.verificationInstant,
    maximumLifetimeMs: normalized.expected.maximumLifetimeMs,
  });

  let decision: unknown;
  try {
    decision = await input.verifier.verify(
      adapterExpectation,
      Uint8Array.from(canonicalProof)
    );
  } catch {
    return invalidAttestation();
  }
  const decisionRecord = exactVerificationAttestationRecord(decision, [
    'kind',
    'claims',
  ]);
  if (!decisionRecord || decisionRecord.kind !== 'verified')
    return invalidAttestation();
  const claims = readVerificationAttestationVerifierClaims(
    decisionRecord.claims
  );
  if (
    !claims ||
    claims.proofDigest !== proofDigest ||
    !matchesVerificationAttestationExpectedClaims(claims, normalized)
  )
    return invalidAttestation();

  return Object.freeze({
    status: 'verified',
    claims: projectVerificationVerifiedClaims(claims),
  });
};
