import type {
  PIRDocument,
  PIRNode,
  PIRUiGraph,
  PIRValueBinding,
} from '../pir.types';
import type { PIRExtractionBoundaryAnalyzer } from './pirExtractionBoundary';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const escapePointerToken = (value: string): string =>
  value.replaceAll('~', '~0').replaceAll('/', '~1');

const valueBindingPath = (value: PIRValueBinding): string | undefined =>
  'path' in value ? value.path : undefined;

const valueOccurrence = (
  nodeId: string,
  fieldPath: string,
  value: PIRValueBinding
) => {
  const sourcePath = valueBindingPath(value);
  return {
    nodeId,
    fieldPath,
    ...(sourcePath === undefined ? {} : { sourcePath }),
  };
};

const sortedEntries = <T>(
  value: Readonly<Record<string, T>>
): Array<[string, T]> =>
  Object.entries(value).sort(([left], [right]) => compareText(left, right));

const mapValueBindings = (
  values: Readonly<Record<string, PIRValueBinding>>,
  nodeId: string,
  path: string,
  analyzer: PIRExtractionBoundaryAnalyzer
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    sortedEntries(values).map(([key, value]) => [
      key,
      analyzer.rewriteValueBinding(
        value,
        valueOccurrence(nodeId, `${path}/${escapePointerToken(key)}`, value)
      ),
    ])
  );

const rewriteElementNode = (
  node: Extract<PIRNode, { kind: 'element' }>,
  analyzer: PIRExtractionBoundaryAnalyzer
): PIRNode => ({
  ...node,
  ...(node.text
    ? {
        text: analyzer.rewriteValueBinding(
          node.text,
          valueOccurrence(node.id, '/text', node.text)
        ),
      }
    : {}),
  ...(node.style
    ? {
        style: mapValueBindings(node.style, node.id, '/style', analyzer),
      }
    : {}),
  ...(node.props
    ? {
        props: mapValueBindings(node.props, node.id, '/props', analyzer),
      }
    : {}),
  ...(node.data
    ? {
        data: {
          ...node.data,
          ...(node.data.source
            ? {
                source: analyzer.rewriteValueBinding(
                  node.data.source,
                  valueOccurrence(node.id, '/data/source', node.data.source)
                ),
              }
            : {}),
          ...(node.data.value
            ? {
                value: analyzer.rewriteValueBinding(
                  node.data.value,
                  valueOccurrence(node.id, '/data/value', node.data.value)
                ),
              }
            : {}),
          ...(node.data.mock
            ? {
                mock: analyzer.rewriteValueBinding(
                  node.data.mock,
                  valueOccurrence(node.id, '/data/mock', node.data.mock)
                ),
              }
            : {}),
          ...(node.data.extend
            ? {
                extend: mapValueBindings(
                  node.data.extend,
                  node.id,
                  '/data/extend',
                  analyzer
                ),
              }
            : {}),
        },
      }
    : {}),
  ...(node.events
    ? {
        events: Object.fromEntries(
          sortedEntries(node.events).map(([eventName, trigger]) => {
            const fieldPath = `/events/${escapePointerToken(eventName)}`;
            return [
              eventName,
              analyzer.rewriteTrigger(trigger, {
                nodeId: node.id,
                fieldPath,
              }),
            ];
          })
        ),
      }
    : {}),
});

const rewriteCollectionNode = (
  node: Extract<PIRNode, { kind: 'collection' }>,
  analyzer: PIRExtractionBoundaryAnalyzer
): PIRNode => ({
  ...node,
  source:
    node.source.kind === 'literal'
      ? node.source
      : {
          kind: 'binding',
          value: analyzer.rewriteValueBinding(
            node.source.value,
            valueOccurrence(node.id, '/source/value', node.source.value),
            'collection-source'
          ),
        },
  key:
    node.key.kind === 'index'
      ? node.key
      : {
          kind: 'binding',
          value: analyzer.rewriteValueBinding(
            node.key.value,
            valueOccurrence(node.id, '/key/value', node.key.value),
            'collection-key'
          ),
        },
});

const rewriteComponentInstanceNode = (
  node: Extract<PIRNode, { kind: 'component-instance' }>,
  graph: PIRUiGraph,
  analyzer: PIRExtractionBoundaryAnalyzer
): PIRNode => {
  analyzer.recordComponentReference(
    'component-definition',
    node.componentDocumentId,
    { nodeId: node.id, fieldPath: '/componentDocumentId' }
  );
  const props = Object.fromEntries(
    sortedEntries(node.bindings.props).map(([memberId, value]) => {
      const fieldPath = `/bindings/props/${escapePointerToken(memberId)}`;
      analyzer.recordComponentReference(
        'component-member',
        `${node.componentDocumentId}#prop:${memberId}`,
        { nodeId: node.id, fieldPath }
      );
      return [
        memberId,
        analyzer.rewriteValueBinding(
          value,
          valueOccurrence(node.id, fieldPath, value)
        ),
      ];
    })
  );
  const events = Object.fromEntries(
    sortedEntries(node.bindings.events).map(([memberId, trigger]) => {
      const fieldPath = `/bindings/events/${escapePointerToken(memberId)}`;
      analyzer.recordComponentReference(
        'component-member',
        `${node.componentDocumentId}#event:${memberId}`,
        { nodeId: node.id, fieldPath }
      );
      return [
        memberId,
        analyzer.rewriteTrigger(trigger, { nodeId: node.id, fieldPath }),
      ];
    })
  );
  for (const memberId of Object.keys(node.bindings.variants).sort(
    compareText
  )) {
    analyzer.recordComponentReference(
      'component-member',
      `${node.componentDocumentId}#variant:${memberId}`,
      {
        nodeId: node.id,
        fieldPath: `/bindings/variants/${escapePointerToken(memberId)}`,
      }
    );
  }
  for (const memberId of Object.keys(graph.regionsById?.[node.id] ?? {}).sort(
    compareText
  )) {
    analyzer.recordComponentReference(
      'component-slot',
      `${node.componentDocumentId}#slot:${memberId}`,
      {
        nodeId: node.id,
        fieldPath: `/regions/${escapePointerToken(memberId)}`,
      }
    );
  }
  return {
    ...node,
    bindings: { props, events, variants: node.bindings.variants },
  };
};

const rewriteNode = (
  node: PIRNode,
  graph: PIRUiGraph,
  analyzer: PIRExtractionBoundaryAnalyzer
): PIRNode => {
  switch (node.kind) {
    case 'element':
      return rewriteElementNode(node, analyzer);
    case 'collection':
      return rewriteCollectionNode(node, analyzer);
    case 'component-instance':
      return rewriteComponentInstanceNode(node, graph, analyzer);
    case 'component-slot-outlet':
      analyzer.recordSlotOutlet(node.slotMemberId, {
        nodeId: node.id,
        fieldPath: '/slotMemberId',
      });
      return {
        ...node,
        bindings: {
          props: mapValueBindings(
            node.bindings.props,
            node.id,
            '/bindings/props',
            analyzer
          ),
        },
      };
  }
};

export const rewritePirExtractionSubtreeGraph = (
  graph: PIRUiGraph,
  subtreeRootId: string,
  subtreeNodeIds: readonly string[],
  analyzer: PIRExtractionBoundaryAnalyzer
): PIRUiGraph => {
  const nodesById = Object.fromEntries(
    subtreeNodeIds.map((nodeId) => [
      nodeId,
      rewriteNode(graph.nodesById[nodeId]!, graph, analyzer),
    ])
  );
  const childIdsById = Object.fromEntries(
    subtreeNodeIds.map((nodeId) => [
      nodeId,
      Object.freeze([...(graph.childIdsById[nodeId] ?? [])]),
    ])
  );
  const regionsById = Object.fromEntries(
    subtreeNodeIds.flatMap((nodeId) => {
      const regions = graph.regionsById?.[nodeId];
      return regions
        ? [
            [
              nodeId,
              Object.fromEntries(
                sortedEntries(regions).map(([regionName, childIds]) => [
                  regionName,
                  Object.freeze([...childIds]),
                ])
              ),
            ] as const,
          ]
        : [];
    })
  );
  return {
    rootId: subtreeRootId,
    nodesById,
    childIdsById,
    ...(Object.keys(regionsById).length > 0 ? { regionsById } : {}),
    ...(graph.order ? { order: graph.order } : {}),
  };
};

const visitNodeValueBindings = (
  node: PIRNode,
  visitor: (value: PIRValueBinding, nodeId: string, fieldPath: string) => void
): void => {
  if (node.kind === 'element') {
    if (node.text) visitor(node.text, node.id, '/text');
    for (const [key, value] of sortedEntries(node.style ?? {})) {
      visitor(value, node.id, `/style/${escapePointerToken(key)}`);
    }
    for (const [key, value] of sortedEntries(node.props ?? {})) {
      visitor(value, node.id, `/props/${escapePointerToken(key)}`);
    }
    for (const [fieldPath, value] of [
      ['/data/source', node.data?.source],
      ['/data/value', node.data?.value],
      ['/data/mock', node.data?.mock],
    ] as const) {
      if (value) visitor(value, node.id, fieldPath);
    }
    for (const [key, value] of sortedEntries(node.data?.extend ?? {})) {
      visitor(value, node.id, `/data/extend/${escapePointerToken(key)}`);
    }
    for (const [eventName, trigger] of sortedEntries(node.events ?? {})) {
      if (trigger.kind === 'emit-component-event' && trigger.payload) {
        visitor(
          trigger.payload,
          node.id,
          `/events/${escapePointerToken(eventName)}/payload`
        );
      }
    }
    return;
  }
  if (node.kind === 'collection') {
    if (node.source.kind === 'binding') {
      visitor(node.source.value, node.id, '/source/value');
    }
    if (node.key.kind === 'binding') {
      visitor(node.key.value, node.id, '/key/value');
    }
    return;
  }
  if (node.kind === 'component-instance') {
    for (const [memberId, value] of sortedEntries(node.bindings.props)) {
      visitor(
        value,
        node.id,
        `/bindings/props/${escapePointerToken(memberId)}`
      );
    }
    for (const [memberId, trigger] of sortedEntries(node.bindings.events)) {
      if (trigger.kind === 'emit-component-event' && trigger.payload) {
        visitor(
          trigger.payload,
          node.id,
          `/bindings/events/${escapePointerToken(memberId)}/payload`
        );
      }
    }
    return;
  }
  if (node.kind === 'component-slot-outlet') {
    for (const [memberId, value] of sortedEntries(node.bindings.props)) {
      visitor(
        value,
        node.id,
        `/bindings/props/${escapePointerToken(memberId)}`
      );
    }
  }
};

export const inspectPirExternalInboundBindings = (
  document: PIRDocument,
  subtreeNodeIds: ReadonlySet<string>,
  analyzer: PIRExtractionBoundaryAnalyzer
): void => {
  for (const nodeId of Object.keys(document.ui.graph.nodesById).sort(
    compareText
  )) {
    if (subtreeNodeIds.has(nodeId)) continue;
    visitNodeValueBindings(
      document.ui.graph.nodesById[nodeId]!,
      (value, ownerNodeId, fieldPath) =>
        analyzer.inspectExternalValueBinding(
          value,
          valueOccurrence(ownerNodeId, fieldPath, value)
        )
    );
  }
};
