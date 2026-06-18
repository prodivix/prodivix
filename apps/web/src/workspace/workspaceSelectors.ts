import type { PIRDocument } from '@prodivix/shared/types/pir';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';
import type {
  StableWorkspaceDocument,
  StableWorkspaceDocumentType,
  StableWorkspaceRouteManifest,
  StableWorkspaceSnapshot,
  StableWorkspaceVfsNode,
  WorkspaceDocumentId,
  WorkspaceVfsNodeId,
} from './types';

export type WorkspaceTreeViewNode = {
  id: WorkspaceVfsNodeId;
  kind: StableWorkspaceVfsNode['kind'];
  name: string;
  path: string;
  parentId: WorkspaceVfsNodeId | null;
  docId?: WorkspaceDocumentId;
  document?: StableWorkspaceDocument;
  children: WorkspaceTreeViewNode[];
};

const ROOT_PATH = '/';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const joinPath = (parentPath: string, name: string): string => {
  if (!name || name === ROOT_PATH) return parentPath;
  if (parentPath === ROOT_PATH) return `/${name}`;
  return `${parentPath}/${name}`;
};

export const selectWorkspaceSnapshot = (
  snapshot: StableWorkspaceSnapshot | undefined
): StableWorkspaceSnapshot | undefined => snapshot;

export const selectRouteManifest = (
  snapshot: StableWorkspaceSnapshot | undefined
): StableWorkspaceRouteManifest | undefined => snapshot?.routeManifest;

export const selectDocumentById = (
  snapshot: StableWorkspaceSnapshot | undefined,
  documentId: WorkspaceDocumentId | undefined
): StableWorkspaceDocument | undefined =>
  documentId ? snapshot?.docsById[documentId] : undefined;

export const selectActiveDocument = (
  snapshot: StableWorkspaceSnapshot | undefined
): StableWorkspaceDocument | undefined =>
  selectDocumentById(snapshot, snapshot?.activeDocumentId);

export const isPirDocumentContent = (
  content: unknown
): content is PIRDocument => {
  if (!isRecord(content) || content.version !== CURRENT_PIR_VERSION) {
    return false;
  }
  if (!isRecord(content.ui) || 'root' in content.ui) return false;
  return isRecord(content.ui.graph);
};

export const selectActivePirDocument = (
  snapshot: StableWorkspaceSnapshot | undefined
): PIRDocument | undefined => {
  const document = selectActiveDocument(snapshot);
  if (!document || !isPirDocumentContent(document.content)) return undefined;
  return document.content;
};

export const selectDocumentsByType = (
  snapshot: StableWorkspaceSnapshot | undefined,
  type: StableWorkspaceDocumentType
): StableWorkspaceDocument[] =>
  snapshot
    ? Object.values(snapshot.docsById).filter(
        (document) => document.type === type
      )
    : [];

export const selectDocumentPath = (
  snapshot: StableWorkspaceSnapshot | undefined,
  documentId: WorkspaceDocumentId | undefined
): string | undefined => {
  if (!snapshot || !documentId) return undefined;

  const documentNode = Object.values(snapshot.treeById).find(
    (node) => node.kind === 'doc' && node.docId === documentId
  );
  if (!documentNode) return undefined;

  const segments: string[] = [];
  let current: StableWorkspaceVfsNode | undefined = documentNode;
  const visited = new Set<WorkspaceVfsNodeId>();

  while (current && current.parentId !== null) {
    if (visited.has(current.id)) return undefined;
    visited.add(current.id);
    segments.unshift(current.name);
    current = snapshot.treeById[current.parentId];
  }

  return `/${segments.join('/')}`;
};

const buildTreeNode = (
  snapshot: StableWorkspaceSnapshot,
  nodeId: WorkspaceVfsNodeId,
  parentPath: string,
  visited: Set<WorkspaceVfsNodeId>
): WorkspaceTreeViewNode | undefined => {
  if (visited.has(nodeId)) return undefined;
  const node = snapshot.treeById[nodeId];
  if (!node) return undefined;

  const nextVisited = new Set(visited);
  nextVisited.add(nodeId);

  const path =
    node.parentId === null ? ROOT_PATH : joinPath(parentPath, node.name);
  const children =
    node.kind === 'dir'
      ? (node.children ?? [])
          .map((childId) => buildTreeNode(snapshot, childId, path, nextVisited))
          .filter((child): child is WorkspaceTreeViewNode => Boolean(child))
      : [];

  return {
    id: node.id,
    kind: node.kind,
    name: node.name,
    path,
    parentId: node.parentId,
    ...(node.docId ? { docId: node.docId } : {}),
    ...(node.docId && snapshot.docsById[node.docId]
      ? { document: snapshot.docsById[node.docId] }
      : {}),
    children,
  };
};

export const selectWorkspaceTree = (
  snapshot: StableWorkspaceSnapshot | undefined
): WorkspaceTreeViewNode | undefined =>
  snapshot
    ? buildTreeNode(snapshot, snapshot.treeRootId, ROOT_PATH, new Set())
    : undefined;
