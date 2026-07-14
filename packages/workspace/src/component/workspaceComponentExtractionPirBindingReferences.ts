import type {
  PIRDocument,
  PIRNode,
  PIRTriggerBinding,
  PIRValueBinding,
} from '@prodivix/pir';
import type {
  NormalizedWorkspaceComponentExtractionReferenceContext,
  WorkspaceComponentExtractionPublicMemberSource,
  WorkspaceComponentExtractionReferenceContribution,
  WorkspaceComponentExtractionReferenceTarget,
} from './workspaceComponentExtractionReference.types';
import { WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS } from './workspaceComponentExtractionReference.types';
import {
  compareText,
  createPirOwner,
  createPirRewrite,
  createStableExternalContribution,
  createUnsupportedContribution,
  escapeJsonPointerSegment,
  memberSourceKey,
} from './workspaceComponentExtractionReferenceBuiltInUtils';

type NormalizedContext = NormalizedWorkspaceComponentExtractionReferenceContext;

export const collectCollectionSymbolOwners = (
  document: PIRDocument
): ReadonlyMap<string, string> => {
  const owners = new Map<string, string>();
  for (const [nodeId, node] of Object.entries(document.ui.graph.nodesById).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    if (node.kind !== 'collection') continue;
    owners.set(node.symbols.itemId, nodeId);
    owners.set(node.symbols.indexId, nodeId);
    if (node.symbols.errorId) owners.set(node.symbols.errorId, nodeId);
  }
  return owners;
};

const createLexicalTarget = (
  context: NormalizedContext,
  kind: WorkspaceComponentExtractionPublicMemberSource['kind'],
  id: string,
  collectionSymbolOwners: ReadonlyMap<string, string>
): WorkspaceComponentExtractionReferenceTarget => ({
  kind: 'pir-lexical',
  documentId: context.sourceDocumentId,
  symbolKind: kind,
  symbolId: id,
  ...(kind === 'collection-symbol' && collectionSymbolOwners.has(id)
    ? { ownerNodeId: collectionSymbolOwners.get(id)! }
    : {}),
});

export const collectValueBindingContribution = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  path: string,
  value: PIRValueBinding
): void => {
  if (value.kind === 'literal') return;
  const owner = createPirOwner(context.sourceDocumentId, nodeId, path);
  const id = `pir:${context.sourceDocumentId}:${nodeId}:${path}`;
  if (value.kind === 'code') {
    contributions.push(
      createStableExternalContribution(
        {
          id,
          kind: 'code-reference',
          owner,
          target: {
            kind: 'code',
            artifactId: value.reference.artifactId,
            ...(value.reference.symbolId
              ? { symbolId: value.reference.symbolId }
              : {}),
            ...(value.reference.exportName
              ? { exportName: value.reference.exportName }
              : {}),
          },
        },
        'CodeReference uses stable artifact identity and moves with its PIR owner.'
      )
    );
    return;
  }

  let source: WorkspaceComponentExtractionPublicMemberSource;
  switch (value.kind) {
    case 'param':
      source = { kind: 'param', id: value.paramId };
      break;
    case 'state':
      source = { kind: 'state', id: value.stateId };
      break;
    case 'data':
      source = { kind: 'data', id: value.dataId };
      break;
    case 'collection-symbol':
      source = { kind: 'collection-symbol', id: value.symbolId };
      break;
    case 'component-prop':
      source = { kind: 'component-prop', id: value.memberId };
      break;
    case 'component-variant':
      source = { kind: 'component-variant', id: value.memberId };
      break;
    case 'slot-prop':
      source = { kind: 'slot-prop', id: value.memberId };
      break;
  }
  const target = createLexicalTarget(
    context,
    source.kind,
    source.id,
    collectionSymbolOwners
  );
  if (
    target.kind === 'pir-lexical' &&
    target.ownerNodeId &&
    context.movedNodeIdSet.has(target.ownerNodeId)
  ) {
    contributions.push({
      id,
      kind: 'pir-lexical-binding',
      owner,
      target,
      classification:
        WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.internalMovesWithSubtree,
      reason:
        'The lexical symbol owner and its reference move in the same subtree.',
    });
    return;
  }

  const mapping = context.memberMappingsBySource.get(memberSourceKey(source));
  if (mapping?.target.kind === 'prop') {
    const after: PIRValueBinding = {
      kind: 'component-prop',
      memberId: mapping.target.memberId,
      ...('path' in value && value.path ? { path: value.path } : {}),
    };
    contributions.push({
      id,
      kind: 'pir-lexical-binding',
      owner,
      target,
      classification:
        WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract,
      reason:
        'The source lexical dependency is explicitly promoted to a public prop.',
      rewrite: createPirRewrite(context, nodeId, path, value, after, mapping),
    });
    return;
  }

  contributions.push(
    createUnsupportedContribution(
      { id, kind: 'pir-lexical-binding', owner, target },
      mapping
        ? 'This PIR value dependency can only be promoted to a public prop.'
        : 'A moved PIR value depends on source-document lexical state without a public prop mapping.'
    )
  );
};

export const collectTriggerContribution = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  path: string,
  trigger: PIRTriggerBinding
): void => {
  if (trigger.kind === 'open-url') return;
  const owner = createPirOwner(context.sourceDocumentId, nodeId, path);
  const id = `pir:${context.sourceDocumentId}:${nodeId}:${path}`;
  if (trigger.kind === 'emit-component-event') {
    if (trigger.payload) {
      collectValueBindingContribution(
        contributions,
        context,
        collectionSymbolOwners,
        nodeId,
        `${path}/payload`,
        trigger.payload
      );
    }
    const source: WorkspaceComponentExtractionPublicMemberSource = {
      kind: 'component-event',
      id: trigger.memberId,
    };
    const target = createLexicalTarget(
      context,
      source.kind,
      source.id,
      collectionSymbolOwners
    );
    const mapping = context.memberMappingsBySource.get(memberSourceKey(source));
    if (mapping?.target.kind === 'event') {
      contributions.push({
        id,
        kind: 'component-event-reference',
        owner,
        target,
        classification:
          WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract,
        reason:
          'The source event dependency is explicitly promoted to the extracted Component Contract.',
        rewrite: createPirRewrite(
          context,
          nodeId,
          path,
          trigger,
          { ...trigger, memberId: mapping.target.memberId },
          mapping
        ),
      });
      return;
    }
    contributions.push(
      createUnsupportedContribution(
        { id, kind: 'component-event-reference', owner, target },
        mapping
          ? 'A Component event dependency can only be promoted to a public event.'
          : 'A moved event emitter still targets the source Component Contract without a public event mapping.'
      )
    );
    return;
  }
  if (trigger.kind === 'navigate-route') {
    contributions.push(
      createStableExternalContribution(
        {
          id,
          kind: 'route-reference',
          owner,
          target: { kind: 'route', routeId: trigger.routeId },
        },
        'Route identity is Workspace-stable and remains typed after extraction.'
      )
    );
    return;
  }
  if (trigger.kind === 'call-code') {
    contributions.push(
      createStableExternalContribution(
        {
          id,
          kind: 'code-reference',
          owner,
          target: {
            kind: 'code',
            artifactId: trigger.reference.artifactId,
            ...(trigger.reference.symbolId
              ? { symbolId: trigger.reference.symbolId }
              : {}),
            ...(trigger.reference.exportName
              ? { exportName: trigger.reference.exportName }
              : {}),
          },
        },
        'CodeReference uses stable artifact identity and remains typed after extraction.'
      )
    );
    return;
  }
  if (trigger.kind === 'run-nodegraph') {
    contributions.push(
      createStableExternalContribution(
        {
          id,
          kind: 'nodegraph-reference',
          owner,
          target: { kind: 'nodegraph', documentId: trigger.documentId },
        },
        'NodeGraph trigger uses a document-qualified stable target.'
      )
    );
    return;
  }
  contributions.push(
    createStableExternalContribution(
      {
        id,
        kind: 'animation-reference',
        owner,
        target: {
          kind: 'animation',
          documentId: trigger.documentId,
          timelineId: trigger.timelineId,
        },
      },
      'Animation trigger uses a document-qualified stable target.'
    )
  );
};

export const collectNodeValueBindings = (
  contributions: WorkspaceComponentExtractionReferenceContribution[],
  context: NormalizedContext,
  collectionSymbolOwners: ReadonlyMap<string, string>,
  nodeId: string,
  node: Extract<PIRNode, { kind: 'element' }>
): void => {
  const base = `/ui/graph/nodesById/${escapeJsonPointerSegment(nodeId)}`;
  if (node.text) {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/text`,
      node.text
    );
  }
  for (const [field, value] of Object.entries(node.style ?? {}).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/style/${escapeJsonPointerSegment(field)}`,
      value
    );
  }
  for (const [field, value] of Object.entries(node.props ?? {}).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/props/${escapeJsonPointerSegment(field)}`,
      value
    );
  }
  const dataBindings: readonly [string, PIRValueBinding | undefined][] = [
    ['source', node.data?.source],
    ['pick', undefined],
    ['value', node.data?.value],
    ['mock', node.data?.mock],
  ];
  for (const [field, value] of dataBindings) {
    if (!value) continue;
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/data/${field}`,
      value
    );
  }
  for (const [field, value] of Object.entries(node.data?.extend ?? {}).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    collectValueBindingContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/data/extend/${escapeJsonPointerSegment(field)}`,
      value
    );
  }
  for (const [eventName, trigger] of Object.entries(node.events ?? {}).sort(
    ([left], [right]) => compareText(left, right)
  )) {
    collectTriggerContribution(
      contributions,
      context,
      collectionSymbolOwners,
      nodeId,
      `${base}/events/${escapeJsonPointerSegment(eventName)}`,
      trigger
    );
  }
};
