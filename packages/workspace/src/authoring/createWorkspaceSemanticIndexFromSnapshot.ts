import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createWorkspaceSemanticIndex,
  type SemanticContributionProvider,
  type SemanticIndexBuildIssue,
  type WorkspaceSemanticIndex,
} from '@prodivix/authoring';
import { createAnimationSemanticContributionProvider } from '@prodivix/animation';
import { createNodeGraphSemanticContributionProvider } from '@prodivix/nodegraph';
import { createPirSemanticContributionProvider } from '@prodivix/pir';
import { createRouteSemanticContributionProvider } from '@prodivix/router';
import {
  validateWorkspaceComponentGraph,
  type WorkspaceComponentGraphIssue,
} from '../component/workspaceComponentGraph';
import {
  decodeWorkspacePirDocument,
  isWorkspacePirDocumentType,
  type WorkspacePirReadIssue,
  type WorkspacePirReadResult,
} from '../component/workspacePirDocument';
import type { WorkspaceSnapshot } from '../types';
import {
  decodeWorkspaceAnimationDocument,
  type WorkspaceAnimationReadIssue,
  type WorkspaceAnimationReadResult,
} from '../workspaceAnimationDocument';
import {
  decodeWorkspaceNodeGraphDocument,
  type WorkspaceNodeGraphReadResult,
} from '../workspaceNodeGraphDocument';
import { createWorkspaceSemanticContributionProvider } from './workspaceSemanticContributionProvider';
import { captureWorkspaceSemanticRevisions } from './workspaceSemanticRevision';

export const WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES = Object.freeze({
  documentInvalid: 'WKS_SEMANTIC_INDEX_DOCUMENT_INVALID',
  componentGraphInvalid: 'WKS_SEMANTIC_INDEX_COMPONENT_GRAPH_INVALID',
  indexBuildFailed: 'WKS_SEMANTIC_INDEX_BUILD_FAILED',
} as const);

export type WorkspaceSemanticIndexIssueCode =
  (typeof WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES)[keyof typeof WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES];

export type WorkspaceSemanticIndexIssue = Readonly<{
  code: WorkspaceSemanticIndexIssueCode;
  path: string;
  message: string;
  causeCode?: string;
  documentId?: string;
  nodeId?: string;
  targetDocumentId?: string;
  providerId?: string;
  factId?: string;
  relatedIds?: readonly string[];
}>;

export type WorkspaceSemanticIndexCompositionOptions = Readonly<{
  additionalProviders?: readonly SemanticContributionProvider[];
}>;

export type WorkspaceSemanticIndexCompositionResult =
  | Readonly<{
      status: 'ready';
      index: WorkspaceSemanticIndex;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceSemanticIndexIssue[];
    }>;

type ValidWorkspacePirRead = Extract<
  WorkspacePirReadResult,
  Readonly<{ status: 'valid' }>
>;
type ValidWorkspaceAnimationRead = Extract<
  WorkspaceAnimationReadResult,
  Readonly<{ status: 'valid' }>
>;
type ValidWorkspaceNodeGraphRead = Extract<
  WorkspaceNodeGraphReadResult,
  Readonly<{ status: 'valid' }>
>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const documentContentPath = (documentId: string): string =>
  `/docsById/${escapeJsonPointerSegment(documentId)}/content`;

const qualifyDocumentPath = (documentId: string, path: string): string => {
  const base = documentContentPath(documentId);
  if (!path || path === '/') return base;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
};

const compareIssues = (
  left: WorkspaceSemanticIndexIssue,
  right: WorkspaceSemanticIndexIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.causeCode ?? '', right.causeCode ?? '') ||
  compareText(left.documentId ?? '', right.documentId ?? '') ||
  compareText(left.message, right.message);

const blocked = (
  issues: readonly WorkspaceSemanticIndexIssue[]
): WorkspaceSemanticIndexCompositionResult =>
  Object.freeze({
    status: 'blocked',
    issues: Object.freeze(
      [...issues].sort(compareIssues).map((issue) => Object.freeze(issue))
    ),
  });

const mapReadIssue = (
  documentId: string,
  issue: WorkspacePirReadIssue
): WorkspaceSemanticIndexIssue => ({
  code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.documentInvalid,
  path: qualifyDocumentPath(documentId, issue.path),
  message: issue.message,
  ...(issue.code ? { causeCode: issue.code } : {}),
  documentId,
});

const mapAnimationReadIssue = (
  documentId: string,
  issue: WorkspaceAnimationReadIssue
): WorkspaceSemanticIndexIssue => ({
  code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.documentInvalid,
  path: qualifyDocumentPath(documentId, issue.path),
  message: issue.message,
  causeCode: issue.code,
  documentId,
});

const collectPirDocuments = (
  snapshot: WorkspaceSnapshot
):
  | Readonly<{ status: 'ready'; reads: readonly ValidWorkspacePirRead[] }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceSemanticIndexIssue[];
    }> => {
  const documents = Object.values(snapshot.docsById)
    .filter((document) => isWorkspacePirDocumentType(document.type))
    .sort(
      (left, right) =>
        compareText(left.id, right.id) || compareText(left.path, right.path)
    );
  const reads: ValidWorkspacePirRead[] = [];
  const issues: WorkspaceSemanticIndexIssue[] = [];

  for (const document of documents) {
    const read = decodeWorkspacePirDocument(document, {
      workspaceId: snapshot.id,
    });
    if (read.status === 'valid') {
      reads.push(read);
      continue;
    }
    if (read.status === 'unsupported-document-type') {
      issues.push({
        code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.documentInvalid,
        path: documentContentPath(document.id),
        message: `Document "${document.id}" is not a PIR Workspace document.`,
        causeCode: read.status,
        documentId: document.id,
      });
      continue;
    }
    issues.push(
      ...read.issues.map((issue) => mapReadIssue(document.id, issue))
    );
  }

  return issues.length > 0
    ? Object.freeze({ status: 'blocked', issues: Object.freeze(issues) })
    : Object.freeze({ status: 'ready', reads: Object.freeze(reads) });
};

const collectAnimationDocuments = (
  snapshot: WorkspaceSnapshot
):
  | Readonly<{
      status: 'ready';
      reads: readonly ValidWorkspaceAnimationRead[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceSemanticIndexIssue[];
    }> => {
  const reads: ValidWorkspaceAnimationRead[] = [];
  const issues: WorkspaceSemanticIndexIssue[] = [];
  for (const document of Object.values(snapshot.docsById)
    .filter((candidate) => candidate.type === 'pir-animation')
    .sort(
      (left, right) =>
        compareText(left.id, right.id) || compareText(left.path, right.path)
    )) {
    const read = decodeWorkspaceAnimationDocument(document, snapshot);
    if (read.status === 'valid') {
      reads.push(read);
      continue;
    }
    if (read.status === 'invalid') {
      issues.push(
        ...read.issues.map((issue) => mapAnimationReadIssue(document.id, issue))
      );
    }
  }
  return issues.length > 0
    ? Object.freeze({ status: 'blocked', issues: Object.freeze(issues) })
    : Object.freeze({ status: 'ready', reads: Object.freeze(reads) });
};

const collectNodeGraphDocuments = (
  snapshot: WorkspaceSnapshot
):
  | Readonly<{
      status: 'ready';
      reads: readonly ValidWorkspaceNodeGraphRead[];
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspaceSemanticIndexIssue[];
    }> => {
  const reads: ValidWorkspaceNodeGraphRead[] = [];
  const issues: WorkspaceSemanticIndexIssue[] = [];
  for (const document of Object.values(snapshot.docsById)
    .filter((candidate) => candidate.type === 'pir-graph')
    .sort(
      (left, right) =>
        compareText(left.id, right.id) || compareText(left.path, right.path)
    )) {
    const read = decodeWorkspaceNodeGraphDocument(document);
    if (read.status === 'valid') {
      reads.push(read);
      continue;
    }
    if (read.status === 'invalid') {
      issues.push(
        ...read.issues.map((issue): WorkspaceSemanticIndexIssue => ({
          code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.documentInvalid,
          path: qualifyDocumentPath(document.id, issue.path),
          message: issue.message,
          documentId: document.id,
        }))
      );
    }
  }
  return issues.length > 0
    ? Object.freeze({ status: 'blocked', issues: Object.freeze(issues) })
    : Object.freeze({ status: 'ready', reads: Object.freeze(reads) });
};

const mapComponentGraphIssue = (
  issue: WorkspaceComponentGraphIssue
): WorkspaceSemanticIndexIssue => ({
  code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.componentGraphInvalid,
  path: issue.path,
  message: issue.message,
  causeCode: issue.causeCode ?? issue.code,
  documentId: issue.documentId,
  ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
  ...(issue.targetDocumentId
    ? { targetDocumentId: issue.targetDocumentId }
    : {}),
});

const mapIndexBuildIssue = (
  issue: SemanticIndexBuildIssue
): WorkspaceSemanticIndexIssue => ({
  code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.indexBuildFailed,
  path: issue.factId
    ? `/semantic/facts/${escapeJsonPointerSegment(issue.factId)}`
    : issue.providerId
      ? `/semantic/providers/${escapeJsonPointerSegment(issue.providerId)}`
      : '/semantic',
  message: issue.message,
  causeCode: issue.code,
  ...(issue.providerId ? { providerId: issue.providerId } : {}),
  ...(issue.factId ? { factId: issue.factId } : {}),
  ...(issue.relatedIds
    ? { relatedIds: Object.freeze([...issue.relatedIds]) }
    : {}),
});

const mapProviderSetupFailure = (
  error: unknown
): WorkspaceSemanticIndexIssue => ({
  code: WORKSPACE_SEMANTIC_INDEX_ISSUE_CODES.indexBuildFailed,
  path: '/semantic/providers',
  message:
    error instanceof Error
      ? error.message
      : 'Workspace PIR semantic provider setup failed.',
  causeCode: 'provider-setup-failed',
});

/**
 * Composes the sole revision-bound semantic projection from canonical PIR
 * documents. The PIR codec owns version recognition before facts are built.
 */
export const createWorkspaceSemanticIndexFromSnapshot = (
  snapshot: WorkspaceSnapshot,
  options: WorkspaceSemanticIndexCompositionOptions = {}
): WorkspaceSemanticIndexCompositionResult => {
  const collected = collectPirDocuments(snapshot);
  if (collected.status === 'blocked') return blocked(collected.issues);
  const animations = collectAnimationDocuments(snapshot);
  if (animations.status === 'blocked') return blocked(animations.issues);
  const nodeGraphs = collectNodeGraphDocuments(snapshot);
  if (nodeGraphs.status === 'blocked') return blocked(nodeGraphs.issues);

  const componentGraph = validateWorkspaceComponentGraph(snapshot);
  if (!componentGraph.valid) {
    return blocked(componentGraph.issues.map(mapComponentGraphIssue));
  }

  const workspaceRevisions = captureWorkspaceSemanticRevisions(snapshot);
  let providers: readonly SemanticContributionProvider[];
  try {
    providers = Object.freeze([
      createWorkspaceSemanticContributionProvider(snapshot),
      createRouteSemanticContributionProvider({
        workspaceId: snapshot.id,
        routeRev: snapshot.routeRev,
        manifest: snapshot.routeManifest,
      }),
      createPirSemanticContributionProvider({
        workspaceId: snapshot.id,
        documents: collected.reads.map((read) => ({
          documentId: read.document.id,
          documentType: read.document.type,
          revision: workspaceRevisions.documentRevs[read.document.id]!,
          document: read.decodedContent,
        })),
      }),
      createAnimationSemanticContributionProvider({
        workspaceId: snapshot.id,
        sources: animations.reads.map((read) => ({
          documentId: read.document.id,
          revision: workspaceRevisions.documentRevs[read.document.id]!,
          definition: read.decodedContent,
        })),
      }),
      createNodeGraphSemanticContributionProvider({
        workspaceId: snapshot.id,
        documents: nodeGraphs.reads.map((read) => ({
          documentId: read.document.id,
          ...(read.document.name ? { displayName: read.document.name } : {}),
          revision: workspaceRevisions.documentRevs[read.document.id]!,
          content: read.decodedContent,
        })),
      }),
      ...(options.additionalProviders ?? []),
    ]);
  } catch (error) {
    return blocked([mapProviderSetupFailure(error)]);
  }

  const result = createWorkspaceSemanticIndex({
    workspaceRevisions,
    schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
    providers,
  });
  if (!result.ok) return blocked(result.issues.map(mapIndexBuildIssue));
  return Object.freeze({ status: 'ready', index: result.index });
};
