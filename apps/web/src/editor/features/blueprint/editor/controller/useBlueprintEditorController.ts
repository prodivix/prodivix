import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { VIEWPORT_ZOOM_RANGE } from '@/editor/features/blueprint/editor/model/viewport';
import { useBlueprintAutosave } from '@/editor/features/blueprint/editor/model/autosave';
import { useBlueprintDragDrop } from '@/editor/features/blueprint/editor/model/dragdrop';
import { executeBlueprintGraph } from '@/editor/features/blueprint/editor/model/graphExecutor';
import { createNodeIdFactory } from '@/editor/features/blueprint/editor/model/palette';
import {
  applyPaletteItemInsertion,
  type PaletteItemSelection,
} from '@/editor/features/blueprint/editor/model/paletteCreation';
import {
  validateBlueprintComposition,
  type BlueprintCompositionIssue,
} from '@/editor/features/blueprint/editor/model/composition';
import {
  collectGraphSubtreeIds,
  getParentMap,
  insertUiGraphFragment,
  instantiateUiGraphSubtreeClone,
  materializePirRoot,
  moveNode,
  removeNode,
} from '@prodivix/pir';
import {
  openExternalNavigateTarget,
  resolveNavigateTarget as resolveBrowserNavigateTarget,
} from '@/pir/actions/registry';
import {
  createRouteDebugSnapshot,
  getRouteDebugEventDetail,
  logRouteDebug,
} from '@/pir/renderer/routeDebug';
import {
  DEFAULT_BLUEPRINT_STATE,
  selectActiveDocumentEditSeq,
  selectActivePirDocumentRecord,
  selectActiveRouteNodeId,
  selectRouteManifest,
  selectWorkspace,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { useAuthStore } from '@/auth/useAuthStore';
import { useEditorShortcut } from '@/editor/shortcuts';
import {
  composeRouteManifestWithModules,
  findRouteNodeParentInfo,
  flattenRouteManifest,
  normalizeRoutePath,
  resolveNavigateTarget as resolveRouteNavigateTarget,
  resolveRouteRuntimeContext,
} from '@prodivix/shared/router';
import type { AutosaveMode } from '@/editor/features/blueprint/editor/model/autosave';
import { usePaletteQueryService } from '@/plugins/platform';
import { createNodeDeleteTransaction } from '@prodivix/workspace';

const CAPABILITY_PIR_DOCUMENT_UPDATE = 'core.pir.graph.replace@1.0';

const createRouteId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

type BlueprintInteractionMode = 'design' | 'interactive';

const getBlueprintInteractionModeStorageKey = (blueprintKey: string) =>
  `prodivix.blueprint.${blueprintKey}.interactionMode`;

const readStoredInteractionMode = (
  blueprintKey: string
): BlueprintInteractionMode => {
  if (typeof window === 'undefined') {
    return DEFAULT_BLUEPRINT_STATE.interactionMode;
  }
  try {
    const value = window.localStorage.getItem(
      getBlueprintInteractionModeStorageKey(blueprintKey)
    );
    return value === 'interactive' ? 'interactive' : 'design';
  } catch {
    return DEFAULT_BLUEPRINT_STATE.interactionMode;
  }
};

const persistInteractionMode = (
  blueprintKey: string,
  mode: BlueprintInteractionMode
) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      getBlueprintInteractionModeStorageKey(blueprintKey),
      mode
    );
  } catch {
    return;
  }
};

type InteractionRequest = {
  params?: Record<string, unknown>;
  nodeId: string;
  trigger: string;
  eventKey: string;
  payload?: unknown;
};

/**
 * Blueprint 编辑器的编排层（controller）。
 *
 * 复杂链路集中在这里：
 * - UI 交互 -> Workspace Command -> autosave（workspace/project）
 * - Canvas 内置动作 -> 导航确认/图执行事件 -> 页面或外部系统
 * - DnD 结果 -> PIR 树变换 -> 选中态与面板状态同步
 */
export const useBlueprintEditorController = () => {
  const palette = usePaletteQueryService();
  const [newPath, setNewPath] = useState('');
  const panelLayout = useSettingsStore((state) => state.global.panelLayout);
  const [isLibraryCollapsed, setLibraryCollapsed] = useState(
    () => panelLayout === 'focus'
  );
  const [isInspectorCollapsed, setInspectorCollapsed] = useState(
    () => panelLayout === 'focus' || panelLayout === 'wide'
  );
  const [isTreeCollapsed, setTreeCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedPreviews, setExpandedPreviews] = useState<
    Record<string, boolean>
  >({});
  const [sizeSelections, setSizeSelections] = useState<Record<string, string>>(
    {}
  );
  const [statusSelections, setStatusSelections] = useState<
    Record<string, number>
  >({});
  const [compositionIssue, setCompositionIssue] =
    useState<BlueprintCompositionIssue>();
  const statusTimers = useRef<Record<string, number>>({});
  const { t } = useTranslation('blueprint');
  const { projectId } = useParams();
  const blueprintKey = projectId ?? 'global';
  const blueprintState = useEditorStore(
    (state) => state.blueprintStateByProject[blueprintKey]
  );
  const setBlueprintState = useEditorStore((state) => state.setBlueprintState);
  const runtimeState = useEditorStore(
    (state) => state.runtimeStateByProject[blueprintKey]
  );
  const patchRuntimeState = useEditorStore((state) => state.patchRuntimeState);
  const workspace = useEditorStore(selectWorkspace)!;
  const activePirDocument = useEditorStore(selectActivePirDocumentRecord)!;
  const pirDoc = activePirDocument.content;
  const documentEditSeq = useEditorStore(selectActiveDocumentEditSeq);
  const updateActivePirDocument = useEditorStore(
    (state) => state.updateActivePirDocument
  );
  const dispatchWorkspaceCommand = useEditorStore(
    (state) => state.dispatchWorkspaceCommand
  );
  const dispatchWorkspaceTransaction = useEditorStore(
    (state) => state.dispatchWorkspaceTransaction
  );
  const workspaceId = workspace.id;
  const activeDocumentId = activePirDocument.id;
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const routeManifest = useEditorStore(selectRouteManifest)!;
  const activeRouteNodeId = useEditorStore(selectActiveRouteNodeId);
  const applyRouteIntent = useEditorStore((state) => state.applyRouteIntent);
  const setActiveRouteNodeId = useEditorStore(
    (state) => state.setActiveRouteNodeId
  );
  const canUpdateWorkspaceDocument = useEditorStore(
    (state) =>
      state.workspaceCapabilities[CAPABILITY_PIR_DOCUMENT_UPDATE] === true
  );
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
  const adoptRebasedWorkspaceOperation = useEditorStore(
    (state) => state.adoptRebasedWorkspaceOperation
  );
  const openWorkspaceRevisionConflict = useEditorStore(
    (state) => state.openWorkspaceRevisionConflict
  );
  const token = useAuthStore((state) => state.token);
  const autosaveMode = useSettingsStore(
    (state) =>
      state.getEffectiveGlobalValue(projectId, 'autosaveMode') as AutosaveMode
  );
  const autosaveInterval = useSettingsStore(
    (state) =>
      state.getEffectiveGlobalValue(projectId, 'autosaveInterval') as number
  );
  const zoomStep = useSettingsStore((state) => state.global.zoomStep);
  const defaultViewportWidth = useSettingsStore(
    (state) => state.global.viewportWidth
  );
  const defaultViewportHeight = useSettingsStore(
    (state) => state.global.viewportHeight
  );
  const initialBlueprintState = useMemo(
    () => ({
      ...DEFAULT_BLUEPRINT_STATE,
      viewportWidth: defaultViewportWidth,
      viewportHeight: defaultViewportHeight,
      interactionMode: readStoredInteractionMode(blueprintKey),
    }),
    [blueprintKey, defaultViewportWidth, defaultViewportHeight]
  );
  const resolvedBlueprintState = blueprintState ?? initialBlueprintState;
  const { viewportWidth, viewportHeight, zoom, pan, selectedId } =
    resolvedBlueprintState;
  const hiddenNodeIds = resolvedBlueprintState.hiddenNodeIds ?? [];
  const composedRouteManifest = useMemo(
    () => composeRouteManifestWithModules(routeManifest).manifest,
    [routeManifest]
  );
  const routes = useMemo(
    () =>
      flattenRouteManifest(composedRouteManifest).map((route) => ({
        id: route.id,
        path: route.path,
        depth: route.depth,
        label: route.label,
        parentId: route.parentId,
        index: route.node.index,
        hasPage: Boolean(route.node.pageDocId),
        hasLayout: Boolean(route.node.layoutDocId),
        hasOutlet: Boolean(route.node.outletNodeId),
        childCount: route.node.children?.length ?? 0,
      })),
    [composedRouteManifest]
  );
  const activeRoute = useMemo(
    () =>
      activeRouteNodeId
        ? (routes.find((route) => route.id === activeRouteNodeId) ?? null)
        : null,
    [activeRouteNodeId, routes]
  );
  const activeRoutePath = activeRoute?.path ?? routes[0]?.path ?? '/';
  const interactionMode = resolvedBlueprintState.interactionMode ?? 'design';
  const previewPath =
    typeof resolvedBlueprintState.routePreviewPath === 'string' &&
    resolvedBlueprintState.routePreviewPath.trim()
      ? normalizeRoutePath(resolvedBlueprintState.routePreviewPath)
      : activeRoutePath;
  const setPreviewPath = useCallback(
    (path: string) => {
      const normalizedPath = normalizeRoutePath(path);
      setBlueprintState(blueprintKey, {
        routePreviewPath: normalizedPath,
      });
      const matchedRoute = routes.find(
        (route) => route.path === normalizedPath
      );
      if (matchedRoute) setActiveRouteNodeId(matchedRoute.id);
    },
    [blueprintKey, routes, setActiveRouteNodeId, setBlueprintState]
  );
  const exactPreviewRoute = useMemo(() => {
    const normalizedPreviewPath = normalizeRoutePath(previewPath);
    return routes.find((route) => route.path === normalizedPreviewPath) ?? null;
  }, [previewPath, routes]);
  const previewRuntimeContext = useMemo(
    () =>
      resolveRouteRuntimeContext(composedRouteManifest, {
        currentPath: previewPath,
        routeNodeId: exactPreviewRoute?.id,
      }),
    [composedRouteManifest, exactPreviewRoute?.id, previewPath]
  );
  const currentPath = previewPath || activeRoutePath;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const createSnapshot = () =>
      createRouteDebugSnapshot({
        currentPath,
        routes,
        routeRuntimeContext: previewRuntimeContext,
      });
    window.__PRODIVIX_ROUTE_DEBUG_SNAPSHOT__ = createSnapshot;
    return () => {
      if (window.__PRODIVIX_ROUTE_DEBUG_SNAPSHOT__ === createSnapshot) {
        delete window.__PRODIVIX_ROUTE_DEBUG_SNAPSHOT__;
      }
    };
  }, [currentPath, previewRuntimeContext, routes]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );
  // 保存链路：Command edit sequence -> autosave -> server mutation ack。
  const {
    saveStatus,
    saveTransport,
    saveIndicatorTone,
    saveIndicatorLabel,
    isWorkspaceSaveDisabled,
    hasPendingChanges,
    saveNow,
  } = useBlueprintAutosave({
    token,
    projectId: projectId ?? undefined,
    documentEditSeq,
    autosaveMode,
    autosaveIntervalMs: autosaveInterval * 1000,
    workspace,
    activeDocument: activePirDocument,
    canUpdateWorkspaceDocument,
    workspaceCapabilitiesLoaded,
    workspaceReadonly,
    applyWorkspaceMutation,
    adoptRebasedWorkspaceOperation,
    openWorkspaceRevisionConflict,
  });

  useEditorShortcut('Mod+S', saveNow, {
    scope: 'blueprint',
    priority: 30,
    enabled: autosaveMode === 'manual' && hasPendingChanges,
    allowInEditable: true,
  });
  const handleAddRouteAtPath = (path: string) => {
    if (workspaceReadonly) return;
    const value = path.trim();
    if (!value) return;
    const nextPath = normalizeRoutePath(value);
    const existingRoute = routes.find((route) => route.path === nextPath);
    if (existingRoute) {
      setPreviewPath(nextPath);
      setActiveRouteNodeId(existingRoute.id);
      setNewPath('');
      return;
    }
    const nextRouteId = createRouteId();
    applyRouteIntent({
      type: 'create-page',
      path: nextPath,
      routeNodeId: nextRouteId,
    });
    if (nextRouteId) {
      setPreviewPath(nextPath);
      setActiveRouteNodeId(nextRouteId);
    }
    setNewPath('');
  };

  const handleAddRoute = () => {
    handleAddRouteAtPath(newPath);
  };

  const handleAddChildRoute = (parentRouteNodeId: string) => {
    if (workspaceReadonly) return;
    const segment =
      typeof window !== 'undefined'
        ? window.prompt(
            t('address.routeTree.childPrompt', {
              defaultValue: 'Child route segment',
            }),
            'new-route'
          )
        : null;
    const nextSegment = segment?.trim();
    if (!nextSegment) return;
    const nextRouteId = createRouteId();
    applyRouteIntent({
      type: 'create-child-route',
      parentRouteNodeId,
      segment: nextSegment,
      routeNodeId: nextRouteId,
    });
    setActiveRouteNodeId(nextRouteId);
  };

  const handleCreateIndexRoute = (parentRouteNodeId: string) => {
    if (workspaceReadonly) return;
    const nextRouteId = createRouteId();
    applyRouteIntent({
      type: 'create-index',
      parentRouteNodeId,
      routeNodeId: nextRouteId,
    });
    setActiveRouteNodeId(nextRouteId);
  };

  const handleRenameRoute = (routeNodeId: string, currentLabel: string) => {
    if (workspaceReadonly) return;
    const route = routes.find((item) => item.id === routeNodeId);
    if (route?.index) return;
    const segment =
      typeof window !== 'undefined'
        ? window.prompt(
            t('address.routeTree.renamePrompt', {
              defaultValue: 'Route segment',
            }),
            currentLabel
          )
        : null;
    const nextSegment = segment?.trim();
    if (!nextSegment) return;
    applyRouteIntent({
      type: 'rename-segment',
      routeNodeId,
      segment: nextSegment,
    });
  };

  const handleMoveRoute = (routeNodeId: string, direction: 'up' | 'down') => {
    if (workspaceReadonly) return;
    const info = findRouteNodeParentInfo(routeManifest.root, routeNodeId);
    if (!info?.parent) return;
    const siblings = info.parent.children ?? [];
    const nextIndex = direction === 'up' ? info.index - 1 : info.index + 1;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    applyRouteIntent({
      type: 'move-route',
      routeNodeId,
      parentRouteNodeId: info.parent.id,
      index: nextIndex,
    });
  };

  const handleDeleteRoute = (routeNodeId: string) => {
    if (workspaceReadonly) return;
    if (routeNodeId === routeManifest.root.id) return;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            t('address.routeTree.deleteConfirm', {
              defaultValue:
                'Delete this route? Page, layout, and code documents will remain in Resources.',
            })
          );
    if (!confirmed) return;
    applyRouteIntent({ type: 'delete-route', routeNodeId });
  };

  /**
   * Canvas built-in `navigate` 的控制器出口。
   *
   * 调用链路：
   * PIR 节点事件 -> PIRNode -> BlueprintEditorCanvas builtInActions.navigate
   * -> controller.handleNavigateRequest
   */
  const handleNavigateRequest = (options: InteractionRequest) => {
    const params = options.params ?? {};
    const to = typeof params.to === 'string' ? params.to.trim() : '';
    logRouteDebug('navigate request received', {
      nodeId: options.nodeId,
      trigger: options.trigger,
      eventKey: options.eventKey,
      params,
      to,
      previewPath,
      previewActiveRouteNodeId: previewRuntimeContext.activeRouteNodeId,
      event: getRouteDebugEventDetail(options.payload),
    });
    if (!to) {
      logRouteDebug('navigate request ignored: empty target', {
        nodeId: options.nodeId,
        params,
      });
      return;
    }
    const navigationResult = resolveRouteNavigateTarget(
      composedRouteManifest,
      previewRuntimeContext,
      { to }
    );
    logRouteDebug('navigate target resolved', {
      requestedTo: to,
      kind: navigationResult.kind,
      currentPreviewPath: previewPath,
      knownRoutes: routes.map((route) => ({
        id: route.id,
        path: route.path,
        hasPage: route.hasPage,
        hasLayout: route.hasLayout,
        hasOutlet: route.hasOutlet,
      })),
      resolvedPath:
        navigationResult.kind === 'internal'
          ? navigationResult.runtimeContext.currentPath
          : undefined,
      resolvedActiveRouteNodeId:
        navigationResult.kind === 'internal'
          ? navigationResult.runtimeContext.activeRouteNodeId
          : undefined,
      matchChain:
        navigationResult.kind === 'internal'
          ? navigationResult.runtimeContext.matchChain.map((match) => ({
              routeNodeId: match.routeNodeId,
              path: match.path,
              pageDocId: match.pageDocId,
              layoutDocId: match.layoutDocId,
            }))
          : undefined,
    });
    if (navigationResult.kind === 'unmatched') {
      setPreviewPath(navigationResult.path);
      logRouteDebug('preview path updated to unmatched route', {
        from: previewPath,
        to: navigationResult.path,
      });
      return;
    }
    if (navigationResult.kind === 'external') {
      if (typeof window === 'undefined') return;
      const { effectiveTarget } = resolveBrowserNavigateTarget(params.target);
      const replace = Boolean(params.replace);
      logRouteDebug('external preview navigation resolved', {
        requestedTo: to,
        url: navigationResult.url,
        effectiveTarget,
        replace,
        nodeId: options.nodeId,
        trigger: options.trigger,
        eventKey: options.eventKey,
        event: getRouteDebugEventDetail(options.payload),
      });
      openExternalNavigateTarget(navigationResult.url, {
        target: effectiveTarget,
        replace,
        debugLabel: 'external preview',
      });
      return;
    }

    if (navigationResult.kind === 'internal') {
      setPreviewPath(navigationResult.runtimeContext.currentPath);
      setActiveRouteNodeId(
        navigationResult.runtimeContext.activeRouteNodeId ?? undefined
      );
      logRouteDebug('preview path updated', {
        from: previewPath,
        to: navigationResult.runtimeContext.currentPath,
        activeRouteNodeId: navigationResult.runtimeContext.activeRouteNodeId,
      });
    }
  };

  /**
   * Canvas built-in `executeGraph` 的控制器出口。
   *
   * 调用链路：
   * PIR 事件 -> PIRRenderer -> Canvas builtInActions.executeGraph ->
   * controller -> `window` 事件总线 `prodivix:execute-graph`
   */
  const handleExecuteGraphRequest = useCallback(
    (options: InteractionRequest) => {
      void executeBlueprintGraph({
        nodeId: options.nodeId,
        trigger: options.trigger,
        eventKey: options.eventKey,
        params: options.params,
      }).then((result) => {
        if (!Object.keys(result.statePatch).length) return;
        patchRuntimeState(blueprintKey, result.statePatch);
      });
    },
    [blueprintKey, patchRuntimeState]
  );

  const toggleGroup = (groupId: string, collapsed?: boolean) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !(collapsed ?? prev[groupId]),
    }));
  };

  const togglePreview = (previewId: string) => {
    setExpandedPreviews((prev) => ({
      ...prev,
      [previewId]: !prev[previewId],
    }));
  };

  const handlePreviewKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    previewId: string,
    hasVariants: boolean
  ) => {
    if (!hasVariants) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      togglePreview(previewId);
    }
  };

  const handleSizeSelect = (itemId: string, sizeId: string) => {
    setSizeSelections((prev) => ({ ...prev, [itemId]: sizeId }));
  };

  const handleStatusSelect = (itemId: string, index: number) => {
    setStatusSelections((prev) => ({ ...prev, [itemId]: index }));
  };

  const startStatusCycle = (itemId: string, total: number) => {
    if (typeof window === 'undefined' || total < 2) return;
    window.clearInterval(statusTimers.current[itemId]);
    statusTimers.current[itemId] = window.setInterval(() => {
      setStatusSelections((prev) => ({
        ...prev,
        [itemId]: ((prev[itemId] ?? 0) + 1) % total,
      }));
    }, 1200);
  };

  const stopStatusCycle = (itemId: string) => {
    if (typeof window === 'undefined') return;
    window.clearInterval(statusTimers.current[itemId]);
    delete statusTimers.current[itemId];
  };
  const handleToggleSidebarCollapse = useCallback(() => {
    setLibraryCollapsed((prev) => !prev);
  }, []);
  const handleToggleTreeCollapse = useCallback(() => {
    setTreeCollapsed((prev) => !prev);
  }, []);
  const handleToggleInspectorCollapse = useCallback(() => {
    setInspectorCollapsed((prev) => !prev);
  }, []);

  useEffect(() => {
    if (blueprintState) return;
    setBlueprintState(blueprintKey, initialBlueprintState);
  }, [blueprintKey, blueprintState, initialBlueprintState, setBlueprintState]);

  useEffect(() => {
    if (panelLayout === 'focus') {
      setLibraryCollapsed(true);
      setInspectorCollapsed(true);
      return;
    }
    if (panelLayout === 'wide') {
      setLibraryCollapsed(false);
      setInspectorCollapsed(true);
      return;
    }
    setLibraryCollapsed(false);
    setInspectorCollapsed(false);
  }, [panelLayout]);

  useEffect(() => {
    if (!selectedId) return;
    setInspectorCollapsed(false);
  }, [selectedId]);

  const handleZoomChange = (value: number) => {
    const next = Math.min(
      VIEWPORT_ZOOM_RANGE.max,
      Math.max(VIEWPORT_ZOOM_RANGE.min, value)
    );
    setBlueprintState(blueprintKey, { zoom: next });
  };

  const handleViewportWidthChange = (value: string) => {
    setBlueprintState(blueprintKey, { viewportWidth: value });
  };

  const handleViewportHeightChange = (value: string) => {
    setBlueprintState(blueprintKey, { viewportHeight: value });
  };

  const handlePanChange = (nextPan: { x: number; y: number }) => {
    setBlueprintState(blueprintKey, { pan: nextPan });
  };

  const handleInteractionModeChange = (mode: BlueprintInteractionMode) => {
    persistInteractionMode(blueprintKey, mode);
    setBlueprintState(blueprintKey, { interactionMode: mode });
  };

  const handleToggleInteractionMode = () => {
    handleInteractionModeChange(
      interactionMode === 'interactive' ? 'design' : 'interactive'
    );
  };

  const handleResetView = () => {
    setBlueprintState(blueprintKey, {
      zoom: DEFAULT_BLUEPRINT_STATE.zoom,
      pan: DEFAULT_BLUEPRINT_STATE.pan,
    });
  };

  const handleNodeSelect = (nodeId: string) => {
    setInspectorCollapsed(false);
    if (selectedId === nodeId) return;
    setBlueprintState(blueprintKey, { selectedId: nodeId });
  };

  const handleToggleNodeHidden = (nodeId: string) => {
    if (!nodeId) return;
    if (nodeId === pirDoc.ui.graph.rootId) return;
    if (!pirDoc.ui.graph.nodesById[nodeId]) return;
    const currentHiddenNodeIds = resolvedBlueprintState.hiddenNodeIds ?? [];
    setBlueprintState(blueprintKey, {
      hiddenNodeIds: currentHiddenNodeIds.includes(nodeId)
        ? currentHiddenNodeIds.filter((id) => id !== nodeId)
        : [...currentHiddenNodeIds, nodeId],
    });
  };

  const handleAddComponent = (
    itemId: string,
    selection: PaletteItemSelection = {}
  ) => {
    if (workspaceReadonly) return;
    const result = applyPaletteItemInsertion(pirDoc, palette, {
      workspaceId,
      documentId: activeDocumentId,
      documentType: activePirDocument.type,
      itemId,
      preferredTargetId: selectedId ?? pirDoc.ui.graph.rootId,
      selection,
    });
    if (result.ok === false) {
      if (result.compositionIssue) {
        setCompositionIssue(result.compositionIssue);
      }
      return;
    }
    const applied = dispatchWorkspaceCommand(result.command);
    if (!applied?.ok) return;
    setCompositionIssue(undefined);
    handleNodeSelect(result.nextNodeId);
  };

  // 拖拽链路：DndContext 事件 -> Command -> 选中态更新。
  const {
    isDragging,
    activePaletteItemId,
    treeDropHint,
    handleDragStart,
    handleDragMove,
    handleDragCancel,
    handleDragEnd,
  } = useBlueprintDragDrop({
    pirDoc,
    workspaceId,
    documentId: activeDocumentId,
    selectedId,
    palette,
    documentType: activePirDocument.type,
    updateActivePirDocument,
    dispatchWorkspaceCommand,
    onNodeSelect: handleNodeSelect,
    onCompositionIssue: setCompositionIssue,
  });

  const deleteBlueprintNode = (nodeId: string) => {
    if (workspaceReadonly) return;
    if (!nodeId || nodeId === pirDoc.ui.graph.rootId) return;
    const parent = getParentMap(pirDoc.ui.graph)[nodeId];
    if (!parent) return;
    const removedNodeIds = new Set<string>();
    collectGraphSubtreeIds(pirDoc.ui.graph, nodeId, removedNodeIds);
    const graph = removeNode(pirDoc.ui.graph, nodeId);
    if (graph === pirDoc.ui.graph) return;
    const issue = validateBlueprintComposition(graph, palette, [
      parent.parentId,
    ]);
    if (issue) {
      setCompositionIssue(issue);
      return;
    }
    const transaction = createNodeDeleteTransaction({
      workspace,
      document: activePirDocument,
      afterGraph: graph,
      removedNodeIds,
      label: 'Delete component',
    });
    if (!transaction) return;
    const applied = dispatchWorkspaceTransaction(transaction);
    if (!applied?.ok) return;
    setCompositionIssue(undefined);
    setBlueprintState(blueprintKey, {
      ...(selectedId && removedNodeIds.has(selectedId)
        ? { selectedId: parent.parentId }
        : {}),
      hiddenNodeIds: hiddenNodeIds.filter((id) => !removedNodeIds.has(id)),
    });
  };

  const handleDeleteSelected = () => {
    if (selectedId) deleteBlueprintNode(selectedId);
  };

  const handleDeleteNode = (nodeId: string) => {
    deleteBlueprintNode(nodeId);
  };

  const handleCopyNode = (nodeId: string) => {
    if (workspaceReadonly) return;
    if (!nodeId) return;
    let nextNodeId = '';
    let nextCompositionIssue: BlueprintCompositionIssue | undefined;
    updateActivePirDocument((doc) => {
      if (nodeId === doc.ui.graph.rootId) return doc;
      const parent = getParentMap(doc.ui.graph)[nodeId];
      if (!parent) return doc;
      const createId = createNodeIdFactory(doc);
      const fragment = instantiateUiGraphSubtreeClone(
        doc.ui.graph,
        nodeId,
        createId
      );
      if (!fragment) return doc;
      const insertion = insertUiGraphFragment(doc.ui.graph, fragment, {
        parentId: parent.parentId,
        index: parent.index + 1,
        ...(parent.regionName ? { regionName: parent.regionName } : {}),
      });
      if (!insertion.ok) return doc;
      nextNodeId = fragment.primaryNodeId;
      const issue = validateBlueprintComposition(insertion.graph, palette, [
        ...Object.keys(fragment.nodesById),
        parent.parentId,
      ]);
      if (issue) {
        nextCompositionIssue = issue;
        nextNodeId = '';
        return doc;
      }
      return {
        ...doc,
        ui: { graph: insertion.graph },
      };
    });
    if (nextCompositionIssue) setCompositionIssue(nextCompositionIssue);
    if (nextNodeId) {
      setCompositionIssue(undefined);
      handleNodeSelect(nextNodeId);
    }
  };

  const handleMoveNode = (nodeId: string, direction: 'up' | 'down') => {
    if (workspaceReadonly) return;
    if (!nodeId) return;
    let moved = false;
    let nextCompositionIssue: BlueprintCompositionIssue | undefined;
    updateActivePirDocument((doc) => {
      if (nodeId === doc.ui.graph.rootId) return doc;
      const parent = getParentMap(doc.ui.graph)[nodeId];
      if (!parent || parent.regionName) return doc;
      const siblings = doc.ui.graph.childIdsById[parent.parentId] ?? [];
      const currentIndex = siblings.indexOf(nodeId);
      if (currentIndex === -1) return doc;
      const targetIndex =
        direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= siblings.length) return doc;
      const graph = moveNode(
        doc.ui.graph,
        nodeId,
        parent.parentId,
        targetIndex
      );
      moved = graph !== doc.ui.graph;
      if (!moved) return doc;
      const issue = validateBlueprintComposition(graph, palette, [
        parent.parentId,
      ]);
      if (issue) {
        nextCompositionIssue = issue;
        moved = false;
        return doc;
      }
      return { ...doc, ui: { graph } };
    });
    if (nextCompositionIssue) setCompositionIssue(nextCompositionIssue);
    if (moved) {
      setCompositionIssue(undefined);
      handleNodeSelect(nodeId);
    }
  };

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      Object.values(statusTimers.current).forEach((timer) =>
        window.clearInterval(timer)
      );
      statusTimers.current = {};
    };
  }, []);

  return {
    dnd: {
      sensors,
      isDragging,
      activePaletteItemId,
      handleDragStart,
      handleDragMove,
      handleDragCancel,
      handleDragEnd,
    },
    saveIndicator: {
      saveStatus,
      saveTransport,
      saveIndicatorTone,
      saveIndicatorLabel,
      isWorkspaceSaveDisabled,
      hasPendingChanges,
      isManualSave: autosaveMode === 'manual',
      onSaveNow: saveNow,
    },
    addressBar: {
      currentPath,
      newPath,
      routes,
      matchedRouteNodeId: previewRuntimeContext.activeRouteNodeId,
      onCurrentPathChange: (value: string) => {
        setPreviewPath(value);
      },
      onNewPathChange: setNewPath,
      onAddRoute: handleAddRoute,
      onAddRouteAtPath: handleAddRouteAtPath,
      onAddChildRoute: handleAddChildRoute,
      onCreateIndexRoute: handleCreateIndexRoute,
      onRenameRoute: handleRenameRoute,
      onMoveRoute: handleMoveRoute,
      onDeleteRoute: handleDeleteRoute,
    },
    sidebar: {
      isCollapsed: isLibraryCollapsed,
      isTreeCollapsed,
      collapsedGroups,
      expandedPreviews,
      sizeSelections,
      statusSelections,
      onToggleCollapse: handleToggleSidebarCollapse,
      onToggleGroup: toggleGroup,
      onTogglePreview: togglePreview,
      onPreviewKeyDown: handlePreviewKeyDown,
      onAddComponent: handleAddComponent,
      onSizeSelect: handleSizeSelect,
      onStatusSelect: handleStatusSelect,
      onStatusCycleStart: startStatusCycle,
      onStatusCycleStop: stopStatusCycle,
    },
    componentTree: {
      isCollapsed: isTreeCollapsed,
      isTreeCollapsed,
      selectedId,
      hiddenNodeIds,
      dropHint: treeDropHint,
      compositionIssue,
      onToggleCollapse: handleToggleTreeCollapse,
      onSelectNode: handleNodeSelect,
      onDeleteSelected: handleDeleteSelected,
      onDeleteNode: handleDeleteNode,
      onCopyNode: handleCopyNode,
      onMoveNode: handleMoveNode,
      onToggleNodeHidden: handleToggleNodeHidden,
      onOpenRoutePath: setPreviewPath,
    },
    canvas: {
      interactionMode,
      viewportWidth,
      viewportHeight,
      zoom,
      pan,
      selectedId,
      hiddenNodeIds,
      runtimeState,
      onPanChange: handlePanChange,
      onZoomChange: handleZoomChange,
      onSelectNode: handleNodeSelect,
      onNavigateRequest: handleNavigateRequest,
      onExecuteGraphRequest: handleExecuteGraphRequest,
    },
    inspector: {
      isCollapsed: isInspectorCollapsed,
      onToggleCollapse: handleToggleInspectorCollapse,
    },
    viewportBar: {
      interactionMode,
      onInteractionModeChange: handleInteractionModeChange,
      onToggleInteractionMode: handleToggleInteractionMode,
      viewportWidth,
      viewportHeight,
      onViewportWidthChange: handleViewportWidthChange,
      onViewportHeightChange: handleViewportHeightChange,
      zoom,
      zoomStep,
      onZoomChange: handleZoomChange,
      onResetView: handleResetView,
    },
  };
};
