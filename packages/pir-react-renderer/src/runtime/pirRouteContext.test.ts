import { describe, expect, it } from 'vitest';
import {
  resolveRouteRuntimeContext,
  type WorkspaceRouteManifest,
} from '@prodivix/router';
import { resolvePdxRouteRendererProps } from './pirRouteContext';

const routeManifest: WorkspaceRouteManifest = {
  version: '1',
  root: {
    id: 'root',
    children: [
      {
        id: 'route-settings',
        segment: 'settings',
      },
    ],
  },
  modules: {
    account: {
      moduleId: 'account',
      version: '1',
      root: {
        id: 'account-root',
        children: [
          {
            id: 'account-profile',
            segment: 'profile',
          },
        ],
      },
    },
  },
};

describe('resolvePdxRouteRendererProps', () => {
  it('injects RouteModule data for module-scoped PdxRoute nodes', () => {
    const props = resolvePdxRouteRendererProps(
      {
        routeScope: 'module',
        moduleScope: 'account',
        debugPath: '/profile',
      },
      { routeManifest }
    );

    expect(props.routeModule).toBe(routeManifest.modules?.account);
    expect(props.debugPath).toBe('/profile');
  });

  it('injects the workspace manifest and active route for workspace-scoped PdxRoute nodes', () => {
    const routeRuntimeContext = resolveRouteRuntimeContext(routeManifest, {
      currentPath: '/settings',
    });
    const props = resolvePdxRouteRendererProps(
      {
        routeScope: 'workspace',
      },
      {
        routeManifest,
        routeRuntimeContext,
      }
    );

    expect(props.routeManifest).toBe(routeManifest);
    expect(props.activeRouteNodeId).toBe('route-settings');
  });

  it('keeps explicit PdxRoute active route ids authoritative', () => {
    const props = resolvePdxRouteRendererProps(
      {
        routeScope: 'workspace',
        activeRouteNodeId: 'route-local',
      },
      {
        routeManifest,
        activeRouteNodeId: 'route-settings',
      }
    );

    expect(props.activeRouteNodeId).toBe('route-local');
  });
});
