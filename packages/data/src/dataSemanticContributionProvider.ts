import {
  createDataOperationSymbolId,
  createDataSchemaSymbolId,
  createDataSourceScopeId,
  createDataSourceSymbolId,
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
import {
  normalizeDataSourceDocument,
  validateDataSourceDocument,
} from './dataDocument';
import type { DataSourceDocument } from './data.types';

export const DATA_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.data',
  semanticVersion: '2',
});

export type DataSemanticDocumentInput = Readonly<{
  documentId: string;
  displayName?: string;
  revision: SemanticDocumentRevision;
  content: unknown;
}>;

export type CreateDataSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  documents: readonly DataSemanticDocumentInput[];
}>;

export {
  createDataOperationSymbolId,
  createDataSchemaSymbolId,
  createDataSourceScopeId,
  createDataSourceSymbolId,
} from '@prodivix/authoring';

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

const assertRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  source: DataSemanticDocumentInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `Data semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

const decodeContent = (
  source: DataSemanticDocumentInput
): DataSourceDocument => {
  const validation = validateDataSourceDocument(source.content, {
    documentId: source.documentId,
  });
  if (!validation.valid) {
    const summary = validation.issues
      .slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Data semantic provider rejected document "${source.documentId}": ${summary}`
    );
  }
  return normalizeDataSourceDocument(source.content as DataSourceDocument, {
    documentId: source.documentId,
  });
};

const contributeDocument = (
  contribution: MutableContribution,
  workspaceId: string,
  source: DataSemanticDocumentInput,
  document: DataSourceDocument
): void => {
  const documentScopeId = createWorkspaceDocumentScopeId(
    workspaceId,
    source.documentId
  );
  const sourceScopeId = createDataSourceScopeId(workspaceId, source.documentId);
  const sourceSymbolId = createDataSourceSymbolId(
    workspaceId,
    source.documentId
  );
  const sourceOwnerRef = {
    kind: 'data-source' as const,
    documentId: source.documentId,
  };
  contribution.scopes.push({
    id: sourceScopeId,
    kind: 'data-source',
    ownerRef: sourceOwnerRef,
    parentId: documentScopeId,
  });
  contribution.symbols.push({
    id: sourceSymbolId,
    stability: 'durable',
    kind: 'data-source',
    name: document.source.id,
    displayName:
      document.source.name?.trim() ||
      source.displayName?.trim() ||
      document.source.id,
    qualifiedName: source.documentId,
    scopeId: documentScopeId,
    ownerRef: sourceOwnerRef,
    typeRef: `data-source:${document.source.adapterId}`,
    capabilityIds: Object.freeze([
      'data-source',
      `data-adapter:${document.source.adapterId}`,
      `runtime-zone:${document.source.runtimeZone}`,
    ]),
  });
  contribution.dependencies.push({
    id: createSemanticId(
      'data-source-document-dependency',
      workspaceId,
      source.documentId
    ),
    kind: 'document',
    sourceSymbolId,
    targetSymbolId: createWorkspaceDocumentSymbolId(
      workspaceId,
      source.documentId
    ),
  });

  for (const schema of Object.values(document.schemasById)) {
    const symbolId = createDataSchemaSymbolId(
      workspaceId,
      source.documentId,
      schema.id
    );
    contribution.symbols.push({
      id: symbolId,
      stability: 'durable',
      kind: 'data-schema',
      name: schema.id,
      displayName: schema.name?.trim() || schema.id,
      qualifiedName: `${source.documentId}.${schema.id}`,
      scopeId: sourceScopeId,
      ownerRef: sourceOwnerRef,
      typeRef: 'json-schema:2020-12',
      capabilityIds: Object.freeze(['data-schema']),
    });
    contribution.dependencies.push({
      id: createSemanticId(
        'data-schema-dependency',
        workspaceId,
        source.documentId,
        schema.id
      ),
      kind: 'data-schema',
      sourceSymbolId: symbolId,
      targetSymbolId: sourceSymbolId,
    });
  }

  for (const operation of Object.values(document.operationsById)) {
    const symbolId = createDataOperationSymbolId(
      workspaceId,
      source.documentId,
      operation.id
    );
    const ownerRef = {
      kind: 'data-operation' as const,
      documentId: source.documentId,
      operationId: operation.id,
    };
    contribution.symbols.push({
      id: symbolId,
      stability: 'durable',
      kind: 'data-operation',
      name: operation.id,
      displayName: operation.name?.trim() || operation.id,
      qualifiedName: `${source.documentId}.${operation.id}`,
      scopeId: sourceScopeId,
      ownerRef,
      typeRef: `data-operation:${operation.kind}`,
      capabilityIds: Object.freeze([
        'behavior:data:dispatch',
        'behavior:data:lifecycle',
        'data-operation',
        `data-operation:${operation.kind}`,
      ]),
    });
    contribution.dependencies.push({
      id: createSemanticId(
        'data-operation-dependency',
        workspaceId,
        source.documentId,
        operation.id
      ),
      kind: 'data-operation',
      sourceSymbolId: symbolId,
      targetSymbolId: sourceSymbolId,
    });
    const schemaReferences = [
      ...(operation.inputSchemaId
        ? [{ role: 'input', schemaId: operation.inputSchemaId }]
        : []),
      { role: 'output', schemaId: operation.outputSchemaId },
    ];
    for (const reference of schemaReferences) {
      contribution.references.push({
        id: createSemanticId(
          'data-operation-schema-reference',
          workspaceId,
          source.documentId,
          operation.id,
          reference.role
        ),
        kind: 'data-schema',
        sourceRef: ownerRef,
        sourceSymbolId: symbolId,
        scopeId: sourceScopeId,
        target: {
          kind: 'symbol-id',
          symbolId: createDataSchemaSymbolId(
            workspaceId,
            source.documentId,
            reference.schemaId
          ),
        },
        resolutionMode: 'addressable',
        expectedTypeRefs: Object.freeze(['json-schema:2020-12']),
        requiresDurableTarget: true,
      });
    }
    const optimistic = operation.policies.optimistic;
    if (optimistic) {
      contribution.references.push({
        id: createSemanticId(
          'data-operation-optimistic-target-reference',
          workspaceId,
          source.documentId,
          operation.id
        ),
        kind: 'data-operation',
        sourceRef: ownerRef,
        sourceSymbolId: symbolId,
        scopeId: sourceScopeId,
        target: {
          kind: 'symbol-id',
          symbolId: createDataOperationSymbolId(
            workspaceId,
            optimistic.target.documentId,
            optimistic.target.operationId
          ),
        },
        resolutionMode: 'addressable',
        expectedTypeRefs: Object.freeze(['data-operation:query']),
        requiresDurableTarget: true,
      });
    }
  }
};

export const createDataSemanticContributionProvider = (
  input: CreateDataSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: DATA_SEMANTIC_PROVIDER_DESCRIPTOR,
  contribute(identity) {
    const contribution: MutableContribution = {
      scopes: [],
      symbols: [],
      references: [],
      dependencies: [],
    };
    const documentIds = new Set<string>();
    for (const source of [...input.documents].sort((left, right) =>
      compareText(left.documentId, right.documentId)
    )) {
      if (documentIds.has(source.documentId)) {
        throw new Error(
          `Data semantic provider received duplicate document "${source.documentId}".`
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
    }
    return Object.freeze({
      scopes: freezeFacts(contribution.scopes),
      symbols: freezeFacts(contribution.symbols),
      references: freezeFacts(contribution.references),
      dependencies: freezeFacts(contribution.dependencies),
    });
  },
});
