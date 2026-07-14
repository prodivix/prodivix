import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
} from '@prodivix/workspace';
import {
  autoRebaseWorkspaceSnapshots,
  createWorkspaceConflictResolutionOperation,
  createWorkspaceConflictSession,
  createWorkspaceResolutionOperation,
  diffWorkspaceSnapshots,
  planWorkspaceOperationCommit,
  resolveWorkspaceConflictSession,
  resolveWorkspaceConflictSessionBatch,
} from '..';
import {
  cloneWorkspace,
  createNodeGraphContent,
  createPirContent,
  createWorkspace,
} from './testWorkspace';

const pirContent = (workspace: ReturnType<typeof createWorkspace>) =>
  workspace.docsById['document-1']!.content as ReturnType<
    typeof createPirContent
  >;

const node = (
  workspace: ReturnType<typeof createWorkspace>,
  nodeId: 'node-a' | 'node-b'
) =>
  (
    workspace.docsById['document-1']!.content as ReturnType<
      typeof createNodeGraphContent
    >
  ).nodes.find((candidate) => candidate.id === nodeId)!;

const graphContent = (workspace: ReturnType<typeof createWorkspace>) =>
  workspace.docsById['document-1']!.content as ReturnType<
    typeof createNodeGraphContent
  >;

const createNodeGraphWorkspace = () =>
  createWorkspace(createNodeGraphContent(), 'pir-graph');

describe('workspace three-way recovery', () => {
  it('auto-rebases independent stable-id graph changes onto remote revisions', () => {
    const base = createNodeGraphWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    node(local, 'node-a').data.value = 2;
    node(remote, 'node-b').data.value = 3;
    remote.workspaceRev = 7;
    remote.opSeq = 15;
    remote.docsById['document-1']!.contentRev = 4;

    const result = autoRebaseWorkspaceSnapshots(base, local, remote);

    expect(result).toMatchObject({ ok: true, status: 'rebased' });
    if (!result.ok) return;
    expect(node(result.snapshot, 'node-a').data.value).toBe(2);
    expect(node(result.snapshot, 'node-b').data.value).toBe(3);
    expect(result.snapshot.workspaceRev).toBe(7);
    expect(result.snapshot.docsById['document-1']!.contentRev).toBe(4);
  });

  it('merges independent fields when both sides add the same object', () => {
    const base = createWorkspace();
    const baseContent = pirContent(base) as Record<string, unknown>;
    delete baseContent.metadata;
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    (pirContent(local) as Record<string, unknown>).metadata = {
      name: 'Local',
    };
    (pirContent(remote) as Record<string, unknown>).metadata = {
      description: 'Remote',
    };

    const result = autoRebaseWorkspaceSnapshots(base, local, remote);

    expect(result).toMatchObject({ ok: true, status: 'rebased' });
    if (!result.ok) return;
    expect(
      (pirContent(result.snapshot) as unknown as Record<string, unknown>)
        .metadata
    ).toEqual({
      name: 'Local',
      description: 'Remote',
    });
  });

  it('merges non-overlapping code hunks and conflicts on the same line', () => {
    const base = createWorkspace(
      { language: 'ts', source: 'const a = 1;\nconst b = 1;\nconst c = 1;\n' },
      'code'
    );
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    (
      local.docsById['document-1']!.content as {
        language: string;
        source: string;
      }
    ).source = 'const a = 2;\nconst b = 1;\nconst c = 1;\n';
    (
      remote.docsById['document-1']!.content as {
        language: string;
        source: string;
      }
    ).source = 'const a = 1;\nconst b = 1;\nconst c = 3;\n';

    const merged = autoRebaseWorkspaceSnapshots(base, local, remote);
    expect(merged).toMatchObject({ ok: true, status: 'rebased' });
    if (!merged.ok) return;
    expect(
      (
        merged.snapshot.docsById['document-1']!.content as {
          source: string;
        }
      ).source
    ).toBe('const a = 2;\nconst b = 1;\nconst c = 3;\n');

    const conflictingRemote = cloneWorkspace(base);
    (
      conflictingRemote.docsById['document-1']!.content as {
        source: string;
      }
    ).source = 'const a = 9;\nconst b = 1;\nconst c = 1;\n';
    expect(
      autoRebaseWorkspaceSnapshots(base, local, conflictingRemote)
    ).toMatchObject({
      ok: false,
      status: 'conflicted',
      analysis: {
        conflicts: [expect.objectContaining({ kind: 'text' })],
      },
    });
  });

  it('detects delete-versus-edge dependency as a structural conflict', () => {
    const base = createNodeGraphWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    graphContent(local).nodes = graphContent(local).nodes.filter(
      (candidate) => candidate.id !== 'node-a'
    );
    graphContent(remote).edges[0]!.sourceHandle = 'remote-edge';

    const result = autoRebaseWorkspaceSnapshots(base, local, remote);

    expect(result).toMatchObject({
      ok: false,
      status: 'conflicted',
      analysis: {
        conflicts: [expect.objectContaining({ kind: 'structural' })],
      },
    });
  });

  it('requires an explicit choice and builds fresh commands from remote to resolved', () => {
    const base = createNodeGraphWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    node(local, 'node-a').data.label = 'LOCAL';
    node(remote, 'node-a').data.label = 'REMOTE';
    remote.workspaceRev = 9;
    remote.opSeq = 20;
    remote.docsById['document-1']!.contentRev = 5;

    const created = createWorkspaceConflictSession({
      id: 'session-1',
      createdAt: '2026-07-12T01:00:00.000Z',
      baseSnapshot: base,
      localSnapshot: local,
      remoteSnapshot: remote,
      sourceOperation: {
        kind: 'command',
        command: {
          id: 'original-operation',
          namespace: 'core.nodegraph',
          type: 'node.update',
          version: '1.0',
          issuedAt: '2026-07-12T00:59:00.000Z',
          target: {
            workspaceId: 'workspace-1',
            documentId: 'document-1',
          },
          domainHint: 'nodegraph',
          forwardOps: [],
          reverseOps: [],
        },
      },
    });
    expect(created).toMatchObject({
      ok: true,
      session: { status: 'open', unresolvedConflictIds: [expect.any(String)] },
    });
    if (!created.ok) return;
    expect(
      createWorkspaceConflictResolutionOperation({
        session: created.session,
        operationId: 'resolution-early',
        issuedAt: '2026-07-12T01:00:30.000Z',
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_CONFLICTS_UNRESOLVED' }],
    });
    const conflictId = created.session.unresolvedConflictIds[0]!;
    const resolved = resolveWorkspaceConflictSession(
      created.session,
      conflictId,
      'local',
      '2026-07-12T01:01:00.000Z'
    );
    expect(resolved).toMatchObject({
      ok: true,
      session: { status: 'resolved', unresolvedConflictIds: [] },
    });
    if (!resolved.ok || !resolved.session.resolvedSnapshot) return;
    expect(node(resolved.session.resolvedSnapshot, 'node-a').data.label).toBe(
      'LOCAL'
    );
    expect(resolved.session.resolvedSnapshot.workspaceRev).toBe(9);

    const built = createWorkspaceConflictResolutionOperation({
      session: resolved.session,
      operationId: 'resolution-1',
      issuedAt: '2026-07-12T01:01:00.000Z',
    });
    expect(built).toMatchObject({
      ok: true,
      operation: { sourceOperationIds: ['original-operation'] },
    });
    if (!built.ok || !built.operation) return;
    const applied =
      built.operation.kind === 'command'
        ? applyWorkspaceCommand(remote, built.operation.command)
        : applyWorkspaceTransaction(remote, built.operation.transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const remaining = diffWorkspaceSnapshots(
      applied.snapshot,
      resolved.session.resolvedSnapshot
    );
    expect(remaining).toMatchObject({
      ok: true,
      changeSet: { changes: [] },
    });
  });

  it('supports mixed explicit local and remote choices in one session', () => {
    const base = createNodeGraphWorkspace();
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    node(local, 'node-a').data.label = 'LOCAL A';
    node(local, 'node-b').data.label = 'LOCAL B';
    node(remote, 'node-a').data.label = 'REMOTE A';
    node(remote, 'node-b').data.label = 'REMOTE B';
    const created = createWorkspaceConflictSession({
      id: 'session-mixed',
      createdAt: '2026-07-12T02:00:00.000Z',
      baseSnapshot: base,
      localSnapshot: local,
      remoteSnapshot: remote,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const choices = Object.fromEntries(
      created.session.analysis.conflicts.map((conflict) => [
        conflict.id,
        conflict.semantic.kind === 'graph-node' &&
        conflict.semantic.nodeId === 'node-a'
          ? 'local'
          : 'remote',
      ])
    ) as Record<string, 'local' | 'remote'>;

    const resolved = resolveWorkspaceConflictSessionBatch(
      created.session,
      choices,
      '2026-07-12T02:01:00.000Z'
    );

    expect(resolved).toMatchObject({
      ok: true,
      session: { status: 'resolved' },
    });
    if (!resolved.ok || !resolved.session.resolvedSnapshot) return;
    expect(node(resolved.session.resolvedSnapshot, 'node-a').data.label).toBe(
      'LOCAL A'
    );
    expect(node(resolved.session.resolvedSnapshot, 'node-b').data.label).toBe(
      'REMOTE B'
    );
  });

  it('rebirths a remotely deleted document when delete-versus-modify chooses local', () => {
    const base = createNodeGraphWorkspace();
    base.docsById['document-1']!.contentRev = 7;
    base.docsById['document-1']!.metaRev = 3;
    const local = cloneWorkspace(base);
    const remote = cloneWorkspace(base);
    node(local, 'node-a').data.label = 'LOCAL SURVIVES';
    delete remote.docsById['document-1'];
    delete remote.treeById['document-node'];
    remote.treeById.root!.children = ['remote-only'];
    remote.treeById['remote-only'] = {
      id: 'remote-only',
      kind: 'dir',
      name: 'remote-only',
      parentId: 'root',
      children: [],
    };
    delete remote.activeDocumentId;

    const created = createWorkspaceConflictSession({
      id: 'session-delete-versus-modify',
      createdAt: '2026-07-12T02:30:00.000Z',
      baseSnapshot: base,
      localSnapshot: local,
      remoteSnapshot: remote,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const resolved = resolveWorkspaceConflictSessionBatch(
      created.session,
      Object.fromEntries(
        created.session.unresolvedConflictIds.map((conflictId) => [
          conflictId,
          'local',
        ])
      ),
      '2026-07-12T02:31:00.000Z'
    );
    if (!resolved.ok) {
      throw new Error(JSON.stringify(resolved.issues));
    }
    expect(resolved).toMatchObject({
      ok: true,
      session: { status: 'resolved' },
    });
    if (!resolved.session.resolvedSnapshot) return;
    expect(resolved.session.resolvedSnapshot.treeById['remote-only']).toEqual(
      remote.treeById['remote-only']
    );
    expect(resolved.session.resolvedSnapshot.treeById.root!.children).toContain(
      'remote-only'
    );

    const built = createWorkspaceConflictResolutionOperation({
      session: resolved.session,
      operationId: 'resolution-recreate-document',
      issuedAt: '2026-07-12T02:32:00.000Z',
    });
    expect(built.ok).toBe(true);
    if (!built.ok || !built.operation) return;
    const workspaceCommand =
      built.operation.kind === 'command'
        ? built.operation.command
        : built.operation.transaction.commands.find(
            ({ domainHint }) => domainHint === 'workspace'
          );
    const documentAdd = workspaceCommand?.forwardOps.find(
      ({ path }) => path === '/docsById/document-1'
    );
    expect(documentAdd).toMatchObject({
      op: 'add',
      value: { id: 'document-1', contentRev: 1, metaRev: 1 },
    });
    expect(documentAdd?.value).not.toHaveProperty('updatedAt');
    expect(planWorkspaceOperationCommit(remote, built.operation)).toMatchObject(
      {
        ok: true,
        request: {
          expected: {
            workspaceRev: remote.workspaceRev,
            documents: [{ id: 'document-1', contentRev: null, metaRev: null }],
          },
        },
      }
    );
  });

  it('emits one atomic transaction for VFS metadata and document content', () => {
    const remote = createNodeGraphWorkspace();
    const resolved = cloneWorkspace(remote);
    resolved.treeById['document-node']!.name = 'renamed.pir.json';
    resolved.docsById['document-1']!.path = '/renamed.pir.json';
    node(resolved, 'node-a').data.label = 'Resolved';

    const built = createWorkspaceResolutionOperation({
      remoteSnapshot: remote,
      resolvedSnapshot: resolved,
      operationId: 'resolution-transaction',
      issuedAt: '2026-07-12T03:00:00.000Z',
    });

    expect(built).toMatchObject({
      ok: true,
      operation: {
        kind: 'transaction',
        transaction: { id: 'resolution-transaction', commands: [{}, {}] },
      },
    });
    if (!built.ok || !built.operation || built.operation.kind !== 'transaction')
      return;
    const applied = applyWorkspaceTransaction(
      remote,
      built.operation.transaction
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById['document-1']!.path).toBe(
      '/renamed.pir.json'
    );
    expect(node(applied.snapshot, 'node-a').data.label).toBe('Resolved');
  });
});
