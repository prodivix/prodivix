import type { ContributionRegistryReader } from '@prodivix/plugin-host';
import type {
  ComponentGroup,
  ComponentPreviewItem,
} from '@/editor/features/blueprint/editor/model/types';
import type {
  PaletteQueryService,
  PaletteRegistrySnapshot,
  PaletteItemCreationRecipe,
  ResolvedBlueprintCompositionRule,
  WebContributionPointMap,
} from '@/plugins/platform/types';

const createSnapshot = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): PaletteRegistrySnapshot => {
  const groups = reader
    .list('paletteContribution')
    .flatMap((record) => record.value.groups);
  const itemsById = new Map<string, ComponentPreviewItem>();
  const itemsByRuntimeType = new Map<string, ComponentPreviewItem>();
  const creationRecipesByItemId = new Map<string, PaletteItemCreationRecipe>();
  const templateBindings = new Map(
    reader.list('blueprintTemplate').flatMap((record) =>
      record.value.descriptor.templates.map(
        (template) =>
          [
            JSON.stringify([
              template.palette.contributionId,
              template.palette.itemId,
            ]),
            Object.freeze({
              owner: record.owner,
              contributionId: record.identity.contributionId,
              template,
            }),
          ] as const
      )
    )
  );
  const compositionRulesByRuntimeType = new Map<
    string,
    ResolvedBlueprintCompositionRule
  >();
  reader.list('blueprintTemplate').forEach((record) => {
    (record.value.descriptor.compositionRules ?? []).forEach((rule) => {
      compositionRulesByRuntimeType.set(
        rule.runtimeType,
        Object.freeze({
          owner: record.owner,
          contributionId: record.identity.contributionId,
          rule,
        })
      );
    });
  });
  reader.list('paletteContribution').forEach((record) => {
    record.value.groups.forEach((group) => {
      group.items.forEach((item) => {
        itemsById.set(item.id, item);
        if (item.runtimeType) itemsByRuntimeType.set(item.runtimeType, item);
        const base = {
          owner: record.owner,
          paletteContributionId: record.identity.contributionId,
          itemId: item.id,
        };
        if (record.value.creationMode === 'native') {
          creationRecipesByItemId.set(
            item.id,
            Object.freeze({ ...base, kind: 'native' })
          );
          return;
        }
        const template = templateBindings.get(
          JSON.stringify([record.identity.contributionId, item.id])
        );
        if (template) {
          creationRecipesByItemId.set(
            item.id,
            Object.freeze({
              ...base,
              kind: 'template',
              templateContributionId: template.contributionId,
              template: template.template,
            })
          );
          return;
        }
        if (item.runtimeType) {
          creationRecipesByItemId.set(
            item.id,
            Object.freeze({
              ...base,
              kind: 'direct',
              runtimeType: item.runtimeType,
            })
          );
        }
      });
    });
  });
  return Object.freeze({
    revision: reader.getRevision(),
    groups: Object.freeze([...groups]) as readonly ComponentGroup[],
    itemsById,
    itemsByRuntimeType,
    creationRecipesByItemId,
    compositionRulesByRuntimeType,
  });
};

export const createPaletteQueryService = (
  reader: ContributionRegistryReader<WebContributionPointMap>
): PaletteQueryService => {
  let cachedSnapshot: PaletteRegistrySnapshot | undefined;

  const getSnapshot = () => {
    const revision = reader.getRevision();
    if (cachedSnapshot?.revision === revision) return cachedSnapshot;
    cachedSnapshot = createSnapshot(reader);
    return cachedSnapshot;
  };

  return Object.freeze({
    getSnapshot,
    getItemById: (itemId) => getSnapshot().itemsById.get(itemId),
    getItemByRuntimeType: (runtimeType) =>
      getSnapshot().itemsByRuntimeType.get(runtimeType),
    getCreationRecipe: (itemId) =>
      getSnapshot().creationRecipesByItemId.get(itemId),
    getCompositionRule: (runtimeType) =>
      getSnapshot().compositionRulesByRuntimeType.get(runtimeType),
    subscribe: (listener) => {
      const subscription = reader.subscribe(() => {
        cachedSnapshot = undefined;
        listener();
      });
      return () => subscription.dispose();
    },
  });
};
