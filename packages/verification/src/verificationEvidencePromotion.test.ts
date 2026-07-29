import { describe, expect, it } from 'vitest';
import {
  createVerificationAttestationClaimsDigest,
  createVerificationAttestationClaimSet,
  createVerificationAttestationProofDigest,
  createVerificationEvidenceStatementDigest,
  verifyVerificationEvidenceAttestation,
} from './verificationAttestation';
import {
  decodeVerificationEvidenceManifest,
  encodeVerificationEvidenceManifest,
  verificationEvidenceManifestWireSchema,
} from './verificationEvidenceManifestCodec';
import {
  decodeVerificationEvidenceVerifiedView,
  encodeVerificationEvidenceVerifiedView,
  verificationEvidenceVerifiedViewWireSchema,
} from './verificationEvidenceVerifiedViewCodec';
import {
  createVerificationEvidencePromotionCoordinator,
  type VerificationEvidenceArtifactPromotionPort,
} from './verificationEvidencePromotion';
import {
  createInMemoryVerificationEvidenceRepository,
  type VerificationEvidenceRepository,
} from './verificationEvidenceRepository';
import {
  digestVerificationValue,
  uniqueVerificationText,
} from './verificationCanonical';
import { evaluateVerificationClosure } from './verificationClosure';
import {
  createVerificationEvidenceCoreDigest,
  createVerificationEvidenceManifest,
  createVerificationEvidenceStatementForCandidate,
  projectVerificationEvidenceManifest,
} from './verificationEvidenceManifest';
import { normalizeVerificationCheckReport } from './verificationEvidenceNormalization';
import {
  createVerificationAdapterRegistration,
  createVerificationAdapterRegistrySnapshot,
} from './verificationAdapterRegistry';
import { createVerificationAdapterInputDigest } from './verificationAdapterInputDigest';
import { createVerificationEvidenceVerifiedView } from './verificationRetention';
import type {
  EvaluateVerificationClosureInput,
  VerificationCheckKind,
  VerificationEvidenceCandidate,
  VerificationPlan,
} from './verification.types';

const sha = (label: string): string => digestVerificationValue(label);

const UNIT_ADAPTER_REGISTRATION = createVerificationAdapterRegistration(
  Object.freeze({
    id: 'adapter:unit',
    implementation: Object.freeze({
      packageName: '@prodivix/verification-test-adapter',
      packageVersion: '1.0.0',
      buildDigest: sha('build'),
      toolchainDigest: sha('toolchain'),
      schemaDigest: sha('adapter-schema'),
    }),
    checkKinds: Object.freeze(['unit'] as const),
    surfaces: Object.freeze(['preview'] as const),
    targets: Object.freeze(['react-vite']),
    browserEngines: Object.freeze(['chromium'] as const),
    controlCapabilities: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze(['screenshot'] as const),
    budgets: Object.freeze({
      maximumDurationMs: 10_000,
      maximumArtifactBytes: 1024,
      maximumEvents: 100,
    }),
    trustInputs: Object.freeze(['local-unattested'] as const),
  }),
  Object.freeze({ runtimeZones: Object.freeze(['browser']) })
);
const UNIT_ADAPTER_REGISTRY = createVerificationAdapterRegistrySnapshot([
  UNIT_ADAPTER_REGISTRATION,
]);

const createPlan = (
  options: Readonly<{
    capture?: 'allowed' | 'masked' | 'forbidden-sensitive';
    successfulRetention?: 'session' | 'change' | 'release';
    failedRetention?: 'session' | 'change' | 'release';
  }> = {}
): VerificationPlan => {
  const cell = Object.freeze({
    id: 'cell:unit',
    checkId: 'check:unit',
    checkKind: 'unit' as const,
    targetId: 'target:react-vite',
    targetPolicy: Object.freeze({
      authority: 'verification-policy' as const,
      policyDigest: sha('policy'),
      semanticTargetId: 'target:react-vite',
      capture: options.capture ?? 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'preview' as const,
    browserEngine: 'chromium' as const,
    viewport: Object.freeze({ id: 'desktop', width: 1_440, height: 900 }),
    colorScheme: 'light' as const,
    motion: 'full' as const,
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset' as const,
      presetId: 'control:default',
      digest: sha('control-profile'),
    }),
    adapter: Object.freeze({
      ...UNIT_ADAPTER_REGISTRATION.identity,
    }),
    requirement: 'required' as const,
    policyRuleIds: Object.freeze(['rule:unit']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry:unit',
      maximumAttempts: 2,
      retryableOutcomes: Object.freeze(['infrastructure-error'] as const),
      stabilitySamples: 1,
      freshFixtureNamespace: true as const,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['local-unattested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: false,
      requireCompatibleIdentity: true as const,
      requiredArtifactKinds: Object.freeze(['screenshot'] as const),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze(['screenshot'] as const),
    estimatedCost: Object.freeze({
      durationMs: 1_000,
      artifactBytes: 4,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' as const }),
    dependencyCellIds: Object.freeze([]),
    inputDigest: sha('input'),
  });
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
      ).map((kind) => [kind, kind === 'unit' ? 1 : 0])
    ) as Record<VerificationCheckKind, number>
  );
  const withoutDigest = Object.freeze({
    status: 'ready' as const,
    workspaceId: 'workspace:v5',
    targetRevision: 7,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 7,
      routeRev: 3,
      opSeq: 19,
      documentRevisions: Object.freeze({}),
    }),
    scenarioRegistryDigest: sha('scenarios'),
    policyRevision: 2,
    policyDigest: sha('policy'),
    retentionRequest: Object.freeze({
      successful: options.successfulRetention ?? 'change',
      failed: options.failedRetention ?? 'session',
      protectReleaseEvidence: true,
    }),
    policyEvaluationInstant: '2026-07-28T00:00:00.000Z',
    impactDigest: sha('impact'),
    semanticSchemaDigest: sha('semantic'),
    providerSetDigest: sha('providers'),
    compilerDigest: sha('compiler'),
    plannerDigest: sha('planner'),
    adapterRegistryDigest: UNIT_ADAPTER_REGISTRY.snapshotDigest,
    cells: Object.freeze([cell]),
    issues: Object.freeze([]),
    explanations: Object.freeze([]),
    budget: Object.freeze({
      cells: 1,
      cellsByCheckKind,
      targetExpansions: 1,
      browserExpansions: 1,
      closureEvidenceRecords: 2,
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

const createCandidate = (
  plan: VerificationPlan
): VerificationEvidenceCandidate => {
  const resultWithoutDigest = Object.freeze({
    outcome: 'passed' as const,
    summary: Object.freeze({ assertions: 1 }),
    diagnosticCodes: Object.freeze([]),
    appliedExemptionIds: Object.freeze([]),
  });
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest: plan.planDigest,
        cellId: plan.cells[0]!.id,
      }),
      label: 'Unit verification cell',
    }),
  ]);
  const withoutDigest = Object.freeze({
    candidateId: 'candidate:unit:1',
    projectId: 'project:v5',
    workspaceId: plan.workspaceId,
    workspaceRevision: plan.targetRevision,
    partitionRevisions: plan.targetPartitionRevisions,
    executableSnapshotDigest: sha('snapshot'),
    policyRevision: plan.policyRevision,
    policyDigest: plan.policyDigest,
    impactDigest: plan.impactDigest,
    planDigest: plan.planDigest,
    policyEvaluationInstant: plan.policyEvaluationInstant,
    cellId: plan.cells[0]!.id,
    checkId: plan.cells[0]!.checkId,
    checkKind: plan.cells[0]!.checkKind,
    targetId: plan.cells[0]!.targetId,
    attemptId: 'attempt:unit:1',
    run: Object.freeze({
      runId: 'run:unit:1',
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
      buildDigest: sha('build'),
      toolchainDigest: plan.cells[0]!.adapter.toolchainDigest,
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
      executableSnapshotDigest: sha('snapshot'),
      fixtureSetDigests: Object.freeze([]),
      inputDigest: plan.cells[0]!.inputDigest,
    }),
    artifacts: Object.freeze([
      Object.freeze({
        id: 'artifact:screenshot',
        path: 'screenshots/unit.png',
        stagingArtifactId: 'staging:unit:1',
        kind: 'screenshot' as const,
        expectedDigest: sha('artifact-bytes'),
        expectedSize: 4,
        expectedMediaType: 'image/png',
        sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
      }),
    ]),
    sourceTraces,
    sourceTraceDigest: digestVerificationValue(sourceTraces),
    dependencyLockDigest: sha('lockfile'),
    redaction: Object.freeze({
      policyId: 'redaction:default',
      scannerSetDigest: sha('scanners'),
      droppedFieldCounts: Object.freeze({}),
      targetPolicy: plan.cells[0]!.targetPolicy,
      safe: true as const,
    }),
    requestedRetention: plan.retentionRequest.successful,
    promotion: Object.freeze({
      idempotencyKey: 'promotion:unit:1',
      deadline: '2026-07-28T00:01:00.000Z',
    }),
  } satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>);
  return Object.freeze({
    ...withoutDigest,
    candidateDigest: digestVerificationValue(withoutDigest),
  });
};

const normalizeCandidateForPlan = (
  plan: VerificationPlan,
  outcome: 'passed' | 'failed',
  _callerTargetPolicy?: Readonly<{
    authority: 'verification-policy';
    policyDigest: string;
    semanticTargetId: string;
    capture: 'allowed' | 'masked' | 'forbidden-sensitive';
  }>,
  reportOverride?: Readonly<Record<string, number | string>>
) => {
  const cell = plan.cells[0]!;
  const attemptId = `attempt:normalized:${outcome}`;
  const sourceTraces = Object.freeze([
    Object.freeze({
      sourceRef: Object.freeze({
        kind: 'verification-plan-cell' as const,
        planDigest: plan.planDigest,
        cellId: cell.id,
      }),
      label: 'Normalized unit verification cell',
    }),
  ]);
  const artifact = Object.freeze({
    id: 'artifact:screenshot',
    path: 'screenshots/normalized-unit.png',
    stagingArtifactId: `staging:normalized:${outcome}`,
    kind: 'screenshot' as const,
    expectedDigest: sha(`normalized-artifact:${outcome}`),
    expectedSize: 4,
    expectedMediaType: 'image/png',
    sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
  });
  const inputRefs = Object.freeze([
    Object.freeze({
      id: 'input:executable',
      kind: 'executable-snapshot' as const,
      digest: sha('snapshot'),
      size: 4,
      mediaType: 'application/octet-stream',
    }),
  ]);
  const inputCoordinates = Object.freeze({
    runtimeEnvironmentDigest: sha('runtime-environment'),
    executableSnapshotDigest: sha('snapshot'),
    controlProfileDigest: sha('control-profile'),
    fixtureSetDigests: Object.freeze([]),
    controlCapabilityIds: Object.freeze([]),
    controlCapabilitySnapshotDigest: sha('control-capabilities'),
    appliedControlDigest: sha('applied-controls'),
    inputRefs,
  });
  return normalizeVerificationCheckReport({
    projectId: 'project:v5',
    plan,
    adapterRegistry: UNIT_ADAPTER_REGISTRY,
    cellId: cell.id,
    context: Object.freeze({
      cell,
      attemptId,
      ...inputCoordinates,
      resolvedInputSetDigest:
        createVerificationAdapterInputDigest(inputCoordinates),
    }),
    report: Object.freeze({
      format: 'prodivix.verification-check-report-candidate',
      version: 1,
      cellId: cell.id,
      attemptId,
      checkKind: 'unit',
      inputDigest: cell.inputDigest,
      adapter: cell.adapter,
      tool: UNIT_ADAPTER_REGISTRATION.tool,
      terminal: Object.freeze({
        status: 'completed' as const,
        complete: true as const,
        exitCode: outcome === 'passed' ? 0 : 1,
      }),
      payload: Object.freeze({
        kind: 'unit' as const,
        suites: Object.freeze([
          Object.freeze({
            suiteId: 'suite:normalized',
            status:
              outcome === 'passed' ? ('passed' as const) : ('failed' as const),
            cases: Object.freeze([
              Object.freeze({
                caseId: 'case:normalized',
                status:
                  outcome === 'passed'
                    ? ('passed' as const)
                    : ('failed' as const),
                diagnosticCodes: Object.freeze([]),
                sourceTraceDigest: digestVerificationValue(sourceTraces[0]),
              }),
            ]),
          }),
        ]),
        ...(reportOverride ?? {}),
      }),
      artifacts: Object.freeze([
        Object.freeze({
          id: artifact.id,
          kind: artifact.kind,
          digest: artifact.expectedDigest,
          size: artifact.expectedSize,
          mediaType: artifact.expectedMediaType,
        }),
      ]),
      diagnosticCodes: Object.freeze([]),
    }),
    run: Object.freeze({
      runId: `run:normalized:${outcome}`,
      providerId: 'provider:local',
      runtimeZone: 'browser',
      operatingSystemIdentity: 'windows-x64',
      devicePixelRatio: 1,
      timezone: 'Asia/Shanghai',
      fontSetDigest: sha('fonts'),
    }),
    timing: Object.freeze({
      startedAt: '2026-07-28T00:00:00.000Z',
      completedAt: '2026-07-28T00:00:01.000Z',
      durationMs: 1_000,
    }),
    artifacts: Object.freeze([
      Object.freeze({
        id: artifact.id,
        path: artifact.path,
        sourceTraceDigest: artifact.sourceTraceDigest,
      }),
    ]),
    stagedArtifacts: Object.freeze([
      Object.freeze({
        id: artifact.id,
        stagingArtifactId: artifact.stagingArtifactId,
        kind: artifact.kind,
        digest: artifact.expectedDigest,
        size: artifact.expectedSize,
        mediaType: artifact.expectedMediaType,
      }),
    ]),
    sourceTraces,
    dependencyLockDigest: sha('lockfile'),
    provenance: Object.freeze({
      origin: 'local' as const,
      producerId: 'producer:local',
      providerId: 'provider:local',
      issuedAt: '2026-07-28T00:00:02.000Z',
      expiresAt: '2026-07-29T00:00:02.000Z',
    }),
    redaction: Object.freeze({
      policyId: 'redaction:default',
      scannerSetDigest: sha('scanners'),
      droppedFieldCounts: Object.freeze({}),
    }),
    promotion: Object.freeze({
      idempotencyKey: `promotion:normalized:${outcome}`,
      deadline: '2026-07-28T00:01:00.000Z',
    }),
  });
};

const artifactResult = (candidate: VerificationEvidenceCandidate) =>
  Object.freeze({
    status: 'accepted' as const,
    artifacts: Object.freeze(
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
    ),
  });

describe('Verification Evidence promotion and wire boundary', () => {
  it('derives retention and source-trace truth through Policy, Plan, Candidate, and Manifest', () => {
    const plan = createPlan({
      successfulRetention: 'release',
      failedRetention: 'session',
    });
    const passed = normalizeCandidateForPlan(plan, 'passed');
    const failed = normalizeCandidateForPlan(plan, 'failed');
    expect(passed.status).toBe('ready');
    expect(failed.status).toBe('ready');
    if (passed.status !== 'ready' || failed.status !== 'ready') return;
    expect(passed.candidate.requestedRetention).toBe('release');
    expect(failed.candidate.requestedRetention).toBe('session');
    expect(passed.candidate.redaction.targetPolicy).toEqual(
      plan.cells[0]!.targetPolicy
    );
    expect(passed.candidate.sourceTraceDigest).toBe(
      digestVerificationValue(passed.candidate.sourceTraces)
    );
    expect(
      normalizeCandidateForPlan(plan, 'passed', undefined, {
        unsafeInteger: Number.MAX_SAFE_INTEGER + 1,
      })
    ).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/report/payload/unsafeInteger',
        }),
      ]),
    });
    expect(
      normalizeCandidateForPlan(plan, 'passed', undefined, {
        invalidUnicode: '\ud800',
      })
    ).toMatchObject({
      status: 'invalid',
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: '/report/payload',
        }),
      ]),
    });

    const created = createVerificationEvidenceManifest({
      candidate: passed.candidate,
      evidenceId: 'evidence:normalized:passed',
      createdAt: '2026-07-28T00:00:03.000Z',
      artifacts: artifactResult(passed.candidate).artifacts,
    });
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    expect(created.manifest.evidence).toMatchObject({
      retention: 'release',
      sourceTraces: passed.candidate.sourceTraces,
      sourceTraceDigest: passed.candidate.sourceTraceDigest,
      artifacts: [
        {
          sourceTraceDigest: passed.candidate.artifacts[0]!.sourceTraceDigest,
        },
      ],
    });
    expect(created.manifest.statement).toMatchObject({
      candidateDigest: passed.candidate.candidateDigest,
      sourceTraceDigest: passed.candidate.sourceTraceDigest,
      artifacts: [
        {
          sourceTraceDigest: passed.candidate.artifacts[0]!.sourceTraceDigest,
        },
      ],
    });
    expect(created.manifest.statement.evidenceCoreDigest).toBe(
      createVerificationEvidenceCoreDigest(
        passed.candidate.candidateDigest,
        (() => {
          const { provenance: _provenance, ...core } =
            created.manifest.evidence;
          return core;
        })()
      )
    );
  });

  it('rejects legacy retention overrides instead of escalating normalized session Evidence', async () => {
    const plan = createPlan({ successfulRetention: 'session' });
    const normalized = normalizeCandidateForPlan(plan, 'passed');
    expect(normalized.status).toBe('ready');
    if (normalized.status !== 'ready') return;
    const candidate = normalized.candidate;
    expect(candidate.requestedRetention).toBe('session');
    const artifacts = artifactResult(candidate).artifacts;

    for (const retention of ['release', 'legal-hold'] as const) {
      expect(
        createVerificationEvidenceManifest({
          candidate,
          evidenceId: `evidence:legacy:${retention}`,
          createdAt: '2026-07-28T00:00:03.000Z',
          artifacts,
          retention,
        } as unknown as Parameters<
          typeof createVerificationEvidenceManifest
        >[0])
      ).toMatchObject({ status: 'invalid', reasonCode: 'VER-5001' });
    }

    let artifactCalls = 0;
    const coordinator = createVerificationEvidencePromotionCoordinator({
      repository: createInMemoryVerificationEvidenceRepository({
        now: () => '2026-07-28T00:00:03.000Z',
        allocatePromotionId: () => 'promotion:legacy',
        allocateEvidenceId: () => 'evidence:legacy',
      }),
      artifactPromotion: Object.freeze({
        async promoteCandidateArtifacts() {
          artifactCalls += 1;
          return artifactResult(candidate);
        },
      }),
    });
    for (const retention of ['release', 'legal-hold'] as const) {
      await expect(
        coordinator.promote({
          candidate,
          retention,
        } as unknown as Parameters<typeof coordinator.promote>[0])
      ).resolves.toMatchObject({
        status: 'invalid',
        reasonCode: 'VER-5001',
      });
    }
    expect(artifactCalls).toBe(0);
  });

  it('persists exact CI repository identity through claims and durable Evidence', async () => {
    const plan = createPlan();
    const local = createCandidate(plan);
    const { candidateDigest: _candidateDigest, ...base } = local;
    const ci = Object.freeze({
      repository: 'prodivix/prodivix',
      ref: 'refs/heads/main',
      commit: `sha1-${'a'.repeat(40)}`,
    });
    const candidateWithoutDigest = Object.freeze({
      ...base,
      run: Object.freeze({
        ...base.run,
        providerId: 'provider:ci',
        surface: 'ci' as const,
      }),
      provenance: Object.freeze({
        origin: 'ci' as const,
        producerId: 'producer:ci',
        providerId: 'provider:ci',
        issuedAt: '2026-07-28T00:00:02.000Z',
        expiresAt: '2026-07-28T00:05:00.000Z',
        ci,
      }),
    } satisfies Omit<VerificationEvidenceCandidate, 'candidateDigest'>);
    const candidate = Object.freeze({
      ...candidateWithoutDigest,
      candidateDigest: digestVerificationValue(candidateWithoutDigest),
    });
    const artifacts = artifactResult(candidate).artifacts;
    const manifestInput = Object.freeze({
      candidate,
      evidenceId: 'evidence:ci:1',
      createdAt: '2026-07-28T00:00:03.000Z',
      artifacts,
    });
    const statement = createVerificationEvidenceStatementForCandidate(
      manifestInput,
      artifacts
    );
    const expected = Object.freeze({
      trust: 'ci-attested' as const,
      issuer: 'https://token.actions.example.test',
      audience: 'prodivix-verification',
      subject: 'repo:prodivix/prodivix:ref:refs/heads/main',
      nonce: 'ci-promotion-nonce',
      policyGeneration: 1,
      verificationInstant: '2026-07-28T00:00:03.000Z',
      maximumLifetimeMs: 60_000,
      statement,
    });
    const claims = createVerificationAttestationClaimSet({
      expected,
      issuedAt: '2026-07-28T00:00:02.000Z',
      notBefore: '2026-07-28T00:00:02.000Z',
      expiresAt: '2026-07-28T00:01:00.000Z',
    });
    const attestation = await verifyVerificationEvidenceAttestation({
      expected,
      proof: Uint8Array.from([1]),
      verifier: {
        async verify() {
          return {
            kind: 'verified',
            claims: Object.freeze({
              ...claims,
              claimsDigest: createVerificationAttestationClaimsDigest(claims),
              proofDigest: createVerificationAttestationProofDigest(
                Uint8Array.from([1])
              ),
              algorithm: 'Ed25519',
              keyId: 'ci-key-1',
              verifierId: 'ci.test',
              verifierVersion: '1.0.0',
              verifiedAt: expected.verificationInstant,
            }),
          };
        },
      },
    });
    expect(attestation.status).toBe('verified');
    if (attestation.status !== 'verified') return;
    const created = createVerificationEvidenceManifest({
      ...manifestInput,
      verifiedClaims: attestation.claims,
    });
    expect(created.status).toBe('ready');
    if (created.status !== 'ready') return;
    expect(created.manifest.verifiedProvenance).toMatchObject({
      kind: 'attested',
      claims: { trust: 'ci-attested', ci },
    });
    expect(created.manifest.evidence.provenance).toMatchObject({
      trust: 'ci-attested',
      ci,
    });
    const wire = encodeVerificationEvidenceManifest(created.manifest);
    expect(decodeVerificationEvidenceManifest(wire)).toMatchObject({
      ok: true,
      value: {
        evidence: { provenance: { trust: 'ci-attested', ci } },
      },
    });

    const missingArtifactPath = structuredClone(wire) as unknown as {
      statement: { artifacts: { path?: string }[] };
    };
    delete missingArtifactPath.statement.artifacts[0]!.path;
    expect(decodeVerificationEvidenceManifest(missingArtifactPath).ok).toBe(
      false
    );

    const crossTrust = structuredClone(wire) as unknown as {
      evidence: { provenance: { trust: string } };
    };
    crossTrust.evidence.provenance.trust = 'remote-attested';
    expect(decodeVerificationEvidenceManifest(crossTrust).ok).toBe(false);

    const forgedArtifactTrace = structuredClone(wire) as unknown as {
      wireVersion: number;
      manifestDigest: string;
      statementDigest: string;
      statement: {
        artifacts: { sourceTraceDigest?: string }[];
      };
      evidence: {
        artifacts: { sourceTraceDigest?: string }[];
      };
      [key: string]: unknown;
    };
    const forgedSourceTraceDigest = sha('forged-artifact-source-trace');
    forgedArtifactTrace.statement.artifacts[0]!.sourceTraceDigest =
      forgedSourceTraceDigest;
    forgedArtifactTrace.evidence.artifacts[0]!.sourceTraceDigest =
      forgedSourceTraceDigest;
    forgedArtifactTrace.statementDigest =
      createVerificationEvidenceStatementDigest(
        forgedArtifactTrace.statement as unknown as Parameters<
          typeof createVerificationEvidenceStatementDigest
        >[0]
      );
    const {
      wireVersion: _forgedWireVersion,
      manifestDigest: _forgedManifestDigest,
      ...forgedArtifactTraceBody
    } = forgedArtifactTrace;
    forgedArtifactTrace.manifestDigest = digestVerificationValue(
      forgedArtifactTraceBody
    );
    expect(decodeVerificationEvidenceManifest(forgedArtifactTrace).ok).toBe(
      false
    );

    const forgedArtifactPath = structuredClone(wire) as unknown as {
      wireVersion: number;
      manifestDigest: string;
      statementDigest: string;
      statement: {
        artifacts: { path: string }[];
      };
      evidence: {
        artifacts: { path: string }[];
      };
      [key: string]: unknown;
    };
    forgedArtifactPath.statement.artifacts[0]!.path =
      'screenshots/forged-unit.png';
    forgedArtifactPath.evidence.artifacts[0]!.path =
      'screenshots/forged-unit.png';
    forgedArtifactPath.statementDigest =
      createVerificationEvidenceStatementDigest(
        forgedArtifactPath.statement as unknown as Parameters<
          typeof createVerificationEvidenceStatementDigest
        >[0]
      );
    const {
      wireVersion: _forgedPathWireVersion,
      manifestDigest: _forgedPathManifestDigest,
      ...forgedArtifactPathBody
    } = forgedArtifactPath;
    forgedArtifactPath.manifestDigest = digestVerificationValue(
      forgedArtifactPathBody
    );
    expect(decodeVerificationEvidenceManifest(forgedArtifactPath).ok).toBe(
      false
    );
  });

  it('converges deterministic concurrent/restarted promotion and closes a real projected manifest', async () => {
    const plan = createPlan();
    const candidate = createCandidate(plan);
    const repository = createInMemoryVerificationEvidenceRepository({
      now: () => '2026-07-28T00:00:03.000Z',
      allocatePromotionId: () => 'promotion:server:1',
      allocateEvidenceId: () => 'evidence:server:1',
    });
    let artifactCalls = 0;
    let releaseArtifacts!: () => void;
    const artifactBarrier = new Promise<void>((resolve) => {
      releaseArtifacts = resolve;
    });
    const artifactPromotion: VerificationEvidenceArtifactPromotionPort =
      Object.freeze({
        async promoteCandidateArtifacts(value) {
          artifactCalls += 1;
          if (artifactCalls === 2) releaseArtifacts();
          await artifactBarrier;
          return artifactResult(value);
        },
      });
    let finalizeCalls = 0;
    let releaseFinalize!: () => void;
    const finalizeBarrier = new Promise<void>((resolve) => {
      releaseFinalize = resolve;
    });
    const racingRepository: VerificationEvidenceRepository = Object.freeze({
      ...repository,
      async finalizePromotion(input) {
        finalizeCalls += 1;
        if (finalizeCalls === 2) releaseFinalize();
        await finalizeBarrier;
        return repository.finalizePromotion(input);
      },
    });
    const first = createVerificationEvidencePromotionCoordinator({
      repository: racingRepository,
      artifactPromotion,
    });
    const restarted = createVerificationEvidencePromotionCoordinator({
      repository: racingRepository,
      artifactPromotion,
    });

    const [left, right] = await Promise.all([
      first.promote({ candidate }),
      restarted.promote({ candidate }),
    ]);
    expect(left.status).toBe('completed');
    expect(right.status).toBe('completed');
    if (left.status !== 'completed' || right.status !== 'completed') return;
    expect(left.evidence.manifestDigest).toBe(right.evidence.manifestDigest);
    expect(
      await repository.listEvidence({ workspaceId: plan.workspaceId })
    ).toHaveLength(1);
    expect(
      await repository.getArtifactReferenceCount(
        left.evidence.evidence.artifacts[0]!.digest
      )
    ).toBe(1);

    const replay = await restarted.promote({ candidate });
    expect(replay).toMatchObject({
      status: 'completed',
      evidence: { manifestDigest: left.evidence.manifestDigest },
    });
    expect(artifactCalls).toBe(2);

    const projected = projectVerificationEvidenceManifest(left.evidence);
    expect(projected).toMatchObject({
      checkKind: candidate.checkKind,
      targetId: candidate.targetId,
      run: {
        viewport: candidate.run.viewport,
        devicePixelRatio: candidate.run.devicePixelRatio,
        colorScheme: candidate.run.colorScheme,
        motion: candidate.run.motion,
        locale: candidate.run.locale,
        timezone: candidate.run.timezone,
        fontSetDigest: candidate.run.fontSetDigest,
      },
      normalization: candidate.normalization,
      targetPolicy: candidate.redaction.targetPolicy,
    });
    expect(left.evidence.statement).toMatchObject({
      checkKind: candidate.checkKind,
      targetId: candidate.targetId,
      execution: {
        viewport: candidate.run.viewport,
        devicePixelRatio: candidate.run.devicePixelRatio,
        colorScheme: candidate.run.colorScheme,
        motion: candidate.run.motion,
        locale: candidate.run.locale,
        timezone: candidate.run.timezone,
        fontSetDigest: candidate.run.fontSetDigest,
      },
      normalizationDigest: digestVerificationValue(candidate.normalization),
      targetPolicyDigest: digestVerificationValue(
        candidate.redaction.targetPolicy
      ),
    });
    const revocationRecordDigest = sha('revocation-view');
    const verifiedView = createVerificationEvidenceVerifiedView({
      closureEvaluationInstant: '2026-07-28T00:00:04.000Z',
      revocationRecordDigest,
      records: [
        {
          evidenceId: projected.id,
          manifestDigest: projected.manifestDigest,
          materializedEvidenceDigest: digestVerificationValue(projected),
          effectiveTrust: projected.provenance.trust,
          trustStatus: 'verified',
          retentionState: 'active',
          revocationRecordDigests: [],
          artifacts: projected.artifacts.map((artifact) => ({
            artifactId: artifact.id,
            digest: artifact.digest,
            status: 'available' as const,
          })),
        },
      ],
    });
    const closureInput: EvaluateVerificationClosureInput = {
      plan,
      evidence: [projected],
      verifiedEvidenceView: verifiedView,
      closureEvaluationInstant: verifiedView.closureEvaluationInstant,
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
      baselineSetDigests: [],
      toolchainSetDigest: digestVerificationValue(
        uniqueVerificationText(
          plan.cells.map(({ adapter }) => adapter.toolchainDigest)
        )
      ),
      revocationRecordDigest,
      revokedEvidenceIds: [],
    };
    expect(evaluateVerificationClosure(closureInput)).toMatchObject({
      status: 'ready',
      closure: {
        verdict: 'satisfied',
        cellStatuses: { 'cell:unit': 'passed' },
      },
    });
    expect(
      evaluateVerificationClosure({
        ...closureInput,
        evidence: [
          {
            ...projected,
            run: { ...projected.run, timezone: 'UTC' },
          },
        ],
      })
    ).toMatchObject({ status: 'invalid', reasonCode: 'VER-6002' });

    const manifestWire = encodeVerificationEvidenceManifest(left.evidence);
    expect(decodeVerificationEvidenceManifest(manifestWire)).toMatchObject({
      ok: true,
      value: { manifestDigest: left.evidence.manifestDigest },
    });
    const viewWire = encodeVerificationEvidenceVerifiedView(verifiedView);
    expect(decodeVerificationEvidenceVerifiedView(viewWire)).toMatchObject({
      ok: true,
      value: { viewDigest: verifiedView.viewDigest },
    });
    expect(
      decodeVerificationEvidenceManifest({
        ...manifestWire,
        unknown: true,
      }).ok
    ).toBe(false);
    const missingExecution = structuredClone(manifestWire) as Record<
      string,
      unknown
    >;
    delete (missingExecution.statement as Record<string, unknown>).execution;
    expect(decodeVerificationEvidenceManifest(missingExecution).ok).toBe(false);
    const forgedCore = structuredClone(manifestWire) as unknown as {
      wireVersion: number;
      manifestDigest: string;
      evidence: { policyRevision: number };
      [key: string]: unknown;
    };
    forgedCore.evidence.policyRevision += 1;
    const {
      wireVersion: _wireVersion,
      manifestDigest: _manifestDigest,
      ...forgedBody
    } = forgedCore;
    forgedCore.manifestDigest = digestVerificationValue(forgedBody);
    expect(decodeVerificationEvidenceManifest(forgedCore).ok).toBe(false);

    const tamperedTrace = structuredClone(manifestWire) as unknown as {
      evidence: { sourceTraces: { label?: string }[] };
    };
    tamperedTrace.evidence.sourceTraces[0]!.label = 'Tampered source trace';
    expect(decodeVerificationEvidenceManifest(tamperedTrace).ok).toBe(false);
    tamperedTrace.evidence.sourceTraces[0]!.label = '\ud800';
    expect(decodeVerificationEvidenceManifest(tamperedTrace).ok).toBe(false);
    const unsafeSummary = structuredClone(manifestWire) as unknown as {
      evidence: { result: { summary: unknown } };
    };
    unsafeSummary.evidence.result.summary = Number.MAX_SAFE_INTEGER + 1;
    expect(decodeVerificationEvidenceManifest(unsafeSummary).ok).toBe(false);
    expect(
      decodeVerificationEvidenceVerifiedView({
        ...viewWire,
        wireVersion: 2,
      }).ok
    ).toBe(false);
  });

  it('fails a forbidden-sensitive image target before artifact promotion', async () => {
    const plan = createPlan({ capture: 'forbidden-sensitive' });
    const normalized = normalizeCandidateForPlan(
      plan,
      'passed',
      Object.freeze({
        authority: 'verification-policy',
        policyDigest: plan.policyDigest,
        semanticTargetId: plan.cells[0]!.targetId,
        capture: 'allowed',
      })
    );
    expect(normalized.status).toBe('ready');
    if (normalized.status !== 'ready') return;
    const forbiddenCandidate = normalized.candidate;
    expect(forbiddenCandidate.redaction.targetPolicy).toEqual(
      plan.cells[0]!.targetPolicy
    );
    expect(forbiddenCandidate.redaction.targetPolicy.capture).toBe(
      'forbidden-sensitive'
    );
    expect(forbiddenCandidate.redaction.targetPolicy.capture).not.toBe(
      'allowed'
    );
    expect(
      createVerificationEvidenceManifest({
        candidate: forbiddenCandidate,
        evidenceId: 'evidence:server:direct-forbidden',
        createdAt: '2026-07-28T00:00:03.000Z',
        artifacts: artifactResult(forbiddenCandidate).artifacts,
      })
    ).toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5005',
    });
    const repository = createInMemoryVerificationEvidenceRepository({
      now: () => '2026-07-28T00:00:03.000Z',
      allocatePromotionId: () => 'promotion:server:forbidden',
      allocateEvidenceId: () => 'evidence:server:forbidden',
    });
    let artifactCalls = 0;
    const coordinator = createVerificationEvidencePromotionCoordinator({
      repository,
      artifactPromotion: Object.freeze({
        async promoteCandidateArtifacts() {
          artifactCalls += 1;
          return artifactResult(forbiddenCandidate);
        },
      }),
    });

    await expect(
      coordinator.promote({ candidate: forbiddenCandidate })
    ).resolves.toMatchObject({
      status: 'invalid',
      reasonCode: 'VER-5005',
    });
    expect(artifactCalls).toBe(0);
    await expect(
      repository.getPromotion('promotion:server:forbidden')
    ).resolves.toMatchObject({
      state: 'failed',
      failureCode: 'VER-5005',
    });
    await expect(
      repository.listEvidence({ workspaceId: plan.workspaceId })
    ).resolves.toEqual([]);
  });

  it('pins immutable manifest and verified-view schema digests', () => {
    expect(
      digestVerificationValue(verificationEvidenceManifestWireSchema)
    ).toBe(
      'sha256-9b908bfaf9654738fa880d0adc3b23b7298697e5bbbb4e0cb428ac75a381a338'
    );
    expect(
      digestVerificationValue(verificationEvidenceVerifiedViewWireSchema)
    ).toBe(
      'sha256-c78b135b221fbfc65e5762586a40792fb8ff5387f9b6be33818b60af60fe65ce'
    );
  });
});
