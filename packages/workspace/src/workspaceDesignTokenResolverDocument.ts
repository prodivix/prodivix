import {
  decodeDtcgDesignTokenResolverDocument,
  isDtcgDesignTokenResolverDocument,
  type DesignTokenJsonValue,
  type DesignTokenResolverDecodeIssue,
  type DesignTokenResolverDocument,
  type DesignTokenResolverSource,
} from '@prodivix/tokens';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
} from './workspaceCommand';
import type { WorkspaceDocument, WorkspaceSnapshot } from './types';

export type WorkspaceDesignTokenResolverContent = Readonly<
  Record<string, DesignTokenJsonValue>
>;

export type WorkspaceDesignTokenResolverDocument = WorkspaceDocument &
  Readonly<{
    type: 'design-token-resolver';
    content: WorkspaceDesignTokenResolverContent;
  }>;

export type WorkspaceDesignTokenResolverReadResult =
  | Readonly<{
      status: 'unsupported-document-type';
      document: WorkspaceDocument;
    }>
  | Readonly<{
      status: 'invalid';
      document: WorkspaceDocument;
      issues: readonly DesignTokenResolverDecodeIssue[];
    }>
  | Readonly<{
      status: 'valid';
      document: WorkspaceDesignTokenResolverDocument;
      decodedContent: DesignTokenResolverDocument;
    }>;

export type CreateWorkspaceDesignTokenResolverDocumentUpdateCommandInput =
  Readonly<{
    workspace: WorkspaceSnapshot;
    documentId: string;
    after: WorkspaceDesignTokenResolverContent;
    commandId: string;
    issuedAt?: string;
    mergeKey?: string;
    label?: string;
  }>;

export type WorkspaceDesignTokenResolverDocumentReference = Readonly<{
  reference: string;
  documentPath: string;
  workspacePath?: string;
}>;

export const isCanonicalWorkspaceDesignTokenResolverDocumentContent = (
  content: unknown
): content is WorkspaceDesignTokenResolverContent =>
  isDtcgDesignTokenResolverDocument(content);

export const decodeWorkspaceDesignTokenResolverDocument = (
  document: WorkspaceDocument
): WorkspaceDesignTokenResolverReadResult => {
  if (document.type !== 'design-token-resolver') {
    return { status: 'unsupported-document-type', document };
  }
  const decoded = decodeDtcgDesignTokenResolverDocument(document.content);
  if (!decoded.ok) {
    return { status: 'invalid', document, issues: decoded.issues };
  }
  return Object.freeze({
    status: 'valid',
    document: Object.freeze({
      ...document,
      type: 'design-token-resolver',
      content: document.content,
    }) as WorkspaceDesignTokenResolverDocument,
    decodedContent: decoded.value,
  });
};

export const isWorkspaceDesignTokenResolverDocument = (
  document: WorkspaceDocument
): document is WorkspaceDesignTokenResolverDocument =>
  decodeWorkspaceDesignTokenResolverDocument(document).status === 'valid';

export const selectWorkspaceDesignTokenResolverDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspaceDesignTokenResolverReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document
    ? decodeWorkspaceDesignTokenResolverDocument(document)
    : undefined;
};

export const selectWorkspaceDesignTokenResolverDocumentResults = (
  snapshot: WorkspaceSnapshot | undefined
): readonly WorkspaceDesignTokenResolverReadResult[] =>
  snapshot
    ? Object.values(snapshot.docsById)
        .filter((document) => document.type === 'design-token-resolver')
        .sort((left, right) =>
          left.path === right.path
            ? left.id.localeCompare(right.id)
            : left.path.localeCompare(right.path)
        )
        .map(decodeWorkspaceDesignTokenResolverDocument)
    : [];

const collectSources = (
  sources: readonly DesignTokenResolverSource[],
  references: Map<string, WorkspaceDesignTokenResolverDocumentReference>,
  resolverPath: string
): void => {
  sources.forEach((source) => {
    if (
      source.kind !== 'reference' ||
      source.reference.target.kind !== 'document'
    ) {
      return;
    }
    const target = source.reference.target;
    const workspacePath = resolveWorkspaceDesignTokenResolverReferencePath(
      resolverPath,
      target.documentPath
    );
    references.set(
      source.reference.raw,
      Object.freeze({
        reference: source.reference.raw,
        documentPath: target.documentPath,
        ...(workspacePath ? { workspacePath } : {}),
      })
    );
  });
};

export const collectWorkspaceDesignTokenResolverDocumentReferences = (
  resolver: DesignTokenResolverDocument,
  resolverPath: string
): readonly WorkspaceDesignTokenResolverDocumentReference[] => {
  const references = new Map<
    string,
    WorkspaceDesignTokenResolverDocumentReference
  >();
  resolver.sets.forEach((set) =>
    collectSources(set.sources, references, resolverPath)
  );
  resolver.modifiers.forEach((modifier) =>
    modifier.contexts.forEach((context) =>
      collectSources(context.sources, references, resolverPath)
    )
  );
  resolver.resolutionOrder.forEach((entry) => {
    if (entry.declaration !== 'inline') return;
    if (entry.kind === 'set') {
      collectSources(entry.definition.sources, references, resolverPath);
      return;
    }
    entry.definition.contexts.forEach((context) =>
      collectSources(context.sources, references, resolverPath)
    );
  });
  return Object.freeze(
    [...references.values()].sort((left, right) =>
      left.reference.localeCompare(right.reference)
    )
  );
};

export const resolveWorkspaceDesignTokenResolverReferencePath = (
  resolverPath: string,
  documentPath: string
): string | null => {
  if (
    !resolverPath.startsWith('/') ||
    !documentPath ||
    documentPath.includes('\\') ||
    /^[a-z][a-z0-9+.-]*:/i.test(documentPath) ||
    documentPath.startsWith('//') ||
    documentPath.includes('?')
  ) {
    return null;
  }
  const segments = documentPath.startsWith('/')
    ? []
    : resolverPath.split('/').slice(1, -1);
  for (const segment of documentPath.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    if (segment !== segment.trim()) return null;
    segments.push(segment);
  }
  return segments.length > 0 ? `/${segments.join('/')}` : null;
};

const valuesEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const escapePointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

/** Builds one reversible Resolver update without replacing its JSON root. */
export const createWorkspaceDesignTokenResolverDocumentUpdateCommand = (
  input: CreateWorkspaceDesignTokenResolverDocumentUpdateCommandInput
): WorkspaceCommandEnvelope | null => {
  const current = selectWorkspaceDesignTokenResolverDocument(
    input.workspace,
    input.documentId
  );
  if (current?.status !== 'valid') return null;
  if (!isDtcgDesignTokenResolverDocument(input.after)) return null;

  const before = current.document.content;
  const keys = [
    ...new Set([...Object.keys(before), ...Object.keys(input.after)]),
  ].sort();
  const forwardOps: WorkspacePatchOperation[] = [];
  const reverseOps: WorkspacePatchOperation[] = [];
  keys.forEach((key) => {
    const path = `/${escapePointerSegment(key)}`;
    const beforeHasKey = Object.hasOwn(before, key);
    const afterHasKey = Object.hasOwn(input.after, key);
    if (beforeHasKey && afterHasKey) {
      if (valuesEqual(before[key], input.after[key])) return;
      forwardOps.push({ op: 'replace', path, value: input.after[key] });
      reverseOps.unshift({ op: 'replace', path, value: before[key] });
      return;
    }
    if (afterHasKey) {
      forwardOps.push({ op: 'add', path, value: input.after[key] });
      reverseOps.unshift({ op: 'remove', path });
      return;
    }
    forwardOps.push({ op: 'remove', path });
    reverseOps.unshift({ op: 'add', path, value: before[key] });
  });
  if (forwardOps.length === 0) return null;
  return {
    id: input.commandId,
    namespace: 'core.design-token-resolvers',
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
