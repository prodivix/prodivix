import {
  selectWorkspaceNodeGraphDocumentResults,
  type WorkspaceNodeGraphReadResult,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export type WorkspaceNodeGraphListItem = Readonly<{
  id: string;
  name: string;
  path: string;
  status: WorkspaceNodeGraphReadResult['status'];
  read: WorkspaceNodeGraphReadResult;
}>;

const GRAPH_FILE_SUFFIX = '.graph.json';
const GRAPH_FILE_PATTERN = /(?:\.pir-graph|\.graph)?\.json$/i;

const getFileName = (path: string): string =>
  path.replaceAll('\\', '/').split('/').filter(Boolean).at(-1) ?? path;

export const getWorkspaceNodeGraphDisplayName = (
  document: WorkspaceNodeGraphReadResult['document']
): string => {
  const source = document.name?.trim() || getFileName(document.path);
  return source.replace(GRAPH_FILE_PATTERN, '').trim() || document.id;
};

export const listWorkspaceNodeGraphs = (
  workspace: WorkspaceSnapshot | undefined
): readonly WorkspaceNodeGraphListItem[] =>
  selectWorkspaceNodeGraphDocumentResults(workspace)
    .map((read) => ({
      id: read.document.id,
      name: getWorkspaceNodeGraphDisplayName(read.document),
      path: read.document.path,
      status: read.status,
      read,
    }))
    .sort(
      (left, right) =>
        left.path.localeCompare(right.path) || left.id.localeCompare(right.id)
    );

export const selectWorkspaceNodeGraphId = (
  documents: readonly WorkspaceNodeGraphListItem[],
  activeDocumentId: string | undefined
): string | undefined =>
  documents.some((document) => document.id === activeDocumentId)
    ? activeDocumentId
    : (documents.find((document) => document.status === 'valid')?.id ??
      documents[0]?.id);

const normalizeGraphName = (value: string): string =>
  value.trimStart().slice(0, 40).replace(/[\\/]/g, '-').trim() || 'Untitled';

const getDirectory = (path: string): string => {
  const normalized = path.replaceAll('\\', '/');
  const separator = normalized.lastIndexOf('/');
  return separator <= 0 ? '' : normalized.slice(0, separator);
};

export const createAvailableNodeGraphPath = (input: {
  workspace: WorkspaceSnapshot;
  name: string;
  directory?: string;
  excludeDocumentId?: string;
}): Readonly<{ name: string; path: string }> => {
  const baseName = normalizeGraphName(input.name);
  const directory = (input.directory ?? '/graphs').replace(/\/+$/, '');
  const usedPaths = new Set(
    Object.values(input.workspace.docsById)
      .filter((document) => document.id !== input.excludeDocumentId)
      .map((document) => document.path.toLocaleLowerCase())
  );
  let suffix = 1;
  while (true) {
    const name = suffix === 1 ? baseName : `${baseName} ${suffix}`;
    const path = `${directory}/${name}${GRAPH_FILE_SUFFIX}`;
    if (!usedPaths.has(path.toLocaleLowerCase())) return { name, path };
    suffix += 1;
  }
};

export const createRenamedNodeGraphPath = (input: {
  workspace: WorkspaceSnapshot;
  documentId: string;
  currentPath: string;
  name: string;
}): Readonly<{ name: string; path: string }> =>
  createAvailableNodeGraphPath({
    workspace: input.workspace,
    name: input.name,
    directory: getDirectory(input.currentPath),
    excludeDocumentId: input.documentId,
  });

export const createWorkspaceNodeGraphDocumentId = (
  workspace: WorkspaceSnapshot
): string => {
  let suffix = 0;
  let candidate: string;
  do {
    const random =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().slice(0, 12)
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    candidate = `graph-${random}${suffix ? `-${suffix}` : ''}`;
    suffix += 1;
  } while (workspace.docsById[candidate]);
  return candidate;
};
