import type {
  ComponentNode,
  ComponentNodeData,
  PIRDocument,
  NodeId,
  UiGraph,
} from '@prodivix/shared/types/pir';
import { CURRENT_PIR_VERSION } from '@prodivix/shared/types/pir';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeNodeId = (value: unknown, fallback: string): NodeId => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return candidate || fallback;
};

const normalizeNodeType = (value: unknown): string => {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return candidate || 'container';
};

export const normalizeNodeTree = (
  node: unknown,
  fallbackId = 'root'
): ComponentNode | null => {
  if (!isPlainObject(node)) return null;
  const id = normalizeNodeId(node.id, fallbackId);
  const type = normalizeNodeType(node.type);
  const normalized: Record<string, unknown> = {
    ...node,
    id,
    type,
  };
  if (Array.isArray(node.children)) {
    const children = node.children
      .map((child, index) => normalizeNodeTree(child, `${id}-${index + 1}`))
      .filter((child): child is ComponentNode => Boolean(child));
    if (children.length) {
      normalized.children = children;
    } else {
      delete normalized.children;
    }
  } else {
    delete normalized.children;
  }
  return normalized as unknown as ComponentNode;
};

export const normalizeTreeToUiGraph = (root: ComponentNode): UiGraph => {
  const nodesById: Record<NodeId, ComponentNodeData> = {};
  const childIdsById: Record<NodeId, NodeId[]> = {};
  const usedIds = new Set<NodeId>();

  const reserveId = (rawId: string): NodeId => {
    const base = rawId.trim() || 'node';
    if (!usedIds.has(base)) {
      usedIds.add(base);
      return base;
    }
    let index = 2;
    let nextId = `${base}-${index}`;
    while (usedIds.has(nextId)) {
      index += 1;
      nextId = `${base}-${index}`;
    }
    usedIds.add(nextId);
    return nextId;
  };

  const visit = (node: ComponentNode, fallbackId: string): NodeId => {
    const nodeId = reserveId(node.id || fallbackId);
    const { children, ...data } = cloneJson(node);
    const normalizedData = {
      ...data,
      id: nodeId,
      type: normalizeNodeType(data.type),
    } as ComponentNodeData;
    nodesById[nodeId] = normalizedData;
    const childIds = (children ?? []).map((child, index) =>
      visit(child, `${nodeId}-${index + 1}`)
    );
    childIdsById[nodeId] = childIds;
    return nodeId;
  };

  const rootId = visit(root, 'root');
  return {
    version: 1,
    rootId,
    nodesById,
    childIdsById,
  };
};

const normalizeGraphNodeData = (
  key: string,
  value: unknown
): ComponentNodeData | null => {
  if (!isPlainObject(value)) return null;
  const { children: _children, ...rest } = value;
  return {
    ...rest,
    id: normalizeNodeId(value.id, key),
    type: normalizeNodeType(value.type),
  } as ComponentNodeData;
};

const normalizeStringArray = (value: unknown): NodeId[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: NodeId[] = [];
  value.forEach((item) => {
    if (typeof item !== 'string') return;
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
};

export const normalizeUiGraph = (source: unknown): UiGraph | null => {
  if (!isPlainObject(source)) return null;
  const rawNodesById = isPlainObject(source.nodesById)
    ? source.nodesById
    : null;
  if (!rawNodesById) return null;

  const nodesById: Record<NodeId, ComponentNodeData> = {};
  Object.entries(rawNodesById).forEach(([key, value]) => {
    const normalized = normalizeGraphNodeData(key, value);
    if (!normalized) return;
    nodesById[normalized.id] = normalized;
  });
  if (!Object.keys(nodesById).length) return null;

  const rootId = normalizeNodeId(
    source.rootId,
    nodesById.root ? 'root' : Object.keys(nodesById)[0]
  );
  const childIdsById: Record<NodeId, NodeId[]> = {};
  const rawChildIdsById = isPlainObject(source.childIdsById)
    ? source.childIdsById
    : {};
  Object.keys(nodesById).forEach((nodeId) => {
    childIdsById[nodeId] = normalizeStringArray(rawChildIdsById[nodeId]);
  });
  Object.entries(rawChildIdsById).forEach(([key, value]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey || childIdsById[normalizedKey]) return;
    childIdsById[normalizedKey] = normalizeStringArray(value);
  });

  const rawRegionsById = isPlainObject(source.regionsById)
    ? source.regionsById
    : undefined;
  const regionsById: UiGraph['regionsById'] = rawRegionsById ? {} : undefined;
  if (rawRegionsById && regionsById) {
    Object.entries(rawRegionsById).forEach(([nodeId, regions]) => {
      if (!isPlainObject(regions)) return;
      const normalizedRegions: Record<string, NodeId[]> = {};
      Object.entries(regions).forEach(([regionName, childIds]) => {
        const normalizedRegionName = regionName.trim();
        if (!normalizedRegionName) return;
        normalizedRegions[normalizedRegionName] =
          normalizeStringArray(childIds);
      });
      if (Object.keys(normalizedRegions).length) {
        regionsById[nodeId] = normalizedRegions;
      }
    });
  }
  const order =
    isPlainObject(source.order) && source.order.strategy === 'childIdsById'
      ? ({ strategy: 'childIdsById' } as const)
      : undefined;

  return {
    version: 1,
    rootId,
    nodesById,
    childIdsById,
    ...(regionsById && Object.keys(regionsById).length ? { regionsById } : {}),
    ...(order ? { order } : {}),
  };
};

export const createDefaultUiGraph = (): UiGraph =>
  normalizeTreeToUiGraph({
    id: 'root',
    type: 'container',
  });

export const createDefaultPirDocument = (): PIRDocument => ({
  version: CURRENT_PIR_VERSION,
  ui: {
    graph: createDefaultUiGraph(),
  },
});

export const normalizePirDocumentToCurrentSchema = (
  source: unknown
): PIRDocument => {
  if (!isPlainObject(source)) return createDefaultPirDocument();

  const graph = normalizeUiGraph(
    isPlainObject(source.ui) ? source.ui.graph : undefined
  );
  if (graph) {
    return {
      ...source,
      version: CURRENT_PIR_VERSION,
      ui: { graph },
    } as PIRDocument;
  }

  const root = normalizeNodeTree(
    isPlainObject(source.ui) ? source.ui.root : undefined
  );
  if (!root) return createDefaultPirDocument();
  return {
    ...source,
    version: CURRENT_PIR_VERSION,
    ui: {
      graph: normalizeTreeToUiGraph(root),
    },
  } as PIRDocument;
};
