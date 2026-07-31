import {
  VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
  VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
  type VerificationCheckReportPayload,
  type VerificationPlanCell,
} from '@prodivix/verification';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
} from './browserAdapter.types';
import type { BrowserBehaviorAssertionObservation } from './browserBehaviorAssertionReceipt';
import {
  createPngBrowserVerificationArtifact,
  createStructuredBrowserVerificationArtifact,
  type PreparedBrowserVerificationArtifact,
} from './browserVerificationArtifacts';
import type { BrowserToolSession } from './browserVerificationPort';
import {
  browserArtifactId,
  browserDiagnosticCodes,
  completedBrowserTerminal,
  createBrowserReplayArtifact,
  sourceTraceDigestFor,
  type BrowserVerificationProjection,
} from './browserVerificationProjectionSupport';
import { encodeRgbaPng } from './rgbaPng';
import { compareVisualRgba, createRgbaRasterDigest } from './visualComparison';

export const projectBrowserE2e = async (
  cell: VerificationPlanCell,
  input: BrowserVerificationCellInput,
  _policy: Extract<BrowserVerificationCellPolicy, Readonly<{ kind: 'e2e' }>>,
  session: BrowserToolSession,
  behavior: BrowserBehaviorAssertionObservation
): Promise<BrowserVerificationProjection> => {
  if (input.profile.kind !== 'e2e') {
    throw new TypeError('E2E projection received a non-E2E profile.');
  }
  const result = behavior.result;
  if (
    result.scenarioId !== input.profile.scenarioId ||
    result.scenarioId !== input.scenarioId
  ) {
    throw new TypeError('Playwright scenario identity drifted.');
  }
  const sourceTraceDigest = sourceTraceDigestFor(input);
  const codes = browserDiagnosticCodes(
    result.checks.map(({ diagnosticCodes: values }) => values)
  );
  const trace = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'trace'),
    kind: 'trace',
    expectedSourceTraceDigest: sourceTraceDigest,
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'trace',
      sourceTraceDigest,
      events: result.checks.map((check, index) => ({
        sequence: index,
        eventId: check.checkId,
        category: check.assertionCode,
        timestampOffsetMs: result.checks
          .slice(0, index)
          .reduce((total, entry) => total + entry.durationMs, 0),
        durationMs: check.durationMs,
        diagnosticCodes: check.diagnosticCodes,
        ...(check.sourceTraceDigest === undefined
          ? {}
          : { sourceTraceDigest: check.sourceTraceDigest }),
      })),
    },
  });
  const network = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'network-summary'),
    kind: 'network-summary',
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'network-summary',
      operations: await session.collectNetworkSummary(),
    },
  });
  const consoleSummary = createStructuredBrowserVerificationArtifact({
    id: browserArtifactId(cell, 'console-summary'),
    kind: 'console-summary',
    expectedSourceTraceDigest: sourceTraceDigest,
    envelope: {
      format: VERIFICATION_ARTIFACT_ENVELOPE_FORMAT,
      version: VERIFICATION_ARTIFACT_ENVELOPE_VERSION,
      kind: 'console-summary',
      sourceTraceDigest,
      events: await session.collectConsoleSummary(),
    },
  });
  return Object.freeze({
    terminal: completedBrowserTerminal(result.exitCode),
    payload: Object.freeze({
      kind: 'e2e',
      scenarioId: result.scenarioId,
      steps: Object.freeze(
        result.checks.map((check) =>
          Object.freeze({
            stepId: check.stepId,
            targetId: check.targetId,
            assertionCode: check.assertionCode,
            status: check.status,
            blackBox: check.blackBox,
            diagnosticCodes: check.diagnosticCodes,
            sourceTraceDigest,
          })
        )
      ),
      behaviorAssertionReceipt: behavior.receipt,
    }),
    artifacts: Object.freeze([
      createBrowserReplayArtifact({
        cell,
        sourceTraceDigest,
        eventCount: result.checks.length,
        assertionCount: result.checks.length,
        durationMs: result.checks.reduce(
          (total, check) => total + check.durationMs,
          0
        ),
        outcome: result.verdict,
        diagnosticCodes: codes,
      }),
      trace,
      network,
      consoleSummary,
    ]),
    diagnosticCodes: codes,
  });
};

export const projectBrowserVisual = async (
  cell: VerificationPlanCell,
  input: BrowserVerificationCellInput,
  policy: Extract<BrowserVerificationCellPolicy, Readonly<{ kind: 'visual' }>>,
  session: BrowserToolSession,
  behavior: BrowserBehaviorAssertionObservation
): Promise<BrowserVerificationProjection> => {
  if (input.profile.kind !== 'visual') {
    throw new TypeError('Visual projection received a non-visual profile.');
  }
  const visualProfile = input.profile;
  if (
    behavior.result.scenarioId !== input.scenarioId ||
    behavior.result.verdict !== 'passed' ||
    !behavior.result.checks.some(
      ({ stepId, status, blackBox }) =>
        stepId === visualProfile.stepId && status === 'passed' && blackBox
    )
  ) {
    throw new TypeError(
      'Visual capture requires the exact passing black-box Scenario observation checkpoint.'
    );
  }
  const capture = await session.captureVisual(
    input.profile,
    policy.program.targetManifest
  );
  if (
    capture.digest !== createRgbaRasterDigest(capture.image) ||
    capture.profile.scenarioId !== input.scenarioId ||
    capture.profile.stepId !== input.profile.stepId ||
    capture.profile.targetId !== input.profile.targetId ||
    capture.profile.frameworkTarget !== input.frameworkTarget ||
    capture.profile.surface !== input.surface ||
    capture.profile.browserEngine !== input.browserEngine
  ) {
    throw new TypeError('Observed visual capture identity drifted.');
  }
  const comparison = compareVisualRgba({
    baseline: policy.baselineImage,
    current: capture.image,
    baselineDigest: input.profile.baseline.rasterDigest,
    currentDigest: capture.digest,
    baselineProfile: input.profile.baseline.profile,
    currentProfile: capture.profile,
    threshold: input.profile.threshold,
    masks: input.profile.masks,
  });
  const canonicalCaptureBytes = encodeRgbaPng(capture.image);
  if (
    canonicalCaptureBytes.byteLength !== capture.pngBytes.byteLength ||
    canonicalCaptureBytes.some(
      (byte, index) => byte !== capture.pngBytes[index]
    )
  ) {
    throw new TypeError(
      'Observed visual capture bytes drifted from its canonical RGBA raster.'
    );
  }
  const sourceTraceDigest = sourceTraceDigestFor(input);
  const artifacts: PreparedBrowserVerificationArtifact[] = [
    createPngBrowserVerificationArtifact({
      id: browserArtifactId(cell, 'screenshot'),
      kind: 'screenshot',
      bytes: canonicalCaptureBytes,
    }),
  ];
  let payload: VerificationCheckReportPayload;
  if (comparison.status === 'view-only') {
    artifacts.push(
      createPngBrowserVerificationArtifact({
        id: browserArtifactId(cell, 'visual-diff'),
        kind: 'visual-diff',
        bytes: encodeRgbaPng({
          width: 1,
          height: 1,
          data: new Uint8Array(4),
        }),
      })
    );
    payload = Object.freeze({
      kind: 'visual',
      behaviorAssertionReceipt: behavior.receipt,
      comparisons: Object.freeze([
        Object.freeze({
          observationId: input.profile.observationId,
          compatibilityKey: comparison.currentCompatibilityKey,
          baselineDigest: comparison.baselineDigest,
          currentDigest: comparison.currentDigest,
          changedPixels: 0,
          totalPixels: comparison.totalPixels,
          thresholdPixels: 0,
          status: 'incompatible' as const,
          maskIds: comparison.maskIds,
          ...(input.profile.sourceTraceDigest === undefined
            ? {}
            : { sourceTraceDigest: input.profile.sourceTraceDigest }),
        }),
      ]),
    });
  } else {
    artifacts.push(
      createPngBrowserVerificationArtifact({
        id: browserArtifactId(cell, 'visual-diff'),
        kind: 'visual-diff',
        bytes: encodeRgbaPng({
          width: capture.image.width,
          height: capture.image.height,
          data: comparison.diffRgba,
        }),
      })
    );
    payload = Object.freeze({
      kind: 'visual',
      behaviorAssertionReceipt: behavior.receipt,
      comparisons: Object.freeze([
        Object.freeze({
          observationId: input.profile.observationId,
          compatibilityKey: comparison.compatibilityKey,
          baselineDigest: comparison.baselineDigest,
          currentDigest: comparison.currentDigest,
          diffDigest: comparison.diffDigest,
          changedPixels: comparison.changedPixels,
          totalPixels: comparison.comparedPixels + comparison.maskedPixels,
          thresholdPixels: comparison.thresholdPixels,
          status: comparison.status,
          maskIds: comparison.maskIds,
          ...(input.profile.sourceTraceDigest === undefined
            ? {}
            : { sourceTraceDigest: input.profile.sourceTraceDigest }),
        }),
      ]),
    });
  }
  artifacts.push(
    createBrowserReplayArtifact({
      cell,
      sourceTraceDigest,
      eventCount: behavior.result.checks.length + 1,
      assertionCount: behavior.result.checks.length + 1,
      durationMs: behavior.result.checks.reduce(
        (total, check) => total + check.durationMs,
        0
      ),
      outcome:
        comparison.status === 'passed'
          ? 'passed'
          : comparison.status === 'failed'
            ? 'failed'
            : 'blocked',
      diagnosticCodes: [],
    })
  );
  return Object.freeze({
    terminal: completedBrowserTerminal(comparison.status === 'failed' ? 1 : 0),
    payload,
    artifacts: Object.freeze(artifacts),
    diagnosticCodes: Object.freeze([]),
  });
};
