import { isDeepStrictEqual } from 'node:util';
import {
  replaceControlledSourceRegion,
  scanControlledSourceRegions,
} from '@prodivix/authoring';
import type {
  PIRCollectionNode,
  PIRComponentContract,
  PIRComponentInstanceNode,
  PIRComponentSlotOutletNode,
  PIRDocument,
  PIRElementNode,
  PIRGraphFragment,
} from '@prodivix/pir';
import {
  augmentWorkspaceOperationWithControlledSource,
  compileWorkspaceToExportProgram,
  createControlledCodeDocumentsPlan,
  createControlledCodeEditPlan,
  createPirReactModuleId,
  type ExportModule,
  type ExportProgram,
} from '@prodivix/prodivix-compiler';
import {
  applyWorkspaceCommand,
  applyWorkspaceTransaction,
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceComponentContractUpdateTransactionPlan,
  createWorkspaceComponentExtractionTransactionPlan,
  createWorkspaceComponentInstanceBindingsUpdateTransactionPlan,
  createWorkspaceComponentInstanceTransactionPlan,
  createWorkspaceHistoryState,
  createWorkspacePIRElementBatchUpdateTransactionPlan,
  createWorkspacePirProjectionPlan,
  createWorkspacePIRElementUpdateTransactionPlan,
  createWorkspacePIRGraphFragmentInsertTransactionPlan,
  createWorkspaceTransactionOperation,
  decodeWorkspacePirDocument,
  decodeWorkspaceSnapshot,
  encodeWorkspaceSnapshot,
  isWorkspaceCodeDocumentContent,
  recordWorkspaceOperation,
  redoWorkspaceHistory,
  resolveWorkspaceOperationScope,
  undoWorkspaceHistory,
  type WorkspaceOperation,
  type WorkspaceCodeDocumentContent,
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
  definitionRoot: 'checkout-form',
  definitionLabelNode: 'email-label',
  definitionActionNode: 'submit-primary',
  definitionEditedNode: 'submit-secondary',
  projectedSlotNode: 'checkout-title',
  slotOutlet: 'checkout-content-outlet',
  labelProp: 'golden-label',
  activateEvent: 'golden-activate',
  contentSlot: 'golden-content',
  toneVariant: 'golden-tone',
  neutralTone: 'golden-neutral',
  emphasisTone: 'golden-emphasis',
  controlledJsxDocument: 'code-checkout-section-controlled-jsx',
  controlledJsxNode: 'node-checkout-section-controlled-jsx',
  controlledCssDocument: 'code-checkout-section-controlled-css',
  controlledCssNode: 'node-checkout-section-controlled-css',
});

export const GOLDEN_G1_DEFAULT_DEFINITION_TEXT =
  'Save this reusable checkout for later';
export const GOLDEN_G1_CODE_EDIT_TEXT = 'Save from controlled JSX';
export const GOLDEN_G1_CODE_EDIT_COLOR = 'rebeccapurple';
export const GOLDEN_G1_VISUAL_EDIT_COLOR = 'goldenrod';
export const GOLDEN_G1_INSTANCE_LABELS = Object.freeze({
  extracted: 'Extracted checkout',
  direct: 'Direct checkout',
  nested: 'Nested checkout',
});

const GOLDEN_G1_UNMANAGED_JSX_SOURCE =
  "declare const AntdButton: any;\nexport const goldenUnmanagedValue = 'preserved';";
const GOLDEN_G1_UNMANAGED_CSS_SOURCE =
  '.golden-unmanaged { display: contents; }';

const GOLDEN_G1_ISSUED_AT = Object.freeze([
  '2026-07-14T08:10:00.000Z',
  '2026-07-14T08:11:00.000Z',
  '2026-07-14T08:12:00.000Z',
  '2026-07-14T08:13:00.000Z',
  '2026-07-14T08:14:00.000Z',
  '2026-07-14T08:15:00.000Z',
  '2026-07-14T08:16:00.000Z',
  '2026-07-14T08:17:00.000Z',
  '2026-07-14T08:18:00.000Z',
  '2026-07-14T08:19:00.000Z',
  '2026-07-14T08:20:00.000Z',
  '2026-07-14T08:21:00.000Z',
  '2026-07-14T08:22:00.000Z',
  '2026-07-14T08:23:00.000Z',
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
  contractBindingKinds: readonly string[];
  contractBoundInstanceCount: number;
  projectedSlotNodeIds: readonly string[];
  definitionUsesPublicContract: boolean;
  contractRoundTripPreserved: boolean;
  controlledProjectionCount: number;
  jsxCodeEditApplied: boolean;
  cssCodeEditApplied: boolean;
  visualSyncUpdatedBoth: boolean;
  unmanagedSourcePreserved: boolean;
  undoRestoredPreviousDefinition: boolean;
  redoRestoredEditedDefinition: boolean;
  undoRestoredControlledSources: boolean;
  redoRestoredControlledSources: boolean;
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
  controlledCodeDocumentIds: readonly string[];
  tracedContractPaths: readonly string[];
  consumerContainsContractBindings: boolean;
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

type OperationPlanResult =
  | Readonly<{ status: 'ready'; operation: WorkspaceOperation }>
  | Readonly<{ status: 'unchanged' }>
  | Readonly<{ status: 'rejected'; issues: readonly unknown[] }>;

const requireReadyOperation = (
  result: OperationPlanResult,
  stage: string
): WorkspaceOperation => {
  if (result.status === 'ready') return result.operation;
  if (result.status === 'unchanged') {
    throw new Error(`${stage}: the operation unexpectedly produced no change.`);
  }
  throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
};

const applyOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation,
  stage: string
): WorkspaceSnapshot => {
  const result =
    operation.kind === 'command'
      ? applyWorkspaceCommand(workspace, operation.command)
      : applyWorkspaceTransaction(workspace, operation.transaction);
  if (!result.ok) throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
  return result.snapshot;
};

const augmentOperation = (
  workspace: WorkspaceSnapshot,
  operation: WorkspaceOperation,
  stage: string
): WorkspaceOperation => {
  const result = augmentWorkspaceOperationWithControlledSource({
    workspace,
    operation,
  });
  if (result.status === 'ready') return result.operation;
  throw new Error(`${stage}: ${JSON.stringify(result.issues)}`);
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

const readDefinitionColor = (workspace: WorkspaceSnapshot): unknown => {
  const node = readPirDocument(
    workspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  ).ui.graph.nodesById[GOLDEN_G1_IDS.definitionEditedNode];
  const color = node?.kind === 'element' ? node.style?.color : undefined;
  return color?.kind === 'literal' ? color.value : undefined;
};

const readCodeContent = (
  workspace: WorkspaceSnapshot,
  documentId: string
): WorkspaceCodeDocumentContent => {
  const document = workspace.docsById[documentId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    throw new Error(`Missing controlled Code document: ${documentId}`);
  }
  return document.content;
};

const readControlledRegionBody = (
  workspace: WorkspaceSnapshot,
  documentId: string
): string => {
  const source = readCodeContent(workspace, documentId).source;
  const scanned = scanControlledSourceRegions(source);
  if (scanned.status === 'invalid' || scanned.regions.length !== 1) {
    throw new Error(`Invalid Golden controlled source: ${documentId}`);
  }
  return scanned.regions[0]!.body;
};

const editSingleControlledRegion = (input: {
  source: string;
  edit: (body: string) => string;
  unmanagedSource: string;
}): string => {
  const scanned = scanControlledSourceRegions(input.source);
  if (scanned.status === 'invalid' || scanned.regions.length !== 1) {
    throw new Error(
      'Golden controlled source must contain exactly one region.'
    );
  }
  const region = scanned.regions[0]!;
  const nextBody = input.edit(region.body);
  if (nextBody === region.body) {
    throw new Error('Golden controlled source edit did not change its region.');
  }
  const replaced = replaceControlledSourceRegion({
    source: input.source,
    regionId: region.id,
    body: nextBody,
  });
  if (replaced.status === 'invalid') {
    throw new Error(
      `Golden controlled source edit failed: ${JSON.stringify(replaced.issues)}`
    );
  }
  return `${replaced.source.trimEnd()}\n\n${input.unmanagedSource}\n`;
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

const createGoldenContract = (
  current: PIRComponentContract
): PIRComponentContract => ({
  ...current,
  propsById: {
    ...current.propsById,
    [GOLDEN_G1_IDS.labelProp]: {
      id: GOLDEN_G1_IDS.labelProp,
      name: 'Label',
      typeRef: 'string',
      defaultValue: 'Checkout section',
    },
  },
  eventsById: {
    ...current.eventsById,
    [GOLDEN_G1_IDS.activateEvent]: {
      id: GOLDEN_G1_IDS.activateEvent,
      name: 'Activate',
      payloadTypeRef: 'string',
    },
  },
  slotsById: {
    ...current.slotsById,
    [GOLDEN_G1_IDS.contentSlot]: {
      id: GOLDEN_G1_IDS.contentSlot,
      name: 'Content',
      minChildren: 0,
      maxChildren: 1,
      propsById: {
        [GOLDEN_G1_IDS.labelProp]: {
          id: GOLDEN_G1_IDS.labelProp,
          name: 'Label',
          typeRef: 'string',
        },
      },
    },
  },
  variantAxesById: {
    ...current.variantAxesById,
    [GOLDEN_G1_IDS.toneVariant]: {
      id: GOLDEN_G1_IDS.toneVariant,
      name: 'Tone',
      defaultOptionId: GOLDEN_G1_IDS.neutralTone,
      optionsById: {
        [GOLDEN_G1_IDS.neutralTone]: {
          id: GOLDEN_G1_IDS.neutralTone,
          name: 'Neutral',
        },
        [GOLDEN_G1_IDS.emphasisTone]: {
          id: GOLDEN_G1_IDS.emphasisTone,
          name: 'Emphasis',
        },
      },
    },
  },
});

const createInstanceBindings = (
  label: string,
  href: string,
  tone: string
): PIRComponentInstanceNode['bindings'] => ({
  props: {
    [GOLDEN_G1_IDS.labelProp]: { kind: 'literal', value: label },
  },
  events: {
    [GOLDEN_G1_IDS.activateEvent]: { kind: 'open-url', href },
  },
  variants: { [GOLDEN_G1_IDS.toneVariant]: tone },
});

const createInstance = (
  id: string,
  label: string,
  href: string,
  tone: string
): PIRComponentInstanceNode => ({
  id,
  kind: 'component-instance',
  componentDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
  bindings: createInstanceBindings(label, href, tone),
});

const createSlotOutletFragment = (): PIRGraphFragment => {
  const outlet: PIRComponentSlotOutletNode = {
    id: GOLDEN_G1_IDS.slotOutlet,
    kind: 'component-slot-outlet',
    slotMemberId: GOLDEN_G1_IDS.contentSlot,
    bindings: {
      props: {
        [GOLDEN_G1_IDS.labelProp]: {
          kind: 'component-prop',
          memberId: GOLDEN_G1_IDS.labelProp,
        },
      },
    },
  };
  return {
    rootNodeIds: [outlet.id],
    primaryNodeId: outlet.id,
    nodesById: { [outlet.id]: outlet },
    childIdsById: { [outlet.id]: [] },
  };
};

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
  operation: WorkspaceOperation,
  operations: WorkspaceOperation[],
  stage: string,
  controlled = true
): WorkspaceSnapshot => {
  const prepared = controlled
    ? augmentOperation(workspace, operation, `${stage} controlled sync`)
    : operation;
  const next = applyOperation(workspace, prepared, stage);
  operations.push(prepared);
  return next;
};

const applyTransactionAndCollect = (
  workspace: WorkspaceSnapshot,
  transaction: WorkspaceTransactionEnvelope,
  operations: WorkspaceOperation[],
  stage: string,
  controlled = true
): WorkspaceSnapshot =>
  applyAndCollect(
    workspace,
    createWorkspaceTransactionOperation(transaction),
    operations,
    stage,
    controlled
  );

/** Authors the G1 Component/Collection journey only through public planners. */
export const authorGoldenG1Workspace = (
  definitionText = GOLDEN_G1_DEFAULT_DEFINITION_TEXT
): GoldenG1AuthoringResult => {
  if (
    definitionText === 'Save for later' ||
    definitionText === GOLDEN_G1_CODE_EDIT_TEXT
  ) {
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
  let workspace = applyTransactionAndCollect(
    baseWorkspace,
    extractionPlan.transaction,
    operations,
    'apply checkout extraction',
    false
  );
  const extractedWorkspace = workspace;

  const extractedDefinition = readPirDocument(
    workspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  );
  if (!extractedDefinition.componentContract) {
    throw new Error('Extracted Golden Component must own a public Contract.');
  }
  const contractPlan = requireReadyPlan(
    createWorkspaceComponentContractUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-publish-component-contract',
      issuedAt: GOLDEN_G1_ISSUED_AT[1]!,
      componentDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      componentContract: createGoldenContract(
        extractedDefinition.componentContract
      ),
    }),
    'publish Component Contract'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    contractPlan.transaction,
    operations,
    'apply Component Contract',
    false
  );

  const contractedDefinition = readPirDocument(
    workspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  );
  const definitionRoot =
    contractedDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionRoot];
  const definitionLabel =
    contractedDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionLabelNode];
  const definitionAction =
    contractedDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionActionNode];
  if (
    definitionRoot?.kind !== 'element' ||
    definitionLabel?.kind !== 'element' ||
    definitionAction?.kind !== 'element'
  ) {
    throw new Error('Golden Contract Definition nodes must be Elements.');
  }
  const definitionBindingPlan = requireReadyPlan(
    createWorkspacePIRElementBatchUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-bind-component-contract',
      issuedAt: GOLDEN_G1_ISSUED_AT[2]!,
      documentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      updates: [
        {
          nodeId: definitionRoot.id,
          node: {
            ...definitionRoot,
            props: {
              ...definitionRoot.props,
              'data-golden-tone': {
                kind: 'component-variant',
                memberId: GOLDEN_G1_IDS.toneVariant,
              },
            },
          },
        },
        {
          nodeId: definitionLabel.id,
          node: {
            ...definitionLabel,
            text: {
              kind: 'component-prop',
              memberId: GOLDEN_G1_IDS.labelProp,
            },
          },
        },
        {
          nodeId: definitionAction.id,
          node: {
            ...definitionAction,
            events: {
              ...definitionAction.events,
              click: {
                kind: 'emit-component-event',
                memberId: GOLDEN_G1_IDS.activateEvent,
                payload: {
                  kind: 'component-prop',
                  memberId: GOLDEN_G1_IDS.labelProp,
                },
              },
            },
          },
        },
      ],
    }),
    'bind Component Definition to Contract'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    definitionBindingPlan.transaction,
    operations,
    'apply Component Definition Contract bindings',
    false
  );

  const slotOutletPlan = requireReadyPlan(
    createWorkspacePIRGraphFragmentInsertTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-slot-outlet',
      issuedAt: GOLDEN_G1_ISSUED_AT[3]!,
      documentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      fragment: createSlotOutletFragment(),
      target: {
        parentId: GOLDEN_G1_IDS.definitionRoot,
        index:
          readPirDocument(workspace, GOLDEN_G1_IDS.checkoutSectionComponent).ui
            .graph.childIdsById[GOLDEN_G1_IDS.definitionRoot]?.length ?? 0,
      },
    }),
    'insert Component Slot Outlet'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    slotOutletPlan.transaction,
    operations,
    'apply Component Slot Outlet',
    false
  );

  const controlledDocumentsOperation = requireReadyOperation(
    createControlledCodeDocumentsPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      pirDocumentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      parentNodeId: workspace.treeRootId,
      jsx: {
        codeDocumentId: GOLDEN_G1_IDS.controlledJsxDocument,
        nodeId: GOLDEN_G1_IDS.controlledJsxNode,
        name: 'checkout-section.controlled.tsx',
      },
      css: {
        codeDocumentId: GOLDEN_G1_IDS.controlledCssDocument,
        nodeId: GOLDEN_G1_IDS.controlledCssNode,
        name: 'checkout-section.controlled.css',
      },
      operationId: 'golden-g1-create-controlled-code',
      issuedAt: GOLDEN_G1_ISSUED_AT[4]!,
    }),
    'create controlled JSX and CSS'
  );
  workspace = applyAndCollect(
    workspace,
    controlledDocumentsOperation,
    operations,
    'apply controlled JSX and CSS creation'
  );

  const extractedInstance = readPirDocument(workspace, GOLDEN_IDS.checkoutPage)
    .ui.graph.nodesById[GOLDEN_G1_IDS.extractedInstance];
  if (extractedInstance?.kind !== 'component-instance') {
    throw new Error('Extracted Golden node must remain a Component Instance.');
  }
  const extractedPublicBindings = createInstanceBindings(
    GOLDEN_G1_INSTANCE_LABELS.extracted,
    '/checkout/extracted',
    GOLDEN_G1_IDS.neutralTone
  );
  const extractedBindingsPlan = requireReadyPlan(
    createWorkspaceComponentInstanceBindingsUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-bind-extracted-instance',
      issuedAt: GOLDEN_G1_ISSUED_AT[5]!,
      documentId: GOLDEN_IDS.checkoutPage,
      instanceNodeId: GOLDEN_G1_IDS.extractedInstance,
      bindings: {
        props: {
          ...extractedInstance.bindings.props,
          ...extractedPublicBindings.props,
        },
        events: {
          ...extractedInstance.bindings.events,
          ...extractedPublicBindings.events,
        },
        variants: {
          ...extractedInstance.bindings.variants,
          ...extractedPublicBindings.variants,
        },
      },
    }),
    'bind extracted Component Instance'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    extractedBindingsPlan.transaction,
    operations,
    'apply extracted Component Instance bindings'
  );

  const directInstancePlan = requireReadyPlan(
    createWorkspaceComponentInstanceTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-direct-instance',
      issuedAt: GOLDEN_G1_ISSUED_AT[6]!,
      sourceDocumentId: GOLDEN_IDS.checkoutPage,
      instance: createInstance(
        GOLDEN_G1_IDS.directInstance,
        GOLDEN_G1_INSTANCE_LABELS.direct,
        '/checkout/direct',
        GOLDEN_G1_IDS.emphasisTone
      ),
      placement: { parentId: 'checkout-root', index: 2 },
      slotRegions: {
        [GOLDEN_G1_IDS.contentSlot]: [GOLDEN_G1_IDS.projectedSlotNode],
      },
    }),
    'insert direct Component Instance'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    directInstancePlan.transaction,
    operations,
    'apply direct Component Instance'
  );

  const projectedSlotNode = readPirDocument(workspace, GOLDEN_IDS.checkoutPage)
    .ui.graph.nodesById[GOLDEN_G1_IDS.projectedSlotNode];
  if (projectedSlotNode?.kind !== 'element') {
    throw new Error('Golden projected Slot node must remain an Element.');
  }
  const projectedSlotBindingPlan = requireReadyPlan(
    createWorkspacePIRElementUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-bind-projected-slot-content',
      issuedAt: GOLDEN_G1_ISSUED_AT[7]!,
      documentId: GOLDEN_IDS.checkoutPage,
      nodeId: projectedSlotNode.id,
      node: {
        ...projectedSlotNode,
        text: {
          kind: 'slot-prop',
          memberId: GOLDEN_G1_IDS.labelProp,
        },
      },
    }),
    'bind projected Slot content'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    projectedSlotBindingPlan.transaction,
    operations,
    'apply projected Slot content binding'
  );

  const nestedInstancePlan = requireReadyPlan(
    createWorkspaceComponentInstanceTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-insert-nested-instance',
      issuedAt: GOLDEN_G1_ISSUED_AT[8]!,
      sourceDocumentId: GOLDEN_IDS.checkoutPage,
      instance: createInstance(
        GOLDEN_G1_IDS.nestedInstance,
        GOLDEN_G1_INSTANCE_LABELS.nested,
        '/checkout/nested',
        GOLDEN_G1_IDS.neutralTone
      ),
      placement: { parentId: 'checkout-root', index: 2 },
      slotRegions: { [GOLDEN_G1_IDS.contentSlot]: [] },
    }),
    'insert nested Component Instance'
  );
  workspace = applyTransactionAndCollect(
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
      issuedAt: GOLDEN_G1_ISSUED_AT[9]!,
      documentId: GOLDEN_IDS.checkoutPage,
      collection: createCollection(GOLDEN_G1_IDS.innerCollection, 'inner'),
      placement: { parentId: 'checkout-root', index: 2 },
      regions: { item: [GOLDEN_G1_IDS.nestedInstance] },
    }),
    'insert inner Collection'
  );
  workspace = applyTransactionAndCollect(
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
      issuedAt: GOLDEN_G1_ISSUED_AT[10]!,
      documentId: GOLDEN_IDS.checkoutPage,
      collection: createCollection(GOLDEN_G1_IDS.outerCollection, 'outer'),
      placement: { parentId: 'checkout-root', index: 2 },
      regions: { item: [GOLDEN_G1_IDS.innerCollection] },
    }),
    'insert outer Collection'
  );
  workspace = applyTransactionAndCollect(
    workspace,
    outerCollectionPlan.transaction,
    operations,
    'apply outer Collection'
  );

  const jsxContent = readCodeContent(
    workspace,
    GOLDEN_G1_IDS.controlledJsxDocument
  );
  const jsxSource = editSingleControlledRegion({
    source: jsxContent.source,
    edit: (body) => {
      const previous = JSON.stringify('Save for later');
      const next = JSON.stringify(GOLDEN_G1_CODE_EDIT_TEXT);
      return body.includes(previous) ? body.replace(previous, next) : body;
    },
    unmanagedSource: GOLDEN_G1_UNMANAGED_JSX_SOURCE,
  });
  const jsxEditOperation = requireReadyOperation(
    createControlledCodeEditPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      codeDocumentId: GOLDEN_G1_IDS.controlledJsxDocument,
      source: jsxSource,
      operationId: 'golden-g1-edit-controlled-jsx',
      issuedAt: GOLDEN_G1_ISSUED_AT[11]!,
    }),
    'edit controlled JSX'
  );
  workspace = applyAndCollect(
    workspace,
    jsxEditOperation,
    operations,
    'apply controlled JSX edit'
  );

  const cssContent = readCodeContent(
    workspace,
    GOLDEN_G1_IDS.controlledCssDocument
  );
  const cssSource = editSingleControlledRegion({
    source: cssContent.source,
    edit: (body) => {
      const emptyRule = `[data-prodivix-node-id="${GOLDEN_G1_IDS.definitionEditedNode}"] {\n}`;
      const styledRule = `[data-prodivix-node-id="${GOLDEN_G1_IDS.definitionEditedNode}"] {\n  color: ${GOLDEN_G1_CODE_EDIT_COLOR};\n}`;
      return body.includes(emptyRule)
        ? body.replace(emptyRule, styledRule)
        : body;
    },
    unmanagedSource: GOLDEN_G1_UNMANAGED_CSS_SOURCE,
  });
  const cssEditOperation = requireReadyOperation(
    createControlledCodeEditPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      codeDocumentId: GOLDEN_G1_IDS.controlledCssDocument,
      source: cssSource,
      operationId: 'golden-g1-edit-controlled-css',
      issuedAt: GOLDEN_G1_ISSUED_AT[12]!,
    }),
    'edit controlled CSS'
  );
  workspace = applyAndCollect(
    workspace,
    cssEditOperation,
    operations,
    'apply controlled CSS edit'
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
    style: {
      ...currentNode.style,
      color: { kind: 'literal', value: GOLDEN_G1_VISUAL_EDIT_COLOR },
    },
  };
  const definitionEditPlan = requireReadyPlan(
    createWorkspacePIRElementUpdateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: 'golden-g1-edit-component-definition',
      issuedAt: GOLDEN_G1_ISSUED_AT[13]!,
      documentId: GOLDEN_G1_IDS.checkoutSectionComponent,
      nodeId: GOLDEN_G1_IDS.definitionEditedNode,
      node: editedNode,
    }),
    'edit Component Definition'
  );
  workspace = applyTransactionAndCollect(
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
    { appliedAt: GOLDEN_G1_ISSUED_AT[13] }
  );
  const historyScope = resolveWorkspaceOperationScope(definitionEditOperation);
  const undone = undoWorkspaceHistory(finalWorkspace, history, historyScope, {
    clock: () => GOLDEN_G1_ISSUED_AT[13]!,
  });
  if (!undone.ok)
    throw new Error(`undo Definition: ${JSON.stringify(undone.issues)}`);
  const redone = redoWorkspaceHistory(
    undone.snapshot,
    undone.history,
    historyScope,
    { clock: () => GOLDEN_G1_ISSUED_AT[13]! }
  );
  if (!redone.ok)
    throw new Error(`redo Definition: ${JSON.stringify(redone.issues)}`);

  const reloadedWorkspace = decodeWorkspaceSnapshot(
    encodeWorkspaceSnapshot(finalWorkspace, {})
  ).workspace;
  const replayedWorkspace = operations.reduce(
    (snapshot, operation, index) =>
      applyOperation(
        snapshot,
        operation,
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
  const finalDefinition = readPirDocument(
    finalWorkspace,
    GOLDEN_G1_IDS.checkoutSectionComponent
  );
  const finalContract = finalDefinition.componentContract;
  const boundInstances = Object.values(checkout.ui.graph.nodesById).filter(
    (node): node is PIRComponentInstanceNode =>
      node.kind === 'component-instance' &&
      node.componentDocumentId === GOLDEN_G1_IDS.checkoutSectionComponent &&
      Boolean(node.bindings.props[GOLDEN_G1_IDS.labelProp]) &&
      Boolean(node.bindings.events[GOLDEN_G1_IDS.activateEvent]) &&
      Boolean(node.bindings.variants[GOLDEN_G1_IDS.toneVariant])
  );
  const projectedSlotNodeIds =
    checkout.ui.graph.regionsById?.[GOLDEN_G1_IDS.directInstance]?.[
      GOLDEN_G1_IDS.contentSlot
    ] ?? [];
  const finalDefinitionRoot =
    finalDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionRoot];
  const finalDefinitionLabel =
    finalDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionLabelNode];
  const finalDefinitionAction =
    finalDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.definitionActionNode];
  const finalSlotOutlet =
    finalDefinition.ui.graph.nodesById[GOLDEN_G1_IDS.slotOutlet];
  const finalProjectedSlotNode =
    checkout.ui.graph.nodesById[GOLDEN_G1_IDS.projectedSlotNode];
  const definitionUsesPublicContract =
    finalDefinitionRoot?.kind === 'element' &&
    finalDefinitionRoot.props?.['data-golden-tone']?.kind ===
      'component-variant' &&
    finalDefinitionRoot.props['data-golden-tone'].memberId ===
      GOLDEN_G1_IDS.toneVariant &&
    finalDefinitionLabel?.kind === 'element' &&
    finalDefinitionLabel.text?.kind === 'component-prop' &&
    finalDefinitionLabel.text.memberId === GOLDEN_G1_IDS.labelProp &&
    finalDefinitionAction?.kind === 'element' &&
    finalDefinitionAction.events?.click?.kind === 'emit-component-event' &&
    finalDefinitionAction.events.click.memberId ===
      GOLDEN_G1_IDS.activateEvent &&
    finalSlotOutlet?.kind === 'component-slot-outlet' &&
    finalSlotOutlet.slotMemberId === GOLDEN_G1_IDS.contentSlot &&
    finalProjectedSlotNode?.kind === 'element' &&
    finalProjectedSlotNode.text?.kind === 'slot-prop' &&
    finalProjectedSlotNode.text.memberId === GOLDEN_G1_IDS.labelProp;
  const contractBindingKinds = [
    ...(finalContract?.propsById[GOLDEN_G1_IDS.labelProp] &&
    boundInstances.length === instanceNodeIds.length
      ? ['props']
      : []),
    ...(finalContract?.eventsById[GOLDEN_G1_IDS.activateEvent] &&
    boundInstances.length === instanceNodeIds.length
      ? ['events']
      : []),
    ...(finalContract?.slotsById[GOLDEN_G1_IDS.contentSlot] &&
    projectedSlotNodeIds.includes(GOLDEN_G1_IDS.projectedSlotNode)
      ? ['slots']
      : []),
    ...(finalContract?.variantAxesById[GOLDEN_G1_IDS.toneVariant] &&
    boundInstances.length === instanceNodeIds.length
      ? ['variants']
      : []),
  ];
  const contractRoundTripPreserved = [
    reloadedWorkspace,
    replayedWorkspace,
  ].every(
    (candidate) =>
      isDeepStrictEqual(
        readPirDocument(candidate, GOLDEN_G1_IDS.checkoutSectionComponent)
          .componentContract,
        finalContract
      ) &&
      isDeepStrictEqual(
        readPirDocument(candidate, GOLDEN_IDS.checkoutPage).ui.graph,
        checkout.ui.graph
      )
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
          GOLDEN_G1_CODE_EDIT_TEXT &&
        readProjectionDefinitionText(afterDefinitionEditProjection) ===
          definitionText,
      contractBindingKinds,
      contractBoundInstanceCount: boundInstances.length,
      projectedSlotNodeIds,
      definitionUsesPublicContract,
      contractRoundTripPreserved,
      controlledProjectionCount: [
        GOLDEN_G1_IDS.controlledJsxDocument,
        GOLDEN_G1_IDS.controlledCssDocument,
      ].filter((documentId) => finalWorkspace.docsById[documentId]).length,
      jsxCodeEditApplied:
        readDefinitionText(beforeDefinitionEditWorkspace) ===
        GOLDEN_G1_CODE_EDIT_TEXT,
      cssCodeEditApplied:
        readDefinitionColor(beforeDefinitionEditWorkspace) ===
        GOLDEN_G1_CODE_EDIT_COLOR,
      visualSyncUpdatedBoth:
        readControlledRegionBody(
          finalWorkspace,
          GOLDEN_G1_IDS.controlledJsxDocument
        ).includes(JSON.stringify(definitionText)) &&
        readControlledRegionBody(
          finalWorkspace,
          GOLDEN_G1_IDS.controlledCssDocument
        ).includes(`color: ${GOLDEN_G1_VISUAL_EDIT_COLOR};`),
      unmanagedSourcePreserved:
        readCodeContent(
          finalWorkspace,
          GOLDEN_G1_IDS.controlledJsxDocument
        ).source.includes(GOLDEN_G1_UNMANAGED_JSX_SOURCE) &&
        readCodeContent(
          finalWorkspace,
          GOLDEN_G1_IDS.controlledCssDocument
        ).source.includes(GOLDEN_G1_UNMANAGED_CSS_SOURCE),
      undoRestoredPreviousDefinition:
        readDefinitionText(undone.snapshot) === GOLDEN_G1_CODE_EDIT_TEXT,
      redoRestoredEditedDefinition:
        readDefinitionText(redone.snapshot) === definitionText,
      undoRestoredControlledSources:
        readCodeContent(undone.snapshot, GOLDEN_G1_IDS.controlledJsxDocument)
          .source ===
          readCodeContent(
            beforeDefinitionEditWorkspace,
            GOLDEN_G1_IDS.controlledJsxDocument
          ).source &&
        readCodeContent(undone.snapshot, GOLDEN_G1_IDS.controlledCssDocument)
          .source ===
          readCodeContent(
            beforeDefinitionEditWorkspace,
            GOLDEN_G1_IDS.controlledCssDocument
          ).source,
      redoRestoredControlledSources:
        readCodeContent(redone.snapshot, GOLDEN_G1_IDS.controlledJsxDocument)
          .source ===
          readCodeContent(finalWorkspace, GOLDEN_G1_IDS.controlledJsxDocument)
            .source &&
        readCodeContent(redone.snapshot, GOLDEN_G1_IDS.controlledCssDocument)
          .source ===
          readCodeContent(finalWorkspace, GOLDEN_G1_IDS.controlledCssDocument)
            .source,
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

const collectTracedContractPaths = (
  modules: readonly ExportModule[]
): string[] =>
  [
    ...new Set(
      modules.flatMap(({ sourceTrace }) =>
        sourceTrace.flatMap(({ sourceRef }) =>
          sourceRef.id === GOLDEN_G1_IDS.checkoutSectionComponent &&
          sourceRef.path?.startsWith('/componentContract/')
            ? [sourceRef.path]
            : []
        )
      )
    ),
  ].sort();

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
      controlledCodeDocumentIds: [
        ...(program.modules.some(
          ({ id }) =>
            id === `workspace-code:${GOLDEN_G1_IDS.controlledJsxDocument}`
        )
          ? [GOLDEN_G1_IDS.controlledJsxDocument]
          : []),
        ...(program.files.some(
          ({ id }) =>
            id === `workspace-code-file:${GOLDEN_G1_IDS.controlledCssDocument}`
        )
          ? [GOLDEN_G1_IDS.controlledCssDocument]
          : []),
      ],
      tracedContractPaths: collectTracedContractPaths([
        definitionModule,
        consumerModule,
      ]),
      consumerContainsContractBindings:
        Object.values(GOLDEN_G1_INSTANCE_LABELS).every((label) =>
          consumerModule.body.includes(label)
        ) &&
        ['/checkout/extracted', '/checkout/direct', '/checkout/nested'].every(
          (href) => consumerModule.body.includes(href)
        ) &&
        consumerModule.body.includes(GOLDEN_G1_IDS.emphasisTone),
    },
  };
};
