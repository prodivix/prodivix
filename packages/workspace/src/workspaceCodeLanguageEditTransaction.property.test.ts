import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CodeLanguageTextEdit } from '@prodivix/authoring';
import {
  WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES,
  applyWorkspaceTransaction,
  createWorkspaceCodeLanguageEditTransactionPlan,
  createWorkspaceHistoryState,
  createWorkspaceTransactionOperation,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  type WorkspaceSnapshot,
} from './index';

const ISSUED_AT = '2026-07-14T00:00:00.000Z';

const createWorkspace = (): WorkspaceSnapshot => ({
  id: 'workspace-code-language',
  workspaceRev: 7,
  routeRev: 2,
  opSeq: 11,
  treeRootId: 'root',
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
      children: ['alpha-node', 'consumer-node', 'config-node'],
    },
    'alpha-node': {
      id: 'alpha-node',
      kind: 'doc',
      name: 'alpha.ts',
      parentId: 'src',
      docId: 'code-alpha',
    },
    'consumer-node': {
      id: 'consumer-node',
      kind: 'doc',
      name: 'consumer.ts',
      parentId: 'src',
      docId: 'code-consumer',
    },
    'config-node': {
      id: 'config-node',
      kind: 'doc',
      name: 'project.json',
      parentId: 'src',
      docId: 'project-config',
    },
  },
  docsById: {
    'code-alpha': {
      id: 'code-alpha',
      type: 'code',
      path: '/src/alpha.ts',
      contentRev: 3,
      metaRev: 1,
      content: {
        language: 'ts',
        source: 'export const alpha = 1;\r\nalpha;\r\n',
      },
    },
    'code-consumer': {
      id: 'code-consumer',
      type: 'code',
      path: '/src/consumer.ts',
      contentRev: 5,
      metaRev: 1,
      content: {
        language: 'ts',
        source: "import { alpha } from '/src/alpha';\nalpha;\n",
      },
    },
    'project-config': {
      id: 'project-config',
      type: 'project-config',
      path: '/src/project.json',
      contentRev: 1,
      metaRev: 1,
      content: { kind: 'config', value: {} },
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const edit = (
  artifactId: string,
  expectedRevision: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
  newText = 'beta'
): CodeLanguageTextEdit => ({
  artifactId,
  expectedRevision,
  sourceSpan: {
    artifactId,
    startLine,
    startColumn,
    endLine,
    endColumn,
  },
  newText,
});

const renameEdits = Object.freeze([
  edit('code-alpha', '3', 1, 14, 1, 19),
  edit('code-alpha', '3', 2, 1, 2, 6),
  edit('code-consumer', '5', 1, 10, 1, 15),
  edit('code-consumer', '5', 2, 1, 2, 6),
]);

const editOrderArbitrary = fc
  .tuple(fc.integer(), fc.integer(), fc.integer(), fc.integer())
  .map((priorities) =>
    renameEdits
      .map((current, index) => ({ current, index, rank: priorities[index]! }))
      .sort((left, right) => left.rank - right.rank || left.index - right.index)
      .map(({ current }) => current)
  );

describe('Workspace Code Language edit transaction properties', () => {
  it('plans order-invariant multi-artifact edits and round-trips History', () => {
    const workspace = createWorkspace();
    const baseline = createWorkspaceCodeLanguageEditTransactionPlan({
      workspace,
      transactionId: 'rename-alpha-to-beta',
      issuedAt: ISSUED_AT,
      edits: renameEdits,
    });
    expect(baseline.status).toBe('ready');
    if (baseline.status !== 'ready') return;

    fc.assert(
      fc.property(editOrderArbitrary, (edits) => {
        const result = createWorkspaceCodeLanguageEditTransactionPlan({
          workspace,
          transactionId: 'rename-alpha-to-beta',
          issuedAt: ISSUED_AT,
          edits,
        });
        expect(result).toEqual(baseline);
        if (result.status !== 'ready') return;

        expect(result.plan.documentIds).toEqual([
          'code-alpha',
          'code-consumer',
        ]);
        expect(result.plan.transaction.commands).toHaveLength(2);
        expect(
          result.plan.transaction.commands.map(
            ({ target }) => target.documentId
          )
        ).toEqual(['code-alpha', 'code-consumer']);
        const applied = applyWorkspaceTransaction(
          workspace,
          result.plan.transaction
        );
        expect(applied.ok).toBe(true);
        if (!applied.ok) return;
        expect(applied.snapshot.docsById['code-alpha']?.content).toEqual({
          language: 'ts',
          source: 'export const beta = 1;\r\nbeta;\r\n',
        });
        expect(applied.snapshot.docsById['code-consumer']?.content).toEqual({
          language: 'ts',
          source: "import { beta } from '/src/alpha';\nbeta;\n",
        });

        const operation = createWorkspaceTransactionOperation(
          result.plan.transaction
        );
        const history = recordWorkspaceOperation(
          createWorkspaceHistoryState(),
          operation
        );
        const scope = {
          kind: 'workspace' as const,
          workspaceId: workspace.id,
        };
        const undone = undoWorkspaceHistory(applied.snapshot, history, scope);
        expect(undone.ok).toBe(true);
        if (!undone.ok) return;
        expect(undone.snapshot.docsById).toEqual(workspace.docsById);

        const redone = redoWorkspaceHistory(
          undone.snapshot,
          undone.history,
          scope
        );
        expect(redone.ok).toBe(true);
        if (!redone.ok) return;
        expect(redone.snapshot.docsById).toEqual(applied.snapshot.docsById);
      }),
      { numRuns: 24, seed: 0x14_07_2026 }
    );
  });

  it('fails closed for stale, invalid, overlapping, non-code, and no-op edits', () => {
    const workspace = createWorkspace();
    const cases: readonly Readonly<{
      edits: readonly CodeLanguageTextEdit[];
      expectedCode: string;
    }>[] = [
      {
        edits: [edit('code-alpha', '2', 1, 14, 1, 19)],
        expectedCode:
          WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.artifactRevisionMismatch,
      },
      {
        edits: [edit('code-alpha', '3', 4, 1, 4, 2)],
        expectedCode: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.spanInvalid,
      },
      {
        edits: [
          edit('code-alpha', '3', 1, 14, 1, 19),
          edit('code-alpha', '3', 1, 16, 1, 18),
        ],
        expectedCode: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.spanOverlap,
      },
      {
        edits: [edit('project-config', '1', 1, 1, 1, 1)],
        expectedCode:
          WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.artifactTypeInvalid,
      },
      {
        edits: [edit('code-alpha', '3', 1, 14, 1, 19, 'alpha')],
        expectedCode: WORKSPACE_CODE_LANGUAGE_EDIT_PLAN_ISSUE_CODES.unchanged,
      },
    ];

    for (const current of cases) {
      const result = createWorkspaceCodeLanguageEditTransactionPlan({
        workspace,
        transactionId: 'rejected-language-edit',
        issuedAt: ISSUED_AT,
        edits: current.edits,
      });
      expect(result.status).toBe('rejected');
      if (result.status !== 'rejected') continue;
      expect(result.issues.map(({ code }) => code)).toContain(
        current.expectedCode
      );
      expect('plan' in result).toBe(false);
    }
  });
});
