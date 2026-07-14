import { queryCodeSlotSemanticRelations } from '@prodivix/authoring';
import type { WorkspaceSnapshot } from '@prodivix/workspace';
import type { NavigateFunction } from 'react-router';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage/workspaceCodeLanguageEnvironment';
import { navigateToWorkspaceSemanticTarget } from './workspaceSemanticNavigation';
import type { WorkspaceSemanticNavigationResult } from './workspaceSemanticNavigation.types';

const unavailable = (
  reason: Extract<
    WorkspaceSemanticNavigationResult,
    { status: 'unavailable' }
  >['reason']
): WorkspaceSemanticNavigationResult => ({ status: 'unavailable', reason });

const navigateToWorkspaceCodeSlot = (input: {
  projectId: string;
  workspace: WorkspaceSnapshot;
  slotId: string;
  destination: 'definition' | 'source';
  navigate: NavigateFunction;
}): WorkspaceSemanticNavigationResult => {
  const environment = createWorkspaceCodeLanguageEnvironment(input.workspace);
  if (!environment.semanticIndex || !environment.codeSlotRegistry) {
    return unavailable('semantic-index-unavailable');
  }
  const relations = queryCodeSlotSemanticRelations({
    registry: environment.codeSlotRegistry,
    semanticIndex: environment.semanticIndex,
    slotId: input.slotId,
  });
  if (relations.status === 'stale') {
    return unavailable('semantic-index-stale');
  }
  if (relations.status === 'reference-missing') {
    return unavailable('semantic-reference-missing');
  }
  if (relations.status === 'unresolved') {
    return unavailable('semantic-reference-unresolved');
  }
  if (relations.status !== 'resolved') {
    return unavailable('target-unavailable');
  }
  return navigateToWorkspaceSemanticTarget({
    projectId: input.projectId,
    navigate: input.navigate,
    resolveSemanticIndex: () => environment.semanticIndex,
    target: {
      kind: 'semantic-reference',
      referenceId: relations.projection.semanticReferenceId,
      destination: input.destination,
      expectedSnapshotIdentity: environment.semanticIndex.snapshotIdentity,
    },
  });
};

export const navigateToWorkspaceCodeSlotDefinition = (
  input: Omit<Parameters<typeof navigateToWorkspaceCodeSlot>[0], 'destination'>
): WorkspaceSemanticNavigationResult =>
  navigateToWorkspaceCodeSlot({ ...input, destination: 'definition' });

export const navigateToWorkspaceCodeSlotOwner = (
  input: Omit<Parameters<typeof navigateToWorkspaceCodeSlot>[0], 'destination'>
): WorkspaceSemanticNavigationResult =>
  navigateToWorkspaceCodeSlot({ ...input, destination: 'source' });
