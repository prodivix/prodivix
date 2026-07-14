import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  createEmptyPirComponentContract,
  createEmptyPirDocument,
  type PIRComponentContract,
} from '@prodivix/pir';
import {
  WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES,
  createWorkspaceComponentDefinitionTransactionPlan,
  type CreateWorkspaceComponentDefinitionTransactionInput,
} from './workspaceComponentDefinitionTransaction';
import { applyWorkspaceTransaction } from '../workspaceCommand';
import { createWorkspaceDocumentNodeId } from '../workspaceDocumentFactory';
import { createDirectionalWorkspaceOperation } from '../workspaceHistoryReplay';
import { createWorkspaceTransactionOperation } from '../workspaceOperation';
import type { WorkspaceSnapshot } from '../types';

const propertyParameters = Object.freeze({
  numRuns: 60,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,9}$/);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const createWorkspace = (
  siblingCount: number,
  workspaceRev = 7
): WorkspaceSnapshot => {
  const siblingIds = Array.from(
    { length: siblingCount },
    (_, index) => `component-slot-${index}`
  );
  return {
    id: 'workspace-components',
    workspaceRev,
    routeRev: 2,
    opSeq: 8,
    treeRootId: 'root',
    treeById: {
      root: {
        id: 'root',
        kind: 'dir',
        name: '/',
        parentId: null,
        children: ['components', 'existing-node'],
      },
      components: {
        id: 'components',
        kind: 'dir',
        name: 'components',
        parentId: 'root',
        children: siblingIds,
      },
      ...Object.fromEntries(
        siblingIds.map((siblingId, index) => [
          siblingId,
          {
            id: siblingId,
            kind: 'dir' as const,
            name: `slot-${index}`,
            parentId: 'components',
            children: [],
          },
        ])
      ),
      'existing-node': {
        id: 'existing-node',
        kind: 'doc',
        name: 'existing.ts',
        parentId: 'root',
        docId: 'existing-code',
      },
    },
    docsById: {
      'existing-code': {
        id: 'existing-code',
        type: 'code',
        path: '/existing.ts',
        contentRev: 1,
        metaRev: 1,
        content: { language: 'ts', source: 'export const existing = true;' },
      },
    },
    routeManifest: { version: '1', root: { id: 'route-root' } },
  };
};

const createInput = (
  workspace: WorkspaceSnapshot,
  suffix: string,
  overrides: Partial<CreateWorkspaceComponentDefinitionTransactionInput> = {}
): CreateWorkspaceComponentDefinitionTransactionInput => {
  const documentId = `component-${suffix}`;
  return {
    workspace,
    baseRevision: workspace.workspaceRev,
    transactionId: `create-component-${suffix}`,
    issuedAt: '2026-07-14T00:00:00.000Z',
    documentId,
    path: `/components/${documentId}.pir.json`,
    name: `Component ${suffix}`,
    rootId: `root-${suffix}`,
    rootType: `section-${suffix}`,
    componentContract: createEmptyPirComponentContract(),
    parentDirectoryId: 'components',
    index: workspace.treeById.components?.children?.length ?? 0,
    ...overrides,
  };
};

describe('Workspace Component Definition transaction planner properties', () => {
  it('atomically applies at any insertion index and reverses to identity', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.integer({ min: 0, max: 6 }),
        fc.nat({ max: 100 }),
        (suffix, siblingCount, indexSeed) => {
          const workspace = createWorkspace(siblingCount);
          const before = clone(workspace);
          const insertionIndex = indexSeed % (siblingCount + 1);
          const contract: PIRComponentContract = {
            ...createEmptyPirComponentContract(),
            propsById: {
              title: {
                id: 'title',
                name: 'title',
                typeRef: 'string',
              },
            },
          };
          const input = createInput(workspace, suffix, {
            componentContract: contract,
            index: insertionIndex,
          });

          const result =
            createWorkspaceComponentDefinitionTransactionPlan(input);

          expect(workspace).toEqual(before);
          expect(result.status).toBe('ready');
          if (result.status !== 'ready') return;
          const { plan } = result;
          const documentNodeId = createWorkspaceDocumentNodeId(
            input.documentId
          );
          expect(plan.document).toEqual({
            id: input.documentId,
            type: 'pir-component',
            name: input.name,
            path: input.path,
            contentRev: 1,
            metaRev: 1,
            content: createEmptyPirDocument({
              rootId: input.rootId,
              rootType: input.rootType,
              componentContract: contract,
            }),
          });
          expect(plan.documentNode).toEqual({
            id: documentNodeId,
            kind: 'doc',
            name: `${input.documentId}.pir.json`,
            parentId: 'components',
            docId: input.documentId,
          });
          expect(plan.transaction.commands).toHaveLength(2);
          expect(plan.transaction.commands[0]?.reverseOps).toEqual([
            {
              op: 'remove',
              path: `/docsById/${input.documentId}`,
            },
          ]);
          expect(plan.transaction.commands[1]?.reverseOps).toEqual([
            {
              op: 'remove',
              path: `/treeById/components/children/${insertionIndex}`,
            },
            { op: 'remove', path: `/treeById/${documentNodeId}` },
          ]);

          const applied = applyWorkspaceTransaction(
            workspace,
            plan.transaction
          );
          expect(applied.ok).toBe(true);
          if (!applied.ok) return;
          expect(
            applied.snapshot.treeById.components?.children?.[insertionIndex]
          ).toBe(documentNodeId);
          expect(applied.snapshot.docsById[input.documentId]).toEqual(
            plan.document
          );

          const undoOperation = createDirectionalWorkspaceOperation(
            createWorkspaceTransactionOperation(plan.transaction),
            'undo',
            1,
            plan.transaction.id,
            { clock: () => '2026-07-14T00:01:00.000Z' }
          );
          expect(undoOperation.kind).toBe('transaction');
          if (undoOperation.kind !== 'transaction') return;
          const reversed = applyWorkspaceTransaction(
            applied.snapshot,
            undoOperation.transaction
          );
          expect(reversed.ok).toBe(true);
          if (!reversed.ok) return;
          expect(reversed.snapshot).toEqual(workspace);
        }
      ),
      propertyParameters
    );
  });

  it('rejects revision, identity, path, parent, sibling, and index collisions before planning', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.constantFrom(
          'base-revision' as const,
          'document-id' as const,
          'document-path' as const,
          'invalid-path' as const,
          'parent-missing' as const,
          'parent-not-directory' as const,
          'parent-path' as const,
          'sibling-name' as const,
          'index' as const,
          'node-id' as const
        ),
        (suffix, scenario) => {
          const workspace = createWorkspace(2);
          const before = clone(workspace);
          const baseInput = createInput(workspace, suffix);
          let expectedCode: string;
          let input: CreateWorkspaceComponentDefinitionTransactionInput;

          switch (scenario) {
            case 'base-revision':
              input = {
                ...baseInput,
                baseRevision: workspace.workspaceRev + 1,
              };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.baseRevisionMismatch;
              break;
            case 'document-id':
              input = { ...baseInput, documentId: 'existing-code' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentIdCollision;
              break;
            case 'document-path':
              input = { ...baseInput, path: '/existing.ts' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentPathCollision;
              break;
            case 'invalid-path':
              input = { ...baseInput, path: 'components/new.pir.json' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.documentPathInvalid;
              break;
            case 'parent-missing':
              input = { ...baseInput, parentDirectoryId: 'missing' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentMissing;
              break;
            case 'parent-not-directory':
              input = { ...baseInput, parentDirectoryId: 'existing-node' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentNotDirectory;
              break;
            case 'parent-path':
              input = { ...baseInput, path: `/wrong/${baseInput.documentId}` };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.parentPathMismatch;
              break;
            case 'sibling-name':
              input = { ...baseInput, path: '/components/slot-0' };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.siblingNameCollision;
              break;
            case 'index':
              input = { ...baseInput, index: 3 };
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.insertionIndexInvalid;
              break;
            case 'node-id': {
              const nodeId = createWorkspaceDocumentNodeId(
                baseInput.documentId
              );
              workspace.treeById[nodeId] = {
                id: nodeId,
                kind: 'dir',
                name: 'collision',
                parentId: 'root',
                children: [],
              };
              input = baseInput;
              expectedCode =
                WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.nodeIdCollision;
              break;
            }
          }

          const result =
            createWorkspaceComponentDefinitionTransactionPlan(input);

          expect(result.status).toBe('rejected');
          if (result.status !== 'rejected') return;
          expect(result.issues.map(({ code }) => code)).toContain(expectedCode);
          expect(result).not.toHaveProperty('plan');
          if (scenario !== 'node-id') expect(workspace).toEqual(before);
        }
      ),
      propertyParameters
    );
  });

  it('rejects invalid component inputs and Contracts without creating fallback values', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.constantFrom(
          'transaction-id' as const,
          'document-id' as const,
          'name' as const,
          'root-id' as const,
          'root-type' as const,
          'contract' as const
        ),
        (suffix, scenario) => {
          const workspace = createWorkspace(0);
          const baseInput = createInput(workspace, suffix);
          const invalidContract: PIRComponentContract = {
            ...createEmptyPirComponentContract(),
            propsById: {
              mapKey: {
                id: 'differentId',
                name: 'prop',
                typeRef: 'string',
              },
            },
          };
          const input = {
            ...baseInput,
            ...(scenario === 'transaction-id' ? { transactionId: ' ' } : {}),
            ...(scenario === 'document-id' ? { documentId: ' ' } : {}),
            ...(scenario === 'name' ? { name: ' ' } : {}),
            ...(scenario === 'root-id' ? { rootId: ' ' } : {}),
            ...(scenario === 'root-type' ? { rootType: ' ' } : {}),
            ...(scenario === 'contract'
              ? { componentContract: invalidContract }
              : {}),
          };

          const result =
            createWorkspaceComponentDefinitionTransactionPlan(input);

          expect(result.status).toBe('rejected');
          if (result.status !== 'rejected') return;
          expect(result.issues.map(({ code }) => code)).toContain(
            scenario === 'contract'
              ? WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.contractInvalid
              : WORKSPACE_COMPONENT_DEFINITION_PLAN_ISSUE_CODES.inputInvalid
          );
        }
      ),
      propertyParameters
    );
  });
});
