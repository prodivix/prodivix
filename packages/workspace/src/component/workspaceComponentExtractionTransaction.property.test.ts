import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRDocument, PIRNode } from '@prodivix/pir';
import {
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
} from '../workspaceHistory';
import { applyWorkspaceTransaction } from '../workspaceCommand';
import { applyWorkspaceOperationForHistory } from '../workspaceHistoryReplay';
import { createWorkspaceTransactionOperation } from '../workspaceOperation';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import {
  WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES,
  createWorkspaceComponentExtractionTransactionPlan,
} from './workspaceComponentExtractionTransaction';

const propertyParameters = Object.freeze({
  numRuns: 24,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

const createSourceContent = (
  unsafeBoundary?: 'route' | 'incoming'
): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: {
      id: 'root',
      kind: 'element',
      type: 'main',
      ...(unsafeBoundary === 'incoming'
        ? { text: { kind: 'data', dataId: 'panel' } }
        : {}),
    },
    panel: {
      id: 'panel',
      kind: 'element',
      type: 'section',
      text: { kind: 'param', paramId: 'title' },
      data: { value: { kind: 'literal', value: { tone: 'info' } } },
    },
    label: {
      id: 'label',
      kind: 'element',
      type: 'span',
      text: { kind: 'literal', value: 'Label' },
    },
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          root: ['panel'],
          panel: ['label'],
          label: [],
        },
        order: { strategy: 'childIdsById' },
      },
    },
    logic: {
      props: { title: { name: 'title', typeRef: 'string' } },
    },
  };
};

const createWorkspace = (
  unsafeBoundary?: 'route' | 'incoming'
): WorkspaceSnapshot => {
  const page: WorkspaceDocument = {
    id: 'page-home',
    type: 'pir-page',
    name: 'Home',
    path: '/pages/home.pir.json',
    contentRev: 1,
    metaRev: 1,
    content: createSourceContent(unsafeBoundary),
  };
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: page.id,
    },
  };
  return {
    id: 'workspace-component-extraction',
    workspaceRev: 17,
    routeRev: 3,
    opSeq: 9,
    treeRootId: 'root',
    treeById,
    docsById: { [page.id]: page },
    routeManifest: {
      version: '1',
      root: {
        id: 'route-root',
        pageDocId: page.id,
        ...(unsafeBoundary === 'route' ? { outletNodeId: 'panel' } : {}),
      },
    },
    activeDocumentId: page.id,
    activeRouteNodeId: 'route-root',
  };
};

describe('Workspace Component extraction transaction properties', () => {
  it('atomically extracts root or nested subtrees and supports replay, undo, and redo', () => {
    fc.assert(
      fc.property(fc.boolean(), identifier, (rootSelection, suffix) => {
        const workspace = createWorkspace();
        const subtreeRootId = rootSelection ? 'root' : 'panel';
        const componentDocumentId = `component-${suffix}`;
        const result = createWorkspaceComponentExtractionTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `extract-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          subtreeRootId,
          componentDocumentId,
          componentPath: `/components/${suffix}.pir.json`,
          componentName: `Card ${suffix}`,
          instanceNodeId: subtreeRootId,
          publicParts: [
            {
              id: 'part-label',
              name: 'Label',
              targetNodeId: 'label',
            },
          ],
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(workspace.docsById[componentDocumentId]).toBeUndefined();
        expect(result.plan.publicMemberMappings).toEqual([
          {
            source: { kind: 'param', id: 'title' },
            target: {
              kind: 'prop',
              memberId: 'extracted-prop:param:5:title',
            },
          },
        ]);
        expect(
          result.plan.componentDocument.content.componentContract?.partsById?.[
            'part-label'
          ]?.targetNodeId
        ).toBe('label');

        const applied = applyWorkspaceTransaction(
          workspace,
          result.plan.transaction
        );
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.snapshot.docsById['page-home']?.content).toMatchObject({
          ui: {
            graph: {
              nodesById: {
                [subtreeRootId]: {
                  kind: 'component-instance',
                  componentDocumentId,
                },
              },
            },
          },
        });
        expect(applied.snapshot.docsById[componentDocumentId]).toEqual(
          result.plan.componentDocument
        );

        const operation = createWorkspaceTransactionOperation(
          result.plan.transaction
        );
        const replayed = applyWorkspaceOperationForHistory(
          workspace,
          operation
        );
        expect(replayed.ok).toBe(true);
        if (!replayed.ok) return;
        expect(replayed.snapshot).toEqual(applied.snapshot);

        const history = recordWorkspaceOperation(
          createWorkspaceHistoryState(),
          operation
        );
        const scope = {
          kind: 'workspace' as const,
          workspaceId: workspace.id,
        };
        const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
        expect(undone.ok).toBe(true);
        if (!undone.ok) return;
        expect(undone.snapshot).toEqual(workspace);

        const redone = redoWorkspaceHistory(
          undone.snapshot,
          undone.history,
          scope
        );
        expect(redone.ok).toBe(true);
        if (!redone.ok) return;
        expect(redone.snapshot).toEqual(applied.snapshot);
      }),
      propertyParameters
    );
  });

  it('publishes lifted Definition events and forwards them through the source Instance', () => {
    fc.assert(
      fc.property(identifier, (suffix) => {
        const base = createWorkspace();
        const content = createSourceContent();
        const panel = content.ui.graph.nodesById.panel!;
        if (panel.kind !== 'element')
          throw new Error('Expected panel Element.');
        const source: WorkspaceDocument = {
          ...base.docsById['page-home']!,
          type: 'pir-component',
          content: {
            ...content,
            componentContract: {
              propsById: {},
              eventsById: {
                activate: {
                  id: 'activate',
                  name: 'Activate',
                  payloadTypeRef: 'string',
                },
              },
              slotsById: {},
              variantAxesById: {},
            },
            ui: {
              graph: {
                ...content.ui.graph,
                nodesById: {
                  ...content.ui.graph.nodesById,
                  panel: {
                    ...panel,
                    events: {
                      click: {
                        kind: 'emit-component-event',
                        memberId: 'activate',
                      },
                    },
                  },
                },
              },
            },
          } satisfies PIRDocument,
        };
        const workspace: WorkspaceSnapshot = {
          ...base,
          docsById: { [source.id]: source },
          routeManifest: { version: '1', root: { id: 'route-root' } },
        };
        const componentDocumentId = `event-component-${suffix}`;
        const result = createWorkspaceComponentExtractionTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `event-extract-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: source.id,
          subtreeRootId: 'panel',
          componentDocumentId,
          componentPath: `/components/event-${suffix}.pir.json`,
          componentName: `Event card ${suffix}`,
          instanceNodeId: 'panel',
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        const liftedEventId = 'extracted-event:8:activate';
        expect(result.plan.publicMemberMappings).toContainEqual({
          source: { kind: 'component-event', id: 'activate' },
          target: { kind: 'event', memberId: liftedEventId },
        });
        expect(
          result.plan.componentDocument.content.componentContract?.eventsById[
            liftedEventId
          ]
        ).toMatchObject({ id: liftedEventId, payloadTypeRef: 'string' });
        expect(
          result.plan.sourceDocumentContent.ui.graph.nodesById.panel
        ).toMatchObject({
          kind: 'component-instance',
          bindings: {
            events: {
              [liftedEventId]: {
                kind: 'emit-component-event',
                memberId: 'activate',
              },
            },
          },
        });
      }),
      { ...propertyParameters, numRuns: 12 }
    );
  });

  it('blocks unsafe route and external incoming references without changing the source', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'route' | 'incoming'>('route', 'incoming'),
        identifier,
        (unsafeBoundary, suffix) => {
          const workspace = createWorkspace(unsafeBoundary);
          const before = structuredClone(workspace);
          const result = createWorkspaceComponentExtractionTransactionPlan({
            workspace,
            baseRevision: workspace.workspaceRev,
            transactionId: `blocked-${suffix}`,
            issuedAt: '2026-07-14T00:00:00.000Z',
            sourceDocumentId: 'page-home',
            subtreeRootId: 'panel',
            componentDocumentId: `component-${suffix}`,
            componentPath: `/components/${suffix}.pir.json`,
            componentName: `Blocked ${suffix}`,
            instanceNodeId: 'panel',
          });

          expect(result.status).toBe('rejected');
          if (result.status !== 'rejected') return;
          expect(result.issues.map(({ code }) => code)).toContain(
            unsafeBoundary === 'route'
              ? WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.referenceAnalysisBlocked
              : WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.pirAnalysisBlocked
          );
          expect(workspace).toEqual(before);
          expect(workspace.docsById[`component-${suffix}`]).toBeUndefined();
        }
      ),
      propertyParameters
    );
  });
});
