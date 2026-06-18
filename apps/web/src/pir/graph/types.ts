import type {
  ComponentNode,
  ComponentNodeData,
  PIRDocument,
  NodeId,
  UiGraph,
} from '@prodivix/shared/types/pir';

export type { ComponentNode, ComponentNodeData, PIRDocument, NodeId, UiGraph };

export type GraphParentRef = {
  parentId: NodeId;
  regionName?: string;
  index: number;
};

export type GraphMutationResult = {
  graph: UiGraph;
  changed: boolean;
};
