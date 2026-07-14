import type { BlueprintInspectorNodeView } from '../../projection';

export const isPlainObject = (
  value: unknown
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type SpacingKey = 'margin' | 'padding';
export type LayoutValueKey =
  'width' | 'height' | 'backgroundColor' | 'border' | 'borderRadius';
export type BoxSpacing = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export const LAYOUT_COMPONENT_TYPES = new Set([
  'PdxDiv',
  'PdxSection',
  'PdxCard',
  'PdxPanel',
  'div',
  'section',
]);

export const isLayoutComponent = (node: BlueprintInspectorNodeView) =>
  LAYOUT_COMPONENT_TYPES.has(node.type);

export const getDisplay = (node: BlueprintInspectorNodeView) => {
  const display = node.props?.display;
  return typeof display === 'string' ? display : undefined;
};

export const readString = (value: unknown) =>
  typeof value === 'string' ? value : undefined;
export const readNumber = (value: unknown) =>
  typeof value === 'number' ? value : undefined;
export const readCssValue = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return `${value}px`;
  return undefined;
};

export const readGridColumnCount = (value: unknown) => {
  const template = readString(value);
  if (!template) return undefined;
  const match = template.match(/repeat\((\d+),\s*minmax\(0,\s*1fr\)\)/);
  if (!match) return undefined;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : undefined;
};

export const withProps = (
  node: BlueprintInspectorNodeView,
  patch: Record<string, unknown>
): BlueprintInspectorNodeView => ({
  ...node,
  props: { ...(isPlainObject(node.props) ? node.props : {}), ...patch },
});

export const withStyle = (
  node: BlueprintInspectorNodeView,
  patch: Record<string, unknown>
): BlueprintInspectorNodeView => ({
  ...node,
  style: { ...(isPlainObject(node.style) ? node.style : {}), ...patch },
});

export const updateStyleValue = (
  node: BlueprintInspectorNodeView,
  key: string,
  nextValue: string
): BlueprintInspectorNodeView => {
  const nextStyle = isPlainObject(node.style) ? { ...node.style } : {};
  if (nextValue.trim()) {
    nextStyle[key] = nextValue;
  } else {
    delete nextStyle[key];
  }
  return {
    ...node,
    style: Object.keys(nextStyle).length ? nextStyle : undefined,
  };
};

export const parseBoxSpacing = (value: string): BoxSpacing => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { top: '', right: '', bottom: '', left: '' };
  }
  if (tokens.length === 1) {
    return {
      top: tokens[0],
      right: tokens[0],
      bottom: tokens[0],
      left: tokens[0],
    };
  }
  if (tokens.length === 2) {
    return {
      top: tokens[0],
      right: tokens[1],
      bottom: tokens[0],
      left: tokens[1],
    };
  }
  if (tokens.length === 3) {
    return {
      top: tokens[0],
      right: tokens[1],
      bottom: tokens[2],
      left: tokens[1],
    };
  }
  return {
    top: tokens[0],
    right: tokens[1],
    bottom: tokens[2],
    left: tokens[3],
  };
};

export const toBoxSpacingShorthand = (spacing: BoxSpacing) => {
  const top = spacing.top.trim();
  const right = spacing.right.trim();
  const bottom = spacing.bottom.trim();
  const left = spacing.left.trim();
  const all = [top, right, bottom, left];
  if (all.every((item) => !item)) return '';
  if (all.some((item) => !item)) {
    return all.filter(Boolean).join(' ');
  }
  if (top === right && top === bottom && top === left) return top;
  if (top === bottom && right === left) return `${top} ${right}`;
  if (right === left) return `${top} ${right} ${bottom}`;
  return `${top} ${right} ${bottom} ${left}`;
};

export const getSpacingValue = (
  node: BlueprintInspectorNodeView,
  key: SpacingKey
) => {
  if (node.type === 'PdxDiv') {
    const propValue = readCssValue(node.props?.[key]);
    if (propValue !== undefined) return propValue;
  }
  return readCssValue(node.style?.[key]) ?? '';
};

export const getLayoutValue = (
  node: BlueprintInspectorNodeView,
  key: LayoutValueKey
) => {
  if (node.type === 'PdxDiv') {
    const propValue = readCssValue(node.props?.[key]);
    if (propValue !== undefined) return propValue;
  }
  return readCssValue(node.style?.[key]) ?? '';
};

export const updateLayoutValue = (
  node: BlueprintInspectorNodeView,
  key: LayoutValueKey,
  nextValue: string
): BlueprintInspectorNodeView => {
  const hasValue = nextValue.trim().length > 0;
  if (node.type === 'PdxDiv') {
    const nextProps = isPlainObject(node.props) ? { ...node.props } : {};
    const nextStyle = isPlainObject(node.style) ? { ...node.style } : {};
    if (hasValue) {
      nextProps[key] = nextValue;
    } else {
      delete nextProps[key];
    }
    delete nextStyle[key];
    return {
      ...node,
      props: Object.keys(nextProps).length ? nextProps : undefined,
      style: Object.keys(nextStyle).length ? nextStyle : undefined,
    };
  }
  const nextStyle = isPlainObject(node.style) ? { ...node.style } : {};
  if (hasValue) {
    nextStyle[key] = nextValue;
  } else {
    delete nextStyle[key];
  }
  return {
    ...node,
    style: Object.keys(nextStyle).length ? nextStyle : undefined,
  };
};

export const updateSpacingValue = (
  node: BlueprintInspectorNodeView,
  key: SpacingKey,
  nextValue: string
): BlueprintInspectorNodeView => {
  const hasValue = nextValue.trim().length > 0;
  if (node.type === 'PdxDiv') {
    const nextProps = isPlainObject(node.props) ? { ...node.props } : {};
    const nextStyle = isPlainObject(node.style) ? { ...node.style } : {};
    if (hasValue) {
      nextProps[key] = nextValue;
    } else {
      delete nextProps[key];
    }
    delete nextStyle[key];
    return {
      ...node,
      props: Object.keys(nextProps).length ? nextProps : undefined,
      style: Object.keys(nextStyle).length ? nextStyle : undefined,
    };
  }

  const nextStyle = isPlainObject(node.style) ? { ...node.style } : {};
  if (hasValue) {
    nextStyle[key] = nextValue;
  } else {
    delete nextStyle[key];
  }
  return {
    ...node,
    style: Object.keys(nextStyle).length ? nextStyle : undefined,
  };
};
