import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as signAttestation,
  verify as verifyAttestation,
} from 'node:crypto';
import {
  createInMemoryVerificationEvidenceRepository,
  createVerificationAttestationClaimSet,
  createVerificationAttestationClaimsDigest,
  createVerificationAttestationProofDigest,
  createVerificationAdapterRegistrySnapshot,
  createVerificationBehaviorAssertionReceipt,
  createVerificationEvidencePromotionCoordinator,
  createVerificationEvidenceStatementForCandidate,
  createVerificationEvidenceVerifiedView,
  digestVerificationValue,
  evaluateVerificationClosure,
  normalizeVerificationCheckReport,
  projectVerificationEvidenceManifest,
  serializeVerificationValue,
  uniqueVerificationText,
  type VerificationAdapterLifecycleResult,
  type VerificationAdapterInputRef,
  type VerificationAttestationClaimSet,
  type VerificationCheckReportCandidate,
  type VerificationClosure,
  type VerificationEvidence,
  type VerificationEvidenceAttestationVerifier,
  type VerificationEvidenceCandidate,
  type VerificationEvidencePromotionAttestation,
  type VerificationEvidencePromotionCoordinator,
  type VerificationEvidenceSourceTrace,
  type VerificationEvidenceVerifiedView,
  type EvaluateVerificationClosureInput,
  type VerificationPlan,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { GOLDEN_G3_V6_ADAPTERS } from './goldenG3V6AdapterRegistryFixture';
import type { GoldenG3V6BrowserAttempt } from './goldenG3V6BrowserAttemptExecution';
import {
  executeGoldenG3V6ControlledAdapterMatrix,
  type GoldenG3V6ControlledAdapterMatrixEvidence,
} from './goldenG3V6BrowserMatrixExecution';
import type { GoldenG3V6StaticAdapterAttempt } from './goldenG3V6StaticAdapterExecution';
import {
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
} from './goldenG3ScenarioFixture';
import {
  GOLDEN_G3_V8_LOCKED_PLAN_DIGEST,
  GOLDEN_G3_V8_PLAN,
} from './goldenG3V8PlanFixture';

const PROJECT_ID = 'project:g3-v8-authenticated-catalog';
export type GoldenG3V8ExecutionClock = Readonly<{
  attemptBase: string;
  promotionInstant: string;
  closureInstant: string;
  promotionDeadline: string;
  evidenceExpiry: string;
}>;

export const GOLDEN_G3_V8_DEFAULT_CLOCK: GoldenG3V8ExecutionClock =
  Object.freeze({
    attemptBase: '2026-07-28T00:01:00.000Z',
    promotionInstant: '2026-07-28T00:04:00.000Z',
    closureInstant: '2026-07-28T00:05:00.000Z',
    promotionDeadline: '2026-07-28T00:10:00.000Z',
    evidenceExpiry: '2026-07-29T00:00:00.000Z',
  });
const ATTESTATION_LIFETIME_MS = 5 * 60_000;

const CI_IDENTITY = Object.freeze({
  repository: 'github:prodivix/prodivix',
  ref: 'refs/heads/main',
  commit: `sha1-${'8'.repeat(40)}`,
});

const attestationIdentity = (clock: GoldenG3V8ExecutionClock) =>
  Object.freeze({
    issuer: 'https://attestation.prodivix.example.test',
    audience: 'prodivix-g3-v8-verification',
    policyGeneration: 1,
    verificationInstant: clock.promotionInstant,
    maximumLifetimeMs: ATTESTATION_LIFETIME_MS,
  });

const TEST_ATTESTATION_SEED = createHash('sha256')
  .update('prodivix-g3-v8-local-contract-attestor')
  .digest();
const TEST_ATTESTATION_PRIVATE_KEY = createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    TEST_ATTESTATION_SEED,
  ]),
  format: 'der',
  type: 'pkcs8',
});
const TEST_ATTESTATION_PUBLIC_KEY = createPublicKey(
  TEST_ATTESTATION_PRIVATE_KEY as unknown as Parameters<
    typeof createPublicKey
  >[0]
);

type ReportedLifecycleResult = Extract<
  VerificationAdapterLifecycleResult,
  Readonly<{ status: 'reported' }>
>;

type GoldenG3V8NormalizationMaterial = Readonly<{
  resolvedInputSetDigest: string;
  runtimeEnvironmentDigest: string;
  executableSnapshotDigest: string;
  scenarioProgramDigest?: string;
  controlProfileDigest: string;
  fixtureSetDigests: readonly string[];
  baselineSetDigest?: string;
  controlCapabilityIds: readonly string[];
  controlCapabilitySnapshotDigest: string;
  appliedControlDigest: string;
  inputRefs: readonly VerificationAdapterInputRef[];
}>;

type GoldenG3V8SelectedAttempt = Readonly<{
  cell: VerificationPlanCell;
  attemptId: string;
  providerId: string;
  runtimeZone: 'browser' | 'node';
  result: ReportedLifecycleResult;
  normalizationContext: GoldenG3V8NormalizationMaterial;
  sourceTraces: readonly VerificationEvidenceSourceTrace[];
}>;

export type GoldenG3V8ClosureExecutionIdentity = Readonly<{
  mode: 'local' | 'github-actions';
  repository: string | null;
  ref: string | null;
  commit: string | null;
  runId: string | null;
  runAttempt: number | null;
  jobId: string | null;
  workflowRef: string | null;
  runUrl: string | null;
  command: 'pnpm run verify:g3:golden';
  startedAt: string;
  completedAt: string;
  attestationAuthority: Readonly<{
    mode: 'deterministic-test-only';
    issuer: string;
    audience: string;
    keyId: 'golden-g3-v8-test-key';
    verifierId: 'golden-g3-v8-test-verifier';
    verifierVersion: '1.0.0';
  }>;
}>;

export type GoldenG3V8ClosureCellRecord = Readonly<{
  cell: Readonly<{
    id: string;
    checkId: string;
    checkKind: VerificationPlanCell['checkKind'];
    scenarioId: string | null;
    targetId: string;
    targetPolicy: VerificationPlanCell['targetPolicy'];
    frameworkTarget: string;
    surface: VerificationPlanCell['surface'];
    browserEngine: VerificationPlanCell['browserEngine'] | null;
    viewport: VerificationPlanCell['viewport'];
    colorScheme: VerificationPlanCell['colorScheme'];
    motion: VerificationPlanCell['motion'];
    locale: string;
    controlProfileRef: VerificationPlanCell['controlProfileRef'];
    fixtureSetRef: VerificationPlanCell['fixtureSetRef'] | null;
    baselineSetRef: VerificationPlanCell['baselineSetRef'] | null;
    adapter: VerificationPlanCell['adapter'];
    requirement: 'required';
    inputDigest: string;
  }>;
  attempt: Readonly<{
    id: string;
    providerId: string;
    runtimeZone: 'browser' | 'node';
  }>;
  acceptedEvidence: Readonly<{
    id: string;
    manifestDigest: string;
    materializedEvidenceDigest: string;
    verifiedViewRecordDigest: string;
    runId: string;
    trust: 'remote-attested' | 'ci-attested';
    trustStatus: 'verified';
    attestationDigest: string;
    ci: Readonly<{
      repository: string;
      ref: string;
      commit: string;
    }> | null;
    scenario: VerificationEvidence['scenario'] | null;
    timing: VerificationEvidence['timing'];
    outcome: 'passed';
    toolchain: VerificationEvidence['toolchain'];
    normalization: VerificationEvidence['normalization'];
    controls: VerificationEvidence['controls'];
    inputs: VerificationEvidence['inputs'];
    sourceTraceDigest: string;
    dependencyLockDigest: string;
    retentionClass: VerificationEvidence['retention'];
    retentionState: 'active';
    createdAt: string;
    artifacts: readonly Readonly<{
      id: string;
      kind: VerificationEvidence['artifacts'][number]['kind'];
      digest: string;
      normalizedDigest: string | null;
      sourceTraceDigest: string | null;
      size: number;
      mediaType: string;
      status: 'available';
    }>[];
  }>;
  compatibility: 'compatible';
  verdict: 'passed';
}>;

export type GoldenG3V8ClosureManifest = Readonly<{
  format: 'prodivix.golden-g3-v8-closure-manifest';
  version: 1;
  targetId: 'authenticated-catalog';
  execution: GoldenG3V8ClosureExecutionIdentity;
  planIdentity: Readonly<{
    workspaceId: string;
    targetRevision: number;
    targetPartitionRevisions: VerificationClosure['targetPartitionRevisions'];
    scenarioRegistryDigest: string;
    semanticSchemaDigest: string;
    providerSetDigest: string;
    adapterRegistryDigest: string;
    impactDigest: string;
    policyRevision: number;
    policyDigest: string;
    policyEvaluationInstant: string;
    compilerDigest: string;
    plannerDigest: string;
  }>;
  closureIdentity: Readonly<{
    workspaceId: string;
    targetRevision: number;
    targetPartitionRevisions: VerificationClosure['targetPartitionRevisions'];
    scenarioRegistryDigest: string;
    semanticSchemaDigest: string;
    providerSetDigest: string;
    adapterRegistryDigest: string;
    impactDigest: string;
    policyRevision: number;
    policyDigest: string;
    compilerDigest: string;
    plannerDigest: string;
    policyEvaluationInstant: string;
    closureEvaluationInstant: string;
    evidenceSetDigest: string;
    revocationRecordDigest: string;
    baselineSetDigests: readonly string[];
    toolchainSetDigest: string;
    evidenceDigests: readonly string[];
    appliedExemptionIds: readonly string[];
  }>;
  planDigest: string;
  lockedPlanDigest: string;
  policyDigest: string;
  matrixEvidenceDigest: string;
  canonicalAttemptManifestDigest: string;
  controlledDimensionManifestDigest: string;
  controlledDimensionEvidenceDigest: string;
  controlledEnvironmentEvidenceDigest: string;
  selectedAttemptSetDigest: string;
  evidenceSetDigest: string;
  verifiedViewDigest: string;
  revocationRecordDigest: string;
  closureDigest: string;
  closureVerdict: 'satisfied';
  requiredCellCount: 66;
  promotedEvidenceCount: 66;
  remoteAttestedEvidenceCount: 14;
  ciAttestedEvidenceCount: 52;
  frameworkTargets: readonly ['react-vite', 'vue-vite'];
  surfaces: readonly ['preview', 'export', 'ci'];
  browserEngines: readonly ['chromium', 'firefox', 'webkit'];
  checkKinds: readonly [
    'accessibility',
    'build',
    'diagnostics',
    'e2e',
    'integration',
    'performance',
    'security',
    'unit',
    'visual',
  ];
  cells: readonly GoldenG3V8ClosureCellRecord[];
  cellManifestDigest: string;
  manifestDigest: string;
}>;

export type GoldenG3V8ClosureHarness = Readonly<{
  matrix: GoldenG3V6ControlledAdapterMatrixEvidence;
  attempts: readonly GoldenG3V8SelectedAttempt[];
  candidates: readonly VerificationEvidenceCandidate[];
  evidence: readonly VerificationEvidence[];
  verifiedView: VerificationEvidenceVerifiedView;
  closure: VerificationClosure;
  manifest: GoldenG3V8ClosureManifest;
  negativeEvidence: Readonly<{
    cellId: string;
    failed: VerificationEvidence;
    blocked: VerificationEvidence;
  }>;
}>;

const adapterRegistry = createVerificationAdapterRegistrySnapshot(
  GOLDEN_G3_V6_ADAPTERS
);

const reported = (
  result: VerificationAdapterLifecycleResult,
  cellId: string
): ReportedLifecycleResult => {
  if (result.status !== 'reported') {
    throw new Error(`Golden G3 V8 cell "${cellId}" has no report.`);
  }
  return result;
};

const browserAttempt = (
  cell: VerificationPlanCell,
  attempt: GoldenG3V6BrowserAttempt
): GoldenG3V8SelectedAttempt =>
  Object.freeze({
    cell,
    attemptId: attempt.attemptId,
    providerId: attempt.providerId,
    runtimeZone: 'browser' as const,
    result: reported(attempt.result, cell.id),
    normalizationContext: attempt.normalizationContext,
    sourceTraces: attempt.sourceTraces,
  });

const staticAttempt = (
  cell: VerificationPlanCell,
  attempt: GoldenG3V6StaticAdapterAttempt
): GoldenG3V8SelectedAttempt =>
  Object.freeze({
    cell,
    attemptId: attempt.attemptId,
    providerId: `provider:g3-v8:${cell.surface}:${cell.frameworkTarget}`,
    runtimeZone: 'node' as const,
    result: reported(attempt.result, cell.id),
    normalizationContext: attempt.normalizationContext,
    sourceTraces: attempt.sourceTraces,
  });

const selectClosureAttempts = (
  matrix: GoldenG3V6ControlledAdapterMatrixEvidence,
  plan: VerificationPlan
): readonly GoldenG3V8SelectedAttempt[] => {
  const selected = plan.cells
    .filter(({ requirement }) => requirement === 'required')
    .map((cell) => {
      if (cell.browserEngine === undefined) {
        const matches = matrix.staticAttempts.filter(
          ({ cellId }) => cellId === cell.id
        );
        if (matches.length !== 1) {
          throw new Error(
            `Golden G3 V8 static cell "${cell.id}" has ${String(matches.length)} attempts.`
          );
        }
        return staticAttempt(cell, matches[0]!);
      }
      const providerMode =
        cell.surface === 'preview'
          ? 'remote'
          : cell.surface === 'export'
            ? 'standalone-export'
            : 'ci';
      const matches = matrix.attempts.filter(
        (attempt) =>
          attempt.cellId === cell.id && attempt.providerMode === providerMode
      );
      if (matches.length !== 1) {
        throw new Error(
          `Golden G3 V8 browser cell "${cell.id}" has ${String(matches.length)} trusted attempts.`
        );
      }
      return browserAttempt(cell, matches[0]!);
    });
  if (
    selected.length !== 66 ||
    new Set(selected.map(({ cell }) => cell.id)).size !== 66
  ) {
    throw new Error(
      'Golden G3 V8 did not select exactly one attempt per cell.'
    );
  }
  return Object.freeze(selected);
};

const instant = (
  clock: GoldenG3V8ExecutionClock,
  attemptIndex: number,
  offsetSeconds: number
): string =>
  new Date(
    Date.parse(clock.attemptBase) + (attemptIndex + offsetSeconds) * 1_000
  ).toISOString();

const scenarioForCell = (
  cell: VerificationPlanCell,
  scenarioProgramDigest: string | undefined
) => {
  if (!cell.scenarioId) return undefined;
  if (!scenarioProgramDigest) {
    throw new Error(
      `Golden G3 V8 Scenario cell "${cell.id}" has no Program digest.`
    );
  }
  const scenario =
    cell.scenarioId === GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.id
      ? GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO
      : GOLDEN_G3_CATALOG_SCENARIO;
  if (scenario.id !== cell.scenarioId) {
    throw new Error(`Golden G3 V8 Scenario identity for "${cell.id}" drifted.`);
  }
  return Object.freeze({
    id: scenario.id,
    revision: 1,
    digest: digestVerificationValue(scenario),
    programDigest: scenarioProgramDigest,
  });
};

const artifactPath = (
  attemptIndex: number,
  artifactIndex: number,
  kind: string
): string => `g3-v8/${attemptIndex}/${artifactIndex}-${kind}.bin`;

type GoldenG3V8ReportVariant = 'passed' | 'failed' | 'blocked';

const reportForVariant = (
  attempt: GoldenG3V8SelectedAttempt,
  variant: GoldenG3V8ReportVariant
): VerificationCheckReportCandidate => {
  const report = attempt.result.report;
  if (variant === 'passed') return report;
  if (report.payload.kind !== 'e2e') {
    throw new Error('Golden G3 V8 negative report requires an E2E cell.');
  }
  const attemptId = `${attempt.attemptId}:${variant}`;
  const steps =
    variant === 'failed'
      ? Object.freeze(
          report.payload.steps.map((step, index) =>
            index === 0
              ? Object.freeze({
                  ...step,
                  status: 'failed' as const,
                  diagnosticCodes: Object.freeze(['BHV-4001']),
                })
              : step
          )
        )
      : report.payload.steps;
  const {
    receiptDigest: _receiptDigest,
    attemptId: _receiptAttemptId,
    blackBoxAssertionSetDigest: _blackBoxAssertionSetDigest,
    ...receiptCoordinates
  } = report.payload.behaviorAssertionReceipt;
  const behaviorAssertionReceipt = createVerificationBehaviorAssertionReceipt({
    ...receiptCoordinates,
    attemptId,
    blackBoxAssertionSetDigest: digestVerificationValue({
      variant,
      steps,
    }),
  });
  if (variant === 'blocked') {
    return Object.freeze({
      ...report,
      attemptId,
      terminal: Object.freeze({
        status: 'failed' as const,
        complete: true,
        failureClass: 'fixture-control' as const,
        reasonCode: 'BHV-4001',
      }),
      payload: Object.freeze({
        ...report.payload,
        behaviorAssertionReceipt,
      }),
    });
  }
  return Object.freeze({
    ...report,
    attemptId,
    terminal: Object.freeze({
      status: 'completed' as const,
      complete: true,
      exitCode: 1,
    }),
    payload: Object.freeze({
      ...report.payload,
      steps,
      behaviorAssertionReceipt,
    }),
    diagnosticCodes: Object.freeze(['BHV-4001']),
  });
};

const dependencyLockDigest = (
  matrix: GoldenG3V6ControlledAdapterMatrixEvidence,
  frameworkTarget: string
): string => {
  const environment =
    matrix.controlledEnvironment.staticRuntimeEnvironments.find(
      (candidate) => candidate.frameworkTarget === frameworkTarget
    );
  if (!environment) {
    throw new Error(
      `Golden G3 V8 has no lock identity for "${frameworkTarget}".`
    );
  }
  return environment.lockDigest;
};

const normalizeAttempt = (
  matrix: GoldenG3V6ControlledAdapterMatrixEvidence,
  plan: VerificationPlan,
  clock: GoldenG3V8ExecutionClock,
  attempt: GoldenG3V8SelectedAttempt,
  attemptIndex: number,
  variant: GoldenG3V8ReportVariant = 'passed'
): VerificationEvidenceCandidate => {
  const report = reportForVariant(attempt, variant);
  const candidateAttemptId = report.attemptId;
  const ci = attempt.cell.surface !== 'preview';
  const normalized = normalizeVerificationCheckReport({
    projectId: PROJECT_ID,
    plan,
    adapterRegistry,
    cellId: attempt.cell.id,
    context: Object.freeze({
      cell: attempt.cell,
      ...attempt.normalizationContext,
      attemptId: candidateAttemptId,
    }),
    report,
    ...(attempt.cell.scenarioId
      ? {
          scenario: scenarioForCell(
            attempt.cell,
            attempt.normalizationContext.scenarioProgramDigest
          )!,
        }
      : {}),
    run: Object.freeze({
      runId: `run:g3-v8:${attemptIndex}:${variant}`,
      providerId: attempt.providerId,
      runtimeZone: attempt.runtimeZone,
      operatingSystemIdentity:
        matrix.controlledEnvironment.selectedPlatform.platform,
      devicePixelRatio: 1,
      timezone: 'UTC',
      fontSetDigest: digestVerificationValue({
        matrix: matrix.browserIdentityRegistryDigest,
        frameworkTarget: attempt.cell.frameworkTarget,
      }),
    }),
    timing: Object.freeze({
      startedAt: instant(clock, attemptIndex, 0),
      completedAt: instant(clock, attemptIndex, 1),
      durationMs: 1_000,
    }),
    artifacts: Object.freeze(
      report.artifacts.map((artifact, artifactIndex) =>
        Object.freeze({
          id: artifact.id,
          path: artifactPath(attemptIndex, artifactIndex, artifact.kind),
        })
      )
    ),
    stagedArtifacts: attempt.result.stagedArtifacts,
    sourceTraces: attempt.sourceTraces,
    dependencyLockDigest: dependencyLockDigest(
      matrix,
      attempt.cell.frameworkTarget
    ),
    provenance: ci
      ? Object.freeze({
          origin: 'ci' as const,
          producerId: 'producer:g3-v8-ci',
          providerId: attempt.providerId,
          issuedAt: instant(clock, attemptIndex, 2),
          expiresAt: clock.evidenceExpiry,
          ci: CI_IDENTITY,
        })
      : Object.freeze({
          origin: 'remote' as const,
          producerId: 'producer:g3-v8-remote-preview',
          providerId: attempt.providerId,
          issuedAt: instant(clock, attemptIndex, 2),
          expiresAt: clock.evidenceExpiry,
        }),
    redaction: Object.freeze({
      policyId: 'redaction:g3-v8',
      scannerSetDigest: digestVerificationValue({
        policy: 'g3-v8-secret-and-sensitive-artifact-scan',
        version: 1,
      }),
      droppedFieldCounts: Object.freeze({}),
    }),
    promotion: Object.freeze({
      idempotencyKey: `promotion:g3-v8:${candidateAttemptId}`,
      deadline: clock.promotionDeadline,
    }),
  });
  if (normalized.status !== 'ready') {
    throw new Error(
      `Golden G3 V8 EvidenceCandidate "${attempt.cell.id}" is invalid: ${JSON.stringify(normalized.issues)}`
    );
  }
  return normalized.candidate;
};

const promotedArtifacts = (candidate: VerificationEvidenceCandidate) =>
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

const attestationVerifier: VerificationEvidenceAttestationVerifier =
  Object.freeze({
    async verify(expected, proof) {
      if (
        !verifyAttestation(
          null,
          new TextEncoder().encode(serializeVerificationValue(expected.claims)),
          TEST_ATTESTATION_PUBLIC_KEY,
          proof
        )
      ) {
        return Object.freeze({ kind: 'unverified' as const });
      }
      const claims = Object.freeze({
        ...expected.claims,
        issuedAt: expected.verificationInstant,
        notBefore: expected.verificationInstant,
        expiresAt: new Date(
          Date.parse(expected.verificationInstant) + 4 * 60_000
        ).toISOString(),
      }) satisfies VerificationAttestationClaimSet;
      return Object.freeze({
        kind: 'verified' as const,
        claims: Object.freeze({
          ...claims,
          claimsDigest: createVerificationAttestationClaimsDigest(claims),
          proofDigest: createVerificationAttestationProofDigest(proof),
          algorithm: 'Ed25519',
          keyId: 'golden-g3-v8-test-key',
          verifierId: 'golden-g3-v8-test-verifier',
          verifierVersion: '1.0.0',
          verifiedAt: expected.verificationInstant,
        }),
      });
    },
  });

const createAttestation = (
  candidate: VerificationEvidenceCandidate,
  clock: GoldenG3V8ExecutionClock
): VerificationEvidencePromotionAttestation => {
  if (
    candidate.provenance.origin !== 'remote' &&
    candidate.provenance.origin !== 'ci'
  ) {
    throw new Error('Golden G3 V8 requires attested provenance.');
  }
  const artifacts = promotedArtifacts(candidate);
  const statement = createVerificationEvidenceStatementForCandidate(
    {
      candidate,
      evidenceId: `evidence:${candidate.attemptId}`,
      createdAt: clock.promotionInstant,
      artifacts,
    },
    artifacts
  );
  const nonce = `nonce:g3-v8:${candidate.attemptId}`;
  const subject =
    candidate.provenance.origin === 'ci'
      ? 'repo:prodivix/prodivix:ref:refs/heads/main'
      : 'remote:prodivix-controlled-preview';
  const claimSet = createVerificationAttestationClaimSet({
    expected: {
      trust:
        candidate.provenance.origin === 'ci'
          ? 'ci-attested'
          : 'remote-attested',
      ...attestationIdentity(clock),
      subject,
      nonce,
      statement,
    },
    issuedAt: clock.promotionInstant,
    notBefore: clock.promotionInstant,
    expiresAt: new Date(
      Date.parse(clock.promotionInstant) + 4 * 60_000
    ).toISOString(),
  });
  const {
    issuedAt: _issuedAt,
    notBefore: _notBefore,
    expiresAt: _expiresAt,
    ...presentation
  } = claimSet;
  return Object.freeze({
    ...attestationIdentity(clock),
    subject,
    nonce,
    proof: Uint8Array.from(
      signAttestation(
        null,
        new TextEncoder().encode(serializeVerificationValue(presentation)),
        TEST_ATTESTATION_PRIVATE_KEY
      )
    ),
  });
};

const createPromotionCoordinator = (
  clock: GoldenG3V8ExecutionClock
): VerificationEvidencePromotionCoordinator => {
  const repository = createInMemoryVerificationEvidenceRepository({
    now: () => clock.promotionInstant,
    allocatePromotionId: ({ attemptId }) => `promotion:${attemptId}`,
    allocateEvidenceId: ({ attemptId }) => `evidence:${attemptId}`,
  });
  return createVerificationEvidencePromotionCoordinator({
    repository,
    artifactPromotion: Object.freeze({
      async promoteCandidateArtifacts(candidate) {
        return Object.freeze({
          status: 'accepted' as const,
          artifacts: promotedArtifacts(candidate),
        });
      },
    }),
    attestationVerifier,
  });
};

const promoteCandidate = async (
  coordinator: VerificationEvidencePromotionCoordinator,
  candidate: VerificationEvidenceCandidate,
  clock: GoldenG3V8ExecutionClock
): Promise<VerificationEvidence> => {
  const promoted = await coordinator.promote({
    candidate,
    attestation: createAttestation(candidate, clock),
  });
  if (promoted.status !== 'completed') {
    throw new Error(
      `Golden G3 V8 promotion for "${candidate.cellId}" failed: ${promoted.reasonCode} ${promoted.message}`
    );
  }
  return projectVerificationEvidenceManifest(promoted.evidence);
};

export type GoldenG3V8ViewOverride = Readonly<{
  evidenceId: string;
  trustStatus?: 'verified' | 'unverified' | 'revoked' | 'expired';
  artifactStatus?: 'available' | 'missing' | 'deleted';
}>;

export const createGoldenG3V8VerifiedView = (
  evidence: readonly VerificationEvidence[],
  overrides: readonly GoldenG3V8ViewOverride[] = [],
  clock: GoldenG3V8ExecutionClock = GOLDEN_G3_V8_DEFAULT_CLOCK
): Readonly<{
  view: VerificationEvidenceVerifiedView;
  revokedEvidenceIds: readonly string[];
}> => {
  const overrideById = new Map(
    overrides.map((override) => [override.evidenceId, override] as const)
  );
  const revokedEvidenceIds = Object.freeze(
    overrides
      .filter(({ trustStatus }) => trustStatus === 'revoked')
      .map(({ evidenceId }) => evidenceId)
      .sort(compareUnicodeCodePoints)
  );
  const revocationRecordDigest = digestVerificationValue({
    format: 'prodivix.golden-g3-v8-revocation-view',
    version: 1,
    closureEvaluationInstant: clock.closureInstant,
    revokedEvidenceIds,
  });
  return Object.freeze({
    view: createVerificationEvidenceVerifiedView({
      closureEvaluationInstant: clock.closureInstant,
      revocationRecordDigest,
      records: evidence.map((candidate) => {
        const override = overrideById.get(candidate.id);
        const trustStatus = override?.trustStatus ?? 'verified';
        return Object.freeze({
          evidenceId: candidate.id,
          manifestDigest: candidate.manifestDigest,
          materializedEvidenceDigest: digestVerificationValue(candidate),
          effectiveTrust: candidate.provenance.trust,
          trustStatus,
          ...(candidate.provenance.attestationDigest
            ? { attestationDigest: candidate.provenance.attestationDigest }
            : {}),
          retentionState: 'active' as const,
          revocationRecordDigests:
            trustStatus === 'revoked'
              ? Object.freeze([
                  digestVerificationValue({
                    evidenceId: candidate.id,
                    state: 'revoked',
                  }),
                ])
              : Object.freeze([]),
          artifacts: candidate.artifacts.map((artifact) =>
            Object.freeze({
              artifactId: artifact.id,
              digest: artifact.digest,
              status: override?.artifactStatus ?? ('available' as const),
            })
          ),
        });
      }),
    }),
    revokedEvidenceIds,
  });
};

export const createGoldenG3V8ClosureInput = (
  evidence: readonly VerificationEvidence[],
  verified: ReturnType<typeof createGoldenG3V8VerifiedView>,
  plan: VerificationPlan = GOLDEN_G3_V8_PLAN
): EvaluateVerificationClosureInput =>
  Object.freeze({
    plan,
    evidence,
    verifiedEvidenceView: verified.view,
    closureEvaluationInstant: verified.view.closureEvaluationInstant,
    targetRevision: plan.targetRevision,
    targetPartitionRevisions: plan.targetPartitionRevisions,
    scenarioRegistryDigest: plan.scenarioRegistryDigest,
    semanticSchemaDigest: plan.semanticSchemaDigest,
    providerSetDigest: plan.providerSetDigest,
    adapterRegistryDigest: plan.adapterRegistryDigest,
    impactDigest: plan.impactDigest,
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    compilerDigest: plan.compilerDigest,
    plannerDigest: plan.plannerDigest,
    baselineSetDigests: uniqueVerificationText(
      plan.cells.flatMap((cell) =>
        cell.baselineSetRef?.digest ? [cell.baselineSetRef.digest] : []
      )
    ),
    toolchainSetDigest: digestVerificationValue(
      uniqueVerificationText(
        plan.cells.map(({ adapter: identity }) => identity.toolchainDigest)
      )
    ),
    revocationRecordDigest: verified.view.revocationRecordDigest,
    revokedEvidenceIds: verified.revokedEvidenceIds,
  });

export const evaluateGoldenG3V8Closure = (
  evidence: readonly VerificationEvidence[],
  verified: ReturnType<typeof createGoldenG3V8VerifiedView>,
  plan: VerificationPlan = GOLDEN_G3_V8_PLAN
) =>
  evaluateVerificationClosure(
    createGoldenG3V8ClosureInput(evidence, verified, plan)
  );

const requiredGithubEnvironment = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value || value.length > 2_048) {
    throw new Error(`Golden G3 V8 GitHub execution identity requires ${name}.`);
  }
  return value;
};

const createClosureExecutionIdentity = (
  startedAt: string,
  completedAt: string
): GoldenG3V8ClosureExecutionIdentity => {
  if (
    !Number.isFinite(Date.parse(startedAt)) ||
    !Number.isFinite(Date.parse(completedAt)) ||
    Date.parse(completedAt) < Date.parse(startedAt)
  ) {
    throw new Error('Golden G3 V8 execution window is invalid.');
  }
  const common = Object.freeze({
    command: 'pnpm run verify:g3:golden' as const,
    startedAt,
    completedAt,
    attestationAuthority: Object.freeze({
      mode: 'deterministic-test-only' as const,
      issuer: 'https://attestation.prodivix.example.test',
      audience: 'prodivix-g3-v8-verification',
      keyId: 'golden-g3-v8-test-key' as const,
      verifierId: 'golden-g3-v8-test-verifier' as const,
      verifierVersion: '1.0.0' as const,
    }),
  });
  if (process.env.GITHUB_ACTIONS !== 'true') {
    return Object.freeze({
      mode: 'local' as const,
      repository: null,
      ref: null,
      commit: null,
      runId: null,
      runAttempt: null,
      jobId: null,
      workflowRef: null,
      runUrl: null,
      ...common,
    });
  }
  const repository = requiredGithubEnvironment('GITHUB_REPOSITORY');
  const ref = requiredGithubEnvironment('GITHUB_REF');
  const commit = requiredGithubEnvironment('GITHUB_SHA').toLowerCase();
  const runId = requiredGithubEnvironment('GITHUB_RUN_ID');
  const runAttemptText = requiredGithubEnvironment('GITHUB_RUN_ATTEMPT');
  const jobId = requiredGithubEnvironment('GITHUB_JOB');
  const workflowRef = requiredGithubEnvironment('GITHUB_WORKFLOW_REF');
  const serverUrl = requiredGithubEnvironment('GITHUB_SERVER_URL');
  let parsedServerUrl: URL;
  try {
    parsedServerUrl = new URL(serverUrl);
  } catch {
    throw new Error('Golden G3 V8 GitHub server URL is invalid.');
  }
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !/^refs\/[A-Za-z0-9_./-]+$/u.test(ref) ||
    !/^[a-f0-9]{40}$/u.test(commit) ||
    !/^[0-9]+$/u.test(runId) ||
    !/^[1-9][0-9]*$/u.test(runAttemptText) ||
    parsedServerUrl.protocol !== 'https:' ||
    parsedServerUrl.username ||
    parsedServerUrl.password ||
    parsedServerUrl.search ||
    parsedServerUrl.hash
  ) {
    throw new Error('Golden G3 V8 GitHub execution identity is invalid.');
  }
  return Object.freeze({
    mode: 'github-actions' as const,
    repository: `github:${repository}`,
    ref,
    commit: `sha1-${commit}`,
    runId,
    runAttempt: Number(runAttemptText),
    jobId,
    workflowRef,
    runUrl: `${parsedServerUrl.origin}/${repository}/actions/runs/${runId}`,
    ...common,
  });
};

const createClosureCellRecords = (input: {
  plan: VerificationPlan;
  attempts: readonly GoldenG3V8SelectedAttempt[];
  evidence: readonly VerificationEvidence[];
  verifiedView: VerificationEvidenceVerifiedView;
  closure: VerificationClosure;
}): readonly GoldenG3V8ClosureCellRecord[] => {
  const evidenceByCell = new Map(
    input.evidence.map((evidence) => [evidence.cellId, evidence] as const)
  );
  const attemptByCell = new Map(
    input.attempts.map((attempt) => [attempt.cell.id, attempt] as const)
  );
  const verifiedByEvidence = new Map(
    input.verifiedView.records.map(
      (record) => [record.evidenceId, record] as const
    )
  );
  if (
    evidenceByCell.size !== 66 ||
    attemptByCell.size !== 66 ||
    verifiedByEvidence.size !== 66
  ) {
    throw new Error(
      'Golden G3 V8 Closure manifest requires 66 unique cell records.'
    );
  }
  const records = input.plan.cells.map((cell) => {
    const attempt = attemptByCell.get(cell.id);
    const evidence = evidenceByCell.get(cell.id);
    const verified = evidence ? verifiedByEvidence.get(evidence.id) : undefined;
    if (
      cell.requirement !== 'required' ||
      !attempt ||
      !evidence ||
      !verified ||
      evidence.attemptId !== attempt.attemptId ||
      evidence.run.providerId !== attempt.providerId ||
      evidence.result.outcome !== 'passed' ||
      input.closure.cellStatuses[cell.id] !== 'passed' ||
      (evidence.provenance.trust !== 'remote-attested' &&
        evidence.provenance.trust !== 'ci-attested') ||
      !cell.evidenceRequirements.acceptedTrust.includes(
        evidence.provenance.trust
      ) ||
      !evidence.provenance.attestationDigest ||
      verified.manifestDigest !== evidence.manifestDigest ||
      verified.effectiveTrust !== evidence.provenance.trust ||
      verified.trustStatus !== 'verified' ||
      verified.attestationDigest !== evidence.provenance.attestationDigest ||
      verified.retentionState !== 'active'
    ) {
      throw new Error(
        `Golden G3 V8 Closure manifest cell "${cell.id}" is not accepted.`
      );
    }
    const artifactAvailability = new Map(
      verified.artifacts.map((artifact) => [artifact.artifactId, artifact])
    );
    const artifacts = Object.freeze(
      evidence.artifacts.map((artifact) => {
        const availability = artifactAvailability.get(artifact.id);
        if (
          !availability ||
          availability.digest !== artifact.digest ||
          availability.status !== 'available'
        ) {
          throw new Error(
            `Golden G3 V8 Closure manifest artifact "${artifact.id}" is unavailable.`
          );
        }
        return Object.freeze({
          id: artifact.id,
          kind: artifact.kind,
          digest: artifact.digest,
          normalizedDigest: artifact.normalizedDigest ?? null,
          sourceTraceDigest: artifact.sourceTraceDigest ?? null,
          size: artifact.size,
          mediaType: artifact.mediaType,
          status: 'available' as const,
        });
      })
    );
    if (
      artifacts.length !== verified.artifacts.length ||
      artifactAvailability.size !== artifacts.length
    ) {
      throw new Error(
        `Golden G3 V8 Closure manifest cell "${cell.id}" artifact set drifted.`
      );
    }
    return Object.freeze({
      cell: Object.freeze({
        id: cell.id,
        checkId: cell.checkId,
        checkKind: cell.checkKind,
        scenarioId: cell.scenarioId ?? null,
        targetId: cell.targetId,
        targetPolicy: cell.targetPolicy,
        frameworkTarget: cell.frameworkTarget,
        surface: cell.surface,
        browserEngine: cell.browserEngine ?? null,
        viewport: cell.viewport,
        colorScheme: cell.colorScheme,
        motion: cell.motion,
        locale: cell.locale,
        controlProfileRef: cell.controlProfileRef,
        fixtureSetRef: cell.fixtureSetRef ?? null,
        baselineSetRef: cell.baselineSetRef ?? null,
        adapter: cell.adapter,
        requirement: 'required' as const,
        inputDigest: cell.inputDigest,
      }),
      attempt: Object.freeze({
        id: attempt.attemptId,
        providerId: attempt.providerId,
        runtimeZone: attempt.runtimeZone,
      }),
      acceptedEvidence: Object.freeze({
        id: evidence.id,
        manifestDigest: evidence.manifestDigest,
        materializedEvidenceDigest: verified.materializedEvidenceDigest,
        verifiedViewRecordDigest: verified.recordDigest,
        runId: evidence.run.runId,
        trust: evidence.provenance.trust,
        trustStatus: 'verified' as const,
        attestationDigest: evidence.provenance.attestationDigest,
        ci:
          evidence.provenance.trust === 'ci-attested'
            ? evidence.provenance.ci
            : null,
        scenario: evidence.scenario ?? null,
        timing: evidence.timing,
        outcome: 'passed' as const,
        toolchain: evidence.toolchain,
        normalization: evidence.normalization,
        controls: evidence.controls,
        inputs: evidence.inputs,
        sourceTraceDigest: evidence.sourceTraceDigest,
        dependencyLockDigest: evidence.dependencyLockDigest,
        retentionClass: evidence.retention,
        retentionState: 'active' as const,
        createdAt: evidence.createdAt,
        artifacts,
      }),
      compatibility: 'compatible' as const,
      verdict: 'passed' as const,
    });
  });
  if (
    records.length !== 66 ||
    new Set(records.map(({ cell }) => cell.id)).size !== 66 ||
    new Set(records.map(({ acceptedEvidence }) => acceptedEvidence.id)).size !==
      66
  ) {
    throw new Error('Golden G3 V8 Closure manifest cell coverage drifted.');
  }
  return Object.freeze(records);
};

const createClosureManifest = (input: {
  plan: VerificationPlan;
  lockedPlanDigest: string;
  matrix: GoldenG3V6ControlledAdapterMatrixEvidence;
  attempts: readonly GoldenG3V8SelectedAttempt[];
  evidence: readonly VerificationEvidence[];
  verifiedView: VerificationEvidenceVerifiedView;
  closure: VerificationClosure;
  execution: GoldenG3V8ClosureExecutionIdentity;
}): GoldenG3V8ClosureManifest => {
  const remoteAttestedEvidenceCount = input.evidence.filter(
    ({ provenance }) => provenance.trust === 'remote-attested'
  ).length;
  const ciAttestedEvidenceCount = input.evidence.filter(
    ({ provenance }) => provenance.trust === 'ci-attested'
  ).length;
  if (
    input.closure.verdict !== 'satisfied' ||
    input.evidence.length !== 66 ||
    remoteAttestedEvidenceCount !== 14 ||
    ciAttestedEvidenceCount !== 52
  ) {
    throw new Error(
      'Golden G3 V8 cannot issue a non-passing Closure manifest.'
    );
  }
  const cells = createClosureCellRecords(input);
  const identity = Object.freeze({
    format: 'prodivix.golden-g3-v8-closure-manifest' as const,
    version: 1 as const,
    targetId: 'authenticated-catalog' as const,
    execution: input.execution,
    planIdentity: Object.freeze({
      workspaceId: input.plan.workspaceId,
      targetRevision: input.plan.targetRevision,
      targetPartitionRevisions: input.plan.targetPartitionRevisions,
      scenarioRegistryDigest: input.plan.scenarioRegistryDigest,
      semanticSchemaDigest: input.plan.semanticSchemaDigest,
      providerSetDigest: input.plan.providerSetDigest,
      adapterRegistryDigest: input.plan.adapterRegistryDigest,
      impactDigest: input.plan.impactDigest,
      policyRevision: input.plan.policyRevision,
      policyDigest: input.plan.policyDigest,
      policyEvaluationInstant: input.plan.policyEvaluationInstant,
      compilerDigest: input.plan.compilerDigest,
      plannerDigest: input.plan.plannerDigest,
    }),
    closureIdentity: Object.freeze({
      workspaceId: input.closure.workspaceId,
      targetRevision: input.closure.targetRevision,
      targetPartitionRevisions: input.closure.targetPartitionRevisions,
      scenarioRegistryDigest: input.closure.scenarioRegistryDigest,
      semanticSchemaDigest: input.closure.semanticSchemaDigest,
      providerSetDigest: input.closure.providerSetDigest,
      adapterRegistryDigest: input.closure.adapterRegistryDigest,
      impactDigest: input.closure.impactDigest,
      policyRevision: input.closure.policyRevision,
      policyDigest: input.closure.policyDigest,
      compilerDigest: input.closure.compilerDigest,
      plannerDigest: input.closure.plannerDigest,
      policyEvaluationInstant: input.closure.policyEvaluationInstant,
      closureEvaluationInstant: input.closure.closureEvaluationInstant,
      evidenceSetDigest: input.closure.evidenceSetDigest,
      revocationRecordDigest: input.closure.revocationRecordDigest,
      baselineSetDigests: input.closure.baselineSetDigests,
      toolchainSetDigest: input.closure.toolchainSetDigest,
      evidenceDigests: input.closure.evidenceDigests,
      appliedExemptionIds: input.closure.appliedExemptionIds,
    }),
    planDigest: input.plan.planDigest,
    lockedPlanDigest: input.lockedPlanDigest,
    policyDigest: input.plan.policyDigest,
    matrixEvidenceDigest: input.matrix.evidenceDigest,
    canonicalAttemptManifestDigest: input.matrix.attemptManifest.manifestDigest,
    controlledDimensionManifestDigest:
      input.matrix.controlledDimensions.manifestDigest,
    controlledDimensionEvidenceDigest:
      input.matrix.controlledDimensions.evidenceDigest,
    controlledEnvironmentEvidenceDigest:
      input.matrix.controlledEnvironment.evidenceDigest,
    selectedAttemptSetDigest: digestVerificationValue(
      input.attempts.map(({ cell, attemptId, providerId }) =>
        Object.freeze({ cellId: cell.id, attemptId, providerId })
      )
    ),
    evidenceSetDigest: input.closure.evidenceSetDigest,
    verifiedViewDigest: input.verifiedView.viewDigest,
    revocationRecordDigest: input.verifiedView.revocationRecordDigest,
    closureDigest: input.closure.closureDigest,
    closureVerdict: 'satisfied' as const,
    requiredCellCount: 66 as const,
    promotedEvidenceCount: 66 as const,
    remoteAttestedEvidenceCount: 14 as const,
    ciAttestedEvidenceCount: 52 as const,
    frameworkTargets: Object.freeze(['react-vite', 'vue-vite'] as const),
    surfaces: Object.freeze(['preview', 'export', 'ci'] as const),
    browserEngines: Object.freeze(['chromium', 'firefox', 'webkit'] as const),
    checkKinds: Object.freeze([
      'accessibility',
      'build',
      'diagnostics',
      'e2e',
      'integration',
      'performance',
      'security',
      'unit',
      'visual',
    ] as const),
    cells,
    cellManifestDigest: digestVerificationValue(cells),
  });
  return Object.freeze({
    ...identity,
    manifestDigest: digestVerificationValue(identity),
  });
};

export const executeGoldenG3V8Closure = async (
  options: Readonly<{
    plan?: VerificationPlan;
    lockedPlanDigest?: string;
    clock?: GoldenG3V8ExecutionClock;
  }> = {}
): Promise<GoldenG3V8ClosureHarness> => {
  const plan = options.plan ?? GOLDEN_G3_V8_PLAN;
  const clock = options.clock ?? GOLDEN_G3_V8_DEFAULT_CLOCK;
  const lockedPlanDigest =
    options.lockedPlanDigest ?? GOLDEN_G3_V8_LOCKED_PLAN_DIGEST;
  const executionStartedAt = new Date().toISOString();
  const matrix = await executeGoldenG3V6ControlledAdapterMatrix(plan);
  const attempts = selectClosureAttempts(matrix, plan);
  const candidates = Object.freeze(
    attempts.map((attempt, index) =>
      normalizeAttempt(matrix, plan, clock, attempt, index)
    )
  );
  const negativeAttempt = attempts.find(
    ({ cell }) =>
      cell.surface === 'ci' &&
      cell.frameworkTarget === 'react-vite' &&
      cell.browserEngine === 'chromium' &&
      cell.checkKind === 'e2e' &&
      cell.motion === 'full'
  );
  if (!negativeAttempt) {
    throw new Error('Golden G3 V8 negative Closure cell is missing.');
  }
  const failedCandidate = normalizeAttempt(
    matrix,
    plan,
    clock,
    negativeAttempt,
    100,
    'failed'
  );
  const blockedCandidate = normalizeAttempt(
    matrix,
    plan,
    clock,
    negativeAttempt,
    101,
    'blocked'
  );
  const coordinator = createPromotionCoordinator(clock);
  const evidence = Object.freeze(
    await Promise.all(
      candidates.map((candidate) =>
        promoteCandidate(coordinator, candidate, clock)
      )
    )
  );
  const [failedEvidence, blockedEvidence] = await Promise.all([
    promoteCandidate(coordinator, failedCandidate, clock),
    promoteCandidate(coordinator, blockedCandidate, clock),
  ]);
  const verified = createGoldenG3V8VerifiedView(evidence, [], clock);
  const closureResult = evaluateGoldenG3V8Closure(evidence, verified, plan);
  if (closureResult.status !== 'ready') {
    throw new Error(
      `Golden G3 V8 Closure is invalid: ${closureResult.message}`
    );
  }
  const closure = closureResult.closure;
  if (closure.verdict !== 'satisfied') {
    throw new Error(
      `Golden G3 V8 Closure did not pass: ${JSON.stringify(closure.issues)}`
    );
  }
  const manifest = createClosureManifest({
    plan,
    lockedPlanDigest,
    matrix,
    attempts,
    evidence,
    verifiedView: verified.view,
    closure,
    execution: createClosureExecutionIdentity(
      executionStartedAt,
      new Date().toISOString()
    ),
  });
  return Object.freeze({
    matrix,
    attempts,
    candidates,
    evidence,
    verifiedView: verified.view,
    closure,
    manifest,
    negativeEvidence: Object.freeze({
      cellId: negativeAttempt.cell.id,
      failed: failedEvidence,
      blocked: blockedEvidence,
    }),
  });
};
