import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import type { WorkspaceVfsNode } from '@/editor/store/editorStore.types';
import { isWorkspaceCodeDocumentContent } from '@/workspace';
import {
  inferMimeByCodeFileName,
  type CodeResourceNode,
} from './codeResourceModel';

const nowIso = () => new Date().toISOString();
const CODE_RESOURCE_ROOT_FOLDERS = new Set(['scripts', 'styles', 'shaders']);

export const normalizeCodeResourcePath = (path: string) =>
  path
    .trim()
    .replace(/^\/+/, '')
    .replace(/^code\//, '');

export const createCodeResourceFolderNode = (
  id: string,
  name: string,
  path: string,
  parentId: string | null,
  source: CodeResourceNode['source'] = 'workspace-document'
): CodeResourceNode => ({
  id,
  name,
  type: 'folder',
  path,
  parentId,
  source,
  category: 'document',
  mime: 'inode/directory',
  updatedAt: nowIso(),
  children: [],
});

const ensureFolder = (
  foldersByPath: Map<string, CodeResourceNode>,
  parentPath: string,
  name: string
) => {
  const path = parentPath ? `${parentPath}/${name}` : name;
  const existing = foldersByPath.get(path);
  if (existing) return existing;
  const parent = foldersByPath.get(parentPath || 'code');
  const folder = createCodeResourceFolderNode(
    path,
    name,
    path,
    parent?.id ?? null
  );
  foldersByPath.set(path, folder);
  parent?.children?.push(folder);
  return folder;
};

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
    paths.set(nodeId, currentPath);
    if (node.kind === 'dir') {
      (node.children ?? []).forEach((childId) => walk(childId, currentPath));
    }
  };
  walk(rootId, '');
  return paths;
};

export const buildCodeResourceTreeFromWorkspaceVfs = (
  documentsById: Record<string, WorkspaceDocumentRecord>,
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>
): CodeResourceNode => {
  const root = createCodeResourceFolderNode('code-root', 'code', 'code', null);
  const pathsByNodeId = buildWorkspacePathByNodeId(treeRootId, treeById);
  const nodesByWorkspaceNodeId = new Map<string, CodeResourceNode>();
  nodesByWorkspaceNodeId.set(root.id, root);

  const sortedNodes = Object.values(treeById).sort((left, right) => {
    const leftPath = pathsByNodeId.get(left.id) ?? left.name;
    const rightPath = pathsByNodeId.get(right.id) ?? right.name;
    return leftPath.localeCompare(rightPath);
  });

  sortedNodes.forEach((node) => {
    if (node.parentId === null || node.kind !== 'dir') return;
    const normalizedPath = normalizeCodeResourcePath(
      pathsByNodeId.get(node.id) ?? node.name
    );
    const rootSegment = normalizedPath.split('/').filter(Boolean)[0];
    if (!rootSegment || !CODE_RESOURCE_ROOT_FOLDERS.has(rootSegment)) return;
    const parent = node.parentId
      ? (nodesByWorkspaceNodeId.get(node.parentId) ?? root)
      : root;
    const path = `code/${normalizedPath}`;
    const folder = createCodeResourceFolderNode(
      node.id,
      node.name,
      path,
      parent.id,
      'workspace-vfs'
    );
    nodesByWorkspaceNodeId.set(node.id, folder);
    parent.children?.push(folder);
  });

  sortedNodes.forEach((node) => {
    if (node.kind !== 'doc' || !node.docId) return;
    const document = documentsById[node.docId];
    const normalizedPath = normalizeCodeResourcePath(document?.path ?? '');
    const rootSegment = normalizedPath.split('/').filter(Boolean)[0];
    if (
      !document ||
      document.type !== 'code' ||
      !isWorkspaceCodeDocumentContent(document.content) ||
      !rootSegment ||
      !CODE_RESOURCE_ROOT_FOLDERS.has(rootSegment)
    ) {
      return;
    }
    const parent = node.parentId
      ? (nodesByWorkspaceNodeId.get(node.parentId) ?? root)
      : root;
    const fileName =
      node.name ||
      document.path.split('/').filter(Boolean).at(-1) ||
      document.id;
    const mime = inferMimeByCodeFileName(fileName);
    parent.children?.push({
      id: document.id,
      name: fileName,
      type: 'file',
      parentId: parent.id,
      path: `code/${normalizedPath}`,
      source: 'workspace-vfs',
      category: 'document',
      mime,
      size: new TextEncoder().encode(document.content.source).length,
      textContent: document.content.source,
      contentRef: `data:${mime};charset=utf-8,${encodeURIComponent(document.content.source)}`,
      updatedAt: document.updatedAt,
    });
  });

  return root;
};

export const findCodeResourceNodeById = (
  node: CodeResourceNode,
  nodeId: string
): CodeResourceNode | undefined => {
  if (node.id === nodeId) return node;
  for (const child of node.children ?? []) {
    const found = findCodeResourceNodeById(child, nodeId);
    if (found) return found;
  }
  return undefined;
};

export const flattenCodeResourceFiles = (
  tree: CodeResourceNode
): Array<CodeResourceNode & { path: string }> => {
  const files: Array<CodeResourceNode & { path: string }> = [];
  const walk = (node: CodeResourceNode) => {
    if (node.type === 'file') files.push({ ...node, path: node.path });
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  return files;
};

export const buildCodeResourceFilesFromWorkspaceDocuments = (
  documentsById: Record<string, WorkspaceDocumentRecord>,
  treeRootId?: string,
  treeById: Record<string, WorkspaceVfsNode> = {}
) =>
  flattenCodeResourceFiles(
    buildCodeResourceTreeFromWorkspaceVfs(documentsById, treeRootId, treeById)
  );
