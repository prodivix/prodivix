import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createNodeGraphNodeScopeId,
  createNodeGraphNodeSymbolId,
  createNodeGraphPortSymbolId,
  createNodeGraphSymbolId,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { encodeNodeGraphDocument } from '../nodeGraphCodec';
import { controlPort, edge, node } from '../__tests__/nodeGraphTestFixtures';
import { createNodeGraphSemanticContributionProvider } from './nodeGraphSemanticContributionProvider';

const propertyParameters = Object.freeze({
  numRuns: 50,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
const ignoredCodeMarker = 'NODEGRAPH_CODE_MUST_NOT_BE_INDEXED';

const createIdentity = (
  workspaceId: string,
  revisions: Readonly<Record<string, SemanticDocumentRevision>>
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 1,
    routeRev: 1,
    opSeq: 1,
    documentRevs: revisions,
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'nodegraph-property',
});

const createGraph = (nodeIds: readonly string[], reverse: boolean) => {
  const nodes = nodeIds.map((nodeId, index) => ({
    ...node(
      nodeId,
      index === 0 ? 'start' : 'process',
      [
        ...(index > 0 ? [controlPort('in.control.prev', 'input', true)] : []),
        ...(index < nodeIds.length - 1
          ? [controlPort('out.control.next', 'output')]
          : []),
      ],
      { ignoredCode: ignoredCodeMarker }
    ),
    editor: { label: `Node ${nodeId}` },
  }));
  const edges = nodeIds
    .slice(1)
    .map((target, index) =>
      edge(
        `edge-${index}`,
        nodeIds[index]!,
        'out.control.next',
        target,
        'in.control.prev'
      )
    );
  return encodeNodeGraphDocument({
    nodes: reverse ? [...nodes].reverse() : nodes,
    edges: reverse ? [...edges].reverse() : edges,
  });
};

describe('createNodeGraphSemanticContributionProvider properties', () => {
  it('is order-independent and uses the Workspace document as the graph identity', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.uniqueArray(identifier, { minLength: 2, maxLength: 3 }),
        fc.uniqueArray(identifier, { minLength: 2, maxLength: 6 }),
        (workspaceId, documentIds, nodeIds) => {
          const revisions = Object.fromEntries(
            documentIds.map((documentId, index) => [
              documentId,
              { contentRev: index + 1, metaRev: index + 2 },
            ])
          );
          const identity = createIdentity(workspaceId, revisions);
          const createContribution = (reverse: boolean) =>
            createNodeGraphSemanticContributionProvider({
              workspaceId,
              documents: (reverse
                ? [...documentIds].reverse()
                : documentIds
              ).map((documentId) => ({
                documentId,
                revision: revisions[documentId]!,
                content: createGraph(nodeIds, reverse),
              })),
            }).contribute(identity);

          const contribution = createContribution(false);
          expect(createContribution(true)).toEqual(contribution);

          for (const documentId of documentIds) {
            expect(contribution.symbols).toContainEqual(
              expect.objectContaining({
                id: createNodeGraphSymbolId(workspaceId, documentId),
                stability: 'durable',
                kind: 'nodegraph',
              })
            );
            for (const nodeId of nodeIds) {
              expect(contribution.symbols).toContainEqual(
                expect.objectContaining({
                  id: createNodeGraphNodeSymbolId(
                    workspaceId,
                    documentId,
                    nodeId
                  ),
                  kind: 'nodegraph-node',
                })
              );
            }
          }

          const firstDocumentId = documentIds[0]!;
          const [sourceNodeId, targetNodeId] = nodeIds;
          expect(contribution.references).toContainEqual(
            expect.objectContaining({
              kind: 'nodegraph-port',
              sourceSymbolId: createNodeGraphPortSymbolId(
                workspaceId,
                firstDocumentId,
                sourceNodeId!,
                'out.control.next'
              ),
              scopeId: createNodeGraphNodeScopeId(
                workspaceId,
                firstDocumentId,
                sourceNodeId!
              ),
              target: {
                kind: 'symbol-id',
                symbolId: createNodeGraphPortSymbolId(
                  workspaceId,
                  firstDocumentId,
                  targetNodeId!,
                  'in.control.prev'
                ),
              },
            })
          );
          expect(JSON.stringify(contribution)).not.toContain(ignoredCodeMarker);
        }
      ),
      propertyParameters
    );
  });

  it('rejects mismatched revisions and invalid standalone content', () => {
    fc.assert(
      fc.property(identifier, identifier, (workspaceId, documentId) => {
        const revision = { contentRev: 1, metaRev: 1 };
        const validProvider = createNodeGraphSemanticContributionProvider({
          workspaceId,
          documents: [
            {
              documentId,
              revision,
              content: encodeNodeGraphDocument({ nodes: [], edges: [] }),
            },
          ],
        });
        expect(() =>
          validProvider.contribute(
            createIdentity(workspaceId, {
              [documentId]: { contentRev: 2, metaRev: 1 },
            })
          )
        ).toThrow(`snapshot mismatch for document "${documentId}"`);

        const invalidProvider = createNodeGraphSemanticContributionProvider({
          workspaceId,
          documents: [
            {
              documentId,
              revision,
              content: { nodes: 'invalid', edges: [] },
            },
          ],
        });
        expect(() =>
          invalidProvider.contribute(
            createIdentity(workspaceId, { [documentId]: revision })
          )
        ).toThrow(`failed to decode document "${documentId}": /version`);
      }),
      propertyParameters
    );
  });
});
