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
import { VIEWPORT_ZOOM_RANGE } from '@/editor/features/blueprint/editor/model/data';
import { useBlueprintAutosave } from '@/editor/features/blueprint/editor/model/autosave';
import { useBlueprintDragDrop } from '@/editor/features/blueprint/editor/model/dragdrop';
import { executeBlueprintGraph } from '@/editor/features/blueprint/editor/model/graphExecutor';
import {
  createNodeFromPaletteItem,
  createNodeIdFactory,
} from '@/editor/features/blueprint/editor/model/palette';
import type { ComponentNode, PIRDocument } from '@prodivix/shared/types/pir';
import { materializePirRoot, normalizeTreeToUiGraph } from '@/pir/graph';
import {
  cloneNodeWithNewIds,
  findNodeById,
  findParentId,
  insertAfterById,
  insertChildAtIndex,
  insertIntoPirDoc,
  supportsChildrenForNode,
  moveChildById,
  removeNodeById,
} from '@/editor/features/blueprint/editor/model/tree';
import { normalizeAnimationDefinition } from '@/editor/features/animation/animationEditorModel';
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
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
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

const CAPABILITY_PIR_DOCUMENT_UPDATE = 'core.pir.graph.replace@1.0';
const CAPABILITY_ROUTE_MANIFEST_UPDATE = 'core.route.manifest.update@1.0';

const createRouteId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `route-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createIntentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
 * - UI 交互 -> updatePirDoc -> autosave（workspace/project）
 * - Canvas 内置动作 -> 导航确认/图执行事件 -> 页面或外部系统
 * - DnD 结果 -> PIR 树变换 -> 选中态与面板状态同步
 */
export const useBlueprintEditorController = () => {
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
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const pirDocRevision = useEditorStore((state) => state.pirDocRevision);
  const updatePirDoc = useEditorStore((state) => state.updatePirDoc);
  const workspaceId = useEditorStore((state) => state.workspaceId);
  const workspaceRev = useEditorStore((state) => state.workspaceRev);
  const routeRev = useEditorStore((state) => state.routeRev);
  const activeDocumentId = useEditorStore((state) => state.activeDocumentId);
  const activeDocumentContentRev = useEditorStore((state) =>
    state.activeDocumentId
      ? state.workspaceDocumentsById[state.activeDocumentId]?.contentRev
      : undefined
  );
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const activeRouteNodeId = useEditorStore((state) => state.activeRouteNodeId);
  const applyRouteIntent = useEditorStore((state) => state.applyRouteIntent);
  const setActiveRouteNodeId = useEditorStore(
    (state) => state.setActiveRouteNodeId
  );
  const canUpdateWorkspaceDocument = useEditorStore(
    (state) =>
      state.workspaceCapabilities[CAPABILITY_PIR_DOCUMENT_UPDATE] === true
  );
  const canUpdateRouteManifest = useEditorStore(
    (state) =>
      state.workspaceCapabilities[CAPABILITY_ROUTE_MANIFEST_UPDATE] === true
  );
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
  const markLocalWorkspaceDocumentSaved = useEditorStore(
    (state) => state.markLocalWorkspaceDocumentSaved
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
      setBlueprintState(blueprintKey, {
        routePreviewPath: normalizeRoutePath(path),
      });
    },
    [blueprintKey, setBlueprintState]
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
  // 保存链路：pirDoc 变化 -> useBlueprintAutosave -> editorApi 保存 -> applyWorkspaceMutation
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
    pirDoc,
    pirDocRevision,
    autosaveMode,
    autosaveIntervalMs: autosaveInterval * 1000,
    workspaceId,
    activeDocumentId: activeDocumentId ?? undefined,
    activeDocumentContentRev,
    canUpdateWorkspaceDocument,
    workspaceCapabilitiesLoaded,
    workspaceReadonly,
    applyWorkspaceMutation,
    markLocalWorkspaceDocumentSaved,
  });

  useEditorShortcut('Mod+S', saveNow, {
    scope: 'blueprint',
    priority: 30,
    enabled: autosaveMode === 'manual' && hasPendingChanges,
    allowInEditable: true,
  });
  const routeSyncRequestSeqRef = useRef(0);
  const syncedRouteManifestRef = useRef<string>(JSON.stringify(routeManifest));

  useEffect(() => {
    if (!workspaceId) return;
    if (typeof routeRev !== 'number' || routeRev <= 0) return;
    syncedRouteManifestRef.current = JSON.stringify(routeManifest);
  }, [workspaceId, routeRev]);

  useEffect(() => {
    if (!token) return;
    if (!workspaceId) return;
    if (workspaceReadonly) return;
    if (!workspaceCapabilitiesLoaded) return;
    if (!canUpdateRouteManifest) return;
    if (typeof workspaceRev !== 'number' || workspaceRev <= 0) return;
    if (typeof routeRev !== 'number' || routeRev <= 0) return;

    const serializedRouteManifest = JSON.stringify(routeManifest);
    if (serializedRouteManifest === syncedRouteManifestRef.current) return;

    let disposed = false;
    const requestSeq = routeSyncRequestSeqRef.current + 1;
    routeSyncRequestSeqRef.current = requestSeq;
    const timeoutId = window.setTimeout(() => {
      void editorApi
        .applyWorkspaceIntent(token, workspaceId, {
          expectedWorkspaceRev: workspaceRev,
          expectedRouteRev: routeRev,
          intent: {
            id: createIntentId(),
            namespace: 'core.route',
            type: 'manifest.update',
            version: '1.0',
            payload: { routeManifest },
            issuedAt: new Date().toISOString(),
          },
        })
        .then((mutation) => {
          if (disposed || routeSyncRequestSeqRef.current !== requestSeq) {
            return;
          }
          applyWorkspaceMutation(mutation);
          syncedRouteManifestRef.current = serializedRouteManifest;
        })
        .catch((error) => {
          if (disposed || routeSyncRequestSeqRef.current !== requestSeq) {
            return;
          }
          console.warn('[blueprint] route manifest sync failed', error);
        });
    }, 500);

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId);
    };
  }, [
    applyWorkspaceMutation,
    canUpdateRouteManifest,
    routeManifest,
    routeRev,
    token,
    workspaceCapabilitiesLoaded,
    workspaceId,
    workspaceReadonly,
    workspaceRev,
  ]);

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
    const root = materializePirRoot(pirDoc);
    if (nodeId === root.id) return;
    const exists = Boolean(findNodeById(root, nodeId));
    if (!exists) return;
    const currentHiddenNodeIds = resolvedBlueprintState.hiddenNodeIds ?? [];
    setBlueprintState(blueprintKey, {
      hiddenNodeIds: currentHiddenNodeIds.includes(nodeId)
        ? currentHiddenNodeIds.filter((id) => id !== nodeId)
        : [...currentHiddenNodeIds, nodeId],
    });
  };

  const handleAddComponent = (itemId: string) => {
    if (workspaceReadonly) return;
    const targetId = selectedId ?? 'root';
    let nextNodeId = '';
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      const createId = createNodeIdFactory(doc);
      const newNode = createNodeFromPaletteItem(itemId, createId);
      nextNodeId = newNode.id;

      if (targetId !== root.id) {
        const targetNode = findNodeById(root, targetId);
        const isSameComponentType = targetNode?.type === newNode.type;
        if (
          targetNode?.id === targetId &&
          supportsChildrenForNode(targetNode) &&
          !isSameComponentType
        ) {
          const insertedChild = insertChildAtIndex(
            root,
            targetNode.id,
            newNode,
            targetNode.children?.length ?? 0
          );
          if (insertedChild.inserted) {
            return {
              ...doc,
              ui: { graph: normalizeTreeToUiGraph(insertedChild.node) },
            };
          }
        }

        const insertedSibling = insertAfterById(root, targetId, newNode);
        if (insertedSibling.inserted) {
          return {
            ...doc,
            ui: { graph: normalizeTreeToUiGraph(insertedSibling.node) },
          };
        }
      }

      return insertIntoPirDoc(doc, root.id, newNode);
    });
    if (nextNodeId) {
      handleNodeSelect(nextNodeId);
    }
  };

  // 拖拽链路：DndContext 事件 -> useBlueprintDragDrop -> updatePirDoc -> 选中态更新
  const {
    activePaletteItemId,
    treeDropHint,
    handleDragStart,
    handleDragMove,
    handleDragCancel,
    handleDragEnd,
  } = useBlueprintDragDrop({
    pirDoc,
    currentPath,
    selectedId,
    updatePirDoc,
    onNodeSelect: handleNodeSelect,
  });

  const handleDeleteSelected = () => {
    if (workspaceReadonly) return;
    if (!selectedId) return;
    let nextSelectedId: string | undefined;
    let removed = false;
    let removedNodeIds = new Set<string>();
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      if (selectedId === root.id) return doc;
      const parentId = findParentId(root, selectedId);
      const nodeToRemove = findNodeById(root, selectedId);
      if (nodeToRemove) {
        removedNodeIds = collectNodeIdSet(nodeToRemove);
      }
      const removal = removeNodeById(root, selectedId);
      removed = removal.removed;
      if (!removal.removed) return doc;
      nextSelectedId = parentId ?? undefined;
      const nextDoc = {
        ...doc,
        ui: { graph: normalizeTreeToUiGraph(removal.node) },
      };
      return cleanupDeletedNodeAnimationBindings(nextDoc);
    });
    if (removed) {
      setBlueprintState(blueprintKey, {
        selectedId: nextSelectedId,
        hiddenNodeIds: hiddenNodeIds.filter((id) => !removedNodeIds.has(id)),
      });
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    if (workspaceReadonly) return;
    if (!nodeId) return;
    let nextSelectedId: string | undefined;
    let removed = false;
    let removedNodeIds = new Set<string>();
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      if (nodeId === root.id) return doc;
      const parentId = findParentId(root, nodeId);
      const nodeToRemove = findNodeById(root, nodeId);
      if (nodeToRemove) {
        removedNodeIds = collectNodeIdSet(nodeToRemove);
      }
      const removal = removeNodeById(root, nodeId);
      removed = removal.removed;
      if (!removal.removed) return doc;
      if (selectedId === nodeId) {
        nextSelectedId = parentId ?? undefined;
      }
      const nextDoc = {
        ...doc,
        ui: { graph: normalizeTreeToUiGraph(removal.node) },
      };
      return cleanupDeletedNodeAnimationBindings(nextDoc);
    });
    if (removed) {
      setBlueprintState(blueprintKey, {
        ...(selectedId === nodeId ? { selectedId: nextSelectedId } : {}),
        hiddenNodeIds: hiddenNodeIds.filter((id) => !removedNodeIds.has(id)),
      });
    }
  };

  const handleCopyNode = (nodeId: string) => {
    if (workspaceReadonly) return;
    if (!nodeId) return;
    let nextNodeId = '';
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      if (nodeId === root.id) return doc;
      const source = findNodeById(root, nodeId);
      if (!source) return doc;
      const createId = createNodeIdFactory(doc);
      const cloned = cloneNodeWithNewIds(source, createId);
      nextNodeId = cloned.id;
      const insertedSibling = insertAfterById(root, nodeId, cloned);
      if (insertedSibling.inserted) {
        return {
          ...doc,
          ui: { graph: normalizeTreeToUiGraph(insertedSibling.node) },
        };
      }
      return insertIntoPirDoc(doc, root.id, cloned);
    });
    if (nextNodeId) {
      handleNodeSelect(nextNodeId);
    }
  };

  const handleMoveNode = (nodeId: string, direction: 'up' | 'down') => {
    if (workspaceReadonly) return;
    if (!nodeId) return;
    let moved = false;
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      if (nodeId === root.id) return doc;
      const parentId = findParentId(root, nodeId);
      if (!parentId) return doc;
      const result = moveChildById(root, parentId, nodeId, direction);
      moved = result.moved;
      return result.moved
        ? { ...doc, ui: { graph: normalizeTreeToUiGraph(result.node) } }
        : doc;
    });
    if (moved) {
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

const cleanupDeletedNodeAnimationBindings = (doc: PIRDocument): PIRDocument => {
  const animation = normalizeAnimationDefinition(doc.animation);
  if (!animation) return doc;

  const validNodeIds = new Set<string>();
  collectNodeIds(materializePirRoot(doc), validNodeIds);

  let changed = false;
  const nextTimelines = animation.timelines.map((timeline) => {
    let timelineChanged = false;
    const nextBindings = timeline.bindings.reduce<typeof timeline.bindings>(
      (result, binding) => {
        const targetNodeId = binding.targetNodeId.trim();
        if (!targetNodeId || !validNodeIds.has(targetNodeId)) {
          timelineChanged = true;
          return result;
        }
        if (targetNodeId !== binding.targetNodeId) {
          timelineChanged = true;
          result.push({ ...binding, targetNodeId });
          return result;
        }
        result.push(binding);
        return result;
      },
      []
    );
    if (!timelineChanged) return timeline;
    changed = true;
    return {
      ...timeline,
      bindings: nextBindings,
    };
  });

  if (!changed) return doc;

  return {
    ...doc,
    animation: {
      ...animation,
      timelines: nextTimelines,
    },
  };
};

const collectNodeIds = (node: ComponentNode, bucket: Set<string>) => {
  bucket.add(node.id);
  (node.children ?? []).forEach((child) => collectNodeIds(child, bucket));
};

const collectNodeIdSet = (node: ComponentNode) => {
  const result = new Set<string>();
  collectNodeIds(node, result);
  return result;
};
