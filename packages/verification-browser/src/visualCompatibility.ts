import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import {
  digestVerificationValue,
  type VerificationBrowserEngine,
  type VerificationColorScheme,
  type VerificationMotion,
  type VerificationSurface,
} from '@prodivix/verification';
import {
  decodePrivateJson,
  strictEnum,
  strictFiniteNumber,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
} from './privateBoundary';

export type VisualBaselineCompatibilityProfile = Readonly<{
  scenarioId: string;
  stepId: string;
  targetId: string;
  frameworkTarget: string;
  surface: VerificationSurface;
  browserEngine: VerificationBrowserEngine;
  browserImageDigest: string;
  operatingSystemImageDigest: string;
  fontSetDigest: string;
  viewport: Readonly<{
    widthCssPixels: number;
    heightCssPixels: number;
    devicePixelRatio: number;
  }>;
  captureRegion: Readonly<{
    widthCssPixels: number;
    heightCssPixels: number;
  }>;
  colorScheme: VerificationColorScheme;
  motionPreference: VerificationMotion;
  locale: string;
  rendererGeneration: string;
  normalizer: Readonly<{ id: string; version: string }>;
  diffAlgorithm: Readonly<{
    id: 'prodivix-rgba-absolute';
    version: 1;
  }>;
}>;

export type VisualCompatibilityField =
  | 'scenario'
  | 'step'
  | 'target'
  | 'framework'
  | 'surface'
  | 'engine'
  | 'browser-image'
  | 'os-image'
  | 'font'
  | 'viewport'
  | 'capture-region'
  | 'dpr'
  | 'color'
  | 'motion'
  | 'locale'
  | 'renderer'
  | 'normalizer'
  | 'diff';

export type VisualBaselineCompatibility =
  | Readonly<{
      status: 'compatible';
      mode: 'comparable';
      compatibilityKey: string;
    }>
  | Readonly<{
      status: 'incompatible';
      mode: 'view-only';
      baselineCompatibilityKey: string;
      currentCompatibilityKey: string;
      incompatibleFields: readonly VisualCompatibilityField[];
    }>;

const normalizeCompatibilityProfile = (
  input: VisualBaselineCompatibilityProfile,
  path: string
): VisualBaselineCompatibilityProfile => {
  const decoded = decodePrivateJson(input, 'Visual compatibility profile');
  const profile = strictObject(decoded, path, [
    'scenarioId',
    'stepId',
    'targetId',
    'frameworkTarget',
    'surface',
    'browserEngine',
    'browserImageDigest',
    'operatingSystemImageDigest',
    'fontSetDigest',
    'viewport',
    'captureRegion',
    'colorScheme',
    'motionPreference',
    'locale',
    'rendererGeneration',
    'normalizer',
    'diffAlgorithm',
  ]);
  const viewport = strictObject(profile.viewport, `${path}.viewport`, [
    'widthCssPixels',
    'heightCssPixels',
    'devicePixelRatio',
  ]);
  const captureRegion = strictObject(
    profile.captureRegion,
    `${path}.captureRegion`,
    ['widthCssPixels', 'heightCssPixels']
  );
  const normalizer = strictObject(profile.normalizer, `${path}.normalizer`, [
    'id',
    'version',
  ]);
  const diffAlgorithm = strictObject(
    profile.diffAlgorithm,
    `${path}.diffAlgorithm`,
    ['id', 'version']
  );
  const version = strictSafeInteger(
    diffAlgorithm.version,
    `${path}.diffAlgorithm.version`,
    { minimum: 1, maximum: 1 }
  );
  return Object.freeze({
    scenarioId: strictIdentifier(profile.scenarioId, `${path}.scenarioId`),
    stepId: strictIdentifier(profile.stepId, `${path}.stepId`),
    targetId: strictIdentifier(profile.targetId, `${path}.targetId`),
    frameworkTarget: strictIdentifier(
      profile.frameworkTarget,
      `${path}.frameworkTarget`
    ),
    surface: strictEnum(profile.surface, `${path}.surface`, [
      'preview',
      'export',
      'ci',
    ] as const),
    browserEngine: strictEnum(profile.browserEngine, `${path}.browserEngine`, [
      'chromium',
      'firefox',
      'webkit',
    ] as const),
    browserImageDigest: strictSha256Digest(
      profile.browserImageDigest,
      `${path}.browserImageDigest`
    ),
    operatingSystemImageDigest: strictSha256Digest(
      profile.operatingSystemImageDigest,
      `${path}.operatingSystemImageDigest`
    ),
    fontSetDigest: strictSha256Digest(
      profile.fontSetDigest,
      `${path}.fontSetDigest`
    ),
    viewport: Object.freeze({
      widthCssPixels: strictSafeInteger(
        viewport.widthCssPixels,
        `${path}.viewport.widthCssPixels`,
        { minimum: 1, maximum: 32_768 }
      ),
      heightCssPixels: strictSafeInteger(
        viewport.heightCssPixels,
        `${path}.viewport.heightCssPixels`,
        { minimum: 1, maximum: 32_768 }
      ),
      devicePixelRatio: strictFiniteNumber(
        viewport.devicePixelRatio,
        `${path}.viewport.devicePixelRatio`,
        { minimum: 0.25, maximum: 8 }
      ),
    }),
    captureRegion: Object.freeze({
      widthCssPixels: strictFiniteNumber(
        captureRegion.widthCssPixels,
        `${path}.captureRegion.widthCssPixels`,
        { minimum: 0.25, maximum: 32_768 }
      ),
      heightCssPixels: strictFiniteNumber(
        captureRegion.heightCssPixels,
        `${path}.captureRegion.heightCssPixels`,
        { minimum: 0.25, maximum: 32_768 }
      ),
    }),
    colorScheme: strictEnum(profile.colorScheme, `${path}.colorScheme`, [
      'light',
      'dark',
    ] as const),
    motionPreference: strictEnum(
      profile.motionPreference,
      `${path}.motionPreference`,
      ['full', 'reduced'] as const
    ),
    locale: strictIdentifier(profile.locale, `${path}.locale`),
    rendererGeneration: strictIdentifier(
      profile.rendererGeneration,
      `${path}.rendererGeneration`
    ),
    normalizer: Object.freeze({
      id: strictIdentifier(normalizer.id, `${path}.normalizer.id`),
      version: strictIdentifier(
        normalizer.version,
        `${path}.normalizer.version`
      ),
    }),
    diffAlgorithm: Object.freeze({
      id: strictEnum(diffAlgorithm.id, `${path}.diffAlgorithm.id`, [
        'prodivix-rgba-absolute',
      ] as const),
      version: version as 1,
    }),
  });
};

export const createVisualBaselineCompatibilityKey = (
  input: VisualBaselineCompatibilityProfile
): string => {
  const profile = normalizeCompatibilityProfile(input, '$');
  return digestVerificationValue({
    kind: 'visual-baseline-compatibility',
    version: 1,
    profile,
  });
};

const same = (left: unknown, right: unknown): boolean =>
  canonicalJsonText(left) === canonicalJsonText(right);

export const evaluateVisualBaselineCompatibility = (
  baselineInput: VisualBaselineCompatibilityProfile,
  currentInput: VisualBaselineCompatibilityProfile
): VisualBaselineCompatibility => {
  const baseline = normalizeCompatibilityProfile(baselineInput, '$.baseline');
  const current = normalizeCompatibilityProfile(currentInput, '$.current');
  const differences: VisualCompatibilityField[] = [];
  if (baseline.scenarioId !== current.scenarioId) differences.push('scenario');
  if (baseline.stepId !== current.stepId) differences.push('step');
  if (baseline.targetId !== current.targetId) differences.push('target');
  if (baseline.frameworkTarget !== current.frameworkTarget) {
    differences.push('framework');
  }
  if (baseline.surface !== current.surface) differences.push('surface');
  if (baseline.browserEngine !== current.browserEngine) {
    differences.push('engine');
  }
  if (baseline.browserImageDigest !== current.browserImageDigest) {
    differences.push('browser-image');
  }
  if (
    baseline.operatingSystemImageDigest !== current.operatingSystemImageDigest
  ) {
    differences.push('os-image');
  }
  if (baseline.fontSetDigest !== current.fontSetDigest) {
    differences.push('font');
  }
  if (
    baseline.viewport.widthCssPixels !== current.viewport.widthCssPixels ||
    baseline.viewport.heightCssPixels !== current.viewport.heightCssPixels
  ) {
    differences.push('viewport');
  }
  if (
    baseline.viewport.devicePixelRatio !== current.viewport.devicePixelRatio
  ) {
    differences.push('dpr');
  }
  if (
    baseline.captureRegion.widthCssPixels !==
      current.captureRegion.widthCssPixels ||
    baseline.captureRegion.heightCssPixels !==
      current.captureRegion.heightCssPixels
  ) {
    differences.push('capture-region');
  }
  if (baseline.colorScheme !== current.colorScheme) differences.push('color');
  if (baseline.motionPreference !== current.motionPreference) {
    differences.push('motion');
  }
  if (baseline.locale !== current.locale) differences.push('locale');
  if (baseline.rendererGeneration !== current.rendererGeneration) {
    differences.push('renderer');
  }
  if (!same(baseline.normalizer, current.normalizer)) {
    differences.push('normalizer');
  }
  if (!same(baseline.diffAlgorithm, current.diffAlgorithm)) {
    differences.push('diff');
  }
  const baselineCompatibilityKey =
    createVisualBaselineCompatibilityKey(baseline);
  const currentCompatibilityKey = createVisualBaselineCompatibilityKey(current);
  if (differences.length === 0) {
    return Object.freeze({
      status: 'compatible',
      mode: 'comparable',
      compatibilityKey: baselineCompatibilityKey,
    });
  }
  return Object.freeze({
    status: 'incompatible',
    mode: 'view-only',
    baselineCompatibilityKey,
    currentCompatibilityKey,
    incompatibleFields: Object.freeze(
      differences.sort(compareUnicodeCodePoints)
    ),
  });
};
