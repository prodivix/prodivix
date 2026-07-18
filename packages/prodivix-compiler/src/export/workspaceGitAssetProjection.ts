import {
  createBinaryAssetGitProjection,
  type BinaryAssetGitProjectionPolicy,
  type BinaryAssetGitProjectionResult,
  type BinaryAssetMaterialization,
} from '@prodivix/assets';
import {
  isWorkspaceAssetDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type CreateWorkspaceGitAssetProjectionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  policy: BinaryAssetGitProjectionPolicy;
  materializations: readonly BinaryAssetMaterialization[];
}>;

/** Maps one exact canonical Workspace revision into the asset-owned Git contract. */
export const createWorkspaceGitAssetProjection = (
  input: CreateWorkspaceGitAssetProjectionInput
): BinaryAssetGitProjectionResult => {
  const assetDocuments = Object.values(input.workspace.docsById)
    .filter((document) => document.type === 'asset')
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.id.localeCompare(right.id)
    );
  return createBinaryAssetGitProjection({
    workspaceId: input.workspace.id,
    workspaceRevision: String(input.workspace.workspaceRev),
    policy: input.policy,
    sources: assetDocuments.map((document) => {
      if (!isWorkspaceAssetDocumentContent(document.content)) {
        throw new TypeError(
          `Canonical Workspace asset ${document.id} is invalid.`
        );
      }
      return Object.freeze({
        assetDocumentId: document.id,
        path: document.path,
        contentRevision: String(document.contentRev),
        metadataRevision: String(document.metaRev),
        reference: document.content.blob,
      });
    }),
    materializations: input.materializations,
  });
};
