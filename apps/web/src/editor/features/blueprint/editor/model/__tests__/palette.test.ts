import { describe, expect, it } from 'vitest';
import type { ComponentPreviewItem } from '@/editor/features/blueprint/editor/model/types';
import { createNodeFromPaletteItem } from '@/editor/features/blueprint/editor/model/palette';
import type {
  PaletteQueryService,
  PaletteRegistrySnapshot,
} from '@/plugins/platform';

const createPaletteQuery = (
  item: ComponentPreviewItem
): PaletteQueryService => {
  const snapshot: PaletteRegistrySnapshot = Object.freeze({
    revision: 7,
    groups: Object.freeze([
      Object.freeze({
        id: 'plugin-group',
        title: 'Plugin Group',
        source: 'external' as const,
        items: [item],
      }),
    ]),
    itemsById: new Map([[item.id, item]]),
    itemsByRuntimeType: new Map(
      item.runtimeType ? [[item.runtimeType, item]] : []
    ),
    creationRecipesByItemId: new Map(),
    compositionRulesByRuntimeType: new Map(),
  });
  return Object.freeze({
    getSnapshot: () => snapshot,
    getItemById: (itemId: string) => snapshot.itemsById.get(itemId),
    getItemByRuntimeType: (runtimeType: string) =>
      snapshot.itemsByRuntimeType.get(runtimeType),
    getCreationRecipe: (itemId: string) =>
      snapshot.creationRecipesByItemId.get(itemId),
    getCompositionRule: (runtimeType: string) =>
      snapshot.compositionRulesByRuntimeType.get(runtimeType),
    subscribe: () => () => undefined,
  });
};

describe('createNodeFromPaletteItem', () => {
  it('uses the injected workspace Palette query for runtime type and defaults', () => {
    const palette = createPaletteQuery({
      id: 'official-widget',
      name: 'Official Widget',
      runtimeType: 'OfficialWidget',
      preview: null,
      defaultProps: { tone: 'neutral', count: 2 },
    });

    const node = createNodeFromPaletteItem({
      itemId: 'official-widget',
      createId: (type) => `${type}-1`,
      palette,
      selectedSize: 'Large',
      variantProps: { tone: 'accent' },
    });

    expect(node).toEqual({
      id: 'OfficialWidget-1',
      type: 'OfficialWidget',
      text: 'Official Widget',
      props: { tone: 'accent', count: 2, size: 'Large' },
    });
  });
});
