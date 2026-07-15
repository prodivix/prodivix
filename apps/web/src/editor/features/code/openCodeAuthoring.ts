import { queryCodeSlotSemanticRelations } from '@prodivix/authoring';
import {
  isWorkspaceCodeDocumentContent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';
import {
  openCodeAuthoringOverlay,
  resolveCodeAuthoringPresentation,
  type CodeAuthoringOverlayPresentation,
} from './codeAuthoringOverlayStore';

export type CodeAuthoringOpenResult =
  | Readonly<{
      status: 'opened';
      artifactId: string;
      presentation: CodeAuthoringOverlayPresentation;
    }>
  | Readonly<{
      status: 'unavailable';
      reason:
        | 'artifact-unavailable'
        | 'semantic-index-unavailable'
        | 'semantic-index-stale'
        | 'semantic-reference-missing'
        | 'semantic-reference-unresolved'
        | 'slot-unavailable';
    }>;

export const openWorkspaceCodeArtifact = (input: {
  workspace: WorkspaceSnapshot;
  artifactId: string;
  presentation?: CodeAuthoringOverlayPresentation;
  slotId?: string;
}): CodeAuthoringOpenResult => {
  const document = input.workspace.docsById[input.artifactId];
  if (
    !document ||
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return { status: 'unavailable', reason: 'artifact-unavailable' };
  }
  const presentation = input.presentation ?? 'maximized';
  openCodeAuthoringOverlay({
    workspaceId: input.workspace.id,
    artifactId: input.artifactId,
    presentation,
    ...(input.slotId ? { slotId: input.slotId } : {}),
  });
  return { status: 'opened', artifactId: input.artifactId, presentation };
};

export const openWorkspaceCodeSlotDefinition = (input: {
  workspace: WorkspaceSnapshot;
  slotId: string;
}): CodeAuthoringOpenResult => {
  const environment = createWorkspaceCodeLanguageEnvironment(input.workspace);
  if (!environment.semanticIndex || !environment.codeSlotRegistry) {
    return { status: 'unavailable', reason: 'semantic-index-unavailable' };
  }
  const slot = environment.codeSlotRegistry.getSlot(input.slotId);
  if (!slot) return { status: 'unavailable', reason: 'slot-unavailable' };
  const relations = queryCodeSlotSemanticRelations({
    registry: environment.codeSlotRegistry,
    semanticIndex: environment.semanticIndex,
    slotId: input.slotId,
  });
  if (relations.status === 'stale') {
    return { status: 'unavailable', reason: 'semantic-index-stale' };
  }
  if (relations.status === 'reference-missing') {
    return { status: 'unavailable', reason: 'semantic-reference-missing' };
  }
  if (relations.status === 'unresolved') {
    return { status: 'unavailable', reason: 'semantic-reference-unresolved' };
  }
  if (relations.status !== 'resolved') {
    return { status: 'unavailable', reason: 'slot-unavailable' };
  }
  return openWorkspaceCodeArtifact({
    workspace: input.workspace,
    artifactId: relations.projection.binding.reference.artifactId,
    slotId: input.slotId,
    presentation: resolveCodeAuthoringPresentation(slot.kind),
  });
};
