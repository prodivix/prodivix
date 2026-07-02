import { useMemo } from 'react';
import type React from 'react';
import { type PdxComponent } from '@prodivix/shared';
import {
  flattenRouteManifest,
  matchRouteManifest,
  normalizeRoutePath,
  resolveRouteMatchChain,
  type RouteModule,
  type WorkspaceRouteManifest,
} from '@prodivix/shared/router';
import './PdxRoute.scss';

type PdxRouteScope = 'workspace' | 'module';

interface PdxRouteSpecificProps {
  routeScope?: PdxRouteScope;
  moduleScope?: string;
  routeManifest?: WorkspaceRouteManifest;
  routeModule?: RouteModule;
  activeRouteNodeId?: string;
  debugPath?: string;
  emptyText?: string;
  children?: React.ReactNode;
}

export interface PdxRouteProps extends PdxComponent, PdxRouteSpecificProps {}

const toRouteModuleManifest = (
  routeModule: RouteModule | undefined
): WorkspaceRouteManifest | null =>
  routeModule
    ? {
        version: routeModule.version,
        root: routeModule.root,
      }
    : null;

function PdxRoute({
  routeScope = 'workspace',
  moduleScope,
  routeManifest: routeManifestProp,
  routeModule,
  activeRouteNodeId,
  debugPath,
  emptyText = 'No route module selected.',
  children,
  className,
  style,
  id,
  dataAttributes = {},
}: PdxRouteProps) {
  const routeManifest = useMemo(
    () => routeManifestProp ?? toRouteModuleManifest(routeModule),
    [routeManifestProp, routeModule]
  );
  const projection = useMemo(() => {
    if (!routeManifest) return null;
    const matchChain = activeRouteNodeId?.trim()
      ? resolveRouteMatchChain(routeManifest, activeRouteNodeId)
      : matchRouteManifest(routeManifest, normalizeRoutePath(debugPath ?? '/'));
    const activeRouteNode =
      matchChain.filter((node) => node.id !== routeManifest.root.id).at(-1) ??
      null;
    if (!activeRouteNode) return null;
    const activeRoutePath =
      flattenRouteManifest(routeManifest).find(
        (item) => item.id === activeRouteNode.id
      )?.path ?? normalizeRoutePath(debugPath ?? '/');
    return {
      routeNodeId: activeRouteNode.id,
      path: activeRoutePath,
    };
  }, [activeRouteNodeId, debugPath, routeManifest]);

  const content =
    children ??
    (projection ? (
      <div className="PdxRouteEmpty">{projection.path}</div>
    ) : (
      <div className="PdxRouteEmpty">{emptyText}</div>
    ));

  return (
    <div
      className={`PdxRoute ${className ?? ''}`.trim()}
      style={style as React.CSSProperties | undefined}
      id={id}
      data-route-scope={routeScope}
      data-route-module-id={routeModule?.moduleId ?? moduleScope}
      data-route-node-id={projection?.routeNodeId}
      data-route-projected-path={projection?.path}
      {...dataAttributes}
    >
      {content}
    </div>
  );
}

export default PdxRoute;
