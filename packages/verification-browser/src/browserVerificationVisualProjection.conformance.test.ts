import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import {
  createVerificationBehaviorAssertionReceipt,
  type VerificationPlanCell,
} from '@prodivix/verification';
import { describe, expect, it } from 'vitest';
import type {
  BrowserVerificationCellInput,
  BrowserVerificationCellPolicy,
} from './browserAdapter.types';
import { projectBrowserVisual } from './browserVerificationFunctionalProjection';
import type { BrowserBehaviorAssertionObservation } from './browserBehaviorAssertionReceipt';
import type { BrowserToolSession } from './browserVerificationPort';
import {
  decodePlaywrightBehaviorPayload,
  evaluatePlaywrightBehavior,
} from './playwrightPrivatePayload';
import { encodeRgbaPng } from './rgbaPng';
import {
  createRgbaRasterDigest,
  type RgbaImage,
  type VisualBaselineCompatibilityProfile,
} from './visualComparison';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;
const image: RgbaImage = Object.freeze({
  width: 1,
  height: 1,
  data: Uint8Array.from([0, 0, 0, 255]),
});
const compatibilityProfile = Object.freeze({
  scenarioId: 'scenario.visual',
  stepId: 'step.visual-checkpoint',
  targetId: 'target.visual',
  frameworkTarget: 'react-vite',
  surface: 'ci',
  browserEngine: 'chromium',
  browserImageDigest: sha('1'),
  operatingSystemImageDigest: sha('2'),
  fontSetDigest: sha('3'),
  viewport: Object.freeze({
    widthCssPixels: 1,
    heightCssPixels: 1,
    devicePixelRatio: 1,
  }),
  captureRegion: Object.freeze({
    widthCssPixels: 1,
    heightCssPixels: 1,
  }),
  colorScheme: 'light',
  motionPreference: 'reduced',
  locale: 'en-US',
  rendererGeneration: 'renderer:1',
  normalizer: Object.freeze({ id: 'rgba', version: '1' }),
  diffAlgorithm: Object.freeze({
    id: 'prodivix-rgba-absolute',
    version: 1,
  }),
}) satisfies VisualBaselineCompatibilityProfile;
const profile = {
  format: 'prodivix.browser-verification-cell-input',
  version: 1,
  cellId: 'cell.visual',
  checkKind: 'visual',
  scenarioId: compatibilityProfile.scenarioId,
  targetId: compatibilityProfile.targetId,
  frameworkTarget: compatibilityProfile.frameworkTarget,
  surface: compatibilityProfile.surface,
  browserEngine: compatibilityProfile.browserEngine,
  viewport: { width: 1, height: 1 },
  colorScheme: compatibilityProfile.colorScheme,
  motion: compatibilityProfile.motionPreference,
  locale: compatibilityProfile.locale,
  executableSnapshotDigest: sha('4'),
  scenarioProgramDigest: sha('5'),
  controlProfileDigest: sha('6'),
  fixtureSetDigests: [],
  baselineSetDigest: sha('7'),
  targetLeaseBindingDigest: sha('8'),
  profile: {
    kind: 'visual',
    observationId: 'observation.visual',
    stepId: compatibilityProfile.stepId,
    targetId: compatibilityProfile.targetId,
    captureTargetId: 'target.capture',
    baseline: {
      rasterDigest: createRgbaRasterDigest(image),
      profile: compatibilityProfile,
    },
    threshold: {
      maximumChannelDelta: 0,
      maximumChangedPixels: 0,
      maximumChangedRatio: 0,
    },
    masks: [],
  },
} as BrowserVerificationCellInput;
const program = {
  scenarioId: compatibilityProfile.scenarioId,
  targetManifest: [],
} as unknown as BehaviorScenarioProgram;
const policy = {
  kind: 'visual',
  program,
  baselineImage: image,
} as BrowserVerificationCellPolicy & Readonly<{ kind: 'visual' }>;
const cell = {
  id: profile.cellId,
  checkKind: 'visual',
} as VerificationPlanCell;

const behaviorReport = (passed: boolean) => ({
  format: 'prodivix.playwright-browser-report',
  version: 1,
  tool: {
    name: 'playwright',
    version: '1.61.1',
    schemaDigest: sha('9'),
  },
  scenarioId: compatibilityProfile.scenarioId,
  complete: true,
  exitCode: passed ? 0 : 1,
  checks: [
    {
      checkId: 'check.visual',
      stepId: compatibilityProfile.stepId,
      targetId: compatibilityProfile.targetId,
      assertionCode: 'visible',
      status: passed ? 'passed' : 'failed',
      blackBox: true,
      durationMs: 1,
      diagnosticCodes: passed ? [] : ['VER-BROWSER-ASSERTION-FAILED'],
    },
  ],
});

const behaviorObservation = (
  passed: boolean
): BrowserBehaviorAssertionObservation => {
  const result = evaluatePlaywrightBehavior(
    decodePlaywrightBehaviorPayload(behaviorReport(passed))
  );
  return Object.freeze({
    result,
    receipt: createVerificationBehaviorAssertionReceipt({
      attemptId: 'attempt.visual',
      cellId: profile.cellId,
      scenarioId: profile.scenarioId,
      executableSnapshotDigest: profile.executableSnapshotDigest,
      scenarioProgramDigest: profile.scenarioProgramDigest,
      controlProfileDigest: profile.controlProfileDigest,
      fixtureSetDigests: profile.fixtureSetDigests,
      targetLeaseBindingDigest: profile.targetLeaseBindingDigest,
      runtimeFixtureBindingDigest: sha('a'),
      blackBoxAssertionSetDigest: sha('b'),
    }),
  });
};

describe('visual projection Scenario checkpoint', () => {
  it('captures only after the exact black-box checkpoint has passed', async () => {
    const session = {
      captureVisual: async () => {
        return {
          image,
          pngBytes: encodeRgbaPng(image),
          digest: createRgbaRasterDigest(image),
          profile: compatibilityProfile,
        };
      },
    } as unknown as BrowserToolSession;

    const projection = await projectBrowserVisual(
      cell,
      profile,
      policy,
      session,
      behaviorObservation(true)
    );
    expect(projection.payload).toMatchObject({
      kind: 'visual',
      comparisons: [{ status: 'passed' }],
    });
  });

  it('never captures an initially available target after the Program checkpoint fails', async () => {
    let captures = 0;
    const session = {
      executeBehavior: async () => behaviorReport(false),
      captureVisual: async () => {
        captures += 1;
        throw new Error('must not capture');
      },
    } as unknown as BrowserToolSession;

    await expect(
      projectBrowserVisual(
        cell,
        profile,
        policy,
        session,
        behaviorObservation(false)
      )
    ).rejects.toThrow(/passing black-box Scenario observation checkpoint/u);
    expect(captures).toBe(0);
  });

  it('rejects capture bytes that do not encode the declared canonical raster', async () => {
    const otherImage = Object.freeze({
      width: 1,
      height: 1,
      data: Uint8Array.from([255, 0, 0, 255]),
    });
    const session = {
      executeBehavior: async () => behaviorReport(true),
      captureVisual: async () => ({
        image,
        pngBytes: encodeRgbaPng(otherImage),
        digest: createRgbaRasterDigest(image),
        profile: compatibilityProfile,
      }),
    } as unknown as BrowserToolSession;

    await expect(
      projectBrowserVisual(
        cell,
        profile,
        policy,
        session,
        behaviorObservation(true)
      )
    ).rejects.toThrow(/bytes drifted from its canonical RGBA raster/u);
  });
});
