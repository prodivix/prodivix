import { describe, expect, it } from 'vitest';
import type {
  WorkspaceOperation,
  WorkspaceSnapshot,
} from '@prodivix/workspace';
import { decodeWorkspaceOperationCommitResponse } from '../workspaceOperationCommitResponse';

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
      children: ['document-node'],
    },
    'document-node': {
      id: 'document-node',
      kind: 'doc',
      name: 'main.ts',
      parentId: 'root',
      docId: 'document-1',
    },
  },
  docsById: {
    'document-1': {
      id: 'document-1',
      type: 'code',
      path: '/main.ts',
      contentRev: 1,
      metaRev: 1,
      content: { language: 'ts', source: 'export {};' },
    },
  },
  routeManifest: { version: '1', root: { id: 'root' } },
};

const operation: WorkspaceOperation = {
  kind: 'command',
  command: {
    id: 'operation-1',
    namespace: 'core.code',
    type: 'source.update',
    version: '1.0',
    issuedAt: '2026-07-12T00:00:00.000Z',
    target: { workspaceId: workspace.id, documentId: 'document-1' },
    domainHint: 'code',
    forwardOps: [
      { op: 'replace', path: '/source', value: 'export default 1;' },
    ],
    reverseOps: [{ op: 'replace', path: '/source', value: 'export {};' }],
  },
};

const response = {
  workspaceId: workspace.id,
  workspaceRev: 1,
  routeRev: 1,
  opSeq: 2,
  updatedDocuments: [
    {
      ...workspace.docsById['document-1'],
      contentRev: 2,
      content: { language: 'ts', source: 'export default 1;' },
      updatedAt: '2026-07-12T00:00:01.000Z',
    },
  ],
  acceptedMutationId: 'operation-1',
};

describe('decodeWorkspaceOperationCommitResponse', () => {
  it('requires an acknowledgement for the exact operation id', () => {
    expect(
      decodeWorkspaceOperationCommitResponse(response, workspace, operation)
    ).toMatchObject({ acceptedMutationId: 'operation-1', opSeq: 2 });

    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...response, acceptedMutationId: 'another-operation' },
        workspace,
        operation
      )
    ).toThrow(/acceptedMutationId/);
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...response, acceptedMutationId: undefined },
        workspace,
        operation
      )
    ).toThrow(/acceptedMutationId/);
  });

  it.each(['settings', 'activeDocumentId', 'activeRouteNodeId', 'unknown'])(
    'rejects the non-commit response field %s',
    (field) => {
      expect(() =>
        decodeWorkspaceOperationCommitResponse(
          { ...response, [field]: {} },
          workspace,
          operation
        )
      ).toThrow(`/mutation/${field}`);
    }
  );

  it('rejects a success response that omits the operation document delta', () => {
    const emptyResponse = {
      workspaceId: response.workspaceId,
      workspaceRev: response.workspaceRev,
      routeRev: response.routeRev,
      opSeq: response.opSeq,
      acceptedMutationId: response.acceptedMutationId,
    };

    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        emptyResponse,
        workspace,
        operation
      )
    ).toThrow(/Aggregate document delta/);
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        {
          ...emptyResponse,
          updatedDocuments: [],
          removedDocumentIds: [],
        },
        workspace,
        operation
      )
    ).toThrow(/must be omitted instead of empty/);
  });

  it('rejects an unrelated tree delta used to disguise a missing document', () => {
    const withoutDocument = {
      workspaceId: response.workspaceId,
      workspaceRev: response.workspaceRev,
      routeRev: response.routeRev,
      opSeq: response.opSeq,
      acceptedMutationId: response.acceptedMutationId,
    };

    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        {
          ...withoutDocument,
          tree: {
            treeRootId: workspace.treeRootId,
            treeById: workspace.treeById,
          },
        },
        workspace,
        operation
      )
    ).toThrow(/Aggregate document delta/);
  });

  it('requires exact document revisions and monotonic aggregate progress', () => {
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        {
          ...response,
          updatedDocuments: response.updatedDocuments.map((document) => ({
            ...document,
            contentRev: 3,
          })),
        },
        workspace,
        operation
      )
    ).toThrow(/Expected revision 2/);
    expect(
      decodeWorkspaceOperationCommitResponse(
        { ...response, workspaceRev: 2, routeRev: 2, opSeq: 3 },
        workspace,
        operation
      )
    ).toMatchObject({ workspaceRev: 2, routeRev: 2, opSeq: 3 });
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...response, opSeq: 1 },
        workspace,
        operation
      )
    ).toThrow('/mutation/opSeq');
  });

  it('accepts an unscoped metadata advance only with an operation sequence gap', () => {
    const withRemoteMetadata = {
      ...response,
      workspaceRev: 2,
      opSeq: 3,
      updatedDocuments: response.updatedDocuments.map((document) => ({
        ...document,
        metaRev: 2,
        capabilities: ['preview'],
      })),
    };

    expect(
      decodeWorkspaceOperationCommitResponse(
        withRemoteMetadata,
        workspace,
        operation
      )
    ).toMatchObject({ workspaceRev: 2, opSeq: 3 });
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...withRemoteMetadata, opSeq: 2 },
        workspace,
        operation
      )
    ).toThrow(/Unscoped document metadata/);
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        {
          ...withRemoteMetadata,
          updatedDocuments: withRemoteMetadata.updatedDocuments.map(
            (document) => ({ ...document, metaRev: 1 })
          ),
        },
        workspace,
        operation
      )
    ).toThrow(/Unscoped document metadata/);
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        {
          ...withRemoteMetadata,
          updatedDocuments: withRemoteMetadata.updatedDocuments.map(
            (document) => ({ ...document, metaRev: 3 })
          ),
        },
        workspace,
        operation
      )
    ).toThrow(/Unscoped document metadata/);
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...withRemoteMetadata, workspaceRev: 3 },
        workspace,
        operation
      )
    ).toThrow(/workspace revision exceeds/);
  });

  it('rejects overlapping document update and removal deltas', () => {
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...response, removedDocumentIds: ['document-1'] },
        workspace,
        operation
      )
    ).toThrow(/cannot be updated and removed/);
  });

  it('accepts only the exact route aggregate and both route revisions', () => {
    const routeOperation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-route',
        namespace: 'core.route',
        type: 'manifest.update',
        version: '1.0',
        issuedAt: '2026-07-12T00:00:00.000Z',
        target: { workspaceId: workspace.id },
        domainHint: 'route',
        forwardOps: [
          { op: 'replace', path: '/routeManifest/version', value: '2' },
        ],
        reverseOps: [
          { op: 'replace', path: '/routeManifest/version', value: '1' },
        ],
      },
    };
    const routeResponse = {
      workspaceId: workspace.id,
      workspaceRev: 2,
      routeRev: 2,
      opSeq: 2,
      routeManifest: { version: '2', root: { id: 'root' } },
      acceptedMutationId: 'operation-route',
    };

    expect(
      decodeWorkspaceOperationCommitResponse(
        routeResponse,
        workspace,
        routeOperation
      )
    ).toMatchObject({ workspaceRev: 2, routeRev: 2 });
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...routeResponse, routeManifest: undefined },
        workspace,
        routeOperation
      )
    ).toThrow('/mutation/routeManifest');
    expect(() =>
      decodeWorkspaceOperationCommitResponse(
        { ...routeResponse, workspaceRev: 1 },
        workspace,
        routeOperation
      )
    ).toThrow('/mutation/workspaceRev');
  });
});
