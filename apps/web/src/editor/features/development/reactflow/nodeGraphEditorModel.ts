import type { Edge, Node } from '@xyflow/react';
import {
  estimateStickyNoteSize,
  normalizeBindingEntries,
  normalizeBranches,
  normalizeCases,
  normalizeStatusCodes,
  type GraphNodeData,
  type GraphNodeKind,
  type PortSemantic,
} from './graphNodeShared';
import { getNodeCatalogItem, getNodePortHandle } from './nodeCatalog';
import {
  normalizePersistedEdge,
  normalizePersistedNode,
} from './graphNodePersistence';
import type { PortRole } from './graphPortUtils';

export type ContextMenuState =
  | null
  | { kind: 'canvas'; x: number; y: number; flowX: number; flowY: number }
  | {
      kind: 'node';
      x: number;
      y: number;
      nodeId: string;
      flowX: number;
      flowY: number;
    }
  | {
      kind: 'port';
      x: number;
      y: number;
      nodeId: string;
      handleId: string;
      role: 'source' | 'target';
    };

export type ContextMenuItem = {
  id: string;
  label: string;
  icon?: string;
  onSelect?: () => void;
  children?: ContextMenuItem[];
  tone?: 'default' | 'danger';
};

export type GraphDocument = {
  id: string;
  name: string;
  nodes: Node<GraphNodeData>[];
  edges: Edge[];
};

export type ProjectGraphSnapshot = {
  version: 2;
  activeGraphId: string;
  graphs: GraphDocument[];
};

export type PirLogicGraphNode = {
  id: string;
  type: string;
  data: GraphNodeData;
};

export type PirLogicGraphDocument = {
  id: string;
  name: string;
  nodes: PirLogicGraphNode[];
  edges: Edge[];
};

export type NodeGraphEditorNodeState = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  parentId?: string;
  extent?: 'parent';
  zIndex?: number;
  collapsed?: boolean;
};

export type NodeGraphEditorGraphState = {
  id: string;
  nodes: NodeGraphEditorNodeState[];
};

export type NodeGraphEditorPirState = {
  version: 1;
  activeGraphId?: string;
  graphs: NodeGraphEditorGraphState[];
};

const STORAGE_PREFIX = 'prodivix:nodegraph:native';
const DEFAULT_GRAPH_NAME = 'Main';
export const NODE_GRAPH_EDITOR_STATE_KEY = 'x-nodeGraphEditor';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const createStorageKey = (projectId: string) =>
  `${STORAGE_PREFIX}:${projectId}`;
export const createNodeId = () =>
  `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const createGraphId = () =>
  `graph-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const createSwitchCaseId = () =>
  `case-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
export const createFetchStatusId = () =>
  `status-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
export const createBranchId = () =>
  `branch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
export const createBindingId = () =>
  `bind-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
export const MENU_VIEWPORT_PADDING = 8;
export const MENU_COLUMN_WIDTH = 220;
export const MENU_COLUMN_GAP = 0;

export const GROUP_BOX_THEME_OPTIONS = [
  {
    value: 'minimal',
    labelKey: 'nodeGraph.themes.groupBox.minimal',
    defaultLabel: 'Minimal',
  },
  {
    value: 'mono',
    labelKey: 'nodeGraph.themes.groupBox.mono',
    defaultLabel: 'Mono',
  },
  {
    value: 'slate',
    labelKey: 'nodeGraph.themes.groupBox.slate',
    defaultLabel: 'Slate',
  },
  {
    value: 'cyan',
    labelKey: 'nodeGraph.themes.groupBox.cyan',
    defaultLabel: 'Cyan',
  },
  {
    value: 'amber',
    labelKey: 'nodeGraph.themes.groupBox.amber',
    defaultLabel: 'Amber',
  },
  {
    value: 'rose',
    labelKey: 'nodeGraph.themes.groupBox.rose',
    defaultLabel: 'Rose',
  },
] as const;

export const STICKY_NOTE_THEME_OPTIONS = [
  {
    value: 'minimal',
    labelKey: 'nodeGraph.themes.stickyNote.minimal',
    defaultLabel: 'Minimal',
  },
  {
    value: 'mono',
    labelKey: 'nodeGraph.themes.stickyNote.mono',
    defaultLabel: 'Mono',
  },
  {
    value: 'amber',
    labelKey: 'nodeGraph.themes.stickyNote.amber',
    defaultLabel: 'Amber',
  },
  {
    value: 'lime',
    labelKey: 'nodeGraph.themes.stickyNote.lime',
    defaultLabel: 'Lime',
  },
  {
    value: 'sky',
    labelKey: 'nodeGraph.themes.stickyNote.sky',
    defaultLabel: 'Sky',
  },
  {
    value: 'rose',
    labelKey: 'nodeGraph.themes.stickyNote.rose',
    defaultLabel: 'Rose',
  },
] as const;

export const resolveColorModeFromDocument = (): 'light' | 'dark' => {
  if (typeof document === 'undefined') return 'light';
  const themeAttr = document.documentElement.getAttribute('data-theme');
  if (themeAttr === 'dark') return 'dark';
  if (themeAttr === 'light') return 'light';
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
};

export const clampNumber = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const NON_NEGATIVE_NUMBER_FIELDS = new Set([
  'timeoutMs',
  'waitMs',
  'maxWaitMs',
  'reconnectMs',
  'heartbeatMs',
  'maxSizeMB',
  'mobileMax',
  'tabletMax',
  'debounceMs',
  'ttlMs',
  'maxSize',
  'iterations',
  'boxWidth',
  'boxHeight',
]);

export const sanitizeFieldValue = (field: string, value: string) => {
  if (NON_NEGATIVE_NUMBER_FIELDS.has(field)) {
    const digitsOnly = value.replace(/[^\d]/g, '');
    if (!digitsOnly) return '';
    const parsed = Number.parseInt(digitsOnly, 10);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, 0, 1_000_000)}`;
  }
  if (field === 'offset') {
    const normalized = value.replace(/[^\d-]/g, '');
    if (!normalized || normalized === '-') return '';
    const parsed = Number.parseInt(normalized, 10);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, -100_000, 100_000)}`;
  }
  if (field === 'speed') {
    const normalized = value.replace(/[^\d.]/g, '');
    if (!normalized) return '';
    const parsed = Number.parseFloat(normalized);
    if (!Number.isFinite(parsed)) return '';
    return `${clampNumber(parsed, 0, 100)}`;
  }
  return value;
};

export const getMenuTreeDepth = (items: ContextMenuItem[]): number => {
  if (!items.length) return 0;
  let depth = 1;
  for (const item of items) {
    if (!item.children?.length) continue;
    depth = Math.max(depth, 1 + getMenuTreeDepth(item.children));
  }
  return depth;
};

export type NodeValidationText = {
  playAnimationRequired: string;
  scrollToSelectorRequired: string;
  focusControlSelectorRequired: string;
  validateSchemaOrRulesRequired: string;
  envVarKeyRequired: string;
};

export const resolveNodeValidationMessage = (
  node: Node<GraphNodeData>,
  edgesSnapshot: Edge[],
  validationText: NodeValidationText
): string | undefined => {
  const data = node.data;
  if (data.kind === 'playAnimation') {
    if (!data.targetId?.trim() || !data.timelineName?.trim()) {
      return validationText.playAnimationRequired;
    }
    return undefined;
  }
  if (data.kind === 'scrollTo') {
    if (data.target === 'selector' && !data.selector?.trim()) {
      return validationText.scrollToSelectorRequired;
    }
    return undefined;
  }
  if (data.kind === 'focusControl') {
    if (!data.selector?.trim()) {
      return validationText.focusControlSelectorRequired;
    }
    return undefined;
  }
  if (data.kind === 'validate') {
    const hasRulesInput = edgesSnapshot.some(
      (edge) => edge.target === node.id && edge.targetHandle === 'in.data.rules'
    );
    if (!data.schema?.trim() && !data.rules?.trim() && !hasRulesInput) {
      return validationText.validateSchemaOrRulesRequired;
    }
    return undefined;
  }
  if (data.kind === 'envVar') {
    if (!data.key?.trim()) {
      return validationText.envVarKeyRequired;
    }
    return undefined;
  }
  return undefined;
};

export const resolveGroupBoxSize = (nodeData: GraphNodeData) => ({
  width: clampNumber(
    Number.parseInt(
      `${nodeData.autoBoxWidth ?? nodeData.boxWidth ?? ''}` || '360',
      10
    ) || 360,
    160,
    2200
  ),
  height: clampNumber(
    Number.parseInt(
      `${nodeData.autoBoxHeight ?? nodeData.boxHeight ?? ''}` || '220',
      10
    ) || 220,
    120,
    1800
  ),
});

export const GROUP_BOX_HEADER_HEIGHT = 34;

export const GROUP_BOX_PADDING = {
  top: 16,
  right: 34,
  bottom: 24,
  left: 34,
} as const;

export const resolveNodeSize = (
  node: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  if (node.data.kind === 'groupBox') {
    const fallback = resolveGroupBoxSize(node.data);
    return {
      width: clampNumber(
        Math.round(sizeOverride?.width ?? node.width ?? fallback.width),
        220,
        2200
      ),
      height: clampNumber(
        Math.round(sizeOverride?.height ?? node.height ?? fallback.height),
        140,
        1800
      ),
    };
  }
  if (node.data.kind === 'stickyNote') {
    const noteContent = node.data.description ?? node.data.value ?? '';
    const estimated = estimateStickyNoteSize(noteContent);
    return {
      width: clampNumber(
        Math.round(sizeOverride?.width ?? node.width ?? estimated.width),
        24,
        1200
      ),
      height: clampNumber(
        Math.round(sizeOverride?.height ?? node.height ?? estimated.height),
        30,
        1200
      ),
    };
  }
  return {
    width: clampNumber(Math.round(node.width ?? 220), 120, 2200),
    height: clampNumber(Math.round(node.height ?? 96), 64, 1800),
  };
};

export const resolveNodeBounds = (
  node: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  const size = resolveNodeSize(node, sizeOverride);
  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + size.width,
    bottom: node.position.y + size.height,
    ...size,
  };
};

export const resolveGroupBodyBounds = (
  groupNode: Node<GraphNodeData>,
  sizeOverride?: { width: number; height: number }
) => {
  const groupSize = resolveNodeSize(groupNode, sizeOverride);
  const left = groupNode.position.x + GROUP_BOX_PADDING.left;
  const right = Math.max(
    left + 1,
    groupNode.position.x + groupSize.width - GROUP_BOX_PADDING.right
  );
  const top =
    groupNode.position.y + GROUP_BOX_HEADER_HEIGHT + GROUP_BOX_PADDING.top;
  const bottom = Math.max(
    top + 1,
    groupNode.position.y + groupSize.height - GROUP_BOX_PADDING.bottom
  );
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  };
};

const isNodeCenterInsideGroupBody = (
  node: Node<GraphNodeData>,
  groupNode: Node<GraphNodeData>,
  groupSizeOverride?: { width: number; height: number }
) => {
  if (node.id === groupNode.id) return false;
  const nodeBounds = resolveNodeBounds(node);
  const bodyBounds = resolveGroupBodyBounds(groupNode, groupSizeOverride);
  const centerX = (nodeBounds.left + nodeBounds.right) / 2;
  const centerY = (nodeBounds.top + nodeBounds.bottom) / 2;
  return (
    centerX >= bodyBounds.left &&
    centerX <= bodyBounds.right &&
    centerY >= bodyBounds.top &&
    centerY <= bodyBounds.bottom
  );
};

export const resolveDropTargetGroup = (
  node: Node<GraphNodeData>,
  nodesSnapshot: Node<GraphNodeData>[]
) => {
  if (node.data.kind === 'groupBox') return undefined;
  const candidates = nodesSnapshot
    .filter((item) => item.data.kind === 'groupBox' && item.id !== node.id)
    .filter((groupNode) => isNodeCenterInsideGroupBody(node, groupNode));
  if (!candidates.length) return undefined;
  return candidates.reduce((best, current) => {
    const bestArea =
      resolveGroupBodyBounds(best).width * resolveGroupBodyBounds(best).height;
    const currentArea =
      resolveGroupBodyBounds(current).width *
      resolveGroupBodyBounds(current).height;
    return currentArea < bestArea ? current : best;
  });
};

export const resolveAttachedGroupBoxId = (
  node: Node<GraphNodeData>,
  nodesSnapshot: Node<GraphNodeData>[]
) => {
  if (node.data.kind === 'groupBox') return undefined;
  if (!node.data.groupBoxId) return undefined;
  return nodesSnapshot.some(
    (item) => item.data.kind === 'groupBox' && item.id === node.data.groupBoxId
  )
    ? node.data.groupBoxId
    : undefined;
};

export const getDefaultHandleForNode = (
  node: Node<GraphNodeData>,
  role: PortRole,
  semantic: PortSemantic
): string | null => {
  const switchCases = normalizeCases(node.data.cases);
  const fetchStatusCodes = normalizeStatusCodes(node.data.statusCodes);
  if (role === 'in') {
    if (semantic === 'condition' && node.data.kind === 'switch') {
      if (!switchCases.length) return null;
      return `in.condition.case-${switchCases[0].id}`;
    }
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  if (semantic === 'control') {
    if (node.data.kind === 'if') return 'out.control.true';
    if (node.data.kind === 'tryCatch') return 'out.control.try';
    if (node.data.kind === 'forEach') return 'out.control.body';
    if (node.data.kind === 'parallel' || node.data.kind === 'race') {
      const branches = normalizeBranches(node.data.branches);
      if (branches.length) return `out.control.branch-${branches[0].id}`;
      return 'out.control.done';
    }
    if (node.data.kind === 'switch') {
      if (!switchCases.length) return 'out.control.default';
      return `out.control.case-${switchCases[0].id}`;
    }
    if (node.data.kind === 'fetch') {
      if (fetchStatusCodes.length)
        return `out.control.status-${fetchStatusCodes[0].id}`;
      return 'out.control.error-request';
    }
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  if (semantic === 'data') {
    return getNodePortHandle(node.data.kind, role, semantic);
  }

  return getNodePortHandle(node.data.kind, role, semantic);
};

export const createNode = (
  kind: GraphNodeKind,
  position: { x: number; y: number }
): Node<GraphNodeData> => {
  const catalogItem = getNodeCatalogItem(kind);
  const baseData: GraphNodeData = {
    label: catalogItem.label,
    kind,
    ...catalogItem.defaults,
  };

  if (kind === 'switch') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        cases: [
          { id: createSwitchCaseId(), label: 'case-1' },
          { id: createSwitchCaseId(), label: 'case-2' },
        ],
      },
    };
  }
  if (kind === 'fetch') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        value: '',
        method: 'GET',
        statusCodes: [
          { id: createFetchStatusId(), code: '200' },
          { id: createFetchStatusId(), code: '201' },
        ],
      },
    };
  }
  if (kind === 'parallel' || kind === 'race') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        collapsed: false,
        branches: [
          { id: createBranchId(), label: 'branch-1' },
          { id: createBranchId(), label: 'branch-2' },
        ],
      },
    };
  }
  if (kind === 'subFlowCall') {
    return {
      id: createNodeId(),
      type: 'graphNode',
      position,
      data: {
        ...baseData,
        inputBindings: [{ id: createBindingId(), key: 'payload', value: '' }],
        outputBindings: [{ id: createBindingId(), key: 'result', value: '' }],
      },
    };
  }
  return {
    id: createNodeId(),
    type: 'graphNode',
    position,
    data: baseData,
  };
};

const createInitialNodes = (): Node<GraphNodeData>[] => [
  createNode('start', { x: 100, y: 180 }),
  createNode('switch', { x: 380, y: 120 }),
  createNode('process', { x: 720, y: 120 }),
  createNode('end', { x: 980, y: 250 }),
];

const createInitialEdges = (nodes: Node<GraphNodeData>[]): Edge[] => [
  {
    id: 'e-initial-1',
    source: nodes[0].id,
    sourceHandle: 'out.control.next',
    target: nodes[1].id,
    targetHandle: 'in.control.prev',
    type: 'smoothstep',
  },
  (() => {
    const switchCases = normalizeCases(nodes[1].data.cases);
    return {
      id: 'e-initial-2',
      source: nodes[1].id,
      sourceHandle: switchCases.length
        ? `out.control.case-${switchCases[0].id}`
        : 'out.control.default',
      target: nodes[2].id,
      targetHandle: 'in.control.prev',
      type: 'smoothstep',
    };
  })(),
  {
    id: 'e-initial-3',
    source: nodes[2].id,
    sourceHandle: 'out.control.next',
    target: nodes[3].id,
    targetHandle: 'in.control.prev',
    type: 'smoothstep',
  },
];

export const createStarterGraph = (name: string): GraphDocument => {
  const nodes = createInitialNodes();
  return {
    id: createGraphId(),
    name,
    nodes,
    edges: createInitialEdges(nodes),
  };
};

type NormalizeGraphDocumentsOptions = {
  createFallbackWhenEmpty?: boolean;
  fallbackGraphName?: string;
};

const normalizeGraphId = (value: unknown) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeGraphName = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
};

export const normalizeGraphDocuments = (
  source: unknown,
  options: NormalizeGraphDocumentsOptions = {}
): GraphDocument[] => {
  const {
    createFallbackWhenEmpty = false,
    fallbackGraphName = DEFAULT_GRAPH_NAME,
  } = options;
  const inputGraphs = Array.isArray(source) ? source : [];
  const normalized: GraphDocument[] = [];
  const usedIds = new Set<string>();
  inputGraphs.forEach((entry, index) => {
    let graphId = '';
    let graphName = '';
    let nodes: Node<GraphNodeData>[] = [];
    let edges: Edge[] = [];
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return;
      graphId = trimmed;
      graphName = trimmed;
    } else if (isPlainObject(entry)) {
      graphId = normalizeGraphId(entry.id);
      graphName = normalizeGraphName(
        entry.name,
        graphId || `graph-${index + 1}`
      );
      nodes = Array.isArray(entry.nodes)
        ? entry.nodes
            .map((node, nodeIndex) =>
              isPlainObject(node)
                ? normalizePersistedNode(
                    node as unknown as Node<GraphNodeData>,
                    nodeIndex
                  )
                : null
            )
            .filter((node): node is Node<GraphNodeData> => Boolean(node))
        : [];
      edges = Array.isArray(entry.edges)
        ? entry.edges
            .map((edge) =>
              isPlainObject(edge)
                ? normalizePersistedEdge(edge as unknown as Edge)
                : null
            )
            .filter((edge): edge is Edge => Boolean(edge))
        : [];
    } else {
      return;
    }
    if (!graphId || usedIds.has(graphId)) {
      do {
        graphId = createGraphId();
      } while (usedIds.has(graphId));
    }
    usedIds.add(graphId);
    normalized.push({
      id: graphId,
      name: normalizeGraphName(graphName, graphId),
      nodes,
      edges,
    });
  });
  if (!normalized.length && createFallbackWhenEmpty) {
    return [createStarterGraph(fallbackGraphName)];
  }
  return normalized;
};

export const ensureProjectGraphSnapshot = (
  source: unknown,
  options: NormalizeGraphDocumentsOptions = {}
): ProjectGraphSnapshot => {
  const normalizedGraphs = normalizeGraphDocuments(
    isPlainObject(source) ? source.graphs : undefined,
    {
      ...options,
      createFallbackWhenEmpty: true,
    }
  );
  const rawActiveGraphId = isPlainObject(source)
    ? normalizeGraphId(source.activeGraphId)
    : '';
  const activeGraphId = normalizedGraphs.some(
    (graph) => graph.id === rawActiveGraphId
  )
    ? rawActiveGraphId
    : normalizedGraphs[0].id;
  return {
    version: 2,
    activeGraphId,
    graphs: normalizedGraphs,
  };
};

export const loadProjectSnapshot = (
  projectId: string
): ProjectGraphSnapshot => {
  const fallback = ensureProjectGraphSnapshot(undefined, {
    fallbackGraphName: DEFAULT_GRAPH_NAME,
  });
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(createStorageKey(projectId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    if (isPlainObject(parsed) && Array.isArray(parsed.graphs)) {
      return ensureProjectGraphSnapshot(parsed, {
        fallbackGraphName: DEFAULT_GRAPH_NAME,
      });
    }
    if (
      !isPlainObject(parsed) ||
      !Array.isArray(parsed.nodes) ||
      !Array.isArray(parsed.edges)
    ) {
      return fallback;
    }
    const migratedGraph: GraphDocument = {
      id: createGraphId(),
      name: DEFAULT_GRAPH_NAME,
      nodes: parsed.nodes.map((node, index) =>
        normalizePersistedNode(node, index)
      ),
      edges: parsed.edges.map(normalizePersistedEdge),
    };
    return ensureProjectGraphSnapshot(
      {
        activeGraphId: migratedGraph.id,
        graphs: [migratedGraph],
      },
      {
        fallbackGraphName: DEFAULT_GRAPH_NAME,
      }
    );
  } catch {
    return fallback;
  }
};

const EDITOR_ONLY_NODE_DATA_FIELDS: Array<keyof GraphNodeData> = [
  'collapsed',
  'validationMessage',
  'autoBoxWidth',
  'autoBoxHeight',
  'autoNoteWidth',
  'autoNoteHeight',
];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeNodeGraphEditorNodeState = (
  source: unknown
): NodeGraphEditorNodeState | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeGraphId(source.id);
  if (!id) return null;
  if (!isFiniteNumber(source.x) || !isFiniteNumber(source.y)) return null;
  const normalized: NodeGraphEditorNodeState = {
    id,
    x: source.x,
    y: source.y,
  };
  if (isFiniteNumber(source.width) && source.width > 0) {
    normalized.width = source.width;
  }
  if (isFiniteNumber(source.height) && source.height > 0) {
    normalized.height = source.height;
  }
  if (typeof source.parentId === 'string' && source.parentId.trim()) {
    normalized.parentId = source.parentId.trim();
  }
  if (source.extent === 'parent') {
    normalized.extent = 'parent';
  }
  if (isFiniteNumber(source.zIndex)) {
    normalized.zIndex = source.zIndex;
  }
  if (typeof source.collapsed === 'boolean') {
    normalized.collapsed = source.collapsed;
  }
  return normalized;
};

const normalizeNodeGraphEditorGraphState = (
  source: unknown
): NodeGraphEditorGraphState | null => {
  if (!isPlainObject(source)) return null;
  const id = normalizeGraphId(source.id);
  if (!id) return null;
  const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
  const usedNodeIds = new Set<string>();
  const nodes: NodeGraphEditorNodeState[] = [];
  rawNodes.forEach((node) => {
    const normalizedNode = normalizeNodeGraphEditorNodeState(node);
    if (!normalizedNode) return;
    if (usedNodeIds.has(normalizedNode.id)) return;
    usedNodeIds.add(normalizedNode.id);
    nodes.push(normalizedNode);
  });
  return {
    id,
    nodes,
  };
};

export const normalizeNodeGraphEditorState = (
  source: unknown
): NodeGraphEditorPirState | null => {
  if (!isPlainObject(source)) return null;
  const rawGraphs = Array.isArray(source.graphs) ? source.graphs : [];
  const usedGraphIds = new Set<string>();
  const graphs: NodeGraphEditorGraphState[] = [];
  rawGraphs.forEach((graph) => {
    const normalizedGraph = normalizeNodeGraphEditorGraphState(graph);
    if (!normalizedGraph) return;
    if (usedGraphIds.has(normalizedGraph.id)) return;
    usedGraphIds.add(normalizedGraph.id);
    graphs.push(normalizedGraph);
  });
  const activeGraphId = normalizeGraphId(source.activeGraphId);
  if (!graphs.length && !activeGraphId) return null;
  return {
    version: 1,
    activeGraphId: activeGraphId || undefined,
    graphs,
  };
};

const createFallbackPosition = (index: number) => ({
  x: (index % 4) * 220,
  y: Math.floor(index / 4) * 140,
});

const resolvePositionFromNodeState = (
  node: Node<GraphNodeData>,
  nodeState: NodeGraphEditorNodeState | undefined,
  nodeIndex: number
) => {
  if (nodeState) {
    return {
      x: nodeState.x,
      y: nodeState.y,
    };
  }
  if (isFiniteNumber(node.position?.x) && isFiniteNumber(node.position?.y)) {
    return {
      x: node.position.x,
      y: node.position.y,
    };
  }
  return createFallbackPosition(nodeIndex);
};

export const applyNodeGraphEditorStateToGraphs = (
  graphs: GraphDocument[],
  editorState: NodeGraphEditorPirState | null
): GraphDocument[] => {
  if (!editorState?.graphs.length) return graphs;
  const graphStateById = new Map<string, NodeGraphEditorGraphState>();
  editorState.graphs.forEach((graphState) => {
    graphStateById.set(graphState.id, graphState);
  });
  return graphs.map((graph) => {
    const graphState = graphStateById.get(graph.id);
    if (!graphState) return graph;
    const nodeStateById = new Map<string, NodeGraphEditorNodeState>();
    graphState.nodes.forEach((nodeState) => {
      nodeStateById.set(nodeState.id, nodeState);
    });
    const nextNodes = graph.nodes.map((node, nodeIndex) => {
      const nodeState = nodeStateById.get(node.id);
      const nextData = { ...node.data };
      if (typeof nodeState?.collapsed === 'boolean') {
        nextData.collapsed = nodeState.collapsed;
      }
      return {
        ...node,
        position: resolvePositionFromNodeState(node, nodeState, nodeIndex),
        parentId: nodeState?.parentId ?? node.parentId,
        extent: nodeState?.extent ?? node.extent,
        zIndex: nodeState?.zIndex ?? node.zIndex,
        data: nextData,
      };
    });
    return {
      ...graph,
      nodes: nextNodes,
    };
  });
};

const stripEditorOnlyDataFields = (data: GraphNodeData): GraphNodeData => {
  const nextData: GraphNodeData = { ...data };
  EDITOR_ONLY_NODE_DATA_FIELDS.forEach((field) => {
    delete nextData[field];
  });
  return nextData;
};

export const serializeGraphsForPirLogic = (
  graphs: GraphDocument[]
): PirLogicGraphDocument[] =>
  graphs.map((graph) => ({
    id: graph.id,
    name: graph.name,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      type:
        typeof node.type === 'string' && node.type.trim()
          ? node.type
          : 'graphNode',
      data: stripEditorOnlyDataFields(node.data),
    })),
    edges: graph.edges.map(normalizePersistedEdge),
  }));

const normalizeCoordinate = (value: unknown) =>
  isFiniteNumber(value) ? value : 0;

export const buildNodeGraphEditorState = (
  snapshot: ProjectGraphSnapshot
): NodeGraphEditorPirState => ({
  version: 1,
  activeGraphId: snapshot.activeGraphId,
  graphs: snapshot.graphs.map((graph) => ({
    id: graph.id,
    nodes: graph.nodes.map((node) => {
      const collapsed =
        typeof node.data.collapsed === 'boolean' ? node.data.collapsed : false;
      return {
        id: node.id,
        x: normalizeCoordinate(node.position?.x),
        y: normalizeCoordinate(node.position?.y),
        parentId:
          typeof node.parentId === 'string' && node.parentId.trim()
            ? node.parentId
            : undefined,
        extent: node.extent === 'parent' ? 'parent' : undefined,
        zIndex: isFiniteNumber(node.zIndex) ? node.zIndex : undefined,
        collapsed: collapsed || undefined,
      };
    }),
  })),
});
