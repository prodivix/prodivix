import { describe, expect, it } from 'vitest';
import {
  applyVerificationRunEvent,
  createVerificationRunEvent,
  createVerificationRunSnapshot,
  projectVerificationRunSummary,
} from './verificationRun';
import {
  decodeVerificationRunEvent,
  decodeVerificationRunSnapshot,
  encodeVerificationRunEvent,
  encodeVerificationRunSnapshot,
} from './verificationRunCodec';
import { digestVerificationValue } from './verificationCanonical';
import type {
  VerificationCheckKind,
  VerificationPlan,
  VerificationPlanCell,
} from './verification.types';
import type {
  VerificationRunEventInput,
  VerificationRunSnapshot,
} from './verificationRun.types';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const cellsByCheckKind = (): Record<VerificationCheckKind, number> => ({
  diagnostics: 1,
  build: 1,
  unit: 0,
  integration: 0,
  e2e: 0,
  visual: 0,
  accessibility: 0,
  performance: 0,
  security: 0,
});

const planCell = (
  id: string,
  checkKind: 'diagnostics' | 'build',
  dependencyCellIds: readonly string[]
): VerificationPlanCell =>
  Object.freeze({
    id,
    checkId: `check-${checkKind}`,
    checkKind,
    targetId: `target-${checkKind}`,
    targetPolicy: Object.freeze({
      authority: 'verification-policy',
      policyDigest: digest('b'),
      semanticTargetId: `target-${checkKind}`,
      capture: 'allowed',
    }),
    frameworkTarget: 'react-vite',
    surface: 'ci',
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'full',
    locale: 'en-US',
    controlProfileRef: Object.freeze({
      kind: 'preset',
      presetId: 'controlled',
      digest: digest('c'),
    }),
    adapter: Object.freeze({
      adapterId: `adapter-${checkKind}`,
      descriptorDigest: digest('d'),
      toolchainDigest: digest('e'),
      capabilityDigest: digest('f'),
    }),
    requirement: 'required',
    policyRuleIds: Object.freeze(['rule-required']),
    appliedExemptionIds: Object.freeze([]),
    retryPolicy: Object.freeze({
      id: 'retry-once',
      maximumAttempts: 1,
      retryableOutcomes: Object.freeze([]),
      stabilitySamples: 1,
      freshFixtureNamespace: true,
    }),
    evidenceRequirements: Object.freeze({
      acceptedTrust: Object.freeze(['ci-attested'] as const),
      maximumAgeMs: 60_000,
      requireAttestation: true,
      requireCompatibleIdentity: true,
      requiredArtifactKinds: Object.freeze([]),
    }),
    resources: Object.freeze([]),
    inputKinds: Object.freeze(['executable-snapshot'] as const),
    artifactKinds: Object.freeze([] as const),
    estimatedCost: Object.freeze({
      durationMs: 100,
      artifactBytes: 0,
      computeUnits: 1,
    }),
    preflight: Object.freeze({ status: 'supported' }),
    dependencyCellIds: Object.freeze([...dependencyCellIds]),
    inputDigest: digest(checkKind === 'build' ? '2' : '1'),
  });

const verificationPlan = (): VerificationPlan => {
  const cells = Object.freeze([
    planCell('cell-build', 'build', ['cell-diagnostics']),
    planCell('cell-diagnostics', 'diagnostics', []),
  ]);
  const withoutDigest = {
    status: 'ready' as const,
    workspaceId: 'workspace-1',
    targetRevision: 7,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 7,
      routeRev: 2,
      opSeq: 9,
      documentRevisions: Object.freeze({}),
    }),
    scenarioRegistryDigest: digest('a'),
    policyRevision: 3,
    policyDigest: digest('b'),
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: false,
    }),
    policyEvaluationInstant: '2026-07-31T00:00:00.000Z',
    impactDigest: digest('3'),
    semanticSchemaDigest: digest('4'),
    providerSetDigest: digest('5'),
    compilerDigest: digest('6'),
    plannerDigest: digest('7'),
    adapterRegistryDigest: digest('8'),
    cells,
    issues: Object.freeze([]),
    explanations: Object.freeze([
      Object.freeze({
        cellId: 'cell-build',
        checkId: 'check-build',
        targetId: 'target-build',
        status: 'selected' as const,
        impactPathIds: Object.freeze([]),
        policyRuleIds: Object.freeze(['rule-required']),
        messages: Object.freeze(['Required by policy.']),
      }),
      Object.freeze({
        cellId: 'cell-diagnostics',
        checkId: 'check-diagnostics',
        targetId: 'target-diagnostics',
        status: 'selected' as const,
        impactPathIds: Object.freeze([]),
        policyRuleIds: Object.freeze(['rule-required']),
        messages: Object.freeze(['Required by policy.']),
      }),
    ]),
    budget: Object.freeze({
      cells: 2,
      cellsByCheckKind: Object.freeze(cellsByCheckKind()),
      targetExpansions: 2,
      browserExpansions: 0,
      closureEvidenceRecords: 2,
      totalMs: 200,
      artifactBytes: 0,
      estimatedComputeUnits: 2,
      maximumParallelism: 1,
      overBudgetDimensions: Object.freeze([]),
    }),
  };
  return Object.freeze({
    ...withoutDigest,
    planDigest: digestVerificationValue(withoutDigest),
  });
};

const runSnapshot = (): VerificationRunSnapshot =>
  createVerificationRunSnapshot({
    runId: 'run-1',
    plan: verificationPlan(),
    surface: 'ci',
    scope: 'required',
    providerId: 'provider-ci',
    origin: 'ci',
    ci: {
      repository: 'prodivix/prodivix',
      ref: 'refs/heads/main',
      commit: `sha1-${'a'.repeat(40)}`,
    },
    selectedCellIds: ['cell-diagnostics', 'cell-build'],
    attemptIdByCellId: {
      'cell-build': 'attempt-build-1',
      'cell-diagnostics': 'attempt-diagnostics-1',
    },
    createdAt: '2026-07-31T00:00:01.000Z',
  });

type VerificationRunEventDetails =
  VerificationRunEventInput extends infer TInput
    ? TInput extends VerificationRunEventInput
      ? Omit<TInput, 'eventId' | 'runId' | 'cursor' | 'occurredAt'>
      : never
    : never;

const event = (cursor: number, input: VerificationRunEventDetails) =>
  createVerificationRunEvent({
    ...input,
    eventId: `event-${String(cursor)}`,
    runId: 'run-1',
    cursor,
    occurredAt: `2026-07-31T00:00:${String(cursor + 1).padStart(2, '0')}.000Z`,
  } as VerificationRunEventInput);

const apply = (
  snapshot: VerificationRunSnapshot,
  next: ReturnType<typeof createVerificationRunEvent>
): VerificationRunSnapshot => {
  const result = applyVerificationRunEvent(snapshot, next);
  expect(result.status).toBe('applied');
  if (result.status !== 'applied') throw new Error(result.message);
  return result.snapshot;
};

describe('Verification run state machine', () => {
  it('binds one surface, dependency-closed cells, attempts, CI identity, and digest', () => {
    const snapshot = runSnapshot();
    expect(snapshot.selectedCellIds).toEqual([
      'cell-build',
      'cell-diagnostics',
    ]);
    expect(snapshot.cells.map(({ cellId }) => cellId)).toEqual(
      snapshot.selectedCellIds
    );
    expect(snapshot.status).toBe('queued');
    expect(snapshot.snapshotDigest).toMatch(/^sha256-[a-f0-9]{64}$/u);

    expect(() =>
      createVerificationRunSnapshot({
        runId: 'run-missing-dependency',
        plan: verificationPlan(),
        surface: 'ci',
        scope: 'cell',
        providerId: 'provider-ci',
        origin: 'cli',
        selectedCellIds: ['cell-build'],
        attemptIdByCellId: { 'cell-build': 'attempt-build-1' },
        createdAt: '2026-07-31T00:00:01.000Z',
      })
    ).toThrow(/dependency/u);
  });

  it('reduces ordered attempt, promotion, terminal, and Closure events', () => {
    let snapshot = runSnapshot();
    snapshot = apply(snapshot, event(1, { kind: 'run-started' }));
    snapshot = apply(
      snapshot,
      event(2, {
        kind: 'cell-started',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
      })
    );
    snapshot = apply(
      snapshot,
      event(3, {
        kind: 'cell-reported',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
        outcome: 'passed',
        candidateDigest: digest('9'),
      })
    );
    snapshot = apply(
      snapshot,
      event(4, {
        kind: 'cell-promoted',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
        candidateDigest: digest('9'),
        evidenceId: 'evidence-diagnostics-1',
      })
    );
    snapshot = apply(
      snapshot,
      event(5, {
        kind: 'cell-started',
        cellId: 'cell-build',
        attemptId: 'attempt-build-1',
      })
    );
    snapshot = apply(
      snapshot,
      event(6, {
        kind: 'cell-reported',
        cellId: 'cell-build',
        attemptId: 'attempt-build-1',
        outcome: 'passed',
        candidateDigest: digest('0'),
      })
    );
    snapshot = apply(snapshot, event(7, { kind: 'run-completed' }));
    snapshot = apply(
      snapshot,
      event(8, {
        kind: 'closure-evaluated',
        closureDigest: digest('a'),
        verdict: 'satisfied',
      })
    );

    expect(projectVerificationRunSummary(snapshot)).toMatchObject({
      status: 'completed',
      total: 2,
      passed: 2,
      promoted: 1,
      closureDigest: digest('a'),
      closureVerdict: 'satisfied',
    });
  });

  it('rejects out-of-order cursors and reports interrupted active cells', () => {
    const initial = runSnapshot();
    expect(
      applyVerificationRunEvent(initial, event(2, { kind: 'run-started' }))
    ).toMatchObject({ status: 'rejected', code: 'VER-4002' });

    let snapshot = apply(initial, event(1, { kind: 'run-started' }));
    snapshot = apply(
      snapshot,
      event(2, {
        kind: 'cell-started',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
      })
    );
    snapshot = apply(
      snapshot,
      event(3, {
        kind: 'run-interrupted',
        reasonCode: 'VER-5004',
      })
    );
    expect(snapshot.status).toBe('interrupted');
    expect(snapshot.cells.every(({ status }) => status === 'interrupted')).toBe(
      true
    );
  });

  it('does not report a partially passed cancelled run as completed', () => {
    let snapshot = runSnapshot();
    snapshot = apply(snapshot, event(1, { kind: 'run-started' }));
    snapshot = apply(
      snapshot,
      event(2, {
        kind: 'cell-started',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
      })
    );
    snapshot = apply(
      snapshot,
      event(3, {
        kind: 'cell-reported',
        cellId: 'cell-diagnostics',
        attemptId: 'attempt-diagnostics-1',
        outcome: 'passed',
        candidateDigest: digest('9'),
      })
    );
    snapshot = apply(
      snapshot,
      event(4, {
        kind: 'run-cancel-requested',
        reason: 'operator-request',
      })
    );
    snapshot = apply(snapshot, event(5, { kind: 'run-completed' }));

    expect(snapshot.status).toBe('cancelled');
    expect(projectVerificationRunSummary(snapshot)).toMatchObject({
      status: 'cancelled',
      passed: 1,
      cancelled: 1,
    });
  });
});

describe('Verification run wire codecs', () => {
  it('round-trips canonical snapshots and events', () => {
    const snapshot = runSnapshot();
    const snapshotDecoded = decodeVerificationRunSnapshot(
      encodeVerificationRunSnapshot(snapshot)
    );
    expect(snapshotDecoded).toEqual({ ok: true, value: snapshot });

    const started = event(1, { kind: 'run-started' });
    const eventDecoded = decodeVerificationRunEvent(
      encodeVerificationRunEvent(started)
    );
    expect(eventDecoded).toEqual({ ok: true, value: started });
  });

  it('fails closed on unknown credential-bearing fields and digest drift', () => {
    expect(
      decodeVerificationRunSnapshot({
        ...encodeVerificationRunSnapshot(runSnapshot()),
        token: 'must-not-cross-the-contract',
      }).ok
    ).toBe(false);
    expect(
      decodeVerificationRunEvent({
        ...encodeVerificationRunEvent(event(1, { kind: 'run-started' })),
        eventDigest: digest('f'),
      }).ok
    ).toBe(false);
  });
});
