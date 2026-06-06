import {
  createNodeFromPaletteItem,
  createNodeIdFactory,
} from '@/editor/features/design/blueprint/editor/model/palette';
import {
  findNodeById,
  insertAfterById,
  insertChildAtIndex,
  insertIntoPirDoc,
  supportsChildrenForNode,
} from '@/editor/features/design/blueprint/editor/model/tree';
import type { ComponentNode, PIRDocument } from '@/core/types/engine.types';
import { materializePirRoot, normalizeTreeToUiGraph } from '@/pir/graph';
import { normalizeRoutePath } from '@/editor/store/routeManifest';
import type { DragOverData, PaletteItemDragData } from './dragdrop.types';

const toRoutedNode = (
  node: ComponentNode,
  normalizedCurrentPath: string
): ComponentNode => {
  const props = (node.props ?? {}) as Record<string, unknown>;
  if (
    typeof props['data-route-path'] === 'string' ||
    props['data-route-fallback'] === true
  ) {
    return node;
  }
  return {
    ...node,
    props: {
      ...props,
      'data-route-path': normalizedCurrentPath,
    },
  };
};

export type PaletteDropResult = {
  doc: PIRDocument;
  nextNodeId: string;
};

export const applyPaletteItemDrop = (
  doc: PIRDocument,
  data: PaletteItemDragData,
  overData: DragOverData | null | undefined,
  context: {
    currentPath: string;
    selectedId?: string;
  }
): PaletteDropResult => {
  const itemId = String(data.itemId);
  const variantProps = data.variantProps;
  const selectedSize = data.selectedSize;
  const dropKind = overData?.kind;
  const dropNodeId =
    dropKind === 'tree-node'
      ? String((overData as { nodeId?: unknown }).nodeId)
      : null;
  const targetId =
    dropNodeId ??
    (dropKind === 'canvas' ? (context.selectedId ?? 'root') : 'root');

  const createId = createNodeIdFactory(doc);
  let newNode = createNodeFromPaletteItem(
    itemId,
    createId,
    variantProps,
    selectedSize
  );
  const normalizedCurrentPath = normalizeRoutePath(context.currentPath || '/');
  let nextNodeId = newNode.id;

  if (dropNodeId) {
    const root = materializePirRoot(doc);
    const dropNode = findNodeById(root, dropNodeId);
    if (dropNode?.type === 'PdxRoute') {
      newNode = toRoutedNode(newNode, normalizedCurrentPath);
      nextNodeId = newNode.id;
      const insertedChild = insertChildAtIndex(
        root,
        dropNode.id,
        newNode,
        dropNode.children?.length ?? 0
      );
      if (insertedChild.inserted) {
        return {
          doc: {
            ...doc,
            ui: { graph: normalizeTreeToUiGraph(insertedChild.node) },
          },
          nextNodeId,
        };
      }
    }
  }

  if (dropKind === 'canvas' && context.selectedId) {
    const root = materializePirRoot(doc);
    const selectedNode = findNodeById(root, context.selectedId);
    if (selectedNode?.type === 'PdxRoute') {
      newNode = toRoutedNode(newNode, normalizedCurrentPath);
      nextNodeId = newNode.id;
      const insertedChild = insertChildAtIndex(
        root,
        selectedNode.id,
        newNode,
        selectedNode.children?.length ?? 0
      );
      if (insertedChild.inserted) {
        return {
          doc: {
            ...doc,
            ui: { graph: normalizeTreeToUiGraph(insertedChild.node) },
          },
          nextNodeId,
        };
      }
    }
    const isLayoutPatternItem = itemId.startsWith('layout-pattern-');
    if (
      isLayoutPatternItem &&
      selectedNode &&
      selectedNode.id !== root.id &&
      supportsChildrenForNode(selectedNode)
    ) {
      const insertedChild = insertChildAtIndex(
        root,
        selectedNode.id,
        newNode,
        selectedNode.children?.length ?? 0
      );
      if (insertedChild.inserted) {
        return {
          doc: {
            ...doc,
            ui: { graph: normalizeTreeToUiGraph(insertedChild.node) },
          },
          nextNodeId,
        };
      }
    }

    if (selectedNode && selectedNode.id !== root.id) {
      const insertedSibling = insertAfterById(root, selectedNode.id, newNode);
      if (insertedSibling.inserted) {
        return {
          doc: {
            ...doc,
            ui: { graph: normalizeTreeToUiGraph(insertedSibling.node) },
          },
          nextNodeId,
        };
      }
    }
  }

  return {
    doc: insertIntoPirDoc(doc, targetId, newNode),
    nextNodeId,
  };
};
