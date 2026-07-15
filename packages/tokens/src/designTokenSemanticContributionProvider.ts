import {
  createDesignTokenDocumentScopeId,
  createDesignTokenGroupScopeId,
  createDesignTokenGroupSymbolId,
  createDesignTokenSymbolId,
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
  formatDesignTokenPath,
  type DesignToken,
  type DesignTokenDocument,
  type DesignTokenGroup,
  type DesignTokenReferenceTarget,
} from './designToken.types';
import { decodeDtcgDesignTokenDocument } from './dtcgDesignTokenCodec';

export const DESIGN_TOKEN_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.design-tokens',
  semanticVersion: '1',
});

export type DesignTokenSemanticDocumentInput = Readonly<{
  documentId: string;
  displayName?: string;
  revision: SemanticDocumentRevision;
  content: unknown;
}>;

export type CreateDesignTokenSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  documents: readonly DesignTokenSemanticDocumentInput[];
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

const assertRevision = (
  identity: SemanticSnapshotIdentity,
  workspaceId: string,
  source: DesignTokenSemanticDocumentInput
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `Design Token semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

const decodeContent = (
  source: DesignTokenSemanticDocumentInput
): DesignTokenDocument => {
  const decoded = decodeDtcgDesignTokenDocument(source.content);
  if (decoded.ok) return decoded.value;
  const summary = decoded.issues
    .slice(0, 5)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join('; ');
  throw new Error(
    `Design Token semantic provider failed to decode document "${source.documentId}": ${summary}`
  );
};

const createGroupScopeId = (
  workspaceId: string,
  documentId: string,
  groupPath: readonly string[]
): string =>
  groupPath.length === 0
    ? createDesignTokenDocumentScopeId(workspaceId, documentId)
    : createDesignTokenGroupScopeId(
        workspaceId,
        documentId,
        formatDesignTokenPath(groupPath)
      );

const createGroupTargetSymbolId = (
  workspaceId: string,
  documentId: string,
  groupPath: readonly string[]
): string =>
  groupPath.length === 0
    ? createWorkspaceDocumentSymbolId(workspaceId, documentId)
    : createDesignTokenGroupSymbolId(
        workspaceId,
        documentId,
        formatDesignTokenPath(groupPath)
      );

const createReferenceTargetSymbolId = (
  workspaceId: string,
  documentId: string,
  target: DesignTokenReferenceTarget
): string => {
  if (target.kind === 'token') {
    return createDesignTokenSymbolId(
      workspaceId,
      documentId,
      formatDesignTokenPath(target.tokenPath)
    );
  }
  if (target.kind === 'group') {
    return createGroupTargetSymbolId(workspaceId, documentId, target.groupPath);
  }
  return createWorkspaceDocumentSymbolId(workspaceId, documentId);
};

const createGroupOwnerRef = (documentId: string, group: DesignTokenGroup) =>
  group.path.length === 0
    ? { kind: 'document' as const, documentId }
    : {
        kind: 'theme-token' as const,
        themeId: documentId,
        tokenPath: formatDesignTokenPath(group.path),
      };

const contributeGroup = (
  contribution: MutableContribution,
  workspaceId: string,
  documentId: string,
  group: DesignTokenGroup
): void => {
  const groupPath = formatDesignTokenPath(group.path);
  const scopeId = createGroupScopeId(workspaceId, documentId, group.path);
  const parentScopeId =
    group.path.length === 0
      ? createWorkspaceDocumentScopeId(workspaceId, documentId)
      : createGroupScopeId(workspaceId, documentId, group.parentPath ?? []);
  const ownerRef = createGroupOwnerRef(documentId, group);
  contribution.scopes.push({
    id: scopeId,
    kind: 'token-group',
    ownerRef,
    parentId: parentScopeId,
  });
  if (group.path.length === 0) return;

  const symbolId = createDesignTokenGroupSymbolId(
    workspaceId,
    documentId,
    groupPath
  );
  contribution.symbols.push({
    id: symbolId,
    stability: 'durable',
    kind: 'token-group',
    name: group.name!,
    displayName: group.name!,
    qualifiedName: `${documentId}.${groupPath}`,
    scopeId: parentScopeId,
    ownerRef,
    typeRef: group.typeRef
      ? `design-token-group:${group.typeRef}`
      : 'design-token-group',
    capabilityIds: Object.freeze([
      'design-token-group',
      ...(group.deprecated ? ['design-token:deprecated'] : []),
    ]),
  });
  contribution.dependencies.push({
    id: createSemanticId(
      'design-token-group-dependency',
      workspaceId,
      documentId,
      groupPath
    ),
    kind: 'token',
    sourceSymbolId: symbolId,
    targetSymbolId: createGroupTargetSymbolId(
      workspaceId,
      documentId,
      group.parentPath ?? []
    ),
  });
  if (group.extends?.target.kind === 'group') {
    contribution.references.push({
      id: createSemanticId(
        'design-token-group-extension-reference',
        workspaceId,
        documentId,
        groupPath
      ),
      kind: 'token-reference',
      sourceRef: ownerRef,
      sourceSymbolId: symbolId,
      scopeId,
      target: {
        kind: 'symbol-id',
        symbolId: createGroupTargetSymbolId(
          workspaceId,
          documentId,
          group.extends.target.groupPath
        ),
      },
      resolutionMode: 'addressable',
      requiresDurableTarget: true,
    });
  }
};

const contributeToken = (
  contribution: MutableContribution,
  workspaceId: string,
  documentId: string,
  token: DesignToken
): void => {
  const tokenPath = formatDesignTokenPath(token.path);
  const scopeId = createGroupScopeId(workspaceId, documentId, token.groupPath);
  const symbolId = createDesignTokenSymbolId(
    workspaceId,
    documentId,
    tokenPath
  );
  const ownerRef = {
    kind: 'theme-token' as const,
    themeId: documentId,
    tokenPath,
  };
  contribution.symbols.push({
    id: symbolId,
    stability: 'durable',
    kind: 'token',
    name: token.name,
    displayName: token.name === '$root' ? tokenPath : token.name,
    qualifiedName: `${documentId}.${tokenPath}`,
    scopeId,
    ownerRef,
    typeRef: `design-token:${token.typeRef}`,
    capabilityIds: Object.freeze([
      'design-token',
      `design-token:${token.typeRef}`,
      ...(token.deprecated ? ['design-token:deprecated'] : []),
    ]),
  });
  contribution.dependencies.push({
    id: createSemanticId(
      'design-token-dependency',
      workspaceId,
      documentId,
      tokenPath
    ),
    kind: 'token',
    sourceSymbolId: symbolId,
    targetSymbolId: createGroupTargetSymbolId(
      workspaceId,
      documentId,
      token.groupPath
    ),
  });
  token.references.forEach((valueReference) => {
    const isDirectWholeTokenReference =
      token.directReference === valueReference.reference &&
      valueReference.reference.target.kind === 'token' &&
      valueReference.reference.target.valuePath.length === 0;
    contribution.references.push({
      id: createSemanticId(
        'design-token-reference',
        workspaceId,
        documentId,
        tokenPath,
        valueReference.valuePath.join('/')
      ),
      kind: 'token-reference',
      sourceRef: ownerRef,
      sourceSymbolId: symbolId,
      scopeId,
      target: {
        kind: 'symbol-id',
        symbolId: createReferenceTargetSymbolId(
          workspaceId,
          documentId,
          valueReference.reference.target
        ),
      },
      resolutionMode: 'addressable',
      ...(isDirectWholeTokenReference
        ? { expectedTypeRefs: Object.freeze([`design-token:${token.typeRef}`]) }
        : {}),
      requiresDurableTarget: true,
    });
  });
};

const contributeDocument = (
  contribution: MutableContribution,
  workspaceId: string,
  source: DesignTokenSemanticDocumentInput,
  document: DesignTokenDocument
): void => {
  document.groups.forEach((group) =>
    contributeGroup(contribution, workspaceId, source.documentId, group)
  );
  document.tokens.forEach((token) =>
    contributeToken(contribution, workspaceId, source.documentId, token)
  );
};

export const createDesignTokenSemanticContributionProvider = (
  input: CreateDesignTokenSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: DESIGN_TOKEN_SEMANTIC_PROVIDER_DESCRIPTOR,
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
            `Design Token semantic provider received duplicate document "${source.documentId}".`
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
