import type { ComponentNode } from '@prodivix/shared/types/pir';

const isPlainEmptyObject = (value: unknown) =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.keys(value).length === 0;

export const isEmptyInspectorPropValue = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0) ||
  isPlainEmptyObject(value);

export const deleteNodeProp = (
  node: ComponentNode,
  key: string
): ComponentNode => {
  if (!node.props || !Object.prototype.hasOwnProperty.call(node.props, key)) {
    return node;
  }

  const nextProps = { ...node.props };
  delete nextProps[key];

  return {
    ...node,
    props: Object.keys(nextProps).length ? nextProps : undefined,
  };
};

export const setNodeProp = (
  node: ComponentNode,
  key: string,
  value: unknown
): ComponentNode => {
  if (isEmptyInspectorPropValue(value)) {
    return deleteNodeProp(node, key);
  }

  return {
    ...node,
    props: {
      ...(node.props ?? {}),
      [key]: value,
    },
  };
};
