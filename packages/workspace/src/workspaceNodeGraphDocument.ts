import {
  decodeNodeGraphDocument,
  type NodeGraphDecodeIssue,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
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
): content is NodeGraphDocument => decodeNodeGraphDocument(content).ok;

export const decodeWorkspaceNodeGraphDocument = (
  document: WorkspaceDocument
): WorkspaceNodeGraphReadResult => {
  if (document.type !== 'pir-graph') {
    return { status: 'unsupported-document-type', document };
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
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(decodeWorkspaceNodeGraphDocument)
    : [];

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const appendPatch = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  path: string,
  before: unknown,
  after: unknown
): void => {
  if (valuesEqual(before, after)) return;
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
  if (current?.status !== 'valid') return null;
  const after = decodeNodeGraphDocument(input.after);
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
