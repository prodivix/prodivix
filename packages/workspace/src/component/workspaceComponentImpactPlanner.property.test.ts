import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createComponentScopeId,
  createSemanticId,
  createWorkspaceScopeId,
  createWorkspaceSemanticIndex,
  type SemanticContributionProvider,
  type WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import {
  createEmptyPirDocument,
  createPirSemanticContributionProvider,
  insertPirComponentInstance,
  type PIRComponentContract,
  type PIRDocument,
} from '@prodivix/pir';
import { createRouteSemanticContributionProvider } from '@prodivix/router';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyWorkspaceTransaction,
  type WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import { createWorkspaceSemanticContributionProvider } from '../authoring/workspaceSemanticContributionProvider';
import { captureWorkspaceSemanticRevisions } from '../authoring/workspaceSemanticRevision';
import {
  WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES,
  analyzeWorkspaceComponentImpact,
  createWorkspaceComponentDeleteTransactionPlan,
  createWorkspaceComponentRenameTransactionPlan,
} from './workspaceComponentImpactPlanner';

const COMPONENT_ID = 'component-card';
const PROP_ID = 'prop-title';
const EVENT_ID = 'event-open';
const SLOT_ID = 'slot-content';
const VARIANT_ID = 'variant-tone';
const OPTION_ID = 'option-neutral';

const contract: PIRComponentContract = {
  propsById: {
    [PROP_ID]: {
      id: PROP_ID,
      name: 'title',
      typeRef: 'string',
    },
  },
  eventsById: {
    [EVENT_ID]: {
      id: EVENT_ID,
      name: 'open',
    },
  },
  slotsById: {
    [SLOT_ID]: {
      id: SLOT_ID,
      name: 'content',
      propsById: {
        'slot-prop-context': {
          id: 'slot-prop-context',
          name: 'context',
          typeRef: 'string',
        },
      },
    },
  },
  variantAxesById: {
    [VARIANT_ID]: {
      id: VARIANT_ID,
      name: 'tone',
      optionsById: {
        [OPTION_ID]: { id: OPTION_ID, name: 'neutral' },
      },
    },
  },
};

const createComponentDocument = (): PIRDocument =>
  createEmptyPirDocument({
    rootId: 'component-root',
    rootType: 'article',
    componentContract: contract,
  });

const createConsumerDocument = (index: number): PIRDocument => {
  const rootId = `consumer-root-${index}`;
  const base = createEmptyPirDocument({ rootId, rootType: 'main' });
  const mutation = insertPirComponentInstance({
    document: base,
    instance: {
      id: `instance-${index}`,
      kind: 'component-instance',
      componentDocumentId: COMPONENT_ID,
      bindings: {
        props: {
          [PROP_ID]: { kind: 'literal', value: `title-${index}` },
        },
        events: {
          [EVENT_ID]: { kind: 'open-url', href: '/details' },
        },
        variants: { [VARIANT_ID]: OPTION_ID },
      },
    },
    target: { parentId: rootId, index: 0 },
    slotRegions: { [SLOT_ID]: [] },
  });
  expect(mutation.ok).toBe(true);
  if (!mutation.ok) return base;
  return mutation.document;
};

const createDocument = (
  id: string,
  type: WorkspaceDocument['type'],
  path: string,
  content: unknown
): WorkspaceDocument => ({
  id,
  type,
  name: path.split('/').at(-1),
  path,
  contentRev: 1,
  metaRev: 1,
  content,
});

const createWorkspace = (
  consumerCount: number,
  options: Readonly<{ reverse?: boolean; routeToComponent?: boolean }> = {}
): WorkspaceSnapshot => {
  const documents: WorkspaceDocument[] = [
    createDocument(
      COMPONENT_ID,
      'pir-component',
      '/components/card.pir.json',
      createComponentDocument()
    ),
    createDocument(
      'page-safe',
      'pir-page',
      '/pages/safe.pir.json',
      createEmptyPirDocument({ rootId: 'safe-root', rootType: 'main' })
    ),
    ...Array.from({ length: consumerCount }, (_, index) =>
      createDocument(
        `page-consumer-${index}`,
        'pir-page',
        `/pages/consumer-${index}.pir.json`,
        createConsumerDocument(index)
      )
    ),
  ];
  const orderedDocuments = options.reverse
    ? [...documents].reverse()
    : documents;
  const nodes = orderedDocuments.map((document) => ({
    id: `node:${document.id}`,
    kind: 'doc' as const,
    name: document.path.split('/').at(-1)!,
    parentId: document.path.startsWith('/components/')
      ? 'dir:components'
      : 'dir:pages',
    docId: document.id,
  }));
  const componentNodeIds = nodes
    .filter(({ parentId }) => parentId === 'dir:components')
    .map(({ id }) => id);
  const pageNodeIds = nodes
    .filter(({ parentId }) => parentId === 'dir:pages')
    .map(({ id }) => id);
  return {
    id: 'workspace-impact',
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    treeRootId: 'root',
    treeById: Object.fromEntries([
      [
        'root',
        {
          id: 'root',
          kind: 'dir',
          name: '/',
          parentId: null,
          children: ['dir:components', 'dir:pages'],
        },
      ],
      [
        'dir:components',
        {
          id: 'dir:components',
          kind: 'dir',
          name: 'components',
          parentId: 'root',
          children: componentNodeIds,
        },
      ],
      [
        'dir:pages',
        {
          id: 'dir:pages',
          kind: 'dir',
          name: 'pages',
          parentId: 'root',
          children: pageNodeIds,
        },
      ],
      ...nodes.map((node) => [node.id, node] as const),
    ]),
    docsById: Object.fromEntries(
      orderedDocuments.map((document) => [document.id, document])
    ),
    routeManifest: {
      version: '1',
      root: {
        id: 'route-root',
        ...(options.routeToComponent ? { pageDocId: COMPONENT_ID } : {}),
      },
    },
    activeDocumentId: COMPONENT_ID,
  };
};

const createIndex = (
  workspace: WorkspaceSnapshot,
  additionalProviders: readonly SemanticContributionProvider[] = []
): WorkspaceSemanticIndex => {
  const workspaceRevisions = captureWorkspaceSemanticRevisions(workspace);
  const documents = Object.values(workspace.docsById).map((document) => ({
    documentId: document.id,
    documentType: document.type as 'pir-page' | 'pir-layout' | 'pir-component',
    revision: workspaceRevisions.documentRevs[document.id]!,
    document: document.content as PIRDocument,
  }));
  const result = createWorkspaceSemanticIndex({
    workspaceRevisions,
    schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
    providers: [
      createWorkspaceSemanticContributionProvider(workspace),
      createRouteSemanticContributionProvider({
        workspaceId: workspace.id,
        routeRev: workspace.routeRev,
        manifest: workspace.routeManifest,
      }),
      createPirSemanticContributionProvider({
        workspaceId: workspace.id,
        documents,
      }),
      ...additionalProviders,
    ],
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return result.index;
};

const reverseTransaction = (
  transaction: WorkspaceTransactionEnvelope
): WorkspaceTransactionEnvelope => ({
  ...transaction,
  id: `${transaction.id}:reverse`,
  commands: [...transaction.commands].reverse().map((command, index) => ({
    ...command,
    id: `${transaction.id}:reverse:${index}`,
    forwardOps: command.reverseOps,
    reverseOps: command.forwardOps,
  })),
});

const createPlanBase = (
  workspace: WorkspaceSnapshot,
  semanticIndex = createIndex(workspace)
) => ({
  workspace,
  semanticIndex,
  baseRevision: workspace.workspaceRev,
  transactionId: 'component-impact-transaction',
  issuedAt: '2026-07-14T00:00:00.000Z',
  componentDocumentId: COMPONENT_ID,
});

describe('Workspace Component impact planner properties', () => {
  it('produces order-independent complete consumer and member impact', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (consumerCount) => {
        const forwardWorkspace = createWorkspace(consumerCount);
        const reverseWorkspace = createWorkspace(consumerCount, {
          reverse: true,
        });
        const forward = analyzeWorkspaceComponentImpact({
          workspace: forwardWorkspace,
          semanticIndex: createIndex(forwardWorkspace),
          componentDocumentId: COMPONENT_ID,
        });
        const reverse = analyzeWorkspaceComponentImpact({
          workspace: reverseWorkspace,
          semanticIndex: createIndex(reverseWorkspace),
          componentDocumentId: COMPONENT_ID,
        });
        expect(forward).toEqual(reverse);
        expect(forward.status).toBe('ready');
        if (forward.status !== 'ready') return;
        expect(forward.impact.instances).toHaveLength(consumerCount);
        expect(forward.impact.instances).toSatisfy((instances: unknown[]) =>
          instances.every(
            (instance) =>
              (instance as { propMemberIds: string[] }).propMemberIds[0] ===
                PROP_ID &&
              (instance as { eventMemberIds: string[] }).eventMemberIds[0] ===
                EVENT_ID &&
              (instance as { slotMemberIds: string[] }).slotMemberIds[0] ===
                SLOT_ID
          )
        );
        expect(
          forward.impact.contractMemberImpacts.find(
            ({ kind, memberId }) => kind === 'prop' && memberId === PROP_ID
          )?.referenceIds
        ).toHaveLength(consumerCount);
      }),
      { numRuns: 40, seed: 0x14_07_2026 }
    );
  });

  it('blocks deletion for every Instance and route consumer', () => {
    const workspace = createWorkspace(2, { routeToComponent: true });
    const result = createWorkspaceComponentDeleteTransactionPlan(
      createPlanBase(workspace)
    );
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.impact.instances).toHaveLength(2);
    expect(result.impact.routeReferences).toHaveLength(1);
    expect(result.issues.map(({ code }) => code)).toEqual([
      WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.consumerBlocksDelete,
      WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.consumerBlocksDelete,
      WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.routeBlocksDelete,
    ]);
  });

  it('plans safe deletion as one exactly reversible transaction', () => {
    const workspace = createWorkspace(0);
    const result = createWorkspaceComponentDeleteTransactionPlan(
      createPlanBase(workspace)
    );
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    const applied = applyWorkspaceTransaction(
      workspace,
      result.plan.transaction
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById[COMPONENT_ID]).toBeUndefined();
    const reversed = applyWorkspaceTransaction(
      applied.snapshot,
      reverseTransaction(result.plan.transaction)
    );
    expect(reversed.ok).toBe(true);
    if (!reversed.ok) return;
    expect(reversed.snapshot).toEqual(workspace);
  });

  it('renames document metadata while every durable reference stays stable', () => {
    const workspace = createWorkspace(2, { routeToComponent: true });
    const result = createWorkspaceComponentRenameTransactionPlan({
      ...createPlanBase(workspace),
      target: {
        kind: 'component-document',
        nextPath: '/components/renamed-card.pir.json',
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.plan.impact.instances).toHaveLength(2);
    expect(result.plan.impact.routeReferences).toHaveLength(1);
    expect(result.plan.stableSymbolIds).toEqual([
      result.plan.impact.componentSymbolId,
      result.plan.impact.workspaceDocumentSymbolId,
    ]);
    const applied = applyWorkspaceTransaction(
      workspace,
      result.plan.transaction
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.snapshot.docsById[COMPONENT_ID]).toMatchObject({
      id: COMPONENT_ID,
      path: '/components/renamed-card.pir.json',
      name: 'renamed-card.pir.json',
    });
    const reversed = applyWorkspaceTransaction(
      applied.snapshot,
      reverseTransaction(result.plan.transaction)
    );
    expect(reversed.ok).toBe(true);
    if (!reversed.ok) return;
    expect(reversed.snapshot).toEqual(workspace);
  });

  it('renames a Contract member by durable member id and preserves bindings', () => {
    const workspace = createWorkspace(3);
    const result = createWorkspaceComponentRenameTransactionPlan({
      ...createPlanBase(workspace),
      target: {
        kind: 'contract-member',
        memberKind: 'prop',
        memberId: PROP_ID,
        nextName: 'heading',
      },
    });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(
      result.plan.impact.contractMemberImpacts.find(
        ({ kind, memberId }) => kind === 'prop' && memberId === PROP_ID
      )?.referenceIds
    ).toHaveLength(3);
    const applied = applyWorkspaceTransaction(
      workspace,
      result.plan.transaction
    );
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    const nextContract = (
      applied.snapshot.docsById[COMPONENT_ID]!.content as PIRDocument
    ).componentContract!;
    expect(nextContract.propsById[PROP_ID]).toMatchObject({
      id: PROP_ID,
      name: 'heading',
    });
    for (let index = 0; index < 3; index += 1) {
      const consumer = applied.snapshot.docsById[`page-consumer-${index}`]!
        .content as PIRDocument;
      const instance = consumer.ui.graph.nodesById[`instance-${index}`];
      expect(instance?.kind).toBe('component-instance');
      if (instance?.kind !== 'component-instance') continue;
      expect(instance.bindings.props).toHaveProperty(PROP_ID);
    }
  });

  it('blocks a rename when an owner still addresses the symbol by name', () => {
    const workspace = createWorkspace(0);
    const nameReferenceProvider: SemanticContributionProvider = {
      descriptor: { id: 'test.name-reference', semanticVersion: '1' },
      contribute: () => ({
        references: [
          {
            id: createSemanticId('test-name-ref', workspace.id, PROP_ID),
            kind: 'binding',
            sourceRef: { kind: 'code-artifact', artifactId: 'external-code' },
            scopeId: createWorkspaceScopeId(workspace.id),
            target: {
              kind: 'name',
              name: 'title',
              symbolKinds: ['component-prop'],
              targetScopeId: createComponentScopeId(workspace.id, COMPONENT_ID),
            },
            resolutionMode: 'addressable',
          },
        ],
      }),
    };
    const semanticIndex = createIndex(workspace, [nameReferenceProvider]);
    const result = createWorkspaceComponentRenameTransactionPlan({
      ...createPlanBase(workspace, semanticIndex),
      target: {
        kind: 'contract-member',
        memberKind: 'prop',
        memberId: PROP_ID,
        nextName: 'heading',
      },
    });
    expect(result.status).toBe('blocked');
    if (result.status !== 'blocked') return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.code).toBe(
      WORKSPACE_COMPONENT_IMPACT_PLAN_ISSUE_CODES.nameReferenceBlocksRename
    );
  });
});
