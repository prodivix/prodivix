import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import {
  assertUniqueIdentities,
  BROWSER_PRIVATE_PAYLOAD_LIMITS,
  BrowserPrivatePayloadError,
  strictArray,
  strictFiniteNumber,
  strictIdentifier,
  strictObject,
  strictSafeInteger,
  strictSha256Digest,
  uniqueSorted,
} from './privateBoundary';
import {
  evaluateVisualBaselineCompatibility,
  type VisualBaselineCompatibilityProfile,
  type VisualCompatibilityField,
} from './visualCompatibility';

export type RgbaImage = Readonly<{
  width: number;
  height: number;
  data: Uint8Array;
}>;

export type AuthoredSemanticMask = Readonly<{
  maskId: string;
  semanticTargetId: string;
  authoredByPolicyDigest: string;
  reasonCode: string;
  region: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

export type VisualDifferenceThreshold = Readonly<{
  maximumChannelDelta: number;
  maximumChangedPixels: number;
  maximumChangedRatio: number;
}>;

export type VisualChangedRegion = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type VisualComparisonResult =
  | Readonly<{
      status: 'view-only';
      baselineDigest: string;
      currentDigest: string;
      baselineCompatibilityKey: string;
      currentCompatibilityKey: string;
      incompatibleFields: readonly VisualCompatibilityField[];
      totalPixels: number;
      maskIds: readonly string[];
    }>
  | Readonly<{
      status: 'passed' | 'failed';
      baselineDigest: string;
      currentDigest: string;
      compatibilityKey: string;
      changedPixels: number;
      comparedPixels: number;
      maskedPixels: number;
      thresholdPixels: number;
      changedRatio: number;
      maximumObservedChannelDelta: number;
      changedRegion?: VisualChangedRegion;
      maskIds: readonly string[];
      diffRgba: Uint8Array;
      diffDigest: string;
    }>;

const validateImage = (image: RgbaImage, path: string): RgbaImage => {
  if (!(image.data instanceof Uint8Array)) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      `${path}.data`,
      `${path}.data must be a Uint8Array.`
    );
  }
  const width = strictSafeInteger(image.width, `${path}.width`, {
    minimum: 1,
    maximum: 32_768,
  });
  const height = strictSafeInteger(image.height, `${path}.height`, {
    minimum: 1,
    maximum: 32_768,
  });
  const pixels = width * height;
  if (
    !Number.isSafeInteger(pixels) ||
    pixels > BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualPixels
  ) {
    throw new BrowserPrivatePayloadError(
      'budget-exceeded',
      path,
      `${path} exceeds the ${BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualPixels} pixel limit.`
    );
  }
  if (image.data.byteLength !== pixels * 4) {
    throw new BrowserPrivatePayloadError(
      'partial-result',
      `${path}.data`,
      `${path}.data length does not match its declared RGBA dimensions.`
    );
  }
  return { width, height, data: image.data };
};

const RASTER_DIGEST_MAGIC = new TextEncoder().encode(
  'prodivix-rgba-raster-v1\u0000'
);

/**
 * Binds dimensions and RGBA bytes into the single visual-raster digest
 * envelope used by baselines, current captures, and generated diffs.
 */
export const createRgbaRasterDigest = (input: RgbaImage): string => {
  const image = validateImage(input, '$.raster');
  const dimensions = new Uint8Array(8);
  const view = new DataView(dimensions.buffer);
  view.setUint32(0, image.width, false);
  view.setUint32(4, image.height, false);
  const hash = sha256.create();
  hash.update(RASTER_DIGEST_MAGIC);
  hash.update(dimensions);
  hash.update(image.data);
  return `sha256-${bytesToHex(hash.digest())}`;
};

const normalizeMasks = (
  masks: readonly AuthoredSemanticMask[],
  width: number,
  height: number
): readonly AuthoredSemanticMask[] => {
  const entries = strictArray(
    masks,
    '$.masks',
    BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualMasks
  ).map((value, index) => {
    const path = `$.masks[${index}]`;
    const mask = strictObject(value, path, [
      'maskId',
      'semanticTargetId',
      'authoredByPolicyDigest',
      'reasonCode',
      'region',
    ]);
    const region = strictObject(mask.region, `${path}.region`, [
      'x',
      'y',
      'width',
      'height',
    ]);
    const x = strictSafeInteger(region.x, `${path}.region.x`, {
      minimum: 0,
      maximum: width - 1,
    });
    const y = strictSafeInteger(region.y, `${path}.region.y`, {
      minimum: 0,
      maximum: height - 1,
    });
    const regionWidth = strictSafeInteger(
      region.width,
      `${path}.region.width`,
      { minimum: 1, maximum: width }
    );
    const regionHeight = strictSafeInteger(
      region.height,
      `${path}.region.height`,
      { minimum: 1, maximum: height }
    );
    if (x + regionWidth > width || y + regionHeight > height) {
      throw new BrowserPrivatePayloadError(
        'invalid-field',
        `${path}.region`,
        `${path}.region must stay within the captured image.`
      );
    }
    return Object.freeze({
      maskId: strictIdentifier(mask.maskId, `${path}.maskId`),
      semanticTargetId: strictIdentifier(
        mask.semanticTargetId,
        `${path}.semanticTargetId`
      ),
      authoredByPolicyDigest: strictSha256Digest(
        mask.authoredByPolicyDigest,
        `${path}.authoredByPolicyDigest`
      ),
      reasonCode: strictIdentifier(mask.reasonCode, `${path}.reasonCode`),
      region: Object.freeze({
        x,
        y,
        width: regionWidth,
        height: regionHeight,
      }),
    });
  });
  assertUniqueIdentities(entries, ({ maskId }) => maskId, '$.masks');
  return Object.freeze(
    [...entries].sort((left, right) =>
      compareUnicodeCodePoints(left.maskId, right.maskId)
    )
  );
};

const normalizeThreshold = (
  threshold: VisualDifferenceThreshold
): VisualDifferenceThreshold => {
  const value = strictObject(threshold, '$.threshold', [
    'maximumChannelDelta',
    'maximumChangedPixels',
    'maximumChangedRatio',
  ]);
  return Object.freeze({
    maximumChannelDelta: strictSafeInteger(
      value.maximumChannelDelta,
      '$.threshold.maximumChannelDelta',
      { minimum: 0, maximum: 255 }
    ),
    maximumChangedPixels: strictSafeInteger(
      value.maximumChangedPixels,
      '$.threshold.maximumChangedPixels',
      {
        minimum: 0,
        maximum: BROWSER_PRIVATE_PAYLOAD_LIMITS.maximumVisualPixels,
      }
    ),
    maximumChangedRatio: strictFiniteNumber(
      value.maximumChangedRatio,
      '$.threshold.maximumChangedRatio',
      { minimum: 0, maximum: 1 }
    ),
  });
};

export const compareVisualRgba = (
  input: Readonly<{
    baseline: RgbaImage;
    current: RgbaImage;
    baselineDigest: string;
    currentDigest: string;
    baselineProfile: VisualBaselineCompatibilityProfile;
    currentProfile: VisualBaselineCompatibilityProfile;
    threshold: VisualDifferenceThreshold;
    masks: readonly AuthoredSemanticMask[];
  }>
): VisualComparisonResult => {
  const baseline = validateImage(input.baseline, '$.baseline');
  const current = validateImage(input.current, '$.current');
  const baselineDigest = strictSha256Digest(
    input.baselineDigest,
    '$.baselineDigest'
  );
  const currentDigest = strictSha256Digest(
    input.currentDigest,
    '$.currentDigest'
  );
  if (createRgbaRasterDigest(baseline) !== baselineDigest) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$.baselineDigest',
      'Baseline digest does not match the declared RGBA raster envelope.'
    );
  }
  if (createRgbaRasterDigest(current) !== currentDigest) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$.currentDigest',
      'Current digest does not match the declared RGBA raster envelope.'
    );
  }
  const compatibility = evaluateVisualBaselineCompatibility(
    input.baselineProfile,
    input.currentProfile
  );
  const masks = normalizeMasks(input.masks, current.width, current.height);
  const maskIds = uniqueSorted(
    masks.map(({ maskId }) => maskId),
    '$.masks'
  );
  if (compatibility.status === 'incompatible') {
    return Object.freeze({
      status: 'view-only',
      baselineDigest,
      currentDigest,
      baselineCompatibilityKey: compatibility.baselineCompatibilityKey,
      currentCompatibilityKey: compatibility.currentCompatibilityKey,
      incompatibleFields: compatibility.incompatibleFields,
      totalPixels: current.width * current.height,
      maskIds,
    });
  }
  if (baseline.width !== current.width || baseline.height !== current.height) {
    throw new BrowserPrivatePayloadError(
      'result-drift',
      '$.current',
      'Compatible visual profiles produced different image dimensions.'
    );
  }
  const threshold = normalizeThreshold(input.threshold);
  const pixelCount = current.width * current.height;
  const masked = new Uint8Array(pixelCount);
  for (const { region } of masks) {
    for (let y = region.y; y < region.y + region.height; y += 1) {
      const rowStart = y * current.width;
      for (let x = region.x; x < region.x + region.width; x += 1) {
        masked[rowStart + x] = 1;
      }
    }
  }
  let maskedPixels = 0;
  let changedPixels = 0;
  let maximumObservedChannelDelta = 0;
  let minimumX = current.width;
  let minimumY = current.height;
  let maximumX = -1;
  let maximumY = -1;
  const diffRgba = new Uint8Array(current.data.byteLength);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const byteOffset = pixel * 4;
    if (masked[pixel] === 1) {
      maskedPixels += 1;
      continue;
    }
    let pixelMaximum = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(
        baseline.data[byteOffset + channel]! -
          current.data[byteOffset + channel]!
      );
      pixelMaximum = Math.max(pixelMaximum, delta);
    }
    maximumObservedChannelDelta = Math.max(
      maximumObservedChannelDelta,
      pixelMaximum
    );
    if (pixelMaximum <= threshold.maximumChannelDelta) continue;
    changedPixels += 1;
    const x = pixel % current.width;
    const y = Math.floor(pixel / current.width);
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
    diffRgba[byteOffset] = 255;
    diffRgba[byteOffset + 1] = 0;
    diffRgba[byteOffset + 2] = 255;
    diffRgba[byteOffset + 3] = 255;
  }
  const comparedPixels = pixelCount - maskedPixels;
  if (comparedPixels === 0) {
    throw new BrowserPrivatePayloadError(
      'invalid-field',
      '$.masks',
      'Authored semantic masks cannot hide every visual comparison pixel.'
    );
  }
  const ratioThresholdPixels = Math.floor(
    comparedPixels * threshold.maximumChangedRatio
  );
  const thresholdPixels = Math.min(
    threshold.maximumChangedPixels,
    ratioThresholdPixels
  );
  const changedRatio = changedPixels / comparedPixels;
  const changedRegion =
    changedPixels === 0
      ? undefined
      : Object.freeze({
          x: minimumX,
          y: minimumY,
          width: maximumX - minimumX + 1,
          height: maximumY - minimumY + 1,
        });
  const diffDigest = createRgbaRasterDigest({
    width: current.width,
    height: current.height,
    data: diffRgba,
  });
  return Object.freeze({
    status: changedPixels <= thresholdPixels ? 'passed' : 'failed',
    baselineDigest,
    currentDigest,
    compatibilityKey: compatibility.compatibilityKey,
    changedPixels,
    comparedPixels,
    maskedPixels,
    thresholdPixels,
    changedRatio,
    maximumObservedChannelDelta,
    ...(changedRegion === undefined ? {} : { changedRegion }),
    maskIds,
    diffRgba,
    diffDigest,
  });
};
