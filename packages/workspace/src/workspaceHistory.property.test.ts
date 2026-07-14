import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  type WorkspaceCommandEnvelope,
} from './workspaceCommand';
import {
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
} from './workspaceHistory';
import { createWorkspaceCommandOperation } from './workspaceOperation';
import type { WorkspaceHistoryScope } from './workspaceOperation';
import type { WorkspaceSnapshot } from './types';

const createWorkspace = (): WorkspaceSnapshot => ({
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
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
});

const scope: WorkspaceHistoryScope = {
  kind: 'document',
  workspaceId: 'workspace-1',
  documentId: 'page-home',
  domain: 'pir',
};

describe('Workspace History properties', () => {
  it('round-trips canonical PIR commands through undo and redo', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 64 }), (title) => {
        const workspace = createWorkspace();
        const command: WorkspaceCommandEnvelope = {
          id: 'set-title',
          namespace: 'core.pir',
          type: 'node.props.update',
          version: '1.0',
          issuedAt: '2026-07-14T00:00:00.000Z',
          target: {
            workspaceId: workspace.id,
            documentId: 'page-home',
          },
          domainHint: 'pir',
          forwardOps: [
            {
              op: 'add',
              path: '/ui/graph/nodesById/root/props',
              value: { title: { kind: 'literal', value: title } },
            },
          ],
          reverseOps: [
            { op: 'remove', path: '/ui/graph/nodesById/root/props' },
          ],
        };

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        const history = recordWorkspaceOperation(
          createWorkspaceHistoryState(),
          createWorkspaceCommandOperation(command)
        );

        const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
        expect(undone.ok).toBe(true);
        if (!undone.ok) return;
        expect(undone.snapshot.docsById['page-home']?.content).toEqual(
          workspace.docsById['page-home']?.content
        );

        const redone = redoWorkspaceHistory(
          undone.snapshot,
          undone.history,
          scope
        );
        expect(redone.ok).toBe(true);
        if (!redone.ok) return;
        expect(redone.snapshot.docsById['page-home']?.content).toHaveProperty(
          'ui.graph.nodesById.root.props.title',
          { kind: 'literal', value: title }
        );
      }),
      { numRuns: 32, seed: 0x14_07_2026 }
    );
  });
});
