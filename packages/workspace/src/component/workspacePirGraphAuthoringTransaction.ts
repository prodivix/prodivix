import {
  deletePirGraphSubtree,
  duplicatePirGraphSubtree,
  insertPirGraphFragment,
  movePirGraphSubtree,
  unwrapPirCollection,
  updatePirElementNode,
  updatePirElementNodes,
  type PIRComponentMutationIssueCode,
  type PIRElementNode,
  type PIRGraphDuplicateIdKind,
  type PIRGraphPlacementTarget,
  type PIRDocument,
  type PIRGraphFragment,
} from '@prodivix/pir';
import type {
  WorkspaceCommandEnvelope,
  WorkspaceTransactionEnvelope,
} from '../workspaceCommand';
import type { WorkspaceSnapshot } from '../types';
import {
  type WorkspaceComponentGraphIssueCode,
  validateWorkspaceComponentGraph,
} from './workspaceComponentGraph';
import { decodeWorkspacePirDocument } from './workspacePirDocument';

export const WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES = Object.freeze({
  baseRevisionMismatch: 'WKS_PIR_GRAPH_BASE_REVISION_MISMATCH',
  inputInvalid: 'WKS_PIR_GRAPH_INPUT_INVALID',
  documentMissing: 'WKS_PIR_GRAPH_DOCUMENT_MISSING',
  documentTypeInvalid: 'WKS_PIR_GRAPH_DOCUMENT_TYPE_INVALID',
  documentInvalid: 'WKS_PIR_GRAPH_DOCUMENT_INVALID',
  unchanged: 'WKS_PIR_GRAPH_UNCHANGED',
});

type WorkspacePIRGraphAuthoringOwnIssueCode =
  (typeof WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES)[keyof typeof WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES];

export type WorkspacePIRGraphAuthoringIssueCode =
  | WorkspacePIRGraphAuthoringOwnIssueCode
  | PIRComponentMutationIssueCode
  | WorkspaceComponentGraphIssueCode;

export type WorkspacePIRGraphAuthoringIssue = Readonly<{
  code: WorkspacePIRGraphAuthoringIssueCode;
  path: string;
  message: string;
  documentId?: string;
  nodeId?: string;
  targetDocumentId?: string;
  causeCode?: string;
}>;

type WorkspacePIRGraphAuthoringInputBase = Readonly<{
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  transactionId: string;
  issuedAt: string;
  documentId: string;
}>;

export type CreateWorkspacePIRSubtreeMoveTransactionInput =
  WorkspacePIRGraphAuthoringInputBase &
    Readonly<{
      nodeId: string;
      target: PIRGraphPlacementTarget;
    }>;

export type CreateWorkspacePIRGraphFragmentInsertTransactionInput =
  WorkspacePIRGraphAuthoringInputBase &
    Readonly<{
      fragment: PIRGraphFragment;
      target: PIRGraphPlacementTarget;
    }>;

export type CreateWorkspacePIRSubtreeDeleteTransactionInput =
  WorkspacePIRGraphAuthoringInputBase & Readonly<{ nodeId: string }>;

export type CreateWorkspacePIRSubtreeDuplicateTransactionInput =
  WorkspacePIRGraphAuthoringInputBase &
    Readonly<{
      nodeId: string;
      target: PIRGraphPlacementTarget;
      createId: (kind: PIRGraphDuplicateIdKind, sourceId: string) => string;
    }>;

export type CreateWorkspacePIRElementUpdateTransactionInput =
  WorkspacePIRGraphAuthoringInputBase &
    Readonly<{
      nodeId: string;
      node: PIRElementNode;
    }>;

export type CreateWorkspacePIRElementBatchUpdateTransactionInput =
  WorkspacePIRGraphAuthoringInputBase &
    Readonly<{
      updates: readonly Readonly<{
        nodeId: string;
        node: PIRElementNode;
      }>[];
    }>;

export type CreateWorkspacePIRCollectionUnwrapTransactionInput =
  WorkspacePIRGraphAuthoringInputBase & Readonly<{ nodeId: string }>;

export type WorkspacePIRGraphAuthoringTransactionPlan = Readonly<{
  baseRevision: number;
  documentId: string;
  command: WorkspaceCommandEnvelope;
  transaction: WorkspaceTransactionEnvelope;
  nextDocumentContent: PIRDocument;
  selectedNodeId?: string;
}>;

export type WorkspacePIRGraphAuthoringTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspacePIRGraphAuthoringTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspacePIRGraphAuthoringIssue[];
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: WorkspacePIRGraphAuthoringIssue,
  right: WorkspacePIRGraphAuthoringIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message);

const reject = (
  issues: readonly WorkspacePIRGraphAuthoringIssue[]
): WorkspacePIRGraphAuthoringTransactionPlanResult =>
  Object.freeze({
    status: 'rejected',
    issues: Object.freeze([...issues].sort(compareIssues)),
  });

const validateEnvelope = (
  input: WorkspacePIRGraphAuthoringInputBase & Readonly<{ nodeId?: string }>
): readonly WorkspacePIRGraphAuthoringIssue[] => {
  const issues: WorkspacePIRGraphAuthoringIssue[] = [];
  if (
    !Number.isSafeInteger(input.baseRevision) ||
    input.baseRevision !== input.workspace.workspaceRev
  ) {
    issues.push({
      code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.baseRevisionMismatch,
      path: '/baseRevision',
      message: `Base revision must equal Workspace revision ${input.workspace.workspaceRev}.`,
      documentId: input.documentId,
    });
  }
  const fields: readonly (readonly [string, string, string])[] = [
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
    ['/documentId', input.documentId, 'Document id'],
    ...(input.nodeId === undefined
      ? []
      : ([['/nodeId', input.nodeId, 'Node id']] as const)),
  ];
  for (const [path, value, label] of fields) {
    if (value.length > 0 && value === value.trim()) continue;
    issues.push({
      code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
      documentId: input.documentId,
    });
  }
  return issues;
};

const readDocument = (
  input: WorkspacePIRGraphAuthoringInputBase
):
  | Readonly<{ ok: true; content: PIRDocument }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspacePIRGraphAuthoringIssue[];
    }> => {
  const document = input.workspace.docsById[input.documentId];
  if (!document) {
    return {
      ok: false,
      issues: [
        {
          code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.documentMissing,
          path: `/docsById/${input.documentId}`,
          message: 'The PIR authoring document does not exist.',
          documentId: input.documentId,
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
          code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.documentTypeInvalid,
          path: `/docsById/${input.documentId}/type`,
          message:
            'PIR graph authoring requires a page, layout, or Component document.',
          documentId: input.documentId,
        },
      ],
    };
  }
  const read = decodeWorkspacePirDocument(document, {
    workspaceId: input.workspace.id,
  });
  if (read.status !== 'valid') {
    return {
      ok: false,
      issues:
        'issues' in read
          ? read.issues.map((issue) => ({
              code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.documentInvalid,
              path: issue.path,
              message: issue.message,
              documentId: input.documentId,
              ...(issue.code ? { causeCode: issue.code } : {}),
            }))
          : [
              {
                code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.documentTypeInvalid,
                path: `/docsById/${input.documentId}/type`,
                message:
                  'PIR graph authoring requires a canonical PIR document.',
                documentId: input.documentId,
              },
            ],
    };
  }
  return { ok: true, content: read.decodedContent };
};

const graphIssueKey = (issue: {
  code: string;
  path: string;
  documentId: string;
  nodeId?: string;
  targetDocumentId?: string;
}): string =>
  [
    issue.code,
    issue.path,
    issue.documentId,
    issue.nodeId ?? '',
    issue.targetDocumentId ?? '',
  ].join('\u0000');

const collectIntroducedGraphIssues = (
  workspace: WorkspaceSnapshot,
  documentId: string,
  content: PIRDocument
): readonly WorkspacePIRGraphAuthoringIssue[] => {
  const baseline = validateWorkspaceComponentGraph(workspace);
  const baselineKeys = new Set(baseline.issues.map(graphIssueKey));
  const document = workspace.docsById[documentId]!;
  const candidate: WorkspaceSnapshot = {
    ...workspace,
    docsById: {
      ...workspace.docsById,
      [documentId]: { ...document, content },
    },
  };
  return validateWorkspaceComponentGraph(candidate).issues.filter(
    (issue) => !baselineKeys.has(graphIssueKey(issue))
  );
};

const completePlan = (input: {
  envelope: WorkspacePIRGraphAuthoringInputBase;
  before: PIRDocument;
  after: PIRDocument;
  operation:
    | 'fragment-insert'
    | 'move'
    | 'delete'
    | 'duplicate'
    | 'element-update'
    | 'element-batch-update'
    | 'collection-unwrap';
  selectedNodeId?: string;
}): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const introduced = collectIntroducedGraphIssues(
    input.envelope.workspace,
    input.envelope.documentId,
    input.after
  );
  if (introduced.length > 0) return reject(introduced);
  const operation = {
    'fragment-insert': {
      namespace: 'core.pir.graph',
      type: 'fragment.insert',
      label: 'Insert PIR graph fragment',
    },
    move: {
      namespace: 'core.pir.graph',
      type: 'subtree.move',
      label: 'Move PIR subtree',
    },
    delete: {
      namespace: 'core.pir.graph',
      type: 'subtree.delete',
      label: 'Delete PIR subtree',
    },
    duplicate: {
      namespace: 'core.pir.graph',
      type: 'subtree.duplicate',
      label: 'Duplicate PIR subtree',
    },
    'element-update': {
      namespace: 'core.pir.element',
      type: 'element.update',
      label: 'Update PIR element',
    },
    'element-batch-update': {
      namespace: 'core.pir.element',
      type: 'element.batch-update',
      label: 'Update PIR elements',
    },
    'collection-unwrap': {
      namespace: 'core.pir.collection',
      type: 'collection.unwrap',
      label: 'Unwrap PIR collection',
    },
  }[input.operation];
  const label = operation.label;
  const command: WorkspaceCommandEnvelope = {
    id: `${input.envelope.transactionId}:document`,
    namespace: operation.namespace,
    type: operation.type,
    version: '1.0',
    issuedAt: input.envelope.issuedAt,
    target: {
      workspaceId: input.envelope.workspace.id,
      documentId: input.envelope.documentId,
    },
    domainHint: 'pir',
    label,
    forwardOps: [
      { op: 'replace', path: '/ui/graph', value: input.after.ui.graph },
    ],
    reverseOps: [
      { op: 'replace', path: '/ui/graph', value: input.before.ui.graph },
    ],
  };
  const transaction: WorkspaceTransactionEnvelope = {
    id: input.envelope.transactionId,
    workspaceId: input.envelope.workspace.id,
    issuedAt: input.envelope.issuedAt,
    label,
    commands: [command],
  };
  return Object.freeze({
    status: 'ready',
    plan: Object.freeze({
      baseRevision: input.envelope.baseRevision,
      documentId: input.envelope.documentId,
      command,
      transaction,
      nextDocumentContent: input.after,
      ...(input.selectedNodeId ? { selectedNodeId: input.selectedNodeId } : {}),
    }),
  });
};

/** Plans insertion of one validated normalized fragment through Workspace History. */
export const createWorkspacePIRGraphFragmentInsertTransactionPlan = (
  input: CreateWorkspacePIRGraphFragmentInsertTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = insertPirGraphFragment({
    document: read.content,
    fragment: input.fragment,
    target: input.target,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
      }))
    );
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'fragment-insert',
    selectedNodeId: mutation.primaryNodeId,
  });
};

export const createWorkspacePIRSubtreeMoveTransactionPlan = (
  input: CreateWorkspacePIRSubtreeMoveTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = movePirGraphSubtree({
    document: read.content,
    nodeId: input.nodeId,
    target: input.target,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
        nodeId: input.nodeId,
      }))
    );
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.unchanged,
        path: '/target',
        message: 'The subtree is already at the requested placement.',
        documentId: input.documentId,
        nodeId: input.nodeId,
      },
    ]);
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'move',
    selectedNodeId: input.nodeId,
  });
};

export const createWorkspacePIRSubtreeDeleteTransactionPlan = (
  input: CreateWorkspacePIRSubtreeDeleteTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = deletePirGraphSubtree({
    document: read.content,
    nodeId: input.nodeId,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
        nodeId: input.nodeId,
      }))
    );
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'delete',
  });
};

export const createWorkspacePIRSubtreeDuplicateTransactionPlan = (
  input: CreateWorkspacePIRSubtreeDuplicateTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = duplicatePirGraphSubtree({
    document: read.content,
    nodeId: input.nodeId,
    target: input.target,
    createId: input.createId,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
        nodeId: input.nodeId,
      }))
    );
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'duplicate',
    selectedNodeId: mutation.duplicatedRootNodeId,
  });
};

/** Plans a stable-identity element field replacement through one transaction. */
export const createWorkspacePIRElementUpdateTransactionPlan = (
  input: CreateWorkspacePIRElementUpdateTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = updatePirElementNode({
    document: read.content,
    nodeId: input.nodeId,
    node: input.node,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
        nodeId: input.nodeId,
      }))
    );
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.unchanged,
        path: '/node',
        message: 'The element update does not change the canonical node.',
        documentId: input.documentId,
        nodeId: input.nodeId,
      },
    ]);
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'element-update',
    selectedNodeId: input.nodeId,
  });
};

/** Plans a validated multi-element replacement as one reversible transaction. */
export const createWorkspacePIRElementBatchUpdateTransactionPlan = (
  input: CreateWorkspacePIRElementBatchUpdateTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = [...validateEnvelope(input)];
  const seenNodeIds = new Set<string>();
  input.updates.forEach((update, index) => {
    if (!update.nodeId || update.nodeId !== update.nodeId.trim()) {
      envelopeIssues.push({
        code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.inputInvalid,
        path: `/updates/${index}/nodeId`,
        message: 'Node id must be non-empty and trimmed.',
        documentId: input.documentId,
      });
    }
    if (seenNodeIds.has(update.nodeId)) {
      envelopeIssues.push({
        code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.inputInvalid,
        path: `/updates/${index}/nodeId`,
        message: 'Batch element updates must target each node once.',
        documentId: input.documentId,
        nodeId: update.nodeId,
      });
    }
    seenNodeIds.add(update.nodeId);
  });
  if (input.updates.length === 0) {
    envelopeIssues.push({
      code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.inputInvalid,
      path: '/updates',
      message: 'Batch element authoring requires at least one update.',
      documentId: input.documentId,
    });
  }
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = updatePirElementNodes({
    document: read.content,
    updates: input.updates,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((mutationIssue) => ({
        ...mutationIssue,
        documentId: input.documentId,
      }))
    );
  }
  if (!mutation.changed) {
    return reject([
      {
        code: WORKSPACE_PIR_GRAPH_AUTHORING_ISSUE_CODES.unchanged,
        path: '/updates',
        message: 'The element updates do not change the canonical document.',
        documentId: input.documentId,
      },
    ]);
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'element-batch-update',
    selectedNodeId: input.updates[0]?.nodeId,
  });
};

/** Plans removal of a single-template Collection wrapper without losing its item. */
export const createWorkspacePIRCollectionUnwrapTransactionPlan = (
  input: CreateWorkspacePIRCollectionUnwrapTransactionInput
): WorkspacePIRGraphAuthoringTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);
  const read = readDocument(input);
  if (!read.ok) return reject(read.issues);
  const mutation = unwrapPirCollection({
    document: read.content,
    collectionId: input.nodeId,
  });
  if (!mutation.ok) {
    return reject(
      mutation.issues.map((issue) => ({
        ...issue,
        documentId: input.documentId,
        nodeId: input.nodeId,
      }))
    );
  }
  return completePlan({
    envelope: input,
    before: read.content,
    after: mutation.document,
    operation: 'collection-unwrap',
    selectedNodeId: mutation.promotedNodeId,
  });
};
