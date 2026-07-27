import {
  addEdge,
  type Connection,
  type Edge,
  type IsValidConnection,
  type Node,
} from '@xyflow/react';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { GraphNodeData } from './GraphNode';
import {
  type ConnectionValidationReason,
  validateConnectionWithState,
} from './graphConnectionValidation';
import { normalizeHandleId } from './graphPortUtils';

type UseNodeGraphConnectionActionsParams = {
  connectionHintTextByReason: Record<ConnectionValidationReason, string>;
  edges: Edge[];
  nodes: Node<GraphNodeData>[];
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  setHint: Dispatch<SetStateAction<string | null>>;
};

export const useNodeGraphConnectionActions = ({
  connectionHintTextByReason,
  edges,
  nodes,
  setEdges,
  setHint,
}: UseNodeGraphConnectionActionsParams) => {
  // React Flow probes validity with either a live Connection or an existing
  // Edge, whose handles are optional; both collapse to the same endpoint pair.
  const isValidConnection = useCallback<IsValidConnection>(
    (connection) =>
      validateConnectionWithState(
        {
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle ?? null,
          targetHandle: connection.targetHandle ?? null,
        },
        nodes,
        edges
      ).valid,
    [edges, nodes]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const normalizedConnection: Connection = {
        ...connection,
        sourceHandle: normalizeHandleId(connection.sourceHandle),
        targetHandle: normalizeHandleId(connection.targetHandle),
      };
      const validation = validateConnectionWithState(
        normalizedConnection,
        nodes,
        edges
      );
      if (!validation.valid) {
        const reason =
          'reason' in validation ? validation.reason : 'invalid-handle';
        setHint(connectionHintTextByReason[reason]);
        return;
      }
      // `addEdge` mints the edge id for a Connection and copies every other
      // field through, so the edge type rides along on the upgraded connection.
      const connectionWithEdgeType: Connection & Pick<Edge, 'type'> = {
        ...normalizedConnection,
        type: 'smoothstep',
      };
      setEdges((current) => addEdge(connectionWithEdgeType, current));
    },
    [connectionHintTextByReason, edges, nodes, setEdges, setHint]
  );

  return {
    isValidConnection,
    onConnect,
  };
};
