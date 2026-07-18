import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import { buildWorkspaceAuthServerRuntimeModel } from './workspaceAuthServerRuntime';

const workspace = (
  permissionIds: readonly string[] = []
): WorkspaceSnapshot => ({
  id: 'auth-resource-workspace',
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
      children: ['page-node', 'code-node', 'config-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: 'page-home',
    },
    'code-node': {
      id: 'code-node',
      kind: 'doc',
      name: 'owner.server.ts',
      parentId: 'root',
      docId: 'code-owner',
    },
    'config-node': {
      id: 'config-node',
      kind: 'doc',
      name: 'auth.json',
      parentId: 'root',
      docId: 'config-auth',
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
    'code-owner': {
      id: 'code-owner',
      type: 'code',
      path: '/owner.server.ts',
      contentRev: 1,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const requireOwner = () => null;',
        metadata: {
          'prodivix.serverRuntime': {
            schemaVersion: '1.0',
            functionsByExport: {
              requireOwner: {
                kind: 'route-guard',
                runtimeZone: 'server',
                adapterId: 'core.auth.require-workspace-owner',
                effect: 'read',
                auth: {
                  kind: 'permission',
                  permissionId: 'workspace.owner',
                },
                inputSchema: true,
                outputSchema: true,
              },
            },
          },
        },
      },
    },
    'config-auth': {
      id: 'config-auth',
      type: 'project-config',
      path: '/config/auth.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        kind: 'config',
        value: {
          schemaVersion: '1.0',
          providerId: 'prodivix-product-session',
          permissionIds,
        },
      },
    },
  },
  routeManifest: {
    version: '1',
    root: {
      id: 'root',
      children: [
        {
          id: 'route-home',
          index: true,
          pageDocId: 'page-home',
          runtime: {
            guardRef: {
              artifactId: 'code-owner',
              exportName: 'requireOwner',
            },
          },
        },
      ],
    },
  },
});

describe('Workspace Auth/Server Runtime resource model', () => {
  it('projects the provider, required permissions, bound functions, and fail-closed issue', () => {
    const missing = buildWorkspaceAuthServerRuntimeModel(workspace());
    expect(missing.configuration).toMatchObject({
      status: 'ready',
      providerId: 'prodivix-product-session',
      permissionIds: [],
    });
    expect(missing.requiredPermissionIds).toEqual(['workspace.owner']);
    expect(missing.bindings).toMatchObject([
      {
        routeNodeId: 'route-home',
        slot: 'guard',
        documentPath: '/owner.server.ts',
        exportName: 'requireOwner',
        permissionId: 'workspace.owner',
        issueCodes: ['WKS-EXPORT-SERVER-PERMISSION-UNDECLARED'],
      },
    ]);
    expect(missing.issueCount).toBe(1);

    const declared = buildWorkspaceAuthServerRuntimeModel(
      workspace(['workspace.owner'])
    );
    expect(declared.bindings[0]?.issueCodes).toEqual([]);
    expect(declared.issueCount).toBe(0);
  });
});
