import type {
  RuntimeFilesystemAssetUploadReceipt,
  RuntimeFilesystemAssetUploadRequest,
} from '@prodivix/prodivix-compiler';
import type { BinaryAssetBlobUploadResult } from '@prodivix/assets';
import { editorApi } from '@/editor/editorApi';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { putLocalWorkspaceAssetBlob } from '@/editor/localWorkspaceAssetBlobStore';

const verifyUpload = (
  request: RuntimeFilesystemAssetUploadRequest,
  upload: BinaryAssetBlobUploadResult
): BinaryAssetBlobUploadResult => {
  const expected = request.expectedReference;
  const actual = upload.reference;
  if (
    actual.kind !== expected.kind ||
    actual.digest !== expected.digest ||
    actual.byteLength !== expected.byteLength ||
    actual.mediaType !== expected.mediaType
  ) {
    throw new TypeError(
      'AST-2003: Runtime filesystem Asset upload identity drifted.'
    );
  }
  return Object.freeze({ kind: upload.kind, reference: actual });
};

/** Uploads all selected bytes before returning receipts accepted by the pure planner. */
export const uploadRuntimeFilesystemAssets = async (input: {
  workspaceId: string;
  token: string | null | undefined;
  uploads: readonly RuntimeFilesystemAssetUploadRequest[];
}): Promise<readonly RuntimeFilesystemAssetUploadReceipt[]> => {
  if (!input.uploads.length) return Object.freeze([]);
  const localWorkspace = isLocalProjectId(input.workspaceId);
  if (!localWorkspace && !input.token) {
    throw new Error(
      'AST-3001: Sign in before importing a runtime filesystem Asset.'
    );
  }
  return Object.freeze(
    await Promise.all(
      input.uploads.map(async (request) => {
        const upload = localWorkspace
          ? await putLocalWorkspaceAssetBlob({
              workspaceId: input.workspaceId,
              contents: request.contents,
              mediaType: request.mediaType,
            })
          : await editorApi.putWorkspaceAssetBlob(
              input.token!,
              input.workspaceId,
              request.contents,
              request.mediaType
            );
        return Object.freeze({
          changeId: request.changeId,
          upload: verifyUpload(request, upload),
        });
      })
    )
  );
};
