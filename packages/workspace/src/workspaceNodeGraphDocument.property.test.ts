import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  createWorkspaceNodeGraphDocumentUpdateCommand,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
} from './index';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-nodegraph',
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 1,
  treeRootId: 'root',
  activeDocumentId: 'graph-main',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'graph-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'graph-node': {
      id: 'graph-node',
      kind: 'doc',
      name: 'main.pir-graph.json',
      parentId: 'root',
      docId: 'graph-main',
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
    'graph-main': {
      id: 'graph-main',
      type: 'pir-graph',
      path: '/graphs/main.pir-graph.json',
      contentRev: 1,
      metaRev: 1,
      content: { version: 1, nodes: [], edges: [] },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

describe('standalone Workspace NodeGraph document properties', () => {
  it('builds reversible canonical document updates', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/),
        fc.jsonValue({ maxDepth: 3 }),
        (nodeId, value) => {
          const workspace = createWorkspace();
          const command = createWorkspaceNodeGraphDocumentUpdateCommand({
            workspace,
            documentId: 'graph-main',
            after: {
              version: 1,
              nodes: [{ id: nodeId, data: { value } }],
              edges: [],
            },
            commandId: 'nodegraph-update',
            issuedAt: '2026-07-14T00:00:00.000Z',
          });
          expect(command).not.toBeNull();
          if (!command) return;

          const applied = applyWorkspaceCommand(workspace, command);
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          const reversed = applyWorkspaceCommand(applied.snapshot, {
            ...command,
            id: 'nodegraph-reverse',
            forwardOps: command.reverseOps,
            reverseOps: command.forwardOps,
          } satisfies WorkspaceCommandEnvelope);
          expect(reversed.ok).toBe(true);
          if (!reversed.ok) return;
          expect(reversed.snapshot.docsById['graph-main'].content).toEqual(
            workspace.docsById['graph-main'].content
          );
        }
      ),
      { numRuns: 24 }
    );
  });
});
