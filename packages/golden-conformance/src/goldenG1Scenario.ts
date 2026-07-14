import { isDeepStrictEqual } from 'node:util';
import type {
  PIRCollectionNode,
  PIRComponentInstanceNode,
  PIRDocument,
  PIRElementNode,
} from '@prodivix/pir';
import {
  compileWorkspaceToExportProgram,
  createPirReactModuleId,
  type ExportModule,
  type ExportProgram,
} from '@prodivix/prodivix-compiler';
import {
  applyWorkspaceTransaction,
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceComponentExtractionTransactionPlan,
  createWorkspaceComponentInstanceTransactionPlan,
  createWorkspaceHistoryState,
  createWorkspacePirProjectionPlan,
  createWorkspacePIRElementUpdateTransactionPlan,
  createWorkspaceTransactionOperation,
  decodeWorkspacePirDocument,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceOperationScope,
  undoWorkspaceHistory,
  type WorkspaceOperation,
  type WorkspacePirProjectionPlan,
  type WorkspaceSnapshot,
  type WorkspaceTransactionEnvelope,
} from '@prodivix/workspace';
import { GOLDEN_CODEGEN_POLICY, GOLDEN_IDS } from './goldenApp.fixture';
import { authorGoldenWorkspace } from './goldenAuthoring';

export const GOLDEN_G1_IDS = Object.freeze({
  checkoutSectionComponent: 'component-checkout-section',
  extractedInstance: 'checkout-form',
  directInstance: 'checkout-section-direct',
  nestedInstance: 'checkout-section-nested',
  innerCollection: 'collection-checkout-inner',
  outerCollection: 'collection-checkout-outer',
  definitionEditedNode: 'submit-secondary',
});

export const GOLDEN_G1_DEFAULT_DEFINITION_TEXT =
  'Save this reusable checkout for later';

const GOLDEN_G1_ISSUED_AT = Object.freeze([
  '2026-07-14T08:10:00.000Z',
  '2026-07-14T08:11:00.000Z',
  '2026-07-14T08:12:00.000Z',
  '2026-07-14T08:13:00.000Z',
  '2026-07-14T08:14:00.000Z',
  '2026-07-14T08:15:00.000Z',
]);

type ReadyTransactionPlan = Readonly<{
  transaction: WorkspaceTransactionEnvelope;
}>;

type TransactionPlanResult<Plan extends ReadyTransactionPlan> =
  | Readonly<{ status: 'ready'; plan: Plan }>
  | Readonly<{ status: 'rejected'; issues: readonly unknown[] }>;

export type GoldenG1AuthoringEvidence = Readonly<{
  extractionCommandCount: number;
  instanceNodeIds: readonly string[];
  nestedCollectionPath: readonly string[];
  projectionConsumerCount: number;
  projectionDefinitionUpdated: boolean;
  undoRestoredPreviousDefinition: boolean;
  redoRestoredEditedDefinition: boolean;
  saveReloadPreservedWorkspace: boolean;
  replayPreservedWorkspace: boolean;
}>;

export type GoldenG1AuthoringResult = Readonly<{
  baseWorkspace: WorkspaceSnapshot;
  extractedWorkspace: WorkspaceSnapshot;
  beforeDefinitionEditWorkspace: WorkspaceSnapshot;
  workspace: WorkspaceSnapshot;
  reloadedWorkspace: WorkspaceSnapshot;
  replayedWorkspace: WorkspaceSnapshot;
  operations: readonly WorkspaceOperation[];
  projection: Readonly<{
    beforeDefinitionEdit: WorkspacePirProjectionPlan;
    afterDefinitionEdit: WorkspacePirProjectionPlan;
  }>;
  evidence: GoldenG1AuthoringEvidence;
}>;

export type GoldenG1CompilerEvidence = Readonly<{
  definitionModuleChanged: boolean;
  definitionModuleContainsEditedText: boolean;
  definitionModuleCount: number;
  consumerImportsDefinitionOnce: boolean;
  consumerInstanceCallCount: number;
  sourceTraceStableAcrossReloadAndReplay: boolean;
  tracedNodeIds: readonly string[];
}>;

export type GoldenG1ConformanceReport = Readonly<{
  authoring: GoldenG1AuthoringResult;
  program: ExportProgram;
  beforeDefinitionEditProgram: ExportProgram;
  compiler: GoldenG1CompilerEvidence;
}>;

const requireReadyPlan = <Plan extends ReadyTransactionPlan>(
  result: TransactionPlanResult<Plan>,
  stage: string
): Plan => {
  if (result.status === 'ready') return result.plan;
  throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
};

const applyTransaction = (
  workspace: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope,
  stage: string
): WorkspaceSnapshot => {
  const result = applyWorkspaceTransaction(workspace, transaction);
  if (!result.ok) throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
  return result.snapshot;
};

const readPirDocument = (
  workspace: WorkspaceSnapshot,
  documentId: string
): PIRDocument => {
  const document = workspace.docsById[documentId];
  if (!document) throw new Error(`Missing PIR document: ${documentId}`);
  const result = decodeWorkspacePirDocument(document, {
    workspaceId: workspace.id,
  });
  if (result.status !== 'valid') {
    throw new Error(`Invalid PIR document ${documentId}: ${result.status}`);
  }
  return result.decodedContent;
};

const readDefinitionText = (workspace: WorkspaceSnapshot): unknown => {
  const node = readPirDocument(
    workspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  ).ui.graph.nodesById[GOLDEN_G1_IDS.definitionEditedNode];
  return node?.kind === 'element' && node.text?.kind === 'literal'
    ? node.text.value
    : undefined;
};

const readProjectionDefinitionText = (
  projection: WorkspacePirProjectionPlan
): unknown => {
  const node =
    projection.documentsById[GOLDEN_G1_IDS.checkoutSectionComponent]?.content.ui
      .graph.nodesById[GOLDEN_G1_IDS.definitionEditedNode];
  return node?.kind === 'element' && node.text?.kind === 'literal'
    ? node.text.value
    : undefined;
};

const createInstance = (id: string): PIRComponentInstanceNode => ({
  id,
  kind: 'component-instance',
  componentDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
  bindings: { props: {}, events: {}, variants: {} },
});

const createCollection = (
  id: string,
  symbolPrefix: string
): PIRCollectionNode => ({
  id,
  kind: 'collection',
  source: { kind: 'literal', value: [{ id: `${symbolPrefix}-item` }] },
  key: { kind: 'index' },
  symbols: {
    itemId: `${symbolPrefix}-item`,
    itemName: `${symbolPrefix}Item`,
    indexId: `${symbolPrefix}-index`,
    indexName: `${symbolPrefix}Index`,
  },
});

const requireProjection = (
  workspace: WorkspaceSnapshot
): WorkspacePirProjectionPlan => {
  const result = createWorkspacePirProjectionPlan({
    workspace,
    entryDocumentId: GOLDEN_IDS.checkoutPage,
  });
  if (result.status === 'ready') return result.plan;
  throw new Error(
    `Golden G1 projection blocked: ${JSON.stringify(result.issues)}`
  );
};

const applyAndCollect = (
  workspace: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope,
  operations: WorkspaceOperation[],
  stage: string
): WorkspaceSnapshot => {
  const next = applyTransaction(workspace, transaction, stage);
  operations.push(createWorkspaceTransactionOperation(transaction));
  return next;
};

/** Authors the G1 Component/Collection journey only through public planners. */
export const authorGoldenG1Workspace = (
  definitionText = GOLDEN_G1_DEFAULT_DEFINITION_TEXT
): GoldenG1AuthoringResult => {
  if (definitionText === 'Save for later') {
    throw new Error('Golden G1 Definition edit must change the source node.');
  }

  const baseWorkspace = authorGoldenWorkspace().editedWorkspace;
  const operations: WorkspaceOperation[] = [];

  const extractionPlan = requireReadyPlan(
    createWorkspaceComponentExtractionTransactionPlan({
      workspace: baseWorkspace,
      baseRevision: baseWorkspace.workspaceRev,
      transactionId: 'golden-g1-extract-checkout-section',
      issuedAt: GOLDEN_G1_ISSUED_AT[0]!,
      sourceDocumentId: GOLDEN_IDS.checkoutPage,
      subtreeRootId: GOLDEN_G1_IDS.extractedInstance,
      componentDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      componentPath: '/components/checkout-section.pir.json',
      componentName: 'Golden Checkout Section',
      instanceNodeId: GOLDEN_G1_IDS.extractedInstance,
    }),
    'extract checkout subtree'
  );
  let workspace = applyAndCollect(
    baseWorkspace,
    extractionPlan.transaction,
    operations,
    'apply checkout extraction'
  );
  const extractedWorkspace = workspace;

  const directInstancePlan = requireReadyPlan(
    createWorkspaceComponentInstanceTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-direct-instance',
      issuedAt: GOLDEN_G1_ISSUED_AT[1]!,
      sourceDocumentId: GOLDEN_IDS.checkoutPage,
      instance: createInstance(GOLDEN_G1_IDS.directInstance),
      placement: { parentId: 'checkout-root', index: 2 },
    }),
    'insert direct Component Instance'
  );
  workspace = applyAndCollect(
    workspace,
    directInstancePlan.transaction,
    operations,
    'apply direct Component Instance'
  );

  const nestedInstancePlan = requireReadyPlan(
    createWorkspaceComponentInstanceTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-nested-instance',
      issuedAt: GOLDEN_G1_ISSUED_AT[2]!,
      sourceDocumentId: GOLDEN_IDS.checkoutPage,
      instance: createInstance(GOLDEN_G1_IDS.nestedInstance),
      placement: { parentId: 'checkout-root', index: 3 },
    }),
    'insert nested Component Instance'
  );
  workspace = applyAndCollect(
    workspace,
    nestedInstancePlan.transaction,
    operations,
    'apply nested Component Instance'
  );

  const innerCollectionPlan = requireReadyPlan(
    createWorkspaceCollectionInsertTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-inner-collection',
      issuedAt: GOLDEN_G1_ISSUED_AT[3]!,
      documentId: GOLDEN_IDS.checkoutPage,
      collection: createCollection(GOLDEN_G1_IDS.innerCollection, 'inner'),
      placement: { parentId: 'checkout-root', index: 3 },
      regions: { item: [GOLDEN_G1_IDS.nestedInstance] },
    }),
    'insert inner Collection'
  );
  workspace = applyAndCollect(
    workspace,
    innerCollectionPlan.transaction,
    operations,
    'apply inner Collection'
  );

  const outerCollectionPlan = requireReadyPlan(
    createWorkspaceCollectionInsertTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-outer-collection',
      issuedAt: GOLDEN_G1_ISSUED_AT[4]!,
      documentId: GOLDEN_IDS.checkoutPage,
      collection: createCollection(GOLDEN_G1_IDS.outerCollection, 'outer'),
      placement: { parentId: 'checkout-root', index: 3 },
      regions: { item: [GOLDEN_G1_IDS.innerCollection] },
    }),
    'insert outer Collection'
  );
  workspace = applyAndCollect(
    workspace,
    outerCollectionPlan.transaction,
    operations,
    'apply outer Collection'
  );
  const beforeDefinitionEditWorkspace = workspace;
  const beforeDefinitionEditProjection = requireProjection(workspace);

  const definition = readPirDocument(
    workspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  );
  const currentNode =
    definition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionEditedNode];
  if (!currentNode || currentNode.kind !== 'element') {
    throw new Error('Golden G1 Definition edit node is not an Element.');
  }
  const editedNode: PIRElementNode = {
    ...currentNode,
    text: { kind: 'literal', value: definitionText },
  };
  const definitionEditPlan = requireReadyPlan(
    createWorkspacePIRElementUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-edit-component-definition',
      issuedAt: GOLDEN_G1_ISSUED_AT[5]!,
      documentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      nodeId: GOLDEN_G1_IDS.definitionEditedNode,
      node: editedNode,
    }),
    'edit Component Definition'
  );
  workspace = applyAndCollect(
    workspace,
    definitionEditPlan.transaction,
    operations,
    'apply Component Definition edit'
  );
  const finalWorkspace = workspace;
  const afterDefinitionEditProjection = requireProjection(finalWorkspace);

  const definitionEditOperation = operations.at(-1)!;
  const history = recordWorkspaceOperation(
    createWorkspaceHistoryState(),
    definitionEditOperation,
    { appliedAt: GOLDEN_G1_ISSUED_AT[5] }
  );
  const historyScope = resolveWorkspaceOperationScope(definitionEditOperation);
  const undone = undoWorkspaceHistory(finalWorkspace, history, historyScope, {
    clock: () => GOLDEN_G1_ISSUED_AT[5]!,
  });
  if (!undone.ok)
    throw new Error(`undo Definition: ${JSON.stringify(undone.issues)}`);
  const redone = redoWorkspaceHistory(
    undone.snapshot,
    undone.history,
    historyScope,
    { clock: () => GOLDEN_G1_ISSUED_AT[5]! }
  );
  if (!redone.ok)
    throw new Error(`redo Definition: ${JSON.stringify(redone.issues)}`);

  const reloadedWorkspace = decodeWorkspaceSnapshot(
    encodeWorkspaceSnapshot(finalWorkspace, {})
  ).workspace;
  const replayedWorkspace = operations.reduce(
    (snapshot, operation, index) =>
      applyTransaction(
        snapshot,
        operation.kind === 'transaction'
          ? operation.transaction
          : {
              id: `${operation.command.id}:transaction`,
              workspaceId: operation.command.target.workspaceId,
              issuedAt: operation.command.issuedAt,
              label: operation.command.label,
              commands: [operation.command],
            },
        `replay Golden G1 operation ${index + 1}`
      ),
    baseWorkspace
  );

  const checkout = readPirDocument(finalWorkspace, GOLDEN_IDS.checkoutPage);
  const instanceNodeIds = Object.values(checkout.ui.graph.nodesById)
    .filter(
      (node): node is PIRComponentInstanceNode =>
        node.kind === 'component-instance' &&
        node.componentDocumentId === GOLDEN_G1_IDS.checkoutSectionComponent
    )
    .map(({ id }) => id)
    .sort();
  const projectionEdges = afterDefinitionEditProjection.graph.edges.filter(
    ({ sourceDocumentId, targetDocumentId }) =>
      sourceDocumentId === GOLDEN_IDS.checkoutPage &&
      targetDocumentId === GOLDEN_G1_IDS.checkoutSectionComponent
  );

  return {
    baseWorkspace,
    extractedWorkspace,
    beforeDefinitionEditWorkspace,
    workspace: finalWorkspace,
    reloadedWorkspace,
    replayedWorkspace,
    operations,
    projection: {
      beforeDefinitionEdit: beforeDefinitionEditProjection,
      afterDefinitionEdit: afterDefinitionEditProjection,
    },
    evidence: {
      extractionCommandCount: extractionPlan.transaction.commands.length,
      instanceNodeIds,
      nestedCollectionPath: [
        GOLDEN_G1_IDS.outerCollection,
        GOLDEN_G1_IDS.innerCollection,
        GOLDEN_G1_IDS.nestedInstance,
      ],
      projectionConsumerCount: projectionEdges.length,
      projectionDefinitionUpdated:
        readProjectionDefinitionText(beforeDefinitionEditProjection) ===
          'Save for later' &&
        readProjectionDefinitionText(afterDefinitionEditProjection) ===
          definitionText,
      undoRestoredPreviousDefinition:
        readDefinitionText(undone.snapshot) === 'Save for later',
      redoRestoredEditedDefinition:
        readDefinitionText(redone.snapshot) === definitionText,
      saveReloadPreservedWorkspace: isDeepStrictEqual(
        reloadedWorkspace,
        finalWorkspace
      ),
      replayPreservedWorkspace: isDeepStrictEqual(
        replayedWorkspace,
        finalWorkspace
      ),
    },
  };
};

const compileGoldenG1Program = (workspace: WorkspaceSnapshot): ExportProgram =>
  compileWorkspaceToExportProgram(workspace, {
    projectName: 'Prodivix Golden G1 App',
    codegenPolicySnapshot: GOLDEN_CODEGEN_POLICY,
    packageResolver: { strategy: 'npm' },
  });

const requireModule = (
  program: ExportProgram,
  moduleId: string
): ExportModule => {
  const module = program.modules.find(({ id }) => id === moduleId);
  if (!module) throw new Error(`Golden G1 export module missing: ${moduleId}`);
  return module;
};

const countComponentCalls = (body: string, localName: string): number =>
  body.match(new RegExp(`<${localName}(?:\\s|>)`, 'g'))?.length ?? 0;

const collectTracedNodeIds = (modules: readonly ExportModule[]): string[] => {
  const prefix = '/ui/graph/nodesById/';
  return [
    ...new Set(
      modules.flatMap(({ sourceTrace }) =>
        sourceTrace.flatMap(({ sourceRef }) =>
          sourceRef.path?.startsWith(prefix)
            ? [sourceRef.path.slice(prefix.length)]
            : []
        )
      )
    ),
  ].sort();
};

/** Produces stable Preview/Compiler/SourceTrace evidence for the G1 journey. */
export const runGoldenG1Conformance = (
  definitionText = GOLDEN_G1_DEFAULT_DEFINITION_TEXT
): GoldenG1ConformanceReport => {
  const authoring = authorGoldenG1Workspace(definitionText);
  const beforeDefinitionEditProgram = compileGoldenG1Program(
    authoring.beforeDefinitionEditWorkspace
  );
  const program = compileGoldenG1Program(authoring.workspace);
  const reloadedProgram = compileGoldenG1Program(authoring.reloadedWorkspace);
  const replayedProgram = compileGoldenG1Program(authoring.replayedWorkspace);
  const definitionModuleId = createPirReactModuleId(
    GOLDEN_G1_IDS.checkoutSectionComponent
  );
  const consumerModuleId = createPirReactModuleId(GOLDEN_IDS.checkoutPage);
  const beforeDefinitionModule = requireModule(
    beforeDefinitionEditProgram,
    definitionModuleId
  );
  const definitionModule = requireModule(program, definitionModuleId);
  const consumerModule = requireModule(program, consumerModuleId);
  const definitionImport = consumerModule.imports.find(
    ({ targetModuleId }) => targetModuleId === definitionModuleId
  );
  const definitionLocalName =
    definitionImport?.local ?? definitionImport?.imported;
  const stableModuleTrace = (candidate: ExportProgram): boolean => {
    const candidateDefinition = requireModule(candidate, definitionModuleId);
    const candidateConsumer = requireModule(candidate, consumerModuleId);
    return (
      isDeepStrictEqual(
        candidateDefinition.sourceTrace,
        definitionModule.sourceTrace
      ) &&
      isDeepStrictEqual(
        candidateConsumer.sourceTrace,
        consumerModule.sourceTrace
      )
    );
  };

  return {
    authoring,
    program,
    beforeDefinitionEditProgram,
    compiler: {
      definitionModuleChanged:
        beforeDefinitionModule.body !== definitionModule.body,
      definitionModuleContainsEditedText:
        definitionModule.body.includes(definitionText),
      definitionModuleCount: program.modules.filter(
        ({ id }) => id === definitionModuleId
      ).length,
      consumerImportsDefinitionOnce:
        consumerModule.imports.filter(
          ({ targetModuleId }) => targetModuleId === definitionModuleId
        ).length === 1,
      consumerInstanceCallCount: definitionLocalName
        ? countComponentCalls(consumerModule.body, definitionLocalName)
        : 0,
      sourceTraceStableAcrossReloadAndReplay:
        stableModuleTrace(reloadedProgram) &&
        stableModuleTrace(replayedProgram),
      tracedNodeIds: collectTracedNodeIds([definitionModule, consumerModule]),
    },
  };
};
