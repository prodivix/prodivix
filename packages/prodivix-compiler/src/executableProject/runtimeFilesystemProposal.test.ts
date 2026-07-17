import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '@prodivix/pir';
import { createExecutionFilesystemDiff } from '@prodivix/runtime-core';
import {
  applyWorkspaceTransaction,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import {
  analyzeWorkspaceRuntimeFilesystemDiff,
  createWorkspaceRuntimeFilesystemProposal,
} from './runtimeFilesystemProposal';
import { augmentWorkspaceOperationWithControlledSource } from '../react/controlledRoundTrip';

const workspace = (): WorkspaceSnapshot => ({
  id: 'workspace-1',
  workspaceRev: 4,
  routeRev: 1,
  opSeq: 3,
  treeRootId: 'root',
  treeById: {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'code-node', 'delete-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'page.pir.json',
      parentId: 'root',
      docId: 'page-1',
    },
    'code-node': {
      id: 'code-node',
      kind: 'doc',
      name: 'main.ts',
      parentId: 'root',
      docId: 'code-1',
    },
    'delete-node': {
      id: 'delete-node',
      kind: 'doc',
      name: 'old.ts',
      parentId: 'root',
      docId: 'code-2',
    },
  },
  docsById: {
    'page-1': {
      id: 'page-1',
      type: 'pir-page',
      path: '/page.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createEmptyPirDocument({ rootId: 'page-root' }),
    },
    'code-1': {
      id: 'code-1',
      type: 'code',
      path: '/main.ts',
      contentRev: 2,
      metaRev: 3,
      content: { language: 'ts', source: 'export const value = 1;\n' },
    },
    'code-2': {
      id: 'code-2',
      type: 'code',
      path: '/old.ts',
      contentRev: 5,
      metaRev: 2,
      content: { language: 'ts', source: 'export const old = true;\n' },
    },
  },
  routeManifest: {
    version: '1',
    root: { id: 'route-root', pageDocId: 'page-1' },
  },
});

const snapshotDigest = `sha256-${'a'.repeat(64)}`;

const diff = (
  overrides: Partial<Parameters<typeof createExecutionFilesystemDiff>[0]> = {}
) =>
  createExecutionFilesystemDiff({
    snapshotDigest,
    workspace: {
      workspaceId: 'workspace-1',
      snapshotId: 'snapshot-1',
      partitionRevisions: {
        workspace: '4',
        route: '1',
        'document:code-1:content': '2',
        'document:code-1:meta': '3',
        'document:code-2:content': '5',
        'document:code-2:meta': '2',
      },
    },
    capturedAt: 1_000,
    complete: true,
    changes: [
      {
        kind: 'modified',
        path: 'src/main.ts',
        baseline: { contents: Buffer.from('export const value = 1;\n') },
        runtime: { contents: Buffer.from('export const value = 2;\n') },
        sourceTrace: [
          { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
        ],
      },
    ],
    ...overrides,
  });

describe('runtime filesystem Workspace proposal', () => {
  it('creates one reversible atomic transaction for explicit safe selections', () => {
    const current = workspace();
    const observed = diff();
    const result = createWorkspaceRuntimeFilesystemProposal({
      workspace: current,
      diff: observed,
      selectedChangeIds: [observed.changes[0]!.changeId],
      transactionId: 'runtime-adopt-1',
      issuedAt: '2026-07-17T00:00:00.000Z',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const applied = applyWorkspaceTransaction(current, result.transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById['code-1']?.content).toMatchObject({
      source: 'export const value = 2;\n',
    });
    expect(result.transaction.commands[0]?.reverseOps).toEqual([
      {
        op: 'replace',
        path: '/source',
        value: 'export const value = 1;\n',
      },
    ]);
  });

  it('creates and deletes CodeArtifacts through ordered reversible VFS commands', () => {
    const current = workspace();
    const observed = diff({
      changes: [
        {
          kind: 'added',
          path: 'runtime/generated.ts',
          runtime: {
            contents: Buffer.from('export const generated = true;\n'),
          },
        },
        {
          kind: 'added',
          path: 'runtime/helper.js',
          runtime: { contents: Buffer.from('export const helper = true;\n') },
        },
        {
          kind: 'modified',
          path: 'src/main.ts',
          baseline: { contents: Buffer.from('export const value = 1;\n') },
          runtime: { contents: Buffer.from('export const value = 2;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });
    const analysis = analyzeWorkspaceRuntimeFilesystemDiff(current, observed);
    expect(analysis.entries).toEqual([
      expect.objectContaining({
        kind: 'added',
        status: 'eligible',
        documentId: expect.stringMatching(/^runtime-code:/),
      }),
      expect.objectContaining({
        kind: 'added',
        status: 'eligible',
        documentId: expect.stringMatching(/^runtime-code:/),
      }),
      expect.objectContaining({
        kind: 'modified',
        status: 'eligible',
        documentId: 'code-1',
      }),
      expect.objectContaining({
        kind: 'deleted',
        status: 'eligible',
        documentId: 'code-2',
      }),
    ]);
    const result = createWorkspaceRuntimeFilesystemProposal({
      workspace: current,
      diff: observed,
      selectedChangeIds: analysis.eligibleChangeIds,
      transactionId: 'runtime-vfs-adopt-1',
      issuedAt: '2026-07-17T00:00:00.000Z',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(
      augmentWorkspaceOperationWithControlledSource({
        workspace: current,
        operation: { kind: 'transaction', transaction: result.transaction },
      }).status
    ).toBe('ready');
    expect(result.transaction.commands.map((command) => command.type)).toEqual([
      'code-document.create',
      'code-document.create',
      'source.update',
      'code-document.delete',
    ]);
    const applied = applyWorkspaceTransaction(current, result.transaction);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const createdDocumentId = analysis.entries[0]!.documentId!;
    expect(applied.snapshot.docsById[createdDocumentId]).toMatchObject({
      type: 'code',
      path: '/runtime/generated.ts',
      content: {
        language: 'ts',
        source: 'export const generated = true;\n',
      },
    });
    const helperDocumentId = analysis.entries[1]!.documentId!;
    expect(applied.snapshot.docsById[helperDocumentId]).toMatchObject({
      type: 'code',
      path: '/runtime/helper.js',
      content: {
        language: 'js',
        source: 'export const helper = true;\n',
      },
    });
    expect(applied.snapshot.docsById['code-1']?.content).toMatchObject({
      source: 'export const value = 2;\n',
    });
    expect(applied.snapshot.docsById['code-2']).toBeUndefined();

    const reverse: WorkspaceTransactionEnvelope = {
      id: 'runtime-vfs-adopt-1:reverse',
      workspaceId: current.id,
      issuedAt: '2026-07-17T00:00:01.000Z',
      commands: [...result.transaction.commands]
        .reverse()
        .map((command, index): WorkspaceCommandEnvelope => ({
          ...command,
          id: `runtime-vfs-adopt-1:reverse:${index + 1}`,
          forwardOps: command.reverseOps,
          reverseOps: command.forwardOps,
        })),
    };
    const reversed = applyWorkspaceTransaction(applied.snapshot, reverse);
    expect(reversed.ok).toBe(true);
    if (reversed.ok) expect(reversed.snapshot).toEqual(current);
  });

  it('blocks stale revisions, baseline drift, and incomplete captures', () => {
    const stale = diff({
      workspace: {
        workspaceId: 'workspace-1',
        snapshotId: 'snapshot-1',
        partitionRevisions: {
          workspace: '4',
          route: '1',
          'document:code-1:content': '1',
          'document:code-1:meta': '3',
        },
      },
    });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), stale).entries[0]
    ).toMatchObject({ status: 'blocked', reason: 'stale-content-revision' });

    const drifted = diff({
      changes: [
        {
          kind: 'modified',
          path: 'src/main.ts',
          baseline: { contents: Buffer.from('export const value = 0;\n') },
          runtime: { contents: Buffer.from('export const value = 2;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
      ],
    });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), drifted).entries[0]
    ).toMatchObject({ status: 'blocked', reason: 'baseline-drift' });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(
        workspace(),
        diff({ complete: false })
      ).entries[0]
    ).toMatchObject({ status: 'blocked', reason: 'incomplete-capture' });

    const staleWorkspace = diff({
      workspace: {
        ...diff().workspace,
        partitionRevisions: {
          ...diff().workspace.partitionRevisions,
          workspace: '3',
        },
      },
      changes: [
        {
          kind: 'added',
          path: 'runtime/new.ts',
          runtime: { contents: Buffer.from('export {};\n') },
        },
      ],
    });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), staleWorkspace)
        .entries[0]
    ).toMatchObject({
      status: 'blocked',
      reason: 'stale-workspace-revision',
    });

    const staleRoute = diff({
      workspace: {
        ...diff().workspace,
        partitionRevisions: {
          ...diff().workspace.partitionRevisions,
          route: '0',
        },
      },
      changes: [
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), staleRoute).entries[0]
    ).toMatchObject({
      status: 'blocked',
      reason: 'stale-route-revision',
    });

    const pathConflict = diff({
      changes: [
        {
          kind: 'added',
          path: 'main.ts',
          runtime: { contents: Buffer.from('export {};\n') },
        },
      ],
    });
    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), pathConflict)
        .entries[0]
    ).toMatchObject({ status: 'blocked', reason: 'path-conflict' });
  });

  it('blocks unsafe paths, missing owners, ambiguous traces, and binary observations', () => {
    const observed = diff({
      changes: [
        {
          kind: 'added',
          path: 'added.txt',
          runtime: { contents: Buffer.from('export {};') },
        },
        {
          kind: 'modified',
          path: 'ambiguous.ts',
          baseline: { contents: Buffer.from('export const value = 1;\n') },
          runtime: { contents: Buffer.from('export const value = 2;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
            { sourceRef: { kind: 'document', documentId: 'code-1' } },
          ],
        },
        {
          kind: 'modified',
          path: 'binary.ts',
          baseline: { contents: Buffer.from('export const value = 1;\n') },
          runtime: { contents: new Uint8Array([0xff]) },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-1' } },
          ],
        },
        {
          kind: 'deleted',
          path: 'deleted.ts',
          baseline: { contents: Buffer.from('export {};') },
        },
      ],
    });

    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(workspace(), observed).entries.map(
        (entry) => entry.reason
      )
    ).toEqual([
      'unsupported-code-path',
      'ambiguous-source-trace',
      'binary-content',
      'missing-source-trace',
    ]);
  });

  it('blocks deletion while a canonical CodeSlot still owns the artifact', () => {
    const current = workspace();
    const page = current.docsById['page-1']!;
    const pageContent = createEmptyPirDocument({ rootId: 'page-root' });
    pageContent.ui.graph.nodesById['page-root'] = {
      ...pageContent.ui.graph.nodesById['page-root']!,
      events: {
        click: {
          kind: 'call-code',
          slotId: 'blueprint.page-1.page-root.click',
          reference: { artifactId: 'code-2' },
        },
      },
    };
    current.docsById['page-1'] = { ...page, content: pageContent };
    const observed = diff({
      changes: [
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });

    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(current, observed).entries[0]
    ).toMatchObject({
      status: 'blocked',
      documentId: 'code-2',
      reason: 'active-code-artifact',
    });
  });

  it('honors canonical VFS deletion rejection for a route-owned document', () => {
    const current = workspace();
    current.routeManifest = {
      version: '1',
      root: { id: 'route-root', pageDocId: 'code-2' },
    };
    const observed = diff({
      changes: [
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });

    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(current, observed).entries[0]
    ).toMatchObject({
      status: 'blocked',
      documentId: 'code-2',
      reason: 'operation-rejected',
    });
  });

  it('blocks deletion of a controlled PIR code projection', () => {
    const current = workspace();
    const code = current.docsById['code-2']!;
    current.docsById['code-2'] = {
      ...code,
      content: {
        language: 'ts',
        source: 'export const old = true;\n',
        metadata: {
          'prodivix.controlledSource': {
            schemaVersion: '1.0',
            unmanagedOwnership: 'code-owned',
            regions: [],
          },
        },
      },
    };
    const observed = diff({
      changes: [
        {
          kind: 'deleted',
          path: 'src/old.ts',
          baseline: { contents: Buffer.from('export const old = true;\n') },
          sourceTrace: [
            { sourceRef: { kind: 'code-artifact', artifactId: 'code-2' } },
          ],
        },
      ],
    });

    expect(
      analyzeWorkspaceRuntimeFilesystemDiff(current, observed).entries[0]
    ).toMatchObject({
      status: 'blocked',
      documentId: 'code-2',
      reason: 'controlled-code-artifact',
    });
  });
});
