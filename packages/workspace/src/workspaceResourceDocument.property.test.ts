import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyWorkspaceCommand } from './workspaceCommand';
import { createWorkspaceProjectConfigValueUpdateCommand } from './workspaceResourceDocument';
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
      children: ['page-node', 'config-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'config-node': {
      id: 'config-node',
      kind: 'doc',
      name: 'resources.json',
      parentId: 'root',
      docId: 'config-resources',
    },
  },
  docsById: {
    'page-home': {
      id: 'page-home',
      type: 'pir-page',
      path: '/home.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        version: '1.3',
        ui: {
          graph: {
            version: 1,
            rootId: 'root',
            nodesById: { root: { id: 'root', type: 'container' } },
            childIdsById: { root: [] },
          },
        },
      },
    },
    'config-resources': {
      id: 'config-resources',
      type: 'project-config',
      path: '/resources.json',
      contentRev: 1,
      metaRev: 1,
      content: { kind: 'config', value: { enabled: false } },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-home' },
  },
  activeDocumentId: 'page-home',
});

describe('workspace resource document properties', () => {
  it('updates arbitrary JSON config values with an exact inverse', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (generatedValue) => {
        const value = JSON.parse(JSON.stringify(generatedValue)) as unknown;
        const workspace = createWorkspace();
        const document = workspace.docsById['config-resources'];
        const command = createWorkspaceProjectConfigValueUpdateCommand({
          commandId: 'update-resources',
          issuedAt: '2026-07-13T00:00:00.000Z',
          workspaceId: workspace.id,
          document,
          value,
        });
        expect(command).not.toBeNull();
        if (!command) return;

        const applied = applyWorkspaceCommand(workspace, command);
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.snapshot.docsById['config-resources'].content).toEqual({
          kind: 'config',
          value,
        });

        const reversed = applyWorkspaceCommand(applied.snapshot, {
          ...command,
          id: 'reverse-resources',
          forwardOps: command.reverseOps,
          reverseOps: command.forwardOps,
        });
        expect(reversed.ok).toBe(true);
        if (!reversed.ok) return;
        expect(reversed.snapshot).toEqual(workspace);
      }),
      { numRuns: 300, seed: 0x13_07_2026 }
    );
  });
});
