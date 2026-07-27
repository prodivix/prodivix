import { createWorkspaceDocumentSymbolId } from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createDataOperationSymbolId,
  createDataSchemaSymbolId,
  createDataSemanticContributionProvider,
  createDataSourceSymbolId,
  JSON_SCHEMA_2020_12_URI,
  type DataSourceDocument,
} from './index';

const identifierArbitrary = fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/);

const createCurrentDocument = (sourceId: string): DataSourceDocument => ({
  source: {
    id: sourceId,
    adapterId: 'core.mock',
    runtimeZone: 'test',
    bindingsById: {},
    configurationByKey: {},
  },
  schemasById: {
    result: {
      id: 'result',
      schema: { $schema: JSON_SCHEMA_2020_12_URI, type: 'object' },
    },
  },
  operationsById: {
    read: {
      id: 'read',
      kind: 'query',
      outputSchemaId: 'result',
      configurationByKey: {},
      policies: {},
    },
  },
});

describe('Data semantic contribution provider properties', () => {
  it('contributes current content directly without a wire-version compatibility path', () => {
    fc.assert(
      fc.property(
        identifierArbitrary,
        identifierArbitrary,
        (documentId, sourceId) => {
          const workspaceId = 'workspace-1';
          const revision = Object.freeze({ contentRev: 3, metaRev: 2 });
          const contribution = createDataSemanticContributionProvider({
            workspaceId,
            documents: [
              {
                documentId,
                revision,
                content: createCurrentDocument(sourceId),
              },
            ],
          }).contribute({
            workspaceRevisions: {
              workspaceId,
              workspaceRev: 5,
              routeRev: 1,
              opSeq: 8,
              documentRevs: { [documentId]: revision },
            },
            schemaVersion: 'prodivix-semantic-v4',
            providerSetDigest: 'provider-set',
          });

          expect(contribution.symbols?.map((symbol) => symbol.id)).toEqual(
            expect.arrayContaining([
              createDataSourceSymbolId(workspaceId, documentId),
              createDataSchemaSymbolId(workspaceId, documentId, 'result'),
              createDataOperationSymbolId(workspaceId, documentId, 'read'),
            ])
          );
          expect(contribution.dependencies).toContainEqual(
            expect.objectContaining({
              kind: 'document',
              sourceSymbolId: createDataSourceSymbolId(workspaceId, documentId),
              targetSymbolId: createWorkspaceDocumentSymbolId(
                workspaceId,
                documentId
              ),
            })
          );
        }
      ),
      { numRuns: 20 }
    );
  });
});
