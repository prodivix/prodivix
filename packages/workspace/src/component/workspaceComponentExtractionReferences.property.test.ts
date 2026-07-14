import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRComponentContract, PIRDocument } from '@prodivix/pir';
import type { WorkspaceSnapshot } from '../types';
import {
  WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS,
  analyzeWorkspaceComponentExtractionReferences,
  type AnalyzeWorkspaceComponentExtractionReferencesInput,
  type WorkspaceComponentExtractionReferenceProvider,
} from './workspaceComponentExtractionReferences';

const propertyParameters = Object.freeze({
  numRuns: 50,
  seed: 0x14_07_2026,
});

const identifier = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);

const emptyContract = (): PIRComponentContract => ({
  propsById: {},
  eventsById: {},
  slotsById: {},
  variantAxesById: {},
});

const createWorkspace = (
  document: PIRDocument,
  type: 'pir-page' | 'pir-component' = 'pir-page'
): WorkspaceSnapshot => ({
  id: 'workspace-reference-analysis',
  workspaceRev: 7,
  routeRev: 3,
  opSeq: 11,
  treeRootId: 'root-dir',
  treeById: {
    'root-dir': {
      id: 'root-dir',
      kind: 'dir',
      name: '/',
      parentId: null,
      children: [],
    },
  },
  docsById: {
    source: {
      id: 'source',
      type,
      path: '/source.pir.json',
      contentRev: 2,
      metaRev: 1,
      content: document,
    },
  },
  routeManifest: { version: '1', root: { id: 'route-root' } },
});

const createReadyDocument = (token: string) => {
  const ids = {
    collection: `collection-${token}`,
    item: `item-${token}`,
    itemSymbol: `item-symbol-${token}`,
    indexSymbol: `index-symbol-${token}`,
    state: `state-${token}`,
    prop: `prop-${token}`,
  };
  const document: PIRDocument = {
    ui: {
      graph: {
        rootId: 'root',
        nodesById: {
          root: { id: 'root', kind: 'element', type: 'main' },
          [ids.collection]: {
            id: ids.collection,
            kind: 'collection',
            source: { kind: 'literal', value: [] },
            key: { kind: 'index' },
            symbols: {
              itemId: ids.itemSymbol,
              itemName: 'item',
              indexId: ids.indexSymbol,
              indexName: 'index',
            },
          },
          [ids.item]: {
            id: ids.item,
            kind: 'element',
            type: 'button',
            props: {
              label: {
                kind: 'collection-symbol',
                symbolId: ids.itemSymbol,
                path: 'label',
              },
              selected: {
                kind: 'state',
                stateId: ids.state,
                path: 'value',
              },
            },
            events: {
              navigate: { kind: 'navigate-route', routeId: 'route-home' },
              execute: {
                kind: 'call-code',
                slotId: 'slot-handler',
                reference: { artifactId: 'code-handler', symbolId: 'run' },
              },
            },
          },
        },
        childIdsById: {
          root: [ids.collection],
          [ids.collection]: [],
          [ids.item]: [],
        },
        regionsById: {
          [ids.collection]: { item: [ids.item] },
        },
      },
    },
    logic: {
      state: {
        [ids.state]: { typeRef: 'boolean', initial: false },
      },
    },
  };
  return { document, ids };
};

describe('Workspace Component extraction references', () => {
  it('classifies and rewrites typed PIR boundaries deterministically', () => {
    fc.assert(
      fc.property(identifier, (token) => {
        const { document, ids } = createReadyDocument(token);
        const workspace = createWorkspace(document);
        const input: AnalyzeWorkspaceComponentExtractionReferencesInput = {
          workspace,
          sourceDocumentId: 'source',
          targetComponentDocumentId: 'component-extracted',
          replacementInstanceNodeId: `instance-${token}`,
          movedNodeIds: [ids.item, ids.collection],
          nodeRelocations: [
            {
              sourceNodeId: ids.item,
              definitionNodeId: `definition-item-${token}`,
            },
            {
              sourceNodeId: ids.collection,
              definitionNodeId: `definition-collection-${token}`,
            },
          ],
          publicMemberMappings: [
            {
              source: { kind: 'state', id: ids.state },
              target: { kind: 'prop', memberId: ids.prop },
            },
          ],
          transactionId: `transaction-${token}`,
          issuedAt: '2026-07-14T00:00:00.000Z',
        };
        const forward = analyzeWorkspaceComponentExtractionReferences(input);
        const reversed = analyzeWorkspaceComponentExtractionReferences({
          ...input,
          movedNodeIds: [...input.movedNodeIds].reverse(),
          nodeRelocations: [...(input.nodeRelocations ?? [])].reverse(),
          publicMemberMappings: [
            ...(input.publicMemberMappings ?? []),
          ].reverse(),
        });

        expect(reversed).toEqual(forward);
        expect(forward.status).toBe('ready');
        expect(forward.issues).toEqual([]);
        expect(forward.commands).toHaveLength(1);
        expect(
          forward.references.map((reference) => reference.classification)
        ).toEqual(
          expect.arrayContaining([
            WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.internalMovesWithSubtree,
            WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract,
            WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.externalOwnerMoves,
          ])
        );

        const command = forward.commands[0]!;
        expect(command.target.documentId).toBe('component-extracted');
        expect(command.forwardOps).toEqual([
          {
            op: 'replace',
            path: `/ui/graph/nodesById/definition-item-${token}/props/selected`,
            value: {
              kind: 'component-prop',
              memberId: ids.prop,
              path: 'value',
            },
          },
        ]);
        expect(command.reverseOps).toEqual([
          {
            op: 'replace',
            path: `/ui/graph/nodesById/definition-item-${token}/props/selected`,
            value: {
              kind: 'state',
              stateId: ids.state,
              path: 'value',
            },
          },
        ]);

        const alreadyApplied = analyzeWorkspaceComponentExtractionReferences({
          ...input,
          pirBoundaryAlreadyApplied: true,
        });
        expect(alreadyApplied).toMatchObject({
          status: 'ready',
          references: [],
          commands: [],
          issues: [],
        });
      }),
      propertyParameters
    );
  });

  it('keeps incoming Component and Route references blocking after PIR boundary application', () => {
    const contract: PIRComponentContract = {
      ...emptyContract(),
      partsById: {
        focus: { id: 'focus', name: 'Focus', targetNodeId: 'button' },
      },
    };
    const document: PIRDocument = {
      componentContract: contract,
      ui: {
        graph: {
          rootId: 'root',
          nodesById: {
            root: { id: 'root', kind: 'element', type: 'main' },
            button: {
              id: 'button',
              kind: 'element',
              type: 'button',
              events: {
                graph: {
                  kind: 'run-nodegraph',
                  documentId: 'graph-local',
                },
                animation: {
                  kind: 'play-animation',
                  documentId: 'animation-local',
                  timelineId: 'timeline-local',
                  command: 'play',
                },
              },
            },
          },
          childIdsById: { root: ['button'], button: [] },
        },
      },
    };
    const workspace = createWorkspace(document, 'pir-component');
    workspace.routeManifest = {
      version: '1',
      root: {
        id: 'route-root',
        layoutDocId: 'source',
        outletNodeId: 'button',
      },
    };

    const plan = analyzeWorkspaceComponentExtractionReferences({
      workspace,
      sourceDocumentId: 'source',
      targetComponentDocumentId: 'component-extracted',
      replacementInstanceNodeId: 'component-instance',
      movedNodeIds: ['button'],
      publicPartMappings: [{ sourceNodeId: 'button', memberId: 'focus' }],
      pirBoundaryAlreadyApplied: true,
      transactionId: 'transaction-blocking',
      issuedAt: '2026-07-14T00:00:00.000Z',
    });

    expect(plan.status).toBe('blocked');
    expect(plan.commands).toEqual([]);
    expect(plan.references.map((reference) => reference.kind)).toEqual([
      'component-part-target',
      'route-outlet-target',
    ]);
    expect(
      plan.references.every(
        (reference) =>
          reference.classification ===
          WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.unsupportedBlocking
      )
    ).toBe(true);
  });

  it('composes owner providers against explicit relocation and public targets', () => {
    const { document } = createReadyDocument('provider');
    const workspace = createWorkspace(document);
    workspace.docsById.animation = {
      id: 'animation',
      type: 'pir-animation',
      path: '/animation.pir.json',
      contentRev: 1,
      metaRev: 1,
      content: {
        target: { kind: 'pir-node', documentId: 'source', nodeId: 'root' },
      },
    };
    const provider: WorkspaceComponentExtractionReferenceProvider = {
      descriptor: { id: 'test.animation-public-target', version: '1' },
      contribute(context) {
        const relocation = context.nodeRelocations[0]!;
        expect(relocation.replacementInstance.nodeId).toBe('instance-provider');
        return [
          {
            id: 'animation-target',
            kind: 'animation-target',
            owner: {
              domain: 'animation',
              documentId: 'animation',
              path: '/target',
              movesWithSubtree: false,
            },
            target: { kind: 'pir-node', ...relocation.source },
            classification:
              WORKSPACE_COMPONENT_EXTRACTION_REFERENCE_CLASSIFICATIONS.rewritableToPublicContract,
            reason: 'Animation owner supports an instance public-part target.',
            rewrite: {
              publicTarget: {
                kind: 'component-part',
                componentDocumentId: 'component-extracted',
                memberId: 'root-part',
              },
              documentId: 'animation',
              domainHint: 'animation',
              forwardOps: [
                {
                  op: 'replace',
                  path: '/target',
                  value: {
                    kind: 'component-part',
                    instanceNodeId: context.replacementInstanceNodeId,
                    memberId: 'root-part',
                  },
                },
              ],
              reverseOps: [
                {
                  op: 'replace',
                  path: '/target',
                  value: { kind: 'pir-node', ...relocation.source },
                },
              ],
            },
          },
        ];
      },
    };

    const plan = analyzeWorkspaceComponentExtractionReferences({
      workspace,
      sourceDocumentId: 'source',
      targetComponentDocumentId: 'component-extracted',
      replacementInstanceNodeId: 'instance-provider',
      movedNodeIds: ['root'],
      publicPartMappings: [{ sourceNodeId: 'root', memberId: 'root-part' }],
      pirBoundaryAlreadyApplied: true,
      transactionId: 'transaction-provider',
      issuedAt: '2026-07-14T00:00:00.000Z',
      providers: [provider],
    });

    expect(plan.status).toBe('ready');
    expect(plan.commands).toHaveLength(1);
    expect(plan.commands[0]?.target).toEqual({
      workspaceId: workspace.id,
      documentId: 'animation',
    });
    expect(plan.references[0]?.target).toEqual({
      kind: 'pir-node',
      documentId: 'source',
      nodeId: 'root',
    });
  });
});
