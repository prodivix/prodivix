import {
  compareUnicodeCodePoints,
  sameCanonicalJson,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type { NodeGraphDecodeIssue } from './nodeGraph.types';
import { NODEGRAPH_CURRENT_WIRE_VERSION } from './wire';

type WireRecord = Record<string, unknown>;

export type NodeGraphWireUpgradeResult =
  | Readonly<{
      ok: true;
      value: unknown;
      sourceWireVersion: number;
      appliedMigrations: readonly Readonly<{
        fromVersion: number;
        toVersion: number;
      }>[];
    }>
  | Readonly<{ ok: false; issues: readonly NodeGraphDecodeIssue[] }>;

const V1_DOCUMENT_FIELDS = new Set(['version', 'nodes', 'edges']);
const V1_NODE_FIELDS = new Set(['id', 'type', 'data', 'ports', 'executor']);
const V1_PORT_FIELDS = new Set([
  'id',
  'direction',
  'kind',
  'typeRef',
  'required',
  'multiple',
]);
const V1_EDGE_FIELDS = new Set([
  'id',
  'source',
  'target',
  'sourceHandle',
  'targetHandle',
]);
const LEGACY_LAYOUT_FIELD = 'x-prodivix-canvas-layout';

const readOwn = (
  value: WireRecord,
  key: string,
  path: string,
  issues: NodeGraphDecodeIssue[]
): unknown => {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!Object.hasOwn(descriptor, 'value')) {
    issues.push({
      path: `${path}/${key}`,
      message: 'Accessor-backed wire fields are not supported.',
    });
    return undefined;
  }
  return descriptor.value;
};

const rejectUnknownFields = (
  value: WireRecord,
  allowed: ReadonlySet<string>,
  path: string,
  issues: NodeGraphDecodeIssue[]
): void => {
  for (const key of Object.keys(value)) {
    if (isUnsafeObjectKey(key) || !allowed.has(key)) {
      issues.push({
        path: `${path}/${key}`,
        message: `Unknown persisted NodeGraph v1 field "${key}".`,
      });
    }
  }
};

const canonicalString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

const descriptorIdForLegacyNode = (
  node: WireRecord,
  data: WireRecord
): string | null => {
  const kind = readOwn(data, 'kind', '/data', []);
  if (canonicalString(kind)) return `core.${kind}`;
  const type = readOwn(node, 'type', '/type', []);
  return canonicalString(type) && type !== 'graphNode' ? `core.${type}` : null;
};

const legacyPort = (
  id: string,
  direction: 'input' | 'output',
  flow: 'control' | 'data',
  options: Readonly<{
    typeRef?: string;
    required?: boolean;
    cardinality?: 'single' | 'multiple';
  }> = {}
) => ({
  id,
  direction,
  flow,
  ...(options.typeRef ? { typeRef: options.typeRef } : {}),
  required: options.required ?? false,
  cardinality: options.cardinality ?? 'single',
});

const LEGACY_STATIC_PORTS: Readonly<
  Record<string, readonly ReturnType<typeof legacyPort>[]>
> = Object.freeze({
  'core.start': Object.freeze([
    legacyPort('out.control.next', 'output', 'control'),
  ]),
  'core.end': Object.freeze([
    legacyPort('in.control.prev', 'input', 'control', { required: true }),
  ]),
  'core.process': Object.freeze([
    legacyPort('in.control.prev', 'input', 'control', { required: true }),
    legacyPort('out.control.next', 'output', 'control'),
  ]),
  'core.log': Object.freeze([
    legacyPort('in.control.prev', 'input', 'control', { required: true }),
    legacyPort('out.control.next', 'output', 'control'),
  ]),
});

const migrateLegacyPort = (
  candidate: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): ReturnType<typeof legacyPort> | null => {
  if (!isPlainObject(candidate)) {
    issues.push({ path, message: 'Expected a NodeGraph v1 port object.' });
    return null;
  }
  rejectUnknownFields(candidate, V1_PORT_FIELDS, path, issues);
  const id = readOwn(candidate, 'id', path, issues);
  const direction = readOwn(candidate, 'direction', path, issues);
  const flow = readOwn(candidate, 'kind', path, issues);
  const typeRef = readOwn(candidate, 'typeRef', path, issues);
  const required = readOwn(candidate, 'required', path, issues);
  const multiple = readOwn(candidate, 'multiple', path, issues);
  if (
    !canonicalString(id) ||
    (direction !== 'input' && direction !== 'output') ||
    (flow !== 'control' && flow !== 'data') ||
    (typeRef !== undefined && !canonicalString(typeRef)) ||
    (required !== undefined && typeof required !== 'boolean') ||
    (multiple !== undefined && typeof multiple !== 'boolean') ||
    (flow === 'control' && typeRef !== undefined) ||
    (flow === 'data' && !canonicalString(typeRef))
  ) {
    issues.push({
      path,
      message: 'NodeGraph v1 port cannot be migrated to an exact typed port.',
    });
    return null;
  }
  return legacyPort(id, direction, flow, {
    ...(typeRef ? { typeRef } : {}),
    required: required ?? false,
    cardinality: multiple ? 'multiple' : 'single',
  });
};

const dynamicSwitchPorts = (
  nodeId: string,
  edges: readonly unknown[],
  issues: NodeGraphDecodeIssue[]
): readonly ReturnType<typeof legacyPort>[] | null => {
  const outputHandles = new Set<string>();
  for (const [index, candidate] of edges.entries()) {
    if (!isPlainObject(candidate)) continue;
    const source = readOwn(candidate, 'source', `/edges/${index}`, issues);
    if (source !== nodeId) continue;
    const handle = readOwn(
      candidate,
      'sourceHandle',
      `/edges/${index}`,
      issues
    );
    if (!canonicalString(handle)) {
      issues.push({
        path: `/edges/${index}/sourceHandle`,
        message:
          'Legacy switch edges require an exact output handle for migration.',
      });
      continue;
    }
    if (
      handle !== 'out.control.default' &&
      !handle.startsWith('out.control.case-')
    ) {
      issues.push({
        path: `/edges/${index}/sourceHandle`,
        message: 'Legacy switch output is not a recognized dynamic port.',
      });
      continue;
    }
    outputHandles.add(handle);
  }
  if (issues.length) return null;
  return Object.freeze([
    legacyPort('in.control.prev', 'input', 'control', { required: true }),
    legacyPort('in.data.condition', 'input', 'data', {
      typeRef: 'boolean',
      required: true,
    }),
    ...[...outputHandles]
      .sort(compareUnicodeCodePoints)
      .map((id) => legacyPort(id, 'output', 'control')),
  ]);
};

const migrateLegacyEditor = (
  data: WireRecord,
  path: string,
  issues: NodeGraphDecodeIssue[]
): WireRecord => {
  const editor: WireRecord = {};
  const layout = readOwn(data, LEGACY_LAYOUT_FIELD, path, issues);
  if (layout !== undefined) {
    if (
      !isPlainObject(layout) ||
      readOwn(layout, 'version', path, issues) !== 1
    ) {
      issues.push({
        path: `${path}/${LEGACY_LAYOUT_FIELD}`,
        message: 'Legacy NodeGraph canvas layout is invalid.',
      });
    } else {
      const x = readOwn(layout, 'x', path, issues);
      const y = readOwn(layout, 'y', path, issues);
      if (
        typeof x !== 'number' ||
        !Number.isFinite(x) ||
        typeof y !== 'number' ||
        !Number.isFinite(y)
      ) {
        issues.push({
          path: `${path}/${LEGACY_LAYOUT_FIELD}`,
          message: 'Legacy NodeGraph canvas position must be finite.',
        });
      } else {
        editor.position = { x, y };
      }
      const parentId = readOwn(layout, 'parentId', path, issues);
      const extent = readOwn(layout, 'extent', path, issues);
      const zIndex = readOwn(layout, 'zIndex', path, issues);
      const collapsed = readOwn(layout, 'collapsed', path, issues);
      if (parentId !== undefined && canonicalString(parentId)) {
        editor.parentId = parentId;
      }
      if (extent === 'parent') editor.extent = extent;
      if (Number.isSafeInteger(zIndex)) editor.zIndex = zIndex;
      if (typeof collapsed === 'boolean') editor.collapsed = collapsed;
    }
  }
  const label = readOwn(data, 'label', path, issues);
  if (canonicalString(label)) editor.label = label;
  return editor;
};

const migrateLegacyConfiguration = (
  data: WireRecord,
  path: string,
  issues: NodeGraphDecodeIssue[]
): WireRecord => {
  const configuration: WireRecord = {};
  for (const key of Object.keys(data).sort(compareUnicodeCodePoints)) {
    if (key === 'kind' || key === 'label' || key === LEGACY_LAYOUT_FIELD) {
      continue;
    }
    if (isUnsafeObjectKey(key)) {
      issues.push({
        path: `${path}/${key}`,
        message: 'Unsafe NodeGraph configuration key.',
      });
      continue;
    }
    const value = readOwn(data, key, path, issues);
    configuration[key] = value;
  }
  return configuration;
};

const resolveMigratedPort = (
  node: WireRecord,
  direction: 'input' | 'output',
  requested: unknown,
  edgePath: string,
  issues: NodeGraphDecodeIssue[]
): string | null => {
  const ports = Array.isArray(node.ports)
    ? node.ports.filter(
        (port): port is WireRecord =>
          isPlainObject(port) &&
          port.direction === direction &&
          canonicalString(port.id)
      )
    : [];
  if (canonicalString(requested)) {
    if (ports.some((port) => port.id === requested)) return requested;
    issues.push({
      path: edgePath,
      message: `Legacy edge references unknown ${direction} port "${requested}".`,
    });
    return null;
  }
  if (requested !== undefined && requested !== null) {
    issues.push({
      path: edgePath,
      message: 'Legacy edge handle must be a canonical string or null.',
    });
    return null;
  }
  if (ports.length === 1) return ports[0]!.id as string;
  issues.push({
    path: edgePath,
    message:
      'Legacy node-level edge is ambiguous and requires an explicit port mapping.',
  });
  return null;
};

const migrateNodeGraphWireV1ToV2 = (
  source: WireRecord
): NodeGraphWireUpgradeResult => {
  const issues: NodeGraphDecodeIssue[] = [];
  rejectUnknownFields(source, V1_DOCUMENT_FIELDS, '', issues);
  const legacyNodes = readOwn(source, 'nodes', '', issues);
  const legacyEdges = readOwn(source, 'edges', '', issues);
  if (!Array.isArray(legacyNodes) || !Array.isArray(legacyEdges)) {
    return {
      ok: false,
      issues: [
        ...issues,
        {
          path: '/',
          message: 'NodeGraph v1 requires node and edge arrays.',
        },
      ],
    };
  }

  const migratedNodes: WireRecord[] = [];
  const nodeById = new Map<string, WireRecord>();
  legacyNodes.forEach((candidate, index) => {
    const path = `/nodes/${index}`;
    if (!isPlainObject(candidate)) {
      issues.push({ path, message: 'Expected a NodeGraph v1 node object.' });
      return;
    }
    rejectUnknownFields(candidate, V1_NODE_FIELDS, path, issues);
    const id = readOwn(candidate, 'id', path, issues);
    const data = readOwn(candidate, 'data', path, issues);
    if (!canonicalString(id) || !isPlainObject(data)) {
      issues.push({
        path,
        message: 'NodeGraph v1 node requires canonical id and object data.',
      });
      return;
    }
    const descriptorId = descriptorIdForLegacyNode(candidate, data);
    if (!descriptorId) {
      issues.push({
        path: `${path}/data/kind`,
        message: 'Legacy node has no uniquely resolvable descriptor identity.',
      });
      return;
    }
    const legacyPorts = readOwn(candidate, 'ports', path, issues);
    let ports: readonly WireRecord[] | null = null;
    if (Array.isArray(legacyPorts) && legacyPorts.length > 0) {
      ports = legacyPorts
        .map((port, portIndex) =>
          migrateLegacyPort(port, `${path}/ports/${portIndex}`, issues)
        )
        .filter((port): port is ReturnType<typeof legacyPort> => Boolean(port));
    } else if (legacyPorts === undefined) {
      ports =
        LEGACY_STATIC_PORTS[descriptorId] ??
        (descriptorId === 'core.switch'
          ? dynamicSwitchPorts(id, legacyEdges, issues)
          : null);
    } else {
      issues.push({
        path: `${path}/ports`,
        message: 'Legacy ports must be a non-empty array when present.',
      });
    }
    if (!ports?.length) {
      issues.push({
        path: `${path}/ports`,
        message:
          'Legacy node ports cannot be inferred uniquely from its descriptor.',
      });
      return;
    }
    const portIds = ports.map((port) => port.id).filter(canonicalString);
    const duplicate = portIds
      .sort(compareUnicodeCodePoints)
      .some((portId, portIndex, portIds) => portId === portIds[portIndex - 1]);
    if (duplicate) {
      issues.push({
        path: `${path}/ports`,
        message: 'Legacy node contains duplicate port identities.',
      });
      return;
    }
    const executor = readOwn(candidate, 'executor', path, issues);
    const migrated: WireRecord = {
      id,
      descriptorRef: { id: descriptorId, version: '1' },
      ports,
      configuration: migrateLegacyConfiguration(data, `${path}/data`, issues),
      editor: migrateLegacyEditor(data, `${path}/data`, issues),
      ...(executor !== undefined ? { codeSlot: executor } : {}),
    };
    if (nodeById.has(id)) {
      issues.push({
        path: `${path}/id`,
        message: `Duplicate legacy node id: ${id}.`,
      });
    }
    nodeById.set(id, migrated);
    migratedNodes.push(migrated);
  });

  const migratedEdges: WireRecord[] = [];
  legacyEdges.forEach((candidate, index) => {
    const path = `/edges/${index}`;
    if (!isPlainObject(candidate)) {
      issues.push({ path, message: 'Expected a NodeGraph v1 edge object.' });
      return;
    }
    rejectUnknownFields(candidate, V1_EDGE_FIELDS, path, issues);
    const id = readOwn(candidate, 'id', path, issues);
    const source = readOwn(candidate, 'source', path, issues);
    const target = readOwn(candidate, 'target', path, issues);
    if (
      !canonicalString(id) ||
      !canonicalString(source) ||
      !canonicalString(target)
    ) {
      issues.push({
        path,
        message: 'Legacy edge requires canonical id/source/target.',
      });
      return;
    }
    const sourceNode = nodeById.get(source);
    const targetNode = nodeById.get(target);
    if (!sourceNode || !targetNode) {
      issues.push({
        path,
        message: 'Legacy edge references a missing node.',
      });
      return;
    }
    const sourcePortId = resolveMigratedPort(
      sourceNode,
      'output',
      readOwn(candidate, 'sourceHandle', path, issues),
      `${path}/sourceHandle`,
      issues
    );
    const targetPortId = resolveMigratedPort(
      targetNode,
      'input',
      readOwn(candidate, 'targetHandle', path, issues),
      `${path}/targetHandle`,
      issues
    );
    if (!sourcePortId || !targetPortId) return;
    migratedEdges.push({
      id,
      source: { nodeId: source, portId: sourcePortId },
      target: { nodeId: target, portId: targetPortId },
    });
  });

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    value: {
      version: NODEGRAPH_CURRENT_WIRE_VERSION,
      nodes: migratedNodes,
      edges: migratedEdges,
    },
    sourceWireVersion: 1,
    appliedMigrations: Object.freeze([
      Object.freeze({ fromVersion: 1, toVersion: 2 }),
    ]),
  };
};

export const upgradeNodeGraphWireDocument = (
  value: unknown
): NodeGraphWireUpgradeResult => {
  try {
    if (!isPlainObject(value)) {
      return {
        ok: false,
        issues: [{ path: '/', message: 'Expected a NodeGraph wire object.' }],
      };
    }
    const issues: NodeGraphDecodeIssue[] = [];
    const version = readOwn(value, 'version', '', issues);
    if (issues.length) return { ok: false, issues };
    if (version === NODEGRAPH_CURRENT_WIRE_VERSION) {
      return {
        ok: true,
        value,
        sourceWireVersion: NODEGRAPH_CURRENT_WIRE_VERSION,
        appliedMigrations: Object.freeze([]),
      };
    }
    if (version === 1) return migrateNodeGraphWireV1ToV2(value);
    return {
      ok: false,
      issues: [
        {
          path: '/version',
          message: `Unsupported NodeGraph wire version: ${String(version)}.`,
        },
      ],
    };
  } catch {
    return {
      ok: false,
      issues: [
        {
          path: '/',
          message: 'NodeGraph wire migration rejected an unsafe value.',
        },
      ],
    };
  }
};

export const nodeGraphWireMigrationIsDeterministic = (
  value: unknown
): boolean => {
  const first = upgradeNodeGraphWireDocument(value);
  const second = upgradeNodeGraphWireDocument(value);
  return first.ok && second.ok && sameCanonicalJson(first, second);
};
