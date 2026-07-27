import { utf8ToBytes } from '@noble/hashes/utils.js';
import type { CodeReference, CodeSlotBinding } from '@prodivix/authoring';
import { compareUnicodeCodePoints } from '@prodivix/shared/canonical';
import { isPlainObject, isUnsafeObjectKey } from '@prodivix/shared/safety';
import type {
  NodeGraphDecodeIssue,
  NodeGraphDecodeResult,
  NodeGraphDescriptorReference,
  NodeGraphDocument,
  NodeGraphEdge,
  NodeGraphEditorMetadata,
  NodeGraphNode,
  NodeGraphPort,
  NodeGraphPortReference,
  NodeGraphPublicContract,
  NodeGraphPublicPort,
  NodeGraphValidationResult,
} from './nodeGraph.types';
import { upgradeNodeGraphWireDocument } from './nodeGraphWireMigration';
import {
  NODEGRAPH_CURRENT_WIRE_VERSION,
  nodeGraphCurrentWireFields,
} from './wire';

type WireRecord = Record<string, unknown>;

const canonicalString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 512 &&
  value === value.trim() &&
  !value.includes('\u0000');

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
      message: 'Accessor-backed NodeGraph fields are not supported.',
    });
    return undefined;
  }
  return descriptor.value;
};

const hasOnlyKeys = (
  value: WireRecord,
  allowed: readonly string[],
  path: string,
  issues: NodeGraphDecodeIssue[]
): void => {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (isUnsafeObjectKey(key) || !allowedSet.has(key)) {
      issues.push({
        path: `${path}/${key}`,
        message: `Unknown persisted NodeGraph field "${key}".`,
      });
    }
  }
};

const requiredString = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | null => {
  if (!canonicalString(value)) {
    issues.push({ path, message: 'Expected a canonical non-empty string.' });
    return null;
  }
  return value;
};

const optionalString = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): string | undefined => {
  if (value === undefined) return undefined;
  return requiredString(value, path, issues) ?? undefined;
};

type JsonCloneBudget = {
  nodes: number;
  bytes: number;
};

const cloneJsonValue = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[],
  budget: JsonCloneBudget,
  depth = 0,
  active = new Set<object>()
): unknown => {
  budget.nodes += 1;
  if (budget.nodes > 20_000 || depth > 32) {
    issues.push({
      path,
      message: 'NodeGraph JSON value exceeds its structural budget.',
    });
    return undefined;
  }
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string'
  ) {
    if (typeof value === 'string') {
      budget.bytes += utf8ToBytes(value).byteLength;
    }
    if (budget.bytes > 2_097_152) {
      issues.push({
        path,
        message: 'NodeGraph JSON value exceeds its UTF-8 budget.',
      });
      return undefined;
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issues.push({ path, message: 'NodeGraph numbers must be finite.' });
      return undefined;
    }
    return value;
  }
  if (typeof value !== 'object' || value === undefined) {
    issues.push({ path, message: 'Expected a JSON-compatible value.' });
    return undefined;
  }
  if (active.has(value)) {
    issues.push({ path, message: 'NodeGraph values cannot contain cycles.' });
    return undefined;
  }
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 10_000) {
        issues.push({ path, message: 'NodeGraph array exceeds its budget.' });
        return undefined;
      }
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          issues.push({
            path: `${path}/${index}`,
            message: 'Sparse NodeGraph arrays are not supported.',
          });
          continue;
        }
        output.push(
          cloneJsonValue(
            value[index],
            `${path}/${index}`,
            issues,
            budget,
            depth + 1,
            active
          )
        );
      }
      return output;
    }
    if (!isPlainObject(value)) {
      issues.push({ path, message: 'Expected a plain JSON object.' });
      return undefined;
    }
    const output: WireRecord = {};
    for (const key of Object.keys(value).sort(compareUnicodeCodePoints)) {
      if (isUnsafeObjectKey(key)) {
        issues.push({
          path: `${path}/${key}`,
          message: 'Unsafe NodeGraph object key.',
        });
        continue;
      }
      const nested = readOwn(value, key, path, issues);
      output[key] = cloneJsonValue(
        nested,
        `${path}/${key}`,
        issues,
        budget,
        depth + 1,
        active
      );
    }
    return output;
  } finally {
    active.delete(value);
  }
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
  hasOnlyKeys(value, nodeGraphCurrentWireFields.codeReference, path, issues);
  const artifactId = requiredString(
    readOwn(value, 'artifactId', path, issues),
    `${path}/artifactId`,
    issues
  );
  const exportName = optionalString(
    readOwn(value, 'exportName', path, issues),
    `${path}/exportName`,
    issues
  );
  const symbolId = optionalString(
    readOwn(value, 'symbolId', path, issues),
    `${path}/symbolId`,
    issues
  );
  if (!artifactId) return null;
  const reference: CodeReference = {
    artifactId,
    ...(exportName ? { exportName } : {}),
    ...(symbolId ? { symbolId } : {}),
  };
  const sourceSpan = readOwn(value, 'sourceSpan', path, issues);
  if (sourceSpan !== undefined) {
    if (!isPlainObject(sourceSpan)) {
      issues.push({
        path: `${path}/sourceSpan`,
        message: 'Expected a SourceSpan object.',
      });
    } else {
      hasOnlyKeys(
        sourceSpan,
        nodeGraphCurrentWireFields.sourceSpan,
        `${path}/sourceSpan`,
        issues
      );
      const spanArtifactId = requiredString(
        readOwn(sourceSpan, 'artifactId', `${path}/sourceSpan`, issues),
        `${path}/sourceSpan/artifactId`,
        issues
      );
      const startLine = readOwn(
        sourceSpan,
        'startLine',
        `${path}/sourceSpan`,
        issues
      );
      const startColumn = readOwn(
        sourceSpan,
        'startColumn',
        `${path}/sourceSpan`,
        issues
      );
      const endLine = readOwn(
        sourceSpan,
        'endLine',
        `${path}/sourceSpan`,
        issues
      );
      const endColumn = readOwn(
        sourceSpan,
        'endColumn',
        `${path}/sourceSpan`,
        issues
      );
      const positions = [startLine, startColumn, endLine, endColumn];
      if (
        spanArtifactId === artifactId &&
        positions.every(
          (candidate) =>
            typeof candidate === 'number' &&
            Number.isInteger(candidate) &&
            candidate >= 1
        ) &&
        ((endLine as number) > (startLine as number) ||
          ((endLine as number) === (startLine as number) &&
            (endColumn as number) >= (startColumn as number)))
      ) {
        reference.sourceSpan = {
          artifactId,
          startLine: startLine as number,
          startColumn: startColumn as number,
          endLine: endLine as number,
          endColumn: endColumn as number,
        };
      } else {
        issues.push({
          path: `${path}/sourceSpan`,
          message:
            'SourceSpan must be ordered, positive, and use the referenced artifact.',
        });
      }
    }
  }
  return reference;
};

const decodeCodeSlot = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): CodeSlotBinding | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a CodeSlotBinding object.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.codeSlotBinding, path, issues);
  const slotId = requiredString(
    readOwn(value, 'slotId', path, issues),
    `${path}/slotId`,
    issues
  );
  const reference = decodeCodeReference(
    readOwn(value, 'reference', path, issues),
    `${path}/reference`,
    issues
  );
  return slotId && reference ? { slotId, reference } : null;
};

const decodeDescriptorRef = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphDescriptorReference | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a descriptor reference.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.descriptorRef, path, issues);
  const id = requiredString(
    readOwn(value, 'id', path, issues),
    `${path}/id`,
    issues
  );
  const version = requiredString(
    readOwn(value, 'version', path, issues),
    `${path}/version`,
    issues
  );
  return id && version ? { id, version } : null;
};

const decodePortReference = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphPortReference | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected an exact port reference.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.portReference, path, issues);
  const nodeId = requiredString(
    readOwn(value, 'nodeId', path, issues),
    `${path}/nodeId`,
    issues
  );
  const portId = requiredString(
    readOwn(value, 'portId', path, issues),
    `${path}/portId`,
    issues
  );
  return nodeId && portId ? { nodeId, portId } : null;
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
  hasOnlyKeys(value, nodeGraphCurrentWireFields.port, path, issues);
  const id = requiredString(
    readOwn(value, 'id', path, issues),
    `${path}/id`,
    issues
  );
  const direction = readOwn(value, 'direction', path, issues);
  const flow = readOwn(value, 'flow', path, issues);
  const typeRef = optionalString(
    readOwn(value, 'typeRef', path, issues),
    `${path}/typeRef`,
    issues
  );
  const required = readOwn(value, 'required', path, issues);
  const cardinality = readOwn(value, 'cardinality', path, issues);
  if (
    !id ||
    (direction !== 'input' && direction !== 'output') ||
    (flow !== 'control' && flow !== 'data') ||
    typeof required !== 'boolean' ||
    (cardinality !== 'single' && cardinality !== 'multiple') ||
    (flow === 'control' && typeRef !== undefined) ||
    (flow === 'data' && !typeRef)
  ) {
    issues.push({
      path,
      message:
        'Typed ports require direction, flow, exact data type, required, and cardinality.',
    });
    return null;
  }
  return {
    id,
    direction,
    flow,
    ...(typeRef ? { typeRef } : {}),
    required,
    cardinality,
  };
};

const decodeEditor = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphEditorMetadata | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected NodeGraph editor metadata.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.editor, path, issues);
  const editor: NodeGraphEditorMetadata = {};
  const position = readOwn(value, 'position', path, issues);
  if (position !== undefined) {
    if (!isPlainObject(position)) {
      issues.push({
        path: `${path}/position`,
        message: 'Expected a finite editor position.',
      });
    } else {
      hasOnlyKeys(
        position,
        nodeGraphCurrentWireFields.editorPosition,
        `${path}/position`,
        issues
      );
      const x = readOwn(position, 'x', `${path}/position`, issues);
      const y = readOwn(position, 'y', `${path}/position`, issues);
      if (
        typeof x === 'number' &&
        Number.isFinite(x) &&
        typeof y === 'number' &&
        Number.isFinite(y)
      ) {
        editor.position = { x, y };
      } else {
        issues.push({
          path: `${path}/position`,
          message: 'Editor position must contain finite x/y values.',
        });
      }
    }
  }
  const parentId = optionalString(
    readOwn(value, 'parentId', path, issues),
    `${path}/parentId`,
    issues
  );
  const extent = readOwn(value, 'extent', path, issues);
  const zIndex = readOwn(value, 'zIndex', path, issues);
  const collapsed = readOwn(value, 'collapsed', path, issues);
  const label = optionalString(
    readOwn(value, 'label', path, issues),
    `${path}/label`,
    issues
  );
  if (extent !== undefined && extent !== 'parent') {
    issues.push({ path: `${path}/extent`, message: 'Expected parent.' });
  }
  if (
    zIndex !== undefined &&
    (typeof zIndex !== 'number' || !Number.isSafeInteger(zIndex))
  ) {
    issues.push({
      path: `${path}/zIndex`,
      message: 'Expected an integer z-index.',
    });
  }
  if (collapsed !== undefined && typeof collapsed !== 'boolean') {
    issues.push({
      path: `${path}/collapsed`,
      message: 'Expected a boolean collapsed state.',
    });
  }
  return {
    ...(position && editor.position ? { position: editor.position } : {}),
    ...(parentId ? { parentId } : {}),
    ...(extent === 'parent' ? { extent } : {}),
    ...(typeof zIndex === 'number' && Number.isSafeInteger(zIndex)
      ? { zIndex }
      : {}),
    ...(typeof collapsed === 'boolean' ? { collapsed } : {}),
    ...(label ? { label } : {}),
  };
};

const decodeNode = (
  value: unknown,
  index: number,
  issues: NodeGraphDecodeIssue[]
): NodeGraphNode | null => {
  const path = `/nodes/${index}`;
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a NodeGraph node object.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.node, path, issues);
  const id = requiredString(
    readOwn(value, 'id', path, issues),
    `${path}/id`,
    issues
  );
  const descriptorRef = decodeDescriptorRef(
    readOwn(value, 'descriptorRef', path, issues),
    `${path}/descriptorRef`,
    issues
  );
  const portCandidates = readOwn(value, 'ports', path, issues);
  if (!Array.isArray(portCandidates) || !portCandidates.length) {
    issues.push({
      path: `${path}/ports`,
      message: 'Every current NodeGraph node requires explicit ports.',
    });
  }
  const ports = Array.isArray(portCandidates)
    ? portCandidates
        .map((port, portIndex) =>
          decodePort(port, `${path}/ports/${portIndex}`, issues)
        )
        .filter((port): port is NodeGraphPort => Boolean(port))
    : [];
  const configurationCandidate = readOwn(value, 'configuration', path, issues);
  const configuration = isPlainObject(configurationCandidate)
    ? cloneJsonValue(configurationCandidate, `${path}/configuration`, issues, {
        nodes: 0,
        bytes: 0,
      })
    : undefined;
  if (!isPlainObject(configurationCandidate)) {
    issues.push({
      path: `${path}/configuration`,
      message: 'NodeGraph configuration must be a plain JSON object.',
    });
  }
  const editor = decodeEditor(
    readOwn(value, 'editor', path, issues),
    `${path}/editor`,
    issues
  );
  const codeSlotCandidate = readOwn(value, 'codeSlot', path, issues);
  const codeSlot =
    codeSlotCandidate === undefined
      ? undefined
      : decodeCodeSlot(codeSlotCandidate, `${path}/codeSlot`, issues);
  if (
    !id ||
    !descriptorRef ||
    !ports.length ||
    !isPlainObject(configuration) ||
    !editor
  ) {
    return null;
  }
  const portIds = new Set<string>();
  ports.forEach((port, portIndex) => {
    if (portIds.has(port.id)) {
      issues.push({
        path: `${path}/ports/${portIndex}/id`,
        message: `Duplicate port id: ${port.id}.`,
      });
    }
    portIds.add(port.id);
  });
  if (
    descriptorRef.id === 'core.code' &&
    (Object.hasOwn(configuration, 'code') ||
      Object.hasOwn(configuration, 'codeLanguage'))
  ) {
    issues.push({
      path: `${path}/configuration`,
      message:
        'Code nodes bind a Workspace CodeArtifact through codeSlot; embedded source is forbidden.',
    });
  }
  return {
    id,
    descriptorRef,
    ports,
    configuration,
    editor,
    ...(codeSlot ? { codeSlot } : {}),
  };
};

const decodeEdge = (
  value: unknown,
  index: number,
  issues: NodeGraphDecodeIssue[]
): NodeGraphEdge | null => {
  const path = `/edges/${index}`;
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a NodeGraph edge object.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.edge, path, issues);
  const id = requiredString(
    readOwn(value, 'id', path, issues),
    `${path}/id`,
    issues
  );
  const source = decodePortReference(
    readOwn(value, 'source', path, issues),
    `${path}/source`,
    issues
  );
  const target = decodePortReference(
    readOwn(value, 'target', path, issues),
    `${path}/target`,
    issues
  );
  return id && source && target ? { id, source, target } : null;
};

const decodePublicPort = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphPublicPort | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a public port object.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.publicPort, path, issues);
  const id = requiredString(
    readOwn(value, 'id', path, issues),
    `${path}/id`,
    issues
  );
  const port = decodePortReference(
    readOwn(value, 'port', path, issues),
    `${path}/port`,
    issues
  );
  const typeRef = requiredString(
    readOwn(value, 'typeRef', path, issues),
    `${path}/typeRef`,
    issues
  );
  const required = readOwn(value, 'required', path, issues);
  if (typeof required !== 'boolean') {
    issues.push({
      path: `${path}/required`,
      message: 'Expected a boolean.',
    });
  }
  return id && port && typeRef && typeof required === 'boolean'
    ? { id, port, typeRef, required }
    : null;
};

const decodePublicContract = (
  value: unknown,
  path: string,
  issues: NodeGraphDecodeIssue[]
): NodeGraphPublicContract | null => {
  if (!isPlainObject(value)) {
    issues.push({ path, message: 'Expected a public graph contract.' });
    return null;
  }
  hasOnlyKeys(value, nodeGraphCurrentWireFields.publicContract, path, issues);
  const decodePorts = (field: 'inputs' | 'outputs'): NodeGraphPublicPort[] => {
    const candidates = readOwn(value, field, path, issues);
    if (!Array.isArray(candidates)) {
      issues.push({
        path: `${path}/${field}`,
        message: 'Expected an array.',
      });
      return [];
    }
    return candidates
      .map((candidate, index) =>
        decodePublicPort(candidate, `${path}/${field}/${index}`, issues)
      )
      .filter((port): port is NodeGraphPublicPort => Boolean(port));
  };
  const decodeStrings = (
    field: 'errors' | 'requiredCapabilities'
  ): string[] => {
    const candidates = readOwn(value, field, path, issues);
    if (!Array.isArray(candidates)) {
      issues.push({
        path: `${path}/${field}`,
        message: 'Expected an array.',
      });
      return [];
    }
    return candidates
      .map((candidate, index) =>
        requiredString(candidate, `${path}/${field}/${index}`, issues)
      )
      .filter((candidate): candidate is string => Boolean(candidate));
  };
  const inputs = decodePorts('inputs');
  const outputs = decodePorts('outputs');
  const errors = decodeStrings('errors');
  const requiredCapabilities = decodeStrings('requiredCapabilities');
  const maximumSteps = readOwn(value, 'maximumSteps', path, issues);
  if (
    typeof maximumSteps !== 'number' ||
    !Number.isSafeInteger(maximumSteps) ||
    maximumSteps < 1 ||
    maximumSteps > 1_000_000
  ) {
    issues.push({
      path: `${path}/maximumSteps`,
      message: 'Expected a positive bounded step budget.',
    });
    return null;
  }
  return {
    inputs,
    outputs,
    errors,
    requiredCapabilities,
    maximumSteps,
  };
};

const portIdentity = (reference: NodeGraphPortReference): string =>
  `${reference.nodeId}\u0000${reference.portId}`;

const validateSemanticStructure = (
  nodes: readonly NodeGraphNode[],
  edges: readonly NodeGraphEdge[],
  publicContract: NodeGraphPublicContract | undefined,
  issues: NodeGraphDecodeIssue[]
): void => {
  const nodesById = new Map<string, NodeGraphNode>();
  const portsByIdentity = new Map<string, NodeGraphPort>();
  const codeSlotIds = new Set<string>();
  nodes.forEach((node, nodeIndex) => {
    if (nodesById.has(node.id)) {
      issues.push({
        path: `/nodes/${nodeIndex}/id`,
        message: `Duplicate node id: ${node.id}.`,
      });
    }
    nodesById.set(node.id, node);
    node.ports.forEach((port) => {
      portsByIdentity.set(
        portIdentity({ nodeId: node.id, portId: port.id }),
        port
      );
    });
    if (node.codeSlot) {
      if (codeSlotIds.has(node.codeSlot.slotId)) {
        issues.push({
          path: `/nodes/${nodeIndex}/codeSlot/slotId`,
          message: `Duplicate code slot id: ${node.codeSlot.slotId}.`,
        });
      }
      codeSlotIds.add(node.codeSlot.slotId);
    }
  });
  const edgeIds = new Set<string>();
  const connectionIds = new Set<string>();
  const connectionCount = new Map<string, number>();
  edges.forEach((edge, edgeIndex) => {
    const path = `/edges/${edgeIndex}`;
    if (edgeIds.has(edge.id)) {
      issues.push({
        path: `${path}/id`,
        message: `Duplicate edge id: ${edge.id}.`,
      });
    }
    edgeIds.add(edge.id);
    const sourceIdentity = portIdentity(edge.source);
    const targetIdentity = portIdentity(edge.target);
    const connectionIdentity = `${sourceIdentity}\u0000${targetIdentity}`;
    if (connectionIds.has(connectionIdentity)) {
      issues.push({
        path,
        message: 'Duplicate exact port connection.',
      });
    }
    connectionIds.add(connectionIdentity);
    const source = portsByIdentity.get(sourceIdentity);
    const target = portsByIdentity.get(targetIdentity);
    if (!source) {
      issues.push({
        path: `${path}/source`,
        message: 'Unknown source port reference.',
      });
    }
    if (!target) {
      issues.push({
        path: `${path}/target`,
        message: 'Unknown target port reference.',
      });
    }
    if (
      source &&
      target &&
      (source.direction !== 'output' ||
        target.direction !== 'input' ||
        source.flow !== target.flow ||
        (source.flow === 'data' && source.typeRef !== target.typeRef))
    ) {
      issues.push({
        path,
        message: 'NodeGraph edge connects incompatible exact ports.',
      });
    }
    connectionCount.set(
      sourceIdentity,
      (connectionCount.get(sourceIdentity) ?? 0) + 1
    );
    connectionCount.set(
      targetIdentity,
      (connectionCount.get(targetIdentity) ?? 0) + 1
    );
  });
  nodes.forEach((node, nodeIndex) => {
    node.ports.forEach((port, portIndex) => {
      const count =
        connectionCount.get(
          portIdentity({ nodeId: node.id, portId: port.id })
        ) ?? 0;
      if (port.cardinality === 'single' && count > 1) {
        issues.push({
          path: `/nodes/${nodeIndex}/ports/${portIndex}`,
          message: 'Single-cardinality port has multiple connections.',
        });
      }
      if (port.direction === 'input' && port.required && count === 0) {
        issues.push({
          path: `/nodes/${nodeIndex}/ports/${portIndex}`,
          message: 'Required input port is unconnected.',
        });
      }
    });
  });
  if (publicContract) {
    const publicIds = new Set<string>();
    for (const [collection, expectedDirection] of [
      [publicContract.inputs, 'input'],
      [publicContract.outputs, 'output'],
    ] as const) {
      for (const publicPort of collection) {
        if (publicIds.has(publicPort.id)) {
          issues.push({
            path: '/publicContract',
            message: `Duplicate public port id: ${publicPort.id}.`,
          });
        }
        publicIds.add(publicPort.id);
        const port = portsByIdentity.get(portIdentity(publicPort.port));
        if (
          !port ||
          port.direction !== expectedDirection ||
          port.flow !== 'data' ||
          port.typeRef !== publicPort.typeRef
        ) {
          issues.push({
            path: '/publicContract',
            message: `Public port ${publicPort.id} does not match an exact ${expectedDirection} data port.`,
          });
        }
      }
    }
  }
};

const decodeCurrentWire = (value: unknown): NodeGraphValidationResult => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: '/', message: 'Expected a NodeGraph wire object.' }],
    };
  }
  const issues: NodeGraphDecodeIssue[] = [];
  hasOnlyKeys(value, nodeGraphCurrentWireFields.document, '', issues);
  if (
    readOwn(value, 'version', '', issues) !== NODEGRAPH_CURRENT_WIRE_VERSION
  ) {
    issues.push({
      path: '/version',
      message: `Expected NodeGraph wire version ${NODEGRAPH_CURRENT_WIRE_VERSION}.`,
    });
  }
  const nodeCandidates = readOwn(value, 'nodes', '', issues);
  const edgeCandidates = readOwn(value, 'edges', '', issues);
  if (!Array.isArray(nodeCandidates) || nodeCandidates.length > 10_000) {
    issues.push({
      path: '/nodes',
      message: 'Expected a bounded node array.',
    });
  }
  if (!Array.isArray(edgeCandidates) || edgeCandidates.length > 50_000) {
    issues.push({
      path: '/edges',
      message: 'Expected a bounded edge array.',
    });
  }
  if (!Array.isArray(nodeCandidates) || !Array.isArray(edgeCandidates)) {
    return { ok: false, issues };
  }
  const nodes = nodeCandidates
    .map((node, index) => decodeNode(node, index, issues))
    .filter((node): node is NodeGraphNode => Boolean(node));
  const edges = edgeCandidates
    .map((edge, index) => decodeEdge(edge, index, issues))
    .filter((edge): edge is NodeGraphEdge => Boolean(edge));
  const publicContractCandidate = readOwn(value, 'publicContract', '', issues);
  const publicContract =
    publicContractCandidate === undefined
      ? undefined
      : decodePublicContract(
          publicContractCandidate,
          '/publicContract',
          issues
        );
  validateSemanticStructure(nodes, edges, publicContract ?? undefined, issues);
  return issues.length
    ? { ok: false, issues }
    : {
        ok: true,
        value: {
          nodes,
          edges,
          ...(publicContract ? { publicContract } : {}),
        },
      };
};

/** Decodes any supported persisted wire version into current domain state. */
export const decodeNodeGraphDocument = (
  value: unknown
): NodeGraphDecodeResult => {
  const upgraded = upgradeNodeGraphWireDocument(value);
  if (!upgraded.ok) {
    return { ok: false, issues: [...upgraded.issues] };
  }
  const decoded = decodeCurrentWire(upgraded.value);
  if (!decoded.ok) return decoded;
  return {
    ok: true,
    value: decoded.value,
    sourceWireVersion: upgraded.sourceWireVersion,
    appliedMigrations: upgraded.appliedMigrations,
  };
};

/** Validates an unversioned current domain object without wire dispatch. */
export const validateNodeGraphDocument = (
  value: unknown
): NodeGraphValidationResult => {
  if (!isPlainObject(value)) {
    return {
      ok: false,
      issues: [{ path: '/', message: 'Expected a NodeGraph domain object.' }],
    };
  }
  if (Object.hasOwn(value, 'version')) {
    return {
      ok: false,
      issues: [
        {
          path: '/version',
          message:
            'Numeric versions belong to the NodeGraph wire boundary, not the current domain model.',
        },
      ],
    };
  }
  return decodeCurrentWire({
    version: NODEGRAPH_CURRENT_WIRE_VERSION,
    ...value,
  });
};

/** Encodes current domain state into the active immutable wire snapshot. */
export const encodeNodeGraphDocument = (
  document: NodeGraphDocument
): Readonly<Record<string, unknown>> => {
  const validated = validateNodeGraphDocument(document);
  if (!validated.ok) {
    throw new TypeError(
      `Cannot encode invalid NodeGraph domain state: ${validated.issues
        .slice(0, 5)
        .map((issue) => `${issue.path}: ${issue.message}`)
        .join('; ')}`
    );
  }
  return Object.freeze({
    version: NODEGRAPH_CURRENT_WIRE_VERSION,
    nodes: validated.value.nodes,
    edges: validated.value.edges,
    ...(validated.value.publicContract
      ? { publicContract: validated.value.publicContract }
      : {}),
  });
};
