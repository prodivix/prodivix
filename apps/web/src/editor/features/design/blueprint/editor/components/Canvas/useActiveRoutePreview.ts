import { useEffect, useMemo } from 'react';
import { isWorkspacePirDocument } from '@/editor/store/editorStore.normalizers';
import { useEditorStore } from '@/editor/store/useEditorStore';
import { materializePirRoot } from '@/pir/graph';
import { logRouteDebug } from '@/pir/renderer/routeDebug';
import {
  composeRouteManifestWithModules,
  resolveOutletBinding,
  resolveRouteRuntimeContext,
} from '@prodivix/shared/router';

export function useActiveRoutePreview(currentPath: string) {
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const composedRouteManifest = useMemo(
    () => composeRouteManifestWithModules(routeManifest).manifest,
    [routeManifest]
  );
  const routeRuntimeContext = useMemo(
    () =>
      resolveRouteRuntimeContext(composedRouteManifest, {
        currentPath,
      }),
    [composedRouteManifest, currentPath]
  );
  const activeRouteNode = useMemo(
    () => routeRuntimeContext.matchChain.at(-1)?.node ?? null,
    [routeRuntimeContext]
  );
  const outletBinding = useMemo(
    () =>
      resolveOutletBinding(
        routeRuntimeContext.matchChain.map((match) => match.node)
      ),
    [routeRuntimeContext]
  );
  const outletContentNode = useMemo(() => {
    const pageDocId = routeRuntimeContext.matchChain
      .slice()
      .reverse()
      .find((match) => match.pageDocId)?.pageDocId;
    if (!pageDocId) return null;
    const pageDoc = workspaceDocumentsById[pageDocId];
    return isWorkspacePirDocument(pageDoc)
      ? materializePirRoot(pageDoc.content)
      : null;
  }, [routeRuntimeContext, workspaceDocumentsById]);
  useEffect(() => {
    const pageDocId = routeRuntimeContext.matchChain
      .slice()
      .reverse()
      .find((match) => match.pageDocId)?.pageDocId;
    const pageDoc = pageDocId ? workspaceDocumentsById[pageDocId] : undefined;
    logRouteDebug('active route preview resolved', {
      currentPath,
      activeRouteNodeId: routeRuntimeContext.activeRouteNodeId,
      matchedPath: routeRuntimeContext.matchedPath,
      outletNodeId: outletBinding?.outletNodeId,
      pageDocId,
      pageDocType: pageDoc?.type,
      isPirPageDoc: Boolean(pageDoc && isWorkspacePirDocument(pageDoc)),
      outletContentNodeId: outletContentNode?.id,
      matchChain: routeRuntimeContext.matchChain.map((match) => ({
        routeNodeId: match.routeNodeId,
        path: match.path,
        pageDocId: match.pageDocId,
        layoutDocId: match.layoutDocId,
      })),
    });
  }, [
    currentPath,
    outletBinding?.outletNodeId,
    outletContentNode?.id,
    routeRuntimeContext,
    workspaceDocumentsById,
  ]);

  return {
    composedRouteManifest,
    routeRuntimeContext,
    activeRouteNodeId: routeRuntimeContext.activeRouteNodeId,
    activeRouteNode,
    outletBinding,
    outletContentNode,
    outletTargetNodeId: outletBinding?.outletNodeId,
  };
}
