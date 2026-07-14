import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createCodeArtifactSymbolId,
  queryCodeSlotSemanticRelations,
} from '@prodivix/authoring';
import { createAnimationTimelineCodeSlotId } from '@prodivix/animation';
import { createNodeGraphExecutorCodeSlotId } from '@prodivix/nodegraph';
import { createPirMountedCssCodeSlotId } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import { createWorkspaceCodeSlotRegistryFromSnapshot } from './createWorkspaceCodeSlotRegistryFromSnapshot';
import { createWorkspaceSemanticIndexFromSnapshot } from './createWorkspaceSemanticIndexFromSnapshot';

const WORKSPACE_ID = 'workspace-code-slots';
const CODE_ID = 'code-shared';
const PAGE_ID = 'page-home';
const GRAPH_ID = 'graph-submit';
const ANIMATION_ID = 'animation-intro';
const EVENT_SLOT_ID = 'blueprint.page-home.submit.click';

const documents: readonly WorkspaceDocument[] = [
  {
    id: PAGE_ID,
    type: 'pir-page',
    path: '/pages/home.pir.json',
    contentRev: 2,
    metaRev: 1,
    content: {
      ui: {
        graph: {
          rootId: 'submit',
          nodesById: {
            submit: {
              id: 'submit',
              kind: 'element',
              type: 'button',
              props: {
                mountedCss: {
                  kind: 'code',
                  reference: { artifactId: CODE_ID },
                },
              },
              events: {
                click: {
                  kind: 'call-code',
                  slotId: EVENT_SLOT_ID,
                  reference: { artifactId: CODE_ID },
                },
              },
            },
          },
          childIdsById: { submit: [] },
          order: { strategy: 'childIdsById' },
        },
      },
    },
  },
  {
    id: GRAPH_ID,
    type: 'pir-graph',
    path: '/nodegraphs/submit.graph.json',
    contentRev: 3,
    metaRev: 1,
    content: {
      version: 1,
      nodes: [
        {
          id: 'run',
          data: { kind: 'code' },
          executor: {
            slotId: createNodeGraphExecutorCodeSlotId(GRAPH_ID, 'run'),
            reference: { artifactId: CODE_ID },
          },
        },
      ],
      edges: [],
    },
  },
  {
    id: ANIMATION_ID,
    type: 'pir-animation',
    path: '/animations/intro.animation.json',
    contentRev: 4,
    metaRev: 1,
    content: {
      version: 1,
      target: { kind: 'pir-document', documentId: PAGE_ID },
      timelines: [
        {
          id: 'intro',
          name: 'Intro',
          durationMs: 1000,
          bindings: [],
          codeSlots: {
            script: {
              slotId: createAnimationTimelineCodeSlotId(
                ANIMATION_ID,
                'intro',
                'script'
              ),
              reference: { artifactId: CODE_ID },
            },
          },
        },
      ],
    },
  },
  {
    id: CODE_ID,
    type: 'code',
    path: '/src/shared.ts',
    contentRev: 5,
    metaRev: 1,
    content: { language: 'ts', source: 'export const shared = true;' },
  },
];

const createSnapshot = (
  documentOrder: readonly string[]
): WorkspaceSnapshot => {
  const ordered = documentOrder.map((id) =>
    documents.find((doc) => doc.id === id)!
  );
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ordered.map((document) => `node:${document.id}`),
    },
  };
  ordered.forEach((document) => {
    treeById[`node:${document.id}`] = {
      id: `node:${document.id}`,
      kind: 'doc',
      name: document.path.split('/').at(-1)!,
      parentId: 'root',
      docId: document.id,
    };
  });
  return {
    id: WORKSPACE_ID,
    workspaceRev: 9,
    routeRev: 2,
    opSeq: 12,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      ordered.map((document) => [document.id, document])
    ),
    routeManifest: {
      version: '1',
      root: {
        id: 'route-home',
        pageDocId: PAGE_ID,
        runtime: { loaderRef: { artifactId: CODE_ID } },
      },
    },
  };
};

describe('Workspace CodeSlot semantic relations', () => {
  it('keeps cross-editor definition, references, and impact stable across document order', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(
          documents.map(({ id }) => id),
          {
            minLength: documents.length,
            maxLength: documents.length,
          }
        ),
        (documentOrder) => {
          const snapshot = createSnapshot(documentOrder);
          const registryResult =
            createWorkspaceCodeSlotRegistryFromSnapshot(snapshot);
          const semanticResult =
            createWorkspaceSemanticIndexFromSnapshot(snapshot);
          if (registryResult.status === 'blocked') {
            throw new Error(JSON.stringify(registryResult.issues));
          }
          if (semanticResult.status === 'blocked') {
            throw new Error(JSON.stringify(semanticResult.issues));
          }
          expect(registryResult.status).toBe('ready');
          expect(semanticResult.status).toBe('ready');
          if (
            registryResult.status !== 'ready' ||
            semanticResult.status !== 'ready'
          ) {
            return;
          }

          const projections = registryResult.registry.listBindingProjections({
            surface: 'issues-panel',
          });
          expect(projections).toHaveLength(5);
          expect(projections.map(({ binding }) => binding.slotId)).toEqual(
            expect.arrayContaining([
              EVENT_SLOT_ID,
              createPirMountedCssCodeSlotId(PAGE_ID, 'submit'),
              createNodeGraphExecutorCodeSlotId(GRAPH_ID, 'run'),
              createAnimationTimelineCodeSlotId(
                ANIMATION_ID,
                'intro',
                'script'
              ),
              'route.route-home.loader',
            ])
          );

          projections.forEach(({ binding, semanticReferenceId }) => {
            const relations = queryCodeSlotSemanticRelations({
              registry: registryResult.registry,
              semanticIndex: semanticResult.index,
              slotId: binding.slotId,
            });
            expect(relations.status).toBe('resolved');
            if (relations.status !== 'resolved') return;
            expect(relations.definition.id).toBe(
              createCodeArtifactSymbolId(WORKSPACE_ID, CODE_ID)
            );
            expect(relations.references.map(({ id }) => id)).toContain(
              semanticReferenceId
            );
            expect(relations.references).toHaveLength(5);
            expect(relations.impact.rootSymbolIds).toEqual([
              createCodeArtifactSymbolId(WORKSPACE_ID, CODE_ID),
            ]);
          });
        }
      ),
      { numRuns: 20, seed: 0x14_07_2026 }
    );
  });
});
