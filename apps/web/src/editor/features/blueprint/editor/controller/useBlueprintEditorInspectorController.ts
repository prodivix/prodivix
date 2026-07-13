import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import {
  materializePirRoot,
  renameNodeId as renameUiGraphNodeId,
  updateUiGraphSubtree,
} from '@prodivix/pir';
import type { IconRef } from '@prodivix/pir-react-renderer';
import type { TriggerEntry } from '@/editor/features/blueprint/editor/inspector/InspectorContext.types';
import { createDefaultActionParams } from '@/pir/actions/registry';
import { isIconRef, resolveIconRef } from '@prodivix/pir-react-renderer';
import {
  selectActivePirDocument,
  selectActivePirDocumentRecord,
  selectActiveRouteNodeId,
  selectRouteManifest,
  selectWorkspace,
  selectWorkspaceDocumentsById,
  useEditorStore,
} from '@/editor/store/useEditorStore';
import type { WorkspaceRouteNode } from '@/editor/store/useEditorStore';
import { useAuthStore } from '@/auth/useAuthStore';
import {
  createNodeRenameTransaction,
  createNodeSubtreeRemovalTransaction,
  createWorkspaceCodeBindingTransaction,
  createWorkspaceCodeSourceUpdateCommand,
  type WorkspaceCodeDocumentContent,
  type WorkspaceDocument,
  type WorkspaceRouteIntent,
} from '@prodivix/workspace';
import {
  enqueueWorkspaceRouteIntentOutboxAndDispatch,
  executeWorkspaceCommandOutboxAndAdopt,
  executeWorkspaceOperationOutboxAndAdopt,
} from '@/editor/workspaceSync/workspaceVfsOutboxExecutor';
import { isLocalProjectId } from '@/editor/localProjectStore';
import {
  composeRouteManifestWithModules,
  findRouteNodeParentInfo,
  flattenRouteManifest,
  validateRouteManifest,
} from '@prodivix/router';
import {
  createDefaultBinding,
  createDefaultTimeline,
  normalizeAnimationDefinition,
} from '@prodivix/animation';
import { createBrowserAnimationIdFactory } from '@prodivix/runtime-browser';
import { resolveLinkCapability } from '@prodivix/pir-react-renderer';
import {
  getLayoutPatternId,
  isLayoutPatternRootNode,
} from '@/editor/features/blueprint/layoutPatterns/dataAttributes';
import {
  usePaletteRegistrySnapshot,
  useWebExtensionRegistrySnapshot,
} from '@/plugins/platform';
import { resolveInspectorPanels } from '@/editor/features/blueprint/editor/inspector/panels/registry';
import { resolveInspectorComponentMeta } from '@/editor/features/blueprint/editor/inspector/meta/componentMetaProjection';
import {
  createMountedCssDocumentId,
  createMountedCssPath,
  createMountedCssSlotId,
  resolveMountedCssEntries,
  upsertMountedCssBinding,
} from '@/editor/features/blueprint/editor/inspector/components/classProtocol/mountedCss';
import { useMountedCssEditorState } from '@/editor/features/blueprint/editor/inspector/components/classProtocol/useMountedCssEditorState';
import { getPrimaryTextField } from '@/editor/features/blueprint/editor/model/blueprintText';
import { findNodeById } from '@/editor/features/blueprint/editor/controller/inspectorUtils';
let persistedExpandedPanels: Record<string, boolean> = {};

const createIntentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const useBlueprintEditorInspectorController = () => {
  const animationIdFactory = useMemo(
    () => createBrowserAnimationIdFactory(),
    []
  );
  const { t } = useTranslation('blueprint');
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => t(key, options),
    [t]
  );
  const navigate = useNavigate();
  const { projectId } = useParams();
  const blueprintKey = projectId ?? 'global';
  const token = useAuthStore((state) => state.token);
  const workspace = useEditorStore(selectWorkspace)!;
  const activePirDocument = useEditorStore(selectActivePirDocumentRecord)!;
  const pirDoc = useEditorStore(selectActivePirDocument)!;
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
  const workspaceDocumentsById = useEditorStore(selectWorkspaceDocumentsById);
  const workspaceCapabilities = useEditorStore(
    (state) => state.workspaceCapabilities
  );
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const routeManifest = useEditorStore(selectRouteManifest)!;
  const activeRouteNodeId = useEditorStore(selectActiveRouteNodeId);
  const applyRouteIntent = useEditorStore((state) => state.applyRouteIntent);
  const setBlueprintState = useEditorStore((state) => state.setBlueprintState);
  const selectedId = useEditorStore(
    (state) => state.blueprintStateByProject[blueprintKey]?.selectedId
  );
  const pirRoot = useMemo(() => materializePirRoot(pirDoc), [pirDoc]);
  const selectedNode = useMemo(
    () => (selectedId ? findNodeById(pirRoot, selectedId) : null),
    [pirRoot, selectedId]
  );
  const selectedParentNode = useMemo(() => {
    if (!selectedId) return null;
    return findParentNodeById(pirRoot, selectedId);
  }, [pirRoot, selectedId]);
  const routeOptions = useMemo(
    () =>
      flattenRouteManifest(
        composeRouteManifestWithModules(routeManifest).manifest.root,
        '/'
      ),
    [routeManifest]
  );
  const activeRouteDetails = useMemo(() => {
    if (!activeRouteNodeId) return null;
    const routeItem = routeOptions.find(
      (route) => route.id === activeRouteNodeId
    );
    if (!routeItem) return null;
    const parentInfo = findRouteNodeParentInfo(
      routeManifest.root,
      activeRouteNodeId
    );
    const node = routeItem.node;
    const issues = validateRouteManifest({
      manifest: routeManifest,
      documentExists: (documentId) =>
        Boolean(workspaceDocumentsById[documentId]),
      codeArtifactExists: (artifactId) =>
        workspaceDocumentsById[artifactId]?.type === 'code',
    }).filter((issue) => issue.routeNodeId === activeRouteNodeId);
    const runtime = node.runtime ?? {};
    const runtimeRefs = [
      { kind: 'loader' as const, reference: runtime.loaderRef },
      { kind: 'action' as const, reference: runtime.actionRef },
      { kind: 'guard' as const, reference: runtime.guardRef },
    ]
      .filter((item) => item.reference?.artifactId?.trim())
      .map((item) => ({
        kind: item.kind,
        artifactId: item.reference?.artifactId ?? '',
        ...(item.reference?.exportName
          ? { exportName: item.reference.exportName }
          : {}),
        ...(item.reference?.symbolId
          ? { symbolId: item.reference.symbolId }
          : {}),
      }));

    return {
      id: node.id,
      path: routeItem.path,
      label: routeItem.label,
      segment: node.segment?.trim() ?? '',
      depth: routeItem.depth,
      treeIndex: parentInfo?.parent ? parentInfo.index : null,
      ...(routeItem.parentId ? { parentId: routeItem.parentId } : {}),
      isIndexRoute: node.index === true,
      ...(node.pageDocId ? { pageDocId: node.pageDocId } : {}),
      ...(node.layoutDocId ? { layoutDocId: node.layoutDocId } : {}),
      ...(node.outletNodeId ? { defaultOutletNodeId: node.outletNodeId } : {}),
      outletBindings: Object.entries(node.outletBindings ?? {}).map(
        ([name, binding]) => ({
          name,
          outletNodeId: binding.outletNodeId,
          ...(binding.pageDocId ? { pageDocId: binding.pageDocId } : {}),
        })
      ),
      runtimeRefs,
      issues,
    };
  }, [activeRouteNodeId, routeManifest, routeOptions, workspaceDocumentsById]);
  const outletRouteNodeId = useMemo(() => {
    if (!selectedNode || selectedNode.type !== 'PdxOutlet') return '';
    const findBinding = (node: WorkspaceRouteNode): string => {
      if (node?.outletNodeId === selectedNode.id) return node.id;
      const children = node.children ?? [];
      for (const child of children) {
        const found = findBinding(child);
        if (found) return found;
      }
      return '';
    };
    return findBinding(routeManifest.root);
  }, [routeManifest.root, selectedNode]);
  const canAttachLayoutToActiveRoute = Boolean(
    activeRouteDetails && !activeRouteDetails.layoutDocId && !workspaceReadonly
  );
  const canDetachLayoutFromActiveRoute = Boolean(
    activeRouteDetails?.layoutDocId && !workspaceReadonly
  );
  const persistRouteIntent = useCallback(
    async (intent: WorkspaceRouteIntent) => {
      if (isLocalProjectId(projectId)) {
        return Boolean(applyRouteIntent(intent));
      }
      const currentWorkspace = useEditorStore.getState().workspace;
      if (!token || !currentWorkspace) return false;
      const outcome = await enqueueWorkspaceRouteIntentOutboxAndDispatch({
        workspace: currentWorkspace,
        intent,
      });
      if (outcome.status === 'rejected') {
        console.warn('[route] workspace operation rejected', outcome.message);
        return false;
      }
      return true;
    },
    [applyRouteIntent, projectId, token]
  );
  const bindOutletToRoute = useCallback(
    (routeNodeId: string, outletNodeId: string | undefined) => {
      const normalizedRouteNodeId = routeNodeId.trim();
      if (!normalizedRouteNodeId) return;
      const normalizedOutletNodeId = outletNodeId?.trim();
      void persistRouteIntent(
        normalizedOutletNodeId
          ? {
              type: 'bind-outlet',
              routeNodeId: normalizedRouteNodeId,
              outletNodeId: normalizedOutletNodeId,
            }
          : { type: 'unbind-outlet', routeNodeId: normalizedRouteNodeId }
      );
    },
    [persistRouteIntent]
  );
  const attachLayoutToActiveRoute = useCallback(() => {
    if (!activeRouteDetails || !canAttachLayoutToActiveRoute) return;
    void persistRouteIntent({
      type: 'attach-layout',
      routeNodeId: activeRouteDetails.id,
    });
  }, [activeRouteDetails, canAttachLayoutToActiveRoute, persistRouteIntent]);
  const detachLayoutFromActiveRoute = useCallback(() => {
    if (!activeRouteDetails || !canDetachLayoutFromActiveRoute) return;
    void persistRouteIntent({
      type: 'detach-layout',
      routeNodeId: activeRouteDetails.id,
    });
  }, [activeRouteDetails, canDetachLayoutFromActiveRoute, persistRouteIntent]);
  const matchedPanels = useMemo(
    () => (selectedNode ? resolveInspectorPanels(selectedNode, 'style') : []),
    [selectedNode]
  );
  const primaryTextField = useMemo(
    () => (selectedNode ? getPrimaryTextField(selectedNode) : null),
    [selectedNode]
  );
  const paletteSnapshot = usePaletteRegistrySnapshot();
  const extensionSnapshot = useWebExtensionRegistrySnapshot();
  const componentMeta = useMemo(
    () =>
      resolveInspectorComponentMeta(
        selectedNode?.type,
        paletteSnapshot,
        extensionSnapshot
      ),
    [extensionSnapshot, paletteSnapshot, selectedNode?.type]
  );
  const [draftId, setDraftId] = useState('');
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(
    () => ({ ...persistedExpandedPanels })
  );
  const [isIconPickerOpen, setIconPickerOpen] = useState(false);
  const allIds = useMemo(
    () => new Set(Object.keys(pirDoc.ui.graph.nodesById)),
    [pirDoc.ui.graph.nodesById]
  );
  const dataModelFieldPaths = useMemo(() => {
    if (!selectedId) return [];
    const nodePath = findNodePathById(pirRoot, selectedId);
    if (!nodePath.length) return [];
    for (let index = nodePath.length - 1; index >= 0; index -= 1) {
      const mountedDataModel = extractMountedDataModel(nodePath[index]);
      if (mountedDataModel) {
        return collectDataModelFieldPaths(mountedDataModel);
      }
    }
    return [];
  }, [pirRoot, selectedId]);
  const animationDefinition = useMemo(
    () =>
      normalizeAnimationDefinition(pirDoc.animation) ?? {
        version: 1 as const,
        timelines: [],
      },
    [pirDoc.animation]
  );
  const mountedAnimationBindingCount = useMemo(() => {
    const targetNodeId = selectedNode?.id?.trim();
    if (!targetNodeId) return 0;
    return animationDefinition.timelines.reduce((count, timeline) => {
      const mountedCount = timeline.bindings.reduce((innerCount, binding) => {
        return binding.targetNodeId.trim() === targetNodeId
          ? innerCount + 1
          : innerCount;
      }, 0);
      return count + mountedCount;
    }, 0);
  }, [animationDefinition.timelines, selectedNode?.id]);
  const isAnimationMounted = mountedAnimationBindingCount > 0;
  const hasAnimationDefinition = animationDefinition.timelines.length > 0;
  const canOpenAnimationEditor = Boolean(projectId?.trim());

  useEffect(() => {
    setDraftId(selectedNode?.id ?? '');
  }, [selectedNode?.id]);

  useEffect(() => {
    if (!matchedPanels.length) return;
    setExpandedPanels((current) => {
      let changed = false;
      const next = { ...current };
      matchedPanels.forEach((panel) => {
        if (next[panel.key] === undefined) {
          next[panel.key] = true;
          changed = true;
        }
      });
      if (changed) {
        persistedExpandedPanels = { ...next };
      }
      return changed ? next : current;
    });
  }, [matchedPanels]);

  useEffect(() => {
    if (!selectedNode || !isLayoutPatternRootNode(selectedNode)) return;
    setExpandedPanels((current) => {
      if (current['layout-pattern'] === true) return current;
      const next = {
        ...current,
        'layout-pattern': true,
      };
      persistedExpandedPanels = { ...next };
      return next;
    });
  }, [selectedNode]);

  useEffect(() => {
    setIconPickerOpen(false);
  }, [selectedNode?.id]);

  const selectedIconRef = useMemo<IconRef | null>(() => {
    if (!selectedNode) return null;
    const props = selectedNode.props as Record<string, unknown> | undefined;
    const directRef = props?.iconRef;
    if (isIconRef(directRef)) return directRef;
    if (typeof props?.iconName === 'string') {
      return {
        provider:
          typeof props?.iconProvider === 'string'
            ? props.iconProvider
            : 'lucide',
        name: props.iconName,
      };
    }
    return null;
  }, [selectedNode]);
  const selectedIconComponent = useMemo(
    () => (selectedIconRef ? resolveIconRef(selectedIconRef) : null),
    [selectedIconRef]
  );
  const isIconNode =
    selectedNode?.type === 'PdxIcon' || selectedNode?.type === 'PdxIconLink';
  const supportsClassProtocol = selectedNode?.type !== 'container';
  const classNameValue =
    typeof selectedNode?.props?.className === 'string'
      ? selectedNode.props.className
      : '';
  const mountedCssEntries = useMemo(
    () =>
      selectedNode
        ? resolveMountedCssEntries(selectedNode, workspaceDocumentsById)
        : [],
    [selectedNode, workspaceDocumentsById]
  );
  const SelectedIconComponent = selectedIconComponent;
  const linkCapability = useMemo(
    () => resolveLinkCapability(selectedNode),
    [selectedNode]
  );
  const linkPropKey = linkCapability?.destinationProp ?? null;
  const linkProps = (selectedNode?.props ?? {}) as Record<string, unknown>;
  const linkDestination =
    linkPropKey && typeof linkProps[linkPropKey] === 'string'
      ? linkProps[linkPropKey]
      : '';
  const targetPropKey = linkCapability?.targetProp ?? 'target';
  const relPropKey = linkCapability?.relProp ?? 'rel';
  const titlePropKey = linkCapability?.titleProp ?? 'title';
  const linkTarget =
    typeof linkProps[targetPropKey] === 'string' &&
    (linkProps[targetPropKey] === '_self' ||
      linkProps[targetPropKey] === '_blank')
      ? (linkProps[targetPropKey] as '_self' | '_blank')
      : '_self';
  const linkRel =
    typeof linkProps[relPropKey] === 'string'
      ? (linkProps[relPropKey] as string)
      : '';
  const linkTitle =
    typeof linkProps[titlePropKey] === 'string'
      ? (linkProps[titlePropKey] as string)
      : '';

  const trimmedDraftId = draftId.trim();
  const isDuplicate =
    Boolean(trimmedDraftId) &&
    Boolean(selectedNode?.id) &&
    trimmedDraftId !== selectedNode?.id &&
    allIds.has(trimmedDraftId);
  const isDirty =
    Boolean(selectedNode?.id) && trimmedDraftId !== selectedNode?.id;
  const canApply =
    Boolean(selectedNode?.id) &&
    Boolean(trimmedDraftId) &&
    isDirty &&
    !isDuplicate;

  const updateSelectedNode = (
    updater: (node: ComponentNode) => ComponentNode
  ) => {
    if (workspaceReadonly) return;
    if (!selectedNode?.id) return;
    const currentSelectedId = selectedNode.id;
    const currentPatternId = getLayoutPatternId(selectedNode);
    const result = updateUiGraphSubtree(
      pirDoc.ui.graph,
      selectedNode.id,
      updater
    );
    if (!result.changed) return;
    const removedNodeIds = Object.keys(pirDoc.ui.graph.nodesById).filter(
      (nodeId) => !result.graph.nodesById[nodeId]
    );
    const applied = removedNodeIds.length
      ? (() => {
          const transaction = createNodeSubtreeRemovalTransaction({
            workspace,
            document: activePirDocument,
            afterGraph: result.graph,
            removedNodeIds,
            label: 'Update component subtree',
          });
          return transaction ? dispatchWorkspaceTransaction(transaction) : null;
        })()
      : updateActivePirDocument(
          (doc) => ({ ...doc, ui: { graph: result.graph } }),
          {
            namespace: 'core.blueprint',
            type: 'node.update',
            label: 'Update component',
          }
        );
    if (!applied?.ok) return;
    const nextRoot = materializePirRoot({
      ...pirDoc,
      ui: { graph: result.graph },
    });
    if (findNodeById(nextRoot, currentSelectedId) || !currentPatternId) return;
    const patternRootId = findLayoutPatternRootId(nextRoot, currentPatternId);
    if (patternRootId) {
      setBlueprintState(blueprintKey, { selectedId: patternRootId });
    }
  };

  const applyRename = () => {
    if (!selectedNode?.id || !canApply) return;
    const nextId = trimmedDraftId;
    const graph = renameUiGraphNodeId(pirDoc.ui.graph, selectedNode.id, nextId);
    if (graph === pirDoc.ui.graph) return;
    const transaction = createNodeRenameTransaction({
      workspace,
      document: activePirDocument,
      afterGraph: graph,
      nodeIdMap: { [selectedNode.id]: nextId },
    });
    if (!transaction) return;
    const applied = dispatchWorkspaceTransaction(transaction);
    if (!applied?.ok) return;
    setBlueprintState(blueprintKey, { selectedId: nextId });
  };

  const mountSelectedNodeToAnimation = useCallback(() => {
    const targetNodeId = selectedNode?.id?.trim();
    if (!targetNodeId) return;
    updateActivePirDocument((doc) => {
      const animation = normalizeAnimationDefinition(doc.animation) ?? {
        version: 1 as const,
        timelines: [],
      };
      const alreadyMounted = animation.timelines.some((timeline) =>
        timeline.bindings.some(
          (binding) => binding.targetNodeId.trim() === targetNodeId
        )
      );
      if (alreadyMounted) return doc;

      if (!animation.timelines.length) {
        const nextTimeline = createDefaultTimeline({
          idFactory: animationIdFactory,
        });
        nextTimeline.bindings = [
          createDefaultBinding({
            idFactory: animationIdFactory,
            targetNodeId,
          }),
        ];
        return {
          ...doc,
          animation: {
            ...animation,
            timelines: [nextTimeline],
            'x-animationEditor': {
              version: 1,
              ...(animation['x-animationEditor'] ?? {}),
              activeTimelineId: nextTimeline.id,
            },
          },
        };
      }

      const activeTimelineId = animation['x-animationEditor']?.activeTimelineId;
      const timelineIndex = animation.timelines.findIndex(
        (timeline) => timeline.id === activeTimelineId
      );
      const targetTimelineIndex = timelineIndex >= 0 ? timelineIndex : 0;
      const nextTimelines = animation.timelines.map((timeline, index) => {
        if (index !== targetTimelineIndex) return timeline;
        return {
          ...timeline,
          bindings: [
            ...timeline.bindings,
            createDefaultBinding({
              idFactory: animationIdFactory,
              targetNodeId,
            }),
          ],
        };
      });

      return {
        ...doc,
        animation: {
          ...animation,
          timelines: nextTimelines,
        },
      };
    });
  }, [selectedNode?.id, updateActivePirDocument]);

  const unmountSelectedNodeFromAnimation = useCallback(() => {
    const targetNodeId = selectedNode?.id?.trim();
    if (!targetNodeId) return;
    updateActivePirDocument((doc) => {
      const animation = normalizeAnimationDefinition(doc.animation);
      if (!animation) return doc;
      let changed = false;
      const nextTimelines = animation.timelines.map((timeline) => {
        const nextBindings = timeline.bindings.filter(
          (binding) => binding.targetNodeId.trim() !== targetNodeId
        );
        if (nextBindings.length === timeline.bindings.length) {
          return timeline;
        }
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
    });
  }, [selectedNode?.id, updateActivePirDocument]);

  const openAnimationEditor = useCallback(() => {
    const resolvedProjectId = projectId?.trim();
    if (!resolvedProjectId) return;
    navigate(`/editor/project/${resolvedProjectId}/animation`);
  }, [navigate, projectId]);

  const togglePanel = (key: string) => {
    setExpandedPanels((current) => {
      const next = {
        ...current,
        [key]: !(current[key] ?? true),
      };
      persistedExpandedPanels = { ...next };
      return next;
    });
  };

  const triggerEntries = useMemo(
    () =>
      Object.entries(selectedNode?.events ?? {}).map(([key, config]) => ({
        key,
        trigger: config.trigger ?? 'onClick',
        action: config.action ?? 'navigate',
        params:
          typeof config.params === 'object' && config.params
            ? config.params
            : {},
      })),
    [selectedNode?.events]
  );
  const hasOnClickTrigger = useMemo(
    () =>
      triggerEntries.some((entry) => {
        const normalized = entry.trigger.trim().toLowerCase();
        return normalized === 'onclick' || normalized === 'click';
      }),
    [triggerEntries]
  );
  const hasLinkTriggerConflict =
    Boolean(linkCapability) &&
    Boolean(linkDestination.trim()) &&
    hasOnClickTrigger &&
    linkCapability.triggerPolicy?.onClickWithDestination === 'warn';

  const addTrigger = () => {
    updateSelectedNode((current) => {
      const events = { ...(current.events ?? {}) };
      let index = 1;
      let nextKey = `trigger-${index}`;
      while (events[nextKey]) {
        index += 1;
        nextKey = `trigger-${index}`;
      }
      events[nextKey] = {
        trigger: 'onClick',
        action: 'navigate',
        params: createDefaultActionParams('navigate'),
      };
      return { ...current, events };
    });
  };

  const graphOptions = useMemo(() => {
    return normalizeGraphOptionsFromPir(pirDoc.logic?.graphs);
  }, [pirDoc.logic?.graphs]);

  const updateTrigger: (
    triggerKey: string,
    updater: (event: TriggerEntry) => TriggerEntry
  ) => void = (triggerKey, updater) => {
    updateSelectedNode((current) => {
      const rawEvent = current.events?.[triggerKey];
      if (!rawEvent) return current;
      const currentEvent: TriggerEntry = {
        key: triggerKey,
        trigger: rawEvent.trigger ?? 'onClick',
        action: rawEvent.action ?? 'navigate',
        params:
          typeof rawEvent.params === 'object' && rawEvent.params
            ? rawEvent.params
            : {},
      };
      const nextEvent = updater(currentEvent);
      return {
        ...current,
        events: {
          ...(current.events ?? {}),
          [triggerKey]: {
            trigger: nextEvent.trigger,
            action: nextEvent.action,
            params: nextEvent.params,
          },
        },
      };
    });
  };

  const removeTrigger = (triggerKey: string) => {
    updateSelectedNode((current) => {
      if (!current.events?.[triggerKey]) return current;
      const nextEvents = { ...(current.events ?? {}) };
      delete nextEvents[triggerKey];
      return {
        ...current,
        events: Object.keys(nextEvents).length ? nextEvents : undefined,
      };
    });
  };

  const applyIconRef = (iconRef: IconRef) => {
    updateSelectedNode((current) => {
      const nextProps: Record<string, unknown> = {
        ...(current.props ?? {}),
        iconRef,
      };
      delete nextProps.icon;
      delete nextProps.iconName;
      delete nextProps.iconProvider;
      return { ...current, props: nextProps };
    });
  };

  const saveMountedCssToVfs = useCallback(
    async (value: string) => {
      if (!selectedNode?.id) return false;
      if (workspaceReadonly) return false;
      const localWorkspace = isLocalProjectId(projectId);
      if (!localWorkspace && !token) return false;

      const existingEntry = mountedCssEntries[0];
      const source = value || '/* Mounted CSS */\n';
      if (existingEntry?.binding?.reference.artifactId) {
        const documentId = existingEntry.binding.reference.artifactId;
        const document = workspaceDocumentsById[documentId];
        if (!document || document.type !== 'code') return false;
        const issuedAt = new Date().toISOString();
        const command = createWorkspaceCodeSourceUpdateCommand({
          workspaceId,
          document,
          source,
          commandId: createIntentId(),
          issuedAt,
          mergeKey: `mounted-css-source:${documentId}`,
          label: 'Update mounted CSS',
        });
        if (!command) return true;
        if (localWorkspace) {
          return Boolean(dispatchWorkspaceCommand(command)?.ok);
        }
        if (!token) return false;

        const outcome = await executeWorkspaceCommandOutboxAndAdopt({
          token,
          workspace,
          command,
        });
        return outcome.status === 'applied';
      }

      if (
        workspaceCapabilitiesLoaded &&
        workspaceCapabilities['core.workspace.code-document.create@1.0'] !==
          true
      ) {
        return false;
      }

      const documentId = createMountedCssDocumentId(selectedNode.id);
      const path = createMountedCssPath(selectedNode.id);
      const issuedAt = new Date().toISOString();
      const codeContent: WorkspaceCodeDocumentContent = {
        language: 'css',
        source,
        metadata: {
          slotKind: 'mounted-css',
          ownerKind: 'pir-node',
          ownerId: selectedNode.id,
        },
      };
      const document: WorkspaceDocument = {
        id: documentId,
        type: 'code',
        name: path.split('/').at(-1) ?? `${documentId}.css`,
        path,
        contentRev: 1,
        metaRev: 1,
        content: codeContent,
      };
      const graphResult = updateUiGraphSubtree(
        pirDoc.ui.graph,
        selectedNode.id,
        (current) =>
          upsertMountedCssBinding(current, {
            slotId: createMountedCssSlotId(current.id),
            reference: { artifactId: documentId },
          })
      );
      if (!graphResult.changed) return false;
      const transaction = createWorkspaceCodeBindingTransaction({
        workspace,
        ownerDocument: activePirDocument,
        codeDocument: document,
        afterGraph: graphResult.graph,
        transactionId: createIntentId(),
        issuedAt,
        label: 'Create and bind mounted CSS',
      });
      if (!transaction) return false;
      if (localWorkspace) {
        return Boolean(dispatchWorkspaceTransaction(transaction)?.ok);
      }
      if (!token) return false;

      const outcome = await executeWorkspaceOperationOutboxAndAdopt({
        token,
        workspace,
        operation: { kind: 'transaction', transaction },
      });
      return outcome.status === 'applied';
    },
    [
      activePirDocument.id,
      dispatchWorkspaceCommand,
      dispatchWorkspaceTransaction,
      mountedCssEntries,
      pirDoc.ui.graph,
      projectId,
      selectedNode?.id,
      token,
      workspaceCapabilities,
      workspaceCapabilitiesLoaded,
      workspaceDocumentsById,
      workspace,
      workspaceId,
      workspaceReadonly,
    ]
  );

  const mountedCssEditor = useMountedCssEditorState({
    selectedNode,
    mountedCssEntries,
    updateSelectedNode,
    saveMountedCssToVfs,
  });

  const sectionContextValue = useMemo(
    () => ({
      t: translate,
      projectId,
      hasAnimationDefinition,
      isAnimationMounted,
      mountedAnimationBindingCount,
      mountSelectedNodeToAnimation,
      unmountSelectedNodeFromAnimation,
      openAnimationEditor,
      canOpenAnimationEditor,
      draftId,
      setDraftId,
      applyRename,
      selectedNode,
      isDirty,
      canApply,
      isDuplicate,
      primaryTextField,
      updateSelectedNode,
      componentMeta,
      openMountedCssEditor: mountedCssEditor.openMountedCssEditor,
      mountedCssEntries,
      matchedPanels,
      expandedPanels,
      togglePanel,
      supportsClassProtocol,
      classNameValue,
      isIconNode,
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
      addTrigger,
      hasLinkTriggerConflict,
      triggerEntries,
      graphOptions,
      updateTrigger,
      removeTrigger,
      routeOptions,
      activeRouteDetails,
      canAttachLayoutToActiveRoute,
      canDetachLayoutFromActiveRoute,
      attachLayoutToActiveRoute,
      detachLayoutFromActiveRoute,
      outletRouteNodeId,
      activeRouteNodeId,
      bindOutletToRoute,
      selectedParentNode,
      allNodeIds: Array.from(allIds),
      dataModelFieldPaths,
    }),
    [
      translate,
      projectId,
      hasAnimationDefinition,
      isAnimationMounted,
      mountedAnimationBindingCount,
      draftId,
      selectedNode,
      isDirty,
      canApply,
      isDuplicate,
      primaryTextField,
      componentMeta,
      mountedCssEditor.openMountedCssEditor,
      mountedCssEntries,
      matchedPanels,
      expandedPanels,
      mountSelectedNodeToAnimation,
      unmountSelectedNodeFromAnimation,
      openAnimationEditor,
      canOpenAnimationEditor,
      supportsClassProtocol,
      classNameValue,
      isIconNode,
      SelectedIconComponent,
      selectedIconRef,
      linkPropKey,
      linkDestination,
      linkTarget,
      linkRel,
      linkTitle,
      targetPropKey,
      relPropKey,
      titlePropKey,
      hasLinkTriggerConflict,
      triggerEntries,
      graphOptions,
      routeOptions,
      activeRouteDetails,
      canAttachLayoutToActiveRoute,
      canDetachLayoutFromActiveRoute,
      attachLayoutToActiveRoute,
      detachLayoutFromActiveRoute,
      outletRouteNodeId,
      activeRouteNodeId,
      bindOutletToRoute,
      selectedParentNode,
      allIds,
      dataModelFieldPaths,
    ]
  );

  return {
    t: translate,
    selectedNode,
    isIconPickerOpen,
    setIconPickerOpen,
    selectedIconRef,
    applyIconRef,
    sectionContextValue,
    mountedCssEditor,
  };
};

const findLayoutPatternRootId = (
  node: ComponentNode,
  patternId: string
): string | null => {
  if (isLayoutPatternRootNode(node) && getLayoutPatternId(node) === patternId) {
    return node.id;
  }
  const children = node.children ?? [];
  for (const child of children) {
    const found = findLayoutPatternRootId(child, patternId);
    if (found) return found;
  }
  return null;
};

const findParentNodeById = (
  node: ComponentNode,
  targetId: string
): ComponentNode | null => {
  const children = node.children ?? [];
  for (const child of children) {
    if (child.id === targetId) return node;
    const nested = findParentNodeById(child, targetId);
    if (nested) return nested;
  }
  return null;
};

const normalizeGraphOptionsFromPir = (
  source: unknown
): Array<{ id: string; label: string }> => {
  const graphEntries = Array.isArray(source) ? source : [];
  const normalizedOptions: Array<{ id: string; label: string }> = [];
  const usedIds = new Set<string>();
  graphEntries.forEach((entry, index) => {
    let id = '';
    let label = '';
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (!trimmed) return;
      id = trimmed;
      label = trimmed;
    } else if (isPlainObject(entry)) {
      const objectId = typeof entry.id === 'string' ? entry.id.trim() : '';
      const objectName =
        typeof entry.name === 'string' ? entry.name.trim() : '';
      id = objectId || objectName || `graph-${index + 1}`;
      label = objectName || id;
    } else {
      return;
    }
    if (usedIds.has(id)) {
      let dedupeIndex = 2;
      let nextId = `${id}-${dedupeIndex}`;
      while (usedIds.has(nextId)) {
        dedupeIndex += 1;
        nextId = `${id}-${dedupeIndex}`;
      }
      id = nextId;
    }
    usedIds.add(id);
    normalizedOptions.push({ id, label: label || id });
  });
  return normalizedOptions;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const LEGACY_DATA_MODEL_KEYS = [
  'x-prodivix-data-model',
  'x-prodivix-data-schema',
];

const extractMountedDataModel = (
  node: ComponentNode
): Record<string, unknown> | null => {
  if (!isPlainObject(node.data)) return null;
  if (isPlainObject(node.data.value)) {
    return node.data.value;
  }
  if (Array.isArray(node.data.value) && isPlainObject(node.data.value[0])) {
    return node.data.value[0] as Record<string, unknown>;
  }
  if (isPlainObject(node.data.extend)) {
    return node.data.extend;
  }
  for (const key of LEGACY_DATA_MODEL_KEYS) {
    const legacyValue = (node.data as Record<string, unknown>)[key];
    if (isPlainObject(legacyValue)) {
      return legacyValue;
    }
  }
  return null;
};

const collectDataModelFieldPaths = (
  schema: Record<string, unknown>,
  prefix = '',
  result: string[] = []
): string[] => {
  Object.entries(schema).forEach(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    result.push(path);
    if (Array.isArray(value)) {
      if (value.length > 0 && isPlainObject(value[0])) {
        collectDataModelFieldPaths(value[0], `${path}[0]`, result);
      }
      return;
    }
    if (isPlainObject(value)) {
      collectDataModelFieldPaths(value, path, result);
    }
  });
  return result;
};

const findNodePathById = (
  node: ComponentNode,
  targetId: string,
  path: ComponentNode[] = []
): ComponentNode[] => {
  const nextPath = [...path, node];
  if (node.id === targetId) return nextPath;
  for (const child of node.children ?? []) {
    const found = findNodePathById(child, targetId, nextPath);
    if (found.length) return found;
  }
  return [];
};
