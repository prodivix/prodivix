import type { ComponentNode } from '@prodivix/shared/types/pir';

type ExternalCodeConfig = {
  enabled?: boolean;
  language?: 'js' | 'ts' | 'glsl' | 'wgsl';
  resourcePath?: string;
  entry?: string;
};

const EXTERNAL_CODE_PROP_KEY = 'externalCode';

const normalizeNodeType = (type: string) => type.trim().toLowerCase();

export const isContainerNode = (node: ComponentNode) =>
  normalizeNodeType(node.type) === 'container';

export const isSlotLikeNode = (node: ComponentNode) => {
  const normalized = normalizeNodeType(node.type);
  return normalized === 'slot' || normalized.endsWith('-slot');
};

export const supportsClassNamePanel = (node: ComponentNode) =>
  !isContainerNode(node) && !isSlotLikeNode(node);

export const supportsVisualStylePanels = (node: ComponentNode) =>
  !isContainerNode(node) && !isSlotLikeNode(node);

export const readExternalCodeConfig = (
  node: ComponentNode
): ExternalCodeConfig | null => {
  const value = node.props?.[EXTERNAL_CODE_PROP_KEY];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as ExternalCodeConfig;
};

const isExternalCodeCapableType = (type: string) => {
  const normalized = normalizeNodeType(type);
  return (
    normalized === 'canvas' ||
    normalized.includes('canvas') ||
    normalized.includes('webgl') ||
    normalized.includes('shader') ||
    normalized.includes('render')
  );
};

export const supportsExternalCodePanel = (node: ComponentNode) =>
  readExternalCodeConfig(node) !== null || isExternalCodeCapableType(node.type);
