export type RevisionConflictChoice = 'local' | 'remote';

export type CodeDiffLineKind = 'context' | 'added' | 'deleted' | 'modified';

export type CodeDiffLinePresentation = {
  content: string;
  kind: CodeDiffLineKind;
  lineNumber?: number;
};

export type CodeDiffSidePresentation = {
  lines: readonly CodeDiffLinePresentation[];
  startLine?: number;
};

/**
 * A display-ready text hunk produced by the workspace Diff Core adapter.
 * The UI intentionally consumes hunks instead of recomputing document diffs.
 */
export type CodeDocumentDiffHunkPresentation = {
  base?: CodeDiffSidePresentation;
  header?: string;
  id: string;
  isConflict: boolean;
  local: CodeDiffSidePresentation;
  remote: CodeDiffSidePresentation;
  resolution?: RevisionConflictChoice;
  /** Core conflict resolved when the user chooses either side of this hunk. */
  resolutionTargetId?: string;
};

export type CodeDocumentDiffSummary = {
  conflictCount: number;
  hunkCount: number;
  resolvedConflictCount: number;
  unresolvedConflictCount: number;
};

export const summarizeCodeDocumentDiff = (
  hunks: readonly CodeDocumentDiffHunkPresentation[]
): CodeDocumentDiffSummary => {
  const conflictHunks = hunks.filter((hunk) => hunk.isConflict);
  const resolvedConflictCount = conflictHunks.filter(
    (hunk) => hunk.resolution !== undefined
  ).length;

  return {
    conflictCount: conflictHunks.length,
    hunkCount: hunks.length,
    resolvedConflictCount,
    unresolvedConflictCount: conflictHunks.length - resolvedConflictCount,
  };
};

export type NodeGraphDiffStatus =
  | 'unchanged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'conflict-local'
  | 'conflict-remote';

export type NodeGraphDiffTone =
  'neutral' | 'green' | 'red' | 'yellow' | 'purple';

export type NodeGraphDiffSemantic = {
  borderStyle: 'solid' | 'dashed' | 'double';
  edgeDash?: string;
  label: 'UNCHANGED' | 'MODIFIED' | 'ADD' | 'DELETE' | 'LOCAL' | 'REMOTE';
  symbol: '·' | '~' | '+' | '−' | 'L' | 'R';
  tone: NodeGraphDiffTone;
};

export const NODE_GRAPH_DIFF_SEMANTICS: Readonly<
  Record<NodeGraphDiffStatus, NodeGraphDiffSemantic>
> = {
  unchanged: {
    borderStyle: 'solid',
    label: 'UNCHANGED',
    symbol: '·',
    tone: 'neutral',
  },
  modified: {
    borderStyle: 'solid',
    label: 'MODIFIED',
    symbol: '~',
    tone: 'neutral',
  },
  added: {
    borderStyle: 'solid',
    label: 'ADD',
    symbol: '+',
    tone: 'green',
  },
  deleted: {
    borderStyle: 'dashed',
    edgeDash: '8 5',
    label: 'DELETE',
    symbol: '−',
    tone: 'red',
  },
  'conflict-local': {
    borderStyle: 'solid',
    edgeDash: '3 2',
    label: 'LOCAL',
    symbol: 'L',
    tone: 'yellow',
  },
  'conflict-remote': {
    borderStyle: 'double',
    edgeDash: '2 5',
    label: 'REMOTE',
    symbol: 'R',
    tone: 'purple',
  },
};

export type NodeGraphDiffFieldPresentation = {
  base?: string;
  conflictIds?: readonly string[];
  isConflict?: boolean;
  local?: string;
  path: string;
  remote?: string;
};

export type NodeGraphDiffPortPresentation = {
  entityId: string;
  label: string;
  role: 'input' | 'output';
  status: NodeGraphDiffStatus;
  visualId: string;
};

export type NodeGraphDiffNodePresentation = {
  changedFields?: readonly NodeGraphDiffFieldPresentation[];
  conflictIds?: readonly string[];
  description?: string;
  entityId: string;
  label: string;
  nodeKind?: string;
  position: { x: number; y: number };
  ports?: readonly NodeGraphDiffPortPresentation[];
  resolution?: RevisionConflictChoice;
  status: NodeGraphDiffStatus;
  visualId: string;
};

export type NodeGraphDiffEdgePresentation = {
  changedFields?: readonly NodeGraphDiffFieldPresentation[];
  conflictIds?: readonly string[];
  entityId: string;
  label?: string;
  resolution?: RevisionConflictChoice;
  sourceVisualId: string;
  status: NodeGraphDiffStatus;
  targetVisualId: string;
  visualId: string;
};

export type NodeGraphDiffPresentationIssue = {
  code:
    | 'duplicate-visual-id'
    | 'missing-conflict-counterpart'
    | 'dangling-edge-source'
    | 'dangling-edge-target';
  entityId?: string;
  message: string;
  visualId?: string;
};

/**
 * Protects the review UI from ambiguous graph adapters. A conflicted node,
 * port, or edge is valid only when LOCAL and REMOTE visuals are both present.
 */
export const validateNodeGraphDiffPresentation = (
  nodes: readonly NodeGraphDiffNodePresentation[],
  edges: readonly NodeGraphDiffEdgePresentation[]
): readonly NodeGraphDiffPresentationIssue[] => {
  const issues: NodeGraphDiffPresentationIssue[] = [];
  const visualIds = new Set<string>();

  const registerVisualId = (
    visualId: string,
    entityId: string,
    kind: 'node' | 'port' | 'edge'
  ) => {
    if (visualIds.has(visualId)) {
      issues.push({
        code: 'duplicate-visual-id',
        entityId,
        message: `Duplicate ${kind} visual id: ${visualId}`,
        visualId,
      });
    }
    visualIds.add(visualId);
  };

  for (const node of nodes) {
    registerVisualId(node.visualId, node.entityId, 'node');
    for (const port of node.ports ?? []) {
      registerVisualId(port.visualId, port.entityId, 'port');
    }
  }

  for (const edge of edges) {
    registerVisualId(edge.visualId, edge.entityId, 'edge');
  }

  const validateConflictPairs = (
    items: readonly { entityId: string; status: NodeGraphDiffStatus }[],
    kind: 'node' | 'port' | 'edge'
  ) => {
    const countsByEntityId = new Map<
      string,
      { local: number; remote: number }
    >();
    for (const item of items) {
      if (
        item.status !== 'conflict-local' &&
        item.status !== 'conflict-remote'
      ) {
        continue;
      }
      const counts = countsByEntityId.get(item.entityId) ?? {
        local: 0,
        remote: 0,
      };
      if (item.status === 'conflict-local') counts.local += 1;
      else counts.remote += 1;
      countsByEntityId.set(item.entityId, counts);
    }

    for (const [entityId, counts] of countsByEntityId) {
      if (counts.local !== 1 || counts.remote !== 1) {
        issues.push({
          code: 'missing-conflict-counterpart',
          entityId,
          message: `Conflict ${kind} ${entityId} must include exactly one LOCAL and one REMOTE visual.`,
        });
      }
    }
  };

  validateConflictPairs(nodes, 'node');
  validateConflictPairs(
    nodes.flatMap((node) => node.ports ?? []),
    'port'
  );
  validateConflictPairs(edges, 'edge');

  const nodeVisualIds = new Set(nodes.map((node) => node.visualId));
  for (const edge of edges) {
    if (!nodeVisualIds.has(edge.sourceVisualId)) {
      issues.push({
        code: 'dangling-edge-source',
        entityId: edge.entityId,
        message: `Edge ${edge.visualId} references missing source ${edge.sourceVisualId}.`,
        visualId: edge.visualId,
      });
    }
    if (!nodeVisualIds.has(edge.targetVisualId)) {
      issues.push({
        code: 'dangling-edge-target',
        entityId: edge.entityId,
        message: `Edge ${edge.visualId} references missing target ${edge.targetVisualId}.`,
        visualId: edge.visualId,
      });
    }
  }

  return issues;
};

export type NodeGraphDiffSummary = {
  addedCount: number;
  conflictCount: number;
  deletedCount: number;
  modifiedCount: number;
  unresolvedConflictCount: number;
};

export const summarizeNodeGraphDiff = (
  nodes: readonly NodeGraphDiffNodePresentation[]
): NodeGraphDiffSummary => {
  const conflictEntityIds = new Set<string>();
  const resolvedConflictEntityIds = new Set<string>();

  for (const node of nodes) {
    if (node.status === 'conflict-local' || node.status === 'conflict-remote') {
      conflictEntityIds.add(node.entityId);
      if (node.resolution) resolvedConflictEntityIds.add(node.entityId);
    }
  }

  return {
    addedCount: nodes.filter((node) => node.status === 'added').length,
    conflictCount: conflictEntityIds.size,
    deletedCount: nodes.filter((node) => node.status === 'deleted').length,
    modifiedCount: nodes.filter((node) => node.status === 'modified').length,
    unresolvedConflictCount:
      conflictEntityIds.size - resolvedConflictEntityIds.size,
  };
};
