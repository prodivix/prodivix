import {
  compareVerificationText,
  digestVerificationValue,
} from '@prodivix/verification';
import type {
  VerificationCheckKind,
  VerificationEvidenceRetentionProtection,
  VerificationEvidenceSourceTrace,
  VerificationPlan,
} from '@prodivix/verification';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  decodeVerificationEvidenceDetail,
  type VerificationEvidenceArtifactKind,
  type VerificationEvidenceAttemptOutcome,
  type VerificationEvidenceTransportRecord,
  type VerificationEvidenceTrust,
  type VerificationEvidenceTrustStatus,
} from '../verificationEvidenceCodec';

export const evidenceDigest = (character: string): string =>
  `sha256-${character.repeat(64)}`;

export const evidencePartitionRevisions = Object.freeze({
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 11,
  documentRevisions: Object.freeze({}),
});

export const createPlanFixture = (): VerificationPlan => {
  const cellsByCheckKind = Object.freeze(
    Object.fromEntries(
      (
        [
          'diagnostics',
          'build',
          'unit',
          'integration',
          'e2e',
          'visual',
          'accessibility',
          'performance',
          'security',
        ] satisfies readonly VerificationCheckKind[]
      ).map((kind) => [kind, kind === 'e2e' ? 1 : 0])
    ) as Record<VerificationCheckKind, number>
  );
  const withoutDigest = Object.freeze({
    status: 'ready' as const,
    workspaceId: 'workspace-a',
    targetRevision: 7,
    targetPartitionRevisions: evidencePartitionRevisions,
    scenarioRegistryDigest: evidenceDigest('1'),
    policyRevision: 2,
    policyDigest: evidenceDigest('c'),
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: false,
    }),
    policyEvaluationInstant: '2026-07-28T01:00:00Z',
    impactDigest: evidenceDigest('d'),
    semanticSchemaDigest: evidenceDigest('f'),
    providerSetDigest: evidenceDigest('6'),
    compilerDigest: evidenceDigest('8'),
    plannerDigest: evidenceDigest('9'),
    adapterRegistryDigest: evidenceDigest('0'),
    cells: Object.freeze([
      Object.freeze({
        id: 'cell-a',
        checkId: 'check-a',
        checkKind: 'e2e' as const,
        targetId: 'target-a',
        targetPolicy: Object.freeze({
          authority: 'verification-policy' as const,
          policyDigest: evidenceDigest('c'),
          semanticTargetId: 'target-a',
          capture: 'allowed' as const,
        }),
        frameworkTarget: 'react-vite',
        surface: 'ci' as const,
        browserEngine: 'chromium' as const,
        viewport: Object.freeze({
          id: 'desktop',
          width: 1_280,
          height: 720,
        }),
        colorScheme: 'light' as const,
        motion: 'full' as const,
        locale: 'en-US',
        controlProfileRef: Object.freeze({
          kind: 'preset' as const,
          presetId: 'control-default',
          digest: evidenceDigest('7'),
        }),
        adapter: Object.freeze({
          adapterId: 'adapter-a',
          toolchainDigest: evidenceDigest('5'),
          capabilityDigest: evidenceDigest('a'),
        }),
        requirement: 'required' as const,
        policyRuleIds: Object.freeze(['rule-a']),
        appliedExemptionIds: Object.freeze([]),
        retryPolicy: Object.freeze({
          id: 'retry-a',
          maximumAttempts: 3,
          retryableOutcomes: Object.freeze(['infrastructure-error'] as const),
          stabilitySamples: 1,
          freshFixtureNamespace: true as const,
        }),
        evidenceRequirements: Object.freeze({
          acceptedTrust: Object.freeze(['ci-attested'] as const),
          maximumAgeMs: 2 * 24 * 60 * 60 * 1_000,
          requireAttestation: true,
          requireCompatibleIdentity: true as const,
          requiredArtifactKinds: Object.freeze(['build-log'] as const),
        }),
        resources: Object.freeze([]),
        inputKinds: Object.freeze(['executable-snapshot'] as const),
        artifactKinds: Object.freeze(['build-log'] as const),
        estimatedCost: Object.freeze({
          durationMs: 1_000,
          artifactBytes: 4,
          computeUnits: 1,
        }),
        preflight: Object.freeze({ status: 'supported' as const }),
        dependencyCellIds: Object.freeze([]),
        inputDigest: evidenceDigest('0'),
      }),
    ]),
    issues: Object.freeze([]),
    explanations: Object.freeze([]),
    budget: Object.freeze({
      cells: 1,
      cellsByCheckKind,
      targetExpansions: 1,
      browserExpansions: 1,
      closureEvidenceRecords: 1,
      maximumClosureEvidenceRecords: 1_000,
      totalMs: 1_000,
      artifactBytes: 4,
      estimatedComputeUnits: 1,
      maximumParallelism: 1,
      overBudgetDimensions: Object.freeze([]),
    }),
  });
  return Object.freeze({
    ...withoutDigest,
    planDigest: digestVerificationValue(withoutDigest),
  });
};

export const createEvidenceRecordPayload = (
  input: Readonly<{
    evidenceId?: string;
    attemptId?: string;
    outcome?: VerificationEvidenceAttemptOutcome;
    completedAt?: string;
    trust?: VerificationEvidenceTrust;
    trustStatus?: VerificationEvidenceTrustStatus;
    effectiveTrust?: VerificationEvidenceTrust;
    verifiedAttestation?: boolean;
    retentionState?: 'active' | 'tombstoned' | 'references-released';
    artifactDigest?: string;
    artifactSize?: number;
    artifactAvailability?: 'available' | 'missing' | 'deleted';
    artifactKind?: VerificationEvidenceArtifactKind;
    artifactMediaType?: string;
    artifactPath?: string;
    artifactSourceTraceDigest?: string | null;
    sourceTraces?: readonly VerificationEvidenceSourceTrace[];
    activeProtections?: readonly VerificationEvidenceRetentionProtection[];
  }> = {}
): Record<string, unknown> => {
  const trust = input.trust ?? 'ci-attested';
  const artifactDigest = input.artifactDigest ?? evidenceDigest('a');
  const artifactSize = input.artifactSize ?? 4;
  const artifactKind = input.artifactKind ?? 'build-log';
  const artifactMediaType = input.artifactMediaType ?? 'text/plain';
  const completedAt = input.completedAt ?? '2026-07-28T01:00:02Z';
  const plan = createPlanFixture();
  const sourceTraces =
    input.sourceTraces ??
    Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'verification-plan-cell' as const,
          planDigest: plan.planDigest,
          cellId: 'cell-a',
        }),
        label: 'Verification plan cell',
      }),
    ]);
  const artifactSourceTraceDigest =
    input.artifactSourceTraceDigest === null
      ? undefined
      : (input.artifactSourceTraceDigest ??
        (sourceTraces[0]
          ? digestVerificationValue(sourceTraces[0])
          : undefined));
  const artifactPath = input.artifactPath ?? 'reports/build.log';
  const evidence = {
    id: input.evidenceId ?? 'evidence-a',
    projectId: 'project-a',
    workspaceId: 'workspace-a',
    workspaceRevision: 7,
    partitionRevisions: evidencePartitionRevisions,
    executableSnapshotDigest: evidenceDigest('b'),
    policyRevision: 2,
    policyDigest: evidenceDigest('c'),
    impactDigest: evidenceDigest('d'),
    planDigest: plan.planDigest,
    policyEvaluationInstant: '2026-07-28T01:00:00Z',
    cellId: 'cell-a',
    checkId: 'check-a',
    checkKind: 'e2e',
    targetId: 'target-a',
    attemptId: input.attemptId ?? 'attempt-a',
    run: {
      runId: 'run-a',
      providerId: 'provider-a',
      jobId: 'job-a',
      surface: 'ci',
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium',
      operatingSystemIdentity: 'linux-x64',
      viewport: {
        id: 'desktop',
        width: 1280,
        height: 720,
      },
      devicePixelRatio: 1,
      colorScheme: 'light',
      motion: 'full',
      locale: 'en-US',
      timezone: 'UTC',
      fontSetDigest: evidenceDigest('1'),
    },
    timing: {
      startedAt: '2026-07-28T01:00:01Z',
      completedAt,
      durationMs: Date.parse(completedAt) - Date.parse('2026-07-28T01:00:01Z'),
    },
    result: {
      outcome: input.outcome ?? 'passed',
      normalizedResultDigest: evidenceDigest('2'),
      summary: { assertions: 3, note: 'bounded' },
      diagnosticCodes: [],
      appliedExemptionIds: [],
    },
    provenance: {
      trust,
      producerId: 'producer-a',
      ...(trust === 'remote-attested' || trust === 'ci-attested'
        ? { attestationDigest: evidenceDigest('3') }
        : {}),
      issuedAt: '2026-07-28T01:00:02Z',
      expiresAt: '2026-08-28T01:00:02Z',
      ...(trust === 'ci-attested'
        ? {
            ci: {
              repository: 'prodivix/prodivix',
              ref: 'refs/heads/main',
              commit: `sha1-${'1'.repeat(40)}`,
            },
          }
        : {}),
    },
    toolchain: {
      packageName: 'playwright',
      packageVersion: '1.55.0',
      buildDigest: evidenceDigest('4'),
      toolchainDigest: evidenceDigest('5'),
      schemaDigest: evidenceDigest('6'),
    },
    normalization: {
      packageName: '@prodivix/verification',
      packageVersion: '1.0.0',
      buildDigest: evidenceDigest('d'),
      toolchainDigest: evidenceDigest('e'),
      schemaDigest: evidenceDigest('f'),
    },
    controls: {
      profileDigest: evidenceDigest('7'),
      appliedDigest: evidenceDigest('8'),
    },
    inputs: {
      executableSnapshotDigest: evidenceDigest('b'),
      fixtureSetDigests: [],
      inputDigest: evidenceDigest('0'),
    },
    artifacts: [
      {
        id: 'artifact-a',
        path: artifactPath,
        kind: artifactKind,
        digest: artifactDigest,
        ...(artifactSourceTraceDigest
          ? { sourceTraceDigest: artifactSourceTraceDigest }
          : {}),
        size: artifactSize,
        mediaType: artifactMediaType,
      },
    ],
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: evidenceDigest('b'),
    redactionPolicyId: 'redaction-v1',
    targetPolicy: {
      authority: 'verification-policy',
      policyDigest: evidenceDigest('c'),
      semanticTargetId: 'target-a',
      capture: 'allowed',
    },
    createdAt: '2026-07-28T01:00:02Z',
    retention: 'change',
    manifestDigest: evidenceDigest('c'),
  };
  const artifacts = [
    {
      id: 'artifact-a',
      path: artifactPath,
      kind: artifactKind,
      digest: artifactDigest,
      ...(artifactSourceTraceDigest
        ? { sourceTraceDigest: artifactSourceTraceDigest }
        : {}),
      size: artifactSize,
      mediaType: artifactMediaType,
      availability: input.artifactAvailability ?? 'available',
    },
  ];
  const verifiedViewWithoutDigest = {
    evidenceId: evidence.id,
    manifestDigest: evidence.manifestDigest,
    materializedEvidenceDigest: digestVerificationValue(evidence),
    effectiveTrust: input.effectiveTrust ?? trust,
    trustStatus: input.trustStatus ?? 'verified',
    ...(evidence.provenance.attestationDigest &&
    input.verifiedAttestation !== false
      ? { attestationDigest: evidence.provenance.attestationDigest }
      : {}),
    retentionState: input.retentionState ?? 'active',
    retentionExpiresAt: '2026-08-28T01:00:02Z',
    revocationRecordDigests:
      input.trustStatus === 'revoked' ? [evidenceDigest('b')] : [],
    ...(input.retentionState && input.retentionState !== 'active'
      ? { tombstoneDigest: evidenceDigest('c') }
      : {}),
    artifacts: artifacts.map((artifact) => ({
      artifactId: artifact.id,
      digest: artifact.digest,
      status: artifact.availability,
    })),
  };
  return {
    evidence,
    artifacts,
    verifiedView: {
      ...verifiedViewWithoutDigest,
      recordDigest: digestVerificationValue(verifiedViewWithoutDigest),
    },
    activeProtections: input.activeProtections ?? [],
  };
};

export const decodeEvidenceRecordFixture = (
  input: Parameters<typeof createEvidenceRecordPayload>[0] = {}
): VerificationEvidenceTransportRecord =>
  decodeVerificationEvidenceDetail({
    record: createEvidenceRecordPayload(input),
  });

export const createVerifiedEvidenceViewPayload = (
  records: readonly VerificationEvidenceTransportRecord[]
): Record<string, unknown> => {
  const verifiedRecords = records
    .map((record) => record.verifiedView)
    .sort((left, right) =>
      compareVerificationText(left.evidenceId, right.evidenceId)
    );
  const withoutViewDigest = {
    format: 'prodivix.verification-evidence-view.v1',
    closureEvaluationInstant: '2026-07-28T02:00:00Z',
    records: verifiedRecords,
    revocationRecordDigest: digestVerificationValue(
      verifiedRecords.flatMap((record) => record.revocationRecordDigests)
    ),
  };
  return {
    verifiedEvidenceView: {
      ...withoutViewDigest,
      viewDigest: digestVerificationValue(withoutViewDigest),
    },
  };
};

export const createWorkspaceFixture = (): WorkspaceSnapshot =>
  ({
    id: 'workspace-a',
    projectId: 'project-a',
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    docsById: {},
  }) as unknown as WorkspaceSnapshot;
