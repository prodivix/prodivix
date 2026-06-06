import {
  ANCHOR_ITEMS,
  BREADCRUMB_ITEMS,
  CHECKLIST_ITEMS,
  COLLAPSE_ITEMS,
  GALLERY_IMAGES,
  GRID_COLUMNS,
  GRID_DATA,
  LIST_ITEMS,
  NAVBAR_ITEMS,
  REGION_OPTIONS,
  SIDEBAR_ITEMS,
  STEPS_ITEMS,
  TAB_ITEMS,
  TABLE_COLUMNS,
  TABLE_DATA,
  TIMELINE_ITEMS,
  TREE_DATA,
  TREE_SELECT_OPTIONS,
} from '@/editor/features/design/blueprint/editor/model/data';
import type { ComponentNode, PIRDocument } from '@/core/types/engine.types';
import { materializePirRoot } from '@/pir/graph';
import { createRadixNodeFromPaletteItem } from '@/editor/features/design/blueprint/editor/model/radix';
import { buildLayoutPatternNode } from '@/editor/features/design/blueprint/layoutPatterns';
import { getComponentItemById } from '@/editor/features/design/blueprint/registry';

const collectTypeCounts = (
  node: ComponentNode,
  counts: Record<string, number>
) => {
  counts[node.type] = (counts[node.type] ?? 0) + 1;
  node.children?.forEach((child) => collectTypeCounts(child, counts));
};

export const createNodeIdFactory = (doc: PIRDocument) => {
  const counts: Record<string, number> = {};
  collectTypeCounts(materializePirRoot(doc), counts);
  return (type: string) => {
    const next = (counts[type] ?? 0) + 1;
    counts[type] = next;
    return `${type}-${next}`;
  };
};

const NON_TEXT_COMPONENT_KEYWORDS = [
  'input',
  'select',
  'picker',
  'switch',
  'checkbox',
  'radio',
  'slider',
  'progress',
  'spinner',
  'skeleton',
  'avatar',
  'image',
  'icon',
  'table',
  'list',
  'grid',
  'tree',
  'chart',
  'modal',
  'dialog',
  'drawer',
  'tooltip',
  'popover',
  'dropdown',
  'menu',
  'pagination',
  'steps',
  'tabs',
  'collapse',
  'timeline',
];

const inferDefaultText = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.toLowerCase();
  if (
    NON_TEXT_COMPONENT_KEYWORDS.some((keyword) => normalized.includes(keyword))
  )
    return undefined;
  return trimmed;
};

const PALETTE_NODE_DEFAULTS: Record<
  string,
  { type: string; props: Record<string, unknown> }
> = {
  breadcrumb: { type: 'PdxBreadcrumb', props: { items: BREADCRUMB_ITEMS } },
  table: {
    type: 'PdxTable',
    props: { data: TABLE_DATA, columns: TABLE_COLUMNS, size: 'Medium' },
  },
  'data-grid': {
    type: 'PdxDataGrid',
    props: { data: GRID_DATA, columns: GRID_COLUMNS },
  },
  list: { type: 'PdxList', props: { items: LIST_ITEMS, size: 'Medium' } },
  'check-list': {
    type: 'PdxCheckList',
    props: { items: CHECKLIST_ITEMS, defaultValue: ['wireframes'] },
  },
  tree: {
    type: 'PdxTree',
    props: { data: TREE_DATA, defaultExpandedKeys: ['root'] },
  },
  'tree-select': {
    type: 'PdxTreeSelect',
    props: { options: TREE_SELECT_OPTIONS, defaultValue: 'option-1' },
  },
  'region-picker': {
    type: 'PdxRegionPicker',
    props: {
      options: REGION_OPTIONS,
      defaultValue: {
        province: 'east',
        city: 'metro',
        district: 'downtown',
      },
    },
  },
  'anchor-navigation': {
    type: 'PdxAnchorNavigation',
    props: { items: ANCHOR_ITEMS, orientation: 'Vertical' },
  },
  tabs: { type: 'PdxTabs', props: { items: TAB_ITEMS } },
  collapse: {
    type: 'PdxCollapse',
    props: { items: COLLAPSE_ITEMS, defaultActiveKeys: ['panel-1'] },
  },
  navbar: {
    type: 'PdxNavbar',
    props: { brand: 'Pdx', items: NAVBAR_ITEMS, size: 'Medium' },
  },
  sidebar: {
    type: 'PdxSidebar',
    props: { title: 'Menu', items: SIDEBAR_ITEMS, width: 160 },
  },
  route: {
    type: 'PdxRoute',
    props: {},
  },
  outlet: {
    type: 'PdxOutlet',
    props: {},
  },
  'image-gallery': {
    type: 'PdxImageGallery',
    props: {
      images: GALLERY_IMAGES,
      columns: 2,
      gap: 'Small',
      size: 'Medium',
    },
  },
  timeline: { type: 'PdxTimeline', props: { items: TIMELINE_ITEMS } },
  steps: { type: 'PdxSteps', props: { items: STEPS_ITEMS, current: 1 } },
  progress: { type: 'PdxProgress', props: { value: 62, size: 'Medium' } },
  statistic: {
    type: 'PdxStatistic',
    props: { title: 'Total', value: 248, trend: 'Up' },
  },
  pagination: { type: 'PdxPagination', props: { page: 2, total: 50 } },
};

export const createNodeFromPaletteItem = (
  itemId: string,
  createId: (type: string) => string,
  variantProps?: Record<string, unknown>,
  selectedSize?: string
): ComponentNode => {
  const toPascalCase = (value: string) =>
    value
      .split(/[-_]/)
      .filter(Boolean)
      .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
      .join('');

  const typeFromPalette = (value: string) => {
    if (value.startsWith('radix-')) {
      return `Radix${toPascalCase(value.slice('radix-'.length))}`;
    }
    return `Pdx${toPascalCase(value)}`;
  };

  const radixNode = createRadixNodeFromPaletteItem(
    itemId,
    createId,
    variantProps
  );
  if (radixNode) {
    return radixNode;
  }

  if (itemId.startsWith('layout-pattern-')) {
    const patternId = itemId.replace('layout-pattern-', '');
    const registryItem = getComponentItemById(itemId);
    const patternNode = buildLayoutPatternNode({
      patternId,
      createId,
      params: {
        ...(registryItem?.defaultProps ?? {}),
        ...(variantProps ?? {}),
      },
    });
    if (patternNode) return patternNode;
  }

  if (itemId === 'text') {
    return {
      id: createId('PdxText'),
      type: 'PdxText',
      text: 'Text',
      props: { size: selectedSize ?? 'Medium' },
    };
  }
  if (itemId === 'heading') {
    const rawLevel = variantProps?.level;
    const resolvedLevel =
      typeof rawLevel === 'number'
        ? rawLevel
        : typeof rawLevel === 'string'
          ? Number(rawLevel)
          : 2;
    const level = Number.isFinite(resolvedLevel) ? resolvedLevel : 2;
    return {
      id: createId('PdxHeading'),
      type: 'PdxHeading',
      text: 'Heading',
      props: {
        ...variantProps,
        level,
        weight: 'Bold',
        size: selectedSize,
      },
    };
  }
  if (itemId === 'paragraph') {
    return {
      id: createId('PdxParagraph'),
      type: 'PdxParagraph',
      text: 'Paragraph',
      props: { size: selectedSize ?? 'Medium' },
    };
  }
  if (itemId === 'button') {
    return {
      id: createId('PdxButton'),
      type: 'PdxButton',
      text: 'Button',
      props: {
        size: selectedSize ?? 'Medium',
        category: 'Primary',
        ...variantProps,
      },
    };
  }
  if (itemId === 'route') {
    return {
      id: createId('PdxRoute'),
      type: 'PdxRoute',
      props: {},
    };
  }
  if (itemId === 'outlet') {
    return {
      id: createId('PdxOutlet'),
      type: 'PdxOutlet',
      props: {},
    };
  }
  if (itemId === 'button-link') {
    return {
      id: createId('PdxButtonLink'),
      type: 'PdxButtonLink',
      text: 'Link',
      props: {
        to: '',
        size: selectedSize ?? 'Medium',
        category: 'Secondary',
        ...variantProps,
      },
    };
  }
  if (itemId === 'link') {
    return {
      id: createId('PdxLink'),
      type: 'PdxLink',
      text: 'Link',
      props: { to: '' },
    };
  }
  if (itemId === 'input') {
    return {
      id: createId('PdxInput'),
      type: 'PdxInput',
      props: { placeholder: 'Input', size: selectedSize ?? 'Medium' },
    };
  }
  if (itemId === 'textarea') {
    return {
      id: createId('PdxTextarea'),
      type: 'PdxTextarea',
      props: {
        placeholder: 'Textarea',
        rows: 3,
        size: selectedSize ?? 'Medium',
      },
    };
  }
  if (itemId === 'div') {
    return {
      id: createId('PdxDiv'),
      type: 'PdxDiv',
    };
  }
  if (itemId === 'flex') {
    return {
      id: createId('PdxDiv'),
      type: 'PdxDiv',
      props: {
        display: 'Flex',
      },
    };
  }
  if (itemId === 'grid') {
    return {
      id: createId('PdxDiv'),
      type: 'PdxDiv',
      props: {
        display: 'Grid',
      },
    };
  }
  if (itemId === 'section') {
    return {
      id: createId('PdxSection'),
      type: 'PdxSection',
      props: {
        size: selectedSize ?? 'Medium',
        padding: 'Medium',
        backgroundColor: 'Light',
      },
    };
  }
  if (itemId === 'card') {
    return {
      id: createId('PdxCard'),
      type: 'PdxCard',
      props: {
        size: selectedSize ?? 'Medium',
        variant: 'Bordered',
        padding: 'Medium',
        ...(variantProps ?? {}),
      },
    };
  }
  if (itemId === 'panel') {
    return {
      id: createId('PdxPanel'),
      type: 'PdxPanel',
      props: {
        size: selectedSize ?? 'Medium',
        variant: 'Default',
        padding: 'Medium',
        title: 'Panel',
        ...(variantProps ?? {}),
      },
    };
  }
  if (itemId === 'icon') {
    return {
      id: createId('PdxIcon'),
      type: 'PdxIcon',
      props: {
        iconRef: {
          provider: 'lucide',
          name: 'Sparkles',
        },
        size: 20,
        ...variantProps,
      },
    };
  }
  if (itemId === 'icon-link') {
    return {
      id: createId('PdxIconLink'),
      type: 'PdxIconLink',
      props: {
        iconRef: {
          provider: 'lucide',
          name: 'Sparkles',
        },
        to: '',
        size: 18,
        ...variantProps,
      },
    };
  }
  if (itemId === 'antd-form-item') {
    return {
      id: createId('AntdFormItem'),
      type: 'AntdFormItem',
      props: {
        label: 'Field',
        name: 'field',
        ...variantProps,
      },
      children: [
        {
          id: createId('AntdInput'),
          type: 'AntdInput',
          props: {
            placeholder: 'Type here',
          },
        },
      ],
    };
  }
  const registryItem = getComponentItemById(itemId);
  if (registryItem?.runtimeType) {
    const inferredText = inferDefaultText(registryItem.name);
    return {
      id: createId(registryItem.runtimeType),
      type: registryItem.runtimeType,
      ...(inferredText ? { text: inferredText } : {}),
      props: {
        ...(registryItem.defaultProps ?? {}),
        ...(selectedSize ? { size: selectedSize } : {}),
        ...(variantProps ?? {}),
      },
    };
  }

  const defaultNode = PALETTE_NODE_DEFAULTS[itemId];
  if (defaultNode) {
    return {
      id: createId(defaultNode.type),
      type: defaultNode.type,
      props: {
        ...defaultNode.props,
        ...(selectedSize ? { size: selectedSize } : {}),
        ...(variantProps ?? {}),
      },
    };
  }

  const inferredType = typeFromPalette(itemId);

  return {
    id: createId(inferredType),
    type: inferredType,
    props: {
      dataAttributes: { 'data-palette-item': itemId },
      ...(selectedSize ? { size: selectedSize } : {}),
      ...(variantProps ?? {}),
    },
  };
};
