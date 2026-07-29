import { createHash } from 'node:crypto';
import {
  EXECUTION_BUILD_BUNDLE_FORMAT,
  EXECUTION_PREVIEW_BUNDLE_FORMAT,
  type ExecutableProjectSnapshot,
  type ExecutionBuildBundle,
  type ExecutionSourceTrace,
} from '@prodivix/runtime-core';
import {
  canonicalJsonText,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';

export const digestGoldenG3V6RemotePreviewBytes = (
  contents: string | Uint8Array
): string => `sha256-${createHash('sha256').update(contents).digest('hex')}`;

/**
 * Encodes the actual build output as a self-contained PreviewBundle payload.
 * Every dist byte is carried as canonical base64 and is decoded again by the
 * public Remote artifact resolver before materialization.
 */
export const encodeGoldenG3V6RemotePreviewBundle = (
  snapshot: ExecutableProjectSnapshot,
  buildBundle: ExecutionBuildBundle
): Uint8Array => {
  if (
    buildBundle.format !== EXECUTION_BUILD_BUNDLE_FORMAT ||
    buildBundle.snapshotDigest !== snapshot.contentDigest ||
    !sameCanonicalJson(buildBundle.target, snapshot.target)
  ) {
    throw new TypeError(
      'Golden V6 Remote Preview build bundle does not match its executable snapshot.'
    );
  }
  const entryFilePath = snapshot.previewPlan.entryFilePath;
  if (!buildBundle.files.some(({ path }) => path === entryFilePath)) {
    throw new TypeError(
      'Golden V6 Remote Preview build bundle is missing its declared HTML entrypoint.'
    );
  }
  return Buffer.from(
    canonicalJsonText({
      format: EXECUTION_PREVIEW_BUNDLE_FORMAT,
      entryFilePath,
      bundle: {
        format: buildBundle.format,
        snapshotDigest: buildBundle.snapshotDigest,
        target: buildBundle.target,
        files: buildBundle.files.map((file) => ({
          path: file.path,
          size: file.size,
          digest: file.digest,
          encoding: 'base64',
          contents: Buffer.from(file.contents).toString('base64'),
        })),
      },
    }),
    'utf8'
  );
};

/** Selects an authored source trace for the bundle descriptor. */
export const goldenG3V6RemotePreviewSourceTrace = (
  snapshot: ExecutableProjectSnapshot
): readonly ExecutionSourceTrace[] => {
  const tracedFile = snapshot.files.find(
    ({ sourceTrace }) => sourceTrace?.length
  );
  return (
    tracedFile?.sourceTrace ??
    Object.freeze([
      Object.freeze({
        sourceRef: Object.freeze({
          kind: 'workspace' as const,
          workspaceId: snapshot.workspace.workspaceId,
        }),
        label: 'Golden G3 V6 Remote Preview executable snapshot',
      }),
    ])
  );
};
