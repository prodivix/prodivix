import type {
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionReferenceProvider,
} from './workspaceComponentExtractionReference.types';
import { collectIncomingWorkspaceComponentExtractionReferences } from './workspaceComponentExtractionIncomingReferenceProvider';
import { collectMovedPirExtractionReferences } from './workspaceComponentExtractionPirReferenceProvider';

export const createBuiltInWorkspaceComponentExtractionReferenceProviders = (
  context: NormalizedWorkspaceComponentExtractionReferenceContext
): readonly WorkspaceComponentExtractionReferenceProvider[] => [
  {
    descriptor: { id: 'core.pir.extraction-references', version: '1' },
    contribute() {
      return context.pirBoundaryAlreadyApplied
        ? []
        : collectMovedPirExtractionReferences(context);
    },
  },
  {
    descriptor: {
      id: 'core.workspace.extraction-incoming-references',
      version: '1',
    },
    contribute() {
      return collectIncomingWorkspaceComponentExtractionReferences(context);
    },
  },
];
