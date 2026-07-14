import { describe, expect, it } from 'vitest';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceDocument,
  WorkspaceOperation,
} from '@prodivix/workspace';
import { projectWorkspaceOperationToCommitWire } from '../workspaceOperationCommitPirWire';
import { createWorkspaceOutboxEntry } from '../workspaceOutbox';
import { createPirContent, createWorkspace } from './testWorkspace';

const issuedAt = '2026-07-14T00:00:00.000Z';

const graphCommand = (): WorkspaceCommandEnvelope => {
  const before = createPirContent().ui.graph;
  const after = {
    ...before,
    nodesById: {
      ...before.nodesById,
      root: { ...before.nodesById.root, type: 'section' },
    },
  };
  return {
    id: 'pir-graph-update',
    namespace: 'core.pir',
    type: 'graph.update',
    version: '1.0',
    issuedAt,
    target: { workspaceId: 'workspace-1', documentId: 'document-1' },
    domainHint: 'pir',
    forwardOps: [
      { op: 'test', path: '/ui/graph', value: before },
      { op: 'replace', path: '/ui/graph', value: after },
    ],
    reverseOps: [
      { op: 'test', path: '/ui/graph', value: after },
      { op: 'replace', path: '/ui/graph', value: before },
    ],
  };
};

describe('PIR Atomic Commit wire projection', () => {
  it('keeps outbox operations domain-canonical and exact requests wire-canonical', () => {
    const workspace = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: graphCommand(),
    };
    const created = createWorkspaceOutboxEntry({
      baseSnapshot: workspace,
      operation,
      now: 1,
    });
    expect(created.ok).toBe(true);
    if (
      !created.ok ||
      created.entry.operation.kind !== 'command' ||
      created.entry.request.operation.kind !== 'command'
    ) {
      return;
    }

    for (const patch of [
      ...created.entry.operation.command.forwardOps,
      ...created.entry.operation.command.reverseOps,
    ]) {
      expect(patch.value).not.toHaveProperty('version');
    }
    for (const patch of [
      ...created.entry.request.operation.command.forwardOps,
      ...created.entry.request.operation.command.reverseOps,
    ]) {
      expect(patch.value).toHaveProperty('version');
    }
  });

  it('projects whole PIR document creation without mutating the domain value', () => {
    const before = createWorkspace();
    const document: WorkspaceDocument = {
      id: 'component-1',
      type: 'pir-component',
      path: '/components/card.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: createPirContent(),
    };
    const after = {
      ...before,
      docsById: { ...before.docsById, [document.id]: document },
    };
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'component-create',
        namespace: 'core.workspace',
        type: 'document.create',
        version: '1.0',
        issuedAt,
        target: { workspaceId: before.id },
        domainHint: 'workspace',
        forwardOps: [
          { op: 'add', path: `/docsById/${document.id}`, value: document },
        ],
        reverseOps: [{ op: 'remove', path: `/docsById/${document.id}` }],
      },
    };

    const projected = projectWorkspaceOperationToCommitWire(
      before,
      after,
      operation
    );
    if (projected.kind !== 'command') return;
    const projectedDocument = projected.command.forwardOps[0]
      ?.value as WorkspaceDocument;

    expect(document.content).not.toHaveProperty('version');
    expect(projectedDocument.content).toHaveProperty('version');
  });

  it('projects workspace-level PIR content replacements through the same codec', () => {
    const before = createWorkspace();
    const operation: WorkspaceOperation = {
      kind: 'command',
      command: {
        id: 'content-replace',
        namespace: 'core.workspace',
        type: 'document.content.replace',
        version: '1.0',
        issuedAt,
        target: { workspaceId: before.id },
        domainHint: 'workspace',
        forwardOps: [
          {
            op: 'replace',
            path: '/docsById/document-1/content',
            value: createPirContent(),
          },
        ],
        reverseOps: [
          {
            op: 'replace',
            path: '/docsById/document-1/content',
            value: createPirContent(),
          },
        ],
      },
    };

    const projected = projectWorkspaceOperationToCommitWire(
      before,
      before,
      operation
    );
    if (projected.kind !== 'command') return;

    expect(projected.command.forwardOps[0]?.value).toHaveProperty('version');
    expect(projected.command.reverseOps[0]?.value).toHaveProperty('version');
  });
});
