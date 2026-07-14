import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PIRDocument, PIRNode } from '../pir.types';
import { validatePirDocument } from '../pirValidator';
import {
  deletePirGraphSubtree,
  duplicatePirGraphSubtree,
  movePirGraphSubtree,
} from './pirGraphAuthoringMutations';

const createDocument = (): PIRDocument => {
  const nodesById: Record<string, PIRNode> = {
    root: { id: 'root', kind: 'element', type: 'main' },
    alpha: { id: 'alpha', kind: 'element', type: 'section' },
    beta: { id: 'beta', kind: 'element', type: 'section' },
    gamma: { id: 'gamma', kind: 'element', type: 'section' },
  };
  return {
    ui: {
      graph: {
        rootId: 'root',
        nodesById,
        childIdsById: {
          root: ['alpha', 'beta', 'gamma'],
          alpha: [],
          beta: [],
          gamma: [],
        },
        order: { strategy: 'childIdsById' },
      },
    },
  };
};

describe('PIR graph authoring mutation properties', () => {
  it('preserves normalized tree invariants through move, duplicate, and delete', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('alpha', 'beta', 'gamma'),
        fc.integer({ min: 0, max: 3 }),
        (nodeId, index) => {
          const source = createDocument();
          const moved = movePirGraphSubtree({
            document: source,
            nodeId,
            target: { parentId: 'root', index },
          });
          expect(moved.ok).toBe(true);
          if (!moved.ok) return;
          expect(validatePirDocument(moved.document).valid).toBe(true);

          const duplicated = duplicatePirGraphSubtree({
            document: moved.document,
            nodeId,
            target: {
              parentId: 'root',
              index: moved.document.ui.graph.childIdsById.root!.length,
            },
            createId: (kind, sourceId) =>
              kind === 'node' ? `copy-${sourceId}` : `copy-symbol-${sourceId}`,
          });
          expect(duplicated.ok).toBe(true);
          if (!duplicated.ok) return;
          expect(validatePirDocument(duplicated.document).valid).toBe(true);
          expect(
            duplicated.document.ui.graph.nodesById[`copy-${nodeId}`]
          ).toBeDefined();

          const deleted = deletePirGraphSubtree({
            document: duplicated.document,
            nodeId,
          });
          expect(deleted.ok).toBe(true);
          if (!deleted.ok) return;
          expect(validatePirDocument(deleted.document).valid).toBe(true);
          expect(deleted.document.ui.graph.nodesById[nodeId]).toBeUndefined();
          expect(source.ui.graph.nodesById[nodeId]).toBeDefined();
        }
      ),
      { numRuns: 24, seed: 0x14072026 }
    );
  });
});
