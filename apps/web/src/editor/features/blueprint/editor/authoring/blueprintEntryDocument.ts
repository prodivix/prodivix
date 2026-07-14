import {
  composeRouteManifestWithModules,
  findRouteNodeById,
} from '@prodivix/router';
import {
  selectWorkspacePirDocument,
  type WorkspaceDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const TYPE_PRIORITY: Readonly<Record<string, number>> = Object.freeze({
  'pir-page': 0,
  'pir-layout': 1,
  'pir-component': 2,
});

const isEditablePirDocument = (
  workspace: WorkspaceSnapshot,
  documentId: string | undefined
): documentId is string =>
  Boolean(
    documentId &&
    selectWorkspacePirDocument(workspace, documentId)?.status === 'valid'
  );

const routeDocumentCandidates = (
  workspace: WorkspaceSnapshot
): readonly string[] => {
  const manifest = composeRouteManifestWithModules(
    workspace.routeManifest
  ).manifest;
  const route = workspace.activeRouteNodeId
    ? findRouteNodeById(manifest.root, workspace.activeRouteNodeId)
    : undefined;
  if (!route) return [];
  return [
    route.pageDocId,
    ...Object.values(route.outletBindings ?? {}).map(
      (binding) => binding.pageDocId
    ),
    route.layoutDocId,
  ].filter((documentId): documentId is string => Boolean(documentId));
};

const compareDocuments = (
  left: WorkspaceDocument,
  right: WorkspaceDocument
): number =>
  (TYPE_PRIORITY[left.type] ?? Number.MAX_SAFE_INTEGER) -
    (TYPE_PRIORITY[right.type] ?? Number.MAX_SAFE_INTEGER) ||
  left.path.localeCompare(right.path, undefined, { numeric: true }) ||
  left.id.localeCompare(right.id, undefined, { numeric: true });

/** Keeps Blueprint reachable after another editor leaves a non-PIR document active. */
export const resolveBlueprintEntryDocumentId = (
  workspace: WorkspaceSnapshot,
  activeDocumentId: string | undefined
): string | undefined => {
  if (isEditablePirDocument(workspace, activeDocumentId)) {
    return activeDocumentId;
  }
  const routeDocumentId = routeDocumentCandidates(workspace).find(
    (documentId) => isEditablePirDocument(workspace, documentId)
  );
  if (routeDocumentId) return routeDocumentId;
  return Object.values(workspace.docsById)
    .filter((document) => isEditablePirDocument(workspace, document.id))
    .sort(compareDocuments)[0]?.id;
};
