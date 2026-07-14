import { createSemanticId } from '@prodivix/authoring';

export const createCodeModuleScopeId = (
  workspaceId: string,
  artifactId: string
): string => createSemanticId('code-module-scope', workspaceId, artifactId);

export const createCodeModuleSymbolId = (
  workspaceId: string,
  artifactId: string
): string => createSemanticId('code-module-symbol', workspaceId, artifactId);
