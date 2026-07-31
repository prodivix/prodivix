import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createVerificationRunEvent,
  decodeVerificationRunEvent,
  decodeVerificationRunSnapshot,
  digestVerificationValue,
  encodeVerificationPlan,
  encodeVerificationRunEvent,
  serializeVerificationValue,
  type VerificationCheckKind,
  type VerificationPlan,
} from '@prodivix/verification';
import {
  createVerificationCommand,
  resolveVerificationPromotionResumeStep,
} from './commands/verification.js';

const digest = (character: string): string => `sha256-${character.repeat(64)}`;

const planFixture = (): VerificationPlan => {
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
    workspaceId: 'workspace-cli',
    targetRevision: 9,
    targetPartitionRevisions: Object.freeze({
      workspaceRev: 9,
      routeRev: 2,
      opSeq: 11,
      documentRevisions: Object.freeze({}),
    }),
    scenarioRegistryDigest: digest('1'),
    policyRevision: 3,
    policyDigest: digest('2'),
    retentionRequest: Object.freeze({
      successful: 'change' as const,
      failed: 'session' as const,
      protectReleaseEvidence: false,
    }),
    policyEvaluationInstant: '2026-07-31T08:00:00Z',
    impactDigest: digest('3'),
    semanticSchemaDigest: digest('4'),
    providerSetDigest: digest('5'),
    compilerDigest: digest('6'),
    plannerDigest: digest('7'),
    adapterRegistryDigest: digest('8'),
    cells: Object.freeze([
      Object.freeze({
        id: 'cell-cli',
        checkId: 'check-cli',
        checkKind: 'e2e' as const,
        targetId: 'target-cli',
        targetPolicy: Object.freeze({
          authority: 'verification-policy' as const,
          policyDigest: digest('2'),
          semanticTargetId: 'target-cli',
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
        motion: 'reduced' as const,
        locale: 'en-US',
        controlProfileRef: Object.freeze({
          kind: 'preset' as const,
          presetId: 'control-ci',
          digest: digest('9'),
        }),
        adapter: Object.freeze({
          adapterId: 'adapter-ci',
          descriptorDigest: digest('a'),
          toolchainDigest: digest('b'),
          capabilityDigest: digest('c'),
        }),
        requirement: 'required' as const,
        policyRuleIds: Object.freeze(['rule-ci']),
        appliedExemptionIds: Object.freeze([]),
        retryPolicy: Object.freeze({
          id: 'retry-ci',
          maximumAttempts: 2,
          retryableOutcomes: Object.freeze(['infrastructure-error'] as const),
          stabilitySamples: 1,
          freshFixtureNamespace: true as const,
        }),
        evidenceRequirements: Object.freeze({
          acceptedTrust: Object.freeze(['ci-attested'] as const),
          maximumAgeMs: 86_400_000,
          requireAttestation: true,
          requireCompatibleIdentity: true as const,
          requiredArtifactKinds: Object.freeze([]),
        }),
        resources: Object.freeze([]),
        inputKinds: Object.freeze(['executable-snapshot'] as const),
        artifactKinds: Object.freeze([]),
        estimatedCost: Object.freeze({
          durationMs: 1_000,
          artifactBytes: 0,
          computeUnits: 1,
        }),
        preflight: Object.freeze({ status: 'supported' as const }),
        dependencyCellIds: Object.freeze([]),
        inputDigest: digest('d'),
      }),
    ]),
    issues: Object.freeze([]),
    explanations: Object.freeze([]),
    budget: Object.freeze({
      cells: 1,
      cellsByCheckKind,
      targetExpansions: 1,
      browserExpansions: 1,
      closureEvidenceRecords: 2,
      totalMs: 1_000,
      artifactBytes: 0,
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

const writeJson = (path: string, value: unknown): void => {
  writeFileSync(path, `${serializeVerificationValue(value)}\n`, 'utf8');
};

test('verify run emits strict snapshot JSON and versioned NDJSON', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-v7-'));
  try {
    const planPath = join(directory, 'plan.json');
    const statePath = join(directory, 'run.json');
    const journalPath = join(directory, 'events.ndjson');
    const summaryPath = join(directory, 'summary.json');
    writeJson(planPath, encodeVerificationPlan(planFixture()));
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'run',
      '--plan',
      planPath,
      '--surface',
      'ci',
      '--scope',
      'required',
      '--run-id',
      'run-cli-v7',
      '--provider',
      'provider-ci',
      '--at',
      '2026-07-31T08:00:00Z',
      '--state',
      statePath,
      '--journal',
      journalPath,
      '--output',
      summaryPath,
    ]);
    assert.equal(process.exitCode, 2);
    const snapshot = decodeVerificationRunSnapshot(
      JSON.parse(readFileSync(statePath, 'utf8')) as unknown
    );
    assert.equal(snapshot.ok, true);
    if (!snapshot.ok) return;
    assert.equal(snapshot.value.status, 'running');
    assert.equal(snapshot.value.cursor, 1);
    const journalLines = readFileSync(journalPath, 'utf8').trim().split('\n');
    assert.equal(journalLines.length, 1);
    assert.equal(
      decodeVerificationRunEvent(JSON.parse(journalLines[0]!) as unknown).ok,
      true
    );
  } finally {
    process.exitCode = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verify resume applies only the next cursors and completes the run', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-v7-resume-'));
  try {
    const planPath = join(directory, 'plan.json');
    const statePath = join(directory, 'run.json');
    const journalPath = join(directory, 'events.ndjson');
    const eventsPath = join(directory, 'resume.ndjson');
    const summaryPath = join(directory, 'summary.json');
    writeJson(planPath, encodeVerificationPlan(planFixture()));
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'run',
      '--plan',
      planPath,
      '--surface',
      'ci',
      '--scope',
      'required',
      '--run-id',
      'run-cli-resume',
      '--provider',
      'provider-ci',
      '--at',
      '2026-07-31T08:00:00Z',
      '--state',
      statePath,
      '--journal',
      journalPath,
      '--output',
      summaryPath,
    ]);
    assert.equal(process.exitCode, 2);
    const current = decodeVerificationRunSnapshot(
      JSON.parse(readFileSync(statePath, 'utf8')) as unknown
    );
    assert.equal(current.ok, true);
    if (!current.ok) return;
    const [cell] = current.value.cells;
    assert.ok(cell);
    const candidateDigest = digest('e');
    const events = [
      createVerificationRunEvent({
        eventId: 'run-cli-resume:cell-started',
        runId: current.value.runId,
        cursor: 2,
        occurredAt: '2026-07-31T08:00:00.002Z',
        kind: 'cell-started',
        cellId: cell.cellId,
        attemptId: cell.attemptId,
      }),
      createVerificationRunEvent({
        eventId: 'run-cli-resume:cell-reported',
        runId: current.value.runId,
        cursor: 3,
        occurredAt: '2026-07-31T08:00:00.003Z',
        kind: 'cell-reported',
        cellId: cell.cellId,
        attemptId: cell.attemptId,
        outcome: 'passed',
        candidateDigest,
      }),
      createVerificationRunEvent({
        eventId: 'run-cli-resume:completed',
        runId: current.value.runId,
        cursor: 4,
        occurredAt: '2026-07-31T08:00:00.004Z',
        kind: 'run-completed',
      }),
    ];
    writeFileSync(
      eventsPath,
      `${events
        .map((event) =>
          serializeVerificationValue(encodeVerificationRunEvent(event))
        )
        .join('\n')}\n`,
      'utf8'
    );

    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'resume',
      '--run',
      statePath,
      '--events',
      eventsPath,
      '--journal',
      journalPath,
      '--output',
      summaryPath,
    ]);

    assert.equal(process.exitCode, 0);
    const completed = decodeVerificationRunSnapshot(
      JSON.parse(readFileSync(statePath, 'utf8')) as unknown
    );
    assert.equal(completed.ok, true);
    if (!completed.ok) return;
    assert.equal(completed.value.status, 'completed');
    assert.equal(completed.value.cursor, 4);
    assert.equal(
      readFileSync(journalPath, 'utf8').trim().split('\n').length,
      4
    );
  } finally {
    process.exitCode = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verify cancel preserves the incomplete exit code until terminal acknowledgement', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-v7-cancel-'));
  try {
    const planPath = join(directory, 'plan.json');
    const statePath = join(directory, 'run.json');
    const journalPath = join(directory, 'events.ndjson');
    const summaryPath = join(directory, 'summary.json');
    writeJson(planPath, encodeVerificationPlan(planFixture()));
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'run',
      '--plan',
      planPath,
      '--surface',
      'ci',
      '--scope',
      'required',
      '--run-id',
      'run-cli-cancel',
      '--provider',
      'provider-ci',
      '--at',
      '2026-07-31T08:00:00Z',
      '--state',
      statePath,
      '--journal',
      journalPath,
      '--output',
      summaryPath,
    ]);
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'cancel',
      '--run',
      statePath,
      '--journal',
      journalPath,
      '--reason',
      'operator-request',
      '--at',
      '2026-07-31T08:00:00.002Z',
      '--output',
      summaryPath,
    ]);

    assert.equal(process.exitCode, 2);
    const cancelled = decodeVerificationRunSnapshot(
      JSON.parse(readFileSync(statePath, 'utf8')) as unknown
    );
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.value.status, 'cancelling');
    assert.equal(cancelled.value.cursor, 2);
  } finally {
    process.exitCode = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verify run rejects CI identity files with undeclared fields', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-v7-ci-id-'));
  const originalWrite = process.stderr.write;
  try {
    const planPath = join(directory, 'plan.json');
    const identityPath = join(directory, 'ci-identity.json');
    writeJson(planPath, encodeVerificationPlan(planFixture()));
    writeJson(identityPath, {
      repository: 'owner/prodivix',
      ref: 'refs/heads/main',
      commit: 'abcdef',
      accessToken: 'must-not-cross-the-contract',
    });
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'run',
      '--plan',
      planPath,
      '--surface',
      'ci',
      '--scope',
      'required',
      '--run-id',
      'run-cli-ci-id',
      '--provider',
      'provider-ci',
      '--origin',
      'ci',
      '--ci-identity',
      identityPath,
      '--at',
      '2026-07-31T08:00:00Z',
      '--state',
      join(directory, 'run.json'),
      '--journal',
      join(directory, 'events.ndjson'),
    ]);
    assert.equal(process.exitCode, 3);
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verify run uses stable invalid-contract exit code', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'prodivix-cli-v7-invalid-'));
  const originalWrite = process.stderr.write;
  try {
    const invalidPlan = join(directory, 'invalid-plan.json');
    writeJson(invalidPlan, { wireVersion: 2 });
    process.stderr.write = (() => true) as typeof process.stderr.write;
    process.exitCode = undefined;
    await createVerificationCommand().parseAsync([
      'node',
      'verify',
      'run',
      '--plan',
      invalidPlan,
      '--surface',
      'ci',
      '--scope',
      'required',
      '--run-id',
      'run-cli-invalid',
      '--provider',
      'provider-ci',
      '--at',
      '2026-07-31T08:00:00Z',
      '--state',
      join(directory, 'run.json'),
      '--journal',
      join(directory, 'events.ndjson'),
    ]);
    assert.equal(process.exitCode, 3);
  } finally {
    process.stderr.write = originalWrite;
    process.exitCode = undefined;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('verify promote resumes the server-bound attestation lifecycle without duplicate upload', () => {
  assert.equal(
    resolveVerificationPromotionResumeStep('staging', true),
    'upload-and-finalize'
  );
  assert.equal(
    resolveVerificationPromotionResumeStep('verification-pending', false),
    'await-attestation'
  );
  assert.equal(
    resolveVerificationPromotionResumeStep('verification-pending', true),
    'finalize-attested'
  );
  assert.equal(
    resolveVerificationPromotionResumeStep('committed', true),
    'recover-evidence'
  );
  assert.equal(
    resolveVerificationPromotionResumeStep('failed', false),
    'stop-failed'
  );
});
