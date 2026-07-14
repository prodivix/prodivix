import type { BlueprintInspectorNodeView } from '../projection';

type ExternalCodeConfig = {
  enabled?: boolean;
  language?: 'js' | 'ts' | 'glsl' | 'wgsl';
  resourcePath?: string;
  entry?: string;
};

const EXTERNAL_CODE_PROP_KEY = 'externalCode';

const normalizeNodeType = (type: string) => type.trim().toLowerCase();

export const isContainerNode = (node: BlueprintInspectorNodeView) =>
  normalizeNodeType(node.type) === 'container';

export const isSlotLikeNode = (node: BlueprintInspectorNodeView) => {
  const normalized = normalizeNodeType(node.type);
  return normalized === 'slot' || normalized.endsWith('-slot');
};

export const supportsClassNamePanel = (node: BlueprintInspectorNodeView) =>
  !isContainerNode(node) && !isSlotLikeNode(node);

export const supportsVisualStylePanels = (node: BlueprintInspectorNodeView) =>
  !isContainerNode(node) && !isSlotLikeNode(node);

export const readExternalCodeConfig = (
  node: BlueprintInspectorNodeView
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

export const supportsExternalCodePanel = (node: BlueprintInspectorNodeView) =>
  readExternalCodeConfig(node) !== null || isExternalCodeCapableType(node.type);
