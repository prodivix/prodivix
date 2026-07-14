import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CURRENT_PIR_WIRE_VERSION } from './pirMigrationRegistry';
import {
  createEmptyPirDocument,
  decodePirDocument,
  encodePirDocument,
  normalizePirDocument,
  tryNormalizePirDocument,
  validatePirDocument,
  type PIRComponentContract,
  type PIRDocument,
  type PIRNode,
} from '..';

const NODE_IDS = ['root', 'instance', 'slot-outlet', 'collection'] as const;
const PROP_IDS = ['prop-title', 'prop-count'] as const;

const orderRecord = <T>(
  source: Readonly<Record<string, T>>,
  keys: readonly string[]
): Record<string, T> =>
  Object.fromEntries(keys.map((key) => [key, source[key]!])) as Record<
    string,
    T
  >;

const createContract = (
  propOrder: readonly string[] = PROP_IDS
): PIRComponentContract => ({
  propsById: orderRecord(
    {
      'prop-title': {
        id: 'prop-title',
        name: 'title',
        typeRef: 'string',
        required: true,
      },
      'prop-count': {
        id: 'prop-count',
        name: 'count',
        typeRef: 'number',
        defaultValue: 0,
      },
    },
    propOrder
  ),
  eventsById: {
    'event-submit': {
      id: 'event-submit',
      name: 'submit',
      payloadTypeRef: 'form-submit',
    },
  },
  slotsById: {
    'slot-content': {
      id: 'slot-content',
      name: 'content',
      minChildren: 0,
      propsById: {
        'slot-prop-density': {
          id: 'slot-prop-density',
          name: 'density',
          typeRef: 'number',
        },
      },
    },
  },
  variantAxesById: {
    'variant-tone': {
      id: 'variant-tone',
      name: 'tone',
      defaultOptionId: 'option-primary',
      optionsById: {
        'option-primary': { id: 'option-primary', name: 'primary' },
      },
    },
  },
  partsById: {
    root: { id: 'root', name: 'root', targetNodeId: 'root' },
  },
});

const createValidDocument = (
  nodeOrder: readonly string[] = NODE_IDS,
  propOrder: readonly string[] = PROP_IDS
): PIRDocument => {
  const empty = createEmptyPirDocument({
    rootId: 'root',
    rootType: 'section',
  });
  const nodesById: Readonly<Record<string, PIRNode>> = {
    root: {
      id: 'root',
      kind: 'element',
      type: 'section',
      text: { kind: 'component-variant', memberId: 'variant-tone' },
      props: { label: { kind: 'literal', value: 'Dashboard' } },
      events: {
        submit: {
          kind: 'emit-component-event',
          memberId: 'event-submit',
          payload: { kind: 'component-prop', memberId: 'prop-title' },
        },
      },
    },
    instance: {
      id: 'instance',
      kind: 'component-instance',
      componentDocumentId: 'component-card',
      bindings: {
        props: {
          'prop-title': { kind: 'literal', value: 'Nested card' },
        },
        events: {},
        variants: { 'variant-tone': 'option-primary' },
      },
    },
    'slot-outlet': {
      id: 'slot-outlet',
      kind: 'component-slot-outlet',
      slotMemberId: 'slot-content',
      bindings: {
        props: {
          'slot-prop-density': {
            kind: 'component-prop',
            memberId: 'prop-count',
          },
        },
      },
    },
    collection: {
      id: 'collection',
      kind: 'collection',
      source: { kind: 'literal', value: [{ id: 1 }, { id: 2 }] },
      key: { kind: 'index' },
      symbols: {
        itemId: 'collection-item',
        itemName: 'item',
        indexId: 'collection-index',
        indexName: 'index',
        errorId: 'collection-error',
      },
    },
  };
  const childIdsById: Readonly<Record<string, readonly string[]>> = {
    root: ['instance', 'slot-outlet', 'collection'],
    instance: [],
    'slot-outlet': [],
    collection: [],
  };

  return {
    ...empty,
    componentContract: createContract(propOrder),
    ui: {
      graph: {
        ...empty.ui.graph,
        nodesById: orderRecord(nodesById, nodeOrder),
        childIdsById: orderRecord(childIdsById, [...nodeOrder].reverse()),
        regionsById: {
          collection: { item: [], empty: [], loading: [], error: [] },
          instance: { 'slot-content': [] },
        },
      },
    },
  };
};

type MutablePIRWire = {
  ui: {
    graph: {
      nodesById: Record<string, Record<string, unknown>>;
      childIdsById: Record<string, string[]>;
      regionsById?: Record<string, Record<string, string[]>>;
    };
  };
};

const createMutableWire = (): MutablePIRWire =>
  JSON.parse(encodePirDocument(createValidDocument())) as MutablePIRWire;

describe('PIR wire codec properties', () => {
  it('round-trips deterministically across map insertion orders', () => {
    const canonical = encodePirDocument(createValidDocument());

    fc.assert(
      fc.property(
        fc.shuffledSubarray([...NODE_IDS], {
          minLength: NODE_IDS.length,
          maxLength: NODE_IDS.length,
        }),
        fc.shuffledSubarray([...PROP_IDS], {
          minLength: PROP_IDS.length,
          maxLength: PROP_IDS.length,
        }),
        (nodeOrder, propOrder) => {
          const document = createValidDocument(nodeOrder, propOrder);
          expect(JSON.parse(encodePirDocument(document)).version).toBe(
            CURRENT_PIR_WIRE_VERSION
          );
          expect(validatePirDocument(document)).toMatchObject({
            valid: true,
          });

          const normalized = normalizePirDocument(document);
          const encoded = encodePirDocument(document);
          expect(encoded).toBe(canonical);

          const decoded = decodePirDocument(JSON.parse(encoded));
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          expect(decoded.value).not.toHaveProperty('version');
          expect(decoded.value.ui.graph).not.toHaveProperty('version');
          expect(decoded.value.componentContract).not.toHaveProperty('version');
          expect(decoded.value).toEqual(normalized);
          expect(encodePirDocument(decoded.value)).toBe(encoded);
        }
      ),
      { numRuns: 40 }
    );
  });

  it('strictly rejects invalid discriminants, raw code, and legacy list fields', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          'invalid-discriminant',
          'raw-code',
          'legacy-list',
          'missing-outlet-bindings'
        ),
        (invalidCase) => {
          const wire = createMutableWire();
          if (invalidCase === 'invalid-discriminant') {
            wire.ui.graph.nodesById.root!.kind = 'widget';
          } else if (invalidCase === 'raw-code') {
            wire.ui.graph.nodesById.root!.events = {
              click: 'return window.alert("raw code")',
            };
          } else if (invalidCase === 'legacy-list') {
            wire.ui.graph.nodesById.collection!.list = {
              source: { $data: 'items' },
            };
          } else {
            delete wire.ui.graph.nodesById['slot-outlet']!.bindings;
          }

          expect(decodePirDocument(wire)).toMatchObject({ ok: false });
        }
      ),
      { numRuns: 12 }
    );
  });

  it('keeps wire schema versions out of the PIR domain model', () => {
    const wire = JSON.parse(encodePirDocument(createValidDocument()));
    expect(tryNormalizePirDocument(wire as PIRDocument)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: 'PIR_DOMAIN_WIRE_VERSION_FIELD' }),
      ]),
    });
  });

  it('keeps structural children and named regions on their declared owners', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('instance-children', 'element-region'),
        (invalidCase) => {
          const wire = createMutableWire();
          if (invalidCase === 'instance-children') {
            wire.ui.graph.childIdsById.instance = ['slot-outlet'];
          } else {
            wire.ui.graph.regionsById = {
              ...wire.ui.graph.regionsById,
              root: { custom: [] },
            };
          }

          const decoded = decodePirDocument(wire);
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) return;
          const validation = validatePirDocument(decoded.value);
          expect(validation.valid).toBe(false);
          expect(validation.issues).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                code:
                  invalidCase === 'instance-children'
                    ? 'PIR_COMPONENT_INSTANCE_CHILDREN'
                    : 'PIR_GRAPH_REGION_OWNER',
              }),
            ])
          );
        }
      ),
      { numRuns: 8 }
    );
  });
});
