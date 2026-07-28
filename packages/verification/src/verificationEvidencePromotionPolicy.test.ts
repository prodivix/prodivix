import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { describe, expect, it } from 'vitest';
import { VERIFICATION_ARTIFACT_POLICY_DEFAULTS } from './verificationArtifactPolicy';
import {
  createVerificationEvidencePromotionCoordinator,
  type VerificationEvidenceArtifactPromotionPort,
} from './verificationEvidencePromotion';
import {
  createInMemoryVerificationEvidenceRepository,
  type VerificationEvidenceRepository,
} from './verificationEvidenceRepository';
import { digestVerificationValue } from './verificationCanonical';
import type {
  VerificationArtifactManifest,
  VerificationEvidenceCandidate,
  VerificationEvidenceCandidateArtifact,
} from './verification.types';

const sha = (label: string): string => digestVerificationValue(label);

const artifact = (
  index: number,
  expectedSize: number
): VerificationEvidenceCandidateArtifact =>
  Object.freeze({
    id: `artifact:${String(index).padStart(3, '0')}`,
    path: `reports/artifact-${String(index).padStart(3, '0')}.json`,
    stagingArtifactId: `staging:${String(index).padStart(3, '0')}`,
    kind: 'trace',
    expectedDigest: sha(`artifact-${index}`),
    expectedSize,
    expectedMediaType: 'application/json',
  });

type CandidateOptions = Readonly<{
  suffix: string;
  artifacts: readonly VerificationEvidenceCandidateArtifact[];
  workspaceId?: string;
  workspaceRevision?: number;
  planDigest?: string;
  cellId?: string;
  checkId?: string;
  checkKind?: VerificationEvidenceCandidate['checkKind'];
  targetId?: string;
}>;

const candidate = (
  options: CandidateOptions
): VerificationEvidenceCandidate => {
  const workspaceId = options.workspaceId ?? 'workspace:v5';
  const workspaceRevision = options.workspaceRevision ?? 7;
  const planDigest = options.planDigest ?? sha(`plan-${options.suffix}`);
  const cellId = options.cellId ?? 'cell:unit';
  const checkId = options.checkId ?? 'check:unit';
  const checkKind = options.checkKind ?? 'unit';
  const targetId = options.targetId ?? 'target:react-vite';
  const policyDigest = sha('policy');
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest,
        cellId,
      }),
      label: 'Verification plan cell',
    }),
  ]);
  const resultWithoutDigest = Object.freeze({
    outcome: 'passed' as const,
    summary: Object.freeze({ assertions: 1 }),
    diagnosticCodes: Object.freeze([]),
    appliedExemptionIds: Object.freeze([]),
  });
  const withoutDigest = Object.freeze({
    candidateId: `candidate:${options.suffix}`,
    projectId: 'project:v5',
    workspaceId,
    workspaceRevision,
    partitionRevisions: Object.freeze({
      workspaceRev: workspaceRevision,
      routeRev: 3,
      opSeq: 19,
      documentRevisions: Object.freeze({}),
    }),
    executableSnapshotDigest: sha(`snapshot-${options.suffix}`),
    policyRevision: 2,
    policyDigest,
    impactDigest: sha(`impact-${options.suffix}`),
    planDigest,
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    cellId,
    checkId,
    checkKind,
    targetId,
    attemptId: `attempt:${options.suffix}`,
    run: Object.freeze({
      runId: `run:${options.suffix}`,
      providerId: 'provider:local',
      surface: 'preview' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      operatingSystemIdentity: 'windows-x64',
      viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
      devicePixelRatio: 1,
      colorScheme: 'light' as const,
      motion: 'full' as const,
      locale: 'en-US',
      timezone: 'Asia/Shanghai',
      fontSetDigest: sha('fonts'),
    }),
    timing: Object.freeze({
      startedAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:00:01.000Z',
      durationMs: 1_000,
    }),
    result: Object.freeze({
      ...resultWithoutDigest,
      normalizedResultDigest: digestVerificationValue(resultWithoutDigest),
    }),
    provenance: Object.freeze({
      origin: 'local' as const,
      producerId: 'producer:local',
      providerId: 'provider:local',
      issuedAt: '2026-07-28T00:00:02.000Z',
      expiresAt: '2026-07-29T00:00:02.000Z',
    }),
    toolchain: Object.freeze({
      packageName: '@prodivix/verification-test-adapter',
      packageVersion: '1.0.0',
      buildDigest: sha('adapter-build'),
      toolchainDigest: sha('adapter-toolchain'),
      schemaDigest: sha('adapter-schema'),
    }),
    normalization: Object.freeze({
      packageName: '@prodivix/verification',
      packageVersion: '1.0.0',
      buildDigest: sha('normalization-build'),
      toolchainDigest: sha('normalization-toolchain'),
      schemaDigest: sha('normalization-schema'),
    }),
    controls: Object.freeze({
      profileDigest: sha('control-profile'),
      appliedDigest: sha('applied-controls'),
    }),
    inputs: Object.freeze({
      executableSnapshotDigest: sha(`snapshot-${options.suffix}`),
      fixtureSetDigests: Object.freeze([]),
      inputDigest: sha(`input-${options.suffix}`),
    }),
    artifacts: Object.freeze(
      [...options.artifacts].sort((left, right) =>
        compareUnicodeCodePoints(left.id, right.id)
      )
    ),
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: sha('lockfile'),
    redaction: Object.freeze({
      policyId: 'redaction:default',
      scannerSetDigest: sha('scanners'),
      droppedFieldCounts: Object.freeze({}),
      targetPolicy: Object.freeze({
        authority: 'verification-policy' as const,
        policyDigest,
        semanticTargetId: targetId,
        capture: 'allowed' as const,
      }),
      safe: true as const,
    }),
    requestedRetention: 'change' as const,
    promotion: Object.freeze({
      idempotencyKey: `promotion:${options.suffix}`,
      deadline: '2026-07-28T00:01:00.000Z',
    }),
  } satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>);
  return Object.freeze({
    ...withoutDigest,
    candidateDigest: digestVerificationValue(withoutDigest),
  });
};

const exactArtifacts = (
  value: VerificationEvidenceCandidate
): readonly VerificationArtifactManifest[] =>
  Object.freeze(
    value.artifacts.map((entry) =>
      Object.freeze({
        id: entry.id,
        path: entry.path,
        kind: entry.kind,
        digest: entry.expectedDigest,
        size: entry.expectedSize,
        mediaType: entry.expectedMediaType,
      })
    )
  );

type ArtifactProjector = (
  value: VerificationEvidenceCandidate
) => readonly VerificationArtifactManifest[];

const harness = (
  projector: ArtifactProjector = exactArtifacts
): Readonly<{
  coordinator: ReturnType<
    typeof createVerificationEvidencePromotionCoordinator
  >;
  repository: VerificationEvidenceRepository;
  portCalls(): number;
  resetPortCalls(): void;
}> => {
  let calls = 0;
  const repository = createInMemoryVerificationEvidenceRepository({
    now: () => '2026-07-28T00:00:03.000Z',
    allocatePromotionId: (input) => `record:${input.candidateId}`,
    allocateEvidenceId: (input) => `evidence:${input.candidateId}`,
  });
  const artifactPromotion: VerificationEvidenceArtifactPromotionPort =
    Object.freeze({
      async promoteCandidateArtifacts(value) {
        calls += 1;
        return Object.freeze({
          status: 'accepted' as const,
          artifacts: Object.freeze(projector(value)),
        });
      },
    });
  return Object.freeze({
    coordinator: createVerificationEvidencePromotionCoordinator({
      repository,
      artifactPromotion,
    }),
    repository,
    portCalls: () => calls,
    resetPortCalls: () => {
      calls = 0;
    },
  });
};

const evidenceCount = async (
  repository: VerificationEvidenceRepository,
  workspaceId = 'workspace:v5'
): Promise<number> =>
  (
    await repository.listEvidence({
      workspaceId,
    })
  ).length;

describe('Verification Evidence promotion Core artifact policy', () => {
  it('rejects a declared artifact larger than 16 MiB before calling the port', async () => {
    const test = harness();
    const value = candidate({
      suffix: 'single-budget',
      artifacts: [
        artifact(
          0,
          VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumSingleArtifactBytes + 1
        ),
      ],
    });

    await expect(
      test.coordinator.promote({ candidate: value })
    ).resolves.toEqual(
      expect.objectContaining({ status: 'invalid', reasonCode: 'VER-5005' })
    );
    expect(test.portCalls()).toBe(0);
    expect(await evidenceCount(test.repository)).toBe(0);
  });

  it('rejects declared artifacts larger than 64 MiB in aggregate before calling the port', async () => {
    const test = harness();
    const artifacts = Array.from({ length: 4 }, (_value, index) =>
      artifact(
        index,
        VERIFICATION_ARTIFACT_POLICY_DEFAULTS.maximumSingleArtifactBytes
      )
    );
    artifacts.push(artifact(4, 1));
    const value = candidate({
      suffix: 'total-budget',
      artifacts,
    });

    await expect(
      test.coordinator.promote({ candidate: value })
    ).resolves.toEqual(
      expect.objectContaining({ status: 'invalid', reasonCode: 'VER-5005' })
    );
    expect(test.portCalls()).toBe(0);
    expect(await evidenceCount(test.repository)).toBe(0);
  });

  it.each([
    [
      'identity',
      (value: VerificationArtifactManifest) => ({
        ...value,
        id: 'artifact:stolen',
      }),
    ],
    [
      'kind',
      (value: VerificationArtifactManifest) => ({
        ...value,
        kind: 'build-log' as const,
      }),
    ],
    [
      'path',
      (value: VerificationArtifactManifest) => ({
        ...value,
        path: 'reports/stolen.json',
      }),
    ],
    [
      'media',
      (value: VerificationArtifactManifest) => ({
        ...value,
        mediaType: 'text/plain',
      }),
    ],
    [
      'digest',
      (value: VerificationArtifactManifest) => ({
        ...value,
        digest: sha('stolen-digest'),
      }),
    ],
    [
      'size',
      (value: VerificationArtifactManifest) => ({
        ...value,
        size: value.size + 1,
      }),
    ],
  ])('rejects port-side %s descriptor substitution', async (_label, mutate) => {
    const test = harness((value) =>
      Object.freeze([Object.freeze(mutate(exactArtifacts(value)[0]!))])
    );
    const value = candidate({
      suffix: `port-${_label}`,
      artifacts: [artifact(0, 4)],
    });

    await expect(
      test.coordinator.promote({ candidate: value })
    ).resolves.toEqual(
      expect.objectContaining({ status: 'invalid', reasonCode: 'VER-5005' })
    );
    expect(test.portCalls()).toBe(1);
    expect(await evidenceCount(test.repository)).toBe(0);
  });
});

describe('Verification Evidence promotion supersession lineage', () => {
  it('rejects missing superseded Evidence before calling the artifact port', async () => {
    const test = harness();
    const value = candidate({
      suffix: 'missing-lineage',
      artifacts: [artifact(0, 4)],
    });

    await expect(
      test.coordinator.promote({
        candidate: value,
        supersedes: 'evidence:missing',
      })
    ).resolves.toEqual(
      expect.objectContaining({ status: 'invalid', reasonCode: 'VER-5001' })
    );
    expect(test.portCalls()).toBe(0);
    expect(await evidenceCount(test.repository)).toBe(0);
  });

  it.each([
    [
      'workspace',
      {
        workspaceId: 'workspace:other',
      },
    ],
    [
      'check',
      {
        checkId: 'check:other',
      },
    ],
    [
      'kind',
      {
        checkKind: 'integration' as const,
      },
    ],
    [
      'target',
      {
        targetId: 'target:vue-vite',
      },
    ],
  ])(
    'rejects cross-%s supersession before calling the artifact port',
    async (_label, drift) => {
      const test = harness();
      const seed = candidate({
        suffix: `seed-${_label}`,
        artifacts: [artifact(0, 4)],
      });
      const completed = await test.coordinator.promote({ candidate: seed });
      expect(completed.status).toBe('completed');
      if (completed.status !== 'completed') return;
      test.resetPortCalls();

      const next = candidate({
        suffix: `next-${_label}`,
        artifacts: [artifact(0, 4)],
        ...drift,
      });
      await expect(
        test.coordinator.promote({
          candidate: next,
          supersedes: completed.promotion.evidenceId,
        })
      ).resolves.toEqual(
        expect.objectContaining({ status: 'invalid', reasonCode: 'VER-5001' })
      );
      expect(test.portCalls()).toBe(0);
      expect(await evidenceCount(test.repository, next.workspaceId)).toBe(
        next.workspaceId === seed.workspaceId ? 1 : 0
      );
    }
  );

  it('allows a new plan, cell, and revision to supersede the same semantic target', async () => {
    const test = harness();
    const seed = candidate({
      suffix: 'seed-compatible',
      artifacts: [artifact(0, 4)],
    });
    const completed = await test.coordinator.promote({ candidate: seed });
    expect(completed.status).toBe('completed');
    if (completed.status !== 'completed') return;
    test.resetPortCalls();

    const next = candidate({
      suffix: 'next-compatible',
      artifacts: [artifact(0, 4)],
      workspaceRevision: seed.workspaceRevision + 1,
      planDigest: sha('replacement-plan'),
      cellId: 'cell:replacement',
    });
    const superseded = await test.coordinator.promote({
      candidate: next,
      supersedes: completed.promotion.evidenceId,
    });

    expect(superseded.status).toBe('completed');
    expect(test.portCalls()).toBe(1);
    expect(await evidenceCount(test.repository)).toBe(2);
  });
});
