import {
  createDesignSystemSymbolId,
  createDesignTokenContextSymbolId,
  createDesignTokenModifierScopeId,
  createDesignTokenModifierSymbolId,
  createDesignTokenResolverScopeId,
  createDesignTokenSetSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  createWorkspaceScopeId,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type SemanticSnapshotIdentity,
  type WorkspaceDependencyContribution,
  type WorkspaceReferenceFact,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import type {
  DesignTokenResolverDocument,
  DesignTokenResolverModifier,
  DesignTokenResolverSet,
  DesignTokenResolverSource,
} from './designTokenResolver.types';
import { decodeDtcgDesignTokenResolverDocument } from './dtcgDesignTokenResolverCodec';

export const DESIGN_TOKEN_RESOLVER_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze(
  {
    id: 'core.design-token-resolvers',
    semanticVersion: '1',
  }
);

export type DesignTokenResolverSemanticDocumentReference = Readonly<{
  reference: string;
  workspacePath: string;
  targetDocumentId?: string;
}>;

export type DesignTokenResolverSemanticDocumentInput = Readonly<{
  documentId: string;
  displayName?: string;
  revision: SemanticDocumentRevision;
  content: unknown;
  documentReferences?: readonly DesignTokenResolverSemanticDocumentReference[];
}>;

export type CreateDesignTokenResolverSemanticContributionProviderInput =
  Readonly<{
    workspaceId: string;
    documents: readonly DesignTokenResolverSemanticDocumentInput[];
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

const rootSetDefinitionId = (name: string): string => `set:${name}`;
const rootModifierDefinitionId = (name: string): string => `modifier:${name}`;
const inlineDefinitionId = (
  index: number,
  kind: 'set' | 'modifier',
  name: string
): string => `order:${index}:${kind}:${name}`;

const assertRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  source: DesignTokenResolverSemanticDocumentInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `Design Token Resolver semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

const decodeContent = (
  source: DesignTokenResolverSemanticDocumentInput
): DesignTokenResolverDocument => {
  const decoded = decodeDtcgDesignTokenResolverDocument(source.content);
  if (decoded.ok) return decoded.value;
  throw new Error(
    `Design Token Resolver semantic provider failed to decode document "${source.documentId}": ${decoded.issues
      .slice(0, 5)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ')}`
  );
};

const contributeSourceReferences = (
  contribution: MutableContribution,
  workspaceId: string,
  documentId: string,
  sourceSymbolId: string,
  scopeId: string,
  factIdentity: string,
  sources: readonly DesignTokenResolverSource[],
  rootSetsByName: ReadonlyMap<string, DesignTokenResolverSet>,
  documentReferences: ReadonlyMap<
    string,
    DesignTokenResolverSemanticDocumentReference
  >
): void => {
  sources.forEach((source, index) => {
    if (source.kind !== 'reference') return;
    const target = source.reference.target;
    let targetSymbolId: string | undefined;
    let targetName: string | undefined;
    let targetScopeId: string | undefined;
    if (target.kind === 'set') {
      const set = rootSetsByName.get(target.setName.toLocaleLowerCase('en-US'));
      if (set) {
        targetSymbolId = createDesignTokenSetSymbolId(
          workspaceId,
          documentId,
          rootSetDefinitionId(set.name)
        );
      }
    } else if (target.kind === 'document') {
      const resolved = documentReferences.get(source.reference.raw);
      if (resolved?.targetDocumentId) {
        targetSymbolId = createWorkspaceDocumentSymbolId(
          workspaceId,
          resolved.targetDocumentId
        );
      } else {
        targetName = resolved?.workspacePath ?? target.documentPath;
        targetScopeId = createWorkspaceScopeId(workspaceId);
      }
    } else if (target.kind === 'document-location') {
      targetSymbolId = createWorkspaceDocumentSymbolId(workspaceId, documentId);
    }
    if (!targetSymbolId && !targetName) return;

    const referenceId = createSemanticId(
      'design-token-resolver-source-reference',
      workspaceId,
      documentId,
      factIdentity,
      String(index)
    );
    contribution.references.push({
      id: referenceId,
      kind: 'token-source',
      sourceRef: { kind: 'document', workspaceId, documentId },
      sourceSymbolId,
      scopeId,
      target: targetSymbolId
        ? { kind: 'symbol-id', symbolId: targetSymbolId }
        : {
            kind: 'name',
            name: targetName!,
            symbolKinds: Object.freeze(['workspace-document']),
            targetScopeId: targetScopeId!,
          },
      resolutionMode: 'addressable',
      ...(target.kind === 'document'
        ? {
            expectedTypeRefs: Object.freeze([
              'workspace-document:design-tokens',
            ]),
          }
        : {}),
      requiresDurableTarget: true,
    });
    if (targetSymbolId) {
      contribution.dependencies.push({
        id: createSemanticId(
          'design-token-resolver-source-dependency',
          workspaceId,
          documentId,
          factIdentity,
          String(index)
        ),
        kind: 'token',
        sourceSymbolId,
        targetSymbolId,
      });
    }
  });
};

const contributeSet = (
  contribution: MutableContribution,
  workspaceId: string,
  documentId: string,
  resolverScopeId: string,
  definitionId: string,
  set: DesignTokenResolverSet,
  rootSetsByName: ReadonlyMap<string, DesignTokenResolverSet>,
  documentReferences: ReadonlyMap<
    string,
    DesignTokenResolverSemanticDocumentReference
  >
): string => {
  const symbolId = createDesignTokenSetSymbolId(
    workspaceId,
    documentId,
    definitionId
  );
  contribution.symbols.push({
    id: symbolId,
    stability: 'durable',
    kind: 'token-set',
    name: set.name,
    displayName: set.name,
    qualifiedName: `${documentId}.sets.${set.name}`,
    scopeId: resolverScopeId,
    ownerRef: { kind: 'document', workspaceId, documentId },
    typeRef: 'design-token-set',
    capabilityIds: Object.freeze(['design-token-set', 'dtcg-resolver']),
  });
  contributeSourceReferences(
    contribution,
    workspaceId,
    documentId,
    symbolId,
    resolverScopeId,
    definitionId,
    set.sources,
    rootSetsByName,
    documentReferences
  );
  return symbolId;
};

const contributeModifier = (
  contribution: MutableContribution,
  workspaceId: string,
  documentId: string,
  resolverScopeId: string,
  definitionId: string,
  modifier: DesignTokenResolverModifier,
  rootSetsByName: ReadonlyMap<string, DesignTokenResolverSet>,
  documentReferences: ReadonlyMap<
    string,
    DesignTokenResolverSemanticDocumentReference
  >
): string => {
  const symbolId = createDesignTokenModifierSymbolId(
    workspaceId,
    documentId,
    definitionId
  );
  const modifierScopeId = createDesignTokenModifierScopeId(
    workspaceId,
    documentId,
    definitionId
  );
  const ownerRef = { kind: 'document' as const, workspaceId, documentId };
  contribution.symbols.push({
    id: symbolId,
    stability: 'durable',
    kind: 'token-modifier',
    name: modifier.name,
    displayName: modifier.name,
    qualifiedName: `${documentId}.modifiers.${modifier.name}`,
    scopeId: resolverScopeId,
    ownerRef,
    typeRef: 'design-token-modifier',
    capabilityIds: Object.freeze([
      'design-token-modifier',
      'dtcg-resolver',
      ...(modifier.name.toLocaleLowerCase('en-US') === 'theme'
        ? ['design-token-theme']
        : []),
    ]),
  });
  contribution.scopes.push({
    id: modifierScopeId,
    kind: 'token-modifier',
    ownerRef,
    parentId: resolverScopeId,
  });
  modifier.contexts.forEach((context) => {
    const contextSymbolId = createDesignTokenContextSymbolId(
      workspaceId,
      documentId,
      definitionId,
      context.name
    );
    contribution.symbols.push({
      id: contextSymbolId,
      stability: 'durable',
      kind: 'token-context',
      name: context.name,
      displayName: context.name,
      qualifiedName: `${documentId}.modifiers.${modifier.name}.${context.name}`,
      scopeId: modifierScopeId,
      ownerRef,
      typeRef: 'design-token-context',
      capabilityIds: Object.freeze([
        'design-token-context',
        ...(modifier.defaultContext === context.name
          ? ['design-token-context:default']
          : []),
      ]),
    });
    contribution.dependencies.push({
      id: createSemanticId(
        'design-token-context-dependency',
        workspaceId,
        documentId,
        definitionId,
        context.name
      ),
      kind: 'token',
      sourceSymbolId: contextSymbolId,
      targetSymbolId: symbolId,
    });
    contributeSourceReferences(
      contribution,
      workspaceId,
      documentId,
      contextSymbolId,
      modifierScopeId,
      `${definitionId}:context:${context.name}`,
      context.sources,
      rootSetsByName,
      documentReferences
    );
  });
  return symbolId;
};

const contributeDocument = (
  contribution: MutableContribution,
  workspaceId: string,
  source: DesignTokenResolverSemanticDocumentInput,
  document: DesignTokenResolverDocument
): void => {
  const ownerRef = {
    kind: 'document' as const,
    workspaceId,
    documentId: source.documentId,
  };
  const resolverScopeId = createDesignTokenResolverScopeId(
    workspaceId,
    source.documentId
  );
  const designSystemSymbolId = createDesignSystemSymbolId(
    workspaceId,
    source.documentId
  );
  contribution.scopes.push({
    id: resolverScopeId,
    kind: 'design-system',
    ownerRef,
    parentId: createWorkspaceDocumentScopeId(workspaceId, source.documentId),
  });
  contribution.symbols.push({
    id: designSystemSymbolId,
    stability: 'durable',
    kind: 'design-system',
    name: document.name ?? source.displayName ?? source.documentId,
    displayName: document.name ?? source.displayName ?? source.documentId,
    qualifiedName: source.documentId,
    scopeId: createWorkspaceDocumentScopeId(workspaceId, source.documentId),
    ownerRef,
    typeRef: 'design-system:dtcg-resolver',
    capabilityIds: Object.freeze([
      'design-system',
      'dtcg-resolver',
      'design-token-resolution',
    ]),
  });

  const rootSetsByName = new Map(
    document.sets.map((set) => [set.name.toLocaleLowerCase('en-US'), set])
  );
  const documentReferences = new Map(
    (source.documentReferences ?? []).map((reference) => [
      reference.reference,
      reference,
    ])
  );
  const rootSetSymbolIds = new Map<string, string>();
  document.sets.forEach((set) => {
    const symbolId = contributeSet(
      contribution,
      workspaceId,
      source.documentId,
      resolverScopeId,
      rootSetDefinitionId(set.name),
      set,
      rootSetsByName,
      documentReferences
    );
    rootSetSymbolIds.set(set.name.toLocaleLowerCase('en-US'), symbolId);
  });
  const rootModifierSymbolIds = new Map<string, string>();
  document.modifiers.forEach((modifier) => {
    const symbolId = contributeModifier(
      contribution,
      workspaceId,
      source.documentId,
      resolverScopeId,
      rootModifierDefinitionId(modifier.name),
      modifier,
      rootSetsByName,
      documentReferences
    );
    rootModifierSymbolIds.set(
      modifier.name.toLocaleLowerCase('en-US'),
      symbolId
    );
  });

  document.resolutionOrder.forEach((entry, index) => {
    let targetSymbolId: string | undefined;
    if (entry.declaration === 'inline') {
      const definitionId = inlineDefinitionId(index, entry.kind, entry.name);
      targetSymbolId =
        entry.kind === 'set'
          ? contributeSet(
              contribution,
              workspaceId,
              source.documentId,
              resolverScopeId,
              definitionId,
              entry.definition,
              rootSetsByName,
              documentReferences
            )
          : contributeModifier(
              contribution,
              workspaceId,
              source.documentId,
              resolverScopeId,
              definitionId,
              entry.definition,
              rootSetsByName,
              documentReferences
            );
    } else {
      targetSymbolId =
        entry.kind === 'set'
          ? rootSetSymbolIds.get(entry.name.toLocaleLowerCase('en-US'))
          : rootModifierSymbolIds.get(entry.name.toLocaleLowerCase('en-US'));
    }
    if (!targetSymbolId) return;
    contribution.references.push({
      id: createSemanticId(
        'design-token-resolution-order-reference',
        workspaceId,
        source.documentId,
        String(index)
      ),
      kind: 'token-resolution',
      sourceRef: ownerRef,
      sourceSymbolId: designSystemSymbolId,
      scopeId: resolverScopeId,
      target: { kind: 'symbol-id', symbolId: targetSymbolId },
      resolutionMode: 'addressable',
      requiresDurableTarget: true,
    });
    contribution.dependencies.push({
      id: createSemanticId(
        'design-token-resolution-order-dependency',
        workspaceId,
        source.documentId,
        String(index)
      ),
      kind: 'token',
      sourceSymbolId: designSystemSymbolId,
      targetSymbolId,
    });
  });
};

export const createDesignTokenResolverSemanticContributionProvider = (
  input: CreateDesignTokenResolverSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: DESIGN_TOKEN_RESOLVER_SEMANTIC_PROVIDER_DESCRIPTOR,
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
            `Design Token Resolver semantic provider received duplicate document "${source.documentId}".`
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
