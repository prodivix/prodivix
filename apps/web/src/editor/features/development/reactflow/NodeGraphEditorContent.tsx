import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react';
import {
  createNodeGraphExecutorCodeSlotId,
  type NodeGraphDocument,
} from '@prodivix/nodegraph';
import {
  createWorkspaceCodeArtifactProvider,
  createWorkspaceCodeSourceUpdateCommand,
  createWorkspaceNodeGraphDocumentUpdateCommand,
  createWorkspaceVfsIntentPlan,
  type WorkspaceCommandEnvelope,
  type WorkspaceSnapshot,
  type WorkspaceVfsIntentRequest,
} from '@prodivix/workspace';
import {
  navigateToWorkspaceCodeSlotDefinition,
  useWorkspaceSemanticNavigationStore,
} from '@/editor/navigation';
import { useWorkspaceHistoryShortcuts } from '@/editor/shortcuts';
import {
  selectActiveDocumentId,
  selectWorkspaceId,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';
import type { GraphNodeData, GraphNodeKind } from './GraphNode';
import { NodeGraphCanvas } from './NodeGraphCanvas';
import { NodeGraphContextMenu } from './NodeGraphContextMenu';
import {
  toCanonicalNodeGraphDocument,
  toNodeGraphCanvasEdges,
  toNodeGraphCanvasNodes,
} from './nodeGraphDocumentProjection';
import { createNode, type ContextMenuState } from './nodeGraphEditorModel';
import { NodeGraphGraphManager } from './NodeGraphGraphManager';
import { useNodeGraphColorMode } from './useNodeGraphColorMode';
import { useNodeGraphConnectionActions } from './nodeGraphConnectionActions';
import { useNodeGraphGroupLayout } from './nodeGraphGroupLayout';
import { useNodeGraphLocalization } from './useNodeGraphLocalization';
import {
  buildContextMenuItems,
  buildMenuColumns,
  resolveMenuLayout,
  resolvePortMenuGroups,
} from './nodeGraphMenuModel';
import { applyNodeChangesWithGrouping } from './nodeGraphNodeChanges';
import { useNodeGraphNodeActions } from './nodeGraphNodeActions';
import { useNodeGraphRenderStore } from './nodeGraphRenderStore';
import { toStableGraphNode } from './nodeGraphStableNode';
import {
  listWorkspaceNodeGraphs,
  selectWorkspaceNodeGraphId,
} from './nodeGraphWorkspaceDocuments';
import { useNodeGraphWorkspaceDocumentManager } from './useNodeGraphWorkspaceDocumentManager';

const EMPTY_NODEGRAPH_DOCUMENT: NodeGraphDocument = {
  version: 1,
  nodes: [],
  edges: [],
};

const serializeDocument = (content: NodeGraphDocument): string =>
  JSON.stringify(content);

type WorkspaceCommandFactory = (
  workspace: WorkspaceSnapshot
) => WorkspaceCommandEnvelope | null;

export const NodeGraphEditorContent = () => {
  const { t } = useTranslation('editor');
  const navigate = useNavigate();
  const { projectId } = useParams();
  const workspace = useEditorStore((state) => state.workspace);
  const workspaceId = useEditorStore(selectWorkspaceId);
  const activeDocumentId = useEditorStore(selectActiveDocumentId);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const graphDocs = useMemo(
    () => listWorkspaceNodeGraphs(workspace),
    [workspace]
  );
  const activeGraphId = useMemo(
    () => selectWorkspaceNodeGraphId(graphDocs, activeDocumentId),
    [activeDocumentId, graphDocs]
  );
  const activeGraph = useMemo(
    () => graphDocs.find((document) => document.id === activeGraphId),
    [activeGraphId, graphDocs]
  );
  const activeRead = activeGraph?.read;
  const activeContent =
    activeRead?.status === 'valid'
      ? activeRead.decodedContent
      : EMPTY_NODEGRAPH_DOCUMENT;
  const activeContentSignature = useMemo(
    () => serializeDocument(activeContent),
    [activeContent]
  );
  const codeArtifacts = useMemo(
    () =>
      workspace
        ? createWorkspaceCodeArtifactProvider(workspace).listArtifacts({
            surface: 'nodegraph',
          })
        : [],
    [workspace]
  );

  useEffect(() => {
    if (activeGraphId && activeGraphId !== activeDocumentId) {
      setActiveDocumentId(activeGraphId);
    }
  }, [activeDocumentId, activeGraphId, setActiveDocumentId]);

  const semanticNavigationRequest = useWorkspaceSemanticNavigationStore(
    (state) => state.navigationRequest
  );
  const consumeSemanticNavigation = useWorkspaceSemanticNavigationStore(
    (state) => state.consumeNavigation
  );
  const [nodes, setNodes] = useNodesState(
    toNodeGraphCanvasNodes(activeContent)
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    toNodeGraphCanvasEdges(activeContent)
  );
  const [menu, setMenu] = useState<ContextMenuState>(null);
  const [menuPath, setMenuPath] = useState<number[]>([]);
  const [hint, setHint] = useState<string | null>(null);
  const persistenceChainRef = useRef<Promise<void>>(Promise.resolve());
  const hydratedDocumentIdRef = useRef(activeGraphId);
  const hydratedSignatureRef = useRef(activeContentSignature);
  const suppressNextCommitRef = useRef(true);
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
  const isDraggingNode = useMemo(
    () => nodes.some((node) => Boolean(node.dragging)),
    [nodes]
  );

  useWorkspaceHistoryShortcuts({
    workspaceId,
    documentId: activeGraphId,
    domain: 'nodegraph',
    suspended: isDraggingNode,
    shortcutScope: 'nodegraph',
  });

  const scheduleWorkspaceCommand = useCallback(
    (factory: WorkspaceCommandFactory): Promise<boolean> => {
      const execution = persistenceChainRef.current.then(async () => {
        const state = useEditorStore.getState();
        const currentWorkspace = state.workspace;
        if (!currentWorkspace) return false;
        const command = factory(currentWorkspace);
        if (!command) return false;
        const outcome = await dispatchWorkspaceAuthoringOperation({
          workspace: currentWorkspace,
          readonly: state.workspaceReadonly,
          operation: { kind: 'command', command },
        });
        if (outcome.status === 'rejected') {
          setHint(outcome.message);
          return false;
        }
        return true;
      });
      persistenceChainRef.current = execution.then(
        () => undefined,
        () => undefined
      );
      return execution.catch((error: unknown) => {
        console.warn('[nodegraph] workspace operation failed', error);
        setHint(
          error instanceof Error
            ? error.message
            : 'The NodeGraph operation failed.'
        );
        return false;
      });
    },
    []
  );

  const scheduleWorkspaceIntent = useCallback(
    (factory: (workspace: WorkspaceSnapshot) => WorkspaceVfsIntentRequest) =>
      scheduleWorkspaceCommand((currentWorkspace) => {
        const plan = createWorkspaceVfsIntentPlan(
          currentWorkspace,
          factory(currentWorkspace)
        );
        return plan?.command ?? null;
      }),
    [scheduleWorkspaceCommand]
  );

  const persistCanvas = useCallback(
    (
      nextNodes: readonly Node<GraphNodeData>[],
      nextEdges: readonly Edge[]
    ): Promise<boolean> => {
      const documentId = activeGraphId;
      if (!documentId || activeRead?.status !== 'valid') {
        return Promise.resolve(false);
      }
      const after = toCanonicalNodeGraphDocument(nextNodes, nextEdges);
      return scheduleWorkspaceCommand((currentWorkspace) =>
        createWorkspaceNodeGraphDocumentUpdateCommand({
          workspace: currentWorkspace,
          documentId,
          after,
          commandId: createWorkspaceClientOperationId('nodegraph'),
          mergeKey: `nodegraph:${documentId}`,
          label: 'Update node graph',
        })
      );
    },
    [activeGraphId, activeRead?.status, scheduleWorkspaceCommand]
  );

  useEffect(() => {
    if (
      hydratedDocumentIdRef.current === activeGraphId &&
      hydratedSignatureRef.current === activeContentSignature
    ) {
      return;
    }
    const preservePositions =
      hydratedDocumentIdRef.current === activeGraphId ? nodes : [];
    hydratedDocumentIdRef.current = activeGraphId;
    hydratedSignatureRef.current = activeContentSignature;
    suppressNextCommitRef.current = true;
    setNodes(toNodeGraphCanvasNodes(activeContent, preservePositions));
    setEdges(toNodeGraphCanvasEdges(activeContent));
  }, [
    activeContent,
    activeContentSignature,
    activeGraphId,
    nodes,
    setEdges,
    setNodes,
  ]);

  useEffect(() => {
    if (isDraggingNode) return;
    if (suppressNextCommitRef.current) {
      suppressNextCommitRef.current = false;
      return;
    }
    void persistCanvas(nodes, edges);
  }, [edges, isDraggingNode, nodes, persistCanvas]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), 2200);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    setMenuPath([]);
  }, [menu]);

  const {
    createGraph,
    deleteGraph,
    duplicateGraph,
    managerBusy,
    renameActiveGraph,
    switchGraph,
  } = useNodeGraphWorkspaceDocumentManager({
    activeGraph,
    activeGraphId,
    edges,
    graphDocs,
    keepAtLeastOneGraphHint: hintText.keepAtLeastOneGraph,
    localizeNodeLabel,
    nodes,
    persistCanvas,
    scheduleWorkspaceIntent,
    setActiveDocumentId,
    setHint,
    t,
  });

  useEffect(() => {
    const location = semanticNavigationRequest?.location;
    const targetRef =
      location?.kind === 'diagnostic-target' ? location.targetRef : undefined;
    if (
      !semanticNavigationRequest ||
      semanticNavigationRequest.workspaceId !== workspaceId ||
      !targetRef ||
      (targetRef.kind !== 'nodegraph-node' &&
        targetRef.kind !== 'nodegraph-port') ||
      !graphDocs.some((document) => document.id === targetRef.documentId)
    ) {
      return;
    }
    if (targetRef.documentId !== activeGraphId) {
      setActiveDocumentId(targetRef.documentId);
      return;
    }
    const nodeId = targetRef.nodeId;
    if (!nodes.some((node) => node.id === nodeId)) return;
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === nodeId }))
    );
    consumeSemanticNavigation(semanticNavigationRequest.id);
  }, [
    activeGraphId,
    consumeSemanticNavigation,
    graphDocs,
    nodes,
    semanticNavigationRequest,
    setActiveDocumentId,
    setNodes,
    workspaceId,
  ]);

  const groupAutoLayoutById = useNodeGraphGroupLayout({ nodes, setNodes });
  const nodesById = useMemo(
    () => new Map(nodes.map((node) => [node.id, node] as const)),
    [nodes]
  );
  const bindCodeArtifact = useCallback(
    (nodeId: string, artifactId?: string) => {
      if (!activeGraphId) return;
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== nodeId || node.data.kind !== 'code') return node;
          if (!artifactId) {
            if (!node.data.executor) return node;
            const { executor: _dropped, ...data } = node.data;
            return { ...node, data };
          }
          return {
            ...node,
            data: {
              ...node.data,
              executor: {
                slotId: createNodeGraphExecutorCodeSlotId(
                  activeGraphId,
                  nodeId
                ),
                reference: { artifactId },
              },
            },
          };
        })
      );
    },
    [activeGraphId, setNodes]
  );
  const updateCodeArtifactSource = useCallback(
    (artifactId: string, source: string) => {
      void scheduleWorkspaceCommand((currentWorkspace) => {
        const document = currentWorkspace.docsById[artifactId];
        if (!document || document.type !== 'code') return null;
        return createWorkspaceCodeSourceUpdateCommand({
          workspaceId: currentWorkspace.id,
          document,
          source,
          commandId: createWorkspaceClientOperationId('nodegraph-code'),
          issuedAt: new Date().toISOString(),
          mergeKey: `code:${artifactId}`,
          label: 'Update NodeGraph executor source',
        });
      });
    },
    [scheduleWorkspaceCommand]
  );
  const openCodeSlotDefinition = useCallback(
    (slotId: string) => {
      if (!projectId || !workspace) return;
      const result = navigateToWorkspaceCodeSlotDefinition({
        projectId,
        workspace,
        slotId,
        navigate,
      });
      if (result.status === 'unavailable') {
        setHint('The CodeSlot definition is unavailable.');
      }
    },
    [navigate, projectId, workspace]
  );
  const setRenderRuntime = useNodeGraphRenderStore((state) => state.setRuntime);

  useEffect(() => {
    setRenderRuntime({
      bindCodeArtifact,
      codeArtifacts,
      edges,
      groupAutoLayoutById,
      hintText,
      nodesById,
      openCodeSlotDefinition,
      setEdges,
      setHint,
      setMenu,
      setNodes,
      updateCodeArtifactSource,
      validationText,
    });
  }, [
    edges,
    bindCodeArtifact,
    codeArtifacts,
    groupAutoLayoutById,
    hintText,
    nodesById,
    openCodeSlotDefinition,
    setEdges,
    setHint,
    setMenu,
    setNodes,
    setRenderRuntime,
    updateCodeArtifactSource,
    validationText,
  ]);

  const flowNodes = useMemo(() => nodes, [nodes]);
  const flowNodeIdsSignature = useMemo(
    () => nodes.map((node) => node.id).join('|'),
    [nodes]
  );

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
      setNodes((current) =>
        applyNodeChangesWithGrouping(changes, current, confirmAttachToGroup)
      );
    },
    [confirmAttachToGroup, setNodes]
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const onNodeDragStop = useCallback(() => {
    window.requestAnimationFrame(() => {
      void persistCanvas(
        reactFlow.getNodes() as Node<GraphNodeData>[],
        reactFlow.getEdges()
      );
    });
  }, [persistCanvas, reactFlow]);

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
    () => resolveMenuLayout({ menu, menuColumns, menuItems }),
    [menu, menuColumns, menuItems]
  );

  const shellHint =
    hint ??
    (activeRead?.status === 'invalid'
      ? 'The selected NodeGraph document is invalid.'
      : graphDocs.length
        ? null
        : 'Create a graph to start authoring.');

  return (
    <div
      className="nodegraph-native-root"
      data-theme={colorMode}
      onClick={closeMenu}
    >
      <NodeGraphGraphManager
        activeGraphId={activeGraphId}
        activeGraphName={activeGraph?.name ?? ''}
        graphDocs={graphDocs}
        isBusy={managerBusy}
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
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodesChange={onNodesChange}
        setHint={setHint}
        setMenu={setMenu}
        t={t}
      />
      {shellHint ? (
        <div className="nodegraph-native-hint">{shellHint}</div>
      ) : null}
      <NodeGraphContextMenu
        menu={menu}
        menuColumns={menuColumns}
        menuLayout={menuLayout}
        onMenuItemEnter={onMenuItemEnter}
      />
    </div>
  );
};
