import { useEffect, useMemo } from 'react';
import { logRouteDebug } from '@prodivix/pir-react-renderer';
import {
  composeRouteManifestWithModules,
  resolveOutletBinding,
  resolveRouteRuntimeContext,
} from '@prodivix/router';
import {
  selectWorkspacePirDocument,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

export function useActiveRoutePreview(
  workspace: WorkspaceSnapshot,
  currentPath: string
) {
  const composedRouteManifest = useMemo(
    () => composeRouteManifestWithModules(workspace.routeManifest).manifest,
    [workspace.routeManifest]
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

  useEffect(() => {
    const pageDocId = routeRuntimeContext.matchChain
      .slice()
      .reverse()
      .find((match) => match.pageDocId)?.pageDocId;
    const pageRead = pageDocId
      ? selectWorkspacePirDocument(workspace, pageDocId)
      : undefined;
    logRouteDebug('active route preview resolved', {
      currentPath,
      activeRouteNodeId: routeRuntimeContext.activeRouteNodeId,
      matchedPath: routeRuntimeContext.matchedPath,
      outletNodeId: outletBinding?.outletNodeId,
      pageDocId,
      pageDocumentStatus: pageRead?.status,
      pageRootNodeId:
        pageRead?.status === 'valid'
          ? pageRead.decodedContent.ui.graph.rootId
          : undefined,
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
    routeRuntimeContext,
    workspace,
  ]);

  return {
    composedRouteManifest,
    routeRuntimeContext,
    activeRouteNodeId: routeRuntimeContext.activeRouteNodeId,
    activeRouteNode,
    outletBinding,
    outletTargetNodeId: outletBinding?.outletNodeId,
  };
}
