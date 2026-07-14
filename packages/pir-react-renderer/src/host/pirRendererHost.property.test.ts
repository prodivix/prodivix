import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolvePirRendererHost } from './pirRendererHost';
import {
  createProjectionPlan,
  createWorkspaceDocument,
} from '../__tests__/pirRendererFixtures';

const propertyParameters = Object.freeze({
  numRuns: 30,
  seed: 0x16_07_2026,
});

describe('PIRRenderer host resolution properties', () => {
  it('reports unresolved Elements deterministically across map insertion order', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.boolean(),
        (firstType, secondType, reverse) => {
          const entries = [
            [
              'first',
              { id: 'first', kind: 'element' as const, type: firstType },
            ],
            [
              'second',
              { id: 'second', kind: 'element' as const, type: secondType },
            ],
          ] as const;
          const page = createWorkspaceDocument({
            id: 'page',
            type: 'pir-page',
            rootId: 'first',
            nodesById: Object.fromEntries(
              reverse ? [...entries].reverse() : entries
            ),
            childIdsById: { first: ['second'] },
          });
          const canonicalPage = createWorkspaceDocument({
            id: 'page',
            type: 'pir-page',
            rootId: 'first',
            nodesById: Object.fromEntries(entries),
            childIdsById: { first: ['second'] },
          });
          const host = { resolveElement: () => undefined };

          expect(
            resolvePirRendererHost(createProjectionPlan('page', [page]), host)
          ).toEqual(
            resolvePirRendererHost(
              createProjectionPlan('page', [canonicalPage]),
              host
            )
          );
        }
      ),
      propertyParameters
    );
  });
});
