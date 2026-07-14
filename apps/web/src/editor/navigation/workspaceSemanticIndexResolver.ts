import { createWorkspaceCodeLanguageEnvironment } from '@/editor/codeLanguage';
import type { WorkspaceSemanticIndexResolver } from './workspaceSemanticNavigation.types';

/** Supplies the canonical, domain-complete Workspace semantic projection. */
export const resolveWorkspaceSemanticIndex: WorkspaceSemanticIndexResolver = (
  workspace
) => {
  return createWorkspaceCodeLanguageEnvironment(workspace).semanticIndex;
};
