import {
  CURRENT_SEMANTIC_SCHEMA_VERSION,
  createCodeArtifactScopeId,
  createCodeArtifactSymbolId,
  createCodeSymbolId,
  createRouteManifestScopeId,
  createRouteModuleScopeId,
  createRouteModuleSymbolId,
  createRouteMountSymbolId,
  createRouteParamSymbolId,
  createRouteScopeId,
  createRouteSymbolId,
  createWorkspaceDocumentSymbolId,
  createWorkspaceScopeId,
  type SemanticContribution,
  type SemanticSnapshotIdentity,
  type WorkspaceReferenceFact,
} from '@prodivix/authoring';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createRouteSemanticContributionProvider,
  type WorkspaceRouteManifest,
} from './index';

const semanticIdPart = fc.stringMatching(/^[a-z][a-z0-9:/#%_-]{0,16}$/);
const identifier = fc.stringMatching(/^[a-z][a-z0-9_]{0,12}$/);

const createIdentity = (
  workspaceId: string,
  routeRev: number
): SemanticSnapshotIdentity => ({
  workspaceRevisions: {
    workspaceId,
    workspaceRev: 1,
    routeRev,
    opSeq: 1,
    documentRevs: {},
  },
  schemaVersion: CURRENT_SEMANTIC_SCHEMA_VERSION,
  providerSetDigest: 'route-provider-property-test',
});

const requireReferences = (
  contribution: SemanticContribution
): readonly WorkspaceReferenceFact[] => {
  expect(contribution.references).toBeDefined();
  return contribution.references ?? [];
};

describe('route semantic contribution provider properties', () => {
  it('uses canonical cross-domain identities for complete saved route facts', () => {
    fc.assert(
      fc.property(
        semanticIdPart,
        semanticIdPart,
        semanticIdPart,
        semanticIdPart,
        semanticIdPart,
        semanticIdPart,
        identifier,
        identifier,
        (
          workspacePart,
          routePart,
          pagePart,
          layoutPart,
          artifactPart,
          symbolPart,
          paramName,
          exportName
        ) => {
          const workspaceId = `workspace:${workspacePart}`;
          const routeNodeId = `route:${routePart}`;
          const pageDocumentId = `page:${pagePart}`;
          const layoutDocumentId = `layout:${layoutPart}`;
          const outletDocumentId = `outlet:${pagePart}`;
          const artifactId = `artifact:${artifactPart}`;
          const codeSymbolId = `symbol:${symbolPart}`;
          const moduleId = `module:${routePart}`;
          const moduleRootId = `module-root:${routePart}`;
          const moduleChildId = `module-child:${routePart}`;
          const mountId = `mount:${routePart}`;
          const routeRev = 7;
          const manifest: WorkspaceRouteManifest = {
            version: '1',
            root: {
              id: 'root',
              children: [
                {
                  id: routeNodeId,
                  segment: `users/:${paramName}`,
                  pageDocId: pageDocumentId,
                  layoutDocId: layoutDocumentId,
                  outletNodeId: 'unscoped-outlet-node',
                  outletBindings: {
                    sidebar: {
                      outletNodeId: 'unscoped-sidebar-node',
                      pageDocId: outletDocumentId,
                    },
                  },
                  runtime: {
                    loaderRef: {
                      artifactId,
                      symbolId: codeSymbolId,
                      exportName,
                    },
                  },
                },
              ],
            },
            modules: {
              [moduleId]: {
                moduleId,
                version: '1',
                root: {
                  id: moduleRootId,
                  children: [{ id: moduleChildId, segment: 'profile' }],
                },
              },
            },
            mounts: [
              {
                mountId,
                moduleRef: moduleId,
                parentRouteNodeId: routeNodeId,
                mountPath: 'account',
              },
            ],
          };
          const contribution = createRouteSemanticContributionProvider({
            workspaceId,
            routeRev,
            manifest,
          }).contribute(createIdentity(workspaceId, routeRev));
          const scopes = contribution.scopes ?? [];
          const symbols = contribution.symbols ?? [];
          const references = requireReferences(contribution);
          const dependencies = contribution.dependencies ?? [];

          expect(scopes.map(({ id }) => id)).toEqual(
            expect.arrayContaining([
              createRouteManifestScopeId(workspaceId),
              createRouteScopeId(workspaceId, 'root'),
              createRouteScopeId(workspaceId, routeNodeId),
              createRouteModuleScopeId(workspaceId, moduleId),
              createRouteScopeId(workspaceId, moduleRootId),
              createRouteScopeId(workspaceId, moduleChildId),
            ])
          );
          expect(
            scopes.find(
              ({ id }) => id === createRouteManifestScopeId(workspaceId)
            )?.parentId
          ).toBe(createWorkspaceScopeId(workspaceId));

          expect(symbols.map(({ id }) => id)).toEqual(
            expect.arrayContaining([
              createRouteSymbolId(workspaceId, routeNodeId),
              createRouteParamSymbolId(workspaceId, routeNodeId, paramName),
              createRouteModuleSymbolId(workspaceId, moduleId),
              createRouteMountSymbolId(workspaceId, mountId),
            ])
          );
          expect(
            symbols.find(
              ({ id }) =>
                id ===
                createRouteParamSymbolId(workspaceId, routeNodeId, paramName)
            )?.stability
          ).toBe('revision-scoped');

          const symbolTargets = references.flatMap((reference) =>
            reference.target.kind === 'symbol-id'
              ? [reference.target.symbolId]
              : []
          );
          expect(symbolTargets).toEqual(
            expect.arrayContaining([
              createWorkspaceDocumentSymbolId(workspaceId, pageDocumentId),
              createWorkspaceDocumentSymbolId(workspaceId, layoutDocumentId),
              createWorkspaceDocumentSymbolId(workspaceId, outletDocumentId),
              createCodeArtifactSymbolId(workspaceId, artifactId),
              createCodeSymbolId(workspaceId, artifactId, codeSymbolId),
              createRouteModuleSymbolId(workspaceId, moduleId),
              createRouteSymbolId(workspaceId, routeNodeId),
            ])
          );
          const pageReference = references.find(
            ({ target }) =>
              target.kind === 'symbol-id' &&
              target.symbolId ===
                createWorkspaceDocumentSymbolId(workspaceId, pageDocumentId)
          );
          expect(pageReference?.expectedTypeRefs).toEqual([
            'workspace-document:pir-page',
            'workspace-document:pir-component',
          ]);
          const layoutReference = references.find(
            ({ target }) =>
              target.kind === 'symbol-id' &&
              target.symbolId ===
                createWorkspaceDocumentSymbolId(workspaceId, layoutDocumentId)
          );
          expect(layoutReference?.expectedTypeRefs).toEqual([
            'workspace-document:pir-layout',
          ]);
          expect(
            references.find(({ target }) => target.kind === 'name')
          ).toMatchObject({
            target: {
              kind: 'name',
              name: exportName,
              symbolKinds: ['code-export', 'code-function'],
              targetScopeId: createCodeArtifactScopeId(workspaceId, artifactId),
            },
            resolutionMode: 'addressable',
          });

          expect(references).toHaveLength(8);
          expect(dependencies).toHaveLength(3);
          expect(dependencies).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                sourceSymbolId: createRouteSymbolId(workspaceId, routeNodeId),
                targetSymbolId: createRouteSymbolId(workspaceId, 'root'),
              }),
              expect.objectContaining({
                sourceSymbolId: createRouteSymbolId(workspaceId, moduleChildId),
                targetSymbolId: createRouteSymbolId(workspaceId, moduleRootId),
              }),
            ])
          );
        }
      ),
      { numRuns: 30 }
    );
  });

  it('emits the same ordered facts for equivalent collection order', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(identifier, { minLength: 1, maxLength: 6 }),
        (parts) => {
          const workspaceId = 'workspace-order';
          const routeRev = 3;
          const createManifest = (
            order: readonly string[]
          ): WorkspaceRouteManifest => ({
            version: '1',
            root: {
              id: 'root',
              children: order.map((part) => ({
                id: `route-${part}`,
                segment: part,
              })),
            },
            modules: Object.fromEntries(
              order.map((part) => [
                `module-${part}`,
                {
                  moduleId: `module-${part}`,
                  version: '1',
                  root: { id: `module-root-${part}` },
                },
              ])
            ),
            mounts: order.map((part) => ({
              mountId: `mount-${part}`,
              moduleRef: `module-${part}`,
            })),
          });
          const identity = createIdentity(workspaceId, routeRev);
          const forward = createRouteSemanticContributionProvider({
            workspaceId,
            routeRev,
            manifest: createManifest(parts),
          }).contribute(identity);
          const reversed = createRouteSemanticContributionProvider({
            workspaceId,
            routeRev,
            manifest: createManifest([...parts].reverse()),
          }).contribute(identity);

          expect(reversed).toEqual(forward);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('rejects mismatched workspace and route revision identities', () => {
    fc.assert(
      fc.property(
        semanticIdPart,
        fc.integer({ min: 1, max: 1000 }),
        (part, routeRev) => {
          const workspaceId = `workspace:${part}`;
          const provider = createRouteSemanticContributionProvider({
            workspaceId,
            routeRev,
            manifest: { version: '1', root: { id: 'root' } },
          });

          expect(() =>
            provider.contribute(
              createIdentity(`${workspaceId}:other`, routeRev)
            )
          ).toThrow(/expected workspace/);
          expect(() =>
            provider.contribute(createIdentity(workspaceId, routeRev + 1))
          ).toThrow(/route revision/);
        }
      ),
      { numRuns: 30 }
    );
  });
});
