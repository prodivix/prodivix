import type { CodeReference } from '../authoring.types';
import {
  createCodeArtifactScopeId,
  createCodeArtifactSymbolId,
  createCodeSymbolId,
} from './semanticIds';
import type { SemanticReferenceTarget } from './semantic.types';

export const CODE_REFERENCE_EXPORT_SYMBOL_KINDS = Object.freeze([
  'code-export',
  'code-function',
  'code-type',
] as const);

/** Resolves one persisted CodeReference to its most specific semantic target. */
export const createCodeReferenceSemanticTarget = (
  workspaceId: string,
  reference: CodeReference
): SemanticReferenceTarget => {
  if (reference.symbolId) {
    return {
      kind: 'symbol-id',
      symbolId: createCodeSymbolId(
        workspaceId,
        reference.artifactId,
        reference.symbolId
      ),
    };
  }
  if (reference.exportName) {
    return {
      kind: 'name',
      name: reference.exportName,
      symbolKinds: CODE_REFERENCE_EXPORT_SYMBOL_KINDS,
      targetScopeId: createCodeArtifactScopeId(
        workspaceId,
        reference.artifactId
      ),
    };
  }
  return {
    kind: 'symbol-id',
    symbolId: createCodeArtifactSymbolId(workspaceId, reference.artifactId),
  };
};

export const getCodeReferenceSemanticRole = (
  reference: CodeReference
): 'code-symbol' | 'code-artifact' =>
  reference.symbolId || reference.exportName ? 'code-symbol' : 'code-artifact';
