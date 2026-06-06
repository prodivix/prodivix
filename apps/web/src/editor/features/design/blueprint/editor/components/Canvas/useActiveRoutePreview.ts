import { useMemo } from 'react';
import { isWorkspacePirDocument } from '@/editor/store/editorStore.normalizers';
import type { WorkspaceRouteNode } from '@/editor/store/useEditorStore';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { materializePirRoot } from '@/pir/graph';

export function useActiveRoutePreview() {
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const activeRouteNodeId = useEditorStore((state) => state.activeRouteNodeId);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const activeRouteNode = useMemo(() => {
    const walk = (node: WorkspaceRouteNode): WorkspaceRouteNode | null => {
      if (!node) return null;
      if (node.id === activeRouteNodeId) return node;
      const children = node.children ?? [];
      for (const child of children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(routeManifest.root);
  }, [activeRouteNodeId, routeManifest.root]);
  const outletContentNode = useMemo(() => {
    const pageDocId = activeRouteNode?.pageDocId;
    if (!pageDocId) return null;
    const pageDoc = workspaceDocumentsById[pageDocId];
    return isWorkspacePirDocument(pageDoc)
      ? materializePirRoot(pageDoc.content)
      : null;
  }, [activeRouteNode, workspaceDocumentsById]);

  return { activeRouteNode, outletContentNode };
}
