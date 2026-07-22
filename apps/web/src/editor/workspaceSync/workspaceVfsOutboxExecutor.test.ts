import { createEmptyPirDocument } from '@prodivix/pir';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import { createMemoryWorkspaceOutboxStore } from '@prodivix/workspace-sync';
import { describe, expect, it, vi } from 'vitest';
import { enqueueWorkspaceOperationOutboxAndDispatch } from './workspaceVfsOutboxExecutor';

const editorState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/editor/store/useEditorStore', () => ({
  useEditorStore: {
    getState: () => editorState.current,
  },
}));

vi.mock('./workspaceOutboxSignals', () => ({
  notifyWorkspaceOutboxChanged: vi.fn(),
}));

const workspace: WorkspaceSnapshot = {
  id: 'workspace-1',
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
      children: ['page-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page',
    },
  },
  docsById: {
    page: {
      id: 'page',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: { version: '1', root: { id: 'root', children: [] } },
  activeDocumentId: 'page',
  activeRouteNodeId: 'root',
};

const command: WorkspaceCommandEnvelope = {
  id: 'operation-1',
  namespace: 'core.pir',
  type: 'metadata.update',
  version: '1.0',
  issuedAt: new Date(0).toISOString(),
  target: { workspaceId: workspace.id, documentId: 'page' },
  domainHint: 'pir',
  forwardOps: [{ op: 'add', path: '/metadata', value: { name: 'Updated' } }],
  reverseOps: [{ op: 'remove', path: '/metadata' }],
};

describe('Workspace VFS Outbox executor', () => {
  it('removes the durable entry when optimistic application throws', async () => {
    const outboxStore = createMemoryWorkspaceOutboxStore();
    editorState.current = {
      workspace,
      dispatchWorkspaceCommand: vi.fn(),
      dispatchWorkspaceTransaction: vi.fn(),
    };

    await expect(
      enqueueWorkspaceOperationOutboxAndDispatch({
        operation: { kind: 'command', command },
        outboxStore,
        workspace,
        applyOptimistically: () => {
          throw new Error('local reducer failed');
        },
      })
    ).resolves.toEqual({
      status: 'rejected',
      message: 'local reducer failed',
    });
    await expect(outboxStore.list(workspace.id)).resolves.toEqual([]);
  });
});
