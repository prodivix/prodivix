import { describe, expect, it } from 'vitest';
import {
  claimWorkspaceOutboxEntry,
  createMemoryWorkspaceOutboxStore,
  createWorkspaceOutboxEntry,
  failWorkspaceOutboxEntry,
} from '@prodivix/workspace-sync';
import { createEditorWorkspace } from '@/test-utils/editorStore';
import { requeueFailedWorkspaceOutboxOperation } from '../workspaceOutboxExecutor';

describe('workspace outbox manual retry', () => {
  it('requeues the exact failed operation for the mounted dispatcher', async () => {
    const workspace = createEditorWorkspace();
    const created = createWorkspaceOutboxEntry({
      baseSnapshot: workspace,
      operation: {
        kind: 'command',
        command: {
          id: 'operation-migrate-pir',
          namespace: 'core.pir',
          type: 'document.update',
          version: '1.0',
          issuedAt: '2026-07-20T00:00:00.000Z',
          forwardOps: [
            { op: 'add', path: '/metadata', value: { name: 'Migrated' } },
          ],
          reverseOps: [{ op: 'remove', path: '/metadata' }],
          target: {
            workspaceId: workspace.id,
            documentId: 'page-home',
          },
          domainHint: 'pir',
        },
      },
      now: 1,
    });
    if (created.ok === false) throw new Error(created.issues[0]?.message);
    const claimed = claimWorkspaceOutboxEntry(created.entry, {
      leaseOwnerId: 'tab-a',
      now: 2,
      leaseDurationMs: 30_000,
    });
    if (!claimed) throw new Error('Fixture operation was not claimable.');
    const failed = failWorkspaceOutboxEntry(claimed, {
      leaseOwnerId: 'tab-a',
      now: 3,
      failure: {
        code: 'WKS-5002',
        message: 'PIR wire requires migration.',
        retryable: false,
        status: 422,
      },
    });
    if (!failed) throw new Error('Fixture operation did not fail.');
    const store = createMemoryWorkspaceOutboxStore([failed]);

    await expect(
      requeueFailedWorkspaceOutboxOperation({
        workspaceId: workspace.id,
        entryId: failed.id,
        store,
      })
    ).resolves.toBe('queued');
    expect(await store.get(failed.id)).toMatchObject({
      id: failed.id,
      request: failed.request,
      operation: failed.operation,
      state: { kind: 'queued' },
    });
  });
});
