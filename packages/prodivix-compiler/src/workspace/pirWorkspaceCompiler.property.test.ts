import { describe, expect, it } from 'vitest';
import type { PIRDocument, PIRNode } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '@prodivix/workspace';
import { compileWorkspacePirReactModules } from '#src/react/workspaceCompiler';
import { createPirReactModuleId } from '#src/react/moduleNaming';

const emptyContract = () => ({
  propsById: {},
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
});

const createDocument = (
  id: string,
  type: 'pir-page' | 'pir-component',
  root: PIRNode,
  children: readonly PIRNode[] = []
): WorkspaceDocument => {
  const nodes = [root, ...children];
  const content: PIRDocument = {
    ...(type === 'pir-component' ? { componentContract: emptyContract() } : {}),
    metadata: { name: id },
    ui: {
      graph: {
        rootId: root.id,
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        childIdsById: Object.fromEntries(
          nodes.map((node) => [
            node.id,
            node.id === root.id ? children.map((child) => child.id) : [],
          ])
        ),
      },
    },
  };
  return {
    id,
    type,
    path: `/${id}.pir.json`,
    contentRev: 1,
    metaRev: 1,
    content,
  };
};

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
    id: 'compiler-current-property',
    workspaceRev: 17,
    routeRev: 1,
    opSeq: 3,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

const instance = (id: string, componentDocumentId: string): PIRNode => ({
  id,
  kind: 'component-instance',
  componentDocumentId,
  bindings: { props: {}, events: {}, variants: {} },
});

describe('PIR React compiler properties', () => {
  it('emits every reachable Definition once in dependency-first order', () => {
    for (const depth of [1, 2, 3, 4, 5]) {
      for (const reverseInsertion of [false, true]) {
        const componentIds = Array.from(
          { length: depth },
          (_, index) => `component-${index}`
        );
        const components = componentIds.map((componentId, index) => {
          const targetId = componentIds[index + 1];
          return createDocument(
            componentId,
            'pir-component',
            targetId
              ? instance(`nested-${index}`, targetId)
              : { id: `leaf-${index}`, kind: 'element', type: 'span' }
          );
        });
        const page = createDocument(
          'page',
          'pir-page',
          { id: 'root', kind: 'element', type: 'main' },
          [
            instance('first', componentIds[0]!),
            instance('second', componentIds[0]!),
          ]
        );
        const documents = reverseInsertion
          ? [page, ...[...components].reverse()]
          : [...components, page];
        const result = compileWorkspacePirReactModules({
          workspace: createWorkspace(documents),
          entryDocumentId: page.id,
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') continue;
        expect(result.dependencyFirstDocumentIds).toEqual([
          ...[...componentIds].reverse(),
          page.id,
        ]);
        expect(result.modules.map(({ id }) => id)).toEqual(
          result.dependencyFirstDocumentIds.map(createPirReactModuleId)
        );
        expect(new Set(result.modules.map(({ id }) => id)).size).toBe(
          result.modules.length
        );
        const pageModule = result.modules.at(-1)!;
        expect(
          pageModule.imports.filter(
            ({ targetModuleId }) =>
              targetModuleId === createPirReactModuleId(componentIds[0]!)
          )
        ).toHaveLength(1);
      }
    }
  });
});
