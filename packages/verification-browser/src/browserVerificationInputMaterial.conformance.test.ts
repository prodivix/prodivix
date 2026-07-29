import { describe, expect, it } from 'vitest';
import {
  digestBehaviorValue,
  type BehaviorScenarioProgram,
} from '@prodivix/behavior';
import { canonicalJsonText } from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationBaselineSet,
} from '@prodivix/verification';
import {
  BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
  BROWSER_VERIFICATION_CELL_INPUT_VERSION,
  type BrowserVerificationCellInput,
} from './browserAdapter.types';
import {
  assertBrowserScenarioProgramBinding,
  createBrowserBaselineSetInputRef,
  createBrowserScenarioProgramInputRef,
  decodeBrowserBaselineSet,
  decodeBrowserScenarioProgram,
  selectBrowserVisualBaselineEntry,
} from './browserVerificationInputMaterial';
import { createVisualBaselineCompatibilityKey } from './visualComparison';

const sha = (value: unknown): string => digestVerificationValue(value);

const scenarioProgram = (): BehaviorScenarioProgram => {
  const withoutDigest = {
    scenarioId: 'scenario:catalog',
    scenarioDigest: sha('scenario'),
    workspaceRevision: 7,
    semanticSnapshotDigest: sha('semantic'),
    executableSnapshotDigest: sha('snapshot'),
    compilerDigest: sha('compiler'),
    registryDigest: sha('registry'),
    controlProfileDigest: sha('controls'),
    fixtureSetDigests: Object.freeze([sha('fixture')]),
    baselineSetDigests: Object.freeze([]),
    requiredCapabilities: Object.freeze([]),
    capabilityManifest: Object.freeze([]),
    targetManifest: Object.freeze([]),
    instructions: Object.freeze([]),
    observations: Object.freeze([]),
    sourceTrace: Object.freeze([]),
    budgets: Object.freeze({
      totalMs: 30_000,
      stepMs: 5_000,
      settleMs: 1_000,
    }),
  };
  return Object.freeze({
    ...withoutDigest,
    programDigest: digestBehaviorValue(withoutDigest),
  });
};

const visualProfile = (
  program: BehaviorScenarioProgram,
  rasterDigest: string
): BrowserVerificationCellInput => {
  const normalizer = Object.freeze({ id: 'pdx-rgba', version: '1' });
  return Object.freeze({
    format: BROWSER_VERIFICATION_CELL_INPUT_FORMAT,
    version: BROWSER_VERIFICATION_CELL_INPUT_VERSION,
    cellId: 'cell:visual',
    checkKind: 'visual',
    scenarioId: program.scenarioId,
    targetId: 'target:catalog',
    frameworkTarget: 'react-vite',
    surface: 'ci',
    browserEngine: 'chromium',
    viewport: Object.freeze({ width: 1280, height: 720 }),
    colorScheme: 'light',
    motion: 'reduced',
    locale: 'en-US',
    executableSnapshotDigest: program.executableSnapshotDigest,
    scenarioProgramDigest: program.programDigest,
    controlProfileDigest: program.controlProfileDigest,
    fixtureSetDigests: program.fixtureSetDigests,
    baselineSetDigest: sha('baseline-set'),
    targetLeaseBindingDigest: sha('lease'),
    profile: Object.freeze({
      kind: 'visual',
      observationId: 'observation:catalog',
      stepId: 'step:catalog',
      targetId: 'target:catalog',
      captureTargetId: 'target:catalog-sentinel',
      baseline: Object.freeze({
        rasterDigest,
        profile: Object.freeze({
          scenarioId: program.scenarioId,
          stepId: 'step:catalog',
          targetId: 'target:catalog',
          frameworkTarget: 'react-vite',
          surface: 'ci',
          browserEngine: 'chromium',
          browserImageDigest: sha('browser-image'),
          operatingSystemImageDigest: sha('os-image'),
          fontSetDigest: sha('fonts'),
          viewport: Object.freeze({
            widthCssPixels: 1280,
            heightCssPixels: 720,
            devicePixelRatio: 1,
          }),
          captureRegion: Object.freeze({
            widthCssPixels: 64,
            heightCssPixels: 64,
          }),
          colorScheme: 'light',
          motionPreference: 'reduced',
          locale: 'en-US',
          rendererGeneration: 'renderer:v1',
          normalizer,
          diffAlgorithm: Object.freeze({
            id: 'prodivix-rgba-absolute',
            version: 1,
          }),
        }),
      }),
      threshold: Object.freeze({
        maximumChannelDelta: 0,
        maximumChangedPixels: 0,
        maximumChangedRatio: 0,
      }),
      masks: Object.freeze([]),
    }),
  });
};

describe('Core-resolved browser input material', () => {
  it('canonicalizes and binds the exact Scenario Program bytes', () => {
    const program = scenarioProgram();
    const input = createBrowserScenarioProgramInputRef(
      'input:program',
      program
    );

    expect(input.ref.kind).toBe('scenario-program');
    expect(decodeBrowserScenarioProgram(input.bytes)).toEqual(program);
    const profile = visualProfile(program, sha('raster'));
    expect(() =>
      assertBrowserScenarioProgramBinding(program, profile, {
        executableSnapshotDigest: program.executableSnapshotDigest,
        scenarioProgramDigest: program.programDigest,
        controlProfileDigest: program.controlProfileDigest,
        fixtureSetDigests: program.fixtureSetDigests,
      })
    ).not.toThrow();

    const nonCanonical = new TextEncoder().encode(
      JSON.stringify(program, null, 2)
    );
    expect(() => decodeBrowserScenarioProgram(nonCanonical)).toThrow(
      /canonical JSON/u
    );
    const tampered = {
      ...program,
      programDigest: sha('forged-program'),
    };
    expect(() =>
      decodeBrowserScenarioProgram(
        new TextEncoder().encode(canonicalJsonText(tampered))
      )
    ).toThrow(/content address/u);
  });

  it('decodes the canonical Baseline Set and selects one exact entry', () => {
    const program = scenarioProgram();
    const rasterDigest = sha('raster');
    const profile = visualProfile(program, rasterDigest);
    if (profile.profile.kind !== 'visual') {
      throw new Error('Expected visual profile.');
    }
    const baselineSet: VerificationBaselineSet = Object.freeze({
      id: 'baseline:catalog',
      name: 'Catalog baseline',
      entries: Object.freeze([
        Object.freeze({
          id: 'baseline:catalog:chromium',
          scenarioId: profile.scenarioId,
          stepId: profile.profile.stepId,
          targetId: profile.profile.targetId,
          frameworkTarget: profile.frameworkTarget,
          surface: profile.surface,
          browserEngine: profile.browserEngine,
          viewport: Object.freeze({
            id: 'desktop',
            width: profile.viewport.width,
            height: profile.viewport.height,
          }),
          colorScheme: profile.colorScheme,
          motion: profile.motion,
          locale: profile.locale,
          devicePixelRatio:
            profile.profile.baseline.profile.viewport.devicePixelRatio,
          asset: Object.freeze({
            assetDocumentId: 'asset:baseline',
            digest: sha('png-bytes'),
            mediaType: 'image/png',
          }),
          normalizerDigest: digestVerificationValue(
            profile.profile.baseline.profile.normalizer
          ),
          compatibilityProfileDigest: createVisualBaselineCompatibilityKey(
            profile.profile.baseline.profile
          ),
          adoptedAt: '2026-07-28T00:00:00.000Z',
          adoptedBy: 'owner:visual',
        }),
      ]),
    });
    const input = createBrowserBaselineSetInputRef(
      'input:baseline',
      baselineSet
    );

    expect(input.ref.kind).toBe('baseline-set');
    const decoded = decodeBrowserBaselineSet(input.bytes);
    expect(selectBrowserVisualBaselineEntry(decoded, profile).id).toBe(
      'baseline:catalog:chromium'
    );
    expect(() =>
      selectBrowserVisualBaselineEntry(
        Object.freeze({ ...decoded, entries: Object.freeze([]) }),
        profile
      )
    ).toThrow(/exactly one/u);
    expect(() =>
      selectBrowserVisualBaselineEntry(
        Object.freeze({
          ...decoded,
          entries: Object.freeze([
            Object.freeze({
              ...decoded.entries[0]!,
              compatibilityProfileDigest: sha('runtime-labelled-profile'),
            }),
          ]),
        }),
        profile
      )
    ).toThrow(/exactly one/u);
  });
});
