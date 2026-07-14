import {
  validatePirDocument,
  type PIRComponentContract,
  type PIRComponentInstanceNode,
  type PIRDocument,
} from '@prodivix/pir';
import { decodeWorkspacePirDocument } from './workspacePirDocument';
import type {
  WorkspaceDocument,
  WorkspaceDocumentId,
  WorkspaceSnapshot,
} from '../types';

export const WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES = {
  documentContractRole: 'WKS_COMPONENT_DOCUMENT_CONTRACT_ROLE',
  targetMissing: 'WKS_COMPONENT_TARGET_MISSING',
  targetType: 'WKS_COMPONENT_TARGET_TYPE',
  targetInvalid: 'WKS_COMPONENT_TARGET_INVALID',
  targetContractMissing: 'WKS_COMPONENT_TARGET_CONTRACT_MISSING',
  propNotExposed: 'WKS_COMPONENT_PROP_NOT_EXPOSED',
  eventNotExposed: 'WKS_COMPONENT_EVENT_NOT_EXPOSED',
  variantNotExposed: 'WKS_COMPONENT_VARIANT_NOT_EXPOSED',
  variantOptionNotExposed: 'WKS_COMPONENT_VARIANT_OPTION_NOT_EXPOSED',
  slotNotExposed: 'WKS_COMPONENT_SLOT_NOT_EXPOSED',
  requiredPropMissing: 'WKS_COMPONENT_REQUIRED_PROP_MISSING',
  requiredVariantMissing: 'WKS_COMPONENT_REQUIRED_VARIANT_MISSING',
  slotCardinality: 'WKS_COMPONENT_SLOT_CARDINALITY',
  bindingInvalid: 'WKS_COMPONENT_BINDING_INVALID',
  cycle: 'WKS_COMPONENT_CYCLE',
} as const;

export type WorkspaceComponentGraphIssueCode =
  (typeof WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES)[keyof typeof WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES];

export type WorkspaceComponentGraphIssue = Readonly<{
  code: WorkspaceComponentGraphIssueCode;
  path: string;
  message: string;
  documentId: WorkspaceDocumentId;
  nodeId?: string;
  targetDocumentId?: WorkspaceDocumentId;
  causeCode?: string;
}>;

export type WorkspaceComponentGraphDocument = Readonly<{
  documentId: WorkspaceDocumentId;
  documentType: 'pir-page' | 'pir-layout' | 'pir-component';
}>;

export type WorkspaceComponentDependencyEdge = Readonly<{
  sourceDocumentId: WorkspaceDocumentId;
  targetDocumentId: WorkspaceDocumentId;
  instanceNodeId: string;
  path: string;
}>;

export type WorkspaceComponentDependencyGraph = Readonly<{
  documents: readonly WorkspaceComponentGraphDocument[];
  componentDocumentIds: readonly WorkspaceDocumentId[];
  componentTopologicalOrder: readonly WorkspaceDocumentId[] | null;
  edges: readonly WorkspaceComponentDependencyEdge[];
  dependenciesByDocumentId: Readonly<
    Record<WorkspaceDocumentId, readonly WorkspaceDocumentId[]>
  >;
}>;

export type WorkspaceComponentGraphValidationResult = Readonly<{
  valid: boolean;
  graph: WorkspaceComponentDependencyGraph;
  issues: readonly WorkspaceComponentGraphIssue[];
}>;

type DecodedWorkspacePirDocument = Readonly<{
  workspaceDocument: WorkspaceDocument;
  document: PIRDocument;
}>;

const WORKSPACE_COMPONENT_SOURCE_TYPES = new Set([
  'pir-page',
  'pir-layout',
  'pir-component',
]);

const compareText = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const escapeJsonPointerSegment = (value: string) =>
  value.replace(/~/g, '~0').replace(/\//g, '~1');

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

const documentContentPath = (documentId: string) =>
  `/docsById/${escapeJsonPointerSegment(documentId)}/content`;

const instancePath = (documentId: string, nodeId: string) =>
  `${documentContentPath(documentId)}/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;

const addIssue = (
  issues: WorkspaceComponentGraphIssue[],
  issue: WorkspaceComponentGraphIssue
) => {
  issues.push(issue);
};

const collectDecodedDocuments = (snapshot: WorkspaceSnapshot) => {
  const decodedById = new Map<
    WorkspaceDocumentId,
    DecodedWorkspacePirDocument
  >();

  for (const documentId of Object.keys(snapshot.docsById).sort(compareText)) {
    const workspaceDocument = snapshot.docsById[documentId];
    if (
      !workspaceDocument ||
      !WORKSPACE_COMPONENT_SOURCE_TYPES.has(workspaceDocument.type)
    ) {
      continue;
    }

    const decoded = decodeWorkspacePirDocument(workspaceDocument, {
      workspaceId: snapshot.id,
    });
    if (decoded.status !== 'valid') continue;
    decodedById.set(documentId, {
      workspaceDocument,
      document: decoded.decodedContent,
    });
  }

  return decodedById;
};

const compareEdges = (
  left: WorkspaceComponentDependencyEdge,
  right: WorkspaceComponentDependencyEdge
) =>
  compareText(left.sourceDocumentId, right.sourceDocumentId) ||
  compareText(left.targetDocumentId, right.targetDocumentId) ||
  compareText(left.instanceNodeId, right.instanceNodeId) ||
  compareText(left.path, right.path);

const createComponentTopologicalOrder = (
  componentDocumentIds: readonly WorkspaceDocumentId[],
  dependenciesByDocumentId: Readonly<
    Record<WorkspaceDocumentId, readonly WorkspaceDocumentId[]>
  >
): readonly WorkspaceDocumentId[] | null => {
  const componentIds = new Set(componentDocumentIds);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const result: string[] = [];

  const visit = (documentId: string): boolean => {
    if (visited.has(documentId)) return true;
    if (visiting.has(documentId)) return false;
    visiting.add(documentId);
    for (const targetId of dependenciesByDocumentId[documentId] ?? []) {
      if (componentIds.has(targetId) && !visit(targetId)) return false;
    }
    visiting.delete(documentId);
    visited.add(documentId);
    result.push(documentId);
    return true;
  };

  for (const documentId of componentDocumentIds) {
    if (!visit(documentId)) return null;
  }
  return result;
};

const createDependencyGraph = (
  decodedById: ReadonlyMap<WorkspaceDocumentId, DecodedWorkspacePirDocument>
): WorkspaceComponentDependencyGraph => {
  const documents = [...decodedById.entries()]
    .map(([documentId, entry]): WorkspaceComponentGraphDocument => ({
      documentId,
      documentType: entry.workspaceDocument
        .type as WorkspaceComponentGraphDocument['documentType'],
    }))
    .sort((left, right) => compareText(left.documentId, right.documentId));
  const componentDocumentIds = documents
    .filter((document) => document.documentType === 'pir-component')
    .map((document) => document.documentId);
  const edges: WorkspaceComponentDependencyEdge[] = [];

  for (const { documentId } of documents) {
    const document = decodedById.get(documentId)?.document;
    if (!document) continue;
    for (const [nodeId, node] of Object.entries(
      document.ui.graph.nodesById
    ).sort(([left], [right]) => compareText(left, right))) {
      if (node.kind !== 'component-instance') continue;
      edges.push({
        sourceDocumentId: documentId,
        targetDocumentId: node.componentDocumentId,
        instanceNodeId: nodeId,
        path: `${instancePath(documentId, nodeId)}/componentDocumentId`,
      });
    }
  }
  edges.sort(compareEdges);

  const dependenciesByDocumentId: Record<string, readonly string[]> = {};
  for (const { documentId } of documents) {
    dependenciesByDocumentId[documentId] = [
      ...new Set(
        edges
          .filter((edge) => edge.sourceDocumentId === documentId)
          .map((edge) => edge.targetDocumentId)
      ),
    ].sort(compareText);
  }

  return {
    documents,
    componentDocumentIds,
    componentTopologicalOrder: createComponentTopologicalOrder(
      componentDocumentIds,
      dependenciesByDocumentId
    ),
    edges,
    dependenciesByDocumentId,
  };
};

const validateBindingMap = (
  input: Readonly<{
    documentId: string;
    nodeId: string;
    targetDocumentId: string;
    bindingKind: 'props' | 'events';
    bindings: Readonly<Record<string, unknown>>;
    contractMembers: Readonly<Record<string, unknown>>;
    issueCode:
      | typeof WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.propNotExposed
      | typeof WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.eventNotExposed;
  }>,
  issues: WorkspaceComponentGraphIssue[]
) => {
  for (const memberId of Object.keys(input.bindings).sort(compareText)) {
    if (hasOwn(input.contractMembers, memberId)) continue;
    addIssue(issues, {
      code: input.issueCode,
      path: `${instancePath(input.documentId, input.nodeId)}/bindings/${input.bindingKind}/${escapeJsonPointerSegment(memberId)}`,
      message: `Component ${input.bindingKind} binding must reference an exposed target contract member.`,
      documentId: input.documentId,
      nodeId: input.nodeId,
      targetDocumentId: input.targetDocumentId,
    });
  }
};

const validateInstanceContract = (
  documentId: string,
  nodeId: string,
  node: PIRComponentInstanceNode,
  sourceDocument: PIRDocument,
  contract: PIRComponentContract,
  issues: WorkspaceComponentGraphIssue[]
) => {
  const targetDocumentId = node.componentDocumentId;
  validateBindingMap(
    {
      documentId,
      nodeId,
      targetDocumentId,
      bindingKind: 'props',
      bindings: node.bindings.props,
      contractMembers: contract.propsById,
      issueCode: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.propNotExposed,
    },
    issues
  );
  validateBindingMap(
    {
      documentId,
      nodeId,
      targetDocumentId,
      bindingKind: 'events',
      bindings: node.bindings.events,
      contractMembers: contract.eventsById,
      issueCode: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.eventNotExposed,
    },
    issues
  );

  for (const [axisId, optionId] of Object.entries(node.bindings.variants).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const axis = hasOwn(contract.variantAxesById, axisId)
      ? contract.variantAxesById[axisId]
      : undefined;
    const path = `${instancePath(documentId, nodeId)}/bindings/variants/${escapeJsonPointerSegment(axisId)}`;
    if (!axis) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.variantNotExposed,
        path,
        message:
          'Component variant binding must reference an exposed target contract axis.',
        documentId,
        nodeId,
        targetDocumentId,
      });
    } else if (!hasOwn(axis.optionsById, optionId)) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.variantOptionNotExposed,
        path,
        message:
          'Component variant binding must reference an option on its target axis.',
        documentId,
        nodeId,
        targetDocumentId,
      });
    }
  }

  for (const [propId, prop] of Object.entries(contract.propsById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    if (!prop.required || hasOwn(node.bindings.props, propId)) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.requiredPropMissing,
      path: `${instancePath(documentId, nodeId)}/bindings/props/${escapeJsonPointerSegment(propId)}`,
      message: `Required component prop "${propId}" must be bound by the instance.`,
      documentId,
      nodeId,
      targetDocumentId,
    });
  }

  for (const [axisId, axis] of Object.entries(contract.variantAxesById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    if (!axis.required || hasOwn(node.bindings.variants, axisId)) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.requiredVariantMissing,
      path: `${instancePath(documentId, nodeId)}/bindings/variants/${escapeJsonPointerSegment(axisId)}`,
      message: `Required component variant "${axisId}" must be bound by the instance.`,
      documentId,
      nodeId,
      targetDocumentId,
    });
  }

  const regionsByOwner = sourceDocument.ui.graph.regionsById;
  const regions =
    regionsByOwner && hasOwn(regionsByOwner, nodeId)
      ? (regionsByOwner[nodeId] ?? {})
      : {};
  for (const slotId of Object.keys(regions).sort(compareText)) {
    if (hasOwn(contract.slotsById, slotId)) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.slotNotExposed,
      path: `${documentContentPath(documentId)}/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(slotId)}`,
      message:
        'Component instance region must reference an exposed target contract slot.',
      documentId,
      nodeId,
      targetDocumentId,
    });
  }

  for (const [slotId, slot] of Object.entries(contract.slotsById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const childCount = hasOwn(regions, slotId)
      ? (regions[slotId]?.length ?? 0)
      : 0;
    const hasValidMinimum =
      slot.minChildren !== undefined &&
      Number.isInteger(slot.minChildren) &&
      slot.minChildren >= 0;
    const hasValidMaximum =
      slot.maxChildren !== undefined &&
      Number.isInteger(slot.maxChildren) &&
      slot.maxChildren >= 0;
    if (
      (hasValidMinimum && childCount < slot.minChildren!) ||
      (hasValidMaximum && childCount > slot.maxChildren!)
    ) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.slotCardinality,
        path: `${documentContentPath(documentId)}/ui/graph/regionsById/${escapeJsonPointerSegment(nodeId)}/${escapeJsonPointerSegment(slotId)}`,
        message: `Component slot "${slotId}" received ${childCount} children outside its contract cardinality.`,
        documentId,
        nodeId,
        targetDocumentId,
      });
    }
  }
};

const validateTargetsAndContracts = (
  snapshot: WorkspaceSnapshot,
  decodedById: ReadonlyMap<WorkspaceDocumentId, DecodedWorkspacePirDocument>,
  graph: WorkspaceComponentDependencyGraph,
  issues: WorkspaceComponentGraphIssue[]
) => {
  for (const edge of graph.edges) {
    const source = decodedById.get(edge.sourceDocumentId)?.document;
    const node =
      source && hasOwn(source.ui.graph.nodesById, edge.instanceNodeId)
        ? source.ui.graph.nodesById[edge.instanceNodeId]
        : undefined;
    if (!source || !node || node.kind !== 'component-instance') continue;

    const issueBase = {
      path: edge.path,
      documentId: edge.sourceDocumentId,
      nodeId: edge.instanceNodeId,
      targetDocumentId: edge.targetDocumentId,
    } as const;
    const targetWorkspaceDocument = hasOwn(
      snapshot.docsById,
      edge.targetDocumentId
    )
      ? snapshot.docsById[edge.targetDocumentId]
      : undefined;
    if (!targetWorkspaceDocument) {
      addIssue(issues, {
        ...issueBase,
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetMissing,
        message: 'Component instance target document does not exist.',
      });
      continue;
    }
    if (targetWorkspaceDocument.type !== 'pir-component') {
      addIssue(issues, {
        ...issueBase,
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetType,
        message: 'Component instance target must be a pir-component document.',
      });
      continue;
    }
    const targetRead = decodeWorkspacePirDocument(targetWorkspaceDocument, {
      workspaceId: snapshot.id,
    });
    if (targetRead.status !== 'valid') {
      addIssue(issues, {
        ...issueBase,
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetInvalid,
        message:
          'Component instance target is not a valid canonical PIR document.',
      });
      continue;
    }
    const target = targetRead.decodedContent;
    if (!target.componentContract) {
      addIssue(issues, {
        ...issueBase,
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.targetContractMissing,
        message: 'Component instance target must own a component contract.',
      });
      continue;
    }

    validateInstanceContract(
      edge.sourceDocumentId,
      edge.instanceNodeId,
      node,
      source,
      target.componentContract,
      issues
    );
  }
};

const validateDocumentContractRoles = (
  decodedById: ReadonlyMap<WorkspaceDocumentId, DecodedWorkspacePirDocument>,
  issues: WorkspaceComponentGraphIssue[]
) => {
  for (const [documentId, entry] of [...decodedById.entries()].sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const ownsContract = entry.document.componentContract !== undefined;
    const isComponent = entry.workspaceDocument.type === 'pir-component';
    if (ownsContract === isComponent) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.documentContractRole,
      path: `${documentContentPath(documentId)}/componentContract`,
      message: isComponent
        ? 'A pir-component document must own a component contract.'
        : 'Only a pir-component document may own a component contract.',
      documentId,
    });
  }
};

const validateCrossDocumentBindings = (
  decodedById: ReadonlyMap<WorkspaceDocumentId, DecodedWorkspacePirDocument>,
  issues: WorkspaceComponentGraphIssue[]
) => {
  const resolveComponentContract = (
    documentId: string
  ): PIRComponentContract | undefined =>
    decodedById.get(documentId)?.document.componentContract;

  for (const [documentId, entry] of [...decodedById.entries()].sort(
    ([left], [right]) => compareText(left, right)
  )) {
    const validation = validatePirDocument(entry.document, {
      resolveComponentContract,
    });
    for (const issue of validation.issues) {
      addIssue(issues, {
        code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.bindingInvalid,
        causeCode: issue.code,
        path: `${documentContentPath(documentId)}${issue.path}`,
        message: issue.message,
        documentId,
      });
    }
  }
};

const collectStronglyConnectedComponents = (
  componentDocumentIds: readonly string[],
  adjacency: ReadonlyMap<string, readonly string[]>
) => {
  let nextIndex = 0;
  const indices = new Map<string, number>();
  const lowLinks = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const components: string[][] = [];

  const connect = (documentId: string) => {
    const currentIndex = nextIndex;
    nextIndex += 1;
    indices.set(documentId, currentIndex);
    lowLinks.set(documentId, currentIndex);
    stack.push(documentId);
    onStack.add(documentId);

    for (const targetId of adjacency.get(documentId) ?? []) {
      if (!indices.has(targetId)) {
        connect(targetId);
        lowLinks.set(
          documentId,
          Math.min(lowLinks.get(documentId)!, lowLinks.get(targetId)!)
        );
      } else if (onStack.has(targetId)) {
        lowLinks.set(
          documentId,
          Math.min(lowLinks.get(documentId)!, indices.get(targetId)!)
        );
      }
    }

    if (lowLinks.get(documentId) !== indices.get(documentId)) return;
    const component: string[] = [];
    let member: string | undefined;
    do {
      member = stack.pop();
      if (!member) break;
      onStack.delete(member);
      component.push(member);
    } while (member !== documentId);
    components.push(component.sort(compareText));
  };

  for (const documentId of componentDocumentIds) {
    if (!indices.has(documentId)) connect(documentId);
  }
  return components.sort((left, right) =>
    compareText(left[0] ?? '', right[0] ?? '')
  );
};

const validateCycles = (
  snapshot: WorkspaceSnapshot,
  decodedById: ReadonlyMap<WorkspaceDocumentId, DecodedWorkspacePirDocument>,
  graph: WorkspaceComponentDependencyGraph,
  issues: WorkspaceComponentGraphIssue[]
) => {
  const componentIds = new Set(graph.componentDocumentIds);
  const adjacency = new Map<string, readonly string[]>();
  for (const documentId of graph.componentDocumentIds) {
    const targets = graph.edges
      .filter(
        (edge) =>
          edge.sourceDocumentId === documentId &&
          componentIds.has(edge.targetDocumentId) &&
          hasOwn(snapshot.docsById, edge.targetDocumentId) &&
          snapshot.docsById[edge.targetDocumentId]?.type === 'pir-component' &&
          decodedById.has(edge.targetDocumentId)
      )
      .map((edge) => edge.targetDocumentId);
    adjacency.set(documentId, [...new Set(targets)].sort(compareText));
  }

  for (const members of collectStronglyConnectedComponents(
    graph.componentDocumentIds,
    adjacency
  )) {
    const memberSet = new Set(members);
    const selfCycle =
      members.length === 1 &&
      (adjacency.get(members[0] ?? '') ?? []).includes(members[0] ?? '');
    if (members.length === 1 && !selfCycle) continue;

    const location = graph.edges.find(
      (edge) =>
        memberSet.has(edge.sourceDocumentId) &&
        memberSet.has(edge.targetDocumentId)
    );
    if (!location) continue;
    addIssue(issues, {
      code: WORKSPACE_COMPONENT_GRAPH_ISSUE_CODES.cycle,
      path: location.path,
      message: `Component dependency cycle contains: ${members.join(', ')}.`,
      documentId: location.sourceDocumentId,
      nodeId: location.instanceNodeId,
      targetDocumentId: location.targetDocumentId,
    });
  }
};

const compareIssues = (
  left: WorkspaceComponentGraphIssue,
  right: WorkspaceComponentGraphIssue
) =>
  compareText(left.path, right.path) ||
  compareText(left.code, right.code) ||
  compareText(left.message, right.message) ||
  compareText(left.targetDocumentId ?? '', right.targetDocumentId ?? '');

/**
 * Builds the canonical PIR Component dependency graph and validates every
 * cross-document instance boundary.
 */
export const validateWorkspaceComponentGraph = (
  snapshot: WorkspaceSnapshot
): WorkspaceComponentGraphValidationResult => {
  const decodedById = collectDecodedDocuments(snapshot);
  const graph = createDependencyGraph(decodedById);
  const issues: WorkspaceComponentGraphIssue[] = [];

  validateDocumentContractRoles(decodedById, issues);
  validateCrossDocumentBindings(decodedById, issues);
  validateTargetsAndContracts(snapshot, decodedById, graph, issues);
  validateCycles(snapshot, decodedById, graph, issues);
  issues.sort(compareIssues);

  return { valid: issues.length === 0, graph, issues };
};
