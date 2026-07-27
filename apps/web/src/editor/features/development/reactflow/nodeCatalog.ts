import type {
  GraphNodeData,
  GraphNodeKind,
  PortSemantic,
} from './graphNodeShared';
import { CONTROL_IN, CONTROL_OUT } from './nodeCatalogConstants';
import { NODE_CATALOG } from './nodeCatalogData';

type NodePortProfile = {
  controlIn?: string;
  controlOut?: string;
  dataIn?: string;
  dataOut?: string;
  conditionIn?: string;
  conditionOut?: string;
};

export type NodeCatalogItem = {
  kind: GraphNodeKind;
  label: string;
  icon: string;
  groupId: string;
  groupLabel: string;
  ports: NodePortProfile;
  defaults?: Partial<GraphNodeData>;
};

type NodeMenuEntry = Pick<NodeCatalogItem, 'kind' | 'label' | 'icon'>;

export type NodeMenuGroup = {
  id: string;
  label: string;
  items: NodeMenuEntry[];
};

const nodeCatalogMap = Object.fromEntries(
  NODE_CATALOG.map((item) => [item.kind, item] as const)
) as Partial<Record<GraphNodeKind, NodeCatalogItem>>;

export const getNodeCatalogItem = (kind: GraphNodeKind): NodeCatalogItem => {
  const entry = nodeCatalogMap[kind];
  if (!entry) {
    return {
      kind,
      label: kind[0].toUpperCase() + kind.slice(1),
      icon: '○',
      groupId: 'misc',
      groupLabel: 'Misc',
      ports: { controlIn: CONTROL_IN, controlOut: CONTROL_OUT },
    };
  }
  return entry;
};

export const NODE_MENU_GROUPS: NodeMenuGroup[] = (() => {
  const grouped = new Map<string, NodeMenuGroup>();
  for (const item of NODE_CATALOG) {
    const existing = grouped.get(item.groupId);
    if (existing) {
      existing.items.push({
        kind: item.kind,
        label: item.label,
        icon: item.icon,
      });
      continue;
    }
    grouped.set(item.groupId, {
      id: item.groupId,
      label: item.groupLabel,
      items: [{ kind: item.kind, label: item.label, icon: item.icon }],
    });
  }
  return [...grouped.values()];
})();

export const getNodePortHandle = (
  kind: GraphNodeKind,
  role: 'in' | 'out',
  semantic: PortSemantic
): string | null => {
  const profile = getNodeCatalogItem(kind).ports;
  if (role === 'in') {
    if (semantic === 'control') return profile.controlIn ?? null;
    if (semantic === 'data') return profile.dataIn ?? null;
    return profile.conditionIn ?? null;
  }
  if (semantic === 'control') return profile.controlOut ?? null;
  if (semantic === 'data') return profile.dataOut ?? null;
  return profile.conditionOut ?? null;
};

export const supportsPortSemantic = (
  kind: GraphNodeKind,
  role: 'in' | 'out',
  semantic: PortSemantic
) => Boolean(getNodePortHandle(kind, role, semantic));
