import { transformWithEsbuild } from 'vite';
import { describe, expect, it } from 'vitest';
import type { PIRComponentContract, PIRDocument, PIRNode } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '@prodivix/workspace';
import { compileWorkspacePirReactModules } from '#src/react/workspaceCompiler';
import { createPirReactModuleId } from '#src/react/moduleNaming';

const contract: PIRComponentContract = {
  propsById: {
    title: {
      id: 'title',
      name: 'Title',
      typeRef: 'string',
      defaultValue: 'Fallback title',
    },
  },
  eventsById: {
    activate: { id: 'activate', name: 'Activate' },
  },
  slotsById: {
    content: {
      id: 'content',
      name: 'Content',
      propsById: {
        label: { id: 'label', name: 'Label', typeRef: 'string' },
      },
    },
  },
  variantAxesById: {
    density: {
      id: 'density',
      name: 'Density',
      defaultOptionId: 'comfortable',
      optionsById: {
        comfortable: { id: 'comfortable', name: 'Comfortable' },
        compact: { id: 'compact', name: 'Compact' },
      },
    },
  },
};

const createDocument = (
  id: string,
  type: 'pir-page' | 'pir-component',
  content: PIRDocument
): WorkspaceDocument => ({
  id,
  type,
  path: `/${id}.pir.json`,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createWorkspace = (
  documents: readonly WorkspaceDocument[]
): WorkspaceSnapshot => {
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: documents.map(({ id }) => `node-${id}`),
    },
  };
  for (const document of documents) {
    treeById[`node-${document.id}`] = {
      id: `node-${document.id}`,
      kind: 'doc',
      name: `${document.id}.pir.json`,
      parentId: 'root',
      docId: document.id,
    };
  }
  return {
    id: 'compiler-current-conformance',
    workspaceRev: 9,
    routeRev: 1,
    opSeq: 2,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

const createDefinition = (): WorkspaceDocument => {
  const nodes: PIRNode[] = [
    { id: 'definition-root', kind: 'element', type: 'section' },
    {
      id: 'title',
      kind: 'element',
      type: 'h2',
      text: { kind: 'component-prop', memberId: 'title' },
      props: {
        'data-density': { kind: 'component-variant', memberId: 'density' },
      },
    },
    {
      id: 'activate-button',
      kind: 'element',
      type: 'button',
      events: {
        click: {
          kind: 'emit-component-event',
          memberId: 'activate',
          payload: { kind: 'component-prop', memberId: 'title' },
        },
      },
    },
    {
      id: 'content-outlet',
      kind: 'component-slot-outlet',
      slotMemberId: 'content',
      bindings: {
        props: {
          label: { kind: 'component-prop', memberId: 'title' },
        },
      },
    },
    {
      id: 'fallback',
      kind: 'element',
      type: 'p',
      text: { kind: 'literal', value: 'Definition fallback' },
    },
  ];
  return createDocument('card', 'pir-component', {
    metadata: { name: 'Card' },
    componentContract: contract,
    ui: {
      graph: {
        rootId: 'definition-root',
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        childIdsById: {
          'definition-root': ['title', 'activate-button', 'content-outlet'],
          title: [],
          'activate-button': [],
          'content-outlet': ['fallback'],
          fallback: [],
        },
      },
    },
  });
};

const createConsumer = (): WorkspaceDocument => {
  const makeInstance = (id: string): PIRNode => ({
    id,
    kind: 'component-instance',
    componentDocumentId: 'card',
    bindings: {
      props: { title: { kind: 'literal', value: id } },
      events: { activate: { kind: 'open-url', href: '/details' } },
      variants: { density: 'compact' },
    },
  });
  const nodes: PIRNode[] = [
    { id: 'page-root', kind: 'element', type: 'main' },
    makeInstance('with-fallback'),
    makeInstance('with-empty-slot'),
  ];
  return createDocument('page', 'pir-page', {
    metadata: { name: 'Page' },
    ui: {
      graph: {
        rootId: 'page-root',
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        childIdsById: {
          'page-root': ['with-fallback', 'with-empty-slot'],
          'with-fallback': [],
          'with-empty-slot': [],
        },
        regionsById: {
          'with-empty-slot': { content: [] },
        },
      },
    },
  });
};

describe('PIR Component compiler conformance', () => {
  it('preserves shared modules, scopes, slot presence and source trace', async () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([createConsumer(), createDefinition()]),
      entryDocumentId: 'page',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.dependencyFirstDocumentIds).toEqual(['card', 'page']);
    expect(result.modules).toHaveLength(2);
    expect(result.contribution.roots?.at(-1)?.sourceRef).toEqual({
      domain: 'workspace-document',
      id: 'page',
      path: '/page.pir.json',
    });
    const definitionModule = result.modules[0]!;
    const consumerModule = result.modules[1]!;
    expect(
      result.modules.every((module) =>
        ['useCallback', 'useState'].every((hook) =>
          module.imports.some(
            ({ source, imported, kind }) =>
              source === 'react' && imported === hook && kind === 'named'
          )
        )
      )
    ).toBe(true);
    expect(
      consumerModule.imports.filter(
        ({ targetModuleId }) =>
          targetModuleId === createPirReactModuleId('card')
      )
    ).toHaveLength(1);
    expect(
      consumerModule.sourceTrace.map(
        ({ sourceRef }) => `${sourceRef.id}:${sourceRef.path}`
      )
    ).toEqual(
      expect.arrayContaining([
        'page:/ui/graph/nodesById/with-empty-slot',
        'page:/ui/graph/regionsById/with-empty-slot/content',
        'card:/componentContract/propsById/title',
        'card:/componentContract/slotsById/content',
      ])
    );
    expect(
      definitionModule.sourceTrace.every(
        ({ artifactId }) => artifactId === createPirReactModuleId('card')
      )
    ).toBe(true);
    await Promise.all(
      result.modules.map((module) =>
        transformWithEsbuild(module.body, `${module.suggestedName}.tsx`, {
          loader: 'tsx',
          target: 'es2022',
          jsx: 'automatic',
        })
      )
    );
  });

  it('returns blocking diagnostics and no PIR modules for a cycle', () => {
    const cycleDocument = (id: string, target: string) =>
      createDocument(id, 'pir-component', {
        componentContract: {
          propsById: {},
          eventsById: {},
          slotsById: {},
          variantAxesById: {},
        },
        ui: {
          graph: {
            rootId: `${id}-instance`,
            nodesById: {
              [`${id}-instance`]: {
                id: `${id}-instance`,
                kind: 'component-instance',
                componentDocumentId: target,
                bindings: { props: {}, events: {}, variants: {} },
              },
            },
            childIdsById: { [`${id}-instance`]: [] },
          },
        },
      });
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([
        cycleDocument('component-a', 'component-b'),
        cycleDocument('component-b', 'component-a'),
      ]),
      entryDocumentId: 'component-a',
    });

    expect(result.status).toBe('blocked');
    expect(result.modules).toEqual([]);
    expect(result.contribution.modules).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS_COMPONENT_CYCLE',
        severity: 'error',
      })
    );
  });

  it('does not emit partial modules for a Contract mismatch', () => {
    const definition = createDefinition();
    const invalidInstance: PIRNode = {
      id: 'invalid-instance',
      kind: 'component-instance',
      componentDocumentId: 'card',
      bindings: {
        props: { missing: { kind: 'literal', value: true } },
        events: {},
        variants: {},
      },
    };
    const page = createDocument('page', 'pir-page', {
      ui: {
        graph: {
          rootId: invalidInstance.id,
          nodesById: { [invalidInstance.id]: invalidInstance },
          childIdsById: { [invalidInstance.id]: [] },
        },
      },
    });
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([page, definition]),
      entryDocumentId: page.id,
    });

    expect(result.status).toBe('blocked');
    expect(result.modules).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'WKS_COMPONENT_PROP_NOT_EXPOSED',
        severity: 'error',
      })
    );
  });
});
