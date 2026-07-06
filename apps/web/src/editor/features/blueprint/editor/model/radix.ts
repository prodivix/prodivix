import type { ComponentNode } from '@prodivix/shared/types/pir';

export type RadixPaletteItemId =
  | 'radix-slot'
  | 'radix-label'
  | 'radix-separator'
  | 'radix-accordion'
  | 'radix-tabs'
  | 'radix-dialog'
  | 'radix-popover'
  | 'radix-tooltip'
  | 'radix-dropdown-menu'
  | 'radix-switch';

type RadixCatalogEntry = {
  itemId: RadixPaletteItemId;
  nodeType: string;
  primitive: string;
  text?: string;
  defaultProps?: Record<string, unknown>;
  defaultStyle?: Record<string, unknown>;
};

const RADIX_CATALOG: RadixCatalogEntry[] = [
  {
    itemId: 'radix-slot',
    nodeType: 'RadixSlot',
    primitive: 'slot',
    text: 'Slot',
  },
  {
    itemId: 'radix-label',
    nodeType: 'RadixLabel',
    primitive: 'label',
    text: 'Label',
  },
  {
    itemId: 'radix-separator',
    nodeType: 'RadixSeparator',
    primitive: 'separator',
    defaultStyle: {
      borderTop: '1px solid var(--border-default)',
      minHeight: '1px',
    },
  },
  {
    itemId: 'radix-accordion',
    nodeType: 'RadixAccordion',
    primitive: 'accordion',
  },
  {
    itemId: 'radix-tabs',
    nodeType: 'RadixTabs',
    primitive: 'tabs',
  },
  {
    itemId: 'radix-dialog',
    nodeType: 'RadixDialog',
    primitive: 'dialog',
  },
  {
    itemId: 'radix-popover',
    nodeType: 'RadixPopover',
    primitive: 'popover',
  },
  {
    itemId: 'radix-tooltip',
    nodeType: 'RadixTooltip',
    primitive: 'tooltip',
  },
  {
    itemId: 'radix-dropdown-menu',
    nodeType: 'RadixDropdownMenu',
    primitive: 'dropdown-menu',
  },
  {
    itemId: 'radix-switch',
    nodeType: 'RadixSwitch',
    primitive: 'switch',
    text: 'Switch',
    defaultProps: {
      role: 'switch',
    },
  },
];

const RADIX_CATALOG_MAP = new Map(
  RADIX_CATALOG.map((entry) => [entry.itemId, entry])
);

export const RADIX_NODE_TYPES = RADIX_CATALOG.map((entry) => entry.nodeType);

export const createRadixNodeFromPaletteItem = (
  itemId: string,
  createId: (type: string) => string,
  variantProps?: Record<string, unknown>
): ComponentNode | null => {
  const entry = RADIX_CATALOG_MAP.get(itemId as RadixPaletteItemId);
  if (!entry) return null;
  return {
    id: createId(entry.nodeType),
    type: entry.nodeType,
    ...(entry.text ? { text: entry.text } : {}),
    props: {
      ...(entry.defaultProps ?? {}),
      dataAttributes: {
        'data-headless-source': 'radix-ui',
        'data-radix-primitive': entry.primitive,
      },
      ...(variantProps ?? {}),
    },
    ...(entry.defaultStyle ? { style: entry.defaultStyle } : {}),
  };
};
