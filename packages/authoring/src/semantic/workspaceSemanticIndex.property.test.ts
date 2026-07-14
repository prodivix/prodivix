import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createWorkspaceSemanticIndex } from './createWorkspaceSemanticIndex';
import type {
  SemanticContributionProvider,
  SemanticIndexBuildResult,
  SemanticSnapshotRevision,
  WorkspaceReferenceFact,
  WorkspaceSemanticIndex,
} from './semantic.types';

const propertyParameters = Object.freeze({
  numRuns: 200,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}$/);

const revision: SemanticSnapshotRevision = {
  workspaceRevisions: {
    workspaceId: 'workspace-1',
    workspaceRev: 7,
    routeRev: 3,
    opSeq: 11,
    documentRevs: {
      'document-1': { contentRev: 5, metaRev: 2 },
    },
  },
  schemaVersion: 'semantic-v1',
};

const expectIndex = (
  result: SemanticIndexBuildResult
): WorkspaceSemanticIndex => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(
      `Expected semantic index build to succeed: ${JSON.stringify(result.issues)}`
    );
  }
  return result.index;
};

const createOrderProviders = (
  providerIds: readonly string[],
  reverseFacts: boolean,
  duplicateSymbolId: boolean
): SemanticContributionProvider[] =>
  providerIds.map((providerId, providerIndex) => {
    const rootProviderId = providerIds[0]!;
    const nextProviderId =
      providerIds[(providerIndex + 1) % providerIds.length]!;
    const scopeId = `scope:${providerId}`;
    const primarySymbolId =
      duplicateSymbolId && providerIndex === 1
        ? `symbol:${rootProviderId}:primary`
        : `symbol:${providerId}:primary`;
    const symbols = [
      {
        id: primarySymbolId,
        stability: 'durable' as const,
        kind: 'workspace-document' as const,
        name: `${providerId}Primary`,
        scopeId,
        ownerRef: { kind: 'document' as const, documentId: providerId },
      },
      {
        id: `symbol:${providerId}:consumer`,
        stability: 'durable' as const,
        kind: 'component' as const,
        name: `${providerId}Consumer`,
        scopeId,
        ownerRef: { kind: 'document' as const, documentId: providerId },
      },
    ];
    const references: WorkspaceReferenceFact[] = [
      {
        id: `reference:${providerId}`,
        kind: 'definition',
        sourceRef: { kind: 'document', documentId: providerId },
        sourceSymbolId: `symbol:${providerId}:consumer`,
        scopeId,
        target: {
          kind: 'symbol-id',
          symbolId: `symbol:${nextProviderId}:primary`,
        },
        resolutionMode: 'addressable',
        requiresDurableTarget: true,
      },
    ];

    return {
      descriptor: {
        id: providerId,
        semanticVersion: '1',
        configurationDigest: `configuration:${providerId}`,
      },
      contribute: () => ({
        scopes: [
          {
            id: scopeId,
            kind: providerIndex === 0 ? 'workspace' : 'document',
            ownerRef: { kind: 'document', documentId: providerId },
            ...(providerIndex === 0
              ? {}
              : { parentId: `scope:${rootProviderId}` }),
          },
        ],
        symbols: reverseFacts ? [...symbols].reverse() : symbols,
        references: reverseFacts ? [...references].reverse() : references,
        dependencies: [
          {
            id: `dependency:${providerId}`,
            kind: 'document',
            sourceSymbolId: `symbol:${providerId}:consumer`,
            targetSymbolId: `symbol:${nextProviderId}:primary`,
          },
        ],
        diagnostics: [
          {
            code: `COD-${providerIndex + 2001}`,
            severity: 'warning',
            domain: 'code',
            message: `Diagnostic from ${providerId}.`,
            targetRef: { kind: 'document', documentId: providerId },
          },
        ],
      }),
    };
  });

describe('workspace semantic index properties', () => {
  it('is independent of provider and fact order and rejects duplicate identities deterministically', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(identifier, {
          minLength: 2,
          maxLength: 6,
        }),
        fc.boolean(),
        (providerIds, duplicateSymbolId) => {
          const forward = createWorkspaceSemanticIndex({
            ...revision,
            providers: createOrderProviders(
              providerIds,
              false,
              duplicateSymbolId
            ),
          });
          const reversed = createWorkspaceSemanticIndex({
            ...revision,
            providers: createOrderProviders(
              providerIds,
              true,
              duplicateSymbolId
            ).reverse(),
          });

          expect(reversed.ok).toBe(forward.ok);
          if (!forward.ok || !reversed.ok) {
            expect(forward).toEqual(reversed);
            expect(
              forward.ok ? [] : forward.issues.map(({ code }) => code)
            ).toContain('duplicate-symbol-id');
            return;
          }

          expect(reversed.index.snapshotIdentity).toEqual(
            forward.index.snapshotIdentity
          );
          const scopeId = `scope:${providerIds.at(-1)!}`;
          expect(reversed.index.queryVisibleSymbols({ scopeId })).toEqual(
            forward.index.queryVisibleSymbols({ scopeId })
          );
          for (const providerId of providerIds) {
            expect(
              reversed.index.resolveReference(`reference:${providerId}`)
            ).toEqual(
              forward.index.resolveReference(`reference:${providerId}`)
            );
          }
          expect(
            reversed.index.getReferences(`symbol:${providerIds[0]!}:primary`)
          ).toEqual(
            forward.index.getReferences(`symbol:${providerIds[0]!}:primary`)
          );
          expect(
            reversed.index.getImpact([`symbol:${providerIds[0]!}:primary`])
          ).toEqual(
            forward.index.getImpact([`symbol:${providerIds[0]!}:primary`])
          );
          expect(reversed.index.getSemanticDiagnostics()).toEqual(
            forward.index.getSemanticDiagnostics()
          );
        }
      ),
      propertyParameters
    );
  });

  it('resolves nested lexical scopes with explicit failure states', () => {
    fc.assert(
      fc.property(
        identifier,
        fc.integer({ min: 2, max: 6 }),
        (prefix, depth) => {
          const scopes = Array.from({ length: depth }, (_, index) => ({
            id: `${prefix}:scope:${index}`,
            kind: (index === 0 ? 'workspace' : 'pir-node') as
              'workspace' | 'pir-node',
            ownerRef: {
              kind: 'document' as const,
              documentId: `${prefix}:document`,
            },
            ...(index === 0
              ? {}
              : { parentId: `${prefix}:scope:${index - 1}` }),
          }));
          const leafScopeId = scopes.at(-1)!.id;
          const siblingScopeId = `${prefix}:scope:sibling`;
          const provider: SemanticContributionProvider = {
            descriptor: { id: `${prefix}:provider`, semanticVersion: '1' },
            contribute: () => ({
              scopes: [
                ...scopes,
                {
                  id: siblingScopeId,
                  kind: 'document',
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:sibling`,
                  },
                  parentId: scopes[0]!.id,
                },
              ],
              symbols: [
                {
                  id: `${prefix}:root-shared`,
                  stability: 'durable',
                  kind: 'state',
                  name: 'shared',
                  scopeId: scopes[0]!.id,
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  typeRef: 'number',
                  capabilityIds: ['read'],
                },
                {
                  id: `${prefix}:root-only`,
                  stability: 'durable',
                  kind: 'state',
                  name: 'rootOnly',
                  scopeId: scopes[0]!.id,
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                },
                {
                  id: `${prefix}:leaf-shared`,
                  stability: 'durable',
                  kind: 'state',
                  name: 'shared',
                  scopeId: leafScopeId,
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  typeRef: 'number',
                  capabilityIds: ['read'],
                },
                {
                  id: `${prefix}:sibling-only`,
                  stability: 'durable',
                  kind: 'state',
                  name: 'siblingOnly',
                  scopeId: siblingScopeId,
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:sibling`,
                  },
                },
                ...['a', 'b'].map((suffix) => ({
                  id: `${prefix}:ambiguous:${suffix}`,
                  stability: 'durable' as const,
                  kind: 'state' as const,
                  name: 'ambiguous',
                  scopeId: leafScopeId,
                  ownerRef: {
                    kind: 'document' as const,
                    documentId: `${prefix}:document`,
                  },
                })),
                {
                  id: `${prefix}:incompatible`,
                  stability: 'durable',
                  kind: 'state',
                  name: 'incompatible',
                  scopeId: leafScopeId,
                  ownerRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  typeRef: 'string',
                },
              ],
              references: [
                {
                  id: `${prefix}:resolved`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: {
                    kind: 'name',
                    name: 'shared',
                    symbolKinds: ['state'],
                  },
                  resolutionMode: 'visible',
                  expectedTypeRefs: ['number'],
                  requiredCapabilityIds: ['read'],
                },
                {
                  id: `${prefix}:not-visible`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: {
                    kind: 'symbol-id',
                    symbolId: `${prefix}:sibling-only`,
                  },
                  resolutionMode: 'visible',
                },
                {
                  id: `${prefix}:ambiguous-reference`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: { kind: 'name', name: 'ambiguous' },
                  resolutionMode: 'visible',
                },
                {
                  id: `${prefix}:type-incompatible`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: { kind: 'name', name: 'incompatible' },
                  resolutionMode: 'visible',
                  expectedTypeRefs: ['number'],
                },
                {
                  id: `${prefix}:missing`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: { kind: 'name', name: 'missing' },
                  resolutionMode: 'visible',
                },
                {
                  id: `${prefix}:deferred-missing`,
                  kind: 'binding',
                  sourceRef: {
                    kind: 'document',
                    documentId: `${prefix}:document`,
                  },
                  sourceSymbolId: `${prefix}:leaf-shared`,
                  scopeId: leafScopeId,
                  target: { kind: 'name', name: 'context-owned' },
                  resolutionMode: 'visible',
                  diagnosticPolicy: 'defer',
                },
              ],
            }),
          };
          const index = expectIndex(
            createWorkspaceSemanticIndex({
              ...revision,
              providers: [provider],
            })
          );

          const visible = index.queryVisibleSymbols({ scopeId: leafScopeId });
          expect(visible.status).toBe('resolved');
          if (visible.status !== 'resolved') return;
          const visibleIds = visible.symbols.map(({ id }) => id);
          expect(visibleIds).toContain(`${prefix}:leaf-shared`);
          expect(visibleIds).toContain(`${prefix}:root-only`);
          expect(visibleIds).not.toContain(`${prefix}:root-shared`);
          expect(visibleIds).not.toContain(`${prefix}:sibling-only`);

          const resolved = index.resolveReference(`${prefix}:resolved`);
          expect(resolved.status).toBe('resolved');
          if (resolved.status === 'resolved') {
            expect(resolved.symbol.id).toBe(`${prefix}:leaf-shared`);
          }
          expect(index.resolveReference(`${prefix}:not-visible`).status).toBe(
            'not-visible'
          );
          expect(
            index.resolveReference(`${prefix}:ambiguous-reference`).status
          ).toBe('ambiguous');
          expect(
            index.resolveReference(`${prefix}:type-incompatible`).status
          ).toBe('type-incompatible');
          expect(index.resolveReference(`${prefix}:missing`).status).toBe(
            'missing'
          );
          expect(
            index.resolveReference(`${prefix}:deferred-missing`).status
          ).toBe('missing');
          const semanticDiagnostics = index.getSemanticDiagnostics();
          expect(semanticDiagnostics.status).toBe('resolved');
          if (semanticDiagnostics.status === 'resolved') {
            expect(
              semanticDiagnostics.diagnostics.map(({ code }) => code)
            ).toEqual(
              expect.arrayContaining([
                'SEM-2001',
                'SEM-2002',
                'SEM-2003',
                'SEM-2004',
              ])
            );
            const diagnosedReferenceIds = semanticDiagnostics.diagnostics.map(
              ({ meta }) => meta?.referenceId
            );
            expect(diagnosedReferenceIds).toContain(`${prefix}:missing`);
            expect(diagnosedReferenceIds).not.toContain(
              `${prefix}:deferred-missing`
            );
          }

          const staleIdentity = {
            ...index.snapshotIdentity,
            workspaceRevisions: {
              ...index.snapshotIdentity.workspaceRevisions,
              workspaceRev:
                index.snapshotIdentity.workspaceRevisions.workspaceRev + 1,
            },
          };
          expect(
            index.resolveReference(`${prefix}:resolved`, {
              expectedSnapshotIdentity: staleIdentity,
            }).status
          ).toBe('stale');
          expect(
            index.getSemanticDiagnostics({
              expectedSnapshotIdentity: staleIdentity,
            })
          ).toMatchObject({
            status: 'stale',
            diagnostics: [{ code: 'SEM-2005', domain: 'semantic' }],
          });
        }
      ),
      propertyParameters
    );
  });

  it('computes reverse references and transitive impact as a stable closure', () => {
    const impactCase = fc.integer({ min: 2, max: 8 }).chain((symbolCount) =>
      fc.record({
        symbolCount: fc.constant(symbolCount),
        rootIndex: fc.integer({ min: 0, max: symbolCount - 1 }),
        edges: fc.uniqueArray(
          fc
            .record({
              kind: fc.constantFrom(
                'reference' as const,
                'dependency' as const
              ),
              sourceIndex: fc.integer({ min: 0, max: symbolCount - 1 }),
              targetIndex: fc.integer({ min: 0, max: symbolCount - 1 }),
            })
            .filter(
              ({ sourceIndex, targetIndex }) => sourceIndex !== targetIndex
            ),
          {
            maxLength: symbolCount * 3,
            selector: ({ kind, sourceIndex, targetIndex }) =>
              `${kind}:${sourceIndex}:${targetIndex}`,
          }
        ),
      })
    );

    fc.assert(
      fc.property(impactCase, ({ symbolCount, rootIndex, edges }) => {
        const symbolId = (index: number) => `symbol:${index}`;
        const provider: SemanticContributionProvider = {
          descriptor: { id: 'impact-provider', semanticVersion: '1' },
          contribute: () => ({
            scopes: [
              {
                id: 'workspace-scope',
                kind: 'workspace',
                ownerRef: { kind: 'workspace', workspaceId: 'workspace-1' },
              },
            ],
            symbols: Array.from({ length: symbolCount }, (_, index) => ({
              id: symbolId(index),
              stability: 'durable',
              kind: 'workspace-document',
              name: `document${index}`,
              scopeId: 'workspace-scope',
              ownerRef: { kind: 'document', documentId: `document-${index}` },
            })),
            references: edges
              .filter(({ kind }) => kind === 'reference')
              .map(({ sourceIndex, targetIndex }) => ({
                id: `reference:${sourceIndex}:${targetIndex}`,
                kind: 'definition',
                sourceRef: {
                  kind: 'document',
                  documentId: `document-${sourceIndex}`,
                },
                sourceSymbolId: symbolId(sourceIndex),
                scopeId: 'workspace-scope',
                target: {
                  kind: 'symbol-id',
                  symbolId: symbolId(targetIndex),
                },
                resolutionMode: 'addressable',
              })),
            dependencies: edges
              .filter(({ kind }) => kind === 'dependency')
              .map(({ sourceIndex, targetIndex }) => ({
                id: `dependency:${sourceIndex}:${targetIndex}`,
                kind: 'document',
                sourceSymbolId: symbolId(sourceIndex),
                targetSymbolId: symbolId(targetIndex),
              })),
          }),
        };
        const index = expectIndex(
          createWorkspaceSemanticIndex({
            ...revision,
            providers: [provider],
          })
        );
        const rootSymbolId = symbolId(rootIndex);

        const visited = new Set([rootIndex]);
        const impacted = new Set<number>();
        const referenceIds = new Set<string>();
        const dependencyIds = new Set<string>();
        const queue = [rootIndex];
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
          const targetIndex = queue[queueIndex]!;
          for (const edge of edges.filter(
            (candidate) => candidate.targetIndex === targetIndex
          )) {
            const edgeId = `${edge.kind}:${edge.sourceIndex}:${edge.targetIndex}`;
            if (edge.kind === 'reference') referenceIds.add(edgeId);
            else dependencyIds.add(edgeId);
            if (visited.has(edge.sourceIndex)) continue;
            visited.add(edge.sourceIndex);
            impacted.add(edge.sourceIndex);
            queue.push(edge.sourceIndex);
          }
        }

        const impact = index.getImpact([rootSymbolId]);
        expect(impact.status).toBe('resolved');
        if (impact.status !== 'resolved') return;
        expect(impact.impact).toEqual({
          rootSymbolIds: [rootSymbolId],
          impactedSymbolIds: Array.from(impacted).map(symbolId).sort(),
          referenceIds: Array.from(referenceIds).sort(),
          dependencyIds: Array.from(dependencyIds).sort(),
        });

        const references = index.getReferences(rootSymbolId);
        expect(references.status).toBe('resolved');
        if (references.status !== 'resolved') return;
        expect(references.references.map(({ id }) => id)).toEqual(
          edges
            .filter(
              ({ kind, targetIndex }) =>
                kind === 'reference' && targetIndex === rootIndex
            )
            .map(
              ({ sourceIndex, targetIndex }) =>
                `reference:${sourceIndex}:${targetIndex}`
            )
            .sort()
        );
      }),
      propertyParameters
    );
  });
});
