import {
  canonicalJsonText,
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import {
  createVerificationArtifactSetDigest,
  createVerificationEvidenceStatementDigest,
  normalizeVerificationEvidenceStatement,
  verificationTrustForOrigin,
  type VerificationEvidenceStatement,
  type VerificationVerifiedClaims,
} from './verificationAttestation';
import {
  digestVerificationValue,
  parseVerificationInstant,
} from './verificationCanonical';
import { validateVerificationEvidenceCandidate } from './verificationEvidenceCandidateCodec';
import { decodeVerificationEvidenceSourceTraces } from './verificationEvidenceCandidateSourceTrace';
import type {
  VerificationArtifactManifest,
  VerificationEvidence,
  VerificationEvidenceCandidate,
  VerificationEvidenceTrust,
} from './verification.types';

export const VERIFICATION_EVIDENCE_MANIFEST_FORMAT =
  'prodivix.verification-evidence-manifest' as const;
export const VERIFICATION_EVIDENCE_CORE_FORMAT =
  'prodivix.verification-evidence-core' as const;
export const VERIFICATION_EVIDENCE_CORE_VERSION = 1 as const;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,511}$/u;

export type VerificationUnattestedProvenance = Readonly<{
  kind: 'unattested';
  trust: Extract<
    VerificationEvidenceTrust,
    'local-unattested' | 'imported-untrusted'
  >;
  producerId: string;
  issuedAt: string;
  expiresAt?: string;
}>;

export type VerificationPersistedProvenance =
  | VerificationUnattestedProvenance
  | Readonly<{
      kind: 'attested';
      claims: VerificationVerifiedClaims;
    }>;

export type VerificationEvidenceManifestBody = Readonly<{
  format: typeof VERIFICATION_EVIDENCE_MANIFEST_FORMAT;
  candidateDigest: string;
  statement: VerificationEvidenceStatement;
  statementDigest: string;
  verifiedProvenance: VerificationPersistedProvenance;
  evidence: Omit<VerificationEvidence, 'manifestDigest'>;
}>;

export type VerificationEvidenceManifest = VerificationEvidenceManifestBody &
  Readonly<{ manifestDigest: string }>;

export type VerificationEvidenceCore = Omit<
  VerificationEvidence,
  'manifestDigest' | 'provenance'
>;

export const createVerificationEvidenceCoreDigest = (
  candidateDigest: string,
  evidence: VerificationEvidenceCore
): string =>
  digestVerificationValue({
    format: VERIFICATION_EVIDENCE_CORE_FORMAT,
    version: VERIFICATION_EVIDENCE_CORE_VERSION,
    candidateDigest,
    evidence,
  });

export type CreateVerificationEvidenceManifestInput = Readonly<{
  candidate: VerificationEvidenceCandidate;
  /**
   * Allocated and frozen by the service when the promotion is acquired. It is
   * part of the signed statement; it is not derived from manifestDigest.
   */
  evidenceId: string;
  createdAt: string;
  artifacts: readonly VerificationArtifactManifest[];
  verifiedClaims?: VerificationVerifiedClaims;
  supersedes?: string;
}>;

export type VerificationEvidenceManifestResult =
  | Readonly<{
      status: 'ready';
      manifest: VerificationEvidenceManifest;
    }>
  | Readonly<{
      status: 'invalid';
      reasonCode: 'VER-5001' | 'VER-5003' | 'VER-5005';
      message: string;
    }>;

const invalid = (
  reasonCode: 'VER-5001' | 'VER-5003' | 'VER-5005',
  message: string
): VerificationEvidenceManifestResult =>
  Object.freeze({ status: 'invalid', reasonCode, message });

const candidateDigestIsValid = (
  candidate: VerificationEvidenceCandidate
): boolean =>
  DIGEST_PATTERN.test(candidate.candidateDigest) &&
  validateVerificationEvidenceCandidate(candidate).status === 'ready';

const canonicalArtifacts = (
  candidate: VerificationEvidenceCandidate,
  artifacts: readonly VerificationArtifactManifest[]
): readonly VerificationArtifactManifest[] =>
  Object.freeze(
    [...artifacts]
      .map((artifact) => {
        const expected = candidate.artifacts.find(
          ({ id }) => id === artifact.id
        );
        const sourceTraceDigest =
          artifact.sourceTraceDigest ?? expected?.sourceTraceDigest;
        return Object.freeze({
          id: artifact.id,
          path: artifact.path,
          kind: artifact.kind,
          digest: artifact.digest,
          ...(artifact.normalizedDigest
            ? { normalizedDigest: artifact.normalizedDigest }
            : {}),
          ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
          size: artifact.size,
          mediaType: artifact.mediaType,
        });
      })
      .sort(
        (left, right) =>
          compareUnicodeCodePoints(left.id, right.id) ||
          compareUnicodeCodePoints(left.kind, right.kind) ||
          compareUnicodeCodePoints(left.digest, right.digest)
      )
  );

const artifactsMatchCandidate = (
  candidate: VerificationEvidenceCandidate,
  artifacts: readonly VerificationArtifactManifest[]
): boolean => {
  if (
    artifacts.length !== candidate.artifacts.length ||
    new Set(artifacts.map(({ id }) => id)).size !== artifacts.length
  ) {
    return false;
  }
  const candidates = new Map(
    candidate.artifacts.map((artifact) => [artifact.id, artifact])
  );
  return artifacts.every((artifact) => {
    const expected = candidates.get(artifact.id);
    return (
      expected !== undefined &&
      artifact.path === expected.path &&
      artifact.kind === expected.kind &&
      artifact.digest === expected.expectedDigest &&
      artifact.size === expected.expectedSize &&
      artifact.mediaType === expected.expectedMediaType &&
      artifact.sourceTraceDigest === expected.sourceTraceDigest &&
      DIGEST_PATTERN.test(artifact.digest) &&
      (artifact.normalizedDigest === undefined ||
        DIGEST_PATTERN.test(artifact.normalizedDigest))
    );
  });
};

export const createVerificationEvidenceStatementForCandidate = (
  input: CreateVerificationEvidenceManifestInput,
  artifacts: readonly VerificationArtifactManifest[]
): VerificationEvidenceStatement => {
  const boundArtifacts = canonicalArtifacts(input.candidate, artifacts);
  const evidenceCore = buildEvidenceCore(input, boundArtifacts);
  const producerCommon = {
    producerId: input.candidate.provenance.producerId,
    providerId: input.candidate.provenance.providerId,
    runId: input.candidate.run.runId,
    ...(input.candidate.run.jobId ? { jobId: input.candidate.run.jobId } : {}),
    ...(input.candidate.run.sessionId
      ? { sessionId: input.candidate.run.sessionId }
      : {}),
    ...(input.candidate.run.sandboxImageDigest
      ? { sandboxImageDigest: input.candidate.run.sandboxImageDigest }
      : {}),
  };
  const producer =
    input.candidate.provenance.origin === 'ci'
      ? Object.freeze({
          ...producerCommon,
          origin: 'ci' as const,
          ci: Object.freeze({ ...input.candidate.provenance.ci! }),
        })
      : Object.freeze({
          ...producerCommon,
          origin: input.candidate.provenance.origin,
        });
  return normalizeVerificationEvidenceStatement({
    evidenceId: input.evidenceId,
    candidateId: input.candidate.candidateId,
    candidateDigest: input.candidate.candidateDigest,
    evidenceCoreDigest: createVerificationEvidenceCoreDigest(
      input.candidate.candidateDigest,
      evidenceCore
    ),
    projectId: input.candidate.projectId,
    workspaceId: input.candidate.workspaceId,
    workspaceRevision: input.candidate.workspaceRevision,
    partitionRevisionsDigest: digestVerificationValue(
      input.candidate.partitionRevisions
    ),
    executableSnapshotDigest: input.candidate.executableSnapshotDigest,
    policyDigest: input.candidate.policyDigest,
    planDigest: input.candidate.planDigest,
    cellId: input.candidate.cellId,
    checkId: input.candidate.checkId,
    checkKind: input.candidate.checkKind,
    targetId: input.candidate.targetId,
    attemptId: input.candidate.attemptId,
    producer,
    execution: {
      surface: input.candidate.run.surface,
      frameworkTarget: input.candidate.run.frameworkTarget,
      runtimeZone: input.candidate.run.runtimeZone,
      ...(input.candidate.run.browserEngine
        ? { browserEngine: input.candidate.run.browserEngine }
        : {}),
      ...(input.candidate.run.operatingSystemIdentity
        ? {
            operatingSystemIdentity:
              input.candidate.run.operatingSystemIdentity,
          }
        : {}),
      viewport: Object.freeze({ ...input.candidate.run.viewport }),
      devicePixelRatio: input.candidate.run.devicePixelRatio,
      colorScheme: input.candidate.run.colorScheme,
      motion: input.candidate.run.motion,
      locale: input.candidate.run.locale,
      timezone: input.candidate.run.timezone,
      fontSetDigest: input.candidate.run.fontSetDigest,
      ...(input.candidate.run.sandboxImageDigest
        ? { sandboxImageDigest: input.candidate.run.sandboxImageDigest }
        : {}),
    },
    toolchainDigest: input.candidate.toolchain.toolchainDigest,
    normalizationDigest: digestVerificationValue(input.candidate.normalization),
    targetPolicyDigest: digestVerificationValue(
      input.candidate.redaction.targetPolicy
    ),
    controlDigest: input.candidate.controls.appliedDigest,
    inputDigest: input.candidate.inputs.inputDigest,
    resultDigest: input.candidate.result.normalizedResultDigest,
    sourceTraceDigest: input.candidate.sourceTraceDigest,
    createdAt: input.createdAt,
    retention: input.candidate.requestedRetention,
    artifacts: boundArtifacts.map(
      ({ id, path, kind, digest, sourceTraceDigest, size, mediaType }) => ({
        id,
        path,
        kind,
        digest,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
        size,
        mediaType,
      })
    ),
  });
};

const claimsMatchStatement = (
  claims: VerificationVerifiedClaims,
  statement: VerificationEvidenceStatement,
  statementDigest: string
): boolean =>
  claims.statementDigest === statementDigest &&
  claims.candidateDigest === statement.candidateDigest &&
  claims.evidenceCoreDigest === statement.evidenceCoreDigest &&
  claims.artifactSetDigest ===
    createVerificationArtifactSetDigest(statement.artifacts) &&
  claims.projectId === statement.projectId &&
  claims.workspaceId === statement.workspaceId &&
  claims.workspaceRevision === statement.workspaceRevision &&
  claims.executableSnapshotDigest === statement.executableSnapshotDigest &&
  claims.planDigest === statement.planDigest &&
  claims.cellId === statement.cellId &&
  claims.checkId === statement.checkId &&
  claims.checkKind === statement.checkKind &&
  claims.targetId === statement.targetId &&
  claims.targetPolicyDigest === statement.targetPolicyDigest &&
  claims.attemptId === statement.attemptId &&
  claims.producerDigest === digestVerificationValue(statement.producer) &&
  claims.executionDigest === digestVerificationValue(statement.execution) &&
  claims.toolchainDigest === statement.toolchainDigest &&
  claims.normalizationDigest === statement.normalizationDigest &&
  (claims.trust === 'ci-attested'
    ? statement.producer.origin === 'ci' &&
      sameCanonicalJson(claims.ci, statement.producer.ci)
    : statement.producer.origin === 'remote');

const createPersistedProvenance = (
  candidate: VerificationEvidenceCandidate,
  statement: VerificationEvidenceStatement,
  statementDigest: string,
  claims: VerificationVerifiedClaims | undefined
): VerificationPersistedProvenance | undefined => {
  const expectedTrust = verificationTrustForOrigin(candidate.provenance.origin);
  if (
    candidate.provenance.origin === 'remote' ||
    candidate.provenance.origin === 'ci'
  ) {
    if (
      !claims ||
      claims.trust !== expectedTrust ||
      !claimsMatchStatement(claims, statement, statementDigest)
    ) {
      return undefined;
    }
    return Object.freeze({ kind: 'attested', claims });
  }
  if (claims) {
    return undefined;
  }
  return Object.freeze({
    kind: 'unattested',
    trust: expectedTrust as VerificationUnattestedProvenance['trust'],
    producerId: candidate.provenance.producerId,
    issuedAt: candidate.provenance.issuedAt,
    ...(candidate.provenance.expiresAt
      ? { expiresAt: candidate.provenance.expiresAt }
      : {}),
  });
};

const effectiveTrust = (
  provenance: VerificationPersistedProvenance
): VerificationEvidenceTrust =>
  provenance.kind === 'attested' ? provenance.claims.trust : provenance.trust;

const attestationDigest = (
  provenance: VerificationPersistedProvenance
): string | undefined =>
  provenance.kind === 'attested'
    ? provenance.claims.attestationDigest
    : undefined;

const issuedAt = (provenance: VerificationPersistedProvenance): string =>
  provenance.kind === 'attested'
    ? provenance.claims.issuedAt
    : provenance.issuedAt;

const expiresAt = (
  provenance: VerificationPersistedProvenance
): string | undefined =>
  provenance.kind === 'attested'
    ? provenance.claims.expiresAt
    : provenance.expiresAt;

const ciIdentity = (
  provenance: VerificationPersistedProvenance
):
  | Extract<
      VerificationVerifiedClaims,
      Readonly<{ trust: 'ci-attested' }>
    >['ci']
  | undefined =>
  provenance.kind === 'attested' && provenance.claims.trust === 'ci-attested'
    ? provenance.claims.ci
    : undefined;

const buildEvidenceProvenance = (
  candidate: VerificationEvidenceCandidate,
  provenance: VerificationPersistedProvenance
): VerificationEvidence['provenance'] => {
  const common = {
    producerId: candidate.provenance.producerId,
    ...(attestationDigest(provenance)
      ? { attestationDigest: attestationDigest(provenance)! }
      : {}),
    issuedAt: issuedAt(provenance),
    ...(expiresAt(provenance) ? { expiresAt: expiresAt(provenance)! } : {}),
  };
  const ci = ciIdentity(provenance);
  if (ci) {
    return Object.freeze({
      ...common,
      trust: 'ci-attested',
      ci: Object.freeze({ ...ci }),
    });
  }
  const trust = effectiveTrust(provenance);
  if (trust === 'ci-attested') {
    throw new TypeError(
      'CI Evidence provenance is missing its source identity.'
    );
  }
  return Object.freeze({ ...common, trust });
};

const buildEvidenceCore = (
  input: CreateVerificationEvidenceManifestInput,
  artifacts: readonly VerificationArtifactManifest[]
): VerificationEvidenceCore =>
  Object.freeze({
    id: input.evidenceId,
    projectId: input.candidate.projectId,
    workspaceId: input.candidate.workspaceId,
    workspaceRevision: input.candidate.workspaceRevision,
    partitionRevisions: input.candidate.partitionRevisions,
    executableSnapshotDigest: input.candidate.executableSnapshotDigest,
    ...(input.candidate.scenario
      ? { scenario: Object.freeze({ ...input.candidate.scenario }) }
      : {}),
    policyRevision: input.candidate.policyRevision,
    policyDigest: input.candidate.policyDigest,
    impactDigest: input.candidate.impactDigest,
    planDigest: input.candidate.planDigest,
    policyEvaluationInstant: input.candidate.policyEvaluationInstant,
    cellId: input.candidate.cellId,
    checkId: input.candidate.checkId,
    checkKind: input.candidate.checkKind,
    targetId: input.candidate.targetId,
    attemptId: input.candidate.attemptId,
    run: Object.freeze({
      runId: input.candidate.run.runId,
      providerId: input.candidate.run.providerId,
      ...(input.candidate.run.jobId
        ? { jobId: input.candidate.run.jobId }
        : {}),
      ...(input.candidate.run.sessionId
        ? { sessionId: input.candidate.run.sessionId }
        : {}),
      ...(input.candidate.run.parentAttemptId
        ? { parentAttemptId: input.candidate.run.parentAttemptId }
        : {}),
      surface: input.candidate.run.surface,
      frameworkTarget: input.candidate.run.frameworkTarget,
      runtimeZone: input.candidate.run.runtimeZone,
      ...(input.candidate.run.browserEngine
        ? { browserEngine: input.candidate.run.browserEngine }
        : {}),
      ...(input.candidate.run.operatingSystemIdentity
        ? {
            operatingSystemIdentity:
              input.candidate.run.operatingSystemIdentity,
          }
        : {}),
      viewport: Object.freeze({ ...input.candidate.run.viewport }),
      devicePixelRatio: input.candidate.run.devicePixelRatio,
      colorScheme: input.candidate.run.colorScheme,
      motion: input.candidate.run.motion,
      locale: input.candidate.run.locale,
      timezone: input.candidate.run.timezone,
      fontSetDigest: input.candidate.run.fontSetDigest,
      ...(input.candidate.run.sandboxImageDigest
        ? { sandboxImageDigest: input.candidate.run.sandboxImageDigest }
        : {}),
    }),
    timing: input.candidate.timing,
    result: input.candidate.result,
    toolchain: input.candidate.toolchain,
    normalization: input.candidate.normalization,
    controls: input.candidate.controls,
    inputs: input.candidate.inputs,
    artifacts,
    sourceTraces: Object.freeze(
      input.candidate.sourceTraces.map((trace) =>
        Object.freeze({
          sourceRef: Object.freeze({ ...trace.sourceRef }),
          ...(trace.sourceSpan
            ? { sourceSpan: Object.freeze({ ...trace.sourceSpan }) }
            : {}),
          ...(trace.label ? { label: trace.label } : {}),
        })
      )
    ),
    sourceTraceDigest: input.candidate.sourceTraceDigest,
    dependencyLockDigest: input.candidate.dependencyLockDigest,
    redactionPolicyId: input.candidate.redaction.policyId,
    targetPolicy: Object.freeze({ ...input.candidate.redaction.targetPolicy }),
    createdAt: input.createdAt,
    retention: input.candidate.requestedRetention,
    ...(input.supersedes ? { supersedes: input.supersedes } : {}),
  });

const buildEvidence = (
  input: CreateVerificationEvidenceManifestInput,
  artifacts: readonly VerificationArtifactManifest[],
  provenance: VerificationPersistedProvenance
): Omit<VerificationEvidence, 'manifestDigest'> =>
  Object.freeze({
    ...buildEvidenceCore(input, artifacts),
    provenance: buildEvidenceProvenance(input.candidate, provenance),
  });

const isImageArtifact = (
  artifact: Pick<VerificationArtifactManifest, 'kind'>
): boolean => artifact.kind === 'screenshot' || artifact.kind === 'visual-diff';

const executionForEvidence = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>
): VerificationEvidenceStatement['execution'] =>
  Object.freeze({
    surface: evidence.run.surface,
    frameworkTarget: evidence.run.frameworkTarget,
    runtimeZone: evidence.run.runtimeZone,
    ...(evidence.run.browserEngine
      ? { browserEngine: evidence.run.browserEngine }
      : {}),
    ...(evidence.run.operatingSystemIdentity
      ? { operatingSystemIdentity: evidence.run.operatingSystemIdentity }
      : {}),
    viewport: Object.freeze({ ...evidence.run.viewport }),
    devicePixelRatio: evidence.run.devicePixelRatio,
    colorScheme: evidence.run.colorScheme,
    motion: evidence.run.motion,
    locale: evidence.run.locale,
    timezone: evidence.run.timezone,
    fontSetDigest: evidence.run.fontSetDigest,
    ...(evidence.run.sandboxImageDigest
      ? { sandboxImageDigest: evidence.run.sandboxImageDigest }
      : {}),
  });

const evidenceCiMatchesStatement = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>,
  statement: VerificationEvidenceStatement
): boolean =>
  statement.producer.origin === 'ci'
    ? evidence.provenance.ci !== undefined &&
      sameCanonicalJson(evidence.provenance.ci, statement.producer.ci)
    : evidence.provenance.ci === undefined;

const evidenceCoreFor = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>
): VerificationEvidenceCore => {
  const { provenance: _provenance, ...core } = evidence;
  return core;
};

const evidenceResultDigestIsValid = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>
): boolean => {
  const { normalizedResultDigest, ...result } = evidence.result;
  return digestVerificationValue(result) === normalizedResultDigest;
};

const evidenceSourceTracesAreValid = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>
): boolean => {
  const decoded = decodeVerificationEvidenceSourceTraces(evidence.sourceTraces);
  return (
    decoded.ok &&
    sameCanonicalJson(decoded.value, evidence.sourceTraces) &&
    digestVerificationValue(decoded.value) === evidence.sourceTraceDigest
  );
};

const evidenceArtifactSourceTracesAreValid = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>
): boolean => {
  const sourceTraceDigests = new Set(
    evidence.sourceTraces.map((trace) => digestVerificationValue(trace))
  );
  return evidence.artifacts.every(
    ({ sourceTraceDigest }) =>
      sourceTraceDigest === undefined ||
      sourceTraceDigests.has(sourceTraceDigest)
  );
};

/**
 * Builds the immutable Evidence manifest after bytes and provenance have been
 * verified. statementDigest is signed first; manifestDigest then covers the
 * statement, safe persisted provenance, and complete Evidence projection.
 */
export const createVerificationEvidenceManifest = (
  input: CreateVerificationEvidenceManifestInput
): VerificationEvidenceManifestResult => {
  if (Object.hasOwn(input as object, 'retention')) {
    return invalid(
      'VER-5001',
      'Evidence retention must come from the normalized candidate.'
    );
  }
  if (
    !candidateDigestIsValid(input.candidate) ||
    !ID_PATTERN.test(input.evidenceId) ||
    parseVerificationInstant(input.createdAt) === undefined ||
    (input.supersedes !== undefined && !ID_PATTERN.test(input.supersedes))
  ) {
    return invalid(
      'VER-5001',
      'Evidence identity, candidate digest, or creation instant is invalid.'
    );
  }
  const completedAt = parseVerificationInstant(
    input.candidate.timing.completedAt
  )!;
  const createdAt = parseVerificationInstant(input.createdAt)!;
  const deadline = parseVerificationInstant(
    input.candidate.promotion.deadline
  )!;
  if (createdAt < completedAt || createdAt > deadline) {
    return invalid(
      'VER-5001',
      'Evidence creation is outside the candidate promotion interval.'
    );
  }
  const artifacts = canonicalArtifacts(input.candidate, input.artifacts);
  if (!artifactsMatchCandidate(input.candidate, artifacts)) {
    return invalid(
      'VER-5005',
      'Promoted artifacts do not match the candidate digest, size, media, or identity.'
    );
  }
  if (
    input.candidate.redaction.targetPolicy.capture === 'forbidden-sensitive' &&
    artifacts.some(isImageArtifact)
  ) {
    return invalid(
      'VER-5005',
      'Image artifacts are forbidden by the bound target policy.'
    );
  }
  let statement: VerificationEvidenceStatement;
  try {
    statement = createVerificationEvidenceStatementForCandidate(
      input,
      artifacts
    );
  } catch {
    return invalid('VER-5001', 'Evidence statement is invalid.');
  }
  const statementDigest = createVerificationEvidenceStatementDigest(statement);
  const provenance = createPersistedProvenance(
    input.candidate,
    statement,
    statementDigest,
    input.verifiedClaims
  );
  if (!provenance) {
    return invalid(
      'VER-5003',
      'Verified provenance does not match the Evidence statement.'
    );
  }
  const evidence = buildEvidence(input, artifacts, provenance);
  const manifestWithoutDigest: VerificationEvidenceManifestBody = Object.freeze(
    {
      format: VERIFICATION_EVIDENCE_MANIFEST_FORMAT,
      candidateDigest: input.candidate.candidateDigest,
      statement,
      statementDigest,
      verifiedProvenance: provenance,
      evidence,
    }
  );
  return Object.freeze({
    status: 'ready',
    manifest: Object.freeze({
      ...manifestWithoutDigest,
      manifestDigest: digestVerificationValue(manifestWithoutDigest),
    }),
  });
};

const evidenceMatchesStatement = (
  evidence: Omit<VerificationEvidence, 'manifestDigest'>,
  statement: VerificationEvidenceStatement,
  provenance: VerificationPersistedProvenance,
  candidateDigest: string
): boolean =>
  statement.candidateDigest === candidateDigest &&
  statement.evidenceCoreDigest ===
    createVerificationEvidenceCoreDigest(
      candidateDigest,
      evidenceCoreFor(evidence)
    ) &&
  evidence.id === statement.evidenceId &&
  evidence.projectId === statement.projectId &&
  evidence.workspaceId === statement.workspaceId &&
  evidence.workspaceRevision === statement.workspaceRevision &&
  digestVerificationValue(evidence.partitionRevisions) ===
    statement.partitionRevisionsDigest &&
  evidence.executableSnapshotDigest === statement.executableSnapshotDigest &&
  evidence.policyDigest === statement.policyDigest &&
  evidence.planDigest === statement.planDigest &&
  evidence.cellId === statement.cellId &&
  evidence.checkId === statement.checkId &&
  evidence.checkKind === statement.checkKind &&
  evidence.targetId === statement.targetId &&
  evidence.targetPolicy.policyDigest === evidence.policyDigest &&
  evidence.targetPolicy.semanticTargetId === evidence.targetId &&
  digestVerificationValue(evidence.targetPolicy) ===
    statement.targetPolicyDigest &&
  evidence.attemptId === statement.attemptId &&
  evidence.run.runId === statement.producer.runId &&
  evidence.run.providerId === statement.producer.providerId &&
  evidence.run.jobId === statement.producer.jobId &&
  evidence.run.sessionId === statement.producer.sessionId &&
  evidence.run.sandboxImageDigest === statement.producer.sandboxImageDigest &&
  evidence.provenance.producerId === statement.producer.producerId &&
  (provenance.kind === 'attested' ||
    provenance.producerId === statement.producer.producerId) &&
  verificationTrustForOrigin(statement.producer.origin) ===
    effectiveTrust(provenance) &&
  evidenceCiMatchesStatement(evidence, statement) &&
  sameCanonicalJson(executionForEvidence(evidence), statement.execution) &&
  evidence.toolchain.toolchainDigest === statement.toolchainDigest &&
  digestVerificationValue(evidence.normalization) ===
    statement.normalizationDigest &&
  evidence.controls.appliedDigest === statement.controlDigest &&
  evidence.inputs.inputDigest === statement.inputDigest &&
  evidenceResultDigestIsValid(evidence) &&
  evidence.result.normalizedResultDigest === statement.resultDigest &&
  evidenceSourceTracesAreValid(evidence) &&
  evidenceArtifactSourceTracesAreValid(evidence) &&
  evidence.sourceTraceDigest === statement.sourceTraceDigest &&
  evidence.createdAt === statement.createdAt &&
  evidence.retention === statement.retention &&
  evidence.provenance.trust === effectiveTrust(provenance) &&
  evidence.provenance.attestationDigest === attestationDigest(provenance) &&
  evidence.provenance.issuedAt === issuedAt(provenance) &&
  evidence.provenance.expiresAt === expiresAt(provenance) &&
  !(
    evidence.targetPolicy.capture === 'forbidden-sensitive' &&
    evidence.artifacts.some(isImageArtifact)
  ) &&
  sameCanonicalJson(
    evidence.artifacts.map(
      ({ id, path, kind, digest, sourceTraceDigest, size, mediaType }) => ({
        id,
        path,
        kind,
        digest,
        ...(sourceTraceDigest ? { sourceTraceDigest } : {}),
        size,
        mediaType,
      })
    ),
    statement.artifacts
  );

export const validateVerificationEvidenceManifest = (
  manifest: VerificationEvidenceManifest
): VerificationEvidenceManifestResult => {
  try {
    if (
      manifest.format !== VERIFICATION_EVIDENCE_MANIFEST_FORMAT ||
      !DIGEST_PATTERN.test(manifest.candidateDigest) ||
      !DIGEST_PATTERN.test(manifest.statementDigest) ||
      !DIGEST_PATTERN.test(manifest.manifestDigest)
    ) {
      return invalid('VER-5001', 'Evidence manifest identity is invalid.');
    }
    const statement = normalizeVerificationEvidenceStatement(
      manifest.statement
    );
    if (
      canonicalJsonText(statement) !== canonicalJsonText(manifest.statement) ||
      createVerificationEvidenceStatementDigest(statement) !==
        manifest.statementDigest
    ) {
      return invalid('VER-5001', 'Evidence statement digest mismatched.');
    }
    if (
      manifest.verifiedProvenance.kind === 'attested'
        ? !claimsMatchStatement(
            manifest.verifiedProvenance.claims,
            statement,
            manifest.statementDigest
          )
        : manifest.verifiedProvenance.trust !==
          manifest.evidence.provenance.trust
    ) {
      return invalid('VER-5003', 'Evidence provenance binding mismatched.');
    }
    if (
      !evidenceMatchesStatement(
        manifest.evidence,
        statement,
        manifest.verifiedProvenance,
        manifest.candidateDigest
      )
    ) {
      return invalid('VER-5001', 'Evidence manifest fields drifted.');
    }
    const { manifestDigest, ...body } = manifest;
    if (digestVerificationValue(body) !== manifestDigest) {
      return invalid('VER-5001', 'Evidence manifest digest mismatched.');
    }
    return Object.freeze({
      status: 'ready',
      manifest: Object.freeze(manifest),
    });
  } catch {
    return invalid('VER-5001', 'Evidence manifest is invalid.');
  }
};

export const projectVerificationEvidenceManifest = (
  manifest: VerificationEvidenceManifest
): VerificationEvidence => {
  const validation = validateVerificationEvidenceManifest(manifest);
  if (validation.status !== 'ready') {
    throw new TypeError(validation.message);
  }
  return Object.freeze({
    ...validation.manifest.evidence,
    manifestDigest: validation.manifest.manifestDigest,
  });
};
