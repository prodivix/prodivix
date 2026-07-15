import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  PIRDocument,
  PIRJsonObject,
  PIRJsonValue,
  PIRValueBinding,
} from '@prodivix/pir';
import {
  parseControlledReactJsxToPirDocument,
  projectPirDocumentToControlledReactJsx,
} from './controlledReactJsx';

const propName = fc
  .stringMatching(/^[a-z][a-z0-9-]{0,8}$/)
  .filter(
    (value) =>
      value !== 'style' &&
      value !== 'children' &&
      value !== 'data-prodivix-node-id' &&
      value !== 'data-prodivix-slot-member-id'
  );

const jsonValue = fc.jsonValue({ maxDepth: 3 }) as fc.Arbitrary<PIRJsonValue>;

const bindings = (
  values: Readonly<Record<string, PIRJsonValue>>
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      { kind: 'literal' as const, value },
    ])
  );

const optionalBindings = (
  values: Readonly<Record<string, PIRJsonValue>>
): Readonly<Record<string, PIRValueBinding>> | undefined =>
  Object.keys(values).length > 0 ? bindings(values) : undefined;

const createDocument = (input: {
  rootType: string;
  childType: string;
  props: PIRJsonObject;
  style: PIRJsonObject;
  text: PIRJsonValue;
}): PIRDocument => ({
  metadata: { name: 'Controlled Property' },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: {
          id: 'root',
          kind: 'element',
          type: input.rootType,
          ...(optionalBindings(input.props)
            ? { props: optionalBindings(input.props) }
            : {}),
          ...(optionalBindings(input.style)
            ? { style: optionalBindings(input.style) }
            : {}),
          text: { kind: 'literal', value: input.text },
        },
        child: {
          id: 'child',
          kind: 'element',
          type: input.childType,
        },
      },
      childIdsById: { root: ['child'], child: [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

describe('controlled React/JSX properties', () => {
  it('round-trips every supported literal tree to one canonical body', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('main', 'section', 'div', 'Panel'),
        fc.constantFrom('span', 'button', 'strong', 'Item'),
        fc.dictionary(propName, jsonValue, { maxKeys: 5 }),
        fc.dictionary(propName, jsonValue, { maxKeys: 5 }),
        jsonValue,
        (rootType, childType, props, style, text) => {
          const document = createDocument({
            rootType,
            childType,
            props,
            style,
            text,
          });
          const projected = projectPirDocumentToControlledReactJsx(document);
          expect(projected.status).toBe('ready');
          if (projected.status !== 'ready') return;

          const parsed = parseControlledReactJsxToPirDocument({
            body: projected.body,
            baseDocument: document,
          });
          expect(parsed.status).toBe('ready');
          if (parsed.status !== 'ready') return;
          expect(parsed.document).toEqual(document);
          expect(parsed.body).toBe(projected.body);
        }
      ),
      { numRuns: 120, seed: 0x15_07_2026 }
    );
  });

  it('round-trips Contract Slot Outlets and their fallback subtree', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
        fc.string({ maxLength: 32 }),
        (slotMemberId, fallbackText) => {
          const document: PIRDocument = {
            componentContract: {
              propsById: {
                label: { id: 'label', name: 'Label', typeRef: 'string' },
              },
              eventsById: {},
              slotsById: {
                [slotMemberId]: {
                  id: slotMemberId,
                  name: 'Content',
                  propsById: {
                    label: {
                      id: 'label',
                      name: 'Label',
                      typeRef: 'string',
                    },
                  },
                },
              },
              variantAxesById: {},
            },
            ui: {
              graph: {
                rootId: 'root',
                nodesById: {
                  root: { id: 'root', kind: 'element', type: 'section' },
                  outlet: {
                    id: 'outlet',
                    kind: 'component-slot-outlet',
                    slotMemberId,
                    bindings: {
                      props: {
                        label: {
                          kind: 'component-prop',
                          memberId: 'label',
                        },
                      },
                    },
                  },
                  fallback: {
                    id: 'fallback',
                    kind: 'element',
                    type: 'p',
                    text: { kind: 'literal', value: fallbackText },
                  },
                },
                childIdsById: {
                  root: ['outlet'],
                  outlet: ['fallback'],
                  fallback: [],
                },
                order: { strategy: 'childIdsById' },
              },
            },
          };
          const projected = projectPirDocumentToControlledReactJsx(document);
          expect(projected.status).toBe('ready');
          if (projected.status !== 'ready') return;

          const parsed = parseControlledReactJsxToPirDocument({
            body: projected.body,
            baseDocument: document,
          });
          expect(parsed.status).toBe('ready');
          if (parsed.status !== 'ready') return;
          expect(parsed.document).toEqual(document);
          expect(parsed.body).toBe(projected.body);
        }
      ),
      { numRuns: 36, seed: 0x15_07_2026 }
    );
  });
});
