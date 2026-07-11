import { describe, expect, it } from 'vitest';
import type { UiGraph } from '@prodivix/shared/types/pir';
import {
  insertUiGraphFragment,
  instantiateUiGraphSubtreeClone,
  updateUiGraphSubtree,
} from '@/pir/graph';

const createGraph = (): UiGraph => ({
  version: 1,
  rootId: 'root',
  nodesById: {
    root: { id: 'root', type: 'container' },
    panel: { id: 'panel', type: 'FixturePanel', props: { title: 'Before' } },
    body: { id: 'body', type: 'FixtureBody' },
    footer: { id: 'footer', type: 'FixtureFooter' },
    trigger: { id: 'trigger', type: 'FixtureTrigger' },
    content: { id: 'content', type: 'FixtureContent' },
  },
  childIdsById: {
    root: ['panel'],
    panel: ['body', 'footer'],
    body: [],
    footer: [],
    trigger: [],
    content: [],
  },
  regionsById: {
    panel: { trigger: ['trigger'], content: ['content'] },
  },
});

describe('UiGraph Blueprint mutations', () => {
  it('updates Inspector props without dropping named regions or region-only nodes', () => {
    const source = createGraph();

    const result = updateUiGraphSubtree(source, 'panel', (node) => ({
      ...node,
      props: { ...(node.props ?? {}), title: 'After' },
    }));

    expect(result.changed).toBe(true);
    expect(result.graph.nodesById.panel?.props).toEqual({ title: 'After' });
    expect(result.graph.regionsById).toEqual(source.regionsById);
    expect(result.graph.nodesById.trigger).toEqual(source.nodesById.trigger);
    expect(result.graph.nodesById.content).toEqual(source.nodesById.content);
  });

  it('reorders default children without changing named-region ownership', () => {
    const source = createGraph();

    const result = updateUiGraphSubtree(source, 'panel', (node) => ({
      ...node,
      children: [...(node.children ?? [])].reverse(),
    }));

    expect(result.changed).toBe(true);
    expect(result.graph.childIdsById.panel).toEqual(['footer', 'body']);
    expect(result.graph.regionsById?.panel).toEqual({
      trigger: ['trigger'],
      content: ['content'],
    });
    expect(Object.keys(result.graph.nodesById).sort()).toEqual(
      Object.keys(source.nodesById).sort()
    );
  });

  it('copies the complete Blueprint subtree including named-region descendants', () => {
    const source = createGraph();
    let sequence = 0;
    const fragment = instantiateUiGraphSubtreeClone(
      source,
      'panel',
      (type) => `${type}-${++sequence}`
    );

    expect(fragment).not.toBeNull();
    if (!fragment) return;
    const insertion = insertUiGraphFragment(source, fragment, {
      parentId: 'root',
      index: 1,
    });

    expect(insertion.ok).toBe(true);
    if (!insertion.ok) return;
    expect(insertion.graph.childIdsById.root).toEqual([
      'panel',
      fragment.primaryNodeId,
    ]);
    expect(insertion.graph.regionsById?.[fragment.primaryNodeId]).toEqual({
      trigger: [fragment.localToNodeId.trigger],
      content: [fragment.localToNodeId.content],
    });
    expect(
      insertion.graph.nodesById[fragment.localToNodeId.trigger]
    ).toMatchObject({ type: 'FixtureTrigger' });
    expect(
      insertion.graph.nodesById[fragment.localToNodeId.content]
    ).toMatchObject({ type: 'FixtureContent' });
  });
});
