import { describe, expect, it } from 'vitest';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import {
  createWorkspaceConflictSession,
  resolveWorkspaceConflictSessionBatch,
  type WorkspaceConflictSession,
} from '@prodivix/workspace-sync';
import { prepareWorkspaceConflictResolution } from '@/editor/workspaceSync/workspaceConflictResolutionPreparation';
import { createEditorWorkspace } from '@/test-utils/editorStore';

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

const pageMetadata = (workspace: WorkspaceSnapshot) => {
  const document = workspace.docsById['page-home'];
  if (!document || typeof document.content !== 'object' || !document.content) {
    throw new Error('Expected a page document.');
  }
  return (document.content as { metadata?: Record<string, unknown> }).metadata;
};

const createNameConflictSession = (): WorkspaceConflictSession => {
  const base = createEditorWorkspace();
  setPageMetadata(base, { name: 'Base name' });
  const local = cloneWorkspace(base);
  const remote = cloneWorkspace(base);
  setPageMetadata(local, { name: 'Local name' });
  setPageMetadata(remote, { name: 'Remote name' });
  remote.workspaceRev = 2;
  remote.opSeq = 2;
  remote.docsById['page-home']!.contentRev = 2;

  const created = createWorkspaceConflictSession({
    id: 'review-session',
    createdAt: '2026-07-12T02:00:00.000Z',
    baseSnapshot: base,
    localSnapshot: local,
    remoteSnapshot: remote,
  });
  if (created.ok === false) throw new Error(created.issues[0]?.message);
  return created.session;
};

const resolveAllRemote = (
  session: WorkspaceConflictSession
): WorkspaceConflictSession => {
  const choices = Object.fromEntries(
    session.unresolvedConflictIds.map((conflictId) => [
      conflictId,
      'remote' as const,
    ])
  );
  const resolved = resolveWorkspaceConflictSessionBatch(
    session,
    choices,
    '2026-07-12T02:01:00.000Z'
  );
  if (resolved.ok === false) throw new Error(resolved.issues[0]?.message);
  return resolved.session;
};

describe('prepareWorkspaceConflictResolution', () => {
  it('preserves non-conflicting edits made while the conflict is reviewed', () => {
    const session = resolveAllRemote(createNameConflictSession());
    const currentSnapshot = cloneWorkspace(session.localSnapshot);
    setPageMetadata(currentSnapshot, {
      name: 'Local name',
      description: 'Added while reviewing',
    });

    const result = prepareWorkspaceConflictResolution({
      currentSnapshot,
      preparedAt: '2026-07-12T02:02:00.000Z',
      preparedSessionId: 'prepared-session',
      session,
    });

    expect(result).toMatchObject({ kind: 'ready' });
    if (result.kind !== 'ready') return;
    expect(pageMetadata(result.resolvedSnapshot)).toEqual({
      name: 'Remote name',
      description: 'Added while reviewing',
    });
    expect(result.resolvedSnapshot.workspaceRev).toBe(
      session.remoteSnapshot.workspaceRev
    );
  });

  it('creates a new session when a remote choice overlaps a later local edit', () => {
    const session = resolveAllRemote(createNameConflictSession());
    const currentSnapshot = cloneWorkspace(session.localSnapshot);
    setPageMetadata(currentSnapshot, { name: 'Edited while reviewing' });

    const result = prepareWorkspaceConflictResolution({
      currentSnapshot,
      preparedAt: '2026-07-12T02:02:00.000Z',
      preparedSessionId: 'prepared-session',
      session,
    });

    expect(result).toMatchObject({
      kind: 'conflict',
      session: {
        id: 'prepared-session',
        createdAt: '2026-07-12T02:02:00.000Z',
        status: 'open',
        unresolvedConflictIds: [expect.stringContaining('/metadata/name')],
      },
    });
    if (result.kind !== 'conflict') return;
    expect(pageMetadata(result.session.baseSnapshot)).toEqual({
      name: 'Local name',
    });
    expect(pageMetadata(result.session.localSnapshot)).toEqual({
      name: 'Edited while reviewing',
    });
    expect(pageMetadata(result.session.remoteSnapshot)).toEqual({
      name: 'Remote name',
    });
  });

  it('rejects an unresolved session', () => {
    const session = createNameConflictSession();

    const result = prepareWorkspaceConflictResolution({
      currentSnapshot: cloneWorkspace(session.localSnapshot),
      preparedAt: '2026-07-12T02:02:00.000Z',
      preparedSessionId: 'prepared-session',
      session,
    });

    expect(result).toEqual({
      kind: 'invalid',
      issues: [
        {
          code: 'WKS_SYNC_CONFLICT_SESSION_INVALID',
          path: '/status',
          message: 'Every conflict must be resolved before preparing a save.',
        },
      ],
    });
  });
});
