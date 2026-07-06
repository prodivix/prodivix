import { describe, expect, it } from 'vitest';
import {
  buildLayoutPatternNode,
  getLayoutPatternDefinition,
  listLayoutPatterns,
} from '@/editor/features/blueprint/layoutPatterns/registry';
import { isLayoutPatternRootNode } from '@/editor/features/blueprint/layoutPatterns/dataAttributes';

describe('layout pattern registry', () => {
  it('registers built-in presets by default', () => {
    const ids = listLayoutPatterns().map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(['split', 'holy-grail', 'dashboard-shell'])
    );
  });

  it('builds nodes from pattern definitions', () => {
    const createId = (() => {
      let count = 0;
      return (type: string) => `${type}-${++count}`;
    })();

    const node = buildLayoutPatternNode({
      patternId: 'split',
      createId,
      params: { ratio: '3-7', gap: '20px' },
    });

    expect(node).toBeTruthy();
    expect(isLayoutPatternRootNode(node)).toBe(true);
    expect(node?.props?.display).toBe('Grid');
    expect(node?.props?.gap).toBe('20px');
    expect(node?.style?.gridTemplateColumns).toBe('3fr 7fr');
  });

  it('exposes definitions and handles unknown ids', () => {
    expect(getLayoutPatternDefinition('holy-grail')?.id).toBe('holy-grail');
    expect(
      buildLayoutPatternNode({
        patternId: 'missing-pattern',
        createId: (type) => `${type}-1`,
      })
    ).toBeNull();
  });
});
