import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  canonicalJsonText,
  compareUnicodeCodePoints,
} from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  NodeGraphDocument,
  NodeGraphEdge,
  NodeGraphNode,
  NodeGraphPort,
} from './nodeGraph.types';

export type NodeGraphProgramValue =
  | null
  | boolean
  | number
  | string
  | readonly NodeGraphProgramValue[]
  | { readonly [key: string]: NodeGraphProgramValue };

export type NodeGraphRuntimeZone = 'client' | 'server' | 'test';

export type NodeGraphDescriptor = Readonly<{
  id: string;
  version: string;
  executorId: string;
  implementationDigest: string;
  configurationSchemaDigest: string;
  effect: 'pure' | 'temporary-state' | 'idempotent-effect' | 'mutation-effect';
  runtimeZones: readonly NodeGraphRuntimeZone[];
  requiredCapabilities: readonly string[];
  codeSlot: 'forbidden' | 'optional' | 'required';
  entry: boolean;
  terminal: boolean;
}>;

export type NodeGraphDescriptorRegistry = Readonly<{
  descriptors: readonly NodeGraphDescriptor[];
  digest: string;
  get(descriptorId: string): NodeGraphDescriptor | null;
}>;

export type NodeGraphDescriptorRegistryIssue = Readonly<{
  code: 'invalid-descriptor' | 'duplicate-descriptor';
  path: string;
  message: string;
}>;

export type CreateNodeGraphDescriptorRegistryResult =
  | Readonly<{
      ok: true;
      registry: NodeGraphDescriptorRegistry;
    }>
  | Readonly<{
      ok: false;
      issues: readonly NodeGraphDescriptorRegistryIssue[];
    }>;

export type NodeGraphPlanningIssue = Readonly<{
  code:
    | 'invalid-document-identity'
    | 'invalid-node'
    | 'duplicate-node'
    | 'missing-descriptor'
    | 'descriptor-version-incompatible'
    | 'runtime-zone-incompatible'
    | 'capability-unavailable'
    | 'code-slot-incompatible'
    | 'invalid-configuration'
    | 'invalid-port'
    | 'duplicate-port'
    | 'invalid-edge'
    | 'duplicate-edge'
    | 'duplicate-connection'
    | 'missing-node'
    | 'missing-port'
    | 'incompatible-port'
    | 'cardinality-violation'
    | 'required-input-missing'
    | 'entry-missing'
    | 'terminal-missing'
    | 'terminal-has-outgoing-control'
    | 'unreachable-node'
    | 'cycle'
    | 'invalid-loop-budget'
    | 'invalid-timeout-budget'
    | 'subgraph-missing'
    | 'subgraph-revision-drift'
    | 'subgraph-contract-drift'
    | 'subgraph-dependency-missing'
    | 'subgraph-dependency-cycle'
    | 'subgraph-capability-escalation'
    | 'subgraph-depth-exceeded';
  path: string;
  message: string;
}>;

export type NodeGraphProgramPort = Readonly<{
  id: string;
  direction: NodeGraphPort['direction'];
  flow: NodeGraphPort['flow'];
  typeRef?: string;
  required: boolean;
  cardinality: 'single' | 'multiple';
}>;

export type NodeGraphProgramNode = Readonly<{
  id: string;
  descriptorId: string;
  descriptorVersion: string;
  executorId: string;
  implementationDigest: string;
  effect: NodeGraphDescriptor['effect'];
  requiredCapabilities: readonly string[];
  configuration: NodeGraphProgramValue;
  codeSlotId?: string;
  dependencyNodeIds: readonly string[];
  ports: readonly NodeGraphProgramPort[];
}>;

export type NodeGraphProgramEdge = Readonly<{
  id: string;
  source: Readonly<{ nodeId: string; portId: string }>;
  target: Readonly<{ nodeId: string; portId: string }>;
  flow: NodeGraphPort['flow'];
  typeRef?: string;
}>;

export type NodeGraphResolvedSubgraph = Readonly<{
  documentId: string;
  documentRevision: number;
  contractDigest: string;
  programDigest: string;
  requiredCapabilities: readonly string[];
  dependencyDocumentIds: readonly string[];
}>;

export type NodeGraphProgramResourcePlan = Readonly<{
  maximumParallelism: number;
  maximumLoopIterations: number;
  maximumTimeoutTicks: number;
  temporaryStateNodeIds: readonly string[];
  effectNodeIds: readonly string[];
}>;

export type NodeGraphProgram = Readonly<{
  documentId: string;
  documentRevision: number;
  descriptorRegistryDigest: string;
  runtimeZone: NodeGraphRuntimeZone;
  requiredCapabilities: readonly string[];
  nodes: readonly NodeGraphProgramNode[];
  edges: readonly NodeGraphProgramEdge[];
  executionWaves: readonly (readonly string[])[];
  resolvedSubgraphs: readonly NodeGraphResolvedSubgraph[];
  resourcePlan: NodeGraphProgramResourcePlan;
  sourceTrace: readonly Readonly<{
    kind: 'node' | 'port' | 'edge';
    id: string;
    sourcePath: string;
  }>[];
  programDigest: string;
}>;

export type CompileNodeGraphProgramInput = Readonly<{
  documentId: string;
  documentRevision: number;
  graph: NodeGraphDocument;
  registry: NodeGraphDescriptorRegistry;
  runtimeZone: NodeGraphRuntimeZone;
  availableCapabilities: readonly string[];
  maximumNodes?: number;
  maximumEdges?: number;
  maximumConfigurationDepth?: number;
  maximumConfigurationNodes?: number;
  maximumConfigurationUtf8Bytes?: number;
  resolvedSubgraphs?: readonly NodeGraphResolvedSubgraph[];
  maximumSubgraphDepth?: number;
  maximumLoopIterations?: number;
  maximumTimeoutTicks?: number;
}>;

export type CompileNodeGraphProgramResult =
  | Readonly<{ ok: true; program: NodeGraphProgram }>
  | Readonly<{ ok: false; issues: readonly NodeGraphPlanningIssue[] }>;

const DIGEST_PATTERN = /^sha256-[a-f0-9]{64}$/u;
const RUNTIME_ZONES = new Set<NodeGraphRuntimeZone>([
  'client',
  'server',
  'test',
]);
const EFFECTS = new Set<NodeGraphDescriptor['effect']>([
  'pure',
  'temporary-state',
  'idempotent-effect',
  'mutation-effect',
]);
const CODE_SLOT_POLICIES = new Set<NodeGraphDescriptor['codeSlot']>([
  'forbidden',
  'optional',
  'required',
]);

export const digestNodeGraphProgramValue = (value: unknown): string =>
  `sha256-${bytesToHex(sha256(utf8ToBytes(canonicalJsonText(value))))}`;

const isCanonicalId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

const stableUniqueStrings = (
  values: readonly string[]
): readonly string[] | null => {
  if (!values.every(isCanonicalId)) return null;
  const sorted = [...values].sort(compareUnicodeCodePoints);
  return sorted.some((value, index) => value === sorted[index - 1])
    ? null
    : Object.freeze(sorted);
};

const freezeDescriptor = (
  descriptor: NodeGraphDescriptor
): NodeGraphDescriptor | null => {
  const runtimeZones = stableUniqueStrings(descriptor.runtimeZones);
  const requiredCapabilities = stableUniqueStrings(
    descriptor.requiredCapabilities
  );
  if (
    !isCanonicalId(descriptor.id) ||
    !isCanonicalId(descriptor.version) ||
    !isCanonicalId(descriptor.executorId) ||
    !DIGEST_PATTERN.test(descriptor.implementationDigest) ||
    !DIGEST_PATTERN.test(descriptor.configurationSchemaDigest) ||
    !EFFECTS.has(descriptor.effect) ||
    !runtimeZones?.length ||
    runtimeZones.some(
      (zone) => !RUNTIME_ZONES.has(zone as NodeGraphRuntimeZone)
    ) ||
    !requiredCapabilities ||
    !CODE_SLOT_POLICIES.has(descriptor.codeSlot) ||
    typeof descriptor.entry !== 'boolean' ||
    typeof descriptor.terminal !== 'boolean' ||
    (descriptor.entry && descriptor.terminal)
  ) {
    return null;
  }
  return Object.freeze({
    id: descriptor.id,
    version: descriptor.version,
    executorId: descriptor.executorId,
    implementationDigest: descriptor.implementationDigest,
    configurationSchemaDigest: descriptor.configurationSchemaDigest,
    effect: descriptor.effect,
    runtimeZones: runtimeZones as readonly NodeGraphRuntimeZone[],
    requiredCapabilities,
    codeSlot: descriptor.codeSlot,
    entry: descriptor.entry,
    terminal: descriptor.terminal,
  });
};

export const createNodeGraphDescriptorRegistry = (
  descriptors: readonly NodeGraphDescriptor[]
): CreateNodeGraphDescriptorRegistryResult => {
  const issues: NodeGraphDescriptorRegistryIssue[] = [];
  const normalized = descriptors
    .map((descriptor, index) => {
      const frozen = freezeDescriptor(descriptor);
      if (!frozen) {
        issues.push({
          code: 'invalid-descriptor',
          path: `/descriptors/${index}`,
          message:
            'NodeGraph descriptors require canonical identity, digests, zones, capabilities, effect, and lifecycle flags.',
        });
      }
      return frozen;
    })
    .filter((descriptor): descriptor is NodeGraphDescriptor =>
      Boolean(descriptor)
    )
    .sort((left, right) => compareUnicodeCodePoints(left.id, right.id));
  normalized.forEach((descriptor, index) => {
    if (descriptor.id === normalized[index - 1]?.id) {
      issues.push({
        code: 'duplicate-descriptor',
        path: `/descriptors/${index}/id`,
        message: `Duplicate NodeGraph descriptor: ${descriptor.id}.`,
      });
    }
  });
  if (issues.length) {
    return Object.freeze({ ok: false, issues: Object.freeze(issues) });
  }
  const frozenDescriptors = Object.freeze(normalized);
  const byId = new Map(
    frozenDescriptors.map((descriptor) => [descriptor.id, descriptor])
  );
  return Object.freeze({
    ok: true,
    registry: Object.freeze({
      descriptors: frozenDescriptors,
      digest: digestNodeGraphProgramValue(frozenDescriptors),
      get(descriptorId: string) {
        return byId.get(descriptorId) ?? null;
      },
    }),
  });
};

const INVALID_PROGRAM_VALUE = Symbol('invalid-nodegraph-program-value');
type ProgramValueClone = NodeGraphProgramValue | typeof INVALID_PROGRAM_VALUE;

export const readNodeGraphProgramValue = (
  value: unknown,
  options: Readonly<{
    maximumDepth: number;
    maximumNodes: number;
    maximumUtf8Bytes: number;
  }>
): NodeGraphProgramValue | undefined => {
  let nodes = 0;
  let utf8Bytes = 0;
  const ancestors = new Set<object>();
  const consume = (text: string): boolean => {
    utf8Bytes += utf8ToBytes(text).byteLength;
    return utf8Bytes <= options.maximumUtf8Bytes;
  };
  const clone = (candidate: unknown, depth: number): ProgramValueClone => {
    nodes += 1;
    if (nodes > options.maximumNodes || depth > options.maximumDepth) {
      return INVALID_PROGRAM_VALUE;
    }
    if (candidate === null) {
      return consume('null') ? null : INVALID_PROGRAM_VALUE;
    }
    if (typeof candidate === 'boolean') {
      return consume(String(candidate)) ? candidate : INVALID_PROGRAM_VALUE;
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return consume(JSON.stringify(candidate))
        ? candidate
        : INVALID_PROGRAM_VALUE;
    }
    if (typeof candidate === 'string') {
      return consume(JSON.stringify(candidate))
        ? candidate
        : INVALID_PROGRAM_VALUE;
    }
    if (!candidate || typeof candidate !== 'object') {
      return INVALID_PROGRAM_VALUE;
    }
    if (ancestors.has(candidate)) return INVALID_PROGRAM_VALUE;
    ancestors.add(candidate);
    try {
      if (Array.isArray(candidate)) {
        const descriptors = Object.getOwnPropertyDescriptors(candidate);
        const keys = Object.keys(candidate);
        if (
          keys.length !== candidate.length ||
          keys.some((key, index) => key !== String(index)) ||
          !consume('[')
        ) {
          return INVALID_PROGRAM_VALUE;
        }
        const output: NodeGraphProgramValue[] = [];
        for (let index = 0; index < candidate.length; index += 1) {
          if (index > 0 && !consume(',')) return INVALID_PROGRAM_VALUE;
          const descriptor = descriptors[String(index)];
          if (!descriptor || !('value' in descriptor)) {
            return INVALID_PROGRAM_VALUE;
          }
          const cloned = clone(descriptor.value, depth + 1);
          if (cloned === INVALID_PROGRAM_VALUE) return INVALID_PROGRAM_VALUE;
          output.push(cloned);
        }
        return consume(']') ? Object.freeze(output) : INVALID_PROGRAM_VALUE;
      }
      if (!isPlainObject(candidate) || !consume('{')) {
        return INVALID_PROGRAM_VALUE;
      }
      const descriptors = Object.getOwnPropertyDescriptors(candidate);
      const keys = Object.keys(candidate).sort(compareUnicodeCodePoints);
      const output: Record<string, NodeGraphProgramValue> = Object.create(null);
      for (const [index, key] of keys.entries()) {
        if (
          isUnsafeObjectKey(key) ||
          key.length > 512 ||
          (index > 0 && !consume(',')) ||
          !consume(JSON.stringify(key)) ||
          !consume(':')
        ) {
          return INVALID_PROGRAM_VALUE;
        }
        const descriptor = descriptors[key];
        if (!descriptor || !('value' in descriptor)) {
          return INVALID_PROGRAM_VALUE;
        }
        const cloned = clone(descriptor.value, depth + 1);
        if (cloned === INVALID_PROGRAM_VALUE) return INVALID_PROGRAM_VALUE;
        output[key] = cloned;
      }
      return consume('}') ? Object.freeze(output) : INVALID_PROGRAM_VALUE;
    } finally {
      ancestors.delete(candidate);
    }
  };
  try {
    const cloned = clone(value, 0);
    return cloned === INVALID_PROGRAM_VALUE ? undefined : cloned;
  } catch {
    return undefined;
  }
};

const pointerSegment = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const nodeSourcePath = (nodeId: string): string =>
  `/nodesById/${pointerSegment(nodeId)}`;
const portSourcePath = (nodeId: string, portId: string): string =>
  `${nodeSourcePath(nodeId)}/portsById/${pointerSegment(portId)}`;
const edgeSourcePath = (edgeId: string): string =>
  `/edgesById/${pointerSegment(edgeId)}`;

const portKey = (nodeId: string, portId: string): string =>
  `${nodeId}\u0000${portId}`;

const connectionKey = (edge: NodeGraphEdge): string =>
  `${edge.source.nodeId}\u0000${edge.source.portId}\u0000${edge.target.nodeId}\u0000${edge.target.portId}`;

const sortIssues = (
  issues: NodeGraphPlanningIssue[]
): readonly NodeGraphPlanningIssue[] =>
  Object.freeze(
    [...issues].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.path, right.path) ||
        compareUnicodeCodePoints(left.code, right.code)
    )
  );

type PlannedNode = Readonly<{
  node: NodeGraphNode;
  descriptor: NodeGraphDescriptor;
  configuration: NodeGraphProgramValue;
  ports: readonly NodeGraphProgramPort[];
}>;

type PlannedEdge = Readonly<{
  edge: NodeGraphEdge;
  sourcePort: NodeGraphProgramPort;
  targetPort: NodeGraphProgramPort;
}>;

type PlannedSubgraphReference = Readonly<{
  nodeId: string;
  documentId: string;
  expectedDocumentRevision: number;
  expectedContractDigest: string;
  declaredCapabilities: readonly string[];
}>;

const readSafeBudget = (
  value: NodeGraphProgramValue | undefined,
  maximum: number
): number | null =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= maximum
    ? value
    : null;

const compileNodeGraphProgramUnsafe = (
  input: CompileNodeGraphProgramInput
): CompileNodeGraphProgramResult => {
  const issues: NodeGraphPlanningIssue[] = [];
  if (
    !isCanonicalId(input.documentId) ||
    !Number.isSafeInteger(input.documentRevision) ||
    input.documentRevision < 0 ||
    !RUNTIME_ZONES.has(input.runtimeZone)
  ) {
    issues.push({
      code: 'invalid-document-identity',
      path: '/',
      message:
        'NodeGraph planning requires canonical document identity, revision, and runtime zone.',
    });
  }
  const maximumNodes = Math.max(1, Math.trunc(input.maximumNodes ?? 10_000));
  const maximumEdges = Math.max(1, Math.trunc(input.maximumEdges ?? 50_000));
  if (
    !Array.isArray(input.graph.nodes) ||
    input.graph.nodes.length > maximumNodes
  ) {
    issues.push({
      code: 'invalid-node',
      path: '/nodes',
      message: `NodeGraph exceeds its ${maximumNodes} node planning budget.`,
    });
  }
  if (
    !Array.isArray(input.graph.edges) ||
    input.graph.edges.length > maximumEdges
  ) {
    issues.push({
      code: 'invalid-edge',
      path: '/edges',
      message: `NodeGraph exceeds its ${maximumEdges} edge planning budget.`,
    });
  }
  if (issues.length) {
    return Object.freeze({ ok: false, issues: sortIssues(issues) });
  }

  const availableCapabilities = new Set(input.availableCapabilities);
  const maximumLoopIterations = Math.max(
    1,
    Math.trunc(input.maximumLoopIterations ?? 10_000)
  );
  const maximumTimeoutTicks = Math.max(
    1,
    Math.trunc(input.maximumTimeoutTicks ?? 1_000_000)
  );
  const plannedSubgraphReferences: PlannedSubgraphReference[] = [];
  const nodeById = new Map<string, PlannedNode>();
  const portByIdentity = new Map<string, NodeGraphProgramPort>();
  const nodeIds = new Set<string>();
  for (const node of input.graph.nodes) {
    if (!isCanonicalId(node.id)) {
      issues.push({
        code: 'invalid-node',
        path: '/nodes',
        message: 'Every NodeGraph node requires a canonical stable id.',
      });
      continue;
    }
    const path = nodeSourcePath(node.id);
    if (nodeIds.has(node.id)) {
      issues.push({
        code: 'duplicate-node',
        path,
        message: `Duplicate NodeGraph node: ${node.id}.`,
      });
      continue;
    }
    nodeIds.add(node.id);
    const descriptorId = isCanonicalId(node.descriptorRef?.id)
      ? node.descriptorRef.id
      : null;
    const descriptor = descriptorId ? input.registry.get(descriptorId) : null;
    if (!descriptor) {
      issues.push({
        code: 'missing-descriptor',
        path: `${path}/descriptorRef/id`,
        message: descriptorId
          ? `NodeGraph descriptor is unavailable: ${descriptorId}.`
          : 'NodeGraph node does not declare a descriptor identity.',
      });
      continue;
    }
    if (
      !isCanonicalId(node.descriptorRef.version) ||
      node.descriptorRef.version !== descriptor.version
    ) {
      issues.push({
        code: 'descriptor-version-incompatible',
        path: `${path}/descriptorRef/version`,
        message: `NodeGraph descriptor ${descriptor.id} requires version ${descriptor.version}.`,
      });
    }
    if (!descriptor.runtimeZones.includes(input.runtimeZone)) {
      issues.push({
        code: 'runtime-zone-incompatible',
        path,
        message: `NodeGraph descriptor ${descriptor.id} does not support ${input.runtimeZone}.`,
      });
    }
    for (const capability of descriptor.requiredCapabilities) {
      if (!availableCapabilities.has(capability)) {
        issues.push({
          code: 'capability-unavailable',
          path,
          message: `NodeGraph capability is unavailable: ${capability}.`,
        });
      }
    }
    const hasCodeSlot = Boolean(node.codeSlot);
    if (
      (descriptor.codeSlot === 'required' && !hasCodeSlot) ||
      (descriptor.codeSlot === 'forbidden' && hasCodeSlot)
    ) {
      issues.push({
        code: 'code-slot-incompatible',
        path: `${path}/codeSlot`,
        message: `NodeGraph descriptor ${descriptor.id} requires codeSlot=${descriptor.codeSlot}.`,
      });
    }
    const configuration = readNodeGraphProgramValue(node.configuration, {
      maximumDepth: Math.max(
        1,
        Math.trunc(input.maximumConfigurationDepth ?? 24)
      ),
      maximumNodes: Math.max(
        1,
        Math.trunc(input.maximumConfigurationNodes ?? 10_000)
      ),
      maximumUtf8Bytes: Math.max(
        1,
        Math.trunc(input.maximumConfigurationUtf8Bytes ?? 1_048_576)
      ),
    });
    if (
      configuration === undefined ||
      !configuration ||
      typeof configuration !== 'object' ||
      Array.isArray(configuration)
    ) {
      issues.push({
        code: 'invalid-configuration',
        path: `${path}/configuration`,
        message:
          'NodeGraph configuration must be a bounded prototype-safe JSON object.',
      });
      continue;
    }
    const configurationRecord = configuration as Readonly<
      Record<string, NodeGraphProgramValue>
    >;
    if (descriptor.id === 'core.loop.bounded') {
      const maxIterations = readSafeBudget(
        configurationRecord.maxIterations,
        maximumLoopIterations
      );
      if (!maxIterations) {
        issues.push({
          code: 'invalid-loop-budget',
          path: `${path}/configuration/maxIterations`,
          message: `Bounded loop nodes require maxIterations between 1 and ${maximumLoopIterations}.`,
        });
      }
    }
    if (configurationRecord.timeoutTicks !== undefined) {
      const timeoutTicks = readSafeBudget(
        configurationRecord.timeoutTicks,
        maximumTimeoutTicks
      );
      if (!timeoutTicks) {
        issues.push({
          code: 'invalid-timeout-budget',
          path: `${path}/configuration/timeoutTicks`,
          message: `Node timeoutTicks must be between 1 and ${maximumTimeoutTicks}.`,
        });
      }
    }
    if (descriptor.id === 'core.subgraph.call') {
      const documentId = configurationRecord.documentId;
      const expectedDocumentRevision =
        configurationRecord.expectedDocumentRevision;
      const expectedContractDigest = configurationRecord.expectedContractDigest;
      const declaredCapabilities = stableUniqueStrings(
        Array.isArray(configurationRecord.requiredCapabilities)
          ? configurationRecord.requiredCapabilities.filter(
              (capability): capability is string =>
                typeof capability === 'string'
            )
          : []
      );
      if (
        !isCanonicalId(documentId) ||
        typeof expectedDocumentRevision !== 'number' ||
        !Number.isSafeInteger(expectedDocumentRevision) ||
        expectedDocumentRevision < 0 ||
        typeof expectedContractDigest !== 'string' ||
        !DIGEST_PATTERN.test(expectedContractDigest) ||
        !declaredCapabilities
      ) {
        issues.push({
          code: 'subgraph-contract-drift',
          path: `${path}/configuration`,
          message:
            'Subgraph calls require documentId, expectedDocumentRevision, expectedContractDigest, and a canonical capability declaration.',
        });
      } else {
        plannedSubgraphReferences.push(
          Object.freeze({
            nodeId: node.id,
            documentId,
            expectedDocumentRevision,
            expectedContractDigest,
            declaredCapabilities,
          })
        );
      }
    }
    if (!Array.isArray(node.ports) || node.ports.length === 0) {
      issues.push({
        code: 'invalid-port',
        path: `${path}/ports`,
        message:
          'Typed NodeGraph planning requires explicit stable ports on every node.',
      });
      continue;
    }
    const ports: NodeGraphProgramPort[] = [];
    const portIds = new Set<string>();
    for (const port of node.ports) {
      const portPath = isCanonicalId(port.id)
        ? portSourcePath(node.id, port.id)
        : `${path}/ports`;
      if (
        !isCanonicalId(port.id) ||
        (port.direction !== 'input' && port.direction !== 'output') ||
        (port.flow !== 'control' && port.flow !== 'data') ||
        typeof port.required !== 'boolean' ||
        (port.cardinality !== 'single' && port.cardinality !== 'multiple') ||
        (port.flow === 'data' && !isCanonicalId(port.typeRef)) ||
        (port.flow === 'control' && port.typeRef !== undefined)
      ) {
        issues.push({
          code: 'invalid-port',
          path: portPath,
          message:
            'Typed ports require id, direction, flow, required, cardinality, and an exact data type.',
        });
        continue;
      }
      if (portIds.has(port.id)) {
        issues.push({
          code: 'duplicate-port',
          path: portPath,
          message: `Duplicate port ${port.id} on node ${node.id}.`,
        });
        continue;
      }
      portIds.add(port.id);
      const plannedPort = Object.freeze({
        id: port.id,
        direction: port.direction,
        flow: port.flow,
        ...(port.typeRef ? { typeRef: port.typeRef } : {}),
        required: port.required,
        cardinality: port.cardinality,
      });
      ports.push(plannedPort);
      portByIdentity.set(portKey(node.id, port.id), plannedPort);
    }
    nodeById.set(
      node.id,
      Object.freeze({
        node,
        descriptor,
        configuration,
        ports: Object.freeze(
          ports.sort((left, right) =>
            compareUnicodeCodePoints(left.id, right.id)
          )
        ),
      })
    );
  }

  const subgraphByDocumentId = new Map<string, NodeGraphResolvedSubgraph>();
  for (const [index, candidate] of (input.resolvedSubgraphs ?? []).entries()) {
    const requiredCapabilities = stableUniqueStrings(
      candidate.requiredCapabilities
    );
    const dependencyDocumentIds = stableUniqueStrings(
      candidate.dependencyDocumentIds
    );
    if (
      !isCanonicalId(candidate.documentId) ||
      !Number.isSafeInteger(candidate.documentRevision) ||
      candidate.documentRevision < 0 ||
      !DIGEST_PATTERN.test(candidate.contractDigest) ||
      !DIGEST_PATTERN.test(candidate.programDigest) ||
      !requiredCapabilities ||
      !dependencyDocumentIds ||
      candidate.dependencyDocumentIds.includes(candidate.documentId) ||
      subgraphByDocumentId.has(candidate.documentId)
    ) {
      issues.push({
        code: 'subgraph-contract-drift',
        path: `/resolvedSubgraphs/${index}`,
        message:
          'Resolved subgraphs require unique canonical identity, revision, digests, capabilities, and direct dependencies.',
      });
      continue;
    }
    subgraphByDocumentId.set(
      candidate.documentId,
      Object.freeze({
        documentId: candidate.documentId,
        documentRevision: candidate.documentRevision,
        contractDigest: candidate.contractDigest,
        programDigest: candidate.programDigest,
        requiredCapabilities,
        dependencyDocumentIds,
      })
    );
  }

  const maximumSubgraphDepth = Math.max(
    1,
    Math.trunc(input.maximumSubgraphDepth ?? 32)
  );
  const reachableSubgraphIds = new Set<string>();
  const visitingSubgraphIds = new Set<string>();
  const visitedSubgraphIds = new Set<string>();
  const visitSubgraph = (
    documentId: string,
    sourcePath: string,
    depth: number
  ): void => {
    if (
      documentId === input.documentId ||
      visitingSubgraphIds.has(documentId)
    ) {
      issues.push({
        code: 'subgraph-dependency-cycle',
        path: sourcePath,
        message: `Subgraph dependency cycle reaches ${documentId}.`,
      });
      return;
    }
    if (depth > maximumSubgraphDepth) {
      issues.push({
        code: 'subgraph-depth-exceeded',
        path: sourcePath,
        message: `Subgraph dependency closure exceeds depth ${maximumSubgraphDepth}.`,
      });
      return;
    }
    const contract = subgraphByDocumentId.get(documentId);
    if (!contract) {
      issues.push({
        code: depth === 1 ? 'subgraph-missing' : 'subgraph-dependency-missing',
        path: sourcePath,
        message: `Resolved subgraph is unavailable: ${documentId}.`,
      });
      return;
    }
    reachableSubgraphIds.add(documentId);
    if (visitedSubgraphIds.has(documentId)) return;
    visitingSubgraphIds.add(documentId);
    for (const dependencyDocumentId of contract.dependencyDocumentIds) {
      visitSubgraph(
        dependencyDocumentId,
        `${sourcePath}/dependencies/${pointerSegment(dependencyDocumentId)}`,
        depth + 1
      );
    }
    visitingSubgraphIds.delete(documentId);
    visitedSubgraphIds.add(documentId);
  };

  for (const reference of plannedSubgraphReferences) {
    const path = `${nodeSourcePath(reference.nodeId)}/configuration`;
    const contract = subgraphByDocumentId.get(reference.documentId);
    if (contract) {
      if (contract.documentRevision !== reference.expectedDocumentRevision) {
        issues.push({
          code: 'subgraph-revision-drift',
          path: `${path}/expectedDocumentRevision`,
          message: `Subgraph ${reference.documentId} resolved at revision ${contract.documentRevision}, not ${reference.expectedDocumentRevision}.`,
        });
      }
      if (contract.contractDigest !== reference.expectedContractDigest) {
        issues.push({
          code: 'subgraph-contract-drift',
          path: `${path}/expectedContractDigest`,
          message: `Subgraph ${reference.documentId} public contract digest changed.`,
        });
      }
      for (const capability of contract.requiredCapabilities) {
        if (
          !reference.declaredCapabilities.includes(capability) ||
          !availableCapabilities.has(capability)
        ) {
          issues.push({
            code: 'subgraph-capability-escalation',
            path: `${path}/requiredCapabilities`,
            message: `Subgraph ${reference.documentId} requires undeclared or unavailable capability ${capability}.`,
          });
        }
      }
    }
    visitSubgraph(reference.documentId, path, 1);
  }

  const plannedEdges: PlannedEdge[] = [];
  const edgeIds = new Set<string>();
  const connections = new Set<string>();
  const incomingByPort = new Map<string, number>();
  const outgoingByPort = new Map<string, number>();
  const incomingNodeIds = new Map<string, Set<string>>();
  const allOutgoingNodeIds = new Map<string, Set<string>>();
  const controlOutgoingNodeIds = new Map<string, Set<string>>();
  const dataIncomingNodeIds = new Map<string, Set<string>>();
  for (const edge of input.graph.edges) {
    const path = isCanonicalId(edge.id) ? edgeSourcePath(edge.id) : '/edges';
    if (
      !isCanonicalId(edge.id) ||
      !isCanonicalId(edge.source?.nodeId) ||
      !isCanonicalId(edge.target?.nodeId) ||
      !isCanonicalId(edge.source?.portId) ||
      !isCanonicalId(edge.target?.portId)
    ) {
      issues.push({
        code: 'invalid-edge',
        path,
        message:
          'Typed NodeGraph edges require stable node and exact port identities.',
      });
      continue;
    }
    if (edgeIds.has(edge.id)) {
      issues.push({
        code: 'duplicate-edge',
        path,
        message: `Duplicate NodeGraph edge: ${edge.id}.`,
      });
      continue;
    }
    edgeIds.add(edge.id);
    const exactConnection = connectionKey(edge);
    if (connections.has(exactConnection)) {
      issues.push({
        code: 'duplicate-connection',
        path,
        message: 'Duplicate NodeGraph port connection.',
      });
      continue;
    }
    connections.add(exactConnection);
    if (
      !nodeById.has(edge.source.nodeId) ||
      !nodeById.has(edge.target.nodeId)
    ) {
      issues.push({
        code: 'missing-node',
        path,
        message: 'NodeGraph edge references an unavailable planned node.',
      });
      continue;
    }
    const sourceIdentity = portKey(edge.source.nodeId, edge.source.portId);
    const targetIdentity = portKey(edge.target.nodeId, edge.target.portId);
    const sourcePort = portByIdentity.get(sourceIdentity);
    const targetPort = portByIdentity.get(targetIdentity);
    if (!sourcePort || !targetPort) {
      issues.push({
        code: 'missing-port',
        path,
        message: 'NodeGraph edge references an unavailable exact port.',
      });
      continue;
    }
    if (
      sourcePort.direction !== 'output' ||
      targetPort.direction !== 'input' ||
      sourcePort.flow !== targetPort.flow ||
      (sourcePort.flow === 'data' && sourcePort.typeRef !== targetPort.typeRef)
    ) {
      issues.push({
        code: 'incompatible-port',
        path,
        message:
          'NodeGraph edges require output-to-input ports with identical flow and data type.',
      });
      continue;
    }
    incomingByPort.set(
      targetIdentity,
      (incomingByPort.get(targetIdentity) ?? 0) + 1
    );
    outgoingByPort.set(
      sourceIdentity,
      (outgoingByPort.get(sourceIdentity) ?? 0) + 1
    );
    const incoming =
      incomingNodeIds.get(edge.target.nodeId) ?? new Set<string>();
    incoming.add(edge.source.nodeId);
    incomingNodeIds.set(edge.target.nodeId, incoming);
    const outgoing =
      allOutgoingNodeIds.get(edge.source.nodeId) ?? new Set<string>();
    outgoing.add(edge.target.nodeId);
    allOutgoingNodeIds.set(edge.source.nodeId, outgoing);
    if (sourcePort.flow === 'control') {
      const control =
        controlOutgoingNodeIds.get(edge.source.nodeId) ?? new Set<string>();
      control.add(edge.target.nodeId);
      controlOutgoingNodeIds.set(edge.source.nodeId, control);
    } else {
      const data =
        dataIncomingNodeIds.get(edge.target.nodeId) ?? new Set<string>();
      data.add(edge.source.nodeId);
      dataIncomingNodeIds.set(edge.target.nodeId, data);
    }
    plannedEdges.push(Object.freeze({ edge, sourcePort, targetPort }));
  }

  for (const [nodeId, plannedNode] of nodeById) {
    for (const port of plannedNode.ports) {
      const identity = portKey(nodeId, port.id);
      const count =
        port.direction === 'input'
          ? (incomingByPort.get(identity) ?? 0)
          : (outgoingByPort.get(identity) ?? 0);
      if (port.cardinality === 'single' && count > 1) {
        issues.push({
          code: 'cardinality-violation',
          path: portSourcePath(nodeId, port.id),
          message: `Single-cardinality port ${port.id} has ${count} connections.`,
        });
      }
      if (port.direction === 'input' && port.required && count === 0) {
        issues.push({
          code: 'required-input-missing',
          path: portSourcePath(nodeId, port.id),
          message: `Required input port is unconnected: ${port.id}.`,
        });
      }
    }
  }

  const entryIds = [...nodeById.values()]
    .filter(({ descriptor }) => descriptor.entry)
    .map(({ node }) => node.id)
    .sort(compareUnicodeCodePoints);
  const terminalIds = [...nodeById.values()]
    .filter(({ descriptor }) => descriptor.terminal)
    .map(({ node }) => node.id)
    .sort(compareUnicodeCodePoints);
  if (!entryIds.length) {
    issues.push({
      code: 'entry-missing',
      path: '/',
      message: 'Typed NodeGraph planning requires an entry descriptor.',
    });
  }
  if (!terminalIds.length) {
    issues.push({
      code: 'terminal-missing',
      path: '/',
      message: 'Typed NodeGraph planning requires a terminal descriptor.',
    });
  }
  for (const terminalId of terminalIds) {
    if ((controlOutgoingNodeIds.get(terminalId)?.size ?? 0) > 0) {
      issues.push({
        code: 'terminal-has-outgoing-control',
        path: nodeSourcePath(terminalId),
        message: 'Terminal NodeGraph nodes cannot emit control flow.',
      });
    }
  }

  const controlReachable = new Set<string>();
  const queue = [...entryIds];
  while (queue.length) {
    const current = queue.shift()!;
    if (controlReachable.has(current)) continue;
    controlReachable.add(current);
    const targets = [
      ...(controlOutgoingNodeIds.get(current) ?? new Set<string>()),
    ].sort(compareUnicodeCodePoints);
    queue.push(...targets);
  }
  const activeNodeIds = new Set(controlReachable);
  const dataQueue = [...controlReachable];
  while (dataQueue.length) {
    const current = dataQueue.shift()!;
    for (const source of [
      ...(dataIncomingNodeIds.get(current) ?? new Set<string>()),
    ].sort(compareUnicodeCodePoints)) {
      if (activeNodeIds.has(source)) continue;
      activeNodeIds.add(source);
      dataQueue.push(source);
    }
  }
  for (const nodeId of nodeById.keys()) {
    if (!activeNodeIds.has(nodeId)) {
      issues.push({
        code: 'unreachable-node',
        path: nodeSourcePath(nodeId),
        message: 'NodeGraph node is unreachable from any entry control flow.',
      });
    }
  }
  if (
    terminalIds.length > 0 &&
    !terminalIds.some((terminalId) => controlReachable.has(terminalId))
  ) {
    issues.push({
      code: 'terminal-missing',
      path: '/',
      message: 'No terminal NodeGraph node is reachable from an entry.',
    });
  }

  const indegree = new Map<string, number>(
    [...nodeById.keys()].map((nodeId) => [
      nodeId,
      incomingNodeIds.get(nodeId)?.size ?? 0,
    ])
  );
  let ready = [...indegree]
    .filter(([, count]) => count === 0)
    .map(([nodeId]) => nodeId)
    .sort(compareUnicodeCodePoints);
  const executionWaves: (readonly string[])[] = [];
  let plannedNodeCount = 0;
  while (ready.length) {
    const wave = Object.freeze([...ready]);
    executionWaves.push(wave);
    plannedNodeCount += wave.length;
    const next = new Set<string>();
    for (const nodeId of wave) {
      for (const targetId of [
        ...(allOutgoingNodeIds.get(nodeId) ?? new Set<string>()),
      ].sort(compareUnicodeCodePoints)) {
        const remaining = (indegree.get(targetId) ?? 0) - 1;
        indegree.set(targetId, remaining);
        if (remaining === 0) next.add(targetId);
      }
    }
    ready = [...next].sort(compareUnicodeCodePoints);
  }
  if (plannedNodeCount !== nodeById.size) {
    issues.push({
      code: 'cycle',
      path: '/',
      message:
        'NodeGraph control/data cycles require an explicit bounded loop or state descriptor.',
    });
  }
  if (issues.length) {
    return Object.freeze({ ok: false, issues: sortIssues(issues) });
  }

  const nodes = Object.freeze(
    [...nodeById.values()]
      .sort((left, right) =>
        compareUnicodeCodePoints(left.node.id, right.node.id)
      )
      .map(({ node, descriptor, configuration, ports }) =>
        Object.freeze({
          id: node.id,
          descriptorId: descriptor.id,
          descriptorVersion: descriptor.version,
          executorId: descriptor.executorId,
          implementationDigest: descriptor.implementationDigest,
          effect: descriptor.effect,
          requiredCapabilities: descriptor.requiredCapabilities,
          configuration,
          ...(node.codeSlot?.slotId
            ? { codeSlotId: node.codeSlot.slotId }
            : {}),
          dependencyNodeIds: Object.freeze(
            [...(incomingNodeIds.get(node.id) ?? new Set<string>())].sort(
              compareUnicodeCodePoints
            )
          ),
          ports,
        })
      )
  );
  const edges = Object.freeze(
    plannedEdges
      .sort((left, right) =>
        compareUnicodeCodePoints(left.edge.id, right.edge.id)
      )
      .map(({ edge, sourcePort }) =>
        Object.freeze({
          id: edge.id,
          source: Object.freeze({
            nodeId: edge.source.nodeId,
            portId: edge.source.portId,
          }),
          target: Object.freeze({
            nodeId: edge.target.nodeId,
            portId: edge.target.portId,
          }),
          flow: sourcePort.flow,
          ...(sourcePort.typeRef ? { typeRef: sourcePort.typeRef } : {}),
        })
      )
  );
  const sourceTrace = Object.freeze(
    [
      ...nodes.flatMap((node) => [
        Object.freeze({
          kind: 'node' as const,
          id: node.id,
          sourcePath: nodeSourcePath(node.id),
        }),
        ...node.ports.map((port) =>
          Object.freeze({
            kind: 'port' as const,
            id: `${node.id}:${port.id}`,
            sourcePath: portSourcePath(node.id, port.id),
          })
        ),
      ]),
      ...edges.map((edge) =>
        Object.freeze({
          kind: 'edge' as const,
          id: edge.id,
          sourcePath: edgeSourcePath(edge.id),
        })
      ),
    ].sort(
      (left, right) =>
        compareUnicodeCodePoints(left.sourcePath, right.sourcePath) ||
        compareUnicodeCodePoints(left.id, right.id)
    )
  );
  const resolvedSubgraphs = Object.freeze(
    [...reachableSubgraphIds]
      .sort(compareUnicodeCodePoints)
      .map((documentId) => subgraphByDocumentId.get(documentId)!)
  );
  const requiredCapabilities = Object.freeze(
    [
      ...new Set([
        ...nodes.flatMap((node) => node.requiredCapabilities),
        ...resolvedSubgraphs.flatMap(
          (subgraph) => subgraph.requiredCapabilities
        ),
      ]),
    ].sort(compareUnicodeCodePoints)
  );
  const resourcePlan = Object.freeze({
    maximumParallelism: Math.max(
      1,
      ...executionWaves.map((wave) => wave.length)
    ),
    maximumLoopIterations: Math.max(
      0,
      ...nodes
        .filter((node) => node.descriptorId === 'core.loop.bounded')
        .map((node) => {
          const configuration = node.configuration as Readonly<
            Record<string, NodeGraphProgramValue>
          >;
          return typeof configuration.maxIterations === 'number'
            ? configuration.maxIterations
            : 0;
        })
    ),
    maximumTimeoutTicks: Math.max(
      0,
      ...nodes.map((node) => {
        const configuration = node.configuration as Readonly<
          Record<string, NodeGraphProgramValue>
        >;
        return typeof configuration.timeoutTicks === 'number'
          ? configuration.timeoutTicks
          : 0;
      })
    ),
    temporaryStateNodeIds: Object.freeze(
      nodes
        .filter((node) => node.effect === 'temporary-state')
        .map((node) => node.id)
    ),
    effectNodeIds: Object.freeze(
      nodes.filter((node) => node.effect !== 'pure').map((node) => node.id)
    ),
  });
  const programWithoutDigest = Object.freeze({
    documentId: input.documentId,
    documentRevision: input.documentRevision,
    descriptorRegistryDigest: input.registry.digest,
    runtimeZone: input.runtimeZone,
    requiredCapabilities,
    nodes,
    edges,
    executionWaves: Object.freeze(executionWaves),
    resolvedSubgraphs,
    resourcePlan,
    sourceTrace,
  });
  return Object.freeze({
    ok: true,
    program: Object.freeze({
      ...programWithoutDigest,
      programDigest: digestNodeGraphProgramValue(programWithoutDigest),
    }),
  });
};

/**
 * Compiles a strict typed graph into an immutable dependency-wave Program.
 * Missing legacy handles or optional port semantics fail closed; migration is
 * deliberately owned by the wire boundary rather than guessed by the planner.
 */
export const compileNodeGraphProgram = (
  input: CompileNodeGraphProgramInput
): CompileNodeGraphProgramResult => {
  try {
    return compileNodeGraphProgramUnsafe(input);
  } catch {
    return Object.freeze({
      ok: false,
      issues: Object.freeze([
        Object.freeze({
          code: 'invalid-configuration' as const,
          path: '/',
          message:
            'NodeGraph planning rejected an unreadable or unsafe document value.',
        }),
      ]),
    });
  }
};
