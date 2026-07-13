import type { ComponentNode } from '@prodivix/shared/types/pir';

export type NodeTargetOption = {
  id: string;
  label: string;
};

export const collectNodeTargets = (root: ComponentNode): NodeTargetOption[] => {
  const options: NodeTargetOption[] = [];
  const walk = (node: ComponentNode, depth: number) => {
    options.push({
      id: node.id,
      label: `${'  '.repeat(depth)}${node.id} (${node.type})`,
    });
    (node.children ?? []).forEach((child) => walk(child, depth + 1));
  };
  walk(root, 0);
  return options;
};
