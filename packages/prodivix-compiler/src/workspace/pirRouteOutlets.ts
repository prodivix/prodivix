import type {
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from '@prodivix/router';

/**
 * Which PIR nodes the RouteManifest designates as route outlets, per document.
 *
 * An outlet is an ordinary PIR node that the manifest points at by id, so this
 * is fully resolvable at build time. Both a route's own `outletNodeId` and its
 * named `outletBindings` target nodes inside that route's layout document —
 * the layout is the document that owns the node, so outlets are recorded
 * against it rather than against the child page.
 */
export const collectRouteOutletNodeIdsByDocumentId = (
  manifest: WorkspaceRouteManifest | undefined
): ReadonlyMap<string, ReadonlySet<string>> => {
  const byDocumentId = new Map<string, Set<string>>();
  const record = (documentId: string | undefined, nodeId: string): void => {
    if (!documentId) return;
    const existing = byDocumentId.get(documentId) ?? new Set<string>();
    existing.add(nodeId);
    byDocumentId.set(documentId, existing);
  };
  const visit = (node: WorkspaceRouteNode): void => {
    const ownerDocumentId = node.layoutDocId ?? node.pageDocId;
    if (node.outletNodeId) record(ownerDocumentId, node.outletNodeId);
    for (const binding of Object.values(node.outletBindings ?? {})) {
      record(ownerDocumentId, binding.outletNodeId);
    }
    for (const child of node.children ?? []) visit(child);
  };
  if (manifest?.root) visit(manifest.root);
  return byDocumentId;
};
