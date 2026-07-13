import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildRoutePath, normalizeRoutePath } from './index';

describe('route core properties', () => {
  it('normalizes and incrementally builds the same canonical path', () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/), {
          minLength: 1,
          maxLength: 8,
        }),
        (segments) => {
          const expected = `/${segments.join('/')}`;
          const authored = ` ${segments.join(' / ')} /?tab=preview#heading`;
          expect(normalizeRoutePath(authored)).toBe(expected);
          expect(normalizeRoutePath(expected)).toBe(expected);

          const built = segments.reduce(
            (parentPath, segment, index) =>
              buildRoutePath(parentPath, {
                id: `route-${index}`,
                segment,
              }),
            '/'
          );
          expect(built).toBe(expected);
        }
      )
    );
  });
});
