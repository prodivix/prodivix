import type { BlueprintTemplateDescriptor } from '@prodivix/plugin-contracts';
import type { PluginOwnerRef } from '@prodivix/plugin-host';
import {
  insertPirGraphFragment,
  validatePirDocument,
  type PIRElementNode,
  type PIRGraphFragment,
  type PIRGraphPlacementTarget,
  type PIRJsonValue,
  type PIRDocument,
  type PIRUiGraph,
  type PIRValueBinding,
} from '@prodivix/pir';
import {
  applyWorkspaceDocumentCommand,
  type WorkspaceCommandEnvelope,
  type WorkspacePirDocumentType,
} from '@prodivix/workspace';
import type {
  PaletteItemCreationRecipe,
  PaletteQueryService,
} from '@/plugins/platform';
import {
  validateBlueprintComposition,
  type BlueprintCompositionIssue,
} from './composition';

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
  target: PIRGraphPlacementTarget;
  selection: PaletteItemSelection;
}>;

export type InstantiatedPaletteFragment = PIRGraphFragment &
  Readonly<{ localToNodeId: Readonly<Record<string, string>> }>;

export type PaletteItemInsertionResult =
  | Readonly<{
      ok: true;
      doc: PIRDocument;
      command: WorkspaceCommandEnvelope;
      intent: BlueprintPaletteInsertIntent;
      nextNodeId: string;
      fragment: InstantiatedPaletteFragment;
    }>
  | Readonly<{
      ok: false;
      reason: string;
      compositionIssue?: BlueprintCompositionIssue;
    }>;

const cloneJson = (value: unknown): PIRJsonValue =>
  (typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))) as PIRJsonValue;

const toLiteralBinding = (value: unknown): PIRValueBinding =>
  Object.freeze({ kind: 'literal', value: cloneJson(value) });

const toBindingRecord = (
  values: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, PIRValueBinding>> | undefined => {
  const entries = Object.entries(values ?? {}).filter(
    ([, value]) => value !== undefined
  );
  return entries.length > 0
    ? Object.freeze(
        Object.fromEntries(
          entries.map(([key, value]) => [key, toLiteralBinding(value)])
        )
      )
    : undefined;
};

const createElementNode = (input: {
  id: string;
  type: string;
  props?: Readonly<Record<string, unknown>>;
  style?: Readonly<Record<string, unknown>>;
  text?: unknown;
}): PIRElementNode => {
  const props = toBindingRecord(input.props);
  const style = toBindingRecord(input.style);
  return Object.freeze({
    id: input.id,
    kind: 'element',
    type: input.type,
    ...(input.text === undefined ? {} : { text: toLiteralBinding(input.text) }),
    ...(props ? { props } : {}),
    ...(style ? { style } : {}),
  });
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

const toPascalCase = (value: string): string =>
  value
    .split(/[-_]/)
    .filter(Boolean)
    .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
    .join('');

const inferRuntimeType = (
  itemId: string,
  palette: PaletteQueryService
): string =>
  palette.getItemById(itemId)?.runtimeType ?? `Pdx${toPascalCase(itemId)}`;

const inferDefaultText = (name: string | undefined): string | undefined => {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return /input|select|switch|checkbox|radio|slider|image|icon|table|list|grid|tree|chart|dialog|menu|tabs/i.test(
    trimmed
  )
    ? undefined
    : trimmed;
};

const createNodeIdFactory = (doc: PIRDocument) => {
  const existing = new Set(Object.keys(doc.ui.graph.nodesById));
  return (type: string): string => {
    const stem = type.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'node';
    let index = 1;
    let nodeId = `${stem}-${index}`;
    while (existing.has(nodeId)) nodeId = `${stem}-${++index}`;
    existing.add(nodeId);
    return nodeId;
  };
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

const instantiateSingleElement = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  itemId: string,
  runtimeType: string,
  selection: PaletteItemSelection
): InstantiatedPaletteFragment => {
  const nodeId = createNodeIdFactory(doc)(runtimeType);
  const item = palette.getItemById(itemId);
  const node = createElementNode({
    id: nodeId,
    type: runtimeType,
    props: applySelectionProps(undefined, item, selection),
    text: inferDefaultText(item?.name),
  });
  return Object.freeze({
    rootNodeIds: Object.freeze([nodeId]),
    primaryNodeId: nodeId,
    nodesById: Object.freeze({ [nodeId]: node }),
    childIdsById: Object.freeze({ [nodeId]: Object.freeze([]) }),
    localToNodeId: Object.freeze({ root: nodeId }),
  });
};

const instantiateTemplate = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  itemId: string,
  template: BlueprintTemplateDescriptor,
  selection: PaletteItemSelection
): InstantiatedPaletteFragment => {
  const createId = createNodeIdFactory(doc);
  const localToNodeId = Object.freeze(
    Object.fromEntries(
      Object.entries(template.fragment.nodesByLocalId)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([localId, node]) => [localId, createId(node.type)])
    )
  );
  const nodesById = Object.freeze(
    Object.fromEntries(
      Object.entries(template.fragment.nodesByLocalId).map(
        ([localId, node]) => {
          const nodeId = localToNodeId[localId]!;
          return [
            nodeId,
            createElementNode({
              id: nodeId,
              type: node.type,
              props:
                localId === template.primaryLocalId
                  ? applySelectionProps(
                      node.props,
                      palette.getItemById(itemId),
                      selection
                    )
                  : node.props,
              style: node.style,
              text: node.text,
            }),
          ];
        }
      )
    )
  );
  const childIdsById = Object.freeze(
    Object.fromEntries(
      Object.keys(template.fragment.nodesByLocalId).map((localId) => [
        localToNodeId[localId]!,
        Object.freeze(
          (template.fragment.childIdsByLocalId[localId] ?? []).map(
            (childLocalId) => localToNodeId[childLocalId]!
          )
        ),
      ])
    )
  );
  const regionsById = template.fragment.regionsByLocalId
    ? Object.freeze(
        Object.fromEntries(
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
      )
    : undefined;
  return Object.freeze({
    rootNodeIds: Object.freeze(
      template.fragment.rootLocalIds.map((localId) => localToNodeId[localId]!)
    ),
    primaryNodeId: localToNodeId[template.primaryLocalId]!,
    nodesById,
    childIdsById,
    ...(regionsById ? { regionsById } : {}),
    localToNodeId,
  });
};

export const instantiatePaletteItem = (
  doc: PIRDocument,
  palette: PaletteQueryService,
  recipe: PaletteItemCreationRecipe,
  selection: PaletteItemSelection = {}
): InstantiatedPaletteFragment =>
  recipe.kind === 'template'
    ? instantiateTemplate(
        doc,
        palette,
        recipe.itemId,
        recipe.template,
        selection
      )
    : instantiateSingleElement(
        doc,
        palette,
        recipe.itemId,
        recipe.kind === 'direct'
          ? recipe.runtimeType
          : inferRuntimeType(recipe.itemId, palette),
        selection
      );

const findParentPlacement = (
  graph: PIRUiGraph,
  nodeId: string
): PIRGraphPlacementTarget | undefined => {
  for (const [parentId, childIds] of Object.entries(graph.childIdsById)) {
    const index = childIds.indexOf(nodeId);
    if (index >= 0) return { parentId, index };
  }
  for (const [parentId, regions] of Object.entries(graph.regionsById ?? {})) {
    for (const [regionName, childIds] of Object.entries(regions)) {
      const index = childIds.indexOf(nodeId);
      if (index >= 0) return { parentId, regionName, index };
    }
  }
  return undefined;
};

const childrenEndPlacement = (
  graph: PIRUiGraph,
  nodeId: string
): PIRGraphPlacementTarget | undefined => {
  const node = graph.nodesById[nodeId];
  if (!node) return undefined;
  if (node.kind === 'collection') {
    return {
      parentId: nodeId,
      regionName: 'item',
      index: graph.regionsById?.[nodeId]?.item?.length ?? 0,
    };
  }
  if (node.kind === 'component-instance') {
    const regionName = Object.keys(graph.regionsById?.[nodeId] ?? {})[0];
    return regionName
      ? {
          parentId: nodeId,
          regionName,
          index: graph.regionsById?.[nodeId]?.[regionName]?.length ?? 0,
        }
      : undefined;
  }
  return {
    parentId: nodeId,
    index: graph.childIdsById[nodeId]?.length ?? 0,
  };
};

const resolveInsertionTarget = (
  doc: PIRDocument,
  preferredTargetId?: string
): PIRGraphPlacementTarget | undefined => {
  const graph = doc.ui.graph;
  if (preferredTargetId && graph.nodesById[preferredTargetId]) {
    return (
      childrenEndPlacement(graph, preferredTargetId) ??
      findParentPlacement(graph, preferredTargetId) ??
      childrenEndPlacement(graph, graph.rootId)
    );
  }
  return childrenEndPlacement(graph, graph.rootId);
};

export const createBlueprintPaletteInsertIntent = (
  recipe: PaletteItemCreationRecipe,
  input: Readonly<{
    target: PIRGraphPlacementTarget;
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
    documentType: WorkspacePirDocumentType;
    itemId: string;
    target?: PIRGraphPlacementTarget;
    preferredTargetId?: string;
    selection?: PaletteItemSelection;
    commandId?: string;
    issuedAt?: string;
  }>
): PaletteItemInsertionResult => {
  const recipe = palette.getCreationRecipe(input.itemId);
  if (!recipe) return { ok: false, reason: 'Palette item is unavailable.' };
  let fragment: InstantiatedPaletteFragment;
  try {
    fragment = instantiatePaletteItem(doc, palette, recipe, input.selection);
  } catch {
    return { ok: false, reason: 'Palette item could not be instantiated.' };
  }
  const target =
    input.target ?? resolveInsertionTarget(doc, input.preferredTargetId);
  if (!target) {
    return {
      ok: false,
      reason: 'The selected PIR node does not expose an insertion region.',
    };
  }
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
  const insertion = insertPirGraphFragment({ document: doc, fragment, target });
  if (insertion.ok === false) {
    return {
      ok: false,
      reason: insertion.issues[0]?.message ?? 'Palette insertion is invalid.',
    };
  }
  const compositionIssue = validateBlueprintComposition(
    insertion.document.ui.graph,
    palette,
    [...insertion.insertedNodeIds, target.parentId]
  );
  if (compositionIssue) {
    return {
      ok: false,
      reason: compositionIssue.message,
      compositionIssue,
    };
  }
  const validation = validatePirDocument(insertion.document);
  if (!validation.valid) {
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
    target: { workspaceId: input.workspaceId, documentId: input.documentId },
    domainHint: 'pir',
    label: `Insert ${intent.itemId}`,
    forwardOps: [
      { op: 'replace', path: '/ui/graph', value: insertion.document.ui.graph },
    ],
    reverseOps: [{ op: 'replace', path: '/ui/graph', value: doc.ui.graph }],
  };
  const applied = applyWorkspaceDocumentCommand(doc, command, {
    workspaceId: input.workspaceId,
    documentId: input.documentId,
    domain: 'pir',
    documentType: input.documentType,
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
