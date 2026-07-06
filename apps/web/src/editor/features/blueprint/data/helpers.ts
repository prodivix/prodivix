import type { ReactNode } from 'react';
import type {
  ComponentGroup,
  ComponentPreviewItem,
  ComponentPreviewOption,
  ComponentPreviewStatus,
  ComponentPreviewVariant,
} from '@/editor/features/blueprint/editor/model/types';
import { DEFAULT_PREVIEW_SCALE } from './viewport';

const WIDE_PREVIEW_SCALE_BOOST = 1.18;
const WIDE_GROUP_IDS = new Set([
  'navigation',
  'layout',
  'layout-pattern',
  'chart',
]);
const WIDE_COMPONENT_IDS = new Set([
  'date-range-picker',
  'steps',
  'slider',
  'password-strength',
  'search',
  'file-upload',
  'regex-input',
  'image-upload',
  'date-picker',
  'verification-code',
  'rich-text-editor',
  'range',
]);

export const buildVariants = <T extends string | number>(
  values: readonly T[],
  render: (value: T) => ReactNode,
  labelFormatter?: (value: T) => string,
  scale?: number | ((value: T) => number),
  dynamicRender?: (value: T, options: { size?: string }) => ReactNode,
  propsBuilder?: (value: T) => Record<string, unknown>
): ComponentPreviewVariant[] =>
  values.map((value) => ({
    id: String(value),
    label: labelFormatter ? labelFormatter(value) : String(value),
    element: render(value),
    scale: typeof scale === 'function' ? scale(value) : scale,
    ...(dynamicRender && {
      renderElement: (options: { size?: string }) =>
        dynamicRender(value, options),
    }),
    ...(propsBuilder && { props: propsBuilder(value) }),
  }));

export const getDefaultSizeId = (options?: ComponentPreviewOption[]) =>
  options?.find((option) => option.value === 'Medium' || option.id === 'M')
    ?.id ?? options?.[0]?.id;

export const getDefaultStatusIndex = (
  options?: ComponentPreviewStatus[],
  preferred?: string
) => {
  if (!options?.length) return 0;
  if (preferred) {
    const index = options.findIndex(
      (option) => option.value === preferred || option.id === preferred
    );
    if (index >= 0) return index;
  }
  return 0;
};

export const getPreviewScale = (
  baseScale: number | undefined,
  isWide: boolean
) => {
  const resolved = baseScale ?? DEFAULT_PREVIEW_SCALE;
  if (!isWide) return resolved;
  return Math.min(resolved * WIDE_PREVIEW_SCALE_BOOST, 0.95);
};

export const isWideComponent = (
  group: ComponentGroup,
  item: ComponentPreviewItem
) => WIDE_GROUP_IDS.has(group.id) || WIDE_COMPONENT_IDS.has(item.id);
