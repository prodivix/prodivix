import {
  validatePirDocument,
  type PIRDecodeIssue,
  type PIRDocument,
  type PIRValidationCode,
  type PIRValidationIssue,
} from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
} from '../types';
import { tryNormalizeWorkspacePirContent } from '../workspacePirContent';

export type WorkspacePirDocumentType = Extract<
  WorkspaceDocumentType,
  'pir-page' | 'pir-layout' | 'pir-component'
>;

export type WorkspacePirDocument = WorkspaceDocument &
  Readonly<{
    type: WorkspacePirDocumentType;
    content: PIRDocument;
  }>;

export type WorkspacePirDocumentLocation = Readonly<{
  workspaceId?: string;
  documentId: string;
  documentPath: string;
  documentType: WorkspaceDocumentType;
}>;

export type WorkspacePirReadIssue = Readonly<{
  stage: 'decode' | 'semantic';
  code?: PIRValidationCode;
  path: string;
  message: string;
  location: WorkspacePirDocumentLocation;
}>;

type WorkspacePirReadResultBase<
  Document extends WorkspaceDocument = WorkspaceDocument,
> = Readonly<{
  document: Document;
  location: WorkspacePirDocumentLocation;
}>;

export type WorkspacePirReadResult =
  | (WorkspacePirReadResultBase &
      Readonly<{
        status: 'unsupported-document-type';
      }>)
  | (WorkspacePirReadResultBase &
      Readonly<{
        status: 'decode-invalid';
        issues: readonly WorkspacePirReadIssue[];
      }>)
  | (WorkspacePirReadResultBase<WorkspacePirDocument> &
      Readonly<{
        status: 'semantic-invalid';
        decodedContent: PIRDocument;
        issues: readonly WorkspacePirReadIssue[];
      }>)
  | (WorkspacePirReadResultBase<WorkspacePirDocument> &
      Readonly<{
        status: 'valid';
        decodedContent: PIRDocument;
      }>);

export type DecodeWorkspacePirDocumentOptions = Readonly<{
  workspaceId?: string;
}>;

export const isWorkspacePirDocumentType = (
  type: WorkspaceDocumentType
): type is WorkspacePirDocumentType =>
  type === 'pir-page' || type === 'pir-layout' || type === 'pir-component';

const createLocation = (
  document: WorkspaceDocument,
  workspaceId: string | undefined
): WorkspacePirDocumentLocation =>
  Object.freeze({
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    documentId: document.id,
    documentPath: document.path,
    documentType: document.type,
  });

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareIssues = (
  left: WorkspacePirReadIssue,
  right: WorkspacePirReadIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code ?? '', right.code ?? '') ||
  compareText(left.message, right.message);

const freezeIssues = (
  issues: readonly WorkspacePirReadIssue[]
): readonly WorkspacePirReadIssue[] =>
  Object.freeze(
    [...issues].sort(compareIssues).map((issue) => Object.freeze(issue))
  );

const mapDecodeIssues = (
  issues: readonly PIRDecodeIssue[],
  location: WorkspacePirDocumentLocation
): readonly WorkspacePirReadIssue[] =>
  freezeIssues(
    issues.map((issue) => ({
      stage: 'decode',
      path: issue.path,
      message: issue.message,
      location,
    }))
  );

const mapSemanticIssues = (
  issues: readonly PIRValidationIssue[],
  location: WorkspacePirDocumentLocation
): readonly WorkspacePirReadIssue[] =>
  freezeIssues(
    issues.map((issue) => ({
      stage: 'semantic',
      code: issue.code,
      path: issue.path,
      message: issue.message,
      location,
    }))
  );

/**
 * Reads a PIR Workspace document exclusively through the canonical PIR codec.
 * Version recognition and migration stay owned by that codec boundary.
 */
export const decodeWorkspacePirDocument = (
  document: WorkspaceDocument,
  options: DecodeWorkspacePirDocumentOptions = {}
): WorkspacePirReadResult => {
  const location = createLocation(document, options.workspaceId);
  if (!isWorkspacePirDocumentType(document.type)) {
    return Object.freeze({
      status: 'unsupported-document-type',
      document,
      location,
    });
  }

  const decoded = tryNormalizeWorkspacePirContent(document.content);
  if (!decoded.ok) {
    return Object.freeze({
      status: 'decode-invalid',
      document,
      location,
      issues: mapDecodeIssues(decoded.issues, location),
    });
  }

  const typedDocument = Object.freeze({
    ...document,
    content: decoded.value,
  }) as WorkspacePirDocument;
  const validation = validatePirDocument(decoded.value);
  if (!validation.valid) {
    return Object.freeze({
      status: 'semantic-invalid',
      document: typedDocument,
      location,
      decodedContent: decoded.value,
      issues: mapSemanticIssues(validation.issues, location),
    });
  }

  return Object.freeze({
    status: 'valid',
    document: typedDocument,
    location,
    decodedContent: decoded.value,
  });
};

export const isWorkspacePirDocument = (
  document: WorkspaceDocument
): document is WorkspacePirDocument =>
  decodeWorkspacePirDocument(document).status === 'valid';

export const selectWorkspacePirDocument = (
  snapshot: WorkspaceSnapshot | undefined,
  documentId: string | undefined
): WorkspacePirReadResult | undefined => {
  if (!snapshot || !documentId) return undefined;
  const document = snapshot.docsById[documentId];
  return document
    ? decodeWorkspacePirDocument(document, { workspaceId: snapshot.id })
    : undefined;
};

export const selectWorkspacePirDocumentResults = (
  snapshot: WorkspaceSnapshot | undefined
): readonly WorkspacePirReadResult[] => {
  if (!snapshot) return Object.freeze([]);
  return Object.freeze(
    Object.values(snapshot.docsById)
      .sort(
        (left, right) =>
          compareText(left.id, right.id) || compareText(left.path, right.path)
      )
      .map((document) =>
        decodeWorkspacePirDocument(document, {
          workspaceId: snapshot.id,
        })
      )
  );
};
