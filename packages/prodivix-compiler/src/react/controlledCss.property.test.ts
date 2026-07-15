import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRDocument, PIRJsonValue, PIRValueBinding } from '@prodivix/pir';
import {
  parseControlledCssToPirDocument,
  projectPirDocumentToControlledCss,
} from './controlledCss';

const styleName = fc.oneof(
  fc.stringMatching(/^[a-z][a-zA-Z0-9]{0,12}$/),
  fc.stringMatching(/^--[a-z][a-z0-9-]{0,12}$/)
);
const styleValue = fc.jsonValue({ maxDepth: 3 }) as fc.Arbitrary<PIRJsonValue>;

const toBindings = (
  values: Readonly<Record<string, PIRJsonValue>>
): Readonly<Record<string, PIRValueBinding>> =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { kind: 'literal' as const, value },
    ])
  );

const createDocument = (
  styles: Readonly<Record<string, PIRJsonValue>>
): PIRDocument => ({
  metadata: { name: 'Controlled CSS Property' },
  ui: {
    graph: {
      rootId: 'root',
      nodesById: {
        root: {
          id: 'root',
          kind: 'element',
          type: 'main',
          ...(Object.keys(styles).length > 0
            ? { style: toBindings(styles) }
            : {}),
        },
        child: {
          id: 'child',
          kind: 'element',
          type: 'section',
          style: {
            opacity: { kind: 'state', stateId: 'visibility' },
          },
        },
      },
      childIdsById: { root: ['child'], child: [] },
      order: { strategy: 'childIdsById' },
    },
  },
});

describe('controlled CSS properties', () => {
  it('round-trips literal styles without changing protected bindings', () => {
    fc.assert(
      fc.property(
        fc.dictionary(styleName, styleValue, { maxKeys: 8 }),
        (styles) => {
          const document = createDocument(styles);
          const projected = projectPirDocumentToControlledCss(document);
          expect(projected.status).toBe('ready');
          if (projected.status !== 'ready') return;

          const parsed = parseControlledCssToPirDocument({
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
});
