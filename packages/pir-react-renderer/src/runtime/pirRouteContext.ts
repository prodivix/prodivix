import type {
  RouteRuntimeContext,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from '@prodivix/router';

export type PdxRouteRendererContext = {
  routeManifest?: WorkspaceRouteManifest;
  activeRouteNodeId?: string;
  routeRuntimeContext?: RouteRuntimeContext;
};

export const resolvePdxRouteRendererProps = (
  props: Record<string, unknown>,
  context: PdxRouteRendererContext
): Record<string, unknown> => {
  if (!context.routeManifest) return props;
  const routeScope = props.routeScope === 'module' ? 'module' : 'workspace';
  if (routeScope === 'module') {
    const moduleScope =
      typeof props.moduleScope === 'string' ? props.moduleScope.trim() : '';
    return {
      ...props,
      routeModule: moduleScope
        ? context.routeManifest.modules?.[moduleScope]
        : undefined,
    };
  }
  return {
    ...props,
    routeManifest: context.routeManifest,
    activeRouteNodeId:
      typeof props.activeRouteNodeId === 'string'
        ? props.activeRouteNodeId
        : (context.routeRuntimeContext?.activeRouteNodeId ??
          context.activeRouteNodeId),
  };
};

const findOutletRouteNodeId = (
  node: WorkspaceRouteNode,
  outletNodeId: string
): string | null => {
  if (node.outletNodeId === outletNodeId) return node.id;
  const namedBindingMatch = Object.values(node.outletBindings ?? {}).find(
    (binding) => binding.outletNodeId === outletNodeId
  );
  if (namedBindingMatch) return node.id;
  for (const child of node.children ?? []) {
    const matched = findOutletRouteNodeId(child, outletNodeId);
    if (matched) return matched;
  }
  return null;
};

export const resolvePdxOutletRouteNodeId = (
  outletNodeId: string,
  context: PdxRouteRendererContext
): string | null => {
  if (!context.routeManifest) return null;
  return findOutletRouteNodeId(context.routeManifest.root, outletNodeId);
};

export const shouldRenderPdxOutletChildren = (
  outletNodeId: string,
  context: PdxRouteRendererContext
): boolean => {
  const scopedRouteNodeId = resolvePdxOutletRouteNodeId(outletNodeId, context);
  if (!scopedRouteNodeId) return true;
  return Boolean(
    context.routeRuntimeContext?.matchChain.some(
      (match) => match.routeNodeId === scopedRouteNodeId
    )
  );
};
