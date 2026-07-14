import { describe, expect, it } from 'vitest';
import { createCodeSymbolId } from '@prodivix/authoring';
import {
  createCodeExportLocalSymbolId,
  createCssSymbolId,
  createShaderEntrySymbolId,
} from '@prodivix/code-language';
import { createEmptyPirDocument, type PIRDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createWorkspaceCodeLanguageEnvironment,
  CODE_LANGUAGE_PROVIDER_IDS,
  hasWorkspaceCodeLanguageProvider,
} from './workspaceCodeLanguageEnvironment';

const createWorkspace = (): WorkspaceSnapshot => {
  const baseDocument = createEmptyPirDocument();
  const root = baseDocument.ui.graph.nodesById[baseDocument.ui.graph.rootId]!;
  if (root.kind !== 'element') throw new Error('Expected an element root.');
  const page: PIRDocument = {
    ...baseDocument,
    ui: {
      graph: {
        ...baseDocument.ui.graph,
        nodesById: {
          ...baseDocument.ui.graph.nodesById,
          [root.id]: {
            ...root,
            events: {
              click: {
                kind: 'call-code',
                slotId: 'event.submit',
                reference: {
                  artifactId: 'code-submit',
                  exportName: 'submit',
                },
              },
            },
          },
        },
      },
    },
  };
  return {
    id: 'workspace-code-language-web',
    workspaceRev: 3,
    routeRev: 2,
    opSeq: 5,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['page-node', 'code-node', 'style-node', 'shader-node'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      'code-node': {
        id: 'code-node',
        kind: 'doc',
        name: 'submit.ts',
        parentId: 'root',
        docId: 'code-submit',
      },
      'style-node': {
        id: 'style-node',
        kind: 'doc',
        name: 'theme.css',
        parentId: 'root',
        docId: 'code-theme',
      },
      'shader-node': {
        id: 'shader-node',
        kind: 'doc',
        name: 'main.wgsl',
        parentId: 'root',
        docId: 'code-shader',
      },
    },
    docsById: {
      'page-home': {
        id: 'page-home',
        type: 'pir-page',
        path: '/pages/home.pir.json',
        contentRev: 1,
        metaRev: 1,
        content: page,
      },
      'code-submit': {
        id: 'code-submit',
        type: 'code',
        path: '/src/submit.ts',
        contentRev: 4,
        metaRev: 1,
        content: {
          language: 'ts',
          source: 'export function submit(): void {}',
        },
      },
      'code-theme': {
        id: 'code-theme',
        type: 'code',
        path: '/styles/theme.css',
        contentRev: 2,
        metaRev: 1,
        content: {
          language: 'css',
          source: '.button { color: rebeccapurple; }',
        },
      },
      'code-shader': {
        id: 'code-shader',
        type: 'code',
        path: '/shaders/main.wgsl',
        contentRev: 3,
        metaRev: 1,
        content: {
          language: 'wgsl',
          source:
            '@fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }',
        },
      },
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'route-root',
        pageDocId: 'page-home',
        runtime: {
          actionRef: {
            artifactId: 'code-submit',
            exportName: 'submit',
          },
        },
      },
    },
  };
};

describe('workspace code language environment', () => {
  it('resolves PIR and Route export names to the durable TypeScript symbol', () => {
    const workspace = createWorkspace();
    const environment = createWorkspaceCodeLanguageEnvironment(workspace);
    expect(
      hasWorkspaceCodeLanguageProvider(
        environment,
        CODE_LANGUAGE_PROVIDER_IDS.typeScript
      )
    ).toBe(true);
    expect(
      hasWorkspaceCodeLanguageProvider(
        environment,
        CODE_LANGUAGE_PROVIDER_IDS.css
      )
    ).toBe(true);
    expect(
      hasWorkspaceCodeLanguageProvider(
        environment,
        CODE_LANGUAGE_PROVIDER_IDS.shader
      )
    ).toBe(true);
    expect(environment.semanticComposition.status).toBe('ready');
    if (environment.semanticComposition.status !== 'ready') return;

    const symbolId = createCodeSymbolId(
      workspace.id,
      'code-submit',
      createCodeExportLocalSymbolId('submit')
    );
    expect(
      environment.semanticComposition.index.getSymbol(symbolId)
    ).toMatchObject({
      stability: 'durable',
      kind: 'code-function',
      name: 'submit',
    });
    const references =
      environment.semanticComposition.index.getReferences(symbolId);
    expect(references.status).toBe('resolved');
    if (references.status !== 'resolved') return;
    expect(
      new Set(references.references.map(({ sourceRef }) => sourceRef.kind))
    ).toEqual(new Set(['inspector-field', 'route']));

    expect(
      environment.semanticComposition.index.getSymbol(
        createCssSymbolId(workspace.id, 'code-theme', 'selector', '.button')
      )
    ).toMatchObject({
      stability: 'durable',
      kind: 'css-symbol',
      name: '.button',
    });
    expect(
      environment.semanticComposition.index.getSymbol(
        createShaderEntrySymbolId(
          workspace.id,
          'code-shader',
          'wgsl',
          'fragment',
          'main'
        )
      )
    ).toMatchObject({
      stability: 'durable',
      kind: 'shader-entry',
      name: 'main',
      typeRef: 'shader-entry:wgsl:fragment',
    });
  });
});
