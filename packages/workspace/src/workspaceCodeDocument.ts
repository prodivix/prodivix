import {
  decodeCodeArtifactLifecycleManifest,
  decodeShaderCompileProfile,
  type CodeArtifactLanguage,
} from '@prodivix/authoring';
import { decodeServerRuntimeProfile } from '@prodivix/server-runtime';
import type { WorkspaceCodeDocumentContent } from './types';

const CODE_ARTIFACT_LANGUAGES = new Set<CodeArtifactLanguage>([
  'ts',
  'js',
  'css',
  'scss',
  'glsl',
  'wgsl',
  'expr',
]);

export const isWorkspaceCodeDocumentContent = (
  content: unknown
): content is WorkspaceCodeDocumentContent => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return false;
  }

  const record = content as Record<string, unknown>;
  if (
    typeof record.language !== 'string' ||
    !CODE_ARTIFACT_LANGUAGES.has(record.language as CodeArtifactLanguage) ||
    typeof record.source !== 'string'
  ) {
    return false;
  }
  if (
    record.metadata !== undefined &&
    (!record.metadata ||
      typeof record.metadata !== 'object' ||
      Array.isArray(record.metadata))
  ) {
    return false;
  }
  return (
    decodeCodeArtifactLifecycleManifest(
      record.metadata as Record<string, unknown> | undefined
    ).status !== 'invalid' &&
    decodeShaderCompileProfile(
      record.metadata as Record<string, unknown> | undefined,
      record.language as CodeArtifactLanguage
    ).status !== 'invalid' &&
    decodeServerRuntimeProfile(
      record.metadata as Record<string, unknown> | undefined,
      record.language as CodeArtifactLanguage
    ).status !== 'invalid'
  );
};
