import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import type { ComponentNode } from '@prodivix/shared/types/pir';
import { materializePirRoot, normalizeTreeToUiGraph } from '@/pir/graph';
import type { IconRef } from '@/pir/renderer/iconRegistry';
import type { TriggerEntry } from '@/editor/features/design/inspector/InspectorContext.types';
import { createDefaultActionParams } from '@/pir/actions/registry';
import { isIconRef, resolveIconRef } from '@/pir/renderer/iconRegistry';
import { useEditorStore } from '@/editor/store/useEditorStore';
import type { WorkspaceRouteNode } from '@/editor/store/useEditorStore';
import { useAuthStore } from '@/auth/useAuthStore';
import { editorApi } from '@/editor/editorApi';
import { createWorkspaceCodeDocumentIntentRequest } from '@/workspace';
import { flattenRouteItems } from '@/editor/store/routeManifest';
import {
  createDefaultBinding,
  createDefaultTimeline,
  normalizeAnimationDefinition,
} from '@/editor/features/animation/animationEditorModel';
import { resolveLinkCapability } from '@/pir/renderer/capabilities';
import {
  getLayoutPatternId,
  isLayoutPatternRootNode,
} from '@/editor/features/design/blueprint/layoutPatterns/dataAttributes';
import { getExternalRuntimeMetaByType } from '@/editor/features/design/blueprint/external/runtime/metaStore';
import { resolveInspectorPanels } from '@/editor/features/design/inspector/panels/registry';
import {
  createMountedCssDocumentId,
  createMountedCssNodeId,
  createMountedCssPath,
  createMountedCssSlotId,
  resolveMountedCssEntries,
  upsertMountedCssBinding,
} from '@/editor/features/design/inspector/components/classProtocol/mountedCss';
import { useMountedCssEditorState } from '@/editor/features/design/inspector/components/classProtocol/useMountedCssEditorState';
import { getPrimaryTextField } from '@/editor/features/design/blueprint/editor/model/blueprintText';
import {
  collectIds,
  findNodeById,
  renameNodeId,
  updateNodeById,
} from '@/editor/features/design/blueprint/editor/controller/inspectorUtils';

let persistedExpandedPanels: Record<string, boolean> = {};

export const resetInspectorExpansionPersistence = () => {
  persistedExpandedPanels = {};
};

const createIntentId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `intent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

export const useBlueprintEditorInspectorController = () => {
  const { t } = useTranslation('blueprint');
  const translate = useCallback(
    (key: string, options?: Record<string, unknown>) => t(key, options),
    [t]
  );
  const navigate = useNavigate();
  const { projectId } = useParams();
  const blueprintKey = projectId ?? 'global';
  const token = useAuthStore((state) => state.token);
  const pirDoc = useEditorStore((state) => state.pirDoc);
  const updatePirDoc = useEditorStore((state) => state.updatePirDoc);
  const workspaceId = useEditorStore((state) => state.workspaceId);
  const workspaceRev = useEditorStore((state) => state.workspaceRev);
  const workspaceDocumentsById = useEditorStore(
    (state) => state.workspaceDocumentsById
  );
  const workspaceCapabilities = useEditorStore(
    (state) => state.workspaceCapabilities
  );
  const workspaceCapabilitiesLoaded = useEditorStore(
    (state) => state.workspaceCapabilitiesLoaded
  );
  const workspaceReadonly = useEditorStore((state) => state.workspaceReadonly);
  const applyWorkspaceMutation = useEditorStore(
    (state) => state.applyWorkspaceMutation
  );
  const routeManifest = useEditorStore((state) => state.routeManifest);
  const activeRouteNodeId = useEditorStore((state) => state.activeRouteNodeId);
  const bindOutletToRoute = useEditorStore((state) => state.bindOutletToRoute);
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
    () => flattenRouteItems(routeManifest.root, '/'),
    [routeManifest.root]
  );
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
  const matchedPanels = useMemo(
    () => (selectedNode ? resolveInspectorPanels(selectedNode, 'style') : []),
    [selectedNode]
  );
  const primaryTextField = useMemo(
    () => (selectedNode ? getPrimaryTextField(selectedNode) : null),
    [selectedNode]
  );
  const externalComponentItem = useMemo(() => {
    if (!selectedNode?.type) return null;
    return getExternalRuntimeMetaByType(selectedNode.type) ?? null;
  }, [selectedNode?.type]);
  const [draftId, setDraftId] = useState('');
  const [expandedPanels, setExpandedPanels] = useState<Record<string, boolean>>(
    () => ({ ...persistedExpandedPanels })
  );
  const [isIconPickerOpen, setIconPickerOpen] = useState(false);
  const allIds = useMemo(() => collectIds(pirRoot), [pirRoot]);
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
    updatePirDoc((doc) => {
      const root = materializePirRoot(doc);
      const result = updateNodeById(root, selectedNode.id, updater);
      if (!result.updated) return doc;
      const nextDoc = {
        ...doc,
        ui: { graph: normalizeTreeToUiGraph(result.node) },
      };
      const nextRoot = materializePirRoot(nextDoc);
      const keptSelection = findNodeById(nextRoot, currentSelectedId);
      if (keptSelection) return nextDoc;
      if (!currentPatternId) return nextDoc;
      const patternRootId = findLayoutPatternRootId(nextRoot, currentPatternId);
      if (patternRootId) {
        setBlueprintState(blueprintKey, { selectedId: patternRootId });
      }
      return nextDoc;
    });
  };

  const applyRename = () => {
    if (!selectedNode?.id || !canApply) return;
    const nextId = trimmedDraftId;
    updatePirDoc((doc) => {
      const nextRoot = renameNodeId(
        materializePirRoot(doc),
        selectedNode.id,
        nextId
      );
      return {
        ...doc,
        ui: { graph: normalizeTreeToUiGraph(nextRoot) },
      };
    });
    setBlueprintState(blueprintKey, { selectedId: nextId });
  };

  const mountSelectedNodeToAnimation = useCallback(() => {
    const targetNodeId = selectedNode?.id?.trim();
    if (!targetNodeId) return;
    updatePirDoc((doc) => {
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
        const nextTimeline = createDefaultTimeline(0);
        nextTimeline.bindings = [createDefaultBinding(0, targetNodeId)];
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
            createDefaultBinding(timeline.bindings.length, targetNodeId),
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
  }, [selectedNode?.id, updatePirDoc]);

  const unmountSelectedNodeFromAnimation = useCallback(() => {
    const targetNodeId = selectedNode?.id?.trim();
    if (!targetNodeId) return;
    updatePirDoc((doc) => {
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
  }, [selectedNode?.id, updatePirDoc]);

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
      if (!selectedNode?.id || !token || !workspaceId || workspaceRev == null) {
        return false;
      }
      if (workspaceReadonly) return false;
      if (
        workspaceCapabilitiesLoaded &&
        workspaceCapabilities['core.workspace.code-document.create@1.0'] !==
          true
      ) {
        return false;
      }

      const existingEntry = mountedCssEntries[0];
      const source = value || '/* Mounted CSS */\n';
      if (existingEntry?.binding?.reference.artifactId) {
        const documentId = existingEntry.binding.reference.artifactId;
        const document = workspaceDocumentsById[documentId];
        if (!document || document.type !== 'code') return false;
        const previousSource =
          typeof document.content === 'object' &&
          document.content !== null &&
          'source' in document.content &&
          typeof document.content.source === 'string'
            ? document.content.source
            : '';
        const mutation = await editorApi.patchWorkspaceDocument(
          token,
          workspaceId,
          documentId,
          {
            expectedContentRev: document.contentRev,
            command: {
              id: createIntentId(),
              namespace: 'core.code',
              type: 'source.update',
              version: '1.0',
              issuedAt: new Date().toISOString(),
              forwardOps: [{ op: 'replace', path: '/source', value: source }],
              reverseOps: [
                { op: 'replace', path: '/source', value: previousSource },
              ],
              target: { workspaceId, documentId },
            },
          }
        );
        applyWorkspaceMutation(mutation);
        return true;
      }

      const documentId = createMountedCssDocumentId(selectedNode.id);
      const request = createWorkspaceCodeDocumentIntentRequest({
        workspaceRev,
        intentId: createIntentId(),
        issuedAt: new Date().toISOString(),
        documentId,
        nodeId: createMountedCssNodeId(selectedNode.id),
        path: createMountedCssPath(selectedNode.id),
        content: {
          language: 'css',
          source,
          metadata: {
            slotKind: 'mounted-css',
            ownerKind: 'pir-node',
            ownerId: selectedNode.id,
          },
        },
      });
      const mutation = await editorApi.applyWorkspaceIntent(
        token,
        workspaceId,
        request
      );
      applyWorkspaceMutation(mutation);
      updateSelectedNode((current) =>
        upsertMountedCssBinding(current, {
          slotId: createMountedCssSlotId(current.id),
          reference: { artifactId: documentId },
        })
      );
      return true;
    },
    [
      applyWorkspaceMutation,
      mountedCssEntries,
      selectedNode?.id,
      token,
      updateSelectedNode,
      workspaceCapabilities,
      workspaceCapabilitiesLoaded,
      workspaceDocumentsById,
      workspaceId,
      workspaceReadonly,
      workspaceRev,
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
      externalComponentItem,
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
      externalComponentItem,
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
