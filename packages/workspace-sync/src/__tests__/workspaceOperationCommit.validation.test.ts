import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceCommand,
  createWorkspaceCommandOperation,
  createWorkspaceHistoryState,
  recordWorkspaceOperation,
  undoWorkspaceHistory,
  type WorkspaceCommandEnvelope,
  type WorkspaceOperation,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { planWorkspaceOperationCommit } from '../workspaceOperationCommit';
import {
  codeCommand,
  createWorkspace,
  issuedAt,
} from './workspaceOperationCommit.fixture';

const addSecondCodeDocument = (workspace: WorkspaceSnapshot) => {
  const root = workspace.treeById.root;
  if (!root || root.kind !== 'dir') {
    throw new Error('Expected the workspace root directory.');
  }
  root.children = [...(root.children ?? []), 'node-two'];
  workspace.treeById['node-two'] = {
    id: 'node-two',
    kind: 'doc',
    name: 'two.ts',
    parentId: 'root',
    docId: 'doc-two',
  };
  workspace.docsById['doc-two'] = {
    id: 'doc-two',
    type: 'code',
    name: 'two.ts',
    path: '/two.ts',
    contentRev: 1,
    metaRev: 1,
    content: { language: 'ts', source: 'export {};' },
  };
};

describe('planWorkspaceOperationCommit', () => {
  it('guards metadata without coupling it to content changes', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-rename',
        namespace: 'core.workspace',
        type: 'document.rename',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'replace', path: '/docsById/doc-code/name', value: 'app.ts' },
          { op: 'replace', path: '/docsById/doc-code/path', value: '/app.ts' },
          {
            op: 'replace',
            path: '/treeById/node-code/name',
            value: 'app.ts',
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/treeById/node-code/name',
            value: 'main.ts',
          },
          {
            op: 'replace',
            path: '/docsById/doc-code/path',
            value: '/main.ts',
          },
          {
            op: 'replace',
            path: '/docsById/doc-code/name',
            value: 'main.ts',
          },
        ],
      },
    };

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: 8,
          documents: [{ id: 'doc-code', metaRev: 2 }],
        },
      },
    });
  });

  it('treats document capabilities as metadata', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-capabilities',
        namespace: 'core.workspace',
        type: 'document.capabilities.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'add',
            path: '/docsById/doc-code/capabilities',
            value: ['code.author'],
          },
        ],
        reverseOps: [{ op: 'remove', path: '/docsById/doc-code/capabilities' }],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: 8,
          documents: [{ id: 'doc-code', metaRev: 2 }],
        },
      },
    });
  });

  it('guards document removal with both document revisions', () => {
    const workspace = createWorkspace();
    const root = workspace.treeById.root;
    if (!root || root.kind !== 'dir')
      throw new Error('Expected root directory.');
    root.children = [...(root.children ?? []), 'node-retained'];
    workspace.treeById['node-retained'] = {
      id: 'node-retained',
      kind: 'doc',
      name: 'retained.ts',
      parentId: 'root',
      docId: 'doc-retained',
    };
    workspace.docsById['doc-retained'] = {
      id: 'doc-retained',
      type: 'code',
      path: '/retained.ts',
      contentRev: 1,
      metaRev: 1,
      content: { language: 'ts', source: 'export {};' },
    };
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-remove-document',
        namespace: 'core.workspace',
        type: 'document.delete',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'remove', path: '/activeDocumentId' },
          { op: 'remove', path: '/treeById/root/children/0' },
          { op: 'remove', path: '/treeById/node-code' },
          { op: 'remove', path: '/docsById/doc-code' },
        ],
        reverseOps: [
          {
            op: 'add',
            path: '/docsById/doc-code',
            value: workspace.docsById['doc-code'],
          },
          {
            op: 'add',
            path: '/treeById/node-code',
            value: workspace.treeById['node-code'],
          },
          {
            op: 'add',
            path: '/treeById/root/children/0',
            value: 'node-code',
          },
          {
            op: 'add',
            path: '/activeDocumentId',
            value: 'doc-code',
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: 8,
          documents: [{ id: 'doc-code', contentRev: 5, metaRev: 2 }],
        },
      },
    });
  });

  it('rejects RouteManifest writes outside the route domain', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-route-wrong-domain',
        namespace: 'core.workspace',
        type: 'manifest.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'replace',
            path: '/routeManifest',
            value: {
              version: '1',
              root: { id: 'root', children: [] },
            },
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/routeManifest',
            value: workspace.routeManifest,
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED',
          commandId: operation.command.id,
        },
      ],
    });
  });

  it('validates reverse operation paths with the same commit policy', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-invalid-reverse-path',
        namespace: 'core.workspace',
        type: 'tree.rename',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'replace', path: '/treeById/root/name', value: 'root' },
        ],
        reverseOps: [
          { op: 'replace', path: '/treeById/root/name', value: '/' },
          {
            op: 'test',
            path: '/routeManifest',
            value: workspace.routeManifest,
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED' }],
    });
  });

  it('rejects a domainHint that contradicts the canonical namespace', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-domain-mismatch',
        namespace: 'core.route',
        type: 'tree.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'replace',
            path: '/treeById/root/name',
            value: 'root',
          },
        ],
        reverseOps: [
          { op: 'replace', path: '/treeById/root/name', value: '/' },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });

  it('rejects move/copy in workspace commands in either direction', () => {
    const workspace = createWorkspace();
    const forwardMove: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-forward-move',
        namespace: 'core.workspace',
        type: 'tree.reorder',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'move',
            from: '/treeById/root/children/0',
            path: '/treeById/root/children/-',
          },
        ],
        reverseOps: [
          {
            op: 'move',
            from: '/treeById/root/children/0',
            path: '/treeById/root/children/-',
          },
        ],
      },
    };
    expect(planWorkspaceOperationCommit(workspace, forwardMove)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED' }],
    });

    const workspaceWithCanonicalRootName = createWorkspace();
    workspaceWithCanonicalRootName.treeById.root!.name = 'root';
    const reverseCopy: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-reverse-copy',
        namespace: 'core.workspace',
        type: 'tree.rename',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'replace', path: '/treeById/root/name', value: 'changed' },
        ],
        reverseOps: [
          {
            op: 'copy',
            from: '/treeById/root/id',
            path: '/treeById/root/name',
          },
        ],
      },
    };
    expect(
      planWorkspaceOperationCommit(workspaceWithCanonicalRootName, reverseCopy)
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED' }],
    });
  });

  it('rejects nested name/path metadata patches', () => {
    const workspace = createWorkspace();
    workspace.docsById['doc-code']!.name = {
      value: 'main.ts',
    } as unknown as string;
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-nested-name',
        namespace: 'core.workspace',
        type: 'document.rename',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'replace',
            path: '/docsById/doc-code/name/value',
            value: 'app.ts',
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/docsById/doc-code/name/value',
            value: 'main.ts',
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED' }],
    });
  });

  it('does not create a server commit for ephemeral selection alone', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-selection-only',
        namespace: 'core.route',
        type: 'selection.restore',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'route',
        forwardOps: [
          {
            op: 'replace',
            path: '/activeRouteNodeId',
            value: 'root',
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/activeRouteNodeId',
            value: 'root',
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('canonicalizes causal metadata and rejects contradictory ancestry', () => {
    const workspace = createWorkspace();
    const command = codeCommand(
      'operation-causal',
      'export const value = 1;',
      'export const value = 2;'
    );
    const contradictory: WorkspaceOperation = {
      kind: 'command',
      command,
      undoOf: 'operation-before',
      redoOf: 'operation-after',
    };
    expect(
      planWorkspaceOperationCommit(workspace, contradictory)
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });

    const causal: WorkspaceOperation = {
      kind: 'command',
      command,
      sourceOperationIds: [' source-one ', 'source-one', 'source-two'],
    };
    const result = planWorkspaceOperationCommit(workspace, causal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.operation.sourceOperationIds).toEqual([
      'source-one',
      'source-two',
    ]);
  });

  it('rejects non-canonical commit ids and timestamps before transport', () => {
    const workspace = createWorkspace();
    const spacedId: WorkspaceOperation = {
      kind: 'command',
      command: codeCommand(
        ' operation-with-spaces ',
        'export const value = 1;',
        'export const value = 2;'
      ),
    };
    expect(planWorkspaceOperationCommit(workspace, spacedId)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });

    const invalidTimestampCommand = codeCommand(
      'operation-invalid-time',
      'export const value = 1;',
      'export const value = 2;'
    );
    invalidTimestampCommand.issuedAt = '2026-02-30T00:00:00Z';
    expect(
      planWorkspaceOperationCommit(workspace, {
        kind: 'command',
        command: invalidTimestampCommand,
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });

  it('hard-cuts move/copy from document-targeted atomic commits', () => {
    const workspace = createWorkspace();
    workspace.docsById['doc-code']!.content = {
      language: 'ts',
      source: 'export const value = 1;',
      metadata: {},
    };
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-document-copy',
        namespace: 'core.code',
        type: 'metadata.copy',
        version: '1.0',
        issuedAt,
        target: {
          workspaceId: workspace.id,
          documentId: 'doc-code',
        },
        domainHint: 'code',
        forwardOps: [
          {
            op: 'copy',
            from: '/source',
            path: '/metadata/copiedSource',
          },
        ],
        reverseOps: [{ op: 'remove', path: '/metadata/copiedSource' }],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_PATH_UNSUPPORTED' }],
    });
  });

  it('plans history undo against the durable projection after selection drift', () => {
    const workspace = createWorkspace();
    addSecondCodeDocument(workspace);
    const command: WorkspaceCommandEnvelope = {
      id: 'operation-selection-drift',
      namespace: 'core.workspace',
      type: 'document.capabilities.update',
      version: '1.0',
      issuedAt,
      target: { workspaceId: workspace.id },
      domainHint: 'workspace',
      forwardOps: [
        {
          op: 'add',
          path: '/docsById/doc-code/capabilities',
          value: ['code.author'],
        },
        { op: 'replace', path: '/activeDocumentId', value: 'doc-two' },
      ],
      reverseOps: [
        { op: 'replace', path: '/activeDocumentId', value: 'doc-code' },
        { op: 'remove', path: '/docsById/doc-code/capabilities' },
      ],
    };
    const applied = applyWorkspaceCommand(workspace, command);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const drifted = { ...applied.snapshot, activeDocumentId: 'doc-code' };
    const history = recordWorkspaceOperation(
      createWorkspaceHistoryState(),
      createWorkspaceCommandOperation(command)
    );
    const undone = undoWorkspaceHistory(
      drifted,
      history,
      { kind: 'workspace', workspaceId: workspace.id },
      {
        clock: () => issuedAt,
        idFactory: ({ role }) => `history-undo-${role}`,
      }
    );
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;

    const planned = planWorkspaceOperationCommit(
      drifted,
      undone.appliedOperation
    );
    expect(planned).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: workspace.workspaceRev,
          documents: [{ id: 'doc-code', metaRev: 2 }],
        },
      },
    });
    if (!planned.ok || planned.request.operation.kind !== 'command') return;
    expect(planned.request.operation.command.forwardOps).toContainEqual({
      op: 'replace',
      path: '/activeDocumentId',
      value: 'doc-code',
    });
  });

  it('drops selection-only commands only from a mixed transaction projection', () => {
    const workspace = createWorkspace();
    addSecondCodeDocument(workspace);
    const selectionCommand: WorkspaceCommandEnvelope = {
      id: 'operation-selection-only-command',
      namespace: 'core.workspace',
      type: 'selection.update',
      version: '1.0',
      issuedAt,
      target: { workspaceId: workspace.id },
      domainHint: 'workspace',
      forwardOps: [
        { op: 'replace', path: '/activeDocumentId', value: 'doc-two' },
      ],
      reverseOps: [
        { op: 'replace', path: '/activeDocumentId', value: 'doc-code' },
      ],
    };
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-mixed-selection-transaction',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          selectionCommand,
          codeCommand(
            'operation-mixed-selection-content',
            'export const value = 1;',
            'export const value = 2;'
          ),
        ],
      },
    };

    const planned = planWorkspaceOperationCommit(workspace, operation);
    expect(planned).toMatchObject({
      ok: true,
      request: {
        expected: {
          documents: [{ id: 'doc-code', contentRev: 5 }],
        },
      },
    });
    if (!planned.ok || planned.request.operation.kind !== 'transaction') return;
    expect(planned.request.operation.transaction.commands).toHaveLength(2);
    expect(planned.request.operation.transaction.commands[0]?.id).toBe(
      selectionCommand.id
    );
  });

  it('treats an all-selection transaction as an empty durable write set', () => {
    const workspace = createWorkspace();
    addSecondCodeDocument(workspace);
    const selectionCommand: WorkspaceCommandEnvelope = {
      id: 'operation-all-selection-command',
      namespace: 'core.workspace',
      type: 'selection.update',
      version: '1.0',
      issuedAt,
      target: { workspaceId: workspace.id },
      domainHint: 'workspace',
      forwardOps: [
        { op: 'replace', path: '/activeDocumentId', value: 'doc-two' },
      ],
      reverseOps: [
        { op: 'replace', path: '/activeDocumentId', value: 'doc-code' },
      ],
    };

    expect(
      planWorkspaceOperationCommit(workspace, {
        kind: 'transaction',
        transaction: {
          id: 'operation-all-selection-transaction',
          workspaceId: workspace.id,
          issuedAt,
          commands: [selectionCommand],
        },
      })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('rejects a command when selection filtering empties only one direction', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-one-sided-persistent-projection',
        namespace: 'core.workspace',
        type: 'document.capabilities.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'add',
            path: '/docsById/doc-code/capabilities',
            value: ['code.author'],
          },
          {
            op: 'replace',
            path: '/activeDocumentId',
            value: 'doc-code',
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/activeDocumentId',
            value: 'doc-code',
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });

  it('adds reverse test paths as read-only CAS dependencies', () => {
    const workspace = createWorkspace();
    addSecondCodeDocument(workspace);
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-reverse-test-dependency',
        namespace: 'core.workspace',
        type: 'document.capabilities.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'add',
            path: '/docsById/doc-code/capabilities',
            value: ['code.author'],
          },
        ],
        reverseOps: [
          {
            op: 'test',
            path: '/docsById/doc-two/name',
            value: 'two.ts',
          },
          { op: 'remove', path: '/docsById/doc-code/capabilities' },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: workspace.workspaceRev,
          documents: [
            { id: 'doc-code', metaRev: 2 },
            { id: 'doc-two', metaRev: 1 },
          ],
        },
      },
    });
  });

  it('does not treat test-only operations as durable writes', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-test-only',
        namespace: 'core.workspace',
        type: 'document.metadata.assert',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'test',
            path: '/docsById/doc-code/name',
            value: 'main.ts',
          },
        ],
        reverseOps: [
          {
            op: 'test',
            path: '/docsById/doc-code/name',
            value: 'main.ts',
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('rejects route document role mismatches after persistent apply', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-route-document-role',
        namespace: 'core.route',
        type: 'manifest.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'route',
        forwardOps: [
          {
            op: 'replace',
            path: '/routeManifest',
            value: {
              version: '1',
              root: { id: 'root', pageDocId: 'doc-code' },
            },
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/routeManifest',
            value: workspace.routeManifest,
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });
});
