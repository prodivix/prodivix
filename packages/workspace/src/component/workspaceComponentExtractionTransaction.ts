import {
  analyzePirSubtreeExtraction,
  type PIRComponentPartContract,
  type PIRDocument,
  type PIRSubtreeExtractionIssue,
  type PIRSubtreeExtractionReady,
} from '@prodivix/pir';
import {
  createWorkspaceDocumentAtPathCommand,
  WorkspaceDocumentFactoryError,
} from '../workspaceDocumentFactory';
import {
  applyWorkspaceTransaction,
  type WorkspaceCommandEnvelope,
  type WorkspaceTransactionEnvelope,
  type WorkspaceTransactionIssue,
} from '../workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import {
  analyzeWorkspaceComponentExtractionReferences,
  type WorkspaceComponentExtractionPublicMemberMapping,
  type WorkspaceComponentExtractionPublicPartMapping,
  type WorkspaceComponentExtractionReferenceIssue,
  type WorkspaceComponentExtractionReferencePlan,
  type WorkspaceComponentExtractionReferenceProvider,
} from './workspaceComponentExtractionReferences';
import { decodeWorkspacePirDocument } from './workspacePirDocument';

export const WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES =
  Object.freeze({
    baseRevisionMismatch: 'WKS_COMPONENT_EXTRACTION_BASE_REVISION_MISMATCH',
    inputInvalid: 'WKS_COMPONENT_EXTRACTION_INPUT_INVALID',
    sourceMissing: 'WKS_COMPONENT_EXTRACTION_SOURCE_MISSING',
    sourceInvalid: 'WKS_COMPONENT_EXTRACTION_SOURCE_INVALID',
    pirAnalysisBlocked: 'WKS_COMPONENT_EXTRACTION_PIR_ANALYSIS_BLOCKED',
    publicPartInvalid: 'WKS_COMPONENT_EXTRACTION_PUBLIC_PART_INVALID',
    referenceAnalysisBlocked:
      'WKS_COMPONENT_EXTRACTION_REFERENCE_ANALYSIS_BLOCKED',
    documentFactoryFailed: 'WKS_COMPONENT_EXTRACTION_DOCUMENT_FACTORY_FAILED',
    transactionValidationFailed:
      'WKS_COMPONENT_EXTRACTION_TRANSACTION_VALIDATION_FAILED',
  } as const);

export type WorkspaceComponentExtractionTransactionIssueCode =
  (typeof WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES];

export type WorkspaceComponentExtractionTransactionIssue = Readonly<{
  code: WorkspaceComponentExtractionTransactionIssueCode;
  path: string;
  message: string;
  causeCode?: string;
  documentId?: string;
  nodeId?: string;
}>;

export type CreateWorkspaceComponentExtractionTransactionInput = Readonly<{
  workspace: WorkspaceSnapshot;
  baseRevision: number;
  transactionId: string;
  issuedAt: string;
  sourceDocumentId: string;
  subtreeRootId: string;
  componentDocumentId: string;
  componentPath: string;
  componentName: string;
  instanceNodeId: string;
  publicParts?: readonly PIRComponentPartContract[];
  referenceProviders?: readonly WorkspaceComponentExtractionReferenceProvider[];
}>;

export type WorkspaceComponentExtractionTransactionPlan = Readonly<{
  baseRevision: number;
  sourceDocumentId: string;
  componentDocument: WorkspaceDocument &
    Readonly<{ type: 'pir-component'; content: PIRDocument }>;
  sourceDocumentContent: PIRDocument;
  extraction: PIRSubtreeExtractionReady;
  referencePlan: WorkspaceComponentExtractionReferencePlan &
    Readonly<{ status: 'ready' }>;
  publicMemberMappings: readonly WorkspaceComponentExtractionPublicMemberMapping[];
  publicPartMappings: readonly WorkspaceComponentExtractionPublicPartMapping[];
  transaction: WorkspaceTransactionEnvelope;
}>;

export type WorkspaceComponentExtractionTransactionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspaceComponentExtractionTransactionPlan;
    }>
  | Readonly<{
      status: 'rejected';
      issues: readonly WorkspaceComponentExtractionTransactionIssue[];
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: WorkspaceComponentExtractionTransactionIssue,
  right: WorkspaceComponentExtractionTransactionIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.causeCode ?? '', right.causeCode ?? '') ||
  compareText(left.message, right.message);

const reject = (
  issues: readonly WorkspaceComponentExtractionTransactionIssue[]
): WorkspaceComponentExtractionTransactionPlanResult => ({
  status: 'rejected',
  issues: [...issues].sort(compareIssues),
});

const isCanonicalText = (value: string): boolean =>
  value.length > 0 && value === value.trim();

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const mapPirIssues = (
  issues: readonly PIRSubtreeExtractionIssue[],
  documentId: string
): readonly WorkspaceComponentExtractionTransactionIssue[] =>
  issues.map((issue) => ({
    code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.pirAnalysisBlocked,
    path: issue.path,
    message: issue.message,
    causeCode: issue.code,
    documentId,
  }));

const mapReferenceIssues = (
  issues: readonly WorkspaceComponentExtractionReferenceIssue[]
): readonly WorkspaceComponentExtractionTransactionIssue[] =>
  issues.map((issue) => ({
    code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.referenceAnalysisBlocked,
    path: issue.path,
    message: issue.message,
    causeCode: issue.code,
    ...(issue.documentId ? { documentId: issue.documentId } : {}),
    ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
  }));

const mapTransactionIssues = (
  issues: readonly WorkspaceTransactionIssue[]
): readonly WorkspaceComponentExtractionTransactionIssue[] => {
  const mapped: WorkspaceComponentExtractionTransactionIssue[] = [];
  for (const issue of issues) {
    const commandIssues = issue.commandIssues ?? [];
    if (commandIssues.length > 0) {
      for (const commandIssue of commandIssues) {
        mapped.push({
          code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.transactionValidationFailed,
          path: commandIssue.path,
          message: commandIssue.message,
          causeCode: commandIssue.code,
          ...(commandIssue.documentId
            ? { documentId: commandIssue.documentId }
            : {}),
        });
      }
      continue;
    }
    mapped.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.transactionValidationFailed,
      path: issue.path,
      message: issue.message,
      causeCode: issue.code,
    });
  }
  return mapped;
};

const validateEnvelope = (
  input: CreateWorkspaceComponentExtractionTransactionInput
): readonly WorkspaceComponentExtractionTransactionIssue[] => {
  const issues: WorkspaceComponentExtractionTransactionIssue[] = [];
  if (
    !Number.isSafeInteger(input.baseRevision) ||
    input.baseRevision !== input.workspace.workspaceRev
  ) {
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.baseRevisionMismatch,
      path: '/baseRevision',
      message: `Base revision must equal Workspace revision ${input.workspace.workspaceRev}.`,
    });
  }
  for (const [path, value, label] of [
    ['/transactionId', input.transactionId, 'Transaction id'],
    ['/issuedAt', input.issuedAt, 'Issued-at value'],
    ['/sourceDocumentId', input.sourceDocumentId, 'Source document id'],
    ['/subtreeRootId', input.subtreeRootId, 'Subtree root id'],
    [
      '/componentDocumentId',
      input.componentDocumentId,
      'Component document id',
    ],
    ['/componentPath', input.componentPath, 'Component path'],
    ['/componentName', input.componentName, 'Component name'],
    ['/instanceNodeId', input.instanceNodeId, 'Instance node id'],
  ] as const) {
    if (isCanonicalText(value)) continue;
    issues.push({
      code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.inputInvalid,
      path,
      message: `${label} must be non-empty and trimmed.`,
    });
  }
  return issues;
};

const derivePublicMemberMappings = (
  extraction: PIRSubtreeExtractionReady
): readonly WorkspaceComponentExtractionPublicMemberMapping[] => {
  const mappings = new Map<
    string,
    WorkspaceComponentExtractionPublicMemberMapping
  >();
  for (const dependency of extraction.boundaryDependencies) {
    if (dependency.kind === 'value-binding') {
      const source = {
        kind: dependency.sourceKind,
        id: dependency.sourceId,
      } as const;
      mappings.set(`${source.kind}\u0000${source.id}`, {
        source,
        target: { kind: 'prop', memberId: dependency.componentProp.id },
      });
      continue;
    }
    if (dependency.kind !== 'event-binding') continue;
    const source = {
      kind: 'component-event',
      id: dependency.sourceEventId,
    } as const;
    mappings.set(`${source.kind}\u0000${source.id}`, {
      source,
      target: { kind: 'event', memberId: dependency.componentEvent.id },
    });
  }
  return [...mappings.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, mapping]) => mapping);
};

const mergePublicParts = (
  extraction: PIRSubtreeExtractionReady,
  publicParts: readonly PIRComponentPartContract[]
):
  | Readonly<{
      ok: true;
      definitionDocument: PIRDocument;
      mappings: readonly WorkspaceComponentExtractionPublicPartMapping[];
    }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspaceComponentExtractionTransactionIssue[];
    }> => {
  const issues: WorkspaceComponentExtractionTransactionIssue[] = [];
  const movedNodeIds = new Set(extraction.subtreeNodeIds);
  const partsById = new Map<string, PIRComponentPartContract>();
  const memberIdByNodeId = new Map<string, string>();
  for (const [index, part] of publicParts.entries()) {
    const path = `/publicParts/${index}`;
    if (
      !isCanonicalText(part.id) ||
      !isCanonicalText(part.name) ||
      !isCanonicalText(part.targetNodeId)
    ) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.publicPartInvalid,
        path,
        message:
          'Public part id, name, and targetNodeId must be non-empty and trimmed.',
        nodeId: part.targetNodeId,
      });
      continue;
    }
    if (!movedNodeIds.has(part.targetNodeId)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.publicPartInvalid,
        path: `${path}/targetNodeId`,
        message:
          'A public part must target a node moved into the new Definition.',
        nodeId: part.targetNodeId,
      });
      continue;
    }
    if (partsById.has(part.id)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.publicPartInvalid,
        path: `${path}/id`,
        message: `Duplicate public part id: ${part.id}.`,
        nodeId: part.targetNodeId,
      });
      continue;
    }
    if (memberIdByNodeId.has(part.targetNodeId)) {
      issues.push({
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.publicPartInvalid,
        path: `${path}/targetNodeId`,
        message: 'Each moved node may expose at most one public part mapping.',
        nodeId: part.targetNodeId,
      });
      continue;
    }
    partsById.set(part.id, part);
    memberIdByNodeId.set(part.targetNodeId, part.id);
  }
  if (issues.length > 0) return { ok: false, issues };

  const orderedParts = Object.fromEntries(
    [...partsById.entries()].sort(([left], [right]) => compareText(left, right))
  );
  const contract = extraction.definitionDocument.componentContract!;
  const definitionDocument: PIRDocument = {
    ...extraction.definitionDocument,
    componentContract: {
      ...contract,
      ...(partsById.size > 0 ? { partsById: orderedParts } : {}),
    },
  };
  const mappings = [...memberIdByNodeId.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([sourceNodeId, memberId]) => ({ sourceNodeId, memberId }));
  return { ok: true, definitionDocument, mappings };
};

const createSourceGraphCommand = (
  input: CreateWorkspaceComponentExtractionTransactionInput,
  sourceDocument: PIRDocument,
  nextDocument: PIRDocument
): WorkspaceCommandEnvelope => ({
  id: `${input.transactionId}:source`,
  namespace: 'core.pir.component-extraction',
  type: 'component.subtree.replace-with-instance',
  version: '1.0',
  issuedAt: input.issuedAt,
  target: {
    workspaceId: input.workspace.id,
    documentId: input.sourceDocumentId,
  },
  domainHint: 'pir',
  label: `Replace subtree with ${input.componentName}`,
  forwardOps: [
    { op: 'replace', path: '/ui/graph', value: nextDocument.ui.graph },
  ],
  reverseOps: [
    { op: 'replace', path: '/ui/graph', value: sourceDocument.ui.graph },
  ],
});

/**
 * Composes PIR extraction, typed-reference impact, VFS creation, and source
 * replacement into one reversible Workspace Transaction. The candidate is
 * applied only to an isolated snapshot for final Component graph validation.
 */
export const createWorkspaceComponentExtractionTransactionPlan = (
  input: CreateWorkspaceComponentExtractionTransactionInput
): WorkspaceComponentExtractionTransactionPlanResult => {
  const envelopeIssues = validateEnvelope(input);
  if (envelopeIssues.length > 0) return reject(envelopeIssues);

  const sourceDocument = input.workspace.docsById[input.sourceDocumentId];
  if (!sourceDocument) {
    return reject([
      {
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.sourceMissing,
        path: `/docsById/${escapeJsonPointerSegment(input.sourceDocumentId)}`,
        message: 'Extraction source document does not exist.',
        documentId: input.sourceDocumentId,
      },
    ]);
  }
  const sourceRead = decodeWorkspacePirDocument(sourceDocument, {
    workspaceId: input.workspace.id,
  });
  if (sourceRead.status !== 'valid') {
    const causeCode =
      sourceRead.status === 'unsupported-document-type'
        ? sourceRead.status
        : sourceRead.issues[0]?.code;
    return reject([
      {
        code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.sourceInvalid,
        path: `/docsById/${escapeJsonPointerSegment(input.sourceDocumentId)}/content`,
        message:
          'Component extraction requires a valid canonical PIR page, layout, or component source.',
        ...(causeCode ? { causeCode } : {}),
        documentId: input.sourceDocumentId,
      },
    ]);
  }

  const extraction = analyzePirSubtreeExtraction({
    sourceDocumentId: input.sourceDocumentId,
    definitionDocumentId: input.componentDocumentId,
    document: sourceRead.decodedContent,
    subtreeRootId: input.subtreeRootId,
    instanceNodeId: input.instanceNodeId,
  });
  if (!extraction.ok) {
    return reject(mapPirIssues(extraction.issues, input.sourceDocumentId));
  }

  const mergedParts = mergePublicParts(extraction, input.publicParts ?? []);
  if (!mergedParts.ok) return reject(mergedParts.issues);
  const publicMemberMappings = derivePublicMemberMappings(extraction);
  const referencePlan = analyzeWorkspaceComponentExtractionReferences({
    workspace: input.workspace,
    sourceDocumentId: input.sourceDocumentId,
    targetComponentDocumentId: input.componentDocumentId,
    replacementInstanceNodeId: input.instanceNodeId,
    pirBoundaryAlreadyApplied: true,
    movedNodeIds: extraction.subtreeNodeIds,
    nodeRelocations: extraction.relocationFacts.map((relocation) => ({
      sourceNodeId: relocation.sourceNodeId,
      definitionNodeId: relocation.definitionNodeId,
    })),
    publicPartMappings: mergedParts.mappings,
    publicMemberMappings,
    transactionId: input.transactionId,
    issuedAt: input.issuedAt,
    ...(input.referenceProviders
      ? { providers: input.referenceProviders }
      : {}),
  });
  if (referencePlan.status !== 'ready') {
    return reject(mapReferenceIssues(referencePlan.issues));
  }
  const readyReferencePlan: WorkspaceComponentExtractionTransactionPlan['referencePlan'] =
    { ...referencePlan, status: 'ready' };

  const componentContent: PIRDocument = {
    ...mergedParts.definitionDocument,
    metadata: {
      ...mergedParts.definitionDocument.metadata,
      name: input.componentName,
    },
  };
  const componentDocument: WorkspaceComponentExtractionTransactionPlan['componentDocument'] =
    {
      id: input.componentDocumentId,
      type: 'pir-component',
      name: input.componentName,
      path: input.componentPath,
      contentRev: 1,
      metaRev: 1,
      content: componentContent,
    };

  let createComponentCommand: WorkspaceCommandEnvelope;
  try {
    createComponentCommand = createWorkspaceDocumentAtPathCommand({
      workspace: input.workspace,
      document: componentDocument,
      commandId: `${input.transactionId}:component`,
      issuedAt: input.issuedAt,
      label: `Create component ${input.componentName}`,
    });
  } catch (error) {
    if (error instanceof WorkspaceDocumentFactoryError) {
      return reject([
        {
          code: WORKSPACE_COMPONENT_EXTRACTION_TRANSACTION_ISSUE_CODES.documentFactoryFailed,
          path: error.path,
          message: error.message,
          causeCode: error.code,
          documentId: input.componentDocumentId,
        },
      ]);
    }
    throw error;
  }

  const sourceCommand = createSourceGraphCommand(
    input,
    sourceRead.decodedContent,
    extraction.sourceDocument
  );
  const transaction: WorkspaceTransactionEnvelope = {
    id: input.transactionId,
    workspaceId: input.workspace.id,
    issuedAt: input.issuedAt,
    label: `Extract ${input.componentName}`,
    commands: [
      createComponentCommand,
      sourceCommand,
      ...referencePlan.commands,
    ],
  };
  const validation = applyWorkspaceTransaction(input.workspace, transaction);
  if (!validation.ok) return reject(mapTransactionIssues(validation.issues));

  return {
    status: 'ready',
    plan: {
      baseRevision: input.baseRevision,
      sourceDocumentId: input.sourceDocumentId,
      componentDocument,
      sourceDocumentContent: extraction.sourceDocument,
      extraction,
      referencePlan: readyReferencePlan,
      publicMemberMappings,
      publicPartMappings: mergedParts.mappings,
      transaction,
    },
  };
};
