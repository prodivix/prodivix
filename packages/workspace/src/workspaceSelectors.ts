import type { PIRDocument } from '@prodivix/shared/types/pir';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';
import type { WorkspaceRouteManifest } from '@prodivix/router';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
  WorkspaceDocumentId,
  WorkspaceVfsNodeId,
} from './types';

export type WorkspacePirDocumentType = Extract<
  WorkspaceDocumentType,
  'pir-page' | 'pir-layout' | 'pir-component'
>;

export type WorkspacePirDocument = WorkspaceDocument & {
  type: WorkspacePirDocumentType;
  content: PIRDocument;
};

export type WorkspaceTreeViewNode = {
  id: WorkspaceVfsNodeId;
  kind: WorkspaceVfsNode['kind'];
  name: string;
  path: string;
  parentId: WorkspaceVfsNodeId | null;
  docId?: WorkspaceDocumentId;
  document?: WorkspaceDocument;
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
  snapshot: WorkspaceSnapshot | undefined
): WorkspaceSnapshot | undefined => snapshot;

export const selectRouteManifest = (
  snapshot: WorkspaceSnapshot | undefined
): WorkspaceRouteManifest | undefined => snapshot?.routeManifest;

export const selectDocumentById = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: WorkspaceDocumentId | undefined
): WorkspaceDocument | undefined =>
  documentId ? snapshot?.docsById[documentId] : undefined;

export const selectActiveDocument = (
  snapshot: WorkspaceSnapshot | undefined
): WorkspaceDocument | undefined =>
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
  snapshot: WorkspaceSnapshot | undefined
): WorkspacePirDocument | undefined => {
  const document = selectActiveDocument(snapshot);
  if (
    !document ||
    (document.type !== 'pir-page' &&
      document.type !== 'pir-layout' &&
      document.type !== 'pir-component') ||
    !isPirDocumentContent(document.content)
  ) {
    return undefined;
  }
  return document as WorkspacePirDocument;
};

export const selectActivePirWorkspaceDocument = selectActivePirDocument;

export const selectDocumentsByType = (
  snapshot: WorkspaceSnapshot | undefined,
  type: WorkspaceDocumentType
): WorkspaceDocument[] =>
  snapshot
    ? Object.values(snapshot.docsById).filter(
        (document) => document.type === type
      )
    : [];

export const selectDocumentPath = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: WorkspaceDocumentId | undefined
): string | undefined => {
  if (!snapshot || !documentId) return undefined;

  const documentNode = Object.values(snapshot.treeById).find(
    (node) => node.kind === 'doc' && node.docId === documentId
  );
  if (!documentNode) return undefined;

  const segments: string[] = [];
  let current: WorkspaceVfsNode | undefined = documentNode;
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
  snapshot: WorkspaceSnapshot,
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
  snapshot: WorkspaceSnapshot | undefined
): WorkspaceTreeViewNode | undefined =>
  snapshot
    ? buildTreeNode(snapshot, snapshot.treeRootId, ROOT_PATH, new Set())
    : undefined;
