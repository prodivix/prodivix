import { describe, expect, it } from 'vitest';
import type { UiGraph } from '@prodivix/shared/types/pir';
import type {
  PaletteQueryService,
  ResolvedBlueprintCompositionRule,
} from '@/plugins/platform';
import { validateBlueprintComposition } from '@/editor/features/blueprint/editor/model/composition';

const owner = Object.freeze({
  pluginId: '@prodivix/plugin-fixture',
  installationId: 'fixture-installation',
  generation: 1,
});

const rules: readonly ResolvedBlueprintCompositionRule[] = [
  {
    owner,
    contributionId: 'fixture.templates',
    rule: {
      id: 'fixture.root-children',
      runtimeType: 'FixtureRoot',
      parent: { mode: 'any' },
      slots: [
        {
          target: 'children',
          sequence: [
            {
              match: 'runtime-types',
              runtimeTypes: ['FixtureItem'],
              minItems: 1,
              maxItems: 2,
            },
          ],
        },
      ],
    },
  },
  {
    owner,
    contributionId: 'fixture.templates',
    rule: {
      id: 'fixture.item-parent',
      runtimeType: 'FixtureItem',
      parent: { mode: 'listed', runtimeTypes: ['FixtureRoot'] },
      slots: [],
    },
  },
];

const palette: PaletteQueryService = Object.freeze({
  getSnapshot: () => {
    throw new Error('Snapshot is not used by composition validation.');
  },
  getItemById: () => undefined,
  getItemByRuntimeType: () => undefined,
  getCreationRecipe: () => undefined,
  getCompositionRule: (runtimeType) =>
    rules.find((resolved) => resolved.rule.runtimeType === runtimeType),
  subscribe: () => () => undefined,
});

const createGraph = (): UiGraph => ({
  version: 1,
  rootId: 'document-root',
  nodesById: {
    'document-root': { id: 'document-root', type: 'container' },
    family: { id: 'family', type: 'FixtureRoot' },
    item: { id: 'item', type: 'FixtureItem' },
  },
  childIdsById: {
    'document-root': ['family'],
    family: ['item'],
    item: [],
  },
});

describe('validateBlueprintComposition', () => {
  it('accepts an affected compound subtree that satisfies plugin rules', () => {
    expect(
      validateBlueprintComposition(createGraph(), palette, ['family', 'item'])
    ).toBeUndefined();
  });

  it('rejects deleting a required compound child', () => {
    const graph = createGraph();
    graph.childIdsById.family = [];

    expect(validateBlueprintComposition(graph, palette, ['family'])).toEqual({
      code: 'PIR-2011',
      nodeId: 'family',
      runtimeType: 'FixtureRoot',
      message:
        'Runtime type FixtureRoot violates its children composition sequence.',
    });
  });

  it('rejects moving a primitive outside its allowed parent', () => {
    const graph = createGraph();
    graph.childIdsById.family = [];
    graph.childIdsById['document-root'] = ['family', 'item'];

    expect(validateBlueprintComposition(graph, palette, ['item'])).toEqual({
      code: 'PIR-2011',
      nodeId: 'item',
      runtimeType: 'FixtureItem',
      message: 'Runtime type FixtureItem cannot be inserted under container.',
    });
  });
});
