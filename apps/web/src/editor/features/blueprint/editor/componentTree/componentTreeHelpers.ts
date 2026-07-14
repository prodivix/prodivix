import {
  Box,
  Component,
  IterationCcw,
  LayoutGrid,
  MousePointerClick,
  Plug,
  TextCursorInput,
  Type,
} from 'lucide-react';
import type { PIRNode } from '@prodivix/pir';
import type { BlueprintTreeProjectionNode } from '@/editor/features/blueprint/editor/model/tree';
import {
  getBlueprintNodeTypeLabel,
  readElementLiteralProp,
} from '@/editor/features/blueprint/editor/model/tree';

export const INDENT_PX = 12;
export const NODE_SELECT_DELAY_MS = 220;
export const CONTEXT_MENU_WIDTH_PX = 168;
export const CONTEXT_MENU_HEIGHT_PX = 132;
export const CONTEXT_MENU_VIEWPORT_GAP_PX = 8;

export const collectExpandedKeys = (
  item: BlueprintTreeProjectionNode,
  keys: string[] = []
) => {
  if (item.children.length > 0) {
    keys.push(item.location.nodeId);
    item.children.forEach((child) => collectExpandedKeys(child, keys));
  }
  return keys;
};

export const collectBranchExpandedKeys = (
  item: BlueprintTreeProjectionNode,
  keys: string[] = []
) => collectExpandedKeys(item, keys);

export const findAncestorIds = (
  item: BlueprintTreeProjectionNode,
  targetId: string,
  ancestors: string[] = []
): string[] | null => {
  if (item.location.nodeId === targetId) return ancestors;
  for (const child of item.children) {
    const result = findAncestorIds(child, targetId, [
      ...ancestors,
      item.location.nodeId,
    ]);
    if (result) return result;
  }
  return null;
};

export const getNodeIcon = (node: PIRNode) => {
  if (node.kind === 'component-instance') return Component;
  if (node.kind === 'component-slot-outlet') return Plug;
  if (node.kind === 'collection') return IterationCcw;
  const normalized = node.type.toLowerCase();
  if (normalized.includes('text')) return Type;
  if (normalized.includes('button')) return MousePointerClick;
  if (normalized.includes('input')) return TextCursorInput;
  if (
    normalized.includes('div') ||
    normalized.includes('container') ||
    normalized.includes('section')
  ) {
    return LayoutGrid;
  }
  return Box;
};

export const countNodes = (item: BlueprintTreeProjectionNode): number =>
  1 + item.children.reduce((total, child) => total + countNodes(child), 0);

export const formatPatternLabel = (patternId: string) =>
  patternId
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('-');

const readDataAttributes = (node: PIRNode): Record<string, unknown> => {
  const value = readElementLiteralProp(node, 'dataAttributes');
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

export const getLayoutPatternId = (node: PIRNode): string | undefined => {
  const value = readDataAttributes(node)['data-layout-pattern'];
  return typeof value === 'string' ? value : undefined;
};

export const isLayoutPatternRootNode = (node: PIRNode): boolean =>
  readDataAttributes(node)['data-layout-pattern-root'] === 'true';

export const isHiddenBySplitCategory = (node: PIRNode): boolean => {
  const attributes = readDataAttributes(node);
  if (attributes['data-layout-pattern'] !== 'split') return false;
  if (attributes['data-layout-role'] !== 'content') return false;
  return readElementLiteralProp(node, 'display') === 'None';
};

export const getNodeTypeLabel = (node: PIRNode): string =>
  getBlueprintNodeTypeLabel(node);
