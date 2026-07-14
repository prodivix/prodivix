import { createWorkspaceSemanticIndex } from './createWorkspaceSemanticIndex';
import { compareSemanticText } from './semanticOrder';
import type {
  SemanticContributionProvider,
  SemanticIndexBuildResult,
  SemanticSnapshotRevision,
} from './semantic.types';

export type SemanticContributionProviderRegistry = Readonly<{
  register(provider: SemanticContributionProvider): void;
  unregister(providerId: string): void;
  listProviders(): readonly SemanticContributionProvider[];
  createIndex(revision: SemanticSnapshotRevision): SemanticIndexBuildResult;
}>;

export const createSemanticContributionProviderRegistry =
  (): SemanticContributionProviderRegistry => {
    const providers = new Map<string, SemanticContributionProvider>();

    const listProviders = (): readonly SemanticContributionProvider[] =>
      Object.freeze(
        Array.from(providers.values()).sort((left, right) =>
          compareSemanticText(left.descriptor.id, right.descriptor.id)
        )
      );

    return Object.freeze({
      register(provider) {
        const providerId = provider.descriptor.id;
        if (providers.has(providerId)) {
          throw new Error(
            `Semantic provider "${providerId}" is already registered.`
          );
        }
        providers.set(providerId, provider);
      },
      unregister(providerId) {
        providers.delete(providerId);
      },
      listProviders,
      createIndex(revision) {
        return createWorkspaceSemanticIndex({
          ...revision,
          providers: listProviders(),
        });
      },
    });
  };
