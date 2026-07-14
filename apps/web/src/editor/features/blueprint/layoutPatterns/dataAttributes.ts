import type { BlueprintInspectorNodeView } from '@/editor/features/blueprint/editor/inspector/projection';
import type { LayoutPatternRole } from './layoutPattern.types';

export const LAYOUT_PATTERN_PROTOCOL_VERSION = '1';

export const LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS = {
  pattern: 'data-layout-pattern',
  root: 'data-layout-pattern-root',
  role: 'data-layout-role',
  version: 'data-layout-version',
} as const;
const LAYOUT_PATTERN_PARAM_PREFIX = 'data-layout-param-';

export const LAYOUT_PATTERN_DATA_ATTRIBUTE_VALUES = {
  root: 'true',
} as const;

export type LayoutPatternDataAttributeKey =
  (typeof LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS)[keyof typeof LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS];

export type LayoutPatternDataAttributes = Record<string, string> &
  Partial<Record<LayoutPatternDataAttributeKey, string>>;

const sanitizeDataAttributes = (
  dataAttributes: unknown
): LayoutPatternDataAttributes => {
  if (!dataAttributes || typeof dataAttributes !== 'object') {
    return {};
  }

  return Object.entries(dataAttributes).reduce<LayoutPatternDataAttributes>(
    (accumulator, [key, value]) => {
      if (typeof value === 'string') {
        accumulator[key] = value;
        return accumulator;
      }
      if (typeof value === 'number' || typeof value === 'boolean') {
        accumulator[key] = String(value);
        return accumulator;
      }
      return accumulator;
    },
    {}
  );
};

export const mergeLayoutPatternDataAttributes = (
  existing: unknown,
  patch: LayoutPatternDataAttributes
) => ({
  ...sanitizeDataAttributes(existing),
  ...patch,
});

export const createLayoutPatternRootDataAttributes = ({
  patternId,
  role = 'root',
  version = LAYOUT_PATTERN_PROTOCOL_VERSION,
}: {
  patternId: string;
  role?: LayoutPatternRole;
  version?: string;
}): LayoutPatternDataAttributes => ({
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: patternId,
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.root]:
    LAYOUT_PATTERN_DATA_ATTRIBUTE_VALUES.root,
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.role]: role,
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.version]: version,
});

export const createLayoutPatternRoleDataAttributes = ({
  patternId,
  role,
  version = LAYOUT_PATTERN_PROTOCOL_VERSION,
}: {
  patternId: string;
  role: LayoutPatternRole;
  version?: string;
}): LayoutPatternDataAttributes => ({
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern]: patternId,
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.role]: role,
  [LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.version]: version,
});

export const getLayoutPatternDataAttributes = (
  node: BlueprintInspectorNodeView | null | undefined
) =>
  sanitizeDataAttributes(
    node && typeof node.props === 'object' && node.props
      ? node.props.dataAttributes
      : undefined
  );

export const getLayoutPatternId = (
  node: BlueprintInspectorNodeView | null | undefined
) =>
  getLayoutPatternDataAttributes(node)[
    LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.pattern
  ];

export const isLayoutPatternRootNode = (
  node: BlueprintInspectorNodeView | null | undefined
) =>
  getLayoutPatternDataAttributes(node)[
    LAYOUT_PATTERN_DATA_ATTRIBUTE_KEYS.root
  ] === LAYOUT_PATTERN_DATA_ATTRIBUTE_VALUES.root;

export const LAYOUT_PATTERN_DATA_ATTRIBUTE_EXAMPLE: LayoutPatternDataAttributes =
  createLayoutPatternRootDataAttributes({
    patternId: 'split',
  });

export const getLayoutPatternParamKey = (paramKey: string) =>
  `${LAYOUT_PATTERN_PARAM_PREFIX}${paramKey}`;

export const getLayoutPatternParams = (
  node: BlueprintInspectorNodeView | null | undefined
): Record<string, string> => {
  const dataAttributes = getLayoutPatternDataAttributes(node);
  return Object.entries(dataAttributes).reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      if (!key.startsWith(LAYOUT_PATTERN_PARAM_PREFIX)) return accumulator;
      const paramKey = key.slice(LAYOUT_PATTERN_PARAM_PREFIX.length);
      if (!paramKey) return accumulator;
      accumulator[paramKey] = value;
      return accumulator;
    },
    {}
  );
};

export const mergeLayoutPatternParams = (
  dataAttributes: unknown,
  params: Record<string, unknown>
) =>
  mergeLayoutPatternDataAttributes(
    dataAttributes,
    Object.entries(params).reduce<LayoutPatternDataAttributes>(
      (accumulator, [key, value]) => {
        if (value === undefined || value === null) return accumulator;
        accumulator[getLayoutPatternParamKey(key)] = String(value);
        return accumulator;
      },
      {}
    )
  );
