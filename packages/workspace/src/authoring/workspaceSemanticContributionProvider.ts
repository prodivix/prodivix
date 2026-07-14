import {
  createAssetSymbolId,
  createCodeArtifactScopeId,
  createCodeArtifactSymbolId,
  createComponentSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  createWorkspaceScopeId,
  isSameSemanticWorkspaceRevisions,
  type SemanticContribution,
  type SemanticContributionProvider,
  type WorkspaceDependencyContribution,
  type WorkspaceScopeContribution,
  type WorkspaceSymbolContribution,
} from '@prodivix/authoring';
import type { WorkspaceDocument, WorkspaceSnapshot } from '../types';
import { isWorkspaceCodeDocumentContent } from '../workspaceCodeDocument';
import { isWorkspaceAssetDocumentContent } from '../workspaceResourceDocument';
import { captureWorkspaceSemanticRevisions } from './workspaceSemanticRevision';

export const WORKSPACE_SEMANTIC_PROVIDER_ID = 'core.workspace';
export const WORKSPACE_SEMANTIC_PROVIDER_VERSION = '2';

const compareDocuments = (
  left: WorkspaceDocument,
  right: WorkspaceDocument
): number => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);

const getDocumentDisplayName = (document: WorkspaceDocument): string =>
  document.name ?? document.path.split('/').at(-1) ?? document.path;

const getCapabilityIds = (
  document: WorkspaceDocument
): readonly string[] | undefined =>
  document.capabilities ? Object.freeze([...document.capabilities]) : undefined;

const createDocumentSymbol = (
  workspaceId: string,
  workspaceScopeId: string,
  document: WorkspaceDocument
): WorkspaceSymbolContribution => {
  const capabilityIds = getCapabilityIds(document);
  return Object.freeze({
    id: createWorkspaceDocumentSymbolId(workspaceId, document.id),
    stability: 'durable',
    kind: 'workspace-document',
    name: document.path,
    displayName: getDocumentDisplayName(document),
    qualifiedName: document.path,
    scopeId: workspaceScopeId,
    ownerRef: Object.freeze({
      kind: 'document',
      workspaceId,
      documentId: document.id,
    }),
    typeRef: `workspace-document:${document.type}`,
    ...(capabilityIds ? { capabilityIds } : {}),
  });
};

const createTypedDocumentSymbol = (
  workspaceId: string,
  documentScopeId: string,
  document: WorkspaceDocument
): WorkspaceSymbolContribution | null => {
  const capabilityIds = getCapabilityIds(document);
  const common = {
    stability: 'durable' as const,
    name: document.path,
    displayName: getDocumentDisplayName(document),
    qualifiedName: document.path,
    scopeId: documentScopeId,
    ...(capabilityIds ? { capabilityIds } : {}),
  };

  if (document.type === 'code') {
    if (!isWorkspaceCodeDocumentContent(document.content)) {
      throw new Error(
        `Workspace code document "${document.id}" has invalid content.`
      );
    }
    return Object.freeze({
      ...common,
      id: createCodeArtifactSymbolId(workspaceId, document.id),
      kind: 'code-artifact',
      ownerRef: Object.freeze({
        kind: 'code-artifact',
        artifactId: document.id,
      }),
      typeRef: `code-artifact:${document.content.language}`,
    });
  }

  if (document.type === 'asset') {
    if (!isWorkspaceAssetDocumentContent(document.content)) {
      throw new Error(
        `Workspace asset document "${document.id}" has invalid content.`
      );
    }
    return Object.freeze({
      ...common,
      id: createAssetSymbolId(workspaceId, document.id),
      kind: 'asset',
      ownerRef: Object.freeze({
        kind: 'document',
        workspaceId,
        documentId: document.id,
      }),
      typeRef: `asset:${document.content.mime}`,
    });
  }

  if (document.type === 'pir-component') {
    return Object.freeze({
      ...common,
      id: createComponentSymbolId(workspaceId, document.id),
      kind: 'component',
      ownerRef: Object.freeze({
        kind: 'document' as const,
        workspaceId,
        documentId: document.id,
      }),
      typeRef: 'pir-component',
    });
  }

  return null;
};

const createWorkspaceContribution = (
  snapshot: WorkspaceSnapshot
): SemanticContribution => {
  const workspaceScopeId = createWorkspaceScopeId(snapshot.id);
  const scopes: WorkspaceScopeContribution[] = [
    Object.freeze({
      id: workspaceScopeId,
      kind: 'workspace',
      ownerRef: Object.freeze({
        kind: 'workspace',
        workspaceId: snapshot.id,
      }),
    }),
  ];
  const symbols: WorkspaceSymbolContribution[] = [];
  const dependencies: WorkspaceDependencyContribution[] = [];

  for (const document of Object.values(snapshot.docsById).sort(
    compareDocuments
  )) {
    const documentScopeId = createWorkspaceDocumentScopeId(
      snapshot.id,
      document.id
    );
    const documentOwnerRef = Object.freeze({
      kind: 'document' as const,
      workspaceId: snapshot.id,
      documentId: document.id,
    });
    scopes.push(
      Object.freeze({
        id: documentScopeId,
        kind: 'document',
        ownerRef: documentOwnerRef,
        parentId: workspaceScopeId,
      })
    );
    if (document.type === 'code') {
      scopes.push(
        Object.freeze({
          id: createCodeArtifactScopeId(snapshot.id, document.id),
          kind: 'code-artifact',
          ownerRef: Object.freeze({
            kind: 'code-artifact',
            artifactId: document.id,
          }),
          parentId: documentScopeId,
        })
      );
    }

    symbols.push(createDocumentSymbol(snapshot.id, workspaceScopeId, document));
    const typedSymbol = createTypedDocumentSymbol(
      snapshot.id,
      documentScopeId,
      document
    );
    if (typedSymbol) {
      symbols.push(typedSymbol);
      dependencies.push(
        Object.freeze({
          id: createSemanticId(
            'workspace-typed-document-dependency',
            snapshot.id,
            document.id,
            typedSymbol.kind
          ),
          kind: 'document',
          sourceSymbolId: typedSymbol.id,
          targetSymbolId: createWorkspaceDocumentSymbolId(
            snapshot.id,
            document.id
          ),
        })
      );
    }
  }

  return Object.freeze({
    scopes: Object.freeze(scopes),
    symbols: Object.freeze(symbols),
    dependencies: Object.freeze(dependencies),
  });
};

/**
 * Projects one immutable canonical Workspace snapshot into stable root,
 * document, code-artifact, and asset semantic facts. The provider rejects a
 * composition identity from any other Workspace revision so stale snapshot
 * data cannot be published under a current SemanticSnapshotIdentity.
 */
export const createWorkspaceSemanticContributionProvider = (
  snapshot: WorkspaceSnapshot
): SemanticContributionProvider => {
  const revisions = captureWorkspaceSemanticRevisions(snapshot);
  const contribution = createWorkspaceContribution(snapshot);

  return Object.freeze({
    descriptor: Object.freeze({
      id: WORKSPACE_SEMANTIC_PROVIDER_ID,
      semanticVersion: WORKSPACE_SEMANTIC_PROVIDER_VERSION,
    }),
    contribute(identity) {
      if (
        !isSameSemanticWorkspaceRevisions(
          identity.workspaceRevisions,
          revisions
        )
      ) {
        throw new Error(
          'Workspace semantic provider revision does not match its captured snapshot.'
        );
      }
      return contribution;
    },
  });
};
