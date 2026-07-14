import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodePirDocument } from '../codec/pirCodec';
import type { PIRDocument, PIRNode } from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  PIR_SUBTREE_EXTRACTION_ISSUE_CODES,
  analyzePirSubtreeExtraction,
} from './pirSubtreeExtraction';

const propertyParameters = Object.freeze({
  numRuns: 24,
  seed: 0x14_07_2026,
});

const DERIVED_EVENT_ID = 'extracted-event:4:save';
const DERIVED_PROP_ID = 'extracted-prop:component-prop:5:title';

const orderedRecord = <T>(
  entries: readonly (readonly [string, T])[],
  reverse: boolean
): Readonly<Record<string, T>> =>
  Object.fromEntries(reverse ? [...entries].reverse() : entries);

const createEventSourceDocument = (
  reverse: boolean,
  explicitPayload: boolean
): PIRDocument => {
  const nodes: readonly (readonly [string, PIRNode])[] = [
    ['root', { id: 'root', kind: 'element', type: 'main' }],
    [
      'panel',
      {
        id: 'panel',
        kind: 'element',
        type: 'section',
        events: {
          submit: {
            kind: 'emit-component-event',
            memberId: 'save',
            ...(explicitPayload
              ? {
                  payload: {
                    kind: 'component-prop' as const,
                    memberId: 'title',
                    path: 'value',
                  },
                }
              : {}),
          },
        },
      },
    ],
    [
      'label',
      {
        id: 'label',
        kind: 'element',
        type: 'span',
        events: {
          retry: { kind: 'emit-component-event', memberId: 'save' },
        },
      },
    ],
  ];
  const children: readonly (readonly [string, readonly string[]])[] = [
    ['root', ['panel']],
    ['panel', ['label']],
    ['label', []],
  ];
  return {
    componentContract: {
      propsById: {
        title: { id: 'title', name: 'title', typeRef: 'string' },
      },
      eventsById: {
        save: {
          id: 'save',
          name: 'save',
          payloadTypeRef: 'SavePayload',
          capabilityIds: ['save-capability'],
        },
      },
      slotsById: {},
      variantAxesById: {},
    },
    ui: {
      graph: {
        rootId: 'root',
        nodesById: orderedRecord(nodes, reverse),
        childIdsById: orderedRecord(children, reverse),
      },
    },
  };
};

const analyze = (document: PIRDocument) =>
  analyzePirSubtreeExtraction({
    sourceDocumentId: 'component-shell',
    definitionDocumentId: 'component-panel',
    document,
    subtreeRootId: 'panel',
    instanceNodeId: 'panel',
  });

describe('PIR-current Component event extraction properties', () => {
  it('deduplicates and lifts source events while preserving explicit and incoming payload forwarding', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (explicitPayload, reverse) => {
        const result = analyze(
          createEventSourceDocument(reverse, explicitPayload)
        );

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result).toEqual(
          analyze(createEventSourceDocument(!reverse, explicitPayload))
        );
        expect(validatePirDocument(result.definitionDocument).valid).toBe(true);
        expect(validatePirDocument(result.sourceDocument).valid).toBe(true);
        expect(result.definitionDocument.componentContract?.eventsById).toEqual(
          {
            [DERIVED_EVENT_ID]: {
              id: DERIVED_EVENT_ID,
              name: 'save',
              payloadTypeRef: 'SavePayload',
              capabilityIds: ['save-capability'],
            },
          }
        );
        expect(result.instance.bindings.events).toEqual({
          [DERIVED_EVENT_ID]: {
            kind: 'emit-component-event',
            memberId: 'save',
          },
        });

        const panel = result.definitionDocument.ui.graph.nodesById.panel;
        const label = result.definitionDocument.ui.graph.nodesById.label;
        expect(panel?.kind).toBe('element');
        expect(label?.kind).toBe('element');
        if (panel?.kind !== 'element' || label?.kind !== 'element') return;
        expect(panel.events?.submit).toEqual({
          kind: 'emit-component-event',
          memberId: DERIVED_EVENT_ID,
          ...(explicitPayload
            ? {
                payload: {
                  kind: 'component-prop',
                  memberId: DERIVED_PROP_ID,
                  path: 'value',
                },
              }
            : {}),
        });
        expect(label.events?.retry).toEqual({
          kind: 'emit-component-event',
          memberId: DERIVED_EVENT_ID,
        });
        expect(result.instance.bindings.props).toEqual(
          explicitPayload
            ? {
                [DERIVED_PROP_ID]: {
                  kind: 'component-prop',
                  memberId: 'title',
                },
              }
            : {}
        );

        const liftedEvents = result.boundaryDependencies.filter(
          (dependency) => dependency.kind === 'event-binding'
        );
        expect(liftedEvents).toHaveLength(1);
        expect(liftedEvents[0]).toEqual(
          expect.objectContaining({
            resolution: 'lifted-to-component-event',
            sourceEventId: 'save',
            occurrences: [
              { nodeId: 'label', fieldPath: '/events/retry' },
              { nodeId: 'panel', fieldPath: '/events/submit' },
            ],
          })
        );
      }),
      propertyParameters
    );
  });

  it('explicitly blocks event lifting when the source Contract is missing', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (removeContract, reverse) => {
        const source = createEventSourceDocument(reverse, false);
        const { componentContract, ...documentWithoutContract } = source;
        const document: PIRDocument = removeContract
          ? documentWithoutContract
          : {
              ...source,
              componentContract: {
                ...componentContract!,
                eventsById: {},
              },
            };
        const result = analyze(document);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.status).toBe('blocked');
        expect(result.issues).not.toHaveLength(0);
        expect(result.boundaryDependencies).toHaveLength(2);
        expect(
          result.boundaryDependencies.every(
            (dependency) =>
              dependency.kind === 'unsupported-boundary' &&
              dependency.boundaryKind === 'unresolved-component-event' &&
              dependency.targetId === 'save'
          )
        ).toBe(true);
        expect(
          result.issues.every(
            ({ code }) =>
              code === PIR_SUBTREE_EXTRACTION_ISSUE_CODES.unresolvedBoundary
          )
        ).toBe(true);
        expect(result.issues.map(({ path }) => path)).toEqual(
          [...result.issues.map(({ path }) => path)].sort()
        );
        expect(encodePirDocument(source)).toBe(
          encodePirDocument(createEventSourceDocument(reverse, false))
        );
      }),
      propertyParameters
    );
  });
});
