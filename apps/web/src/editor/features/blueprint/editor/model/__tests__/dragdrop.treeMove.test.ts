import { describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  CURRENT_PIR_VERSION,
  type PIRDocument,
} from '@prodivix/shared/types/pir';
import type {
  PaletteQueryService,
  ResolvedBlueprintCompositionRule,
} from '@/plugins/platform';
import { applyTreeSortDragEnd } from '@/editor/features/blueprint/editor/model/dragdrop.treeMove';

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
              maxItems: 1,
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
    throw new Error('Snapshot is not used by tree move validation.');
  },
  getItemById: () => undefined,
  getItemByRuntimeType: () => undefined,
  getCreationRecipe: () => undefined,
  getCompositionRule: (runtimeType) =>
    rules.find((resolved) => resolved.rule.runtimeType === runtimeType),
  subscribe: () => () => undefined,
});

const createDocument = (): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  metadata: { name: 'Composition Tree Move' },
  ui: {
    graph: {
      version: 1,
      rootId: 'document-root',
      nodesById: {
        'document-root': { id: 'document-root', type: 'container' },
        family: { id: 'family', type: 'FixtureRoot' },
        item: { id: 'item', type: 'FixtureItem' },
        sibling: { id: 'sibling', type: 'container' },
        overlay: { id: 'overlay', type: 'FixtureOverlay' },
      },
      childIdsById: {
        'document-root': ['family', 'sibling'],
        family: ['item'],
        item: [],
        sibling: [],
        overlay: [],
      },
      regionsById: {
        'document-root': { overlay: ['overlay'] },
      },
    },
  },
});

const rootDropEvent = {
  active: {
    id: 'item',
    data: { current: { kind: 'tree-sort', nodeId: 'item' } },
    rect: { current: {} },
  },
  over: {
    id: 'tree-root',
    data: { current: { kind: 'tree-root' } },
    rect: { top: 0, height: 40 },
  },
} as unknown as DragEndEvent;

describe('applyTreeSortDragEnd composition guard', () => {
  it('keeps the document unchanged when moving a required child out of its compound root', () => {
    const document = createDocument();
    const onCompositionIssue = vi.fn();

    expect(
      applyTreeSortDragEnd(
        document,
        rootDropEvent,
        { kind: 'tree-sort', nodeId: 'item', parentId: 'family' },
        palette,
        onCompositionIssue
      )
    ).toBe(document);
    expect(onCompositionIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'PIR-2011',
        nodeId: 'item',
      })
    );
  });

  it('reorders Blueprint children without dropping named regions', () => {
    const document = createDocument();
    const event = {
      active: {
        id: 'sibling',
        data: { current: { kind: 'tree-sort', nodeId: 'sibling' } },
        rect: {
          current: {
            translated: { top: 0, height: 10 },
          },
        },
      },
      over: {
        id: 'tree-node:family',
        data: { current: { kind: 'tree-node', nodeId: 'family' } },
        rect: { top: 20, height: 40 },
      },
    } as unknown as DragEndEvent;

    const result = applyTreeSortDragEnd(
      document,
      event,
      { kind: 'tree-sort', nodeId: 'sibling', parentId: 'document-root' },
      palette
    );

    expect(result.ui.graph.childIdsById['document-root']).toEqual([
      'sibling',
      'family',
    ]);
    expect(result.ui.graph.regionsById).toEqual(document.ui.graph.regionsById);
    expect(result.ui.graph.nodesById.overlay).toEqual(
      document.ui.graph.nodesById.overlay
    );
  });
});
