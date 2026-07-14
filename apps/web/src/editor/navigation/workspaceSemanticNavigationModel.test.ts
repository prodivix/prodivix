import { describe, expect, it } from 'vitest';
import { createWorkspaceSemanticIndex } from '@prodivix/authoring';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { resolveWorkspaceSemanticNavigationLocation } from './workspaceSemanticNavigationModel';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 4,
  routeRev: 2,
  opSeq: 7,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    },
  },
  docsById: {
    'component-1': {
      id: 'component-1',
      type: 'pir-component',
      path: '/components/card.pir.json',
      contentRev: 3,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'page-1': {
      id: 'page-1',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 2,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    'code-1': {
      id: 'code-1',
      type: 'code',
      path: '/code/card.ts',
      contentRev: 5,
      metaRev: 2,
      content: { language: 'typescript', source: 'renderCard();' },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root', children: [] },
  },
});

const createSemanticIndex = (workspace: WorkspaceSnapshot) => {
  const result = createWorkspaceSemanticIndex({
    workspaceRevisions: {
      workspaceId: workspace.id,
      workspaceRev: workspace.workspaceRev,
      routeRev: workspace.routeRev,
      opSeq: workspace.opSeq,
      documentRevs: Object.fromEntries(
        Object.values(workspace.docsById).map((document) => [
          document.id,
          {
            contentRev: document.contentRev,
            metaRev: document.metaRev,
          },
        ])
      ),
    },
    schemaVersion: 'test',
    providers: [
      {
        descriptor: { id: 'test.navigation', semanticVersion: '1' },
        contribute: () => ({
          scopes: [
            {
              id: 'scope:workspace',
              kind: 'workspace',
              ownerRef: { kind: 'workspace', workspaceId: workspace.id },
            },
          ],
          symbols: [
            {
              id: 'symbol:card',
              stability: 'durable',
              kind: 'component',
              name: 'Card',
              scopeId: 'scope:workspace',
              ownerRef: {
                kind: 'document',
                workspaceId: workspace.id,
                documentId: 'component-1',
              },
            },
            {
              id: 'symbol:render-card',
              stability: 'revision-scoped',
              kind: 'code-function',
              name: 'renderCard',
              scopeId: 'scope:workspace',
              ownerRef: {
                kind: 'code-artifact',
                artifactId: 'code-1',
              },
              sourceSpan: {
                artifactId: 'code-1',
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 11,
              },
            },
          ],
          references: [
            {
              id: 'reference:card-instance',
              kind: 'component-instance',
              sourceRef: {
                kind: 'pir-node',
                documentId: 'page-1',
                nodeId: 'card-instance',
              },
              sourceSpan: {
                artifactId: 'code-1',
                startLine: 1,
                startColumn: 1,
                endLine: 1,
                endColumn: 7,
              },
              scopeId: 'scope:workspace',
              target: { kind: 'symbol-id', symbolId: 'symbol:card' },
              resolutionMode: 'addressable',
            },
            {
              id: 'reference:render-card',
              kind: 'code-reference',
              sourceRef: {
                kind: 'pir-node',
                documentId: 'page-1',
                nodeId: 'button-1',
              },
              scopeId: 'scope:workspace',
              target: {
                kind: 'symbol-id',
                symbolId: 'symbol:render-card',
              },
              resolutionMode: 'addressable',
            },
          ],
        }),
      },
    ],
  });
  if (!result.ok) throw new Error('Could not build semantic test index.');
  return result.index;
};

describe('workspace semantic navigation model', () => {
  it('resolves symbol owners, definitions, and reverse-reference sources', () => {
    const workspace = createWorkspace();
    const semanticIndex = createSemanticIndex(workspace);

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace,
        semanticIndex,
        target: { kind: 'semantic-symbol', symbolId: 'symbol:card' },
      })
    ).toEqual({
      status: 'resolved',
      location: {
        kind: 'diagnostic-target',
        targetRef: {
          kind: 'document',
          workspaceId: 'workspace-1',
          documentId: 'component-1',
        },
      },
    });

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace,
        semanticIndex,
        target: {
          kind: 'semantic-reference',
          referenceId: 'reference:card-instance',
        },
      })
    ).toEqual({
      status: 'resolved',
      location: {
        kind: 'diagnostic-target',
        targetRef: {
          kind: 'document',
          workspaceId: 'workspace-1',
          documentId: 'component-1',
        },
      },
    });

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace,
        semanticIndex,
        target: {
          kind: 'semantic-symbol',
          symbolId: 'symbol:card',
          destination: {
            kind: 'reference',
          },
        },
      })
    ).toEqual({
      status: 'resolved',
      location: {
        kind: 'source-span',
        sourceSpan: {
          artifactId: 'code-1',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 7,
        },
      },
    });
  });

  it('rejects an index after a canonical partition revision changes', () => {
    const workspace = createWorkspace();
    const semanticIndex = createSemanticIndex(workspace);

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace: { ...workspace, workspaceRev: workspace.workspaceRev + 1 },
        semanticIndex,
        target: { kind: 'semantic-symbol', symbolId: 'symbol:card' },
      })
    ).toEqual({
      status: 'unavailable',
      reason: 'semantic-index-stale',
    });
  });

  it('prefers precise source spans for code definitions', () => {
    const workspace = createWorkspace();
    const semanticIndex = createSemanticIndex(workspace);
    const expectedLocation = {
      kind: 'source-span',
      sourceSpan: {
        artifactId: 'code-1',
        startLine: 1,
        startColumn: 1,
        endLine: 1,
        endColumn: 11,
      },
    } as const;

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace,
        semanticIndex,
        target: {
          kind: 'semantic-symbol',
          symbolId: 'symbol:render-card',
          destination: { kind: 'definition' },
        },
      })
    ).toEqual({ status: 'resolved', location: expectedLocation });

    expect(
      resolveWorkspaceSemanticNavigationLocation({
        workspace,
        semanticIndex,
        target: {
          kind: 'semantic-reference',
          referenceId: 'reference:render-card',
          destination: 'definition',
        },
      })
    ).toEqual({ status: 'resolved', location: expectedLocation });
  });
});
