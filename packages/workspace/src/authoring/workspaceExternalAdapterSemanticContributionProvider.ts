import {
  createCodeReferenceSemanticTarget,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import {
  createWorkspaceExternalAdapterCodeReferenceId,
  type WorkspaceExternalAdapterEntry,
} from './workspaceExternalAdapter';

export const WORKSPACE_EXTERNAL_ADAPTER_SEMANTIC_PROVIDER_DESCRIPTOR =
  Object.freeze({
    id: 'core.external-library-adapter',
    semanticVersion: '1',
  });

const createExternalLibrarySymbolId = (
  workspaceId: string,
  libraryId: string
): string =>
  createSemanticId('external-library-symbol', workspaceId, libraryId);

const compareId = (left: { id: string }, right: { id: string }): number =>
  left.id.localeCompare(right.id);

const freezeFacts = <Fact extends { id: string }>(
  facts: Fact[]
): readonly Fact[] =>
  Object.freeze(facts.sort(compareId).map((fact) => Object.freeze(fact)));

/** Publishes config-owned libraries and adapter bindings into one semantic snapshot. */
export const createWorkspaceExternalAdapterSemanticContributionProvider = (
  input: Readonly<{
    workspaceId: string;
    configDocumentId: string;
    configDocumentRevision: SemanticDocumentRevision;
    entries: readonly WorkspaceExternalAdapterEntry[];
  }>
): SemanticContributionProvider => ({
  descriptor: WORKSPACE_EXTERNAL_ADAPTER_SEMANTIC_PROVIDER_DESCRIPTOR,
  contribute(identity) {
    const actual =
      identity.workspaceRevisions.documentRevs[input.configDocumentId];
    if (
      identity.workspaceRevisions.workspaceId !== input.workspaceId ||
      !actual ||
      actual.contentRev !== input.configDocumentRevision.contentRev ||
      actual.metaRev !== input.configDocumentRevision.metaRev
    ) {
      throw new Error(
        `External adapter semantic snapshot mismatch for document "${input.configDocumentId}".`
      );
    }

    const documentScopeId = createWorkspaceDocumentScopeId(
      input.workspaceId,
      input.configDocumentId
    );
    const ownerRef = {
      kind: 'document' as const,
      workspaceId: input.workspaceId,
      documentId: input.configDocumentId,
    };
    const symbols: WorkspaceSymbolContribution[] = [];
    const references: WorkspaceReferenceFact[] = [];
    const dependencies: WorkspaceDependencyContribution[] = [];

    [...input.entries]
      .sort((left, right) => left.libraryId.localeCompare(right.libraryId))
      .forEach((entry) => {
        const librarySymbolId = createExternalLibrarySymbolId(
          input.workspaceId,
          entry.libraryId
        );
        symbols.push({
          id: librarySymbolId,
          stability: 'durable',
          kind: 'external-contract',
          name: entry.libraryId,
          displayName: entry.libraryId,
          qualifiedName: `external-library:${entry.libraryId}`,
          scopeId: documentScopeId,
          ownerRef,
          typeRef: 'external-library:adapter-host',
          capabilityIds: [
            'external-library',
            `external-library:${entry.libraryId}`,
          ],
        });
        dependencies.push({
          id: createSemanticId(
            'external-library-document-dependency',
            input.workspaceId,
            input.configDocumentId,
            entry.libraryId
          ),
          kind: 'document',
          sourceSymbolId: librarySymbolId,
          targetSymbolId: createWorkspaceDocumentSymbolId(
            input.workspaceId,
            input.configDocumentId
          ),
        });
        if (!entry.binding) return;
        references.push({
          id: createWorkspaceExternalAdapterCodeReferenceId(
            input.workspaceId,
            entry.libraryId,
            entry.binding.reference
          ),
          kind: 'code-reference',
          sourceRef: ownerRef,
          sourceSymbolId: librarySymbolId,
          scopeId: documentScopeId,
          target: createCodeReferenceSemanticTarget(
            input.workspaceId,
            entry.binding.reference
          ),
          resolutionMode: 'addressable',
          requiresDurableTarget: true,
        });
      });

    return Object.freeze({
      symbols: freezeFacts(symbols),
      references: freezeFacts(references),
      dependencies: freezeFacts(dependencies),
    });
  },
});
