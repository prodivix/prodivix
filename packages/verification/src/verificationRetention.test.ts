import { describe, expect, it } from 'vitest';
import type { VerificationEvidence } from './verification.types';
import { digestVerificationValue } from './verificationCanonical';
import {
  assessVerificationEvidenceAcceptance,
  createVerificationEvidenceVerifiedView,
  validateVerificationEvidenceSupersessions,
  validateVerificationEvidenceVerifiedView,
  type CreateVerificationEvidenceVerifiedViewInput,
} from './verificationRetention';
import {
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceVerifiedView,
} from './verificationEvidenceVerifiedViewCodec';
import { MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS } from './verificationPlannerGraph';

const sha = (hex: string): string => `sha256-${hex.repeat(64)}`;

const REVOCATION_VIEW_DIGEST = digestVerificationValue({
  revocationView: 'test',
});

const createVerifiedView = (
  input: Omit<
    CreateVerificationEvidenceVerifiedViewInput,
    'revocationRecordDigest'
  >
) =>
  createVerificationEvidenceVerifiedView({
    ...input,
    revocationRecordDigest: REVOCATION_VIEW_DIGEST,
  });

const evidence = (
  id: string,
  overrides: Partial<VerificationEvidence> = {}
): VerificationEvidence => {
  const { manifestDigest: _manifestDigest, ...normalizedOverrides } = overrides;
  const manifest = {
    id,
    projectId: 'project:verification',
    workspaceId: 'workspace:verification',
    workspaceRevision: 7,
    partitionRevisions: {
      workspaceRev: 7,
      routeRev: 3,
      opSeq: 11,
      documentRevisions: {},
    },
    executableSnapshotDigest: 'sha256-executable',
    scenario: {
      id: 'scenario:checkout',
      revision: 2,
      digest: 'sha256-scenario',
      programDigest: 'sha256-program',
    },
    policyRevision: 4,
    policyDigest: 'sha256-policy',
    impactDigest: 'sha256-impact',
    planDigest: 'sha256-plan',
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    cellId: 'cell:checkout',
    checkId: 'check:e2e',
    checkKind: 'e2e' as const,
    targetId: 'target:react-vite',
    attemptId: `attempt:${id}`,
    run: {
      runId: `run:${id}`,
      providerId: 'ci',
      surface: 'ci' as const,
      frameworkTarget: 'react-vite',
      runtimeZone: 'browser',
      browserEngine: 'chromium' as const,
      viewport: { id: 'desktop', width: 1_440, height: 900 },
      devicePixelRatio: 2,
      colorScheme: 'dark' as const,
      motion: 'reduced' as const,
      locale: 'en-US',
      timezone: 'Etc/UTC',
      fontSetDigest: sha('c'),
      sandboxImageDigest: sha('d'),
    },
    timing: {
      startedAt: '2026-07-28T00:00:01.000Z',
      completedAt: '2026-07-28T00:00:02.000Z',
      durationMs: 1_000,
    },
    result: {
      outcome: 'passed' as const,
      normalizedResultDigest: 'sha256-result',
      summary: { passed: true },
      diagnosticCodes: [],
      appliedExemptionIds: [],
    },
    provenance: {
      trust: 'ci-attested' as const,
      producerId: 'github-actions',
      attestationDigest: sha('a'),
      issuedAt: '2026-07-28T00:00:02.000Z',
      ci: {
        repository: 'prodivix/prodivix',
        ref: 'refs/heads/main',
        commit: `sha1-${'a'.repeat(40)}`,
      },
    },
    toolchain: {
      packageName: '@prodivix/browser-adapter',
      packageVersion: '4.2.1',
      buildDigest: 'sha256-build',
      toolchainDigest: 'sha256-toolchain',
      schemaDigest: 'sha256-schema',
    },
    normalization: {
      packageName: '@prodivix/verification',
      packageVersion: '0.0.1',
      buildDigest: sha('e'),
      toolchainDigest: sha('f'),
      schemaDigest: sha('0'),
    },
    controls: {
      profileDigest: 'sha256-controls',
      appliedDigest: 'sha256-applied-controls',
    },
    inputs: {
      executableSnapshotDigest: 'sha256-executable',
      scenarioProgramDigest: 'sha256-program',
      fixtureSetDigests: ['sha256-fixture'],
      inputDigest: 'sha256-input',
    },
    artifacts: [
      {
        id: 'artifact:trace',
        path: 'traces/trace.json',
        kind: 'trace' as const,
        digest: sha('b'),
        size: 20,
        mediaType: 'application/json',
      },
    ],
    sourceTraceDigest: 'sha256-source-trace',
    dependencyLockDigest: 'sha256-lock',
    redactionPolicyId: 'redaction:v1',
    targetPolicy: {
      authority: 'verification-policy' as const,
      policyDigest: 'sha256-policy',
      semanticTargetId: 'target:react-vite',
      capture: 'allowed' as const,
    },
    createdAt: '2026-07-28T00:00:02.000Z',
    retention: 'change' as const,
    ...normalizedOverrides,
  };
  return {
    ...manifest,
    manifestDigest: digestVerificationValue(manifest),
  } as VerificationEvidence;
};

const viewRecord = (
  candidate: VerificationEvidence,
  overrides: Partial<
    CreateVerificationEvidenceVerifiedViewInput['records'][number]
  > = {}
): CreateVerificationEvidenceVerifiedViewInput['records'][number] => ({
  evidenceId: candidate.id,
  manifestDigest: candidate.manifestDigest,
  materializedEvidenceDigest: digestVerificationValue(candidate),
  effectiveTrust: 'ci-attested',
  trustStatus: 'verified',
  attestationDigest: sha('a'),
  retentionState: 'active',
  revocationRecordDigests: [],
  artifacts: candidate.artifacts.map((artifact) => ({
    artifactId: artifact.id,
    digest: artifact.digest,
    status: 'available',
  })),
  ...overrides,
});

describe('Verification Evidence verified retention view', () => {
  it('shares the Core closure Evidence record limit across current and wire views', () => {
    const candidate = evidence('evidence:boundary');
    const baseRecord = viewRecord(candidate);
    const records = Array.from(
      { length: MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS },
      (_, index) => ({
        ...baseRecord,
        evidenceId: `evidence:boundary:${index}`,
      })
    );
    const view = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records,
    });
    expect(view.records).toHaveLength(
      MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS
    );
    const wire = encodeVerificationEvidenceVerifiedView(view);
    expect(decodeVerificationEvidenceVerifiedView(wire)).toMatchObject({
      ok: true,
    });

    expect(() =>
      createVerifiedView({
        closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
        records: [...records, baseRecord],
      })
    ).toThrow(
      `Verification Evidence view cannot contain more than ${MAXIMUM_VERIFICATION_CLOSURE_EVIDENCE_RECORDS} records.`
    );
    expect(
      decodeVerificationEvidenceVerifiedView({
        ...wire,
        records: [
          ...wire.records,
          {
            ...wire.records[0]!,
            evidenceId: 'evidence:boundary:overflow',
          },
        ],
      })
    ).toMatchObject({ ok: false });
  }, 15_000);

  it('normalizes record, artifact, and revocation ordering into stable digests', () => {
    const left = evidence('evidence:left', {
      artifacts: [
        {
          id: 'artifact:z',
          path: 'traces/z.json',
          kind: 'trace',
          digest: sha('c'),
          size: 1,
          mediaType: 'application/json',
        },
        {
          id: 'artifact:a',
          path: 'logs/a.txt',
          kind: 'build-log',
          digest: sha('d'),
          size: 1,
          mediaType: 'text/plain',
        },
      ],
    });
    const right = evidence('evidence:right');
    const first = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [
        viewRecord(right),
        viewRecord(left, {
          trustStatus: 'revoked',
          revocationRecordDigests: [sha('f'), sha('e'), sha('f')],
          artifacts: [
            {
              artifactId: 'artifact:z',
              digest: sha('c'),
              status: 'available',
            },
            {
              artifactId: 'artifact:a',
              digest: sha('d'),
              status: 'available',
            },
          ],
        }),
      ],
    });
    const second = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [
        viewRecord(left, {
          trustStatus: 'revoked',
          revocationRecordDigests: [sha('e'), sha('f')],
          artifacts: [
            {
              artifactId: 'artifact:a',
              digest: sha('d'),
              status: 'available',
            },
            {
              artifactId: 'artifact:z',
              digest: sha('c'),
              status: 'available',
            },
          ],
        }),
        viewRecord(right),
      ],
    });
    expect(second.viewDigest).toBe(first.viewDigest);
    expect(first.revocationRecordDigest).toBe(REVOCATION_VIEW_DIGEST);
    expect(
      createVerificationEvidenceVerifiedView({
        closureEvaluationInstant: first.closureEvaluationInstant,
        revocationRecordDigest: digestVerificationValue({
          revocationView: 'different',
        }),
        records: first.records.map(
          ({ recordDigest: _recordDigest, ...record }) => record
        ),
      }).viewDigest
    ).not.toBe(first.viewDigest);
    expect(first.records.map(({ evidenceId }) => evidenceId)).toEqual([
      'evidence:left',
      'evidence:right',
    ]);
    expect(validateVerificationEvidenceVerifiedView(first).status).toBe(
      'ready'
    );
  });

  it('rejects tampered record and aggregate digests', () => {
    const candidate = evidence('evidence:one');
    const view = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [viewRecord(candidate)],
    });
    expect(
      validateVerificationEvidenceVerifiedView({
        ...view,
        records: [
          {
            ...view.records[0]!,
            retentionState: 'tombstoned',
            tombstoneDigest: sha('1'),
          },
        ],
      }).status
    ).toBe('invalid');
    expect(
      validateVerificationEvidenceVerifiedView({
        ...view,
        viewDigest: 'sha256-tampered',
      }).status
    ).toBe('invalid');
    expect(
      validateVerificationEvidenceVerifiedView({
        ...view,
        unexpected: true,
      } as unknown as typeof view).status
    ).toBe('invalid');
    expect(() =>
      createVerifiedView({
        closureEvaluationInstant: view.closureEvaluationInstant,
        records: [
          {
            ...viewRecord(candidate),
            trustStatus: 'trusted' as never,
          },
        ],
      })
    ).toThrow(/record is invalid/u);
    expect(() =>
      createVerifiedView({
        closureEvaluationInstant: view.closureEvaluationInstant,
        records: [
          {
            ...viewRecord(candidate),
            materializedEvidenceDigest: 'sha256-short',
          },
        ],
      })
    ).toThrow(/materialized evidence digest is invalid/u);
  });

  it('derives tombstone, supersession, revocation, expiry, and availability states', () => {
    const candidate = evidence('evidence:one');
    const instant = '2026-07-28T00:00:05.000Z';
    const assess = (
      overrides: Partial<
        CreateVerificationEvidenceVerifiedViewInput['records'][number]
      >
    ) => {
      const view = createVerifiedView({
        closureEvaluationInstant: instant,
        records: [viewRecord(candidate, overrides)],
      });
      return assessVerificationEvidenceAcceptance(
        candidate,
        view.records[0]!,
        instant
      ).status;
    };
    expect(assess({})).toBe('acceptable');
    expect(
      assess({
        retentionState: 'tombstoned',
        tombstoneDigest: sha('1'),
      })
    ).toBe('tombstoned');
    expect(
      assess({
        trustStatus: 'revoked',
        revocationRecordDigests: [sha('2')],
      })
    ).toBe('revoked');
    expect(
      assess({
        trustStatus: 'expired',
      })
    ).toBe('expired');
    expect(
      assess({
        retentionExpiresAt: instant,
      })
    ).toBe('expired');
    expect(
      assess({
        artifacts: [
          {
            artifactId: 'artifact:trace',
            digest: sha('b'),
            status: 'deleted',
          },
        ],
      })
    ).toBe('artifact-unavailable');

    const unattested = evidence('evidence:unattested', {
      provenance: {
        trust: 'local-unattested',
        producerId: 'local',
        issuedAt: '2026-07-28T00:00:02.000Z',
      },
    });
    const mismatchedAttestation = createVerifiedView({
      closureEvaluationInstant: instant,
      records: [
        viewRecord(unattested, {
          effectiveTrust: 'local-unattested',
          attestationDigest: sha('3'),
        }),
      ],
    });
    expect(
      assessVerificationEvidenceAcceptance(
        unattested,
        mismatchedAttestation.records[0]!,
        instant
      ).status
    ).toBe('invalid');
  });

  it('accepts only explicit acyclic supersession in the same semantic lineage', () => {
    const previous = evidence('evidence:previous');
    const next = evidence('evidence:next', {
      timing: {
        startedAt: '2026-07-28T00:00:03.000Z',
        completedAt: '2026-07-28T00:00:04.000Z',
        durationMs: 1_000,
      },
    });
    const view = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [
        viewRecord(previous, { supersededByEvidenceId: next.id }),
        viewRecord(next),
      ],
    });
    expect(
      validateVerificationEvidenceSupersessions([previous, next], view)
    ).toBeUndefined();
    expect(
      assessVerificationEvidenceAcceptance(
        previous,
        view.records.find(({ evidenceId }) => evidenceId === previous.id)!,
        view.closureEvaluationInstant
      ).status
    ).toBe('superseded');

    const changedMatrix = evidence('evidence:changed-matrix', {
      planDigest: 'sha256-plan-next',
      cellId: 'cell:checkout:next',
      scenario: {
        id: 'scenario:checkout-next',
        revision: 3,
        digest: 'sha256-scenario-next',
        programDigest: 'sha256-program-next',
      },
      run: {
        ...next.run,
        surface: 'preview',
        frameworkTarget: 'vue-vite',
        browserEngine: 'firefox',
      },
      controls: {
        profileDigest: 'sha256-controls-next',
        appliedDigest: 'sha256-applied-controls-next',
      },
      timing: next.timing,
    });
    const changedMatrixView = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [
        viewRecord(previous, { supersededByEvidenceId: changedMatrix.id }),
        viewRecord(changedMatrix),
      ],
    });
    expect(
      validateVerificationEvidenceSupersessions(
        [previous, changedMatrix],
        changedMatrixView
      )
    ).toBeUndefined();

    for (const differentLineage of [
      evidence('evidence:other-check', {
        checkId: 'check:other',
        timing: next.timing,
      }),
      evidence('evidence:other-kind', {
        checkKind: 'visual',
        timing: next.timing,
      }),
      evidence('evidence:other-target', {
        targetId: 'target:vue-vite',
        targetPolicy: {
          ...next.targetPolicy,
          semanticTargetId: 'target:vue-vite',
        },
        timing: next.timing,
      }),
    ]) {
      const invalid = createVerifiedView({
        closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
        records: [
          viewRecord(previous, {
            supersededByEvidenceId: differentLineage.id,
          }),
          viewRecord(differentLineage),
        ],
      });
      expect(
        validateVerificationEvidenceSupersessions(
          [previous, differentLineage],
          invalid
        )
      ).toContain('lineage');
    }
  });

  it('does not infer supersession from a later retry', () => {
    const failed = evidence('evidence:failed', {
      result: {
        outcome: 'failed',
        normalizedResultDigest: 'sha256-failed',
        summary: null,
        diagnosticCodes: [],
        appliedExemptionIds: [],
      },
    });
    const passed = evidence('evidence:passed', {
      timing: {
        startedAt: '2026-07-28T00:00:03.000Z',
        completedAt: '2026-07-28T00:00:04.000Z',
        durationMs: 1_000,
      },
    });
    const view = createVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:05.000Z',
      records: [viewRecord(failed), viewRecord(passed)],
    });
    expect(view.records.every((record) => !record.supersededByEvidenceId)).toBe(
      true
    );
    expect(
      validateVerificationEvidenceSupersessions([failed, passed], view)
    ).toBeUndefined();
  });
});
