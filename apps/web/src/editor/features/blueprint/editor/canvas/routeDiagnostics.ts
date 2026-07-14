import type { PIRUiGraph } from '@prodivix/pir';
import type { WorkspaceRouteNode } from '@prodivix/router';
import type { RouteCanvasDiagnostic } from './canvasTypes';

export const countOutletNodes = (graph: PIRUiGraph): number =>
  Object.values(graph.nodesById).filter(
    (node) => node.kind === 'element' && node.type === 'PdxOutlet'
  ).length;

export const createRouteCanvasDiagnostics = (
  activeRouteNode: WorkspaceRouteNode | null,
  graph: PIRUiGraph,
  outletTargetNodeId?: string
): RouteCanvasDiagnostic[] => {
  const diagnostics: RouteCanvasDiagnostic[] = [];
  if (!activeRouteNode?.layoutDocId) return diagnostics;
  const outletCount = countOutletNodes(graph);
  if (outletCount === 0) {
    diagnostics.push({
      code: 'route-layout-missing-outlet',
      message:
        'Active route layout has no PdxOutlet. Add one to mount child route content.',
    });
  }
  if (outletCount > 1) {
    diagnostics.push({
      code: 'route-layout-multi-outlet',
      message:
        'Active layout has multiple PdxOutlet nodes. Only one outlet is supported in preview.',
    });
  }
  if (!activeRouteNode.pageDocId) {
    diagnostics.push({
      code: 'route-layout-missing-page',
      message: 'Active route layout is missing pageDocId for outlet content.',
    });
  }
  if (outletTargetNodeId && !graph.nodesById[outletTargetNodeId]) {
    diagnostics.push({
      code: 'route-layout-outlet-node-missing',
      message:
        'Bound outletNodeId is not found in current layout document. Rebind the outlet in Inspector.',
    });
  }
  return diagnostics;
};
