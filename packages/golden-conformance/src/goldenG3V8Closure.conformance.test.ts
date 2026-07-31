import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  digestVerificationValue,
  serializeVerificationValue,
} from '@prodivix/verification';
import {
  createGoldenG3V8VerifiedView,
  evaluateGoldenG3V8Closure,
  executeGoldenG3V8Closure,
  type GoldenG3V8ClosureHarness,
} from './goldenG3V8ClosureFixture';
import {
  GOLDEN_G3_V8_LOCKED_PLAN_DIGEST,
  GOLDEN_G3_V8_PLAN,
} from './goldenG3V8PlanFixture';
import {
  GOLDEN_G3_CATALOG_SCENARIO,
  GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO,
} from './goldenG3ScenarioFixture';

describe('Golden G3 V8 locked VerificationPlan', () => {
  it('locks the reviewed 66-cell trusted Authenticated Catalog matrix', () => {
    expect(GOLDEN_G3_V8_PLAN.status).toBe('ready');
    expect(GOLDEN_G3_V8_PLAN.planDigest).toBe(GOLDEN_G3_V8_LOCKED_PLAN_DIGEST);
    expect(GOLDEN_G3_V8_PLAN.cells).toHaveLength(66);
    expect(
      GOLDEN_G3_V8_PLAN.cells.every(
        (cell) =>
          cell.requirement === 'required' &&
          cell.evidenceRequirements.requireAttestation &&
          cell.evidenceRequirements.acceptedTrust.length === 1 &&
          cell.evidenceRequirements.acceptedTrust[0] ===
            (cell.surface === 'preview' ? 'remote-attested' : 'ci-attested')
      )
    ).toBe(true);
    expect(
      new Set(
        GOLDEN_G3_V8_PLAN.cells.map(({ frameworkTarget }) => frameworkTarget)
      )
    ).toEqual(new Set(['react-vite', 'vue-vite']));
    expect(
      new Set(GOLDEN_G3_V8_PLAN.cells.map(({ surface }) => surface))
    ).toEqual(new Set(['preview', 'export', 'ci']));
  });
});

const describeExecuted =
  process.env.PRODIVIX_VERIFY_G3_V8_GOLDEN === '1' ? describe : describe.skip;

describeExecuted('Golden G3 V8 Authenticated Catalog Closure', () => {
  let harness: GoldenG3V8ClosureHarness;

  beforeAll(async () => {
    harness = await executeGoldenG3V8Closure();
    const serializedManifest = serializeVerificationValue(harness.manifest);
    const manifestPath = process.env.PRODIVIX_G3_V8_MANIFEST_PATH?.trim() ?? '';
    if (manifestPath) {
      if (!isAbsolute(manifestPath)) {
        throw new Error('G3 V8 manifest output path must be absolute.');
      }
      await writeFile(manifestPath, `${serializedManifest}\n`, {
        encoding: 'utf8',
        flag: 'wx',
      });
    }
    console.info(
      `G3 V8 Closure manifest passed: digest=${harness.manifest.manifestDigest} cells=${String(harness.manifest.cells.length)} closure=${harness.manifest.closureVerdict}`
    );
  }, 1_200_000);

  const closureFor = (
    evidence: GoldenG3V8ClosureHarness['evidence'],
    overrides: Parameters<typeof createGoldenG3V8VerifiedView>[1] = []
  ) => {
    const verified = createGoldenG3V8VerifiedView(evidence, overrides);
    const result = evaluateGoldenG3V8Closure(evidence, verified);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      throw new Error(result.message);
    }
    return result.closure;
  };

  const replaceCellEvidence = (
    replacement: GoldenG3V8ClosureHarness['negativeEvidence']['failed']
  ) =>
    Object.freeze([
      ...harness.evidence.filter(({ cellId }) => cellId !== replacement.cellId),
      replacement,
    ]);

  it('promotes one trusted actual attempt per required cell and passes Closure', () => {
    expect(harness.matrix.requiredCellCount).toBe(66);
    expect(harness.matrix.totalAttemptCount).toBe(80);
    expect(harness.attempts).toHaveLength(66);
    expect(harness.candidates).toHaveLength(66);
    expect(harness.evidence).toHaveLength(66);
    expect(new Set(harness.evidence.map(({ cellId }) => cellId)).size).toBe(66);
    expect(
      harness.evidence.filter(
        ({ provenance }) => provenance.trust === 'remote-attested'
      )
    ).toHaveLength(14);
    expect(
      harness.evidence.filter(
        ({ provenance }) => provenance.trust === 'ci-attested'
      )
    ).toHaveLength(52);
    expect(harness.closure.verdict).toBe('satisfied');
    expect(Object.values(harness.closure.cellStatuses)).toEqual(
      expect.arrayContaining(['passed'])
    );
    expect(
      Object.values(harness.closure.cellStatuses).every(
        (status) => status === 'passed'
      )
    ).toBe(true);
  });

  it('binds the content-addressed manifest to matrix, trust view, and recomputed Closure', () => {
    const { manifest } = harness;
    const { manifestDigest, ...identity } = manifest;
    expect(manifest.planDigest).toBe(GOLDEN_G3_V8_LOCKED_PLAN_DIGEST);
    expect(manifest.lockedPlanDigest).toBe(GOLDEN_G3_V8_LOCKED_PLAN_DIGEST);
    expect(manifest.matrixEvidenceDigest).toBe(harness.matrix.evidenceDigest);
    expect(manifest.verifiedViewDigest).toBe(harness.verifiedView.viewDigest);
    expect(manifest.closureDigest).toBe(harness.closure.closureDigest);
    expect(manifest.execution).toMatchObject({
      mode: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
      command: 'pnpm run verify:g3:golden',
      attestationAuthority: {
        mode: 'deterministic-test-only',
        keyId: 'golden-g3-v8-test-key',
        verifierId: 'golden-g3-v8-test-verifier',
      },
    });
    expect(Date.parse(manifest.execution.completedAt)).toBeGreaterThanOrEqual(
      Date.parse(manifest.execution.startedAt)
    );
    expect(manifest.planIdentity).toMatchObject({
      workspaceId: GOLDEN_G3_V8_PLAN.workspaceId,
      targetRevision: GOLDEN_G3_V8_PLAN.targetRevision,
      targetPartitionRevisions: GOLDEN_G3_V8_PLAN.targetPartitionRevisions,
      policyRevision: GOLDEN_G3_V8_PLAN.policyRevision,
      policyDigest: GOLDEN_G3_V8_PLAN.policyDigest,
      policyEvaluationInstant: GOLDEN_G3_V8_PLAN.policyEvaluationInstant,
    });
    expect(manifest.closureIdentity).toMatchObject({
      workspaceId: harness.closure.workspaceId,
      targetRevision: harness.closure.targetRevision,
      targetPartitionRevisions: harness.closure.targetPartitionRevisions,
      policyEvaluationInstant: harness.closure.policyEvaluationInstant,
      closureEvaluationInstant: harness.closure.closureEvaluationInstant,
      evidenceSetDigest: harness.closure.evidenceSetDigest,
      revocationRecordDigest: harness.closure.revocationRecordDigest,
      evidenceDigests: harness.closure.evidenceDigests,
    });
    expect(manifest.cells).toHaveLength(66);
    expect(new Set(manifest.cells.map(({ cell }) => cell.id)).size).toBe(66);
    expect(
      new Set(manifest.cells.map(({ acceptedEvidence }) => acceptedEvidence.id))
        .size
    ).toBe(66);
    expect(manifest.cellManifestDigest).toBe(
      digestVerificationValue(manifest.cells)
    );
    expect(
      manifest.cells.every((record) => {
        const evidence = harness.evidence.find(
          ({ id }) => id === record.acceptedEvidence.id
        );
        const verified = harness.verifiedView.records.find(
          ({ evidenceId }) => evidenceId === record.acceptedEvidence.id
        );
        return (
          record.cell.requirement === 'required' &&
          record.compatibility === 'compatible' &&
          record.verdict === 'passed' &&
          record.acceptedEvidence.trustStatus === 'verified' &&
          record.acceptedEvidence.retentionState === 'active' &&
          evidence?.cellId === record.cell.id &&
          evidence.attemptId === record.attempt.id &&
          evidence.manifestDigest === record.acceptedEvidence.manifestDigest &&
          verified?.recordDigest ===
            record.acceptedEvidence.verifiedViewRecordDigest &&
          record.acceptedEvidence.artifacts.every(
            ({ id, digest, status }) =>
              status === 'available' &&
              evidence.artifacts.some(
                (artifact) => artifact.id === id && artifact.digest === digest
              )
          )
        );
      })
    ).toBe(true);
    expect(manifestDigest).toBe(digestVerificationValue(identity));

    const recomputed = closureFor(harness.evidence);
    expect(recomputed.verdict).toBe('satisfied');
    expect(recomputed.closureDigest).toBe(harness.closure.closureDigest);
  });

  it('keeps the authored Scenario identity across React/Vue and Preview/Export/CI', () => {
    const scenarioEvidence = harness.evidence.filter(
      ({ scenario }) => scenario !== undefined
    );
    expect(scenarioEvidence.length).toBeGreaterThan(0);
    expect(
      new Set(scenarioEvidence.map(({ scenario }) => scenario!.id))
    ).toEqual(
      new Set([
        GOLDEN_G3_CATALOG_SCENARIO.id,
        GOLDEN_G3_PRODUCTION_SECURITY_SCENARIO.id,
      ])
    );
    expect(
      new Set(scenarioEvidence.map(({ run }) => run.frameworkTarget))
    ).toEqual(new Set(['react-vite', 'vue-vite']));
    expect(new Set(scenarioEvidence.map(({ run }) => run.surface))).toEqual(
      new Set(['preview', 'export', 'ci'])
    );
  });

  it('fails closed for missing, failed, blocked, and unstable required cells', () => {
    const cellId = harness.negativeEvidence.cellId;
    const withoutCell = Object.freeze(
      harness.evidence.filter((candidate) => candidate.cellId !== cellId)
    );
    expect(closureFor(withoutCell).cellStatuses[cellId]).toBe('missing');

    const failed = replaceCellEvidence(harness.negativeEvidence.failed);
    expect(closureFor(failed).cellStatuses[cellId]).toBe('failed');

    const blocked = replaceCellEvidence(harness.negativeEvidence.blocked);
    const blockedClosure = closureFor(blocked);
    expect(blockedClosure.verdict).toBe('unsatisfied');
    expect(blockedClosure.cellStatuses[cellId]).toBe('pending');

    const unstable = Object.freeze([
      ...harness.evidence,
      harness.negativeEvidence.failed,
    ]);
    expect(closureFor(unstable).cellStatuses[cellId]).toBe('unstable');
  });

  it('fails closed for expired, revoked, unverified, and missing-artifact Evidence', () => {
    const selected = harness.evidence[0]!;
    expect(
      closureFor(harness.evidence, [
        { evidenceId: selected.id, trustStatus: 'expired' },
      ]).cellStatuses[selected.cellId]
    ).toBe('stale');
    expect(
      closureFor(harness.evidence, [
        { evidenceId: selected.id, trustStatus: 'revoked' },
      ]).cellStatuses[selected.cellId]
    ).toBe('stale');
    expect(
      closureFor(harness.evidence, [
        { evidenceId: selected.id, trustStatus: 'unverified' },
      ]).cellStatuses[selected.cellId]
    ).toBe('incompatible');
    expect(
      closureFor(harness.evidence, [
        { evidenceId: selected.id, artifactStatus: 'missing' },
      ]).cellStatuses[selected.cellId]
    ).toBe('stale');
  });
});
