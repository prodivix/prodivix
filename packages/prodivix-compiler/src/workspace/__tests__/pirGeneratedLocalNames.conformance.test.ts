import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PIRDocument, PIRNode } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '@prodivix/workspace';
import { reactCompileTarget } from '#src/react/target';
import { compileWorkspacePirReactModules } from '#src/workspace/pirWorkspaceCompiler';
import {
  evaluateGeneratedModules,
  typecheckGeneratedModule,
} from '#src/workspace/__tests__/generatedModuleHarness';

const createDocument = (
  id: string,
  content: PIRDocument
): WorkspaceDocument => ({
  id,
  type: 'pir-page',
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
    id: 'compiler-current-local-names',
    workspaceRev: 4,
    routeRev: 1,
    opSeq: 1,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

/**
 * `hero-card` and `hero_card` are distinct PIR ids that normalise to the same
 * identifier. Nesting the second inside the first is the shape that used to
 * emit a self-referencing `const`.
 */
const createCollidingIdentifierPage = (): WorkspaceDocument => {
  const nodes: PIRNode[] = [
    {
      id: 'hero-card',
      kind: 'element',
      type: 'section',
      data: { source: { kind: 'literal', value: { label: 'outer' } } },
    },
    {
      id: 'hero_card',
      kind: 'element',
      type: 'article',
      data: { source: { kind: 'literal', value: { label: 'inner' } } },
    },
    {
      id: 'outer-label',
      kind: 'element',
      type: 'h1',
      text: { kind: 'data', dataId: 'hero-card', path: 'label' },
    },
    {
      id: 'inner-label',
      kind: 'element',
      type: 'p',
      text: { kind: 'data', dataId: 'hero_card', path: 'label' },
    },
  ];
  return createDocument('page', {
    ui: {
      graph: {
        rootId: 'hero-card',
        nodesById: Object.fromEntries(nodes.map((node) => [node.id, node])),
        childIdsById: {
          'hero-card': ['outer-label', 'hero_card'],
          hero_card: ['inner-label'],
          'outer-label': [],
          'inner-label': [],
        },
      },
    },
  });
};

describe('PIR generated local name conformance', () => {
  it('keeps nested node data scopes independent when ids normalise alike', async () => {
    const result = compileWorkspacePirReactModules({
      workspace: createWorkspace([createCollidingIdentifierPage()]),
      entryDocumentId: 'page',
      target: reactCompileTarget,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const evaluated = await evaluateGeneratedModules(result.modules);
    const Entry = evaluated.get(result.contribution.entryModuleId!)!;
    const markup = renderToStaticMarkup(
      createElement(Entry, {
        __pdxRuntime: {
          dispatchTrigger: () => undefined,
          resolveCodeValue: () => undefined,
        },
      })
    );

    expect(markup).toContain('outer');
    expect(markup).toContain('inner');
    expect(result.modules.flatMap(typecheckGeneratedModule)).toEqual([]);
  }, 15_000);
});
