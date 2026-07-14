import type { PIRCollectionNode, PIRDocument, PIRUiGraph } from '@prodivix/pir';
import type { BlueprintTreeProjectionNode } from '@/editor/features/blueprint/editor/model/tree';
import {
  createBlueprintTreeProjection,
  findNodePlacement,
} from '@/editor/features/blueprint/editor/model/tree';
import {
  projectBinding,
  projectBindingRecord,
  projectDataScope,
  projectEvents,
} from './bindingProjection';
import { findTreeProjectionNode } from './treeProjection';
import type { BlueprintInspectorNodeView, InspectorListView } from './types';

const findParentCollection = (
  graph: PIRUiGraph,
  nodeId: string
): PIRCollectionNode | undefined => {
  const placement = findNodePlacement(graph, nodeId);
  if (!placement || placement.regionName !== 'item') return undefined;
  const parent = graph.nodesById[placement.parentId];
  return parent?.kind === 'collection' ? parent : undefined;
};

const projectList = (
  graph: PIRUiGraph,
  nodeId: string
): InspectorListView | undefined => {
  const collection = findParentCollection(graph, nodeId);
  if (!collection) return undefined;
  const sourceBinding =
    collection.source.kind === 'binding' ? collection.source.value : undefined;
  const sourcePath =
    sourceBinding && 'path' in sourceBinding ? sourceBinding.path : undefined;
  const keyBinding =
    collection.key.kind === 'binding' ? collection.key.value : undefined;
  const keyPath =
    keyBinding && 'path' in keyBinding ? keyBinding.path : undefined;
  return {
    collectionId: collection.id,
    arrayField: sourcePath ?? '',
    itemAs: collection.symbols.itemName,
    indexAs: collection.symbols.indexName,
    keyBy: keyPath,
    emptyNodeId: graph.regionsById?.[collection.id]?.empty?.[0],
  };
};

const projectNode = (
  projection: BlueprintTreeProjectionNode,
  graph: PIRUiGraph
): BlueprintInspectorNodeView => {
  const { node } = projection;
  const children = projection.children.map((child) =>
    projectNode(child, graph)
  );
  if (node.kind !== 'element') {
    return {
      id: node.id,
      kind: node.kind,
      regionName: projection.regionName,
      type:
        node.kind === 'component-instance'
          ? 'Component Instance'
          : node.kind === 'component-slot-outlet'
            ? 'Slot Outlet'
            : 'Collection',
      ...(children.length > 0 ? { children } : {}),
    };
  }
  const list = projectList(graph, node.id);
  return {
    id: node.id,
    kind: 'element',
    regionName: projection.regionName,
    type: node.type,
    ...(node.text ? { text: projectBinding(node.text) } : {}),
    ...(node.style ? { style: projectBindingRecord(node.style) } : {}),
    ...(node.props ? { props: projectBindingRecord(node.props) } : {}),
    ...(node.data ? { data: projectDataScope(node.data) } : {}),
    ...(node.events ? { events: projectEvents(node.events) } : {}),
    ...(list ? { list } : {}),
    ...(children.length > 0 ? { children } : {}),
  };
};

export const createBlueprintInspectorNodeView = (
  documentId: string,
  document: PIRDocument,
  nodeId: string
): BlueprintInspectorNodeView | null => {
  const tree = createBlueprintTreeProjection(documentId, document);
  if (!tree) return null;
  const selected = findTreeProjectionNode(tree, nodeId);
  return selected ? projectNode(selected, document.ui.graph) : null;
};
