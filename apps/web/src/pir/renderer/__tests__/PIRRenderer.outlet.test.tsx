import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  resolveRouteRuntimeContext,
  type WorkspaceRouteManifest,
} from '@prodivix/shared/router';
import type { ComponentNode, PIRDocument } from '@prodivix/shared/types/pir';
import { normalizeTreeToUiGraph } from '@/pir/graph/normalize';
import { PIRRenderer } from '@/pir/renderer/PIRRenderer';

const createPirDoc = (root: ComponentNode): PIRDocument => ({
  version: '1.3',
  ui: { graph: normalizeTreeToUiGraph(root) },
});

const outletDoc = createPirDoc({
  id: 'root',
  type: 'container',
  children: [
    {
      id: 'outlet',
      type: 'PdxOutlet',
      children: [
        {
          id: 'route-scoped-text',
          type: 'PdxText',
          text: 'Only visible for mdr',
        },
      ],
    },
  ],
});

const routeManifest: WorkspaceRouteManifest = {
  version: '1',
  root: {
    id: 'root',
    children: [
      { id: 'route-home', index: true },
      { id: 'route-mdr', segment: 'mdr', outletNodeId: 'outlet' },
    ],
  },
};

describe('PIRRenderer outlet rendering', () => {
  it('renders PdxOutlet children in design contexts without a route binding', () => {
    render(<PIRRenderer pirDoc={outletDoc} />);

    expect(screen.queryByText('Only visible for mdr')).not.toBeNull();
  });

  it('hides PdxOutlet children when the current route does not match the outlet route scope', () => {
    render(
      <PIRRenderer
        pirDoc={outletDoc}
        routeManifest={routeManifest}
        routeRuntimeContext={resolveRouteRuntimeContext(routeManifest, {
          currentPath: '/',
        })}
      />
    );

    expect(screen.queryByText('Only visible for mdr')).toBeNull();
  });

  it('renders PdxOutlet children when the current route matches the outlet route scope', () => {
    render(
      <PIRRenderer
        pirDoc={outletDoc}
        routeManifest={routeManifest}
        routeRuntimeContext={resolveRouteRuntimeContext(routeManifest, {
          currentPath: '/mdr',
        })}
      />
    );

    expect(screen.queryByText('Only visible for mdr')).not.toBeNull();
  });
});
