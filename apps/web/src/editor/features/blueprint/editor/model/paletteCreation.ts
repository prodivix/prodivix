import type { BlueprintTemplateDescriptor } from '@prodivix/plugin-contracts';
import type {
  ComponentNode,
  ComponentNodeData,
  PIRDocument,
  UiGraph,
} from '@prodivix/shared/types/pir';
import type { PluginOwnerRef } from '@prodivix/plugin-host';
import {
  getParentMap,
  insertUiGraphFragment,
  materializePirRoot,
  normalizeTreeToUiGraph,
  type InstantiatedUiFragment,
  type UiGraphFragmentInsertionTarget,
} from '@/pir/graph';
import { validatePirDocument } from '@/pir/validator/validator';
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceCommandEnvelope,
} from '@/workspace';
import type {
  PaletteItemCreationRecipe,
  PaletteQueryService,
} from '@/plugins/platform';
import {
  createNodeFromPaletteItem,
  createNodeIdFactory,
} from '@/editor/features/blueprint/editor/model/palette';
import {
  findNodeById,
  supportsChildrenForNode,
} from '@/editor/features/blueprint/editor/model/tree';
import {
  validateBlueprintComposition,
  type BlueprintCompositionIssue,
} from '@/editor/features/blueprint/editor/model/composition';

export type PaletteItemSelection = Readonly<{
  variantProps?: Readonly<Record<string, unknown>>;
  selectedSize?: string;
  selectedStatus?: string;
}>;

export type BlueprintPaletteInsertIntent = Readonly<{
  namespace: 'core.blueprint';
  type: 'component.insert';
  version: '1.0';
  recipeOwner: PluginOwnerRef;
  paletteContributionId: string;
  itemId: string;
  target: UiGraphFragmentInsertionTarget;
  selection: PaletteItemSelection;
}>;

export type PaletteItemInsertionResult =
  | Readonly<{
      ok: true;
      doc: PIRDocument;
      command: WorkspaceCommandEnvelope;
      intent: BlueprintPaletteInsertIntent;
      nextNodeId: string;
      fragment: InstantiatedUiFragment;
    }>
  | Readonly<{
      ok: false;
      reason: string;
      compositionIssue?: BlueprintCompositionIssue;
    }>;

const cloneJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
};

const sameOwner = (left: PluginOwnerRef, right: PluginOwnerRef): boolean =>
  left.pluginId === right.pluginId &&
  left.installationId === right.installationId &&
  left.generation === right.generation;

const createCommandId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `blueprint-insert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const applySelectionProps = (
  base: Readonly<Record<string, unknown>> | undefined,
  item: ReturnType<PaletteQueryService['getItemById']>,
  selection: PaletteItemSelection
): Record<string, unknown> => ({
  ...(base ?? {}),
  ...(item?.defaultProps ?? {}),
  ...(selection.selectedSize === undefined
    ? {}
    : { size: selection.selectedSize }),
  ...(selection.selectedStatus === undefined || !item?.statusProp
    ? {}
    : { [item.statusProp]: selection.selectedStatus }),
  ...(selection.variantProps ?? {}),
});

const toFragment = (
  graph: UiGraph,
  primaryNodeId: string,
  localToNodeId: Readonly<Record<string, string>>
): InstantiatedUiFragment =>
  Object.freeze({
    rootIds: Object.freeze([graph.rootId]),
    primaryNodeId,
    nodesById: Object.freeze({ ...graph.nodesById }),
    childIdsById: Object.freeze(
      Object.fromEntries(
        Object.entries(graph.childIdsById).map(([nodeId, childIds]) => [
          nodeId,
          Object.freeze([...childIds]),
        ])
      )
    ),
    ...(graph.regionsById
      ? {
          regionsById: Object.freeze(
            Object.fromEntries(
              Object.entries(graph.regionsById).map(([nodeId, regions]) => [
                nodeId,
                Object.freeze(
                  Object.fromEntries(
                    Object.entries(regions).map(([name, childIds]) => [
                      name,
                      Object.freeze([...childIds]),
                    ])
                  )
                ),
              ])
            )
          ),
        }
      : {}),
    localToNodeId: Object.freeze({ ...localToNodeId }),
  });

const instantiateNativeRecipe = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  itemId: string,
  selection: PaletteItemSelection
): InstantiatedUiFragment => {
  const createId = createNodeIdFactory(doc);
  const node = createNodeFromPaletteItem({
    itemId,
    createId,
    palette,
    variantProps: selection.variantProps
      ? { ...selection.variantProps }
      : undefined,
    selectedSize: selection.selectedSize,
  });
  const item = palette.getItemById(itemId);
  if (selection.selectedStatus !== undefined && item?.statusProp) {
    node.props = {
      ...(node.props ?? {}),
      [item.statusProp]: selection.selectedStatus,
    };
  }
  const graph = normalizeTreeToUiGraph(node);
  return toFragment(graph, node.id, { root: node.id });
};

const allocateTemplateIds = (
  doc: PIRDocument,
  template: BlueprintTemplateDescriptor
): Readonly<Record<string, string>> => {
  const createId = createNodeIdFactory(doc);
  const allocated = new Set<string>();
  const localToNodeId: Record<string, string> = {};
  Object.keys(template.fragment.nodesByLocalId)
    .sort()
    .forEach((localId) => {
      const type = template.fragment.nodesByLocalId[localId]!.type;
      const nodeId = createId(type);
      if (!nodeId || doc.ui.graph.nodesById[nodeId] || allocated.has(nodeId)) {
        throw new Error(
          'Template node id allocation conflicted with the document.'
        );
      }
      allocated.add(nodeId);
      localToNodeId[localId] = nodeId;
    });
  return Object.freeze(localToNodeId);
};

const instantiateTemplateRecipe = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  itemId: string,
  template: BlueprintTemplateDescriptor,
  selection: PaletteItemSelection
): InstantiatedUiFragment => {
  const localToNodeId = allocateTemplateIds(doc, template);
  const item = palette.getItemById(itemId);
  const nodesById: Record<string, ComponentNodeData> = {};
  Object.entries(template.fragment.nodesByLocalId).forEach(
    ([localId, node]) => {
      const nodeId = localToNodeId[localId]!;
      const props =
        localId === template.primaryLocalId
          ? applySelectionProps(node.props, item, selection)
          : node.props
            ? cloneJson(node.props)
            : undefined;
      nodesById[nodeId] = {
        id: nodeId,
        type: node.type,
        ...(props && Object.keys(props).length > 0 ? { props } : {}),
        ...(node.style ? { style: cloneJson(node.style) } : {}),
        ...(node.text === undefined ? {} : { text: cloneJson(node.text) }),
      };
    }
  );
  const childIdsById = Object.fromEntries(
    Object.keys(template.fragment.nodesByLocalId).map((localId) => [
      localToNodeId[localId]!,
      Object.freeze(
        (template.fragment.childIdsByLocalId[localId] ?? []).map(
          (childId) => localToNodeId[childId]!
        )
      ),
    ])
  );
  const regionsById = template.fragment.regionsByLocalId
    ? Object.fromEntries(
        Object.entries(template.fragment.regionsByLocalId).map(
          ([localId, regions]) => [
            localToNodeId[localId]!,
            Object.freeze(
              Object.fromEntries(
                Object.entries(regions).map(([name, childIds]) => [
                  name,
                  Object.freeze(
                    childIds.map((childId) => localToNodeId[childId]!)
                  ),
                ])
              )
            ),
          ]
        )
      )
    : undefined;
  return Object.freeze({
    rootIds: Object.freeze(
      template.fragment.rootLocalIds.map((localId) => localToNodeId[localId]!)
    ),
    primaryNodeId: localToNodeId[template.primaryLocalId]!,
    nodesById: Object.freeze(nodesById),
    childIdsById: Object.freeze(childIdsById),
    ...(regionsById ? { regionsById: Object.freeze(regionsById) } : {}),
    localToNodeId,
  });
};

const instantiateDirectRecipe = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  recipe: Extract<PaletteItemCreationRecipe, { kind: 'direct' }>,
  selection: PaletteItemSelection
): InstantiatedUiFragment => {
  const createId = createNodeIdFactory(doc);
  const nodeId = createId(recipe.runtimeType);
  const props = applySelectionProps(
    undefined,
    palette.getItemById(recipe.itemId),
    selection
  );
  return Object.freeze({
    rootIds: Object.freeze([nodeId]),
    primaryNodeId: nodeId,
    nodesById: Object.freeze({
      [nodeId]: Object.freeze({
        id: nodeId,
        type: recipe.runtimeType,
        ...(Object.keys(props).length > 0 ? { props } : {}),
      }),
    }),
    childIdsById: Object.freeze({ [nodeId]: Object.freeze([]) }),
    localToNodeId: Object.freeze({ root: nodeId }),
  });
};

export const instantiatePaletteItem = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  recipe: PaletteItemCreationRecipe,
  selection: PaletteItemSelection = {}
): InstantiatedUiFragment => {
  if (recipe.kind === 'native') {
    return instantiateNativeRecipe(doc, palette, recipe.itemId, selection);
  }
  if (recipe.kind === 'direct') {
    return instantiateDirectRecipe(doc, palette, recipe, selection);
  }
  return instantiateTemplateRecipe(
    doc,
    palette,
    recipe.itemId,
    recipe.template,
    selection
  );
};

const resolveInsertionTarget = (
  doc: PIRDocument,
  fragment: InstantiatedUiFragment,
  preferredTargetId?: string
): UiGraphFragmentInsertionTarget => {
  const graph = doc.ui.graph;
  const root = materializePirRoot(doc);
  const targetId = preferredTargetId ?? graph.rootId;
  if (targetId === graph.rootId) {
    return {
      parentId: graph.rootId,
      index: graph.childIdsById[graph.rootId]?.length ?? 0,
    };
  }
  const targetNode = findNodeById(root, targetId);
  const primaryType = fragment.nodesById[fragment.primaryNodeId]?.type;
  if (
    targetNode &&
    targetNode.type !== primaryType &&
    supportsChildrenForNode(targetNode)
  ) {
    return {
      parentId: targetId,
      index: graph.childIdsById[targetId]?.length ?? 0,
    };
  }
  const parent = getParentMap(graph)[targetId];
  if (!parent) {
    return {
      parentId: graph.rootId,
      index: graph.childIdsById[graph.rootId]?.length ?? 0,
    };
  }
  return {
    parentId: parent.parentId,
    index: parent.index + 1,
    ...(parent.regionName ? { regionName: parent.regionName } : {}),
  };
};

export const createBlueprintPaletteInsertIntent = (
  recipe: PaletteItemCreationRecipe,
  input: Readonly<{
    target: UiGraphFragmentInsertionTarget;
    selection?: PaletteItemSelection;
  }>
): BlueprintPaletteInsertIntent =>
  Object.freeze({
    namespace: 'core.blueprint',
    type: 'component.insert',
    version: '1.0',
    recipeOwner: recipe.owner,
    paletteContributionId: recipe.paletteContributionId,
    itemId: recipe.itemId,
    target: Object.freeze({ ...input.target }),
    selection: Object.freeze({ ...(input.selection ?? {}) }),
  });

export const applyPaletteItemInsertion = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  input: Readonly<{
    workspaceId: string;
    documentId: string;
    itemId: string;
    preferredTargetId?: string;
    selection?: PaletteItemSelection;
    commandId?: string;
    issuedAt?: string;
  }>
): PaletteItemInsertionResult => {
  const recipe = palette.getCreationRecipe(input.itemId);
  if (!recipe) return { ok: false, reason: 'Palette item is unavailable.' };

  let fragment: InstantiatedUiFragment;
  try {
    fragment = instantiatePaletteItem(
      doc,
      palette,
      recipe,
      input.selection ?? {}
    );
  } catch {
    return { ok: false, reason: 'Palette item could not be instantiated.' };
  }
  const target = resolveInsertionTarget(doc, fragment, input.preferredTargetId);
  const intent = createBlueprintPaletteInsertIntent(recipe, {
    target,
    selection: input.selection,
  });
  const currentRecipe = palette.getCreationRecipe(intent.itemId);
  if (
    !currentRecipe ||
    currentRecipe.paletteContributionId !== intent.paletteContributionId ||
    !sameOwner(currentRecipe.owner, intent.recipeOwner)
  ) {
    return {
      ok: false,
      reason: 'Palette creation recipe changed before insertion.',
    };
  }
  const insertion = insertUiGraphFragment(
    doc.ui.graph,
    fragment,
    intent.target
  );
  if (insertion.ok === false) {
    return { ok: false, reason: insertion.reason };
  }
  const compositionIssue = validateBlueprintComposition(
    insertion.graph,
    palette,
    [...Object.keys(fragment.nodesById), intent.target.parentId]
  );
  if (compositionIssue) {
    return {
      ok: false,
      reason: compositionIssue.message,
      compositionIssue,
    };
  }
  const candidate: PIRDocument = {
    ...doc,
    ui: { graph: insertion.graph },
  };
  const validation = validatePirDocument(candidate);
  if (validation.hasError) {
    return {
      ok: false,
      reason:
        validation.issues[0]?.message ?? 'Inserted PIR fragment is invalid.',
    };
  }
  const command: WorkspaceCommandEnvelope = {
    id: input.commandId ?? createCommandId(),
    namespace: intent.namespace,
    type: intent.type,
    version: intent.version,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
    target: {
      workspaceId: input.workspaceId,
      documentId: input.documentId,
    },
    domainHint: 'pir',
    label: `Insert ${intent.itemId}`,
    forwardOps: [{ op: 'replace', path: '/ui/graph', value: insertion.graph }],
    reverseOps: [{ op: 'replace', path: '/ui/graph', value: doc.ui.graph }],
  };
  const applied = applyWorkspaceDocumentCommand(doc, command, {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    domain: 'pir',
  });
  if (applied.ok === false) {
    return {
      ok: false,
      reason: applied.issues[0]?.message ?? 'Palette insert command failed.',
    };
  }
  return Object.freeze({
    ok: true,
    doc: applied.content,
    command,
    intent,
    nextNodeId: fragment.primaryNodeId,
    fragment,
  });
};
