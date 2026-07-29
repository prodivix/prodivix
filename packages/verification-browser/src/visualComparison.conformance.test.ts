import { describe, expect, it } from 'vitest';
import {
  compareVisualRgba,
  createRgbaRasterDigest,
  createVisualBaselineCompatibilityKey,
  evaluateVisualBaselineCompatibility,
  type AuthoredSemanticMask,
  type RgbaImage,
  type VisualBaselineCompatibilityProfile,
} from './visualComparison';

const sha = (character: string): string => `sha256-${character.repeat(64)}`;

const profile = (
  overrides: Partial<VisualBaselineCompatibilityProfile> = {}
): VisualBaselineCompatibilityProfile => ({
  scenarioId: 'scenario.catalog',
  stepId: 'step.loaded',
  targetId: 'target.catalog',
  frameworkTarget: 'react-vite',
  surface: 'export',
  browserEngine: 'chromium',
  browserImageDigest: sha('1'),
  operatingSystemImageDigest: sha('2'),
  fontSetDigest: sha('3'),
  viewport: {
    widthCssPixels: 2,
    heightCssPixels: 2,
    devicePixelRatio: 1,
  },
  captureRegion: {
    widthCssPixels: 2,
    heightCssPixels: 2,
  },
  colorScheme: 'light',
  motionPreference: 'reduced',
  locale: 'en-US',
  rendererGeneration: 'renderer.g3',
  normalizer: { id: 'rgba.srgb', version: '1.0.0' },
  diffAlgorithm: { id: 'prodivix-rgba-absolute', version: 1 },
  ...overrides,
});

const image = (pixels: readonly number[]): RgbaImage => ({
  width: 2,
  height: 2,
  data: Uint8Array.from(pixels),
});

const baseline = image([
  0, 0, 0, 255, 10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 255,
]);

const current = image([
  0, 0, 0, 255, 10, 10, 10, 255, 200, 20, 20, 255, 30, 30, 30, 255,
]);

const mask = (
  overrides: Partial<AuthoredSemanticMask> = {}
): AuthoredSemanticMask => ({
  maskId: 'mask.clock',
  semanticTargetId: 'target.clock',
  authoredByPolicyDigest: sha('4'),
  reasonCode: 'dynamic.clock',
  region: { x: 0, y: 1, width: 1, height: 1 },
  ...overrides,
});

describe('deterministic RGBA visual comparison', () => {
  it('binds dimensions and bytes into stable raster and compatibility digests', () => {
    expect(createRgbaRasterDigest(baseline)).toBe(
      'sha256-907f3e1bc3e437e244d3128a61701ff3619d786bb51a04485e5ae87f528a516a'
    );
    expect(
      createRgbaRasterDigest({
        ...baseline,
        data: Uint8Array.from(baseline.data),
      })
    ).toBe(createRgbaRasterDigest(baseline));
    expect(createVisualBaselineCompatibilityKey(profile())).toMatch(
      /^sha256-[0-9a-f]{64}$/u
    );
  });

  it('computes an exact changed-pixel summary and content-bound diff', () => {
    const result = compareVisualRgba({
      baseline,
      current,
      baselineDigest: createRgbaRasterDigest(baseline),
      currentDigest: createRgbaRasterDigest(current),
      baselineProfile: profile(),
      currentProfile: profile(),
      threshold: {
        maximumChannelDelta: 0,
        maximumChangedPixels: 0,
        maximumChangedRatio: 1,
      },
      masks: [],
    });

    expect(result).toMatchObject({
      status: 'failed',
      changedPixels: 1,
      comparedPixels: 4,
      maskedPixels: 0,
      thresholdPixels: 0,
      changedRegion: { x: 0, y: 1, width: 1, height: 1 },
    });
    if (result.status === 'view-only') throw new Error('unexpected mode');
    expect(result.diffDigest).toBe(
      createRgbaRasterDigest({
        width: 2,
        height: 2,
        data: result.diffRgba,
      })
    );
    expect([...result.diffRgba.slice(8, 12)]).toEqual([255, 0, 255, 255]);
  });

  it('applies only authored semantic masks and canonicalizes their ids', () => {
    const result = compareVisualRgba({
      baseline,
      current,
      baselineDigest: createRgbaRasterDigest(baseline),
      currentDigest: createRgbaRasterDigest(current),
      baselineProfile: profile(),
      currentProfile: profile(),
      threshold: {
        maximumChannelDelta: 0,
        maximumChangedPixels: 0,
        maximumChangedRatio: 0,
      },
      masks: [mask()],
    });

    expect(result).toMatchObject({
      status: 'passed',
      changedPixels: 0,
      comparedPixels: 3,
      maskedPixels: 1,
      maskIds: ['mask.clock'],
    });
  });

  it('makes incompatible environments view-only without a pass/fail diff', () => {
    const compatibility = evaluateVisualBaselineCompatibility(
      profile(),
      profile({
        browserEngine: 'firefox',
        fontSetDigest: sha('9'),
        viewport: {
          widthCssPixels: 2,
          heightCssPixels: 2,
          devicePixelRatio: 2,
        },
      })
    );
    expect(compatibility).toMatchObject({
      status: 'incompatible',
      mode: 'view-only',
      incompatibleFields: ['dpr', 'engine', 'font'],
    });

    const result = compareVisualRgba({
      baseline,
      current,
      baselineDigest: createRgbaRasterDigest(baseline),
      currentDigest: createRgbaRasterDigest(current),
      baselineProfile: profile(),
      currentProfile: profile({ browserEngine: 'firefox' }),
      threshold: {
        maximumChannelDelta: 0,
        maximumChangedPixels: 0,
        maximumChangedRatio: 0,
      },
      masks: [],
    });
    expect(result).toMatchObject({
      status: 'view-only',
      incompatibleFields: ['engine'],
    });
    expect(result).not.toHaveProperty('changedPixels');
  });

  it.each([
    ['baseline', sha('a'), createRgbaRasterDigest(current)],
    ['current', createRgbaRasterDigest(baseline), sha('b')],
  ])(
    'rejects %s raster digest drift',
    (_label, baselineDigest, currentDigest) => {
      expect(() =>
        compareVisualRgba({
          baseline,
          current,
          baselineDigest,
          currentDigest,
          baselineProfile: profile(),
          currentProfile: profile(),
          threshold: {
            maximumChannelDelta: 0,
            maximumChangedPixels: 0,
            maximumChangedRatio: 0,
          },
          masks: [],
        })
      ).toThrow('digest does not match');
    }
  );

  it('rejects duplicate, out-of-bounds, and total-coverage masks', () => {
    const common = {
      baseline,
      current: baseline,
      baselineDigest: createRgbaRasterDigest(baseline),
      currentDigest: createRgbaRasterDigest(baseline),
      baselineProfile: profile(),
      currentProfile: profile(),
      threshold: {
        maximumChannelDelta: 0,
        maximumChangedPixels: 0,
        maximumChangedRatio: 0,
      },
    } as const;

    expect(() =>
      compareVisualRgba({ ...common, masks: [mask(), mask()] })
    ).toThrow('duplicate identity');
    expect(() =>
      compareVisualRgba({
        ...common,
        masks: [mask({ region: { x: 1, y: 1, width: 2, height: 1 } })],
      })
    ).toThrow('within the captured image');
    expect(() =>
      compareVisualRgba({
        ...common,
        masks: [mask({ region: { x: 0, y: 0, width: 2, height: 2 } })],
      })
    ).toThrow('cannot hide every');
  });

  it('rejects partial, over-budget, and non-finite raster inputs', () => {
    expect(() =>
      createRgbaRasterDigest({ width: 2, height: 2, data: new Uint8Array(4) })
    ).toThrow('does not match');
    expect(() =>
      createRgbaRasterDigest({
        width: 32_768,
        height: 32_768,
        data: new Uint8Array(),
      })
    ).toThrow('pixel limit');
    expect(() =>
      createVisualBaselineCompatibilityKey(
        profile({
          viewport: {
            widthCssPixels: 2,
            heightCssPixels: 2,
            devicePixelRatio: Number.NaN,
          },
        })
      )
    ).toThrow('finite');
  });
});
