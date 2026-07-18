import { createEmptyPirDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '@prodivix/workspace';

export const createServerRuntimeTestWorkspace = (
  kind: 'route-loader' | 'route-action'
): WorkspaceSnapshot => {
  const action = kind === 'route-action';
  const exportName = action ? 'updateProfile' : 'loadPrincipal';
  return {
    id: `server-runtime-${kind}-workspace`,
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
        children: ['page-node', 'server-node', 'config-dir'],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      'server-node': {
        id: 'server-node',
        kind: 'doc',
        name: 'auth.server.ts',
        parentId: 'root',
        docId: 'code-auth',
      },
      'config-dir': {
        id: 'config-dir',
        kind: 'dir',
        name: 'config',
        parentId: 'root',
        children: ['auth-config-node'],
      },
      'auth-config-node': {
        id: 'auth-config-node',
        kind: 'doc',
        name: 'auth.json',
        parentId: 'config-dir',
        docId: 'auth-config',
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
      'code-auth': {
        id: 'code-auth',
        type: 'code',
        path: '/auth.server.ts',
        contentRev: 1,
        metaRev: 1,
        content: {
          language: 'ts',
          source: `export const ${exportName} = () => undefined;`,
          metadata: {
            'prodivix.serverRuntime': {
              schemaVersion: '1.0',
              functionsByExport: {
                [exportName]: {
                  kind,
                  runtimeZone: 'server',
                  adapterId: action
                    ? 'test.profile.update'
                    : 'core.auth.current-principal',
                  effect: action ? 'mutation' : 'read',
                  auth: { kind: 'authenticated' },
                  inputSchema: action
                    ? true
                    : {
                        type: 'object',
                        additionalProperties: false,
                        required: ['routeId'],
                        properties: { routeId: { type: 'string' } },
                      },
                  outputSchema: action
                    ? true
                    : {
                        type: 'object',
                        additionalProperties: false,
                        required: ['providerId', 'principalId'],
                        properties: {
                          providerId: {
                            const: 'prodivix-product-session',
                          },
                          principalId: { type: 'string' },
                        },
                      },
                  ...(action
                    ? { idempotency: { kind: 'invocation-key' } }
                    : {}),
                },
              },
            },
          },
        },
      },
      'auth-config': {
        id: 'auth-config',
        type: 'project-config',
        path: '/config/auth.json',
        contentRev: 1,
        metaRev: 1,
        content: {
          kind: 'config',
          value: {
            schemaVersion: '1.0',
            providerId: 'prodivix-product-session',
            permissionIds: [],
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
              [action ? 'actionRef' : 'loaderRef']: {
                artifactId: 'code-auth',
                exportName,
              },
            },
          },
        ],
      },
    },
  };
};
