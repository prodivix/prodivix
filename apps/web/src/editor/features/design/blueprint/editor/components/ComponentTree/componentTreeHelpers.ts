import {
  Box,
  LayoutGrid,
  MousePointerClick,
  TextCursorInput,
  Type,
} from 'lucide-react';
import type { ComponentNode } from '@prodivix/shared/types/pir';

export const INDENT_PX = 12;
export const NODE_SELECT_DELAY_MS = 220;
export const CONTEXT_MENU_WIDTH_PX = 168;
export const CONTEXT_MENU_HEIGHT_PX = 132;
export const CONTEXT_MENU_VIEWPORT_GAP_PX = 8;

export const collectExpandedKeys = (
  node: ComponentNode,
  keys: string[] = []
) => {
  if (node.children && node.children.length > 0) {
    keys.push(node.id);
    node.children.forEach((child) => collectExpandedKeys(child, keys));
  }
  return keys;
};

export const collectBranchExpandedKeys = (
  node: ComponentNode,
  keys: string[] = []
) => {
  if (node.children && node.children.length > 0) {
    keys.push(node.id);
    node.children.forEach((child) => collectBranchExpandedKeys(child, keys));
  }
  return keys;
};

export const findAncestorIds = (
  node: ComponentNode,
  targetId: string,
  ancestors: string[] = []
): string[] | null => {
  if (node.id === targetId) return ancestors;
  const children = node.children ?? [];
  for (const child of children) {
    const result = findAncestorIds(child, targetId, [...ancestors, node.id]);
    if (result) return result;
  }
  return null;
};

export const getNodeIcon = (type: string) => {
  const normalized = type.toLowerCase();
  if (normalized.includes('text')) return Type;
  if (normalized.includes('button')) return MousePointerClick;
  if (normalized.includes('input')) return TextCursorInput;
  if (
    normalized.includes('div') ||
    normalized.includes('container') ||
    normalized.includes('section')
  )
    return LayoutGrid;
  return Box;
};

export const countNodes = (node: ComponentNode): number => {
  const children = node.children ?? [];
  return 1 + children.reduce((acc, child) => acc + countNodes(child), 0);
};

export const formatPatternLabel = (patternId: string) =>
  patternId
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('-');

export const isHiddenBySplitCategory = (node: ComponentNode) => {
  const props =
    node.props && typeof node.props === 'object'
      ? (node.props as Record<string, unknown>)
      : null;
  const dataAttributes =
    props?.dataAttributes && typeof props.dataAttributes === 'object'
      ? (props.dataAttributes as Record<string, unknown>)
      : null;
  if (dataAttributes?.['data-layout-pattern'] !== 'split') return false;
  if (dataAttributes?.['data-layout-role'] !== 'content') return false;
  return props?.display === 'None';
};
