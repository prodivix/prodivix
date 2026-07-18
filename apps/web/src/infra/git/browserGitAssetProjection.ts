import {
  BINARY_ASSET_GIT_ATTRIBUTES_BEGIN,
  BINARY_ASSET_GIT_ATTRIBUTES_END,
  BINARY_ASSET_GIT_MANIFEST_FORMAT,
  BINARY_ASSET_GIT_MANIFEST_PATH,
  type BinaryAssetGitLfsObject,
  type BinaryAssetGitProjection,
} from '@prodivix/assets';
import type { BrowserGitClient } from './browserGitClient';

const GIT_ATTRIBUTES_PATH = '.gitattributes';

export type BrowserGitLfsUploadReceipt = Readonly<{
  kind: 'stored' | 'existing';
  oid: string;
  byteLength: number;
}>;

export type BrowserGitLfsObjectUploader = Readonly<{
  upload(object: BinaryAssetGitLfsObject): Promise<BrowserGitLfsUploadReceipt>;
}>;

export type BrowserGitAssetProjectionClient = Pick<
  BrowserGitClient,
  | 'readWorkingFileBytes'
  | 'writeWorkingFileBytes'
  | 'deleteWorkingFile'
  | 'add'
  | 'remove'
>;

export type BrowserGitAssetProjectionApplyResult = Readonly<{
  stagedPaths: readonly string[];
  removedPaths: readonly string[];
  lfsObjects: readonly BrowserGitLfsUploadReceipt[];
}>;

const decodeUtf8 = (contents: Uint8Array, label: string): string => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contents);
  } catch {
    throw new TypeError(`${label} must be valid UTF-8.`);
  }
};

const bytesEqual = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength &&
  left.every((value, index) => right[index] === value);

const containsAsciiControlCharacter = (value: string): boolean =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });

const markerIndex = (value: string, marker: string, fromIndex = 0): number =>
  value.indexOf(marker, fromIndex);

const stripManagedAttributes = (value: string): string => {
  const begin = markerIndex(value, BINARY_ASSET_GIT_ATTRIBUTES_BEGIN);
  const end = markerIndex(value, BINARY_ASSET_GIT_ATTRIBUTES_END);
  if (begin < 0 && end < 0) return value;
  if (
    begin < 0 ||
    end < begin ||
    markerIndex(value, BINARY_ASSET_GIT_ATTRIBUTES_BEGIN, begin + 1) >= 0 ||
    markerIndex(value, BINARY_ASSET_GIT_ATTRIBUTES_END, end + 1) >= 0 ||
    (begin > 0 && value[begin - 1] !== '\n')
  ) {
    throw new TypeError('Managed Git attributes region is ambiguous.');
  }
  const afterMarker = end + BINARY_ASSET_GIT_ATTRIBUTES_END.length;
  if (
    afterMarker < value.length &&
    value[afterMarker] !== '\n' &&
    !(value[afterMarker] === '\r' && value[afterMarker + 1] === '\n')
  ) {
    throw new TypeError('Managed Git attributes end marker is malformed.');
  }
  const regionEnd = value.startsWith('\r\n', afterMarker)
    ? afterMarker + 2
    : value[afterMarker] === '\n'
      ? afterMarker + 1
      : afterMarker;
  return `${value.slice(0, begin)}${value.slice(regionEnd)}`;
};

const mergeManagedAttributes = (
  existing: Uint8Array | undefined,
  generated: Uint8Array | undefined
): Uint8Array | undefined => {
  let base = existing
    ? stripManagedAttributes(decodeUtf8(existing, 'Existing .gitattributes'))
    : '';
  if (!generated) return base ? new TextEncoder().encode(base) : undefined;
  const region = decodeUtf8(generated, 'Generated .gitattributes');
  if (
    !region.startsWith(`${BINARY_ASSET_GIT_ATTRIBUTES_BEGIN}\n`) ||
    !region.endsWith(`${BINARY_ASSET_GIT_ATTRIBUTES_END}\n`)
  ) {
    throw new TypeError('Generated Git attributes region is invalid.');
  }
  if (base && !base.endsWith('\n')) base += '\n';
  return new TextEncoder().encode(`${base}${region}`);
};

const normalizePreviousManifestPath = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !value ||
    value.startsWith('/') ||
    value.includes('\\') ||
    containsAsciiControlCharacter(value) ||
    value
      .split('/')
      .some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new TypeError('Existing Git asset manifest path is invalid.');
  }
  const lower = value.toLocaleLowerCase('en-US');
  if (
    lower === '.git' ||
    lower.startsWith('.git/') ||
    lower === GIT_ATTRIBUTES_PATH ||
    lower === BINARY_ASSET_GIT_MANIFEST_PATH
  ) {
    throw new TypeError('Existing Git asset manifest path is reserved.');
  }
  return value;
};

const readPreviousAssetPaths = (
  contents: Uint8Array | undefined
): readonly string[] => {
  if (!contents) return Object.freeze([]);
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(contents, 'Existing Git asset manifest'));
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new TypeError('Existing Git asset manifest is invalid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('Existing Git asset manifest is invalid.');
  }
  const manifest = parsed as { format?: unknown; assets?: unknown };
  if (
    manifest.format !== BINARY_ASSET_GIT_MANIFEST_FORMAT ||
    !Array.isArray(manifest.assets)
  ) {
    throw new TypeError('Existing Git asset manifest format is unsupported.');
  }
  const paths = manifest.assets.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new TypeError('Existing Git asset manifest entry is invalid.');
    }
    return normalizePreviousManifestPath((entry as { path?: unknown }).path);
  });
  if (new Set(paths).size !== paths.length) {
    throw new TypeError('Existing Git asset manifest paths are duplicated.');
  }
  return Object.freeze(paths.sort());
};

const uploadLfsObjects = async (
  projection: BinaryAssetGitProjection,
  uploader: BrowserGitLfsObjectUploader | undefined
): Promise<readonly BrowserGitLfsUploadReceipt[]> => {
  if (projection.lfsObjects.length && !uploader) {
    throw new Error(
      'Git LFS projection requires an authorized object upload adapter.'
    );
  }
  const receipts: BrowserGitLfsUploadReceipt[] = [];
  for (const object of projection.lfsObjects) {
    const receipt = await uploader!.upload(object);
    if (
      (receipt.kind !== 'stored' && receipt.kind !== 'existing') ||
      receipt.oid !== object.oid ||
      receipt.byteLength !== object.byteLength
    ) {
      throw new TypeError('Git LFS object upload identity drifted.');
    }
    receipts.push(Object.freeze({ ...receipt }));
  }
  return Object.freeze(receipts);
};

/** Uploads LFS objects first, then reconciles and stages the generated Git asset tree. */
export const applyBrowserGitAssetProjection = async (input: {
  client: BrowserGitAssetProjectionClient;
  projection: BinaryAssetGitProjection;
  lfsUploader?: BrowserGitLfsObjectUploader;
}): Promise<BrowserGitAssetProjectionApplyResult> => {
  const [existingManifest, existingAttributes] = await Promise.all([
    input.client.readWorkingFileBytes(BINARY_ASSET_GIT_MANIFEST_PATH),
    input.client.readWorkingFileBytes(GIT_ATTRIBUTES_PATH),
  ]);
  const previousPaths = readPreviousAssetPaths(existingManifest);
  const currentPaths = new Set(
    input.projection.manifest.assets.map((entry) => entry.path)
  );
  const removedPaths = previousPaths.filter((path) => !currentPaths.has(path));
  const attributesFile = input.projection.files.find(
    (file) => file.path === GIT_ATTRIBUTES_PATH
  );
  const mergedAttributes = mergeManagedAttributes(
    existingAttributes,
    attributesFile?.contents
  );

  // No working tree or index mutation occurs until every required LFS object is durable.
  const lfsObjects = await uploadLfsObjects(
    input.projection,
    input.lfsUploader
  );
  for (const path of removedPaths) {
    await input.client.deleteWorkingFile(path);
    await input.client.remove(path);
  }

  const stagedPaths: string[] = [];
  for (const file of input.projection.files) {
    if (file.path === GIT_ATTRIBUTES_PATH) continue;
    await input.client.writeWorkingFileBytes(file.path, file.contents);
    stagedPaths.push(file.path);
  }
  if (mergedAttributes) {
    if (
      !existingAttributes ||
      !bytesEqual(existingAttributes, mergedAttributes)
    ) {
      await input.client.writeWorkingFileBytes(
        GIT_ATTRIBUTES_PATH,
        mergedAttributes
      );
      stagedPaths.push(GIT_ATTRIBUTES_PATH);
    }
  } else if (existingAttributes) {
    await input.client.deleteWorkingFile(GIT_ATTRIBUTES_PATH);
    await input.client.remove(GIT_ATTRIBUTES_PATH);
    removedPaths.push(GIT_ATTRIBUTES_PATH);
  }
  if (stagedPaths.length) await input.client.add(stagedPaths);
  return Object.freeze({
    stagedPaths: Object.freeze([...stagedPaths].sort()),
    removedPaths: Object.freeze([...removedPaths].sort()),
    lfsObjects,
  });
};
