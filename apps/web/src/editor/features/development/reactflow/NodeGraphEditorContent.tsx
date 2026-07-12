import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  selectActiveDocumentId,
  selectActivePirDocument,
  selectWorkspaceId,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { useWorkspaceHistoryShortcuts } from '@/editor/shortcuts';
import type { GraphNodeData, GraphNodeKind } from './GraphNode';

import {
  applyNodeGraphEditorStateToGraphs,
  buildNodeGraphEditorState,
  createNode,
  ensureProjectGraphSnapshot,
  NODE_GRAPH_EDITOR_STATE_KEY,
  normalizeGraphDocuments,
  serializeGraphsForPirLogic,
  type ContextMenuState,
  type GraphDocument,
  type NodeGraphEditorPirState,
  type ProjectGraphSnapshot,
} from './nodeGraphEditorModel';

import {
  buildContextMenuItems,
  buildMenuColumns,
  resolveMenuLayout,
  resolvePortMenuGroups,
} from './nodeGraphMenuModel';
import { applyNodeChangesWithGrouping } from './nodeGraphNodeChanges';
import { NodeGraphCanvas } from './NodeGraphCanvas';
import { NodeGraphContextMenu } from './NodeGraphContextMenu';
import { NodeGraphGraphManager } from './NodeGraphGraphManager';
import { useNodeGraphLocalization } from './useNodeGraphLocalization';
import { useNodeGraphColorMode } from './useNodeGraphColorMode';
import { useNodeGraphGraphActions } from './nodeGraphGraphActions';
import { useNodeGraphGroupLayout } from './nodeGraphGroupLayout';
import { useNodeGraphNodeActions } from './nodeGraphNodeActions';
import { useNodeGraphConnectionActions } from './nodeGraphConnectionActions';
import { useNodeGraphRenderStore } from './nodeGraphRenderStore';
import {
  readNodeGraphEditorStateFromLogic,
  resolveNodeGraphHydrationSnapshot,
  serializeNodeGraphEditorState,
  serializeSnapshotForPir,
} from './nodeGraphPirState';
import { serializeNodes, toStableGraphNode } from './nodeGraphStableNode';

const resolveActiveGraphFromSnapshot = (snapshot: ProjectGraphSnapshot) =>
  snapshot.graphs.find((graph) => graph.id === snapshot.activeGraphId) ??
  snapshot.graphs[0];

const serializeProjectSnapshot = (snapshot: ProjectGraphSnapshot) =>
  JSON.stringify(snapshot);
const debugNodeGraph = (label: string, payload: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  console.log(`[node-graph-debug] ${label}`, payload);
};
const serializeEdges = (edges: Edge[]) => JSON.stringify(edges);

export const NodeGraphEditorContent = () => {
  const { t } = useTranslation('editor');
  const workspaceId = useEditorStore(selectWorkspaceId);
  const activeDocumentId = useEditorStore(selectActiveDocumentId);
  const pirDoc = useEditorStore(selectActivePirDocument)!;
  const updateActivePirDocument = useEditorStore(
    (state) => state.updateActivePirDocument
  );
  const starterSnapshot = useMemo(
    () => ensureProjectGraphSnapshot(undefined),
    []
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
        pirEditorState?.activeGraphId || starterSnapshot.activeGraphId,
      graphs: applyNodeGraphEditorStateToGraphs(pirGraphs, pirEditorState),
    });
  }, [pirEditorState, pirGraphs, starterSnapshot.activeGraphId]);
  const initialSnapshot = pirSnapshot ?? starterSnapshot;
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
  const {
    connectionHintTextByReason,
    hintText,
    localizedNodeMenuGroups,
    localizeNodeLabel,
    validationText,
  } = useNodeGraphLocalization(t);
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
      updateActivePirDocument(
        (doc) => {
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
        },
        {
          namespace: 'core.nodegraph',
          type: 'graph.update',
          domainHint: 'nodegraph',
          mergeKey: `nodegraph:${activeGraphIdRef.current}`,
          label: 'Update node graph',
        }
      );
    },
    [edges, nodes, updateActivePirDocument]
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
  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: activeDocumentId,
    domain: 'nodegraph',
    suspended: isDraggingNode,
    shortcutScope: 'nodegraph',
  });
  const activeGraphIdRef = useRef(currentSnapshot.activeGraphId);
  const graphDocsRef = useRef(graphDocs);
  const currentPirComparableSignatureRef = useRef(
    currentPirComparableSignature
  );
  const suppressNextCanvasCommitRef = useRef(false);
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
    const nextSnapshot = resolveNodeGraphHydrationSnapshot({
      pirGraphs,
      pirEditorState,
      currentActiveGraphId: activeGraphIdRef.current,
      starterSnapshot,
    });
    const nextSnapshotSignature = serializeSnapshotForPir(nextSnapshot);
    if (nextSnapshotSignature !== currentPirComparableSignatureRef.current) {
      suppressNextCanvasCommitRef.current = true;
      applySnapshot(nextSnapshot);
    }
  }, [
    activeDocumentId,
    applySnapshot,
    isDraggingNode,
    pirEditorState,
    pirGraphs,
    starterSnapshot.activeGraphId,
  ]);

  useEffect(() => {
    if (isDraggingNode) return;
    if (suppressNextCanvasCommitRef.current) {
      suppressNextCanvasCommitRef.current = false;
      return;
    }
    commitCanvasToGraphDocs();
  }, [commitCanvasToGraphDocs, isDraggingNode]);

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
      <NodeGraphCanvas
        colorMode={colorMode}
        edges={edges}
        flowNodes={flowNodes}
        invalidConnectEndHint={hintText.invalidConnectEnd}
        isValidConnection={isValidConnection}
        onConnect={onConnect}
        onEdgesChange={onEdgesChangeCommitted}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        setHint={setHint}
        setMenu={setMenu}
        t={t}
      />
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
