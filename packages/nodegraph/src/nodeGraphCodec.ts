import type {
  NodeGraphDecodeIssue,
  NodeGraphDecodeResult,
  NodeGraphDocument,
  NodeGraphEdge,
  NodeGraphNode,
  NodeGraphSelection,
} from './nodeGraph.types';

type UnsafeRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is UnsafeRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readRequiredId = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({ path, message: 'Expected a non-empty string.' });
    return null;
  }
  return value.trim();
};

const readOptionalString = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Expected a string when present.' });
    return undefined;
  }
  const normalized = value.trim();
  return normalized || undefined;
};

const readOptionalHandle = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | null | undefined => {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') {
    issues.push({ path, message: 'Expected a string or null when present.' });
    return undefined;
  }
  return value;
};

const decodeNode = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphNode | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected an object.' });
    return null;
  }
  const id = readRequiredId(value.id, `${path}.id`, issues);
  if (!isPlainObject(value.data)) {
    issues.push({ path: `${path}.data`, message: 'Expected an object.' });
  }
  const type = readOptionalString(value.type, `${path}.type`, issues);
  if (isPlainObject(value.data) && value.data.kind !== undefined) {
    readOptionalString(value.data.kind, `${path}.data.kind`, issues);
  }
  if (!id || !isPlainObject(value.data)) return null;
  return {
    id,
    ...(type ? { type } : {}),
    data: { ...value.data },
  };
};

const decodeEdge = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphEdge | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected an object.' });
    return null;
  }
  const id = readRequiredId(value.id, `${path}.id`, issues);
  const source = readRequiredId(value.source, `${path}.source`, issues);
  const target = readRequiredId(value.target, `${path}.target`, issues);
  const sourceHandle = readOptionalHandle(
    value.sourceHandle,
    `${path}.sourceHandle`,
    issues
  );
  const targetHandle = readOptionalHandle(
    value.targetHandle,
    `${path}.targetHandle`,
    issues
  );
  if (!id || !source || !target) return null;
  return {
    id,
    source,
    target,
    ...(sourceHandle !== undefined ? { sourceHandle } : {}),
    ...(targetHandle !== undefined ? { targetHandle } : {}),
  };
};

/**
 * Decodes the persisted NodeGraph domain section without importing PIR or a
 * canvas library. Invalid graphs fail as a unit and are never partially run.
 */
export const decodeNodeGraphDocuments = (
  value: unknown
): NodeGraphDecodeResult => {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      issues: [{ path: 'graphs', message: 'Expected an array.' }],
    };
  }

  const issues: NodeGraphDecodeIssue[] = [];
  const documents: NodeGraphDocument[] = [];
  const graphIds = new Set<string>();

  value.forEach((candidate, graphIndex) => {
    const path = `graphs[${graphIndex}]`;
    if (!isPlainObject(candidate)) {
      issues.push({ path, message: 'Expected an object.' });
      return;
    }
    const id = readRequiredId(candidate.id, `${path}.id`, issues);
    const name = readOptionalString(candidate.name, `${path}.name`, issues);
    if (!Array.isArray(candidate.nodes)) {
      issues.push({ path: `${path}.nodes`, message: 'Expected an array.' });
    }
    if (!Array.isArray(candidate.edges)) {
      issues.push({ path: `${path}.edges`, message: 'Expected an array.' });
    }
    if (
      !id ||
      !Array.isArray(candidate.nodes) ||
      !Array.isArray(candidate.edges)
    ) {
      return;
    }
    if (graphIds.has(id)) {
      issues.push({ path: `${path}.id`, message: `Duplicate graph id: ${id}` });
    }
    graphIds.add(id);

    const nodes: NodeGraphNode[] = [];
    const nodeIds = new Set<string>();
    candidate.nodes.forEach((node, nodeIndex) => {
      const nodePath = `${path}.nodes[${nodeIndex}]`;
      const decoded = decodeNode(node, nodePath, issues);
      if (!decoded) return;
      if (nodeIds.has(decoded.id)) {
        issues.push({
          path: `${nodePath}.id`,
          message: `Duplicate node id: ${decoded.id}`,
        });
      }
      nodeIds.add(decoded.id);
      nodes.push(decoded);
    });

    const edges: NodeGraphEdge[] = [];
    const edgeIds = new Set<string>();
    candidate.edges.forEach((edge, edgeIndex) => {
      const edgePath = `${path}.edges[${edgeIndex}]`;
      const decoded = decodeEdge(edge, edgePath, issues);
      if (!decoded) return;
      if (edgeIds.has(decoded.id)) {
        issues.push({
          path: `${edgePath}.id`,
          message: `Duplicate edge id: ${decoded.id}`,
        });
      }
      edgeIds.add(decoded.id);
      if (!nodeIds.has(decoded.source)) {
        issues.push({
          path: `${edgePath}.source`,
          message: `Unknown source node: ${decoded.source}`,
        });
      }
      if (!nodeIds.has(decoded.target)) {
        issues.push({
          path: `${edgePath}.target`,
          message: `Unknown target node: ${decoded.target}`,
        });
      }
      edges.push(decoded);
    });

    documents.push({
      id,
      ...(name ? { name } : {}),
      nodes,
      edges,
    });
  });

  return issues.length ? { ok: false, issues } : { ok: true, value: documents };
};

const normalizeSelectionKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export const selectNodeGraphDocument = (
  documents: NodeGraphDocument[],
  selection: NodeGraphSelection
): NodeGraphDocument | null => {
  const graphId = normalizeSelectionKey(selection.graphId);
  if (graphId) {
    return documents.find((graph) => graph.id === graphId) ?? null;
  }
  const graphName = normalizeSelectionKey(selection.graphName);
  if (graphName) {
    return documents.find((graph) => graph.name === graphName) ?? null;
  }
  return documents[0] ?? null;
};
