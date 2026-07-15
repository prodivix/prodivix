import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceTransaction,
  createWorkspaceDocumentAtPathCommand,
  createWorkspaceHistoryState,
  type DecodedWorkspaceMutation,
  type WorkspaceCommandEnvelope,
  type WorkspaceHistoryScope,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import type { WorkspaceConflictSession } from '@prodivix/workspace-sync';
import { useEditorStore } from '@/editor/store/useEditorStore';

const createEditorWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-test',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  treeById: {
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
      children: ['doc-page-home'],
    },
    'doc-page-home': {
      id: 'doc-page-home',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [{ id: 'route-home', index: true, pageDocId: 'page-home' }],
    },
  },
  activeDocumentId: 'page-home',
  activeRouteNodeId: 'route-home',
});

const resetEditorStore = () => {
  const state = useEditorStore.getState();
  useEditorStore.setState(
    {
      ...state,
      workspace: null,
      workspaceHistory: createWorkspaceHistoryState(),
      documentEditSeqById: {},
      workspaceCapabilities: {},
      workspaceCapabilitiesLoaded: false,
      workspaceReadonly: false,
      workspaceRevisionConflict: null,
      workspaceConflictResolutionStatus: 'idle',
      workspaceConflictResolutionError: null,
      blueprintStateByProject: {},
      runtimeStateByProject: {},
      projectsById: {},
    },
    true
  );
};

const createMetadataCommand = (
  overrides: Partial<WorkspaceCommandEnvelope> = {}
): WorkspaceCommandEnvelope => ({
  id: 'command-metadata',
  namespace: 'core.pir',
  type: 'metadata.update',
  version: '1.0',
  issuedAt: '2026-07-12T00:00:00.000Z',
  target: {
    workspaceId: 'workspace-test',
    documentId: 'page-home',
  },
  domainHint: 'pir',
  forwardOps: [{ op: 'add', path: '/metadata', value: { name: 'One' } }],
  reverseOps: [{ op: 'remove', path: '/metadata' }],
  ...overrides,
});

const PIR_SCOPE: WorkspaceHistoryScope = {
  kind: 'document',
  workspaceId: 'workspace-test',
  documentId: 'page-home',
  domain: 'pir',
};

const WORKSPACE_SCOPE: WorkspaceHistoryScope = {
  kind: 'workspace',
  workspaceId: 'workspace-test',
};

const createAboutDocumentCommand = (
  workspace: WorkspaceSnapshot
): WorkspaceCommandEnvelope =>
  createWorkspaceDocumentAtPathCommand({
    workspace,
    document: {
      id: 'page-about',
      type: 'pir-page',
      path: '/pages/about.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
    commandId: 'command-create-about',
    issuedAt: '2026-07-12T00:00:00.000Z',
  });

beforeEach(() => resetEditorStore());

describe('editor workspace store hard cut', () => {
  it('hydrates only the canonical workspace and resets local edit sequences', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    expect(useEditorStore.getState().documentEditSeqById['page-home']).toBe(1);

    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    const state = useEditorStore.getState();
    expect(state.workspace).toBe(workspace);
    expect(state.workspaceHistory.undoStack).toEqual([]);
    expect(state.workspaceHistory.redoStack).toEqual([]);
    expect(state.documentEditSeqById).toEqual({});
    expect('pirDoc' in state).toBe(false);
    expect('workspaceDocumentsById' in state).toBe(false);
    expect('routeManifest' in state).toBe(false);
  });

  it('applies mutation acknowledgements without incrementing local edit sequences', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const editedDocument =
      useEditorStore.getState().workspace?.docsById['page-home'];
    if (!editedDocument) throw new Error('Expected active document.');
    const mutation: DecodedWorkspaceMutation = {
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 1,
      opSeq: 2,
      updatedDocuments: [{ ...editedDocument, contentRev: 2 }],
      removedDocumentIds: [],
    };

    useEditorStore.getState().applyWorkspaceMutation(mutation);

    const state = useEditorStore.getState();
    expect(state.workspace?.workspaceRev).toBe(2);
    expect(state.workspace?.docsById['page-home'].contentRev).toBe(2);
    expect(state.documentEditSeqById['page-home']).toBe(1);
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.redoStack).toEqual([]);
  });

  it('keeps edits made after a request while accepting its confirmed revision', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const requestedDocument =
      useEditorStore.getState().workspace?.docsById['page-home'];
    if (!requestedDocument) throw new Error('Expected requested document.');
    expect(useEditorStore.getState().documentEditSeqById['page-home']).toBe(1);

    expect(useEditorStore.getState().undoWorkspaceHistory(PIR_SCOPE)?.ok).toBe(
      true
    );
    expect(useEditorStore.getState().documentEditSeqById['page-home']).toBe(2);
    useEditorStore.getState().applyWorkspaceMutation(
      {
        workspaceId: workspace.id,
        workspaceRev: 2,
        routeRev: 1,
        opSeq: 2,
        updatedDocuments: [{ ...requestedDocument, contentRev: 2 }],
        removedDocumentIds: [],
      },
      { expectedDocumentEditSeqById: { 'page-home': 1 } }
    );

    const state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-home'].content).not.toHaveProperty(
      'metadata'
    );
    expect(state.workspace?.docsById['page-home'].contentRev).toBe(2);
    expect(state.workspaceHistory.redoStack).toHaveLength(1);
    expect(state.documentEditSeqById['page-home']).toBe(2);
  });

  it('keeps newer metadata while applying a delayed content acknowledgement', () => {
    const workspace = createEditorWorkspace();
    workspace.docsById['page-home'] = {
      ...workspace.docsById['page-home'],
      capabilities: ['base'],
      updatedAt: '2026-07-12T00:00:00.000Z',
    };
    useEditorStore.getState().setWorkspaceSnapshot(workspace);

    useEditorStore.getState().applyWorkspaceMutation({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 1,
      opSeq: 3,
      updatedDocuments: [
        {
          ...workspace.docsById['page-home'],
          metaRev: 3,
          capabilities: ['modern'],
          updatedAt: '2026-07-12T00:00:03.000Z',
        },
      ],
      removedDocumentIds: [],
    });
    useEditorStore.getState().applyWorkspaceMutation(
      {
        workspaceId: workspace.id,
        workspaceRev: 2,
        routeRev: 1,
        opSeq: 4,
        updatedDocuments: [
          {
            ...workspace.docsById['page-home'],
            contentRev: 2,
            content: {
              ...createEmptyPirDocument(),
              metadata: { name: 'Confirmed content' },
            },
            capabilities: ['stale'],
            updatedAt: '2026-07-12T00:00:02.000Z',
          },
        ],
        removedDocumentIds: [],
      },
      { expectedDocumentEditSeqById: { 'page-home': 0 } }
    );

    expect(
      useEditorStore.getState().workspace?.docsById['page-home']
    ).toMatchObject({
      contentRev: 2,
      metaRev: 3,
      capabilities: ['modern'],
      updatedAt: '2026-07-12T00:00:03.000Z',
      content: { metadata: { name: 'Confirmed content' } },
    });
  });

  it('preserves metadata edited after a request while advancing its acknowledged revisions', () => {
    const workspace = createEditorWorkspace();
    workspace.docsById['page-home'] = {
      ...workspace.docsById['page-home'],
      capabilities: ['base'],
      updatedAt: '2026-07-12T00:00:00.000Z',
    };
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    const expectedEditSeq =
      useEditorStore.getState().documentEditSeqById['page-home'] ?? 0;
    useEditorStore.getState().dispatchWorkspaceCommand({
      id: 'command-local-capabilities',
      namespace: 'core.workspace',
      type: 'document.capabilities.update',
      version: '1.0',
      issuedAt: '2026-07-12T00:00:01.000Z',
      target: { workspaceId: workspace.id },
      domainHint: 'workspace',
      forwardOps: [
        {
          op: 'replace',
          path: '/docsById/page-home/capabilities',
          value: ['local'],
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/docsById/page-home/capabilities',
          value: ['base'],
        },
      ],
    });

    useEditorStore.getState().applyWorkspaceMutation(
      {
        workspaceId: workspace.id,
        workspaceRev: 2,
        routeRev: 1,
        opSeq: 2,
        updatedDocuments: [
          {
            ...workspace.docsById['page-home'],
            contentRev: 2,
            metaRev: 2,
            capabilities: ['server'],
            updatedAt: '2026-07-12T00:00:02.000Z',
          },
        ],
        removedDocumentIds: [],
      },
      {
        expectedDocumentEditSeqById: {
          'page-home': expectedEditSeq,
        },
      }
    );

    expect(
      useEditorStore.getState().workspace?.docsById['page-home']
    ).toMatchObject({
      contentRev: 2,
      metaRev: 2,
      capabilities: ['local'],
      updatedAt: '2026-07-12T00:00:02.000Z',
    });
  });

  it('adopts a rebased operation as a new safe history baseline', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const requestSnapshot = useEditorStore.getState().workspace!;

    const remoteContent = {
      ...createEmptyPirDocument(),
      metadata: { description: 'Remote description' },
    };
    const remoteDocument = {
      ...workspace.docsById['page-home'],
      content: remoteContent,
    };
    const rebasedCommand = createMetadataCommand({
      id: 'command-rebased',
      forwardOps: [{ op: 'add', path: '/metadata/name', value: 'Local name' }],
      reverseOps: [{ op: 'remove', path: '/metadata/name' }],
    });
    const rebasedSnapshot: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'page-home': {
          ...remoteDocument,
          content: {
            ...remoteContent,
            metadata: {
              description: 'Remote description',
              name: 'Local name',
            },
          },
        },
      },
    };
    const serverBaseSnapshot: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'page-home': remoteDocument,
      },
    };
    const mutation: DecodedWorkspaceMutation = {
      workspaceId: workspace.id,
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 3,
      updatedDocuments: [
        { ...rebasedSnapshot.docsById['page-home'], contentRev: 2 },
      ],
      removedDocumentIds: [],
      acceptedMutationId: rebasedCommand.id,
    };

    expect(
      useEditorStore.getState().adoptRebasedWorkspaceOperation({
        requestSnapshot,
        serverBaseSnapshot,
        rebasedSnapshot,
        operation: { kind: 'command', command: rebasedCommand },
        mutation,
        expectedDocumentEditSeqById: { 'page-home': 1 },
      })
    ).toMatchObject({
      status: 'adopted',
      documentEditsObservedDuringRequest: false,
    });

    const state = useEditorStore.getState();
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.undoStack[0].operation).toMatchObject({
      kind: 'command',
      command: { id: expect.stringMatching(/^workspace-history-/) },
      sourceOperationIds: ['command-rebased'],
    });
    expect(state.workspace?.docsById['page-home'].content).toHaveProperty(
      'metadata',
      { description: 'Remote description', name: 'Local name' }
    );

    expect(state.undoWorkspaceHistory(PIR_SCOPE)?.ok).toBe(true);
    expect(
      useEditorStore.getState().workspace?.docsById['page-home'].content
    ).toHaveProperty('metadata', { description: 'Remote description' });
    expect(
      useEditorStore.getState().workspace?.docsById['page-home'].contentRev
    ).toBe(2);
  });

  it('preserves edits made while a rebased request is in flight', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const requestSnapshot = useEditorStore.getState().workspace!;
    const requestEditSeq =
      useEditorStore.getState().documentEditSeqById['page-home']!;
    const requestDocument = requestSnapshot.docsById['page-home'];
    const serverBaseSnapshot: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'page-home': {
          ...workspace.docsById['page-home'],
          content: {
            ...createEmptyPirDocument(),
            metadata: { description: 'Remote description' },
          },
        },
      },
    };
    const rebasedCommand = createMetadataCommand({
      id: 'command-rebased-in-flight',
      forwardOps: [{ op: 'add', path: '/metadata/name', value: 'One' }],
      reverseOps: [{ op: 'remove', path: '/metadata/name' }],
    });
    const rebasedSnapshot: WorkspaceSnapshot = {
      ...serverBaseSnapshot,
      docsById: {
        ...serverBaseSnapshot.docsById,
        'page-home': {
          ...serverBaseSnapshot.docsById['page-home'],
          content: {
            ...createEmptyPirDocument(),
            metadata: {
              description: 'Remote description',
              name: 'One',
            },
          },
        },
      },
    };

    useEditorStore.getState().dispatchWorkspaceCommand(
      createMetadataCommand({
        id: 'command-during-request',
        forwardOps: [
          { op: 'add', path: '/metadata/author', value: 'Local author' },
        ],
        reverseOps: [{ op: 'remove', path: '/metadata/author' }],
      })
    );

    const result = useEditorStore.getState().adoptRebasedWorkspaceOperation({
      requestSnapshot,
      serverBaseSnapshot,
      rebasedSnapshot,
      operation: { kind: 'command', command: rebasedCommand },
      mutation: {
        workspaceId: workspace.id,
        workspaceRev: 2,
        routeRev: 1,
        opSeq: 4,
        updatedDocuments: [
          { ...rebasedSnapshot.docsById['page-home'], contentRev: 2 },
        ],
        removedDocumentIds: [],
        acceptedMutationId: rebasedCommand.id,
      },
      expectedDocumentEditSeqById: {
        'page-home': requestEditSeq,
      },
    });

    expect(result).toMatchObject({
      status: 'adopted',
      documentEditsObservedDuringRequest: true,
    });
    const state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-home'].content).toHaveProperty(
      'metadata',
      {
        description: 'Remote description',
        name: 'One',
        author: 'Local author',
      }
    );
    expect(state.documentEditSeqById['page-home']).toBe(2);
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.undoStack[0].operation).not.toMatchObject({
      kind: 'command',
      command: { id: 'command-during-request' },
    });

    expect(state.undoWorkspaceHistory(PIR_SCOPE)?.ok).toBe(true);
    expect(
      useEditorStore.getState().workspace?.docsById['page-home'].content
    ).toHaveProperty('metadata', { description: 'Remote description' });
    expect(requestDocument.content).toHaveProperty('metadata', { name: 'One' });
  });

  it('opens a new conflict without replacing later local edits', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    const requestSnapshot = useEditorStore.getState().workspace!;
    const requestEditSeq =
      useEditorStore.getState().documentEditSeqById['page-home']!;
    const serverBaseSnapshot: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        'page-home': {
          ...workspace.docsById['page-home'],
          content: {
            ...createEmptyPirDocument(),
            metadata: { description: 'Remote description' },
          },
        },
      },
    };
    const rebasedCommand = createMetadataCommand({
      id: 'command-rebased-conflict',
      forwardOps: [{ op: 'add', path: '/metadata/name', value: 'One' }],
      reverseOps: [{ op: 'remove', path: '/metadata/name' }],
    });
    const rebasedSnapshot: WorkspaceSnapshot = {
      ...serverBaseSnapshot,
      docsById: {
        ...serverBaseSnapshot.docsById,
        'page-home': {
          ...serverBaseSnapshot.docsById['page-home'],
          content: {
            ...createEmptyPirDocument(),
            metadata: {
              description: 'Remote description',
              name: 'One',
            },
          },
        },
      },
    };
    useEditorStore.getState().dispatchWorkspaceCommand(
      createMetadataCommand({
        id: 'command-conflicting-during-request',
        forwardOps: [
          {
            op: 'add',
            path: '/metadata/description',
            value: 'Local description',
          },
        ],
        reverseOps: [{ op: 'remove', path: '/metadata/description' }],
      })
    );
    const beforeAdoption = useEditorStore.getState();
    const result = beforeAdoption.adoptRebasedWorkspaceOperation({
      requestSnapshot,
      serverBaseSnapshot,
      rebasedSnapshot,
      operation: { kind: 'command', command: rebasedCommand },
      mutation: {
        workspaceId: workspace.id,
        workspaceRev: 2,
        routeRev: 1,
        opSeq: 4,
        updatedDocuments: [
          { ...rebasedSnapshot.docsById['page-home'], contentRev: 2 },
        ],
        removedDocumentIds: [],
        acceptedMutationId: rebasedCommand.id,
      },
      expectedDocumentEditSeqById: { 'page-home': requestEditSeq },
    });

    expect(result.status).toBe('conflict');
    const state = useEditorStore.getState();
    expect(state.workspace).toBe(beforeAdoption.workspace);
    expect(state.workspaceHistory).toBe(beforeAdoption.workspaceHistory);
    expect(state.workspace?.docsById['page-home'].content).toHaveProperty(
      'metadata.description',
      'Local description'
    );
    expect(state.workspaceRevisionConflict).toMatchObject({
      id: result.status === 'conflict' ? result.session.id : '',
      status: 'open',
      localSnapshot: beforeAdoption.workspace,
      remoteSnapshot: expect.objectContaining({ workspaceRev: 2 }),
    });
  });

  it('rejects a stale adoption without clearing a newer conflict session', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    const newerSession = {
      id: 'conflict-newer',
      workspaceId: workspace.id,
    } as WorkspaceConflictSession;
    useEditorStore.setState({ workspaceRevisionConflict: newerSession });
    const command = createMetadataCommand({ id: 'stale-resolution' });

    const result = useEditorStore.getState().adoptRebasedWorkspaceOperation({
      requestSnapshot: workspace,
      serverBaseSnapshot: workspace,
      rebasedSnapshot: workspace,
      operation: { kind: 'command', command },
      expectedDocumentEditSeqById: {},
      expectedConflictSessionId: 'conflict-older',
    });

    expect(result).toMatchObject({ status: 'rejected' });
    expect(useEditorStore.getState().workspaceRevisionConflict).toBe(
      newerSession
    );
    expect(useEditorStore.getState().workspace).toBe(workspace);
  });

  it('aligns the authoring document when selecting a route with a page', () => {
    const workspace = createEditorWorkspace();
    const aboutDocument = {
      ...workspace.docsById['page-home'],
      id: 'page-about',
      path: '/pages/about.pir.json',
    };
    const nextWorkspace = {
      ...workspace,
      treeById: {
        ...workspace.treeById,
        pages: {
          ...workspace.treeById.pages,
          children: ['doc-page-home', 'doc-page-about'],
        },
        'doc-page-about': {
          id: 'doc-page-about',
          kind: 'doc' as const,
          name: 'about.pir.json',
          parentId: 'pages',
          docId: 'page-about',
        },
      },
      docsById: {
        ...workspace.docsById,
        'page-about': aboutDocument,
      },
      routeManifest: {
        ...workspace.routeManifest,
        root: {
          ...workspace.routeManifest.root,
          children: [
            ...(workspace.routeManifest.root.children ?? []),
            {
              id: 'route-about',
              segment: 'about',
              pageDocId: 'page-about',
            },
          ],
        },
      },
    };
    useEditorStore.getState().setWorkspaceSnapshot(nextWorkspace);

    useEditorStore.getState().setActiveRouteNodeId('route-about');

    expect(useEditorStore.getState().workspace).toMatchObject({
      activeRouteNodeId: 'route-about',
      activeDocumentId: 'page-about',
    });
  });

  it('counts a multi-command document transaction as one local edit', () => {
    useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
    const transaction: WorkspaceTransactionEnvelope = {
      id: 'transaction-metadata',
      workspaceId: 'workspace-test',
      issuedAt: '2026-07-12T00:00:00.000Z',
      commands: [
        createMetadataCommand({ id: 'command-metadata-add' }),
        createMetadataCommand({
          id: 'command-metadata-replace',
          forwardOps: [{ op: 'replace', path: '/metadata/name', value: 'Two' }],
          reverseOps: [{ op: 'replace', path: '/metadata/name', value: 'One' }],
        }),
      ],
    };

    const result = useEditorStore
      .getState()
      .dispatchWorkspaceTransaction(transaction);

    expect(result?.ok).toBe(true);
    expect(useEditorStore.getState().documentEditSeqById['page-home']).toBe(1);
    expect(useEditorStore.getState().workspaceHistory.undoStack).toHaveLength(
      1
    );
    expect(
      useEditorStore.getState().workspaceHistory.undoStack[0].operation.kind
    ).toBe('transaction');
    expect(
      useEditorStore.getState().workspace?.docsById['page-home'].content
    ).toHaveProperty('metadata.name', 'Two');
  });

  it('tracks documents created by workspace commands without document targets', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);

    const result = useEditorStore
      .getState()
      .dispatchWorkspaceCommand(createAboutDocumentCommand(workspace));

    expect(result?.ok).toBe(true);
    const state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-about']).toBeDefined();
    expect(state.documentEditSeqById['page-about']).toBe(1);
    expect(state.documentEditSeqById['page-home']).toBeUndefined();
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.undoStack[0].scope).toEqual(WORKSPACE_SCOPE);
  });

  it('undoes and redoes a document command atomically with edit sequences', () => {
    useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());

    const undone = useEditorStore.getState().undoWorkspaceHistory(PIR_SCOPE);

    expect(undone?.ok).toBe(true);
    let state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-home'].content).not.toHaveProperty(
      'metadata'
    );
    expect(state.documentEditSeqById['page-home']).toBe(2);
    expect(state.workspaceHistory.undoStack).toEqual([]);
    expect(state.workspaceHistory.redoStack).toHaveLength(1);

    const redone = state.redoWorkspaceHistory(PIR_SCOPE);

    expect(redone?.ok).toBe(true);
    state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-home'].content).toHaveProperty(
      'metadata.name',
      'One'
    );
    expect(state.documentEditSeqById['page-home']).toBe(3);
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.redoStack).toEqual([]);
  });

  it('undoes a transaction as one history operation and one document edit', () => {
    useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
    const transaction: WorkspaceTransactionEnvelope = {
      id: 'transaction-metadata-undo',
      workspaceId: 'workspace-test',
      issuedAt: '2026-07-12T00:00:00.000Z',
      commands: [
        createMetadataCommand({ id: 'command-metadata-add-undo' }),
        createMetadataCommand({
          id: 'command-metadata-replace-undo',
          forwardOps: [{ op: 'replace', path: '/metadata/name', value: 'Two' }],
          reverseOps: [{ op: 'replace', path: '/metadata/name', value: 'One' }],
        }),
      ],
    };
    useEditorStore.getState().dispatchWorkspaceTransaction(transaction);

    const result = useEditorStore.getState().undoWorkspaceHistory(PIR_SCOPE);

    expect(result?.ok).toBe(true);
    const state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-home'].content).not.toHaveProperty(
      'metadata'
    );
    expect(state.documentEditSeqById['page-home']).toBe(2);
    expect(state.workspaceHistory.redoStack).toHaveLength(1);
    expect(state.workspaceHistory.redoStack[0].operation.kind).toBe(
      'transaction'
    );
  });

  it('removes edit sequences when undo deletes a newly created document', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore
      .getState()
      .dispatchWorkspaceCommand(createAboutDocumentCommand(workspace));
    expect(useEditorStore.getState().documentEditSeqById['page-about']).toBe(1);

    const undone = useEditorStore
      .getState()
      .undoWorkspaceHistory(WORKSPACE_SCOPE);

    expect(undone?.ok).toBe(true);
    expect(
      useEditorStore.getState().workspace?.docsById['page-about']
    ).toBeUndefined();
    expect(
      useEditorStore.getState().documentEditSeqById['page-about']
    ).toBeUndefined();

    const redone = useEditorStore
      .getState()
      .redoWorkspaceHistory(WORKSPACE_SCOPE);
    expect(redone?.ok).toBe(true);
    expect(useEditorStore.getState().documentEditSeqById['page-about']).toBe(1);
  });

  it('does not mutate workspace state or history when readonly or apply fails', () => {
    useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
    useEditorStore.getState().setWorkspaceReadonly(true);
    const readonlyState = useEditorStore.getState();

    expect(
      readonlyState.dispatchWorkspaceCommand(createMetadataCommand())
    ).toBeNull();
    expect(useEditorStore.getState().workspace).toBe(readonlyState.workspace);
    expect(useEditorStore.getState().workspaceHistory).toBe(
      readonlyState.workspaceHistory
    );
    expect(useEditorStore.getState().documentEditSeqById).toBe(
      readonlyState.documentEditSeqById
    );

    useEditorStore.getState().setWorkspaceReadonly(false);
    const editableState = useEditorStore.getState();
    const failed = editableState.dispatchWorkspaceCommand(
      createMetadataCommand({
        target: { workspaceId: 'another-workspace', documentId: 'page-home' },
      })
    );
    expect(failed?.ok).toBe(false);
    expect(useEditorStore.getState().workspace).toBe(editableState.workspace);
    expect(useEditorStore.getState().workspaceHistory).toBe(
      editableState.workspaceHistory
    );
    expect(useEditorStore.getState().documentEditSeqById).toBe(
      editableState.documentEditSeqById
    );
  });

  it('keeps history unchanged when undo has no entry or is readonly', () => {
    useEditorStore.getState().setWorkspaceSnapshot(createEditorWorkspace());
    const emptyState = useEditorStore.getState();
    const missing = emptyState.undoWorkspaceHistory(PIR_SCOPE);
    expect(missing?.ok).toBe(false);
    expect(useEditorStore.getState().workspace).toBe(emptyState.workspace);
    expect(useEditorStore.getState().workspaceHistory).toBe(
      emptyState.workspaceHistory
    );

    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    useEditorStore.getState().setWorkspaceReadonly(true);
    const readonlyState = useEditorStore.getState();
    expect(readonlyState.undoWorkspaceHistory(PIR_SCOPE)).toBeNull();
    expect(useEditorStore.getState().workspace).toBe(readonlyState.workspace);
    expect(useEditorStore.getState().workspaceHistory).toBe(
      readonlyState.workspaceHistory
    );
  });

  it('bounds history and preserves the configured limit across hydration resets', () => {
    useEditorStore.getState().setWorkspaceHistoryLimit(1);
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore.getState().dispatchWorkspaceCommand(createMetadataCommand());
    useEditorStore.getState().dispatchWorkspaceCommand(
      createMetadataCommand({
        id: 'command-metadata-two',
        issuedAt: '2026-07-12T00:00:01.000Z',
        forwardOps: [{ op: 'replace', path: '/metadata/name', value: 'Two' }],
        reverseOps: [{ op: 'replace', path: '/metadata/name', value: 'One' }],
      })
    );
    expect(useEditorStore.getState().workspaceHistory.maxEntries).toBe(1);
    expect(useEditorStore.getState().workspaceHistory.undoStack).toHaveLength(
      1
    );

    useEditorStore.getState().setWorkspaceSnapshot(workspace);

    expect(useEditorStore.getState().workspaceHistory).toMatchObject({
      maxEntries: 1,
      undoStack: [],
      redoStack: [],
    });
  });

  it('keeps user history while remote mutations remove local edit sequences', () => {
    const workspace = createEditorWorkspace();
    useEditorStore.getState().setWorkspaceSnapshot(workspace);
    useEditorStore
      .getState()
      .dispatchWorkspaceCommand(createAboutDocumentCommand(workspace));
    const editedWorkspace = useEditorStore.getState().workspace;
    if (!editedWorkspace) throw new Error('Expected edited workspace.');
    const { ['doc_page-about']: _removedNode, ...treeById } =
      editedWorkspace.treeById;
    treeById.pages = {
      ...treeById.pages,
      children: treeById.pages.children.filter(
        (nodeId) => nodeId !== 'doc_page-about'
      ),
    };

    useEditorStore.getState().applyWorkspaceMutation({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 1,
      opSeq: 2,
      tree: { treeRootId: editedWorkspace.treeRootId, treeById },
      updatedDocuments: [],
      removedDocumentIds: ['page-about'],
    });

    const state = useEditorStore.getState();
    expect(state.workspace?.docsById['page-about']).toBeUndefined();
    expect(state.documentEditSeqById['page-about']).toBeUndefined();
    expect(state.workspaceHistory.undoStack).toHaveLength(1);
    expect(state.workspaceHistory.redoStack).toEqual([]);
  });
});
