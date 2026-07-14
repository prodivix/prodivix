import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate, useParams } from 'react-router';
import { createComponentSymbolId } from '@prodivix/authoring';
import type {
  PIRCollectionPreviewInput,
  PIRCollectionProjectionLocation,
  PIRCollectionNode,
  PIRCollectionRegions,
  PIRComponentInstanceBindings,
} from '@prodivix/pir';
import type {
  PIRRenderLocation,
  PIRRendererBlockingIssue,
  PIRTriggerDispatchRequest,
} from '@prodivix/pir-react-renderer';
import { executeNodeGraphAction } from '@prodivix/runtime-browser';
import {
  composeRouteManifestWithModules,
  flattenRouteManifest,
  normalizeRoutePath,
} from '@prodivix/router';
import {
  createWorkspacePIRSubtreeDeleteTransactionPlan,
  createWorkspacePIRSubtreeDuplicateTransactionPlan,
  createWorkspacePIRSubtreeMoveTransactionPlan,
  createWorkspaceRouteIntentPlan,
  selectWorkspacePirDocument,
  type WorkspaceRouteIntent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { useWorkspaceComponentAuthoring } from '@/editor/features/component/controller/useWorkspaceComponentAuthoring';
import {
  navigateToWorkspaceCodeSlotDefinition,
  navigateToWorkspaceSemanticTarget,
  resolveWorkspaceSemanticIndex,
} from '@/editor/navigation';
import {
  DEFAULT_BLUEPRINT_STATE,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { useSettingsStore } from '@/editor/store/useSettingsStore';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import {
  createRendererProjectionRegistry,
  usePaletteQueryService,
  useWebExtensionRegistrySnapshot,
} from '@/plugins/platform';
import { createPirWebRendererHost } from '@/pir/pirWebRendererHost';
import { applyPaletteItemInsertion } from '../model/paletteCreation';
import type { PaletteItemSelection } from '../model/paletteCreation';
import type { BlueprintCompositionIssue } from '../model/composition';
import type { RouteItem } from '../model/types';
import {
  createBlueprintRootLocation,
  pirRenderLocationKey,
} from '../model/tree';
import { VIEWPORT_ZOOM_RANGE } from '../model/viewport';
import { useBundledOfficialPluginRuntime } from '../runtime';
import {
  createBlueprintDuplicateIdFactory,
  resolveBlueprintDirectionalMoveTarget,
  resolveBlueprintInsertionPlacement,
  resolveBlueprintTreePlacement,
  type BlueprintTreeDropPlacement,
} from './blueprintCanonicalGraph';
import { useBlueprintCanonicalDragDrop } from './useBlueprintCanonicalDragDrop';
import { useWorkspaceSaveIndicator } from './useWorkspaceSaveIndicator';

const AUTO_COLLECTION_PREVIEW: PIRCollectionPreviewInput = Object.freeze({
  state: 'auto',
});

const collectionPreviewKey = (
  location: PIRCollectionProjectionLocation
): string =>
  JSON.stringify([location.documentId, location.nodeId, location.instancePath]);

const clampZoom = (value: number): number =>
  Math.min(VIEWPORT_ZOOM_RANGE.max, Math.max(VIEWPORT_ZOOM_RANGE.min, value));

const createRouteItems = (workspace: WorkspaceSnapshot): RouteItem[] => {
  const manifest = composeRouteManifestWithModules(
    workspace.routeManifest
  ).manifest;
  return [
    {
      id: manifest.root.id,
      path: '/',
      depth: 0,
      label: '/',
      index: manifest.root.index,
      hasPage: Boolean(manifest.root.pageDocId),
      hasLayout: Boolean(manifest.root.layoutDocId),
      hasOutlet: Boolean(manifest.root.outletNodeId),
      childCount: manifest.root.children?.length ?? 0,
    },
    ...flattenRouteManifest(manifest).map((route) => ({
      id: route.id,
      path: route.path,
      depth: route.depth + 1,
      label: route.label,
      parentId: route.parentId,
      index: route.node.index,
      hasPage: Boolean(route.node.pageDocId),
      hasLayout: Boolean(route.node.layoutDocId),
      hasOutlet: Boolean(route.node.outletNodeId),
      childCount: route.node.children?.length ?? 0,
    })),
  ];
};

const firstIssueMessage = (input: {
  issues: readonly Readonly<{ message: string }>[];
}): string =>
  input.issues[0]?.message ?? 'The canonical authoring plan was rejected.';

/** Coordinates the original Blueprint UI against the canonical Workspace. */
export const useBlueprintEditorController = (
  requestedDocumentId?: string,
  lockEntryDocument = false
) => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const {
    workspace,
    readonly,
    applyCommand,
    applyTransaction,
    updateCollection,
    updateInstanceBindings,
    setActiveDocumentId,
  } = useWorkspaceComponentAuthoring();
  const setActiveRouteNodeId = useEditorStore(
    (state) => state.setActiveRouteNodeId
  );
  const setBlueprintState = useEditorStore((state) => state.setBlueprintState);
  const defaultViewportWidth = useSettingsStore(
    (state) => state.global.viewportWidth
  );
  const defaultViewportHeight = useSettingsStore(
    (state) => state.global.viewportHeight
  );
  const zoomStep = useSettingsStore((state) => state.global.zoomStep);
  const panelLayout = useSettingsStore((state) => state.global.panelLayout);
  const blueprintKey = workspace?.id ?? projectId ?? 'global';
  const blueprintState = useEditorStore(
    (state) => state.blueprintStateByProject[blueprintKey]
  );
  const runtimeState = useEditorStore(
    (state) => state.runtimeStateByProject[blueprintKey]
  );
  const patchRuntimeState = useEditorStore((state) => state.patchRuntimeState);
  const resolvedBlueprintState = blueprintState ?? {
    ...DEFAULT_BLUEPRINT_STATE,
    viewportWidth: defaultViewportWidth,
    viewportHeight: defaultViewportHeight,
  };

  const entryDocumentId = requestedDocumentId ?? workspace?.activeDocumentId;
  const entry = useMemo(
    () => selectWorkspacePirDocument(workspace ?? undefined, entryDocumentId),
    [entryDocumentId, workspace]
  );
  const rootLocation = useMemo(
    () =>
      entry?.status === 'valid'
        ? createBlueprintRootLocation(
            entry.document.id,
            entry.decodedContent,
            entry.document.type === 'pir-component' ? 'definition' : 'source'
          )
        : undefined,
    [entry]
  );
  const palette = usePaletteQueryService();
  const extensions = useWebExtensionRegistrySnapshot();
  const rendererHost = useMemo(
    () =>
      createPirWebRendererHost(createRendererProjectionRegistry(extensions)),
    [extensions]
  );
  const officialPluginRuntime = useBundledOfficialPluginRuntime(
    entry?.status === 'valid' ? entry.decodedContent : undefined
  );

  const [newPath, setNewPath] = useState('');
  const [selection, setSelection] = useState<PIRRenderLocation>();
  const [hiddenLocations, setHiddenLocations] = useState<
    readonly PIRRenderLocation[]
  >([]);
  const [compositionIssue, setCompositionIssue] =
    useState<BlueprintCompositionIssue>();
  const [blockingIssues, setBlockingIssues] = useState<
    readonly PIRRendererBlockingIssue[]
  >([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLibraryCollapsed, setLibraryCollapsed] = useState(
    () => panelLayout === 'focus'
  );
  const [isTreeCollapsed, setTreeCollapsed] = useState(false);
  const [isInspectorCollapsed, setInspectorCollapsed] = useState(
    () => panelLayout === 'focus' || panelLayout === 'wide'
  );
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
  const [collectionPreviewByLocation, setCollectionPreviewByLocation] =
    useState<Readonly<Record<string, PIRCollectionPreviewInput>>>({});
  const [extractionOpen, setExtractionOpen] = useState(false);

  useEffect(() => {
    if (!blueprintState) {
      setBlueprintState(blueprintKey, {
        viewportWidth: defaultViewportWidth,
        viewportHeight: defaultViewportHeight,
      });
    }
  }, [
    blueprintKey,
    blueprintState,
    defaultViewportHeight,
    defaultViewportWidth,
    setBlueprintState,
  ]);

  const rootDocumentId = rootLocation?.documentId;
  const rootNodeId = rootLocation?.nodeId;
  const rootInstancePath = rootLocation?.instancePath;
  const rootRole = rootLocation?.role;
  useEffect(() => {
    setSelection(
      rootDocumentId && rootNodeId && rootInstancePath && rootRole
        ? {
            documentId: rootDocumentId,
            nodeId: rootNodeId,
            instancePath: rootInstancePath,
            role: rootRole,
          }
        : undefined
    );
    setHiddenLocations([]);
    setCompositionIssue(undefined);
    setBlockingIssues([]);
    setStatusMessage(null);
  }, [entryDocumentId, rootDocumentId, rootInstancePath, rootNodeId, rootRole]);

  useEffect(
    () => () => {
      if (typeof window === 'undefined') return;
      Object.values(statusTimers.current).forEach((timer) =>
        window.clearInterval(timer)
      );
      statusTimers.current = {};
    },
    []
  );

  useEffect(() => {
    if (panelLayout === 'focus') {
      setLibraryCollapsed(true);
      setInspectorCollapsed(true);
      return;
    }
    setLibraryCollapsed(false);
    setInspectorCollapsed(panelLayout === 'wide');
  }, [panelLayout]);

  const routes = useMemo(
    () => (workspace ? createRouteItems(workspace) : []),
    [workspace]
  );
  const activeRoute = routes.find(
    (route) => route.id === workspace?.activeRouteNodeId
  );
  const fallbackPath = activeRoute?.path ?? routes[0]?.path ?? '/';
  const currentPath = normalizeRoutePath(
    resolvedBlueprintState.routePreviewPath?.trim() || fallbackPath
  );
  const matchedRouteNodeId = routes.find(
    (route) => route.path === currentPath
  )?.id;

  const setPreviewPath = (path: string) => {
    const normalized = normalizeRoutePath(path);
    setBlueprintState(blueprintKey, { routePreviewPath: normalized });
    const route = routes.find((item) => item.path === normalized);
    if (!route) return;
    setActiveRouteNodeId(route.id);
    if (!workspace || lockEntryDocument) return;
    const manifest = composeRouteManifestWithModules(
      workspace.routeManifest
    ).manifest;
    const matched =
      normalized === '/'
        ? manifest.root
        : flattenRouteManifest(manifest).find(
            (item) => item.path === normalized
          )?.node;
    const nextDocumentId = matched?.pageDocId ?? matched?.layoutDocId;
    if (
      nextDocumentId &&
      selectWorkspacePirDocument(workspace, nextDocumentId)?.status === 'valid'
    ) {
      setActiveDocumentId(nextDocumentId);
    }
  };

  const applyRouteIntent = async (intent: WorkspaceRouteIntent) => {
    if (!workspace || readonly) return false;
    const plan = createWorkspaceRouteIntentPlan(workspace, intent, {
      id: createWorkspaceClientOperationId('route'),
      issuedAt: new Date().toISOString(),
    });
    if (!plan) {
      setStatusMessage(
        'The route action is invalid in this Workspace revision.'
      );
      return false;
    }
    const outcome =
      plan.kind === 'command'
        ? await applyCommand(plan.command)
        : await applyTransaction(plan.transaction);
    setStatusMessage(
      outcome.status === 'applied' ? 'Route manifest updated.' : outcome.message
    );
    return outcome.status === 'applied';
  };

  const handleAddRouteAtPath = async (path: string) => {
    const nextPath = normalizeRoutePath(path.trim());
    const existing = routes.find((route) => route.path === nextPath);
    if (existing) {
      setPreviewPath(existing.path);
      setNewPath('');
      return;
    }
    const routeNodeId = createWorkspaceClientOperationId('route-node');
    if (
      await applyRouteIntent({
        type: 'create-page',
        path: nextPath,
        routeNodeId,
      })
    ) {
      setActiveRouteNodeId(routeNodeId);
      setPreviewPath(nextPath);
    }
    setNewPath('');
  };

  const handleAddChildRoute = async (parentRouteNodeId: string) => {
    const segment =
      typeof window === 'undefined'
        ? null
        : window.prompt('Child route segment', 'new-route');
    if (!segment?.trim()) return;
    const routeNodeId = createWorkspaceClientOperationId('route-node');
    if (
      await applyRouteIntent({
        type: 'create-child-route',
        parentRouteNodeId,
        segment: segment.trim(),
        routeNodeId,
      })
    ) {
      setActiveRouteNodeId(routeNodeId);
    }
  };

  const handleCreateIndexRoute = async (parentRouteNodeId: string) => {
    const routeNodeId = createWorkspaceClientOperationId('route-node');
    if (
      await applyRouteIntent({
        type: 'create-index',
        parentRouteNodeId,
        routeNodeId,
      })
    ) {
      setActiveRouteNodeId(routeNodeId);
    }
  };

  const handleRenameRoute = async (
    routeNodeId: string,
    currentLabel: string
  ) => {
    const segment =
      typeof window === 'undefined'
        ? null
        : window.prompt('Route segment', currentLabel);
    if (!segment?.trim()) return;
    await applyRouteIntent({
      type: 'rename-segment',
      routeNodeId,
      segment: segment.trim(),
    });
  };

  const handleMoveRoute = async (
    routeNodeId: string,
    direction: 'up' | 'down'
  ) => {
    const route = routes.find((item) => item.id === routeNodeId);
    if (!route?.parentId) return;
    const siblings = routes.filter((item) => item.parentId === route.parentId);
    const currentIndex = siblings.findIndex((item) => item.id === routeNodeId);
    const index = currentIndex + (direction === 'up' ? -1 : 1);
    if (index < 0 || index >= siblings.length) return;
    await applyRouteIntent({
      type: 'move-route',
      routeNodeId,
      parentRouteNodeId: route.parentId,
      index,
    });
  };

  const handleDeleteRoute = async (routeNodeId: string) => {
    if (routeNodeId === workspace?.routeManifest.root.id) return;
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(
        'Delete this route? Its page, layout, and code documents remain in Resources.'
      );
    if (confirmed) {
      await applyRouteIntent({ type: 'delete-route', routeNodeId });
    }
  };

  const moveTreeNode = async (
    source: PIRRenderLocation,
    target: PIRRenderLocation,
    placement: BlueprintTreeDropPlacement
  ) => {
    if (!workspace || readonly || source.documentId !== target.documentId) {
      setStatusMessage(
        'PIR subtrees can only move inside their owner document.'
      );
      return;
    }
    const resolved = resolveBlueprintTreePlacement(
      workspace,
      target,
      placement
    );
    if (!resolved) {
      setStatusMessage('The target does not expose a legal PIR placement.');
      return;
    }
    const result = createWorkspacePIRSubtreeMoveTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: createWorkspaceClientOperationId('pir-move'),
      issuedAt: new Date().toISOString(),
      documentId: source.documentId,
      nodeId: source.nodeId,
      target: resolved.placement,
    });
    if (result.status === 'rejected') {
      setStatusMessage(firstIssueMessage(result));
      return;
    }
    const outcome = await applyTransaction(result.plan.transaction);
    setStatusMessage(
      outcome.status === 'applied' ? 'Moved PIR subtree.' : outcome.message
    );
  };

  const deleteTreeNode = async (location: PIRRenderLocation) => {
    if (!workspace || readonly) return;
    const result = createWorkspacePIRSubtreeDeleteTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: createWorkspaceClientOperationId('pir-delete'),
      issuedAt: new Date().toISOString(),
      documentId: location.documentId,
      nodeId: location.nodeId,
    });
    if (result.status === 'rejected') {
      setStatusMessage(firstIssueMessage(result));
      return;
    }
    const outcome = await applyTransaction(result.plan.transaction);
    if (outcome.status === 'applied') {
      setSelection(rootLocation);
      setHiddenLocations((current) =>
        current.filter(
          (candidate) =>
            Boolean(
              result.plan.nextDocumentContent.ui.graph.nodesById[
                candidate.nodeId
              ]
            ) || candidate.documentId !== location.documentId
        )
      );
      setStatusMessage('Deleted PIR subtree.');
    } else {
      setStatusMessage(outcome.message);
    }
  };

  const duplicateTreeNode = async (location: PIRRenderLocation) => {
    if (!workspace || readonly) return;
    const target = resolveBlueprintTreePlacement(workspace, location, 'after');
    if (!target) return;
    const transactionId = createWorkspaceClientOperationId('pir-duplicate');
    const result = createWorkspacePIRSubtreeDuplicateTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId,
      issuedAt: new Date().toISOString(),
      documentId: location.documentId,
      nodeId: location.nodeId,
      target: target.placement,
      createId: createBlueprintDuplicateIdFactory(transactionId),
    });
    if (result.status === 'rejected') {
      setStatusMessage(firstIssueMessage(result));
      return;
    }
    const outcome = await applyTransaction(result.plan.transaction);
    if (outcome.status === 'applied' && result.plan.selectedNodeId) {
      setSelection({ ...location, nodeId: result.plan.selectedNodeId });
      setStatusMessage('Duplicated PIR subtree.');
    } else if (outcome.status === 'rejected') {
      setStatusMessage(outcome.message);
    }
  };

  const insertPaletteItem = async (
    itemId: string,
    itemSelection: PaletteItemSelection = {},
    targetLocation = selection ?? rootLocation,
    dropPlacement?: BlueprintTreeDropPlacement
  ) => {
    if (!workspace || readonly || !targetLocation) return;
    const target = dropPlacement
      ? resolveBlueprintTreePlacement(workspace, targetLocation, dropPlacement)
      : resolveBlueprintInsertionPlacement(workspace, targetLocation);
    if (!target) {
      setStatusMessage('The selected node does not expose an insertion slot.');
      return;
    }
    const read = selectWorkspacePirDocument(workspace, target.documentId);
    if (read?.status !== 'valid') return;
    const planned = applyPaletteItemInsertion(read.decodedContent, palette, {
      workspaceId: workspace.id,
      documentId: read.document.id,
      documentType: read.document.type,
      itemId,
      target: target.placement,
      selection: itemSelection,
      commandId: createWorkspaceClientOperationId('palette-insert'),
      issuedAt: new Date().toISOString(),
    });
    if (planned.ok === false) {
      setCompositionIssue(planned.compositionIssue);
      setStatusMessage(planned.reason);
      return;
    }
    const outcome = await applyCommand(planned.command);
    if (outcome.status === 'rejected') {
      setStatusMessage(outcome.message);
      return;
    }
    setCompositionIssue(undefined);
    setSelection({
      documentId: read.document.id,
      nodeId: planned.nextNodeId,
      instancePath:
        targetLocation.documentId === read.document.id
          ? targetLocation.instancePath
          : createBlueprintRootLocation(
              read.document.id,
              read.decodedContent,
              read.document.type === 'pir-component' ? 'definition' : 'source'
            ).instancePath,
      role:
        targetLocation.documentId === read.document.id
          ? targetLocation.role
          : read.document.type === 'pir-component'
            ? 'definition'
            : 'source',
    });
    setStatusMessage(
      `Inserted ${palette.getItemById(itemId)?.name ?? itemId}.`
    );
  };

  const dragDrop = useBlueprintCanonicalDragDrop({
    workspace: workspace ?? undefined,
    selectedLocation: selection,
    rootLocation,
    onInsertPaletteItem: (itemId, itemSelection, target, placement) => {
      void insertPaletteItem(itemId, itemSelection, target, placement);
    },
    onMoveTreeNode: (source, target, placement) => {
      void moveTreeNode(source, target, placement);
    },
  });

  const toggleHidden = (location: PIRRenderLocation) => {
    setHiddenLocations((current) => {
      const key = pirRenderLocationKey(location);
      return current.some(
        (candidate) => pirRenderLocationKey(candidate) === key
      )
        ? current.filter((candidate) => pirRenderLocationKey(candidate) !== key)
        : [...current, location];
    });
  };

  const handleDirectionalMove = async (
    location: PIRRenderLocation,
    direction: 'up' | 'down'
  ) => {
    if (!workspace || readonly) return;
    const target = resolveBlueprintDirectionalMoveTarget(
      workspace,
      location,
      direction
    );
    if (!target) return;
    const result = createWorkspacePIRSubtreeMoveTransactionPlan({
      workspace,
      baseRevision: workspace.workspaceRev,
      transactionId: createWorkspaceClientOperationId('pir-move'),
      issuedAt: new Date().toISOString(),
      documentId: location.documentId,
      nodeId: location.nodeId,
      target: target.placement,
    });
    if (result.status === 'rejected') {
      setStatusMessage(firstIssueMessage(result));
      return;
    }
    const outcome = await applyTransaction(result.plan.transaction);
    if (outcome.status === 'rejected') setStatusMessage(outcome.message);
  };

  const openComponentDefinition = (documentId: string) => {
    if (!projectId || !workspace) return;
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      navigate,
      preferredSurface: 'component',
      resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      target: {
        kind: 'semantic-symbol',
        symbolId: createComponentSymbolId(workspace.id, documentId),
        destination: { kind: 'definition' },
      },
    });
    if (result.status === 'unavailable') {
      setStatusMessage('The Component Definition is unavailable.');
    }
  };

  const findComponentReferences = (documentId: string) => {
    if (!projectId || !workspace) return;
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      navigate,
      resolveSemanticIndex: resolveWorkspaceSemanticIndex,
      target: {
        kind: 'semantic-symbol',
        symbolId: createComponentSymbolId(workspace.id, documentId),
        destination: { kind: 'reference', preferSourceSpan: false },
      },
    });
    if (result.status === 'unavailable') {
      setStatusMessage('No Component reference is available.');
    }
  };

  const openCodeArtifact = (artifactId: string) => {
    if (!projectId) return;
    const result = navigateToWorkspaceSemanticTarget({
      projectId,
      navigate,
      target: {
        kind: 'diagnostic-target',
        targetRef: { kind: 'code-artifact', artifactId },
      },
    });
    if (result.status === 'unavailable') {
      setStatusMessage('The referenced CodeArtifact is unavailable.');
    }
  };

  const openCodeSlotDefinition = (slotId: string) => {
    if (!projectId || !workspace) return;
    const result = navigateToWorkspaceCodeSlotDefinition({
      projectId,
      workspace,
      slotId,
      navigate,
    });
    if (result.status === 'unavailable') {
      setStatusMessage('The CodeSlot definition is unavailable.');
    }
  };

  const dispatchTrigger = (request: PIRTriggerDispatchRequest) => {
    const trigger = request.trigger;
    if (trigger.kind === 'open-url') {
      if (typeof window !== 'undefined') {
        window.open(trigger.href, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    if (trigger.kind === 'navigate-route') {
      const route = routes.find((item) => item.id === trigger.routeId);
      if (route) setPreviewPath(route.path);
      else setStatusMessage(`Route ${trigger.routeId} is unavailable.`);
      return;
    }
    if (trigger.kind === 'run-nodegraph') {
      const document = workspace?.docsById[trigger.documentId];
      if (!document || document.type !== 'pir-graph') {
        setStatusMessage(
          `NodeGraph document ${trigger.documentId} is unavailable.`
        );
        return;
      }
      void executeNodeGraphAction(document.content, {
        documentId: document.id,
        nodeId: request.source.nodeId,
        trigger: 'pir-event',
        eventKey: request.source.instancePath,
        params:
          trigger.inputMapping && typeof trigger.inputMapping === 'object'
            ? (trigger.inputMapping as Record<string, unknown>)
            : undefined,
        input: request.payload,
      }).then((result) => {
        if (Object.keys(result.statePatch).length > 0) {
          patchRuntimeState(blueprintKey, result.statePatch);
        }
        if (result.status !== 'completed') {
          setStatusMessage(
            `NodeGraph execution stopped with status ${result.status}.`
          );
        }
      });
      return;
    }
    if (trigger.kind === 'play-animation') {
      setStatusMessage(
        `Animation ${trigger.documentId} requires an ExecutionProvider.`
      );
      return;
    }
    setStatusMessage(
      `CodeArtifact ${trigger.reference.artifactId} requires a Code ExecutionProvider.`
    );
  };

  const saveIndicator = useWorkspaceSaveIndicator({
    workspaceId: workspace?.id,
    readonly,
  });
  const selectedCollectionPreview = selection
    ? (collectionPreviewByLocation[collectionPreviewKey(selection)] ??
      AUTO_COLLECTION_PREVIEW)
    : AUTO_COLLECTION_PREVIEW;

  const toggleGroup = (groupId: string, collapsed: boolean) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupId]: !collapsed,
    }));
  };
  const togglePreview = (previewId: string) => {
    setExpandedPreviews((current) => ({
      ...current,
      [previewId]: !current[previewId],
    }));
  };
  const handlePreviewKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
    previewId: string,
    hasVariants: boolean
  ) => {
    if (!hasVariants || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    togglePreview(previewId);
  };
  const startStatusCycle = (itemId: string, total: number) => {
    if (typeof window === 'undefined' || total < 2) return;
    window.clearInterval(statusTimers.current[itemId]);
    statusTimers.current[itemId] = window.setInterval(() => {
      setStatusSelections((current) => ({
        ...current,
        [itemId]: ((current[itemId] ?? 0) + 1) % total,
      }));
    }, 1200);
  };
  const stopStatusCycle = (itemId: string) => {
    if (typeof window === 'undefined') return;
    window.clearInterval(statusTimers.current[itemId]);
    delete statusTimers.current[itemId];
  };
  const handleBlockingIssues = useCallback(
    (issues: readonly PIRRendererBlockingIssue[]) => {
      setBlockingIssues((current) => {
        const previousKey = current
          .map((issue) => `${issue.code}:${issue.path}`)
          .join('\u0000');
        const nextKey = issues
          .map((issue) => `${issue.code}:${issue.path}`)
          .join('\u0000');
        return previousKey === nextKey ? current : issues;
      });
    },
    []
  );

  return {
    workspace,
    entry,
    entryDocumentId,
    rendererHost,
    readonly,
    rootLocation,
    statusMessage,
    dismissStatusMessage: () => setStatusMessage(null),
    officialPluginRuntime,
    extraction: {
      open: extractionOpen,
      selection,
      onOpen: () => setExtractionOpen(true),
      onClose: () => setExtractionOpen(false),
      onApplied: (sourceDocumentId: string, instanceNodeId: string) => {
        setActiveDocumentId(sourceDocumentId);
        const read = selectWorkspacePirDocument(
          workspace ?? undefined,
          sourceDocumentId
        );
        if (read?.status === 'valid') {
          setSelection({
            ...createBlueprintRootLocation(
              sourceDocumentId,
              read.decodedContent,
              'source'
            ),
            nodeId: instanceNodeId,
          });
        }
        setStatusMessage('Component extraction applied.');
      },
    },
    dnd: dragDrop,
    saveIndicator,
    addressBar: {
      currentPath,
      newPath,
      routes,
      matchedRouteNodeId,
      onCurrentPathChange: setPreviewPath,
      onNewPathChange: setNewPath,
      onAddRoute: () => void handleAddRouteAtPath(newPath),
      onAddRouteAtPath: (path: string) => void handleAddRouteAtPath(path),
      onAddChildRoute: (routeNodeId: string) =>
        void handleAddChildRoute(routeNodeId),
      onCreateIndexRoute: (routeNodeId: string) =>
        void handleCreateIndexRoute(routeNodeId),
      onRenameRoute: (routeNodeId: string, currentLabel: string) =>
        void handleRenameRoute(routeNodeId, currentLabel),
      onMoveRoute: (routeNodeId: string, direction: 'up' | 'down') =>
        void handleMoveRoute(routeNodeId, direction),
      onDeleteRoute: (routeNodeId: string) =>
        void handleDeleteRoute(routeNodeId),
    },
    sidebar: {
      isCollapsed: isLibraryCollapsed,
      isTreeCollapsed,
      collapsedGroups,
      expandedPreviews,
      sizeSelections,
      statusSelections,
      onToggleCollapse: () => setLibraryCollapsed((current) => !current),
      onToggleGroup: toggleGroup,
      onTogglePreview: togglePreview,
      onPreviewKeyDown: handlePreviewKeyDown,
      onAddComponent: (itemId: string, itemSelection?: PaletteItemSelection) =>
        void insertPaletteItem(itemId, itemSelection),
      onSizeSelect: (itemId: string, sizeId: string) =>
        setSizeSelections((current) => ({ ...current, [itemId]: sizeId })),
      onStatusSelect: (itemId: string, index: number) =>
        setStatusSelections((current) => ({ ...current, [itemId]: index })),
      onStatusCycleStart: startStatusCycle,
      onStatusCycleStop: stopStatusCycle,
    },
    componentTree: {
      isCollapsed: isTreeCollapsed,
      isTreeCollapsed,
      selectedLocation: selection,
      hiddenLocations,
      dropHint: dragDrop.treeDropHint,
      compositionIssue,
      onToggleCollapse: () => setTreeCollapsed((current) => !current),
      onSelectNode: (location: PIRRenderLocation) => {
        setSelection(location);
        setInspectorCollapsed(false);
      },
      onDeleteSelected: () => {
        if (selection) void deleteTreeNode(selection);
      },
      onDeleteNode: (location: PIRRenderLocation) =>
        void deleteTreeNode(location),
      onCopyNode: (location: PIRRenderLocation) =>
        void duplicateTreeNode(location),
      onMoveNode: (location: PIRRenderLocation, direction: 'up' | 'down') =>
        void handleDirectionalMove(location, direction),
      onToggleNodeHidden: toggleHidden,
      onOpenRoutePath: setPreviewPath,
    },
    canvas: {
      interactionMode: resolvedBlueprintState.interactionMode,
      viewportWidth: resolvedBlueprintState.viewportWidth,
      viewportHeight: resolvedBlueprintState.viewportHeight,
      zoom: resolvedBlueprintState.zoom,
      pan: resolvedBlueprintState.pan,
      selectedLocation: selection,
      hiddenLocations,
      rootStateById: runtimeState,
      blockingIssues,
      onPanChange: (pan: { x: number; y: number }) =>
        setBlueprintState(blueprintKey, { pan }),
      onZoomChange: (zoom: number) =>
        setBlueprintState(blueprintKey, { zoom: clampZoom(zoom) }),
      onSelectNode: (location: PIRRenderLocation) => {
        setSelection(location);
        setInspectorCollapsed(false);
      },
      onBlockingIssuesChange: handleBlockingIssues,
      resolveCollectionPreviewState: (
        location: PIRCollectionProjectionLocation
      ) => collectionPreviewByLocation[collectionPreviewKey(location)],
      dispatchTrigger,
    },
    inspector: {
      isCollapsed: isInspectorCollapsed,
      selection,
      collectionPreview: selectedCollectionPreview,
      onToggleCollapse: () => setInspectorCollapsed((current) => !current),
      onSelectLocation: (location: PIRRenderLocation) => {
        setSelection(location);
        setInspectorCollapsed(false);
      },
      onCollectionPreviewChange: (preview: PIRCollectionPreviewInput) => {
        if (!selection) return;
        setCollectionPreviewByLocation((current) => ({
          ...current,
          [collectionPreviewKey(selection)]: preview,
        }));
      },
      onUpdateInstanceBindings: async (input: {
        documentId: string;
        instanceNodeId: string;
        bindings: PIRComponentInstanceBindings;
      }) => {
        const outcome = await updateInstanceBindings(input);
        setStatusMessage(
          outcome.status === 'applied'
            ? 'Component Instance bindings updated.'
            : outcome.message
        );
      },
      onUpdateCollection: async (input: {
        documentId: string;
        collection: PIRCollectionNode;
        regions: PIRCollectionRegions;
      }) => {
        const outcome = await updateCollection(input);
        setStatusMessage(
          outcome.status === 'applied' ? 'Collection updated.' : outcome.message
        );
      },
      onOpenDefinition: openComponentDefinition,
      onFindReferences: findComponentReferences,
      onOpenCodeArtifact: openCodeArtifact,
      onOpenCodeSlotDefinition: openCodeSlotDefinition,
      onExtract: () => setExtractionOpen(true),
      onStatus: setStatusMessage,
    },
    viewportBar: {
      interactionMode: resolvedBlueprintState.interactionMode,
      onInteractionModeChange: (interactionMode: 'design' | 'interactive') =>
        setBlueprintState(blueprintKey, { interactionMode }),
      onToggleInteractionMode: () =>
        setBlueprintState(blueprintKey, {
          interactionMode:
            resolvedBlueprintState.interactionMode === 'design'
              ? 'interactive'
              : 'design',
        }),
      viewportWidth: resolvedBlueprintState.viewportWidth,
      viewportHeight: resolvedBlueprintState.viewportHeight,
      onViewportWidthChange: (viewportWidth: string) =>
        setBlueprintState(blueprintKey, { viewportWidth }),
      onViewportHeightChange: (viewportHeight: string) =>
        setBlueprintState(blueprintKey, { viewportHeight }),
      zoom: resolvedBlueprintState.zoom,
      zoomStep,
      onZoomChange: (zoom: number) =>
        setBlueprintState(blueprintKey, { zoom: clampZoom(zoom) }),
      onResetView: () =>
        setBlueprintState(blueprintKey, {
          viewportWidth: defaultViewportWidth,
          viewportHeight: defaultViewportHeight,
          zoom: VIEWPORT_ZOOM_RANGE.default,
          pan: { x: 80, y: 60 },
        }),
    },
  };
};
