import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { WorkspaceRouteNode } from '@/editor/store/useEditorStore';
import type { RouteCanvasDiagnostic } from './canvasTypes';

export const isComponentNode = (value: unknown): value is ComponentNode => {
  if (!value || typeof value !== 'object') return false;
  const record = value as { id?: unknown; type?: unknown };
  return typeof record.id === 'string' && typeof record.type === 'string';
};

export const countOutletNodes = (node: ComponentNode): number => {
  if (!node || typeof node !== 'object') return 0;
  const selfCount = node.type === 'PdxOutlet' ? 1 : 0;
  const childCount = Array.isArray(node.children)
    ? node.children.reduce(
        (total: number, child: unknown) =>
          total + (isComponentNode(child) ? countOutletNodes(child) : 0),
        0
      )
    : 0;
  return selfCount + childCount;
};

export const hasNodeId = (node: ComponentNode, nodeId: string): boolean => {
  if (node.id === nodeId) return true;
  const children = node.children ?? [];
  return children.some((child) => hasNodeId(child, nodeId));
};

export const createRouteCanvasDiagnostics = (
  activeRouteNode: WorkspaceRouteNode | null,
  rootNode: ComponentNode
): RouteCanvasDiagnostic[] => {
  const diagnosticsList: RouteCanvasDiagnostic[] = [];
  if (!activeRouteNode?.layoutDocId) return diagnosticsList;
  const outletCount = countOutletNodes(rootNode);
  if (outletCount === 0) {
    diagnosticsList.push({
      code: 'route-layout-missing-outlet',
      message:
        'Active route layout has no PdxOutlet. Add one to mount child route content.',
    });
  }
  if (outletCount > 1) {
    diagnosticsList.push({
      code: 'route-layout-multi-outlet',
      message:
        'Active layout has multiple PdxOutlet nodes. Only one outlet is supported in preview.',
    });
  }
  if (!activeRouteNode.pageDocId) {
    diagnosticsList.push({
      code: 'route-layout-missing-page',
      message: 'Active route layout is missing pageDocId for outlet content.',
    });
  }
  if (
    activeRouteNode.outletNodeId &&
    !hasNodeId(rootNode, activeRouteNode.outletNodeId)
  ) {
    diagnosticsList.push({
      code: 'route-layout-outlet-node-missing',
      message:
        'Bound outletNodeId is not found in current layout document. Rebind the outlet in Inspector.',
    });
  }
  return diagnosticsList;
};
