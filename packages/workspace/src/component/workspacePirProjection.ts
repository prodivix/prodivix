import type { WorkspaceSnapshot } from '../types';
import {
  validateWorkspaceComponentGraph,
  type WorkspaceComponentDependencyGraph,
  type WorkspaceComponentGraphIssue,
} from './workspaceComponentGraph';
import {
  decodeWorkspacePirDocument,
  type WorkspacePirDocument,
} from './workspacePirDocument';

export const WORKSPACE_PIR_PROJECTION_ISSUE_CODES = Object.freeze({
  entryMissing: 'WKS_PROJECTION_ENTRY_MISSING',
  entryUnsupported: 'WKS_PROJECTION_ENTRY_UNSUPPORTED',
  entryInvalid: 'WKS_PROJECTION_ENTRY_INVALID',
  componentGraphInvalid: 'WKS_PROJECTION_COMPONENT_GRAPH_INVALID',
} as const);

export type WorkspacePirProjectionIssueCode =
  (typeof WORKSPACE_PIR_PROJECTION_ISSUE_CODES)[keyof typeof WORKSPACE_PIR_PROJECTION_ISSUE_CODES];

export type WorkspacePirProjectionIssue = Readonly<{
  code: WorkspacePirProjectionIssueCode;
  path: string;
  message: string;
  causeCode?: string;
  documentId?: string;
  nodeId?: string;
  targetDocumentId?: string;
}>;

export type WorkspacePirProjectionSnapshotIdentity = Readonly<{
  workspaceId: string;
  workspaceRev: number;
  documents: Readonly<
    Record<
      string,
      Readonly<{
        contentRev: number;
        metaRev: number;
      }>
    >
  >;
}>;

export type WorkspacePirProjectionPlan = Readonly<{
  snapshotIdentity: WorkspacePirProjectionSnapshotIdentity;
  entryDocumentId: string;
  entryDocument: WorkspacePirDocument;
  documentsById: Readonly<Record<string, WorkspacePirDocument>>;
  dependencyFirstDocumentIds: readonly string[];
  componentDocumentIds: readonly string[];
  graph: WorkspaceComponentDependencyGraph;
}>;

export type WorkspacePirProjectionPlanResult =
  | Readonly<{
      status: 'ready';
      plan: WorkspacePirProjectionPlan;
    }>
  | Readonly<{
      status: 'blocked';
      issues: readonly WorkspacePirProjectionIssue[];
      graph: WorkspaceComponentDependencyGraph;
    }>;

export type CreateWorkspacePirProjectionPlanInput = Readonly<{
  workspace: WorkspaceSnapshot;
  entryDocumentId: string;
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const deepFreeze = <Value>(
  value: Value,
  seen: WeakSet<object> = new WeakSet()
): Value => {
  if (typeof value !== 'object' || value === null || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, seen);
  return Object.isFrozen(value) ? value : Object.freeze(value);
};

const cloneProjectionValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneProjectionValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      cloneProjectionValue(nested),
    ])
  );
};

const createImmutableProjectionDocument = (
  source: WorkspaceSnapshot['docsById'][string],
  content: WorkspacePirDocument['content']
): WorkspacePirDocument =>
  deepFreeze(
    cloneProjectionValue({ ...source, content }) as WorkspacePirDocument
  );

const escapeJsonPointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const compareIssues = (
  left: WorkspacePirProjectionIssue,
  right: WorkspacePirProjectionIssue
): number =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.causeCode ?? '', right.causeCode ?? '') ||
  compareText(left.message, right.message);

const blocked = (
  graph: WorkspaceComponentDependencyGraph,
  issues: readonly WorkspacePirProjectionIssue[]
): WorkspacePirProjectionPlanResult => ({
  status: 'blocked',
  graph,
  issues: [...issues].sort(compareIssues),
});

const mapGraphIssue = (
  issue: WorkspaceComponentGraphIssue
): WorkspacePirProjectionIssue => ({
  code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.componentGraphInvalid,
  causeCode: issue.causeCode ?? issue.code,
  path: issue.path,
  message: issue.message,
  documentId: issue.documentId,
  ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
  ...(issue.targetDocumentId
    ? { targetDocumentId: issue.targetDocumentId }
    : {}),
});

const collectDependencyFirstDocumentIds = (
  entryDocumentId: string,
  graph: WorkspaceComponentDependencyGraph
): readonly string[] => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  const visit = (documentId: string): void => {
    if (visited.has(documentId) || visiting.has(documentId)) return;
    visiting.add(documentId);
    for (const dependencyId of [
      ...(graph.dependenciesByDocumentId[documentId] ?? []),
    ].sort(compareText)) {
      visit(dependencyId);
    }
    visiting.delete(documentId);
    visited.add(documentId);
    ordered.push(documentId);
  };

  visit(entryDocumentId);
  return Object.freeze(ordered);
};

const projectReachableGraph = (
  graph: WorkspaceComponentDependencyGraph,
  dependencyFirstDocumentIds: readonly string[],
  componentDocumentIds: readonly string[]
): WorkspaceComponentDependencyGraph => {
  const reachable = new Set(dependencyFirstDocumentIds);
  const components = new Set(componentDocumentIds);
  return deepFreeze({
    documents: Object.freeze(
      graph.documents.filter(({ documentId }) => reachable.has(documentId))
    ),
    componentDocumentIds: Object.freeze([...componentDocumentIds]),
    componentTopologicalOrder: Object.freeze(
      dependencyFirstDocumentIds.filter((documentId) =>
        components.has(documentId)
      )
    ),
    edges: Object.freeze(
      graph.edges.filter(
        ({ sourceDocumentId, targetDocumentId }) =>
          reachable.has(sourceDocumentId) && reachable.has(targetDocumentId)
      )
    ),
    dependenciesByDocumentId: Object.freeze(
      Object.fromEntries(
        dependencyFirstDocumentIds.map((documentId) => [
          documentId,
          Object.freeze(
            (graph.dependenciesByDocumentId[documentId] ?? []).filter(
              (targetDocumentId) => reachable.has(targetDocumentId)
            )
          ),
        ])
      )
    ),
  });
};

const collectReachableDocuments = (
  workspace: WorkspaceSnapshot,
  documentIds: readonly string[]
):
  | Readonly<{
      ok: true;
      documentsById: Readonly<Record<string, WorkspacePirDocument>>;
    }>
  | Readonly<{
      ok: false;
      issues: readonly WorkspacePirProjectionIssue[];
    }> => {
  const documentsById: Record<string, WorkspacePirDocument> = {};
  const issues: WorkspacePirProjectionIssue[] = [];
  for (const documentId of documentIds) {
    const document = workspace.docsById[documentId];
    if (!document) {
      issues.push({
        code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryMissing,
        path: `/docsById/${escapeJsonPointerSegment(documentId)}`,
        message: 'A reachable PIR projection document is missing.',
        documentId,
      });
      continue;
    }
    const read = decodeWorkspacePirDocument(document, {
      workspaceId: workspace.id,
    });
    if (read.status !== 'valid') {
      const readIssues =
        read.status === 'decode-invalid' || read.status === 'semantic-invalid'
          ? read.issues
          : [];
      if (readIssues.length === 0) {
        issues.push({
          code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryUnsupported,
          path: `/docsById/${escapeJsonPointerSegment(documentId)}/content`,
          message: 'A reachable projection document must be canonical PIR.',
          documentId,
          causeCode: read.status,
        });
      } else {
        issues.push(
          ...readIssues.map((issue): WorkspacePirProjectionIssue => ({
            code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryInvalid,
            path: `/docsById/${escapeJsonPointerSegment(documentId)}/content${issue.path}`,
            message: issue.message,
            documentId,
            ...(issue.code ? { causeCode: issue.code } : {}),
          }))
        );
      }
      continue;
    }
    documentsById[documentId] = createImmutableProjectionDocument(
      document,
      read.decodedContent
    );
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, documentsById: Object.freeze(documentsById) };
};

/**
 * Creates the immutable, revision-bound read projection shared by canonical
 * PIR Renderer and Compiler integrations.
 */
export const createWorkspacePirProjectionPlan = (
  input: CreateWorkspacePirProjectionPlanInput
): WorkspacePirProjectionPlanResult => {
  const graphValidation = validateWorkspaceComponentGraph(input.workspace);
  const entry = input.workspace.docsById[input.entryDocumentId];
  if (!entry) {
    return blocked(graphValidation.graph, [
      {
        code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryMissing,
        path: `/docsById/${escapeJsonPointerSegment(input.entryDocumentId)}`,
        message: 'PIR projection entry document does not exist.',
        documentId: input.entryDocumentId,
      },
    ]);
  }
  const entryRead = decodeWorkspacePirDocument(entry, {
    workspaceId: input.workspace.id,
  });
  if (entryRead.status !== 'valid') {
    const issues =
      entryRead.status === 'decode-invalid' ||
      entryRead.status === 'semantic-invalid'
        ? entryRead.issues.map((issue): WorkspacePirProjectionIssue => ({
            code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryInvalid,
            path: `/docsById/${escapeJsonPointerSegment(input.entryDocumentId)}/content${issue.path}`,
            message: issue.message,
            documentId: input.entryDocumentId,
            ...(issue.code ? { causeCode: issue.code } : {}),
          }))
        : [
            {
              code: WORKSPACE_PIR_PROJECTION_ISSUE_CODES.entryUnsupported,
              path: `/docsById/${escapeJsonPointerSegment(input.entryDocumentId)}/content`,
              message:
                'Projection entry must be a canonical PIR page, layout, or component document.',
              documentId: input.entryDocumentId,
              causeCode: entryRead.status,
            } satisfies WorkspacePirProjectionIssue,
          ];
    return blocked(graphValidation.graph, issues);
  }
  const dependencyFirstDocumentIds = collectDependencyFirstDocumentIds(
    input.entryDocumentId,
    graphValidation.graph
  );
  const reachableDocumentIds = new Set(dependencyFirstDocumentIds);
  const reachableGraphIssues = graphValidation.issues.filter((issue) =>
    reachableDocumentIds.has(issue.documentId)
  );
  if (reachableGraphIssues.length > 0) {
    return blocked(
      graphValidation.graph,
      reachableGraphIssues.map(mapGraphIssue)
    );
  }
  const reachable = collectReachableDocuments(
    input.workspace,
    dependencyFirstDocumentIds
  );
  if (!reachable.ok) {
    return blocked(graphValidation.graph, reachable.issues);
  }
  const documentRevisions = Object.fromEntries(
    dependencyFirstDocumentIds.map((documentId) => {
      const document = reachable.documentsById[documentId]!;
      return [
        documentId,
        Object.freeze({
          contentRev: document.contentRev,
          metaRev: document.metaRev,
        }),
      ];
    })
  );
  const componentDocumentIds = Object.freeze(
    dependencyFirstDocumentIds.filter(
      (documentId) =>
        reachable.documentsById[documentId]?.type === 'pir-component'
    )
  );
  return {
    status: 'ready',
    plan: Object.freeze({
      snapshotIdentity: Object.freeze({
        workspaceId: input.workspace.id,
        workspaceRev: input.workspace.workspaceRev,
        documents: Object.freeze(documentRevisions),
      }),
      entryDocumentId: input.entryDocumentId,
      entryDocument: reachable.documentsById[input.entryDocumentId]!,
      documentsById: reachable.documentsById,
      dependencyFirstDocumentIds,
      componentDocumentIds,
      graph: projectReachableGraph(
        graphValidation.graph,
        dependencyFirstDocumentIds,
        componentDocumentIds
      ),
    }),
  };
};
