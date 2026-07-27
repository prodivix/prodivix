import {
  isDataSourceDocument,
  normalizeDataSourceDocument,
  validateDataSourceDocument,
  type DataDocumentIssue,
  type DataSourceDocument,
} from '@prodivix/data';
import { compareUnicodeCodePoints } from './canonicalOrder';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceDataSourceDocument = WorkspaceDocument &
  Readonly<{
    type: 'data-source';
    content: DataSourceDocument;
  }>;

export type WorkspaceDataSourceReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly DataDocumentIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceDataSourceDocument;
      decodedContent: DataSourceDocument;
    }>;

export type CreateWorkspaceDataSourceDocumentUpdateCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  after: DataSourceDocument;
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

export const isCanonicalWorkspaceDataSourceDocumentContent = (
  content: unknown,
  documentId?: string
): content is DataSourceDocument =>
  isDataSourceDocument(content, documentId ? { documentId } : undefined);

/** Reads one canonical Data document without creating a second owner. */
export const decodeWorkspaceDataSourceDocument = (
  document: WorkspaceDocument
): WorkspaceDataSourceReadResult => {
  if (document.type !== 'data-source') {
    return { status: 'unsupported-document-type', document };
  }
  const validation = validateDataSourceDocument(document.content, {
    documentId: document.id,
  });
  if (!validation.valid) {
    return {
      status: 'invalid',
      document,
      issues: validation.issues,
    };
  }
  const typedDocument = Object.freeze({
    ...document,
    content: document.content,
  }) as WorkspaceDataSourceDocument;
  return Object.freeze({
    status: 'valid',
    document: typedDocument,
    decodedContent: typedDocument.content,
  });
};

export const isWorkspaceDataSourceDocument = (
  document: WorkspaceDocument
): document is WorkspaceDataSourceDocument =>
  decodeWorkspaceDataSourceDocument(document).status === 'valid';

export const selectWorkspaceDataSourceDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspaceDataSourceReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document ? decodeWorkspaceDataSourceDocument(document) : undefined;
};

export const selectWorkspaceDataSourceDocumentResults = (
  snapshot: WorkspaceSnapshot | undefined
): readonly WorkspaceDataSourceReadResult[] =>
  snapshot
    ? Object.values(snapshot.docsById)
        .filter((document) => document.type === 'data-source')
        .sort((left, right) =>
          left.path === right.path
            ? compareUnicodeCodePoints(left.id, right.id)
            : compareUnicodeCodePoints(left.path, right.path)
        )
        .map(decodeWorkspaceDataSourceDocument)
    : [];

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const appendReplacePatch = (
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

const appendOptionalRootPatch = (
  forwardOps: WorkspacePatchOperation[],
  reverseOps: WorkspacePatchOperation[],
  path: string,
  before: unknown,
  after: unknown
): void => {
  if (valuesEqual(before, after)) return;
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
  appendReplacePatch(forwardOps, reverseOps, path, before, after);
};

/** Builds one reversible update across the stable Data current-model roots. */
export const createWorkspaceDataSourceDocumentUpdateCommand = (
  input: CreateWorkspaceDataSourceDocumentUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceDataSourceDocument(
    input.workspace,
    input.documentId
  );
  if (current?.status !== 'valid') return null;

  let after: DataSourceDocument;
  try {
    after = normalizeDataSourceDocument(input.after, {
      documentId: current.document.id,
    });
  } catch {
    return null;
  }

  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  appendReplacePatch(
    forwardOps,
    reverseOps,
    '/source',
    current.decodedContent.source,
    after.source
  );
  appendReplacePatch(
    forwardOps,
    reverseOps,
    '/schemasById',
    current.decodedContent.schemasById,
    after.schemasById
  );
  appendReplacePatch(
    forwardOps,
    reverseOps,
    '/operationsById',
    current.decodedContent.operationsById,
    after.operationsById
  );
  appendOptionalRootPatch(
    forwardOps,
    reverseOps,
    '/importProvenanceById',
    current.decodedContent.importProvenanceById,
    after.importProvenanceById
  );
  if (forwardOps.length === 0) return null;

  return {
    id: input.commandId,
    namespace: 'core.data',
    type: 'document.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: current.document.id,
    },
    domainHint: 'data',
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};
