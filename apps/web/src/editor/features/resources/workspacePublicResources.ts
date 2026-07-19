import { createBinaryAssetPublicDeliveryRequest } from '@prodivix/assets';
import {
  isWorkspaceAssetDocumentContent,
  type WorkspaceAssetDocumentContent,
  type WorkspaceDocument,
  type WorkspaceVfsNode,
} from '@prodivix/workspace';
import {
  normalizeWorkspaceResourcePath,
  RESOURCE_ROOTS,
} from './workspaceResourceDocuments';
import {
  PUBLIC_TREE_ROOT_ID,
  type PublicFileCategory,
  type PublicResourceNode,
} from './publicTree';

const nowIso = () => new Date().toISOString();

export const createPublicResourceAssetDeliveryRequest = (mediaType: string) => {
  return createBinaryAssetPublicDeliveryRequest(mediaType);
};

const toPublicCategory = (value: unknown): PublicFileCategory =>
  value === 'image' ||
  value === 'font' ||
  value === 'document' ||
  value === 'other'
    ? value
    : 'other';

const createFolderNode = (
  id: string,
  name: string,
  path: string,
  parentId: string | null
): PublicResourceNode => ({
  id,
  name,
  type: 'folder',
  path,
  parentId,
  updatedAt: nowIso(),
  children: [],
});

const buildWorkspacePathByNodeId = (
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>
) => {
  const paths = new Map<string, string>();
  const rootId = treeRootId && treeById[treeRootId] ? treeRootId : undefined;
  if (!rootId) return paths;
  const walk = (nodeId: string, parentPath: string) => {
    const node = treeById[nodeId];
    if (!node) return;
    const currentPath =
      node.parentId === null
        ? ''
        : parentPath
          ? `${parentPath}/${node.name}`
          : node.name;
    paths.set(nodeId, normalizeWorkspaceResourcePath(currentPath));
    if (node.kind === 'dir') {
      (node.children ?? []).forEach((childId) => walk(childId, currentPath));
    }
  };
  walk(rootId, '');
  return paths;
};

const createRoot = () =>
  createFolderNode(
    PUBLIC_TREE_ROOT_ID,
    'public',
    RESOURCE_ROOTS.public.replace(/^\//, ''),
    null
  );

export const buildPublicResourceTreeFromWorkspace = (
  documentsById: Record<string, WorkspaceDocument>,
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>
): PublicResourceNode => {
  const root = createRoot();
  const pathsByNodeId = buildWorkspacePathByNodeId(treeRootId, treeById);
  const nodesByWorkspaceNodeId = new Map<string, PublicResourceNode>();
  const rootWorkspaceNode = Object.values(treeById).find(
    (node) =>
      node.kind === 'dir' &&
      pathsByNodeId.get(node.id) === RESOURCE_ROOTS.public
  );
  if (rootWorkspaceNode) {
    nodesByWorkspaceNodeId.set(rootWorkspaceNode.id, root);
  }

  Object.values(treeById)
    .sort((left, right) =>
      (pathsByNodeId.get(left.id) ?? left.name).localeCompare(
        pathsByNodeId.get(right.id) ?? right.name
      )
    )
    .forEach((node) => {
      if (
        node.kind !== 'dir' ||
        node.id === rootWorkspaceNode?.id ||
        !pathsByNodeId.get(node.id)?.startsWith(`${RESOURCE_ROOTS.public}/`)
      ) {
        return;
      }
      const parent = node.parentId
        ? (nodesByWorkspaceNodeId.get(node.parentId) ?? root)
        : root;
      const path = (pathsByNodeId.get(node.id) ?? '').replace(/^\//, '');
      const folder = createFolderNode(node.id, node.name, path, parent.id);
      nodesByWorkspaceNodeId.set(node.id, folder);
      parent.children?.push(folder);
    });

  Object.values(treeById)
    .filter((node) => node.kind === 'doc' && node.docId)
    .sort((left, right) =>
      (pathsByNodeId.get(left.id) ?? left.name).localeCompare(
        pathsByNodeId.get(right.id) ?? right.name
      )
    )
    .forEach((node) => {
      if (!node.docId) return;
      const document = documentsById[node.docId];
      if (
        !document ||
        document.type !== 'asset' ||
        !isWorkspaceAssetDocumentContent(document.content) ||
        !normalizeWorkspaceResourcePath(document.path).startsWith(
          `${RESOURCE_ROOTS.public}/`
        )
      ) {
        return;
      }
      const content: WorkspaceAssetDocumentContent = document.content;
      const parent = node.parentId
        ? (nodesByWorkspaceNodeId.get(node.parentId) ?? root)
        : root;
      parent.children?.push({
        id: document.id,
        name: node.name,
        type: 'file',
        path: normalizeWorkspaceResourcePath(document.path).replace(/^\//, ''),
        parentId: parent.id,
        category: toPublicCategory(content.category),
        mime: content.mime,
        size: content.size,
        blobReference: content.blob,
        updatedAt: document.updatedAt,
      });
    });

  return root;
};
