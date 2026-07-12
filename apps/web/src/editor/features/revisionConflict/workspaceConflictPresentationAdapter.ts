import type {
  WorkspaceConflictSession,
  WorkspaceThreeWayAnalysis,
} from '@prodivix/workspace-sync';
import { adaptCodeDocumentDiffs } from './codeDocumentDiffAdapter';
import { adaptNodeGraphDiffs } from './nodeGraphDiffAdapter';
import type {
  WorkspaceRevisionConflictPresentation,
  WorkspaceThreeWayPresentationInput,
} from './revisionConflictAdapterTypes';
import { uniqueSorted } from './revisionConflictAdapterUtils';

export type WorkspaceThreeWayPresentationOptions = Omit<
  WorkspaceThreeWayPresentationInput,
  'analysis'
>;

const adaptInput = (
  input: WorkspaceThreeWayPresentationInput
): WorkspaceRevisionConflictPresentation => {
  const codeDocuments = adaptCodeDocumentDiffs(input);
  const nodeGraphResult = adaptNodeGraphDiffs(input);
  const representedConflictIds = new Set<string>(
    codeDocuments.flatMap((document) => document.conflictIds)
  );
  nodeGraphResult.representedConflictIds.forEach((conflictId) =>
    representedConflictIds.add(conflictId)
  );
  return {
    codeDocuments,
    nodeGraphs: nodeGraphResult.presentations,
    unsupportedConflictIds: uniqueSorted(
      input.analysis.conflicts
        .map((conflict) => conflict.id)
        .filter((conflictId) => !representedConflictIds.has(conflictId))
    ),
  };
};

/** Adapts an analysis even before a persistent conflict session is created. */
export const adaptWorkspaceThreeWayAnalysis = (
  analysis: WorkspaceThreeWayAnalysis,
  options: WorkspaceThreeWayPresentationOptions = {}
): WorkspaceRevisionConflictPresentation =>
  adaptInput({ analysis, ...options });

/** Adapts an open or resolved session, including its exact three snapshots and choices. */
export const adaptWorkspaceConflictSession = (
  session: WorkspaceConflictSession
): WorkspaceRevisionConflictPresentation =>
  adaptInput({
    analysis: session.analysis,
    baseSnapshot: session.baseSnapshot,
    localSnapshot: session.localSnapshot,
    remoteSnapshot: session.remoteSnapshot,
    resolutions: session.resolutions,
  });
