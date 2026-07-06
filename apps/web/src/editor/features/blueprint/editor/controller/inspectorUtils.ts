import type { ComponentNode } from '@prodivix/shared/types/pir';
import type { TextFieldKey } from '@/editor/features/blueprint/editor/model/blueprintText';

export const findNodeById = (
  node: ComponentNode,
  nodeId: string
): ComponentNode | null => {
  if (node.id === nodeId) return node;
  const children = node.children ?? [];
  for (const child of children) {
    const found = findNodeById(child, nodeId);
    if (found) return found;
  }
  return null;
};

export const collectIds = (
  node: ComponentNode,
  ids: Set<string> = new Set()
): Set<string> => {
  ids.add(node.id);
  node.children?.forEach((child) => collectIds(child, ids));
  return ids;
};

export const renameNodeId = (
  node: ComponentNode,
  fromId: string,
  toId: string
): ComponentNode => {
  if (node.id === fromId) {
    return { ...node, id: toId };
  }
  if (!node.children?.length) return node;
  const nextChildren = node.children.map((child) =>
    renameNodeId(child, fromId, toId)
  );
  return { ...node, children: nextChildren };
};

export const updateNodeById = (
  node: ComponentNode,
  targetId: string,
  updater: (node: ComponentNode) => ComponentNode
): { node: ComponentNode; updated: boolean } => {
  if (node.id === targetId) {
    return { node: updater(node), updated: true };
  }
  if (!node.children?.length) return { node, updated: false };
  let updated = false;
  const nextChildren = node.children.map((child) => {
    const result = updateNodeById(child, targetId, updater);
    if (result.updated) updated = true;
    return result.node;
  });
  return updated
    ? { node: { ...node, children: nextChildren }, updated: true }
    : { node, updated: false };
};

export const getTextFieldLabel = (
  key: TextFieldKey,
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  switch (key) {
    case 'title':
      return t('inspector.panels.text.fields.title', {
        defaultValue: 'Title',
      });
    case 'label':
      return t('inspector.panels.text.fields.label', {
        defaultValue: 'Label',
      });
    case 'description':
      return t('inspector.panels.text.fields.description', {
        defaultValue: 'Description',
      });
    case 'text':
    default:
      return t('inspector.panels.text.fields.text', {
        defaultValue: 'Text',
      });
  }
};
