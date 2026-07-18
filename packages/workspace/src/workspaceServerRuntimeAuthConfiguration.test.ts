import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import { PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID } from '@prodivix/server-runtime';
import { applyWorkspaceCommand } from './workspaceCommand';
import {
  createWorkspaceServerRuntimeAuthConfigurationPlan,
  readWorkspaceServerRuntimeAuthConfiguration,
} from './workspaceServerRuntimeAuthConfiguration';
import type { WorkspaceSnapshot } from './types';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'auth-config-workspace',
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

describe('Workspace Server Runtime Auth configuration', () => {
  it('creates, reads, updates, and reverses the canonical project-config', () => {
    const workspace = createWorkspace();
    expect(readWorkspaceServerRuntimeAuthConfiguration(workspace)).toEqual({
      status: 'ready',
      document: null,
      configuration: null,
    });
    const create = createWorkspaceServerRuntimeAuthConfigurationPlan({
      workspace,
      providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
      permissionIds: ['workspace.owner'],
      documentId: 'config-auth',
      operationId: 'enable-auth',
      issuedAt: '2026-07-18T15:00:00.000Z',
    });
    expect(create.status).toBe('ready');
    if (create.status !== 'ready' || create.operation.kind !== 'command')
      return;
    const created = applyWorkspaceCommand(workspace, create.operation.command);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(
      readWorkspaceServerRuntimeAuthConfiguration(created.snapshot)
    ).toMatchObject({
      status: 'ready',
      document: { id: 'config-auth', path: '/config/auth.json' },
      configuration: {
        providerId: 'prodivix-product-session',
        permissionIds: ['workspace.owner'],
      },
    });
    expect(
      createWorkspaceServerRuntimeAuthConfigurationPlan({
        workspace: created.snapshot,
        providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
        permissionIds: ['workspace.owner'],
        documentId: 'ignored',
        operationId: 'same-auth',
        issuedAt: '2026-07-18T15:00:01.000Z',
      })
    ).toEqual({ status: 'unchanged' });
    const update = createWorkspaceServerRuntimeAuthConfigurationPlan({
      workspace: created.snapshot,
      providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
      permissionIds: [],
      documentId: 'ignored',
      operationId: 'update-auth',
      issuedAt: '2026-07-18T15:00:02.000Z',
    });
    expect(update.status).toBe('ready');
    if (update.status !== 'ready' || update.operation.kind !== 'command')
      return;
    const updated = applyWorkspaceCommand(
      created.snapshot,
      update.operation.command
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(
      readWorkspaceServerRuntimeAuthConfiguration(updated.snapshot)
    ).toMatchObject({ configuration: { permissionIds: [] } });
    const reversed = applyWorkspaceCommand(updated.snapshot, {
      ...update.operation.command,
      id: 'reverse-auth',
      forwardOps: update.operation.command.reverseOps,
      reverseOps: update.operation.command.forwardOps,
    });
    expect(reversed.ok).toBe(true);
    if (reversed.ok) expect(reversed.snapshot).toEqual(created.snapshot);
  });

  it('rejects a credential-shaped or path-colliding config without rewriting it', () => {
    const workspace = createWorkspace();
    const invalid: WorkspaceSnapshot = {
      ...workspace,
      docsById: {
        ...workspace.docsById,
        auth: {
          id: 'auth',
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
              token: 'must-not-persist',
            },
          },
        },
      },
    };
    expect(readWorkspaceServerRuntimeAuthConfiguration(invalid)).toMatchObject({
      status: 'invalid',
      issues: [{ code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID' }],
    });
    expect(
      createWorkspaceServerRuntimeAuthConfigurationPlan({
        workspace: invalid,
        providerId: PRODIVIX_PRODUCT_SESSION_AUTH_PROVIDER_ID,
        permissionIds: [],
        documentId: 'other',
        operationId: 'replace-invalid',
        issuedAt: '2026-07-18T15:01:00.000Z',
      })
    ).toMatchObject({
      status: 'rejected',
      code: 'WKS_SERVER_RUNTIME_AUTH_CONFIG_INVALID',
    });
  });
});
