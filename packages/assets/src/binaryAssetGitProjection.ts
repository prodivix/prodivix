import { utf8ToBytes } from '@noble/hashes/utils.js';
import {
  createBinaryAssetMaterialization,
  readBinaryAssetBlobReference,
} from './binaryAsset';
import type { BinaryAssetMaterialization } from './binaryAsset.types';
import {
  BINARY_ASSET_GIT_ATTRIBUTES_BEGIN,
  BINARY_ASSET_GIT_ATTRIBUTES_END,
  BINARY_ASSET_GIT_MANIFEST_FORMAT,
  BINARY_ASSET_GIT_MANIFEST_PATH,
  BINARY_ASSET_GIT_PROJECTION_LIMITS,
  type BinaryAssetGitLfsObject,
  type BinaryAssetGitManifest,
  type BinaryAssetGitManifestEntry,
  type BinaryAssetGitProjectionDiagnostic,
  type BinaryAssetGitProjectionFile,
  type BinaryAssetGitProjectionPolicy,
  type BinaryAssetGitProjectionResult,
  type BinaryAssetGitProjectionSource,
  type CreateBinaryAssetGitProjectionInput,
} from './binaryAssetGitProjection.types';

const GIT_ATTRIBUTES_PATH = '.gitattributes';
const GIT_LFS_VERSION = 'https://git-lfs.github.com/spec/v1';
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const REVISION_PATTERN = /^[^\u0000-\u001f\u007f]+$/u;

const normalizedIdentity = (
  value: string,
  label: string,
  maximumLength: number
): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maximumLength ||
    !IDENTITY_PATTERN.test(normalized)
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
};

const normalizedRevision = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > BINARY_ASSET_GIT_PROJECTION_LIMITS.maxRevisionLength ||
    !REVISION_PATTERN.test(normalized)
  ) {
    throw new TypeError(`${label} is invalid.`);
  }
  return normalized;
};

const normalizePolicy = (
  value: BinaryAssetGitProjectionPolicy
): BinaryAssetGitProjectionPolicy => {
  if (value.kind === 'binary') return Object.freeze({ kind: 'binary' });
  if (
    value.kind !== 'git-lfs' ||
    !Number.isSafeInteger(value.minimumBytes) ||
    value.minimumBytes < 0
  ) {
    throw new TypeError('Binary asset Git projection policy is invalid.');
  }
  return Object.freeze({ kind: 'git-lfs', minimumBytes: value.minimumBytes });
};

const normalizeGitPath = (value: string): string | undefined => {
  if (
    typeof value !== 'string' ||
    value !== value.trim() ||
    !value.startsWith('/') ||
    value.length > BINARY_ASSET_GIT_PROJECTION_LIMITS.maxPathLength ||
    /[\u0000-\u001f\u007f\\]/u.test(value)
  ) {
    return undefined;
  }
  const segments = value.slice(1).split('/');
  if (
    !segments.length ||
    segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return undefined;
  }
  const path = segments.join('/');
  const lowerPath = path.toLocaleLowerCase('en-US');
  if (
    lowerPath === GIT_ATTRIBUTES_PATH ||
    lowerPath === BINARY_ASSET_GIT_MANIFEST_PATH ||
    lowerPath === '.git' ||
    lowerPath.startsWith('.git/')
  ) {
    return undefined;
  }
  return path;
};

const referencesEqual = (
  left: BinaryAssetGitProjectionSource['reference'],
  right: BinaryAssetMaterialization['reference']
): boolean =>
  left.kind === right.kind &&
  left.digest === right.digest &&
  left.byteLength === right.byteLength &&
  left.mediaType === right.mediaType;

const diagnostic = (
  code: BinaryAssetGitProjectionDiagnostic['code'],
  message: string,
  source?: Pick<BinaryAssetGitProjectionSource, 'assetDocumentId' | 'path'>
): BinaryAssetGitProjectionDiagnostic =>
  Object.freeze({
    code,
    message,
    ...(source?.assetDocumentId
      ? { assetDocumentId: source.assetDocumentId }
      : {}),
    ...(source?.path ? { path: source.path } : {}),
  });

const sortDiagnostics = (
  diagnostics: BinaryAssetGitProjectionDiagnostic[]
): readonly BinaryAssetGitProjectionDiagnostic[] =>
  Object.freeze(
    [...diagnostics].sort(
      (left, right) =>
        (left.path ?? '').localeCompare(right.path ?? '') ||
        (left.assetDocumentId ?? '').localeCompare(
          right.assetDocumentId ?? ''
        ) ||
        left.code.localeCompare(right.code) ||
        left.message.localeCompare(right.message)
    )
  );

const useGitLfs = (
  policy: BinaryAssetGitProjectionPolicy,
  byteLength: number
): boolean =>
  policy.kind === 'git-lfs' &&
  byteLength > 0 &&
  byteLength >= policy.minimumBytes;

/** Git LFS v1 pointers use the raw SHA-256 hex OID and a trailing LF. */
export const createBinaryAssetGitLfsPointer = (
  materialization: BinaryAssetMaterialization
): Uint8Array => {
  const verified = createBinaryAssetMaterialization(materialization);
  const oid = verified.reference.digest.slice('sha256-'.length);
  return utf8ToBytes(
    `version ${GIT_LFS_VERSION}\noid sha256:${oid}\nsize ${verified.reference.byteLength}\n`
  );
};

const escapeAttributePattern = (path: string): string => {
  const escaped = `/${path}`.replace(/[\\*?\[\]]/gu, (character) =>
    character === '\\' ? '\\\\' : `\\${character}`
  );
  return /[\s"#]/u.test(escaped) ? JSON.stringify(escaped) : escaped;
};

const createAttributesFile = (
  paths: readonly string[]
): BinaryAssetGitProjectionFile =>
  Object.freeze({
    path: GIT_ATTRIBUTES_PATH,
    kind: 'attributes',
    mediaType: 'text/plain',
    contents: utf8ToBytes(
      `${BINARY_ASSET_GIT_ATTRIBUTES_BEGIN}\n${paths
        .map(
          (path) =>
            `${escapeAttributePattern(path)} filter=lfs diff=lfs merge=lfs -text`
        )
        .join('\n')}\n${BINARY_ASSET_GIT_ATTRIBUTES_END}\n`
    ),
  });

const createManifestFile = (
  manifest: BinaryAssetGitManifest
): BinaryAssetGitProjectionFile =>
  Object.freeze({
    path: BINARY_ASSET_GIT_MANIFEST_PATH,
    kind: 'manifest',
    mediaType: 'application/json',
    contents: utf8ToBytes(`${JSON.stringify(manifest, null, 2)}\n`),
  });

/**
 * Projects verified Workspace-owned bytes into deterministic Git blobs and,
 * when explicitly enabled, canonical Git LFS pointers plus upload objects.
 */
export const createBinaryAssetGitProjection = (
  input: CreateBinaryAssetGitProjectionInput
): BinaryAssetGitProjectionResult => {
  const workspaceId = normalizedIdentity(
    input.workspaceId,
    'Binary asset Git Workspace identity',
    BINARY_ASSET_GIT_PROJECTION_LIMITS.maxWorkspaceIdentityLength
  );
  const workspaceRevision = normalizedRevision(
    input.workspaceRevision,
    'Binary asset Git Workspace revision'
  );
  const policy = normalizePolicy(input.policy);
  const diagnostics: BinaryAssetGitProjectionDiagnostic[] = [];
  if (input.sources.length > BINARY_ASSET_GIT_PROJECTION_LIMITS.maxAssets) {
    diagnostics.push(
      diagnostic('AST-1206', 'Git asset projection exceeds its asset budget.')
    );
  }

  const sources: Array<
    BinaryAssetGitProjectionSource & Readonly<{ gitPath: string }>
  > = [];
  const sourceIds = new Set<string>();
  const pathKeys = new Set<string>();
  let totalBytes = 0;
  for (const candidate of input.sources) {
    let assetDocumentId: string;
    try {
      assetDocumentId = normalizedIdentity(
        candidate.assetDocumentId,
        'Binary asset Git document identity',
        BINARY_ASSET_GIT_PROJECTION_LIMITS.maxWorkspaceIdentityLength
      );
    } catch {
      diagnostics.push(
        diagnostic('AST-1204', 'Git asset document identity is invalid.', {
          assetDocumentId: candidate.assetDocumentId,
          path: candidate.path,
        })
      );
      continue;
    }
    const gitPath = normalizeGitPath(candidate.path);
    if (!gitPath) {
      diagnostics.push(
        diagnostic('AST-1204', 'Git asset path is unsafe or reserved.', {
          assetDocumentId,
          path: candidate.path,
        })
      );
      continue;
    }
    let reference: BinaryAssetGitProjectionSource['reference'];
    let contentRevision: string;
    let metadataRevision: string;
    try {
      reference = readBinaryAssetBlobReference(candidate.reference);
      contentRevision = normalizedRevision(
        candidate.contentRevision,
        'Git asset content revision'
      );
      metadataRevision = normalizedRevision(
        candidate.metadataRevision,
        'Git asset metadata revision'
      );
    } catch {
      diagnostics.push(
        diagnostic('AST-1203', 'Git asset reference or revision is invalid.', {
          assetDocumentId,
          path: candidate.path,
        })
      );
      continue;
    }
    const pathKey = gitPath.toLocaleLowerCase('en-US');
    if (sourceIds.has(assetDocumentId) || pathKeys.has(pathKey)) {
      diagnostics.push(
        diagnostic(
          'AST-1204',
          'Git asset identity or checkout path conflicts with another asset.',
          { assetDocumentId, path: candidate.path }
        )
      );
      continue;
    }
    sourceIds.add(assetDocumentId);
    pathKeys.add(pathKey);
    totalBytes += reference.byteLength;
    sources.push(
      Object.freeze({
        assetDocumentId,
        path: candidate.path,
        gitPath,
        contentRevision,
        metadataRevision,
        reference,
      })
    );
  }
  if (totalBytes > BINARY_ASSET_GIT_PROJECTION_LIMITS.maxTotalBytes) {
    diagnostics.push(
      diagnostic('AST-1206', 'Git asset projection exceeds its byte budget.')
    );
  }

  const materializationsById = new Map<string, BinaryAssetMaterialization[]>();
  input.materializations.forEach((candidate, index) => {
    try {
      const verified = createBinaryAssetMaterialization(candidate);
      const entries = materializationsById.get(verified.assetDocumentId) ?? [];
      entries.push(verified);
      materializationsById.set(verified.assetDocumentId, entries);
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'AST-1203',
          error instanceof Error
            ? `Git asset materialization ${index} is invalid: ${error.message}`
            : `Git asset materialization ${index} is invalid.`
        )
      );
    }
  });

  const verifiedById = new Map<string, BinaryAssetMaterialization>();
  for (const source of sources) {
    const candidates = materializationsById.get(source.assetDocumentId) ?? [];
    if (!candidates.length) {
      diagnostics.push(
        diagnostic(
          'AST-1201',
          'Git asset blob materialization is missing.',
          source
        )
      );
      continue;
    }
    if (candidates.length !== 1) {
      diagnostics.push(
        diagnostic(
          'AST-1202',
          'Git asset has duplicate blob materializations.',
          source
        )
      );
      continue;
    }
    const candidate = candidates[0]!;
    if (!referencesEqual(source.reference, candidate.reference)) {
      diagnostics.push(
        diagnostic(
          'AST-1203',
          'Git asset materialization drifted from its canonical reference.',
          source
        )
      );
      continue;
    }
    verifiedById.set(source.assetDocumentId, candidate);
  }
  for (const assetDocumentId of materializationsById.keys()) {
    if (!sourceIds.has(assetDocumentId)) {
      diagnostics.push(
        diagnostic(
          'AST-1205',
          'Git asset materialization is not referenced by the projection.',
          { assetDocumentId, path: '' }
        )
      );
    }
  }
  if (diagnostics.length) {
    return Object.freeze({
      status: 'blocked',
      diagnostics: sortDiagnostics(diagnostics),
    });
  }

  const orderedSources = [...sources].sort(
    (left, right) =>
      left.gitPath.localeCompare(right.gitPath) ||
      left.assetDocumentId.localeCompare(right.assetDocumentId)
  );
  const manifestEntries: BinaryAssetGitManifestEntry[] = [];
  const files: BinaryAssetGitProjectionFile[] = [];
  const lfsPaths: string[] = [];
  const lfsObjectsByOid = new Map<
    string,
    { materialization: BinaryAssetMaterialization; documentIds: string[] }
  >();
  for (const source of orderedSources) {
    const materialization = verifiedById.get(source.assetDocumentId)!;
    const lfs = useGitLfs(policy, source.reference.byteLength);
    manifestEntries.push(
      Object.freeze({
        assetDocumentId: source.assetDocumentId,
        path: source.gitPath,
        contentRevision: source.contentRevision,
        metadataRevision: source.metadataRevision,
        digest: source.reference.digest,
        byteLength: source.reference.byteLength,
        mediaType: source.reference.mediaType,
        representation: lfs ? 'git-lfs' : 'binary',
      })
    );
    if (lfs) {
      const oid = source.reference.digest.slice('sha256-'.length);
      lfsPaths.push(source.gitPath);
      files.push(
        Object.freeze({
          path: source.gitPath,
          kind: 'lfs-pointer',
          mediaType: 'text/plain',
          contents: createBinaryAssetGitLfsPointer(materialization),
        })
      );
      const existing = lfsObjectsByOid.get(oid);
      if (existing) existing.documentIds.push(source.assetDocumentId);
      else {
        lfsObjectsByOid.set(oid, {
          materialization,
          documentIds: [source.assetDocumentId],
        });
      }
    } else {
      files.push(
        Object.freeze({
          path: source.gitPath,
          kind: 'asset',
          mediaType: source.reference.mediaType,
          contents: new Uint8Array(materialization.contents),
        })
      );
    }
  }

  const manifest: BinaryAssetGitManifest = Object.freeze({
    format: BINARY_ASSET_GIT_MANIFEST_FORMAT,
    workspaceId,
    workspaceRevision,
    policy,
    assets: Object.freeze(manifestEntries),
  });
  if (lfsPaths.length) files.push(createAttributesFile(lfsPaths));
  files.push(createManifestFile(manifest));
  files.sort((left, right) => left.path.localeCompare(right.path));
  const lfsObjects: BinaryAssetGitLfsObject[] = [...lfsObjectsByOid.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([oid, entry]) =>
      Object.freeze({
        oid,
        byteLength: entry.materialization.reference.byteLength,
        contents: new Uint8Array(entry.materialization.contents),
        assetDocumentIds: Object.freeze([...entry.documentIds].sort()),
      })
    );
  return Object.freeze({
    status: 'ready',
    diagnostics: Object.freeze([]) as readonly [],
    projection: Object.freeze({
      manifest,
      files: Object.freeze(files),
      lfsObjects: Object.freeze(lfsObjects),
    }),
  });
};
