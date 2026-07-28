import {
  generateKeyPairSync,
  sign as signAttestation,
  verify as verifyAttestation,
} from 'node:crypto';
import {
  createVerificationAttestationClaimSet,
  createVerificationAttestationClaimsDigest,
  createVerificationAttestationProofDigest,
  createInMemoryVerificationEvidenceRepository,
  createVerificationEvidenceStatementForCandidate,
  createVerificationEvidencePromotionCoordinator,
  createVerificationEvidenceVerifiedView,
  createVerificationPlan,
  digestVerificationValue,
  evaluateVerificationClosure,
  normalizeVerificationCheckReport,
  normalizeVerificationPolicy,
  projectVerificationEvidenceManifest,
  serializeVerificationValue,
  uniqueVerificationText,
  validateVerificationEvidenceCandidate,
  type VerificationAttemptOutcome,
  type VerificationAttestationClaimSet,
  type VerificationEvidenceAttestationVerifier,
  type VerificationEvidence,
  type VerificationEvidenceCandidate,
  type VerificationEvidencePromotionAttestation,
  type VerificationEvidencePromotionCoordinator,
  type VerificationEvidenceRepository,
  type VerificationEvidenceVerifiedView,
  type VerificationPlan,
  type VerificationPlanCell,
  type VerificationPolicy,
} from '@prodivix/verification';
import {
  GOLDEN_G3_V4_ADAPTER,
  GOLDEN_G3_V4_IDS,
  GOLDEN_G3_V4_PLAN_INPUT,
  GOLDEN_G3_V4_POLICY,
  GOLDEN_G3_V4_SCENARIOS,
} from './goldenG3VerificationPlanFixture';

const digest = (value: string): string =>
  digestVerificationValue({ golden: 'g3-v5', value });

const policy: VerificationPolicy = Object.freeze({
  ...GOLDEN_G3_V4_POLICY,
  name: 'G3 V5 CI-attested Evidence Golden',
  rules: Object.freeze(
    GOLDEN_G3_V4_POLICY.rules.map((rule) =>
      Object.freeze({
        ...rule,
        evidenceTrust: 'ci-attested' as const,
      })
    )
  ),
  evidenceRequirements: Object.freeze({
    ...GOLDEN_G3_V4_POLICY.evidenceRequirements,
    acceptedTrust: Object.freeze(['ci-attested'] as const),
    requireAttestation: true,
  }),
});

const adapter = Object.freeze({
  ...GOLDEN_G3_V4_ADAPTER,
  identity: Object.freeze({
    ...GOLDEN_G3_V4_ADAPTER.identity,
    toolchainDigest: digest('adapter-toolchain'),
    capabilityDigest: digest('adapter-capabilities'),
  }),
  descriptor: Object.freeze({
    ...GOLDEN_G3_V4_ADAPTER.descriptor,
    implementation: Object.freeze({
      ...GOLDEN_G3_V4_ADAPTER.descriptor.implementation,
      buildDigest: digest('adapter-build'),
      toolchainDigest: digest('adapter-toolchain'),
      schemaDigest: digest('adapter-schema'),
    }),
    trustInputs: Object.freeze(['ci-attested']),
  }),
});

const planResult = createVerificationPlan({
  ...GOLDEN_G3_V4_PLAN_INPUT,
  policy,
  policyRevision: 2,
  policyDigest: digestVerificationValue(normalizeVerificationPolicy(policy)),
  adapters: [adapter],
  adapterRegistryDigest: digestVerificationValue([adapter]),
});
if (planResult.plan.status !== 'ready') {
  throw new Error(
    `Golden V5 VerificationPlan is blocked: ${JSON.stringify(
      planResult.plan.issues
    )}`
  );
}

export const GOLDEN_G3_V5_PLAN: VerificationPlan = planResult.plan;

const selectedCell = GOLDEN_G3_V5_PLAN.cells.find(
  (cell) =>
    cell.checkId === GOLDEN_G3_V4_IDS.catalogCheck &&
    cell.frameworkTarget === 'react-vite' &&
    cell.browserEngine === 'chromium' &&
    cell.motion === 'full'
);
if (!selectedCell) {
  throw new Error('Golden V5 catalog Evidence cell is missing.');
}
export const GOLDEN_G3_V5_CELL: VerificationPlanCell = selectedCell;

const selectedScenario = GOLDEN_G3_V4_SCENARIOS.find(
  ({ id }) => id === GOLDEN_G3_V5_CELL.scenarioId
);
if (!selectedScenario) {
  throw new Error('Golden V5 catalog Scenario is missing.');
}

const controlProfileDigest = GOLDEN_G3_V5_CELL.controlProfileRef.digest;
if (!controlProfileDigest) {
  throw new Error('Golden V5 cell requires an exact control profile digest.');
}

const attemptInstant = (attemptIndex: number, offsetSeconds: number): string =>
  new Date(
    Date.UTC(2026, 6, 28, 0, 0, attemptIndex * 3 + offsetSeconds)
  ).toISOString();

const GOLDEN_G3_V5_CI_IDENTITY = Object.freeze({
  repository: 'github:prodivix/prodivix',
  ref: 'refs/heads/main',
  commit: `sha1-${'a'.repeat(40)}`,
});

const GOLDEN_G3_V5_ATTESTATION = Object.freeze({
  issuer: 'https://token.actions.example.test',
  audience: 'prodivix-verification',
  subject: 'repo:prodivix/prodivix:ref:refs/heads/main',
  policyGeneration: 1,
  verificationInstant: '2026-07-28T00:00:20.000Z',
  maximumLifetimeMs: 60_000,
});

const GOLDEN_G3_V5_ATTESTATION_KEYS = generateKeyPairSync('ed25519');

const goldenG3V5ArtifactManifests = (
  candidate: VerificationEvidenceCandidate
) =>
  Object.freeze(
    candidate.artifacts.map((artifact) =>
      Object.freeze({
        id: artifact.id,
        path: artifact.path,
        kind: artifact.kind,
        digest: artifact.expectedDigest,
        size: artifact.expectedSize,
        mediaType: artifact.expectedMediaType,
      })
    )
  );

export const createGoldenG3V5Candidate = (
  outcome: VerificationAttemptOutcome,
  attemptIndex: number,
  parentAttemptId?: string
): VerificationEvidenceCandidate => {
  const attemptId = `attempt:g3-v5:${attemptIndex}`;
  const artifactDigest = digest(`artifact:${attemptId}`);
  const scenarioProgramDigest = digest('catalog-program');
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest: GOLDEN_G3_V5_PLAN.planDigest,
        cellId: GOLDEN_G3_V5_CELL.id,
      }),
      label: `Golden G3 V5 attempt ${attemptIndex}`,
    }),
  ]);
  const result = normalizeVerificationCheckReport({
    projectId: 'project:g3-v5',
    plan: GOLDEN_G3_V5_PLAN,
    cellId: GOLDEN_G3_V5_CELL.id,
    context: {
      cell: GOLDEN_G3_V5_CELL,
      attemptId,
      executableSnapshotDigest: digest('executable-snapshot'),
      scenarioProgramDigest,
      controlProfileDigest,
      fixtureSetDigests: [],
      ...(GOLDEN_G3_V5_CELL.baselineSetRef?.digest
        ? { baselineSetDigest: GOLDEN_G3_V5_CELL.baselineSetRef.digest }
        : {}),
    },
    report: {
      candidateId: `candidate:g3-v5:${attemptIndex}`,
      cellId: GOLDEN_G3_V5_CELL.id,
      attemptId,
      outcome,
      normalizedInputDigest: GOLDEN_G3_V5_CELL.inputDigest,
      report: {
        assertion: outcome === 'passed' ? 'catalog-visible' : 'catalog-missing',
        outcome,
      },
      artifacts: [
        {
          id: `artifact:g3-v5:${attemptIndex}`,
          kind: 'replay-record',
          digest: artifactDigest,
          size: 64,
          mediaType: 'application/json',
        },
      ],
      diagnosticCodes: outcome === 'failed' ? ['BHV-4001'] : [],
    },
    scenario: {
      id: selectedScenario.id,
      revision: 1,
      digest: digest('catalog-scenario'),
      programDigest: scenarioProgramDigest,
    },
    run: {
      runId: `run:g3-v5:${attemptIndex}`,
      providerId: 'golden-ci',
      ...(parentAttemptId ? { parentAttemptId } : {}),
      runtimeZone: 'browser',
      operatingSystemIdentity: 'golden-linux',
      devicePixelRatio: 1,
      timezone: 'UTC',
      fontSetDigest: digest('font-set'),
    },
    timing: {
      startedAt: attemptInstant(attemptIndex, 0),
      completedAt: attemptInstant(attemptIndex, 1),
      durationMs: 1_000,
    },
    toolchain: {
      packageName: '@prodivix/golden-conformance',
      packageVersion: '0.0.1',
      buildDigest: digest('golden-build'),
      toolchainDigest: GOLDEN_G3_V5_CELL.adapter.toolchainDigest,
      schemaDigest: digest('evidence-schema'),
    },
    normalization: {
      packageName: '@prodivix/verification',
      packageVersion: '0.0.1',
      buildDigest: digest('normalization-build'),
      toolchainDigest: digest('normalization-toolchain'),
      schemaDigest: digest('normalization-schema'),
    },
    appliedControlDigest: digest('applied-controls'),
    artifacts: [
      {
        id: `artifact:g3-v5:${attemptIndex}`,
        path: `replay/g3-v5-${attemptIndex}.json`,
        stagingArtifactId: `staging:g3-v5:${attemptIndex}`,
        kind: 'replay-record',
        expectedDigest: artifactDigest,
        expectedSize: 64,
        expectedMediaType: 'application/json',
        sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
      },
    ],
    sourceTraces,
    dependencyLockDigest: digest('dependency-lock'),
    provenance: {
      origin: 'ci',
      producerId: 'golden-v5-ci',
      providerId: 'golden-ci',
      issuedAt: attemptInstant(attemptIndex, 1),
      expiresAt: '2026-07-29T00:00:00.000Z',
      ci: GOLDEN_G3_V5_CI_IDENTITY,
    },
    redaction: {
      policyId: 'redaction:g3-v5',
      scannerSetDigest: digest('scanner-set'),
      droppedFieldCounts: {},
      safe: true,
    },
    promotion: {
      idempotencyKey: `promotion:g3-v5:${attemptIndex}`,
      deadline: '2026-07-28T00:01:00.000Z',
    },
  });
  if (result.status !== 'ready') {
    throw new Error(
      `Golden V5 EvidenceCandidate is invalid: ${JSON.stringify(result.issues)}`
    );
  }
  return result.candidate;
};

const artifactPromotion = Object.freeze({
  async promoteCandidateArtifacts(candidate: VerificationEvidenceCandidate) {
    return Object.freeze({
      status: 'accepted' as const,
      artifacts: goldenG3V5ArtifactManifests(candidate),
    });
  },
});

export type GoldenG3V5AttestationClaimsMutation = (
  claims: VerificationAttestationClaimSet
) => VerificationAttestationClaimSet;

const createGoldenG3V5AttestationVerifier = (
  mutateClaims?: GoldenG3V5AttestationClaimsMutation
): VerificationEvidenceAttestationVerifier =>
  Object.freeze({
    async verify(expected, proof) {
      if (
        !verifyAttestation(
          null,
          new TextEncoder().encode(serializeVerificationValue(expected.claims)),
          GOLDEN_G3_V5_ATTESTATION_KEYS.publicKey,
          proof
        )
      ) {
        return Object.freeze({ kind: 'unverified' as const });
      }
      const issuedAt = expected.verificationInstant;
      const expiresAt = new Date(
        Date.parse(expected.verificationInstant) + 30_000
      ).toISOString();
      const claimSet = Object.freeze({
        ...expected.claims,
        issuedAt,
        notBefore: issuedAt,
        expiresAt,
      }) satisfies VerificationAttestationClaimSet;
      const returnedClaims = mutateClaims?.(claimSet) ?? claimSet;
      return Object.freeze({
        kind: 'verified' as const,
        claims: Object.freeze({
          ...returnedClaims,
          claimsDigest:
            createVerificationAttestationClaimsDigest(returnedClaims),
          proofDigest: createVerificationAttestationProofDigest(proof),
          algorithm: 'Ed25519',
          keyId: 'golden-ci-key-1',
          verifierId: 'golden-ci-verifier',
          verifierVersion: '1.0.0',
          verifiedAt: expected.verificationInstant,
        }),
      });
    },
  });

export const createGoldenG3V5PromotionAttestation = (
  candidate: VerificationEvidenceCandidate
): VerificationEvidencePromotionAttestation => {
  if (candidate.provenance.origin !== 'ci') {
    throw new TypeError('Golden V5 attestation requires CI provenance.');
  }
  const artifacts = goldenG3V5ArtifactManifests(candidate);
  const statement = createVerificationEvidenceStatementForCandidate(
    {
      candidate,
      evidenceId: `evidence:${candidate.attemptId}`,
      createdAt: GOLDEN_G3_V5_ATTESTATION.verificationInstant,
      artifacts,
    },
    artifacts
  );
  const nonce = `golden-ci-nonce:${candidate.attemptId}`;
  const claimSet = createVerificationAttestationClaimSet({
    expected: {
      trust: 'ci-attested',
      issuer: GOLDEN_G3_V5_ATTESTATION.issuer,
      audience: GOLDEN_G3_V5_ATTESTATION.audience,
      subject: GOLDEN_G3_V5_ATTESTATION.subject,
      nonce,
      policyGeneration: GOLDEN_G3_V5_ATTESTATION.policyGeneration,
      verificationInstant: GOLDEN_G3_V5_ATTESTATION.verificationInstant,
      maximumLifetimeMs: GOLDEN_G3_V5_ATTESTATION.maximumLifetimeMs,
      statement,
    },
    issuedAt: GOLDEN_G3_V5_ATTESTATION.verificationInstant,
    notBefore: GOLDEN_G3_V5_ATTESTATION.verificationInstant,
    expiresAt: new Date(
      Date.parse(GOLDEN_G3_V5_ATTESTATION.verificationInstant) + 30_000
    ).toISOString(),
  });
  const {
    issuedAt: _issuedAt,
    notBefore: _notBefore,
    expiresAt: _expiresAt,
    ...presentation
  } = claimSet;
  return Object.freeze({
    ...GOLDEN_G3_V5_ATTESTATION,
    nonce,
    proof: Uint8Array.from(
      signAttestation(
        null,
        new TextEncoder().encode(serializeVerificationValue(presentation)),
        GOLDEN_G3_V5_ATTESTATION_KEYS.privateKey
      )
    ),
  });
};

export type GoldenG3V5EvidenceHarness = Readonly<{
  repository: VerificationEvidenceRepository;
  coordinator: VerificationEvidencePromotionCoordinator;
  restartedCoordinator: VerificationEvidencePromotionCoordinator;
}>;

export const createGoldenG3V5EvidenceHarness = (
  mutateAttestationClaims?: GoldenG3V5AttestationClaimsMutation
): GoldenG3V5EvidenceHarness => {
  const repository = createInMemoryVerificationEvidenceRepository({
    now: () => '2026-07-28T00:00:20.000Z',
    allocatePromotionId: ({ attemptId }) => `promotion:${attemptId}`,
    allocateEvidenceId: ({ attemptId }) => `evidence:${attemptId}`,
  });
  return Object.freeze({
    repository,
    coordinator: createVerificationEvidencePromotionCoordinator({
      repository,
      artifactPromotion,
      attestationVerifier: createGoldenG3V5AttestationVerifier(
        mutateAttestationClaims
      ),
    }),
    restartedCoordinator: createVerificationEvidencePromotionCoordinator({
      repository,
      artifactPromotion,
      attestationVerifier: createGoldenG3V5AttestationVerifier(
        mutateAttestationClaims
      ),
    }),
  });
};

export const promoteGoldenG3V5Candidate = async (
  coordinator: VerificationEvidencePromotionCoordinator,
  candidate: VerificationEvidenceCandidate
) => {
  const result = await coordinator.promote({
    candidate,
    attestation: createGoldenG3V5PromotionAttestation(candidate),
  });
  if (result.status !== 'completed') {
    const validation = validateVerificationEvidenceCandidate(candidate);
    throw new Error(
      `Golden V5 promotion failed: ${result.reasonCode} ${result.message}${
        validation.status === 'invalid'
          ? ` ${JSON.stringify(validation.issues)}`
          : ''
      }`
    );
  }
  return result;
};

export type GoldenG3V5EvidenceViewState = 'active' | 'expired' | 'revoked';

export const createGoldenG3V5VerifiedView = (
  evidence: readonly VerificationEvidence[],
  state: GoldenG3V5EvidenceViewState,
  closureEvaluationInstant = '2026-07-28T00:00:30.000Z'
): Readonly<{
  view: VerificationEvidenceVerifiedView;
  revokedEvidenceIds: readonly string[];
}> => {
  const revokedEvidenceIds =
    state === 'revoked' ? Object.freeze(evidence.map(({ id }) => id)) : [];
  const revocationRecordDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v5-revocation-view',
    closureEvaluationInstant,
    revokedEvidenceIds,
  });
  return Object.freeze({
    view: createVerificationEvidenceVerifiedView({
      closureEvaluationInstant,
      revocationRecordDigest,
      records: evidence.map((candidate) => ({
        evidenceId: candidate.id,
        manifestDigest: candidate.manifestDigest,
        materializedEvidenceDigest: digestVerificationValue(candidate),
        effectiveTrust: candidate.provenance.trust,
        trustStatus:
          state === 'active'
            ? ('verified' as const)
            : state === 'expired'
              ? ('expired' as const)
              : ('revoked' as const),
        ...(candidate.provenance.attestationDigest
          ? { attestationDigest: candidate.provenance.attestationDigest }
          : {}),
        retentionState: 'active' as const,
        revocationRecordDigests:
          state === 'revoked'
            ? [digestVerificationValue({ evidenceId: candidate.id, state })]
            : [],
        artifacts: candidate.artifacts.map((artifact) => ({
          artifactId: artifact.id,
          digest: artifact.digest,
          status: 'available' as const,
        })),
      })),
    }),
    revokedEvidenceIds,
  });
};

export const evaluateGoldenG3V5Closure = (
  evidence: readonly VerificationEvidence[],
  view: VerificationEvidenceVerifiedView,
  revokedEvidenceIds: readonly string[]
) =>
  evaluateVerificationClosure({
    plan: GOLDEN_G3_V5_PLAN,
    evidence,
    verifiedEvidenceView: view,
    closureEvaluationInstant: view.closureEvaluationInstant,
    targetRevision: GOLDEN_G3_V5_PLAN.targetRevision,
    targetPartitionRevisions: GOLDEN_G3_V5_PLAN.targetPartitionRevisions,
    scenarioRegistryDigest: GOLDEN_G3_V5_PLAN.scenarioRegistryDigest,
    semanticSchemaDigest: GOLDEN_G3_V5_PLAN.semanticSchemaDigest,
    providerSetDigest: GOLDEN_G3_V5_PLAN.providerSetDigest,
    adapterRegistryDigest: GOLDEN_G3_V5_PLAN.adapterRegistryDigest,
    impactDigest: GOLDEN_G3_V5_PLAN.impactDigest,
    policyRevision: GOLDEN_G3_V5_PLAN.policyRevision,
    policyDigest: GOLDEN_G3_V5_PLAN.policyDigest,
    compilerDigest: GOLDEN_G3_V5_PLAN.compilerDigest,
    plannerDigest: GOLDEN_G3_V5_PLAN.plannerDigest,
    baselineSetDigests: uniqueVerificationText(
      GOLDEN_G3_V5_PLAN.cells.flatMap((cell) =>
        cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        GOLDEN_G3_V5_PLAN.cells.map(
          ({ adapter: identity }) => identity.toolchainDigest
        )
      )
    ),
    revocationRecordDigest: view.revocationRecordDigest,
    revokedEvidenceIds,
  });

export const projectGoldenG3V5Evidence = (
  manifests: readonly Awaited<
    ReturnType<typeof promoteGoldenG3V5Candidate>
  >['evidence'][]
): readonly VerificationEvidence[] =>
  Object.freeze(manifests.map(projectVerificationEvidenceManifest));
