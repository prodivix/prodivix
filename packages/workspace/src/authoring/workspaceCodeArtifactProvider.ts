import {
  decodeCodeArtifactLifecycleManifest,
  decodeControlledSourceManifest,
  decodeShaderCompileProfile,
  type AuthoringContext,
  type CodeArtifact,
  type CodeArtifactProvider,
} from '@prodivix/authoring';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import { isWorkspaceCodeDocumentContent } from '../workspaceCodeDocument';

const CODE_ARTIFACT_PROVIDER_ID = 'workspace-code-documents';

const toCodeArtifact = (document: WorkspaceDocument): CodeArtifact | null => {
  if (
    document.type !== 'code' ||
    !isWorkspaceCodeDocumentContent(document.content)
  ) {
    return null;
  }
  const controlledSource = decodeControlledSourceManifest(
    document.content.metadata
  );
  const lifecycle = decodeCodeArtifactLifecycleManifest(
    document.content.metadata
  );
  const shaderCompile = decodeShaderCompileProfile(
    document.content.metadata,
    document.content.language
  );

  return {
    id: document.id,
    path: document.path,
    language: document.content.language,
    ownership: controlledSource.status === 'valid' ? 'adapted' : 'code-owned',
    owner: { kind: 'workspace-module', documentId: document.id },
    source: document.content.source,
    revision: String(document.contentRev),
    ...(controlledSource.status === 'valid'
      ? { controlledSource: controlledSource.manifest }
      : {}),
    ...(lifecycle.status === 'valid'
      ? { lifecycleManifest: lifecycle.manifest }
      : {}),
    ...(shaderCompile.status === 'valid'
      ? { shaderCompileProfile: shaderCompile.profile }
      : {}),
  };
};

export const createWorkspaceCodeArtifactProvider = (
  snapshot: WorkspaceSnapshot
): CodeArtifactProvider => {
  const listAllArtifacts = (): CodeArtifact[] =>
    Object.values(snapshot.docsById)
      .map(toCodeArtifact)
      .filter((artifact): artifact is CodeArtifact => Boolean(artifact));

  return {
    id: CODE_ARTIFACT_PROVIDER_ID,
    source: { kind: 'workspace' },
    listArtifacts(context: AuthoringContext) {
      const artifacts = listAllArtifacts();
      if (!context.artifactId) return artifacts;
      return artifacts.filter((artifact) => artifact.id === context.artifactId);
    },
    getArtifact(id: string) {
      return listAllArtifacts().find((artifact) => artifact.id === id) ?? null;
    },
  };
};
