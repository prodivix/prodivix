import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { PIRDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { AnimationEditorPreviewCanvas } from '@/editor/features/animation/panels/AnimationEditorPreviewCanvas';
import {
  createRendererComponentProjection,
  WebPluginQueryHarness,
} from './webPluginQueryHarness';

const PLUGIN_RUNTIME_TYPE = 'TestPluginBadge';

const createPage = (): PIRDocument => ({
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element', type: 'container' },
        badge: {
          id: 'badge',
          kind: 'element',
          type: PLUGIN_RUNTIME_TYPE,
          text: { kind: 'literal', value: 'plugin badge' },
        },
      },
      childIdsById: { root: ['badge'], badge: [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-animation-preview',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createPage(),
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const PluginBadge = ({
  children,
}: Readonly<{ children?: React.ReactNode }>) => <span>{children}</span>;

describe('Animation preview canvas element resolution', () => {
  it('renders plugin-contributed elements of the previewed page', () => {
    render(
      <WebPluginQueryHarness
        rendererComponents={[
          createRendererComponentProjection(PLUGIN_RUNTIME_TYPE, PluginBadge),
        ]}
      >
        <AnimationEditorPreviewCanvas
          workspace={createWorkspace()}
          entryDocumentId="page-home"
          previewNodeId="badge"
          timeline={undefined}
          cursorMs={0}
          svgFilters={[]}
          zoom={1}
          onZoomChange={() => undefined}
        />
      </WebPluginQueryHarness>
    );

    expect(screen.getByText('plugin badge')).toBeTruthy();
  });
});
