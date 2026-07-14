import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createComponentSymbolId,
  createPirNodeSymbolId,
  createSemanticId,
} from '@prodivix/authoring';
import {
  createEmptyPirComponentContract,
  createEmptyPirDocument,
  type PIRDocument,
} from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import {
  WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES,
  createWorkspaceSemanticIndexFromSnapshot,
} from './createWorkspaceSemanticIndexFromSnapshot';

const propertyParameters = Object.freeze({
  numRuns: 30,
  seed: 0x15_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);

const createPageDocument = (componentDocumentId: string): PIRDocument => ({
  ui: {
    graph: {
      rootId: 'page-root',
      nodesById: {
        'page-root': {
          id: 'page-root',
          kind: 'element',
          type: 'container',
        },
        instance: {
          id: 'instance',
          kind: 'component-instance',
          componentDocumentId,
          bindings: { props: {}, events: {}, variants: {} },
        },
      },
      childIdsById: {
        'page-root': ['instance'],
        instance: [],
      },
      order: { strategy: 'childIdsById' },
    },
  },
});

const createSnapshot = (input: {
  workspaceId: string;
  pageDocumentId: string;
  componentDocumentId: string;
  reverseDocuments: boolean;
  pageContent?: unknown;
}): WorkspaceSnapshot => {
  const documents: WorkspaceDocument[] = [
    {
      id: input.pageDocumentId,
      type: 'pir-page',
      path: `/pages/${input.pageDocumentId}.pir.json`,
      contentRev: 3,
      metaRev: 1,
      content:
        input.pageContent ?? createPageDocument(input.componentDocumentId),
    },
    {
      id: input.componentDocumentId,
      type: 'pir-component',
      path: `/components/${input.componentDocumentId}.pir.json`,
      contentRev: 4,
      metaRev: 2,
      content: createEmptyPirDocument({
        rootId: 'component-root',
        componentContract: createEmptyPirComponentContract(),
      }),
    },
  ];
  const ordered = input.reverseDocuments ? [...documents].reverse() : documents;
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ordered.map(({ id }) => `node:${id}`),
    },
  };
  for (const document of ordered) {
    treeById[`node:${document.id}`] = {
      id: `node:${document.id}`,
      kind: 'doc',
      name: document.path.split('/').at(-1)!,
      parentId: 'root',
      docId: document.id,
    };
  }

  return {
    id: input.workspaceId,
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      ordered.map((document) => [document.id, document])
    ),
    routeManifest: {
      version: '1',
      root: { id: 'route-root', pageDocId: input.pageDocumentId },
    },
  };
};

describe('Workspace canonical PIR semantic composition properties', () => {
  it('is insertion-order stable and supports reverse Component reference queries', () => {
    fc.assert(
      fc.property(
        identifier,
        identifier,
        identifier,
        (workspaceId, pageDocumentId, componentDocumentId) => {
          fc.pre(pageDocumentId !== componentDocumentId);
          const input = { workspaceId, pageDocumentId, componentDocumentId };
          const forward = createWorkspaceSemanticIndexFromSnapshot(
            createSnapshot({ ...input, reverseDocuments: false })
          );
          const reversed = createWorkspaceSemanticIndexFromSnapshot(
            createSnapshot({ ...input, reverseDocuments: true })
          );

          expect(forward.status).toBe('ready');
          expect(reversed.status).toBe('ready');
          if (forward.status !== 'ready' || reversed.status !== 'ready') {
            return;
          }
          expect(reversed.index.snapshotIdentity).toEqual(
            forward.index.snapshotIdentity
          );

          const componentSymbolId = createComponentSymbolId(
            workspaceId,
            componentDocumentId
          );
          const references = forward.index.getReferences(componentSymbolId);
          expect(references).toMatchObject({
            status: 'resolved',
            references: [
              {
                id: createSemanticId(
                  'pir-reference',
                  workspaceId,
                  pageDocumentId,
                  'instance',
                  '/componentDocumentId',
                  'component-definition'
                ),
                sourceSymbolId: createPirNodeSymbolId(
                  workspaceId,
                  pageDocumentId,
                  'instance'
                ),
                targetSymbolId: componentSymbolId,
              },
            ],
          });
          expect(reversed.index.getReferences(componentSymbolId)).toEqual(
            references
          );
        }
      ),
      propertyParameters
    );
  });

  it('fails closed when canonical PIR decode or semantic validation fails', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('decode-invalid', 'semantic-invalid'),
        (invalidKind) => {
          const valid = createEmptyPirDocument({ rootId: 'page-root' });
          const pageContent =
            invalidKind === 'decode-invalid'
              ? { ui: {} }
              : {
                  ...valid,
                  ui: {
                    graph: { ...valid.ui.graph, rootId: 'missing-root' },
                  },
                };
          const result = createWorkspaceSemanticIndexFromSnapshot(
            createSnapshot({
              workspaceId: 'workspace-invalid',
              pageDocumentId: 'page-invalid',
              componentDocumentId: 'component-valid',
              reverseDocuments: false,
              pageContent,
            })
          );

          expect(result.status).toBe('blocked');
          if (result.status !== 'blocked') return;
          expect(result.issues.length).toBeGreaterThan(0);
          expect(result.issues.every(({ documentId }) => documentId)).toBe(
            true
          );
          expect(result.issues.map(({ code }) => code)).toContain(
            WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.documentInvalid
          );
          expect('index' in result).toBe(false);
        }
      ),
      propertyParameters
    );
  });
});
