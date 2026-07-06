import type { ComponentPreviewOption } from '@/editor/features/blueprint/editor/model/types';

export const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;
export const BUTTON_CATEGORIES = [
  'Primary',
  'Secondary',
  'Danger',
  'SubtleDanger',
  'Warning',
  'SubtleWarning',
  'Ghost',
] as const;
export const CARD_VARIANTS = [
  'Default',
  'Bordered',
  'Elevated',
  'Flat',
] as const;
export const PANEL_VARIANTS = ['Default', 'Bordered', 'Filled'] as const;
export const NAV_COLUMNS = [2, 3] as const;
export const TAG_VARIANTS = ['Soft', 'Outline', 'Solid'] as const;
export const PROGRESS_STATUSES = [
  'Default',
  'Success',
  'Warning',
  'Danger',
] as const;
export const DRAWER_PLACEMENTS = ['Left', 'Right', 'Top', 'Bottom'] as const;
export const TOOLTIP_PLACEMENTS = ['Top', 'Right', 'Bottom', 'Left'] as const;
export const MESSAGE_TYPES = ['Info', 'Success', 'Warning', 'Danger'] as const;
export const NOTIFICATION_TYPES = [
  'Info',
  'Success',
  'Warning',
  'Danger',
] as const;
export const SKELETON_VARIANTS = ['Text', 'Circle', 'Rect'] as const;
export const STEPS_DIRECTIONS = ['Horizontal', 'Vertical'] as const;

export const SIZE_OPTIONS: ComponentPreviewOption[] = [
  { id: 'S', label: 'S', value: 'Small' },
  { id: 'M', label: 'M', value: 'Medium' },
  { id: 'L', label: 'L', value: 'Large' },
];

export const BUTTON_SIZE_OPTIONS: ComponentPreviewOption[] = [
  { id: 'XS', label: 'XS', value: 'Tiny' },
  { id: 'S', label: 'S', value: 'Small' },
  { id: 'M', label: 'M', value: 'Medium' },
  { id: 'L', label: 'L', value: 'Big' },
];

export const TEXT_SIZE_OPTIONS: ComponentPreviewOption[] = [
  { id: 'T', label: 'T', value: 'Tiny' },
  { id: 'S', label: 'S', value: 'Small' },
  { id: 'M', label: 'M', value: 'Medium' },
  { id: 'L', label: 'L', value: 'Large' },
  { id: 'B', label: 'B', value: 'Big' },
];

export const AVATAR_SIZE_OPTIONS: ComponentPreviewOption[] = [
  { id: 'XS', label: 'XS', value: 'ExtraSmall' },
  { id: 'S', label: 'S', value: 'Small' },
  { id: 'M', label: 'M', value: 'Medium' },
  { id: 'L', label: 'L', value: 'Large' },
  { id: 'XL', label: 'XL', value: 'ExtraLarge' },
];
