import {
  createNodeGraphNodeScopeId,
  createNodeGraphNodeSymbolId,
  createNodeGraphPortSymbolId,
  createNodeGraphScopeId,
  createNodeGraphSymbolId,
  createCodeReferenceSemanticTarget,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import { decodeNodeGraphDocument } from '../nodeGraphCodec';
import type { NodeGraphDocument, NodeGraphNode } from '../nodeGraph.types';
import { createNodeGraphExecutorCodeReferenceId } from './nodeGraphCodeSlotProvider';

export const NODEGRAPH_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.nodegraph',
  semanticVersion: '3',
});

export type NodeGraphSemanticDocumentInput = Readonly<{
  documentId: string;
  displayName?: string;
  revision: SemanticDocumentRevision;
  content: unknown;
}>;

export type CreateNodeGraphSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  documents: readonly NodeGraphSemanticDocumentInput[];
}>;

type MutableContribution = {
  scopes: WorkspaceScopeContribution[];
  symbols: WorkspaceSymbolContribution[];
  references: WorkspaceReferenceFact[];
  dependencies: WorkspaceDependencyContribution[];
};

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const freezeFacts = <Fact extends { id: string }>(
  facts: Fact[]
): readonly Fact[] =>
  Object.freeze(
    facts
      .sort((left, right) => compareText(left.id, right.id))
      .map((fact) => Object.freeze(fact))
  );

const getNodeDisplayName = (node: NodeGraphNode): string => {
  const label =
    typeof node.data.label === 'string' ? node.data.label.trim() : '';
  const kind = typeof node.data.kind === 'string' ? node.data.kind.trim() : '';
  return label || kind || node.type || node.id;
};

const assertRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  source: NodeGraphSemanticDocumentInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `NodeGraph semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

const decodeContent = (
  source: NodeGraphSemanticDocumentInput
): NodeGraphDocument => {
  const decoded = decodeNodeGraphDocument(source.content);
  if (decoded.ok) return decoded.value;
  const summary = decoded.issues
    .slice(0, 5)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ');
  throw new Error(
    `NodeGraph semantic provider failed to decode document "${source.documentId}": ${summary}`
  );
};

const contributeDocument = (
  contribution: MutableContribution,
  workspaceId: string,
  source: NodeGraphSemanticDocumentInput,
  graph: NodeGraphDocument
): void => {
  const documentId = source.documentId;
  const documentScopeId = createWorkspaceDocumentScopeId(
    workspaceId,
    documentId
  );
  const graphScopeId = createNodeGraphScopeId(workspaceId, documentId);
  const graphSymbolId = createNodeGraphSymbolId(workspaceId, documentId);
  const documentOwnerRef = {
    kind: 'document' as const,
    workspaceId,
    documentId,
  };
  contribution.scopes.push({
    id: graphScopeId,
    kind: 'nodegraph',
    ownerRef: documentOwnerRef,
    parentId: documentScopeId,
  });
  contribution.symbols.push({
    id: graphSymbolId,
    stability: 'durable',
    kind: 'nodegraph',
    name: documentId,
    displayName: source.displayName?.trim() || documentId,
    qualifiedName: documentId,
    scopeId: documentScopeId,
    ownerRef: documentOwnerRef,
    typeRef: 'nodegraph:graph',
  });
  contribution.dependencies.push({
    id: createSemanticId(
      'nodegraph-document-dependency',
      workspaceId,
      documentId
    ),
    kind: 'nodegraph',
    sourceSymbolId: graphSymbolId,
    targetSymbolId: createWorkspaceDocumentSymbolId(workspaceId, documentId),
  });

  [...graph.nodes]
    .sort((left, right) => compareText(left.id, right.id))
    .forEach((node) => {
      const nodeScopeId = createNodeGraphNodeScopeId(
        workspaceId,
        documentId,
        node.id
      );
      const nodeSymbolId = createNodeGraphNodeSymbolId(
        workspaceId,
        documentId,
        node.id
      );
      const ownerRef = {
        kind: 'nodegraph-node' as const,
        documentId,
        nodeId: node.id,
      };
      contribution.scopes.push({
        id: nodeScopeId,
        kind: 'nodegraph-node',
        ownerRef,
        parentId: graphScopeId,
      });
      contribution.symbols.push({
        id: nodeSymbolId,
        stability: 'durable',
        kind: 'nodegraph-node',
        name: node.id,
        displayName: getNodeDisplayName(node),
        qualifiedName: `${documentId}.${node.id}`,
        scopeId: graphScopeId,
        ownerRef,
        typeRef: 'nodegraph:node',
      });
      contribution.dependencies.push({
        id: createSemanticId(
          'nodegraph-node-dependency',
          workspaceId,
          documentId,
          node.id
        ),
        kind: 'nodegraph',
        sourceSymbolId: nodeSymbolId,
        targetSymbolId: graphSymbolId,
      });

      [...(node.ports ?? [])]
        .sort((left, right) => compareText(left.id, right.id))
        .forEach((port) => {
          const portSymbolId = createNodeGraphPortSymbolId(
            workspaceId,
            documentId,
            node.id,
            port.id
          );
          const portOwnerRef = {
            kind: 'nodegraph-port' as const,
            documentId,
            nodeId: node.id,
            portId: port.id,
          };
          contribution.symbols.push({
            id: portSymbolId,
            stability: 'durable',
            kind: 'nodegraph-port',
            name: port.id,
            displayName: port.id,
            qualifiedName: `${documentId}.${node.id}.${port.id}`,
            scopeId: nodeScopeId,
            ownerRef: portOwnerRef,
            typeRef: port.typeRef ?? `nodegraph:${port.kind}`,
            capabilityIds: [
              `nodegraph-port:${port.direction}`,
              `nodegraph-port:${port.kind}`,
            ],
          });
          contribution.dependencies.push({
            id: createSemanticId(
              'nodegraph-port-dependency',
              workspaceId,
              documentId,
              node.id,
              port.id
            ),
            kind: 'nodegraph',
            sourceSymbolId: portSymbolId,
            targetSymbolId: nodeSymbolId,
          });
        });

      if (node.executor) {
        contribution.references.push({
          id: createNodeGraphExecutorCodeReferenceId(
            workspaceId,
            documentId,
            node.id
          ),
          kind: 'code-reference',
          sourceRef: ownerRef,
          sourceSymbolId: nodeSymbolId,
          scopeId: nodeScopeId,
          target: createCodeReferenceSemanticTarget(
            workspaceId,
            node.executor.reference
          ),
          resolutionMode: 'addressable',
          requiresDurableTarget: true,
        });
      }
    });

  [...graph.edges]
    .sort((left, right) => compareText(left.id, right.id))
    .forEach((edge) => {
      const sourceNode = graph.nodes.find((node) => node.id === edge.source);
      const targetNode = graph.nodes.find((node) => node.id === edge.target);
      const sourcePort = sourceNode?.ports?.find(
        (port) => port.id === edge.sourceHandle
      );
      const targetPort = targetNode?.ports?.find(
        (port) => port.id === edge.targetHandle
      );
      const sourceRef = sourcePort
        ? ({
            kind: 'nodegraph-port' as const,
            documentId,
            nodeId: edge.source,
            portId: sourcePort.id,
          } as const)
        : ({
            kind: 'nodegraph-node' as const,
            documentId,
            nodeId: edge.source,
          } as const);
      contribution.references.push({
        id: createSemanticId(
          'nodegraph-edge-reference',
          workspaceId,
          documentId,
          edge.id
        ),
        kind: 'nodegraph-port',
        sourceRef,
        sourceSymbolId: sourcePort
          ? createNodeGraphPortSymbolId(
              workspaceId,
              documentId,
              edge.source,
              sourcePort.id
            )
          : createNodeGraphNodeSymbolId(workspaceId, documentId, edge.source),
        scopeId: createNodeGraphNodeScopeId(
          workspaceId,
          documentId,
          edge.source
        ),
        target: {
          kind: 'symbol-id',
          symbolId: targetPort
            ? createNodeGraphPortSymbolId(
                workspaceId,
                documentId,
                edge.target,
                targetPort.id
              )
            : createNodeGraphNodeSymbolId(workspaceId, documentId, edge.target),
        },
        resolutionMode: 'addressable',
        requiresDurableTarget: true,
      });
    });
};

export const createNodeGraphSemanticContributionProvider = (
  input: CreateNodeGraphSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: NODEGRAPH_SEMANTIC_PROVIDER_DESCRIPTOR,
  contribute(identity) {
    const contribution: MutableContribution = {
      scopes: [],
      symbols: [],
      references: [],
      dependencies: [],
    };
    const documentIds = new Set<string>();
    [...input.documents]
      .sort((left, right) => compareText(left.documentId, right.documentId))
      .forEach((source) => {
        if (documentIds.has(source.documentId)) {
          throw new Error(
            `NodeGraph semantic provider received duplicate document "${source.documentId}".`
          );
        }
        documentIds.add(source.documentId);
        assertRevision(identity, input.workspaceId, source);
        contributeDocument(
          contribution,
          input.workspaceId,
          source,
          decodeContent(source)
        );
      });
    return Object.freeze({
      scopes: freezeFacts(contribution.scopes),
      symbols: freezeFacts(contribution.symbols),
      references: freezeFacts(contribution.references),
      dependencies: freezeFacts(contribution.dependencies),
    });
  },
});
