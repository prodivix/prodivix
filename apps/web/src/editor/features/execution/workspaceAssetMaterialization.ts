import {
  createBinaryAssetMaterialization,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  isWorkspaceAssetDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { editorApi } from '@/editor/editorApi';
import { isLocalProjectId } from '@/editor/localProjectStore';
import { getLocalWorkspaceAssetBlob } from '@/editor/localWorkspaceAssetBlobStore';

/** Resolves canonical asset references before Compiler execution; the Compiler never receives auth or network access. */
export const materializeWorkspaceBinaryAssets = async (input: {
  workspace: WorkspaceSnapshot;
  token: string | null | undefined;
  signal?: AbortSignal;
}): Promise<readonly BinaryAssetMaterialization[]> => {
  const assets = Object.values(input.workspace.docsById)
    .filter((document) => document.type === 'asset')
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.id.localeCompare(right.id)
    );
  if (!assets.length) return Object.freeze([]);
  const localWorkspace = isLocalProjectId(input.workspace.id);
  if (!localWorkspace && !input.token) {
    throw new Error(
      'AST-3001: Binary assets require an authorized blob materialization adapter.'
    );
  }
  const contentsByIdentity = new Map<string, Promise<Uint8Array>>();
  const materializations = await Promise.all(
    assets.map(async (document) => {
      if (!isWorkspaceAssetDocumentContent(document.content)) {
        throw new TypeError(`Asset ${document.id} is invalid.`);
      }
      const identity = `${document.content.blob.digest}\0${document.content.blob.byteLength}\0${document.content.blob.mediaType}`;
      let contents = contentsByIdentity.get(identity);
      if (!contents) {
        contents = localWorkspace
          ? getLocalWorkspaceAssetBlob({
              workspaceId: input.workspace.id,
              assetDocumentId: document.id,
              reference: document.content.blob,
              ...(input.signal ? { signal: input.signal } : {}),
            }).then((materialization) => {
              if (!materialization) {
                throw new Error(
                  `AST-1001: Local asset ${document.id} is unavailable.`
                );
              }
              return materialization.contents;
            })
          : editorApi
              .getWorkspaceAssetBlob(
                input.token!,
                input.workspace.id,
                document.id,
                document.content.blob,
                input.signal ? { signal: input.signal } : {}
              )
              .then((materialization) => materialization.contents);
        contentsByIdentity.set(identity, contents);
      }
      return createBinaryAssetMaterialization({
        assetDocumentId: document.id,
        reference: document.content.blob,
        contents: await contents,
      });
    })
  );
  return Object.freeze(materializations);
};
