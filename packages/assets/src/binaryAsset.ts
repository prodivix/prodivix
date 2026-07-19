import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  BINARY_ASSET_BLOB_REFERENCE_KIND,
  BINARY_ASSET_LIMITS,
  BINARY_ASSET_TRANSFORM_FORMAT,
  type BinaryAssetBlobReference,
  type BinaryAssetDeliveryClass,
  type BinaryAssetDeliveryRequest,
  type BinaryAssetMaterialization,
  type BinaryAssetTransformJsonValue,
  type BinaryAssetTransformRecipe,
} from './binaryAsset.types';

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u;
const IDENTITY_PATTERN = /^[a-z0-9][a-z0-9._-]*$/u;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/u;
const ACTIVE_MEDIA_TYPES = new Set([
  'application/javascript',
  'application/xhtml+xml',
  'application/xml',
  'image/svg+xml',
  'text/css',
  'text/html',
  'text/javascript',
  'text/xml',
]);
const STATIC_MEDIA_TYPES = new Set([
  'application/json',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const exactKeys = (
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  const normalizedExpected = [...expected].sort();
  return (
    actual.length === normalizedExpected.length &&
    actual.every((key, index) => key === normalizedExpected[index])
  );
};

export const normalizeBinaryAssetMediaType = (value: string): string => {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (
    !normalized ||
    normalized.length > BINARY_ASSET_LIMITS.maxMediaTypeLength ||
    !MEDIA_TYPE_PATTERN.test(normalized)
  ) {
    throw new TypeError('Binary asset media type is invalid.');
  }
  return normalized;
};

export const isBinaryAssetDigest = (value: unknown): value is string =>
  typeof value === 'string' && DIGEST_PATTERN.test(value);

export const computeBinaryAssetDigest = (contents: Uint8Array): string =>
  `sha256-${bytesToHex(sha256(contents))}`;

export const readBinaryAssetBlobReference = (
  value: unknown
): BinaryAssetBlobReference => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ['kind', 'digest', 'byteLength', 'mediaType']) ||
    value.kind !== BINARY_ASSET_BLOB_REFERENCE_KIND ||
    !isBinaryAssetDigest(value.digest) ||
    typeof value.byteLength !== 'number' ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    value.byteLength > BINARY_ASSET_LIMITS.maxBlobBytes ||
    typeof value.mediaType !== 'string'
  ) {
    throw new TypeError('Binary asset blob reference is invalid.');
  }
  const mediaType = normalizeBinaryAssetMediaType(value.mediaType);
  if (mediaType !== value.mediaType) {
    throw new TypeError('Binary asset media type must be canonical.');
  }
  return Object.freeze({
    kind: BINARY_ASSET_BLOB_REFERENCE_KIND,
    digest: value.digest,
    byteLength: value.byteLength,
    mediaType,
  });
};

export const isBinaryAssetBlobReference = (
  value: unknown
): value is BinaryAssetBlobReference => {
  try {
    readBinaryAssetBlobReference(value);
    return true;
  } catch {
    return false;
  }
};

export const createBinaryAssetBlobReference = (input: {
  contents: Uint8Array;
  mediaType: string;
}): BinaryAssetBlobReference => {
  if (!(input.contents instanceof Uint8Array)) {
    throw new TypeError('Binary asset contents must be bytes.');
  }
  if (input.contents.byteLength > BINARY_ASSET_LIMITS.maxBlobBytes) {
    throw new TypeError('Binary asset exceeds the blob byte limit.');
  }
  return Object.freeze({
    kind: BINARY_ASSET_BLOB_REFERENCE_KIND,
    digest: computeBinaryAssetDigest(input.contents),
    byteLength: input.contents.byteLength,
    mediaType: normalizeBinaryAssetMediaType(input.mediaType),
  });
};

/** Revalidates untrusted bytes against the exact authoring reference before compilation or execution. */
export const createBinaryAssetMaterialization = (input: {
  assetDocumentId: string;
  reference: BinaryAssetBlobReference;
  contents: Uint8Array;
}): BinaryAssetMaterialization => {
  const assetDocumentId = input.assetDocumentId.trim();
  if (
    !assetDocumentId ||
    assetDocumentId.length > BINARY_ASSET_LIMITS.maxAssetDocumentIdLength
  ) {
    throw new TypeError('Binary asset document identity is invalid.');
  }
  const reference = readBinaryAssetBlobReference(input.reference);
  if (!(input.contents instanceof Uint8Array)) {
    throw new TypeError('Binary asset materialization must contain bytes.');
  }
  if (input.contents.byteLength !== reference.byteLength) {
    throw new TypeError('Binary asset materialization byte length drifted.');
  }
  if (computeBinaryAssetDigest(input.contents) !== reference.digest) {
    throw new TypeError('Binary asset materialization digest drifted.');
  }
  return Object.freeze({
    assetDocumentId,
    reference,
    contents: new Uint8Array(input.contents),
  });
};

export const classifyBinaryAssetDelivery = (
  mediaType: string
): BinaryAssetDeliveryClass => {
  const normalized = normalizeBinaryAssetMediaType(mediaType);
  if (ACTIVE_MEDIA_TYPES.has(normalized)) return 'active-content';
  if (STATIC_MEDIA_TYPES.has(normalized)) return 'static';
  return 'download-only';
};

/** Target-neutral public policy: raster images are fully re-encoded; other media stays attachment-only. */
export const createBinaryAssetPublicDeliveryRequest = (
  mediaType: string
): BinaryAssetDeliveryRequest => {
  const normalized = normalizeBinaryAssetMediaType(mediaType);
  if (normalized === 'image/png') {
    return Object.freeze({
      transform: 'png-raster-reencode',
      disposition: 'inline',
    });
  }
  if (normalized === 'image/jpeg') {
    return Object.freeze({
      transform: 'jpeg-raster-reencode',
      disposition: 'inline',
    });
  }
  return Object.freeze({ transform: 'original', disposition: 'attachment' });
};

type CanonicalJsonState = { nodes: number };

const canonicalizeTransformValue = (
  value: unknown,
  depth: number,
  state: CanonicalJsonState
): BinaryAssetTransformJsonValue => {
  state.nodes += 1;
  if (
    depth > BINARY_ASSET_LIMITS.maxTransformParameterDepth ||
    state.nodes > BINARY_ASSET_LIMITS.maxTransformParameterNodes
  ) {
    throw new TypeError('Binary asset transform parameters exceed limits.');
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Binary asset transform parameters must be JSON.');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((entry) => canonicalizeTransformValue(entry, depth + 1, state))
    );
  }
  if (!isRecord(value)) {
    throw new TypeError('Binary asset transform parameters must be JSON.');
  }
  const result = Object.create(null) as Record<
    string,
    BinaryAssetTransformJsonValue
  >;
  Object.keys(value)
    .sort()
    .forEach((key) => {
      result[key] = canonicalizeTransformValue(value[key], depth + 1, state);
    });
  return Object.freeze(result);
};

const normalizeTransformIdentity = (
  value: string,
  label: string,
  pattern: RegExp
): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > BINARY_ASSET_LIMITS.maxIdentityLength ||
    !pattern.test(normalized)
  ) {
    throw new TypeError(`Binary asset ${label} is invalid.`);
  }
  return normalized;
};

export const createBinaryAssetTransformRecipe = (input: {
  sourceDigest: string;
  transformerId: string;
  transformerVersion: string;
  outputMediaType: string;
  parameters: unknown;
}): BinaryAssetTransformRecipe => {
  if (!isBinaryAssetDigest(input.sourceDigest)) {
    throw new TypeError('Binary asset transform source digest is invalid.');
  }
  const transformerId = normalizeTransformIdentity(
    input.transformerId,
    'transformer id',
    IDENTITY_PATTERN
  );
  const transformerVersion = normalizeTransformIdentity(
    input.transformerVersion,
    'transformer version',
    VERSION_PATTERN
  );
  const outputMediaType = normalizeBinaryAssetMediaType(input.outputMediaType);
  const parameters = canonicalizeTransformValue(input.parameters, 0, {
    nodes: 0,
  });
  const canonical = JSON.stringify({
    format: BINARY_ASSET_TRANSFORM_FORMAT,
    sourceDigest: input.sourceDigest,
    transformerId,
    transformerVersion,
    outputMediaType,
    parameters,
  });
  if (
    utf8ToBytes(canonical).byteLength >
    BINARY_ASSET_LIMITS.maxTransformParametersBytes
  ) {
    throw new TypeError(
      'Binary asset transform parameters exceed byte limits.'
    );
  }
  return Object.freeze({
    format: BINARY_ASSET_TRANSFORM_FORMAT,
    sourceDigest: input.sourceDigest,
    transformerId,
    transformerVersion,
    outputMediaType,
    parameters,
    recipeDigest: computeBinaryAssetDigest(utf8ToBytes(canonical)),
  });
};

export const readBinaryAssetTransformRecipe = (
  value: unknown
): BinaryAssetTransformRecipe => {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'format',
      'sourceDigest',
      'transformerId',
      'transformerVersion',
      'outputMediaType',
      'parameters',
      'recipeDigest',
    ]) ||
    value.format !== BINARY_ASSET_TRANSFORM_FORMAT ||
    typeof value.sourceDigest !== 'string' ||
    typeof value.transformerId !== 'string' ||
    typeof value.transformerVersion !== 'string' ||
    typeof value.outputMediaType !== 'string' ||
    typeof value.recipeDigest !== 'string'
  ) {
    throw new TypeError('Binary asset transform recipe is invalid.');
  }
  const recipe = createBinaryAssetTransformRecipe({
    sourceDigest: value.sourceDigest,
    transformerId: value.transformerId,
    transformerVersion: value.transformerVersion,
    outputMediaType: value.outputMediaType,
    parameters: value.parameters,
  });
  if (
    value.recipeDigest !== recipe.recipeDigest ||
    JSON.stringify(value.parameters) !== JSON.stringify(recipe.parameters)
  ) {
    throw new TypeError('Binary asset transform recipe identity drifted.');
  }
  return recipe;
};

export const isBinaryAssetTransformRecipe = (
  value: unknown
): value is BinaryAssetTransformRecipe => {
  try {
    readBinaryAssetTransformRecipe(value);
    return true;
  } catch {
    return false;
  }
};
