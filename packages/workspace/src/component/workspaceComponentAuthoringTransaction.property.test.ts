import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type PIRComponentContract,
  type PIRComponentInstanceNode,
  type PIRDocument,
  type PIRNode,
} from '@prodivix/pir';
import {
  applyWorkspaceTransaction,
  type WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type {
  WorkspaceDocument,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import { WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES } from './workspaceComponentGraph';
import {
  WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES,
  createWorkspaceComponentContractUpdateTransactionPlan,
  createWorkspaceComponentInstanceTransactionPlan,
} from './workspaceComponentAuthoringTransaction';

const propertyParameters = Object.freeze({
  numRuns: 36,
  seed: 0x14_07_2026,
});

const token = fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/);

const createContract = (propTypeRef = 'string'): PIRComponentContract => ({
  propsById: {
    'prop-title': {
      id: 'prop-title',
      name: 'Title',
      typeRef: propTypeRef,
      required: true,
    },
  },
  eventsById: {},
  slotsById: {
    'slot-content': {
      id: 'slot-content',
      name: 'Content',
      minChildren: 0,
      maxChildren: 2,
    },
  },
  variantAxesById: {},
});

const createInstance = (
  id: string,
  componentDocumentId: string,
  value: string
): PIRComponentInstanceNode => ({
  id,
  kind: 'component-instance',
  componentDocumentId,
  bindings: {
    props: { 'prop-title': { kind: 'literal', value } },
    events: {},
    variants: {},
  },
});

const createPageContent = (
  existingInstance?: PIRComponentInstanceNode
): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    'slot-child': { id: 'slot-child', kind: 'element', type: 'span' },
  };
  const rootChildren = ['slot-child'];
  const childIdsById: Record<string, readonly string[]> = {
    root: rootChildren,
    'slot-child': [],
  };
  if (existingInstance) {
    nodesById[existingInstance.id] = existingInstance;
    childIdsById[existingInstance.id] = [];
    rootChildren.unshift(existingInstance.id);
  }
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById,
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

const createComponentContent = (
  contract: PIRComponentContract
): PIRDocument => ({
  componentContract: contract,
  ui: {
    graph: {
      rootId: 'component-root',
      nodesById: {
        'component-root': {
          id: 'component-root',
          kind: 'element',
          type: 'article',
        },
      },
      childIdsById: { 'component-root': [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

const createDocument = (
  id: string,
  type: 'pir-page' | 'pir-component',
  path: string,
  content: PIRDocument
): WorkspaceDocument => ({
  id,
  type,
  name: id,
  path,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createWorkspace = (
  input: Readonly<{
    contract?: PIRComponentContract;
    existingInstance?: PIRComponentInstanceNode;
  }> = {}
): WorkspaceSnapshot => {
  const page = createDocument(
    'page-home',
    'pir-page',
    '/home.pir.json',
    createPageContent(input.existingInstance)
  );
  const component = createDocument(
    'component-card',
    'pir-component',
    '/card.pir.json',
    createComponentContent(input.contract ?? createContract())
  );
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['page-node', 'component-node'],
    },
    'page-node': {
      id: 'page-node',
      kind: 'doc',
      name: 'home.pir.json',
      parentId: 'root',
      docId: page.id,
    },
    'component-node': {
      id: 'component-node',
      kind: 'doc',
      name: 'card.pir.json',
      parentId: 'root',
      docId: component.id,
    },
  };
  return {
    id: 'workspace-component-authoring',
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    treeRootId: 'root',
    treeById,
    docsById: { [page.id]: page, [component.id]: component },
    routeManifest: {
      version: '1',
      root: { id: 'route-root', pageDocId: page.id },
    },
    activeDocumentId: page.id,
    activeRouteNodeId: 'route-root',
  };
};

const reverseTransaction = (
  transaction: WorkspaceTransactionEnvelope
): WorkspaceTransactionEnvelope => ({
  ...transaction,
  id: `${transaction.id}:reverse`,
  commands: [...transaction.commands].reverse().map((command) => ({
    ...command,
    id: `${command.id}:reverse`,
    forwardOps: command.reverseOps,
    reverseOps: command.forwardOps,
  })),
});

const requireApplied = (
  workspace: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope
): WorkspaceSnapshot => {
  const result = applyWorkspaceTransaction(workspace, transaction);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.snapshot;
};

describe('Workspace Component authoring transaction properties', () => {
  it('inserts a bound instance with slot relocation and reverses exactly', () => {
    fc.assert(
      fc.property(token, fc.string({ maxLength: 32 }), (suffix, title) => {
        const workspace = createWorkspace();
        const instanceId = `instance-${suffix}`;
        const result = createWorkspaceComponentInstanceTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `insert-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          instance: createInstance(instanceId, 'component-card', title),
          placement: { parentId: 'root', index: 1 },
          slotRegions: { 'slot-content': ['slot-child'] },
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.plan.command.target).toEqual({
          workspaceId: workspace.id,
          documentId: 'page-home',
        });
        expect(result.plan.command.forwardOps[0]?.path).toBe('/ui/graph');

        const applied = requireApplied(workspace, result.plan.transaction);
        const content = applied.docsById['page-home']!.content as PIRDocument;
        expect(content.ui.graph.nodesById[instanceId]?.kind).toBe(
          'component-instance'
        );
        expect(content.ui.graph.childIdsById.root).toEqual([instanceId]);
        expect(
          content.ui.graph.regionsById?.[instanceId]?.['slot-content']
        ).toEqual(['slot-child']);

        const restored = requireApplied(
          applied,
          reverseTransaction(result.plan.transaction)
        );
        expect(restored).toEqual(workspace);
      }),
      propertyParameters
    );
  });

  it('updates a compatible Contract and reverses exactly', () => {
    fc.assert(
      fc.property(token, token, (memberSuffix, typeRef) => {
        const workspace = createWorkspace({
          existingInstance: createInstance(
            'existing-instance',
            'component-card',
            'title'
          ),
        });
        const memberId = `optional-${memberSuffix}`;
        const currentContract = createContract();
        const nextContract: PIRComponentContract = {
          ...currentContract,
          propsById: {
            ...currentContract.propsById,
            [memberId]: {
              id: memberId,
              name: memberId,
              typeRef,
            },
          },
        };
        const result = createWorkspaceComponentContractUpdateTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `contract-${memberSuffix}-${typeRef}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          componentDocumentId: 'component-card',
          componentContract: nextContract,
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(result.plan.command.forwardOps[0]?.path).toBe(
          '/componentContract'
        );
        const applied = requireApplied(workspace, result.plan.transaction);
        const content = applied.docsById['component-card']!
          .content as PIRDocument;
        expect(content.componentContract?.propsById[memberId]?.typeRef).toBe(
          typeRef
        );

        const restored = requireApplied(
          applied,
          reverseTransaction(result.plan.transaction)
        );
        expect(restored).toEqual(workspace);
      }),
      propertyParameters
    );
  });

  it('rejects missing targets and non-contract binding or slot members', () => {
    fc.assert(
      fc.property(token, (suffix) => {
        const workspace = createWorkspace();
        const missingTarget = createWorkspaceComponentInstanceTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `missing-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          instance: createInstance(
            `instance-missing-${suffix}`,
            `missing-${suffix}`,
            'title'
          ),
          placement: { parentId: 'root', index: 1 },
        });
        expect(missingTarget.status).toBe('rejected');
        if (missingTarget.status === 'rejected') {
          expect(missingTarget.issues.map((issue) => issue.code)).toContain(
            WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetMissing
          );
        }

        const invalidMembers = createWorkspaceComponentInstanceTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `member-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          instance: {
            ...createInstance(
              `instance-member-${suffix}`,
              'component-card',
              'title'
            ),
            bindings: {
              props: {
                [`unknown-${suffix}`]: { kind: 'literal', value: 'value' },
              },
              events: {},
              variants: {},
            },
          },
          placement: { parentId: 'root', index: 1 },
          slotRegions: { [`unknown-${suffix}`]: ['slot-child'] },
        });
        expect(invalidMembers.status).toBe('rejected');
        if (invalidMembers.status === 'rejected') {
          const codes = invalidMembers.issues.map((issue) => issue.code);
          expect(codes).toContain(
            WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.propNotExposed
          );
          expect(codes).toContain(
            WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.slotNotExposed
          );
        }
      }),
      propertyParameters
    );
  });

  it('rejects Contract type changes that break an existing instance', () => {
    fc.assert(
      fc.property(token, token, (beforeTypeRef, afterTypeRef) => {
        fc.pre(beforeTypeRef !== afterTypeRef);
        const workspace = createWorkspace({
          contract: createContract(beforeTypeRef),
          existingInstance: createInstance(
            'existing-instance',
            'component-card',
            'title'
          ),
        });
        const result = createWorkspaceComponentContractUpdateTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `breaking-${beforeTypeRef}-${afterTypeRef}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          componentDocumentId: 'component-card',
          componentContract: createContract(afterTypeRef),
        });

        expect(result.status).toBe('rejected');
        if (result.status === 'rejected') {
          expect(result.issues.map((issue) => issue.code)).toContain(
            WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.contractBreaking
          );
        }
      }),
      propertyParameters
    );
  });

  it('applies canonical Component transactions through the default transaction gate', () => {
    fc.assert(
      fc.property(token, (suffix) => {
        const workspace = createWorkspace();
        const result = createWorkspaceComponentInstanceTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `current-gate-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          instance: createInstance(
            `instance-current-${suffix}`,
            'component-card',
            'title'
          ),
          placement: { parentId: 'root', index: 1 },
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        expect(
          applyWorkspaceTransaction(workspace, result.plan.transaction).ok
        ).toBe(true);
      }),
      propertyParameters
    );
  });

  it('rejects a planner-bypassing transaction at the Component final-state gate', () => {
    fc.assert(
      fc.property(token, (suffix) => {
        const workspace = createWorkspace();
        const instanceId = `instance-bypass-${suffix}`;
        const result = createWorkspaceComponentInstanceTransactionPlan({
          workspace,
          baseRevision: workspace.workspaceRev,
          transactionId: `bypass-${suffix}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
          sourceDocumentId: 'page-home',
          instance: createInstance(instanceId, 'component-card', 'title'),
          placement: { parentId: 'root', index: 1 },
        });

        expect(result.status).toBe('ready');
        if (result.status !== 'ready') return;
        const command = result.plan.command;
        const graph = command.forwardOps[0]
          ?.value as PIRDocument['ui']['graph'];
        const instance = graph.nodesById[instanceId];
        if (!instance || instance.kind !== 'component-instance') return;
        const bypassTransaction: WorkspaceTransactionEnvelope = {
          ...result.plan.transaction,
          commands: [
            {
              ...command,
              forwardOps: [
                {
                  op: 'replace',
                  path: '/ui/graph',
                  value: {
                    ...graph,
                    nodesById: {
                      ...graph.nodesById,
                      [instanceId]: {
                        ...instance,
                        componentDocumentId: `missing-${suffix}`,
                      },
                    },
                  },
                },
              ],
            },
          ],
        };

        const applied = applyWorkspaceTransaction(workspace, bypassTransaction);
        expect(applied.ok).toBe(false);
        if (applied.ok) return;
        expect(JSON.stringify(applied.issues)).toContain(
          WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetMissing
        );
      }),
      propertyParameters
    );
  });
});
