import type { ComponentNode } from '@/core/types/engine.types';

export type TriggerConflictPolicy = 'none' | 'warn';

export type LinkCapability = {
  kind: 'link';
  destinationProp: string;
  targetProp?: string;
  relProp?: string;
  titleProp?: string;
  triggerPolicy?: {
    onClickWithDestination?: TriggerConflictPolicy;
  };
};

export type NodeCapability = {
  key: string;
  match: (node: ComponentNode) => boolean;
  link?: LinkCapability;
};

const capabilityRegistry: NodeCapability[] = [
  {
    key: 'prodivix-router-link',
    match: (node) =>
      node.type === 'PdxLink' ||
      node.type === 'PdxButtonLink' ||
      node.type === 'PdxIconLink',
    link: {
      kind: 'link',
      destinationProp: 'to',
      targetProp: 'target',
      relProp: 'rel',
      titleProp: 'title',
      triggerPolicy: {
        onClickWithDestination: 'warn',
      },
    },
  },
  {
    key: 'native-anchor',
    match: (node) => node.type === 'a',
    link: {
      kind: 'link',
      destinationProp: 'href',
      targetProp: 'target',
      relProp: 'rel',
      titleProp: 'title',
      triggerPolicy: {
        onClickWithDestination: 'warn',
      },
    },
  },
];

export const registerNodeCapability = (capability: NodeCapability) => {
  const index = capabilityRegistry.findIndex(
    (item) => item.key === capability.key
  );
  if (index >= 0) {
    capabilityRegistry[index] = capability;
    return;
  }
  capabilityRegistry.push(capability);
};

/**
 * 解析节点命中的所有能力。
 *
 * 调用链路：
 * - `PIRRenderer` 点击代理阶段会用它判断 link 能力（是否阻止默认导航）
 * - `BlueprintEditorInspector` 用它决定是否展示链接相关字段
 */
export const resolveNodeCapabilities = (node: ComponentNode | null) => {
  if (!node) return [];
  return capabilityRegistry.filter((capability) => capability.match(node));
};

export const resolveLinkCapability = (node: ComponentNode | null) =>
  resolveNodeCapabilities(node).find((capability) => capability.link)?.link ??
  null;
