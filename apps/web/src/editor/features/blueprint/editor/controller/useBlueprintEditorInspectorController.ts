import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  createDefaultBinding,
  createDefaultTimeline,
  createEmptyAnimationDefinition,
  type AnimationDefinition,
} from '@prodivix/animation';
import type {
  PIRCollectionNode,
  PIRElementNode,
  PIRUiGraph,
} from '@prodivix/pir';
import type { PIRRenderLocation } from '@prodivix/pir-react-renderer';
import {
  isIconRef,
  resolveIconRef,
  resolveLinkCapability,
  type IconRef,
} from '@prodivix/pir-react-renderer';
import {
  composeRouteManifestWithModules,
  findRouteNodeParentInfo,
  flattenRouteManifest,
  validateRouteManifest,
  type WorkspaceRouteNode,
} from '@prodivix/router';
import {
  createWorkspaceAnimationDocumentUpdateCommand,
  createWorkspaceCollectionInsertTransactionPlan,
  createWorkspaceCollectionUpdateTransactionPlan,
  createWorkspaceDocumentAtPathCommand,
  createWorkspacePIRCollectionUnwrapTransactionPlan,
  createWorkspacePIRElementBatchUpdateTransactionPlan,
  createWorkspacePIRElementUpdateTransactionPlan,
  createWorkspaceRouteIntentPlan,
  selectWorkspaceAnimationDocumentResults,
  selectWorkspaceNodeGraphDocumentResults,
  selectWorkspacePirDocument,
  type WorkspaceDocument,
  type WorkspaceRouteIntent,
  type WorkspaceSnapshot,
} from '@prodivix/workspace';
import { createBrowserAnimationIdFactory } from '@prodivix/runtime-browser';
import type {
  InspectorContextValue,
  TriggerEntry,
} from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import {
  collectReadonlyBindingDiagnostics,
  createBlueprintInspectorNodeView,
  toElementNode,
  type BlueprintInspectorNodeView,
} from '@/editor/features/blueprint/editor/inspector/projection';
import { resolveInspectorPanels } from '@/editor/features/blueprint/editor/inspector/panels/registry';
import { resolveInspectorComponentMeta } from '@/editor/features/blueprint/editor/inspector/meta/componentMetaProjection';
import { resolveMountedCssEntries } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/mountedCss';
import { useMountedCssEditorState } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/useMountedCssEditorState';
import { getPrimaryTextField } from '@/editor/features/blueprint/editor/model/blueprintText';
import { findNodePlacement } from '@/editor/features/blueprint/editor/model/tree';
import {
  usePaletteRegistrySnapshot,
  useWebExtensionRegistrySnapshot,
} from '@/plugins/platform';
import {
  selectActiveRouteNodeId,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import { createWorkspaceClientOperationId } from '@/editor/workspaceSync/workspaceOperationIdentity';
import { dispatchWorkspaceAuthoringOperation } from '@/editor/workspaceSync/workspaceAuthoringOperationDispatcher';

let persistedExpandedPanels: Record<string, boolean> = {};

type UseBlueprintEditorInspectorControllerInput = Readonly<{
  workspace: WorkspaceSnapshot;
  selection?: PIRRenderLocation;
  onStatus?: (message: string) => void;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const collectFieldPaths = (
  source: Record<string, unknown>,
  prefix = '',
  result: string[] = []
): string[] => {
  Object.entries(source).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push(path);
    if (Array.isArray(value)) {
      if (isRecord(value[0])) collectFieldPaths(value[0], `${path}[0]`, result);
    } else if (isRecord(value)) {
      collectFieldPaths(value, path, result);
    }
  });
  return result;
};

const readElementDataModel = (
  node: PIRElementNode | undefined
): Record<string, unknown> | undefined => {
  if (!node?.data) return undefined;
  if (node.data.value?.kind === 'literal' && isRecord(node.data.value.value)) {
    return node.data.value.value;
  }
  const extended = Object.fromEntries(
    Object.entries(node.data.extend ?? {}).flatMap(([key, binding]) =>
      binding.kind === 'literal' ? [[key, binding.value]] : []
    )
  );
  return Object.keys(extended).length > 0 ? extended : undefined;
};

const collectAncestorElementIds = (
  graph: PIRUiGraph,
  nodeId: string
): readonly string[] => {
  const result = [nodeId];
  const visited = new Set(result);
  let currentId = nodeId;
  while (true) {
    const placement = findNodePlacement(graph, currentId);
    if (!placement || visited.has(placement.parentId)) break;
    visited.add(placement.parentId);
    result.push(placement.parentId);
    currentId = placement.parentId;
  }
  return result;
};

const findParentCollection = (
  graph: PIRUiGraph,
  nodeId: string
): PIRCollectionNode | undefined => {
  const placement = findNodePlacement(graph, nodeId);
  if (!placement || placement.regionName !== 'item') return undefined;
  const parent = graph.nodesById[placement.parentId];
  return parent?.kind === 'collection' ? parent : undefined;
};

const uniqueCollectionId = (graph: PIRUiGraph, nodeId: string): string => {
  const base = `${nodeId}-collection`;
  let id = base;
  let index = 2;
  while (graph.nodesById[id]) {
    id = `${base}-${index}`;
    index += 1;
  }
  return id;
};

const createCollectionForNode = (
  graph: PIRUiGraph,
  nodeId: string,
  view: BlueprintInspectorNodeView
): PIRCollectionNode => {
  const id = uniqueCollectionId(graph, nodeId);
  const token = id.replace(/[^a-zA-Z0-9-]/g, '-');
  return {
    id,
    kind: 'collection',
    source: { kind: 'literal', value: [] },
    key: { kind: 'index' },
    symbols: {
      itemId: `${token}-item`,
      itemName: view.list?.itemAs?.trim() || 'item',
      indexId: `${token}-index`,
      indexName: view.list?.indexAs?.trim() || 'index',
      errorId: `${token}-error`,
    },
  };
};

const updateCollectionFromView = (
  collection: PIRCollectionNode,
  view: BlueprintInspectorNodeView
): PIRCollectionNode => {
  const arrayField = view.list?.arrayField?.trim();
  const source =
    collection.source.kind === 'binding' && arrayField
      ? {
          kind: 'binding' as const,
          value:
            'path' in collection.source.value
              ? { ...collection.source.value, path: arrayField }
              : collection.source.value,
        }
      : collection.source;
  return {
    ...collection,
    source,
    symbols: {
      ...collection.symbols,
      itemName: view.list?.itemAs?.trim() || collection.symbols.itemName,
      indexName: view.list?.indexAs?.trim() || collection.symbols.indexName,
    },
  };
};

const firstPlanIssue = (result: {
  issues: readonly { message: string }[];
}): string =>
  result.issues[0]?.message ?? 'The authoring operation was rejected.';

const findOutletRouteNodeId = (
  node: WorkspaceRouteNode,
  outletNodeId: string
): string => {
  if (node.outletNodeId === outletNodeId) return node.id;
  for (const child of node.children ?? []) {
    const found = findOutletRouteNodeId(child, outletNodeId);
    if (found) return found;
  }
  return '';
};

const createAnimationDocumentIdentity = (
  workspace: WorkspaceSnapshot
): Readonly<{ documentId: string; path: string }> => {
  const paths = new Set(
    Object.values(workspace.docsById).map((document) => document.path)
  );
  let index = 1;
  let path = `/animations/animation-${index}.pir-animation.json`;
  while (paths.has(path)) {
    index += 1;
    path = `/animations/animation-${index}.pir-animation.json`;
  }
  const token = createWorkspaceClientOperationId('animation-document')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .slice(0, 48);
  return { documentId: `animation-${token}`, path };
};

const toTriggerEntry = (
  key: string,
  event: NonNullable<BlueprintInspectorNodeView['events']>[string]
): TriggerEntry => ({
  key,
  trigger: event.trigger || 'onClick',
  action: event.action || 'navigate',
  params: isRecord(event.params) ? event.params : {},
  editable: event.editable !== false,
  ...(event.diagnostic ? { diagnostic: event.diagnostic } : {}),
});

const collectElementViews = (
  root: BlueprintInspectorNodeView,
  result = new Map<string, BlueprintInspectorNodeView>()
): ReadonlyMap<string, BlueprintInspectorNodeView> => {
  if (root.kind === 'element') result.set(root.id, root);
  root.children?.forEach((child) => collectElementViews(child, result));
  return result;
};

export const useBlueprintEditorInspectorController = ({
  workspace,
  selection,
  onStatus,
}: UseBlueprintEditorInspectorControllerInput) => {
  const { t } = useTranslation('blueprint');
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => t(key, options),
    [t]
  );
  const navigate = useNavigate();
  const { projectId } = useParams();
  const activeRouteNodeId = useEditorStore(selectActiveRouteNodeId);
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const setActiveDocumentId = useEditorStore(
    (state) => state.setActiveDocumentId
  );
  const animationIdFactory = useMemo(
    () => createBrowserAnimationIdFactory(),
    []
  );
  const paletteSnapshot = usePaletteRegistrySnapshot();
  const extensionSnapshot = useWebExtensionRegistrySnapshot();

  const read = useMemo(
    () => selectWorkspacePirDocument(workspace, selection?.documentId),
    [selection?.documentId, workspace]
  );
  const selectedElement =
    read?.status === 'valid' && selection
      ? read.decodedContent.ui.graph.nodesById[selection.nodeId]
      : undefined;
  const selectedCanonicalNode =
    selectedElement?.kind === 'element' ? selectedElement : undefined;
  const selectedNode = useMemo(
    () =>
      read?.status === 'valid' && selection && selectedCanonicalNode
        ? createBlueprintInspectorNodeView(
            read.document.id,
            read.decodedContent,
            selection.nodeId
          )
        : null,
    [read, selectedCanonicalNode, selection]
  );
  const selectedParentNode = useMemo(() => {
    if (!selection || read?.status !== 'valid') return null;
    const placement = findNodePlacement(
      read.decodedContent.ui.graph,
      selection.nodeId
    );
    return placement
      ? createBlueprintInspectorNodeView(
          read.document.id,
          read.decodedContent,
          placement.parentId
        )
      : null;
  }, [read, selection]);

  const report = useCallback(
    (message: string) => {
      onStatus?.(message);
    },
    [onStatus]
  );
  const dispatchOperation = useCallback(
    async (
      operation: Parameters<
        typeof dispatchWorkspaceAuthoringOperation
      >[0]['operation']
    ) => {
      const current = useEditorStore.getState().workspace;
      const target = current?.id === workspace.id ? current : workspace;
      const outcome = await dispatchWorkspaceAuthoringOperation({
        workspace: target,
        readonly: useEditorStore.getState().workspaceReadonly,
        operation,
      });
      if (outcome.status === 'rejected') report(outcome.message);
      return outcome.status === 'applied';
    },
    [report, workspace]
  );

  const updateSelectedNode = useCallback(
    (
      updater: (node: BlueprintInspectorNodeView) => BlueprintInspectorNodeView
    ) => {
      if (!selection || workspaceReadonly) return;
      const currentWorkspace = useEditorStore.getState().workspace;
      const source =
        currentWorkspace?.id === workspace.id ? currentWorkspace : workspace;
      const currentRead = selectWorkspacePirDocument(
        source,
        selection.documentId
      );
      if (currentRead?.status !== 'valid') return;
      const currentNode =
        currentRead.decodedContent.ui.graph.nodesById[selection.nodeId];
      if (currentNode?.kind !== 'element') return;
      const currentView = createBlueprintInspectorNodeView(
        currentRead.document.id,
        currentRead.decodedContent,
        currentNode.id
      );
      if (!currentView) return;
      const nextView = updater(currentView);
      const currentCollection = findParentCollection(
        currentRead.decodedContent.ui.graph,
        currentNode.id
      );

      if (!currentCollection && nextView.list) {
        const placement = findNodePlacement(
          currentRead.decodedContent.ui.graph,
          currentNode.id
        );
        if (!placement) {
          report('The selected node cannot be promoted to a Collection here.');
          return;
        }
        const plan = createWorkspaceCollectionInsertTransactionPlan({
          workspace: source,
          baseRevision: source.workspaceRev,
          transactionId: createWorkspaceClientOperationId('collection-wrap'),
          issuedAt: new Date().toISOString(),
          documentId: currentRead.document.id,
          collection: createCollectionForNode(
            currentRead.decodedContent.ui.graph,
            currentNode.id,
            nextView
          ),
          placement,
          regions: { item: [currentNode.id] },
        });
        if (plan.status === 'rejected') {
          report(firstPlanIssue(plan));
          return;
        }
        void dispatchOperation({
          kind: 'transaction',
          transaction: plan.plan.transaction,
        });
        return;
      }

      if (currentCollection && !nextView.list) {
        const plan = createWorkspacePIRCollectionUnwrapTransactionPlan({
          workspace: source,
          baseRevision: source.workspaceRev,
          transactionId: createWorkspaceClientOperationId('collection-unwrap'),
          issuedAt: new Date().toISOString(),
          documentId: currentRead.document.id,
          nodeId: currentCollection.id,
        });
        if (plan.status === 'rejected') {
          report(firstPlanIssue(plan));
          return;
        }
        void dispatchOperation({
          kind: 'transaction',
          transaction: plan.plan.transaction,
        });
        return;
      }

      if (currentCollection && nextView.list) {
        const nextCollection = updateCollectionFromView(
          currentCollection,
          nextView
        );
        if (!jsonEqual(currentCollection, nextCollection)) {
          const regions =
            currentRead.decodedContent.ui.graph.regionsById?.[
              currentCollection.id
            ];
          const plan = createWorkspaceCollectionUpdateTransactionPlan({
            workspace: source,
            baseRevision: source.workspaceRev,
            transactionId:
              createWorkspaceClientOperationId('collection-update'),
            issuedAt: new Date().toISOString(),
            documentId: currentRead.document.id,
            collection: nextCollection,
            regions: {
              item: regions?.item ?? [],
              ...(regions?.empty ? { empty: regions.empty } : {}),
              ...(regions?.loading ? { loading: regions.loading } : {}),
              ...(regions?.error ? { error: regions.error } : {}),
            },
          });
          if (plan.status === 'rejected') {
            report(firstPlanIssue(plan));
            return;
          }
          void dispatchOperation({
            kind: 'transaction',
            transaction: plan.plan.transaction,
          });
          return;
        }
      }

      const currentViews = collectElementViews(currentView);
      const nextViews = collectElementViews(nextView);
      const updates = [...nextViews.entries()].flatMap(([nodeId, view]) => {
        if (!currentViews.has(nodeId)) return [];
        const canonical = currentRead.decodedContent.ui.graph.nodesById[nodeId];
        if (canonical?.kind !== 'element') return [];
        const nextElement = toElementNode(view, canonical);
        return jsonEqual(canonical, nextElement)
          ? []
          : [{ nodeId, node: nextElement }];
      });
      if (updates.length === 0) return;
      const envelope = {
        workspace: source,
        baseRevision: source.workspaceRev,
        transactionId: createWorkspaceClientOperationId(
          updates.length === 1
            ? 'pir-element-update'
            : 'pir-element-batch-update'
        ),
        issuedAt: new Date().toISOString(),
        documentId: currentRead.document.id,
      };
      const plan =
        updates.length === 1
          ? createWorkspacePIRElementUpdateTransactionPlan({
              ...envelope,
              nodeId: updates[0].nodeId,
              node: updates[0].node,
            })
          : createWorkspacePIRElementBatchUpdateTransactionPlan({
              ...envelope,
              updates,
            });
      if (plan.status === 'rejected') {
        report(firstPlanIssue(plan));
        return;
      }
      void dispatchOperation({
        kind: 'transaction',
        transaction: plan.plan.transaction,
      });
    },
    [dispatchOperation, report, selection, workspace, workspaceReadonly]
  );

  const routeManifest = workspace.routeManifest;
  const composedRouteManifest = useMemo(
    () => composeRouteManifestWithModules(routeManifest).manifest,
    [routeManifest]
  );
  const routeItems = useMemo(
    () => flattenRouteManifest(composedRouteManifest),
    [composedRouteManifest]
  );
  const routeOptions = useMemo(
    () => routeItems.map((item) => ({ id: item.id, path: item.path })),
    [routeItems]
  );
  const activeRouteDetails = useMemo(() => {
    if (!activeRouteNodeId) return null;
    const routeItem = routeItems.find((item) => item.id === activeRouteNodeId);
    if (!routeItem) return null;
    const node = routeItem.node;
    const parent = findRouteNodeParentInfo(
      composedRouteManifest.root,
      activeRouteNodeId
    );
    const issues = validateRouteManifest({
      manifest: routeManifest,
      documentExists: (documentId) => Boolean(workspace.docsById[documentId]),
      codeArtifactExists: (artifactId) =>
        workspace.docsById[artifactId]?.type === 'code',
    }).filter((issue) => issue.routeNodeId === activeRouteNodeId);
    const runtime = node.runtime ?? {};
    const runtimeRefs = [
      { kind: 'loader' as const, reference: runtime.loaderRef },
      { kind: 'action' as const, reference: runtime.actionRef },
      { kind: 'guard' as const, reference: runtime.guardRef },
    ].flatMap(({ kind, reference }) =>
      reference?.artifactId ? [{ kind, ...reference }] : []
    );
    return {
      id: node.id,
      path: routeItem.path,
      label: routeItem.label,
      segment: node.segment ?? '',
      depth: routeItem.depth,
      treeIndex: parent?.parent ? parent.index : null,
      ...(routeItem.parentId ? { parentId: routeItem.parentId } : {}),
      isIndexRoute: node.index === true,
      ...(node.pageDocId ? { pageDocId: node.pageDocId } : {}),
      ...(node.layoutDocId ? { layoutDocId: node.layoutDocId } : {}),
      ...(node.outletNodeId ? { defaultOutletNodeId: node.outletNodeId } : {}),
      outletBindings: Object.entries(node.outletBindings ?? {}).map(
        ([name, binding]) => ({ name, ...binding })
      ),
      runtimeRefs,
      issues,
    };
  }, [
    activeRouteNodeId,
    composedRouteManifest.root,
    routeItems,
    routeManifest,
    workspace.docsById,
  ]);

  const persistRouteIntent = useCallback(
    (intent: WorkspaceRouteIntent) => {
      const current = useEditorStore.getState().workspace;
      const source = current?.id === workspace.id ? current : workspace;
      const plan = createWorkspaceRouteIntentPlan(source, intent, {
        id: createWorkspaceClientOperationId('route-intent'),
        issuedAt: new Date().toISOString(),
      });
      if (!plan) {
        report('The route operation could not be planned.');
        return;
      }
      void dispatchOperation(plan);
    },
    [dispatchOperation, report, workspace]
  );
  const outletRouteNodeId =
    selectedNode?.type === 'PdxOutlet'
      ? findOutletRouteNodeId(composedRouteManifest.root, selectedNode.id)
      : '';
  const canAttachLayoutToActiveRoute = Boolean(
    activeRouteDetails && !activeRouteDetails.layoutDocId && !workspaceReadonly
  );
  const canDetachLayoutFromActiveRoute = Boolean(
    activeRouteDetails?.layoutDocId && !workspaceReadonly
  );

  const animationRead = useMemo(
    () =>
      selection
        ? selectWorkspaceAnimationDocumentResults(workspace).find(
            (result) =>
              result.status === 'valid' &&
              result.decodedContent.target.documentId === selection.documentId
          )
        : undefined,
    [selection, workspace]
  );
  const animationDefinition =
    animationRead?.status === 'valid'
      ? animationRead.decodedContent
      : createEmptyAnimationDefinition({
          targetDocumentId: selection?.documentId ?? workspace.id,
        });
  const mountedAnimationBindingCount = selectedNode
    ? animationDefinition.timelines.reduce(
        (total, timeline) =>
          total +
          timeline.bindings.filter(
            (binding) => binding.targetNodeId === selectedNode.id
          ).length,
        0
      )
    : 0;
  const isAnimationMounted = mountedAnimationBindingCount > 0;
  const hasAnimationDefinition = animationDefinition.timelines.length > 0;

  const applyAnimationDefinition = useCallback(
    async (after: AnimationDefinition) => {
      if (!selection) return;
      const current = useEditorStore.getState().workspace;
      const source = current?.id === workspace.id ? current : workspace;
      const existing = selectWorkspaceAnimationDocumentResults(source).find(
        (result) =>
          result.status === 'valid' &&
          result.decodedContent.target.documentId === selection.documentId
      );
      if (existing?.status === 'valid') {
        const command = createWorkspaceAnimationDocumentUpdateCommand({
          workspace: source,
          documentId: existing.document.id,
          after,
          commandId: createWorkspaceClientOperationId('animation-update'),
          issuedAt: new Date().toISOString(),
        });
        if (!command) {
          report('The Animation update could not be planned.');
          return;
        }
        await dispatchOperation({ kind: 'command', command });
        return;
      }
      const identity = createAnimationDocumentIdentity(source);
      const document: WorkspaceDocument = {
        id: identity.documentId,
        type: 'pir-animation',
        path: identity.path,
        contentRev: 1,
        metaRev: 1,
        content: after,
      };
      const command = createWorkspaceDocumentAtPathCommand({
        workspace: source,
        document,
        commandId: createWorkspaceClientOperationId('animation-create'),
        issuedAt: new Date().toISOString(),
      });
      await dispatchOperation({ kind: 'command', command });
    },
    [dispatchOperation, report, selection, workspace]
  );

  const mountSelectedNodeToAnimation = useCallback(() => {
    if (!selectedNode || !selection) return;
    if (isAnimationMounted) return;
    let timelines = animationDefinition.timelines;
    let editorState = animationDefinition['x-animationEditor'];
    if (timelines.length === 0) {
      const timeline = createDefaultTimeline({ idFactory: animationIdFactory });
      timelines = [
        {
          ...timeline,
          bindings: [
            createDefaultBinding({
              idFactory: animationIdFactory,
              targetNodeId: selectedNode.id,
            }),
          ],
        },
      ];
      editorState = {
        version: 1,
        ...(editorState ?? {}),
        activeTimelineId: timeline.id,
      };
    } else {
      const activeId = editorState?.activeTimelineId;
      const targetIndex = Math.max(
        0,
        timelines.findIndex((timeline) => timeline.id === activeId)
      );
      timelines = timelines.map((timeline, index) =>
        index === targetIndex
          ? {
              ...timeline,
              bindings: [
                ...timeline.bindings,
                createDefaultBinding({
                  idFactory: animationIdFactory,
                  targetNodeId: selectedNode.id,
                }),
              ],
            }
          : timeline
      );
    }
    void applyAnimationDefinition({
      ...animationDefinition,
      timelines,
      ...(editorState ? { 'x-animationEditor': editorState } : {}),
    });
  }, [
    animationDefinition,
    animationIdFactory,
    applyAnimationDefinition,
    isAnimationMounted,
    selectedNode,
    selection,
  ]);
  const unmountSelectedNodeFromAnimation = useCallback(() => {
    if (!selectedNode || !isAnimationMounted) return;
    void applyAnimationDefinition({
      ...animationDefinition,
      timelines: animationDefinition.timelines.map((timeline) => ({
        ...timeline,
        bindings: timeline.bindings.filter(
          (binding) => binding.targetNodeId !== selectedNode.id
        ),
      })),
    });
  }, [
    animationDefinition,
    applyAnimationDefinition,
    isAnimationMounted,
    selectedNode,
  ]);
  const openAnimationEditor = useCallback(() => {
    const resolvedProjectId = projectId?.trim();
    if (!resolvedProjectId) return;
    if (animationRead?.status === 'valid') {
      setActiveDocumentId(animationRead.document.id);
    }
    navigate(`/editor/project/${resolvedProjectId}/animation`);
  }, [animationRead, navigate, projectId, setActiveDocumentId]);

  const graphOptions = useMemo(
    () =>
      selectWorkspaceNodeGraphDocumentResults(workspace)
        .filter((result) => result.status === 'valid')
        .map((result) => ({
          id: result.document.id,
          label: result.document.name || result.document.path,
        })),
    [workspace]
  );
  const triggerEntries = useMemo(
    () =>
      Object.entries(selectedNode?.events ?? {}).map(([key, event]) =>
        toTriggerEntry(key, event)
      ),
    [selectedNode?.events]
  );
  const hasOnClickTrigger = triggerEntries.some((entry) =>
    ['click', 'onclick'].includes(entry.trigger.trim().toLowerCase())
  );

  const [draftId, setDraftId] = useState('');
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(
    () => ({ ...persistedExpandedPanels })
  );
  const [isIconPickerOpen, setIconPickerOpen] = useState(false);
  useEffect(() => setDraftId(selectedNode?.id ?? ''), [selectedNode?.id]);
  useEffect(() => setIconPickerOpen(false), [selectedNode?.id]);

  const matchedPanels = useMemo(
    () => (selectedNode ? resolveInspectorPanels(selectedNode, 'style') : []),
    [selectedNode]
  );
  useEffect(() => {
    if (matchedPanels.length === 0) return;
    setExpandedPanels((current) => {
      const next = { ...current };
      let changed = false;
      matchedPanels.forEach((panel) => {
        if (next[panel.key] === undefined) {
          next[panel.key] = true;
          changed = true;
        }
      });
      if (changed) persistedExpandedPanels = next;
      return changed ? next : current;
    });
  }, [matchedPanels]);

  const allIds = useMemo(
    () =>
      read?.status === 'valid'
        ? Object.keys(read.decodedContent.ui.graph.nodesById)
        : [],
    [read]
  );
  const primaryTextField = useMemo(
    () => (selectedNode ? getPrimaryTextField(selectedNode) : null),
    [selectedNode]
  );
  const componentMeta = useMemo(
    () =>
      resolveInspectorComponentMeta(
        selectedNode?.type,
        paletteSnapshot,
        extensionSnapshot
      ),
    [extensionSnapshot, paletteSnapshot, selectedNode?.type]
  );
  const dataModelFieldPaths = useMemo(() => {
    if (!selection || read?.status !== 'valid') return [];
    for (const nodeId of collectAncestorElementIds(
      read.decodedContent.ui.graph,
      selection.nodeId
    )) {
      const node = read.decodedContent.ui.graph.nodesById[nodeId];
      const model = readElementDataModel(
        node?.kind === 'element' ? node : undefined
      );
      if (model) return collectFieldPaths(model);
    }
    return [];
  }, [read, selection]);

  const selectedIconRef = useMemo<IconRef | null>(() => {
    const direct = selectedNode?.props?.iconRef;
    if (isIconRef(direct)) return direct;
    const name = selectedNode?.props?.iconName;
    return typeof name === 'string'
      ? {
          provider:
            typeof selectedNode?.props?.iconProvider === 'string'
              ? selectedNode.props.iconProvider
              : 'lucide',
          name,
        }
      : null;
  }, [selectedNode]);
  const SelectedIconComponent = useMemo(
    () => (selectedIconRef ? resolveIconRef(selectedIconRef) : null),
    [selectedIconRef]
  );
  const linkCapability = useMemo(
    () => resolveLinkCapability(selectedCanonicalNode ?? null),
    [selectedCanonicalNode]
  );
  const linkProps = selectedNode?.props ?? {};
  const linkPropKey = linkCapability?.destinationProp ?? null;
  const targetPropKey = linkCapability?.targetProp ?? 'target';
  const relPropKey = linkCapability?.relProp ?? 'rel';
  const titlePropKey = linkCapability?.titleProp ?? 'title';
  const linkDestination =
    linkPropKey && typeof linkProps[linkPropKey] === 'string'
      ? linkProps[linkPropKey]
      : '';
  const linkTarget = linkProps[targetPropKey] === '_blank' ? '_blank' : '_self';
  const linkRel =
    typeof linkProps[relPropKey] === 'string' ? linkProps[relPropKey] : '';
  const linkTitle =
    typeof linkProps[titlePropKey] === 'string' ? linkProps[titlePropKey] : '';
  const mountedCssEntries = useMemo(
    () =>
      selectedNode
        ? resolveMountedCssEntries(
            selectedNode,
            selection?.documentId ?? '',
            workspace.docsById
          )
        : [],
    [selectedNode, selection?.documentId, workspace.docsById]
  );
  const mountedCssEditor = useMountedCssEditorState({
    selectedNode,
    mountedCssEntries,
    writeAvailable: false,
    diagnostic:
      'Mounted CSS is edited through the shared Code Authoring Environment.',
  });

  const togglePanel = useCallback((key: string) => {
    setExpandedPanels((current) => {
      const next = { ...current, [key]: !(current[key] ?? true) };
      persistedExpandedPanels = next;
      return next;
    });
  }, []);
  const trimmedDraftId = draftId.trim();
  const isDirty = Boolean(selectedNode && trimmedDraftId !== selectedNode.id);
  const isDuplicate =
    Boolean(trimmedDraftId) &&
    trimmedDraftId !== selectedNode?.id &&
    allIds.includes(trimmedDraftId);

  const sectionContextValue = useMemo<InspectorContextValue>(
    () => ({
      t: translate,
      projectId,
      selectedNode,
      updateSelectedNode,
      expandedPanels,
      togglePanel,
      readonly: workspaceReadonly,
      bindingDiagnostics: selectedCanonicalNode
        ? [...collectReadonlyBindingDiagnostics(selectedCanonicalNode)]
        : [],
      draftId,
      setDraftId,
      applyRename: () =>
        report(
          'Node identity changes require an impact and relocation plan and are not available here yet.'
        ),
      isDirty,
      canApply: false,
      isDuplicate,
      allNodeIds: allIds,
      primaryTextField,
      identityWriteAvailable: false,
      identityDiagnostic:
        'Identity changes require Workspace-wide impact and relocation analysis.',
      supportsClassProtocol: selectedNode?.type !== 'container',
      classNameValue:
        typeof selectedNode?.props?.className === 'string'
          ? selectedNode.props.className
          : '',
      mountedCssEntries,
      openMountedCssEditor: mountedCssEditor.openMountedCssEditor,
      codeAuthoringWriteAvailable: false,
      codeAuthoringDiagnostic:
        'Create and edit code-owned bindings in the shared Code Authoring Environment.',
      isIconNode:
        selectedNode?.type === 'PdxIcon' ||
        selectedNode?.type === 'PdxIconLink',
      SelectedIconComponent,
      selectedIconRef,
      setIconPickerOpen,
      linkPropKey,
      linkDestination,
      linkTarget,
      linkRel,
      linkTitle,
      targetPropKey,
      relPropKey,
      titlePropKey,
      routeOptions,
      outletRouteNodeId,
      activeRouteNodeId,
      bindOutletToRoute: (routeNodeId, outletNodeId) =>
        persistRouteIntent(
          outletNodeId?.trim()
            ? {
                type: 'bind-outlet',
                routeNodeId,
                outletNodeId: outletNodeId.trim(),
              }
            : { type: 'unbind-outlet', routeNodeId }
        ),
      selectedParentNode,
      componentMeta,
      dataModelFieldPaths,
      activeRouteDetails,
      canAttachLayoutToActiveRoute,
      canDetachLayoutFromActiveRoute,
      attachLayoutToActiveRoute: () => {
        if (activeRouteDetails && canAttachLayoutToActiveRoute) {
          persistRouteIntent({
            type: 'attach-layout',
            routeNodeId: activeRouteDetails.id,
          });
        }
      },
      detachLayoutFromActiveRoute: () => {
        if (activeRouteDetails && canDetachLayoutFromActiveRoute) {
          persistRouteIntent({
            type: 'detach-layout',
            routeNodeId: activeRouteDetails.id,
          });
        }
      },
      matchedPanels,
      hasAnimationDefinition,
      isAnimationMounted,
      mountedAnimationBindingCount,
      mountSelectedNodeToAnimation,
      unmountSelectedNodeFromAnimation,
      openAnimationEditor,
      canOpenAnimationEditor: Boolean(projectId?.trim()),
      animationWriteAvailable: !workspaceReadonly,
      animationDiagnostic: workspaceReadonly
        ? 'This Workspace is read-only.'
        : undefined,
      collectionWriteAvailable: !workspaceReadonly,
      collectionDiagnostic: workspaceReadonly
        ? 'This Workspace is read-only.'
        : undefined,
      addTrigger: () =>
        updateSelectedNode((current) => {
          const events = { ...(current.events ?? {}) };
          let index = 1;
          while (events[`trigger-${index}`]) index += 1;
          events[`trigger-${index}`] = {
            trigger: 'onClick',
            action: 'navigate',
            params: { to: '' },
            editable: true,
          };
          return { ...current, events };
        }),
      updateTrigger: (triggerKey, updater) =>
        updateSelectedNode((current) => {
          const raw = current.events?.[triggerKey];
          if (!raw || raw.editable === false) return current;
          const next = updater(toTriggerEntry(triggerKey, raw));
          return {
            ...current,
            events: {
              ...(current.events ?? {}),
              [triggerKey]: {
                trigger: next.trigger,
                action: next.action,
                params: next.params,
                editable: true,
              },
            },
          };
        }),
      removeTrigger: (triggerKey) =>
        updateSelectedNode((current) => {
          const raw = current.events?.[triggerKey];
          if (!raw || raw.editable === false) return current;
          const events = { ...(current.events ?? {}) };
          delete events[triggerKey];
          return {
            ...current,
            events: Object.keys(events).length > 0 ? events : undefined,
          };
        }),
      hasLinkTriggerConflict:
        Boolean(linkCapability) &&
        Boolean(linkDestination.trim()) &&
        hasOnClickTrigger &&
        linkCapability?.triggerPolicy?.onClickWithDestination === 'warn',
      triggerEntries,
      graphOptions,
    }),
    [
      SelectedIconComponent,
      activeRouteDetails,
      activeRouteNodeId,
      allIds,
      canAttachLayoutToActiveRoute,
      canDetachLayoutFromActiveRoute,
      componentMeta,
      dataModelFieldPaths,
      draftId,
      expandedPanels,
      graphOptions,
      hasAnimationDefinition,
      hasOnClickTrigger,
      isAnimationMounted,
      isDirty,
      isDuplicate,
      linkCapability,
      linkDestination,
      linkPropKey,
      linkRel,
      linkTarget,
      linkTitle,
      matchedPanels,
      mountSelectedNodeToAnimation,
      mountedAnimationBindingCount,
      mountedCssEditor.openMountedCssEditor,
      mountedCssEntries,
      openAnimationEditor,
      outletRouteNodeId,
      persistRouteIntent,
      primaryTextField,
      projectId,
      relPropKey,
      report,
      routeOptions,
      selectedCanonicalNode,
      selectedIconRef,
      selectedNode,
      selectedParentNode,
      targetPropKey,
      titlePropKey,
      togglePanel,
      translate,
      triggerEntries,
      unmountSelectedNodeFromAnimation,
      updateSelectedNode,
      workspaceReadonly,
    ]
  );

  return {
    t: translate,
    selectedNode,
    isIconPickerOpen,
    setIconPickerOpen,
    selectedIconRef,
    applyIconRef: (iconRef: IconRef) =>
      updateSelectedNode((current) => {
        const props: Record<string, unknown> = {
          ...(current.props ?? {}),
          iconRef,
        };
        delete props.icon;
        delete props.iconName;
        delete props.iconProvider;
        return { ...current, props };
      }),
    sectionContextValue,
    mountedCssEditor,
  };
};
