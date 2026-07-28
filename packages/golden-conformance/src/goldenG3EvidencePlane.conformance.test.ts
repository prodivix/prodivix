import { describe, expect, it } from 'vitest';
import {
  createVerificationEvidenceManifest,
  createVerificationEvidenceVerifiedView,
  digestVerificationValue,
  projectVerificationEvidenceManifest,
  type VerificationAttestationClaimSet,
  type VerificationEvidenceCandidate,
} from '@prodivix/verification';
import {
  GOLDEN_G3_V5_CELL,
  createGoldenG3V5Candidate,
  createGoldenG3V5EvidenceHarness,
  createGoldenG3V5PromotionAttestation,
  createGoldenG3V5VerifiedView,
  evaluateGoldenG3V5Closure,
  projectGoldenG3V5Evidence,
  promoteGoldenG3V5Candidate,
  type GoldenG3V5AttestationClaimsMutation,
  type GoldenG3V5EvidenceViewState,
} from './goldenG3EvidencePlaneFixture';

type GoldenG3V5IdentityDrift = 'revision' | 'policy' | 'target';

const repeatedVectorDigest = (character: string): string =>
  `sha256-${character.repeat(64)}`;

const createTypeScriptGoCanonicalCandidate =
  (): VerificationEvidenceCandidate => {
    const resultWithoutDigest = Object.freeze({
      outcome: 'passed' as const,
      summary: Object.freeze({
        decimal: 1.25,
        integer: 9_007_199_254_740_991,
        tiny: 0.000001,
        é: 'café',
        '😀': '雪',
      }),
      diagnosticCodes: Object.freeze([]),
      appliedExemptionIds: Object.freeze([]),
    });
    const sourceTraces = Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'verification-plan-cell' as const,
          planDigest: repeatedVectorDigest('d'),
          cellId: 'cell-vector',
        }),
        label: '向量',
      }),
    ]);
    const body = Object.freeze({
      candidateId: 'candidate-vector',
      projectId: 'project-vector',
      workspaceId: 'workspace-vector',
      workspaceRevision: 0,
      partitionRevisions: Object.freeze({
        workspaceRev: 0,
        routeRev: 0,
        opSeq: 0,
        documentRevisions: Object.freeze({}),
      }),
      executableSnapshotDigest: repeatedVectorDigest('a'),
      policyRevision: 0,
      policyDigest: repeatedVectorDigest('b'),
      impactDigest: repeatedVectorDigest('c'),
      planDigest: repeatedVectorDigest('d'),
      policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
      cellId: 'cell-vector',
      checkId: 'check-vector',
      checkKind: 'unit' as const,
      targetId: 'target-vector',
      attemptId: 'attempt-vector',
      run: Object.freeze({
        runId: 'run-vector',
        providerId: 'provider-vector',
        surface: 'preview' as const,
        frameworkTarget: 'react-vite',
        runtimeZone: 'browser',
        viewport: Object.freeze({
          id: 'viewport-vector',
          width: 1_280,
          height: 720,
        }),
        devicePixelRatio: 1.25,
        colorScheme: 'dark' as const,
        motion: 'reduced' as const,
        locale: 'zh-CN',
        timezone: 'Asia/Shanghai',
        fontSetDigest: repeatedVectorDigest('e'),
      }),
      timing: Object.freeze({
        startedAt: '2026-07-28T00:00:00.000Z',
        completedAt: '2026-07-28T00:00:01.250Z',
        durationMs: 1_250,
      }),
      result: Object.freeze({
        ...resultWithoutDigest,
        normalizedResultDigest: digestVerificationValue(resultWithoutDigest),
      }),
      provenance: Object.freeze({
        origin: 'local' as const,
        producerId: 'producer-vector',
        providerId: 'provider-vector',
        issuedAt: '2026-07-28T00:00:01.250Z',
        expiresAt: '2026-07-29T00:00:00.000Z',
      }),
      toolchain: Object.freeze({
        packageName: '@prodivix/vector',
        packageVersion: '1.2.3',
        buildDigest: repeatedVectorDigest('f'),
        toolchainDigest: repeatedVectorDigest('1'),
        schemaDigest: repeatedVectorDigest('2'),
      }),
      normalization: Object.freeze({
        packageName: '@prodivix/verification-normalizer',
        packageVersion: '1.0.0',
        buildDigest: repeatedVectorDigest('9'),
        toolchainDigest: repeatedVectorDigest('a'),
        schemaDigest: repeatedVectorDigest('b'),
      }),
      controls: Object.freeze({
        profileDigest: repeatedVectorDigest('3'),
        appliedDigest: repeatedVectorDigest('4'),
      }),
      inputs: Object.freeze({
        executableSnapshotDigest: repeatedVectorDigest('a'),
        fixtureSetDigests: Object.freeze([]),
        inputDigest: repeatedVectorDigest('5'),
      }),
      artifacts: Object.freeze([
        Object.freeze({
          id: 'artifact-vector',
          path: 'traces/vector.json',
          stagingArtifactId: 'staging-vector',
          kind: 'trace' as const,
          expectedDigest: repeatedVectorDigest('6'),
          expectedSize: 128,
          expectedMediaType: 'application/json',
          sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
        }),
      ]),
      sourceTraces,
      sourceTraceDigest: digestVerificationValue(sourceTraces),
      dependencyLockDigest: repeatedVectorDigest('7'),
      redaction: Object.freeze({
        policyId: 'redaction-vector',
        scannerSetDigest: repeatedVectorDigest('8'),
        droppedFieldCounts: Object.freeze({ 字段: 1 }),
        targetPolicy: Object.freeze({
          authority: 'verification-policy' as const,
          policyDigest: repeatedVectorDigest('b'),
          semanticTargetId: 'target-vector',
          capture: 'allowed' as const,
        }),
        safe: true as const,
      }),
      requestedRetention: 'session' as const,
      promotion: Object.freeze({
        idempotencyKey: 'idempotency-key-1',
        deadline: '2026-07-28T00:10:00.000Z',
      }),
    } satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>);
    return Object.freeze({
      ...body,
      candidateDigest: digestVerificationValue(body),
    });
  };

const driftGoldenG3V5Candidate = (
  candidate: VerificationEvidenceCandidate,
  drift: GoldenG3V5IdentityDrift
): VerificationEvidenceCandidate => {
  const { candidateDigest: _candidateDigest, ...base } = candidate;
  const drifted =
    drift === 'revision'
      ? Object.freeze({
          ...base,
          workspaceRevision: base.workspaceRevision + 1,
          partitionRevisions: Object.freeze({
            ...base.partitionRevisions,
            workspaceRev: base.partitionRevisions.workspaceRev + 1,
          }),
        })
      : drift === 'policy'
        ? Object.freeze({
            ...base,
            policyRevision: base.policyRevision + 1,
            policyDigest: digestVerificationValue({
              golden: 'g3-v5',
              drift,
            }),
            redaction: Object.freeze({
              ...base.redaction,
              targetPolicy: Object.freeze({
                ...base.redaction.targetPolicy,
                policyDigest: digestVerificationValue({
                  golden: 'g3-v5',
                  drift,
                }),
              }),
            }),
          })
        : Object.freeze({
            ...base,
            targetId: `${base.targetId}:drifted`,
            redaction: Object.freeze({
              ...base.redaction,
              targetPolicy: Object.freeze({
                ...base.redaction.targetPolicy,
                semanticTargetId: `${base.targetId}:drifted`,
              }),
            }),
          });
  return Object.freeze({
    ...drifted,
    candidateDigest: digestVerificationValue(drifted),
  });
};

const attestationClaimMutationCases: readonly Readonly<{
  name: string;
  mutate: GoldenG3V5AttestationClaimsMutation;
}>[] = Object.freeze([
  {
    name: 'revision',
    mutate: (claims) =>
      Object.freeze({
        ...claims,
        workspaceRevision: claims.workspaceRevision + 1,
      }),
  },
  {
    name: 'policy-bound statement',
    mutate: (claims) =>
      Object.freeze({
        ...claims,
        statementDigest: digestVerificationValue({
          golden: 'g3-v5',
          drift: 'policy',
        }),
      }),
  },
  {
    name: 'target',
    mutate: (claims) =>
      Object.freeze({
        ...claims,
        targetId: `${claims.targetId}:swapped`,
      }),
  },
  {
    name: 'CI commit',
    mutate: (claims): VerificationAttestationClaimSet =>
      claims.trust === 'ci-attested'
        ? Object.freeze({
            ...claims,
            ci: Object.freeze({
              ...claims.ci,
              commit: `sha1-${'b'.repeat(40)}`,
            }),
          })
        : claims,
  },
]);

describe('Golden G3 V5 Evidence plane', () => {
  it('pins the TypeScript current-model vector consumed by the Go canonical boundary', () => {
    const candidate = createTypeScriptGoCanonicalCandidate();
    const artifacts = [
      {
        id: 'artifact-vector',
        path: 'traces/vector.json',
        kind: 'trace' as const,
        digest: repeatedVectorDigest('6'),
        normalizedDigest: repeatedVectorDigest('0'),
        sourceTraceDigest: digestVerificationValue(candidate.sourceTraces[0]),
        size: 128,
        mediaType: 'application/json',
      },
    ];
    const created = createVerificationEvidenceManifest({
      candidate,
      evidenceId: 'evidence-vector',
      createdAt: '2026-07-28T00:00:02.000Z',
      artifacts,
    });
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    const evidence = projectVerificationEvidenceManifest(created.manifest);
    expect(candidate.result.normalizedResultDigest).toBe(
      'sha256-1e1a99c065d83f3b54e6223fe879e1c793190c62c17c215d215a17d9cc9f5be1'
    );
    expect({
      candidateDigest: candidate.candidateDigest,
      statementDigest: created.manifest.statementDigest,
      manifestDigest: created.manifest.manifestDigest,
      materializedEvidenceDigest: digestVerificationValue(evidence),
    }).toEqual({
      candidateDigest:
        'sha256-546c6aced448edd5fbbd1904c53664d5f64854e2ee8f0745692ef35d79337478',
      statementDigest:
        'sha256-09721ff3fe0e28fd60825c3f260df03c7ab1f2be326d65d8e45846114a0e41c4',
      manifestDigest:
        'sha256-4db6a4d29e043cc9b3c08d6655674794162020d8d6a183c8b8ca522424cff09c',
      materializedEvidenceDigest:
        'sha256-b847fa4da1a1434a0263566c2f5be8ff73558a85f28bb0ef688f5f10f9af376d',
    });
  });

  it.each([
    ['unsafe integer', { invalid: Number.MAX_SAFE_INTEGER + 1 }],
    ['unpaired surrogate', { invalid: '\ud800' }],
  ] as const)(
    'rejects a TypeScript %s before it can drift at the Go canonical boundary',
    (_name, summary) => {
      const candidate = createTypeScriptGoCanonicalCandidate();
      const { candidateDigest: _candidateDigest, ...base } = candidate;
      const { normalizedResultDigest: _normalizedResultDigest, ...baseResult } =
        base.result;
      const resultWithoutDigest = Object.freeze({
        ...baseResult,
        summary: Object.freeze(summary),
      });
      const body = Object.freeze({
        ...base,
        result: Object.freeze({
          ...resultWithoutDigest,
          normalizedResultDigest: digestVerificationValue(resultWithoutDigest),
        }),
      });
      const invalidCandidate = Object.freeze({
        ...body,
        candidateDigest: digestVerificationValue(body),
      });
      expect(
        createVerificationEvidenceManifest({
          candidate: invalidCandidate,
          evidenceId: 'evidence-invalid-vector',
          createdAt: '2026-07-28T00:00:02.000Z',
          artifacts: [],
        })
      ).toMatchObject({ status: 'invalid', reasonCode: 'VER-5001' });
    }
  );

  it('retains CI-attested failed then passed attempts and derives unstable Closure', async () => {
    const { coordinator, repository } = createGoldenG3V5EvidenceHarness();
    const failedCandidate = createGoldenG3V5Candidate('failed', 1);
    const passedCandidate = createGoldenG3V5Candidate(
      'passed',
      2,
      failedCandidate.attemptId
    );

    const failed = await promoteGoldenG3V5Candidate(
      coordinator,
      failedCandidate
    );
    const passed = await promoteGoldenG3V5Candidate(
      coordinator,
      passedCandidate
    );
    const stored = await repository.listEvidence({
      workspaceId: failedCandidate.workspaceId,
      planDigest: failedCandidate.planDigest,
      cellId: failedCandidate.cellId,
    });

    expect(stored).toHaveLength(2);
    expect(stored.map(({ evidence }) => evidence.result.outcome)).toEqual([
      'failed',
      'passed',
    ]);
    expect(stored.map(({ statement }) => statement.attemptId)).toEqual([
      failedCandidate.attemptId,
      passedCandidate.attemptId,
    ]);
    expect(stored.map(({ verifiedProvenance }) => verifiedProvenance)).toEqual([
      expect.objectContaining({
        kind: 'attested',
        claims: expect.objectContaining({
          trust: 'ci-attested',
          ci: expect.objectContaining({
            repository: 'github:prodivix/prodivix',
            ref: 'refs/heads/main',
            commit: `sha1-${'a'.repeat(40)}`,
          }),
        }),
      }),
      expect.objectContaining({
        kind: 'attested',
        claims: expect.objectContaining({ trust: 'ci-attested' }),
      }),
    ]);
    expect(stored[1]?.evidence.run.parentAttemptId).toBe(
      failedCandidate.attemptId
    );

    const evidence = projectGoldenG3V5Evidence([
      failed.evidence,
      passed.evidence,
    ]);
    const verified = createGoldenG3V5VerifiedView(evidence, 'active');
    const closure = evaluateGoldenG3V5Closure(
      evidence,
      verified.view,
      verified.revokedEvidenceIds
    );

    expect(closure, JSON.stringify(closure)).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'unsatisfied',
        cellStatuses: { [GOLDEN_G3_V5_CELL.id]: 'unstable' },
      },
    });
    expect(evidence.map(({ provenance }) => provenance.trust)).toEqual([
      'ci-attested',
      'ci-attested',
    ]);
  });

  it('converges concurrent and restarted finalize calls on one Evidence', async () => {
    const {
      repository,
      coordinator: firstCoordinator,
      restartedCoordinator,
    } = createGoldenG3V5EvidenceHarness();
    const candidate = createGoldenG3V5Candidate('passed', 3);

    const [first, restarted] = await Promise.all([
      promoteGoldenG3V5Candidate(firstCoordinator, candidate),
      promoteGoldenG3V5Candidate(restartedCoordinator, candidate),
    ]);
    const stored = await repository.listEvidence({
      workspaceId: candidate.workspaceId,
      planDigest: candidate.planDigest,
      cellId: candidate.cellId,
    });

    expect(first.evidence.statement.evidenceId).toBe(
      restarted.evidence.statement.evidenceId
    );
    expect(first.evidence.manifestDigest).toBe(
      restarted.evidence.manifestDigest
    );
    expect(first.promotion.state).toBe('completed');
    expect(restarted.promotion.state).toBe('completed');
    expect(stored).toHaveLength(1);
    expect(
      await repository.getArtifactReferenceCount(
        first.evidence.evidence.artifacts[0]!.digest
      )
    ).toBe(1);
  });

  it.each<GoldenG3V5EvidenceViewState>(['expired', 'revoked'])(
    'makes Closure stale immediately when the verified view marks Evidence %s',
    async (state) => {
      const { coordinator } = createGoldenG3V5EvidenceHarness();
      const candidate = createGoldenG3V5Candidate('passed', 4);
      const promoted = await promoteGoldenG3V5Candidate(coordinator, candidate);
      const evidence = projectGoldenG3V5Evidence([promoted.evidence]);
      const verified = createGoldenG3V5VerifiedView(evidence, state);
      const closure = evaluateGoldenG3V5Closure(
        evidence,
        verified.view,
        verified.revokedEvidenceIds
      );

      expect(closure, JSON.stringify(closure)).toMatchObject({
        status: 'ready',
        closure: {
          verdict: 'stale',
          cellStatuses: { [GOLDEN_G3_V5_CELL.id]: 'stale' },
          evidenceDigests: [],
        },
      });
    }
  );

  it.each<GoldenG3V5IdentityDrift>(['revision', 'policy', 'target'])(
    'does not reuse %s-drifted CI Evidence for the current Plan cell',
    async (drift) => {
      const { coordinator } = createGoldenG3V5EvidenceHarness();
      const candidate = driftGoldenG3V5Candidate(
        createGoldenG3V5Candidate('passed', 5),
        drift
      );
      const promoted = await promoteGoldenG3V5Candidate(coordinator, candidate);
      const evidence = projectGoldenG3V5Evidence([promoted.evidence]);
      const verified = createGoldenG3V5VerifiedView(evidence, 'active');
      const closure = evaluateGoldenG3V5Closure(
        evidence,
        verified.view,
        verified.revokedEvidenceIds
      );

      expect(closure, JSON.stringify(closure)).toMatchObject({
        status: 'ready',
        closure: {
          verdict: 'stale',
          cellStatuses: { [GOLDEN_G3_V5_CELL.id]: 'stale' },
          evidenceDigests: [],
        },
      });
    }
  );

  it.each(attestationClaimMutationCases)(
    'rejects a verifier that swaps the signed $name identity',
    async ({ mutate }) => {
      const { coordinator, repository } =
        createGoldenG3V5EvidenceHarness(mutate);
      const candidate = createGoldenG3V5Candidate('passed', 5);
      const result = await coordinator.promote({
        candidate,
        attestation: createGoldenG3V5PromotionAttestation(candidate),
      });

      expect(result).toMatchObject({
        status: 'invalid',
        reasonCode: 'VER-5003',
      });
      expect(
        await repository.listEvidence({
          workspaceId: candidate.workspaceId,
          planDigest: candidate.planDigest,
          cellId: candidate.cellId,
        })
      ).toEqual([]);
    }
  );

  it('binds one candidate identity to one idempotent promotion payload', async () => {
    const { coordinator, repository } = createGoldenG3V5EvidenceHarness();
    const candidate = createGoldenG3V5Candidate('passed', 5);
    await promoteGoldenG3V5Candidate(coordinator, candidate);
    const { candidateDigest: _candidateDigest, ...base } = candidate;
    if (base.provenance.origin !== 'ci' || !base.provenance.ci) {
      throw new Error('Golden V5 candidate must have CI provenance.');
    }
    const swappedWithoutDigest = Object.freeze({
      ...base,
      provenance: Object.freeze({
        ...base.provenance,
        ci: Object.freeze({
          ...base.provenance.ci,
          commit: `sha1-${'b'.repeat(40)}`,
        }),
      }),
    });
    const swapped = Object.freeze({
      ...swappedWithoutDigest,
      candidateDigest: digestVerificationValue(swappedWithoutDigest),
    });

    const replay = await coordinator.promote({
      candidate: swapped,
      attestation: createGoldenG3V5PromotionAttestation(swapped),
    });
    expect(replay).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5001',
    });
    expect(
      await repository.listEvidence({
        workspaceId: candidate.workspaceId,
        planDigest: candidate.planDigest,
        cellId: candidate.cellId,
      })
    ).toHaveLength(1);
  });

  it('rejects a Backend view that swaps the durable manifest identity', async () => {
    const { coordinator } = createGoldenG3V5EvidenceHarness();
    const first = await promoteGoldenG3V5Candidate(
      coordinator,
      createGoldenG3V5Candidate('passed', 5)
    );
    const second = await promoteGoldenG3V5Candidate(
      coordinator,
      createGoldenG3V5Candidate('passed', 6)
    );
    const [firstEvidence, secondEvidence] = projectGoldenG3V5Evidence([
      first.evidence,
      second.evidence,
    ]);
    const originalView = createGoldenG3V5VerifiedView(
      [firstEvidence!],
      'active'
    );
    const { recordDigest: _recordDigest, ...originalRecord } =
      originalView.view.records[0]!;
    const swappedView = createVerificationEvidenceVerifiedView({
      closureEvaluationInstant: originalView.view.closureEvaluationInstant,
      revocationRecordDigest: originalView.view.revocationRecordDigest,
      records: [
        {
          ...originalRecord,
          manifestDigest: secondEvidence!.manifestDigest,
        },
      ],
    });

    expect(
      evaluateGoldenG3V5Closure([firstEvidence!], swappedView, [])
    ).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-6002',
    });
  });
});
