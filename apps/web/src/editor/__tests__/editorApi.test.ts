import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultPirDoc } from '@prodivix/pir';
import {
  encodeWorkspaceSnapshot,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/api', () => ({
  apiRequest: apiRequestMock,
}));

import { editorApi } from '@/editor/editorApi';

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
      children: ['document-node'],
    },
    'document-node': {
      id: 'document-node',
      kind: 'doc',
      name: 'pir.json',
      parentId: 'root',
      docId: 'document-1',
    },
  },
  docsById: {
    'document-1': {
      id: 'document-1',
      type: 'pir-page',
      path: '/pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createDefaultPirDoc(),
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'root', children: [] },
  },
  activeDocumentId: 'document-1',
  activeRouteNodeId: 'root',
});

describe('editorApi workspace boundary', () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
  });

  it('decodes backend workspace wire DTOs into the canonical model', async () => {
    const workspace = createWorkspace();
    apiRequestMock.mockResolvedValueOnce({
      workspace: encodeWorkspaceSnapshot(workspace, { locale: 'zh-CN' }),
    });

    const result = await editorApi.getWorkspace('token', workspace.id);

    expect(result).toEqual({
      workspace,
      settings: { locale: 'zh-CN' },
    });
    expect(apiRequestMock).toHaveBeenCalledWith(
      '/workspaces/workspace-1',
      expect.objectContaining({ token: 'token' })
    );
  });

  it('encodes canonical workspaces when importing local projects', async () => {
    const workspace = createWorkspace();
    const wireWorkspace = encodeWorkspaceSnapshot(workspace, {
      locale: 'en-US',
    });
    apiRequestMock.mockResolvedValueOnce({
      project: {
        id: 'project-1',
        resourceType: 'project',
        name: 'Imported',
        isPublic: false,
        starsCount: 0,
        createdAt: '2026-07-12T00:00:00.000Z',
        updatedAt: '2026-07-12T00:00:00.000Z',
      },
      workspace: wireWorkspace,
    });

    const result = await editorApi.importLocalProject('token', {
      name: 'Imported',
      resourceType: 'project',
      workspace,
      settings: { locale: 'en-US' },
    });

    const [, options] = apiRequestMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(options.body as string) as Record<
      string,
      unknown
    >;
    expect(requestBody.workspace).toEqual(wireWorkspace);
    expect(requestBody.workspace).not.toHaveProperty('docsById');
    expect(result.workspace.docsById['document-1']).toBeDefined();
    expect(result.settings).toEqual({ locale: 'en-US' });
  });

  it('commits a canonical WorkspaceOperation through the atomic endpoint', async () => {
    const workspace = createWorkspace();
    const document = workspace.docsById['document-1']!;
    const content = document.content as { metadata?: unknown };
    const resolvedMetadata = { title: 'Resolved' };
    const operation = {
      kind: 'command' as const,
      command: {
        id: 'operation-1',
        namespace: 'core.pir',
        type: 'document.update',
        version: '1.0',
        issuedAt: '2026-07-12T00:00:00.000Z',
        target: {
          workspaceId: workspace.id,
          documentId: 'document-1',
        },
        domainHint: 'pir' as const,
        forwardOps: [
          {
            op: 'add' as const,
            path: '/metadata',
            value: resolvedMetadata,
          },
        ],
        reverseOps: [
          content.metadata === undefined
            ? { op: 'remove' as const, path: '/metadata' }
            : {
                op: 'replace' as const,
                path: '/metadata',
                value: content.metadata,
              },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 1,
      routeRev: 1,
      opSeq: 2,
      updatedDocuments: [
        {
          ...document,
          contentRev: 2,
          content: {
            ...(document.content as object),
            metadata: resolvedMetadata,
          },
          updatedAt: '2026-07-12T00:00:01.000Z',
        },
      ],
      acceptedMutationId: operation.command.id,
    });

    const mutation = await editorApi.commitWorkspaceOperation(
      'token',
      workspace,
      {
        expected: {
          documents: [{ id: 'document-1', contentRev: 1 }],
        },
        operation,
      }
    );

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/workspaces/workspace-1/operations/commit',
      {
        token: 'token',
        defaultHeaders: { 'Content-Type': 'application/json' },
        method: 'POST',
        body: JSON.stringify({
          expected: {
            documents: [{ id: 'document-1', contentRev: 1 }],
          },
          operation,
        }),
      }
    );
    expect(mutation.acceptedMutationId).toBe(operation.command.id);
  });

  it('preserves explicit null document absence preconditions on the wire', async () => {
    const workspace = createWorkspace();
    const newDocument = {
      id: 'document-new',
      type: 'pir-page' as const,
      name: 'new.pir.json',
      path: '/new.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createDefaultPirDoc(),
    };
    const operation = {
      kind: 'command' as const,
      command: {
        id: 'operation-add-document',
        namespace: 'core.workspace',
        type: 'document.create',
        version: '1.0',
        issuedAt: '2026-07-12T00:00:00.000Z',
        target: { workspaceId: workspace.id },
        domainHint: 'workspace' as const,
        forwardOps: [
          {
            op: 'add' as const,
            path: '/docsById/document-new',
            value: newDocument,
          },
          {
            op: 'add' as const,
            path: '/treeById/document-node-new',
            value: {
              id: 'document-node-new',
              kind: 'doc',
              name: 'new.pir.json',
              parentId: 'root',
              docId: 'document-new',
            },
          },
          {
            op: 'replace' as const,
            path: '/treeById/root/children',
            value: ['document-node', 'document-node-new'],
          },
        ],
        reverseOps: [
          {
            op: 'replace' as const,
            path: '/treeById/root/children',
            value: ['document-node'],
          },
          {
            op: 'remove' as const,
            path: '/treeById/document-node-new',
          },
          { op: 'remove' as const, path: '/docsById/document-new' },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 1,
      opSeq: 2,
      tree: {
        treeRootId: workspace.treeRootId,
        treeById: {
          ...workspace.treeById,
          root: {
            ...workspace.treeById.root,
            children: ['document-node', 'document-node-new'],
          },
          'document-node-new': {
            id: 'document-node-new',
            kind: 'doc',
            name: 'new.pir.json',
            parentId: 'root',
            docId: 'document-new',
          },
        },
      },
      updatedDocuments: [
        {
          ...newDocument,
          updatedAt: '2026-07-12T00:00:01.000Z',
        },
      ],
      acceptedMutationId: operation.command.id,
    });

    await editorApi.commitWorkspaceOperation('token', workspace, {
      expected: {
        workspaceRev: 1,
        documents: [{ id: 'document-new', contentRev: null, metaRev: null }],
      },
      operation,
    });

    const [, options] = apiRequestMock.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(options.body as string) as {
      expected: { documents: Array<Record<string, unknown>> };
    };
    expect(requestBody.expected.documents).toEqual([
      { id: 'document-new', contentRev: null, metaRev: null },
    ]);
  });

  it('decodes every affected projection from an aggregate commit response', async () => {
    const workspace = createWorkspace();
    workspace.treeById.root!.children = [
      'document-node',
      'retired-document-node',
    ];
    workspace.treeById['retired-document-node'] = {
      id: 'retired-document-node',
      kind: 'doc',
      name: 'retired.pir.json',
      parentId: 'root',
      docId: 'retired-document',
    };
    workspace.docsById['retired-document'] = {
      id: 'retired-document',
      type: 'pir-page',
      name: 'retired.pir.json',
      path: '/retired.pir.json',
      contentRev: 3,
      metaRev: 2,
      content: createDefaultPirDoc(),
    };
    const nextTree = {
      treeRootId: workspace.treeRootId,
      treeById: {
        root: {
          ...workspace.treeById.root!,
          children: ['document-node'],
        },
        'document-node': workspace.treeById['document-node']!,
      },
    };
    const nextRouteManifest = {
      version: '1' as const,
      root: {
        id: 'root',
        children: [
          { id: 'route-primary', index: true, pageDocId: 'document-1' },
        ],
      },
    };
    const updatedDocument = {
      ...workspace.docsById['document-1']!,
      name: 'Primary page',
      metaRev: 2,
      capabilities: ['pir.author'],
      updatedAt: '2026-07-12T00:01:00.000Z',
    };
    const operation = {
      kind: 'transaction' as const,
      transaction: {
        id: 'operation-aggregate',
        workspaceId: workspace.id,
        issuedAt: '2026-07-12T00:00:00.000Z',
        commands: [
          {
            id: 'operation-aggregate:workspace',
            namespace: 'core.workspace',
            type: 'documents.update',
            version: '1.0',
            issuedAt: '2026-07-12T00:00:00.000Z',
            target: { workspaceId: workspace.id },
            domainHint: 'workspace' as const,
            forwardOps: [
              {
                op: 'replace' as const,
                path: '/treeById/root/children',
                value: ['document-node'],
              },
              {
                op: 'remove' as const,
                path: '/treeById/retired-document-node',
              },
              {
                op: 'remove' as const,
                path: '/docsById/retired-document',
              },
              {
                op: 'add' as const,
                path: '/docsById/document-1/name',
                value: 'Primary page',
              },
              {
                op: 'add' as const,
                path: '/docsById/document-1/capabilities',
                value: ['pir.author'],
              },
            ],
            reverseOps: [
              {
                op: 'remove' as const,
                path: '/docsById/document-1/capabilities',
              },
              {
                op: 'remove' as const,
                path: '/docsById/document-1/name',
              },
              {
                op: 'add' as const,
                path: '/docsById/retired-document',
                value: workspace.docsById['retired-document'],
              },
              {
                op: 'add' as const,
                path: '/treeById/retired-document-node',
                value: workspace.treeById['retired-document-node'],
              },
              {
                op: 'replace' as const,
                path: '/treeById/root/children',
                value: ['document-node', 'retired-document-node'],
              },
            ],
          },
          {
            id: 'operation-aggregate:route',
            namespace: 'core.route',
            type: 'manifest.update',
            version: '1.0',
            issuedAt: '2026-07-12T00:00:00.000Z',
            target: { workspaceId: workspace.id },
            domainHint: 'route' as const,
            forwardOps: [
              {
                op: 'replace' as const,
                path: '/routeManifest',
                value: nextRouteManifest,
              },
            ],
            reverseOps: [
              {
                op: 'replace' as const,
                path: '/routeManifest',
                value: workspace.routeManifest,
              },
            ],
          },
        ],
      },
    };
    apiRequestMock.mockResolvedValueOnce({
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 2,
      opSeq: 2,
      tree: nextTree,
      routeManifest: nextRouteManifest,
      updatedDocuments: [updatedDocument],
      removedDocumentIds: ['retired-document'],
      acceptedMutationId: operation.transaction.id,
    });

    const mutation = await editorApi.commitWorkspaceOperation(
      'token',
      workspace,
      {
        expected: {
          workspaceRev: 1,
          routeRev: 1,
          documents: [
            { id: 'document-1', metaRev: 1 },
            { id: 'retired-document', contentRev: 3, metaRev: 2 },
          ],
        },
        operation,
      }
    );

    expect(mutation).toMatchObject({
      tree: nextTree,
      routeManifest: nextRouteManifest,
      removedDocumentIds: ['retired-document'],
      updatedDocuments: [
        expect.objectContaining({
          id: 'document-1',
          name: 'Primary page',
          capabilities: ['pir.author'],
          metaRev: 2,
        }),
      ],
      acceptedMutationId: operation.transaction.id,
    });
  });

  it('rejects malformed wire responses at the API boundary', async () => {
    apiRequestMock.mockResolvedValueOnce({ workspace: {} });

    await expect(
      editorApi.getWorkspace('token', 'workspace-1')
    ).rejects.toThrow('/workspace/documents');
  });
});
