import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type {
  WorkspaceConflictResolutionChoice,
  WorkspaceThreeWayAnalysis,
} from '@prodivix/workspace-sync';
import type {
  CodeDocumentDiffHunkPresentation,
  NodeGraphDiffEdgePresentation,
  NodeGraphDiffFieldPresentation,
  NodeGraphDiffNodePresentation,
} from './revisionConflictPresentation';

export type WorkspaceThreeWayPresentationInput = {
  analysis: WorkspaceThreeWayAnalysis;
  baseSnapshot?: WorkspaceSnapshot;
  localSnapshot?: WorkspaceSnapshot;
  remoteSnapshot?: WorkspaceSnapshot;
  resolutions?: Readonly<Record<string, WorkspaceConflictResolutionChoice>>;
};

export type CodeDocumentRevisionDiffPresentation = {
  conflictIds: readonly string[];
  documentId: string;
  documentPath: string;
  hunks: readonly CodeDocumentDiffHunkPresentation[];
  language: string;
};

export type NodeGraphRevisionDiffPresentation = {
  changedFields: readonly NodeGraphDiffFieldPresentation[];
  conflictIds: readonly string[];
  documentId: string;
  documentPath: string;
  edges: readonly NodeGraphDiffEdgePresentation[];
  graphLabel: string;
  nodes: readonly NodeGraphDiffNodePresentation[];
};

export type WorkspaceRevisionConflictPresentation = {
  codeDocuments: readonly CodeDocumentRevisionDiffPresentation[];
  nodeGraphs: readonly NodeGraphRevisionDiffPresentation[];
  /** Conflicts without a code-source or stable node-graph presentation. */
  unsupportedConflictIds: readonly string[];
};
