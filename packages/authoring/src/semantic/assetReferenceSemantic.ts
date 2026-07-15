import type { AssetReference } from '../authoring.types';
import { createAssetSymbolId } from './semanticIds';
import type { SemanticReferenceTarget } from './semantic.types';

export const ASSET_REFERENCE_SYMBOL_KINDS = Object.freeze(['asset'] as const);

/** Resolves one persisted AssetReference to its durable asset symbol. */
export const createAssetReferenceSemanticTarget = (
  workspaceId: string,
  reference: AssetReference
): SemanticReferenceTarget => ({
  kind: 'symbol-id',
  symbolId: createAssetSymbolId(workspaceId, reference.assetDocumentId),
});

/** Converts optional MIME constraints to Semantic Index type requirements. */
export const createAssetReferenceExpectedTypeRefs = (
  reference: AssetReference
): readonly string[] | undefined => {
  const types = Array.from(
    new Set(
      (reference.expectedMimeTypes ?? [])
        .map((value) => value.trim().toLocaleLowerCase('en-US'))
        .filter(Boolean)
    )
  ).sort();
  return types.length > 0
    ? Object.freeze(types.map((value) => `asset:${value}`))
    : undefined;
};
