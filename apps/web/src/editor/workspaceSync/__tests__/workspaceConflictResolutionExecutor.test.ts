import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceOperationCommands,
  getWorkspaceOperationId,
  type DecodedWorkspaceMutation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import {
  createWorkspaceConflictSession,
  createMemoryWorkspaceOutboxStore,
  resolveWorkspaceConflictSessionBatch,
  type WorkspaceConflictSession,
  type WorkspaceOutboxStore,
} from '@prodivix/workspace-sync';
import { editorApi } from '@/editor/editorApi';
import { ApiError } from '@/infra/api';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { executeWorkspaceConflictResolution } from '@/editor/workspaceSync/workspaceConflictResolutionExecutor';

const cloneWorkspace = (workspace: WorkspaceSnapshot): WorkspaceSnapshot =>
  structuredClone(workspace);

const setPageMetadata = (
  workspace: WorkspaceSnapshot,
  metadata: Record<string, unknown>
) => {
  const document = workspace.docsById['page-home'];
  if (!document || typeof document.content !== 'object' || !document.content) {
    throw new Error('Expected a page document.');
  }
  document.content = { ...document.content, metadata };
};

const addCodeDocument = (workspace: WorkspaceSnapshot) => {
  const pages = workspace.treeById.pages;
  if (!pages) throw new Error('Expected the pages directory.');
  pages.children = [...(pages.children ?? []), 'doc-code-main'];
  workspace.treeById['doc-code-main'] = {
    id: 'doc-code-main',
    kind: 'doc',
    name: 'main.ts',
    parentId: 'pages',
    docId: 'code-main',
  };
  workspace.docsById['code-main'] = {
    id: 'code-main',
    type: 'code',
    path: '/pages/main.ts',
    contentRev: 1,
    metaRev: 1,
    content: { language: 'typescript', source: 'export const value = 0;' },
  };
};

const setCodeSource = (workspace: WorkspaceSnapshot, source: string) => {
  const document = workspace.docsById['code-main'];
  if (!document || typeof document.content !== 'object' || !document.content) {
    throw new Error('Expected a code document.');
  }
  document.content = { ...document.content, source };
};

const createSession = (includeCodeDocument: boolean) => {
  const base = createEditorWorkspace();
  setPageMetadata(base, { name: 'Base name' });
  if (includeCodeDocument) addCodeDocument(base);
  const local = cloneWorkspace(base);
  const remote = cloneWorkspace(base);
  setPageMetadata(local, { name: 'Local name' });
  setPageMetadata(remote, { name: 'Remote name' });
  remote.docsById['page-home']!.contentRev = 2;
  if (includeCodeDocument) {
    setCodeSource(local, 'export const value = "local";');
    setCodeSource(remote, 'export const value = "remote";');
    remote.docsById['code-main']!.contentRev = 2;
  }
  remote.workspaceRev = 3;
  remote.opSeq = 3;
  const created = createWorkspaceConflictSession({
    id: includeCodeDocument ? 'session-transaction' : 'session-document',
    createdAt: '2026-07-12T01:00:00.000Z',
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote,
  });
  if (created.ok === false) throw new Error(created.issues[0]?.message);
  const choices = Object.fromEntries(
    created.session.unresolvedConflictIds.map((conflictId) => [
      conflictId,
      'local' as const,
    ])
  );
  const resolved = resolveWorkspaceConflictSessionBatch(
    created.session,
    choices,
    '2026-07-12T01:01:00.000Z'
  );
  if (resolved.ok === false) {
    throw new Error(resolved.issues[0]?.message);
  }
  if (!resolved.session.resolvedSnapshot) {
    throw new Error('Expected a resolved snapshot.');
  }
  return { open: created.session, resolved: resolved.session };
};

const createMutation = (
  snapshot: WorkspaceSnapshot,
  acceptedMutationId: string
): DecodedWorkspaceMutation => ({
  workspaceId: snapshot.id,
  workspaceRev: snapshot.workspaceRev,
  routeRev: snapshot.routeRev,
  opSeq: snapshot.opSeq + 1,
  updatedDocuments: [],
  removedDocumentIds: [],
  acceptedMutationId,
});

const createConflictError = (
  documentId: string,
  contentRev: number,
  documentType: 'pir-page' | 'code' = 'pir-page'
) => {
  const path =
    documentType === 'code' ? '/pages/main.ts' : '/pages/home.pir.json';
  const payload = {
    error: {
      code: 'WKS-4003',
      message: 'Revision conflict.',
      retryable: true,
      details: {
        conflictType: 'DOCUMENT_CONFLICT',
        workspaceId: 'workspace-test',
        expected: { document: { id: documentId, contentRev: contentRev - 1 } },
        current: {
          workspaceRev: 4,
          routeRev: 1,
          opSeq: 4,
          document: {
            id: documentId,
            type: documentType,
            path,
            contentRev,
            metaRev: 1,
            updatedAt: '2026-07-12T01:02:00.000Z',
          },
        },
      },
    },
  } as const;
  return new ApiError(
    payload.error.message,
    409,
    payload.error.code,
    payload.error.details,
    { retryable: true, payload }
  );
};

const mockSuccessfulCommit = () =>
  vi
    .spyOn(editorApi, 'commitWorkspaceOperation')
    .mockImplementation(async (_token, snapshot, request) =>
      createMutation(snapshot, getWorkspaceOperationId(request.operation))
    );

describe('executeWorkspaceConflictResolution', () => {
  let outboxStore: WorkspaceOutboxStore;

  beforeEach(() => {
    outboxStore = createMemoryWorkspaceOutboxStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unresolved sessions without sending an operation', async () => {
    const { open } = createSession(false);
    const commit = vi.spyOn(editorApi, 'commitWorkspaceOperation');

    const result = await executeWorkspaceConflictResolution({
      session: open,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'unsupported',
      reason: 'unresolved-session',
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('returns a null operation when the reviewed result already equals remote', async () => {
    const { resolved } = createSession(false);
    const commit = vi.spyOn(editorApi, 'commitWorkspaceOperation');

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      resolvedSnapshot: resolved.remoteSnapshot,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'already-applied',
      operation: null,
      snapshot: resolved.remoteSnapshot,
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it('commits one document operation with only its content CAS', async () => {
    const { resolved } = createSession(false);
    const override = cloneWorkspace(resolved.resolvedSnapshot!);
    setPageMetadata(override, {
      name: 'Local name',
      description: 'Edited after conflict review started',
    });
    const commit = mockSuccessfulCommit();

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      resolvedSnapshot: override,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'acknowledged',
      operation: { kind: 'command' },
      rebased: false,
      serverBaseSnapshot: resolved.remoteSnapshot,
    });
    expect(commit).toHaveBeenCalledTimes(1);
    const request = commit.mock.calls[0]?.[2];
    expect(request?.expected).toEqual({
      documents: [{ id: 'page-home', contentRev: 2 }],
    });
    expect(request?.operation).toMatchObject({
      kind: 'command',
      command: {
        target: { documentId: 'page-home' },
        forwardOps: [
          {
            op: 'replace',
            path: '/metadata',
            value: {
              name: 'Local name',
              description: 'Edited after conflict review started',
            },
          },
        ],
      },
    });
  });

  it('commits a multi-document transaction as one atomic request', async () => {
    const { resolved } = createSession(true);
    const commit = mockSuccessfulCommit();

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'acknowledged',
      operation: { kind: 'transaction' },
      rebased: false,
    });
    expect(commit).toHaveBeenCalledTimes(1);
    const request = commit.mock.calls[0]?.[2];
    expect(request?.expected).toEqual({
      documents: [
        { id: 'code-main', contentRev: 2 },
        { id: 'page-home', contentRev: 2 },
      ],
    });
    expect(
      request?.operation.kind === 'transaction'
        ? request.operation.transaction.commands
        : []
    ).toHaveLength(2);
  });

  it('commits mixed route and document scopes in one atomic request', async () => {
    const { resolved } = createSession(false);
    const override = cloneWorkspace(resolved.resolvedSnapshot!);
    override.routeManifest = {
      ...override.routeManifest,
      version: '2',
    };
    const commit = mockSuccessfulCommit();

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      resolvedSnapshot: override,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'acknowledged',
      operation: { kind: 'transaction' },
    });
    const request = commit.mock.calls[0]?.[2];
    expect(request?.expected).toEqual({
      workspaceRev: 3,
      routeRev: 1,
      documents: [{ id: 'page-home', contentRev: 2 }],
    });
    expect(
      request?.operation.kind === 'transaction'
        ? request.operation.transaction.commands.map(
            (command) => command.domainHint
          )
        : []
    ).toEqual(['route', 'pir']);
  });

  it('commits workspace-tree and document metadata scopes without a typed unsupported result', async () => {
    const { resolved } = createSession(false);
    const override = cloneWorkspace(resolved.remoteSnapshot);
    override.treeById['doc-page-home'] = {
      ...override.treeById['doc-page-home']!,
      name: 'renamed-home.pir.json',
    };
    override.docsById['page-home'] = {
      ...override.docsById['page-home']!,
      path: '/pages/renamed-home.pir.json',
    };
    const commit = mockSuccessfulCommit();

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      resolvedSnapshot: override,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'acknowledged',
      operation: { kind: 'command' },
    });
    expect(commit.mock.calls[0]?.[2].expected).toEqual({
      workspaceRev: 3,
      documents: [{ id: 'page-home', metaRev: 1 }],
    });
  });

  it('rebuilds and retries the atomic operation after an independent remote edit', async () => {
    const { resolved } = createSession(true);
    const latest = cloneWorkspace(resolved.remoteSnapshot);
    setPageMetadata(latest, {
      name: 'Remote name',
      description: 'New remote description',
    });
    latest.workspaceRev = 4;
    latest.opSeq = 4;
    latest.docsById['page-home']!.contentRev = 3;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: latest,
      settings: {},
    });
    const commit = vi
      .spyOn(editorApi, 'commitWorkspaceOperation')
      .mockRejectedValueOnce(createConflictError('page-home', 3))
      .mockImplementationOnce(async (_token, snapshot, request) =>
        createMutation(snapshot, getWorkspaceOperationId(request.operation))
      );

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({ kind: 'acknowledged', rebased: true });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[1]?.[2].expected).toEqual({
      documents: [
        { id: 'code-main', contentRev: 2 },
        { id: 'page-home', contentRev: 3 },
      ],
    });
    if (result.kind !== 'acknowledged') return;
    expect(
      result.optimisticSnapshot.docsById['page-home']!.content
    ).toHaveProperty('metadata', {
      name: 'Local name',
      description: 'New remote description',
    });
  });

  it('returns a refreshed session when a newer remote edit competes with the resolution', async () => {
    const { resolved } = createSession(true);
    const latest = cloneWorkspace(resolved.remoteSnapshot);
    setPageMetadata(latest, { name: 'Newer remote name' });
    latest.workspaceRev = 4;
    latest.opSeq = 4;
    latest.docsById['page-home']!.contentRev = 3;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: latest,
      settings: {},
    });
    const commit = vi
      .spyOn(editorApi, 'commitWorkspaceOperation')
      .mockRejectedValueOnce(createConflictError('page-home', 3));

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'conflict',
      session: { status: 'open' },
    });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('rejects a commit acknowledgement for another operation', async () => {
    const { resolved } = createSession(false);
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockImplementation(
      async (_token, snapshot) => createMutation(snapshot, 'another-operation')
    );

    await expect(
      executeWorkspaceConflictResolution({
        session: resolved,
        token: 'token',
        outboxStore,
      })
    ).rejects.toThrow('unrelated workspace operation');
  });

  it('refreshes the canonical snapshot when the ACK crosses unseen commits', async () => {
    const { resolved } = createSession(false);
    const latest = cloneWorkspace(resolved.resolvedSnapshot!);
    latest.opSeq = resolved.remoteSnapshot.opSeq + 2;
    latest.workspaceRev = resolved.remoteSnapshot.workspaceRev + 1;
    const refresh = vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: latest,
      settings: {},
    });
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockImplementation(
      async (_token, snapshot, request) => ({
        ...createMutation(snapshot, getWorkspaceOperationId(request.operation)),
        opSeq: snapshot.opSeq + 2,
        workspaceRev: snapshot.workspaceRev + 1,
      })
    );

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      token: 'token',
      outboxStore,
    });

    expect(result).toMatchObject({
      kind: 'already-applied',
      operation: { kind: 'command' },
      snapshot: latest,
    });
    expect(refresh).toHaveBeenCalledWith('token', latest.id, {
      cache: 'no-store',
    });
  });

  it('does not reconstruct history after the refreshed snapshot passes the ACK', async () => {
    const { resolved } = createSession(false);
    const latest = cloneWorkspace(resolved.resolvedSnapshot!);
    latest.opSeq = resolved.remoteSnapshot.opSeq + 3;
    latest.workspaceRev = resolved.remoteSnapshot.workspaceRev + 1;
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: latest,
      settings: {},
    });
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockImplementation(
      async (_token, snapshot, request) => ({
        ...createMutation(snapshot, getWorkspaceOperationId(request.operation)),
        opSeq: snapshot.opSeq + 2,
        workspaceRev: snapshot.workspaceRev + 1,
      })
    );

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      token: 'token',
      outboxStore,
    });

    expect(result).toEqual({
      kind: 'already-applied',
      operation: null,
      snapshot: latest,
    });
  });

  it('keeps confirmed server metadata in a structural operation across an ACK gap', async () => {
    const { resolved } = createSession(false);
    const override = cloneWorkspace(resolved.remoteSnapshot);
    addCodeDocument(override);
    const latest = cloneWorkspace(override);
    latest.opSeq = resolved.remoteSnapshot.opSeq + 2;
    latest.workspaceRev = resolved.remoteSnapshot.workspaceRev + 2;
    latest.docsById['code-main']!.updatedAt = '2026-07-12T01:03:00.000Z';
    vi.spyOn(editorApi, 'getWorkspace').mockResolvedValue({
      workspace: latest,
      settings: {},
    });
    vi.spyOn(editorApi, 'commitWorkspaceOperation').mockImplementation(
      async (_token, snapshot, request) => ({
        ...createMutation(snapshot, getWorkspaceOperationId(request.operation)),
        opSeq: snapshot.opSeq + 2,
        workspaceRev: snapshot.workspaceRev + 2,
        updatedDocuments: [latest.docsById['code-main']!],
      })
    );

    const result = await executeWorkspaceConflictResolution({
      session: resolved,
      resolvedSnapshot: override,
      token: 'token',
      outboxStore,
    });

    expect(result.kind).toBe('already-applied');
    if (result.kind !== 'already-applied' || !result.operation) return;
    const createdDocument = getWorkspaceOperationCommands(result.operation)
      .flatMap((command) => command.forwardOps)
      .find((operation) => operation.path === '/docsById/code-main');
    expect(createdDocument?.value).toMatchObject({
      id: 'code-main',
      updatedAt: '2026-07-12T01:03:00.000Z',
    });
  });
});
