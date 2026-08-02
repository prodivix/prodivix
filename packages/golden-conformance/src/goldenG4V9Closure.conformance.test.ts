import { writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS,
  AGENT_G4_REQUIRED_RECOVERY_CASE_IDS,
  decodeAgentG4ClosureManifest,
  digestAgentCanonicalValue,
  encodeAgentG4ClosureManifest,
} from '@prodivix/ai';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import { createAgentWorkspaceRevisionFromSnapshot } from '@prodivix/workspace';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GOLDEN_G4_V9_COMMIT,
  GOLDEN_G4_V9_APPROVAL,
  GOLDEN_G4_V9_PROJECTION,
  executeGoldenG4V9Closure,
  type GoldenG4V9ClosureHarness,
} from './goldenG4V9ClosureFixture';
import { GOLDEN_G4_V8_EVALUATION_MATRIX } from './goldenG4V8SecurityModelEvalFixture';

const verifyG4V9Closure = process.env.PRODIVIX_VERIFY_G4_V9_CLOSURE === '1';
const describeG4V9Closure = describe.runIf(verifyG4V9Closure);
let harness: GoldenG4V9ClosureHarness;

beforeAll(async () => {
  if (!verifyG4V9Closure) return;
  harness = await executeGoldenG4V9Closure();
  const outputPath = process.env.PRODIVIX_G4_V9_MANIFEST_PATH?.trim();
  if (outputPath) {
    if (!isAbsolute(outputPath)) {
      throw new Error('PRODIVIX_G4_V9_MANIFEST_PATH must be absolute.');
    }
    await writeFile(
      outputPath,
      `${JSON.stringify(encodeAgentG4ClosureManifest(harness.manifest), null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' }
    );
  }
}, 1_200_000);

describeG4V9Closure('G4 V9 authenticated Catalog Golden Closure', () => {
  it('binds one exact approval and Commit to the 66-cell trusted plan', () => {
    expect(GOLDEN_G4_V9_PROJECTION.verificationPlan.cells).toHaveLength(66);
    expect(GOLDEN_G4_V9_PROJECTION.preview).toMatchObject({
      transactionDigest: GOLDEN_G4_V9_PROJECTION.planning.transactionDigest,
      verificationPlanDigest:
        GOLDEN_G4_V9_PROJECTION.verificationPlan.planDigest,
    });
    expect(GOLDEN_G4_V9_COMMIT.receipt).toMatchObject({
      state: 'acknowledged',
      transactionDigest: GOLDEN_G4_V9_PROJECTION.planning.transactionDigest,
    });
    expect(harness.verificationFlow).toMatchObject({
      binding: {
        actualPlanDigest: GOLDEN_G4_V9_PROJECTION.verificationPlan.planDigest,
        mutationReceiptId: GOLDEN_G4_V9_COMMIT.receipt.receiptId,
        verificationRuns: [
          { surface: 'ci' },
          { surface: 'export' },
          { surface: 'preview' },
        ],
      },
      closure: { verdict: 'satisfied' },
      closureReceipt: { verdict: 'satisfied' },
    });
    expect(harness.manifest.journey).toMatchObject({
      baseRevisionDigest: digestAgentCanonicalValue(
        GOLDEN_G4_V9_APPROVAL.currentRevision
      ),
      targetRevisionDigest: digestAgentCanonicalValue(
        createAgentWorkspaceRevisionFromSnapshot(GOLDEN_G4_V9_COMMIT.snapshot)
      ),
      approvalDigest: digestAgentCanonicalValue(GOLDEN_G4_V9_APPROVAL.decision),
    });
  });

  it('covers React and Vue across Preview, Export, and CI with 80 attempts', () => {
    expect(harness.g3.matrix.totalAttemptCount).toBe(80);
    expect(harness.g3.evidence).toHaveLength(66);
    expect(harness.manifest.verification).toMatchObject({
      requiredCellCount: 66,
      totalAttemptCount: 80,
      evidenceCount: 66,
      frameworkTargets: ['react-vite', 'vue-vite'],
      surfaces: ['ci', 'export', 'preview'],
      closureVerdict: 'satisfied',
    });
    expect(harness.manifest.journey.verificationPlanDigest).toBe(
      GOLDEN_G4_V9_PROJECTION.preview.verificationPlanDigest
    );
  });

  it('records exact recovery and broad fail-closed negative evidence', () => {
    expect(
      harness.manifest.recoveryVerdicts.map(({ caseId }) => caseId)
    ).toEqual([...AGENT_G4_REQUIRED_RECOVERY_CASE_IDS].sort());
    expect(
      harness.manifest.negativeVerdicts.map(({ caseId }) => caseId)
    ).toEqual([...AGENT_G4_REQUIRED_NEGATIVE_CASE_IDS].sort());
    expect(
      new Set(
        harness.manifest.recoveryVerdicts.map(
          ({ evidenceDigest }) => evidenceDigest
        )
      ).size
    ).toBe(8);
    expect(
      harness.manifest.negativeVerdicts.every(
        ({ workspaceUnchanged, authorityUnexpanded, failurePreserved }) =>
          workspaceUnchanged && authorityUnexpanded && failurePreserved
      )
    ).toBe(true);
  });

  it('gives Web and CLI one strict audit-backed projection', () => {
    expect(harness.cliView).toEqual(harness.webView);
    expect(harness.webView.run).toMatchObject({
      phase: 'terminal',
      outcome: 'succeeded',
    });
    expect(harness.manifest.productParity).toMatchObject({ parity: 'exact' });
    expect(harness.manifest.productParity.webViewDigest).toBe(
      harness.manifest.productParity.cliViewDigest
    );
  });

  it('passes deterministic Golden but keeps G4 closure incomplete without real models and durable CI', () => {
    expect(harness.manifest).toMatchObject({
      worktreeState: 'dirty',
      goldenVerdict: 'satisfied',
      closureVerdict: 'incomplete',
      modelEvaluation: {
        status: 'pending',
        requiredAttemptCount: 11_640,
        actualAttemptCount: 0,
      },
    });
    expect(
      harness.manifest.deterministicGateEvidence.every(
        ({ executionMode, remoteModelUnits }) =>
          executionMode === 'local' && remoteModelUnits === 0
      )
    ).toBe(true);
    expect(harness.manifest.modelEvaluation.planDigest).toBe(
      digestAgentCanonicalValue(GOLDEN_G4_V8_EVALUATION_MATRIX)
    );
    const productArtifact = harness.manifest.artifacts.find(
      ({ artifactId }) => artifactId === 'artifact.g4-v9.product-view'
    );
    expect(productArtifact).toMatchObject({
      digest: digestAgentCanonicalValue(harness.webView),
      size: new TextEncoder().encode(canonicalJsonText(harness.webView))
        .byteLength,
    });
  });

  it('round-trips the strict current/wire Closure manifest', () => {
    const wire = encodeAgentG4ClosureManifest(harness.manifest);
    expect(decodeAgentG4ClosureManifest(wire)).toEqual({
      ok: true,
      value: harness.manifest,
    });
    expect(
      decodeAgentG4ClosureManifest({ ...wire, hiddenAuthority: true })
    ).toMatchObject({ ok: false });
  });
});
