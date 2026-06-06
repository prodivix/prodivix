import type { WorkspaceDocumentRecord } from '@/editor/editorApi';
import { createDefaultPirDoc } from '@/pir/resolvePirDocument';
import type { WorkspaceVfsNode } from './editorStore.types';

export const createEntityId = (prefix: string): string => {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

export const createWorkspaceDocumentRecord = (
  documentId: string,
  type: WorkspaceDocumentRecord['type'],
  path: string
): WorkspaceDocumentRecord => ({
  id: documentId,
  type,
  path,
  contentRev: 1,
  metaRev: 1,
  content: createDefaultPirDoc(),
});

export const attachDocumentToTree = (
  treeRootId: string | undefined,
  treeById: Record<string, WorkspaceVfsNode>,
  document: WorkspaceDocumentRecord
): { treeRootId: string; treeById: Record<string, WorkspaceVfsNode> } => {
  const normalizedRootId =
    treeRootId && treeById[treeRootId] ? treeRootId : 'root';
  const normalizedTreeById = { ...treeById };
  const rootNode = normalizedTreeById[normalizedRootId];
  if (!rootNode || rootNode.kind !== 'dir') {
    normalizedTreeById[normalizedRootId] = {
      id: normalizedRootId,
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    };
  }
  const docNodeId = `doc-${document.id}`;
  normalizedTreeById[docNodeId] = {
    id: docNodeId,
    kind: 'doc',
    name: document.path.split('/').filter(Boolean).at(-1) || document.id,
    parentId: normalizedRootId,
    docId: document.id,
  };
  const rootChildren = normalizedTreeById[normalizedRootId].children ?? [];
  if (!rootChildren.includes(docNodeId)) {
    normalizedTreeById[normalizedRootId] = {
      ...normalizedTreeById[normalizedRootId],
      children: [...rootChildren, docNodeId],
    };
  }
  return { treeRootId: normalizedRootId, treeById: normalizedTreeById };
};

export const removeDocumentFromTree = (
  treeById: Record<string, WorkspaceVfsNode>,
  documentId: string
): Record<string, WorkspaceVfsNode> => {
  const docNodeId = `doc-${documentId}`;
  if (!treeById[docNodeId]) return treeById;
  const nextTreeById = { ...treeById };
  delete nextTreeById[docNodeId];
  Object.keys(nextTreeById).forEach((nodeId) => {
    const node = nextTreeById[nodeId];
    if (node.kind !== 'dir') return;
    const children = node.children ?? [];
    if (!children.includes(docNodeId)) return;
    nextTreeById[nodeId] = {
      ...node,
      children: children.filter((childId) => childId !== docNodeId),
    };
  });
  return nextTreeById;
};
