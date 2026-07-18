import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  decodeServerRuntimeProfile,
  SERVER_RUNTIME_PROFILE_METADATA_KEY,
} from '@prodivix/server-runtime';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
} from './workspaceCommand';
import {
  createWorkspaceOwnerGuardTransactionPlan,
  createWorkspaceServerRuntimeBindingPlan,
  projectWorkspaceServerRuntimeAuthoring,
} from './workspaceServerRuntimeAuthoring';
import type { WorkspaceSnapshot } from './types';

const profile = Object.freeze({
  schemaVersion: '1.0' as const,
  functionsByExport: Object.freeze({
    loadPrincipal: Object.freeze({
      kind: 'route-loader' as const,
      runtimeZone: 'server' as const,
      adapterId: 'core.auth.current-principal',
      effect: 'read' as const,
      auth: Object.freeze({ kind: 'authenticated' as const }),
      inputSchema: true,
      outputSchema: true,
    }),
    requireOwner: Object.freeze({
      kind: 'route-guard' as const,
      runtimeZone: 'server' as const,
      adapterId: 'core.auth.require-workspace-owner',
      effect: 'read' as const,
      auth: Object.freeze({
        kind: 'permission' as const,
        permissionId: 'workspace.owner',
      }),
      inputSchema: true,
      outputSchema: true,
    }),
  }),
});

const createWorkspace = (
  options: {
    includeCode?: boolean;
    includeAuthConfig?: boolean;
    permissionIds?: readonly string[];
    brokenBindings?: boolean;
  } = {}
): WorkspaceSnapshot => {
  const includeCode = options.includeCode !== false;
  const includeAuthConfig = options.includeAuthConfig !== false;
  return {
    id: 'server-authoring-workspace',
    workspaceRev: 3,
    routeRev: 2,
    opSeq: 5,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: [
          'page-node',
          ...(includeCode ? ['code-node'] : []),
          ...(includeAuthConfig ? ['config-dir'] : []),
        ],
      },
      'page-node': {
        id: 'page-node',
        kind: 'doc',
        name: 'home.pir.json',
        parentId: 'root',
        docId: 'page-home',
      },
      ...(includeCode
        ? {
            'code-node': {
              id: 'code-node',
              kind: 'doc' as const,
              name: 'auth.server.ts',
              parentId: 'root',
              docId: 'code-auth',
            },
          }
        : {}),
      ...(includeAuthConfig
        ? {
            'config-dir': {
              id: 'config-dir',
              kind: 'dir' as const,
              name: 'config',
              parentId: 'root',
              children: ['auth-config-node'],
            },
            'auth-config-node': {
              id: 'auth-config-node',
              kind: 'doc' as const,
              name: 'auth.json',
              parentId: 'config-dir',
              docId: 'auth-config',
            },
          }
        : {}),
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
      ...(includeCode
        ? {
            'code-auth': {
              id: 'code-auth',
              type: 'code' as const,
              path: '/auth.server.ts',
              contentRev: 2,
              metaRev: 1,
              content: {
                language: 'ts' as const,
                source:
                  'export const loadPrincipal = () => null; export const requireOwner = () => null;',
                metadata: {
                  [SERVER_RUNTIME_PROFILE_METADATA_KEY]: profile,
                },
              },
            },
          }
        : {}),
      ...(includeAuthConfig
        ? {
            'auth-config': {
              id: 'auth-config',
              type: 'project-config' as const,
              path: '/config/auth.json',
              contentRev: 1,
              metaRev: 1,
              content: {
                kind: 'config' as const,
                value: {
                  schemaVersion: '1.0',
                  providerId: 'prodivix-product-session',
                  permissionIds: options.permissionIds ?? ['workspace.owner'],
                },
              },
            },
          }
        : {}),
    },
    routeManifest: {
      version: '1',
      root: {
        id: 'route-root',
        children: [
          {
            id: 'route-home',
            index: true,
            pageDocId: 'page-home',
            ...(options.brokenBindings
              ? {
                  runtime: {
                    loaderRef: { artifactId: 'code-auth' },
                    actionRef: {
                      artifactId: 'code-auth',
                      exportName: 'loadPrincipal',
                    },
                    guardRef: {
                      artifactId: 'code-auth',
                      exportName: 'requireOwner',
                    },
                  },
                }
              : {}),
          },
        ],
      },
    },
  };
};

describe('Workspace Server Runtime authoring', () => {
  it('projects deterministic candidates, valid bindings, and exact route issues', () => {
    const projection = projectWorkspaceServerRuntimeAuthoring(
      createWorkspace({ brokenBindings: true })
    );
    expect(
      projection.candidates.map(({ key, slot }) => ({ key, slot }))
    ).toEqual([
      { key: 'code-auth#loadPrincipal', slot: 'loader' },
      { key: 'code-auth#requireOwner', slot: 'guard' },
    ]);
    expect(projection.bindings).toMatchObject([
      {
        routeNodeId: 'route-home',
        slot: 'guard',
        candidateKey: 'code-auth#requireOwner',
      },
    ]);
    expect(projection.issues.map(({ code, slot }) => ({ code, slot }))).toEqual(
      [
        { code: 'WKS-EXPORT-SERVER-EXPORT-REQUIRED', slot: 'loader' },
        { code: 'WKS-EXPORT-SERVER-SLOT-MISMATCH', slot: 'action' },
      ]
    );
  });

  it('surfaces dangling and invalid-profile bindings before compile', () => {
    const missingWorkspace = createWorkspace({ includeCode: false });
    const missingRoute = missingWorkspace.routeManifest.root.children?.[0];
    if (!missingRoute) throw new Error('Test route is missing.');
    const missingProjection = projectWorkspaceServerRuntimeAuthoring({
      ...missingWorkspace,
      routeManifest: {
        ...missingWorkspace.routeManifest,
        root: {
          ...missingWorkspace.routeManifest.root,
          children: [
            {
              ...missingRoute,
              runtime: {
                guardRef: {
                  artifactId: 'code-missing',
                  exportName: 'requireOwner',
                },
              },
            },
          ],
        },
      },
    });
    expect(missingProjection.issues).toMatchObject([
      {
        code: 'WKS-EXPORT-SERVER-DEFINITION-MISSING',
        artifactId: 'code-missing',
        exportName: 'requireOwner',
      },
    ]);

    const invalidWorkspace = createWorkspace({ brokenBindings: true });
    const code = invalidWorkspace.docsById['code-auth'];
    if (code?.type !== 'code')
      throw new Error('Test code document is missing.');
    const invalidProjection = projectWorkspaceServerRuntimeAuthoring({
      ...invalidWorkspace,
      docsById: {
        ...invalidWorkspace.docsById,
        'code-auth': {
          ...code,
          content: {
            ...(code.content as Readonly<Record<string, unknown>>),
            metadata: {
              [SERVER_RUNTIME_PROFILE_METADATA_KEY]: {
                schemaVersion: '2.0',
                functionsByExport: {},
              },
            },
          },
        },
      },
    });
    expect(
      invalidProjection.issues.map(({ code: issueCode }) => issueCode)
    ).toEqual([
      'WKS-EXPORT-SERVER-EXPORT-REQUIRED',
      'WKS-EXPORT-SERVER-PROFILE-INVALID',
      'WKS-EXPORT-SERVER-PROFILE-INVALID',
    ]);
  });

  it('requires a canonical Auth declaration and declared permission for protected bindings', () => {
    const withoutConfig = projectWorkspaceServerRuntimeAuthoring(
      createWorkspace({ brokenBindings: true, includeAuthConfig: false })
    );
    expect(
      withoutConfig.issues.map(({ code, slot }) => ({ code, slot }))
    ).toContainEqual({
      code: 'WKS-EXPORT-SERVER-AUTH-CONFIG-REQUIRED',
      slot: 'guard',
    });

    const withoutPermission = projectWorkspaceServerRuntimeAuthoring(
      createWorkspace({ brokenBindings: true, permissionIds: [] })
    );
    expect(
      withoutPermission.issues.map(({ code, slot }) => ({ code, slot }))
    ).toContainEqual({
      code: 'WKS-EXPORT-SERVER-PERMISSION-UNDECLARED',
      slot: 'guard',
    });
  });

  it('binds and unbinds an existing canonical function with slot preflight', () => {
    const workspace = createWorkspace();
    const bind = createWorkspaceServerRuntimeBindingPlan({
      workspace,
      routeNodeId: 'route-home',
      slot: 'guard',
      reference: { artifactId: 'code-auth', exportName: 'requireOwner' },
      operationId: 'bind-owner',
      issuedAt: '2026-07-18T13:00:00.000Z',
    });
    expect(bind.status).toBe('ready');
    if (bind.status !== 'ready' || bind.plan.kind !== 'command') return;
    const applied = applyWorkspaceCommand(workspace, bind.plan.command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(
      applied.snapshot.routeManifest.root.children?.[0]?.runtime?.guardRef
    ).toEqual({ artifactId: 'code-auth', exportName: 'requireOwner' });
    expect(
      createWorkspaceServerRuntimeBindingPlan({
        workspace: applied.snapshot,
        routeNodeId: 'route-home',
        slot: 'guard',
        reference: { artifactId: 'code-auth', exportName: 'requireOwner' },
        operationId: 'bind-owner-again',
        issuedAt: '2026-07-18T13:00:01.000Z',
      })
    ).toEqual({ status: 'unchanged' });
    expect(
      createWorkspaceServerRuntimeBindingPlan({
        workspace,
        routeNodeId: 'route-home',
        slot: 'action',
        reference: { artifactId: 'code-auth', exportName: 'loadPrincipal' },
        operationId: 'mismatch',
        issuedAt: '2026-07-18T13:00:02.000Z',
      })
    ).toMatchObject({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_SLOT_MISMATCH',
    });
    const unbind = createWorkspaceServerRuntimeBindingPlan({
      workspace: applied.snapshot,
      routeNodeId: 'route-home',
      slot: 'guard',
      operationId: 'unbind-owner',
      issuedAt: '2026-07-18T13:00:03.000Z',
    });
    expect(unbind.status).toBe('ready');
    if (unbind.status !== 'ready' || unbind.plan.kind !== 'command') return;
    const removed = applyWorkspaceCommand(
      applied.snapshot,
      unbind.plan.command
    );
    expect(removed.ok).toBe(true);
    if (removed.ok) {
      expect(
        removed.snapshot.routeManifest.root.children?.[0]?.runtime
      ).toBeUndefined();
    }
  });

  it.each([
    ['remote-live', 'core.auth.require-workspace-owner'],
    ['isolated-production', 'prodivix.code-export'],
  ] as const)(
    'creates and binds the %s workspace.owner guard as one transaction',
    (target, adapterId) => {
      const workspace = createWorkspace({ includeCode: false });
      const result = createWorkspaceOwnerGuardTransactionPlan({
        workspace,
        routeNodeId: 'route-home',
        target,
        documentId: `code-${target}`,
        path: `/server/${target}.guard.server.ts`,
        transactionId: `create-${target}`,
        issuedAt: '2026-07-18T13:10:00.000Z',
      });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(result.plan.transaction.commands).toHaveLength(2);
      const applied = applyWorkspaceTransaction(
        workspace,
        result.plan.transaction
      );
      expect(applied.ok).toBe(true);
      if (!applied.ok) return;
      expect(
        applied.snapshot.routeManifest.root.children?.[0]?.runtime?.guardRef
      ).toEqual(result.plan.functionRef);
      const document = applied.snapshot.docsById[result.plan.documentId];
      expect(document).toMatchObject({
        type: 'code',
        path: `/server/${target}.guard.server.ts`,
      });
      if (document?.type !== 'code' || !document.content) return;
      const content = document.content as Readonly<Record<string, unknown>>;
      const decoded = decodeServerRuntimeProfile(
        content.metadata as Readonly<Record<string, unknown>>,
        'ts'
      );
      expect(decoded.status).toBe('valid');
      if (decoded.status !== 'valid') return;
      expect(
        decoded.profile.functionsByExport.requireWorkspaceOwner
      ).toMatchObject({
        kind: 'route-guard',
        adapterId,
        effect: 'read',
        auth: { kind: 'permission', permissionId: 'workspace.owner' },
      });
      expect(content.source).not.toMatch(/token|cookie|secret|sessionId/u);
    }
  );
});
