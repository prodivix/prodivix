import {
  decodeNodeGraphDocument,
  validateNodeGraphDocument,
  type NodeGraphDecodeIssue,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
import { NODEGRAPH_CURRENT_WIRE_VERSION } from '@prodivix/nodegraph/wire';
import { sameCanonicalJson } from '@prodivix/shared/canonical';
import { compareUnicodeCodePoints } from './canonicalOrder';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceNodeGraphDocument = WorkspaceDocument &
  Readonly<{
    type: 'pir-graph';
    content: NodeGraphDocument;
  }>;

export type WorkspaceNodeGraphReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly NodeGraphDecodeIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceNodeGraphDocument;
      decodedContent: NodeGraphDocument;
      sourceWireVersion: number;
    }>;

export type CreateWorkspaceNodeGraphDocumentUpdateCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  after: NodeGraphDocument;
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

export const isCanonicalWorkspaceNodeGraphDocumentContent = (
  content: unknown
): boolean => {
  const current = validateNodeGraphDocument(content);
  if (current.ok) return true;
  const decoded = decodeNodeGraphDocument(content);
  return (
    decoded.ok && decoded.sourceWireVersion === NODEGRAPH_CURRENT_WIRE_VERSION
  );
};

export const decodeWorkspaceNodeGraphDocument = (
  document: WorkspaceDocument
): WorkspaceNodeGraphReadResult => {
  if (document.type !== 'pir-graph') {
    return { status: 'unsupported-document-type', document };
  }
  const current = validateNodeGraphDocument(document.content);
  if (current.ok) {
    const typedDocument = Object.freeze({
      ...document,
      content: current.value,
    }) as WorkspaceNodeGraphDocument;
    return {
      status: 'valid',
      document: typedDocument,
      decodedContent: current.value,
      sourceWireVersion: NODEGRAPH_CURRENT_WIRE_VERSION,
    };
  }
  const decoded = decodeNodeGraphDocument(document.content);
  if (!decoded.ok) {
    return { status: 'invalid', document, issues: decoded.issues };
  }
  const typedDocument = Object.freeze({
    ...document,
    content: decoded.value,
  }) as WorkspaceNodeGraphDocument;
  return {
    status: 'valid',
    document: typedDocument,
    decodedContent: decoded.value,
    sourceWireVersion: decoded.sourceWireVersion,
  };
};

export const isWorkspaceNodeGraphDocument = (
  document: WorkspaceDocument
): document is WorkspaceNodeGraphDocument =>
  decodeWorkspaceNodeGraphDocument(document).status === 'valid';

export const selectWorkspaceNodeGraphDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspaceNodeGraphReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document ? decodeWorkspaceNodeGraphDocument(document) : undefined;
};

export const selectWorkspaceNodeGraphDocumentResults = (
  snapshot: WorkspaceSnapshot | undefined
): readonly WorkspaceNodeGraphReadResult[] =>
  snapshot
    ? Object.values(snapshot.docsById)
        .filter((document) => document.type === 'pir-graph')
        .sort((left, right) => compareUnicodeCodePoints(left.id, right.id))
        .map(decodeWorkspaceNodeGraphDocument)
    : [];

const appendPatch = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  path: string,
  before: unknown,
  after: unknown
): void => {
  if (sameCanonicalJson(before, after)) return;
  if (before === undefined) {
    forwardOps.push({ op: 'add', path, value: after });
    reverseOps.unshift({ op: 'remove', path });
    return;
  }
  if (after === undefined) {
    forwardOps.push({ op: 'remove', path });
    reverseOps.unshift({ op: 'add', path, value: before });
    return;
  }
  forwardOps.push({ op: 'replace', path, value: after });
  reverseOps.unshift({ op: 'replace', path, value: before });
};

/** Builds one reversible update for canonical standalone NodeGraph content. */
export const createWorkspaceNodeGraphDocumentUpdateCommand = (
  input: CreateWorkspaceNodeGraphDocumentUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceNodeGraphDocument(
    input.workspace,
    input.documentId
  );
  if (
    current?.status !== 'valid' ||
    current.sourceWireVersion !== NODEGRAPH_CURRENT_WIRE_VERSION
  ) {
    return null;
  }
  const after = validateNodeGraphDocument(input.after);
  if (!after.ok) return null;
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  appendPatch(
    forwardOps,
    reverseOps,
    '/nodes',
    current.decodedContent.nodes,
    after.value.nodes
  );
  appendPatch(
    forwardOps,
    reverseOps,
    '/edges',
    current.decodedContent.edges,
    after.value.edges
  );
  appendPatch(
    forwardOps,
    reverseOps,
    '/publicContract',
    current.decodedContent.publicContract,
    after.value.publicContract
  );
  if (!forwardOps.length) return null;
  return {
    id: input.commandId,
    namespace: 'core.nodegraph',
    type: 'document.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: current.document.id,
    },
    domainHint: 'nodegraph',
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};
