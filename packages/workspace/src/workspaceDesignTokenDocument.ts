import {
  decodeDtcgDesignTokenDocument,
  isDtcgDesignTokenDocument,
  type DesignTokenDecodeIssue,
  type DesignTokenDocument,
  type DesignTokenJsonValue,
} from '@prodivix/tokens';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceDesignTokenContent = Readonly<
  Record<string, DesignTokenJsonValue>
>;

export type WorkspaceDesignTokenDocument = WorkspaceDocument &
  Readonly<{
    type: 'design-tokens';
    content: WorkspaceDesignTokenContent;
  }>;

export type WorkspaceDesignTokenReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly DesignTokenDecodeIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceDesignTokenDocument;
      decodedContent: DesignTokenDocument;
    }>;

export type CreateWorkspaceDesignTokenDocumentUpdateCommandInput = Readonly<{
  workspace: WorkspaceSnapshot;
  documentId: string;
  after: WorkspaceDesignTokenContent;
  commandId: string;
  issuedAt?: string;
  mergeKey?: string;
  label?: string;
}>;

export const isCanonicalWorkspaceDesignTokenDocumentContent = (
  content: unknown
): content is WorkspaceDesignTokenContent => isDtcgDesignTokenDocument(content);

export const decodeWorkspaceDesignTokenDocument = (
  document: WorkspaceDocument
): WorkspaceDesignTokenReadResult => {
  if (document.type !== 'design-tokens') {
    return { status: 'unsupported-document-type', document };
  }
  const decoded = decodeDtcgDesignTokenDocument(document.content);
  if (!decoded.ok) {
    return { status: 'invalid', document, issues: decoded.issues };
  }
  const typedDocument = Object.freeze({
    ...document,
    content: document.content,
  }) as WorkspaceDesignTokenDocument;
  return Object.freeze({
    status: 'valid',
    document: typedDocument,
    decodedContent: decoded.value,
  });
};

export const isWorkspaceDesignTokenDocument = (
  document: WorkspaceDocument
): document is WorkspaceDesignTokenDocument =>
  decodeWorkspaceDesignTokenDocument(document).status === 'valid';

export const selectWorkspaceDesignTokenDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspaceDesignTokenReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document ? decodeWorkspaceDesignTokenDocument(document) : undefined;
};

export const selectWorkspaceDesignTokenDocumentResults = (
  snapshot: WorkspaceSnapshot | undefined
): readonly WorkspaceDesignTokenReadResult[] =>
  snapshot
    ? Object.values(snapshot.docsById)
        .filter((document) => document.type === 'design-tokens')
        .sort((left, right) =>
          left.path === right.path
            ? left.id.localeCompare(right.id)
            : left.path.localeCompare(right.path)
        )
        .map(decodeWorkspaceDesignTokenDocument)
    : [];

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Builds one reversible top-level update without replacing the DTCG root. */
export const createWorkspaceDesignTokenDocumentUpdateCommand = (
  input: CreateWorkspaceDesignTokenDocumentUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceDesignTokenDocument(
    input.workspace,
    input.documentId
  );
  if (current?.status !== 'valid') return null;
  if (!isDtcgDesignTokenDocument(input.after)) return null;

  const before = current.document.content;
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(input.after)]),
  ].sort();
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  for (const key of keys) {
    const path = `/${escapePointerSegment(key)}`;
    const beforeHasKey = Object.hasOwn(before, key);
    const afterHasKey = Object.hasOwn(input.after, key);
    if (beforeHasKey && afterHasKey) {
      if (valuesEqual(before[key], input.after[key])) continue;
      forwardOps.push({ op: 'replace', path, value: input.after[key] });
      reverseOps.unshift({ op: 'replace', path, value: before[key] });
      continue;
    }
    if (afterHasKey) {
      forwardOps.push({ op: 'add', path, value: input.after[key] });
      reverseOps.unshift({ op: 'remove', path });
      continue;
    }
    forwardOps.push({ op: 'remove', path });
    reverseOps.unshift({ op: 'add', path, value: before[key] });
  }
  if (forwardOps.length === 0) return null;
  return {
    id: input.commandId,
    namespace: 'core.design-tokens',
    type: 'document.update',
    version: '1.0',
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspace.id,
      documentId: current.document.id,
    },
    domainHint: 'token',
    forwardOps,
    reverseOps,
    ...(input.mergeKey ? { mergeKey: input.mergeKey } : {}),
    ...(input.label ? { label: input.label } : {}),
  };
};
