import { describe, expect, it } from 'vitest';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceOperation,
} from '@prodivix/workspace';
import { planWorkspaceOperationCommit } from '../workspaceOperationCommit';
import {
  codeCommand,
  createWorkspace,
  issuedAt,
} from './workspaceOperationCommit.fixture';
import {
  createNodeGraphContent,
  createWorkspace as createPirWorkspace,
} from './testWorkspace';

const createNodeGraphCommand = (
  workspaceId: string,
  documentId: string,
  id: string,
  before: ReturnType<typeof createNodeGraphContent>['nodes'],
  after: ReturnType<typeof createNodeGraphContent>['nodes']
): WorkspaceCommandEnvelope => ({
  id,
  namespace: 'core.nodegraph',
  type: 'document.update',
  version: '1.0',
  issuedAt,
  target: { workspaceId, documentId },
  domainHint: 'nodegraph',
  forwardOps: [{ op: 'replace', path: '/nodes', value: after }],
  reverseOps: [{ op: 'replace', path: '/nodes', value: before }],
});

describe('planWorkspaceOperationCommit', () => {
  it('keeps a document-only command independent from workspace and route revisions', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: codeCommand(
        'operation-code',
        'export const value = 1;',
        'export const value = 2;'
      ),
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toEqual({
      ok: true,
      request: {
        expected: {
          documents: [{ id: 'doc-code', contentRev: 5 }],
        },
        operation,
      },
    });
  });

  it('rejects commits that would exceed the JSON safe revision range', () => {
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: codeCommand(
        'operation-capacity',
        'export const value = 1;',
        'export const value = 2;'
      ),
    };
    const exhaustedSequence = createWorkspace();
    exhaustedSequence.opSeq = Number.MAX_SAFE_INTEGER;
    expect(
      planWorkspaceOperationCommit(exhaustedSequence, operation)
    ).toMatchObject({
      ok: false,
      issues: [{ path: '/workspace/opSeq' }],
    });

    const exhaustedDocument = createWorkspace();
    exhaustedDocument.docsById['doc-code']!.contentRev =
      Number.MAX_SAFE_INTEGER;
    expect(
      planWorkspaceOperationCommit(exhaustedDocument, operation)
    ).toMatchObject({
      ok: false,
      issues: [
        {
          path: '/workspace/docsById/doc-code/contentRev',
          documentId: 'doc-code',
        },
      ],
    });

    const exhaustedNoOpDocument = createWorkspace();
    exhaustedNoOpDocument.docsById['doc-code']!.contentRev =
      Number.MAX_SAFE_INTEGER;
    const noOp: WorkspaceOperation = {
      kind: 'command',
      command: codeCommand(
        'operation-capacity-no-op',
        'export const value = 1;',
        'export const value = 1;'
      ),
    };
    expect(
      planWorkspaceOperationCommit(exhaustedNoOpDocument, noOp)
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });

    const unscopedWorkspace = createWorkspace();
    unscopedWorkspace.workspaceRev = Number.MAX_SAFE_INTEGER;
    expect(planWorkspaceOperationCommit(unscopedWorkspace, operation)).toEqual({
      ok: true,
      request: {
        expected: {
          documents: [{ id: 'doc-code', contentRev: 5 }],
        },
        operation,
      },
    });
  });

  it('treats stable-id array reordering as an exact durable content change', () => {
    const before = createNodeGraphContent();
    const after = structuredClone(before);
    after.nodes.reverse();
    const workspace = createPirWorkspace(before, 'pir-graph');
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: createNodeGraphCommand(
        workspace.id,
        'document-1',
        'operation-reorder-graphs',
        before.nodes,
        after.nodes
      ),
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toEqual({
      ok: true,
      request: {
        expected: {
          documents: [{ id: 'document-1', contentRev: 1 }],
        },
        operation,
      },
    });
  });

  it('checks every exact document delta in a mixed transaction for capacity', () => {
    const firstBefore = createNodeGraphContent();
    const firstAfter = structuredClone(firstBefore);
    firstAfter.nodes.reverse();
    const secondBefore = createNodeGraphContent();
    const secondAfter = structuredClone(secondBefore);
    secondAfter.nodes[0]!.data.label = 'Changed';
    const workspace = createPirWorkspace(firstBefore, 'pir-graph');
    workspace.docsById['document-1']!.contentRev = Number.MAX_SAFE_INTEGER;
    workspace.docsById['document-2'] = {
      ...workspace.docsById['document-1']!,
      id: 'document-2',
      path: '/page-2.pir.json',
      contentRev: 1,
      content: secondBefore,
    };
    const root = workspace.treeById.root;
    if (!root || root.kind !== 'dir') {
      throw new Error('Expected a workspace root directory.');
    }
    root.children = [...(root.children ?? []), 'document-node-2'];
    workspace.treeById['document-node-2'] = {
      id: 'document-node-2',
      kind: 'doc',
      name: 'page-2.pir.json',
      parentId: root.id,
      docId: 'document-2',
    };
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-mixed-capacity',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          createNodeGraphCommand(
            workspace.id,
            'document-1',
            'operation-mixed-capacity:reorder',
            firstBefore.nodes,
            firstAfter.nodes
          ),
          createNodeGraphCommand(
            workspace.id,
            'document-2',
            'operation-mixed-capacity:change',
            secondBefore.nodes,
            secondAfter.nodes
          ),
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [
        {
          path: '/workspace/docsById/document-1/contentRev',
          documentId: 'document-1',
        },
      ],
    });
  });

  it('requires workspace and route revisions for a route command', () => {
    const workspace = createWorkspace();
    const nextManifest = {
      version: '1' as const,
      root: {
        id: 'root',
        children: [{ id: 'route-about', segment: 'about' }],
      },
    };
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-route',
        namespace: 'core.route',
        type: 'manifest.update',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'route',
        forwardOps: [
          { op: 'replace', path: '/routeManifest', value: nextManifest },
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

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result).toMatchObject({
      ok: true,
      request: {
        expected: { workspaceRev: 8, routeRev: 4, documents: [] },
      },
    });
  });

  it.each([
    ['unknown field', { version: '1', root: { id: 'root' }, serverOnly: true }],
    [
      'module key mismatch',
      {
        version: '1',
        root: { id: 'root' },
        modules: {
          canonical: {
            moduleId: 'different',
            version: '1',
            root: { id: 'module-root' },
          },
        },
      },
    ],
  ])(
    'rejects a RouteManifest with %s after applying the operation',
    (_name, manifest) => {
      const workspace = createWorkspace();
      const operation: WorkspaceOperation = {
        kind: 'command',
        command: {
          id: 'operation-invalid-route-manifest',
          namespace: 'core.route',
          type: 'manifest.update',
          version: '1.0',
          issuedAt,
          target: { workspaceId: workspace.id },
          domainHint: 'route',
          forwardOps: [
            { op: 'replace', path: '/routeManifest', value: manifest },
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
    }
  );

  it('plans the union of mixed transaction partitions once', () => {
    const workspace = createWorkspace();
    const newDocument = {
      id: 'doc-new',
      type: 'code' as const,
      name: 'new.ts',
      path: '/new.ts',
      contentRev: 1,
      metaRev: 1,
      content: { language: 'ts' as const, source: '' },
    };
    const nextManifest = {
      version: '1' as const,
      root: {
        id: 'root',
        children: [{ id: 'route-about', segment: 'about' }],
      },
    };
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-mixed',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          {
            id: 'operation-mixed:workspace',
            namespace: 'core.workspace',
            type: 'document.create',
            version: '1.0',
            issuedAt,
            target: { workspaceId: workspace.id },
            domainHint: 'workspace',
            forwardOps: [
              { op: 'add', path: '/docsById/doc-new', value: newDocument },
              {
                op: 'add',
                path: '/treeById/node-new',
                value: {
                  id: 'node-new',
                  kind: 'doc',
                  name: 'new.ts',
                  parentId: 'root',
                  docId: 'doc-new',
                },
              },
              {
                op: 'add',
                path: '/treeById/root/children/-',
                value: 'node-new',
              },
            ],
            reverseOps: [
              { op: 'remove', path: '/treeById/root/children/1' },
              { op: 'remove', path: '/treeById/node-new' },
              { op: 'remove', path: '/docsById/doc-new' },
            ],
          },
          {
            id: 'operation-mixed:route',
            namespace: 'core.route',
            type: 'manifest.update',
            version: '1.0',
            issuedAt,
            target: { workspaceId: workspace.id },
            domainHint: 'route',
            forwardOps: [
              { op: 'replace', path: '/routeManifest', value: nextManifest },
            ],
            reverseOps: [
              {
                op: 'replace',
                path: '/routeManifest',
                value: workspace.routeManifest,
              },
            ],
          },
          codeCommand(
            'operation-mixed:code',
            'export const value = 1;',
            'export const value = 2;'
          ),
        ],
      },
    };

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result).toMatchObject({
      ok: true,
      request: {
        expected: {
          workspaceRev: 8,
          routeRev: 4,
          documents: [
            { id: 'doc-code', contentRev: 5 },
            { id: 'doc-new', contentRev: null, metaRev: null },
          ],
        },
      },
    });
  });

  it('uses one base content revision for repeated commands on one document', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-two-code-commands',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          codeCommand(
            'operation-two-code-commands:1',
            'export const value = 1;',
            'export const value = 2;'
          ),
          codeCommand(
            'operation-two-code-commands:2',
            'export const value = 2;',
            'export const value = 3;'
          ),
        ],
      },
    };

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result).toMatchObject({
      ok: true,
      request: {
        expected: {
          documents: [{ id: 'doc-code', contentRev: 5 }],
        },
      },
    });
  });

  it('rejects a pure test operation with no persistent authoring delta', () => {
    const workspace = createWorkspace();
    const source = 'export const value = 1;';
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        ...codeCommand('operation-test-only', source, source),
        forwardOps: [{ op: 'test', path: '/source', value: source }],
        reverseOps: [{ op: 'test', path: '/source', value: source }],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('rejects replacing a persistent value with the same value', () => {
    const workspace = createWorkspace();
    const source = 'export const value = 1;';
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: codeCommand('operation-same-value', source, source),
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('rejects a transaction whose commands return persistent state to its base', () => {
    const workspace = createWorkspace();
    const before = 'export const value = 1;';
    const intermediate = 'export const value = 2;';
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-change-and-restore',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          codeCommand(
            'operation-change-and-restore:change',
            before,
            intermediate
          ),
          codeCommand(
            'operation-change-and-restore:restore',
            intermediate,
            before
          ),
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_EMPTY_WRITE_SET' }],
    });
  });

  it('keeps a test-only document command as a CAS dependency of a mutating transaction', () => {
    const workspace = createWorkspace();
    const guardSource = 'export const guard = 1;';
    workspace.docsById['doc-guard'] = {
      id: 'doc-guard',
      type: 'code',
      name: 'guard.ts',
      path: '/guard.ts',
      contentRev: 7,
      metaRev: 1,
      content: { language: 'ts', source: guardSource },
    };
    workspace.treeById['node-guard'] = {
      id: 'node-guard',
      kind: 'doc',
      name: 'guard.ts',
      parentId: 'root',
      docId: 'doc-guard',
    };
    workspace.treeById.root!.children!.push('node-guard');
    const guardCommand: WorkspaceCommandEnvelope = {
      id: 'operation-guarded-change:guard',
      namespace: 'core.code',
      type: 'source.guard',
      version: '1.0',
      issuedAt,
      target: { workspaceId: workspace.id, documentId: 'doc-guard' },
      domainHint: 'code',
      forwardOps: [{ op: 'test', path: '/source', value: guardSource }],
      reverseOps: [{ op: 'test', path: '/source', value: guardSource }],
    };
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-guarded-change',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          guardCommand,
          codeCommand(
            'operation-guarded-change:mutation',
            'export const value = 1;',
            'export const value = 2;'
          ),
        ],
      },
    };

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result).toMatchObject({
      ok: true,
      request: {
        expected: {
          documents: [
            { id: 'doc-code', contentRev: 5 },
            { id: 'doc-guard', contentRev: 7 },
          ],
        },
      },
    });
  });

  it('sorts expected document ids by Unicode code point, independent of locale', () => {
    const workspace = createWorkspace();
    const documentEntries = [
      ['é', 'node-e', 'e.ts'],
      ['𐀀', 'node-astral', 'astral.ts'],
    ] as const;
    documentEntries.forEach(([documentId, nodeId, name]) => {
      workspace.docsById[documentId] = {
        id: documentId,
        type: 'code',
        name,
        path: `/${name}`,
        contentRev: 1,
        metaRev: 1,
        content: { language: 'ts', source: '' },
      };
      workspace.treeById[nodeId] = {
        id: nodeId,
        kind: 'doc',
        name,
        parentId: 'root',
        docId: documentId,
      };
      workspace.treeById.root!.children!.push(nodeId);
    });
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-unicode-order',
        workspaceId: workspace.id,
        issuedAt,
        commands: documentEntries.map(([documentId]) => ({
          id: `operation-unicode-order:${documentId}`,
          namespace: 'core.code',
          type: 'source.update',
          version: '1.0',
          issuedAt,
          target: { workspaceId: workspace.id, documentId },
          domainHint: 'code' as const,
          forwardOps: [{ op: 'replace' as const, path: '/source', value: 'x' }],
          reverseOps: [{ op: 'replace' as const, path: '/source', value: '' }],
        })),
      },
    };

    const result = planWorkspaceOperationCommit(workspace, operation);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.expected.documents.map(({ id }) => id)).toEqual([
      'é',
      '𐀀',
    ]);
  });

  it.each([
    ['mismatched identity', { id: 'different-id', contentRev: 1, metaRev: 1 }],
    ['non-initial revisions', { id: 'doc-new', contentRev: 2, metaRev: 1 }],
  ])('rejects whole-document add with %s', (_name, identity) => {
    const workspace = createWorkspace();
    const newDocument = {
      ...identity,
      type: 'code' as const,
      name: 'new.ts',
      path: '/new.ts',
      content: { language: 'ts' as const, source: '' },
    };
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-invalid-add',
        namespace: 'core.workspace',
        type: 'document.create',
        version: '1.0',
        issuedAt,
        target: { workspaceId: workspace.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'add', path: '/docsById/doc-new', value: newDocument },
          {
            op: 'add',
            path: '/treeById/node-new',
            value: {
              id: 'node-new',
              kind: 'doc',
              name: 'new.ts',
              parentId: 'root',
              docId: 'doc-new',
            },
          },
          {
            op: 'add',
            path: '/treeById/root/children/-',
            value: 'node-new',
          },
        ],
        reverseOps: [
          { op: 'remove', path: '/treeById/root/children/1' },
          { op: 'remove', path: '/treeById/node-new' },
          { op: 'remove', path: '/docsById/doc-new' },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID' }],
    });
  });

  it('rejects non-canonical document capabilities before transport', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'operation-invalid-capabilities',
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
            value: [' code.author '],
          },
        ],
        reverseOps: [{ op: 'remove', path: '/docsById/doc-code/capabilities' }],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });

  it('requires a custom document namespace to declare its domain', () => {
    const workspace = createWorkspace();
    const command = codeCommand(
      'operation-custom-domain',
      'export const value = 1;',
      'export const value = 2;'
    );
    command.namespace = 'vendor.custom';
    delete command.domainHint;

    expect(
      planWorkspaceOperationCommit(workspace, { kind: 'command', command })
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_OPERATION_INVALID' }],
    });
  });

  it('rejects structural add followed by content writes to the same document', () => {
    const workspace = createWorkspace();
    const newDocument = {
      id: 'doc-new',
      type: 'code' as const,
      name: 'new.ts',
      path: '/new.ts',
      contentRev: 1,
      metaRev: 1,
      content: { language: 'ts' as const, source: '' },
    };
    const operation: WorkspaceOperation = {
      kind: 'transaction',
      transaction: {
        id: 'operation-add-then-write',
        workspaceId: workspace.id,
        issuedAt,
        commands: [
          {
            id: 'operation-add-then-write:add',
            namespace: 'core.workspace',
            type: 'document.create',
            version: '1.0',
            issuedAt,
            target: { workspaceId: workspace.id },
            domainHint: 'workspace',
            forwardOps: [
              { op: 'add', path: '/docsById/doc-new', value: newDocument },
              {
                op: 'add',
                path: '/treeById/node-new',
                value: {
                  id: 'node-new',
                  kind: 'doc',
                  name: 'new.ts',
                  parentId: 'root',
                  docId: 'doc-new',
                },
              },
              {
                op: 'add',
                path: '/treeById/root/children/-',
                value: 'node-new',
              },
            ],
            reverseOps: [
              { op: 'remove', path: '/treeById/root/children/1' },
              { op: 'remove', path: '/treeById/node-new' },
              { op: 'remove', path: '/docsById/doc-new' },
            ],
          },
          {
            id: 'operation-add-then-write:content',
            namespace: 'core.code',
            type: 'source.update',
            version: '1.0',
            issuedAt,
            target: {
              workspaceId: workspace.id,
              documentId: 'doc-new',
            },
            domainHint: 'code',
            forwardOps: [
              { op: 'replace', path: '/source', value: 'export {};' },
            ],
            reverseOps: [{ op: 'replace', path: '/source', value: '' }],
          },
        ],
      },
    };

    expect(planWorkspaceOperationCommit(workspace, operation)).toMatchObject({
      ok: false,
      issues: [{ code: 'WKS_SYNC_COMMIT_DOCUMENT_STATE_INVALID' }],
    });
  });
});
