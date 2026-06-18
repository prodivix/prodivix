import { describe, expect, it } from 'vitest';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import {
  LAYOUT_PATTERN_DATA_ATTRIBUTE_EXAMPLE,
  LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS,
  createLayoutPatternRootDataAttributes,
  getLayoutPatternDataAttributes,
  getLayoutPatternId,
  getLayoutPatternParams,
  getLayoutPatternParamKey,
  isLayoutPatternRootNode,
  mergeLayoutPatternDataAttributes,
  mergeLayoutPatternParams,
} from '@/editor/features/design/blueprint/layoutPatterns/dataAttributes';

const createNode = (dataAttributes: unknown): ComponentNode => ({
  id: 'node-1',
  type: 'PdxDiv',
  props: {
    dataAttributes: dataAttributes as Record<string, unknown>,
  },
});

describe('layout pattern data attributes', () => {
  it('creates root attributes with frozen protocol keys', () => {
    const attrs = createLayoutPatternRootDataAttributes({
      patternId: 'dashboard-shell',
      role: 'main',
    });

    expect(attrs[LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]).toBe(
      'dashboard-shell'
    );
    expect(attrs[LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.root]).toBe('true');
    expect(attrs[LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.role]).toBe('main');
    expect(attrs[LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.version]).toBe('1');
  });

  it('sanitizes data attributes to string values', () => {
    const node = createNode({
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.root]: true,
      numberValue: 320,
      nestedValue: { ignored: true },
    });

    expect(getLayoutPatternDataAttributes(node)).toEqual({
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.root]: 'true',
      numberValue: '320',
    });
  });

  it('detects pattern root nodes and reads pattern id', () => {
    const rootNode = createNode(LAYOUT_PATTERN_DATA_ATTRIBUTE_EXAMPLE);
    const regularNode = createNode({
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
    });

    expect(isLayoutPatternRootNode(rootNode)).toBe(true);
    expect(getLayoutPatternId(rootNode)).toBe('split');
    expect(isLayoutPatternRootNode(regularNode)).toBe(false);
    expect(getLayoutPatternId(regularNode)).toBe('split');
  });

  it('merges attributes without dropping existing keys', () => {
    const merged = mergeLayoutPatternDataAttributes(
      {
        a: '1',
        [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
      },
      {
        b: '2',
        [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.role]: 'main',
      }
    );

    expect(merged).toMatchObject({
      a: '1',
      b: '2',
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
      [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.role]: 'main',
    });
  });

  it('writes and reads pattern params from data attributes', () => {
    const merged = mergeLayoutPatternParams(
      {
        [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: 'split',
      },
      {
        gap: '24px',
        columns: 3,
      }
    );
    const node = createNode(merged);

    expect(merged[getLayoutPatternParamKey('gap')]).toBe('24px');
    expect(merged[getLayoutPatternParamKey('columns')]).toBe('3');
    expect(getLayoutPatternParams(node)).toEqual({
      gap: '24px',
      columns: '3',
    });
  });
});
