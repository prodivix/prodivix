import { queryCodeSlotSemanticRelations } from './codeSlotSemanticRelations';
import type { CodeSlotRegistry } from './codeSlotRegistry';
import type {
  CodeSlotBindingProjection,
  CodeSlotContract,
} from './authoring.types';
import type { CodeLanguageWorkspaceEditProposal } from './language';
import {
  isSameSemanticSnapshotIdentity,
  type WorkspaceReferenceEdge,
  type WorkspaceSemanticIndex,
  type WorkspaceSymbol,
} from './semantic';

export type CodeArtifactBindingRefactorImpact = Readonly<{
  slot: CodeSlotContract | null;
  projection: CodeSlotBindingProjection;
  relationStatus:
    'resolved' | 'reference-missing' | 'unresolved' | 'stale' | 'slot-missing';
  definition?: WorkspaceSymbol;
  references: readonly WorkspaceReferenceEdge[];
  impactedSymbolIds: readonly string[];
}>;

export type CodeArtifactRefactorImpact = Readonly<{
  artifactId: string;
  bindings: readonly CodeArtifactBindingRefactorImpact[];
  referenceIds: readonly string[];
  impactedSymbolIds: readonly string[];
}>;

export type CodeLanguageRenameImpact =
  | Readonly<{
      status: 'ready';
      artifactIds: readonly string[];
      editCount: number;
      affectedBindings: readonly CodeArtifactBindingRefactorImpact[];
      referenceIds: readonly string[];
      impactedSymbolIds: readonly string[];
    }>
  | Readonly<{
      status: 'stale';
    }>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const uniqueSorted = (values: Iterable<string>): readonly string[] =>
  Object.freeze(Array.from(new Set(values)).sort(compareText));

const comparePosition = (
  left: Readonly<{ line: number; column: number }>,
  right: Readonly<{ line: number; column: number }>
): number => left.line - right.line || left.column - right.column;

const sourceSpansOverlap = (
  left: NonNullable<WorkspaceSymbol['sourceSpan']>,
  right: NonNullable<WorkspaceSymbol['sourceSpan']>
): boolean =>
  left.artifactId === right.artifactId &&
  comparePosition(
    { line: left.startLine, column: left.startColumn },
    { line: right.endLine, column: right.endColumn }
  ) < 0 &&
  comparePosition(
    { line: right.startLine, column: right.startColumn },
    { line: left.endLine, column: left.endColumn }
  ) < 0;

/**
 * Projects every domain-owned CodeSlot binding that targets one artifact onto
 * the common semantic graph. Paths remain presentation data; the returned
 * impact is keyed entirely by stable artifact, slot, symbol, and reference ids.
 */
export const queryCodeArtifactRefactorImpact = (input: {
  artifactId: string;
  registry: CodeSlotRegistry;
  semanticIndex: WorkspaceSemanticIndex;
}): CodeArtifactRefactorImpact => {
  const bindings = input.registry
    .listBindingProjectionsByArtifact(input.artifactId)
    .map((projection): CodeArtifactBindingRefactorImpact => {
      const relation = queryCodeSlotSemanticRelations({
        registry: input.registry,
        semanticIndex: input.semanticIndex,
        slotId: projection.binding.slotId,
      });
      if (relation.status === 'resolved') {
        return Object.freeze({
          slot: relation.slot,
          projection,
          relationStatus: relation.status,
          definition: relation.definition,
          references: relation.references,
          impactedSymbolIds: relation.impact.impactedSymbolIds,
        });
      }
      return Object.freeze({
        slot: relation.status === 'slot-missing' ? null : relation.slot,
        projection,
        relationStatus:
          relation.status === 'unbound' ? 'reference-missing' : relation.status,
        references: Object.freeze([]),
        impactedSymbolIds: Object.freeze([]),
      });
    })
    .sort((left, right) =>
      compareText(
        left.projection.binding.slotId,
        right.projection.binding.slotId
      )
    );

  return Object.freeze({
    artifactId: input.artifactId,
    bindings: Object.freeze(bindings),
    referenceIds: uniqueSorted(
      bindings.flatMap(({ references }) => references.map(({ id }) => id))
    ),
    impactedSymbolIds: uniqueSorted(
      bindings.flatMap(({ impactedSymbolIds }) => impactedSymbolIds)
    ),
  });
};

/**
 * Identifies persisted CodeReference owners whose named target is changed by a
 * revision-bound language rename. Those owners require an owner-specific
 * rewrite and must not be silently left behind by a code-only transaction.
 */
export const analyzeCodeLanguageRenameImpact = (input: {
  currentName: string;
  proposal: CodeLanguageWorkspaceEditProposal;
  registry: CodeSlotRegistry;
  semanticIndex: WorkspaceSemanticIndex;
}): CodeLanguageRenameImpact => {
  if (
    !isSameSemanticSnapshotIdentity(
      input.proposal.snapshotIdentity.semanticSnapshotIdentity,
      input.semanticIndex.snapshotIdentity
    )
  ) {
    return Object.freeze({ status: 'stale' });
  }

  const artifactIds = uniqueSorted(
    input.proposal.edits.map(({ artifactId }) => artifactId)
  );
  const editsByArtifact = new Map(
    artifactIds.map((artifactId) => [
      artifactId,
      input.proposal.edits.filter((edit) => edit.artifactId === artifactId),
    ])
  );
  const affectedBindings = artifactIds
    .flatMap(
      (artifactId) =>
        queryCodeArtifactRefactorImpact({
          artifactId,
          registry: input.registry,
          semanticIndex: input.semanticIndex,
        }).bindings
    )
    .filter((impact) => {
      const reference = impact.projection.binding.reference;
      if (
        impact.relationStatus !== 'resolved' ||
        !impact.definition?.sourceSpan ||
        (reference.exportName !== input.currentName &&
          (!reference.symbolId || impact.definition.name !== input.currentName))
      ) {
        return false;
      }
      return (
        editsByArtifact.get(impact.definition.sourceSpan.artifactId) ?? []
      ).some((edit) =>
        sourceSpansOverlap(edit.sourceSpan, impact.definition!.sourceSpan!)
      );
    })
    .sort((left, right) =>
      compareText(
        left.projection.binding.slotId,
        right.projection.binding.slotId
      )
    );

  return Object.freeze({
    status: 'ready',
    artifactIds,
    editCount: input.proposal.edits.length,
    affectedBindings: Object.freeze(affectedBindings),
    referenceIds: uniqueSorted(
      affectedBindings.flatMap(({ references }) =>
        references.map(({ id }) => id)
      )
    ),
    impactedSymbolIds: uniqueSorted(
      affectedBindings.flatMap(({ impactedSymbolIds }) => impactedSymbolIds)
    ),
  });
};
