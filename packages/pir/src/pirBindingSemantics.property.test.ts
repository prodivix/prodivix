import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  PIRComponentContract,
  PIRDocument,
  PIRNode,
  PIRTriggerBinding,
  PIRValueBinding,
} from './pir.types';
import { PIR_VALIDATION_CODES, validatePirDocument } from './pirValidator';

const propertyParameters = Object.freeze({
  numRuns: 24,
  seed: 0x14_07_2026,
});

type MutableTestGraph = {
  nodesById: Record<string, PIRNode>;
  childIdsById: Record<string, readonly string[]>;
  regionsById: Record<string, Record<string, readonly string[]>>;
};

type MutableElementFields = {
  text?: PIRValueBinding;
  events?: Record<string, PIRTriggerBinding>;
};

type MutableSlotOutletFields = {
  bindings: { props: Record<string, PIRValueBinding> };
};

const targetContract: PIRComponentContract = {
  propsById: {},
  eventsById: {},
  slotsById: {
    'slot-content': {
      id: 'slot-content',
      name: 'content',
      propsById: {
        density: { id: 'density', name: 'density', typeRef: 'number' },
      },
    },
  },
  variantAxesById: {},
};

const createDocument = (reverse: boolean): PIRDocument => {
  const nodes: readonly (readonly [string, PIRNode])[] = [
    [
      'root',
      {
        id: 'root',
        kind: 'element',
        type: 'main',
        text: { kind: 'component-variant', memberId: 'tone' },
        events: {
          forward: {
            kind: 'emit-component-event',
            memberId: 'forward',
            payload: { kind: 'component-prop', memberId: 'title' },
          },
        },
      },
    ],
    [
      'instance',
      {
        id: 'instance',
        kind: 'component-instance',
        componentDocumentId: 'component-card',
        bindings: { props: {}, events: {}, variants: {} },
      },
    ],
    [
      'projected',
      {
        id: 'projected',
        kind: 'element',
        type: 'span',
        text: { kind: 'slot-prop', memberId: 'density', path: 'value' },
      },
    ],
    [
      'outlet',
      {
        id: 'outlet',
        kind: 'component-slot-outlet',
        slotMemberId: 'outer-slot',
        bindings: {
          props: {
            'outer-density': { kind: 'component-prop', memberId: 'title' },
          },
        },
      },
    ],
  ];
  return {
    componentContract: {
      propsById: {
        title: { id: 'title', name: 'title', typeRef: 'string' },
      },
      eventsById: {
        forward: { id: 'forward', name: 'forward', payloadTypeRef: 'string' },
      },
      slotsById: {
        'outer-slot': {
          id: 'outer-slot',
          name: 'outer slot',
          propsById: {
            'outer-density': {
              id: 'outer-density',
              name: 'density',
              typeRef: 'number',
            },
          },
        },
      },
      variantAxesById: {
        tone: {
          id: 'tone',
          name: 'tone',
          optionsById: {
            primary: { id: 'primary', name: 'primary' },
          },
        },
      },
    },
    ui: {
      graph: {
        rootId: 'root',
        nodesById: Object.fromEntries(reverse ? [...nodes].reverse() : nodes),
        childIdsById: {
          root: ['instance', 'outlet'],
          instance: [],
          projected: [],
          outlet: [],
        },
        regionsById: {
          instance: { 'slot-content': ['projected'] },
        },
      },
    },
  };
};

const validate = (document: PIRDocument) =>
  validatePirDocument(document, {
    resolveComponentContract: (documentId) =>
      documentId === 'component-card' ? targetContract : undefined,
  });

describe('PIR-current binding semantic properties', () => {
  it('accepts event forwarding, Definition values, outlet props, and lexical slot props deterministically', () => {
    fc.assert(
      fc.property(fc.boolean(), (reverse) => {
        expect(validate(createDocument(reverse))).toEqual({
          valid: true,
          issues: [],
        });
      }),
      propertyParameters
    );
  });

  it('returns stable located issues for invalid Contract and slot scope references', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'event',
          'prop',
          'variant',
          'slot-scope',
          'slot-member',
          'outlet-key'
        ),
        fc.boolean(),
        (violation, reverse) => {
          const document = structuredClone(createDocument(reverse));
          const graph = document.ui.graph as unknown as MutableTestGraph;
          const root = graph.nodesById.root;
          const projected = graph.nodesById.projected;
          const outlet = graph.nodesById.outlet;
          if (violation === 'event' && root?.kind === 'element') {
            (root as unknown as MutableElementFields).events!.forward = {
              kind: 'emit-component-event',
              memberId: 'missing-event',
            };
          } else if (violation === 'prop' && root?.kind === 'element') {
            (root as unknown as MutableElementFields).text = {
              kind: 'component-prop',
              memberId: 'missing-prop',
            };
          } else if (violation === 'variant' && root?.kind === 'element') {
            (root as unknown as MutableElementFields).text = {
              kind: 'component-variant',
              memberId: 'missing-variant',
            };
          } else if (violation === 'slot-scope') {
            graph.regionsById.instance!['slot-content'] = [];
            graph.childIdsById.root = ['instance', 'projected', 'outlet'];
          } else if (
            violation === 'slot-member' &&
            projected?.kind === 'element'
          ) {
            (projected as unknown as MutableElementFields).text = {
              kind: 'slot-prop',
              memberId: 'missing-prop',
            };
          } else if (
            violation === 'outlet-key' &&
            outlet?.kind === 'component-slot-outlet'
          ) {
            (outlet as unknown as MutableSlotOutletFields).bindings.props = {
              missing: { kind: 'component-prop', memberId: 'title' },
            };
          }

          const result = validate(document);
          expect(result.valid).toBe(false);
          const expectedCode =
            violation === 'event'
              ? PIR_VALIDATION_CODES.componentEventEmission
              : violation === 'prop'
                ? PIR_VALIDATION_CODES.componentPropBinding
                : violation === 'variant'
                  ? PIR_VALIDATION_CODES.componentVariantBinding
                  : violation === 'slot-scope'
                    ? PIR_VALIDATION_CODES.slotPropScope
                    : violation === 'slot-member'
                      ? PIR_VALIDATION_CODES.slotPropMember
                      : PIR_VALIDATION_CODES.slotOutletBinding;
          expect(result.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ code: expectedCode }),
            ])
          );
          expect(result).toEqual(validate(structuredClone(document)));
        }
      ),
      propertyParameters
    );
  });
});
