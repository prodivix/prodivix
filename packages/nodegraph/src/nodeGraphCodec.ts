import type { CodeReference, CodeSlotBinding } from '@prodivix/authoring';
import type {
  NodeGraphDecodeIssue,
  NodeGraphDecodeResult,
  NodeGraphEdge,
  NodeGraphNode,
  NodeGraphPort,
} from './nodeGraph.types';

type UnsafeRecord = Record<string, unknown>;

const isPlainObject = (value: unknown): value is UnsafeRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const hasOnlyKeys = (
  value: UnsafeRecord,
  allowed: readonly string[],
  path: string,
  issues: NodeGraphDecodeIssue[]
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      issues.push({
        path: `${path}/${key}`,
        message: `Unknown persisted NodeGraph field "${key}".`,
      });
    }
  }
};

const readRequiredId = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | null => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    issues.push({ path, message: 'Expected a canonical non-empty string.' });
    return null;
  }
  return value;
};

const readOptionalString = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
    issues.push({ path, message: 'Expected a canonical non-empty string.' });
    return undefined;
  }
  return value;
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

const readOptionalBoolean = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    issues.push({ path, message: 'Expected a boolean when present.' });
    return undefined;
  }
  return value;
};

const decodeCodeReference = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): CodeReference | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a CodeReference object.' });
    return null;
  }
  hasOnlyKeys(
    value,
    ['artifactId', 'exportName', 'symbolId', 'sourceSpan'],
    path,
    issues
  );
  const artifactId = readRequiredId(
    value.artifactId,
    `${path}/artifactId`,
    issues
  );
  const exportName = readOptionalString(
    value.exportName,
    `${path}/exportName`,
    issues
  );
  const symbolId = readOptionalString(
    value.symbolId,
    `${path}/symbolId`,
    issues
  );
  if (!artifactId) return null;
  const reference: CodeReference = {
    artifactId,
    ...(exportName ? { exportName } : {}),
    ...(symbolId ? { symbolId } : {}),
  };
  if (value.sourceSpan !== undefined) {
    if (!isPlainObject(value.sourceSpan)) {
      issues.push({
        path: `${path}/sourceSpan`,
        message: 'Expected a SourceSpan object.',
      });
    } else {
      hasOnlyKeys(
        value.sourceSpan,
        ['artifactId', 'startLine', 'startColumn', 'endLine', 'endColumn'],
        `${path}/sourceSpan`,
        issues
      );
      const numbers = [
        value.sourceSpan.startLine,
        value.sourceSpan.startColumn,
        value.sourceSpan.endLine,
        value.sourceSpan.endColumn,
      ];
      const spanArtifactId = readRequiredId(
        value.sourceSpan.artifactId,
        `${path}/sourceSpan/artifactId`,
        issues
      );
      if (
        spanArtifactId &&
        spanArtifactId === artifactId &&
        numbers.every(
          (candidate) =>
            typeof candidate === 'number' &&
            Number.isInteger(candidate) &&
            candidate >= 1
        )
      ) {
        reference.sourceSpan = {
          artifactId: spanArtifactId,
          startLine: numbers[0] as number,
          startColumn: numbers[1] as number,
          endLine: numbers[2] as number,
          endColumn: numbers[3] as number,
        };
      } else {
        issues.push({
          path: `${path}/sourceSpan`,
          message:
            'SourceSpan must use the referenced artifact and positive one-based integer positions.',
        });
      }
    }
  }
  return reference;
};

const decodeCodeSlotBinding = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): CodeSlotBinding | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a CodeSlotBinding object.' });
    return null;
  }
  hasOnlyKeys(value, ['slotId', 'reference'], path, issues);
  const slotId = readRequiredId(value.slotId, `${path}/slotId`, issues);
  const reference = decodeCodeReference(
    value.reference,
    `${path}/reference`,
    issues
  );
  return slotId && reference ? { slotId, reference } : null;
};

const decodePort = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphPort | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a NodeGraph port object.' });
    return null;
  }
  hasOnlyKeys(
    value,
    ['id', 'direction', 'kind', 'typeRef', 'required', 'multiple'],
    path,
    issues
  );
  const id = readRequiredId(value.id, `${path}/id`, issues);
  if (value.direction !== 'input' && value.direction !== 'output') {
    issues.push({
      path: `${path}/direction`,
      message: 'Expected input or output.',
    });
  }
  if (value.kind !== 'control' && value.kind !== 'data') {
    issues.push({ path: `${path}/kind`, message: 'Expected control or data.' });
  }
  const typeRef = readOptionalString(value.typeRef, `${path}/typeRef`, issues);
  const required = readOptionalBoolean(
    value.required,
    `${path}/required`,
    issues
  );
  const multiple = readOptionalBoolean(
    value.multiple,
    `${path}/multiple`,
    issues
  );
  if (
    !id ||
    (value.direction !== 'input' && value.direction !== 'output') ||
    (value.kind !== 'control' && value.kind !== 'data')
  ) {
    return null;
  }
  return {
    id,
    direction: value.direction,
    kind: value.kind,
    ...(typeRef ? { typeRef } : {}),
    ...(required !== undefined ? { required } : {}),
    ...(multiple !== undefined ? { multiple } : {}),
  };
};

const decodeNode = (
  value: unknown,
  index: number,
  issues: NodeGraphDecodeIssue[]
): NodeGraphNode | null => {
  const path = `/nodes/${index}`;
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected an object.' });
    return null;
  }
  hasOnlyKeys(value, ['id', 'type', 'data', 'ports', 'executor'], path, issues);
  const id = readRequiredId(value.id, `${path}/id`, issues);
  const type = readOptionalString(value.type, `${path}/type`, issues);
  if (!isPlainObject(value.data)) {
    issues.push({ path: `${path}/data`, message: 'Expected an object.' });
  }
  if (
    isPlainObject(value.data) &&
    value.data.kind === 'code' &&
    (Object.hasOwn(value.data, 'code') ||
      Object.hasOwn(value.data, 'codeLanguage'))
  ) {
    issues.push({
      path: `${path}/data`,
      message:
        'Code nodes must bind a Workspace CodeArtifact through executor; embedded source fields are not canonical.',
    });
  }
  const ports = Array.isArray(value.ports)
    ? value.ports
        .map((port, portIndex) =>
          decodePort(port, `${path}/ports/${portIndex}`, issues)
        )
        .filter((port): port is NodeGraphPort => Boolean(port))
    : undefined;
  if (value.ports !== undefined && !Array.isArray(value.ports)) {
    issues.push({ path: `${path}/ports`, message: 'Expected an array.' });
  }
  if (ports) {
    const portIds = new Set<string>();
    ports.forEach((port, portIndex) => {
      if (portIds.has(port.id)) {
        issues.push({
          path: `${path}/ports/${portIndex}/id`,
          message: `Duplicate port id: ${port.id}`,
        });
      }
      portIds.add(port.id);
    });
  }
  const executor =
    value.executor === undefined
      ? undefined
      : decodeCodeSlotBinding(value.executor, `${path}/executor`, issues);
  if (!id || !isPlainObject(value.data)) return null;
  return {
    id,
    ...(type ? { type } : {}),
    data: { ...value.data },
    ...(ports ? { ports } : {}),
    ...(executor ? { executor } : {}),
  };
};

const decodeEdge = (
  value: unknown,
  index: number,
  issues: NodeGraphDecodeIssue[]
): NodeGraphEdge | null => {
  const path = `/edges/${index}`;
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected an object.' });
    return null;
  }
  hasOnlyKeys(
    value,
    ['id', 'source', 'target', 'sourceHandle', 'targetHandle'],
    path,
    issues
  );
  const id = readRequiredId(value.id, `${path}/id`, issues);
  const source = readRequiredId(value.source, `${path}/source`, issues);
  const target = readRequiredId(value.target, `${path}/target`, issues);
  const sourceHandle = readOptionalHandle(
    value.sourceHandle,
    `${path}/sourceHandle`,
    issues
  );
  const targetHandle = readOptionalHandle(
    value.targetHandle,
    `${path}/targetHandle`,
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

/** Strictly decodes one canonical standalone `pir-graph` document content. */
export const decodeNodeGraphDocument = (
  value: unknown
): NodeGraphDecodeResult => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: '/', message: 'Expected a NodeGraph object.' }],
    };
  }
  const issues: NodeGraphDecodeIssue[] = [];
  hasOnlyKeys(value, ['version', 'nodes', 'edges'], '', issues);
  if (value.version !== 1) {
    issues.push({ path: '/version', message: 'Expected NodeGraph version 1.' });
  }
  if (!Array.isArray(value.nodes)) {
    issues.push({ path: '/nodes', message: 'Expected an array.' });
  }
  if (!Array.isArray(value.edges)) {
    issues.push({ path: '/edges', message: 'Expected an array.' });
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.edges)) {
    return { ok: false, issues };
  }

  const nodes: NodeGraphNode[] = [];
  const nodeIds = new Set<string>();
  value.nodes.forEach((candidate, index) => {
    const node = decodeNode(candidate, index, issues);
    if (!node) return;
    if (nodeIds.has(node.id)) {
      issues.push({
        path: `/nodes/${index}/id`,
        message: `Duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
    nodes.push(node);
  });
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  const edges: NodeGraphEdge[] = [];
  const edgeIds = new Set<string>();
  value.edges.forEach((candidate, index) => {
    const edge = decodeEdge(candidate, index, issues);
    if (!edge) return;
    if (edgeIds.has(edge.id)) {
      issues.push({
        path: `/edges/${index}/id`,
        message: `Duplicate edge id: ${edge.id}`,
      });
    }
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.source)) {
      issues.push({
        path: `/edges/${index}/source`,
        message: `Unknown source node: ${edge.source}`,
      });
    }
    if (!nodeIds.has(edge.target)) {
      issues.push({
        path: `/edges/${index}/target`,
        message: `Unknown target node: ${edge.target}`,
      });
    }
    const sourceNode = nodesById.get(edge.source);
    const targetNode = nodesById.get(edge.target);
    const sourcePort =
      typeof edge.sourceHandle === 'string'
        ? sourceNode?.ports?.find((port) => port.id === edge.sourceHandle)
        : undefined;
    const targetPort =
      typeof edge.targetHandle === 'string'
        ? targetNode?.ports?.find((port) => port.id === edge.targetHandle)
        : undefined;
    if (
      sourceNode?.ports &&
      typeof edge.sourceHandle === 'string' &&
      (!sourcePort || sourcePort.direction !== 'output')
    ) {
      issues.push({
        path: `/edges/${index}/sourceHandle`,
        message: `Unknown output port: ${edge.sourceHandle}`,
      });
    }
    if (
      targetNode?.ports &&
      typeof edge.targetHandle === 'string' &&
      (!targetPort || targetPort.direction !== 'input')
    ) {
      issues.push({
        path: `/edges/${index}/targetHandle`,
        message: `Unknown input port: ${edge.targetHandle}`,
      });
    }
    if (
      sourcePort &&
      targetPort &&
      (sourcePort.kind !== targetPort.kind ||
        (sourcePort.typeRef &&
          targetPort.typeRef &&
          sourcePort.typeRef !== targetPort.typeRef))
    ) {
      issues.push({
        path: `/edges/${index}`,
        message: `Incompatible ports: ${edge.sourceHandle} -> ${edge.targetHandle}`,
      });
    }
    edges.push(edge);
  });

  return issues.length
    ? { ok: false, issues }
    : { ok: true, value: { version: 1, nodes, edges } };
};
