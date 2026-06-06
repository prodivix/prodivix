import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import { useEditorStore } from '@/editor/store/useEditorStore';
import type { GraphNodeData, GraphNodeKind } from './GraphNode';
import { NODE_MENU_GROUPS } from './nodeCatalog';
import type { ConnectionValidationReason } from './graphConnectionValidation';

import {
  applyNodeGraphEditorStateToGraphs,
  buildNodeGraphEditorState,
  createNode,
  createStorageKey,
  ensureProjectGraphSnapshot,
  loadProjectSnapshot,
  NODE_GRAPH_EDITOR_STATE_KEY,
  normalizeNodeGraphEditorState,
  normalizeGraphDocuments,
  resolveNodeSize,
  serializeGraphsForPirLogic,
  type ContextMenuState,
  type GraphDocument,
  type NodeValidationText,
  type NodeGraphEditorPirState,
  type ProjectGraphSnapshot,
} from './nodeGraphEditorModel';
import { nodeTypes } from './nodeGraphNodeTypes';

import {
  buildContextMenuItems,
  buildMenuColumns,
  resolveMenuLayout,
  resolvePortMenuGroups,
} from './nodeGraphMenuModel';
import { applyNodeChangesWithGrouping } from './nodeGraphNodeChanges';
import { NodeGraphContextMenu } from './NodeGraphContextMenu';
import { NodeGraphGraphManager } from './NodeGraphGraphManager';
import { useNodeGraphColorMode } from './useNodeGraphColorMode';
import { useNodeGraphGraphActions } from './nodeGraphGraphActions';
import { useNodeGraphGroupLayout } from './nodeGraphGroupLayout';
import { useNodeGraphNodeActions } from './nodeGraphNodeActions';
import { useNodeGraphConnectionActions } from './nodeGraphConnectionActions';
import { useNodeGraphRenderStore } from './nodeGraphRenderStore';

const resolveActiveGraphFromSnapshot = (snapshot: ProjectGraphSnapshot) =>
  snapshot.graphs.find((graph) => graph.id === snapshot.activeGraphId) ??
  snapshot.graphs[0];

const serializeProjectSnapshot = (snapshot: ProjectGraphSnapshot) =>
  JSON.stringify(snapshot);
const debugNodeGraph = (label: string, payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  console.log(`[node-graph-debug] ${label}`, payload);
};
const serializeSnapshotForPir = (snapshot: ProjectGraphSnapshot) =>
  JSON.stringify({
    graphs: serializeGraphsForPirLogic(snapshot.graphs),
    editorState: buildNodeGraphEditorState(snapshot),
  });

const serializeNodes = (nodes: Node<GraphNodeData>[]) => JSON.stringify(nodes);
const serializeEdges = (edges: Edge[]) => JSON.stringify(edges);
const toStableGraphNode = (node: Node<GraphNodeData>): Node<GraphNodeData> => {
  const nodeSize = resolveNodeSize(node);
  const isAnnotationNode =
    node.data.kind === 'groupBox' || node.data.kind === 'stickyNote';
  const isMinimalStickyNote =
    node.data.kind === 'stickyNote' &&
    (node.data.color ?? 'minimal') === 'minimal';
  const className = [
    node.className,
    node.data.kind === 'stickyNote' ? 'nodegraph-node-sticky-note' : '',
    isMinimalStickyNote ? 'nodegraph-node-sticky-note-minimal' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const stableNode: Node<GraphNodeData> = {
    id: node.id,
    type:
      typeof node.type === 'string' && node.type.trim()
        ? node.type
        : 'graphNode',
    position: {
      x: node.position?.x ?? 0,
      y: node.position?.y ?? 0,
    },
    data: { ...node.data },
    initialWidth: nodeSize.width,
    initialHeight: nodeSize.height,
    className: className || undefined,
    style: isAnnotationNode
      ? {
          background: 'transparent',
          boxShadow: 'none',
          border: 'none',
          borderRadius: 0,
        }
      : node.style,
    zIndex: node.data.kind === 'groupBox' ? -10 : 10,
  };
  if (typeof node.parentId === 'string' && node.parentId.trim()) {
    stableNode.parentId = node.parentId;
  }
  if (node.extent === 'parent') {
    stableNode.extent = 'parent';
  }
  if (typeof node.zIndex === 'number' && Number.isFinite(node.zIndex)) {
    stableNode.zIndex = node.zIndex;
  }
  return stableNode;
};

const readNodeGraphEditorStateFromLogic = (
  logic: unknown
): NodeGraphEditorPirState | null => {
  if (!logic || typeof logic !== 'object' || Array.isArray(logic)) return null;
  return normalizeNodeGraphEditorState(
    (logic as Record<string, unknown>)[NODE_GRAPH_EDITOR_STATE_KEY]
  );
};

const serializeNodeGraphEditorState = (state: NodeGraphEditorPirState | null) =>
  JSON.stringify(state);

export const NodeGraphEditorContent = () => {
  const { projectId } = useParams();
  const { t } = useTranslation('editor');
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const updatePirDoc = useEditorStore((state) => state.updatePirDoc);
  const resolvedProjectId = projectId?.trim() || 'global';
  const persistedSnapshot = useMemo(
    () => loadProjectSnapshot(resolvedProjectId),
    [resolvedProjectId]
  );
  const pirGraphs = useMemo(
    () => normalizeGraphDocuments(pirDoc.logic?.graphs),
    [pirDoc.logic?.graphs]
  );
  const pirEditorState = useMemo(
    () => readNodeGraphEditorStateFromLogic(pirDoc.logic),
    [pirDoc.logic]
  );
  const pirSnapshot = useMemo(() => {
    if (!pirGraphs.length) return null;
    return ensureProjectGraphSnapshot({
      activeGraphId:
        pirEditorState?.activeGraphId || persistedSnapshot.activeGraphId,
      graphs: applyNodeGraphEditorStateToGraphs(pirGraphs, pirEditorState),
    });
  }, [pirEditorState, pirGraphs, persistedSnapshot.activeGraphId]);
  const initialSnapshot = useMemo(() => {
    return pirSnapshot ?? persistedSnapshot;
  }, [pirSnapshot, persistedSnapshot]);
  const initialActiveGraph = resolveActiveGraphFromSnapshot(initialSnapshot);
  const [graphDocs, setGraphDocs] = useState<GraphDocument[]>(
    initialSnapshot.graphs
  );
  const [activeGraphId, setActiveGraphId] = useState<string>(
    initialSnapshot.activeGraphId
  );
  const [nodes, setNodes] = useNodesState(
    initialActiveGraph.nodes.map(toStableGraphNode)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initialActiveGraph.edges
  );
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [menuPath, setMenuPath] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const colorMode = useNodeGraphColorMode();
  const reactFlow = useReactFlow<Node<GraphNodeData>, Edge>();
  const resolveCatalogNodeLabel = useCallback(
    (kind: GraphNodeKind, fallbackLabel: string) =>
      t(`nodeGraph.catalog.nodes.${kind}`, {
        defaultValue: fallbackLabel,
      }),
    [t]
  );
  const resolveCatalogGroupLabel = useCallback(
    (groupId: string, fallbackLabel: string) =>
      t(`nodeGraph.catalog.groups.${groupId}`, {
        defaultValue: fallbackLabel,
      }),
    [t]
  );
  const localizedNodeMenuGroups = useMemo(
    () =>
      NODE_MENU_GROUPS.map((group) => ({
        ...group,
        label: resolveCatalogGroupLabel(group.id, group.label),
        items: group.items.map((item) => ({
          ...item,
          label: resolveCatalogNodeLabel(item.kind, item.label),
        })),
      })),
    [resolveCatalogGroupLabel, resolveCatalogNodeLabel]
  );
  const connectionHintTextByReason = useMemo<
    Record<ConnectionValidationReason, string>
  >(
    () => ({
      'missing-endpoint': t('nodeGraph.connection.missingEndpoint', {
        defaultValue: 'Invalid connection: missing source or target.',
      }),
      'invalid-handle': t('nodeGraph.connection.invalidHandle', {
        defaultValue: 'Invalid connection: unable to resolve port handle.',
      }),
      'wrong-direction': t('nodeGraph.connection.wrongDirection', {
        defaultValue:
          'Invalid connection: connect from output port to input port.',
      }),
      'semantic-mismatch': t('nodeGraph.connection.semanticMismatch', {
        defaultValue: 'Invalid connection: port semantics do not match.',
      }),
      'node-not-found': t('nodeGraph.connection.nodeNotFound', {
        defaultValue: 'Invalid connection: node state changed, please retry.',
      }),
      'source-occupied': t('nodeGraph.connection.sourceOccupied', {
        defaultValue:
          'Invalid connection: source port is single-use and already occupied.',
      }),
      'target-occupied': t('nodeGraph.connection.targetOccupied', {
        defaultValue:
          'Invalid connection: target port is single-use and already occupied.',
      }),
    }),
    [t]
  );
  const hintText = useMemo(
    () => ({
      invalidConnectEnd: t('nodeGraph.hints.invalidConnectEnd', {
        defaultValue:
          'Unable to connect: connect output port to an input with matching semantic.',
      }),
      invalidPortHandle: t('nodeGraph.hints.invalidPortHandle', {
        defaultValue:
          'Unable to parse selected port semantic; node created without auto-connect.',
      }),
      noMatchingInput: t('nodeGraph.hints.noMatchingInput', {
        defaultValue:
          'Created node has no matching input port. Node created without connection.',
      }),
      noMatchingOutput: t('nodeGraph.hints.noMatchingOutput', {
        defaultValue:
          'Created node has no matching output port. Node created without connection.',
      }),
      keepAtLeastOneCase: t('nodeGraph.hints.keepAtLeastOneCase', {
        defaultValue: 'Switch must keep at least one case.',
      }),
      keepAtLeastOneStatus: t('nodeGraph.hints.keepAtLeastOneStatus', {
        defaultValue: 'Fetch must keep at least one status branch.',
      }),
      keepAtLeastOneBranch: t('nodeGraph.hints.keepAtLeastOneBranch', {
        defaultValue: 'Parallel branches must keep at least one branch.',
      }),
      keepAtLeastOneEntry: t('nodeGraph.hints.keepAtLeastOneEntry', {
        defaultValue: 'Current node must keep at least one mapping entry.',
      }),
      keepAtLeastOneBinding: t('nodeGraph.hints.keepAtLeastOneBinding', {
        defaultValue: 'Subflow bindings must keep at least one entry.',
      }),
      keepAtLeastOneGraph: t('nodeGraph.hints.keepAtLeastOneGraph', {
        defaultValue: 'Keep at least one graph.',
      }),
    }),
    [t]
  );
  const validationText = useMemo<NodeValidationText>(
    () => ({
      playAnimationRequired: t('nodeGraph.validation.playAnimationRequired', {
        defaultValue: 'targetId and timelineName are required.',
      }),
      scrollToSelectorRequired: t('nodeGraph.validation.scrollToSelector', {
        defaultValue: 'selector target mode requires selector.',
      }),
      focusControlSelectorRequired: t('nodeGraph.validation.focusSelector', {
        defaultValue: 'selector is required.',
      }),
      validateSchemaOrRulesRequired: t(
        'nodeGraph.validation.validateSchemaOrRules',
        {
          defaultValue:
            'Configure schema or provide rules from in.data.rules input.',
        }
      ),
      envVarKeyRequired: t('nodeGraph.validation.envVarKeyRequired', {
        defaultValue: 'key is required.',
      }),
    }),
    [t]
  );
  const localizeNodeLabel = useCallback(
    (node: Node<GraphNodeData>): Node<GraphNodeData> => ({
      ...node,
      data: {
        ...node.data,
        label: resolveCatalogNodeLabel(node.data.kind, node.data.label),
      },
    }),
    [resolveCatalogNodeLabel]
  );
  const createLocalizedNode = useCallback(
    (kind: GraphNodeKind, position: { x: number; y: number }) =>
      toStableGraphNode(localizeNodeLabel(createNode(kind, position))),
    [localizeNodeLabel]
  );
  const commitActiveGraphToDocs = useCallback(
    (
      nextNodes: Node<GraphNodeData>[] = nodes,
      nextEdges: Edge[] = edges
    ): GraphDocument[] => {
      const stableNodes = nextNodes.map(toStableGraphNode);
      const currentNodesSignature = serializeNodes(stableNodes);
      const currentEdgesSignature = serializeEdges(nextEdges);
      return graphDocs.map((graph) => {
        if (graph.id !== activeGraphId) return graph;
        const existingNodesSignature = serializeNodes(graph.nodes);
        const existingEdgesSignature = serializeEdges(graph.edges);
        if (
          existingNodesSignature === currentNodesSignature &&
          existingEdgesSignature === currentEdgesSignature
        ) {
          return graph;
        }
        return {
          ...graph,
          nodes: stableNodes,
          edges: nextEdges,
        };
      });
    },
    [activeGraphId, edges, graphDocs, nodes]
  );
  const commitCanvasToGraphDocs = useCallback(
    (nextNodes: Node<GraphNodeData>[] = nodes, nextEdges: Edge[] = edges) => {
      const stableNodes = nextNodes.map(toStableGraphNode);
      const currentNodesSignature = serializeNodes(stableNodes);
      const currentEdgesSignature = serializeEdges(nextEdges);
      let changed = false;
      const nextGraphDocs = graphDocsRef.current.map((graph) => {
        if (graph.id !== activeGraphIdRef.current) return graph;
        const existingNodesSignature = serializeNodes(graph.nodes);
        const existingEdgesSignature = serializeEdges(graph.edges);
        if (
          existingNodesSignature === currentNodesSignature &&
          existingEdgesSignature === currentEdgesSignature
        ) {
          return graph;
        }
        changed = true;
        return {
          ...graph,
          nodes: stableNodes,
          edges: nextEdges,
        };
      });
      if (!changed) return;
      graphDocsRef.current = nextGraphDocs;
      setGraphDocs(nextGraphDocs);
      const committedSnapshot = ensureProjectGraphSnapshot({
        activeGraphId: activeGraphIdRef.current,
        graphs: nextGraphDocs,
      });
      const nextPirGraphs = serializeGraphsForPirLogic(
        committedSnapshot.graphs
      );
      const nextGraphsSignature = JSON.stringify(nextPirGraphs);
      const nextEditorState = buildNodeGraphEditorState(committedSnapshot);
      const nextEditorStateSignature =
        serializeNodeGraphEditorState(nextEditorState);
      updatePirDoc((doc) => {
        const existingGraphs = serializeGraphsForPirLogic(
          normalizeGraphDocuments(doc.logic?.graphs)
        );
        const existingEditorState = readNodeGraphEditorStateFromLogic(
          doc.logic
        );
        if (
          JSON.stringify(existingGraphs) === nextGraphsSignature &&
          serializeNodeGraphEditorState(existingEditorState) ===
            nextEditorStateSignature
        ) {
          return doc;
        }
        const nextLogic = {
          ...(doc.logic ?? {}),
          graphs: nextPirGraphs,
          [NODE_GRAPH_EDITOR_STATE_KEY]: nextEditorState,
        };
        return {
          ...doc,
          logic: nextLogic,
        };
      });
    },
    [edges, nodes, updatePirDoc]
  );

  const currentSnapshot = useMemo(
    () =>
      ensureProjectGraphSnapshot({
        activeGraphId,
        graphs: graphDocs,
      }),
    [activeGraphId, graphDocs]
  );
  const currentPirComparableSignature = useMemo(
    () => serializeSnapshotForPir(currentSnapshot),
    [currentSnapshot]
  );
  const isDraggingNode = useMemo(
    () => nodes.some((node) => Boolean(node.dragging)),
    [nodes]
  );
  const activeGraphIdRef = useRef(currentSnapshot.activeGraphId);
  const graphDocsRef = useRef(graphDocs);
  const currentPirComparableSignatureRef = useRef(
    currentPirComparableSignature
  );
  const edgeDomDebugSignatureRef = useRef('');

  const applySnapshot = useCallback(
    (snapshot: ProjectGraphSnapshot) => {
      const activeGraph = resolveActiveGraphFromSnapshot(snapshot);
      const nextNodes = activeGraph.nodes.map(toStableGraphNode);
      graphDocsRef.current = snapshot.graphs;
      setGraphDocs((current) => {
        const currentSignature = serializeProjectSnapshot(
          ensureProjectGraphSnapshot({
            activeGraphId: snapshot.activeGraphId,
            graphs: current,
          })
        );
        const nextSignature = serializeProjectSnapshot(snapshot);
        return currentSignature === nextSignature ? current : snapshot.graphs;
      });
      setActiveGraphId((current) =>
        current === snapshot.activeGraphId ? current : snapshot.activeGraphId
      );
      setNodes((current) => {
        const currentSignature = serializeNodes(current.map(toStableGraphNode));
        const nextSignature = serializeNodes(nextNodes);
        return currentSignature === nextSignature ? current : nextNodes;
      });
      setEdges((current) => {
        const currentSignature = serializeEdges(current);
        const nextSignature = serializeEdges(activeGraph.edges);
        return currentSignature === nextSignature ? current : activeGraph.edges;
      });
    },
    [setEdges, setNodes]
  );

  useEffect(() => {
    activeGraphIdRef.current = activeGraphId;
  }, [activeGraphId]);

  useEffect(() => {
    graphDocsRef.current = graphDocs;
  }, [graphDocs]);

  useEffect(() => {
    currentPirComparableSignatureRef.current = currentPirComparableSignature;
  }, [currentPirComparableSignature]);

  useEffect(() => {
    if (isDraggingNode) return;
    const nextSnapshot = pirGraphs.length
      ? ensureProjectGraphSnapshot({
          activeGraphId:
            pirEditorState?.activeGraphId ||
            activeGraphIdRef.current ||
            persistedSnapshot.activeGraphId,
          graphs: applyNodeGraphEditorStateToGraphs(pirGraphs, pirEditorState),
        })
      : persistedSnapshot;
    const nextSnapshotSignature = serializeSnapshotForPir(nextSnapshot);
    if (nextSnapshotSignature !== currentPirComparableSignatureRef.current) {
      applySnapshot(nextSnapshot);
    }
    if (pirGraphs.length) {
      if (pirEditorState) return;
      updatePirDoc((doc) => {
        const existingGraphs = normalizeGraphDocuments(doc.logic?.graphs);
        if (!existingGraphs.length) return doc;
        const migratedSnapshot = ensureProjectGraphSnapshot({
          activeGraphId:
            activeGraphIdRef.current || persistedSnapshot.activeGraphId,
          graphs: existingGraphs,
        });
        const migratedGraphs = serializeGraphsForPirLogic(
          migratedSnapshot.graphs
        );
        const migratedEditorState = buildNodeGraphEditorState(migratedSnapshot);
        const existingEditorState = readNodeGraphEditorStateFromLogic(
          doc.logic
        );
        const existingGraphsSignature = JSON.stringify(
          serializeGraphsForPirLogic(existingGraphs)
        );
        if (
          existingGraphsSignature === JSON.stringify(migratedGraphs) &&
          serializeNodeGraphEditorState(existingEditorState) ===
            serializeNodeGraphEditorState(migratedEditorState)
        ) {
          return doc;
        }
        const nextLogic = {
          ...(doc.logic ?? {}),
          graphs: migratedGraphs,
          [NODE_GRAPH_EDITOR_STATE_KEY]: migratedEditorState,
        };
        return {
          ...doc,
          logic: nextLogic,
        };
      });
      return;
    }
    updatePirDoc((doc) => {
      const existingGraphs = normalizeGraphDocuments(doc.logic?.graphs);
      if (existingGraphs.length) return doc;
      const migratedSnapshot = ensureProjectGraphSnapshot(persistedSnapshot);
      const migratedGraphs = serializeGraphsForPirLogic(
        migratedSnapshot.graphs
      );
      const migratedEditorState = buildNodeGraphEditorState(migratedSnapshot);
      const nextLogic = {
        ...(doc.logic ?? {}),
        graphs: migratedGraphs,
        [NODE_GRAPH_EDITOR_STATE_KEY]: migratedEditorState,
      };
      return {
        ...doc,
        logic: nextLogic,
      };
    });
  }, [
    applySnapshot,
    isDraggingNode,
    pirEditorState,
    pirGraphs,
    persistedSnapshot,
    updatePirDoc,
  ]);

  useEffect(() => {
    if (isDraggingNode) return;
    commitCanvasToGraphDocs();
  }, [commitCanvasToGraphDocs, isDraggingNode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      createStorageKey(resolvedProjectId),
      JSON.stringify(currentSnapshot)
    );
  }, [currentSnapshot, resolvedProjectId]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 2200);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    setMenuPath([]);
  }, [menu]);

  const {
    activeGraphName,
    createGraph,
    deleteGraph,
    duplicateGraph,
    renameActiveGraph,
    switchGraph,
  } = useNodeGraphGraphActions({
    activeGraphId,
    commitActiveGraphToDocs,
    graphDocs: currentSnapshot.graphs,
    keepAtLeastOneGraphHint: hintText.keepAtLeastOneGraph,
    localizeNodeLabel,
    setActiveGraphId,
    setEdges,
    setGraphDocs,
    setHint,
    setNodes,
    t,
  });

  const groupAutoLayoutById = useNodeGraphGroupLayout({
    nodes,
    setNodes,
  });
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes]
  );
  const setRenderRuntime = useNodeGraphRenderStore((state) => state.setRuntime);

  useEffect(() => {
    setRenderRuntime({
      edges,
      groupAutoLayoutById,
      hintText,
      nodesById,
      setEdges,
      setHint,
      setMenu,
      setNodes,
      validationText,
    });
  }, [
    edges,
    groupAutoLayoutById,
    hintText,
    nodesById,
    setEdges,
    setHint,
    setMenu,
    setNodes,
    setRenderRuntime,
    validationText,
  ]);

  const flowNodes = useMemo(() => nodes, [nodes]);
  const flowNodeIdsSignature = useMemo(
    () => nodes.map((node) => node.id).join('|'),
    [nodes]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const debugSignature = JSON.stringify({
      activeGraphId,
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
      })),
      flowNodeIds: flowNodes.map((node) => node.id),
    });
    if (debugSignature === edgeDomDebugSignatureRef.current) return;
    edgeDomDebugSignatureRef.current = debugSignature;
    if (!edges.length) {
      debugNodeGraph('edge-dom-check:empty', {
        activeGraphId,
        flowNodeIds: flowNodes.map((node) => node.id),
      });
      return;
    }
    const inspectHandle = (nodeId: string, handleId?: string | null) => {
      if (!handleId) return false;
      return Boolean(
        document.querySelector(
          [
            `[data-nodeid="${nodeId}"][data-handleid="${handleId}"]`,
            `[data-id="${nodeId}-${handleId}"]`,
            `[data-id="${handleId}"]`,
          ].join(', ')
        )
      );
    };
    debugNodeGraph('edge-dom-check', {
      activeGraphId,
      edgeCount: edges.length,
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
        sourceNodeExists: flowNodes.some((node) => node.id === edge.source),
        targetNodeExists: flowNodes.some((node) => node.id === edge.target),
        sourceHandleExists: inspectHandle(edge.source, edge.sourceHandle),
        targetHandleExists: inspectHandle(edge.target, edge.targetHandle),
      })),
    });
  }, [activeGraphId, edges, flowNodes]);

  useEffect(() => {
    if (!nodes.length) return;
    const frame = window.requestAnimationFrame(() => {
      void reactFlow.fitView({
        duration: 180,
        maxZoom: 1.15,
        minZoom: 0.4,
        padding: 0.18,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeGraphId, flowNodeIdsSignature, nodes.length, reactFlow]);

  const confirmAttachToGroup = useCallback(
    (groupLabel: string) => {
      if (typeof window === 'undefined') return false;
      return window.confirm(
        t('nodeGraph.confirm.attachToBox', {
          groupLabel,
          defaultValue: 'Add node to "{{groupLabel}}"?',
        })
      );
    },
    [t]
  );

  const onNodesChange = useCallback(
    (changes: Parameters<typeof applyNodeChangesWithGrouping>[0]) => {
      setNodes((current) => {
        const nextNodes = applyNodeChangesWithGrouping(
          changes,
          current,
          confirmAttachToGroup
        );
        const hasDraggingChange = changes.some(
          (change) => change.type === 'position' && change.dragging
        );
        if (!hasDraggingChange) {
          queueMicrotask(() => {
            commitCanvasToGraphDocs(nextNodes, edges);
          });
        }
        return nextNodes;
      });
    },
    [commitCanvasToGraphDocs, confirmAttachToGroup, edges, setNodes]
  );

  const closeMenu = useCallback(() => setMenu(null), []);

  const onNodeDragStop = useCallback(() => {
    window.requestAnimationFrame(() => {
      commitCanvasToGraphDocs(
        reactFlow.getNodes() as Node<GraphNodeData>[],
        reactFlow.getEdges()
      );
    });
  }, [commitCanvasToGraphDocs, reactFlow]);
  const onEdgesChangeCommitted = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      queueMicrotask(() => {
        commitCanvasToGraphDocs(nodes);
      });
    },
    [commitCanvasToGraphDocs, nodes, onEdgesChange]
  );

  const portMenuGroups = useMemo(
    () => resolvePortMenuGroups({ localizedNodeMenuGroups, menu }),
    [localizedNodeMenuGroups, menu]
  );

  const { isValidConnection, onConnect } = useNodeGraphConnectionActions({
    connectionHintTextByReason,
    edges,
    nodes,
    setEdges,
    setHint,
  });

  const {
    createNodeFromCanvas,
    createNodeFromGroupBox,
    createNodeFromPort,
    deleteNode,
    detachNodeFromBox,
    disconnectPort,
    duplicateNode,
    updateNodeColorTheme,
  } = useNodeGraphNodeActions({
    closeMenu,
    connectionHintTextByReason,
    createLocalizedNode,
    groupAutoLayoutById,
    hintText: {
      invalidPortHandle: hintText.invalidPortHandle,
      noMatchingInput: hintText.noMatchingInput,
      noMatchingOutput: hintText.noMatchingOutput,
    },
    menu,
    nodes,
    setEdges,
    setHint,
    setNodes,
  });

  const menuItems = useMemo(
    () =>
      buildContextMenuItems({
        createNodeFromCanvas,
        createNodeFromGroupBox,
        createNodeFromPort,
        deleteNode,
        detachNodeFromBox,
        disconnectPort,
        duplicateNode,
        localizedNodeMenuGroups,
        menu,
        nodes,
        portMenuGroups,
        t,
        updateNodeColorTheme,
      }),
    [
      createNodeFromCanvas,
      createNodeFromGroupBox,
      createNodeFromPort,
      deleteNode,
      detachNodeFromBox,
      disconnectPort,
      duplicateNode,
      localizedNodeMenuGroups,
      menu,
      nodes,
      portMenuGroups,
      t,
      updateNodeColorTheme,
    ]
  );

  const menuColumns = useMemo(
    () => buildMenuColumns(menuItems, menuPath),
    [menuItems, menuPath]
  );

  const onMenuItemEnter = useCallback(
    (level: number, index: number, hasChildren: boolean) => {
      setMenuPath((current) => {
        const next = current.slice(0, level);
        if (hasChildren) next[level] = index;
        return next;
      });
    },
    []
  );

  const menuLayout = useMemo(
    () =>
      resolveMenuLayout({
        menu,
        menuColumns,
        menuItems,
      }),
    [menu, menuColumns, menuItems]
  );

  return (
    <div
      className="nodegraph-native-root"
      data-theme={colorMode}
      onClick={closeMenu}
    >
      <NodeGraphGraphManager
        activeGraphId={activeGraphId}
        activeGraphName={activeGraphName}
        graphDocs={graphDocs}
        onCreateGraph={createGraph}
        onDeleteGraph={deleteGraph}
        onDuplicateGraph={duplicateGraph}
        onRenameGraph={renameActiveGraph}
        onSwitchGraph={switchGraph}
        t={t}
      />
      <ReactFlow<Node<GraphNodeData>, Edge>
        nodes={flowNodes}
        edges={edges}
        elevateNodesOnSelect={false}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onEdgesChange={onEdgesChangeCommitted}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        nodesConnectable
        edgesReconnectable
        nodesDraggable
        fitView
        minZoom={0.4}
        maxZoom={2}
        connectionMode={ConnectionMode.Strict}
        colorMode={colorMode}
        className="nodegraph-native-canvas"
        proOptions={{ hideAttribution: true }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          const flowPos = reactFlow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          setMenu({
            kind: 'canvas',
            x: event.clientX,
            y: event.clientY,
            flowX: flowPos.x,
            flowY: flowPos.y,
          });
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          const flowPos = reactFlow.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          });
          setMenu({
            kind: 'node',
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
            flowX: flowPos.x,
            flowY: flowPos.y,
          });
        }}
        onConnectEnd={(_, state) => {
          if (!state?.isValid) {
            setHint(hintText.invalidConnectEnd);
          }
        }}
      >
        <Background
          gap={20}
          size={1}
          color={
            colorMode === 'dark'
              ? 'rgb(255 255 255 / 0.14)'
              : 'rgb(15 23 42 / 0.18)'
          }
        />
        <MiniMap pannable zoomable />
        <Controls position="top-right" showInteractive={false} />
      </ReactFlow>
      {hint ? <div className="nodegraph-native-hint">{hint}</div> : null}

      <NodeGraphContextMenu
        menu={menu}
        menuColumns={menuColumns}
        menuLayout={menuLayout}
        onMenuItemEnter={onMenuItemEnter}
      />
    </div>
  );
};
