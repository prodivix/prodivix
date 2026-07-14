import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';

const ISSUED_AT = '2026-07-12T00:00:00.000Z';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 11,
  treeRootId: 'root',
  activeDocumentId: 'code-one',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['src'],
    },
    src: {
      id: 'src',
      kind: 'dir',
      name: 'src',
      parentId: 'root',
      children: ['code-one-node'],
    },
    'code-one-node': {
      id: 'code-one-node',
      kind: 'doc',
      name: 'one.ts',
      parentId: 'src',
      docId: 'code-one',
    },
  },
  docsById: {
    'code-one': {
      id: 'code-one',
      type: 'code',
      path: '/src/one.ts',
      contentRev: 4,
      metaRev: 2,
      content: { language: 'ts', source: 'export const one = 1;' },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const createWorkspaceCommand = (
  overrides: Partial<WorkspaceCommandEnvelope>
): WorkspaceCommandEnvelope => ({
  id: 'command-1',
  namespace: 'core.workspace',
  type: 'workspace.update',
  version: '1.0',
  issuedAt: ISSUED_AT,
  target: { workspaceId: 'workspace-1' },
  domainHint: 'workspace',
  forwardOps: [],
  reverseOps: [],
  ...overrides,
});

const createTransaction = (
  commands: WorkspaceCommandEnvelope[]
): WorkspaceTransactionEnvelope => ({
  id: 'transaction-1',
  workspaceId: 'workspace-1',
  issuedAt: ISSUED_AT,
  label: 'Create code document',
  commands,
});

describe('applyWorkspaceTransaction', () => {
  it('validates once after all commands and exposes the stable transaction id', () => {
    const workspace = createWorkspace();
    const addDocument = createWorkspaceCommand({
      id: 'add-document',
      type: 'document.add',
      forwardOps: [
        {
          op: 'add',
          path: '/docsById/code-two',
          value: {
            id: 'code-two',
            type: 'code',
            path: '/src/two.ts',
            contentRev: 1,
            metaRev: 1,
            content: { language: 'ts', source: 'export const two = 2;' },
          },
        },
      ],
      reverseOps: [{ op: 'remove', path: '/docsById/code-two' }],
    });
    const mountDocument = createWorkspaceCommand({
      id: 'mount-document',
      type: 'document.mount',
      forwardOps: [
        {
          op: 'add',
          path: '/treeById/code-two-node',
          value: {
            id: 'code-two-node',
            kind: 'doc',
            name: 'two.ts',
            parentId: 'src',
            docId: 'code-two',
          },
        },
        {
          op: 'add',
          path: '/treeById/src/children/-',
          value: 'code-two-node',
        },
      ],
      reverseOps: [
        { op: 'remove', path: '/treeById/src/children/1' },
        { op: 'remove', path: '/treeById/code-two-node' },
      ],
    });

    expect(applyWorkspaceCommand(workspace, addDocument).ok).toBe(false);

    const transaction = createTransaction([addDocument, mountDocument]);
    const result = applyWorkspaceTransaction(workspace, transaction);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transaction.id).toBe('transaction-1');
    expect(result.snapshot.treeById.src.children).toEqual([
      'code-one-node',
      'code-two-node',
    ]);
    expect(result.snapshot.docsById['code-two']).toMatchObject({
      path: '/src/two.ts',
      contentRev: 1,
    });
  });

  it('returns no partial snapshot when a later command fails', () => {
    const workspace = createWorkspace();
    const before = JSON.parse(JSON.stringify(workspace)) as WorkspaceSnapshot;
    const updateSource = createWorkspaceCommand({
      id: 'update-source',
      namespace: 'core.code',
      type: 'source.update',
      target: { workspaceId: 'workspace-1', documentId: 'code-one' },
      domainHint: 'code',
      forwardOps: [
        {
          op: 'replace',
          path: '/source',
          value: 'export const one = 10;',
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/source',
          value: 'export const one = 1;',
        },
      ],
    });
    const forbiddenPatch = createWorkspaceCommand({
      id: 'forbidden-patch',
      namespace: 'core.pir',
      type: 'node.update',
      target: { workspaceId: 'workspace-1', documentId: 'code-one' },
      domainHint: 'pir',
      forwardOps: [{ op: 'add', path: '/ui/graph', value: {} }],
      reverseOps: [{ op: 'remove', path: '/ui/graph' }],
    });

    const result = applyWorkspaceTransaction(
      workspace,
      createTransaction([updateSource, forbiddenPatch])
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedCommandId).toBe('forbidden-patch');
    expect(result.failedCommandIndex).toBe(1);
    expect(result).not.toHaveProperty('snapshot');
    expect(workspace).toEqual(before);
  });

  it('commits route cleanup and document deletion as one atomic boundary', () => {
    const workspace = createWorkspace();
    workspace.treeById.root = {
      ...workspace.treeById.root,
      children: ['src', 'pages'],
    };
    workspace.treeById.pages = {
      id: 'pages',
      kind: 'dir',
      name: 'pages',
      parentId: 'root',
      children: ['page-home-node'],
    };
    workspace.treeById['page-home-node'] = {
      id: 'page-home-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'pages',
      docId: 'page-home',
    };
    workspace.docsById['page-home'] = {
      id: 'page-home',
      type: 'pir-page',
      path: '/pages/home.pir.json',
      contentRev: 2,
      metaRev: 1,
      content: createEmptyPirDocument(),
    };
    workspace.routeManifest = {
      version: '1',
      root: {
        id: 'route-root',
        children: [{ id: 'route-home', segment: '', pageDocId: 'page-home' }],
      },
    };

    const clearRouteReference = createWorkspaceCommand({
      id: 'clear-route-reference',
      namespace: 'core.route',
      type: 'route.remove',
      domainHint: 'route',
      forwardOps: [
        {
          op: 'replace',
          path: '/routeManifest/root',
          value: { id: 'route-root' },
        },
      ],
      reverseOps: [
        {
          op: 'replace',
          path: '/routeManifest/root',
          value: workspace.routeManifest.root,
        },
      ],
    });
    const deleteDocument = createWorkspaceCommand({
      id: 'delete-page-document',
      type: 'document.delete',
      forwardOps: [
        { op: 'remove', path: '/treeById/pages/children/0' },
        { op: 'remove', path: '/treeById/page-home-node' },
        { op: 'remove', path: '/docsById/page-home' },
      ],
      reverseOps: [
        {
          op: 'add',
          path: '/docsById/page-home',
          value: workspace.docsById['page-home'],
        },
        {
          op: 'add',
          path: '/treeById/page-home-node',
          value: workspace.treeById['page-home-node'],
        },
        {
          op: 'add',
          path: '/treeById/pages/children/0',
          value: 'page-home-node',
        },
      ],
    });

    expect(applyWorkspaceCommand(workspace, deleteDocument).ok).toBe(false);

    const result = applyWorkspaceTransaction(
      workspace,
      createTransaction([clearRouteReference, deleteDocument])
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.docsById['page-home']).toBeUndefined();
    expect(result.snapshot.routeManifest.root).toEqual({ id: 'route-root' });
  });

  it('rejects a transaction whose final workspace is invalid', () => {
    const orphanDocument = createWorkspaceCommand({
      id: 'add-orphan',
      type: 'document.add',
      forwardOps: [
        {
          op: 'add',
          path: '/docsById/orphan',
          value: {
            id: 'orphan',
            type: 'code',
            path: '/src/orphan.ts',
            contentRev: 1,
            metaRev: 1,
            content: { language: 'ts', source: '' },
          },
        },
      ],
      reverseOps: [{ op: 'remove', path: '/docsById/orphan' }],
    });

    const result = applyWorkspaceTransaction(
      createWorkspace(),
      createTransaction([orphanDocument])
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'WKS_TRANSACTION_VALIDATION_FAILED',
      })
    );
    expect(result).not.toHaveProperty('snapshot');
  });
});
