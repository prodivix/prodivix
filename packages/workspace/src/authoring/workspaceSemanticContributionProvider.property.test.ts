import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createCodeArtifactScopeId,
  createCodeArtifactSymbolId,
  createComponentSymbolId,
  createSemanticId,
  createWorkspaceDocumentScopeId,
  createWorkspaceDocumentSymbolId,
  createWorkspaceScopeId,
  type SemanticSnapshotIdentity,
} from '@prodivix/authoring';
import { createEmptyPirDocument } from '@prodivix/pir';
import type {
  WorkspaceDocument,
  WorkspaceDocumentType,
  WorkspaceSnapshot,
  WorkspaceVfsNode,
} from '../types';
import { createWorkspaceSemanticContributionProvider } from './workspaceSemanticContributionProvider';
import { captureWorkspaceSemanticRevisions } from './workspaceSemanticRevision';

const propertyParameters = Object.freeze({
  numRuns: 50,
  seed: 0x15_07_2026,
});

type TestDocumentKind = Extract<
  WorkspaceDocumentType,
  'code' | 'asset' | 'project-config' | 'pir-component'
>;

type TestDocumentSpec = Readonly<{
  id: string;
  type: TestDocumentKind;
  name?: string;
  contentRev: number;
  metaRev: number;
  capabilities: readonly string[];
}>;

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
const documentSpecArbitrary = fc.record({
  id: identifier,
  type: fc.constantFrom<TestDocumentKind>(
    'code',
    'asset',
    'project-config',
    'pir-component'
  ),
  name: fc.option(identifier, { nil: undefined }),
  contentRev: fc.integer({ min: 1, max: 100 }),
  metaRev: fc.integer({ min: 1, max: 100 }),
  capabilities: fc.uniqueArray(identifier, { maxLength: 3 }),
});

const documentSpecsArbitrary = fc.uniqueArray(documentSpecArbitrary, {
  minLength: 1,
  maxLength: 6,
  selector: ({ id }) => id,
});

const getDocumentFileName = (spec: TestDocumentSpec): string => {
  if (spec.type === 'code') return `${spec.id}.ts`;
  if (spec.type === 'asset') return `${spec.id}.png`;
  if (spec.type === 'pir-component') return `${spec.id}.pir.json`;
  return `${spec.id}.json`;
};

const createDocumentContent = (type: TestDocumentKind): unknown => {
  if (type === 'code') {
    return { language: 'ts', source: 'export const value = 1;' };
  }
  if (type === 'asset') {
    return {
      kind: 'asset',
      mime: 'image/png',
      size: 0,
      blob: {
        kind: 'workspace-blob',
        digest:
          'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        byteLength: 0,
        mediaType: 'image/png',
      },
    };
  }
  if (type === 'pir-component') {
    return createEmptyPirDocument();
  }
  return { kind: 'config', value: {} };
};

const createWorkspace = (
  specs: readonly TestDocumentSpec[],
  options: Readonly<{
    workspaceId?: string;
    pathDirectory?: string;
    revisionOffset?: number;
    reverseInsertion?: boolean;
  }> = {}
): WorkspaceSnapshot => {
  const workspaceId = options.workspaceId ?? 'workspace-property';
  const pathDirectory = options.pathDirectory ?? 'documents';
  const revisionOffset = options.revisionOffset ?? 0;
  const orderedSpecs = options.reverseInsertion ? [...specs].reverse() : specs;
  const documents = orderedSpecs.map<WorkspaceDocument>((spec) => ({
    id: spec.id,
    type: spec.type,
    ...(spec.name ? { name: spec.name } : {}),
    path: `/${pathDirectory}/${getDocumentFileName(spec)}`,
    contentRev: spec.contentRev + revisionOffset,
    metaRev: spec.metaRev + revisionOffset,
    content: createDocumentContent(spec.type),
    ...(spec.capabilities.length
      ? { capabilities: [...spec.capabilities].sort() }
      : {}),
  }));
  const documentNodeIds = documents.map(
    (document) => `document-node:${document.id}`
  );
  const treeById: Record<string, WorkspaceVfsNode> = {
    root: {
      id: 'root',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: ['documents-directory'],
    },
    'documents-directory': {
      id: 'documents-directory',
      kind: 'dir',
      name: pathDirectory,
      parentId: 'root',
      children: documentNodeIds,
    },
  };
  documents.forEach((document, index) => {
    const nodeId = documentNodeIds[index]!;
    treeById[nodeId] = {
      id: nodeId,
      kind: 'doc',
      name: document.path.split('/').at(-1)!,
      parentId: 'documents-directory',
      docId: document.id,
    };
  });

  return {
    id: workspaceId,
    workspaceRev: 7 + revisionOffset,
    routeRev: 3 + revisionOffset,
    opSeq: 11 + revisionOffset,
    treeRootId: 'root',
    treeById,
    docsById: Object.fromEntries(
      documents.map((document) => [document.id, document])
    ),
    routeManifest: { version: '1', root: { id: 'root' } },
  };
};

const createIdentity = (
  snapshot: WorkspaceSnapshot
): SemanticSnapshotIdentity => ({
  workspaceRevisions: captureWorkspaceSemanticRevisions(snapshot),
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'property-provider-set',
});

describe('createWorkspaceSemanticContributionProvider', () => {
  it('publishes deterministic document, code, and component identities', () => {
    fc.assert(
      fc.property(documentSpecsArbitrary, (specs) => {
        const snapshot = createWorkspace(specs);
        const reversedSnapshot = createWorkspace(specs, {
          reverseInsertion: true,
        });
        const contribution = createWorkspaceSemanticContributionProvider(
          snapshot
        ).contribute(createIdentity(snapshot));
        const reversedContribution =
          createWorkspaceSemanticContributionProvider(
            reversedSnapshot
          ).contribute(createIdentity(reversedSnapshot));

        expect(captureWorkspaceSemanticRevisions(reversedSnapshot)).toEqual(
          captureWorkspaceSemanticRevisions(snapshot)
        );
        expect(reversedContribution).toEqual(contribution);
        expect(contribution.references ?? []).toEqual([]);
        const typedDocuments = specs.filter(
          ({ type }) => type === 'code' || type === 'pir-component'
        );
        expect(contribution.dependencies).toHaveLength(typedDocuments.length);
        expect(contribution.scopes).toHaveLength(
          1 + specs.length + specs.filter(({ type }) => type === 'code').length
        );
        expect(contribution.symbols).toHaveLength(
          specs.length + typedDocuments.length
        );

        const workspaceScopeId = createWorkspaceScopeId(snapshot.id);
        expect(contribution.scopes).toContainEqual({
          id: workspaceScopeId,
          kind: 'workspace',
          ownerRef: { kind: 'workspace', workspaceId: snapshot.id },
        });

        for (const document of Object.values(snapshot.docsById)) {
          const documentScopeId = createWorkspaceDocumentScopeId(
            snapshot.id,
            document.id
          );
          const displayName = document.name ?? document.path.split('/').at(-1)!;
          expect(contribution.scopes).toContainEqual({
            id: documentScopeId,
            kind: 'document',
            ownerRef: {
              kind: 'document',
              workspaceId: snapshot.id,
              documentId: document.id,
            },
            parentId: workspaceScopeId,
          });
          expect(contribution.symbols).toContainEqual({
            id: createWorkspaceDocumentSymbolId(snapshot.id, document.id),
            stability: 'durable',
            kind: 'workspace-document',
            name: document.path,
            displayName,
            qualifiedName: document.path,
            scopeId: workspaceScopeId,
            ownerRef: {
              kind: 'document',
              workspaceId: snapshot.id,
              documentId: document.id,
            },
            typeRef: `workspace-document:${document.type}`,
            ...(document.capabilities
              ? { capabilityIds: document.capabilities }
              : {}),
          });

          if (document.type === 'code') {
            expect(contribution.scopes).toContainEqual({
              id: createCodeArtifactScopeId(snapshot.id, document.id),
              kind: 'code-artifact',
              ownerRef: {
                kind: 'code-artifact',
                artifactId: document.id,
              },
              parentId: documentScopeId,
            });
            expect(contribution.symbols).toContainEqual(
              expect.objectContaining({
                id: createCodeArtifactSymbolId(snapshot.id, document.id),
                kind: 'code-artifact',
                scopeId: documentScopeId,
                typeRef: 'code-artifact:ts',
              })
            );
          }
          if (document.type === 'pir-component') {
            expect(contribution.symbols).toContainEqual(
              expect.objectContaining({
                id: createComponentSymbolId(snapshot.id, document.id),
                kind: 'component',
                scopeId: documentScopeId,
                typeRef: 'pir-component',
              })
            );
          }

          const typedSymbolId =
            document.type === 'code'
              ? createCodeArtifactSymbolId(snapshot.id, document.id)
              : document.type === 'pir-component'
                ? createComponentSymbolId(snapshot.id, document.id)
                : undefined;
          if (typedSymbolId) {
            expect(contribution.dependencies).toContainEqual({
              id: createSemanticId(
                'workspace-typed-document-dependency',
                snapshot.id,
                document.id,
                document.type === 'pir-component'
                  ? 'component'
                  : 'code-artifact'
              ),
              kind: 'document',
              sourceSymbolId: typedSymbolId,
              targetSymbolId: createWorkspaceDocumentSymbolId(
                snapshot.id,
                document.id
              ),
            });
          }
        }
      }),
      propertyParameters
    );
  });

  it('keeps durable addresses stable and rejects another Workspace revision', () => {
    fc.assert(
      fc.property(documentSpecsArbitrary, (specs) => {
        const snapshot = createWorkspace(specs);
        const updatedSnapshot = createWorkspace(specs, {
          pathDirectory: 'renamed',
          revisionOffset: 1,
        });
        const provider = createWorkspaceSemanticContributionProvider(snapshot);
        const contribution = provider.contribute(createIdentity(snapshot));
        const updatedContribution = createWorkspaceSemanticContributionProvider(
          updatedSnapshot
        ).contribute(createIdentity(updatedSnapshot));

        expect(contribution.scopes?.map(({ id }) => id).sort()).toEqual(
          updatedContribution.scopes?.map(({ id }) => id).sort()
        );
        expect(contribution.symbols?.map(({ id }) => id).sort()).toEqual(
          updatedContribution.symbols?.map(({ id }) => id).sort()
        );
        expect(() =>
          provider.contribute(createIdentity(updatedSnapshot))
        ).toThrow(/revision does not match/);

        const otherWorkspaceIdentity = createIdentity(snapshot);
        expect(() =>
          provider.contribute({
            ...otherWorkspaceIdentity,
            workspaceRevisions: {
              ...otherWorkspaceIdentity.workspaceRevisions,
              workspaceId: `${snapshot.id}-other`,
            },
          })
        ).toThrow(/revision does not match/);
      }),
      propertyParameters
    );
  });
});
