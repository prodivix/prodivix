import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createEmptyPirDocument } from '../pirFactory';
import { validatePirDocument } from '../pirValidator';
import { insertPirGraphFragment } from './pirGraphFragmentMutation';

const propertyParameters = Object.freeze({
  numRuns: 64,
  seed: 0x14_07_2026,
});

describe('PIR-current graph fragment mutation properties', () => {
  it('atomically inserts arbitrary unique roots without mutating the source', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.stringMatching(/^[a-z][a-z0-9-]{0,10}$/), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.nat({ max: 1 }),
        (suffixes, requestedIndex) => {
          const empty = createEmptyPirDocument();
          const source = {
            ...empty,
            ui: {
              graph: {
                ...empty.ui.graph,
                nodesById: {
                  ...empty.ui.graph.nodesById,
                  anchor: {
                    id: 'anchor',
                    kind: 'element' as const,
                    type: 'aside',
                  },
                },
                childIdsById: { root: ['anchor'], anchor: [] },
              },
            },
          };
          const before = JSON.stringify(source);
          const rootNodeIds = suffixes.map((suffix) => `fragment-${suffix}`);
          const fragment = {
            rootNodeIds,
            primaryNodeId: rootNodeIds[0]!,
            nodesById: Object.fromEntries(
              rootNodeIds.map((id) => [
                id,
                { id, kind: 'element' as const, type: 'section' },
              ])
            ),
            childIdsById: Object.fromEntries(rootNodeIds.map((id) => [id, []])),
          };

          const result = insertPirGraphFragment({
            document: source,
            fragment,
            target: { parentId: 'root', index: requestedIndex },
          });

          expect(result.ok).toBe(true);
          expect(JSON.stringify(source)).toBe(before);
          if (result.ok === false) return;
          expect(result.document.ui.graph.childIdsById.root).toEqual(
            requestedIndex === 0
              ? [...rootNodeIds, 'anchor']
              : ['anchor', ...rootNodeIds]
          );
          expect(result.insertedNodeIds).toEqual([...rootNodeIds].sort());
          expect(validatePirDocument(result.document).valid).toBe(true);
        }
      ),
      propertyParameters
    );
  });
});
