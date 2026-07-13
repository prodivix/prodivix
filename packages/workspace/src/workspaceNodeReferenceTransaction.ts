import type { AnimationDefinition } from '@prodivix/animation';
import type { NodeId, PIRDocument, UiGraph } from '@prodivix/shared/types/pir';
import type {
  RouteModule,
  WorkspaceRouteManifest,
  WorkspaceRouteNode,
} from '@prodivix/router';
import { validateRouteManifest } from '@prodivix/router';
import { validatePirDocument } from '@prodivix/pir';
import type {
  WorkspaceCommandEnvelope,
  WorkspacePatchOperation,
  WorkspaceTransactionEnvelope,
} from './workspaceCommand';
import type { WorkspacePirDocument } from './workspaceSelectors';
import type { WorkspaceSnapshot } from './types';

type NodeIdRewriteMap = Readonly<Record<NodeId, NodeId>>;
type RemovedNodeIds = readonly NodeId[] | ReadonlySet<NodeId>;

type NodeReferenceTransactionBaseInput = Readonly<{
  workspace: WorkspaceSnapshot;
  document: WorkspacePirDocument;
  afterGraph: UiGraph;
  transactionId?: string;
  issuedAt?: string;
  label?: string;
}>;

export type CreateNodeRenameTransactionInput =
  NodeReferenceTransactionBaseInput &
    Readonly<{
      nodeIdMap: NodeIdRewriteMap;
    }>;

export type CreateNodeRemovalTransactionInput =
  NodeReferenceTransactionBaseInput &
    Readonly<{
      removedNodeIds: RemovedNodeIds;
    }>;

type ReferenceRewritePlan = Readonly<{
  renamedNodeIds: ReadonlyMap<NodeId, NodeId>;
  removedNodeIds: ReadonlySet<NodeId>;
}>;

const createTransactionId = (): string => {
  return `node-reference-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const normalizeRenameMap = (
  source: NodeIdRewriteMap
): ReadonlyMap<NodeId, NodeId> | null => {
  const renamedNodeIds = new Map<NodeId, NodeId>();
  for (const [rawFromId, rawToId] of Object.entries(source)) {
    const fromId = rawFromId.trim();
    const toId = rawToId.trim();
    if (!fromId || !toId) return null;
    if (fromId !== toId) renamedNodeIds.set(fromId, toId);
  }
  return renamedNodeIds.size ? renamedNodeIds : null;
};

const normalizeRemovedNodeIds = (
  source: RemovedNodeIds
): ReadonlySet<NodeId> | null => {
  const removedNodeIds = new Set<NodeId>();
  for (const rawNodeId of source) {
    const nodeId = rawNodeId.trim();
    if (!nodeId) return null;
    removedNodeIds.add(nodeId);
  }
  return removedNodeIds.size ? removedNodeIds : null;
};

const validateRewritePlan = (
  beforeGraph: UiGraph,
  afterGraph: UiGraph,
  plan: ReferenceRewritePlan
): boolean => {
  for (const [fromId, toId] of plan.renamedNodeIds) {
    if (
      !beforeGraph.nodesById[fromId] ||
      beforeGraph.nodesById[toId] ||
      afterGraph.nodesById[fromId] ||
      !afterGraph.nodesById[toId] ||
      plan.removedNodeIds.has(fromId) ||
      plan.removedNodeIds.has(toId)
    ) {
      return false;
    }
  }
  for (const nodeId of plan.removedNodeIds) {
    if (!beforeGraph.nodesById[nodeId] || afterGraph.nodesById[nodeId]) {
      return false;
    }
  }
  return true;
};

const collectRemovedGraphNodeIds = (
  beforeGraph: UiGraph,
  afterGraph: UiGraph
): Set<NodeId> =>
  new Set(
    Object.keys(beforeGraph.nodesById).filter(
      (nodeId) => !afterGraph.nodesById[nodeId]
    )
  );

const rewriteNodeReference = (
  rawNodeId: string,
  plan: ReferenceRewritePlan
): string | null => {
  const nodeId = rawNodeId.trim();
  if (!nodeId || plan.removedNodeIds.has(nodeId)) return null;
  return plan.renamedNodeIds.get(nodeId) ?? nodeId;
};

const rewriteAnimationReferences = (
  animation: AnimationDefinition | undefined,
  plan: ReferenceRewritePlan
): AnimationDefinition | undefined => {
  if (!animation) return undefined;
  let animationChanged = false;
  const timelines = animation.timelines.map((timeline) => {
    let timelineChanged = false;
    const bindings = timeline.bindings.flatMap((binding) => {
      const targetNodeId = rewriteNodeReference(binding.targetNodeId, plan);
      if (!targetNodeId) {
        timelineChanged = true;
        return [];
      }
      if (targetNodeId === binding.targetNodeId) return [binding];
      timelineChanged = true;
      return [{ ...binding, targetNodeId }];
    });
    if (!timelineChanged) return timeline;
    animationChanged = true;
    return { ...timeline, bindings };
  });
  return animationChanged ? { ...animation, timelines } : animation;
};

const rewriteRouteNodeReferences = (
  node: WorkspaceRouteNode,
  plan: ReferenceRewritePlan
): WorkspaceRouteNode => {
  let changed = false;
  const nextOutletNodeId = node.outletNodeId
    ? rewriteNodeReference(node.outletNodeId, plan)
    : undefined;
  if (nextOutletNodeId !== node.outletNodeId) changed = true;

  let nextOutletBindings = node.outletBindings;
  if (node.outletBindings) {
    const rewrittenBindings = Object.fromEntries(
      Object.entries(node.outletBindings).flatMap(([name, binding]) => {
        const outletNodeId = rewriteNodeReference(binding.outletNodeId, plan);
        if (!outletNodeId) {
          changed = true;
          return [];
        }
        if (outletNodeId === binding.outletNodeId) return [[name, binding]];
        changed = true;
        return [[name, { ...binding, outletNodeId }]];
      })
    );
    nextOutletBindings = Object.keys(rewrittenBindings).length
      ? rewrittenBindings
      : undefined;
  }

  const children = node.children ?? [];
  const nextChildren = children.map((child) =>
    rewriteRouteNodeReferences(child, plan)
  );
  if (nextChildren.some((child, index) => child !== children[index])) {
    changed = true;
  }
  if (!changed) return node;
  return {
    ...node,
    outletNodeId: nextOutletNodeId ?? undefined,
    outletBindings: nextOutletBindings,
    ...(node.children ? { children: nextChildren } : {}),
  };
};

const rewriteRouteModuleReferences = (
  module: RouteModule,
  plan: ReferenceRewritePlan
): RouteModule => {
  const root = rewriteRouteNodeReferences(module.root, plan);
  return root === module.root ? module : { ...module, root };
};

const rewriteRouteManifestReferences = (
  manifest: WorkspaceRouteManifest,
  plan: ReferenceRewritePlan
): WorkspaceRouteManifest => {
  const root = rewriteRouteNodeReferences(manifest.root, plan);
  const modules = manifest.modules
    ? Object.fromEntries(
        Object.entries(manifest.modules).map(([moduleId, module]) => [
          moduleId,
          rewriteRouteModuleReferences(module, plan),
        ])
      )
    : undefined;
  const modulesChanged = Boolean(
    modules &&
    Object.entries(modules).some(
      ([moduleId, module]) => module !== manifest.modules?.[moduleId]
    )
  );
  if (root === manifest.root && !modulesChanged) return manifest;
  return {
    ...manifest,
    root,
    ...(modules ? { modules } : {}),
  };
};

const createPirCommand = (input: {
  id: string;
  issuedAt: string;
  workspace: WorkspaceSnapshot;
  document: WorkspacePirDocument;
  afterGraph: UiGraph;
  afterAnimation: AnimationDefinition | undefined;
  type: string;
  label: string;
}): WorkspaceCommandEnvelope => {
  const beforeDocument = input.document.content;
  const animationChanged = input.afterAnimation !== beforeDocument.animation;
  const animationOps: {
    forward: WorkspacePatchOperation[];
    reverse: WorkspacePatchOperation[];
  } = { forward: [], reverse: [] };
  if (animationChanged) {
    if (beforeDocument.animation === undefined) {
      animationOps.forward.push({
        op: 'add',
        path: '/animation',
        value: input.afterAnimation,
      });
      animationOps.reverse.push({ op: 'remove', path: '/animation' });
    } else if (input.afterAnimation === undefined) {
      animationOps.forward.push({ op: 'remove', path: '/animation' });
      animationOps.reverse.push({
        op: 'add',
        path: '/animation',
        value: beforeDocument.animation,
      });
    } else {
      animationOps.forward.push({
        op: 'replace',
        path: '/animation',
        value: input.afterAnimation,
      });
      animationOps.reverse.push({
        op: 'replace',
        path: '/animation',
        value: beforeDocument.animation,
      });
    }
  }
  return {
    id: `${input.id}:pir`,
    namespace: 'core.pir',
    type: input.type,
    version: '1.0',
    issuedAt: input.issuedAt,
    target: {
      workspaceId: input.workspace.id,
      documentId: input.document.id,
    },
    domainHint: 'pir',
    label: input.label,
    forwardOps: [
      { op: 'replace', path: '/ui/graph', value: input.afterGraph },
      ...animationOps.forward,
    ],
    reverseOps: [
      ...animationOps.reverse,
      { op: 'replace', path: '/ui/graph', value: beforeDocument.ui.graph },
    ],
  };
};

const createRouteCommand = (input: {
  id: string;
  issuedAt: string;
  workspace: WorkspaceSnapshot;
  afterRouteManifest: WorkspaceRouteManifest;
  label: string;
}): WorkspaceCommandEnvelope => ({
  id: `${input.id}:route`,
  namespace: 'core.route',
  type: 'outlet-reference.rewrite',
  version: '1.0',
  issuedAt: input.issuedAt,
  target: { workspaceId: input.workspace.id },
  domainHint: 'route',
  label: input.label,
  forwardOps: [
    {
      op: 'replace',
      path: '/routeManifest',
      value: input.afterRouteManifest,
    },
  ],
  reverseOps: [
    {
      op: 'replace',
      path: '/routeManifest',
      value: input.workspace.routeManifest,
    },
  ],
});

const createReferenceTransaction = (
  input: NodeReferenceTransactionBaseInput,
  plan: ReferenceRewritePlan,
  operation: Readonly<{ type: string; defaultLabel: string }>
): WorkspaceTransactionEnvelope | null => {
  const currentDocument = input.workspace.docsById[input.document.id];
  if (
    input.workspace.activeDocumentId !== input.document.id ||
    currentDocument !== input.document ||
    !validateRewritePlan(
      input.document.content.ui.graph,
      input.afterGraph,
      plan
    )
  ) {
    return null;
  }

  const afterAnimation = rewriteAnimationReferences(
    input.document.content.animation,
    plan
  );
  const { animation: _beforeAnimation, ...documentWithoutAnimation } =
    input.document.content;
  const afterDocument: PIRDocument = {
    ...documentWithoutAnimation,
    ui: { graph: input.afterGraph },
    ...(afterAnimation ? { animation: afterAnimation } : {}),
  };
  if (validatePirDocument(afterDocument).hasError) return null;

  const afterRouteManifest = rewriteRouteManifestReferences(
    input.workspace.routeManifest,
    plan
  );
  const routeIssues = validateRouteManifest({
    manifest: afterRouteManifest,
    documentExists: (documentId) =>
      Boolean(input.workspace.docsById[documentId]),
  });
  if (routeIssues.length) return null;

  const id = input.transactionId ?? createTransactionId();
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const label = input.label ?? operation.defaultLabel;
  const commands = [
    createPirCommand({
      id,
      issuedAt,
      workspace: input.workspace,
      document: input.document,
      afterGraph: input.afterGraph,
      afterAnimation,
      type: operation.type,
      label,
    }),
  ];
  if (afterRouteManifest !== input.workspace.routeManifest) {
    commands.push(
      createRouteCommand({
        id,
        issuedAt,
        workspace: input.workspace,
        afterRouteManifest,
        label,
      })
    );
  }
  return {
    id,
    workspaceId: input.workspace.id,
    issuedAt,
    label,
    commands,
  };
};

export const createNodeRenameTransaction = (
  input: CreateNodeRenameTransactionInput
): WorkspaceTransactionEnvelope | null => {
  const renamedNodeIds = normalizeRenameMap(input.nodeIdMap);
  if (!renamedNodeIds) return null;
  const removedGraphNodeIds = collectRemovedGraphNodeIds(
    input.document.content.ui.graph,
    input.afterGraph
  );
  if (
    removedGraphNodeIds.size !== renamedNodeIds.size ||
    [...removedGraphNodeIds].some((nodeId) => !renamedNodeIds.has(nodeId))
  ) {
    return null;
  }
  return createReferenceTransaction(
    input,
    { renamedNodeIds, removedNodeIds: new Set() },
    { type: 'node.rename', defaultLabel: 'Rename node' }
  );
};

export const createNodeDeleteTransaction = (
  input: CreateNodeRemovalTransactionInput
): WorkspaceTransactionEnvelope | null => {
  const normalizedRemovedNodeIds = normalizeRemovedNodeIds(
    input.removedNodeIds
  );
  if (!normalizedRemovedNodeIds) return null;
  const removedNodeIds = new Set(normalizedRemovedNodeIds);
  collectRemovedGraphNodeIds(
    input.document.content.ui.graph,
    input.afterGraph
  ).forEach((nodeId) => removedNodeIds.add(nodeId));
  return createReferenceTransaction(
    input,
    { renamedNodeIds: new Map(), removedNodeIds },
    { type: 'node.delete', defaultLabel: 'Delete node' }
  );
};

export const createNodeSubtreeRemovalTransaction = (
  input: CreateNodeRemovalTransactionInput
): WorkspaceTransactionEnvelope | null => {
  const normalizedRemovedNodeIds = normalizeRemovedNodeIds(
    input.removedNodeIds
  );
  if (!normalizedRemovedNodeIds) return null;
  const removedNodeIds = new Set(normalizedRemovedNodeIds);
  collectRemovedGraphNodeIds(
    input.document.content.ui.graph,
    input.afterGraph
  ).forEach((nodeId) => removedNodeIds.add(nodeId));
  return createReferenceTransaction(
    input,
    { renamedNodeIds: new Map(), removedNodeIds },
    { type: 'subtree.remove', defaultLabel: 'Remove node subtree' }
  );
};
