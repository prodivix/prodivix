import { classifyBinaryAssetDelivery } from '@prodivix/assets';
import {
  createAssetSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  type SemanticContributionProvider,
  type SemanticDocumentRevision,
  type WorkspaceDependencyContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import {
  isWorkspaceAssetDocumentContent,
  type WorkspaceAssetDocumentContent,
} from '../workspaceResourceDocument';

export const WORKSPACE_ASSET_SEMANTIC_PROVIDER_DESCRIPTOR = Object.freeze({
  id: 'core.assets',
  semanticVersion: '1',
});

export type WorkspaceAssetSemanticDocumentInput = Readonly<{
  documentId: string;
  path: string;
  displayName?: string;
  revision: SemanticDocumentRevision;
  content: WorkspaceAssetDocumentContent;
}>;

export type CreateWorkspaceAssetSemanticContributionProviderInput = Readonly<{
  workspaceId: string;
  documents: readonly WorkspaceAssetSemanticDocumentInput[];
}>;

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const normalizeCapabilityPart = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase('en-US')
    .replaceAll(/[^a-z0-9.+/-]+/g, '-');

const createAssetCapabilityIds = (
  content: WorkspaceAssetDocumentContent
): readonly string[] => {
  const mime = content.mime.trim().toLocaleLowerCase('en-US');
  const mimeFamily = mime.split('/', 1)[0];
  const category = content.category
    ? normalizeCapabilityPart(content.category)
    : undefined;
  return Object.freeze(
    Array.from(
      new Set([
        'asset',
        `asset:mime:${mime}`,
        ...(mimeFamily ? [`asset:family:${mimeFamily}`] : []),
        ...(category ? [`asset:category:${category}`] : []),
        'asset:blob',
        `asset:delivery:${classifyBinaryAssetDelivery(mime)}`,
      ])
    ).sort(compareText)
  );
};

const assertRevision = (
  input: CreateWorkspaceAssetSemanticContributionProviderInput,
  source: WorkspaceAssetSemanticDocumentInput,
  identity: Parameters<SemanticContributionProvider['contribute']>[0]
): void => {
  const actual = identity.workspaceRevisions.documentRevs[source.documentId];
  if (
    identity.workspaceRevisions.workspaceId !== input.workspaceId ||
    !actual ||
    actual.contentRev !== source.revision.contentRev ||
    actual.metaRev !== source.revision.metaRev
  ) {
    throw new Error(
      `Asset semantic provider snapshot mismatch for document "${source.documentId}".`
    );
  }
};

/** Publishes canonical asset identities and capability-qualified media types. */
export const createWorkspaceAssetSemanticContributionProvider = (
  input: CreateWorkspaceAssetSemanticContributionProviderInput
): SemanticContributionProvider => ({
  descriptor: WORKSPACE_ASSET_SEMANTIC_PROVIDER_DESCRIPTOR,
  contribute(identity) {
    const documentIds = new Set<string>();
    const symbols: WorkspaceSymbolContribution[] = [];
    const dependencies: WorkspaceDependencyContribution[] = [];
    [...input.documents]
      .sort((left, right) => compareText(left.documentId, right.documentId))
      .forEach((source) => {
        if (documentIds.has(source.documentId)) {
          throw new Error(
            `Asset semantic provider received duplicate document "${source.documentId}".`
          );
        }
        documentIds.add(source.documentId);
        assertRevision(input, source, identity);
        if (!isWorkspaceAssetDocumentContent(source.content)) {
          throw new Error(
            `Asset semantic provider received invalid content for document "${source.documentId}".`
          );
        }
        const symbolId = createAssetSymbolId(
          input.workspaceId,
          source.documentId
        );
        symbols.push({
          id: symbolId,
          stability: 'durable',
          kind: 'asset',
          name: source.path,
          displayName:
            source.displayName ?? source.path.split('/').at(-1) ?? source.path,
          qualifiedName: source.path,
          scopeId: createWorkspaceDocumentScopeId(
            input.workspaceId,
            source.documentId
          ),
          ownerRef: {
            kind: 'document',
            workspaceId: input.workspaceId,
            documentId: source.documentId,
          },
          typeRef: `asset:${source.content.mime
            .trim()
            .toLocaleLowerCase('en-US')}`,
          capabilityIds: createAssetCapabilityIds(source.content),
        });
        dependencies.push({
          id: createSemanticId(
            'asset-document-dependency',
            input.workspaceId,
            source.documentId
          ),
          kind: 'document',
          sourceSymbolId: symbolId,
          targetSymbolId: createWorkspaceDocumentSymbolId(
            input.workspaceId,
            source.documentId
          ),
        });
      });
    return Object.freeze({
      symbols: Object.freeze(symbols.map((symbol) => Object.freeze(symbol))),
      dependencies: Object.freeze(
        dependencies.map((dependency) => Object.freeze(dependency))
      ),
    });
  },
});
