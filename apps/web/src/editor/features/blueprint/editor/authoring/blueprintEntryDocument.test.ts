import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { resolveBlueprintEntryDocumentId } from './blueprintEntryDocument';

const pirContent = (name: string) => ({
  metadata: { name },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: { id: 'root', kind: 'element' as const, type: 'main' },
      },
      childIdsById: { root: [] },
      order: { strategy: 'childIdsById' as const },
    },
  },
});

const workspace = {
  id: 'workspace-1',
  workspaceRev: 4,
  routeRev: 2,
  opSeq: 7,
  treeRootId: 'root-dir',
  treeById: {
    'root-dir': {
      id: 'root-dir',
      kind: 'dir' as const,
      name: '',
      parentId: null,
      children: ['animation-doc', 'page-doc', 'component-doc'],
    },
    'animation-doc': {
      id: 'animation-doc',
      kind: 'doc' as const,
      name: 'motion.pir-animation.json',
      parentId: 'root-dir',
      docId: 'animation-doc',
    },
    'page-doc': {
      id: 'page-doc',
      kind: 'doc' as const,
      name: 'home.pir.json',
      parentId: 'root-dir',
      docId: 'page-doc',
    },
    'component-doc': {
      id: 'component-doc',
      kind: 'doc' as const,
      name: 'card.pir.json',
      parentId: 'root-dir',
      docId: 'component-doc',
    },
  },
  docsById: {
    'animation-doc': {
      id: 'animation-doc',
      type: 'pir-animation' as const,
      name: 'Motion',
      path: '/animation.pir-animation.json',
      contentRev: 1,
      metaRev: 1,
      content: { version: '1', timelines: [] },
    },
    'page-doc': {
      id: 'page-doc',
      type: 'pir-page' as const,
      name: 'Home',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: pirContent('Home'),
    },
    'component-doc': {
      id: 'component-doc',
      type: 'pir-component' as const,
      name: 'Card',
      path: '/components/card.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        ...pirContent('Card'),
        componentContract: {
          propsById: {},
          eventsById: {},
          slotsById: {},
          variantAxesById: {},
        },
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'route-root',
      children: [{ id: 'route-home', segment: 'home', pageDocId: 'page-doc' }],
    },
  },
  activeRouteNodeId: 'route-home',
} satisfies WorkspaceSnapshot;

describe('resolveBlueprintEntryDocumentId', () => {
  it('prefers the active route page after NodeGraph or Animation', () => {
    expect(resolveBlueprintEntryDocumentId(workspace, 'animation-doc')).toBe(
      'page-doc'
    );
  });

  it('keeps an explicitly active Component document', () => {
    expect(resolveBlueprintEntryDocumentId(workspace, 'component-doc')).toBe(
      'component-doc'
    );
  });
});
