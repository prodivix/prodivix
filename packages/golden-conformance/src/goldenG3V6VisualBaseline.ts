import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  digestVerificationValue,
  type VerificationBaselineEntry,
  type VerificationBaselineSet,
  type VerificationPlanCell,
} from '@prodivix/verification';
import {
  createBrowserBaselineSetInputRef,
  createVisualBaselineCompatibilityKey,
  decodeRgbaPng,
  digestBrowserVerificationBytes,
  type BrowserVerificationBaselineAssetPort,
} from '@prodivix/verification-browser';
import { GOLDEN_G3_SCENARIO_IDS } from './goldenG3ScenarioFixture';
import {
  GOLDEN_G3_V6_VISUAL_NORMALIZER,
  GOLDEN_G3_V6_CONTROLLED_PLATFORMS,
  createGoldenG3V6VisualCompatibilityProfile,
  currentGoldenG3V6ControlledPlatform,
  type GoldenG3V6ControlledPlatform,
} from './goldenG3V6BrowserIdentityFixture';

const GOLDEN_G3_V6_BASELINE_SET_ID = 'baseline:g3-v6:authenticated-catalog';
const GOLDEN_G3_V6_TARGET_ID = 'authenticated-catalog';

export const GOLDEN_G3_V6_VISUAL_BASELINE_ASSET = Object.freeze({
  assetDocumentId: 'asset:g3-v6:catalog-image-black-64x64',
  path: fileURLToPath(
    new URL(
      '../testdata/g3-v6-visual-baselines/catalog-image-black-64x64.png',
      import.meta.url
    )
  ),
  mediaType: 'image/png',
  width: 64,
  height: 64,
  assetDigest:
    'sha256-774d02c24278eb5c0c9eb4f8d5f4eabb5891a6b9c01429492d43d5c89b7a3928',
  rasterDigest:
    'sha256-9ebde0e380725ce43da1288d7b5116011dbba8215a5b8ce1c73af23d64c9c5cc',
  adoptedAt: '2026-07-28T00:00:00.000Z',
  adoptedBy: 'owner:golden-conformance',
});

export const GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST = digestVerificationValue(
  GOLDEN_G3_V6_VISUAL_NORMALIZER
);
const frameworks = Object.freeze(['react-vite', 'vue-vite']);
const surfaces = Object.freeze(['preview', 'export', 'ci'] as const);
const motions = Object.freeze(['full', 'reduced'] as const);
const entry = (
  frameworkTarget: string,
  surface: (typeof surfaces)[number],
  motion: (typeof motions)[number],
  platform: GoldenG3V6ControlledPlatform
): VerificationBaselineEntry => {
  const compatibilityProfile = createGoldenG3V6VisualCompatibilityProfile(
    {
      scenarioId: GOLDEN_G3_SCENARIO_IDS.scenario,
      targetId: GOLDEN_G3_V6_TARGET_ID,
      frameworkTarget,
      surface,
      browserEngine: 'chromium',
      viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
      colorScheme: 'light',
      motion,
      locale: 'en-US',
    },
    platform
  );
  return Object.freeze({
    id: `baseline:g3-v6:${frameworkTarget}:${surface}:${motion}:${platform}`,
    scenarioId: GOLDEN_G3_SCENARIO_IDS.scenario,
    stepId: 'catalog-image-visible',
    targetId: GOLDEN_G3_V6_TARGET_ID,
    frameworkTarget,
    surface,
    browserEngine: 'chromium',
    viewport: Object.freeze({ id: 'desktop', width: 1280, height: 720 }),
    colorScheme: 'light',
    motion,
    locale: 'en-US',
    devicePixelRatio: 1,
    asset: Object.freeze({
      assetDocumentId: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDocumentId,
      digest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest,
      mediaType: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.mediaType,
    }),
    normalizerDigest: GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST,
    compatibilityProfileDigest:
      createVisualBaselineCompatibilityKey(compatibilityProfile),
    adoptedAt: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.adoptedAt,
    adoptedBy: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.adoptedBy,
  });
};

export const GOLDEN_G3_V6_VISUAL_BASELINE_SET: VerificationBaselineSet =
  Object.freeze({
    id: GOLDEN_G3_V6_BASELINE_SET_ID,
    name: 'Golden G3 V6 catalog image font-free visual baselines',
    entries: Object.freeze(
      frameworks.flatMap((frameworkTarget) =>
        surfaces.flatMap((surface) =>
          motions.flatMap((motion) =>
            GOLDEN_G3_V6_CONTROLLED_PLATFORMS.map((platform) =>
              entry(frameworkTarget, surface, motion, platform)
            )
          )
        )
      )
    ),
  });

export const GOLDEN_G3_V6_VISUAL_BASELINE_SET_INPUT =
  createBrowserBaselineSetInputRef(
    'input:g3-v6:visual-baseline-set',
    GOLDEN_G3_V6_VISUAL_BASELINE_SET
  );

export const GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST =
  GOLDEN_G3_V6_VISUAL_BASELINE_SET_INPUT.ref.digest;

export const GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST = Object.freeze({
  format: 'prodivix.golden-g3-v6-visual-identity',
  version: 1,
  baselineSetDigest: GOLDEN_G3_V6_VISUAL_BASELINE_SET_DIGEST,
  baselineAssetDigest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest,
  baselineRasterDigest: GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.rasterDigest,
  normalizer: GOLDEN_G3_V6_VISUAL_NORMALIZER,
  normalizerDigest: GOLDEN_G3_V6_VISUAL_NORMALIZER_DIGEST,
});

export const GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST_DIGEST =
  digestVerificationValue(GOLDEN_G3_V6_VISUAL_IDENTITY_MANIFEST);

export const createGoldenG3V6VisualBaselineAssetPort =
  (): BrowserVerificationBaselineAssetPort =>
    Object.freeze({
      read: async (
        baselineEntry: VerificationBaselineEntry
      ): Promise<Uint8Array | undefined> => {
        if (
          baselineEntry.asset.assetDocumentId !==
            GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDocumentId ||
          baselineEntry.asset.digest !==
            GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest ||
          baselineEntry.asset.mediaType !==
            GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.mediaType
        ) {
          return undefined;
        }
        const bytes = new Uint8Array(
          await readFile(GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.path)
        );
        if (
          digestBrowserVerificationBytes(bytes) !==
          GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.assetDigest
        ) {
          throw new Error('Golden V6 authored baseline asset digest drifted.');
        }
        const image = decodeRgbaPng(bytes);
        if (
          image.width !== GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.width ||
          image.height !== GOLDEN_G3_V6_VISUAL_BASELINE_ASSET.height
        ) {
          throw new Error('Golden V6 authored baseline dimensions drifted.');
        }
        return bytes;
      },
    });

export const goldenG3V6VisualBaselineEntryForCell = (
  cell: VerificationPlanCell,
  platform: GoldenG3V6ControlledPlatform = currentGoldenG3V6ControlledPlatform()
): VerificationBaselineEntry => {
  const compatibilityProfileDigest = createVisualBaselineCompatibilityKey(
    createGoldenG3V6VisualCompatibilityProfile(cell, platform)
  );
  const matches = GOLDEN_G3_V6_VISUAL_BASELINE_SET.entries.filter(
    (candidate) =>
      candidate.scenarioId === cell.scenarioId &&
      candidate.targetId === cell.targetId &&
      candidate.frameworkTarget === cell.frameworkTarget &&
      candidate.surface === cell.surface &&
      candidate.browserEngine === cell.browserEngine &&
      candidate.viewport.width === cell.viewport.width &&
      candidate.viewport.height === cell.viewport.height &&
      candidate.colorScheme === cell.colorScheme &&
      candidate.motion === cell.motion &&
      candidate.locale === cell.locale &&
      candidate.compatibilityProfileDigest === compatibilityProfileDigest
  );
  if (matches.length !== 1) {
    throw new Error(
      `Golden V6 visual cell "${cell.id}" does not resolve exactly one authored baseline.`
    );
  }
  return matches[0]!;
};
