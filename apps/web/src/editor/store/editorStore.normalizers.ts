import type { PIRDocument } from '@/core/types/engine.types';
import type {
  WorkspaceDocumentRecord,
  WorkspaceSnapshot,
} from '@/editor/editorApi';
import { normalizePirDocument } from '@/pir/resolvePirDocument';
import { isWorkspaceCodeDocumentContent } from '@/workspace';
import {
  DEFAULT_ROUTE_MANIFEST,
  type WorkspaceRouteManifest,
  type WorkspaceRouteNode,
  type WorkspaceVfsNode,
} from './editorStore.types';

const normalizeRouteNode = (
  value: unknown,
  fallbackId: string
): WorkspaceRouteNode => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const node: WorkspaceRouteNode = {
    id:
      typeof source.id === 'string' && source.id.trim()
        ? source.id
        : fallbackId,
  };
  if (typeof source.segment === 'string') node.segment = source.segment;
  if (typeof source.index === 'boolean') node.index = source.index;
  if (typeof source.layoutDocId === 'string')
    node.layoutDocId = source.layoutDocId;
  if (typeof source.pageDocId === 'string') node.pageDocId = source.pageDocId;
  if (typeof source.outletNodeId === 'string')
    node.outletNodeId = source.outletNodeId;
  const children = Array.isArray(source.children) ? source.children : [];
  if (children.length) {
    node.children = children.map((child, index) =>
      normalizeRouteNode(child, `${node.id}-child-${index + 1}`)
    );
  }
  return node;
};

export const normalizeRouteManifest = (
  routeManifest: WorkspaceSnapshot['routeManifest'] | undefined
): WorkspaceRouteManifest => {
  const source =
    routeManifest &&
    typeof routeManifest === 'object' &&
    !Array.isArray(routeManifest)
      ? (routeManifest as Record<string, unknown>)
      : {};
  const version =
    typeof source.version === 'string' && source.version.trim()
      ? source.version
      : DEFAULT_ROUTE_MANIFEST.version;
  return {
    version,
    root: {
      ...normalizeRouteNode(source.root, DEFAULT_ROUTE_MANIFEST.root.id),
      id: DEFAULT_ROUTE_MANIFEST.root.id,
    },
  };
};

export const hasRouteNodeId = (
  node: WorkspaceRouteNode,
  nodeId: string
): boolean => {
  if (node.id === nodeId) return true;
  const children = node.children ?? [];
  for (const child of children) {
    if (hasRouteNodeId(child, nodeId)) return true;
  }
  return false;
};

export const resolveDefaultActiveRouteNodeId = (
  manifest: WorkspaceRouteManifest
): string => {
  const firstChild = manifest.root.children?.[0];
  return firstChild?.id ?? manifest.root.id;
};

export const resolveActiveRouteNodeId = (
  manifest: WorkspaceRouteManifest,
  candidateIds: Array<string | undefined>
): string => {
  for (const candidate of candidateIds) {
    const normalizedCandidate = candidate?.trim();
    if (!normalizedCandidate) continue;
    if (hasRouteNodeId(manifest.root, normalizedCandidate)) {
      return normalizedCandidate;
    }
  }
  return resolveDefaultActiveRouteNodeId(manifest);
};

const normalizePirContent = (
  content: WorkspaceDocumentRecord['content'] | undefined
): PIRDocument => {
  return normalizePirDocument(content);
};

export const isPirWorkspaceDocumentType = (
  type: WorkspaceDocumentRecord['type']
): boolean =>
  type === 'pir-page' || type === 'pir-layout' || type === 'pir-component';

export const isWorkspacePirDocument = (
  document: WorkspaceDocumentRecord | undefined
): document is WorkspaceDocumentRecord & { content: PIRDocument } =>
  Boolean(document && isPirWorkspaceDocumentType(document.type));

export const normalizeWorkspaceDocument = (
  document: WorkspaceDocumentRecord
): WorkspaceDocumentRecord => {
  if (isPirWorkspaceDocumentType(document.type)) {
    return {
      ...document,
      content: normalizePirContent(document.content),
    };
  }

  if (document.type === 'code') {
    if (!isWorkspaceCodeDocumentContent(document.content)) {
      throw new Error(
        `Workspace code document ${document.id} must use the code content wrapper.`
      );
    }
    return document;
  }

  return document;
};

const normalizeVfsNode = (
  value: unknown,
  fallbackId: string
): WorkspaceVfsNode | null => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  if (!source) return null;
  const kind =
    source.kind === 'doc' ? 'doc' : source.kind === 'dir' ? 'dir' : null;
  if (!kind) return null;
  const id =
    typeof source.id === 'string' && source.id.trim() ? source.id : fallbackId;
  const name =
    typeof source.name === 'string' && source.name.trim() ? source.name : id;
  const parentId =
    source.parentId === null
      ? null
      : typeof source.parentId === 'string'
        ? source.parentId
        : null;
  const node: WorkspaceVfsNode = { id, kind, name, parentId };
  if (kind === 'dir') {
    const children = Array.isArray(source.children)
      ? source.children.filter(
          (item): item is string => typeof item === 'string'
        )
      : [];
    node.children = children;
  }
  if (
    kind === 'doc' &&
    typeof source.docId === 'string' &&
    source.docId.trim()
  ) {
    node.docId = source.docId;
  }
  return node;
};

const createFallbackWorkspaceTree = (
  documentsById: Record<string, WorkspaceDocumentRecord>
): { treeRootId: string; treeById: Record<string, WorkspaceVfsNode> } => {
  const treeRootId = 'root';
  const documentIds = Object.keys(documentsById).sort((a, b) => {
    const left = documentsById[a];
    const right = documentsById[b];
    return left.path.localeCompare(right.path);
  });
  const rootChildren = documentIds.map((documentId) => `doc-${documentId}`);
  const treeById: Record<string, WorkspaceVfsNode> = {
    [treeRootId]: {
      id: treeRootId,
      kind: 'dir',
      name: '/',
      parentId: null,
      children: rootChildren,
    },
  };
  documentIds.forEach((documentId) => {
    const document = documentsById[documentId];
    treeById[`doc-${documentId}`] = {
      id: `doc-${documentId}`,
      kind: 'doc',
      name: document.path.split('/').filter(Boolean).at(-1) || document.id,
      parentId: treeRootId,
      docId: documentId,
    };
  });
  return { treeRootId, treeById };
};

export const normalizeWorkspaceTree = (
  tree: WorkspaceSnapshot['tree'] | undefined,
  documentsById: Record<string, WorkspaceDocumentRecord>
): { treeRootId: string; treeById: Record<string, WorkspaceVfsNode> } => {
  const source =
    tree && typeof tree === 'object' && !Array.isArray(tree)
      ? (tree as Record<string, unknown>)
      : {};
  const treeRootId =
    typeof source.treeRootId === 'string' && source.treeRootId.trim()
      ? source.treeRootId
      : '';
  const treeByIdSource =
    source.treeById &&
    typeof source.treeById === 'object' &&
    !Array.isArray(source.treeById)
      ? (source.treeById as Record<string, unknown>)
      : {};
  const normalizedTreeById: Record<string, WorkspaceVfsNode> = {};
  Object.entries(treeByIdSource).forEach(([nodeId, nodeValue]) => {
    const node = normalizeVfsNode(nodeValue, nodeId);
    if (!node) return;
    if (node.kind === 'doc') {
      if (!node.docId || !documentsById[node.docId]) return;
    }
    normalizedTreeById[node.id] = node;
  });
  if (!treeRootId || !normalizedTreeById[treeRootId]) {
    return createFallbackWorkspaceTree(documentsById);
  }
  return { treeRootId, treeById: normalizedTreeById };
};
