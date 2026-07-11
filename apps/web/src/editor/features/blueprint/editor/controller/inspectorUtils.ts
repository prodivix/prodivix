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
