import type {
  BinaryAssetBlobReference,
  BinaryAssetMaterialization,
} from './binaryAsset.types';

export const BINARY_ASSET_GIT_MANIFEST_FORMAT =
  'prodivix.binary-asset-git-manifest.v1' as const;

export const BINARY_ASSET_GIT_MANIFEST_PATH = '.prodivix/assets.json' as const;
export const BINARY_ASSET_GIT_ATTRIBUTES_BEGIN =
  '# prodivix binary assets begin' as const;
export const BINARY_ASSET_GIT_ATTRIBUTES_END =
  '# prodivix binary assets end' as const;

export const BINARY_ASSET_GIT_PROJECTION_LIMITS = Object.freeze({
  maxAssets: 4_096,
  maxTotalBytes: 256 * 1024 * 1024,
  maxPathLength: 1_024,
  maxWorkspaceIdentityLength: 256,
  maxRevisionLength: 512,
});

export type BinaryAssetGitProjectionPolicy =
  | Readonly<{ kind: 'binary' }>
  | Readonly<{ kind: 'git-lfs'; minimumBytes: number }>;

/** Canonical authoring identity required by a Git adapter. */
export type BinaryAssetGitProjectionSource = Readonly<{
  assetDocumentId: string;
  path: string;
  contentRevision: string;
  metadataRevision: string;
  reference: BinaryAssetBlobReference;
}>;

export type BinaryAssetGitManifestEntry = Readonly<{
  assetDocumentId: string;
  path: string;
  contentRevision: string;
  metadataRevision: string;
  digest: string;
  byteLength: number;
  mediaType: string;
  representation: 'binary' | 'git-lfs';
}>;

export type BinaryAssetGitManifest = Readonly<{
  format: typeof BINARY_ASSET_GIT_MANIFEST_FORMAT;
  workspaceId: string;
  workspaceRevision: string;
  policy: BinaryAssetGitProjectionPolicy;
  assets: readonly BinaryAssetGitManifestEntry[];
}>;

export type BinaryAssetGitProjectionFile = Readonly<{
  path: string;
  kind: 'asset' | 'lfs-pointer' | 'attributes' | 'manifest';
  mediaType: string;
  contents: Uint8Array;
}>;

/** Exact objects a provider uploads through the Git LFS batch/object protocol. */
export type BinaryAssetGitLfsObject = Readonly<{
  oid: string;
  byteLength: number;
  contents: Uint8Array;
  assetDocumentIds: readonly string[];
}>;

export type BinaryAssetGitProjectionDiagnosticCode =
  'AST-1201' | 'AST-1202' | 'AST-1203' | 'AST-1204' | 'AST-1205' | 'AST-1206';

export type BinaryAssetGitProjectionDiagnostic = Readonly<{
  code: BinaryAssetGitProjectionDiagnosticCode;
  message: string;
  assetDocumentId?: string;
  path?: string;
}>;

export type CreateBinaryAssetGitProjectionInput = Readonly<{
  workspaceId: string;
  workspaceRevision: string;
  policy: BinaryAssetGitProjectionPolicy;
  sources: readonly BinaryAssetGitProjectionSource[];
  materializations: readonly BinaryAssetMaterialization[];
}>;

export type BinaryAssetGitProjection = Readonly<{
  manifest: BinaryAssetGitManifest;
  files: readonly BinaryAssetGitProjectionFile[];
  lfsObjects: readonly BinaryAssetGitLfsObject[];
}>;

export type BinaryAssetGitProjectionResult =
  | Readonly<{
      status: 'ready';
      projection: BinaryAssetGitProjection;
      diagnostics: readonly [];
    }>
  | Readonly<{
      status: 'blocked';
      diagnostics: readonly BinaryAssetGitProjectionDiagnostic[];
    }>;
