import type { BehaviorScenarioProgram } from '@prodivix/behavior';
import type { VerificationPlanCell } from '@prodivix/verification';
import type { Page } from 'playwright-core';
import type {
  BrowserVerificationRuntimeIdentity,
  BrowserVisualCellProfile,
} from '../browserAdapter.types';
import type { BrowserToolVisualCapture } from '../browserVerificationPort';
import {
  createRgbaRasterDigest,
  type VisualBaselineCompatibilityProfile,
} from '../visualComparison';
import { decodeBrowserRgbaPng, encodeRgbaPng } from '../rgbaPng';
import { semanticLocator } from './playwrightBehaviorProbe';
import type { TrustedPageProbeBinding } from './playwrightTrustedPageProbe';

const currentVisualProfile = (
  cell: VerificationPlanCell,
  profile: BrowserVisualCellProfile,
  identity: BrowserVerificationRuntimeIdentity,
  captureRegion: VisualBaselineCompatibilityProfile['captureRegion']
): VisualBaselineCompatibilityProfile => {
  if (
    cell.scenarioId === undefined ||
    cell.targetId !== profile.targetId ||
    cell.browserEngine !== identity.browserEngine
  ) {
    throw new TypeError(
      'Visual capture identity drifted from the exact Plan cell.'
    );
  }
  return Object.freeze({
    scenarioId: cell.scenarioId,
    stepId: profile.stepId,
    targetId: profile.targetId,
    frameworkTarget: cell.frameworkTarget,
    surface: cell.surface,
    browserEngine: identity.browserEngine,
    browserImageDigest: identity.browserImageDigest,
    operatingSystemImageDigest: identity.operatingSystemImageDigest,
    fontSetDigest: identity.fontSetDigest,
    viewport: Object.freeze({ ...identity.viewport }),
    captureRegion: Object.freeze({ ...captureRegion }),
    colorScheme: identity.colorScheme,
    motionPreference: identity.motionPreference,
    locale: identity.locale,
    rendererGeneration: identity.rendererGeneration,
    normalizer: Object.freeze({ ...identity.normalizer }),
    diffAlgorithm: Object.freeze({
      id: 'prodivix-rgba-absolute',
      version: 1,
    }),
  });
};

export const capturePlaywrightVisual = async (
  input: Readonly<{
    page: Page;
    cell: VerificationPlanCell;
    profile: BrowserVisualCellProfile;
    targetManifest: BehaviorScenarioProgram['targetManifest'];
    runtimeIdentity: BrowserVerificationRuntimeIdentity;
    trustedPageProbe: TrustedPageProbeBinding;
  }>
): Promise<BrowserToolVisualCapture> => {
  const target = await semanticLocator(
    input.page,
    input.profile.captureTargetId,
    input.targetManifest,
    input.trustedPageProbe
  );
  if (target === undefined) {
    throw new TypeError(
      'Visual capture target is absent, ambiguous, or not bound by the exact Scenario Program.'
    );
  }
  if (
    input.profile.sourceTraceDigest !== undefined &&
    input.profile.sourceTraceDigest !== target.sourceTraceDigest
  ) {
    throw new TypeError(
      'Visual capture target SourceTrace drifted from the exact profile.'
    );
  }
  await target.locator.scrollIntoViewIfNeeded();
  const boundingBox = await target.locator.boundingBox();
  if (
    boundingBox === null ||
    !Number.isFinite(boundingBox.width) ||
    !Number.isFinite(boundingBox.height) ||
    boundingBox.width <= 0 ||
    boundingBox.height <= 0
  ) {
    throw new TypeError(
      'Visual capture target has no finite, non-empty rendered region.'
    );
  }
  const captureRegion = Object.freeze({
    widthCssPixels: boundingBox.width,
    heightCssPixels: boundingBox.height,
  });
  const currentProfile = currentVisualProfile(
    input.cell,
    input.profile,
    input.runtimeIdentity,
    captureRegion
  );
  const pngBytes = await input.page.screenshot({
    type: 'png',
    animations: 'disabled',
    caret: 'hide',
    scale: 'device',
    clip: boundingBox,
  });
  const image = decodeBrowserRgbaPng(pngBytes);
  // Playwright page clips use an integer CSS-pixel extent before applying DPR.
  // Keeping the exact fractional region in the profile still makes subpixel
  // layout drift compatibility-significant.
  const expectedWidth = Math.round(
    Math.floor(currentProfile.captureRegion.widthCssPixels) *
      currentProfile.viewport.devicePixelRatio
  );
  const expectedHeight = Math.round(
    Math.floor(currentProfile.captureRegion.heightCssPixels) *
      currentProfile.viewport.devicePixelRatio
  );
  if (image.width !== expectedWidth || image.height !== expectedHeight) {
    throw new Error(
      `Captured raster dimensions ${image.width}x${image.height} differ from the observed runtime profile ${expectedWidth}x${expectedHeight}.`
    );
  }
  return Object.freeze({
    image,
    pngBytes: encodeRgbaPng(image),
    digest: createRgbaRasterDigest(image),
    profile: currentProfile,
  });
};
