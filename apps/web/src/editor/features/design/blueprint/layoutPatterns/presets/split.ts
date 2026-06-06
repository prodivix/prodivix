import type { LayoutPatternDefinition } from '@/editor/features/design/blueprint/layoutPatterns/layoutPattern.types';
import { createPatternRoleNode, createPatternRootNode } from './utils';

export const SPLIT_LAYOUT_PATTERN: LayoutPatternDefinition<{
  category: {
    kind: 'enum';
    label: 'Category';
    defaultValue: string;
    options: { label: string; value: string }[];
  };
  gap: { kind: 'length'; label: 'Gap'; defaultValue: string };
  ratio: {
    kind: 'enum';
    label: 'Split Ratio';
    defaultValue: string;
    options: { label: string; value: string }[];
  };
}> = {
  id: 'split',
  name: 'Split Layout',
  category: 'section',
  description: 'Two-column split layout with ratio presets.',
  schema: {
    category: {
      kind: 'enum',
      label: 'Category',
      defaultValue: '2-columns',
      options: [
        { label: '2 Columns', value: '2-columns' },
        { label: '3 Columns', value: '3-columns' },
      ],
    },
    gap: {
      kind: 'length',
      label: 'Gap',
      defaultValue: '12px',
    },
    ratio: {
      kind: 'enum',
      label: 'Split Ratio',
      defaultValue: '1-1',
      options: [
        { label: '1 : 1', value: '1-1' },
        { label: '3 : 7', value: '3-7' },
        { label: '7 : 3', value: '7-3' },
        { label: '1 : 1 : 1', value: '1-1-1' },
        { label: '2 : 5 : 3', value: '2-5-3' },
        { label: '3 : 5 : 2', value: '3-5-2' },
      ],
    },
  },
  build: ({ createId, patternId, resolvedParams }) => {
    const root = createPatternRootNode({
      id: createId('PdxDiv'),
      patternId,
      props: {
        display: 'Grid',
        gap: resolvedParams.gap,
      },
      children: [
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'left',
          props: {
            display: 'Flex',
            alignItems: 'Center',
            justifyContent: 'Center',
            padding: '16px',
            minHeight: '120px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
          },
        }),
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'right',
          props: {
            display: 'Flex',
            alignItems: 'Center',
            justifyContent: 'Center',
            padding: '16px',
            minHeight: '120px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
          },
        }),
        createPatternRoleNode({
          id: createId('PdxDiv'),
          patternId,
          role: 'content',
          props: {
            display: 'Flex',
            alignItems: 'Center',
            justifyContent: 'Center',
            padding: '16px',
            minHeight: '120px',
            backgroundColor: 'var(--bg-panel)',
            borderRadius: '8px',
          },
        }),
      ],
    });
    return applySplitLayoutPreset(root, resolvedParams);
  },
  update: (root, context) => {
    return applySplitLayoutPreset(root, context.nextParams);
  },
};

const TWO_COLUMN_TEMPLATES: Record<string, string> = {
  '1-1': '1fr 1fr',
  '3-7': '3fr 7fr',
  '7-3': '7fr 3fr',
};

const THREE_COLUMN_TEMPLATES: Record<string, string> = {
  '1-1-1': '1fr 1fr 1fr',
  '2-5-3': '2fr 5fr 3fr',
  '3-5-2': '3fr 5fr 2fr',
};

const applySplitLayoutPreset = (
  root: Parameters<typeof SPLIT_LAYOUT_PATTERN.update>[0],
  params: { category: string; gap: string | number; ratio: string }
) => {
  const isThreeColumns = params.category === '3-columns';
  const templates = isThreeColumns
    ? THREE_COLUMN_TEMPLATES
    : TWO_COLUMN_TEMPLATES;
  const fallback = isThreeColumns ? '1-1-1' : '1-1';
  const gridTemplateColumns =
    templates[params.ratio] ??
    parseRatioToTemplate(params.ratio, isThreeColumns ? 3 : 2) ??
    templates[fallback];
  const nextChildren = (root.children ?? []).map((child) => {
    const role = (
      child.props?.dataAttributes as Record<string, string> | undefined
    )?.['data-layout-role'];
    if (role !== 'content') {
      return child;
    }
    return {
      ...child,
      props: {
        ...(child.props ?? {}),
        display: isThreeColumns ? 'Flex' : 'None',
      },
    };
  });

  return {
    ...root,
    props: {
      ...(root.props ?? {}),
      gap: params.gap,
    },
    style: {
      ...(root.style ?? {}),
      gridTemplateColumns,
    },
    children: nextChildren,
  };
};

const parseRatioToTemplate = (rawRatio: string, expectedParts: number) => {
  const normalized = rawRatio.trim();
  if (!normalized) return null;
  const parts = normalized
    .split(/[\s:|,/-]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (parts.length !== expectedParts) return null;
  return `${parts.map((part) => `${part}fr`).join(' ')}`;
};
