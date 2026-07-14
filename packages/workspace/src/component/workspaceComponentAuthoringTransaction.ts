import {
  insertPirCollection,
  insertPirComponentInstance,
  replacePirComponentContract,
  updatePirCollection,
  updatePirComponentInstanceBindings,
  type PIRCollectionNode,
  type PIRCollectionRegions,
  type PIRComponentInstanceBindings,
  type PIRComponentContract,
  type PIRComponentInstanceNode,
  type PIRComponentMutationIssue,
  type PIRComponentMutationIssueCode,
  type PIRComponentSlotRegions,
  type PIRDocument,
  type PIRGraphPlacementTarget,
} from '@prodivix/pir';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import {
  type WorkspaceComponentGraphIssue,
  type WorkspaceComponentGraphIssueCode,
  validateWorkspaceComponentGraph,
} from './workspaceComponentGraph';
import {
  decodeWorkspacePirDocument,
  type WorkspacePirReadIssue,
  type WorkspacePirReadResult,
} from './workspacePirDocument';

export const WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES = {
  baseRevisionMismatch: 'WKS_COMPONENT_AUTHORING_BASE_REVISION_MISMATCH',
  inputInvalid: 'WKS_COMPONENT_AUTHORING_INPUT_INVALID',
  sourceMissing: 'WKS_COMPONENT_AUTHORING_SOURCE_MISSING',
  sourceTypeInvalid: 'WKS_COMPONENT_AUTHORING_SOURCE_TYPE_INVALID',
  sourceInvalid: 'WKS_COMPONENT_AUTHORING_SOURCE_INVALID',
  targetMissing: 'WKS_COMPONENT_AUTHORING_TARGET_MISSING',
  targetTypeInvalid: 'WKS_COMPONENT_AUTHORING_TARGET_TYPE_INVALID',
  targetInvalid: 'WKS_COMPONENT_AUTHORING_TARGET_INVALID',
  targetContractMissing: 'WKS_COMPONENT_AUTHORING_TARGET_CONTRACT_MISSING',
  contractBreaking: 'WKS_COMPONENT_AUTHORING_CONTRACT_BREAKING',
  unchanged: 'WKS_COMPONENT_AUTHORING_UNCHANGED',
} as const;

type WorkspaceComponentAuthoringOwnIssueCode =
  (typeof WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES];

export type WorkspaceComponentAuthoringPlanIssueCode =
  | WorkspaceComponentAuthoringOwnIssueCode
  | PIRComponentMutationIssueCode
  | WorkspaceComponentGraphIssueCode;

export type WorkspaceComponentAuthoringPlanIssue = Readonly<{
  code: WorkspaceComponentAuthoringPlanIssueCode;
  path: string;
  message: string;
  documentId?: string;
  nodeId?: string;
  targetDocumentId?: string;
  causeCode?: string;
}>;

type WorkspaceComponentAuthoringPlanInputBase = Readonly<{
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  transactionId: string;
  issuedAt: string;
}>;

export type CreateWorkspaceComponentInstanceTransactionInput =
  WorkspaceComponentAuthoringPlanInputBase &
    Readonly<{
      sourceDocumentId: string;
      instance: PIRComponentInstanceNode;
      placement: PIRGraphPlacementTarget;
      slotRegions?: PIRComponentSlotRegions;
    }>;

export type CreateWorkspaceComponentContractUpdateTransactionInput =
  WorkspaceComponentAuthoringPlanInputBase &
    Readonly<{
      componentDocumentId: string;
      componentContract: PIRComponentContract;
    }>;

export type CreateWorkspaceComponentInstanceBindingsUpdateTransactionInput =
  WorkspaceComponentAuthoringPlanInputBase &
    Readonly<{
      documentId: string;
      instanceNodeId: string;
      bindings: PIRComponentInstanceBindings;
    }>;

export type CreateWorkspaceCollectionInsertTransactionInput =
  WorkspaceComponentAuthoringPlanInputBase &
    Readonly<{
      documentId: string;
      collection: PIRCollectionNode;
      placement: PIRGraphPlacementTarget;
      regions?: PIRCollectionRegions;
    }>;

export type CreateWorkspaceCollectionUpdateTransactionInput =
  WorkspaceComponentAuthoringPlanInputBase &
    Readonly<{
      documentId: string;
      collection: PIRCollectionNode;
      regions?: PIRCollectionRegions;
    }>;

export type WorkspaceComponentAuthoringTransactionPlan = Readonly<{
  baseRevision: number;
  documentId: string;
  command: WorkspaceCommandEnvelope;
  transaction: WorkspaceTransactionEnvelope;
  nextDocumentContent: PIRDocument;
}>;

export type WorkspaceComponentAuthoringTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceComponentAuthoringTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceComponentAuthoringPlanIssue[];
    }>;

type ValidWorkspacePirRead = Extract<
  WorkspacePirReadResult,
  Readonly<{ status: 'valid' }>
>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const isCanonicalRequiredText = (value: string): boolean =>
  value.length > 0 && value === value.trim();

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const compareIssues = (
  left: WorkspaceComponentAuthoringPlanIssue,
  right: WorkspaceComponentAuthoringPlanIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message) ||
  compareText(left.documentId ?? '', right.documentId ?? '') ||
  compareText(left.nodeId ?? '', right.nodeId ?? '');

const reject = (
  issues: readonly WorkspaceComponentAuthoringPlanIssue[]
): WorkspaceComponentAuthoringTransactionPlanResult => ({
  status: 'rejected',
  issues: [...issues].sort(compareIssues),
});

const validatePlanEnvelope = (
  input: WorkspaceComponentAuthoringPlanInputBase,
  idFields: readonly Readonly<{
    path: string;
    value: string;
    label: string;
  }>[]
): WorkspaceComponentAuthoringPlanIssue[] => {
  const issues: WorkspaceComponentAuthoringPlanIssue[] = [];
  if (
    !Number.isSafeInteger(input.baseRevision) ||
    input.baseRevision !== input.workspace.workspaceRev
  ) {
    issues.push({
      code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.baseRevisionMismatch,
      path: '/baseRevision',
      message: `Base revision must equal Workspace revision ${input.workspace.workspaceRev}.`,
    });
  }
  for (const { path, value, label } of [
    {
      path: '/transactionId',
      value: input.transactionId,
      label: 'Transaction id',
    },
    { path: '/issuedAt', value: input.issuedAt, label: 'Issued-at value' },
    ...idFields,
  ]) {
    if (isCanonicalRequiredText(value)) continue;
    issues.push({
      code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
    });
  }
  return issues;
};

const mapReadIssues = (
  code: WorkspaceComponentAuthoringOwnIssueCode,
  issues: readonly WorkspacePirReadIssue[]
): readonly WorkspaceComponentAuthoringPlanIssue[] =>
  issues.map((issue) => ({
    code,
    path: issue.path,
    message: issue.message,
    documentId: issue.location.documentId,
    ...(issue.code ? { causeCode: issue.code } : {}),
  }));

const readPirDocument = (
  workspace: WorkspaceSnapshot,
  documentId: string,
  role: 'source' | 'target'
):
  | Readonly<{ ok: true; read: ValidWorkspacePirRead }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceComponentAuthoringPlanIssue[];
    }> => {
  const prefix = role === 'source' ? 'source' : 'target';
  const document = hasOwn(workspace.docsById, documentId)
    ? workspace.docsById[documentId]
    : undefined;
  if (!document) {
    return {
      ok: false,
      issues: [
        {
          code:
            role === 'source'
              ? WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.sourceMissing
              : WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetMissing,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}`,
          message: `Component ${prefix} document does not exist.`,
          documentId,
        },
      ],
    };
  }
  if (
    document.type !== 'pir-page' &&
    document.type !== 'pir-layout' &&
    document.type !== 'pir-component'
  ) {
    return {
      ok: false,
      issues: [
        {
          code:
            role === 'source'
              ? WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.sourceTypeInvalid
              : WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetTypeInvalid,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}/type`,
          message: `Component ${prefix} must be a PIR Workspace document.`,
          documentId,
        },
      ],
    };
  }
  if (role === 'target' && document.type !== 'pir-component') {
    return {
      ok: false,
      issues: [
        {
          code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetTypeInvalid,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}/type`,
          message: 'Component target must be a pir-component document.',
          documentId,
        },
      ],
    };
  }

  const read = decodeWorkspacePirDocument(document, {
    workspaceId: workspace.id,
  });
  if (read.status === 'unsupported-document-type') {
    return {
      ok: false,
      issues: [
        {
          code:
            role === 'source'
              ? WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.sourceTypeInvalid
              : WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetTypeInvalid,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}/type`,
          message: `Component ${prefix} must be a PIR Workspace document.`,
          documentId,
        },
      ],
    };
  }
  if (read.status !== 'valid') {
    return {
      ok: false,
      issues: mapReadIssues(
        role === 'source'
          ? WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.sourceInvalid
          : WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetInvalid,
        read.issues
      ),
    };
  }
  if (
    role === 'source' &&
    (read.document.type === 'pir-component') !==
      (read.decodedContent.componentContract !== undefined)
  ) {
    return {
      ok: false,
      issues: [
        {
          code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.sourceInvalid,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}/content/componentContract`,
          message:
            read.document.type === 'pir-component'
              ? 'A pir-component source must own a Component Contract.'
              : 'Only a pir-component source may own a Component Contract.',
          documentId,
        },
      ],
    };
  }
  return { ok: true, read };
};

const mapMutationIssues = (
  issues: readonly PIRComponentMutationIssue[],
  documentId: string
): readonly WorkspaceComponentAuthoringPlanIssue[] =>
  issues.map((issue) => ({ ...issue, documentId }));

const graphIssueKey = (issue: WorkspaceComponentGraphIssue): string =>
  [
    issue.code,
    issue.path,
    issue.documentId,
    issue.nodeId ?? '',
    issue.targetDocumentId ?? '',
  ].join('\u0000');

const collectIntroducedGraphIssues = (
  before: WorkspaceSnapshot,
  after: WorkspaceSnapshot
): readonly WorkspaceComponentAuthoringPlanIssue[] => {
  const baseline = validateWorkspaceComponentGraph(before);
  const knownIssueKeys = new Set(baseline.issues.map(graphIssueKey));
  return validateWorkspaceComponentGraph(after).issues.filter(
    (issue) => !knownIssueKeys.has(graphIssueKey(issue))
  );
};

const replaceDocumentContent = (
  workspace: WorkspaceSnapshot,
  document: WorkspaceDocument,
  content: PIRDocument
): WorkspaceSnapshot => ({
  ...workspace,
  docsById: {
    ...workspace.docsById,
    [document.id]: { ...document, content },
  },
});

const createDocumentTransaction = (input: {
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  transactionId: string;
  issuedAt: string;
  documentId: string;
  type:
    | 'component-instance.insert'
    | 'component-instance.bindings.update'
    | 'component-contract.update'
    | 'collection.insert'
    | 'collection.update';
  label: string;
  path: '/ui/graph' | '/componentContract';
  forwardValue: PIRDocument['ui']['graph'] | PIRComponentContract;
  reverseValue: PIRDocument['ui']['graph'] | PIRComponentContract;
  nextDocumentContent: PIRDocument;
}): WorkspaceComponentAuthoringTransactionPlan => {
  const command: WorkspaceCommandEnvelope = {
    id: `${input.transactionId}:document`,
    namespace: input.type.startsWith('collection.')
      ? 'core.pir.collection'
      : 'core.pir.component',
    type: input.type,
    version: '1.0',
    issuedAt: input.issuedAt,
    target: {
      workspaceId: input.workspace.id,
      documentId: input.documentId,
    },
    domainHint: 'pir',
    label: input.label,
    forwardOps: [
      { op: 'replace', path: input.path, value: input.forwardValue },
    ],
    reverseOps: [
      { op: 'replace', path: input.path, value: input.reverseValue },
    ],
  };
  return {
    baseRevision: input.baseRevision,
    documentId: input.documentId,
    command,
    nextDocumentContent: input.nextDocumentContent,
    transaction: {
      id: input.transactionId,
      workspaceId: input.workspace.id,
      issuedAt: input.issuedAt,
      label: input.label,
      commands: [command],
    },
  };
};

const completeGraphMutationPlan = (input: {
  envelope: WorkspaceComponentAuthoringPlanInputBase;
  source: ValidWorkspacePirRead;
  nextDocumentContent: PIRDocument;
  type:
    | 'component-instance.bindings.update'
    | 'collection.insert'
    | 'collection.update';
  label: string;
}): WorkspaceComponentAuthoringTransactionPlanResult => {
  const candidate = replaceDocumentContent(
    input.envelope.workspace,
    input.source.document,
    input.nextDocumentContent
  );
  const graphIssues = collectIntroducedGraphIssues(
    input.envelope.workspace,
    candidate
  );
  if (graphIssues.length > 0) return reject(graphIssues);
  return {
    status: 'ready',
    plan: createDocumentTransaction({
      workspace: input.envelope.workspace,
      baseRevision: input.envelope.baseRevision,
      transactionId: input.envelope.transactionId,
      issuedAt: input.envelope.issuedAt,
      documentId: input.source.document.id,
      type: input.type,
      label: input.label,
      path: '/ui/graph',
      forwardValue: input.nextDocumentContent.ui.graph,
      reverseValue: input.source.document.content.ui.graph,
      nextDocumentContent: input.nextDocumentContent,
    }),
  };
};

const documentInstancePath = (
  documentId: string,
  nodeId: string,
  bindingKind: 'props' | 'events',
  memberId: string
): string =>
  `/docsById/${escapeJsonPointerSegment(documentId)}/content/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}/bindings/${bindingKind}/${escapeJsonPointerSegment(memberId)}`;

const collectBreakingContractIssues = (
  workspace: WorkspaceSnapshot,
  componentDocumentId: string,
  before: PIRComponentContract,
  after: PIRComponentContract
): readonly WorkspaceComponentAuthoringPlanIssue[] => {
  const dependencyGraph = validateWorkspaceComponentGraph(workspace).graph;
  const issues: WorkspaceComponentAuthoringPlanIssue[] = [];
  for (const edge of dependencyGraph.edges) {
    if (edge.targetDocumentId !== componentDocumentId) continue;
    const source = workspace.docsById[edge.sourceDocumentId];
    if (!source) continue;
    const sourceRead = decodeWorkspacePirDocument(source, {
      workspaceId: workspace.id,
    });
    if (sourceRead.status !== 'valid') continue;
    const node =
      sourceRead.decodedContent.ui.graph.nodesById[edge.instanceNodeId];
    if (!node || node.kind !== 'component-instance') continue;

    for (const memberId of Object.keys(node.bindings.props).sort(compareText)) {
      const previous = before.propsById[memberId];
      const next = after.propsById[memberId];
      if (!previous || !next || previous.typeRef === next.typeRef) continue;
      issues.push({
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.contractBreaking,
        path: documentInstancePath(
          edge.sourceDocumentId,
          edge.instanceNodeId,
          'props',
          memberId
        ),
        message: `Bound component prop "${memberId}" cannot change typeRef from "${previous.typeRef}" to "${next.typeRef}".`,
        documentId: edge.sourceDocumentId,
        nodeId: edge.instanceNodeId,
        targetDocumentId: componentDocumentId,
      });
    }

    for (const memberId of Object.keys(node.bindings.events).sort(
      compareText
    )) {
      const previous = before.eventsById[memberId];
      const next = after.eventsById[memberId];
      if (
        !previous ||
        !next ||
        previous.payloadTypeRef === next.payloadTypeRef
      ) {
        continue;
      }
      issues.push({
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.contractBreaking,
        path: documentInstancePath(
          edge.sourceDocumentId,
          edge.instanceNodeId,
          'events',
          memberId
        ),
        message: `Bound component event "${memberId}" cannot change payloadTypeRef.`,
        documentId: edge.sourceDocumentId,
        nodeId: edge.instanceNodeId,
        targetDocumentId: componentDocumentId,
      });
    }
  }
  return issues;
};

/**
 * Plans one document-scoped Component Instance insertion. PIR owns the graph
 * mutation; Workspace adds cross-document Contract, cardinality and DAG gates.
 */
export const createWorkspaceComponentInstanceTransactionPlan = (
  input: CreateWorkspaceComponentInstanceTransactionInput
): WorkspaceComponentAuthoringTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input, [
    {
      path: '/sourceDocumentId',
      value: input.sourceDocumentId,
      label: 'Source document id',
    },
  ]);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);

  const source = readPirDocument(
    input.workspace,
    input.sourceDocumentId,
    'source'
  );
  if (!source.ok) return reject(source.issues);
  const mutation = insertPirComponentInstance({
    document: source.read.decodedContent,
    instance: input.instance,
    target: input.placement,
    ...(input.slotRegions === undefined
      ? {}
      : { slotRegions: input.slotRegions }),
  });
  if (!mutation.ok) {
    return reject(mapMutationIssues(mutation.issues, input.sourceDocumentId));
  }
  const target = readPirDocument(
    input.workspace,
    input.instance.componentDocumentId,
    'target'
  );
  if (!target.ok) return reject(target.issues);
  if (!target.read.decodedContent.componentContract) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetContractMissing,
        path: `/docsById/${escapeJsonPointerSegment(target.read.document.id)}/content/componentContract`,
        message: 'Component target must own a Component Contract.',
        documentId: target.read.document.id,
      },
    ]);
  }

  const originalContent = source.read.document.content;
  const nextDocumentContent: PIRDocument = {
    ...originalContent,
    ui: {
      ...originalContent.ui,
      graph: mutation.document.ui.graph,
    },
  };
  const candidate = replaceDocumentContent(
    input.workspace,
    source.read.document,
    nextDocumentContent
  );
  const graphIssues = collectIntroducedGraphIssues(input.workspace, candidate);
  if (graphIssues.length > 0) return reject(graphIssues);

  const targetName =
    target.read.document.name ?? input.instance.componentDocumentId;
  return {
    status: 'ready',
    plan: createDocumentTransaction({
      workspace: input.workspace,
      baseRevision: input.baseRevision,
      transactionId: input.transactionId,
      issuedAt: input.issuedAt,
      documentId: input.sourceDocumentId,
      type: 'component-instance.insert',
      label: `Insert component ${targetName}`,
      path: '/ui/graph',
      forwardValue: mutation.document.ui.graph,
      reverseValue: originalContent.ui.graph,
      nextDocumentContent,
    }),
  };
};

/** Plans a complete typed binding-map replacement for one Component Instance. */
export const createWorkspaceComponentInstanceBindingsUpdateTransactionPlan = (
  input: CreateWorkspaceComponentInstanceBindingsUpdateTransactionInput
): WorkspaceComponentAuthoringTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input, [
    {
      path: '/documentId',
      value: input.documentId,
      label: 'Source document id',
    },
    {
      path: '/instanceNodeId',
      value: input.instanceNodeId,
      label: 'Component Instance node id',
    },
  ]);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const source = readPirDocument(input.workspace, input.documentId, 'source');
  if (!source.ok) return reject(source.issues);
  const mutation = updatePirComponentInstanceBindings({
    document: source.read.decodedContent,
    nodeId: input.instanceNodeId,
    bindings: input.bindings,
  });
  if (!mutation.ok) {
    return reject(mapMutationIssues(mutation.issues, input.documentId));
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.unchanged,
        path: `/docsById/${escapeJsonPointerSegment(input.documentId)}/content/ui/graph/nodesById/${escapeJsonPointerSegment(input.instanceNodeId)}/bindings`,
        message: 'Component Instance bindings update must change the node.',
        documentId: input.documentId,
        nodeId: input.instanceNodeId,
      },
    ]);
  }
  const nextDocumentContent: PIRDocument = {
    ...source.read.document.content,
    ui: {
      ...source.read.document.content.ui,
      graph: mutation.document.ui.graph,
    },
  };
  return completeGraphMutationPlan({
    envelope: input,
    source: source.read,
    nextDocumentContent,
    type: 'component-instance.bindings.update',
    label: `Update component instance ${input.instanceNodeId}`,
  });
};

/** Plans first-class Collection insertion and initial named regions atomically. */
export const createWorkspaceCollectionInsertTransactionPlan = (
  input: CreateWorkspaceCollectionInsertTransactionInput
): WorkspaceComponentAuthoringTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input, [
    {
      path: '/documentId',
      value: input.documentId,
      label: 'Source document id',
    },
  ]);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const source = readPirDocument(input.workspace, input.documentId, 'source');
  if (!source.ok) return reject(source.issues);
  const mutation = insertPirCollection({
    document: source.read.decodedContent,
    collection: input.collection,
    target: input.placement,
    ...(input.regions ? { regions: input.regions } : {}),
  });
  if (!mutation.ok) {
    return reject(mapMutationIssues(mutation.issues, input.documentId));
  }
  const nextDocumentContent: PIRDocument = {
    ...source.read.document.content,
    ui: {
      ...source.read.document.content.ui,
      graph: mutation.document.ui.graph,
    },
  };
  return completeGraphMutationPlan({
    envelope: input,
    source: source.read,
    nextDocumentContent,
    type: 'collection.insert',
    label: `Insert collection ${input.collection.id}`,
  });
};

/** Plans one atomic Collection node and state-region replacement. */
export const createWorkspaceCollectionUpdateTransactionPlan = (
  input: CreateWorkspaceCollectionUpdateTransactionInput
): WorkspaceComponentAuthoringTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input, [
    {
      path: '/documentId',
      value: input.documentId,
      label: 'Source document id',
    },
  ]);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const source = readPirDocument(input.workspace, input.documentId, 'source');
  if (!source.ok) return reject(source.issues);
  const mutation = updatePirCollection({
    document: source.read.decodedContent,
    collection: input.collection,
    ...(input.regions ? { regions: input.regions } : {}),
  });
  if (!mutation.ok) {
    return reject(mapMutationIssues(mutation.issues, input.documentId));
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.unchanged,
        path: `/docsById/${escapeJsonPointerSegment(input.documentId)}/content/ui/graph/nodesById/${escapeJsonPointerSegment(input.collection.id)}`,
        message: 'Collection update must change its node or regions.',
        documentId: input.documentId,
        nodeId: input.collection.id,
      },
    ]);
  }
  const nextDocumentContent: PIRDocument = {
    ...source.read.document.content,
    ui: {
      ...source.read.document.content.ui,
      graph: mutation.document.ui.graph,
    },
  };
  return completeGraphMutationPlan({
    envelope: input,
    source: source.read,
    nextDocumentContent,
    type: 'collection.update',
    label: `Update collection ${input.collection.id}`,
  });
};

/**
 * Plans one complete Component Contract replacement and rejects any update
 * that invalidates or type-breaks an existing Component Instance.
 */
export const createWorkspaceComponentContractUpdateTransactionPlan = (
  input: CreateWorkspaceComponentContractUpdateTransactionInput
): WorkspaceComponentAuthoringTransactionPlanResult => {
  const envelopeIssues = validatePlanEnvelope(input, [
    {
      path: '/componentDocumentId',
      value: input.componentDocumentId,
      label: 'Component document id',
    },
  ]);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);

  const target = readPirDocument(
    input.workspace,
    input.componentDocumentId,
    'target'
  );
  if (!target.ok) return reject(target.issues);
  const previousContract = target.read.decodedContent.componentContract;
  if (!previousContract) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.targetContractMissing,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/content/componentContract`,
        message: 'Component target must own a Component Contract.',
        documentId: input.componentDocumentId,
      },
    ]);
  }

  const mutation = replacePirComponentContract({
    document: target.read.decodedContent,
    componentContract: input.componentContract,
  });
  if (!mutation.ok) {
    return reject(
      mapMutationIssues(mutation.issues, input.componentDocumentId)
    );
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_AUTHORING_PLAN_ISSUE_CODES.unchanged,
        path: `/docsById/${escapeJsonPointerSegment(input.componentDocumentId)}/content/componentContract`,
        message: 'Component Contract update must change the current Contract.',
        documentId: input.componentDocumentId,
      },
    ]);
  }

  const originalContent = target.read.document.content;
  const nextContract = mutation.document.componentContract!;
  const nextDocumentContent: PIRDocument = {
    ...originalContent,
    componentContract: nextContract,
  };
  const candidate = replaceDocumentContent(
    input.workspace,
    target.read.document,
    nextDocumentContent
  );
  const impactIssues = collectBreakingContractIssues(
    input.workspace,
    input.componentDocumentId,
    previousContract,
    nextContract
  );
  const graphIssues = collectIntroducedGraphIssues(input.workspace, candidate);
  if (impactIssues.length > 0 || graphIssues.length > 0) {
    return reject([...impactIssues, ...graphIssues]);
  }

  const targetName = target.read.document.name ?? input.componentDocumentId;
  return {
    status: 'ready',
    plan: createDocumentTransaction({
      workspace: input.workspace,
      baseRevision: input.baseRevision,
      transactionId: input.transactionId,
      issuedAt: input.issuedAt,
      documentId: input.componentDocumentId,
      type: 'component-contract.update',
      label: `Update component contract ${targetName}`,
      path: '/componentContract',
      forwardValue: nextContract,
      reverseValue: originalContent.componentContract!,
      nextDocumentContent,
    }),
  };
};
