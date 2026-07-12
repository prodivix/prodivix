import { describe, expect, it } from 'vitest';
import { createDefaultPirDoc } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  canRedoWorkspaceHistory,
  canUndoWorkspaceHistory,
  collectChangedWorkspaceDocumentIds,
  collectWorkspaceOperationDocumentIds,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  createWorkspaceRouteIntentPlan,
  createWorkspaceTransactionOperation,
  isPirDocumentContent,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceCommandScope,
  resolveWorkspaceOperationAffectedScopes,
  resolveWorkspaceOperationScope,
  selectUndoWorkspaceHistoryEntry,
  setWorkspaceHistoryLimit,
  type WorkspaceCommandEnvelope,
  type WorkspaceHistoryScope,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
  undoWorkspaceHistory,
} from '..';

const ISSUED_AT = '2026-05-10T00:00:00.000Z';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'page-home',
  activeRouteNodeId: 'route-home',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['pages', 'graphs'],
    },
    pages: {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['home-node'],
    },
    graphs: {
      id: 'graphs',
      kind: 'dir',
      name: 'graphs',
      parentId: 'root',
      children: ['checkout-node'],
    },
    'home-node': {
      id: 'home-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
    'checkout-node': {
      id: 'checkout-node',
      kind: 'doc',
      name: 'checkout.graph.json',
      parentId: 'graphs',
      docId: 'graph-checkout',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createDefaultPirDoc(),
    },
    'graph-checkout': {
      id: 'graph-checkout',
      type: 'pir-graph',
      path: '/graphs/checkout.graph.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        nodesById: {
          validateCart: {
            id: 'validateCart',
            position: { x: 0, y: 0 },
          },
        },
        edgesById: {},
        groupsById: {},
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'route-root',
      children: [{ id: 'route-home', index: true, pageDocId: 'page-home' }],
    },
  },
});

const createPirCommand = (
  overrides: Partial<WorkspaceCommandEnvelope> = {}
): WorkspaceCommandEnvelope => ({
  id: 'pir-command',
  namespace: 'core.pir',
  type: 'node.update',
  version: '1.0',
  issuedAt: ISSUED_AT,
  forwardOps: [
    {
      op: 'add',
      path: '/ui/graph/nodesById/root/props',
      value: { title: 'Home' },
    },
  ],
  reverseOps: [{ op: 'remove', path: '/ui/graph/nodesById/root/props' }],
  target: { workspaceId: 'workspace-1', documentId: 'page-home' },
  domainHint: 'pir',
  ...overrides,
});

const createNodeGraphCommand = (
  overrides: Partial<WorkspaceCommandEnvelope> = {}
): WorkspaceCommandEnvelope => ({
  id: 'nodegraph-command',
  namespace: 'core.nodegraph',
  type: 'node.move',
  version: '1.0',
  issuedAt: ISSUED_AT,
  target: {
    workspaceId: 'workspace-1',
    documentId: 'graph-checkout',
  },
  forwardOps: [
    {
      op: 'replace',
      path: '/nodesById/validateCart/position/x',
      value: 120,
    },
  ],
  reverseOps: [
    {
      op: 'replace',
      path: '/nodesById/validateCart/position/x',
      value: 0,
    },
  ],
  domainHint: 'nodegraph',
  ...overrides,
});

const pirScope: WorkspaceHistoryScope = {
  kind: 'document',
  workspaceId: 'workspace-1',
  documentId: 'page-home',
  domain: 'pir',
};

const nodeGraphScope: WorkspaceHistoryScope = {
  kind: 'document',
  workspaceId: 'workspace-1',
  documentId: 'graph-checkout',
  domain: 'nodegraph',
};

const workspaceScope: WorkspaceHistoryScope = {
  kind: 'workspace',
  workspaceId: 'workspace-1',
};

const applyCommand = (
  snapshot: WorkspaceSnapshot,
  command: WorkspaceCommandEnvelope
): WorkspaceSnapshot => {
  const result = applyWorkspaceCommand(snapshot, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected command to apply.');
  return result.snapshot;
};

const applyTransaction = (
  snapshot: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope
): WorkspaceSnapshot => {
  const result = applyWorkspaceTransaction(snapshot, transaction);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected transaction to apply.');
  return result.snapshot;
};

describe('workspace history operations', () => {
  it('undoes and redoes a command with fresh causal operation ids', () => {
    const command = createPirCommand();
    const operation = createWorkspaceCommandOperation(command);
    const applied = applyCommand(createWorkspace(), command);
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      operation
    );
    const idFactory = ({
      direction,
      role,
    }: {
      direction: 'undo' | 'redo';
      role: 'operation' | 'command';
    }) => `${direction}-${role}`;

    const undone = undoWorkspaceHistory(applied, history, pirScope, {
      idFactory,
      clock: () => '2026-05-11T00:00:00.000Z',
    });
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['page-home'].content).not.toHaveProperty(
      'ui.graph.nodesById.root.props'
    );
    expect(undone.appliedOperation).toMatchObject({
      kind: 'command',
      command: {
        id: 'undo-operation',
        issuedAt: '2026-05-11T00:00:00.000Z',
      },
      undoOf: 'pir-command',
    });
    expect(undone.affectedDocumentIds).toEqual(['page-home']);

    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      pirScope,
      { idFactory }
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Home'
    );
    expect(redone.appliedOperation).toMatchObject({
      kind: 'command',
      command: { id: 'redo-operation' },
      redoOf: 'undo-operation',
    });
  });

  it('undoes transactions by reversing command order atomically', () => {
    const addProps = createPirCommand({
      id: 'add-props',
      type: 'props.add',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props',
          value: { title: 'Draft' },
        },
      ],
    });
    const replaceTitle = createPirCommand({
      id: 'replace-title',
      type: 'title.replace',
      forwardOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Published',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Draft',
        },
      ],
    });
    const transaction: WorkspaceTransactionEnvelope = {
      id: 'publish-title',
      workspaceId: 'workspace-1',
      issuedAt: ISSUED_AT,
      commands: [addProps, replaceTitle],
    };
    const applied = applyTransaction(createWorkspace(), transaction);
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceTransactionOperation(transaction)
    );

    const undone = undoWorkspaceHistory(applied, history, pirScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['page-home'].content).not.toHaveProperty(
      'ui.graph.nodesById.root.props'
    );
    expect(undone.appliedOperation.kind).toBe('transaction');
    if (undone.appliedOperation.kind !== 'transaction') return;
    expect(
      undone.appliedOperation.transaction.commands.map(({ type }) => type)
    ).toEqual(['title.replace', 'props.add']);

    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      pirScope
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Published'
    );
  });

  it('derives a narrow transaction scope only when every command shares it', () => {
    expect(
      resolveWorkspaceCommandScope(
        createPirCommand({ id: 'workspace-domain', domainHint: 'workspace' })
      )
    ).toEqual(workspaceScope);

    const sameScope = createWorkspaceTransactionOperation({
      id: 'same-scope',
      workspaceId: 'workspace-1',
      issuedAt: ISSUED_AT,
      commands: [
        createPirCommand({ id: 'pir-1' }),
        createPirCommand({ id: 'pir-2' }),
      ],
    });
    expect(resolveWorkspaceOperationScope(sameScope)).toEqual(pirScope);

    const crossScope = createWorkspaceTransactionOperation({
      id: 'cross-scope',
      workspaceId: 'workspace-1',
      issuedAt: ISSUED_AT,
      commands: [
        createPirCommand({ id: 'pir-1' }),
        createNodeGraphCommand({ id: 'graph-1' }),
      ],
    });
    expect(resolveWorkspaceOperationScope(crossScope)).toEqual(workspaceScope);
    expect(resolveWorkspaceOperationAffectedScopes(crossScope)).toEqual([
      pirScope,
      nodeGraphScope,
    ]);
    expect(collectWorkspaceOperationDocumentIds(crossScope)).toEqual([
      'page-home',
      'graph-checkout',
    ]);
  });

  it('merges adjacent operations with the same scope and merge key', () => {
    const first = createPirCommand({
      id: 'drag-1',
      mergeKey: 'node:root:title',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props',
          value: { title: 'Draft' },
        },
      ],
    });
    const latest = createPirCommand({
      id: 'drag-2',
      mergeKey: 'node:root:title',
      forwardOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Final',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Draft',
        },
      ],
    });
    let snapshot = applyCommand(createWorkspace(), first);
    let history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(first)
    );
    snapshot = applyCommand(snapshot, latest);
    history = recordWorkspaceOperation(
      history,
      createWorkspaceCommandOperation(latest)
    );

    expect(history.undoStack).toHaveLength(1);
    expect(history.undoStack[0].operation.kind).toBe('transaction');
    if (history.undoStack[0].operation.kind !== 'transaction') return;
    expect(history.undoStack[0].operation.transaction.commands).toHaveLength(2);
    expect(history.undoStack[0].operation.transaction.id).not.toBe('drag-1');
    expect(history.undoStack[0].operation.transaction.id).not.toBe('drag-2');
    expect(history.undoStack[0].operation.sourceOperationIds).toEqual([
      'drag-1',
      'drag-2',
    ]);

    const undone = undoWorkspaceHistory(snapshot, history, pirScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['page-home'].content).not.toHaveProperty(
      'ui.graph.nodesById.root.props'
    );

    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      pirScope
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Final'
    );
  });

  it('does not merge matching operations outside the configured time window', () => {
    const first = createWorkspaceCommandOperation(
      createPirCommand({ id: 'first', mergeKey: 'node:root:drag' })
    );
    const latest = createWorkspaceCommandOperation(
      createPirCommand({
        id: 'latest',
        issuedAt: '2026-05-10T00:00:02.000Z',
        mergeKey: 'node:root:drag',
      })
    );
    let history = recordWorkspaceOperation(
      createWorkspaceHistoryState({ mergeWindowMs: 750 }),
      first
    );
    history = recordWorkspaceOperation(history, latest);
    expect(history.undoStack.map(({ id }) => id)).toEqual(['first', 'latest']);

    history = recordWorkspaceOperation(createWorkspaceHistoryState(), first);
    history = recordWorkspaceOperation(history, latest, {
      mergeWindowMs: 3_000,
    });
    expect(history.undoStack).toHaveLength(1);
    expect(history.mergeWindowMs).toBe(3_000);
  });

  it('starts a new merge group after any successful history replay', () => {
    const first = createPirCommand({
      id: 'edit-1',
      mergeKey: 'node:root:title',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props',
          value: { title: 'First' },
        },
      ],
    });
    let snapshot = applyCommand(createWorkspace(), first);
    let history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(first)
    );
    const undone = undoWorkspaceHistory(snapshot, history, pirScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      pirScope
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    snapshot = redone.snapshot;
    history = redone.history;

    const second = createPirCommand({
      id: 'edit-2',
      mergeKey: 'node:root:title',
      issuedAt: '2026-05-10T00:00:00.100Z',
      forwardOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Second',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'First',
        },
      ],
    });
    snapshot = applyCommand(snapshot, second);
    history = recordWorkspaceOperation(
      history,
      createWorkspaceCommandOperation(second)
    );

    expect(snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Second'
    );
    expect(history.undoStack).toHaveLength(2);
    expect(history.undoStack.map(({ id }) => id)).toEqual(['edit-1', 'edit-2']);
  });

  it('invalidates redo entries that overlap a new branch', () => {
    const original = createPirCommand({ id: 'original' });
    const applied = applyCommand(createWorkspace(), original);
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(original)
    );
    const undone = undoWorkspaceHistory(applied, history, pirScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(canRedoWorkspaceHistory(undone.history, pirScope)).toBe(true);

    const branch = createPirCommand({
      id: 'branch',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props',
          value: { title: 'Branch' },
        },
      ],
    });
    const branchSnapshot = applyCommand(undone.snapshot, branch);
    const branchHistory = recordWorkspaceOperation(
      undone.history,
      createWorkspaceCommandOperation(branch)
    );
    expect(branchSnapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Branch'
    );
    expect(canRedoWorkspaceHistory(branchHistory, pirScope)).toBe(false);
  });

  it('prevents scoped undo from crossing a dependent workspace barrier', () => {
    const initialCommand = createPirCommand({
      id: 'initial',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props',
          value: { title: 'Initial' },
        },
      ],
    });
    let snapshot = applyCommand(createWorkspace(), initialCommand);
    let history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(initialCommand)
    );
    const transaction: WorkspaceTransactionEnvelope = {
      id: 'cross-editor-change',
      workspaceId: 'workspace-1',
      issuedAt: ISSUED_AT,
      commands: [
        createPirCommand({
          id: 'change-title',
          forwardOps: [
            {
              op: 'replace',
              path: '/ui/graph/nodesById/root/props/title',
              value: 'Cross editor',
            },
          ],
          reverseOps: [
            {
              op: 'replace',
              path: '/ui/graph/nodesById/root/props/title',
              value: 'Initial',
            },
          ],
        }),
        createNodeGraphCommand({ id: 'move-graph' }),
      ],
    };
    snapshot = applyTransaction(snapshot, transaction);
    history = recordWorkspaceOperation(
      history,
      createWorkspaceTransactionOperation(transaction)
    );

    expect(canUndoWorkspaceHistory(history, pirScope)).toBe(false);
    const blocked = undoWorkspaceHistory(snapshot, history, pirScope);
    expect(blocked).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_HISTORY_BARRIER_BLOCKED' }],
    });
    expect(
      selectUndoWorkspaceHistoryEntry(history, [pirScope, workspaceScope])?.id
    ).toBe('cross-editor-change');

    const undone = undoWorkspaceHistory(snapshot, history, workspaceScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['page-home'].content).toHaveProperty(
      'ui.graph.nodesById.root.props.title',
      'Initial'
    );
    expect(undone.snapshot.docsById['graph-checkout'].content).toHaveProperty(
      'nodesById.validateCart.position.x',
      0
    );
  });

  it('does not mutate the snapshot or history when an undo operation fails', () => {
    const snapshot = createWorkspace();
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(createPirCommand())
    );
    const snapshotBefore = structuredClone(snapshot);
    const historyBefore = structuredClone(history);

    const result = undoWorkspaceHistory(snapshot, history, pirScope);
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_HISTORY_OPERATION_FAILED' }],
    });
    expect(snapshot).toEqual(snapshotBefore);
    expect(history).toEqual(historyBefore);
  });

  it('keeps a transaction replay atomic when a later inverse command fails', () => {
    const before = createWorkspace();
    const beforeDocument = before.docsById['page-home'];
    if (!isPirDocumentContent(beforeDocument.content)) return;
    const rootNode = beforeDocument.content.ui.graph.nodesById.root;
    beforeDocument.content = {
      ...beforeDocument.content,
      ui: {
        graph: {
          ...beforeDocument.content.ui.graph,
          nodesById: {
            ...beforeDocument.content.ui.graph.nodesById,
            root: { ...rootNode, props: { title: 'Base' } },
          },
        },
      },
    };
    const addMarker = createPirCommand({
      id: 'add-marker',
      forwardOps: [
        {
          op: 'add',
          path: '/ui/graph/nodesById/root/props/marker',
          value: true,
        },
      ],
      reverseOps: [
        { op: 'remove', path: '/ui/graph/nodesById/root/props/marker' },
      ],
    });
    const replaceTitle = createPirCommand({
      id: 'replace-title',
      forwardOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Published',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/ui/graph/nodesById/root/props/title',
          value: 'Base',
        },
      ],
    });
    const transaction: WorkspaceTransactionEnvelope = {
      id: 'atomic-failure',
      workspaceId: before.id,
      issuedAt: ISSUED_AT,
      commands: [addMarker, replaceTitle],
    };
    const applied = applyTransaction(before, transaction);
    const inconsistent = structuredClone(applied);
    const inconsistentDocument = inconsistent.docsById['page-home'];
    if (!isPirDocumentContent(inconsistentDocument.content)) return;
    delete inconsistentDocument.content.ui.graph.nodesById.root.props?.marker;
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceTransactionOperation(transaction)
    );
    const snapshotBefore = structuredClone(inconsistent);
    const historyBefore = structuredClone(history);

    const result = undoWorkspaceHistory(inconsistent, history, pirScope);

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_HISTORY_OPERATION_FAILED' }],
    });
    expect(inconsistent).toEqual(snapshotBefore);
    expect(history).toEqual(historyBefore);
  });

  it('rebirths a removed document identity at revision one across undo and redo', () => {
    const before = createWorkspace();
    const removedDocument = before.docsById['graph-checkout']!;
    removedDocument.contentRev = 7;
    removedDocument.metaRev = 4;
    removedDocument.updatedAt = '2026-05-09T23:59:00.000Z';
    const removedNode = before.treeById['checkout-node']!;
    const command: WorkspaceCommandEnvelope = {
      id: 'delete-graph-document',
      namespace: 'core.workspace',
      type: 'document.delete',
      version: '1.0',
      issuedAt: ISSUED_AT,
      target: { workspaceId: before.id },
      domainHint: 'workspace',
      forwardOps: [
        { op: 'remove', path: '/treeById/graphs/children/0' },
        { op: 'remove', path: '/treeById/checkout-node' },
        { op: 'remove', path: '/docsById/graph-checkout' },
      ],
      reverseOps: [
        {
          op: 'add',
          path: '/docsById/graph-checkout',
          value: structuredClone(removedDocument),
        },
        {
          op: 'add',
          path: '/treeById/checkout-node',
          value: structuredClone(removedNode),
        },
        {
          op: 'add',
          path: '/treeById/graphs/children/0',
          value: 'checkout-node',
        },
      ],
    };
    const afterDelete = applyCommand(before, command);
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(command)
    );

    const undone = undoWorkspaceHistory(afterDelete, history, workspaceScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['graph-checkout']).toMatchObject({
      contentRev: 1,
      metaRev: 1,
    });
    expect(undone.snapshot.docsById['graph-checkout']).not.toHaveProperty(
      'updatedAt'
    );
    expect(undone.appliedOperation.kind).toBe('command');
    if (undone.appliedOperation.kind !== 'command') return;
    expect(
      undone.appliedOperation.command.forwardOps.find(
        ({ path }) => path === '/docsById/graph-checkout'
      )
    ).toMatchObject({
      op: 'add',
      value: { contentRev: 1, metaRev: 1 },
    });

    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      workspaceScope
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok || redone.appliedOperation.kind !== 'command') return;
    expect(redone.snapshot.docsById['graph-checkout']).toBeUndefined();
    expect(redone.appliedOperation.command.reverseOps[0]).toMatchObject({
      op: 'add',
      path: '/docsById/graph-checkout',
      value: { contentRev: 1, metaRev: 1 },
    });
  });

  it('bounds and dynamically trims both history stacks', () => {
    let history = createWorkspaceHistoryState({ maxEntries: 2 });
    for (const id of ['first', 'second', 'third']) {
      history = recordWorkspaceOperation(
        history,
        createWorkspaceCommandOperation(
          createPirCommand({ id, forwardOps: [], reverseOps: [] })
        )
      );
    }
    expect(history.undoStack.map(({ id }) => id)).toEqual(['second', 'third']);

    const trimmed = setWorkspaceHistoryLimit(
      {
        ...history,
        redoStack: [...history.undoStack],
      },
      1
    );
    expect(trimmed.maxEntries).toBe(1);
    expect(trimmed.undoStack.map(({ id }) => id)).toEqual(['third']);
    expect(trimmed.redoStack.map(({ id }) => id)).toEqual(['third']);
  });

  it('collects changed document ids by semantic content instead of references', () => {
    const before = createWorkspace();
    const equivalent = structuredClone(before);
    expect(collectChangedWorkspaceDocumentIds(before, equivalent)).toEqual([]);

    const changed = structuredClone(before);
    changed.docsById['page-home'].contentRev = 2;
    delete changed.docsById['graph-checkout'];
    expect(collectChangedWorkspaceDocumentIds(before, changed)).toEqual([
      'page-home',
      'graph-checkout',
    ]);
  });

  it('replays commands that update the same selection path more than once', () => {
    const command = createPirCommand({
      id: 'multi-selection',
      namespace: 'core.workspace',
      type: 'selection.sequence',
      target: { workspaceId: 'workspace-1' },
      domainHint: 'workspace',
      forwardOps: [
        {
          op: 'replace',
          path: '/activeDocumentId',
          value: 'graph-checkout',
        },
        {
          op: 'replace',
          path: '/activeDocumentId',
          value: 'page-home',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/activeDocumentId',
          value: 'graph-checkout',
        },
        {
          op: 'replace',
          path: '/activeDocumentId',
          value: 'page-home',
        },
      ],
    });
    const applied = applyCommand(createWorkspace(), command);
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(command)
    );

    const undone = undoWorkspaceHistory(applied, history, workspaceScope);

    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.activeDocumentId).toBe('page-home');
  });

  it('treats active route and document ids as ephemeral during replay', () => {
    const before = createWorkspace();
    const plan = createWorkspaceRouteIntentPlan(
      before,
      {
        type: 'create-page',
        path: '/about',
        routeNodeId: 'route-about',
      },
      {
        id: 'create-about',
        issuedAt: ISSUED_AT,
        idFactory: (prefix) => `${prefix}-generated`,
      }
    );
    expect(plan?.kind).toBe('transaction');
    if (!plan || plan.kind !== 'transaction') return;
    const applied = applyTransaction(before, plan.transaction);
    expect(applied.activeRouteNodeId).toBe('route-about');
    const selectedHome = {
      ...applied,
      activeDocumentId: 'page-home',
      activeRouteNodeId: 'route-home',
    };
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceTransactionOperation(plan.transaction)
    );

    const undone = undoWorkspaceHistory(selectedHome, history, workspaceScope);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.snapshot.docsById['page-generated']).toBeUndefined();
    expect(undone.snapshot.activeDocumentId).toBe('page-home');
    expect(undone.snapshot.activeRouteNodeId).toBe('route-home');

    const redone = redoWorkspaceHistory(
      undone.snapshot,
      undone.history,
      workspaceScope
    );
    expect(redone.ok).toBe(true);
    if (!redone.ok) return;
    expect(redone.snapshot.docsById['page-generated']).toBeDefined();
    expect(redone.snapshot.activeDocumentId).toBe('page-home');
    expect(redone.snapshot.activeRouteNodeId).toBe('route-home');
  });
});
