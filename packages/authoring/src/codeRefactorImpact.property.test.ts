import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  analyzeCodeLanguageRenameImpact,
  createCodeSlotRegistry,
  createWorkspaceSemanticIndex,
  queryCodeArtifactRefactorImpact,
  type CodeLanguageWorkspaceEditProposal,
  type CodeSlotBindingProjection,
  type CodeSlotContract,
  type CodeSlotProvider,
  type WorkspaceSemanticIndex,
} from '.';

const ARTIFACT_ID = 'code-submit';
const EXPORT_SYMBOL_ID = 'symbol:submit';

const createIndex = (): WorkspaceSemanticIndex => {
  const result = createWorkspaceSemanticIndex({
    workspaceRevisions: {
      workspaceId: 'workspace-refactor',
      workspaceRev: 7,
      routeRev: 3,
      opSeq: 11,
      documentRevs: {
        [ARTIFACT_ID]: { contentRev: 2, metaRev: 1 },
      },
    },
    schemaVersion: 'semantic-v1',
    providers: [
      {
        descriptor: { id: 'code-refactor-fixture', semanticVersion: '1' },
        contribute: () => ({
          scopes: [
            {
              id: 'scope:workspace',
              kind: 'workspace',
              ownerRef: {
                kind: 'workspace',
                workspaceId: 'workspace-refactor',
              },
            },
            {
              id: 'scope:artifact',
              kind: 'code-artifact',
              ownerRef: { kind: 'code-artifact', artifactId: ARTIFACT_ID },
              parentId: 'scope:workspace',
            },
          ],
          symbols: [
            {
              id: EXPORT_SYMBOL_ID,
              stability: 'revision-scoped',
              kind: 'code-function',
              name: 'submit',
              scopeId: 'scope:artifact',
              ownerRef: { kind: 'code-artifact', artifactId: ARTIFACT_ID },
              sourceSpan: {
                artifactId: ARTIFACT_ID,
                startLine: 1,
                startColumn: 17,
                endLine: 1,
                endColumn: 23,
              },
            },
          ],
          references: ['named', 'default'].map((kind) => ({
            id: `reference:${kind}`,
            kind: 'code-reference' as const,
            sourceRef: {
              kind: 'pir-node' as const,
              documentId: `component-${kind}`,
              nodeId: `button-${kind}`,
            },
            scopeId: 'scope:workspace',
            target: { kind: 'symbol-id' as const, symbolId: EXPORT_SYMBOL_ID },
            resolutionMode: 'addressable' as const,
          })),
        }),
      },
    ],
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.index;
};

const createSlotProvider = (reverse: boolean): CodeSlotProvider => {
  const projections: readonly CodeSlotBindingProjection[] = [
    {
      binding: {
        slotId: 'slot:named',
        reference: { artifactId: ARTIFACT_ID, exportName: 'submit' },
      },
      ownerRef: {
        kind: 'pir-node',
        documentId: 'component-named',
        nodeId: 'button-named',
      },
      semanticReferenceId: 'reference:named',
    },
    {
      binding: {
        slotId: 'slot:default',
        reference: { artifactId: ARTIFACT_ID, exportName: 'default' },
      },
      ownerRef: {
        kind: 'pir-node',
        documentId: 'component-default',
        nodeId: 'button-default',
      },
      semanticReferenceId: 'reference:default',
    },
  ];
  const slots: readonly CodeSlotContract[] = projections.map((projection) => ({
    id: projection.binding.slotId,
    ownerRef: projection.ownerRef,
    kind: 'event-handler',
    capabilityIds: [],
    defaultPlacement: ['code-editor'],
  }));
  const orderedProjections = reverse ? [...projections].reverse() : projections;
  return {
    id: 'slot-provider',
    source: { kind: 'workspace' },
    listSlots: () => [...slots],
    getSlot: (id) => slots.find((slot) => slot.id === id) ?? null,
    listBindingProjections: ({ artifactId }) =>
      !artifactId || artifactId === ARTIFACT_ID ? [...orderedProjections] : [],
    getBindingProjection: (id) =>
      projections.find(({ binding }) => binding.slotId === id) ?? null,
  };
};

const createProposal = (
  index: WorkspaceSemanticIndex,
  startColumn = 17
): CodeLanguageWorkspaceEditProposal => ({
  snapshotIdentity: {
    semanticSnapshotIdentity: index.snapshotIdentity,
    artifactRevisions: { [ARTIFACT_ID]: '2' },
  },
  edits: [
    {
      artifactId: ARTIFACT_ID,
      expectedRevision: '2',
      sourceSpan: {
        artifactId: ARTIFACT_ID,
        startLine: 1,
        startColumn,
        endLine: 1,
        endColumn: startColumn + 6,
      },
      newText: 'send',
    },
  ],
});

describe('Code refactor impact properties', () => {
  it('is order-invariant and blocks only the named persisted owner', () => {
    const index = createIndex();
    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        const registry = createCodeSlotRegistry();
        registry.register(createSlotProvider(reverse));

        const artifactImpact = queryCodeArtifactRefactorImpact({
          artifactId: ARTIFACT_ID,
          registry,
          semanticIndex: index,
        });
        expect(
          artifactImpact.bindings.map(
            ({ projection }) => projection.binding.slotId
          )
        ).toEqual(['slot:default', 'slot:named']);
        expect(artifactImpact.referenceIds).toEqual([
          'reference:default',
          'reference:named',
        ]);

        const rename = analyzeCodeLanguageRenameImpact({
          currentName: 'submit',
          proposal: createProposal(index),
          registry,
          semanticIndex: index,
        });
        expect(rename.status).toBe('ready');
        if (rename.status !== 'ready') return;
        expect(
          rename.affectedBindings.map(
            ({ projection }) => projection.binding.slotId
          )
        ).toEqual(['slot:named']);
      }),
      { numRuns: 20, seed: 0x15_07_2026 }
    );
  });

  it('does not report unrelated edits and fails closed on a stale snapshot', () => {
    const index = createIndex();
    const registry = createCodeSlotRegistry();
    registry.register(createSlotProvider(false));
    const unrelated = analyzeCodeLanguageRenameImpact({
      currentName: 'submit',
      proposal: createProposal(index, 30),
      registry,
      semanticIndex: index,
    });
    expect(unrelated).toMatchObject({
      status: 'ready',
      affectedBindings: [],
    });

    const proposal = createProposal(index);
    const stale = analyzeCodeLanguageRenameImpact({
      currentName: 'submit',
      proposal: {
        ...proposal,
        snapshotIdentity: {
          ...proposal.snapshotIdentity,
          semanticSnapshotIdentity: {
            ...proposal.snapshotIdentity.semanticSnapshotIdentity,
            providerSetDigest: 'stale-provider-set',
          },
        },
      },
      registry,
      semanticIndex: index,
    });
    expect(stale).toEqual({ status: 'stale' });
  });
});
