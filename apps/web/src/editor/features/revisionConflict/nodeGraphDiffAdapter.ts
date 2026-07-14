import type {
  WorkspaceChangeValue,
  WorkspaceConflictResolutionChoice,
  WorkspaceMergeConflict,
  WorkspaceSemanticChange,
} from '@prodivix/workspace-sync';
import type {
  NodeGraphDiffEdgePresentation,
  NodeGraphDiffFieldPresentation,
  NodeGraphDiffNodePresentation,
  NodeGraphDiffStatus,
} from './revisionConflictPresentation';
import type {
  NodeGraphRevisionDiffPresentation,
  WorkspaceThreeWayPresentationInput,
} from './revisionConflictAdapterTypes';
import {
  createNodeGraphProjectionKey,
  indexSnapshotNodeGraphs,
  type NodeGraphSnapshotProjection,
} from './nodeGraphDiffIndex';
import {
  asNonEmptyString,
  formatWorkspaceChangeValue,
  isRecord,
  uniqueSorted,
} from './revisionConflictAdapterUtils';

type ChangeSide = 'local' | 'remote';
type GraphEntityKind = 'node' | 'edge';

type FieldAggregate = {
  conflicts: WorkspaceMergeConflict[];
  local?: WorkspaceSemanticChange;
  remote?: WorkspaceSemanticChange;
};

type EntityAggregate = {
  conflicts: WorkspaceMergeConflict[];
  fields: Map<string, FieldAggregate>;
  localChanges: WorkspaceSemanticChange[];
  remoteChanges: WorkspaceSemanticChange[];
};

type GraphAggregate = {
  conflictIds: Set<string>;
  documentId: string;
  edges: Map<string, EntityAggregate>;
  nodes: Map<string, EntityAggregate>;
  structure: EntityAggregate;
};

type GraphProjectionSet = {
  base?: NodeGraphSnapshotProjection;
  candidate?: NodeGraphSnapshotProjection;
  local?: NodeGraphSnapshotProjection;
  remote?: NodeGraphSnapshotProjection;
};

type GraphProjectionIndexes = {
  base: Map<string, NodeGraphSnapshotProjection>;
  candidate: Map<string, NodeGraphSnapshotProjection>;
  local: Map<string, NodeGraphSnapshotProjection>;
  remote: Map<string, NodeGraphSnapshotProjection>;
};

type NodeGraphAdapterResult = {
  presentations: NodeGraphRevisionDiffPresentation[];
  representedConflictIds: Set<string>;
};

const createEntityAggregate = (): EntityAggregate => ({
  conflicts: [],
  fields: new Map(),
  localChanges: [],
  remoteChanges: [],
});

const createGraphAggregate = (documentId: string): GraphAggregate => ({
  conflictIds: new Set(),
  documentId,
  edges: new Map(),
  nodes: new Map(),
  structure: createEntityAggregate(),
});

const ensureEntity = (
  entities: Map<string, EntityAggregate>,
  entityId: string
): EntityAggregate => {
  const current = entities.get(entityId) ?? createEntityAggregate();
  entities.set(entityId, current);
  return current;
};

const ensureField = (
  aggregate: EntityAggregate,
  path: string
): FieldAggregate => {
  const current = aggregate.fields.get(path) ?? { conflicts: [] };
  aggregate.fields.set(path, current);
  return current;
};

const changeRecordScore = (change: WorkspaceSemanticChange): number => {
  const state = change.next.present ? change.next : change.base;
  if (!state.present || !isRecord(state.value)) return 0;
  if (
    isRecord(state.value.data) ||
    typeof state.value.source === 'string' ||
    typeof state.value.target === 'string' ||
    typeof state.value.type === 'string'
  ) {
    return 2;
  }
  return 1;
};

const collectGraphChange = (
  graph: GraphAggregate,
  change: WorkspaceSemanticChange,
  side: ChangeSide
) => {
  const semantic = change.semantic;
  let aggregate: EntityAggregate;
  let fieldPath: string;
  if (semantic.kind === 'graph-node') {
    aggregate = ensureEntity(graph.nodes, semantic.nodeId);
    fieldPath = semantic.fieldPath;
  } else if (semantic.kind === 'graph-edge') {
    aggregate = ensureEntity(graph.edges, semantic.edgeId);
    fieldPath = semantic.fieldPath;
  } else if (semantic.kind === 'graph-structure') {
    aggregate = graph.structure;
    fieldPath = semantic.fieldPath;
  } else {
    return;
  }
  aggregate[side === 'local' ? 'localChanges' : 'remoteChanges'].push(change);
  const field = ensureField(aggregate, fieldPath);
  if (
    !field[side] ||
    changeRecordScore(change) > changeRecordScore(field[side])
  ) {
    field[side] = change;
  }
};

const collectGraphConflict = (
  graph: GraphAggregate,
  conflict: WorkspaceMergeConflict
) => {
  const semantic = conflict.semantic;
  let aggregate: EntityAggregate;
  let fieldPath: string;
  if (semantic.kind === 'graph-node') {
    aggregate = ensureEntity(graph.nodes, semantic.nodeId);
    fieldPath = semantic.fieldPath;
  } else if (semantic.kind === 'graph-edge') {
    aggregate = ensureEntity(graph.edges, semantic.edgeId);
    fieldPath = semantic.fieldPath;
  } else if (semantic.kind === 'graph-structure') {
    aggregate = graph.structure;
    fieldPath = semantic.fieldPath;
  } else {
    return;
  }
  graph.conflictIds.add(conflict.id);
  aggregate.conflicts.push(conflict);
  ensureField(aggregate, fieldPath).conflicts.push(conflict);
};

const graphRefFromSemantic = (
  change: WorkspaceSemanticChange | WorkspaceMergeConflict
): { documentId: string } | undefined => {
  if (change.target.kind !== 'document') return undefined;
  const semantic = change.semantic;
  if (
    (semantic.kind !== 'graph-node' &&
      semantic.kind !== 'graph-edge' &&
      semantic.kind !== 'graph-structure') ||
    semantic.graphKind !== 'nodegraph'
  ) {
    return undefined;
  }
  return { documentId: change.target.documentId };
};

const collectGraphAggregates = (
  input: WorkspaceThreeWayPresentationInput,
  projectionIndexes: GraphProjectionIndexes
): Map<string, GraphAggregate> => {
  const graphs = new Map<string, GraphAggregate>();
  const ensureGraph = (documentId: string) => {
    const key = createNodeGraphProjectionKey(documentId);
    const graph = graphs.get(key) ?? createGraphAggregate(documentId);
    graphs.set(key, graph);
    return graph;
  };
  const collectChanges = (
    changes: readonly WorkspaceSemanticChange[],
    side: ChangeSide
  ) =>
    changes.forEach((change) => {
      const ref = graphRefFromSemantic(change);
      if (ref) collectGraphChange(ensureGraph(ref.documentId), change, side);
    });
  collectChanges(input.analysis.localChanges.changes, 'local');
  collectChanges(input.analysis.remoteChanges.changes, 'remote');
  const structuralDocumentConflicts: WorkspaceMergeConflict[] = [];
  input.analysis.conflicts.forEach((conflict) => {
    const ref = graphRefFromSemantic(conflict);
    if (ref) {
      collectGraphConflict(ensureGraph(ref.documentId), conflict);
    } else if (
      conflict.kind === 'structural' &&
      conflict.target.kind === 'document' &&
      conflict.target.area === 'content'
    ) {
      structuralDocumentConflicts.push(conflict);
    }
  });
  structuralDocumentConflicts.forEach((conflict) => {
    if (conflict.target.kind !== 'document') return;
    const documentId = conflict.target.documentId;
    [
      projectionIndexes.base,
      projectionIndexes.local,
      projectionIndexes.remote,
      projectionIndexes.candidate,
    ].forEach((index) => {
      index.forEach((projection) => {
        if (projection.documentId === documentId) {
          ensureGraph(documentId);
        }
      });
    });
    graphs.forEach((graph) => {
      if (graph.documentId !== documentId) return;
      graph.conflictIds.add(conflict.id);
      [...graph.nodes.values(), ...graph.edges.values()].forEach((entity) => {
        if (!entity.localChanges.length || !entity.remoteChanges.length) return;
        entity.conflicts.push(conflict);
        entity.fields.forEach((field) => {
          if (field.local && field.remote) field.conflicts.push(conflict);
        });
      });
    });
  });
  return graphs;
};

const buildProjectionIndexes = (
  input: WorkspaceThreeWayPresentationInput
): GraphProjectionIndexes => ({
  base: indexSnapshotNodeGraphs(input.baseSnapshot),
  candidate: indexSnapshotNodeGraphs(input.analysis.candidateSnapshot),
  local: indexSnapshotNodeGraphs(input.localSnapshot),
  remote: indexSnapshotNodeGraphs(input.remoteSnapshot),
});

const resolveProjectionSet = (
  key: string,
  indexes: GraphProjectionIndexes
): GraphProjectionSet => ({
  base: indexes.base.get(key),
  candidate: indexes.candidate.get(key),
  local: indexes.local.get(key),
  remote: indexes.remote.get(key),
});

const resolveState = (
  field: FieldAggregate,
  side: ChangeSide | 'base'
): WorkspaceChangeValue => {
  const conflict = field.conflicts.find(
    (current) =>
      current.semantic.kind === 'graph-node' ||
      current.semantic.kind === 'graph-edge' ||
      current.semantic.kind === 'graph-structure'
  );
  if (conflict) return conflict[side];
  const base = field.local?.base ?? field.remote?.base ?? { present: false };
  if (side === 'base') return base;
  return field[side]?.next ?? base;
};

const buildFieldPresentations = (
  aggregate: EntityAggregate
): NodeGraphDiffFieldPresentation[] =>
  [...aggregate.fields.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, field]) => {
      const conflictIds = uniqueSorted(
        field.conflicts.map((conflict) => conflict.id)
      );
      return {
        base: formatWorkspaceChangeValue(resolveState(field, 'base')),
        ...(conflictIds.length ? { conflictIds } : {}),
        ...(conflictIds.length ? { isConflict: true } : {}),
        local: formatWorkspaceChangeValue(resolveState(field, 'local')),
        path: path || '/',
        remote: formatWorkspaceChangeValue(resolveState(field, 'remote')),
      };
    });

const resolveAggregateStatus = (
  aggregate: EntityAggregate
): Exclude<NodeGraphDiffStatus, 'conflict-local' | 'conflict-remote'> => {
  const changes = [...aggregate.localChanges, ...aggregate.remoteChanges];
  if (!changes.length) return 'unchanged';
  const kinds = new Set(changes.map((change) => change.kind));
  if (kinds.size === 1 && kinds.has('add')) return 'added';
  if (kinds.size === 1 && kinds.has('delete')) return 'deleted';
  return 'modified';
};

const resolveAggregateResolution = (
  aggregate: EntityAggregate,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>
): WorkspaceConflictResolutionChoice | undefined => {
  const conflictIds = uniqueSorted(
    aggregate.conflicts.map((conflict) => conflict.id)
  );
  if (!conflictIds.length) return undefined;
  const choices = conflictIds.map((conflictId) => resolutions[conflictId]);
  const choice = choices[0];
  return choice && choices.every((current) => current === choice)
    ? choice
    : undefined;
};

const wholeEntityState = (
  aggregate: EntityAggregate,
  side: 'base' | ChangeSide
): WorkspaceChangeValue | undefined => {
  const changes =
    side === 'local'
      ? aggregate.localChanges
      : side === 'remote'
        ? aggregate.remoteChanges
        : [...aggregate.localChanges, ...aggregate.remoteChanges];
  for (const change of changes) {
    if (
      (change.semantic.kind !== 'graph-node' &&
        change.semantic.kind !== 'graph-edge') ||
      change.semantic.fieldPath
    ) {
      continue;
    }
    return side === 'base' ? change.base : change.next;
  }
  const conflict = aggregate.conflicts.find(
    (current) =>
      (current.semantic.kind === 'graph-node' ||
        current.semantic.kind === 'graph-edge') &&
      !current.semantic.fieldPath
  );
  return conflict?.[side];
};

const cloneProjectionValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(cloneProjectionValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      cloneProjectionValue(entry),
    ])
  );
};

const decodePointer = (path: string): string[] =>
  path
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));

const writeProjectedField = (
  record: Record<string, unknown>,
  path: string,
  state: WorkspaceChangeValue
) => {
  if (!path) return;
  const segments = decodePointer(path);
  let owner = record;
  segments.slice(0, -1).forEach((segment) => {
    const next = owner[segment];
    if (isRecord(next)) {
      owner = next;
      return;
    }
    const created: Record<string, unknown> = {};
    owner[segment] = created;
    owner = created;
  });
  const field = segments.at(-1);
  if (!field) return;
  if (state.present) owner[field] = cloneProjectionValue(state.value);
  else delete owner[field];
};

const materializeEntityRecord = (
  aggregate: EntityAggregate,
  side: 'base' | ChangeSide,
  baseline: Record<string, unknown> | undefined
): Record<string, unknown> | undefined => {
  const whole = wholeEntityState(aggregate, side);
  if (whole) {
    return whole.present && isRecord(whole.value)
      ? (cloneProjectionValue(whole.value) as Record<string, unknown>)
      : undefined;
  }
  if (!baseline) return undefined;
  const projected = cloneProjectionValue(baseline) as Record<string, unknown>;
  aggregate.fields.forEach((field, path) => {
    writeProjectedField(projected, path, resolveState(field, side));
  });
  return projected;
};

const recordsForEntity = (
  entityId: string,
  kind: GraphEntityKind,
  aggregate: EntityAggregate,
  projections: GraphProjectionSet
) => {
  const select = (projection: NodeGraphSnapshotProjection | undefined) =>
    projection?.[kind === 'node' ? 'nodesById' : 'edgesById'][entityId];
  const candidate = select(projections.candidate);
  const rawBase = select(projections.base);
  const base = rawBase ?? materializeEntityRecord(aggregate, 'base', candidate);
  return {
    base,
    candidate,
    local:
      select(projections.local) ??
      materializeEntityRecord(aggregate, 'local', base ?? candidate),
    remote:
      select(projections.remote) ??
      materializeEntityRecord(aggregate, 'remote', base ?? candidate),
  };
};

const resolveNodeLabel = (
  record: Record<string, unknown> | undefined,
  entityId: string
): string => {
  const data = record && isRecord(record.data) ? record.data : undefined;
  return (
    asNonEmptyString(data?.label) ??
    asNonEmptyString(record?.label) ??
    asNonEmptyString(record?.name) ??
    entityId
  );
};

const resolveNodeKind = (
  record: Record<string, unknown> | undefined
): string | undefined => {
  const data = record && isRecord(record.data) ? record.data : undefined;
  return (
    asNonEmptyString(data?.kind) ??
    asNonEmptyString(record?.type) ??
    asNonEmptyString(record?.kind)
  );
};

const resolveNodeDescription = (
  record: Record<string, unknown> | undefined
): string | undefined => {
  const data = record && isRecord(record.data) ? record.data : undefined;
  return (
    asNonEmptyString(data?.description) ?? asNonEmptyString(record?.description)
  );
};

const fallbackPosition = (index: number) => ({
  x: (index % 4) * 280,
  y: Math.floor(index / 4) * 180,
});

const resolvePosition = (
  entityId: string,
  index: number,
  projections: readonly (NodeGraphSnapshotProjection | undefined)[]
) => {
  for (const projection of projections) {
    const position = projection?.positionsByNodeId[entityId];
    if (position) return position;
  }
  return fallbackPosition(index);
};

const createNodePresentation = (
  entityId: string,
  record: Record<string, unknown> | undefined,
  position: { x: number; y: number },
  status: NodeGraphDiffStatus,
  aggregate: EntityAggregate,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>
): NodeGraphDiffNodePresentation => {
  const conflictIds = uniqueSorted(
    aggregate.conflicts.map((conflict) => conflict.id)
  );
  const side =
    status === 'conflict-local'
      ? 'local'
      : status === 'conflict-remote'
        ? 'remote'
        : undefined;
  return {
    changedFields: buildFieldPresentations(aggregate),
    ...(conflictIds.length ? { conflictIds } : {}),
    description: resolveNodeDescription(record),
    entityId,
    label: resolveNodeLabel(record, entityId),
    nodeKind: resolveNodeKind(record),
    position,
    resolution: resolveAggregateResolution(aggregate, resolutions),
    status,
    visualId: `node:${entityId}${side ? `::${side}` : ''}`,
  };
};

const buildNodePresentations = (
  graph: GraphAggregate,
  projections: GraphProjectionSet,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>
) => {
  const allNodeIds = uniqueSorted([
    ...graph.nodes.keys(),
    ...Object.keys(projections.base?.nodesById ?? {}),
    ...Object.keys(projections.local?.nodesById ?? {}),
    ...Object.keys(projections.remote?.nodesById ?? {}),
    ...Object.keys(projections.candidate?.nodesById ?? {}),
  ]);
  const presentations: NodeGraphDiffNodePresentation[] = [];
  const conflictedNodeIds = new Set<string>();
  allNodeIds.forEach((entityId, index) => {
    const aggregate = graph.nodes.get(entityId) ?? createEntityAggregate();
    const records = recordsForEntity(entityId, 'node', aggregate, projections);
    if (aggregate.conflicts.length) {
      conflictedNodeIds.add(entityId);
      const localPosition = resolvePosition(entityId, index, [
        projections.local,
        projections.base,
        projections.candidate,
      ]);
      const rawRemotePosition = resolvePosition(entityId, index, [
        projections.remote,
        projections.candidate,
        projections.base,
      ]);
      const remotePosition =
        rawRemotePosition.x === localPosition.x &&
        rawRemotePosition.y === localPosition.y
          ? { x: rawRemotePosition.x + 44, y: rawRemotePosition.y + 44 }
          : rawRemotePosition;
      presentations.push(
        createNodePresentation(
          entityId,
          records.local ?? records.base ?? records.candidate,
          localPosition,
          'conflict-local',
          aggregate,
          resolutions
        ),
        createNodePresentation(
          entityId,
          records.remote ?? records.base ?? records.candidate,
          remotePosition,
          'conflict-remote',
          aggregate,
          resolutions
        )
      );
      return;
    }
    const status = resolveAggregateStatus(aggregate);
    const record =
      status === 'deleted'
        ? (records.base ?? records.remote ?? records.local)
        : (records.candidate ??
          records.local ??
          records.remote ??
          records.base);
    presentations.push(
      createNodePresentation(
        entityId,
        record,
        resolvePosition(entityId, index, [
          status === 'deleted' ? projections.base : projections.candidate,
          projections.local,
          projections.remote,
          projections.base,
        ]),
        status,
        aggregate,
        resolutions
      )
    );
  });
  return { conflictedNodeIds, presentations };
};

const resolveEdgeEndpoint = (
  record: Record<string, unknown> | undefined,
  field: 'source' | 'target'
): string | undefined => asNonEmptyString(record?.[field]);

const resolveEdgeLabel = (
  record: Record<string, unknown> | undefined
): string | undefined =>
  asNonEmptyString(record?.label) ?? asNonEmptyString(record?.type);

const createEdgePresentation = (
  entityId: string,
  record: Record<string, unknown>,
  status: NodeGraphDiffStatus,
  aggregate: EntityAggregate,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>,
  conflictedNodeIds: ReadonlySet<string>
): NodeGraphDiffEdgePresentation | undefined => {
  const sourceId = resolveEdgeEndpoint(record, 'source');
  const targetId = resolveEdgeEndpoint(record, 'target');
  if (!sourceId || !targetId) return undefined;
  const side =
    status === 'conflict-local'
      ? 'local'
      : status === 'conflict-remote'
        ? 'remote'
        : undefined;
  const endpointVisualId = (nodeId: string) =>
    `node:${nodeId}${
      conflictedNodeIds.has(nodeId) ? `::${side ?? 'remote'}` : ''
    }`;
  const conflictIds = uniqueSorted(
    aggregate.conflicts.map((conflict) => conflict.id)
  );
  return {
    changedFields: buildFieldPresentations(aggregate),
    ...(conflictIds.length ? { conflictIds } : {}),
    entityId,
    label: resolveEdgeLabel(record),
    resolution: resolveAggregateResolution(aggregate, resolutions),
    sourceVisualId: endpointVisualId(sourceId),
    status,
    targetVisualId: endpointVisualId(targetId),
    visualId: `edge:${entityId}${side ? `::${side}` : ''}`,
  };
};

const buildEdgePresentations = (
  graph: GraphAggregate,
  projections: GraphProjectionSet,
  resolutions: Readonly<Record<string, WorkspaceConflictResolutionChoice>>,
  conflictedNodeIds: ReadonlySet<string>
): NodeGraphDiffEdgePresentation[] => {
  const allEdgeIds = uniqueSorted([
    ...graph.edges.keys(),
    ...Object.keys(projections.base?.edgesById ?? {}),
    ...Object.keys(projections.local?.edgesById ?? {}),
    ...Object.keys(projections.remote?.edgesById ?? {}),
    ...Object.keys(projections.candidate?.edgesById ?? {}),
  ]);
  return allEdgeIds.flatMap((entityId) => {
    const aggregate = graph.edges.get(entityId) ?? createEntityAggregate();
    const records = recordsForEntity(entityId, 'edge', aggregate, projections);
    if (aggregate.conflicts.length) {
      const local = records.local ?? records.base ?? records.candidate;
      const remote = records.remote ?? records.base ?? records.candidate;
      return [
        local
          ? createEdgePresentation(
              entityId,
              local,
              'conflict-local',
              aggregate,
              resolutions,
              conflictedNodeIds
            )
          : undefined,
        remote
          ? createEdgePresentation(
              entityId,
              remote,
              'conflict-remote',
              aggregate,
              resolutions,
              conflictedNodeIds
            )
          : undefined,
      ].filter(
        (edge): edge is NodeGraphDiffEdgePresentation => edge !== undefined
      );
    }
    const status = resolveAggregateStatus(aggregate);
    const record =
      status === 'deleted'
        ? (records.base ?? records.remote ?? records.local)
        : (records.candidate ??
          records.local ??
          records.remote ??
          records.base);
    if (!record) return [];
    const touchesConflict = [
      resolveEdgeEndpoint(record, 'source'),
      resolveEdgeEndpoint(record, 'target'),
    ].some((nodeId) => nodeId && conflictedNodeIds.has(nodeId));
    if (status === 'unchanged' && touchesConflict) {
      return (['conflict-local', 'conflict-remote'] as const).flatMap(
        (side) => {
          const edge = createEdgePresentation(
            entityId,
            record,
            side,
            aggregate,
            resolutions,
            conflictedNodeIds
          );
          return edge ? [edge] : [];
        }
      );
    }
    const edge = createEdgePresentation(
      entityId,
      record,
      status,
      aggregate,
      resolutions,
      conflictedNodeIds
    );
    return edge ? [edge] : [];
  });
};

const resolveProjectionMetadata = (
  graph: GraphAggregate,
  projections: GraphProjectionSet,
  input: WorkspaceThreeWayPresentationInput
) => {
  const projection =
    projections.candidate ??
    projections.remote ??
    projections.local ??
    projections.base;
  const document =
    input.localSnapshot?.docsById[graph.documentId] ??
    input.remoteSnapshot?.docsById[graph.documentId] ??
    input.baseSnapshot?.docsById[graph.documentId] ??
    input.analysis.candidateSnapshot.docsById[graph.documentId];
  return {
    documentPath:
      projection?.documentPath ?? document?.path ?? graph.documentId,
    graphLabel: projection?.graphLabel ?? document?.name ?? graph.documentId,
  };
};

/** Projects stable graph semantic changes and conflicts into read-only canvas data. */
export const adaptNodeGraphDiffs = (
  input: WorkspaceThreeWayPresentationInput
): NodeGraphAdapterResult => {
  const projectionIndexes = buildProjectionIndexes(input);
  const graphs = collectGraphAggregates(input, projectionIndexes);
  const resolutions = input.resolutions ?? {};
  const representedConflictIds = new Set<string>();
  const presentations = [...graphs.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, graph]) => {
      graph.conflictIds.forEach((conflictId) =>
        representedConflictIds.add(conflictId)
      );
      const projections = resolveProjectionSet(key, projectionIndexes);
      const nodes = buildNodePresentations(graph, projections, resolutions);
      const metadata = resolveProjectionMetadata(graph, projections, input);
      return {
        changedFields: buildFieldPresentations(graph.structure),
        conflictIds: uniqueSorted(graph.conflictIds),
        documentId: graph.documentId,
        documentPath: metadata.documentPath,
        edges: buildEdgePresentations(
          graph,
          projections,
          resolutions,
          nodes.conflictedNodeIds
        ),
        graphLabel: metadata.graphLabel,
        nodes: nodes.presentations,
      };
    });
  return { presentations, representedConflictIds };
};
